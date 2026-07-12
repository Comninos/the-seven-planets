# The Seven Planets

An interactive celestial globe for the web — an orthographic star map showing
constellations, the ecliptic, the celestial poles, and the historically-accurate
positions of the Sun, Moon, and the five classical planets for any date
(Julian calendar before the October 1582 reform, Gregorian after).

Ported from a UI screen in the Godot game *Project Epitaph*; the original GDScript
lives in [`reference/`](reference/) as the source of truth for the math. Despite
looking 3D, everything is a pure math projection drawn on a 2D `<canvas>` — no
WebGL, no runtime dependencies.

## Widget (`web/planetary-sphere/`)

TypeScript + Vite. Drag to rotate (with momentum), scroll or pinch to zoom,
click a constellation to select it, type a date ("29 May 1453"), or press play
to watch the sky drift and the planets move.

```sh
cd web/planetary-sphere
npm install
npm run dev      # dev server
npm test         # vitest (calendar, ephemeris, projection checks)
npm run build    # typecheck + static build in dist/
```

The build is a self-contained static page — embed it anywhere with an `<iframe>`.
