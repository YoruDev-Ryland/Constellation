// FITS Utilities Module
// Helper functions for working with FITS files

class FitsUtils {
  /**
   * Extract common metadata from FITS header
   * @param {Object} header - FITS header object
   * @returns {Object} Normalized metadata
   */
  static extractMetadata(header) {
    if (!header) return null;

    return {
      // Target information
      target: header.OBJECT || header.TARGET || 'Unknown',
      
      // Filter information
      filter: this.normalizeFilter(header.FILTER || header.FILTER1 || 'L'),
      
      // Exposure information
      exposure: parseFloat(header.EXPTIME || header.EXPOSURE || 0),
      
      // Camera information
      instrument: header.INSTRUME || header.TELESCOP || 'Unknown',
      
      // Temperature
      temperature: parseFloat(header['CCD-TEMP'] || header.TEMP || 0),
      
      // Binning
      xbinning: parseInt(header.XBINNING || 1),
      ybinning: parseInt(header.YBINNING || 1),
      
      // Gain and offset
      gain: parseFloat(header.GAIN || 0),
      offset: parseInt(header.OFFSET || 0),
      
      // Coordinates
      ra: header.RA || header.OBJCTRA || null,
      dec: header.DEC || header.OBJCTDEC || null,
      
      // Date/time
      dateObs: header['DATE-OBS'] || header.DATE || null,
      
      // Image dimensions
      naxis1: parseInt(header.NAXIS1 || 0),
      naxis2: parseInt(header.NAXIS2 || 0),
      
      // Software
      software: header.SWCREATE || header.SOFTWARE || 'Unknown'
    };
  }

  /**
   * Normalize filter names to standard format
   * @param {string} filter - Raw filter name
   * @returns {string} Normalized filter name
   */
  static normalizeFilter(filter) {
    if (!filter) return 'L';

    const normalized = filter.toUpperCase().trim();

    // Common filter mappings
    const filterMap = {
      'LUMINANCE': 'L',
      'LUM': 'L',
      'CLEAR': 'L',
      'RED': 'R',
      'GREEN': 'G',
      'BLUE': 'B',
      'H-ALPHA': 'Ha',
      'HA': 'Ha',
      'HALPHA': 'Ha',
      'H_ALPHA': 'Ha',
      'OIII': 'OIII',
      'O3': 'OIII',
      'O_III': 'OIII',
      'SII': 'SII',
      'S2': 'SII',
      'S_II': 'SII'
    };

    return filterMap[normalized] || normalized;
  }

  /**
   * Get filter color for UI display
   * @param {string} filter - Filter name
   * @returns {string} CSS color
   */
  static getFilterColor(filter) {
    const colorMap = {
      'L': '#ffffff',
      'R': '#ff4444',
      'G': '#44ff44',
      'B': '#4444ff',
      'Ha': '#ff1744',
      'OIII': '#00e5ff',
      'SII': '#ff6e40'
    };

    return colorMap[filter] || '#9ca3af';
  }

  /**
   * Format exposure time for display
   * @param {number} seconds - Exposure time in seconds
   * @returns {string} Formatted time
   */
  static formatExposure(seconds) {
    if (seconds < 60) {
      return `${seconds.toFixed(1)}s`;
    } else if (seconds < 3600) {
      return `${(seconds / 60).toFixed(1)}m`;
    } else {
      return `${(seconds / 3600).toFixed(2)}h`;
    }
  }

  /**
   * Calculate total integration time
   * @param {Array} images - Array of image objects with exposure property
   * @returns {number} Total time in seconds
   */
  static calculateTotalTime(images) {
    return images.reduce((sum, img) => sum + (img.exposure || 0), 0);
  }

  /**
   * Group images by filter
   * @param {Array} images - Array of image objects
   * @returns {Object} Images grouped by filter
   */
  static groupByFilter(images) {
    const grouped = {};

    for (const image of images) {
      const filter = image.filter || 'L';
      if (!grouped[filter]) {
        grouped[filter] = [];
      }
      grouped[filter].push(image);
    }

    return grouped;
  }

  /**
   * Detect if filename indicates it's a calibration frame
   * @param {string} filename - Filename or path
   * @returns {Object} Calibration info
   */
  static detectCalibrationFrame(filename) {
    const lower = filename.toLowerCase();

    const types = {
      bias: /bias|offset/i,
      dark: /dark/i,
      flat: /flat/i,
      darkflat: /darkflat|dark_flat/i
    };

    for (const [type, pattern] of Object.entries(types)) {
      if (pattern.test(lower)) {
        return { isCalibration: true, type };
      }
    }

    return { isCalibration: false, type: 'light' };
  }

  /**
   * Parse RA/DEC coordinates
   * @param {string} ra - Right ascension
   * @param {string} dec - Declination
   * @returns {Object} Parsed coordinates
   */
  static parseCoordinates(ra, dec) {
    // This is a simplified parser - would need more robust implementation
    if (!ra || !dec) return null;

    return {
      ra: ra.toString(),
      dec: dec.toString(),
      formatted: `${ra}, ${dec}`
    };
  }

  /**
   * Generate statistics summary for a set of images
   * @param {Array} images - Array of image metadata objects
   * @returns {Object} Statistics
   */
  static generateStatistics(images) {
    if (!images || images.length === 0) {
      return null;
    }

    const exposures = images.map(img => img.exposure).filter(e => e > 0);
    const temperatures = images.map(img => img.temperature).filter(t => t !== 0);
    
    return {
      totalImages: images.length,
      totalTime: this.calculateTotalTime(images),
      avgExposure: exposures.length > 0 
        ? exposures.reduce((a, b) => a + b, 0) / exposures.length 
        : 0,
      minExposure: exposures.length > 0 ? Math.min(...exposures) : 0,
      maxExposure: exposures.length > 0 ? Math.max(...exposures) : 0,
      avgTemperature: temperatures.length > 0
        ? temperatures.reduce((a, b) => a + b, 0) / temperatures.length
        : null,
      filters: this.groupByFilter(images)
    };
  }

  /**
   * Sort images by date
   * @param {Array} images - Array of image objects
   * @param {boolean} ascending - Sort order
   * @returns {Array} Sorted images
   */
  static sortByDate(images, ascending = true) {
    return images.sort((a, b) => {
      const dateA = new Date(a.dateObs || 0);
      const dateB = new Date(b.dateObs || 0);
      return ascending ? dateA - dateB : dateB - dateA;
    });
  }

  /**
   * Check if FITS file is likely a stacked/processed image
   * @param {string} filename - Filename or path
   * @param {Object} header - FITS header
   * @returns {boolean} True if processed
   */
  static isProcessedImage(filename, header) {
    const processedKeywords = [
      'stacked', 'master', 'combined', 'integrated',
      'processed', 'registered', 'calibrated', 'final'
    ];

    const lower = filename.toLowerCase();
    
    for (const keyword of processedKeywords) {
      if (lower.includes(keyword)) {
        return true;
      }
    }

    // Check if header indicates processing
    if (header && (header.HISTORY || header.COMMENT)) {
      const history = (header.HISTORY || '') + (header.COMMENT || '');
      if (history.toLowerCase().includes('stacked') || 
          history.toLowerCase().includes('combined')) {
        return true;
      }
    }

    return false;
  }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = FitsUtils;
}