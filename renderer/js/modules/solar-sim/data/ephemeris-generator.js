/**
 * Solar System Simulator - Sample Ephemeris Data
 * Provides simplified orbital positions for planets
 * Note: This is simplified Keplerian orbits, not precise ephemeris
 */

import { AU_KM, PLANET_IDS } from '../core/constants.js';
import { dateToJD } from '../core/time-system.js';

/**
 * Simplified orbital elements (approximate, J2000 epoch)
 * a: semi-major axis (AU)
 * e: eccentricity
 * i: inclination (degrees)
 * Omega: longitude of ascending node (degrees)
 * omega: argument of periapsis (degrees)
 * period: orbital period (days)
 */
const ORBITAL_ELEMENTS = {
  199: { a: 0.387, e: 0.206, i: 7.0,   Omega: 48.3,   omega: 29.1,   period: 87.97 },    // Mercury
  299: { a: 0.723, e: 0.007, i: 3.4,   Omega: 76.7,   omega: 54.9,   period: 224.7 },    // Venus
  399: { a: 1.000, e: 0.017, i: 0.0,   Omega: 0.0,    omega: 102.9,  period: 365.26 },   // Earth
  499: { a: 1.524, e: 0.093, i: 1.8,   Omega: 49.6,   omega: 286.5,  period: 686.98 },   // Mars
  599: { a: 5.203, e: 0.048, i: 1.3,   Omega: 100.5,  omega: 273.9,  period: 4332.6 },   // Jupiter
  699: { a: 9.537, e: 0.054, i: 2.5,   Omega: 113.7,  omega: 339.4,  period: 10759 },    // Saturn
  799: { a: 19.19, e: 0.047, i: 0.8,   Omega: 74.0,   omega: 96.6,   period: 30687 },    // Uranus
  899: { a: 30.07, e: 0.009, i: 1.8,   Omega: 131.8,  omega: 273.2,  period: 60190 },    // Neptune
  999: { a: 39.48, e: 0.249, i: 17.2,  Omega: 110.3,  omega: 113.8,  period: 90560 }     // Pluto
};

/**
 * Generate ephemeris data for a planet using simplified Keplerian orbits
 */
function generatePlanetEphemeris(bodyId, startJD, days, step) {
  if (bodyId === 10) {
    // Sun at origin
    const data = [];
    for (let d = 0; d <= days; d += step) {
      data.push([startJD + d, 0, 0, 0]);
    }
    return data;
  }
  
  const elem = ORBITAL_ELEMENTS[bodyId];
  if (!elem) return [];
  
  const data = [];
  const a = elem.a * AU_KM; // Semi-major axis in km
  const e = elem.e;         // Eccentricity
  const i = elem.i * (Math.PI / 180); // Inclination in radians
  const Omega = elem.Omega * (Math.PI / 180); // Longitude of ascending node in radians
  const omega = elem.omega * (Math.PI / 180); // Argument of periapsis in radians
  const period = elem.period; // Orbital period in days
  
  for (let d = 0; d <= days; d += step) {
    const jd = startJD + d;
    
    // Mean anomaly
    const M = (2 * Math.PI * d / period) % (2 * Math.PI);
    
    // Solve for eccentric anomaly (simple iteration)
    let E = M;
    for (let iter = 0; iter < 5; iter++) {
      E = M + e * Math.sin(E);
    }
    
    // True anomaly
    const nu = 2 * Math.atan2(
      Math.sqrt(1 + e) * Math.sin(E / 2),
      Math.sqrt(1 - e) * Math.cos(E / 2)
    );
    
    // Distance
    const r = a * (1 - e * Math.cos(E));
    
    // Position in orbital plane
    const xOrb = r * Math.cos(nu);
    const yOrb = r * Math.sin(nu);
    
    // Rotate to ecliptic frame
    // Apply argument of periapsis (rotation in orbital plane)
    const cosOmega = Math.cos(omega);
    const sinOmega = Math.sin(omega);
    const x1 = xOrb * cosOmega - yOrb * sinOmega;
    const y1 = xOrb * sinOmega + yOrb * cosOmega;
    
    // Apply inclination (rotation around X-axis)
    const cosI = Math.cos(i);
    const sinI = Math.sin(i);
    const x2 = x1;
    const y2 = y1 * cosI;
    const z2 = y1 * sinI;
    
    // Apply longitude of ascending node (rotation around Z-axis)
    const cosOmegaAN = Math.cos(Omega);
    const sinOmegaAN = Math.sin(Omega);
    const x = x2 * cosOmegaAN - y2 * sinOmegaAN;
    const y = x2 * sinOmegaAN + y2 * cosOmegaAN;
    const z = z2;
    
    data.push([jd, x, y, z]);
  }
  
  return data;
}

/**
 * Generate ephemeris data for all planets
 */
export function generateEphemerisData() {
  const startDate = new Date('2025-01-01T00:00:00Z');
  const startJD = dateToJD(startDate);
  
  const ephemerisData = {};
  
  for (const bodyId of PLANET_IDS) {
    if (bodyId === 10) {
      // Sun at origin
      const data = [];
      for (let i = 0; i <= 365; i += 1) {
        data.push([startJD + i, 0, 0, 0]);
      }
      ephemerisData[bodyId] = data;
    } else {
      const elem = ORBITAL_ELEMENTS[bodyId];
      if (elem) {
        // Sample the orbit with enough points for a smooth line
        // Use the planet's period to determine sampling
        const period = elem.period;
        const numSamples = Math.min(Math.max(Math.floor(period / 2), 100), 500);
        const step = period / numSamples;
        
        ephemerisData[bodyId] = generatePlanetEphemeris(bodyId, startJD, period, step);
      }
    }
  }
  
  console.log('Generated simplified ephemeris data for', Object.keys(ephemerisData).length, 'bodies');
  return ephemerisData;
}
