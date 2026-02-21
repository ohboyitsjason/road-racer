import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { scene, setupGodrays, removeGodrays } from '../scene.js';
import { centerGridOn } from '../ui/customGrid.js';


let bedroomGroup = null;
let windowLight = null;
let rugBounds = null;

const ROOM_D = 2000;
const FLOOR_Y = -21;

export function createBedroom() {
    removeBedroom();

    bedroomGroup = new THREE.Group();
    bedroomGroup.name = 'bedroom';

    // Load room GLB model
    const loader = new GLTFLoader();
    loader.load('src/assets/models/room.glb', (gltf) => {
        const room = gltf.scene;

        // Measure and scale the model to match expected room size
        const box = new THREE.Box3().setFromObject(room);
        const size = box.getSize(new THREE.Vector3());
        // Scale to match the room width (~1400 units)
        const targetWidth = 2000;
        const scale = targetWidth / Math.max(size.x, size.z);
        room.scale.setScalar(scale);

        // Position so floor aligns with FLOOR_Y
        const scaledBox = new THREE.Box3().setFromObject(room);
        const scaledMin = scaledBox.min;
        room.position.y += FLOOR_Y - scaledMin.y;

        // Center horizontally
        const scaledCenter = new THREE.Box3().setFromObject(room).getCenter(new THREE.Vector3());
        room.position.x -= scaledCenter.x +5;
        room.position.z -= scaledCenter.z +5;
        room.rotation.y = 24;

        // Align the "game board" rug surface with Y=0 and extract its bounds
        room.traverse(child => {
            if (child.name === 'game board') {
                // Align rug top with Y=0
                const rugBox = new THREE.Box3().setFromObject(child);
                room.position.y += -rugBox.max.y;

                // Recompute world-space bounds after Y adjustment
                const finalBox = new THREE.Box3().setFromObject(child);
                rugBounds = {
                    minX: finalBox.min.x,
                    maxX: finalBox.max.x,
                    minZ: finalBox.min.z,
                    maxZ: finalBox.max.z,
                    centerX: (finalBox.min.x + finalBox.max.x) / 2,
                    centerZ: (finalBox.min.z + finalBox.max.z) / 2
                };
                // Center the building grid on the rug
                centerGridOn(rugBounds.centerX, rugBounds.centerZ);
            }
        });

        // Enable shadows on all meshes
        room.traverse(child => {
            if (child.isMesh) {
                child.castShadow = true;
                child.receiveShadow = true;
            }
        });

        bedroomGroup.add(room);
    });

    // === Window lighting ===
    const halfD = ROOM_D / 2;
    const windowCenterY = FLOOR_Y + 555;

    // Main window spotlight - drives the god rays
    windowLight = new THREE.SpotLight(0xfff5e0, 4, 2000, Math.PI / 4, 0.6, 1);
    windowLight.position.set(0, windowCenterY + 80, -halfD - 100);
    windowLight.target.position.set(0, FLOOR_Y, 200);
    windowLight.castShadow = true;
    windowLight.shadow.mapSize.width = 1024;
    windowLight.shadow.mapSize.height = 1024;
    windowLight.shadow.bias = -0.002;
    windowLight.shadow.camera.near = 0.1;
    windowLight.shadow.camera.far = 2000;
    windowLight.shadow.autoUpdate = true;
    bedroomGroup.add(windowLight);
    bedroomGroup.add(windowLight.target);

    // Secondary fill light from window (wider, softer, no shadows)
    const windowFill = new THREE.SpotLight(0xeef0ff, 1.5, 1800, Math.PI / 2.5, 0.8, 1.5);
    windowFill.position.set(0, windowCenterY, -halfD - 50);
    windowFill.target.position.set(0, FLOOR_Y + 50, 300);
    bedroomGroup.add(windowFill);
    bedroomGroup.add(windowFill.target);

    scene.add(bedroomGroup);

    // Set up god rays on the window light
    setupGodrays(windowLight);
}

export function removeBedroom() {
    removeGodrays();
    centerGridOn(0, 0); // Reset grid to origin
    if (bedroomGroup) {
        bedroomGroup.traverse(child => {
            if (child.isMesh) {
                if (child.geometry) child.geometry.dispose();
                if (child.material) {
                    if (child.material.map) child.material.map.dispose();
                    child.material.dispose();
                }
            }
        });
        scene.remove(bedroomGroup);
        bedroomGroup = null;
        windowLight = null;
        rugBounds = null;
    }
}

export function hasBedroomEnabled() {
    return bedroomGroup !== null;
}

export function getRugBounds() {
    return rugBounds;
}
