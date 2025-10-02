/**
 * H-R Diagram Module
 * 
 * This module provides functionality to create Hertzsprung-Russell diagrams
 * from stellar field images. It includes:
 * - Star detection and extraction from images
 * - Aperture photometry for brightness measurements
 * - Color index calculations (B-V, etc.)
 * - H-R diagram plotting and visualization
 * - Stellar classification and analysis
 */

class HRDiagram {
  constructor() {
    this.stars = [];
    this.chart = null;
    this.canvas = null;
    this.imageData = null;
  }

  /**
   * Initialize the H-R diagram with an image canvas
   * @param {HTMLCanvasElement} canvas - Canvas element containing the star field image
   */
  async initialize(canvas) {
    this.canvas = canvas;
    const ctx = canvas.getContext('2d');
    this.imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    
    console.log('H-R Diagram initialized with image:', {
      width: canvas.width,
      height: canvas.height,
      pixels: this.imageData.data.length / 4
    });
  }

  /**
   * Detect stars in the loaded image using brightness thresholding and centroid detection
   * @param {Object} options - Detection parameters
   * @param {number} options.threshold - Brightness threshold (0-255)
   * @param {number} options.minRadius - Minimum star radius in pixels
   * @param {number} options.maxRadius - Maximum star radius in pixels
   * @param {number} options.minSeparation - Minimum separation between stars
   * @returns {Array} Array of detected star objects
   */
  detectStars(options = {}) {
    const {
      threshold = 120,
      minRadius = 2,
      maxRadius = 50,
      minSeparation = 10
    } = options;

    console.log('Detecting stars with parameters:', options);
    
    const startTime = Date.now();
    const maxProcessingTime = 30000; // 30 seconds max
    
    try {
      const candidates = this._findBrightPixels(threshold);
      
      // Check processing time
      if (Date.now() - startTime > maxProcessingTime) {
        console.error('Star detection timeout - too many bright pixels');
        return [];
      }
      
      const groups = this._groupNearbyPixels(candidates, minSeparation);
      
      // Check processing time again
      if (Date.now() - startTime > maxProcessingTime) {
        console.error('Star detection timeout - grouping took too long');
        return [];
      }
      
      const stars = this._calculateCentroids(groups);
      
      // Filter stars by size
      this.stars = stars.filter(star => 
        star.radius >= minRadius && 
        star.radius <= maxRadius &&
        star.brightness > threshold
      );

      console.log(`Detected ${this.stars.length} stars from ${candidates.length} bright pixels in ${Date.now() - startTime}ms`);
      return this.stars;
    } catch (error) {
      console.error('Error in star detection:', error);
      return [];
    }
  }

  /**
   * Perform aperture photometry on detected stars
   * @param {Object} options - Photometry parameters
   * @param {number} options.apertureRadius - Radius of photometry aperture
   * @param {number} options.annulusInner - Inner radius of background annulus
   * @param {number} options.annulusOuter - Outer radius of background annulus
   * @returns {Array} Stars with photometry data added
   */
  performPhotometry(options = {}) {
    const {
      apertureRadius = 5,
      annulusInner = 8,
      annulusOuter = 12
    } = options;

    console.log('Performing aperture photometry on', this.stars.length, 'stars');

    this.stars.forEach(star => {
      // Measure flux within aperture
      const aperture = this._measureAperture(star.x, star.y, apertureRadius);
      
      // Measure background in annulus
      const background = this._measureBackground(
        star.x, star.y, annulusInner, annulusOuter
      );
      
      // Calculate net flux and instrumental magnitude
      const netFlux = aperture.flux - (background.meanFlux * aperture.area);
      star.flux = Math.max(netFlux, 1); // Prevent negative flux
      star.magnitude = -2.5 * Math.log10(star.flux);
      star.snr = netFlux / Math.sqrt(netFlux + (background.stdFlux * aperture.area));
      
      console.log(`Star at (${star.x.toFixed(1)}, ${star.y.toFixed(1)}): mag=${star.magnitude.toFixed(2)}, SNR=${star.snr.toFixed(1)}`);
    });

    // Sort by brightness (magnitude)
    this.stars.sort((a, b) => a.magnitude - b.magnitude);
    
    return this.stars;
  }

  /**
   * Calculate color indices for multi-filter observations
   * @param {Array} filters - Array of filter objects with star measurements
   * @returns {Array} Stars with color indices calculated
   */
  calculateColorIndices(filters) {
    if (filters.length < 2) {
      console.warn('Need at least 2 filters to calculate color indices');
      return this.stars;
    }

    console.log('Calculating color indices from', filters.length, 'filters');

    // For now, assume B and V filters (most common for H-R diagrams)
    const bFilter = filters.find(f => f.name === 'B') || filters[0];
    const vFilter = filters.find(f => f.name === 'V') || filters[1];

    this.stars.forEach(star => {
      // Match stars between filters (simple nearest neighbor for now)
      const bStar = this._findNearestStar(star, bFilter.stars, 5);
      const vStar = this._findNearestStar(star, vFilter.stars, 5);
      
      if (bStar && vStar) {
        star.colorBV = bStar.magnitude - vStar.magnitude;
        star.vmag = vStar.magnitude;
        star.temperature = this._estimateTemperature(star.colorBV);
      }
    });

    return this.stars.filter(star => star.colorBV !== undefined);
  }

  /**
   * Create H-R diagram chart
   * @param {HTMLCanvasElement} chartCanvas - Canvas for the chart
   * @param {Object} options - Chart options
   * @returns {Chart} Chart.js instance
   */
  createChart(chartCanvas, options = {}) {
    const {
      title = 'H-R Diagram',
      showClassificationRegions = true,
      colorScheme = 'temperature'
    } = options;

    console.log('Creating H-R chart with', this.stars.length, 'stars');

    // Safeguard: Ensure we have valid stars data
    if (!this.stars || this.stars.length === 0) {
      console.warn('No stars available for H-R diagram');
      return null;
    }

    // Safeguard: Ensure canvas is valid
    if (!chartCanvas || !chartCanvas.getContext) {
      console.error('Invalid canvas provided for H-R diagram');
      return null;
    }

    // Set fixed canvas size to prevent infinite growth
    chartCanvas.width = 800;
    chartCanvas.height = 600;
    chartCanvas.style.width = '100%';
    chartCanvas.style.height = '400px';

    // For single-filter images, create synthetic color data for demonstration
    const validStars = this.stars.filter(star => 
      star.magnitude !== undefined && 
      !isNaN(star.magnitude) &&
      isFinite(star.magnitude) &&
      star.magnitude !== 0 // Filter out failed photometry (mag = 0)
    );

    console.log('Valid stars for chart:', validStars.length);

    if (validStars.length === 0) {
      console.warn('No valid stars with magnitude data');
      alert('No valid stellar magnitudes found. Try adjusting detection parameters.');
      return null;
    }

    // Create synthetic B-V color index based on magnitude and position
    // This is for demonstration - real H-R diagrams need multi-filter data
    const chartData = validStars.slice(0, 100).map((star, index) => {
      // Create realistic B-V color distribution (-0.5 to +2.0)
      // Brighter stars tend to be bluer (lower B-V)
      const syntheticBV = 0.3 + (star.magnitude + 10) * 0.1 + (Math.random() - 0.5) * 0.8;
      const clampedBV = Math.max(-0.5, Math.min(2.0, syntheticBV));
      
      // Use instrumental magnitude but normalize to reasonable range
      const normalizedMag = star.magnitude + 15; // Shift to apparent magnitude range
      
      return {
        x: clampedBV,
        y: normalizedMag,
        temperature: this._estimateTemperature(clampedBV),
        luminosity: this._calculateLuminosity(normalizedMag),
        spectralClass: this._getSpectralClass(clampedBV),
        originalStar: star
      };
    });

    console.log('Creating H-R diagram with', chartData.length, 'stars');

    const config = {
      type: 'scatter',
      data: {
        datasets: [{
          label: 'Detected Stars',
          data: chartData,
          backgroundColor: colorScheme === 'temperature' 
            ? chartData.map(star => this._temperatureToColor(star.temperature))
            : '#3b82f6',
          borderColor: '#1f2937',
          borderWidth: 1,
          pointRadius: 4
        }]
      },
      options: {
        responsive: false,
        maintainAspectRatio: true,
        aspectRatio: 1,
        animation: false,
        plugins: {
          title: {
            display: true,
            text: [title, '(Synthetic B-V colors for demonstration)'],
            color: '#e2e8f0',
            font: { size: 16 }
          },
          legend: {
            labels: { color: '#e2e8f0' }
          },
          tooltip: {
            callbacks: {
              label: (context) => {
                const star = context.raw;
                return [
                  `B-V: ${star.x.toFixed(3)} (synthetic)`,
                  `Magnitude: ${star.y.toFixed(2)}`,
                  `Temp: ${star.temperature.toFixed(0)}K`,
                  `Class: ${star.spectralClass}`,
                  `Original pos: (${star.originalStar.x.toFixed(0)}, ${star.originalStar.y.toFixed(0)})`
                ];
              }
            }
          }
        },
        scales: {
          x: {
            title: {
              display: true,
              text: 'B-V Color Index',
              color: '#94a3b8'
            },
            grid: { color: '#334155' },
            ticks: { color: '#94a3b8' }
          },
          y: {
            reverse: true, // Brighter stars (lower magnitude) at top
            title: {
              display: true,
              text: 'V Magnitude',
              color: '#94a3b8'
            },
            grid: { color: '#334155' },
            ticks: { color: '#94a3b8' }
          }
        }
      }
    };

    // Add classification regions if requested
    if (showClassificationRegions) {
      this._addClassificationRegions(config);
    }

    try {
      // Destroy any existing chart on this canvas
      if (chartCanvas.chart) {
        chartCanvas.chart.destroy();
      }
      
      this.chart = new Chart(chartCanvas, config);
      chartCanvas.chart = this.chart; // Store reference to prevent memory leaks
      
      console.log('H-R diagram chart created successfully');
      return this.chart;
    } catch (error) {
      console.error('Error creating H-R diagram chart:', error);
      return null;
    }
  }

  // Private helper methods

  _findBrightPixels(threshold) {
    const candidates = [];
    const { data, width, height } = this.imageData;
    
    for (let y = 1; y < height - 1; y++) {
      for (let x = 1; x < width - 1; x++) {
        const i = (y * width + x) * 4;
        const brightness = (data[i] + data[i + 1] + data[i + 2]) / 3;
        
        if (brightness > threshold) {
          candidates.push({ x, y, brightness });
        }
      }
    }
    
    return candidates;
  }

  _groupNearbyPixels(candidates, minSeparation) {
    const groups = [];
    const used = new Set();
    
    candidates.forEach((candidate, i) => {
      if (used.has(i)) return;
      
      const group = [candidate];
      used.add(i);
      
      // Find nearby pixels
      for (let j = i + 1; j < candidates.length; j++) {
        if (used.has(j)) continue;
        
        const other = candidates[j];
        const distance = Math.sqrt(
          Math.pow(candidate.x - other.x, 2) + 
          Math.pow(candidate.y - other.y, 2)
        );
        
        if (distance < minSeparation) {
          group.push(other);
          used.add(j);
        }
      }
      
      groups.push(group);
    });
    
    return groups;
  }

  _calculateCentroids(groups) {
    return groups.map(group => {
      let totalX = 0, totalY = 0, totalBrightness = 0;
      
      group.forEach(pixel => {
        totalX += pixel.x * pixel.brightness;
        totalY += pixel.y * pixel.brightness;
        totalBrightness += pixel.brightness;
      });
      
      const centroidX = totalX / totalBrightness;
      const centroidY = totalY / totalBrightness;
      const avgBrightness = totalBrightness / group.length;
      
      // Estimate radius from group spread
      const distances = group.map(p => 
        Math.sqrt(Math.pow(p.x - centroidX, 2) + Math.pow(p.y - centroidY, 2))
      );
      const radius = Math.max(...distances);
      
      return {
        x: centroidX,
        y: centroidY,
        brightness: avgBrightness,
        radius,
        pixelCount: group.length
      };
    });
  }

  _measureAperture(centerX, centerY, radius) {
    const { data, width } = this.imageData;
    let flux = 0;
    let pixelCount = 0;
    
    const minX = Math.max(0, Math.floor(centerX - radius));
    const maxX = Math.min(width - 1, Math.ceil(centerX + radius));
    const minY = Math.max(0, Math.floor(centerY - radius));
    const maxY = Math.min(this.imageData.height - 1, Math.ceil(centerY + radius));
    
    for (let y = minY; y <= maxY; y++) {
      for (let x = minX; x <= maxX; x++) {
        const distance = Math.sqrt(Math.pow(x - centerX, 2) + Math.pow(y - centerY, 2));
        
        if (distance <= radius) {
          const i = (y * width + x) * 4;
          const brightness = (data[i] + data[i + 1] + data[i + 2]) / 3;
          flux += brightness;
          pixelCount++;
        }
      }
    }
    
    return { flux, area: pixelCount };
  }

  _measureBackground(centerX, centerY, innerRadius, outerRadius) {
    const { data, width } = this.imageData;
    const values = [];
    
    const minX = Math.max(0, Math.floor(centerX - outerRadius));
    const maxX = Math.min(width - 1, Math.ceil(centerX + outerRadius));
    const minY = Math.max(0, Math.floor(centerY - outerRadius));
    const maxY = Math.min(this.imageData.height - 1, Math.ceil(centerY + outerRadius));
    
    for (let y = minY; y <= maxY; y++) {
      for (let x = minX; x <= maxX; x++) {
        const distance = Math.sqrt(Math.pow(x - centerX, 2) + Math.pow(y - centerY, 2));
        
        if (distance >= innerRadius && distance <= outerRadius) {
          const i = (y * width + x) * 4;
          const brightness = (data[i] + data[i + 1] + data[i + 2]) / 3;
          values.push(brightness);
        }
      }
    }
    
    if (values.length === 0) return { meanFlux: 0, stdFlux: 0 };
    
    const meanFlux = values.reduce((sum, val) => sum + val, 0) / values.length;
    const variance = values.reduce((sum, val) => sum + Math.pow(val - meanFlux, 2), 0) / values.length;
    const stdFlux = Math.sqrt(variance);
    
    return { meanFlux, stdFlux };
  }

  _findNearestStar(targetStar, starList, maxDistance) {
    let nearest = null;
    let minDistance = maxDistance;
    
    starList.forEach(star => {
      const distance = Math.sqrt(
        Math.pow(star.x - targetStar.x, 2) + 
        Math.pow(star.y - targetStar.y, 2)
      );
      
      if (distance < minDistance) {
        minDistance = distance;
        nearest = star;
      }
    });
    
    return nearest;
  }

  _estimateTemperature(colorBV) {
    // Empirical B-V to temperature conversion for main sequence stars
    // Based on Ballesteros (2012) formula
    return 4600 * (1 / (0.92 * colorBV + 1.7) + 1 / (0.92 * colorBV + 0.62));
  }

  _calculateLuminosity(vmag) {
    // Convert apparent magnitude to relative luminosity
    // Assumes distance modulus = 0 (nearby stars)
    return Math.pow(10, -0.4 * vmag);
  }

  _getSpectralClass(colorBV) {
    if (colorBV < -0.30) return 'O';
    if (colorBV < -0.02) return 'B';
    if (colorBV < 0.30) return 'A';
    if (colorBV < 0.58) return 'F';
    if (colorBV < 0.81) return 'G';
    if (colorBV < 1.40) return 'K';
    return 'M';
  }

  _temperatureToColor(temperature) {
    // Convert temperature to RGB color for visualization
    if (temperature > 30000) return '#9bb0ff';      // O - Blue
    if (temperature > 10000) return '#aabfff';      // B - Blue-white
    if (temperature > 7500) return '#cad7ff';       // A - White
    if (temperature > 6000) return '#f8f7ff';       // F - Yellow-white
    if (temperature > 5200) return '#fff4ea';       // G - Yellow (Sun)
    if (temperature > 3700) return '#ffb56c';       // K - Orange
    return '#ff6a00';                               // M - Red
  }

  _addClassificationRegions(config) {
    // Add background regions for stellar classifications
    // This would require Chart.js annotation plugin or custom drawing
    console.log('Classification regions would be added here with Chart.js annotations');
  }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = HRDiagram;
} else if (typeof window !== 'undefined') {
  window.HRDiagram = HRDiagram;
}