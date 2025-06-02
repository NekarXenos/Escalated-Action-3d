import * as THREE from 'three';
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';
import { FontLoader } from 'three/addons/loaders/FontLoader.js';
import { TextGeometry } from 'three/addons/geometries/TextGeometry.js';
import { calculateEscalatorBoost, animateActiveEscalatorSteps, updateEscalatorStepVisuals } from './escalator.js';

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
let playerBox; // Added: Global player's collision box
let clock;
let playerVelocity = new THREE.Vector3();
let playerOnGround = false;
let moveForward = false, moveBackward = false, moveLeft = false, moveRight = false, isSprinting = false;
let playerHeight = 1.7; // Camera height offset
let isCrouching = false; // New crouch state
let playerState = 'upright'; // Possible states: 'upright', 'crouching', 'prone'
let isWireframeView = false; // For wireframe debug view

// let elevator, elevatorTargetY = 0, isElevatorMoving = false, elevatorDirection = 0; // Old single elevator state
// let currentFloorIndex = 0; // Old single elevator state
const elevators = []; // Array to store all elevator objects
let activeElevator = null; // The elevator currently being controlled or closest to the player

const escalatorLength = SETTINGS.escalatorLength; // Use the defined escalator length
const escalatorWidth = SETTINGS.escalatorWidth;
const roomSize = SETTINGS.roomSize; // Use the defined room size
const elevatorSize = SETTINGS.elevatorSize; // Use the defined elevator size
// let buildingWidth = SETTINGS.corridorWidth + (2 * roomSize); // Total width of the building - will be recalculated
const worldCentre = new THREE.Vector3(SETTINGS.corridorWidth / 2, 0, -8); // Center of the world for reference

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
const escalatorStepsB = {
    up: {},   // { floorIndex: [stepUpMesh, ...] }
    down: {}  // { floorIndex: [stepDownMesh, ...] }
};
const escalatorStarts = {
    up: {},   // { floorIndex: startEscUpMesh }
    down: {}  // { floorIndex: startEscDownMesh }
};
const escalatorStartsB = {
    up: {},   // { floorIndex: startEscUpMesh }
    down: {}  // { floorIndex: startEscDownMesh }
};
const escalatorEnds = { 
    up: {},   // For up steps if needed in future
    down: {}  // For down-step ending points
};
const escalatorEndsB = { 
    up: {},   // For up steps if needed in future
    down: {}  // For down-step ending points
};
let playerOnEscalator = { type: null, floor: null, wing: null }; // Track which escalator area player is on

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
const lampConeGeo = new THREE.ConeGeometry(0.3, 0.2, 8);
const lampChainGeo = new THREE.BoxGeometry(0.05, 0.5, 0.05);
const lampBulbGeo = new THREE.SphereGeometry(0.08, 8, 8); // bulbRadius = 0.08
const lampBottomDiskGeo = new THREE.CircleGeometry(0.3, 16);

// Materials for standard corridor/area lamps (non-animated parts)
const lampChainMaterial = new THREE.MeshStandardMaterial({ color: 0x111111 });
const lampLampshadeMaterial = new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0x000000, emissiveIntensity: 0.0 });
// This material is for the glowing disk of corridor/area lamps, which is statically emissive.
const lampCorridorDiskMaterial = new THREE.MeshStandardMaterial({ color: 0xffaa77, emissive: 0xffaa77, emissiveIntensity: 1 });
// lightBulbMaterial (for the bulb itself) will be passed in, as it's already globally defined in generateWorld.

// --- Window Constants ---
const WINDOW_WIDTH_RATIO = 0.7;
const WINDOW_HEIGHT_RATIO = 0.6;
const WINDOW_SILL_RATIO = 0.2; // of wallHeight


// --- Initialization ---
let frameTimes = [];
let performanceCheckDone = false;
let downgradeTriggered = false;

function checkPerformanceAndDowngrade() {
    if (performanceCheckDone) return;
    const now = performance.now();
    frameTimes.push(now);

    // Only keep the last 10 seconds of frame times
    while (frameTimes.length > 2 && (now - frameTimes[0]) > 10000) {
        frameTimes.shift();
    }

    // After 10 seconds, check average FPS
    if ((now - frameTimes[0]) >= 10000 && !downgradeTriggered) {
        const avgFPS = (frameTimes.length - 1) / ((frameTimes[frameTimes.length - 1] - frameTimes[0]) / 1000);
        if (avgFPS < 30) {
            downgradeAllMaterials();
            downgradeTriggered = true;
            // Optional: Show a message
            const msg = document.createElement('div');
            msg.style.position = 'fixed';
            msg.style.top = '10px';
            msg.style.left = '50%';
            msg.style.transform = 'translateX(-50%)';
            msg.style.background = 'rgba(0,0,0,0.7)';
            msg.style.color = '#fff';
            msg.style.padding = '10px 20px';
            msg.style.zIndex = 9999;
            msg.style.fontSize = '18px';
            msg.innerText = 'Performance mode enabled for smoother gameplay.';
            document.body.appendChild(msg);
            setTimeout(() => msg.remove(), 4000);
        }
        performanceCheckDone = true;
    }
}

function downgradeAllMaterials() {
    scene.traverse(obj => {
        if (obj.isMesh && obj.material) {
            // Handle multi-material meshes
            if (Array.isArray(obj.material)) {
                obj.material = obj.material.map(mat => downgradeMaterial(mat));
            } else {
                obj.material = downgradeMaterial(obj.material);
            }
        }
    });
}

function downgradeMaterial(mat) {
    // Only downgrade PBR materials
    if (
        mat.type === 'MeshStandardMaterial' ||
        mat.type === 'MeshPhysicalMaterial' ||
        mat.type === 'MeshPhongMaterial'
    ) {
        // Use color and map if present
        return new THREE.MeshBasicMaterial({
            color: mat.color ? mat.color.clone() : 0xffffff,
            map: mat.map || null,
            transparent: mat.transparent,
            opacity: mat.opacity,
            side: mat.side,
        });
    }
    return mat;
}

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
    const ambientLight = new THREE.AmbientLight(0x115599, 0.1); // Dim bluish ambient light
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
    const shaftCeilingGeo = new THREE.BoxGeometry(config.shaftWidth, floorDepth-0.02, config.shaftDepth);
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

// --- Enemy Settings ---
const ENEMY_SETTINGS = {
    height: 1.8,
    width: 0.5,
    depth: 0.5,
    fireRate: 2000, // milliseconds between shots
    projectileSpeed: 15.0,
    projectileSize: 0.1,
    activationRadius: 40, // Enemies become active if player is within this radius
    losMaxDistance: 50,   // Max distance for line of sight check
};

const projectiles = []; // Array to store active projectiles
const enemyGeometry = new THREE.BoxGeometry(ENEMY_SETTINGS.width, ENEMY_SETTINGS.height, ENEMY_SETTINGS.depth);
const enemyMaterial = new THREE.MeshStandardMaterial({ color: 0xff0000 }); // Red for enemies
const projectileGeometry = new THREE.SphereGeometry(ENEMY_SETTINGS.projectileSize, 8, 8);
const projectileMaterial = new THREE.MeshStandardMaterial({ color: 0xffff00, emissive: 0xffff00, emissiveIntensity: 1 });


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

// --- Enemy Creation ---
function createEnemy(x, y, z, floorIndex) {
    const enemyMesh = new THREE.Mesh(enemyGeometry, enemyMaterial);
    enemyMesh.position.set(x, y + ENEMY_SETTINGS.height / 2, z); // y is base, position at center
    enemyMesh.castShadow = true;
    enemyMesh.userData = {
        type: 'enemy',
        floorIndex: floorIndex,
        lastShotTime: 0,
        health: 100, // Basic health
        gun: null, // To store the gun mesh
        gunLength: 0 // To store gun length for tip calculation
    };

    // Create a gun for the enemy
    const gunLength = 0.7; // Length of the gun barrel
    const gunRadius = 0.05; // Radius of the gun barrel
    const gunGeometry = new THREE.CylinderGeometry(gunRadius, gunRadius, gunLength, 8);
    const gunMaterial = new THREE.MeshStandardMaterial({ color: 0x333333 }); // Dark grey for the gun
    const gunMesh = new THREE.Mesh(gunGeometry, gunMaterial);

    // Orient the gun: Cylinder's length is along its local Y by default.
    // Rotate it to align with the enemy's forward direction (local -Z).
    gunMesh.rotation.x = Math.PI / 2;

    // Position the gun relative to the enemy.
    // The gun's origin is at its center. We position it so the tip protrudes.
    // Move it to the enemy's local +X (right side).
    const gunXOffset = -((ENEMY_SETTINGS.width / 2) + gunRadius + 0.1); // Position further to the left (enemy's right)
    const gunYOffset = ENEMY_SETTINGS.height * 0.2; // Position slightly higher than center
    const gunZOffset = -(ENEMY_SETTINGS.depth / 2 + gunLength / 2 - 0.1); // Protrude forward, slightly more embed for stability
    gunMesh.position.set(gunXOffset, gunYOffset, gunZOffset);

    enemyMesh.add(gunMesh); // Add gun as a child of the enemy
    enemyMesh.userData.gun = gunMesh;
    enemyMesh.userData.gunLength = gunLength;

    // Diagnostic log:
    // console.log(`Enemy ID: ${enemyMesh.id}, Gun ID: ${gunMesh.id}, Gun Parent ID: ${gunMesh.parent ? gunMesh.parent.id : 'null'}, Gun Visible: ${gunMesh.visible}`);

    scene.add(enemyMesh);
    enemies.push(enemyMesh);
    worldObjects.push(enemyMesh); // For collision with player movement and projectiles
    return enemyMesh;
}

// --- Projectile Creation ---
function createProjectile(startPosition, direction, firedByPlayer = false, firer = null) {
    const projectile = new THREE.Mesh(projectileGeometry, projectileMaterial);
    projectile.position.copy(startPosition);
    projectile.userData = {
        type: 'projectile',
        velocity: direction.clone().multiplyScalar(ENEMY_SETTINGS.projectileSpeed),
        spawnTime: clock.getElapsedTime(),
        firedByPlayer: firedByPlayer, // Mark who fired the projectile
        firer: firer // Store the entity that fired the projectile
    };
    // console.log(`Projectile created by ${firer ? firer.name + ' (ID: ' + firer.id + ')' : (firedByPlayer ? 'Player' : 'Unknown')}. Projectile ID: ${projectile.id}`);
    scene.add(projectile);
    projectiles.push(projectile);
    worldObjects.push(projectile); // Add to worldObjects for collision detection
}

// --- Initialization ---
/* function init() {
    clock = new THREE.Clock(); // Initialize clock here
    scene = new THREE.Scene();
    // Set background to a dark blue for a moonlit night
    scene.background = new THREE.Color(0x010309); // Dark blue
    scene.fog = new THREE.Fog(0x010309, 10, 100); // Fog to match the night theme

    // Camera
    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    // Camera position will be set after elevators are created in generateWorld

    // Renderer
    renderer = new THREE.WebGLRenderer({ canvas: document.getElementById('gameCanvas'), antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.shadowMap.enabled = true;

    // Lighting (moved from original spot to be before generateWorld if it depends on scene)
    const ambientLight = new THREE.AmbientLight(0x015599, 0.1); // Dim bluish ambient light
    scene.add(ambientLight);

    const moonlight = new THREE.DirectionalLight(0x015599, 0.3); // Soft bluish moonlight
    moonlight.position.set(-10, 20, -10); // Position the moonlight
    moonlight.castShadow = true;
    scene.add(moonlight);

    // --- Procedural Generation ---
    generateWorld(); // Now clock is initialized, enemies can use it

    // Pointer Lock Controls (after camera is positioned by generateWorld/elevators)
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
    `;

    controls.addEventListener('lock', () => instructions.style.display = 'none');
    controls.addEventListener('unlock', () => instructions.style.display = 'block');
    document.body.addEventListener('click', () => controls.lock());

    // --- Event Listeners ---
    document.addEventListener('mousedown', shoot);
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('keyup', onKeyUp);
    window.addEventListener('resize', onWindowResize);

    // Make the player jump slightly at the start
    playerVelocity.y = 2.0;

    // Start the animation loop
    animate();
} */

// --- World Generation ---
function generateWorld() {
    const totalCorridorLength = SETTINGS.doorsPerSide * SETTINGS.corridorSegmentLength;

    const floorMaterial = new THREE.MeshStandardMaterial({ color: 0xaaaaaa,  side: THREE.DoubleSide });
    const wallMaterial = new THREE.MeshStandardMaterial({ color: 0xbbbbbb }); // Slightly different for testing
    const wallMaterialA = new THREE.MeshStandardMaterial({ color: 0xb0c4c4 }); // Teal tint for A-wing (+Z)
    const wallMaterialB = new THREE.MeshStandardMaterial({ color: 0xc4b8b0 }); // Red-orange tint for B-wing (-Z)
    const whiteMaterial = new THREE.MeshStandardMaterial({ color: 0xffffff, metalness: 0.8, roughness: 0.5 });
    const ceilingMaterial = new THREE.MeshStandardMaterial({ color: 0xcccccc });
    // Make blackDoorMaterial accessible globally or pass it around if needed for interact()
    const textMaterial = new THREE.MeshStandardMaterial({ color: 0xcc9911, metalness: 0.8, roughness: 0.5 });
    
    

    const blackDoorMaterial = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.3 });
    const redDoorMaterial = new THREE.MeshStandardMaterial({ color: 0x121111, roughness: 0.3, emissive: 0x010000, emissiveIntensity: 0.01 }); // Added emissive property
    // Add new B-Wing door material: dark navy blue
    const blueElevatorMaterial = new THREE.MeshStandardMaterial({ color: 0x1111aa, metalness: 0.8, roughness: 0.5 });
    const orangyYellowElevatorMaterial = new THREE.MeshStandardMaterial({ color: 0xFFA500, metalness: 0.7, roughness: 0.4 }); // Orangy Yellow
    const navyDoorMaterial = new THREE.MeshStandardMaterial({ color: 0x002030, roughness: 0.3 });
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
    const EscalatorEmbarkMaterialB = new THREE.MeshStandardMaterial({ color: 0x332211,  metalness: 0.8, roughness: 0.5, emissive: 0x080400, emissiveIntensity: 0.1 }); // Dark Orange for B-Wing

    // Store references globally for use in updatePlayer
    window.EscalatorMaterial = EscalatorMaterial;
    window.EscalatorEmbarkMaterial = EscalatorEmbarkMaterial;
    window.EscalatorEmbarkMaterialB = EscalatorEmbarkMaterialB; // Make B-Wing material global
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

    const fontLoader = new FontLoader();
    fontLoader.load('https://threejs.org/examples/fonts/helvetiker_regular.typeface.json', function (loadedFont) {

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
        startFloorIndex: SETTINGS.numFloors, // Start on the roof level
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
        platformMaterial: orangyYellowElevatorMaterial, 
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
        platformMaterial:  blueElevatorMaterial,
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
        platformMaterial: blueElevatorMaterial,
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
        platformMaterial: blueElevatorMaterial,
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

    // Escalator B Floor Plane (replace PlaneGeometry with BoxGeometry)
    const floorEscBGeo = new THREE.BoxGeometry(SETTINGS.corridorWidth + (2 * escalatorWidth), floorDepth, escalatorLength + 4);
    const floorEscB = new THREE.Mesh(floorEscBGeo, floorMaterial);
    floorEscB.name = `Floor B Escalator`;
    floorEscB.position.set(
        SETTINGS.corridorWidth / 2,
        -floorDepth / 2, // So the top is at y=0
        -16 - (totalCorridorLength + (escalatorLength / 2) + 2 )// Centered in the corridor
    );
    floorEscB.receiveShadow = true;
    scene.add(floorEscB);
    worldObjects.push(floorEscB);


    
    // Roof Plane
    const roofGeo = new THREE.BoxGeometry(buildingWidth, floorDepth/2, 4 + totalCorridorLength + escalatorLength + 8);
    const roof = new THREE.Mesh(roofGeo, floorMaterial);
    roof.name = `Roof`;
    // roof.position.set(SETTINGS.corridorWidth / 2, (SETTINGS.numFloors) * SETTINGS.floorHeight - floorDepth/2, 2 + ((totalCorridorLength + escalatorLength) / 2)); // Old
    roof.position.set(SETTINGS.corridorWidth / 2, (SETTINGS.numFloors) * SETTINGS.floorHeight - floorDepth/4, 2 + ((totalCorridorLength + escalatorLength) / 2));
    roof.receiveShadow = true;
    scene.add(roof);
    worldObjects.push(roof);

    // Roof B Plane
    const roofBGeo = new THREE.BoxGeometry(buildingWidth, floorDepth, 4+4 + totalCorridorLength + escalatorLength + 8);
    const roofB = new THREE.Mesh(roofBGeo, floorMaterial);
    roofB.name = `Roof B`;
    // roof.position.set(SETTINGS.corridorWidth / 2, (SETTINGS.numFloors) * SETTINGS.floorHeight - floorDepth/2, 2 + ((totalCorridorLength + escalatorLength) / 2)); // Old
    roofB.position.set(SETTINGS.corridorWidth / 2, (SETTINGS.numFloors) * SETTINGS.floorHeight - floorDepth/2, 2 -16 -(2 + ((totalCorridorLength + escalatorLength) / 2)));
    roofB.receiveShadow = true;
    scene.add(roofB);
    worldObjects.push(roofB);

    //  roof over Left escalator
    const roofEscLGeo = new THREE.BoxGeometry(SETTINGS.roomSize, floorDepth, 4);
    const roofEscL = new THREE.Mesh(roofEscLGeo, floorMaterial);
    roofEscL.name = `Left Escalator Roof`;
    roofEscL.position.set(
        SETTINGS.corridorWidth +(SETTINGS.roomSize/ 2),
        (SETTINGS.numFloors) * SETTINGS.floorHeight - floorDepth / 2, // So the top is at the roof level        
        - 4 -2// Centered 
    );
    roofEscL.receiveShadow = true;
    scene.add(roofEscL);
    worldObjects.push(roofEscL);

    //  roof over Right escalator
    const roofEscRGeo = new THREE.BoxGeometry(SETTINGS.roomSize, floorDepth, 4);
    const roofEscR = new THREE.Mesh(roofEscRGeo, floorMaterial);
    roofEscR.name = `Right Escalator Roof`;
    roofEscR.position.set(
        - (SETTINGS.roomSize / 2),   
        (SETTINGS.numFloors) * SETTINGS.floorHeight - floorDepth / 2, // So the top is at the roof level
        - 4 -2// Centered
    );
    roofEscR.receiveShadow = true;
    scene.add(roofEscR);
    worldObjects.push(roofEscR);


    // --- Walls for Elevator Penthouse on the Roof ---
    // These walls surround the top part of the elevator shaft that protrudes above the main roof.
    // The individual elevatorObj.shaftCeiling(s) are the roofs *inside* this penthouse.
    const mainRoofSurfaceY = currentElevatorConfig.maxFloorIndex * SETTINGS.floorHeight;
    // Use the Y of the first (middle) elevator's shaft ceiling as reference for penthouse height
    const shaftCeilingBottomY = elevators.find(e => e.id === "mainElevator").shaftCeiling.position.y - floorDepth / 2;
    const penthouseWallHeight = Math.max(0.1, shaftCeilingBottomY - mainRoofSurfaceY);
    const penthouseWallCenterY = mainRoofSurfaceY + penthouseWallHeight / 2;

    // Penthouse Wall Left (Player's Right when facing +Z)
    const penthouseWallLeftGeo = new THREE.BoxGeometry(2*wallDepth, penthouseWallHeight + floorDepth, overallShaftActualDepth);
    const penthouseWallLeft = new THREE.Mesh(penthouseWallLeftGeo, wallMaterial);
    penthouseWallLeft.name = `ElevatorPenthouseWall_Left`;
    penthouseWallLeft.position.set(
        /* overallShaftMinX */ - wallDepth, // Adjusted
        penthouseWallCenterY,
        overallShaftActualCenterZ
    );
    penthouseWallLeft.castShadow = true; penthouseWallLeft.receiveShadow = true;
    scene.add(penthouseWallLeft); worldObjects.push(penthouseWallLeft);

    // Penthouse Wall Right (Player's Left when facing +Z)
    const penthouseWallRightGeo = new THREE.BoxGeometry(wallDepth*2, penthouseWallHeight + floorDepth, overallShaftActualDepth);
    const penthouseWallRight = new THREE.Mesh(penthouseWallRightGeo, wallMaterial);
    penthouseWallRight.name = `ElevatorPenthouseWall_Right`;
    penthouseWallRight.position.set(
        /* overallShaftMaxX */ SETTINGS.elevatorSize + wallDepth, // Adjusted
        penthouseWallCenterY,
        overallShaftActualCenterZ
    );
    penthouseWallRight.castShadow = true; penthouseWallRight.receiveShadow = true;
    scene.add(penthouseWallRight); worldObjects.push(penthouseWallRight);

    // Penthouse Wall Back
    /* const penthouseWallBackGeo = new THREE.BoxGeometry(overallShaftActualWidth, penthouseWallHeight, wallDepth);
    const penthouseWallBack = new THREE.Mesh(penthouseWallBackGeo, wallMaterial);
    penthouseWallBack.name = `ElevatorPenthouseWall_Back`;
    penthouseWallBack.position.set(
        overallShaftActualCenterX, // Adjusted
        penthouseWallCenterY,
        overallShaftMinZ - wallDepth / 2
    );
    penthouseWallBack.castShadow = true; penthouseWallBack.receiveShadow = true;
    scene.add(penthouseWallBack); worldObjects.push(penthouseWallBack); */

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

    // RoofTop B-Wing Spot Light
    // --- Floodlight on Elevator Shaft Roof ---
    //const floodlightHousingMaterial = new THREE.MeshStandardMaterial({ color: 0x333333, metalness: 0.7, roughness: 0.4 });
    //const floodlightLensMaterial = new THREE.MeshStandardMaterial({ color: 0xFFFFEE, emissive: 0xFFFFDD, emissiveIntensity: 0.5 }); // Slightly glowing lens

    const floodlightHousingGeoB = new THREE.BoxGeometry(0.8, 0.4, 0.4); // width, height, depth
    const floodlightHousingB = new THREE.Mesh(floodlightHousingGeoB, floodlightHousingMaterial);

    const floodlightLensGeoB = new THREE.CylinderGeometry(0.15, 0.18, 0.1, 16); // radiusTop, radiusBottom, height, segments
    const floodlightLensB = new THREE.Mesh(floodlightLensGeoB, floodlightLensMaterial);
    floodlightLensB.rotation.x = Math.PI / 2;
    floodlightLensB.position.z = -0.2; // Position at the front of the housing

    const floodlightAssemblyB = new THREE.Group();
    floodlightAssemblyB.add(floodlightHousingB);
    floodlightAssemblyB.add(floodlightLensB);

    floodlightAssemblyB.name = "FloodlightAssembly_B";

    // Position the floodlight assembly on top of the 'Top Roof over Elevator'
    // Use the middle elevator's shaft ceiling for floodlight positioning
    //const middleElevatorShaftCeiling = elevators.find(e => e.id === "mainElevator").shaftCeiling;
    //const shaftCeilingSurfaceY = middleElevatorShaftCeiling.position.y + floorDepth / 2;
    floodlightAssemblyB.position.set(
        middleElevatorShaftCeiling.position.x, // Centered on X of middle elevator's ceiling
        shaftCeilingSurfaceY + 0.2, // Housing height/2 = 0.4/2 = 0.2
        middleElevatorShaftCeiling.position.z - (overallShaftActualDepth / 2) + 0.3 // Near the edge facing the main roof
    );
    scene.add(floodlightAssemblyB);

    const rooftopSpotLightB = new THREE.SpotLight(0xffffff, 20, 200, Math.PI / 3, 1, 1.5); // color, intensity, distance, angle, penumbra, decay
    rooftopSpotLightB.position.copy(floodlightAssemblyB.position);
    rooftopSpotLightB.position.z -= 0.2; // Emitter slightly in front of housing
    // Target the center of the main roof area
    // const totalCorridorLength = SETTINGS.doorsPerSide * SETTINGS.corridorSegmentLength; // Already defined
    //const mainRoofCenterY = (SETTINGS.numFloors) * SETTINGS.floorHeight;
    const mainRoofCenterZB = -8-4 - ((totalCorridorLength + SETTINGS.escalatorLength) / 2);
    rooftopSpotLightB.target.position.set(SETTINGS.corridorWidth / 2, mainRoofCenterY, mainRoofCenterZB);

    rooftopSpotLightB.castShadow = true;
    rooftopSpotLightB.shadow.mapSize.width = 1024;
    rooftopSpotLightB.shadow.mapSize.height = 1024;
    rooftopSpotLightB.shadow.camera.near = 1;
    rooftopSpotLightB.shadow.camera.far = 200;
    rooftopSpotLightB.shadow.focus = 1; // Softer shadows

    scene.add(rooftopSpotLightB);
    scene.add(rooftopSpotLightB.target); // Important: add the target to the scene as well

    //End RoofTop B-Wing Spot Light


    // --- Rooftop Perimeter Walls ---
    const rooftopWallHeight = 1.0; // Low walls
    const rooftopWallThickness = 0.5; // Wide walls
    const rooftopWallMaterial = wallMaterial.clone(); 
    rooftopWallMaterial.color.set(0x777777); // Different color for rooftop walls to avoid z-fighting

    const roofActualWidth = buildingWidth; // Use the potentially wider buildingWidth
    const roofActualDepth = totalCorridorLength + SETTINGS.escalatorLength + 12;
    const roofActualCenterX = overallShaftActualCenterX; // Center roof with the shaft/building
    const roofActualCenterZ = 2 + ((totalCorridorLength + SETTINGS.escalatorLength) / 2); // Z center remains the same
    const roofActualCenterZB = -16 - (2 + ((totalCorridorLength + SETTINGS.escalatorLength) / 2)); // Z center remains the same
    const roofTopSurfaceY = (SETTINGS.numFloors) * SETTINGS.floorHeight; // Top Y of the main roof slab
    
    const wallYPos = roofTopSurfaceY + rooftopWallHeight / 2; // Position walls to sit ON the roof surface

    // Wall 1: Far Z (Positive Z end of the roof)
    const wallFarZGeo = new THREE.BoxGeometry(roofActualWidth, rooftopWallHeight, rooftopWallThickness);
    const wallFarZ = new THREE.Mesh(wallFarZGeo, rooftopWallMaterial);
    wallFarZ.position.set(roofActualCenterX, wallYPos, roofActualCenterZ + roofActualDepth / 2 - rooftopWallThickness / 2);
    wallFarZ.name = "RooftopWall_FarZ";
    wallFarZ.castShadow = true; wallFarZ.receiveShadow = true; wallFarZ.geometry.computeBoundingBox();
    scene.add(wallFarZ); worldObjects.push(wallFarZ);

    // Wall 1B: Far Z (Nagative Z end of the roof)
    const wallFarZBGeo = new THREE.BoxGeometry(roofActualWidth, rooftopWallHeight, rooftopWallThickness);
    const wallFarZB = new THREE.Mesh(wallFarZBGeo, rooftopWallMaterial);
    wallFarZB.position.set(roofActualCenterX, wallYPos, roofActualCenterZB - roofActualDepth / 2 + rooftopWallThickness / 2);
    wallFarZB.name = "RooftopWall_B_FarZ";
    wallFarZB.castShadow = true; wallFarZB.receiveShadow = true; wallFarZB.geometry.computeBoundingBox();
    scene.add(wallFarZB); worldObjects.push(wallFarZB);

    // Wall 2: Near Z (Negative Z end of the roof), with opening for elevator
    // Elevator opening X: from 0 to SETTINGS.corridorWidth. Roof X spans from -SETTINGS.roomSize to SETTINGS.corridorWidth + SETTINGS.roomSize
    // const nearWallZPos = roofActualCenterZ - roofActualDepth / 2 + rooftopWallThickness / 2;

   

    // Wall 3: Side X (Negative X side of roof, at X = -SETTINGS.roomSize)
    const wallSideLeftGeo = new THREE.BoxGeometry(rooftopWallThickness, rooftopWallHeight, roofActualDepth + 2);
    const wallSideLeft = new THREE.Mesh(wallSideLeftGeo, rooftopWallMaterial);
    wallSideLeft.position.set(roofActualCenterX - roofActualWidth / 2 + rooftopWallThickness / 2, wallYPos, roofActualCenterZ - 1);
    wallSideLeft.name = "RooftopWall_SideLeft";
    wallSideLeft.castShadow = true; wallSideLeft.receiveShadow = true; wallSideLeft.geometry.computeBoundingBox();
    scene.add(wallSideLeft); worldObjects.push(wallSideLeft);

    // Wall 3B : Side X (Negative X side of roof, at X = -SETTINGS.roomSize)
    const wallSideLeftBGeo = new THREE.BoxGeometry(rooftopWallThickness, rooftopWallHeight, roofActualDepth + 6);
    const wallSideLeftB = new THREE.Mesh(wallSideLeftBGeo, rooftopWallMaterial);
    wallSideLeftB.position.set(roofActualCenterX - roofActualWidth / 2 + rooftopWallThickness / 2, wallYPos, -16-roofActualCenterZ + 3);
    wallSideLeftB.name = "RooftopWall_B_SideLeft";
    wallSideLeftB.castShadow = true; wallSideLeftB.receiveShadow = true; wallSideLeftB.geometry.computeBoundingBox();
    scene.add(wallSideLeftB); worldObjects.push(wallSideLeftB);


    // Wall 4: Side X (Positive X side of roof, at X = SETTINGS.corridorWidth + SETTINGS.roomSize)
    const wallSideRightGeo = new THREE.BoxGeometry(rooftopWallThickness, rooftopWallHeight, roofActualDepth + 2);
    const wallSideRight = new THREE.Mesh(wallSideRightGeo, rooftopWallMaterial);
    wallSideRight.position.set(roofActualCenterX + roofActualWidth / 2 - rooftopWallThickness / 2, wallYPos, roofActualCenterZ - 1);
    wallSideRight.name = "RooftopWall_SideRight";
    wallSideRight.castShadow = true; wallSideRight.receiveShadow = true; wallSideRight.geometry.computeBoundingBox();
    scene.add(wallSideRight); worldObjects.push(wallSideRight);

    // Wall 4B : Side X (Negative X side of roof, at X = -SETTINGS.roomSize)
    const wallSideRightBGeo = new THREE.BoxGeometry(rooftopWallThickness, rooftopWallHeight, roofActualDepth + 6);
    const wallSideRightB = new THREE.Mesh(wallSideRightBGeo, rooftopWallMaterial);
    wallSideRightB.position.set(roofActualCenterX + roofActualWidth / 2 - rooftopWallThickness / 2, wallYPos, -16-roofActualCenterZ + 3);
    wallSideRightB.name = "RooftopWall_B_SideRight";
    wallSideRightB.castShadow = true; wallSideRightB.receiveShadow = true; wallSideRightB.geometry.computeBoundingBox();
    scene.add(wallSideRightB); worldObjects.push(wallSideRightB);

    
/*     // Wall 5 : Side X (Negative X side of roof, at X = -SETTINGS.roomSize)
    const wallSideLeftBGeo = new THREE.BoxGeometry(rooftopWallThickness, rooftopWallHeight, roofActualDepth);
    const wallSideLeftB = new THREE.Mesh(wallSideLeftBGeo, rooftopWallMaterial);
    wallSideLeftB.position.set(roofActualCenterX - roofActualWidth / 2 + rooftopWallThickness / 2, wallYPos, -16-roofActualCenterZ);
    wallSideLeftB.name = "RooftopWall_B_SideLeft";
    wallSideLeftB.castShadow = true; wallSideLeftB.receiveShadow = true; wallSideLeftB.geometry.computeBoundingBox();
    scene.add(wallSideLeftB); worldObjects.push(wallSideLeftB);

 */


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
        const redDoorIndex = Math.floor(Math.random() * SETTINGS.doorsPerSide * 4);
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

            // Part 2: Right of elevator shaft (X from SETTINGS.corridorWidth to basementMaxX)
            const frontWallRightWidth = basementMaxX - SETTINGS.corridorWidth; // Width of this segment

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
            const floorGeo = new THREE.PlaneGeometry(SETTINGS.corridorWidth + (2*SETTINGS.roomSize), totalCorridorLength);
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

            // --- Add two ceiling lamps at each B wing connector floor (x=0 and x=corridorWidth) ---
            [0, SETTINGS.corridorWidth].forEach((lampX, lampIdx) => {
                createStandardLamp(
                    lampX,
                    floorY + SETTINGS.wallHeight - 0.5,
                    -2-8-4, // Z position for connector lamps
                    i, // floorIndex
                    `Connector_B_F${i}_Idx${lampIdx}`, // lampIdSuffix
                    scene, lights, lightBulbMaterial // Pass scene, lights array, and global bulb material
                );
            });


            // Room Partition Walls
            for (let k = 0; k <= SETTINGS.doorsPerSide; k++) {
                const zPosBoundary = k * SETTINGS.corridorSegmentLength;
                const partRGeo = new THREE.BoxGeometry(SETTINGS.roomSize+(wallDepth*0.8), SETTINGS.wallHeight, wallDepth);
                const partR = new THREE.Mesh(partRGeo, wallMaterialA); // A-wing
                partR.position.set(-SETTINGS.roomSize / 2, floorY + SETTINGS.wallHeight / 2, zPosBoundary);
                partR.castShadow = true; partR.receiveShadow = true; scene.add(partR); worldObjects.push(partR);
                partR.name = `RoomPartition_R_F${i}_Z${k}`;

                // A-Wing Left partition wall
                const partLGeo = new THREE.BoxGeometry(SETTINGS.roomSize +(wallDepth*0.8), SETTINGS.wallHeight, wallDepth);
                const partL = new THREE.Mesh(partLGeo, wallMaterialA); // A-wing
                partL.position.set(SETTINGS.corridorWidth + SETTINGS.roomSize / 2, floorY + SETTINGS.wallHeight / 2, zPosBoundary);
                partL.castShadow = true; partL.receiveShadow = true; scene.add(partL); worldObjects.push(partL);
                partL.name = `RoomPartition_L_F${i}_Z${k}`;
                
                // B-Wing Right partition wall
                const partRBGeo = new THREE.BoxGeometry(SETTINGS.roomSize+(wallDepth*0.8), SETTINGS.wallHeight, wallDepth);
                const partRB = new THREE.Mesh(partRBGeo, wallMaterialB); // B-wing
                partRB.position.set(-SETTINGS.roomSize / 2, floorY + SETTINGS.wallHeight / 2, zPosBoundary - 16 - totalCorridorLength);
                partRB.castShadow = true; partRB.receiveShadow = true; scene.add(partRB); worldObjects.push(partRB);
                partRB.name = `RoomPartition_B_R_F${i}_Z${k}`;

                // B-Wing Left partition wall
                const partLBGeo = new THREE.BoxGeometry(SETTINGS.roomSize +(wallDepth*0.8), SETTINGS.wallHeight, wallDepth);
                const partLB = new THREE.Mesh(partLBGeo, wallMaterialB); // B-wing
                partLB.position.set(SETTINGS.corridorWidth + SETTINGS.roomSize / 2, floorY + SETTINGS.wallHeight / 2, zPosBoundary - 16 - totalCorridorLength);
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
                /* const rFloorGeo = new THREE.BoxGeometry(SETTINGS.roomSize, floorDepth, SETTINGS.corridorSegmentLength);
                const rFloor = new THREE.Mesh(rFloorGeo, floorMaterial);
                rFloor.position.set(roomRXCenter, floorY - floorDepth / 2, segmentCenterZ);
                rFloor.receiveShadow = true; // scene.add(rFloor); worldObjects.push(rFloor); // Will be added to roomContents
                rFloor.name = `RoomFloor_R_F${i}_D${j}`;

                const rCeilingGeo = new THREE.BoxGeometry(SETTINGS.roomSize, roomCeilingThickness, SETTINGS.corridorSegmentLength);
                const rCeiling = new THREE.Mesh(rCeilingGeo, ceilingMaterial); // Use existing ceilingMaterial
                rCeiling.position.set(roomRXCenter, floorY + SETTINGS.wallHeight + roomCeilingThickness / 2, segmentCenterZ);
                rCeiling.castShadow = true; rCeiling.receiveShadow = true;
                rFloor.name = `RoomFloor_R_F${i}_D${j}`; */
                
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
                //rightRoomContents.add(rFloor); worldObjects.push(rFloor); // Add to worldObjects for collision if needed
                //rightRoomContents.add(rCeiling); worldObjects.push(rCeiling);
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
                    const dialRGeo = new THREE.ConeGeometry(dialRadius, dialLength, 10);
                    const dialR = new THREE.Mesh(dialRGeo, dialMaterial);
                    dialR.position.set(safeDepth / 2, 0, 0); dialR.rotation.z = -Math.PI / 2;
                    dialR.userData.isSafeDial = true; dialR.name = `Dial_Safe_R_F${i}_D${j}`; safeR.add(dialR);
                }
                const roomLampR = createRoomLamp(roomRXCenter, floorY + SETTINGS.wallHeight - 0.5, segmentCenterZ, i, rightRoomId, lightBulbMaterial);
                rightRoomContents.add(roomLampR); // Add lamp's visual group

                // Call modified function for pillars and window
                createOuterWall_SegmentFeatures(-SETTINGS.roomSize + wallDepth / 2, segmentCenterZ, SETTINGS.corridorSegmentLength, floorY, SETTINGS.wallHeight, wallDepth, wallMaterialA, opaqueGlassMaterial, glassMaterial, rightRoomId);

                rightRoomContents.visible = false;
                scene.add(rightRoomContents);


                /* allRoomsData.push({
                    id: rightRoomId,
                    door: null, windowGlass: null, opaqueMaterial: null, transparentMaterial: null, contentsGroup: rightRoomContents,
                    visibleByDoor: false, visibleByWindow: false, lamp: roomLampR }
                );  */

                // --- Right Side B Room ---
                const segmentBCenterZ = ((j + 0.5) * SETTINGS.corridorSegmentLength) - 16 - totalCorridorLength;
                const segmentBStartZ = (j * SETTINGS.corridorSegmentLength) - 16 - totalCorridorLength;

                const roomBRXCenter = -SETTINGS.roomSize / 2;
                const isRightBRoomRedDoor = (j === redDoorIndex);
                /* const rFloorBGeo = new THREE.BoxGeometry(SETTINGS.roomSize, floorDepth, SETTINGS.corridorSegmentLength);
                const rFloorB = new THREE.Mesh(rFloorBGeo, floorMaterial);
                rFloorB.position.set(roomBRXCenter, floorY - floorDepth / 2, segmentBCenterZ);
                rFloorB.receiveShadow = true; // scene.add(rFloor); worldObjects.push(rFloor); // Will be added to roomContents
                rFloorB.name = `RoomFloor_B_R_F${i}_D${j}`;

                const rCeilingBGeo = new THREE.BoxGeometry(SETTINGS.roomSize, roomCeilingThickness, SETTINGS.corridorSegmentLength);
                const rCeilingB = new THREE.Mesh(rCeilingBGeo, ceilingMaterial); // Use existing ceilingMaterial
                rCeilingB.position.set(roomRXCenter, floorY + SETTINGS.wallHeight + roomCeilingThickness / 2, segmentBCenterZ);
                rCeilingB.castShadow = true; rCeilingB.receiveShadow = true;
                rCeilingB.name = `RoomCeiling_B_R_F${i}_D${j}`; */
                
                const deskRBGeo = new THREE.BoxGeometry(deskDepth, deskHeight, deskWidth);
                const deskRB = new THREE.Mesh(deskRBGeo, deskMaterial);
                deskRB.rotateY(Math.PI / 2);
                deskRB.position.set(-(SETTINGS.roomSize/2), floorY + deskHeight / 2, segmentBCenterZ +1.3);
                deskRB.castShadow = true; deskRB.receiveShadow = true; // scene.add(deskRB); worldObjects.push(deskRB);
                deskRB.name = `Desk_B_R_F${i}_D${j}`;
                const cabinetRBGeo = new THREE.BoxGeometry(cabinetDepth, cabinetHeight, cabinetWidth);
                const cabinetRB = new THREE.Mesh(cabinetRBGeo, cabinetMaterial);
                cabinetRB.position.set(-SETTINGS.roomSize + cabinetDepth / 2, floorY + cabinetHeight / 2, segmentBStartZ + cabinetWidth / 2 + 0.1);
                cabinetRB.castShadow = true; cabinetRB.receiveShadow = true; // scene.add(cabinetR); worldObjects.push(cabinetR);
                cabinetRB.name = `Cabinet_R_B_F${i}_D${j}`;
                // Chair for Right Room B
                //const chairSeatWidth = 0.5, chairSeatDepth = 0.65, chairSeatHeight = 0.5;
                //const chairBackrestHeight = 0.8, chairBackrestThickness = 0.15;
                const backWallZ_B_R_Chair = segmentBCenterZ + SETTINGS.corridorSegmentLength / 2; // This is the Z of the wall behind the desk
                const chairZ_B_R = 0.1 + (deskRB.position.z + backWallZ_B_R_Chair) / 2; // Position chair between desk and back wall
                const chairX_B_R = -(SETTINGS.roomSize/2);
                const chairY_B_R = floorY + chairSeatHeight / 2;
                const chairBSeat_R = new THREE.Mesh(new THREE.BoxGeometry(chairSeatWidth, chairSeatHeight, chairSeatDepth), deskMaterial);
                chairBSeat_R.position.set(chairX_B_R, chairY_B_R, chairZ_B_R); // scene.add(chairBSeat_R); worldObjects.push(chairBSeat_R);
                const backrestB_R = new THREE.Mesh(new THREE.BoxGeometry(chairSeatWidth, chairBackrestHeight, chairBackrestThickness), deskMaterial);
                backrestB_R.position.set(chairX_B_R, chairY_B_R + chairBackrestHeight / 2, chairZ_B_R + chairSeatDepth / 2 - chairBackrestThickness / 2);
                // scene.add(backrestB_R); worldObjects.push(backrestB_R);
                
                //const rightRoomContents = new THREE.Group();
                const rightRoomBId = `B_R_F${i}_D${j}`;
                rightRoomContents.name = `RoomContents_B_${rightRoomBId}`;
                //rightRoomContents.add(rFloorB); worldObjects.push(rFloorB); // Add to worldObjects for collision if needed
                //rightRoomContents.add(rCeilingB); worldObjects.push(rCeilingB);
                rightRoomContents.add(deskRB); worldObjects.push(deskRB);
                rightRoomContents.add(cabinetRB); worldObjects.push(cabinetRB);
                rightRoomContents.add(chairBSeat_R); worldObjects.push(chairBSeat_R);
                rightRoomContents.add(backrestB_R); worldObjects.push(backrestB_R);

                if (isRightBRoomRedDoor) {
                    const safeRBGeo = new THREE.BoxGeometry(safeDepth, safeHeight, safeWidth);
                    const safeBR = new THREE.Mesh(safeRBGeo, safeMaterial);
                    safeBR.position.set(-SETTINGS.roomSize + safeDepth / 2, floorY + safeHeight / 2, segmentBStartZ + SETTINGS.corridorSegmentLength - safeWidth / 2 - 0.1);
                    safeBR.castShadow = true; safeBR.receiveShadow = true; safeBR.name = `Safe_B_R_F${i}_D${j}`;
                    safeBR.userData = defaultSafeUserData(); // scene.add(safeR); worldObjects.push(safeR);
                    rightRoomContents.add(safeBR); worldObjects.push(safeBR);
                    const dialRBGeo = new THREE.ConeGeometry(dialRadius, dialLength, 10);
                    const dialRB = new THREE.Mesh(dialRBGeo, dialMaterial);
                    dialRB.position.set(safeDepth / 2, 0, 0); dialRB.rotation.z = -Math.PI / 2;
                    dialRB.userData.isSafeDial = true; dialRB.name = `Dial_Safe_B_R_F${i}_D${j}`; safeBR.add(dialRB);
                }
                const roomLampBR = createRoomLamp(roomRXCenter, floorY + SETTINGS.wallHeight - 0.5, segmentBCenterZ, i, rightRoomBId, lightBulbMaterial);
                rightRoomContents.add(roomLampBR); // Add lamp's visual group

                // Call modified function for pillars and window (B-Wing Right)
                createOuterWall_SegmentFeatures(-SETTINGS.roomSize + wallDepth / 2, segmentBCenterZ, SETTINGS.corridorSegmentLength, floorY, SETTINGS.wallHeight, wallDepth, wallMaterialB, opaqueGlassMaterial, glassMaterial, rightRoomBId);

                rightRoomContents.visible = false;
                scene.add(rightRoomContents);

                allRoomsData.push({
                    id: rightRoomId,
                    door: null, windowGlass: null, opaqueMaterial: null, transparentMaterial: null, contentsGroup: rightRoomContents,
                    visibleByDoor: false, visibleByWindow: false, lamp: roomLampBR
                });

                // --- Left Side Room ---
                const roomLXCenter = SETTINGS.corridorWidth + SETTINGS.roomSize / 2;
                const isLeftRoomRedDoor = ((SETTINGS.doorsPerSide + j) === redDoorIndex);
                /* const lFloorGeo = new THREE.BoxGeometry(SETTINGS.roomSize, floorDepth, SETTINGS.corridorSegmentLength);
                const lFloor = new THREE.Mesh(lFloorGeo, floorMaterial);
                lFloor.position.set(roomLXCenter, floorY - floorDepth / 2, segmentCenterZ);
                lFloor.receiveShadow = true; // scene.add(lFloor); worldObjects.push(lFloor);
                lFloor.name = `RoomFloor_L_F${i}_D${j}`;

                const lCeilingGeo = new THREE.BoxGeometry(SETTINGS.roomSize, roomCeilingThickness, SETTINGS.corridorSegmentLength);
                const lCeiling = new THREE.Mesh(lCeilingGeo, ceilingMaterial);
                lCeiling.position.set(roomRXCenter, floorY + SETTINGS.wallHeight + roomCeilingThickness / 2, segmentCenterZ);
                lCeiling.castShadow = true; lCeiling.receiveShadow = true;
                lFloor.name = `RoomFloor_L_F${i}_D${j}`; */
                
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
                // scene.add(backrest_L); worldObjects.push(backrestL);
                
                const leftRoomContents = new THREE.Group();
                const leftRoomId = `L_F${i}_D${j}`;
                leftRoomContents.name = `RoomContents_${leftRoomId}`;
                //leftRoomContents.add(lFloor); worldObjects.push(lFloor);
                //leftRoomContents.add(lCeiling); worldObjects.push(lCeiling);
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
                    const dialLGeo = new THREE.ConeGeometry(dialRadius, dialLength, 10);
                    const dialL = new THREE.Mesh(dialLGeo, dialMaterial);
                    dialL.position.set(-safeDepth / 2, 0, 0); dialL.rotation.z = Math.PI / 2;
                    dialL.userData.isSafeDial = true; dialL.name = `Dial_Safe_L_F${i}_D${j}`; safeL.add(dialL);
                }
                const roomLampL = createRoomLamp(roomLXCenter, floorY + SETTINGS.wallHeight - 0.5, segmentCenterZ, i, leftRoomId, lightBulbMaterial);
                leftRoomContents.add(roomLampL);

                // Call modified function for pillars and window (A-Wing Left)
                createOuterWall_SegmentFeatures(SETTINGS.corridorWidth + SETTINGS.roomSize - wallDepth / 2, segmentCenterZ, SETTINGS.corridorSegmentLength, floorY, SETTINGS.wallHeight, wallDepth, wallMaterialA, opaqueGlassMaterial, glassMaterial, leftRoomId);

                                leftRoomContents.visible = false;
                                scene.add(leftRoomContents);
                                /* allRoomsData.push({ // Ensure new properties are initialized
                                    id: leftRoomId, door: null, windowGlass: null, opaqueMaterial: null, transparentMaterial: null, contentsGroup: leftRoomContents,
                                    visibleByDoor: false, visibleByWindow: false, lamp: roomLampL
                                }); */
                                // --- Left Side B Room ---
                                const roomBLXCenter = SETTINGS.corridorWidth + SETTINGS.roomSize / 2;
                                const isLeftBRoomRedDoor = ((SETTINGS.doorsPerSide + j) === redDoorIndex);
                                /* const lFloorBGeo = new THREE.BoxGeometry(SETTINGS.roomSize, floorDepth, SETTINGS.corridorSegmentLength);
                                const lFloorB = new THREE.Mesh(lFloorBGeo, floorMaterial);
                                lFloorB.position.set(roomBLXCenter, floorY - floorDepth / 2, segmentBCenterZ);
                                lFloorB.receiveShadow = true; // scene.add(lFloor); worldObjects.push(lFloor);
                                lFloorB.name = `RoomFloor_B_L_F${i}_D${j}`;
                
                                const lCeilingBGeo = new THREE.BoxGeometry(SETTINGS.roomSize, roomCeilingThickness, SETTINGS.corridorSegmentLength);
                                const lCeilingB = new THREE.Mesh(lCeilingBGeo, ceilingMaterial);
                                lCeilingB.position.set(roomBLXCenter, floorY + SETTINGS.wallHeight + roomCeilingThickness / 2, segmentBCenterZ);
                                lCeilingB.castShadow = true; lCeilingB.receiveShadow = true;
                                lFloorB.name = `RoomFloor_B_L_F${i}_D${j}`; */
                                
                                const deskLBGeo = new THREE.BoxGeometry(deskDepth, deskHeight, deskWidth);
                                const deskBL = new THREE.Mesh(deskLBGeo, deskMaterial);
                                deskBL.rotateY(Math.PI / 2);
                                deskBL.position.set(SETTINGS.corridorWidth + (SETTINGS.roomSize/2), floorY + deskHeight / 2, segmentBCenterZ +1.3);
                                deskBL.castShadow = true; deskBL.receiveShadow = true; // scene.add(deskL); worldObjects.push(deskL);
                                deskBL.name = `Desk_B_L_F${i}_D${j}`;
                                const cabinetBLGeo = new THREE.BoxGeometry(cabinetDepth, cabinetHeight, cabinetWidth);
                                const cabinetBL = new THREE.Mesh(cabinetBLGeo, cabinetMaterial);
                                cabinetBL.position.set(SETTINGS.corridorWidth + SETTINGS.roomSize - cabinetDepth / 2, floorY + cabinetHeight / 2, segmentBStartZ + cabinetWidth / 2 + 0.1);
                                cabinetBL.castShadow = true; cabinetBL.receiveShadow = true; // scene.add(cabinetL); worldObjects.push(cabinetL);
                                cabinetBL.name = `Cabinet_B_L_F${i}_D${j}`;
                                // Chair for Left Room
                                const backWallZ_BL_Chair = segmentBCenterZ + SETTINGS.corridorSegmentLength / 2;
                                const chairZ_BL = 0.15 + (deskL.position.z + backWallZ_L_Chair) / 2 - 16 -totalCorridorLength;
                                const chairX_BL = SETTINGS.corridorWidth + (SETTINGS.roomSize/2);
                                const chairY_BL = floorY + chairSeatHeight / 2;
                                const chairSeat_BL = new THREE.Mesh(new THREE.BoxGeometry(chairSeatWidth, chairSeatHeight, chairSeatDepth), deskMaterial);
                                chairSeat_BL.position.set(chairX_BL, chairY_BL, chairZ_BL); // scene.add(chairSeat_L); worldObjects.push(chairSeat_L);
                                const backrest_BL = new THREE.Mesh(new THREE.BoxGeometry(chairSeatWidth, chairBackrestHeight, chairBackrestThickness), deskMaterial);
                                backrest_BL.position.set(chairX_BL, chairY_BL + chairBackrestHeight / 2, chairZ_BL + chairSeatDepth / 2 - chairBackrestThickness / 2);
                                // scene.add(backrest_L); worldObjects.push(backrest_L);
                
                                //const leftRoomContents = new THREE.Group();
                                const leftRoomBId = `B_L_F${i}_D${j}`;
                                leftRoomContents.name = `RoomContents_${leftRoomBId}`;
                                //leftRoomContents.add(lFloorB); worldObjects.push(lFloorB);
                                //leftRoomContents.add(lCeilingB); worldObjects.push(lCeilingB);
                                leftRoomContents.add(deskBL); worldObjects.push(deskBL);
                                leftRoomContents.add(cabinetBL); worldObjects.push(cabinetBL);
                                leftRoomContents.add(chairSeat_BL); worldObjects.push(chairSeat_BL);
                                leftRoomContents.add(backrest_BL); worldObjects.push(backrest_BL);
                
                                if (isLeftBRoomRedDoor) {
                                    const safeBLGeo = new THREE.BoxGeometry(safeDepth, safeHeight, safeWidth);
                                    const safeBL = new THREE.Mesh(safeBLGeo, safeMaterial);
                                    safeBL.position.set(SETTINGS.corridorWidth + SETTINGS.roomSize - safeDepth / 2, floorY + safeHeight / 2, segmentStartZ + SETTINGS.corridorSegmentLength - safeWidth / 2 - 0.1);
                                    safeBL.castShadow = true; safeBL.receiveShadow = true; safeBL.name = `Safe_L_F${i}_D${j}`;
                                    safeBL.userData = defaultSafeUserData(); // scene.add(safeL); worldObjects.push(safeL);
                                    leftRoomContents.add(safeBL); worldObjects.push(safeBL);
                                    const dialBLGeo = new THREE.ConeGeometry(dialRadius, dialLength, 10);
                                    const dialBL = new THREE.Mesh(dialBLGeo, dialMaterial);
                                    dialBL.position.set(-safeDepth / 2, 0, 0); dialBL.rotation.z = Math.PI / 2;
                                    dialBL.userData.isSafeDial = true; dialBL.name = `Dial_Safe_B_L_F${i}_D${j}`; safeBL.add(dialBL);
                                }
                                const roomLampBL = createRoomLamp(roomBLXCenter, floorY + SETTINGS.wallHeight - 0.5, segmentBCenterZ, i, leftRoomBId, lightBulbMaterial);
                                leftRoomContents.add(roomLampBL);
                
                                // Call modified function for pillars and window (B-Wing Left)
                                createOuterWall_SegmentFeatures(SETTINGS.corridorWidth + SETTINGS.roomSize - wallDepth / 2, segmentBCenterZ, SETTINGS.corridorSegmentLength, floorY, SETTINGS.wallHeight, wallDepth, wallMaterialB, opaqueGlassMaterial, glassMaterial, leftRoomBId);

                                leftRoomContents.visible = false;
                                scene.add(leftRoomContents);
                                allRoomsData.push({ // Ensure new properties are initialized
                                    id: leftRoomId, door: null, windowGlass: null, opaqueMaterial: null, transparentMaterial: null, contentsGroup: leftRoomContents,
                                    visibleByDoor: false, visibleByWindow: false, lamp: roomLampBL
                                });
            }

            // --- Create Long Sills and Headers for Outer Walls ---
            const sillH = SETTINGS.wallHeight * WINDOW_SILL_RATIO;
            const headerH = SETTINGS.wallHeight - (SETTINGS.wallHeight * WINDOW_HEIGHT_RATIO) - sillH;

            // A-Wing Outer Walls
            const outerWallAX_Right = -SETTINGS.roomSize + wallDepth / 2;
            const outerWallAX_Left = SETTINGS.corridorWidth + SETTINGS.roomSize - wallDepth / 2;
            const centerZ_A = totalCorridorLength / 2;

            if (sillH > 0.01) {
                const sillAGeo = new THREE.BoxGeometry(wallDepth, sillH, totalCorridorLength);
                const sillAR = new THREE.Mesh(sillAGeo, wallMaterialA); // Right side sill
                sillAR.position.set(outerWallAX_Right, floorY + sillH / 2, centerZ_A);
                scene.add(sillAR); worldObjects.push(sillAR); sillAR.name = `OuterWallSill_A_R_F${i}`;
                const sillAL = new THREE.Mesh(sillAGeo, wallMaterialA); // Left side sill
                sillAL.position.set(outerWallAX_Left, floorY + sillH / 2, centerZ_A);
                scene.add(sillAL); worldObjects.push(sillAL); sillAL.name = `OuterWallSill_A_L_F${i}`;
            }
            if (headerH > 0.01) {
                const headerAGeo = new THREE.BoxGeometry(wallDepth, headerH, totalCorridorLength);
                const headerAR = new THREE.Mesh(headerAGeo, wallMaterialA); // Right side header
                headerAR.position.set(outerWallAX_Right, floorY + SETTINGS.wallHeight - headerH / 2, centerZ_A);
                scene.add(headerAR); worldObjects.push(headerAR); headerAR.name = `OuterWallHeader_A_R_F${i}`;
                const headerAL = new THREE.Mesh(headerAGeo, wallMaterialA); // Left side header
                headerAL.position.set(outerWallAX_Left, floorY + SETTINGS.wallHeight - headerH / 2, centerZ_A);
                scene.add(headerAL); worldObjects.push(headerAL); headerAL.name = `OuterWallHeader_A_L_F${i}`;
            }

            // B-Wing Outer Walls
            const outerWallBX_Right = -SETTINGS.roomSize + wallDepth / 2; // Same X as A-wing
            const outerWallBX_Left = SETTINGS.corridorWidth + SETTINGS.roomSize - wallDepth / 2; // Same X as A-wing
            const centerZ_B = -16 - totalCorridorLength / 2;

            if (sillH > 0.01) {
                const sillBGeo = new THREE.BoxGeometry(wallDepth, sillH, totalCorridorLength);
                const sillBR = new THREE.Mesh(sillBGeo, wallMaterialB); // Right side sill
                sillBR.position.set(outerWallBX_Right, floorY + sillH / 2, centerZ_B);
                scene.add(sillBR); worldObjects.push(sillBR); sillBR.name = `OuterWallSill_B_R_F${i}`;
                const sillBL = new THREE.Mesh(sillBGeo, wallMaterialB); // Left side sill
                sillBL.position.set(outerWallBX_Left, floorY + sillH / 2, centerZ_B);
                scene.add(sillBL); worldObjects.push(sillBL); sillBL.name = `OuterWallSill_B_L_F${i}`;
            }
            if (headerH > 0.01) {
                const headerBGeo = new THREE.BoxGeometry(wallDepth, headerH, totalCorridorLength);
                const headerBR = new THREE.Mesh(headerBGeo, wallMaterialB); // Right side header
                headerBR.position.set(outerWallBX_Right, floorY + SETTINGS.wallHeight - headerH / 2, centerZ_B);
                scene.add(headerBR); worldObjects.push(headerBR); headerBR.name = `OuterWallHeader_B_R_F${i}`;
                const headerBL = new THREE.Mesh(headerBGeo, wallMaterialB); // Left side header
                headerBL.position.set(outerWallBX_Left, floorY + SETTINGS.wallHeight - headerH / 2, centerZ_B);
                scene.add(headerBL); worldObjects.push(headerBL); headerBL.name = `OuterWallHeader_B_L_F${i}`;
            }

            // Corridor Ceiling Plane
            const ceilingGeo = new THREE.PlaneGeometry(SETTINGS.corridorWidth + (2*SETTINGS.roomSize), totalCorridorLength);
            const ceiling = new THREE.Mesh(ceilingGeo, ceilingMaterial);
            ceiling.rotation.x = Math.PI / 2;
            ceiling.position.set(SETTINGS.corridorWidth / 2, floorY + SETTINGS.wallHeight, totalCorridorLength / 2);
            ceiling.castShadow = true;
            scene.add(ceiling);
            worldObjects.push(ceiling);

            // Corridor B Ceiling Plane
            const ceilingBGeo = new THREE.PlaneGeometry(SETTINGS.corridorWidth + (2*SETTINGS.roomSize), totalCorridorLength);
            const ceilingB = new THREE.Mesh(ceilingBGeo, ceilingMaterial);
            ceilingB.rotation.x = Math.PI / 2;
            ceilingB.position.set(SETTINGS.corridorWidth / 2, floorY + SETTINGS.wallHeight, (totalCorridorLength / 2) - 16 - totalCorridorLength);
            ceilingB.castShadow = true;
            scene.add(ceilingB);
            worldObjects.push(ceilingB);


            // --- Corridor Walls & Doors ---
            const wallAboveDoorHeight = SETTINGS.wallHeight - SETTINGS.doorHeight;

            // Create long header walls for A-Wing
            if (wallAboveDoorHeight > 0.01) { // Only create if there's actual height
                const headerAGeo = new THREE.BoxGeometry(wallDepth, wallAboveDoorHeight, totalCorridorLength);
                // Right side header (A-Wing)
                const headerAR = new THREE.Mesh(headerAGeo, wallMaterialA);
                headerAR.position.set(0, floorY + SETTINGS.doorHeight + wallAboveDoorHeight / 2, totalCorridorLength / 2);
                headerAR.castShadow = true; headerAR.receiveShadow = true; scene.add(headerAR); worldObjects.push(headerAR);
                // Left side header (A-Wing)
                const headerAL = new THREE.Mesh(headerAGeo, wallMaterialA);
                headerAL.position.set(SETTINGS.corridorWidth, floorY + SETTINGS.doorHeight + wallAboveDoorHeight / 2, totalCorridorLength / 2);
                headerAL.castShadow = true; headerAL.receiveShadow = true; scene.add(headerAL); worldObjects.push(headerAL);
            }

            // Create long header walls for B-Wing
            if (wallAboveDoorHeight > 0.01) { // Only create if there's actual height
                const headerBGeo = new THREE.BoxGeometry(wallDepth, wallAboveDoorHeight, totalCorridorLength);
                // Right side header (B-Wing)
                const headerBR = new THREE.Mesh(headerBGeo, wallMaterialB);
                headerBR.position.set(0, floorY + SETTINGS.doorHeight + wallAboveDoorHeight / 2, -16 - totalCorridorLength / 2);
                headerBR.castShadow = true; headerBR.receiveShadow = true; scene.add(headerBR); worldObjects.push(headerBR);
                // Left side header (B-Wing)
                const headerBL = new THREE.Mesh(headerBGeo, wallMaterialB);
                headerBL.position.set(SETTINGS.corridorWidth, floorY + SETTINGS.doorHeight + wallAboveDoorHeight / 2, -16 - totalCorridorLength / 2);
                headerBL.castShadow = true; headerBL.receiveShadow = true; scene.add(headerBL); worldObjects.push(headerBL);
            }

            // Right Wall Segments (Positive X direction)
            for (let j = 0; j < SETTINGS.doorsPerSide; j++) {
                const segmentZ = (j + 0.5) * SETTINGS.corridorSegmentLength;
                // Wall segment next to door (door height)
                const wall1Geo = new THREE.BoxGeometry(wallDepth, SETTINGS.doorHeight, doorOffset);
                const wall1 = new THREE.Mesh(wall1Geo, wallMaterialA); // A-wing
                wall1.position.set(0, floorY + SETTINGS.doorHeight / 2, segmentZ - SETTINGS.corridorSegmentLength / 2 + doorOffset / 2);
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
                const knobMaterial = new THREE.MeshStandardMaterial({ color: 0xffaa11, metalness: 0.8, roughness: 0.1 });
                const knob = new THREE.Mesh(knobGeometry, knobMaterial);
                knob.position.set(SETTINGS.doorDepth/2 + 0.05, 0, SETTINGS.doorWidth - 0.15);
                knob.userData.doorKnob = true; door.add(knob); door.userData.knob = knob;
                const knob2 = new THREE.Mesh(knobGeometry, knobMaterial);
                knob2.position.set(-SETTINGS.doorDepth/2 - 0.05, 0, SETTINGS.doorWidth - 0.15);
                knob2.userData.doorKnob = true; door.add(knob2); door.userData.knob2 = knob2;

                const wall2Geo = new THREE.BoxGeometry(wallDepth, SETTINGS.doorHeight, doorOffset);
                const wall2 = new THREE.Mesh(wall2Geo, wallMaterialA); // A-wing
                wall2.position.set(0, floorY + SETTINGS.doorHeight / 2, segmentZ + SETTINGS.doorWidth / 2 + doorOffset / 2);
                wall2.castShadow = true; wall2.receiveShadow = true; scene.add(wall2); worldObjects.push(wall2);
                currentDoorIndex++;
            }
            // Right Wall B Segments (Negative Z Direction) (Positive X direction)
            for (let j = 0; j < SETTINGS.doorsPerSide; j++) {
                const segmentBZ = ((j + 0.5) * SETTINGS.corridorSegmentLength) - 16 - totalCorridorLength;
                const wall1Geo = new THREE.BoxGeometry(wallDepth, SETTINGS.doorHeight, doorOffset);
                const wall1 = new THREE.Mesh(wall1Geo, wallMaterialB); // B-wing
                wall1.position.set(0, floorY + SETTINGS.doorHeight / 2, segmentBZ - SETTINGS.corridorSegmentLength / 2 + doorOffset / 2);
                wall1.castShadow = true; wall1.receiveShadow = true; scene.add(wall1); worldObjects.push(wall1);
                const isRed = currentDoorIndex === redDoorIndex;
                const doorMaterialToUse = isRed ? redDoorMaterial : navyDoorMaterial; // Use navy for B-Wing
                const doorGeo = new THREE.BoxGeometry(SETTINGS.doorDepth, SETTINGS.doorHeight, SETTINGS.doorWidth);
                doorGeo.translate(0, 0, SETTINGS.doorWidth/2);
                const door = new THREE.Mesh(doorGeo, doorMaterialToUse);
                const doorXPosR = 0; // Right side doors are at X=0
                door.position.set(doorXPosR, floorY + SETTINGS.doorHeight/2, segmentBZ - SETTINGS.doorWidth/2);
                door.castShadow = true; door.userData = { type: 'door', floor: i, isRed: isRed, locked: (Math.random() < 0.3), isOpen: false };
                const doorRoomIdR = `R_F${i}_D${j}`; // Associate with the correct room ID
                door.userData.roomId = doorRoomIdR;
                const roomDataR = allRoomsData.find(r => r.id === doorRoomIdR);
                if (roomDataR) roomDataR.door = door;
                door.name = `${i + 1}${String(currentDoorIndex + 1).padStart(2, '0')}`;
                scene.add(door); doors.push(door); worldObjects.push(door);

                const knobGeometry = new THREE.SphereGeometry(0.06, 8, 6); // B-Wing knob material
                const knobMaterial = whiteMaterial.clone(); // Use white for B-Wing knobs
                const knob = new THREE.Mesh(knobGeometry, knobMaterial);
                knob.position.set(SETTINGS.doorDepth/2 + 0.05, 0, SETTINGS.doorWidth - 0.15);
                knob.userData.doorKnob = true; door.add(knob); door.userData.knob = knob;
                const knob2 = new THREE.Mesh(knobGeometry, knobMaterial);
                knob2.position.set(-SETTINGS.doorDepth/2 - 0.05, 0, SETTINGS.doorWidth - 0.15);
                knob2.userData.doorKnob = true; door.add(knob2); door.userData.knob2 = knob2;

                const wall2Geo = new THREE.BoxGeometry(wallDepth, SETTINGS.doorHeight, doorOffset);
                const wall2 = new THREE.Mesh(wall2Geo, wallMaterialB); // B-wing
                wall2.position.set(0, floorY + SETTINGS.doorHeight / 2, segmentBZ + SETTINGS.doorWidth / 2 + doorOffset / 2);
                wall2.castShadow = true; wall2.receiveShadow = true; scene.add(wall2); worldObjects.push(wall2);
                currentDoorIndex++;
            }
            // Left Wall Segments
            const LeftWallX = SETTINGS.corridorWidth;
            for (let j = 0; j < SETTINGS.doorsPerSide; j++) {
                const segmentZ = (j + 0.5) * SETTINGS.corridorSegmentLength;
                const wall1Geo = new THREE.BoxGeometry(wallDepth, SETTINGS.doorHeight, doorOffset);
                const wall1 = new THREE.Mesh(wall1Geo, wallMaterialA); // A-wing
                wall1.position.set(LeftWallX, floorY + SETTINGS.doorHeight / 2, segmentZ - SETTINGS.corridorSegmentLength / 2 + doorOffset / 2);
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
                const knobMaterial = new THREE.MeshStandardMaterial({ color: 0xffaa11, metalness: 0.8, roughness: 0.1});
                const knob = new THREE.Mesh(knobGeometry, knobMaterial);
                knob.position.set(SETTINGS.doorDepth/2 + 0.05, 0, SETTINGS.doorWidth - 0.15);
                knob.userData.doorKnob = true; door.add(knob); door.userData.knob = knob;
                const knob2 = new THREE.Mesh(knobGeometry, knobMaterial);
                knob2.position.set(-SETTINGS.doorDepth/2 - 0.05, 0, SETTINGS.doorWidth - 0.15);
                knob2.userData.doorKnob = true; door.add(knob2); door.userData.knob2 = knob2; // Corrected typo

                const wall2Geo = new THREE.BoxGeometry(wallDepth, SETTINGS.doorHeight, doorOffset);
                const wall2 = new THREE.Mesh(wall2Geo, wallMaterialA); // A-wing
                wall2.position.set(LeftWallX, floorY + SETTINGS.doorHeight / 2, segmentZ + SETTINGS.doorWidth / 2 + doorOffset / 2);
                wall2.castShadow = true; wall2.receiveShadow = true; scene.add(wall2); worldObjects.push(wall2);
                currentDoorIndex++;
            }
            // Left Wall B Segments (Negative Z Direction) (Positive X direction)
            const LeftWallBX = SETTINGS.corridorWidth;
            for (let j = 0; j < SETTINGS.doorsPerSide; j++) {
                const segmentBZ = ((j + 0.5) * SETTINGS.corridorSegmentLength) - 16 - totalCorridorLength;
                const wall1Geo = new THREE.BoxGeometry(wallDepth, SETTINGS.doorHeight, doorOffset);
                const wall1 = new THREE.Mesh(wall1Geo, wallMaterialB); // B-wing
                wall1.position.set(LeftWallX, floorY + SETTINGS.doorHeight / 2, segmentBZ - SETTINGS.corridorSegmentLength / 2 + doorOffset / 2);
                wall1.castShadow = true; wall1.receiveShadow = true; scene.add(wall1); worldObjects.push(wall1);
                const isRed = currentDoorIndex === redDoorIndex;
                const doorMaterialToUse = isRed ? redDoorMaterial : navyDoorMaterial; // Use navy for B-Wing
                const doorGeo = new THREE.BoxGeometry(SETTINGS.doorDepth, SETTINGS.doorHeight, SETTINGS.doorWidth);
                doorGeo.translate(0, 0, SETTINGS.doorWidth/2);
                const door = new THREE.Mesh(doorGeo, doorMaterialToUse);
                const doorXPosL = LeftWallX; // Left side doors
                door.position.set(doorXPosL, floorY + SETTINGS.doorHeight/2, segmentBZ - SETTINGS.doorWidth/2);
                door.castShadow = true; door.userData = { type: 'door', floor: i, isRed: isRed, locked: (Math.random() < 0.3), isOpen: false };
                const doorRoomIdL = `L_F${i}_D${j}`; // Associate with the correct room ID
                door.userData.roomId = doorRoomIdL;
                const roomDataL = allRoomsData.find(r => r.id === doorRoomIdL);
                if (roomDataL) roomDataL.door = door;
                door.name = `${i + 1}${String(currentDoorIndex + 1).padStart(2, '0')}`;
                scene.add(door); doors.push(door); worldObjects.push(door);

                const knobGeometry = new THREE.SphereGeometry(0.06, 8, 6); // B-Wing knob material
                const knobMaterial = whiteMaterial.clone(); // Use white for B-Wing knobs
                const knob = new THREE.Mesh(knobGeometry, knobMaterial);
                knob.position.set(SETTINGS.doorDepth/2 + 0.05, 0, SETTINGS.doorWidth - 0.15);
                knob.userData.doorKnob = true; door.add(knob); door.userData.knob = knob;
                const knob2 = new THREE.Mesh(knobGeometry, knobMaterial);
                knob2.position.set(-SETTINGS.doorDepth/2 - 0.05, 0, SETTINGS.doorWidth - 0.15);
                knob2.userData.doorKnob = true; door.add(knob2); door.userData.knob2 = knob2; // Corrected typo

                const wall2Geo = new THREE.BoxGeometry(wallDepth, SETTINGS.doorHeight, doorOffset);
                const wall2 = new THREE.Mesh(wall2Geo, wallMaterialB); // B-wing
                wall2.position.set(LeftWallX, floorY + SETTINGS.doorHeight / 2, segmentBZ + SETTINGS.doorWidth / 2 + doorOffset / 2);
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

            // Corridor B Ceiling Lights
            for (let j = 0; j < SETTINGS.doorsPerSide; j++) {
                const segmentBZ = ((j + 0.5) * SETTINGS.corridorSegmentLength) - 16 - totalCorridorLength;
                createStandardLamp(
                    SETTINGS.corridorWidth / 2,
                    floorY + SETTINGS.wallHeight - 0.5,
                    segmentBZ,
                    i, // floorIndex
                    `${i + 1}${String(j + 1).padStart(2, '0')}`, // lampIdSuffix, e.g., "101", "102"
                    scene, lights, lightBulbMaterial
                );
            }

            // Escalator Bridge Ceiling Lights
            const escLightPositions = [totalCorridorLength + 4, totalCorridorLength + 4 + (2*escalatorLength/3)];
            escLightPositions.forEach((zPos, idx) => {
                // escalator bridge light creation logic
                const lightGeo = new THREE.ConeGeometry(0.3, 0.2, 8);
                createStandardLamp(
                    SETTINGS.corridorWidth / 2,
                    floorY + SETTINGS.wallHeight - 0.5,
                    zPos,
                    i, // floorIndex
                    `EscBridge_F${i}_Idx${idx + 1}`, // lampIdSuffix
                    scene, lights, lightBulbMaterial
                );
            });

            // Escalator Bridge B Ceiling Lights
            // B wing bridge starts at Z = -16 - totalCorridorLength - 4
            const escBBridgeStartRefZ = -16 - totalCorridorLength - 4;
            const escBLightBPositions = [escBBridgeStartRefZ, escBBridgeStartRefZ - (2*escalatorLength/3)];
            escBLightBPositions.forEach((zPos, idx) => {
                // escalator bridge light creation logic
                const lightBGeo = new THREE.ConeGeometry(0.3, 0.2, 8);
                createStandardLamp(
                    SETTINGS.corridorWidth / 2,
                    floorY + SETTINGS.wallHeight - 0.5,
                    zPos,
                    i, // floorIndex
                    `EscBridge_B_F${i}_Idx${idx + 1}`, // lampIdSuffix
                    scene, lights, lightBulbMaterial
                );
            });

            // Far end wall for office floors (at end of escalator area)
            const endWallEscGeo = new THREE.BoxGeometry(SETTINGS.corridorWidth + (2 * escalatorWidth), SETTINGS.floorHeight, wallDepth);
            const endWallFar = new THREE.Mesh(endWallEscGeo, wallMaterialA); // A-wing
            endWallFar.position.set(SETTINGS.corridorWidth / 2, floorY + SETTINGS.wallHeight / 2, totalCorridorLength + 4 + escalatorLength + 4);
            endWallFar.name = `Escalator Back Wall ${i}`;
            endWallFar.castShadow = true; endWallFar.receiveShadow = true;
            scene.add(endWallFar);
            worldObjects.push(endWallFar);

// Add Text "A" + floor number to endWallAFar
            const textStringA = "A" + (i === 0 ? "G" : i.toString());
            const textGeoA = new TextGeometry(textStringA, {
                font: loadedFont,
                size: 1.5, // Large letter size
                depth: 0.15, // Corrected: Use 'depth' for extrusion
                curveSegments: 12,
                bevelEnabled: false
            });
            textGeoA.center(); // Center the geometry vertices
            const textMeshA = new THREE.Mesh(textGeoA, textMaterial);

            textMeshA.position.set(
                endWallFar.position.x, // Now centered because geometry is centered
                endWallFar.position.y, // Now centered because geometry is centered
                endWallFar.position.z - (wallDepth / 2) - 0.02 // Slightly in front of the wall's inner surface
            );
            textMeshA.rotation.y = Math.PI; // Rotate to face the player
            textMeshA.name = `Text_Wall_A_F${i}`;
            scene.add(textMeshA);

             // Far end wall for office B floors (at end of escalator area)
            const endWallBEscGeo = new THREE.BoxGeometry(SETTINGS.corridorWidth + (2 * escalatorWidth), SETTINGS.floorHeight, wallDepth);
            const endWallBFar = new THREE.Mesh(endWallBEscGeo, wallMaterialB); // B-wing
            endWallBFar.position.set(SETTINGS.corridorWidth / 2, floorY + SETTINGS.wallHeight / 2, - 16 -(totalCorridorLength + 4 + escalatorLength + 4));
            endWallBFar.name = `Escalator B Back Wall B ${i}`;
            endWallBFar.castShadow = true; endWallBFar.receiveShadow = true;
            scene.add(endWallBFar);
            worldObjects.push(endWallBFar);

            // Add Text "B" + floor number to endWallBFar
            const textStringB = "B" + (i === 0 ? "G" : i.toString());
            const textGeoB = new TextGeometry(textStringB, {
                font: loadedFont,
                size: 1.5,
                depth: 0.15, // Corrected: Use 'depth' for extrusion
                curveSegments: 12,
                bevelEnabled: false });
            textGeoB.center(); 
            const textMeshB = new THREE.Mesh(textGeoB, whiteMaterial.clone()); // Use white for B-Wing signage
            textMeshB.position.set(
                endWallBFar.position.x, // Now centered because geometry is centered
                endWallBFar.position.y, // Now centered because geometry is centered
                endWallBFar.position.z + (wallDepth / 2) + 0.02 // Slightly in front of the wall's inner surface
            );
            textMeshB.name = `Text_Wall_B_F${i}`;
            scene.add(textMeshB);

            // --- Walls around Escalator Area for Office Floors ---
            // Right Wall next to escalator (Positive Z direction)
            const wallR2Geo = new THREE.BoxGeometry(wallDepth, SETTINGS.floorHeight, escalatorLength + 8);
            const wallR2 = new THREE.Mesh(wallR2Geo, wallMaterialA); // A-wing
            wallR2.name = `Escalator RHS Wall ${i}`;
            wallR2.position.set(-escalatorWidth, floorY + SETTINGS.wallHeight / 2, totalCorridorLength + (escalatorLength/2) + 4);
            wallR2.castShadow = true; wallR2.receiveShadow = true;
            scene.add(wallR2); worldObjects.push(wallR2);

            // --- Walls around Escalator B Area for Office Floors ---
            // Right Wall next to escalator B (Negative Z direction)
            const wallBR2Geo = new THREE.BoxGeometry(wallDepth, SETTINGS.floorHeight, escalatorLength + 8);
            const wallBR2 = new THREE.Mesh(wallBR2Geo, wallMaterialB); // B-wing
            wallBR2.name = `Escalator B RHS Wall ${i}`;
            wallBR2.position.set(-escalatorWidth, floorY + SETTINGS.wallHeight / 2, - 16 -(totalCorridorLength + (escalatorLength/2) + 4));
            wallBR2.castShadow = true; wallBR2.receiveShadow = true;
            scene.add(wallBR2); worldObjects.push(wallBR2);


            // Right Corner Wall next to escalator (Negative X direction)
            const wallRCornerGeo = new THREE.BoxGeometry(escalatorWidth + wallDepth, SETTINGS.floorHeight, wallDepth);
            const wallRCorner = new THREE.Mesh(wallRCornerGeo, wallMaterialA); // A-wing
            wallRCorner.name = `Escalator RHS Corner Wall ${i}`;
            wallRCorner.position.set(-escalatorWidth/2, floorY + SETTINGS.wallHeight / 2, totalCorridorLength);
            wallRCorner.castShadow = true; wallRCorner.receiveShadow = true;
            scene.add(wallRCorner); worldObjects.push(wallRCorner);

             // Right Corner Wall B next to escalator (Negative Z Direction) (Negative X direction)
            const wallBRCornerGeo = new THREE.BoxGeometry(escalatorWidth + wallDepth, SETTINGS.floorHeight, wallDepth);
            const wallBRCorner = new THREE.Mesh(wallBRCornerGeo, wallMaterialB); // B-wing
            wallBRCorner.name = `Escalator B RHS Corner Wall ${i}`;
            wallBRCorner.position.set(-escalatorWidth/2, floorY + SETTINGS.wallHeight / 2, -16 - totalCorridorLength);
            wallBRCorner.castShadow = true; wallBRCorner.receiveShadow = true;
            scene.add(wallBRCorner); worldObjects.push(wallBRCorner);


            // Left Wall next to escalator (Positive Z direction)
            const LeftWallXEsc = SETTINGS.corridorWidth; // Re-scope for clarity if needed
            const wallL3Geo = new THREE.BoxGeometry(wallDepth, SETTINGS.floorHeight, escalatorLength + 8);
            const wallL3 = new THREE.Mesh(wallL3Geo, wallMaterialA); // A-wing
            wallL3.name = `Escalator Left Wall ${i}`;
            wallL3.position.set(LeftWallXEsc + escalatorWidth, floorY + SETTINGS.wallHeight / 2, totalCorridorLength + (escalatorLength/2) + 4);
            wallL3.castShadow = true; wallL3.receiveShadow = true;
            scene.add(wallL3); worldObjects.push(wallL3);

            // Left Wall next to escalator B (Negative Z direction)
            const LeftWallBXEsc = SETTINGS.corridorWidth; // Re-scope for clarity if needed
            const wallBL3Geo = new THREE.BoxGeometry(wallDepth, SETTINGS.floorHeight, escalatorLength + 8);
            const wallBL3 = new THREE.Mesh(wallBL3Geo, wallMaterialB); // B-wing
            wallBL3.name = `Escalator B Left Wall ${i}`;
            wallBL3.position.set(LeftWallXEsc + escalatorWidth, floorY + SETTINGS.wallHeight / 2, -16 - (totalCorridorLength + (escalatorLength/2) + 4));
            wallBL3.castShadow = true; wallBL3.receiveShadow = true;
            scene.add(wallBL3); worldObjects.push(wallBL3);
            
            
            // Left Corner Wall next to escalator (Negative X direction)
            const wallLCornerGeo = new THREE.BoxGeometry(escalatorWidth + wallDepth, SETTINGS.floorHeight, wallDepth);
            const wallLCorner = new THREE.Mesh(wallLCornerGeo, wallMaterialA); // A-wing
            wallLCorner.name = `Escalator LHS Corner Wall ${i}`; // Corrected name
            wallLCorner.position.set(LeftWallXEsc + escalatorWidth/2, floorY + SETTINGS.wallHeight / 2, totalCorridorLength);
            wallLCorner.castShadow = true; wallLCorner.receiveShadow = true;
            scene.add(wallLCorner); worldObjects.push(wallLCorner);

            // Left Corner Wall B next to escalator (Negative Z Direction)(Negative X direction)
            const wallBLCornerGeo = new THREE.BoxGeometry(escalatorWidth + wallDepth, SETTINGS.floorHeight, wallDepth);
            const wallBLCorner = new THREE.Mesh(wallBLCornerGeo, wallMaterialB); // B-wing
            wallBLCorner.name = `Escalator B LHS Corner Wall ${i}`; // Corrected name
            wallBLCorner.position.set(LeftWallXEsc + escalatorWidth/2, floorY + SETTINGS.wallHeight / 2, -16 - totalCorridorLength);
            wallBLCorner.castShadow = true; wallBLCorner.receiveShadow = true;
            scene.add(wallBLCorner); worldObjects.push(wallBLCorner);





        } // End of Office Floor Generation (i >= 0)

        // --- Common elements for ALL floors (basement and above-ground) ---
        // Define the top surface Y for the current and lower floors (used by balustrades)
        // const currentFloorTopY = floorY; // No longer needed here, use floorY directly
        // const lowerFloorTopY = (i - 1) * SETTINGS.floorHeight; // No longer needed here, use direct calculation

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

            // Escalator Floor B Start
            const floorBEsc1Geo = new THREE.BoxGeometry(SETTINGS.corridorWidth + (escalatorWidth * 2), floorDepth, 4 - 1);
            const floorB1Esc = new THREE.Mesh(floorBEsc1Geo, floorMaterial); // Use standard floorMaterial
            floorB1Esc.name = `Escalator Floor B Start ${i}`;
            floorB1Esc.position.set(SETTINGS.corridorWidth / 2, floorY - floorDepth / 2, -16 - (totalCorridorLength  + 1.5));
            floorB1Esc.receiveShadow = true; scene.add(floorB1Esc); worldObjects.push(floorB1Esc);

            const escBStartZ = floorB1Esc.position.z;
            const escBLightY = floorY + SETTINGS.wallHeight - 0.5;
            const escBLightXs = [-escalatorWidth/2, SETTINGS.corridorWidth + (escalatorWidth/2)];
            escBLightXs.forEach((xPos, idx) => {
                createStandardLamp(
                    xPos,
                    escBLightY,
                    escBStartZ,
                    i, // floorIndex
                    `EscBStart_F${i}_Idx${idx + 1}`, // lampIdSuffix
                    scene, lights, lightBulbMaterial
                );
            });

            // Escalator Floor bridge
            const bridge2EscGeo = new THREE.BoxGeometry(SETTINGS.corridorWidth + 0.19, floorDepth, escalatorLength + 3);
            const bridge2Esc = new THREE.Mesh(bridge2EscGeo, floorMaterial); // Use standard floorMaterial
            bridge2Esc.name = `Escalator Floor Bridge ${i}`;
            bridge2Esc.position.set(SETTINGS.corridorWidth / 2, floorY - floorDepth / 2, totalCorridorLength + 4 +(escalatorLength / 2) + 0.5);
            bridge2Esc.receiveShadow = true; scene.add(bridge2Esc); worldObjects.push(bridge2Esc);

            // Escalator Floor B bridge
            const bridgeB2EscGeo = new THREE.BoxGeometry(SETTINGS.corridorWidth + 0.19, floorDepth, escalatorLength + 3);
            const bridgeB2Esc = new THREE.Mesh(bridgeB2EscGeo, floorMaterial); // Use standard floorMaterial
            bridgeB2Esc.name = `Escalator Floor B Bridge ${i}`;
            bridgeB2Esc.position.set(SETTINGS.corridorWidth / 2, floorY - floorDepth / 2, -16 - (totalCorridorLength + 4 +(escalatorLength / 2) + 0.5));
            bridgeB2Esc.receiveShadow = true; scene.add(bridgeB2Esc); worldObjects.push(bridgeB2Esc);


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

            // Escalator Floor B End
            const floorBEsc2Geo = new THREE.BoxGeometry(SETTINGS.corridorWidth + (escalatorWidth * 2), floorDepth, 4-1);
            const floorB2Esc = new THREE.Mesh(floorBEsc2Geo, floorMaterial); // Use standard floorMaterial
            floorB2Esc.name = `Escalator Floor End ${i}`;
            floorB2Esc.position.set(SETTINGS.corridorWidth / 2, floorY - floorDepth / 2, -16 -( totalCorridorLength + 4 + escalatorLength + 2.5));
            floorB2Esc.receiveShadow = true; scene.add(floorB2Esc); worldObjects.push(floorB2Esc);

            const escBEndZ = floorB2Esc.position.z;
            escBLightXs.forEach((xPos, idx) => {
                createStandardLamp(
                    xPos,
                    escBLightY,
                    escBEndZ,
                    i, // floorIndex
                    `EscEnd_B_F${i}_Idx${idx + 1}`, // lampIdSuffix
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
            const balustradeMaterial = new THREE.MeshStandardMaterial({ color: 0x999999, metalness: 0.8, roughness: 0.2 }); // Gray material for balustrades
            
            // Skip escalator generation if this is the absolute lowest basement floor (can't go further down)
            if (i > 0 && i < SETTINGS.numFloors) { // Create escalators connecting floor i (e.g. 1) down to floor i-1 (e.g. 0)

            // A-Wing Escalators /////// AAAAAAAAAA
                // ---  A-Wing Left  side Escalator A down Starting Point (RED) ---
            const startEscDownGeo = new THREE.BoxGeometry(escalatorWidth, floorDepth, 1); // <-- Add this line
            const startEscDown = new THREE.Mesh(startEscDownGeo, window.EscalatorEmbarkMaterial);
            startEscDown.name = `Left Escalator Down Start A ${i}`;
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

            // ---  A-Wing Steps DOWN (LEFT side) ---
            for (let s = 0; s < stepCount; s++) {
                const y = floorY -.01 - (s + 1) * stepHeight + stepHeight / 2;
                const z = totalCorridorLength + 4.3 + (s / stepCount) * SETTINGS.escalatorLength;
                const stepGeo = new THREE.BoxGeometry(stepWidth, stepHeight, stepDepth);
                const stepDown = new THREE.Mesh(stepGeo, window.EscalatorMaterial);
                stepDown.position.set(
                    SETTINGS.corridorWidth + (stepWidth / 2) + 0.1,
                    y,
                    z
                );
                stepDown.castShadow = true;
                stepDown.receiveShadow = true;
                stepDown.name = `Left Escalator Step Down A ${i}-${s}`;
                scene.add(stepDown);
                worldObjects.push(stepDown); // Track stepDown
                escalatorSteps.down[i].push(stepDown); // Track stepDown
            }

            //  A-Wing Escalator Down on lower floor Ending Point (Left side    )    
            const endEscDownGeo = new THREE.BoxGeometry(escalatorWidth, floorDepth, 1);
            
            const endEscDown = new THREE.Mesh(endEscDownGeo, window.EscalatorMaterial);
            endEscDown.name = `Left Escalator Down End A ${i}`;
            //start1Esc.rotation.x = -Math.PI / 2;
            endEscDown.position.set(
                SETTINGS.corridorWidth + (escalatorWidth / 2) + 0.1,
                floorY - SETTINGS.floorHeight -(floorDepth/2) + 0.01, // Lowered by 0.01 to match last step
                totalCorridorLength + escalatorLength + 4 + 0.5
            );
            endEscDown.receiveShadow = true;
            scene.add(endEscDown);
            worldObjects.push(endEscDown);
            // NEW: Store the end mesh for later reset
            escalatorEnds.down[i] = endEscDown;
            // ---  A-Wing End of Left side Escalator Down on lower floor Ending Point --- ///

            // ---  A-Wing  Right side Escalator going Up on Lower floor Starting Point (RED) ---
            const startEscUpGeo = new THREE.BoxGeometry(escalatorWidth, floorDepth, 1);
            const startEscUp = new THREE.Mesh(startEscUpGeo, window.EscalatorEmbarkMaterial);
            startEscUp.name = `Right Escalator Up Start A ${i}`;
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

            // --- Steps UP A-Wing (RIGHT side) ---
            for (let s = 0; s < stepCount; s++) {
                //const y = floorY - (stepCount - s) * stepHeight + stepHeight / 2;
                const y = floorY + 0.01 - (s + 1) * stepHeight + stepHeight / 2;
                const z = totalCorridorLength + 4.3 + (s / stepCount) * SETTINGS.escalatorLength;
                const stepGeo = new THREE.BoxGeometry(stepWidth, stepHeight, stepDepth);
                const stepUp = new THREE.Mesh(stepGeo, window.EscalatorMaterial);
                stepUp.position.set(
                    -0.1 - (stepWidth / 2),
                    y,
                    z
                );
                stepUp.castShadow = true;
                stepUp.receiveShadow = true;
                stepUp.name = `Right Escalator Step Up A ${i}-${s}`;
                scene.add(stepUp);
                worldObjects.push(stepUp);
                escalatorSteps.up[i].push(stepUp); // Track stepUp
            }

            // Escalator A-Wing Up from lower floor Ending Point    
            const endEscUpGeo = new THREE.BoxGeometry(escalatorWidth, floorDepth, 1);
            const endEscUp = new THREE.Mesh(endEscUpGeo, window.EscalatorMaterial);
            endEscUp.name = `Right Escalator Up End A ${i}`;
            //start1Esc.rotation.x = -Math.PI / 2;
            endEscUp.position.set(
                -0.1 - (escalatorWidth / 2),
                floorY -(floorDepth/3) -0.08 , // So the top is at floorY
                totalCorridorLength  + 3.5
            );
            endEscUp.receiveShadow = true;
            scene.add(endEscUp);
            worldObjects.push(endEscUp);
            // NEW: Store a translated clone of the end mesh for up steps A
            const translatedEndEscUp = endEscUp.clone();
            translatedEndEscUp.position.y += 0.2;
            translatedEndEscUp.position.z += 0.3;
            escalatorEnds.up[i] = translatedEndEscUp;
            // End of Right side escalator Ramp going up from lower floor////
            // --- End of A-Wing Escalators ---   AAAAAAAA

            // B-Wing Escalators /////// BBBBBBBBBBBBBB
            // ---  B-Wing RIGHT  side Escalator B down Starting Point (Orange) - (Was LEFT) ---
            const startEscDownGeoB = new THREE.BoxGeometry(escalatorWidth, floorDepth, 1); // <-- Add this line
            const startEscDownB = new THREE.Mesh(startEscDownGeoB, window.EscalatorEmbarkMaterialB);
            startEscDownB.name = `Right Escalator Down Start B ${i}`;
            //start1Esc.rotation.x = -Math.PI / 2;
            startEscDownB.position.set(
                - (escalatorWidth / 2) - 0.1,
                floorY -(floorDepth/2), // So the top is at floorY
                -16 - totalCorridorLength  - 3.5
            );
            startEscDownB.receiveShadow = true;
            scene.add(startEscDownB);
            worldObjects.push(startEscDownB);
            
            // Track startEscDown for this floor
            escalatorStartsB.down[i] = startEscDownB;
            // Track stepDown for this floor
            escalatorStepsB.down[i] = [];

            // ---  B-Wing Steps DOWN  -Right side (Was Left) --- 
            for (let s = 0; s < stepCount; s++) {
                const y = floorY -.01 - ((s + 1) * stepHeight ) + stepHeight / 2;
                const zB = -16 - totalCorridorLength - 4.3 - (s / stepCount) * SETTINGS.escalatorLength;
                const stepGeoB = new THREE.BoxGeometry(stepWidth, stepHeight, stepDepth);
                const stepDownB = new THREE.Mesh(stepGeoB, window.EscalatorMaterial);
                stepDownB.position.set(
                    - (stepWidth / 2) - 0.1,
                    y,
                    zB
                );
                stepDownB.castShadow = true;
                stepDownB.receiveShadow = true;
                stepDownB.name = `Right Escalator Step Down B ${i}-${s}`;
                scene.add(stepDownB);
                worldObjects.push(stepDownB); // Track stepDown
                escalatorStepsB.down[i].push(stepDownB); // Track stepDown
            }

            //  B-Wing Escalator Down on lower floor Ending Point - Right side ( was Left side    )    
            const endEscDownGeoB = new THREE.BoxGeometry(escalatorWidth, floorDepth, 1);
            
            const endEscDownB = new THREE.Mesh(endEscDownGeoB, window.EscalatorMaterial);
            endEscDownB.name = `Right Escalator Down End B ${i}`;
            //start1Esc.rotation.x = -Math.PI / 2;
            endEscDownB.position.set(
                - (escalatorWidth / 2) - 0.1,
                floorY - SETTINGS.floorHeight -(floorDepth/2) + 0.01, // Lowered by 0.01 to match last step
                -16 - totalCorridorLength - escalatorLength - 4 - 0.5
            );
            endEscDownB.receiveShadow = true;
            scene.add(endEscDownB);
            worldObjects.push(endEscDownB);
            // NEW: Store the end mesh for later reset
            escalatorEndsB.down[i] = endEscDownB;
            // ---  B-Wing End of Left side Escalator Down on lower floor Ending Point --- ///

            // ---  B-Wing  LEFT side Escalator going Up on Lower floor Starting Point (Organge) (Was Right) ---
            const startEscUpGeoB = new THREE.BoxGeometry(escalatorWidth, floorDepth, 1);
            const startEscUpB = new THREE.Mesh(startEscUpGeoB, window.EscalatorEmbarkMaterialB);
            startEscUpB.name = `Leftt Escalator Up Start B ${i}`;
            //start1Esc.rotation.x = -Math.PI / 2;
            startEscUpB.position.set(
                SETTINGS.corridorWidth + 0.1 + (escalatorWidth / 2),
                floorY - SETTINGS.floorHeight -(floorDepth/2), // So the top is at floorY
                -16 - totalCorridorLength - escalatorLength - 4 - 0.5
            );
            startEscUpB.receiveShadow = true;
            scene.add(startEscUpB);
            worldObjects.push(startEscUpB);
        
            // Track startEscUp for this floor
            escalatorStartsB.up[i] = startEscUpB;
            // Track stepUp for this floor
            escalatorStepsB.up[i] = [];

            // --- Steps UP B-Wing - Left side (was rigg side) ---
            for (let s = 0; s < stepCount; s++) {
                //const y = floorY - (stepCount - s) * stepHeight + stepHeight / 2;
                const y = floorY + 0.01 - (s + 1) * stepHeight + stepHeight / 2;
                const zB = -16 - totalCorridorLength - 4.3 - (s / stepCount) * SETTINGS.escalatorLength;
                const stepGeoB = new THREE.BoxGeometry(stepWidth, stepHeight, stepDepth);
                const stepUpB = new THREE.Mesh(stepGeoB, window.EscalatorMaterial);
                stepUpB.position.set(
                    SETTINGS.corridorWidth + 0.1 + (stepWidth / 2),
                    y,
                    zB
                );
                stepUpB.castShadow = true;
                stepUpB.receiveShadow = true;
                stepUpB.name = `Left Escalator Step Up B ${i}-${s}`;
                scene.add(stepUpB);
                worldObjects.push(stepUpB);
                escalatorStepsB.up[i].push(stepUpB); // Track stepUp
            }

            // Escalator B-Wing Up from lower floor Ending Point    
            const endEscUpGeoB = new THREE.BoxGeometry(escalatorWidth, floorDepth, 1);
            const endEscUpB = new THREE.Mesh(endEscUpGeoB, window.EscalatorMaterial);
            endEscUpB.name = `Left Escalator Up End B ${i}`;
            //start1Esc.rotation.x = -Math.PI / 2;
            endEscUpB.position.set(
                SETTINGS.corridorWidth + 0.1 + (escalatorWidth / 2),
                floorY -(floorDepth/3) -0.08 , // So the top is at floorY
                -16 - totalCorridorLength  - 3.5
            );
            endEscUpB.receiveShadow = true;
            scene.add(endEscUpB);
            worldObjects.push(endEscUpB);
            // NEW: Store a translated clone of THE END MESH FOR UP STEPS B
            const translatedEndEscUpB = endEscUpB.clone();
            translatedEndEscUpB.position.y += 0.2;
            translatedEndEscUpB.position.z -= 0.3; // Corrected to make B-Wing UP behave like A-Wing UP (stop short)
            escalatorEndsB.up[i] = translatedEndEscUpB;
            // End of Right side escalator Ramp going up from lower floor////
            // --- End of B-Wing Escalators ---   BBBBBBBBBBB

            // --- Add Balustrades --- ///////////////////////////////////////////////////

            // Balustrades for Escalator Wing-A UP (Left side, X from -escalatorWidth to 0) /// AAAAAAAA
            const startUpBalustrade = new THREE.Vector3(-SETTINGS.escalatorWidth / 2, (i - 1) * SETTINGS.floorHeight - floorDepth, totalCorridorLength + SETTINGS.escalatorLength + 4 );
            const endUpBalustrade = new THREE.Vector3(-SETTINGS.escalatorWidth / 2, floorY - floorDepth/2, totalCorridorLength + 3.5);
            const dirUpBalustrade = new THREE.Vector3().subVectors(endUpBalustrade, startUpBalustrade);
            const lengthUpBalustrade = dirUpBalustrade.length();
            const centerPosUpBalustrade = new THREE.Vector3().addVectors(startUpBalustrade, endUpBalustrade).multiplyScalar(0.5);

            // Calculate the Y position of the ramp surface at the center Z for UP escalator A
            const centerZ_UpBalustrade = centerPosUpBalustrade.z;
            const rampSurfaceY_at_centerZ_Up = startUpBalustrade.y + (centerZ_UpBalustrade - startUpBalustrade.z) / (endUpBalustrade.z - startUpBalustrade.z) * (endUpBalustrade.y - startUpBalustrade.y);
            const balustradeCenterY_Up = rampSurfaceY_at_centerZ_Up + balustradeHeight / 2;

            // Inner balustrade A (closer to corridor, X=0)
            const innerBalustradeUpGeo = new THREE.BoxGeometry(balustradeThickness, balustradeHeight, lengthUpBalustrade);
            const innerBalustradeUp = new THREE.Mesh(innerBalustradeUpGeo, balustradeMaterial);
            innerBalustradeUp.name = `Balustrade_Up_Inner_F${i-1}-F${i}`;
            innerBalustradeUp.position.set(0 - balustradeThickness / 2, balustradeCenterY_Up, centerPosUpBalustrade.z);
            innerBalustradeUp.lookAt(innerBalustradeUp.position.clone().add(dirUpBalustrade));
            scene.add(innerBalustradeUp);
            worldObjects.push(innerBalustradeUp);

            // Outer balustrade A (X=-escalatorWidth)
            const outerBalustradeUpGeo = new THREE.BoxGeometry(balustradeThickness, balustradeHeight, lengthUpBalustrade);
            const outerBalustradeUp = new THREE.Mesh(outerBalustradeUpGeo, balustradeMaterial);
            outerBalustradeUp.name = `Balustrade_Up_Outer_F${i-1}-F${i}`;
            outerBalustradeUp.position.set(-SETTINGS.escalatorWidth + balustradeThickness / 2, balustradeCenterY_Up, centerPosUpBalustrade.z);
            outerBalustradeUp.lookAt(outerBalustradeUp.position.clone().add(dirUpBalustrade));
            scene.add(outerBalustradeUp);
            worldObjects.push(outerBalustradeUp);

            // Add cylinders for escalator UP balustrades A (posts at end sides)
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

            // Balustrades for Escalator DOWN A (Right side, X from SETTINGS.corridorWidth to SETTINGS.corridorWidth + escalatorWidth)
            const startDownBalustrade = new THREE.Vector3(SETTINGS.corridorWidth + SETTINGS.escalatorWidth / 2, floorY - floorDepth/2, totalCorridorLength + 3.5);
            const endDownBalustrade = new THREE.Vector3(SETTINGS.corridorWidth + SETTINGS.escalatorWidth / 2, (i - 1) * SETTINGS.floorHeight - floorDepth, totalCorridorLength + SETTINGS.escalatorLength + 4 );
            const dirDownBalustrade = new THREE.Vector3().subVectors(endDownBalustrade, startDownBalustrade);
            const lengthDownBalustrade = dirDownBalustrade.length();
            const centerPosDownBalustrade = new THREE.Vector3().addVectors(startDownBalustrade, endDownBalustrade).multiplyScalar(0.5);

            // Calculate the Y position of the ramp surface at the center Z for DOWN escalator A
            const centerZ_DownBalustrade = centerPosDownBalustrade.z;
            const rampSurfaceY_at_centerZ_Down = startDownBalustrade.y + (centerZ_DownBalustrade - startDownBalustrade.z) / (endDownBalustrade.z - startDownBalustrade.z) * (endDownBalustrade.y - startDownBalustrade.y);
            const balustradeCenterY_Down = rampSurfaceY_at_centerZ_Down + balustradeHeight / 2;

            // Inner balustrade A (closer to corridor, X=SETTINGS.corridorWidth)
            const innerBalustradeDownGeo = new THREE.BoxGeometry(balustradeThickness, balustradeHeight, lengthDownBalustrade);
            const innerBalustradeDown = new THREE.Mesh(innerBalustradeDownGeo, balustradeMaterial);
            innerBalustradeDown.name = `Balustrade_Down_Inner_F${i}-F${i-1}`;
            innerBalustradeDown.position.set(SETTINGS.corridorWidth + balustradeThickness / 2, balustradeCenterY_Down, centerPosDownBalustrade.z);
            innerBalustradeDown.lookAt(innerBalustradeDown.position.clone().add(dirDownBalustrade));
            scene.add(innerBalustradeDown);
            worldObjects.push(innerBalustradeDown);

            // Outer balustrade A (X=SETTINGS.corridorWidth + escalatorWidth)
            const outerBalustradeDownGeo = new THREE.BoxGeometry(balustradeThickness, balustradeHeight, lengthDownBalustrade);
            const outerBalustradeDown = new THREE.Mesh(outerBalustradeDownGeo, balustradeMaterial);
            outerBalustradeDown.name = `Balustrade_Down_Outer_F${i}-F${i-1}`;
            outerBalustradeDown.position.set(SETTINGS.corridorWidth + SETTINGS.escalatorWidth - balustradeThickness / 2, balustradeCenterY_Down, centerPosDownBalustrade.z);
            outerBalustradeDown.lookAt(outerBalustradeDown.position.clone().add(dirDownBalustrade));
            scene.add(outerBalustradeDown);
            worldObjects.push(outerBalustradeDown);

            // Add cylinders for escalator DOWN balustrades A (posts at end sides)
            {
                const cylinderGeo = new THREE.CylinderGeometry(balustradeHeight/2, balustradeHeight/2, balustradeThickness, 16);
                cylinderGeo.rotateZ(Math.PI/2);
                // For down balustrade A, use startDownBalustrade and endDownBalustrade
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
            // --- End of Balustrades Wing A --- /////////////

            // Balustrades for Escalators in Wing-B ////////////////////// BBBBBBB
            // Balustrades for Escalator B UP (Left side, X from -escalatorWidth to 0)
            const startUpBalustradeB = new THREE.Vector3(
                - (SETTINGS.escalatorWidth / 2),
                (i - 1) * SETTINGS.floorHeight - floorDepth,
                -16 - totalCorridorLength - SETTINGS.escalatorLength - 4 
            );
            const endUpBalustradeB = new THREE.Vector3(- (SETTINGS.escalatorWidth / 2), 
                floorY - floorDepth/2,
                -16 -totalCorridorLength - 3.5);
            const dirUpBalustradeB = new THREE.Vector3().subVectors(endUpBalustradeB, startUpBalustradeB);
            const lengthUpBalustradeB = dirUpBalustradeB.length();
            const centerPosUpBalustradeB = new THREE.Vector3().addVectors(startUpBalustradeB, endUpBalustradeB).multiplyScalar(0.5);

            // Calculate the Y position of the ramp surface at the center Z for UP escalator B
            const centerZ_UpBalustradeB = centerPosUpBalustradeB.z;
            const rampSurfaceY_at_centerZ_UpB = startUpBalustradeB.y + (centerZ_UpBalustradeB - startUpBalustradeB.z) / (endUpBalustradeB.z - startUpBalustradeB.z) * (endUpBalustradeB.y - startUpBalustradeB.y);
            const balustradeCenterY_UpB = rampSurfaceY_at_centerZ_UpB + balustradeHeight / 2;

            // Inner balustrade B (closer to corridor, X=0)
            const innerBalustradeUpGeoB = new THREE.BoxGeometry(balustradeThickness, balustradeHeight, lengthUpBalustradeB);
            const innerBalustradeUpB = new THREE.Mesh(innerBalustradeUpGeoB, balustradeMaterial);
            innerBalustradeUpB.name = `Balustrade_B_Up_Inner_F${i-1}-F${i}`;
            innerBalustradeUpB.position.set(0 - balustradeThickness / 2, balustradeCenterY_UpB, centerPosUpBalustradeB.z);
            innerBalustradeUpB.lookAt(innerBalustradeUpB.position.clone().add(dirUpBalustradeB));
            scene.add(innerBalustradeUpB);
            worldObjects.push(innerBalustradeUpB);

            // Outer balustrade B (X=-escalatorWidth)
            const outerBalustradeUpGeoB = new THREE.BoxGeometry(balustradeThickness, balustradeHeight, lengthUpBalustradeB);
            const outerBalustradeUpB = new THREE.Mesh(outerBalustradeUpGeoB, balustradeMaterial);
            outerBalustradeUpB.name = `Balustrade_B_Up_Outer_F${i-1}-F${i}`;
            outerBalustradeUpB.position.set(-SETTINGS.escalatorWidth + balustradeThickness / 2, balustradeCenterY_UpB, centerPosUpBalustradeB.z);
            outerBalustradeUpB.lookAt(outerBalustradeUpB.position.clone().add(dirUpBalustradeB));
            scene.add(outerBalustradeUpB);
            worldObjects.push(outerBalustradeUpB);

            // Add cylinders for escalator UP balustrades B (posts at end sides)
            {
                // Create a cylinder with diameter = balustradeHeight and height = balustradeThickness.
                const cylinderGeoB = new THREE.CylinderGeometry(balustradeHeight/2, balustradeHeight/2, balustradeThickness, 16);
                cylinderGeoB.rotateZ(Math.PI/2);
                // up direction along the balustrade (use already computed startUpBalustrade and endUpBalustrade)
                const upDirB = new THREE.Vector3().subVectors(endUpBalustradeB, startUpBalustradeB).normalize();
                const halfLengthUpB = lengthUpBalustradeB / 2;
                // For inner balustrade UP: compute endpoint centers from innerBalustradeUp.position (which is center of the box)
                const innerCenterB = innerBalustradeUpB.position.clone();
                const innerEnd1B = innerCenterB.clone().sub(upDirB.clone().multiplyScalar(halfLengthUpB));
                const innerEnd2B = innerCenterB.clone().add(upDirB.clone().multiplyScalar(halfLengthUpB));
                const cylinderInner1B = new THREE.Mesh(cylinderGeoB, balustradeMaterial);
                cylinderInner1B.position.copy(innerEnd1B);
                const cylinderInner2B = new THREE.Mesh(cylinderGeoB, balustradeMaterial);
                cylinderInner2B.position.copy(innerEnd2B);
                // For outer balustrade UP:
                const outerCenterB = outerBalustradeUpB.position.clone();
                const outerEnd1B = outerCenterB.clone().sub(upDirB.clone().multiplyScalar(halfLengthUpB));
                const outerEnd2 = outerCenterB.clone().add(upDirB.clone().multiplyScalar(halfLengthUpB));
                const cylinderOuter1B = new THREE.Mesh(cylinderGeoB, balustradeMaterial);
                cylinderOuter1B.position.copy(outerEnd1B);
                const cylinderOuter2B = new THREE.Mesh(cylinderGeoB, balustradeMaterial);
                cylinderOuter2B.position.copy(outerEnd2);
                scene.add(cylinderInner1B, cylinderInner2B, cylinderOuter1B, cylinderOuter2B);
            }

            // Balustrades for Escalator DOWN B (Right side, X from SETTINGS.corridorWidth to SETTINGS.corridorWidth + escalatorWidth)
            const startDownBalustradeB = new THREE.Vector3(
                SETTINGS.corridorWidth + SETTINGS.escalatorWidth / 2,
                floorY - floorDepth/2,
                -16 - totalCorridorLength - 3.5);
            const endDownBalustradeB = new THREE.Vector3(
                SETTINGS.corridorWidth + (SETTINGS.escalatorWidth / 2),
                (i - 1) * SETTINGS.floorHeight - floorDepth,
                -16 - totalCorridorLength - SETTINGS.escalatorLength - 4 );
            const dirDownBalustradeB = new THREE.Vector3().subVectors(endDownBalustradeB, startDownBalustradeB);
            const lengthDownBalustradeB = dirDownBalustradeB.length();
            const centerPosDownBalustradeB = new THREE.Vector3().addVectors(startDownBalustradeB, endDownBalustradeB).multiplyScalar(0.5);

            // Calculate the Y position of the ramp surface at the center Z for DOWN escalator B
            const centerZ_DownBalustradeB = centerPosDownBalustradeB.z;
            const rampSurfaceY_at_centerZ_DownB = startDownBalustradeB.y + (centerZ_DownBalustradeB - startDownBalustradeB.z) / (endDownBalustradeB.z - startDownBalustradeB.z) * (endDownBalustradeB.y - startDownBalustradeB.y);
            const balustradeCenterY_DownB = rampSurfaceY_at_centerZ_DownB + balustradeHeight / 2;

            // Inner balustrade B (closer to corridor, X=SETTINGS.corridorWidth)
            const innerBalustradeDownGeoB = new THREE.BoxGeometry(balustradeThickness, balustradeHeight, lengthDownBalustradeB);
            const innerBalustradeDownB = new THREE.Mesh(innerBalustradeDownGeoB, balustradeMaterial);
            innerBalustradeDownB.name = `Balustrade_B_Down_Inner_F${i}-F${i-1}`;
            innerBalustradeDownB.position.set(SETTINGS.corridorWidth + balustradeThickness / 2, balustradeCenterY_DownB, centerPosDownBalustradeB.z);
            innerBalustradeDownB.lookAt(innerBalustradeDownB.position.clone().add(dirDownBalustradeB));
            scene.add(innerBalustradeDownB);
            worldObjects.push(innerBalustradeDownB);

            // Outer balustrade B (X=SETTINGS.corridorWidth + escalatorWidth)
            const outerBalustradeDownGeoB = new THREE.BoxGeometry(balustradeThickness, balustradeHeight, lengthDownBalustradeB);
            const outerBalustradeDownB = new THREE.Mesh(outerBalustradeDownGeoB, balustradeMaterial);
            outerBalustradeDownB.name = `Balustrade_B_Down_Outer_F${i}-F${i-1}`;
            outerBalustradeDownB.position.set(SETTINGS.corridorWidth + SETTINGS.escalatorWidth - balustradeThickness / 2, balustradeCenterY_DownB, centerPosDownBalustradeB.z);
            outerBalustradeDownB.lookAt(outerBalustradeDownB.position.clone().add(dirDownBalustradeB));
            scene.add(outerBalustradeDownB);
            worldObjects.push(outerBalustradeDownB);

            // Add cylinders for escalator DOWN balustrades B (posts at end sides)
            {
                const cylinderGeoB = new THREE.CylinderGeometry(balustradeHeight/2, balustradeHeight/2, balustradeThickness, 16);
                cylinderGeoB.rotateZ(Math.PI/2);
                // For down balustrade, use startDownBalustrade and endDownBalustrade
                const downDirB = new THREE.Vector3().subVectors(endDownBalustradeB, startDownBalustradeB).normalize();
                const halfLengthDownB = lengthDownBalustradeB / 2;
                // For inner balustrade DOWN:
                const innerCenterDownB = innerBalustradeDownB.position.clone();
                const innerDownEnd1B = innerCenterDownB.clone().sub(downDirB.clone().multiplyScalar(halfLengthDownB));
                const innerDownEnd2B = innerCenterDownB.clone().add(downDirB.clone().multiplyScalar(halfLengthDownB));
                const cylinderInnerDown1B = new THREE.Mesh(cylinderGeoB, balustradeMaterial);
                cylinderInnerDown1B.position.copy(innerDownEnd1B);
                const cylinderInnerDown2B = new THREE.Mesh(cylinderGeoB, balustradeMaterial);
                cylinderInnerDown2B.position.copy(innerDownEnd2B);
                // For outer balustrade DOWN:
                const outerCenterDownB = outerBalustradeDownB.position.clone();
                const outerDownEnd1B = outerCenterDownB.clone().sub(downDirB.clone().multiplyScalar(halfLengthDownB));
                const outerDownEnd2B = outerCenterDownB.clone().add(downDirB.clone().multiplyScalar(halfLengthDownB));
                const cylinderOuterDown1B = new THREE.Mesh(cylinderGeoB, balustradeMaterial);
                cylinderOuterDown1B.position.copy(outerDownEnd1B);
                const cylinderOuterDown2B = new THREE.Mesh(cylinderGeoB, balustradeMaterial);
                cylinderOuterDown2B.position.copy(outerDownEnd2B);
                scene.add(cylinderInnerDown1B, cylinderInnerDown2B, cylinderOuterDown1B, cylinderOuterDown2B);
            }
            // --- End of Balustrades Wing B --- /////////////


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

        // Place enemies on office floors (Moved here to be within the 'i' loop scope)
        if (i >= 0) { // Office Floors
            // floorY is defined at the start of this loop

            // Wing A Enemies
            // 1. Corridor Enemy (random Z)
            const randomCorridorZ_A = Math.random() * totalCorridorLength;
            createEnemy(SETTINGS.corridorWidth / 2, floorY, randomCorridorZ_A, i);

            // 2. Left Room Enemy (random room)
            const randomLeftRoomIndex_A = Math.floor(Math.random() * SETTINGS.doorsPerSide);
            const leftRoomCenterZ_A = (randomLeftRoomIndex_A + 0.5) * SETTINGS.corridorSegmentLength;
            const leftRoomCenterX_A = SETTINGS.corridorWidth + SETTINGS.roomSize / 2;
            createEnemy(leftRoomCenterX_A, floorY, leftRoomCenterZ_A, i);

            // 3. Right Room Enemy (random room)
            const randomRightRoomIndex_A = Math.floor(Math.random() * SETTINGS.doorsPerSide);
            const rightRoomCenterZ_A = (randomRightRoomIndex_A + 0.5) * SETTINGS.corridorSegmentLength;
            const rightRoomCenterX_A = -SETTINGS.roomSize / 2;
            createEnemy(rightRoomCenterX_A, floorY, rightRoomCenterZ_A, i);

            // Wing B Enemies
            // 1. Corridor Enemy (random Z)
            // B-wing corridor Z ranges from -16 - totalCorridorLength (far end) to -16 (near end)
            const randomCorridorZ_B = -16 - (Math.random() * totalCorridorLength);
            createEnemy(SETTINGS.corridorWidth / 2, floorY, randomCorridorZ_B, i);

            // 2. Left Room Enemy (random room)
            const randomLeftRoomIndex_B = Math.floor(Math.random() * SETTINGS.doorsPerSide);
            const leftRoomCenterZ_B = ((randomLeftRoomIndex_B + 0.5) * SETTINGS.corridorSegmentLength) - 16 - totalCorridorLength;
            const leftRoomCenterX_B = SETTINGS.corridorWidth + SETTINGS.roomSize / 2; // Same X as A-wing left rooms
            createEnemy(leftRoomCenterX_B, floorY, leftRoomCenterZ_B, i);

            // 3. Right Room Enemy (random room)
            const randomRightRoomIndex_B = Math.floor(Math.random() * SETTINGS.doorsPerSide);
            const rightRoomCenterZ_B = ((randomRightRoomIndex_B + 0.5) * SETTINGS.corridorSegmentLength) - 16 - totalCorridorLength;
            const rightRoomCenterX_B = -SETTINGS.roomSize / 2; // Same X as A-wing right rooms
            createEnemy(rightRoomCenterX_B, floorY, rightRoomCenterZ_B, i);
        }

    }

    // Initial camera position relative to the active elevator
    // if (activeElevator) { // OLD LOGIC
    //     camera.position.set(
    //         activeElevator.platform.position.x,
    //         activeElevator.platform.position.y + playerHeight + 0.2, // Start slightly above the elevator platform
    //         activeElevator.platform.position.z + 0.1 // Start slightly inside the corridor from elevator
    //     );
    // } else { // Fallback if no elevators created (should not happen with current setup)
    //     camera.position.set(SETTINGS.corridorWidth / 2, playerHeight, 0);
    // }
    // NEW: Set player start position explicitly on the roof level, at X=corridorWidth/2, Z=0, facing -Z
    const startRoofY = SETTINGS.numFloors * SETTINGS.floorHeight;
    camera.position.set(SETTINGS.corridorWidth / 2, startRoofY + playerHeight, -16);
    controls.getObject().rotation.y = Math.PI; // Rotate 180 degrees (facing opposite direction
}); // End of fontLoader.load callback
} // End of generateWorld function

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
    const chainMesh = new THREE.Mesh(lampChainGeo, chainMaterial); // lampChainGeo height is 0.5
    chainMesh.position.y = 0.25; // Position chain center so its top (0.25 + 0.5/2 = 0.5) aligns with lightGroup's origin being 0.5 from ceiling

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
// --- Helper function to create outer wall pillars and window for a segment ---
function createOuterWall_SegmentFeatures(wallPlaneX, segmentCenterZ, segmentLength, floorY, wallHeight, wallThickness, wallMat, initialWindowMat, transparentWindowMat, roomId) {
    // These constants are now defined globally or near SETTINGS
    const windowW = segmentLength * WINDOW_WIDTH_RATIO;
    const windowH = wallHeight * WINDOW_HEIGHT_RATIO;
    const sillH = wallHeight * WINDOW_SILL_RATIO;
    // const headerH = wallHeight - windowH - sillH; // Not needed here anymore

    const pillarW = (segmentLength - windowW) / 2;

    // Y position for the center of the window section (pillars and glass)
    // This is the Y center of the actual window opening area.
    const windowSectionCenterY = floorY + sillH + (windowH / 2);

    // 1. Left Pillar (beside window, smaller Z value for this segment)
    if (pillarW > 0.01) {
        const pillarLGeo = new THREE.BoxGeometry(wallThickness, windowH, pillarW); // X, Y, Z dimensions
        const pillarL = new THREE.Mesh(pillarLGeo, wallMat);
        pillarL.position.set(wallPlaneX, windowSectionCenterY, segmentCenterZ - (segmentLength / 2) + (pillarW / 2));
        pillarL.castShadow = true; pillarL.receiveShadow = true;
        scene.add(pillarL); worldObjects.push(pillarL); // Structural
        pillarL.name = `OuterWallPillarL_Seg_${roomId}`;

        // 2. Right Pillar (beside window, larger Z value for this segment)
        const pillarRGeo = new THREE.BoxGeometry(wallThickness, windowH, pillarW); // X, Y, Z dimensions
        const pillarR = new THREE.Mesh(pillarRGeo, wallMat);
        pillarR.position.set(wallPlaneX, windowSectionCenterY, segmentCenterZ + (segmentLength / 2) - (pillarW / 2));
        pillarR.castShadow = true; pillarR.receiveShadow = true;
        scene.add(pillarR); worldObjects.push(pillarR); // Structural
        pillarR.name = `OuterWallPillarR_Seg_${roomId}`;
    }

    // 3. Window Glass Pane for this segment
    if (windowW > 0.01 && windowH > 0.01) {
        const glassGeo = new THREE.BoxGeometry(wallThickness * 0.25, windowH, windowW);
        const glass = new THREE.Mesh(glassGeo, initialWindowMat); // Use initial material
        glass.position.set(wallPlaneX, windowSectionCenterY, segmentCenterZ);
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
        case 'KeyP': toggleWireframeView(); break; // Toggle wireframe view
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

// --- Wireframe Toggle ---
function toggleWireframeView() {
    isWireframeView = !isWireframeView;
    scene.traverse(function (object) {
        if (object.isMesh) {
            if (Array.isArray(object.material)) {
                object.material.forEach(mat => mat.wireframe = isWireframeView);
            } else if (object.material) {
                object.material.wireframe = isWireframeView;
            }
        }
    });
    console.log(`Wireframe view ${isWireframeView ? 'enabled' : 'disabled'}`);
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
            SETTINGS.playerSpeed /= 2; // Restore crouch speed
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
                        openAngle = (playerX > 0) ? -Math.PI / 2 : Math.PI / 2;
                    } else { // Left-side door (at SETTINGS.corridorWidth)
                        openAngle = (playerX < doorX) ? Math.PI / 2 : -Math.PI / 2;
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
                        openAngle = (playerX > 0) ? -Math.PI / 2 : Math.PI / 2;
                    } else { // Left-side door
                        openAngle = (playerX < doorX) ? Math.PI / 2 : -Math.PI / 2;
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
            // At this point, elevatorId is guaranteed to be true because of the 'else if' condition
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

    // Player shoots a projectile
    const projectileStartOffset = 0.5; // Distance in front of camera to spawn projectile
    const projectileDirection = new THREE.Vector3();
    camera.getWorldDirection(projectileDirection); // Get the direction camera is facing

    const projectileStartPosition = new THREE.Vector3();
    camera.getWorldPosition(projectileStartPosition); // Get camera's world position
    
    // Offset the start position along the direction vector
    projectileStartPosition.addScaledVector(projectileDirection, projectileStartOffset);
    // Adjust Y to be closer to a gun barrel height if desired, relative to camera
    projectileStartPosition.y -= 0.2; // Example: lower the spawn point slightly

    createProjectile(projectileStartPosition, projectileDirection, true); // true: firedByPlayer

    // Raycasting for other interactions (knobs, safes, windows, lights)
    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2(0, 0);
    raycaster.setFromCamera(pointer, camera);
    // Filter out enemies from direct interaction raycast as projectiles will handle them
    const interactables = [...lights, ...doors, ...worldObjects.filter(obj => obj.userData.type !== 'enemy')];
    const intersects = raycaster.intersectObjects(interactables, true);

    if (intersects.length > 0) {
        const hit = intersects[0];
        const hitObject = hit.object;

        if (hitObject.userData.doorKnob) {
            const door = hitObject.parent;
            if (door.userData.locked) { // Check if the door is actually locked
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
                createBulletHole(hit.point, hit.face.normal);
            }
        } else if (hitObject.userData.isWindow) {
            breakWindow(hitObject);
            createBulletHole(hit.point, hit.face.normal);
        } else {
            // For other hits, create a bullet hole normally
            createBulletHole(hit.point, hit.face.normal);
            const directLightHit = lights.includes(hitObject) ? hitObject : (lights.includes(hitObject.parent) ? hitObject.parent : null);
            if (directLightHit && directLightHit.userData && !directLightHit.userData.isDestroyed) {
                 destroyLight(directLightHit);
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
    playerScore += 10; 
    updateUI();

    if (lightGroup.userData.pointLight) {
        lightGroup.userData.pointLight.intensity *= 10; 
        setTimeout(() => {
            lightGroup.userData.pointLight.intensity = 0; 
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
        // Store necessary info before detaching
        lampshade.userData.floorIndex = lightGroup.userData.floorIndex; // Pass floor index
        lampshade.userData.originalLightId = lightGroup.id; // Optional: for debugging
        
        dropLampshade(lampshade); // Call the modified dropLampshade
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
    const originalLightPosition = new THREE.Vector3();
    lampshade.getWorldPosition(originalLightPosition); // Capture where the light was

    if (lampshade.parent) {
        lampshade.parent.remove(lampshade); // Detach from original light group
    }
    scene.add(lampshade); // Add to scene to manage its fall independently
    lampshade.position.copy(originalLightPosition); // Start falling from original light position

    if (!lampshade.geometry.boundingBox) {
        lampshade.geometry.computeBoundingBox();
    }
    // lampshadeHeight is the actual height of the cone geometry
    const lampshadeHeight = lampshade.geometry.parameters.height; // For ConeGeometry, this is reliable

    const lightFloorIndex = lampshade.userData.floorIndex; // Assumes floorIndex is stored
    const floorYPosition = lightFloorIndex * SETTINGS.floorHeight;

    let hitPlayerTarget = null;

    // --- 1. Direct Hit Check for Player ONLY (Optional, for instant hit feel) ---
    const lightXZPos = new THREE.Vector2(originalLightPosition.x, originalLightPosition.z);
    const playerCameraPos = controls.getObject().position;
    const playerXZPos = new THREE.Vector2(playerCameraPos.x, playerCameraPos.z);

    // Check if player is directly under the light when it starts falling
    if (playerXZPos.distanceTo(lightXZPos) < 0.7) { // Reduced radius for more direct hit
        const playerTopY = playerCameraPos.y; // Player's camera Y (head)
        const playerBottomY = playerCameraPos.y - playerHeight;
        // If the light fixture was roughly at head level or just above
        if (originalLightPosition.y > playerBottomY && originalLightPosition.y < playerTopY + lampshadeHeight + 0.3) {
            hitPlayerTarget = { type: 'player', object: controls.getObject(), hitY: playerTopY };
        }
    }

    if (hitPlayerTarget) {
        // Place lampshade on player and apply damage
        lampshade.position.set(hitPlayerTarget.object.position.x, hitPlayerTarget.hitY - playerHeight + lampshadeHeight/2 , hitPlayerTarget.object.position.z); // Position on player's actual head
        applyDamageToPlayer(25); // Damage amount for player
        console.log("Lampshade hit player directly.");
        // Player wears it as a hat, make it non-pickable to avoid immediate re-pickup
        lampshade.userData.isPickable = false;
        // To make it fall off after a while or be a temporary effect, more logic would be needed here.
        // For now, it stays as a hat and the fall animation is skipped.
        return;
    }

    // --- 2. Lampshade Falls and Hits Floor/Enemy ---
    // Target Y for the center of the lampshade to rest on the floor
    const targetFloorY = floorYPosition + lampshadeHeight / 2;
    let animationComplete = false;

    const fallInterval = setInterval(() => {
        if (animationComplete) {
            clearInterval(fallInterval);
            return;
        }

        lampshade.position.y -= 0.15; // Fall speed

        let lampshadeBox;
        try {
            lampshadeBox = new THREE.Box3().setFromObject(lampshade);
            if (!lampshadeBox.min || !lampshadeBox.max || lampshadeBox.isEmpty()) {
                // console.warn("LampshadeBox became invalid during fall, removing lampshade.");
                clearInterval(fallInterval);
                scene.remove(lampshade);
                return;
            }
        } catch(e) {
            // console.error("Error creating lampshadeBox during fall, removing lampshade.", e);
            clearInterval(fallInterval);
            scene.remove(lampshade);
            return;
        }

        // Check collision with enemies first
        for (let i = enemies.length - 1; i >= 0; i--) {
            const enemy = enemies[i];
            let enemyBox;
            try {
                enemyBox = new THREE.Box3().setFromObject(enemy);
                if (!enemyBox.min || !enemyBox.max || enemyBox.isEmpty()) continue;
            } catch(e) { continue; }

            if (lampshadeBox.intersectsBox(enemyBox)) {
                const enemyTopY = enemy.position.y + ENEMY_SETTINGS.height / 2;
                const lampshadeBottomY = lampshade.position.y - lampshadeHeight / 2;

                // Condition: Lampshade's bottom is at or slightly above the enemy's head,
                // and below a certain threshold above the head (to count as a "landing on" hit)
                // and also above the enemy's base to ensure it's a top-down hit.
                if (lampshadeBottomY <= enemyTopY + 0.1 && lampshadeBottomY >= enemy.position.y) {
                    console.log("Lampshade hit and destroyed enemy during fall:", enemy.name);
                    playerScore += 150;
                    updateUI();

                    scene.remove(enemy);
                    const worldObjIndex = worldObjects.indexOf(enemy);
                    if (worldObjIndex > -1) worldObjects.splice(worldObjIndex, 1);
                    enemies.splice(i, 1); // Remove from enemies array

                    scene.remove(lampshade); // Destroy lampshade
                    animationComplete = true;
                    clearInterval(fallInterval);
                    return; // Exit interval callback
                }
            }
        }

        if (animationComplete) return; // If an enemy was hit and destroyed

        // Then check collision with other world objects (for landing on floor/surfaces)
        for (const object of worldObjects) {
            if (object === lampshade || object.userData.type === 'projectile' || !object.visible || !(object.isMesh || object.isGroup) || enemies.includes(object)) {
                continue; // Skip self, projectiles, invisible, non-collidable, or already handled enemies
            }
            if (object.isGroup && object.children.length === 0) {
                continue;
            }

            let objectBox;
            try {
                // Ensure the object is valid for bounding box calculation
                if (object.geometry || (object.isGroup && object.children.length > 0)) {
                    objectBox = new THREE.Box3().setFromObject(object);
                    if (!objectBox.min || !objectBox.max || objectBox.isEmpty()) continue;
                } else {
                    continue;
                }
            } catch (e) {
                // console.error("Error computing bounding box for object during fall:", object.name, e);
                continue;
            }

            if (lampshadeBox.intersectsBox(objectBox)) {
                // Check if the lampshade is landing on top of this object
                // The lampshade's bottom should be close to the object's top
                const lampshadeBottomY = lampshade.position.y - lampshadeHeight / 2;
                if (lampshadeBottomY <= objectBox.max.y + 0.05 && lampshadeBottomY >= objectBox.max.y - 0.15) { // Small tolerance for landing
                    lampshade.position.y = objectBox.max.y + lampshadeHeight / 2;
                    animationComplete = true;
                    lampshade.userData.isPickable = true;
                    // console.log(`Lampshade landed on ${object.name}.`);
                    break;
                }
            }
        }

        // Land on target floor if no other collision stops it earlier
        if (!animationComplete && lampshade.position.y <= targetFloorY) {
            lampshade.position.y = targetFloorY;
            animationComplete = true;
            lampshade.userData.isPickable = true;
            // console.log(`Lampshade landed on target floor ${lightFloorIndex}.`);
        }

        if (animationComplete) {
            clearInterval(fallInterval);
            return;
        }

        if (lampshade.position.y < -50) { // Fell out of world
            // console.warn("Lampshade fell out of world and was removed.");
            animationComplete = true;
            scene.remove(lampshade);
            clearInterval(fallInterval);
        }
    }, 33); // approx 30 FPS for this animation
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

    // Remove enemies from scene, enemies array, and worldObjects
    enemies.forEach(enemy => {
        scene.remove(enemy);
        const indexInWorldObjects = worldObjects.indexOf(enemy);
        if (indexInWorldObjects > -1) {
            worldObjects.splice(indexInWorldObjects, 1);
        }
    });
    enemies.length = 0; // Clear the array

    // Clear projectiles
    projectiles.forEach(projectile => {
        scene.remove(projectile);
        const indexInWorldObjects = worldObjects.indexOf(projectile);
        if (indexInWorldObjects > -1) {
            worldObjects.splice(indexInWorldObjects, 1);
        }
    });
    projectiles.length = 0;
    
    document.getElementById('gameOver').style.display = 'none';
    updateUI();

    // Reset player state
    playerState = 'upright';
    playerHeight = 1.7;

    // Reset player position to the active elevator
    if (activeElevator) {
        controls.getObject().position.set(
            activeElevator.platform.position.x,
            activeElevator.platform.position.y + playerHeight + 0.2,
            activeElevator.platform.position.z
        );
    } else {
        camera.position.set(SETTINGS.corridorWidth / 2, playerHeight, 0); // Default spawn
    }
    playerVelocity.set(0, 0, 0);
}

function updatePlayer(deltaTime) {
    const speed = (isSprinting ? SETTINGS.playerSpeed * SETTINGS.sprintMultiplier : SETTINGS.playerSpeed) * deltaTime;
    const cameraObject = controls.getObject(); // This is the holder for the camera

    // Player movement on escalator steps is now handled by calculateEscalatorBoost
    const escalatorResult = calculateEscalatorBoost( // This function directly moves the player on steps
        cameraObject, 
        escalatorSteps, escalatorStarts, escalatorEnds, 
        escalatorStepsB, escalatorStartsB, escalatorEndsB, 
        SETTINGS, deltaTime, playerHeight
    );

    // Apply gravity
    // Allow escalator vertical movement to override gravity if player is on an active step
    if (!playerOnGround && !(escalatorResult && escalatorResult.onEscalator)) {
        playerVelocity.y += SETTINGS.gravity * deltaTime;
    }

    // Calculate movement direction based on camera orientation
    const moveDirection = new THREE.Vector3(); // Player's input movement
    if (moveForward) moveDirection.z = -1;
    if (moveBackward) moveDirection.z = 1;
    if (moveLeft) moveDirection.x = -1;
    if (moveRight) moveDirection.x = 1;

    moveDirection.normalize(); // Ensure consistent speed diagonally
    moveDirection.applyEuler(cameraObject.rotation); // Apply camera rotation (Y-axis mainly for FPS)

    if (escalatorResult.disembarkedDown) {
        playerVelocity.y = SETTINGS.jumpVelocity * 0.25; // Small upward pop (adjust multiplier as needed, e.g., 0.2 to 0.3)
        playerOnGround = false; // Allow the pop to happen
    }

    // If calculateEscalatorBoost handled movement (returned onEscalator: true),
    // player input movement (deltaX, deltaZ) is for off-escalator or additive movement.
    // Since calculateEscalatorBoost directly modifies cameraObject.position,
    // we only apply player input movement if not actively on an escalator step.
    let totalDeltaX = 0;
    let totalDeltaZ = 0;
    if (!escalatorResult.onEscalator) {
        totalDeltaX = moveDirection.x * speed;
        totalDeltaZ = moveDirection.z * speed;
    }

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
    let escalatorFoundThisFrame = false;
    let typeThisFrame = null;
    let floorThisFrame = null;
    let wingThisFrame = null; // 'A' or 'B'
    const playerPos = controls.getObject().position;

    // Check Wing A starts
    for (const [floor, mesh] of Object.entries(escalatorStarts.up)) {
        if (isPlayerOnMesh(playerPos, mesh)) {
            escalatorFoundThisFrame = true; typeThisFrame = 'up'; floorThisFrame = parseInt(floor); wingThisFrame = 'A';
            break;
        }
    }
    if (!escalatorFoundThisFrame) {
        for (const [floor, mesh] of Object.entries(escalatorStarts.down)) {
            if (isPlayerOnMesh(playerPos, mesh)) {
                escalatorFoundThisFrame = true; typeThisFrame = 'down'; floorThisFrame = parseInt(floor); wingThisFrame = 'A';
                break;
            }
        }
    }
    // Check Wing B starts if not found in A
    if (!escalatorFoundThisFrame) {
        for (const [floor, mesh] of Object.entries(escalatorStartsB.up)) {
            if (isPlayerOnMesh(playerPos, mesh)) {
                escalatorFoundThisFrame = true; typeThisFrame = 'up'; floorThisFrame = parseInt(floor); wingThisFrame = 'B';
                break;
            }
        }
    }
    if (!escalatorFoundThisFrame) {
        for (const [floor, mesh] of Object.entries(escalatorStartsB.down)) {
            if (isPlayerOnMesh(playerPos, mesh)) {
                escalatorFoundThisFrame = true; typeThisFrame = 'down'; floorThisFrame = parseInt(floor); wingThisFrame = 'B';
                break;
            }
        }
    }

    // Only update if state changed
    if (
        playerOnEscalator.type !== typeThisFrame ||
        playerOnEscalator.floor !== floorThisFrame ||
        playerOnEscalator.wing !== wingThisFrame
    ) {
        // Reset all steps to EscalatorMaterial
        for (const steps of Object.values(escalatorSteps.up))   { steps.forEach(step => { step.material = window.EscalatorMaterial; }); }
        for (const steps of Object.values(escalatorSteps.down)) { steps.forEach(step => { step.material = window.EscalatorMaterial; }); }
        for (const steps of Object.values(escalatorStepsB.up))  { steps.forEach(step => { step.material = window.EscalatorMaterial; }); }
        for (const steps of Object.values(escalatorStepsB.down)){ steps.forEach(step => { step.material = window.EscalatorMaterial; }); }

        // If on an escalator, set its steps to EscalatorEmbarkMaterial
        if (escalatorFoundThisFrame && typeThisFrame && floorThisFrame !== null && wingThisFrame) {
            if (wingThisFrame === 'A' && escalatorSteps[typeThisFrame] && escalatorSteps[typeThisFrame][floorThisFrame]) {
                escalatorSteps[typeThisFrame][floorThisFrame].forEach(step => {
                    step.material = window.EscalatorEmbarkMaterial;
                });
            } else if (wingThisFrame === 'B' && escalatorStepsB[typeThisFrame] && escalatorStepsB[typeThisFrame][floorThisFrame]) {
                escalatorStepsB[typeThisFrame][floorThisFrame].forEach(step => {
                    step.material = window.EscalatorEmbarkMaterialB; // Use B-Wing specific material
                });
            }
        }
        playerOnEscalator.type = typeThisFrame;
        playerOnEscalator.floor = floorThisFrame;
        playerOnEscalator.wing = wingThisFrame;
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
    if ( controls && controls.isLocked) {
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


function updateEnemies(deltaTime) {
    if (!controls.isLocked || !camera) return; // Ensure camera and controls are ready

    const playerCameraObject = controls.getObject();
    const playerWorldPosition = new THREE.Vector3();
    playerCameraObject.getWorldPosition(playerWorldPosition);

    const playerBodyCenter = playerWorldPosition.clone();
    playerBodyCenter.y -= playerHeight / 2;

    enemies.forEach(enemy => {
        if (enemy.userData.health <= 0) return;

        const enemyPosition = enemy.position.clone();
        const distanceToPlayer = enemyPosition.distanceTo(playerBodyCenter);

        if (distanceToPlayer > ENEMY_SETTINGS.activationRadius) {
            return;
        }

        const lookAtTarget = playerBodyCenter.clone();
        lookAtTarget.y = enemyPosition.y;
        enemy.lookAt(lookAtTarget);

        const rayOrigin = enemyPosition.clone();
        rayOrigin.y += ENEMY_SETTINGS.height * 0.4; // Enemy "eye" level

        const directionToPlayer = playerBodyCenter.clone().sub(rayOrigin).normalize();
        const raycaster = new THREE.Raycaster(rayOrigin, directionToPlayer, 0.1, ENEMY_SETTINGS.losMaxDistance);

        const obstacles = worldObjects.filter(obj => obj !== enemy && obj.userData.type !== 'projectile' && obj !== playerCameraObject.parent && obj !== camera);
        const intersects = raycaster.intersectObjects(obstacles, true);

        let playerInLOS = true;
        if (intersects.length > 0) {
            if (intersects[0].distance < distanceToPlayer - 0.5) { // 0.5 tolerance
                playerInLOS = false;
            }
        }

        if (playerInLOS && distanceToPlayer <= ENEMY_SETTINGS.losMaxDistance) {
            const currentTime = clock.getElapsedTime() * 1000;
            if (currentTime > enemy.userData.lastShotTime + ENEMY_SETTINGS.fireRate) {
                enemy.userData.lastShotTime = currentTime;

                let firePosition;
                const gun = enemy.userData.gun;
                const storedGunLength = enemy.userData.gunLength;

                if (gun && storedGunLength > 0) {
                    // Projectile emits from the tip of the gun.
                    // The gun's local Z+ axis is its "forward" after rotation.
                    const localTipPosition = new THREE.Vector3(0, 0, storedGunLength / 2);
                    firePosition = gun.localToWorld(localTipPosition.clone()).addScaledVector(directionToPlayer, 0.1); // Add small offset forward
                } else {
                    // Fallback if gun isn't set up (shouldn't happen with the new code)
                    firePosition = enemy.position.clone();
                    const forwardVector = new THREE.Vector3(0, 0, -1); // Enemy's local forward
                    forwardVector.applyQuaternion(enemy.quaternion);
                    firePosition.addScaledVector(forwardVector, ENEMY_SETTINGS.depth / 2 + 0.1); // Spawn slightly in front
                }

                createProjectile(firePosition, directionToPlayer, false, enemy);
            }
        }
    });
}

function updateProjectiles(deltaTime) {
    const playerCameraPosition = controls.getObject().position;
    const playerBodyCenter = playerCameraPosition.clone();
    playerBodyCenter.y -= playerHeight / 2;
    const sceneRemoveThreshold = 100; // Define the threshold for removing out-of-bounds projectiles

    const playerCollisionBox = new THREE.Box3().setFromCenterAndSize(
        playerBodyCenter,
        new THREE.Vector3(0.7, playerHeight, 0.7) // Player's collision box, adjust size as needed
    );

    for (let i = projectiles.length - 1; i >= 0; i--) {
        const projectile = projectiles[i];
        let projectileNeedsRemoval = false;
        let createHoleAt = null;
        let holeNormal = null;

        projectile.position.addScaledVector(projectile.userData.velocity, deltaTime);
        const projectileBox = new THREE.Box3().setFromObject(projectile); // Calculate once per projectile

        if (clock.getElapsedTime() - projectile.userData.spawnTime > 5) { // 5 seconds lifetime
            projectileNeedsRemoval = true;
        }

        if (projectile.position.x > sceneRemoveThreshold || projectile.position.x < -sceneRemoveThreshold
            || projectile.position.y > sceneRemoveThreshold || projectile.position.y < -sceneRemoveThreshold
            || projectile.position.z > sceneRemoveThreshold || projectile.position.z < -sceneRemoveThreshold) {
            projectileNeedsRemoval = true;
        }

        // Reason 3: Collision (if not already flagged for removal)
        if (!projectileNeedsRemoval) {
            // Check collision with player if fired by enemy
            if (!projectile.userData.firedByPlayer && projectileBox.intersectsBox(playerCollisionBox)) {
                applyDamageToPlayer(10); // Example damage
                projectileNeedsRemoval = true;
                createHoleAt = null; // No bullet hole on player
            } else {
                // Check collision with world objects (including enemies)
                for (let j = worldObjects.length - 1; j >= 0; j--) {
                    const wo = worldObjects[j];

                    if (wo === projectile || wo.userData.type === 'projectile' || !wo.geometry || !wo.geometry.boundingBox) {
                        continue;
                    }

                    // Explicitly skip collision check if the world object is the firer's gun
                    const projFirer = projectile.userData.firer;
                    if (projFirer && projFirer.userData.gun && wo === projFirer.userData.gun) {
                         continue; // Skip collision with the firer's own gun
                    }
                     // Prevent projectile from colliding with the entity that fired it immediately
                    if (projectile.userData.firedByPlayer && wo === camera.parent) continue; // Player projectile vs player
                    // Add similar check if enemies can fire (wo === enemyThatFired)

                    const objectWorldBox = new THREE.Box3().copy(wo.geometry.boundingBox).applyMatrix4(wo.matrixWorld);
                    if (projectileBox.intersectsBox(objectWorldBox)) {
                        projectileNeedsRemoval = true;
                        // Default to creating a hole, can be overridden for self-hits or player hits
                        createHoleAt = projectile.position.clone(); 

                        if (wo.userData.type === 'enemy') {
                            const enemyHit = wo;
                            const projFirer = projectile.userData.firer;
                            const projByPlayer = projectile.userData.firedByPlayer;
                            
                            console.log(`ENEMY PROJECTILE COLLISION DETAILS: Proj ID: ${projectile.id}, Firer: ${projFirer ? projFirer.name + ' (ID: ' + projFirer.id + ')' : 'None/Player'}, Hit Enemy: ${enemyHit.name} (ID: ${enemyHit.id}), ProjByPlayer: ${projByPlayer}`);
                            holeNormal = projectile.userData.velocity.clone().normalize().negate(); // Only calculate normal if creating a hole
                            if (projByPlayer) {
                                // Player's projectile hits an enemy
                                console.log("Player projectile hit enemy:", wo.name);
                                playerScore += 100;
                                updateUI();
                                // wo.userData.health -= projectileDamage; // Implement health/damage
                                // Remove enemy hit by player
                                scene.remove(enemyHit);
                                worldObjects.splice(j, 1); // wo is worldObjects[j]
                                const woIndexInEnemies = enemies.indexOf(enemyHit);
                                if (woIndexInEnemies > -1) {
                                    enemies.splice(woIndexInEnemies, 1);
                                }
                            } else {
                                // Enemy's projectile hits an enemy
                                if (projFirer && enemyHit === projFirer) {
                                    // Enemy shot itself
                                    console.log(`   CONFIRMED SELF-HIT: ${projFirer.name} (ID: ${projFirer.id}) shot self. Projectile removed, enemy unharmed. No hole.`);
                                    createHoleAt = null; // No bullet hole on self
                                    // Firer (enemyHit) is NOT removed. Projectile will be removed.
                                } else {
                                    // Enemy projectile hits a DIFFERENT enemy (or firer is unknown)
                                    // This is ACCIDENTAL FRIENDLY FIRE - the other enemy is hit.
                                    console.log(`   FRIENDLY FIRE / UNKNOWN FIRER: Projectile from ${projFirer ? projFirer.name + ' (ID: ' + projFirer.id + ')' : 'Unknown/Player'} hit ${enemyHit.name} (ID: ${enemyHit.id}). ENEMY REMOVED!`);
                                    scene.remove(enemyHit);
                                    worldObjects.splice(j, 1); // wo is worldObjects[j]
                                    const woIndexInEnemies = enemies.indexOf(enemyHit);
                                    if (woIndexInEnemies > -1) {
                                        enemies.splice(woIndexInEnemies, 1);
                                    }
                                }
                            }
                        } else { // Projectile hit a non-enemy world object
                             holeNormal = projectile.userData.velocity.clone().normalize().negate(); // Calculate normal for non-enemy hits
                             // console.log("Projectile hit non-enemy:", wo.name);
                        }
                        break; // Projectile is consumed

                    }
                }
            }
        }
        // If projectile needs removal for any reason
        if (projectileNeedsRemoval) {
            scene.remove(projectile);
            projectiles.splice(i, 1); // Remove from projectiles array (safe due to backward i loop)

            // Consistently remove projectile from worldObjects
            const projectileIndexInWorldObjects = worldObjects.indexOf(projectile);
            if (projectileIndexInWorldObjects > -1) {
                worldObjects.splice(projectileIndexInWorldObjects, 1);
            }
            if (createHoleAt && holeNormal) {
                // createBulletHole(createHoleAt, holeNormal); // Re-enable if you want bullet holes on everything
            }
        }
    }
}


// --- Animation Loop ---
function animate() {
    if (isGameOver) return; // Stop animation loop if game is over

    requestAnimationFrame(animate);
    const deltaTime = clock.getDelta();

    if (controls.isLocked) {
        updatePlayer(deltaTime);
        updateElevators(deltaTime);
        updateEnemies(deltaTime);
        updateProjectiles(deltaTime);
        updateGarageDoors(deltaTime);
        updateUI();
        updateLODSystem();
        animateActiveEscalatorSteps(deltaTime, escalatorSteps, escalatorStepsB, escalatorStarts, escalatorStartsB, escalatorEnds, escalatorEndsB, SETTINGS, {
            escalatorMaterial: window.EscalatorMaterial,
            escalatorEmbarkMaterial: window.EscalatorEmbarkMaterial,
            escalatorEmbarkMaterialB: window.EscalatorEmbarkMaterialB // Pass B-Wing material
        });

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

        // --- FPS Counter ---
        if (!window._fpsTimes) window._fpsTimes = [];
        const now = performance.now();
        window._fpsTimes.push(now);
        // Only keep the last 1 second of frame times
        while (window._fpsTimes.length > 2 && (now - window._fpsTimes[0]) > 1000) {
            window._fpsTimes.shift();
        }
        const fps = (window._fpsTimes.length - 1) / ((window._fpsTimes[window._fpsTimes.length - 1] - window._fpsTimes[0]) / 1000);
        const fpsText = `FPS: ${fps.toFixed(1)}`;

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
        const playerCoordsElem = document.getElementById('playerCoords');
        if (playerCoordsElem) {
            playerCoordsElem.innerText += ` | ${fpsText}`;
        }
        // --- End Debug Overlay Update ---

        // Add this line to update the FPS counter in a dedicated element
        const fpsElem = document.getElementById('fpsCounter');
        if (fpsElem) {
            fpsElem.innerText = fpsText;
        }
        
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

            // Check if the player is over "Escalator Up..." or "Escalator Down..."
            if (objName.includes("Escalator Up Start")) {
                const floorIndex = parseInt(objName.match(/\d+/)[0]); // Extract floor index
                escalatorSteps.up[floorIndex].forEach(step => {
                    step.material = window.EscalatorEmbarkMaterial; // Change material
                });
                escalatorStepsB.up[floorIndex].forEach(step => {
                    step.material = window.EscalatorEmbarkMaterialB; // Change material
                });
            } else if (objName.includes("Escalator Down Start")) {
                const floorIndex = parseInt(objName.match(/\d+/)[0]); // Extract floor index
                escalatorSteps.down[floorIndex].forEach(step => {
                    step.material = window.EscalatorEmbarkMaterial; // Change material
                });
                escalatorStepsB.down[floorIndex].forEach(step => {
                    step.material = window.EscalatorEmbarkMaterialB; // Change material
                });
            }

            // Reset step materials if above "Left Escalator Down End...", "Right Escalator Up End...", or any floor object
            if (
                objName.includes("Escalator Down End") || 
                objName.includes("Escalator Up End") || 
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
// Helper function to parse roomId (e.g., "R_F0_D0", "B_L_F1_D2")
function parseRoomId(roomId) {
    const parts = roomId.split('_');
    let isBWing = false;
    let side, floorStr, doorStr;

    if (parts[0] === 'B') {
        isBWing = true;
        side = parts[1]; // R or L
        floorStr = parts[2]; // F<number>
        doorStr = parts[3]; // D<number>
    } else {
        side = parts[0]; // R or L
        floorStr = parts[1]; // F<number>
        doorStr = parts[2]; // D<number>
    }

    const floorIndex = parseInt(floorStr.substring(1));
    const doorIndex = parseInt(doorStr.substring(1));

    return { isBWing, side, floorIndex, doorIndex };
}

// Helper function to check if player is inside a given room
function isPlayerInRoom(playerWorldPos, roomData) {
    if (!roomData || !roomData.id || !controls.isLocked) return false;

    const { isBWing, side, floorIndex, doorIndex } = parseRoomId(roomData.id);

    const floorY = floorIndex * SETTINGS.floorHeight;
    const totalCorridorLength = SETTINGS.doorsPerSide * SETTINGS.corridorSegmentLength;

    let segmentCenterZ;
    if (isBWing) {
        segmentCenterZ = ((doorIndex + 0.5) * SETTINGS.corridorSegmentLength) - 16 - totalCorridorLength;
    } else {
        segmentCenterZ = (doorIndex + 0.5) * SETTINGS.corridorSegmentLength;
    }

    const roomXCenter = (side === 'R') ? -SETTINGS.roomSize / 2 : SETTINGS.corridorWidth + SETTINGS.roomSize / 2;

    const roomMinX = roomXCenter - SETTINGS.roomSize / 2;
    const roomMaxX = roomXCenter + SETTINGS.roomSize / 2;
    const roomMinZ = segmentCenterZ - SETTINGS.corridorSegmentLength / 2;
    const roomMaxZ = segmentCenterZ + SETTINGS.corridorSegmentLength / 2;

    if (playerWorldPos.x < roomMinX || playerWorldPos.x > roomMaxX || playerWorldPos.z < roomMinZ || playerWorldPos.z > roomMaxZ) {
        return false;
    }
    const playerFeetY = playerWorldPos.y - playerHeight; // playerHeight is camera offset
    if (playerFeetY < floorY - 0.1 || playerFeetY > floorY + SETTINGS.wallHeight + 0.1) { // Added small tolerance
        return false;
    }
    return true;
}

function updateSingleRoomVisibility(roomData) {
    if (!roomData || !roomData.contentsGroup || !roomData.lamp) return;

    const playerWorldPos = controls.getObject().position;
    const playerIsInThisRoom = isPlayerInRoom(playerWorldPos, roomData);

    const shouldBeVisible = roomData.visibleByDoor || roomData.visibleByWindow || playerIsInThisRoom;

    if (roomData.contentsGroup.visible !== shouldBeVisible) {
        roomData.contentsGroup.visible = shouldBeVisible;
        // console.log(`Room ${roomData.id} contents visibility: ${shouldBeVisible} (Door: ${roomData.visibleByDoor}, Window: ${roomData.visibleByWindow}, Inside: ${playerIsInThisRoom})`);
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

//const enemyGeometry = new THREE.BoxGeometry(1, 2, 1); // Example geometry for an enemy
//const enemyMaterial = new THREE.MeshStandardMaterial({ color: 0xff0000 }); // Example material for an enemy

//const enemy = new THREE.Mesh(enemyGeometry, enemyMaterial);
//enemy.position.set(x, y, z); // Set the enemy's position
//scene.add(enemy);
//enemies.push(enemy); // Add the enemy to the array
