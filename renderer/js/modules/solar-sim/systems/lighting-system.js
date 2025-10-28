/**
 * Solar System Simulator - Lighting System
 * Manages scene lighting including sun light, hemisphere light, and tone mapping
 */

/**
 * Lighting System Class
 * Controls all lighting in the solar system scene
 */
export class LightingSystem {
  constructor(scene, renderer, THREE) {
    this.scene = scene;
    this.renderer = renderer;
    this.THREE = THREE;
    this.sunLight = null;
    this.sunDirectionalLight = null; // For casting shadows
    this.hemiLight = null;
    this.sunPosGetter = null; // Function to get Sun position
  }
  
  /**
   * Initialize lighting system
   */
  initialize() {
    const THREE = this.THREE;
    
    // Sun point light - reduced intensity for better balance
    this.sunLight = new THREE.PointLight(0xffffff, 5, 0, 0);
    this.sunLight.name = 'SunLight';
    this.scene.add(this.sunLight);
    
    // Directional light for casting shadows (simulates parallel sun rays)
    // This is necessary because PointLight shadows are expensive and less realistic at solar system scales
    this.sunDirectionalLight = new THREE.DirectionalLight(0xffffff, 1.5); // Reduced intensity for better shadows
    this.sunDirectionalLight.name = 'SunDirectionalLight';
    this.sunDirectionalLight.castShadow = true;
    
    // Configure shadow properties for quality and coverage
    this.sunDirectionalLight.shadow.mapSize.width = 2048;
    this.sunDirectionalLight.shadow.mapSize.height = 2048;
    this.sunDirectionalLight.shadow.camera.near = 0.1;
    this.sunDirectionalLight.shadow.camera.far = 1e6; // Cover large distances
    
    // Shadow camera frustum size (covers area around focused object)
    const shadowCameraSize = 5000; // Increased to cover more area
    this.sunDirectionalLight.shadow.camera.left = -shadowCameraSize;
    this.sunDirectionalLight.shadow.camera.right = shadowCameraSize;
    this.sunDirectionalLight.shadow.camera.top = shadowCameraSize;
    this.sunDirectionalLight.shadow.camera.bottom = -shadowCameraSize;
    
    this.sunDirectionalLight.shadow.bias = -0.001; // Increased to reduce shadow acne
    
    this.scene.add(this.sunDirectionalLight);
    this.scene.add(this.sunDirectionalLight.target); // Must add target to scene!
    
    // Debug: Uncomment to visualize shadow camera frustum
    // const helper = new THREE.CameraHelper(this.sunDirectionalLight.shadow.camera);
    // this.scene.add(helper);
    
    // Hemisphere light (ambient) - increased for better fill
    this.hemiLight = new THREE.HemisphereLight(
      0x3a5a9a, // Sky color
      0x1f1a12, // Ground color
      0.8       // Intensity - much higher for fill light
    );
    this.hemiLight.name = 'HemisphereLight';
    this.scene.add(this.hemiLight);
    
    // Set up tone mapping with more conservative exposure
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 0.5;
  }
  
  /**
   * Set function to get Sun position
   */
  setSunPositionGetter(getter) {
    this.sunPosGetter = getter;
  }
  
  /**
   * Update sun light position
   * @param {THREE.Vector3} focusPosition - Optional position to center shadows around
   * @param {number|null} parentBodyId - Optional parent body ID for shadow camera positioning
   * @param {Function|null} planetPositionGetter - Optional function to get planet position by ID
   */
  update(focusPosition = null, parentBodyId = null, planetPositionGetter = null) {
    if (this.sunPosGetter && this.sunLight) {
      const sunPos = this.sunPosGetter();
      if (sunPos) {
        this.sunLight.position.copy(sunPos);
        
        // Update directional light to cast shadows
        if (this.sunDirectionalLight) {
          // DirectionalLight shines from position to target
          // We want light to come FROM the sun position
          
          // Use the actual sun position (or nearby) as the light source
          this.sunDirectionalLight.position.copy(sunPos);
          
          // If viewing a moon, center shadow camera on the parent planet
          // Otherwise, use the focused object's position
          let targetPos = focusPosition || new this.THREE.Vector3(0, 0, 0);
          
          if (parentBodyId !== null && planetPositionGetter) {
            const parentPos = planetPositionGetter(parentBodyId);
            if (parentPos) {
              targetPos = parentPos;
            }
          }
          
          this.sunDirectionalLight.target.position.copy(targetPos);
          this.sunDirectionalLight.target.updateMatrixWorld();
        }
      }
    }
  }
  
  /**
   * Set sun light intensity
   */
  setSunIntensity(intensity) {
    if (this.sunLight) {
      this.sunLight.intensity = intensity;
    }
  }
  
  /**
   * Set sun light decay mode
   */
  setSunDecay(decay) {
    if (this.sunLight) {
      this.sunLight.decay = decay ? 2 : 0;
    }
  }
  
  /**
   * Set hemisphere light intensity
   */
  setHemisphereIntensity(intensity) {
    if (this.hemiLight) {
      this.hemiLight.intensity = intensity;
    }
  }
  
  /**
   * Set tone mapping exposure
   */
  setExposure(exposure) {
    this.renderer.toneMappingExposure = exposure;
  }
  
  /**
   * Set hemisphere colors
   */
  setHemisphereColors(skyColor, groundColor) {
    if (this.hemiLight) {
      this.hemiLight.color.setHex(skyColor);
      this.hemiLight.groundColor.setHex(groundColor);
    }
  }
}
