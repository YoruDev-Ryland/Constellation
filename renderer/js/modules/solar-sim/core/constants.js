/**
 * Solar System Simulator - Constants
 * Physical constants, conversion factors, and configuration values
 */

// Physical Constants
export const C = 299792.458;                    // Speed of light (km/s)
export const AU_KM = 149597870.7;               // Astronomical unit (km)
export const KM_PER_UNIT = 1e4;                 // Simulation scale (10,000 km/unit)
export const EARTH_RADIUS_KM = 6371.0;          // Earth radius (km)

// Conversion Factors
export const DEG2RAD = Math.PI / 180;
export const RAD2DEG = 180 / Math.PI;
export const HOURS_TO_SECONDS = 3600;
export const DAYS_TO_SECONDS = 86400;

// Time Constants
export const J2000_EPOCH = 2451545.0;           // JD of J2000.0 epoch

// Rendering Constants
export const SATELLITE_BASE_SCALE = 500;        // Satellite size multiplier
export const PLANET_MIN_SCALE = 1;              // Minimum planet scale
export const PLANET_MAX_SCALE = 500;            // Maximum planet scale

// Obliquity of Earth's axis (degrees)
export const OBLIQUITY_DEG = 23.43928;
export const OBLIQUITY_RAD = OBLIQUITY_DEG * DEG2RAD;

// Planet Radii (km)
export const PLANET_RADII_KM = {
  10:  696000,    // Sun
  199: 2439.7,    // Mercury
  299: 6051.8,    // Venus
  399: 6371.0,    // Earth
  499: 3389.5,    // Mars
  599: 69911,     // Jupiter
  699: 58232,     // Saturn
  799: 25362,     // Uranus
  899: 24622,     // Neptune
  999: 1188.3     // Pluto
};

// Sidereal Rotation Periods (hours)
export const SIDEREAL_ROTATION_HOURS = {
  10:  609.12,    // Sun (~25.4 days)
  199: 1407.6,    // Mercury
  299: -5832.5,   // Venus (retrograde)
  399: 23.9345,   // Earth
  499: 24.6229,   // Mars
  599: 9.9250,    // Jupiter
  699: 10.656,    // Saturn
  799: -17.24,    // Uranus (retrograde)
  899: 16.11,     // Neptune
  999: -153.29    // Pluto (retrograde)
};

// IAU Pole Orientations (RA/Dec in degrees)
export const IAU_POLE_RADEC = new Map([
  [10,  [286.13, 63.87]],    // Sun
  [199, [281.01, 61.45]],    // Mercury
  [299, [272.76, 67.16]],    // Venus
  [399, [0.00, 90.00]],      // Earth
  [499, [317.681, 52.887]],  // Mars
  [599, [268.057, 64.496]],  // Jupiter
  [699, [40.589, 83.537]],   // Saturn
  [799, [257.311, -15.175]], // Uranus
  [899, [299.36, 43.46]],    // Neptune
  [999, [132.993, -6.163]]   // Pluto
]);

// Planet Names
export const PLANET_NAMES = {
  10:  'Sun',
  199: 'Mercury',
  299: 'Venus',
  399: 'Earth',
  499: 'Mars',
  599: 'Jupiter',
  699: 'Saturn',
  799: 'Uranus',
  899: 'Neptune',
  999: 'Pluto'
};

// Planet Bodies (NAIF IDs)
export const PLANET_IDS = [10, 199, 299, 399, 499, 599, 699, 799, 899, 999];
