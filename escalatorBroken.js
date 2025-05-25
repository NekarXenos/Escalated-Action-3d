import * as THREE from 'three';

// Helper function (can be kept local if only used here)
function isPlayerOnMesh(playerPos, playerHeight, mesh) {
    if (!mesh || !mesh.geometry) return false;
    if (!mesh.geometry.boundingBox) {
        mesh.geometry.computeBoundingBox();
    }
    const meshBox = mesh.geometry.boundingBox.clone().applyMatrix4(mesh.matrixWorld);
    // Use a small box for the player feet
    const playerBox = new THREE.Box3().setFromCenterAndSize(
        new THREE.Vector3(playerPos.x, playerPos.y - playerHeight / 2, playerPos.z),
        new THREE.Vector3(0.5, 0.2, 0.5) // width, height, depth of player's feet collision box
    );
    return meshBox.intersectsBox(playerBox);
}

export function createEscalatorsForFloor(config) {
    const {
        floorIndex,
        scene,
        worldObjects,
        materials,
        settings,
        totalCorridorLength,
        lightsRef,
        lightBulbMaterial,
        escalatorSteps,
        escalatorStarts,
        escalatorEnds,
        createStandardLampFn // Passed createStandardLamp function
    } = config;

    const floorY = floorIndex * settings.floorHeight;
    const floorDepth = settings.floorHeight - settings.wallHeight; // Calculate floorDepth here
    const escalatorLength = settings.escalatorLength;
    const escalatorWidth = settings.escalatorWidth;
    const yAxis = new THREE.Vector3(0, 1, 0);

    // Define the pivot point for Wing B rotation (X and Z are constant, Y is floor-dependent)
    const pivotX = settings.corridorWidth / 2;
    const pivotZ = -8;
    // The Y-coordinate of the pivot will be floorY for simplicity,
    // meaning objects rotate around the horizontal plane of the current floor.
    const mainPivotPoint = new THREE.Vector3(pivotX, floorY, pivotZ);

    // Helper function to duplicate and rotate a mesh for Wing B
    function duplicateAndRotate(originalMesh, pivotVec, isLight = false) {
        const clone = originalMesh.clone();
        clone.name = originalMesh.name + "_B";

        // Transform position
        clone.position.sub(pivotVec);
        clone.position.applyAxisAngle(yAxis, Math.PI);
        clone.position.add(pivotVec);

        // Transform rotation
        clone.rotation.y += Math.PI;

        scene.add(clone);
        // Only add to worldObjects if the original was (and it's not a light's pointlight source)
        if (!isLight && worldObjects.includes(originalMesh)) {
            worldObjects.push(clone);
        }
        return clone;
    }

    // Escalator Area Floor Slabs & Lights (conditionally generated)
    const needsEscalatorPlatformsThisFloor =
        (floorIndex > 0 && floorIndex < settings.numFloors) ||
        ((floorIndex + 1) > 0 && (floorIndex + 1) < settings.numFloors);

    if (needsEscalatorPlatformsThisFloor) {
        let floorB1Esc, bridgeB2Esc, floorB2Esc; // Declare for later use by duplication logic if any


        // Escalator Floor Start
        const floorEsc1Geo = new THREE.BoxGeometry(settings.corridorWidth + (escalatorWidth * 2), floorDepth, 4 - 1);
        const floor1Esc = new THREE.Mesh(floorEsc1Geo, materials.floorMaterial);
        floor1Esc.name = `Escalator Floor Start ${floorIndex}`;
        floor1Esc.position.set(settings.corridorWidth / 2, floorY - floorDepth / 2, totalCorridorLength + 1.5);
        floor1Esc.receiveShadow = true; scene.add(floor1Esc); worldObjects.push(floor1Esc);

        // Wing B version (cloned and rotated)
        const floor1Esc_B = duplicateAndRotate(floor1Esc, mainPivotPoint);

        const escStartZ = floor1Esc.position.z;
        const escLightY = floorY + settings.wallHeight - 0.5; // Common Y for these lights
        const escLightXs = [-escalatorWidth / 2, settings.corridorWidth + (escalatorWidth / 2)]; // X offsets from corridor center
        escLightXs.forEach((xPos, idx) => {
            createStandardLampFn(
                xPos,
                escLightY,
                escStartZ,
                floorIndex,
                `EscStart_F${floorIndex}_Idx${idx + 1}`,
                scene, lightsRef, lightBulbMaterial
            );
            // Create Wing B lights by transforming original light positions
            const lightPosOriginal = new THREE.Vector3(xPos, escLightY, escStartZ);
            const lightPosTransformed = lightPosOriginal.clone().sub(mainPivotPoint).applyAxisAngle(yAxis, Math.PI).add(mainPivotPoint);
            createStandardLampFn(
                lightPosTransformed.x,
                lightPosTransformed.y,
                lightPosTransformed.z,
                floorIndex,
                `EscStart_B_F${floorIndex}_Idx${idx + 1}`,
                scene, lightsRef, lightBulbMaterial
            );
        });

        // The original floorB1Esc, bridgeB2Esc, floorB2Esc are now created by cloning
        // floorB1Esc = floor1Esc_B; // Assign if needed elsewhere, though direct use of floor1Esc_B is fine

        // Note: The original direct creation of floorB1Esc, bridgeB2Esc, floorB2Esc
        // and their lights has been removed/replaced by the cloning logic above and below.

        // Escalator Floor bridge
        const bridge2EscGeo = new THREE.BoxGeometry(settings.corridorWidth, floorDepth, escalatorLength + 3);
        const bridge2Esc = new THREE.Mesh(bridge2EscGeo, materials.floorMaterial);
        bridge2Esc.name = `Escalator Floor Bridge ${floorIndex}`;
        bridge2Esc.position.set(settings.corridorWidth / 2, floorY - floorDepth / 2, totalCorridorLength + 4 + (escalatorLength / 2) + 0.5);
        bridge2Esc.receiveShadow = true; scene.add(bridge2Esc); worldObjects.push(bridge2Esc);
        // Wing B version
        const bridge2Esc_B = duplicateAndRotate(bridge2Esc, mainPivotPoint);

        // Escalator Floor End
        const floorEsc2Geo = new THREE.BoxGeometry(settings.corridorWidth + (escalatorWidth * 2), floorDepth, 4 - 1);
        const floor2Esc = new THREE.Mesh(floorEsc2Geo, materials.floorMaterial);
        floor2Esc.name = `Escalator Floor End ${floorIndex}`;
        floor2Esc.position.set(settings.corridorWidth / 2, floorY - floorDepth / 2, totalCorridorLength + 4 + escalatorLength + 2.5);
        floor2Esc.receiveShadow = true; scene.add(floor2Esc); worldObjects.push(floor2Esc);
        // Wing B version
        const floor2Esc_B = duplicateAndRotate(floor2Esc, mainPivotPoint);

        const escEndZ = floor2Esc.position.z;
        escLightXs.forEach((xPos, idx) => {
            createStandardLampFn(
                xPos,
                escLightY,
                escEndZ,
                floorIndex,
                `EscEnd_F${floorIndex}_Idx${idx + 1}`,
                scene, lightsRef, lightBulbMaterial
            );
            // Wing B lights
            const lightPosOriginal = new THREE.Vector3(xPos, escLightY, escEndZ);
            const lightPosTransformed = lightPosOriginal.clone().sub(mainPivotPoint).applyAxisAngle(yAxis, Math.PI).add(mainPivotPoint);
            createStandardLampFn(
                lightPosTransformed.x,
                lightPosTransformed.y,
                lightPosTransformed.z,
                floorIndex,
                `EscEnd_B_F${floorIndex}_Idx${idx + 1}`,
                scene, lightsRef, lightBulbMaterial
            );
        });
    }

    // --- Escalator Steps (replace ramps with steps) ---
    if (floorIndex > -settings.numBasementFloors && floorIndex <= settings.numFloors - 1) {
        const stepHeight = 0.4;
        const stepDepth = 1;
        const stepCount = Math.ceil(1 + (settings.floorHeight / stepHeight));
        const stepWidth = settings.escalatorWidth;

        const balustradeHeight = 1.7;
        const balustradeThickness = 0.1;

        // Initialize Wing B structures if not already
        if (!escalatorStarts.down_B) escalatorStarts.down_B = {};
        if (!escalatorSteps.down_B) escalatorSteps.down_B = {};
        if (!escalatorEnds.down_B) escalatorEnds.down_B = {};

        if (floorIndex > 0 && floorIndex < settings.numFloors) {
            // --- Left side Escalator down Starting Point (RED) ---
            const startEscDownGeo = new THREE.BoxGeometry(escalatorWidth, floorDepth, 1);
            const startEscDown = new THREE.Mesh(startEscDownGeo, materials.escalatorEmbarkMaterial);
            startEscDown.name = `Left Escalator Down Start ${floorIndex}`;
            startEscDown.position.set(
                settings.corridorWidth + (escalatorWidth / 2) + 0.1,
                floorY - (floorDepth / 2),
                totalCorridorLength + 3.5
            );
            startEscDown.receiveShadow = true;
            scene.add(startEscDown);
            worldObjects.push(startEscDown);
            escalatorStarts.down[floorIndex] = startEscDown;
            const startEscDown_B = duplicateAndRotate(startEscDown, mainPivotPoint);
            escalatorStarts.down_B[floorIndex] = startEscDown_B;
            escalatorSteps.down[floorIndex] = [];
            escalatorSteps.down_B[floorIndex] = [];

            // --- Steps DOWN (LEFT side) ---
            for (let s = 0; s < stepCount; s++) {
                const y = floorY - .01 - (s + 1) * stepHeight + stepHeight / 2;
                const z = totalCorridorLength + 4.3 + (s / stepCount) * settings.escalatorLength;
                const stepGeo = new THREE.BoxGeometry(stepWidth, stepHeight, stepDepth);
                const stepDown = new THREE.Mesh(stepGeo, materials.escalatorMaterial);
                stepDown.position.set(
                    settings.corridorWidth + (stepWidth / 2) + 0.1,
                    y,
                    z
                );
                stepDown.castShadow = true;
                stepDown.receiveShadow = true;
                stepDown.name = `Left Escalator Step Down ${floorIndex}-${s}`;
                scene.add(stepDown);
                worldObjects.push(stepDown);
                escalatorSteps.down[floorIndex].push(stepDown);
                const stepDown_B = duplicateAndRotate(stepDown, mainPivotPoint);
                escalatorSteps.down_B[floorIndex].push(stepDown_B);
            }

            const endEscDownGeo = new THREE.BoxGeometry(escalatorWidth, floorDepth, 1);
            const endEscDown = new THREE.Mesh(endEscDownGeo, materials.escalatorMaterial);
            endEscDown.name = `Left Escalator Down End ${floorIndex}`;
            endEscDown.position.set(
                settings.corridorWidth + (escalatorWidth / 2) + 0.1,
                floorY - settings.floorHeight - (floorDepth / 2),
                totalCorridorLength + escalatorLength + 4 + 0.5
            );
            endEscDown.receiveShadow = true;
            scene.add(endEscDown);
            worldObjects.push(endEscDown);
            escalatorEnds.down[floorIndex] = endEscDown;
            const endEscDown_B = duplicateAndRotate(endEscDown, mainPivotPoint);
            escalatorEnds.down_B[floorIndex] = endEscDown_B;

            // --- Right side Escalator going Up on Lower floor Starting Point (RED) ---
            const startEscUpGeo = new THREE.BoxGeometry(escalatorWidth, floorDepth, 1);
            const startEscUp = new THREE.Mesh(startEscUpGeo, materials.escalatorEmbarkMaterial);
            startEscUp.name = `Right Escalator Up Start ${floorIndex}`;
            startEscUp.position.set(
                -0.1 - (escalatorWidth / 2),
                floorY - settings.floorHeight - (floorDepth / 2),
                totalCorridorLength + escalatorLength + 4 + 0.5
            );
            startEscUp.receiveShadow = true;
            scene.add(startEscUp);
            worldObjects.push(startEscUp);
            escalatorStarts.up[floorIndex] = startEscUp;
            const startEscUp_B = duplicateAndRotate(startEscUp, mainPivotPoint);
            escalatorStarts.up_B[floorIndex] = startEscUp_B;
            escalatorSteps.up[floorIndex] = [];
            escalatorSteps.up_B[floorIndex] = [];

            // --- Steps UP (RIGHT side) ---
            for (let s = 0; s < stepCount; s++) {
                const y = floorY + 0.01 - (s + 1) * stepHeight + stepHeight / 2;
                const z = totalCorridorLength + 4.3 + (s / stepCount) * settings.escalatorLength;
                const stepGeo = new THREE.BoxGeometry(stepWidth, stepHeight, stepDepth);
                const stepUp = new THREE.Mesh(stepGeo, materials.escalatorMaterial);
                stepUp.position.set(
                    -0.1 - (stepWidth / 2),
                    y,
                    z
                );
                stepUp.castShadow = true;
                stepUp.receiveShadow = true;
                stepUp.name = `Right Escalator Step Up ${floorIndex}-${s}`;
                scene.add(stepUp);
                worldObjects.push(stepUp);
                escalatorSteps.up[floorIndex].push(stepUp);
                const stepUp_B = duplicateAndRotate(stepUp, mainPivotPoint);
                escalatorSteps.up_B[floorIndex].push(stepUp_B);
            }

            const endEscUpGeo = new THREE.BoxGeometry(escalatorWidth, floorDepth, 1);
            const endEscUp = new THREE.Mesh(endEscUpGeo, materials.escalatorMaterial);
            endEscUp.name = `Right Escalator Up End ${floorIndex}`;
            endEscUp.position.set(
                -0.1 - (escalatorWidth / 2),
                floorY - (floorDepth / 3) - 0.08,
                totalCorridorLength + 3.5
            );
            endEscUp.receiveShadow = true;
            scene.add(endEscUp);
            worldObjects.push(endEscUp);
            const endEscUp_B = duplicateAndRotate(endEscUp, mainPivotPoint);

            const translatedEndEscUp = endEscUp.clone();
            translatedEndEscUp.position.y += 0.2;
            translatedEndEscUp.position.z += 0.3;
            escalatorEnds.up[floorIndex] = translatedEndEscUp;
            const translatedEndEscUp_B = duplicateAndRotate(translatedEndEscUp, mainPivotPoint); // Transform the translated version for Wing B
            escalatorEnds.up_B[floorIndex] = translatedEndEscUp_B;

            // --- Add Balustrades ---
            const currentFloorTopY = floorY;
            const lowerFloorTopY = (floorIndex - 1) * settings.floorHeight;

            // Balustrades for Escalator UP (Left side, X from -escalatorWidth to 0)
            const startUpBalustrade = new THREE.Vector3(-settings.escalatorWidth / 2, lowerFloorTopY - floorDepth, totalCorridorLength + settings.escalatorLength + 4);
            const endUpBalustrade = new THREE.Vector3(-settings.escalatorWidth / 2, currentFloorTopY - floorDepth / 2, totalCorridorLength + 3.5);
            const dirUpBalustrade = new THREE.Vector3().subVectors(endUpBalustrade, startUpBalustrade);
            const lengthUpBalustrade = dirUpBalustrade.length();
            const centerPosUpBalustrade = new THREE.Vector3().addVectors(startUpBalustrade, endUpBalustrade).multiplyScalar(0.5);
            const centerZ_UpBalustrade = centerPosUpBalustrade.z;
            const rampSurfaceY_at_centerZ_Up = startUpBalustrade.y + (centerZ_UpBalustrade - startUpBalustrade.z) / (endUpBalustrade.z - startUpBalustrade.z) * (endUpBalustrade.y - startUpBalustrade.y);
            const balustradeCenterY_Up = rampSurfaceY_at_centerZ_Up + balustradeHeight / 2;

            const innerBalustradeUpGeo = new THREE.BoxGeometry(balustradeThickness, balustradeHeight, lengthUpBalustrade);
            const innerBalustradeUp = new THREE.Mesh(innerBalustradeUpGeo, materials.balustradeMaterial);
            innerBalustradeUp.name = `Balustrade_Up_Inner_F${floorIndex - 1}-F${floorIndex}`;
            innerBalustradeUp.position.set(0 - balustradeThickness / 2, balustradeCenterY_Up, centerPosUpBalustrade.z);
            innerBalustradeUp.lookAt(innerBalustradeUp.position.clone().add(dirUpBalustrade));
            scene.add(innerBalustradeUp); worldObjects.push(innerBalustradeUp);
            const innerBalustradeUp_B = duplicateAndRotate(innerBalustradeUp, mainPivotPoint);

            const outerBalustradeUpGeo = new THREE.BoxGeometry(balustradeThickness, balustradeHeight, lengthUpBalustrade);
            const outerBalustradeUp = new THREE.Mesh(outerBalustradeUpGeo, materials.balustradeMaterial);
            outerBalustradeUp.name = `Balustrade_Up_Outer_F${floorIndex - 1}-F${floorIndex}`;
            outerBalustradeUp.position.set(-settings.escalatorWidth + balustradeThickness / 2, balustradeCenterY_Up, centerPosUpBalustrade.z);
            outerBalustradeUp.lookAt(outerBalustradeUp.position.clone().add(dirUpBalustrade));
            scene.add(outerBalustradeUp); worldObjects.push(outerBalustradeUp);
            const outerBalustradeUp_B = duplicateAndRotate(outerBalustradeUp, mainPivotPoint);


            const cylinderGeo = new THREE.CylinderGeometry(balustradeHeight / 2, balustradeHeight / 2, balustradeThickness, 16);
            cylinderGeo.rotateZ(Math.PI / 2);
            const upDir = new THREE.Vector3().subVectors(endUpBalustrade, startUpBalustrade).normalize();
            const halfLengthUp = lengthUpBalustrade / 2;
            [innerBalustradeUp, outerBalustradeUp].forEach(balustrade => {
                const center = balustrade.position.clone();
                const end1 = center.clone().sub(upDir.clone().multiplyScalar(halfLengthUp));
                const end2 = center.clone().add(upDir.clone().multiplyScalar(halfLengthUp));
                const cylinder1 = new THREE.Mesh(cylinderGeo, materials.balustradeMaterial);
                cylinder1.position.copy(end1);
                const cylinder2 = new THREE.Mesh(cylinderGeo, materials.balustradeMaterial);
                cylinder2.position.copy(end2);
                scene.add(cylinder1); scene.add(cylinder2); // Add Wing A cylinders
                duplicateAndRotate(cylinder1, mainPivotPoint); // Create Wing B cylinders
                duplicateAndRotate(cylinder2, mainPivotPoint);
            });

            // Balustrades for Escalator DOWN
            const startDownBalustrade = new THREE.Vector3(settings.corridorWidth + settings.escalatorWidth / 2, currentFloorTopY - floorDepth / 2, totalCorridorLength + 3.5);
            const endDownBalustrade = new THREE.Vector3(settings.corridorWidth + settings.escalatorWidth / 2, lowerFloorTopY - floorDepth, totalCorridorLength + settings.escalatorLength + 4);
            const dirDownBalustrade = new THREE.Vector3().subVectors(endDownBalustrade, startDownBalustrade);
            const lengthDownBalustrade = dirDownBalustrade.length();
            const centerPosDownBalustrade = new THREE.Vector3().addVectors(startDownBalustrade, endDownBalustrade).multiplyScalar(0.5);
            const centerZ_DownBalustrade = centerPosDownBalustrade.z;
            const rampSurfaceY_at_centerZ_Down = startDownBalustrade.y + (centerZ_DownBalustrade - startDownBalustrade.z) / (endDownBalustrade.z - startDownBalustrade.z) * (endDownBalustrade.y - startDownBalustrade.y);
            const balustradeCenterY_Down = rampSurfaceY_at_centerZ_Down + balustradeHeight / 2;

            const innerBalustradeDownGeo = new THREE.BoxGeometry(balustradeThickness, balustradeHeight, lengthDownBalustrade);
            const innerBalustradeDown = new THREE.Mesh(innerBalustradeDownGeo, materials.balustradeMaterial);
            innerBalustradeDown.name = `Balustrade_Down_Inner_F${floorIndex}-F${floorIndex - 1}`;
            innerBalustradeDown.position.set(settings.corridorWidth + balustradeThickness / 2, balustradeCenterY_Down, centerPosDownBalustrade.z);
            innerBalustradeDown.lookAt(innerBalustradeDown.position.clone().add(dirDownBalustrade));
            scene.add(innerBalustradeDown); worldObjects.push(innerBalustradeDown);
            const innerBalustradeDown_B = duplicateAndRotate(innerBalustradeDown, mainPivotPoint);

            const outerBalustradeDownGeo = new THREE.BoxGeometry(balustradeThickness, balustradeHeight, lengthDownBalustrade);
            const outerBalustradeDown = new THREE.Mesh(outerBalustradeDownGeo, materials.balustradeMaterial);
            outerBalustradeDown.name = `Balustrade_Down_Outer_F${floorIndex}-F${floorIndex - 1}`;
            outerBalustradeDown.position.set(settings.corridorWidth + settings.escalatorWidth - balustradeThickness / 2, balustradeCenterY_Down, centerPosDownBalustrade.z);
            outerBalustradeDown.lookAt(outerBalustradeDown.position.clone().add(dirDownBalustrade));
            scene.add(outerBalustradeDown); worldObjects.push(outerBalustradeDown);
            const outerBalustradeDown_B = duplicateAndRotate(outerBalustradeDown, mainPivotPoint);

            const downDir = new THREE.Vector3().subVectors(endDownBalustrade, startDownBalustrade).normalize();
            const halfLengthDown = lengthDownBalustrade / 2;
            [innerBalustradeDown, outerBalustradeDown].forEach(balustrade => {
                const center = balustrade.position.clone();
                const end1 = center.clone().sub(downDir.clone().multiplyScalar(halfLengthDown));
                const end2 = center.clone().add(downDir.clone().multiplyScalar(halfLengthDown));
                const cylinder1 = new THREE.Mesh(cylinderGeo, materials.balustradeMaterial);
                cylinder1.position.copy(end1);
                const cylinder2 = new THREE.Mesh(cylinderGeo, materials.balustradeMaterial);
                cylinder2.position.copy(end2);
                scene.add(cylinder1); scene.add(cylinder2); // Add Wing A cylinders
                duplicateAndRotate(cylinder1, mainPivotPoint); // Create Wing B cylinders
                duplicateAndRotate(cylinder2, mainPivotPoint);
            });
        }
    }
 }

export function updateEscalatorStepVisuals(playerWorldPos, playerHeight, playerOnEscalatorState, escalatorSteps, escalatorStarts, escalatorEnds, settings, materials) {
    let determinedEscalator = { type: null, floor: null };
    let playerIsOnAnEscalatorSystem = false;
    const escalatorTypesToCheck = ['up', 'down', 'up_B', 'down_B'];
    // 1. Check start plates
    for (const type of escalatorTypesToCheck) {
        if (escalatorStarts[type]) {
            for (const [floor, mesh] of Object.entries(escalatorStarts[type])) {
                if (mesh && isPlayerOnMesh(playerWorldPos, playerHeight, mesh)) {
                    determinedEscalator = { type, floor: parseInt(floor) };
                    playerIsOnAnEscalatorSystem = true;
                    break;
                }
            }
        }
        if (playerIsOnAnEscalatorSystem) break;
    }
    // 2. If not on a start plate, check if on any steps
    if (!playerIsOnAnEscalatorSystem) {
        for (const type of escalatorTypesToCheck) {
            if (escalatorSteps[type]) {
                for (const [floor, stepsArray] of Object.entries(escalatorSteps[type])) {
                    if (stepsArray) {
                        for (const stepMesh of stepsArray) {
                            if (stepMesh && isPlayerOnMesh(playerWorldPos, playerHeight, stepMesh)) {
                                determinedEscalator = { type, floor: parseInt(floor) };
                                playerIsOnAnEscalatorSystem = true;
                                break;
                            }
                        }
                    }
                    if (playerIsOnAnEscalatorSystem) break;
                }
            }
            if (playerIsOnAnEscalatorSystem) break;
        }
    }
    // 3. Check end plates if not detected yet
    if (!playerIsOnAnEscalatorSystem) {
        for (const type of escalatorTypesToCheck) {
            if (escalatorEnds[type]) {
                for (const [floor, mesh] of Object.entries(escalatorEnds[type])) {
                    if (mesh && isPlayerOnMesh(playerWorldPos, playerHeight, mesh)) {
                        determinedEscalator = { type, floor: parseInt(floor) };
                        playerIsOnAnEscalatorSystem = true;
                        break;
                    }
                }
            }
            if (playerIsOnAnEscalatorSystem) break;
        }
    }

    if (playerOnEscalatorState.type !== determinedEscalator.type || playerOnEscalatorState.floor !== determinedEscalator.floor) {
        // Reset all steps of all types to default material
        escalatorTypesToCheck.forEach(type => {
            if (escalatorSteps[type]) {
                for (const steps of Object.values(escalatorSteps[type])) {
                    if (steps) steps.forEach(step => { step.material = materials.escalatorMaterial; });
                }
            }
        });

        // If player IS on a specific escalator system, change ITS steps to embark material
        if (playerIsOnAnEscalatorSystem && determinedEscalator.type && determinedEscalator.floor !== null) {
            if (escalatorSteps[determinedEscalator.type] && escalatorSteps[determinedEscalator.type][determinedEscalator.floor]) {
                escalatorSteps[determinedEscalator.type][determinedEscalator.floor].forEach(step => {
                    step.material = materials.escalatorEmbarkMaterial;
                });
            }
        }
        playerOnEscalatorState.type = determinedEscalator.type;
        playerOnEscalatorState.floor = determinedEscalator.floor;
    }
}

export function calculateEscalatorBoost(cameraObject, playerHeight, escalatorSteps, escalatorStarts, escalatorEnds, settings, deltaTime) { // Added playerHeight
    let escalatorBoost = new THREE.Vector3(0, 0, 0);
    // Raycasting from camera's current position might be problematic if player is crouched.
    // It's better to cast from slightly above the player's feet.
    const rayOrigin = cameraObject.position.clone(); // This is eye level
    rayOrigin.y -= (playerHeight - 0.1); // Adjust to cast from near feet level. 0.1 is a small offset.

    const rayDirection = new THREE.Vector3(0, -1, 0);
    const raycaster = new THREE.Raycaster(rayOrigin, rayDirection, 0, 0.3); // Shorter ray, just to detect ground

    let allInteractiveParts = [];
    ['up', 'down', 'up_B', 'down_B'].forEach(type => {
        if (escalatorStarts[type]) {
            for (const key in escalatorStarts[type]) { if(escalatorStarts[type][key]) allInteractiveParts.push(escalatorStarts[type][key]); }
        }
        if (escalatorSteps[type]) {
            for (const key in escalatorSteps[type]) { if(escalatorSteps[type][key]) allInteractiveParts = allInteractiveParts.concat(escalatorSteps[type][key]); }
        }
        if (escalatorEnds[type]) {
            for (const key in escalatorEnds[type]) { if(escalatorEnds[type][key]) allInteractiveParts.push(escalatorEnds[type][key]); }
        }
    });

    const intersections = raycaster.intersectObjects(allInteractiveParts, false);

    if (intersections.length > 0) {
        const hitObject = intersections[0].object;
        let foundType = null;
        let foundFloor = null;

        // Determine which escalator system the hitObject belongs to
        for (const type of ['up', 'down', 'up_B', 'down_B']) {
            if (escalatorStarts[type]) {
                for (const floor in escalatorStarts[type]) {
                    if (escalatorStarts[type][floor] === hitObject) {
                        foundType = type; foundFloor = floor; break;
                    }
                }
            }
            if (foundType) break;
            if (escalatorSteps[type]) {
                for (const floor in escalatorSteps[type]) {
                    if (escalatorSteps[type][floor] && escalatorSteps[type][floor].includes(hitObject)) {
                        foundType = type; foundFloor = floor; break;
                    }
                }
            }
            if (foundType) break;
            if (escalatorEnds[type]) {
                for (const floor in escalatorEnds[type]) {
                    if (escalatorEnds[type][floor] === hitObject) {
                        foundType = type; foundFloor = floor; break;
                    }
                }
            }
            if (foundType) break;
        }


        if (foundType && foundFloor && escalatorStarts[foundType]?.[foundFloor] && escalatorEnds[foundType]?.[foundFloor]) {
            // Only apply boost if the player is on actual steps, not just start/end plates for movement.
            // The visual animation will handle start/end plates.
            let isOnStep = false;
            if (escalatorSteps[foundType] && escalatorSteps[foundType][foundFloor] && escalatorSteps[foundType][foundFloor].includes(hitObject)) {
                isOnStep = true;
            }

            if (isOnStep) {
                const startMesh = escalatorStarts[foundType][foundFloor];
                const endMesh = escalatorEnds[foundType][foundFloor];
                const dir = new THREE.Vector3().subVectors(endMesh.position, startMesh.position).normalize();
                const move = dir.multiplyScalar(settings.escalatorSpeed * deltaTime);
                cameraObject.position.add(move);
            }
        }
    }
    return escalatorBoost; 
}

export function animateActiveEscalatorSteps(deltaTime, escalatorSteps, escalatorStarts, escalatorEnds, settings, materials) {
    const escSpeed = settings.escalatorSpeed;

    ['down', 'up', 'down_B', 'up_B'].forEach(type => {
        if (escalatorSteps[type] && escalatorStarts[type] && escalatorEnds[type]) {
            for (const floor in escalatorSteps[type]) {
                const steps = escalatorSteps[type][floor];
                const startMesh = escalatorStarts[type][floor];
                const endMesh = escalatorEnds[type][floor];

                if (startMesh && endMesh && steps) {
                    const dir = new THREE.Vector3().subVectors(endMesh.position, startMesh.position);
                    const totalDistance = dir.length();
                    dir.normalize();

                    steps.forEach(step => {
                        // Animate if the material is the embark material (set by updateEscalatorStepVisuals)
                        if (step.material === materials.escalatorEmbarkMaterial) {
                            step.position.addScaledVector(dir, escSpeed * deltaTime);
                            // Check distance from the step's current position to the start of this specific escalator path
                            if (step.position.distanceTo(startMesh.position) >= totalDistance) {
                                step.position.copy(startMesh.position);
                            }
                        }
                    });
                }
            }
        }
    });
}