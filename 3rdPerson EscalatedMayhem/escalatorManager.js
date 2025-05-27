// File: escalatorManager.js
import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.128.0/build/three.module.js';

export class EscalatorManager {
    constructor(scene) {
        this.scene = scene;
        this.escalators = [];
        this.floorCount = 30; // Total number of floors
        this.floorHeight = 5; // Height between floors
        this.createEscalators();
    }

    createEscalators() {
        const escalatorWidth = 4;
        const escalatorHeight = 5; // This is the vertical rise, not the slant height
        const escalatorDepth = 2;
        const spacing = 10; // Spacing for room layout, used for positioning

        for (let f = 0; f < this.floorCount - 1; f++) { // Escalators go up to the second-to-last floor
            const yOffset = f * this.floorHeight; // Base Y position for the floor
            const directions = ['up', 'down'];

            directions.forEach((dir, idx) => {
                const escalatorGeometry = new THREE.BoxGeometry(escalatorWidth, escalatorHeight, escalatorDepth);
                const escalatorMaterial = new THREE.MeshStandardMaterial({ color: dir === 'up' ? 0x0000ff : 0xff0000 });
                const escalator = new THREE.Mesh(escalatorGeometry, escalatorMaterial);

                // Position escalators on the outer ends, e.g., near the right wing
                const xPos = 20; // Further out on the right side
                // Z position to place them distinctly, e.g., one forward, one backward
                const zOffset = (idx === 0 ? -1 : 1) * (spacing * 1.5);
                escalator.position.set(xPos, yOffset + escalatorHeight / 2, zOffset);

                // Rotate to simulate a slope
                escalator.rotation.x = Math.PI / 8 * (dir === 'up' ? 1 : -1); // Rotate around X for slope
                escalator.castShadow = true;
                escalator.receiveShadow = true;

                this.scene.add(escalator);
                this.escalators.push({ mesh: escalator, direction: dir, fromFloor: f });
            });
        }
    }

    update(player, delta) {
        const playerBox = new THREE.Box3().setFromObject(player.mesh);

        for (let e of this.escalators) {
            const escalatorBox = new THREE.Box3().setFromObject(e.mesh);
            // Check for intersection
            if (playerBox.intersectsBox(escalatorBox)) {
                const speed = 2; // Speed at which player moves on escalator
                if (e.direction === 'up') {
                    player.mesh.position.y += speed * delta;
                    // Ensure player doesn't go above the next floor's height if they are already at the top
                    if (player.mesh.position.y > (e.fromFloor + 1) * this.floorHeight + player.geometry.parameters.height / 2) {
                        player.mesh.position.y = (e.fromFloor + 1) * this.floorHeight + player.geometry.parameters.height / 2;
                    }
                } else { // 'down'
                    player.mesh.position.y -= speed * delta;
                    // Ensure player doesn't go below the current floor's height if they are already at the bottom
                    if (player.mesh.position.y < e.fromFloor * this.floorHeight + player.geometry.parameters.height / 2) {
                        player.mesh.position.y = e.fromFloor * this.floorHeight + player.geometry.parameters.height / 2;
                    }
                }
                // Optional: Adjust player's XZ position slightly to stay on escalator
                // This would require more complex logic to align with the escalator's rotation.
            }
        }
    }
}