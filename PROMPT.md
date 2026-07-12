# Build prompt: "Celestial Globe" web widget

## Goal
Port the celestial-globe UI from the Godot game *Project Epitaph* into a self-contained,
embeddable web widget for the project's promo site. It's an interactive orthographic
star map: a rotating "sphere" showing constellations, the ecliptic, celestial poles, and
the historically-accurate positions of the Sun, Moon, and 5 classical planets for a date.

Despite looking 3D, there is **no 3D anywhere** — the sphere is a pure math projection
(RA/Dec → rotating unit sphere → orthographic screen XY) drawn with 2D primitives. Do not
introduce a 3D engine or WebGL 3D. Target an HTML5 `<canvas>` 2D context.

## Deliverable
A standalone, dependency-free build in this folder (`web/planetary-sphere/`):
- `index.html`, plus vanilla ES-module JS/TS and CSS. No framework, no build step required
  (a plain `index.html` that runs from `file://` or any static host is ideal).
- Copy the needed assets from `reference/` into a served location (e.g. `assets/`):
  `data/*.json`, `fonts/IMFELLEnglish-Regular.ttf` (load via `@font-face`).
- It must embed cleanly as an `<iframe>` or a single mounted element on an existing site.

## Reference code (all in `reference/`, GDScript — this is the source of truth)
Port the math **exactly**; positions must match the game.
- `scripts/celestial_projection.gd` — RA/Dec→unit vector, celestial→model space
  `(x, z, -y)`, turntable orientation `Basis(RIGHT,-pitch) * Basis(UP,yaw)`, orthographic
  projection `(x, -y) * radius`, front-hemisphere visibility (`view.z > 0`), limb fade, and
  great-circle segment clipping to the visible hemisphere. Reimplement all of it in JS.
- `scripts/orbital_mechanics.gd` — Keplerian solver (10 iterations), heliocentric→
  geocentric→J2000-equatorial conversion, Julian↔Gregorian (Julian calendar before the
  Oct 1582 reform, Gregorian after), Sun position, and Meeus Ch.47 low-precision Moon.
  Port verbatim.
- `scripts/constellation_catalog.gd` — loads d3-celestial GeoJSON lines + metadata,
  filters by `rank <= max_rank` (default 3), splits polylines into segments, dedups vertex
  "stars". Port the loading/normalization logic.
- `scripts/menu_sky_overview_globe.gd` — the full UI: `_draw()` order, all tunable
  constants/colors/sizes (top of file), input handling, and animation. Mirror it.
- `scenes/menu_sky_overview_globe.tscn` — **IMPORTANT: this holds the real runtime
  values, not the script defaults.** The scene overrides many `@export` vars, so use these
  as the defaults for the widget: `initial_view_dec_deg = -35`, `globe_scale_factor = 0.7`,
  `globe_zoom = 1.4`, `focus_anim_duration_sec = 0.4`, `focus_center_end_fraction = 0.8`,
  `focus_zoom_start_fraction = 0.05`, `focus_fill_fraction = 0.9`, `star_size_scale = 1.0`,
  `star_glow_diameter_scale = 8.0`, `planet_radius = 7`, `sun_radius = 8`, `moon_radius = 8`,
  `constellation_line_width = 0.5`, `ecliptic_line_width = 0.5`, `globe_outline_width = 0.5`,
  `label_font_size = 22`, plus the overridden `background/globe_fill/ecliptic/
  constellation_line/planet/sun/pole` colors (copy the exact `Color(...)` values from the
  scene). Where the script default and scene differ, **the scene wins.** The scene also
  defines the UI node layout (DateLabel top-left, TimeSlider + SliderHint bottom) and, on
  the `DitherLayer`, the optional dither's 16-color `palette` + `blend = 0.5`.

## Rendering (mirror `_draw()` order)
1. Fill background. 2. Globe disk (filled circle). 3. Ecliptic (360 clipped 1° segments).
4. Constellations: clipped lines, vertex stars (soft radial glow + core dot; size from
`mag`), and Latin-ish names at the visible centroid. 5. Bodies: planets (Mercury, Venus,
Mars, Jupiter, Saturn) in draw order, then Sun ("Sol"), then Moon ("Luna"), each a filled
dot + darker rim + label. 6. Celestial poles (NCP/SCP cross markers). 7. Globe outline arc.
Use the exact colors/sizes/labels from the GDScript. Reproduce `limb_fade` edge fading and
the focus "dissolve" (non-focused constellations fade to `focus_unselected_opacity`).
Godot draw calls map directly: `draw_circle`→arc+fill, `draw_line`→stroke,
`draw_arc`→arc, `draw_string`→`fillText`.

## Interaction (from `_input`/`_process`)
- **Drag** (left mouse / touch) → turntable yaw (X) + pitch (Y), pitch clamped to
  `max_pitch_deg`; NCP/SCP stay on a fixed vertical meridian (no roll).
- **Momentum**: after release, keep spinning from pointer velocity with exponential
  friction (`drag_spin_friction`), matching `_process`.
- **Scroll / pinch** → zoom, clamped `USER_ZOOM_MIN..MAX` (0.6–4.0).
- **Click a constellation** (distinguish click from drag via `CLICK_DRAG_THRESHOLD_PX`):
  hit-test projected stars + line segments, then animate yaw/pitch/zoom to frame it and
  dissolve the rest (`_begin_focus_animation`, two-segment eased timing). Fire a
  `constellation-selected` event (id) on arrival — expose it as a JS callback/CustomEvent.
- **Escape / back control** → reverse the animation to the overview.
- **Date/time slider** (±`slider_year_span` years, default 50) → recompute body positions;
  show the formatted date label. Base date is `fixed_julian_date` (default JD 2251766.5 =
  1453-01-01). Make base date + slider visibility configurable options.

## Config surface
Expose an options object mirroring the GDScript `@export` vars: base Julian date, initial
view RA/Dec, zoom limits, layer toggles (ecliptic, each planet, Sun, Moon, poles, labels),
all colors and sizes, and whether the time slider shows. Sensible defaults = the GDScript
defaults.

## Out of scope
- **Hevelius constellation artwork** — fully excluded (dev-only; assets not shipped). Ignore
  `constellation_art*` entirely.
- **`configure_for_volunteer()` / `CharacterData`** — game-integration glue (locks the sky to
  a character's birth date). `CharacterData` is a game type that is intentionally NOT shipped
  here; ignore this method. The generic "set base date" option in the config covers the
  equivalent web use case.
- **The dither post-process** (`shaders/post_process_dither_v2.gdshader`, `textures/
  halftone_dither_pattern.png`) — OPTIONAL. Ship v1 without it. If time allows, add it as a
  toggleable WebGL post-pass (16-color palette quantization + ordered dither via the pattern
  texture) or skip. Not required for acceptance.

## Acceptance
- Renders the full-sky overview at 1453-01-01 with correct constellations, ecliptic, poles.
- Planet/Sun/Moon screen positions visually match the Godot version for a spot-checked date.
- Smooth drag-with-momentum, zoom, click-to-focus + escape, and a working date slider.
- Runs as a static page, embeds via iframe, is responsive, and works on desktop + touch.
- No external runtime dependencies; only the `data/` JSON and the TTF font are loaded.
