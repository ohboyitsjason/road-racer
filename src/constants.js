// Physics constants - Mario Kart-style arcade racing
export const PHYSICS = {
    // Car properties
    mass: 1000,                    // kg - light for responsive feel
    wheelbase: 2.5,                // meters - distance between axles
    cgToFront: 1.25,               // meters - CG to front axle
    cgToRear: 1.25,                // meters - CG to rear axle
    cgHeight: 0.35,                // meters - very low CG for stability
    wheelRadius: 0.34,             // meters

    // Engine/drive - quick acceleration
    engineForce: 12000,            // Newtons - punchy acceleration
    brakeForce: 20000,             // Newtons - strong brakes

    // Resistance forces - low drag for speed
    dragCoeff: 0.25,               // Low drag for high speed
    rollingResistance: 5.0,        // Low rolling resistance

    // Tire grip - high grip for arcade feel
    gripCoefficient: 1.2,          // Very high grip
    corneringStiffness: 1.0,       // Responsive cornering
    maxSlipAngle: 0.4,             // More forgiving slip

    // Steering - instant and responsive
    maxSteerAngle: 0.8,            // Radians (~45 degrees)
    steerSpeed: 8.0,              // Very fast steering response
    steerSpeedReduction: 0.3,      // Less reduction at speed for tight turns

    // Derived/game scaling
    maxSpeed: 45,                  // m/s (~123 mph) - fast!
    trackWidth: 15,

    // Surface effects
    sandGripMultiplier: 1,       // Less punishing
    iceGripMultiplier: 0.25,       // Less punishing

    // Collision - bouncy walls
    collisionRestitution: 0.5,     // Bouncier collisions

    // Obstacles
    gravity: 9.8,                  // m/s^2
    rampLaunchSpeed: 10,
    rampHeight: 2.5,
    loopRadius: 25,
    loopMinSpeed: 20,

    // Drift physics - Mario Kart style
    driftSlipThreshold: 0.1,       // Easy to trigger
    driftGripMultiplier: 1.0,      // Controlled slides
    driftRecoveryRate: 2.0,        // Quick recovery
    handbrakeGripMult: 0.2,        // Drift button effect

    // Boost pad
    boostMultiplier: 3.8,          // Speed multiplier while on boost pad
    boostAcceleration: 25000,       // Extra engine force on boost pad (Newtons)

    // Obstacles (crates, etc.)
    obstacle: {
        crateMass: 100,              // kg - light enough to push
        crateFriction: 0.9,         // Ground friction coefficient
        crateRestitution: 0.1,      // Bounciness
        crateSize: 2.0,             // Size in meters
        destructionThreshold: 30,   // Impact speed (m/s) to destroy
        pushSlowdown: 0.35,         // Speed multiplier when pushing crate
        destroySlowdown: 0.55,      // Speed multiplier when destroying crate
        debrisCount: 8,             // Number of debris pieces
        debrisLifetime: 2.0,        // Seconds before debris fades
        spinTransfer: 0.3           // How much spin transfers to car on side impact
    },

    // === ADVANCED PHYSICS ===

    // Tire load sensitivity (1.1)
    tireLoadSensitivity: 0.00015,  // Grip reduction per Newton of load
    tireBaseGrip: 1.4,             // Grip coefficient at zero load
    tireMaxLoad: 4000,             // Reference load for normalization (N)

    // Pacejka Magic Formula (1.2)
    pacejka: {
        B: 10.0,    // Stiffness factor
        C: 1.9,     // Shape factor
        D: 1.0,     // Peak value
        E: -0.5     // Curvature factor
    },

    // Ackermann steering geometry (1.3)
    trackWidthSteering: 1.6,       // Distance between left/right wheels (meters)
    ackermannFactor: 0.8,          // 1.0 = full Ackermann, 0.0 = parallel steering

    // Brake bias (1.4)
    brakeBias: 0.6,                // 0.6 = 60% front, 40% rear
    rearBrakeLockThreshold: 0.9,   // Rear locks up easier under heavy braking

    // ABS simulation (1.5)
    absEnabled: true,
    absSlipThreshold: 0.15,        // Wheel slip ratio that triggers ABS
    absCycleRate: 15,              // Hz - how fast ABS cycles
    absMinSpeed: 3                 // ABS disabled below this speed (m/s)
};

// AI configuration
export const AI_CONFIG = {
    count: 3,
    colors: [0x0066ff, 0xffaa00, 0x9933ff],
    names: ['Blue Bolt', 'Orange Fury', 'Purple Storm'],

    // === ADVANCED AI ===

    // PID steering controller (2.1)
    steering: {
        kP: 2.5,              // Proportional gain
        kI: 0.1,              // Integral gain
        kD: 0.8,              // Derivative gain
        maxIntegral: 0.5,     // Anti-windup limit
        outputLimit: 1.0      // Max steering output
    },

    // Speed-dependent lookahead (2.3)
    lookahead: {
        minDistance: 5,         // meters at low speed
        maxDistance: 40,        // meters at max speed
        speedFactor: 0.8,       // seconds of look-ahead time
        cornerMultiplier: 0.7   // reduce lookahead in corners
    },

    // Collision avoidance and overtaking (3.1)
    awareness: {
        detectionRange: 30,        // meters to detect other cars
        minOvertakeSpeed: 5,       // m/s faster to attempt overtake
        laneChangeDuration: 1.5,   // seconds to complete lane change
        safetyMargin: 3.0,         // meters clearance required
        blockingThreshold: 0.8     // how directly ahead to consider blocking
    },
    laneOffset: {
        normal: 0,
        left: -4,
        right: 4
    },

    // Rubber-banding / dynamic difficulty (3.2)
    difficulty: {
        enabled: true,
        baseSkill: 0.85,           // Default AI skill (0-1)
        rubberBandStrength: 0.15,  // How much to adjust based on position
        maxBoost: 1.15,            // Maximum speed multiplier when behind
        maxNerf: 0.90,             // Minimum speed multiplier when ahead
        catchupDistance: 50,       // Distance (meters) at which full boost applies
        leadDistance: 30,          // Distance at which full nerf applies
        smoothingRate: 2.0         // How fast difficulty adjusts
    },

    // AI personality traits (3.3)
    personalities: {
        aggressive: {
            name: 'Aggressive',
            cornerSpeedBonus: 0.10,      // Takes corners 10% faster
            brakingPointDelay: 0.15,     // Brakes 15% later
            overtakeThreshold: 3,        // Attempts overtakes at smaller speed diff
            defensiveBlocking: 0.8,      // High blocking tendency
            consistencyVariation: 0.05,  // Low lap time variation
            riskTolerance: 0.9           // High risk tolerance
        },
        cautious: {
            name: 'Cautious',
            cornerSpeedBonus: -0.10,     // Takes corners 10% slower
            brakingPointDelay: -0.10,    // Brakes 10% earlier
            overtakeThreshold: 8,        // Only overtakes with large speed advantage
            defensiveBlocking: 0.3,      // Low blocking tendency
            consistencyVariation: 0.02,  // Very consistent
            riskTolerance: 0.4           // Low risk tolerance
        },
        balanced: {
            name: 'Balanced',
            cornerSpeedBonus: 0,
            brakingPointDelay: 0,
            overtakeThreshold: 5,
            defensiveBlocking: 0.5,
            consistencyVariation: 0.03,
            riskTolerance: 0.65
        },
        erratic: {
            name: 'Erratic',
            cornerSpeedBonus: 0.05,
            brakingPointDelay: 0.05,
            overtakeThreshold: 4,
            defensiveBlocking: 0.6,
            consistencyVariation: 0.12,  // High variation - makes mistakes
            riskTolerance: 0.75
        }
    },
    // Assign personalities to AI cars
    aiPersonalities: ['aggressive', 'cautious', 'balanced']  // Maps to car indices
};

// Decoration pieces - placed on grid but cannot overlap track
export const DECORATION_DATA = {
    'grandstand': { width: 20, depth: 10, hasTrigger: true, triggerType: 'cheer', triggerRadius: 25 },
    'pyro': { width: 5, depth: 5, hasTrigger: true, triggerType: 'fire', triggerRadius: 15 },
    'tree': { width: 5, depth: 5, hasTrigger: false },
    'tree-cluster': { width: 10, depth: 10, hasTrigger: false },
    'rocks': { width: 10, depth: 10, hasTrigger: false },
    'bush': { width: 5, depth: 5, hasTrigger: false },
    'banner': { width: 10, depth: 5, hasTrigger: false },
    'tire-stack': { width: 5, depth: 5, hasTrigger: false }
};

// Elevation system - RollerCoaster Tycoon-style discrete levels
export const ELEVATION = {
    MIN_LEVEL: 0,
    MAX_LEVEL: 4,
    HEIGHT_PER_LEVEL: 6,   // Y units per elevation level
    LEVELS: 5              // Total levels (0-4)
};

// Grid unit = 5, base piece = 4 grid squares = 20 units
// Curve radius = straight length so loops close on the grid
export const PIECE_DATA = {
    'start':          { length: 40, curveAngle: 0, curveRadius: 0, isStart: true },
    'straight-short': { length: 20, curveAngle: 0, curveRadius: 0 },
    'straight-long':  { length: 40, curveAngle: 0, curveRadius: 0 },
    'straight-extra': { length: 60, curveAngle: 0, curveRadius: 0 },
    'curve-45':       { length: 0, curveAngle: Math.PI / 4, curveRadius: 20, direction: 1 },
    'curve-90':       { length: 0, curveAngle: Math.PI / 2, curveRadius: 20, direction: 1 },
    'curve-banked':   { length: 0, curveAngle: Math.PI / 2, curveRadius: 20, direction: 1, banked: true, bankAngle: 0.3 },
    'curve-banked-180': { length: 0, curveAngle: Math.PI, curveRadius: 20, direction: 1, banked: true, bankAngle: 0.3 },
    'jump-ramp':      { length: 40, curveAngle: 0, curveRadius: 0, isObstacle: true, obstacleType: 'jump' },
    'sand-pit':       { length: 40, curveAngle: 0, curveRadius: 0, isObstacle: true, obstacleType: 'sand' },
    'ice-section':    { length: 40, curveAngle: 0, curveRadius: 0, isObstacle: true, obstacleType: 'ice' },
    'boost-pad':      { length: 20, curveAngle: 0, curveRadius: 0, isObstacle: true, obstacleType: 'boost' },
    'loop':           { length: 80, curveAngle: 0, curveRadius: 0, isObstacle: true, obstacleType: 'loop', loopRadius: 25 },
    'ramp':           { length: 40, curveAngle: 0, curveRadius: 0, isRamp: true, elevationDelta: 1 },
    'ramp-steep':     { length: 20, curveAngle: 0, curveRadius: 0, isRamp: true, elevationDelta: 1 }
};
