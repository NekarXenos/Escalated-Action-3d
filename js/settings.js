// settings.js

// IMPORTANT: Left is +X and Right is -X in this world
// Up is +Y and Down is -Y in this world
// +Z is forward and -Z is backward in this world

export const SETTINGS = {
    numFloors: 3, // Number of floors
    doorsPerSide: 3,
    corridorSegmentLength: 5, // Length of corridor section for one door pair
    corridorWidth: 4,
    wallHeight: 3.5,
    numBasementFloors: 1, // Number of basement floors (e.g., 1 means one level below ground at index -1)
    floorHeight: 4, // Vertical distance between floors
    doorWidth: 1,
    doorHeight: 2.1,
    doorDepth: 0.15,
    elevatorSpeed: 4.0, // Units per second
    elevatorSize: 4.0,
    playerSpeed: 5.0,
    sprintMultiplier: 1.8,
    jumpVelocity: 7.0,
    gravity: -18.0,
    lookSensitivity: 0.002, // PointerLockControls sensitivity is different
    escalatorLength: 4.0,
    escalatorWidth: 3.0,
    escalatorSpeed: 1.0,
    roomSize: 5.0,
};

export const ENEMY_SETTINGS = {
    height: 1.8,
    width: 0.5,
    depth: 0.5,
    fireRate: 2000, // milliseconds between shots
    projectileSpeed: 15.0,
    projectileSize: 0.1,
    activationRadius: 40, // Enemies become active if player is within this radius
    losMaxDistance: 50,   // Max distance for line of sight check
};

// Reusable Lamp Geometries & Materials (defined once)
// These are used by multiple modules, so keeping them with settings or in a dedicated graphics_common.js might be an option.
// For now, let's keep them here as they are static configurations.
import * as THREE from 'three';

export const lampConeGeo = new THREE.ConeGeometry(0.3, 0.2, 16);
export const lampChainGeo = new THREE.BoxGeometry(0.05, 0.5, 0.05);
export const lampBulbGeo = new THREE.SphereGeometry(0.08, 16, 8); // bulbRadius = 0.08
export const lampBottomDiskGeo = new THREE.CircleGeometry(0.3, 16);

// Materials for standard corridor/area lamps (non-animated parts)
export const lampChainMaterial = new THREE.MeshStandardMaterial({ color: 0x111111 });
export const lampLampshadeMaterial = new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0x000000, emissiveIntensity: 0.0 });
// This material is for the glowing disk of corridor/area lamps, which is statically emissive.
export const lampCorridorDiskMaterial = new THREE.MeshStandardMaterial({ color: 0xffaa77, emissive: 0xffaa77, emissiveIntensity: 1 });
