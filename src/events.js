import * as THREE from 'three';
import * as state from './state.js';
import { scene, camera, controls, renderer, gridHelper } from './scene.js';
import { setBuildModeCamera, setRaceModeCamera } from './ui/camera.js';
import { startDrag, updateDragPosition, endDrag, onCanvasMouseDown, getClickedPiece, getClickedDecoration, startDragExisting, updateDragExisting, endDragExisting, startDragDecoration, updateDragDecoration, endDragDecoration, isDraggingDecorationActive, rotateDecorationPreview, startDragExistingDecoration, updateDragExistingDecoration, endDragExistingDecoration, isDraggingExistingDecorationActive, getLastMousePosition, startDragObstacle, updateDragObstacle, endDragObstacle, isDraggingObstacleActive, rotateObstaclePreview } from './ui/dragAndDrop.js';
import { clearTrack } from './track/trackState.js';
import { clearObstacles, obstacles, resetObstacles } from './obstacles/obstacleState.js';
import { createCrateMesh } from './obstacles/obstacleMeshes.js';
import { buildRoadCurve } from './track/trackState.js';
import { placePiece } from './track/placement.js';
import { createCar, updatePlayerCarTheme } from './car/car.js';
import { setupAICars } from './ai/aiCars.js';
import { updateTrackStatus } from './track/trackState.js';
import { rebuildTrackMeshCache } from './car/surfacePhysics.js';
import { playMenuMusic, playBuilderMusic, stopAllMusic, playWhoosh, toggleMute, getMuted, playDelete } from './audio/audioManager.js';
import { initGalleryUI, showGallery } from './ui/galleryUI.js';
import { setTheme, getCurrentThemeName, onThemeChange } from './theme/themeManager.js';

export function setupEventListeners() {
    // Splash screen - click to unlock audio and show title screen
    const splashScreen = document.getElementById('splash-screen');
    const titleScreen = document.getElementById('title-screen');

    splashScreen.addEventListener('click', () => {
        // Hide splash screen
        splashScreen.classList.add('hidden');
        setTimeout(() => {
            splashScreen.style.display = 'none';
        }, 500);

        // Show title screen and start menu music
        titleScreen.style.display = 'flex';
        playMenuMusic();
    });

    // Sound toggle buttons
    const titleSoundToggle = document.getElementById('title-sound-toggle');
    const soundBtn = document.getElementById('sound-btn');

    function updateSoundButtons() {
        const muted = getMuted();
        const icon = muted ? '🔇' : '🔊';
        if (titleSoundToggle) {
            titleSoundToggle.textContent = icon;
            titleSoundToggle.classList.toggle('muted', muted);
        }
        if (soundBtn) {
            const iconImg = soundBtn.querySelector('.icon-img');
            if (iconImg) {
                iconImg.src = muted ? iconImg.dataset.off : iconImg.dataset.on;
            }
            soundBtn.classList.toggle('muted', muted);
        }
    }

    if (titleSoundToggle) {
        titleSoundToggle.addEventListener('click', (e) => {
            e.stopPropagation();
            toggleMute();
            updateSoundButtons();
        });
    }

    if (soundBtn) {
        soundBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            toggleMute();
            updateSoundButtons();
        });
    }

    // Title screen - Start Building function
    function startBuilding() {
        const titleScreen = document.getElementById('title-screen');
        if (titleScreen.style.display === 'none') return; // Already started

        // Play whoosh sound effect
        playWhoosh();

        titleScreen.classList.add('hidden');

        // Remove title screen from DOM after animation
        setTimeout(() => {
            titleScreen.style.display = 'none';
        }, 500);

        // Switch to builder music
        playBuilderMusic();

        // Go directly into build mode
        enterBuildMode();
    }

    // Enter build mode - show gallery and enable building
    function enterBuildMode() {
        state.setGameState('building');

        // Initialize gallery UI if first time
        initGalleryUI();

        // Show new gallery UI
        showGallery(true);

        // Hide race UI
        document.getElementById('race-info').style.display = 'none';
        document.getElementById('speedometer').style.display = 'none';

        // Show grid and enable camera controls
        gridHelper.visible = true;
        controls.enabled = true;

        // Show direction arrows in build mode
        state.trackElements.forEach(element => {
            element.traverse(child => {
                if (child.name === 'directionArrow') {
                    child.visible = true;
                }
            });
        });

        setBuildModeCamera();

        // Update track status to show/hide race button
        updateTrackStatus();
    }

    document.getElementById('start-game-btn').addEventListener('click', startBuilding);

    // Race menu pause functions
    function pauseRace() {
        if (state.gameState !== 'racing' || state.isPaused) return;
        state.setIsPaused(true);
        state.setPauseStartTime(Date.now());
        document.getElementById('race-menu-overlay').style.display = 'flex';
    }

    function resumeRace() {
        if (!state.isPaused) return;
        const pauseDuration = Date.now() - state.pauseStartTime;
        state.setTotalPausedTime(state.totalPausedTime + pauseDuration);
        state.setIsPaused(false);
        document.getElementById('race-menu-overlay').style.display = 'none';
    }

    // Keyboard support for title screen and modals
    document.addEventListener('keydown', (e) => {
        const titleScreen = document.getElementById('title-screen');
        const howToPlayModal = document.getElementById('how-to-play-modal');
        const menuOverlay = document.getElementById('menu-overlay');
        const raceMenuOverlay = document.getElementById('race-menu-overlay');

        // Handle Escape key
        if (e.key === 'Escape') {
            // Close how to play modal
            if (howToPlayModal.style.display === 'flex') {
                howToPlayModal.style.display = 'none';
                return;
            }
            // Close build menu
            if (menuOverlay.style.display === 'flex') {
                menuOverlay.style.display = 'none';
                return;
            }
            // Toggle race menu during race
            if (state.gameState === 'racing') {
                if (raceMenuOverlay.style.display === 'flex') {
                    resumeRace();
                } else if (!state.playerFinished) {
                    pauseRace();
                }
                return;
            }
        }

        // Start building with Enter or Space from title screen
        if ((e.key === 'Enter' || e.key === ' ') && titleScreen.style.display !== 'none') {
            // Don't start if how to play modal is open
            if (howToPlayModal.style.display === 'flex') {
                howToPlayModal.style.display = 'none';
                return;
            }
            e.preventDefault();
            startBuilding();
        }
    });

    // How to Play button
    document.getElementById('how-to-play-btn').addEventListener('click', () => {
        document.getElementById('how-to-play-modal').style.display = 'flex';
    });

    // Close How to Play modal (X button)
    document.getElementById('close-how-to-play').addEventListener('click', () => {
        document.getElementById('how-to-play-modal').style.display = 'none';
    });

    // Close How to Play modal (Got it! button)
    document.getElementById('htp-got-it-btn').addEventListener('click', () => {
        document.getElementById('how-to-play-modal').style.display = 'none';
    });

    // Close modal on background click
    document.getElementById('how-to-play-modal').addEventListener('click', (e) => {
        if (e.target.id === 'how-to-play-modal') {
            document.getElementById('how-to-play-modal').style.display = 'none';
        }
    });

    // Help button - show how to play
    document.getElementById('help-btn').addEventListener('click', () => {
        document.getElementById('how-to-play-modal').style.display = 'flex';
    });

    // Menu button - show menu overlay
    document.getElementById('menu-btn').addEventListener('click', () => {
        document.getElementById('menu-overlay').style.display = 'flex';
    });

    // Menu close button (X)
    document.getElementById('menu-close').addEventListener('click', () => {
        document.getElementById('menu-overlay').style.display = 'none';
    });

    // Menu resume button
    document.getElementById('menu-resume').addEventListener('click', () => {
        document.getElementById('menu-overlay').style.display = 'none';
    });

    // Menu clear button
    document.getElementById('menu-clear').addEventListener('click', () => {
        document.getElementById('menu-overlay').style.display = 'none';
        clearTrackAndReset();
    });

    // Theme selection buttons
    const themeButtons = document.querySelectorAll('.theme-btn');

    // Update theme button states based on current theme
    function updateThemeButtons() {
        const currentTheme = getCurrentThemeName();
        themeButtons.forEach(btn => {
            btn.classList.toggle('active', btn.dataset.theme === currentTheme);
        });
    }

    // Initial update
    updateThemeButtons();

    // Add click handlers
    themeButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            const themeName = btn.dataset.theme;
            setTheme(themeName);
            updateThemeButtons();

            // Update player car if it exists
            if (state.car) {
                updatePlayerCarTheme(state.car);
            }
        });
    });

    // Close menu on background click
    document.getElementById('menu-overlay').addEventListener('click', (e) => {
        if (e.target.id === 'menu-overlay') {
            document.getElementById('menu-overlay').style.display = 'none';
        }
    });

    // Race menu event handlers
    document.getElementById('race-menu-close').addEventListener('click', resumeRace);
    document.getElementById('race-resume-btn').addEventListener('click', resumeRace);

    document.getElementById('race-restart-btn').addEventListener('click', () => {
        resumeRace();
        // Trigger restart by clicking the race button
        document.getElementById('race-btn').click();
    });

    document.getElementById('race-build-btn').addEventListener('click', () => {
        state.setIsPaused(false);
        state.setTotalPausedTime(0);
        document.getElementById('race-menu-overlay').style.display = 'none';
        enterBuildMode();
    });

    document.getElementById('race-main-menu-btn').addEventListener('click', () => {
        state.setIsPaused(false);
        state.setTotalPausedTime(0);
        document.getElementById('race-menu-overlay').style.display = 'none';

        // Hide race UI
        document.getElementById('race-info').style.display = 'none';
        document.getElementById('speedometer').style.display = 'none';
        showGallery(false);
        document.getElementById('race-btn').style.display = 'none';

        // Show title screen
        const titleScreen = document.getElementById('title-screen');
        titleScreen.style.display = 'flex';
        titleScreen.classList.remove('hidden');

        // Reset game state
        state.setGameState('idle');

        // Play menu music
        playMenuMusic();
    });

    // Close race menu on background click
    document.getElementById('race-menu-overlay').addEventListener('click', (e) => {
        if (e.target.id === 'race-menu-overlay') {
            resumeRace();
        }
    });

    // Clear track and reset function
    function clearTrackAndReset() {
        clearTrack();
        // Clear obstacles and their meshes
        for (const obstacle of obstacles) {
            if (obstacle.mesh) {
                scene.remove(obstacle.mesh);
            }
        }
        clearObstacles();

        // Stay in build mode, just reset the track
        updateTrackStatus();
    }

    // Race button
    document.getElementById('race-btn').addEventListener('click', () => {
        if (!state.trackClosed || !state.hasStart) return;

        // Stop builder music for race
        stopAllMusic();

        state.setGameState('racing');

        // Hide builder UI
        showGallery(false);
        document.getElementById('race-btn').style.display = 'none';

        gridHelper.visible = false;
        controls.enabled = false;
        setRaceModeCamera();

        buildRoadCurve();

        // Hide direction arrows during race
        state.trackElements.forEach(element => {
            element.traverse(child => {
                if (child.name === 'directionArrow') {
                    child.visible = false;
                }
            });
        });

        // Initialize raycast-based surface detection cache
        rebuildTrackMeshCache();

        // Reset obstacles to original positions
        resetObstacles(scene, createCrateMesh);

        if (!state.car) {
            state.setCar(createCar(null, true)); // Use theme color
            scene.add(state.car);
        }

        setupAICars();

        // Find start piece and position car in starting grid (pole position - front left)
        const startPiece = state.placedPieces.find(p => p.type === 'start');
        // Grid position: Row 0 (front), left lane (-3 lateral offset), behind start line (-5 forward)
        const forwardOffset = -5; // 5 units behind start line
        const gridOffset = new THREE.Vector3(-3, 0, forwardOffset).applyAxisAngle(new THREE.Vector3(0, 1, 0), startPiece.heading);
        const startPosition = startPiece.position.clone().add(gridOffset);
        startPosition.y = 0.7; // Start above track surface (0.15) + car height (0.5)

        // Calculate initial trackPosition based on how far behind start line
        const curveLength = state.roadCurve ? state.roadCurve.getLength() : 200;
        const initialTrackPosition = forwardOffset / curveLength;

        state.setPlayerPhysics({
            position: startPosition,
            velocity: new THREE.Vector3(),
            speed: 0,
            heading: startPiece.heading,
            angularVelocity: 0,
            trackPosition: initialTrackPosition,
            isAirborne: false,
            airborneTime: 0,
            verticalVelocity: 0,
            groundY: 0.1,
            inLoop: false,
            steerAngle: 0,
            lastAccel: 0,
            isDrifting: false,
            driftAmount: 0,
            velocityHeading: startPiece.heading,
            driftDirection: 0,
            collisionRecovery: 0,
            spinVelocity: 0,
            // Surface physics
            onSurface: true,
            surfaceNormal: new THREE.Vector3(0, 1, 0),
            // Crash state
            isCrashed: false,
            crashTimer: 0,
            lastSafePosition: startPosition.clone(),
            lastSafeHeading: startPiece.heading,
            lastSafeTrackT: 0,
            offTrackTimer: 0
        });

        state.car.position.copy(state.playerPhysics.position);
        state.car.rotation.y = state.playerPhysics.heading;

        state.setLapCount(0);
        state.setLastCheckpoint(0); // Start at 0, first physics frame will update to actual position
        state.resetCheckpoints(); // Reset checkpoint tracking for new race
        state.setTopSpeed(0);
        state.setPlayerFinished(false);
        state.setIsPaused(false);
        state.setTotalPausedTime(0);
        state.setIsCountingDown(true);

        // Blur any focused buttons so space doesn't click them
        if (document.activeElement) {
            document.activeElement.blur();
        }

        document.getElementById('instructions').textContent = 'Arrow keys/WASD to drive. SPACE for handbrake (drift when turning)! Complete 3 laps to win!';
        document.getElementById('race-info').style.display = 'block';
        document.getElementById('speedometer').style.display = 'block';
        document.getElementById('lap-num').textContent = '0';

        // Animate camera to player view, then start countdown
        animateCameraToPlayer(() => {
            startRaceCountdown();
        });
    });

    // Camera fly-in animation
    function animateCameraToPlayer(onComplete) {
        const startPos = camera.position.clone();
        const startLookAt = controls.target.clone();

        // Target position: behind and above player
        const playerPos = state.playerPhysics.position;
        const playerHeading = state.playerPhysics.heading;
        const targetPos = new THREE.Vector3(
            playerPos.x - Math.sin(playerHeading) * 15,
            playerPos.y + 8,
            playerPos.z - Math.cos(playerHeading) * 15
        );
        const targetLookAt = new THREE.Vector3(
            playerPos.x,
            playerPos.y + 1,
            playerPos.z
        );

        const duration = 1500; // 1.5 seconds
        const startTime = Date.now();

        function animate() {
            const elapsed = Date.now() - startTime;
            const t = Math.min(1, elapsed / duration);

            // Smooth easing (ease-out cubic)
            const eased = 1 - Math.pow(1 - t, 3);

            // Interpolate camera position
            camera.position.lerpVectors(startPos, targetPos, eased);

            // Interpolate look-at target
            const currentLookAt = new THREE.Vector3().lerpVectors(startLookAt, targetLookAt, eased);
            camera.lookAt(currentLookAt);

            if (t < 1) {
                requestAnimationFrame(animate);
            } else {
                // Animation complete
                if (onComplete) onComplete();
            }
        }

        animate();
    }

    // Race countdown function
    function startRaceCountdown() {
        const countdownEl = document.getElementById('race-countdown');
        const numberEl = countdownEl.querySelector('.countdown-number');

        countdownEl.style.display = 'flex';

        const countdownSequence = ['3', '2', '1', 'GO!'];
        let currentIndex = 0;

        function showNext() {
            if (currentIndex < countdownSequence.length) {
                const text = countdownSequence[currentIndex];
                numberEl.textContent = text;
                numberEl.className = 'countdown-number' + (text === 'GO!' ? ' go' : '');

                // Reset animation
                numberEl.style.animation = 'none';
                numberEl.offsetHeight; // Trigger reflow
                numberEl.style.animation = 'countdownPulse 0.8s ease-out';

                currentIndex++;

                if (currentIndex < countdownSequence.length) {
                    setTimeout(showNext, 1000);
                } else {
                    // GO! shown - start the race after a brief moment
                    setTimeout(() => {
                        countdownEl.style.display = 'none';
                        state.setIsCountingDown(false);
                        state.setRaceStartTime(Date.now());
                    }, 500);
                }
            }
        }

        showNext();
    }


    // Restart button (on finish screen)
    document.getElementById('restart-btn').addEventListener('click', () => {
        // Hide finish screen
        document.getElementById('finish-screen').style.display = 'none';
        const celebration = document.getElementById('finish-celebration');
        celebration.classList.remove('show', 'slide-up');
        celebration.style.display = 'block';
        document.getElementById('finish-summary').classList.remove('show');

        // Go back to build mode first to show the race button
        enterBuildMode();

        // Then start the race
        document.getElementById('race-btn').click();
    });

    // Piece selection events are now handled by galleryUI.js

    // Global mouse/touch move and up for drag
    document.addEventListener('mousemove', (e) => {
        if (state.isDragging) {
            e.preventDefault();
            updateDragPosition(e);
        } else if (state.isDraggingExisting) {
            e.preventDefault();
            updateDragExisting(e);
        } else if (isDraggingDecorationActive()) {
            e.preventDefault();
            updateDragDecoration(e);
        } else if (isDraggingExistingDecorationActive()) {
            e.preventDefault();
            updateDragExistingDecoration(e);
        } else if (isDraggingObstacleActive()) {
            e.preventDefault();
            updateDragObstacle(e);
        }
    });

    document.addEventListener('mouseup', (e) => {
        if (state.isDragging) {
            endDrag(e);
        } else if (state.isDraggingExisting) {
            endDragExisting(e);
        } else if (isDraggingDecorationActive()) {
            endDragDecoration(e);
        } else if (isDraggingExistingDecorationActive()) {
            endDragExistingDecoration(e);
        } else if (isDraggingObstacleActive()) {
            endDragObstacle(e);
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
        } else if (isDraggingDecorationActive()) {
            e.preventDefault();
            const touch = e.touches[0];
            updateDragDecoration({ clientX: touch.clientX, clientY: touch.clientY });
        } else if (isDraggingExistingDecorationActive()) {
            e.preventDefault();
            const touch = e.touches[0];
            updateDragExistingDecoration({ clientX: touch.clientX, clientY: touch.clientY });
        } else if (isDraggingObstacleActive()) {
            e.preventDefault();
            const touch = e.touches[0];
            updateDragObstacle({ clientX: touch.clientX, clientY: touch.clientY });
        }
    }, { passive: false });

    document.addEventListener('touchend', (e) => {
        if (state.isDragging) {
            const touch = e.changedTouches[0];
            endDrag({ clientX: touch.clientX, clientY: touch.clientY });
        } else if (state.isDraggingExisting) {
            const touch = e.changedTouches[0];
            endDragExisting({ clientX: touch.clientX, clientY: touch.clientY });
        } else if (isDraggingDecorationActive()) {
            const touch = e.changedTouches[0];
            endDragDecoration({ clientX: touch.clientX, clientY: touch.clientY });
        } else if (isDraggingExistingDecorationActive()) {
            const touch = e.changedTouches[0];
            endDragExistingDecoration({ clientX: touch.clientX, clientY: touch.clientY });
        } else if (isDraggingObstacleActive()) {
            const touch = e.changedTouches[0];
            endDragObstacle({ clientX: touch.clientX, clientY: touch.clientY });
        }
    });

    // Canvas mouse/touch for picking up existing pieces
    renderer.domElement.addEventListener('mousedown', onCanvasMouseDown);
    renderer.domElement.addEventListener('touchstart', (e) => {
        if (state.gameState !== 'building') return;
        const touch = e.touches[0];

        // Check for track piece first
        const pieceIndex = getClickedPiece(touch.clientX, touch.clientY);
        if (pieceIndex >= 0) {
            e.preventDefault();
            startDragExisting(pieceIndex, { clientX: touch.clientX, clientY: touch.clientY });
            return;
        }

        // Check for decoration
        const decoIndex = getClickedDecoration(touch.clientX, touch.clientY);
        if (decoIndex >= 0) {
            e.preventDefault();
            startDragExistingDecoration(decoIndex, { clientX: touch.clientX, clientY: touch.clientY });
        }
    }, { passive: false });

    // R key rotation during drag
    window.addEventListener('keydown', (e) => {
        if (e.key.toLowerCase() === 'r') {
            const lastPos = getLastMousePosition();
            if (state.isDragging) {
                state.setDragRotation(state.dragRotation + Math.PI / 4);
                if (state.dragRotation >= Math.PI * 2) state.setDragRotation(state.dragRotation - Math.PI * 2);
                updateDragPosition(lastPos);
            } else if (state.isDraggingExisting && state.previewMesh3D) {
                state.setDragRotation(state.dragRotation + Math.PI / 4);
                if (state.dragRotation >= Math.PI * 2) state.setDragRotation(state.dragRotation - Math.PI * 2);
                state.previewMesh3D.rotation.y = state.dragRotation;
                updateDragExisting(lastPos);
            } else if (isDraggingDecorationActive()) {
                rotateDecorationPreview();
                updateDragDecoration(lastPos);
            } else if (isDraggingExistingDecorationActive()) {
                rotateDecorationPreview();
                updateDragExistingDecoration(lastPos);
            } else if (isDraggingObstacleActive()) {
                rotateObstaclePreview();
                updateDragObstacle(lastPos);
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
