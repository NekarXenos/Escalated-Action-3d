import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.128.0/build/three.module.js';

export class DoorManager {
    constructor(scene) {
        this.scene = scene;
        this.doors = [];
    }

    createDoor(position) {
        const doorWidth = 1;
        const doorHeight = 3;
        const doorDepth = 0.2;

        const door = new THREE.Mesh(
            new THREE.BoxGeometry(doorWidth, doorHeight, doorDepth),
            new THREE.MeshStandardMaterial({ color: 0x552200 })
        );
        door.position.copy(position);
        door.userData.open = false; // Custom property to track door state
        door.castShadow = true; // Doors cast shadows
        door.receiveShadow = true; // Doors receive shadows

        this.scene.add(door);
        this.doors.push(door);
        return door;
    }

    toggleDoor(door) {
        door.userData.open = !door.userData.open;
        // Make the door invisible when open, or move it.
        // For simplicity, we'll make it invisible.
        door.visible = !door.userData.open;
        console.log(`Door at ${door.position.x}, ${door.position.y}, ${door.position.z} is now ${door.userData.open ? 'OPEN' : 'CLOSED'}`);
    }

    // This update method is now simplified as InteractionManager handles the toggle
    update(player) {
        // No automatic opening/closing based on intersection here.
        // The InteractionManager will explicitly call toggleDoor when 'E' is pressed near a door.
    }
}