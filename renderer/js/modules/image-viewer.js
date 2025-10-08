// Reusable ImageViewer module
// Provides a simple modal viewer with mouse-centered zoom and panning.
class ImageViewer {
  constructor() {
    this._buildDOM();
    this.state = { scale: 1, originX: 0, originY: 0, isPanning: false, startX:0, startY:0 };
    this.debug = true; // toggle verbose logging
  }

  _buildDOM() {
    if (document.getElementById('imageViewerModal')) return;
    const modal = document.createElement('div');
    modal.id = 'imageViewerModal';
    modal.className = 'image-viewer-modal';
    modal.innerHTML = `
      <div class="iv-content">
        <button class="iv-close" aria-label="Close">×</button>
        <div class="iv-toolbar">
          <button class="iv-btn iv-zoom-out">−</button>
          <button class="iv-btn iv-reset">Reset</button>
          <button class="iv-btn iv-zoom-in">+</button>
        </div>
        <div class="iv-stage">
          <img class="iv-image" src="" draggable="false">
        </div>
      </div>`;
    
    // Insert into the main app container to keep it within the application window
    const appContainer = document.querySelector('.app-container') || document.body;
    appContainer.appendChild(modal);

    // Try to position the modal below any custom titlebar if present
    const titlebar = document.querySelector('.titlebar');
    if (titlebar) {
      const h = titlebar.offsetHeight || 32;
      modal.style.top = `${h}px`;
    }

    this.modal = modal;
    this.imgEl = modal.querySelector('.iv-image');
    this.stage = modal.querySelector('.iv-stage');
    
    // Close handlers
    modal.querySelector('.iv-close').addEventListener('click', () => this.hide());
    
    // Click outside to close (click on the modal background, not the content)
    modal.addEventListener('click', (e) => {
      if (e.target === modal) this.hide();
    });
    
    // Toolbar controls
    modal.querySelector('.iv-zoom-in').addEventListener('click', () => {
      const pt = { x: this.stage.clientWidth / 2, y: this.stage.clientHeight / 2 };
      this._zoomBy(1.2, pt);
    });
    modal.querySelector('.iv-zoom-out').addEventListener('click', () => {
      const pt = { x: this.stage.clientWidth / 2, y: this.stage.clientHeight / 2 };
      this._zoomBy(1 / 1.2, pt);
    });
  modal.querySelector('.iv-reset').addEventListener('click', () => this._resetToFit());

    // Wheel zoom (mouse-centered)
    this.stage.addEventListener('wheel', (e) => {
      if (!this.imgEl.src) return;
      e.preventDefault();
      const delta = e.deltaY > 0 ? 1/1.15 : 1.15;
      // Use offsetX/offsetY for stage-local coordinates
      const pt = { x: e.offsetX, y: e.offsetY };
      if (this.debug) console.debug('[IV] wheel', { offsetX: e.offsetX, offsetY: e.offsetY, deltaY: e.deltaY, stageSize: { w: this.stage.clientWidth, h: this.stage.clientHeight }, state: { ...this.state } });
      this._zoomBy(delta, pt);
    }, { passive: false });

    // Panning
    this.stage.addEventListener('mousedown', (e) => {
      if (!this.imgEl.src) return;
      e.preventDefault();
      this.state.isPanning = true;
      this.state.startX = e.clientX;
      this.state.startY = e.clientY;
      this.stage.classList.add('grabbing');
    });
    window.addEventListener('mousemove', (e) => {
      if (!this.state.isPanning) return;
      e.preventDefault();
      const dx = e.clientX - this.state.startX;
      const dy = e.clientY - this.state.startY;
      this.state.startX = e.clientX;
      this.state.startY = e.clientY;
      this.state.originX += dx;
      this.state.originY += dy;
      this._applyTransform();
    });
    window.addEventListener('mouseup', () => {
      if (!this.state.isPanning) return;
      this.state.isPanning = false;
      this.stage.classList.remove('grabbing');
    });

    // Double click to reset/zoom
    this.stage.addEventListener('dblclick', (e) => {
      const pt = { x: e.offsetX, y: e.offsetY };
      if (this.debug) console.debug('[IV] dblclick', { offsetX: e.offsetX, offsetY: e.offsetY, state: { ...this.state } });
      if (this.state.scale > 1) this._fitToStage(); else this._zoomBy(2, pt);
    });
  }

  async show(src) {
    if (!src) return;
    // Make viewer visible first so stage has real dimensions
    this.modal.classList.add('visible');
    document.body.style.overflow = 'hidden';
    // Reset any previous transform immediately
    this._reset();
    // Allow layout to settle this frame
    await new Promise((res) => requestAnimationFrame(res));

    // Set source and wait for decode
    this.imgEl.src = src;
    if (this.debug) console.debug('[IV] show -> set src', { src });
    try {
      if (this.imgEl.decode) {
        await this.imgEl.decode();
      } else {
        await new Promise((res) => {
          if (this.imgEl.complete && this.imgEl.naturalWidth) res();
          else this.imgEl.onload = () => res();
        });
      }
    } catch (_) {
      // Ignore decode errors and continue with a best-effort fit
    }
    // Wait a frame for image metrics to propagate to layout
    await new Promise((res) => requestAnimationFrame(res));
    if (this.debug) console.debug('[IV] before _fitToStage', { stage: { w: this.stage.clientWidth, h: this.stage.clientHeight }, nat: { w: this.imgEl.naturalWidth, h: this.imgEl.naturalHeight } });
    this._fitToStage();
  }

  hide() {
    this.modal.classList.remove('visible');
    this.imgEl.src = '';
    
    // Restore body scrolling
    document.body.style.overflow = '';
  }

  _reset() {
    this.state.scale = 1;
    this.state.originX = 0;
    this.state.originY = 0;
    this._applyTransform();
  }

  _fitToStage() {
    const img = this.imgEl;
    const stage = this.stage;
    if (!img.naturalWidth) return;
    const wScale = stage.clientWidth / img.naturalWidth;
    const hScale = stage.clientHeight / img.naturalHeight;
    const fitScale = Math.min(wScale, hScale, 1);
    this.state.scale = fitScale;
    this.state.originX = (stage.clientWidth - img.naturalWidth * fitScale) / 2;
    this.state.originY = (stage.clientHeight - img.naturalHeight * fitScale) / 2;
    if (this.debug) console.debug('[IV] _fitToStage', { wScale, hScale, fitScale, originX: this.state.originX, originY: this.state.originY, stage: { w: stage.clientWidth, h: stage.clientHeight }, img: { w: img.naturalWidth, h: img.naturalHeight } });
    this._applyTransform();
  }

  _zoomBy(factor, point) {
    const prevScale = this.state.scale;
    const newScale = Math.max(0.1, Math.min(32, prevScale * factor));
    // Convert point to image coordinates and adjust origin so zoom is centered on point
    const img = this.imgEl;
    const sx = (point.x - this.state.originX) / prevScale;
    const sy = (point.y - this.state.originY) / prevScale;
    this.state.scale = newScale;
    this.state.originX = point.x - sx * newScale;
    this.state.originY = point.y - sy * newScale;
    if (this.debug) console.debug('[IV] _zoomBy', { factor, point, prevScale, newScale, sx, sy, originX: this.state.originX, originY: this.state.originY });
    this._applyTransform();
  }

  _applyTransform() {
    const t = `translate(${this.state.originX}px, ${this.state.originY}px) scale(${this.state.scale})`;
    this.imgEl.style.transform = t;
    if (this.debug) console.debug('[IV] _applyTransform', { transform: t });
  }

  _resetToFit() {
    // If image metrics are available, fit now; otherwise fit after load
    if (this.imgEl.naturalWidth) {
      if (this.debug) console.debug('[IV] _resetToFit immediate');
      this._fitToStage();
    } else {
      if (this.debug) console.debug('[IV] _resetToFit deferred until onload');
      this.imgEl.onload = () => this._fitToStage();
    }
  }
}

// Expose singleton
window.ImageViewer = window.ImageViewer || new ImageViewer();
