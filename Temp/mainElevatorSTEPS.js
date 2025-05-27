import * as THREE from 'three';
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';

// --- Game Settings ---
const SETTINGS = {
    numFloors: 3,
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
    roomSize: 4.0,
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
    const wallMaterial = new THREE.MeshStandardMaterial({ color: 0xcccccc });
    const ceilingMaterial = new THREE.MeshStandardMaterial({ color: 0xbbbbbb });
    const blackDoorMaterial = new THREE.MeshStandardMaterial({ color: 0x111111 });
    const redDoorMaterial = new THREE.MeshStandardMaterial({ color: 0xff0000 });
    const elevatorMaterial = new THREE.MeshStandardMaterial({ color: 0xaa1111 });
    const lightBulbMaterial = new THREE.MeshStandardMaterial({ color: 0xFFFFEE, emissive: 0xFFFFDD, emissiveIntensity: 1 }); // Glowing bulb
    
    const EscalatorMaterial = new THREE.MeshStandardMaterial({ color: 0x222222 });
    const EscalatorEmbarkMaterial = new THREE.MeshStandardMaterial({ color: 0xaa0000 });

    // Store references globally for use in updatePlayer
    window.EscalatorMaterial = EscalatorMaterial;
    window.EscalatorEmbarkMaterial = EscalatorEmbarkMaterial;

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
    const RoofWallRGeo = new THREE.BoxGeometry(wallDepth, SETTINGS.floorHeight*2, elevatorSize); // Wall depth and height
    //const RoofWallRMaterial = new THREE.MeshStandardMaterial({ color: 0xcccccc });
    const RoofWallR = new THREE.Mesh(RoofWallRGeo, wallMaterial);
    RoofWallR.position.set(0, (SETTINGS.numFloors) * SETTINGS.floorHeight, -elevatorSize / 2); // Elevator shaft wall
    RoofWallR.castShadow = true;
    RoofWallR.receiveShadow = true;
    scene.add(RoofWallR);
    worldObjects.push(RoofWallR);

    // left Wall next to elevator shaft on Roof (Negative Z direction)
    //const segmentZ = -SETTINGS.corridorWidth / 2 + doorOffset / 2;
    const RoofWallLGeo = new THREE.BoxGeometry(wallDepth, SETTINGS.floorHeight*2, elevatorSize); // Wall depth and height
    //const RoofWallMaterial = new THREE.MeshStandardMaterial({ color: 0xcccccc });
    const RoofWallL = new THREE.Mesh(RoofWallLGeo, wallMaterial);
    RoofWallL.position.set(SETTINGS.corridorWidth, (SETTINGS.numFloors) * SETTINGS.floorHeight, -elevatorSize / 2); // Elevator shaft wall
    RoofWallL.castShadow = true;
    RoofWallL.receiveShadow = true;
    scene.add(RoofWallL);
    worldObjects.push(RoofWallL);

    // Roof of elevator shaft on Roof
    //const segmentZ = -SETTINGS.corridorWidth / 2 + doorOffset / 2;
    const topRoofGeo = new THREE.BoxGeometry(SETTINGS.corridorWidth, floorDepth, elevatorSize); // Roof dimensions
    //const RoofWallMaterial = new THREE.MeshStandardMaterial({ color: 0xcccccc });
    const topRoof = new THREE.Mesh(topRoofGeo, wallMaterial);
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

            // --- Left  side Escalator down Starting Point (RED) ---
            const startEscDownGeo = new THREE.BoxGeometry(escalatorWidth, floorDepth, 1); // <-- Add this line
            const startEscDown = new THREE.Mesh(startEscDownGeo, EscalatorEmbarkMaterial);
            startEscDown.name = `Left Escalator Down Start ${i}`;
            //start1Esc.rotation.x = -Math.PI / 2;
            startEscDown.position.set(
                SETTINGS.corridorWidth + escalatorWidth / 2,
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
                    SETTINGS.corridorWidth + stepWidth / 2,
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
                SETTINGS.corridorWidth + (escalatorWidth / 2),
                floorY - SETTINGS.floorHeight -(floorDepth/2), // So the top is at previous floorY
                totalCorridorLength + escalatorLength + 4 + 0.5
            );
            endEscDown.receiveShadow = true;
            scene.add(endEscDown);
            worldObjects.push(endEscDown);


            // --- End of Left side Escalator Down on lower floor Ending Point --- ///

            // --- Right side Escalator going Up on Lower floor Starting Point (RED) ---

            const startEscUpGeo = new THREE.BoxGeometry(escalatorWidth, floorDepth, 1);
            const startEscUp = new THREE.Mesh(startEscUpGeo, EscalatorEmbarkMaterial);
            startEscUp.name = `Right Escalator Up Start ${i}`;
            //start1Esc.rotation.x = -Math.PI / 2;
            startEscUp.position.set(
                -escalatorWidth / 2,
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
                const y = floorY +.01 - (s + 1) * stepHeight + stepHeight / 2;
                const z = totalCorridorLength + 4.3 + (s / stepCount) * SETTINGS.escalatorLength;
                const stepGeo = new THREE.BoxGeometry(stepWidth, stepHeight, stepDepth);
                const stepUp = new THREE.Mesh(stepGeo, EscalatorMaterial);
                stepUp.position.set(
                    -stepWidth / 2,
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
                - escalatorWidth / 2,
                floorY -(floorDepth/2), // So the top is at floorY
                totalCorridorLength  + 3.5
            );
            endEscUp.receiveShadow = true;
            scene.add(endEscUp);
            worldObjects.push(endEscUp);
        
            // END OF RIGHT SIDE ESCALATOR RAMP GOING UP FROM LOWER FLOOR ////////////////////////////////////////
            
            
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
        const wallDepth = 0.1;
        const doorOffset = (SETTINGS.corridorSegmentLength - SETTINGS.doorWidth) / 2;

        // Right Wall next to elevator shaft (Negative Z direction)
        const segmentZ = -SETTINGS.corridorWidth / 2 + doorOffset / 2;
        const wallRGeo = new THREE.BoxGeometry(wallDepth, SETTINGS.floorHeight, elevatorSize); // Wall depth and height
        const wallMaterial = new THREE.MeshStandardMaterial({ color: 0xcccccc });
        const wallR = new THREE.Mesh(wallRGeo, wallMaterial);
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

            // Door
            const isRed = currentDoorIndex === redDoorIndex;
            const doorMaterial = isRed ? redDoorMaterial : blackDoorMaterial;
            const doorGeo = new THREE.BoxGeometry(SETTINGS.doorDepth, SETTINGS.doorHeight, SETTINGS.doorWidth);
            const door = new THREE.Mesh(doorGeo, doorMaterial);
            door.position.set(0, floorY + SETTINGS.doorHeight / 2, segmentZ);
            door.castShadow = true;
            door.userData = { type: 'door', floor: i, isRed: isRed }; // Store info
            door.name = `${i + 1}${String(currentDoorIndex + 1).padStart(2, '0')}`; // Assign door number
            scene.add(door);
            doors.push(door); // Keep track of doors for interaction
            // Note: Doors aren't added to worldObjects for collision initially

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

            // Door
            const isRed = currentDoorIndex === redDoorIndex;
            const doorMaterial = isRed ? redDoorMaterial : blackDoorMaterial;
            const doorGeo = new THREE.BoxGeometry(SETTINGS.doorDepth, SETTINGS.doorHeight, SETTINGS.doorWidth);
            const door = new THREE.Mesh(doorGeo, doorMaterial);
            door.position.set(LeftWallX, floorY + SETTINGS.doorHeight / 2, segmentZ);
            door.castShadow = true;
            door.userData = { type: 'door', floor: i, isRed: isRed }; // Store info
            door.name = `${i + 1}${String(currentDoorIndex + 1).padStart(2, '0')}`; // Assign door number
            scene.add(door);
            doors.push(door);

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

        // wall needs opening for elevator!
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

    // --- New: Check if player is on elevator roof and gets crushed against top roof ---
    if (elevator.userData.roof) {
        // Find the top roof object above the elevator
        const topRoof = worldObjects.find(obj =>
            obj.name === "Top Roof over Elevator"
        );
        if (topRoof) {
            // Player is on elevator roof if their y is near the elevator roof's y
            const playerIsOnElevatorRoof =
                Math.abs(playerPos.x - elevator.userData.roof.position.x) < (SETTINGS.corridorWidth / 2) &&
                Math.abs(playerPos.z - elevator.userData.roof.position.z) < (SETTINGS.corridorWidth / 2) &&
                Math.abs(playerPos.y - (elevator.userData.roof.position.y + playerHeight)) < 0.3;

            // Elevator roof is moving up and will touch the top roof
            const roofCurrentY = elevator.userData.roof.position.y;
            const roofNextY = nextY + SETTINGS.wallHeight;
            const topRoofY = topRoof.position.y - (topRoof.geometry.parameters.height / 2 || 0);

            // Check if elevator roof is about to touch or pass the top roof
            const willCrush =
                playerIsOnElevatorRoof &&
                roofCurrentY < topRoofY &&
                roofNextY >= topRoofY;

            if (willCrush) {
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

    const intersects = raycaster.intersectObjects(doors); // Only check doors

    if (intersects.length > 0) {
        const intersectedDoor = intersects[0].object;
        const distance = intersects[0].distance;

        if (distance < 3) { // Interaction range
            const doorData = intersectedDoor.userData;
            console.log(`Interacting with door on floor ${doorData.floor}. Red: ${doorData.isRed}`);
            if (doorData.isRed) {
                 console.log("SUCCESS! Found the documents!");
                 // Add game winning logic here
                 alert("SUCCESS! You found the documents!");
            } else {
                console.log("An enemy might be behind this door!");
                 // Add enemy encounter logic here
                 alert("An enemy jumps out! (Placeholder)");
            }
             // Optional: Add door opening animation here
        }
    }
}

function shoot() {
    if (!controls.isLocked) return;

    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2(0, 0); // Center of the screen
    raycaster.setFromCamera(pointer, camera);

    // Check for intersections with all objects in the scene
    const intersects = raycaster.intersectObjects([...lights, ...worldObjects], true);

    if (intersects.length > 0) {
        const hit = intersects[0];
        const hitObject = hit.object;

        // Create a bullet hole at the hit point
        createBulletHole(hit.point, hit.face.normal);

        // Check if the hit object is part of a light
        const lightGroup = hitObject.parent;
        if (lights.includes(lightGroup)) {
            destroyLight(lightGroup);
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

    // Calculate potential new position for X and Z
    const deltaX = moveDirection.x * speed;
    const deltaZ = moveDirection.z * speed;

    // --- Basic Collision Detection (Simple - Check X and Z separately) ---
    // Store original position
    const originalPosition = cameraObject.position.clone();

    // Move X
    cameraObject.position.x += deltaX;
    if (checkCollision()) {
        cameraObject.position.x = originalPosition.x; // Revert X if collision
    }

    // Move Z
    cameraObject.position.z += deltaZ;
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
