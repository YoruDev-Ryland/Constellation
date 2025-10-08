// Reddit Platform Module
// Implements the SocialPlatformBase interface for Reddit posting

class RedditPlatform extends SocialPlatformBase {
  constructor() {
    super({
      platformId: 'reddit',
      displayName: 'Reddit',
      description: 'Share your astrophotography in relevant subreddits',
      version: '1.0.0',
      apiEndpoint: 'https://oauth.reddit.com',
      capabilities: {
        textPosts: true,
        imagePosts: true,
        multipleImages: false, // Reddit typically supports one image per post
        videoSupport: true,
        hashtagSupport: false, // Reddit doesn't use hashtags
        mentionSupport: true, // u/username
        linkSupport: true,
        maxTextLength: 40000, // Reddit has a much higher limit
        supportedImageFormats: ['jpg', 'jpeg', 'png', 'gif'],
        maxImageSize: 20 * 1024 * 1024, // 20MB
        requiresTitle: true // Reddit posts require titles
      },
      validation: {
        requiresAuth: true,
        requiresImage: false,
        requiresText: false, // Reddit allows image-only posts
        requiresTitle: true, // Reddit requires a title
        minTextLength: 0,
        maxTextLength: 40000,
        minTitleLength: 1,
        maxTitleLength: 300
      }
    });

    // Reddit-specific properties
    this.selectedSubreddits = [];
    this.availableSubreddits = [
      'astrophotography',
      'spaceporn',
      'astronomy',
      'telescopes',
      'space',
      'deepspace',
      'nebulas',
      'galaxies',
      'milkyway',
      'earthporn', // For landscape astrophotography
      'exposureporn',
      'itap' // I Took A Picture
    ];
  }

  getIcon() {
    return `
      <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor" class="reddit-icon">
        <path d="M12 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0zm5.01 4.744c.688 0 1.25.561 1.25 1.249a1.25 1.25 0 0 1-2.498.056l-2.597-.547-.8 3.747c1.824.07 3.48.632 4.674 1.488.308-.309.73-.491 1.207-.491.968 0 1.754.786 1.754 1.754 0 .716-.435 1.333-1.01 1.614a3.111 3.111 0 0 1 .042.52c0 2.694-3.13 4.87-7.004 4.87-3.874 0-7.004-2.176-7.004-4.87 0-.183.015-.366.043-.534A1.748 1.748 0 0 1 4.028 12c0-.968.786-1.754 1.754-1.754.463 0 .898.196 1.207.49 1.207-.883 2.878-1.43 4.744-1.487l.885-4.182a.342.342 0 0 1 .14-.197.35.35 0 0 1 .238-.042l2.906.617a1.214 1.214 0 0 1 1.108-.701zM9.25 12C8.561 12 8 12.562 8 13.25c0 .687.561 1.248 1.25 1.248.687 0 1.248-.561 1.248-1.249 0-.688-.561-1.249-1.249-1.249zm5.5 0c-.687 0-1.248.561-1.248 1.25 0 .687.561 1.248 1.249 1.248.688 0 1.249-.561 1.249-1.249 0-.687-.562-1.249-1.25-1.249zm-5.466 3.99a.327.327 0 0 0-.231.094.33.33 0 0 0 0 .463c.842.842 2.484.913 2.961.913.477 0 2.105-.056 2.961-.913a.361.361 0 0 0 .029-.463.33.33 0 0 0-.464 0c-.547.533-1.684.73-2.512.73-.828 0-1.979-.196-2.512-.73a.326.326 0 0 0-.232-.095z"/>
      </svg>
    `;
  }

  getCredentialFields() {
    return [
      {
        name: 'clientId',
        label: 'Client ID',
        type: 'text',
        required: true,
        placeholder: 'Your Reddit App Client ID',
        help: 'Create an app at https://www.reddit.com/prefs/apps'
      },
      {
        name: 'clientSecret',
        label: 'Client Secret',
        type: 'password',
        required: true,
        placeholder: 'Your Reddit App Client Secret',
        help: 'Keep this secret and secure'
      },
      {
        name: 'username',
        label: 'Username',
        type: 'text',
        required: true,
        placeholder: 'Your Reddit username',
        help: 'Your Reddit account username'
      },
      {
        name: 'password',
        label: 'Password',
        type: 'password',
        required: true,
        placeholder: 'Your Reddit password',
        help: 'Your Reddit account password'
      }
    ];
  }

  async connect(credentials) {
    try {
      this.log('Attempting Reddit connection', { username: credentials.username });

      // Validate credentials format
      const required = ['clientId', 'clientSecret', 'username', 'password'];
      for (const field of required) {
        if (!credentials[field]) {
          throw new Error(`Missing required field: ${field}`);
        }
      }

      // Simulate OAuth authentication
      const authResult = await this.authenticateWithReddit(credentials);
      
      if (!authResult.success) {
        throw new Error(authResult.error || 'Authentication failed');
      }

      this.isConnected = true;
      this.connection = {
        accessToken: authResult.accessToken,
        refreshToken: authResult.refreshToken,
        tokenExpiry: Date.now() + (authResult.expiresIn * 1000)
      };
      
      this.userInfo = authResult.userInfo || {
        username: credentials.username,
        karma: 0,
        created: new Date().toISOString(),
        verified: false
      };

      this.log('Reddit connection successful', { username: this.userInfo.username });

      return {
        success: true,
        connection: this.connection,
        userInfo: this.userInfo
      };

    } catch (error) {
      this.log('Reddit connection failed', { error: error.message });
      return {
        success: false,
        error: error.message
      };
    }
  }

  async authenticateWithReddit(credentials) {
    // Simulate Reddit OAuth flow
    // In a real implementation, this would:
    // 1. Make a POST to https://www.reddit.com/api/v1/access_token
    // 2. Use script app credentials
    // 3. Exchange username/password for access token
    
    // Basic validation
    if (credentials.username.length < 3 || credentials.password.length < 6) {
      return {
        success: false,
        error: 'Invalid username or password format'
      };
    }

    // Simulate successful authentication
    return {
      success: true,
      accessToken: `fake_reddit_token_${Date.now()}`,
      refreshToken: `fake_refresh_token_${Date.now()}`,
      expiresIn: 3600, // 1 hour
      userInfo: {
        username: credentials.username,
        karma: Math.floor(Math.random() * 10000),
        created: new Date(Date.now() - Math.random() * 365 * 24 * 60 * 60 * 1000).toISOString(),
        verified: Math.random() > 0.7
      }
    };
  }

  async disconnect() {
    this.log('Disconnecting from Reddit');
    this.selectedSubreddits = [];
    const result = await super.disconnect();
    return result;
  }

  async post(postData) {
    try {
      this.log('Preparing Reddit post', { 
        hasTitle: !!postData.title,
        hasContent: !!postData.content,
        hasImage: !!postData.image,
        subreddits: postData.subreddits?.length || 0
      });

      // Reddit requires a title
      if (!postData.title || postData.title.trim().length === 0) {
        throw new Error('Reddit posts require a title');
      }

      // Reddit requires at least one subreddit
      const subreddits = postData.subreddits || ['astrophotography'];
      if (subreddits.length === 0) {
        throw new Error('At least one subreddit must be selected');
      }

      // Validate post data
      const validation = await this.validatePost(postData);
      if (!validation.valid) {
        throw new Error(`Validation failed: ${validation.errors.join(', ')}`);
      }

      const results = [];
      
      // Post to each selected subreddit
      for (const subreddit of subreddits) {
        try {
          const postResult = await this.postToSubreddit(postData, subreddit);
          results.push({
            subreddit: subreddit,
            success: postResult.success,
            postId: postResult.postId,
            url: postResult.url,
            error: postResult.error
          });
        } catch (error) {
          results.push({
            subreddit: subreddit,
            success: false,
            error: error.message
          });
        }
      }

      const successCount = results.filter(r => r.success).length;
      const primaryResult = results[0]; // Use first result as primary

      if (successCount > 0) {
        this.log('Reddit post successful', { 
          successCount,
          totalSubreddits: subreddits.length,
          primaryUrl: primaryResult.url
        });

        return {
          success: true,
          postId: primaryResult.postId,
          url: primaryResult.url,
          results: results // Include all subreddit results
        };
      } else {
        throw new Error(`Failed to post to all subreddits: ${results.map(r => r.error).join(', ')}`);
      }

    } catch (error) {
      this.log('Reddit post failed', { error: error.message });
      return {
        success: false,
        error: this.getErrorMessage(error.message) || error.message
      };
    }
  }

  async postToSubreddit(postData, subreddit) {
    try {
      this.log('Posting to subreddit', { subreddit });

      // Determine post type
      const isImagePost = !!postData.image;
      const isTextPost = !!postData.content && !isImagePost;
      const isLinkPost = !isImagePost && !isTextPost && !!postData.url;

      let postPayload = {
        sr: subreddit,
        title: postData.title,
        kind: isImagePost ? 'image' : isTextPost ? 'self' : 'link'
      };

      if (isImagePost) {
        // Upload image first
        const mediaResult = await this.uploadImage(postData.image);
        if (!mediaResult.success) {
          throw new Error(`Image upload failed: ${mediaResult.error}`);
        }
        postPayload.url = mediaResult.url;
      } else if (isTextPost) {
        postPayload.text = this.formatContentForReddit(postData.content, postData.tags);
      } else if (isLinkPost) {
        postPayload.url = postData.url;
      }

      // Simulate posting to Reddit API
      const result = await this.submitRedditPost(postPayload);

      if (result.success) {
        const postId = result.postId;
        const postUrl = `https://www.reddit.com/r/${subreddit}/comments/${postId}/`;

        this.log('Subreddit post successful', { subreddit, postId });

        return {
          success: true,
          postId: postId,
          url: postUrl
        };
      } else {
        throw new Error(result.error || 'Post submission failed');
      }

    } catch (error) {
      this.log('Subreddit post failed', { subreddit, error: error.message });
      return {
        success: false,
        error: error.message
      };
    }
  }

  async uploadImage(imageData) {
    try {
      this.log('Uploading image to Reddit');

      // Validate image
      const validation = this.validateImage(imageData);
      if (!validation.valid) {
        throw new Error(validation.errors.join(', '));
      }

      // Process image if needed
      const processedImage = await this.processImage(imageData);

      // Simulate image upload to Reddit
      // In real implementation, this would upload to Reddit's media endpoint
      
      const imageUrl = `https://i.redd.it/fake_image_${Date.now()}.${processedImage.type.split('/')[1]}`;
      
      this.log('Image upload successful', { imageUrl });

      return {
        success: true,
        url: imageUrl
      };

    } catch (error) {
      this.log('Image upload failed', { error: error.message });
      return {
        success: false,
        error: error.message
      };
    }
  }

  async submitRedditPost(payload) {
    try {
      this.log('Submitting Reddit post', { subreddit: payload.sr, kind: payload.kind });

      // Simulate API call delay
      await new Promise(resolve => setTimeout(resolve, 1500));

      // Simulate success (in demo mode)
      const postId = Math.random().toString(36).substr(2, 9);

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

  formatContentForReddit(content, tags = []) {
    // Reddit doesn't use hashtags, but we can mention relevant info
    let formatted = content || '';

    // Add equipment/technical info in a Reddit-friendly way
    if (tags && tags.length > 0) {
      const relevantTags = tags.filter(tag => 
        !tag.toLowerCase().includes('astro') && 
        !tag.toLowerCase().includes('photo')
      );
      
      if (relevantTags.length > 0) {
        formatted += '\n\n**Equipment/Tags:** ' + relevantTags.join(', ');
      }
    }

    return formatted;
  }

  getSubredditOptions() {
    return this.availableSubreddits.map(sub => ({
      value: sub,
      label: `r/${sub}`,
      description: this.getSubredditDescription(sub)
    }));
  }

  getSubredditDescription(subreddit) {
    const descriptions = {
      'astrophotography': 'Dedicated to astrophotography - the most relevant community',
      'spaceporn': 'High quality space images and astrophotography',
      'astronomy': 'General astronomy discussion and images',
      'telescopes': 'For telescope and equipment discussions',
      'space': 'General space-related content',
      'deepspace': 'Deep space objects and astrophotography',
      'nebulas': 'Specifically for nebula photography',
      'galaxies': 'Galaxy photography and discussion',
      'milkyway': 'Milky Way photography',
      'earthporn': 'For landscape astrophotography',
      'exposureporn': 'Long exposure photography including astro',
      'itap': 'I Took A Picture - general photography'
    };

    return descriptions[subreddit] || 'Subreddit for sharing your content';
  }

  validatePost(postData) {
    const errors = [];

    // Call parent validation
    const parentValidation = super.validatePost(postData);
    if (!parentValidation.valid) {
      errors.push(...parentValidation.errors);
    }

    // Reddit-specific validation
    if (!postData.title || postData.title.trim().length === 0) {
      errors.push('Title is required for Reddit posts');
    }

    if (postData.title && postData.title.length > this.validation.maxTitleLength) {
      errors.push(`Title must be no more than ${this.validation.maxTitleLength} characters`);
    }

    // Check if at least one subreddit is selected
    const subreddits = postData.subreddits || [];
    if (subreddits.length === 0) {
      errors.push('At least one subreddit must be selected');
    }

    return {
      valid: errors.length === 0,
      errors: errors.length > 0 ? errors : undefined
    };
  }

  getPostPreview(postData) {
    const formattedContent = this.formatContentForReddit(postData.content, postData.tags);
    const subreddits = postData.subreddits || ['astrophotography'];
    
    return `
      <div class="post-preview reddit-preview">
        <div class="preview-header">
          <div class="platform-info">
            ${this.getIcon()}
            <span class="platform-name">${this.displayName}</span>
          </div>
          <div class="subreddit-info">
            ${subreddits.map(sub => `r/${sub}`).join(', ')}
          </div>
        </div>
        <div class="preview-content reddit-content">
          <div class="reddit-post">
            <div class="vote-section">
              <div class="vote-arrow">▲</div>
              <div class="vote-count">•</div>
              <div class="vote-arrow">▼</div>
            </div>
            <div class="post-content">
              <div class="post-title">${postData.title || 'Post Title'}</div>
              <div class="post-meta">
                submitted by u/${this.userInfo.username || 'yourusername'} • just now
              </div>
              ${postData.image ? '<div class="preview-image">[Image will be attached]</div>' : ''}
              ${formattedContent ? `<div class="preview-text">${formattedContent.replace(/\n/g, '<br>')}</div>` : ''}
              <div class="post-actions">
                <span>💬 comments</span> <span>share</span> <span>save</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  getErrorMessage(errorCode) {
    const redditErrors = {
      'invalid_credentials': 'Invalid Reddit credentials. Please check your app credentials.',
      'rate_limit_exceeded': 'Reddit rate limit exceeded. Please wait before posting again.',
      'subreddit_not_found': 'The specified subreddit does not exist.',
      'banned_from_subreddit': 'You are banned from this subreddit.',
      'title_required': 'Reddit posts require a title.',
      'image_upload_failed': 'Failed to upload image to Reddit.',
      'insufficient_karma': 'Your account needs more karma to post in this subreddit.',
      'account_too_new': 'Your account is too new to post in this subreddit.',
      ...super.getErrorMessage(errorCode)
    };

    return redditErrors[errorCode] || super.getErrorMessage(errorCode);
  }

  // Override to include title field and subreddit selection
  getCredentialForm() {
    const fields = this.getCredentialFields();
    
    return `
      <div class="credential-form reddit-form">
        ${fields.map(field => `
          <div class="form-group">
            <label for="${field.name}">${field.label}${field.required ? ' *' : ''}</label>
            <input 
              type="${field.type}" 
              id="${field.name}" 
              name="${field.name}"
              placeholder="${field.placeholder || ''}"
              ${field.required ? 'required' : ''}
            >
            ${field.help ? `<small class="form-help">${field.help}</small>` : ''}
          </div>
        `).join('')}
        
        <div class="form-group">
          <label>Default Subreddits</label>
          <div class="subreddit-checkboxes">
            ${this.getSubredditOptions().slice(0, 6).map(option => `
              <label class="subreddit-option">
                <input type="checkbox" value="${option.value}" ${option.value === 'astrophotography' ? 'checked' : ''}>
                <span class="subreddit-label">
                  ${option.label}
                  <small>${option.description}</small>
                </span>
              </label>
            `).join('')}
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
    const redditPlatform = new RedditPlatform();
    socialManager.registerPlatform('reddit', redditPlatform);
    console.log('Reddit platform module loaded and registered');
  }
});

// Export for manual registration if needed
window.RedditPlatform = RedditPlatform;