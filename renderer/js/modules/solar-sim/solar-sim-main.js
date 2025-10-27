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
    
    // Initialize debug panel for sun tuning
    const sunNodes = this.planetSystem.getPlanetNodes(10);
    if (sunNodes?.sunSystem) {
      this.sunDebugPanel = new SunDebugPanel(sunNodes.sunSystem);
      this.sunDebugPanel.show(); // Show by default for tuning
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
    this.scene.background = new THREE.Color(0x000000);
    
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
      this.controls.maxDistance = 1e7;
      
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
   * TODO: Replace with Milky Way texture
   */
  createBackground() {
    const THREE = this.THREE;
    const KM_PER_UNIT = 1e4;
    
    // Create a large sphere for the skybox
    const radius = (1e10 / KM_PER_UNIT); // 1 million units - very far away
    const geometry = new THREE.SphereGeometry(radius, 64, 64);
    
    // Placeholder material until Milky Way texture is available
    // When ready: place texture in renderer/assets/textures/milky_way.jpg
    const material = new THREE.MeshBasicMaterial({
      color: 0x000000, // Black for now
      side: THREE.BackSide, // Render inside of sphere
      depthWrite: false // Don't write to depth buffer
    });
    
    /* 
    // Uncomment this when you have the Milky Way texture:
    const textureLoader = new THREE.TextureLoader();
    textureLoader.load('./assets/textures/milky_way.jpg', (texture) => {
      material.map = texture;
      material.needsUpdate = true;
      console.log('Milky Way texture loaded');
    });
    */
    
    const skybox = new THREE.Mesh(geometry, material);
    skybox.name = 'Skybox';
    skybox.renderOrder = -1; // Render first
    this.scene.add(skybox);
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
    
    // Update moon positions and rotations
    this.moonSystem.update(1/60, jd);
    
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
