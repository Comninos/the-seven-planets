// Port of reference/scripts/constellation_catalog.gd — loads d3-celestial GeoJSON
// constellation lines + metadata into the sky-map schema.

import { fposmod } from './math';

export interface CatalogStar {
  ra: number;
  dec: number;
  mag: number;
}

export type CatalogSegment = [[number, number], [number, number]];

export interface CatalogConstellation {
  id: string;
  name: string;
  rank: number;
  lines: CatalogSegment[];
  stars: CatalogStar[];
}

export interface PolarisInfo {
  ra: number;
  dec: number;
  name: string;
}

export interface GeoJsonFeature {
  id?: string;
  properties?: Record<string, unknown>;
  geometry?: {
    type?: string;
    coordinates?: unknown;
  };
}

export interface GeoJsonRoot {
  features?: GeoJsonFeature[];
}

interface MetaEntry {
  name: string;
  rank: number;
}

export class ConstellationCatalog {
  polaris: PolarisInfo | Record<string, never> = {};
  constellations: CatalogConstellation[] = [];

  static async loadFromD3Celestial(
    linesUrl: string,
    metaUrl: string,
    maxRank = 3,
    minDeclinationDeg = -90.0,
    extractVertexStars = true
  ): Promise<ConstellationCatalog> {
    const catalog = new ConstellationCatalog();

    const [linesRoot, metaRoot] = await Promise.all([
      fetchJson(linesUrl),
      fetchJson(metaUrl),
    ]);

    const metaById = loadMetadata(metaRoot);
    if (linesRoot === null) {
      return catalog;
    }

    const merged = new Map<string, CatalogConstellation>();
    let bestPolarisDec = -Infinity;

    const features = linesRoot.features ?? [];
    for (const feature of features) {
      const featureId = String(feature.id ?? '');
      if (featureId.length === 0) {
        continue;
      }

      const meta = metaById.get(featureId);
      const rank = meta ? meta.rank : 3;
      if (rank > maxRank) {
        continue;
      }

      const geometry = feature.geometry ?? {};
      const lineGroups = (geometry.coordinates as unknown[]) ?? [];
      const segments = segmentsFromCoordinates(lineGroups, minDeclinationDeg);

      if (segments.length === 0) {
        continue;
      }

      if (!merged.has(featureId)) {
        merged.set(featureId, {
          id: featureId.toLowerCase(),
          name: meta ? meta.name : featureId,
          rank,
          lines: [],
          stars: [],
        });
      }

      const entry = merged.get(featureId)!;
      for (const segment of segments) {
        entry.lines.push(segment);
        for (const point of segment) {
          const pointRa = point[0];
          const pointDec = point[1];
          if (pointDec > bestPolarisDec) {
            bestPolarisDec = pointDec;
            catalog.polaris = { ra: pointRa, dec: pointDec, name: 'Polaris' };
          }
        }
      }

      if (extractVertexStars) {
        appendVertexStars(entry.stars, segments, minDeclinationDeg);
      }
    }

    catalog.constellations = Array.from(merged.values());
    catalog.constellations.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
    return catalog;
  }
}

async function fetchJson(url: string): Promise<GeoJsonRoot | null> {
  try {
    const response = await fetch(url);
    if (!response.ok) {
      console.error(`ConstellationCatalog: failed to fetch ${url} (status ${response.status}).`);
      return null;
    }
    return (await response.json()) as GeoJsonRoot;
  } catch (err) {
    console.error(`ConstellationCatalog: failed to fetch ${url}.`, err);
    return null;
  }
}

function loadMetadata(root: GeoJsonRoot | null): Map<string, MetaEntry> {
  const metaById = new Map<string, MetaEntry>();
  if (!root) {
    return metaById;
  }
  for (const feature of root.features ?? []) {
    const featureId = String(feature.id ?? '');
    if (featureId.length === 0) {
      continue;
    }
    const properties = feature.properties ?? {};
    const name = String(properties['name'] ?? properties['la'] ?? properties['en'] ?? featureId);
    // rank is stored as a STRING in constellations.json (e.g. "1") -- must Number() it.
    const rankRaw = properties['rank'];
    const rank = rankRaw === undefined || rankRaw === null ? 3 : Number(rankRaw);
    metaById.set(featureId, { name, rank: Number.isFinite(rank) ? rank : 3 });
  }
  return metaById;
}

function segmentsFromCoordinates(lineGroups: unknown[], minDeclinationDeg: number): CatalogSegment[] {
  const segments: CatalogSegment[] = [];
  for (const groupVariant of lineGroups) {
    const group = groupVariant as unknown[];
    if (!Array.isArray(group) || group.length < 2) {
      continue;
    }
    for (let index = 0; index < group.length - 1; index++) {
      const start = group[index] as unknown[];
      const end = group[index + 1] as unknown[];
      if (!Array.isArray(start) || !Array.isArray(end) || start.length < 2 || end.length < 2) {
        continue;
      }
      const startRa = normalizeRaDeg(Number(start[0]));
      const startDec = Number(start[1]);
      const endRa = normalizeRaDeg(Number(end[0]));
      const endDec = Number(end[1]);
      if (startDec < minDeclinationDeg && endDec < minDeclinationDeg) {
        continue;
      }
      segments.push([
        [startRa, startDec],
        [endRa, endDec],
      ]);
    }
  }
  return segments;
}

function appendVertexStars(
  stars: CatalogStar[],
  segments: CatalogSegment[],
  minDeclinationDeg: number
): void {
  const seen = new Set<string>();
  for (const segment of segments) {
    for (const point of segment) {
      if (point.length < 2) {
        continue;
      }
      const ra = normalizeRaDeg(point[0]);
      const dec = point[1];
      if (dec < minDeclinationDeg) {
        continue;
      }
      const key = `${ra.toFixed(4)},${dec.toFixed(4)}`;
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);
      stars.push({ ra, dec, mag: 3.0 });
    }
  }
}

export function normalizeRaDeg(raDeg: number): number {
  return fposmod(raDeg, 360.0);
}
