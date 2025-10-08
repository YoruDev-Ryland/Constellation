// Cleanup Manager Module
// Handles rendering of cleanup view and deletion of selected folders.

class CleanupManager {
  constructor(options = {}) {
    this.getSettings = options.getSettings || (() => ({}));
    this.electronAPI = options.electronAPI || window.electronAPI;
    this.log = options.log || (() => { });
  }

  render() {
    const settings = this.getSettings();
    const container = document.getElementById('cleanupList');
    if (!container) return;

    if (!settings.cleanupFolders || settings.cleanupFolders.length === 0) {
      container.innerHTML = this._emptyConfiguredMessage();
      return;
    }

    // Real implementation: scan the storage path and match folder names
    const storagePath = settings.storagePath;
    if (!storagePath) {
      container.innerHTML = `<div class="cleanup-empty-state"><p>Storage path not configured. Open Settings to set your library path.</p></div>`;
      return;
    }

    container.innerHTML = `<div class="cleanup-loading"><span>Scanning for cleanup folders...</span></div>`;

    // Perform the scan asynchronously and render results
    this.electronAPI.scanDirectory(storagePath).then(files => {
      if (files && files.error) {
        container.innerHTML = `<div class="cleanup-empty-state"><p>Error scanning storage: ${files.error}</p></div>`;
        return;
      }

      // Group files by parent directory
      const filesByDirectory = new Map();
      files.forEach(file => {
        const lastSlash = Math.max(file.lastIndexOf('/'), file.lastIndexOf('\\'));
        const dir = lastSlash === -1 ? '' : file.substring(0, lastSlash);
        if (!filesByDirectory.has(dir)) filesByDirectory.set(dir, []);
        filesByDirectory.get(dir).push(file);
      });

      // Normalize cleanup tokens for matching
      const normalize = s => (s || '').toString().toLowerCase().replace(/[^a-z0-9]/g, '');
      const tokens = settings.cleanupFolders.map(t => normalize(t)).filter(Boolean);

      const candidates = [];
      for (const [dir, dirFiles] of filesByDirectory.entries()) {
        const parts = dir.split(/[/\\]/).filter(Boolean);
        const lastPart = parts.length ? parts[parts.length - 1] : '';
        const dirNorm = normalize(lastPart || dir);

        // Match if any token is contained in the directory name (or vice-versa)
        const matched = tokens.some(tok => {
          if (!tok) return false;
          return dirNorm === tok || (tok.length >= 3 && dirNorm.includes(tok)) || (dirNorm.length >= 3 && tok.includes(dirNorm));
        });

        if (matched) {
          candidates.push({ path: dir, fileCount: dirFiles.length });
        }
      }

      if (candidates.length === 0) {
        container.innerHTML = this._placeholderScanMessage();
        return;
      }

      // Render list
      const rows = candidates.map(c => `
        <div class="cleanup-row">
          <label><input type="checkbox" class="cleanup-checkbox" data-path="${c.path}"> ${c.path}</label>
          <div class="cleanup-meta">${c.fileCount} FITS files</div>
        </div>
      `).join('');

      // Render only the rows here. The global header buttons in index.html
      // will control refresh and deletion so we keep the module UI focused.
      container.innerHTML = `
        <div class="cleanup-rows">${rows}</div>
      `;

      // Wire the global header buttons (present in index.html)
      const mainDeleteBtn = document.getElementById('deleteSelectedBtn');
      const mainRefreshBtn = document.getElementById('cleanupRefreshBtn');

      // Helper to update Delete button enabled state based on checkbox selection
      const updateDeleteButtonState = () => {
        if (!mainDeleteBtn) return;
        const anyChecked = !!document.querySelectorAll('.cleanup-checkbox:checked').length;
        mainDeleteBtn.disabled = !anyChecked;
      };

      // Attach change listeners to checkboxes
      const checkboxes = container.querySelectorAll('.cleanup-checkbox');
      checkboxes.forEach(cb => cb.addEventListener('change', updateDeleteButtonState));

      // Make entire row clickable to toggle the checkbox (except when clicking the input/label directly)
      const rowElements = container.querySelectorAll('.cleanup-row');
      rowElements.forEach(row => {
        row.addEventListener('click', (e) => {
          // If the click originated from an input or label, let the default behavior handle it
          const tag = e.target && e.target.tagName ? e.target.tagName.toLowerCase() : '';
          if (tag === 'input' || tag === 'label' || e.target.closest('label')) return;

          const cb = row.querySelector('.cleanup-checkbox');
          if (!cb) return;
          cb.checked = !cb.checked;
          // Dispatch change event so other listeners (updateDeleteButtonState) run
          cb.dispatchEvent(new Event('change', { bubbles: true }));
        });
      });

      // Initial state
      updateDeleteButtonState();

      // Use onclick assignment and a data flag to avoid duplicate handlers
      if (mainRefreshBtn && !mainRefreshBtn.dataset.cleanupWired) {
        mainRefreshBtn.onclick = () => this.render();
        mainRefreshBtn.dataset.cleanupWired = '1';
      }
      if (mainDeleteBtn && !mainDeleteBtn.dataset.cleanupWired) {
        mainDeleteBtn.onclick = () => this.deleteSelected();
        mainDeleteBtn.dataset.cleanupWired = '1';
      }
    }).catch(err => {
      console.error('Cleanup scan failed', err);
      container.innerHTML = `<div class="cleanup-empty-state"><p>Scan failed: ${err && err.message ? err.message : err}</p></div>`;
    });
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
      <div class="cleanup-empty-state">
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor">
          <path d="M3 6h18M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2m3 0v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6h14z"/>
        </svg>
        <p>No cleanup folders configured. Add cleanup folder names in settings.</p>
      </div>`;
  }

  _placeholderScanMessage() {
    return `
      <div class="cleanup-empty-state">
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor">
          <path d="M3 6h18M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2m3 0v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6h14z"/>
        </svg>
        <p>No cleanup folders found. Run a scan to detect folders that can be cleaned.</p>
      </div>`;
  }
}

window.CleanupManager = CleanupManager;
