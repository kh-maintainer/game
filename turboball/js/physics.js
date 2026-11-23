'use strict';
// ---------------------------------------------------------------------------
// Physics shared by the host simulation and the guest's local prediction:
// arena walls, arcade car handling, ball flight, and the collisions between
// them. Everything is plain objects so states can be copied over the network.
// ---------------------------------------------------------------------------

// The arena outline is a closed polyline (rounded corners + goal pockets).
// Each segment stores its inward-facing normal.
const ARENA_PTS = (() => {
  const F = FIELD, R = F.corner, pts = [];
  const arc = (cx, cy, a0, a1) => {
    const n = 12;
    for (let i = 0; i <= n; i++) { const a = a0 + (a1 - a0) * i / n; pts.push([cx + Math.cos(a) * R, cy + Math.sin(a) * R]); }
  };
  arc(F.l + R, F.t + R, Math.PI, Math.PI * 1.5);
  arc(F.r - R, F.t + R, Math.PI * 1.5, Math.PI * 2);
  pts.push([F.r, F.goalT], [F.r + F.depth, F.goalT], [F.r + F.depth, F.goalB], [F.r, F.goalB]);
  arc(F.r - R, F.b - R, 0, Math.PI * 0.5);
  arc(F.l + R, F.b - R, Math.PI * 0.5, Math.PI);
  pts.push([F.l, F.goalB], [F.l - F.depth, F.goalB], [F.l - F.depth, F.goalT], [F.l, F.goalT]);
  return pts;
})();

const ARENA_SEGS = ARENA_PTS.map((p, i) => {
  const q = ARENA_PTS[(i + 1) % ARENA_PTS.length];
  const dx = q[0] - p[0], dy = q[1] - p[1], len = Math.hypot(dx, dy) || 1;
  return { x1: p[0], y1: p[1], dx, dy, il2: 1 / (len * len), nx: -dy / len, ny: dx / len };
}).filter((s) => s.il2 < 1e6);

const Hit = { nx: 0, ny: 0, x: 0, y: 0 };

// Push a circle (o.x, o.y, o.vx, o.vy) out of the walls, bouncing with
// restitution e. Returns the strongest impact speed (0 if none).
function collideArena(o, r, e, fr) {
  let impact = 0;
  for (let pass = 0; pass < 2; pass++) {
    for (let i = 0; i < ARENA_SEGS.length; i++) {
      const s = ARENA_SEGS[i];
      let t = ((o.x - s.x1) * s.dx + (o.y - s.y1) * s.dy) * s.il2;
      t = t < 0 ? 0 : t > 1 ? 1 : t;
      const cx = s.x1 + s.dx * t, cy = s.y1 + s.dy * t;
      const ddx = o.x - cx, ddy = o.y - cy, d2 = ddx * ddx + ddy * ddy;
      if (d2 >= r * r) continue;
      let d = Math.sqrt(d2), nx, ny;
      if (d < 1e-6) { nx = s.nx; ny = s.ny; d = 0; } else { nx = ddx / d; ny = ddy / d; }
      if (t > 0 && t < 1 && nx * s.nx + ny * s.ny < 0) { nx = s.nx; ny = s.ny; d = -d; } // tunnelled: push back inside
      const pen = r - d;
      o.x += nx * pen; o.y += ny * pen;
      const vn = o.vx * nx + o.vy * ny;
      if (vn < 0) {
        o.vx -= (1 + e) * vn * nx; o.vy -= (1 + e) * vn * ny;
        if (fr) { const vt = -o.vx * ny + o.vy * nx; o.vx += ny * vt * fr; o.vy -= nx * vt * fr; }
        if (-vn > impact) { impact = -vn; Hit.nx = nx; Hit.ny = ny; Hit.x = cx; Hit.y = cy; }
      }
    }
  }
  return impact;
}

// ------------------------------- cars --------------------------------------
function makeCar(i) {
  return {
    i, x: 0, y: 0, a: 0, vx: 0, vy: 0, z: 0, vz: 0,
    steer: 0, throttle: 0, boost: 33, boosting: false, braking: false,
    hopCd: 0, hopT: 0, flip: 0, drift: 0, remote: false,
  };
}

function placeCar(c, spot, mirror) {
  c.x = mirror ? W - spot.x : spot.x;
  c.y = mirror ? H - spot.y : spot.y;
  c.a = mirror ? spot.a + Math.PI : spot.a;
  c.vx = c.vy = c.z = c.vz = 0;
  c.steer = 0; c.boosting = false; c.hopCd = 0; c.hopT = 0;
}

const NO_INPUT = { throttle: 0, steer: 0, boost: false, hop: false };
const _circle = { x: 0, y: 0, vx: 0, vy: 0 };

// Advance one car by dt. `ev` collects events (hop, land, wall) when given.
function stepCar(c, inp, dt, ar, ev) {
  const fx = Math.cos(c.a), fy = Math.sin(c.a);
  let sf = c.vx * fx + c.vy * fy, sl = -c.vx * fy + c.vy * fx;
  c.steer += (inp.steer - c.steer) * Math.min(1, dt * 14);
  c.throttle = inp.throttle;
  const air = c.z > 0.01;
  const t = inp.throttle;
  c.braking = false;
  if (!air) {
    if (t > 0.05) {
      if (sf < -15) { sf += CAR.brake * t * dt; c.braking = true; }
      else if (sf < CAR.max) sf = Math.min(CAR.max, sf + CAR.accel * t * dt * (1 - Math.max(0, sf) / CAR.max * 0.45));
    } else if (t < -0.05) {
      if (sf > 15) { sf -= CAR.brake * -t * dt; c.braking = true; }
      else if (sf > -CAR.reverseMax) sf = Math.max(-CAR.reverseMax, sf + CAR.accel * 0.75 * t * dt);
    } else sf -= sf * Math.min(1, 1.3 * dt);
    sl *= Math.exp(-ar.grip * dt);
  } else {
    sf *= Math.exp(-0.15 * dt);
  }
  if (inp.boost && c.boost > 0) {
    c.boosting = true;
    c.boost = Math.max(0, c.boost - CAR.boostUse * dt);
    sf = Math.min(CAR.boostMax, sf + CAR.boostAccel * dt * (air ? 0.6 : 1));
  } else c.boosting = false;
  if (!c.boosting && sf > CAR.max) sf -= (sf - CAR.max) * Math.min(1, 1.6 * dt);
  c.drift = Math.abs(sl);

  // steering: turn rate scales with speed; the velocity follows the nose
  const sp = Math.abs(sf);
  let da;
  if (air) da = c.steer * CAR.airTurn * dt;
  else da = c.steer * CAR.turn * clamp(sp / 130, 0, 1) * (1 - clamp((sp - CAR.max) / 700, 0, 0.3)) * dt * (sf >= 0 ? 1 : -1);
  c.a += da;
  let vx = fx * sf - fy * sl, vy = fy * sf + fx * sl;
  const follow = air ? 0 : (ar.ice ? 0.3 : 0.85);
  const ra = da * follow, cr = Math.cos(ra), sr = Math.sin(ra);
  c.vx = vx * cr - vy * sr; c.vy = vx * sr + vy * cr;

  // hop (with a little steer/back flip)
  if (inp.hop && c.hopCd <= 0 && !air) {
    c.vz = CAR.hopV; c.z = 0.02; c.hopCd = CAR.hopCd; c.hopT = 0.6;
    let dir = c.a + c.steer * 0.85;
    c.flip = c.steer > 0.3 ? 1 : c.steer < -0.3 ? -1 : 0;
    if (t < -0.5) { dir = c.a + Math.PI; c.flip = 2; }
    c.vx += Math.cos(dir) * CAR.hopPush; c.vy += Math.sin(dir) * CAR.hopPush;
    if (ev) ev.push({ k: 'hop', i: c.i, x: r1(c.x), y: r1(c.y) });
  }
  c.hopCd = Math.max(0, c.hopCd - dt);
  c.hopT = Math.max(0, c.hopT - dt);
  if (c.z > 0 || c.vz > 0) {
    c.vz -= CAR.gravity * dt; c.z += c.vz * dt;
    if (c.z <= 0) { c.z = 0; c.vz = 0; if (ev) ev.push({ k: 'land', i: c.i, x: r1(c.x), y: r1(c.y) }); }
  }
  c.x += c.vx * dt; c.y += c.vy * dt;
  carWalls(c, ev);
}

function carWalls(c, ev) {
  const fx = Math.cos(c.a), fy = Math.sin(c.a);
  let best = 0;
  for (let s = -1; s <= 1; s += 2) {
    _circle.x = c.x + fx * CAR.circOff * s; _circle.y = c.y + fy * CAR.circOff * s;
    _circle.vx = c.vx; _circle.vy = c.vy;
    const ox = _circle.x, oy = _circle.y;
    const imp = collideArena(_circle, CAR.circR, 0.25, 0.04);
    c.x += _circle.x - ox; c.y += _circle.y - oy;
    c.vx = _circle.vx; c.vy = _circle.vy;
    if (imp > best) best = imp;
  }
  if (ev && best > 140) ev.push({ k: 'cwall', i: c.i, s: Math.round(best), x: r1(Hit.x), y: r1(Hit.y) });
  return best;
}

// ------------------------------- ball --------------------------------------
const BALL_G = 720;
function makeBall() { return { x: CX, y: CY, z: 0, vx: 0, vy: 0, vz: 0 }; }

// Returns { wall, bounce } impact speeds for sound/fx.
function stepBall(b, dt, ar) {
  let bounce = 0;
  if (b.z > 0 || b.vz > 0) {
    b.vz -= BALL_G * dt; b.z += b.vz * dt;
    if (b.z <= 0) {
      b.z = 0;
      if (b.vz < -90) { bounce = -b.vz; b.vz = -b.vz * 0.55; } else b.vz = 0;
    }
  }
  const k = Math.exp(-(b.z > 0 ? 0.08 : ar.ballDrag) * dt);
  b.vx *= k; b.vy *= k;
  const sp = Math.hypot(b.vx, b.vy);
  if (sp > 1100) { b.vx *= 1100 / sp; b.vy *= 1100 / sp; }
  b.x += b.vx * dt; b.y += b.vy * dt;
  const wall = collideArena(b, BALL_R, ar.wallE, 0.02);
  return { wall, bounce };
}

// Ball vs car body (oriented box). Moves/kicks the ball; optionally nudges
// the car. Returns hit strength (0 = no contact).
function ballCarHit(b, c, moveCar) {
  if (b.z > c.z + CAR.height || b.z + BALL_R * 2 < c.z) return 0;
  const ca = Math.cos(c.a), sa = Math.sin(c.a);
  const dx = b.x - c.x, dy = b.y - c.y;
  const lx = dx * ca + dy * sa, ly = -dx * sa + dy * ca;
  const qx = clamp(lx, -CAR.hl, CAR.hl), qy = clamp(ly, -CAR.hw, CAR.hw);
  let nlx, nly, d;
  if (lx === qx && ly === qy) {
    const px = CAR.hl - Math.abs(lx), py = CAR.hw - Math.abs(ly);
    if (px < py) { nlx = Math.sign(lx) || 1; nly = 0; d = -px; } else { nlx = 0; nly = Math.sign(ly) || 1; d = -py; }
  } else {
    const ex = lx - qx, ey = ly - qy;
    d = Math.hypot(ex, ey);
    if (d >= BALL_R) return 0;
    nlx = ex / d; nly = ey / d;
  }
  const nx = nlx * ca - nly * sa, ny = nlx * sa + nly * ca;
  const pen = BALL_R - d;
  b.x += nx * pen; b.y += ny * pen;
  collideArena(b, BALL_R, 0.5, 0); // never let a car shove the ball through a wall
  const rvn = (b.vx - c.vx) * nx + (b.vy - c.vy) * ny;
  if (rvn >= 0) return 0;
  const j = -(1 + 0.4) * rvn;
  const carN = c.vx * nx + c.vy * ny;
  const hopping = c.hopT > 0;
  const bonus = Math.max(0, carN) * (0.22 + (hopping ? 0.45 : 0)) + (c.boosting ? 30 : 0);
  let str = j + bonus;
  // cap how fast the ball can leave relative to the car (stops "ping-pong" energy gain)
  const vbn = b.vx * nx + b.vy * ny;
  const maxOut = Math.max(0, carN) * 1.45 + 300;
  if (vbn + str > maxOut) str = Math.max(0, maxOut - vbn);
  b.vx += nx * str; b.vy += ny * str;
  if (str > 150 || hopping) b.vz = Math.max(b.vz, Math.min(430, Math.max(0, str - 150) * 0.45 + (hopping ? 170 : 0)));
  if (moveCar) { c.vx -= nx * j * 0.06; c.vy -= ny * j * 0.06; }
  return str;
}

// Overlap test only (no response).
function ballCarTouch(b, c) {
  if (b.z > c.z + CAR.height || b.z + BALL_R * 2 < c.z) return false;
  const ca = Math.cos(c.a), sa = Math.sin(c.a);
  const dx = b.x - c.x, dy = b.y - c.y;
  const lx = dx * ca + dy * sa, ly = -dx * sa + dy * ca;
  const ex = lx - clamp(lx, -CAR.hl, CAR.hl), ey = ly - clamp(ly, -CAR.hw, CAR.hw);
  return ex * ex + ey * ey < (BALL_R + 1) * (BALL_R + 1);
}

// Both cars squeeze the ball at once (classic kickoff 50/50): instead of
// letting whichever car is processed second launch it, pop it up between
// them. Deterministic so host and guest agree.
function ballPinch(b, c0, c1) {
  const avx = (c0.vx + c1.vx) / 2, avy = (c0.vy + c1.vy) / 2;
  const dx = c1.x - c0.x, dy = c1.y - c0.y, d = Math.hypot(dx, dy) || 1;
  const side = (b.x - (c0.x + c1.x) / 2) * -dy / d + (b.y - (c0.y + c1.y) / 2) * dx / d;
  const s = side >= 0 ? 1 : -1;
  b.vx = avx * 0.5 - dy / d * 140 * s;
  b.vy = avy * 0.5 + dx / d * 140 * s;
  b.vz = Math.max(b.vz, 380);
  b.z = Math.max(b.z, CAR.height + c0.z * 0 + 1);
}

// Car vs car (two circles each). shareA/shareB say how much of the response
// each side applies (a remote car is moved by its own client, not us).
function carCarHit(a, b, shareA, shareB) {
  if (Math.abs(a.z - b.z) > CAR.height) return 0;
  const fa = [Math.cos(a.a), Math.sin(a.a)], fb = [Math.cos(b.a), Math.sin(b.a)];
  let bestPen = 0, nx = 0, ny = 0;
  for (let s = -1; s <= 1; s += 2) {
    const ax = a.x + fa[0] * CAR.circOff * s, ay = a.y + fa[1] * CAR.circOff * s;
    for (let u = -1; u <= 1; u += 2) {
      const bx = b.x + fb[0] * CAR.circOff * u, by = b.y + fb[1] * CAR.circOff * u;
      const dx = ax - bx, dy = ay - by, d = Math.hypot(dx, dy);
      const pen = CAR.circR * 2 - d;
      if (pen > bestPen) { bestPen = pen; nx = d > 1e-6 ? dx / d : 1; ny = d > 1e-6 ? dy / d : 0; }
    }
  }
  if (bestPen <= 0) return 0;
  a.x += nx * bestPen * shareA; a.y += ny * bestPen * shareA;
  b.x -= nx * bestPen * shareB; b.y -= ny * bestPen * shareB;
  const rv = (a.vx - b.vx) * nx + (a.vy - b.vy) * ny;
  if (rv >= 0) return 0;
  const j = -(1 + 0.45) * rv / 2;
  if (shareA) { a.vx += nx * j; a.vy += ny * j; }
  if (shareB) { b.vx -= nx * j; b.vy -= ny * j; }
  return -rv;
}

// Which goal (if any) the ball is fully inside: 0 = left goal, 1 = right goal.
function goalCheck(b) {
  if (b.x < FIELD.l - BALL_R * 1.05) return 0;
  if (b.x > FIELD.r + BALL_R * 1.05) return 1;
  return -1;
}

// Free ball prediction (no cars), used by the bot and guest correction.
function predictBall(b, t, ar, step = 1 / 60) {
  const p = { x: b.x, y: b.y, z: b.z, vx: b.vx, vy: b.vy, vz: b.vz };
  for (let s = 0; s < t; s += step) { stepBall(p, step, ar); if (goalCheck(p) >= 0) break; }
  return p;
}
