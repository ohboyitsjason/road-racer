import * as THREE from 'three';
import { controls, camera } from '../scene.js';

// Isometric camera angle (classic ~35.264 degrees from horizontal)
const ISO_ANGLE = Math.atan(1 / Math.sqrt(2)); // ~35.264 degrees
const ISO_ROTATION = Math.PI / 4; // 45 degrees rotation around Y

export function setBuildModeCamera() {
    // Set up isometric-style view
    const distance = 200;
    const height = distance * Math.sin(ISO_ANGLE);
    const horizontal = distance * Math.cos(ISO_ANGLE);

    // Position camera at isometric angle (45 degrees rotated, looking down)
    camera.position.set(
        horizontal * Math.sin(ISO_ROTATION),
        height,
        horizontal * Math.cos(ISO_ROTATION)
    );
    camera.lookAt(0, 0, 0);

    controls.target.set(0, 0, 0);
    controls.enableRotate = false;
    controls.enablePan = true;
    controls.enableZoom = true;
    controls.screenSpacePanning = true;
    controls.minDistance = 80;
    controls.maxDistance = 400;
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
