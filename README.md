# Quarks-JS

**Developer:** Kevin Roper · **License:** [MIT](LICENSE) (Copyright © 2026 Kevin Roper)

**A living particle field for the web.**  
WebGL quarks that wander, flock, spark, hunt, and die — all in pure JavaScript. Zero dependencies. Zero build step. Open `index.html` and it’s already moving.

---

## Why it hits

Most particle backgrounds just drift. Quarks-JS behaves.

- **Electric links** that tint to whatever they connect — prey green, predator pink, corpse grey
- **Wander + boids** so motion feels curious instead of robotic
- **Evolve mode** — eat, grow, become a predator blob, age out, get scavenged
- **Mouse grab & attract** so the field notices you
- **DOM obstacles** (`.quark-obstacle`) so UI stays clear while the chaos flows around it

Drop it behind a hero. Leave it full-screen as a demo. Either way, it looks expensive and costs nothing to run.

---

## Instant vibe check

1. Clone or download  
2. Open `index.html`  
3. Close the controls panel and watch the ecosystem breathe  

No npm. No bundler. No waiting.

---

## Drop it on any page

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

Stretch the canvas:

```css
#my-quarks {
  position: fixed;
  inset: 0;
  width: 100%;
  height: 100%;
}
```

Mark blockers with `class="quark-obstacle"` (cards, logos, dialogs) and particles bounce off their boxes.

---

## Dial the mood

Everything lives in `js/config.js` — or tweak live in the demo panel.

| Knob | What it does |
|------|----------------|
| **Particles** | Density, size, opacity, prey / predator colors |
| **Links** | Distance, electric crackle, role-tinted arcs |
| **Motion** | Speed, wander, boids (separation / alignment / cohesion) |
| **Evolve** | Eat-to-grow, max size, predator spawn, max age, corpse scavenging |
| **Interactivity** | Cursor grab links + attract pull |

Predators aren’t circles — they’re animated **attack blobs** that spike toward their hunt. When they hit max age they go grey; prey move in and nibble them down to nothing.

---

## Stack

- Pure **HTML + JS**
- **WebGL 1.0** points & lines
- Works in modern Chrome, Firefox, Safari, Edge

Built for hero sections, portfolios, kiosks, and anyone who wants motion that feels *alive*.

---

## License

**Developer:** Kevin Roper  
**License:** [MIT](LICENSE) — Copyright © 2026 Kevin Roper  

Use it, remix it, ship it — personal or commercial, per the license terms.
