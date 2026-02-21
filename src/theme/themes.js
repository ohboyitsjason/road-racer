// Theme Definitions - Visual color schemes for the game

export const THEMES = {
    'pastel': {
        name: 'Pastel',
        sky: {
            color: 0xf5d5b8,
            fogEnabled: false,
            fogColor: 0xf5d5b8,
            fogNear: 1200,
            fogFar: 2500
        },
        ground: {
            color: 0x8bc98b,
            roughness: 0.4,
            metalness: 0.15,
            textured: true,
            textureColor: 0x7ab87a,
            textureScale: 20,
            board: {
                size: 420,
                thickness: 20,
                lipHeight: 3,
                lipColor: 0xf5f0e8,
                baseColor: 0x5c3a1e,
                bottomColor: 0x4a2e16,
                cornerRadius: 2
            }
        },
        grid: {
            useRoundedSquares: false
        },
        bedroom: { enabled: true },
        lighting: {
            ambient: { color: 0xFFFFE3, intensity: 1.0, position: { x: 0, y: 500, z: 0 } },
            directional: { color: 0xFFFFE3, intensity: 0.8, position: { x: 0, y: 500, z: -400 } }
        },
        road: {
            color: 0x666677,
            roughness: 0.85,
            markings: { color: 0xffffff, emissive: 0x000000, emissiveIntensity: 0 },
            metalness: 0.15,
            textured: true,
            textureColor: 0x7ab87a,
            textureScale: 20,
            sequence: [0xff4466, 0xffaa00, 0x3399ff],
            stripe: { roughness: 0.15, metalness: 0.4 },
            wallHeight: 1.5,
            chevronColor: 0xffffff
        },
        barriers: {
            primary: 0xffaaaa,
            secondary: 0xffffff,
            roughness: 0.4,
            metalness: 0.15,
            textured: true,
            textureColor: 0x7ab87a,
            textureScale: 20
        },
        track: {
            ice: { color: 0xaaddff, roughness: 0.1, emissive: 0x000000, emissiveIntensity: 0 },
            boost: { color: 0xffcc44, roughness: 0.6, emissive: 0x000000, emissiveIntensity: 0 },
            sand: { color: 0xd4b896, roughness: 0.95 },
            loop: { color: 0xFF6600, support: 0x2196F3, wall: 0xFF7722 },
            ramp: { color: 0x666677, arrows: 0xffcc44 }
        },
        decorations: {
            grandstand: {
                base: 0xddddee,
                seats: 0xff8888,
                roof: 0xffaaaa,
                supports: 0xcccccc
            },
            tree: {
                trunk: 0x8b6914,
                foliage: 0x5d8a47,
                roughness: 0.4,
                metalness: 0.15,
                textured: true,
                textureColor: 0x7ab87a,
                textureScale: 20
            },
            treeCluster: {
                trunk: 0x8b6914,
                foliage: [0x5d8a47, 0x6b9a55, 0x4d7a37]
            },
            rocks: {
                colors: [0x888888, 0x777777, 0x999999], 
                roughness: 0.4,
                metalness: 0.15,
                textured: true,
                textureColor: 0x7ab87a,
                textureScale: 20
            },
            bush: {
                color: 0x6b9a55,
                roughness: 0.4,
                metalness: 0.15,
                textured: true,
                textureColor: 0x7ab87a,
                textureScale: 20
            },
            banner: {
                pole: 0xaaaaaa,
                flag: 0xff6666,
                roughness: 0.4,
                metalness: 0.15,
                textured: true,
                textureColor: 0x7ab87a,
                textureScale: 20
            },
            tireStack: {
                tire: 0x333333,
                rim: 0x666666
            },
            pyro: {
                base: 0x444444,
                flame: 0xff6600
            }
        },
        cars: {
            player: 0xff6b6b,
            ai: [0x6b9fff, 0xffcc44, 0x66dd66]
        },
        particles: {
            drift: [0xaaaaaa, 0x888888],
            boost: [0xffcc44, 0xff8800],
            collision: [0xff4444, 0xff8844]
        },
        obstacles: {
            crate: { wood: 0xc4a574, trim: 0x8b6914 }
        },
        ui: {
            accent: 0xff6b6b
        }
    },

    'neon-night': {
        name: 'Neon Night',
        sky: {
            color: 0x0a0e27,
            fogColor: 0x0a0e27,
            fogNear: 100,
            fogFar: 400,
            skybox: {
                enabled: true,
                baseColor: { r: 10, g: 14, b: 39 },
                horizonColor: { r: 20, g: 10, b: 50 },
                stars: { count: 600, color: '#ffffff', glowColor: '#aaccff', minSize: 0.5, maxSize: 2.0 },
                nebula: [
                    { color: 'rgba(100, 0, 200, 0.08)', x: 0.3, y: 0.4, rx: 0.4, ry: 0.2 },
                    { color: 'rgba(0, 100, 255, 0.06)', x: 0.7, y: 0.3, rx: 0.3, ry: 0.25 },
                    { color: 'rgba(255, 0, 100, 0.05)', x: 0.5, y: 0.6, rx: 0.35, ry: 0.15 }
                ],
                hexGrid: {
                    enabled: true,
                    color: 'rgba(0, 255, 136, 0.06)',
                    glowColor: 'rgba(0, 255, 136, 0.15)',
                    size: 30,
                    lineWidth: 1
                }
            }
        },
        ground: {
            color: 0x1a2332,
            roughness: 0.95,
            board: {
                size: 420,
                thickness: 20,
                lipHeight: 3,
                lipColor: 0x1a2a3a,
                baseColor: 0x0a0f18,
                bottomColor: 0x060a10,
                cornerRadius: 2,
                lipEmissive: 0x00ff88,
                lipEmissiveIntensity: 0.1
            }
        },
        lighting: {
            ambient: { color: 0x3344aa, intensity: 0.3 },
            directional: { color: 0x8888ff, intensity: 0.4, position: { x: 50, y: 100, z: 50 } }
        },
        road: {
            color: 0x1a1f3a,
            roughness: 0.7,
            markings: { color: 0x00ffff, emissive: 0x00ffff, emissiveIntensity: 0.5 },
            sequence: [0xff0066, 0x00ffff, 0xffff00],
            stripe: { darken: 0.001, roughness: 0.75, metalness: 0.6 },
            wallHeight: 1.5,
            chevronColor: 0xffffff
        },
        barriers: {
            primary: 0x00ff88,
            secondary: 0xff00ff
        },
        track: {
            ice: { color: 0x4466ff, roughness: 0.05, emissive: 0x2244aa, emissiveIntensity: 0.3 },
            boost: { color: 0xff0066, roughness: 0.5, emissive: 0xff0066, emissiveIntensity: 0.4 },
            sand: { color: 0x3d3020, roughness: 0.95 },
            loop: { color: 0xFF4400, support: 0x0066FF, wall: 0xFF5500 },
            ramp: { color: 0x1a1f3a, arrows: 0x00ff88 }
        },
        decorations: {
            grandstand: {
                base: 0x1a1a2e,
                seats: 0x4400aa,
                roof: 0xff0088,
                supports: 0x2a2a4e
            },
            tree: {
                trunk: 0x2a1a3a,
                foliage: 0x00ff66
            },
            treeCluster: {
                trunk: 0x2a1a3a,
                foliage: [0x00ff66, 0x00dd55, 0x00ff88]
            },
            rocks: {
                colors: [0x3a3a5a, 0x4a4a6a, 0x2a2a4a]
            },
            bush: {
                color: 0x00dd55
            },
            banner: {
                pole: 0x4a4a6a,
                flag: 0xff00ff
            },
            tireStack: {
                tire: 0x1a1a2a,
                rim: 0x00ff88
            },
            pyro: {
                base: 0x2a2a3a,
                flame: 0xff0066
            }
        },
        cars: {
            player: 0x00ff88,
            ai: [0xff0066, 0x00ffff, 0xffff00]
        },
        particles: {
            drift: [0x00ff88, 0x00dd66],
            boost: [0xff0066, 0xff00aa],
            collision: [0xff0066, 0xffff00]
        },
        obstacles: {
            crate: { wood: 0x3a2a1a, trim: 0x00ff88 }
        },
        ui: {
            accent: 0x00ff88
        }
    }
};

// List of available theme names for UI
export const THEME_NAMES = Object.keys(THEMES);

// Default theme
export const DEFAULT_THEME = 'pastel';
