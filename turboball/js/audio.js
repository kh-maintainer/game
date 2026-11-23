'use strict';
// ---------------------------------------------------------------------------
// Audio: every sound is synthesized with WebAudio (no files). Sound effects,
// per-car engine hum, a live crowd bed, and the music sequencer (music.js).
// ---------------------------------------------------------------------------

const Snd = {
  ctx: null, master: null, sfx: null, musicBus: null, duck: null, verb: null, noise: null,
  engines: [], crowd: null, crowdLevel: 0.15, crowdTarget: 0.15, enabled: false,

  init() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = this.ctx = new AC();
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14; comp.ratio.value = 4; comp.attack.value = 0.004; comp.release.value = 0.2;
    comp.connect(ctx.destination);
    this.master = ctx.createGain(); this.master.gain.value = 0.9; this.master.connect(comp);
    this.sfx = ctx.createGain(); this.sfx.connect(this.master);
    this.musicBus = ctx.createGain(); this.musicBus.connect(this.master);
    // reverb (generated impulse)
    this.verb = ctx.createConvolver();
    const len = ctx.sampleRate * 2.2, ir = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) { const d = ir.getChannelData(ch); for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3.2); }
    this.verb.buffer = ir;
    const vg = ctx.createGain(); vg.gain.value = 0.32; this.verb.connect(vg); vg.connect(this.master);
    // white noise buffer
    const nl = ctx.sampleRate * 2;
    this.noise = ctx.createBuffer(1, nl, ctx.sampleRate);
    const nd = this.noise.getChannelData(0);
    for (let i = 0; i < nl; i++) nd[i] = Math.random() * 2 - 1;
    this.applyVolumes();
    this.startCrowd();
    this.enabled = true;
    Music.init(ctx, this.musicBus, this.verb);
  },

  applyVolumes() {
    if (!this.ctx) return;
    const s = Settings.data;
    this.sfx.gain.value = s.sfx;
    this.musicBus.gain.value = s.music * 0.8;
  },

  now() { return this.ctx.currentTime; },
  pan(x) { return clamp((x - W / 2) / (W / 2), -1, 1) * 0.6; },

  out(x, wet) {
    const ctx = this.ctx;
    let node = this.sfx;
    if (x != null && ctx.createStereoPanner) {
      const p = ctx.createStereoPanner(); p.pan.value = this.pan(x); p.connect(this.sfx);
      if (wet) { const w = ctx.createGain(); w.gain.value = wet; p.connect(w); w.connect(this.verb); }
      node = p;
    }
    return node;
  },

  noiseSrc() { const n = this.ctx.createBufferSource(); n.buffer = this.noise; n.loop = true; n.loopStart = Math.random(); return n; },

  tone(type, f0, f1, dur, vol, dest, t0 = 0, attack = 0.004) {
    const ctx = this.ctx, t = ctx.currentTime + t0;
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(f0, t);
    if (f1 && f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(dest); o.start(t); o.stop(t + dur + 0.05);
  },

  burst(filter, freq, q, dur, vol, dest, t0 = 0, f1) {
    const ctx = this.ctx, t = ctx.currentTime + t0;
    const n = this.noiseSrc(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    f.type = filter; f.frequency.setValueAtTime(freq, t); f.Q.value = q;
    if (f1) f.frequency.exponentialRampToValueAtTime(f1, t + dur);
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    n.connect(f); f.connect(g); g.connect(dest); n.start(t); n.stop(t + dur + 0.05);
  },

  play(name, o = {}) {
    if (!this.enabled) return;
    const x = o.x, s = o.s || 0;
    switch (name) {
      case 'hit': {
        const k = clamp(s / 900, 0.15, 1);
        const d = this.out(x, 0.15 * k);
        this.tone('sine', 150 + k * 60, 55, 0.18 + k * 0.1, 0.55 * k + 0.15, d);
        this.burst('bandpass', 900 + k * 1500, 1.2, 0.07, 0.35 * k + 0.1, d);
        if (k > 0.55) this.tone('triangle', 420, 160, 0.12, 0.18 * k, d);
        break;
      }
      case 'wall': {
        const k = clamp(s / 800, 0.1, 1), d = this.out(x, 0.25 * k);
        this.burst('lowpass', 500 + k * 600, 0.8, 0.16, 0.45 * k, d);
        this.tone('sine', 90, 50, 0.16, 0.35 * k, d);
        break;
      }
      case 'post': {
        const d = this.out(x, 0.5);
        for (const f of [523, 1046, 1568]) this.tone('triangle', f, f * 0.99, 0.9, 0.08, d);
        this.burst('lowpass', 800, 0.8, 0.12, 0.35, d);
        break;
      }
      case 'bounce': { const k = clamp(s / 500, 0.1, 1), d = this.out(x); this.tone('sine', 120, 60, 0.12, 0.3 * k, d); break; }
      case 'cwall': { const k = clamp(s / 500, 0.15, 1), d = this.out(x); this.burst('bandpass', 300, 1, 0.14, 0.3 * k, d); this.tone('square', 70, 45, 0.08, 0.08 * k, d); break; }
      case 'bump': {
        const k = clamp(s / 500, 0.2, 1), d = this.out(x, 0.2);
        this.burst('bandpass', 1800, 2, 0.1, 0.35 * k, d); this.tone('square', 180, 90, 0.09, 0.12 * k, d); this.tone('sine', 80, 40, 0.2, 0.4 * k, d);
        break;
      }
      case 'hop': { const d = this.out(x); this.tone('square', 260, 520, 0.12, 0.06, d); this.burst('highpass', 2500, 0.7, 0.12, 0.1, d); break; }
      case 'land': { const d = this.out(x); this.burst('lowpass', 400, 0.7, 0.1, 0.2, d); break; }
      case 'pad': {
        const d = this.out(x, 0.2);
        if (o.big) { [0, 0.06, 0.12].forEach((t, i) => this.tone('square', [523, 659, 988][i], null, 0.12, 0.07, d, t)); this.burst('highpass', 3000, 0.5, 0.35, 0.08, d, 0, 9000); }
        else { this.tone('square', 784, 1175, 0.09, 0.06, d); }
        break;
      }
      case 'boost': { const d = this.out(x); this.burst('bandpass', 400, 0.9, 0.35, 0.22, d, 0, 2400); break; }
      case 'goal': {
        const d = this.out(x, 0.6);
        this.burst('lowpass', 1800, 0.5, 1.4, 0.9, d, 0, 120);
        this.tone('sine', 110, 30, 1.0, 0.9, d);
        this.tone('sawtooth', 70, 35, 0.8, 0.25, d);
        // stadium horn
        const h = this.out(null, 0.5);
        for (const f of [196, 247, 294, 392]) this.tone('sawtooth', f, f, 1.6, 0.045, h, 0.15, 0.05);
        this.cheer(1);
        break;
      }
      case 'beep': this.tone('square', 660, 660, 0.14, 0.09, this.out(null, 0.2)); break;
      case 'go': this.tone('square', 990, 990, 0.42, 0.1, this.out(null, 0.3)); this.tone('square', 495, 495, 0.42, 0.06, this.out(null)); break;
      case 'whistle': {
        const d = this.out(null, 0.4), ctx = this.ctx, t = ctx.currentTime;
        for (const [st, dur] of [[0, 0.22], [0.3, 0.22], [0.6, 0.9]]) {
          const o1 = ctx.createOscillator(), g = ctx.createGain(), lfo = ctx.createOscillator(), lg = ctx.createGain();
          o1.type = 'sine'; o1.frequency.value = 2650; lfo.frequency.value = 38; lg.gain.value = 140;
          lfo.connect(lg); lg.connect(o1.frequency);
          g.gain.setValueAtTime(0.0001, t + st); g.gain.exponentialRampToValueAtTime(0.12, t + st + 0.02); g.gain.setValueAtTime(0.12, t + st + dur - 0.04); g.gain.exponentialRampToValueAtTime(0.0001, t + st + dur);
          o1.connect(g); g.connect(d); o1.start(t + st); lfo.start(t + st); o1.stop(t + st + dur + 0.05); lfo.stop(t + st + dur + 0.05);
        }
        break;
      }
      case 'ui': this.tone('triangle', 880, 1320, 0.06, 0.07, this.out(null)); break;
      case 'hover': this.tone('triangle', 1200, 1200, 0.03, 0.03, this.out(null)); break;
      case 'emote': this.tone('sine', 700, 1050, 0.1, 0.08, this.out(x)); this.tone('sine', 1050, 1400, 0.1, 0.06, this.out(x), 0.08); break;
      case 'save': this.cheer(0.55); this.tone('triangle', 660, 990, 0.25, 0.06, this.out(x)); break;
      case 'ooh': this.ooh(); break;
      case 'overtime': [0, 0.18, 0.36].forEach((t) => this.tone('sawtooth', 220, 220, 0.16, 0.08, this.out(null, 0.4), t)); break;
    }
  },

  // ---------------- crowd ----------------
  startCrowd() {
    const ctx = this.ctx;
    const n = this.noiseSrc();
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 900; bp.Q.value = 0.6;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 2200;
    const g = ctx.createGain(); g.gain.value = 0;
    // slow random murmur modulation
    const lfo = ctx.createOscillator(), lg = ctx.createGain(); lfo.frequency.value = 0.27; lg.gain.value = 0.25;
    lfo.connect(lg);
    n.connect(bp); bp.connect(lp); lp.connect(g); g.connect(this.sfx);
    const w = ctx.createGain(); w.gain.value = 0.4; g.connect(w); w.connect(this.verb);
    n.start(); lfo.start();
    this.crowd = { g, bp };
  },
  setCrowd(level) { this.crowdTarget = level; },
  cheer(k) { this.crowdLevel = Math.max(this.crowdLevel, 0.25 + k * 0.75); },
  ooh() {
    if (!this.enabled) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const n = this.noiseSrc(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    f.type = 'bandpass'; f.Q.value = 3; f.frequency.setValueAtTime(500, t); f.frequency.linearRampToValueAtTime(800, t + 0.4); f.frequency.linearRampToValueAtTime(420, t + 1.2);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.5, t + 0.25); g.gain.exponentialRampToValueAtTime(0.0001, t + 1.3);
    n.connect(f); f.connect(g); g.connect(this.sfx); g.connect(this.verb); n.start(t); n.stop(t + 1.4);
  },

  // ---------------- engines ----------------
  // Called every frame with the cars that should hum (empty array = silence).
  updateEngines(cars, dt) {
    if (!this.enabled) return;
    const ctx = this.ctx;
    while (this.engines.length < cars.length) {
      const o = ctx.createOscillator(), o2 = ctx.createOscillator(), f = ctx.createBiquadFilter(), g = ctx.createGain();
      const p = ctx.createStereoPanner ? ctx.createStereoPanner() : ctx.createGain();
      o.type = 'sawtooth'; o2.type = 'square'; f.type = 'lowpass'; f.frequency.value = 400; f.Q.value = 2;
      g.gain.value = 0;
      const bn = this.noiseSrc(), bf = ctx.createBiquadFilter(), bg = ctx.createGain();
      bf.type = 'bandpass'; bf.frequency.value = 700; bf.Q.value = 0.8; bg.gain.value = 0;
      o.connect(f); o2.connect(f); f.connect(g); g.connect(p); bn.connect(bf); bf.connect(bg); bg.connect(p); p.connect(this.sfx);
      o.start(); o2.start(); bn.start();
      this.engines.push({ o, o2, f, g, p, bg, bf });
    }
    const t = ctx.currentTime;
    for (let i = 0; i < this.engines.length; i++) {
      const e = this.engines[i], c = cars[i];
      if (!c) { e.g.gain.setTargetAtTime(0, t, 0.08); e.bg.gain.setTargetAtTime(0, t, 0.08); continue; }
      const sp = Math.hypot(c.vx || 0, c.vy || 0);
      const rev = clamp(sp / CAR.boostMax, 0, 1);
      const base = 48 + rev * 120 + (c.throttle > 0.1 ? 14 : 0);
      e.o.frequency.setTargetAtTime(base, t, 0.06);
      e.o2.frequency.setTargetAtTime(base * 0.502, t, 0.06);
      e.f.frequency.setTargetAtTime(300 + rev * 1400 + (c.boosting ? 600 : 0), t, 0.08);
      const vol = (c.quiet ? 0.5 : 1) * (0.025 + rev * 0.045 + (Math.abs(c.throttle || 0) > 0.1 ? 0.012 : 0));
      e.g.gain.setTargetAtTime(vol, t, 0.08);
      e.bg.gain.setTargetAtTime(c.boosting ? 0.16 * (c.quiet ? 0.5 : 1) : 0, t, 0.05);
      e.bf.frequency.setTargetAtTime(c.boosting ? 900 + rev * 900 : 600, t, 0.1);
      if (e.p.pan) e.p.pan.setTargetAtTime(this.pan(c.x), t, 0.05);
    }
    // crowd follows its target with cheers decaying
    this.crowdLevel += (this.crowdTarget - this.crowdLevel) * Math.min(1, dt * 0.8);
    if (this.crowd) {
      this.crowd.g.gain.setTargetAtTime(this.crowdLevel * 0.55, t, 0.1);
      this.crowd.bp.frequency.setTargetAtTime(700 + this.crowdLevel * 900, t, 0.2);
    }
  },
};
