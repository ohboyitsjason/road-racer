import * as THREE from 'three';
import { PHYSICS, PIECE_DATA } from '../constants.js';
import { addBarriersToStraight, addBarriersToCurve, addMarkingsToStraight, addMarkingsToCurve } from './barriers.js';

function createStraightPiece(def, isPreview = false) {
    const group = new THREE.Group();
    const width = PHYSICS.trackWidth * 2;

    const roadGeom = new THREE.PlaneGeometry(width, def.length);
    const roadMat = new THREE.MeshStandardMaterial({
        color: isPreview ? 0x666666 : 0x333333,
        transparent: isPreview,
        opacity: isPreview ? 0.7 : 1
    });
    const road = new THREE.Mesh(roadGeom, roadMat);
    road.rotation.x = -Math.PI / 2;
    road.position.y = 0.15;
    road.position.z = def.length / 2;
    road.receiveShadow = true;
    group.add(road);

    if (!isPreview) {
        addBarriersToStraight(group, def.length, width);
        addMarkingsToStraight(group, def.length);
    }

    return group;
}

function createStartPiece(def, isPreview = false) {
    const group = createStraightPiece(def, isPreview);

    if (!isPreview) {
        const startGeom = new THREE.PlaneGeometry(PHYSICS.trackWidth * 2 - 2, 2.5);
        const canvas = document.createElement('canvas');
        canvas.width = 128;
        canvas.height = 32;
        const ctx = canvas.getContext('2d');
        for (let i = 0; i < 16; i++) {
            for (let j = 0; j < 4; j++) {
                ctx.fillStyle = (i + j) % 2 === 0 ? 'white' : 'black';
                ctx.fillRect(i * 8, j * 8, 8, 8);
            }
        }
        const texture = new THREE.CanvasTexture(canvas);
        const startMat = new THREE.MeshBasicMaterial({ map: texture });
        const startLine = new THREE.Mesh(startGeom, startMat);
        startLine.rotation.x = -Math.PI / 2;
        startLine.position.set(0, 0.2, 5);
        group.add(startLine);

        const gantryMat = new THREE.MeshStandardMaterial({ color: 0x444444 });
        [-1, 1].forEach(side => {
            const poleGeom = new THREE.CylinderGeometry(0.4, 0.4, 10, 8);
            const pole = new THREE.Mesh(poleGeom, gantryMat);
            pole.position.set(side * (PHYSICS.trackWidth + 1), 5, 5);
            pole.castShadow = true;
            group.add(pole);
        });
        const crossbarGeom = new THREE.BoxGeometry(PHYSICS.trackWidth * 2 + 4, 1.5, 1.5);
        const crossbar = new THREE.Mesh(crossbarGeom, gantryMat);
        crossbar.position.set(0, 10, 5);
        crossbar.castShadow = true;
        group.add(crossbar);
    }

    return group;
}

function createCurvePiece(def, isPreview = false) {
    const group = new THREE.Group();
    const width = PHYSICS.trackWidth * 2;
    const radius = def.curveRadius;
    const angle = def.curveAngle;
    const dir = def.direction;

    const segments = 24;
    const innerR = radius - width / 2;
    const outerR = radius + width / 2;

    const vertices = [];
    const indices = [];

    for (let i = 0; i <= segments; i++) {
        const t = i / segments;
        const a = t * angle;

        let innerX, innerZ, outerX, outerZ;

        if (dir > 0) {
            innerX = -radius + innerR * Math.cos(a);
            innerZ = innerR * Math.sin(a);
            outerX = -radius + outerR * Math.cos(a);
            outerZ = outerR * Math.sin(a);
        } else {
            innerX = radius - innerR * Math.cos(a);
            innerZ = innerR * Math.sin(a);
            outerX = radius - outerR * Math.cos(a);
            outerZ = outerR * Math.sin(a);
        }

        vertices.push(innerX, 0, innerZ);
        vertices.push(outerX, 0, outerZ);

        if (i < segments) {
            const base = i * 2;
            indices.push(base, base + 1, base + 2);
            indices.push(base + 1, base + 3, base + 2);
        }
    }

    const roadGeom = new THREE.BufferGeometry();
    roadGeom.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    roadGeom.setIndex(indices);
    roadGeom.computeVertexNormals();

    const roadMat = new THREE.MeshStandardMaterial({
        color: isPreview ? 0x666666 : 0x333333,
        transparent: isPreview,
        opacity: isPreview ? 0.7 : 1,
        side: THREE.DoubleSide
    });
    const road = new THREE.Mesh(roadGeom, roadMat);
    road.position.y = 0.15;
    road.receiveShadow = true;
    group.add(road);

    if (!isPreview) {
        addBarriersToCurve(group, radius, angle, dir, width);
        addMarkingsToCurve(group, radius, angle, dir);
    }

    return group;
}

function createJumpRampPiece(def, isPreview = false) {
    const group = new THREE.Group();
    const width = PHYSICS.trackWidth * 2;
    const length = def.length;

    const roadGeom = new THREE.PlaneGeometry(width, length);
    const roadMat = new THREE.MeshStandardMaterial({
        color: isPreview ? 0x666666 : 0x333333,
        transparent: isPreview,
        opacity: isPreview ? 0.7 : 1
    });
    const road = new THREE.Mesh(roadGeom, roadMat);
    road.rotation.x = -Math.PI / 2;
    road.position.y = 0.15;
    road.position.z = length / 2;
    road.receiveShadow = true;
    group.add(road);

    if (!isPreview) {
        const sandGeom = new THREE.PlaneGeometry(width - 4, 8);
        const sandMat = new THREE.MeshStandardMaterial({ color: 0xc2b280 });
        const sand = new THREE.Mesh(sandGeom, sandMat);
        sand.rotation.x = -Math.PI / 2;
        sand.position.set(0, 0.2, length / 2);
        group.add(sand);

        const rampGeom = new THREE.BoxGeometry(width - 2, 2, 5);
        const rampMat = new THREE.MeshStandardMaterial({ color: 0x555555 });
        const rampUp = new THREE.Mesh(rampGeom, rampMat);
        rampUp.position.set(0, 0.65, 3);
        rampUp.rotation.x = -0.3;
        rampUp.castShadow = true;
        group.add(rampUp);

        const rampDown = new THREE.Mesh(rampGeom, rampMat);
        rampDown.position.set(0, 0.65, length - 3);
        rampDown.rotation.x = 0.3;
        rampDown.castShadow = true;
        group.add(rampDown);

        addBarriersToStraight(group, length, width);

        [-1, 1].forEach(side => {
            const signGeom = new THREE.PlaneGeometry(2, 2);
            const signCanvas = document.createElement('canvas');
            signCanvas.width = 64;
            signCanvas.height = 64;
            const ctx = signCanvas.getContext('2d');
            ctx.fillStyle = '#ffcc00';
            ctx.beginPath();
            ctx.moveTo(32, 5);
            ctx.lineTo(59, 55);
            ctx.lineTo(5, 55);
            ctx.closePath();
            ctx.fill();
            ctx.fillStyle = '#000';
            ctx.font = 'bold 30px Arial';
            ctx.textAlign = 'center';
            ctx.fillText('!', 32, 48);
            const signTex = new THREE.CanvasTexture(signCanvas);
            const signMat = new THREE.MeshBasicMaterial({ map: signTex, transparent: true });
            const sign = new THREE.Mesh(signGeom, signMat);
            sign.position.set(side * (PHYSICS.trackWidth + 0.5), 2, 0);
            sign.rotation.y = side * 0.2;
            group.add(sign);
        });

        group.userData.obstacleZone = {
            type: 'jump',
            rampStart: 3,
            rampEnd: 8,
            landingStart: length - 8,
            landingEnd: length - 3,
            sandStart: 8,
            sandEnd: length - 8
        };
    }

    return group;
}

function createSandPitPiece(def, isPreview = false) {
    const group = new THREE.Group();
    const width = PHYSICS.trackWidth * 2;
    const length = def.length;

    const roadGeom = new THREE.PlaneGeometry(width, length);
    const roadMat = new THREE.MeshStandardMaterial({
        color: isPreview ? 0x666666 : 0x333333,
        transparent: isPreview,
        opacity: isPreview ? 0.7 : 1
    });
    const road = new THREE.Mesh(roadGeom, roadMat);
    road.rotation.x = -Math.PI / 2;
    road.position.y = 0.15;
    road.position.z = length / 2;
    road.receiveShadow = true;
    group.add(road);

    if (!isPreview) {
        const sandGeom = new THREE.PlaneGeometry(width - 2, length - 6);
        const sandMat = new THREE.MeshStandardMaterial({ color: 0xc2b280 });
        const sand = new THREE.Mesh(sandGeom, sandMat);
        sand.rotation.x = -Math.PI / 2;
        sand.position.set(0, 0.2, length / 2);
        group.add(sand);

        for (let i = 0; i < 20; i++) {
            const bumpGeom = new THREE.SphereGeometry(0.3 + Math.random() * 0.3, 8, 8);
            const bump = new THREE.Mesh(bumpGeom, sandMat);
            bump.position.set(
                (Math.random() - 0.5) * (width - 4),
                0.25,
                3 + Math.random() * (length - 6)
            );
            bump.scale.y = 0.3;
            group.add(bump);
        }

        addBarriersToStraight(group, length, width);

        for (let z = 5; z < length - 3; z += 4) {
            [-1, 1].forEach(side => {
                const chevGeom = new THREE.PlaneGeometry(1, 1.5);
                const chevCanvas = document.createElement('canvas');
                chevCanvas.width = 32;
                chevCanvas.height = 48;
                const ctx = chevCanvas.getContext('2d');
                ctx.fillStyle = '#ff6600';
                ctx.fillRect(0, 0, 32, 48);
                ctx.fillStyle = '#fff';
                ctx.beginPath();
                ctx.moveTo(16, 5);
                ctx.lineTo(28, 24);
                ctx.lineTo(16, 43);
                ctx.lineTo(4, 24);
                ctx.closePath();
                ctx.fill();
                const chevTex = new THREE.CanvasTexture(chevCanvas);
                const chevMat = new THREE.MeshBasicMaterial({ map: chevTex });
                const chev = new THREE.Mesh(chevGeom, chevMat);
                chev.position.set(side * (PHYSICS.trackWidth - 0.3), 1, z);
                group.add(chev);
            });
        }

        group.userData.obstacleZone = {
            type: 'sand',
            start: 3,
            end: length - 3
        };
    }

    return group;
}

// Build PIECE_DEFS by combining PIECE_DATA with createMesh functions
const meshCreators = {
    'start': createStartPiece,
    'straight-short': createStraightPiece,
    'straight-long': createStraightPiece,
    'curve-45': createCurvePiece,
    'curve-90': createCurvePiece,
    'jump-ramp': createJumpRampPiece,
    'sand-pit': createSandPitPiece
};

export const PIECE_DEFS = {};
for (const [key, data] of Object.entries(PIECE_DATA)) {
    PIECE_DEFS[key] = { ...data, createMesh: meshCreators[key] };
}
