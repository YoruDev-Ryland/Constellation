/**
 * Solar System Simulator - Planet System
 * Manages planet rendering, positioning, and rotation
 */

import { 
  PLANET_RADII_KM, 
  SIDEREAL_ROTATION_HOURS, 
  IAU_POLE_RADEC,
  PLANET_IDS,
  PLANET_NAMES,
  KM_PER_UNIT,
  AU_KM,
  OBLIQUITY_RAD
} from '../core/constants.js';
import { raDecToUnitVectorEQJ, equatorialToEcliptic } from '../core/coordinate-transforms.js';
import { SunSystem } from './sun-system.js';

/**
 * Planet System Class
 * Manages all planetary bodies and their hierarchical transforms
 */
export class PlanetSystem {
  constructor(scene, THREE) {
    this.scene = scene;
    this.THREE = THREE;
    this.planetMeshes = new Map();
    this.orbitalLines = new Map();
    this.currentJD = null;            // last simulation JD seen
    this.orbitLinesSyncedJD = null;   // JD at which orbit lines were last phased
    this.planetScaleMultiplier = 1.0;
    this.sunScaleMultiplier = 1.0;
    this.ephemerisData = null;
    this.textureLoader = new THREE.TextureLoader();
    this.textures = new Map(); // Store loaded textures
    this.sunSystem = new SunSystem(THREE, scene); // Realistic sun renderer
  }
  
  /**
   * Initialize all planets
   */
  async initialize() {
    // Load textures first
    await this.loadTextures();
    
    for (const bodyId of PLANET_IDS) {
      this.createPlanet(bodyId);
    }
  }
  
  /**
   * Load planet textures
   * Place your texture files in: renderer/assets/textures/planets/
   */
  async loadTextures() {
    const basePath = './assets/textures/planets/';
    
    // Use 8k textures where available, fall back to 2k
    const textureFiles = {
      10: { main: '8k_sun.jpg' },
      199: { main: '8k_mercury.jpg', fallback: '2k_mercury.jpg' },
      299: { main: '4k_venus_atmosphere.jpg', fallback: '2k_venus_atmosphere.jpg' },
      399: { 
        main: '8k_earth_daymap.jpg', 
        fallback: '2k_earth_daymap.jpg',
        clouds: '8k_earth_clouds.jpg',
        night: '8k_earth_nightmap.jpg',
        normal: '8k_earth_normal_map.tif',
        specular: '8k_earth_specular_map.tif'
      },
      499: { main: '8k_mars.jpg', fallback: '2k_mars.jpg' },
      599: { main: '8k_jupiter.jpg', fallback: '2k_jupiter.jpg' },
      699: { 
        main: '8k_saturn.jpg', 
        fallback: '2k_saturn.jpg',
        ring: '8k_saturn_ring_alpha.png'
      },
      799: { main: '2k_uranus.jpg' },
      899: { main: '2k_neptune.jpg' },
      999: { main: '2k_pluto.jpg' }
    };
    
    for (const [bodyId, files] of Object.entries(textureFiles)) {
      const id = parseInt(bodyId);
      const textureData = {};
      
      // Load main texture
      const mainFile = files.main;
      try {
        const texture = await new Promise((resolve, reject) => {
          this.textureLoader.load(
            `${basePath}${mainFile}`,
            (tex) => {
              tex.colorSpace = THREE.SRGBColorSpace; // Match old site texture handling
              tex.anisotropy = 16; // Better quality at angles
              resolve(tex);
            },
            undefined,
            (err) => {
              console.warn(`Texture ${mainFile} not found, trying fallback`);
              resolve(null);
            }
          );
        });
        
        if (texture) {
          textureData.main = texture;
          console.log(`Loaded texture: ${mainFile}`);
        } else if (files.fallback) {
          // Try fallback
          const fallbackTex = await new Promise((resolve) => {
            this.textureLoader.load(
              `${basePath}${files.fallback}`,
              (tex) => {
                tex.colorSpace = THREE.SRGBColorSpace; // Match old site texture handling
                tex.anisotropy = 16;
                resolve(tex);
              },
              undefined,
              () => resolve(null)
            );
          });
          if (fallbackTex) {
            textureData.main = fallbackTex;
            console.log(`Loaded fallback texture: ${files.fallback}`);
          }
        }
      } catch (err) {
        console.warn(`Failed to load texture for body ${id}:`, err);
      }
      
      // Load additional maps for Earth
      if (id === 399) {
        if (files.night) {
          const nightTex = await this.loadTextureFile(basePath + files.night);
          if (nightTex) textureData.night = nightTex;
        }
        if (files.clouds) {
          const cloudsTex = await this.loadTextureFile(basePath + files.clouds);
          if (cloudsTex) textureData.clouds = cloudsTex;
        }
        if (files.normal) {
          const normalTex = await this.loadTextureFile(basePath + files.normal);
          if (normalTex) textureData.normal = normalTex;
        }
        if (files.specular) {
          const specTex = await this.loadTextureFile(basePath + files.specular);
          if (specTex) textureData.specular = specTex;
        }
      }
      
      // Load ring texture for Saturn
      if (id === 699 && files.ring) {
        const ringTex = await this.loadTextureFile(basePath + files.ring);
        if (ringTex) textureData.ring = ringTex;
      }
      
      if (Object.keys(textureData).length > 0) {
        this.textures.set(id, textureData);
      }
    }
  }
  
  /**
   * Helper to load a single texture file
   */
  async loadTextureFile(path) {
    return new Promise((resolve) => {
      this.textureLoader.load(
        path,
        (tex) => {
          tex.colorSpace = THREE.SRGBColorSpace; // Match old site texture handling
          tex.anisotropy = 16;
          resolve(tex);
        },
        undefined,
        () => {
          console.warn(`Could not load: ${path}`);
          resolve(null);
        }
      );
    });
  }
  
  /**
   * Create a single planet with hierarchical node structure
   * bodyGroup (position) -> orient (axis) -> spin (rotation) -> globe (mesh)
   */
  createPlanet(bodyId) {
    const THREE = this.THREE;
    const name = PLANET_NAMES[bodyId];
    const radius = PLANET_RADII_KM[bodyId];
    
    // Create hierarchical nodes
    const bodyGroup = new THREE.Group();
    bodyGroup.name = `${name}_bodyGroup`;
    
    const orient = new THREE.Group();
    orient.name = `${name}_orient`;
    
    const spin = new THREE.Group();
    spin.name = `${name}_spin`;
    
    // Set up IAU pole orientation
    // IAU poles are in equatorial J2000, need to transform to ecliptic since our ephemeris uses ecliptic
    const poleData = IAU_POLE_RADEC.get(bodyId);
    if (poleData) {
      // Step 1: Convert IAU pole RA/Dec to unit vector in equatorial J2000
      const poleEq = raDecToUnitVectorEQJ(poleData[0], poleData[1]);
      
      // Step 2: Transform from equatorial to ecliptic coordinates
      // Our ephemeris generator outputs ecliptic coordinates, so poles must match
      const poleEcl = equatorialToEcliptic(poleEq.x, poleEq.y, poleEq.z);
      
      // Step 3: Align the orient node's Y-axis to the ecliptic pole direction
      const poleDir = new THREE.Vector3(poleEcl.x, poleEcl.y, poleEcl.z);
      const defaultUp = new THREE.Vector3(0, 1, 0);
      
      const quaternion = new THREE.Quaternion().setFromUnitVectors(defaultUp, poleDir);
      orient.quaternion.copy(quaternion);
    }
    
    // Get texture data if available
    const textureData = this.textures.get(bodyId);
    
    // Special handling for Sun - completely procedural, no textures or static geometry
    if (bodyId === 10) {
      // Sun - delegate to realistic sun system (no texture fallback)
      const visualRadius = (radius / KM_PER_UNIT) * this.sunScaleMultiplier;
      const sunGroup = this.sunSystem.createSun(visualRadius, null);
      sunGroup.name = `${name}_realisticSun`;
      
      // The sunGroup already contains photosphere, corona, and prominences
      spin.add(sunGroup);
      
      // Store references (globe points to the sun group for consistency)
      const nodes = {
        bodyGroup,
        orient,
        spin,
        globe: sunGroup, // Sun group acts as the "globe"
        ring: null,
        poleSpike: null,
        clouds: null,
        sunSystem: this.sunSystem // Store reference for updates
      };
      this.planetMeshes.set(bodyId, nodes);
      
      orient.add(spin);
      bodyGroup.add(orient);
      this.scene.add(bodyGroup);
      
      // Store visual radius for camera focusing
      sunGroup.userData.bodyId = bodyId;
      sunGroup.userData.bodyName = name;
      sunGroup.userData.radius = visualRadius;
      
      // Early return - sun is fully handled, no static geometry created
      return;
    }
    
    // For all other planets, create standard sphere geometry
    const visualRadius = (radius / KM_PER_UNIT) * this.planetScaleMultiplier;
    const geometry = new THREE.SphereGeometry(visualRadius, 64, 64);
    
    // Material with texture support
    let material;
    if (bodyId === 399) {
      // Earth - custom shader with day/night blending
      console.log('=== Earth Shader Debug ===');
      console.log('Day texture:', textureData?.main);
      console.log('Night texture:', textureData?.night);
      console.log('Normal texture:', textureData?.normal);
      console.log('Specular texture:', textureData?.specular);
      
      if (textureData?.main) {
        // Earth day/night shader (minimal, no log-depth to avoid chunk/version coupling)
        const earthUniforms = {
          dayMap: { value: textureData.main },
          nightMap: { value: textureData.night || textureData.main },
          uSunDir: { value: new this.THREE.Vector3(1, 0, 0) },
          uNightBoost: { value: 0.8 }
        };

        material = new this.THREE.ShaderMaterial({
          uniforms: earthUniforms,
          vertexShader: `
            precision highp float;
            #include <common>
            #include <logdepthbuf_pars_vertex>
            varying vec2 vUv;
            varying vec3 vNormalObj;
            void main() {
              vUv = uv;
              vNormalObj = normalize(normal);
              gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
              #include <logdepthbuf_vertex>
            }
          `,
          fragmentShader: `
            precision highp float;
            #include <common>
            #include <logdepthbuf_pars_fragment>
            uniform sampler2D dayMap;
            uniform sampler2D nightMap;
            uniform vec3 uSunDir;
            uniform float uNightBoost;
            varying vec2 vUv;
            varying vec3 vNormalObj;

            // sRGB <-> Linear helpers (piecewise accurate)
            vec3 srgbToLinear(vec3 c) {
              vec3 lo = c / 12.92;
              vec3 hi = pow((c + 0.055) / 1.055, vec3(2.4));
              return mix(lo, hi, step(vec3(0.04045), c));
            }

            vec3 linearToSrgb(vec3 c) {
              vec3 lo = c * 12.92;
              vec3 hi = 1.055 * pow(c, vec3(1.0/2.4)) - 0.055;
              return mix(lo, hi, step(vec3(0.0031308), c));
            }

            void main() {
              #include <logdepthbuf_fragment>
              vec3 N = normalize(vNormalObj);
              float NdotL = dot(N, normalize(uSunDir));

              // Decode sRGB textures to linear for correct blending
              vec3 day = srgbToLinear(texture2D(dayMap, vUv).rgb);
              vec3 night = srgbToLinear(texture2D(nightMap, vUv).rgb);

              // Soft terminator with smoothstep
              float edge = smoothstep(-0.1, 0.1, NdotL);
              edge = clamp(edge, 0.0, 1.0);
              float unlit = 1.0 - edge;

              // Blend day and night in linear space
              vec3 colorLinear = day * edge + night * unlit * uNightBoost;

              // Encode to sRGB for display
              vec3 color = linearToSrgb(colorLinear);
              gl_FragColor = vec4(color, 1.0);
            }
          `,
          lights: false,
          transparent: false,
          depthWrite: true,
          depthTest: true
        });
        
        // Store reference to material for sun direction updates
        this.earthDayNightMaterial = material;
        console.log('Created Earth day/night shader material');
      } else {
        console.warn('No Earth textures loaded! Using blue fallback');
        material = new THREE.MeshStandardMaterial({
          color: 0x2a5b8d,
          roughness: 0.9,
          metalness: 0.0
        });
      }
    } else {
      // Other planets - standard material with texture
      if (textureData?.main) {
        material = new THREE.MeshStandardMaterial({
          map: textureData.main,
          roughness: 0.9,
          metalness: 0.0,
          envMapIntensity: 0.5
        });
      } else {
        // Fallback to solid color
        material = new THREE.MeshStandardMaterial({
          color: this.getPlanetColor(bodyId),
          roughness: 0.9,
          metalness: 0.0,
          envMapIntensity: 0.5
        });
      }
    }
    
    const globe = new THREE.Mesh(geometry, material);
    globe.name = `${name}_globe_mesh`;
    
    // Create a group to hold the globe (matches original pattern)
    const globeGroup = new THREE.Group();
    globeGroup.name = `${name}_globe`;
    globeGroup.add(globe);
    globeGroup.userData.bodyId = bodyId;
    globeGroup.userData.bodyName = name;
    globeGroup.userData.radius = visualRadius; // Store for camera focusing
    
    // Store material reference for Earth day/night updates
    if (bodyId === 399 && this.earthDayNightMaterial) {
      globeGroup.userData.dayNightMat = this.earthDayNightMaterial;
    }
    
    // No initial rotation - texture alignment handled by GMST offsets
    
    // Build hierarchy
    spin.add(globeGroup);
    orient.add(spin);
    bodyGroup.add(orient);
    this.scene.add(bodyGroup);
    
    // Store references
    const nodes = {
      bodyGroup,
      orient,
      spin,
      globe: globeGroup, // Store the group, not the mesh
      ring: null,
      poleSpike: null,
      clouds: null
    };
    this.planetMeshes.set(bodyId, nodes);
    
    // Add rings for Saturn
    if (bodyId === 699) {
      this.addSaturnRings(spin);
    }
    
    // Add pole axis spike with N/S labels (to orient node, not spin)
    this.addPoleSpike(orient, visualRadius, bodyId);

    // Add Earth cloud layer as a slightly larger, transparent sphere
    if (bodyId === 399 && textureData?.clouds) {
      const cloudRadius = visualRadius * 1.003; // slightly above the surface
      const cloudGeo = new THREE.SphereGeometry(cloudRadius, 64, 64);
      const cloudMat = new THREE.MeshStandardMaterial({
        map: textureData.clouds,
        color: 0xffffff,
        roughness: 1.0,
        metalness: 0.0,
        transparent: true,
        opacity: 1.0,
        depthTest: true,
        depthWrite: false,
        polygonOffset: true,
        polygonOffsetFactor: -1,
        polygonOffsetUnits: -1
      });

      // Derive alpha from the clouds JPG brightness (black => transparent)
      cloudMat.onBeforeCompile = (shader) => {
        shader.uniforms.uAlphaCutoff = { value: 0.22 }; // tweakable threshold
        shader.uniforms.uAlphaSoft = { value: 0.06 };   // edge softness
        shader.uniforms.uCloudOpacity = { value: 0.6 }; // overall opacity control

        // Declare uniforms in fragment shader
        shader.fragmentShader = shader.fragmentShader.replace(
          '#include <common>',
          `#include <common>\nuniform float uAlphaCutoff;\nuniform float uAlphaSoft;\nuniform float uCloudOpacity;\n`
        );

        // Apply alpha-from-luma after map sampling
        shader.fragmentShader = shader.fragmentShader.replace(
          '#include <map_fragment>',
          `#include <map_fragment>\n\n` +
          `// diffuseColor.rgb now includes the map contribution in linear space.\n` +
          `// Compute luminance in linear space (Rec.709):\n` +
          `float cloudLuma = dot(diffuseColor.rgb, vec3(0.2126, 0.7152, 0.0722));\n` +
          `float alpha = smoothstep(uAlphaCutoff - uAlphaSoft, uAlphaCutoff + uAlphaSoft, cloudLuma);\n` +
          `diffuseColor.a *= alpha * uCloudOpacity;`
        );
      };

      const cloudsMesh = new THREE.Mesh(cloudGeo, cloudMat);
      cloudsMesh.name = `${name}_clouds`;
      // Attach to the same spin node so clouds rotate with Earth (drift added in updateRotations)
      spin.add(cloudsMesh);

      // Store reference
      const earthNodes = this.planetMeshes.get(399) || nodes;
      earthNodes.clouds = cloudsMesh;
    }
  }
  
  /**
   * Add rings to Saturn
   */
  addSaturnRings(spinNode) {
    const THREE = this.THREE;
    const innerRad = (74500 / KM_PER_UNIT) * this.planetScaleMultiplier;
    const outerRad = (140220 / KM_PER_UNIT) * this.planetScaleMultiplier;
    
    const ringGeo = new THREE.RingGeometry(innerRad, outerRad, 128, 4);
    
    // Get Saturn texture data for ring texture
    const saturnData = this.textures.get(699);
    
    let ringMat;
    if (saturnData?.ring) {
      ringMat = new THREE.MeshBasicMaterial({
        map: saturnData.ring,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 1.0
      });
    } else {
      // Fallback to solid color
      ringMat = new THREE.MeshBasicMaterial({
        color: 0xd4a574,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.7
      });
    }
    
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.rotation.x = Math.PI / 2;
    ring.name = 'Saturn_rings';
    
    spinNode.add(ring);
    this.planetMeshes.get(699).ring = ring;
  }
  
  /**
   * Add pole spike to show rotation axis
   */
  addPoleSpike(orientNode, planetRadius, bodyId) {
    const THREE = this.THREE;
    const name = PLANET_NAMES[bodyId];
    
    // Create a group for the pole spike assembly
    const poleGroup = new THREE.Group();
    poleGroup.name = `${name}_poleSpike`;
    
    // Spike length extends beyond planet
    const spikeLength = planetRadius * 2.5;
    const spikeRadius = planetRadius * 0.02; // Thin spike

    // Create a thin line for the spike (along Y-axis)
    // The orient node's Y-axis is already aligned with the IAU pole direction.
    // Use depth testing but NOT depth writing for proper transparency
    // This allows the spike to be occluded by the globe when behind it,
    // but won't block anything behind the spike itself
    const spikeMaterial = new THREE.LineBasicMaterial({
      color: 0xffff00, // Yellow for visibility
      linewidth: 2,
      transparent: true,
      opacity: 0.9,
      depthTest: true,
      depthWrite: false // Don't write to depth buffer for transparent lines
    });

    const spikeGeometry = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(0, -spikeLength / 2, 0),
      new THREE.Vector3(0, spikeLength / 2, 0)
    ]);

    const spike = new THREE.Line(spikeGeometry, spikeMaterial);
    // Do NOT force renderOrder; let depthTest/depthWrite determine occlusion
    poleGroup.add(spike);
    
    // Create N label (north pole, top)
    const nLabel = this.createTextSprite('N', planetRadius * 0.15);
    nLabel.position.y = spikeLength / 2 + planetRadius * 0.2;
    poleGroup.add(nLabel);
    
    // Create S label (south pole, bottom)
    const sLabel = this.createTextSprite('S', planetRadius * 0.15);
    sLabel.position.y = -(spikeLength / 2 + planetRadius * 0.2);
    poleGroup.add(sLabel);
    
    // Add to orient node - pole spike stays fixed, doesn't rotate with planet
    orientNode.add(poleGroup);
    
    // Store reference
    const nodes = this.planetMeshes.get(bodyId);
    if (nodes) {
      nodes.poleSpike = poleGroup;
    }
  }
  
  /**
   * Create a text sprite for labels
   */
  createTextSprite(text, size) {
    const THREE = this.THREE;
    
    // Create canvas for text
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    canvas.width = 256;
    canvas.height = 256;
    
    // Draw text
    context.fillStyle = '#ffffff';
    context.font = 'bold 200px Arial';
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.fillText(text, 128, 128);
    
    // Create texture from canvas
    const texture = new THREE.CanvasTexture(canvas);
    texture.needsUpdate = true;
    
    // Create sprite
    const spriteMat = new THREE.SpriteMaterial({
      map: texture,
      transparent: true,
      // Let labels be occluded by the globe but not write to depth
      depthTest: true,
      depthWrite: false
    });
    
    const sprite = new THREE.Sprite(spriteMat);
    sprite.scale.set(size, size, 1);
    
    return sprite;
  }
  
  /**
   * Get default color for a planet (fallback before textures)
   */
  getPlanetColor(bodyId) {
    const colors = {
      199: 0x8c7853, // Mercury - gray/brown
      299: 0xe8cda2, // Venus - pale yellow
      399: 0x4a90e2, // Earth - blue
      499: 0xc1440e, // Mars - red
      599: 0xc88b3a, // Jupiter - orange/brown
      699: 0xfad5a5, // Saturn - pale yellow
      799: 0x4fd0e0, // Uranus - cyan
      899: 0x4166f5, // Neptune - blue
      999: 0xaaaaaa  // Pluto - gray
    };
    return colors[bodyId] || 0x888888;
  }
  
  /**
   * Calculate 3D position from orbital elements at a given mean anomaly
   * This uses the exact same calculation as ephemeris-generator.js
   */
  calculatePositionFromMeanAnomaly(elem, M) {
    const a = elem.a * AU_KM;
    const e = elem.e;
    const i = elem.i * (Math.PI / 180);
    const Omega = elem.Omega * (Math.PI / 180);
    const omega = elem.omega * (Math.PI / 180);
    
    // Solve for eccentric anomaly using Newton's method
    let E = M;
    for (let iter = 0; iter < 10; iter++) {
      const dE = (E - e * Math.sin(E) - M) / (1 - e * Math.cos(E));
      E -= dE;
      if (Math.abs(dE) < 1e-8) break;
    }
    
    // True anomaly
    const nu = 2 * Math.atan2(
      Math.sqrt(1 + e) * Math.sin(E / 2),
      Math.sqrt(1 - e) * Math.cos(E / 2)
    );
    
    // Distance
    const r = a * (1 - e * Math.cos(E));
    
    // Position in orbital plane
    const xOrb = r * Math.cos(nu);
    const yOrb = r * Math.sin(nu);
    
    // Rotate to ecliptic frame (same order as ephemeris generator)
    // 1. Apply argument of periapsis
    const cosOmega = Math.cos(omega);
    const sinOmega = Math.sin(omega);
    const x1 = xOrb * cosOmega - yOrb * sinOmega;
    const y1 = xOrb * sinOmega + yOrb * cosOmega;
    
    // 2. Apply inclination
    const cosI = Math.cos(i);
    const sinI = Math.sin(i);
    const x2 = x1;
    const y2 = y1 * cosI;
    const z2 = y1 * sinI;
    
    // 3. Apply longitude of ascending node
    const cosOmegaAN = Math.cos(Omega);
    const sinOmegaAN = Math.sin(Omega);
    const x = x2 * cosOmegaAN - y2 * sinOmegaAN;
    const y = x2 * sinOmegaAN + y2 * cosOmegaAN;
    const z = z2;
    
    return [x, y, z];
  }

  /**
   * Create orbital lines for all planets
   * Uses the exact same calculation as ephemeris generator to ensure perfect alignment
   */
  createOrbitalLines() {
    const THREE = this.THREE;
    
    // Orbital elements (must match ephemeris-generator.js exactly)
    const ORBITAL_ELEMENTS = {
      199: { a: 0.387098, e: 0.205630, i: 7.005,   Omega: 48.331,   omega: 29.124,   L0: 252.251, period: 87.969 },
      299: { a: 0.723332, e: 0.006772, i: 3.395,   Omega: 76.680,   omega: 54.884,   L0: 181.979, period: 224.701 },
      399: { a: 1.000003, e: 0.016709, i: 0.0,     Omega: 0.0,      omega: 102.937,  L0: 100.464, period: 365.256 },
      499: { a: 1.523710, e: 0.093394, i: 1.850,   Omega: 49.558,   omega: 286.502,  L0: 355.453, period: 686.980 },
      599: { a: 5.202887, e: 0.048498, i: 1.303,   Omega: 100.464,  omega: 273.867,  L0: 34.396,  period: 4332.589 },
      699: { a: 9.536676, e: 0.053862, i: 2.485,   Omega: 113.665,  omega: 339.392,  L0: 49.954,  period: 10759.22 },
      799: { a: 19.18917, e: 0.047257, i: 0.773,   Omega: 74.006,   omega: 96.998,   L0: 313.232, period: 30685.4 },
      899: { a: 30.06992, e: 0.008606, i: 1.770,   Omega: 131.784,  omega: 273.187,  L0: 304.880, period: 60189.0 },
      999: { a: 39.48211, e: 0.248808, i: 17.140,  Omega: 110.299,  omega: 113.834,  L0: 238.929, period: 90560.0 }
    };
    
    const ORBIT_SAMPLES = 512; // Number of points around the orbit
    
    // Get current JD to calculate current mean anomaly offset
    // Prefer the simulation JD (from updatePositions); fallback to real now.
    const currentJD = (this.currentJD != null) ? this.currentJD : this.dateToJD(new Date());

    // Remove any existing orbit lines to avoid duplicates and stale phases
    for (const [id, line] of this.orbitalLines) {
      if (line && line.geometry) line.geometry.dispose();
      if (line && line.material) line.material.dispose();
      if (line && line.parent) line.parent.remove(line);
    }
    this.orbitalLines.clear();
    const J2000 = 2451545.0;
    
    for (const bodyId of PLANET_IDS) {
      // Skip the Sun
      if (bodyId === 10) continue;
      
      const elem = ORBITAL_ELEMENTS[bodyId];
      if (!elem) continue;
      
      const points = [];
      
      // Calculate current mean anomaly for this planet to use as phase offset
      const T = currentJD - J2000;
      const L0 = elem.L0 * (Math.PI / 180);
      const omega = elem.omega * (Math.PI / 180);
      const Omega = elem.Omega * (Math.PI / 180);
      const L = L0 + (2 * Math.PI * T / elem.period);
      const perihelionLongitude = omega + Omega;
      const currentM = L - perihelionLongitude;
      
      // Generate complete orbit, but start from the exact current position as the first vertex
      // to guarantee the visible line passes through the planet right now.
      {
        // j = 0 exact current point
        const [x0, y0, z0] = this.calculatePositionFromMeanAnomaly(elem, currentM);
        points.push(new THREE.Vector3(x0 / KM_PER_UNIT, y0 / KM_PER_UNIT, z0 / KM_PER_UNIT));
        // Remaining samples around the ellipse
        for (let j = 1; j < ORBIT_SAMPLES; j++) {
          const M = currentM + (2 * Math.PI * j) / ORBIT_SAMPLES;
          const [x, y, z] = this.calculatePositionFromMeanAnomaly(elem, M);
          points.push(new THREE.Vector3(x / KM_PER_UNIT, y / KM_PER_UNIT, z / KM_PER_UNIT));
        }
      }
      
      const geometry = new THREE.BufferGeometry().setFromPoints(points);
      const material = new THREE.LineBasicMaterial({
        color: this.getPlanetColor(bodyId),
        transparent: true,
        opacity: 0.5,
        depthTest: true,
        depthWrite: false,
        linewidth: 2
      });
      
      const line = new THREE.LineLoop(geometry, material);
      line.name = `${PLANET_NAMES[bodyId]}_orbit`;
      this.scene.add(line);
      
      this.orbitalLines.set(bodyId, line);
    }

    // Record the JD we phased to
    this.orbitLinesSyncedJD = currentJD;
  }

  /**
   * Recompute orbit line geometry to align phase to a given simulation JD.
   * Cheap enough to call once after time is known; avoid calling every frame.
   */
  updateOrbitalLinesPhase(jd) {
    if (!this.orbitalLines || this.orbitalLines.size === 0) {
      // If lines aren't created yet, create them (uses this.currentJD)
      this.currentJD = jd;
      this.createOrbitalLines();
      return;
    }

    const THREE = this.THREE;
    const ORBITAL_ELEMENTS = {
      199: { a: 0.387098, e: 0.205630, i: 7.005,   Omega: 48.331,   omega: 29.124,   L0: 252.251, period: 87.969 },
      299: { a: 0.723332, e: 0.006772, i: 3.395,   Omega: 76.680,   omega: 54.884,   L0: 181.979, period: 224.701 },
      399: { a: 1.000003, e: 0.016709, i: 0.0,     Omega: 0.0,      omega: 102.937,  L0: 100.464, period: 365.256 },
      499: { a: 1.523710, e: 0.093394, i: 1.850,   Omega: 49.558,   omega: 286.502,  L0: 355.453, period: 686.980 },
      599: { a: 5.202887, e: 0.048498, i: 1.303,   Omega: 100.464,  omega: 273.867,  L0: 34.396,  period: 4332.589 },
      699: { a: 9.536676, e: 0.053862, i: 2.485,   Omega: 113.665,  omega: 339.392,  L0: 49.954,  period: 10759.22 },
      799: { a: 19.18917, e: 0.047257, i: 0.773,   Omega: 74.006,   omega: 96.998,   L0: 313.232, period: 30685.4 },
      899: { a: 30.06992, e: 0.008606, i: 1.770,   Omega: 131.784,  omega: 273.187,  L0: 304.880, period: 60189.0 },
      999: { a: 39.48211, e: 0.248808, i: 17.140,  Omega: 110.299,  omega: 113.834,  L0: 238.929, period: 90560.0 }
    };
    const ORBIT_SAMPLES = 512;
    const J2000 = 2451545.0;

    for (const bodyId of PLANET_IDS) {
      if (bodyId === 10) continue;
      const elem = ORBITAL_ELEMENTS[bodyId];
      if (!elem) continue;

      const T = jd - J2000;
      const L0 = elem.L0 * (Math.PI / 180);
      const omega = elem.omega * (Math.PI / 180);
      const Omega = elem.Omega * (Math.PI / 180);
      const L = L0 + (2 * Math.PI * T / elem.period);
      const perihelionLongitude = omega + Omega;
      const currentM = L - perihelionLongitude;

      const points = [];
      // exact current point first
      {
        const [x0, y0, z0] = this.calculatePositionFromMeanAnomaly(elem, currentM);
        points.push(new THREE.Vector3(x0 / KM_PER_UNIT, y0 / KM_PER_UNIT, z0 / KM_PER_UNIT));
        for (let j = 1; j < ORBIT_SAMPLES; j++) {
          const M = currentM + (2 * Math.PI * j) / ORBIT_SAMPLES;
          const [x, y, z] = this.calculatePositionFromMeanAnomaly(elem, M);
          points.push(new THREE.Vector3(x / KM_PER_UNIT, y / KM_PER_UNIT, z / KM_PER_UNIT));
        }
      }

      const line = this.orbitalLines.get(bodyId);
      if (line) {
        if (line.geometry) line.geometry.dispose();
        line.geometry = new THREE.BufferGeometry().setFromPoints(points);
      }
    }

    this.orbitLinesSyncedJD = jd;
  }
  
  /**
   * Update planet positions from ephemeris data
   */
  updatePositions(jd) {
    if (!this.ephemerisData) return;
    // Track the simulation JD
    this.currentJD = jd;
    
    for (const [bodyId, nodes] of this.planetMeshes) {
      const pos = this.getPositionAtJD(bodyId, jd);
      if (pos) {
        nodes.bodyGroup.position.set(
          pos[0] / KM_PER_UNIT,
          pos[1] / KM_PER_UNIT,
          pos[2] / KM_PER_UNIT
        );
      }
    }

    // On first update after we know JD, phase orbits to match the simulation time
    if (this.orbitLinesSyncedJD == null) {
      this.updateOrbitalLinesPhase(jd);
    }
  }
  
  /**
   * Get interpolated position at specific Julian Date
   */
  getPositionAtJD(bodyId, jd) {
    const rows = this.ephemerisData?.[bodyId];
    if (!rows || rows.length === 0) return null;
    
    // Find bracketing indices
    let i = 0;
    while (i < rows.length && rows[i][0] < jd) i++;
    
    if (i === 0) return rows[0].slice(1, 4);
    if (i >= rows.length) return rows[rows.length - 1].slice(1, 4);
    
    // Linear interpolation
    const [jd0, x0, y0, z0] = rows[i - 1];
    const [jd1, x1, y1, z1] = rows[i];
    const t = (jd - jd0) / (jd1 - jd0);
    
    return [
      x0 + t * (x1 - x0),
      y0 + t * (y1 - y0),
      z0 + t * (z1 - z0)
    ];
  }
  
  /**
   * Update planet rotations
   * For Earth, uses GMST for accurate real-time orientation
   * For other planets, uses sidereal rotation periods
   */
  updateRotations(deltaSec, timeWarp, currentDate) {
    // Update realistic sun animation
    const sunNodes = this.planetMeshes.get(10);
    if (sunNodes?.sunSystem) {
      sunNodes.sunSystem.update(deltaSec * timeWarp);
    }
    
    for (const [bodyId, nodes] of this.planetMeshes) {
      if (!nodes.spin) continue;
      
      // Skip sun rotation (it's handled by sun system internally if needed)
      if (bodyId === 10) continue;
      
      if (bodyId === 399 && currentDate) {
        // Earth: Use Greenwich Mean Sidereal Time for accurate rotation
        const gmstRad = this.calculateGMST(currentDate);
        
        // Apply texture alignment offsets
  // Texture seam alignment: 0 means map's 0° longitude aligns with GMST 0
  // Was -180 (placing seam at the back); set to 0 to rotate 180° and fix inversion
  const EARTH_TEX_LONG0_DEG = 0;
        const EARTH_GMST_CORR_DEG = -1.5;   // Fine-tuning correction
        
        const seamRad = (EARTH_TEX_LONG0_DEG * Math.PI) / 180;
        const corrRad = (EARTH_GMST_CORR_DEG * Math.PI) / 180;
        
        // Rotate around Y-axis (pole direction)
        // Apply GMST + texture offset + correction
        nodes.spin.rotation.y = gmstRad + seamRad + corrRad;
        
        // Update sun direction for Earth's day/night shader
        this.updateEarthSunDirection();

        // Optional: add gentle differential rotation for clouds relative to surface
        if (nodes.clouds) {
          const period_hr = SIDEREAL_ROTATION_HOURS[399];
          if (period_hr) {
            const fracRot = (deltaSec * timeWarp) / (period_hr * 3600);
            const deltaRad = 2.0 * Math.PI * fracRot;
            const drift = 0.05; // 5% faster than surface
            nodes.clouds.rotateY(deltaRad * drift);
          }
        }
      } else {
        // Other planets: Use sidereal rotation period
        const period_hr = SIDEREAL_ROTATION_HOURS[bodyId];
        if (!period_hr) continue;
        
        // Convert delta to fraction of rotation
        const fracRot = (deltaSec * timeWarp) / (period_hr * 3600);
        const deltaRad = 2 * Math.PI * fracRot;
        
        // Rotate about local Y-axis (pole direction)
        nodes.spin.rotateY(deltaRad);
      }
    }
  }
  
  /**
   * Update Earth's shader sun direction for day/night terminator
   * Must be called after planet positions have been updated
   */
  updateEarthSunDirection() {
    const sunNodes = this.planetMeshes.get(10); // Sun
    const earthNodes = this.planetMeshes.get(399); // Earth
    
    if (!sunNodes || !earthNodes || !earthNodes.globe) return;
    
    // Get material from userData (set during creation)
    const material = earthNodes.globe.userData?.dayNightMat;
    if (!material || !material.uniforms || !material.uniforms.uSunDir) return;
    
    // Get world positions
    const sunWorld = new this.THREE.Vector3();
    const earthWorld = new this.THREE.Vector3();
    
    sunNodes.bodyGroup.getWorldPosition(sunWorld);
    earthNodes.bodyGroup.getWorldPosition(earthWorld);
    
    // Calculate sun direction in world space
    const sunDirWorld = sunWorld.sub(earthWorld).normalize();
    
    // Transform to Earth globe's local space
    // The globe is the first child of the globeGroup
    const globeMesh = earthNodes.globe.children[0];
    if (!globeMesh || !globeMesh.matrixWorld) return;
    
    const invGlobe = new this.THREE.Matrix4().copy(globeMesh.matrixWorld).invert();
    const sunDirLocal = sunDirWorld.clone().transformDirection(invGlobe).normalize();
    
    // Update shader uniform
    material.uniforms.uSunDir.value.copy(sunDirLocal);
  }
  
  /**
   * Calculate Greenwich Mean Sidereal Time (GMST)
   * Uses IAU 2006/2000A reduced expression
   * @param {Date} date - Current date/time (UTC)
   * @returns {number} GMST in radians (0 to 2π)
   */
  calculateGMST(date) {
    // Full Julian Date (includes time of day)
    const JD = this.dateToJD(date);

    // Julian Date at 0h UT (preceding midnight)
    const JD0 = Math.floor(JD - 0.5) + 0.5;

    // UT in seconds since 0h UT
    const UT_sec = (JD - JD0) * 86400.0;

    // Julian centuries since J2000 from 0h UT
    const T = (JD0 - 2451545.0) / 36525.0;

    // GMST at UT (IAU 2006/2000A reduced expression)
    // Using form with explicit UT term to avoid double-counting:
    // GMST(sec) = 24110.54841 + 8640184.812866*T + 0.093104*T^2 - 6.2e-6*T^3 + 1.00273790935*UT_sec
    let gmst_sec = 24110.54841
                 + 8640184.812866 * T
                 + 0.093104 * T * T
                 - 6.2e-6 * T * T * T
                 + 1.00273790935 * UT_sec;

    // Wrap to [0, 86400)
    gmst_sec = ((gmst_sec % 86400) + 86400) % 86400;

    // Convert to radians (1 degree = 240 seconds)
    const gmst_rad = (gmst_sec / 240.0) * (Math.PI / 180.0);

    return gmst_rad;
  }
  
  /**
   * Helper to convert Date to Julian Date (duplicated to avoid circular dependency)
   */
  dateToJD(date) {
    const y = date.getUTCFullYear();
    const m = date.getUTCMonth() + 1;
    const d = date.getUTCDate();
    const h = date.getUTCHours();
    const min = date.getUTCMinutes();
    const s = date.getUTCSeconds() + date.getUTCMilliseconds() / 1000;
    
    const a = Math.floor((14 - m) / 12);
    const y2 = y + 4800 - a;
    const m2 = m + 12 * a - 3;
    
    const jdn = d + Math.floor((153 * m2 + 2) / 5) + 365 * y2 
              + Math.floor(y2 / 4) - Math.floor(y2 / 100) 
              + Math.floor(y2 / 400) - 32045;
    
    const fracDay = (h - 12) / 24 + min / 1440 + s / 86400;
    
    return jdn + fracDay;
  }
  
  /**
   * Set ephemeris data
   */
  setEphemerisData(data) {
    this.ephemerisData = data;
    // Defer creating orbital lines until we know the simulation JD via updatePositions.
    // If updatePositions hasn't been called yet, we can still create using real now as a fallback.
    if (this.currentJD != null) {
      this.createOrbitalLines();
    } else {
      // Create once so something is visible; it will be re-phased on first updatePositions call.
      this.createOrbitalLines();
      this.orbitLinesSyncedJD = null; // force a re-phase on first update
    }
  }
  
  /**
   * Set planet scale multiplier (excludes Sun)
   */
  setPlanetScale(scale) {
    this.planetScaleMultiplier = scale;
    // Update all planet sizes (exclude Sun)
    for (const [bodyId, nodes] of this.planetMeshes) {
      if (bodyId === 10) continue; // Skip Sun
      
      const radius = PLANET_RADII_KM[bodyId];
      const visualRadius = (radius / KM_PER_UNIT) * scale;
      // Update globe mesh geometry (globe is a Group; first child is the Mesh)
      const globeMesh = nodes.globe && nodes.globe.children && nodes.globe.children[0];
      if (globeMesh && globeMesh.isMesh) {
        globeMesh.geometry.dispose();
        globeMesh.geometry = new this.THREE.SphereGeometry(visualRadius, 64, 64);
      }
      
      // Update rings if present
      if (nodes.ring && bodyId === 699) {
        const innerRad = (74500 / KM_PER_UNIT) * scale;
        const outerRad = (140220 / KM_PER_UNIT) * scale;
        nodes.ring.geometry.dispose();
        nodes.ring.geometry = new this.THREE.RingGeometry(innerRad, outerRad, 128, 4);
      }
      
      // Update pole spike if present
      if (nodes.poleSpike) {
        // Remove old spike and create new one at correct scale
        nodes.orient.remove(nodes.poleSpike);
        this.addPoleSpike(nodes.orient, visualRadius, bodyId);
      }

      // Update clouds shell if present
      if (nodes.clouds) {
        const cloudRadius = visualRadius * 1.003;
        nodes.clouds.geometry.dispose();
        nodes.clouds.geometry = new this.THREE.SphereGeometry(cloudRadius, 64, 64);
      }
    }
  }
  
  /**
   * Set sun scale multiplier
   */
  setSunScale(scale) {
    this.sunScaleMultiplier = scale;
    const sunNodes = this.planetMeshes.get(10);
    if (!sunNodes) return;
    
    const radius = PLANET_RADII_KM[10];
    const visualRadius = (radius / KM_PER_UNIT) * scale;
    
    // Update sun system scale if it exists
    if (sunNodes.sunSystem) {
      // The sun system manages its own sphere
      sunNodes.sunSystem.setScale(scale);
    } else {
      // Fallback for basic sun mesh
      const globeMesh = sunNodes.globe && sunNodes.globe.children && sunNodes.globe.children[0];
      if (globeMesh && globeMesh.isMesh) {
        globeMesh.geometry.dispose();
        globeMesh.geometry = new this.THREE.SphereGeometry(visualRadius, 64, 64);
      }
    }
  }
  
  /**
   * Get planet nodes by body ID
   */
  getPlanetNodes(bodyId) {
    return this.planetMeshes.get(bodyId);
  }
  
  /**
   * Get all pickable planet objects
   */
  getPickableObjects() {
    const objects = [];
    for (const nodes of this.planetMeshes.values()) {
      objects.push(nodes.globe);
    }
    return objects;
  }
  
  /**
   * Toggle orbital lines visibility
   */
  setOrbitalLinesVisible(visible) {
    for (const line of this.orbitalLines.values()) {
      line.visible = visible;
    }
  }
}
