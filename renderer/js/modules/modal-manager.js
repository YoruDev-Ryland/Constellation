/**
 * Global Modal Manager
 * Provides a unified modal system for the entire application
 */

class ModalManager {
  constructor() {
    this.activeModals = new Set();
    this.createModalContainer();
  }

  createModalContainer() {
    // Remove existing container if it exists
    const existing = document.getElementById('globalModalContainer');
    if (existing) {
      existing.remove();
    }

    // Create container for modals
    const container = document.createElement('div');
    container.id = 'globalModalContainer';
    container.className = 'global-modal-container';
    document.body.appendChild(container);
  }

  /**
   * Show an alert modal with just an OK button
   * @param {string} title - Modal title
   * @param {string} message - Modal message
   * @param {string} type - Modal type: 'info', 'warning', 'error', 'success'
   * @returns {Promise<void>}
   */
  alert(title, message, type = 'info') {
    return new Promise((resolve) => {
      const modal = this.createModal({
        title,
        message,
        type,
        buttons: [
          {
            text: 'OK',
            primary: true,
            action: () => {
              this.closeModal(modal);
              resolve();
            }
          }
        ]
      });
      this.showModal(modal);
    });
  }

  /**
   * Show a confirm modal with OK and Cancel buttons
   * @param {string} title - Modal title
   * @param {string} message - Modal message
   * @param {string} type - Modal type: 'info', 'warning', 'error', 'success'
   * @returns {Promise<boolean>} - true if OK clicked, false if Cancel clicked
   */
  confirm(title, message, type = 'warning') {
    return new Promise((resolve) => {
      const modal = this.createModal({
        title,
        message,
        type,
        buttons: [
          {
            text: 'Cancel',
            primary: false,
            action: () => {
              this.closeModal(modal);
              resolve(false);
            }
          },
          {
            text: 'OK',
            primary: true,
            action: () => {
              this.closeModal(modal);
              resolve(true);
            }
          }
        ]
      });
      this.showModal(modal);
    });
  }

  /**
   * Show a custom modal with custom buttons
   * @param {string} title - Modal title
   * @param {string} message - Modal message
   * @param {Array} buttons - Array of button objects {text, primary, action}
   * @param {string} type - Modal type: 'info', 'warning', 'error', 'success'
   * @returns {Promise<any>} - Returns result from button action
   */
  custom(title, message, buttons, type = 'info') {
    return new Promise((resolve) => {
      const modal = this.createModal({
        title,
        message,
        type,
        buttons: buttons.map(btn => ({
          ...btn,
          action: () => {
            this.closeModal(modal);
            resolve(btn.result !== undefined ? btn.result : btn.text);
          }
        }))
      });
      this.showModal(modal);
    });
  }

  /**
   * Show a prompt modal with input field
   * @param {string} title - Modal title
   * @param {string} message - Modal message
   * @param {string} defaultValue - Default input value
   * @param {string} placeholder - Input placeholder
   * @returns {Promise<string|null>} - Input value or null if cancelled
   */
  prompt(title, message, defaultValue = '', placeholder = '') {
    return new Promise((resolve) => {
      const inputId = 'modalPromptInput_' + Date.now();
      const messageWithInput = `
        ${message}
        <div class="modal-input-group">
          <input type="text" id="${inputId}" value="${defaultValue}" placeholder="${placeholder}" />
        </div>
      `;

      const modal = this.createModal({
        title,
        message: messageWithInput,
        type: 'info',
        buttons: [
          {
            text: 'Cancel',
            primary: false,
            action: () => {
              this.closeModal(modal);
              resolve(null);
            }
          },
          {
            text: 'OK',
            primary: true,
            action: () => {
              const input = document.getElementById(inputId);
              const value = input ? input.value.trim() : '';
              this.closeModal(modal);
              resolve(value);
            }
          }
        ]
      });

      this.showModal(modal);

      // Focus input after modal is shown
      setTimeout(() => {
        const input = document.getElementById(inputId);
        if (input) {
          input.focus();
          input.select();
        }
      }, 100);
    });
  }

  createModal(options) {
    const modalId = 'modal_' + Date.now();
    const typeClass = `modal-${options.type}`;

    const modal = document.createElement('div');
    modal.id = modalId;
    modal.className = `global-modal ${typeClass}`;
    modal.innerHTML = `
      <div class="global-modal-backdrop"></div>
      <div class="global-modal-content">
        <div class="global-modal-header">
          <div class="global-modal-icon">
            ${this.getIconForType(options.type)}
          </div>
          <h3 class="global-modal-title">${options.title}</h3>
        </div>
        <div class="global-modal-body">
          <div class="global-modal-message">${options.message}</div>
        </div>
        <div class="global-modal-footer">
          ${options.buttons.map((btn, index) => `
            <button class="global-modal-btn ${btn.primary ? 'btn-primary' : 'btn-secondary'}" data-button-index="${index}">
              ${btn.text}
            </button>
          `).join('')}
        </div>
      </div>
    `;

    // Add button event listeners
    options.buttons.forEach((btn, index) => {
      const button = modal.querySelector(`[data-button-index="${index}"]`);
      if (button) {
        button.addEventListener('click', btn.action);
      }
    });

    // Close on backdrop click
    const backdrop = modal.querySelector('.global-modal-backdrop');
    backdrop.addEventListener('click', () => {
      // Find cancel/close button and trigger it
      const cancelBtn = options.buttons.find(btn => 
        btn.text.toLowerCase().includes('cancel') || 
        btn.text.toLowerCase().includes('close') ||
        !btn.primary
      );
      if (cancelBtn) {
        cancelBtn.action();
      }
    });

    // Close on Escape key
    const escapeHandler = (e) => {
      if (e.key === 'Escape' && this.activeModals.has(modalId)) {
        const cancelBtn = options.buttons.find(btn => 
          btn.text.toLowerCase().includes('cancel') || 
          btn.text.toLowerCase().includes('close') ||
          !btn.primary
        );
        if (cancelBtn) {
          cancelBtn.action();
        }
        document.removeEventListener('keydown', escapeHandler);
      }
    };
    document.addEventListener('keydown', escapeHandler);

    return modal;
  }

  getIconForType(type) {
    const icons = {
      info: '<i class="fas fa-info-circle"></i>',
      warning: '<i class="fas fa-exclamation-triangle"></i>',
      error: '<i class="fas fa-times-circle"></i>',
      success: '<i class="fas fa-check-circle"></i>'
    };
    return icons[type] || icons.info;
  }

  showModal(modal) {
    const container = document.getElementById('globalModalContainer');
    container.appendChild(modal);
    this.activeModals.add(modal.id);

    // Trigger animation
    requestAnimationFrame(() => {
      modal.classList.add('show');
    });

    // Disable body scroll
    document.body.classList.add('modal-open');
  }

  closeModal(modal) {
    if (!modal) return;

    modal.classList.add('hide');
    this.activeModals.delete(modal.id);

    setTimeout(() => {
      if (modal.parentNode) {
        modal.parentNode.removeChild(modal);
      }

      // Re-enable body scroll if no modals are open
      if (this.activeModals.size === 0) {
        document.body.classList.remove('modal-open');
      }
    }, 300);
  }

  closeAllModals() {
    const modals = document.querySelectorAll('.global-modal');
    modals.forEach(modal => this.closeModal(modal));
  }
}

// Create global instance
window.ModalManager = new ModalManager();

// Convenience global functions
window.showAlert = (title, message, type = 'info') => window.ModalManager.alert(title, message, type);
window.showConfirm = (title, message, type = 'warning') => window.ModalManager.confirm(title, message, type);
window.showPrompt = (title, message, defaultValue = '', placeholder = '') => window.ModalManager.prompt(title, message, defaultValue, placeholder);
window.showCustomModal = (title, message, buttons, type = 'info') => window.ModalManager.custom(title, message, buttons, type);