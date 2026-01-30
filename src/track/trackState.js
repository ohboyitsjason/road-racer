import * as THREE from 'three';
import * as state from '../state.js';
import { scene } from '../scene.js';
import { getPieceEndpoint, getPieceEndpoints, removeEndpointMarkers } from './placement.js';
import { PIECE_DEFS } from './pieces.js';
import { PHYSICS } from '../constants.js';
import { poofParticles } from '../effects/particles.js';

// Build a connection map that tracks which endpoint connects to which
function buildConnectionMap() {
    const snapDistance = 8;
    const connections = state.placedPieces.map(() => ({
        startConnectedTo: null, // { index, endpoint }
        endConnectedTo: null    // { index, endpoint }
    }));

    for (let i = 0; i < state.placedPieces.length; i++) {
        const endpointsA = getPieceEndpoints(state.placedPieces[i]);

        for (let j = i + 1; j < state.placedPieces.length; j++) {
            const endpointsB = getPieceEndpoints(state.placedPieces[j]);

            // A.end <-> B.start
            if (endpointsA.end.position.distanceTo(endpointsB.start.position) < snapDistance) {
                connections[i].endConnectedTo = { index: j, endpoint: 'start' };
                connections[j].startConnectedTo = { index: i, endpoint: 'end' };
            }
            // A.end <-> B.end
            if (endpointsA.end.position.distanceTo(endpointsB.end.position) < snapDistance) {
                connections[i].endConnectedTo = { index: j, endpoint: 'end' };
                connections[j].endConnectedTo = { index: i, endpoint: 'end' };
            }
            // A.start <-> B.start
            if (endpointsA.start.position.distanceTo(endpointsB.start.position) < snapDistance) {
                connections[i].startConnectedTo = { index: j, endpoint: 'start' };
                connections[j].startConnectedTo = { index: i, endpoint: 'start' };
            }
            // A.start <-> B.end
            if (endpointsA.start.position.distanceTo(endpointsB.end.position) < snapDistance) {
                connections[i].startConnectedTo = { index: j, endpoint: 'end' };
                connections[j].endConnectedTo = { index: i, endpoint: 'start' };
            }
        }
    }

    return connections;
}

// Traverse the track from the start piece, returning ordered pieces with direction
// Each entry: { piece, reversed } where reversed means entered through end
function traverseTrack(connections) {
    const startPieceIndex = state.placedPieces.findIndex(p => p.type === 'start');
    if (startPieceIndex === -1) return null;

    const ordered = [];
    const visited = new Set();
    let current = startPieceIndex;
    let enteringThrough = 'start';

    while (!visited.has(current)) {
        visited.add(current);
        const reversed = enteringThrough === 'end';
        ordered.push({ piece: state.placedPieces[current], reversed });

        const exitEndpoint = reversed ? 'start' : 'end';
        const connection = exitEndpoint === 'end'
            ? connections[current].endConnectedTo
            : connections[current].startConnectedTo;

        if (!connection) return { ordered, closed: false };

        if (connection.index === startPieceIndex && visited.size >= 3) {
            return { ordered, closed: true };
        }

        current = connection.index;
        enteringThrough = connection.endpoint;
    }

    return { ordered, closed: false };
}

// Check if track forms a closed loop
export function checkTrackClosed() {
    if (state.placedPieces.length < 3 || !state.hasStart) return false;

    const connections = buildConnectionMap();
    const result = traverseTrack(connections);
    return result ? result.closed : false;
}

// Update track status display
export function updateTrackStatus() {
    state.setTrackClosed(checkTrackClosed());
    const statusEl = document.getElementById('track-status');
    statusEl.textContent = `Pieces: ${state.placedPieces.length} | Track: ${state.trackClosed ? 'Closed Loop \u2713' : 'Open'}${state.hasStart ? '' : ' | Need Start'}`;
    statusEl.className = state.trackClosed && state.hasStart ? 'valid' : 'invalid';
    document.getElementById('race-btn').disabled = !(state.trackClosed && state.hasStart);
}

// Generate curve points for a single piece (start to end order)
function generatePiecePoints(piece, resolution) {
    const def = piece.def;
    const piecePoints = [];

    if (def.curveAngle > 0) {
        const radius = def.curveRadius;
        const angle = def.curveAngle;
        const dir = def.direction;

        for (let i = 0; i <= resolution; i++) {
            const a = (i / resolution) * angle;
            let localX, localZ;

            if (dir > 0) {
                localX = -radius + radius * Math.cos(a);
                localZ = radius * Math.sin(a);
            } else {
                localX = radius - radius * Math.cos(a);
                localZ = radius * Math.sin(a);
            }

            const point = new THREE.Vector3(localX, 0.1, localZ);
            point.applyAxisAngle(new THREE.Vector3(0, 1, 0), piece.heading);
            point.add(piece.position);
            piecePoints.push(point);
        }
    } else {
        for (let i = 0; i <= resolution; i++) {
            const localZ = (i / resolution) * def.length;
            const point = new THREE.Vector3(0, 0.1, localZ);
            point.applyAxisAngle(new THREE.Vector3(0, 1, 0), piece.heading);
            point.add(piece.position);
            piecePoints.push(point);
        }
    }

    return piecePoints;
}

// Build the road curve for racing
export function buildRoadCurve() {
    const resolution = 20; // Higher resolution for smoother curves

    const connections = buildConnectionMap();
    const result = traverseTrack(connections);
    if (!result || result.ordered.length === 0) return;

    const points = [];

    result.ordered.forEach(({ piece, reversed }, index) => {
        const piecePoints = generatePiecePoints(piece, resolution);
        if (reversed) piecePoints.reverse();

        // Skip first point of each piece after the first to avoid duplicates at seams
        const startIndex = (index === 0) ? 0 : 1;
        for (let i = startIndex; i < piecePoints.length; i++) {
            points.push(piecePoints[i]);
        }
    });

    if (points.length > 0) {
        // Use centripetal CatmullRom for smoother interpolation
        state.setRoadCurve(new THREE.CatmullRomCurve3(points, true, 'centripetal', 0.5));
    }

    // Update banked curve connections for smooth transitions
    updateBankedCurveConnections(result.ordered);
}

// Update banked curve obstacle zones based on adjacent pieces
function updateBankedCurveConnections(orderedPieces) {
    const numPieces = orderedPieces.length;

    orderedPieces.forEach(({ piece, reversed }, index) => {
        // Find the obstacle zone for this piece
        const pieceIndex = state.placedPieces.indexOf(piece);
        const zone = state.obstacleZones.find(z => z.pieceIndex === pieceIndex);

        if (!zone || zone.type !== 'banked') return;

        // Get previous and next pieces (wrapping for closed loop)
        const prevIndex = (index - 1 + numPieces) % numPieces;
        const nextIndex = (index + 1) % numPieces;
        const prevPiece = orderedPieces[prevIndex].piece;
        const nextPiece = orderedPieces[nextIndex].piece;

        // Check if adjacent pieces are also banked
        const prevIsBanked = prevPiece.type === 'curve-banked';
        const nextIsBanked = nextPiece.type === 'curve-banked';

        // Determine which end connects to which based on reversed flag
        // If not reversed: entry = start of piece, exit = end of piece
        // If reversed: entry = end of piece, exit = start of piece
        if (reversed) {
            zone.entryTransition = !nextIsBanked;
            zone.exitTransition = !prevIsBanked;
        } else {
            zone.entryTransition = !prevIsBanked;
            zone.exitTransition = !nextIsBanked;
        }

        // Rebuild the banked curve mesh with updated transitions
        rebuildBankedCurveMesh(piece, pieceIndex, zone);
    });
}

// Rebuild a banked curve mesh with correct transitions
function rebuildBankedCurveMesh(piece, pieceIndex, zone) {
    const oldMesh = state.trackElements[pieceIndex];
    if (!oldMesh) return;

    // Remove old mesh
    scene.remove(oldMesh);

    // Create new mesh with updated transitions
    const def = piece.def;
    const group = createBankedCurveWithTransitions(def, zone.entryTransition, zone.exitTransition);
    group.position.copy(piece.position);
    group.rotation.y = piece.heading;
    scene.add(group);

    // Update reference
    state.trackElements[pieceIndex] = group;
}

// Smootherstep function for extra smooth transitions
function smootherstep(t) {
    return t * t * t * (t * (t * 6 - 15) + 10);
}

// Create banked curve with configurable transitions
function createBankedCurveWithTransitions(def, entryTransition, exitTransition) {
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
    // Larger transition for 90° curves, smaller for 180° (keeps arc length similar)
    const transitionLength = angle > Math.PI / 2 ? 0.2 : 0.35;

    const vertices = [];
    const indices = [];

    for (let i = 0; i <= segments; i++) {
        const t = i / segments;
        const a = t * angle;

        // Calculate banking with configurable transitions using smootherstep
        let bankFactor = 1;
        if (entryTransition && t < transitionLength) {
            const tt = t / transitionLength;
            bankFactor = smootherstep(tt);
        } else if (exitTransition && t > 1 - transitionLength) {
            const tt = (1 - t) / transitionLength;
            bankFactor = smootherstep(tt);
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
        color: 0x444455,
        side: THREE.DoubleSide
    });
    const road = new THREE.Mesh(roadGeom, roadMat);
    road.position.y = 0.15;
    road.receiveShadow = true;
    group.add(road);

    // Add outer wall with matching transitions
    const wallSegments = 16;
    const wallOffset = 1.2;

    for (let i = 0; i < wallSegments; i++) {
        const t = (i + 0.5) / wallSegments;
        const a = t * angle;

        let bankFactor = 1;
        if (entryTransition && t < transitionLength) {
            const tt = t / transitionLength;
            bankFactor = tt * tt * (3 - 2 * tt);
        } else if (exitTransition && t > 1 - transitionLength) {
            const tt = (1 - t) / transitionLength;
            bankFactor = tt * tt * (3 - 2 * tt);
        }

        const currentBankAngle = maxBankAngle * bankFactor;
        const wallHeight = Math.sin(currentBankAngle) * width;

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

    return group;
}

// Clear all track elements
export function clearTrack() {
    state.placedPieces.forEach(p => removeEndpointMarkers(p));
    state.trackElements.forEach(el => scene.remove(el));
    state.trackElements.length = 0;
    state.placedPieces.length = 0;
    state.obstacleZones.length = 0;
    state.setHasStart(false);
    state.setTrackClosed(false);
    state.setRoadCurve(null);

    poofParticles.forEach(p => {
        scene.remove(p);
        p.geometry.dispose();
        p.material.dispose();
    });
    poofParticles.length = 0;

    if (state.car) { scene.remove(state.car); state.setCar(null); }
    state.aiCars.forEach(ai => scene.remove(ai.mesh));
    state.aiCars.length = 0;

    state.grandstands.forEach(g => scene.remove(g));
    state.grandstands.length = 0;

    updateTrackStatus();
}
