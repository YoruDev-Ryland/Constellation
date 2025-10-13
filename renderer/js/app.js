// Main App Logic
// Settings now managed through SettingsManager instance for observer capability
let settings = {}; // Will be replaced after SettingsManager load (kept for backward compatibility during incremental refactor)
let settingsManager = null;
let licenseManager = null;
let projects = [];
let targets = [];
let cleanupFolders = [];
let currentView = 'dashboard';
let currentMonth = new Date();
// Logging / managers
let logManager = null;
let fileScanner = null;
let projectManager = null;
let backgroundScanner = null;
let acquisitionCharts = null;
let projectUI = null;
let cleanupManager = null;

// ---------- Manager Helper Factories ----------
function ensureLogManager() {
  if (!logManager) logManager = new LogManager();
  return logManager;
}

function ensureFileScanner() {
  if (!fileScanner) {
    fileScanner = new FileScanner(window.electronAPI, {
      log: (m,d) => { const mgr = ensureLogManager(); if (mgr.isVerbose()) mgr.log(m,d); },
      getSettings: () => settings
    });
  }
  return fileScanner;
}

function ensureProjectManager() {
  if (!projectManager) {
    projectManager = new ProjectManager(window.electronAPI, {
      log: (m,d) => { const mgr = ensureLogManager(); if (mgr.isVerbose()) mgr.log(m,d); },
      getSettings: () => settings
    });
    projectManager.setProjects(projects);
  }
  return projectManager;
}

function ensureBackgroundScanner() {
  if (!backgroundScanner) {
    backgroundScanner = new BackgroundScanner({
      scanFn: async () => { await scanLibrary(); },
      getSettings: () => settings,
      getLogManager: () => ensureLogManager()
    });
  }
  return backgroundScanner;
}

function ensureAcquisitionCharts() {
  if (!acquisitionCharts) {
    acquisitionCharts = new AcquisitionCharts({
      getCurrentProject: () => currentProject,
      getSettings: () => settings,
      electronAPI: window.electronAPI
    });
  }
  return acquisitionCharts;
}

function ensureProjectUI() {
  if (!projectUI) {
    projectUI = new ProjectUI({
      getProjects: () => projects,
      getCurrentProject: () => currentProject,
      setCurrentProject: p => { currentProject = p; },
      saveProjects: async list => { projects = list; await window.electronAPI.saveProjects(projects); },
      findThumbnail: async name => await window.electronAPI.findProjectThumbnail(name, settings.storagePath)
    });
  }
  return projectUI;
}

function ensureCleanupManager() {
  if (!cleanupManager) {
    cleanupManager = new CleanupManager({
      getSettings: () => settings,
      electronAPI: window.electronAPI,
      log: msg => { const mgr = ensureLogManager(); if (mgr.isVerbose()) mgr.log(msg); }
    });
  }
  return cleanupManager;
}

function ensureLicenseManager() {
  if (!licenseManager) {
    licenseManager = new LicenseManager(window.electronAPI, {
      log: (msg, data) => { const mgr = ensureLogManager(); if (mgr.isVerbose()) mgr.log(msg, data); }
    });
  }
  return licenseManager;
}

// ---------- Settings Modal ----------
async function showSettingsModal() {
  const modal = document.getElementById('settingsModal');
  const content = document.getElementById('settingsContent');
  
  if (!modal || !content) return;
  
  // Load the setup content
  try {
    const response = await fetch('setup.html');
    const html = await response.text();
    
    // Extract just the setup content (between setup-container divs)
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');
    const setupContainer = doc.querySelector('.setup-container');
    
    if (setupContainer) {
      content.innerHTML = setupContainer.innerHTML;
      
      // Load and execute the setup script (only once)
      if (typeof window.setupModuleLoaded === 'undefined') {
        const script = document.createElement('script');
        script.src = 'js/setup.js';
        script.onload = () => {
          if (typeof setupModalInit === 'function') setupModalInit();
        };
        document.head.appendChild(script);
      } else {
        // Script already loaded, just initialize
        if (typeof setupModalInit === 'function') setupModalInit();
      }
    }
    
    // Show the modal
    modal.style.display = 'flex';
    
    // Add close button handler
    const closeBtn = document.getElementById('closeSettingsBtn');
    if (closeBtn) {
      closeBtn.onclick = hideSettingsModal;
    }
    
    // Close on backdrop click
    modal.onclick = (e) => {
      if (e.target === modal) {
        hideSettingsModal();
      }
    };
    
  } catch (error) {
    console.error('Failed to load settings content:', error);
  }
}

function hideSettingsModal() {
  const modal = document.getElementById('settingsModal');
  if (modal) {
    modal.style.display = 'none';
  }
}

// Make hideSettingsModal globally accessible
window.hideSettingsModal = hideSettingsModal;

// ---------- Verbose Log Helpers ----------
function showVerboseLogModal() { const mgr = ensureLogManager(); if (mgr) mgr.showModal(targets); }
function closeVerboseLogModal() { const mgr = ensureLogManager(); if (mgr) mgr.closeModal(); }
function copyVerboseLogToClipboard() { const mgr = ensureLogManager(); if (mgr) mgr.copyReportToClipboard(); }

// ---------- Library / Scan Workflow ----------
async function synchronizeProjectsFromTargets() {
  const pm = ensureProjectManager();
  await pm.syncFromTargets(targets);
  projects = pm.getProjects();
}

async function persistLibrary() {
  try {
    const mgr = ensureLogManager();
    const currentPath = settings.storagePath;
    const filteredProjects = (projects || []).filter(p => !p.libraryPath || p.libraryPath === currentPath);
    const databaseData = { targets, projects: filteredProjects, scanLog: mgr.getEntries().slice(-100) };
    const result = await window.electronAPI.saveLibraryDatabase(databaseData);
    if (!result.success) console.error('Failed to save library database:', result.error);
  } catch (e) {
    console.error('Error saving library database:', e);
  }
}

async function scanLibrary() {
  const scanner = ensureFileScanner();
  const scanBtn = document.getElementById('scanBtn');
  if (scanBtn) {
    scanBtn.disabled = true;
    scanBtn.innerHTML = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg> Scanning...';
  }
  try {
    targets = await scanner.scan(settings.storagePath);
    await synchronizeProjectsFromTargets();
    // Auto-detect thumbnails for any new / missing ones immediately after sync
    try {
      const pm = ensureProjectManager();
      const before = (pm.getProjects() || []).filter(p => p.thumbnailPath).length;
      await pm.autoDetectMissingThumbnails(settings.storagePath);
      const after = (pm.getProjects() || []).filter(p => p.thumbnailPath).length;
      const detected = after - before;
      if (detected > 0) {
        const mgr = ensureLogManager();
        if (mgr.isVerbose()) mgr.log('Auto-detected project thumbnails', { detected });
        // Refresh local projects reference for rendering
        projects = pm.getProjects();
      }
    } catch (thumbErr) { console.warn('Thumbnail auto-detect during scan failed:', thumbErr); }
    await persistLibrary();
    renderDashboard();
    renderProjects();
    renderCleanup();
    const mgr = ensureLogManager();
    if (mgr.isVerbose()) mgr.showModal(targets);
  } catch (err) {
    console.error('Error scanning:', err);
  } finally {
    if (scanBtn) {
      scanBtn.disabled = false;
      scanBtn.innerHTML = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/></svg> Scan Library';
    }
  }
}

// ---------- Initialization ----------
async function init() {
  ensureLogManager();
  try { settings = await window.electronAPI.getSettings(); } catch (e) { console.error('Failed to load settings:', e); }
  
  // Initialize license manager
  const license = ensureLicenseManager();
  await license.initialize();
  
  // Initialize tool registry
  if (window.ToolRegistry) {
    const toolRegistry = new window.ToolRegistry();
    await toolRegistry.init();
    window.toolRegistry = toolRegistry;
  }
  
  try {
    const db = await window.electronAPI.getLibraryDatabase?.();
    console.log('Loaded database:', db ? 'found' : 'not found', db?.targets?.length || 0, 'targets');
    if (db && db.targets) {
      targets = db.targets || [];
      const currentPath = settings.storagePath;
      // Only load projects that belong to this libraryPath (or legacy ones without a tag)
      projects = (db.projects || []).filter(p => !p.libraryPath || p.libraryPath === currentPath);
      // Migrate legacy (no libraryPath) by tagging them to current path
      let migrated = 0;
      projects.forEach(p => { if (!p.libraryPath) { p.libraryPath = currentPath; migrated++; } });
      ensureProjectManager().setProjects(projects);
      if (migrated > 0) {
        await window.electronAPI.saveProjects(projects);
        await persistLibrary();
      }
      // If any projects lack thumbnails, attempt a background auto-detect now
      try {
        if (projects.some(p => !p.thumbnailPath)) {
          await ensureProjectManager().autoDetectMissingThumbnails(settings.storagePath);
          projects = ensureProjectManager().getProjects();
        }
      } catch (e) { console.warn('Startup thumbnail auto-detect (DB path) failed:', e); }
    } else {
      console.log('No database found, loading from fallback methods');
      projects = await window.electronAPI.getProjects();
      ensureProjectManager().setProjects(projects);
      await ensureProjectManager().autoDetectMissingThumbnails(settings.storagePath);
    }
  } catch (err) {
    console.error('Error loading database:', err);
    projects = await window.electronAPI.getProjects();
    ensureProjectManager().setProjects(projects);
    await ensureProjectManager().autoDetectMissingThumbnails(settings.storagePath);
  }
  setupEventListeners();
  console.log('Rendering dashboard with', targets.length, 'targets');
  renderDashboard();
  renderProjects();
  window.ensureCalendarModule().render();
  ensureBackgroundScanner().start();
}

// ---------- Event Listeners ----------
function setupEventListeners() {
  // Window controls
  document.getElementById('minimizeBtn')?.addEventListener('click', () => window.electronAPI.windowControl('minimize'));
  document.getElementById('maximizeBtn')?.addEventListener('click', () => window.electronAPI.windowControl('maximize'));
  document.getElementById('closeBtn')?.addEventListener('click', () => window.electronAPI.windowControl('close'));

  // Navigation
  document.querySelectorAll('.nav-item').forEach(item => {
    item.addEventListener('click', e => { e.preventDefault(); switchView(item.dataset.view); });
  });

  // Scan / refresh / settings
  document.getElementById('scanBtn')?.addEventListener('click', scanLibrary);
  document.getElementById('refreshBtn')?.addEventListener('click', scanLibrary);
  document.getElementById('settingsBtn')?.addEventListener('click', showSettingsModal);

  // Settings modal
  document.getElementById('closeSettingsBtn')?.addEventListener('click', hideSettingsModal);
  
  // Listen for settings modal events from main process
  window.electronAPI.onShowSettings?.(() => showSettingsModal());

  // Verbose toggle
  document.getElementById('verboseToggleBtn')?.addEventListener('click', () => {
    const mgr = ensureLogManager();
    const newState = !mgr.isVerbose();
    mgr.setVerbose(newState);
    const btn = document.getElementById('verboseToggleBtn');
    if (btn) {
      btn.innerHTML = `
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
        <polyline points="14,2 14,8 20,8"/>
        <line x1="16" y1="13" x2="8" y2="13"/>
        <line x1="16" y1="17" x2="8" y2="17"/>
        <polyline points="10,9 9,9 8,9"/>
      </svg>
      Verbose ${newState ? 'On' : 'Off'}`;
      btn.classList.toggle('btn-primary', newState);
      btn.classList.toggle('btn-secondary', !newState);
    }
  });

  // Project tabs
  document.querySelectorAll('.tab-btn').forEach(btn => btn.addEventListener('click', () => switchProjectTab(btn.dataset.tab)));

  // Calendar navigation
  document.getElementById('prevMonth')?.addEventListener('click', () => { currentMonth.setMonth(currentMonth.getMonth() - 1); window.ensureCalendarModule().render(); });
  document.getElementById('nextMonth')?.addEventListener('click', () => { currentMonth.setMonth(currentMonth.getMonth() + 1); window.ensureCalendarModule().render(); });

  // Project detail controls
  document.getElementById('backToProjectsBtn')?.addEventListener('click', () => switchView('projectsView'));
  document.getElementById('editProjectBtn')?.addEventListener('click', editProject);
  document.getElementById('completeProjectBtn')?.addEventListener('click', toggleProjectCompletion);
  document.getElementById('deleteProjectBtn')?.addEventListener('click', () => { if (currentProject) { const modal = ensureProjectUI().createDeleteProjectModal(currentProject); document.body.appendChild(modal); } });
  document.getElementById('debugChartBtn')?.addEventListener('click', () => ensureAcquisitionCharts().debug(currentProject));

  // Log modal controls
  document.getElementById('closeLogBtn')?.addEventListener('click', closeVerboseLogModal);
  document.getElementById('copyLogBtn')?.addEventListener('click', copyVerboseLogToClipboard);
  document.getElementById('verboseLogModal')?.addEventListener('click', e => { if (e.target.id === 'verboseLogModal') closeVerboseLogModal(); });

  // Cleanup deletion is wired by the CleanupManager module to avoid duplicate handlers
}

// Switch view
function switchView(view) {
  currentView = view;
  
  // Update navigation only for main views (not project details)
  if (view !== 'projectDetailsView') {
    document.querySelectorAll('.nav-item').forEach(item => {
      item.classList.toggle('active', item.dataset.view === view);
    });
  }
  
  // Update content - check if view already ends with 'View'
  const viewId = view.endsWith('View') ? view : `${view}View`;
  document.querySelectorAll('.view').forEach(v => {
    v.classList.toggle('active', v.id === viewId);
  });

  // Load data for specific views
  if (view === 'cleanup') {
    renderCleanup();
  } else if (view === 'tools') {
    initializeToolsView();
  } else if (view === 'social') {
    initializeSocialView();
  }
  
  console.log(`Switched to view: ${viewId}`);
}

// Switch project tab
function switchProjectTab(tab) {
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tab === tab);
  });
  
  document.getElementById('currentProjects').classList.toggle('active', tab === 'current');
  document.getElementById('completedProjects').classList.toggle('active', tab === 'completed');
}


// Render dashboard
function renderDashboard() {
  // Update stats
  document.getElementById('totalTargets').textContent = targets.length;
  
  const totalImages = targets.reduce((sum, t) => sum + t.imageCount, 0);
  document.getElementById('totalImages').textContent = totalImages.toLocaleString();
  
  const totalTime = targets.reduce((sum, t) => sum + t.totalTime, 0);
  document.getElementById('totalTime').textContent = `${(totalTime / 3600).toFixed(1)}h`;
  
  // Cleanup size (placeholder - would need actual folder scanning)
  document.getElementById('cleanupSize').textContent = '0 GB';

  // Render recent targets
  const recentTargets = document.getElementById('recentTargets');
  
  if (targets.length === 0) {
    recentTargets.innerHTML = `
      <div class="empty-state">
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor">
          <circle cx="12" cy="12" r="10"/>
          <path d="M12 6v6l4 2"/>
        </svg>
        <p>No targets found yet. Click "Scan Library" to get started!</p>
      </div>
    `;
    return;
  }

  recentTargets.innerHTML = targets.slice(0, 10).map(target => {
    const filterChips = Object.entries(target.filters).map(([filter, data]) => `
      <div class="filter-chip">
        ${filter}: ${data.count} (${(data.time / 3600).toFixed(1)}h)
      </div>
    `).join('');

    return `
      <div class="target-card">
        <div class="target-header">
          <div class="target-name">${target.name}</div>
          <div class="target-badge">${target.imageCount} images</div>
        </div>
        <div class="target-stats">
          <span>🕐 ${(target.totalTime / 3600).toFixed(1)}h total</span>
          <span>📊 ${Object.keys(target.filters).length} filters</span>
        </div>
        <div class="filter-grid">
          ${filterChips}
        </div>
      </div>
    `;
  }).join('');
}

// Render projects
function renderProjects() {
  const ui = ensureProjectUI();
  const currentProjects = projects.filter(p => p.status === 'current');
  const completedProjects = projects.filter(p => p.status === 'completed');
  ui.renderProjectGrid('currentProjectsGrid', currentProjects, 'No current projects. Start imaging to create projects!');
  ui.renderProjectGrid('completedProjectsGrid', completedProjects, 'No completed projects yet.');
}

// View project details
window.viewProject = (projectId) => { ensureProjectUI().viewProject(projectId); };

// Current project being viewed
let currentProject = null;

// Populate project details view
function populateProjectDetails(project) {
  ensureProjectUI().populateProjectDetails(project);
  // Spinner overlay will be added by buildAcquisitionChart hook below
  if (window.buildAcquisitionChart) window.buildAcquisitionChart(project);
}

// Create acquisition progress chart
async function createAcquisitionChart(project) { return ensureAcquisitionCharts().createChart(project); }


// Project action functions
function editProject() { if (!currentProject) return; const modal = ensureProjectUI().createEditProjectModal(currentProject); document.body.appendChild(modal); }

async function toggleProjectCompletion() {
  if (!currentProject) return;
  
  if (currentProject.status === 'completed') {
    // Reopen project
    currentProject.status = 'current';
    currentProject.completedAt = null;
  } else {
    // Complete project
    currentProject.status = 'completed';
    currentProject.completedAt = new Date().toISOString();
  }
  
  // Update the project in the main array
  const projectIndex = projects.findIndex(p => p.id === currentProject.id);
  if (projectIndex !== -1) {
    projects[projectIndex] = currentProject;
  }
  
  // Save changes and refresh views
  await window.electronAPI.saveProjects(projects);
  populateProjectDetails(currentProject);
  renderProjects(); // Refresh the projects view
}

// Delete project function
async function deleteProject() { if (!currentProject) return; const modal = ensureProjectUI().createDeleteProjectModal(currentProject); document.body.appendChild(modal); }

// Create edit project modal
function createEditProjectModal() { return ensureProjectUI().createEditProjectModal(currentProject); }

function renderCalendar() { window.ensureCalendarModule().render(); }

// Render cleanup view
async function renderCleanup() { ensureCleanupManager().render(); }

// Legacy project UI helpers removed (now in ProjectUI module)

// Execute the actual deletion
async function executeProjectDeletion(deleteFiles, shouldBlacklist) {
  try {
    // Remove from projects array
    const projectIndex = projects.findIndex(p => p.id === currentProject.id);
    if (projectIndex !== -1) {
      projects.splice(projectIndex, 1);
    }
    
    // Add to blacklist if requested
    if (shouldBlacklist) {
      if (!settings.projectBlacklist) {
        settings.projectBlacklist = [];
      }
      settings.projectBlacklist.push(currentProject.name.toLowerCase());
      await window.electronAPI.saveSettings(settings);
    }
    
    // Delete files if requested
    if (deleteFiles) {
      // TODO: Implement file deletion
      console.log('File deletion not yet implemented');
    }
    
    // Save projects and refresh
    await window.electronAPI.saveProjects(projects);
    
    // Close modal and return to projects view
    document.getElementById('deleteProjectModal')?.remove();
    switchView('projectsView');
    renderProjects();
    
    console.log(`Project "${currentProject.name}" deleted successfully`);
    
  } catch (error) {
    console.error('Error deleting project:', error);
    alert('Error deleting project. Please try again.');
  }
}

// Expose deletion for ProjectUI module
window.executeProjectDeletion = executeProjectDeletion;

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', init);

// Hook for ProjectUI deferred chart build (installed after modules load)
window.buildAcquisitionChart = (project) => {
  // Ensure container and insert spinner overlay if not exists
  const container = document.getElementById('acquisitionChartContainer') || document.getElementById('acquisitionChart')?.parentElement;
  if (container) {
    let spinner = document.getElementById('acquisitionChartSpinner');
    if (!spinner) {
      spinner = document.createElement('div');
      spinner.id = 'acquisitionChartSpinner';
      spinner.innerHTML = '<div>Building chart…</div>';
      container.appendChild(spinner);
    } else {
      spinner.style.display = 'flex';
    }
  }
  // Delay execution to allow layout stabilisation
  let attempts = 0;
  const maxAttempts = 12;
  const attempt = () => {
    const canvas = document.getElementById('acquisitionChart');
    if (!canvas) return;
    if (canvas.offsetWidth > 0) {
      ensureAcquisitionCharts().createChart(project);
    } else if (attempts < maxAttempts) {
      attempts++;
      requestAnimationFrame(attempt);
    } else {
      console.warn('Chart creation skipped due to persistent zero-width canvas');
      const spin = document.getElementById('acquisitionChartSpinner');
      if (spin) spin.remove();
    }
  };
  requestAnimationFrame(()=> requestAnimationFrame(attempt));
};

// Update background scan settings via BackgroundScanner
function updateBackgroundScanSettings(enabled, frequencyHours) {
  settings.enableBackgroundScan = enabled;
  settings.backgroundScanHours = frequencyHours;
  (async () => {
    try {
      if (settingsManager) {
        settingsManager.set('enableBackgroundScan', enabled);
        settingsManager.set('backgroundScanHours', frequencyHours);
        await window.electronAPI.saveSettings(settingsManager.get());
      } else {
        await window.electronAPI.saveSettings(settings);
      }
      ensureBackgroundScanner().updateSettings(enabled, frequencyHours);
    } catch (err) {
      console.error('Failed to persist background scan settings:', err);
    }
  })();
}

// Sub-Frame Analyzer Integration
async function launchAstroQC() {
  console.log('Launching AstroQC Sub-Frame Analyzer');
  
  try {
    // Get current settings to check for AstroQC path
    const settings = await window.electronAPI.getSettings();
    
    if (!settings.thirdPartyPrograms?.astroQC) {
      // Show modal asking user to set path in settings
      if (window.showAlert) {
        window.showAlert(
          'AstroQC Not Configured', 
          'Please set the path to AstroQC in Settings > Third Party Program Support before using this tool.',
          'warning'
        );
      } else {
        alert('Please set the path to AstroQC in Settings > Third Party Program Support before using this tool.');
      }
      return;
    }

    // Launch AstroQC
    const result = await window.electronAPI.launchProgram(settings.thirdPartyPrograms.astroQC);
    
    if (!result.success) {
      console.error('Failed to launch AstroQC:', result.error);
      if (window.showAlert) {
        window.showAlert('Launch Failed', `Failed to launch AstroQC: ${result.error}`, 'error');
      } else {
        alert(`Failed to launch AstroQC: ${result.error}`);
      }
    } else {
      console.log('AstroQC launched successfully');
    }
    
  } catch (error) {
    console.error('Error launching AstroQC:', error);
    if (window.showAlert) {
      window.showAlert('Error', 'An error occurred while trying to launch AstroQC.', 'error');
    } else {
      alert('An error occurred while trying to launch AstroQC.');
    }
  }
}

// Altitude Timeline Integration
async function openAltitudeTimeline() {
  console.log('Opening Altitude Timeline');
  
  try {
    // Show the altitude timeline view
    switchView('altitudeTimeline');
    
    // Initialize the altitude timeline if not already done
    if (!window.altitudeTimeline) {
      // Give the DOM a moment to update before initializing
      setTimeout(() => {
        try {
          console.log('Initializing Altitude Timeline...');
          window.altitudeTimeline = new AltitudeTimeline('altitudeTimelineContainer');
          
          // Load user's location from settings if available
          if (settings && settings.observatoryLocation) {
            window.altitudeTimeline.setLocation(settings.observatoryLocation);
            console.log('Observatory location loaded from settings:', settings.observatoryLocation);
          } else {
            console.log('No observatory location found in settings');
          }
          
          console.log('Altitude Timeline initialized successfully');
        } catch (error) {
          console.error('Error initializing Altitude Timeline:', error);
          alert('Error initializing Altitude Timeline: ' + error.message);
        }
      }, 100);
    } else {
      // If already initialized, update location from settings
      if (settings && settings.observatoryLocation) {
        window.altitudeTimeline.setLocation(settings.observatoryLocation);
      }
    }
    
    console.log('Altitude Timeline view opened successfully');
  } catch (error) {
    console.error('Error opening Altitude Timeline:', error);
    alert('Error opening Altitude Timeline: ' + error.message);
  }
}

// H-R Diagram Integration
function createHRDiagram() {
  console.log('Creating H-R Diagram interface');
  
  // Debug: Check if modules are available
  console.log('HRDiagramUI available:', typeof HRDiagramUI !== 'undefined');
  console.log('Chart available:', typeof Chart !== 'undefined');
  
  if (typeof HRDiagramUI === 'undefined') {
    console.error('H-R Diagram UI module not loaded');
    alert('H-R Diagram functionality is not available. Please check console for errors.');
    return;
  }
  
  try {
    const hrUI = new HRDiagramUI();
    console.log('HRDiagramUI instance created:', hrUI);
    
    const modal = hrUI.createModal();
    console.log('Modal created:', modal);
    
    if (!modal) {
      console.error('Modal creation returned null/undefined');
      alert('Failed to create H-R diagram interface');
      return;
    }
    
    console.log('H-R Diagram modal should now be visible');
  } catch (error) {
    console.error('Error creating H-R diagram:', error);
    alert('Error creating H-R diagram: ' + error.message);
  }
}

// Initialize Tools View
function initializeToolsView() {
  console.log('Initializing Tools view');
  
  // Add event listener for H-R diagram button if it exists
  const hrButton = document.getElementById('hrDiagramBtn');
  if (hrButton) {
    // Remove any existing listeners
    hrButton.replaceWith(hrButton.cloneNode(true));
    const newHrButton = document.getElementById('hrDiagramBtn');
    
    newHrButton.addEventListener('click', (e) => {
      e.preventDefault();
      console.log('H-R Diagram button clicked');
      createHRDiagram();
    });
    
    console.log('H-R Diagram button listener added');
  } else {
    console.warn('H-R Diagram button not found in DOM');
  }

  // Add event listener for Sub-Frame Analyzer button if it exists
  const subAnalyzerButton = document.getElementById('subAnalyzerBtn');
  if (subAnalyzerButton) {
    // Remove any existing listeners
    subAnalyzerButton.replaceWith(subAnalyzerButton.cloneNode(true));
    const newSubAnalyzerButton = document.getElementById('subAnalyzerBtn');
    
    newSubAnalyzerButton.addEventListener('click', (e) => {
      e.preventDefault();
      console.log('Sub-Frame Analyzer button clicked');
      launchAstroQC();
    });
    
    console.log('Sub-Frame Analyzer button listener added');
  } else {
    console.warn('Sub-Frame Analyzer button not found in DOM');
  }

  // Add event listener for Altitude Timeline button if it exists
  const altitudeTimelineButton = document.getElementById('altitudeTimelineBtn');
  if (altitudeTimelineButton) {
    // Remove any existing listeners
    altitudeTimelineButton.replaceWith(altitudeTimelineButton.cloneNode(true));
    const newAltitudeTimelineButton = document.getElementById('altitudeTimelineBtn');
    
    newAltitudeTimelineButton.addEventListener('click', (e) => {
      e.preventDefault();
      console.log('Altitude Timeline button clicked');
      openAltitudeTimeline();
    });
    
    console.log('Altitude Timeline button listener added');
  } else {
    console.warn('Altitude Timeline button not found in DOM');
  }

  // Add back to tools button handler
  const backToToolsBtn = document.getElementById('backToToolsBtn');
  if (backToToolsBtn) {
    backToToolsBtn.addEventListener('click', (e) => {
      e.preventDefault();
      console.log('Back to Tools button clicked');
      switchView('tools');
    });
    console.log('Back to Tools button listener added');
  }
}

// Initialize Social View
function initializeSocialView() {
  console.log('Initializing Social view');
  
  try {
    if (typeof ensureSocialManager !== 'function') {
      console.error('Social module not loaded: ensureSocialManager is undefined. Check that social-manager.js is included and parsed without errors.');
      return;
    }

    const socialManager = ensureSocialManager();
    if (socialManager) {
      socialManager.show();
      console.log('Social manager initialized and shown');
    } else {
      console.error('Failed to initialize social manager');
    }
  } catch (error) {
    console.error('Error initializing social view:', error);
  }
}