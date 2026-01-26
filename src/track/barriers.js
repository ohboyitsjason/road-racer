import * as THREE from 'three';
import { PHYSICS } from '../constants.js';

export function addBarriersToStraight(group, length, width) {
    const barrierMat1 = new THREE.MeshStandardMaterial({ color: 0xcc0000 });
    const barrierMat2 = new THREE.MeshStandardMaterial({ color: 0xffffff });
    const segmentLength = 2;
    const numSegments = Math.ceil(length / segmentLength);

    [-1, 1].forEach(side => {
        for (let i = 0; i < numSegments; i++) {
            const barrierGeom = new THREE.BoxGeometry(0.5, 0.8, segmentLength);
            const mat = i % 2 === 0 ? barrierMat1 : barrierMat2;
            const barrier = new THREE.Mesh(barrierGeom, mat);
            barrier.position.set(
                side * (width / 2 + 0.25),
                0.4,
                i * segmentLength + segmentLength / 2
            );
            barrier.castShadow = true;
            group.add(barrier);
        }
    });
}

export function addBarriersToCurve(group, radius, angle, dir, width) {
    const barrierMat1 = new THREE.MeshStandardMaterial({ color: 0xcc0000 });
    const barrierMat2 = new THREE.MeshStandardMaterial({ color: 0xffffff });
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
            const barrierGeom = new THREE.BoxGeometry(0.5, 0.8, segLen + 0.1);
            const mat = i % 2 === 0 ? barrierMat1 : barrierMat2;
            const barrier = new THREE.Mesh(barrierGeom, mat);
            barrier.position.set((x1 + x2) / 2, 0.4, (z1 + z2) / 2);
            barrier.lookAt((x1 + x2) / 2 + (x2 - x1), 0.4, (z1 + z2) / 2 + (z2 - z1));
            barrier.castShadow = true;
            group.add(barrier);
        }
    });
}

export function addMarkingsToStraight(group, length) {
    const numDashes = Math.floor(length / 4);
    for (let i = 0; i < numDashes; i++) {
        const dashGeom = new THREE.PlaneGeometry(0.3, 2);
        const dashMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
        const dash = new THREE.Mesh(dashGeom, dashMat);
        dash.rotation.x = -Math.PI / 2;
        dash.position.set(0, 0.2, i * 4 + 2);
        group.add(dash);
    }
}

export function addMarkingsToCurve(group, radius, angle, dir) {
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
        const dashMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
        const dash = new THREE.Mesh(dashGeom, dashMat);
        dash.rotation.x = -Math.PI / 2;
        dash.rotation.z = dir > 0 ? -a : a;
        dash.position.set(x, 0.2, z);
        group.add(dash);
    }
}
