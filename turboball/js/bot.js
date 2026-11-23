'use strict';
// ---------------------------------------------------------------------------
// Bot driver. Reads the match state and produces the same input a human
// would: throttle, steer, boost, hop. Three skill levels.
// ---------------------------------------------------------------------------

const BOT_LEVELS = [
  { name: 'Rookie', react: 0.32, boost: 0.25, hop: 0.12, throttle: 0.82, err: 34, defend: 0.4 },
  { name: 'Pro', react: 0.16, boost: 0.7, hop: 0.45, throttle: 1, err: 14, defend: 0.8 },
  { name: 'Legend', react: 0.07, boost: 1, hop: 0.85, throttle: 1, err: 4, defend: 1 },
];

class Bot {
  constructor(i, level, seed) {
    this.i = i;
    this.lv = BOT_LEVELS[clamp(level, 0, 2)];
    this.rng = RNG(seed || 7 + i);
    this.think = 0;
    this.target = { x: CX, y: CY };
    this.mode = 'chase';
    this.stuckT = 0;
    this.revT = 0;
    this.errX = 0; this.errY = 0;
    this.shooting = false;
  }

  input(m, dt = TICK) {
    const i = this.i, me = m.cars[i], b = m.ball, lv = this.lv;
    const dir = i === 0 ? 1 : -1;                  // +x is "forward" for player 0
    const attackX = i === 0 ? FIELD.r + 30 : FIELD.l - 30;
    const ownX = i === 0 ? FIELD.l : FIELD.r;
    const out = { throttle: 0, steer: 0, boost: false, hop: false };
    if (m.phase === 'replay') return out;

    this.think -= dt;
    if (this.think <= 0) {
      this.think = lv.react * (0.7 + this.rng() * 0.6);
      this.plan(m, me, b, dir, attackX, ownX);
    }
    if (!m.ballLive && m.phase !== 'kickoff') {
      // goal celebration / end: cruise around
      this.target = { x: CX + Math.cos(m.time * 0.7 + i * 3) * 220, y: CY + Math.sin(m.time * 0.9 + i) * 140 };
    }

    const tx = this.target.x + this.errX, ty = this.target.y + this.errY;
    const dx = tx - me.x, dy = ty - me.y, dist = Math.hypot(dx, dy);
    const want = Math.atan2(dy, dx);
    const diff = angDiff(me.a, want);
    const speed = Math.hypot(me.vx, me.vy);

    if (this.revT > 0) {
      this.revT -= dt;
      out.throttle = -1; out.steer = -Math.sign(diff) || 1;
      return out;
    }
    if (Math.abs(diff) > 2.4 && dist < 150) {
      out.throttle = -1; out.steer = -Math.sign(diff);
    } else {
      out.throttle = (Math.abs(diff) > 1.3 ? 0.5 : 1) * lv.throttle;
      out.steer = clamp(diff * 3.2, -1, 1);
    }
    // stuck against a wall?
    if (out.throttle > 0.4 && speed < 25 && m.phase === 'play') {
      this.stuckT += dt;
      if (this.stuckT > 0.7) { this.revT = 0.55; this.stuckT = 0; }
    } else this.stuckT = 0;

    const bd = Math.hypot(b.x - me.x, b.y - me.y);
    if (m.phase === 'kickoff') { out.boost = lv.boost > 0.5; out.throttle = 1; }
    else if (me.boost > 0 && Math.abs(diff) < 0.28) {
      const far = dist > 200 && this.rng() < lv.boost;
      const shot = this.shooting && bd < 150 && this.rng() < lv.boost;
      const urgent = this.mode === 'defend' && this.rng() < lv.boost;
      out.boost = far || shot || urgent || (m.phase === 'play' && this.mode === 'chase' && bd > 120 && this.boostHold);
    }
    if (m.ballLive && bd < 58 && me.hopCd <= 0 && me.z <= 0) {
      const ahead = Math.abs(angDiff(me.a, Math.atan2(b.y - me.y, b.x - me.x))) < 0.6;
      if (ahead && (b.z > 8 || this.shooting) && this.rng() < lv.hop * 0.25) out.hop = true;
    }
    return out;
  }

  plan(m, me, b, dir, attackX, ownX) {
    const lv = this.lv;
    this.errX = (this.rng() - 0.5) * lv.err * 2;
    this.errY = (this.rng() - 0.5) * lv.err * 2;
    this.boostHold = this.rng() < lv.boost * 0.5;
    if (m.phase === 'kickoff' || (m.phase === 'play' && Math.hypot(b.vx, b.vy) < 1 && Math.abs(b.x - CX) < 2 && Math.abs(b.y - CY) < 2)) {
      this.mode = 'chase'; this.shooting = true;
      this.target = { x: b.x - dir * 12, y: b.y };
      return;
    }
    const sp = Math.max(240, Math.hypot(me.vx, me.vy));
    const d0 = Math.hypot(b.x - me.x, b.y - me.y);
    let t = clamp(d0 / (sp + 140), 0, 1.4);
    let pb = predictBall(b, t, m.ar, 1 / 30);
    t = clamp(Math.hypot(pb.x - me.x, pb.y - me.y) / (sp + 140), 0, 1.4);
    pb = predictBall(b, t, m.ar, 1 / 30);

    // danger: the ball is flying towards our goal
    const towardOwn = b.vx * -dir > 120;
    const inOwnHalf = (b.x - CX) * dir < 0;
    const future = predictBall(b, 1.4, m.ar, 1 / 30);
    const threat = goalCheck(future) === this.i || (towardOwn && inOwnHalf && Math.abs(future.x - ownX) < 140);

    // are we goal-side of the ball (between it and our own goal)?
    const behind = (pb.x - me.x) * dir > -6;
    const gx = attackX, gy = clamp(pb.y, FIELD.goalT + 30, FIELD.goalB - 30);
    let gdx = gx - pb.x, gdy = gy - pb.y; const gl = Math.hypot(gdx, gdy) || 1; gdx /= gl; gdy /= gl;

    // grab boost when low and nothing urgent
    if (me.boost < 22 && !threat && d0 > 220) {
      let best = null, bd = 1e9;
      for (let k = 0; k < PADS.length; k++) {
        if (m.pads[k] > 0.5) continue;
        const p = PADS[k], d = Math.hypot(p.x - me.x, p.y - me.y) + (p.big ? 0 : 90);
        if (d < bd && d < 300) { bd = d; best = p; }
      }
      if (best) { this.mode = 'boost'; this.shooting = false; this.target = { x: best.x, y: best.y }; return; }
    }

    if (threat && !behind && this.rng() < lv.defend) {
      // race back to the goal-side post
      this.mode = 'defend'; this.shooting = false;
      this.target = { x: ownX + dir * 55, y: clamp(future.y, FIELD.goalT + 10, FIELD.goalB - 10) };
      if ((me.x - ownX) * dir < 90) this.target = { x: pb.x - dir * 20, y: pb.y }; // already home: clear it
      else this.avoid(me, b, dir);
      return;
    }
    // the rival will get there first and is lined up: shadow between ball and our goal
    const foe = m.cars[1 - this.i];
    const fd = Math.hypot(b.x - foe.x, b.y - foe.y);
    const foeBehind = (pb.x - foe.x) * -dir > 0;
    if (foeBehind && fd < d0 * 0.55 && d0 > 140 && this.rng() < lv.defend) {
      this.mode = "shadow"; this.shooting = false;
      const sx = lerp(pb.x, ownX, 0.55), sy = lerp(pb.y, CY, 0.5);
      this.target = { x: sx, y: sy };
      this.avoid(me, b, dir);
      return;
    }
    if (behind) {
      this.mode = 'chase'; this.shooting = true;
      const off = d0 > 120 ? BALL_R + 26 : BALL_R + 4;
      this.target = { x: pb.x - gdx * off, y: pb.y - gdy * off };
    } else {
      // wrong side: loop around the ball on the side we're already on
      this.mode = 'recover'; this.shooting = false;
      let side = me.y < pb.y ? -1 : 1;
      let ty = pb.y + side * 85;
      if (ty < FIELD.t + 30 || ty > FIELD.b - 30) { side = -side; ty = pb.y + side * 85; } // no room: go round the other way
      this.target = { x: pb.x - dir * 100, y: clamp(ty, FIELD.t + 30, FIELD.b - 30) };
      // don't plough through the ball on the way: if it sits on our path, aim wider
      const tx = this.target.x - me.x, tyy = this.target.y - me.y, tl = Math.hypot(tx, tyy) || 1;
      const u = clamp(((b.x - me.x) * tx + (b.y - me.y) * tyy) / (tl * tl), 0, 1);
      const px = me.x + tx * u - b.x, py = me.y + tyy * u - b.y;
      if (px * px + py * py < 50 * 50) this.target = { x: me.x + (me.x < b.x ? -1 : 1) * 0 + -dir * 60, y: clamp(b.y + side * 120, FIELD.t + 30, FIELD.b - 30) };
    }
  }

  // When driving back toward our own goal, never go through the ball.
  avoid(me, b, dir) {
    const tx = this.target.x - me.x, ty = this.target.y - me.y, tl = Math.hypot(tx, ty) || 1;
    if (tx * dir > 0) return; // heading upfield: hitting the ball is fine
    const u = clamp(((b.x - me.x) * tx + (b.y - me.y) * ty) / (tl * tl), 0, 1);
    const px = me.x + tx * u - b.x, py = me.y + ty * u - b.y;
    if (px * px + py * py < 55 * 55) {
      const side = (me.y < b.y) ? -1 : 1;
      this.target = { x: b.x - dir * 10, y: clamp(b.y + side * 90, FIELD.t + 25, FIELD.b - 25) };
    }
  }

  pickEmote(rng) { return rng() < 0.5 ? 0 : (rng() < 0.5 ? 2 : 4); }
}
