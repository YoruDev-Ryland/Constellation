/**
 * Tool Registry - Dynamically loads and manages tool definitions
 */
class ToolRegistry {
  constructor() {
    this.tools = [];
    this.toolsContainer = null;
  }

  /**
   * Initialize the tool registry and load all tools
   */
  async init() {
    this.toolsContainer = document.querySelector('.tools-grid');
    if (!this.toolsContainer) {
      console.error('Tools container not found');
      return;
    }

    await this.loadTools();
    this.renderTools();
  }

  /**
   * Load all tool manifests from the manifests directory
   */
  async loadTools() {
    try {
      // Try to dynamically discover manifests by attempting to load common tool IDs
      // In a real implementation, you might scan the directory or maintain an index
      const possibleTools = [
        'hr-diagram',
        'sub-analyzer', 
        'altitude-timeline',
        'instagram-post-creator',
        'finalizer'
      ];

      const toolPromises = possibleTools.map(async (toolId) => {
        try {
          const response = await fetch(`js/modules/tools/manifests/${toolId}.json`);
          if (response.ok) {
            const tool = await response.json();
            return tool;
          }
        } catch (error) {
          console.warn(`Failed to load tool manifest: ${toolId}.json`, error);
        }
        return null;
      });

      const loadedTools = await Promise.all(toolPromises);
      this.tools = loadedTools
        .filter(tool => tool !== null && tool.enabled !== false)
        .sort((a, b) => (a.order || 999) - (b.order || 999));

      console.log(`Loaded ${this.tools.length} tools:`, this.tools.map(t => t.name));
    } catch (error) {
      console.error('Error loading tools:', error);
      this.tools = [];
    }
  }

  /**
   * Render all tools as cards
   */
  renderTools() {
    if (!this.toolsContainer) return;

    // Clear existing content
    this.toolsContainer.innerHTML = '';

    // Render each tool
    this.tools.forEach(tool => {
      const toolCard = this.createToolCard(tool);
      this.toolsContainer.appendChild(toolCard);
    });
  }

  /**
   * Create a tool card element from a tool definition
   */
  createToolCard(tool) {
    const card = document.createElement('div');
    card.className = 'tool-card';
    card.innerHTML = `
      <div class="tool-icon">
        <i class="${tool.icon}" aria-hidden="true"></i>
      </div>
      <div class="tool-content">
        <h3>${tool.name}</h3>
        <p>${tool.description}</p>
        <button class="btn-primary tool-launch-btn" id="${tool.buttonId}">
          <i class="fas fa-play" aria-hidden="true"></i>
          Launch Tool
        </button>
      </div>
    `;
    return card;
  }

  /**
   * Get a tool by its ID
   */
  getTool(id) {
    return this.tools.find(tool => tool.id === id);
  }

  /**
   * Add a new tool (useful for dynamic tool loading)
   */
  addTool(tool) {
    if (tool.enabled !== false) {
      this.tools.push(tool);
      this.tools.sort((a, b) => (a.order || 999) - (b.order || 999));
      this.renderTools();
    }
  }

  /**
   * Remove a tool by ID
   */
  removeTool(id) {
    this.tools = this.tools.filter(tool => tool.id !== id);
    this.renderTools();
  }
}

// Export for use in other modules
window.ToolRegistry = ToolRegistry;