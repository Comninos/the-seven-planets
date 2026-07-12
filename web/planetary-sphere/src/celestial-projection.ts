// Port of reference/scripts/celestial_projection.gd — verbatim math port.
// Orthographic celestial globe: unit-sphere coords, view-space projection, turntable orientation.

import { Basis, RIGHT, UP, Vec3, clamp, degToRad, radToDeg } from './math';

export const NCP_RA_DEG = 0.0;
export const NCP_DEC_DEG = 90.0;

export function unitVectorFromRaDecDeg(raDeg: number, decDeg: number): Vec3 {
  const raRad = degToRad(raDeg);
  const decRad = degToRad(decDeg);
  const cosDec = Math.cos(decRad);
  return new Vec3(cosDec * Math.cos(raRad), cosDec * Math.sin(raRad), Math.sin(decRad));
}

export interface RaDec {
  raDeg: number;
  decDeg: number;
}

export function raDecDegFromUnitVector(direction: Vec3): RaDec {
  let unit = direction;
  if (unit.lengthSquared() > 1e-12) {
    unit = unit.normalized();
  }
  const decDeg = radToDeg(Math.asin(clamp(unit.z, -1.0, 1.0)));
  let raDeg = radToDeg(Math.atan2(unit.y, unit.x));
  if (raDeg < 0.0) {
    raDeg += 360.0;
  }
  return { raDeg, decDeg };
}

/** Maps celestial coords (Z = north pole) into globe model space (Y = up, Z = depth). */
export function celestialToModelSpace(unit: Vec3): Vec3 {
  return new Vec3(unit.x, unit.z, -unit.y);
}

export function celestialUnitToGlobeView(unit: Vec3, globeOrientation: Basis): Vec3 {
  return globeOrientation.xform(celestialToModelSpace(unit));
}

export function isVisibleInView(viewPos: Vec3, epsilon = 1e-6): boolean {
  return viewPos.z > epsilon;
}

export interface Vec2 {
  x: number;
  y: number;
}

export function orthographicViewXy(viewPos: Vec3, scale: number): Vec2 {
  return { x: viewPos.x * scale, y: -viewPos.y * scale };
}

export function orthographicRaDecDegToView(
  raDeg: number,
  decDeg: number,
  globeOrientation: Basis
): Vec3 {
  return celestialUnitToGlobeView(unitVectorFromRaDecDeg(raDeg, decDeg), globeOrientation);
}

/** Returns screen offset from globe center, or null when the point lies on the hidden hemisphere. */
export function orthographicRaDecDegToXy(
  raDeg: number,
  decDeg: number,
  scale: number,
  globeOrientation: Basis
): Vec2 | null {
  const viewPos = orthographicRaDecDegToView(raDeg, decDeg, globeOrientation);
  if (!isVisibleInView(viewPos)) {
    return null;
  }
  return orthographicViewXy(viewPos, scale);
}

export function limbFade(viewPos: Vec3, fadeWidth = 0.12): number {
  if (viewPos.z <= 0.0) {
    return 0.0;
  }
  if (fadeWidth <= 1e-6) {
    return 1.0;
  }
  return clamp(viewPos.z / fadeWidth, 0.0, 1.0);
}

/**
 * Clips a segment on the unit sphere to the visible hemisphere in view space.
 * Returns 0-2 view-space unit vectors.
 */
export function clipUnitSegmentToVisibleHemisphere(
  startUnit: Vec3,
  endUnit: Vec3,
  globeOrientation: Basis
): Vec3[] {
  let a = celestialUnitToGlobeView(startUnit.normalized(), globeOrientation);
  let b = celestialUnitToGlobeView(endUnit.normalized(), globeOrientation);
  if (a.lengthSquared() > 1e-12) {
    a = a.normalized();
  }
  if (b.lengthSquared() > 1e-12) {
    b = b.normalized();
  }

  const visA = isVisibleInView(a);
  const visB = isVisibleInView(b);
  if (visA && visB) {
    return [a, b];
  }
  if (!visA && !visB) {
    return [];
  }

  const denom = a.z - b.z;
  let t = Math.abs(denom) < 1e-9 ? 0.5 : a.z / denom;
  t = clamp(t, 0.0, 1.0);
  let clipped = a.lerp(b, t);
  if (clipped.lengthSquared() > 1e-12) {
    clipped = clipped.normalized();
  } else {
    return [];
  }

  if (visA) {
    return [a, clipped];
  }
  return [clipped, b];
}

export interface YawPitch {
  yaw: number;
  pitch: number;
}

/** Yaw/pitch that place model_direction on the view +Z axis (screen center) via turntable rotation. */
export function yawPitchFromModelDirection(modelDirection: Vec3): YawPitch {
  const forward = modelDirection.normalized();
  if (forward.lengthSquared() < 1e-12) {
    return { yaw: 0, pitch: 0 };
  }

  let yaw: number;
  if (Math.abs(forward.x) > 1e-9 || Math.abs(forward.z) > 1e-9) {
    yaw = Math.atan2(-forward.x, forward.z);
  } else {
    yaw = 0.0;
  }

  const cosYaw = Math.cos(yaw);
  const sinYaw = Math.sin(yaw);
  const yawRotated = new Vec3(
    cosYaw * forward.x + sinYaw * forward.z,
    forward.y,
    -sinYaw * forward.x + cosYaw * forward.z
  );

  let pitch: number;
  if (Math.abs(yawRotated.y) > 1e-9 || Math.abs(yawRotated.z) > 1e-9) {
    pitch = Math.atan2(-yawRotated.y, yawRotated.z);
  } else {
    pitch = 0.0;
  }

  return { yaw, pitch };
}

export function yawPitchFacingCelestial(raDeg: number, decDeg: number): YawPitch {
  return yawPitchFromModelDirection(celestialToModelSpace(unitVectorFromRaDecDeg(raDeg, decDeg)));
}

/** Physical globe: spin around Y, then tilt around X. NCP/SCP stay on a fixed screen meridian. */
export function globeOrientationFromYawPitch(yawRad: number, pitchRad: number): Basis {
  return Basis.fromAxisAngle(RIGHT, -pitchRad).multiply(Basis.fromAxisAngle(UP, yawRad));
}

/** Turntable drag: accumulate yaw/pitch scalars; roll cannot creep in. */
export function applyGlobeDragTurntable(
  yawRad: number,
  pitchRad: number,
  deltaPixels: Vec2,
  sensitivityRad: number,
  pitchLimitRad: number
): YawPitch {
  let yaw = yawRad + deltaPixels.x * sensitivityRad;
  let pitch = pitchRad - deltaPixels.y * sensitivityRad;
  pitch = clamp(pitch, -pitchLimitRad, pitchLimitRad);
  return { yaw, pitch };
}
