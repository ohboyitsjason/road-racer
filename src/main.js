import * as state from './state.js';
import { init as initScene, scene, camera, renderer, controls } from './scene.js';
import { initEnvironment } from './effects/environment.js';
import { setupInputListeners } from './input.js';
import { setupEventListeners } from './events.js';
import { updatePlayerPhysics } from './car/playerPhysics.js';
import { updateAICars } from './ai/aiCars.js';
import { updatePoofParticles, updateDriftSmoke } from './effects/particles.js';
import { updateDecorationTriggers } from './track/decorationTriggers.js';
import { updateObstaclePhysics } from './obstacles/obstaclePhysics.js';

// Boot
const container = document.getElementById('canvas-container');
initScene(container);
initEnvironment();
setupInputListeners();
setupEventListeners();

// Game loop
let lastTime = 0;
function animate(time) {
    requestAnimationFrame(animate);

    const delta = Math.min((time - lastTime) / 1000, 0.05);
    lastTime = time;

    if (state.gameState === 'idle' || state.gameState === 'building') {
        controls.update();
    }

    updatePlayerPhysics(delta);
    updateAICars(delta);
    updatePoofParticles(delta);
    updateDriftSmoke(delta);
    updateObstaclePhysics(delta);

    // Update decoration triggers during racing
    if (state.gameState === 'racing' || state.gameState === 'finished') {
        updateDecorationTriggers(delta);
    }

    renderer.render(scene, camera);
}

animate(0);
