import * as THREE from 'three';

export function createCar(color = 0xff0000, isPlayer = true) {
    const carGroup = new THREE.Group();

    const bodyGeometry = new THREE.BoxGeometry(2.5, 0.8, 4.5);
    const bodyMaterial = new THREE.MeshStandardMaterial({ color: color, metalness: 0.6, roughness: 0.4 });
    const body = new THREE.Mesh(bodyGeometry, bodyMaterial);
    body.position.y = 0.6;
    body.castShadow = true;
    carGroup.add(body);

    const topGeometry = new THREE.BoxGeometry(2, 0.6, 2.2);
    const topMaterial = new THREE.MeshStandardMaterial({ color: new THREE.Color(color).multiplyScalar(0.8), metalness: 0.6, roughness: 0.4 });
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

    const headlightGeometry = new THREE.SphereGeometry(0.18, 8, 8);
    const headlightMaterial = new THREE.MeshStandardMaterial({ color: 0xffffcc, emissive: 0xffffcc, emissiveIntensity: 0.5 });
    carGroup.add(new THREE.Mesh(headlightGeometry, headlightMaterial).translateX(-0.7).translateY(0.6).translateZ(2.2));
    carGroup.add(new THREE.Mesh(headlightGeometry, headlightMaterial).translateX(0.7).translateY(0.6).translateZ(2.2));

    return carGroup;
}
