import * as THREE from 'three';
import { PHYSICS, PIECE_DATA, ELEVATION } from '../constants.js';
import {
    addBarriersToStraight, addBarriersToCurve, addMarkingsToStraight, addMarkingsToCurve,
    addBarriersToRamp, addMarkingsToRamp,
    addWallsToStraight, addWallsToCurve, addWallsToRamp,
    addStripesToRamp
} from './barriers.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { getColor, getThemeObject, onThemeChange, getCurrentThemeName } from '../theme/themeManager.js';

// Track all piece materials for theme updates
const pieceMaterials = new Set();

// Get the sequence color for a piece based on its colorIndex
function getSequenceColor(colorIndex) {
    const sequence = getThemeObject('road.sequence');
    if (sequence && sequence.length > 0) {
        return sequence[colorIndex % sequence.length];
    }
    return getColor('road.color');
}

// GLB model cache: { 'sm': gltf, 'sm-placed': gltf, 'md': gltf, ... }
const trackModelCache = {};
let trackModelsLoaded = false;
let trackModelsLoading = false;
const trackModelCallbacks = [];

// Size mapping: piece length → model size key
function getModelSize(length) {
    if (length <= 20) return 'sm';
    if (length <= 40) return 'md';
    return 'lg';
}

function preloadTrackModels(callback) {
    if (trackModelsLoaded) {
        if (callback) callback();
        return;
    }
    if (callback) trackModelCallbacks.push(callback);
    if (trackModelsLoading) return;
    trackModelsLoading = true;

    const loader = new GLTFLoader();
    const variants = [
        'sm', 'sm-placed', 'md', 'md-placed', 'lg', 'lg-placed',
        'curve-45', 'curve-45-placed', 'curve-90', 'curve-90-placed',
        'ramp-single', 'ramp-connected-bottom', 'ramp-connected-top', 'ramp-connected',
        'loop-placed'
    ];
    let loaded = 0;

    variants.forEach(variant => {
        loader.load(`src/assets/models/trackpiece-${variant}.glb`, (gltf) => {
            trackModelCache[variant] = gltf;
            loaded++;
            if (loaded === variants.length) {
                trackModelsLoaded = true;
                trackModelCallbacks.forEach(cb => cb());
                trackModelCallbacks.length = 0;
            }
        });
    });
}

// Start preloading immediately on module import
preloadTrackModels();

function fitModelToTrack(model, targetWidth, targetLength) {
    const box = new THREE.Box3().setFromObject(model);
    const size = box.getSize(new THREE.Vector3());

    const scaleX = targetWidth / size.x;
    const scaleZ = targetLength / size.z;
    // Use width-based scale for Y so barrier heights are consistent across all pieces
    model.scale.set(scaleX, scaleX, scaleZ);

    // Recompute after scaling
    const scaledBox = new THREE.Box3().setFromObject(model);

    // Position: floor at Y=0.15, centered on X, start at Z=0
    model.position.y += 0.15 - scaledBox.min.y;
    model.position.x -= (scaledBox.max.x + scaledBox.min.x) / 2;
    model.position.z -= scaledBox.min.z;
}

function createStraightPiece(def, isPreview = false, colorIndex = 0) {
    const group = new THREE.Group();
    const width = PHYSICS.trackWidth * 2;
    const pieceColor = isPreview ? 0x666666 : getSequenceColor(colorIndex);
    const nextColor = getSequenceColor(colorIndex + 1);
    const sizeKey = getModelSize(def.length);
    const variantKey = sizeKey + '-placed';

    function addModel(gltfData) {
        const model = gltfData.scene.clone();
        stripNonMeshNodes(model);
        fitModelToTrack(model, width, def.length);

        model.traverse(child => {
            if (child.isMesh) {
                child.material = child.material.clone();
                child.receiveShadow = true;
                child.castShadow = true;
                tameModelMaterial(child.material);

                if (child.material.name === 'Road Stripe 2') {
                    child.material.color.setHex(isPreview ? 0x666666 : nextColor);
                } else {
                    child.material.color.setHex(pieceColor);
                }

                if (isPreview) {
                    child.material.transparent = true;
                    child.material.opacity = 0.7;
                } else {
                    pieceMaterials.add(child.material);
                }
            }
        });

        group.add(model);
    }

    const gltfData = trackModelCache[variantKey];
    if (gltfData) {
        addModel(gltfData);
    } else {
        // Models still loading — add once ready
        preloadTrackModels(() => addModel(trackModelCache[variantKey]));
    }

    return group;
}

function createStartPiece(def, isPreview = false, colorIndex = 0) {
    const group = createStraightPiece(def, isPreview, colorIndex);
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
        // Start/finish line (checkered pattern) - positioned near exit edge (direction of flow)
        const startLineZ = length - 5; // 5 units from exit edge
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
        startLine.position.set(0, 0.2, startLineZ);
        group.add(startLine);

        // Start gantry - positioned at start line
        const gantryMat = new THREE.MeshStandardMaterial({ color: 0x444444 });
        [-1, 1].forEach(side => {
            const poleGeom = new THREE.CylinderGeometry(0.4, 0.4, 10, 8);
            const pole = new THREE.Mesh(poleGeom, gantryMat);
            pole.position.set(side * (PHYSICS.trackWidth + 1), 5, startLineZ);
            pole.castShadow = true;
            group.add(pole);
        });
        const crossbarGeom = new THREE.BoxGeometry(PHYSICS.trackWidth * 2 + 4, 1.5, 1.5);
        const crossbar = new THREE.Mesh(crossbarGeom, gantryMat);
        crossbar.position.set(0, 10, startLineZ);
        crossbar.castShadow = true;
        group.add(crossbar);
    }

    return group;
}

function getCurveModelKey(angle) {
    if (angle <= Math.PI / 4 + 0.01) return 'curve-45';
    return 'curve-90';
}

// Remove non-mesh leaf nodes (e.g. BézierCircle) that can interfere with bounding box or rendering
function stripNonMeshNodes(model) {
    const toRemove = [];
    model.traverse(child => {
        if (child !== model && !child.isMesh && child.children.length === 0) {
            toRemove.push(child);
        }
    });
    toRemove.forEach(child => child.parent && child.parent.remove(child));
}

// Reduce specular intensity on GLB materials to prevent bright highlights triggering god rays
function tameModelMaterial(mat) {
    if (mat.clearcoat !== undefined) mat.clearcoat = Math.min(mat.clearcoat, 0.1);
    if (mat.anisotropy !== undefined) mat.anisotropy = Math.min(mat.anisotropy, 0.2);
    mat.roughness = Math.max(mat.roughness || 0, 0.4);
    mat.metalness = Math.min(mat.metalness || 0, 0.3);
}

// Flip geometry vertices directly to avoid negative scale (which causes shadow/post-processing artifacts)
function flipModelGeometry(model, flipX, flipZ) {
    const needsWindingFlip = flipX !== flipZ; // Odd number of flips reverses winding
    model.traverse(child => {
        if (child === model) return; // Skip root
        // Flip the Object3D position to match the vertex flip
        if (flipX) child.position.x = -child.position.x;
        if (flipZ) child.position.z = -child.position.z;

        if (child.isMesh && child.geometry) {
            child.geometry = child.geometry.clone();
            const pos = child.geometry.attributes.position;
            const normal = child.geometry.attributes.normal;
            for (let i = 0; i < pos.count; i++) {
                if (flipX) pos.setX(i, -pos.getX(i));
                if (flipZ) pos.setZ(i, -pos.getZ(i));
                if (normal) {
                    if (flipX) normal.setX(i, -normal.getX(i));
                    if (flipZ) normal.setZ(i, -normal.getZ(i));
                }
            }
            // Reverse face winding if odd number of flips
            if (needsWindingFlip && child.geometry.index) {
                const idx = child.geometry.index.array;
                for (let i = 0; i < idx.length; i += 3) {
                    const tmp = idx[i + 1];
                    idx[i + 1] = idx[i + 2];
                    idx[i + 2] = tmp;
                }
                child.geometry.index.needsUpdate = true;
            }
            pos.needsUpdate = true;
            if (normal) normal.needsUpdate = true;
            // Invalidate cached bounding volumes so Box3.setFromObject recomputes
            child.geometry.boundingBox = null;
            child.geometry.boundingSphere = null;
        }
    });
}

function fitCurveModel(model, radius, angle, dir, width) {
    const innerR = radius - width / 2;
    const outerR = radius + width / 2;

    // Model is a right-turn curve with start at max Z, end at min Z.
    // Flip geometry vertices instead of using negative scale to avoid rendering artifacts.
    const needFlipX = dir > 0; // Mirror X for left turns
    const needFlipZ = true;    // Always flip Z (model start is at max Z)
    flipModelGeometry(model, needFlipX, needFlipZ);

    const box = new THREE.Box3().setFromObject(model);
    const modelSize = box.getSize(new THREE.Vector3());

    // Expected bounding box
    let expMinX, expMaxX;
    if (dir > 0) {
        expMinX = -radius + innerR * Math.cos(angle);
        expMaxX = -radius + outerR;
    } else {
        expMinX = radius - outerR;
        expMaxX = radius - innerR * Math.cos(angle);
    }
    const expMaxZ = outerR * Math.sin(angle);
    const expSizeX = expMaxX - expMinX;
    const expSizeZ = expMaxZ;
    const expCenterX = (expMinX + expMaxX) / 2;

    // Scale X/Z to fit the arc footprint, Y based on width scale for consistent barriers
    const scaleX = expSizeX / modelSize.x;
    const scaleZ = expSizeZ / modelSize.z;
    model.scale.set(scaleX, scaleX, scaleZ);

    // Recompute after scaling
    const scaledBox = new THREE.Box3().setFromObject(model);

    // Align: match bounding box edges to expected bounds
    model.position.x += expMinX - scaledBox.min.x;
    model.position.y += 0.15 - scaledBox.min.y;
    model.position.z += 0 - scaledBox.min.z;

}

function createCurvePiece(def, isPreview = false, colorIndex = 0) {
    const group = new THREE.Group();
    const width = PHYSICS.trackWidth * 2;
    const radius = def.curveRadius;
    const angle = def.curveAngle;
    const dir = def.direction;
    const pieceColor = isPreview ? 0x666666 : getSequenceColor(colorIndex);

    const modelKey = getCurveModelKey(angle);
    const placedKey = modelKey + '-placed';
    const gltfData = trackModelCache[placedKey] || trackModelCache[modelKey];

    function addCurveModel(data) {
        const model = data.scene.clone();
        stripNonMeshNodes(model);
        fitCurveModel(model, radius, angle, dir, width);

        model.traverse(child => {
            if (child.isMesh) {
                child.material = child.material.clone();
                child.receiveShadow = true;
                child.castShadow = true;
                tameModelMaterial(child.material);
                child.material.color.setHex(pieceColor);

                if (isPreview) {
                    child.material.transparent = true;
                    child.material.opacity = 0.7;
                } else {
                    pieceMaterials.add(child.material);
                }
            }
        });

        group.add(model);
    }

    if (gltfData) {
        addCurveModel(gltfData);
    } else {
        preloadTrackModels(() => {
            const data = trackModelCache[placedKey] || trackModelCache[modelKey];
            if (data) addCurveModel(data);
        });
    }

    return group;
}

function createJumpRampPiece(def, isPreview = false, colorIndex = 0) {
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

        const obstacleColor = getSequenceColor(colorIndex);
        addWallsToStraight(group, length, width, obstacleColor);


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

function createSandPitPiece(def, isPreview = false, colorIndex = 0) {
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
        const sandTheme = getThemeObject('track.sand');
        const sandGeom = new THREE.PlaneGeometry(width - 2, length - 6);
        const sandMat = new THREE.MeshStandardMaterial({
            color: sandTheme.color,
            roughness: sandTheme.roughness
        });
        sandMat.userData.themeKey = 'track.sand';
        pieceMaterials.add(sandMat);
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

        const sandWallColor = getSequenceColor(colorIndex);
        addWallsToStraight(group, length, width, sandWallColor);


        group.userData.obstacleZone = {
            type: 'sand',
            start: 3,
            end: length - 3
        };
    }

    return group;
}

function createIceSectionPiece(def, isPreview = false, colorIndex = 0) {
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
        const iceTheme = getThemeObject('track.ice');
        const iceGeom = new THREE.PlaneGeometry(width - 2, length - 6);
        const iceMat = new THREE.MeshStandardMaterial({
            color: iceTheme.color,
            emissive: iceTheme.emissive || 0x000000,
            emissiveIntensity: iceTheme.emissiveIntensity || 0,
            metalness: 0.3,
            roughness: iceTheme.roughness
        });
        iceMat.userData.themeKey = 'track.ice';
        pieceMaterials.add(iceMat);
        const ice = new THREE.Mesh(iceGeom, iceMat);
        ice.rotation.x = -Math.PI / 2;
        ice.position.set(0, 0.2, length / 2);
        group.add(ice);

        // Ice cracks/texture detail
        for (let i = 0; i < 8; i++) {
            const crackGeom = new THREE.PlaneGeometry(0.1, 3 + Math.random() * 4);
            const crackMat = new THREE.MeshBasicMaterial({ color: iceTheme.color, transparent: true, opacity: 0.6 });
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

        const iceWallColor = getSequenceColor(colorIndex);
        addWallsToStraight(group, length, width, iceWallColor);


        group.userData.obstacleZone = {
            type: 'ice',
            start: 3,
            end: length - 3
        };
    }

    return group;
}

// Attempt to find if def specifies a larger transition (for 180° curves, use smaller percentage)
function createBankedCurvePiece(def, isPreview = false, colorIndex = 0) {
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

    const loopTheme = getThemeObject('track.loop');
    const roadMat = new THREE.MeshStandardMaterial({
        color: isPreview ? 0x666666 : loopTheme.color,
        transparent: isPreview,
        opacity: isPreview ? 0.7 : 1,
        side: THREE.DoubleSide
    });
    if (!isPreview) {
        roadMat.userData.themeKey = 'track.loop';
        pieceMaterials.add(roadMat);
    }
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
            const barrierPrimary = getColor('barriers.primary');
            const barrierSecondary = getColor('barriers.secondary');
            const wallMat = new THREE.MeshStandardMaterial({ color: i % 2 === 0 ? barrierPrimary : barrierSecondary });
            const wall = new THREE.Mesh(wallGeom, wallMat);
            wall.position.set(x, wallHeight + 1.4, z);
            wall.rotation.y = dir > 0 ? -a : a;
            wall.castShadow = true;
            group.add(wall);
        }

        // Connector dots
        const bankedColor = getSequenceColor(colorIndex);


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

function createBoostPadPiece(def, isPreview = false, colorIndex = 0) {
    const group = new THREE.Group();
    const width = PHYSICS.trackWidth * 2;
    const length = def.length;

    // Base road surface
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
        // Glowing boost surface
        const boostTheme = getThemeObject('track.boost');
        const boostGeom = new THREE.PlaneGeometry(width - 2, length - 2);
        const boostMat = new THREE.MeshStandardMaterial({
            color: boostTheme.color,
            emissive: boostTheme.emissive || boostTheme.color,
            emissiveIntensity: boostTheme.emissiveIntensity || 0.5,
            metalness: 0.8,
            roughness: boostTheme.roughness
        });
        boostMat.userData.themeKey = 'track.boost';
        pieceMaterials.add(boostMat);
        const boostSurface = new THREE.Mesh(boostGeom, boostMat);
        boostSurface.rotation.x = -Math.PI / 2;
        boostSurface.position.set(0, 0.2, length / 2);
        group.add(boostSurface);

        // Speed arrows on the surface
        const arrowCanvas = document.createElement('canvas');
        arrowCanvas.width = 128;
        arrowCanvas.height = 256;
        const ctx = arrowCanvas.getContext('2d');

        // Transparent background
        ctx.clearRect(0, 0, 128, 256);

        // Draw multiple chevron arrows pointing forward
        ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
        for (let i = 0; i < 3; i++) {
            const yOffset = i * 80;
            ctx.beginPath();
            ctx.moveTo(64, 30 + yOffset);  // Top point
            ctx.lineTo(110, 70 + yOffset); // Right
            ctx.lineTo(64, 55 + yOffset);  // Inner
            ctx.lineTo(18, 70 + yOffset);  // Left
            ctx.closePath();
            ctx.fill();
        }

        const arrowTexture = new THREE.CanvasTexture(arrowCanvas);
        arrowTexture.wrapS = THREE.RepeatWrapping;
        arrowTexture.wrapT = THREE.RepeatWrapping;

        const arrowGeom = new THREE.PlaneGeometry(width - 4, length - 3);
        const arrowMat = new THREE.MeshBasicMaterial({
            map: arrowTexture,
            transparent: true,
            depthWrite: false
        });
        const arrows = new THREE.Mesh(arrowGeom, arrowMat);
        arrows.rotation.x = -Math.PI / 2;
        arrows.position.set(0, 0.25, length / 2);
        group.add(arrows);

        // Side light strips (like runway lights)
        [-1, 1].forEach(side => {
            for (let z = 2; z < length - 1; z += 3) {
                const lightGeom = new THREE.BoxGeometry(0.5, 0.3, 1.5);
                const lightMat = new THREE.MeshStandardMaterial({
                    color: 0xffff00,
                    emissive: 0xffaa00,
                    emissiveIntensity: 0.8
                });
                const light = new THREE.Mesh(lightGeom, lightMat);
                light.position.set(side * (PHYSICS.trackWidth - 0.5), 0.3, z);
                group.add(light);
            }
        });

        // Lightning bolt signs on sides
        [-1, 1].forEach(side => {
            const signGeom = new THREE.PlaneGeometry(2, 2);
            const signCanvas = document.createElement('canvas');
            signCanvas.width = 64;
            signCanvas.height = 64;
            const signCtx = signCanvas.getContext('2d');

            // Yellow background
            signCtx.fillStyle = '#ffcc00';
            signCtx.fillRect(0, 0, 64, 64);

            // Lightning bolt
            signCtx.fillStyle = '#000';
            signCtx.beginPath();
            signCtx.moveTo(38, 5);
            signCtx.lineTo(20, 30);
            signCtx.lineTo(30, 30);
            signCtx.lineTo(26, 59);
            signCtx.lineTo(44, 34);
            signCtx.lineTo(34, 34);
            signCtx.closePath();
            signCtx.fill();

            const signTex = new THREE.CanvasTexture(signCanvas);
            const signMat = new THREE.MeshBasicMaterial({ map: signTex });
            const sign = new THREE.Mesh(signGeom, signMat);
            sign.position.set(side * (PHYSICS.trackWidth + 0.5), 1.5, length / 2);
            sign.rotation.y = -side * 0.3;
            group.add(sign);
        });

        const boostWallColor = getSequenceColor(colorIndex);
        addWallsToStraight(group, length, width, boostWallColor);


        group.userData.obstacleZone = {
            type: 'boost',
            start: 1,
            end: length - 1
        };
    }

    return group;
}

function createLoopPiece(def, isPreview = false, colorIndex = 0) {
    const group = new THREE.Group();
    const width = PHYSICS.trackWidth * 2;
    const length = def.length;
    const R = def.loopRadius || PHYSICS.loopRadius;
    const loopBottomZ = length / 2;
    const loopCenterY = R + 0.5;
    const loopCenterZ = loopBottomZ;
    const pieceColor = isPreview ? 0x666666 : getSequenceColor(colorIndex);

    function addModel(gltfData) {
        const model = gltfData.scene.clone();
        stripNonMeshNodes(model);
        fitModelToTrack(model, width, length);

        model.traverse(child => {
            if (child.isMesh) {
                child.material = child.material.clone();
                child.receiveShadow = true;
                child.castShadow = true;
                tameModelMaterial(child.material);
                child.material.color.setHex(pieceColor);

                if (isPreview) {
                    child.material.transparent = true;
                    child.material.opacity = 0.7;
                } else {
                    pieceMaterials.add(child.material);
                }
            }
        });

        group.add(model);
    }

    const gltfData = trackModelCache['loop-placed'];
    if (gltfData) {
        addModel(gltfData);
    } else {
        preloadTrackModels(() => {
            const data = trackModelCache['loop-placed'];
            if (data) addModel(data);
        });
    }

    if (!isPreview) {
        group.userData.obstacleZone = {
            type: 'loop',
            start: 0,
            end: length,
            loopCenter: new THREE.Vector3(0, loopCenterY, loopCenterZ),
            loopRadius: R,
            loopBottomZ: loopBottomZ
        };
    }

    return group;
}

// Get ramp model variant key based on adjacency
function getRampModelKey(rampVariant) {
    switch (rampVariant) {
        case 'connected-bottom': return 'ramp-connected-bottom';
        case 'connected-top': return 'ramp-connected-top';
        case 'connected': return 'ramp-connected';
        default: return 'ramp-single';
    }
}

function createRampPiece(def, isPreview = false, colorIndex = 0, rampVariant = 'single') {
    const group = new THREE.Group();
    const width = PHYSICS.trackWidth * 2;
    const length = def.length;
    const heightDelta = ELEVATION.HEIGHT_PER_LEVEL * (def.elevationDelta || 1);
    const pieceColor = isPreview ? 0x666666 : getSequenceColor(colorIndex);

    const modelKey = getRampModelKey(rampVariant);

    function addModel(gltfData) {
        const model = gltfData.scene.clone();
        stripNonMeshNodes(model);
        fitModelToTrack(model, width, length);

        model.traverse(child => {
            if (child.isMesh) {
                child.material = child.material.clone();
                child.receiveShadow = true;
                child.castShadow = true;
                tameModelMaterial(child.material);
                child.material.color.setHex(pieceColor);

                if (isPreview) {
                    child.material.transparent = true;
                    child.material.opacity = 0.7;
                } else {
                    pieceMaterials.add(child.material);
                }
            }
        });

        group.add(model);
    }

    const gltfData = trackModelCache[modelKey];
    if (gltfData) {
        addModel(gltfData);
    } else {
        preloadTrackModels(() => {
            const data = trackModelCache[modelKey];
            if (data) addModel(data);
        });
    }

    if (!isPreview) {
        group.userData.obstacleZone = {
            type: 'ramp',
            heightDelta: heightDelta,
            length: length
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
    'boost-pad': createBoostPadPiece,
    'loop': createLoopPiece,
    'ramp': createRampPiece,
    'ramp-steep': createRampPiece
};

export const PIECE_DEFS = {};
for (const [key, data] of Object.entries(PIECE_DATA)) {
    PIECE_DEFS[key] = { ...data, createMesh: meshCreators[key] };
}

// Update all tracked materials when theme changes
function updatePieceMaterialsTheme() {
    pieceMaterials.forEach(mat => {
        if (mat.userData.themeKey) {
            const themeData = getThemeObject(mat.userData.themeKey);
            if (themeData) {
                if (typeof themeData === 'object' && themeData.color !== undefined) {
                    mat.color.setHex(themeData.color);
                    if (themeData.roughness !== undefined) mat.roughness = themeData.roughness;
                    if (themeData.emissive !== undefined) mat.emissive.setHex(themeData.emissive);
                    if (themeData.emissiveIntensity !== undefined) mat.emissiveIntensity = themeData.emissiveIntensity;
                } else {
                    mat.color.setHex(themeData);
                }
            }
        }
    });
}

// Subscribe to theme changes
onThemeChange(() => {
    updatePieceMaterialsTheme();
});
