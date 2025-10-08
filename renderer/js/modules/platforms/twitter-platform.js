// Twitter/X Platform Module
// Implements the SocialPlatformBase interface for Twitter/X posting

class TwitterPlatform extends SocialPlatformBase {
  constructor() {
    super({
      platformId: 'twitter',
      displayName: 'Twitter / X',
      description: 'Share your astrophotography on Twitter/X with text and images',
      version: '1.0.0',
      apiEndpoint: 'https://api.twitter.com/2',
      capabilities: {
        textPosts: true,
        imagePosts: true,
        multipleImages: true, // Twitter supports up to 4 images
        videoSupport: true,
        hashtagSupport: true,
        mentionSupport: true,
        linkSupport: true,
        maxTextLength: 280,
        supportedImageFormats: ['jpg', 'jpeg', 'png', 'gif', 'webp'],
        maxImageSize: 5 * 1024 * 1024, // 5MB
        maxImages: 4
      },
      validation: {
        requiresAuth: true,
        requiresImage: false,
        requiresText: false, // Twitter allows image-only posts
        minTextLength: 0,
        maxTextLength: 280
      }
    });
  }

  getIcon() {
    return `
      <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor" class="twitter-icon">
        <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
      </svg>
    `;
  }

  getCredentialFields() {
    return [
      {
        name: 'apiKey',
        label: 'API Key',
        type: 'text',
        required: true,
        placeholder: 'Your Twitter API Key',
        help: 'Get this from your Twitter Developer Portal'
      },
      {
        name: 'apiSecret',
        label: 'API Secret',
        type: 'password',
        required: true,
        placeholder: 'Your Twitter API Secret',
        help: 'Keep this secret and secure'
      },
      {
        name: 'accessToken',
        label: 'Access Token',
        type: 'text',
        required: true,
        placeholder: 'Your Twitter Access Token',
        help: 'Generated in your Twitter Developer Portal'
      },
      {
        name: 'accessTokenSecret',
        label: 'Access Token Secret',
        type: 'password',
        required: true,
        placeholder: 'Your Twitter Access Token Secret',
        help: 'Keep this secret and secure'
      }
    ];
  }

  async connect(credentials) {
    try {
      this.log('Attempting Twitter connection', { hasCredentials: !!credentials });

      // Validate credentials format
      const required = ['apiKey', 'apiSecret', 'accessToken', 'accessTokenSecret'];
      for (const field of required) {
        if (!credentials[field]) {
          throw new Error(`Missing required field: ${field}`);
        }
      }

      // Since this is a demo implementation, we'll simulate the connection
      // In a real implementation, you would:
      // 1. Use OAuth 1.0a or OAuth 2.0 to authenticate
      // 2. Make a test API call to verify credentials
      // 3. Store tokens securely
      
      // Simulate API verification call
      const isValid = await this.verifyCredentials(credentials);
      
      if (!isValid.success) {
        throw new Error(isValid.error || 'Invalid credentials');
      }

      this.isConnected = true;
      this.connection = {
        apiKey: credentials.apiKey,
        // Note: In production, tokens should be encrypted
        tokens: {
          access_token: credentials.accessToken,
          access_token_secret: credentials.accessTokenSecret
        }
      };
      
      this.userInfo = isValid.userInfo || {
        username: 'demo_user',
        displayName: 'Demo User',
        followers: 0,
        verified: false
      };

      this.log('Twitter connection successful', { username: this.userInfo.username });

      return {
        success: true,
        connection: this.connection,
        userInfo: this.userInfo
      };

    } catch (error) {
      this.log('Twitter connection failed', { error: error.message });
      return {
        success: false,
        error: error.message
      };
    }
  }

  async verifyCredentials(credentials) {
    // Simulate credential verification
    // In a real implementation, this would make an actual API call
    
    // Basic validation
    if (credentials.apiKey.length < 10 || credentials.accessToken.length < 10) {
      return {
        success: false,
        error: 'Invalid credential format'
      };
    }

    // Simulate successful verification
    return {
      success: true,
      userInfo: {
        username: 'astro_photographer',
        displayName: 'Astrophotographer',
        followers: 1250,
        verified: false,
        profile_image_url: null
      }
    };
  }

  async disconnect() {
    this.log('Disconnecting from Twitter');
    const result = await super.disconnect();
    return result;
  }

  async post(postData) {
    try {
      this.log('Preparing Twitter post', { 
        hasContent: !!postData.content,
        hasImage: !!postData.image,
        tagCount: postData.tags?.length || 0
      });

      // Validate post data
      const validation = await this.validatePost(postData);
      if (!validation.valid) {
        throw new Error(`Validation failed: ${validation.errors.join(', ')}`);
      }

      // Format content with hashtags
      const formattedContent = this.formatContent(postData.content || '', postData.tags || []);

      // Prepare the post payload
      const postPayload = {
        text: formattedContent
      };

      // Handle image upload if present
      let mediaIds = [];
      if (postData.image) {
        const mediaResult = await this.uploadMedia(postData.image);
        if (mediaResult.success) {
          mediaIds.push(mediaResult.mediaId);
          postPayload.media = { media_ids: mediaIds };
        } else {
          throw new Error(`Image upload failed: ${mediaResult.error}`);
        }
      }

      // Simulate posting to Twitter API
      const postResult = await this.sendTweet(postPayload);

      if (postResult.success) {
        this.log('Twitter post successful', { 
          postId: postResult.postId,
          hasImage: mediaIds.length > 0
        });

        return {
          success: true,
          postId: postResult.postId,
          url: `https://twitter.com/${this.userInfo.username}/status/${postResult.postId}`
        };
      } else {
        throw new Error(postResult.error || 'Post failed');
      }

    } catch (error) {
      this.log('Twitter post failed', { error: error.message });
      return {
        success: false,
        error: this.getErrorMessage(error.message) || error.message
      };
    }
  }

  async uploadMedia(imageData) {
    try {
      this.log('Uploading image to Twitter');

      // Validate image
      const validation = this.validateImage(imageData);
      if (!validation.valid) {
        throw new Error(validation.errors.join(', '));
      }

      // Process image if needed
      const processedImage = await this.processImage(imageData);

      // Simulate media upload
      // In real implementation, this would:
      // 1. Upload to Twitter's media endpoint
      // 2. Wait for processing
      // 3. Return media ID
      
      const mediaId = `fake_media_${Date.now()}`;
      
      this.log('Image upload successful', { mediaId });

      return {
        success: true,
        mediaId: mediaId
      };

    } catch (error) {
      this.log('Image upload failed', { error: error.message });
      return {
        success: false,
        error: error.message
      };
    }
  }

  async sendTweet(payload) {
    try {
      this.log('Sending tweet', { hasMedia: !!payload.media });

      // Simulate API call delay
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Simulate success (in demo mode)
      const postId = `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

      return {
        success: true,
        postId: postId,
        created_at: new Date().toISOString()
      };

    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  formatContent(content, tags = []) {
    // Twitter-specific content formatting
    let formatted = content || '';

    // Add hashtags
    if (this.capabilities.hashtagSupport && tags.length > 0) {
      const hashtags = tags
        .map(tag => {
          // Clean and format hashtags for Twitter
          const cleanTag = tag.replace(/[^a-zA-Z0-9_]/g, '').substring(0, 100);
          return cleanTag ? `#${cleanTag}` : null;
        })
        .filter(Boolean)
        .join(' ');
      
      if (hashtags) {
        // Check if adding hashtags would exceed character limit
        const contentWithHashtags = formatted + (formatted ? '\n\n' : '') + hashtags;
        if (contentWithHashtags.length <= this.capabilities.maxTextLength) {
          formatted = contentWithHashtags;
        } else {
          // Try to fit as many hashtags as possible
          const availableSpace = this.capabilities.maxTextLength - formatted.length - 2; // -2 for \n\n
          if (availableSpace > 5) { // Minimum space for a hashtag
            const truncatedHashtags = this.truncateHashtags(hashtags, availableSpace);
            if (truncatedHashtags) {
              formatted += '\n\n' + truncatedHashtags;
            }
          }
        }
      }
    }

    return formatted;
  }

  truncateHashtags(hashtags, maxLength) {
    const tags = hashtags.split(' ');
    let result = [];
    let currentLength = 0;

    for (const tag of tags) {
      if (currentLength + tag.length + (result.length > 0 ? 1 : 0) <= maxLength) {
        result.push(tag);
        currentLength += tag.length + (result.length > 1 ? 1 : 0);
      } else {
        break;
      }
    }

    return result.join(' ');
  }

  getErrorMessage(errorCode) {
    const twitterErrors = {
      'invalid_credentials': 'Invalid Twitter API credentials. Please check your API keys.',
      'rate_limit_exceeded': 'Twitter rate limit exceeded. Please wait before posting again.',
      'duplicate_status': 'This tweet appears to be a duplicate of a recent post.',
      'media_upload_failed': 'Failed to upload image to Twitter.',
      'tweet_too_long': 'Tweet exceeds 280 character limit.',
      'account_suspended': 'Your Twitter account appears to be suspended.',
      'api_v2_required': 'This feature requires Twitter API v2 access.',
      ...super.getErrorMessage(errorCode)
    };

    return twitterErrors[errorCode] || super.getErrorMessage(errorCode);
  }

  getPostPreview(postData) {
    const formattedContent = this.formatContent(postData.content, postData.tags);
    
    return `
      <div class="post-preview twitter-preview">
        <div class="preview-header">
          <div class="platform-info">
            ${this.getIcon()}
            <span class="platform-name">${this.displayName}</span>
          </div>
          <div class="character-count ${formattedContent.length > 260 ? 'warning' : ''} ${formattedContent.length > 280 ? 'error' : ''}">
            ${formattedContent.length}/280
          </div>
        </div>
        <div class="preview-content twitter-content">
          <div class="tweet-author">
            <div class="author-avatar">📷</div>
            <div class="author-info">
              <div class="author-name">${this.userInfo.displayName || 'Your Name'}</div>
              <div class="author-handle">@${this.userInfo.username || 'yourusername'}</div>
            </div>
          </div>
          ${postData.image ? '<div class="preview-image">[Image will be attached]</div>' : ''}
          <div class="preview-text">${formattedContent.replace(/\n/g, '<br>')}</div>
          <div class="tweet-actions">
            <span>💬</span> <span>🔄</span> <span>❤️</span> <span>📊</span> <span>↗️</span>
          </div>
        </div>
      </div>
    `;
  }
}

// Auto-register the platform when the module loads
document.addEventListener('DOMContentLoaded', () => {
  const socialManager = window.ensureSocialManager?.();
  if (socialManager) {
    const twitterPlatform = new TwitterPlatform();
    socialManager.registerPlatform('twitter', twitterPlatform);
    console.log('Twitter platform module loaded and registered');
  }
});

// Export for manual registration if needed
window.TwitterPlatform = TwitterPlatform;