import { describe, expect, it } from 'vitest';
import {
  celestialToModelSpace,
  clipUnitSegmentToVisibleHemisphere,
  globeOrientationFromYawPitch,
  isVisibleInView,
  orthographicRaDecDegToXy,
  unitVectorFromRaDecDeg,
  yawPitchFacingCelestial,
} from '../src/celestial-projection';

describe('yawPitchFacingCelestial + projection round-trip', () => {
  it('centers the target RA/Dec at the screen origin for a range of coordinates', () => {
    const cases: [number, number][] = [
      [0, 0],
      [90, 45],
      [180, -30],
      [270, 60],
      [10, -80],
      [359, 89],
      [123.456, -12.34],
    ];

    for (const [ra, dec] of cases) {
      const { yaw, pitch } = yawPitchFacingCelestial(ra, dec);
      const basis = globeOrientationFromYawPitch(yaw, pitch);
      const xy = orthographicRaDecDegToXy(ra, dec, 100, basis);
      expect(xy).not.toBeNull();
      expect(xy!.x).toBeCloseTo(0, 6);
      expect(xy!.y).toBeCloseTo(0, 6);
    }
  });
});

describe('hemisphere clipping', () => {
  it('clips a segment crossing the visible/hidden boundary such that the clipped endpoint has view.z ~ 0', () => {
    // Face the globe toward RA=0, Dec=0. A segment from RA=0 (visible, near view.z=1)
    // to RA=100 (hidden, past the +/-90deg horizon) crosses the terminator; the clipped
    // endpoint must land on the horizon (view.z ~ 0). (Using antipodal endpoints here would
    // be a degenerate case -- the lerp midpoint of two exactly-opposite unit vectors is the
    // zero vector regardless of t, in both this port and the source GDScript.)
    const { yaw, pitch } = yawPitchFacingCelestial(0, 0);
    const basis = globeOrientationFromYawPitch(yaw, pitch);

    const startUnit = unitVectorFromRaDecDeg(0, 0);
    const endUnit = unitVectorFromRaDecDeg(100, 0);

    const clipped = clipUnitSegmentToVisibleHemisphere(startUnit, endUnit, basis);
    expect(clipped.length).toBe(2);

    // One endpoint should be the original visible point (view.z ~ 1), the other the
    // clipped boundary point (view.z ~ 0).
    const zValues = clipped.map((v) => v.z).sort((a, b) => a - b);
    expect(Math.abs(zValues[0])).toBeLessThan(1e-6);
    expect(zValues[1]).toBeCloseTo(1, 3);
  });

  it('returns both endpoints unclipped when fully visible', () => {
    const { yaw, pitch } = yawPitchFacingCelestial(0, 0);
    const basis = globeOrientationFromYawPitch(yaw, pitch);
    const startUnit = unitVectorFromRaDecDeg(-10, 0);
    const endUnit = unitVectorFromRaDecDeg(10, 0);
    const clipped = clipUnitSegmentToVisibleHemisphere(startUnit, endUnit, basis);
    expect(clipped.length).toBe(2);
    expect(isVisibleInView(clipped[0])).toBe(true);
    expect(isVisibleInView(clipped[1])).toBe(true);
  });

  it('returns an empty array when fully hidden', () => {
    const { yaw, pitch } = yawPitchFacingCelestial(0, 0);
    const basis = globeOrientationFromYawPitch(yaw, pitch);
    const startUnit = unitVectorFromRaDecDeg(170, 0);
    const endUnit = unitVectorFromRaDecDeg(190, 0);
    const clipped = clipUnitSegmentToVisibleHemisphere(startUnit, endUnit, basis);
    expect(clipped.length).toBe(0);
  });
});

describe('celestialToModelSpace', () => {
  it('maps celestial Z (north pole) to model Y (up)', () => {
    const northPole = unitVectorFromRaDecDeg(0, 90);
    const model = celestialToModelSpace(northPole);
    expect(model.y).toBeCloseTo(1, 6);
  });
});
