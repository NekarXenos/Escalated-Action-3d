// File: elevatorManager.js
import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.128.0/build/three.module.js';

export class ElevatorManager {
    constructor(scene) {
        this.scene = scene;
        this.elevators = [];
        this.floorHeight = 5; // Height between floors
        this.maxFloor = 30; // Max floor index (0-30)
        this.createElevators();
    }

    createElevators() {
        const elevatorWidth = 3;
        const elevatorHeight = 3;
        const elevatorDepth = 3;
        const gap = 5; // Gap between elevators

        for (let i = 0; i < 6; i++) { // Six elevators
            const elevator = new THREE.Mesh(
                new THREE.BoxGeometry(elevatorWidth, elevatorHeight, elevatorDepth),
                new THREE.MeshStandardMaterial({ color: 0xffcc00, transparent: true, opacity: 0.8 })
            );
            elevator.position.set((i - 2.5) * gap, 1.5, 0); // Centered row of elevators
            elevator.castShadow = true;
            elevator.receiveShadow = true;
            this.scene.add(elevator);
            this.elevators.push({ mesh: elevator, targetFloor: 0, currentFloor: 0 });
        }
        // Make one elevator go to the roof level (floor 30)
        // Let's say the first elevator (index 0) can go to the roof.
        // The max target floor for this elevator will be this.maxFloor.
        // Other elevators will have max target floor as this.maxFloor - 1.
    }

    update(delta) {
        for (let e of this.elevators) {
            const targetY = e.targetFloor * this.floorHeight + 1.5; // Calculate target Y position
            const currentY = e.mesh.position.y;
            const distance = targetY - currentY;

            if (Math.abs(distance) > 0.1) { // Move only if not very close to target
                e.mesh.position.y += distance * delta * 0.5; // Smooth movement
                e.currentFloor = Math.round((e.mesh.position.y - 1.5) / this.floorHeight);
            } else {
                e.mesh.position.y = targetY; // Snap to target
                e.currentFloor = e.targetFloor;
            }
        }
    }

    moveElevatorToFloor(index, floor) {
        if (this.elevators[index]) {
            // Ensure the floor is within bounds for the specific elevator
            if (index === 0) { // First elevator can go to roof
                this.elevators[index].targetFloor = Math.min(floor, this.maxFloor);
            } else { // Other elevators go up to floor 29
                this.elevators[index].targetFloor = Math.min(floor, this.maxFloor - 1);
            }
            console.log(`Elevator ${index} set to target floor ${this.elevators[index].targetFloor}`);
        }
    }

    // Method to get the closest elevator to a given position
    getClosestElevator(position) {
        let closestElevator = null;
        let minDistance = Infinity;

        for (let i = 0; i < this.elevators.length; i++) {
            const elevator = this.elevators[i].mesh;
            const dist = elevator.position.distanceTo(position);
            if (dist < minDistance) {
                minDistance = dist;
                closestElevator = { elevator: this.elevators[i], index: i, distance: dist };
            }
        }
        return closestElevator;
    }
}