// Physics constants - based on realistic car physics
// Reference: https://www.asawicki.info/Mirror/Car%20Physics%20for%20Games/Car%20Physics%20for%20Games.html
export const PHYSICS = {
    // Car properties
    mass: 1000,                    // kg - lighter for more responsive feel
    wheelbase: 2.5,                // meters - distance between axles
    cgToFront: 1.25,               // meters - CG to front axle
    cgToRear: 1.25,                // meters - CG to rear axle
    cgHeight: 0.45,                // meters - lower CG for stability
    wheelRadius: 0.34,             // meters

    // Engine/drive
    engineForce: 12000,            // Newtons - more power for faster acceleration
    brakeForce: 14000,             // Newtons - max brake force

    // Resistance forces
    dragCoeff: 0.35,               // Lower drag for higher top speed
    rollingResistance: 8.0,        // Lower rolling resistance

    // Tire grip
    gripCoefficient: 1.2,          // Higher grip (racing tires)
    corneringStiffness: 1.2,       // More responsive cornering
    maxSlipAngle: 0.2,             // Radians - more slip allowed before losing grip

    // Steering
    maxSteerAngle: 0.6,            // Radians - more steering angle (~34 degrees)
    steerSpeed: 5.0,               // Faster steering response
    steerSpeedReduction: 0.4,      // Less steering reduction at high speed (was 0.6)

    // Derived/game scaling
    maxSpeed: 50,                  // m/s (~112 mph) - for game feel
    trackWidth: 10,

    // Surface effects
    sandGripMultiplier: 0.3,
    iceGripMultiplier: 0.15,

    // Collision
    collisionRestitution: 0.3,

    // Obstacles
    gravity: 9.8,                  // m/s^2
    rampLaunchSpeed: 10,
    rampHeight: 2.5,
    loopRadius: 12,
    loopMinSpeed: 18,

    // Drift physics
    driftSlipThreshold: 0.08,      // Lower threshold - easier to trigger drift
    driftGripMultiplier: 0.4,      // More grip loss when drifting for bigger slides
    driftRecoveryRate: 1.5,        // Slower recovery - drift lasts longer
    handbrakeGripMult: 0.15        // Very low rear grip with handbrake for easy drifting
};

// AI configuration
export const AI_CONFIG = {
    count: 3,
    colors: [0x0066ff, 0xffaa00, 0x9933ff],
    names: ['Blue Bolt', 'Orange Fury', 'Purple Storm']
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
    'loop':           { length: 60, curveAngle: 0, curveRadius: 0, isObstacle: true, obstacleType: 'loop', loopRadius: 12 }
};
