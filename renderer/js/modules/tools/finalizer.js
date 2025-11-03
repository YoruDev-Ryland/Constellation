/**
 * Finalizer Tool
 * Add watermarks and logos to finalized images with precise positioning control
 */

class Finalizer {
  constructor(containerId) {
    this.containerId = containerId;
    this.container = document.getElementById(containerId);
    this.sourceImage = null;
    this.logoImage = null;
    this.logoPath = null;
    this.canvas = null;
    this.ctx = null;
    this.previewCanvas = null;
    this.previewCtx = null;
    
    // Positioning settings
    this.logoSize = 10; // percentage of image width
    this.positionType = 'percentage'; // 'percentage' or 'pixels'
    this.position = {
      horizontal: 'left', // 'left', 'right', 'center'
      vertical: 'bottom', // 'top', 'bottom', 'center'
      xOffset: 1, // offset value
      yOffset: 1  // offset value
    };
    
    // Export settings
    this.exportFilename = '';
    this.jpegQuality = 1.0; // 1.0 = maximum quality
    this.saveToFinals = false;
    this.estimatedSize = 0;
    
    // Preview zoom and pan state
    this.previewState = {
      scale: 1,
      offsetX: 0,
      offsetY: 0,
      isPanning: false,
      startX: 0,
      startY: 0
    };
    
    this.init();
  }

  init() {
    if (!this.container) {
      console.error('Finalizer container not found:', this.containerId);
      return;
    }
    this.createUI();
    this.loadSavedSettings();
    this.setupEventListeners();
  }

  createUI() {
    // Create full-screen view structure
    this.container.innerHTML = `
      <div class="finalizer-workspace">
        <!-- Left Sidebar: Controls -->
        <aside class="finalizer-sidebar">
          <div class="sidebar-section">
            <h3 class="section-title">Source Image</h3>
            <button class="btn btn-primary btn-block" id="loadImageBtn">
              <i class="fas fa-image"></i> Load Image
            </button>
            <div class="file-info" id="sourceImageInfo">
              <i class="fas fa-info-circle"></i> No image loaded
            </div>
          </div>

          <div class="sidebar-section">
            <h3 class="section-title">Logo / Watermark</h3>
            <button class="btn btn-primary btn-block" id="loadLogoBtn">
              <i class="fas fa-copyright"></i> Load Logo
            </button>
            <div class="file-info" id="logoInfo">
              <i class="fas fa-info-circle"></i> No logo loaded
            </div>
          </div>

          <div class="sidebar-section">
            <h3 class="section-title">Logo Size</h3>
            <div class="control-group">
              <label class="control-label">
                <span>Size (% of image width)</span>
                <span class="control-value" id="logoSizeValue">10%</span>
              </label>
              <input type="range" id="logoSizeSlider" class="slider" min="1" max="50" value="10" step="0.5">
              <div class="slider-markers">
                <span>1%</span>
                <span>50%</span>
              </div>
            </div>
          </div>

          <div class="sidebar-section">
            <h3 class="section-title">Position</h3>
            
            <div class="position-mode">
              <label class="radio-label">
                <input type="radio" name="positionType" value="percentage" checked>
                <span>Percentage</span>
              </label>
              <label class="radio-label">
                <input type="radio" name="positionType" value="pixels">
                <span>Pixels</span>
              </label>
            </div>

            <div class="position-grid">
              <button class="pos-btn" data-h="left" data-v="top" title="Top Left">
                <i class="fas fa-arrow-up"></i><i class="fas fa-arrow-left"></i>
              </button>
              <button class="pos-btn" data-h="center" data-v="top" title="Top Center">
                <i class="fas fa-arrow-up"></i>
              </button>
              <button class="pos-btn" data-h="right" data-v="top" title="Top Right">
                <i class="fas fa-arrow-up"></i><i class="fas fa-arrow-right"></i>
              </button>
              
              <button class="pos-btn" data-h="left" data-v="center" title="Middle Left">
                <i class="fas fa-arrow-left"></i>
              </button>
              <button class="pos-btn" data-h="center" data-v="center" title="Center">
                <i class="fas fa-compress"></i>
              </button>
              <button class="pos-btn" data-h="right" data-v="center" title="Middle Right">
                <i class="fas fa-arrow-right"></i>
              </button>
              
              <button class="pos-btn active" data-h="left" data-v="bottom" title="Bottom Left">
                <i class="fas fa-arrow-down"></i><i class="fas fa-arrow-left"></i>
              </button>
              <button class="pos-btn" data-h="center" data-v="bottom" title="Bottom Center">
                <i class="fas fa-arrow-down"></i>
              </button>
              <button class="pos-btn" data-h="right" data-v="bottom" title="Bottom Right">
                <i class="fas fa-arrow-down"></i><i class="fas fa-arrow-right"></i>
              </button>
            </div>

            <div class="offset-controls">
              <div class="control-group">
                <label class="control-label">
                  Horizontal Offset <span id="xOffsetUnit">%</span>
                </label>
                <input type="number" id="xOffsetInput" class="input-number" value="1" min="0" max="100" step="0.1">
              </div>
              <div class="control-group">
                <label class="control-label">
                  Vertical Offset <span id="yOffsetUnit">%</span>
                </label>
                <input type="number" id="yOffsetInput" class="input-number" value="1" min="0" max="100" step="0.1">
              </div>
            </div>
          </div>

          <div class="sidebar-section">
            <h3 class="section-title">Export Settings</h3>
            
            <div class="control-group">
              <label class="control-label">
                <span>Filename</span>
              </label>
              <input type="text" id="exportFilename" class="text-input" placeholder="Enter filename..." value="">
            </div>

            <div class="control-group">
              <label class="control-label">
                <span>JPEG Quality</span>
                <span class="control-value" id="qualityValue">10</span>
              </label>
              <input type="range" id="qualitySlider" class="slider" min="1" max="10" value="10" step="1">
              <div class="slider-markers">
                <span>1 (Low)</span>
                <span>10 (Max)</span>
              </div>
            </div>

            <div class="file-size-display">
              <i class="fas fa-file-image"></i>
              <span>Estimated: <strong id="fileSizeEstimate">--</strong></span>
            </div>

            <div class="toggle-group">
              <label class="toggle-label">
                <input type="checkbox" id="saveToFinalsToggle" class="toggle-input">
                <span class="toggle-switch"></span>
                <span class="toggle-text">Save to Finals Folder</span>
              </label>
              <div class="toggle-info" id="finalsFolderInfo">
                No finals folder configured
              </div>
            </div>

            <button class="btn btn-success btn-block btn-lg" id="exportBtn" disabled>
              <i class="fas fa-download"></i> Export Image
            </button>
          </div>
        </aside>

        <!-- Main Content: Preview -->
        <main class="finalizer-main">
          <div class="preview-header">
            <h3><i class="fas fa-eye"></i> Preview</h3>
            <div class="preview-controls">
              <button class="btn-icon" id="zoomOutBtn" title="Zoom Out">
                <i class="fas fa-minus"></i>
              </button>
              <button class="btn-icon" id="fitToViewBtn" title="Fit to View">
                <i class="fas fa-expand"></i>
              </button>
              <button class="btn-icon" id="zoomInBtn" title="Zoom In">
                <i class="fas fa-plus"></i>
              </button>
            </div>
          </div>
          <div class="preview-viewport" id="previewViewport">
            <canvas id="finalizerPreview"></canvas>
            <div class="preview-placeholder" id="previewPlaceholder">
              <i class="fas fa-image"></i>
              <p>Load an image to begin</p>
            </div>
          </div>
        </main>
      </div>
    `;

    this.previewCanvas = document.getElementById('finalizerPreview');
    this.previewCtx = this.previewCanvas.getContext('2d');

    // Create off-screen canvas for full-size rendering
    this.canvas = document.createElement('canvas');
    this.ctx = this.canvas.getContext('2d');
  }

  setupEventListeners() {
    // Load buttons
    document.getElementById('loadImageBtn').addEventListener('click', () => this.loadImage());
    document.getElementById('loadLogoBtn').addEventListener('click', () => this.loadLogo());

    // Logo size slider
    const logoSizeSlider = document.getElementById('logoSizeSlider');
    logoSizeSlider.addEventListener('input', (e) => {
      this.logoSize = parseFloat(e.target.value);
      document.getElementById('logoSizeValue').textContent = this.logoSize.toFixed(1);
      this.updatePreview();
    });

    // Position type radio buttons
    document.querySelectorAll('input[name="positionType"]').forEach(radio => {
      radio.addEventListener('change', (e) => {
        this.positionType = e.target.value;
        this.updatePositionUnits();
        this.updatePreview();
      });
    });

    // Position preset buttons
    document.querySelectorAll('.pos-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const button = e.currentTarget;
        this.position.horizontal = button.dataset.h;
        this.position.vertical = button.dataset.v;
        
        // Update active state
        document.querySelectorAll('.pos-btn').forEach(b => b.classList.remove('active'));
        button.classList.add('active');
        
        this.updatePreview();
      });
    });

    // Offset inputs
    document.getElementById('xOffsetInput').addEventListener('input', (e) => {
      this.position.xOffset = parseFloat(e.target.value) || 0;
      this.updatePreview();
    });

    document.getElementById('yOffsetInput').addEventListener('input', (e) => {
      this.position.yOffset = parseFloat(e.target.value) || 0;
      this.updatePreview();
    });

    // Filename input
    const filenameInput = document.getElementById('exportFilename');
    filenameInput.addEventListener('input', (e) => {
      this.exportFilename = e.target.value.trim();
    });

    // Quality slider
    const qualitySlider = document.getElementById('qualitySlider');
    qualitySlider.addEventListener('input', (e) => {
      const qualityLevel = parseInt(e.target.value);
      this.jpegQuality = qualityLevel / 10; // Convert 1-10 to 0.1-1.0
      document.getElementById('qualityValue').textContent = qualityLevel;
      this.updateFileSizeEstimate();
    });

    // Save to finals toggle
    const saveToFinalsToggle = document.getElementById('saveToFinalsToggle');
    saveToFinalsToggle.addEventListener('change', (e) => {
      this.saveToFinals = e.target.checked;
      localStorage.setItem('finalizer_saveToFinals', this.saveToFinals);
    });

    // Export button
    document.getElementById('exportBtn').addEventListener('click', () => this.exportImage());

    // Preview zoom and pan controls
    this.setupPreviewControls();
  }

  setupPreviewControls() {
    const viewport = document.getElementById('previewViewport');
    const canvas = this.previewCanvas;

    // Zoom buttons
    document.getElementById('zoomInBtn').addEventListener('click', () => {
      const centerX = viewport.clientWidth / 2;
      const centerY = viewport.clientHeight / 2;
      this.zoomPreviewBy(1.2, { x: centerX, y: centerY });
    });

    document.getElementById('zoomOutBtn').addEventListener('click', () => {
      const centerX = viewport.clientWidth / 2;
      const centerY = viewport.clientHeight / 2;
      this.zoomPreviewBy(1 / 1.2, { x: centerX, y: centerY });
    });

    document.getElementById('fitToViewBtn').addEventListener('click', () => {
      this.fitPreviewToView();
    });

    // Mouse wheel zoom
    viewport.addEventListener('wheel', (e) => {
      if (!this.sourceImage) return;
      e.preventDefault();
      const delta = e.deltaY > 0 ? 1 / 1.15 : 1.15;
      const rect = viewport.getBoundingClientRect();
      const point = {
        x: e.clientX - rect.left,
        y: e.clientY - rect.top
      };
      this.zoomPreviewBy(delta, point);
    }, { passive: false });

    // Panning with mouse drag
    viewport.addEventListener('mousedown', (e) => {
      if (!this.sourceImage) return;
      e.preventDefault();
      this.previewState.isPanning = true;
      this.previewState.startX = e.clientX;
      this.previewState.startY = e.clientY;
      viewport.style.cursor = 'grabbing';
    });

    window.addEventListener('mousemove', (e) => {
      if (!this.previewState.isPanning) return;
      e.preventDefault();
      const dx = e.clientX - this.previewState.startX;
      const dy = e.clientY - this.previewState.startY;
      this.previewState.startX = e.clientX;
      this.previewState.startY = e.clientY;
      this.previewState.offsetX += dx;
      this.previewState.offsetY += dy;
      this.applyPreviewTransform();
    });

    window.addEventListener('mouseup', () => {
      if (!this.previewState.isPanning) return;
      this.previewState.isPanning = false;
      viewport.style.cursor = 'grab';
    });

    // Double-click to fit or zoom
    viewport.addEventListener('dblclick', (e) => {
      if (!this.sourceImage) return;
      const rect = viewport.getBoundingClientRect();
      const point = {
        x: e.clientX - rect.left,
        y: e.clientY - rect.top
      };
      if (this.previewState.scale > 1) {
        this.fitPreviewToView();
      } else {
        this.zoomPreviewBy(2, point);
      }
    });

    // Set cursor style
    viewport.style.cursor = 'grab';
  }

  zoomPreviewBy(factor, point) {
    if (!this.sourceImage) return;
    
    const prevScale = this.previewState.scale;
    const newScale = Math.max(0.1, Math.min(32, prevScale * factor));
    
    // Convert point to canvas coordinates and adjust offset so zoom is centered on point
    const sx = (point.x - this.previewState.offsetX) / prevScale;
    const sy = (point.y - this.previewState.offsetY) / prevScale;
    
    this.previewState.scale = newScale;
    this.previewState.offsetX = point.x - sx * newScale;
    this.previewState.offsetY = point.y - sy * newScale;
    
    this.applyPreviewTransform();
  }

  fitPreviewToView() {
    if (!this.sourceImage || !this.previewCanvas.width) return;
    
    const viewport = document.getElementById('previewViewport');
    const canvasWidth = this.previewCanvas.width;
    const canvasHeight = this.previewCanvas.height;
    
    // Account for padding (2rem = 32px on each side typically)
    const padding = 64; // Approximate padding in px
    const availableWidth = viewport.clientWidth - padding;
    const availableHeight = viewport.clientHeight - padding;
    
    const wScale = availableWidth / canvasWidth;
    const hScale = availableHeight / canvasHeight;
    const fitScale = Math.min(wScale, hScale, 1) * 0.9; // 90% for margin
    
    this.previewState.scale = fitScale;
    this.previewState.offsetX = (viewport.clientWidth - canvasWidth * fitScale) / 2;
    this.previewState.offsetY = (viewport.clientHeight - canvasHeight * fitScale) / 2;
    
    this.applyPreviewTransform();
  }

  applyPreviewTransform() {
    const transform = `translate(${this.previewState.offsetX}px, ${this.previewState.offsetY}px) scale(${this.previewState.scale})`;
    this.previewCanvas.style.transform = transform;
    this.previewCanvas.style.transformOrigin = '0 0';
  }

  async loadImage() {
    try {
      const result = await window.electronAPI.selectFile({
        filters: [
          { name: 'Images', extensions: ['jpg', 'jpeg', 'png', 'tif', 'tiff', 'fits'] }
        ]
      });

      if (result && !result.canceled && result.filePaths && result.filePaths.length > 0) {
        const filePath = result.filePaths[0];
        const img = new Image();
        img.onload = () => {
          this.sourceImage = img;
          this.updateSourceImageInfo();
          this.updatePreview();
          this.updateExportButton();
          document.getElementById('previewPlaceholder').style.display = 'none';
          this.previewCanvas.classList.add('has-image');
        };
        img.onerror = () => {
          this.showError('Failed to load image. Please try a different file.');
        };
        img.src = 'file://' + filePath;
      }
    } catch (error) {
      console.error('Error loading image:', error);
      this.showError('Error loading image: ' + error.message);
    }
  }

  async loadLogo() {
    try {
      const result = await window.electronAPI.selectFile({
        filters: [
          { name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'svg'] }
        ]
      });

      if (result && !result.canceled && result.filePaths && result.filePaths.length > 0) {
        const filePath = result.filePaths[0];
        const img = new Image();
        img.onload = () => {
          this.logoImage = img;
          this.logoPath = filePath;
          this.updateLogoInfo();
          this.updatePreview();
          this.saveLogoPath(filePath);
        };
        img.onerror = () => {
          this.showError('Failed to load logo. Please try a different file.');
        };
        img.src = 'file://' + filePath;
      }
    } catch (error) {
      console.error('Error loading logo:', error);
      this.showError('Error loading logo: ' + error.message);
    }
  }

  updateSourceImageInfo() {
    const infoEl = document.getElementById('sourceImageInfo');
    if (this.sourceImage) {
      const info = `${this.sourceImage.width} x ${this.sourceImage.height}px`;
      infoEl.innerHTML = `<i class="fas fa-check-circle"></i> ${info}`;
    } else {
      infoEl.innerHTML = '<i class="fas fa-info-circle"></i> No image loaded';
    }
  }

  updateLogoInfo() {
    const infoEl = document.getElementById('logoInfo');
    if (this.logoImage) {
      const info = `${this.logoImage.width} x ${this.logoImage.height}px`;
      infoEl.innerHTML = `<i class="fas fa-check-circle"></i> ${info}`;
    } else {
      infoEl.innerHTML = '<i class="fas fa-info-circle"></i> No logo loaded';
    }
  }

  updatePositionUnits() {
    const unit = this.positionType === 'percentage' ? '%' : 'px';
    document.getElementById('xOffsetUnit').textContent = unit;
    document.getElementById('yOffsetUnit').textContent = unit;

    // Update input max values
    const xInput = document.getElementById('xOffsetInput');
    const yInput = document.getElementById('yOffsetInput');
    
    if (this.positionType === 'percentage') {
      xInput.max = 100;
      yInput.max = 100;
      xInput.step = 0.1;
      yInput.step = 0.1;
    } else {
      xInput.max = 10000;
      yInput.max = 10000;
      xInput.step = 1;
      yInput.step = 1;
    }
  }

  calculateLogoPosition() {
    if (!this.sourceImage || !this.logoImage) return null;

    const imgWidth = this.sourceImage.width;
    const imgHeight = this.sourceImage.height;

    // Calculate logo dimensions maintaining aspect ratio
    const logoTargetWidth = (imgWidth * this.logoSize) / 100;
    const logoAspectRatio = this.logoImage.width / this.logoImage.height;
    const logoWidth = logoTargetWidth;
    const logoHeight = logoTargetWidth / logoAspectRatio;

    // Calculate offset in pixels
    let xOffset, yOffset;
    if (this.positionType === 'percentage') {
      xOffset = (imgWidth * this.position.xOffset) / 100;
      yOffset = (imgHeight * this.position.yOffset) / 100;
    } else {
      xOffset = this.position.xOffset;
      yOffset = this.position.yOffset;
    }

    // Calculate position based on alignment
    let x, y;

    // Horizontal positioning
    switch (this.position.horizontal) {
      case 'left':
        x = xOffset;
        break;
      case 'right':
        x = imgWidth - logoWidth - xOffset;
        break;
      case 'center':
        x = (imgWidth - logoWidth) / 2;
        break;
    }

    // Vertical positioning
    switch (this.position.vertical) {
      case 'top':
        y = yOffset;
        break;
      case 'bottom':
        y = imgHeight - logoHeight - yOffset;
        break;
      case 'center':
        y = (imgHeight - logoHeight) / 2;
        break;
    }

    return { x, y, width: logoWidth, height: logoHeight };
  }

  updatePreview() {
    if (!this.sourceImage) return;

    // Use full resolution for preview
    const previewWidth = this.sourceImage.width;
    const previewHeight = this.sourceImage.height;

    this.previewCanvas.width = previewWidth;
    this.previewCanvas.height = previewHeight;

    // Draw source image
    this.previewCtx.drawImage(this.sourceImage, 0, 0, previewWidth, previewHeight);

    // Draw logo if loaded (at full size since preview is now full resolution)
    if (this.logoImage) {
      const logoPos = this.calculateLogoPosition();
      
      if (logoPos) {
        this.previewCtx.drawImage(
          this.logoImage,
          logoPos.x,
          logoPos.y,
          logoPos.width,
          logoPos.height
        );
      }
    }

    this.updateFileSizeEstimate();
    
    // Fit the preview to the viewport after rendering
    setTimeout(() => this.fitPreviewToView(), 50);
  }

  updateFileSizeEstimate() {
    if (!this.sourceImage) {
      document.getElementById('fileSizeEstimate').textContent = '--';
      return;
    }

    // Rough estimation based on image dimensions and quality
    const pixels = this.sourceImage.width * this.sourceImage.height;
    const bytesPerPixel = 3; // RGB
    
    // Higher quality = less compression = larger file
    // Quality ranges from 0.1 (level 1) to 1.0 (level 10)
    // Compression ratio: low quality = high compression (20:1), high quality = low compression (5:1)
    const compressionRatio = 5 + (15 * (1 - this.jpegQuality));
    
    const estimatedBytes = (pixels * bytesPerPixel) / compressionRatio;
    const estimatedMB = estimatedBytes / (1024 * 1024);

    this.estimatedSize = estimatedMB;

    let sizeText;
    if (estimatedMB < 1) {
      sizeText = (estimatedMB * 1024).toFixed(2) + ' KB';
    } else {
      sizeText = estimatedMB.toFixed(2) + ' MB';
    }

    // Add warning if over 10MB
    if (estimatedMB > 10) {
      sizeText += ' ⚠️ (Over 10MB)';
    }

    document.getElementById('fileSizeEstimate').textContent = sizeText;
  }

  updateExportButton() {
    const exportBtn = document.getElementById('exportBtn');
    exportBtn.disabled = !this.sourceImage;
  }

  async exportImage() {
    if (!this.sourceImage) return;

    try {
      // Set up full-size canvas
      this.canvas.width = this.sourceImage.width;
      this.canvas.height = this.sourceImage.height;

      // Draw source image at full size
      this.ctx.drawImage(this.sourceImage, 0, 0);

      // Draw logo if loaded
      if (this.logoImage) {
        const logoPos = this.calculateLogoPosition();
        if (logoPos) {
          this.ctx.drawImage(
            this.logoImage,
            logoPos.x,
            logoPos.y,
            logoPos.width,
            logoPos.height
          );
        }
      }

      // Convert to JPEG blob
      const blob = await new Promise(resolve => {
        this.canvas.toBlob(resolve, 'image/jpeg', this.jpegQuality);
      });

      // Check if we should save to finals folder
      let finalsFolder = null;
      if (window.settings && window.settings.finalsPath) {
        finalsFolder = window.settings.finalsPath;
      } else {
        try {
          const settings = await window.electronAPI.getSettings();
          finalsFolder = settings.finalsPath;
        } catch (error) {
          console.error('Error loading settings:', error);
        }
      }

      // Generate timestamp (format: MMDDYYHHMI like 1102250155)
      const now = new Date();
      const month = String(now.getMonth() + 1).padStart(2, '0');
      const day = String(now.getDate()).padStart(2, '0');
      const year = String(now.getFullYear()).slice(-2);
      const hours = String(now.getHours()).padStart(2, '0');
      const minutes = String(now.getMinutes()).padStart(2, '0');
      const timestamp = `${month}${day}${year}${hours}${minutes}`;

      // Build filename with user input or default
      const baseName = this.exportFilename || 'finalized';
      const filename = `${baseName}-${timestamp}.jpg`;

      let savePath;
      if (this.saveToFinals && finalsFolder) {
        // Save directly to finals folder without dialog
        savePath = await window.electronAPI.joinPath(finalsFolder, filename);
        await this.saveBlobToFile(blob, savePath);
        this.showSuccess(`Image saved to finals folder: ${filename}`);
      } else {
        // Open save dialog with default filename including timestamp
        const result = await window.electronAPI.saveFile({
          defaultPath: filename,
          filters: [
            { name: 'JPEG Image', extensions: ['jpg'] }
          ]
        });

        if (result && result.filePath) {
          savePath = result.filePath;
          await this.saveBlobToFile(blob, savePath);
          this.showSuccess('Image exported successfully!');
        }
      }
    } catch (error) {
      console.error('Error exporting image:', error);
      this.showError('Error exporting image: ' + error.message);
    }
  }

  async saveBlobToFile(blob, filePath) {
    const arrayBuffer = await blob.arrayBuffer();
    const uint8Array = new Uint8Array(arrayBuffer);
    await window.electronAPI.writeFile(filePath, uint8Array);
  }

  loadSavedSettings() {
    // Load saved logo path
    const savedLogoPath = localStorage.getItem('finalizer_logoPath');
    if (savedLogoPath) {
      const img = new Image();
      img.onload = () => {
        this.logoImage = img;
        this.logoPath = savedLogoPath;
        this.updateLogoInfo();
      };
      img.onerror = () => {
        // Logo no longer exists, clear saved path
        localStorage.removeItem('finalizer_logoPath');
      };
      img.src = 'file://' + savedLogoPath;
    }

    // Load save to finals preference
    const savedPreference = localStorage.getItem('finalizer_saveToFinals');
    if (savedPreference !== null) {
      this.saveToFinals = savedPreference === 'true';
      document.getElementById('saveToFinalsToggle').checked = this.saveToFinals;
    }

    // Check finals folder configuration
    this.updateFinalsFolderInfo();
  }

  saveLogoPath(path) {
    localStorage.setItem('finalizer_logoPath', path);
  }

  async updateFinalsFolderInfo() {
    // Get settings from global settings object or fetch directly
    let finalsFolder = null;
    if (window.settings && window.settings.finalsPath) {
      finalsFolder = window.settings.finalsPath;
    } else {
      try {
        const settings = await window.electronAPI.getSettings();
        finalsFolder = settings.finalsPath;
      } catch (error) {
        console.error('Error loading settings:', error);
      }
    }

    const toggle = document.getElementById('saveToFinalsToggle');
    const info = document.getElementById('finalsFolderInfo');

    if (finalsFolder) {
      info.textContent = `Finals folder: ${finalsFolder}`;
      toggle.disabled = false;
    } else {
      info.textContent = 'No finals folder configured - set in Settings';
      toggle.disabled = true;
      toggle.checked = false;
      this.saveToFinals = false;
    }
  }

  showError(message) {
    window.ModalManager.alert('Finalizer Error', message, 'error');
  }

  showSuccess(message) {
    window.ModalManager.alert('Success', message, 'success');
  }
}

// Export for use in other modules
window.Finalizer = Finalizer;
