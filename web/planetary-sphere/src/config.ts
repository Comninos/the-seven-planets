// GlobeOptions type + defaults, mirroring the GDScript @export vars in
// menu_sky_overview_globe.gd, with scene overrides from menu_sky_overview_globe.tscn
// applied where the scene sets a different value (scene wins).

import type { RGBA } from './math';

export interface GlobeOptions {
  // -- Time --
  fixedJulianDate: number;
  initialDayOffset: number;
  showTimeUi: boolean;
  autoAdvanceDaysPerSec: number;
  autoRotateYawRadPerSec: number;
  showPlayButton: boolean;

  // -- Globe --
  initialViewRaDeg: number;
  initialViewDecDeg: number;
  maxPitchDeg: number;
  globeScaleFactor: number;
  globeZoom: number;
  limbFadeWidth: number;
  dragMomentumScale: number;
  dragSpinFriction: number;
  uiTopMargin: number;
  uiBottomMargin: number;

  // -- Selection --
  enableConstellationSelection: boolean;

  // -- Catalog --
  orbitalDataUrl: string;
  constellationLinesUrl: string;
  constellationMetaUrl: string;
  maxConstellationRank: number;
  showConstellationLines: boolean;
  showConstellationVertexStars: boolean;
  showConstellationNames: boolean;

  // -- Layers --
  showEcliptic: boolean;
  showMercury: boolean;
  showVenus: boolean;
  showMars: boolean;
  showJupiter: boolean;
  showSaturn: boolean;
  showSun: boolean;
  showMoon: boolean;
  showPlanetNames: boolean;
  showSunLabel: boolean;
  showMoonLabel: boolean;
  showCelestialPoles: boolean;
  showPoleLabels: boolean;

  // -- Colors (0..1 float channels) --
  backgroundColor: RGBA;
  globeFillColor: RGBA;
  globeOutlineColor: RGBA;
  eclipticColor: RGBA;
  constellationLineColor: RGBA;
  starColor: RGBA;
  mercuryColor: RGBA;
  venusColor: RGBA;
  marsColor: RGBA;
  jupiterColor: RGBA;
  saturnColor: RGBA;
  sunColor: RGBA;
  moonColor: RGBA;
  northPoleColor: RGBA;
  southPoleColor: RGBA;

  // -- Sizes --
  starSizeScale: number;
  starZoomSizeExponent: number;
  starScreenSizeExponent: number;
  showStarGlow: boolean;
  starGlowDiameterScale: number;
  planetRadius: number;
  sunRadius: number;
  moonRadius: number;
  poleMarkerRadius: number;
  constellationLineWidth: number;
  eclipticLineWidth: number;
  globeOutlineWidth: number;
  ringSegmentCount: number;
  labelFontFamily: string;
  labelFontUrl: string;
  labelFontSize: number;
  bodyLabelOffset: { x: number; y: number };

  // -- Interaction constants (not @export in the script, but tunable here) --
  userZoomMin: number;
  userZoomMax: number;
  zoomWheelFactor: number;
  dragSensitivityRad: number;
  clickDragThresholdPx: number;
  constellationHitLinePx: number;
  constellationHitStarPx: number;

  onConstellationSelected?: (constellationId: string) => void;
}

const color = (r: number, g: number, b: number, a = 1): RGBA => ({ r, g, b, a });

export const JD_1453_01_01 = 2251766.5;

export const DEFAULT_OPTIONS: GlobeOptions = {
  // Time
  fixedJulianDate: JD_1453_01_01,
  initialDayOffset: 0.0,
  showTimeUi: true,
  autoAdvanceDaysPerSec: 3.0,
  autoRotateYawRadPerSec: 0.04,
  showPlayButton: true,

  // Globe (scene: initial_view_dec_deg -35, globe_scale_factor 0.7, globe_zoom 1.4;
  // globe_zoom nudged down to 1.37 here so the disk fits a centered, zero-margin square
  // viewport at ~96% of the side instead of clipping at ~98%)
  initialViewRaDeg: 0.0,
  initialViewDecDeg: -35.0,
  maxPitchDeg: 70.0,
  globeScaleFactor: 0.7,
  globeZoom: 1.37,
  limbFadeWidth: 0.1,
  dragMomentumScale: 1.0,
  dragSpinFriction: 10.0,
  uiTopMargin: 0.0,
  uiBottomMargin: 0.0,

  // Selection
  enableConstellationSelection: true,

  // Catalog
  orbitalDataUrl: 'assets/data/orbital_elements.json',
  constellationLinesUrl: 'assets/data/constellations.lines.json',
  constellationMetaUrl: 'assets/data/constellations.json',
  maxConstellationRank: 3,
  showConstellationLines: true,
  showConstellationVertexStars: true,
  showConstellationNames: true,

  // Layers
  showEcliptic: true,
  showMercury: true,
  showVenus: true,
  showMars: true,
  showJupiter: true,
  showSaturn: true,
  showSun: true,
  showMoon: true,
  showPlanetNames: true,
  showSunLabel: true,
  showMoonLabel: true,
  showCelestialPoles: true,
  showPoleLabels: true,

  // Colors -- scene-effective values (exact Color(...) from the .tscn where overridden)
  // Alpha 0 leaves the canvas transparent so the element's CSS background shows
  // through; set alpha to 1 to have the canvas paint this color itself.
  backgroundColor: color(0.005945804, 0.007432931, 0.019723443, 0.0),
  globeFillColor: color(0.029687967, 0.029691454, 0.0678673),
  globeOutlineColor: color(0.35, 0.42, 0.58, 0.55), // script default (scene doesn't override)
  eclipticColor: color(0.935792, 0.628446, 0.2767423, 1.0),
  constellationLineColor: color(0.54901963, 0.6509804, 0.8509804, 0.38039216),
  starColor: color(0.92, 0.95, 1.0), // script default
  mercuryColor: color(0.5178077, 0.53279626, 0.7101363),
  venusColor: color(0.9911694, 0.8943265, 0.4152305),
  marsColor: color(0.8601265, 0.20682782, 0.11657921),
  jupiterColor: color(0.6255095, 0.21831787, 0.039853897),
  saturnColor: color(0.4062816, 0.36983186, 0.3042892),
  sunColor: color(0.96051294, 0.7972232, 0.22867176),
  moonColor: color(0.88, 0.9, 0.95), // script default
  // Scene overrides both poles to green (script defaults were blue/red).
  northPoleColor: color(0.2871209, 0.66698664, 0.3420596, 0.9490196),
  southPoleColor: color(0.28627452, 0.6666667, 0.34117648, 0.9490196),

  // Sizes (scene: star_size_scale 1.0, star_glow_diameter_scale 8.0, planet_radius 7,
  // sun_radius 8, moon_radius 8, line widths 0.5, label_font_size 22)
  starSizeScale: 1.0,
  // Gently scales constellation star core radius by userZoom^starZoomSizeExponent so stars
  // don't stay a fixed pixel size across the 0.6-4.0 zoom range (no-op at userZoom=1).
  starZoomSizeExponent: 0.4,
  // Gently scales star size with viewport size (pow(minDim/700, exponent)) so stars don't
  // look oversized on small phone screens or undersized on large displays.
  starScreenSizeExponent: 0.8,
  showStarGlow: true,
  starGlowDiameterScale: 8.0,
  planetRadius: 7.0,
  sunRadius: 8.0,
  moonRadius: 8.0,
  poleMarkerRadius: 8.0, // script default (scene doesn't override)
  constellationLineWidth: 0.5,
  eclipticLineWidth: 0.5,
  globeOutlineWidth: 0.5,
  ringSegmentCount: 144, // script default (unused directly; globe outline arc uses 96 segments hardcoded)
  labelFontFamily: 'IM Fell English',
  labelFontUrl: 'assets/fonts/IMFELLEnglish-Regular.ttf',
  labelFontSize: 14,
  bodyLabelOffset: { x: 8.0, y: 8.0 },

  // Interaction constants (script consts, not @export, but exposed for configurability)
  userZoomMin: 0.6,
  userZoomMax: 4.0,
  zoomWheelFactor: 1.1,
  dragSensitivityRad: 0.004,
  clickDragThresholdPx: 8.0,
  constellationHitLinePx: 10.0,
  constellationHitStarPx: 14.0,
};

export function resolveOptions(overrides?: Partial<GlobeOptions>): GlobeOptions {
  return { ...DEFAULT_OPTIONS, ...overrides };
}
