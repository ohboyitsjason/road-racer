import * as THREE from 'three';
import { getCurrentTheme, onThemeChange } from '../theme/themeManager.js';

const GRID_SIZE = 10; // Size of each grid cell
const GRID_COUNT = 40; // Number of cells in each direction
const GRID_EXTENT = (GRID_COUNT * GRID_SIZE) / 2; // Half the total grid size

let gridGroup = null;
let gridCells = new Map(); // Map of "x,z" -> mesh
let highlightedCells = new Set(); // Currently highlighted cell keys
let gridMaterial = null;
let highlightMaterial = null;

// Create a rounded square shape
function createRoundedSquareShape(size, radius) {
    const shape = new THREE.Shape();
    const halfSize = size / 2;
    const r = radius * size;

    shape.moveTo(-halfSize + r, -halfSize);
    shape.lineTo(halfSize - r, -halfSize);
    shape.quadraticCurveTo(halfSize, -halfSize, halfSize, -halfSize + r);
    shape.lineTo(halfSize, halfSize - r);
    shape.quadraticCurveTo(halfSize, halfSize, halfSize - r, halfSize);
    shape.lineTo(-halfSize + r, halfSize);
    shape.quadraticCurveTo(-halfSize, halfSize, -halfSize, halfSize - r);
    shape.lineTo(-halfSize, -halfSize + r);
    shape.quadraticCurveTo(-halfSize, -halfSize, -halfSize + r, -halfSize);

    return shape;
}

// Create the grid of rounded squares
export function createCustomGrid(scene) {
    const theme = getCurrentTheme();

    // If theme doesn't use rounded squares, return null (use default grid)
    if (!theme.grid?.useRoundedSquares) {
        return null;
    }

    gridGroup = new THREE.Group();
    gridGroup.visible = false;

    const cellGap = theme.grid.cellGap || 0.12;
    const cornerRadius = theme.grid.cornerRadius || 0.15;
    const cellSize = GRID_SIZE * (1 - cellGap);

    // Create shared geometry
    const shape = createRoundedSquareShape(cellSize, cornerRadius);
    const geometry = new THREE.ShapeGeometry(shape);

    // Create materials
    gridMaterial = new THREE.MeshStandardMaterial({
        color: theme.grid.cellColor,
        transparent: true,
        opacity: theme.grid.opacity || 0.85,
        roughness: 0.6,
        metalness: 0.1,
        side: THREE.DoubleSide
    });

    highlightMaterial = new THREE.MeshStandardMaterial({
        color: theme.grid.highlightColor,
        transparent: true,
        opacity: theme.grid.opacity || 0.85,
        roughness: 0.5,
        metalness: 0.15,
        side: THREE.DoubleSide
    });

    // Create grid cells
    for (let x = -GRID_EXTENT + GRID_SIZE / 2; x < GRID_EXTENT; x += GRID_SIZE) {
        for (let z = -GRID_EXTENT + GRID_SIZE / 2; z < GRID_EXTENT; z += GRID_SIZE) {
            const cell = new THREE.Mesh(geometry, gridMaterial);
            cell.rotation.x = -Math.PI / 2;
            cell.position.set(x, 0.115, z);
            cell.receiveShadow = true;

            const key = `${x},${z}`;
            gridCells.set(key, cell);
            gridGroup.add(cell);
        }
    }

    scene.add(gridGroup);
    return gridGroup;
}

// Get the grid cell key for a world position
function getCellKey(worldX, worldZ) {
    const cellX = Math.round(worldX / GRID_SIZE) * GRID_SIZE;
    const cellZ = Math.round(worldZ / GRID_SIZE) * GRID_SIZE;
    return `${cellX},${cellZ}`;
}

// Highlight cells that a piece would occupy
export function highlightCells(positions) {
    if (!gridGroup) return;

    // Clear previous highlights
    clearHighlights();

    // Highlight new cells
    positions.forEach(pos => {
        const key = getCellKey(pos.x, pos.z);
        const cell = gridCells.get(key);
        if (cell) {
            cell.material = highlightMaterial;
            highlightedCells.add(key);
        }
    });
}

// Highlight cells in a rectangular area (for piece preview)
export function highlightArea(centerX, centerZ, lengthX, lengthZ, rotation = 0) {
    if (!gridGroup) return;

    clearHighlights();

    // Calculate the corners based on rotation
    const cos = Math.cos(rotation);
    const sin = Math.sin(rotation);

    // Sample points within the piece footprint
    const halfX = lengthX / 2;
    const halfZ = lengthZ / 2;

    for (let lx = -halfX + GRID_SIZE / 2; lx < halfX; lx += GRID_SIZE) {
        for (let lz = -halfZ + GRID_SIZE / 2; lz < halfZ; lz += GRID_SIZE) {
            // Rotate the local position
            const worldX = centerX + lx * cos - lz * sin;
            const worldZ = centerZ + lx * sin + lz * cos;

            const key = getCellKey(worldX, worldZ);
            const cell = gridCells.get(key);
            if (cell) {
                cell.material = highlightMaterial;
                highlightedCells.add(key);
            }
        }
    }
}

// Clear all highlights
export function clearHighlights() {
    if (!gridGroup) return;

    highlightedCells.forEach(key => {
        const cell = gridCells.get(key);
        if (cell) {
            cell.material = gridMaterial;
        }
    });
    highlightedCells.clear();
}

// Show/hide the grid
export function setGridVisible(visible) {
    if (gridGroup) {
        gridGroup.visible = visible;
    }
}

// Check if custom grid is active
export function hasCustomGrid() {
    return gridGroup !== null;
}

// Update grid theme
export function updateGridTheme() {
    const theme = getCurrentTheme();

    if (!theme.grid?.useRoundedSquares) {
        // Theme doesn't use custom grid, hide it
        if (gridGroup) {
            gridGroup.visible = false;
        }
        return false;
    }

    if (gridMaterial) {
        gridMaterial.color.setHex(theme.grid.cellColor);
        gridMaterial.opacity = theme.grid.opacity || 0.85;
    }

    if (highlightMaterial) {
        highlightMaterial.color.setHex(theme.grid.highlightColor);
        highlightMaterial.opacity = theme.grid.opacity || 0.85;
    }

    return true;
}

// Subscribe to theme changes
onThemeChange(() => {
    updateGridTheme();
});

// Center the grid on a given world position
export function centerGridOn(worldX, worldZ) {
    if (gridGroup) {
        gridGroup.position.x = worldX;
        gridGroup.position.z = worldZ;
    }
}

// Get grid info for external use
export function getGridInfo() {
    return {
        cellSize: GRID_SIZE,
        gridCount: GRID_COUNT,
        extent: GRID_EXTENT
    };
}
