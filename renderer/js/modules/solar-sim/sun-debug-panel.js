/**
 * Sun Debug Panel
 * Temporary on-screen controls for tuning sun parameters
 */

export class SunDebugPanel {
  constructor(sunSystem) {
    this.sunSystem = sunSystem;
    this.panel = null;
    this.controls = {};
    this.isVisible = false;
    
    this.createPanel();
    this.attachEventListeners();
  }

  createPanel() {
    // Create panel container
    this.panel = document.createElement('div');
    this.panel.id = 'sun-debug-panel';
    this.panel.style.cssText = `
      position: fixed;
      top: 100px;
      right: 20px;
      width: 320px;
      max-height: 80vh;
      overflow-y: auto;
      background: rgba(0, 0, 0, 0.85);
      border: 1px solid #444;
      border-radius: 8px;
      padding: 15px;
      font-family: 'Courier New', monospace;
      font-size: 12px;
      color: #fff;
      z-index: 10000;
      box-shadow: 0 4px 12px rgba(0,0,0,0.5);
      display: none;
    `;

    // Title
    const title = document.createElement('div');
    title.textContent = '☀️ Sun Debug Controls';
    title.style.cssText = `
      font-size: 14px;
      font-weight: bold;
      margin-bottom: 12px;
      padding-bottom: 8px;
      border-bottom: 1px solid #555;
      color: #ffa500;
    `;
    this.panel.appendChild(title);

    // Photosphere parameters
    this.addSection('Photosphere');
    this.addSlider('granuleScale', 'Granule Scale', 5, 50, 22, 0.5);
    this.addSlider('granuleSpeed', 'Granule Speed', 0, 0.3, 0.1, 0.01);
    this.addSlider('granuleContrast', 'Granule Contrast', 0, 2, 0.8, 0.05);
    this.addSlider('turbulenceScale', 'Turbulence Scale', 1, 20, 10, 0.5);
    this.addSlider('turbulenceSpeed', 'Turbulence Speed', 0, 0.5, 0.15, 0.01);
    this.addSlider('bumpStrength', 'Bump Strength', 0, 1, 0.35, 0.05);
    
    // Lighting & Color
    this.addSection('Lighting & Color');
    this.addSlider('emissionStrength', 'Emission Strength', 0.1, 5, 0.6, 0.1);
    this.addSlider('limbDarkening', 'Limb Darkening', 0, 1, 0.8, 0.05);
    this.addSlider('activeRegions', 'Active Regions', 0, 1, 0.25, 0.05);
    this.addColorPicker('emissionColor', 'Emission Color', '#fff5cc');
    this.addSlider('emissionHue', 'Hue Shift', -30, 30, 0, 1);
    this.addSlider('emissionSaturation', 'Saturation', 0, 2, 1, 0.05);
    
    // Corona
    this.addSection('Corona');
    this.addSlider('coronaAlpha', 'Corona Alpha', 0, 3, 1.2, 0.1);
    this.addSlider('coronaDensityFalloff', 'Density Falloff', 1, 5, 3, 0.1);
    this.addColorPicker('coronaColor', 'Corona Color', '#ffe6b3');

    // Preset buttons
    this.addSection('Presets');
    this.addPresetButtons();

    // Toggle button
    const toggleBtn = document.createElement('button');
    toggleBtn.textContent = '↓ Collapse';
    toggleBtn.style.cssText = `
      width: 100%;
      padding: 8px;
      margin-top: 12px;
      background: #333;
      border: 1px solid #555;
      border-radius: 4px;
      color: #fff;
      cursor: pointer;
      font-size: 11px;
    `;
    toggleBtn.addEventListener('click', () => this.toggle());
    this.panel.appendChild(toggleBtn);

    document.body.appendChild(this.panel);
  }

  addSection(name) {
    const section = document.createElement('div');
    section.style.cssText = `
      margin-top: 15px;
      padding-top: 10px;
      border-top: 1px solid #444;
      font-weight: bold;
      color: #aaa;
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    `;
    section.textContent = name;
    this.panel.appendChild(section);
  }

  addSlider(id, label, min, max, value, step) {
    const container = document.createElement('div');
    container.style.cssText = `
      margin: 10px 0;
    `;

    const labelEl = document.createElement('label');
    labelEl.textContent = label;
    labelEl.style.cssText = `
      display: block;
      margin-bottom: 4px;
      color: #ccc;
      font-size: 11px;
    `;

    const valueDisplay = document.createElement('span');
    valueDisplay.style.cssText = `
      float: right;
      color: #ffa500;
      font-weight: bold;
    `;
    valueDisplay.textContent = value.toFixed(step < 0.1 ? 2 : 1);
    labelEl.appendChild(valueDisplay);

    const slider = document.createElement('input');
    slider.type = 'range';
    slider.id = `sun-${id}`;
    slider.min = min;
    slider.max = max;
    slider.value = value;
    slider.step = step;
    slider.style.cssText = `
      width: 100%;
      margin-top: 4px;
    `;

    slider.addEventListener('input', (e) => {
      const val = parseFloat(e.target.value);
      valueDisplay.textContent = val.toFixed(step < 0.1 ? 2 : 1);
      this.updateParameter(id, val);
    });

    container.appendChild(labelEl);
    container.appendChild(slider);
    this.panel.appendChild(container);
    
    this.controls[id] = { slider, valueDisplay };
  }

  addColorPicker(id, label, defaultColor) {
    const container = document.createElement('div');
    container.style.cssText = `
      margin: 10px 0;
    `;

    const labelEl = document.createElement('label');
    labelEl.textContent = label;
    labelEl.style.cssText = `
      display: block;
      margin-bottom: 4px;
      color: #ccc;
      font-size: 11px;
    `;

    const colorInput = document.createElement('input');
    colorInput.type = 'color';
    colorInput.id = `sun-${id}`;
    colorInput.value = defaultColor;
    colorInput.style.cssText = `
      width: 100%;
      height: 32px;
      border: 1px solid #555;
      border-radius: 4px;
      cursor: pointer;
      background: #222;
    `;

    colorInput.addEventListener('input', (e) => {
      this.updateParameter(id, e.target.value);
    });

    container.appendChild(labelEl);
    container.appendChild(colorInput);
    this.panel.appendChild(container);
    
    this.controls[id] = { input: colorInput };
  }

  addPresetButtons() {
    const presets = [
      { name: 'Default', values: {
        granuleScale: 22, granuleSpeed: 0.1, granuleContrast: 0.8,
        turbulenceScale: 10, turbulenceSpeed: 0.15, bumpStrength: 0.35,
        emissionStrength: 0.6, limbDarkening: 0.8, activeRegions: 0.25,
        coronaAlpha: 1.2, coronaDensityFalloff: 3,
        emissionHue: 0, emissionSaturation: 1,
        emissionColor: '#fff5cc', coronaColor: '#ffe6b3'
      }},
      { name: 'Bright & Active', values: {
        granuleScale: 18, granuleSpeed: 0.15, granuleContrast: 1.2,
        turbulenceScale: 12, turbulenceSpeed: 0.2, bumpStrength: 0.5,
        emissionStrength: 1.2, limbDarkening: 0.6, activeRegions: 0.4,
        coronaAlpha: 2.0, coronaDensityFalloff: 2.5,
        emissionHue: 5, emissionSaturation: 1.2,
        emissionColor: '#ffeb99', coronaColor: '#ffd699'
      }},
      { name: 'Soft & Smooth', values: {
        granuleScale: 30, granuleSpeed: 0.05, granuleContrast: 0.4,
        turbulenceScale: 8, turbulenceSpeed: 0.08, bumpStrength: 0.2,
        emissionStrength: 0.8, limbDarkening: 0.9, activeRegions: 0.1,
        coronaAlpha: 0.8, coronaDensityFalloff: 3.5,
        emissionHue: -5, emissionSaturation: 0.8,
        emissionColor: '#fffae6', coronaColor: '#fff5e6'
      }}
    ];

    const btnContainer = document.createElement('div');
    btnContainer.style.cssText = `
      display: flex;
      gap: 8px;
      margin-top: 10px;
      flex-wrap: wrap;
    `;

    presets.forEach(preset => {
      const btn = document.createElement('button');
      btn.textContent = preset.name;
      btn.style.cssText = `
        flex: 1;
        padding: 8px;
        background: #2a2a2a;
        border: 1px solid #555;
        border-radius: 4px;
        color: #fff;
        cursor: pointer;
        font-size: 10px;
        transition: background 0.2s;
      `;
      btn.addEventListener('mouseenter', () => btn.style.background = '#3a3a3a');
      btn.addEventListener('mouseleave', () => btn.style.background = '#2a2a2a');
      btn.addEventListener('click', () => this.applyPreset(preset.values));
      btnContainer.appendChild(btn);
    });

    this.panel.appendChild(btnContainer);
  }

  updateParameter(id, value) {
    if (!this.sunSystem) return;

    // Map control IDs to sun system parameters
    const paramMap = {
      granuleScale: 'uGranuleScale',
      granuleSpeed: 'uGranuleSpeed',
      granuleContrast: 'uGranuleContrast',
      turbulenceScale: 'uTurbulenceScale',
      turbulenceSpeed: 'uTurbulenceSpeed',
      bumpStrength: 'uBumpStrength',
      emissionStrength: 'uEmissionStrength',
      limbDarkening: 'uLimbDarkening',
      activeRegions: 'uActiveRegions'
    };

    // Update photosphere uniforms
    if (this.sunSystem.sunMesh && this.sunSystem.sunMesh.material.uniforms) {
      const uniforms = this.sunSystem.sunMesh.material.uniforms;
      
      if (paramMap[id] && uniforms[paramMap[id]]) {
        uniforms[paramMap[id]].value = value;
      }

      // Color adjustments
      if (id === 'emissionColor') {
        const color = this.hexToRGB(value);
        const hue = this.controls.emissionHue?.slider?.value || 0;
        const sat = this.controls.emissionSaturation?.slider?.value || 1;
        const adjusted = this.adjustColor(color, hue, sat);
        uniforms.uEmissionColor = uniforms.uEmissionColor || { value: new this.sunSystem.THREE.Color() };
        uniforms.uEmissionColor.value.setRGB(adjusted.r, adjusted.g, adjusted.b);
      }

      if (id === 'emissionHue' || id === 'emissionSaturation') {
        const baseColor = this.controls.emissionColor?.input?.value || '#fff5cc';
        const color = this.hexToRGB(baseColor);
        const hue = id === 'emissionHue' ? value : (this.controls.emissionHue?.slider?.value || 0);
        const sat = id === 'emissionSaturation' ? value : (this.controls.emissionSaturation?.slider?.value || 1);
        const adjusted = this.adjustColor(color, hue, sat);
        uniforms.uEmissionColor = uniforms.uEmissionColor || { value: new this.sunSystem.THREE.Color() };
        uniforms.uEmissionColor.value.setRGB(adjusted.r, adjusted.g, adjusted.b);
      }
    }

    // Update corona uniforms
    if (this.sunSystem.coronaMesh && this.sunSystem.coronaMesh.material.uniforms) {
      const uniforms = this.sunSystem.coronaMesh.material.uniforms;
      
      if (id === 'coronaAlpha') {
        uniforms.uAlphaScale = uniforms.uAlphaScale || { value: 1.0 };
        uniforms.uAlphaScale.value = value;
      }
      
      if (id === 'coronaDensityFalloff' && uniforms.uDensityFalloff) {
        uniforms.uDensityFalloff.value = value;
      }

      if (id === 'coronaColor') {
        const color = this.hexToRGB(value);
        uniforms.uCoronaColor.value.setRGB(color.r, color.g, color.b);
      }
    }
  }

  applyPreset(values) {
    Object.entries(values).forEach(([key, value]) => {
      if (this.controls[key]) {
        if (this.controls[key].slider) {
          this.controls[key].slider.value = value;
          const step = parseFloat(this.controls[key].slider.step);
          this.controls[key].valueDisplay.textContent = value.toFixed(step < 0.1 ? 2 : 1);
        } else if (this.controls[key].input) {
          this.controls[key].input.value = value;
        }
        this.updateParameter(key, value);
      }
    });
  }

  hexToRGB(hex) {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? {
      r: parseInt(result[1], 16) / 255,
      g: parseInt(result[2], 16) / 255,
      b: parseInt(result[3], 16) / 255
    } : { r: 1, g: 1, b: 1 };
  }

  adjustColor(color, hueDeg, saturation) {
    // Convert RGB to HSL
    const max = Math.max(color.r, color.g, color.b);
    const min = Math.min(color.r, color.g, color.b);
    let h, s, l = (max + min) / 2;

    if (max === min) {
      h = s = 0;
    } else {
      const d = max - min;
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
      
      switch (max) {
        case color.r: h = ((color.g - color.b) / d + (color.g < color.b ? 6 : 0)) / 6; break;
        case color.g: h = ((color.b - color.r) / d + 2) / 6; break;
        case color.b: h = ((color.r - color.g) / d + 4) / 6; break;
      }
    }

    // Apply adjustments
    h = (h + hueDeg / 360) % 1;
    if (h < 0) h += 1;
    s = Math.max(0, Math.min(1, s * saturation));

    // Convert back to RGB
    const hue2rgb = (p, q, t) => {
      if (t < 0) t += 1;
      if (t > 1) t -= 1;
      if (t < 1/6) return p + (q - p) * 6 * t;
      if (t < 1/2) return q;
      if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
      return p;
    };

    let r, g, b;
    if (s === 0) {
      r = g = b = l;
    } else {
      const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
      const p = 2 * l - q;
      r = hue2rgb(p, q, h + 1/3);
      g = hue2rgb(p, q, h);
      b = hue2rgb(p, q, h - 1/3);
    }

    return { r, g, b };
  }

  show() {
    this.panel.style.display = 'block';
    this.isVisible = true;
  }

  hide() {
    this.panel.style.display = 'none';
    this.isVisible = false;
  }

  toggle() {
    if (this.isVisible) {
      this.hide();
    } else {
      this.show();
    }
  }

  attachEventListeners() {
    // Keyboard shortcut: Ctrl+Shift+S to toggle
    document.addEventListener('keydown', (e) => {
      if (e.ctrlKey && e.shiftKey && e.key === 'S') {
        e.preventDefault();
        this.toggle();
      }
    });
  }

  dispose() {
    if (this.panel && this.panel.parentNode) {
      this.panel.parentNode.removeChild(this.panel);
    }
  }
}
