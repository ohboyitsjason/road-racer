import * as THREE from 'three';
import { PHYSICS } from '../constants.js';

// Compute curvature at a point on the road curve
export function getCurvatureAt(roadCurve, t, sampleDist = 0.01) {
    const t1 = Math.max(0, t - sampleDist);
    const t2 = Math.min(1, t + sampleDist);
    const tangent1 = roadCurve.getTangent(t1);
    const tangent2 = roadCurve.getTangent(t2);
    return tangent1.angleTo(tangent2) / (2 * sampleDist);
}

// Racing line calculator for AI pathfinding
export class RacingLine {
    constructor(roadCurve, placedPieces) {
        this.curve = roadCurve;
        this.pieces = placedPieces;
        this.waypoints = [];
        this.optimalSpeeds = [];
    }

    // Pre-compute optimal racing line
    compute(resolution = 200) {
        this.waypoints = [];
        this.optimalSpeeds = [];

        for (let i = 0; i < resolution; i++) {
            const t = i / resolution;
            const position = this.curve.getPoint(t);
            const curvature = getCurvatureAt(this.curve, t);

            // Optimal speed decreases with curvature
            const cornerPenalty = 3.0;
            const targetSpeed = PHYSICS.maxSpeed * Math.max(0.3, 1 - curvature * cornerPenalty);

            this.waypoints.push({ t, position, curvature });
            this.optimalSpeeds.push(targetSpeed);
        }

        // Backward pass: propagate braking constraints
        for (let i = resolution - 2; i >= 0; i--) {
            const maxDecel = 12; // m/s^2 deceleration
            const dist = this.waypoints[i].position.distanceTo(this.waypoints[i + 1].position);
            const maxSpeedFromNext = Math.sqrt(this.optimalSpeeds[i + 1] ** 2 + 2 * maxDecel * dist);
            this.optimalSpeeds[i] = Math.min(this.optimalSpeeds[i], maxSpeedFromNext);
        }
    }

    // Get target position and speed for an AI at track parameter t
    getTarget(t) {
        if (this.waypoints.length === 0) return null;

        const idx = this._findNearestWaypoint(t);
        return {
            position: this.waypoints[idx].position.clone(),
            targetSpeed: this.optimalSpeeds[idx],
            curvature: this.waypoints[idx].curvature
        };
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
