/**
 * Post Card Component
 * Renders individual post cards with interactions
 */

class PostCard {
  constructor(post, options = {}) {
    this.post = post;
    this.onLike = options.onLike;
    this.onComment = options.onComment;
    this.onDelete = options.onDelete;
    this.onEdit = options.onEdit;
    this.onUserClick = options.onUserClick;
    this.onPostClick = options.onPostClick;
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
   * Render the post card
   */
  render() {
    // Ensure is_liked is a boolean
    this.post.is_liked = Boolean(this.post.is_liked);
    
    const card = document.createElement('div');
    card.className = 'post-card';
    card.dataset.postId = this.post.id;

    const isOwner = window.socialManager && window.socialManager.user && 
                    window.socialManager.user.id === this.post.user_id;

    // Post header
    const header = document.createElement('div');
    header.className = 'post-header';
    header.innerHTML = `
      <div class="post-author" data-user-id="${this.post.user_id}">
        ${this.post.avatar ? 
          `<img src="${this.post.avatar}" alt="${this.post.username}" class="author-avatar" />` :
          `<div class="author-avatar-placeholder">
            <i class="fas fa-user"></i>
          </div>`
        }
        <div class="author-info">
          <span class="author-name">${this.escapeHtml(this.post.username)}</span>
          <span class="post-time">${this.formatDate(this.post.created_at)}</span>
        </div>
      </div>
      ${isOwner ? `
        <div class="post-actions">
          <button class="btn-icon post-menu-btn" title="More options">
            <i class="fas fa-ellipsis-h"></i>
          </button>
          <div class="post-menu" style="display: none;">
            <button class="post-menu-item edit-post-btn">
              <i class="fas fa-edit"></i> Edit
            </button>
            <button class="post-menu-item delete-post-btn">
              <i class="fas fa-trash"></i> Delete
            </button>
          </div>
        </div>
      ` : ''}
    `;
    card.appendChild(header);

    // Post content
    const content = document.createElement('div');
    content.className = 'post-content';
    content.innerHTML = `<p>${this.escapeHtml(this.post.content)}</p>`;
    card.appendChild(content);

    // Astrophotography metadata
    if (this.post.target_name || this.post.integration_time || this.post.filters) {
      const metadata = document.createElement('div');
      metadata.className = 'post-metadata';
      
      const metaItems = [];
      if (this.post.target_name) {
        metaItems.push(`<span class="meta-item">
          <i class="fas fa-bullseye"></i> ${this.escapeHtml(this.post.target_name)}
        </span>`);
      }
      if (this.post.integration_time) {
        metaItems.push(`<span class="meta-item">
          <i class="fas fa-clock"></i> ${this.formatIntegrationTime(this.post.integration_time)}
        </span>`);
      }
      if (this.post.filters) {
        metaItems.push(`<span class="meta-item">
          <i class="fas fa-filter"></i> ${this.escapeHtml(this.post.filters)}
        </span>`);
      }
      if (this.post.acquisition_date) {
        metaItems.push(`<span class="meta-item">
          <i class="fas fa-calendar"></i> ${new Date(this.post.acquisition_date).toLocaleDateString()}
        </span>`);
      }
      
      metadata.innerHTML = metaItems.join('');
      card.appendChild(metadata);
    }

    // Post image
    if (this.post.image_url) {
      const imageContainer = document.createElement('div');
      imageContainer.className = 'post-image-container';
      imageContainer.innerHTML = `
        <img src="https://starloch.com${this.post.image_url}" 
             alt="${this.post.target_name || 'Post image'}" 
             class="post-image" 
             loading="lazy" />
      `;
      card.appendChild(imageContainer);
    }

    // Post stats and actions
    const footer = document.createElement('div');
    footer.className = 'post-footer';
    footer.innerHTML = `
      <div class="post-stats">
        <span class="stat-item">
          <i class="fas fa-heart"></i>
          <span class="likes-count">${this.post.likes_count || 0}</span>
        </span>
        <span class="stat-item">
          <i class="fas fa-comment"></i>
          <span class="comments-count">${this.post.comments_count || 0}</span>
        </span>
      </div>
      <div class="post-interactions">
        <button class="interaction-btn like-btn ${this.post.is_liked ? 'active' : ''}" 
                data-post-id="${this.post.id}">
          <i class="fas fa-heart"></i>
          <span>${this.post.is_liked ? 'Liked' : 'Like'}</span>
        </button>
        <button class="interaction-btn comment-btn" data-post-id="${this.post.id}">
          <i class="fas fa-comment"></i>
          <span>Comment</span>
        </button>
      </div>
    `;
    card.appendChild(footer);

    // Event listeners
    this.attachEventListeners(card);

    return card;
  }

  /**
   * Attach event listeners to card
   */
  attachEventListeners(card) {
    // Like button
    const likeBtn = card.querySelector('.like-btn');
    if (likeBtn) {
      likeBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        if (this.onLike) {
          // Convert to boolean to handle 0/1 from MySQL
          const isCurrentlyLiked = Boolean(this.post.is_liked);
          const success = await this.onLike(this.post.id, isCurrentlyLiked);
          if (success) {
            this.post.is_liked = !isCurrentlyLiked;
            this.post.likes_count += this.post.is_liked ? 1 : -1;
            this.updateLikeButton(likeBtn);
            this.updateLikeCount(card);
          }
        }
      });
    }

    // Comment button
    const commentBtn = card.querySelector('.comment-btn');
    if (commentBtn && this.onComment) {
      commentBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.onComment(this.post.id);
      });
    }

    // Post menu toggle
    const menuBtn = card.querySelector('.post-menu-btn');
    const menu = card.querySelector('.post-menu');
    if (menuBtn && menu) {
      menuBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        menu.style.display = menu.style.display === 'none' ? 'block' : 'none';
      });

      // Close menu when clicking outside
      document.addEventListener('click', (e) => {
        if (!menu.contains(e.target) && e.target !== menuBtn) {
          menu.style.display = 'none';
        }
      });
    }

    // Edit button
    const editBtn = card.querySelector('.edit-post-btn');
    if (editBtn && this.onEdit) {
      editBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.onEdit(this.post);
        if (menu) menu.style.display = 'none';
      });
    }

    // Delete button
    const deleteBtn = card.querySelector('.delete-post-btn');
    if (deleteBtn && this.onDelete) {
      deleteBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        if (confirm('Are you sure you want to delete this post?')) {
          await this.onDelete(this.post.id);
        }
        if (menu) menu.style.display = 'none';
      });
    }

    // Author click
    const authorEl = card.querySelector('.post-author');
    if (authorEl && this.onUserClick) {
      authorEl.style.cursor = 'pointer';
      authorEl.addEventListener('click', (e) => {
        e.stopPropagation();
        this.onUserClick(this.post.user_id);
      });
    }

    // Image click (open in viewer)
    const image = card.querySelector('.post-image');
    if (image) {
      image.style.cursor = 'pointer';
      image.addEventListener('click', (e) => {
        e.stopPropagation();
        this.openImageViewer(image.src);
      });
    }

    // Card click (open post detail)
    card.addEventListener('click', (e) => {
      // Don't trigger if clicking on interactive elements
      if (e.target.closest('.like-btn') || 
          e.target.closest('.comment-btn') ||
          e.target.closest('.post-menu-btn') ||
          e.target.closest('.post-menu') ||
          e.target.closest('.post-image') ||
          e.target.closest('.post-author')) {
        return;
      }
      
      if (this.onPostClick) {
        this.onPostClick(this.post.id);
      }
    });
  }

  /**
   * Update like button state
   */
  updateLikeButton(btn) {
    if (this.post.is_liked) {
      btn.classList.add('active');
      btn.querySelector('span').textContent = 'Liked';
    } else {
      btn.classList.remove('active');
      btn.querySelector('span').textContent = 'Like';
    }
  }

  /**
   * Update like count display
   */
  updateLikeCount(card) {
    const countEl = card.querySelector('.likes-count');
    if (countEl) {
      countEl.textContent = this.post.likes_count || 0;
    }
  }

  /**
   * Open image in viewer
   */
  openImageViewer(imageUrl) {
    // Use the existing ImageViewer module
    if (window.ImageViewer && window.ImageViewer.show) {
      window.ImageViewer.show(imageUrl);
    } else {
      // Fallback to opening in new window
      console.warn('ImageViewer not available, opening in new window');
      window.open(imageUrl, '_blank');
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
}

window.PostCard = PostCard;
