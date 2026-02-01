import * as THREE from 'three';
import * as state from '../state.js';
import { PHYSICS } from '../constants.js';

// Raycaster for surface detection
const raycaster = new THREE.Raycaster();
const downDirection = new THREE.Vector3(0, -1, 0);

// Wheel positions relative to car center (local coordinates)
const WHEEL_OFFSETS = [
    new THREE.Vector3(-1.0, 0, 1.5),   // Front left
    new THREE.Vector3(1.0, 0, 1.5),    // Front right
    new THREE.Vector3(-1.0, 0, -1.5),  // Rear left
    new THREE.Vector3(1.0, 0, -1.5)    // Rear right
];

// Cache for track meshes that can be hit by raycasts
let trackMeshCache = [];
export let barrierMeshCache = [];
export let cacheValid = false;

// Car dimensions for collision
const CAR_WIDTH = 2.0;
const CAR_LENGTH = 4.0;
const CAR_HEIGHT = 1.5;

// Check if a mesh is a barrier (for collision) vs drivable surface
function isBarrierMesh(mesh) {
    // Check for explicit barrier tag first
    if (mesh.userData && mesh.userData.isBarrier) {
        return true;
    }

    // Fallback: Check if mesh material color suggests a barrier (red/white striped barriers)
    if (mesh.material && mesh.material.color) {
        const color = mesh.material.color;
        // Red barrier (0xcc0000 = r:0.8, so use >= 0.7)
        if (color.r >= 0.7 && color.g < 0.3 && color.b < 0.3) {
            return true;
        }
        // White barrier (but not road markings - check size)
        if (color.r > 0.9 && color.g > 0.9 && color.b > 0.9) {
            const geometry = mesh.geometry;
            if (!geometry.boundingBox) {
                geometry.computeBoundingBox();
            }
            const box = geometry.boundingBox;
            const size = new THREE.Vector3();
            box.getSize(size);
            // If it's tall, it's likely a barrier
            if (size.y > 1 || size.x > 1) {
                return true;
            }
        }
    }
    return false;
}

// Rebuild the cache of track meshes for raycasting
export function rebuildTrackMeshCache() {
    trackMeshCache = [];
    barrierMeshCache = [];

    state.trackElements.forEach(element => {
        // Update world matrices for accurate raycasting
        element.updateMatrixWorld(true);

        element.traverse((child) => {
            if (child.isMesh && child.geometry) {
                // Ensure geometry has computed bounding box for intersection tests
                if (!child.geometry.boundingBox) {
                    child.geometry.computeBoundingBox();
                }
                if (!child.geometry.boundingSphere) {
                    child.geometry.computeBoundingSphere();
                }

                if (isBarrierMesh(child)) {
                    // Barrier/wall - add to barrier cache for collision
                    barrierMeshCache.push(child);
                } else {
                    // All other meshes are potential drivable surfaces
                    trackMeshCache.push(child);
                }
            }
        });
    });

    cacheValid = true;
    console.log(`Track cache: ${trackMeshCache.length} surfaces, ${barrierMeshCache.length} barriers`);
}

// Invalidate cache when track changes
export function invalidateTrackCache() {
    cacheValid = false;
}

// Cast a ray and find the closest track surface hit
function castRay(origin, direction, maxDistance = 50) {
    if (!cacheValid) {
        rebuildTrackMeshCache();
    }

    raycaster.set(origin, direction);
    raycaster.far = maxDistance;

    const intersects = raycaster.intersectObjects(trackMeshCache, false);

    if (intersects.length > 0) {
        return intersects[0];
    }
    return null;
}

// Detect the surface beneath a car at a given position and heading
export function detectSurface(position, heading, carUp = new THREE.Vector3(0, 1, 0)) {
    const results = {
        onSurface: false,
        surfaceNormal: new THREE.Vector3(0, 1, 0),
        surfacePoint: position.clone(),
        averageHeight: position.y,
        wheelContacts: []
    };

    // Create rotation matrix for car heading
    const cosH = Math.cos(heading);
    const sinH = Math.sin(heading);

    // Cast rays from each wheel position
    const hitPoints = [];
    const hitNormals = [];

    for (const offset of WHEEL_OFFSETS) {
        // Transform wheel offset to world coordinates
        const worldOffset = new THREE.Vector3(
            offset.x * cosH + offset.z * sinH,
            offset.y + 2, // Start ray above the car
            -offset.x * sinH + offset.z * cosH
        );

        const rayOrigin = position.clone().add(worldOffset);

        // Cast ray downward (in world space, or along -carUp for banked surfaces)
        const hit = castRay(rayOrigin, downDirection, 10);

        if (hit) {
            // Get the face normal in world space
            let normal = hit.face.normal.clone().transformDirection(hit.object.matrixWorld).normalize();

            // Ensure normal points generally upward (positive y)
            // This handles DoubleSide meshes where we might hit the back face
            if (normal.y < 0) {
                normal.negate();
            }

            // If normal is still nearly horizontal, default to up
            // (can happen with degenerate geometry)
            if (Math.abs(normal.y) < 0.1) {
                normal.set(0, 1, 0);
            }

            // Only count surfaces that are close enough to the car
            const actualDistance = hit.distance - 2; // Subtract the 2 we added above
            if (actualDistance > 5) {
                continue; // Surface is too far below
            }

            hitPoints.push(hit.point.clone());
            hitNormals.push(normal);
            results.wheelContacts.push({
                position: hit.point.clone(),
                normal: normal.clone(),
                distance: actualDistance
            });
        }
    }

    if (hitPoints.length >= 3) {
        // Calculate surface plane from hit points
        results.onSurface = true;

        // Average the hit normals for surface normal
        results.surfaceNormal.set(0, 0, 0);
        for (const normal of hitNormals) {
            results.surfaceNormal.add(normal);
        }
        results.surfaceNormal.divideScalar(hitNormals.length).normalize();

        // Ensure the final normal points upward
        if (results.surfaceNormal.y < 0.1) {
            results.surfaceNormal.set(0, 1, 0);
        }

        // Average height
        let totalHeight = 0;
        for (const point of hitPoints) {
            totalHeight += point.y;
        }
        results.averageHeight = totalHeight / hitPoints.length;

        // Surface point is average of hit points
        results.surfacePoint.set(0, 0, 0);
        for (const point of hitPoints) {
            results.surfacePoint.add(point);
        }
        results.surfacePoint.divideScalar(hitPoints.length);

    } else if (hitPoints.length > 0) {
        // Partial contact - use what we have
        results.onSurface = true;

        if (hitNormals.length > 0) {
            results.surfaceNormal.copy(hitNormals[0]);
            // Ensure normal points upward
            if (results.surfaceNormal.y < 0.1) {
                results.surfaceNormal.set(0, 1, 0);
            }
        }

        let totalHeight = 0;
        for (const point of hitPoints) {
            totalHeight += point.y;
        }
        results.averageHeight = totalHeight / hitPoints.length;
        results.surfacePoint.copy(hitPoints[0]);
    } else {
        // No wheel contacts - try a center ray as fallback
        const centerRayOrigin = position.clone();
        centerRayOrigin.y += 3; // Start well above

        const centerHit = castRay(centerRayOrigin, downDirection, 10);
        if (centerHit) {
            let normal = centerHit.face.normal.clone().transformDirection(centerHit.object.matrixWorld).normalize();
            if (normal.y < 0) normal.negate();
            if (Math.abs(normal.y) < 0.1) normal.set(0, 1, 0);

            const distance = centerHit.distance - 3;
            if (distance < 5) {
                results.onSurface = true;
                results.surfaceNormal.copy(normal);
                results.averageHeight = centerHit.point.y;
                results.surfacePoint.copy(centerHit.point);
            }
        }
    }

    return results;
}

// Calculate physics forces based on surface contact
export function calculateSurfaceForces(velocity, surfaceNormal, speed, grip, delta) {
    const forces = {
        normalForce: new THREE.Vector3(),
        frictionForce: new THREE.Vector3(),
        gravityComponent: new THREE.Vector3()
    };

    // Gravity always pulls down
    const gravity = new THREE.Vector3(0, -PHYSICS.gravity, 0);

    // Component of gravity along surface normal (this is countered by normal force when on surface)
    const gravityAlongNormal = surfaceNormal.clone().multiplyScalar(gravity.dot(surfaceNormal));

    // Component of gravity along surface (causes sliding on slopes)
    forces.gravityComponent = gravity.clone().sub(gravityAlongNormal);

    // Normal force counters gravity component into surface
    // Only applies when on surface
    forces.normalForce = gravityAlongNormal.clone().negate();

    // Friction opposes motion along surface
    const velocityAlongSurface = velocity.clone().sub(
        surfaceNormal.clone().multiplyScalar(velocity.dot(surfaceNormal))
    );

    if (velocityAlongSurface.length() > 0.01) {
        const frictionMagnitude = forces.normalForce.length() * grip;
        forces.frictionForce = velocityAlongSurface.clone().normalize().multiplyScalar(-frictionMagnitude * delta);

        // Don't let friction exceed the velocity (prevents oscillation)
        if (forces.frictionForce.length() > velocityAlongSurface.length()) {
            forces.frictionForce.setLength(velocityAlongSurface.length());
        }
    }

    return forces;
}

// Orient a car mesh to match a surface normal
export function orientToSurface(carMesh, heading, surfaceNormal, blendFactor = 0.2) {
    // Calculate forward direction on the surface
    const worldForward = new THREE.Vector3(Math.sin(heading), 0, Math.cos(heading));

    // Project forward onto surface plane
    const forwardOnSurface = worldForward.clone()
        .sub(surfaceNormal.clone().multiplyScalar(worldForward.dot(surfaceNormal)))
        .normalize();

    // Handle edge case where forward is parallel to normal
    if (forwardOnSurface.length() < 0.01) {
        forwardOnSurface.set(Math.sin(heading), 0, Math.cos(heading));
    }

    // Calculate right vector
    const right = new THREE.Vector3().crossVectors(surfaceNormal, forwardOnSurface).normalize();

    // Recalculate forward to ensure orthogonality
    const forward = new THREE.Vector3().crossVectors(right, surfaceNormal).normalize();

    // Build rotation matrix
    const rotMatrix = new THREE.Matrix4().makeBasis(right, surfaceNormal, forward);

    // Create target quaternion
    const targetQuat = new THREE.Quaternion().setFromRotationMatrix(rotMatrix);

    // Smoothly blend current rotation to target
    carMesh.quaternion.slerp(targetQuat, blendFactor);
}

// Check if car has enough speed to stay on a banked/inverted surface
export function canMaintainSurfaceContact(speed, surfaceNormal, curvature = 0) {
    // Calculate the angle of the surface from horizontal
    const surfaceAngle = Math.acos(Math.max(-1, Math.min(1, surfaceNormal.y)));

    // If surface is mostly flat (< 45 degrees), always maintain contact
    if (surfaceAngle < Math.PI / 4) {
        return true;
    }

    // For steeper angles, need minimum speed based on centripetal force
    // v² / r >= g * sin(angle) for maintaining contact
    if (curvature > 0) {
        const radius = 1 / curvature;
        const minSpeedSquared = PHYSICS.gravity * Math.sin(surfaceAngle) * radius;
        return speed * speed >= minSpeedSquared * 0.7; // 0.7 factor for some margin
    }

    // For non-curved steep surfaces, need significant speed
    return speed > 15;
}

// Check for barrier collisions and return collision response
export function checkBarrierCollision(position, velocity, heading, isAirborne = false) {
    if (!cacheValid) {
        rebuildTrackMeshCache();
    }

    const result = {
        collided: false,
        normal: new THREE.Vector3(),
        penetration: 0,
        barrierTop: 0,
        impactSpeed: 0
    };

    if (barrierMeshCache.length === 0) {
        return result;
    }

    // Directions to check (forward, back, left, right, and diagonals)
    const cosH = Math.cos(heading);
    const sinH = Math.sin(heading);

    const directions = [
        new THREE.Vector3(sinH, 0, cosH),           // Forward
        new THREE.Vector3(-sinH, 0, -cosH),         // Back
        new THREE.Vector3(cosH, 0, -sinH),          // Right
        new THREE.Vector3(-cosH, 0, sinH),          // Left
        new THREE.Vector3(sinH + cosH, 0, cosH - sinH).normalize(),   // Front-right
        new THREE.Vector3(sinH - cosH, 0, cosH + sinH).normalize(),   // Front-left
        new THREE.Vector3(-sinH + cosH, 0, -cosH - sinH).normalize(), // Back-right
        new THREE.Vector3(-sinH - cosH, 0, -cosH + sinH).normalize()  // Back-left
    ];

    const checkDistances = [CAR_LENGTH / 2 + 1.0, CAR_LENGTH / 2 + 1.0, CAR_WIDTH / 2 + 0.8, CAR_WIDTH / 2 + 0.8,
                           CAR_LENGTH / 2 + 0.8, CAR_LENGTH / 2 + 0.8, CAR_LENGTH / 2 + 0.8, CAR_LENGTH / 2 + 0.8];

    // Add velocity-based direction to catch high-speed tunneling
    const speed = velocity.length();
    if (speed > 5) {
        const velDir = velocity.clone().normalize();
        velDir.y = 0;
        if (velDir.length() > 0.1) {
            velDir.normalize();
            directions.push(velDir);
            // Check further ahead at high speeds
            checkDistances.push(CAR_LENGTH / 2 + Math.min(speed * 0.1, 3.0));
        }
    }

    // Multiple ray heights for better coverage
    const rayHeights = [0.2, 0.5, 0.9, 1.3]; // Low, low-mid, mid-high, high

    let closestHit = null;
    let closestDist = Infinity;

    for (const heightOffset of rayHeights) {
        const rayOrigin = new THREE.Vector3(position.x, position.y + heightOffset, position.z);

        for (let i = 0; i < directions.length; i++) {
            const dir = directions[i];
            const checkDist = checkDistances[i];

            raycaster.set(rayOrigin, dir);
            raycaster.far = checkDist;

            const intersects = raycaster.intersectObjects(barrierMeshCache, false);

            if (intersects.length > 0) {
                const hit = intersects[0];

                // Get barrier height to check if car can jump over
                const barrierGeom = hit.object.geometry;
                if (!barrierGeom.boundingBox) {
                    barrierGeom.computeBoundingBox();
                }
                const worldPos = new THREE.Vector3();
                hit.object.getWorldPosition(worldPos);
                const barrierTop = worldPos.y + barrierGeom.boundingBox.max.y * hit.object.scale.y;

                // If car is high enough to clear the barrier, skip collision
                if (isAirborne && position.y > barrierTop + 0.5) {
                    continue;
                }

                if (hit.distance < closestDist) {
                    closestDist = hit.distance;
                    closestHit = hit;
                    result.barrierTop = barrierTop;
                }
            }
        }
    }

    if (closestHit) {
        result.collided = true;

        // Get collision normal (pointing away from barrier)
        let hitNormal = closestHit.face.normal.clone()
            .transformDirection(closestHit.object.matrixWorld)
            .normalize();

        // Make sure normal is horizontal (we handle vertical separately)
        hitNormal.y = 0;
        if (hitNormal.length() > 0.01) {
            hitNormal.normalize();
        } else {
            // Fallback: push away from hit point
            hitNormal.set(
                position.x - closestHit.point.x,
                0,
                position.z - closestHit.point.z
            ).normalize();
        }

        result.normal = hitNormal;
        result.penetration = Math.max(0.5, (CAR_WIDTH / 2 + 0.5) - closestDist);

        // Calculate impact speed (velocity component into barrier)
        result.impactSpeed = Math.abs(velocity.dot(hitNormal));
    }

    return result;
}

// Apply barrier collision response to position and velocity
export function applyBarrierCollision(position, velocity, speed, heading, collision) {
    if (!collision.collided) {
        return { position, velocity, speed };
    }

    const newPosition = position.clone();
    const newVelocity = velocity.clone();

    // Push car out of barrier with minimum distance to prevent getting stuck
    const minPushOut = 1.0;
    const pushDistance = Math.max(minPushOut, collision.penetration + 0.5);
    newPosition.add(collision.normal.clone().multiplyScalar(pushDistance));

    // Reflect velocity off barrier - Mario Kart style bouncy walls
    const velocityDotNormal = newVelocity.dot(collision.normal);
    if (velocityDotNormal < 0) {
        // Only reflect if moving into the barrier
        const restitution = 0.6; // Bouncy! (Mario Kart style)
        const reflection = collision.normal.clone().multiplyScalar(-velocityDotNormal * (1 + restitution));
        newVelocity.add(reflection);

        // Less friction - keep more speed along wall
        const tangent = newVelocity.clone().sub(
            collision.normal.clone().multiplyScalar(newVelocity.dot(collision.normal))
        );
        newVelocity.copy(tangent.multiplyScalar(0.92)); // Keep more speed
    }

    // Ensure velocity points away from barrier (prevent getting stuck)
    const awayComponent = newVelocity.dot(collision.normal);
    if (awayComponent < 0.5) {
        newVelocity.add(collision.normal.clone().multiplyScalar(0.5 - awayComponent));
    }

    // Recalculate speed based on new velocity direction
    const forward = new THREE.Vector3(Math.sin(heading), 0, Math.cos(heading));
    let newSpeed = newVelocity.dot(forward);

    // Maintain minimum forward speed to help escape
    if (Math.abs(newSpeed) < 2 && Math.abs(speed) > 2) {
        newSpeed = Math.sign(speed) * 2;
    }

    return {
        position: newPosition,
        velocity: newVelocity,
        speed: newSpeed * 0.92 // Less speed loss - keep momentum (Mario Kart style)
    };
}

// Get surface type at a point (for grip modifiers and boost)
export function getSurfaceType(position) {
    // Check obstacle zones for special surfaces
    for (const zone of state.obstacleZones) {
        if (zone.type !== 'sand' && zone.type !== 'ice' && zone.type !== 'boost') continue;

        const relPos = position.clone().sub(zone.position);
        const cosH = Math.cos(-zone.heading);
        const sinH = Math.sin(-zone.heading);
        const localX = relPos.x * cosH - relPos.z * sinH;
        const localZ = relPos.x * sinH + relPos.z * cosH;

        if (Math.abs(localX) < PHYSICS.trackWidth && localZ > zone.start && localZ < zone.end) {
            return zone.type;
        }
    }

    return 'normal';
}

// Get grip multiplier based on surface type
export function getGripMultiplier(surfaceType) {
    switch (surfaceType) {
        case 'sand': return PHYSICS.sandGripMultiplier;
        case 'ice': return PHYSICS.iceGripMultiplier;
        default: return 1.0;
    }
}
