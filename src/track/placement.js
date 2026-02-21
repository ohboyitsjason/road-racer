import * as THREE from 'three';
import * as state from '../state.js';
import { scene, raycaster, mouseVec, groundPlane, camera } from '../scene.js';
import { PIECE_DEFS } from './pieces.js';
import { DECORATION_DATA, PIECE_DATA, PHYSICS, ELEVATION } from '../constants.js';
import { obstacles } from '../obstacles/obstacleState.js';
import { getRugBounds } from '../effects/bedroom.js';

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

    // Calculate end elevation
    const pieceElevation = piece.elevation || 0;
    const elevationDelta = def.elevationDelta || 0;
    const endElevation = pieceElevation + elevationDelta;
    endPos.y = endElevation * ELEVATION.HEIGHT_PER_LEVEL;

    return { position: endPos, heading: endHeading, elevation: endElevation };
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
    const startElevation = piece.elevation || 0;
    startPos.y = startElevation * ELEVATION.HEIGHT_PER_LEVEL;
    const end = getPieceEndpoint(piece);
    return {
        start: { position: startPos, heading: startHeading, elevation: startElevation },
        end: { position: end.position, heading: end.heading, elevation: end.elevation }
    };
}

// Check if a placement would overlap with existing pieces or decorations
export function checkPlacementValid(position, heading, pieceType, connectingTo = null, elevation = 0) {
    const def = PIECE_DEFS[pieceType];
    if (!def) return false;

    // Reject placement outside rug bounds (pastel theme)
    const rug = getRugBounds();
    if (rug) {
        if (position.x < rug.minX || position.x > rug.maxX ||
            position.z < rug.minZ || position.z > rug.maxZ) {
            return false;
        }
    }

    const newStart = position.clone();
    const localEnd = getLocalEndpoint(pieceType);
    const rotatedEnd = new THREE.Vector3(localEnd.x, 0, localEnd.z);
    rotatedEnd.applyAxisAngle(new THREE.Vector3(0, 1, 0), heading);
    const newEnd = position.clone().add(rotatedEnd);
    const newMid = newStart.clone().add(newEnd).multiplyScalar(0.5);

    const newElevation = elevation;
    const newEndElevation = newElevation + (def.elevationDelta || 0);

    // Check against existing track pieces
    for (const piece of state.placedPieces) {
        if (connectingTo && piece === connectingTo) continue;

        // Skip overlap check for pieces at different elevation levels (allow crossovers)
        const pieceElev = piece.elevation || 0;
        const pieceDef = PIECE_DEFS[piece.type];
        const pieceEndElev = pieceElev + (pieceDef ? (pieceDef.elevationDelta || 0) : 0);
        // If both start and end elevations differ, pieces can cross over
        if (Math.abs(pieceElev - newElevation) >= 1 && Math.abs(pieceEndElev - newEndElevation) >= 1) continue;

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

    // Check against decorations
    if (state.placedDecorations && state.placedDecorations.length > 0) {
        const pieceData = PIECE_DATA[pieceType];
        if (pieceData) {
            // Get track piece bounding box
            let pieceWidth = 10; // Track width
            let pieceLength = pieceData.length || (pieceData.curveRadius * pieceData.curveAngle);

            // For curves, use a larger bounding area
            if (pieceData.curveAngle > 0) {
                pieceLength = pieceData.curveRadius * 2;
                pieceWidth = pieceData.curveRadius * 2;
            }

            const pHalfW = pieceWidth / 2 + 5;
            const pHalfL = pieceLength / 2 + 5;
            const pCos = Math.cos(heading);
            const pSin = Math.sin(heading);

            // Calculate piece center
            let pieceCenterX = position.x;
            let pieceCenterZ = position.z;

            if (pieceData.curveAngle > 0) {
                const r = pieceData.curveRadius;
                const dir = pieceData.direction;
                if (dir > 0) {
                    pieceCenterX = position.x + (-r * pCos);
                    pieceCenterZ = position.z + (-r * pSin);
                } else {
                    pieceCenterX = position.x + (r * pCos);
                    pieceCenterZ = position.z + (r * pSin);
                }
            } else {
                pieceCenterX = position.x + pSin * (pieceLength / 2);
                pieceCenterZ = position.z + pCos * (pieceLength / 2);
            }

            const pieceCorners = [
                new THREE.Vector2(pieceCenterX + (-pHalfW * pCos - (-pHalfL) * pSin), pieceCenterZ + (-pHalfW * pSin + (-pHalfL) * pCos)),
                new THREE.Vector2(pieceCenterX + (pHalfW * pCos - (-pHalfL) * pSin), pieceCenterZ + (pHalfW * pSin + (-pHalfL) * pCos)),
                new THREE.Vector2(pieceCenterX + (pHalfW * pCos - pHalfL * pSin), pieceCenterZ + (pHalfW * pSin + pHalfL * pCos)),
                new THREE.Vector2(pieceCenterX + (-pHalfW * pCos - pHalfL * pSin), pieceCenterZ + (-pHalfW * pSin + pHalfL * pCos))
            ];

            for (const deco of state.placedDecorations) {
                const decoData = DECORATION_DATA[deco.type];
                if (!decoData) continue;

                const dHalfW = decoData.width / 2;
                const dHalfD = decoData.depth / 2;
                const dCos = Math.cos(deco.heading);
                const dSin = Math.sin(deco.heading);

                const decoCorners = [
                    new THREE.Vector2(deco.position.x + (-dHalfW * dCos - (-dHalfD) * dSin), deco.position.z + (-dHalfW * dSin + (-dHalfD) * dCos)),
                    new THREE.Vector2(deco.position.x + (dHalfW * dCos - (-dHalfD) * dSin), deco.position.z + (dHalfW * dSin + (-dHalfD) * dCos)),
                    new THREE.Vector2(deco.position.x + (dHalfW * dCos - dHalfD * dSin), deco.position.z + (dHalfW * dSin + dHalfD * dCos)),
                    new THREE.Vector2(deco.position.x + (-dHalfW * dCos - dHalfD * dSin), deco.position.z + (-dHalfW * dSin + dHalfD * dCos))
                ];

                if (polygonsOverlap(pieceCorners, decoCorners)) {
                    return false;
                }
            }
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

    const ourDelta = PIECE_DEFS[state.dragPieceType] ? (PIECE_DEFS[state.dragPieceType].elevationDelta || 0) : 0;

    for (let i = 0; i < state.placedPieces.length; i++) {
        const piece = state.placedPieces[i];
        const theirEndpoints = getPieceEndpoints(piece);
        const connected = connectedPoints.get(i) || { startConnected: false, endConnected: false };

        // Check mouse near THEIR END (use XZ distance for snap detection so elevation doesn't interfere)
        if (!connected.endConnected) {
            const dist2D = new THREE.Vector2(mousePos.x - theirEndpoints.end.position.x, mousePos.z - theirEndpoints.end.position.z).length();
            if (dist2D < snapDistance) {
                // OUR START to THEIR END: our elevation = their end elevation
                const elevAB = theirEndpoints.end.elevation;
                const endElevAB = elevAB + ourDelta;
                if (elevAB >= ELEVATION.MIN_LEVEL && elevAB <= ELEVATION.MAX_LEVEL &&
                    endElevAB >= ELEVATION.MIN_LEVEL && endElevAB <= ELEVATION.MAX_LEVEL) {
                    const headingAB = theirEndpoints.end.heading;
                    const posAB = theirEndpoints.end.position.clone();
                    posAB.y = elevAB * ELEVATION.HEIGHT_PER_LEVEL;
                    allSnaps.push({
                        position: posAB,
                        heading: headingAB,
                        type: 'our-start-to-their-end',
                        distance: dist2D,
                        piece: piece,
                        elevation: elevAB
                    });
                }

                // OUR END to THEIR END: our end elevation = their end elevation, so our start = their end - delta
                const elevBB = theirEndpoints.end.elevation - ourDelta;
                if (elevBB >= ELEVATION.MIN_LEVEL && elevBB <= ELEVATION.MAX_LEVEL &&
                    theirEndpoints.end.elevation >= ELEVATION.MIN_LEVEL && theirEndpoints.end.elevation <= ELEVATION.MAX_LEVEL) {
                    const headingBB = theirEndpoints.end.heading + Math.PI - localEnd.heading;
                    const rotEndBB = computeRotatedEnd(state.dragPieceType, headingBB);
                    const posBB = theirEndpoints.end.position.clone().sub(rotEndBB);
                    posBB.y = elevBB * ELEVATION.HEIGHT_PER_LEVEL;
                    allSnaps.push({
                        position: posBB,
                        heading: headingBB,
                        type: 'our-end-to-their-end',
                        distance: dist2D,
                        piece: piece,
                        elevation: elevBB
                    });
                }
            }
        }

        // Check mouse near THEIR START
        if (!connected.startConnected) {
            const dist2D = new THREE.Vector2(mousePos.x - theirEndpoints.start.position.x, mousePos.z - theirEndpoints.start.position.z).length();
            if (dist2D < snapDistance) {
                // OUR END to THEIR START: our end elevation = their start elevation, so our start = their start - delta
                const elevBA = theirEndpoints.start.elevation - ourDelta;
                if (elevBA >= ELEVATION.MIN_LEVEL && elevBA <= ELEVATION.MAX_LEVEL &&
                    theirEndpoints.start.elevation >= ELEVATION.MIN_LEVEL && theirEndpoints.start.elevation <= ELEVATION.MAX_LEVEL) {
                    const headingBA = theirEndpoints.start.heading - localEnd.heading;
                    const rotEndBA = computeRotatedEnd(state.dragPieceType, headingBA);
                    const posBA = theirEndpoints.start.position.clone().sub(rotEndBA);
                    posBA.y = elevBA * ELEVATION.HEIGHT_PER_LEVEL;
                    allSnaps.push({
                        position: posBA,
                        heading: headingBA,
                        type: 'our-end-to-their-start',
                        distance: dist2D,
                        piece: piece,
                        elevation: elevBA
                    });
                }

                // OUR START to THEIR START: our elevation = their start elevation
                const elevAA = theirEndpoints.start.elevation;
                const endElevAA = elevAA + ourDelta;
                if (elevAA >= ELEVATION.MIN_LEVEL && elevAA <= ELEVATION.MAX_LEVEL &&
                    endElevAA >= ELEVATION.MIN_LEVEL && endElevAA <= ELEVATION.MAX_LEVEL) {
                    const headingAA = theirEndpoints.start.heading + Math.PI;
                    const posAA = theirEndpoints.start.position.clone();
                    posAA.y = elevAA * ELEVATION.HEIGHT_PER_LEVEL;
                    allSnaps.push({
                        position: posAA,
                        heading: headingAA,
                        type: 'our-start-to-their-start',
                        distance: dist2D,
                        piece: piece,
                        elevation: elevAA
                    });
                }
            }
        }
    }

    const validSnaps = allSnaps.filter(snap =>
        checkPlacementValid(snap.position, snap.heading, state.dragPieceType, snap.piece, snap.elevation)
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
// Find the highest track surface Y below a given world position
// Uses local-space footprint check for accuracy
function findTrackFloorBelow(worldX, worldZ, maxY) {
    let floorY = 0;
    const halfWidth = PHYSICS.trackWidth + 2; // Track half-width with small buffer

    for (const piece of state.placedPieces) {
        const pieceElev = (piece.elevation || 0) * ELEVATION.HEIGHT_PER_LEVEL;
        const pieceDef = PIECE_DEFS[piece.type];
        if (!pieceDef) continue;
        const pieceEndElev = pieceElev + (pieceDef.elevationDelta || 0) * ELEVATION.HEIGHT_PER_LEVEL;
        const pieceTopY = Math.max(pieceElev, pieceEndElev);
        // Only consider pieces below our level
        if (pieceTopY >= maxY || pieceTopY <= floorY) continue;

        // Transform world position into piece's local space
        const dx = worldX - piece.position.x;
        const dz = worldZ - piece.position.z;
        const cosH = Math.cos(-piece.heading);
        const sinH = Math.sin(-piece.heading);
        const localX = dx * cosH - dz * sinH;
        const localZ = dx * sinH + dz * cosH;

        if (pieceDef.curveAngle > 0) {
            // For curves, check if point is within the arc's annular sector
            const radius = pieceDef.curveRadius;
            const dir = pieceDef.direction;
            // Center of the curve arc in local space
            const cx = dir > 0 ? -radius : radius;
            const cz = 0;
            const relX = localX - cx;
            const relZ = localZ - cz;
            const dist = Math.sqrt(relX * relX + relZ * relZ);
            const innerR = radius - halfWidth;
            const outerR = radius + halfWidth;
            if (dist < innerR || dist > outerR) continue;
            // Check angle within the arc
            const angle = Math.atan2(relZ, dir > 0 ? relX : -relX);
            if (angle < -0.1 || angle > pieceDef.curveAngle + 0.1) continue;
        } else {
            // For straights/ramps, check rectangular footprint
            const length = pieceDef.length || 20;
            if (localX < -halfWidth || localX > halfWidth) continue;
            if (localZ < -2 || localZ > length + 2) continue;
        }

        floorY = Math.max(floorY, pieceTopY + 0.3);
    }
    return floorY;
}

// Add support pillars under elevated track pieces
// group is the mesh group (local origin at piece start), positioned at worldPosition with worldHeading
function addSupportPillars(group, def, elevation, worldPosition, worldHeading) {
    const elevationY = elevation * ELEVATION.HEIGHT_PER_LEVEL;
    const width = PHYSICS.trackWidth * 2;
    const pillarMat = new THREE.MeshStandardMaterial({ color: 0x888888 });
    const elevDelta = def.elevationDelta || 0;
    const cosH = Math.cos(worldHeading);
    const sinH = Math.sin(worldHeading);

    // Helper: create a pillar at a local XZ position on the piece
    // localSurfaceY = world Y of track surface at this point
    function placePillar(localX, localZ, localSurfaceY) {
        if (localSurfaceY <= 0) return;
        // Convert local position to world XZ for floor detection
        const worldX = worldPosition.x + localX * cosH - localZ * sinH;
        const worldZ = worldPosition.z + localX * sinH + localZ * cosH;
        const floorY = findTrackFloorBelow(worldX, worldZ, localSurfaceY);
        const pillarH = localSurfaceY - floorY;
        if (pillarH <= 0.5) return;

        const pillarGeom = new THREE.CylinderGeometry(0.5, 0.7, pillarH, 6);
        const pillar = new THREE.Mesh(pillarGeom, pillarMat);
        // Group origin is at world Y = elevationY
        // Pillar center in world Y = floorY + pillarH/2 = (floorY + localSurfaceY) / 2
        // In local Y = world Y - elevationY
        pillar.position.set(localX, (floorY + localSurfaceY) / 2 - elevationY, localZ);
        pillar.castShadow = true;
        group.add(pillar);
    }

    if (def.curveAngle > 0) {
        const radius = def.curveRadius;
        const angle = def.curveAngle;
        const dir = def.direction;
        const numPillars = Math.max(2, Math.ceil(angle / (Math.PI / 4)) * 2);

        for (let i = 0; i < numPillars; i++) {
            const t = (i + 0.5) / numPillars;
            const a = t * angle;

            [-1, 1].forEach(side => {
                const r = radius + side * (width / 2 - 1);
                let localX, localZ;
                if (dir > 0) {
                    localX = -radius + r * Math.cos(a);
                    localZ = r * Math.sin(a);
                } else {
                    localX = radius - r * Math.cos(a);
                    localZ = r * Math.sin(a);
                }
                placePillar(localX, localZ, elevationY);
            });
        }
    } else {
        const length = def.length || 20;
        const numPillars = Math.max(2, Math.ceil(length / 15));

        for (let i = 0; i < numPillars; i++) {
            const t = (i + 0.5) / numPillars;
            const localZ = t * length;
            // For ramps, surface Y varies along the slope
            const surfaceWorldY = elevationY + t * elevDelta * ELEVATION.HEIGHT_PER_LEVEL;

            [-1, 1].forEach(side => {
                placePillar(side * (width / 2 - 1), localZ, surfaceWorldY);
            });
        }
    }
}

// Place a track piece at a specific position and heading
// NOTE: Callers must call updateTrackStatus() after this function
export function placePieceAt(type, position, heading, elevation = 0) {
    const def = PIECE_DEFS[type];
    if (!def) return;

    if (def.isStart && state.hasStart) {
        return;
    }

    const elevationY = elevation * ELEVATION.HEIGHT_PER_LEVEL;
    position.y = elevationY;

    const colorIndex = state.placedPieces.length % 3;
    const mesh = def.createMesh(def, false, colorIndex);
    mesh.position.copy(position);
    mesh.rotation.y = heading;

    // Add support pillars for elevated pieces
    if (elevation > 0) {
        addSupportPillars(mesh, def, elevation, position, heading);
    }

    scene.add(mesh);

    const piece = {
        type: type,
        mesh: mesh,
        position: position.clone(),
        heading: heading,
        def: def,
        elevation: elevation,
        colorIndex: colorIndex,
        rampVariant: def.isRamp ? 'single' : undefined
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

    // Debug markers disabled - uncomment to see piece endpoints
    // addEndpointMarkers(piece);
}

// Check if a decoration placement is valid (doesn't overlap with track pieces)
export function checkDecorationPlacementValid(position, heading, decorationType) {
    const decoData = DECORATION_DATA[decorationType];
    if (!decoData) return false;

    const decoWidth = decoData.width;
    const decoDepth = decoData.depth;

    // Get decoration corners (rotated)
    const halfW = decoWidth / 2;
    const halfD = decoDepth / 2;
    const cos = Math.cos(heading);
    const sin = Math.sin(heading);

    const decoCorners = [
        new THREE.Vector2(
            position.x + (-halfW * cos - (-halfD) * sin),
            position.z + (-halfW * sin + (-halfD) * cos)
        ),
        new THREE.Vector2(
            position.x + (halfW * cos - (-halfD) * sin),
            position.z + (halfW * sin + (-halfD) * cos)
        ),
        new THREE.Vector2(
            position.x + (halfW * cos - halfD * sin),
            position.z + (halfW * sin + halfD * cos)
        ),
        new THREE.Vector2(
            position.x + (-halfW * cos - halfD * sin),
            position.z + (-halfW * sin + halfD * cos)
        )
    ];

    // Check against each placed track piece
    for (const piece of state.placedPieces) {
        const pieceData = PIECE_DATA[piece.type];
        if (!pieceData) continue;

        // Get track piece bounding box (approximation)
        let pieceWidth = 10; // Track width
        let pieceLength = pieceData.length || (pieceData.curveRadius * pieceData.curveAngle);

        // For curves, use a larger bounding area
        if (pieceData.curveAngle > 0) {
            pieceLength = pieceData.curveRadius * 2;
            pieceWidth = pieceData.curveRadius * 2;
        }

        const pHalfW = pieceWidth / 2 + 5; // Add buffer
        const pHalfL = pieceLength / 2 + 5;
        const pCos = Math.cos(piece.heading);
        const pSin = Math.sin(piece.heading);

        // Piece center (for straights, center is midpoint; for curves, approximate)
        let pieceCenterX = piece.position.x;
        let pieceCenterZ = piece.position.z;

        if (pieceData.curveAngle > 0) {
            // For curves, use the arc center
            const r = pieceData.curveRadius;
            const dir = pieceData.direction;
            if (dir > 0) {
                pieceCenterX = piece.position.x + (-r * pCos);
                pieceCenterZ = piece.position.z + (-r * pSin);
            } else {
                pieceCenterX = piece.position.x + (r * pCos);
                pieceCenterZ = piece.position.z + (r * pSin);
            }
        } else {
            // For straights, center is at half length forward
            pieceCenterX = piece.position.x + pSin * (pieceLength / 2);
            pieceCenterZ = piece.position.z + pCos * (pieceLength / 2);
        }

        const pieceCorners = [
            new THREE.Vector2(
                pieceCenterX + (-pHalfW * pCos - (-pHalfL) * pSin),
                pieceCenterZ + (-pHalfW * pSin + (-pHalfL) * pCos)
            ),
            new THREE.Vector2(
                pieceCenterX + (pHalfW * pCos - (-pHalfL) * pSin),
                pieceCenterZ + (pHalfW * pSin + (-pHalfL) * pCos)
            ),
            new THREE.Vector2(
                pieceCenterX + (pHalfW * pCos - pHalfL * pSin),
                pieceCenterZ + (pHalfW * pSin + pHalfL * pCos)
            ),
            new THREE.Vector2(
                pieceCenterX + (-pHalfW * pCos - pHalfL * pSin),
                pieceCenterZ + (-pHalfW * pSin + pHalfL * pCos)
            )
        ];

        // Simple overlap check using separating axis theorem (simplified)
        if (polygonsOverlap(decoCorners, pieceCorners)) {
            return false;
        }
    }

    // Also check against other decorations
    for (const deco of state.placedDecorations) {
        const otherDecoData = DECORATION_DATA[deco.type];
        if (!otherDecoData) continue;

        const oHalfW = otherDecoData.width / 2;
        const oHalfD = otherDecoData.depth / 2;
        const oCos = Math.cos(deco.heading);
        const oSin = Math.sin(deco.heading);

        const otherCorners = [
            new THREE.Vector2(
                deco.position.x + (-oHalfW * oCos - (-oHalfD) * oSin),
                deco.position.z + (-oHalfW * oSin + (-oHalfD) * oCos)
            ),
            new THREE.Vector2(
                deco.position.x + (oHalfW * oCos - (-oHalfD) * oSin),
                deco.position.z + (oHalfW * oSin + (-oHalfD) * oCos)
            ),
            new THREE.Vector2(
                deco.position.x + (oHalfW * oCos - oHalfD * oSin),
                deco.position.z + (oHalfW * oSin + oHalfD * oCos)
            ),
            new THREE.Vector2(
                deco.position.x + (-oHalfW * oCos - oHalfD * oSin),
                deco.position.z + (-oHalfW * oSin + oHalfD * oCos)
            )
        ];

        if (polygonsOverlap(decoCorners, otherCorners)) {
            return false;
        }
    }

    return true;
}

// Simple polygon overlap check using separating axis theorem
function polygonsOverlap(poly1, poly2) {
    const polygons = [poly1, poly2];

    for (const polygon of polygons) {
        for (let i = 0; i < polygon.length; i++) {
            const j = (i + 1) % polygon.length;
            const edge = new THREE.Vector2(
                polygon[j].x - polygon[i].x,
                polygon[j].y - polygon[i].y
            );
            const normal = new THREE.Vector2(-edge.y, edge.x);

            let min1 = Infinity, max1 = -Infinity;
            for (const p of poly1) {
                const proj = normal.x * p.x + normal.y * p.y;
                min1 = Math.min(min1, proj);
                max1 = Math.max(max1, proj);
            }

            let min2 = Infinity, max2 = -Infinity;
            for (const p of poly2) {
                const proj = normal.x * p.x + normal.y * p.y;
                min2 = Math.min(min2, proj);
                max2 = Math.max(max2, proj);
            }

            if (max1 < min2 || max2 < min1) {
                return false; // Separating axis found
            }
        }
    }

    return true; // No separating axis found, polygons overlap
}

// Check if obstacle placement is valid (must be ON a track piece, not overlapping other obstacles)
export function checkObstaclePlacementValid(position, size = PHYSICS.obstacle.crateSize) {
    const halfSize = size / 2;

    // Get obstacle corners (obstacles don't rotate for simplicity)
    const obstacleCorners = [
        new THREE.Vector2(position.x - halfSize, position.z - halfSize),
        new THREE.Vector2(position.x + halfSize, position.z - halfSize),
        new THREE.Vector2(position.x + halfSize, position.z + halfSize),
        new THREE.Vector2(position.x - halfSize, position.z + halfSize)
    ];

    // Check if obstacle overlaps with ANY track piece (required)
    let onTrack = false;

    for (const piece of state.placedPieces) {
        const pieceData = PIECE_DATA[piece.type];
        if (!pieceData) continue;

        // Get track piece bounding box
        let pieceWidth = 10; // Track width
        let pieceLength = pieceData.length || (pieceData.curveRadius * pieceData.curveAngle);

        // For curves, use a larger bounding area
        if (pieceData.curveAngle > 0) {
            pieceLength = pieceData.curveRadius * 2;
            pieceWidth = pieceData.curveRadius * 2;
        }

        const pHalfW = pieceWidth / 2;
        const pHalfL = pieceLength / 2;
        const pCos = Math.cos(piece.heading);
        const pSin = Math.sin(piece.heading);

        // Piece center
        let pieceCenterX = piece.position.x;
        let pieceCenterZ = piece.position.z;

        if (pieceData.curveAngle > 0) {
            const r = pieceData.curveRadius;
            const dir = pieceData.direction;
            if (dir > 0) {
                pieceCenterX = piece.position.x + (-r * pCos);
                pieceCenterZ = piece.position.z + (-r * pSin);
            } else {
                pieceCenterX = piece.position.x + (r * pCos);
                pieceCenterZ = piece.position.z + (r * pSin);
            }
        } else {
            pieceCenterX = piece.position.x + pSin * (pieceLength / 2);
            pieceCenterZ = piece.position.z + pCos * (pieceLength / 2);
        }

        const pieceCorners = [
            new THREE.Vector2(
                pieceCenterX + (-pHalfW * pCos - (-pHalfL) * pSin),
                pieceCenterZ + (-pHalfW * pSin + (-pHalfL) * pCos)
            ),
            new THREE.Vector2(
                pieceCenterX + (pHalfW * pCos - (-pHalfL) * pSin),
                pieceCenterZ + (pHalfW * pSin + (-pHalfL) * pCos)
            ),
            new THREE.Vector2(
                pieceCenterX + (pHalfW * pCos - pHalfL * pSin),
                pieceCenterZ + (pHalfW * pSin + pHalfL * pCos)
            ),
            new THREE.Vector2(
                pieceCenterX + (-pHalfW * pCos - pHalfL * pSin),
                pieceCenterZ + (-pHalfW * pSin + pHalfL * pCos)
            )
        ];

        if (polygonsOverlap(obstacleCorners, pieceCorners)) {
            onTrack = true;
            break;
        }
    }

    // Must be on a track piece
    if (!onTrack) {
        return false;
    }

    // Check against other obstacles (no overlap allowed)
    for (const obstacle of obstacles) {
        if (obstacle.destroyed) continue;

        const oHalfSize = obstacle.size / 2;
        const otherCorners = [
            new THREE.Vector2(obstacle.position.x - oHalfSize, obstacle.position.z - oHalfSize),
            new THREE.Vector2(obstacle.position.x + oHalfSize, obstacle.position.z - oHalfSize),
            new THREE.Vector2(obstacle.position.x + oHalfSize, obstacle.position.z + oHalfSize),
            new THREE.Vector2(obstacle.position.x - oHalfSize, obstacle.position.z + oHalfSize)
        ];

        if (polygonsOverlap(obstacleCorners, otherCorners)) {
            return false;
        }
    }

    return true;
}
