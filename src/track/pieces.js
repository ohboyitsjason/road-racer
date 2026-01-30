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
    const length = def.length;

    // Add direction arrow (visible in build mode only)
    const arrowCanvas = document.createElement('canvas');
    arrowCanvas.width = 128;
    arrowCanvas.height = 256;
    const arrowCtx = arrowCanvas.getContext('2d');

    // Transparent background
    arrowCtx.clearRect(0, 0, 128, 256);

    // Draw arrow pointing down (which becomes forward in world space after rotation)
    arrowCtx.fillStyle = isPreview ? 'rgba(255, 255, 255, 0.5)' : 'rgba(255, 255, 255, 0.8)';
    arrowCtx.beginPath();
    // Arrow head (pointing down)
    arrowCtx.moveTo(64, 236);     // Bottom point
    arrowCtx.lineTo(108, 156);    // Right point
    arrowCtx.lineTo(80, 156);     // Right inner
    // Arrow body
    arrowCtx.lineTo(80, 20);      // Top right
    arrowCtx.lineTo(48, 20);      // Top left
    arrowCtx.lineTo(48, 156);     // Left inner
    arrowCtx.lineTo(20, 156);     // Left point
    arrowCtx.closePath();
    arrowCtx.fill();

    // Add outline
    arrowCtx.strokeStyle = isPreview ? 'rgba(100, 100, 100, 0.5)' : 'rgba(50, 50, 50, 0.6)';
    arrowCtx.lineWidth = 3;
    arrowCtx.stroke();

    const arrowTexture = new THREE.CanvasTexture(arrowCanvas);
    const arrowGeom = new THREE.PlaneGeometry(8, 16);
    const arrowMat = new THREE.MeshBasicMaterial({
        map: arrowTexture,
        transparent: true,
        depthWrite: false
    });
    const arrow = new THREE.Mesh(arrowGeom, arrowMat);
    arrow.rotation.x = -Math.PI / 2;
    arrow.position.set(0, 0.25, length / 2);
    arrow.name = 'directionArrow'; // Mark for hiding during race
    group.add(arrow);

    if (!isPreview) {
        // Start/finish line (checkered pattern)
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

        // Start gantry
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
        // Entry ramp only - cars launch and land on flat road
        const rampGeom = new THREE.BoxGeometry(width - 2, 2, 6);
        const rampMat = new THREE.MeshStandardMaterial({ color: 0x555555 });
        const rampUp = new THREE.Mesh(rampGeom, rampMat);
        rampUp.position.set(0, 0.8, 4);
        rampUp.rotation.x = -0.25;
        rampUp.castShadow = true;
        group.add(rampUp);

        // Ramp top surface (flat launch platform)
        const topGeom = new THREE.BoxGeometry(width - 2, 0.5, 3);
        const top = new THREE.Mesh(topGeom, rampMat);
        top.position.set(0, 1.8, 8);
        top.castShadow = true;
        group.add(top);

        addBarriersToStraight(group, length, width);

        // Warning signs at entry
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

        // Calculate ramp angle from geometry
        const rampLength = 6;
        const rampHeight = PHYSICS.rampHeight;
        const rampAngle = Math.atan2(rampHeight, rampLength);

        group.userData.obstacleZone = {
            type: 'jump',
            rampStart: 2,
            rampEnd: 10,
            rampAngle: rampAngle,
            rampHeight: rampHeight
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

function createIceSectionPiece(def, isPreview = false) {
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
        // Ice surface with glossy appearance
        const iceGeom = new THREE.PlaneGeometry(width - 2, length - 6);
        const iceMat = new THREE.MeshStandardMaterial({
            color: 0xaaddee,
            metalness: 0.3,
            roughness: 0.1
        });
        const ice = new THREE.Mesh(iceGeom, iceMat);
        ice.rotation.x = -Math.PI / 2;
        ice.position.set(0, 0.2, length / 2);
        group.add(ice);

        // Ice cracks/texture detail
        for (let i = 0; i < 8; i++) {
            const crackGeom = new THREE.PlaneGeometry(0.1, 3 + Math.random() * 4);
            const crackMat = new THREE.MeshBasicMaterial({ color: 0x88bbcc, transparent: true, opacity: 0.6 });
            const crack = new THREE.Mesh(crackGeom, crackMat);
            crack.rotation.x = -Math.PI / 2;
            crack.rotation.z = Math.random() * Math.PI;
            crack.position.set(
                (Math.random() - 0.5) * (width - 6),
                0.22,
                5 + Math.random() * (length - 10)
            );
            group.add(crack);
        }

        addBarriersToStraight(group, length, width);

        // Warning signs
        for (let z = 3; z < length - 3; z += 8) {
            [-1, 1].forEach(side => {
                const signGeom = new THREE.PlaneGeometry(1.2, 1.2);
                const signCanvas = document.createElement('canvas');
                signCanvas.width = 48;
                signCanvas.height = 48;
                const ctx = signCanvas.getContext('2d');
                ctx.fillStyle = '#0088ff';
                ctx.fillRect(0, 0, 48, 48);
                ctx.fillStyle = '#fff';
                ctx.font = 'bold 28px Arial';
                ctx.textAlign = 'center';
                ctx.fillText('❄', 24, 34);
                const signTex = new THREE.CanvasTexture(signCanvas);
                const signMat = new THREE.MeshBasicMaterial({ map: signTex });
                const sign = new THREE.Mesh(signGeom, signMat);
                sign.position.set(side * (PHYSICS.trackWidth - 0.3), 1.2, z);
                group.add(sign);
            });
        }

        group.userData.obstacleZone = {
            type: 'ice',
            start: 3,
            end: length - 3
        };
    }

    return group;
}

// Attempt to find if def specifies a larger transition (for 180° curves, use smaller percentage)
function createBankedCurvePiece(def, isPreview = false) {
    const group = new THREE.Group();
    const width = PHYSICS.trackWidth * 2;
    const radius = def.curveRadius;
    const angle = def.curveAngle;
    const dir = def.direction;
    const maxBankAngle = def.bankAngle || 0.3;

    // More segments for larger curves
    const segments = angle > Math.PI / 2 ? 48 : 32;
    const innerR = radius - width / 2;
    const outerR = radius + width / 2;

    // Transition zones - larger percentage for 90° curves, smaller for 180°
    // This keeps the actual transition arc length similar
    const transitionLength = angle > Math.PI / 2 ? 0.2 : 0.35;

    const vertices = [];
    const indices = [];

    // Smootherstep function for extra smooth transitions (Ken Perlin's improved version)
    const smootherstep = (t) => t * t * t * (t * (t * 6 - 15) + 10);

    // Create banked surface with smooth transitions
    for (let i = 0; i <= segments; i++) {
        const t = i / segments;
        const a = t * angle;

        // Calculate banking amount with smooth transition
        let bankFactor;
        if (t < transitionLength) {
            // Entry transition - extra smooth ramp up
            const tt = t / transitionLength;
            bankFactor = smootherstep(tt);
        } else if (t > 1 - transitionLength) {
            // Exit transition - extra smooth ramp down
            const tt = (1 - t) / transitionLength;
            bankFactor = smootherstep(tt);
        } else {
            // Full banking in the middle
            bankFactor = 1;
        }

        const currentBankAngle = maxBankAngle * bankFactor;

        let innerX, innerZ, outerX, outerZ;
        const innerY = 0;
        const outerY = Math.sin(currentBankAngle) * width;

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

        vertices.push(innerX, innerY, innerZ);
        vertices.push(outerX, outerY, outerZ);

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
        color: isPreview ? 0x666666 : 0x444455,
        transparent: isPreview,
        opacity: isPreview ? 0.7 : 1,
        side: THREE.DoubleSide
    });
    const road = new THREE.Mesh(roadGeom, roadMat);
    road.position.y = 0.15;
    road.receiveShadow = true;
    group.add(road);

    if (!isPreview) {
        // Add outer wall - offset outward to prevent z-fighting
        const wallSegments = 16;
        const wallOffset = 1.2; // Offset wall outward from road edge

        for (let i = 0; i < wallSegments; i++) {
            const t = (i + 0.5) / wallSegments; // Center of segment
            const a = t * angle;

            // Calculate banking at this point
            let bankFactor;
            if (t < transitionLength) {
                const tt = t / transitionLength;
                bankFactor = smootherstep(tt);
            } else if (t > 1 - transitionLength) {
                const tt = (1 - t) / transitionLength;
                bankFactor = smootherstep(tt);
            } else {
                bankFactor = 1;
            }
            const currentBankAngle = maxBankAngle * bankFactor;
            const wallHeight = Math.sin(currentBankAngle) * width;

            // Position wall outside the road edge
            const wallR = outerR + wallOffset;
            let x, z;
            if (dir > 0) {
                x = -radius + wallR * Math.cos(a);
                z = wallR * Math.sin(a);
            } else {
                x = radius - wallR * Math.cos(a);
                z = wallR * Math.sin(a);
            }

            const segmentLength = (angle * outerR) / wallSegments;
            const wallGeom = new THREE.BoxGeometry(1.2, 2.5, segmentLength);
            const wallMat = new THREE.MeshStandardMaterial({ color: i % 2 === 0 ? 0xff0000 : 0xffffff });
            const wall = new THREE.Mesh(wallGeom, wallMat);
            wall.position.set(x, wallHeight + 1.4, z);
            wall.rotation.y = dir > 0 ? -a : a;
            wall.castShadow = true;
            group.add(wall);
        }

        // Racing stripe on banked surface
        addMarkingsToCurve(group, radius, angle, dir);

        // Store obstacle zone data for physics
        group.userData.obstacleZone = {
            type: 'banked',
            curveRadius: radius,
            curveAngle: angle,
            direction: dir,
            bankAngle: maxBankAngle,
            trackWidth: width,
            transitionLength: transitionLength
        };
    }

    return group;
}

function createLoopPiece(def, isPreview = false) {
    const group = new THREE.Group();
    const width = PHYSICS.trackWidth * 2;
    const length = def.length;
    const loopRadius = def.loopRadius || PHYSICS.loopRadius;

    // Entry ramp
    const entryGeom = new THREE.PlaneGeometry(width, 10);
    const roadMat = new THREE.MeshStandardMaterial({
        color: isPreview ? 0x666666 : 0x333333,
        transparent: isPreview,
        opacity: isPreview ? 0.7 : 1
    });
    const entry = new THREE.Mesh(entryGeom, roadMat);
    entry.rotation.x = -Math.PI / 2;
    entry.position.y = 0.15;
    entry.position.z = 5;
    entry.receiveShadow = true;
    group.add(entry);

    // Exit ramp
    const exitGeom = new THREE.PlaneGeometry(width, 10);
    const exit = new THREE.Mesh(exitGeom, roadMat);
    exit.rotation.x = -Math.PI / 2;
    exit.position.y = 0.15;
    exit.position.z = length - 5;
    exit.receiveShadow = true;
    group.add(exit);

    if (!isPreview) {
        // Create the loop tube
        const loopSegments = 48;
        const loopCenter = new THREE.Vector3(0, loopRadius + 0.5, length / 2);

        // Loop track surface (tube-like)
        const loopVertices = [];
        const loopIndices = [];
        const widthSegments = 8;

        for (let i = 0; i <= loopSegments; i++) {
            const t = i / loopSegments;
            const theta = t * Math.PI * 2; // Full circle

            const centerY = loopCenter.y + loopRadius * Math.cos(theta);
            const centerZ = loopCenter.z + loopRadius * Math.sin(theta);

            for (let j = 0; j <= widthSegments; j++) {
                const w = (j / widthSegments - 0.5) * width;
                loopVertices.push(w, centerY, centerZ);
            }

            if (i < loopSegments) {
                for (let j = 0; j < widthSegments; j++) {
                    const base = i * (widthSegments + 1) + j;
                    const next = base + widthSegments + 1;
                    loopIndices.push(base, next, base + 1);
                    loopIndices.push(next, next + 1, base + 1);
                }
            }
        }

        const loopGeom = new THREE.BufferGeometry();
        loopGeom.setAttribute('position', new THREE.Float32BufferAttribute(loopVertices, 3));
        loopGeom.setIndex(loopIndices);
        loopGeom.computeVertexNormals();

        const loopMat = new THREE.MeshStandardMaterial({
            color: 0x555566,
            side: THREE.DoubleSide,
            metalness: 0.2,
            roughness: 0.8
        });
        const loopMesh = new THREE.Mesh(loopGeom, loopMat);
        loopMesh.receiveShadow = true;
        loopMesh.castShadow = true;
        group.add(loopMesh);

        // Support structure
        const supportMat = new THREE.MeshStandardMaterial({ color: 0x666666 });
        [-1, 1].forEach(side => {
            const archGeom = new THREE.TorusGeometry(loopRadius + 1, 0.8, 8, 32);
            const arch = new THREE.Mesh(archGeom, supportMat);
            arch.position.set(side * (width / 2 + 2), loopRadius + 0.5, length / 2);
            arch.rotation.y = Math.PI / 2;
            arch.castShadow = true;
            group.add(arch);

            // Vertical supports
            const poleGeom = new THREE.CylinderGeometry(0.5, 0.5, loopRadius * 2 + 2, 8);
            const pole = new THREE.Mesh(poleGeom, supportMat);
            pole.position.set(side * (width / 2 + 2), loopRadius, length / 2);
            pole.castShadow = true;
            group.add(pole);
        });

        // Warning signs
        [-1, 1].forEach(side => {
            const signGeom = new THREE.PlaneGeometry(3, 3);
            const signCanvas = document.createElement('canvas');
            signCanvas.width = 96;
            signCanvas.height = 96;
            const ctx = signCanvas.getContext('2d');
            ctx.fillStyle = '#ff6600';
            ctx.fillRect(0, 0, 96, 96);
            ctx.strokeStyle = '#fff';
            ctx.lineWidth = 4;
            ctx.beginPath();
            ctx.arc(48, 48, 30, 0, Math.PI * 2);
            ctx.stroke();
            ctx.beginPath();
            ctx.moveTo(48, 78);
            ctx.lineTo(48, 18);
            ctx.lineTo(58, 28);
            ctx.stroke();
            const signTex = new THREE.CanvasTexture(signCanvas);
            const signMat = new THREE.MeshBasicMaterial({ map: signTex });
            const sign = new THREE.Mesh(signGeom, signMat);
            sign.position.set(side * (PHYSICS.trackWidth + 2), 2.5, 2);
            group.add(sign);
        });

        addBarriersToStraight(group, 10, width); // Entry barriers

        // Barriers for exit section
        const exitBarrierGroup = new THREE.Group();
        addBarriersToStraight(exitBarrierGroup, 10, width);
        exitBarrierGroup.position.z = length - 10;
        group.add(exitBarrierGroup);

        group.userData.obstacleZone = {
            type: 'loop',
            start: 10,
            end: length - 10,
            loopCenter: loopCenter,
            loopRadius: loopRadius
        };
    }

    return group;
}

// Build PIECE_DEFS by combining PIECE_DATA with createMesh functions
const meshCreators = {
    'start': createStartPiece,
    'straight-short': createStraightPiece,
    'straight-long': createStraightPiece,
    'straight-extra': createStraightPiece,
    'curve-45': createCurvePiece,
    'curve-90': createCurvePiece,
    'curve-banked': createBankedCurvePiece,
    'curve-banked-180': createBankedCurvePiece,
    'jump-ramp': createJumpRampPiece,
    'sand-pit': createSandPitPiece,
    'ice-section': createIceSectionPiece,
    'loop': createLoopPiece
};

export const PIECE_DEFS = {};
for (const [key, data] of Object.entries(PIECE_DATA)) {
    PIECE_DEFS[key] = { ...data, createMesh: meshCreators[key] };
}
