// Project Manager Module
// Encapsulates project CRUD, synchronization with targets, completion toggle, deletion, and thumbnail auto-detection.
// Keeps side-effect (DOM/UI) logic outside; app.js remains orchestrator.

class ProjectManager {
  constructor(electronAPI, options = {}) {
    this.electronAPI = electronAPI;
    this.log = options.log || (() => {});
    this.getSettings = options.getSettings || (() => ({}));
    this.projects = [];
  }

  setProjects(projects) {
    this.projects = Array.isArray(projects) ? projects : [];
    return this.projects;
  }

  getProjects() { return this.projects; }

  async save() {
    try {
      await this.electronAPI.saveProjects(this.projects);
    } catch (e) {
      console.error('ProjectManager.save failed:', e);
    }
    return this.projects;
  }

  async syncFromTargets(targets) {
    const byName = new Map(this.projects.map(p => [p.name, p]));
    const libraryPath = this.getSettings()?.storagePath || null;
    for (const t of targets) {
      const existing = byName.get(t.name);
      if (!existing) {
        const project = {
          id: Date.now() + Math.random(),
            name: t.name,
            status: 'current',
            totalTime: t.totalTime,
            imageCount: t.imageCount,
            filters: t.filters,
            createdAt: new Date().toISOString(),
            completedAt: null,
            thumbnailPath: null,
            integrationTargetHours: null,
            libraryPath
        };
        this.projects.push(project);
        this.log('Project created from target sync', { target: t.name });
      } else {
        existing.totalTime = t.totalTime;
        existing.imageCount = t.imageCount;
        existing.filters = t.filters;
        if (!existing.libraryPath) existing.libraryPath = libraryPath; // migrate legacy
        this.log('Project updated from target sync', { target: t.name });
      }
    }
    await this.save();
    return this.projects;
  }

  async toggleCompletion(projectId) {
    const p = this.projects.find(p => p.id === projectId);
    if (!p) return null;
    if (p.status === 'completed') {
      p.status = 'current';
      p.completedAt = null;
    } else {
      p.status = 'completed';
      p.completedAt = new Date().toISOString();
    }
    this.log('Project completion toggled', { project: p.name, status: p.status });
    await this.save();
    return p;
  }

  async deleteProject(project, { deleteFiles = false, blacklist = false } = {}) {
    if (!project) return false;
    const idx = this.projects.findIndex(p => p.id === project.id);
    if (idx !== -1) this.projects.splice(idx, 1);

    if (blacklist) {
      try {
        const settings = this.getSettings();
        settings.projectBlacklist = settings.projectBlacklist || [];
        const lowered = project.name.toLowerCase();
        if (!settings.projectBlacklist.includes(lowered)) settings.projectBlacklist.push(lowered);
        await this.electronAPI.saveSettings(settings);
        this.log('Project blacklisted', { project: project.name });
      } catch (e) {
        console.error('Failed to update project blacklist', e);
      }
    }

    if (deleteFiles) {
      // Placeholder for future implementation.
      this.log('Requested file deletion not yet implemented', { project: project.name });
    }

    await this.save();
    this.log('Project deleted', { project: project.name, deleteFiles, blacklist });
    return true;
  }

  async autoDetectMissingThumbnails(storagePath) {
    if (!storagePath) return this.projects;
    for (const p of this.projects) {
      if (!p.thumbnailPath) {
        try {
          const result = await this.electronAPI.findProjectThumbnail?.(p.name, storagePath);
          if (result && result.success && result.thumbnailPath) {
            p.thumbnailPath = result.thumbnailPath;
            this.log('Thumbnail auto-detected', { project: p.name });
          }
        } catch (e) {
          console.warn('Thumbnail detection failed for', p.name, e);
        }
      }
    }
    await this.save();
    return this.projects;
  }

  async cleanupOrphanedProjects(storagePath) {
    if (!storagePath) return { removed: [], kept: this.projects };
    
    const removed = [];
    const kept = [];
    
    this.log('Starting orphaned project cleanup', { totalProjects: this.projects.length, storagePath });
    
    for (const project of this.projects) {
      let shouldKeep = true;
      let reason = null;
      
      // Check if project directory exists
      const projectPath = project.path || `${storagePath}/${project.name}`;
      const pathCheck = await this.electronAPI.checkPathExists?.(projectPath);
      
      if (pathCheck && !pathCheck.exists) {
        shouldKeep = false;
        reason = `Project directory not found: ${projectPath}`;
      }
      
      // If thumbnail path is set, check if it exists
      if (shouldKeep && project.thumbnailPath) {
        const thumbCheck = await this.electronAPI.checkPathExists?.(project.thumbnailPath);
        if (thumbCheck && !thumbCheck.exists) {
          // Don't remove project just for missing thumbnail, but clear the path
          this.log('Clearing invalid thumbnail path', { project: project.name, oldPath: project.thumbnailPath });
          project.thumbnailPath = null;
        }
      }
      
      if (shouldKeep) {
        kept.push(project);
      } else {
        removed.push({ project, reason });
        this.log('Removing orphaned project', { project: project.name, reason });
      }
    }
    
    if (removed.length > 0) {
      this.projects = kept;
      await this.save();
      this.log('Orphaned project cleanup complete', { 
        removed: removed.length, 
        kept: kept.length,
        removedProjects: removed.map(r => ({ name: r.project.name, reason: r.reason }))
      });
    } else {
      this.log('No orphaned projects found');
    }
    
    return { removed, kept };
  }
}

window.ProjectManager = ProjectManager;
