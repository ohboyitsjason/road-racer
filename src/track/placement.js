import * as THREE from 'three';
import * as state from '../state.js';
import { scene, raycaster, mouseVec, groundPlane, camera } from '../scene.js';
import { PIECE_DEFS } from './pieces.js';

// Calculate piece endpoint (position and heading at the end of a placed piece)
export function getPieceEndpoint(piece) {
    const def = PIECE_DEFS[piece.type];
    let endPos = new THREE.Vector3();
    let endHeading = piece.heading;

    if (def.curveAngle > 0) {
        const angle = def.curveAngle;
        const radius = def.curveRadius;
        const dir = def.direction;

        if (dir > 0) {
            endPos.x = radius * (Math.cos(angle) - 1);
            endPos.z = radius * Math.sin(angle);
        } else {
            endPos.x = radius * (1 - Math.cos(angle));
            endPos.z = radius * Math.sin(angle);
        }
        endHeading -= angle * dir;
    } else {
        endPos.z = def.length;
    }

    endPos.applyAxisAngle(new THREE.Vector3(0, 1, 0), piece.heading);
    endPos.add(piece.position);

    return { position: endPos, heading: endHeading };
}

// Get the local endpoint of a piece type (relative to start at origin, heading 0)
export function getLocalEndpoint(pieceType) {
    const def = PIECE_DEFS[pieceType];
    if (!def) return { x: 0, z: 0, heading: 0 };

    let localEndX = 0, localEndZ = 0, localEndHeading = 0;

    if (def.curveAngle > 0) {
        const angle = def.curveAngle;
        const radius = def.curveRadius;
        const dir = def.direction;

        if (dir > 0) {
            localEndX = radius * (Math.cos(angle) - 1);
            localEndZ = radius * Math.sin(angle);
        } else {
            localEndX = radius * (1 - Math.cos(angle));
            localEndZ = radius * Math.sin(angle);
        }
        localEndHeading = -(angle * dir);
    } else {
        localEndZ = def.length;
        localEndHeading = 0;
    }

    return { x: localEndX, z: localEndZ, heading: localEndHeading };
}

// Calculate placement so piece's END meets a target connection point
export function calcPlacementForEndAtTarget(targetPos, targetHeading, pieceType) {
    const localEnd = getLocalEndpoint(pieceType);
    const pieceHeading = targetHeading - localEnd.heading;
    const rotatedEnd = new THREE.Vector3(localEnd.x, 0, localEnd.z);
    rotatedEnd.applyAxisAngle(new THREE.Vector3(0, 1, 0), pieceHeading);
    const piecePosition = targetPos.clone().sub(rotatedEnd);
    return { position: piecePosition, heading: pieceHeading };
}

// Get both endpoints of a piece (start and end)
export function getPieceEndpoints(piece) {
    const startPos = piece.position.clone();
    const startHeading = piece.heading;
    const end = getPieceEndpoint(piece);
    return {
        start: { position: startPos, heading: startHeading },
        end: { position: end.position, heading: end.heading }
    };
}

// Check if a placement would overlap with existing pieces
export function checkPlacementValid(position, heading, pieceType, connectingTo = null) {
    const def = PIECE_DEFS[pieceType];
    if (!def) return false;

    if (state.placedPieces.length === 0) return true;

    const newStart = position.clone();
    const localEnd = getLocalEndpoint(pieceType);
    const rotatedEnd = new THREE.Vector3(localEnd.x, 0, localEnd.z);
    rotatedEnd.applyAxisAngle(new THREE.Vector3(0, 1, 0), heading);
    const newEnd = position.clone().add(rotatedEnd);
    const newMid = newStart.clone().add(newEnd).multiplyScalar(0.5);

    for (const piece of state.placedPieces) {
        if (connectingTo && piece === connectingTo) continue;

        const existingStart = piece.position.clone();
        const existingEndpoint = getPieceEndpoint(piece);
        const existingEnd = existingEndpoint.position;
        const existingMid = existingStart.clone().add(existingEnd).multiplyScalar(0.5);

        const startToStart = newStart.distanceTo(existingStart);
        const startToEnd = newStart.distanceTo(existingEnd);
        const endToStart = newEnd.distanceTo(existingStart);
        const endToEnd = newEnd.distanceTo(existingEnd);
        const midToMid = newMid.distanceTo(existingMid);

        const connectionThreshold = 5;
        const hasValidConnection =
            startToStart < connectionThreshold ||
            startToEnd < connectionThreshold ||
            endToStart < connectionThreshold ||
            endToEnd < connectionThreshold;

        if (hasValidConnection) continue;

        const overlapThreshold = 18;
        if (midToMid < overlapThreshold) {
            return false;
        }
    }

    return true;
}

// Find which endpoints are already connected
export function getConnectedEndpoints() {
    const connectedPoints = new Map();
    const connectionThreshold = 5;

    for (let i = 0; i < state.placedPieces.length; i++) {
        connectedPoints.set(i, { startConnected: false, endConnected: false });
    }

    for (let i = 0; i < state.placedPieces.length; i++) {
        const pieceA = state.placedPieces[i];
        const endpointsA = getPieceEndpoints(pieceA);

        for (let j = i + 1; j < state.placedPieces.length; j++) {
            const pieceB = state.placedPieces[j];
            const endpointsB = getPieceEndpoints(pieceB);

            if (endpointsA.start.position.distanceTo(endpointsB.start.position) < connectionThreshold) {
                connectedPoints.get(i).startConnected = true;
                connectedPoints.get(j).startConnected = true;
            }
            if (endpointsA.start.position.distanceTo(endpointsB.end.position) < connectionThreshold) {
                connectedPoints.get(i).startConnected = true;
                connectedPoints.get(j).endConnected = true;
            }
            if (endpointsA.end.position.distanceTo(endpointsB.start.position) < connectionThreshold) {
                connectedPoints.get(i).endConnected = true;
                connectedPoints.get(j).startConnected = true;
            }
            if (endpointsA.end.position.distanceTo(endpointsB.end.position) < connectionThreshold) {
                connectedPoints.get(i).endConnected = true;
                connectedPoints.get(j).endConnected = true;
            }
        }
    }

    return connectedPoints;
}

// Compute rotated local end offset for a given heading
function computeRotatedEnd(pieceType, heading) {
    const localEnd = getLocalEndpoint(pieceType);
    const rotEnd = new THREE.Vector3(localEnd.x, 0, localEnd.z);
    rotEnd.applyAxisAngle(new THREE.Vector3(0, 1, 0), heading);
    return rotEnd;
}

// Find snap point for connecting pieces (auto-orients to track direction)
export function findSnapPoint(mousePos, userRotation) {
    const snapDistance = 25;
    const allSnaps = [];

    if (!state.dragPieceType) return null;

    const localEnd = getLocalEndpoint(state.dragPieceType);
    const connectedPoints = getConnectedEndpoints();

    for (let i = 0; i < state.placedPieces.length; i++) {
        const piece = state.placedPieces[i];
        const theirEndpoints = getPieceEndpoints(piece);
        const connected = connectedPoints.get(i) || { startConnected: false, endConnected: false };

        // Check mouse near THEIR END
        if (!connected.endConnected) {
            const dist = mousePos.distanceTo(theirEndpoints.end.position);
            if (dist < snapDistance) {
                // OUR START to THEIR END: continue track in same direction
                const headingAB = theirEndpoints.end.heading;
                allSnaps.push({
                    position: theirEndpoints.end.position.clone(),
                    heading: headingAB,
                    type: 'our-start-to-their-end',
                    distance: dist,
                    piece: piece
                });

                // OUR END to THEIR END: our piece curves back from their end
                const headingBB = theirEndpoints.end.heading + Math.PI - localEnd.heading;
                const rotEndBB = computeRotatedEnd(state.dragPieceType, headingBB);
                allSnaps.push({
                    position: theirEndpoints.end.position.clone().sub(rotEndBB),
                    heading: headingBB,
                    type: 'our-end-to-their-end',
                    distance: dist,
                    piece: piece
                });
            }
        }

        // Check mouse near THEIR START
        if (!connected.startConnected) {
            const dist = mousePos.distanceTo(theirEndpoints.start.position);
            if (dist < snapDistance) {
                // OUR END to THEIR START: our end meets their start
                const headingBA = theirEndpoints.start.heading - localEnd.heading;
                const rotEndBA = computeRotatedEnd(state.dragPieceType, headingBA);
                allSnaps.push({
                    position: theirEndpoints.start.position.clone().sub(rotEndBA),
                    heading: headingBA,
                    type: 'our-end-to-their-start',
                    distance: dist,
                    piece: piece
                });

                // OUR START to THEIR START: our piece faces opposite direction
                const headingAA = theirEndpoints.start.heading + Math.PI;
                allSnaps.push({
                    position: theirEndpoints.start.position.clone(),
                    heading: headingAA,
                    type: 'our-start-to-their-start',
                    distance: dist,
                    piece: piece
                });
            }
        }
    }

    const validSnaps = allSnaps.filter(snap =>
        checkPlacementValid(snap.position, snap.heading, state.dragPieceType, snap.piece)
    );

    if (validSnaps.length === 0) return null;

    // Separate into natural-flow (A→B, B→A) and same-end (A→A, B→B)
    const isNatural = s => s.type === 'our-start-to-their-end' || s.type === 'our-end-to-their-start';

    // Check if user rotation strongly favors a same-end connection
    const angleDiff = (a, b) => Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)));

    validSnaps.sort((a, b) => {
        // Different endpoints: prefer closer one
        const distDiff = a.distance - b.distance;
        if (Math.abs(distDiff) > 1) return distDiff;

        // Same endpoint: prefer natural unless user rotation is within π/4 of same-end heading
        const aNatural = isNatural(a);
        const bNatural = isNatural(b);

        if (aNatural && !bNatural) {
            // a is natural, b is same-end: only let b win if user is very close to b's heading
            return angleDiff(b.heading, userRotation) < Math.PI / 4 ? 1 : -1;
        }
        if (!aNatural && bNatural) {
            return angleDiff(a.heading, userRotation) < Math.PI / 4 ? -1 : 1;
        }

        // Both same category: prefer closer to user rotation
        return angleDiff(a.heading, userRotation) - angleDiff(b.heading, userRotation);
    });

    const bestSnap = validSnaps[0];
    bestSnap.valid = true;
    return bestSnap;
}

export function snapToGrid(position, gridSize = 5) {
    return new THREE.Vector3(
        Math.round(position.x / gridSize) * gridSize,
        position.y,
        Math.round(position.z / gridSize) * gridSize
    );
}

export function getWorldPositionFromMouse(clientX, clientY) {
    mouseVec.x = (clientX / window.innerWidth) * 2 - 1;
    mouseVec.y = -(clientY / window.innerHeight) * 2 + 1;

    raycaster.setFromCamera(mouseVec, camera);
    const intersectPoint = new THREE.Vector3();
    raycaster.ray.intersectPlane(groundPlane, intersectPoint);

    return intersectPoint;
}

// Place a track piece (legacy - for delete button)
export function placePiece(type) {
    if (type === 'delete') {
        if (state.placedPieces.length > 0) {
            const removed = state.placedPieces.pop();
            scene.remove(removed.mesh);
            state.trackElements.splice(state.trackElements.indexOf(removed.mesh), 1);
            removeEndpointMarkers(removed);
            if (removed.type === 'start') state.setHasStart(false);
        }
        return;
    }
}

// Create a small sphere marker for endpoint debugging
function createEndpointMarker(color) {
    const geo = new THREE.SphereGeometry(1.2, 12, 12);
    const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.85 });
    const sphere = new THREE.Mesh(geo, mat);
    sphere.userData.isEndpointMarker = true;
    return sphere;
}

// Add endpoint markers to a placed piece
function addEndpointMarkers(piece) {
    const startMarker = createEndpointMarker(0x00ff00); // green = start
    startMarker.position.copy(piece.position);
    startMarker.position.y = 1.5;
    scene.add(startMarker);

    const end = getPieceEndpoint(piece);
    const endMarker = createEndpointMarker(0xff4444); // red = end
    endMarker.position.copy(end.position);
    endMarker.position.y = 1.5;
    scene.add(endMarker);

    piece.endpointMarkers = [startMarker, endMarker];
}

// Remove endpoint markers from a piece
export function removeEndpointMarkers(piece) {
    if (piece.endpointMarkers) {
        piece.endpointMarkers.forEach(m => scene.remove(m));
        piece.endpointMarkers = null;
    }
}

// Place a track piece at a specific position and heading
// NOTE: Callers must call updateTrackStatus() after this function
export function placePieceAt(type, position, heading) {
    const def = PIECE_DEFS[type];
    if (!def) return;

    if (def.isStart && state.hasStart) {
        return;
    }

    const mesh = def.createMesh(def, false);
    mesh.position.copy(position);
    mesh.rotation.y = heading;
    scene.add(mesh);

    const piece = {
        type: type,
        mesh: mesh,
        position: position.clone(),
        heading: heading,
        def: def
    };

    state.placedPieces.push(piece);
    state.trackElements.push(mesh);

    if (def.isStart) state.setHasStart(true);
    if (mesh.userData.obstacleZone) {
        state.obstacleZones.push({
            ...mesh.userData.obstacleZone,
            position: position.clone(),
            heading: heading,
            pieceIndex: state.placedPieces.length - 1
        });
    }

    addEndpointMarkers(piece);
}
