import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { initTheme, getCurrentTheme, getColor, onThemeChange } from './theme/themeManager.js';

// Initialize theme from localStorage
initTheme();

// Get initial theme colors
const theme = getCurrentTheme();

// Scene
export const scene = new THREE.Scene();
scene.background = new THREE.Color(theme.sky.color);
scene.fog = new THREE.Fog(theme.sky.fogColor, theme.sky.fogNear, theme.sky.fogFar);

// Camera
export const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.position.set(0, 150, 0.1);

// Renderer
export const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

// Controls
export const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.05;
controls.maxPolarAngle = Math.PI / 2.1;

// Lighting
const ambientLight = new THREE.AmbientLight(
    theme.lighting.ambient.color,
    theme.lighting.ambient.intensity
);
scene.add(ambientLight);

const directionalLight = new THREE.DirectionalLight(
    theme.lighting.directional.color,
    theme.lighting.directional.intensity
);
directionalLight.position.set(
    theme.lighting.directional.position.x,
    theme.lighting.directional.position.y,
    theme.lighting.directional.position.z
);
directionalLight.castShadow = true;
directionalLight.shadow.mapSize.width = 2048;
directionalLight.shadow.mapSize.height = 2048;
directionalLight.shadow.camera.near = 0.5;
directionalLight.shadow.camera.far = 500;
directionalLight.shadow.camera.left = -200;
directionalLight.shadow.camera.right = 200;
directionalLight.shadow.camera.top = 200;
directionalLight.shadow.camera.bottom = -200;
scene.add(directionalLight);

// Ground
const groundGeometry = new THREE.PlaneGeometry(600, 600);
const groundMaterial = new THREE.MeshStandardMaterial({
    color: theme.ground.color,
    roughness: theme.ground.roughness
});
const ground = new THREE.Mesh(groundGeometry, groundMaterial);
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);

// Grid helper for building
export const gridHelper = new THREE.GridHelper(400, 40, 0x444444, 0x333333);
gridHelper.visible = false;
scene.add(gridHelper);

// Raycaster utilities
export const raycaster = new THREE.Raycaster();
export const mouseVec = new THREE.Vector2();
export const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);

// Update scene colors when theme changes
export function updateSceneTheme() {
    const newTheme = getCurrentTheme();

    // Update sky and fog
    scene.background.setHex(newTheme.sky.color);
    scene.fog.color.setHex(newTheme.sky.fogColor);
    scene.fog.near = newTheme.sky.fogNear;
    scene.fog.far = newTheme.sky.fogFar;

    // Update ground
    groundMaterial.color.setHex(newTheme.ground.color);
    groundMaterial.roughness = newTheme.ground.roughness;

    // Update lighting
    ambientLight.color.setHex(newTheme.lighting.ambient.color);
    ambientLight.intensity = newTheme.lighting.ambient.intensity;

    directionalLight.color.setHex(newTheme.lighting.directional.color);
    directionalLight.intensity = newTheme.lighting.directional.intensity;
}

// Subscribe to theme changes
onThemeChange(() => {
    updateSceneTheme();
});

export function init(container) {
    container.appendChild(renderer.domElement);
}
