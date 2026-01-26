import * as THREE from 'three';
import { scene } from '../scene.js';

function createTree(x, z) {
    const tree = new THREE.Group();
    const trunkGeom = new THREE.CylinderGeometry(0.3, 0.4, 2, 8);
    const trunkMat = new THREE.MeshStandardMaterial({ color: 0x8B4513 });
    const trunk = new THREE.Mesh(trunkGeom, trunkMat);
    trunk.position.y = 1;
    trunk.castShadow = true;
    tree.add(trunk);

    const foliageGeom = new THREE.ConeGeometry(2, 4, 8);
    const foliageMat = new THREE.MeshStandardMaterial({ color: 0x228B22 });
    const foliage = new THREE.Mesh(foliageGeom, foliageMat);
    foliage.position.y = 4;
    foliage.castShadow = true;
    tree.add(foliage);

    tree.position.set(x, 0, z);
    return tree;
}

export function initEnvironment() {
    for (let i = 0; i < 80; i++) {
        const angle = (i / 80) * Math.PI * 2;
        const radius = 220 + Math.random() * 50;
        scene.add(createTree(Math.cos(angle) * radius, Math.sin(angle) * radius));
    }
}
