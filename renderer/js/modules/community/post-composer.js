/**
 * Post Composer Component
 * UI for creating and editing posts
 */

class PostComposer {
  constructor(options = {}) {
    this.onSubmit = options.onSubmit;
    this.onCancel = options.onCancel;
    this.editMode = options.editMode || false;
    this.existingPost = options.post || null;
    this.selectedImage = null;
    this.imagePreview = null;
  }

  /**
   * Render the composer UI
   */
  render() {
    const composer = document.createElement('div');
    composer.className = 'post-composer';

    composer.innerHTML = `
      <div class="composer-header">
        <h3>${this.editMode ? 'Edit Post' : 'Create Post'}</h3>
        <button class="btn-icon composer-close-btn">
          <i class="fas fa-times"></i>
        </button>
      </div>

      <div class="composer-body">
        <form id="postComposerForm">
          <div class="form-group">
            <label for="postContent">What's on your mind?</label>
            <textarea 
              id="postContent" 
              name="content" 
              rows="4" 
              placeholder="Share your astrophotography journey..."
              required
            >${this.existingPost ? this.escapeHtml(this.existingPost.content) : ''}</textarea>
          </div>

          <div class="form-row">
            <div class="form-group">
              <label for="targetName">Target Name</label>
              <input 
                type="text" 
                id="targetName" 
                name="target_name" 
                placeholder="e.g., M31, NGC 7000"
                value="${this.existingPost ? this.escapeHtml(this.existingPost.target_name || '') : ''}"
              />
            </div>

            <div class="form-group">
              <label for="acquisitionDate">Acquisition Date</label>
              <input 
                type="date" 
                id="acquisitionDate" 
                name="acquisition_date"
                value="${this.existingPost ? (this.existingPost.acquisition_date || '') : ''}"
              />
            </div>
          </div>

          <div class="form-row">
            <div class="form-group">
              <label for="integrationTime">Integration Time (minutes)</label>
              <input 
                type="number" 
                id="integrationTime" 
                name="integration_time" 
                placeholder="e.g., 180"
                min="0"
                value="${this.existingPost ? (this.existingPost.integration_time || '') : ''}"
              />
            </div>

            <div class="form-group">
              <label for="filters">Filters</label>
              <input 
                type="text" 
                id="filters" 
                name="filters" 
                placeholder="e.g., Ha, OIII, SII, LRGB"
                value="${this.existingPost ? this.escapeHtml(this.existingPost.filters || '') : ''}"
              />
            </div>
          </div>

          <div class="form-group">
            <label for="equipment">Equipment (optional)</label>
            <input 
              type="text" 
              id="equipment" 
              name="equipment" 
              placeholder="e.g., Celestron Edge HD 11, ASI2600MM"
              value="${this.existingPost ? this.escapeHtml(this.existingPost.equipment || '') : ''}"
            />
          </div>

          <div class="form-group">
            <label for="visibility">Visibility</label>
            <select id="visibility" name="visibility">
              <option value="public" ${!this.existingPost || this.existingPost.visibility === 'public' ? 'selected' : ''}>
                Public - Everyone can see
              </option>
              <option value="followers" ${this.existingPost && this.existingPost.visibility === 'followers' ? 'selected' : ''}>
                Followers Only
              </option>
              <option value="private" ${this.existingPost && this.existingPost.visibility === 'private' ? 'selected' : ''}>
                Private - Only Me
              </option>
            </select>
          </div>

          ${!this.editMode ? `
            <div class="form-group">
              <label>Image Upload</label>
              <div class="image-upload-area" id="imageUploadArea">
                <input 
                  type="file" 
                  id="imageUpload" 
                  name="image" 
                  accept="image/jpeg,image/png,image/webp"
                  style="display: none;"
                />
                <div class="upload-placeholder" id="uploadPlaceholder">
                  <i class="fas fa-cloud-upload-alt"></i>
                  <p>Click or drag image here</p>
                  <small>JPEG, PNG, or WebP • Max 10MB</small>
                </div>
                <div class="image-preview" id="imagePreview" style="display: none;">
                  <img id="previewImage" src="" alt="Preview" />
                  <button type="button" class="btn-icon remove-image-btn" id="removeImageBtn">
                    <i class="fas fa-times"></i>
                  </button>
                </div>
              </div>
            </div>
          ` : ''}

          <div class="composer-actions">
            <button type="button" class="btn-secondary" id="composerCancelBtn">Cancel</button>
            <button type="submit" class="btn-primary" id="composerSubmitBtn">
              ${this.editMode ? 'Update Post' : 'Post'}
            </button>
          </div>
        </form>
      </div>
    `;

    this.attachEventListeners(composer);
    return composer;
  }

  /**
   * Attach event listeners
   */
  attachEventListeners(composer) {
    const form = composer.querySelector('#postComposerForm');
    const closeBtn = composer.querySelector('.composer-close-btn');
    const cancelBtn = composer.querySelector('#composerCancelBtn');
    
    // Form submission
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      await this.handleSubmit(form);
    });

    // Close/Cancel buttons
    [closeBtn, cancelBtn].forEach(btn => {
      if (btn) {
        btn.addEventListener('click', () => {
          if (this.onCancel) this.onCancel();
        });
      }
    });

    // Image upload (only in create mode)
    if (!this.editMode) {
      this.setupImageUpload(composer);
    }
  }

  /**
   * Setup image upload functionality
   */
  setupImageUpload(composer) {
    const uploadArea = composer.querySelector('#imageUploadArea');
    const fileInput = composer.querySelector('#imageUpload');
    const placeholder = composer.querySelector('#uploadPlaceholder');
    const preview = composer.querySelector('#imagePreview');
    const previewImage = composer.querySelector('#previewImage');
    const removeBtn = composer.querySelector('#removeImageBtn');

    // Click to upload
    placeholder.addEventListener('click', () => fileInput.click());

    // File selection
    fileInput.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (file) {
        this.handleImageSelection(file, preview, previewImage, placeholder);
      }
    });

    // Drag and drop
    uploadArea.addEventListener('dragover', (e) => {
      e.preventDefault();
      uploadArea.classList.add('dragover');
    });

    uploadArea.addEventListener('dragleave', () => {
      uploadArea.classList.remove('dragover');
    });

    uploadArea.addEventListener('drop', (e) => {
      e.preventDefault();
      uploadArea.classList.remove('dragover');
      
      const file = e.dataTransfer.files[0];
      if (file && file.type.startsWith('image/')) {
        this.handleImageSelection(file, preview, previewImage, placeholder);
      }
    });

    // Remove image
    if (removeBtn) {
      removeBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.selectedImage = null;
        fileInput.value = '';
        preview.style.display = 'none';
        placeholder.style.display = 'flex';
      });
    }
  }

  /**
   * Handle image selection
   */
  handleImageSelection(file, preview, previewImage, placeholder) {
    // Validate file size (15MB max)
    if (file.size > 15 * 1024 * 1024) {
      alert('Image must be less than 15MB');
      return;
    }

    // Validate file type
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      alert('Only JPEG, PNG, and WebP images are supported');
      return;
    }

    this.selectedImage = file;

    // Show preview
    const reader = new FileReader();
    reader.onload = (e) => {
      previewImage.src = e.target.result;
      preview.style.display = 'block';
      placeholder.style.display = 'none';
    };
    reader.readAsDataURL(file);
  }

  /**
   * Handle form submission
   */
  async handleSubmit(form) {
    const submitBtn = form.querySelector('#composerSubmitBtn');
    const originalText = submitBtn.textContent;
    
    try {
      submitBtn.disabled = true;
      submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Posting...';

      const formData = new FormData(form);
      
      // Remove empty fields (but keep File objects)
      for (let [key, value] of formData.entries()) {
        // Skip if it's a File object (image)
        if (value instanceof File) {
          continue;
        }
        // Remove if empty string
        if (!value || (typeof value === 'string' && value.trim() === '')) {
          formData.delete(key);
        }
      }

      // In edit mode, convert to JSON (no image upload)
      let postData;
      if (this.editMode) {
        postData = {};
        for (let [key, value] of formData.entries()) {
          postData[key] = value;
        }
      } else {
        // In create mode, use FormData if image exists
        if (this.selectedImage) {
          postData = formData;
        } else {
          // No image, use JSON
          postData = {};
          for (let [key, value] of formData.entries()) {
            postData[key] = value;
          }
        }
      }

      if (this.onSubmit) {
        await this.onSubmit(postData);
      }
    } catch (error) {
      console.error('[PostComposer] Submit error:', error);
      alert(error.message || 'Failed to post. Please try again.');
      submitBtn.disabled = false;
      submitBtn.textContent = originalText;
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

window.PostComposer = PostComposer;
