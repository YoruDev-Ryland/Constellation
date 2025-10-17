// Internal Social Manager
// Provides a Social view with top bar supporting login/logout using Starloch auth

(function(){
  let instance = null;

  class SocialManager {
    constructor() {
      this.container = document.getElementById('socialView');
      this.user = null; // { username, email, displayName?, avatarUrl? }
      this.initialized = false;
      this.loginModal = null;
    }

    async init() {
      if (this.initialized) return;
      await this.refreshUser();
      this.render();
      this.setupEventListeners();
      this.createLoginModal();
      this.initialized = true;
    }

    async refreshUser() {
      console.log('[SocialManager] refreshUser() called');
      try {
        const result = await window.electronAPI.authMe();
        console.log('[SocialManager] authMe result:', {
          success: result?.success,
          hasUser: !!result?.user,
          user: result?.user ? {
            id: result.user.id,
            username: result.user.username,
            email: result.user.email
          } : null,
          error: result?.error
        });
        
        if (result && result.success && result.user) {
          this.user = result.user;
          console.log('[SocialManager] User set to:', this.user.username || this.user.email);
        } else {
          this.user = null;
          console.log('[SocialManager] User cleared (not authenticated)');
        }
      } catch (err) {
        console.error('[SocialManager] refreshUser error:', err);
        this.user = null;
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
      
      const username = this.user?.username || this.user?.displayName || this.user?.email || null;
      const initials = username ? username.slice(0, 2).toUpperCase() : '?';

      console.log('[SocialManager] render() - user state:', {
        hasUser: !!this.user,
        username,
        userId: this.user?.id
      });

      this.container.innerHTML = `
        <header class="content-header">
          <h1>Constellation Community</h1>
          <div class="header-actions">
            ${this.user ? `
              <div class="user-profile-header">
                <div class="user-avatar-sm">${initials}</div>
                <span class="user-name-header">${username}</span>
                <button class="btn-secondary" data-action="logout">
                  <i class="fas fa-sign-out-alt"></i>
                  Logout
                </button>
              </div>
            ` : `
              <button class="btn-primary" data-action="login">
                <i class="fas fa-sign-in-alt"></i>
                Login
              </button>
            `}
          </div>
        </header>

        <div class="social-content-area">
          ${this.user ? this.renderAuthenticatedView() : this.renderUnauthenticatedView()}
        </div>
      `;
    }

    renderAuthenticatedView() {
      return `
        <div class="social-tabs">
          <button class="tab-btn active" data-tab="feed">
            <i class="fas fa-home"></i>
            Feed
          </button>
          <button class="tab-btn" data-tab="discover">
            <i class="fas fa-compass"></i>
            Discover
          </button>
          <button class="tab-btn" data-tab="my-posts">
            <i class="fas fa-user"></i>
            My Posts
          </button>
        </div>

        <div class="tab-content active" data-tab-content="feed">
          <div class="social-placeholder">
            <div class="placeholder-icon">
              <i class="fas fa-rocket"></i>
            </div>
            <h2>Welcome to Constellation Community</h2>
            <p>Share your astrophotography captures, discuss processing techniques, and connect with fellow imagers.</p>
            
            <div class="feature-grid">
              <div class="feature-card">
                <i class="fas fa-image"></i>
                <h3>Share Images</h3>
                <p>Post with metadata, filters, and integration details</p>
              </div>
              <div class="feature-card">
                <i class="fas fa-comments"></i>
                <h3>Engage</h3>
                <p>Comment threads with mentions and reactions</p>
              </div>
              <div class="feature-card">
                <i class="fas fa-users"></i>
                <h3>Follow</h3>
                <p>Curate your feed by following other imagers</p>
              </div>
              <div class="feature-card">
                <i class="fas fa-hashtag"></i>
                <h3>Organize</h3>
                <p>Tag posts by object type and filters</p>
              </div>
            </div>

            <div class="coming-soon">
              <i class="fas fa-info-circle"></i>
              Core social features are under active development. Stay tuned!
            </div>
          </div>
        </div>

        <div class="tab-content" data-tab-content="discover">
          <div class="empty-state">
            <i class="fas fa-compass"></i>
            <p>Discover page coming soon</p>
          </div>
        </div>

        <div class="tab-content" data-tab-content="my-posts">
          <div class="empty-state">
            <i class="fas fa-user"></i>
            <p>Your posts will appear here</p>
          </div>
        </div>
      `;
    }

    renderUnauthenticatedView() {
      return `
        <div class="social-placeholder unauthenticated">
          <div class="placeholder-icon large">
            <i class="fas fa-users"></i>
          </div>
          <h2>Join Constellation Community</h2>
          <p class="lead">Connect with astrophotographers worldwide. Share captures, learn techniques, and grow together.</p>
          
          <div class="feature-grid">
            <div class="feature-card">
              <i class="fas fa-image"></i>
              <h3>Share Your Work</h3>
              <p>Post images with full metadata and acquisition details</p>
            </div>
            <div class="feature-card">
              <i class="fas fa-comments"></i>
              <h3>Discuss & Learn</h3>
              <p>Get feedback and share processing techniques</p>
            </div>
            <div class="feature-card">
              <i class="fas fa-star"></i>
              <h3>Get Featured</h3>
              <p>Weekly highlights and community picks</p>
            </div>
            <div class="feature-card">
              <i class="fas fa-shield-alt"></i>
              <h3>Privacy First</h3>
              <p>No tracking, no ads, just community</p>
            </div>
          </div>

          <button class="btn-primary large" data-action="login">
            <i class="fas fa-sign-in-alt"></i>
            Login to Get Started
          </button>
        </div>
      `;
    }

    setupEventListeners() {
      if (!this.container) return;
      
      // Delegate click events
      this.container.addEventListener('click', async (e) => {
        const actionBtn = e.target.closest('[data-action]');
        if (actionBtn) {
          const action = actionBtn.getAttribute('data-action');
          if (action === 'login') await this.openLoginModal();
          if (action === 'logout') await this.logout();
          return;
        }

        // Tab switching
        const tabBtn = e.target.closest('.tab-btn');
        if (tabBtn) {
          const tab = tabBtn.getAttribute('data-tab');
          this.switchTab(tab);
        }
      });
    }

    switchTab(tabName) {
      // Update tab buttons
      const tabButtons = this.container.querySelectorAll('.tab-btn');
      tabButtons.forEach(btn => {
        if (btn.getAttribute('data-tab') === tabName) {
          btn.classList.add('active');
        } else {
          btn.classList.remove('active');
        }
      });

      // Update tab content
      const tabContents = this.container.querySelectorAll('.tab-content');
      tabContents.forEach(content => {
        if (content.getAttribute('data-tab-content') === tabName) {
          content.classList.add('active');
        } else {
          content.classList.remove('active');
        }
      });
    }

    createLoginModal() {
      if (this.loginModal) return;

      const modal = document.createElement('div');
      modal.className = 'modal social-login-modal';
      modal.style.display = 'none';
      modal.innerHTML = `
        <div class="modal-content">
          <div class="modal-header">
            <h2>
              <i class="fas fa-sign-in-alt"></i>
              Login to Constellation
            </h2>
            <button class="btn-icon modal-close">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>
          <div class="modal-body">
            <form id="socialLoginForm" class="login-form">
              <div class="form-group">
                <label for="loginIdentifier">
                  <i class="fas fa-user"></i>
                  Email or Username
                </label>
                <input 
                  type="text" 
                  id="loginIdentifier" 
                  name="identifier" 
                  placeholder="Enter your email or username" 
                  required 
                  autocomplete="username"
                />
              </div>
              
              <div class="form-group">
                <label for="loginPassword">
                  <i class="fas fa-lock"></i>
                  Password
                </label>
                <input 
                  type="password" 
                  id="loginPassword" 
                  name="password" 
                  placeholder="Enter your password" 
                  required 
                  autocomplete="current-password"
                />
              </div>

              <div class="login-error" style="display: none;"></div>

              <div class="form-actions">
                <button type="button" class="btn-secondary modal-close">Cancel</button>
                <button type="submit" class="btn-primary">
                  <i class="fas fa-sign-in-alt"></i>
                  Login
                </button>
              </div>
            </form>
          </div>
        </div>
      `;

      document.body.appendChild(modal);
      this.loginModal = modal;

      // Close handlers
      const closeButtons = modal.querySelectorAll('.modal-close');
      closeButtons.forEach(btn => {
        btn.addEventListener('click', () => this.closeLoginModal());
      });

      // Click outside to close
      modal.addEventListener('click', (e) => {
        if (e.target === modal) this.closeLoginModal();
      });

      // Form submit
      const form = modal.querySelector('#socialLoginForm');
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        await this.handleLogin(form);
      });
    }

    openLoginModal() {
      if (!this.loginModal) this.createLoginModal();
      
      // Reset form
      const form = this.loginModal.querySelector('#socialLoginForm');
      form.reset();
      
      // Hide error
      const errorDiv = this.loginModal.querySelector('.login-error');
      errorDiv.style.display = 'none';
      
      // Show modal
      this.loginModal.style.display = 'flex';
      
      // Focus first input
      setTimeout(() => {
        const firstInput = this.loginModal.querySelector('#loginIdentifier');
        if (firstInput) firstInput.focus();
      }, 100);
    }

    closeLoginModal() {
      if (this.loginModal) {
        this.loginModal.style.display = 'none';
      }
    }

    async handleLogin(form) {
      const submitBtn = form.querySelector('button[type="submit"]');
      const errorDiv = form.querySelector('.login-error');
      const originalBtnText = submitBtn.innerHTML;

      try {
        // Show loading state
        submitBtn.disabled = true;
        submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Logging in...';
        errorDiv.style.display = 'none';

        const formData = new FormData(form);
        const identifier = formData.get('identifier');
        const password = formData.get('password');

        console.log('[SocialManager] Attempting login for:', identifier);
        const result = await window.electronAPI.authLogin(identifier, password);
        console.log('[SocialManager] Login result:', {
          success: result?.success,
          hasUser: !!result?.user,
          error: result?.error
        });

        if (!result.success) {
          throw new Error(result.error || 'Login failed. Please try again.');
        }

        console.log('[SocialManager] Login successful, refreshing user state...');
        // Success - refresh user and update UI
        await this.refreshUser();
        console.log('[SocialManager] User state refreshed, re-rendering...');
        this.render();
        console.log('[SocialManager] UI re-rendered');
        this.closeLoginModal();

        // Show success message
        if (window.showAlert) {
          await window.showAlert('Welcome!', 'You have successfully logged in.', 'success');
        }

      } catch (error) {
        console.error('[SocialManager] Login error:', error);
        // Show error in modal
        errorDiv.textContent = error.message || 'An error occurred during login.';
        errorDiv.style.display = 'block';
      } finally {
        // Reset button
        submitBtn.disabled = false;
        submitBtn.innerHTML = originalBtnText;
      }
    }

    async logout() {
      try {
        const confirmed = window.showConfirm 
          ? await window.showConfirm('Logout', 'Are you sure you want to logout?', 'warning')
          : confirm('Are you sure you want to logout?');
        
        if (!confirmed) return;

        await window.electronAPI.authLogout();
        this.user = null;
        this.render();

        if (window.showAlert) {
          await window.showAlert('Signed Out', 'You have been logged out successfully.', 'info');
        }
      } catch (error) {
        console.error('Logout error:', error);
        if (window.showAlert) {
          await window.showAlert('Error', 'Failed to logout. Please try again.', 'error');
        }
      }
    }
  }

  window.ensureSocialManager = function() {
    if (!instance) instance = new SocialManager();
    return instance;
  };
})();
