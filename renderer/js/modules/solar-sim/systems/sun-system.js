/**
 * Solar System Simulator - Realistic Sun Rendering
 * Physically accurate sun with dynamic surface convection, corona, and prominences
 */

/**
 * Sun System Class
 * Manages realistic sun rendering with dynamic surface effects
 */
export class SunSystem {
  constructor(THREE, scene) {
    this.THREE = THREE;
    this.scene = scene;
    this.sunMesh = null;
    this.coronaMesh = null;
    this.prominences = [];
    this.time = 0;
    
    // Physical parameters
    this.sunRadius = 1.0; // Will be set from actual size
    this.baseRadius = 1.0; // Store base radius for scaling
    this.surfaceTemperature = 5778; // Kelvin
    this.coronaTemperature = 2000000; // Kelvin (corona is much hotter)

    // Prominence controls
    this.maxProminences = 2;
    this.prominenceSpawnCooldown = 30.0; // seconds between spawns
    this._spawnTimer = 0.0;
  }

  /**
   * Create the realistic sun with all layers
   * @param {number} radius - Visual radius in scene units
   * @returns {THREE.Group} - Sun group containing all meshes
   */
  createSun(radius) {
    this.sunRadius = radius;
    this.baseRadius = radius; // Store base radius for scaling
    const sunGroup = new this.THREE.Group();
    sunGroup.name = 'RealisticSun';

    // Core photosphere with dynamic surface shader (purely procedural)
    this.sunMesh = this.createPhotosphere(radius);
    sunGroup.add(this.sunMesh);

    // Corona (outer atmosphere)
    this.coronaMesh = this.createCorona(radius);
    sunGroup.add(this.coronaMesh);

    // Done building the sun
    return sunGroup;
  }

  /**
   * Create the sun's photosphere (visible surface)
   */
  createPhotosphere(radius) {
    const geometry = new this.THREE.SphereGeometry(radius, 128, 128);

    const uniforms = {
      uTime: { value: 0 },
      uSurfaceTemp: { value: this.surfaceTemperature },
      uGranuleScale: { value: 22.0 },
      uGranuleSpeed: { value: 0.1 },
      uGranuleContrast: { value: 0.8 },
      uLimbDarkening: { value: 0.8 },
      uActiveRegions: { value: 0.25 },
      uTurbulenceScale: { value: 10.0 },
      uTurbulenceSpeed: { value: 0.15 },
      uEmissionStrength: { value: 0.6 },
      uBumpStrength: { value: 0.35 },
      uEmissionColor: { value: new this.THREE.Color(1.0, 0.96, 0.8) }
    };

    const material = new this.THREE.ShaderMaterial({
      uniforms: uniforms,
      vertexShader: `
        precision highp float;
        #include <common>
        #include <logdepthbuf_pars_vertex>
        
        varying vec3 vNormal;
        varying vec3 vPosition;
        varying vec3 vViewDir;
        
        void main() {
          vNormal = normalize(normalMatrix * normal);
          vPosition = position;
          
          vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
          vViewDir = normalize(-mvPosition.xyz);
          
          gl_Position = projectionMatrix * mvPosition;
          #include <logdepthbuf_vertex>
        }
      `,
      fragmentShader: `
        precision highp float;
        #include <common>
        #include <logdepthbuf_pars_fragment>
        
        uniform float uTime;
        uniform float uSurfaceTemp;
        uniform float uGranuleScale;
        uniform float uGranuleSpeed;
        uniform float uGranuleContrast;
        uniform float uLimbDarkening;
        uniform float uActiveRegions;
        uniform float uTurbulenceScale;
        uniform float uTurbulenceSpeed;
        uniform float uEmissionStrength;
        uniform float uBumpStrength;
        uniform vec3 uEmissionColor;
        
        varying vec3 vNormal;
        varying vec3 vPosition;
        varying vec3 vViewDir;
        
        // Solar emission spectrum (G2V star ~5778K)
        // Returns linear RGB emission color
        vec3 solarEmission() {
          return uEmissionColor; // User-controllable emission color
        }
        
        vec3 hash3(vec3 p) {
          p = fract(p * vec3(443.537, 537.247, 247.428));
          p += dot(p, p.yxz + 19.19);
          return fract((p.xxy + p.yxx) * p.zyx);
        }
        
        float noise3d(vec3 p) {
          vec3 i = floor(p);
          vec3 f = fract(p);
          f = f * f * (3.0 - 2.0 * f);
          float n = mix(
            mix(
              mix(hash3(i).x, hash3(i + vec3(1,0,0)).x, f.x),
              mix(hash3(i + vec3(0,1,0)).x, hash3(i + vec3(1,1,0)).x, f.x),
              f.y
            ),
            mix(
              mix(hash3(i + vec3(0,0,1)).x, hash3(i + vec3(1,0,1)).x, f.x),
              mix(hash3(i + vec3(0,1,1)).x, hash3(i + vec3(1,1,1)).x, f.x),
              f.y
            ),
            f.z
          );
          return n;
        }
        
        // Soft Voronoi-like granulation (cell distance but smoothed)
        float softVoronoi(vec3 p) {
          vec3 i = floor(p);
          vec3 f = fract(p);
          float minDist = 1.0;
          for (int x = -1; x <= 1; x++) {
            for (int y = -1; y <= 1; y++) {
              for (int z = -1; z <= 1; z++) {
                vec3 g = vec3(float(x), float(y), float(z));
                vec3 o = hash3(i + g);
                vec3 r = g + o - f;
                float d = dot(r, r);
                minDist = min(minDist, d);
              }
            }
          }
          return sqrt(minDist);
        }
        
        float fbm(vec3 p, int octaves) {
          float value = 0.0;
          float amplitude = 0.5;
          float frequency = 1.0;
          for (int i = 0; i < 4; i++) {
            if (i >= octaves) break;
            value += amplitude * noise3d(p * frequency);
            frequency *= 2.0;
            amplitude *= 0.5;
          }
          return value;
        }
        
        void main() {
          #include <logdepthbuf_fragment>
          
          vec3 N = normalize(vNormal);
          vec3 V = normalize(vViewDir);
          float NdotV = max(dot(N, V), 0.0);
          
          // Base solar emission (not reflected light)
          vec3 emission = solarEmission();
          
          // Add radial color gradient from center to limb
          // Center is hotter/whiter, limb is cooler/more orange
          vec3 centerColor = vec3(1.0, 0.98, 0.92); // Hot white core
          vec3 limbColor = vec3(1.0, 0.85, 0.6);    // Cooler orange limb
          float radialGradient = pow(NdotV, 0.8);
          vec3 gradientColor = mix(limbColor, centerColor, radialGradient);
          emission *= gradientColor;
          
          vec3 dir = normalize(vPosition);
          vec3 flow = vec3(
            sin(uTime * 0.05 + dir.x * 3.1),
            cos(uTime * 0.04 + dir.y * 2.7),
            sin(uTime * 0.03 + dir.z * 2.3)
          ) * 0.25;

          // Multi-scale convection pattern
          vec3 P1 = dir * uGranuleScale + flow + vec3(uTime * uGranuleSpeed);
          float cells1 = softVoronoi(P1);
          float cells2 = softVoronoi(P1 * 2.3 + vec3(50.0));
          
          // Blend cellular pattern with turbulence
          float cellPattern = mix(cells1, cells2, 0.4);
          
          float turb1 = fbm(dir * uTurbulenceScale + vec3(uTime * uTurbulenceSpeed), 4);
          float turb2 = noise3d(dir * (uTurbulenceScale * 1.8) + vec3(uTime * uTurbulenceSpeed * 1.5));
          float turbulence = mix(turb1, turb2, 0.5);
          
          // Granulation modulates emission intensity (softer, less compression)
          float granulation = cellPattern * 0.7 + turbulence * 0.3;
          
          // Emission intensity variation (bright granules, darker lanes)
          float intensity = 1.0 + (granulation - 0.5) * uGranuleContrast;
          intensity *= 1.0 + (turbulence - 0.5) * 0.35;

          // Derive a pseudo-normal from surface granulation to add perceived depth
          // Build tangent basis around the geometric normal
          vec3 upRef = (abs(N.y) < 0.99) ? vec3(0.0, 1.0, 0.0) : vec3(1.0, 0.0, 0.0);
          vec3 T = normalize(cross(upRef, N));
          vec3 B = normalize(cross(N, T));
          float eps = 0.02;
          // Sample granulation a tiny step along tangents
          float gT1 = softVoronoi(normalize(dir + T * eps) * uGranuleScale + flow + vec3(uTime * uGranuleSpeed));
          float gT2 = softVoronoi(normalize(dir - T * eps) * uGranuleScale + flow + vec3(uTime * uGranuleSpeed));
          float gB1 = softVoronoi(normalize(dir + B * eps) * uGranuleScale + flow + vec3(uTime * uGranuleSpeed));
          float gB2 = softVoronoi(normalize(dir - B * eps) * uGranuleScale + flow + vec3(uTime * uGranuleSpeed));
          float dTx = gT1 - gT2;
          float dBy = gB1 - gB2;
          vec3 Np = normalize(N + uBumpStrength * (dTx * T + dBy * B));
          // Use pseudo-normal to modulate intensity by view angle for self-occlusion feel
          float slopeShade = pow(max(dot(Np, V), 0.0), 1.2);
          intensity *= mix(0.85, 1.15, slopeShade);
          intensity = clamp(intensity, 0.55, 1.25);
          
          // Active regions (sunspots, plages)
          vec3 activePos = dir * 3.5 + vec3(uTime * 0.015);
          float activeRegion = noise3d(activePos);
          float activeModulation = 1.0 - uActiveRegions * smoothstep(0.65, 0.85, activeRegion) * 0.4;
          
          // Limb darkening (optical depth effect in photosphere)
          float limbFactor = mix(1.0 - uLimbDarkening, 1.0, NdotV);
          
          // Final emitted light
          vec3 finalEmission = emission * intensity * activeModulation * limbFactor * uEmissionStrength;
          
          // Very subtle limb contribution from hotter chromosphere
          float chromosphere = pow(1.0 - NdotV, 4.0) * 0.05;
          finalEmission += emission * chromosphere * 0.25;
          
          gl_FragColor = vec4(finalEmission, 1.0);
        }
      `,
      side: this.THREE.FrontSide,
      transparent: false,
      depthWrite: true,
      depthTest: true
    });

    const mesh = new this.THREE.Mesh(geometry, material);
    mesh.name = 'SunPhotosphere';
    return mesh;
  }

  /**
   * Create the sun's corona (outer atmosphere)
   * Extremely hot, tenuous plasma visible during eclipses
   */
  createCorona(radius) {
    const coronaRadius = radius * 1.4; // Subtle glow extending just beyond sun
    const geometry = new this.THREE.SphereGeometry(coronaRadius, 64, 64);
    
    const uniforms = {
      uTime: { value: 0 },
      uSunRadius: { value: radius },
      uCoronaColor: { value: new this.THREE.Color(1.0, 0.9, 0.7) },
      uDensityFalloff: { value: 2.5 },
      uAlphaScale: { value: 3.0 }
    };

    const material = new this.THREE.ShaderMaterial({
      uniforms: uniforms,
      vertexShader: `
        precision highp float;
        #include <common>
        #include <logdepthbuf_pars_vertex>
        
        varying vec3 vPosition;
        varying vec3 vNormal;
        varying vec3 vWorldPos;
        varying vec3 vViewDir;
        
        void main() {
          vPosition = position;
          vNormal = normalize(normalMatrix * normal);
          
          vec4 worldPos = modelMatrix * vec4(position, 1.0);
          vWorldPos = worldPos.xyz;
          
          vec4 mvPosition = viewMatrix * worldPos;
          vViewDir = normalize(-mvPosition.xyz);
          
          gl_Position = projectionMatrix * mvPosition;
          #include <logdepthbuf_vertex>
        }
      `,
      fragmentShader: `
        precision highp float;
        #include <common>
        #include <logdepthbuf_pars_fragment>
        
        uniform float uTime;
        uniform float uSunRadius;
        uniform vec3 uCoronaColor;
        uniform float uDensityFalloff;
        uniform float uAlphaScale;
        
        varying vec3 vPosition;
        varying vec3 vNormal;
        varying vec3 vWorldPos;
        varying vec3 vViewDir;
        
        // Simple hash for corona wisp animation
        float hash(vec3 p) {
          p = fract(p * 0.3183099 + 0.1);
          p *= 17.0;
          return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
        }
        
        float noise(vec3 x) {
          vec3 i = floor(x);
          vec3 f = fract(x);
          f = f * f * (3.0 - 2.0 * f);
          return mix(
            mix(mix(hash(i), hash(i + vec3(1,0,0)), f.x),
                mix(hash(i + vec3(0,1,0)), hash(i + vec3(1,1,0)), f.x), f.y),
            mix(mix(hash(i + vec3(0,0,1)), hash(i + vec3(1,0,1)), f.x),
                mix(hash(i + vec3(0,1,1)), hash(i + vec3(1,1,1)), f.x), f.y),
            f.z
          );
        }
        
        void main() {
          #include <logdepthbuf_fragment>
          
          // Calculate distance from sun center
          float dist = length(vPosition);
          
          // How far from sun surface (0 = at surface, 1 = at corona edge)
          float coronaThickness = dist - uSunRadius;
          float maxThickness = uSunRadius * 1.5;
          float normalizedDist = clamp(coronaThickness / maxThickness, 0.0, 1.0);
          
          // Fresnel-like effect: glow is strongest at grazing angles (viewing the edge)
          vec3 V = normalize(vViewDir);
          vec3 N = normalize(vNormal);
          float fresnel = 1.0 - abs(dot(V, N));
          fresnel = pow(fresnel, 1.5); // Sharpen the edge glow
          
          // Distance-based falloff: bright AT the sun surface, fades as we go outward
          // normalizedDist = 0 at sun surface (bright), 1 at corona edge (faded)
          float distFalloff = exp(-normalizedDist * uDensityFalloff);
          
          // Combine fresnel edge glow with distance falloff
          float glow = fresnel * distFalloff;
          
          // Add animated wisps for variation
          vec3 wisp = normalize(vWorldPos) * 2.0 + vec3(uTime * 0.08, uTime * 0.12, uTime * 0.06);
          float wispNoise = noise(wisp) * 0.5 + 0.5;
          glow *= 0.6 + 0.4 * wispNoise;
          
          // Apply alpha scaling
          float alpha = glow * uAlphaScale;
          
          // Color gradient: bright warm glow at sun surface, fades to cooler dim at edge
          vec3 innerColor = uCoronaColor * 2.0; // Bright at inner edge (close to sun surface)
          vec3 outerColor = uCoronaColor * 0.2; // Dim at outer edge (far from sun)
          vec3 color = mix(innerColor, outerColor, normalizedDist);
          color *= 1.0 + wispNoise * 0.3;
          
          gl_FragColor = vec4(color, alpha);
        }
      `,
      side: this.THREE.FrontSide, // Render front faces from outside
      transparent: true,
      depthWrite: false,
      depthTest: true,
      blending: this.THREE.AdditiveBlending
    });

    const mesh = new this.THREE.Mesh(geometry, material);
    mesh.name = 'SunCorona';
    mesh.renderOrder = 1;
    
    return mesh;
  }

  /**
   * Update sun animation
   * @param {number} deltaTime - Time since last frame in seconds
   */
  update(deltaTime) {
    this.time += deltaTime;
    
    // Update photosphere shader time
    if (this.sunMesh && this.sunMesh.material.uniforms) {
      this.sunMesh.material.uniforms.uTime.value = this.time;
    }
    
    // Update corona shader time
    if (this.coronaMesh && this.coronaMesh.material.uniforms) {
      this.coronaMesh.material.uniforms.uTime.value = this.time;
      // Update sun radius in case it's needed
      if (this.coronaMesh.material.uniforms.uSunRadius) {
        this.coronaMesh.material.uniforms.uSunRadius.value = this.sunRadius;
      }
    }
  }

  /**
   * Adjust sun parameters
   */
  setParameters(params) {
    if (this.sunMesh && this.sunMesh.material.uniforms) {
      const uniforms = this.sunMesh.material.uniforms;
      
      if (params.granuleScale !== undefined) uniforms.uGranuleScale.value = params.granuleScale;
      if (params.granuleSpeed !== undefined) uniforms.uGranuleSpeed.value = params.granuleSpeed;
      if (params.granuleContrast !== undefined) uniforms.uGranuleContrast.value = params.granuleContrast;
      if (params.limbDarkening !== undefined) uniforms.uLimbDarkening.value = params.limbDarkening;
      if (params.activeRegions !== undefined) uniforms.uActiveRegions.value = params.activeRegions;
      if (params.turbulenceScale !== undefined) uniforms.uTurbulenceScale.value = params.turbulenceScale;
      if (params.turbulenceSpeed !== undefined) uniforms.uTurbulenceSpeed.value = params.turbulenceSpeed;
    }
  }

  /**
   * Set sun scale
   * @param {number} scale - Scale multiplier
   */
  setScale(scale) {
    const newRadius = this.baseRadius * scale;
    this.sunRadius = newRadius;
    
    // Update photosphere geometry
    if (this.sunMesh) {
      this.sunMesh.geometry.dispose();
      this.sunMesh.geometry = new this.THREE.SphereGeometry(newRadius, 128, 128);
    }
    
    // Update corona geometry
    if (this.coronaMesh) {
      this.coronaMesh.geometry.dispose();
      this.coronaMesh.geometry = new this.THREE.SphereGeometry(newRadius * 1.15, 64, 64);
    }
  }

  /**
   * Clean up resources
   */
  dispose() {
    if (this.sunMesh) {
      this.sunMesh.geometry.dispose();
      this.sunMesh.material.dispose();
    }
    
    if (this.coronaMesh) {
      this.coronaMesh.geometry.dispose();
      this.coronaMesh.material.dispose();
    }
  }
}
