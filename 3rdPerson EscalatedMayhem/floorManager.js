// File: floorManager.js
import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.128.0/build/three.module.js';

export class FloorManager {
    constructor(scene) {
        this.scene = scene;
        this.floors = [];
        this.floorCount = 30; // Total number of floors
        this.createFloors();
        this.createRoof(); // Add a roof
    }

    createFloors() {
        const roomSize = 10;
        const floorHeight = 5; // Height between floors

        for (let floorIndex = 0; floorIndex < this.floorCount; floorIndex++) {
            const floorGroup = new THREE.Group();
            const yOffset = floorIndex * floorHeight;

            // Center hallway (floor)
            const hallwayFloor = new THREE.Mesh(
                new THREE.BoxGeometry(roomSize * 2, 0.2, roomSize * 3),
                new THREE.MeshStandardMaterial({ color: 0x888888, metalness: 0.2, roughness: 0.7 })
            );
            hallwayFloor.position.y = yOffset;
            hallwayFloor.receiveShadow = true; // Floor receives shadows
            floorGroup.add(hallwayFloor);

            // Optionally, add a wireframe for debugging
            // const wireframe = new THREE.WireframeGeometry(hallwayFloor.geometry);
            // const line = new THREE.LineSegments(wireframe);
            // line.material.depthTest = false;
            // line.material.opacity = 0.25;
            // line.material.transparent = true;
            // hallwayFloor.add(line);

            // Rooms left and right
            for (let side = -1; side <= 1; side += 2) { // -1 for left, 1 for right
                for (let i = 0; i < 3; i++) { // 3 rooms per side
                    const roomZOffset = (i - 1) * roomSize;
                    const roomXOffset = side * roomSize * 1.5;

                    // Room Floor
                    const roomFloor = new THREE.Mesh(
                        new THREE.BoxGeometry(roomSize, 0.2, roomSize),
                        new THREE.MeshStandardMaterial({ color: 0xaaaaaa })
                    );
                    roomFloor.position.set(roomXOffset, yOffset, roomZOffset);
                    roomFloor.receiveShadow = true;
                    floorGroup.add(roomFloor);

                    // Room Walls (Back, Front, Inner, Outer)
                    const wallMaterial = new THREE.MeshStandardMaterial({ color: 0xcccccc });
                    const wallHeight = 3; // Height of the walls

                    // Back Wall
                    const backWall = new THREE.Mesh(
                        new THREE.BoxGeometry(roomSize, wallHeight, 0.2),
                        wallMaterial
                    );
                    backWall.position.set(roomXOffset, yOffset + wallHeight / 2, roomZOffset - roomSize / 2);
                    backWall.castShadow = true;
                    backWall.receiveShadow = true;
                    floorGroup.add(backWall);

                    // Front Wall
                    const frontWall = new THREE.Mesh(
                        new THREE.BoxGeometry(roomSize, wallHeight, 0.2),
                        wallMaterial
                    );
                    frontWall.position.set(roomXOffset, yOffset + wallHeight / 2, roomZOffset + roomSize / 2);
                    frontWall.castShadow = true;
                    frontWall.receiveShadow = true;
                    floorGroup.add(frontWall);

                    // Inner Wall (between room and hallway) - This will have the door
                    // This wall will be handled by door placement or integrated with door geometry.
                    // For now, let's create the outer wall and side walls.

                    // Outer Wall
                    const outerWall = new THREE.Mesh(
                        new THREE.BoxGeometry(0.2, wallHeight, roomSize),
                        wallMaterial
                    );
                    outerWall.position.set(roomXOffset + side * roomSize / 2, yOffset + wallHeight / 2, roomZOffset);
                    outerWall.castShadow = true;
                    outerWall.receiveShadow = true;
                    floorGroup.add(outerWall);

                    // Side Walls for Hallway (to enclose the hallway)
                    // These are the walls running along the length of the hallway,
                    // separating it from the outside or other structures.
                    if (i === 0 && side === -1) { // Only create once per floor for the left side of hallway
                        const hallwaySideWallLeft = new THREE.Mesh(
                            new THREE.BoxGeometry(0.2, wallHeight, roomSize * 3), // Length of hallway
                            wallMaterial
                        );
                        hallwaySideWallLeft.position.set(-roomSize, yOffset + wallHeight / 2, 0);
                        hallwaySideWallLeft.castShadow = true;
                        hallwaySideWallLeft.receiveShadow = true;
                        floorGroup.add(hallwaySideWallLeft);
                    }
                    if (i === 0 && side === 1) { // Only create once per floor for the right side of hallway
                        const hallwaySideWallRight = new THREE.Mesh(
                            new THREE.BoxGeometry(0.2, wallHeight, roomSize * 3), // Length of hallway
                            wallMaterial
                        );
                        hallwaySideWallRight.position.set(roomSize, yOffset + wallHeight / 2, 0);
                        hallwaySideWallRight.castShadow = true;
                        hallwaySideWallRight.receiveShadow = true;
                        floorGroup.add(hallwaySideWallRight);
                    }
                }
            }

            this.floors.push(floorGroup);
            this.scene.add(floorGroup);
        }
    }

    createRoof() {
        const roomSize = 10;
        const roofHeight = 0.5;
        const yOffset = this.floorCount * 5; // Position above the last floor

        const roof = new THREE.Mesh(
            new THREE.BoxGeometry(roomSize * 4, roofHeight, roomSize * 4), // Larger than a single floor
            new THREE.MeshStandardMaterial({ color: 0x666666 })
        );
        roof.position.set(0, yOffset + roofHeight / 2, 0);
        roof.receiveShadow = true;
        this.scene.add(roof);
        this.roof = roof; // Store reference to the roof
    }
}