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

export function addBarriersToRamp(group, length, width, heightDelta) {
    const barrierMat1 = new THREE.MeshStandardMaterial({ color: getColor('barriers.primary') });
    const barrierMat2 = new THREE.MeshStandardMaterial({ color: getColor('barriers.secondary') });
    barrierMat1.userData.themeKey = 'barriers.primary';
    barrierMat2.userData.themeKey = 'barriers.secondary';
    barrierMaterials.add(barrierMat1);
    barrierMaterials.add(barrierMat2);

    const segmentLength = 2;
    const numSegments = Math.ceil(length / segmentLength);
    const slopeAngle = Math.atan2(heightDelta, length);

    [-1, 1].forEach(side => {
        for (let i = 0; i < numSegments; i++) {
            const tMid = (i + 0.5) / numSegments;
            const zMid = i * segmentLength + segmentLength / 2;
            const yMid = tMid * heightDelta;

            const barrierGeom = new THREE.BoxGeometry(0.5, 2.5, segmentLength);
            const mat = i % 2 === 0 ? barrierMat1 : barrierMat2;
            const barrier = new THREE.Mesh(barrierGeom, mat);
            const barrierPos = new THREE.Vector3(
                side * (width / 2 + 0.25),
                yMid + 1.25,
                zMid
            );
            barrier.position.copy(barrierPos);
            barrier.rotation.x = -slopeAngle;
            barrier.castShadow = true;
            barrier.userData.isBarrier = true;
            group.add(barrier);

            // Add glowing top following the slope
            const glowColor = i % 2 === 0 ? getColor('barriers.primary') : getColor('barriers.secondary');
            const glowTop = createBarrierGlowTop(0.5, segmentLength, glowColor, barrierPos);
            glowTop.rotation.x = -slopeAngle;
            group.add(glowTop);
        }
    });
}

export function addMarkingsToRamp(group, length, heightDelta) {
    const markings = getThemeObject('road.markings');
    const numDashes = Math.floor(length / 4);
    for (let i = 0; i < numDashes; i++) {
        const t = (i * 4 + 2) / length;
        const z = i * 4 + 2;
        const y = t * heightDelta + 0.2;

        const dashGeom = new THREE.PlaneGeometry(0.3, 2);
        const slopeAngle = Math.atan2(heightDelta, length);
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
        dash.rotation.x = -Math.PI / 2 + slopeAngle;
        dash.position.set(0, y, z);
        group.add(dash);
    }
}

// ============ NEW STYLED TRACK HELPERS ============

const wallMaterials = new Set();
const stripeMaterials = new Set();

// Darken a hex color by a fraction (0-1)
function darkenColor(hex, amount) {
    const r = Math.max(0, ((hex >> 16) & 0xff) * (1 - amount)) | 0;
    const g = Math.max(0, ((hex >> 8) & 0xff) * (1 - amount)) | 0;
    const b = Math.max(0, (hex & 0xff) * (1 - amount)) | 0;
    return (r << 16) | (g << 8) | b;
}

// Thin colored side walls for straight pieces
export function addWallsToStraight(group, length, width, color) {
    const wallHeight = getColor('road.wallHeight') || 1.5;
    const wallMat = new THREE.MeshStandardMaterial({ color });
    wallMat.userData.wallColor = color;
    wallMaterials.add(wallMat);

    [-1, 1].forEach(side => {
        const wallGeom = new THREE.BoxGeometry(0.4, wallHeight, length);
        const wall = new THREE.Mesh(wallGeom, wallMat);
        wall.position.set(side * (width / 2 + 0.2), wallHeight / 2, length / 2);
        wall.castShadow = true;
        wall.userData.isBarrier = true;
        group.add(wall);
    });
}

// Thin colored side walls for curve pieces
export function addWallsToCurve(group, radius, angle, dir, width, color) {
    const wallHeight = getColor('road.wallHeight') || 1.5;
    const wallMat = new THREE.MeshStandardMaterial({ color });
    wallMat.userData.wallColor = color;
    wallMaterials.add(wallMat);

    const innerR = radius - width / 2 - 0.2;
    const outerR = radius + width / 2 + 0.2;
    const numSegments = Math.max(8, Math.ceil(angle / 0.1));

    [innerR, outerR].forEach(r => {
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
            const wallGeom = new THREE.BoxGeometry(0.4, wallHeight, segLen + 0.05);
            const wall = new THREE.Mesh(wallGeom, wallMat);
            wall.position.set((x1 + x2) / 2, wallHeight / 2, (z1 + z2) / 2);
            wall.rotation.y = Math.atan2(x2 - x1, z2 - z1);
            wall.castShadow = true;
            wall.userData.isBarrier = true;
            group.add(wall);
        }
    });
}

// Thin colored side walls for ramp pieces
export function addWallsToRamp(group, length, width, heightDelta, color) {
    const wallHeight = getColor('road.wallHeight') || 1.5;
    const wallMat = new THREE.MeshStandardMaterial({ color });
    wallMat.userData.wallColor = color;
    wallMaterials.add(wallMat);

    const numSegments = Math.ceil(length / 3);
    const slopeAngle = Math.atan2(heightDelta, length);

    [-1, 1].forEach(side => {
        for (let i = 0; i < numSegments; i++) {
            const segLen = length / numSegments;
            const tMid = (i + 0.5) / numSegments;
            const zMid = tMid * length;
            const yMid = tMid * heightDelta;

            const wallGeom = new THREE.BoxGeometry(0.4, wallHeight, segLen + 0.05);
            const wall = new THREE.Mesh(wallGeom, wallMat);
            wall.position.set(side * (width / 2 + 0.2), yMid + wallHeight / 2, zMid);
            wall.rotation.x = -slopeAngle;
            wall.castShadow = true;
            wall.userData.isBarrier = true;
            group.add(wall);
        }
    });
}

// Inner racing stripes for straight pieces
export function addStripesToStraight(group, length, width, baseColor) {
    const stripe = getThemeObject('road.stripe') || { darken: 0.15, roughness: 0.2, metalness: 0.4 };
    const stripeColor = darkenColor(baseColor, stripe.darken);
    const stripeWidth = width * 0.13;
    const stripeOffset = width * 0.28;

    const stripeMat = new THREE.MeshStandardMaterial({
        color: stripeColor,
        roughness: stripe.roughness,
        metalness: stripe.metalness
    });
    stripeMaterials.add(stripeMat);

    [-1, 1].forEach(side => {
        const stripeGeom = new THREE.PlaneGeometry(stripeWidth, length);
        const mesh = new THREE.Mesh(stripeGeom, stripeMat);
        mesh.rotation.x = -Math.PI / 2;
        mesh.position.set(side * stripeOffset, 0.16, length / 2);
        group.add(mesh);
    });
}

// Inner racing stripes for curve pieces
export function addStripesToCurve(group, radius, angle, dir, width, baseColor) {
    const stripe = getThemeObject('road.stripe') || { darken: 0.15, roughness: 0.2, metalness: 0.4 };
    const stripeColor = darkenColor(baseColor, stripe.darken);
    const stripeWidth = width * 0.13;
    const stripeOffset = width * 0.28;

    const stripeMat = new THREE.MeshStandardMaterial({
        color: stripeColor,
        roughness: stripe.roughness,
        metalness: stripe.metalness,
        side: THREE.DoubleSide
    });
    stripeMaterials.add(stripeMat);

    const segments = 24;

    [-1, 1].forEach(side => {
        const r = radius + side * stripeOffset;
        const innerR = r - stripeWidth / 2;
        const outerR = r + stripeWidth / 2;

        const vertices = [];
        const indices = [];

        for (let i = 0; i <= segments; i++) {
            const a = (i / segments) * angle;
            let ix, iz, ox, oz;

            if (dir > 0) {
                ix = -radius + innerR * Math.cos(a);
                iz = innerR * Math.sin(a);
                ox = -radius + outerR * Math.cos(a);
                oz = outerR * Math.sin(a);
            } else {
                ix = radius - innerR * Math.cos(a);
                iz = innerR * Math.sin(a);
                ox = radius - outerR * Math.cos(a);
                oz = outerR * Math.sin(a);
            }

            vertices.push(ix, 0, iz);
            vertices.push(ox, 0, oz);

            if (i < segments) {
                const base = i * 2;
                indices.push(base, base + 1, base + 2);
                indices.push(base + 1, base + 3, base + 2);
            }
        }

        const geom = new THREE.BufferGeometry();
        geom.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
        geom.setIndex(indices);
        geom.computeVertexNormals();

        const mesh = new THREE.Mesh(geom, stripeMat);
        mesh.position.y = 0.16;
        group.add(mesh);
    });
}

// Inner racing stripes for ramp pieces
export function addStripesToRamp(group, length, width, heightDelta, baseColor) {
    const stripe = getThemeObject('road.stripe') || { darken: 0.15, roughness: 0.2, metalness: 0.4 };
    const stripeColor = darkenColor(baseColor, stripe.darken);
    const stripeWidth = width * 0.13;
    const stripeOffset = width * 0.28;
    const slopeAngle = Math.atan2(heightDelta, length);

    const stripeMat = new THREE.MeshStandardMaterial({
        color: stripeColor,
        roughness: stripe.roughness,
        metalness: stripe.metalness
    });
    stripeMaterials.add(stripeMat);

    [-1, 1].forEach(side => {
        const stripeGeom = new THREE.PlaneGeometry(stripeWidth, length);
        const mesh = new THREE.Mesh(stripeGeom, stripeMat);
        mesh.rotation.x = -Math.PI / 2 + slopeAngle;
        const midZ = length / 2;
        const midY = heightDelta / 2 + 0.16;
        mesh.position.set(side * stripeOffset, midY, midZ);
        group.add(mesh);
    });
}

// White chevron arrows for straight pieces
export function addChevronsToStraight(group, length, width) {
    const chevronColor = getColor('road.chevronColor') || 0xffffff;
    const chevronSpacing = 8;
    const numChevrons = Math.floor(length / chevronSpacing);
    const chevronSize = width * 0.3;

    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 64;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, 64, 64);

    // Draw V chevron pointing down (forward in world)
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 4;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(12, 20);
    ctx.lineTo(32, 44);
    ctx.lineTo(52, 20);
    ctx.stroke();

    const texture = new THREE.CanvasTexture(canvas);
    const chevronMat = new THREE.MeshBasicMaterial({
        map: texture,
        transparent: true,
        depthWrite: false,
        opacity: 0.6
    });

    for (let i = 0; i < numChevrons; i++) {
        const chevronGeom = new THREE.PlaneGeometry(chevronSize, chevronSize);
        const chevron = new THREE.Mesh(chevronGeom, chevronMat);
        chevron.rotation.x = -Math.PI / 2;
        chevron.position.set(0, 0.17, i * chevronSpacing + chevronSpacing / 2);
        group.add(chevron);
    }
}

// White chevron arrows for curve pieces
export function addChevronsToCurve(group, radius, angle, dir, width) {
    const chevronSpacing = 8;
    const arcLength = angle * radius;
    const numChevrons = Math.max(2, Math.floor(arcLength / chevronSpacing));
    const chevronSize = width * 0.3;

    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 64;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, 64, 64);

    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 4;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(12, 20);
    ctx.lineTo(32, 44);
    ctx.lineTo(52, 20);
    ctx.stroke();

    const texture = new THREE.CanvasTexture(canvas);
    const chevronMat = new THREE.MeshBasicMaterial({
        map: texture,
        transparent: true,
        depthWrite: false,
        opacity: 0.6
    });

    for (let i = 0; i < numChevrons; i++) {
        const t = (i + 0.5) / numChevrons;
        const a = t * angle;

        let x, z;
        if (dir > 0) {
            x = -radius + radius * Math.cos(a);
            z = radius * Math.sin(a);
        } else {
            x = radius - radius * Math.cos(a);
            z = radius * Math.sin(a);
        }

        const chevronGeom = new THREE.PlaneGeometry(chevronSize, chevronSize);
        const chevron = new THREE.Mesh(chevronGeom, chevronMat);
        chevron.rotation.x = -Math.PI / 2;
        chevron.rotation.z = dir > 0 ? -a : a;
        chevron.position.set(x, 0.17, z);
        group.add(chevron);
    }
}

// Connector dots at piece endpoints
export function addConnectorDots(group, def, color) {
    const dotRadius = 1.5;
    const dotMat = new THREE.MeshStandardMaterial({ color });
    const dotGeom = new THREE.CylinderGeometry(dotRadius, dotRadius, 0.1, 16);

    // Start dot (at origin of piece)
    const startDot = new THREE.Mesh(dotGeom, dotMat);
    startDot.position.set(0, 0.18, 0);
    group.add(startDot);

    // End dot
    const endDot = new THREE.Mesh(dotGeom, dotMat);
    if (def.curveAngle > 0) {
        const a = def.curveAngle;
        const r = def.curveRadius;
        const d = def.direction;
        let ex, ez;
        if (d > 0) {
            ex = -r + r * Math.cos(a);
            ez = r * Math.sin(a);
        } else {
            ex = r - r * Math.cos(a);
            ez = r * Math.sin(a);
        }
        endDot.position.set(ex, 0.18, ez);
    } else {
        endDot.position.set(0, 0.18, def.length);
    }
    group.add(endDot);
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
