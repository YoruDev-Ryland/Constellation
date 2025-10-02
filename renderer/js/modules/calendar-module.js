class CalendarModule {
  constructor() {
    this.monthAnchor = new Date();
    this.disableImages = false; // Re-enable images
    this.imagesByDate = {}; // yyyy-mm-dd -> path
    this.initialized = false;
  }

  async init() {
    if (this.initialized) return;
    this.initialized = true;
    this._wireNav();
    await this._loadImages();
    this.render();
  }

  _wireNav() {
    document.getElementById('prevMonth')?.addEventListener('click', () => {
      this.monthAnchor.setMonth(this.monthAnchor.getMonth() - 1);
      this.render();
    });
    document.getElementById('nextMonth')?.addEventListener('click', () => {
      this.monthAnchor.setMonth(this.monthAnchor.getMonth() + 1);
      this.render();
    });
  }

  async _loadImages() {
    if (this.disableImages) return;
    try {
      // Get settings to find storagePath
      const settings = await window.electronAPI.getSettings();
      if (!settings?.storagePath) {
        console.warn('[Calendar] No storage path configured');
        return;
      }
      const resp = await window.electronAPI.getCalendarImages(settings.storagePath);
      if (resp?.success) this.imagesByDate = resp.images || {};
    } catch (e) {
      console.warn('[Calendar] Failed to load images', e);
    }
  }

  async refreshImages() {
    this.imagesByDate = {};
    await this._loadImages();
    this._applyImages();
  }

  render() {
    const root = document.getElementById('calendar');
    const label = document.getElementById('currentMonth');
    if (!root || !label) return;
    const year = this.monthAnchor.getFullYear();
    const month = this.monthAnchor.getMonth();
    const monthNames = ['January','February','March','April','May','June','July','August','September','October','November','December'];
    label.textContent = `${monthNames[month]} ${year}`;
    const first = new Date(year, month, 1);
    const last = new Date(year, month+1, 0);
    const blanks = first.getDay();
    const todayStr = new Date().toISOString().split('T')[0];
    
    let html = '<div class="calendar-grid">';
    html += '<div class="calendar-weekdays">';
    ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].forEach(d => {
      html += `<div class="weekday">${d}</div>`;
    });
    html += '</div>';
    
    html += '<div class="calendar-days">';
    // Add invisible spacer cells for days before the first day of the month
    for (let i=0;i<blanks;i++) html += '<div class="calendar-spacer"></div>';
    // Add days of the month
    for (let d=1; d<=last.getDate(); d++) {
      const dateObj = new Date(year, month, d);
      const dateStr = dateObj.toISOString().split('T')[0];
      const isToday = dateStr === todayStr;
      html += `<div class="calendar-day${isToday?' today':''}" data-date="${dateStr}"><div class="day-number">${d}</div><div class="day-dot" style="display:none;"></div></div>`;
    }
    html += '</div>';
    html += '</div>';
    root.innerHTML = html;
    this._applyImages();
  }

  _applyImages() {
    if (this.disableImages) return;
    const nodes = document.querySelectorAll('#calendar .calendar-day[data-date]');
    nodes.forEach(node => {
      const date = node.getAttribute('data-date');
      const p = this.imagesByDate[date];
      if (!p) return;
      node.classList.add('day-with-photo','has-image');
      node.style.backgroundImage = `url('file://${p.replace(/'/g,"%27")}')`;
      node.style.backgroundSize = 'cover';
      node.style.backgroundPosition = 'center';
    });
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