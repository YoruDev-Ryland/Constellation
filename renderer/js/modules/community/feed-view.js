/**
 * Feed View Component
 * Displays the main feed of posts with infinite scroll
 */

class FeedView {
  constructor(container, options = {}) {
    this.container = container;
    this.onPostClick = options.onPostClick;
    this.onUserClick = options.onUserClick;
    
    this.posts = [];
    this.currentPage = 1;
    this.currentFilter = 'all'; // 'all', 'following', 'featured'
    this.hasMore = true;
    this.loading = false;
  }

  /**
   * Render the feed view
   */
  render() {
    this.container.innerHTML = `
      <div class="feed-view">
        <div class="feed-content" id="feedContent">
          <div class="feed-loading">
            <i class="fas fa-spinner fa-spin"></i>
            <p>Loading posts...</p>
          </div>
        </div>

        <div class="feed-loader" id="feedLoader" style="display: none;">
          <i class="fas fa-spinner fa-spin"></i>
          <p>Loading more...</p>
        </div>
      </div>
    `;

    this.attachEventListeners();
    this.loadPosts();
  }

  /**
   * Attach event listeners
   */
  attachEventListeners() {
    // Infinite scroll
    const feedContent = this.container.querySelector('#feedContent');
    feedContent.addEventListener('scroll', () => {
      const scrolledToBottom = feedContent.scrollHeight - feedContent.scrollTop <= feedContent.clientHeight + 200;
      
      if (scrolledToBottom && !this.loading && this.hasMore) {
        this.loadMore();
      }
    });
  }

  /**
   * Reset feed and reload
   */
  async resetFeed() {
    this.posts = [];
    this.currentPage = 1;
    this.hasMore = true;
    
    const feedContent = this.container.querySelector('#feedContent');
    feedContent.innerHTML = `
      <div class="feed-loading">
        <i class="fas fa-spinner fa-spin"></i>
        <p>Loading posts...</p>
      </div>
    `;
    
    await this.loadPosts();
  }

  /**
   * Load posts from API
   */
  async loadPosts() {
    if (this.loading) return;
    
    this.loading = true;
    const feedContent = this.container.querySelector('#feedContent');

    try {
      const response = await window.CommunityAPI.getPosts({
        page: this.currentPage,
        limit: 20,
        filter: this.currentFilter
      });

      this.posts = response.posts || [];
      this.hasMore = response.pagination?.hasMore || false;

      if (this.posts.length === 0) {
        feedContent.innerHTML = `
          <div class="empty-state">
            <i class="fas fa-images"></i>
            <h3>No posts yet</h3>
            <p>${this.currentFilter === 'following' 
              ? 'Follow some users to see their posts here' 
              : 'Be the first to share your astrophotography!'}</p>
            <button class="btn-primary create-post-btn">
              <i class="fas fa-plus"></i> Create Post
            </button>
          </div>
        `;
        
        // Re-attach create button listener
        const btn = feedContent.querySelector('.create-post-btn');
        if (btn) {
          btn.addEventListener('click', () => {
            if (window.socialManager) window.socialManager.showCreatePost();
          });
        }
      } else {
        this.renderPosts(feedContent);
      }
    } catch (error) {
      console.error('[FeedView] Failed to load posts:', error);
      feedContent.innerHTML = `
        <div class="error-state">
          <i class="fas fa-exclamation-triangle"></i>
          <h3>Failed to load posts</h3>
          <p>${error.message}</p>
          <button class="btn-primary retry-btn">Retry</button>
        </div>
      `;
      
      const retryBtn = feedContent.querySelector('.retry-btn');
      if (retryBtn) {
        retryBtn.addEventListener('click', () => this.resetFeed());
      }
    } finally {
      this.loading = false;
    }
  }

  /**
   * Load more posts (pagination)
   */
  async loadMore() {
    if (this.loading || !this.hasMore) return;

    this.loading = true;
    const loader = this.container.querySelector('#feedLoader');
    if (loader) loader.style.display = 'flex';

    try {
      this.currentPage++;
      const response = await window.CommunityAPI.getPosts({
        page: this.currentPage,
        limit: 20,
        filter: this.currentFilter
      });

      const newPosts = response.posts || [];
      this.posts.push(...newPosts);
      this.hasMore = response.pagination?.hasMore || false;

      // Append new posts
      const feedContent = this.container.querySelector('#feedContent');
      newPosts.forEach(post => {
        const postCard = new PostCard(post, {
          onLike: (postId, isLiked) => this.handleLike(postId, isLiked),
          onComment: (postId) => this.handleComment(postId),
          onDelete: (postId) => this.handleDelete(postId),
          onEdit: (post) => this.handleEdit(post),
          onUserClick: (userId) => this.handleUserClick(userId),
          onPostClick: (postId) => this.handlePostClick(postId)
        });
        feedContent.appendChild(postCard.render());
      });
    } catch (error) {
      console.error('[FeedView] Failed to load more:', error);
    } finally {
      this.loading = false;
      if (loader) loader.style.display = 'none';
    }
  }

  /**
   * Render posts to container
   */
  renderPosts(container) {
    container.innerHTML = '';
    
    this.posts.forEach(post => {
      const postCard = new PostCard(post, {
        onLike: (postId, isLiked) => this.handleLike(postId, isLiked),
        onComment: (postId) => this.handleComment(postId),
        onDelete: (postId) => this.handleDelete(postId),
        onEdit: (post) => this.handleEdit(post),
        onUserClick: (userId) => this.handleUserClick(userId),
        onPostClick: (postId) => this.handlePostClick(postId)
      });
      container.appendChild(postCard.render());
    });
  }

  /**
   * Handle like action
   */
  async handleLike(postId, isCurrentlyLiked) {
    try {
      if (isCurrentlyLiked) {
        await window.CommunityAPI.unlikePost(postId);
      } else {
        await window.CommunityAPI.likePost(postId);
      }
      return true;
    } catch (error) {
      console.error('[FeedView] Like failed:', error);
      
      // Check if auth error
      if (error.message.includes('authenticated') || error.message.includes('token')) {
        alert('Please log in to like posts');
        if (window.socialManager) {
          window.socialManager.handleLogout();
        }
      } else {
        alert('Failed to like post. Please try again.');
      }
      return false;
    }
  }

  /**
   * Handle comment action (open post detail)
   */
  handleComment(postId) {
    if (this.onPostClick) {
      this.onPostClick(postId);
    }
  }

  /**
   * Handle post click (open post detail)
   */
  handlePostClick(postId) {
    if (this.onPostClick) {
      this.onPostClick(postId);
    }
  }

  /**
   * Handle delete action
   */
  async handleDelete(postId) {
    try {
      await window.CommunityAPI.deletePost(postId);
      
      // Remove from UI
      const postCard = this.container.querySelector(`[data-post-id="${postId}"]`);
      if (postCard) {
        postCard.remove();
      }
      
      // Remove from local array
      this.posts = this.posts.filter(p => p.id !== postId);
      
      // Show empty state if no posts left
      if (this.posts.length === 0) {
        const feedContent = this.container.querySelector('#feedContent');
        feedContent.innerHTML = `
          <div class="empty-state">
            <i class="fas fa-images"></i>
            <h3>No posts yet</h3>
            <p>Create your first post to get started!</p>
          </div>
        `;
      }
    } catch (error) {
      console.error('[FeedView] Delete failed:', error);
      alert('Failed to delete post. Please try again.');
    }
  }

  /**
   * Handle edit action
   */
  handleEdit(post) {
    if (window.socialManager) {
      window.socialManager.showEditPost(post);
    }
  }

  /**
   * Handle user click
   */
  handleUserClick(userId) {
    if (this.onUserClick) {
      this.onUserClick(userId);
    }
  }

  /**
   * Refresh feed
   */
  refresh() {
    this.resetFeed();
  }

  /**
   * Set the current filter (called externally from header)
   */
  setFilter(filter) {
    if (filter !== this.currentFilter) {
      this.currentFilter = filter;
      this.resetFeed();
    }
  }
}

window.FeedView = FeedView;
