// File: doorPlacement.js
import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.128.0/build/three.module.js';

export function placeDoors(doorManager) {
    const floors = 30; // Total number of floors
    const roomCount = 3; // 3 rooms per side
    const roomSpacing = 10; // Spacing between rooms
    const floorHeight = 5; // Height between floors

    for (let floor = 0; floor < floors; floor++) {
        const y = floor * floorHeight + 1.5; // Y position for the door center

        // Place doors for the center hallway (leading to elevators)
        // These are the doors from the main hallway into the elevator area
        for (let i = -1; i <= 1; i += 2) { // One door on each side of the central elevator area
            const elevatorDoorPos = new THREE.Vector3(i * 2, y, 0); // Adjust X based on elevator positions
            doorManager.createDoor(elevatorDoorPos);
        }


        for (let i = 0; i < roomCount; i++) {
            const zOffset = (i - 1) * roomSpacing; // Z position for rooms

            // Left wing doors (leading from hallway into rooms)
            const leftDoorPos = new THREE.Vector3(-roomSpacing * 0.5, y, zOffset); // Adjust X to be at hallway entrance
            doorManager.createDoor(leftDoorPos);

            // Right wing doors (leading from hallway into rooms)
            const rightDoorPos = new THREE.Vector3(roomSpacing * 0.5, y, zOffset); // Adjust X to be at hallway entrance
            doorManager.createDoor(rightDoorPos);
        }
    }
}