// Cleanup Manager Module
// Handles rendering of cleanup view and deletion of selected folders.

class CleanupManager {
  constructor(options = {}) {
    this.getSettings = options.getSettings || (() => ({}));
    this.electronAPI = options.electronAPI || window.electronAPI;
    this.log = options.log || (() => {});
  }

  render() {
    const settings = this.getSettings();
    const container = document.getElementById('cleanupList');
    if (!container) return;

    if (!settings.cleanupFolders || settings.cleanupFolders.length === 0) {
      container.innerHTML = this._emptyConfiguredMessage();
      return;
    }

    // Placeholder: real implementation would scan the storage path and match folder names
    container.innerHTML = this._placeholderScanMessage();
  }

  async deleteSelected() {
    const checkboxes = document.querySelectorAll('.cleanup-checkbox:checked');
    if (checkboxes.length === 0) return;

    if (!confirm(`Delete ${checkboxes.length} folder(s)? This cannot be undone.`)) return;

    for (const cb of checkboxes) {
      const path = cb.dataset.path;
      try {
        await this.electronAPI.deleteFolder(path);
        this.log(`Deleted cleanup folder: ${path}`);
      } catch (e) {
        console.error('Failed to delete folder', path, e);
      }
    }
    this.render();
  }

  _emptyConfiguredMessage() {
    return `
      <div class="empty-state">
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor">
          <path d="M3 6h18M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2m3 0v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6h14z"/>
        </svg>
        <p>No cleanup folders configured. Add cleanup folder names in settings.</p>
      </div>`;
  }

  _placeholderScanMessage() {
    return `
      <div class="empty-state">
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor">
          <path d="M3 6h18M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2m3 0v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6h14z"/>
        </svg>
        <p>No cleanup folders found. Run a scan to detect folders that can be cleaned.</p>
      </div>`;
  }
}

window.CleanupManager = CleanupManager;
