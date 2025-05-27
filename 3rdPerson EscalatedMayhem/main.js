// File: main.js
import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.128.0/build/three.module.js';
// OrbitControls is removed for a custom third-person camera
// import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { Player } from './player.js';
import { FloorManager } from './floorManager.js';
import { ElevatorManager } from './elevatorManager.js';
import { LightingManager } from './lightingManager.js';
import { EscalatorManager } from './escalatorManager.js';
import { DoorManager } from './doorManager.js';
import { InteractionManager } from './interactionManager.js';
import { placeDoors } from './doorPlacement.js'; // Import the door placement function
import { EnemyManager } from './enemyManager.js'; // Import EnemyManager

// --- Scene Setup ---
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
const renderer = new THREE.WebGLRenderer({ antialias: true }); // Add antialiasing for smoother edges
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setClearColor(0x222222); // Darker background for better contrast
document.body.appendChild(renderer.domElement);

// --- Global Variables ---
// const controls = new OrbitControls(camera, renderer.domElement); // Removed for third-person camera
const clock = new THREE.Clock();

// --- Managers Initialization ---
const player = new Player(scene, camera); // Pass camera to player for third-person view
const floorManager = new FloorManager(scene);
const elevatorManager = new ElevatorManager(scene);
const lightingManager = new LightingManager(scene);
const escalatorManager = new EscalatorManager(scene);
const doorManager = new DoorManager(scene);
const interactionManager = new InteractionManager(doorManager, elevatorManager, lightingManager, player, camera); // Pass lightingManager and elevatorManager

const enemyManager = new EnemyManager(scene, floorManager); // Initialize EnemyManager

// --- Initial Scene Setup ---
placeDoors(doorManager); // Place all doors using the dedicated function

// Add ambient light to illuminate the scene generally
const ambientLight = new THREE.AmbientLight(0x404040, 0.5); // Soft white light
scene.add(ambientLight);

// Add a directional light for shadows and general illumination
const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
directionalLight.position.set(50, 100, 50);
directionalLight.castShadow = true; // Enable shadows for this light
scene.add(directionalLight);

// Configure shadow properties for better quality
directionalLight.shadow.mapSize.width = 2048;
directionalLight.shadow.mapSize.height = 2048;
directionalLight.shadow.camera.near = 0.5;
directionalLight.shadow.camera.far = 500;
directionalLight.shadow.camera.left = -100;
directionalLight.shadow.camera.right = 100;
directionalLight.shadow.camera.top = 100;
directionalLight.shadow.camera.bottom = -100;

// Enable shadows on the renderer
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap; // Softer shadows

// Set player and camera initial position
player.mesh.position.set(0, 1.5, 0); // Start player on ground floor

// Set camera to a good third-person view above and behind the player
camera.position.set(0, 15, 30);
camera.lookAt(player.mesh.position);

// Optionally, add a grid helper for debugging visibility
const gridHelper = new THREE.GridHelper(100, 100);
scene.add(gridHelper);

// --- UI Interaction ---
const callElevatorBtn = document.getElementById('call-elevator-btn');
const elevatorIndexInput = document.getElementById('elevator-index');
const targetFloorInput = document.getElementById('target-floor');
const messageBox = document.getElementById('message-box');
const messageText = document.getElementById('message-text');
const messageOkBtn = document.getElementById('message-ok-btn');

callElevatorBtn.addEventListener('click', () => {
    const elevatorIndex = parseInt(elevatorIndexInput.value);
    const targetFloor = parseInt(targetFloorInput.value);

    if (isNaN(elevatorIndex) || isNaN(targetFloor)) {
        showMessage("Please enter valid numbers for elevator index and target floor.");
        return;
    }

    if (elevatorIndex < 0 || elevatorIndex >= elevatorManager.elevators.length) {
        showMessage(`Elevator index must be between 0 and ${elevatorManager.elevators.length - 1}.`);
        return;
    }

    if (targetFloor < 0 || targetFloor > floorManager.floorCount) { // Use floorManager.floorCount for max floor
        showMessage(`Target floor must be between 0 and ${floorManager.floorCount}.`);
        return;
    }

    elevatorManager.moveElevatorToFloor(elevatorIndex, targetFloor);
    showMessage(`Elevator ${elevatorIndex} called to floor ${targetFloor}.`);
});

messageOkBtn.addEventListener('click', () => {
    messageBox.style.display = 'none';
});

function showMessage(message) {
    messageText.textContent = message;
    messageBox.style.display = 'block';
}

// --- Animation Loop ---
function animate() {
    requestAnimationFrame(animate);

    const delta = clock.getDelta();

    player.update(delta, floorManager.floors); // Pass floors for collision detection
    elevatorManager.update(delta);
    escalatorManager.update(player, delta);
    doorManager.update(player); // Update door state based on player proximity
    enemyManager.update(delta, player, lightingManager.lights); // Update enemies and pass lights for interaction

    // Update camera to follow player (third-person view)
    // The player's update method now handles camera positioning.
    // If you want a fixed third-person view, you can set it here:
    // camera.position.copy(player.mesh.position).add(new THREE.Vector3(0, 5, 10));
    // camera.lookAt(player.mesh.position);

    renderer.render(scene, camera);
}

// --- Handle Window Resizing ---
window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});

// Start the animation loop
animate();