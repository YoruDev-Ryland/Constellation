// Target API Module - For searching and normalizing astronomical object names
// Uses SIMBAD astronomical database

class TargetAPI {
  constructor() {
    this.baseUrl = 'https://simbad.u-strasbg.fr/simbad/sim-script';
    this.cache = new Map();
  }

  /**
   * Search for an astronomical object
   * @param {string} query - Object name to search for
   * @returns {Promise<Object|null>} Object info or null if not found
   */
  async search(query) {
    if (this.cache.has(query)) {
      return this.cache.get(query);
    }

    try {
      const script = `
        output console=off script=off
        set limit 1
        format object "%IDLIST(1) | %COO(A D;ICRS) | %OTYPE(S)"
        query id ${query}
      `;

      const response = await fetch(this.baseUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: `script=${encodeURIComponent(script)}`
      });

      if (!response.ok) {
        throw new Error('SIMBAD query failed');
      }

      const text = await response.text();
      const result = this.parseResponse(text, query);
      
      if (result) {
        this.cache.set(query, result);
      }
      
      return result;
    } catch (error) {
      console.error('Error querying SIMBAD:', error);
      return null;
    }
  }

  /**
   * Parse SIMBAD response
   * @private
   */
  parseResponse(text, originalQuery) {
    const lines = text.split('\n').filter(line => 
      line.trim() && !line.startsWith('::')
    );

    if (lines.length === 0) {
      return null;
    }

    const data = lines[0].split('|').map(s => s.trim());
    
    if (data.length < 3) {
      return null;
    }

    const [mainId, coordinates, objectType] = data;

    return {
      originalQuery,
      mainId: mainId || originalQuery,
      coordinates,
      objectType: this.getObjectTypeDescription(objectType),
      rawType: objectType
    };
  }

  /**
   * Get human-readable object type
   * @private
   */
  getObjectTypeDescription(type) {
    const typeMap = {
      'G': 'Galaxy',
      'GiG': 'Galaxy in Group',
      'GiC': 'Galaxy in Cluster',
      'PN': 'Planetary Nebula',
      'HII': 'HII Region',
      'EmO': 'Emission Object',
      'Neb': 'Nebula',
      'OpC': 'Open Cluster',
      'GlC': 'Globular Cluster',
      'Cl*': 'Star Cluster',
      'As*': 'Association of Stars',
      'SNR': 'Supernova Remnant',
      '*': 'Star',
      'V*': 'Variable Star',
      '**': 'Double Star'
    };

    return typeMap[type] || type;
  }

  /**
   * Normalize object name (remove common prefixes/suffixes)
   * @param {string} name - Object name
   * @returns {string} Normalized name
   */
  normalizeName(name) {
    return name
      .toUpperCase()
      .replace(/\s+/g, ' ')
      .trim();
  }

  /**
   * Suggest folder name based on object info
   * @param {Object} objectInfo - Object from search()
   * @returns {string} Suggested folder name
   */
  suggestFolderName(objectInfo) {
    if (!objectInfo) return null;

    const mainId = objectInfo.mainId;
    
    // Extract catalog number (e.g., "M 31" -> "M31", "NGC 7000" -> "NGC7000")
    const normalized = mainId.replace(/\s+/g, '');
    
    return normalized;
  }

  /**
   * Get multiple alternatives for an object
   * @param {string} query - Object name
   * @returns {Promise<Array>} Array of alternative names
   */
  async getAlternatives(query) {
    try {
      const script = `
        output console=off script=off
        set limit 1
        format object "%IDLIST"
        query id ${query}
      `;

      const response = await fetch(this.baseUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: `script=${encodeURIComponent(script)}`
      });

      if (!response.ok) {
        throw new Error('SIMBAD query failed');
      }

      const text = await response.text();
      const lines = text.split('\n').filter(line => 
        line.trim() && !line.startsWith('::')
      );

      if (lines.length === 0) {
        return [];
      }

      // Parse all alternative names
      const alternatives = lines
        .join(' ')
        .split(/\s+/)
        .filter(name => name.length > 0)
        .map(name => this.normalizeName(name));

      return [...new Set(alternatives)]; // Remove duplicates
    } catch (error) {
      console.error('Error getting alternatives:', error);
      return [];
    }
  }

  /**
   * Batch search multiple objects
   * @param {Array<string>} queries - Array of object names
   * @returns {Promise<Array>} Array of results
   */
  async batchSearch(queries) {
    const results = await Promise.all(
      queries.map(query => this.search(query))
    );
    
    return results.filter(r => r !== null);
  }

  /**
   * Clear the cache
   */
  clearCache() {
    this.cache.clear();
  }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = TargetAPI;
}