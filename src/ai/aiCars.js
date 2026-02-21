import * as THREE from 'three';
import * as state from '../state.js';
import { AI_CONFIG, PHYSICS, PIECE_DATA } from '../constants.js';
import { createCar, getAICarColors, updateAICarTheme } from '../car/car.js';
import { scene } from '../scene.js';
import { updateLeaderboard } from '../ui/leaderboard.js';
import { detectSurface, orientToSurface, getSurfaceType, getGripMultiplier, canMaintainSurfaceContact, checkBarrierCollision, applyBarrierCollision } from '../car/surfacePhysics.js';
import { checkObstacleCollision, applyObstacleCollision } from '../obstacles/obstaclePhysics.js';
import { PIDController } from './pidController.js';
import { RacingLine, getCurvatureAt } from './pathfinding.js';
import { onThemeChange } from '../theme/themeManager.js';
import { emitDriftSmoke } from '../effects/particles.js';

const CAR_COLLISION_RADIUS = 2.2;
const COLLISION_RESTITUTION = 0.3;
const COLLISION_FRICTION = 0.7;
const SPIN_FACTOR = 0.15;

// Global racing line for all AI cars
let racingLine = null;

export function setupAICars() {
    state.aiCars.forEach(ai => scene.remove(ai.mesh));
    state.aiCars.length = 0;

    // Compute racing line for this track (2.2)
    if (state.roadCurve) {
        racingLine = new RacingLine(state.roadCurve, state.placedPieces, PHYSICS.trackWidth);
        racingLine.compute(200);
    }

    // Find start piece for grid positioning
    const startPiece = state.placedPieces.find(p => p.type === 'start');
    if (!startPiece) return;

    // Grid positions: [row, lane] - player is at [0, -3] (front left)
    // AI cars fill remaining grid spots
    const gridPositions = [
        { row: 0, lane: 3 },   // Front right (2nd place)
        { row: 1, lane: -3 },  // Second row left (3rd place)
        { row: 1, lane: 3 },   // Second row right (4th place)
    ];
    const rowSpacing = 6; // Distance between rows

    const aiColors = getAICarColors();
    for (let i = 0; i < AI_CONFIG.count; i++) {
        const aiCar = createCar(aiColors[i % aiColors.length], false);
        aiCar.userData.colorIndex = i;
        scene.add(aiCar);

        // Calculate grid position behind start line (which is at length - 5)
        const gridPos = gridPositions[i] || { row: Math.floor(i / 2) + 1, lane: (i % 2 === 0 ? -3 : 3) };
        const startPieceLength = PIECE_DATA['start'].length;
        // Start line is at length - 5, position cars 10 units behind that, on the piece
        const forwardOffset = startPieceLength - 15 - (gridPos.row * rowSpacing);
        const lateralOffset = gridPos.lane;

        const gridOffset = new THREE.Vector3(lateralOffset, 0, forwardOffset)
            .applyAxisAngle(new THREE.Vector3(0, 1, 0), startPiece.heading);
        const startPosition = startPiece.position.clone().add(gridOffset);
        startPosition.y = 0.7;

        // Set mesh position immediately so cars appear at grid spots
        aiCar.position.copy(startPosition);
        aiCar.rotation.y = startPiece.heading;

        const heading = startPiece.heading;
        const lanePos = lateralOffset;

        // Calculate initial trackPosition based on how far along the start piece
        // This prevents the AI from trying to "jump" to trackPosition 0
        const curveLength = state.roadCurve ? state.roadCurve.getLength() : 200;
        const initialTrackPosition = forwardOffset / curveLength; // Position on the start piece, behind start line

        // Get personality for this car (3.3)
        const personalityKey = AI_CONFIG.aiPersonalities[i] || 'balanced';
        const personality = AI_CONFIG.personalities[personalityKey];

        state.aiCars.push({
            mesh: aiCar,
            // Physics
            position: startPosition,
            velocity: new THREE.Vector3(),
            speed: 0,
            heading: heading,
            angularVelocity: 0,
            spinVelocity: 0,
            // Track following
            trackPosition: initialTrackPosition, // Start behind the start line
            lastCheckpoint: 0,
            laneOffset: lanePos,
            targetLaneOffset: lanePos,
            currentLaneOffset: lanePos,
            // Drift state
            isDrifting: false,
            driftAmount: 0,
            driftDirection: 0,
            driftTime: 0,
            // Race state
            lapCount: 0, // Start at 0 like player (behind start line)
            finished: false,
            finishTime: 0,
            name: AI_CONFIG.names[i],
            // Collision
            collisionCooldown: 0,
            collisionRecovery: 0,
            // AI decision making
            throttle: 0,
            brake: 0,
            steerInput: 0,
            wantsDrift: false,

            // === ADVANCED AI STATE ===

            // PID steering controller (2.1)
            steeringPID: new PIDController(
                AI_CONFIG.steering.kP,
                AI_CONFIG.steering.kI,
                AI_CONFIG.steering.kD,
                AI_CONFIG.steering.maxIntegral,
                AI_CONFIG.steering.outputLimit
            ),

            // Collision avoidance (3.1)
            nearbyCarsFront: [],
            nearbyCarsBehind: [],
            isBlocked: false,
            overtakeAttempt: false,
            laneChangeProgress: 0,
            laneChangeDirection: 0,

            // Rubber-banding (3.2)
            difficultyMultiplier: 1.0,
            targetDifficulty: AI_CONFIG.difficulty.baseSkill,
            distanceToPlayer: 0,

            // Personality traits (3.3)
            personality: personality,
            personalityKey: personalityKey,
            skillVariation: 1 + (Math.random() - 0.5) * personality.consistencyVariation
        });
    }
}

// Update car awareness of nearby cars (3.1)
function updateCarAwareness(ai, allCars, playerPhysics) {
    ai.nearbyCarsFront = [];
    ai.nearbyCarsBehind = [];
    ai.isBlocked = false;

    const forward = new THREE.Vector3(Math.sin(ai.heading), 0, Math.cos(ai.heading));

    // Check all other cars
    const otherCars = [...allCars.filter(c => c !== ai)];
    if (playerPhysics && playerPhysics.position) {
        otherCars.push({
            position: playerPhysics.position,
            speed: playerPhysics.speed,
            heading: playerPhysics.heading,
            isPlayer: true
        });
    }

    for (const other of otherCars) {
        const toOther = other.position.clone().sub(ai.position);
        toOther.y = 0;
        const distance = toOther.length();

        if (distance > AI_CONFIG.awareness.detectionRange) continue;

        const toOtherNorm = toOther.clone().normalize();
        const dotForward = toOtherNorm.dot(forward);

        // Calculate lateral distance
        const lateralVec = toOther.clone().sub(forward.clone().multiplyScalar(toOther.dot(forward)));
        const lateral = lateralVec.length();

        const carInfo = {
            car: other,
            distance,
            dotForward,
            lateral,
            relativeSpeed: ai.speed - other.speed
        };

        if (dotForward > 0.3) {  // Ahead
            ai.nearbyCarsFront.push(carInfo);

            // Check if blocking
            if (dotForward > AI_CONFIG.awareness.blockingThreshold &&
                lateral < PHYSICS.trackWidth * 0.6 &&
                distance < 15) {
                ai.isBlocked = true;
            }
        } else if (dotForward < -0.3) {  // Behind
            ai.nearbyCarsBehind.push(carInfo);
        }
    }

    // Sort by distance
    ai.nearbyCarsFront.sort((a, b) => a.distance - b.distance);
    ai.nearbyCarsBehind.sort((a, b) => a.distance - b.distance);
}

// Check if a lane is clear for overtaking (3.1)
function isLaneClear(ai, targetOffset) {
    for (const car of ai.nearbyCarsFront) {
        if (car.distance < AI_CONFIG.awareness.safetyMargin * 2) {
            // Simplified lane check
            if (Math.abs(car.lateral - Math.abs(targetOffset)) < 3) {
                return false;
            }
        }
    }
    return true;
}

// Update overtaking logic (3.1)
function updateOvertaking(ai, delta) {
    // Currently executing a lane change?
    if (ai.laneChangeDirection !== 0) {
        ai.laneChangeProgress += delta / AI_CONFIG.awareness.laneChangeDuration;

        if (ai.laneChangeProgress >= 1) {
            ai.laneChangeProgress = 0;
            ai.laneChangeDirection = 0;
            ai.currentLaneOffset = ai.targetLaneOffset;
        } else {
            // Smooth interpolation
            const t = ai.laneChangeProgress;
            const smoothT = t * t * (3 - 2 * t);  // Smoothstep
            ai.currentLaneOffset += (ai.targetLaneOffset - ai.currentLaneOffset) * smoothT * delta * 3;
        }
        return;
    }

    // Check if we should initiate overtake
    const overtakeThreshold = ai.personality.overtakeThreshold;
    if (ai.isBlocked && ai.nearbyCarsFront.length > 0) {
        const blocker = ai.nearbyCarsFront[0];

        // Only attempt if we're faster (personality affects threshold)
        if (blocker.relativeSpeed > overtakeThreshold) {
            // Choose side based on track position
            const passDirection = blocker.lateral > 0 ? -1 : 1;

            // Check if lane is clear
            const targetOffset = passDirection < 0 ?
                AI_CONFIG.laneOffset.left : AI_CONFIG.laneOffset.right;

            if (isLaneClear(ai, targetOffset)) {
                ai.targetLaneOffset = targetOffset;
                ai.laneChangeDirection = passDirection;
                ai.laneChangeProgress = 0;
                ai.overtakeAttempt = true;
            }
        }
    } else if (!ai.isBlocked && ai.overtakeAttempt) {
        // Return to racing line after successful overtake
        ai.targetLaneOffset = AI_CONFIG.laneOffset.normal;
        ai.laneChangeDirection = ai.currentLaneOffset > 0 ? -1 : 1;
        ai.laneChangeProgress = 0;
        ai.overtakeAttempt = false;
    }
}

// Update dynamic difficulty / rubber-banding (3.2)
function updateDynamicDifficulty(ai, delta) {
    if (!AI_CONFIG.difficulty.enabled) {
        ai.difficultyMultiplier = AI_CONFIG.difficulty.baseSkill;
        return;
    }

    // Calculate progress difference
    const playerProgress = state.lapCount + (state.playerPhysics?.trackPosition || 0);
    const aiProgress = ai.lapCount + ai.trackPosition;
    const progressDiff = playerProgress - aiProgress;  // Positive = player ahead

    // Estimate distance in meters
    const curveLength = state.roadCurve ? state.roadCurve.getLength() : 100;
    const distanceDiff = progressDiff * curveLength;
    ai.distanceToPlayer = distanceDiff;

    // Calculate target difficulty
    let targetDiff = AI_CONFIG.difficulty.baseSkill;

    if (distanceDiff > 0) {
        // Player is ahead - boost AI
        const boostFactor = Math.min(1, distanceDiff / AI_CONFIG.difficulty.catchupDistance);
        const boostAmount = (AI_CONFIG.difficulty.maxBoost - AI_CONFIG.difficulty.baseSkill) * boostFactor;
        targetDiff = AI_CONFIG.difficulty.baseSkill + boostAmount * AI_CONFIG.difficulty.rubberBandStrength;
    } else {
        // AI is ahead - nerf AI
        const nerfFactor = Math.min(1, -distanceDiff / AI_CONFIG.difficulty.leadDistance);
        const nerfAmount = (AI_CONFIG.difficulty.baseSkill - AI_CONFIG.difficulty.maxNerf) * nerfFactor;
        targetDiff = AI_CONFIG.difficulty.baseSkill - nerfAmount * AI_CONFIG.difficulty.rubberBandStrength;
    }

    ai.targetDifficulty = Math.max(AI_CONFIG.difficulty.maxNerf,
                                    Math.min(AI_CONFIG.difficulty.maxBoost, targetDiff));

    // Smooth transition
    ai.difficultyMultiplier += (ai.targetDifficulty - ai.difficultyMultiplier) *
                               AI_CONFIG.difficulty.smoothingRate * delta;
}

// Calculate speed-dependent lookahead distance (2.3)
function calculateLookahead(ai, curveLength) {
    const speedRatio = ai.speed / PHYSICS.maxSpeed;

    // Base lookahead: min + (max - min) * speed ratio
    let lookaheadDist = AI_CONFIG.lookahead.minDistance +
        (AI_CONFIG.lookahead.maxDistance - AI_CONFIG.lookahead.minDistance) * speedRatio;

    // Also consider time-based lookahead
    const timeLookahead = ai.speed * AI_CONFIG.lookahead.speedFactor;
    lookaheadDist = Math.max(lookaheadDist, timeLookahead);

    // Reduce in corners for tighter control
    const currentCurvature = racingLine ? racingLine.getCurvatureAt(ai.trackPosition) : 0;
    if (currentCurvature > 0.05) {
        lookaheadDist *= AI_CONFIG.lookahead.cornerMultiplier;
    }

    // Convert to track parameter
    return lookaheadDist / curveLength;
}

export function updateAICars(delta) {
    if (!state.roadCurve) return;
    if (state.gameState !== 'racing' && state.gameState !== 'finished') return;
    if (state.isPaused || state.isCountingDown) return; // Don't update AI while paused or counting down

    const curveLength = state.roadCurve.getLength();

    state.aiCars.forEach((ai, index) => {
        // Update cooldowns
        if (ai.collisionCooldown > 0) ai.collisionCooldown -= delta;
        if (ai.collisionRecovery > 0) ai.collisionRecovery -= delta;

        // Update advanced AI systems
        updateCarAwareness(ai, state.aiCars, state.playerPhysics);
        updateOvertaking(ai, delta);
        updateDynamicDifficulty(ai, delta);

        // Advance track position based on speed
        const speedVariation = 0.85 + index * 0.02;
        ai.trackPosition += (ai.speed / curveLength) * delta * speedVariation;
        if (ai.trackPosition >= 1) {
            ai.trackPosition -= 1;
            ai.lapCount++;

            // Update skill variation each lap (3.3)
            ai.skillVariation = 1 + (Math.random() - 0.5) * ai.personality.consistencyVariation;

            if (ai.lapCount >= 3 && !ai.finished) {
                ai.finished = true;
                ai.finishTime = Date.now();
            }
        }

        // Speed-dependent lookahead (2.3)
        const lookaheadT = calculateLookahead(ai, curveLength);

        // Get target from racing line (2.2)
        // Clamp trackPosition to [0, 1) range for curve lookups
        // Don't wrap negative values - clamp to 0 so AI behind start line targets the start
        let targetT = ai.trackPosition;
        if (targetT < 0) targetT = 0;  // Behind start line - target the start
        while (targetT >= 1) targetT -= 1;
        const lookAheadT = (targetT + lookaheadT) % 1;

        let trackPoint, trackTangent, targetSpeed;

        if (racingLine) {
            const target = racingLine.getTarget(targetT);
            const lookAheadTarget = racingLine.getTarget(lookAheadT);

            trackPoint = target.position;
            trackTangent = target.tangent;

            // Apply personality corner speed bonus (3.3)
            const personalitySpeedMod = 1 + ai.personality.cornerSpeedBonus;
            targetSpeed = target.targetSpeed * personalitySpeedMod * ai.skillVariation;

            // Apply difficulty multiplier (3.2)
            targetSpeed *= ai.difficultyMultiplier;
        } else {
            // Fallback to basic curve following
            trackPoint = state.roadCurve.getPoint(targetT);
            trackTangent = state.roadCurve.getTangent(targetT);

            const futureTangent = state.roadCurve.getTangent(lookAheadT);
            const cornerAngle = trackTangent.angleTo(futureTangent);
            const cornerSeverity = Math.min(1, cornerAngle * 6);
            targetSpeed = PHYSICS.maxSpeed * 0.75 * (1 - cornerSeverity * 0.5);
            targetSpeed *= ai.difficultyMultiplier;
        }

        // Apply lane offset for overtaking
        const trackNormal = new THREE.Vector3(-trackTangent.z, 0, trackTangent.x);
        const effectiveLaneOffset = ai.currentLaneOffset || ai.laneOffset;
        const targetPos = trackPoint.clone().add(trackNormal.multiplyScalar(effectiveLaneOffset));
        targetPos.y = 0.1;

        // Calculate desired heading from track tangent
        const targetHeading = Math.atan2(trackTangent.x, trackTangent.z);

        // === PID STEERING (2.1) ===
        let headingDiff = targetHeading - ai.heading;
        while (headingDiff > Math.PI) headingDiff -= Math.PI * 2;
        while (headingDiff < -Math.PI) headingDiff += Math.PI * 2;

        // Use PID controller for smooth steering
        const steerCommand = ai.steeringPID.update(headingDiff, delta);
        ai.steerInput = steerCommand;

        // Get curvature for corner handling (using wrapped targetT)
        const currentCurvature = racingLine ? racingLine.getCurvatureAt(targetT) : 0;

        // Blend heading toward target - consistent rate for smooth steering
        const headingBlendRate = 6.0; // Steady turn rate
        const blendAmount = Math.min(0.5, headingBlendRate * delta);
        ai.heading += headingDiff * blendAmount;

        // === AI DRIFTING - Check before speed control ===
        // AI drifts aggressively in corners to maintain speed
        // Use currentCurvature from above (already using wrapped targetT)

        // All AI can drift - trigger at moderate curvature and speed
        const driftThreshold = 0.03 + (1 - ai.difficultyMultiplier) * 0.02; // Easier AI drifts later
        const shouldDrift = currentCurvature > driftThreshold && ai.speed > 15;

        if (shouldDrift && !ai.isDrifting) {
            ai.isDrifting = true;
            ai.driftDirection = Math.sign(headingDiff);
            ai.driftTime = 0;
        } else if (!shouldDrift && ai.isDrifting) {
            ai.isDrifting = false;
            ai.driftAmount = 0;
            ai.driftDirection = 0;
        }

        if (ai.isDrifting) {
            ai.driftTime = (ai.driftTime || 0) + delta;
            ai.driftAmount = Math.min(1, ai.driftTime / 0.3); // Faster drift buildup
        }

        // Speed control - use same physics as player car
        // Player acceleration: engineForce / mass = 12000 / 1000 = 12 m/s²
        const aiAccel = PHYSICS.engineForce / PHYSICS.mass;  // Same as player (~12)
        const aiBrake = PHYSICS.brakeForce / PHYSICS.mass;   // Same as player (~20)

        // Apply personality braking point adjustment
        const brakingMod = 1 + ai.personality.brakingPointDelay;

        // Drifting allows slightly higher corner speeds
        const driftSpeedBonus = ai.isDrifting ? 1.15 : 1.0;  // 15% faster in corners when drifting
        const effectiveTargetSpeed = targetSpeed * brakingMod * driftSpeedBonus;

        if (ai.speed < effectiveTargetSpeed) {
            ai.speed += aiAccel * delta * ai.difficultyMultiplier;
        } else if (ai.speed > effectiveTargetSpeed) {
            // Brake less aggressively when drifting
            const brakeMultiplier = ai.isDrifting ? 0.7 : 1.0;
            ai.speed -= aiBrake * delta * brakeMultiplier;
        }
        ai.speed = Math.max(0, Math.min(PHYSICS.maxSpeed, ai.speed));

        // Emit smoke based on cornering intensity (curvature * speed)
        const corneringIntensity = currentCurvature * (ai.speed / PHYSICS.maxSpeed) * 5;
        if (!ai.isAirborne && ai.speed > 12 && corneringIntensity > 0.15) {
            const slipIntensity = Math.min(1, corneringIntensity * 1.2);
            emitDriftSmoke(ai.position, ai.heading, ai.speed, slipIntensity);
        }

        // Move along track direction
        const forward = new THREE.Vector3(Math.sin(ai.heading), 0, Math.cos(ai.heading));
        ai.velocity.copy(forward).multiplyScalar(ai.speed);

        // Calculate new position from physics
        const newPos = ai.position.clone().add(ai.velocity.clone().multiplyScalar(delta));

        // Gentle track correction - only nudge toward racing line, don't teleport
        // Less correction at low speeds (like at race start)
        const speedFactor = Math.min(1, ai.speed / 20);
        const trackBlendRate = speedFactor * (ai.isDrifting ? 2 : 1.5);
        newPos.lerp(targetPos, delta * trackBlendRate);

        // Initialize AI physics state if needed
        if (ai.isAirborne === undefined) {
            ai.isAirborne = false;
            ai.verticalVelocity = 0;
            ai.airborneTime = 0;
            ai.onSurface = false;
            ai.surfaceNormal = new THREE.Vector3(0, 1, 0);
        }

        // === RAYCAST SURFACE DETECTION ===
        const surface = detectSurface(newPos, ai.heading);
        const surfaceType = getSurfaceType(newPos);
        const gripMultiplier = getGripMultiplier(surfaceType);

        // Boost pad effect for AI
        if (surfaceType === 'boost') {
            ai.speed = Math.min(PHYSICS.maxSpeed, ai.speed + PHYSICS.boostAcceleration / PHYSICS.mass * delta);
        }

        // Handle airborne physics for AI
        if (ai.isAirborne) {
            ai.verticalVelocity -= PHYSICS.gravity * delta;
            newPos.y = ai.position.y + ai.verticalVelocity * delta;
            ai.airborneTime += delta;

            if (surface.onSurface && newPos.y <= surface.averageHeight + 0.8) {
                newPos.y = surface.averageHeight + 0.5;
                ai.isAirborne = false;
                ai.verticalVelocity = 0;
                ai.onSurface = true;
                ai.surfaceNormal = surface.surfaceNormal.clone();
                if (ai.airborneTime > 0.3) {
                    ai.speed *= 0.9;
                }
                ai.airborneTime = 0;
            } else if (newPos.y < 0.5) {
                newPos.y = 0.5;
                ai.isAirborne = false;
                ai.verticalVelocity = 0;
                ai.onSurface = true;
                ai.surfaceNormal = new THREE.Vector3(0, 1, 0);
                ai.airborneTime = 0;
            }
        } else if (surface.onSurface) {
            const surfaceNormal = surface.surfaceNormal;
            const canMaintain = canMaintainSurfaceContact(Math.abs(ai.speed), surfaceNormal, 0);

            if (canMaintain) {
                const carHeight = 0.5;
                newPos.y = surface.averageHeight + carHeight;
                ai.onSurface = true;
                ai.surfaceNormal = surfaceNormal.clone();

                const surfaceAngle = Math.acos(Math.max(-1, Math.min(1, surfaceNormal.y)));
                const isRampLike = surfaceAngle > 0.15 && surfaceAngle < Math.PI / 3;

                const fwd = new THREE.Vector3(Math.sin(ai.heading), 0, Math.cos(ai.heading));
                const slopeDir = new THREE.Vector3(surfaceNormal.x, 0, surfaceNormal.z).normalize();
                const movingUpSlope = fwd.dot(slopeDir) < -0.3;

                if (isRampLike && movingUpSlope && ai.speed > 10) {
                    ai.isAirborne = true;
                    ai.verticalVelocity = ai.speed * Math.sin(surfaceAngle);
                    ai.airborneTime = 0;
                }
            } else {
                ai.isAirborne = true;
                ai.verticalVelocity = 0;
                ai.airborneTime = 0;
                ai.onSurface = false;
            }
        } else {
            if (!ai.isAirborne) {
                ai.isAirborne = true;
                ai.verticalVelocity = 0;
                ai.airborneTime = 0;
            }
            ai.verticalVelocity -= PHYSICS.gravity * delta;
            newPos.y = ai.position.y + ai.verticalVelocity * delta;

            if (newPos.y < 0.5) {
                newPos.y = 0.5;
                ai.isAirborne = false;
                ai.verticalVelocity = 0;
                ai.onSurface = false;
                ai.surfaceNormal = new THREE.Vector3(0, 1, 0);
            }
        }

        // === BARRIER COLLISION ===
        const barrierCollision = checkBarrierCollision(newPos, ai.velocity, ai.heading, ai.isAirborne);
        if (barrierCollision.collided) {
            const collisionResult = applyBarrierCollision(
                newPos, ai.velocity, ai.speed, ai.heading, barrierCollision
            );
            newPos.copy(collisionResult.position);
            ai.velocity.copy(collisionResult.velocity);
            ai.speed = Math.max(5, collisionResult.speed);

            const hitAngle = Math.atan2(barrierCollision.normal.x, barrierCollision.normal.z) - ai.heading;
            const sideHitFactor = Math.abs(Math.sin(hitAngle));
            ai.spinVelocity = (ai.spinVelocity || 0) + sideHitFactor * 0.1 * Math.sign(Math.sin(hitAngle));
            ai.spinVelocity = Math.max(-1, Math.min(1, ai.spinVelocity));

            // Reset PID on collision to prevent integral windup
            ai.steeringPID.reset();
        }

        // === OBSTACLE COLLISION (crates, etc.) ===
        const obstacleCollision = checkObstacleCollision(newPos, ai.velocity, ai.heading);
        if (obstacleCollision) {
            const result = applyObstacleCollision(
                newPos, ai.velocity, ai.speed, ai.heading, obstacleCollision
            );

            // Apply speed reduction
            ai.speed = Math.max(5, ai.speed * result.speedMultiplier);

            // Apply spin from side impacts
            ai.spinVelocity = (ai.spinVelocity || 0) + result.spinAmount;

            // Recalculate velocity
            const fwd = new THREE.Vector3(Math.sin(ai.heading), 0, Math.cos(ai.heading));
            ai.velocity.copy(fwd.multiplyScalar(ai.speed));
        }

        ai.position.copy(newPos);

        // Fallback: Keep within track bounds
        const actualToTrack = new THREE.Vector3().subVectors(trackPoint, ai.position);
        actualToTrack.y = 0;
        const lateralDist = actualToTrack.length();
        if (lateralDist > PHYSICS.trackWidth + 2) {
            const pushDir = actualToTrack.normalize();
            ai.position.add(pushDir.multiplyScalar((lateralDist - PHYSICS.trackWidth) * 0.3));
        }

        // Update mesh position
        ai.mesh.position.copy(ai.position);

        // Orient car to match track surface
        if (ai.isAirborne) {
            ai.mesh.rotation.set(
                -ai.verticalVelocity * 0.02,
                ai.heading,
                0
            );
        } else if (ai.onSurface && ai.surfaceNormal) {
            orientToSurface(ai.mesh, ai.heading, ai.surfaceNormal, 0.3);
        } else {
            ai.mesh.rotation.set(0, ai.heading, 0);
        }

        if (ai.mesh.wheels) {
            ai.mesh.wheels.forEach(wheel => wheel.rotation.x += ai.speed * delta * 2);
        }
    });

    // Resolve collisions
    resolveAllCollisions(delta);

    // Update leaderboard
    updateLeaderboard();
}

// AI takeover for player car after finishing
export function updatePlayerAI(delta) {
    if (!state.roadCurve || !state.car) return;

    const curveLength = state.roadCurve.getLength();

    state.playerPhysics.trackPosition += (state.playerPhysics.speed / curveLength) * delta * 0.9;
    if (state.playerPhysics.trackPosition >= 1) {
        state.playerPhysics.trackPosition -= 1;
    }

    const targetT = state.playerPhysics.trackPosition;

    let trackPoint, trackTangent, targetSpeed;

    if (racingLine) {
        const target = racingLine.getTarget(targetT);
        trackPoint = target.position;
        trackTangent = target.tangent;
        targetSpeed = target.targetSpeed * 0.8;
    } else {
        trackPoint = state.roadCurve.getPoint(targetT);
        trackTangent = state.roadCurve.getTangent(targetT);

        const lookAheadT = (targetT + 0.05) % 1;
        const futureTangent = state.roadCurve.getTangent(lookAheadT);
        const cornerAngle = trackTangent.angleTo(futureTangent);
        const cornerSeverity = Math.min(1, cornerAngle * 6);
        targetSpeed = PHYSICS.maxSpeed * 0.75 * (1 - cornerSeverity * 0.5);
    }

    const aiAccel = 8;
    const aiBrake = 12;
    if (state.playerPhysics.speed < targetSpeed) {
        state.playerPhysics.speed += aiAccel * delta * 0.6;
    } else if (state.playerPhysics.speed > targetSpeed) {
        state.playerPhysics.speed -= aiBrake * delta * 0.4;
    }
    state.playerPhysics.speed = Math.max(5, Math.min(PHYSICS.maxSpeed * 0.8, state.playerPhysics.speed));

    const targetPos = trackPoint.clone();
    targetPos.y = 0.1;

    const targetHeading = Math.atan2(trackTangent.x, trackTangent.z);

    let headingDiff = targetHeading - state.playerPhysics.heading;
    while (headingDiff > Math.PI) headingDiff -= Math.PI * 2;
    while (headingDiff < -Math.PI) headingDiff += Math.PI * 2;
    state.playerPhysics.heading += headingDiff * Math.min(0.5, delta * 3);

    const forward = new THREE.Vector3(Math.sin(state.playerPhysics.heading), 0, Math.cos(state.playerPhysics.heading));
    state.playerPhysics.velocity.copy(forward).multiplyScalar(state.playerPhysics.speed);

    const newPos = state.playerPhysics.position.clone().add(state.playerPhysics.velocity.clone().multiplyScalar(delta));
    newPos.lerp(targetPos, delta * 3);
    newPos.y = 0.1;

    state.playerPhysics.position.copy(newPos);

    state.car.position.copy(state.playerPhysics.position);
    state.car.rotation.y = state.playerPhysics.heading;
    state.car.rotation.x = 0;
    state.car.rotation.z = 0;

    if (state.car.wheels) {
        state.car.wheels.forEach(wheel => wheel.rotation.x += state.playerPhysics.speed * delta * 2);
    }
}

function resolveAllCollisions(delta) {
    const collisionDist = CAR_COLLISION_RADIUS * 2;
    const allCars = [...state.aiCars];

    if (state.car && !state.playerPhysics.isAirborne && !state.playerPhysics.inLoop) {
        allCars.push({
            position: state.playerPhysics.position,
            velocity: state.playerPhysics.velocity,
            speed: state.playerPhysics.speed,
            heading: state.playerPhysics.heading,
            isPlayer: true,
            collisionCooldown: 0
        });
    }

    for (let i = 0; i < allCars.length; i++) {
        for (let j = i + 1; j < allCars.length; j++) {
            const car1 = allCars[i];
            const car2 = allCars[j];

            const tocar2 = new THREE.Vector3().subVectors(car2.position, car1.position);
            tocar2.y = 0;
            const dist = tocar2.length();

            if (dist < collisionDist && dist > 0.01) {
                const overlap = collisionDist - dist;
                const normal = tocar2.clone().normalize();

                if (car1.isPlayer) {
                    state.playerPhysics.position.sub(normal.clone().multiplyScalar(overlap * 0.5));
                    car2.position.add(normal.clone().multiplyScalar(overlap * 0.5));
                } else if (car2.isPlayer) {
                    car1.position.sub(normal.clone().multiplyScalar(overlap * 0.5));
                    state.playerPhysics.position.add(normal.clone().multiplyScalar(overlap * 0.5));
                } else {
                    car1.position.sub(normal.clone().multiplyScalar(overlap * 0.5));
                    car2.position.add(normal.clone().multiplyScalar(overlap * 0.5));
                }

                const relVel = car1.velocity.clone().sub(car2.velocity);
                const relVelAlongNormal = relVel.dot(normal);

                if (relVelAlongNormal < 0 && (car1.collisionCooldown <= 0 || car2.collisionCooldown <= 0)) {
                    const impulseMag = -(1 + COLLISION_RESTITUTION) * relVelAlongNormal / 2;
                    const impulse = normal.clone().multiplyScalar(impulseMag);

                    const tangent = relVel.clone().sub(normal.clone().multiplyScalar(relVelAlongNormal));
                    let frictionImpulse = new THREE.Vector3();
                    if (tangent.length() > 0.01) {
                        tangent.normalize();
                        frictionImpulse = tangent.clone().multiplyScalar(-COLLISION_FRICTION * Math.abs(impulseMag));
                    }

                    if (car1.isPlayer) {
                        state.playerPhysics.velocity.sub(impulse).add(frictionImpulse);
                        const fwd = new THREE.Vector3(Math.sin(state.playerPhysics.heading), 0, Math.cos(state.playerPhysics.heading));
                        state.playerPhysics.speed = state.playerPhysics.velocity.dot(fwd);

                        const hitAngle = Math.atan2(normal.x, normal.z) - state.playerPhysics.heading;
                        const sideHitFactor = Math.abs(Math.sin(hitAngle));
                        state.playerPhysics.spinVelocity += sideHitFactor * SPIN_FACTOR * Math.sign(Math.sin(hitAngle)) * Math.abs(relVelAlongNormal) * 3;
                        state.playerPhysics.collisionRecovery = Math.max(state.playerPhysics.collisionRecovery, 0.3);
                    } else {
                        car1.velocity.sub(impulse).add(frictionImpulse);
                        const fwd = new THREE.Vector3(Math.sin(car1.heading), 0, Math.cos(car1.heading));
                        car1.speed = Math.max(0, car1.velocity.dot(fwd));

                        const hitAngle = Math.atan2(normal.x, normal.z) - car1.heading;
                        const sideHitFactor = Math.abs(Math.sin(hitAngle));
                        car1.spinVelocity = (car1.spinVelocity || 0) + sideHitFactor * SPIN_FACTOR * Math.sign(Math.sin(hitAngle)) * Math.abs(relVelAlongNormal) * 3;
                        car1.collisionRecovery = 0.3;
                        car1.collisionCooldown = 0.2;

                        // Reset PID on collision
                        if (car1.steeringPID) car1.steeringPID.reset();
                    }

                    if (car2.isPlayer) {
                        state.playerPhysics.velocity.add(impulse).sub(frictionImpulse);
                        const fwd = new THREE.Vector3(Math.sin(state.playerPhysics.heading), 0, Math.cos(state.playerPhysics.heading));
                        state.playerPhysics.speed = state.playerPhysics.velocity.dot(fwd);

                        const hitAngle = Math.atan2(-normal.x, -normal.z) - state.playerPhysics.heading;
                        const sideHitFactor = Math.abs(Math.sin(hitAngle));
                        state.playerPhysics.spinVelocity += sideHitFactor * SPIN_FACTOR * Math.sign(Math.sin(hitAngle)) * Math.abs(relVelAlongNormal) * 3;
                        state.playerPhysics.collisionRecovery = Math.max(state.playerPhysics.collisionRecovery, 0.3);
                    } else {
                        car2.velocity.add(impulse).sub(frictionImpulse);
                        const fwd = new THREE.Vector3(Math.sin(car2.heading), 0, Math.cos(car2.heading));
                        car2.speed = Math.max(0, car2.velocity.dot(fwd));

                        const hitAngle = Math.atan2(-normal.x, -normal.z) - car2.heading;
                        const sideHitFactor = Math.abs(Math.sin(hitAngle));
                        car2.spinVelocity = (car2.spinVelocity || 0) + sideHitFactor * SPIN_FACTOR * Math.sign(Math.sin(hitAngle)) * Math.abs(relVelAlongNormal) * 3;
                        car2.collisionRecovery = 0.3;
                        car2.collisionCooldown = 0.2;

                        // Reset PID on collision
                        if (car2.steeringPID) car2.steeringPID.reset();
                    }
                }
            }
        }
    }
}

export function getPlayerPosition() {
    const playerProgress = state.lapCount + state.playerPhysics.trackPosition;
    let position = 1;
    state.aiCars.forEach(ai => {
        if (ai.lapCount + ai.trackPosition > playerProgress) position++;
    });
    return position;
}

// Update AI car colors when theme changes
onThemeChange(() => {
    state.aiCars.forEach((ai, index) => {
        if (ai.mesh) {
            updateAICarTheme(ai.mesh, index);
        }
    });
});
