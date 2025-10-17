/**
 * Community API Client
 * Handles all HTTP communication with the community service API
 */

class CommunityAPI {
  constructor() {
    this.baseURL = 'https://starloch.com/community-api';
  }

  /**
   * Get authorization header with current token
   */
  async getAuthHeaders() {
    const token = await window.electronAPI.getAuthToken();
    if (!token) {
      throw new Error('Not authenticated');
    }
    return {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    };
  }

  /**
   * Make authenticated API request
   */
  async request(endpoint, options = {}) {
    const url = `${this.baseURL}${endpoint}`;
    
    try {
      const headers = options.skipAuth 
        ? { 'Content-Type': 'application/json' }
        : await this.getAuthHeaders();

      const response = await fetch(url, {
        ...options,
        headers: {
          ...headers,
          ...options.headers
        }
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({ error: 'Request failed' }));
        throw new Error(error.error || `HTTP ${response.status}`);
      }

      return await response.json();
    } catch (error) {
      console.error('[CommunityAPI] Request failed:', endpoint, error);
      throw error;
    }
  }

  // === POSTS ===

  /**
   * Get feed of posts
   * @param {Object} params - { page, limit, filter }
   */
  async getPosts(params = {}) {
    const query = new URLSearchParams({
      page: params.page || 1,
      limit: params.limit || 20,
      filter: params.filter || 'all'
    });
    
    // Don't skip auth - we need to send token to get is_liked status
    return this.request(`/posts?${query}`);
  }

  /**
   * Get single post by ID
   */
  async getPost(postId) {
    // Don't skip auth - we need to send token to get is_liked status
    return this.request(`/posts/${postId}`);
  }

  /**
   * Create new post
   * @param {FormData|Object} data - Post data (FormData for images, Object for text)
   */
  async createPost(data) {
    if (data instanceof FormData) {
      // For file uploads, don't set Content-Type (browser sets it with boundary)
      const token = await window.electronAPI.getAuthToken();
      const response = await fetch(`${this.baseURL}/posts`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`
        },
        body: data
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({ error: 'Upload failed' }));
        throw new Error(error.error || `HTTP ${response.status}`);
      }

      return await response.json();
    } else {
      return this.request('/posts', {
        method: 'POST',
        body: JSON.stringify(data)
      });
    }
  }

  /**
   * Update post
   */
  async updatePost(postId, data) {
    return this.request(`/posts/${postId}`, {
      method: 'PUT',
      body: JSON.stringify(data)
    });
  }

  /**
   * Delete post
   */
  async deletePost(postId) {
    return this.request(`/posts/${postId}`, {
      method: 'DELETE'
    });
  }

  // === COMMENTS ===

  /**
   * Get comments for a post
   */
  async getComments(postId) {
    // Don't skip auth - we need to send token to get is_liked status
    return this.request(`/posts/${postId}/comments`);
  }

  /**
   * Add comment to post
   */
  async addComment(postId, content, parentCommentId = null) {
    return this.request(`/posts/${postId}/comments`, {
      method: 'POST',
      body: JSON.stringify({
        content,
        parent_comment_id: parentCommentId
      })
    });
  }

  /**
   * Delete comment
   */
  async deleteComment(commentId) {
    return this.request(`/comments/${commentId}`, {
      method: 'DELETE'
    });
  }

  // === LIKES ===

  /**
   * Like a post
   */
  async likePost(postId) {
    return this.request(`/posts/${postId}/like`, {
      method: 'POST'
    });
  }

  /**
   * Unlike a post
   */
  async unlikePost(postId) {
    return this.request(`/posts/${postId}/like`, {
      method: 'DELETE'
    });
  }

  /**
   * Like a comment
   */
  async likeComment(commentId) {
    return this.request(`/comments/${commentId}/like`, {
      method: 'POST'
    });
  }

  /**
   * Unlike a comment
   */
  async unlikeComment(commentId) {
    return this.request(`/comments/${commentId}/like`, {
      method: 'DELETE'
    });
  }

  // === FOLLOWS ===

  /**
   * Follow a user
   */
  async followUser(userId) {
    return this.request(`/users/${userId}/follow`, {
      method: 'POST'
    });
  }

  /**
   * Unfollow a user
   */
  async unfollowUser(userId) {
    return this.request(`/users/${userId}/follow`, {
      method: 'DELETE'
    });
  }

  /**
   * Get user's followers
   */
  async getFollowers(userId) {
    return this.request(`/users/${userId}/followers`, { skipAuth: true });
  }

  /**
   * Get users that user follows
   */
  async getFollowing(userId) {
    return this.request(`/users/${userId}/following`, { skipAuth: true });
  }

  /**
   * Get user's posts
   */
  async getUserPosts(userId, params = {}) {
    const query = new URLSearchParams({
      page: params.page || 1,
      limit: params.limit || 20
    });
    
    // Don't skip auth - we need to send token to get is_liked status
    return this.request(`/users/${userId}/posts?${query}`);
  }
}

// Export singleton instance
window.CommunityAPI = new CommunityAPI();
