// Demo bootstrap: mounts the Celestial Globe widget into the page.

import { createCelestialGlobe } from './celestial-globe';
import './style.css';

const mount = document.getElementById('app');
if (!mount) {
  throw new Error('main: #app mount element not found.');
}

const globe = createCelestialGlobe(mount);

mount.addEventListener('constellation-selected', (e) => {
  const detail = (e as CustomEvent<string>).detail;
  console.log('constellation-selected:', detail);
});

// Expose for manual debugging in the console.
(window as unknown as { celestialGlobe: typeof globe }).celestialGlobe = globe;
