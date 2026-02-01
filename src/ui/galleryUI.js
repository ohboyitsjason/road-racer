// Gallery UI - Tab switching, piece population, and horizontal scrolling

import { startDrag, startDragDecoration, startDragObstacle } from './dragAndDrop.js';

// Piece category definitions with images and fallback emojis
const PIECE_CATEGORIES = {
    basic: [
        { type: 'start', label: 'Start', image: null, emoji: '🏁' },
        { type: 'straight-short', label: 'Short', image: 'track-regular.png', emoji: '━' },
        { type: 'straight-long', label: 'Long', image: 'track-long.png', emoji: '━━' },
        { type: 'straight-extra', label: 'Extra', image: 'track-extralong.png', emoji: '━━━' },
        { type: 'curve-45', label: '45°', image: 'track-45.png', emoji: '↱' },
        { type: 'curve-90', label: '90°', image: 'track-90.png', emoji: '╮' }
    ],
    special: [
        { type: 'curve-banked', label: 'Banked', image: 'track-banked.png', emoji: '⤴' },
        { type: 'jump-ramp', label: 'Jump', image: null, emoji: '⛰️' },
        { type: 'sand-pit', label: 'Sand', image: null, emoji: '🏜️' },
        { type: 'ice-section', label: 'Ice', image: 'ice.png', emoji: '❄️' },
        { type: 'boost-pad', label: 'Boost', image: null, emoji: '⚡' },
        { type: 'loop', label: 'Loop', image: 'loop.png', emoji: '🔄' }
    ],
    obstacles: [
        { type: 'crate', label: 'Crate', image: null, emoji: '📦', isObstacle: true }
    ],
    props: [
        { type: 'grandstand', label: 'Stand', image: 'grandstand.png', emoji: '🏟️', isDecoration: true },
        { type: 'pyro', label: 'Pyro', image: null, emoji: '🔥', isDecoration: true },
        { type: 'tree', label: 'Tree', image: null, emoji: '🌲', isDecoration: true },
        { type: 'tree-cluster', label: 'Trees', image: null, emoji: '🌳', isDecoration: true },
        { type: 'rocks', label: 'Rocks', image: null, emoji: '🪨', isDecoration: true },
        { type: 'bush', label: 'Bush', image: null, emoji: '🌿', isDecoration: true },
        { type: 'banner', label: 'Banner', image: null, emoji: '🚩', isDecoration: true },
        { type: 'tire-stack', label: 'Tires', image: null, emoji: '⚫', isDecoration: true }
    ]
};

let activeTab = 'basic';
let isInitialized = false;
const SCROLL_AMOUNT = 136; // thumbnail size (112) + gap (24)

// Initialize the gallery UI
export function initGalleryUI() {
    if (isInitialized) return;
    isInitialized = true;

    // Set up tab click handlers
    document.querySelectorAll('.tab-btn').forEach(tab => {
        tab.addEventListener('click', () => {
            switchTab(tab.dataset.tab);
        });
    });

    // Set up scroll buttons
    document.getElementById('scroll-left').addEventListener('click', () => {
        scrollGallery(-1);
    });

    document.getElementById('scroll-right').addEventListener('click', () => {
        scrollGallery(1);
    });

    // Initial population
    populatePieces('basic');
}

// Switch to a different tab
export function switchTab(tabName) {
    // Update active tab styling
    document.querySelectorAll('.tab-btn').forEach(tab => {
        tab.classList.toggle('active', tab.dataset.tab === tabName);
    });

    activeTab = tabName;
    populatePieces(tabName);

    // Reset scroll position
    const pieceRow = document.getElementById('piece-row');
    pieceRow.scrollLeft = 0;
}

// Populate pieces for a category
export function populatePieces(category) {
    const pieceRow = document.getElementById('piece-row');
    pieceRow.innerHTML = '';

    const pieces = PIECE_CATEGORIES[category] || [];

    pieces.forEach(piece => {
        const thumbnail = document.createElement('div');
        thumbnail.className = 'piece-thumbnail';

        // Check if image exists, otherwise use placeholder with emoji
        if (piece.image) {
            thumbnail.style.backgroundImage = `url(src/assets/img/${piece.image})`;
            thumbnail.classList.add('has-image');
        } else {
            thumbnail.classList.add('placeholder');
            thumbnail.innerHTML = `<span class="piece-emoji">${piece.emoji}</span>`;
        }

        // Set appropriate data attribute based on piece type
        if (piece.isDecoration) {
            thumbnail.dataset.decoration = piece.type;
        } else if (piece.isObstacle) {
            thumbnail.dataset.obstacle = piece.type;
        } else {
            thumbnail.dataset.piece = piece.type;
        }

        thumbnail.title = piece.label;
        pieceRow.appendChild(thumbnail);
    });

    // Attach drag listeners to new elements
    attachPieceListeners();
}

// Attach drag event listeners to piece thumbnails
export function attachPieceListeners() {
    document.querySelectorAll('.piece-thumbnail').forEach(btn => {
        const pieceType = btn.dataset.piece;
        const decorationType = btn.dataset.decoration;
        const obstacleType = btn.dataset.obstacle;

        // Mouse drag
        btn.addEventListener('mousedown', (e) => {
            e.preventDefault();
            if (pieceType) startDrag(pieceType, e);
            else if (decorationType) startDragDecoration(decorationType, e);
            else if (obstacleType) startDragObstacle(obstacleType, e);
        });

        // Touch drag
        btn.addEventListener('touchstart', (e) => {
            e.preventDefault();
            const touch = e.touches[0];
            const touchEvent = { clientX: touch.clientX, clientY: touch.clientY };
            if (pieceType) startDrag(pieceType, touchEvent);
            else if (decorationType) startDragDecoration(decorationType, touchEvent);
            else if (obstacleType) startDragObstacle(obstacleType, touchEvent);
        });
    });
}

// Scroll the gallery left or right
export function scrollGallery(direction) {
    const pieceRow = document.getElementById('piece-row');
    pieceRow.scrollBy({
        left: direction * SCROLL_AMOUNT,
        behavior: 'smooth'
    });
}

// Show/hide the gallery panel
export function showGallery(visible) {
    const gallery = document.getElementById('gallery-panel');
    const rightControls = document.getElementById('right-controls');

    if (gallery) gallery.style.display = visible ? 'flex' : 'none';
    if (rightControls) rightControls.style.display = visible ? 'flex' : 'none';
}
