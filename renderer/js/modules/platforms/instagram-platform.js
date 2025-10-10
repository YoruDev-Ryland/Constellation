// Instagram Platform Module (Real via Meta Graph API)
// Implements OAuth (implicit flow) and content publishing to Instagram Professional accounts

class InstagramPlatform extends SocialPlatformBase {
  constructor() {
    super({
      platformId: 'instagram',
      displayName: 'Instagram',
      description: 'Share your astrophotography on Instagram with captions and hashtags',
      version: '1.0.0',
  apiEndpoint: 'https://graph.facebook.com/v19.0',
      capabilities: {
        textPosts: true, // captions supported
        imagePosts: true,
  multipleImages: true,
        videoSupport: false,
        hashtagSupport: true,
        mentionSupport: true,
        linkSupport: true, // links allowed but not clickable
        maxTextLength: 2200,
        supportedImageFormats: ['jpg', 'jpeg', 'png'],
        maxImageSize: 10 * 1024 * 1024, // 10MB (demo)
        requiresTitle: false
      },
      validation: {
        requiresAuth: true,
        requiresImage: true, // IG requires an image/video
        requiresText: false,
        minTextLength: 0,
        maxTextLength: 2200
      }
    });

    this.userInfo = null;
    this.meta = {
      appId: null,
      userAccessToken: null,
      userAccessTokenExpiry: null,
      pageAccessToken: null, // page token used to manage IG user
      igUserId: null
    };
  }

  getIcon() {
    return `<i class="fab fa-instagram instagram-icon" aria-hidden="true"></i>`;
  }

  // Credential form lets the user paste their Facebook App ID. We use implicit flow to get a user access token.
  getCredentialForm() {
    return `
      <div class="credential-form instagram-form">
        <div class="form-group">
          <label for="fbAppId">Facebook App ID</label>
          <input type="text" id="fbAppId" name="fbAppId" class="form-control" placeholder="Enter your Facebook App ID" required>
          <small class="form-hint">You must create a Meta app, enable Facebook Login and Instagram Graph API, and add required redirect URIs.</small>
        </div>
      </div>
    `;
  }

  async connect(credentials) {
    try {
      this.log('Starting Instagram connect (real)');
      const appId = (credentials?.fbAppId || '').trim();
      if (!appId) return { success: false, error: 'Facebook App ID is required' };
      this.meta.appId = appId;

      // 1) OAuth login to get a User Access Token with required scopes
      const scopes = [
        'public_profile',
        'pages_show_list',
        'pages_read_engagement',
        'pages_manage_metadata',
        'instagram_basic',
        'instagram_manage_insights',
        'instagram_content_publish'
      ];
      const loginRes = await window.electronAPI.instagramLogin({ appId, scopes });
      if (!loginRes?.success) return { success: false, error: loginRes?.error || 'Facebook login failed' };
      this.meta.userAccessToken = loginRes.accessToken;
      this.meta.userAccessTokenExpiry = Date.now() + (Number(loginRes.expiresIn || 0) * 1000);

      // 2) Discover pages and linked IG business accounts
      const discover = await window.electronAPI.instagramDiscoverAccounts({ accessToken: this.meta.userAccessToken });
      if (!discover?.success) return { success: false, error: discover?.error || 'Failed to list IG accounts' };
      // Pick the first account for now; later we can add a chooser UI
      const acct = discover.accounts[0];
      this.meta.pageAccessToken = acct.pageAccessToken;
      this.meta.igUserId = acct.igUserId;

      // 3) Fetch IG username
      const igUser = await window.electronAPI.instagramGetIgUser({ igUserId: this.meta.igUserId, accessToken: this.meta.pageAccessToken });
      if (!igUser?.success) return { success: false, error: igUser?.error || 'Failed to fetch IG user' };

      this.userInfo = { username: igUser.user?.username || 'unknown', name: igUser.user?.username };
      this.isConnected = true;
      this.connection = {
        accessToken: this.meta.pageAccessToken,
        tokenExpiry: this.meta.userAccessTokenExpiry
      };

      return { success: true, connection: this.connection, userInfo: this.userInfo };
    } catch (e) {
      return { success: false, error: e.message };
    }
  }

  async disconnect() {
    this.log('Disconnecting Instagram');
    return super.disconnect();
  }

  validatePost(postData) {
    const errors = [];

    // Auth check
    if (this.validation.requiresAuth && !this.isConnected) {
      errors.push('Platform not connected');
    }

    // Text rules
    const content = (postData.content || '').trim();
    if (this.validation.requiresText && content.length === 0) {
      errors.push('Text content is required');
    }
    if (content && content.length < (this.validation.minTextLength || 0)) {
      errors.push(`Text must be at least ${this.validation.minTextLength} characters`);
    }
    if (content && content.length > (this.validation.maxTextLength || 2200)) {
      errors.push(`Caption must be under ${this.validation.maxTextLength} characters`);
    }

    // Image requirement: allow either an uploaded file (for previews/other platforms) OR a public URL for IG publishing
    const hasFile = !!postData.image;
    const hasUrl = typeof postData.imageUrl === 'string' && postData.imageUrl.trim().length > 0;
    if (this.validation.requiresImage && !(hasFile || hasUrl)) {
      errors.push('Instagram requires an image file or a public image URL');
    }
    if (hasFile) {
      const v = this.validateImage(postData.image);
      if (!v.valid) errors.push(...(v.errors || []));
    }

    return { valid: errors.length === 0, errors: errors.length ? errors : undefined };
  }

  formatCaption(content, tags = []) {
    const cleanTags = (tags || [])
      .map(t => t.trim().replace(/^#/,'').replace(/\s+/g, ''))
      .filter(Boolean);

    // IG allows up to 30 hashtags; enforce
    const limitedTags = cleanTags.slice(0, 30);
    const hashtags = limitedTags.map(t => `#${t}`).join(' ');

    const base = (content || '').trim();
    const combined = [base, hashtags].filter(Boolean).join(base && hashtags ? '\n\n' : '');

    // Truncate to 2200 if needed
    return combined.length > 2200 ? combined.slice(0, 2200) : combined;
  }

  // Note: Instagram Graph API requires image_url to be publicly accessible. We can't upload local files directly via Graph without a public URL.
  // We'll accept either postData.imageUrl or fall back to postData.image.data if it's a data URL that is already public (rare). We encourage using imageUrl.

  async post(postData) {
    try {
      if (!this.isConnected) {
        throw new Error('Not connected to Instagram');
      }

      const validation = this.validatePost(postData);
      if (!validation.valid) {
        throw new Error(validation.errors.join(', '));
      }
      // Prepare caption
      const caption = this.formatCaption(postData.content, postData.tags);

      // Determine image URL (Graph requires public URL)
      let imageUrl = (postData.imageUrl || '').trim();
      if (!imageUrl) {
        // If a data URL was provided, this will not work for Graph create container (it will attempt to curl). Require a public URL.
        throw new Error('Instagram requires a publicly accessible image URL (image_url). Please provide an Image URL.');
      }

      const res = await window.electronAPI.instagramPublishImage({
        igUserId: this.meta.igUserId,
        accessToken: this.meta.pageAccessToken,
        imageUrl,
        caption
      });

      if (!res?.success) throw new Error(res?.error || 'Failed to publish image');
      return { success: true, postId: res.mediaId, url: `https://www.instagram.com/p/${res.mediaId}` };
    } catch (e) {
      this.log('Instagram post failed', { error: e.message });
      return { success: false, error: e.message };
    }
  }

  getPostPreview(postData) {
    const caption = this.formatCaption(postData.content, postData.tags);
    return `
      <div class="post-preview instagram-preview">
        <div class="preview-header">
          <div class="platform-info">
            ${this.getIcon()}
            <span class="platform-name">${this.displayName}</span>
          </div>
          <div class="subreddit-info">@${this.userInfo?.username || 'yourhandle'}</div>
        </div>
        <div class="preview-content">
          ${postData.imageUrl ? `<div class="preview-image">Image URL: ${postData.imageUrl}</div>` : (postData.image ? '<div class="preview-image">[Image will be attached]</div>' : '')}
          ${caption ? `<div class="preview-text">${caption.replace(/\n/g,'<br>')}</div>` : ''}
          <div class="post-actions">
            <span><i class="fas fa-heart"></i> Like</span>
            <span><i class="fas fa-comment"></i> Comment</span>
            <span><i class="fas fa-paper-plane"></i> Share</span>
          </div>
        </div>
      </div>
    `;
  }
}

// Auto-register the platform when the module loads (handle already-loaded DOM as well)
function registerInstagram() {
  const socialManager = window.ensureSocialManager?.();
  if (socialManager) {
    const instagram = new InstagramPlatform();
    socialManager.registerPlatform('instagram', instagram);
    console.log('Instagram platform module loaded and registered');
  } else {
    console.warn('ensureSocialManager not available yet when registering Instagram');
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', registerInstagram);
} else {
  registerInstagram();
}

// Export for manual registration if needed
window.InstagramPlatform = InstagramPlatform;
