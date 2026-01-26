import * as THREE from 'three';
import { scene } from '../scene.js';

export const poofParticles = [];

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
