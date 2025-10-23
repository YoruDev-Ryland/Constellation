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
    this.panelConfig = {
      1: { rows: 1, cols: 1 },
      2: { rows: 1, cols: 2 },
      3: { rows: 1, cols: 3 },
      4: { rows: 2, cols: 2 },
      5: { rows: 2, cols: 3 },
      6: { rows: 2, cols: 3 },
      7: { rows: 3, cols: 3 },
      8: { rows: 3, cols: 3 },
      9: { rows: 3, cols: 3 },
      10: { rows: 2, cols: 5 }
    };
    
    this.init();
  }

  init() {
    this.container.innerHTML = this.createHTML();
    this.setupEventListeners();
    this.initializeSlides(1);
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
                <option value="1:1">Square (1:1)</option>
                <option value="4:5">Portrait (4:5)</option>
                <option value="16:9">Landscape (16:9)</option>
              </select>
            </div>
            
            <div class="ipc-control-group">
              <label>Canvas Size</label>
              <select id="canvasSize" class="ipc-select">
                <option value="1080">1080×1080</option>
                <option value="1350">1350×1350</option>
                <option value="2160">2160×2160</option>
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
          <!-- Left Panel - Image Library -->
          <div class="ipc-panel ipc-panel-left">
            <div class="ipc-panel-header">
              <h3>Images</h3>
              <button id="addImagesBtn" class="ipc-btn-icon" title="Add Images">
                <i class="fas fa-plus"></i>
              </button>
            </div>
            
            <div class="ipc-image-library" id="imageLibrary">
              <div class="ipc-drop-zone" id="dropZone">
                <i class="fas fa-cloud-upload-alt"></i>
                <p>Drop images here</p>
                <span>or click the + button to browse</span>
                <input type="file" id="fileInput" multiple accept="image/*" style="display: none;">
              </div>
            </div>
            
            <div class="ipc-image-list" id="imageList"></div>
          </div>

          <!-- Center - Canvas Area -->
          <div class="ipc-panel ipc-panel-center">
            <!-- Slide Navigation -->
            <div class="ipc-slide-nav" id="slideNav"></div>
            
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
              </div>
            </div>
          </div>

          <!-- Right Panel - Properties -->
          <div class="ipc-panel ipc-panel-right">
            <div class="ipc-panel-header">
              <h3>Properties</h3>
            </div>
            
            <div class="ipc-properties" id="properties">
              <div class="ipc-no-selection">
                <i class="fas fa-mouse-pointer"></i>
                <p>Select an image to edit properties</p>
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
                    <button class="ipc-btn-icon" id="lockAspectBtn" title="Lock Aspect Ratio">
                      <i class="fas fa-link"></i>
                    </button>
                  </div>
                </div>
                
                <div class="ipc-property-group">
                  <label>Rotation</label>
                  <div class="ipc-property-row">
                    <input type="range" id="rotation" min="0" max="360" value="0" class="ipc-slider">
                    <input type="number" id="rotationValue" class="ipc-number-input" value="0" min="0" max="360">
                    <span>°</span>
                  </div>
                </div>
                
                <div class="ipc-property-group">
                  <label>Opacity</label>
                  <div class="ipc-property-row">
                    <input type="range" id="opacity" min="0" max="100" value="100" class="ipc-slider">
                    <input type="number" id="opacityValue" class="ipc-number-input" value="100" min="0" max="100">
                    <span>%</span>
                  </div>
                </div>
                
                <div class="ipc-property-divider"></div>
                
                <div class="ipc-property-group">
                  <label>Layer Order</label>
                  <div class="ipc-button-row">
                    <button class="ipc-btn ipc-btn-secondary" id="bringToFrontBtn">
                      <i class="fas fa-layer-group"></i> To Front
                    </button>
                    <button class="ipc-btn ipc-btn-secondary" id="sendToBackBtn">
                      <i class="fas fa-layer-group"></i> To Back
                    </button>
                  </div>
                </div>
                
                <div class="ipc-property-group">
                  <label>Quick Actions</label>
                  <div class="ipc-button-row">
                    <button class="ipc-btn ipc-btn-secondary" id="flipHorizontalBtn">
                      <i class="fas fa-arrows-alt-h"></i> Flip H
                    </button>
                    <button class="ipc-btn ipc-btn-secondary" id="flipVerticalBtn">
                      <i class="fas fa-arrows-alt-v"></i> Flip V
                    </button>
                  </div>
                  <div class="ipc-button-row">
                    <button class="ipc-btn ipc-btn-secondary" id="resetTransformBtn">
                      <i class="fas fa-undo"></i> Reset
                    </button>
                    <button class="ipc-btn ipc-btn-danger" id="deleteImageBtn">
                      <i class="fas fa-trash"></i> Delete
                    </button>
                  </div>
                </div>
              </div>
            </div>
            
            <!-- Grid Overlay Toggle -->
            <div class="ipc-panel-footer">
              <label class="ipc-toggle">
                <input type="checkbox" id="gridToggle">
                <span>Show Grid</span>
              </label>
              <label class="ipc-toggle">
                <input type="checkbox" id="snapToggle">
                <span>Snap to Grid</span>
              </label>
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
    
    // Export
    document.getElementById('exportBtn').addEventListener('click', () => this.exportSlides());
    
    // Properties panel
    this.setupPropertiesPanel();

    // Update display when canvas size selection changes
    document.getElementById('canvasSize').addEventListener('change', () => this.updateCanvasDisplay());
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
      this.setZoom(1);
    });
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
  }

  handleFileSelect(files, addToCanvas = false) {
    Array.from(files).forEach(file => {
      if (file.type.startsWith('image/')) {
        const reader = new FileReader();
        reader.onload = (e) => {
          const imageData = {
            id: Date.now() + Math.random(),
            src: e.target.result,
            name: file.name,
            size: this.formatFileSize(file.size)
          };
          
          this.images.push(imageData);
          this.addImageToLibrary(imageData);
          
          if (addToCanvas && this.slides[this.currentSlide]) {
            this.addImageToCanvas(imageData, this.slides[this.currentSlide]);
          }
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
      <img src="${imageData.src}" alt="${imageData.name}">
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
    const img = document.createElement('div');
    img.className = 'ipc-canvas-image';
    img.dataset.imageId = imageData.id;
    img.dataset.scaleX = '1';
    img.dataset.scaleY = '1';
    img.style.backgroundImage = `url(${imageData.src})`;
    img.style.width = '200px';
    img.style.height = '200px';
    img.style.left = '50px';
    img.style.top = '50px';
    img.style.zIndex = this.getMaxZIndex() + 1;
    
    // Add resize handles
    const handles = ['nw', 'ne', 'sw', 'se'];
    handles.forEach(position => {
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
  }

  setupImageInteractions(img) {
    // Selection
    img.addEventListener('mousedown', (e) => {
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
        e.stopPropagation();
        this.startResizing(e, img, handle.dataset.position);
      });
    });
    
    // Rotation handle
    const rotateHandle = img.querySelector('.ipc-rotate-handle');
    if (rotateHandle) {
      rotateHandle.addEventListener('mousedown', (e) => {
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
    document.getElementById('imageProperties').style.display = 'block';
    document.querySelector('.ipc-no-selection').style.display = 'none';
  }

  updatePropertiesPanel(img) {
    const rect = img.getBoundingClientRect();
    const parentRect = img.parentElement.getBoundingClientRect();
    
    document.getElementById('posX').value = parseInt(img.style.left);
    document.getElementById('posY').value = parseInt(img.style.top);
    document.getElementById('width').value = parseInt(img.style.width);
    document.getElementById('height').value = parseInt(img.style.height);
    
    const rotation = this.getRotationFromTransform(img.style.transform);
    document.getElementById('rotation').value = rotation;
    document.getElementById('rotationValue').value = rotation;
    
    const opacity = img.style.opacity ? parseFloat(img.style.opacity) * 100 : 100;
    document.getElementById('opacity').value = opacity;
    document.getElementById('opacityValue').value = opacity;
  }

  getRotationFromTransform(transform) {
    if (!transform || transform === 'none') return 0;
    const match = transform.match(/rotate\((-?\d+)deg\)/);
    return match ? parseInt(match[1]) : 0;
  }

  updateImageTransform() {
    if (!this.selectedImage) return;
    
    const rotation = document.getElementById('rotation').value;
    const scaleX = this.selectedImage.dataset.scaleX || '1';
    const scaleY = this.selectedImage.dataset.scaleY || '1';
    
    this.selectedImage.style.transform = `rotate(${rotation}deg) scaleX(${scaleX}) scaleY(${scaleY})`;
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
    this.isResizing = true;
    const startX = e.clientX;
    const startY = e.clientY;
    const startWidth = parseInt(img.style.width);
    const startHeight = parseInt(img.style.height);
    const startLeft = parseInt(img.style.left);
    const startTop = parseInt(img.style.top);
    
    const mouseMoveHandler = (e) => {
      if (!this.isResizing) return;
      
      const deltaX = e.clientX - startX;
      const deltaY = e.clientY - startY;
      
      let newWidth = startWidth;
      let newHeight = startHeight;
      let newLeft = startLeft;
      let newTop = startTop;
      
      switch(position) {
        case 'se':
          newWidth = startWidth + deltaX;
          newHeight = startHeight + deltaY;
          break;
        case 'sw':
          newWidth = startWidth - deltaX;
          newHeight = startHeight + deltaY;
          newLeft = startLeft + deltaX;
          break;
        case 'ne':
          newWidth = startWidth + deltaX;
          newHeight = startHeight - deltaY;
          newTop = startTop + deltaY;
          break;
        case 'nw':
          newWidth = startWidth - deltaX;
          newHeight = startHeight - deltaY;
          newLeft = startLeft + deltaX;
          newTop = startTop + deltaY;
          break;
      }
      
      if (newWidth > 50) {
        img.style.width = `${newWidth}px`;
        img.style.left = `${newLeft}px`;
        document.getElementById('width').value = newWidth;
        document.getElementById('posX').value = newLeft;
      }
      
      if (newHeight > 50) {
        img.style.height = `${newHeight}px`;
        img.style.top = `${newTop}px`;
        document.getElementById('height').value = newHeight;
        document.getElementById('posY').value = newTop;
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
    const slideNav = document.getElementById('slideNav');

  // Preserve existing images if any
  const existingImages = Array.from(canvas.querySelectorAll('.ipc-canvas-image'));

  // Clear existing slides (we'll use a single combined slide)
  canvas.innerHTML = '';
  slideNav.innerHTML = '';
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
  }

  updateCanvasDisplay() {
    const canvas = document.getElementById('mainCanvas');
    if (!canvas) return;

    // Determine per-panel base size from the canvasSize selector (this represents single-panel size)
    const baseSize = parseInt(document.getElementById('canvasSize').value) || 1080;
    const cols = this.canvasCols || 1;
    const rows = this.canvasRows || 1;

    const totalWidth = baseSize * cols;
    const totalHeight = baseSize * rows;

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
    const canvas = document.getElementById('mainCanvas');
    canvas.style.transform = `scale(${scale})`;
  }

  fitToView() {
    const wrapper = document.getElementById('canvasWrapper');
    const canvas = document.getElementById('mainCanvas');
    const wrapperRect = wrapper.getBoundingClientRect();
    const singlePanelSize = parseInt(document.getElementById('canvasSize').value) || 1080;
    const cols = this.canvasCols || 1;
    const rows = this.canvasRows || 1;

    const canvasWidth = singlePanelSize * cols;
    const canvasHeight = singlePanelSize * rows;

    const scaleX = wrapperRect.width / canvasWidth;
    const scaleY = wrapperRect.height / canvasHeight;
    const scale = Math.min(scaleX, scaleY, 1) * 0.9; // 90% to leave some padding

    const zoomPercent = Math.round(scale * 100);
    document.getElementById('zoomSlider').value = zoomPercent;
    document.getElementById('zoomValue').textContent = `${zoomPercent}%`;
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
    const { ipcRenderer } = require('electron');
    const slideCount = this.panelCount || this.slides.length;
    const singlePanelSize = parseInt(document.getElementById('canvasSize').value);
    const cols = this.canvasCols || 1;
    const rows = this.canvasRows || 1;
    const canvasSize = singlePanelSize * Math.max(cols, 1); // combined canvas width/height basis (we'll use square base per panel)
    
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
      const result = await ipcRenderer.invoke('select-directory');
      if (!result) {
        modal.remove();
        return;
      }
      
      // For multi-panel exports we render a single combined canvas sized to (singlePanelSize * cols) x (singlePanelSize * rows)
      statusText.textContent = `Exporting ${slideCount} panels...`;
      progressBar.style.width = `0%`;

      const combinedWidth = singlePanelSize * cols;
      const combinedHeight = singlePanelSize * rows;

      // Render the combined slide (there is only one slide in this design)
      const slide = this.slides[0];
      const canvas = document.createElement('canvas');
      canvas.width = combinedWidth;
      canvas.height = combinedHeight;
      const ctx = canvas.getContext('2d');

      await this.renderSlideToCanvas(slide, canvas, ctx);

      // Export panels by cropping the combined canvas
      let panelIndex = 0;
      for (let row = 0; row < rows; row++) {
        for (let col = 0; col < cols; col++) {
          panelIndex++;
          statusText.textContent = `Exporting panel ${panelIndex} of ${slideCount}...`;
          progressBar.style.width = `${(panelIndex / slideCount) * 100}%`;

          const panelCanvas = document.createElement('canvas');
          panelCanvas.width = singlePanelSize;
          panelCanvas.height = singlePanelSize;
          const panelCtx = panelCanvas.getContext('2d');

          panelCtx.drawImage(
            canvas,
            col * singlePanelSize,
            row * singlePanelSize,
            singlePanelSize,
            singlePanelSize,
            0,
            0,
            singlePanelSize,
            singlePanelSize
          );

          const blob = await new Promise(resolve => panelCanvas.toBlob(resolve, 'image/png'));
          const buffer = await blob.arrayBuffer();
          await ipcRenderer.invoke('save-image', {
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
    
    // Get all images in the slide sorted by z-index
    const images = Array.from(slide.querySelectorAll('.ipc-canvas-image'))
      .sort((a, b) => (parseInt(a.style.zIndex) || 0) - (parseInt(b.style.zIndex) || 0));
    
    for (const imgDiv of images) {
      const img = new Image();
      img.src = imgDiv.style.backgroundImage.slice(5, -2); // Remove url(" and ")
      
      await new Promise((resolve) => {
        img.onload = () => {
          ctx.save();
          
          // Apply transformations
          const x = parseInt(imgDiv.style.left);
          const y = parseInt(imgDiv.style.top);
          const width = parseInt(imgDiv.style.width);
          const height = parseInt(imgDiv.style.height);
          const rotation = this.getRotationFromTransform(imgDiv.style.transform);
          const opacity = parseFloat(imgDiv.style.opacity || 1);
          const scaleX = parseFloat(imgDiv.dataset.scaleX || 1);
          const scaleY = parseFloat(imgDiv.dataset.scaleY || 1);
          
          ctx.globalAlpha = opacity;
          ctx.translate(x + width / 2, y + height / 2);
          ctx.rotate(rotation * Math.PI / 180);
          ctx.scale(scaleX, scaleY);
          
          ctx.drawImage(img, -width / 2, -height / 2, width, height);
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