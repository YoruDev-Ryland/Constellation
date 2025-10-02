// Setup Page Logic
let storagePath = '';
let cleanupFolders = [];
let ignoreFolders = [];
let enableBackgroundScan = true;
let backgroundScanHours = 4;

const storageInput = document.getElementById('storagePath');
const selectStorageBtn = document.getElementById('selectStorageBtn');
const cleanupInput = document.getElementById('cleanupInput');
const addCleanupBtn = document.getElementById('addCleanupBtn');
const cleanupTagsContainer = document.getElementById('cleanupTags');
const ignoreInput = document.getElementById('ignoreInput');
const addIgnoreBtn = document.getElementById('addIgnoreBtn');
const ignoreTagsContainer = document.getElementById('ignoreTags');
const enableBackgroundScanCheckbox = document.getElementById('enableBackgroundScan');
const backgroundScanHoursSelect = document.getElementById('backgroundScanHours');
const backgroundFrequencyGroup = document.getElementById('backgroundFrequencyGroup');
const completeSetupBtn = document.getElementById('completeSetupBtn');

// Window controls
document.getElementById('minimizeBtn').addEventListener('click', () => {
  window.electronAPI.windowControl('minimize');
});

document.getElementById('maximizeBtn').addEventListener('click', () => {
  window.electronAPI.windowControl('maximize');
});

document.getElementById('closeBtn').addEventListener('click', () => {
  window.electronAPI.windowControl('close');
});

// Select storage directory
selectStorageBtn.addEventListener('click', async () => {
  const path = await window.electronAPI.selectDirectory();
  if (path) {
    storagePath = path;
    storageInput.value = path;
    validateSetup();
  }
});

// Add cleanup folder
function addCleanupFolder() {
  const value = cleanupInput.value.trim();
  if (value && !cleanupFolders.includes(value)) {
    cleanupFolders.push(value);
    renderCleanupTags();
    cleanupInput.value = '';
  }
}

addCleanupBtn.addEventListener('click', addCleanupFolder);

cleanupInput.addEventListener('keypress', (e) => {
  if (e.key === 'Enter') {
    addCleanupFolder();
  }
});

// Add ignore folder
function addIgnoreFolder() {
  const value = ignoreInput.value.trim();
  if (value && !ignoreFolders.includes(value)) {
    ignoreFolders.push(value);
    renderIgnoreTags();
    ignoreInput.value = '';
  }
}

addIgnoreBtn.addEventListener('click', addIgnoreFolder);

ignoreInput.addEventListener('keypress', (e) => {
  if (e.key === 'Enter') {
    addIgnoreFolder();
  }
});

// Background scan settings
enableBackgroundScanCheckbox.addEventListener('change', (e) => {
  enableBackgroundScan = e.target.checked;
  backgroundFrequencyGroup.style.display = enableBackgroundScan ? 'block' : 'none';
});

backgroundScanHoursSelect.addEventListener('change', (e) => {
  backgroundScanHours = parseInt(e.target.value);
});

// Render cleanup tags
function renderCleanupTags() {
  cleanupTagsContainer.innerHTML = cleanupFolders.map(folder => `
    <div class="cleanup-tag">
      ${folder}
      <button onclick="removeCleanupFolder('${folder}')">×</button>
    </div>
  `).join('');
}

// Render ignore tags
function renderIgnoreTags() {
  ignoreTagsContainer.innerHTML = ignoreFolders.map(folder => `
    <div class="cleanup-tag">
      ${folder}
      <button onclick="removeIgnoreFolder('${folder}')">×</button>
    </div>
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
    
    // Update frequency group visibility
    backgroundFrequencyGroup.style.display = enableBackgroundScan ? 'block' : 'none';
    
    renderCleanupTags();
    renderIgnoreTags();
    validateSetup();
  } catch (error) {
    console.error('Error loading existing settings:', error);
  }
}

// Complete setup
completeSetupBtn.addEventListener('click', async () => {
  const settings = {
    storagePath,
    cleanupFolders,
    ignoreFolders,
    enableBackgroundScan,
    backgroundScanHours,
    setupCompleted: true
  };

  await window.electronAPI.saveSettings(settings);
  await window.electronAPI.completeSetup();
});

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

// Initialize the page
document.addEventListener('DOMContentLoaded', async () => {
  await loadExistingSettings();
  renderCleanupTags();
  renderIgnoreTags();
});