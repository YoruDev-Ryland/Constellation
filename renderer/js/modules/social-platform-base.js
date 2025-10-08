// Social Platform Base Interface
// Defines the standard interface that all social media platform modules must implement
// This ensures consistency and allows the SocialManager to work with any platform

class SocialPlatformBase {
  constructor(config = {}) {
    this.platformId = config.platformId || 'unknown';
    this.displayName = config.displayName || this.platformId;
    this.description = config.description || '';
    this.version = config.version || '1.0.0';
    this.apiEndpoint = config.apiEndpoint || null;
    
    // Connection state
    this.isConnected = false;
    this.connection = null;
    this.userInfo = {};
    
    // Feature capabilities
    this.capabilities = {
      textPosts: true,
      imagePosts: true,
      multipleImages: false,
      videoSupport: false,
      hashtagSupport: true,
      mentionSupport: true,
      linkSupport: true,
      maxTextLength: 280,
      supportedImageFormats: ['jpg', 'jpeg', 'png', 'gif'],
      maxImageSize: 5 * 1024 * 1024, // 5MB default
      ...config.capabilities
    };

    // Validation rules
    this.validation = {
      requiresAuth: true,
      requiresImage: false,
      requiresText: true,
      minTextLength: 1,
      maxTextLength: this.capabilities.maxTextLength,
      ...config.validation
    };
  }

  // Core methods that must be implemented by platform modules
  
  /**
   * Connect to the platform with user credentials
   * @param {Object} credentials - Platform-specific credentials
   * @returns {Promise<{success: boolean, connection?: any, userInfo?: Object, error?: string}>}
   */
  async connect(credentials) {
    throw new Error(`${this.platformId}: connect() method must be implemented`);
  }

  /**
   * Disconnect from the platform
   * @returns {Promise<{success: boolean, error?: string}>}
   */
  async disconnect() {
    this.isConnected = false;
    this.connection = null;
    this.userInfo = {};
    return { success: true };
  }

  /**
   * Post content to the platform
   * @param {Object} postData - The post content and metadata
   * @param {string} postData.content - Text content of the post
   * @param {Object} postData.image - Image data {data, name, type, size}
   * @param {string[]} postData.tags - Array of tags/hashtags
   * @returns {Promise<{success: boolean, postId?: string, url?: string, error?: string}>}
   */
  async post(postData) {
    throw new Error(`${this.platformId}: post() method must be implemented`);
  }

  /**
   * Validate post data before posting
   * @param {Object} postData - The post data to validate
   * @returns {Promise<{valid: boolean, errors?: string[]}>}
   */
  async validatePost(postData) {
    const errors = [];

    // Check authentication
    if (this.validation.requiresAuth && !this.isConnected) {
      errors.push('Platform not connected');
    }

    // Check text requirements
    if (this.validation.requiresText && (!postData.content || postData.content.trim().length === 0)) {
      errors.push('Text content is required');
    }

    if (postData.content && postData.content.length < this.validation.minTextLength) {
      errors.push(`Text must be at least ${this.validation.minTextLength} characters`);
    }

    if (postData.content && postData.content.length > this.validation.maxTextLength) {
      errors.push(`Text must be no more than ${this.validation.maxTextLength} characters`);
    }

    // Check image requirements
    if (this.validation.requiresImage && !postData.image) {
      errors.push('Image is required for this platform');
    }

    if (postData.image) {
      const validation = this.validateImage(postData.image);
      if (!validation.valid) {
        errors.push(...validation.errors);
      }
    }

    return {
      valid: errors.length === 0,
      errors: errors.length > 0 ? errors : undefined
    };
  }

  /**
   * Validate image data
   * @param {Object} imageData - Image data to validate
   * @returns {{valid: boolean, errors?: string[]}}
   */
  validateImage(imageData) {
    const errors = [];

    if (!imageData || !imageData.data) {
      errors.push('Invalid image data');
      return { valid: false, errors };
    }

    // Check file size
    if (imageData.size > this.capabilities.maxImageSize) {
      const maxSizeMB = Math.round(this.capabilities.maxImageSize / (1024 * 1024));
      errors.push(`Image size exceeds ${maxSizeMB}MB limit`);
    }

    // Check format
    if (imageData.type) {
      const format = imageData.type.split('/')[1]?.toLowerCase();
      if (format && !this.capabilities.supportedImageFormats.includes(format)) {
        errors.push(`Unsupported image format: ${format}. Supported: ${this.capabilities.supportedImageFormats.join(', ')}`);
      }
    }

    return {
      valid: errors.length === 0,
      errors: errors.length > 0 ? errors : undefined
    };
  }

  // Helper methods

  /**
   * Get platform icon (override in platform implementations)
   * @returns {string} - HTML string for platform icon
   */
  getIcon() {
    return `<span class="platform-icon-text">${this.platformId.charAt(0).toUpperCase()}</span>`;
  }

  /**
   * Get connection status
   * @returns {boolean}
   */
  getConnectionStatus() {
    return this.isConnected;
  }

  /**
   * Get user information
   * @returns {Object}
   */
  getUserInfo() {
    return this.userInfo;
  }

  /**
   * Get platform capabilities
   * @returns {Object}
   */
  getCapabilities() {
    return this.capabilities;
  }

  /**
   * Get platform validation rules
   * @returns {Object}
   */
  getValidationRules() {
    return this.validation;
  }

  /**
   * Format text content for the platform (override for platform-specific formatting)
   * @param {string} content - Raw text content
   * @param {string[]} tags - Array of tags
   * @returns {string} - Formatted content
   */
  formatContent(content, tags = []) {
    let formatted = content;

    // Add hashtags if supported
    if (this.capabilities.hashtagSupport && tags.length > 0) {
      const hashtags = tags.map(tag => {
        // Remove existing # if present and add it
        const cleanTag = tag.replace(/^#/, '');
        return `#${cleanTag}`;
      }).join(' ');
      
      // Add hashtags at the end if not already present
      if (!formatted.includes(hashtags)) {
        formatted += `\n\n${hashtags}`;
      }
    }

    return formatted;
  }

  /**
   * Process image for platform-specific requirements (override as needed)
   * @param {Object} imageData - Original image data
   * @returns {Promise<Object>} - Processed image data
   */
  async processImage(imageData) {
    // Default implementation returns image as-is
    // Platform modules can override to resize, compress, etc.
    return imageData;
  }

  /**
   * Log method for debugging (can be overridden)
   * @param {string} message - Log message
   * @param {Object} data - Additional data to log
   */
  log(message, data = {}) {
    console.log(`[${this.platformId}] ${message}`, data);
  }

  /**
   * Generate credentials form fields (override in platform implementations)
   * @returns {Array} - Array of form field objects
   */
  getCredentialFields() {
    return [
      {
        name: 'username',
        label: 'Username',
        type: 'text',
        required: true,
        placeholder: 'Enter your username'
      },
      {
        name: 'password',
        label: 'Password',
        type: 'password',
        required: true,
        placeholder: 'Enter your password'
      }
    ];
  }

  /**
   * Get platform-specific post preview
   * @param {Object} postData - Post data to preview
   * @returns {string} - HTML preview
   */
  getPostPreview(postData) {
    const formattedContent = this.formatContent(postData.content, postData.tags);
    
    return `
      <div class="post-preview ${this.platformId}-preview">
        <div class="preview-header">
          <div class="platform-name">${this.displayName}</div>
          <div class="character-count">${formattedContent.length}/${this.capabilities.maxTextLength}</div>
        </div>
        <div class="preview-content">
          ${postData.image ? '<div class="preview-image">[Image will be attached]</div>' : ''}
          <div class="preview-text">${formattedContent.replace(/\n/g, '<br>')}</div>
        </div>
      </div>
    `;
  }

  /**
   * Check if the platform supports a specific feature
   * @param {string} feature - Feature name to check
   * @returns {boolean}
   */
  supportsFeature(feature) {
    return this.capabilities[feature] === true;
  }

  /**
   * Get platform-specific error messages
   * @param {string} errorCode - Platform error code
   * @returns {string} - User-friendly error message
   */
  getErrorMessage(errorCode) {
    const errorMessages = {
      'auth_failed': 'Authentication failed. Please check your credentials.',
      'rate_limit': 'Rate limit exceeded. Please try again later.',
      'invalid_image': 'Invalid or unsupported image format.',
      'content_too_long': `Content exceeds ${this.capabilities.maxTextLength} character limit.`,
      'network_error': 'Network error. Please check your connection.',
      'api_error': 'Platform API error. Please try again.',
      'duplicate_post': 'This post appears to be a duplicate.',
      'account_suspended': 'Your account appears to be suspended.',
      'insufficient_permissions': 'Insufficient permissions for this action.'
    };

    return errorMessages[errorCode] || `Unknown error: ${errorCode}`;
  }
}

// Export for use by platform modules
window.SocialPlatformBase = SocialPlatformBase;