/**
 * Altitude Timeline Tool
 * Shows the altitude of celestial objects over time for a given location
 */

class AltitudeTimeline {
  constructor(containerId, options = {}) {
    this.containerId = containerId;
    this.container = document.getElementById(containerId);
    this.options = {
      width: options.width || 800,
      height: options.height || 400,
      margin: options.margin || { top: 20, right: 30, bottom: 80, left: 50 },
      showTwilight: options.showTwilight !== false,
      ...options
    };
    
    this.data = [];
    this.currentDate = new Date();
    this.location = null;
    this.target = null;
    this.chart = null;
    this.timeline = null;
    
    this.init();
  }

  init() {
    if (!this.container) {
      console.error('Container not found:', this.containerId);
      return;
    }
    
    this.createUI();
    this.setupEventListeners();
    this.loadCurrentLocation();
  }

  createUI() {
    this.container.innerHTML = `
      <div class="altitude-timeline-container">
        <div class="altitude-controls">
          <div class="target-input-group">
            <label for="targetSearch">Target Object:</label>
            <input type="text" id="targetSearch" placeholder="e.g., M31, NGC 7000, Orion Nebula, Ghost Nebula, LDN 1100" />
            <button id="searchTarget" class="btn btn-primary">Search</button>
          </div>
          <div class="location-display">
            <span id="locationInfo">No location set</span>
            <button id="editLocation" class="btn btn-secondary">Edit Location</button>
          </div>
        </div>
        
        <div class="altitude-chart-container">
          <canvas id="altitudeChart" width="${this.options.width}" height="${this.options.height}"></canvas>
        </div>
        
        <div class="timeline-slider-container">
          <div class="timeline-header">
            <span class="timeline-label">Date:</span>
            <span id="currentDateDisplay">${this.formatDate(this.currentDate)}</span>
          </div>
          <div class="timeline-slider">
            <input type="range" id="dateSlider" min="0" max="365" value="0" />
            <div class="timeline-labels">
              <span>Today (${this.formatDate(new Date())})</span>
              <span>+1 Year</span>
            </div>
          </div>
        </div>
        
        <div class="altitude-info">
          <div class="current-altitude">
            <h4>Current Position</h4>
            <div class="altitude-data">
              <span id="currentAltitude">--°</span>
              <span id="currentAzimuth">--°</span>
            </div>
          </div>
          <div class="visibility-times">
            <h4>Visibility for Selected Day</h4>
            <div class="visibility-data">
              <span id="riseTime">Rise: --:--</span>
              <span id="transitTime">Transit: --:--</span>
              <span id="setTime">Set: --:--</span>
            </div>
          </div>
        </div>
      </div>
    `;
    
    this.setupChart();
  }

  setupChart() {
    const canvas = document.getElementById('altitudeChart');
    const ctx = canvas.getContext('2d');
    
    // Plugin to draw nautical/astronomical dusk/dawn overlays
    const twilightOverlayPlugin = {
      id: 'twilightOverlay',
      beforeDatasetsDraw: (chart, args, pluginOptions) => {
        const opts = chart.options.plugins && chart.options.plugins.twilightOverlay;
        if (!opts || !opts.enabled || !opts.twilight || !opts.currentDate) return;
        const { astro, nautical } = opts.twilight;
        const { left, right, top, bottom } = chart.chartArea;
        const width = right - left;
        const height = bottom - top;
        const ctx = chart.ctx;

        // map minutes since midnight to pixel
        // Our timeline starts at local 12:00 and spans 24h, so midnight is centered.
        // Convert absolute minutes since midnight to our noon-based axis: offset = (mins - 720) mod 1440
        const toX = (mins) => {
          let offset = (mins - 720) % 1440;
          if (offset < 0) offset += 1440;
          return left + offset / 1440 * width;
        };

        const drawBand = (startMins, endMins, color) => {
          // handle wrap across midnight by drawing two segments if needed
          if (startMins == null || endMins == null) return;
          const clip = (a, b) => ({ a: Math.max(0, Math.min(1440, a)), b: Math.max(0, Math.min(1440, b)) });
          if (startMins <= endMins) {
            const { a, b } = clip(startMins, endMins);
            if (b > a) {
              ctx.fillStyle = color;
              ctx.fillRect(toX(a), top, toX(b) - toX(a), height);
            }
          } else {
            // wraps over midnight
            const seg1 = clip(startMins, 1440);
            if (seg1.b > seg1.a) {
              ctx.fillStyle = color;
              ctx.fillRect(toX(seg1.a), top, toX(seg1.b) - toX(seg1.a), height);
            }
            const seg2 = clip(0, endMins);
            if (seg2.b > seg2.a) {
              ctx.fillStyle = color;
              ctx.fillRect(toX(seg2.a), top, toX(seg2.b) - toX(seg2.a), height);
            }
          }
        };

        const minutesSinceMidnight = (t) => {
          const midnight = new Date(opts.currentDate);
          midnight.setHours(0, 0, 0, 0);
          return Math.round((t - midnight) / 60000);
        };

        // Astronomical night (-18°): between astro dusk and astro dawn
        if (astro && astro.dusk && astro.dawn) {
          const duskM = minutesSinceMidnight(astro.dusk);
          const dawnM = minutesSinceMidnight(astro.dawn);
          // Astronomical night should be darkest
          drawBand(duskM, dawnM, 'rgba(0,0,0,0.35)');
        }

        // Nautical twilight (-12°): evening [nautical dusk -> astro dusk], morning [astro dawn -> nautical dawn]
        if (nautical && nautical.dusk && nautical.dawn && astro && astro.dusk && astro.dawn) {
          const nDuskM = minutesSinceMidnight(nautical.dusk);
          const aDuskM = minutesSinceMidnight(astro.dusk);
          const aDawnM = minutesSinceMidnight(astro.dawn);
          const nDawnM = minutesSinceMidnight(nautical.dawn);
          // evening nautical twilight
          drawBand(nDuskM, aDuskM, 'rgba(0,0,0,0.20)');
          // morning nautical twilight
          drawBand(aDawnM, nDawnM, 'rgba(0,0,0,0.20)');
        }
      }
    };

    // Create Chart.js instance
    this.chart = new Chart(ctx, {
      type: 'line',
      data: {
        labels: [],
        datasets: [
          {
            label: 'Altitude',
            data: [],
            borderColor: '#667eea',
            backgroundColor: 'rgba(102, 126, 234, 0.1)',
            borderWidth: 2,
            fill: true,
            tension: 0.4
          },
          {
            label: 'Horizon',
            data: [],
            borderColor: '#f56565',
            borderWidth: 1,
            borderDash: [5, 5],
            fill: false,
            pointRadius: 0
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          twilightOverlay: { enabled: true, twilight: null, currentDate: null },
          legend: {
            display: true,
            position: 'top'
          },
          tooltip: {
            mode: 'index',
            intersect: false,
            callbacks: {
              title: (context) => {
                const timeStr = context[0].label;
                return `Time: ${timeStr}`;
              },
              label: (context) => {
                if (context.dataset.label === 'Altitude') {
                  return `Altitude: ${context.parsed.y.toFixed(1)}°`;
                }
                return null;
              }
            }
          }
        },
        scales: {
          x: {
            title: {
              display: true,
              text: 'Time (24h)'
            },
            grid: {
              color: 'rgba(255, 255, 255, 0.1)'
            }
          },
          y: {
            title: {
              display: true,
              text: 'Altitude (degrees)'
            },
            min: -20,
            max: 90,
            grid: {
              color: 'rgba(255, 255, 255, 0.1)'
            }
          }
        },
        interaction: {
          intersect: false,
          mode: 'index'
        }
      },
      plugins: [twilightOverlayPlugin]
    });
  }

  setupEventListeners() {
    const searchBtn = document.getElementById('searchTarget');
    const targetInput = document.getElementById('targetSearch');
    const dateSlider = document.getElementById('dateSlider');
    const editLocationBtn = document.getElementById('editLocation');

    if (searchBtn && targetInput) {
      searchBtn.addEventListener('click', () => this.searchTarget());
      targetInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') this.searchTarget();
      });
    }

    if (dateSlider) {
      dateSlider.addEventListener('input', (e) => {
        const daysFromNow = parseInt(e.target.value);
        this.setDateFromDaysOffset(daysFromNow);
        this.updateChart();
      });
    }

    if (editLocationBtn) {
      editLocationBtn.addEventListener('click', () => this.showLocationEditor());
    }
  }

  async searchTarget() {
    const targetInput = document.getElementById('targetSearch');
    const targetName = targetInput.value.trim();
    
    if (!targetName) {
      this.showError('Please enter a target name');
      return;
    }

    try {
      // Show loading state
      this.showLoading('Searching for target...');
      
      // Try to resolve target coordinates
      const coords = await this.resolveTarget(targetName);
      if (coords) {
        this.target = {
          name: targetName,
          ra: coords.ra,
          dec: coords.dec
        };
        
        // Debug the calculations for verification (only if location is available)
        if (this.location) {
          this.debugCalculations(coords, this.currentDate);
        }
        
        await this.updateChart();
        this.hideLoading();
        
        // Success - no modal, just update the UI silently
      } else {
        this.hideLoading();
        this.showError(`Could not find coordinates for "${targetName}". Try searching for common objects like M31, NGC 7000, Orion Nebula, or Ghost Nebula.`);
      }
    } catch (error) {
      this.hideLoading();
      this.showError(`Error searching for target: ${error.message}`);
    }
  }

  async resolveTarget(targetName) {
    // Comprehensive database of astronomical objects
    const commonTargets = {
      // Messier Objects (high precision coordinates)
      'M31': { ra: 10.6847083, dec: 41.2687500 }, // Andromeda Galaxy
      'M42': { ra: 83.8220833, dec: -5.3911111 }, // Orion Nebula
      'M45': { ra: 56.75, dec: 24.117 }, // Pleiades
      'M57': { ra: 283.3963, dec: 33.0275 }, // Ring Nebula
      'M13': { ra: 250.4233, dec: 36.4592 }, // Hercules Cluster
      'M1': { ra: 83.6333, dec: 22.0145 }, // Crab Nebula
      'M8': { ra: 270.9, dec: -24.38 }, // Lagoon Nebula
      'M16': { ra: 274.7, dec: -13.8 }, // Eagle Nebula
      'M17': { ra: 275.2, dec: -16.2 }, // Omega Nebula
      'M20': { ra: 270.9, dec: -23.03 }, // Trifid Nebula
      'M27': { ra: 299.9, dec: 22.72 }, // Dumbbell Nebula
      'M33': { ra: 23.46, dec: 30.66 }, // Triangulum Galaxy
      'M51': { ra: 202.47, dec: 47.19 }, // Whirlpool Galaxy
      'M63': { ra: 198.95, dec: 42.03 }, // Sunflower Galaxy
      'M64': { ra: 194.18, dec: 21.68 }, // Black Eye Galaxy
      'M65': { ra: 169.73, dec: 13.09 }, // Leo Triplet
      'M66': { ra: 170.06, dec: 12.99 }, // Leo Triplet
      'M81': { ra: 148.89, dec: 69.07 }, // Bode's Galaxy
      'M82': { ra: 148.97, dec: 69.68 }, // Cigar Galaxy
      'M101': { ra: 210.8, dec: 54.35 }, // Pinwheel Galaxy
      'M104': { ra: 189.0, dec: -11.62 }, // Sombrero Galaxy
      
      // NGC Objects - Popular Deep Sky
      'NGC 7000': { ra: 312.25, dec: 44.22 }, // North America Nebula
      'NGC7000': { ra: 312.25, dec: 44.22 },
      'NGC 6960': { ra: 312.72, dec: 30.72 }, // Western Veil Nebula
      'NGC6960': { ra: 312.72, dec: 30.72 },
      'NGC 6992': { ra: 314.67, dec: 31.73 }, // Eastern Veil Nebula
      'NGC6992': { ra: 314.67, dec: 31.73 },
      'NGC 281': { ra: 11.8, dec: 56.65 }, // Pacman Nebula
      'NGC281': { ra: 11.8, dec: 56.65 },
      'NGC 2237': { ra: 92.2, dec: 4.9 }, // Rosette Nebula
      'NGC2237': { ra: 92.2, dec: 4.9 },
      'NGC 7635': { ra: 350.15, dec: 61.21 }, // Bubble Nebula
      'NGC7635': { ra: 350.15, dec: 61.21 },
      'NGC 6888': { ra: 306.42, dec: 38.35 }, // Crescent Nebula
      'NGC6888': { ra: 306.42, dec: 38.35 },
      'NGC 1976': { ra: 83.8221, dec: -5.3911 }, // Orion Nebula (NGC)
      'NGC1976': { ra: 83.8221, dec: -5.3911 },
      'NGC 224': { ra: 10.6847, dec: 41.2687 }, // Andromeda Galaxy (NGC)
      'NGC224': { ra: 10.6847, dec: 41.2687 },
      'NGC 2024': { ra: 85.45, dec: -1.85 }, // Flame Nebula
      'NGC2024': { ra: 85.45, dec: -1.85 },
      'NGC 2427': { ra: 116.18, dec: -47.46 }, // Southern Ring Nebula area
      'NGC2427': { ra: 116.18, dec: -47.46 },
      'NGC 2264': { ra: 100.24, dec: 9.88 }, // Christmas Tree Cluster
      'NGC2264': { ra: 100.24, dec: 9.88 },
      'NGC 3372': { ra: 161.3, dec: -59.87 }, // Carina Nebula
      'NGC3372': { ra: 161.3, dec: -59.87 },
      'NGC 1499': { ra: 62.25, dec: 36.58 }, // California Nebula
      'NGC1499': { ra: 62.25, dec: 36.58 },
      'NGC 5194': { ra: 202.47, dec: 47.19 }, // Whirlpool Galaxy
      'NGC5194': { ra: 202.47, dec: 47.19 },
      'NGC 4565': { ra: 189.21, dec: 25.99 }, // Needle Galaxy
      'NGC4565': { ra: 189.21, dec: 25.99 },
      'NGC 891': { ra: 35.64, dec: 42.35 }, // Silver Sliver Galaxy
      'NGC891': { ra: 35.64, dec: 42.35 },
      
      // IC Objects
      'IC 1396': { ra: 326.18, dec: 57.50 }, // Elephant's Trunk Nebula
      'IC1396': { ra: 326.18, dec: 57.50 },
      'IC 443': { ra: 94.5, dec: 22.6 }, // Jellyfish Nebula
      'IC443': { ra: 94.5, dec: 22.6 },
      'IC 405': { ra: 79.33, dec: 34.27 }, // Flaming Star Nebula
      'IC405': { ra: 79.33, dec: 34.27 },
      'IC 410': { ra: 80.37, dec: 33.5 }, // Tadpoles Nebula
      'IC410': { ra: 80.37, dec: 33.5 },
      'IC 1805': { ra: 38.5, dec: 61.45 }, // Heart Nebula
      'IC1805': { ra: 38.5, dec: 61.45 },
      'IC 1848': { ra: 42.5, dec: 60.42 }, // Soul Nebula
      'IC1848': { ra: 42.5, dec: 60.42 },
      'IC 63': { ra: 12.88, dec: 60.90 }, // Ghost Nebula
      'IC63': { ra: 12.88, dec: 60.90 },
      
      // Lynds Dark Nebulae
      'LDN 1100': { ra: 315.0, dec: 65.0 }, // Dark nebula in Cepheus
      'LDN1100': { ra: 315.0, dec: 65.0 },
      'LDN 673': { ra: 287.5, dec: 2.2 }, // Dark Horse Nebula
      'LDN673': { ra: 287.5, dec: 2.2 },
      'LDN 1622': { ra: 83.8, dec: -2.5 }, // Boogeyman Nebula
      'LDN1622': { ra: 83.8, dec: -2.5 },
      
      // Sharpless Objects
      'SH2-155': { ra: 343.67, dec: 62.63 }, // Cave Nebula
      'SH2155': { ra: 343.67, dec: 62.63 },
      'SHARPLESS 155': { ra: 343.67, dec: 62.63 },
      'SH2-136': { ra: 322.42, dec: 56.35 }, // Ghost Nebula region
      'SH2136': { ra: 322.42, dec: 56.35 },
      'SH2-115': { ra: 350.0, dec: 63.0 }, // Cepheus region
      'SH2115': { ra: 350.0, dec: 63.0 },
      
      // Common Names
      'ANDROMEDA': { ra: 10.6847, dec: 41.2687 },
      'ANDROMEDA GALAXY': { ra: 10.6847, dec: 41.2687 },
      'ORION NEBULA': { ra: 83.8221, dec: -5.3911 },
      'PLEIADES': { ra: 56.75, dec: 24.117 },
      'SEVEN SISTERS': { ra: 56.75, dec: 24.117 },
      'RING NEBULA': { ra: 283.396, dec: 33.029 },
      'HERCULES CLUSTER': { ra: 250.423, dec: 36.460 },
      'NORTH AMERICA NEBULA': { ra: 312.25, dec: 44.22 },
      'NORTH AMERICA': { ra: 312.25, dec: 44.22 },
      'VEIL NEBULA': { ra: 312.72, dec: 30.72 },
      'WESTERN VEIL': { ra: 312.72, dec: 30.72 },
      'EASTERN VEIL': { ra: 314.67, dec: 31.73 },
      'WITCH HEAD NEBULA': { ra: 85.24, dec: -7.2 },
      'WITCH HEAD': { ra: 85.24, dec: -7.2 },
      'HORSEHEAD NEBULA': { ra: 85.3, dec: -2.47 },
      'HORSEHEAD': { ra: 85.3, dec: -2.47 },
      'FLAME NEBULA': { ra: 85.45, dec: -1.85 },
      'ROSETTE NEBULA': { ra: 92.2, dec: 4.9 },
      'ROSETTE': { ra: 92.2, dec: 4.9 },
      'EAGLE NEBULA': { ra: 274.7, dec: -13.8 },
      'PILLARS OF CREATION': { ra: 274.7, dec: -13.8 },
      'WHIRLPOOL GALAXY': { ra: 202.47, dec: 47.19 },
      'WHIRLPOOL': { ra: 202.47, dec: 47.19 },
      'PACMAN NEBULA': { ra: 11.8, dec: 56.65 },
      'PACMAN': { ra: 11.8, dec: 56.65 },
      'BUBBLE NEBULA': { ra: 350.15, dec: 61.21 },
      'BUBBLE': { ra: 350.15, dec: 61.21 },
      'CRESCENT NEBULA': { ra: 306.42, dec: 38.35 },
      'CRESCENT': { ra: 306.42, dec: 38.35 },
      'CALIFORNIA NEBULA': { ra: 62.25, dec: 36.58 },
      'CALIFORNIA': { ra: 62.25, dec: 36.58 },
      'HEART NEBULA': { ra: 38.5, dec: 61.45 },
      'HEART': { ra: 38.5, dec: 61.45 },
      'SOUL NEBULA': { ra: 42.5, dec: 60.42 },
      'SOUL': { ra: 42.5, dec: 60.42 },
      'GHOST NEBULA': { ra: 12.88, dec: 60.90 },
      'GHOST': { ra: 12.88, dec: 60.90 },
      'ELEPHANT TRUNK': { ra: 326.18, dec: 57.50 },
      'ELEPHANT TRUNK NEBULA': { ra: 326.18, dec: 57.50 },
      'JELLYFISH NEBULA': { ra: 94.5, dec: 22.6 },
      'JELLYFISH': { ra: 94.5, dec: 22.6 },
      'CRAB NEBULA': { ra: 83.6333, dec: 22.0145 },
      'CRAB': { ra: 83.6333, dec: 22.0145 },
      'DUMBBELL NEBULA': { ra: 299.9, dec: 22.72 },
      'DUMBBELL': { ra: 299.9, dec: 22.72 },
      'TRIANGULUM GALAXY': { ra: 23.46, dec: 30.66 },
      'TRIANGULUM': { ra: 23.46, dec: 30.66 },
      'PINWHEEL GALAXY': { ra: 210.8, dec: 54.35 },
      'PINWHEEL': { ra: 210.8, dec: 54.35 },
      'SOMBRERO GALAXY': { ra: 189.0, dec: -11.62 },
      'SOMBRERO': { ra: 189.0, dec: -11.62 },
      'BLACK EYE GALAXY': { ra: 194.18, dec: 21.68 },
      'BLACK EYE': { ra: 194.18, dec: 21.68 },
      'BODES GALAXY': { ra: 148.89, dec: 69.07 },
      'CIGAR GALAXY': { ra: 148.97, dec: 69.68 },
      'SUNFLOWER GALAXY': { ra: 198.95, dec: 42.03 },
      'NEEDLE GALAXY': { ra: 189.21, dec: 25.99 },
      'CAVE NEBULA': { ra: 343.67, dec: 62.63 },
      'CAVE': { ra: 343.67, dec: 62.63 }
    };

    // Normalize input: remove spaces, convert to uppercase, remove common words
    const normalizedInput = targetName.toUpperCase()
      .replace(/\s+/g, ' ')
      .replace(/\bNEBULA\b/g, '')
      .replace(/\bGALAXY\b/g, '')
      .replace(/\bCLUSTER\b/g, '')
      .trim()
      .replace(/\s+/g, '');
    
    // Check exact matches first (normalized)
    for (const [key, coords] of Object.entries(commonTargets)) {
      const normalizedKey = key.toUpperCase().replace(/\s+/g, '');
      if (normalizedKey === normalizedInput) {
        return coords;
      }
    }
    
    // Check for partial matches
    for (const [key, coords] of Object.entries(commonTargets)) {
      const normalizedKey = key.toUpperCase().replace(/\s+/g, '');
      if (normalizedKey.includes(normalizedInput) || normalizedInput.includes(normalizedKey)) {
        return coords;
      }
    }
    
    // Check for matches without common designators
    const inputWithoutDesignators = normalizedInput.replace(/^(NGC|IC|M|LDN|SH2|SHARPLESS)/g, '');
    if (inputWithoutDesignators !== normalizedInput) {
      for (const [key, coords] of Object.entries(commonTargets)) {
        const keyWithoutDesignators = key.toUpperCase().replace(/\s+/g, '').replace(/^(NGC|IC|M|LDN|SH2|SHARPLESS)/g, '');
        if (keyWithoutDesignators === inputWithoutDesignators && keyWithoutDesignators.length > 0) {
          return coords;
        }
      }
    }
    
    return null;
  }

  setLocation(location) {
    this.location = location;
    const locationDisplay = document.getElementById('locationInfo');
    if (locationDisplay) {
      if (location && location.latitude != null && location.longitude != null) {
        locationDisplay.textContent = `${location.name || 'Custom Location'} (${location.latitude.toFixed(3)}, ${location.longitude.toFixed(3)})`;
      } else {
        locationDisplay.textContent = 'No location set';
      }
    }
    
    if (this.target) {
      this.updateChart();
    }
  }

  async updateChart() {
    if (!this.target || !this.location) {
      return;
    }

    try {
      const altitudeData = this.calculateAltitudeData();
      this.updateChartData(altitudeData);
      this.updateVisibilityInfo(altitudeData);
    } catch (error) {
      console.error('Error updating chart:', error);
    }
  }

  calculateAltitudeData() {
    if (!this.target || !this.location) {
      return { times: [], altitudes: [], horizonData: [] };
    }

    const data = [];
    const times = [];
    const altitudes = [];
    const horizonData = [];
    
    // Generate data points for 24 hours starting at local noon so midnight is centered
    const start = new Date(this.currentDate);
    start.setHours(12, 0, 0, 0); // local noon
    for (let step = 0; step < 48; step++) { // 48 steps of 30 minutes
      const time = new Date(start.getTime() + step * 30 * 60000);
      const timeStr = this.formatTime(time);
      const altitude = this.calculateAltitude(this.target.ra, this.target.dec, this.location, time);
      times.push(timeStr);
      altitudes.push(altitude);
      horizonData.push(0);
    }
    
    return { times, altitudes, horizonData };
  }

  formatTime(time) {
    return time.toLocaleTimeString('en-US', { 
      hour: '2-digit', 
      minute: '2-digit', 
      hour12: false 
    });
  }

  // --- Twilight helpers ---
  // Compute Sun RA/Dec using a compact approximation sufficient for twilight bands
  getSunEquatorial(date) {
    // Based on NOAA Solar Calculator (approximate)
    const jd = this.getJulianDate(date);
    const n = jd - 2451545.0;
    const L = (280.460 + 0.9856474 * n) % 360; // mean longitude
    const g = (357.528 + 0.9856003 * n) % 360; // mean anomaly
    const gRad = g * Math.PI / 180;
    // Ecliptic longitude with equation of center
    const lambda = (L + 1.915 * Math.sin(gRad) + 0.020 * Math.sin(2 * gRad)) % 360;
    const lambdaRad = lambda * Math.PI / 180;
    // Obliquity of the ecliptic
    const eps = (23.439 - 0.0000004 * n) * Math.PI / 180;
    // Convert to RA/Dec
    const sinDec = Math.sin(eps) * Math.sin(lambdaRad);
    const dec = Math.asin(sinDec);
    const y = Math.cos(eps) * Math.sin(lambdaRad);
    const x = Math.cos(lambdaRad);
    let ra = Math.atan2(y, x);
    if (ra < 0) ra += 2 * Math.PI;
    return { ra: ra * 180 / Math.PI, dec: dec * 180 / Math.PI };
  }

  // For a given date and latitude/longitude, find times when Sun altitude crosses a threshold (e.g., -12°, -18°)
  // Returns dusk and dawn Date objects, or null if no crossing that day.
  getTwilightTimes(date, latitude, longitude, altThresholdDeg) {
    // Scan the day at 5-minute steps to find altitude crossings; then refine by bisection.
    const base = new Date(date);
    base.setHours(0, 0, 0, 0);
    const stepMin = 5;
    const steps = Math.ceil(24 * 60 / stepMin);
    const alt = (t) => {
      const sun = this.getSunEquatorial(t);
      return this.calculateAltitude(sun.ra, sun.dec, { latitude, longitude }, t);
    };

    const crossings = [];
    let prevAlt = alt(base) - altThresholdDeg;
    for (let i = 1; i <= steps; i++) {
      const t = new Date(base.getTime() + i * stepMin * 60000);
      const a = alt(t) - altThresholdDeg;
      if (prevAlt <= 0 && a > 0) crossings.push({ type: 'dawn', t0: new Date(t.getTime() - stepMin * 60000), t1: t });
      if (prevAlt >= 0 && a < 0) crossings.push({ type: 'dusk', t0: new Date(t.getTime() - stepMin * 60000), t1: t });
      prevAlt = a;
    }

    // Refine each crossing by bisection to ~1-minute accuracy
    const refine = (t0, t1) => {
      for (let k = 0; k < 10; k++) { // ~1/2^10 of step window
        const tm = new Date((t0.getTime() + t1.getTime()) / 2);
        const am = alt(tm) - altThresholdDeg;
        const a0 = alt(t0) - altThresholdDeg;
        if ((a0 <= 0 && am > 0) || (a0 >= 0 && am < 0)) t1 = tm; else t0 = tm;
      }
      return new Date((t0.getTime() + t1.getTime()) / 2);
    };

    let dusk = null, dawn = null;
    for (const c of crossings) {
      const t = refine(c.t0, c.t1);
      if (c.type === 'dusk') dusk = t; else dawn = t;
    }
    return { dusk, dawn };
  }


  calculateAltitude(ra, dec, location, time) {
    // Convert to radians
    const lat = location.latitude * Math.PI / 180;
    const ra_rad = ra * Math.PI / 180;
    const dec_rad = dec * Math.PI / 180;
    
    // Calculate Local Sidereal Time (in degrees, then convert to radians)
    const lst_deg = this.calculateLST(location.longitude, time);
    const lst_rad = lst_deg * Math.PI / 180;
    
    // Calculate Hour Angle
    const ha = lst_rad - ra_rad;
    
    // Calculate Altitude using spherical astronomy
    const sin_alt = Math.sin(dec_rad) * Math.sin(lat) + 
                    Math.cos(dec_rad) * Math.cos(lat) * Math.cos(ha);
    
    // Clamp sin_alt to valid range [-1, 1] to avoid numerical errors
    const clampedSinAlt = Math.max(-1, Math.min(1, sin_alt));
    
    const altitude = Math.asin(clampedSinAlt) * 180 / Math.PI;
    
    return altitude;
  }

  calculateLST(longitude, time) {
    // Robust Local Sidereal Time (LST) in degrees, from full Julian Date with fractional day.
    // Reference: IAU SOFA/NOAA simplified formula.
    if (!(time instanceof Date)) {
      console.error('calculateLST: time parameter must be a Date object', time);
      return 0;
    }

    const jd = this.getJulianDate(time); // includes fractional day already
    const T = (jd - 2451545.0) / 36525.0; // Julian centuries since J2000.0

    // Greenwich Mean Sidereal Time (GMST) in seconds (IAU 2006 reduced expression)
    // GMST (seconds) = 67310.54841 + (876600*3600 + 8640184.812866)*T + 0.093104*T^2 - 6.2e-6*T^3
    let GMST_sec = 67310.54841 + (876600.0 * 3600.0 + 8640184.812866) * T + 0.093104 * T * T - 6.2e-6 * T * T * T;

    // Convert to degrees
    let GMST_deg = (GMST_sec / 240.0) % 360.0; // 1 sidereal second = 1/240 degree
    if (GMST_deg < 0) GMST_deg += 360.0;

    // Local Sidereal Time
    let LST = (GMST_deg + longitude) % 360.0;
    if (LST < 0) LST += 360.0;
    return LST;
  }

  // Analytic maximum altitude (at upper culmination) in degrees for a fixed RA/Dec target
  // h_max = 90 - |latitude - declination|
  calculateTransitAltitude(decDeg, latitudeDeg) {
    return 90 - Math.abs(latitudeDeg - decDeg);
  }

  getJulianDate(date) {
    // Convert JavaScript Date to Julian Date
    
    // Ensure date is a Date object
    if (!(date instanceof Date)) {
      console.error('getJulianDate: date parameter must be a Date object', date);
      return 2451545.0; // Return J2000.0 as fallback
    }
    
    const year = date.getUTCFullYear();
    const month = date.getUTCMonth() + 1; // JavaScript months are 0-based
    const day = date.getUTCDate();
    const hour = date.getUTCHours();
    const minute = date.getUTCMinutes();
    const second = date.getUTCSeconds();
    
    // Convert time to decimal day
    const decimalDay = day + hour / 24.0 + minute / 1440.0 + second / 86400.0;
    
    // Adjust for January and February
    let adjustedYear = year;
    let adjustedMonth = month;
    if (month <= 2) {
      adjustedYear = year - 1;
      adjustedMonth = month + 12;
    }
    
    // Calculate Julian Date using the standard formula
    const A = Math.floor(adjustedYear / 100);
    const B = 2 - A + Math.floor(A / 4);
    
    const JD = Math.floor(365.25 * (adjustedYear + 4716)) + 
               Math.floor(30.6001 * (adjustedMonth + 1)) + 
               decimalDay + B - 1524.5;
    
    return JD;
  }

  debugCalculations(targetCoordinates, date) {
    const debugDate = date || new Date();
    console.log(`\n=== Debugging calculations for ${this.currentTarget} on ${debugDate.toDateString()} ===`);
    
    // Get location - use this.location if available, otherwise try DOM elements
    let latitude, longitude;
    if (this.location) {
      latitude = this.location.latitude;
      longitude = this.location.longitude;
    } else {
      const latInput = document.getElementById('latitude');
      const lonInput = document.getElementById('longitude');
      if (latInput && lonInput && latInput.value && lonInput.value) {
        latitude = parseFloat(latInput.value);
        longitude = parseFloat(lonInput.value);
      } else {
        console.log('No location data available for debugging');
        return;
      }
    }
    
    console.log(`Observer location: ${latitude}°N, ${longitude}°W`);
    
    // Calculate Julian Date
    const jd = this.getJulianDate(debugDate);
    console.log(`Julian Date: ${jd} (days since J2000.0: ${jd - 2451545.0})`);
    
    // Calculate LST for noon
    const noonDate = new Date(debugDate);
    noonDate.setHours(12, 0, 0, 0);
    const lstNoon = this.calculateLST(longitude, noonDate);
    console.log(`LST at noon: ${lstNoon.toFixed(2)}°`);
    
    // Target coordinates
    console.log(`Target RA: ${targetCoordinates.ra}°, Dec: ${targetCoordinates.dec}°`);
    
    // Calculate altitude at different times
    const times = ['midnight', '6am', 'noon', '6pm'];
    const hours = [0, 6, 12, 18];
    
    const location = { latitude, longitude };
    
    times.forEach((time, i) => {
      const testDate = new Date(debugDate);
      testDate.setHours(hours[i], 0, 0, 0);
      const altitude = this.calculateAltitude(targetCoordinates.ra, targetCoordinates.dec, location, testDate);
      console.log(`${time}: altitude = ${altitude.toFixed(1)}°`);
    });
    
    console.log('=== End debug ===\n');
  }

  loadCurrentLocation() {
    // Try to load location from setup form
    const latInput = document.getElementById('latitude');
    const lonInput = document.getElementById('longitude');
    
    if (latInput && lonInput && latInput.value && lonInput.value) {
      const latitude = parseFloat(latInput.value);
      const longitude = parseFloat(lonInput.value);
      
      if (!isNaN(latitude) && !isNaN(longitude)) {
        this.setLocation({
          name: 'Current Location',
          latitude: latitude,
          longitude: longitude
        });
      }
    }
  }

  updateChartData(data) {
    if (!this.chart) return;
    
    this.chart.data.labels = data.times;
    this.chart.data.datasets[0].data = data.altitudes;
    this.chart.data.datasets[1].data = data.horizonData;
    
    // Update chart title
    if (this.target) {
      this.chart.options.plugins.title = {
        display: true,
        text: `Altitude of ${this.target.name} - ${this.formatDate(this.currentDate)}`
      };
    }
    // Compute twilight bands for current date/location and pass to plugin
    if (this.location) {
      const lat = this.location.latitude;
      const lon = this.location.longitude;
      const nautical = this.getTwilightTimes(this.currentDate, lat, lon, -12);
      const astro = this.getTwilightTimes(this.currentDate, lat, lon, -18);
      this.chart.options.plugins.twilightOverlay = {
        enabled: true,
        twilight: { nautical, astro },
        currentDate: new Date(this.currentDate)
      };
    }
    
    this.chart.update();
  }

  updateVisibilityInfo(data) {
    if (!data.altitudes.length) return;
    
  // Find rise, transit, and set times for the current day
    let riseTime = null;
    let setTime = null;
    let transitTime = null;
    let sampleMaxAltitude = -90;
    
    for (let i = 0; i < data.altitudes.length; i++) {
      const alt = data.altitudes[i];
      const time = data.times[i];
      
      // Track sampled maximum for transit time estimate
      if (alt > sampleMaxAltitude) {
        sampleMaxAltitude = alt;
        transitTime = time;
      }
      
      // Find rise time (crossing horizon going up)
      if (i > 0 && data.altitudes[i-1] < 0 && alt >= 0) {
        riseTime = time;
      }
      
      // Find set time (crossing horizon going down)
      if (i > 0 && data.altitudes[i-1] >= 0 && alt < 0) {
        setTime = time;
      }
    }
    
    // Update current position for the selected date
    const currentTime = new Date(this.currentDate);
    currentTime.setHours(new Date().getHours(), new Date().getMinutes(), 0, 0);
    
    const currentAltitude = this.calculateAltitude(this.target.ra, this.target.dec, this.location, currentTime);
    const currentAzimuth = this.calculateCurrentAzimuth(currentTime);
    
    document.getElementById('currentAltitude').textContent = `${currentAltitude.toFixed(1)}°`;
    document.getElementById('currentAzimuth').textContent = `${currentAzimuth.toFixed(1)}°`;
    
    // Compute analytic transit altitude (independent of date for fixed RA/Dec)
    const analyticTransitAlt = this.calculateTransitAltitude(this.target.dec, this.location.latitude);

    // Compute more precise transit time: when Hour Angle = 0
    try {
      const dateBase = new Date(this.currentDate);
      // Check every hour to find closest HA to 0, then refine
      let best = { diff: 1e9, t: null };
      for (let h = 0; h < 24; h++) {
        const t = new Date(dateBase);
        t.setHours(h, 0, 0, 0);
        const lst = this.calculateLST(this.location.longitude, t) / 15.0; // hours
        let ha = lst - (this.target.ra / 15.0);
        // wrap to [-12,12] hours
        ha = ((ha + 12) % 24 + 24) % 24 - 12;
        const diff = Math.abs(ha);
        if (diff < best.diff) best = { diff, t };
      }
      if (best.t) {
        // Refine around best hour using minutes
        let fine = { diff: 1e9, t: null };
        for (let m = -30; m <= 30; m++) {
          const t = new Date(best.t);
          t.setMinutes(30 + m, 0, 0); // center in the hour
          const lst = this.calculateLST(this.location.longitude, t) / 15.0;
          let ha = lst - (this.target.ra / 15.0);
          ha = ((ha + 12) % 24 + 24) % 24 - 12;
          const diff = Math.abs(ha);
          if (diff < fine.diff) fine = { diff, t };
        }
        if (fine.t) transitTime = this.formatTime(fine.t);
      }
    } catch (e) {
      // fall back silently on sampled value
    }

    // Update visibility times for the selected day
    document.getElementById('riseTime').textContent = `Rise: ${riseTime || 'N/A'}`;
    document.getElementById('transitTime').textContent = `Transit: ${transitTime || 'N/A'} (${analyticTransitAlt.toFixed(1)}°)`;
    document.getElementById('setTime').textContent = `Set: ${setTime || 'N/A'}`;

    // Note removed per request
  }

  calculateCurrentAzimuth(time) {
    if (!this.target || !this.location) return 0;
    
    // Convert to radians
    const lat = this.location.latitude * Math.PI / 180;
    const ra_rad = this.target.ra * Math.PI / 180;
    const dec_rad = this.target.dec * Math.PI / 180;
    
    // Calculate Local Sidereal Time
    const lst_deg = this.calculateLST(this.location.longitude, time);
    const lst_rad = lst_deg * Math.PI / 180;
    
    // Calculate Hour Angle
    const ha = lst_rad - ra_rad;
    
    // Calculate altitude for azimuth calculation
    const sin_alt = Math.sin(dec_rad) * Math.sin(lat) + 
                    Math.cos(dec_rad) * Math.cos(lat) * Math.cos(ha);
    const alt_rad = Math.asin(Math.max(-1, Math.min(1, sin_alt)));
    
    // Calculate azimuth using more robust formula
    const cos_az = (Math.sin(dec_rad) - Math.sin(alt_rad) * Math.sin(lat)) / 
                   (Math.cos(alt_rad) * Math.cos(lat));
    
    const sin_az = Math.sin(ha) * Math.cos(dec_rad) / Math.cos(alt_rad);
    
    // Use atan2 for proper quadrant
    let azimuth = Math.atan2(sin_az, cos_az) * 180 / Math.PI;
    
    // Convert to standard azimuth (0° = North, 90° = East)
    azimuth = (azimuth + 180) % 360;
    
    return azimuth;
  }

  setDateFromDaysOffset(daysOffset) {
    const today = new Date();
    this.currentDate = new Date(today.getTime() + (daysOffset * 24 * 60 * 60 * 1000));
    
    const dateDisplay = document.getElementById('currentDateDisplay');
    if (dateDisplay) {
      dateDisplay.textContent = this.formatDate(this.currentDate);
    }
  }

  getDaysFromToday(date) {
    const today = new Date();
    const diffTime = date - today;
    return Math.floor(diffTime / (1000 * 60 * 60 * 24));
  }

  formatDate(date) {
    return date.toLocaleDateString('en-US', { 
      year: 'numeric', 
      month: 'short', 
      day: 'numeric' 
    });
  }

  formatTime(time) {
    return time.toLocaleTimeString('en-US', { 
      hour: '2-digit', 
      minute: '2-digit', 
      hour12: false 
    });
  }

  showLocationEditor() {
    // Use global modal system if available, otherwise fallback to alert
    if (window.showAlert) {
      window.showAlert(
        'Location Settings', 
        'To set your observatory location, go to the Settings menu (gear icon) in the sidebar and complete the Observatory Location section. You can use the preset buttons for popular remote observatories or enter custom coordinates.',
        'info'
      );
    } else {
      alert('Location editor: Use the Settings menu to set your observatory location.');
    }
  }

  showLoading(message) {
    // Implement loading indicator
    console.log('Loading:', message);
  }

  hideLoading() {
    // Hide loading indicator
    console.log('Loading complete');
  }

  showError(message) {
    // Use global modal system if available, otherwise fallback to alert
    if (window.showAlert) {
      window.showAlert('Error', message, 'error');
    } else {
      console.error('Error:', message);
      alert('Error: ' + message);
    }
  }

  destroy() {
    if (this.chart) {
      this.chart.destroy();
      this.chart = null;
    }
  }
}

// Export for use in other modules
window.AltitudeTimeline = AltitudeTimeline;