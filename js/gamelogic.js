// playerControls.js
import * as THREE from 'three';
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';
import { SETTINGS } from './settings.js';
import { camera, scene, playerHeight as initialPlayerHeight } from './sceneSetup.js';

// Import interaction functions that will be called by player input
import { interact, shoot, pickUpLampshade } from './interaction.js'; // Added pickUpLampshade
// Import elevator call function
import { callElevator } from './elevator.js';


// --- Player State and Controls ---
let controls;
let playerVelocity = new THREE.Vector3();
let playerOnGround = false;
let moveForward = false, moveBackward = false, moveLeft = false, moveRight = false, isSprinting = false;
let playerHeight = initialPlayerHeight;
let playerState = 'upright';

let worldObjects = [];

/**
 * Initializes PointerLockControls and sets up event listeners for player input.
 * @param {HTMLElement} instructionsElement - The HTML element for displaying instructions.
 * @param {HTMLElement} gameCanvas - The HTML canvas element for locking the pointer.
 */
export function initializePlayerControls(instructionsElement, gameCanvas) {
    controls = new PointerLockControls(camera, gameCanvas);
    scene.add(controls.getObject());

    if (instructionsElement) {
        instructionsElement.innerHTML = `
            <p>Click to Play</p>
            <p>Move: W/A/S/D</p>
            <p>Jump: Space</p>
            <p>Sprint: Shift</p>
            <p>Crouch: Ctrl</p>
            <p>Prone: Ctrl (while crouching)</p>
            <p>Interact: E</p>
            <p>Shoot: Left Mouse Button</p>
            <p>Call Elevator Up/Down: U/J</p>
            <p>Pickup Lampshade: F</p> `;
        controls.addEventListener('lock', () => instructionsElement.style.display = 'none');
        controls.addEventListener('unlock', () => instructionsElement.style.display = 'block');
    }

    gameCanvas.addEventListener('click', () => {
        if (!controls.isLocked) {
            controls.lock();
        }
    });

    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('keyup', onKeyUp);
    document.addEventListener('mousedown', (event) => {
        if (controls.isLocked && event.button === 0) { // Left mouse button
            shoot(); // Call imported shoot function
        }
    });

    playerVelocity.y = 2.0; // Initial jump
    return controls;
}

export function setWorldObjectsForCollision(objects) {
    worldObjects = objects;
}

function onKeyDown(event) {
    if (!controls || !controls.isLocked) return;

    switch (event.code) {
        case 'KeyW': moveForward = true; break;
        case 'KeyA': moveLeft = true; break;
        case 'KeyS': moveBackward = true; break;
        case 'KeyD': moveRight = true; break;
        case 'ShiftLeft': case 'ShiftRight': isSprinting = true; break;
        case 'Space':
            if (playerOnGround) {
                if (playerState === 'prone') {
                    setPlayerStateInternal('crouching', 1.0, 0.5);
                } else if (playerState === 'crouching') {
                    setPlayerStateInternal('upright', 1.7, 0.7);
                } else {
                    playerVelocity.y = SETTINGS.jumpVelocity;
                }
            }
            break;
        case 'ControlLeft':
            if (playerOnGround) {
                if (playerState === 'upright') {
                    setPlayerStateInternal('crouching', 1.0, -0.7);
                } else if (playerState === 'crouching') {
                    setPlayerStateInternal('prone', 0.5, -0.5);
                }
            }
            break;
        case 'KeyU': callElevator(1); break; // Uses imported callElevator
        case 'KeyJ': callElevator(-1); break; // Uses imported callElevator
        case 'KeyE': interact(); break; // Uses imported interact
        case 'KeyF': pickUpLampshade(); break; // Uses imported pickUpLampshade
    }
}

function onKeyUp(event) {
    switch (event.code) {
        case 'KeyW': moveForward = false; break;
        case 'KeyA': moveLeft = false; break;
        case 'KeyS': moveBackward = false; break;
        case 'KeyD': moveRight = false; break;
        case 'ShiftLeft': case 'ShiftRight': isSprinting = false; break;
    }
}

/**
 * Internal helper to set player state and adjust camera.
 */
function setPlayerStateInternal(newState, newHeight, cameraYAdjustment) {
    const oldHeight = playerHeight;
    playerState = newState;
    playerHeight = newHeight;
    if (controls && controls.getObject()) {
        // Adjust based on the change in height from the FEET.
        // If cameraYAdjustment is given, it's an explicit move.
        // Otherwise, adjust based on height change to keep feet on ground.
        // This logic might need refinement if cameraYAdjustment is meant to be absolute.
        // For now, assume cameraYAdjustment is the delta needed.
        controls.getObject().position.y += cameraYAdjustment;
    }
    // Speed adjustment based on state
    // This is now handled in updatePlayer directly based on playerState
}


export function updatePlayer(deltaTime, escalatorSystem) {
    if (!controls || !controls.isLocked) {
        if (!playerOnGround && camera) { // Apply gravity even if not locked but camera exists
             playerVelocity.y += SETTINGS.gravity * deltaTime;
             camera.position.y += playerVelocity.y * deltaTime; // Move camera directly
             if (checkCollision(worldObjects, camera.position.clone())) { // Check collision with camera's new pos
                if (playerVelocity.y <=0) {
                    playerOnGround = true;
                    playerVelocity.y = 0;
                    // Attempt to correct position slightly if stuck
                    // This needs a robust solution (raycasting down)
                } else {
                    playerVelocity.y = 0;
                }
             } else {
                playerOnGround = false;
             }
        }
        return;
    }

    let currentSpeed = SETTINGS.playerSpeed;
    if (playerState === 'crouching') currentSpeed *= 0.5;
    else if (playerState === 'prone') currentSpeed *= 0.25;
    if (isSprinting && playerState === 'upright') currentSpeed *= SETTINGS.sprintMultiplier;

    const actualSpeed = currentSpeed * deltaTime;
    const cameraObject = controls.getObject();
    const originalPosition = cameraObject.position.clone();

    if (!playerOnGround) playerVelocity.y += SETTINGS.gravity * deltaTime;

    const moveDirection = new THREE.Vector3();
    if (moveForward) moveDirection.z = -1;
    if (moveBackward) moveDirection.z = 1;
    if (moveLeft) moveDirection.x = -1;
    if (moveRight) moveDirection.x = 1;
    moveDirection.normalize();
    const yRotation = new THREE.Euler(0, cameraObject.rotation.y, 0, 'YXZ');
    moveDirection.applyEuler(yRotation);

    let escalatorBoostVector = new THREE.Vector3(0,0,0);
    let disembarkedDown = false;

    if (escalatorSystem && typeof escalatorSystem.calculateEscalatorBoost === 'function') {
        const escalatorResult = escalatorSystem.calculateEscalatorBoost(
            cameraObject, escalatorSystem.escalatorSteps, escalatorSystem.escalatorStarts, escalatorSystem.escalatorEnds,
            escalatorSystem.escalatorStepsB, escalatorSystem.escalatorStartsB, escalatorSystem.escalatorEndsB,
            SETTINGS, deltaTime, playerHeight
        );
        if (escalatorResult && escalatorResult.boost) escalatorBoostVector = escalatorResult.boost;
        if (escalatorResult && escalatorResult.disembarkedDown) disembarkedDown = escalatorResult.disembarkedDown;
    }

    if (disembarkedDown) {
        playerVelocity.y = SETTINGS.jumpVelocity * 0.25;
        playerOnGround = false;
    }

    const deltaX = moveDirection.x * actualSpeed + escalatorBoostVector.x * deltaTime;
    const deltaZ = moveDirection.z * actualSpeed + escalatorBoostVector.z * deltaTime;

    cameraObject.position.x += deltaX;
    if (checkCollision(worldObjects)) cameraObject.position.x = originalPosition.x;

    cameraObject.position.z += deltaZ;
    if (checkCollision(worldObjects)) cameraObject.position.z = originalPosition.z;

    cameraObject.position.y += playerVelocity.y * deltaTime;
    playerOnGround = false;
    if (checkCollision(worldObjects)) {
        if (playerVelocity.y <= 0) {
            playerOnGround = true;
            playerVelocity.y = 0;
            // Simplified correction: attempt to place player just above the collision point.
            // This is tricky without knowing the exact collision normal and depth.
            // A raycast down from originalPosition.y would be more robust.
            // For now, we might be slightly in/above. If issues, revert to:
            // cameraObject.position.y = originalPosition.y; 
            // And then try to snap to ground.
            // Let's try a small upward push if stuck after reverting.
            const tempPos = cameraObject.position.clone();
            cameraObject.position.y = originalPosition.y; // Revert Y
            if(checkCollision(worldObjects)){ // Still stuck after reverting Y?
                 cameraObject.position.y = originalPosition.y + Math.abs(playerVelocity.y * deltaTime) + 0.01; // Push up
            }


        } else {
            playerVelocity.y = 0;
            cameraObject.position.y = originalPosition.y;
        }
    }

    const lowestFloorY = -SETTINGS.numBasementFloors * SETTINGS.floorHeight;
    if (cameraObject.position.y - playerHeight < lowestFloorY - 0.1) {
        cameraObject.position.y = lowestFloorY + playerHeight - 0.1;
        playerVelocity.y = 0;
        playerOnGround = true;
    }

    if (escalatorSystem && typeof escalatorSystem.updatePlayerEscalatorState === 'function') {
        escalatorSystem.updatePlayerEscalatorState(cameraObject, playerHeight);
    }
}

function checkCollision(collisionableObjects, positionToCheck = null, isGroundCheck = false) {
    if (!controls) return false;
    const checkPosition = positionToCheck ? positionToCheck : controls.getObject().position;
    let currentCollisionHeight = playerHeight;
    let boxCenterY = checkPosition.y - currentCollisionHeight / 2; // Feet at checkPos.y - height, center is checkPos.y - height/2

    const playerBox = new THREE.Box3().setFromCenterAndSize(
        new THREE.Vector3(checkPosition.x, boxCenterY, checkPosition.z),
        new THREE.Vector3(0.5, currentCollisionHeight, 0.5)
    );

    for (const object of collisionableObjects) {
        if (!object.geometry || !object.visible) continue;
        if (!object.geometry.boundingBox) object.geometry.computeBoundingBox();
        const objectWorldBox = object.geometry.boundingBox.clone().applyMatrix4(object.matrixWorld);
        if (playerBox.intersectsBox(objectWorldBox)) return true;
    }
    return false;
}

export function getPlayerVelocity() { return playerVelocity; }
export function setPlayerOnGround(isOnGround) { playerOnGround = isOnGround; }
export function getPlayerHeight() { return playerHeight; }
export function getPlayerState() { return playerState; }

// Export this version for external modules to call if they need to change player state
export function setPlayerState(newState, newHeight, cameraYAdjustment = 0) {
    setPlayerStateInternal(newState, newHeight, cameraYAdjustment);
}

export function getControlsObject() { return controls ? controls.getObject() : null; }
export { controls }; // Export controls instance itself
