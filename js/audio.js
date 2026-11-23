'use strict';
// ---------------------------------------------------------------------------
// Sound: every effect and the background music are synthesized with WebAudio,
// so the game ships with zero audio files.
// ---------------------------------------------------------------------------

const Sound = {
  ctx: null,
  master: null,
  sfxBus: null,
  musicBus: null,
  settings: { sfx: 0.6, music: 0.3, muted: false },
  last: {},
  noiseBuf: null,
  music: { on: false, timer: null, step: 0, next: 0, loop: 0, rng: null },

  loadSettings() {
    try { Object.assign(this.settings, JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}').sound || {}); } catch (e) { /* ignore */ }
  },

  // Must be called from a user gesture (browser autoplay rules).
  unlock() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.connect(this.ctx.destination);
      this.sfxBus = this.ctx.createGain();
      this.sfxBus.connect(this.master);
      const lp = this.ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 2600;
      lp.connect(this.master);
      this.musicBus = this.ctx.createGain();
      this.musicBus.connect(lp);
      const len = this.ctx.sampleRate;
      this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const data = this.noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
      this.applyVolumes();
      this.startMusic();
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
  },

  applyVolumes() {
    if (!this.ctx) return;
    const m = this.settings.muted ? 0 : 1;
    this.sfxBus.gain.value = this.settings.sfx * m;
    this.musicBus.gain.value = this.settings.music * m;
  },

  // ------------------------------ primitives --------------------------------
  tone(freq, dur, { type = 'square', vol = 0.2, slide = null, delay = 0, attack = 0.005, bus = null } = {}) {
    const c = this.ctx;
    const t = c.currentTime + delay;
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(slide, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g);
    g.connect(bus || this.sfxBus);
    o.start(t);
    o.stop(t + dur + 0.02);
  },

  noise(dur, { vol = 0.2, freq = 2000, q = 1, type = 'bandpass', delay = 0, slide = null, bus = null } = {}) {
    const c = this.ctx;
    const t = c.currentTime + delay;
    const s = c.createBufferSource();
    s.buffer = this.noiseBuf;
    const f = c.createBiquadFilter();
    f.type = type;
    f.frequency.setValueAtTime(freq, t);
    if (slide) f.frequency.exponentialRampToValueAtTime(slide, t + dur);
    f.Q.value = q;
    const g = c.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f);
    f.connect(g);
    g.connect(bus || this.sfxBus);
    s.start(t, Math.random() * 0.5);
    s.stop(t + dur + 0.02);
  },

  // --------------------------------- sfx ------------------------------------
  play(name, opt = {}) {
    if (!this.ctx || this.settings.muted || this.settings.sfx <= 0) return;
    const now = performance.now();
    const gap = { sell: 120, place: 40, remove: 40, rotate: 40, error: 200, click: 30, blip: 45 }[name] || 0;
    if (gap && now - (this.last[name] || 0) < gap) return;
    this.last[name] = now;
    const r = (a, b) => a + Math.random() * (b - a);
    switch (name) {
      case 'click':
        this.tone(1200, 0.03, { vol: 0.06 });
        break;
      case 'place':
        this.tone(r(300, 340), 0.08, { type: 'triangle', vol: 0.25, slide: 120 });
        this.noise(0.05, { vol: 0.12, freq: 1800 });
        break;
      case 'remove':
        this.tone(420, 0.12, { type: 'sawtooth', vol: 0.08, slide: 90 });
        this.noise(0.08, { vol: 0.1, freq: 900 });
        break;
      case 'rotate':
        this.tone(880, 0.03, { vol: 0.07 });
        this.tone(1320, 0.03, { vol: 0.05, delay: 0.03 });
        break;
      case 'sell': {
        const base = opt.big ? 1319 : 988;
        this.tone(base * r(0.98, 1.02), 0.05, { vol: 0.045 });
        this.tone(base * 1.5, 0.09, { vol: 0.035, delay: 0.045 });
        break;
      }
      case 'buy':
        [523, 659, 784].forEach((f, i) => this.tone(f, 0.09, { vol: 0.1, delay: i * 0.05 }));
        break;
      case 'research':
        [523, 659, 784, 1047, 1319].forEach((f, i) => this.tone(f, 0.14, { type: 'triangle', vol: 0.18, delay: i * 0.07 }));
        break;
      case 'error':
        this.tone(140, 0.16, { type: 'square', vol: 0.08 });
        this.tone(110, 0.16, { type: 'square', vol: 0.06, delay: 0.08 });
        break;
      case 'goal':
        [784, 988, 1175, 1568].forEach((f, i) => this.tone(f, 0.12, { vol: 0.09, delay: i * 0.06 }));
        break;
      case 'achievement':
        [523, 659, 784].forEach((f, i) => this.tone(f, 0.12, { vol: 0.1, delay: i * 0.09 }));
        this.tone(1047, 0.5, { type: 'triangle', vol: 0.18, delay: 0.27 });
        this.tone(1568, 0.5, { vol: 0.05, delay: 0.27 });
        break;
      case 'prestige':
        this.noise(1.2, { vol: 0.25, freq: 300, slide: 6000, q: 3 });
        [262, 330, 392, 523, 659, 784, 1047].forEach((f, i) => this.tone(f, 0.4, { type: 'triangle', vol: 0.14, delay: 0.3 + i * 0.08 }));
        break;
      case 'liftoff':
        this.noise(4, { vol: 0.4, freq: 120, slide: 1800, type: 'lowpass', q: 1 });
        this.tone(55, 4, { type: 'sawtooth', vol: 0.12, slide: 30, attack: 0.5 });
        break;
      case 'victory':
        [523, 659, 784, 1047, 784, 1047, 1319, 1568].forEach((f, i) => this.tone(f, 0.25, { type: 'square', vol: 0.08, delay: i * 0.12 }));
        [262, 330, 392, 523].forEach((f, i) => this.tone(f, 1.2, { type: 'triangle', vol: 0.12, delay: 0.96 + i * 0.02 }));
        break;
      case 'join':
        this.tone(660, 0.1, { type: 'triangle', vol: 0.15 });
        this.tone(990, 0.18, { type: 'triangle', vol: 0.15, delay: 0.1 });
        break;
      case 'leave':
        this.tone(990, 0.1, { type: 'triangle', vol: 0.15 });
        this.tone(660, 0.18, { type: 'triangle', vol: 0.15, delay: 0.1 });
        break;
      case 'blip':
        this.tone(opt.f || 600, 0.035, { type: 'square', vol: 0.035 });
        break;
      case 'chat':
        this.tone(1568, 0.06, { type: 'triangle', vol: 0.1 });
        break;
      case 'ping':
        this.tone(1760, 0.12, { type: 'sine', vol: 0.2 });
        this.tone(1760, 0.2, { type: 'sine', vol: 0.12, delay: 0.15 });
        break;
    }
  },

  // -------------------------------- music -----------------------------------
  // Five procedural chiptune tracks. In "auto" mode they rotate every couple
  // of minutes, and the calm "Night Furnace" takes over after dark.
  startMusic() {
    if (this.music.on) return;
    this.music.on = true;
    this.music.next = this.ctx.currentTime + 0.2;
    this.music.step = 0;
    this.music.track = this.pickTrack(-1);
    this.music.rng = mulberry32(1234);
    this.music.timer = setInterval(() => this.scheduleMusic(), 60);
    if (this.onTrack) this.onTrack(MUSIC_TRACKS[this.music.track].name);
  },

  // Choose the next track (respecting a fixed choice from Settings).
  pickTrack(current) {
    const choice = this.settings.track ?? 'auto';
    if (choice !== 'auto') return Math.max(0, Math.min(MUSIC_TRACKS.length - 1, +choice));
    const night = typeof dayState === 'function' && dayState().night > 0.6;
    const nightIdx = MUSIC_TRACKS.findIndex((tr) => tr.night);
    if (night) return nightIdx;
    let n = current;
    do { n = (n + 1) % MUSIC_TRACKS.length; } while (MUSIC_TRACKS[n].night);
    return n;
  },

  setTrack(choice) {
    this.settings.track = choice;
    if (!this.music.on) return;
    this.music.track = this.pickTrack(this.music.track);
    this.music.step = 0;
    if (this.onTrack) this.onTrack(MUSIC_TRACKS[this.music.track].name);
  },

  scheduleMusic() {
    if (!this.ctx || this.ctx.state !== 'running') return;
    while (this.music.next < this.ctx.currentTime + 0.3) {
      const tr = MUSIC_TRACKS[this.music.track];
      // switch tracks at phrase boundaries (every 128 steps ≈ 1–2 minutes)
      if (this.music.step > 0 && this.music.step % 128 === 0) {
        const nt = this.pickTrack(this.music.track);
        if (nt !== this.music.track) {
          this.music.track = nt;
          this.music.step = 0;
          this.music.next += 0.6; // a breath between songs
          if (this.onTrack) this.onTrack(MUSIC_TRACKS[nt].name);
          continue;
        }
      }
      if (this.settings.music > 0 && !this.settings.muted) this.musicStep(tr, this.music.step, this.music.next);
      this.music.next += 60 / tr.bpm / 2; // 8th notes
      this.music.step++;
    }
  },

  musicStep(tr, s, t) {
    const midi = (n) => 440 * Math.pow(2, (n - 69) / 12);
    const bar = Math.floor(s / 8);
    const i = s % 8;
    if (s % 64 === 0) this.music.rng = mulberry32(1000 + tr.seed + (Math.floor(s / 64) % 4));
    const chord = tr.prog[Math.floor(bar / 2) % tr.prog.length];
    const root = chord[0] - 12;
    const delay = Math.max(0, t - this.ctx.currentTime);
    const beat = 60 / tr.bpm;
    const at = (f, dur, o) => this.tone(f, dur, Object.assign({ bus: this.musicBus, delay }, o));
    // bass
    switch (tr.bass) {
      case 'pulse':
        if (i % 4 === 0) at(midi(root), beat, { type: 'triangle', vol: 0.35, attack: 0.01 });
        if (i === 6) at(midi(root + 7), beat * 0.4, { type: 'triangle', vol: 0.25 });
        break;
      case 'walk':
        if (i % 2 === 0) at(midi(root + [0, 7, 12, 7][i / 2]), beat * 0.45, { type: 'triangle', vol: 0.32, attack: 0.01 });
        break;
      case 'drone':
        if (i === 0) { at(midi(root), beat * 4, { type: 'triangle', vol: 0.3, attack: 0.25 }); at(midi(root + 7), beat * 4, { type: 'sine', vol: 0.12, attack: 0.4 }); }
        break;
      case 'drive':
        at(midi(root + (i === 7 ? 12 : 0)), beat * 0.22, { type: 'triangle', vol: 0.3, attack: 0.005 });
        break;
    }
    // arpeggio
    const arpNote = chord[tr.arp[i] % chord.length] + 12;
    at(midi(arpNote), beat * 0.3, { type: tr.arpWave, vol: tr.arpWave === 'square' ? 0.028 : 0.06 });
    if (tr.shimmer && i % 2 === 0) at(midi(arpNote + 12), beat * 0.6, { type: 'sine', vol: 0.03, attack: 0.02 });
    // hats
    if (tr.hats && i % 2 === 1) this.noise(0.03, { vol: 0.03, freq: 8000, type: 'highpass', bus: this.musicBus, delay });
    if (tr.hats && tr.bpm > 100 && i === 4) this.noise(0.08, { vol: 0.05, freq: 1800, type: 'bandpass', bus: this.musicBus, delay });
    // lead: re-improvised every 8 bars from the track's scale
    const section = Math.floor(s / 64) % 2;
    if (section === 1 || bar % 4 >= 2) {
      const rr = this.music.rng();
      if (i % 2 === 0 && rr < tr.density) {
        const n = tr.scale[Math.floor(this.music.rng() * tr.scale.length)];
        const long = rr < tr.density * 0.35;
        at(midi(n), beat * (long ? 1.6 : 0.7), { type: tr.lead, vol: tr.lead === 'sine' || tr.lead === 'triangle' ? 0.09 : 0.04, attack: tr.night ? 0.05 : 0.01 });
      }
    }
  },
};

const MUSIC_TRACKS = [
  { name: 'Morning Shift', seed: 0, bpm: 92, bass: 'pulse', arpWave: 'square', lead: 'square', density: 0.55, hats: true,
    prog: [[57, 60, 64], [53, 57, 60], [48, 52, 55], [55, 59, 62]], arp: [0, 1, 2, 1, 0, 2, 1, 2], scale: [69, 72, 74, 76, 79, 81, 84] },
  { name: 'Gearworks', seed: 10, bpm: 118, bass: 'walk', arpWave: 'triangle', lead: 'square', density: 0.6, hats: true,
    prog: [[60, 64, 67], [55, 59, 62], [57, 60, 64], [53, 57, 60]], arp: [0, 2, 1, 2, 0, 2, 1, 2], scale: [72, 74, 76, 79, 81, 84, 86] },
  { name: 'Gold Rush', seed: 20, bpm: 104, bass: 'drive', arpWave: 'square', lead: 'sawtooth', density: 0.5, hats: true,
    prog: [[52, 55, 59], [48, 52, 55], [50, 54, 57], [47, 50, 54]], arp: [0, 1, 2, 0, 1, 2, 1, 0], scale: [64, 67, 69, 71, 74, 76, 79] },
  { name: 'Orbit', seed: 30, bpm: 84, bass: 'pulse', arpWave: 'triangle', lead: 'sine', density: 0.42, hats: false, shimmer: true,
    prog: [[53, 57, 60, 64], [55, 59, 62, 65], [52, 55, 59, 62], [57, 60, 64, 67]], arp: [0, 1, 2, 3, 2, 3, 1, 2], scale: [65, 67, 69, 71, 72, 76, 77] },
  { name: 'Night Furnace', seed: 40, bpm: 70, bass: 'drone', arpWave: 'triangle', lead: 'triangle', density: 0.3, hats: false, night: true,
    prog: [[50, 53, 57, 60], [48, 52, 55, 59], [46, 50, 53, 57], [45, 48, 52, 55]], arp: [0, 1, 2, 3, 2, 1, 0, 1], scale: [62, 65, 67, 69, 72, 74] },
];
