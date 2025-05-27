// sceneSetup.js
import * as THREE from 'three';
import { SETTINGS } from './settings.js'; // Assuming settings.js is in the same directory

// --- Core Three.js components ---
// Initialize components that don't depend on the canvas immediately
export const clock = new THREE.Clock();
export const scene = new THREE.Scene();
export const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);

// Player-specific camera properties
export let playerHeight = 1.7; // Initial camera height offset from player's feet, can be adjusted

// Renderer will be initialized later as it needs the canvas
export let renderer;

/**
 * Configures the scene with background, fog, and lighting.
 * Called once at module load.
 */
function configureScene() {
    scene.background = new THREE.Color(0x010309); // Dark blue for a moonlit night
    scene.fog = new THREE.Fog(0x010309, 10, 100); // Fog to match the night theme

    // Initial camera position (can be overridden later, e.g., by worldGenerator)
    camera.position.set(SETTINGS.corridorWidth / 2, playerHeight, 5);

    // Basic Lighting
    const ambientLight = new THREE.AmbientLight(0x015599, 0.1); // Dim bluish ambient light
    scene.add(ambientLight);

    const moonlight = new THREE.DirectionalLight(0x015599, 0.3); // Soft bluish moonlight
    moonlight.position.set(-10, 20, -10);
    moonlight.castShadow = true;
    moonlight.shadow.mapSize.width = 1024;
    moonlight.shadow.mapSize.height = 1024;
    moonlight.shadow.camera.near = 0.5;
    moonlight.shadow.camera.far = 50;
    moonlight.shadow.bias = -0.001;
    scene.add(moonlight);
}

/**
 * Initializes the WebGLRenderer and sets up window resize event listener.
 * @param {HTMLCanvasElement} canvas - The canvas element to render to.
 */
export function initializeRendererAndEventListeners(canvas) {
    renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.shadowMap.enabled = true;
    // renderer.outputColorSpace = THREE.SRGBColorSpace; // Optional: for more accurate colors if using post-processing or specific textures

    // Handle window resizing
    window.addEventListener('resize', onWindowResize);
}

/**
 * Handles window resize events to update camera aspect ratio and renderer size.
 */
export function onWindowResize() {
    if (camera && renderer) {
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(window.innerWidth, window.innerHeight);
    }
}

// Configure the scene as soon as the module loads
configureScene();

// Note: `renderer` is exported but will be undefined until initializeRendererAndEventListeners is called.
// `scene`, `camera`, `clock`, `playerHeight`, `onWindowResize` are available immediately.
