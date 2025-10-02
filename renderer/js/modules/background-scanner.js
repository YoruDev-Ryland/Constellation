// Background Scanner Module
// Handles scheduled background scans with minimal UI disruption.
// Depends on injected scan function and log manager for verbosity control.

class BackgroundScanner {
  constructor(options = {}) {
    this.scanFn = options.scanFn; // async () => void
    this.getSettings = options.getSettings || (() => ({}));
    this.getLogManager = options.getLogManager || (() => null);
    this.intervalId = null;
    this.isRunning = false;
  }

  start() {
    const settings = this.getSettings();
    const enabled = settings.enableBackgroundScan !== false; // default true
    const hours = settings.backgroundScanHours || 4;
    if (!enabled || hours <= 0) {
      this.stop();
      console.log('Background scanning disabled');
      return;
    }
    const ms = hours * 60 * 60 * 1000;
    if (this.intervalId) clearInterval(this.intervalId);
    this.intervalId = setInterval(() => this.performScan(), ms);
    // Schedule first scan after 5 minutes
    setTimeout(() => this.performScan(), 5 * 60 * 1000);
    console.log(`Background scanning enabled: every ${hours} hours`);
  }

  stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  async performScan() {
    if (this.isRunning) {
      console.log('Background scan already in progress, skipping');
      return;
    }
    this.isRunning = true;
    console.log('Starting silent background scan...');
    const logManager = this.getLogManager();
    let prevVerbose = false;
    try {
      if (logManager) {
        prevVerbose = logManager.isVerbose();
        logManager.setVerbose(false);
      }
      await this.scanFn();
      if (logManager) logManager.setVerbose(prevVerbose);
      console.log('Background scan completed');
    } catch (e) {
      console.error('Background scan failed:', e);
      if (logManager) logManager.setVerbose(prevVerbose);
    } finally {
      this.isRunning = false;
    }
  }

  async updateSettings(enabled, hours) {
    const settings = this.getSettings();
    const prev = { enabled: settings.enableBackgroundScan, hours: settings.backgroundScanHours };
    settings.enableBackgroundScan = enabled;
    settings.backgroundScanHours = hours;
    try {
      // Persist via settings manager if any external layer handles it (caller can persist).
      console.log(`Background scanning ${enabled ? 'enabled' : 'disabled'}${enabled ? `, frequency: ${hours} hours` : ''}`);
      this.start();
    } catch (e) {
      // revert
      settings.enableBackgroundScan = prev.enabled;
      settings.backgroundScanHours = prev.hours;
      console.error('Failed to update background scan settings', e);
    }
  }
}

window.BackgroundScanner = BackgroundScanner;
