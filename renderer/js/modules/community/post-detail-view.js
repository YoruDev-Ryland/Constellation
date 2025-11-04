/**
 * Post Detail View Component
 * Shows full post with comments
 */

class PostDetailView {
  constructor(container, postId, options = {}) {
    this.container = container;
    this.postId = postId;
    this.onBack = options.onBack;
    this.onUserClick = options.onUserClick;
    this.onEdit = options.onEdit;
    this.onDelete = options.onDelete;
    
    this.post = null;
    this.comments = [];
  }

  /**
   * Render the post detail view
   */
  async render() {
    this.container.innerHTML = `
      <div class="post-detail-view">
        <div class="post-detail-header">
          <button class="btn-icon back-btn">
            <i class="fas fa-arrow-left"></i>
          </button>
          <h3>Post</h3>
        </div>
        
        <div class="post-detail-content" id="postDetailContent">
          <div class="feed-loading">
            <i class="fas fa-spinner fa-spin"></i>
            <p>Loading post...</p>
          </div>
        </div>
      </div>
    `;

    // Back button
    const backBtn = this.container.querySelector('.back-btn');
    if (backBtn) {
      backBtn.addEventListener('click', () => {
        if (this.onBack) this.onBack();
      });
    }

    await this.loadPost();
  }

  /**
   * Load post and comments
   */
  async loadPost() {
    const content = this.container.querySelector('#postDetailContent');

    try {
      // Load post
      const postResponse = await window.CommunityAPI.getPost(this.postId);
      this.post = postResponse.post;

      // Load comments
      const commentsResponse = await window.CommunityAPI.getComments(this.postId);
      this.comments = commentsResponse.comments || [];

      this.renderPostDetail(content);
    } catch (error) {
      console.error('[PostDetailView] Failed to load:', error);
      content.innerHTML = `
        <div class="error-state">
          <i class="fas fa-exclamation-triangle"></i>
          <h3>Failed to load post</h3>
          <p>${error.message}</p>
        </div>
      `;
    }
  }

  /**
   * Render post detail with comments
   */
  renderPostDetail(container) {
    container.innerHTML = '';

    // Create main layout structure
    const detailLayout = document.createElement('div');
    detailLayout.className = 'post-detail-layout';

    // Left column - Main post content
    const mainColumn = document.createElement('div');
    mainColumn.className = 'post-detail-main';

    // Post header with author info
    const postHeader = document.createElement('div');
    postHeader.className = 'detail-post-header';
    const initials = this.post.username ? this.post.username.substring(0, 2).toUpperCase() : 'U';
    postHeader.innerHTML = `
      <div class="detail-author-section">
        ${this.post.avatar ? 
          `<img src="${this.post.avatar}" alt="${this.post.username}" class="detail-author-avatar" />` :
          `<div class="detail-author-avatar-placeholder">${initials}</div>`
        }
        <div class="detail-author-info">
          <h2 class="detail-author-name">${this.escapeHtml(this.post.username)}</h2>
          <span class="detail-post-date">${this.formatDate(this.post.created_at)}</span>
        </div>
      </div>
      ${this.isOwner() ? `
        <div class="detail-post-actions">
          <button class="btn-icon detail-menu-btn" title="More options">
            <i class="fas fa-ellipsis-h"></i>
          </button>
          <div class="detail-post-menu" style="display: none;">
            <button class="post-menu-item detail-edit-btn">
              <i class="fas fa-edit"></i> Edit Post
            </button>
            <button class="post-menu-item detail-delete-btn">
              <i class="fas fa-trash"></i> Delete Post
            </button>
          </div>
        </div>
      ` : ''}
    `;
    mainColumn.appendChild(postHeader);

    // Post content
    const postContent = document.createElement('div');
    postContent.className = 'detail-post-content';
    postContent.innerHTML = `<p>${this.escapeHtml(this.post.content)}</p>`;
    mainColumn.appendChild(postContent);

    // Post image (if exists)
    if (this.post.image_url) {
      const imageContainer = document.createElement('div');
      imageContainer.className = 'detail-post-image';
      imageContainer.innerHTML = `
        <img src="https://starloch.com${this.post.image_url}" 
             alt="${this.post.target_name || 'Post image'}" 
             class="detail-image" 
             loading="lazy" />
      `;
      mainColumn.appendChild(imageContainer);
      
      // Add click handler for image viewer
      const img = imageContainer.querySelector('.detail-image');
      if (img) {
        img.style.cursor = 'pointer';
        img.addEventListener('click', () => {
          if (window.ImageViewer && window.ImageViewer.show) {
            window.ImageViewer.show(img.src);
          }
        });
      }
    }

    // Post interactions
    const interactions = document.createElement('div');
    interactions.className = 'detail-post-interactions';
    interactions.innerHTML = `
      <button class="detail-interaction-btn detail-like-btn ${this.post.is_liked ? 'active' : ''}" 
              data-post-id="${this.post.id}">
        <i class="fas fa-heart"></i>
        <span class="detail-likes-count">${this.post.likes_count || 0}</span>
      </button>
      <button class="detail-interaction-btn">
        <i class="fas fa-comment"></i>
        <span>${this.comments.length}</span>
      </button>
    `;
    mainColumn.appendChild(interactions);

    detailLayout.appendChild(mainColumn);

    // Right sidebar - Metadata and equipment
    const sidebar = document.createElement('div');
    sidebar.className = 'post-detail-sidebar';

    // Astrophotography metadata
    if (this.post.target_name || this.post.integration_time || this.post.filters || this.post.acquisition_date) {
      const metadataSection = document.createElement('div');
      metadataSection.className = 'detail-metadata-section';
      metadataSection.innerHTML = `
        <h3><i class="fas fa-info-circle"></i> Capture Details</h3>
        <div class="detail-metadata-list">
          ${this.post.target_name ? `
            <div class="detail-meta-item">
              <i class="fas fa-bullseye"></i>
              <div>
                <label>Target</label>
                <span>${this.escapeHtml(this.post.target_name)}</span>
              </div>
            </div>
          ` : ''}
          ${this.post.acquisition_date ? `
            <div class="detail-meta-item">
              <i class="fas fa-calendar"></i>
              <div>
                <label>Date</label>
                <span>${new Date(this.post.acquisition_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
              </div>
            </div>
          ` : ''}
          ${this.post.integration_time ? `
            <div class="detail-meta-item">
              <i class="fas fa-clock"></i>
              <div>
                <label>Integration Time</label>
                <span>${this.formatIntegrationTime(this.post.integration_time)}</span>
              </div>
            </div>
          ` : ''}
          ${this.post.filters ? `
            <div class="detail-meta-item">
              <i class="fas fa-filter"></i>
              <div>
                <label>Filters</label>
                <span>${this.escapeHtml(this.post.filters)}</span>
              </div>
            </div>
          ` : ''}
        </div>
      `;
      sidebar.appendChild(metadataSection);
    }

    // Equipment section
    if (this.post.equipment) {
      const equipmentSection = document.createElement('div');
      equipmentSection.className = 'detail-equipment-section';
      equipmentSection.innerHTML = `
        <h3><i class="fas fa-telescope"></i> Equipment</h3>
        <div class="detail-equipment-content">
          <p>${this.escapeHtml(this.post.equipment).replace(/\n/g, '<br>')}</p>
        </div>
      `;
      sidebar.appendChild(equipmentSection);
    }

    detailLayout.appendChild(sidebar);
    container.appendChild(detailLayout);

    // Comments section (full width below)
    const commentsSection = document.createElement('div');
    commentsSection.className = 'detail-comments-section';
    commentsSection.innerHTML = `
      <div class="detail-comments-header">
        <h3><i class="fas fa-comments"></i> Comments (${this.comments.length})</h3>
      </div>

      <div class="detail-comment-composer">
        <textarea 
          id="commentInput" 
          placeholder="Write a comment..." 
          rows="3"
        ></textarea>
        <button class="btn-primary" id="submitCommentBtn">
          <i class="fas fa-paper-plane"></i>
          Post Comment
        </button>
      </div>

      <div class="detail-comments-list" id="commentsList">
        ${this.comments.length === 0 ? `
          <div class="empty-state">
            <i class="fas fa-comments"></i>
            <p>No comments yet. Be the first to comment!</p>
          </div>
        ` : ''}
      </div>
    `;

    container.appendChild(commentsSection);

    // Render comments
    if (this.comments.length > 0) {
      this.renderComments();
    }

    // Event listeners
    this.attachDetailEventListeners(container);
  }

  /**
   * Check if current user is post owner
   */
  isOwner() {
    return window.socialManager && window.socialManager.user && 
           window.socialManager.user.id === this.post.user_id;
  }

  /**
   * Format integration time
   */
  formatIntegrationTime(minutes) {
    if (!minutes) return '';
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    if (hours > 0) {
      return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
    }
    return `${mins}m`;
  }

  /**
   * Format date for display
   */
  formatDate(dateString) {
    const date = new Date(dateString);
    const now = new Date();
    const diff = now - date;
    const seconds = Math.floor(diff / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 7) {
      return date.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
    } else if (days > 0) {
      return `${days} day${days > 1 ? 's' : ''} ago`;
    } else if (hours > 0) {
      return `${hours} hour${hours > 1 ? 's' : ''} ago`;
    } else if (minutes > 0) {
      return `${minutes} minute${minutes > 1 ? 's' : ''} ago`;
    } else {
      return 'Just now';
    }
  }

  /**
   * Attach event listeners for detail view
   */
  attachDetailEventListeners(container) {
    // Like button
    const likeBtn = container.querySelector('.detail-like-btn');
    if (likeBtn) {
      likeBtn.addEventListener('click', async () => {
        const success = await this.handleLike(this.post.id, this.post.is_liked);
        if (success) {
          // handleLike already updated this.post.is_liked and this.post.likes_count
          likeBtn.classList.toggle('active', this.post.is_liked);
          likeBtn.querySelector('.detail-likes-count').textContent = this.post.likes_count || 0;
        }
      });
    }

    // Menu toggle
    const menuBtn = container.querySelector('.detail-menu-btn');
    const menu = container.querySelector('.detail-post-menu');
    if (menuBtn && menu) {
      menuBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        menu.style.display = menu.style.display === 'none' ? 'block' : 'none';
      });

      document.addEventListener('click', (e) => {
        if (!menu.contains(e.target) && e.target !== menuBtn) {
          menu.style.display = 'none';
        }
      });
    }

    // Edit button
    const editBtn = container.querySelector('.detail-edit-btn');
    if (editBtn) {
      editBtn.addEventListener('click', async () => {
        if (this.onEdit) {
          this.onEdit(this.post);
        }
        if (menu) menu.style.display = 'none';
      });
    }

    // Delete button
    const deleteBtn = container.querySelector('.detail-delete-btn');
    if (deleteBtn) {
      deleteBtn.addEventListener('click', async () => {
        const confirmed = window.showConfirm 
          ? await window.showConfirm('Delete Post', 'Are you sure you want to delete this post? This action cannot be undone.', 'warning')
          : confirm('Are you sure you want to delete this post?');
        
        if (confirmed) {
          await this.handleDelete(this.post.id);
        }
        if (menu) menu.style.display = 'none';
      });
    }

    // Comment submission
    const submitBtn = container.querySelector('#submitCommentBtn');
    const commentInput = container.querySelector('#commentInput');
    
    if (submitBtn && commentInput) {
      submitBtn.addEventListener('click', async () => {
        const content = commentInput.value.trim();
        if (content) {
          await this.handleAddComment(content, commentInput, submitBtn);
        }
      });

      // Submit on Ctrl+Enter
      commentInput.addEventListener('keydown', (e) => {
        if (e.ctrlKey && e.key === 'Enter') {
          submitBtn.click();
        }
      });
    }
  }

  /**
   * Escape HTML to prevent XSS
   */
  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  /**
   * Render comments list
   */
  renderComments() {
    const commentsList = this.container.querySelector('#commentsList');
    if (!commentsList) return;

    commentsList.innerHTML = '';

    // Group comments by parent
    const topLevelComments = this.comments.filter(c => !c.parent_comment_id);
    const replies = this.comments.filter(c => c.parent_comment_id);

    topLevelComments.forEach(comment => {
      const commentEl = this.renderComment(comment);
      commentsList.appendChild(commentEl);

      // Add replies
      const commentReplies = replies.filter(r => r.parent_comment_id === comment.id);
      if (commentReplies.length > 0) {
        const repliesContainer = document.createElement('div');
        repliesContainer.className = 'comment-replies';
        commentReplies.forEach(reply => {
          repliesContainer.appendChild(this.renderComment(reply, true));
        });
        commentEl.appendChild(repliesContainer);
      }
    });
  }

  /**
   * Render single comment
   */
  renderComment(comment, isReply = false) {
    const commentEl = document.createElement('div');
    commentEl.className = `comment ${isReply ? 'comment-reply' : ''}`;
    commentEl.dataset.commentId = comment.id;

    const isOwner = window.socialManager && window.socialManager.user && 
                    window.socialManager.user.id === comment.user_id;

    commentEl.innerHTML = `
      <div class="comment-header">
        <div class="comment-author" data-user-id="${comment.user_id}">
          ${comment.avatar ? 
            `<img src="${comment.avatar}" alt="${comment.username}" class="author-avatar-small" />` :
            `<div class="author-avatar-placeholder small">
              <i class="fas fa-user"></i>
            </div>`
          }
          <span class="author-name">${this.escapeHtml(comment.username)}</span>
          <span class="comment-time">${this.formatDate(comment.created_at)}</span>
        </div>
        ${isOwner ? `
          <button class="btn-icon delete-comment-btn" data-comment-id="${comment.id}">
            <i class="fas fa-trash"></i>
          </button>
        ` : ''}
      </div>
      <div class="comment-content">
        <p>${this.escapeHtml(comment.content)}</p>
      </div>
      <div class="comment-actions">
        <button class="comment-like-btn ${comment.is_liked ? 'active' : ''}" data-comment-id="${comment.id}">
          <i class="fas fa-heart"></i>
          <span>${comment.likes_count || 0}</span>
        </button>
        ${!isReply ? `
          <button class="comment-reply-btn" data-comment-id="${comment.id}">
            <i class="fas fa-reply"></i> Reply
          </button>
        ` : ''}
      </div>
    `;

    // Event listeners
    const likeBtn = commentEl.querySelector('.comment-like-btn');
    if (likeBtn) {
      likeBtn.addEventListener('click', () => this.handleCommentLike(comment.id, comment.is_liked));
    }

    const deleteBtn = commentEl.querySelector('.delete-comment-btn');
    if (deleteBtn) {
      deleteBtn.addEventListener('click', () => this.handleDeleteComment(comment.id));
    }

    const replyBtn = commentEl.querySelector('.comment-reply-btn');
    if (replyBtn) {
      replyBtn.addEventListener('click', () => this.handleReply(comment.id));
    }

    const authorEl = commentEl.querySelector('.comment-author');
    if (authorEl) {
      authorEl.style.cursor = 'pointer';
      authorEl.addEventListener('click', (e) => {
        e.stopPropagation();
        this.handleUserClick(comment.user_id);
      });
    }

    return commentEl;
  }

  /**
   * Handle add comment
   */
  async handleAddComment(content, input, btn) {
    const originalText = btn.textContent;
    
    try {
      btn.disabled = true;
      btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';

      const response = await window.CommunityAPI.addComment(this.postId, content);
      this.comments.push(response.comment);

      // Update UI
      input.value = '';
      this.renderComments();

      // Update comment count in post card
      this.post.comments_count++;
      const countEl = this.container.querySelector('.comments-count');
      if (countEl) {
        countEl.textContent = this.post.comments_count;
      }
    } catch (error) {
      console.error('[PostDetailView] Add comment failed:', error);
      alert('Failed to post comment. Please try again.');
    } finally {
      btn.disabled = false;
      btn.textContent = originalText;
    }
  }

  /**
   * Handle comment like
   */
  async handleCommentLike(commentId, isLiked) {
    try {
      if (isLiked) {
        await window.CommunityAPI.unlikeComment(commentId);
      } else {
        await window.CommunityAPI.likeComment(commentId);
      }

      // Update local state
      const comment = this.comments.find(c => c.id === commentId);
      if (comment) {
        comment.is_liked = !isLiked;
        comment.likes_count = (comment.likes_count || 0) + (isLiked ? -1 : 1);
        
        // Update UI
        const commentEl = this.container.querySelector(`[data-comment-id="${commentId}"]`);
        if (commentEl) {
          const likeBtn = commentEl.querySelector('.comment-like-btn');
          if (likeBtn) {
            likeBtn.classList.toggle('active', comment.is_liked);
            likeBtn.querySelector('span').textContent = comment.likes_count;
          }
        }
      }
    } catch (error) {
      console.error('[PostDetailView] Like comment failed:', error);
    }
  }

  /**
   * Handle delete comment
   */
  async handleDeleteComment(commentId) {
    const confirmed = window.showConfirm 
      ? await window.showConfirm('Delete Comment', 'Are you sure you want to delete this comment?', 'warning')
      : confirm('Delete this comment?');
    
    if (!confirmed) return;

    try {
      await window.CommunityAPI.deleteComment(commentId);
      
      // Remove from local state
      this.comments = this.comments.filter(c => c.id !== commentId);
      this.post.comments_count = Math.max(0, this.post.comments_count - 1);
      
      // Update UI
      this.renderComments();
      
      const countEl = this.container.querySelector('.comments-count');
      if (countEl) {
        countEl.textContent = this.post.comments_count;
      }
    } catch (error) {
      console.error('[PostDetailView] Delete comment failed:', error);
      alert('Failed to delete comment.');
    }
  }

  /**
   * Handle reply (not implemented in this version)
   */
  handleReply(commentId) {
    // TODO: Implement reply functionality
    alert('Reply feature coming soon!');
  }

  /**
   * Handle like post
   */
  async handleLike(postId, isLiked) {
    try {
      if (isLiked) {
        await window.CommunityAPI.unlikePost(postId);
      } else {
        await window.CommunityAPI.likePost(postId);
      }
      
      this.post.is_liked = !isLiked;
      this.post.likes_count += isLiked ? -1 : 1;
      
      return true;
    } catch (error) {
      console.error('[PostDetailView] Like failed:', error);
      return false;
    }
  }

  /**
   * Handle delete post
   */
  async handleDelete(postId) {
    try {
      await window.CommunityAPI.deletePost(postId);
      if (this.onBack) this.onBack();
    } catch (error) {
      console.error('[PostDetailView] Delete failed:', error);
      alert('Failed to delete post.');
    }
  }

  /**
   * Handle edit post
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
   * Format date
   */
  formatDate(dateString) {
    const date = new Date(dateString);
    const now = new Date();
    const diff = now - date;
    const seconds = Math.floor(diff / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 7) {
      return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    } else if (days > 0) {
      return `${days}d ago`;
    } else if (hours > 0) {
      return `${hours}h ago`;
    } else if (minutes > 0) {
      return `${minutes}m ago`;
    } else {
      return 'Just now';
    }
  }

  /**
   * Escape HTML
   */
  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
}

window.PostDetailView = PostDetailView;
