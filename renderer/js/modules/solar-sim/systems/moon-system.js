/**
 * Solar System Simulator - Moon System
 * Manages moon rendering, orbital motion, and textures
 */

import { KM_PER_UNIT } from '../core/constants.js';

/**
 * Moon data: radius (km), orbital radius (km), orbital period (days), color fallback
 * inclination: orbital inclination in degrees (relative to parent planet's equatorial plane)
 */
export const MOON_DATA = {
  // Earth's Moon
  301: {
    name: 'Moon',
    parentId: 399,
    radius: 1737.4,
    orbitRadius: 384400,
    orbitPeriod: 27.322,
    inclination: 5.145, // Inclination to ecliptic (not equator)
    color: 0x9a9a9a,
    texture: '8k_moon.jpg',
    rotationHours: 655.728 // Tidally locked (same as orbital period)
  },
  
  // Mars Moons
  401: {
    name: 'Phobos',
    parentId: 499,
    radius: 11.267,
    orbitRadius: 9376,
    orbitPeriod: 0.319,
    inclination: 1.08, // degrees to Mars equator
    color: 0x6b5d54,
    texture: null,
    rotationHours: 7.65 // Tidally locked
  },
  402: {
    name: 'Deimos',
    parentId: 499,
    radius: 6.2,
    orbitRadius: 23463,
    orbitPeriod: 1.263,
    inclination: 1.79, // degrees to Mars equator
    color: 0x7a6e5f,
    texture: null,
    rotationHours: 30.3 // Tidally locked
  },
  
  // Jupiter's Galilean Moons
  501: {
    name: 'Io',
    parentId: 599,
    radius: 1821.6,
    orbitRadius: 421700,
    orbitPeriod: 1.769,
    inclination: 0.05, // degrees to Jupiter equator
    color: 0xffdd77,
    texture: null,
    rotationHours: 42.46 // Tidally locked
  },
  502: {
    name: 'Europa',
    parentId: 599,
    radius: 1560.8,
    orbitRadius: 671034,
    orbitPeriod: 3.551,
    inclination: 0.47, // degrees to Jupiter equator
    color: 0xddb588,
    texture: null,
    rotationHours: 85.23 // Tidally locked
  },
  503: {
    name: 'Ganymede',
    parentId: 599,
    radius: 2634.1,
    orbitRadius: 1070412,
    orbitPeriod: 7.155,
    inclination: 0.20, // degrees to Jupiter equator
    color: 0xa89988,
    texture: null,
    rotationHours: 171.7 // Tidally locked
  },
  504: {
    name: 'Callisto',
    parentId: 599,
    radius: 2410.3,
    orbitRadius: 1882709,
    orbitPeriod: 16.689,
    inclination: 0.51, // degrees to Jupiter equator
    color: 0x6d6654,
    texture: null,
    rotationHours: 400.5 // Tidally locked
  },
  
  // Saturn's Major Moons
  601: {
    name: 'Mimas',
    parentId: 699,
    radius: 198.2,
    orbitRadius: 185539,
    orbitPeriod: 0.942,
    inclination: 1.53, // degrees to Saturn equator
    color: 0xc9c5c0,
    texture: null,
    rotationHours: 22.6 // Tidally locked
  },
  602: {
    name: 'Enceladus',
    parentId: 699,
    radius: 252.1,
    orbitRadius: 237948,
    orbitPeriod: 1.370,
    inclination: 0.02, // degrees to Saturn equator
    color: 0xf0f0f0,
    texture: null,
    rotationHours: 32.9 // Tidally locked
  },
  603: {
    name: 'Tethys',
    parentId: 699,
    radius: 531.1,
    orbitRadius: 294619,
    orbitPeriod: 1.888,
    inclination: 1.09, // degrees to Saturn equator
    color: 0xe8e6e3,
    texture: null,
    rotationHours: 45.3 // Tidally locked
  },
  604: {
    name: 'Dione',
    parentId: 699,
    radius: 561.4,
    orbitRadius: 377396,
    orbitPeriod: 2.737,
    inclination: 0.02, // degrees to Saturn equator
    color: 0xd5d3cf,
    texture: null,
    rotationHours: 65.7 // Tidally locked
  },
  605: {
    name: 'Rhea',
    parentId: 699,
    radius: 763.8,
    orbitRadius: 527108,
    orbitPeriod: 4.518,
    inclination: 0.35, // degrees to Saturn equator
    color: 0xc8c6c2,
    texture: null,
    rotationHours: 108.4 // Tidally locked
  },
  606: {
    name: 'Titan',
    parentId: 699,
    radius: 2574.7,
    orbitRadius: 1221870,
    orbitPeriod: 15.945,
    inclination: 0.33, // degrees to Saturn equator
    color: 0xffa847,
    texture: null,
    rotationHours: 382.7 // Tidally locked
  },
  608: {
    name: 'Iapetus',
    parentId: 699,
    radius: 734.5,
    orbitRadius: 3560820,
    orbitPeriod: 79.330,
    inclination: 15.47, // degrees to Saturn equator (highly inclined!)
    color: 0x8a7f6f,
    texture: null,
    rotationHours: 1903.9 // Tidally locked
  },
  
  // Uranus' Major Moons
  701: {
    name: 'Ariel',
    parentId: 799,
    radius: 578.9,
    orbitRadius: 190900,
    orbitPeriod: 2.520,
    inclination: 0.26, // degrees to Uranus equator
    color: 0xb8b5b0,
    texture: null,
    rotationHours: 60.5 // Tidally locked
  },
  702: {
    name: 'Umbriel',
    parentId: 799,
    radius: 584.7,
    orbitRadius: 266000,
    orbitPeriod: 4.144,
    inclination: 0.13, // degrees to Uranus equator
    color: 0x5a5550,
    texture: null,
    rotationHours: 99.5 // Tidally locked
  },
  703: {
    name: 'Titania',
    parentId: 799,
    radius: 788.4,
    orbitRadius: 435910,
    orbitPeriod: 8.706,
    inclination: 0.34, // degrees to Uranus equator
    color: 0xa39d95,
    texture: null,
    rotationHours: 208.9 // Tidally locked
  },
  704: {
    name: 'Oberon',
    parentId: 799,
    radius: 761.4,
    orbitRadius: 583520,
    orbitPeriod: 13.463,
    inclination: 0.07, // degrees to Uranus equator
    color: 0x9a8f82,
    texture: null,
    rotationHours: 323.1 // Tidally locked
  },
  705: {
    name: 'Miranda',
    parentId: 799,
    radius: 235.8,
    orbitRadius: 129390,
    orbitPeriod: 1.413,
    inclination: 4.22, // degrees to Uranus equator
    color: 0xc5c0ba,
    texture: null,
    rotationHours: 33.9 // Tidally locked
  },
  
  // Neptune's Major Moon
  801: {
    name: 'Triton',
    parentId: 899,
    radius: 1353.4,
    orbitRadius: 354759,
    orbitPeriod: -5.877, // Retrograde orbit
    inclination: 156.87, // Highly inclined retrograde orbit!
    color: 0xf0e0d0,
    texture: null,
    rotationHours: -141.0 // Tidally locked, retrograde
  },
  
  // Pluto's Moon
  901: {
    name: 'Charon',
    parentId: 999,
    radius: 606.0,
    orbitRadius: 19591,
    orbitPeriod: 6.387,
    inclination: 0.08, // degrees to Pluto's equator
    color: 0x8b8680,
    texture: null,
    rotationHours: 153.3 // Tidally locked
  }
};

export class MoonSystem {
  constructor(THREE, scene, textureLoader) {
    this.THREE = THREE;
    this.scene = scene;
    this.textureLoader = textureLoader;
    
    this.moons = new Map(); // moonId -> moon object
    this.textures = new Map(); // moonId -> texture
    this.moonScaleMultiplier = 1; // 1:1 scale - moons at real size relative to planets
  }

  /**
   * Initialize moon system and load textures
   */
  async initialize() {
    console.log('Initializing Moon System...');
    
    // Load available textures
    await this.loadTextures();
    
    console.log('Moon System initialized');
  }

  /**
   * Load moon textures
   */
  async loadTextures() {
    const texturePromises = [];
    
    for (const [moonId, moonData] of Object.entries(MOON_DATA)) {
      if (moonData.texture) {
        const promise = new Promise((resolve) => {
          this.textureLoader.load(
            `./assets/textures/planets/${moonData.texture}`,
            (texture) => {
              console.log(`Loaded moon texture: ${moonData.texture}`);
              this.textures.set(parseInt(moonId), texture);
              resolve();
            },
            undefined,
            (error) => {
              console.warn(`Could not load moon texture: ${moonData.texture}`, error);
              resolve();
            }
          );
        });
        texturePromises.push(promise);
      }
    }
    
    await Promise.all(texturePromises);
  }

  /**
   * Create a moon
   * @param {number} moonId - NAIF ID of the moon
   * @param {THREE.Object3D} parentPlanetGroup - Parent planet's bodyGroup
   * @returns {Object} Moon node structure
   */
  createMoon(moonId, parentPlanetGroup) {
    const moonData = MOON_DATA[moonId];
    if (!moonData) {
      console.warn(`No data for moon ID ${moonId}`);
      return null;
    }

    // Calculate visual sizes
    const visualRadius = (moonData.radius / KM_PER_UNIT) * this.moonScaleMultiplier;
    const orbitRadius = moonData.orbitRadius / KM_PER_UNIT;

    // Simple hierarchy: moonGroup -> moonSpin -> moonMesh
    // Position will be calculated directly in world space
    const moonGroup = new this.THREE.Group();
    moonGroup.name = `${moonData.name}_group`;

    const moonSpin = new this.THREE.Group();
    moonSpin.name = `${moonData.name}_spin`;

    // Create moon mesh
    const geometry = new this.THREE.SphereGeometry(visualRadius, 32, 32);
    
    let material;
    const texture = this.textures.get(moonId);
    
    if (texture) {
      // Use texture if available
      material = new this.THREE.MeshStandardMaterial({
        map: texture,
        roughness: 0.9,
        metalness: 0.1
      });
    } else {
      // Use fallback color
      material = new this.THREE.MeshStandardMaterial({
        color: moonData.color,
        roughness: 0.9,
        metalness: 0.1
      });
    }

    const moonMesh = new this.THREE.Mesh(geometry, material);
    moonMesh.name = moonData.name;
    moonMesh.castShadow = true;
    moonMesh.receiveShadow = true;

    // Create pole spike (axis indicator)
    const spikeHeight = visualRadius * 3;
    const poleSpike = this.createPoleSpike(spikeHeight, moonData.color);
    moonSpin.add(poleSpike);

    // Create orbit line (tilted by inclination)
    const orbitLine = this.createOrbitLine(orbitRadius, moonData.color);
    if (moonData.inclination) {
      orbitLine.rotation.x = (moonData.inclination * Math.PI) / 180;
    }
    parentPlanetGroup.add(orbitLine);

    // Assemble hierarchy
    moonSpin.add(moonMesh);
    moonGroup.add(moonSpin);
    parentPlanetGroup.add(moonGroup);

    // Store moon data with starting orbital phase
    const moonObject = {
      id: moonId,
      name: moonData.name,
      parentId: moonData.parentId,
      data: moonData,
      nodes: {
        group: moonGroup,
        spin: moonSpin,
        mesh: moonMesh,
        orbitLine: orbitLine
      },
      orbitPhase: Math.random() * Math.PI * 2, // Random starting phase
      orbitRadius: orbitRadius // Store scaled orbit radius
    };

    this.moons.set(moonId, moonObject);

    console.log(`Created moon: ${moonData.name} (ID: ${moonId}) orbiting ${moonData.parentId}`);

    return moonObject;
  }

  /**
   * Create pole spike (axis indicator) for a moon
   * @param {number} height - Height of the spike
   * @param {number} color - Color of the spike
   * @returns {THREE.Line} - Pole spike line
   */
  createPoleSpike(height, color) {
    const points = [
      new this.THREE.Vector3(0, 0, -height / 2),
      new this.THREE.Vector3(0, 0, height / 2)
    ];
    
    const geometry = new this.THREE.BufferGeometry().setFromPoints(points);
    const material = new this.THREE.LineBasicMaterial({
      color: color,
      opacity: 0.6,
      transparent: true
    });
    
    const line = new this.THREE.Line(geometry, material);
    line.name = 'poleSpike';
    return line;
  }

  /**
   * Create orbit line for a moon
   * @param {number} radius - Orbit radius
   * @param {number} color - Color of the orbit line
   * @returns {THREE.Line} - Orbit line
   */
  createOrbitLine(radius, color) {
    const segments = 128;
    const points = [];
    
    for (let i = 0; i <= segments; i++) {
      const theta = (i / segments) * Math.PI * 2;
      points.push(new this.THREE.Vector3(
        Math.cos(theta) * radius,
        Math.sin(theta) * radius,
        0
      ));
    }
    
    const geometry = new this.THREE.BufferGeometry().setFromPoints(points);
    const material = new this.THREE.LineBasicMaterial({
      color: color,
      opacity: 0.4,
      transparent: true
    });
    
    const line = new this.THREE.Line(geometry, material);
    line.name = 'orbitLine';
    return line;
  }

  /**
   * Create all moons for a specific planet
   * @param {number} planetId - NAIF ID of the parent planet
   * @param {THREE.Object3D} planetGroup - Parent planet's bodyGroup
   */
  createMoonsForPlanet(planetId, planetGroup) {
    const moons = [];
    
    for (const [moonId, moonData] of Object.entries(MOON_DATA)) {
      if (moonData.parentId === planetId) {
        const moon = this.createMoon(parseInt(moonId), planetGroup);
        if (moon) {
          moons.push(moon);
        }
      }
    }
    
    if (moons.length > 0) {
      console.log(`Created ${moons.length} moon(s) for planet ${planetId}`);
    }
    
    return moons;
  }

  /**
   * Update moon positions and rotations
   * @param {number} deltaTime - Time step in seconds
   * @param {number} simulationTime - Current simulation time (Julian Date)
   */
  update(deltaTime, simulationTime) {
    for (const moon of this.moons.values()) {
      // Update orbital position
      const periodDays = Math.abs(moon.data.orbitPeriod);
      const periodSeconds = periodDays * 86400;
      const angularVelocity = (2 * Math.PI) / periodSeconds;
      
      // Determine direction (negative period = retrograde)
      const direction = moon.data.orbitPeriod < 0 ? -1 : 1;
      
      moon.orbitPhase += angularVelocity * deltaTime * direction;
      
      // Calculate position in 3D space with inclination
      const inclination = (moon.data.inclination || 0) * (Math.PI / 180);
      
      // Position in orbital plane
      const x = moon.orbitRadius * Math.cos(moon.orbitPhase);
      const y = moon.orbitRadius * Math.sin(moon.orbitPhase) * Math.cos(inclination);
      const z = moon.orbitRadius * Math.sin(moon.orbitPhase) * Math.sin(inclination);
      
      // Set moon position directly (relative to parent planet)
      moon.nodes.group.position.set(x, y, z);

      // For tidally locked moons, calculate rotation to always face parent
      // The moon needs to rotate to keep the same face pointing toward (0,0,0)
      // Calculate the angle from moon to parent
      const angleToParent = Math.atan2(z, x);
      
      // Rotate moon so it faces the parent
      // Adding PI/2 because the "front" of the sphere is at +Z by default
      moon.nodes.spin.rotation.y = -angleToParent + Math.PI / 2;
    }
  }

  /**
   * Get all moons for a specific planet
   * @param {number} planetId - NAIF ID of the parent planet
   * @returns {Array} Array of moon objects
   */
  getMoonsForPlanet(planetId) {
    const planetMoons = [];
    for (const moon of this.moons.values()) {
      if (moon.parentId === planetId) {
        planetMoons.push(moon);
      }
    }
    return planetMoons;
  }

  /**
   * Set moon scale multiplier
   * @param {number} scale - Scale multiplier
   */
  setMoonScale(scale) {
    this.moonScaleMultiplier = scale;
    console.log(`Moon scale set to ${scale}`);
  }

  /**
   * Dispose of all moon resources
   */
  dispose() {
    for (const moon of this.moons.values()) {
      if (moon.nodes.mesh.geometry) moon.nodes.mesh.geometry.dispose();
      if (moon.nodes.mesh.material) moon.nodes.mesh.material.dispose();
    }
    
    for (const texture of this.textures.values()) {
      texture.dispose();
    }
    
    this.moons.clear();
    this.textures.clear();
    
    console.log('Moon System disposed');
  }
}
