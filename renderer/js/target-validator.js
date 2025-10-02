// Target Validator Module
// Helps identify valid astronomical targets vs software/other folders

class TargetValidator {
  constructor() {
    // Common astronomical object patterns
    this.astronomicalPatterns = [
      /^M\s*\d+$/i,                    // Messier objects: M31, M 45
      /^NGC\s*\d+$/i,                  // NGC catalog
      /^IC\s*\d+$/i,                   // IC catalog
      /^Sh2[-\s]*\d+$/i,               // Sharpless catalog
      /^LDN\s*\d+$/i,                  // Lynds Dark Nebula
      /^Abell\s*\d+$/i,                // Abell catalog
      /^vdB\s*\d+$/i,                  // van den Bergh catalog
      /^Barnard\s*\d+$/i,              // Barnard catalog
      /^Ced\s*\d+$/i,                  // Cederblad catalog
      /^Trumpler\s*\d+$/i,             // Trumpler catalog
      /^Collinder\s*\d+$/i,            // Collinder catalog
      /^Melotte\s*\d+$/i,              // Melotte catalog
      /^Stock\s*\d+$/i,                // Stock catalog
      /^UGC\s*\d+$/i,                  // Uppsala General Catalogue
      /^PGC\s*\d+$/i,                  // Principal Galaxies Catalogue
      /^Arp\s*\d+$/i,                  // Arp Peculiar Galaxies
      /nebula/i,                        // Generic nebula names
      /galaxy/i,                        // Generic galaxy names
      /cluster/i,                       // Generic cluster names
      /^C\s*\d+$/i                     // Caldwell catalog
    ];

    // Common astronomical object name parts
    this.astronomicalKeywords = [
      'nebula', 'galaxy', 'cluster', 'globular', 'open',
      'supernova', 'remnant', 'molecular', 'cloud',
      'horsehead', 'eagle', 'crab', 'veil', 'rosette',
      'orion', 'andromeda', 'triangulum', 'whirlpool',
      'sombrero', 'pinwheel', 'sunflower', 'black eye',
      'tadpole', 'antennae', 'mice', 'spiral', 'elliptical',
      'ring', 'dumbbell', 'owl', 'crescent', 'flame',
      'cocoon', 'california', 'north america', 'pelican',
      'pacman', 'heart', 'soul', 'iris', 'cave',
      'bubble', 'elephant trunk', 'pillars', 'witch head',
      'flaming star', 'cone', 'fox fur', 'tulip',
      'western', 'eastern', 'coalsack', 'tarantula',
      'lagoon', 'trifid', 'omega', 'wild duck',
      'pleiades', 'hyades', 'beehive', 'double',
      'blaze star', 'dwarf'
    ];

    // Software/application indicators (definitely NOT targets)
    this.softwareIndicators = [
      'studio', 'app', 'software', 'tool', 'installer',
      'program', 'application', 'setup', 'config',
      'settings', 'library', 'documentation', 'doc',
      'help', 'manual', 'guide', 'tutorial',
      'asi', 'cap', 'img', 'live', 'fits', 'view',
      'pix', 'insight', 'siril', 'stacker',
      'sharp', 'phd', 'nina', 'stellarium',
      'graxpert', 'gaia', 'plugin', 'extension',
      'lib', 'bin', 'src', 'build', 'dist',
      'node_modules', '.git', '.vscode',
      'backup', 'temp', 'cache', 'trash'
    ];
  }

  /**
   * Check if a folder name is likely an astronomical target
   * @param {string} folderName - The folder name to check
   * @returns {boolean} True if likely a target
   */
  isLikelyTarget(folderName) {
    const lower = folderName.toLowerCase().trim();

    // First check: is it definitely NOT a target (software folder)?
    if (this.isSoftwareFolder(lower)) {
      return false;
    }

    // Second check: does it match known catalog patterns?
    if (this.matchesAstronomicalPattern(folderName)) {
      return true;
    }

    // Third check: does it contain astronomical keywords?
    if (this.containsAstronomicalKeywords(lower)) {
      return true;
    }

    // If uncertain, return false (better to miss a target than include junk)
    return false;
  }

  /**
   * Check if a folder name indicates software/application
   * @param {string} folderName - The folder name (lowercase)
   * @returns {boolean} True if it's software
   */
  isSoftwareFolder(folderName) {
    return this.softwareIndicators.some(indicator => 
      folderName.includes(indicator)
    );
  }

  /**
   * Check if folder name matches astronomical catalog patterns
   * @param {string} folderName - The folder name
   * @returns {boolean} True if matches a pattern
   */
  matchesAstronomicalPattern(folderName) {
    return this.astronomicalPatterns.some(pattern => 
      pattern.test(folderName.trim())
    );
  }

  /**
   * Check if folder name contains astronomical keywords
   * @param {string} folderName - The folder name (lowercase)
   * @returns {boolean} True if contains keywords
   */
  containsAstronomicalKeywords(folderName) {
    return this.astronomicalKeywords.some(keyword => 
      folderName.includes(keyword)
    );
  }

  /**
   * Extract potential target name from folder path
   * @param {string} folderPath - Full folder path
   * @returns {string|null} Target name or null
   */
  extractTargetFromPath(folderPath) {
    const parts = folderPath.split(/[\\/]/);
    
    // Work backwards through the path to find the first valid target
    for (let i = parts.length - 1; i >= 0; i--) {
      const part = parts[i];
      
      // Skip common subfolder names
      if (['lights', 'darks', 'flats', 'bias', 'biases', 
           'calibration', 'masters', 'subs', 'raw',
           'L', 'R', 'G', 'B', 'Ha', 'OIII', 'SII', 'H', 'O', 'S'].includes(part)) {
        continue;
      }

      if (this.isLikelyTarget(part)) {
        return part;
      }
    }

    return null;
  }

  /**
   * Validate and clean target name
   * @param {string} targetName - Raw target name
   * @returns {string} Cleaned target name
   */
  cleanTargetName(targetName) {
    // Remove extra whitespace
    let cleaned = targetName.trim().replace(/\s+/g, ' ');

    // Standardize catalog names
    cleaned = cleaned.replace(/^M\s+(\d+)$/i, 'M$1');
    cleaned = cleaned.replace(/^NGC\s+(\d+)$/i, 'NGC$1');
    cleaned = cleaned.replace(/^IC\s+(\d+)$/i, 'IC$1');
    cleaned = cleaned.replace(/^Sh2[-\s]+(\d+)$/i, 'Sh2-$1');
    cleaned = cleaned.replace(/^LDN\s+(\d+)$/i, 'LDN$1');

    // Capitalize first letter of each word for named objects
    if (!/^[A-Z]+\d+/.test(cleaned)) {
      cleaned = cleaned.split(' ')
        .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
        .join(' ');
    }

    return cleaned;
  }

  /**
   * Get confidence score for a target name (0-100)
   * @param {string} folderName - The folder name
   * @returns {number} Confidence score
   */
  getConfidenceScore(folderName) {
    let score = 0;

    // Catalog match is very confident
    if (this.matchesAstronomicalPattern(folderName)) {
      score += 80;
    }

    // Astronomical keywords add confidence
    const lower = folderName.toLowerCase();
    const keywordMatches = this.astronomicalKeywords.filter(kw => 
      lower.includes(kw)
    ).length;
    score += Math.min(keywordMatches * 15, 40);

    // Software indicators reduce confidence dramatically
    if (this.isSoftwareFolder(lower)) {
      score = 0;
    }

    return Math.min(score, 100);
  }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = TargetValidator;
}