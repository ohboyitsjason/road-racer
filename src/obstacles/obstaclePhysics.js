import * as THREE from 'three';
import { PHYSICS } from '../constants.js';
import { obstacles, debrisParticles, removeObstacleByRef, addDebris, cleanupDebris } from './obstacleState.js';
import { createDebrisParticles } from './obstacleMeshes.js';
import { scene, raycaster } from '../scene.js';
import { barrierMeshCache, rebuildTrackMeshCache, cacheValid } from '../car/surfacePhysics.js';

const GRAVITY = 9.8;

// Update all obstacle physics
export function updateObstaclePhysics(delta) {
    const obs = PHYSICS.obstacle;

    // Update each obstacle
    for (const obstacle of obstacles) {
        if (!obstacle.isStatic) {
            // Apply gravity if airborne
            if (obstacle.position.y > obstacle.size / 2 + 0.1) {
                obstacle.velocity.y -= GRAVITY * delta;
            }

            // Apply friction when on ground
            if (obstacle.position.y <= obstacle.size / 2 + 0.1) {
                obstacle.position.y = obstacle.size / 2 + 0.1;

                // Only apply friction if moving
                const groundSpeed = Math.sqrt(obstacle.velocity.x ** 2 + obstacle.velocity.z ** 2);
                if (groundSpeed > 0.1) {
                    const frictionDecel = obs.crateFriction * GRAVITY * delta;
                    const frictionFactor = Math.max(0, 1 - frictionDecel / groundSpeed);
                    obstacle.velocity.x *= frictionFactor;
                    obstacle.velocity.z *= frictionFactor;
                } else {
                    obstacle.velocity.x = 0;
                    obstacle.velocity.z = 0;
                }

                // Stop vertical velocity
                if (obstacle.velocity.y < 0) {
                    obstacle.velocity.y = 0;
                }

                // Angular friction
                obstacle.angularVelocity.multiplyScalar(0.95);
            }

            // Update position
            obstacle.position.add(obstacle.velocity.clone().multiplyScalar(delta));

            // Check barrier collision
            const barrierCollision = checkObstacleBarrierCollision(obstacle);
            if (barrierCollision.collided) {
                // Push out of barrier
                obstacle.position.add(barrierCollision.normal.clone().multiplyScalar(barrierCollision.penetration + 0.2));

                // Reflect velocity
                const velDotNormal = obstacle.velocity.dot(barrierCollision.normal);
                if (velDotNormal < 0) {
                    const restitution = obs.crateRestitution;
                    obstacle.velocity.add(barrierCollision.normal.clone().multiplyScalar(-velDotNormal * (1 + restitution)));
                    // Add some spin from impact
                    obstacle.angularVelocity.y += (Math.random() - 0.5) * Math.abs(velDotNormal) * 0.5;
                }
            }

            // Check obstacle-obstacle collision
            for (const other of obstacles) {
                if (other === obstacle || other.destroyed) continue;
                checkAndResolveObstacleCollision(obstacle, other);
            }

            // Update rotation
            obstacle.rotation.x += obstacle.angularVelocity.x * delta;
            obstacle.rotation.y += obstacle.angularVelocity.y * delta;
            obstacle.rotation.z += obstacle.angularVelocity.z * delta;

            // Update mesh
            if (obstacle.mesh) {
                obstacle.mesh.position.copy(obstacle.position);
                obstacle.mesh.rotation.set(obstacle.rotation.x, obstacle.rotation.y, obstacle.rotation.z);
            }
        }
    }

    // Update debris particles
    for (const debris of debrisParticles) {
        debris.lifetime -= delta;

        if (debris.lifetime > 0) {
            // Apply gravity
            debris.velocity.y -= GRAVITY * delta;

            // Update position
            debris.mesh.position.add(debris.velocity.clone().multiplyScalar(delta));

            // Update rotation
            debris.mesh.rotation.x += debris.angularVelocity.x * delta;
            debris.mesh.rotation.y += debris.angularVelocity.y * delta;
            debris.mesh.rotation.z += debris.angularVelocity.z * delta;

            // Ground collision
            if (debris.mesh.position.y < 0.2) {
                debris.mesh.position.y = 0.2;
                debris.velocity.y = -debris.velocity.y * 0.3;
                debris.velocity.x *= 0.8;
                debris.velocity.z *= 0.8;
                debris.angularVelocity.multiplyScalar(0.7);
            }

            // Fade out
            if (debris.lifetime < 0.5) {
                debris.mesh.material.transparent = true;
                debris.mesh.material.opacity = debris.lifetime / 0.5;
            }
        } else {
            // Remove from scene
            scene.remove(debris.mesh);
            if (debris.mesh.geometry) debris.mesh.geometry.dispose();
            if (debris.mesh.material) debris.mesh.material.dispose();
        }
    }

    // Clean up expired debris
    cleanupDebris();
}

// Check collision between a car and all obstacles
// Returns collision info if hit, null otherwise
export function checkObstacleCollision(carPosition, carVelocity, carHeading, carWidth = 2, carLength = 4) {
    const obs = PHYSICS.obstacle;

    for (const obstacle of obstacles) {
        if (obstacle.destroyed) continue;

        // Simple sphere-box collision (treating car as sphere for simplicity)
        const carRadius = Math.max(carWidth, carLength) / 2;
        const obstacleRadius = obstacle.size / 2;
        const collisionDist = carRadius + obstacleRadius;

        const toObstacle = obstacle.position.clone().sub(carPosition);
        toObstacle.y = 0; // Only horizontal collision
        const distance = toObstacle.length();

        if (distance < collisionDist && distance > 0.01) {
            const normal = toObstacle.normalize();
            const overlap = collisionDist - distance;

            // Calculate impact speed (component toward obstacle)
            const impactSpeed = carVelocity.dot(normal);

            return {
                obstacle,
                normal,
                overlap,
                impactSpeed: Math.abs(impactSpeed),
                distance
            };
        }
    }

    return null;
}

// Apply collision response to both car and obstacle
export function applyObstacleCollision(carPosition, carVelocity, carSpeed, carHeading, collision) {
    const obs = PHYSICS.obstacle;
    const obstacle = collision.obstacle;

    // Determine if this destroys the obstacle
    const shouldDestroy = collision.impactSpeed > obs.destructionThreshold;

    if (shouldDestroy) {
        // Destroy the obstacle
        destroyObstacle(obstacle, carVelocity);

        // Car slows down slightly
        return {
            speedMultiplier: obs.destroySlowdown,
            spinAmount: collision.normal.x * obs.spinTransfer * 0.5,
            destroyed: true
        };
    } else {
        // Push the obstacle
        const carMass = PHYSICS.mass;
        const obstacleMass = obs.crateMass;
        const totalMass = carMass + obstacleMass;

        // Momentum transfer (simplified elastic collision)
        const carMomentum = carVelocity.clone().multiplyScalar(carMass);

        // Obstacle gets portion of car's momentum
        const momentumTransfer = carMomentum.clone().multiplyScalar(obstacleMass / totalMass);
        obstacle.velocity.add(momentumTransfer.multiplyScalar(1 / obstacleMass));

        // Add some upward velocity for visual effect
        obstacle.velocity.y += collision.impactSpeed * 0.2;

        // Add spin to obstacle
        const hitAngle = Math.atan2(collision.normal.x, collision.normal.z) - carHeading;
        const sideHit = Math.sin(hitAngle);
        obstacle.angularVelocity.y += sideHit * collision.impactSpeed * 0.5;
        obstacle.angularVelocity.x += (Math.random() - 0.5) * collision.impactSpeed * 0.3;
        obstacle.angularVelocity.z += (Math.random() - 0.5) * collision.impactSpeed * 0.3;

        // Push obstacle out of car
        obstacle.position.add(collision.normal.clone().multiplyScalar(collision.overlap + 0.2));

        // Car slows down more when pushing
        return {
            speedMultiplier: obs.pushSlowdown,
            spinAmount: sideHit * obs.spinTransfer,
            destroyed: false
        };
    }
}

// Destroy an obstacle and create debris
function destroyObstacle(obstacle, impactVelocity) {
    // Mark as destroyed
    obstacle.destroyed = true;

    // Remove mesh from scene
    if (obstacle.mesh) {
        scene.remove(obstacle.mesh);
    }

    // Create debris particles
    const debris = createDebrisParticles(obstacle.position, impactVelocity);

    // Add debris to scene and state
    for (const d of debris) {
        scene.add(d.mesh);
        addDebris(d);
    }

    // Remove from obstacles array
    removeObstacleByRef(obstacle);
}

// Check if obstacle collides with barriers
function checkObstacleBarrierCollision(obstacle) {
    const result = {
        collided: false,
        normal: new THREE.Vector3(),
        penetration: 0
    };

    if (!cacheValid) {
        rebuildTrackMeshCache();
    }

    if (barrierMeshCache.length === 0) {
        return result;
    }

    const halfSize = obstacle.size / 2;
    const rayOrigin = new THREE.Vector3(obstacle.position.x, obstacle.position.y, obstacle.position.z);

    // Check in 8 horizontal directions
    const directions = [
        new THREE.Vector3(1, 0, 0),
        new THREE.Vector3(-1, 0, 0),
        new THREE.Vector3(0, 0, 1),
        new THREE.Vector3(0, 0, -1),
        new THREE.Vector3(1, 0, 1).normalize(),
        new THREE.Vector3(1, 0, -1).normalize(),
        new THREE.Vector3(-1, 0, 1).normalize(),
        new THREE.Vector3(-1, 0, -1).normalize()
    ];

    let closestHit = null;
    let closestDist = Infinity;

    for (const dir of directions) {
        raycaster.set(rayOrigin, dir);
        raycaster.far = halfSize + 0.5;

        const intersects = raycaster.intersectObjects(barrierMeshCache, false);

        if (intersects.length > 0 && intersects[0].distance < closestDist) {
            closestDist = intersects[0].distance;
            closestHit = intersects[0];
        }
    }

    if (closestHit && closestDist < halfSize + 0.3) {
        result.collided = true;

        // Get normal pointing away from barrier
        let hitNormal = closestHit.face.normal.clone()
            .transformDirection(closestHit.object.matrixWorld)
            .normalize();
        hitNormal.y = 0;

        if (hitNormal.length() > 0.01) {
            hitNormal.normalize();
        } else {
            hitNormal.set(
                obstacle.position.x - closestHit.point.x,
                0,
                obstacle.position.z - closestHit.point.z
            ).normalize();
        }

        result.normal = hitNormal;
        result.penetration = halfSize + 0.3 - closestDist;
    }

    return result;
}

// Check and resolve collision between two obstacles
function checkAndResolveObstacleCollision(obs1, obs2) {
    const dx = obs2.position.x - obs1.position.x;
    const dz = obs2.position.z - obs1.position.z;
    const dist = Math.sqrt(dx * dx + dz * dz);
    const minDist = (obs1.size + obs2.size) / 2;

    if (dist < minDist && dist > 0.01) {
        // Collision detected
        const overlap = minDist - dist;
        const nx = dx / dist;
        const nz = dz / dist;

        // Push apart (half each)
        obs1.position.x -= nx * overlap * 0.5;
        obs1.position.z -= nz * overlap * 0.5;
        obs2.position.x += nx * overlap * 0.5;
        obs2.position.z += nz * overlap * 0.5;

        // Exchange velocity components along collision normal
        const v1n = obs1.velocity.x * nx + obs1.velocity.z * nz;
        const v2n = obs2.velocity.x * nx + obs2.velocity.z * nz;

        // Only resolve if approaching
        if (v1n - v2n > 0) {
            const restitution = PHYSICS.obstacle.crateRestitution;
            const m1 = obs1.mass;
            const m2 = obs2.mass;

            // Elastic collision formula
            const newV1n = ((m1 - m2) * v1n + 2 * m2 * v2n) / (m1 + m2) * restitution;
            const newV2n = ((m2 - m1) * v2n + 2 * m1 * v1n) / (m1 + m2) * restitution;

            obs1.velocity.x += (newV1n - v1n) * nx;
            obs1.velocity.z += (newV1n - v1n) * nz;
            obs2.velocity.x += (newV2n - v2n) * nx;
            obs2.velocity.z += (newV2n - v2n) * nz;
        }
    }
}

// Create a new obstacle at a position
export function spawnObstacle(type, position, rotation = 0) {
    const obs = PHYSICS.obstacle;

    return {
        type,
        position: position.clone(),
        velocity: new THREE.Vector3(0, 0, 0),
        rotation: new THREE.Vector3(0, rotation, 0),
        angularVelocity: new THREE.Vector3(0, 0, 0),
        size: obs.crateSize,
        mass: obs.crateMass,
        mesh: null,
        destroyed: false,
        isStatic: false
    };
}
