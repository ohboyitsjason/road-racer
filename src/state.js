import * as THREE from 'three';

// Game flow
export let gameState = 'idle';
export function setGameState(s) { gameState = s; }

// Track
export const placedPieces = [];
export const trackElements = [];
export let obstacleZones = [];
export function setObstacleZones(zones) { obstacleZones = zones; }
export let roadCurve = null;
export function setRoadCurve(c) { roadCurve = c; }
export let hasStart = false;
export function setHasStart(v) { hasStart = v; }
export let trackClosed = false;
export function setTrackClosed(v) { trackClosed = v; }

// Player
export let car = null;
export function setCar(c) { car = c; }
export let lapCount = 0;
export function setLapCount(v) { lapCount = v; }
export let raceStartTime = 0;
export function setRaceStartTime(v) { raceStartTime = v; }
export let lastCheckpoint = 0;
export function setLastCheckpoint(v) { lastCheckpoint = v; }

export let playerPhysics = {
    position: new THREE.Vector3(),
    velocity: new THREE.Vector3(),
    speed: 0,
    heading: 0,
    angularVelocity: 0,
    trackPosition: 0,
    isAirborne: false,
    airborneTime: 0,
    verticalVelocity: 0,
    groundY: 0.1
};
export function setPlayerPhysics(pp) { playerPhysics = pp; }

// AI
export const aiCars = [];

// Grandstands
export const grandstands = [];

// Drag state
export let isDragging = false;
export function setIsDragging(v) { isDragging = v; }
export let dragPieceType = null;
export function setDragPieceType(v) { dragPieceType = v; }
export let dragPreview = null;
export function setDragPreview(v) { dragPreview = v; }
export let previewMesh3D = null;
export function setPreviewMesh3D(v) { previewMesh3D = v; }
export let dragRotation = 0;
export function setDragRotation(v) { dragRotation = v; }
export let dragWorldPosition = new THREE.Vector3();

export let isDraggingExisting = false;
export function setIsDraggingExisting(v) { isDraggingExisting = v; }
export let draggedPieceIndex = -1;
export function setDraggedPieceIndex(v) { draggedPieceIndex = v; }
export let draggedPieceOriginal = null;
export function setDraggedPieceOriginal(v) { draggedPieceOriginal = v; }

export let currentSnap = null;
export function setCurrentSnap(v) { currentSnap = v; }
export let currentSnapValid = false;
export function setCurrentSnapValid(v) { currentSnapValid = v; }

// Input
export const keys = {};
