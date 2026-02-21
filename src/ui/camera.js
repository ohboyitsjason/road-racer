import * as THREE from 'three';
import { controls, camera } from '../scene.js';
import { getRugBounds } from '../effects/bedroom.js';

// Steeper isometric angle (~60 degrees from horizontal, more top-down)
const ISO_ANGLE = Math.PI / 3; // 60 degrees
const ISO_ROTATION = Math.PI / 4; // 45 degrees rotation around Y

export function setBuildModeCamera() {
    // Set up isometric-style view
    const distance = 200;
    const height = distance * Math.sin(ISO_ANGLE);
    const horizontal = distance * Math.cos(ISO_ANGLE);

    // Center on rug if available, otherwise origin
    const rug = getRugBounds();
    const cx = rug ? rug.centerX : 0;
    const cz = rug ? rug.centerZ : 0;

    // Position camera at isometric angle (45 degrees rotated, looking down)
    camera.position.set(
        cx + horizontal * Math.sin(ISO_ROTATION),
        height,
        cz + horizontal * Math.cos(ISO_ROTATION)
    );
    camera.lookAt(cx, 0, cz);

    controls.target.set(cx, 0, cz);
    controls.enableRotate = false;
    controls.enablePan = true;
    controls.enableZoom = true;
    controls.screenSpacePanning = false;
    controls.minDistance = 80;
    controls.maxDistance = 500;
    controls.mouseButtons = {
        LEFT: THREE.MOUSE.PAN,
        MIDDLE: THREE.MOUSE.DOLLY,
        RIGHT: THREE.MOUSE.PAN
    };
    controls.touches = {
        ONE: THREE.TOUCH.PAN,
        TWO: THREE.TOUCH.DOLLY_PAN
    };
    controls.update();
}

// Clamp camera to stay over the game board during build mode
const BOARD_HALF = 220; // Slightly larger than board edge (420/2 + margin)

export function clampBuildCamera() {
    const rug = getRugBounds();
    if (rug) {
        // Use rug bounds with a small margin
        const margin = 10;
        controls.target.x = Math.max(rug.minX - margin, Math.min(rug.maxX + margin, controls.target.x));
        controls.target.z = Math.max(rug.minZ - margin, Math.min(rug.maxZ + margin, controls.target.z));
    } else {
        controls.target.x = Math.max(-BOARD_HALF, Math.min(BOARD_HALF, controls.target.x));
        controls.target.z = Math.max(-BOARD_HALF, Math.min(BOARD_HALF, controls.target.z));
    }
    controls.target.y = 0;

    // Keep camera above ground
    if (camera.position.y < 10) {
        camera.position.y = 10;
    }
}

export function setRaceModeCamera() {
    controls.enableRotate = true;
    controls.enablePan = true;
    controls.mouseButtons = {
        LEFT: THREE.MOUSE.ROTATE,
        MIDDLE: THREE.MOUSE.DOLLY,
        RIGHT: THREE.MOUSE.PAN
    };
    controls.touches = {
        ONE: THREE.TOUCH.ROTATE,
        TWO: THREE.TOUCH.DOLLY_PAN
    };
}
