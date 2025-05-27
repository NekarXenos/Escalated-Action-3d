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
        escalatorSteps, escalatorStepsB,
        escalatorStarts, escalatorStartsB,
        escalatorEnds, escalatorEndsB,
        createStandardLampFn // Passed createStandardLamp function
    } = config;

    const floorY = floorIndex * settings.floorHeight;
    const floorDepth = settings.floorHeight - settings.wallHeight; // Calculate floorDepth here
    const escalatorLength = settings.escalatorLength;
    const escalatorWidth = settings.escalatorWidth;

    const CentreX = settings.corridorWidth / 2;
        const CentreZ = - 4 - settings.elevatorSize;
    const NegativeZ = -16;

    // Escalator Area Floor Slabs & Lights (conditionally generated)
    const needsEscalatorPlatformsThisFloor =
        (floorIndex > 0 && floorIndex < settings.numFloors) ||
        ((floorIndex + 1) > 0 && (floorIndex + 1) < settings.numFloors);

    if (needsEscalatorPlatformsThisFloor) {
        // Escalator Floor Start
        const floorEsc1Geo = new THREE.BoxGeometry(settings.corridorWidth + (escalatorWidth * 2), floorDepth, 4 - 1);
        const floor1Esc = new THREE.Mesh(floorEsc1Geo, materials.floorMaterial);
        floor1Esc.name = `Escalator Floor Start ${floorIndex}`;
        floor1Esc.position.set(settings.corridorWidth / 2, floorY - floorDepth / 2, totalCorridorLength + 1.5);
        floor1Esc.receiveShadow = true; scene.add(floor1Esc); worldObjects.push(floor1Esc);

        const escStartZ = floor1Esc.position.z;
        const escLightY = floorY + settings.wallHeight - 0.5;
        const escLightXs = [-escalatorWidth / 2, settings.corridorWidth + (escalatorWidth / 2)];
        escLightXs.forEach((xPos, idx) => {
            createStandardLampFn(
                xPos,
                escLightY,
                escStartZ,
                floorIndex,
                `EscStart_F${floorIndex}_Idx${idx + 1}`,
                scene, lightsRef, lightBulbMaterial
            );
        });

        // Escalator Floor B Start
        const floorBEsc1Geo = new THREE.BoxGeometry(settings.corridorWidth + (escalatorWidth * 2), floorDepth, 4 - 1);
        const floorB1Esc = new THREE.Mesh(floorBEsc1Geo, materials.floorMaterial);
        floorB1Esc.name = `Escalator Floor B Start ${floorIndex}`;
        floorB1Esc.position.set(settings.corridorWidth / 2, floorY - floorDepth / 2, -16 - (totalCorridorLength + 1.5));
        floorB1Esc.receiveShadow = true; scene.add(floorB1Esc); worldObjects.push(floorB1Esc);

        const escBStartZ = floorB1Esc.position.z;
        const escBLightY = floorY + settings.wallHeight - 0.5;
        const escBLightXs = [-escalatorWidth / 2, settings.corridorWidth + (escalatorWidth / 2)];
        escBLightXs.forEach((xPos, idx) => {
            createStandardLampFn(
                xPos,
                escBLightY,
                escBStartZ,
                floorIndex,
                `EscBStart_F${floorIndex}_Idx${idx + 1}`,
                scene, lightsRef, lightBulbMaterial
            );
        });

        // Escalator Floor bridge
        const bridge2EscGeo = new THREE.BoxGeometry(settings.corridorWidth, floorDepth, escalatorLength + 3);
        const bridge2Esc = new THREE.Mesh(bridge2EscGeo, materials.floorMaterial);
        bridge2Esc.name = `Escalator Floor Bridge ${floorIndex}`;
        bridge2Esc.position.set(settings.corridorWidth / 2, floorY - floorDepth / 2, totalCorridorLength + 4 + (escalatorLength / 2) + 0.5);
        bridge2Esc.receiveShadow = true; scene.add(bridge2Esc); worldObjects.push(bridge2Esc);

        // Escalator Floor B bridge
        const bridgeB2EscGeo = new THREE.BoxGeometry(settings.corridorWidth, floorDepth, escalatorLength + 3);
        const bridgeB2Esc = new THREE.Mesh(bridgeB2EscGeo, materials.floorMaterial);
        bridgeB2Esc.name = `Escalator Floor B Bridge ${floorIndex}`;
        bridgeB2Esc.position.set(settings.corridorWidth / 2, floorY - floorDepth / 2, -16 - (totalCorridorLength + 4 + (escalatorLength / 2) + 0.5));
        bridgeB2Esc.receiveShadow = true; scene.add(bridgeB2Esc); worldObjects.push(bridgeB2Esc);

        // Escalator Floor End
        const floorEsc2Geo = new THREE.BoxGeometry(settings.corridorWidth + (escalatorWidth * 2), floorDepth, 4 - 1);
        const floor2Esc = new THREE.Mesh(floorEsc2Geo, materials.floorMaterial);
        floor2Esc.name = `Escalator Floor End ${floorIndex}`;
        floor2Esc.position.set(settings.corridorWidth / 2, floorY - floorDepth / 2, totalCorridorLength + 4 + escalatorLength + 2.5);
        floor2Esc.receiveShadow = true; scene.add(floor2Esc); worldObjects.push(floor2Esc);

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
        });

        // Escalator Floor B End
        const floorBEsc2Geo = new THREE.BoxGeometry(settings.corridorWidth + (escalatorWidth * 2), floorDepth, 4 - 1);
        const floorB2Esc = new THREE.Mesh(floorBEsc2Geo, materials.floorMaterial);
        floorB2Esc.name = `Escalator Floor End B ${floorIndex}`; // Corrected Name
        floorB2Esc.position.set(settings.corridorWidth / 2, floorY - floorDepth / 2, -16 - (totalCorridorLength + 4 + escalatorLength + 2.5));
        floorB2Esc.receiveShadow = true; scene.add(floorB2Esc); worldObjects.push(floorB2Esc);

        const escBEndZ = floorB2Esc.position.z;
        escBLightXs.forEach((xPos, idx) => {
            createStandardLampFn(
                xPos,
                escBLightY,
                escBEndZ,
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

        if (floorIndex > 0 && floorIndex < settings.numFloors) {
            // --- Wing A Left side Escalator down Starting Point (RED) ---
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
            escalatorSteps.down[floorIndex] = [];

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

            // --- Wing A Right side Escalator going Up on Lower floor Starting Point (RED) ---
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
            escalatorSteps.up[floorIndex] = [];

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
            const translatedEndEscUp = endEscUp.clone();
            translatedEndEscUp.position.y += 0.2;
            translatedEndEscUp.position.z += 0.3;
            escalatorEnds.up[floorIndex] = translatedEndEscUp;

            // --- B-Wing Escalators (-Z direction) //////////////////////////////////////////////
            // --- Wing B RIGHT side Escalator down Starting Point (RED) --- (Was Left)
            const startEscDownBRGeo = new THREE.BoxGeometry(escalatorWidth, floorDepth, 1);
            const startEscDownBR = new THREE.Mesh(startEscDownBRGeo, materials.escalatorEmbarkMaterial);
            startEscDownBR.name = `Right B Escalator Down Start ${floorIndex}`;
            startEscDownBR.position.set(
                - (escalatorWidth / 2) - 0.1, // was settings.corridorWidth + (escalatorWidth / 2) + 0.1,
                floorY - (floorDepth / 2),
                NegativeZ - totalCorridorLength + 3.5 // was totalCorridorLength + 3.5
            );
            startEscDownBR.receiveShadow = true;
            scene.add(startEscDownBR);
            worldObjects.push(startEscDownBR);
            escalatorStartsB.down[floorIndex] = startEscDownBR;
            escalatorStepsB.down[floorIndex] = [];

            // --- B-Wing Steps DOWN (RIGHT side) --- // was left
            for (let s = 0; s < stepCount; s++) {
                const y = floorY - .01 - (s + 1) * stepHeight + stepHeight / 2;
                const z = NegativeZ - totalCorridorLength - 4.3 - (s / stepCount) * settings.escalatorLength; // was totalCorridorLength + 4.3 + (s / stepCount) * settings.escalatorLength;
                const stepBGeo = new THREE.BoxGeometry(stepWidth, stepHeight, stepDepth);
                const stepDownB = new THREE.Mesh(stepBGeo, materials.escalatorMaterial);
                stepDownB.position.set(
                    - (stepWidth / 2) - 0.1,// was settings.corridorWidth + (stepWidth / 2) + 0.1,
                    y,
                    z
                );
                stepDownB.castShadow = true;
                stepDownB.receiveShadow = true;
                stepDownB.name = `Right B Escalator Step Down ${floorIndex}-${s}`;
                scene.add(stepDownB);
                worldObjects.push(stepDownB);
                escalatorStepsB.down[floorIndex].push(stepDownB);
            }

            const endEscDownGeoB = new THREE.BoxGeometry(escalatorWidth, floorDepth, 1);
            const endEscDownB = new THREE.Mesh(endEscDownGeoB, materials.escalatorMaterial);
            endEscDownB.name = `Right B Escalator Down End ${floorIndex}`;
            endEscDownB.position.set(
                - (escalatorWidth / 2) - 0.1,// was settings.corridorWidth + (escalatorWidth / 2) + 0.1,
                floorY - settings.floorHeight - (floorDepth / 2),
                NegativeZ - totalCorridorLength - escalatorLength - 4 - 0.5// was totalCorridorLength + escalatorLength + 4 + 0.5
            );
            endEscDownB.receiveShadow = true;
            scene.add(endEscDownB);
            worldObjects.push(endEscDownB);
            escalatorEndsB.down[floorIndex] = endEscDownB;

            // --- Wing B LEFT side Escalator going Up on Lower floor Starting Point (RED) --- // Was Right Side
            const startEscUpGeoB = new THREE.BoxGeometry(escalatorWidth, floorDepth, 1);
            const startEscUpB = new THREE.Mesh(startEscUpGeoB, materials.escalatorEmbarkMaterial);
            startEscUpB.name = `Left B Escalator Up Start ${floorIndex}`;
            startEscUpB.position.set( // B-Wing UP is on the LEFT side (Player's left when facing -Z, so positive X values)
                settings.corridorWidth + 0.1 + (escalatorWidth / 2),
                floorY - settings.floorHeight - (floorDepth / 2),
                NegativeZ - totalCorridorLength - escalatorLength - 4 - 0.5// was totalCorridorLength + escalatorLength + 4 + 0.5
            );
            startEscUpB.receiveShadow = true;
            scene.add(startEscUpB);
            worldObjects.push(startEscUpB);
            escalatorStartsB.up[floorIndex] = startEscUpB;
            escalatorStepsB.up[floorIndex] = [];

            // --- B-Wing Steps UP (LEFT side) --- /// was right
            for (let s = 0; s < stepCount; s++) {
                const y = floorY + 0.01 - (s + 1) * stepHeight + stepHeight / 2;
                const z = NegativeZ - totalCorridorLength - 4.3 - (s / stepCount) * settings.escalatorLength;
                const stepGeoB = new THREE.BoxGeometry(stepWidth, stepHeight, stepDepth);
                const stepUpB = new THREE.Mesh(stepGeoB, materials.escalatorMaterial);
                stepUpB.position.set( // B-Wing UP is on the LEFT side
                    settings.corridorWidth + 0.1 + (stepWidth / 2),
                    y,
                    z
                );
                stepUpB.castShadow = true;
                stepUpB.receiveShadow = true;
                stepUpB.name = `Left B Escalator Step Up ${floorIndex}-${s}`;
                scene.add(stepUpB);
                worldObjects.push(stepUpB);
                escalatorStepsB.up[floorIndex].push(stepUpB);
            }

            const endEscUpGeoB = new THREE.BoxGeometry(escalatorWidth, floorDepth, 1);
            const endEscUpB = new THREE.Mesh(endEscUpGeoB, materials.escalatorMaterial);
            endEscUpB.name = `Left B Escalator Up End ${floorIndex}`;
            endEscUpB.position.set( // B-Wing UP is on the LEFT side
                settings.corridorWidth + 0.1 + (escalatorWidth / 2),
                floorY - (floorDepth / 3) - 0.08,
                NegativeZ - totalCorridorLength - 3.5// was totalCorridorLength + 3.5
            );
            endEscUpB.receiveShadow = true;
            scene.add(endEscUpB);
            worldObjects.push(endEscUpB);
            const translatedEndEscUpB = endEscUpB.clone();
            translatedEndEscUpB.position.y += 0.2;
            translatedEndEscUpB.position.z -= 0.3;
            escalatorEndsB.up[floorIndex] = translatedEndEscUpB;

            // ////////////// End Escalator models  ////////////////////////////////////
            
            // --- Add Balustrades --- ////////////////////////////////
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

            const outerBalustradeUpGeo = new THREE.BoxGeometry(balustradeThickness, balustradeHeight, lengthUpBalustrade);
            const outerBalustradeUp = new THREE.Mesh(outerBalustradeUpGeo, materials.balustradeMaterial);
            outerBalustradeUp.name = `Balustrade_Up_Outer_F${floorIndex - 1}-F${floorIndex}`;
            outerBalustradeUp.position.set(-settings.escalatorWidth + balustradeThickness / 2, balustradeCenterY_Up, centerPosUpBalustrade.z);
            outerBalustradeUp.lookAt(outerBalustradeUp.position.clone().add(dirUpBalustrade));
            scene.add(outerBalustradeUp); worldObjects.push(outerBalustradeUp);

            const cylinderGeo = new THREE.CylinderGeometry(balustradeHeight / 2, balustradeHeight / 2, balustradeThickness, 16);
            cylinderGeo.rotateZ(Math.PI / 2);
            const upDir = new THREE.Vector3().subVectors(endUpBalustrade, startUpBalustrade).normalize();
            const halfLengthUp = lengthUpBalustrade / 2; // Corrected variable name
            [innerBalustradeUp, outerBalustradeUp].forEach(balustrade => {
                const center = balustrade.position.clone();
                const end1 = center.clone().sub(upDir.clone().multiplyScalar(halfLengthUp));
                const end2 = center.clone().add(upDir.clone().multiplyScalar(halfLengthUp));
                const cylinder1 = new THREE.Mesh(cylinderGeo, materials.balustradeMaterial);
                cylinder1.position.copy(end1);
                const cylinder2 = new THREE.Mesh(cylinderGeo, materials.balustradeMaterial);
                cylinder2.position.copy(end2); 
                scene.add(cylinder1, cylinder2); worldObjects.push(cylinder1, cylinder2);
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

            const outerBalustradeDownGeo = new THREE.BoxGeometry(balustradeThickness, balustradeHeight, lengthDownBalustrade);
            const outerBalustradeDown = new THREE.Mesh(outerBalustradeDownGeo, materials.balustradeMaterial);
            outerBalustradeDown.name = `Balustrade_Down_Outer_F${floorIndex}-F${floorIndex - 1}`;
            outerBalustradeDown.position.set(settings.corridorWidth + settings.escalatorWidth - balustradeThickness / 2, balustradeCenterY_Down, centerPosDownBalustrade.z);
            outerBalustradeDown.lookAt(outerBalustradeDown.position.clone().add(dirDownBalustrade));
            scene.add(outerBalustradeDown); worldObjects.push(outerBalustradeDown);

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
                scene.add(cylinder1, cylinder2); worldObjects.push(cylinder1, cylinder2);
            });

            // /// B-Wing Balustrades (-Z direction) ////////////////////////////////////////////////
            // B-Wing UP Escalator is on Player's LEFT when facing -Z (so positive X values relative to corridor center)
            // X Range: settings.corridorWidth to settings.corridorWidth + settings.escalatorWidth
            const startUpBalustradeB = new THREE.Vector3(
                settings.corridorWidth + settings.escalatorWidth / 2, // Center X of the B-Wing UP escalator
                lowerFloorTopY - floorDepth,
                NegativeZ - (totalCorridorLength + settings.escalatorLength + 4) // Start Z (further away in -Z)
            );
            const endUpBalustradeB = new THREE.Vector3(
                settings.corridorWidth + settings.escalatorWidth / 2, // Center X
                currentFloorTopY - floorDepth / 2,
                NegativeZ - (totalCorridorLength + 3.5) // End Z (closer in -Z)
            );
            const dirUpBalustradeB = new THREE.Vector3().subVectors(endUpBalustradeB, startUpBalustradeB);
            const lengthUpBalustradeB = dirUpBalustradeB.length();
            const centerPosUpBalustradeB = new THREE.Vector3().addVectors(startUpBalustradeB, endUpBalustradeB).multiplyScalar(0.5);
            const centerZ_UpBalustradeB = centerPosUpBalustradeB.z;
            const rampSurfaceY_at_centerZ_UpB = startUpBalustradeB.y + (centerZ_UpBalustradeB - startUpBalustradeB.z) / (endUpBalustradeB.z - startUpBalustradeB.z) * (endUpBalustradeB.y - startUpBalustradeB.y);
            const balustradeCenterY_UpB = rampSurfaceY_at_centerZ_UpB + balustradeHeight / 2;

            const innerBalustradeUpGeoB = new THREE.BoxGeometry(balustradeThickness, balustradeHeight, lengthUpBalustradeB);
            const innerBalustradeUpB = new THREE.Mesh(innerBalustradeUpGeoB, materials.balustradeMaterial);
            innerBalustradeUpB.name = `Balustrade_B_Up_Inner_F${floorIndex - 1}-F${floorIndex}`;
            innerBalustradeUpB.position.set( // Inner side (towards corridor center)
                settings.corridorWidth + balustradeThickness / 2,
                balustradeCenterY_UpB,
                centerPosUpBalustradeB.z
            );
            innerBalustradeUpB.lookAt(innerBalustradeUpB.position.clone().add(dirUpBalustradeB));
            scene.add(innerBalustradeUpB); worldObjects.push(innerBalustradeUpB);

            const outerBalustradeUpGeoB = new THREE.BoxGeometry(balustradeThickness, balustradeHeight, lengthUpBalustradeB);
            const outerBalustradeUpB = new THREE.Mesh(outerBalustradeUpGeoB, materials.balustradeMaterial);
            outerBalustradeUpB.name = `Balustrade_B_Up_Outer_F${floorIndex - 1}-F${floorIndex}`;
            outerBalustradeUpB.position.set( // Outer side
                settings.corridorWidth + settings.escalatorWidth - balustradeThickness / 2,
                balustradeCenterY_UpB,
                centerPosUpBalustradeB.z
            );
            outerBalustradeUpB.lookAt(outerBalustradeUpB.position.clone().add(dirUpBalustradeB));
            scene.add(outerBalustradeUpB); worldObjects.push(outerBalustradeUpB);

            // Re-use cylinderGeo if dimensions are the same
            const upDirB = new THREE.Vector3().subVectors(endUpBalustradeB, startUpBalustradeB).normalize();
            const halfLengthUpB = lengthUpBalustradeB / 2;
            [innerBalustradeUpB, outerBalustradeUpB].forEach(balustrade => {
                const center = balustrade.position.clone();
                const end1 = center.clone().sub(upDirB.clone().multiplyScalar(halfLengthUpB));
                const end2 = center.clone().add(upDirB.clone().multiplyScalar(halfLengthUpB));
                const cylinder1 = new THREE.Mesh(cylinderGeo, materials.balustradeMaterial); // Assuming cylinderGeo is suitable
                cylinder1.position.copy(end1);
                const cylinder2 = new THREE.Mesh(cylinderGeo, materials.balustradeMaterial); // Assuming cylinderGeo is suitable
                cylinder2.position.copy(end2); 
                scene.add(cylinder1, cylinder2); worldObjects.push(cylinder1, cylinder2);
            });

            // B-Wing DOWN Escalator is on Player's RIGHT when facing -Z (so negative X values)
            // X Range: -settings.escalatorWidth to 0
            const startDownBalustradeB = new THREE.Vector3(
                -settings.escalatorWidth / 2, // Center X of the B-Wing DOWN escalator
                currentFloorTopY - floorDepth / 2,
                NegativeZ - (totalCorridorLength + 3.5) // Start Z (closer in -Z)
            );
            const endDownBalustradeB = new THREE.Vector3(
                -settings.escalatorWidth / 2, // Center X
                lowerFloorTopY - floorDepth,
                NegativeZ - (totalCorridorLength + settings.escalatorLength + 4) // End Z (further away in -Z)
            );
            const dirDownBalustradeB = new THREE.Vector3().subVectors(endDownBalustradeB, startDownBalustradeB);
            const lengthDownBalustradeB = dirDownBalustradeB.length();
            const centerPosDownBalustradeB = new THREE.Vector3().addVectors(startDownBalustradeB, endDownBalustradeB).multiplyScalar(0.5);
            const centerZ_DownBalustradeB = centerPosDownBalustradeB.z;
            const rampSurfaceY_at_centerZ_DownB = startDownBalustradeB.y + (centerZ_DownBalustradeB - startDownBalustradeB.z) / (endDownBalustradeB.z - startDownBalustradeB.z) * (endDownBalustradeB.y - startDownBalustrade.y);
            const balustradeCenterY_DownB = rampSurfaceY_at_centerZ_DownB + balustradeHeight / 2;

            const innerBalustradeDownGeoB = new THREE.BoxGeometry(balustradeThickness, balustradeHeight, lengthDownBalustradeB);
            const innerBalustradeDownB = new THREE.Mesh(innerBalustradeDownGeoB, materials.balustradeMaterial);
            innerBalustradeDownB.name = `Balustrade_B_Down_Inner_F${floorIndex}-F${floorIndex - 1}`;
            innerBalustradeDownB.position.set( // Inner side (towards corridor center, X=0)
                0 - balustradeThickness / 2,
                balustradeCenterY_DownB,
                centerPosDownBalustradeB.z
            );
            innerBalustradeDownB.lookAt(innerBalustradeDownB.position.clone().add(dirDownBalustradeB));
            scene.add(innerBalustradeDownB); worldObjects.push(innerBalustradeDownB);

            const outerBalustradeDownGeoB = new THREE.BoxGeometry(balustradeThickness, balustradeHeight, lengthDownBalustradeB);
            const outerBalustradeDownB = new THREE.Mesh(outerBalustradeDownGeoB, materials.balustradeMaterial);
            outerBalustradeDownB.name = `Balustrade_B_Down_Outer_F${floorIndex}-F${floorIndex - 1}`;
            outerBalustradeDownB.position.set( // Outer side
                -settings.escalatorWidth + balustradeThickness / 2,
                balustradeCenterY_DownB,
                centerPosDownBalustradeB.z
            );
            outerBalustradeDownB.lookAt(outerBalustradeDownB.position.clone().add(dirDownBalustradeB));
            scene.add(outerBalustradeDownB); worldObjects.push(outerBalustradeDownB);

            const downDirB = new THREE.Vector3().subVectors(endDownBalustradeB, startDownBalustradeB).normalize();
            const halfLengthDownB = lengthDownBalustradeB / 2;
            [innerBalustradeDownB, outerBalustradeDownB].forEach(balustrade => {
                const center = balustrade.position.clone();
                const end1 = center.clone().sub(downDirB.clone().multiplyScalar(halfLengthDownB));
                const end2 = center.clone().add(downDirB.clone().multiplyScalar(halfLengthDownB));
                const cylinder1 = new THREE.Mesh(cylinderGeo, materials.balustradeMaterial); // Assuming cylinderGeo is suitable
                cylinder1.position.copy(end1);
                const cylinder2 = new THREE.Mesh(cylinderGeo, materials.balustradeMaterial); // Assuming cylinderGeo is suitable
                cylinder2.position.copy(end2); 
                scene.add(cylinder1, cylinder2); worldObjects.push(cylinder1, cylinder2);
            });
        }
    }
}

// The escalator-related functions are now separated into this module for reusability.

export function updateEscalatorStepVisuals(playerWorldPos, playerHeight, playerOnEscalatorState, escalatorSteps, escalatorStarts, materials) {
    let escalatorFound = false;
    let escalatorType = null;
    let escalatorFloor = null;

    for (const [floor, mesh] of Object.entries(escalatorStarts.up)) {
        if (isPlayerOnMesh(playerWorldPos, playerHeight, mesh)) {
            escalatorFound = true;
            escalatorType = 'up';
            escalatorFloor = parseInt(floor);
            break;
        }
    }
    if (!escalatorFound) {
        for (const [floor, mesh] of Object.entries(escalatorStarts.down)) {
            if (isPlayerOnMesh(playerWorldPos, playerHeight, mesh)) {
                escalatorFound = true;
                escalatorType = 'down';
                escalatorFloor = parseInt(floor);
                break;
            }
        }
    }

    if (playerOnEscalatorState.type !== escalatorType || playerOnEscalatorState.floor !== escalatorFloor) {
        for (const steps of Object.values(escalatorSteps.up)) {
            steps.forEach(step => { step.material = materials.escalatorMaterial; });
        }
        for (const steps of Object.values(escalatorSteps.down)) {
            steps.forEach(step => { step.material = materials.escalatorMaterial; });
        }

        if (escalatorFound && escalatorType && escalatorFloor !== null && escalatorSteps[escalatorType] && escalatorSteps[escalatorType][escalatorFloor]) {
            escalatorSteps[escalatorType][escalatorFloor].forEach(step => {
                step.material = materials.escalatorEmbarkMaterial;
            });
        }
        playerOnEscalatorState.type = escalatorType;
        playerOnEscalatorState.floor = escalatorFloor;
    }
}

export function calculateEscalatorBoost(cameraObject, escalatorSteps, escalatorStarts, escalatorEnds, settings, deltaTime) {
    let escalatorBoost = new THREE.Vector3(0, 0, 0);
    const rayOrigin = cameraObject.position.clone();
    const rayDirection = new THREE.Vector3(0, -1, 0);
    const raycaster = new THREE.Raycaster(rayOrigin, rayDirection, 0, 2);

    let allSteps = [];
    for (const key in escalatorSteps.up) { allSteps = allSteps.concat(escalatorSteps.up[key]); }
    for (const key in escalatorSteps.down) { allSteps = allSteps.concat(escalatorSteps.down[key]); }

    const intersections = raycaster.intersectObjects(allSteps, false);

    if (intersections.length > 0) {
        const hitStep = intersections[0].object;
        let foundType = null;
        let foundFloor = null;

        for (const floor in escalatorSteps.up) {
            if (escalatorSteps.up[floor].includes(hitStep)) {
                foundType = 'up'; foundFloor = floor; break;
            }
        }
        if (!foundType) {
            for (const floor in escalatorSteps.down) {
                if (escalatorSteps.down[floor].includes(hitStep)) {
                    foundType = 'down'; foundFloor = floor; break;
                }
            }
        }

        if (foundType && foundFloor) {
            const startMesh = escalatorStarts[foundType][foundFloor];
            const endMesh = escalatorEnds[foundType][foundFloor];
            if (startMesh && endMesh) {
                const dir = new THREE.Vector3().subVectors(endMesh.position, startMesh.position).normalize();
                const move = dir.multiplyScalar(settings.escalatorSpeed * deltaTime);
                
                // Apply direct movement for steps, boost is more for player input influence
                cameraObject.position.add(move); 
                // If you still want a separate "boost" vector for other calculations, you can return it:
                // escalatorBoost.copy(move); // or dir.multiplyScalar(settings.escalatorSpeed) if boost is rate
            }
        }
    }
    return escalatorBoost; // This might be zero if direct movement is preferred
}

export function animateActiveEscalatorSteps(deltaTime, escalatorSteps, escalatorStepsB, escalatorStarts, escalatorStartsB, escalatorEnds, escalatorEndsB, settings, materials) {
    const escSpeed = settings.escalatorSpeed;

    for (const floor in escalatorSteps.down) {
        const steps = escalatorSteps.down[floor];
        const startMesh = escalatorStarts.down[floor];
        const endMesh = escalatorEnds.down[floor];
        if (startMesh && endMesh && steps) {
            const dir = new THREE.Vector3().subVectors(endMesh.position, startMesh.position);
            const totalDistance = dir.length();
            dir.normalize();

            steps.forEach(step => {
                if (step.material === materials.escalatorEmbarkMaterial) {
                    step.position.addScaledVector(dir, escSpeed * deltaTime);
                    if (step.position.distanceTo(startMesh.position) >= totalDistance) {
                        step.position.copy(startMesh.position);
                    }
                }
            });
        }
    }

    for (const floor in escalatorSteps.up) {
        const steps = escalatorSteps.up[floor];
        const startMesh = escalatorStarts.up[floor];
        const endMesh = escalatorEnds.up[floor];
        if (startMesh && endMesh && steps) {
            const dirUp = new THREE.Vector3().subVectors(endMesh.position, startMesh.position);
            const totalDistanceUp = dirUp.length();
            dirUp.normalize();

            steps.forEach(step => {
                if (step.material === materials.escalatorEmbarkMaterial) {
                    step.position.addScaledVector(dirUp, escSpeed * deltaTime);
                    if (step.position.distanceTo(startMesh.position) >= totalDistanceUp) {
                        step.position.copy(startMesh.position);
                    }
                }
            });
        }
    }

    // Wing B:///////////////////////
    for (const floor in escalatorStepsB.down) {
        const steps = escalatorStepsB.down[floor];
        const startMesh = escalatorStartsB.down[floor];
        const endMesh = escalatorEndsB.down[floor];
        if (startMesh && endMesh && steps) {
            const dir = new THREE.Vector3().subVectors(endMesh.position, startMesh.position);
            const totalDistance = dir.length();
            dir.normalize();

            steps.forEach(step => {
                if (step.material === materials.escalatorEmbarkMaterial) {
                    step.position.addScaledVector(dir, escSpeed * deltaTime);
                    if (step.position.distanceTo(startMesh.position) >= totalDistance) {
                        step.position.copy(startMesh.position);
                    }
                }
            });
        }
    }

    for (const floor in escalatorStepsB.up) {
        const steps = escalatorStepsB.up[floor];
        const startMesh = escalatorStartsB.up[floor];
        const endMesh = escalatorEndsB.up[floor];
        if (startMesh && endMesh && steps) {
            const dirUp = new THREE.Vector3().subVectors(endMesh.position, startMesh.position);
            const totalDistanceUp = dirUp.length();
            dirUp.normalize();

            steps.forEach(step => {
                if (step.material === materials.escalatorEmbarkMaterial) {
                    step.position.addScaledVector(dirUp, escSpeed * deltaTime);
                    if (step.position.distanceTo(startMesh.position) >= totalDistanceUp) {
                        step.position.copy(startMesh.position);
                    }
                }
            });
        }
    }
}