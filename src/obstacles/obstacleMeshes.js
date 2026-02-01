import * as THREE from 'three';
import { PHYSICS } from '../constants.js';

// Create a wooden crate mesh
export function createCrateMesh(size = PHYSICS.obstacle.crateSize) {
    const group = new THREE.Group();

    // Main crate body
    const geometry = new THREE.BoxGeometry(size, size, size);

    // Create wood texture with canvas
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 128;
    const ctx = canvas.getContext('2d');

    // Wood base color
    ctx.fillStyle = '#8B4513';
    ctx.fillRect(0, 0, 128, 128);

    // Wood grain lines
    ctx.strokeStyle = '#6B3510';
    ctx.lineWidth = 2;
    for (let i = 0; i < 10; i++) {
        const y = 10 + i * 12 + Math.random() * 4;
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(128, y + (Math.random() - 0.5) * 8);
        ctx.stroke();
    }

    // Crate slat lines (horizontal boards)
    ctx.strokeStyle = '#5A2D0C';
    ctx.lineWidth = 3;
    [32, 64, 96].forEach(y => {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(128, y);
        ctx.stroke();
    });

    // Corner reinforcements
    ctx.fillStyle = '#4A2508';
    ctx.fillRect(0, 0, 12, 128);
    ctx.fillRect(116, 0, 12, 128);

    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;

    const material = new THREE.MeshStandardMaterial({
        map: texture,
        roughness: 0.9,
        metalness: 0.0
    });

    const crate = new THREE.Mesh(geometry, material);
    crate.castShadow = true;
    crate.receiveShadow = true;
    group.add(crate);

    // Metal corner brackets
    const bracketMat = new THREE.MeshStandardMaterial({
        color: 0x555555,
        metalness: 0.8,
        roughness: 0.3
    });

    const bracketSize = size * 0.15;
    const bracketThickness = size * 0.03;

    // Add brackets to corners (simplified - just 4 visible corners)
    const corners = [
        [-1, -1, 1], [1, -1, 1], [-1, 1, 1], [1, 1, 1]
    ];

    corners.forEach(([x, y, z]) => {
        const bracketGeom = new THREE.BoxGeometry(bracketSize, bracketSize, bracketThickness);
        const bracket = new THREE.Mesh(bracketGeom, bracketMat);
        bracket.position.set(
            x * (size / 2 - bracketSize / 2),
            y * (size / 2 - bracketSize / 2),
            z * (size / 2 + bracketThickness / 2)
        );
        bracket.castShadow = true;
        group.add(bracket);
    });

    return group;
}

// Create debris particles when crate is destroyed
export function createDebrisParticles(position, velocity, count = PHYSICS.obstacle.debrisCount) {
    const particles = [];
    const size = PHYSICS.obstacle.crateSize;

    // Wood material for debris
    const woodMat = new THREE.MeshStandardMaterial({
        color: 0x8B4513,
        roughness: 0.9
    });

    for (let i = 0; i < count; i++) {
        // Random debris shape (small boxes)
        const debrisSize = size * (0.1 + Math.random() * 0.2);
        const geometry = new THREE.BoxGeometry(
            debrisSize,
            debrisSize * (0.3 + Math.random() * 0.7),
            debrisSize * (0.5 + Math.random() * 0.5)
        );

        const mesh = new THREE.Mesh(geometry, woodMat);
        mesh.castShadow = true;

        // Position around impact point
        mesh.position.copy(position);
        mesh.position.x += (Math.random() - 0.5) * size;
        mesh.position.y += Math.random() * size * 0.5;
        mesh.position.z += (Math.random() - 0.5) * size;

        // Random rotation
        mesh.rotation.set(
            Math.random() * Math.PI * 2,
            Math.random() * Math.PI * 2,
            Math.random() * Math.PI * 2
        );

        // Velocity based on impact plus random spread
        const spread = 8;
        const debrisVel = new THREE.Vector3(
            velocity.x * 0.5 + (Math.random() - 0.5) * spread,
            Math.random() * spread * 0.5 + 3, // Upward bias
            velocity.z * 0.5 + (Math.random() - 0.5) * spread
        );

        // Angular velocity
        const angularVel = new THREE.Vector3(
            (Math.random() - 0.5) * 10,
            (Math.random() - 0.5) * 10,
            (Math.random() - 0.5) * 10
        );

        particles.push({
            mesh,
            velocity: debrisVel,
            angularVelocity: angularVel,
            lifetime: PHYSICS.obstacle.debrisLifetime
        });
    }

    return particles;
}

// Create preview mesh for placement (semi-transparent)
export function createCratePreview(size = PHYSICS.obstacle.crateSize) {
    const geometry = new THREE.BoxGeometry(size, size, size);
    const material = new THREE.MeshStandardMaterial({
        color: 0x8B4513,
        transparent: true,
        opacity: 0.6
    });

    const mesh = new THREE.Mesh(geometry, material);
    return mesh;
}
