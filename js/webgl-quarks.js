/**
 * Quarks-JS — WebGL particle background with links and interactivity.
 * Pure JavaScript, no dependencies. Exposes initQuarksWebGL(canvasId, config) on window.
 *
 * Contents
 * --------
 * - hexToRgb / normalizeMode          Color + hover-mode helpers
 * - createShader / createProgram      WebGL shader compile/link
 * - WebGLQuarks                       Engine: particles, update, draw, mouse, obstacles
 *   - createParticles                 Spawn agents (position, velocity, wanderAngle, role)
 *   - applyWander                     Smooth random steering
 *   - applyBoids                      Separation, alignment, cohesion
 *   - applyEvolveSteering             Predator chase / prey flee
 *   - resolveEvolve                   Eat smaller agents, grow to max_size, respawn
 *   - clampSpeed                      Keep cruise speed in min/max band
 *   - update                          Forces → integrate → bounds → obstacles → evolve
 *   - buildLines / buildPoints        Link + point geometry for GPU
 *   - render                          RAF loop
 * - initQuarksWebGL(canvasId, config) Public entry point
 *
 * Modification log
 * ----------------
 * 2026-08-12  Added evolve: eat-to-grow with max size, predator roles, chase/flee,
 *             optional predator-vs-predator attacks, and prey respawn.
 * 2026-08-12  Added boids-lite (separation / alignment / cohesion) and wander steering;
 *             per-particle wanderAngle; move speed clamp; attract applied before clamp.
 * (prior)     Initial WebGL quarks engine: particles, electric links, grab/attract,
 *             DOM obstacles (.quark-obstacle), density resize.
 */
(function (global) {
  'use strict';

  function hexToRgb(hex) {
    var shorthandRegex = /^#?([a-f\d])([a-f\d])([a-f\d])$/i;
    hex = hex.replace(shorthandRegex, function (m, r, g, b) {
      return r + r + g + g + b + b;
    });
    var result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    if (!result) {
      return { r: 255, g: 255, b: 255 };
    }
    return {
      r: parseInt(result[1], 16),
      g: parseInt(result[2], 16),
      b: parseInt(result[3], 16)
    };
  }

  function normalizeMode(mode) {
    if (Array.isArray(mode)) {
      return mode;
    }
    if (typeof mode === 'string') {
      return [mode];
    }
    return [];
  }

  function createShader(gl, type, source) {
    var shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      console.error(gl.getShaderInfoLog(shader));
      gl.deleteShader(shader);
      return null;
    }
    return shader;
  }

  function createProgram(gl, vertexSource, fragmentSource) {
    var vertexShader = createShader(gl, gl.VERTEX_SHADER, vertexSource);
    var fragmentShader = createShader(gl, gl.FRAGMENT_SHADER, fragmentSource);
    if (!vertexShader || !fragmentShader) {
      return null;
    }
    var program = gl.createProgram();
    gl.attachShader(program, vertexShader);
    gl.attachShader(program, fragmentShader);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      console.error(gl.getProgramInfoLog(program));
      gl.deleteProgram(program);
      return null;
    }
    return program;
  }

  function WebGLQuarks(canvas, config) {
    this.canvas = canvas;
    this.config = config;
    this.gl = canvas.getContext('webgl', { alpha: true, antialias: true });
    this.pixelRatio = window.devicePixelRatio || 1;
    this.particles = [];
    this.mouse = { x: 0, y: 0, active: false };
    this.onhoverModes = normalizeMode(config.interactivity.events.onhover.mode);
    this.isGrabEnabled = this.onhoverModes.indexOf('grab') !== -1;
    this.isAttractEnabled = this.onhoverModes.indexOf('attract') !== -1;
    this.obstacleSelector = '.quark-obstacle';
  }

  WebGLQuarks.prototype.init = function () {
    if (!this.gl) {
      console.error('WebGL not supported in this browser.');
      return;
    }
    this.createPrograms();
    this.createBuffers();
    this.resize();
    this.createParticles();
    this.bindEvents();
    this.render();
  };

  WebGLQuarks.prototype.createPrograms = function () {
    var pointVertex = [
      'attribute vec2 a_position;',
      'attribute float a_size;',
      'attribute vec4 a_color;',
      'uniform vec2 u_resolution;',
      'varying vec4 v_color;',
      'void main(){',
      '  vec2 zeroToOne = a_position / u_resolution;',
      '  vec2 clip = zeroToOne * 2.0 - 1.0;',
      '  gl_Position = vec4(clip * vec2(1.0, -1.0), 0.0, 1.0);',
      '  gl_PointSize = a_size;',
      '  v_color = a_color;',
      '}'
    ].join('\n');

    var pointFragment = [
      'precision mediump float;',
      'varying vec4 v_color;',
      'void main(){',
      '  vec2 c = gl_PointCoord - vec2(0.5);',
      '  float dist = dot(c, c);',
      '  if(dist > 0.25){ discard; }',
      '  gl_FragColor = v_color;',
      '}'
    ].join('\n');

    var lineVertex = [
      'attribute vec2 a_position;',
      'attribute vec4 a_color;',
      'uniform vec2 u_resolution;',
      'varying vec4 v_color;',
      'void main(){',
      '  vec2 zeroToOne = a_position / u_resolution;',
      '  vec2 clip = zeroToOne * 2.0 - 1.0;',
      '  gl_Position = vec4(clip * vec2(1.0, -1.0), 0.0, 1.0);',
      '  v_color = a_color;',
      '}'
    ].join('\n');

    var lineFragment = [
      'precision mediump float;',
      'varying vec4 v_color;',
      'void main(){',
      '  gl_FragColor = v_color;',
      '}'
    ].join('\n');

    this.pointProgram = createProgram(this.gl, pointVertex, pointFragment);
    this.lineProgram = createProgram(this.gl, lineVertex, lineFragment);
  };

  WebGLQuarks.prototype.createBuffers = function () {
    var gl = this.gl;
    this.pointPositionBuffer = gl.createBuffer();
    this.pointColorBuffer = gl.createBuffer();
    this.pointSizeBuffer = gl.createBuffer();
    this.linePositionBuffer = gl.createBuffer();
    this.lineColorBuffer = gl.createBuffer();
  };

  WebGLQuarks.prototype.resize = function () {
    var width = this.canvas.clientWidth;
    var height = this.canvas.clientHeight;
    this.canvas.width = width * this.pixelRatio;
    this.canvas.height = height * this.pixelRatio;
    this.gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    this.createParticles();
  };

  WebGLQuarks.prototype.getObstacleRects = function () {
    var obstacles = document.querySelectorAll(this.obstacleSelector);
    var rects = [];
    if (!obstacles.length) {
      return rects;
    }
    var canvasRect = this.canvas.getBoundingClientRect();
    for (var i = 0; i < obstacles.length; i++) {
      var rect = obstacles[i].getBoundingClientRect();
      rects.push({
        left: (rect.left - canvasRect.left) * this.pixelRatio,
        right: (rect.right - canvasRect.left) * this.pixelRatio,
        top: (rect.top - canvasRect.top) * this.pixelRatio,
        bottom: (rect.bottom - canvasRect.top) * this.pixelRatio
      });
    }
    return rects;
  };

  WebGLQuarks.prototype.resolveObstacleCollision = function (p, rect) {
    var radius = p.radius * this.pixelRatio;
    var closestX = Math.max(rect.left, Math.min(p.x, rect.right));
    var closestY = Math.max(rect.top, Math.min(p.y, rect.bottom));
    var dx = p.x - closestX;
    var dy = p.y - closestY;
    if ((dx * dx + dy * dy) >= radius * radius) {
      return;
    }

    var distLeft = Math.abs(p.x - rect.left);
    var distRight = Math.abs(rect.right - p.x);
    var distTop = Math.abs(p.y - rect.top);
    var distBottom = Math.abs(rect.bottom - p.y);
    var minDist = Math.min(distLeft, distRight, distTop, distBottom);

    var nx = 0;
    var ny = 0;
    if (minDist === distLeft) {
      nx = -1;
      p.x = rect.left - radius;
    } else if (minDist === distRight) {
      nx = 1;
      p.x = rect.right + radius;
    } else if (minDist === distTop) {
      ny = -1;
      p.y = rect.top - radius;
    } else {
      ny = 1;
      p.y = rect.bottom + radius;
    }

    var dot = p.vx * nx + p.vy * ny;
    p.vx = p.vx - 2 * dot * nx;
    p.vy = p.vy - 2 * dot * ny;
  };

  WebGLQuarks.prototype.getParticleCount = function () {
    var base = this.config.particles.number.value;
    if (!this.config.particles.number.density.enable) {
      return base;
    }
    var area = (this.canvas.width * this.canvas.height) / 1000;
    if (this.pixelRatio > 1) {
      area = area / (this.pixelRatio * 2);
    }
    return Math.max(1, Math.round(area * base / this.config.particles.number.density.value_area));
  };

  WebGLQuarks.prototype.createParticles = function () {
    var count = this.getParticleCount();
    var sizeValue = this.config.particles.size.value;
    var sizeRandom = this.config.particles.size.random;
    var opacity = this.config.particles.opacity.value;
    var color = hexToRgb(this.config.particles.color.value);
    var evolve = this.config.particles.move.evolve;
    var predatorChance = evolve && evolve.enable ? (evolve.predator_chance || 0) : 0;
    var predatorColor = evolve && evolve.predator_color
      ? hexToRgb(evolve.predator_color)
      : { r: 255, g: 92, b: 138 };
    var predatorOpacity = evolve && evolve.predator_opacity != null
      ? evolve.predator_opacity
      : 0.85;
    var maxSize = evolve && evolve.max_size != null ? evolve.max_size : sizeValue * 4;
    this.particles = [];
    for (var i = 0; i < count; i++) {
      var radius = (sizeRandom ? Math.random() : 1) * sizeValue;
      radius = Math.min(radius, maxSize);
      var angle = Math.random() * Math.PI * 2;
      var isPredator = Math.random() < predatorChance;
      var p = {
        x: Math.random() * this.canvas.width,
        y: Math.random() * this.canvas.height,
        vx: Math.cos(angle),
        vy: Math.sin(angle),
        radius: isPredator ? Math.max(radius, sizeValue * 1.15) : radius,
        baseRadius: Math.max(0.8, sizeValue * (0.45 + Math.random() * 0.55)),
        color: isPredator ? predatorColor : color,
        opacity: isPredator ? predatorOpacity : opacity,
        wanderAngle: Math.random() * Math.PI * 2,
        role: isPredator ? 'predator' : 'prey',
        eatCooldown: 0
      };
      if (p.radius > maxSize) {
        p.radius = maxSize;
      }
      this.particles.push(p);
    }
  };

  WebGLQuarks.prototype.applyWander = function (p, wander) {
    if (!wander || !wander.enable) {
      return;
    }
    var rate = wander.rate != null ? wander.rate : 0.18;
    var strength = wander.strength != null ? wander.strength : 0.045;
    p.wanderAngle += (Math.random() * 2 - 1) * rate;
    p.vx += Math.cos(p.wanderAngle) * strength;
    p.vy += Math.sin(p.wanderAngle) * strength;
  };

  WebGLQuarks.prototype.applyBoids = function (p, index, boids) {
    if (!boids || !boids.enable) {
      return;
    }
    var perception = boids.distance != null ? boids.distance : 150;
    var sepDist = boids.separation_distance != null ? boids.separation_distance : 42;
    var sepWeight = boids.separation != null ? boids.separation : 0.09;
    var alignWeight = boids.alignment != null ? boids.alignment : 0.045;
    var cohWeight = boids.cohesion != null ? boids.cohesion : 0.03;

    var sepX = 0;
    var sepY = 0;
    var alignX = 0;
    var alignY = 0;
    var cohX = 0;
    var cohY = 0;
    var neighborCount = 0;
    var sepCount = 0;

    for (var j = 0; j < this.particles.length; j++) {
      if (j === index) {
        continue;
      }
      var other = this.particles[j];
      var dx = p.x - other.x;
      var dy = p.y - other.y;
      var distSq = dx * dx + dy * dy;
      if (distSq === 0 || distSq > perception * perception) {
        continue;
      }

      var dist = Math.sqrt(distSq);
      neighborCount += 1;
      alignX += other.vx;
      alignY += other.vy;
      cohX += other.x;
      cohY += other.y;

      if (dist < sepDist) {
        sepX += dx / dist;
        sepY += dy / dist;
        sepCount += 1;
      }
    }

    if (sepCount > 0) {
      sepX = (sepX / sepCount) * sepWeight;
      sepY = (sepY / sepCount) * sepWeight;
      p.vx += sepX;
      p.vy += sepY;
    }

    if (neighborCount > 0) {
      alignX = alignX / neighborCount - p.vx;
      alignY = alignY / neighborCount - p.vy;
      p.vx += alignX * alignWeight;
      p.vy += alignY * alignWeight;

      cohX = cohX / neighborCount - p.x;
      cohY = cohY / neighborCount - p.y;
      var cohLen = Math.sqrt(cohX * cohX + cohY * cohY);
      if (cohLen > 0) {
        p.vx += (cohX / cohLen) * cohWeight;
        p.vy += (cohY / cohLen) * cohWeight;
      }
    }
  };

  WebGLQuarks.prototype.getEvolveConfig = function () {
    return this.config.particles.move.evolve || null;
  };

  WebGLQuarks.prototype.promoteIfNeeded = function (p, evolve) {
    var threshold = evolve.predator_threshold != null ? evolve.predator_threshold : 5.5;
    if (p.role !== 'predator' && p.radius >= threshold) {
      p.role = 'predator';
      p.color = evolve.predator_color
        ? hexToRgb(evolve.predator_color)
        : { r: 255, g: 92, b: 138 };
      p.opacity = evolve.predator_opacity != null
        ? evolve.predator_opacity
        : 0.85;
    }
  };

  WebGLQuarks.prototype.canEat = function (hunter, prey, evolve, ignoreCooldown) {
    if (!hunter || !prey || hunter === prey) {
      return false;
    }
    if (!ignoreCooldown && hunter.eatCooldown > 0) {
      return false;
    }
    var advantage = evolve.size_advantage != null ? evolve.size_advantage : 1.12;
    if (hunter.radius < prey.radius * advantage) {
      return false;
    }
    if (prey.role === 'predator') {
      if (!evolve.predator_attack) {
        return false;
      }
      var attackAdv = evolve.predator_attack_advantage != null
        ? evolve.predator_attack_advantage
        : 1.18;
      if (hunter.role !== 'predator' || hunter.radius < prey.radius * attackAdv) {
        return false;
      }
    }
    return true;
  };

  WebGLQuarks.prototype.applyEvolveSteering = function (p, index, evolve) {
    if (!evolve || !evolve.enable) {
      return;
    }
    var sense = evolve.sense_distance != null ? evolve.sense_distance : 170;
    var chase = evolve.chase != null ? evolve.chase : 0.11;
    var flee = evolve.flee != null ? evolve.flee : 0.13;
    var bestTarget = null;
    var bestDist = Infinity;
    var fleeX = 0;
    var fleeY = 0;
    var fleeCount = 0;

    for (var j = 0; j < this.particles.length; j++) {
      if (j === index) {
        continue;
      }
      var other = this.particles[j];
      var dx = other.x - p.x;
      var dy = other.y - p.y;
      var distSq = dx * dx + dy * dy;
      if (distSq === 0 || distSq > sense * sense) {
        continue;
      }
      var dist = Math.sqrt(distSq);

      if (this.canEat(p, other, evolve, true)) {
        if (dist < bestDist) {
          bestDist = dist;
          bestTarget = other;
        }
      }

      if (p.role !== 'predator' && other.role === 'predator') {
        fleeX -= dx / dist;
        fleeY -= dy / dist;
        fleeCount += 1;
      } else if (
        p.role === 'predator' &&
        other.role === 'predator' &&
        evolve.predator_attack &&
        other.radius > p.radius
      ) {
        fleeX -= dx / dist;
        fleeY -= dy / dist;
        fleeCount += 1;
      }
    }

    if (bestTarget) {
      var tdx = bestTarget.x - p.x;
      var tdy = bestTarget.y - p.y;
      var tDist = Math.sqrt(tdx * tdx + tdy * tdy);
      if (tDist > 0) {
        p.vx += (tdx / tDist) * chase;
        p.vy += (tdy / tDist) * chase;
      }
    }

    if (fleeCount > 0) {
      p.vx += (fleeX / fleeCount) * flee;
      p.vy += (fleeY / fleeCount) * flee;
    }
  };

  WebGLQuarks.prototype.respawnParticle = function (p, evolve) {
    var sizeValue = this.config.particles.size.value;
    var opacity = this.config.particles.opacity.value;
    var color = hexToRgb(this.config.particles.color.value);
    var angle = Math.random() * Math.PI * 2;
    p.x = Math.random() * this.canvas.width;
    p.y = Math.random() * this.canvas.height;
    p.vx = Math.cos(angle);
    p.vy = Math.sin(angle);
    p.radius = p.baseRadius || sizeValue * (0.45 + Math.random() * 0.55);
    p.color = color;
    p.opacity = opacity;
    p.role = 'prey';
    p.eatCooldown = 0;
    p.wanderAngle = Math.random() * Math.PI * 2;
  };

  WebGLQuarks.prototype.resolveEvolve = function (evolve) {
    if (!evolve || !evolve.enable) {
      return;
    }
    var maxSize = evolve.max_size != null ? evolve.max_size : 14;
    var growth = evolve.growth_per_eat != null ? evolve.growth_per_eat : 0.55;
    var cooldown = evolve.eat_cooldown != null ? evolve.eat_cooldown : 10;
    var respawn = evolve.respawn !== false;
    var eaten = {};

    for (var i = 0; i < this.particles.length; i++) {
      var hunter = this.particles[i];
      if (hunter.eatCooldown > 0) {
        hunter.eatCooldown -= 1;
      }
      if (eaten[i]) {
        continue;
      }

      for (var j = 0; j < this.particles.length; j++) {
        if (i === j || eaten[j]) {
          continue;
        }
        var prey = this.particles[j];
        if (!this.canEat(hunter, prey, evolve)) {
          continue;
        }
        var dx = hunter.x - prey.x;
        var dy = hunter.y - prey.y;
        var reach = (hunter.radius + prey.radius) * this.pixelRatio;
        if (dx * dx + dy * dy > reach * reach) {
          continue;
        }

        hunter.radius = Math.min(maxSize, hunter.radius + growth * (0.65 + prey.radius * 0.12));
        hunter.eatCooldown = cooldown;
        this.promoteIfNeeded(hunter, evolve);

        if (respawn) {
          this.respawnParticle(prey, evolve);
        } else {
          eaten[j] = true;
        }
        break;
      }
    }

    if (!respawn) {
      this.particles = this.particles.filter(function (_p, idx) {
        return !eaten[idx];
      });
    }
  };

  WebGLQuarks.prototype.clampSpeed = function (p, move) {
    var maxSpeed = move.max_speed != null ? move.max_speed : 1.35;
    var minSpeed = move.min_speed != null ? move.min_speed : 0.35;
    var evolve = move.evolve;
    if (evolve && evolve.enable && p.role === 'predator') {
      maxSpeed *= 1.15;
    }
    var v = Math.sqrt(p.vx * p.vx + p.vy * p.vy);
    if (v > maxSpeed && v > 0) {
      p.vx = (p.vx / v) * maxSpeed;
      p.vy = (p.vy / v) * maxSpeed;
    } else if (v > 0 && v < minSpeed) {
      p.vx = (p.vx / v) * minSpeed;
      p.vy = (p.vy / v) * minSpeed;
    } else if (v === 0) {
      var angle = p.wanderAngle || Math.random() * Math.PI * 2;
      p.vx = Math.cos(angle) * minSpeed;
      p.vy = Math.sin(angle) * minSpeed;
    }
  };

  WebGLQuarks.prototype.bindEvents = function () {
    var self = this;
    window.addEventListener('resize', function () {
      self.resize();
    });
    window.addEventListener('mousemove', function (event) {
      var target = event.target;
      if (target && target.closest && target.closest('.card, img')) {
        self.mouse.active = false;
        return;
      }
      var rect = self.canvas.getBoundingClientRect();
      var inCanvas = event.clientX >= rect.left &&
        event.clientX <= rect.right &&
        event.clientY >= rect.top &&
        event.clientY <= rect.bottom;
      if (!inCanvas) {
        self.mouse.active = false;
        return;
      }
      self.mouse.x = (event.clientX - rect.left) * self.pixelRatio;
      self.mouse.y = (event.clientY - rect.top) * self.pixelRatio;
      self.mouse.active = true;
    });
    window.addEventListener('mouseleave', function () {
      self.mouse.active = false;
    });
  };

  WebGLQuarks.prototype.update = function () {
    var move = this.config.particles.move;
    var speed = move.speed / 2;
    var outMode = move.out_mode;
    var maxWidth = this.canvas.width;
    var maxHeight = this.canvas.height;
    var wander = move.wander;
    var boids = move.boids;
    var evolve = move.evolve;
    var attract = this.config.interactivity.modes.attract;

    var obstacleRects = this.getObstacleRects();
    for (var i = 0; i < this.particles.length; i++) {
      var p = this.particles[i];
      var attracted = false;

      if (move.enable) {
        this.applyWander(p, wander);
        this.applyBoids(p, i, boids);
        this.applyEvolveSteering(p, i, evolve);

        if (this.mouse.active && this.isAttractEnabled) {
          var dx = this.mouse.x - p.x;
          var dy = this.mouse.y - p.y;
          var dist = Math.sqrt(dx * dx + dy * dy);
          if (dist > 0 && dist <= attract.distance) {
            p.vx += (dx / dist) * attract.strength;
            p.vy += (dy / dist) * attract.strength;
            attracted = true;
          }
        }

        if (attracted && attract.max_speed && attract.max_speed > 0) {
          var av = Math.sqrt(p.vx * p.vx + p.vy * p.vy);
          if (av > attract.max_speed) {
            p.vx = (p.vx / av) * attract.max_speed;
            p.vy = (p.vy / av) * attract.max_speed;
          }
        } else {
          this.clampSpeed(p, move);
        }

        p.x += p.vx * speed;
        p.y += p.vy * speed;
      }

      if (outMode === 'bounce' || move.bounce) {
        if (p.x + p.radius > maxWidth || p.x - p.radius < 0) { p.vx = -p.vx; }
        if (p.y + p.radius > maxHeight || p.y - p.radius < 0) { p.vy = -p.vy; }
      } else {
        if (p.x > maxWidth) p.x = 0;
        else if (p.x < 0) p.x = maxWidth;
        if (p.y > maxHeight) p.y = 0;
        else if (p.y < 0) p.y = maxHeight;
      }

      for (var r = 0; r < obstacleRects.length; r++) {
        this.resolveObstacleCollision(p, obstacleRects[r]);
      }
    }

    this.resolveEvolve(evolve);
  };

  WebGLQuarks.prototype.addLineSegment = function (linePositions, lineColors, x1, y1, x2, y2, color, alpha) {
    linePositions.push(x1, y1, x2, y2);
    var r = color.r / 255;
    var g = color.g / 255;
    var b = color.b / 255;
    lineColors.push(r, g, b, alpha, r, g, b, alpha);
  };

  WebGLQuarks.prototype.addElectricDots = function (dotPositions, dotColors, dotSizes, p1, p2, color, alpha) {
    var electric = this.config.particles.line_linked.electric;
    var segments = Math.max(2, Math.round(electric.segments || 6));
    var jitter = electric.jitter || 10;
    var dx = p2.x - p1.x;
    var dy = p2.y - p1.y;
    var dist = Math.sqrt(dx * dx + dy * dy);
    if (dist === 0) {
      return;
    }
    var nx = -dy / dist;
    var ny = dx / dist;
    var dotSize = electric.dot_size || this.config.particles.size.value || 2;
    for (var s = 0; s <= segments; s++) {
      var t = s / segments;
      var offset = (Math.random() * 2 - 1) * jitter;
      var x = p1.x + dx * t + nx * offset;
      var y = p1.y + dy * t + ny * offset;
      dotPositions.push(x, y);
      dotColors.push(color.r / 255, color.g / 255, color.b / 255, alpha);
      dotSizes.push(dotSize * this.pixelRatio);
    }
  };

  WebGLQuarks.prototype.buildLines = function () {
    var linePositions = [];
    var lineColors = [];
    var dotPositions = [];
    var dotColors = [];
    var dotSizes = [];
    var lineCfg = this.config.particles.line_linked;
    var lineColor = hexToRgb(lineCfg.color);
    var grabCfg = this.config.interactivity.modes.grab;
    var grabOpacity = grabCfg.line_linked.opacity;
    var useElectric = lineCfg.electric && lineCfg.electric.enable;

    if (lineCfg.enable) {
      for (var i = 0; i < this.particles.length; i++) {
        for (var j = i + 1; j < this.particles.length; j++) {
          var p1 = this.particles[i];
          var p2 = this.particles[j];
          var dx = p1.x - p2.x;
          var dy = p1.y - p2.y;
          var dist = Math.sqrt(dx * dx + dy * dy);
          if (dist <= lineCfg.distance) {
            var opacity = lineCfg.opacity - (dist / (1 / lineCfg.opacity)) / lineCfg.distance;
            if (opacity > 0) {
              if (useElectric) {
                this.addElectricDots(dotPositions, dotColors, dotSizes, p1, p2, lineColor, opacity);
              } else {
                this.addLineSegment(linePositions, lineColors, p1.x, p1.y, p2.x, p2.y, lineColor, opacity);
              }
            }
          }
        }
      }
    }

    if (this.mouse.active && this.isGrabEnabled) {
      for (var k = 0; k < this.particles.length; k++) {
        var p = this.particles[k];
        var dxm = p.x - this.mouse.x;
        var dym = p.y - this.mouse.y;
        var distMouse = Math.sqrt(dxm * dxm + dym * dym);
        if (distMouse <= grabCfg.distance) {
          var opacityMouse = grabOpacity - (distMouse / (1 / grabOpacity)) / grabCfg.distance;
          if (opacityMouse > 0) {
            var cursorColor = { r: 255, g: 255, b: 255 };
            if (useElectric) {
              this.addElectricDots(
                dotPositions,
                dotColors,
                dotSizes,
                p,
                { x: this.mouse.x, y: this.mouse.y },
                cursorColor,
                opacityMouse
              );
            } else {
              this.addLineSegment(linePositions, lineColors, p.x, p.y, this.mouse.x, this.mouse.y, cursorColor, opacityMouse);
            }
          }
        }
      }
    }

    return {
      positions: new Float32Array(linePositions),
      colors: new Float32Array(lineColors),
      dotPositions: new Float32Array(dotPositions),
      dotColors: new Float32Array(dotColors),
      dotSizes: new Float32Array(dotSizes),
      count: linePositions.length / 2
    };
  };

  WebGLQuarks.prototype.buildPoints = function () {
    var positions = new Float32Array(this.particles.length * 2);
    var colors = new Float32Array(this.particles.length * 4);
    var sizes = new Float32Array(this.particles.length);
    for (var i = 0; i < this.particles.length; i++) {
      var p = this.particles[i];
      positions[i * 2] = p.x;
      positions[i * 2 + 1] = p.y;
      colors[i * 4] = p.color.r / 255;
      colors[i * 4 + 1] = p.color.g / 255;
      colors[i * 4 + 2] = p.color.b / 255;
      colors[i * 4 + 3] = p.opacity;
      sizes[i] = p.radius * 2 * this.pixelRatio;
    }
    return { positions: positions, colors: colors, sizes: sizes };
  };

  WebGLQuarks.prototype.drawLines = function (lines) {
    var gl = this.gl;
    gl.useProgram(this.lineProgram);
    var positionLoc = gl.getAttribLocation(this.lineProgram, 'a_position');
    var colorLoc = gl.getAttribLocation(this.lineProgram, 'a_color');
    var resolutionLoc = gl.getUniformLocation(this.lineProgram, 'u_resolution');

    gl.bindBuffer(gl.ARRAY_BUFFER, this.linePositionBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, lines.positions, gl.DYNAMIC_DRAW);
    gl.enableVertexAttribArray(positionLoc);
    gl.vertexAttribPointer(positionLoc, 2, gl.FLOAT, false, 0, 0);

    gl.bindBuffer(gl.ARRAY_BUFFER, this.lineColorBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, lines.colors, gl.DYNAMIC_DRAW);
    gl.enableVertexAttribArray(colorLoc);
    gl.vertexAttribPointer(colorLoc, 4, gl.FLOAT, false, 0, 0);

    gl.uniform2f(resolutionLoc, this.canvas.width, this.canvas.height);
    gl.lineWidth(this.config.particles.line_linked.width);
    gl.drawArrays(gl.LINES, 0, lines.count);
  };

  WebGLQuarks.prototype.drawPointBatch = function (points, count) {
    var gl = this.gl;
    gl.useProgram(this.pointProgram);
    var positionLoc = gl.getAttribLocation(this.pointProgram, 'a_position');
    var sizeLoc = gl.getAttribLocation(this.pointProgram, 'a_size');
    var colorLoc = gl.getAttribLocation(this.pointProgram, 'a_color');
    var resolutionLoc = gl.getUniformLocation(this.pointProgram, 'u_resolution');

    gl.bindBuffer(gl.ARRAY_BUFFER, this.pointPositionBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, points.positions, gl.DYNAMIC_DRAW);
    gl.enableVertexAttribArray(positionLoc);
    gl.vertexAttribPointer(positionLoc, 2, gl.FLOAT, false, 0, 0);

    gl.bindBuffer(gl.ARRAY_BUFFER, this.pointSizeBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, points.sizes, gl.DYNAMIC_DRAW);
    gl.enableVertexAttribArray(sizeLoc);
    gl.vertexAttribPointer(sizeLoc, 1, gl.FLOAT, false, 0, 0);

    gl.bindBuffer(gl.ARRAY_BUFFER, this.pointColorBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, points.colors, gl.DYNAMIC_DRAW);
    gl.enableVertexAttribArray(colorLoc);
    gl.vertexAttribPointer(colorLoc, 4, gl.FLOAT, false, 0, 0);

    gl.uniform2f(resolutionLoc, this.canvas.width, this.canvas.height);
    gl.drawArrays(gl.POINTS, 0, count);
  };

  WebGLQuarks.prototype.render = function () {
    var gl = this.gl;
    gl.clearColor(0, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

    this.update();

    var lines = this.buildLines();
    var points = this.buildPoints();

    if (lines.count > 0) {
      this.drawLines(lines);
    }
    if (lines.dotPositions.length > 0) {
      this.drawPointBatch(
        {
          positions: lines.dotPositions,
          colors: lines.dotColors,
          sizes: lines.dotSizes
        },
        lines.dotPositions.length / 2
      );
    }
    this.drawPointBatch(points, this.particles.length);

    requestAnimationFrame(this.render.bind(this));
  };

  function initQuarksWebGL(canvasId, config) {
    var canvas = document.getElementById(canvasId);
    if (!canvas) {
      console.error('Missing canvas with id: ' + canvasId);
      return null;
    }
    var engine = new WebGLQuarks(canvas, config);
    engine.init();
    return engine;
  }

  global.initQuarksWebGL = initQuarksWebGL;
})(typeof window !== 'undefined' ? window : this);
