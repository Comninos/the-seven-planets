import { describe, expect, it } from 'vitest';
import {
  Basis,
  RIGHT,
  UP,
  Vec3,
  darkened,
  fposmod,
  lerpAngleRad,
  lightened,
  wrapf,
} from '../src/math';

describe('fposmod (positive modulo, unlike JS %)', () => {
  it('normalizes negative RA values into [0, 360)', () => {
    expect(fposmod(-5.4658, 360)).toBeCloseTo(354.5342, 6);
    expect(fposmod(-0.001, 360)).toBeCloseTo(359.999, 6);
    expect(fposmod(0, 360)).toBe(0);
    expect(fposmod(360, 360)).toBe(0);
    expect(fposmod(370, 360)).toBeCloseTo(10, 6);
  });

  it('differs from JS % for negative inputs', () => {
    expect(-5.4658 % 360).toBeLessThan(0); // plain JS % keeps the sign
    expect(fposmod(-5.4658, 360)).toBeGreaterThan(0); // fposmod does not
  });
});

describe('wrapf', () => {
  it('wraps into [-PI, PI)', () => {
    expect(wrapf(Math.PI * 3, -Math.PI, Math.PI)).toBeCloseTo(-Math.PI, 5);
    expect(wrapf(0, -Math.PI, Math.PI)).toBeCloseTo(0, 6);
  });
});

describe('lerpAngleRad (shortest path)', () => {
  it('takes the short way across the -PI/PI seam', () => {
    const from = Math.PI - 0.1;
    const to = -Math.PI + 0.1;
    const mid = lerpAngleRad(from, to, 0.5);
    // Shortest path wraps through PI, so the midpoint should be near +/-PI, not 0.
    expect(Math.abs(Math.abs(mid) - Math.PI)).toBeLessThan(0.05);
  });
});

describe('Color darkened/lightened (Godot semantics)', () => {
  it('darkened(f) = c*(1-f), alpha unchanged', () => {
    const c = { r: 0.8, g: 0.4, b: 0.2, a: 0.9 };
    const d = darkened(c, 0.25);
    expect(d.r).toBeCloseTo(0.8 * 0.75, 6);
    expect(d.g).toBeCloseTo(0.4 * 0.75, 6);
    expect(d.b).toBeCloseTo(0.2 * 0.75, 6);
    expect(d.a).toBeCloseTo(0.9, 6);
  });

  it('lightened(f) = c+(1-c)*f, alpha unchanged', () => {
    const c = { r: 0.8, g: 0.4, b: 0.2, a: 0.9 };
    const l = lightened(c, 0.25);
    expect(l.r).toBeCloseTo(0.8 + (1 - 0.8) * 0.25, 6);
    expect(l.g).toBeCloseTo(0.4 + (1 - 0.4) * 0.25, 6);
    expect(l.b).toBeCloseTo(0.2 + (1 - 0.2) * 0.25, 6);
    expect(l.a).toBeCloseTo(0.9, 6);
  });
});

describe('Basis (Godot right-handed axis-angle convention)', () => {
  it('Basis(UP, +90deg) rotates +X to -Z', () => {
    const basis = Basis.fromAxisAngle(UP, Math.PI / 2);
    const result = basis.xform(new Vec3(1, 0, 0));
    expect(result.x).toBeCloseTo(0, 6);
    expect(result.y).toBeCloseTo(0, 6);
    expect(result.z).toBeCloseTo(-1, 6);
  });

  it('Basis(RIGHT, +90deg) rotates +Y to +Z', () => {
    const basis = Basis.fromAxisAngle(RIGHT, Math.PI / 2);
    const result = basis.xform(new Vec3(0, 1, 0));
    expect(result.x).toBeCloseTo(0, 6);
    expect(result.y).toBeCloseTo(0, 6);
    expect(result.z).toBeCloseTo(1, 6);
  });

  it('matrix product applies the right-hand operand first: (A*B).xform(v) == A.xform(B.xform(v))', () => {
    const a = Basis.fromAxisAngle(RIGHT, 0.3);
    const b = Basis.fromAxisAngle(UP, 0.7);
    const v = new Vec3(0.2, 0.5, 0.8).normalized();
    const combined = a.multiply(b).xform(v);
    const sequential = a.xform(b.xform(v));
    expect(combined.x).toBeCloseTo(sequential.x, 9);
    expect(combined.y).toBeCloseTo(sequential.y, 9);
    expect(combined.z).toBeCloseTo(sequential.z, 9);
  });
});
