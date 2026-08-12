# Quarks-JS

A **pure JavaScript + HTML** WebGL particle background with connected “quarks,” electric-style links, and mouse interactivity. No frameworks, no build step—drop it into any page or use it as a full-screen demo.

---

## Uses

- **Hero / landing backgrounds** — Full-viewport animated particles behind headlines or CTAs  
- **Portfolio and personal sites** — Subtle motion that doesn’t distract from content  
- **Demos and kiosks** — Standalone `index.html` runs in any modern browser  
- **Embedded canvases** — Use a single full-screen or contained canvas; particles respect viewport and obstacles  
- **Custom themes** — Configure particle count, colors, link style (solid vs electric), speed, and density via one config object  
- **Low dependency** — No npm, no React/Vue; works with static HTML or any stack that can include two script tags and a canvas  
- **WebGL** — GPU-accelerated so it stays smooth with many particles and links on high-DPI displays  

---

## Quick start

1. **Clone or download** this repo.
2. **Open `index.html`** in a browser (or serve the folder with any static server).
3. **Optional:** Edit `js/config.js` to change particle count, colors, link style, and interactivity.

No build or install required.

---

## Usage in your own page

1. Copy **`js/webgl-quarks.js`** and **`js/config.js`** (or define your own config object).
2. Add a `<canvas>` with an `id` you’ll pass to the init function.
3. Include the scripts (config before webgl-quarks), then call `initQuarksWebGL(canvasId, config)` when the DOM is ready.

Example:

```html
<canvas id="my-quarks"></canvas>
<script src="path/to/js/config.js"></script>
<script src="path/to/js/webgl-quarks.js"></script>
<script>
  document.addEventListener('DOMContentLoaded', function () {
    initQuarksWebGL('my-quarks', quarksWebglConfig);
  });
</script>
```

Make the canvas full-viewport (or the area you want) with CSS, e.g. `position: fixed; inset: 0; width: 100%; height: 100%;`.

---

## Configuration

The config object (see `js/config.js`) controls:

| Area | Options |
|------|--------|
| **Particles** | Count, density (per area), color (hex), opacity, size (with optional random) |
| **Links** | On/off, distance, color, opacity, line width; **electric** mode: jitter, segments, dot size |
| **Motion** | Speed, wrap vs bounce at edges |
| **Interactivity** | **grab** — links from cursor to nearby particles; **attract** — particles gently move toward cursor (distance, strength, max speed) |

Elements with the class **`quark-obstacle`** are treated as obstacles: particles bounce off their bounding boxes so content (e.g. a logo or card) stays clear.

---

## Browser support

Any browser with **WebGL** support (e.g. modern Chrome, Firefox, Safari, Edge). The script uses a single canvas and standard Web GL 1.0 APIs.

---

## License

See [LICENSE](LICENSE) in this repository. This project is suitable for public GitHub repos and reuse in personal or commercial projects according to the license terms.
