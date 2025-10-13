// AstroQC Integration Module
// Handles launching AstroQC with different analysis modes for astro directories, projects, and filter folders

class AstroQCIntegration {
  constructor() {
    this.isInitialized = false;
    this.settingsManager = null;
  }

  async initialize(settingsManager) {
    this.settingsManager = settingsManager;
    this.isInitialized = true;
    console.log('[AstroQC] Integration module initialized');
  }

  /**
   * Launch AstroQC with --auto-astro argument for analyzing entire astro directory
   * @param {string} astroPath - Path to the astro root directory
   */
  async launchAstroAnalysis(astroPath) {
    if (!this.isInitialized) {
      console.error('[AstroQC] Integration not initialized');
      return { success: false, error: 'Integration not initialized' };
    }

    try {
      const settings = await this.settingsManager.loadSettings();
      const astroQCPath = settings.astroQC?.path;

      if (!astroQCPath) {
        await window.showAlert('AstroQC Not Configured', 'AstroQC path is not configured. Please configure it in Settings to use this feature.', 'warning');
        return { success: false, error: 'AstroQC path not configured' };
      }

      console.log('[AstroQC] Launching astro analysis:', { astroQCPath, astroPath });

      // Launch AstroQC with --auto-astro argument
      const result = await window.electronAPI.launchProgram(astroQCPath, ['--auto-astro', astroPath]);
      
      if (result.success) {
        console.log('[AstroQC] Successfully launched astro analysis');
        // Optional: Show success notification
        this._showNotification('AstroQC launched for astro directory analysis');
      } else {
        console.error('[AstroQC] Failed to launch astro analysis:', result.error);
        await window.showAlert('AstroQC Launch Failed', `Failed to launch AstroQC: ${result.error}`, 'error');
      }

      return result;
    } catch (error) {
      console.error('[AstroQC] Error launching astro analysis:', error);
      await window.showAlert('AstroQC Error', `Error launching AstroQC: ${error.message}`, 'error');
      return { success: false, error: error.message };
    }
  }

  /**
   * Launch AstroQC with --auto-project argument for analyzing specific project
   * @param {string} projectPath - Path to the project directory
   */
  async launchProjectAnalysis(projectPath) {
    if (!this.isInitialized) {
      console.error('[AstroQC] Integration not initialized');
      return { success: false, error: 'Integration not initialized' };
    }

    try {
      const settings = await this.settingsManager.loadSettings();
      const astroQCPath = settings.astroQC?.path;

      if (!astroQCPath) {
        await window.showAlert('AstroQC Not Configured', 'AstroQC path is not configured. Please configure it in Settings to use this feature.', 'warning');
        return { success: false, error: 'AstroQC path not configured' };
      }

      console.log('[AstroQC] Launching project analysis:', { astroQCPath, projectPath });

      // Launch AstroQC with --auto-project argument
      const result = await window.electronAPI.launchProgram(astroQCPath, ['--auto-project', projectPath]);
      
      if (result.success) {
        console.log('[AstroQC] Successfully launched project analysis');
        this._showNotification('AstroQC launched for project analysis');
      } else {
        console.error('[AstroQC] Failed to launch project analysis:', result.error);
        await window.showAlert('AstroQC Launch Failed', `Failed to launch AstroQC: ${result.error}`, 'error');
      }

      return result;
    } catch (error) {
      console.error('[AstroQC] Error launching project analysis:', error);
      await window.showAlert('AstroQC Error', `Error launching AstroQC: ${error.message}`, 'error');
      return { success: false, error: error.message };
    }
  }

  /**
   * Launch AstroQC with --auto-folder argument for analyzing specific filter folder
   * @param {string} filterPath - Path to the filter folder containing FITS files
   */
  async launchFilterAnalysis(filterPath) {
    if (!this.isInitialized) {
      console.error('[AstroQC] Integration not initialized');
      return { success: false, error: 'Integration not initialized' };
    }

    try {
      const settings = await this.settingsManager.loadSettings();
      const astroQCPath = settings.astroQC?.path;

      if (!astroQCPath) {
        await window.showAlert('AstroQC Not Configured', 'AstroQC path is not configured. Please configure it in Settings to use this feature.', 'warning');
        return { success: false, error: 'AstroQC path not configured' };
      }

      console.log('[AstroQC] Launching filter analysis:', { astroQCPath, filterPath });

      // Launch AstroQC with --auto-folder argument
      const result = await window.electronAPI.launchProgram(astroQCPath, ['--auto-folder', filterPath]);
      
      if (result.success) {
        console.log('[AstroQC] Successfully launched filter analysis');
        this._showNotification('AstroQC launched for filter analysis');
      } else {
        console.error('[AstroQC] Failed to launch filter analysis:', result.error);
        await window.showAlert('AstroQC Launch Failed', `Failed to launch AstroQC: ${result.error}`, 'error');
      }

      return result;
    } catch (error) {
      console.error('[AstroQC] Error launching filter analysis:', error);
      await window.showAlert('AstroQC Error', `Error launching AstroQC: ${error.message}`, 'error');
      return { success: false, error: error.message };
    }
  }

  /**
   * Create an AstroQC button element with consistent styling
   * @param {string} type - Button type: 'astro', 'project', or 'filter'
   * @param {string} text - Button text
   * @param {Function} clickHandler - Click handler function
   * @returns {HTMLElement} Button element
   */
  createButton(type, text, clickHandler) {
    const button = document.createElement('button');
    
    // Set appropriate classes based on button type
    switch (type) {
      case 'astro':
        button.className = 'btn-primary astroqc-btn astroqc-astro-btn';
        break;
      case 'project':
        button.className = 'btn-success astroqc-btn astroqc-project-btn';
        break;
      case 'filter':
        button.className = 'btn-secondary astroqc-btn astroqc-filter-btn';
        break;
      default:
        button.className = 'btn-secondary astroqc-btn';
    }

    // Add icon and text
    const icon = document.createElement('i');
    icon.className = 'fas fa-microscope';
    
    button.appendChild(icon);
    button.appendChild(document.createTextNode(' ' + text));
    
    // Attach click handler
    button.addEventListener('click', clickHandler);
    
    return button;
  }

  /**
   * Show a brief notification to user (could be enhanced with proper toast system later)
   * @param {string} message - Notification message
   */
  _showNotification(message) {
    // For now, just log to console. Could be enhanced with a proper toast notification system
    console.log('[AstroQC] Notification:', message);
    
    // Simple temporary notification (could be replaced with better UI later)
    const notification = document.createElement('div');
    notification.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      background: var(--accent-green);
      color: white;
      padding: 12px 20px;
      border-radius: 8px;
      z-index: 10000;
      font-size: 14px;
      box-shadow: var(--shadow-lg);
      animation: slideIn 0.3s ease-out;
    `;
    notification.textContent = message;
    
    document.body.appendChild(notification);
    
    // Auto-remove after 3 seconds
    setTimeout(() => {
      if (notification.parentNode) {
        notification.style.animation = 'slideOut 0.3s ease-in';
        setTimeout(() => notification.remove(), 300);
      }
    }, 3000);
  }
}

// Create global instance
window.astroQCIntegration = new AstroQCIntegration();