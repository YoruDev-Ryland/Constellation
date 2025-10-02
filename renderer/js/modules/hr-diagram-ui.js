/**
 * H-R Diagram UI for LRGB filter workflow
 */
class HRDiagramUI {
  constructor() {
    this.selectedFiles = {
      l: null,
      r: null,
      g: null,
      b: null
    };
  }

  /**
   * Create and show the simplified H-R diagram modal interface
   */
  createModal() {
    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.innerHTML = `
      <div class="hr-diagram-modal">
        <div class="modal-content">
          <div class="modal-header">
            <h2>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                <circle cx="12" cy="12" r="3"/>
                <path d="M12 1v6m0 6v6m11-7h-6m-6 0H1"/>
              </svg>
              H-R Diagram Generator
            </h2>
            <button class="modal-close" onclick="this.closest('.modal-overlay').remove()">×</button>
          </div>
          
          <div class="modal-body">
            <div class="info-note">
              <strong>H-R Diagram Requirements:</strong><br>
              H-R diagrams require separate filter observations to calculate color indices:<br>
              • Individual <strong>L, R, G, B filter</strong> images of the same field<br>
              • Consistent exposure conditions and calibration<br>
              • Color indices (B-G, R-G, etc.) calculated from filter magnitude differences<br><br>
              <strong>Current limitation:</strong> This tool requires individual filter FITS files, not processed RGB images.
              Upload calibrated L, R, G, B FITS files to proceed.
            </div>
            
            <div class="filter-selection">
              <h4>Filter Image Selection:</h4>
              <div class="filter-inputs">
                <div class="filter-input">
                  <label>L (Luminance) Filter:</label>
                  <input type="file" id="l-filter" accept=".fits,.fit,.fts">
                </div>
                <div class="filter-input">
                  <label>R (Red) Filter:</label>
                  <input type="file" id="r-filter" accept=".fits,.fit,.fts">
                </div>
                <div class="filter-input">
                  <label>G (Green) Filter:</label>
                  <input type="file" id="g-filter" accept=".fits,.fit,.fts">
                </div>
                <div class="filter-input">
                  <label>B (Blue) Filter:</label>
                  <input type="file" id="b-filter" accept=".fits,.fit,.fts">
                </div>
              </div>
              
              <div class="color-index-selection">
                <label>Color Index to Calculate:</label>
                <select id="color-index">
                  <option value="b-g">B-G (Blue-Green, closest to B-V)</option>
                  <option value="r-g">R-G (Red-Green)</option>
                  <option value="b-r">B-R (Blue-Red)</option>
                </select>
              </div>
            </div>
            
            <div class="proper-workflow">
              <h4>Recommended Workflow:</h4>
              <ol>
                <li><strong>Capture:</strong> Take separate L, R, G, B exposures of the same star field</li>
                <li><strong>Calibrate:</strong> Apply darks, flats, bias to all four filter images</li>
                <li><strong>Register:</strong> Align all four images to the same star positions</li>
                <li><strong>Upload FITS:</strong> Provide the calibrated FITS files (not processed JPG/PNG)</li>
                <li><strong>Photometry:</strong> Tool will measure the same stars in all filters</li>
                <li><strong>Color Index:</strong> Calculate color differences (B-G, R-G, etc.)</li>
                <li><strong>Plot:</strong> Color index vs luminosity = H-R diagram</li>
              </ol>
              <p><strong>Note:</strong> The B-G color index approximates the traditional B-V used in professional astronomy.</p>
            </div>
            
            <div class="modal-actions">
              <button id="process-filters" class="btn btn-primary" disabled>
                Process Filter Images
              </button>
              <button class="btn btn-secondary" onclick="this.closest('.modal-overlay').remove()">
                Cancel
              </button>
            </div>
          </div>
        </div>
      </div>
    `;

    document.body.appendChild(modal);
    this.initializeEventListeners();
    return modal;
  }

  /**
   * Initialize event listeners for the simplified interface
   */
  initializeEventListeners() {
    // Filter selection event listeners
    const filterInputs = ['l-filter', 'r-filter', 'g-filter', 'b-filter'];
    filterInputs.forEach(id => {
      const input = document.getElementById(id);
      if (input) {
        input.addEventListener('change', () => this.validateFilterInputs());
      }
    });

    const processBtn = document.getElementById('process-filters');
    if (processBtn) {
      processBtn.addEventListener('click', () => this.processFilterImages());
    }
  }

  /**
   * Validate that all filter files are selected
   */
  validateFilterInputs() {
    const lFile = document.getElementById('l-filter')?.files[0];
    const rFile = document.getElementById('r-filter')?.files[0];
    const gFile = document.getElementById('g-filter')?.files[0];
    const bFile = document.getElementById('b-filter')?.files[0];
    
    const processBtn = document.getElementById('process-filters');
    if (processBtn) {
      processBtn.disabled = !(lFile && rFile && gFile && bFile);
      
      if (lFile && rFile && gFile && bFile) {
        processBtn.textContent = `Process ${lFile.name.split('.')[0]} Field`;
      } else {
        processBtn.textContent = 'Process Filter Images';
      }
    }

    // Store file references
    this.selectedFiles = {
      l: lFile,
      r: rFile,
      g: gFile,
      b: bFile
    };
  }

  /**
   * Process the selected filter images
   */
  async processFilterImages() {
    const colorIndex = document.getElementById('color-index').value;
    const { l: lFile, r: rFile, g: gFile, b: bFile } = this.selectedFiles;
    
    console.log('Processing filters with color index:', colorIndex);
    console.log('Files:', { 
      lFile: lFile?.name, 
      rFile: rFile?.name, 
      gFile: gFile?.name, 
      bFile: bFile?.name 
    });
    
    // TODO: Implement FITS file reading and multi-filter photometry
    alert(`Multi-filter photometry setup complete for ${colorIndex.toUpperCase()} color index.\n\nProcessing pipeline:\n1. Read FITS headers for exposure/calibration data\n2. Register images to same coordinate system\n3. Detect stars in L filter\n4. Measure aperture photometry in all filters\n5. Calculate ${colorIndex.toUpperCase()} color index\n6. Generate H-R diagram\n\nFull implementation coming soon.`);
  }
}

// Export for use
window.HRDiagramUI = HRDiagramUI;