// Physics constants
export const PHYSICS = {
    maxSpeed: 45,
    acceleration: 18,
    brakeForce: 35,
    engineBrake: 5,
    friction: 0.98,
    turnSpeed: 2.5,
    collisionBounce: 0.4,
    collisionFriction: 0.7,
    trackWidth: 10,
    sandSlowdown: 0.4,
    gravity: 30,
    rampLaunchSpeed: 12,
    rampHeight: 2.5
};

// AI configuration
export const AI_CONFIG = {
    count: 3,
    colors: [0x0066ff, 0xffaa00, 0x9933ff],
    names: ['Blue Bolt', 'Orange Fury', 'Purple Storm']
};

// Piece data (without createMesh references - those are added in pieces.js)
export const PIECE_DATA = {
    'start':          { length: 15, curveAngle: 0, curveRadius: 0, isStart: true },
    'straight-short': { length: 15, curveAngle: 0, curveRadius: 0 },
    'straight-long':  { length: 30, curveAngle: 0, curveRadius: 0 },
    'curve-45':       { length: 0, curveAngle: Math.PI / 4, curveRadius: 25, direction: 1 },
    'curve-90':       { length: 0, curveAngle: Math.PI / 2, curveRadius: 25, direction: 1 },
    'jump-ramp':      { length: 30, curveAngle: 0, curveRadius: 0, isObstacle: true, obstacleType: 'jump' },
    'sand-pit':       { length: 30, curveAngle: 0, curveRadius: 0, isObstacle: true, obstacleType: 'sand' }
};
