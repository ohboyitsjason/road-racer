// Surface property definitions for different track materials
export const SURFACE_TYPES = {
    asphalt:  { friction: 0.98, speedMultiplier: 1.0,  color: 0x333333, name: 'Asphalt' },
    concrete: { friction: 0.96, speedMultiplier: 1.0,  color: 0x666666, name: 'Concrete' },
    sand:     { friction: 0.90, speedMultiplier: 0.3,  color: 0xc2b280, name: 'Sand' },
    gravel:   { friction: 0.85, speedMultiplier: 0.75, color: 0x888877, name: 'Gravel' },
    wet:      { friction: 0.88, speedMultiplier: 0.9,  color: 0x2a2a3a, name: 'Wet Asphalt' },
    ice:      { friction: 0.70, speedMultiplier: 0.85, color: 0xaaccdd, name: 'Ice' }
};

// Default surface for each piece type
export const PIECE_SURFACES = {
    'start': 'asphalt',
    'straight-short': 'asphalt',
    'straight-long': 'asphalt',
    'straight-extra': 'asphalt',
    'curve-45': 'asphalt',
    'curve-90': 'asphalt',
    'curve-banked': 'asphalt',
    'jump-ramp': 'asphalt',
    'sand-pit': 'sand',
    'ice-section': 'ice',
    'loop': 'asphalt'
};

// Get surface properties for a specific piece
export function getPieceSurface(piece) {
    return SURFACE_TYPES[piece.surface || PIECE_SURFACES[piece.type] || 'asphalt'];
}

// Get surface properties at a world position (finds which piece the position is on)
export function getSurfaceAtPosition(position, placedPieces, roadCurve) {
    // TODO: Implement position-to-piece lookup
    // For now, return default asphalt
    return SURFACE_TYPES.asphalt;
}
