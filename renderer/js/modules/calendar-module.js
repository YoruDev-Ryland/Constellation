class CalendarModule {
  constructor() {
    this.monthAnchor = new Date();
    this.disableImages = false;
    this.imagesByDate = {}; // yyyy-mm-dd -> path
    this.loadedImages = new Set(); // Track which images are loaded
    this.loadingImages = new Set(); // Track which images are currently loading
    this.intersectionObserver = null;
    this.currentMonthImages = new Map(); // Only cache current month's images
    this.initialized = false;
    this.currentMonthKey = null;
    this.loadingQueue = []; // Queue for managing concurrent image loads
    this.maxConcurrentLoads = 3; // Limit concurrent image loading
    this.currentlyLoading = 0;
    // Thumbnail settings
    this.thumbnailSize = 512; // Max dimension for calendar thumbnails
    this.thumbnailQuality = 0.7; // JPEG quality (0-1)
  }

  async init() {
    if (this.initialized) return;
    this.initialized = true;
    this._wireNav();
    this._setupIntersectionObserver();
    await this._loadImages();
    this.render();
  }

  _wireNav() {
    document.getElementById('prevMonth')?.addEventListener('click', async () => {
      this.monthAnchor.setMonth(this.monthAnchor.getMonth() - 1);
      await this._handleMonthChange();
    });
    document.getElementById('nextMonth')?.addEventListener('click', async () => {
      this.monthAnchor.setMonth(this.monthAnchor.getMonth() + 1);
      await this._handleMonthChange();
    });
  }

  async _handleMonthChange() {
    // Clear current month images when switching
    this._clearCurrentMonthImages();
    this.render();
    // No preloading - only load current month images as needed
  }

  _setupIntersectionObserver() {
    if (!('IntersectionObserver' in window)) {
      console.warn('IntersectionObserver not supported, falling back to immediate loading');
      return;
    }

    this.intersectionObserver = new IntersectionObserver((entries) => {
      // Batch process entries to avoid multiple DOM updates
      const entriesToProcess = entries.filter(entry => entry.isIntersecting);
      
      if (entriesToProcess.length === 0) return;
      
      // Use requestIdleCallback to avoid blocking during mouse movement
      const processEntries = () => {
        entriesToProcess.forEach(entry => {
          const dayElement = entry.target;
          const date = dayElement.getAttribute('data-date');
          if (date && this.imagesByDate[date] && !this.loadedImages.has(date)) {
            this._loadImageForDate(dayElement, date);
            // Stop observing once we've started loading
            this.intersectionObserver.unobserve(dayElement);
          }
        });
      };

      if ('requestIdleCallback' in window) {
        requestIdleCallback(processEntries, { timeout: 100 });
      } else {
        setTimeout(processEntries, 0);
      }
    }, {
      root: document.getElementById('calendar'),
      rootMargin: '50px', // Start loading 50px before element is visible
      threshold: 0.1
    });
  }

  async _loadImages(forceRefresh = false) {
    if (this.disableImages) return;
    try {
      const settings = await window.electronAPI.getSettings();
      if (!settings?.storagePath) {
        console.warn('[Calendar] No storage path configured');
        return;
      }
      const resp = await window.electronAPI.getCalendarImages(settings.storagePath, forceRefresh);
      if (resp?.success) {
        this.imagesByDate = resp.images || {};
        console.log(`[Calendar] Loaded ${Object.keys(this.imagesByDate).length} image mappings${resp.fromCache ? ' (cached)' : ' (fresh scan)'}`);
      }
    } catch (e) {
      console.warn('[Calendar] Failed to load images', e);
    }
  }

  async _loadImageForDate(dayElement, date) {
    if (this.loadingImages.has(date) || this.loadedImages.has(date)) return;
    
    const imagePath = this.imagesByDate[date];
    if (!imagePath) return;

    // Check current month cache first
    if (this.currentMonthImages.has(imagePath)) {
      this._applyImageToElement(dayElement, this.currentMonthImages.get(imagePath));
      this.loadedImages.add(date);
      return;
    }

    // Add to queue if we're at max concurrent loads
    if (this.currentlyLoading >= this.maxConcurrentLoads) {
      this.loadingQueue.push({ dayElement, date, imagePath });
      return;
    }

    this._loadImageFromQueue({ dayElement, date, imagePath });
  }

  async _createThumbnail(imagePath, originalImage) {
    return new Promise((resolve) => {
      try {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        
        // Calculate dimensions maintaining aspect ratio
        const { width: originalWidth, height: originalHeight } = originalImage;
        const maxSize = this.thumbnailSize;
        
        let { width, height } = originalImage;
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
        
        canvas.width = width;
        canvas.height = height;
        
        // Enable image smoothing for better quality
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        
        // Draw the resized image
        ctx.drawImage(originalImage, 0, 0, width, height);
        
        // Convert to data URL for CSS usage
        const thumbnailDataUrl = canvas.toDataURL('image/jpeg', this.thumbnailQuality);
        const cssUrl = `url('${thumbnailDataUrl}')`;
        
        // Cache in current month images only
        this.currentMonthImages.set(imagePath, cssUrl);
        
        // Clean up canvas
        canvas.width = 0;
        canvas.height = 0;
        
        resolve(cssUrl);
      } catch (error) {
        console.warn('[Calendar] Failed to create thumbnail:', error);
        // Fallback to original image URL
        const fallbackUrl = `url('file://${imagePath.replace(/'/g, "%27")}')`;
        resolve(fallbackUrl);
      }
    });
  }

  async _loadImageFromQueue({ dayElement, date, imagePath, isPreload = false }) {
    this.loadingImages.add(date);
    this.currentlyLoading++;

    try {
      const loadImage = () => {
        return new Promise((resolve, reject) => {
          const img = new Image();
          img.onload = async () => {
            try {
              // Create a thumbnail for calendar use
              const thumbnailUrl = await this._createThumbnail(imagePath, img);
              
              // Only apply to element if it's not a preload and element exists
              if (!isPreload && dayElement) {
                this._applyImageToElement(dayElement, thumbnailUrl);
              }
              this.loadedImages.add(date);
              resolve();
            } catch (error) {
              console.warn('[Calendar] Failed to process image:', error);
              // Fallback to original URL
              const fallbackUrl = `url('file://${imagePath.replace(/'/g, "%27")}')`;
              this.currentMonthImages.set(imagePath, fallbackUrl);
              if (!isPreload && dayElement) {
                this._applyImageToElement(dayElement, fallbackUrl);
              }
              this.loadedImages.add(date);
              resolve();
            }
          };
          img.onerror = () => {
            if (!isPreload) {
              console.warn(`[Calendar] Failed to load image for ${date}: ${imagePath}`);
            }
            reject();
          };
          img.src = `file://${imagePath}`;
        });
      };

      if ('requestIdleCallback' in window) {
        await new Promise(resolve => {
          requestIdleCallback(async () => {
            try {
              await loadImage();
            } catch (e) {
              // Ignore load errors
            }
            resolve();
          }, { timeout: 1000 });
        });
      } else {
        await loadImage();
      }
    } catch (e) {
      if (!isPreload) {
        console.warn(`[Calendar] Error loading image for ${date}:`, e);
      }
    } finally {
      this.loadingImages.delete(date);
      this.currentlyLoading--;
      
      // Process next item in queue
      if (this.loadingQueue.length > 0 && this.currentlyLoading < this.maxConcurrentLoads) {
        const next = this.loadingQueue.shift();
        this._loadImageFromQueue(next);
      }
    }
  }

  _applyImageToElement(dayElement, imageUrl) {
    if (!dayElement) return;
    
    // Use requestAnimationFrame for smooth DOM updates
    requestAnimationFrame(() => {
      // Batch all style changes to minimize reflows
      dayElement.style.cssText += `
        background-image: ${imageUrl};
        background-size: cover;
        background-position: center;
        background-repeat: no-repeat;
        will-change: border-color;
      `;
      dayElement.classList.add('day-with-photo', 'has-image');
    });
  }

  _clearCurrentMonthImages() {
    // Clear all current month data when switching months
    this.currentMonthImages.clear();
    this.loadedImages.clear();
    this.loadingImages.clear();
    this.loadingQueue = [];
    this.currentlyLoading = 0;
    console.log('[Calendar] Cleared images for month change');
  }

  async refreshImages() {
    console.log('[Calendar] Forcing image refresh...');
    this.imagesByDate = {};
    this._clearCurrentMonthImages();
    await this._loadImages(true); // Force refresh
    this.render();
  }

  render() {
    const root = document.getElementById('calendar');
    const label = document.getElementById('currentMonth');
    if (!root || !label) return;
    
    const year = this.monthAnchor.getFullYear();
    const month = this.monthAnchor.getMonth();
    const monthKey = `${year}-${String(month + 1).padStart(2, '0')}`;
    
    // Skip re-render if same month
    if (this.currentMonthKey === monthKey) return;
    this.currentMonthKey = monthKey;
    
    // Clear previous intersection observer
    if (this.intersectionObserver) {
      this.intersectionObserver.disconnect();
    }
    
    // Clear loading queue for old month
    this.loadingQueue = [];
    this.currentlyLoading = 0;
    
    const monthNames = ['January','February','March','April','May','June','July','August','September','October','November','December'];
    label.textContent = `${monthNames[month]} ${year}`;
    
    const first = new Date(year, month, 1);
    const last = new Date(year, month + 1, 0);
    const blanks = first.getDay();
    const todayStr = new Date().toISOString().split('T')[0];
    
    // Use documentFragment for better performance
    const fragment = document.createDocumentFragment();
    const gridDiv = document.createElement('div');
    gridDiv.className = 'calendar-grid';
    
    // Create weekdays
    const weekdaysDiv = document.createElement('div');
    weekdaysDiv.className = 'calendar-weekdays';
    ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].forEach(d => {
      const weekdayDiv = document.createElement('div');
      weekdayDiv.className = 'weekday';
      weekdayDiv.textContent = d;
      weekdaysDiv.appendChild(weekdayDiv);
    });
    gridDiv.appendChild(weekdaysDiv);
    
    // Create calendar days
    const daysDiv = document.createElement('div');
    daysDiv.className = 'calendar-days';
    
    // Add invisible spacer cells
    for (let i = 0; i < blanks; i++) {
      const spacerDiv = document.createElement('div');
      spacerDiv.className = 'calendar-spacer';
      daysDiv.appendChild(spacerDiv);
    }
    
    // Add days of the month
    for (let d = 1; d <= last.getDate(); d++) {
      const dateObj = new Date(year, month, d);
      const dateStr = dateObj.toISOString().split('T')[0];
      const isToday = dateStr === todayStr;
      const hasImage = this.imagesByDate[dateStr] ? ' has-scheduled-image' : '';
      
      const dayDiv = document.createElement('div');
      dayDiv.className = `calendar-day${isToday ? ' today' : ''}${hasImage}`;
      dayDiv.setAttribute('data-date', dateStr);
      
      const numberDiv = document.createElement('div');
      numberDiv.className = 'day-number';
      numberDiv.textContent = d;
      dayDiv.appendChild(numberDiv);
      
      const dotDiv = document.createElement('div');
      dotDiv.className = 'day-dot';
      dotDiv.style.display = 'none';
      dayDiv.appendChild(dotDiv);
      
      daysDiv.appendChild(dayDiv);
    }
    
    gridDiv.appendChild(daysDiv);
    fragment.appendChild(gridDiv);
    
    // Replace content in one operation
    root.innerHTML = '';
    root.appendChild(fragment);
    
    this._setupIntersectionObserver();
    this._observeCalendarDays();
  }

  _observeCalendarDays() {
    if (!this.intersectionObserver) {
      // Fallback: load all images immediately if no IntersectionObserver
      this._applyAllImages();
      return;
    }

    // Observe all calendar day elements
    const dayElements = document.querySelectorAll('#calendar .calendar-day[data-date]');
    dayElements.forEach(element => {
      const date = element.getAttribute('data-date');
      
      // If we already have this image cached for current month, apply it immediately
      if (date && this.imagesByDate[date] && this.loadedImages.has(date)) {
        const imagePath = this.imagesByDate[date];
        if (this.currentMonthImages.has(imagePath)) {
          this._applyImageToElement(element, this.currentMonthImages.get(imagePath));
        }
      } else {
        // Otherwise, observe for lazy loading
        this.intersectionObserver.observe(element);
      }
    });
  }

  _applyAllImages() {
    // Fallback method for when IntersectionObserver is not available
    const nodes = document.querySelectorAll('#calendar .calendar-day[data-date]');
    nodes.forEach(node => {
      const date = node.getAttribute('data-date');
      if (date && this.imagesByDate[date]) {
        this._loadImageForDate(node, date);
      }
    });
  }

  destroy() {
    if (this.intersectionObserver) {
      this.intersectionObserver.disconnect();
      this.intersectionObserver = null;
    }
    this._clearCurrentMonthImages();
  }
}

if (!window.__CONSTELLATION) window.__CONSTELLATION = {};
if (!window.__CONSTELLATION.calendarModule) {
  window.__CONSTELLATION.calendarModule = new CalendarModule();
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', ()=> window.__CONSTELLATION.calendarModule.init());
  } else {
    window.__CONSTELLATION.calendarModule.init();
  }
}
window.ensureCalendarModule = () => window.__CONSTELLATION.calendarModule;