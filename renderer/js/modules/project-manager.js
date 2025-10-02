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
}

window.ProjectManager = ProjectManager;
