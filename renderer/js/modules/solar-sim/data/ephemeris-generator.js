/**
 * Solar System Simulator - Sample Ephemeris Data
 * Provides simplified orbital positions for planets
 * Note: This is simplified Keplerian orbits, not precise ephemeris
 */

import { AU_KM, PLANET_IDS } from '../core/constants.js';
import { dateToJD } from '../core/time-system.js';

/**
 * Simplified orbital elements (J2000.0 epoch = JD 2451545.0)
 * a: semi-major axis (AU)
 * e: eccentricity
 * i: inclination (degrees)
 * Omega: longitude of ascending node (degrees)
 * omega: argument of periapsis (degrees)
 * L0: mean longitude at J2000.0 epoch (degrees)
 * period: orbital period (days)
 */
const ORBITAL_ELEMENTS = {
  199: { a: 0.387098, e: 0.205630, i: 7.005,   Omega: 48.331,   omega: 29.124,   L0: 252.251, period: 87.969 },    // Mercury
  299: { a: 0.723332, e: 0.006772, i: 3.395,   Omega: 76.680,   omega: 54.884,   L0: 181.979, period: 224.701 },   // Venus
  399: { a: 1.000003, e: 0.016709, i: 0.0,     Omega: 0.0,      omega: 102.937,  L0: 100.464, period: 365.256 },   // Earth
  499: { a: 1.523710, e: 0.093394, i: 1.850,   Omega: 49.558,   omega: 286.502,  L0: 355.453, period: 686.980 },   // Mars
  599: { a: 5.202887, e: 0.048498, i: 1.303,   Omega: 100.464,  omega: 273.867,  L0: 34.396,  period: 4332.589 },  // Jupiter
  699: { a: 9.536676, e: 0.053862, i: 2.485,   Omega: 113.665,  omega: 339.392,  L0: 49.954,  period: 10759.22 },  // Saturn
  799: { a: 19.18917, e: 0.047257, i: 0.773,   Omega: 74.006,   omega: 96.998,   L0: 313.232, period: 30685.4 },   // Uranus
  899: { a: 30.06992, e: 0.008606, i: 1.770,   Omega: 131.784,  omega: 273.187,  L0: 304.880, period: 60189.0 },   // Neptune
  999: { a: 39.48211, e: 0.248808, i: 17.140,  Omega: 110.299,  omega: 113.834,  L0: 238.929, period: 90560.0 }    // Pluto
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
  const L0 = elem.L0 * (Math.PI / 180); // Mean longitude at J2000.0 in radians
  const period = elem.period; // Orbital period in days
  
  // J2000.0 epoch
  const J2000 = 2451545.0;
  
  for (let d = 0; d <= days; d += step) {
    const jd = startJD + d;
    
    // Days since J2000.0 epoch
    const T = jd - J2000;
    
    // Mean longitude at current time
    const L = L0 + (2 * Math.PI * T / period);
    
    // Longitude of perihelion
    const perihelionLongitude = omega + Omega;
    
    // Mean anomaly = Mean longitude - longitude of perihelion
    const M = L - perihelionLongitude;
    
    // Solve for eccentric anomaly using Newton's method (more accurate)
    let E = M;
    for (let iter = 0; iter < 10; iter++) {
      const dE = (E - e * Math.sin(E) - M) / (1 - e * Math.cos(E));
      E -= dE;
      if (Math.abs(dE) < 1e-8) break;
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
  // Use current date as center, generate data for ±2 years
  const now = new Date();
  const startDate = new Date(now.getTime() - (730 * 24 * 60 * 60 * 1000)); // 2 years ago
  const startJD = dateToJD(startDate);
  const totalDays = 730 * 2; // 4 years total span
  
  const ephemerisData = {};
  
  for (const bodyId of PLANET_IDS) {
    if (bodyId === 10) {
      // Sun at origin
      const data = [];
      for (let i = 0; i <= totalDays; i += 1) {
        data.push([startJD + i, 0, 0, 0]);
      }
      ephemerisData[bodyId] = data;
    } else {
      const elem = ORBITAL_ELEMENTS[bodyId];
      if (elem) {
        // Sample with high enough resolution for smooth interpolation
        // Use smaller step for inner planets, larger for outer
        const period = elem.period;
        const samplesPerOrbit = 200; // 200 points per orbit
        const step = Math.max(1, period / samplesPerOrbit); // At least 1 day
        
        ephemerisData[bodyId] = generatePlanetEphemeris(bodyId, startJD, totalDays, step);
      }
    }
  }
  
  console.log('Generated ephemeris data for', Object.keys(ephemerisData).length, 'bodies');
  console.log(`Time span: ${startDate.toISOString()} to ${new Date(startDate.getTime() + totalDays * 24 * 60 * 60 * 1000).toISOString()}`);
  return ephemerisData;
}
