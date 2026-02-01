import * as THREE from 'three';
import * as state from '../state.js';
import { DECORATION_DATA } from '../constants.js';

// Update all decoration triggers based on car positions
export function updateDecorationTriggers(delta) {
    if (!state.placedDecorations || state.placedDecorations.length === 0) return;

    // Collect all car positions (player + AI)
    const carPositions = [];

    if (state.playerPhysics && state.playerPhysics.position) {
        carPositions.push(state.playerPhysics.position);
    }

    if (state.aiCars) {
        state.aiCars.forEach(ai => {
            if (ai.position) {
                carPositions.push(ai.position);
            }
        });
    }

    // Check each decoration with triggers
    state.placedDecorations.forEach(deco => {
        const decoData = DECORATION_DATA[deco.type];
        if (!decoData || !decoData.hasTrigger) return;

        const triggerRadius = decoData.triggerRadius || 20;
        let triggered = false;

        // Check if any car is within trigger radius
        for (const carPos of carPositions) {
            const dist = new THREE.Vector2(
                carPos.x - deco.position.x,
                carPos.z - deco.position.z
            ).length();

            if (dist < triggerRadius) {
                triggered = true;
                break;
            }
        }

        // Handle trigger based on type
        if (decoData.triggerType === 'cheer') {
            updateCheerTrigger(deco.mesh, triggered, delta);
        } else if (decoData.triggerType === 'fire') {
            updateFireTrigger(deco.mesh, triggered, delta);
        }
    });
}

// Animate fans cheering in grandstand
function updateCheerTrigger(mesh, triggered, delta) {
    const fanGroup = mesh.getObjectByName('fans');
    if (!fanGroup) return;

    fanGroup.children.forEach(fan => {
        if (triggered) {
            // Animate fans jumping and waving
            fan.userData.animPhase += delta * 8;
            const bounce = Math.abs(Math.sin(fan.userData.animPhase)) * 0.5;
            fan.position.y = fan.userData.originalY + bounce;

            // Slight rotation for wave effect
            fan.rotation.z = Math.sin(fan.userData.animPhase * 1.5) * 0.2;
        } else {
            // Return to rest
            fan.position.y += (fan.userData.originalY - fan.position.y) * delta * 3;
            fan.rotation.z *= 0.95;
        }
    });
}

// Animate pyrotechnic flames
function updateFireTrigger(mesh, triggered, delta) {
    const flameGroup = mesh.getObjectByName('flames');
    const flameLight = mesh.getObjectByName('flameLight');
    if (!flameGroup) return;

    // Handle cooldown
    mesh.userData.triggerCooldown = mesh.userData.triggerCooldown || 0;
    if (mesh.userData.triggerCooldown > 0) {
        mesh.userData.triggerCooldown -= delta;
    }

    // Trigger fire burst
    if (triggered && mesh.userData.triggerCooldown <= 0) {
        mesh.userData.fireActive = true;
        mesh.userData.fireTime = 0;
        mesh.userData.triggerCooldown = 2; // 2 second cooldown between bursts
    }

    // Animate fire if active
    if (mesh.userData.fireActive) {
        mesh.userData.fireTime += delta;
        flameGroup.visible = true;

        // Animate flame particles
        flameGroup.children.forEach(flame => {
            flame.userData.phase += delta * 10;

            // Flicker and rise
            const flickerX = Math.sin(flame.userData.phase * 2.3) * 0.3;
            const flickerZ = Math.cos(flame.userData.phase * 1.7) * 0.3;
            const rise = (flame.userData.phase % (Math.PI * 2)) / (Math.PI * 2) * 2;

            flame.position.x = flickerX;
            flame.position.z = flickerZ;
            flame.position.y = flame.userData.baseY + rise;

            // Scale pulsing
            const pulse = 0.8 + Math.sin(flame.userData.phase * 3) * 0.3;
            flame.scale.setScalar(pulse);

            // Fade based on height
            const heightRatio = (flame.position.y - 2.5) / 6;
            flame.material.opacity = Math.max(0.2, 0.9 - heightRatio * 0.7);
        });

        // Animate light
        if (flameLight) {
            flameLight.intensity = 2 + Math.sin(mesh.userData.fireTime * 20) * 0.5;
        }

        // End fire after duration
        if (mesh.userData.fireTime > 1.5) {
            mesh.userData.fireActive = false;
            flameGroup.visible = false;
            if (flameLight) flameLight.intensity = 0;
        }
    }
}

// Reset all decoration triggers (called when race ends)
export function resetDecorationTriggers() {
    if (!state.placedDecorations) return;

    state.placedDecorations.forEach(deco => {
        if (deco.mesh.userData.decorationType === 'pyro') {
            deco.mesh.userData.fireActive = false;
            deco.mesh.userData.triggerCooldown = 0;
            const flameGroup = deco.mesh.getObjectByName('flames');
            if (flameGroup) flameGroup.visible = false;
            const flameLight = deco.mesh.getObjectByName('flameLight');
            if (flameLight) flameLight.intensity = 0;
        }
    });
}
