// The Celestial Globe widget: canvas rendering, input, animation, overlay UI.
// Mirrors reference/scripts/menu_sky_overview_globe.gd (_draw order, constants, input, animation).

import {
  Basis,
  RGBA,
  Vec3,
  clamp,
  darkened,
  degToRad,
  lightened,
  radToDeg,
  toCssRgba,
  wrapf,
} from './math';
import * as CP from './celestial-projection';
import type { Vec2 } from './celestial-projection';
import * as OM from './orbital-mechanics';
import type { OrbitalData } from './orbital-mechanics';
import { ConstellationCatalog, type CatalogConstellation } from './constellation-catalog';
import { DEFAULT_OPTIONS, type GlobeOptions } from './config';

const PLANET_DRAW_ORDER = ['mercury', 'venus', 'mars', 'jupiter', 'saturn'] as const;
type PlanetName = (typeof PLANET_DRAW_ORDER)[number];

const PLANET_LABELS: Record<PlanetName, string> = {
  mercury: 'Mercurius',
  venus: 'Venus',
  mars: 'Mars',
  jupiter: 'Iuppiter',
  saturn: 'Saturnus',
};

const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

const MONTH_ABBR_TO_NUM: Record<string, number> = {
  jan: 1,
  feb: 2,
  mar: 3,
  apr: 4,
  may: 5,
  jun: 6,
  jul: 7,
  aug: 8,
  sep: 9,
  oct: 10,
  nov: 11,
  dec: 12,
};

interface PointerSample {
  t: number;
  x: number;
  y: number;
}

export interface CelestialGlobeHandle {
  destroy(): void;
  setDate(jd: number): void;
  getSelectedConstellation(): string | null;
  play(): void;
  pause(): void;
  isPlaying(): boolean;
  on(event: 'constellation-selected', handler: (id: string) => void): void;
  off(event: 'constellation-selected', handler: (id: string) => void): void;
}

export class CelestialGlobe {
  private readonly opts: GlobeOptions;
  private readonly mount: HTMLElement;
  private readonly root: HTMLDivElement;
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly dateInputEl: HTMLInputElement;
  private readonly playButtonEl: HTMLButtonElement;

  private orbitalData: OrbitalData | null = null;
  private catalog: ConstellationCatalog | null = null;
  private starGlowSprite: HTMLCanvasElement | null = null;

  private dayOffset = 0;
  private globeYaw = 0;
  private globePitch = 0;
  private userZoom = 1.0;

  private dragging = false;
  private dragLast: Vec2 = { x: 0, y: 0 };
  private dragPress: Vec2 = { x: 0, y: 0 };
  private dragDistanceSq = 0;
  private angularVelocity: Vec2 = { x: 0, y: 0 };
  private pointerSamples: PointerSample[] = [];
  private activePointerId: number | null = null;

  private pinchPointers = new Map<number, Vec2>();
  private pinchStartDist = 0;
  private pinchStartZoom = 1.0;

  private selectedConstellationId: string | null = null;

  private playing = false;
  private dateInputFocused = false;
  private lastInputDayInt: number | null = null;
  private dateInputShakeTimeout: number | null = null;

  private dirty = true;
  private rafHandle: number | null = null;
  private lastFrameTime: number | null = null;
  private destroyed = false;
  private fontsReady = false;

  private resizeObserver: ResizeObserver | null = null;
  private readonly listeners = new Set<(id: string) => void>();

  constructor(mount: HTMLElement, options?: Partial<GlobeOptions>) {
    this.opts = { ...DEFAULT_OPTIONS, ...options };
    this.mount = mount;
    if (this.opts.onConstellationSelected) {
      this.listeners.add(this.opts.onConstellationSelected);
    }

    this.root = document.createElement('div');
    this.root.className = 'celestial-globe-root';

    this.canvas = document.createElement('canvas');
    this.canvas.className = 'celestial-globe-canvas';
    this.root.appendChild(this.canvas);

    const ctx = this.canvas.getContext('2d');
    if (!ctx) {
      throw new Error('CelestialGlobe: 2D canvas context unavailable.');
    }
    this.ctx = ctx;

    const timeControlsWrap = document.createElement('div');
    timeControlsWrap.className = 'celestial-globe-time-controls';

    this.playButtonEl = document.createElement('button');
    this.playButtonEl.className = 'celestial-globe-play-button';
    this.playButtonEl.type = 'button';
    this.playButtonEl.textContent = '▶';
    this.playButtonEl.setAttribute('aria-label', 'Play');

    this.dateInputEl = document.createElement('input');
    this.dateInputEl.type = 'text';
    this.dateInputEl.className = 'celestial-globe-date-input';
    this.dateInputEl.spellcheck = false;
    this.dateInputEl.autocomplete = 'off';

    timeControlsWrap.appendChild(this.dateInputEl);
    timeControlsWrap.appendChild(this.playButtonEl);
    this.root.appendChild(timeControlsWrap);

    this.mount.appendChild(this.root);

    this.setupFont();
    this.setupTimeUi();
    this.setupInput();
    this.setupResize();

    this.starGlowSprite = buildStarGlowSprite(this.opts.starColor);

    void this.init();
  }

  private async init(): Promise<void> {
    const initialYawPitch = CP.yawPitchFacingCelestial(
      this.opts.initialViewRaDeg,
      this.opts.initialViewDecDeg
    );
    this.globeYaw = initialYawPitch.yaw;
    this.globePitch = initialYawPitch.pitch;
    this.dayOffset = this.opts.initialDayOffset;

    const [orbitalData, catalog] = await Promise.all([
      fetch(this.opts.orbitalDataUrl)
        .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
        .catch((err) => {
          console.error('CelestialGlobe: failed to load orbital data.', err);
          return null;
        }),
      ConstellationCatalog.loadFromD3Celestial(
        this.opts.constellationLinesUrl,
        this.opts.constellationMetaUrl,
        this.opts.maxConstellationRank,
        -90.0,
        this.opts.showConstellationVertexStars
      ),
    ]);

    this.orbitalData = orbitalData as OrbitalData | null;
    this.catalog = catalog;

    this.lastInputDayInt = Math.floor(this.currentJulianDate() + 0.5);
    this.syncDateInputText();
    this.markDirty();
    this.startLoop();

    if ('fonts' in document) {
      document.fonts.ready
        .then(() => {
          this.fontsReady = true;
          this.markDirty();
        })
        .catch(() => {
          this.fontsReady = true;
        });
    } else {
      this.fontsReady = true;
    }
  }

  // ---------------------------------------------------------------------
  // Setup
  // ---------------------------------------------------------------------

  private setupFont(): void {
    const fontUrl = this.opts.labelFontUrl;
    const family = this.opts.labelFontFamily;
    if (!fontUrl) return;
    const styleId = 'celestial-globe-font-face';
    if (!document.getElementById(styleId)) {
      const style = document.createElement('style');
      style.id = styleId;
      style.textContent = `@font-face { font-family: "${family}"; src: url("${fontUrl}") format("truetype"); font-display: swap; }`;
      document.head.appendChild(style);
    }
  }

  private setupTimeUi(): void {
    this.dateInputEl.hidden = !this.opts.showTimeUi;
    this.playButtonEl.hidden = !this.opts.showTimeUi || !this.opts.showPlayButton;

    this.syncDateInputText();

    this.dateInputEl.addEventListener('focus', () => {
      this.dateInputFocused = true;
    });

    this.dateInputEl.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        this.commitDateInput();
        this.dateInputEl.blur();
      }
    });

    this.dateInputEl.addEventListener('change', () => {
      this.commitDateInput();
    });

    this.dateInputEl.addEventListener('blur', () => {
      this.dateInputFocused = false;
      this.commitDateInput();
    });

    this.playButtonEl.addEventListener('click', () => {
      if (this.playing) {
        this.pause();
      } else {
        this.play();
      }
    });
  }

  private setupResize(): void {
    this.resizeObserver = new ResizeObserver(() => {
      this.resizeCanvas();
      this.markDirty();
    });
    this.resizeObserver.observe(this.root);
    this.resizeCanvas();
  }

  private resizeCanvas(): void {
    const dpr = window.devicePixelRatio || 1;
    const rect = this.root.getBoundingClientRect();
    const width = Math.max(1, rect.width);
    const height = Math.max(1, rect.height);
    this.canvas.style.width = `${width}px`;
    this.canvas.style.height = `${height}px`;
    this.canvas.width = Math.max(1, Math.round(width * dpr));
    this.canvas.height = Math.max(1, Math.round(height * dpr));
  }

  private cssSize(): Vec2 {
    const rect = this.root.getBoundingClientRect();
    return { x: Math.max(1, rect.width), y: Math.max(1, rect.height) };
  }

  // ---------------------------------------------------------------------
  // Input
  // ---------------------------------------------------------------------

  private setupInput(): void {
    this.canvas.style.touchAction = 'none';

    this.canvas.addEventListener('pointerdown', (e) => this.onPointerDown(e));
    window.addEventListener('pointermove', (e) => this.onPointerMove(e));
    window.addEventListener('pointerup', (e) => this.onPointerUp(e));
    window.addEventListener('pointercancel', (e) => this.onPointerUp(e));
    this.canvas.addEventListener('wheel', (e) => this.onWheel(e), { passive: false });
  }

  private onPointerDown(e: PointerEvent): void {
    if (e.button !== 0 && e.pointerType === 'mouse') return;

    if (e.pointerType === 'touch') {
      this.pinchPointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (this.pinchPointers.size === 2) {
        this.dragging = false;
        const pts = Array.from(this.pinchPointers.values());
        this.pinchStartDist = distance(pts[0], pts[1]);
        this.pinchStartZoom = this.userZoom;
        return;
      }
    }

    this.activePointerId = e.pointerId;
    this.dragging = true;
    this.angularVelocity = { x: 0, y: 0 };
    const pos = { x: e.clientX, y: e.clientY };
    this.dragLast = pos;
    this.dragPress = pos;
    this.dragDistanceSq = 0;
    this.pointerSamples = [{ t: performance.now(), x: pos.x, y: pos.y }];
    try {
      this.canvas.setPointerCapture(e.pointerId);
    } catch {
      // Pointer may already be inactive (e.g. synthetic events); capture is best-effort.
    }
  }

  private onPointerMove(e: PointerEvent): void {
    if (e.pointerType === 'touch' && this.pinchPointers.has(e.pointerId)) {
      this.pinchPointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (this.pinchPointers.size === 2) {
        const pts = Array.from(this.pinchPointers.values());
        const dist = distance(pts[0], pts[1]);
        if (this.pinchStartDist > 1e-6) {
          const factor = dist / this.pinchStartDist;
          this.userZoom = clamp(
            this.pinchStartZoom * factor,
            this.opts.userZoomMin,
            this.opts.userZoomMax
          );
          this.markDirty();
        }
        return;
      }
    }

    if (!this.dragging || e.pointerId !== this.activePointerId) return;

    const pos = { x: e.clientX, y: e.clientY };
    const delta = { x: pos.x - this.dragLast.x, y: pos.y - this.dragLast.y };
    this.dragDistanceSq = Math.max(this.dragDistanceSq, distanceSq(pos, this.dragPress));
    this.dragLast = pos;

    const now = performance.now();
    this.pointerSamples.push({ t: now, x: pos.x, y: pos.y });
    // Keep a short rolling window for velocity estimation.
    while (this.pointerSamples.length > 8) this.pointerSamples.shift();
    const cutoff = now - 100;
    this.pointerSamples = this.pointerSamples.filter((s) => s.t >= cutoff || this.pointerSamples.length <= 2);

    this.applyDragRotation(delta);
    this.markDirty();
  }

  private onPointerUp(e: PointerEvent): void {
    if (e.pointerType === 'touch') {
      this.pinchPointers.delete(e.pointerId);
      if (this.pinchPointers.size < 2) {
        this.pinchStartDist = 0;
      }
    }

    if (e.pointerId !== this.activePointerId) return;
    this.activePointerId = null;
    if (!this.dragging) return;

    const wasClick = this.dragDistanceSq <= this.opts.clickDragThresholdPx * this.opts.clickDragThresholdPx;
    this.dragging = false;

    // Estimate release velocity (px/sec) from recent samples, matching Godot's motion.velocity.
    this.angularVelocity = this.estimateReleaseAngularVelocity();

    if (wasClick && this.opts.enableConstellationSelection) {
      this.trySelectConstellationAt({ x: e.clientX, y: e.clientY });
    }
    this.markDirty();
  }

  private estimateReleaseAngularVelocity(): Vec2 {
    if (this.pointerSamples.length < 2) return { x: 0, y: 0 };
    const first = this.pointerSamples[0];
    const last = this.pointerSamples[this.pointerSamples.length - 1];
    const dt = (last.t - first.t) / 1000.0;
    if (dt <= 1e-4) return { x: 0, y: 0 };
    const vx = (last.x - first.x) / dt;
    const vy = (last.y - first.y) / dt;
    return {
      x: vx * this.opts.dragSensitivityRad * this.opts.dragMomentumScale,
      y: -vy * this.opts.dragSensitivityRad * this.opts.dragMomentumScale,
    };
  }

  private onWheel(e: WheelEvent): void {
    e.preventDefault();
    const factor = e.deltaY < 0 ? this.opts.zoomWheelFactor : 1.0 / this.opts.zoomWheelFactor;
    this.applyZoom(factor);
  }

  private applyDragRotation(delta: Vec2): void {
    const updated = CP.applyGlobeDragTurntable(
      this.globeYaw,
      this.globePitch,
      delta,
      this.opts.dragSensitivityRad,
      degToRad(this.opts.maxPitchDeg)
    );
    this.globeYaw = this.normalizeYaw(updated.yaw);
    this.globePitch = updated.pitch;
  }

  private applyGlobeOrientationDelta(yawDelta: number, pitchDelta: number): void {
    const pitchLimit = degToRad(this.opts.maxPitchDeg);
    const nextPitch = this.globePitch + pitchDelta;
    const clampedPitch = clamp(nextPitch, -pitchLimit, pitchLimit);
    if (Math.abs(clampedPitch - nextPitch) > 1e-9) {
      this.angularVelocity = { x: this.angularVelocity.x, y: 0 };
    }
    this.globeYaw += yawDelta;
    this.globePitch = clampedPitch;
  }

  private normalizeYaw(yawRad: number): number {
    return wrapf(yawRad, -Math.PI, Math.PI);
  }

  private applyZoom(factor: number): void {
    this.userZoom = clamp(this.userZoom * factor, this.opts.userZoomMin, this.opts.userZoomMax);
    this.markDirty();
  }

  // ---------------------------------------------------------------------
  // Layout helpers
  // ---------------------------------------------------------------------

  private usableViewportSize(): Vec2 {
    const full = this.cssSize();
    return { x: full.x, y: Math.max(full.y - this.opts.uiTopMargin - this.opts.uiBottomMargin, 1.0) };
  }

  private layoutCenter(): Vec2 {
    const full = this.cssSize();
    const usable = this.usableViewportSize();
    return { x: full.x * 0.5, y: this.opts.uiTopMargin + usable.y * 0.5 };
  }

  private baseGlobeRadius(): number {
    const usable = this.usableViewportSize();
    return Math.min(usable.x, usable.y) * 0.5 * this.opts.globeScaleFactor * this.opts.globeZoom;
  }

  private globeRadius(): number {
    return this.baseGlobeRadius() * this.userZoom;
  }

  private viewBasis(): Basis {
    return CP.globeOrientationFromYawPitch(this.globeYaw, this.globePitch);
  }

  private currentJulianDate(): number {
    return this.opts.fixedJulianDate + this.dayOffset;
  }

  // ---------------------------------------------------------------------
  // Date UI
  // ---------------------------------------------------------------------

  private formatDateForInput(): string {
    const jd = this.currentJulianDate();
    const date = OM.julianDateToGregorian(jd);
    return `${date.day} ${MONTH_NAMES[date.month - 1]} ${date.year}`;
  }

  private syncDateInputText(): void {
    if (this.dateInputFocused) return;
    this.dateInputEl.value = this.formatDateForInput();
  }

  private commitDateInput(): void {
    const text = this.dateInputEl.value.trim();
    const parsed = parseTypedDate(text);
    if (!parsed) {
      this.flashDateInputError();
      this.syncDateInputText();
      return;
    }
    const jd = OM.julianDateFromGregorian(parsed.year, parsed.month, parsed.day);
    this.dayOffset = jd - this.opts.fixedJulianDate;
    this.lastInputDayInt = Math.floor(jd + 0.5);
    this.syncDateInputText();
    this.markDirty();
  }

  private flashDateInputError(): void {
    this.dateInputEl.classList.remove('celestial-globe-date-input--error');
    // Force reflow so the animation restarts if it's already mid-shake.
    void this.dateInputEl.offsetWidth;
    this.dateInputEl.classList.add('celestial-globe-date-input--error');
    if (this.dateInputShakeTimeout !== null) {
      window.clearTimeout(this.dateInputShakeTimeout);
    }
    this.dateInputShakeTimeout = window.setTimeout(() => {
      this.dateInputEl.classList.remove('celestial-globe-date-input--error');
      this.dateInputShakeTimeout = null;
    }, 400);
  }

  // ---------------------------------------------------------------------
  // Play / pause
  // ---------------------------------------------------------------------

  play(): void {
    if (this.playing) return;
    this.playing = true;
    this.playButtonEl.textContent = '⏸';
    this.playButtonEl.setAttribute('aria-label', 'Pause');
    this.markDirty();
  }

  pause(): void {
    if (!this.playing) return;
    this.playing = false;
    this.playButtonEl.textContent = '▶';
    this.playButtonEl.setAttribute('aria-label', 'Play');
    this.markDirty();
  }

  isPlaying(): boolean {
    return this.playing;
  }

  private advancePlayback(delta: number): void {
    const previousInputDay = this.lastInputDayInt;
    this.dayOffset += this.opts.autoAdvanceDaysPerSec * delta;

    const dayInt = Math.floor(this.currentJulianDate() + 0.5);
    if (previousInputDay === null || dayInt !== previousInputDay) {
      this.lastInputDayInt = dayInt;
      this.syncDateInputText();
    }

    if (!this.dragging) {
      this.globeYaw = this.normalizeYaw(this.globeYaw + this.opts.autoRotateYawRadPerSec * delta);
    }
  }

  // ---------------------------------------------------------------------
  // Selection
  // ---------------------------------------------------------------------

  private trySelectConstellationAt(clientPos: Vec2): void {
    if (!this.catalog) {
      this.setSelectedConstellation(null);
      return;
    }
    const hit = this.constellationAtScreenPos(this.clientToCanvasPos(clientPos));
    if (!hit) {
      this.setSelectedConstellation(null);
      return;
    }
    this.setSelectedConstellation(hit.id ?? null);
  }

  private setSelectedConstellation(constellationId: string | null): void {
    this.selectedConstellationId = constellationId;
    if (constellationId) {
      this.emitSelection(constellationId);
    }
    this.markDirty();
  }

  private clientToCanvasPos(clientPos: Vec2): Vec2 {
    const rect = this.canvas.getBoundingClientRect();
    return { x: clientPos.x - rect.left, y: clientPos.y - rect.top };
  }

  private constellationAtScreenPos(canvasPos: Vec2): CatalogConstellation | null {
    if (!this.catalog) return null;
    const center = this.layoutCenter();
    const radius = this.globeRadius();
    const basis = this.viewBasis();
    let best: CatalogConstellation | null = null;
    let bestDistSq = Infinity;

    for (const constellation of this.catalog.constellations) {
      for (const star of constellation.stars) {
        const projected = CP.orthographicRaDecDegToXy(star.ra, star.dec, radius, basis);
        if (!projected) continue;
        const pos = { x: center.x + projected.x, y: center.y + projected.y };
        const hitRadius = this.opts.constellationHitStarPx + this.opts.constellationLineWidth;
        const distSq = distanceSq(canvasPos, pos);
        if (distSq <= hitRadius * hitRadius && distSq < bestDistSq) {
          bestDistSq = distSq;
          best = constellation;
        }
      }

      for (const segment of constellation.lines) {
        const clipped = this.clipSegmentScreen(segment, center, radius, basis);
        if (clipped.length < 2) continue;
        const dist = pointSegmentDistance(canvasPos, clipped[0], clipped[1]);
        if (dist <= this.opts.constellationHitLinePx && dist * dist < bestDistSq) {
          bestDistSq = dist * dist;
          best = constellation;
        }
      }
    }

    return best;
  }

  private clipSegmentScreen(
    segment: [[number, number], [number, number]],
    center: Vec2,
    radius: number,
    basis: Basis
  ): Vec2[] {
    const [start, end] = segment;
    const startUnit = CP.unitVectorFromRaDecDeg(start[0], start[1]);
    const endUnit = CP.unitVectorFromRaDecDeg(end[0], end[1]);
    const clippedView = CP.clipUnitSegmentToVisibleHemisphere(startUnit, endUnit, basis);
    if (clippedView.length === 0) return [];
    return clippedView.map((v) => this.screenFromViewPos(v, center, radius));
  }

  private screenFromViewPos(viewPos: Vec3, center: Vec2, radius: number): Vec2 {
    const xy = CP.orthographicViewXy(viewPos, radius);
    return { x: center.x + xy.x, y: center.y + xy.y };
  }

  // ---------------------------------------------------------------------
  // Animation loop
  // ---------------------------------------------------------------------

  private startLoop(): void {
    const step = (time: number) => {
      if (this.destroyed) return;
      const last = this.lastFrameTime ?? time;
      const delta = Math.min((time - last) / 1000.0, 0.1);
      this.lastFrameTime = time;

      this.tick(delta);

      if (this.dirty) {
        this.dirty = false;
        this.draw();
      }
      this.rafHandle = requestAnimationFrame(step);
    };
    this.rafHandle = requestAnimationFrame(step);
  }

  private tick(delta: number): void {
    if (this.playing) {
      this.advancePlayback(delta);
      this.markDirty();
    }

    if (this.dragging || this.angularVelocity.x * this.angularVelocity.x + this.angularVelocity.y * this.angularVelocity.y < 1e-12) {
      return;
    }
    this.applyGlobeOrientationDelta(this.angularVelocity.x * delta, this.angularVelocity.y * delta);
    const friction = Math.exp(-this.opts.dragSpinFriction * delta);
    this.angularVelocity = { x: this.angularVelocity.x * friction, y: this.angularVelocity.y * friction };
    this.markDirty();
  }

  private markDirty(): void {
    this.dirty = true;
  }

  // ---------------------------------------------------------------------
  // Drawing (_draw order mirrors menu_sky_overview_globe.gd)
  // ---------------------------------------------------------------------

  private draw(): void {
    const ctx = this.ctx;
    const dpr = window.devicePixelRatio || 1;
    const size = this.cssSize();

    ctx.save();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, size.x, size.y);

    // 1. Background fill.
    ctx.fillStyle = toCssRgba(this.opts.backgroundColor);
    ctx.fillRect(0, 0, size.x, size.y);

    if (!this.orbitalData) {
      ctx.restore();
      return;
    }

    const center = this.layoutCenter();
    const radius = this.globeRadius();
    const basis = this.viewBasis();
    const jd = this.currentJulianDate();
    const backdropFade = 1.0;

    // 2. Globe disk.
    this.drawGlobeDisk(ctx, center, radius);

    // 3. Ecliptic.
    if (this.opts.showEcliptic) {
      this.drawEcliptic(ctx, center, radius, basis, backdropFade);
    }

    // 4. Constellations.
    if (this.catalog) {
      this.drawConstellations(ctx, center, radius, basis);
    }

    // 5. Bodies.
    this.drawBodies(ctx, center, radius, basis, jd, backdropFade);

    // 6. Celestial poles.
    if (this.opts.showCelestialPoles) {
      this.drawCelestialPoles(ctx, center, radius, basis, backdropFade);
    }

    // 7. Globe outline arc.
    this.strokeCircle(ctx, center, radius, toCssRgba(this.opts.globeOutlineColor), this.opts.globeOutlineWidth);

    ctx.restore();
  }

  private drawGlobeDisk(ctx: CanvasRenderingContext2D, center: Vec2, radius: number): void {
    ctx.beginPath();
    ctx.arc(center.x, center.y, radius, 0, Math.PI * 2);
    ctx.fillStyle = toCssRgba(this.opts.globeFillColor);
    ctx.fill();
  }

  private strokeCircle(ctx: CanvasRenderingContext2D, center: Vec2, radius: number, style: string, width: number): void {
    ctx.beginPath();
    ctx.arc(center.x, center.y, radius, 0, Math.PI * 2);
    ctx.strokeStyle = style;
    ctx.lineWidth = width;
    ctx.stroke();
  }

  private drawEcliptic(ctx: CanvasRenderingContext2D, center: Vec2, radius: number, basis: Basis, backdropFade: number): void {
    for (let degree = 0; degree < 360; degree++) {
      const lonA = degToRad(degree);
      const lonB = degToRad(degree + 1);
      const equA = OM.eclipticLonLatToEquatorialRad(lonA, 0.0);
      const equB = OM.eclipticLonLatToEquatorialRad(lonB, 0.0);
      const segment: [[number, number], [number, number]] = [
        [normalizeRaDegLocal(radToDeg(equA.x)), radToDeg(equA.y)],
        [normalizeRaDegLocal(radToDeg(equB.x)), radToDeg(equB.y)],
      ];
      const clipped = this.clipSegmentScreen(segment, center, radius, basis);
      if (clipped.length < 2) continue;
      const viewPos = CP.orthographicRaDecDegToView(segment[0][0], segment[0][1], basis);
      const fade = CP.limbFade(viewPos, this.opts.limbFadeWidth) * backdropFade;
      this.drawLine(ctx, clipped[0], clipped[1], this.opts.eclipticColor, fade, this.opts.eclipticLineWidth);
    }
  }

  private drawLine(ctx: CanvasRenderingContext2D, a: Vec2, b: Vec2, color: RGBA, fadeAlpha: number, width: number): void {
    if (fadeAlpha <= 0.0) return;
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.strokeStyle = toCssRgba(color, fadeAlpha);
    ctx.lineWidth = width;
    ctx.lineCap = 'round';
    ctx.stroke();
  }

  private drawConstellations(ctx: CanvasRenderingContext2D, center: Vec2, radius: number, basis: Basis): void {
    if (!this.catalog) return;
    for (const constellation of this.catalog.constellations) {
      if (this.opts.showConstellationLines) {
        for (const segment of constellation.lines) {
          const clipped = this.clipSegmentScreen(segment, center, radius, basis);
          if (clipped.length < 2) continue;
          const viewPos = CP.orthographicRaDecDegToView(segment[0][0], segment[0][1], basis);
          const fade = CP.limbFade(viewPos, this.opts.limbFadeWidth);
          if (fade <= 0.0) continue;
          this.drawLine(ctx, clipped[0], clipped[1], this.opts.constellationLineColor, fade, this.opts.constellationLineWidth);
        }
      }

      if (this.opts.showConstellationVertexStars) {
        for (const star of constellation.stars) {
          const viewPos = CP.orthographicRaDecDegToView(star.ra, star.dec, basis);
          if (!CP.isVisibleInView(viewPos)) continue;
          const fade = CP.limbFade(viewPos, this.opts.limbFadeWidth);
          if (fade <= 0.0) continue;
          const pos = this.screenFromViewPos(viewPos, center, radius);
          const magnitude = star.mag ?? 3.0;
          const clampedCoreRadius = clamp((4.2 - magnitude * 0.9) * this.opts.starSizeScale, 1.0, 6.0);
          const coreRadius = clampedCoreRadius * Math.pow(this.userZoom, this.opts.starZoomSizeExponent);
          this.drawStar(ctx, pos, coreRadius, this.opts.starColor, fade);
        }
      }

      if (this.opts.showConstellationNames) {
        const labelPos = this.constellationLabelPosition(constellation, center, radius, basis);
        if (labelPos) {
          this.drawLabel(
            ctx,
            labelPos,
            constellation.name || constellation.id,
            lightened(this.opts.constellationLineColor, 0.1),
            this.opts.labelFontSize - 1,
            0.85
          );
        }
      }
    }
  }

  private constellationLabelPosition(
    constellation: CatalogConstellation,
    center: Vec2,
    radius: number,
    basis: Basis
  ): Vec2 | null {
    let sum = new Vec3(0, 0, 0);
    let count = 0;
    for (const segment of constellation.lines) {
      for (const point of segment) {
        const viewPos = CP.orthographicRaDecDegToView(point[0], point[1], basis);
        if (!CP.isVisibleInView(viewPos)) continue;
        sum = sum.add(viewPos);
        count++;
      }
    }
    if (count === 0) return null;
    const meanView = sum.scale(1 / count).normalized();
    if (meanView.lengthSquared() < 1e-12) return null;
    if (!CP.isVisibleInView(meanView)) return null;
    return this.screenFromViewPos(meanView, center, radius);
  }

  private drawBodies(
    ctx: CanvasRenderingContext2D,
    center: Vec2,
    radius: number,
    basis: Basis,
    jd: number,
    backdropFade: number
  ): void {
    if (!this.orbitalData || !this.orbitalData['earth']) return;
    const earth = OM.heliocentricEcliptic(this.orbitalData['earth'], jd);

    for (const planetName of PLANET_DRAW_ORDER) {
      if (!this.planetVisible(planetName) || !this.orbitalData[planetName]) continue;
      const equatorial = OM.geocentricEquatorialRad(planetName, this.orbitalData, jd, earth);
      this.drawEquatorialBody(
        ctx,
        center,
        radius,
        basis,
        equatorial,
        this.opts.planetRadius,
        this.planetColor(planetName),
        PLANET_LABELS[planetName],
        this.opts.showPlanetNames,
        backdropFade
      );
    }

    if (this.opts.showSun) {
      const sunEquatorial = OM.sunGeocentricEquatorialRad(this.orbitalData, jd);
      this.drawEquatorialBody(
        ctx,
        center,
        radius,
        basis,
        sunEquatorial,
        this.opts.sunRadius,
        this.opts.sunColor,
        'Sol',
        this.opts.showSunLabel,
        backdropFade
      );
    }

    if (this.opts.showMoon) {
      const moonEquatorial = OM.moonGeocentricEquatorialRad(jd);
      this.drawEquatorialBody(
        ctx,
        center,
        radius,
        basis,
        moonEquatorial,
        this.opts.moonRadius,
        this.opts.moonColor,
        'Luna',
        this.opts.showMoonLabel,
        backdropFade
      );
    }
  }

  private drawEquatorialBody(
    ctx: CanvasRenderingContext2D,
    center: Vec2,
    radius: number,
    basis: Basis,
    equatorial: Vec2,
    bodyRadius: number,
    color: RGBA,
    label: string,
    showLabel: boolean,
    backdropFade: number
  ): void {
    let raDeg = radToDeg(equatorial.x);
    if (raDeg < 0.0) raDeg += 360.0;
    const decDeg = radToDeg(equatorial.y);
    const viewPos = CP.orthographicRaDecDegToView(raDeg, decDeg, basis);
    if (!CP.isVisibleInView(viewPos)) return;
    const fade = CP.limbFade(viewPos, this.opts.limbFadeWidth) * backdropFade;
    if (fade <= 0.0) return;
    const pos = this.screenFromViewPos(viewPos, center, radius);

    ctx.beginPath();
    ctx.arc(pos.x, pos.y, bodyRadius + 1.0, 0, Math.PI * 2);
    ctx.fillStyle = toCssRgba(darkened(color, 0.25), fade);
    ctx.fill();

    ctx.beginPath();
    ctx.arc(pos.x, pos.y, bodyRadius, 0, Math.PI * 2);
    ctx.fillStyle = toCssRgba(color, fade);
    ctx.fill();

    if (showLabel) {
      this.drawLabel(
        ctx,
        { x: pos.x + this.opts.bodyLabelOffset.x, y: pos.y + this.opts.bodyLabelOffset.y },
        label,
        lightened(color, 0.15),
        this.opts.labelFontSize,
        fade
      );
    }
  }

  private planetColor(planetName: PlanetName): RGBA {
    switch (planetName) {
      case 'mercury':
        return this.opts.mercuryColor;
      case 'venus':
        return this.opts.venusColor;
      case 'mars':
        return this.opts.marsColor;
      case 'jupiter':
        return this.opts.jupiterColor;
      case 'saturn':
        return this.opts.saturnColor;
      default:
        return { r: 1, g: 1, b: 1, a: 1 };
    }
  }

  private planetVisible(planetName: PlanetName): boolean {
    switch (planetName) {
      case 'mercury':
        return this.opts.showMercury;
      case 'venus':
        return this.opts.showVenus;
      case 'mars':
        return this.opts.showMars;
      case 'jupiter':
        return this.opts.showJupiter;
      case 'saturn':
        return this.opts.showSaturn;
      default:
        return false;
    }
  }

  private drawCelestialPoles(ctx: CanvasRenderingContext2D, center: Vec2, radius: number, basis: Basis, backdropFade: number): void {
    this.drawCelestialPole(ctx, center, radius, basis, CP.NCP_RA_DEG, CP.NCP_DEC_DEG, this.opts.northPoleColor, 'NCP', backdropFade);
    this.drawCelestialPole(ctx, center, radius, basis, CP.NCP_RA_DEG, -90.0, this.opts.southPoleColor, 'SCP', backdropFade);
  }

  private drawCelestialPole(
    ctx: CanvasRenderingContext2D,
    center: Vec2,
    radius: number,
    basis: Basis,
    raDeg: number,
    decDeg: number,
    color: RGBA,
    label: string,
    backdropFade: number
  ): void {
    const viewPos = CP.orthographicRaDecDegToView(raDeg, decDeg, basis);
    if (!CP.isVisibleInView(viewPos)) return;
    const fade = CP.limbFade(viewPos, this.opts.limbFadeWidth) * backdropFade;
    if (fade <= 0.0) return;

    const pos = this.screenFromViewPos(viewPos, center, radius);
    const arm = this.opts.poleMarkerRadius;

    ctx.beginPath();
    ctx.moveTo(pos.x - arm, pos.y);
    ctx.lineTo(pos.x + arm, pos.y);
    ctx.strokeStyle = toCssRgba(color, fade);
    ctx.lineWidth = 2.0;
    ctx.lineCap = 'round';
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(pos.x, pos.y - arm);
    ctx.lineTo(pos.x, pos.y + arm);
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(pos.x, pos.y, arm * 0.35, 0, Math.PI * 2);
    ctx.fillStyle = toCssRgba(color, fade);
    ctx.fill();

    if (this.opts.showPoleLabels) {
      this.drawLabel(ctx, { x: pos.x + arm + 4.0, y: pos.y - arm - 2.0 }, label, lightened(color, 0.12), this.opts.labelFontSize, fade);
    }
  }

  private drawStar(ctx: CanvasRenderingContext2D, at: Vec2, coreRadius: number, color: RGBA, fade: number): void {
    if (fade <= 0.0) return;
    if (this.opts.showStarGlow && this.starGlowSprite) {
      // Pre-rendered 64px radial-gradient sprite tinted with star_color (built once in the
      // constructor from opts.starColor), blitted at coreRadius * diameterScale with
      // globalAlpha = fade -- matches _build_star_glow_texture + draw_texture_rect(modulate).
      const diameter = Math.max(coreRadius * this.opts.starGlowDiameterScale, coreRadius + 2.0);
      const half = diameter * 0.5;
      ctx.save();
      ctx.globalAlpha = fade;
      ctx.drawImage(this.starGlowSprite, at.x - half, at.y - half, diameter, diameter);
      ctx.restore();
    }
    ctx.beginPath();
    ctx.arc(at.x, at.y, coreRadius, 0, Math.PI * 2);
    ctx.fillStyle = toCssRgba(color, fade);
    ctx.fill();
  }

  private drawLabel(ctx: CanvasRenderingContext2D, at: Vec2, text: string, color: RGBA, fontSize: number, fade: number): void {
    if (fade <= 0.0 || !text) return;
    ctx.save();
    ctx.font = `${fontSize}px "${this.opts.labelFontFamily}", serif`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = toCssRgba(color, fade);
    ctx.fillText(text, at.x, at.y);
    ctx.restore();
  }

  // ---------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------

  setDate(jd: number): void {
    this.dayOffset = jd - this.opts.fixedJulianDate;
    this.lastInputDayInt = Math.floor(jd + 0.5);
    this.syncDateInputText();
    this.markDirty();
  }

  getSelectedConstellation(): string | null {
    return this.selectedConstellationId;
  }

  on(_event: 'constellation-selected', handler: (id: string) => void): void {
    this.listeners.add(handler);
  }

  off(_event: 'constellation-selected', handler: (id: string) => void): void {
    this.listeners.delete(handler);
  }

  private emitSelection(constellationId: string): void {
    for (const listener of this.listeners) {
      listener(constellationId);
    }
    this.mount.dispatchEvent(
      new CustomEvent('constellation-selected', { detail: constellationId, bubbles: true })
    );
  }

  destroy(): void {
    this.destroyed = true;
    if (this.rafHandle !== null) {
      cancelAnimationFrame(this.rafHandle);
    }
    if (this.dateInputShakeTimeout !== null) {
      window.clearTimeout(this.dateInputShakeTimeout);
    }
    this.resizeObserver?.disconnect();
    this.root.remove();
  }
}

// ---------------------------------------------------------------------
// Free helpers
// ---------------------------------------------------------------------

function distance(a: Vec2, b: Vec2): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function distanceSq(a: Vec2, b: Vec2): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return dx * dx + dy * dy;
}

function pointSegmentDistance(point: Vec2, start: Vec2, end: Vec2): number {
  const segX = end.x - start.x;
  const segY = end.y - start.y;
  const lengthSq = segX * segX + segY * segY;
  if (lengthSq <= 1e-8) {
    return distance(point, start);
  }
  const t = clamp(((point.x - start.x) * segX + (point.y - start.y) * segY) / lengthSq, 0.0, 1.0);
  return distance(point, { x: start.x + segX * t, y: start.y + segY * t });
}

function normalizeRaDegLocal(raDeg: number): number {
  const r = raDeg % 360.0;
  return r < 0 ? r + 360.0 : r;
}

interface ParsedDate {
  year: number;
  month: number;
  day: number;
}

const MONTH_NAME_TO_NUM: Record<string, number> = (() => {
  const map: Record<string, number> = { ...MONTH_ABBR_TO_NUM };
  MONTH_NAMES.forEach((name, index) => {
    map[name.toLowerCase()] = index + 1;
  });
  return map;
})();

/**
 * Parses a typed date string in one of two forms:
 *  - "1 January 1453" (day, month name or 3-letter abbreviation, year), case-insensitive.
 *  - "1453-01-01" (ISO-ish year-month-day).
 * Returns null if the text does not match either form or the values are out of range.
 */
function parseTypedDate(text: string): ParsedDate | null {
  const trimmed = text.trim();
  if (!trimmed) return null;

  // ISO-ish: YYYY-MM-DD (year may be negative for BCE-style input).
  const isoMatch = trimmed.match(/^(-?\d{1,6})-(\d{1,2})-(\d{1,2})$/);
  if (isoMatch) {
    const year = Number(isoMatch[1]);
    const month = Number(isoMatch[2]);
    const day = Number(isoMatch[3]);
    if (!isValidDate(year, month, day)) return null;
    return { year, month, day };
  }

  // "1 January 1453" / "1 Jan 1453".
  const longMatch = trimmed.match(/^(\d{1,2})\s+([A-Za-z]+)\s+(-?\d{1,6})$/);
  if (longMatch) {
    const day = Number(longMatch[1]);
    const monthName = longMatch[2].toLowerCase();
    const year = Number(longMatch[3]);
    const month = MONTH_NAME_TO_NUM[monthName];
    if (!month) return null;
    if (!isValidDate(year, month, day)) return null;
    return { year, month, day };
  }

  return null;
}

function isValidDate(year: number, month: number, day: number): boolean {
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) return false;
  if (month < 1 || month > 12) return false;
  if (day < 1 || day > 31) return false;
  return true;
}

function buildStarGlowSprite(tint: RGBA): HTMLCanvasElement {
  // Matches _build_star_glow_texture: radial gradient, alpha stops 1.0@0, 0.55@0.18,
  // 0.12@0.45, 0@1.0, tinted with star_color (the texture is drawn with `modulate` in Godot).
  const size = 64;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const gradient = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  gradient.addColorStop(0.0, toCssRgba(tint, 1.0));
  gradient.addColorStop(0.18, toCssRgba(tint, 0.55));
  gradient.addColorStop(0.45, toCssRgba(tint, 0.12));
  gradient.addColorStop(1.0, toCssRgba(tint, 0.0));
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);
  return canvas;
}

export function createCelestialGlobe(
  mount: HTMLElement,
  options?: Partial<GlobeOptions>
): CelestialGlobeHandle {
  const globe = new CelestialGlobe(mount, options);
  return {
    destroy: () => globe.destroy(),
    setDate: (jd: number) => globe.setDate(jd),
    getSelectedConstellation: () => globe.getSelectedConstellation(),
    play: () => globe.play(),
    pause: () => globe.pause(),
    isPlaying: () => globe.isPlaying(),
    on: (event, handler) => globe.on(event, handler),
    off: (event, handler) => globe.off(event, handler),
  };
}
