/**
 * Solar System Simulator - Deep Space Probe System
 * Manages individual deep space probes loaded on-demand
 * Uses JPL Horizons API for accurate positions
 */

import { KM_PER_UNIT, PROBE_SIZE_KM, DEEP_SPACE_PROBES } from '../core/constants.js';
import { jdToGregorian } from '../core/time-system.js';

/**
 * Probe System Class
 * Manages deep space probe tracking with on-demand loading
 */
export class ProbeSystem {
  constructor(scene, THREE) {
    this.scene = scene;
    this.THREE = THREE;
    this.probes = new Map(); // Map of probeId -> probe data
    this.probesGroup = null;
    this.sizeMultiplier = 1.0;
  }
  
  /**
   * Initialize probe rendering system
   */
  initialize() {
    const THREE = this.THREE;
    
    // Create probes group
    this.probesGroup = new THREE.Group();
    this.probesGroup.name = 'DeepSpaceProbes';
    this.probesGroup.renderOrder = 2;
    this.scene.add(this.probesGroup);
    
    console.log('Probe system initialized');
  }
  
  /**
   * Load a specific probe by ID
   */
  async loadProbe(probeId) {
    // Check if already loaded
    if (this.probes.has(probeId)) {
      console.log(`Probe ${probeId} already loaded`);
      return this.probes.get(probeId);
    }
    
    const probeName = DEEP_SPACE_PROBES[probeId];
    if (!probeName) {
      console.error(`Unknown probe ID: ${probeId}`);
      return null;
    }
    
    console.log(`Loading probe: ${probeName} (ID: ${probeId})`);
    
    // Create mesh for probe
    const sizeKm = PROBE_SIZE_KM * this.sizeMultiplier;
    const geometry = new this.THREE.BoxGeometry(
      sizeKm / KM_PER_UNIT,
      sizeKm / KM_PER_UNIT,
      sizeKm / KM_PER_UNIT
    );
    const material = new this.THREE.MeshBasicMaterial({
      color: 0x00ff00, // Green for probes
      transparent: false
    });
    const mesh = new this.THREE.Mesh(geometry, material);
    mesh.name = probeName;
    mesh.userData = {
      bodyId: parseInt(probeId),
      bodyName: probeName,
      isProbe: true,
      radius: sizeKm / KM_PER_UNIT
    };
    
    this.probesGroup.add(mesh);
    
    // Store probe data
    const probeData = {
      id: probeId,
      name: probeName,
      mesh: mesh,
      position: new this.THREE.Vector3(),
      ephemerisCache: new Map(), // Cache positions by JD
      fetchInProgress: null // Track if a fetch is in progress
    };
    
    this.probes.set(probeId, probeData);
    
    console.log(`Probe ${probeName} loaded successfully`);
    return probeData;
  }
  
  /**
   * Unload a specific probe by ID
   */
  unloadProbe(probeId) {
    const probe = this.probes.get(probeId);
    if (!probe) return;
    
    // Remove mesh
    this.probesGroup.remove(probe.mesh);
    probe.mesh.geometry.dispose();
    probe.mesh.material.dispose();
    
    // Remove from map
    this.probes.delete(probeId);
    
    console.log(`Probe ${probe.name} unloaded`);
  }
  
  /**
   * Update probe positions using JPL Horizons ephemeris
   * This is called every frame but uses cached positions
   */
  async updatePositions(jd) {
    // Round JD to avoid fetching for every tiny time change
    const roundedJD = Math.round(jd * 100) / 100; // Round to 0.01 day (~14 minutes)
    
    for (const [probeId, probe] of this.probes) {
      // Check if we already have a position for this rounded JD
      const cachedPos = probe.ephemerisCache.get(roundedJD);
      if (cachedPos) {
        probe.mesh.position.copy(cachedPos);
        continue;
      }
      
      // Check if a fetch is already in progress for this JD
      if (probe.fetchInProgress === roundedJD) {
        continue; // Skip, already fetching this time
      }
      
      // Mark fetch as in progress
      probe.fetchInProgress = roundedJD;
      
      // Fetch position from Horizons API
      try {
        const position = await this.fetchProbePosition(probeId, roundedJD);
        if (position) {
          probe.mesh.position.copy(position);
          probe.ephemerisCache.set(roundedJD, position.clone());
          
          // Limit cache size to prevent memory issues
          if (probe.ephemerisCache.size > 1000) {
            const firstKey = probe.ephemerisCache.keys().next().value;
            probe.ephemerisCache.delete(firstKey);
          }
        }
      } catch (error) {
        console.error(`Error updating probe ${probe.name}:`, error);
      } finally {
        // Clear fetch in progress flag
        probe.fetchInProgress = null;
      }
    }
  }
  
  /**
   * Fetch probe position from JPL Horizons API
   * Returns position in simulation units (10,000 km per unit)
   */
  async fetchProbePosition(probeId, jd) {
    // Convert JD to calendar date for Horizons API
    const date = jdToGregorian(jd);
    const year = date.year;
    const month = String(date.month).padStart(2, '0');
    const day = String(Math.floor(date.day)).padStart(2, '0');
    
    // Format: 'YYYY-MM-DD' for Horizons API (no time component in URL params)
    const startDateStr = `${year}-${month}-${day}`;
    
    // Horizons requires stop > start, so add 1 day to stop time
    const stopDate = jdToGregorian(jd + 1); // Add 1 day
    const stopYear = stopDate.year;
    const stopMonth = String(stopDate.month).padStart(2, '0');
    const stopDay = String(Math.floor(stopDate.day)).padStart(2, '0');
    
    const stopDateStr = `${stopYear}-${stopMonth}-${stopDay}`;
    
    // Build Horizons API query
    // Using the batch interface for programmatic access
    const params = new URLSearchParams({
      format: 'json',
      COMMAND: probeId,
      OBJ_DATA: 'NO',
      MAKE_EPHEM: 'YES',
      EPHEM_TYPE: 'VECTORS',
      CENTER: '500@0', // Solar System Barycenter
      START_TIME: startDateStr,
      STOP_TIME: stopDateStr,
      STEP_SIZE: '1d',
      VEC_TABLE: '2', // Position only
      REF_PLANE: 'ECLIPTIC',
      REF_SYSTEM: 'J2000',
      VEC_CORR: 'NONE',
      OUT_UNITS: 'KM-S',
      CSV_FORMAT: 'YES'
    });
    
    const url = `https://ssd.jpl.nasa.gov/api/horizons.api?${params.toString()}`;
    
    try {
      const response = await fetch(url);
      const data = await response.json();
      
      if (!data.result) {
        console.error('No result from Horizons API for probe', probeId);
        return null;
      }
      
      // Parse the result text to extract position
      const lines = data.result.split('\n');
      let inData = false;
      let dataLineCount = 0;
      
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        
        // Look for the data section marker
        if (line.includes('$$SOE')) {
          inData = true;
          continue;
        }
        if (line.includes('$$EOE')) {
          break;
        }
        
        if (inData && line.trim()) {
          dataLineCount++;
          
          // The Horizons API with CSV_FORMAT=YES returns comma-separated values
          // Format: JDTDB, Calendar Date (TDB), X, Y, Z, VX, VY, VZ
          // Example: 2460981.500000000, A.D. 2025-Nov-02 00:00:00.0000, -4.752436970136292E+09, ...
          
          const parts = line.split(',').map(s => s.trim());
          
          // We need at least 5 parts: JD, Date, X, Y, Z
          if (parts.length >= 5) {
            // Parse X, Y, Z (indices 2, 3, 4)
            const x = parseFloat(parts[2]) / KM_PER_UNIT;
            const y = parseFloat(parts[3]) / KM_PER_UNIT;
            const z = parseFloat(parts[4]) / KM_PER_UNIT;
            
            if (!isNaN(x) && !isNaN(y) && !isNaN(z)) {
              console.log(`Probe ${probeId} (${DEEP_SPACE_PROBES[probeId]}) position: [${x.toFixed(2)}, ${y.toFixed(2)}, ${z.toFixed(2)}] units`);
              return new this.THREE.Vector3(x, y, z);
            } else {
              console.warn(`Failed to parse coordinates from parts:`, parts.slice(2, 5));
            }
          } else {
            console.warn(`Not enough parts in line (${parts.length}):`, line.substring(0, 100));
          }
        }
      }
      
      // Find $$SOE section for debugging
      const soeIndex = data.result.indexOf('$$SOE');
      const eoeIndex = data.result.indexOf('$$EOE');
      if (soeIndex >= 0 && eoeIndex >= 0) {
        const dataSection = data.result.substring(soeIndex, Math.min(eoeIndex + 50, soeIndex + 500));
        console.warn(`Could not parse position for probe ${probeId}. Data section:`, dataSection);
      } else {
        console.warn(`Could not parse position for probe ${probeId}. No $$SOE/$$EOE markers found. Response length:`, data.result.length);
      }
      return null;
      
    } catch (error) {
      console.error(`Error fetching probe position from Horizons:`, error);
      return null;
    }
  }
  
  /**
   * Get all loaded probes
   */
  getLoadedProbes() {
    return Array.from(this.probes.values());
  }
  
  /**
   * Get probe by ID
   */
  getProbe(probeId) {
    return this.probes.get(probeId);
  }
  
  /**
   * Check if probe is loaded
   */
  isProbeLoaded(probeId) {
    return this.probes.has(probeId);
  }
  
  /**
   * Get all probe meshes for picking/interaction
   */
  getProbeMeshes() {
    return Array.from(this.probes.values()).map(p => p.mesh);
  }
  
  /**
   * Set probe size multiplier
   */
  setProbeScale(multiplier) {
    this.sizeMultiplier = multiplier;
    
    // Update existing probe sizes
    const newSizeKm = PROBE_SIZE_KM * multiplier;
    for (const probe of this.probes.values()) {
      const oldGeom = probe.mesh.geometry;
      probe.mesh.geometry = new this.THREE.BoxGeometry(
        newSizeKm / KM_PER_UNIT,
        newSizeKm / KM_PER_UNIT,
        newSizeKm / KM_PER_UNIT
      );
      oldGeom.dispose();
      probe.mesh.userData.radius = newSizeKm / KM_PER_UNIT;
    }
  }
  
  /**
   * Clear all probes
   */
  clear() {
    for (const probeId of Array.from(this.probes.keys())) {
      this.unloadProbe(probeId);
    }
  }
  
  /**
   * Dispose resources
   */
  dispose() {
    this.clear();
    if (this.probesGroup) {
      this.scene.remove(this.probesGroup);
    }
  }
}
