import * as THREE from 'three';
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';
//import { rotate } from 'three/tsl';


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

let elevator, elevatorTargetY = 0, isElevatorMoving = false, elevatorDirection = 0;
let currentFloorIndex = 0;

const escalatorLength = SETTINGS.escalatorLength; // Use the defined escalator length
const escalatorWidth = SETTINGS.escalatorWidth; 
const roomSize = SETTINGS.roomSize; // Use the defined room size
const elevatorSize = SETTINGS.elevatorSize; // Use the defined elevator size

const worldObjects = []; // For basic collision detection
const doors = []; // To store door data for interaction
let lights = []; // Move lights array to global scope

let playerLives = 3; // Player starts with 3 lives
let playerScore = 0; // Initial score
let isGameOver = false; // Game over state
let isPlayerRespawning = false; // Tracks if the player is waiting to respawn

const animatedGarageDoors = []; // To store garage doors that need animation
const enemies = []; // Array to store enemy objects

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

// --- Initialization ---
function init() {
    clock = new THREE.Clock();
    scene = new THREE.Scene();

    // Set background to a dark blue for a moonlit night
    scene.background = new THREE.Color(0x010309); // Dark blue
    scene.fog = new THREE.Fog(0x010309, 10, 100); // Fog to match the night theme

    // Camera
    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.set(SETTINGS.corridorWidth / 2, playerHeight, 5);

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

// --- World Generation ---
function generateWorld() {
    const totalCorridorLength = SETTINGS.doorsPerSide * SETTINGS.corridorSegmentLength;

    const floorMaterial = new THREE.MeshStandardMaterial({ color: 0xaaaaaa,  side: THREE.DoubleSide });
    const wallMaterial = new THREE.MeshStandardMaterial({ color: 0xaaaaaa });
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
    const dialMaterial = new THREE.MeshStandardMaterial({ color: 0x999999, metalness: 0.9, roughness: 0.2 }); // Dark metallic dial
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
        envMapIntensity: 0.5, // Optional: for subtle reflections if you have an env map
        premultipliedAlpha: true
    });
    window.blackDoorMaterial = blackDoorMaterial;

    // Walls & Doors
    const wallDepth = 0.1;
    const doorOffset = (SETTINGS.corridorSegmentLength - SETTINGS.doorWidth) / 2;
    const escalatorLength = SETTINGS.escalatorLength; // Use the defined escalator length

    // --- Define Elevator Shaft Hole Dimensions ---
    const shaftHoleMinX = 0;
    const shaftHoleMaxX = SETTINGS.corridorWidth;
    const shaftHoleMinZ = -SETTINGS.elevatorSize;
    const shaftHoleMaxZ = 0;

    // --- Lawn, Perimeter Wall, and Gate ---
    const lawnBorderWidth = 20.0; // How much the lawn extends beyond the building
    const buildingBaseY = -0.05; // Top surface of the lawn, consistent with old ground

    // Approximate building footprint for lawn calculation
    const buildingMinX = -SETTINGS.roomSize;
    const buildingMaxX = SETTINGS.corridorWidth + SETTINGS.roomSize;
    const buildingMinZ_footprint = -SETTINGS.elevatorSize; // Elevator shaft at near end
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
    if (shaftHoleMinX > lawnMinX) {
        const panelA_width = shaftHoleMinX - lawnMinX;
        const panelA_geo = new THREE.BoxGeometry(panelA_width, lawnThickness, lawnDepth);
        const panelA = new THREE.Mesh(panelA_geo, lawnMaterial);
        panelA.position.set((lawnMinX + shaftHoleMinX) / 2, buildingBaseY - lawnThickness / 2, lawnCenterZ);
        panelA.name = "LawnPanel_A"; lawnPanels.push(panelA);
    }
    // Panel B (East of shaft)
    if (shaftHoleMaxX < lawnMaxX) {
        const panelB_width = lawnMaxX - shaftHoleMaxX;
        const panelB_geo = new THREE.BoxGeometry(panelB_width, lawnThickness, lawnDepth);
        const panelB = new THREE.Mesh(panelB_geo, lawnMaterial);
        panelB.position.set((shaftHoleMaxX + lawnMaxX) / 2, buildingBaseY - lawnThickness / 2, lawnCenterZ);
        panelB.name = "LawnPanel_B"; lawnPanels.push(panelB);
    }
    // Panel C (North of shaft, within shaft's X-span)
    if (shaftHoleMaxZ < lawnMaxZ) {
        const panelC_depth = lawnMaxZ - shaftHoleMaxZ;
        const panelC_geo = new THREE.BoxGeometry(shaftHoleMaxX - shaftHoleMinX, lawnThickness, panelC_depth);
        const panelC = new THREE.Mesh(panelC_geo, lawnMaterial);
        panelC.position.set((shaftHoleMinX + shaftHoleMaxX) / 2, buildingBaseY - lawnThickness / 2, (shaftHoleMaxZ + lawnMaxZ) / 2);
        panelC.name = "LawnPanel_C"; lawnPanels.push(panelC);
    }
    // Panel D (South of shaft, within shaft's X-span)
    if (shaftHoleMinZ > lawnMinZ) {
        const panelD_depth = shaftHoleMinZ - lawnMinZ;
        const panelD_geo = new THREE.BoxGeometry(shaftHoleMaxX - shaftHoleMinX, lawnThickness, panelD_depth);
        const panelD = new THREE.Mesh(panelD_geo, lawnMaterial);
        panelD.position.set((shaftHoleMinX + shaftHoleMaxX) / 2, buildingBaseY - lawnThickness / 2, (lawnMinZ + shaftHoleMinZ) / 2);
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
    const roofGeo = new THREE.BoxGeometry(SETTINGS.corridorWidth + (2 * roomSize), floorDepth, totalCorridorLength + escalatorLength + 8);
    const roof = new THREE.Mesh(roofGeo, floorMaterial);
    roof.name = `Roof`;
    //roof.rotation.x = -Math.PI / 2; // only when using plane geometry - disable when using box geometry
    roof.position.set(SETTINGS.corridorWidth / 2, (SETTINGS.numFloors) * SETTINGS.floorHeight - floorDepth/2, 4 + ((totalCorridorLength + escalatorLength) / 2));
    roof.receiveShadow = true;
    scene.add(roof);
    worldObjects.push(roof);

    // Right Wall next to elevator shaft on Roof (Negative Z direction)
    //const segmentZ = -SETTINGS.corridorWidth / 2 + doorOffset / 2;
    const RoofWallRGeo = new THREE.BoxGeometry(wallDepth, SETTINGS.floorHeight, elevatorSize); // Wall depth and height
    //const RoofWallRMaterial = new THREE.MeshStandardMaterial({ color: 0xcccccc });
    const RoofWallR = new THREE.Mesh(RoofWallRGeo, wallMaterial);
    RoofWallR.position.set(0, (SETTINGS.numFloors) * SETTINGS.floorHeight + SETTINGS.wallHeight / 2, -elevatorSize / 2); // Elevator shaft wall
    RoofWallR.name = `Elevator Right Wall on Roof`;
    RoofWallR.castShadow = true;
    RoofWallR.receiveShadow = true;
    scene.add(RoofWallR);
    worldObjects.push(RoofWallR);

    // left Wall next to elevator shaft on Roof (Negative Z direction)
    //const segmentZ = -SETTINGS.corridorWidth / 2 + doorOffset / 2;
    const RoofWallLGeo = new THREE.BoxGeometry(wallDepth, SETTINGS.floorHeight, elevatorSize); // Wall depth and height
    //const RoofWallMaterial = new THREE.MeshStandardMaterial({ color: 0xcccccc });
    const RoofWallL = new THREE.Mesh(RoofWallLGeo, wallMaterial);
    RoofWallL.position.set(SETTINGS.corridorWidth, (SETTINGS.numFloors) * SETTINGS.floorHeight + SETTINGS.wallHeight / 2, -elevatorSize / 2); // Elevator shaft wall
    RoofWallL.name = `Elevator Left Wall on Roof`;
    RoofWallL.castShadow = true;
    RoofWallL.receiveShadow = true;
    scene.add(RoofWallL);
    worldObjects.push(RoofWallL);

        // wall behind elevator
    const roofEndWallGeo = new THREE.BoxGeometry(SETTINGS.corridorWidth, SETTINGS.floorHeight, wallDepth);
    const roofEndWallNear = new THREE.Mesh(roofEndWallGeo, wallMaterial);
    roofEndWallNear.position.set(SETTINGS.corridorWidth / 2, (SETTINGS.numFloors) * SETTINGS.floorHeight + SETTINGS.wallHeight / 2, -SETTINGS.elevatorSize); // Near end (Z=0)
    roofEndWallNear.name = `Elevator Back Wall on Roof`;
    roofEndWallNear.castShadow = true;
    roofEndWallNear.receiveShadow = true;
    scene.add(roofEndWallNear); // elevator shaft is here
    worldObjects.push(roofEndWallNear);


    // Roof of elevator shaft on Roof
    //const segmentZ = -SETTINGS.corridorWidth / 2 + doorOffset / 2;
    const topRoofGeo = new THREE.BoxGeometry(SETTINGS.corridorWidth, floorDepth, elevatorSize); // Roof dimensions
    //const RoofWallMaterial = new THREE.MeshStandardMaterial({ color: 0xcccccc });
    const topRoof = new THREE.Mesh(topRoofGeo, floorMaterial);
    topRoof.name = `Top Roof over Elevator`;
    topRoof.position.set(SETTINGS.corridorWidth/2, (1 + SETTINGS.numFloors) * SETTINGS.floorHeight, -elevatorSize / 2); // Elevator shaft wall
    topRoof.castShadow = true;
    topRoof.receiveShadow = true;
    // --- Add this line to enable collision ---
    topRoof.geometry.computeBoundingBox();
    scene.add(topRoof);
    worldObjects.push(topRoof);

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
    const topRoofSurfaceY = topRoof.position.y + floorDepth / 2;
    floodlightAssembly.position.set(
        topRoof.position.x, // Centered on X
        topRoofSurfaceY + 0.2, // Housing height/2 = 0.4/2 = 0.2
        topRoof.position.z + (elevatorSize / 2) - 0.3 // Near the edge facing the main roof
    );
    scene.add(floodlightAssembly);

    const rooftopSpotLight = new THREE.SpotLight(0xffffff, 20, 200, Math.PI / 3, 1, 1.5); // color, intensity, distance, angle, penumbra, decay
    rooftopSpotLight.position.copy(floodlightAssembly.position);
    rooftopSpotLight.position.z += 0.2; // Emitter slightly in front of housing

    // Target the center of the main roof area
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

    const roofActualWidth = SETTINGS.corridorWidth + (2 * SETTINGS.roomSize);
    const roofActualDepth = totalCorridorLength + SETTINGS.escalatorLength + 8;
    const roofActualCenterX = SETTINGS.corridorWidth / 2;
    const roofActualCenterZ = 4 + ((totalCorridorLength + SETTINGS.escalatorLength) / 2);
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
    const nearWallLeftLength = SETTINGS.roomSize;
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
    scene.add(nearWallRight); worldObjects.push(nearWallRight);

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
    const basementMinX = -SETTINGS.roomSize;
    const basementMaxX = SETTINGS.corridorWidth + SETTINGS.roomSize;
    const basementWidth = basementMaxX - basementMinX;
    const basementCenterX = (basementMinX + basementMaxX) / 2;

    const basementMinZ = -SETTINGS.elevatorSize; // Front of building at elevator
    const basementMaxZ = totalCorridorLength + 4 + SETTINGS.escalatorLength + 4; // Back of building at end of escalator area
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
            const floorPanelY = floorY - floorDepth / 2;
            const ceilingPanelY = floorY + SETTINGS.wallHeight - (floorDepth / 4); // Top of ceiling at wallHeight

            // Panel A (West of shaft)
            if (shaftHoleMinX > basementMinX) {
                const panelA_width = shaftHoleMinX - basementMinX;
                const panelA_floor_geo = new THREE.BoxGeometry(panelA_width, floorDepth, basementDepth);
                const panelA_floor = new THREE.Mesh(panelA_floor_geo, concreteMaterial);
                panelA_floor.position.set((basementMinX + shaftHoleMinX) / 2, floorPanelY, basementCenterZ);
                panelA_floor.name = `BasementFloorPanel_A_F${i}`; basementFloorPanels.push(panelA_floor);

                const panelA_ceil_geo = new THREE.BoxGeometry(panelA_width, floorDepth / 2, basementDepth);
                const panelA_ceil = new THREE.Mesh(panelA_ceil_geo, concreteMaterial);
                panelA_ceil.position.set((basementMinX + shaftHoleMinX) / 2, ceilingPanelY, basementCenterZ);
                panelA_ceil.name = `BasementCeilingPanel_A_F${i}`; basementCeilingPanels.push(panelA_ceil);
            }
            // Panel B (East of shaft)
            if (shaftHoleMaxX < basementMaxX) {
                const panelB_width = basementMaxX - shaftHoleMaxX;
                const panelB_floor_geo = new THREE.BoxGeometry(panelB_width, floorDepth, basementDepth);
                const panelB_floor = new THREE.Mesh(panelB_floor_geo, concreteMaterial);
                panelB_floor.position.set((shaftHoleMaxX + basementMaxX) / 2, floorPanelY, basementCenterZ);
                panelB_floor.name = `BasementFloorPanel_B_F${i}`; basementFloorPanels.push(panelB_floor);

                const panelB_ceil_geo = new THREE.BoxGeometry(panelB_width, floorDepth / 2, basementDepth);
                const panelB_ceil = new THREE.Mesh(panelB_ceil_geo, concreteMaterial);
                panelB_ceil.position.set((shaftHoleMaxX + basementMaxX) / 2, ceilingPanelY, basementCenterZ);
                panelB_ceil.name = `BasementCeilingPanel_B_F${i}`; basementCeilingPanels.push(panelB_ceil);
            }
            // Panel C (North of shaft, within shaft's X-span)
            if (shaftHoleMaxZ < basementMaxZ) {
                const panelC_depth = basementMaxZ - shaftHoleMaxZ;
                const panelC_floor_geo = new THREE.BoxGeometry(shaftHoleMaxX - shaftHoleMinX, floorDepth, panelC_depth);
                const panelC_floor = new THREE.Mesh(panelC_floor_geo, concreteMaterial);
                panelC_floor.position.set((shaftHoleMinX + shaftHoleMaxX) / 2, floorPanelY, (shaftHoleMaxZ + basementMaxZ) / 2);
                panelC_floor.name = `BasementFloorPanel_C_F${i}`; basementFloorPanels.push(panelC_floor);

                const panelC_ceil_geo = new THREE.BoxGeometry(shaftHoleMaxX - shaftHoleMinX, floorDepth / 2, panelC_depth);
                const panelC_ceil = new THREE.Mesh(panelC_ceil_geo, concreteMaterial);
                panelC_ceil.position.set((shaftHoleMinX + shaftHoleMaxX) / 2, ceilingPanelY, (shaftHoleMaxZ + basementMaxZ) / 2);
                panelC_ceil.name = `BasementCeilingPanel_C_F${i}`; basementCeilingPanels.push(panelC_ceil);
            }
            // Panel D (South of shaft, within shaft's X-span)
            if (shaftHoleMinZ > basementMinZ) {
                const panelD_depth = shaftHoleMinZ - basementMinZ;
                const panelD_floor_geo = new THREE.BoxGeometry(shaftHoleMaxX - shaftHoleMinX, floorDepth, panelD_depth);
                const panelD_floor = new THREE.Mesh(panelD_floor_geo, concreteMaterial);
                panelD_floor.position.set((shaftHoleMinX + shaftHoleMaxX) / 2, floorPanelY, (basementMinZ + shaftHoleMinZ) / 2);
                panelD_floor.name = `BasementFloorPanel_D_F${i}`; basementFloorPanels.push(panelD_floor);

                const panelD_ceil_geo = new THREE.BoxGeometry(shaftHoleMaxX - shaftHoleMinX, floorDepth / 2, panelD_depth);
                const panelD_ceil = new THREE.Mesh(panelD_ceil_geo, concreteMaterial);
                panelD_ceil.position.set((shaftHoleMinX + shaftHoleMaxX) / 2, ceilingPanelY, (basementMinZ + shaftHoleMinZ) / 2);
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
            if (frontWallLeftWidth > 0.01) {
                const wallFrontLeftGeo = new THREE.BoxGeometry(frontWallLeftWidth, SETTINGS.wallHeight, wallDepth);
                const wallFrontLeft = new THREE.Mesh(wallFrontLeftGeo, basementWallMaterial);
                wallFrontLeft.position.set(basementMinX + frontWallLeftWidth / 2, floorY + SETTINGS.wallHeight / 2, basementMinZ + wallDepth / 2);
                wallFrontLeft.name = `BasementWall_Front_Right_F${i}`; // Adjusted: MinX side is player's right
                wallFrontLeft.castShadow = true; wallFrontLeft.receiveShadow = true;
                scene.add(wallFrontLeft); worldObjects.push(wallFrontLeft);
            }
            // Part 2: Right of elevator shaft (X from SETTINGS.corridorWidth to basementMaxX)
            const frontWallRightWidth = basementMaxX - SETTINGS.corridorWidth; // Width of this segment
            if (frontWallRightWidth > 0.01) {
                const wallFrontRightGeo = new THREE.BoxGeometry(frontWallRightWidth, SETTINGS.wallHeight, wallDepth);
                const wallFrontRight = new THREE.Mesh(wallFrontRightGeo, basementWallMaterial);
                wallFrontRight.position.set(SETTINGS.corridorWidth + frontWallRightWidth / 2, floorY + SETTINGS.wallHeight / 2, basementMinZ + wallDepth / 2);
                wallFrontRight.name = `BasementWall_Front_Left_F${i}`; // Adjusted: MaxX side is player's left
                wallFrontRight.castShadow = true; wallFrontRight.receiveShadow = true;
                scene.add(wallFrontRight); worldObjects.push(wallFrontRight);
            }
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

            const elevatorShaftZone = { minX: -0.1, maxX: SETTINGS.corridorWidth + 0.1, minZ: -SETTINGS.elevatorSize -0.1, maxZ: 0.1 };
            /* const escalatorLandingZone = (i === -SETTINGS.numBasementFloors) ? { // Only for the first basement floor if escalators lead there
                minX: -SETTINGS.escalatorWidth -1,
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

            // Room Partition Walls
            for (let k = 0; k <= SETTINGS.doorsPerSide; k++) {
                const zPosBoundary = k * SETTINGS.corridorSegmentLength;
                const partRGeo = new THREE.BoxGeometry(SETTINGS.roomSize, SETTINGS.wallHeight, wallDepth);
                const partR = new THREE.Mesh(partRGeo, wallMaterial);
                partR.position.set(-SETTINGS.roomSize / 2, floorY + SETTINGS.wallHeight / 2, zPosBoundary);
                partR.castShadow = true; partR.receiveShadow = true; scene.add(partR); worldObjects.push(partR);
                partR.name = `RoomPartition_R_F${i}_Z${k}`;

                const partLGeo = new THREE.BoxGeometry(SETTINGS.roomSize, SETTINGS.wallHeight, wallDepth);
                const partL = new THREE.Mesh(partLGeo, wallMaterial);
                partL.position.set(SETTINGS.corridorWidth + SETTINGS.roomSize / 2, floorY + SETTINGS.wallHeight / 2, zPosBoundary);
                partL.castShadow = true; partL.receiveShadow = true; scene.add(partL); worldObjects.push(partL);
                partL.name = `RoomPartition_L_F${i}_Z${k}`;
            }

            // Loop for individual rooms
            for (let j = 0; j < SETTINGS.doorsPerSide; j++) {
                const segmentCenterZ = (j + 0.5) * SETTINGS.corridorSegmentLength;
                const segmentStartZ = j * SETTINGS.corridorSegmentLength;
                const deskWidth = 1.5, deskHeight = 0.75, deskDepth = 0.8;
                const cabinetWidth = 0.5, cabinetHeight = 1.5, cabinetDepth = 0.6;
                const safeWidth = 0.8, safeHeight = 0.8, safeDepth = 0.8;
                const dialRadius = 0.08, dialLength = 0.1;
                const defaultSafeUserData = () => ({ isCracked: false, dialPresses: 0, dialPressesRequired: Math.floor(Math.random() * 9) + 2, pointsAwarded: false });

                // --- Right Side Room ---
                const roomRXCenter = -SETTINGS.roomSize / 2;
                const isRightRoomRedDoor = (j === redDoorIndex);
                const rFloorGeo = new THREE.BoxGeometry(SETTINGS.roomSize, floorDepth, SETTINGS.corridorSegmentLength);
                const rFloor = new THREE.Mesh(rFloorGeo, floorMaterial);
                rFloor.position.set(roomRXCenter, floorY - floorDepth / 2, segmentCenterZ);
                rFloor.receiveShadow = true; scene.add(rFloor); worldObjects.push(rFloor);
                rFloor.name = `RoomFloor_R_F${i}_D${j}`;
                createOuterWallWithWindow(-SETTINGS.roomSize + wallDepth / 2, floorY + SETTINGS.wallHeight / 2, segmentCenterZ, SETTINGS.corridorSegmentLength, SETTINGS.wallHeight, wallDepth, wallMaterial, glassMaterial, `R_F${i}_D${j}`);
                const deskRGeo = new THREE.BoxGeometry(deskDepth, deskHeight, deskWidth);
                const deskR = new THREE.Mesh(deskRGeo, deskMaterial);
                deskR.rotateY(Math.PI / 2);
                deskR.position.set(-(SETTINGS.roomSize/2), floorY + deskHeight / 2, segmentCenterZ +1.3);
                deskR.castShadow = true; deskR.receiveShadow = true; scene.add(deskR); worldObjects.push(deskR);
                deskR.name = `Desk_R_F${i}_D${j}`;
                const cabinetRGeo = new THREE.BoxGeometry(cabinetDepth, cabinetHeight, cabinetWidth);
                const cabinetR = new THREE.Mesh(cabinetRGeo, cabinetMaterial);
                cabinetR.position.set(-SETTINGS.roomSize + cabinetDepth / 2, floorY + cabinetHeight / 2, segmentStartZ + cabinetWidth / 2 + 0.1);
                cabinetR.castShadow = true; cabinetR.receiveShadow = true; scene.add(cabinetR); worldObjects.push(cabinetR);
                cabinetR.name = `Cabinet_R_F${i}_D${j}`;
                // Chair for Right Room
                const chairSeatWidth = 0.5, chairSeatDepth = 0.65, chairSeatHeight = 0.5;
                const chairBackrestHeight = 0.8, chairBackrestThickness = 0.15;
                const backWallZ_R_Chair = segmentCenterZ + SETTINGS.corridorSegmentLength / 2;
                const chairZ_R = 0.1+(deskR.position.z + backWallZ_R_Chair) / 2;
                const chairX_R = -(SETTINGS.roomSize/2);
                const chairY_R = floorY + chairSeatHeight / 2;
                const chairSeat_R = new THREE.Mesh(new THREE.BoxGeometry(chairSeatWidth, chairSeatHeight, chairSeatDepth), deskMaterial);
                chairSeat_R.position.set(chairX_R, chairY_R, chairZ_R); scene.add(chairSeat_R); worldObjects.push(chairSeat_R);
                const backrest_R = new THREE.Mesh(new THREE.BoxGeometry(chairSeatWidth, chairBackrestHeight, chairBackrestThickness), deskMaterial);
                backrest_R.position.set(chairX_R, chairY_R + chairBackrestHeight / 2, chairZ_R + chairSeatDepth / 2 - chairBackrestThickness / 2);
                scene.add(backrest_R); worldObjects.push(backrest_R);
                if (isRightRoomRedDoor) {
                    const safeRGeo = new THREE.BoxGeometry(safeDepth, safeHeight, safeWidth);
                    const safeR = new THREE.Mesh(safeRGeo, safeMaterial);
                    safeR.position.set(-SETTINGS.roomSize + safeDepth / 2, floorY + safeHeight / 2, segmentStartZ + SETTINGS.corridorSegmentLength - safeWidth / 2 - 0.1);
                    safeR.castShadow = true; safeR.receiveShadow = true; safeR.name = `Safe_R_F${i}_D${j}`;
                    safeR.userData = defaultSafeUserData(); scene.add(safeR); worldObjects.push(safeR);
                    const dialRGeo = new THREE.ConeGeometry(dialRadius, dialLength, 16);
                    const dialR = new THREE.Mesh(dialRGeo, dialMaterial);
                    dialR.position.set(safeDepth / 2, 0, 0); dialR.rotation.z = -Math.PI / 2;
                    dialR.userData.isSafeDial = true; dialR.name = `Dial_Safe_R_F${i}_D${j}`; safeR.add(dialR);
                }
                createRoomLamp(roomRXCenter, floorY + SETTINGS.wallHeight - 0.5, segmentCenterZ, i, `R_F${i}_D${j}`, lightBulbMaterial);

                // --- Left Side Room ---
                const roomLXCenter = SETTINGS.corridorWidth + SETTINGS.roomSize / 2;
                const isLeftRoomRedDoor = ((SETTINGS.doorsPerSide + j) === redDoorIndex);
                const lFloorGeo = new THREE.BoxGeometry(SETTINGS.roomSize, floorDepth, SETTINGS.corridorSegmentLength);
                const lFloor = new THREE.Mesh(lFloorGeo, floorMaterial);
                lFloor.position.set(roomLXCenter, floorY - floorDepth / 2, segmentCenterZ);
                lFloor.receiveShadow = true; scene.add(lFloor); worldObjects.push(lFloor);
                lFloor.name = `RoomFloor_L_F${i}_D${j}`;
                createOuterWallWithWindow(SETTINGS.corridorWidth + SETTINGS.roomSize - wallDepth / 2, floorY + SETTINGS.wallHeight / 2, segmentCenterZ, SETTINGS.corridorSegmentLength, SETTINGS.wallHeight, wallDepth, wallMaterial, glassMaterial, `L_F${i}_D${j}`);
                const deskLGeo = new THREE.BoxGeometry(deskDepth, deskHeight, deskWidth);
                const deskL = new THREE.Mesh(deskLGeo, deskMaterial);
                deskL.rotateY(Math.PI / 2);
                deskL.position.set(SETTINGS.corridorWidth + (SETTINGS.roomSize/2), floorY + deskHeight / 2, segmentCenterZ +1.3);
                deskL.castShadow = true; deskL.receiveShadow = true; scene.add(deskL); worldObjects.push(deskL);
                deskL.name = `Desk_L_F${i}_D${j}`;
                const cabinetLGeo = new THREE.BoxGeometry(cabinetDepth, cabinetHeight, cabinetWidth);
                const cabinetL = new THREE.Mesh(cabinetLGeo, cabinetMaterial);
                cabinetL.position.set(SETTINGS.corridorWidth + SETTINGS.roomSize - cabinetDepth / 2, floorY + cabinetHeight / 2, segmentStartZ + cabinetWidth / 2 + 0.1);
                cabinetL.castShadow = true; cabinetL.receiveShadow = true; scene.add(cabinetL); worldObjects.push(cabinetL);
                cabinetL.name = `Cabinet_L_F${i}_D${j}`;
                // Chair for Left Room
                const backWallZ_L_Chair = segmentCenterZ + SETTINGS.corridorSegmentLength / 2;
                const chairZ_L = 0.15 + (deskL.position.z + backWallZ_L_Chair) / 2;
                const chairX_L = SETTINGS.corridorWidth + (SETTINGS.roomSize/2);
                const chairY_L = floorY + chairSeatHeight / 2;
                const chairSeat_L = new THREE.Mesh(new THREE.BoxGeometry(chairSeatWidth, chairSeatHeight, chairSeatDepth), deskMaterial);
                chairSeat_L.position.set(chairX_L, chairY_L, chairZ_L); scene.add(chairSeat_L); worldObjects.push(chairSeat_L);
                const backrest_L = new THREE.Mesh(new THREE.BoxGeometry(chairSeatWidth, chairBackrestHeight, chairBackrestThickness), deskMaterial);
                backrest_L.position.set(chairX_L, chairY_L + chairBackrestHeight / 2, chairZ_L + chairSeatDepth / 2 - chairBackrestThickness / 2);
                scene.add(backrest_L); worldObjects.push(backrest_L);
                if (isLeftRoomRedDoor) {
                    const safeLGeo = new THREE.BoxGeometry(safeDepth, safeHeight, safeWidth);
                    const safeL = new THREE.Mesh(safeLGeo, safeMaterial);
                    safeL.position.set(SETTINGS.corridorWidth + SETTINGS.roomSize - safeDepth / 2, floorY + safeHeight / 2, segmentStartZ + SETTINGS.corridorSegmentLength - safeWidth / 2 - 0.1);
                    safeL.castShadow = true; safeL.receiveShadow = true; safeL.name = `Safe_L_F${i}_D${j}`;
                    safeL.userData = defaultSafeUserData(); scene.add(safeL); worldObjects.push(safeL);
                    const dialLGeo = new THREE.ConeGeometry(dialRadius, dialLength, 16);
                    const dialL = new THREE.Mesh(dialLGeo, dialMaterial);
                    dialL.position.set(-safeDepth / 2, 0, 0); dialL.rotation.z = Math.PI / 2;
                    dialL.userData.isSafeDial = true; dialL.name = `Dial_Safe_L_F${i}_D${j}`; safeL.add(dialL);
                }
                createRoomLamp(roomLXCenter, floorY + SETTINGS.wallHeight - 0.5, segmentCenterZ, i, `L_F${i}_D${j}`, lightBulbMaterial);
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
                door.position.set(0, floorY + SETTINGS.doorHeight/2, segmentZ - SETTINGS.doorWidth/2);
                door.castShadow = true; door.userData = { type: 'door', floor: i, isRed: isRed, locked: (Math.random() < 0.3), isOpen: false };
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
                door.position.set(LeftWallX, floorY + SETTINGS.doorHeight/2, segmentZ - SETTINGS.doorWidth/2);
                door.castShadow = true; door.userData = { type: 'door', floor: i, isRed: isRed, locked: (Math.random() < 0.3), isOpen: false };
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
                // ... (existing corridor light creation logic)
                const lightGeo = new THREE.ConeGeometry(0.3, 0.2, 16);
                const chainGeo = new THREE.BoxGeometry(0.05, 0.5, 0.05);
                const chainMaterial = new THREE.MeshStandardMaterial({ color: 0x111111, emissive: 0x000000, emissiveIntensity: 0 });
                const chainMesh = new THREE.Mesh(chainGeo, chainMaterial);
                chainMesh.position.y = 0.15;
                const lampshadeMaterial = new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0x000000, emissiveIntensity: 0.0 });
                const lightMaterial = new THREE.MeshStandardMaterial({ color: 0xffaa77, emissive: 0xffaa77, emissiveIntensity: 1 });
                const bulbRadius = 0.08;
                const bulbGeometry = new THREE.SphereGeometry(bulbRadius, 16, 8);
                const bulbMesh = new THREE.Mesh(bulbGeometry, lightBulbMaterial); // Using global lightBulbMaterial
                bulbMesh.position.y = -0.3 + bulbRadius * 2;
                const light = new THREE.Mesh(lightGeo, lampshadeMaterial);
                const bottomLightGeo = new THREE.CircleGeometry(0.3, 16);
                const bottomLight = new THREE.Mesh(bottomLightGeo, lightMaterial);
                bottomLight.rotation.x = Math.PI / 2; bottomLight.position.y = -0.11;
                const lightGroup = new THREE.Group();
                lightGroup.add(light); lightGroup.add(bottomLight); lightGroup.add(bulbMesh); lightGroup.add(chainMesh);
                const lampName = `Lamp ${i + 1}${String(j + 1).padStart(2, '0')}`;
                lightGroup.name = lampName; light.name = `${lampName} Lampshade`;
                lightGroup.position.set(SETTINGS.corridorWidth / 2, floorY + SETTINGS.wallHeight - 0.5, segmentZ);
                lightGroup.castShadow = true; scene.add(lightGroup); lights.push(lightGroup);
                const pointLight = new THREE.PointLight(0xffffaa, 1, 5);
                pointLight.position.set(lightGroup.position.x, lightGroup.position.y - 0.3, lightGroup.position.z);
                scene.add(pointLight);
                lightGroup.userData = { pointLight, floorIndex: i, isDestroyed: false };
            }

            // Escalator Bridge Ceiling Lights
            const escLightPositions = [totalCorridorLength + 4 + (escalatorLength / 3), totalCorridorLength + 4 + (2 * escalatorLength / 3)];
            escLightPositions.forEach((zPos, idx) => {
                // ... (existing escalator bridge light creation logic)
                const lightGeo = new THREE.ConeGeometry(0.3, 0.2, 16);
                const chainGeo = new THREE.BoxGeometry(0.05, 0.5, 0.05);
                const chainMaterial = new THREE.MeshStandardMaterial({ color: 0x111111, emissive: 0x000000, emissiveIntensity: 0 });
                const chainMesh = new THREE.Mesh(chainGeo, chainMaterial); chainMesh.position.y = 0.15;
                const lampshadeMaterial = new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0x000000, emissiveIntensity: 0.0,});
                const lightMaterial = new THREE.MeshStandardMaterial({ color: 0xffaa77, emissive: 0xffaa77, emissiveIntensity: 1,});
                const bulbRadius = 0.08;
                const bulbGeometry = new THREE.SphereGeometry(bulbRadius, 16, 8);
                const bulbMesh = new THREE.Mesh(bulbGeometry, lightBulbMaterial); // Using global lightBulbMaterial
                bulbMesh.position.y = -0.3 + bulbRadius * 2;
                const light = new THREE.Mesh(lightGeo, lampshadeMaterial);
                const bottomLightGeo = new THREE.CircleGeometry(0.3, 16);
                const bottomLight = new THREE.Mesh(bottomLightGeo, lightMaterial);
                bottomLight.rotation.x = Math.PI / 2; bottomLight.position.y = -0.11;
                const lightGroup = new THREE.Group();
                lightGroup.add(light); lightGroup.add(bottomLight); lightGroup.add(bulbMesh); lightGroup.add(chainMesh);
                const lampName = `Escalator Lamp ${i + 1}-${idx + 1}`;
                lightGroup.name = lampName; light.name = `${lampName} Lampshade`;
                lightGroup.position.set(SETTINGS.corridorWidth / 2, floorY + SETTINGS.wallHeight - 0.5, zPos);
                lightGroup.castShadow = true; scene.add(lightGroup); lights.push(lightGroup);
                const pointLight = new THREE.PointLight(0xffffaa, 1, 5);
                pointLight.position.set(lightGroup.position.x, lightGroup.position.y - 0.3, lightGroup.position.z);
                scene.add(pointLight);
                lightGroup.userData = { pointLight, floorIndex: i, isDestroyed: false };
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
                // ... (existing escalator start light creation logic)
                const lightGeo = new THREE.ConeGeometry(0.3, 0.2, 16);
                const chainGeo = new THREE.BoxGeometry(0.05, 0.5, 0.05);
                const chainMaterial = new THREE.MeshStandardMaterial({ color: 0x111111, emissive: 0x000000, emissiveIntensity: 0 });
                const chainMesh = new THREE.Mesh(chainGeo, chainMaterial); chainMesh.position.y = 0.15;
                const lampshadeMaterial = new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0x000000, emissiveIntensity: 0.0,});
                const lightMaterial = new THREE.MeshStandardMaterial({ color: 0xffaa77, emissive: 0xffaa77, emissiveIntensity: 1,});
                const bulbRadius = 0.08;
                const bulbGeometry = new THREE.SphereGeometry(bulbRadius, 16, 8);
                const bulbMesh = new THREE.Mesh(bulbGeometry, lightBulbMaterial); // Using global lightBulbMaterial
                bulbMesh.position.y = -0.3 + bulbRadius * 2;
                const light = new THREE.Mesh(lightGeo, lampshadeMaterial);
                const bottomLightGeo = new THREE.CircleGeometry(0.3, 16);
                const bottomLight = new THREE.Mesh(bottomLightGeo, lightMaterial);
                bottomLight.rotation.x = Math.PI / 2; bottomLight.position.y = -0.11;
                const lightGroup = new THREE.Group();
                lightGroup.add(light); lightGroup.add(bottomLight); lightGroup.add(bulbMesh); lightGroup.add(chainMesh);
                const lampName = `Escalator Start Lamp ${i}-${idx + 1}`; // Use i directly for naming consistency
                lightGroup.name = lampName; light.name = `${lampName} Lampshade`;
                lightGroup.position.set(xPos, escLightY, escStartZ);
                lightGroup.castShadow = true; scene.add(lightGroup); lights.push(lightGroup);
                const pointLight = new THREE.PointLight(0xffffaa, 1, 5);
                pointLight.position.set(xPos, escLightY - 0.3, escStartZ); scene.add(pointLight);
                lightGroup.userData = { pointLight, floorIndex: i, isDestroyed: false };
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
                // ... (existing escalator end light creation logic)
                const lightGeo = new THREE.ConeGeometry(0.3, 0.2, 16);
                const chainGeo = new THREE.BoxGeometry(0.05, 0.5, 0.05);
                const chainMaterial = new THREE.MeshStandardMaterial({ color: 0x111111, emissive: 0x000000, emissiveIntensity: 0 });
                const chainMesh = new THREE.Mesh(chainGeo, chainMaterial); chainMesh.position.y = 0.15;
                const lampshadeMaterial = new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0x000000, emissiveIntensity: 0.0,});
                const lightMaterial = new THREE.MeshStandardMaterial({ color: 0xffaa77, emissive: 0xffaa77, emissiveIntensity: 1,});
                const bulbRadius = 0.08;
                const bulbGeometry = new THREE.SphereGeometry(bulbRadius, 16, 8);
                const bulbMesh = new THREE.Mesh(bulbGeometry, lightBulbMaterial); // Using global lightBulbMaterial
                bulbMesh.position.y = -0.3 + bulbRadius * 2;
                const light = new THREE.Mesh(lightGeo, lampshadeMaterial);
                const bottomLightGeo = new THREE.CircleGeometry(0.3, 16);
                const bottomLight = new THREE.Mesh(bottomLightGeo, lightMaterial);
                bottomLight.rotation.x = Math.PI / 2; bottomLight.position.y = -0.11;
                const lightGroup = new THREE.Group();
                lightGroup.add(light); lightGroup.add(bottomLight); lightGroup.add(bulbMesh); lightGroup.add(chainMesh);
                const lampName = `Escalator End Lamp ${i}-${idx + 1}`; // Use i directly
                lightGroup.name = lampName; light.name = `${lampName} Lampshade`;
                lightGroup.position.set(xPos, escLightY, escEndZ);
                lightGroup.castShadow = true; scene.add(lightGroup); lights.push(lightGroup);
                const pointLight = new THREE.PointLight(0xffffaa, 1, 5);
                pointLight.position.set(xPos, escLightY - 0.3, escEndZ); scene.add(pointLight);
                lightGroup.userData = { pointLight, floorIndex: i, isDestroyed: false };
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
        // Note: doorOffset and wallDepth used below will now refer to those defined at the start of generateWorld
        const segmentZ = -SETTINGS.corridorWidth / 2 + doorOffset / 2;
        const wallRGeo = new THREE.BoxGeometry(wallDepth, SETTINGS.floorHeight, elevatorSize); // Wall depth and height
        //const elevatorWallMaterial = new THREE.MeshStandardMaterial({ color: 0x999999 });
        const wallR = new THREE.Mesh(wallRGeo, wallMaterial);
        wallR.name = `Elevator RHS Wall ${i}`;
        wallR.position.set(0, floorY + SETTINGS.wallHeight / 2, -(elevatorSize/2)); // Elevator shaft wall
        wallR.castShadow = true;
        wallR.receiveShadow = true;
        scene.add(wallR);
        worldObjects.push(wallR);

         // Left Wall Segments (Negative X direction relative to corridor center)
        const LeftWallX = SETTINGS.corridorWidth;

        // Left Wall next to Elevator
        const wallLGeo = new THREE.BoxGeometry(wallDepth, SETTINGS.floorHeight, elevatorSize);
        const wallL = new THREE.Mesh(wallLGeo, wallMaterial);
        wallL.position.set(LeftWallX, floorY + SETTINGS.wallHeight / 2, -elevatorSize/2); // Elevator shaft wall
        wallL.name = `Elevator Left Wall ${i}`;
        wallL.castShadow = true;
        wallL.receiveShadow = true;
        scene.add(wallL);
        worldObjects.push(wallL);

        // wall behind elevator
        const endWallGeo = new THREE.BoxGeometry(SETTINGS.corridorWidth, SETTINGS.floorHeight, wallDepth);
        const endWallNear = new THREE.Mesh(endWallGeo, wallMaterial);
        endWallNear.position.set(SETTINGS.corridorWidth / 2, floorY + SETTINGS.wallHeight / 2, -SETTINGS.elevatorSize); // Near end (Z=0)
        endWallNear.name = `Elevator Back Wall ${i}`;
        endWallNear.castShadow = true;
        endWallNear.receiveShadow = true;
        scene.add(endWallNear); // elevator shaft is here
        worldObjects.push(endWallNear);

        // close ceiling floor area at elevator shaft
        //const elevatorCeilingGeo = new THREE.BoxGeometry(SETTINGS.corridorWidth, SETTINGS.doorHeight, wallDepth);
        const capWallGeo = new THREE.BoxGeometry(SETTINGS.corridorWidth, SETTINGS.floorHeight - SETTINGS.wallHeight, wallDepth);
        const capWallNear = new THREE.Mesh(capWallGeo, floorMaterial);
        capWallNear.position.set(SETTINGS.corridorWidth / 2, floorY + SETTINGS.wallHeight +(SETTINGS.floorHeight - SETTINGS.wallHeight)  / 2, 0); // Near end (Z=0)
        capWallNear.castShadow = true;
        capWallNear.receiveShadow = true;
        scene.add(capWallNear); // elevator shaft is here
        worldObjects.push(capWallNear);


        
    }

    // Elevator Platform
    const elevatorGeo = new THREE.BoxGeometry(SETTINGS.corridorWidth - 0.2, 0.2, SETTINGS.elevatorSize - 0.2); // Slightly smaller than corridor
    elevator = new THREE.Mesh(elevatorGeo, elevatorMaterial);
    elevator.name = `Elevator Floor`;
    elevator.position.set(SETTINGS.corridorWidth /2, -0.1, -elevatorSize / 2); // Start at floor 0, near Z=0
    elevator.castShadow = true;
    elevator.receiveShadow = true;
    scene.add(elevator);
    worldObjects.push(elevator); // Elevator platform is solid

    // Add bottom shaft extending downwards from the elevator
    const bottomShaftThickness = 0.2;
    // The piston shaft's length should be the total travel distance of the elevator platform.
    // Highest platform center Y: (SETTINGS.numFloors * SETTINGS.floorHeight) - 0.1
    // Lowest platform center Y: (-SETTINGS.numBasementFloors * SETTINGS.floorHeight) - 0.1
    // Total travel = Highest - Lowest = (SETTINGS.numFloors + SETTINGS.numBasementFloors) * SETTINGS.floorHeight
    const bottomShaftActualHeight = (SETTINGS.numFloors + SETTINGS.numBasementFloors) * SETTINGS.floorHeight;

    const bottomShaftGeo = new THREE.BoxGeometry(bottomShaftThickness, bottomShaftActualHeight, bottomShaftThickness);
    const bottomShaft = new THREE.Mesh(bottomShaftGeo, elevatorMaterial);
    bottomShaft.name = "ElevatorBottomPistonShaft";
    // Position its top surface at the bottom of the elevator platform (local y = -0.1 for platform bottom)
    // So, its center is at -0.1 - height/2
    bottomShaft.position.set(0, -0.1 - (bottomShaftActualHeight / 2), 0);
    bottomShaft.castShadow = true;
    bottomShaft.receiveShadow = true;
    elevator.add(bottomShaft); // Add as a child of the elevator
    worldObjects.push(bottomShaft); // Add to worldObjects for collision
    bottomShaft.geometry.computeBoundingBox(); // For collision detection

    // Dynamic shaft/chain
    // We need the scene to find the 'Top Roof over Elevator' for initial height calculation
    const chain = createDynamicChain(elevatorMaterial, scene);
    elevator.add(chain);

    // Add vertical shafts/poles inside the elevator corners
    const shaftDimension = 0.1; // Width and depth of the shafts
    const shaftHeight = SETTINGS.wallHeight; // Height of the shafts (from platform to roof bottom)
    const shaftGeo = new THREE.BoxGeometry(shaftDimension, shaftHeight, shaftDimension);

    const elPlatformWidth = SETTINGS.corridorWidth - 0.2;
    const elPlatformDepth = SETTINGS.elevatorSize - 0.2;
    const elevatorPlatformTopY = 0.1; // Top surface of the elevator platform (local Y)

    const shaftPositions = [
        { x: -elPlatformWidth / 2 + shaftDimension / 2, z: -elPlatformDepth / 2 + shaftDimension / 2 }, // Front-left
        { x:  elPlatformWidth / 2 - shaftDimension / 2, z: -elPlatformDepth / 2 + shaftDimension / 2 }, // Front-right
        { x: -elPlatformWidth / 2 + shaftDimension / 2, z:  elPlatformDepth / 2 - shaftDimension / 2 }, // Back-left
        { x:  elPlatformWidth / 2 - shaftDimension / 2, z:  elPlatformDepth / 2 - shaftDimension / 2 }  // Back-right
    ];

    shaftPositions.forEach((pos, index) => {
        const shaft = new THREE.Mesh(shaftGeo, elevatorMaterial);
        shaft.name = `ElevatorShaftPole_${index}`;
        // Position the center of the shaft.
        // Y position is relative to the elevator's local origin.
        // It starts from the top of the elevator platform (localY = 0.1) and goes up by half its height.
        shaft.position.set(
            pos.x,
            elevatorPlatformTopY + shaftHeight / 2,
            pos.z
        );
        shaft.castShadow = true;
        shaft.receiveShadow = true;
        elevator.add(shaft); // Add as a child of the elevator
        // No need to add to worldObjects separately if they are children and elevator is in worldObjects
        // and collision checks are recursive. For simple visual elements, this is fine.
    });


    // Initial camera position relative to elevator
    camera.position.set(
        elevator.position.x,
        elevator.position.y + playerHeight +0.2, // Start slightly above the elevator platform
        elevator.position.z + 0.1 // Start slightly inside the corridor from elevator
    );

    // Rotate the camera to look down the hallway
    controls.getObject().rotation.y = Math.PI; // Rotate 180 degrees (facing opposite direction

    elevatorTargetY = elevator.position.y; // Start stationary

    // Note: Corridor ceiling lights and escalator bridge lights are now generated inside the `else (i >=0)` block.

    // Add elevator roof
    addElevatorRoof();

    // --- Add Elevator Shaft Pit Base ---
    const pitThickness = SETTINGS.floorHeight; // Make it substantial
    const pitTopY = (-SETTINGS.numBasementFloors * SETTINGS.floorHeight) - floorDepth;
    const pitCenterY = pitTopY - pitThickness / 2;

    const pitGeo = new THREE.BoxGeometry(SETTINGS.corridorWidth, pitThickness, SETTINGS.elevatorSize);
    const pitMesh = new THREE.Mesh(pitGeo, concreteMaterial); // Use concrete for the pit
    pitMesh.position.set(SETTINGS.corridorWidth / 2, pitCenterY, -SETTINGS.elevatorSize / 2);
    pitMesh.name = "ElevatorShaftPitBase";
    pitMesh.receiveShadow = true; // It can receive shadows from the elevator
    scene.add(pitMesh);
    worldObjects.push(pitMesh);
    pitMesh.geometry.computeBoundingBox();
}

function createDynamicChain(material, sceneRef) {
    const chainThickness = 0.1;
    const elevatorRoofThickness = 0.2; // Matches addElevatorRoof()

    // Calculate the Y position of the top surface of the elevator's own roof when the elevator is at its lowest.
    // Elevator platform's lowest center Y is (-SETTINGS.numBasementFloors * SETTINGS.floorHeight) - 0.1.
    // The elevator's roof center (local Y) is SETTINGS.wallHeight relative to platform center.
    // So, elevator's roof top surface (local Y) is SETTINGS.wallHeight + elevatorRoofThickness / 2.
    const elevatorRoofTopLocalY = SETTINGS.wallHeight + elevatorRoofThickness / 2;
    const minElevatorRoofTopWorldY = (-SETTINGS.numBasementFloors * SETTINGS.floorHeight) - 0.1 + elevatorRoofTopLocalY;

    // Get the 'Top Roof over Elevator' to calculate its bottom surface Y.
    const topShaftRoofObject = sceneRef.getObjectByName('Top Roof over Elevator');
    if (!topShaftRoofObject) {
        console.error("Dynamic chain: 'Top Roof over Elevator' not found in scene.");
        return new THREE.Group(); // Return an empty group or handle error
    }
    const topShaftRoofGeoParams = topShaftRoofObject.geometry.parameters;
    const topShaftRoofBottomWorldY = topShaftRoofObject.position.y - topShaftRoofGeoParams.height / 2;

    // initialGeomHeight is the maximum length the chain will ever need to be.
    const initialGeomHeight = Math.max(0.01, topShaftRoofBottomWorldY - minElevatorRoofTopWorldY);

    const chainGeometry = new THREE.BoxGeometry(chainThickness, initialGeomHeight, chainThickness);
    const chainMesh = new THREE.Mesh(chainGeometry, material);
    chainMesh.name = `ElevatorChain`;

    // The chain's base (bottom) sits on top of the elevator's own roof.
    // Its local Y position (center of the chain) will be this base + half its initial height.
    chainMesh.position.set(0, elevatorRoofTopLocalY + initialGeomHeight / 2, 0);

    chainMesh.castShadow = true;
    chainMesh.receiveShadow = true;
    // Store initial height for scaling later:
    chainMesh.userData.initialGeomHeight = initialGeomHeight;
    return chainMesh;
}

function updateChainLength(elevator, sceneRef) {
  const chain = elevator.getObjectByName(`ElevatorChain`);
  const elevatorRoofObject = elevator.userData.roof;

  if (chain && elevatorRoofObject && chain.userData.initialGeomHeight) {
    const initialGeomHeight = chain.userData.initialGeomHeight;
    const elevatorRoofThickness = elevatorRoofObject.geometry.parameters.height;

    // World Y of the top surface of the elevator's own roof
    const elevatorRoofTopWorldY = elevatorRoofObject.position.y + elevatorRoofThickness / 2;

    const topShaftRoofObject = sceneRef.getObjectByName('Top Roof over Elevator');
    const topShaftRoofBottomWorldY = topShaftRoofObject.position.y - topShaftRoofObject.geometry.parameters.height / 2;

    const currentVisibleChainLength = Math.max(0.01, topShaftRoofBottomWorldY - elevatorRoofTopWorldY);

    chain.scale.y = currentVisibleChainLength / initialGeomHeight;

    // The chain's base (local Y) is top of elevator roof. Its center is half its current visible length above that.
    const elevatorRoofTopLocalY = SETTINGS.wallHeight + elevatorRoofThickness / 2;
    chain.position.y = elevatorRoofTopLocalY + currentVisibleChainLength / 2;
  }
}

// --- Helper function to create a room lamp ---
function createRoomLamp(x, y, z, floorIndex, roomId, baseBulbMaterial) {
    const lightGeo = new THREE.ConeGeometry(0.3, 0.2, 16);
    const chainGeo = new THREE.BoxGeometry(0.05, 0.5, 0.05);
    const chainMaterial = new THREE.MeshStandardMaterial({ color: 0x111111 });
    const chainMesh = new THREE.Mesh(chainGeo, chainMaterial);
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

    const bulbRadius = 0.08;
    const bulbGeometry = new THREE.SphereGeometry(bulbRadius, 16, 8);
    // Clone the material so each bulb can have its own emissive state
    const bulbMaterialInstance = baseBulbMaterial.clone();
    bulbMaterialInstance.emissive.set(0x333322); // Dim color when off
    bulbMaterialInstance.emissiveIntensity = 0.1; // Very low intensity when off

    const bulbMesh = new THREE.Mesh(bulbGeometry, bulbMaterialInstance);
    bulbMesh.position.y = -0.3 + bulbRadius * 2;
    bulbMesh.name = `Bulb_Room_${roomId}`;

    const lampshadeMesh = new THREE.Mesh(lightGeo, lampshadeMaterial);
    lampshadeMesh.name = `Lampshade_Room_${roomId}`;

    const bottomLightGeo = new THREE.CircleGeometry(0.3, 16);
    const bottomLightDisk = new THREE.Mesh(bottomLightGeo, lightDiskMaterial);
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

    scene.add(lightGroup);
    lights.push(lightGroup); // Add to global lights array for shooting/interaction

    const pointLight = new THREE.PointLight(0xffddaa, 0, 5); // Start with intensity 0 (off)
    pointLight.position.set(x, y - 0.3, z);
    scene.add(pointLight);

    lightGroup.userData = { 
        pointLight, bulbMesh, bottomLightDisk, floorIndex, roomId,
        animationState: { isAnimating: false, startTime: 0, duration: 500, startLightIntensity: 0, targetLightIntensity: 0, startBulbEmissive: 0, targetBulbEmissive: 0, startDiskEmissive: 0, targetDiskEmissive: 0 },
        isDestroyed: false, isRoomLight: true, isOn: false 
    };
}
// --- Helper function to create an outer wall with a window ---
function createOuterWallWithWindow(centerX, centerY, centerZ, segmentLength, wallHeight, wallThickness, wallMat, glassMat, nameSuffix) {
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
        scene.add(sill); worldObjects.push(sill);
        sill.name = `OuterWallSill_${nameSuffix}`;
    }

    // 2. Header (above window)
    if (headerH > 0.01) {
        const headerGeo = new THREE.BoxGeometry(wallThickness, headerH, segmentLength); // X, Y, Z dimensions
        const header = new THREE.Mesh(headerGeo, wallMat);
        header.position.set(centerX, centerY + (wallHeight / 2) - (headerH / 2), centerZ);
        header.castShadow = true; header.receiveShadow = true;
        scene.add(header); worldObjects.push(header);
        header.name = `OuterWallHeader_${nameSuffix}`;
    }

    // Y position for the center of the window section (pillars and glass)
    const windowSectionY = centerY - (wallHeight / 2) + sillH + (windowH / 2);

    // 3. Left Pillar (beside window, smaller Z value)
    if (pillarW > 0.01) {
        const pillarLGeo = new THREE.BoxGeometry(wallThickness, windowH, pillarW); // X, Y, Z dimensions
        const pillarL = new THREE.Mesh(pillarLGeo, wallMat);
        pillarL.position.set(centerX, windowSectionY, centerZ - (segmentLength / 2) + (pillarW / 2));
        pillarL.castShadow = true; pillarL.receiveShadow = true;
        scene.add(pillarL); worldObjects.push(pillarL);
        pillarL.name = `OuterWallPillarL_${nameSuffix}`;

        // 4. Right Pillar (beside window, larger Z value)
        const pillarRGeo = new THREE.BoxGeometry(wallThickness, windowH, pillarW); // X, Y, Z dimensions
        const pillarR = new THREE.Mesh(pillarRGeo, wallMat);
        pillarR.position.set(centerX, windowSectionY, centerZ + (segmentLength / 2) - (pillarW / 2));
        pillarR.castShadow = true; pillarR.receiveShadow = true;
        scene.add(pillarR); worldObjects.push(pillarR);
        pillarR.name = `OuterWallPillarR_${nameSuffix}`;
    }

    // 5. Window Glass Pane
    if (windowW > 0.01 && windowH > 0.01) {
        const glassGeo = new THREE.BoxGeometry(wallThickness * 0.25, windowH, windowW);
        const glass = new THREE.Mesh(glassGeo, glassMat);
        glass.position.set(centerX, windowSectionY, centerZ);
        glass.castShadow = false;
        glass.receiveShadow = true;
        // Mark as breakable window
        glass.userData.isWindow = true;
        scene.add(glass);
        worldObjects.push(glass);
        glass.name = `OuterWindowGlass_${nameSuffix}`;
    }
}

// --- Add Elevator Roof ---
function addElevatorRoof() {
    const roofHeight = 0.2; // Thickness of the roof
    const roofGeo = new THREE.BoxGeometry(SETTINGS.corridorWidth - 0.2, roofHeight, SETTINGS.elevatorSize - 0.2);
    const roofMaterial = new THREE.MeshStandardMaterial({ color: 0x999999 }); // Gray roof
    const elevatorRoof = new THREE.Mesh(roofGeo, roofMaterial);
    elevatorRoof.name = `Elevator Roof`;

    // Position the roof slightly above the elevator platform
    elevatorRoof.position.set(
        elevator.position.x,
        elevator.position.y + SETTINGS.wallHeight, // Align with the ceiling height
        elevator.position.z
    );

    elevatorRoof.castShadow = true;
    elevatorRoof.receiveShadow = true;

    // Add the roof to the scene and link it to the elevator
    scene.add(elevatorRoof);
    elevator.userData.roof = elevatorRoof; // Store reference to the roof for movement

    // Add the roof to the worldObjects array for collision detection
    worldObjects.push(elevatorRoof);
    elevatorRoof.geometry.computeBoundingBox();

    // Add a light inside the elevator
    const elevatorLight = new THREE.PointLight(0xffffff, 1, 5); // White light with intensity 1 and range 5
    elevatorLight.position.set(0, -roofHeight / 2 - 0.1, 0); // Slightly below the roof
    elevatorRoof.add(elevatorLight); // Attach the light to the roof
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
function callElevator(direction) { // +1 for up, -1 for down
    let targetFloor = currentFloorIndex + direction;

    // Define min and max accessible floors
    const minFloor = -SETTINGS.numBasementFloors;
    const maxFloor = SETTINGS.numFloors; // Roof access is one level above the highest numbered floor
    targetFloor = Math.max(minFloor, Math.min(maxFloor, targetFloor));

    if (targetFloor * SETTINGS.floorHeight !== elevatorTargetY) {
        elevatorTargetY = (targetFloor * SETTINGS.floorHeight) - 0.1; // Slightly below the floor height for elevator platform
        elevatorDirection = Math.sign(elevatorTargetY - elevator.position.y);
        isElevatorMoving = true;
        console.log(`Elevator called to ${targetFloor === maxFloor ? 'roof' : `floor ${targetFloor}`}. Moving ${elevatorDirection > 0 ? 'UP' : 'DOWN'}.`);
    }
}

function updateElevator(deltaTime) {
    if (!isElevatorMoving) return;

    const targetY = elevatorTargetY;
    const currentY = elevator.position.y;
    const moveAmount = SETTINGS.elevatorSpeed * deltaTime * elevatorDirection;
    let nextY = currentY + moveAmount;

    let arrived = false;
    if (elevatorDirection > 0 && nextY >= targetY) { // Moving up
        nextY = targetY;
        arrived = true;
    } else if (elevatorDirection < 0 && nextY <= targetY) { // Moving down
        nextY = targetY;
        arrived = true;
    }

    const deltaY = nextY - currentY;
    elevator.position.y = nextY;

    // Move the roof with the elevator
    if (elevator.userData.roof) {
        elevator.userData.roof.position.y = nextY + SETTINGS.wallHeight; // Align with the ceiling height
        updateChainLength(elevator, scene); // Pass scene to find 'Top Roof over Elevator'
    }

    // Check for player crushing
    handlePlayerCrush(currentY, nextY);

    // Move player with elevator IF they are on it
    const playerPos = controls.getObject().position;
    const playerIsOnElevator =
        Math.abs(playerPos.x - elevator.position.x) < (SETTINGS.corridorWidth / 2) &&
        Math.abs(playerPos.z - elevator.position.z) < (SETTINGS.corridorWidth / 2) &&
        Math.abs(playerPos.y - (currentY + playerHeight)) < 0.3; // Tighter vertical check

    const playerIsOnRoof =
        Math.abs(playerPos.x - elevator.userData.roof.position.x) < (SETTINGS.corridorWidth / 2) &&
        Math.abs(playerPos.z - elevator.userData.roof.position.z) < (SETTINGS.corridorWidth / 2) &&
        Math.abs(playerPos.y - (elevator.userData.roof.position.y + playerHeight)) < 0.3; // Tighter vertical check for roof

    if (playerIsOnElevator) {
        // Set player position directly relative to elevator
        playerPos.y = nextY + playerHeight;
        playerOnGround = true; // Consider player grounded while on elevator
    } else if (playerIsOnRoof) {
        // Set player position directly relative to the roof
        playerPos.y = elevator.userData.roof.position.y + playerHeight;
        playerOnGround = true; // Consider player grounded while on the roof
    }

    if (arrived) {
        isElevatorMoving = false;
        currentFloorIndex = Math.round((targetY + 0.1) / SETTINGS.floorHeight); // Adjust for the -0.1 offset
        console.log(`Elevator arrived at floor ${currentFloorIndex}`);

        if (isPlayerRespawning) {
            respawnPlayer();
        }
    }
}

function handlePlayerCrush(currentY, nextY) {
    const playerPos = controls.getObject().position;

    // Check if the player is underneath the elevator
    const playerIsUnderElevator =
        Math.abs(playerPos.x - elevator.position.x) < (SETTINGS.corridorWidth / 2) &&
        Math.abs(playerPos.z - elevator.position.z) < (SETTINGS.corridorWidth / 2) &&
        playerPos.y < currentY; // Player is below the elevator

    if (playerIsUnderElevator) {
        if (playerState === 'upright' && nextY <= playerPos.y + playerHeight) {
            // Elevator touches the player's head
            playerState = 'crouching';
            playerHeight = 1.0; // Adjust height for crouching
            controls.getObject().position.y -= 0.7; // Adjust camera height
            SETTINGS.playerSpeed *= 2; // Restore crouch speed
        } else if (playerState === 'crouching' && nextY <= playerPos.y + playerHeight) {
            // Elevator touches the player again
            playerState = 'prone';
            playerHeight = 0.5; // Adjust height for prone
            controls.getObject().position.y -= 0.5; // Adjust camera height
            SETTINGS.playerSpeed *= 2; // Restore normal speed
        } else if (playerState === 'prone' && nextY <= playerPos.y + playerHeight) {
            // Elevator crushes the player completely
            displayCrushBanner();
            isPlayerRespawning = true; // Prevent further interaction
        }
    }

    // --- Updated: Handling crushing on the elevator roof against Top Roof over Elevator ---
    if (elevator.userData.roof) {
        const topRoof = worldObjects.find(obj =>
            obj.name === "Top Roof over Elevator"
        );
        if (topRoof) {
            // Estimate player's head position.
            const headY = controls.getObject().position.y + playerHeight * 0.5;
            // Compute the threshold where the top roof will hit the player.
            const roofThreshold = topRoof.position.y - ((topRoof.geometry.parameters.height || 0) / 2) + 0.1;
            if (headY >= roofThreshold) {
                if (playerState === 'upright') {
                    playerState = 'crouching';
                    playerHeight = 1.0;
                    controls.getObject().position.y -= 0.7;
                    SETTINGS.playerSpeed /= 2;
                    applyDamageToPlayer(50);
                    console.log("Player forced to crouch (roof)!");
                } else if (playerState === 'crouching') {
                    playerState = 'prone';
                    playerHeight = 0.5;
                    controls.getObject().position.y -= 0.5;
                    SETTINGS.playerSpeed /= 2;
                    applyDamageToPlayer(50);
                    console.log("Player forced to prone (roof)!");
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
        } else if (lights.includes(intersected.parent) && intersected.parent.userData.isRoomLight === undefined) { // Check if it's a corridor light part
            // This could be a corridor lampshade or bulb, handle if necessary or let shoot() handle it.
        } else {
            // console.log("Interacted with generic object:", intersected.name);
        }
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
    // Remove window from worldObjects array if present
    const index = worldObjects.indexOf(windowMesh);
    if (index > -1) {
        worldObjects.splice(index, 1);
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
        // Respawn player on the elevator
        controls.getObject().position.set(
            elevator.position.x,
            elevator.position.y + playerHeight + 0.2,
            elevator.position.z
        );
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

        // Respawn player at a safe position
        controls.getObject().position.set(
            elevator.position.x,
            elevator.position.y + playerHeight + 0.2,
            elevator.position.z
        );
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

    // Reset player position
    controls.getObject().position.set(
        elevator.position.x,
        elevator.position.y + playerHeight + 0.2,
        elevator.position.z
    );
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
}

// --- Animation Loop ---
function animate() {
    if (isGameOver) return; // Stop animation loop if game is over

    requestAnimationFrame(animate);
    const deltaTime = clock.getDelta();

    if (controls.isLocked) {
        updatePlayer(deltaTime);
        updateElevator(deltaTime);
        updateGarageDoors(deltaTime);
      
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
             } else if (hitObject === elevator) {
                 pointedObjectInfo += ` (Elevator Platform)`;
             } else if (hitObject === elevator.userData.roof) {
                 pointedObjectInfo += ` (Elevator Roof)`;
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

// --- Start the application ---
init();

const enemyGeometry = new THREE.BoxGeometry(1, 2, 1); // Example geometry for an enemy
const enemyMaterial = new THREE.MeshStandardMaterial({ color: 0xff0000 }); // Example material for an enemy

//const enemy = new THREE.Mesh(enemyGeometry, enemyMaterial);
//enemy.position.set(x, y, z); // Set the enemy's position
//scene.add(enemy);
//enemies.push(enemy); // Add the enemy to the array