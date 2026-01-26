import * as THREE from 'three';
import * as state from '../state.js';
import { scene } from '../scene.js';
import { getPieceEndpoint, getPieceEndpoints, removeEndpointMarkers } from './placement.js';
import { PIECE_DEFS } from './pieces.js';
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
    const resolution = 10;

    const connections = buildConnectionMap();
    const result = traverseTrack(connections);
    if (!result || result.ordered.length === 0) return;

    const points = [];

    result.ordered.forEach(({ piece, reversed }) => {
        const piecePoints = generatePiecePoints(piece, resolution);
        if (reversed) piecePoints.reverse();
        points.push(...piecePoints);
    });

    if (points.length > 0) {
        state.setRoadCurve(new THREE.CatmullRomCurve3(points));
        state.roadCurve.closed = true;
    }
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
