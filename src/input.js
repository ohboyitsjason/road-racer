import { keys, gameState } from './state.js';

export function setupInputListeners() {
    window.addEventListener('keydown', (e) => {
        keys[e.key.toLowerCase()] = true;
        // Prevent default for game controls (arrows, WASD, and space during racing)
        if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', 'w', 'a', 's', 'd'].includes(e.key.toLowerCase())) {
            e.preventDefault();
        }
        // Prevent space from clicking focused buttons during race
        if (e.key === ' ' && gameState === 'racing') {
            e.preventDefault();
        }
    });
    window.addEventListener('keyup', (e) => keys[e.key.toLowerCase()] = false);
}
