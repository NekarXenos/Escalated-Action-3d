import * as THREE from 'three';
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';

// --- Game Settings ---
const SETTINGS = {
    numFloors: 4,
    doorsPerSide: 3,
    corridorSegmentLength: 5, // Length of corridor section for one door pair
    corridorWidth: 4,
    wallHeight: 3.5,
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

    // Start the animation loop
    animate();
}

// --- World Generation ---
function generateWorld() {
    const totalCorridorLength = SETTINGS.doorsPerSide * SETTINGS.corridorSegmentLength;

    const floorMaterial = new THREE.MeshStandardMaterial({ color: 0xaaaaaa, side: THREE.DoubleSide });
    const wallMaterial = new THREE.MeshStandardMaterial({ color: 0x555555 });
    const ceilingMaterial = new THREE.MeshStandardMaterial({ color: 0xcccccc });
    // Make blackDoorMaterial accessible globally or pass it around if needed for interact()
    const blackDoorMaterial = new THREE.MeshStandardMaterial({ color: 0x111111 });
    const redDoorMaterial = new THREE.MeshStandardMaterial({ color: 0xee0000, emissive: 0x110000, emissiveIntensity: 0.3 }); // Added emissive property
    const elevatorMaterial = new THREE.MeshStandardMaterial({ color: 0xaa1111 });
    const lightBulbMaterial = new THREE.MeshStandardMaterial({ color: 0xFFFFEE, emissive: 0xFFFFDD, emissiveIntensity: 1 }); // Glowing bulb
    
    const EscalatorMaterial = new THREE.MeshStandardMaterial({ color: 0x222222 });
    const EscalatorEmbarkMaterial = new THREE.MeshStandardMaterial({ color: 0x332222, emissive: 0x110000, emissiveIntensity: 0.1 }); // Added emissive property

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

    // Ground floor (slightly below y=0 for clarity if needed)
    const groundGeo = new THREE.PlaneGeometry(100, 100); // Large ground plane
    const groundMat = new THREE.MeshStandardMaterial({color: 0x555555});
    const ground = new THREE.Mesh(groundGeo, groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.05; // Slightly below first floor
    ground.receiveShadow = true;
    scene.add(ground);
    worldObjects.push(ground); // Add ground for basic collision check

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
    const roofGeo = new THREE.PlaneGeometry(SETTINGS.corridorWidth + (2 * roomSize), totalCorridorLength + escalatorLength + 8);
    const roof = new THREE.Mesh(roofGeo, floorMaterial);
    roof.name = `Roof`;
    roof.rotation.x = -Math.PI / 2;
    roof.position.set(SETTINGS.corridorWidth / 2, (SETTINGS.numFloors) * SETTINGS.floorHeight, 4 + ((totalCorridorLength + escalatorLength) / 2));
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




    // Floor levels
    for (let i = 0; i < SETTINGS.numFloors; i++) {
        const floorY = i * SETTINGS.floorHeight;
        const redDoorIndex = Math.floor(Math.random() * SETTINGS.doorsPerSide * 2);
        let currentDoorIndex = 0;

        // Floor Plane
        const floorGeo = new THREE.PlaneGeometry(SETTINGS.corridorWidth, totalCorridorLength);
        const floor = new THREE.Mesh(floorGeo, floorMaterial);
        floor.name = `Floor ${i}`;
        floor.rotation.x = -Math.PI / 2;
        floor.position.set(SETTINGS.corridorWidth / 2, floorY, totalCorridorLength / 2);
        floor.receiveShadow = true;
        scene.add(floor);
        worldObjects.push(floor);

        // Room Partition Walls (between rooms along Z axis)
        // These walls are parallel to the X-Y plane, with thickness along Z.
        // They span the width of the room (SETTINGS.roomSize along X).
        for (let k = 0; k <= SETTINGS.doorsPerSide; k++) {
            const zPosBoundary = k * SETTINGS.corridorSegmentLength;

            // Right side room partitions (X < 0 relative to corridor edge X=0)
            const partRGeo = new THREE.BoxGeometry(SETTINGS.roomSize, SETTINGS.wallHeight, wallDepth);
            const partR = new THREE.Mesh(partRGeo, wallMaterial);
            partR.position.set(
                -SETTINGS.roomSize / 2, // Centered in the X-span of the right-side rooms
                floorY + SETTINGS.wallHeight / 2,
                zPosBoundary // Centered at the Z boundary
            );
            partR.castShadow = true;
            partR.receiveShadow = true;
            scene.add(partR);
            worldObjects.push(partR);
            partR.name = `RoomPartition_R_F${i}_Z${k}`;

            // Left side room partitions (X > SETTINGS.corridorWidth)
            const partLGeo = new THREE.BoxGeometry(SETTINGS.roomSize, SETTINGS.wallHeight, wallDepth);
            const partL = new THREE.Mesh(partLGeo, wallMaterial);
            partL.position.set(
                SETTINGS.corridorWidth + SETTINGS.roomSize / 2, // Centered in the X-span of the left-side rooms
                floorY + SETTINGS.wallHeight / 2,
                zPosBoundary // Centered at the Z boundary
            );
            partL.castShadow = true;
            partL.receiveShadow = true;
            scene.add(partL);
            worldObjects.push(partL);
            partL.name = `RoomPartition_L_F${i}_Z${k}`;
        }

        // Loop for individual rooms (floor, ceiling, outer wall with window) per door segment
        for (let j = 0; j < SETTINGS.doorsPerSide; j++) {
            const segmentCenterZ = (j + 0.5) * SETTINGS.corridorSegmentLength;

            // --- Right Side Room (X < 0, relative to corridor edge at X=0) ---
            const roomRXCenter = -SETTINGS.roomSize / 2;

            // Right Room Floor
            const rFloorGeo = new THREE.BoxGeometry(SETTINGS.roomSize, floorDepth, SETTINGS.corridorSegmentLength);
            const rFloor = new THREE.Mesh(rFloorGeo, floorMaterial);
            rFloor.position.set(roomRXCenter, floorY - floorDepth / 2, segmentCenterZ);
            rFloor.receiveShadow = true;
            scene.add(rFloor);
            worldObjects.push(rFloor);
            rFloor.name = `RoomFloor_R_F${i}_D${j}`;

            /* // Right Room Ceiling
            const rCeilingGeo = new THREE.BoxGeometry(SETTINGS.roomSize, floorDepth, SETTINGS.corridorSegmentLength);
            const rCeiling = new THREE.Mesh(rCeilingGeo, ceilingMaterial);
            rCeiling.position.set(roomRXCenter, floorY + SETTINGS.wallHeight + floorDepth / 2, segmentCenterZ);
            rCeiling.castShadow = true; // Ceiling can cast shadow downwards
            rCeiling.receiveShadow = true; // And receive from lights in room
            scene.add(rCeiling);
            worldObjects.push(rCeiling);
            rCeiling.name = `RoomCeiling_R_F${i}_D${j}`; */

            // Right Room Outer Wall (with window) - This wall is parallel to YZ plane, thickness along X
            const outerWallRXFace = -SETTINGS.roomSize; // X position of the wall's inner face
            createOuterWallWithWindow(
                outerWallRXFace + wallDepth / 2, // Center X of the wall
                floorY + SETTINGS.wallHeight / 2, // Center Y of the wall
                segmentCenterZ, // Center Z of the wall
                SETTINGS.corridorSegmentLength, // Length of this wall segment (along Z)
                SETTINGS.wallHeight,
                wallDepth, // Thickness of the wall (along X)
                wallMaterial,
                glassMaterial,
                `R_F${i}_D${j}`
            );

            // --- Left Side Room (X > SETTINGS.corridorWidth) ---
            const roomLXCenter = SETTINGS.corridorWidth + SETTINGS.roomSize / 2;

            // Left Room Floor
            const lFloorGeo = new THREE.BoxGeometry(SETTINGS.roomSize, floorDepth, SETTINGS.corridorSegmentLength);
            const lFloor = new THREE.Mesh(lFloorGeo, floorMaterial);
            lFloor.position.set(roomLXCenter, floorY - floorDepth / 2, segmentCenterZ);
            lFloor.receiveShadow = true;
            scene.add(lFloor);
            worldObjects.push(lFloor);
            lFloor.name = `RoomFloor_L_F${i}_D${j}`;

            /* // Left Room Ceiling
            const lCeilingGeo = new THREE.BoxGeometry(SETTINGS.roomSize, floorDepth, SETTINGS.corridorSegmentLength);
            const lCeiling = new THREE.Mesh(lCeilingGeo, ceilingMaterial);
            lCeiling.position.set(roomLXCenter, floorY + SETTINGS.wallHeight + floorDepth / 2, segmentCenterZ);
            lCeiling.castShadow = true;
            lCeiling.receiveShadow = true;
            scene.add(lCeiling);
            worldObjects.push(lCeiling);
            lCeiling.name = `RoomCeiling_L_F${i}_D${j}`; */

            // Left Room Outer Wall (with window)
            const outerWallLXFace = SETTINGS.corridorWidth + SETTINGS.roomSize; // X position of the wall's inner face
            createOuterWallWithWindow(
                outerWallLXFace - wallDepth / 2, // Center X of the wall (subtract half thickness)
                floorY + SETTINGS.wallHeight / 2, // Center Y of the wall
                segmentCenterZ, // Center Z of the wall
                SETTINGS.corridorSegmentLength, // Length of this wall segment (along Z)
                SETTINGS.wallHeight,
                wallDepth, // Thickness of the wall (along X)
                wallMaterial,
                glassMaterial,
                `L_F${i}_D${j}`
            );
        }

        // Define the top surface Y for the current and lower floors
        const currentFloorTopY = floorY;
        const lowerFloorTopY = (i > 0) ? (i - 1) * (SETTINGS.floorHeight) : 0; // Lower floor is 0 if i is 0



        // Escalator area
         // Escalator Floor Start
        const floorEsc1Geo = new THREE.BoxGeometry(SETTINGS.corridorWidth + (escalatorWidth * 2), floorDepth, 4 - 1);
        const floor1Esc = new THREE.Mesh(floorEsc1Geo, floorMaterial);
        floor1Esc.name = `Escalator Floor Start ${i}`;
        floor1Esc.position.set(
            SETTINGS.corridorWidth / 2,
            floorY - floorDepth / 2, // So the top is at floorY
            totalCorridorLength  + 1.5
        );
        floor1Esc.receiveShadow = true;
        scene.add(floor1Esc);
        worldObjects.push(floor1Esc);

        // --- Add ceiling lights above Escalator Floor Start ---
        const escStartZ = floor1Esc.position.z;
        const escLightY = floorY + SETTINGS.wallHeight - 0.5;
        const escLightXs = [
            -escalatorWidth/2, // left ramp
            SETTINGS.corridorWidth + (escalatorWidth/2) // right ramp
        ];
        escLightXs.forEach((xPos, idx) => {
            const lightGeo = new THREE.ConeGeometry(0.3, 0.2, 16);
            const chainGeo = new THREE.BoxGeometry(0.05, 0.5, 0.05);
            const chainMaterial = new THREE.MeshStandardMaterial({ color: 0x111111, emissive: 0x000000, emissiveIntensity: 0 });
            const chainMesh = new THREE.Mesh(chainGeo, chainMaterial);
            chainMesh.position.y = 0.15;

            const lampshadeMaterial = new THREE.MeshStandardMaterial({
                color: 0x000000,
                emissive: 0x000000,
                emissiveIntensity: 0.0,
            });

            const lightMaterial = new THREE.MeshStandardMaterial({
                color: 0xffaa77,
                emissive: 0xffaa77,
                emissiveIntensity: 1,
            });

            const bulbRadius = 0.08;
            const bulbGeometry = new THREE.SphereGeometry(bulbRadius, 16, 8);
            const bulbMaterial = new THREE.MeshStandardMaterial({
                color: 0xffffaa,
                emissive: 0xffffff,
                emissiveIntensity: 2.0,
            });

            const bulbMesh = new THREE.Mesh(bulbGeometry, lightBulbMaterial);
            bulbMesh.position.y = -0.3 + bulbRadius * 2;

            const light = new THREE.Mesh(lightGeo, lampshadeMaterial);

            const bottomLightGeo = new THREE.CircleGeometry(0.3, 16);
            const bottomLight = new THREE.Mesh(bottomLightGeo, lightMaterial);
            bottomLight.rotation.x = Math.PI / 2;
            bottomLight.position.y = -0.11;

            const lightGroup = new THREE.Group();
            lightGroup.add(light);
            lightGroup.add(bottomLight);
            lightGroup.add(bulbMesh);
            lightGroup.add(chainMesh);

            const lampName = `Escalator Start Lamp ${i + 1}-${idx + 1}`;
            lightGroup.name = lampName;
            light.name = `${lampName} Lampshade`;

            lightGroup.position.set(xPos, escLightY, escStartZ);
            lightGroup.castShadow = true;

            scene.add(lightGroup);
            lights.push(lightGroup);

            const pointLight = new THREE.PointLight(0xffffaa, 1, 5);
            pointLight.position.set(xPos, escLightY - 0.3, escStartZ);
            scene.add(pointLight);

            lightGroup.userData = { pointLight, floorIndex: i, isDestroyed: false };
        });

        // Escalator Floor bridge
        const bridge2EscGeo = new THREE.BoxGeometry(SETTINGS.corridorWidth, floorDepth, escalatorLength + 3);
        const bridge2Esc = new THREE.Mesh(bridge2EscGeo, floorMaterial);
        bridge2Esc.name = `Escalator Floor ${i}`;
        bridge2Esc.position.set(
            SETTINGS.corridorWidth / 2,
            floorY - floorDepth / 2, // So the top is at floorY
            totalCorridorLength + 4 +(escalatorLength / 2) + 0.5  // Centered in the corridor
        );
        bridge2Esc.receiveShadow = true;
        scene.add(bridge2Esc);
        worldObjects.push(bridge2Esc);

         // Escalator Floor End
        const floorEsc2Geo = new THREE.BoxGeometry(SETTINGS.corridorWidth + (escalatorWidth * 2), floorDepth, 4-1);
        const floor2Esc = new THREE.Mesh(floorEsc2Geo, floorMaterial);
        floor2Esc.name = `Escalator Floor End ${i}`;
        floor2Esc.position.set(
            SETTINGS.corridorWidth / 2,
            floorY - floorDepth / 2, // So the top is at floorY
            totalCorridorLength + 4 + escalatorLength + 2.5
        );
        floor2Esc.receiveShadow = true;
        scene.add(floor2Esc);
        worldObjects.push(floor2Esc);

        // --- Add ceiling lights above Escalator Floor End ---
        const escEndZ = floor2Esc.position.z;
        escLightXs.forEach((xPos, idx) => {
            const lightGeo = new THREE.ConeGeometry(0.3, 0.2, 16);
            const chainGeo = new THREE.BoxGeometry(0.05, 0.5, 0.05);
            const chainMaterial = new THREE.MeshStandardMaterial({ color: 0x111111, emissive: 0x000000, emissiveIntensity: 0 });
            const chainMesh = new THREE.Mesh(chainGeo, chainMaterial);
            chainMesh.position.y = 0.15;

            const lampshadeMaterial = new THREE.MeshStandardMaterial({
                color: 0x000000,
                emissive: 0x000000,
                emissiveIntensity: 0.0,
            });

            const lightMaterial = new THREE.MeshStandardMaterial({
                color: 0xffaa77,
                emissive: 0xffaa77,
                emissiveIntensity: 1,
            });

            const bulbRadius = 0.08;
            const bulbGeometry = new THREE.SphereGeometry(bulbRadius, 16, 8);
            const bulbMaterial = new THREE.MeshStandardMaterial({
                color: 0xffffaa,
                emissive: 0xffffff,
                emissiveIntensity: 2.0,
            });

            const bulbMesh = new THREE.Mesh(bulbGeometry, lightBulbMaterial);
            bulbMesh.position.y = -0.3 + bulbRadius * 2;

            const light = new THREE.Mesh(lightGeo, lampshadeMaterial);

            const bottomLightGeo = new THREE.CircleGeometry(0.3, 16);
            const bottomLight = new THREE.Mesh(bottomLightGeo, lightMaterial);
            bottomLight.rotation.x = Math.PI / 2;
            bottomLight.position.y = -0.11;

            const lightGroup = new THREE.Group();
            lightGroup.add(light);
            lightGroup.add(bottomLight);
            lightGroup.add(bulbMesh);
            lightGroup.add(chainMesh);

            const lampName = `Escalator End Lamp ${i + 1}-${idx + 1}`;
            lightGroup.name = lampName;
            light.name = `${lampName} Lampshade`;

            lightGroup.position.set(xPos, escLightY, escEndZ);
            lightGroup.castShadow = true;

            scene.add(lightGroup);
            lights.push(lightGroup);

            const pointLight = new THREE.PointLight(0xffffaa, 1, 5);
            pointLight.position.set(xPos, escLightY - 0.3, escEndZ);
            scene.add(pointLight);

            lightGroup.userData = { pointLight, floorIndex: i, isDestroyed: false };
        });

        

        // --- Escalator Steps (replace ramps with steps) ---
        // Only add steps if not on the ground floor
        if (i > 0) {
            // Parameters for steps
            const stepHeight = 0.4; // Height of each step
            const stepDepth = 1;
            const stepCount = Math.ceil(1 + (SETTINGS.floorHeight / stepHeight));
            const stepWidth = SETTINGS.escalatorWidth;

            // Balustrade settings
            const balustradeHeight = 1.7; // Height of the balustrade
            const balustradeThickness = 0.1;
            const balustradeMaterial = new THREE.MeshStandardMaterial({ color: 0x999999 }); // Gray material



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
            // END OF ESCALATORS ////////////////////////////////////////
            
            
        }

        // Ceiling Plane
        const ceilingGeo = new THREE.PlaneGeometry(SETTINGS.corridorWidth, totalCorridorLength);
        const ceiling = new THREE.Mesh(ceilingGeo, ceilingMaterial);
        ceiling.rotation.x = Math.PI / 2;
        ceiling.position.set(SETTINGS.corridorWidth / 2, floorY + SETTINGS.wallHeight, totalCorridorLength / 2);
        ceiling.castShadow = true; // Ceilings can cast shadows downwards
        scene.add(ceiling);
        worldObjects.push(ceiling); // Add ceilings for collision

        // Walls & Doors

        // Right Wall next to elevator shaft (Negative Z direction)
        // Note: doorOffset and wallDepth used below will now refer to those defined at the start of generateWorld
        const segmentZ = -SETTINGS.corridorWidth / 2 + doorOffset / 2;
        const wallRGeo = new THREE.BoxGeometry(wallDepth, SETTINGS.floorHeight, elevatorSize); // Wall depth and height
        const elevatorWallMaterial = new THREE.MeshStandardMaterial({ color: 0x999999 });
        const wallR = new THREE.Mesh(wallRGeo, elevatorWallMaterial);
        wallR.name = `Elevator RHS Wall ${i}`;
        wallR.position.set(0, floorY + SETTINGS.wallHeight / 2, -(elevatorSize/2)); // Elevator shaft wall
        wallR.castShadow = true;
        wallR.receiveShadow = true;
        scene.add(wallR);
        worldObjects.push(wallR);

        // Right Wall next to escalator (Positive Z direction)
        const segmentZ2 = (SETTINGS.doorsPerSide + 1.5) * SETTINGS.corridorSegmentLength;
        const wallR2Geo = new THREE.BoxGeometry(wallDepth, SETTINGS.floorHeight, escalatorLength + 8); // Wall depth and height
        //const wallMaterial = new THREE.MeshStandardMaterial({ color: 0xcccccc });
        const wallR2 = new THREE.Mesh(wallR2Geo, wallMaterial);
        wallR2.name = `Escalator RHS Wall ${i}`;
        wallR2.position.set(-escalatorWidth, floorY + SETTINGS.wallHeight / 2, totalCorridorLength + (escalatorLength/2) + 4); // Escalator side wall
        wallR2.castShadow = true;
        wallR2.receiveShadow = true;
        scene.add(wallR2);
        worldObjects.push(wallR2);

        // Right Corner Wall next to escalator (Negative X direction)
        //const segmentZ3 = (SETTINGS.doorsPerSide + 1.5) * SETTINGS.corridorSegmentLength;
        const wallRCornerGeo = new THREE.BoxGeometry(escalatorWidth + wallDepth, SETTINGS.floorHeight, wallDepth); // Wall depth and height
        //const wallMaterial = new THREE.MeshStandardMaterial({ color: 0xcccccc });
        const wallRCorner = new THREE.Mesh(wallRCornerGeo, wallMaterial);
        wallRCorner.name = `Escalator RHS Corner Wall ${i}`;
        wallRCorner.position.set(-escalatorWidth/2, floorY + SETTINGS.wallHeight / 2, totalCorridorLength); // Escalator side wall
        wallRCorner.castShadow = true;
        wallRCorner.receiveShadow = true;
        scene.add(wallRCorner);
        worldObjects.push(wallRCorner);




        // Right Wall Segments (Positive X direction)
        for (let j = 0; j < SETTINGS.doorsPerSide; j++) {
            const segmentZ = (j + 0.5) * SETTINGS.corridorSegmentLength;

            // Wall before door
            const wall1Geo = new THREE.BoxGeometry(wallDepth, SETTINGS.wallHeight, doorOffset);
            const wall1 = new THREE.Mesh(wall1Geo, wallMaterial);
            wall1.position.set(0, floorY + SETTINGS.wallHeight / 2, segmentZ - SETTINGS.corridorSegmentLength / 2 + doorOffset / 2);
            wall1.castShadow = true;
            wall1.receiveShadow = true;
            scene.add(wall1);
            worldObjects.push(wall1);

            // Door (Right wall)
            const isRed = currentDoorIndex === redDoorIndex;
            const doorMaterial = isRed ? redDoorMaterial : blackDoorMaterial;
            const doorGeo = new THREE.BoxGeometry(SETTINGS.doorDepth, SETTINGS.doorHeight, SETTINGS.doorWidth);
            doorGeo.translate(0, 0, SETTINGS.doorWidth/2);
            const door = new THREE.Mesh(doorGeo, doorMaterial);
            door.position.set(0, floorY + SETTINGS.doorHeight/2, segmentZ - SETTINGS.doorWidth/2);
            door.castShadow = true;
            door.userData = { type: 'door', floor: i, isRed: isRed, locked: (Math.random() < 0.3), isOpen: false };
            door.name = `${i + 1}${String(currentDoorIndex + 1).padStart(2, '0')}`;
            scene.add(door);
            doors.push(door);
            worldObjects.push(door); // Added for collision protection
            // Add doorknob on right-hand side (from corridor view)
            {
                const knobGeometry = new THREE.SphereGeometry(0.1, 8, 6);
                const knobMaterial = new THREE.MeshStandardMaterial({ color: 0x333333 });
                const knob = new THREE.Mesh(knobGeometry, knobMaterial);
                // Place knob at the door’s front side: halfway through thickness and near the door’s right edge.
                knob.position.set(SETTINGS.doorDepth/2 + 0.05, 0, SETTINGS.doorWidth - 0.15);
                knob.userData.doorKnob = true;
                door.add(knob);
                door.userData.knob = knob;

                //const knobGeometry = new THREE.SphereGeometry(0.1, 8, 6);
                //const knobMaterial = new THREE.MeshStandardMaterial({ color: 0x333333 });
                const knob2 = new THREE.Mesh(knobGeometry, knobMaterial);
                // Place knob at the door’s front side: halfway through thickness and near the door’s right edge.
                knob2.position.set(-SETTINGS.doorDepth/2 - 0.05, 0, SETTINGS.doorWidth - 0.15);
                knob2.userData.doorKnob = true;
                door.add(knob2);
                door.userData.knob2 = knob2;
                
            }

            // Wall above door
            const wallAboveGeo = new THREE.BoxGeometry(wallDepth, SETTINGS.wallHeight - SETTINGS.doorHeight, SETTINGS.doorWidth);
            const wallAbove = new THREE.Mesh(wallAboveGeo, wallMaterial);
            wallAbove.position.set(0, floorY + SETTINGS.doorHeight + (SETTINGS.wallHeight - SETTINGS.doorHeight) / 2, segmentZ);
            wallAbove.castShadow = true;
            wallAbove.receiveShadow = true;
            scene.add(wallAbove);
            worldObjects.push(wallAbove);

            // Wall after door
            const wall2Geo = new THREE.BoxGeometry(wallDepth, SETTINGS.wallHeight, doorOffset);
            const wall2 = new THREE.Mesh(wall2Geo, wallMaterial);
            wall2.position.set(0, floorY + SETTINGS.wallHeight / 2, segmentZ + SETTINGS.doorWidth / 2 + doorOffset / 2);
            wall2.castShadow = true;
            wall2.receiveShadow = true;
            scene.add(wall2);
            worldObjects.push(wall2);

            currentDoorIndex++;
        }


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

        // Left Wall next to escalator (Positive Z direction)
        const segmentZ3 = (SETTINGS.doorsPerSide + 1.5) * SETTINGS.corridorSegmentLength;
        const wallL3Geo = new THREE.BoxGeometry(wallDepth, SETTINGS.floorHeight, escalatorLength + 8); // Wall depth and height
        //const wallMaterial = new THREE.MeshStandardMaterial({ color: 0xcccccc });
        const wallL3 = new THREE.Mesh(wallL3Geo, wallMaterial);
        wallL3.name = `Escalator Left Wall ${i}`;
        wallL3.position.set(LeftWallX + escalatorWidth, floorY + SETTINGS.wallHeight / 2, totalCorridorLength + (escalatorLength/2) + 4); // Escalator wall
        wallL3.castShadow = true;
        wallL3.receiveShadow = true;
        scene.add(wallL3);
        worldObjects.push(wallL3);
        
        // Left Corner Wall next to escalator (Negative X direction)
        //const segmentZ3 = (SETTINGS.doorsPerSide + 1.5) * SETTINGS.corridorSegmentLength;
        const wallLCornerGeo = new THREE.BoxGeometry(escalatorWidth + wallDepth, SETTINGS.floorHeight, wallDepth); // Wall depth and height
        //const wallMaterial = new THREE.MeshStandardMaterial({ color: 0xcccccc });
        const wallLCorner = new THREE.Mesh(wallLCornerGeo, wallMaterial);
        wallLCorner.name = `Escalator RHS Corner Wall ${i}`;
        wallLCorner.position.set(LeftWallX + escalatorWidth/2, floorY + SETTINGS.wallHeight / 2, totalCorridorLength); // Escalator side wall
        wallLCorner.castShadow = true;
        wallLCorner.receiveShadow = true;
        scene.add(wallLCorner);
        worldObjects.push(wallLCorner);



        for (let j = 0; j < SETTINGS.doorsPerSide; j++) {
            const segmentZ = (j + 0.5) * SETTINGS.corridorSegmentLength;

             // Wall before door
            const wall1Geo = new THREE.BoxGeometry(wallDepth, SETTINGS.wallHeight, doorOffset);
            const wall1 = new THREE.Mesh(wall1Geo, wallMaterial);
            wall1.position.set(LeftWallX, floorY + SETTINGS.wallHeight / 2, segmentZ - SETTINGS.corridorSegmentLength / 2 + doorOffset / 2);
            wall1.castShadow = true;
            wall1.receiveShadow = true;
            scene.add(wall1);
            worldObjects.push(wall1);

            // Door (Left wall)
            const isRed = currentDoorIndex === redDoorIndex;
            const doorMaterial = isRed ? redDoorMaterial : blackDoorMaterial;
            const doorGeo = new THREE.BoxGeometry(SETTINGS.doorDepth, SETTINGS.doorHeight, SETTINGS.doorWidth);
            // Pivot adjustment: shift geometry so that its left edge (along z) is at 0
            doorGeo.translate(0, 0, SETTINGS.doorWidth/2);
            const door = new THREE.Mesh(doorGeo, doorMaterial);
            // Adjust door position: move back by half a doorwidth along z
            door.position.set(LeftWallX, floorY + SETTINGS.doorHeight/2, segmentZ - SETTINGS.doorWidth/2);
            door.castShadow = true;
            door.userData = { type: 'door', floor: i, isRed: isRed, locked: (Math.random() < 0.3), isOpen: false };
            door.name = `${i + 1}${String(currentDoorIndex + 1).padStart(2, '0')}`;
            scene.add(door);
            doors.push(door);
            worldObjects.push(door); // Add door to worldObjects for collision detection
            // Add doorknob on right-hand side (from corridor view)
            {
                const knobGeometry = new THREE.SphereGeometry(0.1, 8, 6);
                const knobMaterial = new THREE.MeshStandardMaterial({ color: 0x333333 });
                const knob = new THREE.Mesh(knobGeometry, knobMaterial);
                // In both cases the knob is positioned on what is visually the right edge:
                knob.position.set(SETTINGS.doorDepth/2 + 0.05, 0, SETTINGS.doorWidth - 0.15);
                knob.userData.doorKnob = true;
                door.add(knob);
                door.userData.knob = knob;

                const knob2 = new THREE.Mesh(knobGeometry, knobMaterial);
                // In both cases the knob is positioned on what is visually the right edge:
                knob2.position.set(-SETTINGS.doorDepth/2 - 0.05, 0, SETTINGS.doorWidth - 0.15);
                knob2.userData.doorKnob = true;
                door.add(knob2);
                door.userData.knob2 = knob2;
            }

            // Wall above door
            const wallAboveGeo = new THREE.BoxGeometry(wallDepth, SETTINGS.wallHeight - SETTINGS.doorHeight, SETTINGS.doorWidth);
            const wallAbove = new THREE.Mesh(wallAboveGeo, wallMaterial);
            wallAbove.position.set(LeftWallX, floorY + SETTINGS.doorHeight + (SETTINGS.wallHeight - SETTINGS.doorHeight) / 2, segmentZ);
            wallAbove.castShadow = true;
            wallAbove.receiveShadow = true;
            scene.add(wallAbove);
            worldObjects.push(wallAbove);

             // Wall after door
            const wall2Geo = new THREE.BoxGeometry(wallDepth, SETTINGS.wallHeight, doorOffset);
            const wall2 = new THREE.Mesh(wall2Geo, wallMaterial);
            wall2.position.set(LeftWallX, floorY + SETTINGS.wallHeight / 2, segmentZ + SETTINGS.doorWidth / 2 + doorOffset / 2);
            wall2.castShadow = true;
            wall2.receiveShadow = true;
            scene.add(wall2);
            worldObjects.push(wall2);

            currentDoorIndex++;
        }

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

        
                
        

        // Far end wall End Caps for Corridor (simple boxes for now)
        const farWallZ = totalCorridorLength;
        // Add wall segments around escalator opening if needed, simplified here
        const endWallEscGeo = new THREE.BoxGeometry(SETTINGS.corridorWidth + (2 * escalatorWidth), SETTINGS.floorHeight, wallDepth);
        const endWallFar = new THREE.Mesh(endWallEscGeo, wallMaterial);
        endWallFar.position.set(SETTINGS.corridorWidth / 2, floorY + SETTINGS.wallHeight / 2, totalCorridorLength + 4 + escalatorLength + 4); // Far end (Z=totalLength)
        endWallFar.name = `Escalator Back Wall ${i}`;
        endWallFar.castShadow = true;
        endWallFar.receiveShadow = true;
        scene.add(endWallFar); // Add the far wall completely - 
        worldObjects.push(endWallFar);

        
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

    // Initial camera position relative to elevator
    camera.position.set(
        elevator.position.x,
        elevator.position.y + playerHeight +0.2, // Start slightly above the elevator platform
        elevator.position.z + 0.1 // Start slightly inside the corridor from elevator
    );

    // Rotate the camera to look down the hallway
    controls.getObject().rotation.y = Math.PI; // Rotate 180 degrees (facing opposite direction

    elevatorTargetY = elevator.position.y; // Start stationary

    // Add ceiling lights
    for (let i = 0; i < SETTINGS.numFloors; i++) {
        const floorY = i * SETTINGS.floorHeight;
        for (let j = 0; j < SETTINGS.doorsPerSide; j++) {
            const segmentZ = (j + 0.5) * SETTINGS.corridorSegmentLength;

            // Create light geometry and material
            const lightGeo = new THREE.ConeGeometry(0.3, 0.2, 16); // Cone shape
            const chainGeo = new THREE.BoxGeometry(0.05, 0.5, 0.05); // Chain link shape
            const chainMaterial = new THREE.MeshStandardMaterial({ color: 0x111111, emissive: 0x000000, emissiveIntensity: 0 }); // Chain material
            const chainMesh = new THREE.Mesh(chainGeo, chainMaterial);  // Create chain link mesh
            chainMesh.position.y = 0.15; // Position chain link above the cone    

            // Black lampshade material for the outside
            const lampshadeMaterial = new THREE.MeshStandardMaterial({
                color: 0x000000, // Black color
                emissive: 0x000000, // No emissive light from the outside
                emissiveIntensity: 0.0,
            });

            // Light material for the bottom flat part
            const lightMaterial = new THREE.MeshStandardMaterial({
                color: 0xffaa77, // Light yellow color
                emissive: 0xffaa77, // Emissive light
                emissiveIntensity: 1,
            });

            // Bulb Geometry (simple sphere)
            const bulbRadius = 0.08;
            const bulbGeometry = new THREE.SphereGeometry(bulbRadius, 16, 8);
            const bulbMaterial = new THREE.MeshStandardMaterial({
                color: 0xffffaa, // Light yellow color
                emissive: 0xffffff, // Emissive light
                emissiveIntensity: 2.0,
            });

            // Bulb Mesh
            const bulbMesh = new THREE.Mesh(bulbGeometry, lightBulbMaterial);
            bulbMesh.position.y = -0.3 + bulbRadius * 2; // Position bulb slightly inside cone bottom

            // Create the cone mesh
            const light = new THREE.Mesh(lightGeo, lampshadeMaterial);

            // Add a separate flat disk for the bottom light
            const bottomLightGeo = new THREE.CircleGeometry(0.3, 16); // Flat circle for the bottom
            const bottomLight = new THREE.Mesh(bottomLightGeo, lightMaterial);
            bottomLight.rotation.x = Math.PI / 2; // Rotate to face downward
            bottomLight.position.y = -0.11; // Position slightly below the cone

            // Group the cone and the bottom light together
            const lightGroup = new THREE.Group();
            lightGroup.add(light);
            lightGroup.add(bottomLight);
            lightGroup.add(bulbMesh); // Add the bulb to the group
            lightGroup.add(chainMesh); // Add the chain link to the group

            // Assign names to the lampshade and light group
            const lampName = `Lamp ${i + 1}${String(j + 1).padStart(2, '0')}`;
            lightGroup.name = lampName;
            light.name = `${lampName} Lampshade`;

            // Position the light group
            lightGroup.position.set(SETTINGS.corridorWidth / 2, floorY + SETTINGS.wallHeight - 0.5, segmentZ);
            lightGroup.castShadow = true;

            // Add light group to the scene
            scene.add(lightGroup);
            lights.push(lightGroup); // Add light group to the global lights array

            // Add a point light for illumination
            const pointLight = new THREE.PointLight(0xffffaa, 1, 5);
            pointLight.position.set(lightGroup.position.x, lightGroup.position.y - 0.3, lightGroup.position.z);
            scene.add(pointLight);

            // Attach the point light to the group for movement
            lightGroup.userData = { pointLight, floorIndex: i, isDestroyed: false };
        }

        // --- Escalator Bridge Ceiling Light ---
        // Place 1 or 2 lights above the escalator bridge per floor
        const escLightPositions = [
            totalCorridorLength + 4 + (escalatorLength / 3),
            totalCorridorLength + 4 + (2 * escalatorLength / 3)
        ];
        escLightPositions.forEach((zPos, idx) => {
            // Light geometry and materials (reuse from above)
            const lightGeo = new THREE.ConeGeometry(0.3, 0.2, 16);
            const chainGeo = new THREE.BoxGeometry(0.05, 0.5, 0.05);
            const chainMaterial = new THREE.MeshStandardMaterial({ color: 0x111111, emissive: 0x000000, emissiveIntensity: 0 });
            const chainMesh = new THREE.Mesh(chainGeo, chainMaterial);
            chainMesh.position.y = 0.15;

            const lampshadeMaterial = new THREE.MeshStandardMaterial({
                color: 0x000000,
                emissive: 0x000000,
                emissiveIntensity: 0.0,
            });

            const lightMaterial = new THREE.MeshStandardMaterial({
                color: 0xffaa77,
                emissive: 0xffaa77,
                emissiveIntensity: 1,
            });

            const bulbRadius = 0.08;
            const bulbGeometry = new THREE.SphereGeometry(bulbRadius, 16, 8);
            const bulbMaterial = new THREE.MeshStandardMaterial({
                color: 0xffffaa,
                emissive: 0xffffff,
                emissiveIntensity: 2.0,
            });

            const bulbMesh = new THREE.Mesh(bulbGeometry, lightBulbMaterial);
            bulbMesh.position.y = -0.3 + bulbRadius * 2;

            const light = new THREE.Mesh(lightGeo, lampshadeMaterial);

            const bottomLightGeo = new THREE.CircleGeometry(0.3, 16);
            const bottomLight = new THREE.Mesh(bottomLightGeo, lightMaterial);
            bottomLight.rotation.x = Math.PI / 2;
            bottomLight.position.y = -0.11;

            const lightGroup = new THREE.Group();
            lightGroup.add(light);
            lightGroup.add(bottomLight);
            lightGroup.add(bulbMesh);
            lightGroup.add(chainMesh);

            const lampName = `Escalator Lamp ${i + 1}-${idx + 1}`;
            lightGroup.name = lampName;
            light.name = `${lampName} Lampshade`;

            // Position above the escalator bridge
            lightGroup.position.set(
                SETTINGS.corridorWidth / 2,
                floorY + SETTINGS.wallHeight - 0.5,
                zPos
            );
            lightGroup.castShadow = true;

            scene.add(lightGroup);
            lights.push(lightGroup);

            // Add a point light for illumination
            const pointLight = new THREE.PointLight(0xffffaa, 1, 5);
            pointLight.position.set(lightGroup.position.x, lightGroup.position.y - 0.3, lightGroup.position.z);
            scene.add(pointLight);

            lightGroup.userData = { pointLight, floorIndex: i, isDestroyed: false };
        });
    }

    // Add elevator roof
    addElevatorRoof();
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
        const glassGeo = new THREE.BoxGeometry(wallThickness * 0.25, windowH, windowW); // X, Y, Z dimensions
        const glass = new THREE.Mesh(glassGeo, glassMat);
        glass.position.set(centerX, windowSectionY, centerZ);
        // Glass typically doesn't cast strong shadows but can receive them or affect light.
        glass.castShadow = false; // Usually false for transparent glass to avoid overly dark shadows
        glass.receiveShadow = true;
        scene.add(glass);
        // Add to worldObjects if you want bullets to hit it, otherwise omit for pass-through.
        // For now, let's make it collidable.
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

    // Allow elevator to move beyond the top floor to the roof
    const maxFloor = SETTINGS.numFloors; // Roof is one level above the top floor
    targetFloor = Math.max(0, Math.min(maxFloor, targetFloor));

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
        currentFloorIndex = Math.round(targetY / SETTINGS.floorHeight); // Update current floor index
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
            SETTINGS.playerSpeed /= 2; // Reduce speed for crouching
            applyDamageToPlayer(50); // Player takes 50% damage
            console.log("Player forced to crouch!");
        } else if (playerState === 'crouching' && nextY <= playerPos.y + playerHeight) {
            // Elevator touches the player again
            playerState = 'prone';
            playerHeight = 0.5; // Adjust height for prone
            controls.getObject().position.y -= 0.5; // Adjust camera height
            SETTINGS.playerSpeed /= 2; // Further reduce speed for prone
            applyDamageToPlayer(50); // Player takes another 50% damage
            console.log("Player forced to prone!");
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
    const pointer = new THREE.Vector2(0, 0);
    raycaster.setFromCamera(pointer, camera);
    // Check all doors and their children
    const intersects = raycaster.intersectObjects(doors, true);
    if (intersects.length > 0) {
        const intersected = intersects[0].object;
        // If the hit object is a door knob:
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
        }
        // Otherwise, if the hit object is the door itself:
        else if (intersected.userData.type === 'door') {
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
        }
    }
}

function shoot() {
    if (!controls.isLocked) return;
    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2(0, 0);
    raycaster.setFromCamera(pointer, camera);
    // Check intersections among lights, worldObjects, and doors (including children)
    const intersects = raycaster.intersectObjects([...lights, ...worldObjects, ...doors], true);
    if (intersects.length > 0) {
        const hit = intersects[0];
        const hitObject = hit.object;
        // If a door knob is hit:
        if (hitObject.userData.doorKnob) {
            const door = hitObject.parent;
            // Instead of using createBulletHole, create a decal that remains with the door.
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
        }
        // For other hits, create a bullet hole normally (decoupled from the door)
        else {
            createBulletHole(hit.point, hit.face.normal);
            const lightGroup = hitObject.parent;
            if (lights.includes(lightGroup)) {
                destroyLight(lightGroup);
            }
        }
    }
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
    const pointLight = lightGroup.userData.pointLight;
    if (pointLight) {
        pointLight.intensity *= 10;
        setTimeout(() => {
            // Disable the light and all corridor lights
            pointLight.intensity = 0;
            disableCorridorLights(lightGroup.userData.floorIndex);
        }, 500); // Flash duration
    }

    // Despawn the bottom light
    const bottomLight = lightGroup.children.find(child => child.geometry instanceof THREE.CircleGeometry);
    if (bottomLight) {
        lightGroup.remove(bottomLight);
    }

    // Break the lightbulb into pieces
    const bulb = lightGroup.children.find(child => child.geometry instanceof THREE.SphereGeometry);
    if (bulb) {
        breakLightBulb(bulb);
        lightGroup.remove(bulb);
    }

    // Drop the lampshade
    const lampshade = lightGroup.children.find(child => child.geometry instanceof THREE.ConeGeometry);
    if (lampshade) {
        dropLampshade(lampshade);
    }
}

function disableCorridorLights(floorIndex) {
    lights.forEach(lightGroup => {
        if (lightGroup.userData.floorIndex === floorIndex) {
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
     if (cameraObject.position.y < playerHeight -0.1) { // Check against absolute ground + height
        cameraObject.position.y = playerHeight - 0.1;
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
      
        // NEW: Animate down escalator steps along their creation angle.
        const escSpeed = SETTINGS.escalatorSpeed; // speed in units per second
        for (const floor in escalatorSteps.down) {
            const steps = escalatorSteps.down[floor];
            const startMesh = escalatorStarts.down[floor];
            const endMesh = escalatorEnds.down[floor];
            if (!startMesh || !endMesh) continue;
            
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

        // NEW: Animate up escalator steps along their creation angle.
        for (const floor in escalatorSteps.up) {
            const steps = escalatorSteps.up[floor];
            const startMesh = escalatorStarts.up[floor];
            const endMesh = escalatorEnds.up[floor];
            if (!startMesh || !endMesh) continue;

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


// --- Start the application ---
init();

const enemyGeometry = new THREE.BoxGeometry(1, 2, 1); // Example geometry for an enemy
const enemyMaterial = new THREE.MeshStandardMaterial({ color: 0xff0000 }); // Example material for an enemy

//const enemy = new THREE.Mesh(enemyGeometry, enemyMaterial);
//enemy.position.set(x, y, z); // Set the enemy's position
//scene.add(enemy);
//enemies.push(enemy); // Add the enemy to the array