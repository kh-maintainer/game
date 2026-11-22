'use strict';
// ---------------------------------------------------------------------------
// Canvas renderer: camera, terrain, land, buildings, items, particles,
// ghosts, co-op partner cursor and pings.
// ---------------------------------------------------------------------------

class Renderer {
  constructor(canvas, game) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.cam = { x: 0, y: 0, zoom: 3 };
    this.particles = [];
    this.pings = [];
    this.shake = 0;
    this.setGame(game);
    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  setGame(game) {
    this.game = game;
    this.terrain = renderTerrain(game);
    this.terrainSeed = game.seed;
    game.terrainDirty = false;
    this.centerOn(game.center());
  }

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

  burst(x, y, n, colors, speed = 2, life = 1) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, v = Math.random() * speed;
      this.particles.push({
        x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - speed * 0.3,
        life: life * (0.5 + Math.random() * 0.5), max: life,
        col: colors[(Math.random() * colors.length) | 0], size: Math.random() < 0.3 ? 2 : 1, grav: 1.5,
      });
    }
  }

  drawRot(img, x, y, dir, flip) {
    const ctx = this.ctx;
    if (!dir && !flip) { ctx.drawImage(img, x * TILE, y * TILE); return; }
    ctx.save();
    ctx.translate(x * TILE + TILE / 2, y * TILE + TILE / 2);
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
      case 'miner': return SPR.miner[b.working ? Math.floor(t * 10) % 2 : 0];
      case 'smelter':
      case 'foundry': return SPR[b.type][b.working ? 1 + (Math.floor(t * 6) % 2) : 0];
      case 'assembler': return SPR.assembler[b.working ? Math.floor(t * 4) % 2 : 0];
      case 'seller': return SPR.seller[b.flash > 0 ? 1 : 0];
      case 'splitter': return SPR.splitter[b.item ? 1 : 0];
      case 'sorter': return SPR.sorter[b.item ? 1 : 0];
      case 'chest': return SPR.chest[b.store && b.store.length ? 1 : 0];
      case 'launchpad': return SPR.launchpad[b.launchT ? Math.floor(t * 8) % 2 : 0];
    }
    return null;
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
  }

  draw(input, partner) {
    const { ctx, canvas, game } = this;
    if (game.terrainDirty || this.terrainSeed !== game.seed) {
      if (this.terrainSeed !== game.seed) { this.terrain = renderTerrain(game); this.terrainSeed = game.seed; }
      game.terrainDirty = false;
    }
    const t = performance.now() / 1000;
    const s = this.scale();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = '#0d0f0d';
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
    if (x1 <= x0 || y1 <= y0) return;

    // terrain
    ctx.drawImage(this.terrain, x0 * TILE, y0 * TILE, (x1 - x0) * TILE, (y1 - y0) * TILE,
      x0 * TILE, y0 * TILE, (x1 - x0) * TILE, (y1 - y0) * TILE);

    // gold ore twinkles
    if (this.cam.zoom >= 2) {
      for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
        if (game.ore[y * game.w + x] !== 'gold_ore') continue;
        const ph = (t * 1.3 + (x * 7 + y * 13) * 0.37) % 3;
        if (ph < 0.25) {
          ctx.fillStyle = '#fffbe0';
          const px = x * TILE + ((x * 5 + y * 3) % 12) + 2, py = y * TILE + ((x * 3 + y * 7) % 12) + 2;
          ctx.fillRect(px, py - 1, 1, 3);
          ctx.fillRect(px - 1, py, 3, 1);
        }
      }
    }

    // subtle grid when zoomed in
    if (this.cam.zoom >= 3 && input.showGrid !== false) {
      ctx.fillStyle = 'rgba(0,0,0,0.12)';
      for (let x = x0; x <= x1; x++) ctx.fillRect(x * TILE, y0 * TILE, 1 / s, (y1 - y0) * TILE);
      for (let y = y0; y <= y1; y++) ctx.fillRect(x0 * TILE, y * TILE, (x1 - x0) * TILE, 1 / s);
    }

    // unowned land: dim + border
    const c = game.center(), r = game.landRadius();
    const lx0 = (c.x - r) * TILE, ly0 = (c.y - r) * TILE, lx1 = (c.x + r + 1) * TILE, ly1 = (c.y + r + 1) * TILE;
    const W = game.w * TILE, H = game.h * TILE;
    ctx.fillStyle = 'rgba(5,6,10,0.62)';
    ctx.fillRect(0, 0, W, Math.max(0, ly0));
    ctx.fillRect(0, ly1, W, Math.max(0, H - ly1));
    ctx.fillRect(0, ly0, Math.max(0, lx0), ly1 - ly0);
    ctx.fillRect(lx1, ly0, Math.max(0, W - lx1), ly1 - ly0);
    ctx.strokeStyle = 'rgba(242,201,76,0.55)';
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 3]);
    ctx.lineDashOffset = -t * 6;
    ctx.strokeRect(lx0 - 0.5, ly0 - 0.5, lx1 - lx0 + 1, ly1 - ly0 + 1);
    ctx.setLineDash([]);
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 2;
    ctx.strokeRect(-1, -1, W + 2, H + 2);

    // buildings
    const visible = [];
    for (const b of game.buildings) {
      if (b.x < x0 || b.x >= x1 || b.y < y0 || b.y >= y1) continue;
      visible.push(b);
      if (b.type === 'belt') b._shape = this.beltShape(b);
      this.drawRot(this.frameFor(b, t), b.x, b.y, b.dir, b.type === 'belt' && b._shape === -1);
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
      ctx.drawImage(SPR.items[b.item], Math.round(b.x * TILE + 4 + px * TILE), Math.round(b.y * TILE + 4 + py * TILE));
    }

    // per-building overlays
    const zoomedIn = this.cam.zoom >= 2;
    for (const b of visible) {
      if (CRAFTERS[b.type] && zoomedIn) {
        if (b.t > 0) {
          ctx.fillStyle = '#0b0d10';
          ctx.fillRect(b.x * TILE + 2, b.y * TILE + 14, 12, 1);
          ctx.fillStyle = '#7be38f';
          ctx.fillRect(b.x * TILE + 2, b.y * TILE + 14, Math.round(12 * b.t), 1);
        }
        if (b.recipe && (b.type !== 'smelter' || this.cam.zoom >= 4) && this.cam.zoom >= 3) {
          ctx.globalAlpha = 0.9;
          ctx.drawImage(SPR.items[k0(RECIPES[b.recipe].out)], b.x * TILE + 9, b.y * TILE - 2, 8, 8);
          ctx.globalAlpha = 1;
        }
        if (b.working && Math.random() < (b.type === 'assembler' ? 0 : 0.04)) {
          this.particles.push({ x: b.x + 0.75, y: b.y + 0.1, vx: (Math.random() - 0.5) * 0.3, vy: -0.6, life: 1.6, max: 1.6, col: '#8a8a90', size: 2, grav: 0, smoke: true });
        }
      } else if (b.type === 'sorter' && b.filter) {
        ctx.drawImage(SPR.items[b.filter], b.x * TILE + 4, b.y * TILE + 4);
      } else if (b.type === 'chest' && zoomedIn && b.store) {
        const f = b.store.length / CHEST_CAP;
        ctx.fillStyle = '#0b0d10';
        ctx.fillRect(b.x * TILE + 2, b.y * TILE + 14, 12, 1);
        ctx.fillStyle = f >= 1 ? '#ff5a4a' : '#f2c94c';
        ctx.fillRect(b.x * TILE + 2, b.y * TILE + 14, Math.round(12 * f), 1);
      } else if (b.type === 'tunnel' && b.mode === 'in' && !game.tunnelPartner(b)) {
        if (Math.floor(t * 2) % 2) { ctx.fillStyle = '#ff5a4a'; ctx.fillRect(b.x * TILE + 7, b.y * TILE + 1, 2, 2); }
      } else if (b.type === 'seller' && b.flash > 0 && Math.random() < 0.3) {
        this.burst(b.x + 0.5, b.y + 0.3, 1, ['#f2c94c', '#fff1b8'], 1.2, 0.6);
      }
    }

    // rockets (drawn last so they overlap tiles above)
    for (const b of game.buildings) {
      if (b.type !== 'launchpad') continue;
      if (b.x < x0 - 1 || b.x > x1 || b.y < y0 - 2 || b.y > y1 + 2) continue;
      const lt = b.launchT || 0;
      const lift = lt > 1 ? Math.pow(lt - 1, 2.2) * 40 : 0;
      const jitter = lt > 0 && lt < 1.2 ? (Math.random() - 0.5) * 1.5 : 0;
      const rx = b.x * TILE + 2 + jitter, ry = b.y * TILE + 16 - 30 - lift;
      if (lt > 0) {
        for (let i = 0; i < 3; i++) {
          this.particles.push({ x: (rx + 4 + Math.random() * 4) / TILE, y: (ry + 26) / TILE, vx: (Math.random() - 0.5) * 1.5, vy: 1 + Math.random() * 2, life: 0.6, max: 0.6, col: ['#ff8a2a', '#ffd36b', '#ff5a4a', '#ffffff'][(Math.random() * 4) | 0], size: 2, grav: 0 });
        }
        if (lt < 1.5) this.shake = 0.3;
      }
      ctx.drawImage(SPR.rocket, Math.round(rx), Math.round(ry));
      // progress
      if (!lt) {
        const f = (b.count || 0) / LAUNCH_REQ;
        ctx.fillStyle = '#0b0d10';
        ctx.fillRect(b.x * TILE - 2, b.y * TILE + 17, 20, 2);
        ctx.fillStyle = '#7fe0ff';
        ctx.fillRect(b.x * TILE - 2, b.y * TILE + 17, Math.round(20 * f), 2);
      }
    }

    // particles
    for (const p of this.particles) {
      ctx.globalAlpha = Math.max(0, Math.min(1, p.life / p.max)) * (p.smoke ? 0.45 : 1);
      ctx.fillStyle = p.col;
      const sz = p.smoke ? p.size + (1 - p.life / p.max) * 3 : p.size;
      ctx.fillRect(Math.round(p.x * TILE - sz / 2), Math.round(p.y * TILE - sz / 2), sz, sz);
    }
    ctx.globalAlpha = 1;

    // selection highlight
    const sel = input.selected && game.at(input.selected.x, input.selected.y);
    if (sel) {
      ctx.strokeStyle = '#f2c94c';
      ctx.lineWidth = 1;
      ctx.strokeRect(sel.x * TILE + 0.5, sel.y * TILE + 0.5, TILE - 1, TILE - 1);
      if (sel.type === 'tunnel') this.drawTunnelRange(sel.x, sel.y, sel.dir);
    }

    // partner cursor
    if (partner && partner.cursor) this.drawCursor(partner.cursor, partner.color, true);

    // hover / ghost
    const h = input.hover;
    if (h && game.inBounds(h.x, h.y)) {
      if (input.tool) {
        this.drawCursor({ x: h.x, y: h.y, tool: input.tool, rot: input.rot }, null, false);
        if (input.tool === 'tunnel') this.drawTunnelRange(h.x, h.y, input.rot);
      } else if (input.deleting) {
        ctx.fillStyle = 'rgba(255,70,60,0.35)';
        ctx.fillRect(h.x * TILE, h.y * TILE, TILE, TILE);
      } else {
        ctx.strokeStyle = 'rgba(255,255,255,0.5)';
        ctx.lineWidth = 1;
        ctx.strokeRect(h.x * TILE + 0.5, h.y * TILE + 0.5, TILE - 1, TILE - 1);
      }
    }

    // pings
    for (const p of this.pings) {
      const k = (p.t % 1);
      ctx.strokeStyle = p.color;
      ctx.globalAlpha = Math.max(0, 1 - p.t / 3) * (1 - k);
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(p.x * TILE + 8, p.y * TILE + 8, 4 + k * 18, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = Math.max(0, 1 - p.t / 3);
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.moveTo(p.x * TILE + 8, p.y * TILE + 8);
      ctx.lineTo(p.x * TILE + 4, p.y * TILE - 2 - Math.abs(Math.sin(p.t * 5)) * 3);
      ctx.lineTo(p.x * TILE + 12, p.y * TILE - 2 - Math.abs(Math.sin(p.t * 5)) * 3);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    // ---- screen-space text ----
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    const fs = Math.max(10, Math.round(5 * s));
    ctx.font = `600 ${fs}px "Pixelify Sans", monospace`;
    ctx.textAlign = 'center';
    for (const f of game.floaters) {
      const sx = ox + f.x * TILE * s, sy = oy + f.y * TILE * s;
      ctx.globalAlpha = Math.min(1, f.life * 1.5);
      ctx.fillStyle = '#0b0d10';
      ctx.fillText(f.text, sx + this.dpr, sy + this.dpr);
      ctx.fillStyle = '#f2c94c';
      ctx.fillText(f.text, sx, sy);
    }
    ctx.globalAlpha = 1;
    if (partner && partner.cursor) {
      const pc = partner.cursor;
      const sx = ox + (pc.x + 0.5) * TILE * s, sy = oy + (pc.y + 1) * TILE * s + 14 * this.dpr;
      ctx.font = `600 ${Math.round(12 * this.dpr)}px "Pixelify Sans", monospace`;
      const w = ctx.measureText(partner.name).width + 10 * this.dpr;
      ctx.fillStyle = 'rgba(11,13,16,0.85)';
      ctx.fillRect(sx - w / 2, sy - 12 * this.dpr, w, 16 * this.dpr);
      ctx.fillStyle = partner.color;
      ctx.fillText(partner.name, sx, sy);
    }
  }

  drawCursor(cur, color, isPartner) {
    const { ctx, game } = this;
    if (!game.inBounds(cur.x, cur.y)) return;
    if (cur.tool && BUILDINGS[cur.tool]) {
      const err = isPartner ? null : game.placeError(cur.tool, cur.x, cur.y);
      ctx.globalAlpha = isPartner ? 0.4 : 0.55;
      this.drawRot(SPR.icons[cur.tool], cur.x, cur.y, BUILDINGS[cur.tool].dir ? cur.rot : 0);
      ctx.globalAlpha = 1;
      ctx.strokeStyle = color || (err ? '#ff5a4a' : '#7be38f');
      ctx.lineWidth = 1;
      ctx.strokeRect(cur.x * TILE + 0.5, cur.y * TILE + 0.5, TILE - 1, TILE - 1);
      if (BUILDINGS[cur.tool].dir) this.drawArrow(cur.x, cur.y, cur.rot, color || (err ? '#ff5a4a' : '#ffffff'));
    } else {
      ctx.strokeStyle = color;
      ctx.lineWidth = 1;
      ctx.strokeRect(cur.x * TILE + 0.5, cur.y * TILE + 0.5, TILE - 1, TILE - 1);
      ctx.strokeRect(cur.x * TILE - 1.5, cur.y * TILE - 1.5, TILE + 3, TILE + 3);
    }
  }

  drawTunnelRange(x, y, dir) {
    const ctx = this.ctx, d = DIRS[dir];
    ctx.fillStyle = 'rgba(127,224,255,0.12)';
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
