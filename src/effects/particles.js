import * as THREE from 'three';
import { scene } from '../scene.js';

export const poofParticles = [];
export const driftSmokeParticles = [];

export function createPoofEffect(position) {
    const particleCount = 20;
    const colors = [0xffffff, 0x88ff88, 0xffff88, 0x88ffff];

    for (let i = 0; i < particleCount; i++) {
        const size = 0.3 + Math.random() * 0.5;
        const geometry = Math.random() > 0.5
            ? new THREE.SphereGeometry(size, 8, 8)
            : new THREE.OctahedronGeometry(size);

        const material = new THREE.MeshBasicMaterial({
            color: colors[Math.floor(Math.random() * colors.length)],
            transparent: true,
            opacity: 1
        });

        const particle = new THREE.Mesh(geometry, material);
        particle.position.copy(position);
        particle.position.y += 0.5;

        const angle = Math.random() * Math.PI * 2;
        const speed = 5 + Math.random() * 10;
        const upSpeed = 5 + Math.random() * 8;

        particle.userData = {
            velocity: new THREE.Vector3(
                Math.cos(angle) * speed,
                upSpeed,
                Math.sin(angle) * speed
            ),
            life: 1,
            decay: 0.8 + Math.random() * 0.4,
            rotationSpeed: (Math.random() - 0.5) * 10
        };

        scene.add(particle);
        poofParticles.push(particle);
    }

    // Expanding ring
    const ringGeometry = new THREE.RingGeometry(0.1, 0.5, 32);
    const ringMaterial = new THREE.MeshBasicMaterial({
        color: 0x88ff88,
        transparent: true,
        opacity: 0.8,
        side: THREE.DoubleSide
    });
    const ring = new THREE.Mesh(ringGeometry, ringMaterial);
    ring.position.copy(position);
    ring.position.y += 0.2;
    ring.rotation.x = -Math.PI / 2;
    ring.userData = {
        isRing: true,
        life: 1,
        decay: 2
    };
    scene.add(ring);
    poofParticles.push(ring);

    // Smoke puffs
    for (let i = 0; i < 8; i++) {
        const smokeGeom = new THREE.SphereGeometry(0.8 + Math.random() * 0.5, 8, 8);
        const smokeMat = new THREE.MeshBasicMaterial({
            color: 0xcccccc,
            transparent: true,
            opacity: 0.6
        });
        const smoke = new THREE.Mesh(smokeGeom, smokeMat);
        const angle = (i / 8) * Math.PI * 2;
        smoke.position.copy(position);
        smoke.position.x += Math.cos(angle) * 2;
        smoke.position.z += Math.sin(angle) * 2;
        smoke.position.y += 0.5;
        smoke.userData = {
            isSmoke: true,
            velocity: new THREE.Vector3(
                Math.cos(angle) * 3,
                2 + Math.random() * 2,
                Math.sin(angle) * 3
            ),
            life: 1,
            decay: 1.5
        };
        scene.add(smoke);
        poofParticles.push(smoke);
    }
}

export function updatePoofParticles(delta) {
    for (let i = poofParticles.length - 1; i >= 0; i--) {
        const particle = poofParticles[i];
        const data = particle.userData;

        data.life -= delta * data.decay;

        if (data.life <= 0) {
            scene.remove(particle);
            particle.geometry.dispose();
            particle.material.dispose();
            poofParticles.splice(i, 1);
            continue;
        }

        particle.material.opacity = data.life;

        if (data.isRing) {
            particle.scale.x += delta * 15;
            particle.scale.y += delta * 15;
        } else if (data.isSmoke) {
            particle.position.add(data.velocity.clone().multiplyScalar(delta));
            data.velocity.y -= delta * 2;
            particle.scale.multiplyScalar(1 + delta * 0.5);
        } else {
            data.velocity.y -= delta * 20;
            particle.position.add(data.velocity.clone().multiplyScalar(delta));
            particle.rotation.x += data.rotationSpeed * delta;
            particle.rotation.y += data.rotationSpeed * delta;

            if (particle.position.y < 0.2) {
                particle.position.y = 0.2;
                data.velocity.y *= -0.5;
                data.velocity.x *= 0.8;
                data.velocity.z *= 0.8;
            }
        }
    }
}

// Tire smoke trail system
let lastSmokeTime = 0;

export function emitDriftSmoke(carPosition, carHeading, speed, slipIntensity) {
    const now = performance.now() / 1000;

    // Emission rate scales with slip intensity - more friction = more smoke
    const baseInterval = 0.05;
    const smokeInterval = baseInterval / Math.max(0.3, slipIntensity);

    if (now - lastSmokeTime < smokeInterval) return;
    lastSmokeTime = now;

    // Emit from both rear wheels
    const rearOffset = -1.5;
    const wheelSpread = 1.2;

    // More particles when slip is higher
    const particlesPerWheel = slipIntensity > 0.7 ? 2 : 1;

    [-1, 1].forEach(side => {
        for (let p = 0; p < particlesPerWheel; p++) {
            const localX = side * wheelSpread + (Math.random() - 0.5) * 0.3;
            const localZ = rearOffset + (Math.random() - 0.5) * 0.5;

            const worldX = carPosition.x + localX * Math.cos(carHeading) - localZ * Math.sin(carHeading);
            const worldZ = carPosition.z + localX * Math.sin(carHeading) + localZ * Math.cos(carHeading);

            // Size scales with intensity
            const baseSize = 0.3 + slipIntensity * 0.4;
            const size = baseSize + Math.random() * 0.2;
            const geometry = new THREE.SphereGeometry(size, 6, 6);

            // Opacity scales with intensity
            const opacity = 0.3 + slipIntensity * 0.4;
            const material = new THREE.MeshBasicMaterial({
                color: 0xbbbbbb,
                transparent: true,
                opacity: opacity
            });

            const smoke = new THREE.Mesh(geometry, material);
            smoke.position.set(worldX, carPosition.y - 0.3, worldZ);

            // Velocity based on car movement
            const spreadAngle = carHeading + Math.PI + (Math.random() - 0.5) * 0.8;
            const speedFactor = speed * 0.03;
            smoke.userData = {
                velocity: new THREE.Vector3(
                    Math.sin(spreadAngle) * speedFactor,
                    0.3 + Math.random() * 0.4 + slipIntensity * 0.3,
                    Math.cos(spreadAngle) * speedFactor
                ),
                life: 1,
                decay: 0.8 + Math.random() * 0.3, // Slower decay for more visible trails
                growRate: 1.2 + slipIntensity * 0.8 // Faster growth at high slip
            };

            scene.add(smoke);
            driftSmokeParticles.push(smoke);
        }
    });
}

export function updateDriftSmoke(delta) {
    for (let i = driftSmokeParticles.length - 1; i >= 0; i--) {
        const smoke = driftSmokeParticles[i];
        const data = smoke.userData;

        data.life -= delta * data.decay;

        if (data.life <= 0) {
            scene.remove(smoke);
            smoke.geometry.dispose();
            smoke.material.dispose();
            driftSmokeParticles.splice(i, 1);
            continue;
        }

        // Update opacity and position
        smoke.material.opacity = data.life * 0.5;
        smoke.position.add(data.velocity.clone().multiplyScalar(delta));

        // Slow down horizontal movement
        data.velocity.x *= 0.98;
        data.velocity.z *= 0.98;

        // Grow the smoke puff
        const growAmount = 1 + delta * data.growRate;
        smoke.scale.multiplyScalar(growAmount);
    }
}
