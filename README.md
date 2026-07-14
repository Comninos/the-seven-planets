# The Seven Planets

A map of the night sky. It draws the constellations on a sphere and shows where the seven classical planets are positioned at any date you choose.

The purpose is to present the entire sky in a way that feels natural to look at, and let you scrub through time to watch the planets wander among the stars.

## What you see

The sky is shown as a globe you look at from the outside, an orthographic, spherical projection. There are some historical examples of sky maps constructed in this way, such as the [celestial globe by Gerhard Emmoser, 1579](https://www.metmuseum.org/art/collection/search/193606). 

- **Constellations** are drawn as connected star-to-star lines.
- **The ecliptic** is the path the Sun appears to trace through the year. It is drawn as a gold ring. The planets always stay close to this line (they orbit the Sun), which is why they only ever appear in the zodiac constellations, and nowhere else in the sky.
- **The celestial poles**, NCP and SCP are marked and serve as the axis for spinning the globe.
- **The seven planets** are placed at their correct positions for the chosen date and labelled.

You can drag to rotate the globe, zoom, and type in a date. You can also toggle the date auto-advance and the slow spinning force.

By default it opens on **29 May 1453**, the day of the fall of Constantinople.

Despite looking 3D, everything is plain mathematics drawn onto a flat 2D `<canvas>`. There is no WebGL and there are no runtime dependencies. The finished build is a single self-contained static page you can drop into any website with an `<iframe>`.

## Inaccuracies and limitations

This is meant to be an intuitive, attractive overview, not a precise map. The limitations are an intentional part of the work, which sits within an ancient human tradition of producing inaccurate star maps.

- **Approximate planet positions.** The orbital-element method is only good to roughly arc-minute accuracy near our own era, and it drifts as you move away from the year 2000. The further back or forward in time you go, the less trustworthy the planet positions become.
- **Low-precision Moon.** The Moon uses a short formula accurate to only about a tenth of a degree (a few times the Moon's own width). It's fine for showing which constellation the Moon is near.
- **Fixed stars.** The constellations are drawn at their year-2000 (J2000) positions and do not account for the precession, a perceived shift in star positions caused by the wobble of Earth's axis. 
- **Simplified star set.** Only the stars that form the constellation line figures are drawn (with a fixed nominal brightness), not a full star catalogue.

## The widget (`web/planetary-sphere/`)

Built with TypeScript and Vite, with no runtime dependencies.

```sh
cd web/planetary-sphere
npm install
npm run dev      # start the dev server
npm run build    # type-check and produce a static build in dist/
```

The build in `dist/` is a self-contained static page. You can embed it like this:

```
<iframe src="https://comninos.github.io/the-seven-planets/"
        style="width:100%; aspect-ratio:1/1; height:auto; border:none; border-radius:0px;"
        loading="lazy"></iframe>
```

## Data sources and credits

The constellation data and much of the implementation logic are based on **[d3-celestial](https://github.com/ofrohn/d3-celestial)** by Olaf Frohn, which is released under the BSD (3-Clause) license.

Specifically:

- `constellations.lines.json`: the star-to-star lines that make up each constellation figure, from d3-celestial.
- `constellations.json`: constellation names and ranking, from d3-celestial.

Both files use positions at the J2000 epoch, with right ascension expressed as longitude from −180° to 180° (the GeoJSON convention used by d3-celestial). The approach to loading, clipping, projecting, and drawing this sky data also follows d3-celestial's design.

The planetary orbital elements (`orbital_elements.json`) come from NASA/JPL's "Keplerian Elements for Approximate Positions of the Major Planets." The Moon and coordinate conversions follow the standard low-precision formulas from Jean Meeus's *Astronomical Algorithms*.

## License

This project is released under the [MIT License](LICENSE). The bundled d3-celestial data remain under their original BSD (3-Clause) license.