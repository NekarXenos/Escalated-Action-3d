// File: interactionManager.js
import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.128.0/build/three.module.js';

export class InteractionManager {
    constructor(doorManager, elevatorManager, lightingManager, player, camera) {
        this.doorManager = doorManager;
        this.elevatorManager = elevatorManager;
        this.lightingManager = lightingManager;
        this.player = player;
        this.camera = camera;
        this.raycaster = new THREE.Raycaster();
        this.init();
    }

    init() {
        window.addEventListener('keydown', (e) => {
            if (e.code === 'KeyE') {
                this.tryInteract();
            }
        });

        // Event listener for mouse click to shoot lights
        window.addEventListener('click', (e) => {
            if (e.button === 0) { // Left mouse button
                this.shootLight(e);
            }
        });
    }

    tryInteract() {
        const playerPos = this.player.mesh.position;

        // Try to interact with doors
        let interactedWithDoor = false;
        for (let door of this.doorManager.doors) {
            const dist = door.position.distanceTo(playerPos);
            if (dist < 3) { // Increased interaction distance for doors
                this.doorManager.toggleDoor(door);
                interactedWithDoor = true;
                break; // Interact with only one door at a time
            }
        }

        // If no door was interacted with, try to interact with elevators
        if (!interactedWithDoor) {
            const closestElevator = this.elevatorManager.getClosestElevator(playerPos);
            if (closestElevator && closestElevator.distance < 4) { // Interaction distance for elevators
                // Open a UI for elevator controls or call a specific elevator
                // For now, we'll just log and rely on the UI buttons.
                this.showMessage(`Near Elevator ${closestElevator.index}. Use UI to call.`);
            }
        }
    }

    shootLight(event) {
        // Calculate mouse position in normalized device coordinates (-1 to +1)
        const mouse = new THREE.Vector2(
            (event.clientX / window.innerWidth) * 2 - 1,
            -(event.clientY / window.innerHeight) * 2 + 1
        );

        // Update the raycaster with the camera and mouse position
        this.raycaster.setFromCamera(mouse, this.camera);

        // Check for intersections with lights
        const lightsMeshes = this.lightingManager.lights.map(l => l.light); // PointLight is a type of Object3D
        const intersects = this.raycaster.intersectObjects(lightsMeshes, true);

        if (intersects.length > 0) {
            const intersectedLight = intersects[0].object;
            // Find the light in the LightingManager's array
            const lightIndex = this.lightingManager.lights.findIndex(l => l.light === intersectedLight);

            if (lightIndex !== -1) {
                this.lightingManager.shootLight(lightIndex);
                this.showMessage(`Light ${lightIndex} shot down!`);
            }
        }
    }

    showMessage(message) {
        const messageBox = document.getElementById('message-box');
        const messageText = document.getElementById('message-text');
        messageText.textContent = message;
        messageBox.style.display = 'block';
    }
}