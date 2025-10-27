/**
 * Solar System Simulator - UI Controller
 * Manages UI elements and user controls
 */

/**
 * UI Controller Class
 * Handles all UI interactions and updates
 */
export class UIController {
  constructor(containerId) {
    this.container = document.getElementById(containerId);
    this.callbacks = {};
  }
  
  /**
   * Initialize UI elements
   */
  initialize() {
    this.createControls();
    this.attachEventListeners();
  }
  
  /**
   * Create control UI
   */
  createControls() {
    const controlsHTML = `
        <div class="control-panel">
          <h3>Time Control</h3>
          <div class="time-controls">
            <button id="ss-time-pause" class="btn-secondary">Pause</button>
            <button id="ss-time-realtime" class="btn-secondary">Real-time</button>
            <button id="ss-time-1min" class="btn-secondary">1 min/sec</button>
            <button id="ss-time-1hr" class="btn-secondary">1 hr/sec</button>
            <button id="ss-time-1day" class="btn-secondary">1 day/sec</button>
          </div>
          <div class="time-display">
            <span id="ss-current-time">Loading...</span>
          </div>
        </div>
        
        <div class="control-panel">
          <h3>Satellites</h3>
          <select id="ss-satellite-group" class="input">
            <option value="">None</option>
            <option value="stations">Space Stations (~10)</option>
            <option value="visual">Visual (~200)</option>
            <option value="active">Active (~6000)</option>
            <option value="starlink">Starlink (~5000)</option>
          </select>
          <div class="satellite-info">
            <span id="ss-satellite-count">0 satellites</span>
          </div>
        </div>
        
        <div class="control-panel">
          <h3>Scale</h3>
          <div class="scale-control">
            <label>Sun: <span id="ss-sun-scale-val">1×</span></label>
            <input type="range" id="ss-sun-scale" min="1" max="100" value="1" step="1">
          </div>
          <div class="scale-control">
            <label>Planets: <span id="ss-planet-scale-val">1×</span></label>
            <input type="range" id="ss-planet-scale" min="1" max="500" value="1" step="1">
          </div>
          <div class="scale-control">
            <label>Moons: <span id="ss-moon-scale-val">1×</span></label>
            <input type="range" id="ss-moon-scale" min="1" max="100" value="1" step="1">
          </div>
          <div class="scale-control">
            <label>Satellites: <span id="ss-sat-scale-val">1×</span></label>
            <input type="range" id="ss-sat-scale" min="0.1" max="40" value="1" step="0.1">
          </div>
        </div>
        
        <div class="control-panel">
          <h3>Lighting</h3>
          <div class="scale-control">
            <label>Sun Intensity: <span id="ss-sun-intensity-val">5</span></label>
            <input type="range" id="ss-sun-intensity" min="1" max="40" value="5" step="1">
          </div>
          <div class="scale-control">
            <label>Exposure: <span id="ss-exposure-val">0.5</span></label>
            <input type="range" id="ss-exposure" min="0.1" max="1.0" value="0.5" step="0.05">
          </div>
          <div class="checkbox-control">
            <label>
              <input type="checkbox" id="ss-sun-decay">
              Physical Light Decay
            </label>
          </div>
        </div>
        
        <div class="control-panel">
          <h3>Focus</h3>
          <div class="focus-tree">
            <div class="tree-item">
              <button class="btn-planet" data-body="10">☉ Sun</button>
            </div>
            <div class="tree-item">
              <button class="btn-planet" data-body="199">☿ Mercury</button>
            </div>
            <div class="tree-item">
              <button class="btn-planet" data-body="299">♀ Venus</button>
            </div>
            <div class="tree-item">
              <button class="btn-planet" data-body="399">♁ Earth</button>
              <div class="tree-children">
                <button class="btn-moon" data-body="301" data-parent="399">Moon</button>
              </div>
            </div>
            <div class="tree-item">
              <button class="btn-planet" data-body="499">♂ Mars</button>
              <div class="tree-children">
                <button class="btn-moon" data-body="401" data-parent="499">Phobos</button>
                <button class="btn-moon" data-body="402" data-parent="499">Deimos</button>
              </div>
            </div>
            <div class="tree-item">
              <button class="btn-planet" data-body="599">♃ Jupiter</button>
              <div class="tree-children">
                <button class="btn-moon" data-body="501" data-parent="599">Io</button>
                <button class="btn-moon" data-body="502" data-parent="599">Europa</button>
                <button class="btn-moon" data-body="503" data-parent="599">Ganymede</button>
                <button class="btn-moon" data-body="504" data-parent="599">Callisto</button>
              </div>
            </div>
            <div class="tree-item">
              <button class="btn-planet" data-body="699">♄ Saturn</button>
              <div class="tree-children">
                <button class="btn-moon" data-body="601" data-parent="699">Mimas</button>
                <button class="btn-moon" data-body="602" data-parent="699">Enceladus</button>
                <button class="btn-moon" data-body="603" data-parent="699">Tethys</button>
                <button class="btn-moon" data-body="604" data-parent="699">Dione</button>
                <button class="btn-moon" data-body="605" data-parent="699">Rhea</button>
                <button class="btn-moon" data-body="606" data-parent="699">Titan</button>
                <button class="btn-moon" data-body="608" data-parent="699">Iapetus</button>
              </div>
            </div>
            <div class="tree-item">
              <button class="btn-planet" data-body="799">♅ Uranus</button>
              <div class="tree-children">
                <button class="btn-moon" data-body="705" data-parent="799">Miranda</button>
                <button class="btn-moon" data-body="701" data-parent="799">Ariel</button>
                <button class="btn-moon" data-body="702" data-parent="799">Umbriel</button>
                <button class="btn-moon" data-body="703" data-parent="799">Titania</button>
                <button class="btn-moon" data-body="704" data-parent="799">Oberon</button>
              </div>
            </div>
            <div class="tree-item">
              <button class="btn-planet" data-body="899">♆ Neptune</button>
              <div class="tree-children">
                <button class="btn-moon" data-body="801" data-parent="899">Triton</button>
              </div>
            </div>
            <div class="tree-item">
              <button class="btn-planet" data-body="999">♇ Pluto</button>
              <div class="tree-children">
                <button class="btn-moon" data-body="901" data-parent="999">Charon</button>
              </div>
            </div>
          </div>
        </div>
        
        <div class="control-panel">
          <h3>Debug</h3>
          <button id="ss-open-sun-menu" class="btn-secondary">☀️ Open Sun Menu</button>
        </div>
    `;
    
    // Find the controls container and populate it
    const controlsContainer = document.getElementById('solarSimControls');
    if (controlsContainer) {
      controlsContainer.innerHTML = controlsHTML;
    } else {
      console.error('Solar Sim controls container not found');
    }
  }
  
  /**
   * Attach event listeners
   */
  attachEventListeners() {
    // Time controls
    document.getElementById('ss-time-pause')?.addEventListener('click', 
      () => this.trigger('timeWarpChange', 0));
    document.getElementById('ss-time-realtime')?.addEventListener('click', 
      () => this.trigger('timeWarpChange', 1));
    document.getElementById('ss-time-1min')?.addEventListener('click', 
      () => this.trigger('timeWarpChange', 60));
    document.getElementById('ss-time-1hr')?.addEventListener('click', 
      () => this.trigger('timeWarpChange', 3600));
    document.getElementById('ss-time-1day')?.addEventListener('click', 
      () => this.trigger('timeWarpChange', 86400));
    
    // Satellite group
    document.getElementById('ss-satellite-group')?.addEventListener('change', (e) => 
      this.trigger('satelliteGroupChange', e.target.value));
    
    // Scale controls
    document.getElementById('ss-sun-scale')?.addEventListener('input', (e) => {
      const value = parseFloat(e.target.value);
      document.getElementById('ss-sun-scale-val').textContent = `${value}×`;
      this.trigger('sunScaleChange', value);
    });
    
    document.getElementById('ss-planet-scale')?.addEventListener('input', (e) => {
      const value = parseFloat(e.target.value);
      document.getElementById('ss-planet-scale-val').textContent = `${value}×`;
      this.trigger('planetScaleChange', value);
    });
    
    document.getElementById('ss-moon-scale')?.addEventListener('input', (e) => {
      const value = parseFloat(e.target.value);
      document.getElementById('ss-moon-scale-val').textContent = `${value}×`;
      this.trigger('moonScaleChange', value);
    });
    
    document.getElementById('ss-sat-scale')?.addEventListener('input', (e) => {
      const value = parseFloat(e.target.value);
      document.getElementById('ss-sat-scale-val').textContent = `${value.toFixed(1)}×`;
      this.trigger('satelliteScaleChange', value);
    });
    
    // Lighting controls
    document.getElementById('ss-sun-intensity')?.addEventListener('input', (e) => {
      const value = parseFloat(e.target.value);
      document.getElementById('ss-sun-intensity-val').textContent = value;
      this.trigger('sunIntensityChange', value);
    });
    
    document.getElementById('ss-exposure')?.addEventListener('input', (e) => {
      const value = parseFloat(e.target.value);
      document.getElementById('ss-exposure-val').textContent = value.toFixed(1);
      this.trigger('exposureChange', value);
    });
    
    document.getElementById('ss-sun-decay')?.addEventListener('change', (e) => 
      this.trigger('sunDecayChange', e.target.checked));
    
    // Sun menu button
    document.getElementById('ss-open-sun-menu')?.addEventListener('click', () => 
      this.trigger('openSunMenu'));
    
    // Planet focus buttons
    document.querySelectorAll('.btn-planet').forEach(btn => {
      btn.addEventListener('click', () => {
        const bodyId = parseInt(btn.dataset.body);
        this.trigger('focusPlanet', bodyId);
      });
    });
    
    // Moon focus buttons
    document.querySelectorAll('.btn-moon').forEach(btn => {
      btn.addEventListener('click', () => {
        const moonId = parseInt(btn.dataset.body);
        const parentId = parseInt(btn.dataset.parent);
        this.trigger('focusMoon', { moonId, parentId });
      });
    });
  }
  
  /**
   * Register callback
   */
  on(event, callback) {
    this.callbacks[event] = callback;
  }
  
  /**
   * Trigger callback
   */
  trigger(event, data) {
    if (this.callbacks[event]) {
      this.callbacks[event](data);
    }
  }
  
  /**
   * Update time display
   */
  updateTimeDisplay(dateString) {
    const elem = document.getElementById('ss-current-time');
    if (elem) {
      elem.textContent = dateString;
    }
  }
  
  /**
   * Update satellite count display
   */
  updateSatelliteCount(count) {
    const elem = document.getElementById('ss-satellite-count');
    if (elem) {
      elem.textContent = `${count} satellites`;
    }
  }
}
