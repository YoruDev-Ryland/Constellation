// Acquisition Charts Module
// Encapsulates chart creation and acquisition data generation.

class AcquisitionCharts {
  constructor(options = {}) {
    this.getCurrentProject = options.getCurrentProject || (() => null);
    this.getSettings = options.getSettings || (() => ({}));
    this.electronAPI = options.electronAPI || window.electronAPI;
    this.chartInstance = null;
    this.sessionCache = {}; // { projectId: { ts: Date.now(), data: [...] } }
    this.cacheTTLms = 10 * 60 * 1000; // 10 minutes
  }

  async createChart(project) {
    if (!project) return;
    const canvas = document.getElementById('acquisitionChart');
    if (!canvas) return;
    const spinner = document.getElementById('acquisitionChartSpinner');
    if (spinner) spinner.style.display = 'flex';
    const ctx = canvas.getContext('2d');
    let acquisitionData = await this._getSessionsCached(project);
    if (!acquisitionData || acquisitionData.length === 0) {
      acquisitionData = await this.generateAcquisitionData(project, { force: true });
    }
    if (!acquisitionData || acquisitionData.length === 0) {
      // Provide a minimal placeholder dataset so Chart.js renders a frame
      console.warn('Acquisition data empty for project', project.name);
    }
    const isOSC = Object.keys(project.filters).length === 1 && (project.filters.OSC || project.filters.L);
    const config = isOSC ? this._oscConfig(acquisitionData) : this._monoConfig(acquisitionData, project);
    // Diagnostics
    console.log('[AcquisitionCharts] Creating chart', { labels: config.data.labels, datasets: config.data.datasets.map(d=>({label:d.label,len:d.data.length,sample:d.data.slice(0,5)})) });
    if (this.chartInstance) this.chartInstance.destroy();
    // Ensure canvas has size; if not, force a reflow width from parent
    if (canvas.offsetWidth === 0) {
      const parent = canvas.parentElement;
      if (parent) {
        parent.style.display = 'block';
        parent.style.width = '100%';
      }
    }
    try {
      this.chartInstance = new Chart(ctx, config);
    } catch (err) {
      console.error('Chart instantiation failed', err, config);
      return;
    }
    if (canvas.offsetWidth === 0) {
      // Retry once on next frame if still zero width
      requestAnimationFrame(() => {
        if (canvas.offsetWidth === 0) {
          console.warn('Chart canvas still zero width after render, triggering resize');
        } else if (this.chartInstance) {
          this.chartInstance.resize();
        }
      });
    }
    // Post-render verification
    requestAnimationFrame(()=> {
      const internalMeta = this.chartInstance?._metasets || [];
      const totalBars = internalMeta.reduce((s,m)=> s + (m.data? m.data.length:0),0);
      console.log('[AcquisitionCharts] Render verification', { datasets: internalMeta.length, totalElements: totalBars });
      if (totalBars === 0) console.warn('No bar elements rendered - possible plugin/options issue.');
      if (spinner) spinner.remove();
    });
  }

  async debug(project) {
    const p = project || this.getCurrentProject();
    if (!p) return;
    const acquisitionData = await this.generateAcquisitionData(p);
    const debugInfo = {
      project: {
        name: p.name,
        createdAt: p.createdAt,
        status: p.status,
        totalTime: p.totalTime,
        imageCount: p.imageCount,
        filters: p.filters
      },
      acquisitionData,
      timestamp: new Date().toISOString()
    };
    console.log('Acquisition Chart Debug Data:', debugInfo);
    try {
      await navigator.clipboard.writeText(JSON.stringify(debugInfo, null, 2));
      alert('Acquisition data copied to clipboard (see console for details).');
    } catch {
      alert('Acquisition data logged to console.');
    }
  }

  async generateAcquisitionData(project, { force = false } = {}) {
    // Pull real sessions by asking main process to scan project files.
    try {
      const settings = this.getSettings();
      const result = await this.electronAPI.scanProjectFiles(project.name, settings.storagePath);
      if (result && result.debug && result.debug.scannedFolders) {
        console.debug('[AcquisitionCharts] scanProjectFiles debug:', result.debug);
      }
      if (result.success && Array.isArray(result.sessions)) {
        const mapped = result.sessions.map(session => ({
          date: session.date,
          filters: Object.fromEntries(Object.entries(session.filters).map(([filter, data]) => [filter, {
            count: data.count,
            // If exposure length is unknown, approximate using project aggregate: totalTime/imageCount (seconds)
            time: data.count * this._averageExposureSeconds(project, filter)
          }]))
        })).sort((a,b) => new Date(a.date) - new Date(b.date));
        this._cacheSessions(project, mapped);
        return mapped;
      }
      console.warn('scanProjectFiles returned no sessions or failed:', result.error);
      return []; // Real data only: do not synthesize sessions
    } catch (e) {
      console.error('Failed to generate acquisition data:', e);
      return [];
    }
  }

  _cacheSessions(project, data) {
    if (!project || !project.id) return;
    this.sessionCache[project.id] = { ts: Date.now(), data };
  }

  async _getSessionsCached(project) {
    const entry = project && project.id ? this.sessionCache[project.id] : null;
    if (!entry) return null;
    if (Date.now() - entry.ts > this.cacheTTLms) return null;
    return entry.data;
  }

  async refresh(project) {
    if (!project) return;
    delete this.sessionCache[project.id];
    return this.createChart(project);
  }

  _averageExposureSeconds(project, filter) {
    // Try to infer average exposure length per filter using existing aggregate data.
    const filterData = project.filters[filter];
    if (filterData && filterData.count > 0) {
      return (filterData.time / filterData.count); // filterData.time presumed seconds
    }
    if (project.imageCount > 0) return project.totalTime / project.imageCount;
    return 300; // conservative fallback 5 min if nothing else
  }

  _oscConfig(acquisitionData) {
    const labels = acquisitionData.map(n => new Date(n.date).toLocaleDateString('en-US',{month:'short',day:'numeric'}));
    const shotCounts = acquisitionData.map(n => Object.values(n.filters).reduce((s,f)=> s+f.count,0));
    return {
      type: 'bar',
      data: { labels, datasets: [{ label: 'Total Shots', data: shotCounts, backgroundColor: 'rgba(99,102,241,0.6)', borderColor: 'rgba(99,102,241,1)', borderWidth: 1, borderRadius: 4 }]},
      options: this._baseOptions('Number of Shots')
    };
  }

  _monoConfig(acquisitionData, project) {
    const labels = acquisitionData.map(n => new Date(n.date).toLocaleDateString('en-US',{month:'short',day:'numeric'}));
    const datasets = Object.keys(project.filters).map(filter => {
      const color = this._filterColor(filter);
      return {
        label: `${filter} Filter`,
        data: acquisitionData.map(n => n.filters[filter]?.count || 0),
        backgroundColor: color.bg,
        borderColor: color.border,
        borderWidth: 1,
        borderRadius: 4,
        stack: 'filters'
      };
    });
    return {
      type: 'bar',
      data: { labels, datasets },
      options: this._baseOptions('Shots per Filter')
    };
  }

  _baseOptions(yTitle) {
    return {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        x: { stacked: true, ticks: { color: '#94a3b8' }, grid: { color: 'rgba(148,163,184,0.15)' } },
        y: { beginAtZero: true, stacked: true, ticks: { color: '#94a3b8' }, grid: { color: 'rgba(148,163,184,0.15)' }, title: { display: true, text: yTitle, color: '#94a3b8' } }
      },
      plugins: { 
        tooltip: { callbacks: { afterLabel: (ctx) => { return ''; } } },
        legend: { labels: { color: '#94a3b8' } }
      }
    };
  }

  _filterColor(filter) {
    const palette = {
      L: { bg: 'rgba(148,163,184,0.6)', border: 'rgba(148,163,184,1)' },
      R: { bg: 'rgba(239,68,68,0.6)', border: 'rgba(239,68,68,1)' },
      G: { bg: 'rgba(34,197,94,0.6)', border: 'rgba(34,197,94,1)' },
      B: { bg: 'rgba(59,130,246,0.6)', border: 'rgba(59,130,246,1)' },
      H: { bg: 'rgba(220,38,38,0.6)', border: 'rgba(220,38,38,1)' },
      O: { bg: 'rgba(14,165,233,0.6)', border: 'rgba(14,165,233,1)' },
      S: { bg: 'rgba(168,85,247,0.6)', border: 'rgba(168,85,247,1)' },
      OSC: { bg: 'rgba(99,102,241,0.6)', border: 'rgba(99,102,241,1)' }
    };
    return palette[filter] || { bg: 'rgba(100,116,139,0.6)', border: 'rgba(100,116,139,1)' };
  }
}

window.AcquisitionCharts = AcquisitionCharts;
