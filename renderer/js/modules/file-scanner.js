// File Scanner Module
// Responsible for scanning directories, grouping files, estimating targets, and updating projects.
// Emits callbacks for progress and completion; delegates verbose logging to injected LogManager.

class FileScanner {
  constructor(electronAPI, options = {}) {
    this.electronAPI = electronAPI;
    this.log = options.log || (()=>{});
    this.getSettings = options.getSettings || (() => ({}));
    this.onTargetsUpdated = options.onTargetsUpdated || (()=>{});
  }

  async scan(storagePath) {
    this.log('Starting optimized file processing (module)', { storagePath });
    const files = await this.electronAPI.scanDirectory(storagePath);
    if (files.error) throw new Error(files.error);
    return this.processFiles(files);
  }

  async processFiles(files) {
    const settings = this.getSettings();
    const targetMap = new Map();
    const validator = new TargetValidator();

    // Group files by directory
    const filesByDirectory = new Map();
    files.forEach(file => {
      const lastSlash = Math.max(file.lastIndexOf('/'), file.lastIndexOf('\\'));
      const dir = lastSlash === -1 ? '' : file.substring(0, lastSlash);
      if (!filesByDirectory.has(dir)) filesByDirectory.set(dir, []);
      filesByDirectory.get(dir).push(file);
    });

    this.log('Files grouped by directory', {
      totalDirectories: filesByDirectory.size,
      directorySizes: Array.from(filesByDirectory.entries()).map(([d,f]) => ({ directory: d, fileCount: f.length }))
    });

    for (const [directory, dirFiles] of filesByDirectory) {
      this.log('Processing directory', { directory, fileCount: dirFiles.length });

      // Sampling
      const sampleSize = Math.min(5, dirFiles.length);
      const sampleFiles = [];
      for (let i = 0; i < sampleSize; i++) {
        const index = Math.floor((i / sampleSize) * dirFiles.length);
        sampleFiles.push(dirFiles[index]);
      }
      this.log('Sampling files for directory analysis', {
        directory,
        sampleSize,
        sampleFiles: sampleFiles.map(f => f.split(/[\\/]/).pop()),
        directoryPath: directory,
        pathParts: directory.split(/[\\/]/)
      });

      let directoryTarget = null;
      let directoryFilter = 'L';
      const sampleResults = [];
      let hasCalibrationFrames = false;

      for (const sampleFile of sampleFiles) {
        const parts = sampleFile.split(/[\\/]/);
        let targetName = validator.extractTargetFromPath(sampleFile);

        if (!targetName) {
          const filename = parts[parts.length - 1];
          const match = filename.match(/_([^_]+)_\d+\.\d+s/);
            if (match && validator.isLikelyTarget(match[1])) {
            targetName = validator.cleanTargetName(match[1]);
          }
        }

        if (targetName) targetName = validator.cleanTargetName(targetName);

        // Filter detection
        let filter = 'L';
        let isCalibrationDir = false;
        for (const part of parts) {
          const cleanPart = part.trim();
          const lower = cleanPart.toLowerCase();
          if (['bias','biases','flat','flats','dark','darks'].includes(lower)) { isCalibrationDir = true; filter = 'Cal'; break; }
          if (['H','O','S','B','G','R','L'].includes(cleanPart)) { filter = cleanPart; }
          if (['ha','halpha'].includes(lower)) filter = 'H';
          if (lower === 'oiii') filter = 'O';
          if (lower === 'sii') filter = 'S';
          if (['lights','light','subs'].includes(lower) && !parts.some(p => ['H','O','S','B','G','R'].includes(p))) filter = 'OSC';
        }

        // FITS header
        let headerData = null;
        try {
          const header = await this.electronAPI.readFitsHeader(sampleFile);
          if (header) {
            headerData = {
              object: header.OBJECT,
              filter: header.FILTER,
              exptime: parseFloat(header.EXPTIME || header.EXPOSURE || 0)
            };
            if (header.OBJECT && validator.isLikelyTarget(header.OBJECT)) {
              targetName = validator.cleanTargetName(header.OBJECT);
            }
            if (header.FILTER && header.FILTER.trim() !== '') {
              const hf = header.FILTER.trim();
              const l = hf.toLowerCase();
              if (l.includes('ha') || l === 'h') filter = 'H';
              else if (l.includes('oiii') || l === 'o') filter = 'O';
              else if (l.includes('sii') || l === 's') filter = 'S';
              else if (['b','g','r','l'].includes(hf.toUpperCase())) filter = hf.toUpperCase();
              else if (l.includes('lum')) filter = 'L';
              else if (l.includes('red')) filter = 'R';
              else if (l.includes('green')) filter = 'G';
              else if (l.includes('blue')) filter = 'B';
              else filter = hf;
            }
          }
        } catch (err) {
          this.log('Sample FITS header read failed', { sampleFile, error: err.message });
        }

        sampleResults.push({ file: sampleFile, targetName, filter, headerData, isCalibrationDir });
      }

      const targetCounts = new Map();
      const filterCounts = new Map();
      sampleResults.forEach(r => {
        if (r.isCalibrationDir) { hasCalibrationFrames = true; return; }
        if (r.targetName) targetCounts.set(r.targetName, (targetCounts.get(r.targetName) || 0) + 1);
        filterCounts.set(r.filter, (filterCounts.get(r.filter) || 0) + 1);
      });
      directoryTarget = targetCounts.size ? Array.from(targetCounts.entries()).sort((a,b)=> b[1]-a[1])[0][0] : null;
      directoryFilter = filterCounts.size ? Array.from(filterCounts.entries()).sort((a,b)=> b[1]-a[1])[0][0] : 'L';

      if (hasCalibrationFrames && targetCounts.size === 0) {
        this.log('Calibration directory detected', { directory, fileCount: dirFiles.length });
        continue; // skip adding target
      }

      // Avg exposure
      const exposureTimes = sampleResults.filter(r => r.headerData && r.headerData.exptime > 0).map(r => r.headerData.exptime);
      const avgExposure = exposureTimes.length ? exposureTimes.reduce((a,b)=> a+b,0)/exposureTimes.length : 60;

      this.log('Directory analysis complete', {
        directory,
        samplesAnalyzed: sampleResults.length,
        determinedTarget: directoryTarget,
        determinedFilter: directoryFilter,
        avgExposure,
        targetCandidates: Array.from(targetCounts.entries()),
        filterCandidates: Array.from(filterCounts.entries())
      });

      if (!directoryTarget) { this.log('Skipping directory - no valid target found', { directory }); continue; }

      const blacklist = settings.projectBlacklist || [];
      if (blacklist.includes(directoryTarget.toLowerCase())) {
        this.log('Skipping directory - target is blacklisted', { directory, targetName: directoryTarget });
        continue;
      }

      if (!targetMap.has(directoryTarget)) {
        targetMap.set(directoryTarget, { name: directoryTarget, totalTime: 0, imageCount: 0, filters: {} });
        this.log('New target created from directory analysis', { targetName: directoryTarget });
      }

      const target = targetMap.get(directoryTarget);
      if (!target.filters[directoryFilter]) target.filters[directoryFilter] = { count: 0, time: 0 };
      const estimatedTime = avgExposure * dirFiles.length;
      target.totalTime += estimatedTime;
      target.imageCount += dirFiles.length;
      target.filters[directoryFilter].count += dirFiles.length;
      target.filters[directoryFilter].time += estimatedTime;

      this.log('Applied directory characteristics to all files', { directory, targetName: directoryTarget, filter: directoryFilter, filesProcessed: dirFiles.length, estimatedTotalTime: estimatedTime, avgExposureUsed: avgExposure });
    }

    const targets = Array.from(targetMap.values());
    this.log('Processing complete', { totalTargetsFound: targets.length, targetNames: targets.map(t=> t.name), totalEstimatedTime: targets.reduce((s,t)=> s+t.totalTime,0) });
    return targets;
  }
}

window.FileScanner = FileScanner;
