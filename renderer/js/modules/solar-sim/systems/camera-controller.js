/**
 * Solar System Simulator - Camera Controller
 * Manages camera positioning, focus, and following
 */

import { AU_KM, KM_PER_UNIT } from '../core/constants.js';
import { getEclipticNorthPole, raDecToUnitVectorEQJ } from '../core/coordinate-transforms.js';

/**
 * Camera Controller Class
 * Handles camera movement, focus, and chase-cam
 */
export class CameraController {
  constructor(camera, controls, THREE) {
    this.camera = camera;
    this.controls = controls;
    this.THREE = THREE;
    this.followingObject = null;
    this.focusedObject = null;
    this.focusedBodyId = null;
    this.cameraMode = 'ecliptic'; // or 'rotation-axis'
    this.animationFlagSetter = null; // Kept for compatibility
    this.followOffsetWorld = new THREE.Vector3(); // Camera offset from target in world space
    this.lastControlTime = 0; // Track when user last interacted with controls
    this.CONTROLS_GRACE_MS = 500; // Grace period after user interaction (increased for smoother UX)
  }
  
  /**
   * Initialize camera and controls
   */
  initialize() {
    // Set initial camera position - view from above the ecliptic plane
    // In ecliptic coordinates: Z is north, XY is the orbital plane
    const distance = 2000;
    
    // Camera up vector is already set in main.js to (0, 0, 1)
    
    // Position camera above and to the side for a nice oblique view
    // This gives a good view of the orbital plane
    this.camera.position.set(
      distance * 0.5,  // X - to the side
      distance * 0.5,  // Y - to the other side  
      distance * 0.707 // Z - above (45 degrees elevation)
    );
    
    // Point camera at origin
    this.controls.target.set(0, 0, 0);
    this.camera.lookAt(0, 0, 0);
    
    // Update controls to apply initial settings
    this.controls.update();
    
    // Set up control event listeners to track user interaction
    this.controls.addEventListener('start', () => {
      this.lastControlTime = performance.now();
    });
    this.controls.addEventListener('change', () => {
      this.lastControlTime = performance.now();
    });
    this.controls.addEventListener('end', () => {
      this.lastControlTime = performance.now();
    });
  }
  
  /**
   * Update camera up vector based on mode
   */
  updateCameraUp() {
    let upVec;
    
    if (this.cameraMode === 'ecliptic' || !this.focusedBodyId) {
      // In ecliptic frame, north pole is simply +Z
      upVec = { x: 0, y: 0, z: 1 };
    } else {
      // Get IAU pole for focused body
      const IAU_POLE_RADEC = new Map([
        [10,  [286.13, 63.87]],
        [199, [281.01, 61.45]],
        [299, [272.76, 67.16]],
        [399, [0.00, 90.00]],
        [499, [317.681, 52.887]],
        [599, [268.057, 64.496]],
        [699, [40.589, 83.537]],
        [799, [257.311, -15.175]],
        [899, [299.36, 43.46]],
        [999, [132.993, -6.163]]
      ]);
      
      const radec = IAU_POLE_RADEC.get(this.focusedBodyId);
      if (radec) {
        upVec = raDecToUnitVectorEQJ(radec[0], radec[1]);
      } else {
        upVec = { x: 0, y: 0, z: 1 };
      }
    }
    
    this.camera.up.set(upVec.x, upVec.y, upVec.z);
    
    // Force OrbitControls to recognize the new up vector
    if (this.controls && this.controls.update) {
      this.controls.update();
    }
  }
  
  /**
   * Soft orient - reorient camera to look at object
   */
  softOrient(object, bodyId = null) {
    const targetPos = new this.THREE.Vector3();
    object.getWorldPosition(targetPos);
    
    this.controls.target.copy(targetPos);
    this.focusedObject = object;
    this.focusedBodyId = bodyId;
    this.followingObject = null;
    
    this.updateCameraUp();
    this.updateClipPlanes();
  }
  
  /**
   * Hard focus - animate to object and follow
   */
  focusOnObject(object, bodyId = null, options = {}) {
    // Check if GSAP is available
    if (typeof gsap === 'undefined') {
      console.warn('GSAP not loaded, using instant focus');
      this.softOrient(object, bodyId);
      return;
    }
    
    const targetPos = new this.THREE.Vector3();
    object.getWorldPosition(targetPos);
    
    // Try to get radius from: userData, geometry parameters, or fallback to 1
    const radius = object.userData?.radius || 
                   object.geometry?.parameters?.radius || 
                   (object.children?.[0]?.geometry?.parameters?.radius) || 
                   1;
    const multiplier = options.distanceMultiplier || 3;
    const targetDist = radius * multiplier;
    
    // Calculate direction from current camera position to target
    const directionToTarget = targetPos.clone()
      .sub(this.camera.position)
      .normalize();
    
    // New camera position: approach from current direction, end up at desired distance
    const newCameraPos = targetPos.clone()
      .sub(directionToTarget.multiplyScalar(targetDist));
    
    // Store starting positions
    const startCameraPos = this.camera.position.clone();
    const startTarget = this.controls.target.clone();
    
    // Temporarily disable following during transition
    const oldFollowingObject = this.followingObject;
    this.followingObject = null;
    
    // Create interpolation object for smooth animation
    const animProxy = {
      progress: 0
    };
    
    // Animate using a single progress value
    gsap.to(animProxy, {
      progress: 1,
      duration: 2,
      ease: "power2.inOut",
      onUpdate: () => {
        const t = animProxy.progress;
        
        // Interpolate camera position
        this.camera.position.lerpVectors(startCameraPos, newCameraPos, t);
        
        // Interpolate look-at target
        this.controls.target.lerpVectors(startTarget, targetPos, t);
        
        // Update controls to apply the new orientation
        this.controls.update();
      },
      onComplete: () => {
        // Set following after animation completes
        this.followingObject = object;
        this.focusedObject = object;
        this.focusedBodyId = bodyId;
        this.updateCameraUp();
        this.updateClipPlanes();
      }
    });
  }
  
  /**
   * Update following (chase-cam)
   * Moves camera and target together to follow the object's motion through space
   */
  updateFollowing() {
    if (!this.followingObject || !this.followingObject.parent) return;
    
    const worldPos = new this.THREE.Vector3();
    this.followingObject.getWorldPosition(worldPos);
    
    // Always keep target on the object
    this.controls.target.copy(worldPos);
    
    // Only enforce camera position when user isn't actively controlling
    const userIsControlling = (performance.now() - this.lastControlTime) < this.CONTROLS_GRACE_MS;
    if (!userIsControlling) {
      // Set camera position to object position + saved offset
      this.camera.position.copy(worldPos).add(this.followOffsetWorld);
    }
  }
  
  /**
   * Update dynamic clipping planes
   */
  updateClipPlanes() {
    // With logarithmic depth buffer, we can use very large ranges
    const starSphereRadius = 1e10 / KM_PER_UNIT; // Stars at 10 billion km = 1 million units
    
    if (!this.focusedObject) {
      // Default planes for wide view - render basically everything
      this.camera.far = 1e9;  // 1 billion units (10 trillion km)
      this.camera.near = 0.01;
      this.camera.updateProjectionMatrix();
      return;
    }
    
    const dist = this.camera.position.distanceTo(this.controls.target);
    const r = this.focusedObject.userData?.radius || 
              this.focusedObject.geometry?.parameters?.radius || 
              (this.focusedObject.children?.[0]?.geometry?.parameters?.radius) || 
              1;
    
    // Near plane: stay ahead of surface but keep it reasonable
    const gap = Math.max(dist - r, 1e-6);
    this.camera.near = Math.max(
      Math.min(0.1 * gap, 0.01 * r),
      0.00001  // Minimum near plane - very close
    );
    
    // Far plane: Always render the entire solar system and stars
    this.camera.far = 1e9;  // 1 billion units - render everything
    
    this.camera.updateProjectionMatrix();
  }
  
  /**
   * Update camera each frame
   */
  update() {
    this.updateFollowing();
    this.controls.update();
    
    // Update the offset after controls update (in case user is adjusting view)
    if (this.followingObject) {
      this.followOffsetWorld.copy(this.camera.position).sub(this.controls.target);
    }
  }
  
  /**
   * Set camera mode
   */
  setCameraMode(mode) {
    this.cameraMode = mode;
    this.updateCameraUp();
  }
  
  /**
   * Stop following
   */
  stopFollowing() {
    this.followingObject = null;
  }
}
