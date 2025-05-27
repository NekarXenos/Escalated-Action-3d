// File: enemy.js
import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.128.0/build/three.module.js';

export class Enemy {
    constructor(scene, position) {
        this.scene = scene;
        this.geometry = new THREE.BoxGeometry(1, 2, 1);
        this.material = new THREE.MeshStandardMaterial({ color: 0xff0000 }); // Red block for enemy
        this.mesh = new THREE.Mesh(this.geometry, this.material);
        this.mesh.position.copy(position);
        this.mesh.castShadow = true;
        this.mesh.receiveShadow = true;
        scene.add(this.mesh);

        this.health = 100;
        this.speed = 2;
        this.direction = new THREE.Vector3(Math.random() - 0.5, 0, Math.random() - 0.5).normalize();
        this.patrolRadius = 5; // How far it patrols from its spawn point
        this.spawnPoint = position.clone();

        this.lastDirectionChange = 0;
        this.directionChangeInterval = 2 + Math.random() * 3; // Change direction every 2-5 seconds
    }

    update(delta, player, lights) {
        // Simple patrolling behavior
        this.lastDirectionChange += delta;
        if (this.lastDirectionChange > this.directionChangeInterval) {
            this.direction.set(Math.random() - 0.5, 0, Math.random() - 0.5).normalize();
            this.lastDirectionChange = 0;
            this.directionChangeInterval = 2 + Math.random() * 3;
        }

        // Move the enemy
        this.mesh.position.x += this.direction.x * this.speed * delta;
        this.mesh.position.z += this.direction.z * this.speed * delta;

        // Keep enemy within a patrol radius around its spawn point
        const currentDistance = this.mesh.position.distanceTo(this.spawnPoint);
        if (currentDistance > this.patrolRadius) {
            // Move back towards spawn point
            this.direction.subVectors(this.spawnPoint, this.mesh.position).normalize();
            this.mesh.position.x += this.direction.x * this.speed * delta;
            this.mesh.position.z += this.direction.z * this.speed * delta;
        }

        // --- Light Interaction (Damage when lights are off) ---
        // Find the current floor the enemy is on
        const enemyFloorY = Math.floor((this.mesh.position.y - 1.5) / 5) * 5 + 1.5; // Approximate floor center Y

        for (let lightInfo of lights) {
            const light = lightInfo.light;
            // Check if light is on the same floor as the enemy and is within range
            if (light.position.y - 4.5 === enemyFloorY - 1.5) { // Compare floor Y levels
                const distToLight = this.mesh.position.distanceTo(light.position);
                if (distToLight < light.distance) { // Within light's effective range
                    if (!lightInfo.active && lightInfo.initialIntensity > 0) { // If light is shot down and was initially active
                        // Apply damage over time or a one-time damage
                        this.takeDamage(10 * delta); // Example: 10 damage per second in darkness
                        // console.log(`Enemy at ${this.mesh.position.x.toFixed(1)},${this.mesh.position.y.toFixed(1)},${this.mesh.position.z.toFixed(1)} taking damage. Health: ${this.health.toFixed(1)}`);
                    }
                }
            }
        }

        if (this.health <= 0) {
            this.die();
        }
    }

    takeDamage(amount) {
        this.health -= amount;
        if (this.health < 0) this.health = 0;
        // console.log(`Enemy health: ${this.health}`);
        // Optional: Change color to indicate damage
        this.mesh.material.color.setHex(0xff0000 + (Math.floor(this.health / 100 * 0x55) << 8)); // Fades to darker red
    }

    die() {
        this.scene.remove(this.mesh);
        // Remove from enemyManager's list
        this.mesh.parent = null; // Detach from scene graph
        console.log('Enemy destroyed!');
    }
}