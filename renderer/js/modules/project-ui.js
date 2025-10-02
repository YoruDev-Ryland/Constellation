// Project UI Module
// Handles project detail population, card updates, edit & delete modal creation, and thumbnail actions.

// Persistent in-memory resized thumbnail cache (data URL) – survives view switches
if (!window.__CONSTELLATION) window.__CONSTELLATION = {};
if (!window.__CONSTELLATION.thumbCache) {
  window.__CONSTELLATION.thumbCache = {
    data: new Map(),            // originalPath -> dataURL (resized)
    inflight: new Map(),        // originalPath -> Promise
    stats: { hits:0, misses:0, processed:0 },
    maxEntries: 500,
    prune() {
      const { data, maxEntries } = this;
      if (data.size <= maxEntries) return;
      // Simple FIFO prune (Map preserves insertion order)
      const excess = data.size - maxEntries;
      let i = 0;
      for (const key of data.keys()) {
        if (i++ >= excess) break;
        data.delete(key);
      }
    }
  };
}

class ProjectUI {
  constructor(options = {}) {
    this.getProjects = options.getProjects || (() => []);
    this.getCurrentProject = options.getCurrentProject || (() => null);
    this.setCurrentProject = options.setCurrentProject || (() => {});
    this.saveProjects = options.saveProjects || (async () => {});
    this.findThumbnail = options.findThumbnail || (async () => ({ success:false }));

    // Configurable thumbnail processing settings
    this.thumbMaxSize = 480;      // max width/height for project grid
    this.thumbQuality = 0.70;     // JPEG quality
    this.concurrentDecode = 4;    // parallel decode limit
    this.decodeQueue = [];
    this.activeDecodes = 0;
  }

  // ---------- Internal Thumbnail Helpers ----------
  _getCache() { return window.__CONSTELLATION.thumbCache; }

  _scheduleDecode(task) {
    this.decodeQueue.push(task);
    this._drainDecodeQueue();
  }

  _drainDecodeQueue() {
    while (this.activeDecodes < this.concurrentDecode && this.decodeQueue.length) {
      const task = this.decodeQueue.shift();
      this.activeDecodes++;
      
      // Use requestIdleCallback like calendar for better performance
      const executeTask = () => {
        task().finally(() => { 
          this.activeDecodes--; 
          this._drainDecodeQueue(); 
        });
      };

      if ('requestIdleCallback' in window) {
        requestIdleCallback(executeTask, { timeout: 100 });
      } else {
        setTimeout(executeTask, 0);
      }
    }
  }

  async _ensureResized(srcPath) {
    const cache = this._getCache();
    if (!srcPath) return null;

    if (cache.data.has(srcPath)) { cache.stats.hits++; return cache.data.get(srcPath); }
    if (cache.inflight.has(srcPath)) return cache.inflight.get(srcPath);

    cache.stats.misses++;
    
    const promise = new Promise((resolve) => {
      const loadImage = () => {
        return new Promise((imageResolve, imageReject) => {
          const img = new Image();
          
          img.onload = async () => {
            try {              
              // Create thumbnail like calendar does
              const thumbnailUrl = await this._createThumbnail(srcPath, img);
              cache.data.set(srcPath, thumbnailUrl);
              cache.stats.processed++;
              cache.prune();
              imageResolve(thumbnailUrl);
            } catch (error) {
              console.warn('[ProjectUI] Failed to process image:', error);
              const fallbackUrl = `url('file://${srcPath.replace(/'/g, "%27")}')`;
              cache.data.set(srcPath, fallbackUrl);
              imageResolve(fallbackUrl);
            }
          };
          
          img.onerror = (e) => {
            console.warn('[ProjectUI] Image load failed for:', srcPath);
            imageReject(e);
          };
          
          img.src = `file://${srcPath}`;
        });
      };

      // Use requestIdleCallback like calendar
      if ('requestIdleCallback' in window) {
        requestIdleCallback(async () => {
          try {
            const result = await loadImage();
            resolve(result);
          } catch (e) {
            resolve(null);
          }
        }, { timeout: 1000 });
      } else {
        setTimeout(async () => {
          try {
            const result = await loadImage();
            resolve(result);
          } catch (e) {
            resolve(null);
          }
        }, 0);
      }
    }).finally(() => cache.inflight.delete(srcPath));

    cache.inflight.set(srcPath, promise);
    return promise;
  }

  async _createThumbnail(imagePath, originalImage) {
    return new Promise((resolve) => {
      try {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        
        // Calculate dimensions maintaining aspect ratio
        const { width: originalWidth, height: originalHeight } = originalImage;
        const maxSize = this.thumbMaxSize;
        
        let { width, height } = originalImage;
        if (width > height) {
          if (width > maxSize) {
            height = (height * maxSize) / width;
            width = maxSize;
          }
        } else {
          if (height > maxSize) {
            width = (width * maxSize) / height;
            height = maxSize;
          }
        }
        
        canvas.width = width;
        canvas.height = height;
        
        // Enable image smoothing for better quality
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        
        // Draw the resized image
        ctx.drawImage(originalImage, 0, 0, width, height);
        
        // Convert to data URL for CSS usage
        const thumbnailDataUrl = canvas.toDataURL('image/jpeg', this.thumbQuality);
        const cssUrl = `url('${thumbnailDataUrl}')`;
        
        // Clean up canvas
        canvas.width = 0;
        canvas.height = 0;
        
        resolve(cssUrl);
      } catch (error) {
        console.warn('[ProjectUI] Failed to create thumbnail:', error);
        // Fallback to original image URL
        const fallbackUrl = `url('file://${imagePath.replace(/'/g, "%27")}')`;
        resolve(fallbackUrl);
      }
    });
  }

  async _applyThumb(thumbEl, originalPath) {
    if (!originalPath || !thumbEl) return;
    
    const cached = await this._ensureResized(originalPath);
    if (!cached) { 
      thumbEl.classList.add('thumb-error'); 
      return; 
    }
    // If element was removed or reused, guard
    if (!document.body.contains(thumbEl)) return;
    
    requestAnimationFrame(() => {
      // Use background-image approach like calendar for reliability
      thumbEl.style.cssText += `
        background-image: ${cached};
        background-size: cover;
        background-position: center;
        background-repeat: no-repeat;
        width: 100%;
        height: 100%;
        min-height: 120px;
        display: block;
      `;
      thumbEl.classList.add('thumb-loaded', 'has-image');
      const spinner = thumbEl.parentElement?.querySelector('.thumb-spinner');
      if (spinner) spinner.remove();
    });
  }

  // -------------- Existing Methods (Unchanged unless integrating) --------------
  viewProject(projectId) {
    const projects = this.getProjects();
    const project = projects.find(p => p.id == projectId);
    if (!project) return;
    this.setCurrentProject(project);
    window.switchView('projectDetailsView');
    setTimeout(() => this.populateProjectDetails(project), 50);
  }

  populateProjectDetails(project) {
    const detailsView = document.getElementById('projectDetailsView');
    if (!detailsView) return;
    const titleEl = document.getElementById('projectDetailsTitle');
    const subEl = document.getElementById('projectDetailsSubtitle');
    if (!titleEl || !subEl) return;

    titleEl.textContent = project.name;
    subEl.textContent = `${project.status.charAt(0).toUpperCase() + project.status.slice(1)} Project`;

    const imageCountEl = document.getElementById('projectImageCount');
    const totalTimeEl = document.getElementById('projectTotalTime');
    const filterCountEl = document.getElementById('projectFilterCount');
    const createdDateEl = document.getElementById('projectCreatedDate');

    if (imageCountEl) imageCountEl.textContent = project.imageCount.toLocaleString();
    if (totalTimeEl) totalTimeEl.textContent = `${(project.totalTime / 3600).toFixed(1)}h`;
    if (filterCountEl) filterCountEl.textContent = Object.keys(project.filters).length;
    if (createdDateEl) createdDateEl.textContent = new Date(project.createdAt).toLocaleDateString();

    const filtersList = document.getElementById('projectFiltersList');
    if (filtersList) {
      filtersList.innerHTML = Object.entries(project.filters).map(([filter,data]) => `
        <div class="filter-item">
          <div class="filter-name">${filter}</div>
          <div class="filter-stats">
            <div>${data.count} images</div>
            <div>${(data.time / 3600).toFixed(1)}h</div>
          </div>
        </div>`).join('');
    }

    const infoList = document.getElementById('projectInfoList');
    if (infoList) {
      const avgExposure = project.imageCount > 0 ? project.totalTime / project.imageCount : 0;
      const targetSeconds = (project.integrationTargetHours || 0) * 3600;
      const completionRaw = targetSeconds > 0 ? (project.totalTime / targetSeconds) * 100 : 0;
      const completionDisplay = targetSeconds === 0 ? '—' : `${completionRaw.toFixed(1)}%`;
      infoList.innerHTML = `
        <div class="info-item"><span class="info-label">Status</span><span class="info-value">${project.status.charAt(0).toUpperCase() + project.status.slice(1)}</span></div>
        <div class="info-item"><span class="info-label">Average Exposure</span><span class="info-value">${avgExposure.toFixed(0)}s</span></div>
        <div class="info-item"><span class="info-label">Integration Target</span><span class="info-value">${project.integrationTargetHours ? project.integrationTargetHours + 'h' : 'None'}</span></div>
        <div class="info-item"><span class="info-label">Completion</span><span class="info-value">${completionDisplay}</span></div>`;
    }

    // Attempt to create acquisition chart once DOM populated
    const tryChart = () => {
      const canvas = document.getElementById('acquisitionChart');
      if (!canvas) return false;
      const visible = canvas.offsetParent !== null; // hidden if null
      if (!visible) return false;
      if (canvas.offsetWidth === 0) return false;
      if (typeof ensureAcquisitionCharts === 'function') {
        // Spinner already inserted by details view skeleton; chart builder will remove it
        try { window.buildAcquisitionChart?.(project); } catch (e) { console.error('Chart creation error:', e); }
      }
      return true;
    };
    // Try a few frames until layout stabilizes
    let attempts = 0;
    const maxAttempts = 10;
    const loop = () => { if (!tryChart() && attempts++ < maxAttempts) requestAnimationFrame(loop); };
    requestAnimationFrame(loop);

    // Ensure debug button will create chart if still missing
    const debugBtn = document.getElementById('debugChartBtn');
    if (debugBtn && !debugBtn.__chartHooked) {
      debugBtn.__chartHooked = true;
      debugBtn.addEventListener('click', () => {
        const acq = (typeof ensureAcquisitionCharts === 'function') ? ensureAcquisitionCharts() : null;
        if (acq && !acq.chartInstance) {
          console.log('[ProjectUI] Debug pressed, no chart instance—creating now.');
          acq.createChart(project);
        }
      }, { once: false });
    }
  }

  updateProjectCard(project) {
    const projectCards = document.querySelectorAll('.project-card');
    let targetCard = null;
    for (const card of projectCards) {
      const pathAttr = card.getAttribute('data-path');
      if (pathAttr === project.path) { targetCard = card; break; }
    }
    if (!targetCard) return;
    const nameEl = targetCard.querySelector('.project-name');
    if (nameEl) nameEl.textContent = project.name;
    const iconEl = targetCard.querySelector('.project-icon');
    if (iconEl) {
      if (project.thumbnailPath) {
        const cache = this._getCache();
        const p = project.thumbnailPath;
        if (cache.data.has(p)) {
          // Apply cached background-image
          iconEl.innerHTML = `<div class="project-thumb thumb-loaded has-image" style="background-image: ${cache.data.get(p)}; background-size: cover; background-position: center; background-repeat: no-repeat;"></div>`;
        } else {
          // Insert skeleton while scheduling decode
          iconEl.innerHTML = `<div class="project-thumb lazy-thumb" data-original="${p}"></div><div class="thumb-spinner"></div>`;
          const thumbEl = iconEl.querySelector('.project-thumb');
          this._scheduleDecode(() => this._applyThumb(thumbEl, p));
        }
      } else {
        iconEl.innerHTML = `<svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor">
          <circle cx="12" cy="12" r="10"/>
          <circle cx="12" cy="12" r="3"/>
          <line x1="12" y1="2" x2="12" y2="6"/>
          <line x1="12" y1="18" x2="12" y2="22"/>
          <line x1="4.93" y1="4.93" x2="7.76" y2="7.76"/>
          <line x1="16.24" y1="16.24" x2="19.07" y2="19.07"/>
          <line x1="2" y1="12" x2="6" y2="12"/>
          <line x1="18" y1="12" x2="22" y2="12"/>
          <line x1="4.93" y1="19.07" x2="7.76" y2="16.24"/>
          <line x1="16.24" y1="7.76" x2="19.07" y2="4.93"/>
        </svg>`;
      }
    }
  }

  createEditProjectModal(project) {
    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.id = 'editProjectModal';
    const currentThumbnail = project.thumbnailPath || '';
    modal.innerHTML = `
      <div class="modal-content" style="max-width: 600px;">
        <div class="modal-header">
          <h2>Edit Project: ${project.name}</h2>
          <button class="btn-icon" id="closeEditModal">\n            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor">\n              <line x1="18" y1="6" x2="6" y2="18"/>\n              <line x1="6" y1="6" x2="18" y2="18"/>\n            </svg>\n          </button>
        </div>
        <div class="modal-body">
          <div class="edit-section">
            <h3>Project Information</h3>
            <div class="input-group"><label for="editProjectName">Project Name</label><input type="text" id="editProjectName" value="${project.name}"></div>
            <div class="input-group"><label for="editIntegrationTarget">Integration Target (hours)</label><input type="number" id="editIntegrationTarget" min="0" step="0.5" value="${project.integrationTargetHours ?? ''}" placeholder="e.g. 12"></div>
          </div>
          <div class="edit-section">
            <h3>Project Thumbnail</h3>
            <div class="thumbnail-section"><div class="current-thumbnail"><div class="thumbnail-preview" id="thumbnailPreview">${currentThumbnail ? `<img src="file://${currentThumbnail}" alt="Project thumbnail">` : this._defaultThumbIcon()}</div>
              <div class="thumbnail-actions">
                <button class="btn-secondary" id="autoFindThumbnailBtn">Auto-find</button>
                <button class="btn-secondary" id="selectCustomThumbnailBtn">Custom</button>
                <button class="btn-secondary" id="clearThumbnailBtn">Clear</button>
              </div></div></div>
          </div>
          <div class="edit-section danger-section">
            <h3>Danger Zone</h3>
            <button class="btn-danger" id="deleteProjectFromModalBtn">Delete Project</button>
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn-secondary" id="cancelEditBtn">Cancel</button>
          <button class="btn-primary" id="saveProjectBtn">Save Changes</button>
        </div>
      </div>`;
    setTimeout(()=> this._wireEditModal(modal, project),0);
    return modal;
  }

  createDeleteProjectModal(project) {
    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.id = 'deleteProjectModal';
    modal.innerHTML = `
      <div class="modal-content" style="max-width: 500px;">
        <div class="modal-header"><h2>Delete Project: ${project.name}</h2><button class="btn-icon" id="closeDeleteModal">×</button></div>
        <div class="modal-body">
          <p>How would you like to delete this project?</p>
          <div class="delete-options">
            <div class="delete-option" id="deleteFromProgramOption"><div class="option-content"><h3>Remove from Constellation</h3><p>Delete the project from the app but keep all image files</p></div></div>
            <div class="delete-option" id="deleteFilesOption"><div class="option-content"><h3>Delete Files & Remove</h3><p>Permanently delete all image files and remove from app</p><small class="warning">⚠️ This cannot be undone!</small></div></div>
          </div>
          <div class="blacklist-option" id="blacklistContainer" style="display:none;"><label class="checkbox-label"><input type="checkbox" id="blacklistProject"><span class="checkmark"></span>Blacklist this project name</label></div>
        </div>
      </div>`;
    setTimeout(()=> this._wireDeleteModal(modal, project),0);
    return modal;
  }

  _wireEditModal(modal, project) {
    const close = () => modal.remove();
    modal.querySelector('#closeEditModal').addEventListener('click', close);
    modal.querySelector('#cancelEditBtn').addEventListener('click', close);
    modal.addEventListener('click', e => { if (e.target === modal) close(); });
    modal.querySelector('#saveProjectBtn').addEventListener('click', async () => {
      const newName = modal.querySelector('#editProjectName').value.trim();
      if (!newName) { alert('Project name cannot be empty'); return; }
      const targetValRaw = modal.querySelector('#editIntegrationTarget').value.trim();
      const targetVal = targetValRaw === '' ? null : Math.max(0, parseFloat(targetValRaw));
      let changed = false;
      if (newName !== project.name) { project.name = newName; changed = true; }
      if (targetVal !== project.integrationTargetHours) { project.integrationTargetHours = targetVal; changed = true; }
      if (changed) {
        await this.saveProjects(this.getProjects());
        this.updateProjectCard(project);
        this.populateProjectDetails(project);
      }
      close();
    });
    modal.querySelector('#autoFindThumbnailBtn').addEventListener('click', async () => {
      try {
        const result = await this.findThumbnail(project.name);
        if (result.success && result.thumbnailPath) {
          project.thumbnailPath = result.thumbnailPath;
          await this.saveProjects(this.getProjects());
          this.updateProjectCard(project);
          this.populateProjectDetails(project);
          modal.querySelector('#thumbnailPreview').innerHTML = `<img src="file://${project.thumbnailPath}" alt="Project thumbnail">`;
        } else {
          alert(result.error || 'No thumbnail images found');
        }
      } catch (e) { console.error('Thumbnail search failed', e); alert('Error finding thumbnail'); }
    });
    modal.querySelector('#selectCustomThumbnailBtn').addEventListener('click', async () => {
      try {
        const selectedPath = await window.electronAPI.selectCustomThumbnail();
        if (selectedPath) {
          const copiedPath = await window.electronAPI.copyThumbnailToProject(selectedPath, project.path);
          if (copiedPath) {
            project.thumbnailPath = copiedPath;
            await this.saveProjects(this.getProjects());
            this.updateProjectCard(project);
            this.populateProjectDetails(project);
            modal.querySelector('#thumbnailPreview').innerHTML = `<img src="file://${project.thumbnailPath}" alt="Project thumbnail">`;
          }
        }
      } catch (e) { console.error('Error selecting custom thumbnail:', e); alert('Error uploading thumbnail'); }
    });
    modal.querySelector('#clearThumbnailBtn').addEventListener('click', async () => {
      project.thumbnailPath = null;
      await this.saveProjects(this.getProjects());
      this.updateProjectCard(project);
      this.populateProjectDetails(project);
      modal.querySelector('#thumbnailPreview').innerHTML = this._defaultThumbIcon();
    });
    modal.querySelector('#deleteProjectFromModalBtn').addEventListener('click', () => {
      close();
      setTimeout(() => {
        const delModal = this.createDeleteProjectModal(project);
        document.body.appendChild(delModal);
      }, 100);
    });
  }

  _wireDeleteModal(modal, project) {
    const close = () => modal.remove();
    modal.querySelector('#closeDeleteModal').addEventListener('click', close);
    modal.addEventListener('click', e => { if (e.target === modal) close(); });
    setTimeout(() => {
      modal.querySelector('#deleteFromProgramOption').addEventListener('click', () => {
        document.getElementById('blacklistContainer').style.display = 'block';
        this._confirmDeletion(project, false);
      });
      modal.querySelector('#deleteFilesOption').addEventListener('click', () => {
        this._confirmDeletion(project, true);
      });
    },0);
  }

  _confirmDeletion(project, deleteFiles) {
    const shouldBlacklist = document.getElementById('blacklistProject')?.checked || false;
    const actionText = deleteFiles ? 'permanently delete all image files and remove this project' : 'remove this project from Constellation';
    const confirmText = `Are you sure you want to ${actionText}?\n\nProject: ${project.name}\nImages: ${project.imageCount}\nTotal Time: ${(project.totalTime / 3600).toFixed(1)}h` +
      (shouldBlacklist ? '\n\nThis project will be blacklisted from future scans.' : '') +
      (deleteFiles ? '\n\n⚠️ THIS WILL PERMANENTLY DELETE ALL FILES!' : '');
    if (confirm(confirmText)) {
      window.executeProjectDeletion(deleteFiles, shouldBlacklist); // reuse existing global pipeline
    }
  }

  _defaultThumbIcon() {
    return `<svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor">
      <rect x="3" y="3" width="18" height="18" rx="2"/>
      <circle cx="9" cy="9" r="2"/>
      <path d="M21 15l-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/>
    </svg>`;
  }

  // Override project card markup to use div with background-image like calendar
  _projectCardMarkup(project) {
    const hasThumb = !!project.thumbnailPath;
    const thumb = hasThumb ?
      `<div class="project-thumb lazy-thumb" data-original="${project.thumbnailPath}"></div>` :
      `<div class="thumb-placeholder skeleton"></div>`;
    const targetSeconds = (project.integrationTargetHours || 0) * 3600;
    const pctRaw = targetSeconds > 0 ? (project.totalTime / targetSeconds) * 100 : 0;
    const pctBar = Math.min(100, pctRaw);
    const showBar = targetSeconds > 0 && pctBar >= 0;
    const progressBar = showBar ? `<div class="integration-progress" style="width:${pctBar}%;"></div>` : '';
    const pctBadge = showBar ? `<span class="integration-badge">${pctRaw.toFixed(0)}%</span>` : '';
    return `
      <div class="project-card" data-path="${project.path}" onclick="viewProject('${project.id}')">
        <div class="project-image">
          <div class="project-icon thumb-wrapper">${thumb}<div class="thumb-spinner"></div></div>
          <div class="project-content">
            <div class="project-title"><span class="project-name">${project.name}</span>${pctBadge}</div>
            <div class="project-meta">${project.imageCount} images • ${(project.totalTime / 3600).toFixed(1)}h${project.integrationTargetHours ? ' / ' + project.integrationTargetHours + 'h target' : ''}</div>
          </div>
        </div>
        ${progressBar}
      </div>`;
  }

  renderProjectGrid(containerId, projectList, emptyMessage) {
    const container = document.getElementById(containerId);
    if (!container) return;
    if (projectList.length === 0) {
      container.innerHTML = `<div class="empty-state"><p>${emptyMessage}</p></div>`;
      return;
    }

    const cache = this._getCache();
    const base = 40; // baseline batch size
    const BATCH_SIZE = projectList.length > 400 ? 80 : projectList.length > 200 ? 60 : base;
    container.innerHTML = '';
    let index = 0;
    const total = projectList.length;

    // Clean up old observer
    this._gridImageObserver?.disconnect();
    if ('IntersectionObserver' in window) {
      this._gridImageObserver = new IntersectionObserver((entries, obs) => {
        entries.forEach(e => {
          if (e.isIntersecting) {
            const thumbEl = e.target;
            const original = thumbEl.getAttribute('data-original');
            if (original) {
              this._scheduleDecode(() => this._applyThumb(thumbEl, original));
              obs.unobserve(thumbEl);
            }
          }
        });
      }, { rootMargin: '150px', threshold: 0.01 });
    }

    const observeNew = (scope) => {
      if (!this._gridImageObserver) return;
      const thumbElements = scope.querySelectorAll('.lazy-thumb[data-original]');
      thumbElements.forEach(thumbEl => {
        const p = thumbEl.getAttribute('data-original');
        if (p && cache.data.has(p)) {
          this._applyThumb(thumbEl, p);
        } else {
          this._gridImageObserver.observe(thumbEl);
        }
      });
    };

    const frag = () => document.createDocumentFragment();
    const perfLog = (label, t0) => { if (window.__CONST_DEBUG_PERF) console.log('[ProjectGridPerf]', label, (performance.now()-t0).toFixed(1)+'ms'); };

    const renderBatch = () => {
      const t0 = performance.now();
      const fragment = frag();
      const end = Math.min(index + BATCH_SIZE, total);
      for (let i = index; i < end; i++) {
        const wrapper = document.createElement('div');
        wrapper.innerHTML = this._projectCardMarkup(projectList[i]);
        fragment.appendChild(wrapper.firstElementChild);
      }
      container.appendChild(fragment);
      observeNew(container);
      index = end;
      perfLog('batch '+end+'/'+total, t0);
      if (index < total) {
        (window.requestIdleCallback ? window.requestIdleCallback(renderBatch, { timeout: 120 }) : setTimeout(renderBatch, 16));
      } else {
        perfLog('all batches complete', t0);
        if (window.__CONST_DEBUG_PERF) console.log('[ThumbCacheStats]', cache.stats);
      }
    };
    renderBatch();
  }

  _activateLazyImages(scope) { /* deprecated with new pipeline */ }
}

window.ProjectUI = ProjectUI;
