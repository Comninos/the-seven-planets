# The Seven Planets

An interactive, orthographic star map showing constellations, the ecliptic, the celestial poles, and the historically-accurate positions of the seven classical planets for any date (Julian calendar before the October 1582 reform, Gregorian after).

Despite looking 3D, everything is a pure math projection drawn on a 2D `<canvas>`. No WebGL, no runtime dependencies.

## Widget (`web/planetary-sphere/`)

TypeScript + Vite. Drag to rotate, scroll or pinch to zoom, click a constellation to select it, type a date ("29 May 1453"), or press play to watch the sky drift and the planets move.

```sh
cd web/planetary-sphere
npm install
npm run dev      # dev server
npm test         # vitest (calendar, ephemeris, projection checks)
npm run build    # typecheck + static build in dist/
```

The build is a self-contained static page — embed it anywhere with an `<iframe>`.
