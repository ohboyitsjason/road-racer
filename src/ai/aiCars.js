import * as THREE from 'three';
import * as state from '../state.js';
import { AI_CONFIG, PHYSICS } from '../constants.js';
import { createCar } from '../car/car.js';
import { scene } from '../scene.js';
import { updateLeaderboard } from '../ui/leaderboard.js';
import { detectSurface, orientToSurface, getSurfaceType, getGripMultiplier, canMaintainSurfaceContact, checkBarrierCollision, applyBarrierCollision } from '../car/surfacePhysics.js';

const CAR_COLLISION_RADIUS = 2.2;
const COLLISION_RESTITUTION = 0.3;
const COLLISION_FRICTION = 0.7;
const SPIN_FACTOR = 0.15;

export function setupAICars() {
    state.aiCars.forEach(ai => scene.remove(ai.mesh));
    state.aiCars.length = 0;

    const startOffsets = [0.99, 0.985, 0.98];
    const laneOffsets = [-3, 3, 0];

    for (let i = 0; i < AI_CONFIG.count; i++) {
        const aiCar = createCar(AI_CONFIG.colors[i], false);
        scene.add(aiCar);

        const startPos = startOffsets[i] || (0.99 - i * 0.005);
        const lanePos = laneOffsets[i] || (i - 1) * 3;

        // Get initial position on track
        const point = state.roadCurve ? state.roadCurve.getPoint(startPos) : new THREE.Vector3();
        const tangent = state.roadCurve ? state.roadCurve.getTangent(startPos) : new THREE.Vector3(0, 0, 1);
        const heading = Math.atan2(tangent.x, tangent.z);

        // Set initial position above track
        const startPosition = point.clone();
        startPosition.y = 0.7; // Start above track surface

        state.aiCars.push({
            mesh: aiCar,
            // Physics - same as player
            position: startPosition,
            velocity: new THREE.Vector3(),
            speed: 0,
            heading: heading,
            angularVelocity: 0,
            spinVelocity: 0,
            // Track following
            trackPosition: startPos,
            lastCheckpoint: startPos,
            laneOffset: lanePos,
            targetLaneOffset: lanePos,
            // Drift state
            isDrifting: false,
            driftAmount: 0,
            driftDirection: 0,
            // Race state
            lapCount: -1,
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
            wantsDrift: false
        });
    }
}

export function updateAICars(delta) {
    if (!state.roadCurve) return;
    if (state.gameState !== 'racing' && state.gameState !== 'finished') return;

    state.aiCars.forEach((ai, index) => {
        // Update cooldowns
        if (ai.collisionCooldown > 0) ai.collisionCooldown -= delta;
        if (ai.collisionRecovery > 0) ai.collisionRecovery -= delta;

        // Advance track position based on speed
        const curveLength = state.roadCurve.getLength();
        const speedVariation = 0.85 + index * 0.02; // Slower, slight differences between cars
        ai.trackPosition += (ai.speed / curveLength) * delta * speedVariation;
        if (ai.trackPosition >= 1) {
            ai.trackPosition -= 1;
            ai.lapCount++;
            if (ai.lapCount >= 3 && !ai.finished) {
                ai.finished = true;
                ai.finishTime = Date.now();
            }
        }

        // Get target position on track
        const targetT = ai.trackPosition;
        const trackPoint = state.roadCurve.getPoint(targetT);
        const trackTangent = state.roadCurve.getTangent(targetT);

        // Look ahead for corners
        const lookAheadT = (targetT + 0.05) % 1;
        const futureTangent = state.roadCurve.getTangent(lookAheadT);
        const cornerAngle = trackTangent.angleTo(futureTangent);

        // Target speed based on corner severity - slower in corners
        const cornerSeverity = Math.min(1, cornerAngle * 6);
        const targetSpeed = PHYSICS.maxSpeed * 0.75 * (1 - cornerSeverity * 0.5);

        // Smoothly adjust speed (use simple acceleration values for AI)
        const aiAccel = 8; // m/s^2
        const aiBrake = 12; // m/s^2
        if (ai.speed < targetSpeed) {
            ai.speed += aiAccel * delta * 0.6;
        } else if (ai.speed > targetSpeed) {
            ai.speed -= aiBrake * delta * 0.4;
        }
        ai.speed = Math.max(5, Math.min(PHYSICS.maxSpeed * 0.8, ai.speed));

        // Calculate target position with lane offset
        const trackNormal = new THREE.Vector3(-trackTangent.z, 0, trackTangent.x);
        const targetPos = trackPoint.clone().add(trackNormal.multiplyScalar(ai.laneOffset));
        targetPos.y = 0.1;

        // Calculate desired heading
        const targetHeading = Math.atan2(trackTangent.x, trackTangent.z);

        // Smooth heading adjustment - gentler turning
        let headingDiff = targetHeading - ai.heading;
        while (headingDiff > Math.PI) headingDiff -= Math.PI * 2;
        while (headingDiff < -Math.PI) headingDiff += Math.PI * 2;
        ai.heading += headingDiff * Math.min(0.5, delta * 3);

        // Move along track direction
        const forward = new THREE.Vector3(Math.sin(ai.heading), 0, Math.cos(ai.heading));
        ai.velocity.copy(forward).multiplyScalar(ai.speed);

        // Blend between physics movement and track following - gentler blend
        const newPos = ai.position.clone().add(ai.velocity.clone().multiplyScalar(delta));
        newPos.lerp(targetPos, delta * 3);

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

        // Get surface type for grip modifier (sand, ice, etc.)
        const surfaceType = getSurfaceType(newPos);
        const gripMultiplier = getGripMultiplier(surfaceType);

        // Handle airborne physics for AI
        if (ai.isAirborne) {
            ai.verticalVelocity -= PHYSICS.gravity * delta;
            newPos.y = ai.position.y + ai.verticalVelocity * delta;
            ai.airborneTime += delta;

            // Check if we've hit a surface
            if (surface.onSurface && newPos.y <= surface.averageHeight + 0.8) {
                newPos.y = surface.averageHeight + 0.5;
                ai.isAirborne = false;
                ai.verticalVelocity = 0;
                ai.onSurface = true;
                ai.surfaceNormal = surface.surfaceNormal.clone();
                if (ai.airborneTime > 0.3) {
                    ai.speed *= 0.9; // Landing penalty
                }
                ai.airborneTime = 0;
            } else if (newPos.y < 0.5) {
                // Ground floor fallback
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
                // Stay on surface
                const carHeight = 0.5;
                newPos.y = surface.averageHeight + carHeight;
                ai.onSurface = true;
                ai.surfaceNormal = surfaceNormal.clone();

                // Check for launch conditions (steep upward-facing surface with speed)
                const surfaceAngle = Math.acos(Math.max(-1, Math.min(1, surfaceNormal.y)));
                const isRampLike = surfaceAngle > 0.15 && surfaceAngle < Math.PI / 3;

                // Calculate if moving up the ramp
                const forward = new THREE.Vector3(Math.sin(ai.heading), 0, Math.cos(ai.heading));
                const slopeDir = new THREE.Vector3(surfaceNormal.x, 0, surfaceNormal.z).normalize();
                const movingUpSlope = forward.dot(slopeDir) < -0.3;

                if (isRampLike && movingUpSlope && ai.speed > 10) {
                    // Launch off ramp - use velocity-based projectile motion
                    ai.isAirborne = true;
                    ai.verticalVelocity = ai.speed * Math.sin(surfaceAngle);
                    ai.airborneTime = 0;
                }
            } else {
                // Can't maintain contact - become airborne
                ai.isAirborne = true;
                ai.verticalVelocity = 0;
                ai.airborneTime = 0;
                ai.onSurface = false;
            }
        } else {
            // No surface detected - fall
            if (!ai.isAirborne) {
                ai.isAirborne = true;
                ai.verticalVelocity = 0;
                ai.airborneTime = 0;
            }
            ai.verticalVelocity -= PHYSICS.gravity * delta;
            newPos.y = ai.position.y + ai.verticalVelocity * delta;

            // Clamp to ground level
            if (newPos.y < 0.5) {
                newPos.y = 0.5;
                ai.isAirborne = false;
                ai.verticalVelocity = 0;
                ai.onSurface = false;
                ai.surfaceNormal = new THREE.Vector3(0, 1, 0);
            }
        }

        // === BARRIER COLLISION (raycast-based) ===
        const barrierCollision = checkBarrierCollision(newPos, ai.velocity, ai.heading, ai.isAirborne);
        if (barrierCollision.collided) {
            const collisionResult = applyBarrierCollision(
                newPos, ai.velocity, ai.speed, ai.heading, barrierCollision
            );
            newPos.copy(collisionResult.position);
            ai.velocity.copy(collisionResult.velocity);
            ai.speed = Math.max(5, collisionResult.speed); // AI maintains minimum speed

            // Add small spin from side impacts
            const hitAngle = Math.atan2(barrierCollision.normal.x, barrierCollision.normal.z) - ai.heading;
            const sideHitFactor = Math.abs(Math.sin(hitAngle));
            ai.spinVelocity = (ai.spinVelocity || 0) + sideHitFactor * 0.1 * Math.sign(Math.sin(hitAngle));
            ai.spinVelocity = Math.max(-1, Math.min(1, ai.spinVelocity)); // Cap spin
        }

        ai.position.copy(newPos);

        // Fallback: Keep within track bounds if raycast missed
        const actualToTrack = new THREE.Vector3().subVectors(trackPoint, ai.position);
        actualToTrack.y = 0;
        const lateralDist = actualToTrack.length();
        if (lateralDist > PHYSICS.trackWidth + 2) {
            // Push back toward track center (only if very far off track)
            const pushDir = actualToTrack.normalize();
            ai.position.add(pushDir.multiplyScalar((lateralDist - PHYSICS.trackWidth) * 0.3));
        }

        // Smooth lane offset changes
        ai.targetLaneOffset = (Math.sin(Date.now() * 0.001 + index * 2) * 2);
        ai.laneOffset += (ai.targetLaneOffset - ai.laneOffset) * delta * 2;

        // Update mesh position
        ai.mesh.position.copy(ai.position);

        // Orient car to match track surface using raycast-detected normal
        if (ai.isAirborne) {
            // Airborne - tilt based on vertical velocity
            ai.mesh.rotation.set(
                -ai.verticalVelocity * 0.02,
                ai.heading,
                0
            );
        } else if (ai.onSurface && ai.surfaceNormal) {
            // Use raycast-based surface orientation (same as player)
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

    // Advance track position based on speed
    state.playerPhysics.trackPosition += (state.playerPhysics.speed / curveLength) * delta * 0.9;
    if (state.playerPhysics.trackPosition >= 1) {
        state.playerPhysics.trackPosition -= 1;
    }

    // Get target position on track
    const targetT = state.playerPhysics.trackPosition;
    const trackPoint = state.roadCurve.getPoint(targetT);
    const trackTangent = state.roadCurve.getTangent(targetT);

    // Look ahead for corners
    const lookAheadT = (targetT + 0.05) % 1;
    const futureTangent = state.roadCurve.getTangent(lookAheadT);
    const cornerAngle = trackTangent.angleTo(futureTangent);

    // Target speed based on corner severity - slower in corners
    const cornerSeverity = Math.min(1, cornerAngle * 6);
    const targetSpeed = PHYSICS.maxSpeed * 0.75 * (1 - cornerSeverity * 0.5);

    // Smoothly adjust speed (use simple acceleration values for AI)
    const aiAccel = 8; // m/s^2
    const aiBrake = 12; // m/s^2
    if (state.playerPhysics.speed < targetSpeed) {
        state.playerPhysics.speed += aiAccel * delta * 0.6;
    } else if (state.playerPhysics.speed > targetSpeed) {
        state.playerPhysics.speed -= aiBrake * delta * 0.4;
    }
    state.playerPhysics.speed = Math.max(5, Math.min(PHYSICS.maxSpeed * 0.8, state.playerPhysics.speed));

    // Calculate target position on track center
    const targetPos = trackPoint.clone();
    targetPos.y = 0.1;

    // Calculate desired heading
    const targetHeading = Math.atan2(trackTangent.x, trackTangent.z);

    // Smooth heading adjustment - gentler turning
    let headingDiff = targetHeading - state.playerPhysics.heading;
    while (headingDiff > Math.PI) headingDiff -= Math.PI * 2;
    while (headingDiff < -Math.PI) headingDiff += Math.PI * 2;
    state.playerPhysics.heading += headingDiff * Math.min(0.5, delta * 3);

    // Move along track direction
    const forward = new THREE.Vector3(Math.sin(state.playerPhysics.heading), 0, Math.cos(state.playerPhysics.heading));
    state.playerPhysics.velocity.copy(forward).multiplyScalar(state.playerPhysics.speed);

    // Blend between physics movement and track following - gentler blend
    const newPos = state.playerPhysics.position.clone().add(state.playerPhysics.velocity.clone().multiplyScalar(delta));
    newPos.lerp(targetPos, delta * 3);
    newPos.y = 0.1;

    state.playerPhysics.position.copy(newPos);

    // Update car mesh
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

    // Add player to collision checks
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

    // Check all pairs
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

                // Separate cars
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

                // Calculate collision response
                const relVel = car1.velocity.clone().sub(car2.velocity);
                const relVelAlongNormal = relVel.dot(normal);

                if (relVelAlongNormal < 0 && (car1.collisionCooldown <= 0 || car2.collisionCooldown <= 0)) {
                    const impulseMag = -(1 + COLLISION_RESTITUTION) * relVelAlongNormal / 2;
                    const impulse = normal.clone().multiplyScalar(impulseMag);

                    // Calculate friction
                    const tangent = relVel.clone().sub(normal.clone().multiplyScalar(relVelAlongNormal));
                    let frictionImpulse = new THREE.Vector3();
                    if (tangent.length() > 0.01) {
                        tangent.normalize();
                        frictionImpulse = tangent.clone().multiplyScalar(-COLLISION_FRICTION * Math.abs(impulseMag));
                    }

                    // Apply to car1
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
                    }

                    // Apply to car2
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
