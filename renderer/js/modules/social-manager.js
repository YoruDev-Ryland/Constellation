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
      this.currentView = 'feed'; // 'feed', 'post-detail', 'user-profile'
      this.feedView = null;
      this.composerOverlay = null;
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
      
      // Initialize community view if authenticated
      if (this.user) {
        await this.initCommunityView();
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
        <header class="community-unified-header">
          <div class="header-left">
            <h1 class="header-title">
              <i class="fas fa-users"></i>
              Community
            </h1>
            <div class="feed-filters">
              <button class="filter-btn active" data-filter="all">
                <i class="fas fa-globe"></i> All Posts
              </button>
              <button class="filter-btn" data-filter="following">
                <i class="fas fa-users"></i> Following
              </button>
              <button class="filter-btn" data-filter="featured">
                <i class="fas fa-star"></i> Featured
              </button>
            </div>
          </div>
          
          <div class="header-right">
            <button class="btn-primary create-post-btn">
              <i class="fas fa-plus"></i>
              <span>Create Post</span>
            </button>
            
            ${this.user ? `
              <div class="user-menu-wrapper">
                <button class="user-menu-trigger">
                  <div class="user-avatar-sm">${initials}</div>
                  <span class="user-name-header">${username}</span>
                  <i class="fas fa-chevron-down"></i>
                </button>
                <div class="user-dropdown">
                  <div class="dropdown-header">
                    <div class="user-avatar-md">${initials}</div>
                    <div class="user-info">
                      <div class="user-name">${username}</div>
                      <div class="user-email">${this.user.email || ''}</div>
                    </div>
                  </div>
                  <div class="dropdown-divider"></div>
                  <button class="dropdown-item" data-action="profile">
                    <i class="fas fa-user"></i>
                    View Profile
                  </button>
                  <button class="dropdown-item" data-action="settings">
                    <i class="fas fa-cog"></i>
                    Settings
                  </button>
                  <div class="dropdown-divider"></div>
                  <button class="dropdown-item danger" data-action="logout">
                    <i class="fas fa-sign-out-alt"></i>
                    Logout
                  </button>
                </div>
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
        <div id="communityContainer"></div>
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
          if (action === 'profile') this.showUserProfile();
          if (action === 'settings') this.showSettings();
          return;
        }

        // Tab switching
        const tabBtn = e.target.closest('.tab-btn');
        if (tabBtn) {
          const tab = tabBtn.getAttribute('data-tab');
          this.switchTab(tab);
        }

        // Filter buttons
        const filterBtn = e.target.closest('.filter-btn');
        if (filterBtn) {
          const filter = filterBtn.dataset.filter;
          this.handleFilterChange(filter, filterBtn);
        }

        // Create post button
        const createBtn = e.target.closest('.create-post-btn');
        if (createBtn) {
          this.showCreatePost();
        }

        // User menu toggle
        const userMenuTrigger = e.target.closest('.user-menu-trigger');
        if (userMenuTrigger) {
          e.stopPropagation();
          this.toggleUserMenu();
        }

        // Close user menu if clicking outside
        if (!e.target.closest('.user-menu-wrapper')) {
          this.closeUserMenu();
        }
      });
    }

    handleFilterChange(filter, button) {
      // Update active state
      const filterBtns = this.container.querySelectorAll('.filter-btn');
      filterBtns.forEach(btn => btn.classList.remove('active'));
      button.classList.add('active');

      // Update feed if it exists
      if (this.currentFeedView && this.currentFeedView.setFilter) {
        this.currentFeedView.setFilter(filter);
      }
    }

    toggleUserMenu() {
      const wrapper = this.container.querySelector('.user-menu-wrapper');
      if (wrapper) {
        wrapper.classList.toggle('active');
      }
    }

    closeUserMenu() {
      const wrapper = this.container.querySelector('.user-menu-wrapper');
      if (wrapper) {
        wrapper.classList.remove('active');
      }
    }

    showUserProfile() {
      // TODO: Implement user profile view
      console.log('Show user profile');
      alert('Profile view coming soon!');
    }

    showSettings() {
      // TODO: Implement settings view
      console.log('Show settings');
      alert('Settings coming soon!');
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

    async initCommunityView() {
      const communityContainer = document.getElementById('communityContainer');
      if (!communityContainer) {
        console.error('[SocialManager] Community container not found');
        return;
      }

      // Initialize feed view
      if (!this.feedView) {
        this.feedView = new FeedView(communityContainer, {
          onPostClick: (postId) => this.showPostDetail(postId),
          onUserClick: (userId) => this.showUserProfile(userId)
        });
      } else {
        // Update the container reference in case the DOM was rebuilt
        this.feedView.container = communityContainer;
      }
      
      // Store reference for filter updates
      this.currentFeedView = this.feedView;
      
      // Always render/re-render the feed when community view is initialized
      // This ensures the feed appears even after tab switches that rebuild the DOM
      await this.feedView.render();
    }

    showCreatePost() {
      if (this.composerOverlay) {
        this.composerOverlay.remove();
      }

      this.composerOverlay = document.createElement('div');
      this.composerOverlay.className = 'composer-overlay';
      
      const composer = new PostComposer({
        onSubmit: async (postData) => {
          try {
            await window.CommunityAPI.createPost(postData);
            this.closeComposer();
            
            // Refresh feed
            if (this.feedView) {
              this.feedView.refresh();
            }
            
            if (window.showAlert) {
              await window.showAlert('Success!', 'Your post has been created.', 'success');
            }
          } catch (error) {
            console.error('[SocialManager] Create post failed:', error);
            throw error;
          }
        },
        onCancel: () => this.closeComposer()
      });

      this.composerOverlay.appendChild(composer.render());
      document.body.appendChild(this.composerOverlay);

      // Close on overlay click
      this.composerOverlay.addEventListener('click', (e) => {
        if (e.target === this.composerOverlay) {
          this.closeComposer();
        }
      });

      // Close on Escape key
      const escapeHandler = (e) => {
        if (e.key === 'Escape') {
          this.closeComposer();
          document.removeEventListener('keydown', escapeHandler);
        }
      };
      document.addEventListener('keydown', escapeHandler);
    }

    showEditPost(post) {
      if (this.composerOverlay) {
        this.composerOverlay.remove();
      }

      this.composerOverlay = document.createElement('div');
      this.composerOverlay.className = 'composer-overlay';
      
      const composer = new PostComposer({
        editMode: true,
        post: post,
        onSubmit: async (postData) => {
          try {
            await window.CommunityAPI.updatePost(post.id, postData);
            this.closeComposer();
            
            // Refresh feed
            if (this.feedView) {
              this.feedView.refresh();
            }
            
            if (window.showAlert) {
              await window.showAlert('Updated!', 'Your post has been updated.', 'success');
            }
          } catch (error) {
            console.error('[SocialManager] Update post failed:', error);
            throw error;
          }
        },
        onCancel: () => this.closeComposer()
      });

      this.composerOverlay.appendChild(composer.render());
      document.body.appendChild(this.composerOverlay);

      // Close handlers
      this.composerOverlay.addEventListener('click', (e) => {
        if (e.target === this.composerOverlay) {
          this.closeComposer();
        }
      });

      const escapeHandler = (e) => {
        if (e.key === 'Escape') {
          this.closeComposer();
          document.removeEventListener('keydown', escapeHandler);
        }
      };
      document.addEventListener('keydown', escapeHandler);
    }

    closeComposer() {
      if (this.composerOverlay) {
        this.composerOverlay.remove();
        this.composerOverlay = null;
      }
    }

    async showPostDetail(postId) {
      const communityContainer = document.getElementById('communityContainer');
      if (!communityContainer) return;

      this.currentView = 'post-detail';
      
      const postDetailView = new PostDetailView(communityContainer, postId, {
        onBack: () => this.showFeed(),
        onUserClick: (userId) => this.showUserProfile(userId),
        onEdit: (post) => this.showEditPost(post),
        onDelete: async (postId) => {
          // After delete, go back to feed
          this.showFeed();
        }
      });

      await postDetailView.render();
    }

    showFeed() {
      this.currentView = 'feed';
      const communityContainer = document.getElementById('communityContainer');
      if (!communityContainer) return;

      if (this.feedView) {
        this.feedView.render();
      } else {
        this.initCommunityView();
      }
    }

    showUserProfile(userId) {
      // TODO: Implement user profile view
      console.log('[SocialManager] Show user profile:', userId);
      alert('User profile view coming soon!');
    }

    handleLogout() {
      this.logout();
    }
  }

  window.ensureSocialManager = function() {
    if (!instance) instance = new SocialManager();
    return instance;
  };

  // Also expose as window.socialManager for easy access
  Object.defineProperty(window, 'socialManager', {
    get: function() {
      return instance || (instance = new SocialManager());
    }
  });
})();
