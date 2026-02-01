import * as THREE from 'three';
import { PHYSICS } from '../constants.js';

// Compute curvature at a point on the road curve (handles wrap-around for closed tracks)
export function getCurvatureAt(roadCurve, t, sampleDist = 0.01) {
    // Wrap t to [0, 1) for closed loop tracks
    let t1 = t - sampleDist;
    let t2 = t + sampleDist;
    // Handle wrap-around
    if (t1 < 0) t1 += 1;
    if (t2 >= 1) t2 -= 1;
    const tangent1 = roadCurve.getTangent(t1);
    const tangent2 = roadCurve.getTangent(t2);
    return tangent1.angleTo(tangent2) / (2 * sampleDist);
}

// Smootherstep function for extra smooth transitions
function smootherstep(t) {
    return t * t * t * (t * (t * 6 - 15) + 10);
}

// Racing line calculator for AI pathfinding (2.2)
export class RacingLine {
    constructor(roadCurve, placedPieces, trackWidth = 10) {
        this.curve = roadCurve;
        this.pieces = placedPieces;
        this.trackWidth = trackWidth;
        this.waypoints = [];
        this.optimalSpeeds = [];
        this.lateralOffsets = [];  // Optimal lateral position on track
    }

    // Pre-compute optimal racing line
    compute(resolution = 200) {
        this.waypoints = [];
        this.optimalSpeeds = [];
        this.lateralOffsets = [];

        // First pass: compute curvature and initial racing line
        for (let i = 0; i < resolution; i++) {
            const t = i / resolution;
            const position = this.curve.getPoint(t);
            const curvature = getCurvatureAt(this.curve, t);
            const tangent = this.curve.getTangent(t);

            // Look ahead to find upcoming corner direction
            const lookAhead = (t + 0.1) % 1;
            const futureTangent = this.curve.getTangent(lookAhead);
            const cross = tangent.x * futureTangent.z - tangent.z * futureTangent.x;
            const cornerDirection = Math.sign(cross);  // -1 = right, 1 = left

            // Racing line: aim for apex, slight inside bias
            // Less dramatic outside positioning - more aggressive cornering
            const maxOffset = this.trackWidth * 0.25;  // Tighter to center
            let lateralOffset = 0;

            if (curvature > 0.02) {
                // In a corner: cut to inside for faster line
                lateralOffset = -cornerDirection * maxOffset * Math.min(1, curvature * 15);
            } else {
                // On straight: slight anticipation of next corner but stay centered
                const nextCurvature = this._getUpcomingCurvature(t, resolution);
                if (nextCurvature.curvature > 0.04) {
                    // Only move slightly outside for sharp corners, closer to apex entry
                    const approachFactor = smootherstep(1 - nextCurvature.distance / 0.08);
                    lateralOffset = nextCurvature.direction * maxOffset * 0.5 * approachFactor;
                }
            }

            this.lateralOffsets.push(lateralOffset);

            // Speed calculation - aggressive cornering with drifting capability
            // AI can maintain higher speeds through corners by drifting
            const cornerPenalty = 1.8;  // Much less penalty - AI will drift to compensate
            const targetSpeed = PHYSICS.maxSpeed * Math.max(0.45, 1 - curvature * cornerPenalty);

            this.waypoints.push({ t, position, curvature, tangent });
            this.optimalSpeeds.push(targetSpeed);
        }

        // Second pass: backward propagation for braking zones
        // Higher decel = later braking = more aggressive
        const maxDecel = 22;  // m/s^2 - aggressive braking, AI commits to corners
        for (let i = resolution - 2; i >= 0; i--) {
            const dist = this.waypoints[i].position.distanceTo(this.waypoints[i + 1].position);
            const maxSpeedFromNext = Math.sqrt(this.optimalSpeeds[i + 1] ** 2 + 2 * maxDecel * dist);
            this.optimalSpeeds[i] = Math.min(this.optimalSpeeds[i], maxSpeedFromNext);
        }

        // Third pass: forward propagation for acceleration limits
        const maxAccel = 12;  // m/s^2 - faster acceleration out of corners
        for (let i = 1; i < resolution; i++) {
            const dist = this.waypoints[i].position.distanceTo(this.waypoints[i - 1].position);
            const maxSpeedFromPrev = Math.sqrt(this.optimalSpeeds[i - 1] ** 2 + 2 * maxAccel * dist);
            this.optimalSpeeds[i] = Math.min(this.optimalSpeeds[i], maxSpeedFromPrev);
        }
    }

    _getUpcomingCurvature(t, resolution, maxLookAhead = 0.15) {
        let highestCurvature = 0;
        let direction = 0;
        let distance = maxLookAhead;

        for (let i = 1; i <= 15; i++) {
            const checkT = (t + i * 0.01) % 1;
            const idx = Math.floor(checkT * resolution);
            if (idx < this.waypoints.length && this.waypoints[idx].curvature > highestCurvature) {
                highestCurvature = this.waypoints[idx].curvature;
                distance = i * 0.01;

                // Determine corner direction
                const tangent = this.curve.getTangent(checkT);
                const nextT = (checkT + 0.02) % 1;
                const nextTangent = this.curve.getTangent(nextT);
                const cross = tangent.x * nextTangent.z - tangent.z * nextTangent.x;
                direction = Math.sign(cross);
            }
        }

        return { curvature: highestCurvature, direction, distance };
    }

    // Get target position and speed for an AI at track parameter t
    getTarget(t) {
        if (this.waypoints.length === 0) return null;

        const idx = this._findNearestWaypoint(t);
        const waypoint = this.waypoints[idx];
        const tangent = waypoint.tangent;

        // Calculate world position with lateral offset (racing line)
        const normal = new THREE.Vector3(-tangent.z, 0, tangent.x);
        const position = waypoint.position.clone().add(
            normal.multiplyScalar(this.lateralOffsets[idx])
        );

        return {
            position,
            targetSpeed: this.optimalSpeeds[idx],
            curvature: waypoint.curvature,
            lateralOffset: this.lateralOffsets[idx],
            tangent: tangent.clone()
        };
    }

    // Get speed at a given track position
    getSpeedAt(t) {
        if (this.waypoints.length === 0) return PHYSICS.maxSpeed * 0.5;
        const idx = this._findNearestWaypoint(t);
        return this.optimalSpeeds[idx];
    }

    // Get curvature at a given track position
    getCurvatureAt(t) {
        if (this.waypoints.length === 0) return 0;
        const idx = this._findNearestWaypoint(t);
        return this.waypoints[idx].curvature;
    }

    _findNearestWaypoint(t) {
        // Binary search for nearest waypoint
        let low = 0, high = this.waypoints.length - 1;
        while (low < high) {
            const mid = Math.floor((low + high) / 2);
            if (this.waypoints[mid].t < t) low = mid + 1;
            else high = mid;
        }
        return low;
    }
}
