import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { BokehPass } from 'three/addons/postprocessing/BokehPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { initTheme, getCurrentTheme, getColor, onThemeChange } from './theme/themeManager.js';
import { createCustomGrid, setGridVisible, hasCustomGrid, updateGridTheme } from './ui/customGrid.js';


// Initialize theme from localStorage
initTheme();

// Get initial theme colors
const theme = getCurrentTheme();

// Scene
export const scene = new THREE.Scene();
scene.fog = theme.sky.fogEnabled === false ? null : new THREE.Fog(theme.sky.fogColor, theme.sky.fogNear, theme.sky.fogFar);

// Apply skybox or solid color background
if (theme.sky.skybox && theme.sky.skybox.enabled) {
    // Skybox will be applied after scene is defined
    scene.background = new THREE.Color(theme.sky.color); // temporary
} else {
    scene.background = new THREE.Color(theme.sky.color);
}

// Camera
export const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 1, 3000);
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

// Post-processing (Three.js built-in)
export const composer = new EffectComposer(renderer);
const renderPass = new RenderPass(scene, camera);
composer.addPass(renderPass);

// Volumetric light (god rays) shader pass
const VolumetricLightShader = {
    uniforms: {
        tDiffuse: { value: null },
        lightPosition: { value: new THREE.Vector2(0.5, 0.5) },
        exposure: { value: 0.06 },
        decay: { value: 0.96 },
        density: { value: 0.4 },
        weight: { value: 0.12 },
        enabled: { value: 0.0 }
    },
    vertexShader: `
        varying vec2 vUv;
        void main() {
            vUv = uv;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
    `,
    fragmentShader: `
        uniform sampler2D tDiffuse;
        uniform vec2 lightPosition;
        uniform float exposure;
        uniform float decay;
        uniform float density;
        uniform float weight;
        uniform float enabled;
        varying vec2 vUv;

        // Hash for dithering to break up banding
        float hash(vec2 p) {
            return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
        }

        void main() {
            vec4 texColor = texture2D(tDiffuse, vUv);
            if (enabled < 0.5) {
                gl_FragColor = texColor;
                return;
            }

            const int NUM_SAMPLES = 64;
            vec2 texCoord = vUv;
            vec2 deltaTextCoord = (texCoord - lightPosition);
            deltaTextCoord *= 1.0 / float(NUM_SAMPLES) * density;

            // Distance from pixel to light center — fade rays at edges
            float distToLight = length(vUv - lightPosition);
            float distFade = 1.0 - smoothstep(0.3, 0.9, distToLight);

            // Dither the start position to break up banding
            float dither = hash(vUv * 1000.0) * 0.5;
            texCoord -= deltaTextCoord * dither;

            float illuminationDecay = 1.0;
            vec3 godrayColor = vec3(0.0);

            for (int i = 0; i < NUM_SAMPLES; i++) {
                texCoord -= deltaTextCoord;
                vec4 sampleColor = texture2D(tDiffuse, clamp(texCoord, 0.0, 1.0));
                // High threshold — only actual bright light sources (window)
                float lum = dot(sampleColor.rgb, vec3(0.299, 0.587, 0.114));
                float brightMask = smoothstep(0.7, 0.95, lum);
                godrayColor += sampleColor.rgb * brightMask * illuminationDecay * weight;
                illuminationDecay *= decay;
            }

            godrayColor *= exposure * distFade;
            // Warm sunlight tint
            godrayColor *= vec3(1.0, 0.96, 0.88);
            gl_FragColor = texColor + vec4(godrayColor, 0.0);
        }
    `
};

const godraysShaderPass = new ShaderPass(VolumetricLightShader);
godraysShaderPass.uniforms.enabled.value = 0.0;
composer.addPass(godraysShaderPass);

// Depth of field (race mode only)
export const bokehPass = new BokehPass(scene, camera, {
    focus: 17,
    aperture: 0.001,
    maxblur: 0.0032
});
bokehPass.enabled = false;
composer.addPass(bokehPass);

const outputPass = new OutputPass();
composer.addPass(outputPass);

// God rays: project light world position to screen space each frame
let godraysLight = null;

export function setupGodrays(light) {
    godraysLight = light;
    godraysShaderPass.uniforms.enabled.value = 1.0;
}

export function removeGodrays() {
    godraysLight = null;
    godraysShaderPass.uniforms.enabled.value = 0.0;
}

export function updateGodraysLightPosition() {
    if (!godraysLight) return;
    // Project light position to screen space
    const lightPos = godraysLight.position.clone();
    lightPos.project(camera);
    godraysShaderPass.uniforms.lightPosition.value.set(
        (lightPos.x + 1) / 2,
        (lightPos.y + 1) / 2
    );
}

export function setDOFEnabled(enabled) {
    bokehPass.enabled = enabled;
}

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
directionalLight.shadow.mapSize.width = 4096;
directionalLight.shadow.mapSize.height = 4096;
directionalLight.shadow.camera.near = 1;
directionalLight.shadow.camera.far = 3000;
directionalLight.shadow.camera.left = -800;
directionalLight.shadow.camera.right = 800;
directionalLight.shadow.camera.top = 1100;
directionalLight.shadow.camera.bottom = -1100;
directionalLight.shadow.bias = -0.002;
scene.add(directionalLight);

// Create plastic texture for ground (subtle dot pattern like a playmat)
function createPlasticTexture(baseColor, dotColor, scale) {
    const canvas = document.createElement('canvas');
    const size = 256;
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');

    // Base color
    ctx.fillStyle = '#' + baseColor.toString(16).padStart(6, '0');
    ctx.fillRect(0, 0, size, size);

    // Subtle dot pattern (like textured plastic)
    ctx.fillStyle = '#' + dotColor.toString(16).padStart(6, '0');
    const dotSpacing = size / scale;
    const dotRadius = dotSpacing * 0.15;

    for (let x = dotSpacing / 2; x < size; x += dotSpacing) {
        for (let y = dotSpacing / 2; y < size; y += dotSpacing) {
            ctx.beginPath();
            ctx.arc(x, y, dotRadius, 0, Math.PI * 2);
            ctx.fill();
        }
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(30, 30);
    return texture;
}

// Skybox generation for themes that support it
let currentSkybox = null;

function generateSkyboxFace(size, config, faceIndex) {
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');

    // Face indices: 0=+x, 1=-x, 2=+y(top), 3=-y(bottom), 4=+z, 5=-z
    const base = config.baseColor;
    const horizon = config.horizonColor;

    // Gradient from horizon (bottom) to deep sky (top)
    const isTop = faceIndex === 2;
    const isBottom = faceIndex === 3;

    if (isBottom) {
        // Bottom face - dark, mostly invisible under the ground
        ctx.fillStyle = `rgb(${base.r}, ${base.g}, ${base.b})`;
        ctx.fillRect(0, 0, size, size);
        return canvas;
    }

    // Base gradient
    const grad = ctx.createLinearGradient(0, 0, 0, size);
    if (isTop) {
        grad.addColorStop(0, `rgb(${base.r}, ${base.g}, ${base.b})`);
        grad.addColorStop(1, `rgb(${base.r}, ${base.g}, ${base.b})`);
    } else {
        // Side faces: darker at top, horizon glow at bottom
        grad.addColorStop(0, `rgb(${base.r}, ${base.g}, ${base.b})`);
        grad.addColorStop(0.7, `rgb(${Math.floor((base.r + horizon.r) / 2)}, ${Math.floor((base.g + horizon.g) / 2)}, ${Math.floor((base.b + horizon.b) / 2)})`);
        grad.addColorStop(1, `rgb(${horizon.r}, ${horizon.g}, ${horizon.b})`);
    }
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, size, size);

    // Nebula clouds
    if (config.nebula) {
        for (const neb of config.nebula) {
            // Offset nebula per face for variety
            const ox = (neb.x + faceIndex * 0.17) % 1;
            const oy = neb.y;
            const radGrad = ctx.createRadialGradient(
                ox * size, oy * size, 0,
                ox * size, oy * size, Math.max(neb.rx, neb.ry) * size
            );
            radGrad.addColorStop(0, neb.color);
            radGrad.addColorStop(1, 'rgba(0,0,0,0)');
            ctx.fillStyle = radGrad;
            ctx.fillRect(0, 0, size, size);
        }
    }

    // Hex grid pattern on side faces (arena dome effect)
    if (!isTop && config.hexGrid && config.hexGrid.enabled) {
        const hexSize = config.hexGrid.size;
        const hh = hexSize * Math.sqrt(3);
        ctx.strokeStyle = config.hexGrid.color;
        ctx.lineWidth = config.hexGrid.lineWidth;

        // Only draw in the lower portion (horizon area) with fade
        const gridStartY = size * 0.5;
        ctx.save();
        const fadeGrad = ctx.createLinearGradient(0, gridStartY, 0, size);
        fadeGrad.addColorStop(0, 'rgba(0,0,0,0)');
        fadeGrad.addColorStop(0.3, config.hexGrid.color);
        fadeGrad.addColorStop(1, config.hexGrid.glowColor);

        for (let row = 0; row < size / hh + 1; row++) {
            for (let col = 0; col < size / (hexSize * 1.5) + 1; col++) {
                const cx = col * hexSize * 1.5;
                const cy = gridStartY + row * hh + (col % 2 === 1 ? hh / 2 : 0);
                if (cy < gridStartY) continue;

                // Fade opacity based on vertical position
                const t = Math.min(1, (cy - gridStartY) / (size - gridStartY));
                const alpha = t * 0.12;
                ctx.strokeStyle = `rgba(0, 255, 136, ${alpha})`;

                ctx.beginPath();
                for (let i = 0; i < 6; i++) {
                    const angle = (Math.PI / 3) * i + Math.PI / 6;
                    const hx = cx + hexSize * 0.8 * Math.cos(angle);
                    const hy = cy + hexSize * 0.8 * Math.sin(angle);
                    if (i === 0) ctx.moveTo(hx, hy);
                    else ctx.lineTo(hx, hy);
                }
                ctx.closePath();
                ctx.stroke();
            }
        }
        ctx.restore();
    }

    // Stars
    if (config.stars && !isBottom) {
        const starCount = isTop ? config.stars.count : Math.floor(config.stars.count * 0.6);
        // Seed per face for consistency
        let seed = faceIndex * 1337;
        const rng = () => {
            seed = (seed * 16807 + 0) % 2147483647;
            return seed / 2147483647;
        };

        for (let i = 0; i < starCount; i++) {
            const sx = rng() * size;
            const sy = rng() * size;
            const starSize = config.stars.minSize + rng() * (config.stars.maxSize - config.stars.minSize);
            const brightness = 0.4 + rng() * 0.6;

            // Star glow
            if (starSize > 1.2) {
                const glowGrad = ctx.createRadialGradient(sx, sy, 0, sx, sy, starSize * 3);
                glowGrad.addColorStop(0, `rgba(170, 204, 255, ${brightness * 0.15})`);
                glowGrad.addColorStop(1, 'rgba(170, 204, 255, 0)');
                ctx.fillStyle = glowGrad;
                ctx.fillRect(sx - starSize * 3, sy - starSize * 3, starSize * 6, starSize * 6);
            }

            // Star core
            ctx.fillStyle = `rgba(255, 255, 255, ${brightness})`;
            ctx.beginPath();
            ctx.arc(sx, sy, starSize * 0.5, 0, Math.PI * 2);
            ctx.fill();
        }
    }

    return canvas;
}

function createSkybox(skyboxConfig) {
    const size = 1024;
    const faces = [];

    // CubeTexture order: +x, -x, +y, -y, +z, -z
    for (let i = 0; i < 6; i++) {
        faces.push(generateSkyboxFace(size, skyboxConfig, i));
    }

    const cubeTexture = new THREE.CubeTexture(faces);
    cubeTexture.needsUpdate = true;
    return cubeTexture;
}

function applySkybox(theme) {
    if (theme.sky.skybox && theme.sky.skybox.enabled) {
        currentSkybox = createSkybox(theme.sky.skybox);
        scene.background = currentSkybox;
    } else {
        currentSkybox = null;
        scene.background = new THREE.Color(theme.sky.color);
    }
}

// Game board (raised 3D platform like Hitman Go)
const boardGroup = new THREE.Group();
scene.add(boardGroup);

// Create rounded rectangle shape for the board
function createBoardShape(size, radius) {
    const shape = new THREE.Shape();
    const h = size / 2;
    const r = Math.min(radius, h);

    shape.moveTo(-h + r, -h);
    shape.lineTo(h - r, -h);
    shape.quadraticCurveTo(h, -h, h, -h + r);
    shape.lineTo(h, h - r);
    shape.quadraticCurveTo(h, h, h - r, h);
    shape.lineTo(-h + r, h);
    shape.quadraticCurveTo(-h, h, -h, h - r);
    shape.lineTo(-h, -h + r);
    shape.quadraticCurveTo(-h, -h, -h + r, -h);

    return shape;
}

function buildGameBoard(themeData) {
    // Clear existing board
    while (boardGroup.children.length > 0) {
        const child = boardGroup.children[0];
        boardGroup.remove(child);
        if (child.geometry) child.geometry.dispose();
        if (child.material) {
            if (Array.isArray(child.material)) child.material.forEach(m => m.dispose());
            else child.material.dispose();
        }
    }

    // In pastel/bedroom theme, hide procedural board — room model's rug is the surface
    if (themeData.bedroom && themeData.bedroom.enabled) {
        boardGroup.visible = false;
        return;
    }
    boardGroup.visible = true;

    const board = themeData.ground.board || { size: 420, thickness: 20, lipHeight: 3, cornerRadius: 2 };
    const boardSize = board.size;
    const thickness = board.thickness;
    const lipHeight = board.lipHeight || 3;
    const cornerRadius = board.cornerRadius || 2;

    // Top surface texture
    let topTexture = null;
    if (themeData.ground.textured) {
        topTexture = createPlasticTexture(
            themeData.ground.color,
            themeData.ground.textureColor || themeData.ground.color,
            themeData.ground.textureScale || 20
        );
    }

    // Materials
    const topMaterial = new THREE.MeshStandardMaterial({
        color: themeData.ground.color,
        roughness: themeData.ground.roughness,
        metalness: themeData.ground.metalness || 0,
        map: topTexture
    });

    // Cream/white lip material
    const lipMaterial = new THREE.MeshStandardMaterial({
        color: board.lipColor || 0xf5f0e8,
        roughness: 0.3,
        metalness: 0.05,
        emissive: board.lipEmissive || 0x000000,
        emissiveIntensity: board.lipEmissiveIntensity || 0
    });

    // Dark wood base material
    const baseMaterial = new THREE.MeshStandardMaterial({
        color: board.baseColor || 0x5c3a1e,
        roughness: 0.6,
        metalness: 0.05
    });

    // Bottom material
    const bottomMaterial = new THREE.MeshStandardMaterial({
        color: board.bottomColor || 0x4a2e16,
        roughness: 0.8,
        metalness: 0
    });

    // --- Top green surface (at y=0) ---
    const topShape = createBoardShape(boardSize - 4, cornerRadius);
    const topGeo = new THREE.ShapeGeometry(topShape);
    const topMesh = new THREE.Mesh(topGeo, topMaterial);
    topMesh.rotation.x = -Math.PI / 2;
    topMesh.position.y = 0.1;
    topMesh.receiveShadow = true;
    boardGroup.add(topMesh);

    // --- Cream lip (thin raised rim around the board edge) ---
    // With rotation.x = -PI/2, extrude goes upward (+Y).
    // Lip rises 0.8 above surface, extends lipHeight below.
    const lipRaise = 0.8;
    const lipShape = createBoardShape(boardSize, cornerRadius);
    const lipInnerShape = createBoardShape(boardSize - 3, cornerRadius);
    lipShape.holes.push(lipInnerShape);
    const lipGeo = new THREE.ExtrudeGeometry(lipShape, {
        depth: lipHeight + lipRaise,
        bevelEnabled: false
    });
    const lipMesh = new THREE.Mesh(lipGeo, lipMaterial);
    lipMesh.rotation.x = -Math.PI / 2;
    lipMesh.position.y = -lipHeight; // face at -lipHeight, extrudes up to lipRaise
    lipMesh.receiveShadow = true;
    lipMesh.castShadow = true;
    boardGroup.add(lipMesh);

    // --- Dark wood base (thick portion below the lip) ---
    const baseHeight = thickness - lipHeight;
    const baseShape = createBoardShape(boardSize + 2, cornerRadius);
    const baseGeo = new THREE.ExtrudeGeometry(baseShape, {
        depth: baseHeight,
        bevelEnabled: false
    });
    const baseMesh = new THREE.Mesh(baseGeo, baseMaterial);
    baseMesh.rotation.x = -Math.PI / 2;
    baseMesh.position.y = -thickness; // face at -thickness, extrudes up to -lipHeight
    baseMesh.receiveShadow = true;
    baseMesh.castShadow = true;
    boardGroup.add(baseMesh);

    // --- Bottom face ---
    const bottomGeo = new THREE.ShapeGeometry(createBoardShape(boardSize + 2, cornerRadius));
    const bottomMesh = new THREE.Mesh(bottomGeo, bottomMaterial);
    bottomMesh.rotation.x = Math.PI / 2;
    bottomMesh.position.y = -thickness;
    boardGroup.add(bottomMesh);


}

// Build initial board
buildGameBoard(theme);

// Grid helper for building (fallback for themes without custom grid)
export const gridHelper = new THREE.GridHelper(400, 40, 0x444444, 0x333333);
gridHelper.visible = false;
scene.add(gridHelper);

// Custom grid with rounded squares (for pastel theme)
let customGrid = null;

// Initialize custom grid after scene is ready
export function initCustomGrid() {
    customGrid = createCustomGrid(scene);
}

// Show or hide the building grid
export function showBuildingGrid(visible) {
    if (hasCustomGrid()) {
        setGridVisible(visible);
        gridHelper.visible = false; // Always hide line grid when custom is available
    } else {
        gridHelper.visible = visible;
    }
}

// Raycaster utilities
export const raycaster = new THREE.Raycaster();
export const mouseVec = new THREE.Vector2();
export const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);

// Update scene colors when theme changes
export function updateSceneTheme() {
    const newTheme = getCurrentTheme();

    // Update sky/skybox and fog
    applySkybox(newTheme);
    if (newTheme.sky.fogEnabled === false) {
        scene.fog = null;
    } else {
        scene.fog = new THREE.Fog(newTheme.sky.fogColor, newTheme.sky.fogNear, newTheme.sky.fogFar);
    }

    // Rebuild game board for new theme
    buildGameBoard(newTheme);

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
    // Apply skybox for initial theme if applicable
    applySkybox(theme);
}
