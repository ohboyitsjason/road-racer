import * as THREE from 'three';
import { getColor, getThemeObject, onThemeChange, getCurrentThemeName } from '../theme/themeManager.js';

// Track car materials for theme updates
const carMaterials = new Map(); // Map car group -> { body, top }

// Check if current theme should have headlights
function shouldHaveHeadlights() {
    return getCurrentThemeName() === 'neon-night';
}

export function createCar(color = null, isPlayer = true) {
    const carGroup = new THREE.Group();

    // Use theme color if not specified
    const carColor = color !== null ? color : (isPlayer ? getColor('cars.player') : 0x888888);

    const bodyGeometry = new THREE.BoxGeometry(2.5, 0.8, 4.5);
    const bodyMaterial = new THREE.MeshStandardMaterial({ color: carColor, metalness: 0.6, roughness: 0.4 });
    const body = new THREE.Mesh(bodyGeometry, bodyMaterial);
    body.position.y = 0.6;
    body.castShadow = true;
    carGroup.add(body);

    const topGeometry = new THREE.BoxGeometry(2, 0.6, 2.2);
    const topMaterial = new THREE.MeshStandardMaterial({ color: new THREE.Color(carColor).multiplyScalar(0.8), metalness: 0.6, roughness: 0.4 });
    const top = new THREE.Mesh(topGeometry, topMaterial);
    top.position.y = 1.3;
    top.position.z = -0.3;
    top.castShadow = true;
    carGroup.add(top);

    if (isPlayer) {
        const spoilerGeom = new THREE.BoxGeometry(2.4, 0.1, 0.4);
        const spoilerMat = new THREE.MeshStandardMaterial({ color: 0x111111 });
        const spoiler = new THREE.Mesh(spoilerGeom, spoilerMat);
        spoiler.position.set(0, 1.5, -2);
        carGroup.add(spoiler);
    }

    const wheelGeometry = new THREE.CylinderGeometry(0.45, 0.45, 0.35, 16);
    const wheelMaterial = new THREE.MeshStandardMaterial({ color: 0x222222 });
    const wheelPositions = [[-1.2, 0.45, 1.5], [1.2, 0.45, 1.5], [-1.2, 0.45, -1.5], [1.2, 0.45, -1.5]];

    carGroup.wheels = [];
    wheelPositions.forEach(pos => {
        const wheel = new THREE.Mesh(wheelGeometry, wheelMaterial);
        wheel.rotation.z = Math.PI / 2;
        wheel.position.set(...pos);
        wheel.castShadow = true;
        carGroup.add(wheel);
        carGroup.wheels.push(wheel);
    });

    // Headlight meshes (always visible, glow effect)
    const headlightGeometry = new THREE.SphereGeometry(0.18, 8, 8);
    const headlightMaterial = new THREE.MeshStandardMaterial({
        color: 0xffffcc,
        emissive: 0xffffcc,
        emissiveIntensity: shouldHaveHeadlights() ? 1.0 : 0.5
    });

    const leftHeadlightMesh = new THREE.Mesh(headlightGeometry, headlightMaterial);
    leftHeadlightMesh.position.set(-0.7, 0.6, 2.2);
    carGroup.add(leftHeadlightMesh);

    const rightHeadlightMesh = new THREE.Mesh(headlightGeometry, headlightMaterial);
    rightHeadlightMesh.position.set(0.7, 0.6, 2.2);
    carGroup.add(rightHeadlightMesh);

    // Actual headlight spotlights (for neon-night theme)
    const headlightsEnabled = shouldHaveHeadlights();

    // Left headlight
    const leftHeadlight = new THREE.SpotLight(0xffffee, headlightsEnabled ? 2 : 0, 25, Math.PI / 6, 0.5, 1);
    leftHeadlight.position.set(-0.7, 0.6, 2.3);
    leftHeadlight.target.position.set(-0.7, 0, 12);
    carGroup.add(leftHeadlight);
    carGroup.add(leftHeadlight.target);

    // Right headlight
    const rightHeadlight = new THREE.SpotLight(0xffffee, headlightsEnabled ? 2 : 0, 25, Math.PI / 6, 0.5, 1);
    rightHeadlight.position.set(0.7, 0.6, 2.3);
    rightHeadlight.target.position.set(0.7, 0, 12);
    carGroup.add(rightHeadlight);
    carGroup.add(rightHeadlight.target);

    // Store references for theme updates
    carGroup.userData.isPlayer = isPlayer;
    carGroup.userData.bodyMaterial = bodyMaterial;
    carGroup.userData.topMaterial = topMaterial;
    carGroup.userData.headlightMaterial = headlightMaterial;
    carGroup.userData.leftHeadlight = leftHeadlight;
    carGroup.userData.rightHeadlight = rightHeadlight;

    if (isPlayer) {
        carMaterials.set(carGroup, { body: bodyMaterial, top: topMaterial, isPlayer: true });
    }

    return carGroup;
}

// Get player car color from theme
export function getPlayerCarColor() {
    return getColor('cars.player');
}

// Get AI car colors from theme
export function getAICarColors() {
    return getThemeObject('cars.ai');
}

// Update headlights based on theme
function updateCarHeadlights(carGroup) {
    const enabled = shouldHaveHeadlights();

    if (carGroup.userData.leftHeadlight) {
        carGroup.userData.leftHeadlight.intensity = enabled ? 2 : 0;
    }
    if (carGroup.userData.rightHeadlight) {
        carGroup.userData.rightHeadlight.intensity = enabled ? 2 : 0;
    }
    if (carGroup.userData.headlightMaterial) {
        carGroup.userData.headlightMaterial.emissiveIntensity = enabled ? 1.0 : 0.5;
    }
}

// Update player car color when theme changes
export function updatePlayerCarTheme(carGroup) {
    if (carGroup && carGroup.userData.isPlayer) {
        const newColor = getColor('cars.player');
        if (carGroup.userData.bodyMaterial) {
            carGroup.userData.bodyMaterial.color.setHex(newColor);
        }
        if (carGroup.userData.topMaterial) {
            carGroup.userData.topMaterial.color.set(new THREE.Color(newColor).multiplyScalar(0.8));
        }
        updateCarHeadlights(carGroup);
    }
}

// Update AI car colors when theme changes
export function updateAICarTheme(carGroup, colorIndex) {
    const aiColors = getAICarColors();
    const newColor = aiColors[colorIndex % aiColors.length];
    if (carGroup.userData.bodyMaterial) {
        carGroup.userData.bodyMaterial.color.setHex(newColor);
    }
    if (carGroup.userData.topMaterial) {
        carGroup.userData.topMaterial.color.set(new THREE.Color(newColor).multiplyScalar(0.8));
    }
    updateCarHeadlights(carGroup);
}
