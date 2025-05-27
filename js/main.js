// main.js
import * as THREE from 'three';
import { FontLoader } from 'three/addons/loaders/FontLoader.js';
// import { TextGeometry } from 'three/addons/geometries/TextGeometry.js'; // Now likely only needed in worldGenerator

import { SETTINGS } from './settings.js';
//import { initializeScene, scene, camera, renderer, clock, onWindowResize } from './sceneSetup.js';
// main.js
import { scene, camera, renderer, clock, playerHeight, onWindowResize, initializeRendererAndEventListeners } from './sceneSetup.js';
// ... other imports

import { initializePlayerControls, updatePlayer, controls as playerControls, setWorldObjectsForCollision, getControlsObject } from './playerControls.js';
import { generateWorld } from './worldGenerator.js';
import { createElevator, updateElevators, callElevator, callSpecificElevatorToFloor, getClosestElevator, elevators as elevatorArray, activeElevator as currentActiveElevator } from './elevator.js'; // Assuming elevator.js exports its array and active elevator
// import { updateEnemies, createEnemy } from './enemy.js'; // Future
// import { updateProjectiles, createProjectile } from './projectile.js'; // Future
// import { interact, shoot } from './interaction.js'; // Future
// import { updateUI, displayCrushBanner, respawnPlayer as uiRespawnPlayer, applyDamageToPlayer as uiApplyDamage } from './ui.js'; // Future
// import { updateLODSystem, allRoomsData as lodRoomsDataArray } from './lodSystem.js'; // Future
import { calculateEscalatorBoost, animateActiveEscalatorSteps } from './escalator.js';

// --- Core Game State Variables ---
let worldObjects = [];
let doors = [];
let lights = []; // Light groups from lamps
let allRoomsData = []; // For LOD system, populated by generateWorld
const escalatorSteps = { up: {}, down: {} };
const escalatorStepsB = { up: {}, down: {} };
const escalatorStarts = { up: {}, down: {} };
const escalatorStartsB = { up: {}, down: {} };
const escalatorEnds = { up: {}, down: {} };
const escalatorEndsB = { up: {}, down: {} };
let playerOnEscalator = { type: null, floor: null, wing: null }; // Track which escalator area player is on

const animatedGarageDoors = [];
const enemies = []; // Placeholder for enemy objects
const projectiles = []; // Placeholder for projectile objects

let playerLives = 3;
let playerScore = 0;
let isGameOver = false;
let isPlayerRespawning = false; // Game status object

// --- Game Status Object (passed to modules that need to modify/read shared game state) ---
const gameStatus = {
    isPlayerRespawning: false,
    playerLives: 3,
    playerScore: 0,
    isGameOver: false,
    // Potentially other states like 'isPaused', etc.
};


// --- Initialization ---
function init() {
    // Initialize scene, camera, renderer from sceneSetup.js
    // initializeScene is called by sceneSetup.js itself and exports scene, camera, etc.
    // So, we can directly use the imported scene, camera, renderer, clock.

    // Initialize player controls from playerControls.js
    const instructionsElement = document.getElementById('instructions');
    const gameCanvas = document.getElementById('gameCanvas');
    //initializePlayerControls(instructionsElement, gameCanvas, scene);
    // Initialize the renderer and event listeners using the new function
    initializeRendererAndEventListeners(gameCanvas);

    // Now, 'scene', 'camera', 'clock' are already valid and 'renderer' is also set up.
    initializePlayerControls(instructionsElement, gameCanvas, scene); // 'scene' is valid here

    //

    // Load font
    const fontLoader = new FontLoader();
    fontLoader.load('https://threejs.org/examples/fonts/helvetiker_regular.typeface.json', function (loadedFont) {
        // All world generation and things dependent on the font happen here
        const worldGenParams = {
            scene,
            worldObjects,
            doors,
            lights,
            allRoomsData,
            escalatorSteps,
            escalatorStarts,
            escalatorEnds,
            escalatorStepsB,
            escalatorStartsB,
            escalatorEndsB,
            animatedGarageDoors,
            enemies, // Pass the enemies array
            font: loadedFont,
            playerInitialElevator: "mainElevator" // Specify which elevator player starts at
        };

        const { playerStartElevator } = generateWorld(worldGenParams);

        // Pass collidable objects to playerControls
        setWorldObjectsForCollision(worldObjects);

        // Set initial camera position based on the starting elevator
        if (playerStartElevator && playerStartElevator.platform) {
            const startPlayerHeight = 1.7; // Default upright height
            camera.position.set(
                playerStartElevator.platform.position.x,
                playerStartElevator.platform.position.y + startPlayerHeight + 0.2,
                playerStartElevator.platform.position.z + 0.1 // Slightly into the corridor
            );
            // Ensure player controls are updated with this position if not already handled
            if (getControlsObject()) {
                 getControlsObject().position.copy(camera.position);
            }
        } else {
            // Fallback if playerStartElevator is not found (should ideally not happen)
            camera.position.set(SETTINGS.corridorWidth / 2, 1.7, 0);
        }
        // Rotate camera to look down hallway (might need adjustment based on start elevator orientation)
        if (getControlsObject()) {
            getControlsObject().rotation.y = Math.PI;
        }


        // Start the animation loop
        animate();
    });

    // Event listeners that were in mainTMPd.js init (some are handled by playerControls.js now)
    // 'mousedown' for shoot is in playerControls.js
    // 'keydown', 'keyup' are in playerControls.js
    // 'resize' is handled by sceneSetup.js

    // Update UI initially
    updateUIMain(); // Renamed to avoid conflict if ui.js has updateUI
}

// --- Main Animation Loop ---
function animate() {
    if (gameStatus.isGameOver) return;

    requestAnimationFrame(animate);
    const deltaTime = clock.getDelta();

    if (playerControls && playerControls.isLocked) {
        // Update player (movement, collision)
        const escalatorSystem = { // Pass necessary escalator data and functions
            calculateEscalatorBoost,
            // animateActiveEscalatorSteps, // This is called separately below
            updatePlayerEscalatorState: () => { /* Placeholder for color logic if moved from updatePlayer */ },
            escalatorSteps, escalatorStarts, escalatorEnds,
            escalatorStepsB, escalatorStartsB, escalatorEndsB,
        };
        updatePlayer(deltaTime, escalatorSystem);

        // Update elevators
        // The elevator module itself handles player crushing and movement if on platform
        // It needs access to player state via imported functions from playerControls.js
        updateElevators(deltaTime, displayCrushBannerMain, respawnPlayerMain, applyDamageToPlayerMain, gameStatus);

        // updateEnemies(deltaTime); // Future
        // updateProjectiles(deltaTime); // Future
        updateGarageDoors(deltaTime); // Keep if this logic is simple and remains here
        updateUIMain();
        // updateLODSystem(deltaTime); // Future

        animateActiveEscalatorSteps(deltaTime, escalatorSteps, escalatorStepsB, escalatorStarts, escalatorStartsB, escalatorEnds, escalatorEndsB, SETTINGS, {
            escalatorMaterial: window.EscalatorMaterial, // Assuming these are set by worldGenerator
            escalatorEmbarkMaterial: window.EscalatorEmbarkMaterial
        });

        // Animate Room Lights (if this logic remains in main, otherwise move to a lightManager or similar)
        lights.forEach(lightGroup => {
            if (lightGroup.userData.isRoomLight && lightGroup.userData.animationState.isAnimating) {
                const animationState = lightGroup.userData.animationState;
                const elapsed = performance.now() - animationState.startTime;
                const progress = Math.min(elapsed / animationState.duration, 1);

                lightGroup.userData.pointLight.intensity = THREE.MathUtils.lerp(animationState.startLightIntensity, animationState.targetLightIntensity, progress);
                if (lightGroup.userData.bulbMesh) { // Check if bulbMesh exists (might be destroyed)
                    lightGroup.userData.bulbMesh.material.emissiveIntensity = THREE.MathUtils.lerp(animationState.startBulbEmissive, animationState.targetBulbEmissive, progress);
                    lightGroup.userData.bulbMesh.material.needsUpdate = true;
                }
                if (lightGroup.userData.bottomLightDisk) { // Check if disk exists
                    lightGroup.userData.bottomLightDisk.material.emissiveIntensity = THREE.MathUtils.lerp(animationState.startDiskEmissive, animationState.targetDiskEmissive, progress);
                    lightGroup.userData.bottomLightDisk.material.needsUpdate = true;
                }

                if (progress >= 1) {
                    animationState.isAnimating = false;
                }
            }
        });
        
        // Debug Overlay (can be moved to ui.js or a debug.js module)
        updateDebugOverlay();
    }
    renderer.render(scene, camera);
}

// --- UI and Game Logic Stubs/Placeholders (to be moved to their own modules) ---
function updateUIMain() {
    document.getElementById('score').innerText = `Score: ${gameStatus.playerScore}`;
    document.getElementById('lives').innerText = `Lives: ${gameStatus.playerLives.toFixed(2)}`; // Allow fractional lives if damage is fine-grained
    
    if (playerControls && playerControls.isLocked && getControlsObject()) {
        const playerCameraY = getControlsObject().position.y;
        // Assuming getPlayerHeight() from playerControls gives current collision height.
        // const currentCollisionHeight = getPlayerHeight(); // This needs to be imported from playerControls if used
        const playerFeetY = playerCameraY - 1.7; // Assuming 1.7 is upright eye height for floor calc
        const currentFloor = Math.round(playerFeetY / SETTINGS.floorHeight);
        let floorText = `Floor: ${currentFloor}`;
        if (currentFloor === 0) floorText = "Floor: G";
        else if (currentFloor < 0) floorText = `Floor: B${Math.abs(currentFloor)}`;
        document.getElementById('floorLevel').innerText = floorText;
    }
}

function displayCrushBannerMain() {
    // This function will be moved to ui.js
    // For now, it directly manipulates gameStatus
    const banner = document.getElementById('crushBanner');
    banner.style.display = 'block';
    // gameStatus.playerLives -=1; // Damage/life loss should be handled by applyDamage
    // updateUIMain(); // updateUI will reflect the new lives count

    banner.innerHTML = `<h1>You were CRUSHED!</h1><p>Lives: ${gameStatus.playerLives.toFixed(2)}</p><p>Score: ${gameStatus.playerScore}</p>`;

    if (gameStatus.playerLives <= 0) {
        setTimeout(() => {
            banner.innerHTML = '<h1>Game Over</h1>';
            // Call actual game over logic from gameLogic.js
            handlePlayerDeathMain(); // This will set gameStatus.isGameOver
        }, 2000);
    } else {
        setTimeout(() => {
            banner.style.display = 'none';
            // Player does not automatically respawn here, elevator.js handles respawn call if isPlayerRespawning is true
        }, 2000);
    }
}

function applyDamageToPlayerMain(damageAmount) {
    // This function will be moved to gameLogic.js
    if (gameStatus.isGameOver) return;
    gameStatus.playerLives -= damageAmount / 100; // Assuming damageAmount is a percentage
    if (gameStatus.playerLives <= 0) {
        gameStatus.playerLives = 0;
        handlePlayerDeathMain();
    }
    updateUIMain();
}

function handlePlayerDeathMain() {
    // This function will be moved to gameLogic.js
    if (gameStatus.playerLives > 0 && !gameStatus.isPlayerRespawning) {
        // This case is more for "near death" or forced respawn, not actual game over
        console.log("Player needs to respawn but still has lives.");
        // gameStatus.isPlayerRespawning = true; // Set by elevator crush logic
        // respawnPlayerMain(); // Respawn logic will be called by elevator or other systems
    } else if (gameStatus.playerLives <= 0) {
        gameStatus.isGameOver = true;
        document.getElementById('gameOver').style.display = 'block';
        // No confirm here, just display. Reset will be manual or via a UI button.
        console.log("Game Over!");
    }
    updateUIMain();
}

function respawnPlayerMain() {
    // This function will be moved to gameLogic.js
    // Called by elevator.js after player is crushed and needs to respawn
    gameStatus.isPlayerRespawning = false;

    if (gameStatus.playerLives <= 0) { // Should already be handled by game over
        handlePlayerDeathMain();
        return;
    }
    
    // Reset player state (e.g., to upright) using functions from playerControls.js
    // import {setPlayerState} from './playerControls.js'
    // setPlayerState('upright', 1.7); // Example

    // Move player to a safe spot (e.g., on the active elevator if available)
    const activeElev = currentActiveElevator; // Get from elevator.js
    if (activeElev && activeElev.platform && getControlsObject()) {
        const playerHeight = 1.7; // Use default upright height for respawn
        getControlsObject().position.set(
            activeElev.platform.position.x,
            activeElev.platform.position.y + playerHeight + 0.2,
            activeElev.platform.position.z
        );
        // Reset player velocity (from playerControls.js)
        // import {getPlayerVelocity} from './playerControls.js'
        // getPlayerVelocity().set(0,0,0);
    } else {
        // Fallback spawn
        if (getControlsObject()) {
            getControlsObject().position.set(SETTINGS.corridorWidth / 2, 1.7, 0);
        }
    }
    console.log("Player respawned.");
    updateUIMain();
}


function updateGarageDoors(deltaTime) {
    for (let i = animatedGarageDoors.length - 1; i >= 0; i--) {
        const door = animatedGarageDoors[i];
        if (door.userData.isAnimating) {
            const currentRotation = door.rotation.x;
            const targetRotation = door.userData.targetRotationX;
            const rotationSpeed = Math.PI / 2 * deltaTime * 0.8;

            if (Math.abs(currentRotation - targetRotation) < rotationSpeed) {
                door.rotation.x = targetRotation;
                door.userData.isAnimating = false;
                animatedGarageDoors.splice(i, 1);
            } else {
                door.rotation.x += Math.sign(targetRotation - currentRotation) * rotationSpeed;
            }
        } else {
            animatedGarageDoors.splice(i, 1);
        }
    }
}

function updateDebugOverlay() {
    const playerPos = getControlsObject() ? getControlsObject().position : new THREE.Vector3();
    document.getElementById('playerCoords').innerText = `Player: (x: ${playerPos.x.toFixed(2)}, y: ${playerPos.y.toFixed(2)}, z: ${playerPos.z.toFixed(2)})`;

    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2(0, 0); // Center of the screen
    if (camera) { // Ensure camera is initialized
        raycaster.setFromCamera(pointer, camera);
    } else {
        document.getElementById('pointedObject').innerText = "Looking at: Camera not ready";
        return;
    }
    

    const objectsToCheck = [...worldObjects, ...doors, ...lights.flatMap(lg => lg.children || [])];
    const intersects = raycaster.intersectObjects(objectsToCheck.filter(obj => obj), false); // Filter out undefined/null

    let pointedObjectInfo = "Looking at: None";
    if (intersects.length > 0) {
        const hitObject = intersects[0].object;
        const objectName = hitObject.name || "Unnamed";
        pointedObjectInfo = `Looking at: ${objectName} (Type: ${hitObject.type}, Geom: ${hitObject.geometry?.type || 'N/A'})`;
    }
    document.getElementById('pointedObject').innerText = pointedObjectInfo;
}


// --- Start the application ---
// Ensure DOM is loaded before trying to get canvas/instructions
document.addEventListener('DOMContentLoaded', init);
