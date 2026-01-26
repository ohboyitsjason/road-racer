import * as THREE from 'three';
import * as state from '../state.js';
import { scene, controls, raycaster, mouseVec, camera } from '../scene.js';
import { findSnapPoint, checkPlacementValid, getLocalEndpoint, getWorldPositionFromMouse, snapToGrid, placePieceAt, removeEndpointMarkers, getPieceEndpoint } from '../track/placement.js';
import { PIECE_DEFS } from '../track/pieces.js';
import { createPoofEffect } from '../effects/particles.js';
import { updateTrackStatus } from '../track/trackState.js';

function updatePreviewPosition() {
    if (!state.previewMesh3D || !state.isDragging) return;

    state.setCurrentSnap(findSnapPoint(state.dragWorldPosition, state.dragRotation));

    if (state.currentSnap && state.currentSnap.valid) {
        state.previewMesh3D.position.copy(state.currentSnap.position);
        state.previewMesh3D.position.y = 0.3;
        state.previewMesh3D.rotation.y = state.currentSnap.heading;
        state.setCurrentSnapValid(true);

        state.previewMesh3D.traverse(child => {
            if (child.isMesh && child.material) {
                child.material.color.setHex(0x44aa44);
            }
        });

        document.getElementById('drop-indicator').textContent = 'Drop to connect piece!';
        document.getElementById('drop-indicator').style.background = 'rgba(76, 175, 80, 0.9)';
    } else {
        const gridPos = snapToGrid(state.dragWorldPosition);
        state.previewMesh3D.position.copy(gridPos);
        state.previewMesh3D.position.y = 0.3;
        state.previewMesh3D.rotation.y = state.dragRotation;

        const freeValid = checkPlacementValid(gridPos, state.dragRotation, state.dragPieceType);
        state.setCurrentSnapValid(freeValid);
        state.setCurrentSnap(freeValid ? { position: gridPos.clone(), heading: state.dragRotation, valid: true } : null);

        state.previewMesh3D.traverse(child => {
            if (child.isMesh && child.material) {
                child.material.color.setHex(freeValid ? 0x666666 : 0xaa4444);
            }
        });

        if (freeValid) {
            document.getElementById('drop-indicator').textContent = 'Drop to place piece! Press R to rotate';
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

    controls.enabled = false;

    const preview = document.createElement('div');
    preview.className = 'drag-preview';
    const def = PIECE_DEFS[pieceType];
    preview.innerHTML = pieceType.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase()) + '<br><small>R to rotate</small>';
    document.body.appendChild(preview);
    state.setDragPreview(preview);

    if (def) {
        const mesh = def.createMesh(def, true);
        scene.add(mesh);
        state.setPreviewMesh3D(mesh);
    }

    document.getElementById('drop-indicator').style.display = 'block';
    document.getElementById('drop-indicator').textContent = 'Drop to place piece! Press R to rotate';

    updateDragPosition(event);
}

export function updateDragPosition(event) {
    if (!state.isDragging || !state.dragPreview) return;

    state.dragPreview.style.left = event.clientX + 'px';
    state.dragPreview.style.top = event.clientY + 'px';

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
    const isOverLibrary = dropTarget && dropTarget.closest('#piece-library');

    if (isOverCanvas && !isOverLibrary && state.dragPieceType && state.currentSnapValid && state.currentSnap) {
        const finalPosition = state.currentSnap.position.clone();
        const finalHeading = state.currentSnap.heading;

        let poofPosition = finalPosition.clone();
        if (state.currentSnap.type === 'our-end-to-their-start' || state.currentSnap.type === 'our-end-to-their-end') {
            const localEnd = getLocalEndpoint(state.dragPieceType);
            const rotatedEnd = new THREE.Vector3(localEnd.x, 0, localEnd.z);
            rotatedEnd.applyAxisAngle(new THREE.Vector3(0, 1, 0), finalHeading);
            poofPosition = finalPosition.clone().add(rotatedEnd);
        }

        placePieceAt(state.dragPieceType, finalPosition, finalHeading);
        updateTrackStatus();
        createPoofEffect(poofPosition);
    }

    // Cleanup
    if (state.dragPreview) {
        document.body.removeChild(state.dragPreview);
        state.setDragPreview(null);
    }

    if (state.previewMesh3D) {
        scene.remove(state.previewMesh3D);
        state.setPreviewMesh3D(null);
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

// Start dragging an existing piece
export function startDragExisting(pieceIndex, event) {
    if (pieceIndex < 0 || pieceIndex >= state.placedPieces.length) return;

    const piece = state.placedPieces[pieceIndex];

    state.setIsDraggingExisting(true);
    state.setDraggedPieceIndex(pieceIndex);
    state.setDraggedPieceOriginal({
        type: piece.type,
        position: piece.position.clone(),
        heading: piece.heading
    });

    state.setDragPieceType(piece.type);
    state.setDragRotation(piece.heading);

    controls.enabled = false;
    piece.mesh.visible = false;
    if (piece.endpointMarkers) piece.endpointMarkers.forEach(m => m.visible = false);

    const def = PIECE_DEFS[piece.type];
    if (def) {
        const mesh = def.createMesh(def, true);
        mesh.position.copy(piece.position);
        mesh.position.y = 0.3;
        mesh.rotation.y = piece.heading;
        scene.add(mesh);
        state.setPreviewMesh3D(mesh);
    }

    const preview = document.createElement('div');
    preview.className = 'drag-preview';
    preview.innerHTML = piece.type.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase()) + '<br><small>R to rotate | Library to remove</small>';
    document.body.appendChild(preview);
    preview.style.left = event.clientX + 'px';
    preview.style.top = event.clientY + 'px';
    state.setDragPreview(preview);

    document.getElementById('drop-indicator').style.display = 'block';
    document.getElementById('drop-indicator').textContent = 'Drag to reposition | R to rotate | Library to remove';
    document.getElementById('drop-indicator').style.background = 'rgba(76, 175, 80, 0.9)';
}

// Update dragging existing piece
export function updateDragExisting(event) {
    if (!state.isDraggingExisting) return;

    if (state.dragPreview) {
        state.dragPreview.style.left = event.clientX + 'px';
        state.dragPreview.style.top = event.clientY + 'px';
    }

    const dropTarget = document.elementFromPoint(event.clientX, event.clientY);
    const isOverLibrary = dropTarget && dropTarget.closest('#piece-library');

    if (isOverLibrary) {
        document.getElementById('drop-indicator').textContent = 'Release to remove piece!';
        document.getElementById('drop-indicator').style.background = 'rgba(244, 67, 54, 0.9)';

        if (state.previewMesh3D) state.previewMesh3D.visible = false;
    } else {
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
                state.previewMesh3D.position.copy(state.currentSnap.position);
                state.previewMesh3D.position.y = 0.3;
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
                state.previewMesh3D.position.copy(gridPos);
                state.previewMesh3D.position.y = 0.3;
                state.previewMesh3D.rotation.y = state.dragRotation;

                // Temporarily remove piece for overlap check
                const tempPiece2 = state.placedPieces.splice(state.draggedPieceIndex, 1)[0];
                const freeValid = checkPlacementValid(gridPos, state.dragRotation, state.dragPieceType);
                state.placedPieces.splice(state.draggedPieceIndex, 0, tempPiece2);

                state.setCurrentSnapValid(freeValid);
                state.setCurrentSnap(freeValid ? { position: gridPos.clone(), heading: state.dragRotation, valid: true } : null);

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
    const isOverLibrary = dropTarget && dropTarget.closest('#piece-library');

    if (isOverLibrary && state.draggedPieceIndex >= 0) {
        const piece = state.placedPieces[state.draggedPieceIndex];

        createPoofEffect(piece.position);

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

        piece.position.copy(state.currentSnap.position);
        piece.heading = state.currentSnap.heading;
        piece.mesh.position.copy(state.currentSnap.position);
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

        updateTrackStatus();
    } else {
        if (state.draggedPieceIndex >= 0 && state.draggedPieceIndex < state.placedPieces.length) {
            const piece = state.placedPieces[state.draggedPieceIndex];
            piece.mesh.visible = true;
            if (piece.endpointMarkers) piece.endpointMarkers.forEach(m => m.visible = true);
        }
    }

    // Cleanup
    if (state.dragPreview) {
        document.body.removeChild(state.dragPreview);
        state.setDragPreview(null);
    }

    if (state.previewMesh3D) {
        scene.remove(state.previewMesh3D);
        state.setPreviewMesh3D(null);
    }

    document.getElementById('drop-indicator').style.display = 'none';

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

// Canvas mouse down handler for picking up existing pieces
export function onCanvasMouseDown(event) {
    if (state.gameState !== 'building') return;
    if (state.isDragging || state.isDraggingExisting) return;

    const pieceIndex = getClickedPiece(event.clientX, event.clientY);
    if (pieceIndex >= 0) {
        event.preventDefault();
        startDragExisting(pieceIndex, event);
    }
}
