// worldGenerator.js
import * as THREE from 'three';
import { FontLoader } from 'three/addons/loaders/FontLoader.js'; // Keep if font is loaded here, or pass font
import { TextGeometry } from 'three/addons/geometries/TextGeometry.js';
import { SETTINGS, ENEMY_SETTINGS, lampConeGeo, lampChainGeo, lampBulbGeo, lampBottomDiskGeo, lampChainMaterial, lampLampshadeMaterial, lampCorridorDiskMaterial } from './settings.js';
import { createElevator } from './elevator.js';
import { createEnemy } from './enemy.js';


/**
 * Creates a standard lamp for corridors or general areas.
 * @param {number} x - X position.
 * @param {number} y - Y position.
 * @param {number} z - Z position.
 * @param {number} floorIndex - The floor index this lamp belongs to.
 * @param {string} lampIdSuffix - Unique suffix for the lamp ID.
 * @param {THREE.Scene} sceneRef - Reference to the main scene.
 * @param {Array<THREE.Group>} lightsArrayRef - Array to store light groups.
 * @param {THREE.Material} globalLightBulbMaterialRef - Material for the bulb.
 * @returns {THREE.Group} The created lamp group.
 */
function createStandardLamp(x, y, z, floorIndex, lampIdSuffix, sceneRef, lightsArrayRef, globalLightBulbMaterialRef) {
    // Uses lampConeGeo, lampChainGeo, lampBulbGeo, lampBottomDiskGeo,
    // lampChainMaterial, lampLampshadeMaterial, lampCorridorDiskMaterial from settings.js
    const chainMesh = new THREE.Mesh(lampChainGeo, lampChainMaterial.clone()); // Clone if material properties might change per instance
    chainMesh.position.y = 0.15;

    const bulbMesh = new THREE.Mesh(lampBulbGeo, globalLightBulbMaterialRef.clone());
    bulbMesh.position.y = -0.3 + 0.08 * 2;

    const lampshadeMesh = new THREE.Mesh(lampConeGeo, lampLampshadeMaterial.clone());

    const bottomLightDisk = new THREE.Mesh(lampBottomDiskGeo, lampCorridorDiskMaterial.clone());
    bottomLightDisk.rotation.x = Math.PI / 2;
    bottomLightDisk.position.y = -0.11;

    const lightGroup = new THREE.Group();
    lightGroup.add(lampshadeMesh);
    lightGroup.add(bottomLightDisk);
    lightGroup.add(bulbMesh);
    lightGroup.add(chainMesh);

    const lampName = `Lamp_${lampIdSuffix}`;
    lightGroup.name = lampName;
    lampshadeMesh.name = `${lampName}_Lampshade`;

    lightGroup.position.set(x, y, z);
    lightGroup.castShadow = true;

    sceneRef.add(lightGroup);
    lightsArrayRef.push(lightGroup);

    const pointLight = new THREE.PointLight(0xffffaa, 1, 5);
    pointLight.position.set(x, y - 0.3, z);
    sceneRef.add(pointLight);

    lightGroup.userData = { pointLight, floorIndex, isDestroyed: false, isRoomLight: false };
    return lightGroup;
}

/**
 * Creates a lamp specifically for a room with animatable properties.
 * @param {number} x - X position.
 * @param {number} y - Y position.
 * @param {number} z - Z position.
 * @param {number} floorIndex - The floor index.
 * @param {string} roomId - The ID of the room this lamp is in.
 * @param {THREE.Material} baseBulbMaterial - Base material for the bulb (will be cloned).
 * @param {Array<THREE.Group>} lightsArrayRef - Array to store light groups.
 * @param {THREE.Scene} sceneRef - Reference to the main scene.
 * @returns {THREE.Group} The created lamp group.
 */
function createRoomLamp(x, y, z, floorIndex, roomId, baseBulbMaterial, lightsArrayRef, sceneRef) {
    // Uses lampConeGeo, lampChainGeo, lampBulbGeo, lampBottomDiskGeo from settings.js
    const chainMaterial = new THREE.MeshStandardMaterial({ color: 0x111111 });
    const chainMesh = new THREE.Mesh(lampChainGeo, chainMaterial);
    chainMesh.position.y = 0.15;

    const lampshadeMaterial = new THREE.MeshStandardMaterial({
        color: 0x111111,
        emissive: 0x000000,
        emissiveIntensity: 0.0,
    });

    const lightDiskMaterial = new THREE.MeshStandardMaterial({
        color: 0xffddaa,
        emissive: 0xffddaa,
        emissiveIntensity: 0, // Start off
    });

    const bulbMaterialInstance = baseBulbMaterial.clone();
    bulbMaterialInstance.emissive.set(0x333322);
    bulbMaterialInstance.emissiveIntensity = 0.1;

    const bulbMesh = new THREE.Mesh(lampBulbGeo, bulbMaterialInstance);
    bulbMesh.position.y = -0.3 + 0.08 * 2;
    bulbMesh.name = `Bulb_Room_${roomId}`;

    const lampshadeMesh = new THREE.Mesh(lampConeGeo, lampshadeMaterial);
    lampshadeMesh.name = `Lampshade_Room_${roomId}`;

    const bottomLightDisk = new THREE.Mesh(lampBottomDiskGeo, lightDiskMaterial);
    bottomLightDisk.rotation.x = Math.PI / 2;
    bottomLightDisk.position.y = -0.11;
    bottomLightDisk.name = `LightDisk_Room_${roomId}`;

    const lightGroup = new THREE.Group();
    lightGroup.add(lampshadeMesh);
    lightGroup.add(bottomLightDisk);
    lightGroup.add(bulbMesh);
    lightGroup.add(chainMesh);

    lightGroup.name = `RoomLamp_${roomId}`;
    lightGroup.position.set(x, y, z);
    lightGroup.castShadow = true;

    // sceneRef.add(lightGroup); // Light group added via roomContentsGroup
    lightsArrayRef.push(lightGroup);

    const pointLight = new THREE.PointLight(0xffddaa, 0, 5);
    pointLight.position.set(x, y - 0.3, z);
    sceneRef.add(pointLight);

    lightGroup.userData = {
        pointLight, bulbMesh, bottomLightDisk, floorIndex, roomId,
        animationState: { isAnimating: false, startTime: 0, duration: 500, startLightIntensity: 0, targetLightIntensity: 0, startBulbEmissive: 0, targetBulbEmissive: 0, startDiskEmissive: 0, targetDiskEmissive: 0 },
        isDestroyed: false, isRoomLight: true, isOn: false
    };
    return lightGroup;
}

/**
 * Creates an outer wall segment with a window for a room.
 * @param {number} centerX - Center X of the wall segment.
 * @param {number} centerY - Center Y of the wall segment.
 * @param {number} centerZ - Center Z of the wall segment.
 * @param {number} segmentLength - Length of the wall segment (along Z for this orientation).
 * @param {number} wallHeight - Height of the wall.
 * @param {number} wallThickness - Thickness of the wall.
 * @param {THREE.Material} wallMat - Material for the wall parts.
 * @param {THREE.Material} initialWindowMat - Initial material for the window glass (e.g., opaque).
 * @param {THREE.Material} transparentWindowMat - Transparent material for the window glass.
 * @param {string} roomId - The ID of the room this wall belongs to.
 * @param {THREE.Scene} sceneRef - Reference to the main scene.
 * @param {Array<THREE.Mesh>} worldObjectsRef - Array to add structural wall parts to.
 * @param {Array<object>} allRoomsDataRef - Array to store room data, including window reference.
 */
function createOuterWallWithWindow(centerX, centerY, centerZ, segmentLength, wallHeight, wallThickness, wallMat, initialWindowMat, transparentWindowMat, roomId, sceneRef, worldObjectsRef, allRoomsDataRef) {
    const WINDOW_WIDTH_RATIO = 0.7;
    const WINDOW_HEIGHT_RATIO = 0.6;
    const WINDOW_SILL_RATIO = 0.2;

    const windowW = segmentLength * WINDOW_WIDTH_RATIO;
    const windowH = wallHeight * WINDOW_HEIGHT_RATIO;
    const sillH = wallHeight * WINDOW_SILL_RATIO;
    const headerH = wallHeight - windowH - sillH;
    const pillarW = (segmentLength - windowW) / 2;

    if (sillH > 0.01) {
        const sillGeo = new THREE.BoxGeometry(wallThickness, sillH, segmentLength);
        const sill = new THREE.Mesh(sillGeo, wallMat);
        sill.position.set(centerX, centerY - (wallHeight / 2) + (sillH / 2), centerZ);
        sill.castShadow = true; sill.receiveShadow = true;
        sceneRef.add(sill); worldObjectsRef.push(sill);
        sill.name = `OuterWallSill_${roomId}`;
    }

    if (headerH > 0.01) {
        const headerGeo = new THREE.BoxGeometry(wallThickness, headerH, segmentLength);
        const header = new THREE.Mesh(headerGeo, wallMat);
        header.position.set(centerX, centerY + (wallHeight / 2) - (headerH / 2), centerZ);
        header.castShadow = true; header.receiveShadow = true;
        sceneRef.add(header); worldObjectsRef.push(header);
        header.name = `OuterWallHeader_${roomId}`;
    }

    const windowSectionY = centerY - (wallHeight / 2) + sillH + (windowH / 2);

    if (pillarW > 0.01) {
        const pillarLGeo = new THREE.BoxGeometry(wallThickness, windowH, pillarW);
        const pillarL = new THREE.Mesh(pillarLGeo, wallMat);
        pillarL.position.set(centerX, windowSectionY, centerZ - (segmentLength / 2) + (pillarW / 2));
        pillarL.castShadow = true; pillarL.receiveShadow = true;
        sceneRef.add(pillarL); worldObjectsRef.push(pillarL);
        pillarL.name = `OuterWallPillarL_${roomId}`;

        const pillarRGeo = new THREE.BoxGeometry(wallThickness, windowH, pillarW);
        const pillarR = new THREE.Mesh(pillarRGeo, wallMat);
        pillarR.position.set(centerX, windowSectionY, centerZ + (segmentLength / 2) - (pillarW / 2));
        pillarR.castShadow = true; pillarR.receiveShadow = true;
        sceneRef.add(pillarR); worldObjectsRef.push(pillarR);
        pillarR.name = `OuterWallPillarR_${roomId}`;
    }

    if (windowW > 0.01 && windowH > 0.01) {
        const glassGeo = new THREE.BoxGeometry(wallThickness * 0.25, windowH, windowW);
        const glass = new THREE.Mesh(glassGeo, initialWindowMat);
        glass.position.set(centerX, windowSectionY, centerZ);
        glass.castShadow = false;
        glass.receiveShadow = true;
        glass.userData = { isWindow: true, roomId: roomId };
        sceneRef.add(glass);
        worldObjectsRef.push(glass); // Windows are collidable initially
        glass.name = `OuterWindowGlass_${roomId}`;

        const roomDataForWindow = allRoomsDataRef.find(r => r.id === roomId);
        if (roomDataForWindow) {
            roomDataForWindow.windowGlass = glass;
            roomDataForWindow.opaqueMaterial = initialWindowMat;
            roomDataForWindow.transparentMaterial = transparentWindowMat;
        } else {
            // This case should ideally not happen if allRoomsData is populated correctly before this
            console.warn(`RoomData not found for window in room ${roomId} during wall creation.`);
        }
    }
}


export function generateWorld(params) {
    const {
        scene,
        worldObjects,
        doors,
        lights,
        allRoomsData, // For LOD system
        escalatorSteps, // To store step meshes
        escalatorStarts, // To store start platform meshes
        escalatorEnds,   // To store end platform meshes
        escalatorStepsB,
        escalatorStartsB,
        escalatorEndsB,
        animatedGarageDoors, // For garage doors that need animation
        enemies, // Array to store enemy meshes
        font, // Loaded THREE.Font instance
        playerInitialElevator // To set camera position
    } = params;

    const floorDepth = SETTINGS.floorHeight - SETTINGS.wallHeight;
    const totalCorridorLength = SETTINGS.doorsPerSide * SETTINGS.corridorSegmentLength;

    // Materials (defined here for now, could be passed or managed by a material manager)
    const floorMaterial = new THREE.MeshStandardMaterial({ color: 0xaaaaaa, side: THREE.DoubleSide });
    const wallMaterial = new THREE.MeshStandardMaterial({ color: 0xbbbbbb });
    const ceilingMaterial = new THREE.MeshStandardMaterial({ color: 0xcccccc });
    const textMaterial = new THREE.MeshStandardMaterial({ color: 0xcc9911, metalness: 0.8, roughness: 0.5 });
    const blackDoorMaterial = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.3 });
    const redDoorMaterial = new THREE.MeshStandardMaterial({ color: 0x121111, roughness: 0.3, emissive: 0x010000, emissiveIntensity: 0.01 });
    const elevatorMaterial = new THREE.MeshStandardMaterial({ color: 0xaa1111, metalness: 0.8, roughness: 0.5 });
    const lightBulbMaterial = new THREE.MeshStandardMaterial({ color: 0xFFFFEE, emissive: 0xFFFFDD, emissiveIntensity: 1 }); // Global for standard lamps
    const deskMaterial = new THREE.MeshStandardMaterial({ color: 0x8B4513, roughness: 0.3 });
    const cabinetMaterial = new THREE.MeshStandardMaterial({ color: 0x888888, metalness: 0.8, roughness: 0.3 });
    const safeMaterial = new THREE.MeshStandardMaterial({ color: 0xee1111 });
    const dialMaterial = new THREE.MeshStandardMaterial({ color: 0x999999, metalness: 0.9, roughness: 0.2 });
    const lawnMaterial = new THREE.MeshStandardMaterial({ color: 0x558B2F, roughness: 0.8 });
    const perimeterWallMaterial = new THREE.MeshStandardMaterial({ color: 0x795548, roughness: 0.7 });
    const gateMaterial = new THREE.MeshStandardMaterial({ color: 0x424242, metalness: 0.6, roughness: 0.4 });
    const escalatorMaterial = new THREE.MeshStandardMaterial({ color: 0x222222, metalness: 0.8, roughness: 0.5 });
    const concreteMaterial = new THREE.MeshStandardMaterial({ color: 0x707070, roughness: 0.8, metalness: 0.1 });
    const pillarMaterial = new THREE.MeshStandardMaterial({ color: 0x606060, roughness: 0.7 });
    const basementWallMaterial = new THREE.MeshStandardMaterial({ color: 0x656565, roughness: 0.8 });
    const escalatorEmbarkMaterial = new THREE.MeshStandardMaterial({ color: 0x332222, metalness: 0.8, roughness: 0.5, emissive: 0x110000, emissiveIntensity: 0.1 });
    const garageDoorMaterial = new THREE.MeshStandardMaterial({ color: 0x909090, metalness: 0.6, roughness: 0.5 });

    const glassMaterial = new THREE.MeshPhysicalMaterial({
        color: 0xadc5d4, metalness: 0.1, roughness: 0.05, transmission: 0.95,
        transparent: true, side: THREE.DoubleSide, depthWrite: false,
        envMapIntensity: 0.5, premultipliedAlpha: true
    });
    const opaqueGlassMaterial = new THREE.MeshPhysicalMaterial({ // For unactivated rooms initially
        color: 0x50aaaa, metalness: 0.1, roughness: 0.05, transmission: 0.0, // Opaque
        transparent: true, side: THREE.DoubleSide, opacity: 0.8, // Slightly see-through but not clear
        depthWrite: true, // Write to depth buffer for opaque appearance
        envMapIntensity: 0.2
    });
    const enemyMaterial = new THREE.MeshStandardMaterial({ color: 0xcc0000, roughness: 0.6 });
    const enemyGeometry = new THREE.BoxGeometry(ENEMY_SETTINGS.width || 0.5, ENEMY_SETTINGS.height || 1.8, ENEMY_SETTINGS.depth || 0.5);

    // Make some materials accessible globally if needed by other modules (e.g., interaction.js for door color change)
    // This is a temporary solution; a material manager or passing materials explicitly is better.
    window.blackDoorMaterial = blackDoorMaterial;
    window.EscalatorMaterial = escalatorMaterial;
    window.EscalatorEmbarkMaterial = escalatorEmbarkMaterial;


    // --- Elevator Configurations ---
    // (Using createElevator from elevator.js)
    const elevatorConfigs = [
        { id: "mainElevator", x: SETTINGS.corridorWidth / 2, z: -SETTINGS.elevatorSize / 2 - 4, shaftWidth: SETTINGS.corridorWidth, shaftDepth: SETTINGS.elevatorSize, minFloorIndex: 0, maxFloorIndex: SETTINGS.numFloors, startFloorIndex: 0 },
        { id: "secondElevator", x: (SETTINGS.corridorWidth / 2) - 4, z: -SETTINGS.elevatorSize / 2 - 4, shaftWidth: SETTINGS.corridorWidth, shaftDepth: SETTINGS.elevatorSize, minFloorIndex: 0, maxFloorIndex: SETTINGS.numFloors - 1, startFloorIndex: 0 },
        { id: "thirdElevator", x: (SETTINGS.corridorWidth / 2) + 4, z: -SETTINGS.elevatorSize / 2 - 4, shaftWidth: SETTINGS.corridorWidth, shaftDepth: SETTINGS.elevatorSize, minFloorIndex: -SETTINGS.numBasementFloors, maxFloorIndex: 0, startFloorIndex: 0 },
        { id: "fourthElevator", x: SETTINGS.corridorWidth / 2, z: -SETTINGS.elevatorSize / 2 - 4 - 4, shaftWidth: SETTINGS.corridorWidth, shaftDepth: SETTINGS.elevatorSize, minFloorIndex: 0, maxFloorIndex: SETTINGS.numFloors - 1, startFloorIndex: 0 },
        { id: "fifthElevator", x: (SETTINGS.corridorWidth / 2) - 4, z: -SETTINGS.elevatorSize / 2 - 4 - 4, shaftWidth: SETTINGS.corridorWidth, shaftDepth: SETTINGS.elevatorSize, minFloorIndex: 0, maxFloorIndex: 2, startFloorIndex: 0 },
        { id: "sixthElevator", x: (SETTINGS.corridorWidth / 2) + 4, z: -SETTINGS.elevatorSize / 2 - 4 - 4, shaftWidth: SETTINGS.corridorWidth, shaftDepth: SETTINGS.elevatorSize, minFloorIndex: 0, maxFloorIndex: 2, startFloorIndex: 0 },
    ];

    let firstElevator = null;
    elevatorConfigs.forEach(config => {
        const elev = createElevator({
            ...config,
            platformMaterial: elevatorMaterial,
            shaftMaterial: concreteMaterial,
            scene: scene,
            worldObjectsArr: worldObjects
        });
        if (config.id === playerInitialElevator) { // Check against the ID passed for player start
            firstElevator = elev;
        }
        if (!firstElevator && config.id === "mainElevator") { // Fallback to mainElevator if specific not found
            firstElevator = elev;
        }
    });
    // If playerInitialElevator was not found and mainElevator also wasn't (edge case), pick the very first one.
    if (!firstElevator && elevators.length > 0) {
        firstElevator = elevators[0]; // `elevators` array is populated by createElevator in elevator.js
    }


    // --- Define Overall Elevator Shaft Dimensions for a 3x2 elevator bank ---
    // Assuming elevators are arranged in a grid.
    // For X: mainElevator at center, second at -4, third at +4.
    // For Z: first row at -elevSize/2 - 4, second row at -elevSize/2 - 4 - 4.
    const single_shaft_width = SETTINGS.corridorWidth; // Assuming all have same width for overall calc
    const single_shaft_depth = SETTINGS.elevatorSize; // Assuming all have same depth

    // Overall X dimensions for the 3-elevator wide bank
    const overallShaftMinX = (SETTINGS.corridorWidth / 2 - 4) - (single_shaft_width / 2);
    const overallShaftMaxX = (SETTINGS.corridorWidth / 2 + 4) + (single_shaft_width / 2);
    const overallShaftActualWidth = overallShaftMaxX - overallShaftMinX;
    const overallShaftActualCenterX = (overallShaftMinX + overallShaftMaxX) / 2;

    // Overall Z dimensions for the 2-elevator deep bank
    const overallShaftMinZ_bank = (-SETTINGS.elevatorSize / 2 - 4 - 4) - (single_shaft_depth / 2); // Backmost elevator's front
    const overallShaftMaxZ_bank = (-SETTINGS.elevatorSize / 2 - 4) + (single_shaft_depth / 2); // Frontmost elevator's back
    const overallShaftActualDepth_bank = overallShaftMaxZ_bank - overallShaftMinZ_bank;
    const overallShaftActualCenterZ_bank = (overallShaftMinZ_bank + overallShaftMaxZ_bank) / 2;

    const buildingWidth = Math.max(SETTINGS.corridorWidth + (2 * SETTINGS.roomSize), overallShaftActualWidth);

    // --- Lawn, Perimeter Wall, and Gate ---
    // (Code for lawn, perimeter wall, gate generation - uses overallShaft dimensions)
    // ... (This extensive section from original mainTMPd.js would go here)
    // For brevity in this example, I'll skip pasting the full geometry generation code for lawn/perimeter.
    // Ensure all `scene.add` and `worldObjects.push` calls are correct.

    // --- Roof Planes ---
    // (Code for main roof, B-wing roof, escalator roofs, penthouse walls, floodlights, rooftop perimeter walls)
    // ... (This extensive section from original mainTMPd.js would go here)

    // --- Basement and Office Floor Loop ---
    const wallDepth = 0.1; // Defined locally as it's specific to wall construction
    for (let i = -SETTINGS.numBasementFloors; i < SETTINGS.numFloors; i++) {
        const floorY = i * SETTINGS.floorHeight;
        const redDoorIndex = Math.floor(Math.random() * SETTINGS.doorsPerSide * 4); // For A and B wings, left and right
        let currentDoorIndex = 0; // Tracks door index for redness

        if (i < 0) { // --- Basement Floor Generation ---
            // (Code for basement floor panels, ceiling panels, perimeter walls, garage door, pillars, lighting)
            // ... (This extensive section from original mainTMPd.js would go here)
            // Ensure createEnemy is called correctly if enemies are in the basement.
        } else { // --- Office Floor Generation (i >= 0) ---
            // (Code for office floor corridor, connector floors, room partitions)
            // ...

            // Initialize room data entries for LOD before creating walls/windows that might reference them
            for (let j = 0; j < SETTINGS.doorsPerSide; j++) {
                // A-Wing Rooms
                allRoomsData.push({ id: `R_F${i}_D${j}`, door: null, windowGlass: null, opaqueMaterial: opaqueGlassMaterial, transparentMaterial: glassMaterial, contentsGroup: new THREE.Group(), visibleByDoor: false, visibleByWindow: false, lamp: null });
                allRoomsData.push({ id: `L_F${i}_D${j}`, door: null, windowGlass: null, opaqueMaterial: opaqueGlassMaterial, transparentMaterial: glassMaterial, contentsGroup: new THREE.Group(), visibleByDoor: false, visibleByWindow: false, lamp: null });
                // B-Wing Rooms
                allRoomsData.push({ id: `B_R_F${i}_D${j}`, door: null, windowGlass: null, opaqueMaterial: opaqueGlassMaterial, transparentMaterial: glassMaterial, contentsGroup: new THREE.Group(), visibleByDoor: false, visibleByWindow: false, lamp: null });
                allRoomsData.push({ id: `B_L_F${i}_D${j}`, door: null, windowGlass: null, opaqueMaterial: opaqueGlassMaterial, transparentMaterial: glassMaterial, contentsGroup: new THREE.Group(), visibleByDoor: false, visibleByWindow: false, lamp: null });
            }


            // Loop for individual rooms
            for (let j = 0; j < SETTINGS.doorsPerSide; j++) {
                const segmentCenterZ = (j + 0.5) * SETTINGS.corridorSegmentLength;
                const segmentStartZ = j * SETTINGS.corridorSegmentLength;
                const deskWidth = 1.5, deskHeight = 0.75, deskDepth = 0.8;
                const cabinetWidth = 0.5, cabinetHeight = 1.5, cabinetDepth = 0.6;
                const safeWidth = 0.8, safeHeight = 0.8, safeDepth = 0.8;
                const dialRadius = 0.08, dialLength = 0.1;
                const roomCeilingThickness = 0.2;
                const defaultSafeUserData = () => ({ isCracked: false, dialPresses: 0, dialPressesRequired: Math.floor(Math.random() * 9) + 2, pointsAwarded: false });

                // --- Right Side Room (A-Wing) ---
                const roomRXCenter = -SETTINGS.roomSize / 2;
                const rightRoomId = `R_F${i}_D${j}`;
                const rightRoomData = allRoomsData.find(r => r.id === rightRoomId);
                const rightRoomContents = rightRoomData.contentsGroup;
                rightRoomContents.name = `RoomContents_${rightRoomId}`;

                // (Add floor, ceiling, desk, cabinet, chair to rightRoomContents)
                // ...
                if ((currentDoorIndex + j) === redDoorIndex) { // Example condition for red door / safe
                    // (Add safe to rightRoomContents)
                }
                const roomLampR = createRoomLamp(roomRXCenter, floorY + SETTINGS.wallHeight - 0.5, segmentCenterZ, i, rightRoomId, lightBulbMaterial, lights, scene);
                rightRoomContents.add(roomLampR);
                rightRoomData.lamp = roomLampR;
                createOuterWallWithWindow(-SETTINGS.roomSize + wallDepth / 2, floorY + SETTINGS.wallHeight / 2, segmentCenterZ, SETTINGS.corridorSegmentLength, SETTINGS.wallHeight, wallDepth, wallMaterial, opaqueGlassMaterial, glassMaterial, rightRoomId, scene, worldObjects, allRoomsData);
                rightRoomContents.visible = false;
                scene.add(rightRoomContents);

                // --- Left Side Room (A-Wing) ---
                // (Similar logic for left room, using L_F${i}_D${j})
                // ...

                // --- Right Side Room (B-Wing) ---
                const segmentBCenterZ = ((j + 0.5) * SETTINGS.corridorSegmentLength) - 16 - totalCorridorLength;
                const rightRoomBId = `B_R_F${i}_D${j}`;
                // (Similar logic for B-wing right room)
                // ...

                // --- Left Side Room (B-Wing) ---
                // (Similar logic for B-wing left room)
                // ...
            }

            // (Corridor Ceiling, Walls & Doors for A and B wings)
            // ...
            // Ensure door.userData.roomId is set and roomData.door is linked.
            // Example for one door:
            // const door = new THREE.Mesh(doorGeo, doorMaterialToUse);
            // door.userData.roomId = `R_F${i}_D${j}`; // Example
            // const roomDataForDoor = allRoomsData.find(r => r.id === door.userData.roomId);
            // if (roomDataForDoor) roomDataForDoor.door = door;

            // (Corridor Ceiling Lights, Escalator Bridge Ceiling Lights for A and B wings)
            // ...

            // (Far end walls with text for A and B wings)
            // ...

            // (Walls around Escalator Area for A and B wings)
            // ...
        } // End of Office Floor Generation

        // --- Common elements for ALL floors (basement and above-ground) ---
        // (Escalator Area Floor Slabs & Lights, Escalator Steps, Balustrades for A and B wings)
        // ... (This extensive section from original mainTMPd.js would go here)
        // Make sure to populate escalatorSteps, escalatorStarts, escalatorEnds for both A and B wings.

        // (Shaft Walls, Floor Caps around elevator shaft area)
        // ...

        // Place enemies on office floors
        if (i >= 0) {
            for (let j = 0; j < SETTINGS.doorsPerSide; j++) {
                const segmentCenterZ_A = (j + 0.5) * SETTINGS.corridorSegmentLength;
                const segmentCenterZ_B = ((j + 0.5) * SETTINGS.corridorSegmentLength) - 16 - totalCorridorLength;
                // Call the imported createEnemy with a config object
                createEnemy({
                    x: SETTINGS.corridorWidth / 2,
                    y: floorY,
                    z: segmentCenterZ_A,
                    floorIndex: i,
                    scene: scene,
                    enemiesArray: enemies,
                    worldObjectsArray: worldObjects,
                    enemyMaterial: enemyMaterial,
                    enemyGeometry: enemyGeometry
                });
                createEnemy({
                    x: SETTINGS.corridorWidth / 2,
                    y: floorY,
                    z: segmentCenterZ_B,
                    floorIndex: i,
                    scene: scene,
                    enemiesArray: enemies,
                    worldObjectsArray: worldObjects,
                    enemyMaterial: enemyMaterial,
                    enemyGeometry: enemyGeometry
                });
            }
        }
    } // End of floor loop

    // Return the first elevator created (or the one designated for player start)
    // This can be used by main.js to set the initial camera position.
    return { playerStartElevator: firstElevator };
}
