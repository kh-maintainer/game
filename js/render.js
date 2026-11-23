'use strict';
// ---------------------------------------------------------------------------
// Canvas renderer: camera, terrain, nature, buildings, items, particles,
// weather & wildlife, day/night lighting, ghosts, co-op cursor and pings.
// ---------------------------------------------------------------------------

const DAY_LENGTH = 480; // seconds for a full day/night cycle (shared clock, so co-op players match)

// 0 = full day, 1 = full night. Also returns the warm "golden hour" amount.
function dayState() {
  const ph = ((Date.now() / 1000) % DAY_LENGTH) / DAY_LENGTH;
  const ramp = (a, b, x) => Math.min(1, Math.max(0, (x - a) / (b - a)));
  let night, golden = 0;
  if (ph < 0.58) night = 0;
  else if (ph < 0.68) { night = ramp(0.58, 0.68, ph); golden = Math.sin(Math.PI * night); }
  else if (ph < 0.9) night = 1;
  else { night = 1 - ramp(0.9, 1, ph); golden = Math.sin(Math.PI * night) * 0.6; }
  return { ph, night, golden };
}

const easeOutBack = (x) => { const c1 = 1.9, c3 = c1 + 1; return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2); };

const LIGHTS = {
  smelter:   { r: 3.2, col: '255,150,70', need: 'working', at: [0.5, 0.65], glow: 0.35 },
  arcfurnace:{ r: 3.4, col: '115,200,255', need: 'working', at: [0.5, 0.65], glow: 0.35 },
  generator: { r: 2.6, col: '255,150,70', need: 'working', at: [0.3, 0.7], glow: 0.3 },
  deepdrill: { r: 1.8, col: '255,180,140', at: [0.25, 0.15], glow: 0.15 },
  fabricator:{ r: 1.8, col: '201,160,255', at: [0.75, 0.25], glow: 0.18 },
  foundry:   { r: 3.6, col: '255,110,60', need: 'working', at: [0.5, 0.55], glow: 0.4 },
  miner:     { r: 1.6, col: '255,220,140', at: [0.25, 0.15], glow: 0.15 },
  seller:    { r: 2.6, col: '255,210,140', at: [0.5, 0.5], glow: 0.18 },
  assembler: { r: 1.6, col: '115,239,247', at: [0.75, 0.25], glow: 0.15 },
  launchpad: { r: 4.5, col: '230,240,255', at: [0.5, 0.5], glow: 0.2 },
  tunnel:    { r: 1.1, col: '167,240,112', at: [0.5, 0.15], glow: 0.1 },
};

class Renderer {
  constructor(canvas, game) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.light = document.createElement('canvas');
    this.lctx = this.light.getContext('2d');
    this.cam = { x: 0, y: 0, zoom: 4 };
    this.particles = [];
    this.pings = [];
    this.critters = [];
    this.birds = [];
    this.clouds = [];
    this.born = new Map();
    this.actors = null;
    this.shake = 0;
    this.cleanT = 0;
    this.setGame(game);
    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  setGame(game) {
    this.game = game;
    this.terrain = renderTerrain(game);
    this.terrainSeed = game.seed;
    game.terrainDirty = false;
    this.born.clear();
    for (const b of game.buildings) this.born.set(this.key(b), 0);
    this.clouds = [];
    const rng = mulberry32(game.seed);
    for (let i = 0; i < 9; i++) {
      this.clouds.push({ x: rng() * game.w, y: rng() * game.h, s: (rng() * SPR.clouds.length) | 0, scale: 2 + (rng() * 2 | 0) });
    }
    this.centerOn(game.center());
    this.actors = null;
  }

  key(b) { return b.x + ',' + b.y + ',' + b.type; }

  centerOn(p) {
    this.cam.x = p.x + 0.5;
    this.cam.y = p.y + 0.5;
  }

  resize() {
    this.dpr = window.devicePixelRatio || 1;
    this.canvas.width = Math.floor(window.innerWidth * this.dpr);
    this.canvas.height = Math.floor(window.innerHeight * this.dpr);
    this.canvas.style.width = window.innerWidth + 'px';
    this.canvas.style.height = window.innerHeight + 'px';
    this.light.width = this.canvas.width;
    this.light.height = this.canvas.height;
  }

  scale() { return Math.max(1, Math.round(this.cam.zoom * this.dpr)); }

  // screen-space (CSS px) -> tile coords (float)
  screenToTile(sx, sy) {
    const s = this.scale() / this.dpr;
    return {
      x: (sx - window.innerWidth / 2) / (s * TILE) + this.cam.x,
      y: (sy - window.innerHeight / 2) / (s * TILE) + this.cam.y,
    };
  }

  clampCamera() {
    this.cam.x = Math.max(0, Math.min(this.game.w, this.cam.x));
    this.cam.y = Math.max(0, Math.min(this.game.h, this.cam.y));
  }

  addPing(x, y, color) {
    this.pings.push({ x, y, color, t: 0 });
  }

  burst(x, y, n, colors, speed = 2, life = 1, grav = 1.5) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, v = Math.random() * speed;
      this.particles.push({
        x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - speed * 0.3,
        life: life * (0.5 + Math.random() * 0.5), max: life,
        col: colors[(Math.random() * colors.length) | 0], size: Math.random() < 0.3 ? 2 : 1, grav,
      });
    }
  }

  dust(x, y) {
    this.burst(x + 0.5, y + 0.8, 10, ['#c9a26b', '#e4c590', '#f4f4f4', '#94b0c2'], 2.2, 0.6, 2);
  }

  drawRot(img, x, y, dir, flip, scale = 1) {
    const ctx = this.ctx;
    if (!dir && !flip && scale === 1) { ctx.drawImage(img, x * TILE, y * TILE); return; }
    ctx.save();
    ctx.translate(x * TILE + TILE / 2, y * TILE + TILE / 2);
    if (scale !== 1) { ctx.translate(0, TILE / 2); ctx.scale(scale, scale); ctx.translate(0, -TILE / 2); }
    ctx.rotate((dir * Math.PI) / 2);
    if (flip) ctx.scale(1, -1);
    ctx.drawImage(img, -TILE / 2, -TILE / 2);
    ctx.restore();
  }

  // Does building n (if any) push items in direction `dir`?
  feeds(n, dir) {
    if (!n || n.dir !== dir) return false;
    return !!FRONT_OUTPUT[n.type] || (n.type === 'tunnel' && n.mode === 'out');
  }

  // 0 = straight, 1 = curve from right side, -1 = curve from left side
  beltShape(b) {
    const g = this.game, d = DIRS[b.dir];
    if (this.feeds(g.at(b.x - d.x, b.y - d.y), b.dir)) return 0;
    const rd = (b.dir + 1) % 4, ld = (b.dir + 3) % 4;
    const right = this.feeds(g.at(b.x + DIRS[rd].x, b.y + DIRS[rd].y), opp(rd));
    const left = this.feeds(g.at(b.x + DIRS[ld].x, b.y + DIRS[ld].y), opp(ld));
    if (right && !left) return 1;
    if (left && !right) return -1;
    return 0;
  }

  frameFor(b, t) {
    const bf = Math.floor(t * Math.min(this.game.beltSpeed(), 12) * 8) % 8;
    switch (b.type) {
      case 'belt': return b._shape ? SPR.beltCurve[bf] : SPR.belt[bf];
      case 'tunnel': return b.mode === 'in' ? SPR.tunnel[bf] : SPR.tunnelOut[bf];
      case 'miner':
      case 'deepdrill': return SPR[b.type][b.working ? Math.floor(t * (b.type === 'deepdrill' ? 14 : 9)) % 4 : 0];
      case 'smelter':
      case 'foundry':
      case 'arcfurnace': return SPR[b.type][b.working ? 1 + (Math.floor(t * 6) % 2) : 0];
      case 'assembler':
      case 'fabricator': return SPR[b.type][b.working ? Math.floor(t * (b.type === 'fabricator' ? 10 : 5)) % 4 : 0];
      case 'seller': return SPR.seller[b.flash > 0 ? 1 : 0];
      case 'splitter': return SPR.splitter[b.item ? 1 : 0];
      case 'sorter': return SPR.sorter[b.item ? 1 : 0];
      case 'chest': return SPR.chest[b.store && b.store.length ? 1 : 0];
      case 'generator': return SPR.generator[b.working ? 1 + (Math.floor(t * 8) % 2) : 0];
      case 'solar': return SPR.solar[Math.floor(t * 0.7 + b.x) % 5 === 0 ? 1 : 0];
      case 'launchpad': return SPR.launchpad[b.launchT ? Math.floor(t * 8) % 2 : Math.floor(t) % 2];
    }
    return null;
  }

  // --------------------------- ambient life ---------------------------------
  updateAmbient(dt, view, night) {
    const g = this.game;
    const area = (view.x1 - view.x0) * (view.y1 - view.y0);
    const wantButterflies = night > 0.5 ? 0 : Math.min(14, Math.round(area / 260));
    const wantFireflies = night > 0.5 ? Math.min(40, Math.round(area / 90)) : 0;
    const count = (k) => this.critters.reduce((n, c) => n + (c.kind === k ? 1 : 0), 0);
    const spawnSpot = () => {
      for (let tries = 0; tries < 6; tries++) {
        const x = view.x0 + Math.random() * (view.x1 - view.x0), y = view.y0 + Math.random() * (view.y1 - view.y0);
        if (!g.inBounds(x | 0, y | 0) || g.isWater(x | 0, y | 0) || g.at(x | 0, y | 0)) continue;
        return { x, y };
      }
      return null;
    };
    if (count('fly') < wantButterflies && Math.random() < 0.2) {
      const p = spawnSpot();
      if (p) this.critters.push({ kind: 'fly', ...p, vx: 0, vy: 0, t: Math.random() * 10, life: 8 + Math.random() * 10, col: ['#ffcd75', '#f4f4f4', '#73eff7', '#f59a7a', '#e8a0ff'][(Math.random() * 5) | 0] });
    }
    if (count('firefly') < wantFireflies && Math.random() < 0.4) {
      const p = spawnSpot();
      if (p) this.critters.push({ kind: 'firefly', ...p, vx: 0, vy: 0, t: Math.random() * 10, life: 6 + Math.random() * 8 });
    }
    for (let i = this.critters.length - 1; i >= 0; i--) {
      const c = this.critters[i];
      c.t += dt;
      c.life -= dt;
      const sp = c.kind === 'fly' ? 1.2 : 0.4;
      c.vx += (Math.random() - 0.5) * sp * dt * 6;
      c.vy += (Math.random() - 0.5) * sp * dt * 6;
      c.vx *= 0.96; c.vy *= 0.96;
      c.x += c.vx * dt; c.y += c.vy * dt;
      const offView = c.x < view.x0 - 4 || c.x > view.x1 + 4 || c.y < view.y0 - 4 || c.y > view.y1 + 4;
      if (c.life <= 0 || offView || (c.kind === 'fly' && night > 0.6) || (c.kind === 'firefly' && night < 0.3)) this.critters.splice(i, 1);
    }

    // birds
    if (night < 0.5 && this.birds.length === 0 && Math.random() < dt * 0.06) {
      const fromLeft = Math.random() < 0.5;
      const y = view.y0 + Math.random() * (view.y1 - view.y0);
      const x = fromLeft ? view.x0 - 3 : view.x1 + 3;
      const n = 3 + ((Math.random() * 4) | 0);
      const v = (fromLeft ? 1 : -1) * (4 + Math.random() * 2);
      for (let i = 0; i < n; i++) {
        this.birds.push({ x: x - Math.sign(v) * (i % 2 ? i : i * 0.7), y: y + (i % 2 ? 1 : -1) * i * 0.6, vx: v, vy: (Math.random() - 0.5) * 0.4, t: Math.random() * 2 });
      }
    }
    for (let i = this.birds.length - 1; i >= 0; i--) {
      const b = this.birds[i];
      b.x += b.vx * dt; b.y += b.vy * dt; b.t += dt;
      if (b.x < view.x0 - 12 || b.x > view.x1 + 12) this.birds.splice(i, 1);
    }

    // clouds drift with the wind and wrap around the map
    for (const c of this.clouds) {
      c.x += dt * 0.35;
      c.y += dt * 0.08;
      if (c.x > g.w + 8) c.x = -14;
      if (c.y > g.h + 6) c.y = -8;
    }
  }

  update(dt) {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life -= dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += p.grav * dt;
      if (p.life <= 0) this.particles.splice(i, 1);
    }
    for (let i = this.pings.length - 1; i >= 0; i--) {
      this.pings[i].t += dt;
      if (this.pings[i].t > 3) this.pings.splice(i, 1);
    }
    this.shake = Math.max(0, this.shake - dt);
    if (this.view) this.updateAmbient(dt, this.view, this.nightLevel || 0);
    if (this.actors) this.updateActors(dt);
    this.cleanT += dt;
    if (this.cleanT > 2) {
      this.cleanT = 0;
      for (const k of this.born.keys()) {
        const [x, y, type] = k.split(',');
        const b = this.game.at(+x, +y);
        if (!b || b.type !== type) this.born.delete(k);
      }
    }
  }

  // -------------------------------- draw ------------------------------------
  draw(input, partner) {
    const { ctx, canvas, game } = this;
    if (this.terrainSeed !== game.seed) this.setGame(game);
    game.terrainDirty = false;
    const now = performance.now();
    const t = now / 1000;
    const s = this.scale();
    const day = input.dayNight === false ? { night: 0, golden: 0 } : dayState();
    this.nightLevel = day.night;
    this.lastInput = input;
    this.lastPartner = partner;
    if (!this.actors) this.initActors();

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = '#1d2a55';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const sh = this.shake > 0 ? (Math.random() - 0.5) * this.shake * 6 * s : 0;
    const ox = Math.round(canvas.width / 2 - this.cam.x * TILE * s + sh);
    const oy = Math.round(canvas.height / 2 - this.cam.y * TILE * s + sh);
    ctx.setTransform(s, 0, 0, s, ox, oy);

    // visible tile range
    const x0 = Math.max(0, Math.floor(-ox / s / TILE) - 1);
    const y0 = Math.max(0, Math.floor(-oy / s / TILE) - 2);
    const x1 = Math.min(game.w, Math.ceil((canvas.width - ox) / s / TILE) + 1);
    const y1 = Math.min(game.h, Math.ceil((canvas.height - oy) / s / TILE) + 2);
    this.view = { x0, y0, x1, y1 };
    const W = game.w * TILE, H = game.h * TILE;

    // ocean sparkles around the island
    ctx.fillStyle = '#2b3f7a';
    for (let i = 0; i < 40; i++) {
      const wx = ((i * 97.3 + t * 3) % (W + 400)) - 200, wy = ((i * 53.7) % (H + 400)) - 200;
      if (wx < 0 || wx > W || wy < 0 || wy > H) ctx.fillRect(Math.round(wx), Math.round(wy), 4, 1);
    }
    if (x1 <= x0 || y1 <= y0) return;

    // terrain
    ctx.drawImage(this.terrain, x0 * TILE, y0 * TILE, (x1 - x0) * TILE, (y1 - y0) * TILE,
      x0 * TILE, y0 * TILE, (x1 - x0) * TILE, (y1 - y0) * TILE);
    // island beach
    ctx.strokeStyle = '#e4c590';
    ctx.lineWidth = 3;
    ctx.strokeRect(-1.5, -1.5, W + 3, H + 3);
    ctx.strokeStyle = 'rgba(115,239,247,0.6)';
    ctx.lineWidth = 1;
    const foam = Math.sin(t * 1.5) * 0.8;
    ctx.strokeRect(-3.5 - foam, -3.5 - foam, W + 7 + foam * 2, H + 7 + foam * 2);

    // animated water + gold glints
    for (let y = y0; y < y1; y++) {
      for (let x = x0; x < x1; x++) {
        const i = y * game.w + x;
        if (game.water[i]) {
          const h = (x * 7919 + y * 104729) % 97;
          const wx = x * TILE + ((h + Math.floor(t * 3)) % 14);
          const wy = y * TILE + 3 + (h % 10);
          ctx.fillStyle = 'rgba(115,239,247,0.55)';
          ctx.fillRect(wx, wy, 3, 1);
          if (((t * 0.8 + h * 0.13) % 3) < 0.15) { ctx.fillStyle = '#f4f4f4'; ctx.fillRect(x * TILE + (h % 12) + 2, y * TILE + ((h * 3) % 12) + 2, 2, 1); }
        } else if (game.ore[i] === 'gold_ore' && this.cam.zoom >= 2) {
          const ph = (t * 1.3 + (x * 7 + y * 13) * 0.37) % 3;
          if (ph < 0.25) {
            ctx.fillStyle = '#fff6c8';
            const px = x * TILE + ((x * 5 + y * 3) % 12) + 2, py = y * TILE + ((x * 3 + y * 7) % 12) + 2;
            ctx.fillRect(px, py - 1, 1, 3);
            ctx.fillRect(px - 1, py, 3, 1);
          }
        }
      }
    }

    // subtle grid when zoomed in
    if (this.cam.zoom >= 3 && input.showGrid !== false) {
      ctx.fillStyle = 'rgba(20,30,20,0.10)';
      for (let x = x0; x <= x1; x++) ctx.fillRect(x * TILE, y0 * TILE, 1 / s, (y1 - y0) * TILE);
      for (let y = y0; y <= y1; y++) ctx.fillRect(x0 * TILE, y * TILE, (x1 - x0) * TILE, 1 / s);
    }

    // small ground decor (rocks, bushes) — flat, so drawn before buildings
    for (let y = y0; y < y1; y++) {
      for (let x = x0; x < x1; x++) {
        const d = game.decorAt(x, y);
        if (d === 3) { this.groundShadow(x, y, 5); ctx.drawImage(SPR.bush, x * TILE, y * TILE); }
        else if (d === 4) { this.groundShadow(x, y, 5); ctx.drawImage(SPR.rock, x * TILE, y * TILE); }
      }
    }

    // building shadows
    ctx.fillStyle = 'rgba(16,20,40,0.28)';
    const visible = [];
    for (const b of game.buildings) {
      if (b.x < x0 || b.x >= x1 || b.y < y0 || b.y >= y1) continue;
      visible.push(b);
      if (b.type !== 'belt' && b.type !== 'tunnel') ctx.fillRect(b.x * TILE + 2, b.y * TILE + 3, 15, 14);
    }

    // buildings (with a springy pop when they first appear)
    for (const b of visible) {
      const k = this.key(b);
      let born = this.born.get(k);
      if (born === undefined) { born = now; this.born.set(k, now); this.dust(b.x, b.y); }
      const age = (now - born) / 280;
      const sc = born && age < 1 ? 0.5 + 0.5 * easeOutBack(age) : 1;
      if (b.type === 'belt') b._shape = this.beltShape(b);
      this.drawRot(this.frameFor(b, t), b.x, b.y, b.dir, b.type === 'belt' && b._shape === -1, sc);
    }

    // items riding on belts / sitting in splitters & sorters
    for (const b of visible) {
      if (!b.item) continue;
      let px, py;
      if (b.type === 'belt') {
        const din = DIRS[b.from !== undefined ? b.from : b.dir], dout = DIRS[b.dir];
        const p = Math.min(1, b.p);
        if (p < 0.5) { const k = p * 2 - 1; px = din.x * k * 0.5; py = din.y * k * 0.5; }
        else { const k = (p - 0.5) * 2; px = dout.x * k * 0.5; py = dout.y * k * 0.5; }
      } else { px = 0; py = 0; }
      const ix = Math.round(b.x * TILE + 4 + px * TILE), iy = Math.round(b.y * TILE + 4 + py * TILE);
      ctx.fillStyle = 'rgba(10,12,30,0.35)';
      ctx.fillRect(ix + 1, iy + 7, 6, 1);
      ctx.drawImage(SPR.items[b.item], ix, iy - 1);
    }

    // power warnings over machines that are short on electricity
    const pr = game.power ? game.power.ratio : 1;
    if (pr < 0.999 && Math.floor(t * 2.5) % 2) {
      for (const b of visible) if (POWER_USE[b.type]) ctx.drawImage(pr < 0.35 ? SPR.noPower : SPR.lowPower, b.x * TILE + 1, b.y * TILE - 4);
    }

    // per-building overlays & emitters
    const zoomedIn = this.cam.zoom >= 2;
    for (const b of visible) {
      if (CRAFTERS[b.type]) {
        if (b.t > 0 && zoomedIn) {
          ctx.fillStyle = '#1a1c2c';
          ctx.fillRect(b.x * TILE + 2, b.y * TILE + 15, 12, 1);
          ctx.fillStyle = '#a7f070';
          ctx.fillRect(b.x * TILE + 2, b.y * TILE + 15, Math.round(12 * b.t), 1);
        }
        if (b.recipe && (familyOf(b.type) !== 'smelter' || this.cam.zoom >= 4) && this.cam.zoom >= 3) {
          const bob = Math.round(Math.sin(t * 3 + b.x) * 0.6);
          ctx.fillStyle = 'rgba(26,28,44,0.75)';
          ctx.fillRect(b.x * TILE + 9, b.y * TILE - 3 + bob, 8, 8);
          ctx.drawImage(SPR.items[k0(RECIPES[b.recipe].out)], b.x * TILE + 9, b.y * TILE - 3 + bob, 8, 8);
        }
        if (b.working) {
          if (b.type === 'smelter' && Math.random() < 0.06) this.smoke(b.x + 0.75, b.y + 0.05, '#c2c2cc');
          if (b.type === 'arcfurnace' && Math.random() < 0.08) this.burst(b.x + 0.5, b.y + 0.55, 2, ['#73eff7', '#f4f4f4', '#41a6f6'], 1.6, 0.3, 0);
          if (b.type === 'fabricator' && Math.random() < 0.06) this.burst(b.x + 0.55, b.y + 0.5, 2, ['#c9a0ff', '#f4f4f4'], 1.4, 0.3, 0);
          if (b.type === 'foundry' && Math.random() < 0.05) this.smoke(b.x + 0.8, b.y + 0.1, '#f4f4f4');
          if (b.type === 'foundry' && Math.random() < 0.04) this.burst(b.x + 0.5, b.y + 0.5, 2, ['#ffcd75', '#ef7d57'], 1.6, 0.5, 3);
          if (b.type === 'assembler' && Math.random() < 0.03) this.burst(b.x + 0.55, b.y + 0.5, 2, ['#73eff7', '#f4f4f4'], 1.2, 0.3, 0);
        }
      } else if (familyOf(b.type) === 'miner' && b.working && Math.random() < (b.type === 'deepdrill' ? 0.06 : 0.025)) {
        const ore = game.oreAt(b.x, b.y);
        this.burst(b.x + 0.5, b.y + 0.8, 2, ore ? ORE_COLORS[ore] : ['#9a6a44'], 1.3, 0.5, 3);
      } else if (b.type === 'generator' && b.working && Math.random() < 0.07) {
        this.smoke(b.x + 0.3, b.y + 0.05, '#7a7a88');
      } else if (b.type === 'sorter' && b.filter) {
        ctx.drawImage(SPR.items[b.filter], b.x * TILE + 4, b.y * TILE + 4);
      } else if (b.type === 'chest' && zoomedIn && b.store) {
        const f = b.store.length / CHEST_CAP;
        ctx.fillStyle = '#1a1c2c';
        ctx.fillRect(b.x * TILE + 2, b.y * TILE + 15, 12, 1);
        ctx.fillStyle = f >= 1 ? '#b13e53' : '#ffcd75';
        ctx.fillRect(b.x * TILE + 2, b.y * TILE + 15, Math.round(12 * f), 1);
      } else if (b.type === 'tunnel' && b.mode === 'in' && !game.tunnelPartner(b)) {
        if (Math.floor(t * 2) % 2) { ctx.fillStyle = '#b13e53'; ctx.fillRect(b.x * TILE + 13, b.y * TILE + 1, 2, 1); }
      } else if (b.type === 'seller' && b.flash > 0 && Math.random() < 0.35) {
        this.burst(b.x + 0.5, b.y + 0.3, 1, ['#ffcd75', '#fff6c8'], 1.4, 0.7);
      }
    }

    // trees — tall, drawn after buildings row by row so canopies overlap nicely
    for (let y = y0; y < Math.min(game.h, y1 + 1); y++) {
      for (let x = x0; x < x1; x++) {
        const d = game.decorAt(x, y);
        if (d !== 1 && d !== 2) continue;
        const tr = SPR.trees[d];
        // natural jitter so forests don't look like an orchard grid
        const jx = ((x * 31 + y * 17) % 5) - 2, jy = ((x * 13 + y * 29) % 3) - 1;
        ctx.save();
        ctx.translate(jx, jy);
        this.groundShadow(x, y, 7);
        const sway = Math.round(Math.sin(t * 1.4 + x * 0.7 + y * 0.45) * 0.7);
        ctx.drawImage(tr.trunk, x * TILE, y * TILE - 7);
        ctx.drawImage(tr.canopy, x * TILE + sway, y * TILE - 7);
        ctx.restore();
      }
    }

    this.drawCharacters(input, partner);

    // rockets (overlap the tiles above their pad)
    for (const b of game.buildings) {
      if (b.type !== 'launchpad') continue;
      if (b.x < x0 - 1 || b.x > x1 || b.y < y0 - 2 || b.y > y1 + 2) continue;
      const lt = b.launchT || 0;
      const lift = lt > 1 ? Math.pow(lt - 1, 2.2) * 40 : 0;
      const jitter = lt > 0 && lt < 1.2 ? (Math.random() - 0.5) * 1.5 : 0;
      const rx = b.x * TILE + 2 + jitter, ry = b.y * TILE + 16 - 30 - lift;
      if (lt > 0) {
        for (let i = 0; i < 4; i++) {
          this.particles.push({ x: (rx + 4 + Math.random() * 4) / TILE, y: (ry + 26) / TILE, vx: (Math.random() - 0.5) * 1.5, vy: 1 + Math.random() * 2, life: 0.7, max: 0.7, col: ['#ef7d57', '#ffcd75', '#b13e53', '#f4f4f4'][(Math.random() * 4) | 0], size: 2, grav: 0 });
        }
        if (Math.random() < 0.5) this.smoke(b.x + 0.5 + (Math.random() - 0.5), b.y + 0.9, '#94b0c2');
        if (lt < 1.5) this.shake = 0.3;
      }
      ctx.drawImage(SPR.rocket, Math.round(rx), Math.round(ry));
      if (!lt) {
        const f = (b.count || 0) / game.launchReq();
        ctx.fillStyle = '#1a1c2c';
        ctx.fillRect(b.x * TILE - 2, b.y * TILE + 17, 20, 2);
        ctx.fillStyle = '#73eff7';
        ctx.fillRect(b.x * TILE - 2, b.y * TILE + 17, Math.round(20 * f), 2);
      }
    }

    // particles
    for (const p of this.particles) {
      ctx.globalAlpha = Math.max(0, Math.min(1, p.life / p.max)) * (p.smoke ? 0.5 : 1);
      ctx.fillStyle = p.col;
      const sz = p.smoke ? p.size + (1 - p.life / p.max) * 4 : p.size;
      ctx.fillRect(Math.round(p.x * TILE - sz / 2), Math.round(p.y * TILE - sz / 2), sz, sz);
    }
    ctx.globalAlpha = 1;

    // butterflies (day)
    for (const c of this.critters) {
      if (c.kind !== 'fly') continue;
      const flap = Math.floor(c.t * 10) % 2;
      const px = Math.round(c.x * TILE), py = Math.round(c.y * TILE - 6 + Math.sin(c.t * 4) * 2);
      ctx.fillStyle = 'rgba(16,20,40,0.2)';
      ctx.fillRect(px, Math.round(c.y * TILE), 2, 1);
      ctx.fillStyle = c.col;
      if (flap) { ctx.fillRect(px - 1, py, 1, 1); ctx.fillRect(px + 1, py, 1, 1); }
      else { ctx.fillRect(px - 1, py - 1, 1, 1); ctx.fillRect(px + 1, py - 1, 1, 1); }
      ctx.fillStyle = '#1a1c2c';
      ctx.fillRect(px, py, 1, 1);
    }

    // cloud shadows drifting over everything
    ctx.globalAlpha = 0.09;
    for (const c of this.clouds) {
      const img = SPR.clouds[c.s];
      const w = img.width * c.scale / TILE, h = img.height * c.scale / TILE;
      if (c.x + w < x0 || c.x > x1 || c.y + h < y0 || c.y > y1) continue;
      ctx.drawImage(img, Math.round(c.x * TILE), Math.round(c.y * TILE), img.width * c.scale, img.height * c.scale);
    }
    ctx.globalAlpha = 1;

    // ---------------------- lighting (screen space) ---------------------------
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    const toScreen = (wx, wy) => [ox + wx * TILE * s, oy + wy * TILE * s];
    if (day.golden > 0.01) {
      ctx.fillStyle = `rgba(239,125,87,${0.13 * day.golden})`;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
    if (day.night > 0.01) {
      const L = this.lctx;
      const dark = 0.62 * day.night;
      L.globalCompositeOperation = 'source-over';
      L.clearRect(0, 0, canvas.width, canvas.height);
      L.fillStyle = `rgba(14,16,48,${dark})`;
      L.fillRect(0, 0, canvas.width, canvas.height);
      L.globalCompositeOperation = 'destination-out';
      const glows = [];
      const flick = 0.92 + Math.sin(t * 13) * 0.04 + Math.sin(t * 7.3) * 0.04;
      for (const b of visible) {
        const li = LIGHTS[b.type];
        if (!li || (li.need && !b[li.need])) continue;
        const [sx, sy] = toScreen(b.x + li.at[0], b.y + li.at[1]);
        const r = li.r * TILE * s * (li.need ? flick : 1);
        const gr = L.createRadialGradient(sx, sy, 0, sx, sy, r);
        gr.addColorStop(0, 'rgba(0,0,0,1)');
        gr.addColorStop(0.5, 'rgba(0,0,0,0.6)');
        gr.addColorStop(1, 'rgba(0,0,0,0)');
        L.fillStyle = gr;
        L.fillRect(sx - r, sy - r, r * 2, r * 2);
        glows.push([sx, sy, r, li]);
      }
      // the players carry lanterns
      if (this.actors) {
        const holders = [this.actors.me];
        if (partner && this.actors.partner.seen) holders.push(this.actors.partner);
        for (const a of holders) {
          const [sx, sy] = toScreen(a.x, a.y - 0.4);
          const r = 2.4 * TILE * s * flick;
          const gr = L.createRadialGradient(sx, sy, 0, sx, sy, r);
          gr.addColorStop(0, 'rgba(0,0,0,1)'); gr.addColorStop(0.5, 'rgba(0,0,0,0.55)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
          L.fillStyle = gr; L.fillRect(sx - r, sy - r, r * 2, r * 2);
          glows.push([sx, sy, r, { col: '255,205,117', glow: 0.18 }]);
        }
      }
      // fireflies punch tiny holes too
      for (const c of this.critters) {
        if (c.kind !== 'firefly') continue;
        const [sx, sy] = toScreen(c.x, c.y);
        const r = 0.6 * TILE * s;
        const gr = L.createRadialGradient(sx, sy, 0, sx, sy, r);
        gr.addColorStop(0, `rgba(0,0,0,${0.6 * (0.5 + 0.5 * Math.sin(c.t * 3))})`);
        gr.addColorStop(1, 'rgba(0,0,0,0)');
        L.fillStyle = gr;
        L.fillRect(sx - r, sy - r, r * 2, r * 2);
      }
      ctx.drawImage(this.light, 0, 0);
      // warm additive glow
      ctx.globalCompositeOperation = 'lighter';
      for (const [sx, sy, r, li] of glows) {
        const gr = ctx.createRadialGradient(sx, sy, 0, sx, sy, r * 0.8);
        gr.addColorStop(0, `rgba(${li.col},${li.glow * day.night})`);
        gr.addColorStop(1, `rgba(${li.col},0)`);
        ctx.fillStyle = gr;
        ctx.fillRect(sx - r, sy - r, r * 2, r * 2);
      }
      ctx.globalCompositeOperation = 'source-over';
      // fireflies
      for (const c of this.critters) {
        if (c.kind !== 'firefly') continue;
        const [sx, sy] = toScreen(c.x, c.y);
        const a = 0.5 + 0.5 * Math.sin(c.t * 3);
        ctx.globalAlpha = a * day.night;
        ctx.fillStyle = '#e8ff9a';
        ctx.fillRect(Math.round(sx), Math.round(sy), Math.max(2, s / 2), Math.max(2, s / 2));
      }
      ctx.globalAlpha = 1;
    }

    // birds fly above the lighting layer
    ctx.setTransform(s, 0, 0, s, ox, oy);
    for (const b of this.birds) {
      const flap = Math.floor(b.t * 6) % 2;
      const px = Math.round(b.x * TILE), py = Math.round(b.y * TILE);
      ctx.fillStyle = 'rgba(16,20,40,0.18)';
      ctx.fillRect(px + 18, py + 40, 4, 1);
      ctx.fillStyle = day.night > 0.5 ? '#94b0c2' : '#1a1c2c';
      ctx.fillRect(px, py, 1, 1);
      if (flap) { ctx.fillRect(px - 2, py - 1, 2, 1); ctx.fillRect(px + 1, py - 1, 2, 1); }
      else { ctx.fillRect(px - 2, py + 1, 2, 1); ctx.fillRect(px + 1, py + 1, 2, 1); ctx.fillRect(px - 1, py, 1, 1); ctx.fillRect(px + 1, py, 1, 1); }
    }

    // unowned land: dim + animated border
    const c = game.center(), r = game.landRadius();
    const lx0 = (c.x - r) * TILE, ly0 = (c.y - r) * TILE, lx1 = (c.x + r + 1) * TILE, ly1 = (c.y + r + 1) * TILE;
    ctx.fillStyle = 'rgba(20,22,40,0.5)';
    ctx.fillRect(0, 0, W, Math.max(0, ly0));
    ctx.fillRect(0, ly1, W, Math.max(0, H - ly1));
    ctx.fillRect(0, ly0, Math.max(0, lx0), ly1 - ly0);
    ctx.fillRect(lx1, ly0, Math.max(0, W - lx1), ly1 - ly0);
    if (r < Math.max(game.w, game.h) / 2) {
      ctx.strokeStyle = 'rgba(255,205,117,0.7)';
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 3]);
      ctx.lineDashOffset = -t * 6;
      ctx.strokeRect(lx0 - 0.5, ly0 - 0.5, lx1 - lx0 + 1, ly1 - ly0 + 1);
      ctx.setLineDash([]);
    }

    // selection: pulsing corner brackets
    const sel = input.selected && game.at(input.selected.x, input.selected.y);
    if (sel) {
      this.brackets(sel.x, sel.y, '#ffcd75', 1 + Math.round((Math.sin(t * 6) + 1) * 0.75));
      if (sel.type === 'tunnel') this.drawTunnelRange(sel.x, sel.y, sel.dir);
    }

    // partner cursor
    if (partner && partner.cursor) this.drawCursor(partner.cursor, partner.color, true);

    // build-range ring around your character while a tool is selected
    if (input.tool && this.actors) {
      const a = this.actors.me;
      ctx.strokeStyle = 'rgba(244,244,244,0.35)';
      ctx.lineWidth = 1;
      ctx.setLineDash([3, 3]);
      ctx.lineDashOffset = -t * 4;
      ctx.beginPath();
      ctx.arc(a.x * TILE, (a.y - 0.4) * TILE, BUILD_RANGE * TILE, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // hover / ghost
    const h = input.hover;
    if (h && game.inBounds(h.x, h.y)) {
      if (input.tool) {
        this.drawCursor({ x: h.x, y: h.y, tool: input.tool, rot: input.rot }, null, false);
        if (input.tool === 'tunnel') this.drawTunnelRange(h.x, h.y, input.rot);
      } else if (input.deleting) {
        ctx.fillStyle = 'rgba(177,62,83,0.45)';
        ctx.fillRect(h.x * TILE, h.y * TILE, TILE, TILE);
      } else {
        this.brackets(h.x, h.y, 'rgba(244,244,244,0.75)', 0);
      }
    }

    // pings
    for (const p of this.pings) {
      const k = p.t % 1;
      ctx.strokeStyle = p.color;
      ctx.globalAlpha = Math.max(0, 1 - p.t / 3) * (1 - k);
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(p.x * TILE + 8, p.y * TILE + 8, 4 + k * 18, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = Math.max(0, 1 - p.t / 3);
      ctx.fillStyle = p.color;
      const bounce = Math.abs(Math.sin(p.t * 5)) * 3;
      ctx.beginPath();
      ctx.moveTo(p.x * TILE + 8, p.y * TILE + 6 - bounce);
      ctx.lineTo(p.x * TILE + 4, p.y * TILE - 2 - bounce);
      ctx.lineTo(p.x * TILE + 12, p.y * TILE - 2 - bounce);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    // ---------------------------- screen text ---------------------------------
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    const fs = Math.max(11, Math.round(5 * s));
    ctx.font = `600 ${fs}px "Pixelify Sans", monospace`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    for (const f of game.floaters) {
      const sx = ox + f.x * TILE * s, sy = oy + f.y * TILE * s;
      const age = 1.2 - f.life;
      const pop = age < 0.15 ? 0.6 + (age / 0.15) * 0.5 : age < 0.25 ? 1.1 - (age - 0.15) : 1;
      const tw = ctx.measureText(f.text).width;
      const cs = Math.round(fs * 0.9);
      const total = (cs + 4 + tw) * pop;
      ctx.globalAlpha = Math.min(1, f.life * 1.6);
      ctx.save();
      ctx.translate(sx - total / 2, sy);
      ctx.scale(pop, pop);
      ctx.drawImage(SPR.coin, 0, -cs / 2, cs, cs);
      ctx.fillStyle = '#1a1c2c';
      for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1], [1, 1]]) ctx.fillText(f.text, cs + 4 + dx * this.dpr, dy * this.dpr);
      ctx.fillStyle = '#ffcd75';
      ctx.fillText(f.text, cs + 4, 0);
      ctx.restore();
    }
    ctx.globalAlpha = 1;
    ctx.textBaseline = 'alphabetic';
    ctx.textAlign = 'center';
    // name tags above the characters
    const tag = (a, name, color) => {
      const sx = ox + a.x * TILE * s, sy = oy + (a.y - 1.05) * TILE * s;
      ctx.font = `600 ${Math.round(12 * this.dpr)}px "Pixelify Sans", monospace`;
      const w = ctx.measureText(name).width + 12 * this.dpr;
      ctx.fillStyle = '#1a1c2c';
      ctx.fillRect(sx - w / 2, sy - 12 * this.dpr, w, 17 * this.dpr);
      ctx.fillStyle = color;
      ctx.fillRect(sx - w / 2, sy - 12 * this.dpr, w, 2 * this.dpr);
      ctx.fillText(name, sx, sy + 1 * this.dpr);
    };
    if (partner && this.actors.partner.seen) tag(this.actors.partner, partner.name, partner.color);
    if (partner) tag(this.actors.me, input.myName || 'You', input.myColor || '#ffcd75');
    // BOLT's speech bubble
    const bolt = this.actors.bolt;
    if (bolt.say && bolt.sayT > 0) {
      ctx.font = `600 ${Math.round(12 * this.dpr)}px "Pixelify Sans", monospace`;
      const sx = ox + bolt.x * TILE * s, sy = oy + (bolt.y - 0.9) * TILE * s;
      const w = ctx.measureText(bolt.say).width + 14 * this.dpr, h = 20 * this.dpr;
      ctx.globalAlpha = Math.min(1, bolt.sayT * 2);
      ctx.fillStyle = '#1a1c2c';
      ctx.fillRect(sx - w / 2 - 2 * this.dpr, sy - h - 2 * this.dpr, w + 4 * this.dpr, h + 4 * this.dpr);
      ctx.fillStyle = '#f4f4f4';
      ctx.fillRect(sx - w / 2, sy - h, w, h);
      ctx.fillRect(sx - 3 * this.dpr, sy, 6 * this.dpr, 3 * this.dpr);
      ctx.fillStyle = '#1a1c2c';
      ctx.fillText(bolt.say, sx, sy - 6 * this.dpr);
      ctx.globalAlpha = 1;
    }
  }

  // ------------------------------ characters --------------------------------
  initActors() {
    const c = this.game.center();
    const mk = (x, y) => ({ x, y, tx: x, ty: y, facing: 0, walk: 0, moving: false, hammer: 0, flip: false, seen: false });
    this.actors = {
      me: mk(c.x + 0.5, c.y + 2),
      partner: mk(c.x + 1.5, c.y + 2),
      bolt: { x: c.x - 0.5, y: c.y + 1.5, t: 0, say: '', sayT: 0, quipT: 25 },
    };
  }

  moveActor(a, dt) {
    const dx = a.tx - a.x, dy = a.ty - a.y, d = Math.hypot(dx, dy);
    const speed = Math.min(10, 2.5 + d * 2.2); // hurry when far, stroll when close
    if (d > 0.08) {
      const step = Math.min(d, speed * dt);
      a.x += (dx / d) * step;
      a.y += (dy / d) * step;
      a.moving = true;
      a.walk += dt * (6 + speed);
      if (Math.abs(dx) > Math.abs(dy)) { a.facing = 2; a.flip = dx < 0; } else a.facing = dy < 0 ? 1 : 0;
    } else a.moving = false;
    a.hammer = Math.max(0, a.hammer - dt);
  }

  // Can the character stand here? (map bounds + no water)
  walkable(x, y) {
    const tx = Math.floor(x), ty = Math.floor(y - 0.2);
    return this.game.inBounds(tx, ty) && !this.game.isWater(tx, ty);
  }

  // Is tile (x, y) within building reach of your character?
  inReach(x, y) {
    if (!this.actors) return true;
    const a = this.actors.me;
    return Math.hypot(x + 0.5 - a.x, y + 0.5 - (a.y - 0.4)) <= BUILD_RANGE;
  }

  // Your character: driven by WASD; conveyors carry you when you stand still.
  stepMe(a, dt) {
    const mv = this.move || { dx: 0, dy: 0, sprint: false };
    let vx = mv.dx, vy = mv.dy;
    const len = Math.hypot(vx, vy);
    let speed = 0;
    if (len > 0) {
      speed = WALK_SPEED * (mv.sprint ? 1.7 : 1);
      vx = (vx / len) * speed; vy = (vy / len) * speed;
      if (Math.abs(vx) > Math.abs(vy) + 0.01) { a.facing = 2; a.flip = vx < 0; } else a.facing = vy < 0 ? 1 : 0;
    } else {
      // ride the conveyor you're standing on
      const b = this.game.at(Math.floor(a.x), Math.floor(a.y - 0.2));
      if (b && b.type === 'belt') {
        const bs = Math.min(8, this.game.beltSpeed()), d = DIRS[b.dir];
        vx = d.x * bs + (d.x ? 0 : (Math.floor(a.x) + 0.5 - a.x) * 4);
        vy = d.y * bs + (d.y ? 0 : (Math.floor(a.y - 0.2) + 0.7 - a.y) * 4);
      }
    }
    // move each axis separately so you slide along shorelines
    const nx = a.x + vx * dt, ny = a.y + vy * dt;
    if (this.walkable(nx, a.y)) a.x = nx;
    if (this.walkable(a.x, ny)) a.y = ny;
    a.moving = len > 0;
    if (a.moving) a.walk += dt * (4 + speed * 1.2);
    a.hammer = Math.max(0, a.hammer - dt);
  }

  updateActors(dt) {
    const A = this.actors, partner = this.lastPartner;
    this.stepMe(A.me, dt);
    if (partner && partner.cursor && partner.cursor.ax !== undefined) {
      const pc = partner.cursor;
      if (!A.partner.seen) { A.partner.x = pc.ax; A.partner.y = pc.ay; A.partner.seen = true; }
      A.partner.tx = pc.ax;
      A.partner.ty = pc.ay;
      this.moveActor(A.partner, dt);
      if (!pc.mv && Math.hypot(A.partner.tx - A.partner.x, A.partner.ty - A.partner.y) < 0.3) A.partner.moving = false;
      A.partner.facing = pc.f ?? A.partner.facing;
      A.partner.flip = !!pc.fl;
    }
    // the camera is locked to your character (except on the title screen)
    if (!this.freeCam) {
      const k = Math.min(1, dt * 9);
      this.cam.x += (A.me.x - this.cam.x) * k;
      this.cam.y += (A.me.y - 0.5 - this.cam.y) * k;
    }
    // BOLT hovers at your shoulder, lagging behind a little
    const b = A.bolt;
    b.t += dt;
    const fx = A.me.x + (A.me.flip ? 0.9 : -0.9), fy = A.me.y - 0.9;
    b.x += (fx - b.x) * Math.min(1, dt * 2.5);
    b.y += (fy - b.y) * Math.min(1, dt * 2.5);
    b.sayT = Math.max(0, b.sayT - dt);
    b.quipT -= dt;
    if (b.quipT <= 0 && this.boltQuip) {
      b.quipT = 35 + Math.random() * 40;
      this.say(this.boltQuip());
    }
  }

  say(text) {
    if (!text) return;
    this.actors.bolt.say = text;
    this.actors.bolt.sayT = 4;
  }

  avatarAction(who, x, y) {
    const a = this.actors[who];
    if (!a) return;
    a.hammer = 0.3;
    this.burst(x + 0.5, y + 0.6, 4, ['#ffcd75', '#f4f4f4'], 1.8, 0.35, 3);
  }

  drawActor(a, sheet) {
    const ctx = this.ctx;
    const frame = a.hammer > 0 ? 2 : a.moving ? (Math.floor(a.walk) % 2) : 0;
    const facing = a.hammer > 0 ? 0 : a.facing;
    const img = sheet[facing][frame];
    const px = Math.round(a.x * TILE), py = Math.round(a.y * TILE);
    ctx.fillStyle = 'rgba(16,20,40,0.3)';
    ctx.fillRect(px - 4, py, 8, 2);
    ctx.fillRect(px - 3, py + 2, 6, 1);
    const bob = a.moving && Math.floor(a.walk) % 2 ? -1 : 0;
    if (a.flip && facing === 2) {
      ctx.save();
      ctx.translate(px, 0);
      ctx.scale(-1, 1);
      ctx.drawImage(img, -8, py - 15 + bob);
      ctx.restore();
    } else ctx.drawImage(img, px - 8, py - 15 + bob);
  }

  drawCharacters(input, partner) {
    const ctx = this.ctx, A = this.actors, t = performance.now() / 1000;
    const g = this.game, c = g.center();
    // Marlo minds the starting Market
    const m = g.at(c.x, c.y);
    if (m && m.type === 'seller') {
      // stand on a free tile next to the stall (prefer front-right)
      const spots = [[1, 1], [-1, 1], [1, -1], [-1, -1], [0, 1], [1, 0], [-1, 0], [0, -1]];
      const sp = spots.find(([dx, dy]) => !g.at(c.x + dx, c.y + dy) && !g.isWater(c.x + dx, c.y + dy)) || [1, 1];
      const mx = (c.x + sp[0] + 0.5) * TILE, my = (c.y + sp[1] + 0.85) * TILE;
      ctx.fillStyle = 'rgba(16,20,40,0.3)';
      ctx.fillRect(Math.round(mx) - 4, Math.round(my), 8, 2);
      ctx.drawImage(SPR.marlo[m.flash > 0 || Math.floor(t * 0.5) % 7 === 0 ? 1 : 0], Math.round(mx) - 8, Math.round(my) - 15);
    }
    const mine = input.myRole === 'guest' ? SPR.avatar.guest : SPR.avatar.host;
    const theirs = input.myRole === 'guest' ? SPR.avatar.host : SPR.avatar.guest;
    if (partner && A.partner.seen) this.drawActor(A.partner, theirs);
    this.drawActor(A.me, mine);
    // BOLT
    const b = A.bolt;
    const by = b.y + Math.sin(b.t * 3) * 0.12;
    ctx.fillStyle = 'rgba(16,20,40,0.22)';
    ctx.fillRect(Math.round(b.x * TILE) - 3, Math.round((b.y + 0.9) * TILE), 6, 1);
    ctx.drawImage(SPR.bolt[Math.floor(t * 10) % 2], Math.round(b.x * TILE) - 6, Math.round(by * TILE) - 7);
  }

  groundShadow(x, y, hw) {
    const ctx = this.ctx;
    ctx.fillStyle = 'rgba(16,30,20,0.3)';
    ctx.fillRect(x * TILE + 8 - hw, y * TILE + 13, hw * 2, 2);
    ctx.fillRect(x * TILE + 9 - hw, y * TILE + 15, hw * 2 - 2, 1);
  }

  smoke(x, y, col) {
    this.particles.push({ x, y, vx: 0.15 + (Math.random() - 0.5) * 0.3, vy: -0.7, life: 1.8, max: 1.8, col, size: 2, grav: 0, smoke: true });
  }

  brackets(x, y, col, out) {
    const ctx = this.ctx;
    const x0 = x * TILE - out, y0 = y * TILE - out, sz = TILE + out * 2, L = 4;
    ctx.fillStyle = col;
    for (const [cx, cy, dx, dy] of [[x0, y0, 1, 1], [x0 + sz, y0, -1, 1], [x0, y0 + sz, 1, -1], [x0 + sz, y0 + sz, -1, -1]]) {
      ctx.fillRect(dx > 0 ? cx : cx - L, dy > 0 ? cy : cy - 1, L, 1);
      ctx.fillRect(dx > 0 ? cx : cx - 1, dy > 0 ? cy : cy - L, 1, L);
    }
  }

  drawCursor(cur, color, isPartner) {
    const { ctx, game } = this;
    if (!game.inBounds(cur.x, cur.y)) return;
    if (cur.tool && BUILDINGS[cur.tool]) {
      const err = isPartner ? null : (!this.inReach(cur.x, cur.y) ? 'far' : game.placeError(cur.tool, cur.x, cur.y));
      ctx.globalAlpha = isPartner ? 0.4 : 0.6;
      this.drawRot(SPR.icons[cur.tool], cur.x, cur.y, BUILDINGS[cur.tool].dir ? cur.rot : 0);
      ctx.globalAlpha = 1;
      if (err && !isPartner) {
        ctx.fillStyle = 'rgba(177,62,83,0.35)';
        ctx.fillRect(cur.x * TILE, cur.y * TILE, TILE, TILE);
      }
      this.brackets(cur.x, cur.y, color || (err ? '#b13e53' : '#a7f070'), 0);
      if (BUILDINGS[cur.tool].dir) this.drawArrow(cur.x, cur.y, cur.rot, color || (err ? '#b13e53' : '#f4f4f4'));
    } else {
      this.brackets(cur.x, cur.y, color, 1);
    }
  }

  drawTunnelRange(x, y, dir) {
    const ctx = this.ctx, d = DIRS[dir];
    ctx.fillStyle = 'rgba(115,239,247,0.14)';
    for (let k = 1; k <= TUNNEL_RANGE; k++) ctx.fillRect((x + d.x * k) * TILE, (y + d.y * k) * TILE, TILE, TILE);
  }

  drawArrow(x, y, dir, col) {
    const ctx = this.ctx;
    const d = DIRS[dir];
    const cx = x * TILE + 8 + d.x * 11, cy = y * TILE + 8 + d.y * 11;
    ctx.fillStyle = col;
    ctx.beginPath();
    const px = -d.y, py = d.x;
    ctx.moveTo(cx + d.x * 3, cy + d.y * 3);
    ctx.lineTo(cx + px * 3, cy + py * 3);
    ctx.lineTo(cx - px * 3, cy - py * 3);
    ctx.closePath();
    ctx.fill();
  }
}
