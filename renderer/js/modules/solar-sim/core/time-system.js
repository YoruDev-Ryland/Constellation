/**
 * Solar System Simulator - Time System
 * Handles Julian Date calculations and time management
 */

import { DAYS_TO_SECONDS } from './constants.js';

/**
 * Convert JavaScript Date to Julian Date
 * @param {Date} date - JavaScript Date object
 * @returns {number} Julian Date
 */
export function dateToJD(date) {
  const y = date.getUTCFullYear();
  const m = date.getUTCMonth() + 1;
  const d = date.getUTCDate();
  const h = date.getUTCHours();
  const min = date.getUTCMinutes();
  const s = date.getUTCSeconds() + date.getUTCMilliseconds() / 1000;
  
  // Julian day number algorithm
  const a = Math.floor((14 - m) / 12);
  const y2 = y + 4800 - a;
  const m2 = m + 12 * a - 3;
  
  const jdn = d + Math.floor((153 * m2 + 2) / 5) + 365 * y2 
            + Math.floor(y2 / 4) - Math.floor(y2 / 100) 
            + Math.floor(y2 / 400) - 32045;
  
  // Add fractional day
  const fracDay = (h - 12) / 24 + min / 1440 + s / 86400;
  
  return jdn + fracDay;
}

/**
 * Convert Julian Date to JavaScript Date
 * @param {number} jd - Julian Date
 * @returns {Date} JavaScript Date object
 */
export function jdToDate(jd) {
  const z = Math.floor(jd + 0.5);
  const f = (jd + 0.5) - z;
  
  let a = z;
  if (z >= 2299161) {
    const alpha = Math.floor((z - 1867216.25) / 36524.25);
    a = z + 1 + alpha - Math.floor(alpha / 4);
  }
  
  const b = a + 1524;
  const c = Math.floor((b - 122.1) / 365.25);
  const d = Math.floor(365.25 * c);
  const e = Math.floor((b - d) / 30.6001);
  
  const day = b - d - Math.floor(30.6001 * e) + f;
  const month = e < 14 ? e - 1 : e - 13;
  const year = month > 2 ? c - 4716 : c - 4715;
  
  const dayInt = Math.floor(day);
  const fracDay = day - dayInt;
  
  const hours = fracDay * 24;
  const minutes = (hours - Math.floor(hours)) * 60;
  const seconds = (minutes - Math.floor(minutes)) * 60;
  
  return new Date(Date.UTC(
    year,
    month - 1,
    dayInt,
    Math.floor(hours),
    Math.floor(minutes),
    Math.floor(seconds)
  ));
}

/**
 * Convert Julian Date to Gregorian calendar components
 * @param {number} jd - Julian Date
 * @returns {Object} Object with year, month, day properties
 */
export function jdToGregorian(jd) {
  const z = Math.floor(jd + 0.5);
  const f = (jd + 0.5) - z;
  
  let a = z;
  if (z >= 2299161) {
    const alpha = Math.floor((z - 1867216.25) / 36524.25);
    a = z + 1 + alpha - Math.floor(alpha / 4);
  }
  
  const b = a + 1524;
  const c = Math.floor((b - 122.1) / 365.25);
  const d = Math.floor(365.25 * c);
  const e = Math.floor((b - d) / 30.6001);
  
  const day = b - d - Math.floor(30.6001 * e) + f;
  const month = e < 14 ? e - 1 : e - 13;
  const year = month > 2 ? c - 4716 : c - 4715;
  
  return { year, month, day };
}

/**
 * Time Manager Class
 * Manages simulation time and time warp
 */
export class TimeManager {
  constructor() {
    this.timeWarp = 1.0;          // Real-time multiplier
    this.simulationJD = dateToJD(new Date());
    this.lastFrameTime = performance.now();
    this.isPaused = false;
  }
  
  /**
   * Update simulation time
   * @returns {number} Current simulation Julian Date
   */
  update() {
    if (this.isPaused) {
      this.lastFrameTime = performance.now();
      return this.simulationJD;
    }
    
    const now = performance.now();
    const deltaMs = now - this.lastFrameTime;
    this.lastFrameTime = now;
    
    const deltaSec = deltaMs / 1000;
    const simDeltaSec = deltaSec * this.timeWarp;
    this.simulationJD += simDeltaSec / DAYS_TO_SECONDS;
    
    return this.simulationJD;
  }
  
  /**
   * Set time warp multiplier
   * @param {number} warp - Time multiplier (0 = paused, 1 = real-time, etc.)
   */
  setTimeWarp(warp) {
    this.timeWarp = warp;
    this.isPaused = (warp === 0);
  }
  
  /**
   * Get current simulation time as Date
   * @returns {Date} Current simulation time
   */
  getDate() {
    return jdToDate(this.simulationJD);
  }
  
  /**
   * Set simulation time to specific date
   * @param {Date} date - Date to set
   */
  setDate(date) {
    this.simulationJD = dateToJD(date);
  }
  
  /**
   * Get current Julian Date
   * @returns {number} Current simulation JD
   */
  getJD() {
    return this.simulationJD;
  }
  
  /**
   * Set Julian Date directly
   * @param {number} jd - Julian Date to set
   */
  setJD(jd) {
    this.simulationJD = jd;
  }
  
  /**
   * Pause simulation
   */
  pause() {
    this.isPaused = true;
    this.timeWarp = 0;
  }
  
  /**
   * Resume simulation
   */
  resume() {
    this.isPaused = false;
    if (this.timeWarp === 0) {
      this.timeWarp = 1;
    }
  }
}
