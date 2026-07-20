#!/usr/bin/env node
/**
 * Bake per-vertex star magnitude + RGB for constellation figure stars.
 *
 * Source: d3-celestial stars.8.json (XHIP / Hipparcos), matched to vertices in
 * constellations.lines.json by RA/Dec rounded to 4 decimals. B−V is mapped to
 * RGB with the same quantize scale d3-celestial uses in src/config.js.
 *
 * Usage (from web/planetary-sphere):
 *   node scripts/bake-star-photometry.mjs
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const dataDir = join(__dirname, '../public/assets/data');
const STARS_URL =
  'https://raw.githubusercontent.com/ofrohn/d3-celestial/master/data/stars.8.json';

// d3-celestial bvcolor range (src/config.js)
const BV_COLORS = [
  '#ff4700', '#ff4b00', '#ff4f00', '#ff5300', '#ff5600', '#ff5900', '#ff5b00', '#ff5d00',
  '#ff6000', '#ff6300', '#ff6500', '#ff6700', '#ff6900', '#ff6b00', '#ff6d00', '#ff7000',
  '#ff7300', '#ff7500', '#ff7800', '#ff7a00', '#ff7c00', '#ff7e00', '#ff8100', '#ff8300',
  '#ff8506', '#ff870a', '#ff8912', '#ff8b1a', '#ff8e21', '#ff9127', '#ff932c', '#ff9631',
  '#ff9836', '#ff9a3c', '#ff9d3f', '#ffa148', '#ffa34b', '#ffa54f', '#ffa753', '#ffa957',
  '#ffab5a', '#ffad5e', '#ffb165', '#ffb269', '#ffb46b', '#ffb872', '#ffb975', '#ffbb78',
  '#ffbe7e', '#ffc184', '#ffc489', '#ffc78f', '#ffc892', '#ffc994', '#ffcc99', '#ffce9f',
  '#ffd1a3', '#ffd3a8', '#ffd5ad', '#ffd7b1', '#ffd9b6', '#ffdbba', '#ffddbe', '#ffdfc2',
  '#ffe1c6', '#ffe3ca', '#ffe4ce', '#ffe8d5', '#ffe9d9', '#ffebdc', '#ffece0', '#ffefe6',
  '#fff0e9', '#fff2ec', '#fff4f2', '#fff5f5', '#fff6f8', '#fff9fd', '#fef9ff', '#f9f6ff',
  '#f6f4ff', '#f3f2ff', '#eff0ff', '#ebeeff', '#e9edff', '#e6ebff', '#e3e9ff', '#e0e7ff',
  '#dee6ff', '#dce5ff', '#d9e3ff', '#d7e2ff', '#d3e0ff', '#c9d9ff', '#bfd3ff', '#b7ceff',
  '#afc9ff', '#a9c5ff', '#a4c2ff', '#9fbfff', '#9bbcff',
];
const BV_DOMAIN = [3.347, -0.335];

function normRa(ra) {
  let x = ra % 360;
  if (x < 0) x += 360;
  return x;
}

function coordKey(ra, dec) {
  return `${normRa(ra).toFixed(4)},${dec.toFixed(4)}`;
}

function hexToRgb01(hex) {
  const h = hex.replace('#', '');
  return {
    r: parseInt(h.slice(0, 2), 16) / 255,
    g: parseInt(h.slice(2, 4), 16) / 255,
    b: parseInt(h.slice(4, 6), 16) / 255,
  };
}

/** Same mapping as d3.scale.quantize().domain([3.347, -0.335]).range(BV_COLORS). */
function bvToRgb(bvRaw) {
  const bv = Number(bvRaw);
  if (!Number.isFinite(bv)) return null;
  const [x0, x1] = BV_DOMAIN;
  const n = BV_COLORS.length;
  let i = Math.floor(((bv - x0) / (x1 - x0)) * n);
  if (i < 0) i = 0;
  if (i >= n) i = n - 1;
  return hexToRgb01(BV_COLORS[i]);
}

function collectVertices(linesRoot) {
  const keys = new Set();
  const walk = (coords) => {
    if (!Array.isArray(coords) || coords.length === 0) return;
    if (typeof coords[0] === 'number') {
      keys.add(coordKey(coords[0], coords[1]));
      return;
    }
    for (const c of coords) walk(c);
  };
  for (const feature of linesRoot.features ?? []) {
    walk(feature.geometry?.coordinates);
  }
  return keys;
}

const linesRoot = JSON.parse(readFileSync(join(dataDir, 'constellations.lines.json'), 'utf8'));
const vertices = collectVertices(linesRoot);

const response = await fetch(STARS_URL);
if (!response.ok) {
  throw new Error(`Failed to fetch ${STARS_URL}: HTTP ${response.status}`);
}
const starsRoot = await response.json();

const byKey = new Map();
for (const feature of starsRoot.features ?? []) {
  const [lon, lat] = feature.geometry.coordinates;
  byKey.set(coordKey(lon, lat), feature.properties);
}

const out = {};
let missing = 0;
let noColor = 0;
for (const key of [...vertices].sort()) {
  const props = byKey.get(key);
  if (!props) {
    missing += 1;
    continue;
  }
  const mag = Number(props.mag);
  const rgb = bvToRgb(props.bv);
  if (!rgb) {
    noColor += 1;
    out[key] = { mag: Math.round(mag * 1000) / 1000 };
  } else {
    out[key] = {
      mag: Math.round(mag * 1000) / 1000,
      r: Math.round(rgb.r * 10000) / 10000,
      g: Math.round(rgb.g * 10000) / 10000,
      b: Math.round(rgb.b * 10000) / 10000,
    };
  }
}

const outPath = join(dataDir, 'star_photometry.json');
writeFileSync(outPath, `${JSON.stringify(out)}\n`);
console.log(
  `Wrote ${Object.keys(out).length} stars → ${outPath} (missing=${missing}, no_color=${noColor})`
);
