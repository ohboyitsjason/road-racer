import * as THREE from 'three';
import * as state from '../state.js';
import { PHYSICS } from '../constants.js';
import { camera } from '../scene.js';
import { formatTime, getOrdinal } from '../ui/leaderboard.js';
import { getPlayerPosition, updatePlayerAI } from '../ai/aiCars.js';
import {
    detectSurface,
    orientToSurface,
    getSurfaceType,
    getGripMultiplier,
    canMaintainSurfaceContact,
    rebuildTrackMeshCache,
    checkBarrierCollision,
    applyBarrierCollision
} from './surfacePhysics.js';
import { checkObstacleCollision, applyObstacleCollision } from '../obstacles/obstaclePhysics.js';
import { emitDriftSmoke } from '../effects/particles.js';

// === ADVANCED PHYSICS HELPERS ===

// Pacejka Magic Formula for tire force (1.2)
function pacejkaForce(slip, load, baseGrip) {
    const { B, C, D, E } = PHYSICS.pacejka;
    // Scale force by load and grip, with a boost factor for game feel
    const boostFactor = 2.5; // Increase lateral force for more responsive turning
    const Dx = D * load * baseGrip * boostFactor;
    const x = slip;
    const Bx = B * x;
    // Magic Formula: y = D * sin(C * arctan(B*x - E*(B*x - arctan(B*x))))
    return Dx * Math.sin(C * Math.atan(Bx - E * (Bx - Math.atan(Bx))));
}

// Load-sensitive grip calculation (1.1)
function calculateLoadSensitiveGrip(load) {
    // Grip coefficient decreases slightly with higher load (Pacejka-inspired)
    // At normal load, grip is close to 1.0. At max load, grip drops to ~0.85
    const loadFactor = 1 - PHYSICS.tireLoadSensitivity * Math.max(0, load - 1000);
    return Math.max(0.7, Math.min(1.0, loadFactor));
}

// Ackermann steering geometry (1.3)
function calculateAckermannAngles(steerAngle) {
    if (Math.abs(steerAngle) < 0.001) {
        return { left: 0, right: 0 };
    }

    const wheelbase = PHYSICS.wheelbase;
    const trackWidth = PHYSICS.trackWidthSteering;
    const ackermannFactor = PHYSICS.ackermannFactor;

    // Turn radius at center
    const turnRadius = wheelbase / Math.tan(Math.abs(steerAngle));

    // Inner wheel turns more, outer wheel turns less
    const innerRadius = turnRadius - trackWidth / 2;
    const outerRadius = turnRadius + trackWidth / 2;

    const innerAngle = Math.atan(wheelbase / Math.max(0.1, innerRadius));
    const outerAngle = Math.atan(wheelbase / outerRadius);

    // Blend between parallel (0) and full Ackermann (1)
    const parallelAngle = Math.abs(steerAngle);
    const innerBlend = parallelAngle + ackermannFactor * (innerAngle - parallelAngle);
    const outerBlend = parallelAngle + ackermannFactor * (outerAngle - parallelAngle);

    const sign = Math.sign(steerAngle);
    return {
        left: sign > 0 ? innerBlend * sign : outerBlend * sign,
        right: sign > 0 ? outerBlend * sign : innerBlend * sign
    };
}

// ABS simulation (1.5)
function updateABS(pp, delta, brakeForce, speed, frontLoad, rearLoad, grip) {
    if (!PHYSICS.absEnabled || Math.abs(speed) < PHYSICS.absMinSpeed) {
        pp.absActive = false;
        return brakeForce;
    }

    // Calculate wheel slip ratios (simplified)
    const frontSlipRatio = brakeForce * PHYSICS.brakeBias / (frontLoad * grip + 0.1);
    const rearSlipRatio = brakeForce * (1 - PHYSICS.brakeBias) / (rearLoad * grip + 0.1);

    const maxSlip = Math.max(frontSlipRatio, rearSlipRatio);

    if (maxSlip > PHYSICS.absSlipThreshold) {
        pp.absActive = true;
        pp.absCyclePhase = (pp.absCyclePhase || 0) + delta * PHYSICS.absCycleRate * Math.PI * 2;

        // Modulate brake force with sine wave
        const modulation = 0.5 + 0.5 * Math.sin(pp.absCyclePhase);
        return brakeForce * (0.6 + 0.4 * modulation);  // 60-100% brake force
    } else {
        pp.absActive = false;
        pp.absCyclePhase = 0;
    }

    return brakeForce;
}

function showFinishScreen(position, totalTime) {
    const finishScreen = document.getElementById('finish-screen');
    const celebration = document.getElementById('finish-celebration');

    finishScreen.style.display = 'flex';

    // Hide race UI
    document.getElementById('race-info').style.display = 'none';
    document.getElementById('speedometer').style.display = 'none';
    document.getElementById('instructions').style.display = 'none';

    // Get final standings
    const standings = getStandings(totalTime);

    // Top 3 get celebration
    if (position <= 3) {
        const trophies = ['🏆', '🥈', '🥉'];
        const colors = ['gold', 'silver', 'bronze'];
        const messages = ['WINNER!', '2ND PLACE!', '3RD PLACE!'];
        const congrats = ['Incredible driving!', 'Great race!', 'Well done!'];

        document.getElementById('trophy-icon').textContent = trophies[position - 1];
        document.getElementById('position-text').textContent = messages[position - 1];
        document.getElementById('position-text').className = 'position-text ' + colors[position - 1];
        document.getElementById('congrats-text').textContent = congrats[position - 1];

        // Show celebration with animation
        setTimeout(() => celebration.classList.add('show'), 100);

        // Slide up and show summary after delay
        setTimeout(() => {
            celebration.classList.add('slide-up');
            setTimeout(() => {
                celebration.style.display = 'none';
                showSummary(position, totalTime, standings);
            }, 800);
        }, 2500);
    } else {
        // No celebration, show summary directly
        celebration.style.display = 'none';
        showSummary(position, totalTime, standings);
    }
}

function showSummary(position, totalTime, standings) {
    const summary = document.getElementById('finish-summary');

    document.getElementById('summary-position').textContent = getOrdinal(position);
    document.getElementById('summary-time').textContent = formatTime(totalTime);
    document.getElementById('summary-speed').textContent = Math.round(state.topSpeed) + ' MPH';

    // Build standings list
    const standingsList = document.getElementById('standings-list');
    standingsList.innerHTML = '';

    standings.forEach((entry, idx) => {
        const row = document.createElement('div');
        row.className = 'standing-row' + (entry.isPlayer ? ' player-row' : '');
        row.innerHTML = `
            <span class="standing-position">${idx + 1}.</span>
            <span class="standing-name">${entry.name}</span>
            <span class="standing-time">${entry.time}</span>
        `;
        standingsList.appendChild(row);
    });

    summary.classList.add('show');
}

function getStandings(playerTime) {
    const standings = [];

    // Add player
    standings.push({
        name: 'You',
        progress: state.lapCount + state.playerPhysics.trackPosition,
        time: formatTime(playerTime),
        isPlayer: true
    });

    // Add AI cars
    state.aiCars.forEach(ai => {
        standings.push({
            name: ai.name,
            progress: ai.lapCount + ai.trackPosition,
            time: ai.finished ? formatTime(playerTime * (0.9 + Math.random() * 0.3)) : 'DNF',
            isPlayer: false
        });
    });

    // Sort by progress (descending)
    standings.sort((a, b) => b.progress - a.progress);

    return standings;
}

// Get track position for lap counting (doesn't handle collision - just finds position on track)
export function getTrackPosition(position) {
    if (!state.roadCurve) return { trackT: 0, lateralOffset: 0 };

    let closestT = 0;
    let closestDist = Infinity;
    const samples = 200;

    for (let i = 0; i < samples; i++) {
        const t = i / samples;
        const point = state.roadCurve.getPoint(t);
        const dist = new THREE.Vector2(position.x - point.x, position.z - point.z).length();
        if (dist < closestDist) {
            closestDist = dist;
            closestT = t;
        }
    }

    const trackPoint = state.roadCurve.getPoint(closestT);
    const tangent = state.roadCurve.getTangent(closestT);
    const normal = new THREE.Vector3(-tangent.z, 0, tangent.x).normalize();

    const toPosition = new THREE.Vector3().subVectors(position, trackPoint);
    const lateralOffset = toPosition.dot(normal);

    return { trackT: closestT, lateralOffset: lateralOffset };
}

// Initialize track mesh cache when race starts
export function initPhysics() {
    rebuildTrackMeshCache();
}

export function updatePlayerPhysics(delta) {
    if (!state.car || !state.roadCurve) return;
    if (state.gameState !== 'racing' && state.gameState !== 'finished') return;
    if (state.isPaused || state.isCountingDown) return; // Don't update physics while paused or counting down

    // If player has finished, let AI take over
    if (state.playerFinished) {
        updatePlayerAI(delta);
        updatePlayerCamera();
        return;
    }

    const pp = state.playerPhysics;
    const P = PHYSICS;

    const input = {
        throttle: state.keys['arrowup'] || state.keys['w'] ? 1 : 0,
        brake: state.keys['arrowdown'] || state.keys['s'] ? 1 : 0,
        steerLeft: state.keys['arrowleft'] || state.keys['a'] ? 1 : 0,
        steerRight: state.keys['arrowright'] || state.keys['d'] ? 1 : 0,
        handbrake: state.keys[' '] ? 1 : 0
    };

    // Handle crash state - respawn after timer
    if (pp.isCrashed) {
        pp.crashTimer -= delta;
        if (pp.crashTimer <= 0) {
            // Respawn at last safe position
            pp.position.copy(pp.lastSafePosition);
            pp.heading = pp.lastSafeHeading;
            pp.velocity.set(0, 0, 0);
            pp.speed = 0;
            pp.angularVelocity = 0;
            pp.spinVelocity = 0;
            pp.isAirborne = false;
            pp.isCrashed = false;
            pp.offTrackTimer = 0;
            state.car.position.copy(pp.position);
            state.car.rotation.set(0, pp.heading, 0);
        } else {
            // Spin the car during crash animation
            state.car.rotation.y += delta * 8;
            state.car.rotation.z = Math.sin(pp.crashTimer * 10) * 0.3;
            return;
        }
    }

    // Ensure velocity is a Vector3
    if (!pp.velocity || typeof pp.velocity.x !== 'number') {
        pp.velocity = new THREE.Vector3();
    }

    // Track position for lap counting
    const trackPos = getTrackPosition(pp.position);
    pp.trackPosition = trackPos.trackT;

    // === RAYCAST SURFACE DETECTION ===
    const surface = detectSurface(pp.position, pp.heading);

    // Get surface type for grip modifier (sand, ice, boost, etc.)
    const surfaceType = getSurfaceType(pp.position);
    let gripMultiplier = getGripMultiplier(surfaceType);
    const onBoostPad = surfaceType === 'boost';

    // Handle collision recovery
    if (pp.collisionRecovery > 0) {
        pp.collisionRecovery -= delta;
        gripMultiplier *= 0.7;
    }

    // Apply and decay spin from collisions
    if (Math.abs(pp.spinVelocity || 0) > 0.01) {
        pp.angularVelocity = (pp.angularVelocity || 0) + pp.spinVelocity * 0.5;
        pp.spinVelocity *= 0.85; // Faster decay to prevent endless spinning
    }
    // Cap spin velocity to prevent uncontrollable spinning
    pp.spinVelocity = Math.max(-2, Math.min(2, pp.spinVelocity || 0));

    // === STEERING ===
    const steerInput = input.steerLeft - input.steerRight;
    const currentSpeed = pp.speed || 0;
    const speedRatio = Math.min(1, Math.abs(currentSpeed) / P.maxSpeed);
    const steerReduction = P.steerSpeedReduction || 0.4;
    const maxSteerAtSpeed = P.maxSteerAngle * (1 - speedRatio * steerReduction);
    const targetSteerAngle = steerInput * maxSteerAtSpeed;

    pp.steerAngle = pp.steerAngle || 0;
    pp.steerAngle += (targetSteerAngle - pp.steerAngle) * Math.min(1, P.steerSpeed * delta);

    // Calculate individual wheel angles using Ackermann geometry (1.3)
    const wheelAngles = calculateAckermannAngles(pp.steerAngle);
    pp.steerAngleLeft = wheelAngles.left;
    pp.steerAngleRight = wheelAngles.right;
    // Use average for slip angle calculation
    const effectiveSteerAngle = (wheelAngles.left + wheelAngles.right) / 2;

    // === LOCAL VELOCITY (car frame) ===
    const heading = pp.heading || 0;
    const cosHeading = Math.cos(heading);
    const sinHeading = Math.sin(heading);

    const localVelX = pp.velocity.x * cosHeading - pp.velocity.z * sinHeading;
    const localVelZ = pp.velocity.x * sinHeading + pp.velocity.z * cosHeading;

    // === SLIP ANGLES ===
    const velocityAngle = Math.atan2(localVelX, Math.abs(localVelZ) + 0.3);
    const frontSlipAngle = effectiveSteerAngle - velocityAngle;
    let rearSlipAngle = -velocityAngle;

    if (input.handbrake && Math.abs(currentSpeed) > 5) {
        rearSlipAngle += steerInput * 0.3;
    }

    // === WEIGHT TRANSFER ===
    const accelG = (pp.lastAccel || 0) / 9.8;
    const weightTransfer = (P.cgHeight / P.wheelbase) * P.mass * accelG * 9.8;

    const staticFrontWeight = (P.cgToRear / P.wheelbase) * P.mass * 9.8;
    const staticRearWeight = (P.cgToFront / P.wheelbase) * P.mass * 9.8;

    const frontLoad = Math.max(100, staticFrontWeight - weightTransfer);
    const rearLoad = Math.max(100, staticRearWeight + weightTransfer);

    // === LATERAL FORCES (cornering) with advanced tire model ===
    const baseGrip = P.gripCoefficient * gripMultiplier;
    const handbrakeGrip = P.handbrakeGripMult || 0.15;
    const rearGripMod = input.handbrake ? handbrakeGrip : 1.0;

    // Calculate load-sensitive grip coefficients (1.1)
    const frontGripCoeff = calculateLoadSensitiveGrip(frontLoad) * baseGrip;
    const rearGripCoeff = calculateLoadSensitiveGrip(rearLoad) * baseGrip * rearGripMod;

    // Use Pacejka Magic Formula for lateral forces (1.2)
    let frontLateralForce = pacejkaForce(frontSlipAngle, frontLoad, frontGripCoeff);
    let rearLateralForce = pacejkaForce(rearSlipAngle, rearLoad, rearGripCoeff);

    // Store effective grip for other calculations
    const effectiveGrip = baseGrip;

    // === LONGITUDINAL FORCES ===
    let tractionForce = 0;
    let brakeForceApplied = 0;
    const REVERSE_THRESHOLD = 0.5; // Speed below which brake becomes reverse
    const REVERSE_POWER = 0.5; // Reverse is 50% of forward power

    if (!pp.isAirborne) {
        // Apply boost pad acceleration (automatic boost when on pad)
        if (onBoostPad) {
            tractionForce = P.boostAcceleration;
            pp.onBoost = true;
        } else {
            pp.onBoost = false;
        }

        if (input.throttle > 0) {
            if (pp.speed >= -REVERSE_THRESHOLD) {
                // Moving forward or stopped - apply forward throttle
                // No acceleration while drifting (handbrake + turning)
                const isDrifting = input.handbrake && Math.abs(steerInput) > 0.2;
                if (!isDrifting) {
                    const engineForce = onBoostPad ? P.engineForce * P.boostMultiplier : P.engineForce;
                    tractionForce = engineForce * input.throttle;
                }
                // During drift, throttle only maintains speed (no acceleration)
            } else {
                // Moving backward - throttle acts as brake
                brakeForceApplied = P.brakeForce * input.throttle;
            }
        }

        if (input.brake > 0 && !input.handbrake) {
            if (pp.speed > REVERSE_THRESHOLD) {
                // Moving forward - apply brakes with bias (1.4)
                const totalBrakeForce = P.brakeForce * input.brake;
                const frontBrakeForce = totalBrakeForce * P.brakeBias;
                const rearBrakeForce = totalBrakeForce * (1 - P.brakeBias);

                // Check grip limits per axle
                const maxFrontBrake = frontLoad * effectiveGrip;
                const maxRearBrake = rearLoad * effectiveGrip;

                pp.frontWheelLocked = frontBrakeForce > maxFrontBrake;
                pp.rearWheelLocked = rearBrakeForce > maxRearBrake * P.rearBrakeLockThreshold;

                // Clamp to grip limits
                brakeForceApplied = Math.min(frontBrakeForce, maxFrontBrake) +
                                   Math.min(rearBrakeForce, maxRearBrake);

                // Apply ABS (1.5)
                brakeForceApplied = updateABS(pp, delta, brakeForceApplied, pp.speed, frontLoad, rearLoad, effectiveGrip);
            } else {
                // Stopped or nearly stopped - apply reverse throttle
                tractionForce = -P.engineForce * REVERSE_POWER * input.brake;
            }
        }

        // Handbrake - strong braking that can initiate drift when turning
        if (input.handbrake && Math.abs(pp.speed) > REVERSE_THRESHOLD) {
            pp.rearWheelLocked = true;
            pp.handbrakeEngaged = true;

            // Strong braking force - handbrake should stop car quickly
            const handbrakeForce = P.brakeForce * 1.5; // 150% of normal brake force
            brakeForceApplied += handbrakeForce;

            // If turning while handbraking at speed, reduce braking to allow drift
            if (Math.abs(steerInput) > 0.3 && Math.abs(pp.speed) > 10) {
                // Reduce brake force when initiating drift turn
                brakeForceApplied *= 0.4;
            }
        } else {
            pp.handbrakeEngaged = false;
        }

        // Apply grip limits
        const maxTraction = rearLoad * effectiveGrip;
        tractionForce = Math.max(-maxTraction, Math.min(maxTraction, tractionForce));
    }

    // Drag and rolling resistance
    const dragForce = -P.dragCoeff * currentSpeed * Math.abs(currentSpeed);
    const rollingResistance = -P.rollingResistance * currentSpeed;

    const brakeDir = currentSpeed > 0.1 ? 1 : (currentSpeed < -0.1 ? -1 : 0);
    const longForce = tractionForce - brakeForceApplied * brakeDir + dragForce + rollingResistance;

    // === ACCELERATION ===
    const longAccel = longForce / P.mass;
    pp.lastAccel = longAccel;
    pp.speed = (pp.speed || 0) + longAccel * delta;

    pp.speed = Math.max(-P.maxSpeed * 0.1, Math.min(P.maxSpeed, pp.speed));
    if (Math.abs(pp.speed) < 0.3 && input.throttle === 0 && input.brake === 0) pp.speed = 0;

    // === STEERING ===
    const speedFactor = Math.min(1, Math.abs(currentSpeed) / 15);
    const lowSpeedBonus = Math.max(0, 1 - Math.abs(currentSpeed) / 10) * 2.0;

    // Base turn rate
    let turnRate = steerInput * (1.5 + lowSpeedBonus) * speedFactor;

    // Handbrake behavior depends on steering input
    if (input.handbrake && Math.abs(currentSpeed) > 3) {
        if (Math.abs(steerInput) > 0.2) {
            // Turning while handbraking - initiate/continue drift with faster rotation
            turnRate = steerInput * 3.5;
        } else {
            // Handbrake without steering - car tries to stay straight while stopping
            turnRate *= 0.3;
        }
    }

    // Apply turn directly to heading
    pp.heading = (pp.heading || 0) + turnRate * delta;
    pp.angularVelocity = turnRate * 0.3;

    // === UPDATE VELOCITY ===
    const forwardDirX = Math.sin(pp.heading);
    const forwardDirZ = Math.cos(pp.heading);
    const lateralDirX = Math.cos(pp.heading);
    const lateralDirZ = -Math.sin(pp.heading);

    // Velocity behavior depends on handbrake and steering
    const speedFactor2 = Math.min(1, Math.abs(currentSpeed) / P.maxSpeed);

    let slideRetention, turnSlideForce;

    if (input.handbrake && Math.abs(currentSpeed) > 3) {
        if (Math.abs(steerInput) > 0.2) {
            // Handbrake + turning = drift slide
            slideRetention = 0.25 + speedFactor2 * 0.25; // High slide retention during drift
            turnSlideForce = Math.abs(steerInput) * speedFactor2 * 4.0; // Strong lateral push
        } else {
            // Handbrake without turning = stopping, minimal slide
            slideRetention = 0.3;
            turnSlideForce = 0;
        }
    } else if (pp.isDrifting) {
        // Continuing a drift after releasing handbrake
        slideRetention = 0.7 + speedFactor2 * 0.08;
        turnSlideForce = Math.abs(steerInput) * speedFactor2 * 2.0;
    } else {
        // Normal driving - car follows heading with minimal slide
        slideRetention = 0.4 + speedFactor2 * 0.05;
        turnSlideForce = Math.abs(steerInput) * speedFactor2 * 0.6;
    }

    const lateralSlide = localVelX * slideRetention + turnSlideForce * -steerInput;

    pp.velocity.x = forwardDirX * pp.speed + lateralDirX * lateralSlide;
    pp.velocity.z = forwardDirZ * pp.speed + lateralDirZ * lateralSlide;

    // === TIRE SLIP AND SMOKE ===
    // Calculate slip angle - difference between velocity direction and car heading
    const velocityMag = Math.sqrt(pp.velocity.x * pp.velocity.x + pp.velocity.z * pp.velocity.z);
    let slipAngle = 0;
    if (velocityMag > 1) {
        const velocityHeading = Math.atan2(pp.velocity.x, pp.velocity.z);
        slipAngle = pp.heading - velocityHeading;
        // Normalize to -PI to PI
        while (slipAngle > Math.PI) slipAngle -= Math.PI * 2;
        while (slipAngle < -Math.PI) slipAngle += Math.PI * 2;
    }
    pp.slipAngle = slipAngle;

    // Calculate tire friction/slip intensity for smoke
    const absSlip = Math.abs(slipAngle);
    const slipSpeedRatio = Math.min(1, Math.abs(pp.speed) / P.maxSpeed);
    const slipIntensity = absSlip * slipSpeedRatio * 3; // Scale up for visibility

    // Emit smoke based on tire slip (friction with road)
    // Smoke when: drifting, hard cornering at speed, or hard braking
    const isHardBraking = pp.handbrakeEngaged && Math.abs(pp.speed) > 8;
    const isSlipping = absSlip > 0.15 && Math.abs(pp.speed) > 8;

    if (!pp.isAirborne && (isSlipping || isHardBraking)) {
        const smokeAmount = Math.min(1, slipIntensity + (isHardBraking ? 0.5 : 0));
        emitDriftSmoke(pp.position, pp.heading, Math.abs(pp.speed), smokeAmount);
    }

    // === DRIFT STATE ===
    // Drift initiates when: handbrake + turning + sufficient speed
    const canInitiateDrift = pp.handbrakeEngaged && Math.abs(steerInput) > 0.2 && Math.abs(pp.speed) > 10;
    // Drift continues if we have significant slip angle
    const inDrift = canInitiateDrift || (pp.isDrifting && absSlip > 0.1 && Math.abs(pp.speed) > 5);

    if (inDrift) {
        pp.isDrifting = true;
        pp.driftTime = (pp.driftTime || 0) + delta;
        pp.driftDirection = steerInput !== 0 ? Math.sign(steerInput) : pp.driftDirection;
        pp.driftAmount = Math.min(1, absSlip * 2); // Based on actual slip
    } else {
        pp.isDrifting = false;
        pp.driftTime = 0;
        pp.driftAmount = (pp.driftAmount || 0) * 0.9;
        if (pp.driftAmount < 0.1) pp.driftDirection = 0;
    }

    // Apply drift boost
    if (pp.driftBoostTimer > 0) {
        pp.driftBoostTimer -= delta;
        const boostMultiplier = 1 + (pp.driftBoost || 0);
        pp.speed = Math.min(P.maxSpeed * 1.2, pp.speed * boostMultiplier);
    }

    // === SURFACE PHYSICS ===

    // Pre-movement collision check to prevent tunneling at high speeds
    let velocityScale = 1.0;
    const speed = pp.velocity.length();
    if (speed > 10) {
        // Check if there's a barrier in the direction we're moving
        const preCheckResult = checkBarrierCollision(pp.position, pp.velocity, pp.heading, pp.isAirborne);
        if (preCheckResult.collided) {
            // Calculate how much we can move before hitting the barrier
            // Limit movement to not go past the barrier
            const moveDistance = speed * delta;
            const safeDistance = Math.max(0.1, preCheckResult.penetration);
            if (moveDistance > safeDistance) {
                velocityScale = safeDistance / moveDistance;
            }
        }
    }

    const newPosition = pp.position.clone().add(pp.velocity.clone().multiplyScalar(delta * velocityScale));

    if (surface.onSurface) {
        // Car is on a detected surface
        const surfaceNormal = surface.surfaceNormal;

        // Check if we can maintain contact (enough speed for steep surfaces)
        const canMaintain = canMaintainSurfaceContact(Math.abs(pp.speed), surfaceNormal, pp.trackCurvature);

        if (canMaintain || !pp.isAirborne) {
            // Stick to surface
            pp.isAirborne = false;

            // Position car on surface with offset for clearance
            const carHeight = 0.5; // Car ground clearance
            newPosition.y = surface.averageHeight + carHeight;

            // Apply gravity component along surface (causes sliding on slopes)
            const gravityAlongSurface = new THREE.Vector3(0, -P.gravity, 0)
                .sub(surfaceNormal.clone().multiplyScalar(-P.gravity * surfaceNormal.y));

            // Only apply if surface is steep enough
            if (surfaceNormal.y < 0.95) {
                pp.velocity.add(gravityAlongSurface.multiplyScalar(delta));
            }

            // Store surface info for car orientation
            pp.surfaceNormal = surfaceNormal.clone();
            pp.onSurface = true;
        } else {
            // Not enough speed - become airborne
            pp.isAirborne = true;
            pp.verticalVelocity = pp.velocity.y || 0;
            pp.airborneTime = 0;
        }
    } else {
        // No surface detected - airborne or falling
        if (!pp.isAirborne) {
            pp.isAirborne = true;
            pp.verticalVelocity = 0;
            pp.airborneTime = 0;
        }
    }

    // === AIRBORNE PHYSICS ===
    if (pp.isAirborne) {
        pp.verticalVelocity = (pp.verticalVelocity || 0) - P.gravity * delta;
        newPosition.y = pp.position.y + pp.verticalVelocity * delta;
        pp.airborneTime = (pp.airborneTime || 0) + delta;

        // Check for landing on track
        const landingSurface = detectSurface(newPosition, pp.heading);
        if (landingSurface.onSurface && newPosition.y <= landingSurface.averageHeight + 0.8) {
            newPosition.y = landingSurface.averageHeight + 0.5;
            pp.isAirborne = false;
            pp.verticalVelocity = 0;

            // Landing impact
            if (pp.airborneTime > 0.3) {
                pp.speed *= 0.9;
            }
            pp.airborneTime = 0;
            pp.surfaceNormal = landingSurface.surfaceNormal.clone();
            pp.onSurface = true;
        } else if (newPosition.y < 0.5) {
            // Ground floor fallback - don't fall through the world
            newPosition.y = 0.5;
            pp.isAirborne = false;
            pp.verticalVelocity = 0;
            pp.airborneTime = 0;
            pp.surfaceNormal = new THREE.Vector3(0, 1, 0);
            pp.onSurface = true;
        } else {
            // Still airborne
            pp.onSurface = false;
        }
    }

    // === BARRIER COLLISION (raycast-based) ===
    // Check multiple times to ensure we're fully pushed out
    let collisionCount = 0;
    const maxCollisionIterations = 5;

    while (collisionCount < maxCollisionIterations) {
        const barrierCollision = checkBarrierCollision(newPosition, pp.velocity, pp.heading, pp.isAirborne);
        if (!barrierCollision.collided) break;

        collisionCount++;
        const collisionResult = applyBarrierCollision(
            newPosition, pp.velocity, pp.speed, pp.heading, barrierCollision
        );
        newPosition.copy(collisionResult.position);
        pp.velocity.copy(collisionResult.velocity);
        pp.speed = collisionResult.speed;

        // Add small spin from side impacts (reduced to prevent excessive spinning)
        const hitAngle = Math.atan2(barrierCollision.normal.x, barrierCollision.normal.z) - pp.heading;
        const sideHitFactor = Math.abs(Math.sin(hitAngle));
        pp.spinVelocity = (pp.spinVelocity || 0) + sideHitFactor * 0.1 * Math.sign(Math.sin(hitAngle));

        // Reduce angular velocity on collision to help recovery
        pp.angularVelocity *= 0.5;

        // Hard crash detection - high speed impact causes crash
        if (barrierCollision.impactSpeed > 25) {
            pp.isCrashed = true;
            pp.crashTimer = 1.5; // 1.5 second crash animation
            pp.speed = 0;
            pp.velocity.set(0, 0, 0);
            break;
        }
    }

    // If still colliding after iterations, stop the car
    if (collisionCount >= maxCollisionIterations) {
        pp.speed *= 0.5;
        pp.velocity.multiplyScalar(0.5);
    }

    // === OBSTACLE COLLISION (crates, etc.) ===
    const obstacleCollision = checkObstacleCollision(newPosition, pp.velocity, pp.heading);
    if (obstacleCollision) {
        const result = applyObstacleCollision(
            newPosition, pp.velocity, pp.speed, pp.heading, obstacleCollision
        );

        // Apply speed reduction
        pp.speed *= result.speedMultiplier;

        // Apply spin from side impacts
        pp.spinVelocity = (pp.spinVelocity || 0) + result.spinAmount;

        // Recalculate velocity from new speed
        const fwd = new THREE.Vector3(Math.sin(pp.heading), 0, Math.cos(pp.heading));
        pp.velocity.copy(fwd.multiplyScalar(pp.speed));
    }

    // === OFF-TRACK DETECTION ===
    // Check if car is too far from track center
    if (state.roadCurve && !pp.isCrashed) {
        const trackPoint = state.roadCurve.getPoint(trackPos.trackT);
        const distFromTrack = new THREE.Vector2(
            newPosition.x - trackPoint.x,
            newPosition.z - trackPoint.z
        ).length();

        const maxOffTrackDist = P.trackWidth * 1.5; // Allow some margin

        if (distFromTrack > maxOffTrackDist) {
            pp.offTrackTimer = (pp.offTrackTimer || 0) + delta;

            // If off track for too long, trigger crash/reset
            if (pp.offTrackTimer > 2.0) {
                pp.isCrashed = true;
                pp.crashTimer = 1.0;
                pp.offTrackTimer = 0;
            }
        } else {
            pp.offTrackTimer = 0;

            // Update last safe position when on track and not airborne
            if (!pp.isAirborne && Math.abs(pp.speed) > 1) {
                pp.lastSafePosition.copy(newPosition);
                pp.lastSafeHeading = pp.heading;
                pp.lastSafeTrackT = trackPos.trackT;
            }
        }
    }

    pp.position.copy(newPosition);

    // === CAR MESH UPDATE ===
    state.car.position.copy(pp.position);

    // Orient car to surface using raycast-detected normal
    if (pp.isAirborne) {
        // When airborne, pitch based on vertical velocity
        state.car.rotation.set(
            -pp.verticalVelocity * 0.02,
            pp.heading,
            0
        );
    } else if (pp.onSurface && pp.surfaceNormal) {
        // Orient to detected surface
        orientToSurface(state.car, pp.heading, pp.surfaceNormal, 0.3);

        // Add drift tilt on top
        if (pp.isDrifting) {
            state.car.rotation.z += pp.driftDirection * pp.driftAmount * 0.1;
        }
    } else {
        // Fallback to flat orientation
        state.car.rotation.set(0, pp.heading, 0);
    }

    // Spin wheels
    if (state.car.wheels) {
        state.car.wheels.forEach(wheel => wheel.rotation.x += pp.speed * delta * 2);
    }

    // === TRACK PROGRESS & UI ===
    const currentSpeedMph = Math.abs(pp.speed * 2.237);
    if (currentSpeedMph > state.topSpeed) {
        state.setTopSpeed(currentSpeedMph);
    }

    // Checkpoint-based lap detection
    const currentT = pp.trackPosition;
    const lastT = state.lastCheckpoint;

    // Calculate the forward delta (how much we moved forward on track)
    // Handle wrap-around at 0/1 boundary
    let forwardDelta = currentT - lastT;
    if (forwardDelta > 0.5) {
        // Jumped backward across start line (e.g., 0.02 -> 0.98)
        forwardDelta -= 1;
    } else if (forwardDelta < -0.5) {
        // Jumped forward across start line (e.g., 0.98 -> 0.02)
        forwardDelta += 1;
    }

    // Only process if we moved a reasonable amount (prevents first-frame issues)
    // Skip if delta is too large (teleport/initialization) or if we moved backward
    const movingForward = forwardDelta > 0 && forwardDelta < 0.1;

    // Checkpoint positions at 25%, 50%, 75% of track
    const checkpoints = [0.25, 0.5, 0.75];

    // Update checkpoints only if moving forward normally
    if (movingForward) {
        for (let i = 0; i < checkpoints.length; i++) {
            const cp = checkpoints[i];
            // Check if we crossed this checkpoint going forward
            // Need to handle the wrap-around case where we cross from high to low
            const crossedNormally = lastT < cp && currentT >= cp && currentT < cp + 0.1;
            if (crossedNormally) {
                state.checkpointsPassed[i] = true;
            }
        }
    }

    // Lap completion: crossed start/finish going forward with all checkpoints passed
    const crossedFinishLine = lastT > 0.9 && currentT < 0.1 && forwardDelta > 0 && forwardDelta < 0.2;
    const allCheckpointsPassed = state.checkpointsPassed.every(cp => cp);

    if (crossedFinishLine && allCheckpointsPassed) {
        state.setLapCount(state.lapCount + 1);
        document.getElementById('lap-num').textContent = state.lapCount;

        // Reset checkpoints for next lap
        state.resetCheckpoints();

        if (state.lapCount >= 3 && !state.playerFinished) {
            const position = getPlayerPosition();
            const totalTime = (Date.now() - state.raceStartTime) / 1000;
            state.setPlayerFinished(true);
            showFinishScreen(position, totalTime);
        }
    }

    state.setLastCheckpoint(currentT);

    // UI
    document.getElementById('speed-value').textContent = Math.round(currentSpeedMph);
    const gearText = pp.speed < 0 ? 'R' : pp.speed < 5 ? '1' : pp.speed < 12 ? '2' : pp.speed < 22 ? '3' : pp.speed < 32 ? '4' : '5';
    const driftIndicator = pp.isDrifting ? ' DRIFT!' : '';
    document.getElementById('gear-indicator').textContent = gearText + driftIndicator;
    document.getElementById('gear-indicator').style.color = pp.isDrifting ? '#ff6600' : '#ff0';
    // Account for paused time in race timer
    const elapsedTime = (Date.now() - state.raceStartTime - state.totalPausedTime) / 1000;
    document.getElementById('race-time').textContent = formatTime(elapsedTime);

    // Camera
    updatePlayerCamera();
}

function updatePlayerCamera() {
    const cameraOffset = new THREE.Vector3(
        -Math.sin(state.playerPhysics.heading) * 15,
        8,
        -Math.cos(state.playerPhysics.heading) * 15
    );
    camera.position.lerp(state.playerPhysics.position.clone().add(cameraOffset), 0.08);
    camera.lookAt(
        state.playerPhysics.position.x,
        state.playerPhysics.position.y + 1,
        state.playerPhysics.position.z
    );
}
