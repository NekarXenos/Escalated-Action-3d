// File: lightingManager.js
import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.128.0/build/three.module.js';

export class LightingManager {
    constructor(scene) {
        this.scene = scene;
        this.lights = [];
        this.floorCount = 30; // Total number of floors
        this.floorHeight = 5; // Height between floors
        this.createLights();
    }

    createLights() {
        for (let f = 0; f < this.floorCount; f++) {
            const yOffset = f * this.floorHeight + 4.5; // Ceiling height for lights

            // Lights in the main hallway
            for (let i = -1; i <= 1; i++) { // Place lights along Z-axis in hallway
                const light = new THREE.PointLight(0xffffff, 1, 20); // Color, intensity, distance
                light.position.set(0, yOffset, i * 10);
                light.castShadow = false; // Do NOT cast shadows for point lights
                this.scene.add(light);
                this.lights.push({ light, active: true, initialIntensity: light.intensity });
            }

            // Lights in the left and right wing rooms (example placement)
            const roomSize = 10;
            const roomXOffset = roomSize * 1.5;
            for (let side = -1; side <= 1; side += 2) {
                for (let i = 0; i < 3; i++) {
                    const roomZOffset = (i - 1) * roomSize;
                    const light = new THREE.PointLight(0xffffff, 0.7, 15); // Slightly dimmer for rooms
                    light.position.set(side * roomXOffset, yOffset, roomZOffset);
                    light.castShadow = false; // Do NOT cast shadows for point lights
                    this.scene.add(light);
                    this.lights.push({ light, active: true, initialIntensity: light.intensity });
                }
            }
        }
    }

    shootLight(index) {
        if (this.lights[index] && this.lights[index].active) {
            this.lights[index].light.intensity = 0; // Turn off the light
            this.lights[index].active = false;
            console.log(`Light ${index} has been shot down.`);
            // Add logic to affect enemies later (e.g., in EnemyManager update)
        }
    }
}