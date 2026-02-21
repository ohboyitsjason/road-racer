import * as THREE from 'three';
import * as state from '../state.js';
import { scene, controls, raycaster, mouseVec, camera } from '../scene.js';
import { findSnapPoint, checkPlacementValid, getLocalEndpoint, getWorldPositionFromMouse, snapToGrid, placePieceAt, removeEndpointMarkers, getPieceEndpoint, checkDecorationPlacementValid, checkObstaclePlacementValid } from '../track/placement.js';
import { PIECE_DEFS } from '../track/pieces.js';
import { createPoofEffect } from '../effects/particles.js';
import { updateTrackStatus } from '../track/trackState.js';
import { createDecoration } from '../track/decorations.js';
import { DECORATION_DATA, PHYSICS, PIECE_DATA, ELEVATION } from '../constants.js';
import { playThump, playDelete } from '../audio/audioManager.js';
import { obstacles, addObstacle } from '../obstacles/obstacleState.js';
import { createCrateMesh, createCratePreview } from '../obstacles/obstacleMeshes.js';
import { spawnObstacle } from '../obstacles/obstaclePhysics.js';
import { highlightArea, clearHighlights, hasCustomGrid } from './customGrid.js';

// Decoration drag state
let isDraggingDecoration = false;
let dragDecorationType = null;
let decorationPreviewMesh = null;

// Existing decoration drag state
let isDraggingExistingDecoration = false;
let draggedDecorationIndex = -1;

// Obstacle drag state
let isDraggingObstacle = false;
let dragObstacleType = null;
let obstaclePreviewMesh = null;

// Track last mouse position for R key rotation
let lastMousePosition = { x: 0, y: 0 };

function updatePreviewPosition() {
    if (!state.previewMesh3D || !state.isDragging) return;

    state.setCurrentSnap(findSnapPoint(state.dragWorldPosition, state.dragRotation));

    // Get piece dimensions for grid highlighting
    const pieceData = PIECE_DATA[state.dragPieceType];
    const pieceLength = pieceData?.length || 40;
    const pieceWidth = PHYSICS.trackWidth * 2; // Standard track width

    if (state.currentSnap && state.currentSnap.valid) {
        const snapElevY = (state.currentSnap.elevation || 0) * ELEVATION.HEIGHT_PER_LEVEL;
        state.previewMesh3D.position.copy(state.currentSnap.position);
        state.previewMesh3D.position.y = snapElevY + 0.3;
        state.previewMesh3D.rotation.y = state.currentSnap.heading;
        state.setCurrentSnapValid(true);

        state.previewMesh3D.traverse(child => {
            if (child.isMesh && child.material) {
                child.material.color.setHex(0x44aa44);
            }
        });

        // Highlight grid cells for valid snap
        if (hasCustomGrid()) {
            highlightArea(
                state.currentSnap.position.x,
                state.currentSnap.position.z + pieceLength / 2,
                pieceWidth,
                pieceLength,
                state.currentSnap.heading
            );
        }

        const elevLabel = (state.currentSnap.elevation || 0) > 0 ? ` (Level ${state.currentSnap.elevation})` : '';
        document.getElementById('drop-indicator').textContent = 'Drop to connect piece!' + elevLabel;
        document.getElementById('drop-indicator').style.background = 'rgba(76, 175, 80, 0.9)';
    } else {
        const gridPos = snapToGrid(state.dragWorldPosition);
        const freeElevY = state.dragElevation * ELEVATION.HEIGHT_PER_LEVEL;
        state.previewMesh3D.position.copy(gridPos);
        state.previewMesh3D.position.y = freeElevY + 0.3;
        state.previewMesh3D.rotation.y = state.dragRotation;

        const freeValid = checkPlacementValid(gridPos, state.dragRotation, state.dragPieceType, null, state.dragElevation);
        state.setCurrentSnapValid(freeValid);
        state.setCurrentSnap(freeValid ? { position: gridPos.clone(), heading: state.dragRotation, valid: true, elevation: state.dragElevation } : null);

        state.previewMesh3D.traverse(child => {
            if (child.isMesh && child.material) {
                child.material.color.setHex(freeValid ? 0x666666 : 0xaa4444);
            }
        });

        // Highlight grid cells for free placement
        if (hasCustomGrid() && freeValid) {
            highlightArea(
                gridPos.x,
                gridPos.z + pieceLength / 2,
                pieceWidth,
                pieceLength,
                state.dragRotation
            );
        } else if (hasCustomGrid()) {
            clearHighlights();
        }

        if (freeValid) {
            const elevLabel = state.dragElevation > 0 ? ` (Level ${state.dragElevation})` : '';
            document.getElementById('drop-indicator').textContent = 'Drop to place piece! R=rotate Q/E=elevation' + elevLabel;
            document.getElementById('drop-indicator').style.background = 'rgba(76, 175, 80, 0.9)';
        } else {
            document.getElementById('drop-indicator').textContent = 'Invalid position - overlaps existing piece';
            document.getElementById('drop-indicator').style.background = 'rgba(244, 67, 54, 0.9)';
        }
    }
}

export function startDrag(pieceType, event) {
    if (state.gameState !== 'building') return;
    if (pieceType === 'delete') return;

    state.setIsDragging(true);
    state.setDragPieceType(pieceType);
    state.setDragRotation(0);
    state.setDragElevation(0);

    controls.enabled = false;

    const def = PIECE_DEFS[pieceType];
    if (def) {
        const previewColorIndex = state.placedPieces.length % 3;
        const mesh = def.createMesh(def, false, previewColorIndex);
        mesh.traverse(child => {
            if (child.isMesh && child.material) {
                child.material = child.material.clone();
                child.material.transparent = true;
                child.material.opacity = 0.7;
            }
        });
        scene.add(mesh);
        state.setPreviewMesh3D(mesh);
    }

    document.getElementById('drop-indicator').style.display = 'block';
    document.getElementById('drop-indicator').textContent = 'Drop to place piece! Press R to rotate';

    updateDragPosition(event);
}

export function updateDragPosition(event) {
    if (!state.isDragging) return;

    lastMousePosition.x = event.clientX;
    lastMousePosition.y = event.clientY;

    const worldPos = getWorldPositionFromMouse(event.clientX, event.clientY);
    if (worldPos) {
        state.dragWorldPosition.copy(worldPos);
        updatePreviewPosition();
    }
}

export function endDrag(event) {
    if (!state.isDragging) return;

    const dropTarget = document.elementFromPoint(event.clientX, event.clientY);
    const isOverCanvas = dropTarget && (dropTarget.tagName === 'CANVAS' || dropTarget.id === 'canvas-container');
    const isOverLibrary = dropTarget && dropTarget.closest('#gallery-panel');

    if (isOverCanvas && !isOverLibrary && state.dragPieceType && state.currentSnapValid && state.currentSnap) {
        const finalPosition = state.currentSnap.position.clone();
        const finalHeading = state.currentSnap.heading;
        const finalElevation = state.currentSnap.elevation || 0;

        let poofPosition = finalPosition.clone();
        if (state.currentSnap.type === 'our-end-to-their-start' || state.currentSnap.type === 'our-end-to-their-end') {
            const localEnd = getLocalEndpoint(state.dragPieceType);
            const rotatedEnd = new THREE.Vector3(localEnd.x, 0, localEnd.z);
            rotatedEnd.applyAxisAngle(new THREE.Vector3(0, 1, 0), finalHeading);
            poofPosition = finalPosition.clone().add(rotatedEnd);
        }

        placePieceAt(state.dragPieceType, finalPosition, finalHeading, finalElevation);
        updateTrackStatus();
        createPoofEffect(poofPosition);
        playThump();
    }

    // Cleanup
    if (state.previewMesh3D) {
        scene.remove(state.previewMesh3D);
        state.setPreviewMesh3D(null);
    }

    // Clear grid highlights
    if (hasCustomGrid()) {
        clearHighlights();
    }

    document.getElementById('drop-indicator').style.display = 'none';

    if (state.gameState === 'building') {
        controls.enabled = true;
    }

    state.setIsDragging(false);
    state.setDragPieceType(null);
    state.setCurrentSnap(null);
    state.setCurrentSnapValid(false);
}

// Check if click is on an existing piece
export function getClickedPiece(clientX, clientY) {
    if (state.gameState !== 'building') return -1;

    mouseVec.x = (clientX / window.innerWidth) * 2 - 1;
    mouseVec.y = -(clientY / window.innerHeight) * 2 + 1;

    raycaster.setFromCamera(mouseVec, camera);

    for (let i = 0; i < state.placedPieces.length; i++) {
        const piece = state.placedPieces[i];
        const intersects = raycaster.intersectObject(piece.mesh, true);
        if (intersects.length > 0) {
            return i;
        }
    }

    return -1;
}

// Check if click is on an existing decoration
export function getClickedDecoration(clientX, clientY) {
    if (state.gameState !== 'building') return -1;

    mouseVec.x = (clientX / window.innerWidth) * 2 - 1;
    mouseVec.y = -(clientY / window.innerHeight) * 2 + 1;

    raycaster.setFromCamera(mouseVec, camera);

    for (let i = 0; i < state.placedDecorations.length; i++) {
        const deco = state.placedDecorations[i];
        const intersects = raycaster.intersectObject(deco.mesh, true);
        if (intersects.length > 0) {
            return i;
        }
    }

    return -1;
}

// Start dragging an existing piece
export function startDragExisting(pieceIndex, event) {
    if (pieceIndex < 0 || pieceIndex >= state.placedPieces.length) return;

    const piece = state.placedPieces[pieceIndex];

    state.setIsDraggingExisting(true);
    state.setDraggedPieceIndex(pieceIndex);
    state.setDraggedPieceOriginal({
        type: piece.type,
        position: piece.position.clone(),
        heading: piece.heading,
        elevation: piece.elevation || 0
    });
    state.setDragElevation(piece.elevation || 0);

    state.setDragPieceType(piece.type);
    state.setDragRotation(piece.heading);

    controls.enabled = false;
    piece.mesh.visible = false;
    if (piece.endpointMarkers) piece.endpointMarkers.forEach(m => m.visible = false);

    const def = PIECE_DEFS[piece.type];
    if (def) {
        const moveColorIndex = piece.colorIndex || 0;
        const mesh = def.createMesh(def, false, moveColorIndex);
        mesh.traverse(child => {
            if (child.isMesh && child.material) {
                child.material = child.material.clone();
                child.material.transparent = true;
                child.material.opacity = 0.7;
            }
        });
        mesh.position.copy(piece.position);
        mesh.position.y = 0.3;
        mesh.rotation.y = piece.heading;
        scene.add(mesh);
        state.setPreviewMesh3D(mesh);
    }

    lastMousePosition.x = event.clientX;
    lastMousePosition.y = event.clientY;

    document.getElementById('drop-indicator').style.display = 'block';
    document.getElementById('drop-indicator').textContent = 'Drag to reposition | R to rotate';
    document.getElementById('drop-indicator').style.background = 'rgba(76, 175, 80, 0.9)';

    // Show delete overlay
    const deleteOverlay = document.getElementById('delete-overlay');
    if (deleteOverlay) deleteOverlay.classList.add('active');
}

// Update dragging existing piece
export function updateDragExisting(event) {
    if (!state.isDraggingExisting) return;

    lastMousePosition.x = event.clientX;
    lastMousePosition.y = event.clientY;

    const dropTarget = document.elementFromPoint(event.clientX, event.clientY);
    const isOverLibrary = dropTarget && dropTarget.closest('#gallery-panel');

    const deleteOverlay = document.getElementById('delete-overlay');

    if (isOverLibrary) {
        document.getElementById('drop-indicator').textContent = 'Release to delete piece!';
        document.getElementById('drop-indicator').style.background = 'rgba(244, 67, 54, 0.9)';

        if (state.previewMesh3D) state.previewMesh3D.visible = false;

        // Highlight delete overlay
        if (deleteOverlay) {
            deleteOverlay.style.background = 'rgba(244, 67, 54, 0.9)';
        }
    } else {
        // Reset delete overlay
        if (deleteOverlay) {
            deleteOverlay.style.background = 'rgba(0, 0, 0, 0.85)';
        }
        const worldPos = getWorldPositionFromMouse(event.clientX, event.clientY);
        if (worldPos && state.previewMesh3D) {
            state.previewMesh3D.visible = true;
            state.dragWorldPosition.copy(worldPos);

            // Temporarily remove piece for snap checking
            const tempPiece = state.placedPieces.splice(state.draggedPieceIndex, 1)[0];

            state.setCurrentSnap(findSnapPoint(state.dragWorldPosition, state.dragRotation));

            // Restore the piece
            state.placedPieces.splice(state.draggedPieceIndex, 0, tempPiece);

            if (state.currentSnap && state.currentSnap.valid) {
                const snapElevY = (state.currentSnap.elevation || 0) * ELEVATION.HEIGHT_PER_LEVEL;
                state.previewMesh3D.position.copy(state.currentSnap.position);
                state.previewMesh3D.position.y = snapElevY + 0.3;
                state.previewMesh3D.rotation.y = state.currentSnap.heading;
                state.setCurrentSnapValid(true);

                state.previewMesh3D.traverse(child => {
                    if (child.isMesh && child.material) {
                        child.material.color.setHex(0x44aa44);
                    }
                });

                document.getElementById('drop-indicator').textContent = 'Drop to connect! | R to rotate';
                document.getElementById('drop-indicator').style.background = 'rgba(76, 175, 80, 0.9)';
            } else {
                const gridPos = snapToGrid(state.dragWorldPosition);
                const freeElevY = state.dragElevation * ELEVATION.HEIGHT_PER_LEVEL;
                state.previewMesh3D.position.copy(gridPos);
                state.previewMesh3D.position.y = freeElevY + 0.3;
                state.previewMesh3D.rotation.y = state.dragRotation;

                // Temporarily remove piece for overlap check
                const tempPiece2 = state.placedPieces.splice(state.draggedPieceIndex, 1)[0];
                const freeValid = checkPlacementValid(gridPos, state.dragRotation, state.dragPieceType, null, state.dragElevation);
                state.placedPieces.splice(state.draggedPieceIndex, 0, tempPiece2);

                state.setCurrentSnapValid(freeValid);
                state.setCurrentSnap(freeValid ? { position: gridPos.clone(), heading: state.dragRotation, valid: true, elevation: state.dragElevation } : null);

                state.previewMesh3D.traverse(child => {
                    if (child.isMesh && child.material) {
                        child.material.color.setHex(freeValid ? 0x666666 : 0xaa4444);
                    }
                });

                document.getElementById('drop-indicator').textContent = freeValid ?
                    'Drop to place | R to rotate | Library to remove' :
                    'Invalid position - overlaps existing piece';
                document.getElementById('drop-indicator').style.background = freeValid ?
                    'rgba(76, 175, 80, 0.9)' : 'rgba(244, 67, 54, 0.9)';
            }
        }
    }
}

// End dragging existing piece
export function endDragExisting(event) {
    if (!state.isDraggingExisting) return;

    const dropTarget = document.elementFromPoint(event.clientX, event.clientY);
    const isOverLibrary = dropTarget && dropTarget.closest('#gallery-panel');

    if (isOverLibrary && state.draggedPieceIndex >= 0) {
        const piece = state.placedPieces[state.draggedPieceIndex];

        createPoofEffect(piece.position);
        playDelete();

        removeEndpointMarkers(piece);
        scene.remove(piece.mesh);
        state.trackElements.splice(state.trackElements.indexOf(piece.mesh), 1);
        state.placedPieces.splice(state.draggedPieceIndex, 1);

        if (piece.type === 'start') state.setHasStart(false);

        state.setObstacleZones(state.obstacleZones.filter(z => z.pieceIndex !== state.draggedPieceIndex));
        state.obstacleZones.forEach(z => {
            if (z.pieceIndex > state.draggedPieceIndex) z.pieceIndex--;
        });

        updateTrackStatus();
    } else if (state.currentSnapValid && state.currentSnap && state.draggedPieceIndex >= 0) {
        const piece = state.placedPieces[state.draggedPieceIndex];
        const newElevation = state.currentSnap.elevation || 0;

        piece.position.copy(state.currentSnap.position);
        piece.position.y = newElevation * ELEVATION.HEIGHT_PER_LEVEL;
        piece.heading = state.currentSnap.heading;
        piece.elevation = newElevation;
        piece.mesh.position.copy(piece.position);
        piece.mesh.rotation.y = state.currentSnap.heading;

        piece.mesh.visible = true;

        // Update endpoint markers to new position
        removeEndpointMarkers(piece);
        const startMarkerGeo = new THREE.SphereGeometry(1.2, 12, 12);
        const startMarker = new THREE.Mesh(startMarkerGeo, new THREE.MeshBasicMaterial({ color: 0x00ff00, transparent: true, opacity: 0.85 }));
        startMarker.position.copy(piece.position);
        startMarker.position.y = 1.5;
        startMarker.userData.isEndpointMarker = true;
        scene.add(startMarker);

        const end = getPieceEndpoint(piece);
        const endMarkerGeo = new THREE.SphereGeometry(1.2, 12, 12);
        const endMarker = new THREE.Mesh(endMarkerGeo, new THREE.MeshBasicMaterial({ color: 0xff4444, transparent: true, opacity: 0.85 }));
        endMarker.position.copy(end.position);
        endMarker.position.y = 1.5;
        endMarker.userData.isEndpointMarker = true;
        scene.add(endMarker);

        piece.endpointMarkers = [startMarker, endMarker];

        createPoofEffect(state.currentSnap.position);
        playThump();

        updateTrackStatus();
    } else {
        if (state.draggedPieceIndex >= 0 && state.draggedPieceIndex < state.placedPieces.length) {
            const piece = state.placedPieces[state.draggedPieceIndex];
            piece.mesh.visible = true;
            if (piece.endpointMarkers) piece.endpointMarkers.forEach(m => m.visible = true);
        }
    }

    // Cleanup
    if (state.previewMesh3D) {
        scene.remove(state.previewMesh3D);
        state.setPreviewMesh3D(null);
    }

    // Clear grid highlights
    if (hasCustomGrid()) {
        clearHighlights();
    }

    document.getElementById('drop-indicator').style.display = 'none';

    // Hide delete overlay
    const deleteOverlay = document.getElementById('delete-overlay');
    if (deleteOverlay) {
        deleteOverlay.classList.remove('active');
        deleteOverlay.style.background = 'rgba(0, 0, 0, 0.85)';
    }

    if (state.gameState === 'building') {
        controls.enabled = true;
    }

    state.setIsDraggingExisting(false);
    state.setDraggedPieceIndex(-1);
    state.setDraggedPieceOriginal(null);
    state.setDragPieceType(null);
    state.setCurrentSnap(null);
    state.setCurrentSnapValid(false);
}

// Canvas mouse down handler for picking up existing pieces or decorations
export function onCanvasMouseDown(event) {
    if (state.gameState !== 'building') return;
    if (state.isDragging || state.isDraggingExisting || isDraggingDecoration || isDraggingExistingDecoration || isDraggingObstacle) return;

    // Check for track piece click first
    const pieceIndex = getClickedPiece(event.clientX, event.clientY);
    if (pieceIndex >= 0) {
        event.preventDefault();
        event.stopPropagation();
        startDragExisting(pieceIndex, event);
        return;
    }

    // Check for decoration click
    const decoIndex = getClickedDecoration(event.clientX, event.clientY);
    if (decoIndex >= 0) {
        event.preventDefault();
        event.stopPropagation();
        startDragExistingDecoration(decoIndex, event);
    }
}

// ==================== EXISTING DECORATION DRAGGING ====================

export function startDragExistingDecoration(decoIndex, event) {
    if (decoIndex < 0 || decoIndex >= state.placedDecorations.length) return;

    const deco = state.placedDecorations[decoIndex];

    isDraggingExistingDecoration = true;
    draggedDecorationIndex = decoIndex;
    dragDecorationType = deco.type;
    state.setDragRotation(deco.heading);

    controls.enabled = false;
    deco.mesh.visible = false;

    // Create preview mesh
    decorationPreviewMesh = createDecoration(deco.type);
    decorationPreviewMesh.position.copy(deco.position);
    decorationPreviewMesh.rotation.y = deco.heading;
    decorationPreviewMesh.traverse(child => {
        if (child.isMesh && child.material) {
            child.material = child.material.clone();
            child.material.transparent = true;
            child.material.opacity = 0.7;
        }
    });
    scene.add(decorationPreviewMesh);

    lastMousePosition.x = event.clientX;
    lastMousePosition.y = event.clientY;

    document.getElementById('drop-indicator').style.display = 'block';
    document.getElementById('drop-indicator').textContent = 'Drag to reposition | R to rotate';
    document.getElementById('drop-indicator').style.background = 'rgba(139, 69, 19, 0.9)';

    // Show delete overlay
    const deleteOverlay = document.getElementById('delete-overlay');
    if (deleteOverlay) deleteOverlay.classList.add('active');
}

export function updateDragExistingDecoration(event) {
    if (!isDraggingExistingDecoration) return;

    lastMousePosition.x = event.clientX;
    lastMousePosition.y = event.clientY;

    const dropTarget = document.elementFromPoint(event.clientX, event.clientY);
    const isOverLibrary = dropTarget && dropTarget.closest('#gallery-panel');

    const deleteOverlay = document.getElementById('delete-overlay');

    if (isOverLibrary) {
        document.getElementById('drop-indicator').textContent = 'Release to delete decoration!';
        document.getElementById('drop-indicator').style.background = 'rgba(244, 67, 54, 0.9)';

        if (decorationPreviewMesh) decorationPreviewMesh.visible = false;

        // Highlight delete overlay
        if (deleteOverlay) {
            deleteOverlay.style.background = 'rgba(244, 67, 54, 0.9)';
        }
    } else {
        // Reset delete overlay
        if (deleteOverlay) {
            deleteOverlay.style.background = 'rgba(0, 0, 0, 0.85)';
        }

        const worldPos = getWorldPositionFromMouse(event.clientX, event.clientY);
        if (worldPos && decorationPreviewMesh) {
            decorationPreviewMesh.visible = true;
            const gridPos = snapToGrid(worldPos);
            decorationPreviewMesh.position.copy(gridPos);
            decorationPreviewMesh.rotation.y = state.dragRotation;

            // Temporarily remove decoration for overlap check
            const tempDeco = state.placedDecorations.splice(draggedDecorationIndex, 1)[0];
            const isValid = checkDecorationPlacementValid(gridPos, state.dragRotation, dragDecorationType);
            state.placedDecorations.splice(draggedDecorationIndex, 0, tempDeco);

            state.setCurrentSnapValid(isValid);
            state.setCurrentSnap(isValid ? { position: gridPos.clone(), heading: state.dragRotation, valid: true } : null);

            decorationPreviewMesh.traverse(child => {
                if (child.isMesh && child.material) {
                    child.material.opacity = isValid ? 0.7 : 0.5;
                }
            });

            if (isValid) {
                document.getElementById('drop-indicator').textContent = 'Drop to place | R to rotate';
                document.getElementById('drop-indicator').style.background = 'rgba(139, 69, 19, 0.9)';
            } else {
                document.getElementById('drop-indicator').textContent = 'Invalid - overlaps with track or decoration';
                document.getElementById('drop-indicator').style.background = 'rgba(244, 67, 54, 0.9)';
            }
        }
    }
}

export function endDragExistingDecoration(event) {
    if (!isDraggingExistingDecoration) return;

    const dropTarget = document.elementFromPoint(event.clientX, event.clientY);
    const isOverLibrary = dropTarget && dropTarget.closest('#gallery-panel');

    if (isOverLibrary && draggedDecorationIndex >= 0) {
        // Remove the decoration
        const deco = state.placedDecorations[draggedDecorationIndex];
        createPoofEffect(deco.position);
        playDelete();
        scene.remove(deco.mesh);
        state.decorationElements.splice(state.decorationElements.indexOf(deco.mesh), 1);
        state.placedDecorations.splice(draggedDecorationIndex, 1);
    } else if (state.currentSnapValid && state.currentSnap && draggedDecorationIndex >= 0) {
        // Reposition the decoration
        const deco = state.placedDecorations[draggedDecorationIndex];
        deco.position.copy(state.currentSnap.position);
        deco.heading = state.currentSnap.heading;
        deco.mesh.position.copy(state.currentSnap.position);
        deco.mesh.rotation.y = state.currentSnap.heading;
        deco.mesh.visible = true;
        createPoofEffect(state.currentSnap.position);
        playThump();
    } else {
        // Invalid drop - restore original position
        if (draggedDecorationIndex >= 0 && draggedDecorationIndex < state.placedDecorations.length) {
            state.placedDecorations[draggedDecorationIndex].mesh.visible = true;
        }
    }

    // Cleanup
    if (decorationPreviewMesh) {
        scene.remove(decorationPreviewMesh);
        decorationPreviewMesh = null;
    }

    document.getElementById('drop-indicator').style.display = 'none';

    // Hide delete overlay
    const deleteOverlay = document.getElementById('delete-overlay');
    if (deleteOverlay) {
        deleteOverlay.classList.remove('active');
        deleteOverlay.style.background = 'rgba(0, 0, 0, 0.85)';
    }

    if (state.gameState === 'building') {
        controls.enabled = true;
    }

    isDraggingExistingDecoration = false;
    draggedDecorationIndex = -1;
    dragDecorationType = null;
    state.setCurrentSnap(null);
    state.setCurrentSnapValid(false);
}

export function isDraggingExistingDecorationActive() {
    return isDraggingExistingDecoration;
}

// ==================== NEW DECORATION DRAGGING ====================

export function startDragDecoration(decorationType, event) {
    if (state.gameState !== 'building') return;

    isDraggingDecoration = true;
    dragDecorationType = decorationType;
    state.setDragRotation(0);

    controls.enabled = false;

    // Create 3D preview mesh
    decorationPreviewMesh = createDecoration(decorationType);
    decorationPreviewMesh.traverse(child => {
        if (child.isMesh && child.material) {
            child.material = child.material.clone();
            child.material.transparent = true;
            child.material.opacity = 0.7;
        }
    });
    scene.add(decorationPreviewMesh);

    document.getElementById('drop-indicator').style.display = 'block';
    document.getElementById('drop-indicator').textContent = 'Drop to place decoration! Press R to rotate';
    document.getElementById('drop-indicator').style.background = 'rgba(139, 69, 19, 0.9)';

    updateDragDecoration(event);
}

export function updateDragDecoration(event) {
    if (!isDraggingDecoration) return;

    lastMousePosition.x = event.clientX;
    lastMousePosition.y = event.clientY;

    const worldPos = getWorldPositionFromMouse(event.clientX, event.clientY);
    if (worldPos && decorationPreviewMesh) {
        const gridPos = snapToGrid(worldPos);
        decorationPreviewMesh.position.copy(gridPos);
        decorationPreviewMesh.rotation.y = state.dragRotation;

        // Check if placement is valid (no overlap with track)
        const isValid = checkDecorationPlacementValid(gridPos, state.dragRotation, dragDecorationType);

        decorationPreviewMesh.traverse(child => {
            if (child.isMesh && child.material) {
                if (isValid) {
                    child.material.opacity = 0.7;
                    if (child.material.emissive) child.material.emissive.setHex(0x003300);
                } else {
                    child.material.opacity = 0.5;
                    if (child.material.emissive) child.material.emissive.setHex(0x330000);
                }
            }
        });

        state.setCurrentSnapValid(isValid);
        state.setCurrentSnap(isValid ? { position: gridPos.clone(), heading: state.dragRotation, valid: true } : null);

        if (isValid) {
            document.getElementById('drop-indicator').textContent = 'Drop to place decoration! Press R to rotate';
            document.getElementById('drop-indicator').style.background = 'rgba(139, 69, 19, 0.9)';
        } else {
            document.getElementById('drop-indicator').textContent = 'Invalid - overlaps with track piece';
            document.getElementById('drop-indicator').style.background = 'rgba(244, 67, 54, 0.9)';
        }
    }
}

export function endDragDecoration(event) {
    if (!isDraggingDecoration) return;

    const dropTarget = document.elementFromPoint(event.clientX, event.clientY);
    const isOverCanvas = dropTarget && (dropTarget.tagName === 'CANVAS' || dropTarget.id === 'canvas-container');
    const isOverLibrary = dropTarget && dropTarget.closest('#gallery-panel');

    if (isOverCanvas && !isOverLibrary && state.currentSnapValid && state.currentSnap) {
        const finalPosition = state.currentSnap.position.clone();
        const finalHeading = state.currentSnap.heading;

        // Create the actual decoration
        const decoration = createDecoration(dragDecorationType);
        decoration.position.copy(finalPosition);
        decoration.rotation.y = finalHeading;
        scene.add(decoration);

        // Store decoration data
        state.placedDecorations.push({
            type: dragDecorationType,
            position: finalPosition.clone(),
            heading: finalHeading,
            mesh: decoration
        });
        state.decorationElements.push(decoration);

        createPoofEffect(finalPosition);
        playThump();
    }

    // Cleanup
    if (decorationPreviewMesh) {
        scene.remove(decorationPreviewMesh);
        decorationPreviewMesh = null;
    }

    document.getElementById('drop-indicator').style.display = 'none';

    if (state.gameState === 'building') {
        controls.enabled = true;
    }

    isDraggingDecoration = false;
    dragDecorationType = null;
    state.setCurrentSnap(null);
    state.setCurrentSnapValid(false);
}

export function isDraggingDecorationActive() {
    return isDraggingDecoration;
}

export function rotateDecorationPreview() {
    if ((isDraggingDecoration || isDraggingExistingDecoration) && decorationPreviewMesh) {
        state.setDragRotation(state.dragRotation + Math.PI / 4);
        if (state.dragRotation >= Math.PI * 2) state.setDragRotation(state.dragRotation - Math.PI * 2);
        decorationPreviewMesh.rotation.y = state.dragRotation;
    }
}

export function getLastMousePosition() {
    return { clientX: lastMousePosition.x, clientY: lastMousePosition.y };
}

// === OBSTACLE DRAG AND DROP ===

export function startDragObstacle(obstacleType, event) {
    if (state.gameState !== 'building') return;

    isDraggingObstacle = true;
    dragObstacleType = obstacleType;
    state.setDragRotation(0);

    controls.enabled = false;

    // Create preview mesh
    obstaclePreviewMesh = createCratePreview();
    scene.add(obstaclePreviewMesh);

    document.getElementById('drop-indicator').style.display = 'block';
    document.getElementById('drop-indicator').textContent = 'Drop to place obstacle! Press R to rotate';
    document.getElementById('drop-indicator').style.background = 'rgba(139, 90, 43, 0.9)';

    updateDragObstacle(event);
}

export function updateDragObstacle(event) {
    if (!isDraggingObstacle) return;

    lastMousePosition.x = event.clientX;
    lastMousePosition.y = event.clientY;

    const worldPos = getWorldPositionFromMouse(event.clientX, event.clientY);
    if (!worldPos) return;

    // Place on ground
    worldPos.y = PHYSICS.obstacle.crateSize / 2 + 0.1;

    if (obstaclePreviewMesh) {
        obstaclePreviewMesh.position.copy(worldPos);
        obstaclePreviewMesh.rotation.y = state.dragRotation;

        // Check if placement is valid (must be on track)
        const isValid = checkObstaclePlacementValid(worldPos);
        state.setCurrentSnapValid(isValid);

        // Update preview color based on validity
        obstaclePreviewMesh.material.color.setHex(isValid ? 0x8B4513 : 0xaa4444);
        obstaclePreviewMesh.material.opacity = isValid ? 0.6 : 0.4;

        if (isValid) {
            document.getElementById('drop-indicator').textContent = 'Drop to place obstacle! Press R to rotate';
            document.getElementById('drop-indicator').style.background = 'rgba(139, 90, 43, 0.9)';
        } else {
            document.getElementById('drop-indicator').textContent = 'Must place on track!';
            document.getElementById('drop-indicator').style.background = 'rgba(244, 67, 54, 0.9)';
        }
    }
}

export function endDragObstacle(event) {
    if (!isDraggingObstacle) return;

    const dropTarget = document.elementFromPoint(event.clientX, event.clientY);
    const isOverLibrary = dropTarget && dropTarget.closest('#gallery-panel');
    const worldPos = getWorldPositionFromMouse(event.clientX, event.clientY);

    if (worldPos && !isOverLibrary && state.currentSnapValid) {
        // Place the obstacle
        const finalPosition = worldPos.clone();
        finalPosition.y = PHYSICS.obstacle.crateSize / 2 + 0.1;

        // Create obstacle data
        const obstacleData = spawnObstacle(dragObstacleType, finalPosition, state.dragRotation);

        // Create and add mesh
        const mesh = createCrateMesh();
        mesh.position.copy(finalPosition);
        mesh.rotation.y = state.dragRotation;
        scene.add(mesh);
        obstacleData.mesh = mesh;

        // Add to obstacles array
        addObstacle(obstacleData);

        createPoofEffect(finalPosition);
        playThump();
    }

    // Cleanup
    if (obstaclePreviewMesh) {
        scene.remove(obstaclePreviewMesh);
        obstaclePreviewMesh = null;
    }

    document.getElementById('drop-indicator').style.display = 'none';

    if (state.gameState === 'building') {
        controls.enabled = true;
    }

    isDraggingObstacle = false;
    dragObstacleType = null;
    state.setCurrentSnapValid(false);
}

export function isDraggingObstacleActive() {
    return isDraggingObstacle;
}

export function rotateObstaclePreview() {
    if (isDraggingObstacle && obstaclePreviewMesh) {
        state.setDragRotation(state.dragRotation + Math.PI / 4);
        if (state.dragRotation >= Math.PI * 2) state.setDragRotation(state.dragRotation - Math.PI * 2);
        obstaclePreviewMesh.rotation.y = state.dragRotation;
    }
}
