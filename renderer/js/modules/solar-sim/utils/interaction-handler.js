/**
 * Solar System Simulator - Interaction Handler
 * Handles mouse/touch interactions, raycasting, and object picking
 */

/**
 * Interaction Handler Class
 * Manages user interactions with 3D objects
 */
export class InteractionHandler {
  constructor(camera, renderer, THREE) {
    this.camera = camera;
    this.renderer = renderer;
    this.THREE = THREE;
    this.raycaster = new THREE.Raycaster();
    this.mouse = new THREE.Vector2();
    this.pickables = [];
    this.isDragging = false;
    this.downPos = { x: 0, y: 0 };
    this.onClickCallback = null;
    this.onDoubleClickCallback = null;
  }
  
  /**
   * Initialize event listeners
   */
  initialize() {
    const canvas = this.renderer.domElement;
    
    canvas.addEventListener('mousedown', (e) => this.onMouseDown(e));
    canvas.addEventListener('mousemove', (e) => this.onMouseMove(e));
    canvas.addEventListener('mouseup', (e) => this.onMouseUp(e));
    canvas.addEventListener('dblclick', (e) => this.onDoubleClick(e));
  }
  
  /**
   * Set pickable objects
   */
  setPickables(objects) {
    this.pickables = objects;
  }
  
  /**
   * Set click callback
   */
  setOnClick(callback) {
    this.onClickCallback = callback;
  }
  
  /**
   * Set double-click callback
   */
  setOnDoubleClick(callback) {
    this.onDoubleClickCallback = callback;
  }
  
  /**
   * Mouse down handler
   */
  onMouseDown(event) {
    this.isDragging = false;
    this.downPos = { x: event.clientX, y: event.clientY };
  }
  
  /**
   * Mouse move handler
   */
  onMouseMove(event) {
    const distance = Math.hypot(
      event.clientX - this.downPos.x,
      event.clientY - this.downPos.y
    );
    if (distance > 5) {
      this.isDragging = true;
    }
  }
  
  /**
   * Mouse up handler - detect clicks
   */
  onMouseUp(event) {
    if (this.isDragging) return;
    
    const hitObject = this.raycast(event);
    if (hitObject && this.onClickCallback) {
      this.onClickCallback(hitObject);
    }
  }
  
  /**
   * Double-click handler
   */
  onDoubleClick(event) {
    const hitObject = this.raycast(event);
    if (hitObject && this.onDoubleClickCallback) {
      this.onDoubleClickCallback(hitObject);
    }
  }
  
  /**
   * Perform raycast
   */
  raycast(event) {
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    this.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    
    this.raycaster.setFromCamera(this.mouse, this.camera);
    const intersects = this.raycaster.intersectObjects(this.pickables, true);
    
    if (intersects.length > 0) {
      return intersects[0].object;
    }
    
    return null;
  }
  
  /**
   * Clean up event listeners
   */
  dispose() {
    const canvas = this.renderer.domElement;
    canvas.removeEventListener('mousedown', this.onMouseDown);
    canvas.removeEventListener('mousemove', this.onMouseMove);
    canvas.removeEventListener('mouseup', this.onMouseUp);
    canvas.removeEventListener('dblclick', this.onDoubleClick);
  }
}
