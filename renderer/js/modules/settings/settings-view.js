// Settings View Module
// Modular settings system that spawns into settingsView container
// Handles all application settings in a clean, organized interface

(function() {
  let instance = null;

  class SettingsView {
    constructor() {
      this.container = document.getElementById('settingsView');
      this.initialized = false;
      this.licenseManager = null;
      
      // Settings state
      this.settings = {
        storagePath: '',
        finalsPath: '',
        archivePath: '',
        cleanupFolders: [],
        ignoreFolders: [],
        enableBackgroundScan: true,
        backgroundScanHours: 4,
        observatoryLocation: {
          name: '',
          latitude: null,
          longitude: null,
          elevation: null
        },
        thirdPartyPrograms: {
          astroQC: ''
        }
      };
    }

    async init() {
      if (this.initialized) return;
      await this.loadSettings();
      this.render();
      this.setupEventListeners();
      this.initialized = true;
    }

    async loadSettings() {
      try {
        const saved = await window.electronAPI.getSettings();
        if (saved) {
          this.settings = {
            storagePath: saved.storagePath || '',
            finalsPath: saved.finalsPath || '',
            archivePath: saved.archivePath || '',
            cleanupFolders: saved.cleanupFolders || [],
            ignoreFolders: saved.ignoreFolders || [],
            enableBackgroundScan: saved.enableBackgroundScan !== false,
            backgroundScanHours: saved.backgroundScanHours || 4,
            observatoryLocation: {
              name: saved.observatoryLocation?.name || '',
              latitude: saved.observatoryLocation?.latitude || null,
              longitude: saved.observatoryLocation?.longitude || null,
              elevation: saved.observatoryLocation?.elevation || null
            },
            thirdPartyPrograms: {
              astroQC: saved.thirdPartyPrograms?.astroQC || ''
            }
          };
        }
      } catch (error) {
        console.error('[SettingsView] Failed to load settings:', error);
      }
    }

    async show() {
      if (!this.initialized) {
        await this.init();
      } else {
        this.render();
      }
    }

    hide() {
      if (this.container) this.container.innerHTML = '';
    }

    render() {
      if (!this.container) return;

      this.container.innerHTML = `
        <div class="settings-header">
          <div class="settings-title">
            <i class="fas fa-cog"></i>
            <h1>Settings</h1>
          </div>
          <button class="btn-secondary settings-close-btn" id="closeSettingsBtn">
            <i class="fas fa-times"></i>
            Close
          </button>
        </div>

        <div class="settings-content">
          ${this.renderSection('paths')}
          ${this.renderSection('cleanup')}
          ${this.renderSection('ignore')}
          ${this.renderSection('background')}
          ${this.renderSection('observatory')}
          ${this.renderSection('license')}
          ${this.renderSection('thirdparty')}
        </div>

        <div class="settings-footer">
          <button class="btn-primary" id="saveSettingsBtn">
            <i class="fas fa-check"></i>
            Save Settings
          </button>
        </div>
      `;
    }

    renderSection(section) {
      switch (section) {
        case 'paths':
          return `
            <div class="settings-section">
              <div class="section-header">
                <i class="fas fa-folder"></i>
                <h2>Storage Paths</h2>
              </div>
              <div class="section-content">
                <div class="form-group">
                  <label for="storagePath">Library Path *</label>
                  <p class="form-hint">Primary directory where your astrophotography images are stored</p>
                  <div class="input-group">
                    <input type="text" id="storagePath" value="${this.escapeHtml(this.settings.storagePath)}" placeholder="No folder selected" readonly>
                    <button class="btn-secondary" id="selectStorageBtn">
                      <i class="fas fa-folder-open"></i>
                      Browse
                    </button>
                  </div>
                </div>

                <div class="form-group">
                  <label for="finalsPath">Finals Folder</label>
                  <p class="form-hint">Location where your final processed images are stored (optional)</p>
                  <div class="input-group">
                    <input type="text" id="finalsPath" value="${this.escapeHtml(this.settings.finalsPath)}" placeholder="Optional - Leave empty to search within Library Path" readonly>
                    <button class="btn-secondary" id="selectFinalsBtn">
                      <i class="fas fa-folder-open"></i>
                      Browse
                    </button>
                    <button class="btn-secondary" id="clearFinalsBtn">Clear</button>
                  </div>
                </div>

                <div class="form-group">
                  <label for="archivePath">Archive/Completed Folder</label>
                  <p class="form-hint">Location to move completed projects for archival storage (optional)</p>
                  <div class="input-group">
                    <input type="text" id="archivePath" value="${this.escapeHtml(this.settings.archivePath)}" placeholder="Optional - Projects won't be moved when completed" readonly>
                    <button class="btn-secondary" id="selectArchiveBtn">
                      <i class="fas fa-folder-open"></i>
                      Browse
                    </button>
                    <button class="btn-secondary" id="clearArchiveBtn">Clear</button>
                  </div>
                </div>
              </div>
            </div>
          `;

        case 'cleanup':
          return `
            <div class="settings-section">
              <div class="section-header">
                <i class="fas fa-broom"></i>
                <h2>Cleanup Folders</h2>
              </div>
              <div class="section-content">
                <p class="form-hint">Folder names that contain temporary processing files safe for deletion</p>
                <div class="form-group">
                  <div class="input-group">
                    <input type="text" id="cleanupInput" placeholder="e.g., Process, Temp, Working">
                    <button class="btn-secondary" id="addCleanupBtn">
                      <i class="fas fa-plus"></i>
                      Add
                    </button>
                  </div>
                </div>
                <div class="tag-container" id="cleanupTags">
                  ${this.settings.cleanupFolders.map(folder => `
                    <span class="tag">
                      ${this.escapeHtml(folder)}
                      <button class="tag-remove" data-folder="${this.escapeHtml(folder)}" data-type="cleanup">
                        <i class="fas fa-times"></i>
                      </button>
                    </span>
                  `).join('')}
                </div>
              </div>
            </div>
          `;

        case 'ignore':
          return `
            <div class="settings-section">
              <div class="section-header">
                <i class="fas fa-eye-slash"></i>
                <h2>Ignore Folders</h2>
              </div>
              <div class="section-content">
                <p class="form-hint">Software and system folders to exclude from scans</p>
                <div class="form-group">
                  <div class="input-group">
                    <input type="text" id="ignoreInput" placeholder="e.g., PixInsight, Photoshop">
                    <button class="btn-secondary" id="addIgnoreBtn">
                      <i class="fas fa-plus"></i>
                      Add
                    </button>
                  </div>
                </div>
                <div class="tag-container" id="ignoreTags">
                  ${this.settings.ignoreFolders.map(folder => `
                    <span class="tag">
                      ${this.escapeHtml(folder)}
                      <button class="tag-remove" data-folder="${this.escapeHtml(folder)}" data-type="ignore">
                        <i class="fas fa-times"></i>
                      </button>
                    </span>
                  `).join('')}
                </div>
              </div>
            </div>
          `;

        case 'background':
          return `
            <div class="settings-section">
              <div class="section-header">
                <i class="fas fa-sync"></i>
                <h2>Background Scanning</h2>
              </div>
              <div class="section-content">
                <p class="form-hint">Automatically scan for new images and projects in the background</p>
                <div class="checkbox-group">
                  <input type="checkbox" id="enableBackgroundScan" ${this.settings.enableBackgroundScan ? 'checked' : ''}>
                  <label for="enableBackgroundScan">Enable automatic background scanning</label>
                </div>
                <div class="form-group" id="backgroundFrequencyGroup" style="${this.settings.enableBackgroundScan ? '' : 'display: none;'}">
                  <label for="backgroundScanHours">Scan frequency</label>
                  <select id="backgroundScanHours" class="form-select">
                    <option value="1" ${this.settings.backgroundScanHours === 1 ? 'selected' : ''}>Every hour</option>
                    <option value="2" ${this.settings.backgroundScanHours === 2 ? 'selected' : ''}>Every 2 hours</option>
                    <option value="4" ${this.settings.backgroundScanHours === 4 ? 'selected' : ''}>Every 4 hours</option>
                    <option value="8" ${this.settings.backgroundScanHours === 8 ? 'selected' : ''}>Every 8 hours</option>
                    <option value="24" ${this.settings.backgroundScanHours === 24 ? 'selected' : ''}>Once daily</option>
                  </select>
                </div>
              </div>
            </div>
          `;

        case 'observatory':
          return `
            <div class="settings-section">
              <div class="section-header">
                <i class="fas fa-map-marker-alt"></i>
                <h2>Observatory Location</h2>
              </div>
              <div class="section-content">
                <p class="form-hint">Set your observing location for accurate altitude calculations and target visibility</p>
                
                <div class="form-group">
                  <label for="observatoryName">Observatory Name (Optional)</label>
                  <input type="text" id="observatoryName" value="${this.escapeHtml(this.settings.observatoryLocation.name)}" placeholder="e.g., My Backyard Observatory">
                </div>

                <div class="observatory-presets">
                  <label>Quick Select Popular Remote Observatories:</label>
                  <div class="preset-buttons">
                    <button type="button" class="btn-secondary preset-btn" data-preset="sfro">
                      <div class="preset-name">SFRO</div>
                      <div class="preset-details">Starfront Remote Observatory<br>Texas, USA</div>
                    </button>
                    <button type="button" class="btn-secondary preset-btn" data-preset="udro">
                      <div class="preset-name">UDRO</div>
                      <div class="preset-details">Utah Desert Remote Observatory<br>Utah, USA</div>
                    </button>
                    <button type="button" class="btn-secondary preset-btn" data-preset="sl">
                      <div class="preset-name">Sierra-Leona</div>
                      <div class="preset-details">Sierra-Leona Observatory<br>Animas, NM, USA</div>
                    </button>
                    <button type="button" class="btn-secondary preset-btn" data-preset="tio">
                      <div class="preset-name">TIO</div>
                      <div class="preset-details">Telescope.io Observatory<br>Nerpio, Spain</div>
                    </button>
                  </div>
                </div>

                <div class="form-row">
                  <div class="form-group">
                    <label for="latitude">Latitude (°)</label>
                    <input type="number" id="latitude" value="${this.settings.observatoryLocation.latitude || ''}" placeholder="e.g., 36.463" step="0.000001" min="-90" max="90">
                  </div>
                  <div class="form-group">
                    <label for="longitude">Longitude (°)</label>
                    <input type="number" id="longitude" value="${this.settings.observatoryLocation.longitude || ''}" placeholder="e.g., -105.821" step="0.000001" min="-180" max="180">
                  </div>
                  <div class="form-group">
                    <label for="elevation">Elevation (m)</label>
                    <input type="number" id="elevation" value="${this.settings.observatoryLocation.elevation || ''}" placeholder="e.g., 2100" step="1" min="0" max="10000">
                  </div>
                </div>
              </div>
            </div>
          `;

        case 'license':
          // Check license status
          const licenseManager = typeof ensureLicenseManager === 'function' ? ensureLicenseManager() : null;
          const hasLicense = licenseManager ? licenseManager.isPremium : false;
          return `
            <div class="settings-section">
              <div class="section-header">
                <i class="fas fa-key"></i>
                <h2>Premium License</h2>
              </div>
              <div class="section-content">
                <p class="form-hint">Unlock advanced features with a premium license key</p>
                
                <div id="licenseStatus" class="license-status ${hasLicense ? 'premium' : 'free'}">
                  ${hasLicense ? '✓ Premium version - All features unlocked' : 'Free version - Limited features'}
                </div>

                <div class="form-group" id="licenseActions" style="${hasLicense ? 'display: none;' : ''}">
                  <label for="licenseKeyInput">License Key</label>
                  <div class="input-group">
                    <input type="text" id="licenseKeyInput" placeholder="CONST-XXXXX-XXXXX-XXXXX-XXXXX" maxlength="29">
                    <button class="btn-success" id="activateLicenseBtn" disabled>Activate</button>
                  </div>
                </div>

                <button class="btn-danger" id="deactivateLicenseBtn" style="${hasLicense ? '' : 'display: none;'}">
                  Deactivate License
                </button>
              </div>
            </div>
          `;

        case 'thirdparty':
          return `
            <div class="settings-section">
              <div class="section-header">
                <i class="fas fa-puzzle-piece"></i>
                <h2>Third Party Programs</h2>
              </div>
              <div class="section-content">
                <p class="form-hint">Configure paths to external tools and programs that Constellation can launch</p>
                
                <div class="form-group">
                  <label for="astroQCPath">AstroQC Sub-Frame Analyzer</label>
                  <div class="input-group">
                    <input type="text" id="astroQCPath" value="${this.escapeHtml(this.settings.thirdPartyPrograms.astroQC)}" placeholder="Path to AstroQC executable" readonly>
                    <button class="btn-secondary" id="browseAstroQCBtn">
                      <i class="fas fa-folder-open"></i>
                      Browse
                    </button>
                  </div>
                  <p class="form-hint-small">Select the path to your AstroQC sub-frame quality analyzer program</p>
                </div>

                <div class="form-group">
                  <button class="btn-primary" id="testAstroQCBtn" ${this.settings.thirdPartyPrograms.astroQC ? '' : 'disabled'}>
                    <i class="fas fa-play"></i>
                    Test AstroQC Launch
                  </button>
                </div>
              </div>
            </div>
          `;

        default:
          return '';
      }
    }

    setupEventListeners() {
      // Close button
      const closeBtn = this.container.querySelector('#closeSettingsBtn');
      if (closeBtn) {
        closeBtn.addEventListener('click', () => {
          if (typeof switchView === 'function') {
            switchView('library');
          }
        });
      }

      // Save button
      const saveBtn = this.container.querySelector('#saveSettingsBtn');
      if (saveBtn) {
        saveBtn.addEventListener('click', () => this.saveSettings());
      }

      // Storage paths
      this.setupPathHandlers();
      
      // Cleanup folders
      this.setupCleanupHandlers();
      
      // Ignore folders
      this.setupIgnoreHandlers();
      
      // Background scanning
      this.setupBackgroundScanHandlers();
      
      // Observatory
      this.setupObservatoryHandlers();
      
      // License
      this.setupLicenseHandlers();
      
      // Third party
      this.setupThirdPartyHandlers();
    }

    setupPathHandlers() {
      const selectStorage = this.container.querySelector('#selectStorageBtn');
      const selectFinals = this.container.querySelector('#selectFinalsBtn');
      const clearFinals = this.container.querySelector('#clearFinalsBtn');
      const selectArchive = this.container.querySelector('#selectArchiveBtn');
      const clearArchive = this.container.querySelector('#clearArchiveBtn');

      if (selectStorage) {
        selectStorage.addEventListener('click', async () => {
          const path = await window.electronAPI.selectDirectory();
          if (path) {
            this.settings.storagePath = path;
            this.container.querySelector('#storagePath').value = path;
          }
        });
      }

      if (selectFinals) {
        selectFinals.addEventListener('click', async () => {
          const path = await window.electronAPI.selectDirectory();
          if (path) {
            this.settings.finalsPath = path;
            this.container.querySelector('#finalsPath').value = path;
          }
        });
      }

      if (clearFinals) {
        clearFinals.addEventListener('click', () => {
          this.settings.finalsPath = '';
          this.container.querySelector('#finalsPath').value = '';
        });
      }

      if (selectArchive) {
        selectArchive.addEventListener('click', async () => {
          const path = await window.electronAPI.selectDirectory();
          if (path) {
            this.settings.archivePath = path;
            this.container.querySelector('#archivePath').value = path;
          }
        });
      }

      if (clearArchive) {
        clearArchive.addEventListener('click', () => {
          this.settings.archivePath = '';
          this.container.querySelector('#archivePath').value = '';
        });
      }
    }

    setupCleanupHandlers() {
      const input = this.container.querySelector('#cleanupInput');
      const addBtn = this.container.querySelector('#addCleanupBtn');

      const addFolder = () => {
        const folder = input.value.trim();
        if (folder && !this.settings.cleanupFolders.includes(folder)) {
          this.settings.cleanupFolders.push(folder);
          input.value = '';
          this.updateTagDisplay('cleanup');
        }
      };

      if (addBtn) {
        addBtn.addEventListener('click', addFolder);
      }

      if (input) {
        input.addEventListener('keypress', (e) => {
          if (e.key === 'Enter') addFolder();
        });
      }

      // Remove handlers
      this.container.addEventListener('click', (e) => {
        if (e.target.closest('.tag-remove[data-type="cleanup"]')) {
          const folder = e.target.closest('.tag-remove').dataset.folder;
          this.settings.cleanupFolders = this.settings.cleanupFolders.filter(f => f !== folder);
          this.updateTagDisplay('cleanup');
        }
      });
    }

    setupIgnoreHandlers() {
      const input = this.container.querySelector('#ignoreInput');
      const addBtn = this.container.querySelector('#addIgnoreBtn');

      const addFolder = () => {
        const folder = input.value.trim();
        if (folder && !this.settings.ignoreFolders.includes(folder)) {
          this.settings.ignoreFolders.push(folder);
          input.value = '';
          this.updateTagDisplay('ignore');
        }
      };

      if (addBtn) {
        addBtn.addEventListener('click', addFolder);
      }

      if (input) {
        input.addEventListener('keypress', (e) => {
          if (e.key === 'Enter') addFolder();
        });
      }

      // Remove handlers
      this.container.addEventListener('click', (e) => {
        if (e.target.closest('.tag-remove[data-type="ignore"]')) {
          const folder = e.target.closest('.tag-remove').dataset.folder;
          this.settings.ignoreFolders = this.settings.ignoreFolders.filter(f => f !== folder);
          this.updateTagDisplay('ignore');
        }
      });
    }

    setupBackgroundScanHandlers() {
      const checkbox = this.container.querySelector('#enableBackgroundScan');
      const frequencyGroup = this.container.querySelector('#backgroundFrequencyGroup');
      const select = this.container.querySelector('#backgroundScanHours');

      if (checkbox) {
        checkbox.addEventListener('change', () => {
          this.settings.enableBackgroundScan = checkbox.checked;
          if (frequencyGroup) {
            frequencyGroup.style.display = checkbox.checked ? '' : 'none';
          }
        });
      }

      if (select) {
        select.addEventListener('change', () => {
          this.settings.backgroundScanHours = parseInt(select.value);
        });
      }
    }

    setupObservatoryHandlers() {
      const nameInput = this.container.querySelector('#observatoryName');
      const latInput = this.container.querySelector('#latitude');
      const lonInput = this.container.querySelector('#longitude');
      const elevInput = this.container.querySelector('#elevation');

      const updateLocation = () => {
        this.settings.observatoryLocation = {
          name: nameInput?.value || '',
          latitude: latInput?.value ? parseFloat(latInput.value) : null,
          longitude: lonInput?.value ? parseFloat(lonInput.value) : null,
          elevation: elevInput?.value ? parseInt(elevInput.value) : null
        };
      };

      [nameInput, latInput, lonInput, elevInput].forEach(input => {
        if (input) input.addEventListener('input', updateLocation);
      });

      // Preset buttons
      const presetButtons = this.container.querySelectorAll('.preset-btn');
      presetButtons.forEach(btn => {
        btn.addEventListener('click', () => {
          const preset = btn.dataset.preset;
          this.applyObservatoryPreset(preset);
        });
      });
    }

    applyObservatoryPreset(preset) {
      const presets = {
        sfro: { name: 'Starfront Remote Observatory', lat: 31.6803, lon: -110.8791, elev: 1435 },
        udro: { name: 'Utah Desert Remote Observatory', lat: 38.9478, lon: -113.6856, elev: 1585 },
        sl: { name: 'Sierra-Leona Observatory', lat: 31.4363, lon: -108.9336, elev: 1372 },
        tio: { name: 'Telescope.io Observatory', lat: 38.1500, lon: -2.1667, elev: 1300 }
      };

      const data = presets[preset];
      if (data) {
        this.settings.observatoryLocation = {
          name: data.name,
          latitude: data.lat,
          longitude: data.lon,
          elevation: data.elev
        };

        // Update inputs
        const nameInput = this.container.querySelector('#observatoryName');
        const latInput = this.container.querySelector('#latitude');
        const lonInput = this.container.querySelector('#longitude');
        const elevInput = this.container.querySelector('#elevation');

        if (nameInput) nameInput.value = data.name;
        if (latInput) latInput.value = data.lat;
        if (lonInput) lonInput.value = data.lon;
        if (elevInput) elevInput.value = data.elev;
      }
    }

    setupLicenseHandlers() {
      const input = this.container.querySelector('#licenseKeyInput');
      const activateBtn = this.container.querySelector('#activateLicenseBtn');
      const deactivateBtn = this.container.querySelector('#deactivateLicenseBtn');

      if (input && activateBtn) {
        input.addEventListener('input', () => {
          activateBtn.disabled = !input.value.trim();
        });

        activateBtn.addEventListener('click', async () => {
          const key = input.value.trim();
          const licenseManager = typeof ensureLicenseManager === 'function' ? ensureLicenseManager() : null;
          if (!licenseManager) return;

          try {
            const result = await licenseManager.activateLicense(key);
            if (result.success) {
              if (window.showAlert) {
                await window.showAlert('License Activated', 'Your premium license has been activated successfully!', 'success');
              }
              this.render();
              this.setupEventListeners();
            } else {
              if (window.showAlert) {
                await window.showAlert('Activation Failed', result.error || 'Invalid license key', 'error');
              }
            }
          } catch (error) {
            console.error('[SettingsView] License activation error:', error);
            if (window.showAlert) {
              await window.showAlert('Activation Error', 'An error occurred while activating the license.', 'error');
            }
          }
        });
      }

      if (deactivateBtn) {
        deactivateBtn.addEventListener('click', async () => {
          const licenseManager = typeof ensureLicenseManager === 'function' ? ensureLicenseManager() : null;
          if (!licenseManager) return;

          const confirmed = window.showConfirm 
            ? await window.showConfirm('Deactivate License', 'Are you sure you want to deactivate your premium license?', 'warning')
            : confirm('Are you sure you want to deactivate your premium license?');

          if (confirmed) {
            await licenseManager.deactivateLicense();
            if (window.showAlert) {
              await window.showAlert('License Deactivated', 'Your license has been deactivated.', 'info');
            }
            this.render();
            this.setupEventListeners();
          }
        });
      }
    }

    setupThirdPartyHandlers() {
      const browseBtn = this.container.querySelector('#browseAstroQCBtn');
      const testBtn = this.container.querySelector('#testAstroQCBtn');
      const pathInput = this.container.querySelector('#astroQCPath');

      if (browseBtn) {
        browseBtn.addEventListener('click', async () => {
          const path = await window.electronAPI.selectFile({
            filters: [
              { name: 'Executables', extensions: ['exe', 'app', 'AppImage', ''] },
              { name: 'All Files', extensions: ['*'] }
            ]
          });

          if (path) {
            this.settings.thirdPartyPrograms.astroQC = path;
            if (pathInput) pathInput.value = path;
            if (testBtn) testBtn.disabled = false;
          }
        });
      }

      if (testBtn) {
        testBtn.addEventListener('click', async () => {
          try {
            await window.electronAPI.launchAstroQC();
            if (window.showAlert) {
              await window.showAlert('Success', 'AstroQC launched successfully!', 'success');
            }
          } catch (error) {
            console.error('[SettingsView] AstroQC launch error:', error);
            if (window.showAlert) {
              await window.showAlert('Launch Failed', 'Failed to launch AstroQC. Please check the path.', 'error');
            }
          }
        });
      }
    }

    updateTagDisplay(type) {
      const container = this.container.querySelector(`#${type}Tags`);
      if (!container) return;

      const folders = type === 'cleanup' ? this.settings.cleanupFolders : this.settings.ignoreFolders;
      container.innerHTML = folders.map(folder => `
        <span class="tag">
          ${this.escapeHtml(folder)}
          <button class="tag-remove" data-folder="${this.escapeHtml(folder)}" data-type="${type}">
            <i class="fas fa-times"></i>
          </button>
        </span>
      `).join('');
    }

    async saveSettings() {
      try {
        // Validate required fields
        if (!this.settings.storagePath) {
          if (window.showAlert) {
            await window.showAlert('Missing Required Field', 'Please select a Library Path before saving.', 'warning');
          }
          return;
        }

        // Save to electron
        await window.electronAPI.saveSettings(this.settings);

        // Notify success
        if (window.showAlert) {
          await window.showAlert('Settings Saved', 'Your settings have been saved successfully!', 'success');
        }

        // If first run, switch to library view
        if (typeof switchView === 'function') {
          switchView('library');
        }
      } catch (error) {
        console.error('[SettingsView] Failed to save settings:', error);
        if (window.showAlert) {
          await window.showAlert('Save Failed', 'Failed to save settings. Please try again.', 'error');
        }
      }
    }

    escapeHtml(text) {
      if (!text) return '';
      const div = document.createElement('div');
      div.textContent = text;
      return div.innerHTML;
    }
  }

  // Export singleton instance
  window.ensureSettingsView = function() {
    if (!instance) {
      instance = new SettingsView();
    }
    return instance;
  };
})();
