// Setup Page Logic - Guard against multiple loads
if (typeof window.setupModuleLoaded === 'undefined') {
  window.setupModuleLoaded = true;

// Setup Page Variables
let storagePath = '';
let finalsPath = '';
let archivePath = '';
let cleanupFolders = [];
let ignoreFolders = [];
let enableBackgroundScan = true;
let backgroundScanHours = 4;
let licenseManager = null;
let observatoryLocation = {
  name: '',
  latitude: null,
  longitude: null,
  elevation: null
};
let thirdPartyPrograms = {
  astroQC: ''
};

// DOM elements - will be initialized when setupModalInit is called
let storageInput, selectStorageBtn, finalsInput, selectFinalsBtn, clearFinalsBtn;
let archiveInput, selectArchiveBtn, clearArchiveBtn;
let cleanupInput, addCleanupBtn, cleanupTagsContainer;
let ignoreInput, addIgnoreBtn, ignoreTagsContainer, licenseKeyInput, activateLicenseBtn;
let deactivateLicenseBtn, licenseStatus, licenseActions, enableBackgroundScanCheckbox;
let backgroundScanHoursSelect, backgroundFrequencyGroup, completeSetupBtn;
let observatoryNameInput, latitudeInput, longitudeInput, elevationInput;
let astroQCPathInput, browseAstroQCBtn, testAstroQCBtn;

// Initialize setup modal - call this when the modal content is loaded
window.setupModalInit = function setupModalInit() {
  // Get DOM elements
  storageInput = document.getElementById('storagePath');
  selectStorageBtn = document.getElementById('selectStorageBtn');
  finalsInput = document.getElementById('finalsPath');
  selectFinalsBtn = document.getElementById('selectFinalsBtn');
  clearFinalsBtn = document.getElementById('clearFinalsBtn');
  archiveInput = document.getElementById('archivePath');
  selectArchiveBtn = document.getElementById('selectArchiveBtn');
  clearArchiveBtn = document.getElementById('clearArchiveBtn');
  cleanupInput = document.getElementById('cleanupInput');
  addCleanupBtn = document.getElementById('addCleanupBtn');
  cleanupTagsContainer = document.getElementById('cleanupTags');
  ignoreInput = document.getElementById('ignoreInput');
  addIgnoreBtn = document.getElementById('addIgnoreBtn');
  ignoreTagsContainer = document.getElementById('ignoreTags');
  licenseKeyInput = document.getElementById('licenseKeyInput');
  activateLicenseBtn = document.getElementById('activateLicenseBtn');
  deactivateLicenseBtn = document.getElementById('deactivateLicenseBtn');
  licenseStatus = document.getElementById('licenseStatus');
  licenseActions = document.getElementById('licenseActions');
  enableBackgroundScanCheckbox = document.getElementById('enableBackgroundScan');
  backgroundScanHoursSelect = document.getElementById('backgroundScanHours');
  backgroundFrequencyGroup = document.getElementById('backgroundFrequencyGroup');
  completeSetupBtn = document.getElementById('completeSetupBtn');
  observatoryNameInput = document.getElementById('observatoryName');
  latitudeInput = document.getElementById('latitude');
  longitudeInput = document.getElementById('longitude');
  elevationInput = document.getElementById('elevation');
  astroQCPathInput = document.getElementById('astroQCPath');
  browseAstroQCBtn = document.getElementById('browseAstroQCBtn');
  testAstroQCBtn = document.getElementById('testAstroQCBtn');

  // Add event listeners only if elements exist
  if (selectStorageBtn) {
    selectStorageBtn.addEventListener('click', async () => {
      const path = await window.electronAPI.selectDirectory();
      if (path) {
        storagePath = path;
        storageInput.value = path;
        validateSetup();
      }
    });
  }

  if (selectFinalsBtn) {
    selectFinalsBtn.addEventListener('click', async () => {
      const path = await window.electronAPI.selectDirectory();
      if (path) {
        finalsPath = path;
        finalsInput.value = path;
      }
    });
  }

  if (clearFinalsBtn) {
    clearFinalsBtn.addEventListener('click', () => {
      finalsPath = '';
      finalsInput.value = '';
    });
  }

  if (selectArchiveBtn) {
    selectArchiveBtn.addEventListener('click', async () => {
      const path = await window.electronAPI.selectDirectory();
      if (path) {
        archivePath = path;
        archiveInput.value = path;
      }
    });
  }

  if (clearArchiveBtn) {
    clearArchiveBtn.addEventListener('click', () => {
      archivePath = '';
      archiveInput.value = '';
    });
  }

  if (addCleanupBtn) {
    addCleanupBtn.addEventListener('click', addCleanupFolder);
  }

  if (cleanupInput) {
    cleanupInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        addCleanupFolder();
      }
    });
  }

  if (addIgnoreBtn) {
    addIgnoreBtn.addEventListener('click', addIgnoreFolder);
  }

  if (ignoreInput) {
    ignoreInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        addIgnoreFolder();
      }
    });
  }

  if (activateLicenseBtn) {
    activateLicenseBtn.addEventListener('click', activateLicense);
  }

  if (deactivateLicenseBtn) {
    deactivateLicenseBtn.addEventListener('click', deactivateLicense);
  }

  if (licenseKeyInput) {
    licenseKeyInput.addEventListener('input', onLicenseKeyInput);
  }

  if (enableBackgroundScanCheckbox) {
    enableBackgroundScanCheckbox.addEventListener('change', toggleBackgroundScan);
  }

  if (backgroundScanHoursSelect) {
    backgroundScanHoursSelect.addEventListener('change', updateBackgroundScanHours);
  }

  if (completeSetupBtn) {
    completeSetupBtn.addEventListener('click', completeSetup);
  }

  // Add event listeners for observatory location
  if (observatoryNameInput) {
    observatoryNameInput.addEventListener('input', updateObservatoryLocation);
  }
  if (latitudeInput) {
    latitudeInput.addEventListener('input', updateObservatoryLocation);
  }
  if (longitudeInput) {
    longitudeInput.addEventListener('input', updateObservatoryLocation);
  }
  if (elevationInput) {
    elevationInput.addEventListener('input', updateObservatoryLocation);
  }

  // Add event listeners for preset buttons
  const presetButtons = document.querySelectorAll('.preset-btn');
  presetButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      const preset = btn.getAttribute('data-preset');
      applyObservatoryPreset(preset);
    });
  });

  // Add event listeners for third-party programs
  if (browseAstroQCBtn) {
    browseAstroQCBtn.addEventListener('click', browseAstroQC);
  }

  if (testAstroQCBtn) {
    testAstroQCBtn.addEventListener('click', testAstroQC);
  }

  // Initialize the setup form
  if (typeof window.initializeSetupForm === 'function') {
    window.initializeSetupForm();
  } else if (typeof initializeSetupForm === 'function') {
    initializeSetupForm();
  }
}

// Add cleanup folder
function addCleanupFolder() {
  const value = cleanupInput && cleanupInput.value.trim();
  if (value && !cleanupFolders.includes(value)) {
    cleanupFolders.push(value);
    renderCleanupTags();
    if (cleanupInput) cleanupInput.value = '';
  }
}

// Add ignore folder
function addIgnoreFolder() {
  const value = ignoreInput && ignoreInput.value.trim();
  if (value && !ignoreFolders.includes(value)) {
    ignoreFolders.push(value);
    renderIgnoreTags();
    if (ignoreInput) ignoreInput.value = '';
  }
}

// Helper functions for event handlers
function toggleBackgroundScan(e) {
  enableBackgroundScan = e.target.checked;
  if (backgroundFrequencyGroup) {
    backgroundFrequencyGroup.style.display = enableBackgroundScan ? 'block' : 'none';
  }
}

function updateBackgroundScanHours(e) {
  backgroundScanHours = parseInt(e.target.value);
}

function onLicenseKeyInput(e) {
  const value = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
  const formatted = licenseManager ? licenseManager.formatKey(value) : formatLicenseKeyString(value);
  e.target.value = formatted;
  
  // Enable/disable activate button based on format
  const isValid = licenseManager ? licenseManager.validateKeyFormat(formatted) : validateLicenseFormat(formatted);
  if (activateLicenseBtn) {
    activateLicenseBtn.disabled = !isValid;
  }
}

function formatLicenseKeyString(value) {
  // Format as XXXXX-XXXXX-XXXXX-XXXXX-XXXXX
  return value.replace(/(.{4})/g, '$1-').slice(0, 19);
}

// Observatory location functions
function updateObservatoryLocation() {
  observatoryLocation = {
    name: observatoryNameInput ? observatoryNameInput.value.trim() : '',
    latitude: latitudeInput ? parseFloat(latitudeInput.value) || null : null,
    longitude: longitudeInput ? parseFloat(longitudeInput.value) || null : null,
    elevation: elevationInput ? parseFloat(elevationInput.value) || null : null
  };
}

function applyObservatoryPreset(preset) {
  const presets = {
    sfro: {
      name: 'Starfront Remote Observatory',
      latitude: 31.547222,
      longitude: -99.381667,
      elevation: 472
    },
    udro: {
      name: 'Utah Desert Remote Observatory',
      latitude: 38.343,
      longitude: -113.688,
      elevation: 1680
    },
    sl: {
      name: 'Sierra-Leona Observatory',
      latitude: 31.956,
      longitude: -108.199,
      elevation: 1430
    },
    tio: {
      name: 'Telescope.io Observatory',
      latitude: 38.133,
      longitude: -2.367,
      elevation: 1650
    }
  };

  const selectedPreset = presets[preset];
  if (selectedPreset) {
    if (observatoryNameInput) observatoryNameInput.value = selectedPreset.name;
    if (latitudeInput) latitudeInput.value = selectedPreset.latitude;
    if (longitudeInput) longitudeInput.value = selectedPreset.longitude;
    if (elevationInput) elevationInput.value = selectedPreset.elevation;
    
    updateObservatoryLocation();
  }
}

// Initialize the setup form (load settings and render UI)
window.initializeSetupForm = async function initializeSetupForm() {
  try {
    await loadExistingSettings();
    renderCleanupTags();
    renderIgnoreTags();
  } catch (err) {
    console.error('Failed to initialize setup form:', err);
  }
}

// License management functions
async function initializeLicenseManager() {
  // Wait for LicenseManager to be available
  let attempts = 0;
  while (!window.LicenseManager && attempts < 50) {
    await new Promise(resolve => setTimeout(resolve, 100));
    attempts++;
  }
  
  if (!window.LicenseManager) {
    console.error('LicenseManager not available after timeout');
    return;
  }
  
  licenseManager = new window.LicenseManager(window.electronAPI, {
    log: (msg, data) => console.log('[License]', msg, data || '')
  });
  
  try {
    await licenseManager.initialize();
    updateLicenseUI();
  } catch (error) {
    console.error('License manager initialization failed:', error);
  }
}

// Removed legacy formatLicenseKey(key) to avoid name collisions

function validateLicenseFormat(key) {
  return /^CONST-[A-Z0-9]{5}-[A-Z0-9]{5}-[A-Z0-9]{5}-[A-Z0-9]{5}$/.test(key);
}

async function activateLicense() {
  if (!licenseManager) {
    await initializeLicenseManager();
    if (!licenseManager) return;
  }
  
  const licenseKey = licenseKeyInput.value.trim();
  if (!licenseKey) return;
  
  // Show loading state
  activateLicenseBtn.disabled = true;
  activateLicenseBtn.textContent = 'Activating...';
  updateLicenseStatus('Validating license key...', 'warning');
  
  try {
    const result = await licenseManager.activateLicense(licenseKey);
    
    if (result.success) {
      updateLicenseStatus('License activated successfully!', 'success');
      licenseKeyInput.value = licenseManager.maskLicenseKey(licenseKey);
      licenseKeyInput.disabled = true;
      activateLicenseBtn.style.display = 'none';
      licenseActions.style.display = 'block';
    } else {
      updateLicenseStatus(result.error || 'License activation failed', 'error');
    }
  } catch (error) {
    updateLicenseStatus(`Activation error: ${error.message}`, 'error');
  } finally {
    activateLicenseBtn.disabled = false;
    activateLicenseBtn.textContent = 'Activate';
  }
}

async function deactivateLicense() {
  if (!licenseManager) return;
  
  try {
    const result = await licenseManager.deactivateLicense();
    
    if (result.success) {
      licenseKeyInput.value = '';
      licenseKeyInput.disabled = false;
      activateLicenseBtn.style.display = 'inline-block';
      licenseActions.style.display = 'none';
      updateLicenseStatus('Enter your license key to activate premium features', 'info');
    } else {
      updateLicenseStatus(result.error || 'Deactivation failed', 'error');
    }
  } catch (error) {
    updateLicenseStatus(`Deactivation error: ${error.message}`, 'error');
  }
}

function updateLicenseStatus(message, type = 'info') {
  if (!licenseStatus) return;
  const statusClass = {
    success: 'premium',
    warning: 'trial',
    error: 'free',
    info: 'free'
  }[type] || 'free';
  licenseStatus.className = `license-status ${statusClass}`;
  licenseStatus.textContent = message;
}

function updateLicenseUI() {
  if (!licenseManager) return;
  
  const status = licenseManager.getStatus();
  
  if (status.hasLicense && status.isPremium) {
    if (licenseKeyInput) {
      licenseKeyInput.value = status.licenseKey;
      licenseKeyInput.disabled = true;
    }
    if (activateLicenseBtn) activateLicenseBtn.style.display = 'none';
    if (deactivateLicenseBtn) deactivateLicenseBtn.style.display = 'inline-flex';
    updateLicenseStatus('Premium license active - All features unlocked', 'success');
  } else if (status.hasLicense && !status.isPremium) {
    if (licenseKeyInput) licenseKeyInput.value = status.licenseKey;
    updateLicenseStatus('License validation failed - please check connection', 'warning');
  } else {
    if (licenseKeyInput) licenseKeyInput.disabled = false;
    if (activateLicenseBtn) activateLicenseBtn.style.display = 'inline-flex';
    if (deactivateLicenseBtn) deactivateLicenseBtn.style.display = 'none';
    updateLicenseStatus('Free version - Enter license key to unlock premium features', 'info');
  }
}

// Render cleanup tags
function renderCleanupTags() {
  if (!cleanupTagsContainer) return;
  cleanupTagsContainer.innerHTML = cleanupFolders.map(folder => `
    <span class="tag">
      ${folder}
      <button class="remove-tag" onclick="removeCleanupFolder('${folder}')" title="Remove">×</button>
    </span>
  `).join('');
}

// Render ignore tags
function renderIgnoreTags() {
  if (!ignoreTagsContainer) return;
  ignoreTagsContainer.innerHTML = ignoreFolders.map(folder => `
    <span class="tag">
      ${folder}
      <button class="remove-tag" onclick="removeIgnoreFolder('${folder}')" title="Remove">×</button>
    </span>
  `).join('');
}

// Remove cleanup folder
window.removeCleanupFolder = (folder) => {
  cleanupFolders = cleanupFolders.filter(f => f !== folder);
  renderCleanupTags();
};

// Remove ignore folder
window.removeIgnoreFolder = (folder) => {
  ignoreFolders = ignoreFolders.filter(f => f !== folder);
  renderIgnoreTags();
};

// Validate setup
function validateSetup() {
  completeSetupBtn.disabled = !storagePath;
}

// Initialize existing settings if they exist
async function loadExistingSettings() {
  try {
    const settings = await window.electronAPI.getSettings();
    if (settings.storagePath) {
      storagePath = settings.storagePath;
      storageInput.value = storagePath;
    }
    if (settings.finalsPath) {
      finalsPath = settings.finalsPath;
      if (finalsInput) finalsInput.value = finalsPath;
    }
    if (settings.archivePath) {
      archivePath = settings.archivePath;
      if (archiveInput) archiveInput.value = archivePath;
    }
    if (settings.cleanupFolders) {
      cleanupFolders = settings.cleanupFolders;
    }
    if (settings.ignoreFolders) {
      ignoreFolders = settings.ignoreFolders;
    }
    if (settings.enableBackgroundScan !== undefined) {
      enableBackgroundScan = settings.enableBackgroundScan;
      enableBackgroundScanCheckbox.checked = enableBackgroundScan;
    }
    if (settings.backgroundScanHours) {
      backgroundScanHours = settings.backgroundScanHours;
      backgroundScanHoursSelect.value = backgroundScanHours;
    }
    // Load third-party program paths
    if (settings.thirdPartyPrograms) {
      thirdPartyPrograms = settings.thirdPartyPrograms;
      if (astroQCPathInput) astroQCPathInput.value = thirdPartyPrograms.astroQC || '';
      updateTestAstroQCButton();
    }

    // Load other settings
    if (settings.observatoryLocation) {
      observatoryLocation = settings.observatoryLocation;
      if (observatoryNameInput) observatoryNameInput.value = observatoryLocation.name || '';
      if (latitudeInput) latitudeInput.value = observatoryLocation.latitude || '';
      if (longitudeInput) longitudeInput.value = observatoryLocation.longitude || '';
      if (elevationInput) elevationInput.value = observatoryLocation.elevation || '';
    }
    
    // Update frequency group visibility
  if (backgroundFrequencyGroup) backgroundFrequencyGroup.style.display = enableBackgroundScan ? 'block' : 'none';
    
    renderCleanupTags();
    renderIgnoreTags();
    
    // Initialize license manager
    await initializeLicenseManager();
    
    validateSetup();
  } catch (error) {
    console.error('Error loading existing settings:', error);
  }
}

// Complete setup function
async function completeSetup() {
  try {
    const currentSettings = await window.electronAPI.getSettings();
    
    const settings = {
      ...currentSettings, // Preserve existing settings including license data
      storagePath,
      finalsPath,
      archivePath,
      cleanupFolders,
      ignoreFolders,
      enableBackgroundScan,
      backgroundScanHours,
      observatoryLocation,
      thirdPartyPrograms,
      setupCompleted: true
    };

    await window.electronAPI.saveSettings(settings);
    await window.electronAPI.completeSetup();
    
    // Close the settings modal
    if (typeof hideSettingsModal === 'function') {
      hideSettingsModal();
    }
  } catch (error) {
    console.error('Error completing setup:', error);
  }
}

// Initialize with default cleanup folders and common software folders to ignore
cleanupFolders = ['Process', 'PI'];
ignoreFolders = [
  'ASIStudio', 'ASI', 'ASICAP', 'ASIImg', 'ASILive', 'ASIFitsView',
  'PixInsight', 'Pix Insight', 'PI', 
  'GraXpert', 'Graxpert',
  'Gaia', 'GAIA',
  'Siril',
  'DeepSkyStacker', 'DSS',
  'SharpCap',
  'PHD2', 'phd2',
  'NINA', 'N.I.N.A',
  'Stellarium',
  'APT', 'AstroPhotographyTool'
];

// Add license manager script before setup runs (guard against duplicates)
(function() {
  if (typeof LicenseManager === 'undefined' && !document.querySelector('script[data-module="license-manager"]')) {
    const script = document.createElement('script');
    script.src = 'js/modules/license-manager.js';
    script.setAttribute('data-module', 'license-manager');
    script.onload = () => {
      console.log('License manager loaded');
    };
    document.head.appendChild(script);
  }
})();

// Third-party program functions
async function browseAstroQC() {
  try {
    const filePath = await window.electronAPI.selectFile({
      title: 'Select AstroQC Executable',
      filters: [
        { name: 'Executable Files', extensions: ['exe', 'app', 'deb', 'AppImage'] },
        { name: 'All Files', extensions: ['*'] }
      ]
    });
    
    if (filePath) {
      thirdPartyPrograms.astroQC = filePath;
      if (astroQCPathInput) astroQCPathInput.value = filePath;
      updateTestAstroQCButton();
    }
  } catch (error) {
    console.error('Error selecting AstroQC path:', error);
    if (window.showAlert) {
      window.showAlert('Error', 'Failed to select file path.', 'error');
    }
  }
}

async function testAstroQC() {
  if (!thirdPartyPrograms.astroQC) {
    if (window.showAlert) {
      window.showAlert('Error', 'Please select the AstroQC executable path first.', 'error');
    }
    return;
  }

  try {
    const result = await window.electronAPI.launchProgram(thirdPartyPrograms.astroQC);
    if (result.success) {
      if (window.showAlert) {
        window.showAlert('Success', 'AstroQC launched successfully!', 'success');
      }
    } else {
      if (window.showAlert) {
        window.showAlert('Error', `Failed to launch AstroQC: ${result.error}`, 'error');
      }
    }
  } catch (error) {
    console.error('Error testing AstroQC:', error);
    if (window.showAlert) {
      window.showAlert('Error', 'Failed to test AstroQC launch.', 'error');
    }
  }
}

function updateTestAstroQCButton() {
  if (testAstroQCBtn) {
    testAstroQCBtn.disabled = !thirdPartyPrograms.astroQC;
  }
}

  // Auto-initialize when this script is loaded on the standalone setup page
  if (document.body && document.body.classList.contains('setup-page')) {
    // Wait for DOM ready to ensure elements are present
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => {
        if (typeof window.setupModalInit === 'function') {
          window.setupModalInit();
        }
      });
    } else {
      if (typeof window.setupModalInit === 'function') {
        window.setupModalInit();
      }
    }
  }

} // End setup module guard