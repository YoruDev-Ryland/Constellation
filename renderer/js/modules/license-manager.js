// License Manager Module
// Handles premium license validation and feature gating using Ulise authentication service
// Prefix: "CONST" for this application

class LicenseManager {
  constructor(electronAPI, options = {}) {
    this.electronAPI = electronAPI;
    this.apiUrl = 'https://licenses.skkings.com/api';
    this.softwareName = 'Constellation';
    this.prefix = 'CONST';
    this.log = options.log || (() => {});
    
    // License state
    this.licenseKey = null;
    this.isPremium = false;
    this.lastCheck = 0;
    this.checkInterval = 3600000; // 1 hour in milliseconds
    this.cacheExpiry = 3600000; // 1 hour cache
    this.offlineToken = null;
    this.offlineExpiry = null;
    
    // Observers for license state changes
    this.observers = new Map();
  }

  // Initialize the license manager
  async initialize() {
    try {
      // Load stored license from settings
      const settings = await this.electronAPI.getSettings();
      if (settings.licenseKey) {
        this.licenseKey = settings.licenseKey;
        this.log('License key loaded from settings');
      }
      if (settings.offlineToken) {
        this.offlineToken = settings.offlineToken;
        this.offlineExpiry = settings.offlineExpiry;
        this.log('Offline token loaded from settings');
      }
      
      // Initial license check
      await this.checkLicense();
      return true;
    } catch (error) {
      console.error('[LicenseManager] Initialization failed:', error);
      this.isPremium = false;
      return false;
    }
  }

  // Validate license key format
  validateKeyFormat(key) {
    if (!key || typeof key !== 'string') return false;
    const cleaned = key.trim().toUpperCase();
    const pattern = new RegExp(`^${this.prefix}-[A-Z0-9]{5}-[A-Z0-9]{5}-[A-Z0-9]{5}-[A-Z0-9]{5}$`);
    return pattern.test(cleaned);
  }

  // Format license key with dashes
  formatKey(key) {
    if (!key) return '';
    const cleaned = key.replace(/[^A-Z0-9]/gi, '').toUpperCase();
    if (cleaned.length === 0) return '';
    
    // Add prefix if missing
    let formatted = cleaned.startsWith(this.prefix) ? cleaned : this.prefix + cleaned;
    
    // Insert dashes at correct positions
    const parts = [];
    for (let i = 0; i < formatted.length; i += 5) {
      parts.push(formatted.slice(i, i + 5));
    }
    
    return parts.join('-');
  }

  // Check license validity (online and offline)
  async checkLicense() {
    if (!this.licenseKey) {
      this.isPremium = false;
      this.notify('license-changed', false);
      return { valid: false, reason: 'No license key' };
    }

    const now = Date.now();
    
    // Skip check if recently validated
    if (now - this.lastCheck < this.checkInterval && this.isPremium) {
      return { valid: true, reason: 'Recently validated' };
    }

    try {
      // Try online validation first
      const result = await this.validateOnline(this.licenseKey);
      this.lastCheck = now;
      
      if (result.valid) {
        this.isPremium = true;
        
        // Store offline token if provided
        if (result.offline_token) {
          this.offlineToken = result.offline_token;
          this.offlineExpiry = result.offline_expires_at;
          await this.saveOfflineToken();
        }
        
        this.notify('license-changed', true);
        this.log('License validated online successfully');
        return result;
      } else {
        // Online validation failed, try offline
        const offlineResult = await this.validateOffline();
        if (offlineResult.valid) {
          this.isPremium = true;
          this.notify('license-changed', true);
          this.log('License validated offline successfully');
          return offlineResult;
        } else {
          this.isPremium = false;
          this.notify('license-changed', false);
          this.log('License validation failed:', result.reason);
          return result;
        }
      }
    } catch (error) {
      this.log('License validation error:', error.message);
      
      // Network error - try offline validation
      const offlineResult = await this.validateOffline();
      if (offlineResult.valid) {
        this.isPremium = true;
        this.notify('license-changed', true);
        this.log('Using offline validation due to network error');
        return offlineResult;
      } else {
        // Check if we had recent valid validation
        if (this.hasRecentValidCheck()) {
          this.isPremium = true;
          this.notify('license-changed', true);
          return { valid: true, reason: 'Using cached validation due to network error' };
        } else {
          this.isPremium = false;
          this.notify('license-changed', false);
          return { valid: false, reason: `Network error: ${error.message}` };
        }
      }
    }
  }

  // Online license validation
  async validateOnline(licenseKey) {
    try {
      const deviceId = await this.getDeviceId();
      const requestBody = {
        license_key: licenseKey.trim().toUpperCase(),
        software_name: this.softwareName,
        device_id: deviceId,
        request_offline_token: true
      };

      const result = await this.electronAPI.validateLicense(this.apiUrl + '/validate', requestBody);
      
      if (result.success) {
        // Store last valid check timestamp
        await this.storeLastValidCheck();
        return {
          valid: true,
          expires_at: result.data.expires_at,
          offline_token: result.data.offline_token,
          offline_expires_at: result.data.offline_expires_at
        };
      } else {
        return {
          valid: false,
          reason: result.error || 'License validation failed'
        };
      }
    } catch (error) {
      throw error;
    }
  }

  // Offline license validation using JWT token
  async validateOffline() {
    if (!this.offlineToken) {
      return { valid: false, reason: 'No offline token available' };
    }

    try {
      const now = new Date();
      const expiryDate = new Date(this.offlineExpiry);
      
      if (now > expiryDate) {
        return { valid: false, reason: 'Offline token expired' };
      }

      // Verify token with public key (simplified - in production would use proper JWT verification)
      const isValid = await this.electronAPI.verifyJwtToken(this.offlineToken, this.licenseKey);
      
      if (isValid) {
        return { valid: true, reason: 'Valid offline token' };
      } else {
        return { valid: false, reason: 'Invalid offline token signature' };
      }
    } catch (error) {
      return { valid: false, reason: `Offline validation error: ${error.message}` };
    }
  }

  // Activate a new license key
  async activateLicense(licenseKey) {
    try {
      // Validate format first
      if (!this.validateKeyFormat(licenseKey)) {
        return { 
          success: false, 
          error: `Invalid license key format. Expected: ${this.prefix}-XXXXX-XXXXX-XXXXX-XXXXX` 
        };
      }

      const cleanKey = licenseKey.trim().toUpperCase();
      
      // Validate with server
      const result = await this.validateOnline(cleanKey);
      
      if (result.valid) {
        this.licenseKey = cleanKey;
        this.isPremium = true;
        
        // Save to settings
        const settings = await this.electronAPI.getSettings();
        settings.licenseKey = cleanKey;
        if (result.offline_token) {
          settings.offlineToken = result.offline_token;
          settings.offlineExpiry = result.offline_expires_at;
        }
        await this.electronAPI.saveSettings(settings);
        
        this.notify('license-activated', cleanKey);
        this.notify('license-changed', true);
        this.log('License activated successfully:', cleanKey);
        
        return { 
          success: true, 
          message: 'License activated successfully!',
          expires_at: result.expires_at
        };
      } else {
        return { 
          success: false, 
          error: result.reason || 'License validation failed' 
        };
      }
    } catch (error) {
      this.log('License activation error:', error);
      return { 
        success: false, 
        error: `Activation failed: ${error.message}` 
      };
    }
  }

  // Deactivate current license
  async deactivateLicense() {
    try {
      this.licenseKey = null;
      this.isPremium = false;
      this.offlineToken = null;
      this.offlineExpiry = null;
      
      // Remove from settings
      const settings = await this.electronAPI.getSettings();
      delete settings.licenseKey;
      delete settings.offlineToken;
      delete settings.offlineExpiry;
      delete settings.lastValidCheck;
      await this.electronAPI.saveSettings(settings);
      
      this.notify('license-deactivated');
      this.notify('license-changed', false);
      this.log('License deactivated');
      
      return { success: true, message: 'License deactivated successfully' };
    } catch (error) {
      this.log('License deactivation error:', error);
      return { success: false, error: `Deactivation failed: ${error.message}` };
    }
  }

  // Premium feature gate
  requirePremium(featureName = 'feature') {
    if (!this.isPremium) {
      throw new Error(`Premium license required for ${featureName}. Please activate your license in Settings.`);
    }
    return true;
  }

  // Check if feature is premium without throwing
  isPremiumFeature(featureName = 'feature') {
    return this.isPremium;
  }

  // Get current license status
  getStatus() {
    return {
      hasLicense: !!this.licenseKey,
      isPremium: this.isPremium,
      licenseKey: this.licenseKey ? this.maskLicenseKey(this.licenseKey) : null,
      lastCheck: this.lastCheck,
      offlineAvailable: !!this.offlineToken
    };
  }

  // Mask license key for display
  maskLicenseKey(key) {
    if (!key) return '';
    const parts = key.split('-');
    if (parts.length === 5) {
      return `${parts[0]}-${parts[1]}-***-***-${parts[4]}`;
    }
    return key.substring(0, 8) + '***';
  }

  // Get or generate device ID
  async getDeviceId() {
    try {
      let deviceId = await this.electronAPI.getDeviceId();
      if (!deviceId) {
        // Generate a stable device ID based on system info
        deviceId = await this.electronAPI.generateDeviceId();
      }
      return deviceId;
    } catch (error) {
      // Fallback to a random ID (less secure but functional)
      return 'fallback-' + Math.random().toString(36).substring(2, 15);
    }
  }

  // Check if we had recent valid validation
  hasRecentValidCheck() {
    const settings = this.electronAPI.getSettings();
    if (!settings.lastValidCheck) return false;
    
    const lastValid = new Date(settings.lastValidCheck);
    const now = new Date();
    const hoursSinceValid = (now - lastValid) / (1000 * 60 * 60);
    
    return hoursSinceValid < 24; // 24 hour grace period
  }

  // Store timestamp of successful validation
  async storeLastValidCheck() {
    try {
      const settings = await this.electronAPI.getSettings();
      settings.lastValidCheck = new Date().toISOString();
      await this.electronAPI.saveSettings(settings);
    } catch (error) {
      this.log('Failed to store last valid check:', error);
    }
  }

  // Save offline token to settings
  async saveOfflineToken() {
    try {
      const settings = await this.electronAPI.getSettings();
      settings.offlineToken = this.offlineToken;
      settings.offlineExpiry = this.offlineExpiry;
      await this.electronAPI.saveSettings(settings);
    } catch (error) {
      this.log('Failed to save offline token:', error);
    }
  }

  // Observer pattern for license state changes
  on(event, callback) {
    if (!this.observers.has(event)) {
      this.observers.set(event, new Set());
    }
    this.observers.get(event).add(callback);
    return () => this.off(event, callback);
  }

  off(event, callback) {
    if (this.observers.has(event)) {
      this.observers.get(event).delete(callback);
    }
  }

  notify(event, data = null) {
    if (this.observers.has(event)) {
      this.observers.get(event).forEach(callback => {
        try {
          callback(data);
        } catch (error) {
          console.error('[LicenseManager] Observer error:', error);
        }
      });
    }
  }
}

window.LicenseManager = LicenseManager;