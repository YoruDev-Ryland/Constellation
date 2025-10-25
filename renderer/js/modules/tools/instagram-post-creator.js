// Instagram Post Creator - Complete Redesign
class InstagramPostCreator {
  constructor(container) {
    this.container = container;
    this.currentSlide = 0;
    this.slides = [];
    this.images = [];
    this.selectedImage = null;
    this.isDragging = false;
    this.isResizing = false;
    this.dragOffset = { x: 0, y: 0 };
    this.resizeHandle = null;
    this.aspectRatioLocked = true; // Default to locked
    this.isPanning = false;
    this.panStartX = 0;
    this.panStartY = 0;
    this.panOffsetX = 0;
    this.panOffsetY = 0;
    this.currentZoom = 1;
  // Panel aspect ratio (per-panel width:height)
  this.panelAspect = { w: 1, h: 1 }; // 1:1 default
  // Scheduling helpers to keep wheel handlers lightweight
  this._wheelRaf = null;
  this._wheelPending = null; // { type: 'image'|'canvas', deltaY: number, img?: HTMLElement }
    this.wheelUpdateTimeout = null; // For debouncing property panel updates
  // Live scale state (smooth scaling via transform, commit after gesture ends)
  this.liveScaleActive = null; // HTMLElement being scaled
  this.liveScaleFactor = 1;
  this.liveScaleBase = null; // { w,h,left,top }
  this.liveScaleCommitTimer = null;
  this.wheelScaleStep = 0.09; // ~9% per notch (~3x faster feel)
    this.panelConfig = {
      1: { rows: 1, cols: 1 },
      2: { rows: 1, cols: 2 },
      3: { rows: 1, cols: 3 },
      4: { rows: 1, cols: 4 },
      5: { rows: 1, cols: 5 },
      6: { rows: 1, cols: 6 },
      7: { rows: 1, cols: 7 },
      8: { rows: 1, cols: 8 },
      9: { rows: 1, cols: 9 },
      10: { rows: 1, cols: 10 }
    };
    
    this.init();
  }

  startCroppingResize(e, img, position) {
    const bmp = img.querySelector('img.ipc-canvas-bitmap');
    if (!bmp) return;
    this.isResizing = true;
    const startX = e.clientX;
    const startY = e.clientY;
    const rect = img.getBoundingClientRect();
    const width = rect.width || parseInt(img.style.width) || 1;
    const height = rect.height || parseInt(img.style.height) || 1;
    const startCrop = {
      top: parseFloat(bmp.dataset.cropTopPct || '0'),
      right: parseFloat(bmp.dataset.cropRightPct || '0'),
      bottom: parseFloat(bmp.dataset.cropBottomPct || '0'),
      left: parseFloat(bmp.dataset.cropLeftPct || '0')
    };
    const minPx = 10; // minimum visible size
    const minW = minPx / width;
    const minH = minPx / height;

    const onMove = (ev) => {
      if (!this.isResizing) return;
      // Absolute pointer mapping so directions feel natural
      const mx = ev.clientX - rect.left;
      const my = ev.clientY - rect.top;
      const px = mx / width; // 0..1 from left
      const py = my / height; // 0..1 from top
      let top = startCrop.top;
      let right = startCrop.right;
      let bottom = startCrop.bottom;
      let left = startCrop.left;

      const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
      const clampLR = (l, r) => {
        const total = l + r;
        if (total > 1 - minW) {
          const excess = total - (1 - minW);
          // reduce the one that was changed last (approx by position)
          if (position.includes('w')) l -= excess; else r -= excess;
        }
        return [clamp(l,0,1), clamp(r,0,1)];
      };
      const clampTB = (t, b) => {
        const total = t + b;
        if (total > 1 - minH) {
          const excess = total - (1 - minH);
          if (position.includes('n')) t -= excess; else b -= excess;
        }
        return [clamp(t,0,1), clamp(b,0,1)];
      };

      switch (position) {
        case 'e':
          right = clamp(1 - px, 0, 1);
          [left, right] = clampLR(left, right);
          break;
        case 'w':
          left = clamp(px, 0, 1);
          [left, right] = clampLR(left, right);
          break;
        case 's':
          bottom = clamp(1 - py, 0, 1);
          [top, bottom] = clampTB(top, bottom);
          break;
        case 'n':
          top = clamp(py, 0, 1);
          [top, bottom] = clampTB(top, bottom);
          break;
        case 'se':
          right = clamp(1 - px, 0, 1);
          bottom = clamp(1 - py, 0, 1);
          [left, right] = clampLR(left, right);
          [top, bottom] = clampTB(top, bottom);
          break;
        case 'sw':
          left = clamp(px, 0, 1);
          bottom = clamp(1 - py, 0, 1);
          [left, right] = clampLR(left, right);
          [top, bottom] = clampTB(top, bottom);
          break;
        case 'ne':
          right = clamp(1 - px, 0, 1);
          top = clamp(py, 0, 1);
          [left, right] = clampLR(left, right);
          [top, bottom] = clampTB(top, bottom);
          break;
        case 'nw':
          left = clamp(px, 0, 1);
          top = clamp(py, 0, 1);
          [left, right] = clampLR(left, right);
          [top, bottom] = clampTB(top, bottom);
          break;
      }

      bmp.dataset.cropTopPct = String(top);
      bmp.dataset.cropRightPct = String(right);
      bmp.dataset.cropBottomPct = String(bottom);
      bmp.dataset.cropLeftPct = String(left);
      bmp.style.clipPath = `inset(${top*100}% ${right*100}% ${bottom*100}% ${left*100}%)`;
      this.updateCropHandles(img, {top,right,bottom,left});
    };

    const onUp = () => {
      this.isResizing = false;
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };

    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }

  // Update handle positions to align with current crop insets (fractions 0..1)
  updateCropHandles(img, { top = 0, right = 0, bottom = 0, left = 0 } = {}) {
    const pct = (v) => `${(v * 100).toFixed(4)}%`;
    const cornerOffset = 7; // px (half of 14px)
    const sideOffset = 4;   // px (half of 8px)

    const setStyle = (el, styles) => {
      if (!el) return;
      // Clear first to avoid conflicting sides
      el.style.top = '';
      el.style.right = '';
      el.style.bottom = '';
      el.style.left = '';
      Object.entries(styles).forEach(([k, v]) => el.style[k] = v);
    };

    // Corners
    setStyle(img.querySelector('.ipc-resize-nw'), {
      top: `calc(${pct(top)} - ${cornerOffset}px)`,
      left: `calc(${pct(left)} - ${cornerOffset}px)`
    });
    setStyle(img.querySelector('.ipc-resize-ne'), {
      top: `calc(${pct(top)} - ${cornerOffset}px)`,
      right: `calc(${pct(right)} - ${cornerOffset}px)`
    });
    setStyle(img.querySelector('.ipc-resize-sw'), {
      bottom: `calc(${pct(bottom)} - ${cornerOffset}px)`,
      left: `calc(${pct(left)} - ${cornerOffset}px)`
    });
    setStyle(img.querySelector('.ipc-resize-se'), {
      bottom: `calc(${pct(bottom)} - ${cornerOffset}px)`,
      right: `calc(${pct(right)} - ${cornerOffset}px)`
    });

    // Sides
    setStyle(img.querySelector('.ipc-resize-n'), {
      top: `calc(${pct(top)} - ${sideOffset}px)`,
      left: '50%'
    });
    setStyle(img.querySelector('.ipc-resize-s'), {
      bottom: `calc(${pct(bottom)} - ${sideOffset}px)`,
      left: '50%'
    });
    setStyle(img.querySelector('.ipc-resize-e'), {
      right: `calc(${pct(right)} - ${sideOffset}px)`,
      top: '50%'
    });
    setStyle(img.querySelector('.ipc-resize-w'), {
      left: `calc(${pct(left)} - ${sideOffset}px)`,
      top: '50%'
    });

    // Optionally align rotate handle to bottom-center of crop region
    const rotate = img.querySelector('.ipc-rotate-handle');
    if (rotate) {
      const centerX = left + (1 - left - right) / 2; // fraction from left
      setStyle(rotate, {
        left: `calc(${pct(centerX)})`,
        bottom: `calc(${pct(bottom)} - 35px)`
      });
      rotate.style.transform = 'translateX(-50%)';
    }
  }

  // Clear any inline overrides we applied to handles when leaving crop mode
  clearCropHandleOverrides(img) {
    const handles = img.querySelectorAll('.ipc-resize-handle, .ipc-rotate-handle');
    handles.forEach(h => {
      h.style.top = '';
      h.style.right = '';
      h.style.bottom = '';
      h.style.left = '';
      // Reset transform for rotate handle (side handles rely on CSS translate)
      if (h.classList.contains('ipc-rotate-handle')) {
        h.style.transform = '';
      }
    });
  }

  init() {
    this.container.innerHTML = this.createHTML();
    this.setupEventListeners();
    this.initializeSlides(1);
    // Ensure initial transform is applied
    requestAnimationFrame(() => this.applyCanvasTransform());
  }

  createHTML() {
    return `
      <div class="ipc-container">
        <!-- Top Toolbar -->
        <div class="ipc-toolbar">
          <div class="ipc-toolbar-section">
            <div class="ipc-logo">
              <i class="fab fa-instagram"></i>
              <span>Post Creator</span>
            </div>
          </div>
          
          <div class="ipc-toolbar-section">
            <div class="ipc-control-group">
              <label>Slides</label>
              <select id="slideCount" class="ipc-select">
                ${[1,2,3,4,5,6,7,8,9,10].map(n => 
                  `<option value="${n}">${n} ${n === 1 ? 'Slide' : 'Slides'}</option>`
                ).join('')}
              </select>
            </div>
            
            <div class="ipc-control-group">
              <label>Aspect Ratio</label>
              <select id="aspectRatio" class="ipc-select">
                <option value="1:1">Square (1:1) - 1080×1080</option>
                <option value="4:5">Portrait (4:5) - 1080×1350</option>
                <option value="16:9">Landscape (16:9) - 1080×608</option>
              </select>
            </div>
          </div>
          
          <div class="ipc-toolbar-section">
            <button id="exportBtn" class="ipc-btn ipc-btn-primary">
              <i class="fas fa-download"></i>
              Export Slides
            </button>
          </div>
        </div>

        <!-- Main Layout -->
        <div class="ipc-main-layout">
          <!-- Top Panel - Image Library -->
          <div class="ipc-panel ipc-panel-left">
            <div class="ipc-panel-header">
              <h3>Images</h3>
              <button id="addImagesBtn" class="ipc-btn-icon" title="Add Images">
                <i class="fas fa-plus"></i>
              </button>
            </div>
            
            <div class="ipc-image-library">
              <div class="ipc-drop-zone" id="dropZone">
                <i class="fas fa-cloud-upload-alt"></i>
                <p>Drop images here</p>
                <span>or click + to browse</span>
                <input type="file" id="fileInput" multiple accept="image/*" style="display: none;">
              </div>
              <div class="ipc-image-list" id="imageList"></div>
            </div>
          </div>

          <!-- Center - Canvas Area -->
          <div class="ipc-panel ipc-panel-center">
            <!-- Canvas Container -->
            <div class="ipc-canvas-container">
              <div class="ipc-canvas-wrapper" id="canvasWrapper">
                <div class="ipc-canvas" id="mainCanvas">
                  <!-- Slides will be rendered here -->
                </div>
              </div>
            </div>
            
            <!-- Bottom Controls -->
            <div class="ipc-canvas-controls">
              <div class="ipc-control-row">
                <button class="ipc-btn-icon" id="zoomOutBtn" title="Zoom Out">
                  <i class="fas fa-search-minus"></i>
                </button>
                <input type="range" id="zoomSlider" min="25" max="150" value="100" class="ipc-zoom-slider">
                <button class="ipc-btn-icon" id="zoomInBtn" title="Zoom In">
                  <i class="fas fa-search-plus"></i>
                </button>
                <span class="ipc-zoom-value" id="zoomValue">100%</span>
                
                <div class="ipc-separator"></div>
                
                <button class="ipc-btn-icon" id="fitToViewBtn" title="Fit to View">
                  <i class="fas fa-compress"></i>
                </button>
                <button class="ipc-btn-icon" id="actualSizeBtn" title="Actual Size">
                  <i class="fas fa-expand"></i>
                </button>
                
                <div class="ipc-separator"></div>
                
                <label class="ipc-toggle">
                  <input type="checkbox" id="gridToggle">
                  <span>Grid</span>
                </label>
                <label class="ipc-toggle">
                  <input type="checkbox" id="snapToggle">
                  <span>Snap</span>
                </label>
              </div>
            </div>
          </div>

          <!-- Bottom Panel - Properties -->
          <div class="ipc-panel ipc-panel-right">
            <div class="ipc-panel-header">
              <h3>Properties</h3>
            </div>
            
            <div class="ipc-properties" id="properties">
              <div class="ipc-no-selection">
                <i class="fas fa-mouse-pointer"></i>
                <p>Select an image to edit</p>
              </div>
              
              <div class="ipc-image-properties" id="imageProperties" style="display: none;">
                <div class="ipc-property-group">
                  <label>Position</label>
                  <div class="ipc-property-row">
                    <div class="ipc-input-group">
                      <label>X</label>
                      <input type="number" id="posX" class="ipc-number-input" value="0">
                    </div>
                    <div class="ipc-input-group">
                      <label>Y</label>
                      <input type="number" id="posY" class="ipc-number-input" value="0">
                    </div>
                  </div>
                </div>
                
                <div class="ipc-property-divider"></div>
                
                <div class="ipc-property-group">
                  <label>Size</label>
                  <div class="ipc-property-row">
                    <div class="ipc-input-group">
                      <label>W</label>
                      <input type="number" id="width" class="ipc-number-input" value="100">
                    </div>
                    <div class="ipc-input-group">
                      <label>H</label>
                      <input type="number" id="height" class="ipc-number-input" value="100">
                    </div>
                    <button class="ipc-btn-icon" id="lockAspectBtn" title="Lock Aspect">
                      <i class="fas fa-link"></i>
                    </button>
                  </div>
                </div>
                
                <div class="ipc-property-divider"></div>
                
                <div class="ipc-property-group">
                  <label>Rotation</label>
                  <div class="ipc-property-row">
                    <input type="range" id="rotation" min="0" max="360" value="0" class="ipc-slider">
                    <input type="number" id="rotationValue" class="ipc-number-input" value="0" min="0" max="360">
                    <span>°</span>
                  </div>
                </div>
                
                <div class="ipc-property-divider"></div>
                
                <div class="ipc-property-group">
                  <label>Opacity</label>
                  <div class="ipc-property-row">
                    <input type="range" id="opacity" min="0" max="100" value="100" class="ipc-slider">
                    <input type="number" id="opacityValue" class="ipc-number-input" value="100" min="0" max="100">
                    <span>%</span>
                  </div>
                </div>
                
                <div class="ipc-property-divider"></div>
                
                <div class="ipc-button-row">
                  <button class="ipc-btn ipc-btn-secondary" id="flipHorizontalBtn" title="Flip Horizontal">
                    <i class="fas fa-arrows-alt-h"></i>
                  </button>
                  <button class="ipc-btn ipc-btn-secondary" id="flipVerticalBtn" title="Flip Vertical">
                    <i class="fas fa-arrows-alt-v"></i>
                  </button>
                  <button class="ipc-btn ipc-btn-secondary" id="bringToFrontBtn" title="Bring to Front">
                    <i class="fas fa-layer-group"></i>
                  </button>
                  <button class="ipc-btn ipc-btn-secondary" id="sendToBackBtn" title="Send to Back">
                    <i class="fas fa-level-down-alt"></i>
                  </button>
                  <button class="ipc-btn ipc-btn-secondary" id="resetTransformBtn" title="Reset">
                    <i class="fas fa-undo"></i>
                  </button>
                  <button class="ipc-btn ipc-btn-secondary" id="cropModeBtn" title="Crop Mode">
                    <i class="fas fa-crop"></i>
                  </button>
                  <button class="ipc-btn ipc-btn-danger" id="deleteImageBtn" title="Delete">
                    <i class="fas fa-trash"></i>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  setupEventListeners() {
    // File handling
    const fileInput = document.getElementById('fileInput');
    const addImagesBtn = document.getElementById('addImagesBtn');
    const dropZone = document.getElementById('dropZone');
    
    addImagesBtn.addEventListener('click', () => fileInput.click());
    dropZone.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', (e) => this.handleFileSelect(e.target.files));
    
    // Drag and drop
    this.setupDragAndDrop();
    
    // Slide controls
    document.getElementById('slideCount').addEventListener('change', (e) => {
      this.initializeSlides(parseInt(e.target.value));
    });
    
    // Canvas controls
    this.setupCanvasControls();
    
    // Aspect ratio changes
    const arSelect = document.getElementById('aspectRatio');
    if (arSelect) {
      arSelect.addEventListener('change', (e) => {
        const val = e.target.value; // e.g., "1:1", "4:5", "16:9"
        const [w, h] = val.split(':').map(Number);
        if (w && h) {
          // Store old canvas dimensions before changing aspect
          const canvas = document.getElementById('mainCanvas');
          const oldWidth = parseInt(canvas.style.width) || 1;
          const oldHeight = parseInt(canvas.style.height) || 1;
          
          this.panelAspect = { w, h };
          this.updateCanvasDisplay();
          
          // Get new canvas dimensions after aspect change
          const newWidth = parseInt(canvas.style.width) || 1;
          const newHeight = parseInt(canvas.style.height) || 1;
          
          // Scale all existing images to maintain their relative positions
          const scaleX = newWidth / oldWidth;
          const scaleY = newHeight / oldHeight;
          
          const images = canvas.querySelectorAll('.ipc-canvas-image');
          images.forEach(img => {
            const left = parseInt(img.style.left) || 0;
            const top = parseInt(img.style.top) || 0;
            const width = parseInt(img.style.width) || 1;
            const height = parseInt(img.style.height) || 1;
            
            img.style.left = `${Math.round(left * scaleX)}px`;
            img.style.top = `${Math.round(top * scaleY)}px`;
            img.style.width = `${Math.round(width * scaleX)}px`;
            img.style.height = `${Math.round(height * scaleY)}px`;
          });
          
          // Update properties panel if an image is selected
          if (this.selectedImage) {
            this.updatePropertiesPanel(this.selectedImage);
          }
          
          // refit to view after layout change
          setTimeout(() => this.fitToView(), 50);
        }
      });
    }

    // Export
    document.getElementById('exportBtn').addEventListener('click', () => this.exportSlides());
    
    // Properties panel
    this.setupPropertiesPanel();
  }

  setupDragAndDrop() {
    const dropZone = document.getElementById('dropZone');
    const canvas = document.getElementById('mainCanvas');
    
    // Prevent default drag behaviors
    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
      dropZone.addEventListener(eventName, (e) => {
        e.preventDefault();
        e.stopPropagation();
      });
      canvas.addEventListener(eventName, (e) => {
        e.preventDefault();
        e.stopPropagation();
      });
    });
    
    // Highlight drop zone
    ['dragenter', 'dragover'].forEach(eventName => {
      dropZone.addEventListener(eventName, () => {
        dropZone.classList.add('drag-over');
      });
    });
    
    ['dragleave', 'drop'].forEach(eventName => {
      dropZone.addEventListener(eventName, () => {
        dropZone.classList.remove('drag-over');
      });
    });
    
    // Handle dropped files
    dropZone.addEventListener('drop', (e) => {
      const files = e.dataTransfer.files;
      this.handleFileSelect(files);
    });
    
    canvas.addEventListener('drop', (e) => {
      const files = e.dataTransfer.files;
      if (files.length > 0) {
        this.handleFileSelect(files, true); // true = add directly to canvas
      }
    });
  }

  setupCanvasControls() {
    const zoomSlider = document.getElementById('zoomSlider');
    const zoomValue = document.getElementById('zoomValue');
    const zoomInBtn = document.getElementById('zoomInBtn');
    const zoomOutBtn = document.getElementById('zoomOutBtn');
    const fitToViewBtn = document.getElementById('fitToViewBtn');
    const actualSizeBtn = document.getElementById('actualSizeBtn');
    const canvasContainer = document.getElementById('canvasWrapper').parentElement;
    
    zoomSlider.addEventListener('input', (e) => {
      const zoom = e.target.value;
      zoomValue.textContent = `${zoom}%`;
      this.setZoom(zoom / 100);
    });
    
    zoomInBtn.addEventListener('click', () => {
      const currentZoom = parseInt(zoomSlider.value);
      const newZoom = Math.min(150, currentZoom + 10);
      zoomSlider.value = newZoom;
      zoomValue.textContent = `${newZoom}%`;
      this.setZoom(newZoom / 100);
    });
    
    zoomOutBtn.addEventListener('click', () => {
      const currentZoom = parseInt(zoomSlider.value);
      const newZoom = Math.max(25, currentZoom - 10);
      zoomSlider.value = newZoom;
      zoomValue.textContent = `${newZoom}%`;
      this.setZoom(newZoom / 100);
    });
    
    fitToViewBtn.addEventListener('click', () => {
      this.fitToView();
    });
    
    actualSizeBtn.addEventListener('click', () => {
      zoomSlider.value = 100;
      zoomValue.textContent = '100%';
      this.panOffsetX = 0;
      this.panOffsetY = 0;
      this.setZoom(1);
    });
    
    // Mouse wheel zoom on canvas background
    canvasContainer.addEventListener('wheel', (e) => {
      const target = e.target;
      // Schedule heavy work in requestAnimationFrame to avoid long-running wheel handlers
      if (target.classList && (target.classList.contains('ipc-canvas-image') || target.closest('.ipc-canvas-image'))) {
        e.preventDefault();
        const img = target.classList.contains('ipc-canvas-image') ? target : target.closest('.ipc-canvas-image');
        this.queueWheel({ type: 'image', deltaY: e.deltaY, img });
      } else if (
        target.classList && (
          target.classList.contains('ipc-canvas-container') ||
          target.classList.contains('ipc-canvas-wrapper') ||
          target.classList.contains('ipc-canvas') ||
          target.classList.contains('ipc-slide')
        )
      ) {
        e.preventDefault();
        this.queueWheel({ type: 'canvas', deltaY: e.deltaY });
      }
    }, { passive: false });
    
    // Middle mouse button panning
    canvasContainer.addEventListener('mousedown', (e) => {
      if (e.button === 1) { // Middle mouse button
        e.preventDefault();
        this.isPanning = true;
        this.panStartX = e.clientX;
        this.panStartY = e.clientY;
        canvasContainer.classList.add('panning');
      }
    });
    
    document.addEventListener('mousemove', (e) => {
      if (this.isPanning) {
        e.preventDefault();
        const dx = e.clientX - this.panStartX;
        const dy = e.clientY - this.panStartY;
        this.panStartX = e.clientX;
        this.panStartY = e.clientY;
        this.panOffsetX += dx;
        this.panOffsetY += dy;
        this.applyCanvasTransform();
      }
    });
    
    document.addEventListener('mouseup', (e) => {
      if (e.button === 1 && this.isPanning) {
        this.isPanning = false;
        canvasContainer.classList.remove('panning');
      }
    });
  }
  
  // Queue wheel work to next animation frame to reduce handler time
  queueWheel(job) {
    // Keep only the latest pending job; wheel events can be very frequent
    this._wheelPending = job;
    if (this._wheelRaf) return;
    this._wheelRaf = requestAnimationFrame(() => {
      const j = this._wheelPending;
      this._wheelPending = null;
      this._wheelRaf = null;
      if (!j) return;
      if (j.type === 'image' && j.img) {
        this.handleImageWheelDelta(j.deltaY, j.img);
      } else if (j.type === 'canvas') {
        this.handleCanvasWheelDelta(j.deltaY);
      }
    });
  }

  handleCanvasWheel(e) {
    // Backward-compat path; delegate to delta version
    const delta = e.deltaY;
    this.handleCanvasWheelDelta(delta);
  }

  handleCanvasWheelDelta(deltaY) {
    const delta = deltaY > 0 ? -5 : 5;
    const currentZoom = parseInt(document.getElementById('zoomSlider').value);
    const newZoom = Math.max(25, Math.min(150, currentZoom + delta));
    
    document.getElementById('zoomSlider').value = newZoom;
    document.getElementById('zoomValue').textContent = `${newZoom}%`;
    this.setZoom(newZoom / 100);
  }
  
  handleImageWheel(e, img) {
    // Backward-compat path; delegate to delta version
    this.handleImageWheelDelta(e.deltaY, img);
  }

  handleImageWheelDelta(deltaY, img) {
    // Only select if not already selected (avoid expensive selection operations)
    if (!this.selectedImage || this.selectedImage !== img) {
      this.selectImage(img);
      return; // Skip this wheel event after selection to avoid lag
    }

    // Start/continue live scaling via transform for smoothness; commit dimensions after idle
    if (this.liveScaleActive !== img) {
      this.beginLiveScale(img);
    }

    const sign = deltaY > 0 ? -1 : 1; // wheel up = zoom in
    const step = 1 + this.wheelScaleStep * sign;
    this.liveScaleFactor = Math.max(0.05, this.liveScaleFactor * step);

    // Apply transform with rotation/flip + live scale
    img.dataset.liveScale = String(this.liveScaleFactor);
    this.applyComposedTransform(img);

    // Schedule commit
    this.scheduleLiveScaleCommit();
  }

  beginLiveScale(img) {
    this.liveScaleActive = img;
    this.liveScaleFactor = 1;
    this.liveScaleBase = {
      w: parseInt(img.style.width) || img.offsetWidth || 1,
      h: parseInt(img.style.height) || img.offsetHeight || 1,
      left: parseInt(img.style.left) || 0,
      top: parseInt(img.style.top) || 0
    };
    img.classList.add('interacting');
  }

  scheduleLiveScaleCommit() {
    if (this.liveScaleCommitTimer) clearTimeout(this.liveScaleCommitTimer);
    this.liveScaleCommitTimer = setTimeout(() => this.commitLiveScale(), 140);
  }

  commitLiveScale() {
    const img = this.liveScaleActive;
    if (!img || !this.liveScaleBase) return;
    const factor = this.liveScaleFactor;
    const base = this.liveScaleBase;

    const newWidth = Math.max(50, Math.round(base.w * factor));
    const newHeight = Math.max(50, Math.round(base.h * factor));
    const centerX = base.left + base.w / 2;
    const centerY = base.top + base.h / 2;
    const newLeft = Math.round(centerX - newWidth / 2);
    const newTop = Math.round(centerY - newHeight / 2);

    // Commit layout dimensions
    img.style.width = `${newWidth}px`;
    img.style.height = `${newHeight}px`;
    img.style.left = `${newLeft}px`;
    img.style.top = `${newTop}px`;

    // Clear live scale and keep only rotation/flip transforms
    img.dataset.liveScale = '1';
    this.applyComposedTransform(img);

    // Update properties panel once
    const widthInput = document.getElementById('width');
    const heightInput = document.getElementById('height');
    const posXInput = document.getElementById('posX');
    const posYInput = document.getElementById('posY');
    if (widthInput) widthInput.value = newWidth;
    if (heightInput) heightInput.value = newHeight;
    if (posXInput) posXInput.value = newLeft;
    if (posYInput) posYInput.value = newTop;

    // Reset live state
    this.liveScaleActive = null;
    this.liveScaleFactor = 1;
    this.liveScaleBase = null;
    img.classList.remove('interacting');
  }

  applyComposedTransform(img) {
    const rotation = document.getElementById('rotation').value;
    const scaleX = img.dataset.scaleX || '1';
    const scaleY = img.dataset.scaleY || '1';
    const liveScale = img.dataset.liveScale ? parseFloat(img.dataset.liveScale) : 1;
    img.style.transform = `rotate(${rotation}deg) scaleX(${scaleX}) scaleY(${scaleY}) scale(${liveScale})`;
  }

  setupPropertiesPanel() {
    // Position controls
    document.getElementById('posX').addEventListener('input', (e) => {
      if (this.selectedImage) {
        this.selectedImage.style.left = `${e.target.value}px`;
      }
    });
    
    document.getElementById('posY').addEventListener('input', (e) => {
      if (this.selectedImage) {
        this.selectedImage.style.top = `${e.target.value}px`;
      }
    });
    
    // Size controls
    document.getElementById('width').addEventListener('input', (e) => {
      if (this.selectedImage) {
        this.selectedImage.style.width = `${e.target.value}px`;
      }
    });
    
    document.getElementById('height').addEventListener('input', (e) => {
      if (this.selectedImage) {
        this.selectedImage.style.height = `${e.target.value}px`;
      }
    });
    
    // Rotation control
    const rotation = document.getElementById('rotation');
    const rotationValue = document.getElementById('rotationValue');
    
    rotation.addEventListener('input', (e) => {
      rotationValue.value = e.target.value;
      if (this.selectedImage) {
        this.updateImageTransform();
      }
    });
    
    rotationValue.addEventListener('input', (e) => {
      rotation.value = e.target.value;
      if (this.selectedImage) {
        this.updateImageTransform();
      }
    });
    
    // Opacity control
    const opacity = document.getElementById('opacity');
    const opacityValue = document.getElementById('opacityValue');
    
    opacity.addEventListener('input', (e) => {
      opacityValue.value = e.target.value;
      if (this.selectedImage) {
        this.selectedImage.style.opacity = e.target.value / 100;
      }
    });
    
    opacityValue.addEventListener('input', (e) => {
      opacity.value = e.target.value;
      if (this.selectedImage) {
        this.selectedImage.style.opacity = e.target.value / 100;
      }
    });
    
    // Action buttons
    document.getElementById('flipHorizontalBtn').addEventListener('click', () => {
      if (this.selectedImage) {
        const currentScaleX = this.selectedImage.dataset.scaleX || '1';
        this.selectedImage.dataset.scaleX = currentScaleX === '1' ? '-1' : '1';
        this.updateImageTransform();
      }
    });
    
    document.getElementById('flipVerticalBtn').addEventListener('click', () => {
      if (this.selectedImage) {
        const currentScaleY = this.selectedImage.dataset.scaleY || '1';
        this.selectedImage.dataset.scaleY = currentScaleY === '1' ? '-1' : '1';
        this.updateImageTransform();
      }
    });
    
    document.getElementById('resetTransformBtn').addEventListener('click', () => {
      if (this.selectedImage) {
        this.resetImageTransform();
      }
    });
    
    // Crop mode toggle
    const cropBtn = document.getElementById('cropModeBtn');
    cropBtn.addEventListener('click', () => {
      if (!this.selectedImage) return;
      this.isCropMode = !this.isCropMode;
      cropBtn.classList.toggle('active', this.isCropMode);
      this.selectedImage.classList.toggle('crop-mode', this.isCropMode);
      // Ensure crop fields exist
      const bmp = this.selectedImage.querySelector('img.ipc-canvas-bitmap');
      if (!bmp) return;
      ['cropTopPct','cropRightPct','cropBottomPct','cropLeftPct'].forEach(k => {
        if (bmp.dataset[k] === undefined) bmp.dataset[k] = '0';
      });
      const top = parseFloat(bmp.dataset.cropTopPct||'0');
      const right = parseFloat(bmp.dataset.cropRightPct||'0');
      const bottom = parseFloat(bmp.dataset.cropBottomPct||'0');
      const left = parseFloat(bmp.dataset.cropLeftPct||'0');
      bmp.style.clipPath = (this.isCropMode || top||right||bottom||left) ?
        `inset(${top*100}% ${right*100}% ${bottom*100}% ${left*100}%)` : 'none';
      if (this.isCropMode) {
        this.updateCropHandles(this.selectedImage, {top,right,bottom,left});
      } else {
        this.clearCropHandleOverrides(this.selectedImage);
      }
    });
    
    document.getElementById('deleteImageBtn').addEventListener('click', () => {
      if (this.selectedImage) {
        this.deleteSelectedImage();
      }
    });
    
    document.getElementById('bringToFrontBtn').addEventListener('click', () => {
      if (this.selectedImage) {
        this.selectedImage.style.zIndex = this.getMaxZIndex() + 1;
      }
    });
    
    document.getElementById('sendToBackBtn').addEventListener('click', () => {
      if (this.selectedImage) {
        this.selectedImage.style.zIndex = 1;
      }
    });
    
    // Lock aspect ratio button
    const lockAspectBtn = document.getElementById('lockAspectBtn');
    lockAspectBtn.addEventListener('click', () => {
      this.aspectRatioLocked = !this.aspectRatioLocked;
      lockAspectBtn.innerHTML = this.aspectRatioLocked 
        ? '<i class="fas fa-link"></i>' 
        : '<i class="fas fa-unlink"></i>';
      lockAspectBtn.title = this.aspectRatioLocked ? 'Unlock Aspect' : 'Lock Aspect';
      // Toggle how the bitmap fills the container
      if (this.selectedImage) {
        const bmp = this.selectedImage.querySelector('img.ipc-canvas-bitmap');
        if (bmp) {
          const fit = this.aspectRatioLocked ? 'contain' : 'fill';
          bmp.style.objectFit = fit;
          this.selectedImage.dataset.objectFit = fit;
        }
      }
    });
  }

  handleFileSelect(files, addToCanvas = false) {
    Array.from(files).forEach(file => {
      if (file.type.startsWith('image/')) {
        const reader = new FileReader();
        reader.onload = (e) => {
          const originalSrc = e.target.result;
          const img = new Image();
          img.onload = () => {
            // Create a downscaled display proxy for very large images to keep interactions smooth
            const MAX_DISPLAY_DIM = 4096; // cap the longest side for on-canvas preview
            let displaySrc = originalSrc;
            const { naturalWidth: ow, naturalHeight: oh } = img;
            const maxDim = Math.max(ow, oh);
            if (maxDim > MAX_DISPLAY_DIM) {
              const scale = MAX_DISPLAY_DIM / maxDim;
              const w = Math.round(ow * scale);
              const h = Math.round(oh * scale);
              const canvas = document.createElement('canvas');
              canvas.width = w;
              canvas.height = h;
              const ctx = canvas.getContext('2d');
              // Use high quality scaling when available
              ctx.imageSmoothingEnabled = true;
              ctx.imageSmoothingQuality = 'high';
              ctx.drawImage(img, 0, 0, w, h);
              try {
                // webp preserves alpha and compresses well
                displaySrc = canvas.toDataURL('image/webp', 0.85);
              } catch (_) {
                displaySrc = canvas.toDataURL();
              }
            }

            const imageData = {
              id: Date.now() + Math.random(),
              src: originalSrc, // keep full-res for export
              displaySrc,       // use this for on-canvas rendering
              name: file.name,
              size: this.formatFileSize(file.size)
            };

            this.images.push(imageData);
            this.addImageToLibrary(imageData);

            if (addToCanvas && this.slides[this.currentSlide]) {
              this.addImageToCanvas(imageData, this.slides[this.currentSlide]);
            }
          };
          img.src = originalSrc;
        };
        reader.readAsDataURL(file);
      }
    });
  }

  addImageToLibrary(imageData) {
    const imageList = document.getElementById('imageList');
    
    // Remove drop zone if this is the first image
    if (this.images.length === 1) {
      document.getElementById('dropZone').style.display = 'none';
    }
    
    const imageItem = document.createElement('div');
    imageItem.className = 'ipc-library-item';
    imageItem.dataset.imageId = imageData.id;
    imageItem.innerHTML = `
      <img src="${imageData.displaySrc || imageData.src}" alt="${imageData.name}">
      <div class="ipc-library-item-info">
        <span class="ipc-library-item-name">${imageData.name}</span>
        <span class="ipc-library-item-size">${imageData.size}</span>
      </div>
    `;
    
    imageItem.addEventListener('click', () => {
      if (this.slides[this.currentSlide]) {
        this.addImageToCanvas(imageData, this.slides[this.currentSlide]);
      }
    });
    
    // Make draggable
    imageItem.draggable = true;
    imageItem.addEventListener('dragstart', (e) => {
      e.dataTransfer.setData('imageId', imageData.id);
    });
    
    imageList.appendChild(imageItem);
  }

  addImageToCanvas(imageData, slideElement) {
    // Create an image element to get actual dimensions
    const tempImg = new Image();
    tempImg.src = imageData.displaySrc || imageData.src;
    
    tempImg.onload = () => {
      const img = document.createElement('div');
      img.className = 'ipc-canvas-image';
      img.dataset.imageId = imageData.id;
      img.dataset.scaleX = '1';
      img.dataset.scaleY = '1';
      // Create inner bitmap element for better compositing
      const bitmap = document.createElement('img');
      bitmap.className = 'ipc-canvas-bitmap';
      bitmap.decoding = 'async';
      bitmap.loading = 'eager';
      bitmap.draggable = false;
      bitmap.src = imageData.displaySrc || imageData.src;
      const objectFit = this.aspectRatioLocked ? 'contain' : 'fill';
      bitmap.style.objectFit = objectFit;
      // Preserve original source for export at full quality
      bitmap.dataset.fullSrc = imageData.src;
      img.appendChild(bitmap);
      // Preserve original source for export at full quality
      img.dataset.fullSrc = imageData.src;
      img.dataset.objectFit = objectFit;
      
      // Calculate size preserving aspect ratio, max 400px on longest side
      const maxSize = 400;
      let width = tempImg.width;
      let height = tempImg.height;
      
      if (width > height) {
        if (width > maxSize) {
          height = (height * maxSize) / width;
          width = maxSize;
        }
      } else {
        if (height > maxSize) {
          width = (width * maxSize) / height;
          height = maxSize;
        }
      }
      
      img.style.width = `${width}px`;
      img.style.height = `${height}px`;
  img.dataset.originalAspectRatio = (width / height).toString();
      
      img.style.left = '50px';
      img.style.top = '50px';
      img.style.zIndex = this.getMaxZIndex() + 1;
      
      // Add corner resize handles
      const cornerHandles = ['nw', 'ne', 'sw', 'se'];
      cornerHandles.forEach(position => {
        const handle = document.createElement('div');
        handle.className = `ipc-resize-handle ipc-resize-${position}`;
        handle.dataset.position = position;
        img.appendChild(handle);
      });
      
      // Add side resize handles
      const sideHandles = ['n', 'e', 's', 'w'];
      sideHandles.forEach(position => {
        const handle = document.createElement('div');
        handle.className = `ipc-resize-handle ipc-resize-${position}`;
        handle.dataset.position = position;
        img.appendChild(handle);
      });
      
      // Add rotation handle
      const rotateHandle = document.createElement('div');
      rotateHandle.className = 'ipc-rotate-handle';
      rotateHandle.innerHTML = '<i class="fas fa-sync-alt"></i>';
      img.appendChild(rotateHandle);
      
    slideElement.appendChild(img);
      
      // Set up image interactions
      this.setupImageInteractions(img);
      
      // Select the newly added image
      this.selectImage(img);
    };
  }

  setupImageInteractions(img) {
    // Selection
    img.addEventListener('mousedown', (e) => {
      // Only left mouse should drag/move the image
      if (e.button !== 0) {
        // Allow middle/right clicks to bubble so canvas panning or context menu can work
        return;
      }
      if (e.target.classList.contains('ipc-resize-handle') ||
          e.target.classList.contains('ipc-rotate-handle')) {
        return;
      }

      this.selectImage(img);
      this.startDragging(e, img);
    });
    
    // Resize handles
    img.querySelectorAll('.ipc-resize-handle').forEach(handle => {
      handle.addEventListener('mousedown', (e) => {
        if (e.button !== 0) return; // left click only
        e.stopPropagation();
        this.startResizing(e, img, handle.dataset.position);
      });
    });
    
    // Rotation handle
    const rotateHandle = img.querySelector('.ipc-rotate-handle');
    if (rotateHandle) {
      rotateHandle.addEventListener('mousedown', (e) => {
        if (e.button !== 0) return; // left click only
        e.stopPropagation();
        this.startRotating(e, img);
      });
    }
  }

  selectImage(img) {
    // Deselect all images
    document.querySelectorAll('.ipc-canvas-image').forEach(image => {
      image.classList.remove('selected');
    });
    
    // Select this image
    img.classList.add('selected');
    this.selectedImage = img;
    
    // Update properties panel
    this.updatePropertiesPanel(img);
    
    // Show properties panel
    document.getElementById('imageProperties').style.display = 'flex';
    document.querySelector('.ipc-no-selection').style.display = 'none';
  }

  updatePropertiesPanel(img) {
    // Batch DOM updates to minimize reflows
    requestAnimationFrame(() => {
      const posX = parseInt(img.style.left);
      const posY = parseInt(img.style.top);
      const width = parseInt(img.style.width);
      const height = parseInt(img.style.height);
      const rotation = this.getRotationFromTransform(img.style.transform);
      const opacity = img.style.opacity ? parseFloat(img.style.opacity) * 100 : 100;
      
      // Update all inputs in one batch
      document.getElementById('posX').value = posX;
      document.getElementById('posY').value = posY;
      document.getElementById('width').value = width;
      document.getElementById('height').value = height;
      document.getElementById('rotation').value = rotation;
      document.getElementById('rotationValue').value = rotation;
      document.getElementById('opacity').value = opacity;
      document.getElementById('opacityValue').value = opacity;
    });
  }

  getRotationFromTransform(transform) {
    if (!transform || transform === 'none') return 0;
    const match = transform.match(/rotate\((-?\d+)deg\)/);
    return match ? parseInt(match[1]) : 0;
  }

  updateImageTransform() {
    if (!this.selectedImage) return;
    // Keep composition logic in one place (includes live scale if present)
    this.applyComposedTransform(this.selectedImage);
  }

  resetImageTransform() {
    if (!this.selectedImage) return;
    
    this.selectedImage.style.transform = 'none';
    this.selectedImage.dataset.scaleX = '1';
    this.selectedImage.dataset.scaleY = '1';
    
    document.getElementById('rotation').value = 0;
    document.getElementById('rotationValue').value = 0;
  }

  deleteSelectedImage() {
    if (!this.selectedImage) return;
    
    this.selectedImage.remove();
    this.selectedImage = null;
    
    // Hide properties panel
    document.getElementById('imageProperties').style.display = 'none';
    document.querySelector('.ipc-no-selection').style.display = 'block';
  }

  startDragging(e, img) {
    if (this.isCropMode) return; // Do not move image in crop mode
    this.isDragging = true;
    this.dragOffset = {
      x: e.clientX - parseInt(img.style.left),
      y: e.clientY - parseInt(img.style.top)
    };
    
    const mouseMoveHandler = (e) => {
      if (!this.isDragging) return;
      
      const newX = e.clientX - this.dragOffset.x;
      const newY = e.clientY - this.dragOffset.y;
      
      img.style.left = `${newX}px`;
      img.style.top = `${newY}px`;
      
      // Update properties panel
      document.getElementById('posX').value = newX;
      document.getElementById('posY').value = newY;
    };
    
    const mouseUpHandler = () => {
      this.isDragging = false;
      document.removeEventListener('mousemove', mouseMoveHandler);
      document.removeEventListener('mouseup', mouseUpHandler);
    };
    
    document.addEventListener('mousemove', mouseMoveHandler);
    document.addEventListener('mouseup', mouseUpHandler);
  }

  startResizing(e, img, position) {
    if (this.isCropMode) {
      this.startCroppingResize(e, img, position);
      return;
    }
    this.isResizing = true;
    const startX = e.clientX;
    const startY = e.clientY;
    const startWidth = parseInt(img.style.width);
    const startHeight = parseInt(img.style.height);
    const startLeft = parseInt(img.style.left);
    const startTop = parseInt(img.style.top);
    const aspectRatio = parseFloat(img.dataset.originalAspectRatio) || (startWidth / startHeight);
    
    const mouseMoveHandler = (e) => {
      if (!this.isResizing) return;
      
      const deltaX = e.clientX - startX;
      const deltaY = e.clientY - startY;
      
      let newWidth = startWidth;
      let newHeight = startHeight;
      let newLeft = startLeft;
      let newTop = startTop;
      
      // Handle different resize directions
      switch(position) {
        // Corner handles
        case 'se':
          newWidth = startWidth + deltaX;
          if (this.aspectRatioLocked) {
            newHeight = newWidth / aspectRatio;
          } else {
            newHeight = startHeight + deltaY;
          }
          break;
        case 'sw':
          newWidth = startWidth - deltaX;
          if (this.aspectRatioLocked) {
            newHeight = newWidth / aspectRatio;
          } else {
            newHeight = startHeight + deltaY;
          }
          newLeft = startLeft + deltaX;
          break;
        case 'ne':
          newWidth = startWidth + deltaX;
          if (this.aspectRatioLocked) {
            newHeight = newWidth / aspectRatio;
            newTop = startTop - (newHeight - startHeight);
          } else {
            newHeight = startHeight - deltaY;
            newTop = startTop + deltaY;
          }
          break;
        case 'nw':
          newWidth = startWidth - deltaX;
          if (this.aspectRatioLocked) {
            newHeight = newWidth / aspectRatio;
            newLeft = startLeft + deltaX;
            newTop = startTop - (newHeight - startHeight);
          } else {
            newHeight = startHeight - deltaY;
            newLeft = startLeft + deltaX;
            newTop = startTop + deltaY;
          }
          break;
          
        // Side handles
        case 'n':
          if (this.aspectRatioLocked) {
            newHeight = startHeight - deltaY;
            newWidth = newHeight * aspectRatio;
            newTop = startTop + deltaY;
            newLeft = startLeft - (newWidth - startWidth) / 2;
          } else {
            newHeight = startHeight - deltaY;
            newTop = startTop + deltaY;
          }
          break;
        case 's':
          if (this.aspectRatioLocked) {
            newHeight = startHeight + deltaY;
            newWidth = newHeight * aspectRatio;
            newLeft = startLeft - (newWidth - startWidth) / 2;
          } else {
            newHeight = startHeight + deltaY;
          }
          break;
        case 'e':
          if (this.aspectRatioLocked) {
            newWidth = startWidth + deltaX;
            newHeight = newWidth / aspectRatio;
            newTop = startTop - (newHeight - startHeight) / 2;
          } else {
            newWidth = startWidth + deltaX;
          }
          break;
        case 'w':
          if (this.aspectRatioLocked) {
            newWidth = startWidth - deltaX;
            newHeight = newWidth / aspectRatio;
            newLeft = startLeft + deltaX;
            newTop = startTop - (newHeight - startHeight) / 2;
          } else {
            newWidth = startWidth - deltaX;
            newLeft = startLeft + deltaX;
          }
          break;
      }
      
      // Apply minimum size constraint
      if (newWidth > 50) {
        img.style.width = `${newWidth}px`;
        img.style.left = `${newLeft}px`;
        document.getElementById('width').value = Math.round(newWidth);
        document.getElementById('posX').value = Math.round(newLeft);
      }
      
      if (newHeight > 50) {
        img.style.height = `${newHeight}px`;
        img.style.top = `${newTop}px`;
        document.getElementById('height').value = Math.round(newHeight);
        document.getElementById('posY').value = Math.round(newTop);
      }
    };
    
    const mouseUpHandler = () => {
      this.isResizing = false;
      document.removeEventListener('mousemove', mouseMoveHandler);
      document.removeEventListener('mouseup', mouseUpHandler);
    };
    
    document.addEventListener('mousemove', mouseMoveHandler);
    document.addEventListener('mouseup', mouseUpHandler);
  }

  startRotating(e, img) {
    const rect = img.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    
    const mouseMoveHandler = (e) => {
      const angle = Math.atan2(e.clientY - centerY, e.clientX - centerX) * 180 / Math.PI + 90;
      const normalizedAngle = angle < 0 ? angle + 360 : angle;
      
      document.getElementById('rotation').value = Math.round(normalizedAngle);
      document.getElementById('rotationValue').value = Math.round(normalizedAngle);
      this.updateImageTransform();
    };
    
    const mouseUpHandler = () => {
      document.removeEventListener('mousemove', mouseMoveHandler);
      document.removeEventListener('mouseup', mouseUpHandler);
    };
    
    document.addEventListener('mousemove', mouseMoveHandler);
    document.addEventListener('mouseup', mouseUpHandler);
  }

  initializeSlides(count) {
    const canvas = document.getElementById('mainCanvas');

    // Preserve existing images if any
    const existingImages = Array.from(canvas.querySelectorAll('.ipc-canvas-image'));

    // Clear existing slides (we'll use a single combined slide)
    canvas.innerHTML = '';
    this.slides = [];

    // Determine panel grid for the requested count
    const config = this.panelConfig[count] || { rows: 1, cols: count };
    this.panelCount = count;
    this.canvasCols = config.cols;
    this.canvasRows = config.rows;

    // Create a single combined slide that represents the full multi-panel canvas
    const slide = document.createElement('div');
    slide.className = 'ipc-slide active';
    slide.dataset.slideIndex = 0;

    // Add grid lines for visual separation between panels
    for (let r = 1; r < config.rows; r++) {
      const line = document.createElement('div');
      line.className = 'ipc-grid-line horizontal';
      line.style.top = `${(100 / config.rows) * r}%`;
      slide.appendChild(line);
    }

    for (let c = 1; c < config.cols; c++) {
      const line = document.createElement('div');
      line.className = 'ipc-grid-line vertical';
      line.style.left = `${(100 / config.cols) * c}%`;
      slide.appendChild(line);
    }

    canvas.appendChild(slide);
    this.slides.push(slide);
    this.currentSlide = 0;

    // Re-attach preserved images to the new combined slide
    existingImages.forEach(img => {
      // remove from old parent and append to new slide
      try {
        img.remove();
      } catch (e) {}
      slide.appendChild(img);
    });

    // Update the on-screen canvas dimensions to represent the combined panels
    this.updateCanvasDisplay();
    
    // Auto-fit canvas to view after layout changes
    setTimeout(() => this.fitToView(), 100);
  }

  updateCanvasDisplay() {
    const canvas = document.getElementById('mainCanvas');
    if (!canvas) return;

    // Use Instagram's recommended resolutions per aspect ratio
    const cols = this.canvasCols || 1;
    const rows = this.canvasRows || 1;
    const ar = this.panelAspect || { w:1, h:1 };
    
    let panelW, panelH;
    // Instagram recommended sizes per aspect ratio
    if (ar.w === 1 && ar.h === 1) {
      // Square: 1080×1080
      panelW = 1080;
      panelH = 1080;
    } else if (ar.w === 4 && ar.h === 5) {
      // Portrait: 1080×1350
      panelW = 1080;
      panelH = 1350;
    } else if (ar.w === 16 && ar.h === 9) {
      // Landscape: 1080×608
      panelW = 1080;
      panelH = 608;
    } else {
      // Fallback: calculate from aspect ratio
      const baseSize = 1080;
      if (ar.w >= ar.h) {
        panelW = baseSize;
        panelH = Math.round(baseSize * (ar.h / ar.w));
      } else {
        panelH = baseSize;
        panelW = Math.round(baseSize * (ar.w / ar.h));
      }
    }

    const totalWidth = panelW * cols;
    const totalHeight = panelH * rows;

    // Apply pixel dimensions to the on-screen canvas. The wrapper + fitToView will scale it to fit the UI.
    canvas.style.width = `${totalWidth}px`;
    canvas.style.height = `${totalHeight}px`;

    // Ensure slides (the single combined slide) match the canvas size
    this.slides.forEach(slide => {
      slide.style.width = `${totalWidth}px`;
      slide.style.height = `${totalHeight}px`;
    });
  }

  switchToSlide(index) {
    // Update navigation
    document.querySelectorAll('.ipc-slide-btn').forEach((btn, i) => {
      btn.classList.toggle('active', i === index);
    });
    
    // Update slides
    this.slides.forEach((slide, i) => {
      slide.classList.toggle('active', i === index);
    });
    
    this.currentSlide = index;
    
    // Clear selection when switching slides
    this.selectedImage = null;
    document.getElementById('imageProperties').style.display = 'none';
    document.querySelector('.ipc-no-selection').style.display = 'block';
  }

  setZoom(scale) {
    this.currentZoom = scale;
    this.applyCanvasTransform();
  }

  applyCanvasTransform() {
    const wrapper = document.getElementById('canvasWrapper');
    if (!wrapper) return;
    
    // Apply both pan offset and zoom using transform
    wrapper.style.transform = `translate(${this.panOffsetX}px, ${this.panOffsetY}px) scale(${this.currentZoom})`;
  }

  fitToView() {
    const container = document.querySelector('.ipc-canvas-container');
    const canvas = document.getElementById('mainCanvas');
    if (!container || !canvas) return;
    
    const containerRect = container.getBoundingClientRect();
    const canvasWidth = parseInt(canvas.style.width) || 1080;
    const canvasHeight = parseInt(canvas.style.height) || 1080;

    const scaleX = containerRect.width / canvasWidth;
    const scaleY = containerRect.height / canvasHeight;
    const scale = Math.min(scaleX, scaleY, 1) * 0.9; // 90% to leave some padding

    const zoomPercent = Math.round(scale * 100);
    document.getElementById('zoomSlider').value = zoomPercent;
    document.getElementById('zoomValue').textContent = `${zoomPercent}%`;
    
    // Reset pan offset when fitting to view
    this.panOffsetX = 0;
    this.panOffsetY = 0;
    this.setZoom(scale);
  }

  getMaxZIndex() {
    const images = document.querySelectorAll('.ipc-canvas-image');
    let maxZ = 0;
    images.forEach(img => {
      const z = parseInt(img.style.zIndex || 0);
      if (z > maxZ) maxZ = z;
    });
    return maxZ;
  }

  formatFileSize(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / 1048576).toFixed(1) + ' MB';
  }

  async exportSlides() {
    // Ensure any in-progress live scaling is committed before export
    if (this.liveScaleActive) {
      this.commitLiveScale();
    }
    
    // Force update canvas display before export to ensure dimensions are correct
    this.updateCanvasDisplay();
    
    const slideCount = this.panelCount || this.slides.length;
    const cols = this.canvasCols || 1;
    const rows = this.canvasRows || 1;
    
    // Use Instagram's recommended resolutions per aspect ratio (same logic as updateCanvasDisplay)
    const ar = this.panelAspect || { w: 1, h: 1 };
    let panelW, panelH;
    
    if (ar.w === 1 && ar.h === 1) {
      panelW = 1080;
      panelH = 1080;
    } else if (ar.w === 4 && ar.h === 5) {
      panelW = 1080;
      panelH = 1350;
    } else if (ar.w === 16 && ar.h === 9) {
      panelW = 1080;
      panelH = 608;
    } else {
      const baseSize = 1080;
      if (ar.w >= ar.h) {
        panelW = baseSize;
        panelH = Math.round(baseSize * (ar.h / ar.w));
      } else {
        panelH = baseSize;
        panelW = Math.round(baseSize * (ar.w / ar.h));
      }
    }
    
    console.log('[EXPORT] Aspect ratio:', ar, 'cols:', cols, 'rows:', rows);
    console.log('[EXPORT] Panel dimensions:', panelW, 'x', panelH);
    console.log('[EXPORT] Combined canvas will be:', panelW * cols, 'x', panelH * rows);
    
    // Verify on-screen canvas dimensions
    const onScreenCanvas = document.getElementById('mainCanvas');
    console.log('[EXPORT] On-screen canvas style:', onScreenCanvas.style.width, 'x', onScreenCanvas.style.height);
    
    // Create export modal
    const modal = document.createElement('div');
    modal.className = 'ipc-export-modal';
    modal.innerHTML = `
      <div class="ipc-export-content">
        <h3>Exporting Slides...</h3>
        <div class="ipc-export-progress">
          <div class="ipc-export-progress-bar" id="exportProgress"></div>
        </div>
        <p id="exportStatus">Preparing export...</p>
      </div>
    `;
    document.body.appendChild(modal);
    
    const progressBar = document.getElementById('exportProgress');
    const statusText = document.getElementById('exportStatus');
    
    try {
      // Ask user for save location
      const result = await window.electronAPI.selectDirectory();
      if (!result) {
        modal.remove();
        return;
      }
      
      // Render entire combined canvas exactly as shown on screen, then slice it
      statusText.textContent = `Exporting ${slideCount} panels...`;
      progressBar.style.width = `0%`;

      const combinedWidth = panelW * cols;
      const combinedHeight = panelH * rows;
      
      console.log('[EXPORT] Creating combined canvas:', combinedWidth, 'x', combinedHeight);

      // Render the combined slide (there is only one slide in this design)
      const slide = this.slides[0];
      const combinedCanvas = document.createElement('canvas');
      combinedCanvas.width = combinedWidth;
      combinedCanvas.height = combinedHeight;
      const combinedCtx = combinedCanvas.getContext('2d');

      // Render the entire canvas exactly as it appears on screen
      await this.renderSlideToCanvas(slide, combinedCanvas, combinedCtx);

      // Now cookie-cutter slice the combined canvas into individual panels
      let panelIndex = 0;
      for (let row = 0; row < rows; row++) {
        for (let col = 0; col < cols; col++) {
          panelIndex++;
          console.log(`[EXPORT] Panel ${panelIndex}: Slicing from (${col * panelW}, ${row * panelH}) size ${panelW}x${panelH}`);
          statusText.textContent = `Exporting panel ${panelIndex} of ${slideCount}...`;
          progressBar.style.width = `${(panelIndex / slideCount) * 100}%`;

          // Create a canvas for this panel slice
          const panelCanvas = document.createElement('canvas');
          panelCanvas.width = panelW;
          panelCanvas.height = panelH;
          const panelCtx = panelCanvas.getContext('2d');

          // Copy the exact pixels from the combined canvas
          panelCtx.drawImage(
            combinedCanvas,
            col * panelW,
            row * panelH,
            panelW,
            panelH,
            0,
            0,
            panelW,
            panelH
          );

          const blob = await new Promise(resolve => panelCanvas.toBlob(resolve, 'image/png'));
          const buffer = await blob.arrayBuffer();
          await window.electronAPI.saveImageBuffer({
            path: `${result}/slide_${panelIndex}.png`,
            buffer: buffer
          });
        }
      }
      
      statusText.textContent = 'Export complete!';
      setTimeout(() => modal.remove(), 1500);
      
    } catch (error) {
      console.error('Export failed:', error);
      statusText.textContent = 'Export failed!';
      setTimeout(() => modal.remove(), 2000);
    }
  }

  async renderSlideToCanvas(slide, canvas, ctx) {
    // Set background
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    // Calculate scale factor between on-screen canvas and export canvas
    const onScreenCanvas = document.getElementById('mainCanvas');
    const onScreenWidth = parseInt(onScreenCanvas.style.width) || canvas.width;
    const onScreenHeight = parseInt(onScreenCanvas.style.height) || canvas.height;
    const scaleX = canvas.width / onScreenWidth;
    const scaleY = canvas.height / onScreenHeight;
    
    console.log('[RENDER] On-screen canvas:', onScreenWidth, 'x', onScreenHeight);
    console.log('[RENDER] Export canvas:', canvas.width, 'x', canvas.height);
    console.log('[RENDER] Scale factors:', scaleX, 'x', scaleY);
    
    // Get all images in the slide sorted by z-index
    const images = Array.from(slide.querySelectorAll('.ipc-canvas-image'))
      .sort((a, b) => (parseInt(a.style.zIndex) || 0) - (parseInt(b.style.zIndex) || 0));
    
    for (const imgDiv of images) {
      const img = new Image();
      // Prefer full-resolution source from inner bitmap if available
      const inner = imgDiv.querySelector('img.ipc-canvas-bitmap');
      const inlineSrc = inner && (inner.dataset.fullSrc || inner.src);
      const fallbackSrc = imgDiv.dataset.fullSrc;
      let resolvedSrc = inlineSrc || fallbackSrc;

      if (!resolvedSrc) {
        const bg = imgDiv.style.backgroundImage;
        if (bg && bg.startsWith('url(')) {
          resolvedSrc = bg.slice(5, -2);
        }
      }

      if (!resolvedSrc) {
        console.warn('[RENDER] Missing image source for export, skipping element', imgDiv.dataset.imageId);
        continue;
      }

      img.src = resolvedSrc;

      await new Promise((resolve) => {
        img.onload = () => {
          ctx.save();

          // Apply transformations - scale positions/sizes to match export canvas
          const x = parseInt(imgDiv.style.left) * scaleX;
          const y = parseInt(imgDiv.style.top) * scaleY;
          const width = parseInt(imgDiv.style.width) * scaleX;
          const height = parseInt(imgDiv.style.height) * scaleY;
          const rotation = this.getRotationFromTransform(imgDiv.style.transform);
          const opacity = parseFloat(imgDiv.style.opacity || 1);
          const scaleFlipX = parseFloat(imgDiv.dataset.scaleX || 1);
          const scaleFlipY = parseFloat(imgDiv.dataset.scaleY || 1);

          ctx.globalAlpha = opacity;
          ctx.translate(x + width / 2, y + height / 2);
          ctx.rotate(rotation * Math.PI / 180);
          ctx.scale(scaleFlipX, scaleFlipY);

          // Apply crop if present (fractions)
          const cropTop = inner ? parseFloat(inner.dataset.cropTopPct || '0') : 0;
          const cropRight = inner ? parseFloat(inner.dataset.cropRightPct || '0') : 0;
          const cropBottom = inner ? parseFloat(inner.dataset.cropBottomPct || '0') : 0;
          const cropLeft = inner ? parseFloat(inner.dataset.cropLeftPct || '0') : 0;

          let sx = 0;
          let sy = 0;
          let sWidth = img.naturalWidth;
          let sHeight = img.naturalHeight;

          if (cropTop || cropRight || cropBottom || cropLeft) {
            sx = Math.floor(img.naturalWidth * cropLeft);
            sy = Math.floor(img.naturalHeight * cropTop);
            sWidth = Math.floor(img.naturalWidth * (1 - cropLeft - cropRight));
            sHeight = Math.floor(img.naturalHeight * (1 - cropTop - cropBottom));
          }

          if (sWidth <= 0 || sHeight <= 0) {
            ctx.restore();
            resolve();
            return;
          }

          const computedFit = inner && typeof window !== 'undefined' ? window.getComputedStyle(inner).objectFit : '';
          const fit = (imgDiv.dataset.objectFit || (inner ? inner.style.objectFit : '') || computedFit || 'fill').toLowerCase();
          const targetWidth = width;
          const targetHeight = height;
          let destWidth = targetWidth;
          let destHeight = targetHeight;
          let offsetX = -targetWidth / 2;
          let offsetY = -targetHeight / 2;

          if ((fit === 'contain' || fit === 'cover') && sWidth > 0 && sHeight > 0) {
            const scaleFactor = fit === 'contain'
              ? Math.min(targetWidth / sWidth, targetHeight / sHeight)
              : Math.max(targetWidth / sWidth, targetHeight / sHeight);

            if (Number.isFinite(scaleFactor) && scaleFactor > 0) {
              destWidth = sWidth * scaleFactor;
              destHeight = sHeight * scaleFactor;
              offsetX = -destWidth / 2;
              offsetY = -destHeight / 2;

              if (fit === 'contain') {
                offsetX = -targetWidth / 2 + (targetWidth - destWidth) / 2;
                offsetY = -targetHeight / 2 + (targetHeight - destHeight) / 2;
              }
            }
          } else if (fit === 'none') {
            destWidth = sWidth;
            destHeight = sHeight;
            offsetX = -targetWidth / 2;
            offsetY = -targetHeight / 2;
          }

          ctx.drawImage(img, sx, sy, sWidth, sHeight, offsetX, offsetY, destWidth, destHeight);
          ctx.restore();

          resolve();
        };
      });
    }
  }
}

// Initialize the tool
if (typeof module !== 'undefined' && module.exports) {
  module.exports = InstagramPostCreator;
}