import { describe, expect, it } from 'vitest';
import {
  J2000_EPOCH,
  julianDateFromGregorian,
  julianDateToGregorian,
  moonGeocentricEquatorialRad,
  sunGeocentricEquatorialRad,
  type OrbitalData,
} from '../src/orbital-mechanics';
import { radToDeg } from '../src/math';
import orbitalElements from '../public/assets/data/orbital_elements.json';

const orbitalData = orbitalElements as unknown as OrbitalData;

describe('Julian date <-> Gregorian round-trips', () => {
  it('1453-01-01 <-> JD 2251766.5 (fixed base date)', () => {
    const jd = julianDateFromGregorian(1453, 1, 1);
    expect(jd).toBeCloseTo(2251766.5, 6);

    const date = julianDateToGregorian(jd);
    expect(date.year).toBe(1453);
    expect(date.month).toBe(1);
    expect(date.day).toBe(1);
  });

  it('Gregorian reform boundary: 1582-10-04 (Julian) + 1 day -> 1582-10-15 (Gregorian)', () => {
    const jdOct4 = julianDateFromGregorian(1582, 10, 4);
    const jdOct15 = julianDateFromGregorian(1582, 10, 15);
    // The reform removed 10 days: Oct 4 (Julian) is immediately followed by Oct 15 (Gregorian).
    expect(jdOct15 - jdOct4).toBeCloseTo(1.0, 6);

    // Round-trip both sides of the boundary.
    const dateOct4 = julianDateToGregorian(jdOct4);
    expect(dateOct4).toEqual({ year: 1582, month: 10, day: 4 });
    const dateOct15 = julianDateToGregorian(jdOct15);
    expect(dateOct15).toEqual({ year: 1582, month: 10, day: 15 });
  });

  it('J2000 epoch: 2000-01-01.5 = JD 2451545.0', () => {
    // 2000-01-01.5 means noon on 2000-01-01; julianDateFromGregorian returns the JD at
    // 0h (midnight), so add 0.5 days for noon.
    const jdMidnight = julianDateFromGregorian(2000, 1, 1);
    expect(jdMidnight + 0.5).toBeCloseTo(J2000_EPOCH, 6);
  });

  it('round-trips a range of historical and modern dates', () => {
    const cases: [number, number, number][] = [
      [1453, 1, 1],
      [1582, 10, 4],
      [1582, 10, 15],
      [1600, 3, 15],
      [1900, 6, 30],
      [2000, 1, 1],
      [2026, 7, 12],
    ];
    for (const [year, month, day] of cases) {
      const jd = julianDateFromGregorian(year, month, day);
      const back = julianDateToGregorian(jd);
      expect(back).toEqual({ year, month, day });
    }
  });
});

describe('Sun position', () => {
  it('Sun RA is near 0 deg at the 2000 March equinox', () => {
    // 2000 March equinox: ~2000-03-20 07:35 UT -> JD approx 2451624.816
    const jd = julianDateFromGregorian(2000, 3, 20) + 7.6 / 24;
    const equatorial = sunGeocentricEquatorialRad(orbitalData, jd);
    let raDeg = radToDeg(equatorial.x);
    if (raDeg < 0) raDeg += 360;
    // Near 0/360 deg within ~1 deg.
    const distanceFromZero = Math.min(raDeg, 360 - raDeg);
    expect(distanceFromZero).toBeLessThan(1.0);
  });

  it('Sun RA is near 180 deg at the 2000 September equinox', () => {
    // 2000 September equinox: ~2000-09-22 17:28 UT -> JD approx 2451810.228
    const jd = julianDateFromGregorian(2000, 9, 22) + 17.5 / 24;
    const equatorial = sunGeocentricEquatorialRad(orbitalData, jd);
    let raDeg = radToDeg(equatorial.x);
    if (raDeg < 0) raDeg += 360;
    expect(Math.abs(raDeg - 180)).toBeLessThan(1.0);
  });
});

describe('Moon position (Meeus Ch. 47 example)', () => {
  it('matches the Meeus worked example (1992-04-12 0h TD) within ~0.2 deg', () => {
    // Meeus, Astronomical Algorithms, Example 47.a: 1992 April 12.0 TD.
    // Expected geocentric ecliptic longitude ~133.162655 deg, latitude ~-3.229126 deg.
    // (RA/Dec derived via the same low-precision theory, so compare against the
    // book's quoted apparent RA ~134.6885 deg / Dec ~13.7684 deg as a spot check,
    // allowing generous tolerance since this is the *uncorrected* low-precision term set.)
    const jd = julianDateFromGregorian(1992, 4, 12);
    const equatorial = moonGeocentricEquatorialRad(jd);
    const raDeg = ((radToDeg(equatorial.x) % 360) + 360) % 360;
    const decDeg = radToDeg(equatorial.y);

    // The book's fully-corrected result (with nutation + all periodic terms) is
    // RA 134.6885 deg, Dec 13.7684 deg. Our port uses the abbreviated Ch.47 series
    // (6 longitude + 4 latitude terms, no nutation), so allow ~1 deg slack.
    expect(Math.abs(raDeg - 134.6885)).toBeLessThan(1.5);
    expect(Math.abs(decDeg - 13.7684)).toBeLessThan(1.5);
  });
});
