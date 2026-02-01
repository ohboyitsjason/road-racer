import * as THREE from 'three';
import { DECORATION_DATA } from '../constants.js';
import { getColor, getThemeObject, onThemeChange } from '../theme/themeManager.js';

// Track decoration materials for theme updates
const decorationMaterials = new Set();

// Create grandstand with fans
function createGrandstand() {
    const group = new THREE.Group();
    const width = DECORATION_DATA['grandstand'].width;
    const depth = DECORATION_DATA['grandstand'].depth;
    const theme = getThemeObject('decorations.grandstand');

    // Base/foundation
    const baseGeom = new THREE.BoxGeometry(width, 1, depth);
    const baseMat = new THREE.MeshStandardMaterial({ color: theme.base });
    baseMat.userData.themeKey = 'decorations.grandstand.base';
    decorationMaterials.add(baseMat);
    const base = new THREE.Mesh(baseGeom, baseMat);
    base.position.y = 0.5;
    base.castShadow = true;
    base.receiveShadow = true;
    group.add(base);

    // Tiered seating (3 rows)
    const seatMat = new THREE.MeshStandardMaterial({ color: theme.seats });
    seatMat.userData.themeKey = 'decorations.grandstand.seats';
    decorationMaterials.add(seatMat);
    for (let row = 0; row < 3; row++) {
        const seatGeom = new THREE.BoxGeometry(width - 1, 1.5, 2);
        const seat = new THREE.Mesh(seatGeom, seatMat);
        seat.position.set(0, 1.5 + row * 1.8, -depth / 2 + 2 + row * 2.5);
        seat.castShadow = true;
        group.add(seat);
    }

    // Roof/canopy
    const roofGeom = new THREE.BoxGeometry(width + 2, 0.5, depth + 2);
    const roofMat = new THREE.MeshStandardMaterial({ color: theme.roof });
    roofMat.userData.themeKey = 'decorations.grandstand.roof';
    decorationMaterials.add(roofMat);
    const roof = new THREE.Mesh(roofGeom, roofMat);
    roof.position.set(0, 8, 0);
    roof.castShadow = true;
    group.add(roof);

    // Support pillars
    const pillarGeom = new THREE.CylinderGeometry(0.3, 0.3, 7, 8);
    const pillarMat = new THREE.MeshStandardMaterial({ color: theme.supports });
    pillarMat.userData.themeKey = 'decorations.grandstand.supports';
    decorationMaterials.add(pillarMat);
    [[-width / 2 + 1, -depth / 2 + 1], [width / 2 - 1, -depth / 2 + 1],
     [-width / 2 + 1, depth / 2 - 1], [width / 2 - 1, depth / 2 - 1]].forEach(([x, z]) => {
        const pillar = new THREE.Mesh(pillarGeom, pillarMat);
        pillar.position.set(x, 4.5, z);
        pillar.castShadow = true;
        group.add(pillar);
    });

    // Fans (simple cylinders with sphere heads)
    const fanGroup = new THREE.Group();
    fanGroup.name = 'fans';
    const fanColors = [0xff6600, 0xffff00, 0x00ff00, 0xff0066, 0x00ffff];

    for (let row = 0; row < 3; row++) {
        const fansInRow = Math.floor((width - 4) / 2);
        for (let i = 0; i < fansInRow; i++) {
            const fanColor = fanColors[Math.floor(Math.random() * fanColors.length)];

            // Body
            const bodyGeom = new THREE.CylinderGeometry(0.3, 0.25, 1.2, 8);
            const bodyMat = new THREE.MeshStandardMaterial({ color: fanColor });
            const body = new THREE.Mesh(bodyGeom, bodyMat);

            // Head
            const headGeom = new THREE.SphereGeometry(0.35, 8, 8);
            const headMat = new THREE.MeshStandardMaterial({ color: 0xffdbac });
            const head = new THREE.Mesh(headGeom, headMat);
            head.position.y = 0.9;

            const fan = new THREE.Group();
            fan.add(body);
            fan.add(head);

            const x = -width / 2 + 2 + i * 2 + (row % 2) * 1;
            const y = 2.5 + row * 1.8;
            const z = -depth / 2 + 2.5 + row * 2.5;
            fan.position.set(x, y, z);

            // Store original position for animation
            fan.userData.originalY = y;
            fan.userData.animPhase = Math.random() * Math.PI * 2;

            fanGroup.add(fan);
        }
    }
    group.add(fanGroup);

    group.userData.isDecoration = true;
    group.userData.decorationType = 'grandstand';
    return group;
}

// Create pyrotechnic flame jet
function createPyro() {
    const group = new THREE.Group();
    const theme = getThemeObject('decorations.pyro');

    // Base platform
    const baseGeom = new THREE.CylinderGeometry(1.5, 2, 1, 8);
    const baseMat = new THREE.MeshStandardMaterial({ color: theme.base });
    baseMat.userData.themeKey = 'decorations.pyro.base';
    decorationMaterials.add(baseMat);
    const base = new THREE.Mesh(baseGeom, baseMat);
    base.position.y = 0.5;
    base.castShadow = true;
    group.add(base);

    // Jet nozzle
    const nozzleGeom = new THREE.CylinderGeometry(0.4, 0.6, 1.5, 8);
    const nozzleMat = new THREE.MeshStandardMaterial({ color: 0x222222 });
    const nozzle = new THREE.Mesh(nozzleGeom, nozzleMat);
    nozzle.position.y = 1.75;
    nozzle.castShadow = true;
    group.add(nozzle);

    // Flame particle system (inactive by default)
    const flameGroup = new THREE.Group();
    flameGroup.name = 'flames';
    flameGroup.visible = false;

    // Create flame particles
    for (let i = 0; i < 15; i++) {
        const size = 0.3 + Math.random() * 0.5;
        const flameGeom = new THREE.SphereGeometry(size, 8, 8);
        const flameMat = new THREE.MeshBasicMaterial({
            color: i < 5 ? 0xffff00 : (i < 10 ? theme.flame : 0xff0000),
            transparent: true,
            opacity: 0.8
        });
        const flame = new THREE.Mesh(flameGeom, flameMat);
        flame.position.set(
            (Math.random() - 0.5) * 0.8,
            2.5 + i * 0.4,
            (Math.random() - 0.5) * 0.8
        );
        flame.userData.baseY = flame.position.y;
        flame.userData.phase = Math.random() * Math.PI * 2;
        flameGroup.add(flame);
    }
    group.add(flameGroup);

    // Point light for flame effect
    const flameLight = new THREE.PointLight(theme.flame, 0, 15);
    flameLight.position.y = 4;
    flameLight.name = 'flameLight';
    group.add(flameLight);

    group.userData.isDecoration = true;
    group.userData.decorationType = 'pyro';
    group.userData.triggerCooldown = 0;
    return group;
}

// Create single tree (doubled size)
function createTree() {
    const group = new THREE.Group();
    const theme = getThemeObject('decorations.tree');

    // Trunk (doubled: 0.3->0.6, 0.5->1.0, 3->6)
    const trunkGeom = new THREE.CylinderGeometry(0.6, 1.0, 6, 8);
    const trunkMat = new THREE.MeshStandardMaterial({ color: theme.trunk });
    trunkMat.userData.themeKey = 'decorations.tree.trunk';
    decorationMaterials.add(trunkMat);
    const trunk = new THREE.Mesh(trunkGeom, trunkMat);
    trunk.position.y = 3; // doubled from 1.5
    trunk.castShadow = true;
    group.add(trunk);

    // Foliage (layered cones - doubled sizes)
    const foliageMat = new THREE.MeshStandardMaterial({ color: theme.foliage });
    foliageMat.userData.themeKey = 'decorations.tree.foliage';
    decorationMaterials.add(foliageMat);
    for (let i = 0; i < 3; i++) {
        const foliageGeom = new THREE.ConeGeometry(5.0 - i * 1.0, 5.0, 8); // doubled: 2.5->5.0, 0.5->1.0, 2.5->5.0
        const foliage = new THREE.Mesh(foliageGeom, foliageMat);
        foliage.position.y = 7 + i * 3; // doubled: 3.5->7, 1.5->3
        foliage.castShadow = true;
        group.add(foliage);
    }

    group.userData.isDecoration = true;
    group.userData.decorationType = 'tree';
    return group;
}

// Create tree cluster
function createTreeCluster() {
    const group = new THREE.Group();

    const positions = [
        [0, 0], [-3, -2], [3, -1], [-1, 3], [2, 2.5]
    ];

    positions.forEach(([x, z], i) => {
        const tree = createTree();
        const scale = 0.7 + Math.random() * 0.5;
        tree.scale.set(scale, scale, scale);
        tree.position.set(x, 0, z);
        tree.rotation.y = Math.random() * Math.PI * 2;
        group.add(tree);
    });

    group.userData.isDecoration = true;
    group.userData.decorationType = 'tree-cluster';
    return group;
}

// Create rock formation
function createRocks() {
    const group = new THREE.Group();
    const rockColors = getThemeObject('decorations.rocks').colors;
    const rockMat = new THREE.MeshStandardMaterial({
        color: rockColors[0],
        roughness: 0.9
    });
    rockMat.userData.themeKey = 'decorations.rocks.colors';
    decorationMaterials.add(rockMat);

    const rockPositions = [
        { pos: [0, 0, 0], scale: [2, 1.5, 2] },
        { pos: [-4, 0, 1.5], scale: [1.5, 1, 1.5] },
        { pos: [5, 0, -1], scale: [1.8, 1.2, 1.6] },
        { pos: [1, 0, 2.5], scale: [1.2, 0.8, 1.3] },
        { pos: [-3, 0, -2], scale: [1.4, 0.9, 1.2] }
    ];

    rockPositions.forEach(({ pos, scale }, i) => {
        const rockGeom = new THREE.DodecahedronGeometry(3, 0);
        const individualRockMat = new THREE.MeshStandardMaterial({
            color: rockColors[i % rockColors.length],
            roughness: 0.9
        });
        const rock = new THREE.Mesh(rockGeom, individualRockMat);
        rock.position.set(pos[0], scale[1] * 0.5, pos[2]);
        rock.scale.set(scale[0], scale[1], scale[2]);
        rock.rotation.set(Math.random() * 0.5, Math.random() * Math.PI * 2, Math.random() * 0.5);
        rock.castShadow = true;
        rock.receiveShadow = true;
        group.add(rock);
    });

    group.userData.isDecoration = true;
    group.userData.decorationType = 'rocks';
    return group;
}

// Create bush
function createBush() {
    const group = new THREE.Group();
    const bushMat = new THREE.MeshStandardMaterial({ color: getColor('decorations.bush.color') });
    bushMat.userData.themeKey = 'decorations.bush.color';
    decorationMaterials.add(bushMat);

    // Multiple overlapping spheres for bush shape
    const spheres = [
        { pos: [0, 0.6, 0], r: 1 },
        { pos: [0.6, 0.5, 0.3], r: 0.7 },
        { pos: [-0.5, 0.4, 0.4], r: 0.6 },
        { pos: [0.2, 0.8, -0.4], r: 0.5 },
        { pos: [-0.3, 0.7, -0.3], r: 0.55 }
    ];

    spheres.forEach(({ pos, r }) => {
        const sphereGeom = new THREE.SphereGeometry(r, 24, 24);
        const sphere = new THREE.Mesh(sphereGeom, bushMat);
        sphere.position.set(pos[0], pos[1], pos[2]);
        sphere.castShadow = true;
        group.add(sphere);
    });

    group.userData.isDecoration = true;
    group.userData.decorationType = 'bush';
    return group;
}

// Create sponsor banner
function createBanner() {
    const group = new THREE.Group();
    const theme = getThemeObject('decorations.banner');

    // Banner poles
    const poleGeom = new THREE.CylinderGeometry(0.15, 0.15, 12, 8);
    const poleMat = new THREE.MeshStandardMaterial({ color: theme.pole });
    poleMat.userData.themeKey = 'decorations.banner.pole';
    decorationMaterials.add(poleMat);

    const pole1 = new THREE.Mesh(poleGeom, poleMat);
    pole1.position.set(-8, 6, 0);
    pole1.castShadow = true;
    group.add(pole1);

    const pole2 = new THREE.Mesh(poleGeom, poleMat);
    pole2.position.set(8, 6, 0);
    pole2.castShadow = true;
    group.add(pole2);

    // Banner canvas
    const bannerGeom = new THREE.PlaneGeometry(16, 8);

    // Create canvas texture for banner
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 96;
    const ctx = canvas.getContext('2d');

    // Convert hex to CSS color
    const flagColor = '#' + theme.flag.toString(16).padStart(6, '0');

    // Banner background
    ctx.fillStyle = flagColor;
    ctx.fillRect(0, 0, 256, 96);

    // Checkered border
    ctx.fillStyle = '#ffffff';
    for (let i = 0; i < 16; i++) {
        if (i % 2 === 0) {
            ctx.fillRect(i * 16, 0, 16, 8);
            ctx.fillRect(i * 16, 88, 16, 8);
        } else {
            ctx.fillRect(i * 16, 0, 16, 8);
        }
    }

    // Text
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 36px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('GO GO GO', 128, 58);

    const bannerTexture = new THREE.CanvasTexture(canvas);
    const bannerMat = new THREE.MeshStandardMaterial({
        map: bannerTexture,
        side: THREE.DoubleSide
    });

    const banner = new THREE.Mesh(bannerGeom, bannerMat);
    banner.position.set(0, 9, 0);
    banner.castShadow = true;
    group.add(banner);

    group.userData.isDecoration = true;
    group.userData.decorationType = 'banner';
    return group;
}

// Create tire stack
function createTireStack() {
    const group = new THREE.Group();
    const theme = getThemeObject('decorations.tireStack');
    const tireMat = new THREE.MeshStandardMaterial({ color: theme.tire });
    tireMat.userData.themeKey = 'decorations.tireStack.tire';
    decorationMaterials.add(tireMat);

    // Stack of tires
    for (let layer = 0; layer < 3; layer++) {
        const tiresInLayer = layer === 2 ? 1 : (layer === 1 ? 2 : 3);
        const offset = layer === 0 ? -0.8 : (layer === 1 ? -0.4 : 0);

        for (let i = 0; i < tiresInLayer; i++) {
            const tireGeom = new THREE.TorusGeometry(0.5, 0.25, 8, 16);
            const tire = new THREE.Mesh(tireGeom, tireMat);
            tire.rotation.x = Math.PI / 2;
            tire.position.set(
                offset + i * 0.8,
                0.3 + layer * 0.55,
                0
            );
            tire.castShadow = true;
            group.add(tire);
        }
    }

    group.userData.isDecoration = true;
    group.userData.decorationType = 'tire-stack';
    return group;
}

// Main factory function
export function createDecoration(type) {
    switch (type) {
        case 'grandstand': return createGrandstand();
        case 'pyro': return createPyro();
        case 'tree': return createTree();
        case 'tree-cluster': return createTreeCluster();
        case 'rocks': return createRocks();
        case 'bush': return createBush();
        case 'banner': return createBanner();
        case 'tire-stack': return createTireStack();
        default:
            console.warn(`Unknown decoration type: ${type}`);
            return new THREE.Group();
    }
}

// Update materials when theme changes
function updateDecorationMaterialsTheme() {
    decorationMaterials.forEach(mat => {
        if (mat.userData.themeKey) {
            const value = getColor(mat.userData.themeKey);
            if (typeof value === 'number') {
                mat.color.setHex(value);
            } else if (Array.isArray(value)) {
                mat.color.setHex(value[0]);
            }
        }
    });
}

// Subscribe to theme changes
onThemeChange(() => {
    updateDecorationMaterialsTheme();
});
