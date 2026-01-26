import * as state from '../state.js';

export function updateLeaderboard() {
    const standings = [{ name: 'You', progress: state.lapCount + state.playerPhysics.trackPosition, lap: state.lapCount, isPlayer: true }];
    state.aiCars.forEach(ai => standings.push({ name: ai.name, progress: ai.lapCount + ai.trackPosition, lap: ai.lapCount, isPlayer: false }));
    standings.sort((a, b) => b.progress - a.progress);

    const leaderboardDiv = document.getElementById('leaderboard');
    leaderboardDiv.innerHTML = '<strong>Standings:</strong><br>';
    standings.forEach((racer, index) => {
        leaderboardDiv.innerHTML += `<div class="leader-entry position-${index + 1} ${racer.isPlayer ? 'player-entry' : ''}">${index + 1}. ${racer.name} (Lap ${Math.min(racer.lap + 1, 3)})</div>`;
    });
}

export function formatTime(seconds) {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
}

export function getOrdinal(n) {
    const s = ['th', 'st', 'nd', 'rd'];
    const v = n % 100;
    return n + (s[(v - 20) % 10] || s[v] || s[0]);
}
