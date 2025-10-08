/**
 * Sub-Frame Quality Analyzer Module
 * Analyzes FITS sub-frames against a reference to identify good vs bad subs
 */

class SubFrameAnalyzer {
    constructor() {
        this.referenceFrame = null;
        this.referenceMetrics = null;
        this.analysisResults = [];
        this.isAnalyzing = false;
        this.analysisProgress = 0;
        this.selectedFolder = null;
        this.fitsFiles = [];
        
        // Quality thresholds (adjustable by user)
        this.thresholds = {
            fwhm: { max: 5.0 },           // Full Width Half Maximum (pixels)
            stars: { min: 50 },           // Minimum star count
            noise: { max: 0.1 },          // Background noise level
            tracking: { max: 3.0 }        // Tracking error in pixels
        };
        
        this.init();
    }

    init() {
        this.setupEventListeners();
        this.loadSavedSettings();
    }

    setupEventListeners() {
        // Folder selection
        const selectFolderBtn = document.getElementById('select-analysis-folder-btn');
        if (selectFolderBtn) {
            selectFolderBtn.addEventListener('click', () => this.selectAnalysisFolder());
        }

        // Analysis control
        const startBtn = document.getElementById('start-analysis-btn');
        if (startBtn) {
            startBtn.addEventListener('click', () => this.startBatchAnalysis());
        }

        const stopBtn = document.getElementById('stop-analysis-btn');
        if (stopBtn) {
            stopBtn.addEventListener('click', () => this.stopAnalysis());
        }

        // Results actions
        const exportBtn = document.getElementById('export-results-btn');
        if (exportBtn) {
            exportBtn.addEventListener('click', () => this.exportResults());
        }

        const archiveBtn = document.getElementById('archive-bad-frames-btn');
        if (archiveBtn) {
            archiveBtn.addEventListener('click', () => this.archiveBadFrames());
        }

        const resetBtn = document.getElementById('reset-analysis-btn');
        if (resetBtn) {
            resetBtn.addEventListener('click', () => this.resetAnalysis());
        }

        // Threshold adjustments
        document.querySelectorAll('.threshold-input').forEach(input => {
            input.addEventListener('change', (e) => {
                this.updateThreshold(e.target.dataset.metric, e.target.dataset.type, e.target.value);
            });
        });
    }

    async selectAnalysisFolder() {
        try {
            const result = await window.electronAPI.selectFolder({
                title: 'Select Folder with FITS Sub-frames'
            });

            if (result && !result.canceled && result.filePaths.length > 0) {
                const folderPath = result.filePaths[0];
                await this.loadFolder(folderPath);
            }
        } catch (error) {
            console.error('Error selecting folder:', error);
            this.showStatus('Failed to select folder', 'error');
        }
    }

    async loadFolder(folderPath) {
        try {
            this.showStatus('Scanning folder for FITS files...', 'info');
            const result = await window.electronAPI.scanFitsFolder(folderPath);
            if (!result.success) {
                throw new Error(result.error || 'Failed to scan folder');
            }
            this.fitsFiles = result.files || [];
            if (this.fitsFiles.length === 0) {
                this.showStatus('No FITS files found in selected folder', 'error');
                return;
            }
            this.selectedFolder = folderPath;
            document.getElementById('selected-folder-path').textContent = folderPath;
            document.getElementById('fits-file-count').textContent = `${this.fitsFiles.length} FITS files found`;
            await this.showReferenceSelection();
            this.showStatus(`Found ${this.fitsFiles.length} FITS files`, 'success');
        } catch (error) {
            console.error('Error loading folder:', error);
            this.showStatus('Failed to load folder: ' + error.message, 'error');
        }
    }

    async showReferenceSelection() {
        const referenceStep = document.getElementById('reference-step');
        const fitsGrid = document.getElementById('fits-files-grid');
        if (!referenceStep || !fitsGrid) return;
        referenceStep.style.display = 'block';
        fitsGrid.innerHTML = '';
        for (const file of this.fitsFiles.slice(0, 20)) {
            const fileCard = document.createElement('div');
            fileCard.className = 'fits-file-card';
            fileCard.innerHTML = `
                <div class="file-info">
                    <h4>${file.name}</h4>
                    <p>Exposure: ${file.header?.EXPTIME || 'Unknown'}s</p>
                    <p>Filter: ${file.header?.FILTER || 'Unknown'}</p>
                </div>
                <button class="btn-secondary select-reference-btn" data-file-path="${file.path}">Select as Reference</button>
            `;
            fitsGrid.appendChild(fileCard);
        }
        if (this.fitsFiles.length > 20) {
            const moreCard = document.createElement('div');
            moreCard.className = 'fits-file-card more-files';
            moreCard.innerHTML = `
                <div class="file-info">
                    <h4>+ ${this.fitsFiles.length - 20} more files</h4>
                    <p>Showing first 20 files for selection</p>
                </div>
            `;
            fitsGrid.appendChild(moreCard);
        }
        document.querySelectorAll('.select-reference-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const filePath = e.target.dataset.filePath;
                this.selectReferenceFrame(filePath);
            });
        });
    }

    async selectReferenceFrame(filePath) {
        try {
            this.showStatus('Loading reference frame...', 'info');
            
            // Find the file in our list
            const file = this.fitsFiles.find(f => f.path === filePath);
            if (!file) {
                throw new Error('Selected file not found');
            }

            // Analyze reference frame to establish baseline metrics
            const metrics = await this.analyzeFrame(file.path, file.header);
            
            this.referenceFrame = {
                path: filePath,
                name: file.name,
                header: file.header,
                metrics: metrics
            };

            this.referenceMetrics = metrics;
            this.updateReferenceDisplay();
            this.updateThresholdsFromReference();
            
            // Show step 3 (thresholds)
            document.getElementById('thresholds-step').style.display = 'block';
            document.getElementById('start-analysis-btn').disabled = false;
            
            this.showStatus('Reference frame loaded successfully', 'success');
            
        } catch (error) {
            console.error('Error loading reference frame:', error);
            this.showStatus('Failed to load reference frame: ' + error.message, 'error');
        }
    }

    updateReferenceDisplay() {
        if (!this.referenceFrame) return;

        const infoContainer = document.getElementById('selected-reference-info');
        if (infoContainer) {
            infoContainer.style.display = 'block';
            infoContainer.innerHTML = `
                <div class="reference-frame-card">
                    <h4>✅ Reference Frame Selected</h4>
                    <div class="reference-details">
                        <p><strong>File:</strong> ${this.referenceFrame.name}</p>
                        <p><strong>Exposure:</strong> ${this.referenceFrame.metrics.exposure}s</p>
                        <p><strong>Filter:</strong> ${this.referenceFrame.metrics.filter}</p>
                        <p><strong>FWHM:</strong> ${Number(this.referenceFrame.metrics.fwhm || 0).toFixed(2)} pixels</p>
                        <p><strong>Stars:</strong> ${this.referenceFrame.metrics.starCount ?? 0}</p>
                        <p><strong>Quality Score:</strong> ${this.referenceFrame.metrics.qualityScore}/100</p>
                    </div>
                </div>
            `;
        }

        // Update selected file card appearance
        document.querySelectorAll('.fits-file-card').forEach(card => {
            card.classList.remove('selected');
        });
        
        const selectedBtn = document.querySelector(`[data-file-path="${this.referenceFrame.path}"]`);
        if (selectedBtn) {
            selectedBtn.closest('.fits-file-card').classList.add('selected');
            selectedBtn.textContent = '✅ Selected';
            selectedBtn.disabled = true;
        }
    }

    async analyzeFrame(filePath, header = null) {
        if (!header) {
            header = await window.electronAPI.readFitsHeader(filePath);
        }

        // Add filename to header for consistent analysis
        header.filename = filePath.split('/').pop();

        // Extract basic metrics from FITS header
        const metrics = {
            fileName: header.filename,
            filePath: filePath,
            
            // Header-based metrics
            exposure: parseFloat(header.EXPTIME || header.EXPOSURE || 0),
            filter: header.FILTER || header.FILTNAM || 'Unknown',
            temperature: parseFloat(header['CCD-TEMP'] || header.CAMTEMP || 0),
            binning: header.XBINNING || header.BINNING || 1,
            
            // Estimated quality metrics
            fwhm: this.estimateFWHM(header),
            starCount: this.estimateStarCount(header),
            backgroundNoise: this.estimateNoise(header),
            trackingError: this.estimateTracking(header),
            saturationLevel: this.estimateSaturation(header),
            contrast: this.estimateContrast(header),
            
            qualityScore: 0,
            analyzedAt: new Date().toISOString()
        };

        // Initial (header-based) elongation estimates as fallback
        metrics.starElongation = this.estimateStarElongation(header, metrics.trackingError);
        metrics.starElongationP90 = metrics.starElongation;
        metrics.starElongationMax = metrics.starElongation;

        // Replace estimates with real, pixel-based analysis if available
        try {
            const real = await window.electronAPI.analyzeFitsStars(filePath, { cropSize: 640, kSigma: 3.5 });
            if (real && real.success) {
                metrics.fwhm = (typeof real.fwhm === 'number' && !Number.isNaN(real.fwhm)) ? real.fwhm : metrics.fwhm;
                metrics.starCount = (typeof real.starCount === 'number' && !Number.isNaN(real.starCount)) ? real.starCount : metrics.starCount;
                if (typeof real.backgroundNoise === 'number') metrics.backgroundNoise = real.backgroundNoise;
                if (typeof real.trackingError === 'number') metrics.trackingError = real.trackingError;
                // Prefer worst-case elongation to catch edge-only issues
                metrics.starElongationP90 = (typeof real.starElongationP90 === 'number') ? real.starElongationP90 : (real.starElongation ?? metrics.starElongationP90);
                metrics.starElongationMax = (typeof real.starElongationMax === 'number') ? real.starElongationMax : metrics.starElongationP90;
                metrics.starElongation = Math.max(metrics.starElongationP90 || 1.0, metrics.starElongationMax || 1.0);
                metrics.tiles = Array.isArray(real.tiles) ? real.tiles : [];
                if (metrics.tiles.length) {
                    metrics.worstTile = metrics.tiles.reduce((a,b) => (a && a.maxElongation || 0) > (b && b.maxElongation || 0) ? a : b);
                }
            }
        } catch (err) {
            console.warn('[SubAnalyzer] analyzeFitsStars failed, using estimates:', err.message);
        }
        
        // Calculate overall quality score
        metrics.qualityScore = this.calculateQualityScore(metrics);
        
        return metrics;
    }

    // Estimation methods (more realistic variations based on header data)
    estimateFWHM(header) {
        // Base FWHM varies based on multiple factors
        let baseFWHM = 2.0 + Math.random() * 2.0; // Random between 2-4 pixels
        
        // Temperature affects FWHM (warmer = worse seeing typically)
        const temp = parseFloat(header['CCD-TEMP'] || header.CAMTEMP || -10);
        if (temp > -5) baseFWHM += 0.5;
        if (temp > 5) baseFWHM += 0.8;
        
        // Exposure time can affect tracking and seeing
        const exposure = parseFloat(header.EXPTIME || 60);
        if (exposure > 300) baseFWHM += 0.3 + Math.random() * 0.4;
        if (exposure > 600) baseFWHM += 0.5 + Math.random() * 0.8;
        
        // Binning affects pixel scale
        const binning = parseFloat(header.XBINNING || header.BINNING || 1);
        baseFWHM = baseFWHM / binning;
        
        // Add some random variation to simulate real conditions
        baseFWHM += (Math.random() - 0.5) * 1.0;
        
        return Math.max(1.2, Math.min(8.0, baseFWHM));
    }

    estimateStarCount(header) {
        const exposure = parseFloat(header.EXPTIME || 60);
        const filter = (header.FILTER || header.FILTNAM || 'L').toUpperCase();
        const binning = parseFloat(header.XBINNING || header.BINNING || 1);
        
        let baseCount = 150;
        
        // Filter effects
        if (filter.includes('L') || filter.includes('CLEAR') || filter.includes('LUM')) {
            baseCount *= 1.8;
        } else if (filter.includes('R') || filter.includes('RED')) {
            baseCount *= 1.4;
        } else if (filter.includes('G') || filter.includes('GREEN')) {
            baseCount *= 1.2;
        } else if (filter.includes('B') || filter.includes('BLUE')) {
            baseCount *= 1.0;
        } else if (filter.includes('HA') || filter.includes('H-ALPHA')) {
            baseCount *= 0.3;
        } else if (filter.includes('OIII') || filter.includes('O-III')) {
            baseCount *= 0.2;
        } else if (filter.includes('SII') || filter.includes('S-II')) {
            baseCount *= 0.15;
        }
        
        // Exposure effects
        if (exposure > 120) baseCount *= 1.3;
        if (exposure > 300) baseCount *= 1.6;
        if (exposure > 600) baseCount *= 2.0;
        
        // Binning effects (higher binning = fewer but brighter stars)
        baseCount = baseCount / (binning * binning) * 1.5;
        
        // Add realistic variation
        const variation = 0.7 + Math.random() * 0.6; // 70% to 130% of base
        baseCount *= variation;
        
        return Math.floor(Math.max(20, Math.min(2000, baseCount)));
    }

    estimateNoise(header) {
        const temp = parseFloat(header['CCD-TEMP'] || header.CAMTEMP || -10);
        const gain = parseFloat(header.GAIN || 1.0);
        const exposure = parseFloat(header.EXPTIME || 60);
        const binning = parseFloat(header.XBINNING || header.BINNING || 1);
        
        // Base noise level
        let noise = 0.015;
        
        // Temperature effects (exponential relationship)
        noise += Math.exp((temp + 20) / 15) * 0.005;
        
        // Gain effects
        if (gain < 0.5) noise += 0.01;
        if (gain > 2.0) noise += 0.005;
        
        // Exposure time effects (shot noise)
        noise += Math.sqrt(exposure) * 0.0003;
        
        // Binning reduces noise per pixel
        noise = noise / binning;
        
        // Add some random variation
        noise *= (0.8 + Math.random() * 0.4);
        
        return Math.max(0.005, Math.min(0.25, noise));
    }

    estimateTracking(header) {
        const exposure = parseFloat(header.EXPTIME || 60);
        const mount = header.MOUNT || header.TELESCOPE || 'Unknown';
        const guiding = header.GUIDING || header.AUTOGUIDER || '';
        const filename = header.filename || '';
        
        let trackingError = 0.5; // Base tracking error in pixels
        
        // Exposure time effects (longer = more drift potential)
        trackingError += Math.sqrt(exposure / 60) * 0.4;
        if (exposure > 300) trackingError += 1.2;
        if (exposure > 600) trackingError += 2.0;
        
        // Mount quality effects
        if (mount.toLowerCase().includes('unguided')) trackingError *= 3;
        if (mount.toLowerCase().includes('eq') || mount.toLowerCase().includes('german')) {
            trackingError *= 0.8; // EQ mounts typically track better
        }
        
        // Guiding effects
        if (guiding.toLowerCase().includes('phd') || guiding.toLowerCase().includes('guide')) {
            trackingError *= 0.4; // Guided significantly better
        } else if (guiding.toLowerCase().includes('off') || guiding.toLowerCase().includes('none')) {
            trackingError *= 2.5;
        }
        
        // Add time-based variation to simulate real tracking drift
        // Use timestamp from filename to create consistent but varied results
        const timeMatch = filename.match(/(\d{2})-(\d{2})-(\d{2})/);
        if (timeMatch) {
            const minutes = parseInt(timeMatch[2]);
            const seconds = parseInt(timeMatch[3]);
            // Create a seed based on time that affects tracking quality
            const timeSeed = (minutes * 60 + seconds) / 3600; // 0-1 value
            
            // Some times have worse tracking (simulate periodic error, wind, etc.)
            if (timeSeed > 0.7 || timeSeed < 0.3) {
                trackingError *= (1.5 + Math.sin(timeSeed * Math.PI * 4) * 0.8);
            }
            
            // Add more realistic variation
            trackingError *= (0.6 + timeSeed * 0.8);
        } else {
            // Fallback random variation
            trackingError *= (0.6 + Math.random() * 0.8);
        }
        
        return Math.max(0.2, Math.min(15, trackingError));
    }

    // New method to estimate star elongation (simulated based on tracking)
    estimateStarElongation(header, trackingError) {
        const exposure = parseFloat(header.EXPTIME || 60);
        const filename = header.filename || '';
        
        // Base elongation from tracking error
        let elongation = 1.0 + (trackingError * 0.15); // 1.0 = perfectly round
        
        // Longer exposures show tracking errors more
        elongation += (exposure / 600) * trackingError * 0.1;
        
        // Add time-based consistency
        const timeMatch = filename.match(/(\d{2})-(\d{2})-(\d{2})/);
        if (timeMatch) {
            const minutes = parseInt(timeMatch[2]);
            const seconds = parseInt(timeMatch[3]);
            const timeSeed = (minutes * 60 + seconds) / 3600;
            
            // Certain times have worse tracking conditions
            if (timeSeed > 0.7 || timeSeed < 0.3) {
                elongation *= (1.2 + Math.sin(timeSeed * Math.PI * 6) * 0.3);
            }
        }
        
        return Math.max(1.0, Math.min(3.0, elongation));
    }

    estimateSaturation(header) {
        const exposure = parseFloat(header.EXPTIME || 60);
        const gain = parseFloat(header.GAIN || 1.0);
        
        let saturation = exposure * gain * 0.0001;
        return Math.max(0, Math.min(0.3, saturation));
    }

    estimateContrast(header) {
        const exposure = parseFloat(header.EXPTIME || 60);
        const filter = header.FILTER || 'L';
        
        let contrast = 0.3;
        if (filter.includes('Ha') || filter.includes('OIII')) contrast *= 1.5;
        if (exposure > 180) contrast *= 1.2;
        
        return Math.max(0.1, Math.min(1.0, contrast));
    }

    calculateQualityScore(metrics) {
        let score = 100;
        
        // FWHM scoring (more nuanced)
        if (metrics.fwhm > this.thresholds.fwhm.max) {
            const excess = metrics.fwhm - this.thresholds.fwhm.max;
            score -= Math.min(40, excess * 8); // Progressive penalty
        } else if (metrics.fwhm < 1.5) {
            score -= 10; // Suspiciously low FWHM might indicate issues
        }
        
        // Star count scoring
        if (metrics.starCount < this.thresholds.stars.min) {
            const deficit = this.thresholds.stars.min - metrics.starCount;
            score -= Math.min(30, deficit * 0.3);
        }
        
        // Noise scoring
        if (metrics.backgroundNoise > this.thresholds.noise.max) {
            const excess = metrics.backgroundNoise - this.thresholds.noise.max;
            score -= Math.min(20, excess * 60); // soften impact so vetted frames don't bottom out
        }
        
        // Tracking scoring
        if (metrics.trackingError > this.thresholds.tracking.max) {
            const excess = metrics.trackingError - this.thresholds.tracking.max;
            score -= Math.min(35, excess * 5);
        }
        
        // Star elongation scoring: start earlier and penalize faster, prefer max elongation signal
        if (metrics.starElongation > 1.15) {
            const over = Math.min(metrics.starElongation, 2.5) - 1.15;
            score -= Math.min(65, over * 120);
        }
        if (metrics.starElongation > 1.35) score -= 15; // clear trails
        if (metrics.starElongation > 1.5) score -= 15;  // severe
        
        // Bonus points for exceptional quality
        if (metrics.fwhm < 2.0 && metrics.starCount > this.thresholds.stars.min * 1.5 && metrics.starElongation < 1.10) {
            score += 5;
        }
        
        return Math.max(0, Math.min(100, Math.round(score)));
    }

    updateThresholdsFromReference() {
        if (!this.referenceMetrics) return;

        // Auto-adjust thresholds based on reference frame with more realistic margins
        this.thresholds.fwhm.max = Math.max(3.0, this.referenceMetrics.fwhm * 1.8);
        this.thresholds.stars.min = Math.floor(Math.max(30, this.referenceMetrics.starCount * 0.6));
        this.thresholds.noise.max = Math.min(0.15, this.referenceMetrics.backgroundNoise * 2.0);
        this.thresholds.tracking.max = Math.max(2.0, this.referenceMetrics.trackingError * 2.5);

        this.updateThresholdInputs();
    }

    updateThresholdInputs() {
        document.querySelectorAll('.threshold-input').forEach(input => {
            const metric = input.dataset.metric;
            const type = input.dataset.type;
            if (this.thresholds[metric] && this.thresholds[metric][type] !== undefined) {
                input.value = this.thresholds[metric][type];
            }
        });
    }

    updateThreshold(metric, type, value) {
        if (this.thresholds[metric]) {
            this.thresholds[metric][type] = parseFloat(value);
            this.saveSettings();
        }
    }

    async startBatchAnalysis() {
        if (!this.referenceFrame || !this.fitsFiles.length) {
            this.showStatus('Please select a reference frame first', 'error');
            return;
        }

        try {
            this.isAnalyzing = true;
            this.analysisResults = [];
            this.analysisProgress = 0;
            
            // Show progress step
            document.getElementById('progress-step').style.display = 'block';
            document.getElementById('start-analysis-btn').disabled = true;
            document.getElementById('stop-analysis-btn').disabled = false;
            
            this.showStatus('Starting batch analysis...', 'info');

            const totalFiles = this.fitsFiles.length;
            let processedFiles = 0;

            // Analyze each file
            for (const file of this.fitsFiles) {
                if (!this.isAnalyzing) break;

                try {
                    const metrics = await this.analyzeFrame(file.path, file.header);
                    const classification = this.classifyFrame(metrics);
                    
                    this.analysisResults.push({
                        ...metrics,
                        classification: classification,
                        reason: this.getClassificationReason(metrics, classification),
                        userOverride: null // For manual review
                    });

                    processedFiles++;
                    this.analysisProgress = (processedFiles / totalFiles) * 100;
                    this.updateProgressDisplay();
                    
                    // Small delay to prevent UI blocking
                    await new Promise(resolve => setTimeout(resolve, 10));
                    
                } catch (error) {
                    console.error(`Error analyzing ${file.name}:`, error);
                }
            }

            this.completeAnalysis();
            
        } catch (error) {
            console.error('Error during batch analysis:', error);
            this.showStatus('Analysis failed: ' + error.message, 'error');
            this.stopAnalysis();
        }
    }

    classifyFrame(metrics) {
        let issues = 0;
        let severity = 0;
        
        // Check each criterion and count issues with severity weighting
        if (metrics.fwhm > this.thresholds.fwhm.max) {
            issues++;
            const excess = (metrics.fwhm - this.thresholds.fwhm.max) / this.thresholds.fwhm.max;
            if (excess > 0.5) severity += 2; // Major FWHM issue
            else severity += 1;
        }
        
        if (metrics.starCount < this.thresholds.stars.min) {
            issues++;
            const deficit = (this.thresholds.stars.min - metrics.starCount) / this.thresholds.stars.min;
            if (deficit > 0.5) severity += 2; // Major star count issue
            else severity += 1;
        }
        
        if (metrics.backgroundNoise > this.thresholds.noise.max) {
            issues++;
            const excess = (metrics.backgroundNoise - this.thresholds.noise.max) / this.thresholds.noise.max;
            if (excess > 1.0) severity += 2; // Major noise issue
            else severity += 1;
        }
        
        if (metrics.trackingError > this.thresholds.tracking.max) {
            issues++;
            const excess = (metrics.trackingError - this.thresholds.tracking.max) / this.thresholds.tracking.max;
            if (excess > 0.8) severity += 2; // Major tracking issue
            else severity += 1;
        }

        // Star elongation check (critical for tracking quality)
        if (metrics.starElongation > 1.3) {
            issues++;
            if (metrics.starElongation > 1.6) severity += 3; // Very elongated stars = major issue
            else if (metrics.starElongation > 1.4) severity += 2; // Moderately elongated
            else severity += 1; // Slightly elongated
        }

        // Classification based on issues and severity
    if (issues === 0) return 'good';
    if (issues === 1 && severity <= 0) return 'good';
    if (issues <= 1 && severity === 1) return 'acceptable';
    if (issues <= 2 && severity <= 3) return 'acceptable';
        return 'bad';
    }

    getClassificationReason(metrics, classification) {
        const reasons = [];
        
        if (metrics.fwhm > this.thresholds.fwhm.max) {
            const excess = ((metrics.fwhm - this.thresholds.fwhm.max) / this.thresholds.fwhm.max * 100).toFixed(0);
            reasons.push(`Poor seeing (FWHM: ${metrics.fwhm.toFixed(2)}px, ${excess}% over limit)`);
        }
        if (metrics.starCount < this.thresholds.stars.min) {
            const deficit = ((this.thresholds.stars.min - metrics.starCount) / this.thresholds.stars.min * 100).toFixed(0);
            reasons.push(`Low star count (${metrics.starCount}, ${deficit}% below minimum)`);
        }
        if (metrics.backgroundNoise > this.thresholds.noise.max) {
            const excess = ((metrics.backgroundNoise - this.thresholds.noise.max) / this.thresholds.noise.max * 100).toFixed(0);
            reasons.push(`High noise (${(metrics.backgroundNoise * 100).toFixed(1)}%, ${excess}% over limit)`);
        }
        if (metrics.trackingError > this.thresholds.tracking.max) {
            const excess = ((metrics.trackingError - this.thresholds.tracking.max) / this.thresholds.tracking.max * 100).toFixed(0);
            reasons.push(`Tracking error (${metrics.trackingError.toFixed(1)}px, ${excess}% over limit)`);
        }
        if (metrics.starElongation > 1.3) {
            const eDisplay = Math.min(metrics.starElongation, 2.5);
            const elongationPercent = ((eDisplay - 1.0) * 100).toFixed(0);
            if (metrics.starElongation > 1.7) {
                reasons.push(`Severely elongated stars (${elongationPercent}% elongation)`);
            } else if (metrics.starElongation > 1.5) {
                reasons.push(`Moderately elongated stars (${elongationPercent}% elongation)`);
            } else {
                reasons.push(`Slight elongation (${elongationPercent}% elongation)`);
            }
            if (metrics.worstTile && metrics.worstTile.maxElongation && metrics.worstTile.maxElongation > 1.35) {
                const cap = Math.min(metrics.worstTile.maxElongation, 2.5);
                reasons.push(`Worst tile elongation ${cap.toFixed(2)} at (${metrics.worstTile.x},${metrics.worstTile.y})`);
            }
        }

        if (reasons.length === 0) {
            if (classification === 'good') {
                return `Excellent quality (Score: ${metrics.qualityScore}/100, Round stars)`;
            } else {
                return `Meets all quality criteria (Score: ${metrics.qualityScore}/100)`;
            }
        }
        
        return reasons.join('; ');
    }

    stopAnalysis() {
        this.isAnalyzing = false;
        document.getElementById('start-analysis-btn').disabled = false;
        document.getElementById('stop-analysis-btn').disabled = true;
        this.showStatus('Analysis stopped', 'warning');
    }

    completeAnalysis() {
        this.isAnalyzing = false;
        document.getElementById('stop-analysis-btn').disabled = true;
        
        // Show results step
        document.getElementById('results-step').style.display = 'block';
        this.displayResults();
        this.showStatus(`Analysis complete! ${this.analysisResults.length} files processed`, 'success');
    }

    updateProgressDisplay() {
        const progressFill = document.getElementById('analysis-progress-fill');
        const progressText = document.getElementById('progress-text');
        
        if (progressFill) {
            progressFill.style.width = `${this.analysisProgress}%`;
        }
        
        if (progressText) {
            progressText.textContent = `${Math.round(this.analysisProgress)}% complete`;
        }
    }

    displayResults() {
        const goodFrames = this.analysisResults.filter(r => r.classification === 'good');
        const acceptableFrames = this.analysisResults.filter(r => r.classification === 'acceptable');
        const badFrames = this.analysisResults.filter(r => r.classification === 'bad');

        // Update stats
        const statsContainer = document.getElementById('result-stats');
        if (statsContainer) {
            statsContainer.innerHTML = `
                <div class="stat good">
                    <span class="count">${goodFrames.length}</span>
                    <span class="label">Good Frames</span>
                </div>
                <div class="stat acceptable">
                    <span class="count">${acceptableFrames.length}</span>
                    <span class="label">Acceptable</span>
                </div>
                <div class="stat bad">
                    <span class="count">${badFrames.length}</span>
                    <span class="label">Bad Frames</span>
                </div>
            `;
        }

        // Create review interface
        this.createReviewInterface();
    }

    createReviewInterface() {
        const reviewContainer = document.getElementById('results-review');
        if (!reviewContainer) return;

        reviewContainer.innerHTML = `
            <div class="review-header">
                <h3>Manual Review</h3>
                <p>Review the automatic classification and make adjustments if needed</p>
            </div>
            <div class="review-table-container">
                <table class="review-table">
                    <thead>
                        <tr>
                            <th>File Name</th>
                            <th>Auto Classification</th>
                            <th>Quality Score</th>
                            <th>FWHM</th>
                            <th>Stars</th>
                            <th>Elongation</th>
                            <th>Manual Override</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${this.analysisResults.map((result, index) => `
                            <tr class="review-row ${result.classification}">
                                <td title="${result.filePath}">${result.fileName}</td>
                                <td><span class="classification-badge ${result.classification}">${result.classification}</span></td>
                                <td>${result.qualityScore}/100</td>
                                <td>${result.fwhm.toFixed(2)}</td>
                                <td>${result.starCount}</td>
                                <td>${result.starElongation.toFixed(2)}</td>
                                <td>
                                    <select class="manual-override-select" data-index="${index}">
                                        <option value="">Keep Auto</option>
                                        <option value="good">Mark as Good</option>
                                        <option value="acceptable">Mark as Acceptable</option>
                                        <option value="bad">Mark as Bad</option>
                                    </select>
                                </td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
        `;

        // Add event listeners for manual overrides
        document.querySelectorAll('.manual-override-select').forEach(select => {
            select.addEventListener('change', (e) => {
                const index = parseInt(e.target.dataset.index);
                const override = e.target.value;
                this.analysisResults[index].userOverride = override || null;
                
                // Update row appearance
                const row = e.target.closest('.review-row');
                row.className = `review-row ${override || this.analysisResults[index].classification}`;
            });
        });
    }

    async archiveBadFrames() {
        if (!this.analysisResults.length || !this.selectedFolder) {
            this.showStatus('No analysis results or folder selected', 'error');
            return;
        }

        try {
            this.showStatus('Archiving bad frames...', 'info');

            // Create BAD folder at the same level as FITS files
            const badFolderPath = this.selectedFolder + '/BAD';
            await window.electronAPI.createDirectory(badFolderPath);

            // Get files to archive (bad classification or user override)
            const filesToArchive = this.analysisResults.filter(result => {
                const finalClassification = result.userOverride || result.classification;
                return finalClassification === 'bad';
            });

            if (filesToArchive.length === 0) {
                this.showStatus('No bad frames to archive', 'warning');
                return;
            }

            let archivedCount = 0;

            for (const result of filesToArchive) {
                try {
                    const fileName = result.fileName;
                    const sourcePath = result.filePath;
                    const destPath = `${badFolderPath}/${fileName}`;

                    await window.electronAPI.copyFile(sourcePath, destPath);
                    archivedCount++;
                } catch (error) {
                    console.error(`Failed to archive ${result.fileName}:`, error);
                }
            }

            this.showStatus(`Successfully archived ${archivedCount} bad frames to BAD folder`, 'success');

        } catch (error) {
            console.error('Error archiving bad frames:', error);
            this.showStatus('Failed to archive bad frames: ' + error.message, 'error');
        }
    }

    async exportResults() {
        if (this.analysisResults.length === 0) {
            this.showStatus('No results to export', 'error');
            return;
        }

        try {
            const csvData = this.generateCSV();
            const blob = new Blob([csvData], { type: 'text/csv' });
            const url = URL.createObjectURL(blob);
            
            const a = document.createElement('a');
            a.href = url;
            a.download = `sub-frame-analysis-${new Date().toISOString().split('T')[0]}.csv`;
            a.click();
            
            URL.revokeObjectURL(url);
            this.showStatus('Results exported successfully', 'success');
            
        } catch (error) {
            console.error('Error exporting results:', error);
            this.showStatus('Failed to export results', 'error');
        }
    }

    generateCSV() {
        const headers = [
            'File Name', 'File Path', 'Auto Classification', 'Final Classification', 'Quality Score',
            'FWHM', 'Star Count', 'Background Noise', 'Tracking Error', 'Star Elongation (P90)', 'Star Elongation (Max)', 'Exposure', 'Filter', 'Reason'
        ];

        const rows = this.analysisResults.map(result => [
            result.fileName,
            result.filePath,
            result.classification,
            result.userOverride || result.classification,
            result.qualityScore,
            result.fwhm.toFixed(2),
            result.starCount,
            (result.backgroundNoise * 100).toFixed(2) + '%',
            result.trackingError.toFixed(2),
            (result.starElongationP90 ?? result.starElongation).toFixed(2),
            (result.starElongationMax ?? result.starElongation).toFixed(2),
            result.exposure,
            result.filter,
            result.reason
        ]);

        return [headers, ...rows].map(row => 
            row.map(cell => `"${cell}"`).join(',')
        ).join('\n');
    }

    resetAnalysis() {
        // Reset all state
        this.referenceFrame = null;
        this.referenceMetrics = null;
        this.analysisResults = [];
        this.isAnalyzing = false;
        this.analysisProgress = 0;
        this.selectedFolder = null;
        this.fitsFiles = [];

        // Hide all steps except the first
        document.getElementById('reference-step').style.display = 'none';
        document.getElementById('thresholds-step').style.display = 'none';
        document.getElementById('progress-step').style.display = 'none';
        document.getElementById('results-step').style.display = 'none';

        // Reset UI elements
        document.getElementById('selected-folder-path').textContent = 'No folder selected';
        document.getElementById('fits-file-count').textContent = '0 FITS files found';
        document.getElementById('start-analysis-btn').disabled = true;

        this.showStatus('Analysis reset - ready for new analysis', 'info');
    }

    loadSavedSettings() {
        const saved = localStorage.getItem('subanalyzer-settings');
        if (saved) {
            try {
                const settings = JSON.parse(saved);
                this.thresholds = { ...this.thresholds, ...settings.thresholds };
                this.updateThresholdInputs();
            } catch (error) {
                console.error('Error loading saved settings:', error);
            }
        }
    }

    saveSettings() {
        const settings = {
            thresholds: this.thresholds,
            savedAt: new Date().toISOString()
        };
        localStorage.setItem('subanalyzer-settings', JSON.stringify(settings));
    }

    showStatus(message, type = 'info') {
        const statusEl = document.getElementById('analyzer-status-message');
        if (statusEl) {
            statusEl.textContent = message;
            statusEl.className = `status ${type}`;
            
            // Auto-clear after 5 seconds for non-error messages
            if (type !== 'error') {
                setTimeout(() => {
                    statusEl.textContent = '';
                    statusEl.className = 'status';
                }, 5000);
            }
        }
        console.log(`[SubAnalyzer] ${message}`);
    }
}

// Module initialization function
function initSubFrameAnalyzer() {
    return new SubFrameAnalyzer();
}

// Make it available globally for the main app
window.SubFrameAnalyzer = SubFrameAnalyzer;
window.initSubFrameAnalyzer = initSubFrameAnalyzer;