// Minimal math primitives ported from Godot semantics used by the celestial globe.
// Vec3 mirrors Godot's Vector3; Basis mirrors Godot's Basis (3x3 matrix, column-vector
// convention, right-handed axis-angle rotation per Godot's `Basis(axis, angle)` ctor).

export class Vec3 {
  constructor(
    public x: number,
    public y: number,
    public z: number
  ) {}

  static ZERO(): Vec3 {
    return new Vec3(0, 0, 0);
  }

  add(other: Vec3): Vec3 {
    return new Vec3(this.x + other.x, this.y + other.y, this.z + other.z);
  }

  sub(other: Vec3): Vec3 {
    return new Vec3(this.x - other.x, this.y - other.y, this.z - other.z);
  }

  scale(s: number): Vec3 {
    return new Vec3(this.x * s, this.y * s, this.z * s);
  }

  lengthSquared(): number {
    return this.x * this.x + this.y * this.y + this.z * this.z;
  }

  length(): number {
    return Math.sqrt(this.lengthSquared());
  }

  normalized(): Vec3 {
    const len = this.length();
    if (len < 1e-12) return new Vec3(0, 0, 0);
    return new Vec3(this.x / len, this.y / len, this.z / len);
  }

  lerp(other: Vec3, t: number): Vec3 {
    return new Vec3(
      this.x + (other.x - this.x) * t,
      this.y + (other.y - this.y) * t,
      this.z + (other.z - this.z) * t
    );
  }
}

/**
 * 3x3 rotation matrix matching Godot's Basis, stored as three basis column vectors
 * (bx, by, bz) — i.e. `m * v = bx*v.x + by*v.y + bz*v.z`. This matches Godot's
 * `Basis.xform(v)` / `Basis * Vector3` behavior.
 */
export class Basis {
  constructor(
    public bx: Vec3,
    public by: Vec3,
    public bz: Vec3
  ) {}

  static identity(): Basis {
    return new Basis(new Vec3(1, 0, 0), new Vec3(0, 1, 0), new Vec3(0, 0, 1));
  }

  /**
   * Godot's `Basis(axis, angle)` — right-handed rotation about a unit `axis` by `angle`
   * radians (positive = counter-clockwise when viewed from the tip of axis toward origin).
   * Rodrigues' rotation formula, matching Godot's implementation exactly.
   */
  static fromAxisAngle(axis: Vec3, angle: number): Basis {
    const a = axis.normalized();
    const sin = Math.sin(angle);
    const cos = Math.cos(angle);
    const t = 1 - cos;

    const xx = a.x * a.x;
    const yy = a.y * a.y;
    const zz = a.z * a.z;
    const xy = a.x * a.y;
    const xz = a.x * a.z;
    const yz = a.y * a.z;

    // Row-major elements of the rotation matrix (standard Rodrigues form).
    const m00 = cos + xx * t;
    const m01 = xy * t - a.z * sin;
    const m02 = xz * t + a.y * sin;

    const m10 = xy * t + a.z * sin;
    const m11 = cos + yy * t;
    const m12 = yz * t - a.x * sin;

    const m20 = xz * t - a.y * sin;
    const m21 = yz * t + a.x * sin;
    const m22 = cos + zz * t;

    // Store as column vectors so that m.xform(v) = bx*v.x + by*v.y + bz*v.z.
    return new Basis(
      new Vec3(m00, m10, m20),
      new Vec3(m01, m11, m21),
      new Vec3(m02, m12, m22)
    );
  }

  /** Applies this basis to a vector: `this * v`. */
  xform(v: Vec3): Vec3 {
    return new Vec3(
      this.bx.x * v.x + this.by.x * v.y + this.bz.x * v.z,
      this.bx.y * v.x + this.by.y * v.y + this.bz.y * v.z,
      this.bx.z * v.x + this.by.z * v.y + this.bz.z * v.z
    );
  }

  /** Matrix product `this * other` (Godot's `Basis * Basis`, applies `other` first). */
  multiply(other: Basis): Basis {
    return new Basis(
      this.xform(other.bx),
      this.xform(other.by),
      this.xform(other.bz)
    );
  }
}

export const RIGHT = new Vec3(1, 0, 0);
export const UP = new Vec3(0, 1, 0);

/** Positive modulo, matching Godot's `fposmod` (always returns a value in [0, y)). */
export function fposmod(x: number, y: number): number {
  const r = x % y;
  if (r !== 0 && (r < 0) !== (y < 0)) {
    return r + y;
  }
  return r;
}

/** Matches Godot's `fmod` (C fmod semantics — sign follows the dividend). */
export function fmod(x: number, y: number): number {
  return x % y;
}

/** Wraps `rad` into [-PI, PI), matching `orbital_mechanics.gd`'s `wrap_angle`. */
export function wrapAngle(rad: number): number {
  return fmod(rad + Math.PI, Math.PI * 2) - Math.PI;
}

/** Matches Godot's `wrapf(value, min, max)` general-purpose wrap. */
export function wrapf(value: number, min: number, max: number): number {
  const range = max - min;
  if (range <= 1e-12) return min;
  return value - range * Math.floor((value - min) / range);
}

/** Shortest-path angle lerp in radians, matching `_lerp_angle_rad` in the GDScript. */
export function lerpAngleRad(from: number, to: number, weight: number): number {
  const delta = wrapf(to - from, -Math.PI, Math.PI);
  return from + delta * weight;
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

export function lerp(from: number, to: number, weight: number): number {
  return from + (to - from) * weight;
}

export function smoothstep01(t: number): number {
  const c = clamp(t, 0, 1);
  return c * c * (3 - 2 * c);
}

export function degToRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

export function radToDeg(rad: number): number {
  return (rad * 180) / Math.PI;
}

export interface RGBA {
  r: number;
  g: number;
  b: number;
  a: number;
}

/** Godot's `Color.darkened(f)` — multiplies each RGB channel by (1-f); alpha unchanged. */
export function darkened(c: RGBA, f: number): RGBA {
  const k = clamp(f, 0, 1);
  return { r: c.r * (1 - k), g: c.g * (1 - k), b: c.b * (1 - k), a: c.a };
}

/** Godot's `Color.lightened(f)` — blends each RGB channel toward white by f; alpha unchanged. */
export function lightened(c: RGBA, f: number): RGBA {
  const k = clamp(f, 0, 1);
  return {
    r: c.r + (1 - c.r) * k,
    g: c.g + (1 - c.g) * k,
    b: c.b + (1 - c.b) * k,
    a: c.a,
  };
}

/** Converts a {r,g,b,a} float color (0..1 channels) plus an alpha multiplier to a CSS rgba() string. */
export function toCssRgba(c: RGBA, alphaScale = 1): string {
  const r = Math.round(clamp(c.r, 0, 1) * 255);
  const g = Math.round(clamp(c.g, 0, 1) * 255);
  const b = Math.round(clamp(c.b, 0, 1) * 255);
  const a = clamp(c.a * alphaScale, 0, 1);
  return `rgba(${r}, ${g}, ${b}, ${a})`;
}
