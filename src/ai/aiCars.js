import * as THREE from 'three';
import * as state from '../state.js';
import { AI_CONFIG } from '../constants.js';
import { createCar } from '../car/car.js';
import { scene } from '../scene.js';
import { updateLeaderboard } from '../ui/leaderboard.js';

export function setupAICars() {
    state.aiCars.forEach(ai => scene.remove(ai.mesh));
    state.aiCars.length = 0;

    for (let i = 0; i < AI_CONFIG.count; i++) {
        const aiCar = createCar(AI_CONFIG.colors[i], false);
        scene.add(aiCar);

        state.aiCars.push({
            mesh: aiCar,
            trackPosition: 0.02 + i * 0.02,
            speed: 0,
            maxSpeed: 28 + Math.random() * 8,
            acceleration: 12 + Math.random() * 4,
            lapCount: 0,
            lastCheckpoint: 0,
            name: AI_CONFIG.names[i],
            laneOffset: (i - 1) * 2.5,
            finished: false,
            position: new THREE.Vector3(),
            heading: 0
        });
    }
}

export function updateAICars(delta) {
    if (state.gameState !== 'racing' || !state.roadCurve) return;

    const curveLength = state.roadCurve.getLength();

    state.aiCars.forEach((ai, index) => {
        if (ai.finished) return;

        const lookAhead = 0.05;
        const currentTangent = state.roadCurve.getTangent(ai.trackPosition);
        const futureTangent = state.roadCurve.getTangent((ai.trackPosition + lookAhead) % 1);
        const cornerAngle = currentTangent.angleTo(futureTangent);

        const cornerFactor = Math.max(0.4, 1 - cornerAngle * 3);
        let targetSpeed = ai.maxSpeed * cornerFactor * (0.9 + Math.sin(Date.now() * 0.002 + index * 2) * 0.1);

        if (ai.speed < targetSpeed) ai.speed += ai.acceleration * delta;
        else ai.speed -= ai.acceleration * 1.5 * delta;
        ai.speed = Math.max(5, Math.min(ai.maxSpeed, ai.speed));

        ai.trackPosition += (ai.speed / curveLength) * delta;
        if (ai.trackPosition >= 1) ai.trackPosition -= 1;

        if (ai.trackPosition < 0.05 && ai.lastCheckpoint > 0.9) {
            ai.lapCount++;
            if (ai.lapCount >= 3) ai.finished = true;
        }
        ai.lastCheckpoint = ai.trackPosition;

        const point = state.roadCurve.getPoint(ai.trackPosition);
        const tangent = state.roadCurve.getTangent(ai.trackPosition);
        const normal = new THREE.Vector3(-tangent.z, 0, tangent.x);
        const weave = Math.sin(Date.now() * 0.001 + index * 3) * 0.5;
        const targetPos = point.clone().add(normal.clone().multiplyScalar(ai.laneOffset + weave));

        ai.position.lerp(targetPos, 0.15);
        ai.position.y = 0.1;
        ai.heading = Math.atan2(tangent.x, tangent.z);

        ai.mesh.position.copy(ai.position);
        ai.mesh.rotation.y = ai.heading;
        if (ai.mesh.wheels) ai.mesh.wheels.forEach(wheel => wheel.rotation.x += ai.speed * delta * 2);
    });

    updateLeaderboard();
}

export function getPlayerPosition() {
    const playerProgress = state.lapCount + state.playerPhysics.trackPosition;
    let position = 1;
    state.aiCars.forEach(ai => {
        if (ai.lapCount + ai.trackPosition > playerProgress) position++;
    });
    return position;
}
