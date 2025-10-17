/**
 * Update Manager Module
 * Handles UI for app updates
 */

class UpdateManager {
  constructor() {
    this.updateInfo = null;
    this.isDownloading = false;
    this.notificationShown = false;
    this.init();
  }

  async init() {
    // Listen for updater messages from main process
    window.electronAPI.onUpdaterMessage((message) => {
      this.handleUpdaterMessage(message);
    });

    // Get current version and display
    const version = await window.electronAPI.getAppVersion();
    console.log('[UpdateManager] Current version:', version);
  }

  handleUpdaterMessage(message) {
    const { event, data } = message;
    console.log('[UpdateManager] Updater event:', event, data);

    switch (event) {
      case 'checking-for-update':
        console.log('[UpdateManager] Checking for updates...');
        break;

      case 'update-available':
        this.updateInfo = data;
        this.showUpdateAvailableNotification(data);
        break;

      case 'update-not-available':
        console.log('[UpdateManager] App is up to date');
        break;

      case 'download-progress':
        this.updateDownloadProgress(data);
        break;

      case 'update-downloaded':
        this.showUpdateReadyNotification(data);
        break;

      case 'error':
        this.showUpdateError(data);
        break;
    }
  }

  showUpdateAvailableNotification(data) {
    if (this.notificationShown) return;
    this.notificationShown = true;

    const notification = document.createElement('div');
    notification.className = 'update-notification update-available';
    notification.innerHTML = `
      <div class="update-icon">
        <i class="fas fa-download"></i>
      </div>
      <div class="update-content">
        <div class="update-title">Update Available</div>
        <div class="update-message">Version ${data.version} is now available</div>
      </div>
      <div class="update-actions">
        <button class="update-btn download-btn">
          <i class="fas fa-download"></i>
          Download
        </button>
        <button class="update-btn dismiss-btn">
          <i class="fas fa-times"></i>
        </button>
      </div>
    `;

    document.body.appendChild(notification);

    // Animate in
    setTimeout(() => notification.classList.add('show'), 10);

    // Download button
    notification.querySelector('.download-btn').addEventListener('click', async () => {
      await this.downloadUpdate();
      notification.querySelector('.download-btn').disabled = true;
      notification.querySelector('.download-btn').innerHTML = '<i class="fas fa-spinner fa-spin"></i> Downloading...';
    });

    // Dismiss button
    notification.querySelector('.dismiss-btn').addEventListener('click', () => {
      notification.classList.remove('show');
      setTimeout(() => notification.remove(), 300);
      this.notificationShown = false;
    });
  }

  async downloadUpdate() {
    this.isDownloading = true;
    const result = await window.electronAPI.downloadUpdate();
    if (!result.success) {
      console.error('[UpdateManager] Failed to download update:', result.error);
      this.showUpdateError({ message: result.error });
    }
  }

  updateDownloadProgress(data) {
    const notification = document.querySelector('.update-notification');
    if (!notification) return;

    const downloadBtn = notification.querySelector('.download-btn');
    if (downloadBtn) {
      downloadBtn.innerHTML = `
        <i class="fas fa-spinner fa-spin"></i>
        ${data.percent.toFixed(0)}%
      `;
    }
  }

  showUpdateReadyNotification(data) {
    // Remove existing notification
    const existing = document.querySelector('.update-notification');
    if (existing) existing.remove();

    const notification = document.createElement('div');
    notification.className = 'update-notification update-ready';
    notification.innerHTML = `
      <div class="update-icon ready">
        <i class="fas fa-check-circle"></i>
      </div>
      <div class="update-content">
        <div class="update-title">Update Ready</div>
        <div class="update-message">Restart to install version ${data.version}</div>
      </div>
      <div class="update-actions">
        <button class="update-btn restart-btn">
          <i class="fas fa-sync-alt"></i>
          Restart Now
        </button>
        <button class="update-btn later-btn">Later</button>
      </div>
    `;

    document.body.appendChild(notification);
    setTimeout(() => notification.classList.add('show'), 10);

    // Restart button
    notification.querySelector('.restart-btn').addEventListener('click', async () => {
      await window.electronAPI.installUpdate();
    });

    // Later button
    notification.querySelector('.later-btn').addEventListener('click', () => {
      notification.classList.remove('show');
      setTimeout(() => notification.remove(), 300);
    });

    this.isDownloading = false;
    this.notificationShown = false;
  }

  showUpdateError(data) {
    console.error('[UpdateManager] Update error:', data.message);
    
    const notification = document.querySelector('.update-notification');
    if (notification) {
      notification.classList.add('error');
      notification.querySelector('.update-content').innerHTML = `
        <div class="update-title">Update Failed</div>
        <div class="update-message">${data.message}</div>
      `;
    }

    this.isDownloading = false;
  }

  async checkForUpdates() {
    const result = await window.electronAPI.checkForUpdates();
    console.log('[UpdateManager] Update check result:', result);
    return result;
  }
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    window.updateManager = new UpdateManager();
  });
} else {
  window.updateManager = new UpdateManager();
}
