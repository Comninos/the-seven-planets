// Port of reference/scripts/orbital_mechanics.gd — verbatim math port.
// J2000.0 mean Keplerian elements with secular rates (NASA/JPL approximate positions).
// Heliocentric ecliptic rectangular coords (AU) -> geocentric -> J2000 equatorial RA/Dec.

import { Vec3, clamp, degToRad, fposmod, radToDeg } from './math';
import type { Vec2 } from './celestial-projection';

export const J2000_EPOCH = 2451545.0;
export const UNIX_EPOCH_JD = 2440587.5;
export const OBLIQUITY_J2000 = 0.40909280422297297; // 23.439291 deg
export const KEPLER_ITERATIONS = 10;

export interface PlanetElements {
  a: number;
  a_t?: number;
  e: number;
  e_t?: number;
  i: number;
  i_t?: number;
  w: number;
  w_t?: number;
  node: number;
  node_t?: number;
  L: number;
  L_t?: number;
}

export type OrbitalData = Record<string, PlanetElements>;

export function julianDateFromUnix(unixTime: number): number {
  return UNIX_EPOCH_JD + unixTime / 86400.0;
}

export interface GregorianDate {
  year: number;
  month: number;
  day: number;
}

export function julianDateToGregorian(jd: number): GregorianDate {
  const z = Math.floor(jd + 0.5);
  const f = jd + 0.5 - z;
  let a = z;
  if (z >= 2299161) {
    const alpha = Math.floor((z - 1867216.25) / 36524.25);
    a = z + 1 + alpha - Math.floor(alpha / 4.0);
  }
  const b = a + 1524;
  const c = Math.floor((b - 122.1) / 365.25);
  const d = Math.floor(365.25 * c);
  const e = Math.floor((b - d) / 30.6001);
  const day = b - d - Math.floor(30.6001 * e) + Math.floor(f);
  const month = e < 14 ? e - 1 : e - 13;
  const year = month > 2 ? c - 4716 : c - 4715;
  return { year, month, day };
}

/**
 * Inverse of julianDateToGregorian() for historical dates.
 * Uses the Julian calendar before the Oct 1582 reform; Gregorian thereafter.
 * Matches menu_sky_overview_globe JD_1453_01_01 (2251766.5) for 1453-01-01.
 */
export function julianDateFromGregorian(year: number, month: number, day: number): number {
  let y = year;
  let m = month;
  if (m <= 2) {
    y -= 1;
    m += 12;
  }
  let b = 0;
  if (y >= 1583 || (y === 1582 && m > 10) || (y === 1582 && m === 10 && day >= 15)) {
    const century = Math.floor(y / 100.0);
    b = 2 - century + Math.floor(century / 4.0);
  }
  return Math.floor(365.25 * (y + 4716)) + Math.floor(30.6001 * (m + 1)) + day + b - 1524.5;
}

export function wrapAngle(rad: number): number {
  return ((rad + Math.PI) % (2 * Math.PI)) - Math.PI;
}

function elementAtEpoch(
  planet: PlanetElements,
  key: 'a' | 'e' | 'i' | 'w' | 'node' | 'L',
  rateKey: 'a_t' | 'e_t' | 'i_t' | 'w_t' | 'node_t' | 'L_t',
  centuries: number
): number {
  return planet[key] + (planet[rateKey] ?? 0.0) * centuries;
}

function solveKepler(meanAnomaly: number, eccentricity: number): number {
  let eccentricAnomaly = meanAnomaly;
  for (let i = 0; i < KEPLER_ITERATIONS; i++) {
    eccentricAnomaly = meanAnomaly + eccentricity * Math.sin(eccentricAnomaly);
  }
  return eccentricAnomaly;
}

export function heliocentricEcliptic(planet: PlanetElements, julianDate: number): Vec3 {
  const centuries = (julianDate - J2000_EPOCH) / 36525.0;
  const semiMajor = elementAtEpoch(planet, 'a', 'a_t', centuries);
  const eccentricity = elementAtEpoch(planet, 'e', 'e_t', centuries);
  const inclination = degToRad(elementAtEpoch(planet, 'i', 'i_t', centuries));
  const node = degToRad(elementAtEpoch(planet, 'node', 'node_t', centuries));
  const longPerihelion = degToRad(elementAtEpoch(planet, 'w', 'w_t', centuries));
  const meanLongitude = degToRad(elementAtEpoch(planet, 'L', 'L_t', centuries));
  const argPerihelion = wrapAngle(longPerihelion - node);
  const meanAnomaly = wrapAngle(meanLongitude - longPerihelion);

  const eccentricAnomaly = solveKepler(meanAnomaly, eccentricity);
  const xOrbit = semiMajor * (Math.cos(eccentricAnomaly) - eccentricity);
  const yOrbit =
    semiMajor * Math.sqrt(Math.max(0.0, 1.0 - eccentricity * eccentricity)) * Math.sin(eccentricAnomaly);

  // Rotate from orbital plane into J2000 ecliptic frame (Meeus 33.7).
  const cosNode = Math.cos(node);
  const sinNode = Math.sin(node);
  const cosArg = Math.cos(argPerihelion);
  const sinArg = Math.sin(argPerihelion);
  const cosInc = Math.cos(inclination);
  const sinInc = Math.sin(inclination);

  const a11 = cosNode * cosArg - sinNode * sinArg * cosInc;
  const a12 = -cosNode * sinArg - sinNode * cosArg * cosInc;
  const a21 = sinNode * cosArg + cosNode * sinArg * cosInc;
  const a22 = -sinNode * sinArg + cosNode * cosArg * cosInc;
  const a31 = sinArg * sinInc;
  const a32 = cosArg * sinInc;

  return new Vec3(
    a11 * xOrbit + a12 * yOrbit,
    a21 * xOrbit + a22 * yOrbit,
    a31 * xOrbit + a32 * yOrbit
  );
}

export function geocentricEcliptic(
  planetName: string,
  orbitalData: OrbitalData,
  julianDate: number,
  earthPosition: Vec3 | null = null
): Vec3 {
  if (!(planetName in orbitalData)) {
    return new Vec3(0, 0, 0);
  }
  let earth: Vec3;
  if (earthPosition !== null) {
    earth = earthPosition;
  } else if (!('earth' in orbitalData)) {
    return new Vec3(0, 0, 0);
  } else {
    earth = heliocentricEcliptic(orbitalData['earth'], julianDate);
  }
  const heliocentric = heliocentricEcliptic(orbitalData[planetName], julianDate);
  return heliocentric.sub(earth);
}

export function eclipticToEquatorialRad(ecliptic: Vec3): Vec2 {
  const longitude = Math.atan2(ecliptic.y, ecliptic.x);
  const latitude = Math.atan2(ecliptic.z, Math.hypot(ecliptic.x, ecliptic.y));
  const sinObliquity = Math.sin(OBLIQUITY_J2000);
  const cosObliquity = Math.cos(OBLIQUITY_J2000);
  const ra = Math.atan2(
    Math.sin(longitude) * cosObliquity - Math.tan(latitude) * sinObliquity,
    Math.cos(longitude)
  );
  const dec = Math.asin(
    clamp(Math.sin(latitude) * cosObliquity + Math.cos(latitude) * sinObliquity * Math.sin(longitude), -1.0, 1.0)
  );
  return { x: ra, y: dec };
}

export function eclipticLonLatToEquatorialRad(longitude: number, latitude: number): Vec2 {
  const cosLat = Math.cos(latitude);
  return eclipticToEquatorialRad(
    new Vec3(cosLat * Math.cos(longitude), cosLat * Math.sin(longitude), Math.sin(latitude))
  );
}

export function geocentricEquatorialRad(
  planetName: string,
  orbitalData: OrbitalData,
  julianDate: number,
  earthPosition: Vec3 | null = null
): Vec2 {
  return eclipticToEquatorialRad(geocentricEcliptic(planetName, orbitalData, julianDate, earthPosition));
}

export function geocentricEclipticLatitudeDeg(
  planetName: string,
  orbitalData: OrbitalData,
  julianDate: number,
  earthPosition: Vec3 | null = null
): number {
  const geo = geocentricEcliptic(planetName, orbitalData, julianDate, earthPosition);
  return radToDeg(Math.atan2(geo.z, Math.hypot(geo.x, geo.y)));
}

export function sunGeocentricEquatorialRad(orbitalData: OrbitalData, julianDate: number): Vec2 {
  if (!('earth' in orbitalData)) {
    return { x: 0, y: 0 };
  }
  const earth = heliocentricEcliptic(orbitalData['earth'], julianDate);
  return eclipticToEquatorialRad(new Vec3(-earth.x, -earth.y, -earth.z));
}

/** Meeus Ch. 47 low-precision geocentric Moon; accurate to ~0.1 deg in J2000 ecliptic frame. */
export function moonGeocentricEquatorialRad(julianDate: number): Vec2 {
  const centuries = (julianDate - J2000_EPOCH) / 36525.0;
  const centuriesSq = centuries * centuries;
  const meanLongitude = fposmod(218.3164477 + 481267.88123421 * centuries - 0.0015786 * centuriesSq, 360.0);
  const meanElongation = fposmod(297.8501921 + 445267.1114034 * centuries - 0.0018819 * centuriesSq, 360.0);
  const meanSolarAnomaly = fposmod(357.5291092 + 35999.0502909 * centuries - 0.0001536 * centuriesSq, 360.0);
  const meanLunarAnomaly = fposmod(134.9633964 + 477198.8675055 * centuries + 0.0087414 * centuriesSq, 360.0);
  const meanArgumentLatitude = fposmod(93.272095 + 483202.0175233 * centuries - 0.0036539 * centuriesSq, 360.0);

  const d = degToRad(meanElongation);
  const m = degToRad(meanSolarAnomaly);
  const mp = degToRad(meanLunarAnomaly);
  const f = degToRad(meanArgumentLatitude);

  let longitudeDeg = meanLongitude;
  longitudeDeg += 6.289 * Math.sin(mp);
  longitudeDeg += 1.274 * Math.sin(2.0 * d - mp);
  longitudeDeg += 0.658 * Math.sin(2.0 * d);
  longitudeDeg += 0.214 * Math.sin(2.0 * mp);
  longitudeDeg -= 0.186 * Math.sin(m);
  longitudeDeg -= 0.114 * Math.sin(2.0 * f);

  let latitudeDeg = 0.0;
  latitudeDeg += 5.128 * Math.sin(f);
  latitudeDeg += 0.281 * Math.sin(mp + f);
  latitudeDeg -= 0.278 * Math.sin(mp - f);
  latitudeDeg += 0.173 * Math.sin(2.0 * d - f);

  return eclipticLonLatToEquatorialRad(degToRad(longitudeDeg), degToRad(latitudeDeg));
}
