/**
 * Default configuration for Quarks-JS WebGL particle background.
 * Loaded before webgl-quarks.js; passed to initQuarksWebGL as quarksWebglConfig.
 *
 * Config items
 * ------------
 * particles.number            Count and optional area density
 * particles.color / opacity   Particle appearance
 * particles.size              Base radius (+ optional random)
 * particles.line_linked       Neighbor links (distance, color, solid or electric)
 * particles.move              Motion: speed, wrap/bounce, cruise clamp
 *   .wander                   Soft random steering (enable, strength, rate)
 *   .boids                    Flocking: distance, separation_distance, weights
 *   .evolve                   Eat-to-grow: max size, predators, predator attacks,
 *                             prey_color / predator_color
 * interactivity.events        Hover modes: grab, attract
 * interactivity.modes.grab    Cursor link distance / opacity
 * interactivity.modes.attract Cursor pull strength / max_speed
 *
 * Modification log
 * ----------------
 * 2026-08-12  Added evolve.prey_color alongside predator_color for role tinting.
 * 2026-08-12  Added move.evolve (eat/grow, max size, predator chase/flee,
 *             predator-vs-predator attacks, respawn).
 * 2026-08-12  Added move.max_speed, move.min_speed, move.wander, move.boids
 *             for lifelike steering and flocking.
 * (prior)     Initial particles.js-style defaults for WebGL quarks demo.
 */
var quarksWebglConfig = {
  particles: {
    number: {
      value: 55,
      density: {
        enable: true,
        value_area: 800
      }
    },
    color: {
      value: '#ffffff'
    },
    opacity: {
      value: 0.5
    },
    size: {
      value: 3,
      random: true
    },
    line_linked: {
      enable: true,
      distance: 150,
      color: '#e82bdb',
      opacity: 0.4,
      width: 1,
      electric: {
        enable: true,
        jitter: 12,
        segments: 7,
        glow: 12,
        dot_size: 2
      }
    },
    move: {
      enable: true,
      speed: 6,
      out_mode: 'out',
      bounce: false,
      max_speed: 1.35,
      min_speed: 0.35,
      wander: {
        enable: true,
        strength: 0.045,
        rate: 0.18
      },
      boids: {
        enable: true,
        distance: 150,
        separation_distance: 42,
        separation: 0.09,
        alignment: 0.045,
        cohesion: 0.03
      },
      evolve: {
        enable: true,
        predator_chance: 0.14,
        predator_threshold: 5.5,
        max_size: 14,
        growth_per_eat: 0.55,
        size_advantage: 1.12,
        predator_attack: true,
        predator_attack_advantage: 1.18,
        chase: 0.11,
        flee: 0.13,
        sense_distance: 170,
        eat_cooldown: 10,
        respawn: true,
        prey_color: '#ffffff',
        predator_color: '#ff5c8a',
        predator_opacity: 0.85
      }
    }
  },
  interactivity: {
    events: {
      onhover: {
        enable: true,
        mode: ['grab', 'attract']
      }
    },
    modes: {
      grab: {
        distance: 190,
        line_linked: {
          opacity: 1
        }
      },
      attract: {
        distance: 200,
        strength: 0.05,
        max_speed: 2
      }
    }
  }
};
