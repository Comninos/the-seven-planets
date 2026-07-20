import { describe, expect, it } from 'vitest';
import { ConstellationCatalog, normalizeRaDeg } from '../src/constellation-catalog';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const dataDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '../public/assets/data');

// Node's vitest environment lacks `fetch` pointed at local files by default, so stub a
// minimal fetch that reads from the copied public/assets/data fixtures used by the widget.
const originalFetch = globalThis.fetch;

function installFileFetchStub(): void {
  globalThis.fetch = (async (url: string | URL) => {
    const urlStr = String(url);
    const fileName = urlStr.split('/').pop()!;
    const filePath = path.join(dataDir, fileName);
    const text = readFileSync(filePath, 'utf-8');
    return {
      ok: true,
      status: 200,
      json: async () => JSON.parse(text),
    } as Response;
  }) as typeof fetch;
}

function restoreFetch(): void {
  globalThis.fetch = originalFetch;
}

describe('normalizeRaDeg', () => {
  it('wraps negative RA into [0, 360)', () => {
    expect(normalizeRaDeg(-5.4658)).toBeCloseTo(354.5342, 6);
  });
});

describe('ConstellationCatalog.loadFromD3Celestial', () => {
  it('loads constellations, coerces string rank to number, and filters by maxRank', async () => {
    installFileFetchStub();
    try {
      const catalog = await ConstellationCatalog.loadFromD3Celestial(
        'assets/data/constellations.lines.json',
        'assets/data/constellations.json',
        3,
        -90.0,
        true
      );

      expect(catalog.constellations.length).toBeGreaterThan(0);

      // Every returned constellation must have rank <= 3, and rank must be a JS number
      // (not the raw string "1"/"2"/"3" from the metadata JSON).
      for (const c of catalog.constellations) {
        expect(typeof c.rank).toBe('number');
        expect(c.rank).toBeLessThanOrEqual(3);
      }

      // Andromeda (id "And") is rank 1 in the fixture; its lowercase id should be "and".
      const andromeda = catalog.constellations.find((c) => c.id === 'and');
      expect(andromeda).toBeDefined();
      expect(andromeda!.rank).toBe(1);
      expect(andromeda!.name).toBe('Andromeda');

      // Constellations are sorted by id ascending.
      const ids = catalog.constellations.map((c) => c.id);
      const sortedIds = [...ids].sort();
      expect(ids).toEqual(sortedIds);
    } finally {
      restoreFetch();
    }
  });

  it('normalizes negative RA coordinates in line segments to [0, 360)', async () => {
    installFileFetchStub();
    try {
      const catalog = await ConstellationCatalog.loadFromD3Celestial(
        'assets/data/constellations.lines.json',
        'assets/data/constellations.json',
        3,
        -90.0,
        true
      );
      for (const c of catalog.constellations) {
        for (const segment of c.lines) {
          for (const [ra] of segment) {
            expect(ra).toBeGreaterThanOrEqual(0);
            expect(ra).toBeLessThan(360);
          }
        }
      }
    } finally {
      restoreFetch();
    }
  });

  it('dedups vertex stars and applies baked photometry (mag + colour)', async () => {
    installFileFetchStub();
    try {
      const catalog = await ConstellationCatalog.loadFromD3Celestial(
        'assets/data/constellations.lines.json',
        'assets/data/constellations.json',
        3,
        -90.0,
        true,
        'assets/data/star_photometry.json'
      );
      let withColor = 0;
      let brightCount = 0;
      for (const c of catalog.constellations) {
        const keys = c.stars.map((s) => `${s.ra.toFixed(4)},${s.dec.toFixed(4)}`);
        const uniqueKeys = new Set(keys);
        expect(uniqueKeys.size).toBe(keys.length);
        for (const s of c.stars) {
          expect(Number.isFinite(s.mag)).toBe(true);
          if (s.mag < 2.0) brightCount += 1;
          if (s.color) {
            withColor += 1;
            expect(s.color.r).toBeGreaterThanOrEqual(0);
            expect(s.color.r).toBeLessThanOrEqual(1);
            expect(s.color.g).toBeGreaterThanOrEqual(0);
            expect(s.color.g).toBeLessThanOrEqual(1);
            expect(s.color.b).toBeGreaterThanOrEqual(0);
            expect(s.color.b).toBeLessThanOrEqual(1);
          }
        }
      }
      expect(withColor).toBeGreaterThan(500);
      expect(brightCount).toBeGreaterThan(20);
    } finally {
      restoreFetch();
    }
  });

  it('tracks Polaris as the highest-declination vertex overall', async () => {
    installFileFetchStub();
    try {
      const catalog = await ConstellationCatalog.loadFromD3Celestial(
        'assets/data/constellations.lines.json',
        'assets/data/constellations.json',
        3,
        -90.0,
        true
      );
      expect(catalog.polaris).toBeDefined();
      expect((catalog.polaris as { name: string }).name).toBe('Polaris');
    } finally {
      restoreFetch();
    }
  });
});
