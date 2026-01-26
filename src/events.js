import * as THREE from 'three';
import * as state from './state.js';
import { scene, camera, controls, renderer, gridHelper } from './scene.js';
import { setBuildModeCamera, setRaceModeCamera } from './ui/camera.js';
import { startDrag, updateDragPosition, endDrag, onCanvasMouseDown, getClickedPiece, startDragExisting, updateDragExisting, endDragExisting } from './ui/dragAndDrop.js';
import { clearTrack } from './track/trackState.js';
import { buildRoadCurve } from './track/trackState.js';
import { placePiece } from './track/placement.js';
import { createCar } from './car/car.js';
import { setupAICars } from './ai/aiCars.js';
import { updateTrackStatus } from './track/trackState.js';

export function setupEventListeners() {
    // Build button
    document.getElementById('build-btn').addEventListener('click', () => {
        state.setGameState('building');
        document.getElementById('piece-library').style.display = 'block';
        document.getElementById('track-status').style.display = 'block';
        document.getElementById('race-info').style.display = 'none';
        document.getElementById('speedometer').style.display = 'none';
        gridHelper.visible = true;
        controls.enabled = true;

        camera.position.set(0, 150, 0.1);
        camera.lookAt(0, 0, 0);
        controls.target.set(0, 0, 0);
        setBuildModeCamera();
        controls.update();

        document.getElementById('instructions').textContent = 'Drag pieces onto grid. R to rotate. Drag placed pieces back to library to remove them.';
    });

    // Race button
    document.getElementById('race-btn').addEventListener('click', () => {
        if (!state.trackClosed || !state.hasStart) return;

        state.setGameState('racing');
        document.getElementById('piece-library').style.display = 'none';
        document.getElementById('track-status').style.display = 'none';
        gridHelper.visible = false;
        controls.enabled = false;
        setRaceModeCamera();

        buildRoadCurve();

        if (!state.car) {
            state.setCar(createCar(0xff0000, true));
            scene.add(state.car);
        }

        setupAICars();

        // Find start piece and position car there
        const startPiece = state.placedPieces.find(p => p.type === 'start');
        state.setPlayerPhysics({
            position: startPiece.position.clone().add(new THREE.Vector3(0, 0, 10).applyAxisAngle(new THREE.Vector3(0, 1, 0), startPiece.heading)),
            velocity: new THREE.Vector3(),
            speed: 0,
            heading: startPiece.heading,
            angularVelocity: 0,
            trackPosition: 0,
            isAirborne: false,
            airborneTime: 0,
            verticalVelocity: 0,
            groundY: 0.1
        });
        state.playerPhysics.position.y = 0.1;

        state.car.position.copy(state.playerPhysics.position);
        state.car.rotation.y = state.playerPhysics.heading;

        state.setLapCount(0);
        state.setLastCheckpoint(0);
        state.setRaceStartTime(Date.now());

        document.getElementById('instructions').textContent = 'Arrow keys/WASD to drive! Complete 3 laps to win!';
        document.getElementById('race-info').style.display = 'block';
        document.getElementById('speedometer').style.display = 'block';
        document.getElementById('lap-num').textContent = '0';
    });

    // Clear button
    document.getElementById('clear-btn').addEventListener('click', () => {
        clearTrack();
        state.setGameState('idle');
        document.getElementById('piece-library').style.display = 'none';
        document.getElementById('track-status').style.display = 'none';
        document.getElementById('race-info').style.display = 'none';
        document.getElementById('speedometer').style.display = 'none';
        gridHelper.visible = false;
        controls.enabled = true;
        document.getElementById('race-btn').disabled = true;
        document.getElementById('instructions').textContent = 'Click "Build Track" to start building your track from pieces!';
        camera.position.set(0, 150, 0.1);
        camera.lookAt(0, 0, 0);
        controls.target.set(0, 0, 0);
        setBuildModeCamera();
        controls.update();
    });

    // Piece selection - drag and drop
    document.querySelectorAll('.piece-btn').forEach(btn => {
        const pieceType = btn.dataset.piece;

        btn.addEventListener('click', (e) => {
            if (pieceType === 'delete') {
                placePiece('delete');
                updateTrackStatus();
            }
        });

        btn.addEventListener('mousedown', (e) => {
            if (pieceType === 'delete') return;
            e.preventDefault();
            startDrag(pieceType, e);
        });

        btn.addEventListener('touchstart', (e) => {
            if (pieceType === 'delete') return;
            e.preventDefault();
            const touch = e.touches[0];
            startDrag(pieceType, { clientX: touch.clientX, clientY: touch.clientY });
        });
    });

    // Global mouse/touch move and up for drag
    document.addEventListener('mousemove', (e) => {
        if (state.isDragging) {
            e.preventDefault();
            updateDragPosition(e);
        } else if (state.isDraggingExisting) {
            e.preventDefault();
            updateDragExisting(e);
        }
    });

    document.addEventListener('mouseup', (e) => {
        if (state.isDragging) {
            endDrag(e);
        } else if (state.isDraggingExisting) {
            endDragExisting(e);
        }
    });

    document.addEventListener('touchmove', (e) => {
        if (state.isDragging) {
            e.preventDefault();
            const touch = e.touches[0];
            updateDragPosition({ clientX: touch.clientX, clientY: touch.clientY });
        } else if (state.isDraggingExisting) {
            e.preventDefault();
            const touch = e.touches[0];
            updateDragExisting({ clientX: touch.clientX, clientY: touch.clientY });
        }
    }, { passive: false });

    document.addEventListener('touchend', (e) => {
        if (state.isDragging) {
            const touch = e.changedTouches[0];
            endDrag({ clientX: touch.clientX, clientY: touch.clientY });
        } else if (state.isDraggingExisting) {
            const touch = e.changedTouches[0];
            endDragExisting({ clientX: touch.clientX, clientY: touch.clientY });
        }
    });

    // Canvas mouse/touch for picking up existing pieces
    renderer.domElement.addEventListener('mousedown', onCanvasMouseDown);
    renderer.domElement.addEventListener('touchstart', (e) => {
        if (state.gameState !== 'building') return;
        const touch = e.touches[0];
        const pieceIndex = getClickedPiece(touch.clientX, touch.clientY);
        if (pieceIndex >= 0) {
            e.preventDefault();
            startDragExisting(pieceIndex, { clientX: touch.clientX, clientY: touch.clientY });
        }
    }, { passive: false });

    // R key rotation during drag
    window.addEventListener('keydown', (e) => {
        if (e.key.toLowerCase() === 'r') {
            if (state.isDragging) {
                state.setDragRotation(state.dragRotation + Math.PI / 4);
                if (state.dragRotation >= Math.PI * 2) state.setDragRotation(state.dragRotation - Math.PI * 2);
                // Trigger preview update - get last mouse position from dragPreview
                if (state.dragPreview) {
                    const fakeEvent = { clientX: parseInt(state.dragPreview.style.left) || 0, clientY: parseInt(state.dragPreview.style.top) || 0 };
                    updateDragPosition(fakeEvent);
                }
            } else if (state.isDraggingExisting && state.previewMesh3D) {
                state.setDragRotation(state.dragRotation + Math.PI / 4);
                if (state.dragRotation >= Math.PI * 2) state.setDragRotation(state.dragRotation - Math.PI * 2);
                state.previewMesh3D.rotation.y = state.dragRotation;
                const fakeEvent = { clientX: parseInt(state.dragPreview?.style.left) || 0, clientY: parseInt(state.dragPreview?.style.top) || 0 };
                updateDragExisting(fakeEvent);
            }
        }
    });

    // Resize
    window.addEventListener('resize', () => {
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(window.innerWidth, window.innerHeight);
    });
}
