'use strict';
// ---------------------------------------------------------------------------
// Sessions wrap a match for the app:
//   HostSession  - runs the Match (solo vs bot, couch 2P, attract mode, or as
//                  the online host streaming snapshots to the guest).
//   GuestSession - the online guest. Drives its own car locally (instant
//                  controls), predicts the ball locally and blends toward the
//                  host's authoritative ball; the host car is interpolated.
// Both expose update(dt, inputs) and vm() (the view model the renderer draws).
// ---------------------------------------------------------------------------

const SNAP_EVERY = 2; // ticks per snapshot (30 Hz)

class Recorder {
  constructor() { this.f = []; }
  push(t, cars, ball, live) {
    this.f.push({
      t,
      c: cars.map((c) => ({ x: c.x, y: c.y, a: c.a, z: c.z, steer: c.steer, boosting: c.boosting, hopT: c.hopT, flip: c.flip, braking: c.braking, vx: c.vx, vy: c.vy, boost: c.boost, throttle: c.throttle })),
      b: { x: ball.x, y: ball.y, z: ball.z, vx: ball.vx, vy: ball.vy },
      bl: live,
    });
    while (this.f.length && this.f[0].t < t - 6) this.f.shift();
  }
  slice(t0, t1) { return this.f.filter((f) => f.t >= t0 && f.t <= t1); }
}

function startReplay(frames, duration) {
  if (frames.length < 2) return null;
  const t0 = frames[0].t, t1 = frames[frames.length - 1].t;
  return { frames, t: t0, t0, t1, speed: (t1 - t0) / Math.max(0.5, duration), i: 0 };
}
function replayFrame(r, dt) {
  r.t = Math.min(r.t1, r.t + dt * r.speed);
  while (r.i < r.frames.length - 2 && r.frames[r.i + 1].t <= r.t) r.i++;
  return r.frames[r.i];
}

class Pinger {
  constructor(link) { this.link = link; this.t = 0; this.rtt = 0.08; }
  update(dt) {
    this.t -= dt;
    if (this.t <= 0 && this.link) { this.t = 1; this.link.send({ t: 'ping', ts: performance.now() }); }
  }
  onMsg(m) {
    if (m.t === 'ping') { this.link.send({ t: 'pong', ts: m.ts }); return true; }
    if (m.t === 'pong') { const r = (performance.now() - m.ts) / 1000; this.rtt = this.rtt * 0.7 + r * 0.3; return true; }
    return false;
  }
}

class HostSession {
  // o: { mode: 'bot'|'local'|'online'|'attract', arena, length, players, level, link, seed, hooks }
  constructor(o) {
    this.mode = o.mode;
    this.hooks = o.hooks || {};
    this.seed = o.seed || (Math.random() * 1e9) | 0;
    this.match = new Match({ arena: o.arena, length: o.length, players: o.players, seed: this.seed, remote: o.mode === 'online' });
    this.bots = [null, null];
    if (o.mode === 'attract') { this.bots[0] = new Bot(0, 2, this.seed); this.bots[1] = new Bot(1, 1 + (this.seed % 2), this.seed + 1); }
    if (o.mode === 'bot') this.bots[1] = new Bot(1, o.level, this.seed + 1);
    this.myIdx = o.mode === 'bot' || o.mode === 'online' ? 0 : -1;
    this.acc = 0;
    this.tickN = 0;
    this.netEv = [];
    this.rec = new Recorder();
    this.replay = null;
    this.lastRemote = null;
    this.paused = false;
    this.link = o.link || null;
    this.ping = new Pinger(this.link);
    this.remoteDisp = null;
    if (this.link) this.link.onMessage = (m) => this.onNet(m);
  }

  onNet(m) {
    if (this.ping.onMsg(m)) return;
    switch (m.t) {
      case 'c': this.lastRemote = m; this.lastRemoteAt = performance.now(); break;
      case 'emote': if (this.hooks.emote) this.hooks.emote(1, m.i); break;
      case 'skip': this.match.skipReplay(); break;
      default: if (this.hooks.net) this.hooks.net(m);
    }
  }

  emote(i) { if (this.link) this.link.send({ t: 'emote', i }); }
  skipReplay() { this.match.skipReplay(); }

  update(dt, inputs) {
    if (this.link) this.ping.update(dt);
    if (this.paused) return;
    this.acc += Math.min(dt, 0.1);
    while (this.acc >= TICK) { this.acc -= TICK; this.tick(inputs); }
    if (this.replay) replayFrame(this.replay, dt);
    // smooth the remote car for display
    const rc = this.match.cars[1];
    if (rc.remote) {
      if (!this.remoteDisp) this.remoteDisp = Object.assign({}, rc);
      const d = this.remoteDisp, k = Math.min(1, dt * 22);
      const far = Math.hypot(rc.x - d.x, rc.y - d.y) > 60;
      Object.assign(d, rc, far ? {} : { x: lerp(d.x, rc.x, k), y: lerp(d.y, rc.y, k), a: d.a + angDiff(d.a, rc.a) * k });
    }
  }

  tick(inputs) {
    const m = this.match;
    if (this.lastRemote) m.setRemote(this.lastRemote, Math.min(0.15, this.ping.rtt / 2 + (performance.now() - this.lastRemoteAt) / 1000));
    const ins = [inputs[0] || NO_INPUT, inputs[1] || NO_INPUT];
    for (const b of this.bots) if (b) ins[b.i] = b.input(m);
    m.step(TICK, ins);
    const ev = m.events;
    m.events = [];
    for (const e of ev) this.handle(e);
    if (this.link) {
      for (const e of ev) this.netEv.push(e);
      if (++this.tickN % SNAP_EVERY === 0) {
        const s = m.snapshot();
        s.ev = this.netEv;
        this.netEv = [];
        this.link.send(s);
      }
    }
    this.rec.push(m.time, m.cars, m.ball, m.ballLive);
  }

  handle(e) {
    if (e.k === 'replay') this.replay = startReplay(this.rec.slice(e.t0, e.t1), 4.2);
    if (e.k === 'reset') { this.replay = null; this.remoteDisp = null; }
    if (e.k === 'goal' && this.bots[1] && this.mode === 'bot' && Math.random() < 0.45) {
      const bot = this.bots[1];
      setTimeout(() => this.hooks.emote && this.hooks.emote(1, e.i === 1 ? bot.pickEmote(Math.random) : (Math.random() < 0.5 ? 0 : 3)), 700);
    }
    if (this.hooks.fx) this.hooks.fx(e);
  }

  vm() {
    const m = this.match;
    const base = {
      ar: m.ar, players: m.players, myIdx: this.myIdx, score: m.score, clock: m.clock, overtime: m.overtime,
      phase: m.phase, phaseT: m.phaseT, pads: m.pads, lastTouch: m.lastTouch, time: m.time,
      ping: this.link ? this.ping.rtt : null,
    };
    if (this.replay && m.phase === 'replay') {
      const f = this.replay.frames[this.replay.i];
      return Object.assign(base, { cars: f.c, ball: f.b, ballLive: f.bl, replay: true });
    }
    const cars = m.cars[1].remote && this.remoteDisp ? [m.cars[0], this.remoteDisp] : m.cars;
    return Object.assign(base, { cars, ball: m.ball, ballLive: m.ballLive, replay: false });
  }
}

class GuestSession {
  // o: { start: {arena, length, players, seed}, link, hooks }
  constructor(o) {
    const s = o.start;
    this.ar = arenaById(s.arena);
    this.players = s.players;
    this.length = s.length;
    this.hooks = o.hooks || {};
    this.link = o.link;
    this.myIdx = 1;
    this.me = makeCar(1);
    this.other = makeCar(0);
    placeCar(this.other, KICKOFFS[0], false);
    placeCar(this.me, KICKOFFS[0], true);
    this.ball = makeBall();
    this.ballLive = true;
    this.pads = PADS.map(() => 0);
    this.phase = 'kickoff';
    this.phaseT = 3;
    this.clock = s.length;
    this.overtime = false;
    this.score = [0, 0];
    this.lastTouch = -1;
    this.time = 0;
    this.resetSeq = 0;
    this.buf = [];
    this.srv = null;
    this.srvT = 0;
    this.hostTime = 0;
    this.hostTimeAt = 0;
    this.lastLocalHit = -9;
    this.rec = new Recorder();
    this.replay = null;
    this.ping = new Pinger(this.link);
    this.localEv = [];
    this.gotSnap = false;
    this.link.onMessage = (m) => this.onNet(m);
  }

  onNet(m) {
    if (this.ping.onMsg(m)) return;
    switch (m.t) {
      case 's': this.onSnap(m); break;
      case 'emote': if (this.hooks.emote) this.hooks.emote(0, m.i); break;
      default: if (this.hooks.net) this.hooks.net(m);
    }
  }

  emote(i) { this.link.send({ t: 'emote', i }); }
  skipReplay() { this.link.send({ t: 'skip' }); }
  hostNow() { return this.hostTime + (this.time - this.hostTimeAt); }

  onSnap(s) {
    this.gotSnap = true;
    this.hostTime = s.tm; this.hostTimeAt = this.time;
    for (const e of s.ev || []) this.handle(e);
    this.phase = s.ph; this.phaseT = s.pt; this.clock = s.ck; this.overtime = !!s.ot;
    this.score = s.sc; this.lastTouch = s.lt;
    for (let k = 0; k < PADS.length; k++) {
      const active = (s.pd >> k) & 1;
      if (active) this.pads[k] = 0; else if (this.pads[k] <= 0) this.pads[k] = PADS[k].big ? PAD_RESPAWN.big : PAD_RESPAWN.small;
    }
    const c = s.c;
    this.buf.push({ t: this.time, x: c[0], y: c[1], a: c[2], vx: c[3], vy: c[4], z: c[5], steer: c[6], boosting: !!c[7], boost: c[8], hopT: c[9], braking: !!c[10], flip: c[11], throttle: c[12] });
    while (this.buf.length > 2 && this.buf[1].t < this.time - 1) this.buf.shift();
    const wasLive = this.ballLive;
    this.ballLive = !!s.bl;
    this.srv = { x: s.b[0], y: s.b[1], z: s.b[2], vx: s.b[3], vy: s.b[4], vz: s.b[5] };
    this.srvT = this.time;
    if (this.ballLive && !wasLive) Object.assign(this.ball, this.srv);
  }

  handle(e) {
    switch (e.k) {
      case 'reset':
        this.resetSeq = e.seq;
        this.me.x = e.c[1][0]; this.me.y = e.c[1][1]; this.me.a = e.c[1][2];
        this.me.vx = this.me.vy = this.me.z = this.me.vz = 0; this.me.boost = 33; this.me.hopT = 0; this.me.hopCd = 0;
        Object.assign(this.ball, makeBall());
        this.replay = null;
        break;
      case 'pad':
        if (e.i === 1) this.me.boost = Math.min(100, this.me.boost + (PADS[e.p].big ? PAD_AMOUNT.big : PAD_AMOUNT.small));
        break;
      case 'hit':
        if (e.i === 1 && this.time - this.lastLocalHit < 0.5) e.dup = true;
        break;
      case 'replay':
        this.replay = startReplay(this.rec.slice(e.t0, e.t1), 4.0);
        break;
      case 'hop': case 'land': case 'cwall':
        if (e.i === 1) return; // we already played our own
        break;
    }
    if (this.hooks.fx) this.hooks.fx(e);
  }

  sampleOther(t) {
    const b = this.buf;
    if (!b.length) return;
    let i = b.length - 1;
    while (i > 0 && b[i - 1].t > t) i--;
    const B = b[i], A = b[Math.max(0, i - 1)];
    let k = A === B ? 1 : clamp((t - A.t) / (B.t - A.t || 1), 0, 1.5);
    const o = this.other;
    Object.assign(o, B);
    o.x = A.x + (B.x - A.x) * k; o.y = A.y + (B.y - A.y) * k; o.z = A.z + (B.z - A.z) * k;
    o.a = A.a + angDiff(A.a, B.a) * k;
    o.i = 0;
  }

  update(dt, inputs) {
    dt = Math.min(dt, 0.1);
    this.time += dt;
    this.ping.update(dt);
    const me = this.me, inp = inputs[0] || NO_INPUT;
    const drive = this.phase === 'play' || this.phase === 'goal' || this.phase === 'over';
    const ev = this.localEv; ev.length = 0;
    if (drive) {
      const before = me.boost;
      stepCar(me, inp, dt / 2, this.ar, ev);
      stepCar(me, inp, dt / 2, this.ar, ev);
      this.boostUsed = (this.boostUsed || 0) + Math.max(0, before - me.boost);
    } else {
      me.vx = me.vy = 0;
      me.steer = (inp.steer || 0) * 0.3;
      me.boosting = this.phase === 'kickoff' && !!inp.boost;
    }
    // host car: interpolate a little in the past for smoothness, then predict
    // it forward to "now" so 50/50s against it are fair
    this.sampleOther(this.time - 0.05);
    if (drive && this.buf.length) {
      const o = this.other, lead = Math.min(0.15, 0.05 + this.ping.rtt / 2);
      o.x += o.vx * lead; o.y += o.vy * lead;
      carWalls(o, null);
    }
    const bump = carCarHit(me, this.other, 0.5, 0);
    if (bump > 120) ev.push({ k: 'bump', s: Math.round(bump), x: r1((me.x + this.other.x) / 2), y: r1((me.y + this.other.y) / 2) });

    if (this.ballLive && this.srv && this.phase !== 'replay') {
      const b = this.ball;
      for (let s = 0; s < 2; s++) {
        stepBall(b, dt / 2, this.ar);
        const h = ballCarHit(b, me, true);
        if (h > 0) {
          if (this.time - this.lastLocalHit > 0.25) ev.push({ k: 'hit', i: 1, s: Math.round(h), x: r1(b.x), y: r1(b.y), local: 1 });
          this.lastLocalHit = this.time;
        }
        ballCarHit(b, this.other, false);
      }
      // blend toward the host's ball (advanced to "now")
      if (this.time - this.lastLocalHit > this.ping.rtt + 0.15) {
        const p = predictBall(this.srv, (this.time - this.srvT) + this.ping.rtt / 2, this.ar);
        const ex = p.x - b.x, ey = p.y - b.y;
        if (ex * ex + ey * ey > 110 * 110) Object.assign(b, p);
        else {
          const k = Math.min(1, dt * 9);
          b.x += ex * k; b.y += ey * k; b.z += (p.z - b.z) * k;
          b.vx += (p.vx - b.vx) * k; b.vy += (p.vy - b.vy) * k; b.vz += (p.vz - b.vz) * k;
        }
      }
    }
    for (const e of ev) if (this.hooks.fx) this.hooks.fx(e);
    for (let k = 0; k < this.pads.length; k++) if (this.pads[k] > 0) this.pads[k] = Math.max(0.01, this.pads[k] - dt);

    this.link.send({
      t: 'c', seq: this.resetSeq, x: r1(me.x), y: r1(me.y), a: r3(me.a), vx: r1(me.vx), vy: r1(me.vy), z: r1(me.z), vz: r1(me.vz),
      st: r3(me.steer), bo: me.boosting ? 1 : 0, bm: r1(me.boost), hp: r3(me.hopT), br: me.braking ? 1 : 0, fl: me.flip, th: r3(me.throttle),
    });
    this.rec.push(this.hostNow(), [this.other, me], this.ball, this.ballLive);
    if (this.replay) replayFrame(this.replay, dt);
  }

  vm() {
    const base = {
      ar: this.ar, players: this.players, myIdx: 1, score: this.score, clock: this.clock, overtime: this.overtime,
      phase: this.phase, phaseT: this.phaseT, pads: this.pads, lastTouch: this.lastTouch, time: this.time, ping: this.ping.rtt,
    };
    if (this.replay && this.phase === 'replay') {
      const f = this.replay.frames[this.replay.i];
      return Object.assign(base, { cars: f.c, ball: f.b, ballLive: f.bl, replay: true });
    }
    return Object.assign(base, { cars: [this.other, this.me], ball: this.ball, ballLive: this.ballLive, replay: false });
  }
}
