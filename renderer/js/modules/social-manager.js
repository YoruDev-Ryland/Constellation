// Social Media Manager Module
// Main hub for managing multiple social media platforms and cross-posting functionality
// Follows the modular design pattern established in the Constellation app

class SocialManager {
  constructor(electronAPI, options = {}) {
    this.electronAPI = electronAPI;
    this.log = options.log || (() => {});
    this.getSettings = options.getSettings || (() => ({}));
    
    // Platform registry - dynamically populated by platform modules
    this.platforms = new Map();
    this.connectedPlatforms = new Map();
    
    // Current state
    this.isVisible = false;
    this.currentPost = null;
    
    this.log('SocialManager initialized');
  }

  // Platform Registration System
  registerPlatform(platformId, platformModule) {
    if (!platformId || !platformModule) {
      console.error('Invalid platform registration:', { platformId, platformModule });
      return false;
    }

    this.platforms.set(platformId, platformModule);
    this.log('Platform registered', { platformId, hasConnect: typeof platformModule.connect === 'function' });
    
    // Update UI if social view is active
    if (this.isVisible) {
      this.renderPlatformList();
    }
    
    return true;
  }

  unregisterPlatform(platformId) {
    if (this.platforms.has(platformId)) {
      this.platforms.delete(platformId);
      this.connectedPlatforms.delete(platformId);
      this.log('Platform unregistered', { platformId });
      
      if (this.isVisible) {
        this.renderPlatformList();
      }
      return true;
    }
    return false;
  }

  getRegisteredPlatforms() {
    return Array.from(this.platforms.keys());
  }

  getPlatform(platformId) {
    return this.platforms.get(platformId);
  }

  // Connection Management
  async connectPlatform(platformId, credentials) {
    const platform = this.platforms.get(platformId);
    if (!platform) {
      throw new Error(`Platform ${platformId} not registered`);
    }

    try {
      this.log('Attempting to connect platform', { platformId });
      const connectionResult = await platform.connect(credentials);
      
      if (connectionResult.success) {
        this.connectedPlatforms.set(platformId, {
          platform,
          connection: connectionResult.connection,
          userInfo: connectionResult.userInfo || {},
          connectedAt: new Date().toISOString()
        });
        
        this.log('Platform connected successfully', { 
          platformId, 
          userInfo: connectionResult.userInfo 
        });
        
        // Save connection info securely
        await this.saveConnectionData();
        
        // Update UI
        if (this.isVisible) {
          this.renderPlatformList();
          this.updatePostingInterface();
        }
        
        return { success: true, userInfo: connectionResult.userInfo };
      } else {
        throw new Error(connectionResult.error || 'Connection failed');
      }
    } catch (error) {
      console.error(`Failed to connect to ${platformId}:`, error);
      this.log('Platform connection failed', { platformId, error: error.message });
      throw error;
    }
  }

  async disconnectPlatform(platformId) {
    const connectionData = this.connectedPlatforms.get(platformId);
    if (!connectionData) {
      return { success: false, error: 'Platform not connected' };
    }

    try {
      // Call platform's disconnect method if available
      if (connectionData.platform.disconnect) {
        await connectionData.platform.disconnect();
      }

      this.connectedPlatforms.delete(platformId);
      this.log('Platform disconnected', { platformId });
      
      // Update saved data
      await this.saveConnectionData();
      
      // Update UI
      if (this.isVisible) {
        this.renderPlatformList();
        this.updatePostingInterface();
      }
      
      return { success: true };
    } catch (error) {
      console.error(`Failed to disconnect ${platformId}:`, error);
      return { success: false, error: error.message };
    }
  }

  isConnected(platformId) {
    return this.connectedPlatforms.has(platformId);
  }

  getConnectedPlatforms() {
    return Array.from(this.connectedPlatforms.keys());
  }

  getConnectionInfo(platformId) {
    return this.connectedPlatforms.get(platformId);
  }

  // Cross-posting functionality
  async createPost(postData) {
    if (!postData || !postData.content) {
      throw new Error('Post data and content are required');
    }

    const connectedPlatformIds = this.getConnectedPlatforms();
    if (connectedPlatformIds.length === 0) {
      throw new Error('No platforms connected for posting');
    }

    this.currentPost = {
      id: Date.now() + Math.random(),
      content: postData.content,
      image: postData.image || null,
      tags: postData.tags || [],
      platforms: postData.selectedPlatforms || connectedPlatformIds,
      createdAt: new Date().toISOString(),
      status: 'preparing'
    };

    const results = {
      postId: this.currentPost.id,
      successes: [],
      failures: [],
      total: this.currentPost.platforms.length
    };

    this.log('Starting cross-post', { 
      postId: this.currentPost.id, 
      platforms: this.currentPost.platforms 
    });

    // Post to each selected platform
    for (const platformId of this.currentPost.platforms) {
      try {
        const connectionData = this.connectedPlatforms.get(platformId);
        if (!connectionData) {
          results.failures.push({
            platform: platformId,
            error: 'Platform not connected'
          });
          continue;
        }

        const platform = connectionData.platform;
        if (!platform.post) {
          results.failures.push({
            platform: platformId,
            error: 'Platform does not support posting'
          });
          continue;
        }

        this.log('Posting to platform', { platformId, postId: this.currentPost.id });
        
        const postResult = await platform.post({
          content: this.currentPost.content,
          image: this.currentPost.image,
          tags: this.currentPost.tags
        });

        if (postResult.success) {
          results.successes.push({
            platform: platformId,
            postId: postResult.postId,
            url: postResult.url || null
          });
          this.log('Post successful', { platformId, platformPostId: postResult.postId });
        } else {
          results.failures.push({
            platform: platformId,
            error: postResult.error || 'Unknown error'
          });
        }
      } catch (error) {
        console.error(`Failed to post to ${platformId}:`, error);
        results.failures.push({
          platform: platformId,
          error: error.message
        });
      }
    }

    this.currentPost.status = 'completed';
    this.currentPost.results = results;
    
    this.log('Cross-post completed', { 
      postId: this.currentPost.id,
      successes: results.successes.length,
      failures: results.failures.length
    });

    return results;
  }

  // UI Management
  show() {
    this.isVisible = true;
    this.log('Social manager view activated');
    this.render();
  }

  hide() {
    this.isVisible = false;
    this.log('Social manager view deactivated');
  }

  render() {
    const container = document.getElementById('socialView');
    if (!container) {
      console.error('Social view container not found');
      return;
    }

    container.innerHTML = this.generateMainInterface();
    this.attachEventListeners();
    this.renderPlatformList();
    this.updatePostingInterface();
  }

  generateMainInterface() {
    return `
      <header class="content-header">
        <h1>Social Media Manager</h1>
        <p class="header-subtitle">Cross-post your astrophotography to multiple social platforms</p>
      </header>

      <div class="social-main-container">
        <!-- Platform Management Section -->
        <div class="social-section">
          <div class="section-header">
            <h2>Connected Platforms</h2>
            <button class="btn-primary" id="addPlatformBtn">
              <i class="fas fa-plus" aria-hidden="true"></i>
              Add Platform
            </button>
          </div>
          <div id="platformsList" class="platforms-list">
            <!-- Platforms will be rendered here -->
          </div>
        </div>

        <!-- Posting Interface Section -->
        <div class="social-section">
          <div class="section-header">
            <h2>Create Post</h2>
          </div>
          <div id="postingInterface" class="posting-interface">
            <!-- Posting form will be rendered here -->
          </div>
        </div>

        <!-- Recent Posts Section -->
        <div class="social-section">
          <div class="section-header">
            <h2>Recent Posts</h2>
          </div>
          <div id="recentPosts" class="recent-posts">
            <div class="empty-state">
              <i class="fas fa-comments fa-3x" aria-hidden="true"></i>
              <p>No posts yet. Create your first cross-post above!</p>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  renderPlatformList() {
    const container = document.getElementById('platformsList');
    if (!container) return;

    const registeredPlatforms = Array.from(this.platforms.keys());
    
    if (registeredPlatforms.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <i class="fas fa-plug fa-3x" aria-hidden="true"></i>
          <p>No platform modules loaded. Platform modules will appear here when available.</p>
        </div>
      `;
      return;
    }

    const platformCards = registeredPlatforms.map(platformId => {
      const platform = this.platforms.get(platformId);
      const isConnected = this.isConnected(platformId);
      const connectionInfo = this.getConnectionInfo(platformId);

      return `
        <div class="platform-card ${isConnected ? 'connected' : 'disconnected'}">
          <div class="platform-header">
            <div class="platform-icon">
              ${platform.getIcon ? platform.getIcon() : this.getDefaultIcon(platformId)}
            </div>
            <div class="platform-basic-info">
              <h3>${platform.displayName || platformId}</h3>
              <p class="platform-status">
                ${isConnected 
                  ? `Connected${connectionInfo?.userInfo?.username ? ` as @${connectionInfo.userInfo.username}` : ''}`
                  : 'Not connected'
                }
              </p>
            </div>
          </div>
          
          <div class="platform-details">
            ${platform.description ? `<p class="platform-description">${platform.description}</p>` : ''}
            ${isConnected && connectionInfo?.userInfo?.username ? `
              <div class="platform-user-info">
                <div class="user-avatar">${connectionInfo.userInfo.username.charAt(0).toUpperCase()}</div>
                <span>@${connectionInfo.userInfo.username}</span>
                ${connectionInfo.userInfo.name && connectionInfo.userInfo.name !== connectionInfo.userInfo.username ? 
                  `<span class="user-display-name">(${connectionInfo.userInfo.name})</span>` : ''
                }
              </div>
            ` : ''}
          </div>
          
          <div class="platform-actions">
            ${isConnected 
              ? `
                <button class="platform-disconnect-btn" data-platform="${platformId}">
                  <i class="fas fa-unlink" aria-hidden="true"></i>
                  Disconnect
                </button>
                <button class="platform-manage-btn" data-platform="${platformId}">
                  <i class="fas fa-cog" aria-hidden="true"></i>
                  Manage Settings
                </button>
              `
              : `
                <button class="platform-connect-btn" data-platform="${platformId}">
                  <i class="fas fa-link" aria-hidden="true"></i>
                  Connect Account
                </button>
              `
            }
          </div>
        </div>
      `;
    }).join('');

    container.innerHTML = platformCards;
  }

  updatePostingInterface() {
    const container = document.getElementById('postingInterface');
    if (!container) return;

    const connectedPlatforms = this.getConnectedPlatforms();
    
    if (connectedPlatforms.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <i class="fas fa-exclamation-circle fa-3x" aria-hidden="true"></i>
          <p>Connect at least one platform to start posting</p>
        </div>
      `;
      return;
    }

    container.innerHTML = `
      <form id="postForm" class="post-form">
        <div class="form-group">
          <label for="postContent">Post Content</label>
          <textarea 
            id="postContent" 
            class="form-control" 
            placeholder="Share your astrophotography journey..." 
            rows="4"
            maxlength="2000"
          ></textarea>
          <div class="character-count">
            <span id="charCount">0</span>/2000
          </div>
        </div>

        <div class="form-group">
          <label for="postImage">Image</label>
          <div class="image-upload-area" id="imageUploadArea">
            <input type="file" id="postImage" accept="image/*" style="display: none;">
            <div class="upload-placeholder">
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
                <circle cx="8.5" cy="8.5" r="1.5"></circle>
                <polyline points="21,15 16,10 5,21"></polyline>
              </svg>
              <p>Click to select an image or drag and drop</p>
            </div>
            <div class="image-preview" id="imagePreview" style="display: none;">
              <img id="previewImg" alt="Preview">
              <button type="button" class="btn-icon remove-image" id="removeImageBtn">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                  <line x1="18" y1="6" x2="6" y2="18"></line>
                  <line x1="6" y1="6" x2="18" y2="18"></line>
                </svg>
              </button>
            </div>
          </div>
        </div>

        <div class="form-group">
          <label for="postImageUrl">Image URL (public)</label>
          <input 
            type="url" 
            id="postImageUrl" 
            class="form-control" 
            placeholder="https://your-cdn.example.com/astro.jpg"
          >
          <small class="form-hint">Instagram requires a publicly accessible image_url. Provide a URL to your image if posting to Instagram.</small>
        </div>

        <div class="form-group">
          <label for="postTags">Tags/Hashtags</label>
          <input 
            type="text" 
            id="postTags" 
            class="form-control" 
            placeholder="astronomy, astrophotography, nebula (comma-separated)"
          >
          <small class="form-hint">Separate tags with commas. Hashtags will be added automatically.</small>
        </div>

        <div class="form-group">
          <label>Select Platforms</label>
          <div class="platform-checkboxes" id="platformCheckboxes">
            ${connectedPlatforms.map(platformId => {
              const platform = this.platforms.get(platformId);
              return `
                <label class="platform-checkbox">
                  <input type="checkbox" value="${platformId}" checked>
                  <span class="checkbox-label">
                    ${platform.getIcon ? platform.getIcon() : this.getDefaultIcon(platformId)}
                    ${platform.displayName || platformId}
                  </span>
                </label>
              `;
            }).join('')}
          </div>
        </div>

        <div class="form-actions">
          <button type="button" class="btn-secondary" id="previewPostBtn">Preview</button>
          <button type="submit" class="btn-primary" id="publishPostBtn">
            <i class="fas fa-paper-plane" aria-hidden="true"></i>
            Publish to Selected Platforms
          </button>
        </div>
      </form>
    `;

    this.attachPostingEventListeners();
  }

  attachEventListeners() {
    // Add platform button
    const addPlatformBtn = document.getElementById('addPlatformBtn');
    if (addPlatformBtn) {
      addPlatformBtn.addEventListener('click', () => {
        this.showAddPlatformModal();
      });
    }

    // Platform connection/disconnection buttons (use delegation and closest() so child element clicks work)
    document.addEventListener('click', async (e) => {
      const connectBtn = e.target.closest && e.target.closest('.platform-connect-btn');
      const disconnectBtn = e.target.closest && e.target.closest('.platform-disconnect-btn');
      const manageBtn = e.target.closest && e.target.closest('.platform-manage-btn');

      if (connectBtn) {
        const platformId = connectBtn.dataset.platform;
        console.log('[SocialManager] Connect clicked for', platformId);
        await this.showConnectionModal(platformId);
      } else if (disconnectBtn) {
        const platformId = disconnectBtn.dataset.platform;
        await this.disconnectPlatform(platformId);
      } else if (manageBtn) {
        const platformId = manageBtn.dataset.platform;
        this.showPlatformManageModal(platformId);
      }
    });
  }

  attachPostingEventListeners() {
    // Character counter
    const postContent = document.getElementById('postContent');
    const charCount = document.getElementById('charCount');
    if (postContent && charCount) {
      postContent.addEventListener('input', () => {
        charCount.textContent = postContent.value.length;
      });
    }

    // Image upload
    const imageUploadArea = document.getElementById('imageUploadArea');
    const postImage = document.getElementById('postImage');
    const imagePreview = document.getElementById('imagePreview');
    const previewImg = document.getElementById('previewImg');
    const removeImageBtn = document.getElementById('removeImageBtn');

    if (imageUploadArea && postImage) {
      imageUploadArea.addEventListener('click', () => postImage.click());
      
      postImage.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) {
          const reader = new FileReader();
          reader.onload = (e) => {
            previewImg.src = e.target.result;
            imageUploadArea.querySelector('.upload-placeholder').style.display = 'none';
            imagePreview.style.display = 'block';
          };
          reader.readAsDataURL(file);
        }
      });

      removeImageBtn?.addEventListener('click', (e) => {
        e.stopPropagation();
        postImage.value = '';
        imageUploadArea.querySelector('.upload-placeholder').style.display = 'block';
        imagePreview.style.display = 'none';
      });
    }

    // Form submission
    const postForm = document.getElementById('postForm');
    if (postForm) {
      postForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        await this.handlePostSubmission();
      });
    }

    // Preview button
    const previewBtn = document.getElementById('previewPostBtn');
    if (previewBtn) {
      previewBtn.addEventListener('click', () => {
        this.showPostPreview();
      });
    }
  }

  async handlePostSubmission() {
    const content = document.getElementById('postContent')?.value?.trim();
    const imageFile = document.getElementById('postImage')?.files[0];
  const imageUrl = document.getElementById('postImageUrl')?.value?.trim();
    const tags = document.getElementById('postTags')?.value
      .split(',')
      .map(tag => tag.trim())
      .filter(tag => tag.length > 0);

    const selectedPlatforms = Array.from(
      document.querySelectorAll('#platformCheckboxes input[type="checkbox"]:checked')
    ).map(checkbox => checkbox.value);

    if (!content && !imageFile && !imageUrl) {
      alert('Please provide either content or an image (file or public URL) for your post.');
      return;
    }

    if (selectedPlatforms.length === 0) {
      alert('Please select at least one platform to post to.');
      return;
    }

    try {
      const publishBtn = document.getElementById('publishPostBtn');
      if (publishBtn) {
        publishBtn.disabled = true;
        publishBtn.innerHTML = `
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor">
            <circle cx="12" cy="12" r="10"></circle>
            <polyline points="12,6 12,12 16,14"></polyline>
          </svg>
          Publishing...
        `;
      }

      let imageData = null;
      if (imageFile) {
        imageData = await this.prepareImageForUpload(imageFile);
      }

      const postData = {
        content,
        image: imageData,
        tags,
        imageUrl,
        selectedPlatforms
      };

      const results = await this.createPost(postData);
      this.showPostResults(results);
      
      // Reset form on success
      if (results.successes.length > 0) {
        // Safely reset form and restore UI elements. Avoid using optional chaining on the left side
        const postFormEl = document.getElementById('postForm');
        if (postFormEl && typeof postFormEl.reset === 'function') postFormEl.reset();

        const uploadArea = document.getElementById('imageUploadArea');
        if (uploadArea) {
          const placeholder = uploadArea.querySelector('.upload-placeholder');
          if (placeholder) placeholder.style.display = 'block';
        }

        const imagePreviewEl = document.getElementById('imagePreview');
        if (imagePreviewEl) imagePreviewEl.style.display = 'none';

        const charCountEl = document.getElementById('charCount');
        if (charCountEl) charCountEl.textContent = '0';
      }

    } catch (error) {
      console.error('Post submission failed:', error);
      alert('Failed to publish post: ' + error.message);
    } finally {
      const publishBtn = document.getElementById('publishPostBtn');
      if (publishBtn) {
        publishBtn.disabled = false;
        publishBtn.innerHTML = `
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor">
            <line x1="22" y1="2" x2="11" y2="13"></line>
            <polygon points="22,2 15,22 11,13 2,9 22,2"></polygon>
          </svg>
          Publish to Selected Platforms
        `;
      }
    }
  }

  async prepareImageForUpload(file) {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        resolve({
          data: e.target.result,
          name: file.name,
          type: file.type,
          size: file.size
        });
      };
      reader.readAsDataURL(file);
    });
  }

  showPostResults(results) {
    const { successes, failures, total } = results;
    
    let message = `Post Results:\n`;
    message += `Successfully posted to ${successes.length} of ${total} platforms.\n\n`;
    
    if (successes.length > 0) {
      message += `Successful posts:\n`;
      successes.forEach(success => {
        message += `✓ ${success.platform}${success.url ? ` (${success.url})` : ''}\n`;
      });
    }
    
    if (failures.length > 0) {
      message += `\nFailed posts:\n`;
      failures.forEach(failure => {
        message += `✗ ${failure.platform}: ${failure.error}\n`;
      });
    }
    
    alert(message);
  }

  showAddPlatformModal() {
    // TODO: Implement platform discovery/loading interface
    alert('Platform management interface coming soon. Platforms are currently loaded via script tags.');
  }

  showPlatformManageModal(platformId) {
    const platform = this.platforms.get(platformId);
    if (!platform) return;
    
    // TODO: Implement platform-specific settings modal
    alert(`Platform management for ${platform.displayName || platformId} coming soon. This will allow you to manage account settings, posting preferences, and view analytics.`);
  }

  async showConnectionModal(platformId) {
    const platform = this.platforms.get(platformId);
    if (!platform) return;
    console.log('[SocialManager] showConnectionModal for', platformId);

    // Create modal container
    const modal = document.createElement('div');
    modal.className = 'connection-modal';
    modal.innerHTML = `
      <div class="connection-modal-content">
        <div class="modal-header">
          <h2>Connect to ${platform.displayName || platformId}</h2>
          <button class="btn-icon" id="closeConnectionModal"><i class="fas fa-times"></i></button>
        </div>
        <div class="modal-body">
          <div id="connectionFormContainer">
            ${platform.getCredentialForm ? platform.getCredentialForm() : '<p>No credential form available for this platform.</p>'}
          </div>
          <div style="margin-top:12px; text-align:right;">
            <button class="btn-secondary" id="cancelConnectionBtn">Cancel</button>
            <button class="btn-primary" id="submitConnectionBtn"><i class="fas fa-plug" aria-hidden="true"></i> Connect</button>
          </div>
        </div>
      </div>
    `;

    document.body.appendChild(modal);

    // Close handlers
    modal.querySelector('#closeConnectionModal')?.addEventListener('click', () => modal.remove());
    modal.querySelector('#cancelConnectionBtn')?.addEventListener('click', () => modal.remove());

    // Submit handler
    modal.querySelector('#submitConnectionBtn')?.addEventListener('click', async () => {
      // Collect form values
      const inputs = modal.querySelectorAll('#connectionFormContainer input');
      const credentials = {};
      inputs.forEach(input => {
        const name = input.name || input.id;
        if (name) credentials[name] = input.value;
      });

      try {
        // Disable button while connecting
        const submitBtn = modal.querySelector('#submitConnectionBtn');
        submitBtn.disabled = true;
        submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Connecting...';

        const result = await this.connectPlatform(platformId, credentials);
        if (result && result.success) {
          alert(`Connected to ${platform.displayName || platformId} as ${result.userInfo?.username || ''}`);
          modal.remove();
        } else {
          alert('Failed to connect: ' + (result?.error || 'Unknown error'));
          submitBtn.disabled = false;
          submitBtn.innerHTML = '<i class="fas fa-plug" aria-hidden="true"></i> Connect';
        }
      } catch (error) {
        alert('Connection error: ' + error.message);
        modal.remove();
      }
    });
  }

  showPostPreview() {
    // TODO: Implement post preview modal
    alert('Post preview feature coming soon.');
  }

  getDefaultIcon(platformId) {
    const icons = {
      twitter: '🐦',
      instagram: '📷',
      facebook: '📘',
      reddit: '🤖',
      discord: '💬',
      mastodon: '🐘'
    };
    return icons[platformId.toLowerCase()] || '🌐';
  }

  // Data persistence
  async saveConnectionData() {
    try {
      const connectionData = {};
      for (const [platformId, connection] of this.connectedPlatforms) {
        connectionData[platformId] = {
          userInfo: connection.userInfo,
          connectedAt: connection.connectedAt
          // Note: We don't save actual credentials/tokens for security
        };
      }
      
      const settings = this.getSettings();
      settings.socialConnections = connectionData;
      await this.electronAPI.saveSettings(settings);
      
      this.log('Connection data saved', { platforms: Object.keys(connectionData) });
    } catch (error) {
      console.error('Failed to save connection data:', error);
    }
  }

  async loadConnectionData() {
    try {
      const settings = this.getSettings();
      const connectionData = settings.socialConnections || {};
      
      this.log('Connection data loaded', { platforms: Object.keys(connectionData) });
      return connectionData;
    } catch (error) {
      console.error('Failed to load connection data:', error);
      return {};
    }
  }
}

// Global instance and initialization
let socialManager = null;

function ensureSocialManager() {
  if (!socialManager) {
    socialManager = new SocialManager(window.electronAPI, {
      log: (msg, data) => {
        const logMgr = window.ensureLogManager?.();
        if (logMgr?.isVerbose()) logMgr.log(msg, data);
      },
      getSettings: () => window.settings || {}
    });
  }
  return socialManager;
}

// Export for global access
window.SocialManager = SocialManager;
window.ensureSocialManager = ensureSocialManager;