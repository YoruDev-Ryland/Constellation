// Settings Manager Module
// Responsible for loading, accessing, and updating application settings.
// Future: persistence hooks, validation, change events.
class SettingsManager {
  constructor(electronAPI) {
    this.electronAPI = electronAPI;
    this.settings = {};
    this.observers = new Map();
  }

  async load() {
    try {
      this.settings = await this.electronAPI.getSettings();
      return this.settings;
    } catch (err) {
      console.error('[SettingsManager] Failed to load settings:', err);
      this.settings = {};
      return this.settings;
    }
  }

  get(key, fallback = undefined) {
    if (key == null) return this.settings;
    return Object.prototype.hasOwnProperty.call(this.settings, key) ? this.settings[key] : fallback;
  }

  set(key, value) {
    const oldValue = this.settings[key];
    this.settings[key] = value;
    this.notify(key, value, oldValue);
  }

  // Register an observer for a specific key (or '*' for all)
  on(key, callback) {
    if (!this.observers.has(key)) this.observers.set(key, new Set());
    this.observers.get(key).add(callback);
    return () => this.off(key, callback);
  }

  off(key, callback) {
    if (this.observers.has(key)) {
      this.observers.get(key).delete(callback);
    }
  }

  notify(key, value, oldValue) {
    if (this.observers.has(key)) {
      this.observers.get(key).forEach(cb => {
        try { cb(value, oldValue); } catch (e) { console.error('[SettingsManager] Observer error', e); }
      });
    }
    if (this.observers.has('*')) {
      this.observers.get('*').forEach(cb => {
        try { cb(key, value, oldValue); } catch (e) { console.error('[SettingsManager] Observer error', e); }
      });
    }
  }
}

window.SettingsManager = SettingsManager;