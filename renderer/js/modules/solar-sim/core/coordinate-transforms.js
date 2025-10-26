/**
 * Solar System Simulator - Coordinate Transformations
 * Handles coordinate system conversions between different reference frames
 */

import { DEG2RAD, OBLIQUITY_RAD } from './constants.js';

/**
 * Convert RA/Dec (J2000 equatorial) to unit vector
 * Standard equatorial frame: +X toward vernal equinox, +Y toward 90° RA in equator, +Z toward north celestial pole
 * @param {number} raDeg - Right Ascension in degrees
 * @param {number} decDeg - Declination in degrees
 * @returns {Object} Unit vector {x, y, z} in equatorial J2000 frame
 */
export function raDecToUnitVectorEQJ(raDeg, decDeg) {
  const raRad = raDeg * DEG2RAD;
  const decRad = decDeg * DEG2RAD;
  const cosDec = Math.cos(decRad);
  
  return {
    x: Math.cos(raRad) * cosDec,
    y: Math.sin(raRad) * cosDec,
    z: Math.sin(decRad)
  };
}

/**
 * Convert ecliptic coordinates to equatorial (J2000)
 * @param {number} x - Ecliptic X
 * @param {number} y - Ecliptic Y
 * @param {number} z - Ecliptic Z
 * @returns {Object} {x, y, z} in equatorial frame
 */
export function eclipticToEquatorial(x, y, z) {
  const cosE = Math.cos(OBLIQUITY_RAD);
  const sinE = Math.sin(OBLIQUITY_RAD);
  
  return {
    x: x,
    y: y * cosE - z * sinE,
    z: y * sinE + z * cosE
  };
}

/**
 * Convert equatorial (J2000) to ecliptic coordinates
 * @param {number} x - Equatorial X
 * @param {number} y - Equatorial Y
 * @param {number} z - Equatorial Z
 * @returns {Object} {x, y, z} in ecliptic frame
 */
export function equatorialToEcliptic(x, y, z) {
  const cosE = Math.cos(OBLIQUITY_RAD);
  const sinE = Math.sin(OBLIQUITY_RAD);
  
  return {
    x: x,
    y: y * cosE + z * sinE,
    z: -y * sinE + z * cosE
  };
}

/**
 * Convert ECI (Earth-Centered Inertial) to ecliptic coordinates
 * ECI is effectively equatorial J2000 for satellites
 * @param {number} x - ECI X (km)
 * @param {number} y - ECI Y (km)
 * @param {number} z - ECI Z (km)
 * @returns {Object} {x, y, z} in ecliptic frame (km)
 */
export function eciToEcliptic(x, y, z) {
  return equatorialToEcliptic(x, y, z);
}

/**
 * Convert ecliptic to ECI coordinates
 * @param {number} x - Ecliptic X (km)
 * @param {number} y - Ecliptic Y (km)
 * @param {number} z - Ecliptic Z (km)
 * @returns {Object} {x, y, z} in ECI frame (km)
 */
export function eclipticToEci(x, y, z) {
  return eclipticToEquatorial(x, y, z);
}

/**
 * Convert heliocentric position to geocentric
 * @param {Object} bodyPos - {x, y, z} heliocentric position
 * @param {Object} earthPos - {x, y, z} Earth's heliocentric position
 * @returns {Object} {x, y, z} geocentric position
 */
export function heliocentricToGeocentric(bodyPos, earthPos) {
  return {
    x: bodyPos.x - earthPos.x,
    y: bodyPos.y - earthPos.y,
    z: bodyPos.z - earthPos.z
  };
}

/**
 * Get ecliptic north pole unit vector (for camera up)
 * @returns {Object} {x, y, z} unit vector pointing to ecliptic north
 */
export function getEclipticNorthPole() {
  return raDecToUnitVectorEQJ(270.0, 66.56);
}
