'use strict';
// ---------------------------------------------------------------------------
// Renderer: draws a view model (see session.js) to the canvas.
// Static stadium + pitch are baked once per match; cars are pre-rendered
// sprites; the ball is a shaded sphere with real rolling patches.
// ---------------------------------------------------------------------------

const EXT = 200;            // how far the baked stadium extends past the world rect
const FONT_D = '"Bungee", "Rubik", system-ui, sans-serif';
const FONT_T = '"Rubik", system-ui, sans-serif';

const ICO = (() => {
  const p = (1 + Math.sqrt(5)) / 2, v = [];
  for (const a of [-1, 1]) for (const b of [-p, p]) { v.push([0, a, b], [a, b, 0], [b, 0, a]); }
  return v.map(([x, y, z]) => { const l = Math.hypot(x, y, z); return [x / l, y / l, z / l]; });
})();

function roundRectPath(c, x, y, w, h, r) {
  c.beginPath();
  c.moveTo(x + r, y); c.lineTo(x + w - r, y); c.quadraticCurveTo(x + w, y, x + w, y + r);
  c.lineTo(x + w, y + h - r); c.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  c.lineTo(x + r, y + h); c.quadraticCurveTo(x, y + h, x, y + h - r);
  c.lineTo(x, y + r); c.quadraticCurveTo(x, y, x + r, y); c.closePath();
}
function fieldPath(c, inset = 0) {
  c.beginPath();
  ARENA_PTS.forEach((p, i) => (i ? c.lineTo(p[0], p[1]) : c.moveTo(p[0], p[1])));
  c.closePath();
}
function mainFieldPath(c, grow = 0) {
  const F = FIELD;
  roundRectPath(c, F.l - grow, F.t - grow, F.r - F.l + grow * 2, F.b - F.t + grow * 2, F.corner + grow);
}

// ----------------------------- car sprites ---------------------------------
const CAR_SP = 4; // sprite pixels per world px
function carBodyPath(c, body) {
  c.beginPath();
  if (body === 'brick') { roundRectPath(c, -18.5, -10.5, 37, 21, 4); return; }
  if (body === 'wedge') {
    c.moveTo(20.5, -2.5); c.lineTo(20.5, 2.5); c.lineTo(7, 10); c.lineTo(-16, 10.5);
    c.quadraticCurveTo(-19.5, 10.5, -19.5, 7); c.lineTo(-19.5, -7); c.quadraticCurveTo(-19.5, -10.5, -16, -10.5); c.lineTo(7, -10);
    c.closePath(); return;
  }
  c.moveTo(19.5, 0); c.quadraticCurveTo(19.5, -7.5, 14, -9); c.lineTo(-13, -10);
  c.quadraticCurveTo(-19, -10, -19, -5); c.lineTo(-19, 5); c.quadraticCurveTo(-19, 10, -13, 10);
  c.lineTo(14, 9); c.quadraticCurveTo(19.5, 7.5, 19.5, 0); c.closePath();
}

function makeCarSprites(body, color) {
  const frames = [];
  const wpx = 52, hpx = 34;
  for (const steer of [-1, -0.5, 0, 0.5, 1]) {
    const cv = document.createElement('canvas');
    cv.width = wpx * CAR_SP; cv.height = hpx * CAR_SP;
    const c = cv.getContext('2d');
    c.scale(CAR_SP, CAR_SP); c.translate(wpx / 2, hpx / 2);
    // wheels
    const wheel = (x, y, rot) => {
      c.save(); c.translate(x, y); c.rotate(rot);
      c.fillStyle = '#121218'; roundRectPath(c, -4.4, -2.5, 8.8, 5, 1.6); c.fill();
      c.fillStyle = '#34343f'; c.fillRect(-3.6, -0.5, 7.2, 1);
      c.fillStyle = '#5a5a68'; c.fillRect(-1, -2.5, 2, 5);
      c.restore();
    };
    const wy = body === 'brick' ? 10.3 : 10;
    for (const s of [-1, 1]) { wheel(11.5, s * wy, steer * 0.5); wheel(-11.5, s * wy, 0); }
    // body
    carBodyPath(c, body);
    const g = c.createLinearGradient(0, -11, 0, 11);
    g.addColorStop(0, shade(color, -0.5)); g.addColorStop(0.22, shade(color, -0.05)); g.addColorStop(0.5, shade(color, 0.28));
    g.addColorStop(0.78, shade(color, -0.05)); g.addColorStop(1, shade(color, -0.5));
    c.fillStyle = g; c.fill();
    const g2 = c.createLinearGradient(-20, 0, 20, 0);
    g2.addColorStop(0, 'rgba(0,0,0,0.25)'); g2.addColorStop(0.5, 'rgba(255,255,255,0)'); g2.addColorStop(1, 'rgba(255,255,255,0.18)');
    c.fillStyle = g2; c.fill();
    c.lineWidth = 0.9; c.strokeStyle = 'rgba(0,0,0,0.6)'; c.stroke();
    // hood stripes
    const light = hexToRgb(color).reduce((a, b) => a + b, 0) > 560;
    c.strokeStyle = light ? 'rgba(20,20,30,0.55)' : 'rgba(255,255,255,0.75)'; c.lineWidth = 1.3;
    for (const s of [-1, 1]) { c.beginPath(); c.moveTo(5, s * 2.3); c.lineTo(body === 'wedge' ? 18 : 17.5, s * 2.3); c.stroke(); }
    // cockpit
    const ck = body === 'brick' ? [-10, -7.5, 16, 15, 2.5] : body === 'wedge' ? [-9, -6, 12, 12, 4] : [-8, -6.8, 13.5, 13.6, 3.5];
    roundRectPath(c, ck[0], ck[1], ck[2], ck[3], ck[4]);
    const gc = c.createLinearGradient(ck[0], 0, ck[0] + ck[2], 0);
    gc.addColorStop(0, '#0b1018'); gc.addColorStop(0.6, '#1d3148'); gc.addColorStop(1, '#3d6a94');
    c.fillStyle = gc; c.fill();
    c.strokeStyle = 'rgba(0,0,0,0.7)'; c.lineWidth = 0.7; c.stroke();
    c.fillStyle = 'rgba(255,255,255,0.32)';
    c.beginPath(); c.moveTo(ck[0] + ck[2] - 2.5, ck[1] + 2); c.lineTo(ck[0] + ck[2] - 1, ck[1] + 2.5); c.lineTo(ck[0] + 3, ck[1] + ck[3] - 1.5); c.lineTo(ck[0] + 1.5, ck[1] + ck[3] - 2.5); c.closePath(); c.fill();
    // spoiler
    c.fillStyle = shade(color, -0.55);
    roundRectPath(c, -21, -10, 3.4, 20, 1); c.fill();
    c.fillStyle = shade(color, -0.2); c.fillRect(-20.2, -9, 1.2, 18);
    // lights
    c.fillStyle = '#fff6cf';
    const hx = body === 'wedge' ? 15.5 : 17.6;
    const hy = body === 'wedge' ? [-5.5, 3] : [-7, 4.2];
    c.fillRect(hx, hy[0], 1.8, 2.8); c.fillRect(hx, hy[1], 1.8, 2.8);
    c.fillStyle = '#ff2448'; c.fillRect(-19.6, -8.3, 1.3, 3.4); c.fillRect(-19.6, 4.9, 1.3, 3.4);
    frames.push(cv);
  }
  // soft shadow silhouette
  const sh = document.createElement('canvas');
  sh.width = wpx * CAR_SP; sh.height = hpx * CAR_SP;
  const sc = sh.getContext('2d');
  sc.filter = `blur(${2.2 * CAR_SP}px)`;
  sc.scale(CAR_SP, CAR_SP); sc.translate(wpx / 2, hpx / 2);
  sc.fillStyle = 'rgba(0,0,0,0.55)'; carBodyPath(sc, body); sc.fill();
  return { frames, shadow: sh, w: wpx, h: hpx };
}

// ------------------------------- renderer -----------------------------------
class Renderer {
  constructor(canvas) {
    this.cv = canvas;
    this.c = canvas.getContext('2d');
    this.parts = [];
    this.shake = 0;
    this.flash = null;
    this.banner = null;
    this.emotes = [];
    this.time = 0;
    this.ballM = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
    this.lastBall = null;
    this.trail = [];
    this.skidPrev = [null, null];
    this.netRipple = [0, 0];
    this.cheer = 0;
    this.sprites = {};
    this.lastClock = null;
    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = window.innerWidth, h = window.innerHeight;
    this.cv.width = Math.round(w * dpr); this.cv.height = Math.round(h * dpr);
    this.cv.style.width = w + 'px'; this.cv.style.height = h + 'px';
    this.dpr = dpr;
    this.sw = this.cv.width; this.sh = this.cv.height;
    this.scale = Math.min(this.sw / W, this.sh / (H + 20));
    this.ox = (this.sw - W * this.scale) / 2;
    this.oy = (this.sh - H * this.scale) / 2 + 10 * this.scale;
    if (this.ar) this.bake(this.ar, this.players, true);
  }

  toScreen(x, y) { return [this.ox + x * this.scale, this.oy + y * this.scale]; }
  toWorld(sx, sy) { return [(sx * this.dpr - this.ox) / this.scale, (sy * this.dpr - this.oy) / this.scale]; }

  carSprite(p) {
    const key = p.body + p.paint;
    if (!this.sprites[key]) this.sprites[key] = makeCarSprites(BODIES[p.body].id, PAINTS[p.paint].c);
    return this.sprites[key];
  }

  // ------------------------------ baking ----------------------------------
  bake(ar, players, force) {
    const key = ar.id + JSON.stringify(players.map((p) => p.paint));
    if (!force && this.bakedKey === key) return;
    this.bakedKey = key;
    this.ar = ar; this.players = players;
    const q = this.q = clamp(this.scale, 1, 2);
    const bw = Math.ceil((W + EXT * 2) * q), bh = Math.ceil((H + EXT * 2) * q);
    const rng = RNG(ar.id.length * 977 + 13);
    const mk = () => { const cv = document.createElement('canvas'); cv.width = bw; cv.height = bh; const c = cv.getContext('2d'); c.scale(q, q); c.translate(EXT, EXT); return [cv, c]; };
    const [bg, c] = mk();
    const [crowdCv, cc] = mk();
    this.bg = bg; this.crowdCv = crowdCv;
    const cols = players.map((p) => PAINTS[p.paint].c);

    // stands
    const sg = c.createRadialGradient(CX, CY, 200, CX, CY, 900);
    sg.addColorStop(0, ar.stands); sg.addColorStop(1, ar.standsDark);
    c.fillStyle = sg; c.fillRect(-EXT, -EXT, W + EXT * 2, H + EXT * 2);
    if (ar.city) this.bakeCity(c, rng, ar);
    // seat rows + crowd on rings around the field
    const ringStart = ar.city ? 26 : 24, ringEnd = ar.city ? 70 : 330;
    for (let d = ringStart; d < ringEnd; d += 11) {
      c.strokeStyle = rgba(ar.seat, 0.55 - (d / ringEnd) * 0.3); c.lineWidth = 6;
      mainFieldPath(c, d); c.stroke();
      c.strokeStyle = 'rgba(0,0,0,0.18)'; c.lineWidth = 1; mainFieldPath(c, d + 3.5); c.stroke();
      // sample points along this ring
      const pts = this.ringPoints(d, 7.5);
      for (const [x, y] of pts) {
        if (rng() > 0.82 - d / 2000) continue;
        if ((x < FIELD.l || x > FIELD.r) && Math.abs(y - CY) < 120 && d < 110) continue; // goal structures
        const col = rng.pick(ar.crowd);
        cc.fillStyle = 'rgba(0,0,0,0.35)'; cc.beginPath(); cc.ellipse(x + 0.8, y + 2.4, 3.4, 2.4, 0, 0, TAU); cc.fill();
        cc.fillStyle = shade(col, -0.25); cc.beginPath(); cc.ellipse(x, y + 1.6, 3.2, 2.2, 0, 0, TAU); cc.fill();
        cc.fillStyle = rng() < 0.5 ? '#f1c7a5' : rng() < 0.5 ? '#c68a62' : '#8a5a3c';
        cc.beginPath(); cc.arc(x, y - 0.6, 1.9, 0, TAU); cc.fill();
        if (rng() < 0.22) { cc.fillStyle = rng() < 0.5 ? cols[0] : cols[1]; cc.fillRect(x - 2.2, y - 3.2, 4.4, 1.6); } // team hats
      }
    }
    // goal structures behind the nets
    for (const side of [0, 1]) {
      const x0 = side === 0 ? FIELD.l - FIELD.depth - 40 : FIELD.r + FIELD.depth;
      c.fillStyle = shade(ar.standsDark, -0.2);
      roundRectPath(c, x0, FIELD.goalT - 52, 40, FIELD.goalB - FIELD.goalT + 104, 8); c.fill();
      c.fillStyle = rgba(cols[side], 0.35);
      roundRectPath(c, x0 + 8, FIELD.goalT - 40, 24, FIELD.goalB - FIELD.goalT + 80, 6); c.fill();
    }
    // LED boards along the top and bottom
    for (const y of [FIELD.t - 22, FIELD.b + 14]) {
      c.fillStyle = '#0c0d14'; roundRectPath(c, FIELD.l + 80, y, FIELD.r - FIELD.l - 160, 8, 2); c.fill();
    }

    // pitch
    c.save();
    fieldPath(c); c.clip();
    this.bakePitch(c, rng, ar, cols);
    c.restore();

    // goal nets
    for (const side of [0, 1]) this.bakeGoal(c, side, cols[side], ar);

    // walls
    c.save();
    c.lineJoin = 'round';
    fieldPath(c);
    c.shadowColor = ar.night ? rgba(ar.wall, 0.8) : 'rgba(0,0,0,0.45)';
    c.shadowBlur = ar.night ? 18 : 10;
    c.strokeStyle = ar.wallDark; c.lineWidth = 13; c.stroke();
    c.shadowBlur = 0;
    c.strokeStyle = ar.wall; c.lineWidth = 7; c.stroke();
    c.strokeStyle = 'rgba(255,255,255,0.45)'; c.lineWidth = 1.5; c.stroke();
    c.restore();
    // goal posts
    for (const side of [0, 1]) {
      const x = side === 0 ? FIELD.l : FIELD.r;
      for (const y of [FIELD.goalT, FIELD.goalB]) {
        c.fillStyle = 'rgba(0,0,0,0.35)'; c.beginPath(); c.arc(x + 3, y + 3, 7, 0, TAU); c.fill();
        c.fillStyle = '#ffffff'; c.beginPath(); c.arc(x, y, 6.5, 0, TAU); c.fill();
        c.fillStyle = cols[side]; c.beginPath(); c.arc(x, y, 4.5, 0, TAU); c.fill();
      }
    }
    this.decal = document.createElement('canvas');
    this.decal.width = Math.ceil(W * q); this.decal.height = Math.ceil(H * q);
    this.dc = this.decal.getContext('2d'); this.dc.scale(q, q);
  }

  ringPoints(d, step) {
    const F = FIELD, R = F.corner + d, pts = [];
    const l = F.l - d, r = F.r + d, t = F.t - d, b = F.b + d;
    const push = (x, y) => pts.push([x + (hash2(Math.round(x), Math.round(y)) - 0.5) * 1.6, y]);
    for (let x = l + R; x <= r - R; x += step) { push(x, t); push(x, b); }
    for (let y = t + R; y <= b - R; y += step) { push(l, y); push(r, y); }
    const n = Math.max(2, Math.floor((Math.PI / 2 * R) / step));
    const corners = [[l + R, t + R, Math.PI], [r - R, t + R, Math.PI * 1.5], [r - R, b - R, 0], [l + R, b - R, Math.PI * 0.5]];
    for (const [cx, cy, a0] of corners) for (let i = 1; i < n; i++) { const a = a0 + (Math.PI / 2) * i / n; push(cx + Math.cos(a) * R, cy + Math.sin(a) * R); }
    return pts;
  }

  bakeCity(c, rng, ar) {
    // rooftops of the city below, with lit windows
    for (let i = 0; i < 140; i++) {
      const side = rng.int(4);
      let x, y, w = 40 + rng() * 90, h = 30 + rng() * 80;
      if (side === 0) { x = -EXT + rng() * (W + EXT * 2); y = -EXT + rng() * (EXT - 60); }
      else if (side === 1) { x = -EXT + rng() * (W + EXT * 2); y = H + 60 + rng() * (EXT - 60) - h; }
      else if (side === 2) { x = -EXT + rng() * (EXT - 40) - w * 0.5; y = -EXT + rng() * (H + EXT * 2); }
      else { x = W + 40 + rng() * (EXT - 40); y = -EXT + rng() * (H + EXT * 2); }
      const base = mixHex('#232842', '#3a3150', rng());
      c.fillStyle = 'rgba(0,0,0,0.4)'; c.fillRect(x + 6, y + 8, w, h);
      c.fillStyle = base; c.fillRect(x, y, w, h);
      c.fillStyle = shade(base, 0.12); c.fillRect(x, y, w, 3);
      for (let wx = x + 5; wx < x + w - 6; wx += 8) for (let wy = y + 7; wy < y + h - 5; wy += 9) {
        if (rng() < 0.42) { c.fillStyle = rng() < 0.7 ? 'rgba(255,214,120,0.85)' : 'rgba(150,220,255,0.8)'; c.fillRect(wx, wy, 3.5, 4); }
      }
      if (rng() < 0.25) { c.fillStyle = '#ff4466'; c.beginPath(); c.arc(x + w / 2, y + h / 2, 2, 0, TAU); c.fill(); }
    }
  }

  bakePitch(c, rng, ar, cols) {
    const F = FIELD;
    c.fillStyle = ar.pitch[0]; c.fillRect(F.l - F.depth, F.t, F.r - F.l + F.depth * 2, F.b - F.t);
    if (ar.id === 'park') {
      for (let x = F.l, k = 0; x < F.r; x += 60, k++) { c.fillStyle = k % 2 ? ar.pitch[1] : ar.pitch[0]; c.fillRect(x, F.t, 60, F.b - F.t); }
      for (let i = 0; i < 9000; i++) { c.fillStyle = rng() < 0.5 ? 'rgba(0,40,0,0.10)' : 'rgba(220,255,160,0.07)'; c.fillRect(F.l + rng() * (F.r - F.l), F.t + rng() * (F.b - F.t), 1.2, 2.4); }
    } else if (ar.id === 'neon') {
      c.strokeStyle = rgba(ar.grid, 0.55); c.lineWidth = 1;
      for (let x = F.l; x <= F.r; x += 40) { c.beginPath(); c.moveTo(x, F.t); c.lineTo(x, F.b); c.stroke(); }
      for (let y = F.t + 10; y <= F.b; y += 40) { c.beginPath(); c.moveTo(F.l - F.depth, y); c.lineTo(F.r + F.depth, y); c.stroke(); }
      const gl = c.createRadialGradient(CX, CY, 20, CX, CY, 520);
      gl.addColorStop(0, 'rgba(120,80,255,0.22)'); gl.addColorStop(1, 'rgba(0,0,0,0)');
      c.fillStyle = gl; c.fillRect(F.l, F.t, F.r - F.l, F.b - F.t);
    } else if (ar.id === 'rink') {
      for (let i = 0; i < 420; i++) {
        const x = F.l + rng() * (F.r - F.l), y = F.t + rng() * (F.b - F.t), a = rng() * TAU, l = 10 + rng() * 60;
        c.strokeStyle = `rgba(150,180,210,${0.08 + rng() * 0.18})`; c.lineWidth = 0.6;
        c.beginPath(); c.moveTo(x, y); c.quadraticCurveTo(x + Math.cos(a) * l * 0.5 + 6, y + Math.sin(a) * l * 0.5, x + Math.cos(a) * l, y + Math.sin(a) * l); c.stroke();
      }
      for (let i = 0; i < 14; i++) {
        const x = F.l + rng() * (F.r - F.l), y = F.t + rng() * (F.b - F.t);
        const g = c.createRadialGradient(x, y, 0, x, y, 90); g.addColorStop(0, 'rgba(255,255,255,0.35)'); g.addColorStop(1, 'rgba(255,255,255,0)');
        c.fillStyle = g; c.fillRect(x - 90, y - 90, 180, 180);
      }
    } else if (ar.id === 'dunes') {
      c.lineWidth = 2;
      for (let y = F.t - 10; y < F.b + 20; y += 14) {
        c.strokeStyle = `rgba(150,90,30,${0.10 + rng() * 0.08})`;
        c.beginPath();
        for (let x = F.l - F.depth; x <= F.r + F.depth; x += 10) { const yy = y + Math.sin(x * 0.018 + y * 0.07) * 6 + Math.sin(x * 0.051) * 2; x === F.l - F.depth ? c.moveTo(x, yy) : c.lineTo(x, yy); }
        c.stroke();
      }
      for (let i = 0; i < 6000; i++) { c.fillStyle = rng() < 0.5 ? 'rgba(120,70,20,0.12)' : 'rgba(255,240,200,0.12)'; c.fillRect(F.l + rng() * (F.r - F.l), F.t + rng() * (F.b - F.t), 1.3, 1.3); }
    } else if (ar.id === 'skyline') {
      for (let i = 0; i < 12000; i++) { c.fillStyle = rng() < 0.5 ? 'rgba(0,0,0,0.16)' : 'rgba(255,255,255,0.05)'; c.fillRect(F.l + rng() * (F.r - F.l), F.t + rng() * (F.b - F.t), 1.4, 1.4); }
      for (let i = 0; i < 7; i++) {
        const x = F.l + 60 + rng() * (F.r - F.l - 120), y = F.t + 40 + rng() * (F.b - F.t - 80);
        c.fillStyle = 'rgba(120,140,200,0.10)'; c.beginPath(); c.ellipse(x, y, 30 + rng() * 40, 12 + rng() * 16, rng() * 3, 0, TAU); c.fill();
      }
    }
    // team-coloured goal areas
    for (const side of [0, 1]) {
      const x = side === 0 ? F.l : F.r, dir = side === 0 ? 1 : -1;
      const g = c.createLinearGradient(x, 0, x + dir * 200, 0);
      g.addColorStop(0, rgba(cols[side], 0.28)); g.addColorStop(1, rgba(cols[side], 0));
      c.fillStyle = g; c.fillRect(Math.min(x, x + dir * 200), F.t, 200, F.b - F.t);
    }
    // painted lines
    c.strokeStyle = ar.line; c.lineWidth = 3; c.lineCap = 'round';
    if (ar.night) { c.shadowColor = ar.line; c.shadowBlur = 10; }
    c.beginPath(); c.moveTo(CX, F.t); c.lineTo(CX, F.b); c.stroke();
    c.beginPath(); c.arc(CX, CY, 72, 0, TAU); c.stroke();
    c.fillStyle = ar.line; c.beginPath(); c.arc(CX, CY, 4, 0, TAU); c.fill();
    for (const side of [0, 1]) {
      const x = side === 0 ? F.l : F.r, dir = side === 0 ? 1 : -1;
      c.beginPath(); c.moveTo(x, F.goalT - 70); c.lineTo(x + dir * 120, F.goalT - 70); c.lineTo(x + dir * 120, F.goalB + 70); c.lineTo(x, F.goalB + 70); c.stroke();
      c.beginPath(); c.moveTo(x, F.goalT - 22); c.lineTo(x + dir * 44, F.goalT - 22); c.lineTo(x + dir * 44, F.goalB + 22); c.lineTo(x, F.goalB + 22); c.stroke();
      c.beginPath(); c.arc(x + dir * 120, CY, 46, side === 0 ? -Math.PI / 2 : Math.PI / 2, side === 0 ? Math.PI / 2 : Math.PI * 1.5); c.stroke();
      c.beginPath(); c.moveTo(x, F.goalT); c.lineTo(x, F.goalB); c.lineWidth = 4; c.stroke(); c.lineWidth = 3;
    }
    c.shadowBlur = 0;
    // inner wall shadow
    c.save();
    fieldPath(c);
    c.strokeStyle = 'rgba(0,0,0,0.25)'; c.lineWidth = 26; c.filter = 'blur(6px)'; c.stroke();
    c.restore();
  }

  bakeGoal(c, side, col, ar) {
    const F = FIELD;
    const x0 = side === 0 ? F.l - F.depth : F.r, w = F.depth, y0 = F.goalT, h = F.goalB - F.goalT;
    c.save();
    c.beginPath(); c.rect(x0, y0, w, h); c.clip();
    const g = c.createLinearGradient(side === 0 ? x0 : x0 + w, 0, side === 0 ? x0 + w : x0, 0);
    g.addColorStop(0, '#05060a'); g.addColorStop(1, shade(col, -0.65));
    c.fillStyle = g; c.fillRect(x0, y0, w, h);
    c.restore();
    this.goalRect = this.goalRect || [];
    this.goalRect[side] = [x0, y0, w, h];
  }

  // --------------------------- fx / particles -------------------------------
  addShake(v) { if (Settings.data.shake) this.shake = Math.min(18, this.shake + v); }
  part(o) { if (this.parts.length < 1400) this.parts.push(Object.assign({ vx: 0, vy: 0, life: 1, max: 1, size: 2, drag: 2, g: 0, add: false, kind: 'dot', rot: 0, vr: 0 }, o)); }

  burstAt(x, y, n, col, speed, o = {}) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * TAU, s = speed * (0.3 + Math.random() * 0.7);
      this.part(Object.assign({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 0.3 + Math.random() * 0.5, size: 1.5 + Math.random() * 2, col, add: true, kind: 'spark' }, o));
    }
  }

  fx(e, vm) {
    const cols = vm ? vm.players.map((p) => PAINTS[p.paint].c) : ['#fff', '#fff'];
    switch (e.k) {
      case 'hit': {
        const k = clamp(e.s / 900, 0.1, 1);
        this.burstAt(e.x, e.y, 6 + k * 18, e.pinch ? '#ffffff' : cols[e.i], 220 + k * 300);
        this.part({ x: e.x, y: e.y, kind: 'ring', life: 0.35, max: 0.35, size: 8, grow: 90 * k + 30, col: e.pinch ? '#fff' : cols[e.i], add: true });
        this.addShake(k * 5);
        break;
      }
      case 'wall':
        this.burstAt(e.x, e.y, 5 + e.s / 80, '#ffffff', 160 + e.s * 0.2, { life: 0.3 });
        this.addShake(clamp(e.s / 300, 0, 3));
        if (e.post) this.part({ x: e.x, y: e.y, kind: 'text', text: 'POST!', life: 1.1, max: 1.1, vy: -30, drag: 1, col: '#ffffff' });
        break;
      case 'bump':
        this.burstAt(e.x, e.y, 14, '#ffd36b', 260);
        this.addShake(clamp(e.s / 120, 1, 6));
        break;
      case 'cwall':
        this.burstAt(e.x, e.y, 8, '#ffcc66', 200, { life: 0.25 });
        break;
      case 'hop': case 'land':
        for (let i = 0; i < 10; i++) { const a = Math.random() * TAU; this.part({ x: e.x + Math.cos(a) * 12, y: e.y + Math.sin(a) * 8, vx: Math.cos(a) * 60, vy: Math.sin(a) * 60, life: 0.5, max: 0.5, size: 4 + Math.random() * 4, col: this.dustCol(), kind: 'smoke', drag: 3 }); }
        break;
      case 'pad': {
        const p = PADS[e.p];
        this.burstAt(p.x, p.y, p.big ? 26 : 10, p.big ? '#ffb43b' : '#ffe680', p.big ? 260 : 150, { life: 0.4 });
        this.part({ x: p.x, y: p.y, kind: 'ring', life: 0.4, max: 0.4, size: 6, grow: p.big ? 120 : 60, col: '#ffcc44', add: true });
        break;
      }
      case 'goal': {
        const col = cols[e.i];
        for (let i = 0; i < 90; i++) {
          const a = Math.random() * TAU, s = 150 + Math.random() * 650;
          this.part({ x: e.x, y: e.y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 0.6 + Math.random() * 0.9, size: 2 + Math.random() * 3, col: Math.random() < 0.6 ? col : '#ffffff', add: true, kind: 'spark', drag: 2.2 });
        }
        for (let i = 0; i < 140; i++) {
          const a = Math.random() * TAU, s = 80 + Math.random() * 520;
          this.part({ x: e.x, y: e.y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 120, life: 2 + Math.random() * 2, max: 4, size: 3 + Math.random() * 3, col: Math.random() < 0.5 ? col : ['#ffffff', '#ffe066', '#ff6fa3', '#6fd6ff'][i % 4], kind: 'confetti', drag: 1.6, g: 120, rot: Math.random() * 6, vr: (Math.random() - 0.5) * 20 });
        }
        for (let i = 0; i < 24; i++) { const a = Math.random() * TAU, s = 40 + Math.random() * 140; this.part({ x: e.x, y: e.y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 1.4, max: 1.4, size: 14 + Math.random() * 16, col: 'rgba(40,40,50,0.55)', kind: 'smoke', drag: 1.5 }); }
        this.part({ x: e.x, y: e.y, kind: 'ring', life: 0.7, max: 0.7, size: 10, grow: 520, col, add: true, width: 10 });
        this.part({ x: e.x, y: e.y, kind: 'ring', life: 0.9, max: 0.9, size: 10, grow: 320, col: '#ffffff', add: true, width: 4 });
        this.flash = { col, t: 0.45, max: 0.45 };
        this.addShake(16);
        this.netRipple[e.i === 0 ? 1 : 0] = 1;
        const p = vm && vm.players[e.i];
        this.banner = { kind: 'goal', t: 0, col, text: e.og ? 'OWN GOAL!' : 'GOAL!', sub: e.og ? `${vm.players[1 - e.i].name} put it in their own net` : `${p ? p.name : ''} scores  ·  ${e.sp} km/h` };
        this.cheer = 1;
        this.trail.length = 0;
        break;
      }
      case 'save':
        if (vm) { const c = vm.cars[e.i]; this.part({ x: c.x, y: c.y - 24, kind: 'text', text: 'SAVE!', life: 1.3, max: 1.3, vy: -35, drag: 1, col: cols[e.i] }); }
        this.cheer = Math.max(this.cheer, 0.6);
        break;
      case 'overtime':
        this.banner = { kind: 'overtime', t: 0, col: '#ff5a5a', text: 'OVERTIME', sub: 'Next goal wins!' };
        break;
      case 'over': {
        const w = e.w;
        this.banner = null;
        this.cheer = 1;
        break;
      }
      case 'reset':
        this.trail.length = 0;
        this.lastBall = null;
        this.skidPrev = [null, null];
        break;
    }
  }

  emote(i, text) {
    this.emotes = this.emotes.filter((e) => e.i !== i);
    this.emotes.push({ i, text, t: 0 });
  }

  dustCol() {
    const id = this.ar ? this.ar.id : 'park';
    return id === 'park' ? 'rgba(90,140,60,0.5)' : id === 'dunes' ? 'rgba(220,170,100,0.6)' : id === 'rink' ? 'rgba(255,255,255,0.7)' : 'rgba(160,160,180,0.45)';
  }

  // ------------------------------- drawing ----------------------------------
  draw(vm, dt) {
    this.time += dt;
    const c = this.c;
    if (!this.bg || this.ar !== vm.ar || this.players !== vm.players) this.bake(vm.ar, vm.players, this.ar !== vm.ar);
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.fillStyle = '#05060a'; c.fillRect(0, 0, this.sw, this.sh);
    this.shake *= Math.exp(-dt * 9);
    const sx = (Math.random() - 0.5) * this.shake * this.scale * 0.6, sy = (Math.random() - 0.5) * this.shake * this.scale * 0.6;
    c.setTransform(this.scale, 0, 0, this.scale, this.ox + sx, this.oy + sy);
    // stadium + crowd (jumping when cheering)
    c.imageSmoothingEnabled = true;
    c.drawImage(this.bg, -EXT, -EXT, W + EXT * 2, H + EXT * 2);
    this.cheer = Math.max(0, this.cheer - dt * 0.28);
    const cheer = this.cheer + (vm.phase === 'over' ? 0.5 : 0);
    if (cheer > 0.02) {
      const strips = 48, bw = this.crowdCv.width / strips, ww = (W + EXT * 2) / strips;
      for (let k = 0; k < strips; k++) {
        const j = Math.max(0, Math.sin(this.time * 13 + k * 1.7)) * cheer * 3.2;
        c.drawImage(this.crowdCv, k * bw, 0, bw, this.crowdCv.height, -EXT + k * ww, -EXT - j, ww, H + EXT * 2);
      }
    } else c.drawImage(this.crowdCv, -EXT, -EXT, W + EXT * 2, H + EXT * 2);
    this.drawLED(c, vm);
    // nets with ripple
    for (const side of [0, 1]) this.drawNet(c, side, dt);
    // decals (skids)
    this.updateSkids(vm, dt);
    c.drawImage(this.decal, 0, 0, W, H);
    this.drawPads(c, vm);

    const cars = vm.cars, ball = vm.ball;
    const sh = vm.ar.shadow;
    // shadows
    cars.forEach((car, i) => {
      const sp = this.carSprite(vm.players[i]);
      const s = 1 + car.z / 90;
      c.save(); c.translate(car.x + sh[0] * 0.5 + car.z * 0.5, car.y + sh[1] * 0.5 + car.z * 0.6); c.rotate(car.a);
      c.globalAlpha = clamp(0.9 - car.z / 120, 0.3, 0.9);
      c.drawImage(sp.shadow, -sp.w / 2 * s, -sp.h / 2 * s, sp.w * s, sp.h * s);
      c.restore();
    });
    if (vm.ballLive) {
      const bs = 1 - clamp(ball.z / 400, 0, 0.5);
      c.fillStyle = `rgba(0,0,0,${0.35 * bs})`;
      c.beginPath(); c.ellipse(ball.x + sh[0] * 0.5 + ball.z * 0.45, ball.y + sh[1] * 0.5 + ball.z * 0.55, BALL_R * bs * 1.05, BALL_R * bs * 0.85, 0, 0, TAU); c.fill();
    }
    // boost flames behind cars (under bodies)
    cars.forEach((car, i) => this.carEffects(c, car, i, vm, dt));
    // sort cars + ball by height
    const items = cars.map((car, i) => ({ z: car.z + 8, draw: () => this.drawCar(c, car, i, vm) }));
    if (vm.ballLive) items.push({ z: ball.z + BALL_R, draw: () => this.drawBall(c, ball, vm, dt) });
    items.sort((a, b) => a.z - b.z).forEach((it) => it.draw());
    if (!vm.ballLive) { this.lastBall = null; }

    this.drawParticles(c, dt);
    // grading + vignette
    c.fillStyle = vm.ar.grade; c.fillRect(-EXT, -EXT, W + EXT * 2, H + EXT * 2);
    c.setTransform(1, 0, 0, 1, 0, 0);
    const vg = c.createRadialGradient(this.sw / 2, this.sh / 2, Math.min(this.sw, this.sh) * 0.45, this.sw / 2, this.sh / 2, Math.max(this.sw, this.sh) * 0.75);
    vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, `rgba(0,0,0,${0.45 + vm.ar.night * 0.3})`);
    c.fillStyle = vg; c.fillRect(0, 0, this.sw, this.sh);
    if (this.flash) {
      this.flash.t -= dt;
      if (this.flash.t <= 0) this.flash = null;
      else { c.fillStyle = rgba(this.flash.col, 0.4 * this.flash.t / this.flash.max); c.fillRect(0, 0, this.sw, this.sh); }
    }
    this.drawHUD(c, vm, dt);
  }

  drawLED(c, vm) {
    const cols = vm.players.map((p) => PAINTS[p.paint].c);
    const words = ['TURBOBALL', vm.players[0].name.toUpperCase(), 'VS', vm.players[1].name.toUpperCase(), vm.ar.name.toUpperCase()];
    c.save();
    c.font = `7px ${FONT_D}`;
    c.textBaseline = 'middle';
    for (const [y, dir] of [[FIELD.t - 18, 1], [FIELD.b + 18, -1]]) {
      const x0 = FIELD.l + 82, x1 = FIELD.r - 82;
      c.save(); c.beginPath(); c.rect(x0, y - 4, x1 - x0, 8); c.clip();
      let x = x0 - ((this.time * 40 * dir) % 300 + 300) % 300;
      let k = 0;
      while (x < x1) {
        const word = words[k % words.length];
        c.fillStyle = k % words.length === 1 ? cols[0] : k % words.length === 3 ? cols[1] : (k % 2 ? '#ffd25a' : '#ffffff');
        c.globalAlpha = 0.85;
        c.fillText(word, x, y);
        x += c.measureText(word).width + 26;
        k++;
      }
      c.restore();
    }
    c.restore();
  }

  drawNet(c, side, dt) {
    const r = this.goalRect && this.goalRect[side];
    if (!r) return;
    const [x0, y0, w, h] = r;
    this.netRipple[side] = Math.max(0, this.netRipple[side] - dt * 0.7);
    const rip = this.netRipple[side];
    c.save();
    c.beginPath(); c.rect(x0, y0, w, h); c.clip();
    c.strokeStyle = 'rgba(255,255,255,0.35)'; c.lineWidth = 0.8;
    const t = this.time;
    for (let k = -h; k < w + h; k += 7) {
      c.beginPath();
      for (let s = 0; s <= 1; s += 0.1) {
        const x = x0 + k + s * h * 0.5, y = y0 + s * h;
        const off = Math.sin(y * 0.08 + t * 12) * rip * 5 * (side === 0 ? -1 : 1);
        s === 0 ? c.moveTo(x + off, y) : c.lineTo(x + off, y);
      }
      c.stroke();
      c.beginPath();
      for (let s = 0; s <= 1; s += 0.1) {
        const x = x0 + k - s * h * 0.5 + h * 0.5, y = y0 + s * h;
        const off = Math.sin(y * 0.08 + t * 12) * rip * 5 * (side === 0 ? -1 : 1);
        s === 0 ? c.moveTo(x + off, y) : c.lineTo(x + off, y);
      }
      c.stroke();
    }
    c.restore();
    // crossbar (raised frame, casts a shadow)
    const fx = side === 0 ? x0 : x0 + w;
    c.strokeStyle = 'rgba(0,0,0,0.35)'; c.lineWidth = 5;
    c.beginPath(); c.moveTo(side === 0 ? x0 + w + 4 : x0 + 4, y0 + 4); c.lineTo(fx + 4, y0 + 4); c.lineTo(fx + 4, y0 + h + 4); c.lineTo(side === 0 ? x0 + w + 4 : x0 + 4, y0 + h + 4); c.stroke();
    c.strokeStyle = '#f4f4f8'; c.lineWidth = 4;
    c.beginPath(); c.moveTo(side === 0 ? x0 + w : x0, y0); c.lineTo(fx, y0); c.lineTo(fx, y0 + h); c.lineTo(side === 0 ? x0 + w : x0, y0 + h); c.stroke();
  }

  updateSkids(vm, dt) {
    const dc = this.dc;
    this.fadeT = (this.fadeT || 0) + dt;
    if (this.fadeT > 0.25) {
      this.fadeT = 0;
      dc.globalCompositeOperation = 'destination-out';
      dc.fillStyle = 'rgba(0,0,0,0.035)'; dc.fillRect(0, 0, W, H);
      dc.globalCompositeOperation = 'source-over';
    }
    const ice = vm.ar.ice, sand = vm.ar.sand;
    vm.cars.forEach((car, i) => {
      const prev = this.skidPrev[i];
      const ca = Math.cos(car.a), sa = Math.sin(car.a);
      const wheels = [[-11.5, -10], [-11.5, 10], [11.5, -10], [11.5, 10]].map(([lx, ly]) => [car.x + lx * ca - ly * sa, car.y + lx * sa + ly * ca]);
      const sp = Math.hypot(car.vx || 0, car.vy || 0);
      const lat = Math.abs(-(car.vx || 0) * sa + (car.vy || 0) * ca);
      const strength = car.z > 0.5 ? 0 : clamp((lat - 40) / 160, 0, 1) + (car.braking ? 0.4 : 0) + (sand ? clamp(sp / 400, 0, 0.35) : 0);
      if (prev && strength > 0.05 && !vm.replay) {
        dc.strokeStyle = ice ? `rgba(255,255,255,${0.5 * strength})` : sand ? `rgba(120,70,25,${0.28 * strength})` : `rgba(10,10,10,${0.32 * strength})`;
        dc.lineWidth = sand ? 4 : 3; dc.lineCap = 'round';
        for (let w = 0; w < 4; w++) {
          if (w >= 2 && !sand && !ice) continue;
          dc.beginPath(); dc.moveTo(prev[w][0], prev[w][1]); dc.lineTo(wheels[w][0], wheels[w][1]); dc.stroke();
        }
        if (Math.random() < strength * 0.6) this.part({ x: wheels[0][0], y: wheels[0][1], vx: (Math.random() - 0.5) * 30, vy: (Math.random() - 0.5) * 30, life: 0.6, max: 0.6, size: 5 + Math.random() * 5, col: this.dustCol(), kind: 'smoke', drag: 2 });
      }
      this.skidPrev[i] = wheels;
    });
  }

  drawPads(c, vm) {
    const t = this.time;
    PADS.forEach((p, k) => {
      const active = !vm.pads || vm.pads[k] <= 0;
      const r = p.big ? 13 : 8;
      c.fillStyle = 'rgba(0,0,0,0.35)'; c.beginPath(); c.arc(p.x, p.y, r + 3, 0, TAU); c.fill();
      c.strokeStyle = 'rgba(255,255,255,0.25)'; c.lineWidth = 1.5; c.beginPath(); c.arc(p.x, p.y, r + 3, 0, TAU); c.stroke();
      if (active) {
        const pulse = 0.5 + Math.sin(t * 5 + k) * 0.5;
        c.save(); c.globalCompositeOperation = 'lighter';
        const g = c.createRadialGradient(p.x, p.y, 0, p.x, p.y, r * 2.6);
        g.addColorStop(0, p.big ? 'rgba(255,170,40,0.9)' : 'rgba(255,225,90,0.8)'); g.addColorStop(1, 'rgba(255,140,0,0)');
        c.fillStyle = g; c.beginPath(); c.arc(p.x, p.y, r * 2.6, 0, TAU); c.fill();
        c.restore();
        c.fillStyle = p.big ? '#ffb22e' : '#ffe166';
        c.beginPath(); c.arc(p.x, p.y, r * (0.75 + pulse * 0.12), 0, TAU); c.fill();
        c.fillStyle = '#fff6d0'; c.beginPath(); c.arc(p.x - r * 0.2, p.y - r * 0.2, r * 0.35, 0, TAU); c.fill();
        if (p.big) {
          c.strokeStyle = `rgba(255,220,120,${0.6 * (1 - ((t * 0.8 + k * 0.3) % 1))})`; c.lineWidth = 2;
          c.beginPath(); c.arc(p.x, p.y, r + 4 + ((t * 0.8 + k * 0.3) % 1) * 14, 0, TAU); c.stroke();
        }
      } else {
        const total = p.big ? PAD_RESPAWN.big : PAD_RESPAWN.small;
        const prog = 1 - clamp(vm.pads[k] / total, 0, 1);
        c.strokeStyle = 'rgba(255,200,80,0.6)'; c.lineWidth = 2;
        c.beginPath(); c.arc(p.x, p.y, r * 0.7, -Math.PI / 2, -Math.PI / 2 + prog * TAU); c.stroke();
      }
    });
  }

  carEffects(c, car, i, vm, dt) {
    const col = PAINTS[vm.players[i].paint].c;
    const ca = Math.cos(car.a), sa = Math.sin(car.a);
    const s = 1 + car.z / 90;
    const rx = car.x - ca * 21 * s, ry = car.y - sa * 21 * s;
    if (car.boosting) {
      c.save(); c.globalCompositeOperation = 'lighter';
      for (let k = 0; k < 2; k++) {
        const len = 16 + Math.random() * 14;
        const g = c.createLinearGradient(rx, ry, rx - ca * len, ry - sa * len);
        g.addColorStop(0, 'rgba(255,255,230,0.95)'); g.addColorStop(0.3, rgba(shade(col, 0.4), 0.85)); g.addColorStop(1, rgba(col, 0));
        c.fillStyle = g;
        c.beginPath();
        c.moveTo(rx + sa * 5, ry - ca * 5); c.lineTo(rx - ca * len, ry - sa * len); c.lineTo(rx - sa * 5, ry + ca * 5); c.closePath(); c.fill();
      }
      c.restore();
      if (!vm.replay || Math.random() < 0.8) for (let k = 0; k < 2; k++) {
        this.part({ x: rx + (Math.random() - 0.5) * 6, y: ry + (Math.random() - 0.5) * 6, vx: -ca * (160 + Math.random() * 120) + (car.vx || 0) * 0.3 + (Math.random() - 0.5) * 50, vy: -sa * (160 + Math.random() * 120) + (car.vy || 0) * 0.3 + (Math.random() - 0.5) * 50, life: 0.35, max: 0.35, size: 3 + Math.random() * 3, col: Math.random() < 0.5 ? col : '#ffd27a', add: true, kind: 'flame', drag: 4 });
        if (Math.random() < 0.4) this.part({ x: rx, y: ry, vx: -ca * 60 + (Math.random() - 0.5) * 30, vy: -sa * 60 + (Math.random() - 0.5) * 30, life: 0.9, max: 0.9, size: 5, col: 'rgba(120,120,130,0.35)', kind: 'smoke', drag: 2 });
      }
    }
    if (vm.ar.night) {
      // headlight cones
      c.save(); c.globalCompositeOperation = 'lighter';
      const fx = car.x + ca * 20, fy = car.y + sa * 20;
      const g = c.createRadialGradient(fx, fy, 0, fx + ca * 40, fy + sa * 40, 80);
      g.addColorStop(0, `rgba(255,245,200,${0.22 * vm.ar.night * 2})`); g.addColorStop(1, 'rgba(255,245,200,0)');
      c.fillStyle = g;
      c.beginPath(); c.moveTo(fx, fy); c.arc(fx, fy, 110, car.a - 0.42, car.a + 0.42); c.closePath(); c.fill();
      const ug = c.createRadialGradient(car.x, car.y, 0, car.x, car.y, 34);
      ug.addColorStop(0, rgba(col, 0.35)); ug.addColorStop(1, rgba(col, 0));
      c.fillStyle = ug; c.beginPath(); c.arc(car.x, car.y, 34, 0, TAU); c.fill();
      c.restore();
    }
  }

  drawCar(c, car, i, vm) {
    const sp = this.carSprite(vm.players[i]);
    const fi = clamp(Math.round((car.steer || 0) * 2) + 2, 0, 4);
    const s = 1 + car.z / 90;
    c.save();
    c.translate(car.x, car.y - car.z * 0.15);
    c.rotate(car.a);
    let sxs = s, sys = s;
    if (car.hopT > 0 && car.flip) {
      const p = 1 - car.hopT / 0.6;
      if (car.flip === 2) sxs *= Math.cos(p * TAU); else sys *= Math.cos(p * TAU * (car.flip > 0 ? 1 : 1));
    }
    c.scale(sxs || 0.05, sys || 0.05);
    c.drawImage(sp.frames[fi], -sp.w / 2, -sp.h / 2, sp.w, sp.h);
    if (car.braking) {
      c.globalCompositeOperation = 'lighter';
      c.fillStyle = 'rgba(255,40,60,0.8)';
      for (const y of [-6.6, 6.6]) { c.beginPath(); c.arc(-19.3, y, 3.2, 0, TAU); c.fill(); }
    }
    c.restore();
  }

  drawBall(c, b, vm, dt) {
    const s = 1 + b.z / 240, R = BALL_R * s;
    const by = b.y - b.z * 0.15;
    // rolling orientation from motion
    if (this.lastBall) {
      const dx = b.x - this.lastBall[0], dy = b.y - this.lastBall[1], d = Math.hypot(dx, dy);
      if (d > 0.01 && d < 80) {
        const kx = -dy / d, ky = dx / d, th = d / BALL_R, co = Math.cos(th), si = Math.sin(th);
        this.ballM = this.ballM.map(([x, y, z]) => {
          const kv = kx * x + ky * y;
          const cx = ky * z, cy = -kx * z, cz = kx * y - ky * x;
          return [x * co + cx * si + kx * kv * (1 - co), y * co + cy * si + ky * kv * (1 - co), z * co + cz * si];
        });
      }
    }
    this.lastBall = [b.x, b.y];
    // trail
    const sp = Math.hypot(b.vx || 0, b.vy || 0);
    this.trail.push([b.x, by, sp]);
    if (this.trail.length > 14) this.trail.shift();
    if (sp > 420 && this.trail.length > 3) {
      const col = vm.lastTouch >= 0 ? PAINTS[vm.players[vm.lastTouch].paint].c : '#ffffff';
      c.save(); c.globalCompositeOperation = 'lighter'; c.lineCap = 'round';
      for (let k = 1; k < this.trail.length; k++) {
        const a = k / this.trail.length;
        c.strokeStyle = rgba(col, a * 0.5 * clamp((sp - 420) / 400, 0, 1));
        c.lineWidth = R * 1.6 * a;
        c.beginPath(); c.moveTo(this.trail[k - 1][0], this.trail[k - 1][1]); c.lineTo(this.trail[k][0], this.trail[k][1]); c.stroke();
      }
      c.restore();
    }
    // body
    const g = c.createRadialGradient(b.x - R * 0.35, by - R * 0.4, R * 0.1, b.x, by, R);
    g.addColorStop(0, '#ffffff'); g.addColorStop(0.7, '#e9edf3'); g.addColorStop(1, '#aab3c2');
    c.fillStyle = g; c.beginPath(); c.arc(b.x, by, R, 0, TAU); c.fill();
    // patches
    c.save();
    c.beginPath(); c.arc(b.x, by, R, 0, TAU); c.clip();
    c.fillStyle = '#20263a';
    for (const v of ICO) {
      const m = this.ballM;
      const x = m[0][0] * v[0] + m[0][1] * v[1] + m[0][2] * v[2];
      const y = m[1][0] * v[0] + m[1][1] * v[1] + m[1][2] * v[2];
      const z = m[2][0] * v[0] + m[2][1] * v[1] + m[2][2] * v[2];
      if (z < -0.1) continue;
      c.save();
      c.translate(b.x + x * R, by + y * R);
      c.rotate(Math.atan2(y, x));
      c.scale(Math.max(0.12, z), 1);
      const pr = R * 0.34;
      c.beginPath();
      for (let k = 0; k < 5; k++) { const a = k * TAU / 5; k ? c.lineTo(Math.cos(a) * pr, Math.sin(a) * pr) : c.moveTo(Math.cos(a) * pr, Math.sin(a) * pr); }
      c.closePath(); c.fill();
      c.restore();
    }
    c.restore();
    // shading + rim
    const sg = c.createRadialGradient(b.x - R * 0.3, by - R * 0.35, R * 0.2, b.x, by, R * 1.02);
    sg.addColorStop(0, 'rgba(255,255,255,0.0)'); sg.addColorStop(0.75, 'rgba(10,20,50,0.12)'); sg.addColorStop(1, 'rgba(10,20,50,0.45)');
    c.fillStyle = sg; c.beginPath(); c.arc(b.x, by, R, 0, TAU); c.fill();
    c.fillStyle = 'rgba(255,255,255,0.75)'; c.beginPath(); c.ellipse(b.x - R * 0.38, by - R * 0.42, R * 0.22, R * 0.14, -0.6, 0, TAU); c.fill();
    c.strokeStyle = 'rgba(0,0,0,0.45)'; c.lineWidth = 1; c.beginPath(); c.arc(b.x, by, R, 0, TAU); c.stroke();
    if (vm.ar.night) {
      c.save(); c.globalCompositeOperation = 'lighter';
      const gg = c.createRadialGradient(b.x, by, R * 0.8, b.x, by, R * 2.4);
      gg.addColorStop(0, 'rgba(180,220,255,0.25)'); gg.addColorStop(1, 'rgba(180,220,255,0)');
      c.fillStyle = gg; c.beginPath(); c.arc(b.x, by, R * 2.4, 0, TAU); c.fill(); c.restore();
    }
    // height marker when high in the air
    if (b.z > 40) { c.strokeStyle = 'rgba(255,255,255,0.35)'; c.setLineDash([3, 4]); c.beginPath(); c.moveTo(b.x, by + R); c.lineTo(b.x + b.z * 0.45, b.y + b.z * 0.55); c.stroke(); c.setLineDash([]); }
  }

  drawParticles(c, dt) {
    const ps = this.parts;
    let w = 0;
    for (let i = 0; i < ps.length; i++) {
      const p = ps[i];
      p.life -= dt;
      if (p.life <= 0) continue;
      const k = Math.exp(-p.drag * dt);
      p.vx *= k; p.vy *= k; p.vy += p.g * dt;
      p.x += p.vx * dt; p.y += p.vy * dt; p.rot += p.vr * dt;
      ps[w++] = p;
    }
    ps.length = w;
    for (const add of [false, true]) {
      c.save();
      if (add) c.globalCompositeOperation = 'lighter';
      for (const p of ps) {
        if (p.add !== add) continue;
        const a = clamp(p.life / (p.max || 1), 0, 1);
        switch (p.kind) {
          case 'spark': {
            c.strokeStyle = p.col; c.globalAlpha = a; c.lineWidth = p.size; c.lineCap = 'round';
            c.beginPath(); c.moveTo(p.x, p.y); c.lineTo(p.x - p.vx * 0.03, p.y - p.vy * 0.03); c.stroke();
            break;
          }
          case 'flame': {
            c.globalAlpha = a; c.fillStyle = p.col;
            c.beginPath(); c.arc(p.x, p.y, p.size * (0.5 + a * 0.7), 0, TAU); c.fill();
            break;
          }
          case 'smoke': {
            c.globalAlpha = a * 0.8; c.fillStyle = p.col;
            c.beginPath(); c.arc(p.x, p.y, p.size * (1.6 - a * 0.6), 0, TAU); c.fill();
            break;
          }
          case 'ring': {
            const r = p.size + (1 - a) * p.grow;
            c.globalAlpha = a; c.strokeStyle = p.col; c.lineWidth = (p.width || 3) * a + 0.5;
            c.beginPath(); c.arc(p.x, p.y, r, 0, TAU); c.stroke();
            break;
          }
          case 'confetti': {
            c.globalAlpha = clamp(p.life, 0, 1); c.fillStyle = p.col;
            c.save(); c.translate(p.x, p.y); c.rotate(p.rot); c.scale(1, Math.cos(p.rot * 1.7)); c.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2); c.restore();
            break;
          }
          case 'text': {
            c.globalAlpha = a; c.font = `14px ${FONT_D}`; c.textAlign = 'center';
            c.lineWidth = 4; c.strokeStyle = 'rgba(0,0,0,0.6)'; c.strokeText(p.text, p.x, p.y); c.fillStyle = p.col; c.fillText(p.text, p.x, p.y);
            break;
          }
          default: c.globalAlpha = a; c.fillStyle = p.col; c.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
        }
      }
      c.restore();
    }
  }

  // ---------------------------------- HUD -----------------------------------
  drawHUD(c, vm, dt) {
    if (vm.attract) return;
    const U = this.scale; // world px -> screen px
    const cols = vm.players.map((p) => PAINTS[p.paint].c);
    const cx = this.sw / 2;
    const top = Math.max(6 * this.dpr, this.oy - 4 * U);
    c.textBaseline = 'middle';
    // scoreboard
    const bh = 34 * U, y = top;
    c.save();
    c.shadowColor = 'rgba(0,0,0,0.5)'; c.shadowBlur = 10 * U;
    c.fillStyle = 'rgba(12,14,24,0.88)'; roundRectPath(c, cx - 232 * U, y, 464 * U, bh, 9 * U); c.fill();
    c.restore();
    const panelW = 150 * U;
    for (const side of [0, 1]) {
      const px = side === 0 ? cx - 75 * U - panelW : cx + 75 * U;
      const g = c.createLinearGradient(px, 0, px + panelW, 0);
      g.addColorStop(side === 0 ? 0 : 1, rgba(cols[side], 0)); g.addColorStop(side === 0 ? 1 : 0, rgba(cols[side], 0.85));
      c.fillStyle = g; roundRectPath(c, px, y + 3 * U, panelW, bh - 6 * U, 7 * U); c.fill();
      c.fillStyle = '#ffffff'; c.font = `600 ${12 * U}px ${FONT_T}`;
      c.textAlign = side === 0 ? 'left' : 'right';
      c.fillText(vm.players[side].name.slice(0, 14), side === 0 ? px + 12 * U : px + panelW - 12 * U, y + bh / 2);
      c.font = `${24 * U}px ${FONT_D}`; c.textAlign = 'center';
      c.fillText(String(vm.score[side]), side === 0 ? cx - 52 * U : cx + 52 * U, y + bh / 2 + 1 * U);
    }
    // clock
    const t = Math.max(0, vm.clock);
    const mm = Math.floor(Math.ceil(t) / 60), ss = Math.ceil(t) % 60;
    let clk = vm.overtime ? `+${Math.floor(t / 60)}:${String(Math.floor(t) % 60).padStart(2, '0')}` : `${mm}:${String(ss).padStart(2, '0')}`;
    const low = !vm.overtime && t <= 30 && vm.phase === 'play';
    c.font = `${16 * U}px ${FONT_D}`; c.textAlign = 'center';
    c.fillStyle = vm.overtime ? '#ff6b6b' : low ? (Math.floor(this.time * 3) % 2 ? '#ff6b6b' : '#ffffff') : '#ffffff';
    c.fillText(clk, cx, y + bh / 2 - (vm.overtime ? 4 * U : 0));
    if (vm.overtime) { c.font = `700 ${7 * U}px ${FONT_T}`; c.fillText('OVERTIME', cx, y + bh / 2 + 10 * U); }

    // boost gauges
    const gauges = vm.myIdx >= 0 ? [vm.myIdx] : [0, 1];
    for (const gi of gauges) {
      const car = vm.cars[gi];
      const left = vm.myIdx < 0 ? gi === 0 : false;
      const r = 34 * U;
      const gx = left ? this.ox + 50 * U : this.sw - this.ox - 50 * U;
      const gy = this.sh - this.oy - 4 * U - (this.oy < r ? r * 0.6 : 0);
      this.drawGauge(c, gx, Math.min(gy, this.sh - r - 8 * U), r, car.boost, cols[gi], U, car.boosting);
    }

    // emotes
    for (const e of this.emotes) {
      e.t += dt;
      const car = vm.cars[e.i];
      if (!car) continue;
      const [sx, sy] = this.toScreen(car.x, car.y - 36 - Math.min(e.t, 0.2) * 30);
      const a = e.t < 2.2 ? 1 : clamp(1 - (e.t - 2.2) / 0.4, 0, 1);
      c.globalAlpha = a;
      c.font = `700 ${11 * U}px ${FONT_T}`; c.textAlign = 'center';
      const w = c.measureText(e.text).width + 16 * U;
      c.fillStyle = 'rgba(255,255,255,0.95)'; roundRectPath(c, sx - w / 2, sy - 11 * U, w, 22 * U, 11 * U); c.fill();
      c.beginPath(); c.moveTo(sx - 5 * U, sy + 10 * U); c.lineTo(sx + 5 * U, sy + 10 * U); c.lineTo(sx, sy + 16 * U); c.fill();
      c.fillStyle = '#151827'; c.fillText(e.text, sx, sy + 1 * U);
      c.globalAlpha = 1;
    }
    this.emotes = this.emotes.filter((e) => e.t < 2.6);

    // name tags (online)
    vm.cars.forEach((car, i) => {
      if (vm.phase !== 'kickoff') return;
      const [sx, sy] = this.toScreen(car.x, car.y + 28);
      c.font = `700 ${10 * U}px ${FONT_T}`; c.textAlign = 'center';
      c.fillStyle = 'rgba(0,0,0,0.55)'; const w = c.measureText(vm.players[i].name).width + 12 * U;
      roundRectPath(c, sx - w / 2, sy - 8 * U, w, 16 * U, 8 * U); c.fill();
      c.fillStyle = cols[i]; c.fillText(vm.players[i].name, sx, sy);
      if (vm.myIdx === i) { c.fillStyle = '#ffffff'; c.font = `${8 * U}px ${FONT_D}`; c.fillText('YOU', sx, sy + 15 * U); }
    });

    // countdown
    if (vm.phase === 'kickoff') {
      const n = Math.ceil(vm.phaseT);
      const frac = vm.phaseT - Math.floor(vm.phaseT);
      const sc = 1 + frac * 0.6;
      c.save(); c.translate(cx, this.sh * 0.42); c.scale(sc, sc);
      c.font = `${70 * U}px ${FONT_D}`; c.textAlign = 'center';
      c.lineWidth = 8 * U; c.strokeStyle = 'rgba(0,0,0,0.55)'; c.strokeText(String(Math.max(1, n)), 0, 0);
      c.fillStyle = '#ffffff'; c.fillText(String(Math.max(1, n)), 0, 0);
      c.restore();
      if (this.lastCount !== n) { this.lastCount = n; }
    }
    if (vm.phase === 'play' && this.prevPhase === 'kickoff') this.goT = 0.8;
    if (this.goT > 0) {
      this.goT -= dt;
      c.save(); c.translate(cx, this.sh * 0.42); const sc = 1 + (0.8 - this.goT) * 0.8; c.scale(sc, sc);
      c.globalAlpha = clamp(this.goT / 0.4, 0, 1);
      c.font = `${70 * U}px ${FONT_D}`; c.textAlign = 'center';
      c.fillStyle = '#ffd25a'; c.fillText('GO!', 0, 0);
      c.restore();
    }
    this.prevPhase = vm.phase;

    // banners (goal / overtime)
    if (this.banner) {
      const b = this.banner;
      b.t += dt;
      const dur = b.kind === 'goal' ? 2.6 : 2.2;
      if (b.t > dur) this.banner = null;
      else {
        const pin = clamp(b.t / 0.25, 0, 1), out = clamp((dur - b.t) / 0.35, 0, 1);
        const ease = 1 - Math.pow(1 - pin, 3);
        c.save();
        c.globalAlpha = out;
        c.translate(cx, this.sh * 0.4);
        const sc = (0.4 + ease * 0.6) * (1 + Math.sin(b.t * 8) * 0.015);
        c.scale(sc, sc); c.rotate(-0.04);
        c.font = `${92 * U}px ${FONT_D}`; c.textAlign = 'center';
        c.lineWidth = 14 * U; c.strokeStyle = 'rgba(0,0,0,0.6)'; c.strokeText(b.text, 0, 0);
        const g = c.createLinearGradient(0, -50 * U, 0, 40 * U);
        g.addColorStop(0, '#ffffff'); g.addColorStop(0.55, shade(b.col, 0.35)); g.addColorStop(1, b.col);
        c.fillStyle = g; c.fillText(b.text, 0, 0);
        c.rotate(0.04);
        c.font = `700 ${18 * U}px ${FONT_T}`;
        c.lineWidth = 6 * U; c.strokeText(b.sub, 0, 62 * U);
        c.fillStyle = '#ffffff'; c.fillText(b.sub, 0, 62 * U);
        c.restore();
      }
    }
    // replay overlay
    if (vm.replay) {
      c.fillStyle = 'rgba(0,0,0,0.35)'; c.fillRect(0, 0, this.sw, 40 * U * 0.6); c.fillRect(0, this.sh - 40 * U * 0.6, this.sw, 40 * U * 0.6);
      c.font = `${16 * U}px ${FONT_D}`; c.textAlign = 'left';
      c.fillStyle = Math.floor(this.time * 2) % 2 ? '#ff3b3b' : '#7a1111';
      c.beginPath(); c.arc(this.ox + 30 * U, top + 60 * U, 7 * U, 0, TAU); c.fill();
      c.fillStyle = '#ffffff'; c.fillText('REPLAY', this.ox + 44 * U, top + 61 * U);
      c.font = `600 ${10 * U}px ${FONT_T}`; c.textAlign = 'center'; c.fillStyle = 'rgba(255,255,255,0.8)';
      c.fillText('Press SPACE / ENTER to skip', cx, this.sh - this.oy - 6 * U);
    }
    // ping
    if (vm.ping != null) {
      c.font = `600 ${8 * U}px ${FONT_T}`; c.textAlign = 'left';
      const ms = Math.round(vm.ping * 1000);
      c.fillStyle = ms < 90 ? 'rgba(140,255,160,0.8)' : ms < 180 ? 'rgba(255,220,120,0.8)' : 'rgba(255,120,120,0.85)';
      c.fillText(`${ms} ms`, this.ox + 8 * U, this.sh - Math.max(this.oy, 14 * U) + 2 * U);
    }
    if (vm.hint && vm.phase === 'kickoff') {
      c.font = `600 ${10 * U}px ${FONT_T}`; c.textAlign = 'center'; c.fillStyle = 'rgba(255,255,255,0.9)';
      const lines = vm.hint;
      lines.forEach((ln, k) => {
        const yy = this.sh * 0.62 + k * 16 * U;
        const w = c.measureText(ln).width + 20 * U;
        c.fillStyle = 'rgba(0,0,0,0.5)'; roundRectPath(c, cx - w / 2, yy - 8 * U, w, 16 * U, 8 * U); c.fill();
        c.fillStyle = 'rgba(255,255,255,0.92)'; c.fillText(ln, cx, yy);
      });
    }
  }

  drawGauge(c, x, y, r, boost, col, U, on) {
    c.save();
    c.fillStyle = 'rgba(10,12,22,0.8)'; c.beginPath(); c.arc(x, y, r, 0, TAU); c.fill();
    c.lineWidth = 6 * U; c.strokeStyle = 'rgba(255,255,255,0.12)';
    const a0 = Math.PI * 0.75, a1 = Math.PI * 2.25;
    c.beginPath(); c.arc(x, y, r - 7 * U, a0, a1); c.stroke();
    const f = clamp(boost / 100, 0, 1);
    const g = c.createLinearGradient(x - r, y, x + r, y);
    g.addColorStop(0, '#ff7a1a'); g.addColorStop(1, '#ffd23a');
    c.strokeStyle = g; c.lineCap = 'round';
    if (on) { c.shadowColor = '#ffb03a'; c.shadowBlur = 12 * U; }
    if (f > 0.001) { c.beginPath(); c.arc(x, y, r - 7 * U, a0, a0 + (a1 - a0) * f); c.stroke(); }
    c.shadowBlur = 0;
    c.fillStyle = '#ffffff'; c.font = `${18 * U}px ${FONT_D}`; c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillText(String(Math.round(boost)), x, y - 1 * U);
    c.font = `700 ${6.5 * U}px ${FONT_T}`; c.fillStyle = col; c.fillText('BOOST', x, y + 15 * U);
    c.restore();
  }
}
