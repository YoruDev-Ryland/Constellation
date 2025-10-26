/**
 * Solar System Simulator - Satellite System
 * Manages Earth satellites using SGP4 orbit propagation
 * Uses Earth-local coordinate frame with smooth interpolation (like original web version)
 * Note: Requires satellite.js library to be loaded
 */

import { KM_PER_UNIT, SATELLITE_BASE_SCALE } from '../core/constants.js';
import { jdToDate } from '../core/time-system.js';

/**
 * Satellite System Class
 * Manages Earth satellite tracking and rendering with smooth interpolation
 * Satellites are stored in ECI km coordinates within an Earth-local frame
 */
export class SatelliteSystem {
  constructor(scene, THREE) {
    this.scene = scene;
    this.THREE = THREE;
    this.satellites = [];
    this.satelliteMeshes = []; // Individual meshes, not instanced
    this.satellitesGroup = null;
    this.earthFrame = null;
    this.sizeMultiplier = 1.0;
    this.maxSatellites = 13000;
    this.currentGroup = null;
    this.earthPosGetter = null; // Function to get Earth position
    
    // Smooth interpolation system (exactly like the original web version)
    this.lastSatUpdate = 0;
    this.SAT_UPDATE_INTERVAL = 1000; // Update coordinates every 1 second
    this.coordinateUpdateStartTime = 0;
    this.actualUpdateDuration = 1000; // Measured timing, starts at 1 second
  }
  
  /**
   * Initialize satellite rendering system with Earth-local frame
   */
  initialize() {
    const THREE = this.THREE;
    
    // Create Earth-local frame (scaled to keep satellites in km coordinates)
    this.earthFrame = new THREE.Group();
    this.earthFrame.name = 'EarthFrame';
    this.earthFrame.scale.setScalar(1 / KM_PER_UNIT);
    this.scene.add(this.earthFrame);
    
    // Satellites group within Earth frame
    this.satellitesGroup = new THREE.Group();
    this.satellitesGroup.name = 'Satellites';
    this.satellitesGroup.renderOrder = 1;
    this.earthFrame.add(this.satellitesGroup);
  }
  
  /**
   * Set function to get Earth position
   */
  setEarthPositionGetter(getter) {
    this.earthPosGetter = getter;
  }
  
  /**
   * Update Earth frame position to follow Earth
   */
  updateEarthFrame() {
    if (!this.earthPosGetter) return;
    const earthPos = this.earthPosGetter();
    this.earthFrame.position.copy(earthPos);
  }
  
  /**
   * Load satellites from TLE data
   */
  async loadSatelliteGroup(group) {
    if (typeof satellite === 'undefined') {
      console.error('satellite.js library not loaded');
      return false;
    }
    
    try {
      const tleData = await this.fetchTLEData(group);
      
      // Clear existing satellites
      this.clear();
      
      // Get current size in km
      const sizeKm = this.getCurrentSatSizeKm();
      
      // Create individual meshes (like original - not instanced for easier interpolation)
      for (const tle of tleData.slice(0, this.maxSatellites)) {
        const satrec = satellite.twoline2satrec(tle.line1, tle.line2);
        
        // Initial position
        const now = new Date();
        const posVel = satellite.propagate(satrec, now);
        if (!posVel.position) continue;
        
        // Create mesh in ECI km coordinates (no conversion!)
        const geometry = new this.THREE.BoxGeometry(sizeKm, sizeKm, sizeKm);
        const material = new this.THREE.MeshBasicMaterial({
          color: 0xfca5a5,
          transparent: false
        });
        const mesh = new this.THREE.Mesh(geometry, material);
        mesh.frustumCulled = false;
        
        // Set initial position in ECI km
        mesh.position.set(
          posVel.position.x,
          posVel.position.y,
          posVel.position.z
        );
        
        // Store satellite data
        mesh.userData = {
          satrec: satrec,
          name: tle.name,
          radius: sizeKm,
          baseSize: sizeKm,
          // Interpolation state (exactly like original)
          startPosition: new this.THREE.Vector3(),
          targetPosition: new this.THREE.Vector3(),
          interpolationStartTime: null,
          hasStarted: false
        };
        
        this.satellitesGroup.add(mesh);
        this.satelliteMeshes.push(mesh);
        this.satellites.push({
          name: tle.name,
          satrec: satrec,
          mesh: mesh
        });
      }
      
      this.currentGroup = group;
      
      // Reset timing
      this.lastSatUpdate = 0;
      this.coordinateUpdateStartTime = 0;
      
      // Initialize first interpolation cycle
      if (this.satelliteMeshes.length > 0) {
        this.updateSatelliteTargets(Date.now());
      }
      
      console.log(`Loaded ${this.satelliteMeshes.length} satellites from group: ${group}`);
      return true;
    } catch (error) {
      console.error('Error loading satellites:', error);
      return false;
    }
  }
  
  /**
   * Fetch TLE data from CelesTrak
   */
  async fetchTLEData(group) {
    const url = group === 'starlink'
      ? 'https://celestrak.org/NORAD/elements/supplemental/sup-gp.php?FILE=starlink&FORMAT=tle'
      : `https://celestrak.org/NORAD/elements/gp.php?GROUP=${group}&FORMAT=tle`;
    
    const response = await fetch(url);
    const text = await response.text();
    
    // Parse TLE format (3 lines per satellite)
    const lines = text.trim().split('\n');
    const satellites = [];
    
    for (let i = 0; i < lines.length; i += 3) {
      if (i + 2 >= lines.length) break;
      
      const name = lines[i].trim();
      const line1 = lines[i + 1];
      const line2 = lines[i + 2];
      
      satellites.push({ name, line1, line2 });
    }
    
    return satellites;
  }
  
  /**
   * Update satellite positions with smooth interpolation (exactly like original web version)
   * Call this every frame for smooth motion
   */
  updatePositions(jd, currentTime) {
    if (!this.satelliteMeshes.length) return;
    if (typeof satellite === 'undefined') return;
    
    // Update Earth frame position
    this.updateEarthFrame();
    
    // Check if we need to calculate new target positions (every 1 second)
    if (currentTime - this.lastSatUpdate > this.SAT_UPDATE_INTERVAL) {
      this.updateSatelliteTargets(currentTime);
      this.lastSatUpdate = currentTime;
    }
    
    // Smooth interpolation for each satellite (with easing like original)
    for (const mesh of this.satelliteMeshes) {
      if (mesh.userData.interpolationStartTime !== null) {
        const elapsed = currentTime - mesh.userData.interpolationStartTime;
        const progress = Math.min(1, elapsed / this.actualUpdateDuration);
        
        // Smooth easing (ease-in-out cubic) - exactly like original
        const smoothT = progress < 0.5 
          ? 2 * progress * progress 
          : -1 + (4 - 2 * progress) * progress;
        
        mesh.position.lerpVectors(
          mesh.userData.startPosition,
          mesh.userData.targetPosition,
          smoothT
        );
      }
    }
  }
  
  /**
   * Calculate new target positions for all satellites
   * Measures actual calculation time for smooth interpolation
   * Exactly like original web version
   */
  updateSatelliteTargets(currentTime) {
    if (typeof satellite === 'undefined') return;
    
    const measureStart = performance.now();
    
    const nowDate = new Date(currentTime);
    const nextDate = new Date(currentTime + this.SAT_UPDATE_INTERVAL);
    
    for (const mesh of this.satelliteMeshes) {
      try {
        // Get current position (NOW)
        const currentPv = satellite.propagate(mesh.userData.satrec, nowDate);
        // Get next position (1 second in the future)
        const nextPv = satellite.propagate(mesh.userData.satrec, nextDate);
        
        if (currentPv.position && nextPv.position) {
          // Store in ECI km coordinates (NO conversion)
          mesh.userData.startPosition.set(
            currentPv.position.x,
            currentPv.position.y,
            currentPv.position.z
          );
          mesh.userData.targetPosition.set(
            nextPv.position.x,
            nextPv.position.y,
            nextPv.position.z
          );
          mesh.userData.interpolationStartTime = currentTime;
          
          // If first update, set position immediately
          if (!mesh.userData.hasStarted) {
            mesh.position.copy(mesh.userData.startPosition);
            mesh.userData.hasStarted = true;
          }
        }
      } catch (error) {
        // Satellite propagation error - skip this one
        continue;
      }
    }
    
    // Measure how long coordinate calculation actually took
    const measureEnd = performance.now();
    const calculationTime = measureEnd - measureStart;
    
    // Use the actual time from when we started checking until now
    if (this.coordinateUpdateStartTime > 0) {
      this.actualUpdateDuration = currentTime - this.coordinateUpdateStartTime + calculationTime;
      // Clamp to reasonable bounds
      this.actualUpdateDuration = Math.max(800, Math.min(3000, this.actualUpdateDuration));
    }
    
    this.coordinateUpdateStartTime = currentTime;
  }
  
  /**
   * Get current satellite size in km
   */
  getCurrentSatSizeKm() {
    // Base size of 10 km at 1x scale (can go down to 0.1x for 1 km)
    const BASE_SIZE_KM = 10;
    return BASE_SIZE_KM * this.sizeMultiplier;
  }
  
  /**
   * Set satellite size multiplier
   */
  setSatelliteScale(multiplier) {
    this.sizeMultiplier = multiplier;
    
    // Update existing satellite sizes
    const newSizeKm = this.getCurrentSatSizeKm();
    for (const mesh of this.satelliteMeshes) {
      const oldGeom = mesh.geometry;
      mesh.geometry = new this.THREE.BoxGeometry(newSizeKm, newSizeKm, newSizeKm);
      oldGeom.dispose();
      mesh.userData.baseSize = newSizeKm;
      mesh.userData.radius = newSizeKm;
    }
  }
  
  /**
   * Clear all satellites
   */
  clear() {
    // Dispose geometries and remove meshes
    for (const mesh of this.satelliteMeshes) {
      mesh.geometry.dispose();
      mesh.material.dispose();
      this.satellitesGroup.remove(mesh);
    }
    
    this.satellites = [];
    this.satelliteMeshes = [];
    this.currentGroup = null;
  }
  
  /**
   * Get current satellite count
   */
  getSatelliteCount() {
    return this.satelliteMeshes.length;
  }
  
  /**
   * Get satellite meshes for picking/interaction
   */
  getSatelliteMeshes() {
    return this.satelliteMeshes;
  }
}
