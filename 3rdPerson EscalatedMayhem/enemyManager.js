// File: enemyManager.js
import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.128.0/build/three.module.js';
import { Enemy } from './enemy.js';

export class EnemyManager {
    constructor(scene, floorManager) {
        this.scene = scene;
        this.floorManager = floorManager;
        this.enemies = [];
        this.spawnEnemies();
    }

    spawnEnemies() {
        const enemiesPerFloor = 2;
        const roomSize = 10;
        const floorHeight = 5;

        for (let floorIndex = 0; floorIndex < this.floorManager.floorCount; floorIndex++) {
            const yOffset = floorIndex * floorHeight + 1.5; // Y position for enemy base

            for (let i = 0; i < enemiesPerFloor; i++) {
                // Spawn enemies in random rooms or hallway sections
                const randomSide = Math.random() < 0.5 ? -1 : 1;
                const randomRoomIndex = Math.floor(Math.random() * 3) - 1; // -1, 0, 1 for rooms
                const randomZOffset = randomRoomIndex * roomSize;
                const randomXOffset = randomSide * roomSize * 1.5;

                // Randomly choose between hallway or a room
                let spawnX, spawnZ;
                if (Math.random() < 0.5) { // Spawn in hallway
                    spawnX = (Math.random() - 0.5) * (roomSize * 2 - 2); // Within hallway width
                    spawnZ = (Math.random() - 0.5) * (roomSize * 3 - 2); // Within hallway length
                } else { // Spawn in a room
                    spawnX = randomXOffset + (Math.random() - 0.5) * (roomSize - 2);
                    spawnZ = randomZOffset + (Math.random() - 0.5) * (roomSize - 2);
                }

                const position = new THREE.Vector3(spawnX, yOffset, spawnZ);
                this.enemies.push(new Enemy(this.scene, position));
            }
        }
    }

    update(delta, player, lights) {
        // Update each enemy
        for (let i = this.enemies.length - 1; i >= 0; i--) {
            const enemy = this.enemies[i];
            enemy.update(delta, player, lights);
            if (enemy.health <= 0) {
                this.enemies.splice(i, 1); // Remove dead enemies
            }
        }
    }
}
