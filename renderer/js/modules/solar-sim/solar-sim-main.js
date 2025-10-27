/**
 * Solar System Simulator - Main Controller
 * Orchestrates all subsystems and manages the simulation
 */

import { TimeManager } from './core/time-system.js';
import { PlanetSystem } from './systems/planet-system.js';
import { MoonSystem } from './systems/moon-system.js';
import { SatelliteSystem } from './systems/satellite-system.js';
import { CameraController } from './systems/camera-controller.js';
import { LightingSystem } from './systems/lighting-system.js';
import { InteractionHandler } from './utils/interaction-handler.js';
import { UIController } from './utils/ui-controller.js';
import { generateEphemerisData } from './data/ephemeris-generator.js';
import { SunDebugPanel } from './sun-debug-panel.js';

/**
 * Solar System Simulator Main Class
 * Main entry point for the solar system simulator
 */
export class SolarSimulator {
  constructor(containerId) {
    this.containerId = containerId;
    this.container = null;
    this.scene = null;
    this.camera = null;
    this.renderer = null;
    this.controls = null;
    this.animationId = null;
    this.isInitialized = false;
    
    // Subsystems
    this.timeManager = null;
    this.planetSystem = null;
    this.moonSystem = null;
    this.satelliteSystem = null;
    this.cameraController = null;
    this.lightingSystem = null;
    this.interactionHandler = null;
    this.uiController = null;
    this.sunDebugPanel = null;
    
    // THREE.js reference (will be set when available)
    this.THREE = null;
  }
  
  /**
   * Show the simulator (lazy initialization)
   */
  async show() {
    if (!this.isInitialized) {
      await this.initialize();
    } else {
      // Already initialized, just restart animation
      this.startAnimation();
    }
  }
  
  /**
   * Hide the simulator (pause animation)
   */
  hide() {
    this.stopAnimation();
  }
  
  /**
   * Render the HTML structure into the container
   */
  renderHTML() {
    if (!this.container) return;
    
    this.container.innerHTML = `
      <div id="solarSimCanvas" style="flex: 1; position: relative;">
        <div class="solar-sim-loading" id="solarSimLoading">
          <div class="solar-sim-loading-spinner"></div>
          <p>Initializing Solar System...</p>
        </div>
      </div>
      <div class="solar-sim-controls" id="solarSimControls">
        <!-- Controls will be populated by UI Controller -->
      </div>
    `;
  }
  
  /**
   * Initialize the simulator
   */
  async initialize() {
    if (this.isInitialized) {
      console.warn('Solar Simulator already initialized');
      return false;
    }
    
    // Check for dependencies
    if (typeof THREE === 'undefined') {
      console.error('THREE.js not loaded');
      return false;
    }
    
    this.THREE = THREE;
    this.container = document.getElementById(this.containerId);
    
    if (!this.container) {
      console.error(`Container ${this.containerId} not found`);
      return false;
    }
    
    // Render the HTML structure first
    this.renderHTML();
    
    // Wait a tick for DOM to update
    await new Promise(resolve => setTimeout(resolve, 0));
    
    // Now get the canvas container (which was just created)
    const canvasContainer = document.getElementById('solarSimCanvas');
    if (!canvasContainer) {
      console.error('Canvas container not found after render');
      return false;
    }
    
    // Create 3D scene
    this.createScene(canvasContainer);
    
    // Initialize subsystems
    this.timeManager = new TimeManager();
    this.planetSystem = new PlanetSystem(this.scene, THREE);
    
    // Create texture loader for moon system
    const textureLoader = new THREE.TextureLoader();
    this.moonSystem = new MoonSystem(THREE, this.scene, textureLoader);
    
    this.satelliteSystem = new SatelliteSystem(this.scene, THREE);
    this.cameraController = new CameraController(this.camera, this.controls, THREE);
    this.lightingSystem = new LightingSystem(this.scene, this.renderer, THREE);
    this.interactionHandler = new InteractionHandler(this.camera, this.renderer, THREE);
    this.uiController = new UIController(this.containerId);
    
    // Set up camera animation flag callback
    this.cameraController.animationFlagSetter = (flag) => {
      // No longer needed, but keep for compatibility
    };
    
    // Initialize all systems
    await this.planetSystem.initialize();
    await this.moonSystem.initialize();
    this.satelliteSystem.initialize();
    this.cameraController.initialize();
    this.lightingSystem.initialize();
    this.interactionHandler.initialize();
    this.uiController.initialize();
    
    // Initialize debug panel for sun tuning (hidden by default)
    const sunNodes = this.planetSystem.getPlanetNodes(10);
    if (sunNodes?.sunSystem) {
      this.sunDebugPanel = new SunDebugPanel(sunNodes.sunSystem);
      // Don't show by default - user can open via button
      // Apply "Bright & Active" preset with corona alpha 0.0
      this.sunDebugPanel.applyPreset({
        granuleScale: 18, granuleSpeed: 0.15, granuleContrast: 1.2,
        turbulenceScale: 12, turbulenceSpeed: 0.2, bumpStrength: 0.5,
        emissionStrength: 1.2, limbDarkening: 0.6, activeRegions: 0.4,
        coronaAlpha: 0.0, coronaDensityFalloff: 2.5,
        emissionHue: 5, emissionSaturation: 1.2,
        emissionColor: '#ffeb99', coronaColor: '#ffd699'
      });
    }
    
    // Load ephemeris data
    const ephemerisData = generateEphemerisData();
    this.planetSystem.setEphemerisData(ephemerisData);
    
    // Create moons for all planets
    this.createMoons();
    
    // Set up getters for cross-system communication
    this.lightingSystem.setSunPositionGetter(() => {
      const sunNodes = this.planetSystem.getPlanetNodes(10);
      return sunNodes?.bodyGroup.position;
    });
    
    this.satelliteSystem.setEarthPositionGetter(() => {
      const earthNodes = this.planetSystem.getPlanetNodes(399);
      return earthNodes?.bodyGroup.position || new THREE.Vector3();
    });
    
    // Set up interactions
    this.setupInteractions();
    this.setupUICallbacks();
    
    // Create background (Milky Way skybox placeholder)
    this.createBackground();
    
    // Initial update
    const jd = this.timeManager.getJD();
    this.planetSystem.updatePositions(jd);
    
    // Start animation loop
    this.startAnimation();
    
    this.isInitialized = true;
    console.log('Solar Simulator initialized successfully');
    return true;
  }
  
  /**
   * Create 3D scene and renderer
   */
  createScene(canvasContainer) {
    const THREE = this.THREE;
    
    // Scene
    this.scene = new THREE.Scene();
    // Set dark background color to prevent white flash during texture loading
    this.scene.background = new THREE.Color(0x0a0a0a); // Very dark grey, nearly black
    // No fog - we want to see stars at infinite distance
    
    // Camera - set up vector BEFORE anything else
    const aspect = canvasContainer.clientWidth / canvasContainer.clientHeight;
    this.camera = new THREE.PerspectiveCamera(50, aspect, 0.01, 1e9); // Increased far plane to 1 billion km
    this.camera.up.set(0, 0, 1); // Z is up (ecliptic north)
    
    // Renderer
    this.renderer = new THREE.WebGLRenderer({ 
      antialias: true, 
      logarithmicDepthBuffer: true,
      precision: 'highp' // Force high precision
    });
    this.renderer.setSize(canvasContainer.clientWidth, canvasContainer.clientHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 0.5;
    this.renderer.sortObjects = true; // Enable object sorting to respect renderOrder
    
    canvasContainer.appendChild(this.renderer.domElement);
    
    // Controls (OrbitControls from THREE.js examples)
    if (typeof THREE.OrbitControls !== 'undefined') {
      this.controls = new THREE.OrbitControls(this.camera, this.renderer.domElement);
      
      // Configure controls for proper orbit behavior
      this.controls.enableDamping = true;
      this.controls.dampingFactor = 0.05;
      this.controls.screenSpacePanning = false;
      this.controls.minDistance = 0.1;
      this.controls.maxDistance = 1e8; // 100 million units - can zoom out very far but not reach skybox at 5e8
      
      // Prevent gimbal lock by limiting polar angle slightly before vertical
      this.controls.minPolarAngle = 0.01; // Very close to top (almost 0°)
      this.controls.maxPolarAngle = Math.PI - 0.01; // Very close to bottom (almost 180°)
      
      this.controls.rotateSpeed = 0.5;
      this.controls.zoomSpeed = 1.0;
      this.controls.panSpeed = 0.5;
    } else {
      console.warn('OrbitControls not available');
      this.controls = { update: () => {}, target: new THREE.Vector3() };
    }
    
    // Handle window resize
    window.addEventListener('resize', () => this.onWindowResize());
    
    // Hide loading indicator
    const loadingEl = document.getElementById('solarSimLoading');
    if (loadingEl) {
      setTimeout(() => {
        loadingEl.style.display = 'none';
      }, 100);
    }
  }
  
  /**
   * Create moons for all planets
   */
  createMoons() {
    console.log('Creating moons for planets...');
    
    // Planet IDs that have moons
    const planetIds = [399, 499, 599, 699, 799, 899, 999]; // Earth, Mars, Jupiter, Saturn, Uranus, Neptune, Pluto
    
    for (const planetId of planetIds) {
      const planetNodes = this.planetSystem.getPlanetNodes(planetId);
      if (planetNodes && planetNodes.bodyGroup) {
        this.moonSystem.createMoonsForPlanet(planetId, planetNodes.bodyGroup);
      }
    }
    
    console.log('Moons created successfully');
  }
  
  /**
   * Create background skybox
   * Uses 8k Milky Way texture, rotated to match galactic plane orientation
   */
  createBackground() {
    const THREE = this.THREE;
    const KM_PER_UNIT = 1e4;
    
    // Create a very large sphere for the skybox
    // Camera far plane is 1e9, so we'll place the skybox at about 50% of that
    const radius = 5e8; // 500 million units - far enough that we can't reach it
    const geometry = new THREE.SphereGeometry(radius, 64, 64);
    
    // Load the Milky Way texture
    const textureLoader = new THREE.TextureLoader();
    const material = new THREE.MeshBasicMaterial({
      color: 0x0a0a0a, // Dark grey to match scene background during loading
      side: THREE.BackSide, // Render inside of sphere
      depthWrite: false, // Don't write to depth buffer
      depthTest: true, // Do depth test so it's always behind everything
      fog: false, // Disable fog on skybox
      toneMapped: false // Don't apply tone mapping to stars - they should be bright
    });
    
    const skybox = new THREE.Mesh(geometry, material);
    skybox.name = 'Skybox';
    skybox.renderOrder = -1000; // Render first, well before everything else
    skybox.frustumCulled = false; // Never cull the skybox
    skybox.matrixAutoUpdate = false; // Skybox doesn't move
    
    // Rotate skybox to align galactic plane with ecliptic plane
    // The galactic plane is tilted ~60.2 degrees relative to the ecliptic
    // We need to rotate the texture to align the Milky Way disk with our solar system's orientation
    // Galactic north pole: RA = 192.859°, Dec = 27.128° (J2000)
    // This translates to roughly a 60° tilt from ecliptic north
    skybox.rotation.x = (60.2 * Math.PI) / 180; // Rotate around X-axis to tilt galactic plane
    skybox.rotation.z = (0 * Math.PI) / 180; // Additional rotation if needed for orientation
    
    skybox.updateMatrix(); // Update matrix after rotation
    
    // Load texture
    textureLoader.load(
      './assets/textures/planets/8k_stars_milky_way.jpg',
      (texture) => {
        texture.colorSpace = THREE.SRGBColorSpace;
        texture.minFilter = THREE.LinearFilter;
        texture.magFilter = THREE.LinearFilter;
        texture.anisotropy = this.renderer.capabilities.getMaxAnisotropy(); // Best quality
        material.map = texture;
        material.color.setHex(0xffffff); // Change to white when texture loads to show full brightness
        material.needsUpdate = true;
        console.log('Milky Way texture loaded successfully');
      },
      undefined,
      (error) => {
        console.warn('Could not load Milky Way texture:', error);
        // Keep dark background as fallback
      }
    );
    
    this.scene.add(skybox);
    
    // Store reference for potential updates
    this.skybox = skybox;
  }
  
  /**
   * Set up interaction callbacks
   */
  setupInteractions() {
    // Get pickable objects
    const pickables = this.planetSystem.getPickableObjects();
    this.interactionHandler.setPickables(pickables);
    
    // Single click - soft orient
    this.interactionHandler.setOnClick((object) => {
      const bodyId = object.userData.bodyId;
      const bodyName = object.userData.bodyName;
      console.log(`Clicked: ${bodyName}`);
      this.cameraController.softOrient(object, bodyId);
    });
    
    // Double click - hard focus
    this.interactionHandler.setOnDoubleClick((object) => {
      const bodyId = object.userData.bodyId;
      const bodyName = object.userData.bodyName;
      console.log(`Focusing on: ${bodyName}`);
      this.cameraController.focusOnObject(object, bodyId, { distanceMultiplier: 3 });
    });
  }
  
  /**
   * Set up UI callbacks
   */
  setupUICallbacks() {
    // Time warp
    this.uiController.on('timeWarpChange', (warp) => {
      this.timeManager.setTimeWarp(warp);
      console.log(`Time warp set to: ${warp}`);
    });
    
    // Satellite group
    this.uiController.on('satelliteGroupChange', async (group) => {
      if (!group) {
        this.satelliteSystem.clear();
        this.uiController.updateSatelliteCount(0);
        return;
      }
      console.log(`Loading satellite group: ${group}`);
      const success = await this.satelliteSystem.loadSatelliteGroup(group);
      if (success) {
        this.uiController.updateSatelliteCount(this.satelliteSystem.getSatelliteCount());
      }
    });
    
    // Planet scale
    this.uiController.on('planetScaleChange', (scale) => {
      this.planetSystem.setPlanetScale(scale);
    });
    
    // Moon scale
    this.uiController.on('moonScaleChange', (scale) => {
      this.moonSystem.setMoonScale(scale);
    });
    
    // Sun scale
    this.uiController.on('sunScaleChange', (scale) => {
      this.planetSystem.setSunScale(scale);
    });
    
    // Satellite scale
    this.uiController.on('satelliteScaleChange', (scale) => {
      this.satelliteSystem.setSatelliteScale(scale);
    });
    
    // Sun intensity
    this.uiController.on('sunIntensityChange', (intensity) => {
      this.lightingSystem.setSunIntensity(intensity);
    });
    
    // Exposure
    this.uiController.on('exposureChange', (exposure) => {
      this.lightingSystem.setExposure(exposure);
    });
    
    // Sun decay
    this.uiController.on('sunDecayChange', (decay) => {
      this.lightingSystem.setSunDecay(decay);
    });
    
    // Focus planet
    this.uiController.on('focusPlanet', (bodyId) => {
      const nodes = this.planetSystem.getPlanetNodes(bodyId);
      if (nodes) {
        this.cameraController.focusOnObject(nodes.globe, bodyId, { distanceMultiplier: 3 });
      }
    });
    
    // Focus moon
    this.uiController.on('focusMoon', ({ moonId, parentId }) => {
      const moon = this.moonSystem.moons.get(moonId);
      if (moon) {
        this.cameraController.focusOnObject(moon.nodes.mesh, moonId, { distanceMultiplier: 5 });
      }
    });
    
    // Open sun menu
    this.uiController.on('openSunMenu', () => {
      if (this.sunDebugPanel) {
        this.sunDebugPanel.show();
      }
    });
  }
  
  /**
   * Animation loop
   */
  animate() {
    this.animationId = requestAnimationFrame(() => this.animate());
    
    // Update time
    const jd = this.timeManager.update();
    
    // Update time display
    const date = this.timeManager.getDate();
    this.uiController.updateTimeDisplay(date.toUTCString());
    
    // Update planet positions and rotations
    this.planetSystem.updatePositions(jd);
    this.planetSystem.updateRotations(1/60, this.timeManager.timeWarp, date);
    
  // Update moon positions and rotations (scale delta by timeWarp so moons speed with simulation)
  this.moonSystem.update((1/60) * this.timeManager.timeWarp, jd);
    
    // Update satellite positions with smooth interpolation (pass current time)
    const currentTime = Date.now();
    this.satelliteSystem.updatePositions(jd, currentTime);
    
    // Update lighting
    this.lightingSystem.update();
    
    // Update camera
    this.cameraController.update();
    
    // Render
    this.renderer.render(this.scene, this.camera);
  }
  
  /**
   * Start animation loop
   */
  startAnimation() {
    if (!this.animationId) {
      this.animate();
    }
  }
  
  /**
   * Stop animation loop
   */
  stopAnimation() {
    if (this.animationId) {
      cancelAnimationFrame(this.animationId);
      this.animationId = null;
    }
  }
  
  /**
   * Handle window resize
   */
  onWindowResize() {
    const canvasContainer = document.getElementById('solarSimCanvas');
    if (!canvasContainer || !this.camera || !this.renderer) return;
    
    const width = canvasContainer.clientWidth;
    const height = canvasContainer.clientHeight;
    
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
  }
  
  /**
   * Clean up resources
   */
  dispose() {
    this.stopAnimation();
    
    if (this.planetSystem) {
      this.planetSystem.dispose();
    }
    
    if (this.moonSystem) {
      this.moonSystem.dispose();
    }
    
    if (this.sunDebugPanel) {
      this.sunDebugPanel.dispose();
    }
    
    if (this.interactionHandler) {
      this.interactionHandler.dispose();
    }
    
    if (this.renderer) {
      this.renderer.dispose();
      this.container.removeChild(this.renderer.domElement);
    }
    
    this.isInitialized = false;
  }
}

// Export as global for easy access
window.SolarSimulator = SolarSimulator;
