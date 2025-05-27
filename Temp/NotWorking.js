import * as THREE from 'three';
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';
//import { rotate } from 'three/tsl';

// IMPORTANT: Left is +X and Right is -X in this world
// Up is +Y and Down is -Y in this world
// +Z is forward and -Z is backward in this world

// --- Game Settings ---
const SETTINGS = {
    numFloors: 3, // Number of floors
    doorsPerSide: 3,
    corridorSegmentLength: 5, // Length of corridor section for one door pair
    corridorWidth: 4,
    wallHeight: 3.5,
    numBasementFloors: 1, // Number of basement floors (e.g., 1 means one level below ground at index -1)
    floorHeight: 4, // Vertical distance between floors
    doorWidth: 1,
    doorHeight: 2.1,
    doorDepth: 0.15,
    elevatorSpeed: 4.0, // Units per second
    elevatorSize: 4.0,
    playerSpeed: 5.0,
    sprintMultiplier: 1.8,
    jumpVelocity: 7.0,
    gravity: -18.0,
    lookSensitivity: 0.002, // PointerLockControls sensitivity is different
    escalatorLength: 4.0, // Add this line to define escalatorLength
    escalatorWidth: 3.0,
    escalatorSpeed: 1.0,
    roomSize: 5.0,
};

// --- Core Variables ---
let scene, camera, renderer, controls;
let clock;
let playerVelocity = new THREE.Vector3();
let playerOnGround = false;
let moveForward = false, moveBackward = false, moveLeft = false, moveRight = false, isSprinting = false;
let playerHeight = 1.7; // Camera height offset
let isCrouching = false; // New crouch state
let playerState = 'upright'; // Possible states: 'upright', 'crouching', 'prone'

// let elevator, elevatorTargetY = 0, isElevatorMoving = false, elevatorDirection = 0; // Old single elevator state
// let currentFloorIndex = 0; // Old single elevator state
const elevators = []; // Array to store all elevator objects
let activeElevator = null; // The elevator currently being controlled or closest to the player

const escalatorLength = SETTINGS.escalatorLength; // Use the defined escalator length
const escalatorWidth = SETTINGS.escalatorWidth;
const roomSize = SETTINGS.roomSize; // Use the defined room size
const elevatorSize = SETTINGS.elevatorSize; // Use the defined elevator size
// let buildingWidth = SETTINGS.corridorWidth + (2 * roomSize); // Total width of the building - will be recalculated

const worldObjects = []; // For basic collision detection
const doors = []; // To store door data for interaction
let lights = []; // Move lights array to global scope

let playerLives = 3; // Player starts with 3 lives
let playerScore = 0; // Initial score
let isGameOver = false; // Game over state
let isPlayerRespawning = false; // Tracks if the player is waiting to respawn

const animatedGarageDoors = []; // To store garage doors that need animation
const enemies = []; // Array to store enemy objects
let currentElevatorConfig = null; // To help generateWorld access the current elevator's properties

const floorDepth = SETTINGS.floorHeight - SETTINGS.wallHeight; // Add this near your SETTINGS or at the top of generateWorld

// Add these for escalator step tracking
const escalatorSteps = {
    up: {},   // { floorIndex: [stepUpMesh, ...] }
    down: {}  // { floorIndex: [stepDownMesh, ...] }
};
const escalatorStarts = {
    up: {},   // { floorIndex: startEscUpMesh }
    down: {}  // { floorIndex: startEscDownMesh }
};
const escalatorEnds = { 
    up: {},   // For up steps if needed in future
    down: {}  // For down-step ending points
};
let playerOnEscalator = { type: null, floor: null }; // Track which escalator area player is on

// --- LOD System ---
const allRoomsData = []; // Stores data for each room for LOD management
/* Each entry: {
    id: string, // e.g., R_F0_D0
    door: THREE.Mesh | null,
    windowGlass: THREE.Mesh | null,
    opaqueMaterial: THREE.Material | null, // Added to store the opaque window material
    transparentMaterial: THREE.Material | null, // Already implicitly stored, making it explicit
    contentsGroup: THREE.Group, visibleByDoor: boolean, visibleByWindow: boolean, lamp: THREE.Group }
*/
// --- Reusable Lamp Geometries & Materials (defined once) ---
const lampConeGeo = new THREE.ConeGeometry(0.3, 0.2, 16);
const lampChainGeo = new THREE.BoxGeometry(0.05, 0.5, 0.05);
const lampBulbGeo = new THREE.SphereGeometry(0.08, 16, 8); // bulbRadius = 0.08
const lampBottomDiskGeo = new THREE.CircleGeometry(0.3, 16);

// Materials for standard corridor/area lamps (non-animated parts)
const lampChainMaterial = new THREE.MeshStandardMaterial({ color: 0x111111 });
const lampLampshadeMaterial = new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0x000000, emissiveIntensity: 0.0 });
// This material is for the glowing disk of corridor/area lamps, which is statically emissive.
const lampCorridorDiskMaterial = new THREE.MeshStandardMaterial({ color: 0xffaa77, emissive: 0xffaa77, emissiveIntensity: 1 });
// lightBulbMaterial (for the bulb itself) will be passed in, as it's already globally defined in generateWorld.


// --- Initialization ---
function init() {
    clock = new THREE.Clock();
    scene = new THREE.Scene();

    // Set background to a dark blue for a moonlit night
    scene.background = new THREE.Color(0x010309); // Dark blue
    scene.fog = new THREE.Fog(0x010309, 10, 100); // Fog to match the night theme

    // Camera
    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.set(SETTINGS.corridorWidth / 2, playerHeight, 0); // Start at the beginning of the new connector floor

    // Renderer
    renderer = new THREE.WebGLRenderer({ canvas: document.getElementById('gameCanvas'), antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.shadowMap.enabled = true;

    // Lighting
    const ambientLight = new THREE.AmbientLight(0x015599, 0.1); // Dim bluish ambient light
    scene.add(ambientLight);

    const moonlight = new THREE.DirectionalLight(0x015599, 0.3); // Soft bluish moonlight
    moonlight.position.set(-10, 20, -10); // Position the moonlight
    moonlight.castShadow = true;
    scene.add(moonlight);

    // Pointer Lock Controls
    controls = new PointerLockControls(camera, document.body);
    scene.add(controls.getObject()); // Add the camera holder to the scene

    const instructions = document.getElementById('instructions');
    instructions.innerHTML = `
        <p>Move: W/A/S/D</p>
        <p>Jump: Space</p>
        <p>Sprint: Shift</p>
        <p>Crouch: Ctrl</p>
        <p>Prone: Ctrl, Ctrl</p>
        <p>Interact: E</p>
        <p>Shoot: Left Mouse Button</p>
    `; // Updated instructions to include crouch toggle

    controls.addEventListener('lock', () => instructions.style.display = 'none');
    controls.addEventListener('unlock', () => instructions.style.display = 'block');
    document.body.addEventListener('click', () => controls.lock());

    // --- Procedural Generation ---
    generateWorld();

    // --- Event Listeners ---
    document.addEventListener('mousedown', shoot); 
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('keyup', onKeyUp);
    window.addEventListener('resize', onWindowResize);

    // Make the player jump slightly at the start
    playerVelocity.y = 2.0;

    // Start the animation loop
    animate();
}

// --- Elevator Creation ---
function createElevator(config) {
    const elevatorObj = {
        id: config.id,
        platform: null,
        roof: null, // elevator's own internal roof
        chain: null,
        shaftCeiling: null, // Topmost ceiling of the elevator shaft
        shaftPit: null,     // Bottommost base of the elevator shaft
        poles: [],
        minFloorIndex: config.minFloorIndex,
        maxFloorIndex: config.maxFloorIndex,
        // Platform center Y is -0.1 from the actual floor level for visual alignment
        currentY: (config.startFloorIndex * SETTINGS.floorHeight) - 0.1,
        targetY: (config.startFloorIndex * SETTINGS.floorHeight) - 0.1,
        isMoving: false,
        direction: 0,
        currentFloorIndexVal: config.startFloorIndex,
        config: config // Store original config for reference
    };

    // 1. Elevator Platform
    const platformGeo = new THREE.BoxGeometry(config.shaftWidth - 0.2, 0.2, config.shaftDepth - 0.2);
    elevatorObj.platform = new THREE.Mesh(platformGeo, config.platformMaterial);
    elevatorObj.platform.name = `ElevatorPlatform_${config.id}`;
    elevatorObj.platform.position.set(config.x, elevatorObj.currentY, config.z);
    elevatorObj.platform.castShadow = true;
    elevatorObj.platform.receiveShadow = true;
    config.scene.add(elevatorObj.platform);
    config.worldObjectsRef.push(elevatorObj.platform);
    elevatorObj.platform.userData.elevatorId = config.id;

    // 2. Elevator's Own Internal Roof
    const elevatorInternalRoofThickness = 0.2;
    const internalRoofGeo = new THREE.BoxGeometry(config.shaftWidth - 0.2, elevatorInternalRoofThickness, config.shaftDepth - 0.2);
    elevatorObj.roof = new THREE.Mesh(internalRoofGeo, config.platformMaterial);
    elevatorObj.roof.name = `ElevatorInternalRoof_${config.id}`;
    elevatorObj.roof.position.set(config.x, elevatorObj.currentY + SETTINGS.wallHeight, config.z); // Positioned relative to platform
    elevatorObj.roof.castShadow = true;
    elevatorObj.roof.receiveShadow = true;
    config.scene.add(elevatorObj.roof);
    config.worldObjectsRef.push(elevatorObj.roof);
    elevatorObj.roof.geometry.computeBoundingBox();
    elevatorObj.roof.userData.elevatorId = config.id;

    // Add a light inside the elevator, attached to its internal roof
    const elevatorLight = new THREE.PointLight(0xffffff, 0.8, 4); // color, intensity, distance
    // Position slightly below the center of the internal roof
    elevatorLight.position.set(0, -elevatorInternalRoofThickness / 2 - 0.1, 0);
    elevatorObj.roof.add(elevatorLight);

    // 3. Vertical Poles inside elevator (children of the platform)
    const poleDimension = 0.1;
    const poleHeight = SETTINGS.wallHeight; // From platform to internal roof bottom
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
        const pole = new THREE.Mesh(poleGeo, config.platformMaterial);
        pole.name = `ElevatorPole_${config.id}_${index}`;
        // Y position is relative to platform's center. Platform top is 0.1 above its center.
        pole.position.set(pos.x, 0.1 + poleHeight / 2, pos.z);
        pole.castShadow = true; pole.receiveShadow = true;
        pole.userData.elevatorId = config.id; // Tag pole
        elevatorObj.platform.add(pole);
        elevatorObj.poles.push(pole);
    });

    // 4. Elevator Shaft Ceiling (Topmost structure of the shaft)
    const shaftCeilingY = (config.maxFloorIndex + 1) * SETTINGS.floorHeight; // One floor height above max floor served
    const shaftCeilingGeo = new THREE.BoxGeometry(config.shaftWidth, floorDepth, config.shaftDepth);
    elevatorObj.shaftCeiling = new THREE.Mesh(shaftCeilingGeo, config.shaftMaterial); // e.g., concrete or floorMaterial
    elevatorObj.shaftCeiling.name = `ElevatorShaftCeiling_${config.id}`;
    elevatorObj.shaftCeiling.position.set(config.x, shaftCeilingY - floorDepth / 2, config.z);
    elevatorObj.shaftCeiling.castShadow = true; elevatorObj.shaftCeiling.receiveShadow = true;
    config.scene.add(elevatorObj.shaftCeiling);
    config.worldObjectsRef.push(elevatorObj.shaftCeiling);
    elevatorObj.shaftCeiling.geometry.computeBoundingBox();

    // 5. Elevator Shaft Pit Base (Bottommost structure of the shaft)
    const pitThickness = SETTINGS.floorHeight; // Substantial base
    const pitTopSurfaceY = (config.minFloorIndex * SETTINGS.floorHeight) - floorDepth; // Top of floor slab of lowest served floor
    const pitCenterY = pitTopSurfaceY - pitThickness / 2;
    const pitGeo = new THREE.BoxGeometry(config.shaftWidth, pitThickness, config.shaftDepth);
    elevatorObj.shaftPit = new THREE.Mesh(pitGeo, config.shaftMaterial); // e.g., concreteMaterial
    elevatorObj.shaftPit.name = `ElevatorShaftPit_${config.id}`;
    elevatorObj.shaftPit.position.set(config.x, pitCenterY, config.z);
    elevatorObj.shaftPit.receiveShadow = true;
    config.scene.add(elevatorObj.shaftPit);
    config.worldObjectsRef.push(elevatorObj.shaftPit);
    elevatorObj.shaftPit.geometry.computeBoundingBox();

    // 6. Dynamic Chain (child of the platform)
    // Connects elevator's internal roof to the shaftCeiling
    const chain = createDynamicChainMesh(elevatorObj, config.platformMaterial);
    elevatorObj.chain = chain;
    chain.userData.elevatorId = config.id; // Tag chain
    elevatorObj.platform.add(chain);

    // 7. Bottom Piston Shaft (child of the platform)
    const piston = createElevatorPistonMesh(elevatorObj, config.platformMaterial);
    piston.userData.elevatorId = config.id; // Tag piston
    elevatorObj.platform.add(piston);
    config.worldObjectsRef.push(piston); // Add to worldObjects for collision

    elevators.push(elevatorObj);
    if (!activeElevator) { // Set the first created elevator as active
        activeElevator = elevatorObj;
    }
    return elevatorObj;
}

// --- Standard Lamp Creation Function ---
function createStandardLamp(x, y, z, floorIndex, lampIdSuffix, sceneRef, lightsArrayRef, globalLightBulbMaterialRef) {
    const chainMesh = new THREE.Mesh(lampChainGeo, lampChainMaterial);
    chainMesh.position.y = 0.15;

    // Standard lamps use the global lightBulbMaterial directly as their bulbs are not individually animated for on/off state
    const bulbMesh = new THREE.Mesh(lampBulbGeo, globalLightBulbMaterialRef);
    bulbMesh.position.y = -0.3 + 0.08 * 2; // -0.3 + bulbRadius * 2

    const lampshadeMesh = new THREE.Mesh(lampConeGeo, lampLampshadeMaterial);

    // Standard lamps use a shared material for their bottom disk
    const bottomLightDisk = new THREE.Mesh(lampBottomDiskGeo, lampCorridorDiskMaterial);
    bottomLightDisk.rotation.x = Math.PI / 2;
    bottomLightDisk.position.y = -0.11;

    const lightGroup = new THREE.Group();
    lightGroup.add(lampshadeMesh);
    lightGroup.add(bottomLightDisk);
    lightGroup.add(bulbMesh);
    lightGroup.add(chainMesh);

    const lampName = `Lamp_${lampIdSuffix}`; // To match original naming like "Lamp 101"
    lightGroup.name = lampName;
    lampshadeMesh.name = `${lampName}_Lampshade`;
    // bulbMesh.name = `${lampName}_Bulb`; // Optional, if needed for direct access
    // bottomLightDisk.name = `${lampName}_Disk`; // Optional

    lightGroup.position.set(x, y, z);
    lightGroup.castShadow = true; // Lampshade can cast shadow

    sceneRef.add(lightGroup);
    lightsArrayRef.push(lightGroup);

    const pointLight = new THREE.PointLight(0xffffaa, 1, 5); // Standard intensity and color
    pointLight.position.set(x, y - 0.3, z); // Position point light source
    sceneRef.add(pointLight);

    lightGroup.userData = { pointLight, floorIndex, isDestroyed: false };
    // Note: isRoomLight defaults to false or undefined, differentiating from specialized room lights.
    return lightGroup;
}

// --- World Generation ---
function generateWorld() {
    const totalCorridorLength = SETTINGS.doorsPerSide * SETTINGS.corridorSegmentLength;

    const floorMaterial = new THREE.MeshStandardMaterial({ color: 0xaaaaaa,  side: THREE.DoubleSide });
    const wallMaterial = new THREE.MeshStandardMaterial({ color: 0xbbbbbb }); // Slightly different for testing
    const ceilingMaterial = new THREE.MeshStandardMaterial({ color: 0xcccccc });
    // Make blackDoorMaterial accessible globally or pass it around if needed for interact()
    const blackDoorMaterial = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.3 });
    const redDoorMaterial = new THREE.MeshStandardMaterial({ color: 0xee0000, roughness: 0.3, emissive: 0x110000, emissiveIntensity: 0.3 }); // Added emissive property
    const elevatorMaterial = new THREE.MeshStandardMaterial({ color: 0xaa1111,   metalness: 0.8, roughness: 0.5  });
    const lightBulbMaterial = new THREE.MeshStandardMaterial({ color: 0xFFFFEE, emissive: 0xFFFFDD, emissiveIntensity: 1 }); // Glowing bulb
    // --- Furniture Materials ---
    const deskMaterial = new THREE.MeshStandardMaterial({ color: 0x8B4513, roughness: 0.3 }); // Brown for wood
    const cabinetMaterial = new THREE.MeshStandardMaterial({ color: 0x888888, metalness: 0.8, roughness: 0.3  }); // DarkGray for metal
    const safeMaterial = new THREE.MeshStandardMaterial({ color: 0xee1111,}); // Red, metallic safe
    const dialMaterial = new THREE.MeshStandardMaterial({ color: 0x999999, metalness: 0.9, roughness: 0.2 }); // Dark metallic dial // Dark metallic dial
    const lawnMaterial = new THREE.MeshStandardMaterial({ color: 0x558B2F, roughness: 0.8 }); // A nice lawn green
    const perimeterWallMaterial = new THREE.MeshStandardMaterial({ color: 0x795548, roughness: 0.7 }); // Brick/stone color
    const gateMaterial = new THREE.MeshStandardMaterial({ color: 0x424242, metalness: 0.6, roughness: 0.4 }); // Dark metal for gate
    
    const EscalatorMaterial = new THREE.MeshStandardMaterial({ color: 0x222222,  metalness: 0.8, roughness: 0.5  });
    // --- Basement Materials ---
    const concreteMaterial = new THREE.MeshStandardMaterial({ color: 0x707070, roughness: 0.8, metalness: 0.1 });
    const pillarMaterial = new THREE.MeshStandardMaterial({ color: 0x606060, roughness: 0.7 });
    const basementWallMaterial = new THREE.MeshStandardMaterial({ color: 0x656565, roughness: 0.8 });
    const EscalatorEmbarkMaterial = new THREE.MeshStandardMaterial({ color: 0x332222,  metalness: 0.8, roughness: 0.5, emissive: 0x110000, emissiveIntensity: 0.1 }); // Added emissive property
    const garageDoorMaterial = new THREE.MeshStandardMaterial({ color: 0x909090, metalness: 0.6, roughness: 0.5 });

    // Store references globally for use in updatePlayer
    window.EscalatorMaterial = EscalatorMaterial;
    window.EscalatorEmbarkMaterial = EscalatorEmbarkMaterial;
    // Store blackDoorMaterial globally for use in interact()
    const glassMaterial = new THREE.MeshPhysicalMaterial({
        color: 0xadc5d4, // A light blueish grey
        metalness: 0.1,
        roughness: 0.05,
        transmission: 0.95, // High transmission for clear glass
        transparent: true,
        side: THREE.DoubleSide,
        depthWrite: false, // Important for transparency with transmission
        envMapIntensity: 0.5, 
        premultipliedAlpha: true
    });
    window.blackDoorMaterial = blackDoorMaterial;

    // New opaque window material for unactivated rooms
    const opaqueGlassMaterial = new THREE.MeshPhysicalMaterial({
        color: 0x50aaaa, // A light blueish grey
        metalness: 0.1,
        roughness: 0.05,
        transmission: 0.95, // High transmission for clear glass
        transparent: true,
        side: THREE.DoubleSide,
        depthWrite: false, // Important for transparency with transmission
        envMapIntensity: 0.5, 
        premultipliedAlpha: true
    });

    // Walls & Doors
    const wallDepth = 0.1;
    const doorOffset = (SETTINGS.corridorSegmentLength - SETTINGS.doorWidth) / 2;
    const escalatorLength = SETTINGS.escalatorLength; // Use the defined escalator length

    // --- Elevator Configuration (for the single elevator in this setup) ---
    currentElevatorConfig = {
        id: "mainElevator",
        x: SETTINGS.corridorWidth / 2, // Center X of the shaft
        z: -SETTINGS.elevatorSize / 2 - 4, // Center Z of the shaft
        shaftWidth: SETTINGS.corridorWidth,     // Width of the shaft opening
        shaftDepth: SETTINGS.elevatorSize,      // Depth of the shaft
        minFloorIndex: 0, // -SETTINGS.numBasementFloors,
        maxFloorIndex: SETTINGS.numFloors, // Roof access is effectively maxFloorIndex + 1
        startFloorIndex: 0, // Initial floor
        platformMaterial: elevatorMaterial,
        shaftMaterial: concreteMaterial, // Material for shaft ceiling and pit
        scene: scene,
        worldObjectsRef: worldObjects
    };
    createElevator(currentElevatorConfig); // Create the first elevator instance

    

    // --- Create a second elevator ---
    const secondElevatorConfig = {
        id: "secondElevator",
        x: currentElevatorConfig.x - 4, // Shifted 4 units in negative X
        z: currentElevatorConfig.z,     // Same Z
        shaftWidth: currentElevatorConfig.shaftWidth, // Same dimensions for now
        shaftDepth: currentElevatorConfig.shaftDepth,
        minFloorIndex: 0, // -SETTINGS.numBasementFloors, //currentElevatorConfig.minFloorIndex,
        maxFloorIndex: SETTINGS.numFloors-1, // //currentElevatorConfig.maxFloorIndex,
        startFloorIndex: 0, // Start at ground floor
        platformMaterial: elevatorMaterial, // new THREE.MeshStandardMaterial({ color: 0x11aa11, metalness: 0.8, roughness: 0.5  }), // Different color
        shaftMaterial: concreteMaterial,
        scene: scene,
        worldObjectsRef: worldObjects
    };
    createElevator(secondElevatorConfig); // Create the second elevator instance

    // --- Create a third elevator ---
    const thirdElevatorConfig = {
        id: "thirdElevator",
        x: currentElevatorConfig.x + 4, // Shifted 4 units in positive X from the first
        z: currentElevatorConfig.z,     // Same Z
        shaftWidth: currentElevatorConfig.shaftWidth, // Same dimensions for now
        shaftDepth: currentElevatorConfig.shaftDepth,
        minFloorIndex:  -SETTINGS.numBasementFloors, //currentElevatorConfig.minFloorIndex,
        maxFloorIndex: 0, // SETTINGS.numFloors-1, // //currentElevatorConfig.maxFloorIndex,
        startFloorIndex: 0, // Start at ground floor
        platformMaterial: elevatorMaterial, //  new THREE.MeshStandardMaterial({ color: 0x1111aa, metalness: 0.8, roughness: 0.5  }), // Blue color
        shaftMaterial: concreteMaterial,
        scene: scene,
        worldObjectsRef: worldObjects
    };
    createElevator(thirdElevatorConfig); // Create the third elevator instance

    // --- Create a fourth elevator ---
    const fourthElevatorConfig = {
        id: "fouthElevator",
        x: currentElevatorConfig.x , // Center X of the shaft
        z: currentElevatorConfig.z -4,     // Shifted 4 units in positive X from the first
        shaftWidth: currentElevatorConfig.shaftWidth, // Same dimensions for now
        shaftDepth: currentElevatorConfig.shaftDepth,
        minFloorIndex:  0, // -SETTINGS.numBasementFloors, //currentElevatorConfig.minFloorIndex,
        maxFloorIndex:  SETTINGS.numFloors-1, // //currentElevatorConfig.maxFloorIndex,
        startFloorIndex: 0, // Start at ground floor
        platformMaterial:  elevatorMaterial, // new THREE.MeshStandardMaterial({ color: 0x1111aa, metalness: 0.8, roughness: 0.5  }), // Blue color
        shaftMaterial: concreteMaterial,
        scene: scene,
        worldObjectsRef: worldObjects
    };
    createElevator(fourthElevatorConfig); // Create the fourth elevator instance

    // --- Create a fifth elevator ---
    const fifthElevatorConfig = {
        id: "fifthElevator",
        x: currentElevatorConfig.x - 4, // Shifted 4 units in negative X
        z: currentElevatorConfig.z -4,     // Shifted 4 units in positive X from the first
        shaftWidth: currentElevatorConfig.shaftWidth, // Same dimensions for now
        shaftDepth: currentElevatorConfig.shaftDepth,
        minFloorIndex:  0, // -SETTINGS.numBasementFloors, //currentElevatorConfig.minFloorIndex,
        maxFloorIndex: 2, //  SETTINGS.numFloors-1, // //currentElevatorConfig.maxFloorIndex,
        startFloorIndex: 0, // Start at ground floor
        platformMaterial: elevatorMaterial, //  new THREE.MeshStandardMaterial({ color: 0x1111aa, metalness: 0.8, roughness: 0.5  }), // Blue color
        shaftMaterial: concreteMaterial,
        scene: scene,
        worldObjectsRef: worldObjects
    };
    createElevator(fifthElevatorConfig); // Create the fourth elevator instance


    // --- Create a sixth elevator ---
    const sixthElevatorConfig = {
        id: "sixthElevator",
        x: currentElevatorConfig.x + 4, // Shifted 4 units in positive X from the first
        z: currentElevatorConfig.z -4,     // Shifted 4 units in positive X from the first
        shaftWidth: currentElevatorConfig.shaftWidth, // Same dimensions for now
        shaftDepth: currentElevatorConfig.shaftDepth,
        minFloorIndex: 0, // -SETTINGS.numBasementFloors, //currentElevatorConfig.minFloorIndex,
        maxFloorIndex:  2, //  SETTINGS.numFloors-1, // //currentElevatorConfig.maxFloorIndex,
        startFloorIndex: 0, // Start at ground floor
        platformMaterial: elevatorMaterial, // new THREE.MeshStandardMaterial({ color: 0x1111aa, metalness: 0.8, roughness: 0.5  }), // Blue color
        shaftMaterial: concreteMaterial,
        scene: scene,
        worldObjectsRef: worldObjects
    };
    createElevator(sixthElevatorConfig); // Create the fourth elevator instance



    // --- Define Overall Elevator Shaft Dimensions for a 3-elevator bank ---
    const single_shaftX_center = currentElevatorConfig.x;
    const single_shaft_width = currentElevatorConfig.shaftWidth; // Width of one elevator shaft
    const single_shaft_depth = currentElevatorConfig.shaftDepth;
    const single_shaft_z_center = currentElevatorConfig.z;

    // Overall X dimensions for the 3-elevator bank
    // Assumes middle elevator is at single_shaftX_center,
    // side elevators are +/- 4 units away (center to center)
    const overallShaftMinX = (single_shaftX_center - 4) - (single_shaft_width / 2);
    const overallShaftMaxX = (single_shaftX_center + 4) + (single_shaft_width / 2);
    const overallShaftActualWidth = overallShaftMaxX - overallShaftMinX;
    const overallShaftActualCenterX = (overallShaftMinX + overallShaftMaxX) / 2; // Should still be single_shaftX_center

    // Overall Z dimensions (assuming all elevators aligned in Z)
    const overallShaftMinZ = single_shaft_z_center - single_shaft_depth / 2;
    const overallShaftMaxZ = single_shaft_z_center + single_shaft_depth / 2;
    const overallShaftActualDepth = single_shaft_depth;
    const overallShaftActualCenterZ = single_shaft_z_center;

    // Recalculate buildingWidth to ensure it covers the new wider shaft
    const buildingWidth = Math.max(SETTINGS.corridorWidth + (2 * roomSize), overallShaftActualWidth);

    // --- Lawn, Perimeter Wall, and Gate ---
    const lawnBorderWidth = 20.0; // How much the lawn extends beyond the building
    const buildingBaseY = -0.05; // Top surface of the lawn, consistent with old ground

    // Approximate building footprint for lawn calculation (using potentially new buildingWidth)
    const buildingMinX = overallShaftActualCenterX - buildingWidth / 2; // Centered with the building/shaft
    const buildingMaxX = overallShaftActualCenterX + buildingWidth / 2;
    const buildingMinZ_footprint = -(2*SETTINGS.elevatorSize) - totalCorridorLength - SETTINGS.escalatorLength - 8; // Building front edge. Shaft is now behind this if elevatorSize > 0.
    const buildingMaxZ_footprint = totalCorridorLength + SETTINGS.escalatorLength + 8; // Far end of escalator area

    const lawnMinX = buildingMinX - lawnBorderWidth;
    const lawnMaxX = buildingMaxX + lawnBorderWidth;
    const lawnMinZ = buildingMinZ_footprint - lawnBorderWidth;
    const lawnMaxZ = buildingMaxZ_footprint + lawnBorderWidth;

    const lawnWidth = lawnMaxX - lawnMinX;
    const lawnDepth = lawnMaxZ - lawnMinZ;
    const lawnCenterX = (lawnMinX + lawnMaxX) / 2;
    const lawnCenterZ = (lawnMinZ + lawnMaxZ) / 2;
    const lawnThickness = 0.1;

    // --- Lawn Generation with Hole for Elevator Shaft ---
    const lawnPanels = [];
    // Panel A (West of shaft)
    if (overallShaftMinX > lawnMinX) {
        const panelA_width = overallShaftMinX - lawnMinX;
        const panelA_geo = new THREE.BoxGeometry(panelA_width, lawnThickness, lawnDepth);
        const panelA = new THREE.Mesh(panelA_geo, lawnMaterial);
        panelA.position.set((lawnMinX + overallShaftMinX) / 2, buildingBaseY - lawnThickness / 2, lawnCenterZ);
        panelA.name = "LawnPanel_A"; lawnPanels.push(panelA);
    }
    // Panel B (East of shaft)
    if (overallShaftMaxX < lawnMaxX) {
        const panelB_width = lawnMaxX - overallShaftMaxX;
        const panelB_geo = new THREE.BoxGeometry(panelB_width, lawnThickness, lawnDepth);
        const panelB = new THREE.Mesh(panelB_geo, lawnMaterial);
        panelB.position.set((overallShaftMaxX + lawnMaxX) / 2, buildingBaseY - lawnThickness / 2, lawnCenterZ);
        panelB.name = "LawnPanel_B"; lawnPanels.push(panelB);
    }
    // Panel C (North of shaft, within shaft's X-span)
    if (overallShaftMaxZ < lawnMaxZ) {
        const panelC_depth = lawnMaxZ - overallShaftMaxZ;
        const panelC_geo = new THREE.BoxGeometry(overallShaftActualWidth, lawnThickness, panelC_depth);
        const panelC = new THREE.Mesh(panelC_geo, lawnMaterial);
        panelC.position.set(overallShaftActualCenterX, buildingBaseY - lawnThickness / 2, (overallShaftMaxZ + lawnMaxZ) / 2);
        panelC.name = "LawnPanel_C"; lawnPanels.push(panelC);
    }
    // Panel D (South of shaft, within shaft's X-span)
    if (overallShaftMinZ > lawnMinZ) {
        const panelD_depth = overallShaftMinZ - lawnMinZ;
        const panelD_geo = new THREE.BoxGeometry(overallShaftActualWidth, lawnThickness, panelD_depth);
        const panelD = new THREE.Mesh(panelD_geo, lawnMaterial);
        panelD.position.set(overallShaftActualCenterX, buildingBaseY - lawnThickness / 2, (lawnMinZ + overallShaftMinZ) / 2);
        panelD.name = "LawnPanel_D"; lawnPanels.push(panelD);
    }

    lawnPanels.forEach(panel => {
        panel.receiveShadow = true;
        scene.add(panel);
        worldObjects.push(panel);
    });

    // const lawnGeo = new THREE.BoxGeometry(lawnWidth, lawnThickness, lawnDepth);
    // const lawn = new THREE.Mesh(lawnGeo, lawnMaterial);
    // lawn.position.set(lawnCenterX, buildingBaseY - lawnThickness / 2, lawnCenterZ);
    // lawn.receiveShadow = true;
    // lawn.name = "Lawn";
    // scene.add(lawn);
    // worldObjects.push(lawn);

    // Perimeter Wall parameters
    const perimeterWallHeight = 2.5;
    const perimeterWallThickness = 0.5;
    const perimeterWallY = buildingBaseY + perimeterWallHeight / 2;

    // Gate parameters
    const gateWidth = 4.0;
    const gateGap = 0.1; // gateWidth + 0.2; // Total opening for the gate
    const gateHeight = perimeterWallHeight - 0.3; // Slightly shorter than wall
    const gateDoorThickness = 0.2;

    // Wall 1: Front wall (at lawnMinZ) - with gate opening
    const frontWallSegmentLength = (lawnWidth - gateGap) / 2;
    if (frontWallSegmentLength > 0) {
        const wall1aGeo = new THREE.BoxGeometry(frontWallSegmentLength, perimeterWallHeight, perimeterWallThickness);
        const wall1a = new THREE.Mesh(wall1aGeo, perimeterWallMaterial);
        wall1a.position.set(lawnMinX + frontWallSegmentLength / 2, perimeterWallY, lawnMinZ + perimeterWallThickness / 2);
        wall1a.name = "PerimeterWall_FrontLeft";
        wall1a.castShadow = true; wall1a.receiveShadow = true; scene.add(wall1a); worldObjects.push(wall1a);

        const wall1bGeo = new THREE.BoxGeometry(frontWallSegmentLength, perimeterWallHeight, perimeterWallThickness);
        const wall1b = new THREE.Mesh(wall1bGeo, perimeterWallMaterial);
        wall1b.position.set(lawnMaxX - frontWallSegmentLength / 2, perimeterWallY, lawnMinZ + perimeterWallThickness / 2);
        wall1b.name = "PerimeterWall_FrontRight";
        wall1b.castShadow = true; wall1b.receiveShadow = true; scene.add(wall1b); worldObjects.push(wall1b);
    }

    // Wall 2: Back wall (at lawnMaxZ)
    const wall2Geo = new THREE.BoxGeometry(lawnWidth, perimeterWallHeight, perimeterWallThickness);
    const wall2 = new THREE.Mesh(wall2Geo, perimeterWallMaterial);
    wall2.position.set(lawnCenterX, perimeterWallY, lawnMaxZ - perimeterWallThickness / 2);
    wall2.name = "PerimeterWall_Back";
    wall2.castShadow = true; wall2.receiveShadow = true; scene.add(wall2); worldObjects.push(wall2);

    // Wall 3: Left wall (at lawnMinX)
    const sideWallLength = lawnDepth - (2 * perimeterWallThickness); // Adjust to fit between front/back walls
    const wall3Geo = new THREE.BoxGeometry(perimeterWallThickness, perimeterWallHeight, sideWallLength);
    const wall3 = new THREE.Mesh(wall3Geo, perimeterWallMaterial);
    wall3.position.set(lawnMinX + perimeterWallThickness / 2, perimeterWallY, lawnCenterZ);
    wall3.name = "PerimeterWall_Left";
    wall3.castShadow = true; wall3.receiveShadow = true; scene.add(wall3); worldObjects.push(wall3);

    // Wall 4: Right wall (at lawnMaxX)
    const wall4Geo = new THREE.BoxGeometry(perimeterWallThickness, perimeterWallHeight, sideWallLength);
    const wall4 = new THREE.Mesh(wall4Geo, perimeterWallMaterial);
    wall4.position.set(lawnMaxX - perimeterWallThickness / 2, perimeterWallY, lawnCenterZ);
    wall4.name = "PerimeterWall_Right";
    wall4.castShadow = true; wall4.receiveShadow = true; scene.add(wall4); worldObjects.push(wall4);

    // Gate Doors (simple swinging doors)
    const gateDoorWidth = gateWidth / 2;
    const gateDoorGeo = new THREE.BoxGeometry(gateDoorWidth, gateHeight, gateDoorThickness);
    
    // Left Gate Door
    const leftGateDoor = new THREE.Mesh(gateDoorGeo, gateMaterial);
    // Position pivot at the edge of the gap
    leftGateDoor.geometry.translate(gateDoorWidth / 2, 0, 0); // Shift geometry so rotation is around one edge
    leftGateDoor.position.set(lawnCenterX - gateGap / 2, buildingBaseY + gateHeight / 2, lawnMinZ + perimeterWallThickness / 2);
    leftGateDoor.name = "Gate_LeftDoor";
    leftGateDoor.castShadow = true; leftGateDoor.receiveShadow = true;
    // leftGateDoor.rotation.y = -Math.PI / 4; // Example: open
    scene.add(leftGateDoor);
    worldObjects.push(leftGateDoor);
    // Add to doors array if you want to interact with it like other doors
    // doors.push({ object: leftGateDoor, userData: { type: 'gateDoor', isOpen: false, locked: false } });

    // Right Gate Door
    const rightGateDoor = new THREE.Mesh(gateDoorGeo, gateMaterial);
    rightGateDoor.geometry.translate(-gateDoorWidth / 2, 0, 0); // Shift geometry for right-side pivot
    rightGateDoor.position.set(lawnCenterX + gateGap / 2, buildingBaseY + gateHeight / 2, lawnMinZ + perimeterWallThickness / 2);
    rightGateDoor.name = "Gate_RightDoor";
    rightGateDoor.castShadow = true; rightGateDoor.receiveShadow = true;
    // rightGateDoor.rotation.y = Math.PI / 4; // Example: open
    scene.add(rightGateDoor);
    worldObjects.push(rightGateDoor);
    // doors.push({ object: rightGateDoor, userData: { type: 'gateDoor', isOpen: false, locked: false } });
    
    // Escalator Floor Plane (replace PlaneGeometry with BoxGeometry)
    const floorEscGeo = new THREE.BoxGeometry(SETTINGS.corridorWidth + (2 * escalatorWidth), floorDepth, escalatorLength + 4);
    const floorEsc = new THREE.Mesh(floorEscGeo, floorMaterial);
    floorEsc.name = `Floor Escalator`;
    floorEsc.position.set(
        SETTINGS.corridorWidth / 2,
        -floorDepth / 2, // So the top is at y=0
        totalCorridorLength + (escalatorLength / 2) + 2 // Centered in the corridor
    );
    floorEsc.receiveShadow = true;
    scene.add(floorEsc);
    worldObjects.push(floorEsc);

    
    // Roof Plane
    const roofGeo = new THREE.BoxGeometry(buildingWidth, floorDepth, 4 + totalCorridorLength + escalatorLength + 8);
    const roof = new THREE.Mesh(roofGeo, floorMaterial);
    roof.name = `Roof`;
    // roof.position.set(SETTINGS.corridorWidth / 2, (SETTINGS.numFloors) * SETTINGS.floorHeight - floorDepth/2, 2 + ((totalCorridorLength + escalatorLength) / 2)); // Old
    roof.position.set(SETTINGS.corridorWidth / 2, (SETTINGS.numFloors) * SETTINGS.floorHeight - floorDepth/2, 2 + ((totalCorridorLength + escalatorLength) / 2));
    roof.receiveShadow = true;
    scene.add(roof);
    worldObjects.push(roof);

    // --- Walls for Elevator Penthouse on the Roof ---
    // These walls surround the top part of the elevator shaft that protrudes above the main roof.
    // The individual elevatorObj.shaftCeiling(s) are the roofs *inside* this penthouse.
    const mainRoofSurfaceY = currentElevatorConfig.maxFloorIndex * SETTINGS.floorHeight;
    // Use the Y of the first (middle) elevator's shaft ceiling as reference for penthouse height
    const shaftCeilingBottomY = elevators.find(e => e.id === "mainElevator").shaftCeiling.position.y - floorDepth / 2;
    const penthouseWallHeight = Math.max(0.1, shaftCeilingBottomY - mainRoofSurfaceY);
    const penthouseWallCenterY = mainRoofSurfaceY + penthouseWallHeight / 2;

    // Penthouse Wall Left (Player's Right when facing +Z)
    const penthouseWallLeftGeo = new THREE.BoxGeometry(wallDepth, penthouseWallHeight, overallShaftActualDepth);
    const penthouseWallLeft = new THREE.Mesh(penthouseWallLeftGeo, wallMaterial);
    penthouseWallLeft.name = `ElevatorPenthouseWall_Left`;
    penthouseWallLeft.position.set(
        overallShaftMinX - wallDepth / 2, // Adjusted
        penthouseWallCenterY,
        overallShaftActualCenterZ
    );
    penthouseWallLeft.castShadow = true; penthouseWallLeft.receiveShadow = true;
    scene.add(penthouseWallLeft); worldObjects.push(penthouseWallLeft);

    // Penthouse Wall Right (Player's Left when facing +Z)
    const penthouseWallRightGeo = new THREE.BoxGeometry(wallDepth, penthouseWallHeight, overallShaftActualDepth);
    const penthouseWallRight = new THREE.Mesh(penthouseWallRightGeo, wallMaterial);
    penthouseWallRight.name = `ElevatorPenthouseWall_Right`;
    penthouseWallRight.position.set(
        overallShaftMaxX + wallDepth / 2, // Adjusted
        penthouseWallCenterY,
        overallShaftActualCenterZ
    );
    penthouseWallRight.castShadow = true; penthouseWallRight.receiveShadow = true;
    scene.add(penthouseWallRight); worldObjects.push(penthouseWallRight);

    // Penthouse Wall Back
    const penthouseWallBackGeo = new THREE.BoxGeometry(overallShaftActualWidth, penthouseWallHeight, wallDepth);
    const penthouseWallBack = new THREE.Mesh(penthouseWallBackGeo, wallMaterial);
    penthouseWallBack.name = `ElevatorPenthouseWall_Back`;
    penthouseWallBack.position.set(
        overallShaftActualCenterX, // Adjusted
        penthouseWallCenterY,
        overallShaftMinZ - wallDepth / 2
    );
    penthouseWallBack.castShadow = true; penthouseWallBack.receiveShadow = true;
    scene.add(penthouseWallBack); worldObjects.push(penthouseWallBack);

    // Penthouse Wall Front (around opening, if any, or solid if no roof access door)
    // For simplicity, let's make it solid for now. A door could be added here.
    /* const penthouseWallFrontGeo = new THREE.BoxGeometry(currentElevatorConfig.shaftWidth, penthouseWallHeight, wallDepth);
    const penthouseWallFront = new THREE.Mesh(penthouseWallFrontGeo, wallMaterial);
    penthouseWallFront.name = `ElevatorPenthouseWall_Front`;
    penthouseWallFront.position.set( // This was commented out, if re-enabled, adjust:
        overallShaftActualCenterX, // Adjusted
        penthouseWallCenterY,
        overallShaftMaxZ + wallDepth / 2
    );
    penthouseWallFront.castShadow = true; penthouseWallFront.receiveShadow = true;
    scene.add(penthouseWallFront); worldObjects.push(penthouseWallFront); */

    // --- Floodlight on Elevator Shaft Roof ---
    const floodlightHousingMaterial = new THREE.MeshStandardMaterial({ color: 0x333333, metalness: 0.7, roughness: 0.4 });
    const floodlightLensMaterial = new THREE.MeshStandardMaterial({ color: 0xFFFFEE, emissive: 0xFFFFDD, emissiveIntensity: 0.5 }); // Slightly glowing lens

    const floodlightHousingGeo = new THREE.BoxGeometry(0.8, 0.4, 0.4); // width, height, depth
    const floodlightHousing = new THREE.Mesh(floodlightHousingGeo, floodlightHousingMaterial);

    const floodlightLensGeo = new THREE.CylinderGeometry(0.15, 0.18, 0.1, 16); // radiusTop, radiusBottom, height, segments
    const floodlightLens = new THREE.Mesh(floodlightLensGeo, floodlightLensMaterial);
    floodlightLens.rotation.x = Math.PI / 2;
    floodlightLens.position.z = 0.2; // Position at the front of the housing

    const floodlightAssembly = new THREE.Group();
    floodlightAssembly.add(floodlightHousing);
    floodlightAssembly.add(floodlightLens);

    // Position the floodlight assembly on top of the 'Top Roof over Elevator'
    // Use the middle elevator's shaft ceiling for floodlight positioning
    const middleElevatorShaftCeiling = elevators.find(e => e.id === "mainElevator").shaftCeiling;
    const shaftCeilingSurfaceY = middleElevatorShaftCeiling.position.y + floorDepth / 2;
    floodlightAssembly.position.set(
        middleElevatorShaftCeiling.position.x, // Centered on X of middle elevator's ceiling
        shaftCeilingSurfaceY + 0.2, // Housing height/2 = 0.4/2 = 0.2
        middleElevatorShaftCeiling.position.z + (overallShaftActualDepth / 2) - 0.3 // Near the edge facing the main roof
    );
    scene.add(floodlightAssembly);

    const rooftopSpotLight = new THREE.SpotLight(0xffffff, 20, 200, Math.PI / 3, 1, 1.5); // color, intensity, distance, angle, penumbra, decay
    rooftopSpotLight.position.copy(floodlightAssembly.position);
    rooftopSpotLight.position.z += 0.2; // Emitter slightly in front of housing
    // Target the center of the main roof area
    // const totalCorridorLength = SETTINGS.doorsPerSide * SETTINGS.corridorSegmentLength; // Already defined
    const mainRoofCenterY = (SETTINGS.numFloors) * SETTINGS.floorHeight;
    const mainRoofCenterZ = 4 + ((totalCorridorLength + SETTINGS.escalatorLength) / 2);
    rooftopSpotLight.target.position.set(SETTINGS.corridorWidth / 2, mainRoofCenterY, mainRoofCenterZ);

    rooftopSpotLight.castShadow = true;
    rooftopSpotLight.shadow.mapSize.width = 1024;
    rooftopSpotLight.shadow.mapSize.height = 1024;
    rooftopSpotLight.shadow.camera.near = 1;
    rooftopSpotLight.shadow.camera.far = 200;
    rooftopSpotLight.shadow.focus = 1; // Softer shadows

    scene.add(rooftopSpotLight);
    scene.add(rooftopSpotLight.target); // Important: add the target to the scene as well

    // --- Rooftop Perimeter Walls ---
    const rooftopWallHeight = 1.0; // Low walls
    const rooftopWallThickness = 0.5; // Wide walls
    const rooftopWallMaterial = wallMaterial.clone(); 
    rooftopWallMaterial.color.set(0x777777); // Different color for rooftop walls to avoid z-fighting

    const roofActualWidth = buildingWidth; // Use the potentially wider buildingWidth
    const roofActualDepth = totalCorridorLength + SETTINGS.escalatorLength + 12;
    const roofActualCenterX = overallShaftActualCenterX; // Center roof with the shaft/building
    const roofActualCenterZ = 2 + ((totalCorridorLength + SETTINGS.escalatorLength) / 2); // Z center remains the same
    const roofTopSurfaceY = (SETTINGS.numFloors) * SETTINGS.floorHeight; // Top Y of the main roof slab
    
    const wallYPos = roofTopSurfaceY + rooftopWallHeight / 2; // Position walls to sit ON the roof surface

    // Wall 1: Far Z (Positive Z end of the roof)
    const wallFarZGeo = new THREE.BoxGeometry(roofActualWidth, rooftopWallHeight, rooftopWallThickness);
    const wallFarZ = new THREE.Mesh(wallFarZGeo, rooftopWallMaterial);
    wallFarZ.position.set(roofActualCenterX, wallYPos, roofActualCenterZ + roofActualDepth / 2 - rooftopWallThickness / 2);
    wallFarZ.name = "RooftopWall_FarZ";
    wallFarZ.castShadow = true; wallFarZ.receiveShadow = true; wallFarZ.geometry.computeBoundingBox();
    scene.add(wallFarZ); worldObjects.push(wallFarZ);

    // Wall 2: Near Z (Negative Z end of the roof), with opening for elevator
    // Elevator opening X: from 0 to SETTINGS.corridorWidth. Roof X spans from -SETTINGS.roomSize to SETTINGS.corridorWidth + SETTINGS.roomSize
    const nearWallZPos = roofActualCenterZ - roofActualDepth / 2 + rooftopWallThickness / 2;

    // Part 1 of Near Z wall (left of elevator: from -SETTINGS.roomSize to 0)
    /* const nearWallLeftLength = SETTINGS.roomSize;
    const nearWallLeftGeo = new THREE.BoxGeometry(nearWallLeftLength, rooftopWallHeight, rooftopWallThickness);
    const nearWallLeft = new THREE.Mesh(nearWallLeftGeo, rooftopWallMaterial);
    nearWallLeft.position.set(-SETTINGS.roomSize / 2, wallYPos, nearWallZPos);
    nearWallLeft.name = "RooftopWall_NearZ_Left";
    nearWallLeft.castShadow = true; nearWallLeft.receiveShadow = true; nearWallLeft.geometry.computeBoundingBox();
    scene.add(nearWallLeft); worldObjects.push(nearWallLeft);

    // Part 2 of Near Z wall (right of elevator: from SETTINGS.corridorWidth to SETTINGS.corridorWidth + SETTINGS.roomSize)
    const nearWallRightLength = SETTINGS.roomSize;
    const nearWallRightGeo = new THREE.BoxGeometry(nearWallRightLength, rooftopWallHeight, rooftopWallThickness);
    const nearWallRight = new THREE.Mesh(nearWallRightGeo, rooftopWallMaterial);
    nearWallRight.position.set(SETTINGS.corridorWidth + SETTINGS.roomSize / 2, wallYPos, nearWallZPos);
    nearWallRight.name = "RooftopWall_NearZ_Right";
    nearWallRight.castShadow = true; nearWallRight.receiveShadow = true; nearWallRight.geometry.computeBoundingBox();
    scene.add(nearWallRight); worldObjects.push(nearWallRight); */

    // Wall 3: Side X (Negative X side of roof, at X = -SETTINGS.roomSize)
    const wallSideLeftGeo = new THREE.BoxGeometry(rooftopWallThickness, rooftopWallHeight, roofActualDepth);
    const wallSideLeft = new THREE.Mesh(wallSideLeftGeo, rooftopWallMaterial);
    wallSideLeft.position.set(roofActualCenterX - roofActualWidth / 2 + rooftopWallThickness / 2, wallYPos, roofActualCenterZ);
    wallSideLeft.name = "RooftopWall_SideLeft";
    wallSideLeft.castShadow = true; wallSideLeft.receiveShadow = true; wallSideLeft.geometry.computeBoundingBox();
    scene.add(wallSideLeft); worldObjects.push(wallSideLeft);

    // Wall 4: Side X (Positive X side of roof, at X = SETTINGS.corridorWidth + SETTINGS.roomSize)
    const wallSideRightGeo = new THREE.BoxGeometry(rooftopWallThickness, rooftopWallHeight, roofActualDepth);
    const wallSideRight = new THREE.Mesh(wallSideRightGeo, rooftopWallMaterial);
    wallSideRight.position.set(roofActualCenterX + roofActualWidth / 2 - rooftopWallThickness / 2, wallYPos, roofActualCenterZ);
    wallSideRight.name = "RooftopWall_SideRight";
    wallSideRight.castShadow = true; wallSideRight.receiveShadow = true; wallSideRight.geometry.computeBoundingBox();
    scene.add(wallSideRight); worldObjects.push(wallSideRight);


    // --- Define Building Footprint for Basement ---
    // Use overall shaft/building dimensions for basement footprint
    const basementMinX = overallShaftActualCenterX - buildingWidth / 2;
    const basementMaxX = overallShaftActualCenterX + buildingWidth / 2;
    const basementWidth = buildingWidth; // Use the potentially wider buildingWidth
    const basementCenterX = overallShaftActualCenterX;

    const basementMinZ = -SETTINGS.elevatorSize; // Front of building at elevator
    const basementMaxZ = totalCorridorLength + 4 + SETTINGS.escalatorLength + 4; // Back of building
    const basementDepth = basementMaxZ - basementMinZ;
    const basementCenterZ = (basementMinZ + basementMaxZ) / 2;


    // Floor levels
    // Loop from the lowest basement floor up to the highest above-ground floor
    for (let i = -SETTINGS.numBasementFloors; i < SETTINGS.numFloors; i++) {
        const floorY = i * SETTINGS.floorHeight;
        const redDoorIndex = Math.floor(Math.random() * SETTINGS.doorsPerSide * 2);
        let currentDoorIndex = 0;

        if (i < 0) { // --- Basement Floor Generation ---
            const basementFloorPanels = [];
            const basementCeilingPanels = [];
            const floorPanelY = floorY - floorDepth / 2; // Y for top surface of floor slab
            const ceilingPanelY = floorY + SETTINGS.wallHeight - (floorDepth / 4); // Y for top surface of ceiling slab

            // --- Add Connector Floor & Ceiling for Basement (between corridor end Z=0 and new shaft front Z=-4) ---
           /*  const connectorBasementFloorGeo = new THREE.BoxGeometry(overallShaftActualWidth, floorDepth, 4); // Adjusted width
            const connectorBasementFloor = new THREE.Mesh(connectorBasementFloorGeo, concreteMaterial);
            connectorBasementFloor.position.set(overallShaftActualCenterX, floorPanelY, -2); // Adjusted X
            connectorBasementFloor.name = `BasementConnectorFloor_F${i}`;
            scene.add(connectorBasementFloor); worldObjects.push(connectorBasementFloor);
 */
            const connectorBasementCeilingGeo = new THREE.BoxGeometry(overallShaftActualWidth, floorDepth / 2, 4); // Adjusted width
            const connectorBasementCeiling = new THREE.Mesh(connectorBasementCeilingGeo, concreteMaterial);
            connectorBasementCeiling.position.set(overallShaftActualCenterX, ceilingPanelY, -2); // Adjusted X
            connectorBasementCeiling.name = `BasementConnectorCeiling_F${i}`;
            scene.add(connectorBasementCeiling); worldObjects.push(connectorBasementCeiling);

            // Panel A (West of shaft)
            if (overallShaftMinX > basementMinX) {
                const panelA_width = overallShaftMinX - basementMinX;
                const panelA_floor_geo = new THREE.BoxGeometry(panelA_width, floorDepth, basementDepth);
                const panelA_floor = new THREE.Mesh(panelA_floor_geo, concreteMaterial);
                panelA_floor.position.set((basementMinX + overallShaftMinX) / 2, floorPanelY, basementCenterZ);
                panelA_floor.name = `BasementFloorPanel_A_F${i}`; basementFloorPanels.push(panelA_floor);

                const panelA_ceil_geo = new THREE.BoxGeometry(panelA_width, floorDepth / 2, basementDepth);
                const panelA_ceil = new THREE.Mesh(panelA_ceil_geo, concreteMaterial);
                panelA_ceil.position.set((basementMinX + overallShaftMinX) / 2, ceilingPanelY, basementCenterZ);
                panelA_ceil.name = `BasementCeilingPanel_A_F${i}`; basementCeilingPanels.push(panelA_ceil);
            }
            // Panel B (East of shaft)
            if (overallShaftMaxX < basementMaxX) {
                const panelB_width = basementMaxX - overallShaftMaxX;
                const panelB_floor_geo = new THREE.BoxGeometry(panelB_width, floorDepth, basementDepth);
                const panelB_floor = new THREE.Mesh(panelB_floor_geo, concreteMaterial);
                panelB_floor.position.set((overallShaftMaxX + basementMaxX) / 2, floorPanelY, basementCenterZ);
                panelB_floor.name = `BasementFloorPanel_B_F${i}`; basementFloorPanels.push(panelB_floor);

                const panelB_ceil_geo = new THREE.BoxGeometry(panelB_width, floorDepth / 2, basementDepth);
                const panelB_ceil = new THREE.Mesh(panelB_ceil_geo, concreteMaterial);
                panelB_ceil.position.set((overallShaftMaxX + basementMaxX) / 2, ceilingPanelY, basementCenterZ);
                panelB_ceil.name = `BasementCeilingPanel_B_F${i}`; basementCeilingPanels.push(panelB_ceil);
            }
            // Panel C (North of shaft, within shaft's X-span)
            if (overallShaftMaxZ < basementMaxZ) {
                const panelC_depth = basementMaxZ - overallShaftMaxZ;
                const panelC_floor_geo = new THREE.BoxGeometry(overallShaftActualWidth, floorDepth, panelC_depth);
                const panelC_floor = new THREE.Mesh(panelC_floor_geo, concreteMaterial);
                panelC_floor.position.set(overallShaftActualCenterX, floorPanelY, (overallShaftMaxZ + basementMaxZ) / 2);
                panelC_floor.name = `BasementFloorPanel_C_F${i}`; basementFloorPanels.push(panelC_floor);

                const panelC_ceil_geo = new THREE.BoxGeometry(overallShaftActualWidth, floorDepth / 2, panelC_depth);
                const panelC_ceil = new THREE.Mesh(panelC_ceil_geo, concreteMaterial);
                panelC_ceil.position.set(overallShaftActualCenterX, ceilingPanelY, (overallShaftMaxZ + basementMaxZ) / 2);
                panelC_ceil.name = `BasementCeilingPanel_C_F${i}`; basementCeilingPanels.push(panelC_ceil);
            }
            // Panel D (South of shaft, within shaft's X-span)
            if (overallShaftMinZ > basementMinZ) {
                const panelD_depth = overallShaftMinZ - basementMinZ;
                const panelD_floor_geo = new THREE.BoxGeometry(overallShaftActualWidth, floorDepth, panelD_depth);
                const panelD_floor = new THREE.Mesh(panelD_floor_geo, concreteMaterial);
                panelD_floor.position.set(overallShaftActualCenterX, floorPanelY, (basementMinZ + overallShaftMinZ) / 2);
                panelD_floor.name = `BasementFloorPanel_D_F${i}`; basementFloorPanels.push(panelD_floor);

                const panelD_ceil_geo = new THREE.BoxGeometry(overallShaftActualWidth, floorDepth / 2, panelD_depth);
                const panelD_ceil = new THREE.Mesh(panelD_ceil_geo, concreteMaterial);
                panelD_ceil.position.set(overallShaftActualCenterX, ceilingPanelY, (basementMinZ + overallShaftMinZ) / 2);
                panelD_ceil.name = `BasementCeilingPanel_D_F${i}`; basementCeilingPanels.push(panelD_ceil);
            }

            basementFloorPanels.forEach(panel => {
                panel.receiveShadow = true;
                scene.add(panel);
                worldObjects.push(panel);
            });
            basementCeilingPanels.forEach(panel => {
                panel.castShadow = true;
                scene.add(panel);
                worldObjects.push(panel);
            });

            // --- Basement Perimeter Walls ---
            // Back Wall (Far Z) - with Garage Door Opening
            const garageDoorWidth = 6;
            const garageDoorHeight = SETTINGS.wallHeight - 0.5; // Leave 0.5m for header
            const garageDoorPanelThickness = 0.2;
            const wallFarZPlane = basementMaxZ - wallDepth / 2;

            // Segment Left of Garage Door
            const farWallLeftWidth = (basementWidth - garageDoorWidth) / 2;
            if (farWallLeftWidth > 0.01) {
                const farWallLeftGeo = new THREE.BoxGeometry(farWallLeftWidth, SETTINGS.wallHeight, wallDepth);
                const farWallLeft = new THREE.Mesh(farWallLeftGeo, basementWallMaterial);
                farWallLeft.position.set(basementMinX + farWallLeftWidth / 2, floorY + SETTINGS.wallHeight / 2, wallFarZPlane);
                farWallLeft.name = `BasementWall_Far_Right_F${i}`; // Adjusted: MinX side is player's right
                farWallLeft.castShadow = true; farWallLeft.receiveShadow = true;
                scene.add(farWallLeft); worldObjects.push(farWallLeft);
            }

            // Segment Right of Garage Door
            const farWallRightWidth = (basementWidth - garageDoorWidth) / 2;
            if (farWallRightWidth > 0.01) {
                const farWallRightGeo = new THREE.BoxGeometry(farWallRightWidth, SETTINGS.wallHeight, wallDepth);
                const farWallRight = new THREE.Mesh(farWallRightGeo, basementWallMaterial);
                farWallRight.position.set(basementMaxX - farWallRightWidth / 2, floorY + SETTINGS.wallHeight / 2, wallFarZPlane);
                farWallRight.name = `BasementWall_Far_Left_F${i}`; // Adjusted: MaxX side is player's left
                farWallRight.castShadow = true; farWallRight.receiveShadow = true;
                scene.add(farWallRight); worldObjects.push(farWallRight);
            }

            // Header Above Garage Door
            const headerHeight = SETTINGS.wallHeight - garageDoorHeight;
            if (headerHeight > 0.01) {
                const headerGeo = new THREE.BoxGeometry(garageDoorWidth, headerHeight, wallDepth);
                const header = new THREE.Mesh(headerGeo, basementWallMaterial);
                header.position.set(basementCenterX, floorY + garageDoorHeight + headerHeight / 2, wallFarZPlane);
                header.name = `BasementWall_Far_Header_F${i}`;
                header.castShadow = true; header.receiveShadow = true;
                scene.add(header); worldObjects.push(header);
            }

            // Create Garage Door (only for the lowest basement floor for now)
            if (i === -SETTINGS.numBasementFloors) {
                const garageDoorGeo = new THREE.BoxGeometry(garageDoorWidth, garageDoorHeight, garageDoorPanelThickness);
                garageDoorGeo.translate(0, -garageDoorHeight / 2, 0); // Pivot at top edge
                const garageDoor = new THREE.Mesh(garageDoorGeo, garageDoorMaterial);
                garageDoor.name = `GarageDoor_F${i}`;
                garageDoor.position.set(basementCenterX, floorY + garageDoorHeight, wallFarZPlane - wallDepth/2 + garageDoorPanelThickness/2); // Position top edge
                garageDoor.castShadow = true; garageDoor.receiveShadow = true;
                garageDoor.userData = { type: 'garageDoor', isOpen: false, isAnimating: false, targetRotationX: 0, floor: i };
                scene.add(garageDoor); worldObjects.push(garageDoor); doors.push(garageDoor); // Add to doors for interaction

                // --- Add Garage Structure Behind the Door ---
                const garageDepthVal = 8; // How deep the garage extends
                const garageWallThickness = wallDepth; // Use existing wallDepth

                // Garage Floor
                const garageFloorGeo = new THREE.BoxGeometry(garageDoorWidth, floorDepth, garageDepthVal);
                const garageFloor = new THREE.Mesh(garageFloorGeo, concreteMaterial);
                garageFloor.name = `Garage_Floor_F${i}`;
                garageFloor.position.set(basementCenterX, floorY - floorDepth / 2, wallFarZPlane + wallDepth/2 + garageDepthVal / 2);
                garageFloor.receiveShadow = true;
                scene.add(garageFloor); worldObjects.push(garageFloor);

                // Garage Ceiling
                const garageCeilingGeo = new THREE.BoxGeometry(garageDoorWidth, floorDepth / 2, garageDepthVal); // Thinner ceiling for garage
                const garageCeiling = new THREE.Mesh(garageCeilingGeo, concreteMaterial);
                garageCeiling.name = `Garage_Ceiling_F${i}`;
                garageCeiling.position.set(basementCenterX, floorY + SETTINGS.wallHeight + (floorDepth/2)/2, wallFarZPlane + wallDepth/2 + garageDepthVal / 2);
                garageCeiling.castShadow = true;
                scene.add(garageCeiling); worldObjects.push(garageCeiling);

                // Garage Side Walls
                const garageSideWallGeo = new THREE.BoxGeometry(garageWallThickness, SETTINGS.wallHeight, garageDepthVal);
                const garageSideWallLeft = new THREE.Mesh(garageSideWallGeo, basementWallMaterial);
                garageSideWallLeft.name = `Garage_SideWall_Left_F${i}`;
                garageSideWallLeft.position.set(basementCenterX - garageDoorWidth/2 + garageWallThickness/2, floorY + SETTINGS.wallHeight/2, wallFarZPlane + wallDepth/2 + garageDepthVal/2);
                scene.add(garageSideWallLeft); worldObjects.push(garageSideWallLeft);

                const garageSideWallRight = new THREE.Mesh(garageSideWallGeo, basementWallMaterial);
                garageSideWallRight.name = `Garage_SideWall_Right_F${i}`;
                garageSideWallRight.position.set(basementCenterX + garageDoorWidth/2 - garageWallThickness/2, floorY + SETTINGS.wallHeight/2, wallFarZPlane + wallDepth/2 + garageDepthVal/2);
                scene.add(garageSideWallRight); worldObjects.push(garageSideWallRight);

                // Garage Back Wall
                const garageBackWallGeo = new THREE.BoxGeometry(garageDoorWidth, SETTINGS.wallHeight, garageWallThickness);
                const garageBackWall = new THREE.Mesh(garageBackWallGeo, basementWallMaterial);
                garageBackWall.name = `Garage_BackWall_F${i}`;
                garageBackWall.position.set(basementCenterX, floorY + SETTINGS.wallHeight/2, wallFarZPlane + wallDepth/2 + garageDepthVal - garageWallThickness/2);
                scene.add(garageBackWall); worldObjects.push(garageBackWall);

                // Garage Light
                const garageLightYPos = floorY + SETTINGS.wallHeight - 0.5;
                const garageLightXPos = basementCenterX;
                const garageLightZPos = wallFarZPlane + wallDepth/2 + garageDepthVal/2;

                const garagePointLight = new THREE.PointLight(0xffccaa, 0.7, 15); // Light color, intensity, range
                garagePointLight.position.set(garageLightXPos, garageLightYPos, garageLightZPos);
                scene.add(garagePointLight);

                // Add a simple fixture mesh for the garage light
                const garageFixtureGeo = new THREE.BoxGeometry(1.0, 0.15, 0.2); // A bit smaller or different style
                const garageFixtureMat = new THREE.MeshStandardMaterial({color: 0xffeeaa, emissive: 1, emissiveIntensity: 100}); // Slightly different color for variety
                const garageFixture = new THREE.Mesh(garageFixtureGeo, garageFixtureMat);
                garageFixture.position.set(garageLightXPos, garageLightYPos + 0.075, garageLightZPos); // Centered with the light Y
                scene.add(garageFixture);
            }
            
            // Front Wall (Near Z - around elevator shaft)
            // Part 1: Left of elevator shaft (X from basementMinX to 0)
            const frontWallLeftWidth = 0 - basementMinX; // Width of this segment
            /* if (frontWallLeftWidth > 0.01) {
                const wallFrontLeftGeo = new THREE.BoxGeometry(frontWallLeftWidth, SETTINGS.wallHeight, wallDepth);
                const wallFrontLeft = new THREE.Mesh(wallFrontLeftGeo, basementWallMaterial);
                wallFrontLeft.position.set(basementMinX + frontWallLeftWidth / 2, floorY + SETTINGS.wallHeight / 2, basementMinZ + wallDepth / 2);
                wallFrontLeft.name = `BasementWall_Front_Right_F${i}`; // Adjusted: MinX side is player's right
                wallFrontLeft.castShadow = true; wallFrontLeft.receiveShadow = true;
                scene.add(wallFrontLeft); worldObjects.push(wallFrontLeft);
            } */
            // Part 2: Right of elevator shaft (X from SETTINGS.corridorWidth to basementMaxX)
            const frontWallRightWidth = basementMaxX - SETTINGS.corridorWidth; // Width of this segment
           /*  if (frontWallRightWidth > 0.01) {
                const wallFrontRightGeo = new THREE.BoxGeometry(frontWallRightWidth, SETTINGS.wallHeight, wallDepth);
                const wallFrontRight = new THREE.Mesh(wallFrontRightGeo, basementWallMaterial);
                wallFrontRight.position.set(SETTINGS.corridorWidth + frontWallRightWidth / 2, floorY + SETTINGS.wallHeight / 2, basementMinZ + wallDepth / 2);
                wallFrontRight.name = `BasementWall_Front_Left_F${i}`; // Adjusted: MaxX side is player's left
                wallFrontRight.castShadow = true; wallFrontRight.receiveShadow = true;
                scene.add(wallFrontRight); worldObjects.push(wallFrontRight);
            } */
            // Note: The actual back wall of the elevator shaft itself is handled by `endWallNear` later.

            // Side Wall Left (Min X)
            const wallSideLeftGeo = new THREE.BoxGeometry(wallDepth, SETTINGS.wallHeight, basementDepth);
            const wallSideLeft = new THREE.Mesh(wallSideLeftGeo, basementWallMaterial);
            wallSideLeft.position.set(basementMinX + wallDepth / 2, floorY + SETTINGS.wallHeight / 2, basementCenterZ);
            wallSideLeft.name = `BasementWall_SideRight_F${i}`; // Adjusted: MinX side is player's right
            wallSideLeft.castShadow = true; wallSideLeft.receiveShadow = true;
            scene.add(wallSideLeft); worldObjects.push(wallSideLeft);

            // Side Wall Right (Max X)
            const wallSideRightGeo = new THREE.BoxGeometry(wallDepth, SETTINGS.wallHeight, basementDepth);
            const wallSideRight = new THREE.Mesh(wallSideRightGeo, basementWallMaterial);
            wallSideRight.position.set(basementMaxX - wallDepth / 2, floorY + SETTINGS.wallHeight / 2, basementCenterZ);
            wallSideRight.name = `BasementWall_SideLeft_F${i}`; // Adjusted: MaxX side is player's left
            wallSideRight.castShadow = true; wallSideRight.receiveShadow = true;
            scene.add(wallSideRight); worldObjects.push(wallSideRight);

            // Concrete Pillars
            const pillarSize = 0.5;
            const pillarGeo = new THREE.BoxGeometry(pillarSize, SETTINGS.wallHeight, pillarSize);
            const pillarYPos = floorY + SETTINGS.wallHeight / 2;
            const pillarSpacingX = 7;
            const pillarSpacingZ = 7;
            // Use overall shaft dimensions for pillar exclusion zone
            const elevatorShaftZone = { minX: overallShaftMinX - 0.1, maxX: overallShaftMaxX + 0.1, minZ: overallShaftMinZ - 0.1, maxZ: overallShaftMaxZ + 0.1 };
            /* const escalatorLandingZone = (i === -SETTINGS.numBasementFloors) ? { // Only for the first basement floor if escalators lead there
                minX: -SETTINGS.escalatorWidth - 1,
                maxX: SETTINGS.corridorWidth + SETTINGS.escalatorWidth + 1,
                minZ: totalCorridorLength + 2,
                maxZ: totalCorridorLength + SETTINGS.escalatorLength + 6
            } : null; */

            for (let px = basementMinX + pillarSpacingX / 2; px < basementMaxX; px += pillarSpacingX) {
                for (let pz = basementMinZ + pillarSpacingZ / 2; pz < basementMaxZ; pz += pillarSpacingZ) {
                    if (px > elevatorShaftZone.minX && px < elevatorShaftZone.maxX &&
                        pz > elevatorShaftZone.minZ && pz < elevatorShaftZone.maxZ) {
                        continue;
                    }
                    /* if (escalatorLandingZone &&
                        px > escalatorLandingZone.minX && px < escalatorLandingZone.maxX &&
                        pz > escalatorLandingZone.minZ && pz < escalatorLandingZone.maxZ) {
                        continue;
                    } */

                    const pillar = new THREE.Mesh(pillarGeo, pillarMaterial);
                    pillar.position.set(px, pillarYPos, pz);
                    pillar.name = `BasementPillar_F${i}_X${Math.round(px)}_Z${Math.round(pz)}`;
                    pillar.castShadow = true; pillar.receiveShadow = true;
                    scene.add(pillar);
                    worldObjects.push(pillar);
                }
            }

            // Basement Lighting (simple point lights for now)
            const lightSpacing = 6; // Reduced spacing for better coverage
            const lightYPos = floorY + SETTINGS.wallHeight - 0.5; // Under the ceiling

            // Determine X positions for lights, ensuring they are centered around basementCenterX
            // basementWidth and basementCenterX are defined earlier in generateWorld
            const numLightsX = Math.max(1, Math.floor(basementWidth / lightSpacing));
            const totalLightSpanX = (numLightsX - 1) * lightSpacing;
            const startLx = basementCenterX - totalLightSpanX / 2;

            for (let lz = basementMinZ + lightSpacing / 2; lz < basementMaxZ; lz += lightSpacing) {
                for (let k = 0; k < numLightsX; k++) {
                    const lx = startLx + k * lightSpacing;

                    const parkingLight = new THREE.PointLight(0xddddff, 0.5, 18); // Dim, cool white
                    parkingLight.position.set(lx, lightYPos, lz);
                    // parkingLight.castShadow = true; // Optional: for performance, might turn off
                    scene.add(parkingLight);

                    // Add a simple fixture mesh
                    const fixtureGeo = new THREE.BoxGeometry(1.2, 0.15, 0.25); // Fluorescent light like
                    const fixtureMat = new THREE.MeshStandardMaterial({color: 0xffffff,  emissive: 1, emissiveIntensity: 100}); // Slightly glowing
                    const fixture = new THREE.Mesh(fixtureGeo, fixtureMat);
                    fixture.position.set(lx, lightYPos + 0.1, lz); // Slightly below ceiling
                    scene.add(fixture);
                }
            }
        } else { // --- Office Floor Generation (i >= 0) ---

            // Floor Plane (Corridor only for office floors)
            const floorGeo = new THREE.PlaneGeometry(SETTINGS.corridorWidth, totalCorridorLength);
            const floor = new THREE.Mesh(floorGeo, floorMaterial);
            floor.name = `Floor ${i}`;
            floor.rotation.x = -Math.PI / 2;
            floor.position.set(SETTINGS.corridorWidth / 2, floorY, totalCorridorLength / 2);
            floor.receiveShadow = true;
            scene.add(floor);
            worldObjects.push(floor);

            // Floor Plane -Z (Corridor only for office floors)
            //const floorGeo = new THREE.PlaneGeometry(SETTINGS.corridorWidth, totalCorridorLength);
            const floorB = new THREE.Mesh(floorGeo, floorMaterial);
            floorB.name = `Floor B ${i}`;
            floorB.rotation.x = -Math.PI / 2;
            floorB.position.set(SETTINGS.corridorWidth / 2, floorY, -16- totalCorridorLength / 2);
            floorB.receiveShadow = true;
            scene.add(floorB);
            worldObjects.push(floorB);

            // --- Add Connector Floor for Office Floors (between corridor end Z=0 and new shaft front Z=-4) ---
            const connectorFloorGeo = new THREE.BoxGeometry(overallShaftActualWidth, floorDepth, 4); // Adjusted width
            const connectorFloor = new THREE.Mesh(connectorFloorGeo, floorMaterial);
            connectorFloor.name = `ConnectorFloor_F${i}`;
            connectorFloor.position.set(overallShaftActualCenterX, floorY - floorDepth / 2, -2); // Adjusted X
            connectorFloor.receiveShadow = true;
            scene.add(connectorFloor);
            worldObjects.push(connectorFloor);

            const connectorFloorBGeo = new THREE.BoxGeometry(overallShaftActualWidth, floorDepth, 4); // Adjusted width
            const connectorFloorB = new THREE.Mesh(connectorFloorBGeo, floorMaterial);
            connectorFloorB.name = `ConnectorFloorB_F${i}`;
            connectorFloorB.position.set(overallShaftActualCenterX, floorY - floorDepth / 2, -14); // Adjusted X
            connectorFloorB.receiveShadow = true;
            scene.add(connectorFloorB);
            worldObjects.push(connectorFloorB);


            // --- Add two ceiling lamps at each connector floor (x=0 and x=corridorWidth) ---
            [0, SETTINGS.corridorWidth].forEach((lampX, lampIdx) => {
                createStandardLamp(
                    lampX,
                    floorY + SETTINGS.wallHeight - 0.5,
                    -2, // Z position for connector lamps
                    i, // floorIndex
                    `Connector_F${i}_Idx${lampIdx}`, // lampIdSuffix
                    scene, lights, lightBulbMaterial // Pass scene, lights array, and global bulb material
                );
            });

            // Room Partition Walls
            for (let k = 0; k <= SETTINGS.doorsPerSide; k++) {
                const zPosBoundary = k * SETTINGS.corridorSegmentLength;
                const partRGeo = new THREE.BoxGeometry(SETTINGS.roomSize+(wallDepth*0.8), SETTINGS.wallHeight, wallDepth);
                const partR = new THREE.Mesh(partRGeo, wallMaterial);
                partR.position.set(-SETTINGS.roomSize / 2, floorY + SETTINGS.wallHeight / 2, zPosBoundary);
                partR.castShadow = true; partR.receiveShadow = true; scene.add(partR); worldObjects.push(partR);
                partR.name = `RoomPartition_R_F${i}_Z${k}`;

                // B-Wing partition walls
                const partRBGeo = new THREE.BoxGeometry(SETTINGS.roomSize+(wallDepth*0.8), SETTINGS.wallHeight, wallDepth);
                const partRB = new THREE.Mesh(partRBGeo, wallMaterial);
                partRB.position.set(-SETTINGS.roomSize / 2, floorY + SETTINGS.wallHeight / 2, zPosBoundary - 16 - totalCorridorLength);
                partRB.castShadow = true; partRB.receiveShadow = true; scene.add(partRB); worldObjects.push(partRB);
                partRB.name = `RoomPartition_B_R_F${i}_Z${k}`;

                const partLGeo = new THREE.BoxGeometry(SETTINGS.roomSize +(wallDepth*0.8), SETTINGS.wallHeight, wallDepth);
                const partL = new THREE.Mesh(partLGeo, wallMaterial);
                partL.position.set(SETTINGS.corridorWidth + SETTINGS.roomSize / 2, floorY + SETTINGS.wallHeight / 2, zPosBoundary);
                partL.castShadow = true; partL.receiveShadow = true; scene.add(partL); worldObjects.push(partL);
                partL.name = `RoomPartition_L_F${i}_Z${k}`;

                const partLBGeo = new THREE.BoxGeometry(SETTINGS.roomSize +(wallDepth*0.8), SETTINGS.wallHeight, wallDepth);
                const partLB = new THREE.Mesh(partLBGeo, wallMaterial);
                partL.position.set(SETTINGS.corridorWidth + SETTINGS.roomSize / 2, floorY + SETTINGS.wallHeight / 2, zPosBoundary - 16 - totalCorridorLength);
                partLB.castShadow = true; partLB.receiveShadow = true; scene.add(partLB); worldObjects.push(partLB);
                partLB.name = `RoomPartition_B_L_F${i}_Z${k}`;
            }

            // Loop for individual rooms
            for (let j = 0; j < SETTINGS.doorsPerSide; j++) {
                const segmentCenterZ = (j + 0.5) * SETTINGS.corridorSegmentLength;
                const segmentStartZ = j * SETTINGS.corridorSegmentLength;
                const deskWidth = 1.5, deskHeight = 0.75, deskDepth = 0.8;
                const cabinetWidth = 0.5, cabinetHeight = 1.5, cabinetDepth = 0.6;
                const safeWidth = 0.8, safeHeight = 0.8, safeDepth = 0.8;
                const dialRadius = 0.08, dialLength = 0.1;
                const roomCeilingThickness = 0.2; // Thickness for individual room ceilings
                const defaultSafeUserData = () => ({ isCracked: false, dialPresses: 0, dialPressesRequired: Math.floor(Math.random() * 9) + 2, pointsAwarded: false });

                // --- Right Side Room ---
                const roomRXCenter = -SETTINGS.roomSize / 2;
                const isRightRoomRedDoor = (j === redDoorIndex);
                const rFloorGeo = new THREE.BoxGeometry(SETTINGS.roomSize, floorDepth, SETTINGS.corridorSegmentLength);
                const rFloor = new THREE.Mesh(rFloorGeo, floorMaterial);
                rFloor.position.set(roomRXCenter, floorY - floorDepth / 2, segmentCenterZ);
                rFloor.receiveShadow = true; // scene.add(rFloor); worldObjects.push(rFloor); // Will be added to roomContents
                rFloor.name = `RoomFloor_R_F${i}_D${j}`;

                const rCeilingGeo = new THREE.BoxGeometry(SETTINGS.roomSize, roomCeilingThickness, SETTINGS.corridorSegmentLength);
                const rCeiling = new THREE.Mesh(rCeilingGeo, ceilingMaterial); // Use existing ceilingMaterial
                rCeiling.position.set(roomRXCenter, floorY + SETTINGS.wallHeight + roomCeilingThickness / 2, segmentCenterZ);
                rCeiling.castShadow = true; rCeiling.receiveShadow = true;
                rFloor.name = `RoomFloor_R_F${i}_D${j}`;
                
                const deskRGeo = new THREE.BoxGeometry(deskDepth, deskHeight, deskWidth);
                const deskR = new THREE.Mesh(deskRGeo, deskMaterial);
                deskR.rotateY(Math.PI / 2);
                deskR.position.set(-(SETTINGS.roomSize/2), floorY + deskHeight / 2, segmentCenterZ +1.3);
                deskR.castShadow = true; deskR.receiveShadow = true; // scene.add(deskR); worldObjects.push(deskR);
                deskR.name = `Desk_R_F${i}_D${j}`;
                const cabinetRGeo = new THREE.BoxGeometry(cabinetDepth, cabinetHeight, cabinetWidth);
                const cabinetR = new THREE.Mesh(cabinetRGeo, cabinetMaterial);
                cabinetR.position.set(-SETTINGS.roomSize + cabinetDepth / 2, floorY + cabinetHeight / 2, segmentStartZ + cabinetWidth / 2 + 0.1);
                cabinetR.castShadow = true; cabinetR.receiveShadow = true; // scene.add(cabinetR); worldObjects.push(cabinetR);
                cabinetR.name = `Cabinet_R_F${i}_D${j}`;
                // Chair for Right Room
                const chairSeatWidth = 0.5, chairSeatDepth = 0.65, chairSeatHeight = 0.5;
                const chairBackrestHeight = 0.8, chairBackrestThickness = 0.15;
                const backWallZ_R_Chair = segmentCenterZ + SETTINGS.corridorSegmentLength / 2;
                const chairZ_R = 0.1+(deskR.position.z + backWallZ_R_Chair) / 2;
                const chairX_R = -(SETTINGS.roomSize/2);
                const chairY_R = floorY + chairSeatHeight / 2;
                const chairSeat_R = new THREE.Mesh(new THREE.BoxGeometry(chairSeatWidth, chairSeatHeight, chairSeatDepth), deskMaterial);
                chairSeat_R.position.set(chairX_R, chairY_R, chairZ_R); // scene.add(chairSeat_R); worldObjects.push(chairSeat_R);
                const backrest_R = new THREE.Mesh(new THREE.BoxGeometry(chairSeatWidth, chairBackrestHeight, chairBackrestThickness), deskMaterial);
                backrest_R.position.set(chairX_R, chairY_R + chairBackrestHeight / 2, chairZ_R + chairSeatDepth / 2 - chairBackrestThickness / 2);
                // scene.add(backrest_R); worldObjects.push(backrest_R);
                
                const rightRoomContents = new THREE.Group();
                const rightRoomId = `R_F${i}_D${j}`;
                rightRoomContents.name = `RoomContents_${rightRoomId}`;
                rightRoomContents.add(rFloor); worldObjects.push(rFloor); // Add to worldObjects for collision if needed
                rightRoomContents.add(rCeiling); worldObjects.push(rCeiling);
                rightRoomContents.add(deskR); worldObjects.push(deskR);
                rightRoomContents.add(cabinetR); worldObjects.push(cabinetR);
                rightRoomContents.add(chairSeat_R); worldObjects.push(chairSeat_R);
                rightRoomContents.add(backrest_R); worldObjects.push(backrest_R);

                if (isRightRoomRedDoor) {
                    const safeRGeo = new THREE.BoxGeometry(safeDepth, safeHeight, safeWidth);
                    const safeR = new THREE.Mesh(safeRGeo, safeMaterial);
                    safeR.position.set(-SETTINGS.roomSize + safeDepth / 2, floorY + safeHeight / 2, segmentStartZ + SETTINGS.corridorSegmentLength - safeWidth / 2 - 0.1);
                    safeR.castShadow = true; safeR.receiveShadow = true; safeR.name = `Safe_R_F${i}_D${j}`;
                    safeR.userData = defaultSafeUserData(); // scene.add(safeR); worldObjects.push(safeR);
                    rightRoomContents.add(safeR); worldObjects.push(safeR);
                    const dialRGeo = new THREE.ConeGeometry(dialRadius, dialLength, 16);
                    const dialR = new THREE.Mesh(dialRGeo, dialMaterial);
                    dialR.position.set(safeDepth / 2, 0, 0); dialR.rotation.z = -Math.PI / 2;
                    dialR.userData.isSafeDial = true; dialR.name = `Dial_Safe_R_F${i}_D${j}`; safeR.add(dialR);
                }
                const roomLampR = createRoomLamp(roomRXCenter, floorY + SETTINGS.wallHeight - 0.5, segmentCenterZ, i, rightRoomId, lightBulbMaterial);
                rightRoomContents.add(roomLampR); // Add lamp's visual group

                createOuterWallWithWindow(-SETTINGS.roomSize + wallDepth / 2, floorY + SETTINGS.wallHeight / 2, segmentCenterZ, SETTINGS.corridorSegmentLength, SETTINGS.wallHeight, wallDepth, wallMaterial, opaqueGlassMaterial, glassMaterial, rightRoomId);

                rightRoomContents.visible = false;
                scene.add(rightRoomContents);

                allRoomsData.push({
                    id: rightRoomId,
                    door: null, windowGlass: null, opaqueMaterial: null, transparentMaterial: null, contentsGroup: rightRoomContents,
                    visibleByDoor: false, visibleByWindow: false, lamp: roomLampR
                });

                // --- Left Side Room ---
                const roomLXCenter = SETTINGS.corridorWidth + SETTINGS.roomSize / 2;
                const isLeftRoomRedDoor = ((SETTINGS.doorsPerSide + j) === redDoorIndex);
                const lFloorGeo = new THREE.BoxGeometry(SETTINGS.roomSize, floorDepth, SETTINGS.corridorSegmentLength);
                const lFloor = new THREE.Mesh(lFloorGeo, floorMaterial);
                lFloor.position.set(roomLXCenter, floorY - floorDepth / 2, segmentCenterZ);
                lFloor.receiveShadow = true; // scene.add(lFloor); worldObjects.push(lFloor);
                lFloor.name = `RoomFloor_L_F${i}_D${j}`;

                const lCeilingGeo = new THREE.BoxGeometry(SETTINGS.roomSize, roomCeilingThickness, SETTINGS.corridorSegmentLength);
                const lCeiling = new THREE.Mesh(lCeilingGeo, ceilingMaterial);
                lCeiling.position.set(roomLXCenter, floorY + SETTINGS.wallHeight + roomCeilingThickness / 2, segmentCenterZ);
                lCeiling.castShadow = true; lCeiling.receiveShadow = true;
                lFloor.name = `RoomFloor_L_F${i}_D${j}`;
                
                const deskLGeo = new THREE.BoxGeometry(deskDepth, deskHeight, deskWidth);
                const deskL = new THREE.Mesh(deskLGeo, deskMaterial);
                deskL.rotateY(Math.PI / 2);
                deskL.position.set(SETTINGS.corridorWidth + (SETTINGS.roomSize/2), floorY + deskHeight / 2, segmentCenterZ +1.3);
                deskL.castShadow = true; deskL.receiveShadow = true; // scene.add(deskL); worldObjects.push(deskL);
                deskL.name = `Desk_L_F${i}_D${j}`;
                const cabinetLGeo = new THREE.BoxGeometry(cabinetDepth, cabinetHeight, cabinetWidth);
                const cabinetL = new THREE.Mesh(cabinetLGeo, cabinetMaterial);
                cabinetL.position.set(SETTINGS.corridorWidth + SETTINGS.roomSize - cabinetDepth / 2, floorY + cabinetHeight / 2, segmentStartZ + cabinetWidth / 2 + 0.1);
                cabinetL.castShadow = true; cabinetL.receiveShadow = true; // scene.add(cabinetL); worldObjects.push(cabinetL);
                cabinetL.name = `Cabinet_L_F${i}_D${j}`;
                // Chair for Left Room
                const backWallZ_L_Chair = segmentCenterZ + SETTINGS.corridorSegmentLength / 2;
                const chairZ_L = 0.15 + (deskL.position.z + backWallZ_L_Chair) / 2;
                const chairX_L = SETTINGS.corridorWidth + (SETTINGS.roomSize/2);
                const chairY_L = floorY + chairSeatHeight / 2;
                const chairSeat_L = new THREE.Mesh(new THREE.BoxGeometry(chairSeatWidth, chairSeatHeight, chairSeatDepth), deskMaterial);
                chairSeat_L.position.set(chairX_L, chairY_L, chairZ_L); // scene.add(chairSeat_L); worldObjects.push(chairSeat_L);
                const backrest_L = new THREE.Mesh(new THREE.BoxGeometry(chairSeatWidth, chairBackrestHeight, chairBackrestThickness), deskMaterial);
                backrest_L.position.set(chairX_L, chairY_L + chairBackrestHeight / 2, chairZ_L + chairSeatDepth / 2 - chairBackrestThickness / 2);
                // scene.add(backrest_L); worldObjects.push(backrest_L);

                const leftRoomContents = new THREE.Group();
                const leftRoomId = `L_F${i}_D${j}`;
                leftRoomContents.name = `RoomContents_${leftRoomId}`;
                leftRoomContents.add(lFloor); worldObjects.push(lFloor);
                leftRoomContents.add(lCeiling); worldObjects.push(lCeiling);
                leftRoomContents.add(deskL); worldObjects.push(deskL);
                leftRoomContents.add(cabinetL); worldObjects.push(cabinetL);
                leftRoomContents.add(chairSeat_L); worldObjects.push(chairSeat_L);
                leftRoomContents.add(backrest_L); worldObjects.push(backrest_L);

                if (isLeftRoomRedDoor) {
                    const safeLGeo = new THREE.BoxGeometry(safeDepth, safeHeight, safeWidth);
                    const safeL = new THREE.Mesh(safeLGeo, safeMaterial);
                    safeL.position.set(SETTINGS.corridorWidth + SETTINGS.roomSize - safeDepth / 2, floorY + safeHeight / 2, segmentStartZ + SETTINGS.corridorSegmentLength - safeWidth / 2 - 0.1);
                    safeL.castShadow = true; safeL.receiveShadow = true; safeL.name = `Safe_L_F${i}_D${j}`;
                    safeL.userData = defaultSafeUserData(); // scene.add(safeL); worldObjects.push(safeL);
                    leftRoomContents.add(safeL); worldObjects.push(safeL);
                    const dialLGeo = new THREE.ConeGeometry(dialRadius, dialLength, 16);
                    const dialL = new THREE.Mesh(dialLGeo, dialMaterial);
                    dialL.position.set(-safeDepth / 2, 0, 0); dialL.rotation.z = Math.PI / 2;
                    dialL.userData.isSafeDial = true; dialL.name = `Dial_Safe_L_F${i}_D${j}`; safeL.add(dialL);
                }
                const roomLampL = createRoomLamp(roomLXCenter, floorY + SETTINGS.wallHeight - 0.5, segmentCenterZ, i, leftRoomId, lightBulbMaterial);
                leftRoomContents.add(roomLampL);

                createOuterWallWithWindow(SETTINGS.corridorWidth + SETTINGS.roomSize - wallDepth / 2, floorY + SETTINGS.wallHeight / 2, segmentCenterZ, SETTINGS.corridorSegmentLength, SETTINGS.wallHeight, wallDepth, wallMaterial, opaqueGlassMaterial, glassMaterial, leftRoomId);
                leftRoomContents.visible = false;
                scene.add(leftRoomContents);
                allRoomsData.push({ // Ensure new properties are initialized
                    id: leftRoomId, door: null, windowGlass: null, opaqueMaterial: null, transparentMaterial: null, contentsGroup: leftRoomContents,
                    visibleByDoor: false, visibleByWindow: false, lamp: roomLampL
                });
            }

            // Corridor Ceiling Plane
            const ceilingGeo = new THREE.PlaneGeometry(SETTINGS.corridorWidth, totalCorridorLength);
            const ceiling = new THREE.Mesh(ceilingGeo, ceilingMaterial);
            ceiling.rotation.x = Math.PI / 2;
            ceiling.position.set(SETTINGS.corridorWidth / 2, floorY + SETTINGS.wallHeight, totalCorridorLength / 2);
            ceiling.castShadow = true;
            scene.add(ceiling);
            worldObjects.push(ceiling);

            // Corridor Walls & Doors (Right Wall Segments, Left Wall Segments)
            // ... (This existing logic for walls and doors along the corridor remains here)
            // Right Wall Segments (Positive X direction)
            for (let j = 0; j < SETTINGS.doorsPerSide; j++) {
                const segmentZ = (j + 0.5) * SETTINGS.corridorSegmentLength;
                const wall1Geo = new THREE.BoxGeometry(wallDepth, SETTINGS.wallHeight, doorOffset);
                const wall1 = new THREE.Mesh(wall1Geo, wallMaterial);
                wall1.position.set(0, floorY + SETTINGS.wallHeight / 2, segmentZ - SETTINGS.corridorSegmentLength / 2 + doorOffset / 2);
                wall1.castShadow = true; wall1.receiveShadow = true; scene.add(wall1); worldObjects.push(wall1);
                const isRed = currentDoorIndex === redDoorIndex;
                const doorMaterialToUse = isRed ? redDoorMaterial : blackDoorMaterial;
                const doorGeo = new THREE.BoxGeometry(SETTINGS.doorDepth, SETTINGS.doorHeight, SETTINGS.doorWidth);
                doorGeo.translate(0, 0, SETTINGS.doorWidth/2);
                const door = new THREE.Mesh(doorGeo, doorMaterialToUse);
                const doorXPosR = 0; // Right side doors are at X=0
                door.position.set(doorXPosR, floorY + SETTINGS.doorHeight/2, segmentZ - SETTINGS.doorWidth/2);
                door.castShadow = true; door.userData = { type: 'door', floor: i, isRed: isRed, locked: (Math.random() < 0.3), isOpen: false };
                const doorRoomIdR = `R_F${i}_D${j}`; // Associate with the correct room ID
                door.userData.roomId = doorRoomIdR;
                const roomDataR = allRoomsData.find(r => r.id === doorRoomIdR);
                if (roomDataR) roomDataR.door = door;
                door.name = `${i + 1}${String(currentDoorIndex + 1).padStart(2, '0')}`;
                scene.add(door); doors.push(door); worldObjects.push(door);
                const knobGeometry = new THREE.SphereGeometry(0.06, 8, 6);
                const knobMaterial = new THREE.MeshStandardMaterial({ color: 0xffffff, metalness: 0.8, roughness: 0.1 });
                const knob = new THREE.Mesh(knobGeometry, knobMaterial);
                knob.position.set(SETTINGS.doorDepth/2 + 0.05, 0, SETTINGS.doorWidth - 0.15);
                knob.userData.doorKnob = true; door.add(knob); door.userData.knob = knob;
                const knob2 = new THREE.Mesh(knobGeometry, knobMaterial);
                knob2.position.set(-SETTINGS.doorDepth/2 - 0.05, 0, SETTINGS.doorWidth - 0.15);
                knob2.userData.doorKnob = true; door.add(knob2); door.userData.knob2 = knob2;
                const wallAboveGeo = new THREE.BoxGeometry(wallDepth, SETTINGS.wallHeight - SETTINGS.doorHeight, SETTINGS.doorWidth);
                const wallAbove = new THREE.Mesh(wallAboveGeo, wallMaterial);
                wallAbove.position.set(0, floorY + SETTINGS.doorHeight + (SETTINGS.wallHeight - SETTINGS.doorHeight) / 2, segmentZ);
                wallAbove.castShadow = true; wallAbove.receiveShadow = true; scene.add(wallAbove); worldObjects.push(wallAbove);
                const wall2Geo = new THREE.BoxGeometry(wallDepth, SETTINGS.wallHeight, doorOffset);
                const wall2 = new THREE.Mesh(wall2Geo, wallMaterial);
                wall2.position.set(0, floorY + SETTINGS.wallHeight / 2, segmentZ + SETTINGS.doorWidth / 2 + doorOffset / 2);
                wall2.castShadow = true; wall2.receiveShadow = true; scene.add(wall2); worldObjects.push(wall2);
                currentDoorIndex++;
            }
            // Left Wall Segments
            const LeftWallX = SETTINGS.corridorWidth;
            for (let j = 0; j < SETTINGS.doorsPerSide; j++) {
                const segmentZ = (j + 0.5) * SETTINGS.corridorSegmentLength;
                const wall1Geo = new THREE.BoxGeometry(wallDepth, SETTINGS.wallHeight, doorOffset);
                const wall1 = new THREE.Mesh(wall1Geo, wallMaterial);
                wall1.position.set(LeftWallX, floorY + SETTINGS.wallHeight / 2, segmentZ - SETTINGS.corridorSegmentLength / 2 + doorOffset / 2);
                wall1.castShadow = true; wall1.receiveShadow = true; scene.add(wall1); worldObjects.push(wall1);
                const isRed = currentDoorIndex === redDoorIndex;
                const doorMaterialToUse = isRed ? redDoorMaterial : blackDoorMaterial;
                const doorGeo = new THREE.BoxGeometry(SETTINGS.doorDepth, SETTINGS.doorHeight, SETTINGS.doorWidth);
                doorGeo.translate(0, 0, SETTINGS.doorWidth/2);
                const door = new THREE.Mesh(doorGeo, doorMaterialToUse);
                const doorXPosL = LeftWallX; // Left side doors
                door.position.set(doorXPosL, floorY + SETTINGS.doorHeight/2, segmentZ - SETTINGS.doorWidth/2);
                door.castShadow = true; door.userData = { type: 'door', floor: i, isRed: isRed, locked: (Math.random() < 0.3), isOpen: false };
                const doorRoomIdL = `L_F${i}_D${j}`; // Associate with the correct room ID
                door.userData.roomId = doorRoomIdL;
                const roomDataL = allRoomsData.find(r => r.id === doorRoomIdL);
                if (roomDataL) roomDataL.door = door;
                door.name = `${i + 1}${String(currentDoorIndex + 1).padStart(2, '0')}`;
                scene.add(door); doors.push(door); worldObjects.push(door);
                const knobGeometry = new THREE.SphereGeometry(0.06, 8, 6);
                const knobMaterial = new THREE.MeshStandardMaterial({ color: 0xffffff, metalness: 0.8, roughness: 0.1});
                const knob = new THREE.Mesh(knobGeometry, knobMaterial);
                knob.position.set(SETTINGS.doorDepth/2 + 0.05, 0, SETTINGS.doorWidth - 0.15);
                knob.userData.doorKnob = true; door.add(knob); door.userData.knob = knob;
                const knob2 = new THREE.Mesh(knobGeometry, knobMaterial);
                knob2.position.set(-SETTINGS.doorDepth/2 - 0.05, 0, SETTINGS.doorWidth - 0.15);
                knob2.userData.doorKnob = true; door.add(knob2); door.userData.knob2 = knob2;
                const wallAboveGeo = new THREE.BoxGeometry(wallDepth, SETTINGS.wallHeight - SETTINGS.doorHeight, SETTINGS.doorWidth);
                const wallAbove = new THREE.Mesh(wallAboveGeo, wallMaterial);
                wallAbove.position.set(LeftWallX, floorY + SETTINGS.doorHeight + (SETTINGS.wallHeight - SETTINGS.doorHeight) / 2, segmentZ);
                wallAbove.castShadow = true; wallAbove.receiveShadow = true; scene.add(wallAbove); worldObjects.push(wallAbove);
                const wall2Geo = new THREE.BoxGeometry(wallDepth, SETTINGS.wallHeight, doorOffset);
                const wall2 = new THREE.Mesh(wall2Geo, wallMaterial);
                wall2.position.set(LeftWallX, floorY + SETTINGS.wallHeight / 2, segmentZ + SETTINGS.doorWidth / 2 + doorOffset / 2);
                wall2.castShadow = true; wall2.receiveShadow = true; scene.add(wall2); worldObjects.push(wall2);
                currentDoorIndex++;
            }

            // Corridor Ceiling Lights
            for (let j = 0; j < SETTINGS.doorsPerSide; j++) {
                const segmentZ = (j + 0.5) * SETTINGS.corridorSegmentLength;
                createStandardLamp(
                    SETTINGS.corridorWidth / 2,
                    floorY + SETTINGS.wallHeight - 0.5,
                    segmentZ,
                    i, // floorIndex
                    `${i + 1}${String(j + 1).padStart(2, '0')}`, // lampIdSuffix, e.g., "101", "102"
                    scene, lights, lightBulbMaterial
                );
            }

            // Escalator Bridge Ceiling Lights
            const escLightPositions = [totalCorridorLength + 4, totalCorridorLength + 4 + (escalatorLength)];
            escLightPositions.forEach((zPos, idx) => {
                // escalator bridge light creation logic
                const lightGeo = new THREE.ConeGeometry(0.3, 0.2, 16);
                createStandardLamp(
                    SETTINGS.corridorWidth / 2,
                    floorY + SETTINGS.wallHeight - 0.5,
                    zPos,
                    i, // floorIndex
                    `EscBridge_F${i}_Idx${idx + 1}`, // lampIdSuffix
                    scene, lights, lightBulbMaterial
                );
            });

            // Far end wall for office floors (at end of escalator area)
            const endWallEscGeo = new THREE.BoxGeometry(SETTINGS.corridorWidth + (2 * escalatorWidth), SETTINGS.floorHeight, wallDepth);
            const endWallFar = new THREE.Mesh(endWallEscGeo, wallMaterial);
            endWallFar.position.set(SETTINGS.corridorWidth / 2, floorY + SETTINGS.wallHeight / 2, totalCorridorLength + 4 + escalatorLength + 4);
            endWallFar.name = `Escalator Back Wall ${i}`;
            endWallFar.castShadow = true; endWallFar.receiveShadow = true;
            scene.add(endWallFar);
            worldObjects.push(endWallFar);

            // --- Walls around Escalator Area for Office Floors ---
            // Right Wall next to escalator (Positive Z direction)
            const wallR2Geo = new THREE.BoxGeometry(wallDepth, SETTINGS.floorHeight, escalatorLength + 8);
            const wallR2 = new THREE.Mesh(wallR2Geo, wallMaterial);
            wallR2.name = `Escalator RHS Wall ${i}`;
            wallR2.position.set(-escalatorWidth, floorY + SETTINGS.wallHeight / 2, totalCorridorLength + (escalatorLength/2) + 4);
            wallR2.castShadow = true; wallR2.receiveShadow = true;
            scene.add(wallR2); worldObjects.push(wallR2);

            // Right Corner Wall next to escalator (Negative X direction)
            const wallRCornerGeo = new THREE.BoxGeometry(escalatorWidth + wallDepth, SETTINGS.floorHeight, wallDepth);
            const wallRCorner = new THREE.Mesh(wallRCornerGeo, wallMaterial);
            wallRCorner.name = `Escalator RHS Corner Wall ${i}`;
            wallRCorner.position.set(-escalatorWidth/2, floorY + SETTINGS.wallHeight / 2, totalCorridorLength);
            wallRCorner.castShadow = true; wallRCorner.receiveShadow = true;
            scene.add(wallRCorner); worldObjects.push(wallRCorner);

            // Left Wall next to escalator (Positive Z direction)
            const LeftWallXEsc = SETTINGS.corridorWidth; // Re-scope for clarity if needed
            const wallL3Geo = new THREE.BoxGeometry(wallDepth, SETTINGS.floorHeight, escalatorLength + 8);
            const wallL3 = new THREE.Mesh(wallL3Geo, wallMaterial);
            wallL3.name = `Escalator Left Wall ${i}`;
            wallL3.position.set(LeftWallXEsc + escalatorWidth, floorY + SETTINGS.wallHeight / 2, totalCorridorLength + (escalatorLength/2) + 4);
            wallL3.castShadow = true; wallL3.receiveShadow = true;
            scene.add(wallL3); worldObjects.push(wallL3);
            
            // Left Corner Wall next to escalator (Negative X direction)
            const wallLCornerGeo = new THREE.BoxGeometry(escalatorWidth + wallDepth, SETTINGS.floorHeight, wallDepth);
            const wallLCorner = new THREE.Mesh(wallLCornerGeo, wallMaterial);
            wallLCorner.name = `Escalator LHS Corner Wall ${i}`; // Corrected name
            wallLCorner.position.set(LeftWallXEsc + escalatorWidth/2, floorY + SETTINGS.wallHeight / 2, totalCorridorLength);
            wallLCorner.castShadow = true; wallLCorner.receiveShadow = true;
            scene.add(wallLCorner); worldObjects.push(wallLCorner);





        } // End of Office Floor Generation (i >= 0)

        // --- Common elements for ALL floors (basement and above-ground) ---
        // Define the top surface Y for the current and lower floors (used by balustrades)
        const currentFloorTopY = floorY;
        const lowerFloorTopY = (i - 1) * SETTINGS.floorHeight;

        // Escalator Area Floor Slabs & Lights (conditionally generated)
        const needsEscalatorPlatformsThisFloor =
            (i > 0 && i < SETTINGS.numFloors) || // Escalator starts/passes *down* from this floor i (e.g. floor 1 down to 0)
            ((i + 1) > 0 && (i + 1) < SETTINGS.numFloors); // Escalator starts/passes *down* from floor i+1 (meaning it arrives at or passes floor i from above)

        if (needsEscalatorPlatformsThisFloor) {
            // Escalator Floor Start
            const floorEsc1Geo = new THREE.BoxGeometry(SETTINGS.corridorWidth + (escalatorWidth * 2), floorDepth, 4 - 1);
            const floor1Esc = new THREE.Mesh(floorEsc1Geo, floorMaterial); // Use standard floorMaterial
            floor1Esc.name = `Escalator Floor Start ${i}`;
            floor1Esc.position.set(SETTINGS.corridorWidth / 2, floorY - floorDepth / 2, totalCorridorLength  + 1.5);
            floor1Esc.receiveShadow = true; scene.add(floor1Esc); worldObjects.push(floor1Esc);

            const escStartZ = floor1Esc.position.z;
            const escLightY = floorY + SETTINGS.wallHeight - 0.5;
            const escLightXs = [-escalatorWidth/2, SETTINGS.corridorWidth + (escalatorWidth/2)];
            escLightXs.forEach((xPos, idx) => {
                createStandardLamp(
                    xPos,
                    escLightY,
                    escStartZ,
                    i, // floorIndex
                    `EscStart_F${i}_Idx${idx + 1}`, // lampIdSuffix
                    scene, lights, lightBulbMaterial
                );
            });

            // Escalator Floor bridge
            const bridge2EscGeo = new THREE.BoxGeometry(SETTINGS.corridorWidth, floorDepth, escalatorLength + 3);
            const bridge2Esc = new THREE.Mesh(bridge2EscGeo, floorMaterial); // Use standard floorMaterial
            bridge2Esc.name = `Escalator Floor Bridge ${i}`;
            bridge2Esc.position.set(SETTINGS.corridorWidth / 2, floorY - floorDepth / 2, totalCorridorLength + 4 +(escalatorLength / 2) + 0.5);
            bridge2Esc.receiveShadow = true; scene.add(bridge2Esc); worldObjects.push(bridge2Esc);

            // Escalator Floor End
            const floorEsc2Geo = new THREE.BoxGeometry(SETTINGS.corridorWidth + (escalatorWidth * 2), floorDepth, 4-1);
            const floor2Esc = new THREE.Mesh(floorEsc2Geo, floorMaterial); // Use standard floorMaterial
            floor2Esc.name = `Escalator Floor End ${i}`;
            floor2Esc.position.set(SETTINGS.corridorWidth / 2, floorY - floorDepth / 2, totalCorridorLength + 4 + escalatorLength + 2.5);
            floor2Esc.receiveShadow = true; scene.add(floor2Esc); worldObjects.push(floor2Esc);

            const escEndZ = floor2Esc.position.z;
            escLightXs.forEach((xPos, idx) => {
                createStandardLamp(
                    xPos,
                    escLightY,
                    escEndZ,
                    i, // floorIndex
                    `EscEnd_F${i}_Idx${idx + 1}`, // lampIdSuffix
                    scene, lights, lightBulbMaterial
                );
            });
        }

        // --- Escalator Steps (replace ramps with steps) ---
        // Only add steps if not on the ground floor
        if (i > -SETTINGS.numBasementFloors && i <= SETTINGS.numFloors -1 ) { // Allow escalators from ground to basement, and between above-ground floors
            // Parameters for steps
            const stepHeight = 0.4; // Height of each step
            const stepDepth = 1;
            const stepCount = Math.ceil(1 + (SETTINGS.floorHeight / stepHeight));
            const stepWidth = SETTINGS.escalatorWidth;

            // Balustrade settings
            const balustradeHeight = 1.7; // Height of the balustrade
            const balustradeThickness = 0.1;
            const balustradeMaterial = new THREE.MeshStandardMaterial({ color: 0x999999, metalness: 0.8, roughness: 0.2  }); // Gray material
            
            // Skip escalator generation if this is the absolute lowest basement floor (can't go further down)
            // or if it's the highest floor (can't go further up with these escalators)
            // This specific condition `if (i > 0)` was for escalators connecting floor 1 to 0, 2 to 1 etc.
            // We want escalators only between above-ground floors (e.g., floor 1 to 0, floor 2 to 1).
            if (i > 0 && i < SETTINGS.numFloors) { // Create escalators connecting floor i (e.g. 1) down to floor i-1 (e.g. 0)

            // --- Left  side Escalator down Starting Point (RED) ---
            const startEscDownGeo = new THREE.BoxGeometry(escalatorWidth, floorDepth, 1); // <-- Add this line
            const startEscDown = new THREE.Mesh(startEscDownGeo, EscalatorEmbarkMaterial);
            startEscDown.name = `Left Escalator Down Start ${i}`;
            //start1Esc.rotation.x = -Math.PI / 2;
            startEscDown.position.set(
                SETTINGS.corridorWidth + (escalatorWidth / 2) + 0.1,
                floorY -(floorDepth/2), // So the top is at floorY
                totalCorridorLength  + 3.5
            );
            startEscDown.receiveShadow = true;
            scene.add(startEscDown);
            worldObjects.push(startEscDown);
            
            // Track startEscDown for this floor
            escalatorStarts.down[i] = startEscDown;
            // Track stepDown for this floor
            escalatorSteps.down[i] = [];

            // --- Steps DOWN (LEFT side) ---
            for (let s = 0; s < stepCount; s++) {
                const y = floorY -.01 - (s + 1) * stepHeight + stepHeight / 2;
                const z = totalCorridorLength + 4.3 + (s / stepCount) * SETTINGS.escalatorLength;
                const stepGeo = new THREE.BoxGeometry(stepWidth, stepHeight, stepDepth);
                const stepDown = new THREE.Mesh(stepGeo, EscalatorMaterial);
                stepDown.position.set(
                    SETTINGS.corridorWidth + (stepWidth / 2) + 0.1,
                    y,
                    z
                );
                stepDown.castShadow = true;
                stepDown.receiveShadow = true;
                stepDown.name = `Left Escalator Step Down ${i}-${s}`;
                scene.add(stepDown);
                worldObjects.push(stepDown);
                escalatorSteps.down[i].push(stepDown); // Track stepDown
            }

            // Escalator Down on lower floor Ending Point (Left side    )    
            const endEscDownGeo = new THREE.BoxGeometry(escalatorWidth, floorDepth, 1);
            
            const endEscDown = new THREE.Mesh(endEscDownGeo, EscalatorMaterial);
            endEscDown.name = `Left Escalator Down End ${i}`;
            //start1Esc.rotation.x = -Math.PI / 2;
            endEscDown.position.set(
                SETTINGS.corridorWidth + (escalatorWidth / 2) + 0.1,
                floorY - SETTINGS.floorHeight -(floorDepth/2), // So the top is at previous floorY
                totalCorridorLength + escalatorLength + 4 + 0.5
            );
            endEscDown.receiveShadow = true;
            scene.add(endEscDown);
            worldObjects.push(endEscDown);
            // NEW: Store the end mesh for later reset
            escalatorEnds.down[i] = endEscDown;


            // --- End of Left side Escalator Down on lower floor Ending Point --- ///

            // --- Right side Escalator going Up on Lower floor Starting Point (RED) ---

            const startEscUpGeo = new THREE.BoxGeometry(escalatorWidth, floorDepth, 1);
            const startEscUp = new THREE.Mesh(startEscUpGeo, EscalatorEmbarkMaterial);
            startEscUp.name = `Right Escalator Up Start ${i}`;
            //start1Esc.rotation.x = -Math.PI / 2;
            startEscUp.position.set(
                -0.1 - (escalatorWidth / 2),
                floorY - SETTINGS.floorHeight -(floorDepth/2), // So the top is at floorY
                totalCorridorLength + escalatorLength + 4 + 0.5
            );
            startEscUp.receiveShadow = true;
            scene.add(startEscUp);
            worldObjects.push(startEscUp);
        
            // Track startEscUp for this floor
            escalatorStarts.up[i] = startEscUp;
            // Track stepUp for this floor
            escalatorSteps.up[i] = [];

            // --- Steps UP (RIGHT side) ---
            for (let s = 0; s < stepCount; s++) {
                //const y = floorY - (stepCount - s) * stepHeight + stepHeight / 2;
                const y = floorY + 0.01 - (s + 1) * stepHeight + stepHeight / 2;
                const z = totalCorridorLength + 4.3 + (s / stepCount) * SETTINGS.escalatorLength;
                const stepGeo = new THREE.BoxGeometry(stepWidth, stepHeight, stepDepth);
                const stepUp = new THREE.Mesh(stepGeo, EscalatorMaterial);
                stepUp.position.set(
                    -0.1 - (stepWidth / 2),
                    y,
                    z
                );
                stepUp.castShadow = true;
                stepUp.receiveShadow = true;
                stepUp.name = `Right Escalator Step Up ${i}-${s}`;
                scene.add(stepUp);
                worldObjects.push(stepUp);
                escalatorSteps.up[i].push(stepUp); // Track stepUp
            }

            // Escalator Up from lower floor Ending Point    
            const endEscUpGeo = new THREE.BoxGeometry(escalatorWidth, floorDepth, 1);
            const endEscUp = new THREE.Mesh(endEscUpGeo, EscalatorMaterial);
            endEscUp.name = `Right Escalator Up End ${i}`;
            //start1Esc.rotation.x = -Math.PI / 2;
            endEscUp.position.set(
                -0.1 - (escalatorWidth / 2),
                floorY -(floorDepth/3) -0.08 , // So the top is at floorY
                totalCorridorLength  + 3.5
            );
            endEscUp.receiveShadow = true;
            scene.add(endEscUp);
            worldObjects.push(endEscUp);
            // NEW: Store a translated clone of the end mesh for up steps
            const translatedEndEscUp = endEscUp.clone();
            translatedEndEscUp.position.y += 0.2;
            translatedEndEscUp.position.z += 0.3;
            escalatorEnds.up[i] = translatedEndEscUp;
            // End of Right side escalator Ramp going up from lower floor////

            // --- Add Balustrades --- ///////////////////////////////////////////////////

            // Balustrades for Escalator UP (Left side, X from -escalatorWidth to 0)
            const startUpBalustrade = new THREE.Vector3(-SETTINGS.escalatorWidth / 2, lowerFloorTopY-floorDepth, totalCorridorLength + SETTINGS.escalatorLength + 4 );
            const endUpBalustrade = new THREE.Vector3(-SETTINGS.escalatorWidth / 2, currentFloorTopY-floorDepth/2, totalCorridorLength + 3.5);
            const dirUpBalustrade = new THREE.Vector3().subVectors(endUpBalustrade, startUpBalustrade);
            const lengthUpBalustrade = dirUpBalustrade.length();
            const centerPosUpBalustrade = new THREE.Vector3().addVectors(startUpBalustrade, endUpBalustrade).multiplyScalar(0.5);

            // Calculate the Y position of the ramp surface at the center Z for UP escalator
            const centerZ_UpBalustrade = centerPosUpBalustrade.z;
            const rampSurfaceY_at_centerZ_Up = startUpBalustrade.y + (centerZ_UpBalustrade - startUpBalustrade.z) / (endUpBalustrade.z - startUpBalustrade.z) * (endUpBalustrade.y - startUpBalustrade.y);
            const balustradeCenterY_Up = rampSurfaceY_at_centerZ_Up + balustradeHeight / 2;

            // Inner balustrade (closer to corridor, X=0)
            const innerBalustradeUpGeo = new THREE.BoxGeometry(balustradeThickness, balustradeHeight, lengthUpBalustrade);
            const innerBalustradeUp = new THREE.Mesh(innerBalustradeUpGeo, balustradeMaterial);
            innerBalustradeUp.name = `Balustrade_Up_Inner_F${i-1}-F${i}`;
            innerBalustradeUp.position.set(0 - balustradeThickness / 2, balustradeCenterY_Up, centerPosUpBalustrade.z);
            innerBalustradeUp.lookAt(innerBalustradeUp.position.clone().add(dirUpBalustrade));
            scene.add(innerBalustradeUp);
            worldObjects.push(innerBalustradeUp);

            // Outer balustrade (X=-escalatorWidth)
            const outerBalustradeUpGeo = new THREE.BoxGeometry(balustradeThickness, balustradeHeight, lengthUpBalustrade);
            const outerBalustradeUp = new THREE.Mesh(outerBalustradeUpGeo, balustradeMaterial);
            outerBalustradeUp.name = `Balustrade_Up_Outer_F${i-1}-F${i}`;
            outerBalustradeUp.position.set(-SETTINGS.escalatorWidth + balustradeThickness / 2, balustradeCenterY_Up, centerPosUpBalustrade.z);
            outerBalustradeUp.lookAt(outerBalustradeUp.position.clone().add(dirUpBalustrade));
            scene.add(outerBalustradeUp);
            worldObjects.push(outerBalustradeUp);

            // Add cylinders for escalator UP balustrades (posts at end sides)
            {
                // Create a cylinder with diameter = balustradeHeight and height = balustradeThickness.
                const cylinderGeo = new THREE.CylinderGeometry(balustradeHeight/2, balustradeHeight/2, balustradeThickness, 16);
                cylinderGeo.rotateZ(Math.PI/2);
                // up direction along the balustrade (use already computed startUpBalustrade and endUpBalustrade)
                const upDir = new THREE.Vector3().subVectors(endUpBalustrade, startUpBalustrade).normalize();
                const halfLengthUp = lengthUpBalustrade / 2;
                // For inner balustrade UP: compute endpoint centers from innerBalustradeUp.position (which is center of the box)
                const innerCenter = innerBalustradeUp.position.clone();
                const innerEnd1 = innerCenter.clone().sub(upDir.clone().multiplyScalar(halfLengthUp));
                const innerEnd2 = innerCenter.clone().add(upDir.clone().multiplyScalar(halfLengthUp));
                const cylinderInner1 = new THREE.Mesh(cylinderGeo, balustradeMaterial);
                cylinderInner1.position.copy(innerEnd1);
                const cylinderInner2 = new THREE.Mesh(cylinderGeo, balustradeMaterial);
                cylinderInner2.position.copy(innerEnd2);
                // For outer balustrade UP:
                const outerCenter = outerBalustradeUp.position.clone();
                const outerEnd1 = outerCenter.clone().sub(upDir.clone().multiplyScalar(halfLengthUp));
                const outerEnd2 = outerCenter.clone().add(upDir.clone().multiplyScalar(halfLengthUp));
                const cylinderOuter1 = new THREE.Mesh(cylinderGeo, balustradeMaterial);
                cylinderOuter1.position.copy(outerEnd1);
                const cylinderOuter2 = new THREE.Mesh(cylinderGeo, balustradeMaterial);
                cylinderOuter2.position.copy(outerEnd2);
                scene.add(cylinderInner1, cylinderInner2, cylinderOuter1, cylinderOuter2);
            }

            // Balustrades for Escalator DOWN (Right side, X from SETTINGS.corridorWidth to SETTINGS.corridorWidth + escalatorWidth)
            const startDownBalustrade = new THREE.Vector3(SETTINGS.corridorWidth + SETTINGS.escalatorWidth / 2, currentFloorTopY-floorDepth/2, totalCorridorLength + 3.5);
            const endDownBalustrade = new THREE.Vector3(SETTINGS.corridorWidth + SETTINGS.escalatorWidth / 2, lowerFloorTopY-floorDepth, totalCorridorLength + SETTINGS.escalatorLength + 4 );
            const dirDownBalustrade = new THREE.Vector3().subVectors(endDownBalustrade, startDownBalustrade);
            const lengthDownBalustrade = dirDownBalustrade.length();
            const centerPosDownBalustrade = new THREE.Vector3().addVectors(startDownBalustrade, endDownBalustrade).multiplyScalar(0.5);

            // Calculate the Y position of the ramp surface at the center Z for DOWN escalator
            const centerZ_DownBalustrade = centerPosDownBalustrade.z;
            const rampSurfaceY_at_centerZ_Down = startDownBalustrade.y + (centerZ_DownBalustrade - startDownBalustrade.z) / (endDownBalustrade.z - startDownBalustrade.z) * (endDownBalustrade.y - startDownBalustrade.y);
            const balustradeCenterY_Down = rampSurfaceY_at_centerZ_Down + balustradeHeight / 2;

            // Inner balustrade (closer to corridor, X=SETTINGS.corridorWidth)
            const innerBalustradeDownGeo = new THREE.BoxGeometry(balustradeThickness, balustradeHeight, lengthDownBalustrade);
            const innerBalustradeDown = new THREE.Mesh(innerBalustradeDownGeo, balustradeMaterial);
            innerBalustradeDown.name = `Balustrade_Down_Inner_F${i}-F${i-1}`;
            innerBalustradeDown.position.set(SETTINGS.corridorWidth + balustradeThickness / 2, balustradeCenterY_Down, centerPosDownBalustrade.z);
            innerBalustradeDown.lookAt(innerBalustradeDown.position.clone().add(dirDownBalustrade));
            scene.add(innerBalustradeDown);
            worldObjects.push(innerBalustradeDown);

            // Outer balustrade (X=SETTINGS.corridorWidth + escalatorWidth)
            const outerBalustradeDownGeo = new THREE.BoxGeometry(balustradeThickness, balustradeHeight, lengthDownBalustrade);
            const outerBalustradeDown = new THREE.Mesh(outerBalustradeDownGeo, balustradeMaterial);
            outerBalustradeDown.name = `Balustrade_Down_Outer_F${i}-F${i-1}`;
            outerBalustradeDown.position.set(SETTINGS.corridorWidth + SETTINGS.escalatorWidth - balustradeThickness / 2, balustradeCenterY_Down, centerPosDownBalustrade.z);
            outerBalustradeDown.lookAt(outerBalustradeDown.position.clone().add(dirDownBalustrade));
            scene.add(outerBalustradeDown);
            worldObjects.push(outerBalustradeDown);

            // Add cylinders for escalator DOWN balustrades (posts at end sides)
            {
                const cylinderGeo = new THREE.CylinderGeometry(balustradeHeight/2, balustradeHeight/2, balustradeThickness, 16);
                cylinderGeo.rotateZ(Math.PI/2);
                // For down balustrade, use startDownBalustrade and endDownBalustrade
                const downDir = new THREE.Vector3().subVectors(endDownBalustrade, startDownBalustrade).normalize();
                const halfLengthDown = lengthDownBalustrade / 2;
                // For inner balustrade DOWN:
                const innerCenterDown = innerBalustradeDown.position.clone();
                const innerDownEnd1 = innerCenterDown.clone().sub(downDir.clone().multiplyScalar(halfLengthDown));
                const innerDownEnd2 = innerCenterDown.clone().add(downDir.clone().multiplyScalar(halfLengthDown));
                const cylinderInnerDown1 = new THREE.Mesh(cylinderGeo, balustradeMaterial);
                cylinderInnerDown1.position.copy(innerDownEnd1);
                const cylinderInnerDown2 = new THREE.Mesh(cylinderGeo, balustradeMaterial);
                cylinderInnerDown2.position.copy(innerDownEnd2);
                // For outer balustrade DOWN:
                const outerCenterDown = outerBalustradeDown.position.clone();
                const outerDownEnd1 = outerCenterDown.clone().sub(downDir.clone().multiplyScalar(halfLengthDown));
                const outerDownEnd2 = outerCenterDown.clone().add(downDir.clone().multiplyScalar(halfLengthDown));
                const cylinderOuterDown1 = new THREE.Mesh(cylinderGeo, balustradeMaterial);
                cylinderOuterDown1.position.copy(outerDownEnd1);
                const cylinderOuterDown2 = new THREE.Mesh(cylinderGeo, balustradeMaterial);
                cylinderOuterDown2.position.copy(outerDownEnd2);
                scene.add(cylinderInnerDown1, cylinderInnerDown2, cylinderOuterDown1, cylinderOuterDown2);
            }
           } // END OF ESCALATORS ////////////////////////////////////////
            
            
        }


        // Walls & Doors

        // Right Wall next to elevator shaft (Negative Z direction)
        // These are the walls that form the elevator shaft on each floor.
        // They use currentElevatorConfig for positioning.

        // Shaft Wall Left (Player's Right when facing +Z into shaft)
        const shaftWallLeftGeo = new THREE.BoxGeometry(wallDepth, SETTINGS.floorHeight, (2*overallShaftActualDepth) +8);
        const shaftWallLeft = new THREE.Mesh(shaftWallLeftGeo, wallMaterial);
        shaftWallLeft.name = `ShaftWall_Left_F${i}`;
        shaftWallLeft.position.set(
            overallShaftMinX - wallDepth / 2, // Adjusted
            floorY + SETTINGS.floorHeight / 2,
            overallShaftActualCenterZ - 2 // Adjusted
        );
        shaftWallLeft.castShadow = true; shaftWallLeft.receiveShadow = true;
        scene.add(shaftWallLeft); worldObjects.push(shaftWallLeft);

        // Shaft Wall Right (Player's Left when facing +Z into shaft)
        const shaftWallRightGeo = new THREE.BoxGeometry(wallDepth, SETTINGS.floorHeight, (2*overallShaftActualDepth) +8);
        const shaftWallRight = new THREE.Mesh(shaftWallRightGeo, wallMaterial);
        shaftWallRight.name = `ShaftWall_Right_F${i}`;
        shaftWallRight.position.set(
            overallShaftMaxX + wallDepth / 2, // Adjusted
            floorY + SETTINGS.floorHeight / 2,
            overallShaftActualCenterZ - 2
        );
        shaftWallRight.castShadow = true; shaftWallRight.receiveShadow = true;
        scene.add(shaftWallRight); worldObjects.push(shaftWallRight);

        // Shaft Wall Back
        /* const shaftWallBackGeo = new THREE.BoxGeometry(overallShaftActualWidth, SETTINGS.floorHeight, wallDepth);
        const shaftWallBack = new THREE.Mesh(shaftWallBackGeo, wallMaterial);
        shaftWallBack.name = `ShaftWall_Back_F${i}`;
        shaftWallBack.position.set(
            overallShaftActualCenterX, // Adjusted
            floorY + SETTINGS.floorHeight / 2,
            overallShaftMinZ - wallDepth / 2
        );
        shaftWallBack.castShadow = true; shaftWallBack.receiveShadow = true;
        scene.add(shaftWallBack); worldObjects.push(shaftWallBack); */

        // Lintel/Cap Wall above elevator opening (front of shaft)
        // Assuming standard door height for the opening.
        // const openingHeight = SETTINGS.doorHeight; // This was for the old lintel
        // const capWallHeight = SETTINGS.wallHeight - openingHeight; // This was for the old lintel
        /* if (capWallHeight > 0.01) {
            const capWallGeo = new THREE.BoxGeometry(currentElevatorConfig.shaftWidth, capWallHeight, wallDepth);
            const capWallNear = new THREE.Mesh(capWallGeo, wallMaterial); // Use wallMaterial
            capWallNear.name = `ShaftLintel_F${i}`;
            capWallNear.position.set(
                currentElevatorConfig.x,
                floorY + openingHeight + capWallHeight / 2, // Positioned above door opening
                currentElevatorConfig.z + currentElevatorConfig.shaftDepth / 2 + wallDepth / 2 // Front of shaft
            );
            capWallNear.castShadow = true; capWallNear.receiveShadow = true;
            scene.add(capWallNear); worldObjects.push(capWallNear);
        } */

        // Fillers next to the opening if the shaft is wider than a standard door
        // This part is complex if we want actual elevator doors. For now, assume open front or simple fillers.
        // The current `capWallNear` spans the whole shaft width above the opening.
        // If we need side fillers for the opening itself (from floor to openingHeight):
        // This would depend on how elevator doors are implemented.
        // For now, the shaft is open at the front up to `openingHeight`.

        // The old "capWallNear" that filled the floorDepth thickness above wallHeight:
        const floorCapGeo = new THREE.BoxGeometry(overallShaftActualWidth, SETTINGS.floorHeight - SETTINGS.wallHeight, wallDepth);
        const capWallNear = new THREE.Mesh(floorCapGeo, floorMaterial); // This is part of the floor/ceiling structure
        capWallNear.name = `ShaftFloorCap_F${i}`;
        capWallNear.position.set(
            overallShaftActualCenterX, // Adjusted
            floorY + SETTINGS.wallHeight + (SETTINGS.floorHeight - SETTINGS.wallHeight) / 2,
            overallShaftMaxZ + wallDepth / 2 // Front of shaft
        );
        capWallNear.castShadow = true;
        capWallNear.receiveShadow = true;
        scene.add(capWallNear);
        worldObjects.push(capWallNear);
    }

    // Initial camera position relative to the active elevator
    if (activeElevator) {
        camera.position.set(
            activeElevator.platform.position.x,
            activeElevator.platform.position.y + playerHeight + 0.2, // Start slightly above the elevator platform
            activeElevator.platform.position.z + 0.1 // Start slightly inside the corridor from elevator
        );
    } else { // Fallback if no elevators created (should not happen with current setup)
        camera.position.set(SETTINGS.corridorWidth / 2, playerHeight, 0);
    }

    // Rotate the camera to look down the hallway
    controls.getObject().rotation.y = Math.PI; // Rotate 180 degrees (facing opposite direction
}

function createElevatorPistonMesh(elevatorObj, material) {
    const bottomShaftThickness = 0.2;
    const totalTravel = (elevatorObj.maxFloorIndex - elevatorObj.minFloorIndex) * SETTINGS.floorHeight;
    const bottomShaftActualHeight = totalTravel + SETTINGS.floorHeight; // Extend a bit more for visual

    const bottomShaftGeo = new THREE.BoxGeometry(bottomShaftThickness, bottomShaftActualHeight, bottomShaftThickness);
    const bottomShaft = new THREE.Mesh(bottomShaftGeo, material);
    bottomShaft.name = `ElevatorBottomPistonShaft_${elevatorObj.id}`;
    // Position its top surface at the bottom of the elevator platform (local y = -0.1 for platform bottom)
    // So, its center is at -0.1 - height/2
    bottomShaft.position.set(0, -0.1 - (bottomShaftActualHeight / 2), 0);
    bottomShaft.castShadow = true;
    bottomShaft.receiveShadow = true;
    bottomShaft.geometry.computeBoundingBox(); // For collision detection
    return bottomShaft;
}

function createDynamicChainMesh(elevatorObj, material) {
    const chainThickness = 0.1;
    const internalRoofThickness = elevatorObj.roof.geometry.parameters.height; // Should be 0.2

    // Local Y of internal roof's top surface, relative to platform's origin
    const internalRoofTopLocalY = (0.1 + SETTINGS.wallHeight - internalRoofThickness / 2) + internalRoofThickness;

    // World Y of internal roof's top surface when platform is at its lowest
    const minPlatformY = (elevatorObj.minFloorIndex * SETTINGS.floorHeight) - 0.1;
    const minInternalRoofTopWorldY = minPlatformY + internalRoofTopLocalY;

    // World Y of the bottom surface of the main shaftCeiling
    const shaftCeilingBottomWorldY = elevatorObj.shaftCeiling.position.y - elevatorObj.shaftCeiling.geometry.parameters.height / 2;

    // initialGeomHeight is the maximum length the chain will ever need to be.
    const initialGeomHeight = Math.max(0.01, shaftCeilingBottomWorldY - minInternalRoofTopWorldY);

    const chainGeometry = new THREE.BoxGeometry(chainThickness, initialGeomHeight, chainThickness);
    const chainMesh = new THREE.Mesh(chainGeometry, material);
    chainMesh.name = `ElevatorChain_${elevatorObj.id}`;

    // Chain's position is local to its parent (the platform).
    // Its bottom should be on the internal roof's top surface.
    chainMesh.position.set(0, internalRoofTopLocalY + initialGeomHeight / 2, 0);

    chainMesh.castShadow = true;
    chainMesh.receiveShadow = true;
    // Store initial height for scaling later:
    chainMesh.userData.initialGeomHeight = initialGeomHeight;
    return chainMesh;
}

function updateChainLength(elevatorInstance) {
  const chain = elevatorInstance.chain;
  const internalRoof = elevatorInstance.roof; // Elevator's own internal roof
  const shaftCeiling = elevatorInstance.shaftCeiling; // Topmost ceiling of the shaft

  if (chain && internalRoof && shaftCeiling && chain.userData.initialGeomHeight) {
    const initialGeomHeight = chain.userData.initialGeomHeight;
    const internalRoofThickness = internalRoof.geometry.parameters.height;

    // World Y of the top surface of the elevator's internal roof
    const internalRoofTopWorldY = internalRoof.position.y + internalRoofThickness / 2;

    // World Y of the bottom surface of the shaft's main ceiling
    const shaftCeilingBottomWorldY = shaftCeiling.position.y - shaftCeiling.geometry.parameters.height / 2;

    const currentVisibleChainLength = Math.max(0.01, shaftCeilingBottomWorldY - internalRoofTopWorldY);

    chain.scale.y = currentVisibleChainLength / initialGeomHeight;

    // Chain's position is local to its parent (the platform).
    // Its bottom is on the internal roof's top surface.
    const internalRoofTopLocalY = (0.1 + SETTINGS.wallHeight - internalRoofThickness / 2) + internalRoofThickness;
    chain.position.y = internalRoofTopLocalY + currentVisibleChainLength / 2;
  }
}

// --- Helper function to create a room lamp ---
function createRoomLamp(x, y, z, floorIndex, roomId, baseBulbMaterial) {
    // Use global lampConeGeo and lampChainGeo
    // Materials for room lamps are specific due to animation
    const chainMaterial = new THREE.MeshStandardMaterial({ color: 0x111111 });
    const chainMesh = new THREE.Mesh(lampChainGeo, chainMaterial);
    chainMesh.position.y = 0.15;

    const lampshadeMaterial = new THREE.MeshStandardMaterial({
        color: 0x111111, // Darker lampshade for rooms, perhaps
        emissive: 0x000000,
        emissiveIntensity: 0.0,
    });

    const lightDiskMaterial = new THREE.MeshStandardMaterial({ // Material for the light disk when "on"
        color: 0xffddaa,
        emissive: 0xffddaa,
        emissiveIntensity: 0, // Start off
    });

    // Use global lampBulbGeo
    // Clone the material so each bulb can have its own emissive state
    const bulbMaterialInstance = baseBulbMaterial.clone();
    bulbMaterialInstance.emissive.set(0x333322); // Dim color when off
    bulbMaterialInstance.emissiveIntensity = 0.1; // Very low intensity when off

    const bulbMesh = new THREE.Mesh(lampBulbGeo, bulbMaterialInstance); // Use global lampBulbGeo
    bulbMesh.position.y = -0.3 + 0.08 * 2; // bulbRadius = 0.08
    bulbMesh.name = `Bulb_Room_${roomId}`;

    const lampshadeMesh = new THREE.Mesh(lampConeGeo, lampshadeMaterial); // Use global lampConeGeo
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
    lightGroup.castShadow = true; // Lampshade can cast shadow

    // scene.add(lightGroup); // REMOVED: Light group is added via roomContentsGroup
    lights.push(lightGroup); // Add to global lights array for shooting/interaction

    const pointLight = new THREE.PointLight(0xffddaa, 0, 5); // Start with intensity 0 (off)
    pointLight.position.set(x, y - 0.3, z);
    scene.add(pointLight);

    lightGroup.userData = { 
        pointLight, bulbMesh, bottomLightDisk, floorIndex, roomId,
        animationState: { isAnimating: false, startTime: 0, duration: 500, startLightIntensity: 0, targetLightIntensity: 0, startBulbEmissive: 0, targetBulbEmissive: 0, startDiskEmissive: 0, targetDiskEmissive: 0 },
        isDestroyed: false, isRoomLight: true, isOn: false 
    }; // The return lightGroup was added in the previous step, ensure it's still here.
    return lightGroup;
}
// --- Helper function to create an outer wall with a window ---
function createOuterWallWithWindow(centerX, centerY, centerZ, segmentLength, wallHeight, wallThickness, wallMat, initialWindowMat, transparentWindowMat, roomId) {
    const WINDOW_WIDTH_RATIO = 0.7;
    const WINDOW_HEIGHT_RATIO = 0.6;
    const WINDOW_SILL_RATIO = 0.2; // of wallHeight

    const windowW = segmentLength * WINDOW_WIDTH_RATIO;
    const windowH = wallHeight * WINDOW_HEIGHT_RATIO;
    const sillH = wallHeight * WINDOW_SILL_RATIO;
    const headerH = wallHeight - windowH - sillH;
    // pillarW is the width of the wall section next to the window, along the Z-axis for this wall configuration
    const pillarW = (segmentLength - windowW) / 2;

    // 1. Sill (below window)
    if (sillH > 0.01) {
        const sillGeo = new THREE.BoxGeometry(wallThickness, sillH, segmentLength); // X, Y, Z dimensions
        const sill = new THREE.Mesh(sillGeo, wallMat);
        sill.position.set(centerX, centerY - (wallHeight / 2) + (sillH / 2), centerZ);
        sill.castShadow = true; sill.receiveShadow = true;
        scene.add(sill); worldObjects.push(sill); // These are structural, not part of roomContents
        sill.name = `OuterWallSill_${roomId}`;
    }

    // 2. Header (above window)
    if (headerH > 0.01) {
        const headerGeo = new THREE.BoxGeometry(wallThickness, headerH, segmentLength); // X, Y, Z dimensions
        const header = new THREE.Mesh(headerGeo, wallMat);
        header.position.set(centerX, centerY + (wallHeight / 2) - (headerH / 2), centerZ);
        header.castShadow = true; header.receiveShadow = true;
        scene.add(header); worldObjects.push(header); // Structural
        header.name = `OuterWallHeader_${roomId}`;
    }

    // Y position for the center of the window section (pillars and glass)
    const windowSectionY = centerY - (wallHeight / 2) + sillH + (windowH / 2);

    // 3. Left Pillar (beside window, smaller Z value)
    if (pillarW > 0.01) {
        const pillarLGeo = new THREE.BoxGeometry(wallThickness, windowH, pillarW); // X, Y, Z dimensions
        const pillarL = new THREE.Mesh(pillarLGeo, wallMat);
        pillarL.position.set(centerX, windowSectionY, centerZ - (segmentLength / 2) + (pillarW / 2));
        pillarL.castShadow = true; pillarL.receiveShadow = true;
        scene.add(pillarL); worldObjects.push(pillarL); // Structural
        pillarL.name = `OuterWallPillarL_${roomId}`;

        // 4. Right Pillar (beside window, larger Z value)
        const pillarRGeo = new THREE.BoxGeometry(wallThickness, windowH, pillarW); // X, Y, Z dimensions
        const pillarR = new THREE.Mesh(pillarRGeo, wallMat);
        pillarR.position.set(centerX, windowSectionY, centerZ + (segmentLength / 2) - (pillarW / 2));
        pillarR.castShadow = true; pillarR.receiveShadow = true;
        scene.add(pillarR); worldObjects.push(pillarR); // Structural
        pillarR.name = `OuterWallPillarR_${roomId}`;
    }

    // 5. Window Glass Pane
    if (windowW > 0.01 && windowH > 0.01) {
        const glassGeo = new THREE.BoxGeometry(wallThickness * 0.25, windowH, windowW);
        const glass = new THREE.Mesh(glassGeo, initialWindowMat); // Use initial material
        glass.position.set(centerX, windowSectionY, centerZ);
        glass.castShadow = false;
        glass.receiveShadow = true;
        // Mark as breakable window
        glass.userData = { isWindow: true, roomId: roomId }; // Store roomId with window
        scene.add(glass);
        worldObjects.push(glass);
        glass.name = `OuterWindowGlass_${roomId}`;
        // Link this glass pane to the roomData
        const roomDataForWindow = allRoomsData.find(r => r.id === roomId);
        if (roomDataForWindow) {
            roomDataForWindow.windowGlass = glass;
            roomDataForWindow.opaqueMaterial =  initialWindowMat; // Store the opaque material
            roomDataForWindow.transparentMaterial = transparentWindowMat; // Store reference to the transparent material
        }
    }
}

// --- Event Handlers ---
function onKeyDown(event) {
    switch (event.code) {
        case 'KeyW': moveForward = true; break;
        case 'KeyA': moveLeft = true; break;
        case 'KeyS': moveBackward = true; break;
        case 'KeyD': moveRight = true; break;
        case 'ShiftLeft':
        case 'ShiftRight': isSprinting = true; break;
        case 'Space': 
            if (playerOnGround) {
                if (playerState === 'prone') {
                    // Jump from prone to crouch
                    playerState = 'crouching';
                    playerHeight = 1.0; // Adjust height for crouching
                    controls.getObject().position.y += 0.5; // Adjust camera height
                    SETTINGS.playerSpeed *= 2; // Restore crouch speed
                } else if (playerState === 'crouching') {
                    // Jump from crouch to upright
                    playerState = 'upright';
                    playerHeight = 1.7; // Restore upright height
                    controls.getObject().position.y += 0.7; // Adjust camera height
                    SETTINGS.playerSpeed *= 2; // Restore normal speed
                } else {
                    playerVelocity.y = SETTINGS.jumpVelocity; // Normal jump
                }
            }
            break;
        case 'ControlLeft':
            if (playerState === 'upright') {
                // Go from upright to crouching
                playerState = 'crouching';
                playerHeight = 1.0; // Adjust height for crouching
                controls.getObject().position.y -= 0.7; // Adjust camera height
                SETTINGS.playerSpeed /= 2; // Reduce speed for crouching
            } else if (playerState === 'crouching') {
                // Go from crouching to prone
                playerState = 'prone';
                playerHeight = 0.5; // Adjust height for prone
                controls.getObject().position.y -= 0.5; // Adjust camera height
                SETTINGS.playerSpeed /= 2; // Further reduce speed for prone
            }
            break;
        case 'KeyU': callElevator(1); break;
        case 'KeyJ': callElevator(-1); break;
        case 'KeyE': interact(); break;
        case 'KeyF': pickUpLampshade(); break; // Add pickup action
    }
}

function onKeyUp(event) {
    switch (event.code) {
        case 'KeyW': moveForward = false; break;
        case 'KeyA': moveLeft = false; break;
        case 'KeyS': moveBackward = false; break;
        case 'KeyD': moveRight = false; break;
        case 'ShiftLeft':
        case 'ShiftRight': isSprinting = false; break;
    }
}

function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

// --- Game Logic ---
function getClosestElevator() {
    if (elevators.length === 0) return null;
    if (elevators.length === 1) return elevators[0]; // Optimization for single elevator

    const playerPos = controls.getObject().position;
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

function callElevator(direction) { // +1 for up, -1 for down
    activeElevator = getClosestElevator(); // Update active elevator when called
    if (!activeElevator) return;

    let targetFloor = activeElevator.currentFloorIndexVal + direction;

    // Use elevator's own min/max floor limits
    targetFloor = Math.max(activeElevator.minFloorIndex, Math.min(activeElevator.maxFloorIndex, targetFloor));

    const newTargetY = (targetFloor * SETTINGS.floorHeight) - 0.1; // Platform center Y

    if (newTargetY !== activeElevator.targetY) {
        activeElevator.targetY = newTargetY;
        activeElevator.direction = Math.sign(activeElevator.targetY - activeElevator.platform.position.y);
        activeElevator.isMoving = true;
        console.log(`Elevator ${activeElevator.id} called to floor ${targetFloor}. Moving ${activeElevator.direction > 0 ? 'UP' : 'DOWN'}.`);
    }
}

function updateElevators(deltaTime) {
    elevators.forEach(elev => {
        if (!elev.isMoving) return;

        const targetY = elev.targetY;
        const currentY = elev.platform.position.y;
        const moveAmount = SETTINGS.elevatorSpeed * deltaTime * elev.direction;
        let nextY = currentY + moveAmount;

        let arrived = false;
        if (elev.direction > 0 && nextY >= targetY) { // Moving up
            nextY = targetY;
            arrived = true;
        } else if (elev.direction < 0 && nextY <= targetY) { // Moving down
            nextY = targetY;
            arrived = true;
        }

        elev.platform.position.y = nextY;
        elev.currentY = nextY; // Update stored currentY for the elevator object

        // Move the elevator's internal roof with the platform
        if (elev.roof) {
            elev.roof.position.y = nextY + SETTINGS.wallHeight;
            updateChainLength(elev); // Update its chain
        }

        handlePlayerCrush(elev, currentY, nextY);

        // Move player if they are on this specific elevator or its roof
        const playerPos = controls.getObject().position;
        const playerIsOnThisPlatform =
            Math.abs(playerPos.x - elev.platform.position.x) < (elev.config.shaftWidth / 2) &&
            Math.abs(playerPos.z - elev.platform.position.z) < (elev.config.shaftDepth / 2) &&
            Math.abs(playerPos.y - (currentY + playerHeight)) < 0.3;

        const playerIsOnThisInternalRoof = elev.roof &&
            Math.abs(playerPos.x - elev.roof.position.x) < (elev.config.shaftWidth / 2) &&
            Math.abs(playerPos.z - elev.roof.position.z) < (elev.config.shaftDepth / 2) &&
            Math.abs(playerPos.y - (elev.roof.position.y + playerHeight)) < 0.3;

        if (playerIsOnThisPlatform) {
            playerPos.y = nextY + playerHeight;
            playerOnGround = true;
        } else if (playerIsOnThisInternalRoof) {
            playerPos.y = elev.roof.position.y + playerHeight;
            playerOnGround = true;
        }

        if (arrived) {
            elev.isMoving = false;
            elev.currentFloorIndexVal = Math.round((targetY + 0.1) / SETTINGS.floorHeight);
            console.log(`Elevator ${elev.id} arrived at floor ${elev.currentFloorIndexVal}`);

            if (playerIsOnThisPlatform) {
                playerVelocity.y = 2.0; // Slight jump effect
                playerOnGround = false;
            }

            if (isPlayerRespawning && elev === activeElevator) { // Check if this is the active elevator for respawn
                respawnPlayer();
            }
        }
    });
}

function handlePlayerCrush(elevatorInstance, currentPlatformY, nextPlatformY) {
    const playerPos = controls.getObject().position;
    const platform = elevatorInstance.platform;
    const internalRoof = elevatorInstance.roof; // Elevator's own internal roof
    const shaftCeiling = elevatorInstance.shaftCeiling; // Topmost ceiling of the shaft

    // Check if the player is underneath the elevator
    const playerIsUnderElevator =
        Math.abs(playerPos.x - platform.position.x) < (elevatorInstance.config.shaftWidth / 2) &&
        Math.abs(playerPos.z - platform.position.z) < (elevatorInstance.config.shaftDepth / 2) &&
        playerPos.y < currentPlatformY; // Player is below the elevator platform

    if (playerIsUnderElevator) {
        if (playerState === 'upright' && nextPlatformY <= playerPos.y + playerHeight) {
            // Elevator touches the player's head
            playerState = 'crouching';
            playerHeight = 1.0; // Adjust height for crouching
            controls.getObject().position.y -= 0.7; // Adjust camera height
            SETTINGS.playerSpeed *= 2; // Restore crouch speed
        } else if (playerState === 'crouching' && nextPlatformY <= playerPos.y + playerHeight) {
            // Elevator touches the player again
            playerState = 'prone';
            playerHeight = 0.5; // Adjust height for prone
            controls.getObject().position.y -= 0.5; // Adjust camera height
            SETTINGS.playerSpeed /= 2; // Further reduce speed for prone
        } else if (playerState === 'prone' && nextPlatformY <= playerPos.y + playerHeight) {
            // Elevator crushes the player completely
            displayCrushBanner();
            isPlayerRespawning = true;
            activeElevator = elevatorInstance; // Set this as the active one for respawn context
        }
    }

    // Check crushing by elevator's internal roof against the main shaftCeiling
    if (internalRoof && shaftCeiling) {
        // Player is on the internal roof of this elevator
        const playerIsOnThisInternalRoof =
            Math.abs(playerPos.x - internalRoof.position.x) < (elevatorInstance.config.shaftWidth / 2) &&
            Math.abs(playerPos.z - internalRoof.position.z) < (elevatorInstance.config.shaftDepth / 2) &&
            Math.abs(playerPos.y - (internalRoof.position.y + playerHeight)) < 0.1; // Player is on the roof

        if (playerIsOnThisInternalRoof && elevatorInstance.direction > 0) { // Moving up
            const playerEffectiveTopY = internalRoof.position.y + playerHeight; // Top of player's head when on internal roof
            const shaftCeilingBottomY = shaftCeiling.position.y - (shaftCeiling.geometry.parameters.height / 2);

            if (playerEffectiveTopY >= shaftCeilingBottomY - 0.1) { // Collision with shaft ceiling
                if (playerState === 'upright') {
                    playerState = 'crouching'; playerHeight = 1.0; controls.getObject().position.y -= 0.7; SETTINGS.playerSpeed /= 2;
                    applyDamageToPlayer(50);
                    console.log("Player forced to crouch (shaft ceiling)!");
                } else if (playerState === 'crouching') {
                    playerState = 'prone'; playerHeight = 0.5; controls.getObject().position.y -= 0.5; SETTINGS.playerSpeed /= 2;
                    applyDamageToPlayer(50);
                    console.log("Player forced to prone (shaft ceiling)!");
                } else if (playerState === 'prone') {
                    displayCrushBanner();
                    isPlayerRespawning = true;
                }
            }
        }
    }
}

function displayCrushBanner() {
    const banner = document.getElementById('crushBanner');
    banner.style.display = 'block';
    banner.innerHTML = `
        <h1>You were CRUSHED!</h1>
        <p>Lives: ${playerLives}</p>
        <p>Score: ${playerScore}</p>
    `;

    if (playerLives <= 0) {
        setTimeout(() => {
            banner.innerHTML = '<h1>Game Over</h1>';
            setTimeout(resetGame, 3000); // Reset the game after 3 seconds
        }, 3000);
    } else {
        setTimeout(() => {
            banner.style.display = 'none';
        }, 3000); // Hide the banner after 3 seconds
    }
}

function interact() {
    if (!controls.isLocked) return;
    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2(0, 0); // Center of the screen
    raycaster.setFromCamera(pointer, camera);

    // Check interactable objects (doors and world objects which might include safe dials)
    // Safes are in worldObjects, their dials are children. Room lights are in the 'lights' array.
    const objectsToInteract = [...doors, ...worldObjects, ...lights];
    const intersects = raycaster.intersectObjects(objectsToInteract, true); // true for recursive

    if (intersects.length > 0) {
        const intersected = intersects[0].object;
        if (intersected.userData.doorKnob) {
            const door = intersected.parent;
            if (door.userData.locked) {
                door.userData.locked = false;
                door.userData.isOpen = true;
                door.remove(intersected); // remove knob
                // Swing door open instantly based on player's position
                {
                    const playerX = controls.getObject().position.x;
                    const doorX = door.position.x;
                    let openAngle;
                    if (doorX === 0) { // Right-side door
                        openAngle = (playerX > 0) ? -Math.PI/2 : Math.PI/2;
                    } else { // Left-side door (at SETTINGS.corridorWidth)
                        openAngle = (playerX < doorX) ? Math.PI/2 : -Math.PI/2;
                    }
                    door.rotation.y = openAngle;
                }
                console.log("Locked door unlocked by shooting doorknob; decal applied.");
            }
        } else if (intersected.userData.type === 'door') {
            const door = intersected;
            if (!door.userData.locked) {
                // Toggle open/close
                if (!door.userData.isOpen) {
                    const playerX = controls.getObject().position.x;
                    const doorX = door.position.x;
                    let openAngle;
                    if (doorX === 0) { // Right-side door
                        openAngle = (playerX > 0) ? -Math.PI/2 : Math.PI/2;
                    } else { // Left-side door
                        openAngle = (playerX < doorX) ? Math.PI/2 : -Math.PI/2;
                    }
                    door.userData.isOpen = true;
                    door.rotation.y = openAngle;
                    console.log("Door opened away from player.");
                } else {
                    door.userData.isOpen = false;
                    door.rotation.y = 0;
                    console.log("Door closed.");
                }
                // LOD Update for door
                const doorRoomId = door.userData.roomId;
                const roomData = allRoomsData.find(r => r.id === doorRoomId);
                if (roomData) {
                    if (door.userData.isOpen) { // Door just opened
                        roomData.visibleByDoor = true;
                        // Ensure window is transparent
                        if (roomData.windowGlass && roomData.transparentMaterial && roomData.windowGlass.material !== roomData.transparentMaterial) {
                            roomData.windowGlass.material = roomData.transparentMaterial;
                            console.log(`Window for room ${roomData.id} is now transparent (door interact).`);
                        }
                    } else { // Door just closed
                        roomData.visibleByDoor = false;
                        // Revert window to opaque, unless LOD system keeps it transparent (handled by LOD system)
                        if (roomData.windowGlass && roomData.opaqueMaterial && roomData.windowGlass.material !== roomData.opaqueMaterial) {
                            // Check if LOD system isn't already making it visible via window
                            if (!roomData.visibleByWindow) { // Only make opaque if not visible by window from outside
                                roomData.windowGlass.material = roomData.opaqueMaterial;
                                console.log(`Window for room ${roomData.id} is now opaque (door closed).`);
                            }
                        }
                    }
                    updateSingleRoomVisibility(roomData);
                }
            }
        } else if (intersected.userData.isSafeDial) {
            const safe = intersected.parent; // The dial is a child of the safe
            if (safe && safe.userData && !safe.userData.isCracked && !safe.userData.pointsAwarded) {
                safe.userData.dialPresses++;
                console.log(`Safe dial pressed. Count: ${safe.userData.dialPresses}/${safe.userData.dialPressesRequired}`);
                if (safe.userData.dialPresses >= safe.userData.dialPressesRequired) {
                    crackSafe(safe);
                }
            } else if (safe && safe.userData && safe.userData.isCracked) {
                console.log("Safe already cracked.");
            }
        } else if (intersected.userData.isRoomLight || intersected.parent?.userData?.isRoomLight) {
            const lightGroup = intersected.userData.isRoomLight ? intersected : intersected.parent;
            if (lightGroup && lightGroup.userData.isRoomLight && !lightGroup.userData.isDestroyed) {
                lightGroup.userData.isOn = !lightGroup.userData.isOn;
                const { pointLight, bulbMesh, bottomLightDisk, animationState } = lightGroup.userData;

                if (lightGroup.userData.isOn) {
                    // Start fade in animation
                    animationState.isAnimating = true;
                    animationState.startTime = performance.now();
                    animationState.duration = 500; // milliseconds
                    animationState.startLightIntensity = pointLight.intensity;
                    animationState.targetLightIntensity = 1.0; // Desired "on" intensity
                    animationState.startBulbEmissive = bulbMesh.material.emissiveIntensity;
                    animationState.targetBulbEmissive = 2.0; // Desired "on" bulb emissive
                    animationState.startDiskEmissive = bottomLightDisk.material.emissiveIntensity;
                    animationState.targetDiskEmissive = 1.0; // Desired "on" disk emissive
                    console.log(`Room light ${lightGroup.userData.roomId} turned ON`);
                } else {
                     // Start fade out animation
                    animationState.isAnimating = true;
                    animationState.startTime = performance.now();
                    animationState.duration = 500; // milliseconds
                    animationState.startLightIntensity = pointLight.intensity;
                    animationState.targetLightIntensity = 0; // Desired "off" intensity
                    animationState.startBulbEmissive = bulbMesh.material.emissiveIntensity;
                    animationState.targetBulbEmissive = 0.1; // Desired "off" bulb emissive
                    animationState.startDiskEmissive = bottomLightDisk.material.emissiveIntensity;
                    animationState.targetDiskEmissive = 0; // Desired "off" disk emissive
                    console.log(`Room light ${lightGroup.userData.roomId} turned OFF`);
                }
            }
        } else if (intersected.userData.type === 'garageDoor') {
            const garageDoor = intersected;
            if (!garageDoor.userData.isAnimating) {
                garageDoor.userData.isOpen = !garageDoor.userData.isOpen;
                garageDoor.userData.isAnimating = true;
                garageDoor.userData.targetRotationX = garageDoor.userData.isOpen ? -Math.PI / 2.1 : 0; // Tilt up ~85 degrees
                if (!animatedGarageDoors.includes(garageDoor)) {
                    animatedGarageDoors.push(garageDoor);
                }
                console.log(`Garage door on floor ${garageDoor.userData.floor} is now ${garageDoor.userData.isOpen ? 'opening' : 'closing'}.`);
            }
        } 
        // Check if the intersected object or its parent is part of an elevator
        else if (intersected.userData.elevatorId || (intersected.parent && intersected.parent.userData.elevatorId)) {
            // Check if the intersected object or its parent is part of an elevator
            let elevatorId = intersected.userData.elevatorId;
            if (!elevatorId && intersected.parent) { // For poles, chain, piston that are children of platform
                elevatorId = intersected.parent.userData.elevatorId;
            }
            // At this point, elevatorId is guaranteed to be truthy because of the 'else if' condition
            const targetElevator = elevators.find(e => e.id === elevatorId);
            if (targetElevator) {
                const playerFloorY = controls.getObject().position.y;
                // Ensure player's current floor is within the elevator's range
                const playerCurrentFloorIndex = Math.max(targetElevator.minFloorIndex, Math.min(targetElevator.maxFloorIndex, Math.round(playerFloorY / SETTINGS.floorHeight)));
                // Call the specific elevator to this floor
                callSpecificElevatorToFloor(targetElevator, playerCurrentFloorIndex);
            }
        } else if (lights.includes(intersected.parent) && intersected.parent.userData.isRoomLight === undefined) { // Check if it's a corridor light part
            // This could be a corridor lampshade or bulb, handle if necessary or let shoot() handle it.
        } else {
            // console.log("Interacted with generic object:", intersected.name);
        }
    }
}

function callSpecificElevatorToFloor(elevatorInstance, targetFloorIndex) {
    if (!elevatorInstance) return;

    // Ensure targetFloorIndex is within the elevator's operational range
    const effectiveTargetFloor = Math.max(elevatorInstance.minFloorIndex, Math.min(elevatorInstance.maxFloorIndex, targetFloorIndex));

    const newTargetY = (effectiveTargetFloor * SETTINGS.floorHeight) - 0.1; // Platform center Y

    if (newTargetY !== elevatorInstance.targetY || !elevatorInstance.isMoving) { // Call even if at targetY but not moving
        elevatorInstance.targetY = newTargetY;
        elevatorInstance.direction = Math.sign(elevatorInstance.targetY - elevatorInstance.platform.position.y);
        if (elevatorInstance.platform.position.y !== newTargetY) { // Only set isMoving if not already at the target
             elevatorInstance.isMoving = true;
        }
        console.log(`Elevator ${elevatorInstance.id} called to floor ${effectiveTargetFloor}. Moving ${elevatorInstance.direction > 0 ? 'UP' : (elevatorInstance.direction < 0 ? 'DOWN' : 'STATIONARY')}.`);
        activeElevator = elevatorInstance; // Make this the active elevator
    }
}

function shoot() {
    if (!controls.isLocked) return;
    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2(0, 0);
    raycaster.setFromCamera(pointer, camera);
    const intersects = raycaster.intersectObjects([...lights, ...worldObjects, ...doors], true);
    if (intersects.length > 0) {
        const hit = intersects[0];
        const hitObject = hit.object;
        if (hitObject.userData.doorKnob) {
            const door = hitObject.parent;
            // Create a decal that remains with the door.
            const decalTexture = new THREE.TextureLoader().load('textures/bulletHole.png'); // Ensure this texture exists
            const decalMaterial = new THREE.MeshBasicMaterial({ 
                map: decalTexture, 
                transparent: true 
            });
            const decalGeometry = new THREE.PlaneGeometry(0.2, 0.2);
            const decal = new THREE.Mesh(decalGeometry, decalMaterial);
            // Set the decal's position and rotation to match the knob being shot.
            decal.position.copy(hitObject.position);
            decal.rotation.copy(hitObject.rotation);
            decal.rotation.y = Math.PI / 2; // Align with the door surface
            // Attach the decal to the door so it moves with it.
            door.add(decal);
            // Remove the doorknob so only the decal remains.
            door.remove(hitObject);
            if (door.userData.locked) {
                door.userData.locked = false;
                door.userData.isOpen = true;
                // Open door away from the player
                const playerX = controls.getObject().position.x;
                const doorX = door.position.x;
                let openAngle;
                if (doorX === 0) { // Right-side door
                    openAngle = (playerX > 0) ? -Math.PI / 2 : Math.PI / 2;
                } else { // Left-side door
                    openAngle = (playerX < doorX) ? Math.PI / 2 : -Math.PI / 2;
                }
                door.rotation.y = openAngle;

                // LOD Update for door shot open
                const doorRoomIdShot = door.userData.roomId;
                const roomDataShot = allRoomsData.find(r => r.id === doorRoomIdShot);
                if (roomDataShot) {
                    if (door.userData.isOpen) {
                        roomDataShot.visibleByDoor = true;
                        // Ensure window is transparent
                        if (roomDataShot.windowGlass && roomDataShot.transparentMaterial && roomDataShot.windowGlass.material !== roomDataShot.transparentMaterial) {
                            roomDataShot.windowGlass.material = roomDataShot.transparentMaterial;
                            console.log(`Window for room ${roomDataShot.id} is now transparent (door shot).`);
                        }
                        updateSingleRoomVisibility(roomDataShot);
                    }
                }

                console.log("Locked door unlocked by shooting doorknob; decal applied.");
            } else {
                console.log("Doorknob shot replaced with decal.");
            }
        } else if (hitObject.userData.isSafeDial) {
            const safe = hitObject.parent;
            if (safe && safe.userData && !safe.userData.isCracked && !safe.userData.pointsAwarded) {
                crackSafe(safe);
                createBulletHole(hit.point, hit.face.normal); // Add a bullet hole effect on the dial/safe
            }
        } else if (hitObject.userData.isWindow) {
            // New: Break the window when shot
            breakWindow(hitObject);
        } else {
            // For other hits, create a bullet hole normally
            createBulletHole(hit.point, hit.face.normal);
            const lightGroup = hitObject.parent;
            if (lights.includes(lightGroup)) {
                destroyLight(lightGroup);
            }
        }
    }
    // ...existing code...
}

// New helper function to break a window
function breakWindow(windowMesh) {
    // Remove the window from the scene to simulate breaking
    scene.remove(windowMesh);
    // Remove window from worldObjects array
    const index = worldObjects.indexOf(windowMesh);
    if (index > -1) {
        worldObjects.splice(index, 1);
    }
    // Nullify in allRoomsData if it was linked
    const roomData = allRoomsData.find(r => r.windowGlass === windowMesh);
    if (roomData) {
        roomData.windowGlass = null;
    }
    console.log(`Window ${windowMesh.name} has been broken.`);
}

// --- Game Logic (continued) ---
function crackSafe(safe) {
    if (!safe || !safe.userData || safe.userData.pointsAwarded) return; // Already processed

    console.log("Safe cracked!", safe.name);
    safe.userData.isCracked = true;
    safe.userData.pointsAwarded = true; // Ensure points are awarded only once

    playerScore += 500;
    updateUI();
    displaySafeCrackedBanner();

    // Remove the dial
    const dial = safe.children.find(child => child.userData.isSafeDial);
    if (dial) {
        safe.remove(dial);
    }
    // Optional: Change safe appearance, e.g., open it or change color
    // safe.material.color.set(0x00ff00); // Example: turn it green
}

function displaySafeCrackedBanner() {
    const banner = document.getElementById('safeCrackedBanner');
    banner.innerHTML = `<h2>Congratulations!</h2><p>You found the secret document!</p><p>+500 Points</p>`;
    banner.style.display = 'block';
    setTimeout(() => banner.style.display = 'none', 4000); // Hide after 4 seconds
}

function createBulletHole(position, normal) {
    const bulletHoleTexture = new THREE.TextureLoader().load('textures/bulletHole.png'); // Replace with your bullet hole texture
    const bulletHoleMaterial = new THREE.MeshBasicMaterial({
        map: bulletHoleTexture,
        transparent: true,
    });
    const bulletHoleGeometry = new THREE.PlaneGeometry(0.2, 0.2); // Adjust size as needed
    const bulletHole = new THREE.Mesh(bulletHoleGeometry, bulletHoleMaterial);

    // Align the bullet hole with the surface
    bulletHole.position.copy(position);
    bulletHole.lookAt(position.clone().add(normal));

    scene.add(bulletHole);

    // Optional: Remove the bullet hole after some time
    setTimeout(() => scene.remove(bulletHole), 5000);
}

function destroyLight(lightGroup) {
    if (lightGroup.userData.isDestroyed) return;

    lightGroup.userData.isDestroyed = true;
    playerScore += 10; // Award 10 points
    updateUI();

    // Temporarily increase light intensity
    if (lightGroup.userData.pointLight) {
        lightGroup.userData.pointLight.intensity *= 10; // Flash
        setTimeout(() => {
            lightGroup.userData.pointLight.intensity = 0; // Turn off after flash
            if (!lightGroup.userData.isRoomLight) { // Only disable corridor lights if it was a corridor light
                disableCorridorLights(lightGroup.userData.floorIndex);
            } else {
                // For room lights, just ensure its own bulb and disk are off visually
                if (lightGroup.userData.bulbMesh) {
                    lightGroup.userData.bulbMesh.material.emissiveIntensity = 0;
                    lightGroup.userData.bulbMesh.material.needsUpdate = true;
                }
                if (lightGroup.userData.bottomLightDisk) {
                    lightGroup.userData.bottomLightDisk.material.emissiveIntensity = 0;
                    lightGroup.userData.bottomLightDisk.material.needsUpdate = true;
                }
            }
        }, 500); // Flash duration
    }

    // Despawn the bottom light
    const bottomLight = lightGroup.children.find(child => child.geometry instanceof THREE.CircleGeometry);
    if (bottomLight) {
        lightGroup.remove(bottomLight);
        // If it's a room light, also nullify the reference in userData
        if (lightGroup.userData.isRoomLight) lightGroup.userData.bottomLightDisk = null;
    }

    // Break the lightbulb into pieces
    const bulb = lightGroup.children.find(child => child.geometry instanceof THREE.SphereGeometry);
    if (bulb) {
        breakLightBulb(bulb);
        lightGroup.remove(bulb);
        // If it's a room light, also nullify the reference in userData
        if (lightGroup.userData.isRoomLight) lightGroup.userData.bulbMesh = null;
    }

    // Drop the lampshade
    const lampshade = lightGroup.children.find(child => child.geometry instanceof THREE.ConeGeometry);
    if (lampshade) {
        dropLampshade(lampshade);
    }
}

function disableCorridorLights(floorIndex) {
    lights.forEach(lightGroup => {
        if (lightGroup.userData.floorIndex === floorIndex && !lightGroup.userData.isRoomLight) { // Only affect corridor lights
            // Turn off the point light
            const pointLight = lightGroup.userData.pointLight;
            if (pointLight) pointLight.intensity = 0;

            // Remove the bottomLight disc
            const bottomLight = lightGroup.children.find(child => child.geometry instanceof THREE.CircleGeometry);
            if (bottomLight) {
                lightGroup.remove(bottomLight);
            }

            // Turn the bulb texture to black with no emission
            const bulb = lightGroup.children.find(child => child.geometry instanceof THREE.SphereGeometry);
            if (bulb) {
                //bulb.material.color.set(0x000000); // Black color
                //bulb.material.emissive.set(0x000000); // No emission
                //bulb.material.needsUpdate = true;
                lightGroup.remove(bulb);
            }

            
        }
    });
}

function breakLightBulb(bulb) {
    const pieces = [];
    const pieceCount = 5; // Number of pieces to break into
    const pieceGeometry = new THREE.SphereGeometry(0.02, 8, 4); // Smaller pieces
    const pieceMaterial = bulb.material.clone();

    for (let i = 0; i < pieceCount; i++) {
        const piece = new THREE.Mesh(pieceGeometry, pieceMaterial);
        piece.position.copy(bulb.position);
        piece.velocity = new THREE.Vector3(
            (Math.random() - 0.5) * 2,
            Math.random() * 2,
            (Math.random() - 0.5) * 2
        ); // Random velocity
        scene.add(piece);
        pieces.push(piece);
    }

    // Simulate falling pieces
    const gravity = -9.8;
    const interval = setInterval(() => {
        pieces.forEach(piece => {
            piece.position.add(piece.velocity.clone().multiplyScalar(0.016)); // Simulate movement
            piece.velocity.y += gravity * 0.016; // Apply gravity
        });
    }, 16);

    // Remove pieces after some time
    setTimeout(() => {
        pieces.forEach(piece => scene.remove(piece));
        clearInterval(interval);
    }, 3000);
}

function dropLampshade(lampshade) {
    const worldPosition = new THREE.Vector3();
    lampshade.getWorldPosition(worldPosition);

    if (lampshade.parent) {
        lampshade.parent.remove(lampshade);
    }
    scene.add(lampshade);
    lampshade.position.copy(worldPosition);

    const gravity = -9.8;
    const velocity = new THREE.Vector3(0, 0, 0);

    const interval = setInterval(() => {
        lampshade.position.y += velocity.y * 0.016;
        velocity.y += gravity * 0.016;

        // Check for collision with floors or entities
        const lampshadeBox = new THREE.Box3().setFromObject(lampshade);

        // Check collision with player
        const playerBox = new THREE.Box3().setFromCenterAndSize(
            controls.getObject().position,
            new THREE.Vector3(0.5, playerHeight, 0.5)
        );

        if (lampshadeBox.intersectsBox(playerBox)) {
            applyDamageToPlayer(50); // 50% damage
            clearInterval(interval);
            scene.remove(lampshade); // Remove lampshade after collision
            return;
        }

        // Check collision with enemies (if implemented)
        // Add similar logic for enemies here...

        // Check collision with floors
        for (const object of worldObjects) {
            if (object.geometry.boundingBox) {
                const objectBox = new THREE.Box3().copy(object.geometry.boundingBox).applyMatrix4(object.matrixWorld);
                if (lampshadeBox.intersectsBox(objectBox)) {
                    clearInterval(interval);
                    scene.remove(lampshade); // Remove lampshade after hitting the floor
                    return;
                }
            }
        }
    }, 16);
}

function pickUpLampshade() {
    if (!controls.isLocked) return;

    const playerPosition = controls.getObject().position;

    lights.forEach(lightGroup => {
        const lampshade = lightGroup.children.find(child => child.geometry instanceof THREE.ConeGeometry);
        if (lampshade && lampshade.userData.isPickable) {
            const distance = lampshade.position.distanceTo(playerPosition);

            if (distance < 1.5) { // Adjust the pickup range as needed
                console.log("Picked up the lampshade!");
                scene.remove(lampshade); // Remove the lampshade from the scene
                lampshade.userData.isPickable = false;

                // Add logic for what happens when the player picks it up
                // For example, increase score, add to inventory, etc.
            }
        }
    });
}

function applyDamageToPlayer(damage) {
    if (isGameOver) return;

    playerLives -= damage / 100; // Reduce lives by damage percentage
    if (playerLives <= 0) {
        playerLives = 0;
        handlePlayerDeath();
    }
    updateUI();
}

function handlePlayerDeath() {
    if (playerLives > 0) {
        // Respawn player on the active elevator
        if (activeElevator) {
            controls.getObject().position.set(
                activeElevator.platform.position.x,
                activeElevator.platform.position.y + playerHeight + 0.2,
                activeElevator.platform.position.z
            );
        } // Else, player might be stuck if no active elevator, handle as needed
        playerVelocity.set(0, 0, 0); // Reset velocity
    } else {
        // Game over
        isGameOver = true;
        document.getElementById('gameOver').style.display = 'block';
        setTimeout(() => {
            if (confirm("Game Over! Play again?")) {
                resetGame();
            }
        }, 1000);
    }
}

function respawnPlayer() {
    isPlayerRespawning = false; // Reset respawn flag

    if (playerLives > 0) {
        // Reset player state to upright
        playerState = 'upright';
        playerHeight = 1.7; // Restore upright height
        SETTINGS.playerSpeed = 5.0; // Restore default walking speed

        // Respawn player at a safe position on the active elevator
        if (activeElevator) {
            controls.getObject().position.set(
                activeElevator.platform.position.x,
                activeElevator.platform.position.y + playerHeight + 0.2,
                activeElevator.platform.position.z
            );
        } // Else, consider a default spawn point
        playerVelocity.set(0, 0, 0); // Reset velocity
        console.log("Player respawned standing up.");
    } else {
        // Handle game over
        handlePlayerDeath();
    }
}

function resetGame() {
    playerLives = 3;
    playerScore = 0;
    isGameOver = false;
    document.getElementById('gameOver').style.display = 'none';
    updateUI();

    // Reset player position to the active elevator
    if (activeElevator) {
        controls.getObject().position.set(
            activeElevator.platform.position.x,
            activeElevator.platform.position.y + playerHeight + 0.2,
            activeElevator.platform.position.z
        );
    } // Else, consider a default spawn point
    playerVelocity.set(0, 0, 0);
}

function updatePlayer(deltaTime) {
    const speed = (isSprinting ? SETTINGS.playerSpeed * SETTINGS.sprintMultiplier : SETTINGS.playerSpeed) * deltaTime;
    const cameraObject = controls.getObject(); // This is the holder for the camera

    // Apply gravity
    if (!playerOnGround) {
        playerVelocity.y += SETTINGS.gravity * deltaTime;
    }

    // Calculate movement direction based on camera orientation
    const moveDirection = new THREE.Vector3();
    if (moveForward) moveDirection.z = -1;
    if (moveBackward) moveDirection.z = 1;
    if (moveLeft) moveDirection.x = -1;
    if (moveRight) moveDirection.x = 1;

    moveDirection.normalize(); // Ensure consistent speed diagonally
    moveDirection.applyEuler(cameraObject.rotation); // Apply camera rotation (Y-axis mainly for FPS)

    // New: Calculate escalator boost by casting a ray down from the head (camera) position
    let escalatorBoost = new THREE.Vector3(0, 0, 0);
    const rayOrigin = cameraObject.position.clone();
    const rayDirection = new THREE.Vector3(0, -1, 0);
    const raycaster = new THREE.Raycaster(rayOrigin, rayDirection, 0, 2); // max distance of 2 units
    let allSteps = [];
    for (const key in escalatorSteps.up) {
        allSteps = allSteps.concat(escalatorSteps.up[key]);
    }
    for (const key in escalatorSteps.down) {
        allSteps = allSteps.concat(escalatorSteps.down[key]);
    }
    const intersections = raycaster.intersectObjects(allSteps, false);
    if (intersections.length > 0) {
        const hitStep = intersections[0].object;
        let foundType = null;
        let foundFloor = null;
        for (const floor in escalatorSteps.up) {
            if (escalatorSteps.up[floor].includes(hitStep)) {
                foundType = 'up';
                foundFloor = floor;
                break;
            }
        }
        if (!foundType) {
            for (const floor in escalatorSteps.down) {
                if (escalatorSteps.down[floor].includes(hitStep)) {
                    foundType = 'down';
                    foundFloor = floor;
                    break;
                }
            }
        }
        // For upward escalators, only apply boost if the ray hit is at or below player's feet
        
        if (foundType === 'up') {
            const startMesh = escalatorStarts.up[foundFloor];
            const endMesh = escalatorEnds.up[foundFloor];
            if (startMesh && endMesh) {
                const dir = new THREE.Vector3();
                dir.subVectors(endMesh.position, startMesh.position);
                if (dir.length() !== 0) {
                    dir.normalize();
                    escalatorBoost.add(dir.multiplyScalar(SETTINGS.escalatorSpeed));
                }
            }
        } else if (foundType === 'down') {
        
            const startMesh = escalatorStarts.down[foundFloor];
            const endMesh = escalatorEnds.down[foundFloor];
            if (startMesh && endMesh) {
                const dir = new THREE.Vector3();
                dir.subVectors(endMesh.position, startMesh.position);
                if (dir.length() !== 0) {
                    dir.normalize();
                    escalatorBoost.add(dir.multiplyScalar(SETTINGS.escalatorSpeed));
                }
            }
        }
        if (intersections.length > 0) {
            const hitStep = intersections[0].object;
            let foundType = null, foundFloor = null;
            for (const floor in escalatorSteps.up) {
                if (escalatorSteps.up[floor].includes(hitStep)) {
                    foundType = 'up';
                    foundFloor = floor;
                    break;
                }
                
            }
            if (foundType === 'up') {
                const startMesh = escalatorStarts.up[foundFloor];
                const endMesh = escalatorEnds.up[foundFloor];
                if (startMesh && endMesh) {
                    const dir = new THREE.Vector3().subVectors(endMesh.position, startMesh.position).normalize();
                    const move = dir.multiplyScalar(SETTINGS.escalatorSpeed * deltaTime);
                    cameraObject.position.add(move); // Directly move player
                    escalatorBoost.add(move); // Also apply boost for consistency
                }
            }
            
        }else if (intersections.length > 0) {
            const hitStep = intersections[0].object;
            let foundType = null, foundFloor = null;
            for (const floor in escalatorSteps.down) {
                if (escalatorSteps.down[floor].includes(hitStep)) {
                    foundType = 'down';
                    foundFloor = floor;
                    break;
                }
                
            }
            if (foundType === 'down') {
                const startMesh = escalatorStarts.down[foundFloor];
                const endMesh = escalatorEnds.down[foundFloor];
                if (startMesh && endMesh) {
                    const dir = new THREE.Vector3().subVectors(endMesh.position, startMesh.position).normalize();
                    const move = dir.multiplyScalar(SETTINGS.escalatorSpeed * deltaTime);
                    cameraObject.position.add(move); // Directly move player
                    //escalatorBoost.add(move); // Also apply boost for consistency
                }
            }
            
        }
    }

    const deltaX = moveDirection.x * speed;
    const deltaZ = moveDirection.z * speed;
    // Add escalator boost (scaled by deltaTime) to the normal movement
    const boostX = escalatorBoost.x * deltaTime;
    const boostZ = escalatorBoost.z * deltaTime;
    const totalDeltaX = deltaX + boostX;
    const totalDeltaZ = deltaZ + boostZ;

    // --- Basic Collision Detection (Simple - Check X and Z separately) ---
    // Store original position
    const originalPosition = cameraObject.position.clone();

    // Move X
    cameraObject.position.x += totalDeltaX;
    if (checkCollision()) {
        cameraObject.position.x = originalPosition.x; // Revert X if collision
    }

    // Move Z
    cameraObject.position.z += totalDeltaZ;
    if (checkCollision()) {
        cameraObject.position.z = originalPosition.z; // Revert Z if collision
    }

    // --- Vertical Movement & Ground Check ---
    cameraObject.position.y += playerVelocity.y * deltaTime;

    // Check if player landed on something
    playerOnGround = false;
    if (checkCollision()) {
        // If colliding while moving down, we landed
        if (playerVelocity.y <= 0) {
            playerOnGround = true;
            playerVelocity.y = 0;
            // Adjust position slightly above the collision point to prevent sinking
             // More robust collision would provide the exact collision point
             // For now, revert Y position - this is very basic!
             cameraObject.position.y = originalPosition.y; // Revert Y movement on vertical collision
             // A better approach involves raycasting downwards to find the exact ground position
        } else {
             // Collided while moving up (hit ceiling)
             playerVelocity.y = 0;
             cameraObject.position.y = originalPosition.y; // Revert Y movement
        }
    }

    // Prevent falling through the absolute bottom
    // Player's eye level cannot go below pit top + their current collision height
    const pitTopY = (-SETTINGS.numBasementFloors * SETTINGS.floorHeight) - floorDepth;
    const lowestPlayerEyeLevel = pitTopY + playerHeight;

    if (cameraObject.position.y < lowestPlayerEyeLevel) {
        cameraObject.position.y = lowestPlayerEyeLevel;
        playerVelocity.y = 0;
        playerOnGround = true; 
    }

    // --- Escalator Area Color Logic ---
    let escalatorFound = false;
    let escalatorType = null;
    let escalatorFloor = null;
    const playerPos = controls.getObject().position;

    // Check if player is on any startEscUp
    for (const [floor, mesh] of Object.entries(escalatorStarts.up)) {
        if (isPlayerOnMesh(playerPos, mesh)) {
            escalatorFound = true;
            escalatorType = 'up';
            escalatorFloor = parseInt(floor);
            break;
        }
    }
    // If not on up, check down
    if (!escalatorFound) {
        for (const [floor, mesh] of Object.entries(escalatorStarts.down)) {
            if (isPlayerOnMesh(playerPos, mesh)) {
                escalatorFound = true;
                escalatorType = 'down';
                escalatorFloor = parseInt(floor);
                break;
            }
        }
    }

    // Only update if state changed
    if (
        playerOnEscalator.type !== escalatorType ||
        playerOnEscalator.floor !== escalatorFloor
    ) {
        // Reset all steps to EscalatorMaterial
        for (const [floor, steps] of Object.entries(escalatorSteps.up)) {
            steps.forEach(step => { step.material = window.EscalatorMaterial; });
        }
        for (const [floor, steps] of Object.entries(escalatorSteps.down)) {
            steps.forEach(step => { step.material = window.EscalatorMaterial; });
        }
        // If on an escalator, set its steps to EscalatorEmbarkMaterial
        if (escalatorFound && escalatorType && escalatorFloor !== null) {
            escalatorSteps[escalatorType][escalatorFloor].forEach(step => {
                step.material = window.EscalatorEmbarkMaterial;
            });
        }
        playerOnEscalator.type = escalatorType;
        playerOnEscalator.floor = escalatorFloor;
    }
    
}

// Helper function to check if player is on a mesh (AABB check)
function isPlayerOnMesh(playerPos, mesh) {
    if (!mesh.geometry.boundingBox) {
        mesh.geometry.computeBoundingBox();
    }
    const meshBox = mesh.geometry.boundingBox.clone().applyMatrix4(mesh.matrixWorld);
    // Use a small box for the player feet
    const playerBox = new THREE.Box3().setFromCenterAndSize(
        new THREE.Vector3(playerPos.x, playerPos.y - playerHeight / 2, playerPos.z),
        new THREE.Vector3(0.5, 0.2, 0.5)
    );
    return meshBox.intersectsBox(playerBox);
}

function checkCollision() {
    const playerPosition = controls.getObject().position;
    const playerBox = new THREE.Box3().setFromCenterAndSize(
        playerPosition,
        new THREE.Vector3(0.5, playerHeight, 0.5)
    );
    playerBox.min.y = playerPosition.y - playerHeight;
    playerBox.max.y = playerPosition.y;

    for (const object of worldObjects) {
        if (object.geometry.boundingBox) { // Check if boundingBox is precomputed
            const objectWorldBox = new THREE.Box3().copy(object.geometry.boundingBox).applyMatrix4(object.matrixWorld);
            if (playerBox.intersectsBox(objectWorldBox)) {
                 //console.log("Collision detected with:", object);
                return true; // Collision detected
            }
        } else {
             // Fallback if no precomputed boundingBox (less efficient)
             const tempBox = new THREE.Box3().setFromObject(object);
             if(playerBox.intersectsBox(tempBox)){
                 //console.log("Collision detected (fallback) with:", object);
                 return true;
             }
        }
    }
    return false; // No collision
}

function updateUI() {
    document.getElementById('score').innerText = `Score: ${playerScore}`;
    document.getElementById('lives').innerText = `Lives: ${playerLives}`;
    
    // Calculate and display current floor
    if (controls && controls.isLocked) {
        const playerCameraY = controls.getObject().position.y;
        // Assuming playerHeight is the height from feet to camera. // This comment is fine.
        // Floor index is based on the Y position of the player's feet.
        const playerFeetY = playerCameraY - playerHeight;
        const currentFloor = Math.round(playerFeetY / SETTINGS.floorHeight);
        let floorText = `Floor: ${currentFloor}`;
        if (currentFloor === 0) {
            floorText = "Floor: G";
        } else if (currentFloor < 0) {
            floorText = `Floor: B${Math.abs(currentFloor)}`;
        }
        document.getElementById('floorLevel').innerText = floorText;
    }
}

// --- Animation Loop ---
function animate() {
    if (isGameOver) return; // Stop animation loop if game is over

    requestAnimationFrame(animate);
    const deltaTime = clock.getDelta();

    if (controls.isLocked) {
        updatePlayer(deltaTime);
        updateElevators(deltaTime); // Changed from updateElevator to updateElevators
        updateGarageDoors(deltaTime);
        updateUI(); // <--- Add this line here
        updateLODSystem(); // Add LOD system update
      
        // NEW: Animate down escalator steps along their creation angle.
        const escSpeed = SETTINGS.escalatorSpeed; // speed in units per second
        for (const floor in escalatorSteps.down) {
            const steps = escalatorSteps.down[floor];
                       const startMesh = escalatorStarts.down[floor];
            const endMesh = escalatorEnds.down[floor];
            if (startMesh && endMesh) {
                // Compute the direction vector from start to end
                const dir = new THREE.Vector3();
                dir.subVectors(endMesh.position, startMesh.position);
                const totalDistance = dir.length();
                dir.normalize();
                
                steps.forEach(step => {
                    if (step.material === window.EscalatorEmbarkMaterial) {
                        // Move step along the computed direction
                        step.position.addScaledVector(dir, escSpeed * deltaTime);
                        // If step traveled beyond the total escalator distance, reset its position to the start.
                        if (step.position.distanceTo(startMesh.position) >= totalDistance) {
                            step.position.copy(startMesh.position);
                        }
                    }
                });
            }
        }

        // NEW: Animate up escalator steps along their creation angle.
        for (const floor in escalatorSteps.up) {
            const steps = escalatorSteps.up[floor];
            const startMesh = escalatorStarts.up[floor];
            const endMesh = escalatorEnds.up[floor];
            if (startMesh && endMesh) {

                // Compute the direction vector from start up to end
                const dirUp = new THREE.Vector3();
                dirUp.subVectors(endMesh.position, startMesh.position);
                const totalDistanceUp = dirUp.length();
                dirUp.normalize();

                steps.forEach(step => {
                    if (step.material === window.EscalatorEmbarkMaterial) {
                        // Move step along the computed direction
                        step.position.addScaledVector(dirUp, escSpeed * deltaTime);
                        // If the step reaches (or exceeds) the end, reset position to start
                        if (step.position.distanceTo(startMesh.position) >= totalDistanceUp) {
                            step.position.copy(startMesh.position);
                        }
                    }
                });
            }
        }

        // --- Animate Room Lights ---
        lights.forEach(lightGroup => {
            if (lightGroup.userData.isRoomLight && lightGroup.userData.animationState.isAnimating) {
                const animationState = lightGroup.userData.animationState;
                const elapsed = performance.now() - animationState.startTime;
                const progress = Math.min(elapsed / animationState.duration, 1);

                // Simple linear interpolation
                lightGroup.userData.pointLight.intensity = THREE.MathUtils.lerp(
                    animationState.startLightIntensity,
                    animationState.targetLightIntensity,
                    progress
                );
                lightGroup.userData.bulbMesh.material.emissiveIntensity = THREE.MathUtils.lerp(
                    animationState.startBulbEmissive,
                    animationState.targetBulbEmissive,
                    progress
                );
                 lightGroup.userData.bottomLightDisk.material.emissiveIntensity = THREE.MathUtils.lerp(
                    animationState.startDiskEmissive,
                    animationState.targetDiskEmissive,
                    progress
                );
                lightGroup.userData.bulbMesh.material.needsUpdate = true;
                lightGroup.userData.bottomLightDisk.material.needsUpdate = true;

                if (progress >= 1) {
                    animationState.isAnimating = false; // Animation finished
                }
            }
        });

        // --- Debug Overlay Update ---
        const playerPos = controls.getObject().position;
        document.getElementById('playerCoords').innerText = `Player: (x: ${playerPos.x.toFixed(2)}, y: ${playerPos.y.toFixed(2)}, z: ${playerPos.z.toFixed(2)})`;

        const raycaster = new THREE.Raycaster();
        const pointer = new THREE.Vector2(0, 0); // Center of the screen
        raycaster.setFromCamera(pointer, camera);

        // Intersect with world objects, doors, and lights
        const objectsToCheck = [...worldObjects, ...doors, ...lights.flatMap(lg => lg.children)]; // Flatten lights group
        const intersects = raycaster.intersectObjects(objectsToCheck, false); // Don't check recursively unless needed

        let pointedObjectInfo = "Looking at: None"; // Default text

        if (intersects.length > 0) {
            const hit = intersects[0]; // Get the full intersection result
            const hitObject = hit.object;

            // Get common info
            const objectId = hitObject.id;
            const objectName = hitObject.name || "Unnamed"; // <-- Get the name, provide fallback
            const worldPosition = new THREE.Vector3();
            hitObject.getWorldPosition(worldPosition); // Calculate world position

            // Get dimensions (handle different geometry types)
            let dimensions = "N/A";
            let objectType = "Unknown"; // Default type

            if (hitObject.geometry) {
                objectType = hitObject.geometry.type || "Unknown"; // Get geometry type
                if (hitObject.geometry.parameters) {
                    const params = hitObject.geometry.parameters;
                    if (objectType === 'BoxGeometry') {
                        dimensions = `W: ${params.width?.toFixed(2) ?? '?'}, H: ${params.height?.toFixed(2) ?? '?'}, D: ${params.depth?.toFixed(2) ?? '?'}`;
                    } else if (objectType === 'PlaneGeometry') {
                        dimensions = `W: ${params.width?.toFixed(2) ?? '?'}, H: ${params.height?.toFixed(2) ?? '?'}`;
                    } else if (objectType === 'ConeGeometry') {
                        dimensions = `R: ${params.radius?.toFixed(2) ?? '?'}, H: ${params.height?.toFixed(2) ?? '?'}`;
                    } else if (objectType === 'SphereGeometry') {
                        dimensions = `R: ${params.radius?.toFixed(2) ?? '?'}`;
                    } else if (objectType === 'CircleGeometry') {
                        dimensions = `R: ${params.radius?.toFixed(2) ?? '?'}`;
                    }
                    // Add more geometry types here if needed
                }
            }

            // Construct the output string - Added Name
            pointedObjectInfo = `Looking at: Name: ${objectName} | ID: ${objectId} | ` +
                                `Type: ${objectType} | ` +
                                `Dims: ${dimensions} | ` +
                                `World: (${worldPosition.x.toFixed(2)}, ${worldPosition.y.toFixed(2)}, ${worldPosition.z.toFixed(2)})`;

             // You could still add specific checks, e.g., if it's a door or part of a light
             if (doors.includes(hitObject)) {
                 pointedObjectInfo += ` (Door - Red: ${hitObject.userData.isRed})`;
             } else if (lights.some(lg => lg.children.includes(hitObject))) {
                 pointedObjectInfo += ` (Part of Light)`;
             } else { // Check for elevator parts among other objects
                const hitElevator = elevators.find(e => e.platform === hitObject || e.roof === hitObject);
                if (hitElevator) {
                    pointedObjectInfo += ` (Elevator ${hitElevator.id} ${hitObject === hitElevator.platform ? 'Platform' : 'Roof'})`;
                }
             }
             // Add more specific checks if needed

        }

        // --- Find object player is standing on ---
        let standingOnInfo = "None";
        const playerFeet = controls.getObject().position.clone();
        playerFeet.y -= playerHeight / 2 + 0.01; // Just below player's feet

        // Use a small box under the player to check for collisions with worldObjects
        const playerStandBox = new THREE.Box3().setFromCenterAndSize(
            new THREE.Vector3(playerFeet.x, playerFeet.y - 0.05, playerFeet.z),
            new THREE.Vector3(0.45, 0.12, 0.45)
        );

        let foundStanding = null;
        for (const obj of worldObjects) {
            // Compute or get bounding box
            let objBox;
            if (obj.geometry && obj.geometry.boundingBox) {
                objBox = obj.geometry.boundingBox.clone().applyMatrix4(obj.matrixWorld);
            } else {
                objBox = new THREE.Box3().setFromObject(obj);
            }
            if (playerStandBox.intersectsBox(objBox)) {
                foundStanding = obj;
                break;
            }
        }

        if (foundStanding) {
            // Get info for the object
            const obj = foundStanding;
            const objId = obj.id;
            const objName = obj.name || "Unnamed";
            const objType = obj.geometry?.type || "Unknown";
            let objDims = "N/A";
            if (obj.geometry && obj.geometry.parameters) {
                const params = obj.geometry.parameters;
                if (objType === 'BoxGeometry') {
                    objDims = `W: ${params.width?.toFixed(2) ?? '?'}, H: ${params.height?.toFixed(2) ?? '?'}, D: ${params.depth?.toFixed(2) ?? '?'}`;
                } else if (objType === 'PlaneGeometry') {
                    objDims = `W: ${params.width?.toFixed(2) ?? '?'}, H: ${params.height?.toFixed(2) ?? '?'}`;
                } else if (objType === 'ConeGeometry') {
                    objDims = `R: ${params.radius?.toFixed(2) ?? '?'}, H: ${params.height?.toFixed(2) ?? '?'}`;
                } else if (objType === 'SphereGeometry') {
                    objDims = `R: ${params.radius?.toFixed(2) ?? '?'}`;
                } else if (objType === 'CircleGeometry') {
                    objDims = `R: ${params.radius?.toFixed(2) ?? '?'}`;
                }
            }
            const objWorldPos = new THREE.Vector3();
            obj.getWorldPosition(objWorldPos);
            standingOnInfo = `Name: ${objName} | ID: ${objId} | Type: ${objType} | Dims: ${objDims} | World: (${objWorldPos.x.toFixed(2)}, ${objWorldPos.y.toFixed(2)}, ${objWorldPos.z.toFixed(2)})`;
        }

        // Show standing on info in playerCoords and pointedObject
        document.getElementById('playerCoords').innerText += ` | Standing on: ${standingOnInfo}`;
        document.getElementById('pointedObject').innerText = pointedObjectInfo + ` | Standing on: ${standingOnInfo}`;

        // --- Find objects player is colliding with ---
        //const playerStandBox = new THREE.Box3().setFromCenterAndSize(
        //    new THREE.Vector3(playerFeet.x, playerFeet.y - 0.05, playerFeet.z),
        //    new THREE.Vector3(0.45, 0.12, 0.45)
        //);

        let collidingObjects = [];
        for (const obj of worldObjects) {
            let objBox;
            if (obj.geometry && obj.geometry.boundingBox) {
                objBox = obj.geometry.boundingBox.clone().applyMatrix4(obj.matrixWorld);
            } else {
                objBox = new THREE.Box3().setFromObject(obj);
            }
            if (playerStandBox.intersectsBox(objBox)) {
                collidingObjects.push(obj);
            }
        }

        let collisionInfo = "None";
        if (collidingObjects.length > 0) {
            collisionInfo = collidingObjects.map(obj => {
                const objId = obj.id;
                const objName = obj.name || "Unnamed";
                const objType = obj.geometry?.type || "Unknown";
                const worldPos = new THREE.Vector3();
                obj.getWorldPosition(worldPos);
                return `Name: ${objName}, ID: ${objId}, Type: ${objType}, World: (${worldPos.x.toFixed(2)}, ${worldPos.y.toFixed(2)}, ${worldPos.z.toFixed(2)})`;
            }).join(" | ");
        }

        // Update the output (adjust element IDs as needed)
        document.getElementById('playerCoords').innerText = `Player: (${controls.getObject().position.x.toFixed(2)}, ${controls.getObject().position.y.toFixed(2)}, ${controls.getObject().position.z.toFixed(2)}) | Colliding with: ${collisionInfo}`;
        document.getElementById('pointedObject').innerText = pointedObjectInfo + ` | Colliding with: ${collisionInfo}`;
        // --- End Debug Overlay Update ---
        
        // --- Find object directly beneath the player using a downward ray ---
        const maxDistance = 2; // Adjust as needed
        const downDirection = new THREE.Vector3(0, -1, 0);
        const downRaycaster = new THREE.Raycaster(controls.getObject().position, downDirection, 0, maxDistance);
        const downIntersections = downRaycaster.intersectObjects(worldObjects, true);

        let belowCollisionInfo = "None";
        if (downIntersections.length > 0) {
            const hit = downIntersections[0]; // closest intersected object
            const hitObject = hit.object;
            const objName = hitObject.name || "Unnamed";

            // Check if the player is over "Right Escalator Up..." or "Left Escalator Down..."
            if (objName.startsWith("Right Escalator Up")) {
                const floorIndex = parseInt(objName.match(/\d+/)[0]); // Extract floor index
                escalatorSteps.up[floorIndex].forEach(step => {
                    step.material = window.EscalatorEmbarkMaterial; // Change material
                });
            } else if (objName.startsWith("Left Escalator Down")) {
                const floorIndex = parseInt(objName.match(/\d+/)[0]); // Extract floor index
                escalatorSteps.down[floorIndex].forEach(step => {
                    step.material = window.EscalatorEmbarkMaterial; // Change material
                });
            }

            // Reset step materials if above "Left Escalator Down End...", "Right Escalator Up End...", or any floor object
            if (
                objName.startsWith("Left Escalator Down End") || 
                objName.startsWith("Right Escalator Up End") || 
                objName.includes("Floor") // Check if "Floor" is anywhere in the name
            ) {
                for (const steps of Object.values(escalatorSteps.up)) {
                    steps.forEach(step => {
                        step.material = window.EscalatorMaterial; // Reset material
                    });
                }
                for (const steps of Object.values(escalatorSteps.down)) {
                    steps.forEach(step => {
                        step.material = window.EscalatorMaterial; // Reset material
                    });
                }
            }

            const objId = hitObject.id;
            const objType = hitObject.geometry?.type || "Unknown";
            const worldPos = new THREE.Vector3();
            hitObject.getWorldPosition(worldPos);
            belowCollisionInfo = `Name: ${objName}, ID: ${objId}, Type: ${objType}, World: (${worldPos.x.toFixed(2)}, ${worldPos.y.toFixed(2)}, ${worldPos.z.toFixed(2)})`;
        }

        // Update the output elements with the collision info:
        document.getElementById('playerCoords').innerText = 
            `Player: (${controls.getObject().position.x.toFixed(2)}, ${controls.getObject().position.y.toFixed(2)}, ${controls.getObject().position.z.toFixed(2)}) | Below: ${belowCollisionInfo}`;
        document.getElementById('pointedObject').innerText = 
            pointedObjectInfo + ` | Below: ${belowCollisionInfo}`;
    }

    renderer.render(scene, camera);
}

function updateGarageDoors(deltaTime) {
    for (let i = animatedGarageDoors.length - 1; i >= 0; i--) {
        const door = animatedGarageDoors[i];
        if (door.userData.isAnimating) {
            const currentRotation = door.rotation.x;
            const targetRotation = door.userData.targetRotationX;
            const rotationSpeed = Math.PI / 2 * deltaTime * 0.8; // Adjust speed as needed (radians per second)

            if (Math.abs(currentRotation - targetRotation) < rotationSpeed) {
                door.rotation.x = targetRotation;
                door.userData.isAnimating = false;
                animatedGarageDoors.splice(i, 1); // Remove from active animation list
            } else {
                door.rotation.x += Math.sign(targetRotation - currentRotation) * rotationSpeed;
            }
        } else {
            // Should not happen if logic is correct, but good for cleanup
            animatedGarageDoors.splice(i, 1);
        }
    }
}

// --- LOD System Functions ---
function updateSingleRoomVisibility(roomData) {
    if (!roomData || !roomData.contentsGroup || !roomData.lamp) return;

    const shouldBeVisible = roomData.visibleByDoor || roomData.visibleByWindow;

    if (roomData.contentsGroup.visible !== shouldBeVisible) {
        roomData.contentsGroup.visible = shouldBeVisible;
        // console.log(`Room ${roomData.id} contents visibility: ${shouldBeVisible}`);
    }

    const roomLampGroup = roomData.lamp;
    if (roomLampGroup.userData && roomLampGroup.userData.pointLight) {
        if (shouldBeVisible && roomLampGroup.userData.isOn && !roomLampGroup.userData.isDestroyed) {
            // Check animation state to avoid overriding a fade-out
            if (!roomLampGroup.userData.animationState.isAnimating || roomLampGroup.userData.animationState.targetLightIntensity > 0) {
                roomLampGroup.userData.pointLight.intensity = 1.0; // Default "on" intensity for room lights
            }
        } else {
            roomLampGroup.userData.pointLight.intensity = 0;
        }
    }
}

function updateLODSystem() {
    const playerPos = controls.getObject().position;
    const playerDirection = new THREE.Vector3();
    camera.getWorldDirection(playerDirection);

    // Check if player is generally outside the main building's corridor/room area
    const isOutsideBuilding = playerPos.x < -SETTINGS.roomSize + 1 || playerPos.x > SETTINGS.corridorWidth + SETTINGS.roomSize -1 ;

    allRoomsData.forEach(roomData => {
        let isVisibleByWindowThisFrame = false;

        if (roomData.windowGlass && isOutsideBuilding && !roomData.visibleByDoor) {
            // Check line of sight for window visibility from outside
            // (This part of your existing logic determines if contents should be visible)
            // For simplicity, we'll assume if conditions are met, player *could* see in.
            // The actual visibility check (distance, angle) is already in your code:
            // const windowPos = new THREE.Vector3(); roomData.windowGlass.getWorldPosition(windowPos); ...
            // For this example, let's assume `isVisibleByWindowThisFrame` is determined by your existing checks.
            // For now, let's just use a simplified check for demonstration of material switching.
            // Replace this with your more detailed dotProduct/distance check
            const windowPos = new THREE.Vector3(); roomData.windowGlass.getWorldPosition(windowPos);
            if (playerPos.distanceTo(windowPos) < 35) { // Simplified check
                 const vectorToWindow = new THREE.Vector3().subVectors(windowPos, playerPos).normalize();
                 const dotProduct = playerDirection.dot(vectorToWindow);
                 if (dotProduct > 0.25) {
                    isVisibleByWindowThisFrame = true;
                 }
            }

            // Now, manage the window material based on this
            if (isVisibleByWindowThisFrame) {
                if (roomData.transparentMaterial && roomData.windowGlass.material !== roomData.transparentMaterial) {
                    roomData.windowGlass.material = roomData.transparentMaterial;
                }
            } else {
                if (roomData.opaqueMaterial && roomData.windowGlass.material !== roomData.opaqueMaterial) {
                    roomData.windowGlass.material = roomData.opaqueMaterial;
                }
            }
        }
        if (roomData.visibleByWindow !== isVisibleByWindowThisFrame) {
            roomData.visibleByWindow = isVisibleByWindowThisFrame;
            updateSingleRoomVisibility(roomData);
        }
    });
}
// --- Start the application ---
init();

const enemyGeometry = new THREE.BoxGeometry(1, 2, 1); // Example geometry for an enemy
const enemyMaterial = new THREE.MeshStandardMaterial({ color: 0xff0000 }); // Example material for an enemy

//const enemy = new THREE.Mesh(enemyGeometry, enemyMaterial);
//enemy.position.set(x, y, z); // Set the enemy's position
//scene.add(enemy);
//enemies.push(enemy); // Add the enemy to the array