// Theme Manager - Centralized theme state and color access

import * as THREE from 'three';
import { THEMES, DEFAULT_THEME } from './themes.js';

let currentThemeName = DEFAULT_THEME;
let themeChangeCallbacks = [];

// Load saved theme from localStorage
export function initTheme() {
    const saved = localStorage.getItem('roadRacerTheme');
    if (saved && THEMES[saved]) {
        currentThemeName = saved;
    }
    return currentThemeName;
}

// Get current theme name
export function getCurrentThemeName() {
    return currentThemeName;
}

// Get current theme object
export function getCurrentTheme() {
    return THEMES[currentThemeName];
}

// Set theme and trigger updates
export function setTheme(themeName) {
    if (!THEMES[themeName]) {
        console.warn(`Theme "${themeName}" not found`);
        return false;
    }

    currentThemeName = themeName;
    localStorage.setItem('roadRacerTheme', themeName);

    // Notify all subscribers
    themeChangeCallbacks.forEach(callback => callback(themeName));

    return true;
}

// Subscribe to theme changes
export function onThemeChange(callback) {
    themeChangeCallbacks.push(callback);
    return () => {
        themeChangeCallbacks = themeChangeCallbacks.filter(cb => cb !== callback);
    };
}

// Helper to get color by path (e.g., 'road.color', 'decorations.tree.trunk')
export function getColor(path) {
    const theme = getCurrentTheme();
    const parts = path.split('.');
    let value = theme;

    for (const part of parts) {
        if (value && typeof value === 'object' && part in value) {
            value = value[part];
        } else {
            console.warn(`Theme path "${path}" not found`);
            return 0x888888; // fallback gray
        }
    }

    return value;
}

// Helper to get a THREE.Color from theme
export function getThreeColor(path) {
    return new THREE.Color(getColor(path));
}

// Helper to get full object by path (e.g., 'track.ice' returns { color, roughness, emissive, ... })
export function getThemeObject(path) {
    const theme = getCurrentTheme();
    const parts = path.split('.');
    let value = theme;

    for (const part of parts) {
        if (value && typeof value === 'object' && part in value) {
            value = value[part];
        } else {
            console.warn(`Theme path "${path}" not found`);
            return null;
        }
    }

    return value;
}

// Get all available theme names
export function getThemeNames() {
    return Object.keys(THEMES);
}

// Get theme display name
export function getThemeDisplayName(themeName) {
    return THEMES[themeName]?.name || themeName;
}
