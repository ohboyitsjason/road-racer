import * as THREE from 'three';
import * as state from '../state.js';
import { PHYSICS } from '../constants.js';
import { camera } from '../scene.js';
import { formatTime, getOrdinal } from '../ui/leaderboard.js';
import { getPlayerPosition } from '../ai/aiCars.js';

export function checkBarrierCollision(position) {
    if (!state.roadCurve) return null;

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

    const barrierDist = PHYSICS.trackWidth - 1.5;

    if (Math.abs(lateralOffset) > barrierDist) {
        const side = lateralOffset > 0 ? 1 : -1;
        return {
            collided: true,
            normal: normal.clone().multiplyScalar(-side),
            point: trackPoint.clone().add(normal.clone().multiplyScalar(barrierDist * side)),
            trackT: closestT
        };
    }

    return { collided: false, trackT: closestT, lateralOffset: lateralOffset };
}

export function updatePlayerPhysics(delta) {
    if (state.gameState !== 'racing' || !state.car || !state.roadCurve) return;

    const input = {
        throttle: state.keys['arrowup'] || state.keys['w'] ? 1 : 0,
        brake: state.keys['arrowdown'] || state.keys['s'] ? 1 : 0,
        steerLeft: state.keys['arrowleft'] || state.keys['a'] ? 1 : 0,
        steerRight: state.keys['arrowright'] || state.keys['d'] ? 1 : 0
    };

    let speedMultiplier = 1;
    const collision = checkBarrierCollision(state.playerPhysics.position);
    if (collision) {
        state.playerPhysics.trackPosition = collision.trackT;
    }

    // Steering
    const steerInput = input.steerLeft - input.steerRight;
    const speedFactor = Math.min(1, state.playerPhysics.speed / 20);
    state.playerPhysics.angularVelocity = steerInput * PHYSICS.turnSpeed * (1 - speedFactor * 0.5);
    state.playerPhysics.heading += state.playerPhysics.angularVelocity * delta;

    const forward = new THREE.Vector3(Math.sin(state.playerPhysics.heading), 0, Math.cos(state.playerPhysics.heading));

    // Acceleration
    let acceleration = 0;
    if (input.throttle > 0) {
        const powerFactor = 1 - (state.playerPhysics.speed / PHYSICS.maxSpeed) * 0.7;
        acceleration = PHYSICS.acceleration * powerFactor * input.throttle * speedMultiplier;
    } else if (input.brake > 0) {
        acceleration = -PHYSICS.brakeForce * input.brake;
    } else {
        acceleration = -PHYSICS.engineBrake;
    }

    state.playerPhysics.speed += acceleration * delta;
    state.playerPhysics.speed *= Math.pow(PHYSICS.friction, delta);
    state.playerPhysics.speed = Math.max(-PHYSICS.maxSpeed * 0.3, Math.min(PHYSICS.maxSpeed, state.playerPhysics.speed));
    if (Math.abs(state.playerPhysics.speed) < 0.1) state.playerPhysics.speed = 0;

    state.playerPhysics.velocity.copy(forward).multiplyScalar(state.playerPhysics.speed);

    const newPosition = state.playerPhysics.position.clone().add(state.playerPhysics.velocity.clone().multiplyScalar(delta));

    // Collision response
    const newCollision = checkBarrierCollision(newPosition);
    if (newCollision && newCollision.collided) {
        const dot = state.playerPhysics.velocity.dot(newCollision.normal);
        state.playerPhysics.velocity.sub(newCollision.normal.clone().multiplyScalar(2 * dot));
        state.playerPhysics.velocity.multiplyScalar(PHYSICS.collisionBounce);
        state.playerPhysics.speed *= PHYSICS.collisionFriction;
        newPosition.copy(newCollision.point).add(newCollision.normal.clone().multiplyScalar(2));
    }

    state.playerPhysics.position.copy(newPosition);

    // Ramp physics
    let groundHeight = 0.1;
    let onRamp = false;

    for (const zone of state.obstacleZones) {
        if (zone.type !== 'jump') continue;

        const relPos = state.playerPhysics.position.clone().sub(zone.position);
        const cosH = Math.cos(-zone.heading);
        const sinH = Math.sin(-zone.heading);
        const localX = relPos.x * cosH - relPos.z * sinH;
        const localZ = relPos.x * sinH + relPos.z * cosH;

        const pieceLength = 30;
        const halfWidth = PHYSICS.trackWidth;
        if (Math.abs(localX) < halfWidth && localZ > 0 && localZ < pieceLength) {
            if (localZ >= zone.rampStart && localZ <= zone.rampEnd) {
                const t = (localZ - zone.rampStart) / (zone.rampEnd - zone.rampStart);
                groundHeight = 0.1 + t * PHYSICS.rampHeight;
                onRamp = true;
            } else if (localZ > zone.rampEnd && localZ < zone.landingStart) {
                groundHeight = 0.1 + PHYSICS.rampHeight;
                onRamp = true;
            } else if (localZ >= zone.landingStart && localZ <= zone.landingEnd) {
                const t = 1 - (localZ - zone.landingStart) / (zone.landingEnd - zone.landingStart);
                groundHeight = 0.1 + t * PHYSICS.rampHeight;
                onRamp = true;
            }
        }
    }

    if (state.playerPhysics.isAirborne) {
        state.playerPhysics.verticalVelocity -= PHYSICS.gravity * delta;
        state.playerPhysics.position.y += state.playerPhysics.verticalVelocity * delta;
        state.playerPhysics.airborneTime += delta;

        if (state.playerPhysics.position.y <= groundHeight) {
            state.playerPhysics.position.y = groundHeight;
            state.playerPhysics.isAirborne = false;
            state.playerPhysics.verticalVelocity = 0;

            if (state.playerPhysics.airborneTime > 0.3) {
                state.playerPhysics.speed *= 0.9;
            }
            state.playerPhysics.airborneTime = 0;
        }
    } else if (onRamp) {
        state.playerPhysics.position.y = groundHeight;

        if (groundHeight > 0.1 + PHYSICS.rampHeight * 0.8 && Math.abs(state.playerPhysics.speed) > 10) {
            state.playerPhysics.isAirborne = true;
            const speedRatio = Math.min(1, Math.abs(state.playerPhysics.speed) / PHYSICS.maxSpeed);
            state.playerPhysics.verticalVelocity = PHYSICS.rampLaunchSpeed * (0.5 + speedRatio * 0.5);
            state.playerPhysics.airborneTime = 0;
        }
    } else if (state.playerPhysics.position.y > groundHeight + 0.5) {
        state.playerPhysics.isAirborne = true;
        state.playerPhysics.verticalVelocity = 0;
        state.playerPhysics.airborneTime = 0;
    } else {
        state.playerPhysics.position.y = groundHeight;
    }

    state.car.position.copy(state.playerPhysics.position);
    state.car.rotation.y = state.playerPhysics.heading;

    if (state.playerPhysics.isAirborne) {
        state.car.rotation.x = -state.playerPhysics.verticalVelocity * 0.02;
    } else {
        state.car.rotation.x = 0;
    }

    if (state.car.wheels) {
        state.car.wheels.forEach(wheel => wheel.rotation.x += state.playerPhysics.speed * delta * 2);
    }

    // Lap detection
    const currentT = state.playerPhysics.trackPosition;
    if (currentT < 0.05 && state.lastCheckpoint > 0.9) {
        state.setLapCount(state.lapCount + 1);
        document.getElementById('lap-num').textContent = state.lapCount;

        if (state.lapCount >= 3) {
            const position = getPlayerPosition();
            const totalTime = (Date.now() - state.raceStartTime) / 1000;
            document.getElementById('instructions').textContent = position === 1
                ? `YOU WIN! Time: ${formatTime(totalTime)} - Click "Start Race" to race again!`
                : `Finished ${getOrdinal(position)}! Time: ${formatTime(totalTime)} - Try again!`;
            state.setGameState('finished');
        }
    }
    state.setLastCheckpoint(currentT);

    // UI
    document.getElementById('speed-value').textContent = Math.abs(Math.round(state.playerPhysics.speed * 2.237));
    document.getElementById('gear-indicator').textContent = state.playerPhysics.speed < 0 ? 'R' : state.playerPhysics.speed < 5 ? '1' : state.playerPhysics.speed < 12 ? '2' : state.playerPhysics.speed < 22 ? '3' : state.playerPhysics.speed < 32 ? '4' : '5';
    document.getElementById('race-time').textContent = formatTime((Date.now() - state.raceStartTime) / 1000);

    // Camera
    const cameraOffset = new THREE.Vector3(-Math.sin(state.playerPhysics.heading) * 15, 8, -Math.cos(state.playerPhysics.heading) * 15);
    camera.position.lerp(state.playerPhysics.position.clone().add(cameraOffset), 0.08);
    camera.lookAt(state.playerPhysics.position.x, state.playerPhysics.position.y + 1, state.playerPhysics.position.z);
}
