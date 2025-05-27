// interaction.js
import * as THREE from 'three';
import { SETTINGS } from './settings.js';
// Functions and objects from other modules will be passed via initializeInteraction

let sceneRef, cameraRef, controlsRef, clockRef;
let doorsRef, worldObjectsRef, lightsRef, allRoomsDataRef, enemiesRef, projectilesRef;
let elevatorArrayRef, currentActiveElevatorRef;
let callSpecificElevatorFunc, createProjectileFunc, applyDamageFunc, createBulletHoleFunc;
let animatedGarageDoorsRef;
let gameStatusRef;
let getPlayerHeightFunc;

// UI Callbacks
let displaySafeCrackedBannerFunc, displayCrushBannerFunc;
let updateSingleRoomVisibilityFunc; // For LOD updates

// Materials (can be passed or defined if specific to interaction effects)
let bulletHoleTexture = null; // Loaded in initializeInteraction

/**
 * Initializes the interaction module with necessary references from the main game.
 * @param {object} refs - An object containing all necessary references.
 */
export function initializeInteraction(refs) {
    sceneRef = refs.scene;
    cameraRef = refs.camera;
    controlsRef = refs.controls;
    clockRef = refs.clock;
    doorsRef = refs.doors;
    worldObjectsRef = refs.worldObjects;
    lightsRef = refs.lights;
    allRoomsDataRef = refs.allRoomsData;
    enemiesRef = refs.enemiesArray; // Corrected name
    projectilesRef = refs.projectilesArray; // Corrected name
    elevatorArrayRef = refs.elevatorArray;
    currentActiveElevatorRef = refs.currentActiveElevator; // This might be tricky if it's a let variable; consider a getter
    callSpecificElevatorFunc = refs.callSpecificElevatorToFloor;
    createProjectileFunc = refs.createProjectile;
    applyDamageFunc = refs.applyDamageFunc;
    createBulletHoleFunc = refs.createBulletHoleFunc;
    animatedGarageDoorsRef = refs.animatedGarageDoors;
    gameStatusRef = refs.gameStatus;
    getPlayerHeightFunc = refs.getPlayerHeightFunc;

    displaySafeCrackedBannerFunc = refs.displaySafeCrackedBannerFunc;
    // displayCrushBannerFunc = refs.displayCrushBannerFunc; // This is usually called by elevator/player logic directly

    // LOD update function
    updateSingleRoomVisibilityFunc = refs.updateSingleRoomVisibilityFunc;


    // Load textures or other assets specific to interactions
    if (refs.textureLoader) {
        bulletHoleTexture = refs.textureLoader.load('textures/bulletHole.png');
    } else {
        console.warn("TextureLoader not provided to initializeInteraction. Bullet holes may not appear correctly.");
        // Fallback material for bullet holes if texture fails
        bulletHoleTexture = new THREE.MeshBasicMaterial({ color: 0x333333, transparent: true, opacity: 0.5 });
    }
}


/**
 * Handles player interaction with objects in the world (e.g., doors, safes, lights).
 */
export function interact() {
    if (!controlsRef || !controlsRef.isLocked) return;

    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2(0, 0); // Center of the screen
    raycaster.setFromCamera(pointer, cameraRef);

    const objectsToInteract = [...doorsRef, ...worldObjectsRef, ...lightsRef];
    const intersects = raycaster.intersectObjects(objectsToInteract, true); // true for recursive

    if (intersects.length > 0) {
        const intersected = intersects[0].object;
        const interactDistance = intersects[0].distance;
        const MAX_INTERACT_DISTANCE = 3; // Max distance player can interact from

        if (interactDistance > MAX_INTERACT_DISTANCE) {
            // console.log("Too far to interact with:", intersected.name);
            return;
        }

        // 1. Door Knobs (if they still exist and door is locked)
        if (intersected.userData.doorKnob && intersected.parent && intersected.parent.userData.type === 'door') {
            const door = intersected.parent;
            if (door.userData.locked) {
                // This interaction is usually via shooting the knob. 'E' might just give a hint.
                console.log("This door is locked. Maybe try another way?");
                return;
            }
        }
        // 2. Doors
        else if (intersected.userData.type === 'door') {
            const door = intersected;
            if (!door.userData.locked) {
                door.userData.isOpen = !door.userData.isOpen;
                const playerX = controlsRef.getObject().position.x;
                const doorX = door.position.x;
                let openAngle = 0;

                if (door.userData.isOpen) {
                    if (doorX === 0 || Math.abs(doorX - SETTINGS.corridorWidth) < 0.1) { // Corridor doors
                        const isRightSideDoor = Math.abs(doorX) < 0.1; // Door on the X=0 wall
                        const isPlayerInCorridor = playerX > 0 && playerX < SETTINGS.corridorWidth;
                        
                        if (isRightSideDoor) { // Door at X=0 (player's right if facing +Z)
                           openAngle = playerX > doorX ? -Math.PI / 2 : Math.PI / 2; // Opens away from player
                        } else { // Door at X=corridorWidth (player's left if facing +Z)
                           openAngle = playerX < doorX ? Math.PI / 2 : -Math.PI / 2; // Opens away from player
                        }
                    } else { // Could be other types of doors, simple toggle for now
                         openAngle = Math.PI / 2;
                    }
                }
                door.rotation.y = openAngle;
                console.log(`Door ${door.name} ${door.userData.isOpen ? 'opened' : 'closed'}.`);

                // LOD Update
                if (updateSingleRoomVisibilityFunc && door.userData.roomId) {
                    const roomData = allRoomsDataRef.find(r => r.id === door.userData.roomId);
                    if (roomData) {
                        roomData.visibleByDoor = door.userData.isOpen;
                        updateSingleRoomVisibilityFunc(roomData, playerControlsRef.getObject().position, cameraRef.getWorldDirection(new THREE.Vector3()));
                    }
                }
            } else {
                console.log(`Door ${door.name} is locked.`);
            }
        }
        // 3. Safe Dials
        else if (intersected.userData.isSafeDial && intersected.parent && intersected.parent.name.startsWith('Safe_')) {
            const safe = intersected.parent;
            if (safe.userData && !safe.userData.isCracked && !safe.userData.pointsAwarded) {
                safe.userData.dialPresses = (safe.userData.dialPresses || 0) + 1;
                console.log(`Safe dial pressed. Count: ${safe.userData.dialPresses}/${safe.userData.dialPressesRequired}`);
                if (safe.userData.dialPresses >= safe.userData.dialPressesRequired) {
                    crackSafe(safe);
                }
            } else if (safe.userData && safe.userData.isCracked) {
                console.log("Safe already cracked.");
            }
        }
        // 4. Lights (Toggle On/Off)
        else if (intersected.userData.isRoomLight || (intersected.parent && intersected.parent.userData.isRoomLight)) {
            const lightGroup = intersected.userData.isRoomLight ? intersected : intersected.parent;
            if (lightGroup && lightGroup.userData.isRoomLight && !lightGroup.userData.isDestroyed) {
                toggleRoomLight(lightGroup);
            }
        }
        // 5. Garage Doors
        else if (intersected.userData.type === 'garageDoor') {
            const garageDoor = intersected;
            if (!garageDoor.userData.isAnimating) {
                garageDoor.userData.isOpen = !garageDoor.userData.isOpen;
                garageDoor.userData.isAnimating = true;
                garageDoor.userData.targetRotationX = garageDoor.userData.isOpen ? -Math.PI / 2.1 : 0;
                if (!animatedGarageDoorsRef.includes(garageDoor)) {
                    animatedGarageDoorsRef.push(garageDoor);
                }
                console.log(`Garage door on floor ${garageDoor.userData.floor} is now ${garageDoor.userData.isOpen ? 'opening' : 'closing'}.`);
            }
        }
        // 6. Elevator Parts (Call Elevator)
        else if (intersected.userData.elevatorId || (intersected.parent && intersected.parent.userData.elevatorId)) {
            let elevatorId = intersected.userData.elevatorId || intersected.parent.userData.elevatorId;
            const targetElevator = elevatorArrayRef.find(e => e.id === elevatorId);
            if (targetElevator && callSpecificElevatorFunc) {
                const playerFloorY = controlsRef.getObject().position.y;
                const playerCurrentFloorIndex = Math.max(
                    targetElevator.minFloorIndex,
                    Math.min(targetElevator.maxFloorIndex, Math.round((playerFloorY - (getPlayerHeightFunc? getPlayerHeightFunc() : 1.7)) / SETTINGS.floorHeight))
                );
                callSpecificElevatorFunc(targetElevator, playerCurrentFloorIndex);
                console.log(`Called elevator ${elevatorId} to floor ${playerCurrentFloorIndex}.`);
            }
        }
    }
}

/**
 * Handles player shooting action.
 */
export function shoot() {
    if (!controlsRef || !controlsRef.isLocked) return;

    const projectileStartOffset = 0.5;
    const projectileDirection = new THREE.Vector3();
    cameraRef.getWorldDirection(projectileDirection);

    const projectileStartPosition = new THREE.Vector3();
    cameraRef.getWorldPosition(projectileStartPosition);
    projectileStartPosition.addScaledVector(projectileDirection, projectileStartOffset);
    projectileStartPosition.y -= 0.2; // Barrel height adjustment

    if (createProjectileFunc) {
        createProjectileFunc({
            startPosition: projectileStartPosition,
            direction: projectileDirection,
            firedByPlayer: true,
            scene: sceneRef,
            projectilesArray: projectilesRef,
            worldObjectsArray: worldObjectsRef, // Pass for projectile collision checks
            projectileMaterial: new THREE.MeshStandardMaterial({ color: 0x00ff00, emissive: 0x00ff00 }), // Player projectile material
            projectileGeometry: new THREE.SphereGeometry(SETTINGS.projectileSize || 0.1, 8, 8) // Player projectile geometry
        });
    }

    // Raycasting for direct hits on interactables (knobs, safes, windows, lights)
    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2(0, 0);
    raycaster.setFromCamera(pointer, cameraRef);
    const MAX_SHOOT_INTERACT_DISTANCE = 50; // Max distance for direct shoot interaction

    // Check non-enemy interactables first
    const interactables = [...doorsRef, ...worldObjectsRef, ...lightsRef].filter(obj => obj.userData.type !== 'enemy');
    const intersects = raycaster.intersectObjects(interactables, true);

    if (intersects.length > 0) {
        const hit = intersects[0];
        if (hit.distance <= MAX_SHOOT_INTERACT_DISTANCE) {
            const hitObject = hit.object;

            if (hitObject.userData.doorKnob && hitObject.parent && hitObject.parent.userData.type === 'door') {
                const door = hitObject.parent;
                if (door.userData.locked) {
                    unlockDoorByShootingKnob(door, hitObject);
                    // LOD Update
                    if (updateSingleRoomVisibilityFunc && door.userData.roomId) {
                        const roomData = allRoomsDataRef.find(r => r.id === door.userData.roomId);
                        if (roomData) {
                            roomData.visibleByDoor = door.userData.isOpen;
                             updateSingleRoomVisibilityFunc(roomData, playerControlsRef.getObject().position, cameraRef.getWorldDirection(new THREE.Vector3()));
                        }
                    }
                }
            } else if (hitObject.userData.isSafeDial && hitObject.parent && hitObject.parent.name.startsWith('Safe_')) {
                const safe = hitObject.parent;
                if (safe.userData && !safe.userData.isCracked && !safe.userData.pointsAwarded) {
                    crackSafe(safe); // Shooting the dial cracks it instantly
                    if (createBulletHoleFunc) createBulletHoleFunc(hit.point, hit.face.normal, sceneRef);
                }
            } else if (hitObject.userData.isWindow) {
                breakWindow(hitObject);
                if (createBulletHoleFunc) createBulletHoleFunc(hit.point, hit.face.normal, sceneRef);
            } else if (lightsRef.includes(hitObject) || (hitObject.parent && lightsRef.includes(hitObject.parent))) {
                const lightGroup = lightsRef.includes(hitObject) ? hitObject : hitObject.parent;
                if (lightGroup.userData && !lightGroup.userData.isDestroyed) {
                    destroyLight(lightGroup);
                    if (createBulletHoleFunc) createBulletHoleFunc(hit.point, hit.face.normal, sceneRef);
                }
            } else {
                // Hit a generic world object
                if (createBulletHoleFunc) createBulletHoleFunc(hit.point, hit.face.normal, sceneRef);
            }
            return; // Projectile interaction handled, no need for it to also hit
        }
    }
}

// --- Helper functions for interactions (can be further modularized later) ---

function toggleRoomLight(lightGroup) {
    if (!lightGroup || !lightGroup.userData || !lightGroup.userData.animationState) return;
    
    lightGroup.userData.isOn = !lightGroup.userData.isOn;
    const { pointLight, bulbMesh, bottomLightDisk, animationState } = lightGroup.userData;

    animationState.isAnimating = true;
    animationState.startTime = performance.now();
    animationState.duration = 500; // milliseconds

    if (lightGroup.userData.isOn) {
        animationState.startLightIntensity = pointLight.intensity;
        animationState.targetLightIntensity = 1.0;
        animationState.startBulbEmissive = bulbMesh ? bulbMesh.material.emissiveIntensity : 0;
        animationState.targetBulbEmissive = 2.0;
        animationState.startDiskEmissive = bottomLightDisk ? bottomLightDisk.material.emissiveIntensity : 0;
        animationState.targetDiskEmissive = 1.0;
        console.log(`Room light ${lightGroup.userData.roomId} turning ON`);
    } else {
        animationState.startLightIntensity = pointLight.intensity;
        animationState.targetLightIntensity = 0;
        animationState.startBulbEmissive = bulbMesh ? bulbMesh.material.emissiveIntensity : 0.1;
        animationState.targetBulbEmissive = 0.1;
        animationState.startDiskEmissive = bottomLightDisk ? bottomLightDisk.material.emissiveIntensity : 0;
        animationState.targetDiskEmissive = 0;
        console.log(`Room light ${lightGroup.userData.roomId} turning OFF`);
    }
}


function unlockDoorByShootingKnob(door, knob) {
    if (!door || !door.userData || !knob || !bulletHoleTexture) return;

    // Create a decal for the shot knob
    const decalMaterial = bulletHoleTexture instanceof THREE.Texture ? 
        new THREE.MeshBasicMaterial({ map: bulletHoleTexture, transparent: true, depthWrite: false, side:THREE.DoubleSide }) :
        bulletHoleTexture; // Use fallback material if texture loading failed

    const decalGeometry = new THREE.PlaneGeometry(0.2, 0.2);
    const decal = new THREE.Mesh(decalGeometry, decalMaterial);
    
    decal.position.copy(knob.position); // Position decal where knob was
    // Decal needs to be oriented correctly on the door surface.
    // This depends on how doors/knobs are oriented. Assuming knob is a child of door:
    decal.rotation.copy(knob.rotation); // Start with knob's rotation
    // If knobs are oriented along Z of door, and door face is XY plane locally:
    // decal.lookAt(door.position.clone().add(new THREE.Vector3(0,0, (knob.position.z > 0 ? 1 : -1) ))); // Simplified
    
    // A more robust way is to align to the door's local Z axis (or whichever axis is outward)
    const doorNormalLocal = new THREE.Vector3(0,0,1); // Assuming door front is local +Z
    const doorNormalWorld = doorNormalLocal.applyQuaternion(door.quaternion);
    decal.lookAt(decal.position.clone().add(doorNormalWorld));


    door.add(decal); // Add decal as child of the door
    door.remove(knob); // Remove the original knob

    door.userData.locked = false;
    door.userData.isOpen = true; // Open the door

    // Determine open angle
    const playerX = controlsRef.getObject().position.x;
    const doorX = door.position.x;
    let openAngle;
    if (Math.abs(doorX) < 0.1) { // Right-side door (at X=0)
        openAngle = (playerX > doorX) ? -Math.PI / 2 : Math.PI / 2;
    } else { // Left-side door (at X=SETTINGS.corridorWidth)
        openAngle = (playerX < doorX) ? Math.PI / 2 : -Math.PI / 2;
    }
    door.rotation.y = openAngle;

    console.log(`Door ${door.name} unlocked and opened by shooting knob.`);
}

function crackSafe(safe) {
    if (!safe || !safe.userData || safe.userData.isCracked || safe.userData.pointsAwarded) return;

    console.log("Safe cracked!", safe.name);
    safe.userData.isCracked = true;
    safe.userData.pointsAwarded = true;
    gameStatusRef.playerScore += 500;
    // updateUIMain(); // UI update should be handled by main or ui.js

    if (displaySafeCrackedBannerFunc) {
        displaySafeCrackedBannerFunc();
    }

    const dial = safe.children.find(child => child.userData.isSafeDial);
    if (dial) safe.remove(dial);
    // Optional: Change safe appearance
    // safe.material.color.set(0x00ff00);
}

function breakWindow(windowMesh) {
    if (!windowMesh || !windowMesh.userData.isWindow) return;
    console.log(`Window ${windowMesh.name} broken.`);
    
    // LOD: Update visibility if linked room becomes exposed
    if (updateSingleRoomVisibilityFunc && windowMesh.userData.roomId) {
        const roomData = allRoomsDataRef.find(r => r.id === windowMesh.userData.roomId);
        if (roomData) {
            roomData.windowGlass = null; // Mark window as gone
            roomData.visibleByWindow = true; // Assume room is now visible through broken window
            updateSingleRoomVisibilityFunc(roomData, playerControlsRef.getObject().position, cameraRef.getWorldDirection(new THREE.Vector3()));
        }
    }

    sceneRef.remove(windowMesh);
    const index = worldObjectsRef.indexOf(windowMesh);
    if (index > -1) worldObjectsRef.splice(index, 1);
    
    windowMesh.geometry.dispose();
    windowMesh.material.dispose();
}

function destroyLight(lightGroup) {
    if (!lightGroup || !lightGroup.userData.isDestroyed) {
        lightGroup.userData.isDestroyed = true;
        gameStatusRef.playerScore += 10;
        // updateUIMain();

        if (lightGroup.userData.pointLight) {
            lightGroup.userData.pointLight.intensity = lightGroup.userData.pointLight.intensity * 5 + 2; // Flash
            setTimeout(() => {
                if (lightGroup.userData.pointLight) lightGroup.userData.pointLight.intensity = 0;
                if (!lightGroup.userData.isRoomLight) { // Corridor light
                    disableCorridorLightsOnFloor(lightGroup.userData.floorIndex);
                } else { // Room light specific parts
                     if(lightGroup.userData.bulbMesh) lightGroup.userData.bulbMesh.material.emissiveIntensity = 0;
                     if(lightGroup.userData.bottomLightDisk) lightGroup.userData.bottomLightDisk.material.emissiveIntensity = 0;
                }
            }, 150);
        }

        const bulb = lightGroup.children.find(child => child.name.includes('Bulb') || child.geometry instanceof THREE.SphereGeometry);
        if (bulb) {
            // breakLightBulb(bulb); // Visual effect, can be added
            lightGroup.remove(bulb);
            if(bulb.geometry) bulb.geometry.dispose();
            if(bulb.material) bulb.material.dispose();
        }
        const disk = lightGroup.children.find(child => child.name.includes('Disk') || child.geometry instanceof THREE.CircleGeometry);
        if (disk) {
            lightGroup.remove(disk);
             if(disk.geometry) disk.geometry.dispose();
            if(disk.material) disk.material.dispose();
        }
        // Lampshade can be made to fall or disappear
        const lampshade = lightGroup.children.find(child => child.name.includes('Lampshade') || child.geometry instanceof THREE.ConeGeometry);
        if (lampshade) {
            // dropLampshade(lampshade); // More complex effect
            lightGroup.remove(lampshade);
             if(lampshade.geometry) lampshade.geometry.dispose();
            if(lampshade.material) lampshade.material.dispose();
        }
        console.log(`Light ${lightGroup.name} destroyed.`);
    }
}

function disableCorridorLightsOnFloor(floorIndex) {
    lightsRef.forEach(lg => {
        if (lg.userData.floorIndex === floorIndex && !lg.userData.isRoomLight && !lg.userData.isDestroyed) {
            // This function is called when one corridor light is shot.
            // The actual destruction and visual changes for *that specific light* are handled in destroyLight.
            // This function could be used for a broader effect, like all lights on the floor flickering or
            // a small chance of others also failing, but typically destroying one doesn't destroy all.
            // For now, individual destruction is handled by destroyLight.
            // If you want a cascading failure, that logic would go here.
            // lg.userData.isDestroyed = true; // If all go out
            // if(lg.userData.pointLight) lg.userData.pointLight.intensity = 0;
            // ... remove its parts ...
        }
    });
    console.log(`Potentially disabling other corridor lights on floor ${floorIndex} - currently individual.`);
}


/**
 * Handles picking up a lampshade. (Example interaction)
 */
export function pickUpLampshade() {
    if (!controlsRef || !controlsRef.isLocked) return;
    const playerPosition = controlsRef.getObject().position;
    const MAX_PICKUP_DISTANCE = 2.0;

    for (let i = worldObjectsRef.length - 1; i >= 0; i--) {
        const obj = worldObjectsRef[i];
        // Assuming dropped lampshades are added to worldObjects and have specific userData
        if (obj.userData.isDroppedLampshade && obj.position.distanceTo(playerPosition) < MAX_PICKUP_DISTANCE) {
            console.log("Picked up a dropped lampshade:", obj.name);
            sceneRef.remove(obj);
            worldObjectsRef.splice(i, 1);
            if(obj.geometry) obj.geometry.dispose();
            if(obj.material) obj.material.dispose();
            // Add to inventory or apply effect
            gameStatusRef.playerScore += 5;
            // updateUIMain();
            break; 
        }
    }
}
