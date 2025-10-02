// Log Manager Module
// Encapsulates verbose logging state, scan log collection, report generation, and modal UI.
// Provides a narrow API so app.js can shrink.
class LogManager {
  constructor() {
    this.verbose = false;
    this.scanLog = [];
    this.currentScanReport = null;
  }

  setVerbose(enabled) {
    this.verbose = enabled;
  }

  isVerbose() { return this.verbose; }

  clear() {
    this.scanLog = [];
    this.log('Scan log cleared');
  }

  log(message, data = null) {
    if (!this.verbose) return;
    const entry = {
      timestamp: new Date().toISOString(),
      message,
      data: data ? JSON.parse(JSON.stringify(data)) : null
    };
    this.scanLog.push(entry);
    console.log(`[VERBOSE] ${message}`, data || '');
  }

  getEntries() { return this.scanLog; }

  buildConsoleScanReport(targets, settings) {
    if (!this.verbose) return;
    console.log('\n' + '='.repeat(80));
    console.log('CONSTELLATION SCAN REPORT');
    console.log('='.repeat(80));
    console.log(`Scan completed at: ${new Date().toISOString()}`);
    console.log(`Total log entries: ${this.scanLog.length}`);
    console.log(`Storage path: ${settings.storagePath}`);
    console.log('='.repeat(80));

    const fileGroups = new Map();
    this.scanLog.forEach(e => {
      if (e.data && e.data.file) {
        if (!fileGroups.has(e.data.file)) fileGroups.set(e.data.file, []);
        fileGroups.get(e.data.file).push(e);
      }
    });

    console.log('\nPER-FILE ANALYSIS:');
    console.log('-'.repeat(50));
    fileGroups.forEach((logs, file) => {
      console.log(`\nFILE: ${file}`);
      logs.forEach(l => {
        console.log(`  [${l.timestamp}] ${l.message}`);
        if (l.data && Object.keys(l.data).length > 1) {
          Object.entries(l.data).forEach(([k, v]) => {
            if (k !== 'file') console.log(`    ${k}: ${JSON.stringify(v)}`);
          });
        }
      });
    });

    const stats = {
      totalFilesProcessed: fileGroups.size,
      successfulTargetExtractions: 0,
      failedTargetExtractions: 0,
      fitsHeaderReads: 0,
      filterDetections: 0,
      targetsCreated: targets.length
    };
    this.scanLog.forEach(e => {
      if (e.message.includes('Target extracted from path')) stats.successfulTargetExtractions++;
      if (e.message.includes('No valid target found')) stats.failedTargetExtractions++;
      if (e.message.includes('FITS header read successfully')) stats.fitsHeaderReads++;
      if (e.message.includes('Filter detected')) stats.filterDetections++;
    });
    console.log('\nSUMMARY STATISTICS:');
    console.log('-'.repeat(50));
    Object.entries(stats).forEach(([k,v]) => console.log(`${k}: ${v}`));

    console.log('\nCOPY THIS REPORT TO SHARE FOR DEBUGGING:');
    console.log('-'.repeat(50));
    console.log(JSON.stringify({ scanReport: { timestamp: new Date().toISOString(), settings: { storagePath: settings.storagePath }, statistics: stats, logs: this.scanLog.slice(0,100) } }, null, 2));
    console.log('\n' + '='.repeat(80));
  }

  // Modal UI (depends on existing DOM structure)
  showModal(targets) {
    const modal = document.getElementById('verboseLogModal');
    const content = document.getElementById('verboseLogContent');
    if (!modal || !content) return;

    const directoryLogs = this.scanLog.filter(e => e.message.includes('Processing directory'));
    const filesGroupedLog = this.scanLog.find(e => e.message.includes('Files grouped by directory'));
    const stats = {
      totalDirectories: directoryLogs.length,
      totalFiles: filesGroupedLog?.data?.totalFiles || 0,
      targetsCreated: targets.length,
      totalEstimatedTime: targets.reduce((s,t)=> s + t.totalTime, 0)
    };

    const issues = [];
    const insights = [];
    const filterIssues = [];
    const oscTargets = [];

    targets.forEach(t => {
      const filters = Object.keys(t.filters);
      if (filters.length === 1 && filters[0] === 'OSC') { oscTargets.push(t.name); return; }
      if (filters.length === 1 && filters[0] === 'L') {
        const targetDirs = directoryLogs.filter(l => l.data && l.data.targetName === t.name);
        const hasFilterFolders = targetDirs.some(l => {
          const dirName = l.data.directory.split('/').pop();
          return ['H','O','S','B','G','R'].includes(dirName);
        });
        if (hasFilterFolders) filterIssues.push(t.name);
      }
    });
    if (filterIssues.length) {
      issues.push({ type: 'Filter Detection', description: `${filterIssues.length} targets only have L but structured subfolders suggest more filters`, targets: filterIssues, solution: 'Verify FITS filter headers and folder naming.' });
    }
    if (oscTargets.length) insights.push(`✨ Detected ${oscTargets.length} OSC targets: ${oscTargets.join(', ')}`);

    insights.push(`Detected ${stats.targetsCreated} targets`);
    insights.push(`Processed ${stats.totalDirectories} directories (${stats.totalFiles} files)`);
    insights.push(`Estimated total integration: ${(stats.totalEstimatedTime/3600).toFixed(1)}h`);
    if (!issues.length) insights.push('✅ No major detection issues');

    let html = `<div class="log-summary"><h4>📊 Quick Analysis</h4><div class="summary-grid">` +
      `<div class="summary-item"><span>Targets Found:</span><span>${stats.targetsCreated}</span></div>` +
      `<div class="summary-item"><span>Directories:</span><span>${stats.totalDirectories}</span></div>` +
      `<div class="summary-item"><span>Files:</span><span>${stats.totalFiles}</span></div>` +
      `<div class="summary-item"><span>Total Time:</span><span>${(stats.totalEstimatedTime/3600).toFixed(1)}h</span></div>` +
      `</div></div>`;

    if (issues.length) {
      html += `<div class="log-section" style="border-left-color: var(--accent-red);"><h3>⚠️ Issues</h3>`;
      issues.forEach(i => {
        html += `<div class="log-entry" style="border-left-color: var(--accent-red);"><div class="log-message"><strong>${i.type}</strong></div><div class="log-data">${i.description}<br>`;
        if (i.targets) html += `<strong>Affected:</strong> ${i.targets.join(', ')}<br>`;
        if (i.solution) html += `<strong>Solution:</strong> ${i.solution}`;
        html += `</div></div>`;
      });
      html += `</div>`;
    }

    html += `<div class="log-section" style="border-left-color: var(--accent-green);"><h3>💡 Insights</h3>`;
    insights.forEach(ins => {
      html += `<div class="log-entry" style="border-left-color: var(--accent-green);"><div class="log-message">${ins}</div></div>`;
    });
    html += `</div>`;

    // Targets list
    if (targets.length) {
      html += `<div class="log-section"><h3>🎯 Targets</h3>`;
      targets.forEach(t => {
        const filtersList = Object.entries(t.filters).map(([f,d]) => `${f}: ${d.count} (${(d.time/3600).toFixed(1)}h)`).join(', ');
        html += `<div class="log-entry"><div class="log-message"><strong>${t.name}</strong></div><div class="log-data">${t.imageCount} images | ${(t.totalTime/3600).toFixed(1)}h | Filters: ${filtersList}</div></div>`;
      });
      html += `</div>`;
    }

    // Compact report JSON
    const compactReport = {
      summary: { timestamp: new Date().toISOString(), targets: stats.targetsCreated, directories: stats.totalDirectories, files: stats.totalFiles, totalTime: stats.totalEstimatedTime },
      issues, targets: targets.map(t => ({ name: t.name, images: t.imageCount, time: Math.round(t.totalTime), filters: Object.keys(t.filters) }))
    };
    html += `<div class="log-section"><h3>📋 Compact Report</h3><div class="log-entry"><pre style="font-size:11px;overflow-x:auto;max-height:200px;">${JSON.stringify(compactReport,null,2)}</pre></div></div>`;

    content.innerHTML = html;
    modal.style.display = 'flex';
    this.currentScanReport = JSON.stringify(compactReport,null,2);
  }

  closeModal() {
    const modal = document.getElementById('verboseLogModal');
    if (modal) modal.style.display = 'none';
  }

  async copyReportToClipboard() {
    try {
      await navigator.clipboard.writeText(this.currentScanReport || 'No report available');
      const btn = document.getElementById('copyLogBtn');
      if (btn) {
        const original = btn.innerHTML;
        btn.innerHTML = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M20 6L9 17l-5-5"/></svg>Copied!`;
        btn.classList.add('btn-primary');
        setTimeout(()=> btn.innerHTML = original, 2000);
      }
    } catch (e) {
      console.error('Clipboard copy failed', e);
      alert('Failed to copy. Select text manually.');
    }
  }
}

window.LogManager = LogManager;
