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

async function persistArchiveLibrary() {
  try {
    if (!settings.archivePath || settings.archivePath.trim() === '') return;
    
    const mgr = ensureLogManager();
    const archivePath = settings.archivePath;
    const archivedProjects = (projects || []).filter(p => p.libraryPath === archivePath);
    const databaseData = { 
      targets: [], // Archives don't need targets, they're completed projects
      projects: archivedProjects, 
      scanLog: mgr.getEntries().slice(-100) 
    };
    const result = await window.electronAPI.saveArchiveLibraryDatabase(archivePath, databaseData);
    if (!result.success) console.error('Failed to save archive library database:', result.error);
  } catch (e) {
    console.error('Error saving archive library database:', e);
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
    // Scan main library
    targets = await scanner.scan(settings.storagePath);
    await synchronizeProjectsFromTargets();
    
    // Scan archive folder for completed projects (if configured)
    if (settings.archivePath && settings.archivePath.trim() !== '') {
      try {
        console.log('Scanning archive folder for completed projects...');
        const archiveTargets = await scanner.scan(settings.archivePath);
        
        // Add archived targets as completed projects
        const pm = ensureProjectManager();
        for (const target of archiveTargets) {
          // Check if project already exists
          let existingProject = projects.find(p => p.name === target.name);
          
          if (!existingProject) {
            // Create new completed project
            const archivedProject = {
              id: Date.now() + Math.random(),
              name: target.name,
              status: 'completed',
              totalTime: target.totalTime,
              imageCount: target.imageCount,
              filters: target.filters,
              createdAt: new Date().toISOString(),
              completedAt: new Date().toISOString(),
              thumbnailPath: null,
              integrationTargetHours: null,
              libraryPath: settings.archivePath,
              path: `${settings.archivePath}/${target.name}`
            };
            projects.push(archivedProject);
            console.log(`Added archived project: ${target.name}`);
          } else if (existingProject.status !== 'completed') {
            // Update existing project to mark as completed
            existingProject.status = 'completed';
            existingProject.completedAt = existingProject.completedAt || new Date().toISOString();
            existingProject.libraryPath = settings.archivePath;
            existingProject.path = `${settings.archivePath}/${target.name}`;
            console.log(`Updated project to completed: ${target.name}`);
          }
        }
        pm.setProjects(projects);
        await pm.save();
      } catch (archiveErr) {
        console.warn('Archive folder scan failed:', archiveErr);
      }
    }
    
    // Clean up orphaned projects during scan (projects that have been moved/deleted)
    try {
      const cleanupResult = await ensureProjectManager().cleanupOrphanedProjects(settings.storagePath);
      if (cleanupResult.removed.length > 0) {
        console.log(`Removed ${cleanupResult.removed.length} orphaned project(s) that no longer exist on disk`);
        projects = ensureProjectManager().getProjects();
      }
    } catch (cleanupErr) { 
      console.warn('Orphaned project cleanup during scan failed:', cleanupErr); 
    }
    
    // Auto-detect thumbnails for any new / missing ones immediately after sync
    try {
      const pm = ensureProjectManager();
      const before = (pm.getProjects() || []).filter(p => p.thumbnailPath).length;
      await pm.autoDetectMissingThumbnails(settings.storagePath);
      
      // Also detect thumbnails in archive folder
      if (settings.archivePath && settings.archivePath.trim() !== '') {
        await pm.autoDetectMissingThumbnails(settings.archivePath);
      }
      
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
    
    // Also persist archive library if we scanned it
    if (settings.archivePath && settings.archivePath.trim() !== '') {
      await persistArchiveLibrary();
    }
    
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

  // Initialize AstroQC integration
  if (window.astroQCIntegration) {
    // Create a simple settings manager interface for AstroQC
    const simpleSettingsManager = {
      loadSettings: async () => settings,
      saveSettings: async (newSettings) => {
        settings = { ...settings, ...newSettings };
        await window.electronAPI.saveSettings(settings);
      }
    };
    await window.astroQCIntegration.initialize(simpleSettingsManager);
  }
  
  try {
    const db = await window.electronAPI.loadLibraryDatabase?.();
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
      
      // Note: Orphaned project cleanup and thumbnail detection are now handled by
      // the background scanner to avoid slow startup times with large libraries (e.g., NAS)
      console.log('Loaded library from cache - use Scan Library to refresh or validate projects');
    } else {
      console.log('No database found, loading from fallback methods');
      projects = await window.electronAPI.getProjects();
      ensureProjectManager().setProjects(projects);
    }
    
    // Load archived projects from archive .constellation file
    if (settings.archivePath && settings.archivePath.trim() !== '') {
      try {
        const archiveDb = await window.electronAPI.loadArchiveLibraryDatabase?.(settings.archivePath);
        if (archiveDb && archiveDb.projects) {
          console.log('Loaded archive database:', archiveDb.projects.length, 'archived projects');
          // Add archived projects to the main projects array
          archiveDb.projects.forEach(archivedProject => {
            // Check if project already exists
            const existingIndex = projects.findIndex(p => p.id === archivedProject.id);
            if (existingIndex === -1) {
              projects.push(archivedProject);
            } else {
              // Update existing project with archive data
              projects[existingIndex] = archivedProject;
            }
          });
          ensureProjectManager().setProjects(projects);
        }
      } catch (archiveErr) {
        console.warn('Failed to load archive database:', archiveErr);
      }
    }
  } catch (err) {
    console.error('Error loading database:', err);
    projects = await window.electronAPI.getProjects();
    ensureProjectManager().setProjects(projects);
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
  document.getElementById('analyzeProjectBtn')?.addEventListener('click', analyzeCurrentProject);
  document.getElementById('debugChartBtn')?.addEventListener('click', () => ensureAcquisitionCharts().debug(currentProject));

  // AstroQC Integration - Astro directory analysis
  document.getElementById('analyzeAstroBtn')?.addEventListener('click', analyzeAstroDirectory);

  // Event delegation for dynamically created filter AQC buttons
  document.addEventListener('click', async (e) => {
    if (e.target.matches('.astroqc-filter-btn') || e.target.closest('.astroqc-filter-btn')) {
      const btn = e.target.matches('.astroqc-filter-btn') ? e.target : e.target.closest('.astroqc-filter-btn');
      const filter = btn.dataset.filter;
      const projectPath = btn.dataset.projectPath;
      
      if (filter && projectPath) {
        try {
          // Construct the filter path (assuming standard structure: projectPath/filter/)
          const filterPath = `${projectPath}/${filter}`;
          await window.astroQCIntegration.launchFilterAnalysis(filterPath);
        } catch (error) {
          console.error('Failed to launch AstroQC filter analysis:', error);
          await window.showAlert('AstroQC Error', `Failed to launch AstroQC: ${error.message}`, 'error');
        }
      }
    }
  });

  // Log modal controls
  document.getElementById('closeLogBtn')?.addEventListener('click', closeVerboseLogModal);
  document.getElementById('copyLogBtn')?.addEventListener('click', copyVerboseLogToClipboard);
  document.getElementById('verboseLogModal')?.addEventListener('click', e => { if (e.target.id === 'verboseLogModal') closeVerboseLogModal(); });

  // Cleanup deletion is wired by the CleanupManager module to avoid duplicate handlers
}

// Switch view
function switchView(view) {
  currentView = view;
  
  // Stop Solar Sim animation if switching away from it
  if (view !== 'solarSim' && solarSimInstance) {
    solarSimInstance.hide();
  }
  
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
  } else if (view === 'solarSim') {
    initializeSolarSim();
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
    // Reactivate project - check if we should move it back
    const isArchived = currentProject.libraryPath && currentProject.libraryPath === settings.archivePath;
    
    if (isArchived && settings.storagePath && settings.storagePath.trim() !== '') {
      // Show modal asking if user wants to move back to active storage
      showReactivateConfirmationModal(currentProject);
    } else {
      // Just mark as current without moving
      await reactivateProjectWithoutMove();
    }
  } else {
    // Complete project - check if we should move to archive
    const archivePath = settings.archivePath;
    
    if (archivePath && archivePath.trim() !== '') {
      // Show modal asking if user wants to move to archive
      showArchiveConfirmationModal(currentProject, archivePath);
    } else {
      // No archive path set, just mark as complete
      await completeProjectWithoutMove();
    }
  }
}

async function completeProjectWithoutMove() {
  currentProject.status = 'completed';
  currentProject.completedAt = new Date().toISOString();
  
  // Update the project in the main array
  const projectIndex = projects.findIndex(p => p.id === currentProject.id);
  if (projectIndex !== -1) {
    projects[projectIndex] = currentProject;
  }
  
  // Save changes and refresh views
  await window.electronAPI.saveProjects(projects);
  populateProjectDetails(currentProject);
  renderProjects();
}

async function reactivateProjectWithoutMove() {
  currentProject.status = 'current';
  currentProject.completedAt = null;
  
  // Update the project in the main array
  const projectIndex = projects.findIndex(p => p.id === currentProject.id);
  if (projectIndex !== -1) {
    projects[projectIndex] = currentProject;
  }
  
  // Save changes and refresh views
  await window.electronAPI.saveProjects(projects);
  populateProjectDetails(currentProject);
  renderProjects();
}

function showArchiveConfirmationModal(project, archivePath) {
  const modal = document.createElement('div');
  modal.className = 'modal-overlay';
  modal.id = 'archiveConfirmModal';
  
  const projectPath = project.path || `${settings.storagePath}/${project.name}`;
  const destinationPath = `${archivePath}/${project.name}`;
  
  modal.innerHTML = `
    <div class="modal-content">
      <div class="modal-header">
        <h2>Move Project to Archive?</h2>
        <button class="modal-close" onclick="document.getElementById('archiveConfirmModal').remove()">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor">
            <path d="M18 6L6 18M6 6l12 12"/>
          </svg>
        </button>
      </div>
      <div class="modal-body">
        <p>You're marking <strong>${project.name}</strong> as complete.</p>
        <p>Would you like to move this project folder to your archive location?</p>
        <div class="path-info">
          <div class="path-label">From:</div>
          <div class="path-value">${projectPath}</div>
          <div class="path-label" style="margin-top: 10px;">To:</div>
          <div class="path-value">${destinationPath}</div>
        </div>
        <p class="hint">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" style="vertical-align: middle;">
            <circle cx="12" cy="12" r="10"/>
            <path d="M12 16v-4M12 8h.01"/>
          </svg>
          This will physically move the folder to free up space on your local drive.
        </p>
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" onclick="handleArchiveChoice(false)">
          Don't Move - Just Mark Complete
        </button>
        <button class="btn btn-primary" onclick="handleArchiveChoice(true)">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" style="margin-right: 5px;">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
            <polyline points="7 10 12 15 17 10"/>
            <line x1="12" y1="15" x2="12" y2="3"/>
          </svg>
          Move to Archive
        </button>
      </div>
    </div>
  `;
  
  document.body.appendChild(modal);
}

function showReactivateConfirmationModal(project) {
  const modal = document.createElement('div');
  modal.className = 'modal-overlay';
  modal.id = 'reactivateConfirmModal';
  
  const projectPath = project.path || `${settings.archivePath}/${project.name}`;
  const destinationPath = `${settings.storagePath}/${project.name}`;
  
  modal.innerHTML = `
    <div class="modal-content">
      <div class="modal-header">
        <h2>Reactivate Archived Project?</h2>
        <button class="modal-close" onclick="document.getElementById('reactivateConfirmModal').remove()">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor">
            <path d="M18 6L6 18M6 6l12 12"/>
          </svg>
        </button>
      </div>
      <div class="modal-body">
        <p>You're reactivating <strong>${project.name}</strong>.</p>
        <p>Would you like to move this project folder back to your active storage location?</p>
        <div class="path-info">
          <div class="path-label">From:</div>
          <div class="path-value">${projectPath}</div>
          <div class="path-label" style="margin-top: 10px;">To:</div>
          <div class="path-value">${destinationPath}</div>
        </div>
        <p class="hint">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" style="vertical-align: middle;">
            <circle cx="12" cy="12" r="10"/>
            <path d="M12 16v-4M12 8h.01"/>
          </svg>
          This will physically move the folder back to your local drive for continued work.
        </p>
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" onclick="handleReactivateChoice(false)">
          Don't Move - Just Mark Active
        </button>
        <button class="btn btn-primary" onclick="handleReactivateChoice(true)">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" style="margin-right: 5px;">
            <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
            <polyline points="9 22 9 12 15 12 15 22"/>
          </svg>
          Move Back to Active Storage
        </button>
      </div>
    </div>
  `;
  
  document.body.appendChild(modal);
}

async function handleArchiveChoice(shouldMove) {
  const modal = document.getElementById('archiveConfirmModal');
  if (modal) modal.remove();
  
  if (shouldMove) {
    await completeProjectAndMove();
  } else {
    await completeProjectWithoutMove();
  }
}

async function handleReactivateChoice(shouldMove) {
  const modal = document.getElementById('reactivateConfirmModal');
  if (modal) modal.remove();
  
  if (shouldMove) {
    await reactivateProjectAndMove();
  } else {
    await reactivateProjectWithoutMove();
  }
}

async function completeProjectAndMove() {
  const projectPath = currentProject.path || `${settings.storagePath}/${currentProject.name}`;
  const destinationPath = `${settings.archivePath}/${currentProject.name}`;
  
  try {
    // Show detailed progress modal
    const progressModal = showDetailedProgressModal();
    
    // Set up progress listener
    const progressListener = (data) => {
      updateProgressModal(data);
    };
    window.electronAPI.onMoveProgress(progressListener);
    
    // Move the folder
    const result = await window.electronAPI.moveFolder(projectPath, destinationPath);
    
    // Clean up listener
    window.electronAPI.removeAllListeners('move-progress');
    
    // Close progress modal
    progressModal.remove();
    
    if (result.success) {
      // Update project with new path and mark as complete
      currentProject.status = 'completed';
      currentProject.completedAt = new Date().toISOString();
      currentProject.path = destinationPath;
      currentProject.libraryPath = settings.archivePath;
      
      // Update the project in the main array
      const projectIndex = projects.findIndex(p => p.id === currentProject.id);
      if (projectIndex !== -1) {
        projects[projectIndex] = currentProject;
      }
      
      // Save changes and refresh views
      await window.electronAPI.saveProjects(projects);
      await persistLibrary();
      
      // Save to archive's .constellation file
      await persistArchiveLibrary();
      
      populateProjectDetails(currentProject);
      renderProjects();
      
      // Show success message
      showSuccessMessage(`Project moved to archive successfully!`);
    } else {
      throw new Error(result.error || 'Failed to move project');
    }
  } catch (error) {
    console.error('Error moving project to archive:', error);
    if (window.showAlert) {
      window.showAlert('Move Failed', `Failed to move project to archive: ${error.message}`, 'error');
    } else {
      alert(`Failed to move project to archive: ${error.message}`);
    }
  }
}

async function reactivateProjectAndMove() {
  const projectPath = currentProject.path || `${settings.archivePath}/${currentProject.name}`;
  const destinationPath = `${settings.storagePath}/${currentProject.name}`;
  
  try {
    // Show detailed progress modal
    const progressModal = showDetailedProgressModal('Reactivating Project');
    
    // Set up progress listener
    const progressListener = (data) => {
      updateProgressModal(data);
    };
    window.electronAPI.onMoveProgress(progressListener);
    
    // Move the folder back
    const result = await window.electronAPI.moveFolder(projectPath, destinationPath);
    
    // Clean up listener
    window.electronAPI.removeAllListeners('move-progress');
    
    // Close progress modal
    progressModal.remove();
    
    if (result.success) {
      // Update project with new path and mark as current
      currentProject.status = 'current';
      currentProject.completedAt = null;
      currentProject.path = destinationPath;
      currentProject.libraryPath = settings.storagePath;
      
      // Update the project in the main array
      const projectIndex = projects.findIndex(p => p.id === currentProject.id);
      if (projectIndex !== -1) {
        projects[projectIndex] = currentProject;
      }
      
      // Save changes and refresh views
      await window.electronAPI.saveProjects(projects);
      await persistLibrary();
      
      // Update archive's .constellation file (remove from there)
      await persistArchiveLibrary();
      
      populateProjectDetails(currentProject);
      renderProjects();
      
      // Show success message
      showSuccessMessage(`Project reactivated successfully!`);
    } else {
      throw new Error(result.error || 'Failed to move project');
    }
  } catch (error) {
    console.error('Error reactivating project:', error);
    if (window.showAlert) {
      window.showAlert('Move Failed', `Failed to reactivate project: ${error.message}`, 'error');
    } else {
      alert(`Failed to reactivate project: ${error.message}`);
    }
  }
}

function showDetailedProgressModal(title = 'Moving Project to Archive') {
  const modal = document.createElement('div');
  modal.className = 'modal-overlay';
  modal.id = 'progressModal';
  modal.innerHTML = `
    <div class="modal-content" style="min-width: 500px; padding: 30px;">
      <h3 style="margin-top: 0; margin-bottom: 20px;">${title}</h3>
      
      <div style="margin-bottom: 20px;">
        <div style="color: var(--text-secondary); font-size: 0.9em; margin-bottom: 10px;">Current File:</div>
        <div id="currentFileName" style="font-family: monospace; font-size: 0.85em; color: var(--text-primary); margin-bottom: 15px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">Preparing...</div>
        
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
          <span id="overallProgress" style="color: var(--text-secondary);">0 / 0 files</span>
          <span id="fileProgress" style="font-size: 1.3em; font-weight: bold; color: var(--accent-purple);">0%</span>
        </div>
        <div class="progress-bar-container">
          <div id="overallProgressBar" class="progress-bar-fill" style="width: 0%"></div>
        </div>
      </div>
      
      <p style="color: var(--text-muted); font-size: 0.85em; margin: 15px 0 0 0; text-align: center;">
        Please wait while your project is being moved...
      </p>
    </div>
  `;
  document.body.appendChild(modal);
  return modal;
}

function updateProgressModal(data) {
  const fileNameEl = document.getElementById('currentFileName');
  const fileProgressEl = document.getElementById('fileProgress');
  const overallProgressEl = document.getElementById('overallProgress');
  const overallProgressBar = document.getElementById('overallProgressBar');
  
  if (fileNameEl) fileNameEl.textContent = data.fileName;
  if (fileProgressEl) fileProgressEl.textContent = `${Math.round(data.progress)}%`;
  if (overallProgressEl) overallProgressEl.textContent = `${data.completed} / ${data.total} files`;
  if (overallProgressBar) overallProgressBar.style.width = `${data.progress}%`;
}

function showSuccessMessage(message) {
  const toast = document.createElement('div');
  toast.className = 'toast-message success';
  toast.textContent = message;
  toast.style.cssText = `
    position: fixed;
    bottom: 20px;
    right: 20px;
    background: var(--success);
    color: white;
    padding: 15px 25px;
    border-radius: 8px;
    box-shadow: 0 4px 12px rgba(0,0,0,0.3);
    z-index: 10000;
    animation: slideIn 0.3s ease;
  `;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 3000);
}

// Make functions globally accessible
window.handleArchiveChoice = handleArchiveChoice;
window.handleReactivateChoice = handleReactivateChoice;

// Delete project function
async function deleteProject() { if (!currentProject) return; const modal = ensureProjectUI().createDeleteProjectModal(currentProject); document.body.appendChild(modal); }

// Create edit project modal
function createEditProjectModal() { return ensureProjectUI().createEditProjectModal(currentProject); }

function renderCalendar() { window.ensureCalendarModule().render(); }

// Render cleanup view
async function renderCleanup() { ensureCleanupManager().render(); }

// Legacy project UI helpers removed (now in ProjectUI module)

// AstroQC Integration Functions
async function analyzeAstroDirectory() {
  try {
    await window.astroQCIntegration.launchAstroAnalysis(settings.astroDirectory);
  } catch (error) {
    console.error('Failed to launch AstroQC astro analysis:', error);
    await window.showAlert('AstroQC Error', `Failed to launch AstroQC: ${error.message}`, 'error');
  }
}

async function analyzeCurrentProject() {
  if (!currentProject) {
    await window.showAlert('No Project Selected', 'Please select a project to analyze.', 'warning');
    return;
  }
  
  try {
    const projectPath = currentProject.path || currentProject.name;
    await window.astroQCIntegration.launchProjectAnalysis(projectPath);
  } catch (error) {
    console.error('Failed to launch AstroQC project analysis:', error);
    await window.showAlert('AstroQC Error', `Failed to launch AstroQC: ${error.message}`, 'error');
  }
}

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

// Instagram Post Creator Integration
async function openInstagramPostCreator() {
  console.log('Opening Instagram Post Creator');
  
  try {
    // Switch to Instagram Post Creator view
    switchView('instagramPostCreatorView');
    
    // Initialize the Instagram Post Creator if not already done
    if (!window.instagramPostCreatorTool) {
      // Give the DOM a moment to update before initializing
      setTimeout(() => {
        try {
          console.log('Initializing Instagram Post Creator...');
          const containerEl = document.getElementById('instagramPostCreatorContainer');
          if (!containerEl) {
            console.error('Instagram Post Creator container not found: #instagramPostCreatorContainer');
            return;
          }
          window.instagramPostCreatorTool = new InstagramPostCreator(containerEl);
          console.log('Instagram Post Creator initialized successfully');
        } catch (error) {
          console.error('Error initializing Instagram Post Creator:', error);
          alert('Error initializing Instagram Post Creator: ' + error.message);
        }
      }, 100);
    }
    
    console.log('Instagram Post Creator view opened successfully');
  } catch (error) {
    console.error('Error opening Instagram Post Creator:', error);
    alert('Error opening Instagram Post Creator: ' + error.message);
  }
}

// Finalizer Integration
async function openFinalizer() {
  console.log('Opening Finalizer');
  
  try {
    // Switch to Finalizer view
    switchView('finalizerView');
    
    // Initialize the Finalizer if not already done
    if (!window.finalizerInstance) {
      // Give the DOM a moment to update before initializing
      setTimeout(() => {
        try {
          console.log('Initializing Finalizer...');
          const containerEl = document.getElementById('finalizerContainer');
          if (!containerEl) {
            console.error('Finalizer container not found: #finalizerContainer');
            return;
          }
          window.finalizerInstance = new Finalizer('finalizerContainer');
          console.log('Finalizer initialized successfully');
        } catch (error) {
          console.error('Error initializing Finalizer:', error);
          alert('Error initializing Finalizer: ' + error.message);
        }
      }, 100);
    }
    
    console.log('Finalizer view opened successfully');
  } catch (error) {
    console.error('Error opening Finalizer:', error);
    alert('Error opening Finalizer: ' + error.message);
  }
}

// H-R Diagram Integration
function createHRDiagram() {
  console.log('Opening H-R Diagram view');
  
  // Switch to HR diagram view
  switchView('hrDiagramView');
  
  // Initialize HR diagram tool if not already initialized
  if (!window.hrDiagramInstance) {
    console.log('HRDiagram available:', typeof HRDiagram !== 'undefined');
    
    if (typeof HRDiagram === 'undefined') {
      console.error('H-R Diagram module not loaded');
      window.showAlert('Module Error', 'H-R Diagram functionality is not available. Please check console for errors.', 'error');
      return;
    }
    
    try {
      window.hrDiagramInstance = new HRDiagram('hrDiagramContainer');
      console.log('H-R Diagram initialized in main window');
    } catch (error) {
      console.error('Error initializing H-R diagram:', error);
      window.showAlert('Initialization Error', `Error initializing H-R diagram: ${error.message}`, 'error');
    }
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

  // Add event listener for Instagram Post Creator button if it exists
  const instagramPostCreatorButton = document.getElementById('instagramPostCreatorBtn');
  if (instagramPostCreatorButton) {
    // Remove any existing listeners
    instagramPostCreatorButton.replaceWith(instagramPostCreatorButton.cloneNode(true));
    const newInstagramPostCreatorButton = document.getElementById('instagramPostCreatorBtn');
    
    newInstagramPostCreatorButton.addEventListener('click', (e) => {
      e.preventDefault();
      console.log('Instagram Post Creator button clicked');
      openInstagramPostCreator();
    });
    
    console.log('Instagram Post Creator button listener added');
  } else {
    console.warn('Instagram Post Creator button not found in DOM');
  }

  // Add event listener for Finalizer button if it exists
  const finalizerButton = document.getElementById('finalizerBtn');
  if (finalizerButton) {
    // Remove any existing listeners
    finalizerButton.replaceWith(finalizerButton.cloneNode(true));
    const newFinalizerButton = document.getElementById('finalizerBtn');
    
    newFinalizerButton.addEventListener('click', (e) => {
      e.preventDefault();
      console.log('Finalizer button clicked');
      openFinalizer();
    });
    
    console.log('Finalizer button listener added');
  } else {
    console.warn('Finalizer button not found in DOM');
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

  // HR Diagram back button
  const backToToolsFromHRBtn = document.getElementById('backToToolsFromHRBtn');
  if (backToToolsFromHRBtn) {
    backToToolsFromHRBtn.addEventListener('click', (e) => {
      e.preventDefault();
      console.log('Back to Tools from HR Diagram button clicked');
      switchView('tools');
    });
    console.log('Back to Tools from HR Diagram button listener added');
  }

  // Instagram Post Creator back button
  const backToToolsFromInstagramBtn = document.getElementById('backToToolsFromInstagramBtn');
  if (backToToolsFromInstagramBtn) {
    backToToolsFromInstagramBtn.addEventListener('click', (e) => {
      e.preventDefault();
      console.log('Back to Tools from Instagram Post Creator button clicked');
      switchView('tools');
    });
    console.log('Back to Tools from Instagram Post Creator button listener added');
  }

  // Finalizer back button
  const backToToolsFromFinalizerBtn = document.getElementById('backToToolsFromFinalizerBtn');
  if (backToToolsFromFinalizerBtn) {
    backToToolsFromFinalizerBtn.addEventListener('click', (e) => {
      e.preventDefault();
      console.log('Back to Tools from Finalizer button clicked');
      switchView('tools');
    });
    console.log('Back to Tools from Finalizer button listener added');
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

// ------- SOLAR SIM INITIALIZATION -------
let solarSimInstance = null;

async function initializeSolarSim() {
  console.log('Initializing Solar Sim view');
  
  // Only initialize if we're actually on the solar sim view
  if (currentView !== 'solarSim') {
    console.log('Not on solar sim view, skipping initialization');
    return;
  }
  
  try {
    if (typeof SolarSimulator === 'undefined') {
      console.error('SolarSimulator class not loaded yet');
      // Retry after module loads
      setTimeout(() => {
        if (typeof SolarSimulator !== 'undefined' && !solarSimInstance && currentView === 'solarSim') {
          initializeSolarSim();
        }
      }, 500);
      return;
    }
    
    if (!solarSimInstance) {
      solarSimInstance = new SolarSimulator('solarSimView');
    }
    
    await solarSimInstance.show();
    console.log('Solar System Simulator shown');
  } catch (error) {
    console.error('Error initializing solar sim:', error);
  }
}
// ------- END SOLAR SIM INITIALIZATION -------
