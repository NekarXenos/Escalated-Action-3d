// enemy.js
import * as THREE from 'three';
import { SETTINGS, ENEMY_SETTINGS } from './settings.js';
// createProjectileFunc will be passed in, which will be createProjectile from projectile.js

/**
 * Creates a single enemy instance.
 * @param {object} config - Configuration object for the enemy.
 * @param {number} config.x - X position.
 * @param {number} config.y - Y position (base of the enemy).
 * @param {number} config.z - Z position.
 * @param {number} config.floorIndex - The floor index this enemy belongs to.
 * @param {THREE.Scene} config.scene - The main Three.js scene.
 * @param {Array<THREE.Mesh>} config.enemiesArray - Array to add this enemy to.
 * @param {Array<THREE.Mesh>} config.worldObjectsArray - Array for collision objects.
 * @param {THREE.Material} config.enemyMaterial - Material for the enemy.
 * @param {THREE.BufferGeometry} config.enemyGeometry - Geometry for the enemy.
 * @returns {THREE.Mesh} The created enemy mesh.
 */
export function createEnemy(config) {
    const {
        x, y, z, floorIndex,
        scene, enemiesArray, worldObjectsArray,
        enemyMaterial, enemyGeometry
    } = config;

    const enemyMesh = new THREE.Mesh(enemyGeometry, enemyMaterial);
    // ENEMY_SETTINGS.height is the full height, so position at y + height/2
    enemyMesh.position.set(x, y + ENEMY_SETTINGS.height / 2, z);
    enemyMesh.castShadow = true;
    enemyMesh.userData = {
        type: 'enemy',
        floorIndex: floorIndex,
        lastShotTime: 0, // in milliseconds
        health: 100, // Basic health
        isDestroyed: false // To prevent further processing if destroyed
    };

    // Ensure bounding box is computed for consistent collision checks
    if (!enemyMesh.geometry.boundingBox) {
        enemyMesh.geometry.computeBoundingBox();
    }

    scene.add(enemyMesh);
    enemiesArray.push(enemyMesh);
    worldObjectsArray.push(enemyMesh); // Enemies are collidable

    return enemyMesh;
}

/**
 * Updates all enemies in the game.
 * @param {object} config - Configuration object for updating enemies.
 * @param {number} config.deltaTime - Time elapsed since the last frame.
 * @param {Array<THREE.Mesh>} config.enemiesArray - Array of enemy meshes.
 * @param {Array<THREE.Mesh>} config.worldObjectsArray - Array of all collidable world objects.
 * @param {THREE.Scene} config.scene - The main Three.js scene.
 * @param {THREE.Clock} config.clock - The game clock.
 * @param {object} config.playerControls - The player's PointerLockControls instance.
 * @param {number} config.playerHeight - The current height of the player's collision shape.
 * @param {Function} config.createProjectileFunc - Function to create a projectile.
 * @param {THREE.Material} config.projectileMaterial - Material for projectiles.
 * @param {THREE.BufferGeometry} config.projectileGeometry - Geometry for projectiles.
 * @param {Array<THREE.Mesh>} config.projectilesArray - Array to add new projectiles to.
 */
export function updateEnemies(config) {
    const {
        deltaTime, enemiesArray, worldObjectsArray, scene, clock,
        playerControls, playerHeight, createProjectileFunc,
        projectileMaterial, projectileGeometry, projectilesArray
    } = config;

    if (!playerControls || !playerControls.isLocked || !playerControls.getObject()) {
        return; // Player controls not ready or not locked
    }

    const playerCameraObject = playerControls.getObject();
    const playerWorldPosition = new THREE.Vector3();
    playerCameraObject.getWorldPosition(playerWorldPosition); // Gets camera's world position

    // Calculate player's body center for more accurate targeting
    const playerBodyCenter = playerWorldPosition.clone();
    playerBodyCenter.y -= playerHeight / 2; // Adjust from camera (eye level) to body center

    for (let i = enemiesArray.length - 1; i >= 0; i--) {
        const enemy = enemiesArray[i];

        if (enemy.userData.isDestroyed || enemy.userData.health <= 0) {
            // If enemy was marked for destruction but not yet removed from arrays
            if (!enemy.userData.isDestroyed) { // Ensure this runs once
                scene.remove(enemy);
                const woIndex = worldObjectsArray.indexOf(enemy);
                if (woIndex > -1) worldObjectsArray.splice(woIndex, 1);
                enemiesArray.splice(i, 1);
                enemy.userData.isDestroyed = true; // Mark as processed for destruction
            }
            continue;
        }

        const enemyPosition = enemy.position.clone();
        const distanceToPlayer = enemyPosition.distanceTo(playerBodyCenter);

        if (distanceToPlayer > ENEMY_SETTINGS.activationRadius) {
            continue; // Player is too far, enemy is not active
        }

        // Enemy looks at player (on the XZ plane)
        const lookAtTarget = playerBodyCenter.clone();
        lookAtTarget.y = enemyPosition.y; // Keep enemy upright
        enemy.lookAt(lookAtTarget);

        // Line of Sight (LOS) check
        const rayOrigin = enemyPosition.clone();
        // Adjust ray origin to be slightly in front and at "eye" level of enemy
        const forwardVectorLOS = new THREE.Vector3(0, 0, -1).applyQuaternion(enemy.quaternion);
        rayOrigin.addScaledVector(forwardVectorLOS, ENEMY_SETTINGS.depth * 0.5 + 0.01); // Start ray just in front
        rayOrigin.y = enemy.position.y + ENEMY_SETTINGS.height * 0.4; // Approximate eye level


        const directionToPlayer = playerBodyCenter.clone().sub(rayOrigin).normalize();
        const raycaster = new THREE.Raycaster(rayOrigin, directionToPlayer, 0.1, ENEMY_SETTINGS.losMaxDistance);

        // Obstacles for LOS: worldObjects excluding the enemy itself and projectiles
        const losObstacles = worldObjectsArray.filter(obj => obj !== enemy && obj.userData.type !== 'projectile' && obj !== playerCameraObject);

        const intersects = raycaster.intersectObjects(losObstacles, false); // Non-recursive for performance

        let playerInLOS = true;
        if (intersects.length > 0) {
            // Check if the first intersected object is closer than the player
            if (intersects[0].distance < distanceToPlayer - (ENEMY_SETTINGS.depth * 0.5 + 0.1)) { // Subtract approx distance from enemy center to ray origin
                playerInLOS = false;
            }
        }

        if (playerInLOS && distanceToPlayer <= ENEMY_SETTINGS.losMaxDistance) {
            const currentTime = clock.getElapsedTime() * 1000; // Convert to milliseconds
            if (currentTime > enemy.userData.lastShotTime + ENEMY_SETTINGS.fireRate) {
                enemy.userData.lastShotTime = currentTime;

                // Calculate fire position (e.g., from a gun barrel)
                const firePosition = enemy.position.clone();
                const forwardVector = new THREE.Vector3(0, 0, -1); // Local forward
                forwardVector.applyQuaternion(enemy.quaternion); // Transform to world forward
                // Position projectile to start slightly in front of the enemy
                firePosition.addScaledVector(forwardVector, ENEMY_SETTINGS.depth / 2 + ENEMY_SETTINGS.projectileSize + 0.1);
                // Adjust Y position if gun is not at enemy's center height
                firePosition.y = enemy.position.y + ENEMY_SETTINGS.height * 0.3; // Example: gun at chest height

                // Direction for projectile is towards player's body center from fire position
                const projectileDirection = playerBodyCenter.clone().sub(firePosition).normalize();

                createProjectileFunc({
                    startPosition: firePosition,
                    direction: projectileDirection,
                    firedByPlayer: false,
                    scene: scene,
                    projectilesArray: projectilesArray,
                    worldObjectsArray: worldObjectsArray,
                    projectileMaterial: projectileMaterial,
                    projectileGeometry: projectileGeometry
                });
            }
        }
    }
}
