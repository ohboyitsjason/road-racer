import * as THREE from 'three';
import { PHYSICS } from '../constants.js';
import { getColor, getThemeObject, onThemeChange, getCurrentThemeName } from '../theme/themeManager.js';

// Track barrier materials for theme updates
const barrierMaterials = new Set();
const markingMaterials = new Set();
const glowMaterials = new Set();

// Check if current theme should have glowing barriers
function shouldHaveGlowingBarriers() {
    return getCurrentThemeName() === 'neon-night';
}

// Create glowing top strip for a barrier
function createBarrierGlowTop(width, length, color, position, rotationY = 0) {
    const glowGeom = new THREE.BoxGeometry(width + 0.1, 0.15, length);
    const glowMat = new THREE.MeshStandardMaterial({
        color: color,
        emissive: color,
        emissiveIntensity: shouldHaveGlowingBarriers() ? 0.8 : 0
    });
    glowMat.userData.glowColor = color;
    glowMaterials.add(glowMat);

    const glow = new THREE.Mesh(glowGeom, glowMat);
    glow.position.copy(position);
    glow.position.y += 1.25; // On top of barrier (barrier height is 2.5, centered at 1.25)
    glow.rotation.y = rotationY;

    return glow;
}

export function addBarriersToStraight(group, length, width) {
    const barrierMat1 = new THREE.MeshStandardMaterial({ color: getColor('barriers.primary') });
    const barrierMat2 = new THREE.MeshStandardMaterial({ color: getColor('barriers.secondary') });
    barrierMat1.userData.themeKey = 'barriers.primary';
    barrierMat2.userData.themeKey = 'barriers.secondary';
    barrierMaterials.add(barrierMat1);
    barrierMaterials.add(barrierMat2);

    const segmentLength = 2;
    const numSegments = Math.ceil(length / segmentLength);

    [-1, 1].forEach(side => {
        for (let i = 0; i < numSegments; i++) {
            const barrierGeom = new THREE.BoxGeometry(.5, 2.5, segmentLength);
            const mat = i % 2 === 0 ? barrierMat1 : barrierMat2;
            const barrier = new THREE.Mesh(barrierGeom, mat);
            const barrierPos = new THREE.Vector3(
                side * (width / 2 + 0.25),
                1.25,
                i * segmentLength + segmentLength / 2
            );
            barrier.position.copy(barrierPos);
            barrier.castShadow = true;
            barrier.userData.isBarrier = true;
            group.add(barrier);

            // Add glowing top
            const glowColor = i % 2 === 0 ? getColor('barriers.primary') : getColor('barriers.secondary');
            const glowTop = createBarrierGlowTop(0.5, segmentLength, glowColor, barrierPos);
            group.add(glowTop);
        }
    });
}

export function addBarriersToCurve(group, radius, angle, dir, width) {
    const barrierMat1 = new THREE.MeshStandardMaterial({ color: getColor('barriers.primary') });
    const barrierMat2 = new THREE.MeshStandardMaterial({ color: getColor('barriers.secondary') });
    barrierMat1.userData.themeKey = 'barriers.primary';
    barrierMat2.userData.themeKey = 'barriers.secondary';
    barrierMaterials.add(barrierMat1);
    barrierMaterials.add(barrierMat2);

    const numSegments = Math.ceil(angle / 0.15);
    const innerR = radius - width / 2 - 0.25;
    const outerR = radius + width / 2 + 0.25;

    [innerR, outerR].forEach((r) => {
        for (let i = 0; i < numSegments; i++) {
            const a1 = (i / numSegments) * angle;
            const a2 = ((i + 1) / numSegments) * angle;

            let x1, z1, x2, z2;

            if (dir > 0) {
                x1 = -radius + r * Math.cos(a1);
                z1 = r * Math.sin(a1);
                x2 = -radius + r * Math.cos(a2);
                z2 = r * Math.sin(a2);
            } else {
                x1 = radius - r * Math.cos(a1);
                z1 = r * Math.sin(a1);
                x2 = radius - r * Math.cos(a2);
                z2 = r * Math.sin(a2);
            }

            const segLen = Math.sqrt((x2 - x1) ** 2 + (z2 - z1) ** 2);
            const barrierGeom = new THREE.BoxGeometry(0.5, 2.5, segLen + 0.1);
            const mat = i % 2 === 0 ? barrierMat1 : barrierMat2;
            const barrier = new THREE.Mesh(barrierGeom, mat);
            const barrierPos = new THREE.Vector3((x1 + x2) / 2, 1.25, (z1 + z2) / 2);
            const barrierRotY = Math.atan2(x2 - x1, z2 - z1);
            barrier.position.copy(barrierPos);
            barrier.rotation.y = barrierRotY;
            barrier.castShadow = true;
            barrier.userData.isBarrier = true;
            group.add(barrier);

            // Add glowing top
            const glowColor = i % 2 === 0 ? getColor('barriers.primary') : getColor('barriers.secondary');
            const glowTop = createBarrierGlowTop(0.5, segLen + 0.1, glowColor, barrierPos, barrierRotY);
            group.add(glowTop);
        }
    });
}

export function addMarkingsToStraight(group, length) {
    const markings = getThemeObject('road.markings');
    const numDashes = Math.floor(length / 4);
    for (let i = 0; i < numDashes; i++) {
        const dashGeom = new THREE.PlaneGeometry(0.3, 2);
        const dashMat = new THREE.MeshBasicMaterial({
            color: markings.color
        });
        if (markings.emissive && markings.emissiveIntensity > 0) {
            // Convert to MeshStandardMaterial for emissive support
            const emissiveMat = new THREE.MeshStandardMaterial({
                color: markings.color,
                emissive: markings.emissive,
                emissiveIntensity: markings.emissiveIntensity
            });
            emissiveMat.userData.themeKey = 'road.markings';
            markingMaterials.add(emissiveMat);
            const dash = new THREE.Mesh(dashGeom, emissiveMat);
            dash.rotation.x = -Math.PI / 2;
            dash.position.set(0, 0.2, i * 4 + 2);
            group.add(dash);
        } else {
            dashMat.userData.themeKey = 'road.markings';
            markingMaterials.add(dashMat);
            const dash = new THREE.Mesh(dashGeom, dashMat);
            dash.rotation.x = -Math.PI / 2;
            dash.position.set(0, 0.2, i * 4 + 2);
            group.add(dash);
        }
    }
}

export function addMarkingsToCurve(group, radius, angle, dir) {
    const markings = getThemeObject('road.markings');
    const numDashes = Math.max(3, Math.floor(angle * radius / 4));
    for (let i = 0; i < numDashes; i++) {
        const t = (i + 0.5) / numDashes;
        const a = t * angle;

        let x, z;
        if (dir > 0) {
            x = -radius + radius * Math.cos(a);
            z = radius * Math.sin(a);
        } else {
            x = radius - radius * Math.cos(a);
            z = radius * Math.sin(a);
        }

        const dashGeom = new THREE.PlaneGeometry(0.3, 2);
        let dash;
        if (markings.emissive && markings.emissiveIntensity > 0) {
            const emissiveMat = new THREE.MeshStandardMaterial({
                color: markings.color,
                emissive: markings.emissive,
                emissiveIntensity: markings.emissiveIntensity
            });
            emissiveMat.userData.themeKey = 'road.markings';
            markingMaterials.add(emissiveMat);
            dash = new THREE.Mesh(dashGeom, emissiveMat);
        } else {
            const dashMat = new THREE.MeshBasicMaterial({ color: markings.color });
            dashMat.userData.themeKey = 'road.markings';
            markingMaterials.add(dashMat);
            dash = new THREE.Mesh(dashGeom, dashMat);
        }
        dash.rotation.x = -Math.PI / 2;
        dash.rotation.z = dir > 0 ? -a : a;
        dash.position.set(x, 0.2, z);
        group.add(dash);
    }
}

// Update materials when theme changes
function updateBarrierMaterialsTheme() {
    const glowing = shouldHaveGlowingBarriers();

    barrierMaterials.forEach(mat => {
        if (mat.userData.themeKey) {
            mat.color.setHex(getColor(mat.userData.themeKey));
        }
    });

    // Update glow materials
    glowMaterials.forEach(mat => {
        if (mat.userData.glowColor) {
            // Update the glow color based on the current barrier colors
            mat.emissiveIntensity = glowing ? 0.8 : 0;
        }
    });

    const markings = getThemeObject('road.markings');
    markingMaterials.forEach(mat => {
        mat.color.setHex(markings.color);
        if (mat.emissive) {
            mat.emissive.setHex(markings.emissive || 0x000000);
            mat.emissiveIntensity = markings.emissiveIntensity || 0;
        }
    });
}

// Subscribe to theme changes
onThemeChange(() => {
    updateBarrierMaterialsTheme();
});
