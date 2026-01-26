import * as THREE from 'three';
import { placedPieces } from '../state.js';
import { placePieceAt } from './placement.js';
import { clearTrack, updateTrackStatus } from './trackState.js';

const SAVE_VERSION = 1;

// Serialize the current track to JSON
export function serializeTrack() {
    return JSON.stringify({
        version: SAVE_VERSION,
        pieces: placedPieces.map(piece => ({
            type: piece.type,
            position: { x: piece.position.x, y: piece.position.y, z: piece.position.z },
            heading: piece.heading,
            surface: piece.surface || null
        }))
    });
}

// Deserialize and rebuild track from JSON
export function deserializeTrack(jsonString) {
    const data = JSON.parse(jsonString);
    if (data.version !== SAVE_VERSION) {
        throw new Error(`Unsupported save version: ${data.version}`);
    }

    clearTrack();

    for (const pieceData of data.pieces) {
        const position = new THREE.Vector3(pieceData.position.x, pieceData.position.y, pieceData.position.z);
        placePieceAt(pieceData.type, position, pieceData.heading);
        if (pieceData.surface) {
            placedPieces[placedPieces.length - 1].surface = pieceData.surface;
        }
    }

    updateTrackStatus();
}

// Save to localStorage
export function saveToLocalStorage(name = 'default') {
    localStorage.setItem(`road-racer-track-${name}`, serializeTrack());
}

// Load from localStorage
export function loadFromLocalStorage(name = 'default') {
    const data = localStorage.getItem(`road-racer-track-${name}`);
    if (!data) throw new Error(`No saved track: ${name}`);
    deserializeTrack(data);
}

// List saved tracks
export function listSavedTracks() {
    return Object.keys(localStorage)
        .filter(k => k.startsWith('road-racer-track-'))
        .map(k => k.replace('road-racer-track-', ''));
}

// Export track as downloadable JSON file
export function exportTrackAsFile() {
    const blob = new Blob([serializeTrack()], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'track.json';
    a.click();
    URL.revokeObjectURL(url);
}
