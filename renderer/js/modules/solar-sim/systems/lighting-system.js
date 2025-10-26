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
   */
  update() {
    if (this.sunPosGetter && this.sunLight) {
      const sunPos = this.sunPosGetter();
      if (sunPos) {
        this.sunLight.position.copy(sunPos);
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
