'use strict';
// ---------------------------------------------------------------------------
// Match: the authoritative game state. Runs on the host (or locally for bot
// and couch games). Car 1 can be "remote": its position comes from the guest
// and the match only reads it (for ball hits, pads and bumps).
// ---------------------------------------------------------------------------

const mkStats = () => ({ goals: 0, shots: 0, saves: 0, touches: 0, topHit: 0, boostUsed: 0, assists: 0 });

class Match {
  constructor(o) {
    this.ar = arenaById(o.arena);
    this.length = o.length;
    this.players = o.players; // [{name, paint, body}, ...]
    this.rng = RNG(o.seed || 1);
    this.cars = [makeCar(0), makeCar(1)];
    this.cars[1].remote = !!o.remote;
    this.remoteSeq = -1;
    this.ball = makeBall();
    this.ballLive = true;
    this.pads = PADS.map(() => 0);
    this.score = [0, 0];
    this.clock = o.length;
    this.overtime = false;
    this.time = 0;
    this.events = [];
    this.resetSeq = 0;
    this.lastTouch = -1;
    this.stats = [mkStats(), mkStats()];
    this.shot = null;
    this.winner = -1;
    this.goalTime = 0;
    this.kickoffCount = 0;
    this.kickoff();
  }

  emit(e) { this.events.push(e); }

  kickoff() {
    const spot = this.kickoffCount === 0 ? KICKOFFS[0] : KICKOFFS[this.rng.int(KICKOFFS.length)];
    this.kickoffCount++;
    placeCar(this.cars[0], spot, false);
    placeCar(this.cars[1], spot, true);
    for (const c of this.cars) if (!c.remote) c.boost = 33;
    Object.assign(this.ball, makeBall());
    this.ballLive = true;
    this.lastTouch = -1;
    this.shot = null;
    this.phase = 'kickoff';
    this.phaseT = 3;
    this.resetSeq++;
    const c0 = this.cars[0], c1 = this.cars[1];
    this.emit({ k: 'reset', seq: this.resetSeq, c: [[r1(c0.x), r1(c0.y), r3(c0.a)], [r1(c1.x), r1(c1.y), r3(c1.a)]] });
  }

  // Guest-reported state for a remote car.
  // `lead` = seconds to extrapolate (lag compensation: the report is
  // one-way-latency old, so move the car to where it is "now").
  setRemote(st, lead = 0) {
    if (st.seq < this.resetSeq) return; // stale: from before the last kickoff reset
    const c = this.cars[1];
    const frozen = this.phase === 'kickoff' || this.phase === 'replay';
    const k = frozen ? 0 : lead;
    c.x = st.x + st.vx * k; c.y = st.y + st.vy * k; c.a = st.a; c.vx = st.vx; c.vy = st.vy; c.z = st.z; c.vz = st.vz;
    if (k > 0) carWalls(c, null);
    c.steer = st.st; c.boosting = !!st.bo; c.boost = st.bm; c.hopT = st.hp; c.braking = !!st.br; c.flip = st.fl;
    c.throttle = st.th;
    this.remoteSeq = st.seq;
  }

  step(dt, inputs) {
    this.time += dt;
    for (let k = 0; k < this.pads.length; k++) if (this.pads[k] > 0) this.pads[k] = Math.max(0, this.pads[k] - dt);
    switch (this.phase) {
      case 'kickoff': {
        this.phaseT -= dt;
        for (const c of this.cars) if (!c.remote) { c.vx = c.vy = 0; c.steer = inputs[c.i] ? inputs[c.i].steer * 0.3 : 0; c.boosting = !!(inputs[c.i] && inputs[c.i].boost); }
        if (this.phaseT <= 0) { this.phase = 'play'; this.emit({ k: 'go' }); }
        break;
      }
      case 'play': {
        if (this.overtime) this.clock += dt;
        else {
          this.clock -= dt;
          if (this.clock <= 0) {
            this.clock = 0;
            if (this.score[0] !== this.score[1]) { this.end(); break; }
            this.overtime = true;
            this.emit({ k: 'overtime' });
          }
        }
        this.physics(dt, inputs);
        break;
      }
      case 'goal': {
        this.phaseT -= dt;
        const slow = this.phaseT > 1.6 ? 0.35 : 1;
        this.physics(dt * slow, inputs);
        if (this.phaseT <= 0) {
          if (this.overtime || (this.clock <= 0 && this.score[0] !== this.score[1])) this.end();
          else { this.phase = 'replay'; this.phaseT = 4.4; this.emit({ k: 'replay', t0: r3(this.goalTime - 3.0), t1: r3(this.goalTime + 0.35) }); }
        }
        break;
      }
      case 'replay': {
        this.phaseT -= dt;
        if (this.phaseT <= 0) this.kickoff();
        break;
      }
      case 'over': {
        this.physics(dt, inputs);
        break;
      }
    }
  }

  skipReplay() { if (this.phase === 'replay' && this.phaseT > 0.3) this.phaseT = 0.3; }

  end() {
    this.phase = 'over';
    this.phaseT = 0;
    this.ballLive = false;
    this.winner = this.score[0] > this.score[1] ? 0 : this.score[1] > this.score[0] ? 1 : -1;
    this.emit({ k: 'over', w: this.winner, sc: this.score.slice(), stats: this.stats });
  }

  physics(dt, inputs) {
    const ar = this.ar, cars = this.cars, b = this.ball;
    const subs = 2, h = dt / subs;
    for (let s = 0; s < subs; s++) {
      for (const c of cars) {
        if (c.remote) continue;
        const before = c.boost;
        stepCar(c, inputs[c.i] || NO_INPUT, h, ar, this.events);
        if (c.boost < before) this.stats[c.i].boostUsed += before - c.boost;
      }
      const bump = carCarHit(cars[0], cars[1], 0.5, cars[1].remote ? 0 : 0.5);
      if (bump > 120) this.emit({ k: 'bump', s: Math.round(bump), x: r1((cars[0].x + cars[1].x) / 2), y: r1((cars[0].y + cars[1].y) / 2) });

      if (!this.ballLive) continue;
      const r = stepBall(b, h, ar);
      if (r.wall > 160) {
        const nearGoal = Math.abs(b.y - CY) < 110 && (b.x < FIELD.l + 40 || b.x > FIELD.r - 40);
        this.emit({ k: 'wall', s: Math.round(r.wall), x: r1(Hit.x), y: r1(Hit.y), post: nearGoal ? 1 : 0 });
      }
      if (r.bounce > 140) this.emit({ k: 'bounce', s: Math.round(r.bounce), x: r1(b.x), y: r1(b.y) });
      const t0 = ballCarTouch(b, cars[0]), t1 = ballCarTouch(b, cars[1]);
      const lh = this.lastHitT || (this.lastHitT = [-9, -9]);
      const squeeze = (t0 && t1) ||
        (t0 && this.time - lh[1] < 0.15 && this.lastTouch === 1) ||
        (t1 && this.time - lh[0] < 0.15 && this.lastTouch === 0);
      if (squeeze && Math.hypot(cars[0].x - cars[1].x, cars[0].y - cars[1].y) < 90) {
        ballPinch(b, cars[0], cars[1]);
        this.emit({ k: 'hit', i: 0, s: 400, x: r1(b.x), y: r1(b.y), pinch: 1 });
        this.lastTouch = -1;
      } else {
        // alternate processing order so neither player gets the "second hit"
        const order = (this.subN = (this.subN || 0) + 1) & 1 ? [cars[0], cars[1]] : [cars[1], cars[0]];
        for (const c of order) {
          const str = ballCarHit(b, c, !c.remote);
          if (str > 0) this.touch(c.i, str);
        }
      }
      const g = goalCheck(b);
      if (g >= 0) { this.goal(1 - g); break; }
    }
    // boost pads
    for (const c of cars) {
      if (c.z > 12) continue;
      for (let k = 0; k < PADS.length; k++) {
        if (this.pads[k] > 0) continue;
        const p = PADS[k], rr = p.big ? 24 : 18;
        if ((c.x - p.x) ** 2 + (c.y - p.y) ** 2 > rr * rr) continue;
        if (c.boost >= 99.5) continue;
        this.pads[k] = p.big ? PAD_RESPAWN.big : PAD_RESPAWN.small;
        if (!c.remote) c.boost = Math.min(100, c.boost + (p.big ? PAD_AMOUNT.big : PAD_AMOUNT.small));
        this.emit({ k: 'pad', i: c.i, p: k });
      }
    }
  }

  touch(i, str) {
    const st = this.stats[i], b = this.ball;
    st.touches++;
    (this.lastHitT || (this.lastHitT = [-9, -9]))[i] = this.time;
    const sp = Math.hypot(b.vx, b.vy);
    if (sp > st.topHit) st.topHit = sp;
    this.emit({ k: 'hit', i, s: Math.round(str), x: r1(b.x), y: r1(b.y) });
    const prevTouch = this.lastTouch;
    this.lastTouch = i;
    this.lastTouchT = this.time;
    const p = predictBall(b, 1.6, this.ar, 1 / 30);
    const g = goalCheck(p);
    // A save: the other player had a shot on target and we stopped it.
    if (this.shot && this.shot.by !== i && this.time - this.shot.t < 2.5 && g !== i) {
      this.stats[i].saves++;
      this.emit({ k: 'save', i });
      this.shot = null;
    }
    if (g === 1 - i && (!this.shot || this.shot.by !== i || this.time - this.shot.t > 1)) {
      this.stats[i].shots++;
      this.shot = { by: i, t: this.time };
    }
    if (prevTouch !== i) this.prevToucher = prevTouch;
  }

  goal(scorer) {
    const b = this.ball;
    this.score[scorer]++;
    const og = this.lastTouch !== scorer && this.lastTouch !== -1;
    if (!og) this.stats[scorer].goals++;
    if (!og && this.shot && this.shot.by === scorer) { /* already counted */ } else if (!og) this.stats[scorer].shots++;
    const sp = Math.round(Math.hypot(b.vx, b.vy) * KMH);
    this.emit({ k: 'goal', i: scorer, x: r1(b.x), y: r1(b.y), sp, og: og ? 1 : 0, sc: this.score.slice() });
    this.ballLive = false;
    this.phase = 'goal';
    this.phaseT = 2.8;
    this.goalTime = this.time;
    this.shot = null;
  }

  // Compact state for the guest.
  snapshot() {
    const b = this.ball, c = this.cars[0];
    let pd = 0;
    for (let k = 0; k < this.pads.length; k++) if (this.pads[k] <= 0) pd |= 1 << k;
    return {
      t: 's', tm: r3(this.time), ph: this.phase, pt: r1(this.phaseT), ck: r1(this.clock), ot: this.overtime ? 1 : 0,
      sc: this.score, bl: this.ballLive ? 1 : 0, lt: this.lastTouch, pd, seq: this.resetSeq,
      b: [r1(b.x), r1(b.y), r1(b.z), r1(b.vx), r1(b.vy), r1(b.vz)],
      c: [r1(c.x), r1(c.y), r3(c.a), r1(c.vx), r1(c.vy), r1(c.z), r3(c.steer), c.boosting ? 1 : 0, Math.round(c.boost), r3(c.hopT), c.braking ? 1 : 0, c.flip, r3(c.throttle)],
    };
  }
}
