'use strict';
// ---------------------------------------------------------------------------
// Canvas renderer: camera, terrain, buildings, items on belts, ghosts, FX.
// ---------------------------------------------------------------------------

class Renderer {
  constructor(canvas, game) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.cam = { x: 0, y: 0, zoom: 3 };
    this.setGame(game);
    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  setGame(game) {
    this.game = game;
    this.terrain = renderTerrain(game);
    const c = game.center();
    this.cam.x = c.x + 0.5;
    this.cam.y = c.y + 0.5;
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

  tileToScreen(tx, ty) {
    const s = this.scale() / this.dpr;
    return {
      x: (tx - this.cam.x) * s * TILE + window.innerWidth / 2,
      y: (ty - this.cam.y) * s * TILE + window.innerHeight / 2,
    };
  }

  clampCamera() {
    this.cam.x = Math.max(0, Math.min(this.game.w, this.cam.x));
    this.cam.y = Math.max(0, Math.min(this.game.h, this.cam.y));
  }

  drawRot(img, x, y, dir) {
    const ctx = this.ctx;
    if (!dir) { ctx.drawImage(img, x * TILE, y * TILE); return; }
    ctx.save();
    ctx.translate(x * TILE + TILE / 2, y * TILE + TILE / 2);
    ctx.rotate((dir * Math.PI) / 2);
    ctx.drawImage(img, -TILE / 2, -TILE / 2);
    ctx.restore();
  }

  frameFor(b, t) {
    switch (b.type) {
      case 'belt': return SPR.belt[Math.floor(t * this.game.beltSpeed() * 8) % 8];
      case 'miner': return SPR.miner[b.working ? Math.floor(t * 10) % 2 : 0];
      case 'smelter':
      case 'foundry': return SPR[b.type][b.working ? 1 + (Math.floor(t * 6) % 2) : 0];
      case 'assembler': return SPR.assembler[b.working ? Math.floor(t * 4) % 2 : 0];
      case 'seller': return SPR.seller[b.flash > 0 ? 1 : 0];
      case 'splitter': return SPR.splitter[b.item ? 1 : 0];
    }
    return null;
  }

  draw(input) {
    const { ctx, canvas, game } = this;
    const t = performance.now() / 1000;
    const s = this.scale();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = '#121512';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const ox = Math.round(canvas.width / 2 - this.cam.x * TILE * s);
    const oy = Math.round(canvas.height / 2 - this.cam.y * TILE * s);
    ctx.setTransform(s, 0, 0, s, ox, oy);

    // visible tile range
    const x0 = Math.max(0, Math.floor(-ox / s / TILE) - 1);
    const y0 = Math.max(0, Math.floor(-oy / s / TILE) - 1);
    const x1 = Math.min(game.w, Math.ceil((canvas.width - ox) / s / TILE) + 1);
    const y1 = Math.min(game.h, Math.ceil((canvas.height - oy) / s / TILE) + 1);

    // terrain
    ctx.drawImage(this.terrain, x0 * TILE, y0 * TILE, (x1 - x0) * TILE, (y1 - y0) * TILE,
      x0 * TILE, y0 * TILE, (x1 - x0) * TILE, (y1 - y0) * TILE);
    ctx.strokeStyle = '#0a0c0a';
    ctx.lineWidth = 2;
    ctx.strokeRect(-1, -1, game.w * TILE + 2, game.h * TILE + 2);

    // subtle grid when zoomed in
    if (this.cam.zoom >= 3) {
      ctx.fillStyle = 'rgba(0,0,0,0.12)';
      for (let x = x0; x <= x1; x++) ctx.fillRect(x * TILE, y0 * TILE, 1 / s, (y1 - y0) * TILE);
      for (let y = y0; y <= y1; y++) ctx.fillRect(x0 * TILE, y * TILE, (x1 - x0) * TILE, 1 / s);
    }

    // buildings
    const visible = [];
    for (const b of game.buildings) {
      if (b.x < x0 || b.x >= x1 || b.y < y0 || b.y >= y1) continue;
      visible.push(b);
      this.drawRot(this.frameFor(b, t), b.x, b.y, b.dir);
    }

    // items riding on belts / sitting in splitters
    for (const b of visible) {
      if (!b.item) continue;
      const d = DIRS[b.dir];
      const p = b.type === 'belt' ? b.p - 0.5 : 0;
      const px = Math.round(b.x * TILE + 4 + d.x * p * TILE);
      const py = Math.round(b.y * TILE + 4 + d.y * p * TILE);
      ctx.drawImage(SPR.items[b.item], px, py);
    }

    // crafter status: tiny progress bar + recipe output icon at higher zoom
    if (this.cam.zoom >= 2) {
      for (const b of visible) {
        if (!CRAFTERS[b.type]) continue;
        if (b.t > 0) {
          ctx.fillStyle = '#0b0d10';
          ctx.fillRect(b.x * TILE + 2, b.y * TILE + 14, 12, 1);
          ctx.fillStyle = '#7be38f';
          ctx.fillRect(b.x * TILE + 2, b.y * TILE + 14, Math.round(12 * b.t), 1);
        }
        if (b.type !== 'smelter' && b.recipe && this.cam.zoom >= 3) {
          const out = k0(RECIPES[b.recipe].out);
          ctx.globalAlpha = 0.9;
          ctx.drawImage(SPR.items[out], b.x * TILE + 8, b.y * TILE - 2, 8, 8);
          ctx.globalAlpha = 1;
        }
      }
    }

    // selection highlight
    if (input.selected && game.buildings.includes(input.selected)) {
      const b = input.selected;
      ctx.strokeStyle = '#f2c94c';
      ctx.lineWidth = 1;
      ctx.strokeRect(b.x * TILE + 0.5, b.y * TILE + 0.5, TILE - 1, TILE - 1);
    }

    // hover / ghost
    const h = input.hover;
    if (h && game.inBounds(h.x, h.y)) {
      if (input.tool) {
        const err = game.placeError(input.tool, h.x, h.y);
        ctx.globalAlpha = 0.55;
        this.drawRot(SPR.icons[input.tool], h.x, h.y, BUILDINGS[input.tool].dir ? input.rot : 0);
        ctx.globalAlpha = 1;
        ctx.strokeStyle = err ? '#ff5a4a' : '#7be38f';
        ctx.lineWidth = 1;
        ctx.strokeRect(h.x * TILE + 0.5, h.y * TILE + 0.5, TILE - 1, TILE - 1);
        if (BUILDINGS[input.tool].dir) this.drawArrow(h.x, h.y, input.rot, err ? '#ff5a4a' : '#ffffff');
      } else if (input.deleting) {
        ctx.fillStyle = 'rgba(255,70,60,0.35)';
        ctx.fillRect(h.x * TILE, h.y * TILE, TILE, TILE);
      } else {
        ctx.strokeStyle = 'rgba(255,255,255,0.5)';
        ctx.lineWidth = 1;
        ctx.strokeRect(h.x * TILE + 0.5, h.y * TILE + 0.5, TILE - 1, TILE - 1);
      }
    }

    // floating income text (screen space for crisp text)
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    const fs = Math.max(10, Math.round(5 * s));
    ctx.font = `bold ${fs}px "Pixelify Sans", monospace`;
    ctx.textAlign = 'center';
    for (const f of game.floaters) {
      const sx = ox + f.x * TILE * s, sy = oy + f.y * TILE * s;
      ctx.globalAlpha = Math.min(1, f.life * 1.5);
      ctx.fillStyle = '#0b0d10';
      ctx.fillText(f.text, sx + 1 * this.dpr, sy + 1 * this.dpr);
      ctx.fillStyle = '#f2c94c';
      ctx.fillText(f.text, sx, sy);
    }
    ctx.globalAlpha = 1;
  }

  drawArrow(x, y, dir, col) {
    const ctx = this.ctx;
    const d = DIRS[dir];
    const cx = x * TILE + 8 + d.x * 11, cy = y * TILE + 8 + d.y * 11;
    ctx.fillStyle = col;
    ctx.beginPath();
    // triangle pointing in dir
    const px = -d.y, py = d.x;
    ctx.moveTo(cx + d.x * 3, cy + d.y * 3);
    ctx.lineTo(cx + px * 3, cy + py * 3);
    ctx.lineTo(cx - px * 3, cy - py * 3);
    ctx.closePath();
    ctx.fill();
  }
}
