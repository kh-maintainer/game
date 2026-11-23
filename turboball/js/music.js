'use strict';
// ---------------------------------------------------------------------------
// Music: a little synthwave/chiptune sequencer. Each track is a chord
// progression + a hand-written melody; bass, arpeggio, pad and drums are
// generated from the chords in the track's style. Kicks side-chain the pad
// and bass for that pumping feel. Lookahead scheduling keeps timing tight.
// ---------------------------------------------------------------------------

const DRUMS = {
  four: { k: 'x...x...x...x...', s: '....x.......x...', h: '..o...o...o...o.' },
  drive: { k: 'x...x...x...x...', s: '....x.......x...', h: 'xxxxxxxxxxxxxxxx' },
  half: { k: 'x.........x.....', s: '........x.......', h: 'x.x.x.x.x.x.x.x.' },
  chill: { k: 'x......x..x.....', s: '....x.......x...', h: 'x.x.x.x.x.x.x.xo' },
  break: { k: 'x.....x...x.....', s: '....x.......x..x', h: 'x.xxx.x.x.xxx.x.' },
  gallop: { k: 'x..x..x.x..x..x.', s: '....x.......x...', h: 'x.x.x.x.x.x.x.x.' },
};

const TRACKS = {
  title: {
    name: 'Turboball Theme', bpm: 112, drums: 'half', bass: 'pump', arp: 'up16', lead: 'saw2', shift: 0, leadVol: 0.07,
    chords: 'Am F C G Am F G E F G Am Am F G E E',
    mel: `a4:6 e5:2 a5:4 g5:2 e5:2 | f5:6 e5:2 c5:4 a4:4 | g4:4 c5:4 e5:4 g5:4 | d5:8 b4:4 g4:4 |
          a4:6 e5:2 a5:4 b5:2 c6:2 | a5:6 g5:2 f5:4 e5:2 f5:2 | g5:4 f5:2 e5:2 d5:4 b4:4 | e5:8 b4:4 g#4:4 |
          c6:4 a5:4 f5:4 a5:4 | b5:4 g5:4 d5:4 g5:4 | c6:6 b5:2 a5:4 e5:4 | a5:8 g5:2 a5:2 b5:2 c6:2 |
          d6:6 c6:2 a5:8 | b5:6 a5:2 g5:8 | g#5:4 b5:4 e6:4 d6:4 | b5:8 g#5:4 e5:4`,
  },
  garage: {
    name: 'Garage Lights', bpm: 92, drums: 'chill', bass: 'half', arp: 'updown8', lead: 'bell', shift: 0, leadVol: 0.06, swing: 0.14,
    chords: 'Dmaj7 Gmaj7 Bm7 A Dmaj7 Gmaj7 Em7 A',
    mel: `f#5:4 a5:4 c#6:6 a5:2 | b5:8 r:4 d6:2 b5:2 | a5:6 f#5:2 d5:4 f#5:4 | e5:12 r:4 |
          f#5:4 a5:4 d6:4 c#6:4 | b5:6 a5:2 g5:4 b5:4 | g5:4 f#5:4 e5:4 d5:4 | c#5:8 e5:4 a4:4`,
  },
  park: {
    name: 'Golden Hour', bpm: 128, drums: 'four', bass: 'syncop', arp: 'up16', lead: 'pulse', shift: -12, leadVol: 0.075,
    chords: 'Dm G Dm G F C G A Bb F C Dm Bb F G A',
    mel: `d5:3 f5:3 a5:2 g5:2 f5:2 d5:4 | b4:3 d5:3 g5:2 f5:2 e5:2 d5:4 | d5:3 f5:3 a5:2 c6:4 a5:4 | b5:6 g5:2 d5:8 |
          c6:3 a5:3 f5:2 a5:4 c6:4 | e6:3 c6:3 g5:2 e5:4 g5:4 | d6:4 b5:4 g5:4 b5:4 | c#6:8 e6:4 a5:4 |
          d6:6 bb5:2 f5:4 bb5:4 | c6:6 a5:2 f5:8 | e5:2 g5:2 c6:4 e6:4 d6:4 | d6:12 r:4 |
          f6:4 d6:4 bb5:4 d6:4 | c6:4 a5:4 f5:4 a5:4 | b5:4 d6:4 g6:4 f6:4 | e6:8 c#6:4 a5:4`,
  },
  neon: {
    name: 'Neon Overdrive', bpm: 140, drums: 'drive', bass: 'drive', arp: 'up16', lead: 'saw2', shift: -12, leadVol: 0.075,
    chords: 'Em C D B Em C Am B C D Em Em C D B B',
    mel: `e5:2 e5:2 g5:2 e5:2 b5:4 a5:2 g5:2 | g5:2 e5:2 c5:4 e5:4 g5:4 | f#5:2 d5:2 a4:2 d5:2 f#5:4 a5:4 | b5:6 a5:2 f#5:4 d#5:4 |
          e5:2 e5:2 g5:2 e5:2 b5:4 c6:2 b5:2 | c6:4 b5:2 g5:2 e5:4 g5:4 | a5:4 c6:4 e6:4 c6:4 | b5:8 a5:4 f#5:4 |
          e6:6 d6:2 c6:4 g5:4 | f#6:6 e6:2 d6:4 a5:4 | g6:4 f#6:4 e6:4 b5:4 | e6:12 r:4 |
          c6:2 d6:2 e6:4 g6:4 e6:4 | d6:2 e6:2 f#6:4 a6:4 f#6:4 | f#6:4 d#6:4 b5:4 a5:4 | b5:8 f#5:4 d#5:4`,
  },
  rink: {
    name: 'Black Ice', bpm: 124, drums: 'break', bass: 'pump', arp: 'up16', lead: 'bell', shift: 0, leadVol: 0.06,
    chords: 'Cm Ab Eb Bb Cm Ab Fm G Ab Bb Cm Cm Ab Bb G G',
    mel: `g5:4 c6:4 eb6:6 d6:2 | c6:8 ab5:4 eb5:4 | bb5:4 g5:4 eb5:4 g5:4 | f5:8 d5:4 bb4:4 |
          g5:4 c6:4 eb6:4 g6:4 | f6:6 eb6:2 c6:8 | ab5:4 c6:4 f6:4 eb6:4 | d6:8 b5:4 g5:4 |
          c6:2 eb6:2 ab6:4 g6:4 eb6:4 | d6:2 f6:2 bb6:4 ab6:4 f6:4 | g6:6 f6:2 eb6:4 c6:4 | c6:12 r:4 |
          eb6:4 c6:4 ab5:4 c6:4 | d6:4 bb5:4 f5:4 bb5:4 | b5:4 d6:4 g6:4 f6:4 | d6:8 b5:4 g5:4`,
  },
  dunes: {
    name: 'Sandstorm Run', bpm: 146, drums: 'gallop', bass: 'drive', arp: 'updown8', lead: 'square', shift: -12, leadVol: 0.06,
    chords: 'E5 F5 E5 D5 E5 F5 G5 F5 C5 D5 E5 E5 C5 D5 F5 F5',
    mel: `e5:2 r:2 e5:2 f5:2 e5:2 d5:2 e5:4 | f5:2 r:2 f5:2 g5:2 f5:2 e5:2 c5:4 | e5:2 g5:2 b5:4 a5:2 g5:2 f5:4 | d5:8 f5:4 a5:4 |
          e5:2 r:2 e5:2 f5:2 e5:2 d5:2 e5:4 | f5:2 a5:2 c6:4 b5:2 a5:2 f5:4 | g5:4 b5:4 d6:4 b5:4 | c6:4 a5:4 f5:4 c5:4 |
          e6:6 d6:2 c6:4 g5:4 | f6:6 e6:2 d6:4 a5:4 | g6:4 f6:4 e6:4 b5:4 | e6:8 f6:4 e6:4 |
          g6:4 e6:4 c6:4 e6:4 | a6:4 f6:4 d6:4 f6:4 | c7:4 a6:4 f6:4 c6:4 | f6:8 e6:4 f6:4`,
  },
  skyline: {
    name: 'City Above', bpm: 134, drums: 'four', bass: 'pump', arp: 'updown8', lead: 'saw2', shift: -12, leadVol: 0.075,
    chords: 'G D Em C G D C D Em C G D C D G G',
    mel: `d5:4 g5:4 b5:6 a5:2 | a5:8 f#5:4 d5:4 | e5:4 g5:4 b5:4 e6:4 | d6:6 c6:2 g5:8 |
          b5:4 d6:4 g6:6 f#6:2 | e6:4 d6:4 a5:4 f#5:4 | g5:4 e5:4 c6:4 e6:4 | d6:8 c6:4 a5:4 |
          b5:6 g5:2 e5:4 g5:4 | c6:6 e6:2 g6:8 | d6:4 b5:4 g5:4 b5:4 | a5:8 f#5:4 a5:4 |
          e6:4 g6:4 e6:4 c6:4 | f#6:4 a6:4 f#6:4 d6:4 | g6:12 d6:4 | g6:4 d6:4 b5:4 g5:4`,
  },
  overtime: {
    name: 'Sudden Death', bpm: 160, drums: 'drive', bass: 'drive', arp: 'up16', lead: 'saw2', shift: -12, leadVol: 0.075,
    chords: 'Am F G E Am F G E',
    mel: `a5:2 c6:2 e6:2 a6:2 g6:2 e6:2 c6:2 e6:2 | f6:2 e6:2 c6:2 a5:2 c6:4 f6:4 | g6:2 f6:2 d6:2 b5:2 d6:4 g6:4 | g#6:4 e6:4 b5:4 g#5:4 |
          a6:4 e6:4 c6:2 e6:2 a6:4 | c7:4 a6:4 f6:4 c6:4 | b6:4 g6:4 d6:4 b5:4 | e6:8 g#6:4 b6:4`,
  },
};

const JINGLES = {
  goal: { bpm: 170, lead: 'square', mel: 'c5:1 e5:1 g5:1 c6:1 e6:1 g6:5', chord: [60, 64, 67, 72], vol: 0.07 },
  victory: { bpm: 150, lead: 'saw2', mel: 'g4:2 c5:2 e5:2 g5:4 e5:2 g5:2 c6:10', chord: [48, 55, 60, 64, 67], vol: 0.08 },
  defeat: { bpm: 110, lead: 'bell', mel: 'e5:3 d#5:3 d5:3 c#5:8', chord: [49, 52, 56], vol: 0.07 },
};

const NOTE_PC = { c: 0, d: 2, e: 4, f: 5, g: 7, a: 9, b: 11 };
function noteToMidi(s) {
  const m = /^([a-g])(#|b)?(-?\d)$/.exec(s);
  if (!m) return null;
  let pc = NOTE_PC[m[1]];
  if (m[2] === '#') pc++; else if (m[2] === 'b') pc--;
  return 12 * (parseInt(m[3], 10) + 1) + pc;
}
const CHORD_Q = { '': [0, 4, 7], m: [0, 3, 7], 7: [0, 4, 7, 10], m7: [0, 3, 7, 10], maj7: [0, 4, 7, 11], 5: [0, 7, 12], sus4: [0, 5, 7] };
function parseChord(s) {
  const m = /^([A-G])(#|b)?(.*)$/.exec(s);
  let pc = NOTE_PC[m[1].toLowerCase()];
  if (m[2] === '#') pc++; else if (m[2] === 'b') pc--;
  pc = (pc + 12) % 12;
  return { pc, iv: CHORD_Q[m[3]] || CHORD_Q[''] };
}
function parseMel(str) {
  const out = [];
  let step = 0;
  for (const tok of str.replace(/\|/g, ' ').split(/\s+/).filter(Boolean)) {
    const [n, d] = tok.split(':');
    const dur = parseInt(d || '1', 10);
    if (n !== 'r') out[step] = { m: noteToMidi(n), d: dur };
    step += dur;
  }
  return { ev: out, len: step };
}
function compileTrack(t) {
  if (t.compiled) return t.compiled;
  const chords = t.chords.split(/\s+/).map(parseChord);
  const mel = parseMel(t.mel);
  const bars = chords.length;
  return (t.compiled = { chords, mel: mel.ev, bars, steps: bars * 16, melLen: mel.len });
}

const Music = {
  ctx: null, dest: null, verb: null, song: null, timer: null, pulse: null, current: null,

  init(ctx, dest, verb) {
    this.ctx = ctx; this.dest = dest; this.verb = verb;
    const n = 32, re = new Float32Array(n), im = new Float32Array(n);
    for (let i = 1; i < n; i++) im[i] = (2 / (i * Math.PI)) * Math.sin(i * Math.PI * 0.25);
    this.pulse = ctx.createPeriodicWave(re, im);
    this.timer = setInterval(() => this.tick(), 25);
    if (this.want) this.play(this.want);
  },

  makeBus(t0) {
    const ctx = this.ctx;
    const gain = ctx.createGain(); gain.gain.value = 0.0001;
    gain.gain.setValueAtTime(0.0001, t0); gain.gain.exponentialRampToValueAtTime(1, t0 + 0.6);
    gain.connect(this.dest);
    const duck = ctx.createGain(); duck.connect(gain);
    const delay = ctx.createDelay(1); const fb = ctx.createGain(); const wet = ctx.createGain();
    fb.gain.value = 0.3; wet.gain.value = 0.22;
    delay.connect(fb); fb.connect(delay); delay.connect(wet); wet.connect(gain);
    const vs = ctx.createGain(); vs.gain.value = 0.35; vs.connect(this.verb);
    return { gain, duck, delay, verbSend: vs };
  },

  play(id) {
    this.want = id;
    if (!this.ctx) return;
    if (this.current === id && this.song) return;
    this.current = id;
    const t = this.ctx.currentTime + 0.05;
    if (this.song) {
      const old = this.song;
      old.dead = true;
      old.bus.gain.gain.cancelScheduledValues(t);
      old.bus.gain.gain.setValueAtTime(old.bus.gain.gain.value || 1, t);
      old.bus.gain.gain.exponentialRampToValueAtTime(0.0001, t + 1.2);
      setTimeout(() => { try { old.bus.gain.disconnect(); } catch (e) { /* ignore */ } }, 1800);
    }
    if (!id || !TRACKS[id]) { this.song = null; return; }
    const tr = TRACKS[id];
    const bus = this.makeBus(t);
    bus.delay.delayTime.value = (60 / tr.bpm) * 0.75;
    this.song = { tr, c: compileTrack(tr), bus, step: -32, next: t + 0.05, sd: 60 / tr.bpm / 4 };
  },

  stop() { this.play(null); },

  tick() {
    const s = this.song;
    if (!s || !this.ctx) return;
    const ahead = this.ctx.currentTime + 0.25;
    if (s.next < this.ctx.currentTime - 0.5) s.next = this.ctx.currentTime + 0.05; // tab was asleep
    while (s.next < ahead) {
      const swing = s.tr.swing && (s.step % 2 === 1) ? s.tr.swing * s.sd : 0;
      this.stepAt(s, s.step, s.next + swing);
      s.next += s.sd;
      s.step++;
    }
  },

  stepAt(s, step, t) {
    const { tr, c, bus } = s;
    const intro = step < 0;
    const st = intro ? 0 : step % c.steps, i = ((step % 16) + 16) % 16;
    const bar = intro ? 0 : Math.floor(st / 16), loop = intro ? 0 : Math.floor(step / c.steps);
    const ch = c.chords[bar], sd = s.sd;
    // drums
    const dp = DRUMS[tr.drums];
    if (dp.k[i] === 'x') this.kick(t, bus);
    if (!intro) {
      if (dp.s[i] === 'x') this.snare(t, bus, 0.5);
      if (bar % 8 === 7 && i >= 12) this.snare(t, bus, 0.18 + (i - 12) * 0.06);
      if (dp.h[i] === 'x') this.hat(t, bus, false, i % 4 === 2 ? 0.11 : 0.06);
      else if (dp.h[i] === 'o') this.hat(t, bus, true, 0.09);
    }
    if (!intro && bar === 0 && i === 0) this.crash(t, bus);
    // bass
    let root = 36 + ch.pc; if (root > 43) root -= 12;
    const fifth = root + 7;
    switch (tr.bass) {
      case 'pump': if (i % 2 === 0) this.bass(root + (i % 4 === 2 ? 12 : 0), t, sd * 1.6, bus); break;
      case 'drive': this.bass(root + (i % 8 === 6 ? 12 : 0), t, sd * 0.85, bus, i % 4 === 0 ? 1 : 0.75); break;
      case 'syncop': if ([0, 3, 6, 8, 10, 11, 14].includes(i)) this.bass((i === 6 || i === 14) ? fifth : root, t, sd * 1.8, bus); break;
      case 'half': if (i === 0) this.bass(root, t, sd * 7.5, bus); else if (i === 8) this.bass(fifth - 12 < 33 ? fifth : fifth - 12, t, sd * 7.5, bus); break;
    }
    // chord tones in the middle register
    const base = 60 + ch.pc - (ch.pc > 6 ? 12 : 0);
    const tones = ch.iv.map((v) => base + v);
    if (i === 0) this.pad(tones, t, sd * 16, bus);
    if (!intro) {
      const at = tones.concat([tones[0] + 12]);
      if (tr.arp === 'up16') this.arp(at[i % at.length] + 12, t, sd * 0.9, bus);
      else if (tr.arp === 'updown8' && i % 2 === 0) { const seq = [0, 1, 2, 3, 2, 1, 0, 2]; this.arp(at[seq[(i / 2) % seq.length] % at.length] + 12, t, sd * 1.8, bus); }
    }
    // melody
    if (!intro) {
      const ev = c.mel[st % c.melLen];
      if (ev && ev.m) {
        this.lead(ev.m + tr.shift, t, ev.d * sd, bus, tr.lead, tr.leadVol);
        if (loop % 2 === 1) this.lead(ev.m + tr.shift + 12, t, ev.d * sd, bus, tr.lead, tr.leadVol * 0.3);
      }
    }
  },

  freq(m) { return 440 * Math.pow(2, (m - 69) / 12); },

  kick(t, bus) {
    const ctx = this.ctx, o = ctx.createOscillator(), g = ctx.createGain();
    o.frequency.setValueAtTime(150, t); o.frequency.exponentialRampToValueAtTime(42, t + 0.12);
    g.gain.setValueAtTime(0.9, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.38);
    o.connect(g); g.connect(bus.gain); o.start(t); o.stop(t + 0.4);
    bus.duck.gain.cancelScheduledValues(t);
    bus.duck.gain.setValueAtTime(0.35, t); bus.duck.gain.linearRampToValueAtTime(1, t + 0.22);
  },
  noise(t, dur, type, f, q, vol, bus, wet) {
    const ctx = this.ctx, n = ctx.createBufferSource(), fl = ctx.createBiquadFilter(), g = ctx.createGain();
    n.buffer = Snd.noise; fl.type = type; fl.frequency.value = f; fl.Q.value = q;
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    n.connect(fl); fl.connect(g); g.connect(bus.gain); if (wet) g.connect(bus.verbSend);
    n.start(t, Math.random()); n.stop(t + dur + 0.02);
  },
  snare(t, bus, v) {
    this.noise(t, 0.2, 'highpass', 1100, 0.7, v * 0.5, bus, true);
    const ctx = this.ctx, o = ctx.createOscillator(), g = ctx.createGain();
    o.type = 'triangle'; o.frequency.setValueAtTime(200, t); o.frequency.exponentialRampToValueAtTime(120, t + 0.1);
    g.gain.setValueAtTime(v * 0.5, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.12);
    o.connect(g); g.connect(bus.gain); o.start(t); o.stop(t + 0.15);
  },
  hat(t, bus, open, v) { this.noise(t, open ? 0.22 : 0.045, 'highpass', 7500, 0.8, v, bus, false); },
  crash(t, bus) { this.noise(t, 1.4, 'highpass', 5000, 0.5, 0.12, bus, true); },

  bass(m, t, d, bus, acc = 1) {
    const ctx = this.ctx, o = ctx.createOscillator(), o2 = ctx.createOscillator(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    o.type = 'sawtooth'; o2.type = 'square';
    o.frequency.value = this.freq(m); o2.frequency.value = this.freq(m - 12);
    f.type = 'lowpass'; f.Q.value = 6;
    f.frequency.setValueAtTime(1500 * acc, t); f.frequency.exponentialRampToValueAtTime(220, t + Math.min(d, 0.25));
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.2 * acc, t + 0.008);
    g.gain.setValueAtTime(0.2 * acc, t + d * 0.8); g.gain.exponentialRampToValueAtTime(0.0001, t + d);
    const og = ctx.createGain(); og.gain.value = 0.5; o2.connect(og); og.connect(f);
    o.connect(f); f.connect(g); g.connect(bus.duck);
    o.start(t); o2.start(t); o.stop(t + d + 0.02); o2.stop(t + d + 0.02);
  },
  pad(tones, t, d, bus) {
    const ctx = this.ctx, f = ctx.createBiquadFilter(), g = ctx.createGain();
    f.type = 'lowpass'; f.frequency.value = 1300; f.Q.value = 0.5;
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.022, t + 0.25);
    g.gain.setValueAtTime(0.022, t + d - 0.2); g.gain.exponentialRampToValueAtTime(0.0001, t + d + 0.1);
    f.connect(g); g.connect(bus.duck); g.connect(bus.verbSend);
    for (const m of tones) for (const det of [-8, 8]) {
      const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = this.freq(m); o.detune.value = det;
      o.connect(f); o.start(t); o.stop(t + d + 0.15);
    }
  },
  arp(m, t, d, bus) {
    const ctx = this.ctx, o = ctx.createOscillator(), g = ctx.createGain();
    o.setPeriodicWave(this.pulse); o.frequency.value = this.freq(m);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.035, t + 0.004); g.gain.exponentialRampToValueAtTime(0.0001, t + Math.min(d, 0.16));
    o.connect(g); g.connect(bus.duck); g.connect(bus.delay);
    o.start(t); o.stop(t + 0.2);
  },
  lead(m, t, d, bus, kind, vol, dest) {
    const ctx = this.ctx, g = ctx.createGain(), f = ctx.createBiquadFilter();
    f.type = 'lowpass'; f.frequency.value = kind === 'saw2' ? 2800 : 5000;
    const rel = kind === 'bell' ? 0.6 : 0.08;
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.012);
    if (kind === 'bell') g.gain.exponentialRampToValueAtTime(vol * 0.25, t + Math.max(0.05, d));
    else g.gain.setValueAtTime(vol * 0.8, t + Math.max(0.02, d - 0.03));
    g.gain.exponentialRampToValueAtTime(0.0001, t + d + rel);
    f.connect(g);
    const out = dest || bus;
    g.connect(out.gain || out); if (out.delay) g.connect(out.delay); if (out.verbSend) g.connect(out.verbSend);
    const fr = this.freq(m);
    const oscs = [];
    const mk = (type, det, mul = 1) => { const o = ctx.createOscillator(); if (type === 'pulse') o.setPeriodicWave(this.pulse); else o.type = type; o.frequency.value = fr * mul; o.detune.value = det; o.connect(f); oscs.push(o); return o; };
    if (kind === 'saw2') { mk('sawtooth', -9); mk('sawtooth', 9); }
    else if (kind === 'square') mk('square', 0);
    else if (kind === 'pulse') mk('pulse', 0);
    else if (kind === 'bell') { mk('sine', 0); const o = mk('triangle', 0, 2); o.detune.value = 3; }
    // vibrato on longer notes
    if (d > 0.25 && kind !== 'bell') {
      const lfo = ctx.createOscillator(), lg = ctx.createGain();
      lfo.frequency.value = 5.5; lg.gain.setValueAtTime(0, t); lg.gain.linearRampToValueAtTime(14, t + 0.25);
      lfo.connect(lg); for (const o of oscs) lg.connect(o.detune);
      lfo.start(t); lfo.stop(t + d + rel);
    }
    for (const o of oscs) { o.start(t); o.stop(t + d + rel + 0.05); }
  },

  jingle(id) {
    if (!this.ctx) return;
    const j = JINGLES[id];
    const t0 = this.ctx.currentTime + 0.05, sd = 60 / j.bpm / 4;
    const mel = parseMel(j.mel);
    const bus = { gain: this.dest, delay: null, verbSend: null };
    const vs = this.ctx.createGain(); vs.gain.value = 0.4; vs.connect(this.verb); bus.verbSend = vs;
    for (let s = 0; s < mel.ev.length; s++) { const e = mel.ev[s]; if (e) this.lead(e.m, t0 + s * sd, e.d * sd, null, j.lead, j.vol, bus); }
    const tot = mel.len * sd;
    const last = t0 + (mel.len - (mel.ev[mel.ev.length - 1] ? mel.ev[mel.ev.length - 1].d : 4)) * sd;
    for (const m of j.chord) this.lead(m, last, tot - (last - t0) + 0.3, null, 'bell', j.vol * 0.5, bus);
    // duck the song under the jingle
    if (this.song) {
      const g = this.song.bus.gain.gain;
      g.cancelScheduledValues(t0); g.setValueAtTime(g.value || 1, t0); g.linearRampToValueAtTime(0.3, t0 + 0.1);
      g.setValueAtTime(0.3, t0 + tot); g.linearRampToValueAtTime(1, t0 + tot + 0.8);
    }
  },
};
