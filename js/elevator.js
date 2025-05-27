// elevator.js
import * as THREE from 'three';
import { SETTINGS } from './settings.js';
import { getControlsObject, getPlayerHeight, getPlayerState, setPlayerState, getPlayerVelocity, setPlayerOnGround } from './playerControls.js';

const elevators = [];
let activeElevator = null;

export function createElevator(config) {
    const floorDepth = SETTINGS.floorHeight - SETTINGS.wallHeight;

    const elevatorObj = {
        id: config.id,
        platform: null,
        roof: null, 
        chain: null,
        shaftCeiling: null, 
        shaftPit: null,     
        poles: [],
        minFloorIndex: config.minFloorIndex,
        maxFloorIndex: config.maxFloorIndex,
        currentY: (config.startFloorIndex * SETTINGS.floorHeight) - 0.1,
        targetY: (config.startFloorIndex * SETTINGS.floorHeight) - 0.1,
        isMoving: false,
        direction: 0,
        currentFloorIndexVal: config.startFloorIndex,
        config: config 
    };

    const platformGeo = new THREE.BoxGeometry(config.shaftWidth - 0.2, 0.2, config.shaftDepth - 0.2);
    elevatorObj.platform = new THREE.Mesh(platformGeo, config.platformMaterial);
    elevatorObj.platform.name = `ElevatorPlatform_${config.id}`;
    elevatorObj.platform.position.set(config.x, elevatorObj.currentY, config.z);
    elevatorObj.platform.castShadow = true;
    elevatorObj.platform.receiveShadow = true;
    config.scene.add(elevatorObj.platform);
    config.worldObjectsArr.push(elevatorObj.platform);
    elevatorObj.platform.userData.elevatorId = config.id;
    if (!elevatorObj.platform.geometry.boundingBox) {
        elevatorObj.platform.geometry.computeBoundingBox();
    }

    const elevatorInternalRoofThickness = 0.2;
    const internalRoofGeo = new THREE.BoxGeometry(config.shaftWidth - 0.2, elevatorInternalRoofThickness, config.shaftDepth - 0.2);
    elevatorObj.roof = new THREE.Mesh(internalRoofGeo, config.platformMaterial);
    elevatorObj.roof.name = `ElevatorInternalRoof_${config.id}`;
    elevatorObj.roof.position.set(config.x, elevatorObj.currentY + SETTINGS.wallHeight, config.z);
    elevatorObj.roof.castShadow = true;
    elevatorObj.roof.receiveShadow = true;
    config.scene.add(elevatorObj.roof);
    config.worldObjectsArr.push(elevatorObj.roof);
    if (!elevatorObj.roof.geometry.boundingBox) {
        elevatorObj.roof.geometry.computeBoundingBox();
    }
    elevatorObj.roof.userData.elevatorId = config.id;

    const elevatorLight = new THREE.PointLight(0xffffff, 0.8, 4); 
    elevatorLight.position.set(0, -elevatorInternalRoofThickness / 2 - 0.1, 0);
    elevatorObj.roof.add(elevatorLight);

    const poleDimension = 0.1;
    const poleHeight = SETTINGS.wallHeight;
    const poleGeo = new THREE.BoxGeometry(poleDimension, poleHeight, poleDimension);
    const platformInnerWidth = config.shaftWidth - 0.2;
    const platformInnerDepth = config.shaftDepth - 0.2;

    const polePositions = [
        { x: -platformInnerWidth / 2 + poleDimension / 2, z: -platformInnerDepth / 2 + poleDimension / 2 },
        { x:  platformInnerWidth / 2 - poleDimension / 2, z: -platformInnerDepth / 2 + poleDimension / 2 },
        { x: -platformInnerWidth / 2 + poleDimension / 2, z:  platformInnerDepth / 2 - poleDimension / 2 },
        { x:  platformInnerWidth / 2 - poleDimension / 2, z:  platformInnerDepth / 2 - poleDimension / 2 }
    ];
    polePositions.forEach((pos, index) => {
        const pole = new THREE.Mesh(poleGeo, config.platformMaterial.clone()); 
        pole.name = `ElevatorPole_${config.id}_${index}`;
        pole.position.set(pos.x, 0.1 + poleHeight / 2, pos.z); 
        pole.castShadow = true; pole.receiveShadow = true;
        pole.userData.elevatorId = config.id;
        elevatorObj.platform.add(pole); 
        elevatorObj.poles.push(pole);
    });

    const shaftCeilingY = (config.maxFloorIndex + 1) * SETTINGS.floorHeight;
    const shaftCeilingGeo = new THREE.BoxGeometry(config.shaftWidth, floorDepth - 0.02, config.shaftDepth);
    elevatorObj.shaftCeiling = new THREE.Mesh(shaftCeilingGeo, config.shaftMaterial);
    elevatorObj.shaftCeiling.name = `ElevatorShaftCeiling_${config.id}`;
    elevatorObj.shaftCeiling.position.set(config.x, shaftCeilingY - floorDepth / 2, config.z);
    elevatorObj.shaftCeiling.castShadow = true; elevatorObj.shaftCeiling.receiveShadow = true;
    config.scene.add(elevatorObj.shaftCeiling);
    config.worldObjectsArr.push(elevatorObj.shaftCeiling);
    if (!elevatorObj.shaftCeiling.geometry.boundingBox) {
        elevatorObj.shaftCeiling.geometry.computeBoundingBox();
    }

    const pitThickness = SETTINGS.floorHeight;
    const pitTopSurfaceY = (config.minFloorIndex * SETTINGS.floorHeight) - floorDepth;
    const pitCenterY = pitTopSurfaceY - pitThickness / 2;
    const pitGeo = new THREE.BoxGeometry(config.shaftWidth, pitThickness, config.shaftDepth);
    elevatorObj.shaftPit = new THREE.Mesh(pitGeo, config.shaftMaterial);
    elevatorObj.shaftPit.name = `ElevatorShaftPit_${config.id}`;
    elevatorObj.shaftPit.position.set(config.x, pitCenterY, config.z);
    elevatorObj.shaftPit.receiveShadow = true;
    config.scene.add(elevatorObj.shaftPit);
    config.worldObjectsArr.push(elevatorObj.shaftPit);
    if (!elevatorObj.shaftPit.geometry.boundingBox) {
        elevatorObj.shaftPit.geometry.computeBoundingBox();
    }

    const chain = createDynamicChainMesh(elevatorObj, config.platformMaterial);
    elevatorObj.chain = chain;
    chain.userData.elevatorId = config.id;
    elevatorObj.platform.add(chain); 

    const piston = createElevatorPistonMesh(elevatorObj, config.platformMaterial);
    piston.userData.elevatorId = config.id;
    elevatorObj.platform.add(piston); 
    // config.worldObjectsArr.push(piston); // Not typically needed for collision if platform handles it

    elevators.push(elevatorObj);
    if (!activeElevator) {
        activeElevator = elevatorObj;
    }
    return elevatorObj;
}

function createElevatorPistonMesh(elevatorObj, material) {
    const bottomShaftThickness = 0.2;
    const totalTravel = (elevatorObj.maxFloorIndex - elevatorObj.minFloorIndex) * SETTINGS.floorHeight;
    const bottomShaftActualHeight = totalTravel + SETTINGS.floorHeight;

    const bottomShaftGeo = new THREE.BoxGeometry(bottomShaftThickness, bottomShaftActualHeight, bottomShaftThickness);
    const bottomShaft = new THREE.Mesh(bottomShaftGeo, material);
    bottomShaft.name = `ElevatorBottomPistonShaft_${elevatorObj.id}`;
    bottomShaft.position.set(0, -0.1 - (bottomShaftActualHeight / 2), 0); 
    bottomShaft.castShadow = true;
    bottomShaft.receiveShadow = true;
    if (!bottomShaft.geometry.boundingBox) {
        bottomShaft.geometry.computeBoundingBox();
    }
    return bottomShaft;
}

function createDynamicChainMesh(elevatorObj, material) {
    const chainThickness = 0.1;
    const internalRoofThickness = elevatorObj.roof.geometry.parameters.height;

    const internalRoofTopLocalY = (0.1 + SETTINGS.wallHeight - internalRoofThickness / 2) + internalRoofThickness;
    const minPlatformY = (elevatorObj.minFloorIndex * SETTINGS.floorHeight) - 0.1;
    const minInternalRoofTopWorldY = minPlatformY + internalRoofTopLocalY;
    const shaftCeilingBottomWorldY = elevatorObj.shaftCeiling.position.y - elevatorObj.shaftCeiling.geometry.parameters.height / 2;
    const initialGeomHeight = Math.max(0.01, shaftCeilingBottomWorldY - minInternalRoofTopWorldY);

    const chainGeometry = new THREE.BoxGeometry(chainThickness, initialGeomHeight, chainThickness);
    const chainMesh = new THREE.Mesh(chainGeometry, material);
    chainMesh.name = `ElevatorChain_${elevatorObj.id}`;
    chainMesh.position.set(0, internalRoofTopLocalY + initialGeomHeight / 2, 0); 
    chainMesh.castShadow = true;
    chainMesh.receiveShadow = true;
    chainMesh.userData.initialGeomHeight = initialGeomHeight;
    return chainMesh;
}

function updateChainLength(elevatorInstance) {
    const chain = elevatorInstance.chain;
    const internalRoof = elevatorInstance.roof;
    const shaftCeiling = elevatorInstance.shaftCeiling;

    if (chain && internalRoof && shaftCeiling && chain.userData.initialGeomHeight) {
        const initialGeomHeight = chain.userData.initialGeomHeight;
        const internalRoofThickness = internalRoof.geometry.parameters.height;

        const internalRoofTopWorldY = internalRoof.position.y + internalRoofThickness / 2;
        const shaftCeilingBottomWorldY = shaftCeiling.position.y - shaftCeiling.geometry.parameters.height / 2;
        const currentVisibleChainLength = Math.max(0.01, shaftCeilingBottomWorldY - internalRoofTopWorldY);

        chain.scale.y = currentVisibleChainLength / initialGeomHeight;

        const internalRoofTopLocalY = (0.1 + SETTINGS.wallHeight - internalRoofThickness / 2) + internalRoofThickness;
        chain.position.y = internalRoofTopLocalY + currentVisibleChainLength / 2;
    }
}

export function getClosestElevator() {
    if (elevators.length === 0) return null;
    if (elevators.length === 1) return elevators[0];

    const playerControlObject = getControlsObject();
    if (!playerControlObject) return elevators[0]; 

    const playerPos = playerControlObject.position;
    let closestDistanceSq = Infinity;
    let closestElev = elevators[0];

    for (const elev of elevators) {
        const distanceSq = playerPos.distanceToSquared(elev.platform.position);
        if (distanceSq < closestDistanceSq) {
            closestDistanceSq = distanceSq;
            closestElev = elev;
        }
    }
    return closestElev;
}

export function callElevator(direction) {
    const currentActiveElevator = getClosestElevator();
    if (!currentActiveElevator) return;
    activeElevator = currentActiveElevator; 

    let targetFloor = activeElevator.currentFloorIndexVal + direction;
    targetFloor = Math.max(activeElevator.minFloorIndex, Math.min(activeElevator.maxFloorIndex, targetFloor));
    const newTargetY = (targetFloor * SETTINGS.floorHeight) - 0.1;

    if (newTargetY !== activeElevator.targetY || !activeElevator.isMoving) {
        activeElevator.targetY = newTargetY;
        activeElevator.direction = Math.sign(activeElevator.targetY - activeElevator.platform.position.y);
        if (activeElevator.platform.position.y.toFixed(2) !== newTargetY.toFixed(2)) {
             activeElevator.isMoving = true;
        }
        console.log(`Elevator ${activeElevator.id} called to floor ${targetFloor}. Moving ${activeElevator.direction > 0 ? 'UP' : (activeElevator.direction < 0 ? 'DOWN' : 'STATIONARY')}.`);
    }
}

export function callSpecificElevatorToFloor(elevatorInstance, targetFloorIndex) {
    if (!elevatorInstance) return;

    const effectiveTargetFloor = Math.max(elevatorInstance.minFloorIndex, Math.min(elevatorInstance.maxFloorIndex, targetFloorIndex));
    const newTargetY = (effectiveTargetFloor * SETTINGS.floorHeight) - 0.1;

    if (newTargetY !== elevatorInstance.targetY || !elevatorInstance.isMoving) {
        elevatorInstance.targetY = newTargetY;
        elevatorInstance.direction = Math.sign(elevatorInstance.targetY - elevatorInstance.platform.position.y);
        if (elevatorInstance.platform.position.y.toFixed(2) !== newTargetY.toFixed(2)) {
            elevatorInstance.isMoving = true;
        }
        console.log(`Elevator ${elevatorInstance.id} specifically called to floor ${effectiveTargetFloor}.`);
        activeElevator = elevatorInstance; 
    }
}

/**
 * Updates the state and position of all elevators.
 * @param {number} deltaTime - The time elapsed since the last frame.
 * @param {Function} displayCrushBannerFunc - Function to display the crush banner (from ui.js via main.js).
 * @param {Function} respawnPlayerFunc - Function to respawn the player (from gameLogic.js via main.js).
 * @param {Function} applyDamageFunc - Function to apply damage to the player (from gameLogic.js via main.js).
 * @param {object} gameStatus - Shared game status object from main.js.
 */
export function updateElevators(deltaTime, displayCrushBannerFunc, respawnPlayerFunc, applyDamageFunc, gameStatus) {
    const playerControlObject = getControlsObject(); // From playerControls.js
    const currentPlayerHeight = getPlayerHeight ? getPlayerHeight() : 1.7; // From playerControls.js

    elevators.forEach(elev => {
        if (!elev.isMoving) return;

        const targetY = elev.targetY;
        const currentPlatformY = elev.platform.position.y;
        const moveAmount = SETTINGS.elevatorSpeed * deltaTime * elev.direction;
        let nextPlatformY = currentPlatformY + moveAmount;
        let arrived = false;

        if (elev.direction > 0 && nextPlatformY >= targetY) {
            nextPlatformY = targetY; arrived = true;
        } else if (elev.direction < 0 && nextPlatformY <= targetY) {
            nextPlatformY = targetY; arrived = true;
        }

        elev.platform.position.y = nextPlatformY;
        elev.currentY = nextPlatformY;
        if (elev.roof) {
            elev.roof.position.y = nextPlatformY + SETTINGS.wallHeight;
            updateChainLength(elev);
        }

        elev.platform.updateMatrixWorld(true);
        if (elev.roof) elev.roof.updateMatrixWorld(true);

        if (playerControlObject) {
            handlePlayerCrush(elev, currentPlatformY, nextPlatformY, displayCrushBannerFunc, applyDamageFunc, gameStatus);

            const playerPos = playerControlObject.position;
            const playerFeetY = playerPos.y - currentPlayerHeight;
            const playerHeadY = playerPos.y;

            const isOnPlatform = 
                Math.abs(playerPos.x - elev.platform.position.x) < (elev.config.shaftWidth / 2 - 0.15) && // Slightly smaller tolerance
                Math.abs(playerPos.z - elev.platform.position.z) < (elev.config.shaftDepth / 2 - 0.15) &&
                playerFeetY >= elev.platform.position.y + 0.1 - 0.2 && // Feet on or slightly above platform top (within 0.2 tolerance)
                playerFeetY < elev.platform.position.y + 0.1 + 0.3;   // Feet not too far above platform top

            const isOnInternalRoof = elev.roof &&
                Math.abs(playerPos.x - elev.roof.position.x) < (elev.config.shaftWidth / 2 - 0.15) &&
                Math.abs(playerPos.z - elev.roof.position.z) < (elev.config.shaftDepth / 2 - 0.15) &&
                playerFeetY >= elev.roof.position.y + (elev.roof.geometry.parameters.height / 2) - 0.2 &&
                playerFeetY < elev.roof.position.y + (elev.roof.geometry.parameters.height / 2) + 0.3;


            if (isOnPlatform) {
                playerPos.y = elev.platform.position.y + 0.1 + currentPlayerHeight; 
                if(setPlayerOnGround) setPlayerOnGround(true);
                const playerVel = getPlayerVelocity ? getPlayerVelocity() : null;
                if(playerVel) playerVel.y = 0; 
            } else if (isOnInternalRoof) {
                playerPos.y = elev.roof.position.y + (elev.roof.geometry.parameters.height / 2) + currentPlayerHeight;
                if(setPlayerOnGround) setPlayerOnGround(true);
                const playerVel = getPlayerVelocity ? getPlayerVelocity() : null;
                if(playerVel) playerVel.y = 0;
            }
        }

        if (arrived) {
            elev.isMoving = false;
            elev.currentFloorIndexVal = Math.round((targetY + 0.1) / SETTINGS.floorHeight);
            console.log(`Elevator ${elev.id} arrived at floor ${elev.currentFloorIndexVal}`);

            if (playerControlObject && isOnPlatform) { // Check isOnPlatform from closure
                const playerPos = playerControlObject.position;
                const stillOnPlatformAfterArrival = 
                    Math.abs(playerPos.x - elev.platform.position.x) < (elev.config.shaftWidth / 2 - 0.1) &&
                    Math.abs(playerPos.z - elev.platform.position.z) < (elev.config.shaftDepth / 2 - 0.1) &&
                    Math.abs(playerPos.y - (elev.platform.position.y + 0.1 + currentPlayerHeight)) < 0.3;
                
                if (stillOnPlatformAfterArrival) {
                    const playerVel = getPlayerVelocity ? getPlayerVelocity() : null;
                    if(playerVel) playerVel.y = 2.0; 
                    if(setPlayerOnGround) setPlayerOnGround(false);
                }
            }

            if (gameStatus.isPlayerRespawning && elev === activeElevator) {
                if (typeof respawnPlayerFunc === 'function') respawnPlayerFunc();
                else console.warn("respawnPlayer function not provided to updateElevators");
            }
        }
    });
}


function handlePlayerCrush(elevatorInstance, currentPlatformY, nextPlatformY, displayCrushBannerFunc, applyDamageFunc, gameStatusRef) {
    const playerControlObject = getControlsObject();
    if (!playerControlObject) return;

    const playerPos = playerControlObject.position;
    const playerCurrentHeight = getPlayerHeight ? getPlayerHeight() : 1.7;
    let playerCurrentState = getPlayerState ? getPlayerState() : 'upright';

    const platform = elevatorInstance.platform;
    const internalRoof = elevatorInstance.roof;
    const shaftCeiling = elevatorInstance.shaftCeiling;

    const playerFeetY = playerPos.y - playerCurrentHeight;
    const playerHeadY = playerPos.y;

    // Check if player is underneath the elevator platform moving down
    const playerIsUnderElevator =
        Math.abs(playerPos.x - platform.position.x) < (elevatorInstance.config.shaftWidth / 2 - 0.1) &&
        Math.abs(playerPos.z - platform.position.z) < (elevatorInstance.config.shaftDepth / 2 - 0.1) &&
        playerFeetY < currentPlatformY + 0.1 && 
        playerHeadY > nextPlatformY - 0.1;      

    if (playerIsUnderElevator && elevatorInstance.direction < 0) { 
        const platformBottomActualY = nextPlatformY - 0.1; // Bottom surface of the platform
        if (platformBottomActualY <= playerHeadY) { 
            if (playerCurrentState === 'upright') {
                if(setPlayerState) setPlayerState('crouching', 1.0, -0.7);
                if (applyDamageFunc) applyDamageFunc({ target: 'player', amount: 10 });
                console.log("Player forced to crouch (under elevator)!");
            } else if (playerCurrentState === 'crouching') {
                if(setPlayerState) setPlayerState('prone', 0.5, -0.5);
                if (applyDamageFunc) applyDamageFunc({ target: 'player', amount: 20 });
                console.log("Player forced to prone (under elevator)!");
            } else if (playerCurrentState === 'prone') {
                if (displayCrushBannerFunc) displayCrushBannerFunc();
                if (applyDamageFunc) applyDamageFunc({ target: 'player', amount: 100 }); // Lethal
                gameStatusRef.isPlayerRespawning = true; 
            }
        }
    }

    if (internalRoof && shaftCeiling && playerControlObject) {
        const playerIsOnThisInternalRoof =
            Math.abs(playerPos.x - internalRoof.position.x) < (elevatorInstance.config.shaftWidth / 2 - 0.1) &&
            Math.abs(playerPos.z - internalRoof.position.z) < (elevatorInstance.config.shaftDepth / 2 - 0.1) &&
            Math.abs(playerPos.y - (internalRoof.position.y + internalRoof.geometry.parameters.height / 2 + playerCurrentHeight)) < 0.3;


        if (playerIsOnThisInternalRoof && elevatorInstance.direction > 0) { 
            const playerEffectiveTopY = internalRoof.position.y + (internalRoof.geometry.parameters.height / 2) + playerCurrentHeight;
            const shaftCeilingBottomY = shaftCeiling.position.y - (shaftCeiling.geometry.parameters.height / 2);

            if (playerEffectiveTopY >= shaftCeilingBottomY - 0.1) {
                if (playerCurrentState === 'upright') {
                    setPlayerState('crouching', 1.0, -0.7);
                    if (typeof applyDamageFn === 'function') applyDamageFn(10);
                    console.log("Player forced to crouch (shaft ceiling)!");
                } else if (playerCurrentState === 'crouching') {
                    setPlayerState('prone', 0.5, -0.5);
                    if (typeof applyDamageFn === 'function') applyDamageFn(20);
                    console.log("Player forced to prone (shaft ceiling)!");
                } else if (playerCurrentState === 'prone') {
                    if (typeof displayCrushBannerFn === 'function') displayCrushBannerFn();
                    gameStatusRef.isPlayerRespawning = true;
                }
            }
        }
    }
}

export {
    elevators,
    activeElevator, 
};
