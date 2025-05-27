import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.128.0/build/three.module.js';

export class Player {
    constructor(scene, camera) {
        this.scene = scene;
        this.camera = camera; // Reference to the main camera
        this.geometry = new THREE.BoxGeometry(1, 2, 1);
        this.material = new THREE.MeshStandardMaterial({ color: 0x00ff00, emissive: 0x003300 }); // Brighter green
        this.mesh = new THREE.Mesh(this.geometry, this.material);
        this.mesh.position.set(0, 1.5, 0); // Start slightly above floor
        this.mesh.castShadow = true; // Player casts shadow
        this.mesh.receiveShadow = true; // Player receives shadow
        scene.add(this.mesh);

        this.velocity = new THREE.Vector3();
        this.speed = 5;
        this.gravity = -9.8; // Gravity constant
        this.onGround = false; // Flag to check if player is on ground

        this.initControls();
    }

    initControls() {
        this.keys = {};
        window.addEventListener('keydown', (e) => this.keys[e.code] = true);
        window.addEventListener('keyup', (e) => this.keys[e.code] = false);

        // Mouse click for shooting
        window.addEventListener('click', (e) => {
            if (e.button === 0) { // Left mouse button
                // This will be handled by InteractionManager
                // For now, it could be a placeholder if shooting logic is in Player
            }
        });
    }

    update(delta, floors) {
        // Apply gravity
        if (!this.onGround) {
            this.velocity.y += this.gravity * delta;
        }

        // Reset horizontal velocity
        this.velocity.x = 0;
        this.velocity.z = 0;

        // Handle horizontal movement based on keys
        const moveSpeed = this.speed * delta;
        if (this.keys['KeyW']) this.velocity.z -= moveSpeed;
        if (this.keys['KeyS']) this.velocity.z += moveSpeed;
        if (this.keys['KeyA']) this.velocity.x -= moveSpeed;
        if (this.keys['KeyD']) this.velocity.x += moveSpeed;

        // Normalize diagonal movement
        if (this.velocity.x !== 0 && this.velocity.z !== 0) {
            this.velocity.normalize().multiplyScalar(moveSpeed);
            this.velocity.y = this.velocity.y / moveSpeed * (this.speed * delta); // Preserve vertical velocity
        }

        // Update player position
        this.mesh.position.add(this.velocity);

        // --- Collision Detection with Floors ---
        this.onGround = false;
        const playerBottom = this.mesh.position.y - this.geometry.parameters.height / 2;

        for (let floorGroup of floors) {
            // Assuming floorGroup contains the hallway mesh at index 0
            const floorMesh = floorGroup.children[0];
            if (floorMesh) {
                const floorTop = floorMesh.position.y + floorMesh.geometry.parameters.height / 2;

                // Simple AABB collision check
                // Check if player is above the floor and within its XZ bounds
                if (playerBottom <= floorTop + 0.1 && playerBottom >= floorTop - 0.5) { // Small tolerance for landing
                    const playerMinX = this.mesh.position.x - this.geometry.parameters.width / 2;
                    const playerMaxX = this.mesh.position.x + this.geometry.parameters.width / 2;
                    const playerMinZ = this.mesh.position.z - this.geometry.parameters.depth / 2;
                    const playerMaxZ = this.mesh.position.z + this.geometry.parameters.depth / 2;

                    const floorMinX = floorMesh.position.x - floorMesh.geometry.parameters.width / 2;
                    const floorMaxX = floorMesh.position.x + floorMesh.geometry.parameters.width / 2;
                    const floorMinZ = floorMesh.position.z - floorMesh.geometry.parameters.depth / 2;
                    const floorMaxZ = floorMesh.position.z + floorMesh.geometry.parameters.depth / 2;

                    if (playerMaxX > floorMinX && playerMinX < floorMaxX &&
                        playerMaxZ > floorMinZ && playerMinZ < floorMaxZ) {
                        this.mesh.position.y = floorTop + this.geometry.parameters.height / 2;
                        this.velocity.y = 0;
                        this.onGround = true;
                        break; // Player is on a floor, no need to check other floors
                    }
                }
            }
        }

        // --- Camera Follow Logic (Third-Person) ---
        const cameraOffset = new THREE.Vector3(0, 8, 18); // Offset from player (higher and further back)
        this.camera.position.copy(this.mesh.position).add(cameraOffset);
        this.camera.lookAt(this.mesh.position.x, this.mesh.position.y + 1, this.mesh.position.z); // Look slightly above player's base
    }
}