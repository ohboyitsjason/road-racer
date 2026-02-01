import * as THREE from 'three';

// All active obstacles in the scene
export const obstacles = [];

// Original obstacle data for reset (stored when placed in build mode)
export const originalObstacles = [];

// Debris particles (temporary visual effects)
export const debrisParticles = [];

// Add a new obstacle to the world
export function addObstacle(obstacle) {
    obstacles.push(obstacle);
    // Store original state for race reset
    originalObstacles.push({
        type: obstacle.type,
        position: obstacle.position.clone(),
        rotation: obstacle.rotation.clone(),
        size: obstacle.size,
        mass: obstacle.mass
    });
}

// Remove an obstacle by index
export function removeObstacle(index) {
    if (index >= 0 && index < obstacles.length) {
        obstacles.splice(index, 1);
    }
}

// Remove an obstacle by reference
export function removeObstacleByRef(obstacle) {
    const index = obstacles.indexOf(obstacle);
    if (index >= 0) {
        obstacles.splice(index, 1);
    }
}

// Clear all obstacles (used when clearing track in build mode)
export function clearObstacles() {
    obstacles.length = 0;
    originalObstacles.length = 0;
    debrisParticles.length = 0;
}

// Reset obstacles to original positions (used when restarting race)
export function resetObstacles(scene, createMeshFn) {
    // Remove current obstacle meshes from scene
    for (const obstacle of obstacles) {
        if (obstacle.mesh) {
            scene.remove(obstacle.mesh);
        }
    }

    // Clear debris
    for (const debris of debrisParticles) {
        if (debris.mesh) {
            scene.remove(debris.mesh);
            if (debris.mesh.geometry) debris.mesh.geometry.dispose();
            if (debris.mesh.material) debris.mesh.material.dispose();
        }
    }
    debrisParticles.length = 0;

    // Clear current obstacles
    obstacles.length = 0;

    // Recreate from original data
    for (const original of originalObstacles) {
        const obstacle = {
            type: original.type,
            position: original.position.clone(),
            velocity: new THREE.Vector3(0, 0, 0),
            rotation: original.rotation.clone(),
            angularVelocity: new THREE.Vector3(0, 0, 0),
            size: original.size,
            mass: original.mass,
            mesh: null,
            destroyed: false,
            isStatic: false
        };

        // Create mesh
        if (createMeshFn) {
            const mesh = createMeshFn();
            mesh.position.copy(obstacle.position);
            mesh.rotation.set(obstacle.rotation.x, obstacle.rotation.y, obstacle.rotation.z);
            scene.add(mesh);
            obstacle.mesh = mesh;
        }

        obstacles.push(obstacle);
    }
}

// Add debris particle
export function addDebris(debris) {
    debrisParticles.push(debris);
}

// Remove expired debris
export function cleanupDebris() {
    for (let i = debrisParticles.length - 1; i >= 0; i--) {
        if (debrisParticles[i].lifetime <= 0) {
            debrisParticles.splice(i, 1);
        }
    }
}
