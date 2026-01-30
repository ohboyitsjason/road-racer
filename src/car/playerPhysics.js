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

    // If player has finished, let AI take over
    if (state.playerFinished) {
        updatePlayerAI(delta);
        updatePlayerCamera();
        return;
    }

    const input = {
        throttle: state.keys['arrowup'] || state.keys['w'] ? 1 : 0,
        brake: state.keys['arrowdown'] || state.keys['s'] ? 1 : 0,
        steerLeft: state.keys['arrowleft'] || state.keys['a'] ? 1 : 0,
        steerRight: state.keys['arrowright'] || state.keys['d'] ? 1 : 0,
        handbrake: state.keys[' '] ? 1 : 0
    };

    const pp = state.playerPhysics;
    const P = PHYSICS;

    // Ensure velocity is a Vector3
    if (!pp.velocity || typeof pp.velocity.x !== 'number') {
        pp.velocity = new THREE.Vector3();
    }

    // Track position for lap counting
    const trackPos = getTrackPosition(pp.position);
    pp.trackPosition = trackPos.trackT;

    // === RAYCAST SURFACE DETECTION ===
    const surface = detectSurface(pp.position, pp.heading);

    // Get surface type for grip modifier (sand, ice, etc.)
    const surfaceType = getSurfaceType(pp.position);
    let gripMultiplier = getGripMultiplier(surfaceType);

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

    // === LOCAL VELOCITY (car frame) ===
    const heading = pp.heading || 0;
    const cosHeading = Math.cos(heading);
    const sinHeading = Math.sin(heading);

    const localVelX = pp.velocity.x * cosHeading - pp.velocity.z * sinHeading;
    const localVelZ = pp.velocity.x * sinHeading + pp.velocity.z * cosHeading;

    // === SLIP ANGLES ===
    const velocityAngle = Math.atan2(localVelX, Math.abs(localVelZ) + 0.3);
    const frontSlipAngle = pp.steerAngle - velocityAngle;
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

    // === LATERAL FORCES (cornering) ===
    const effectiveGrip = P.gripCoefficient * gripMultiplier;
    const handbrakeGrip = P.handbrakeGripMult || 0.15;
    const rearGripMod = input.handbrake ? handbrakeGrip : 1.0;

    const maxFrontLateral = frontLoad * effectiveGrip;
    const maxRearLateral = rearLoad * effectiveGrip * rearGripMod;

    let frontLateralForce = P.corneringStiffness * frontSlipAngle * frontLoad;
    let rearLateralForce = P.corneringStiffness * rearSlipAngle * rearLoad * rearGripMod;

    frontLateralForce = Math.max(-maxFrontLateral, Math.min(maxFrontLateral, frontLateralForce));
    rearLateralForce = Math.max(-maxRearLateral, Math.min(maxRearLateral, rearLateralForce));

    // === LONGITUDINAL FORCES ===
    let tractionForce = 0;
    let brakeForceApplied = 0;
    const REVERSE_THRESHOLD = 0.5; // Speed below which brake becomes reverse
    const REVERSE_POWER = 0.5; // Reverse is 50% of forward power

    if (!pp.isAirborne) {
        if (input.throttle > 0) {
            if (pp.speed >= -REVERSE_THRESHOLD) {
                // Moving forward or stopped - apply forward throttle
                tractionForce = P.engineForce * input.throttle;
            } else {
                // Moving backward - throttle acts as brake
                brakeForceApplied = P.brakeForce * input.throttle;
            }
        }

        if (input.brake > 0 && !input.handbrake) {
            if (pp.speed > REVERSE_THRESHOLD) {
                // Moving forward - apply brakes
                brakeForceApplied = P.brakeForce * input.brake;
            } else {
                // Stopped or nearly stopped - apply reverse throttle
                tractionForce = -P.engineForce * REVERSE_POWER * input.brake;
            }
        }

        // Apply grip limits
        const maxTraction = rearLoad * effectiveGrip;
        tractionForce = Math.max(-maxTraction, Math.min(maxTraction, tractionForce));

        const maxBrake = (frontLoad + rearLoad) * effectiveGrip;
        brakeForceApplied = Math.min(brakeForceApplied, maxBrake);
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

    pp.speed = Math.max(-P.maxSpeed * 0.3, Math.min(P.maxSpeed, pp.speed));
    if (Math.abs(pp.speed) < 0.3 && input.throttle === 0 && input.brake === 0) pp.speed = 0;

    // === ANGULAR ACCELERATION (yaw) ===
    const yawTorque = frontLateralForce * P.cgToFront - rearLateralForce * P.cgToRear;
    const inertia = P.mass * P.wheelbase * P.wheelbase / 12;
    let angularAccel = yawTorque / inertia;

    if (input.handbrake && Math.abs(currentSpeed) > 5) {
        angularAccel += steerInput * 8.0;
    }

    pp.angularVelocity = (pp.angularVelocity || 0) + angularAccel * delta;
    pp.angularVelocity *= 0.90;
    pp.heading = (pp.heading || 0) + pp.angularVelocity * delta;

    // === UPDATE VELOCITY ===
    const forwardDirX = Math.sin(pp.heading);
    const forwardDirZ = Math.cos(pp.heading);
    const lateralDirX = Math.cos(pp.heading);
    const lateralDirZ = -Math.sin(pp.heading);

    const slideRetention = input.handbrake ? 0.96 : 0.92;
    const lateralSlide = localVelX * slideRetention;
    pp.velocity.x = forwardDirX * pp.speed + lateralDirX * lateralSlide;
    pp.velocity.z = forwardDirZ * pp.speed + lateralDirZ * lateralSlide;

    // === DRIFT STATE ===
    const slipMagnitude = Math.abs(rearSlipAngle);
    const isDrifting = (slipMagnitude > P.driftSlipThreshold && Math.abs(pp.speed) > 5) ||
                       (input.handbrake && Math.abs(steerInput) > 0.1 && Math.abs(pp.speed) > 5);

    if (isDrifting) {
        pp.isDrifting = true;
        pp.driftAmount = Math.min(1, Math.max(pp.driftAmount || 0, slipMagnitude / 0.3));
        pp.driftDirection = steerInput > 0 ? 1 : (steerInput < 0 ? -1 : (pp.driftDirection || 0));
    } else {
        pp.isDrifting = false;
        pp.driftAmount = (pp.driftAmount || 0) * (1 - P.driftRecoveryRate * delta);
    }

    // === SURFACE PHYSICS ===
    const newPosition = pp.position.clone().add(pp.velocity.clone().multiplyScalar(delta));

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
    const barrierCollision = checkBarrierCollision(newPosition, pp.velocity, pp.heading, pp.isAirborne);
    if (barrierCollision.collided) {
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

    // Lap detection
    const currentT = pp.trackPosition;
    if (currentT < 0.05 && state.lastCheckpoint > 0.9) {
        state.setLapCount(state.lapCount + 1);
        document.getElementById('lap-num').textContent = state.lapCount;

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
    document.getElementById('race-time').textContent = formatTime((Date.now() - state.raceStartTime) / 1000);

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
