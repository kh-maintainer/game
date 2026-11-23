'use strict';
// ---------------------------------------------------------------------------
// UI: menu screens, pickers, garage, settings, results. Pure DOM.
// ---------------------------------------------------------------------------

const $ = (s) => document.querySelector(s);
const $$ = (s) => Array.from(document.querySelectorAll(s));

const UI = {
  cur: null,
  app: null,

  init(app) {
    this.app = app;
    $$('[data-go]').forEach((b) => b.addEventListener('click', () => { Snd.play('ui'); this.go(b.dataset.go); }));
    document.addEventListener('mouseover', (e) => { if (e.target.closest && e.target.closest('.btn, .opt, .sw')) Snd.play('hover'); });
    this.buildArenaPicks();
    this.buildLenPicks();
    this.buildDiff();
    this.buildGarage();
    this.buildSettings();
    this.buildLocal();
  },

  go(id) {
    if (id === 'online') this.app.openOnline();
    if (id === 'title' && this.cur === 'online') this.app.leaveOnline();
    if (id === 'bot') this.refreshRecords();
    this.show(id);
  },

  show(id) {
    $$('.screen').forEach((s) => s.classList.remove('on', 'dim'));
    this.cur = id;
    if (!id) return;
    const el = $('#scr-' + id);
    el.classList.add('on');
    if (id !== 'title') el.classList.add('dim');
    if (id === 'garage') this.syncGarage();
    if (id === 'settings') this.syncSettings();
    if (['title', 'garage', 'settings', 'howto', 'bot', 'local', 'online'].includes(id)) this.app.menuMusic(id);
  },

  toast(msg, err, ms = 3200) {
    const t = document.createElement('div');
    t.className = 'toast' + (err ? ' err' : '');
    t.textContent = msg;
    $('#toasts').appendChild(t);
    setTimeout(() => t.remove(), ms);
  },

  // ------------------------------ pickers ---------------------------------
  arenaThumb(ar) {
    const cv = document.createElement('canvas');
    cv.width = 300; cv.height = 128; cv.className = 'thumb';
    const c = cv.getContext('2d');
    if (!ar) {
      const g = c.createLinearGradient(0, 0, 300, 128);
      ARENAS.forEach((a, i) => g.addColorStop(i / (ARENAS.length - 1), a.pitch[0]));
      c.fillStyle = g; c.fillRect(0, 0, 300, 128);
      c.fillStyle = 'rgba(0,0,0,0.35)'; c.fillRect(0, 0, 300, 128);
      c.font = '56px Bungee, sans-serif'; c.fillStyle = '#fff'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('?', 150, 66);
      return cv;
    }
    c.fillStyle = ar.standsDark; c.fillRect(0, 0, 300, 128);
    const sx = 300 / W * 1.2, sy = 128 / H * 1.2;
    c.save(); c.translate(-W * sx * 0.1, -H * sy * 0.1); c.scale(sx, sy);
    for (let x = FIELD.l, k = 0; x < FIELD.r; x += 60, k++) { c.fillStyle = k % 2 ? ar.pitch[1] : ar.pitch[0]; c.fillRect(x, FIELD.t, 60, FIELD.b - FIELD.t); }
    c.strokeStyle = ar.line; c.lineWidth = 6; c.beginPath(); c.moveTo(CX, FIELD.t); c.lineTo(CX, FIELD.b); c.stroke();
    c.beginPath(); c.arc(CX, CY, 72, 0, TAU); c.stroke();
    c.strokeStyle = ar.wall; c.lineWidth = 16; mainFieldPath(c); c.stroke();
    c.restore();
    const g = c.createLinearGradient(0, 0, 0, 128); g.addColorStop(0.4, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,0.45)');
    c.fillStyle = g; c.fillRect(0, 0, 300, 128);
    return cv;
  },

  buildArenaPicks() {
    for (const box of $$('.arena-pick')) {
      box.innerHTML = '';
      for (const ar of [null].concat(ARENAS)) {
        const b = document.createElement('button');
        b.className = 'opt';
        b.dataset.arena = ar ? ar.id : 'random';
        b.appendChild(this.arenaThumb(ar));
        const meta = document.createElement('div'); meta.className = 'meta';
        meta.innerHTML = `<b>${ar ? ar.name : 'Random'}</b><span>${ar ? ar.desc : 'A different stadium each match'}</span>`;
        b.appendChild(meta);
        b.addEventListener('click', () => { Snd.play('ui'); Settings.data.arena = b.dataset.arena; Settings.save(); this.syncPicks(); this.app.lobbyChanged(); });
        box.appendChild(b);
      }
    }
    this.syncPicks();
  },
  buildLenPicks() {
    for (const box of $$('.len-pick')) {
      box.innerHTML = '';
      MATCH_LENGTH_NAMES.forEach((n, i) => {
        const b = document.createElement('button');
        b.className = 'opt'; b.dataset.len = i; b.innerHTML = `<b>${n}</b>`;
        b.addEventListener('click', () => { Snd.play('ui'); Settings.data.length = i; Settings.save(); this.syncPicks(); this.app.lobbyChanged(); });
        box.appendChild(b);
      });
    }
    this.syncPicks();
  },
  syncPicks() {
    $$('.arena-pick .opt').forEach((b) => b.classList.toggle('sel', b.dataset.arena === Settings.data.arena));
    $$('.len-pick .opt').forEach((b) => b.classList.toggle('sel', +b.dataset.len === Settings.data.length));
    $$('.diff-pick .opt').forEach((b) => b.classList.toggle('sel', +b.dataset.diff === Settings.data.difficulty));
  },
  buildDiff() {
    $$('.diff-pick .opt').forEach((b) => b.addEventListener('click', () => { Snd.play('ui'); Settings.data.difficulty = +b.dataset.diff; Settings.save(); this.syncPicks(); }));
    $('#btn-start-bot').addEventListener('click', () => this.app.startBot());
  },
  refreshRecords() {
    $$('.rec').forEach((el) => { const r = Settings.data.record[el.dataset.rec] || [0, 0]; el.textContent = r[0] + r[1] ? `Record ${r[0]}W – ${r[1]}L` : ''; });
  },

  paintPick(box, get, set) {
    box.innerHTML = '';
    PAINTS.forEach((p, i) => {
      const s = document.createElement('div');
      s.className = 'sw'; s.title = p.name; s.style.background = p.c; s.dataset.i = i;
      s.addEventListener('click', () => { Snd.play('ui'); set(i); sync(); });
      box.appendChild(s);
    });
    const sync = () => box.querySelectorAll('.sw').forEach((s) => s.classList.toggle('sel', +s.dataset.i === get()));
    sync();
    return sync;
  },

  buildLocal() {
    if (Settings.data.p2paint == null) Settings.data.p2paint = Settings.data.paint === 1 ? 0 : 1;
    this.paintPick($('#p2-paint'), () => Settings.data.p2paint, (i) => { Settings.data.p2paint = i; Settings.save(); });
    $('#btn-start-local').addEventListener('click', () => this.app.startLocal());
  },

  // ------------------------------- garage ---------------------------------
  buildGarage() {
    const name = $('#name-input');
    name.addEventListener('input', () => { Settings.data.name = name.value.trim().slice(0, 14) || 'Driver'; Settings.save(); });
    const bp = $('#body-pick');
    BODIES.forEach((b, i) => {
      const o = document.createElement('button');
      o.className = 'opt'; o.dataset.i = i; o.innerHTML = `<b>${b.name}</b><span>${b.desc}</span>`;
      o.addEventListener('click', () => { Snd.play('ui'); Settings.data.body = i; Settings.save(); this.syncGarage(); });
      bp.appendChild(o);
    });
    this.syncPaint = this.paintPick($('#paint-pick'), () => Settings.data.paint, (i) => { Settings.data.paint = i; Settings.save(); });
  },
  syncGarage() {
    $('#name-input').value = Settings.data.name;
    $$('#body-pick .opt').forEach((o) => o.classList.toggle('sel', +o.dataset.i === Settings.data.body));
    if (this.syncPaint) this.syncPaint();
  },
  drawGarage(r, t) {
    const cv = $('#garage-preview'), c = cv.getContext('2d');
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.clearRect(0, 0, cv.width, cv.height);
    // turntable
    const cx = cv.width / 2, cy = cv.height / 2 + 10;
    c.fillStyle = 'rgba(255,255,255,0.05)'; c.beginPath(); c.ellipse(cx, cy, 190, 110, 0, 0, TAU); c.fill();
    c.strokeStyle = 'rgba(255,194,26,0.35)'; c.lineWidth = 3; c.beginPath(); c.ellipse(cx, cy, 190, 110, 0, 0, TAU); c.stroke();
    for (let k = 0; k < 24; k++) { const a = k / 24 * TAU + t * 0.3; c.fillStyle = `rgba(255,255,255,${0.08 + 0.08 * Math.sin(t * 3 + k)})`; c.beginPath(); c.arc(cx + Math.cos(a) * 170, cy + Math.sin(a) * 96, 3, 0, TAU); c.fill(); }
    const sp = r.carSprite({ body: Settings.data.body, paint: Settings.data.paint });
    const s = 5.4, a = t * 0.6;
    c.save(); c.translate(cx + 10, cy + 12); c.rotate(a); c.globalAlpha = 0.8;
    c.drawImage(sp.shadow, -sp.w / 2 * s, -sp.h / 2 * s, sp.w * s, sp.h * s); c.restore();
    c.save(); c.translate(cx, cy); c.rotate(a);
    c.drawImage(sp.frames[2 + Math.round(Math.sin(t * 0.9))], -sp.w / 2 * s, -sp.h / 2 * s, sp.w * s, sp.h * s);
    c.restore();
    c.font = '22px Bungee, sans-serif'; c.textAlign = 'center'; c.fillStyle = PAINTS[Settings.data.paint].c;
    c.fillText(`${PAINTS[Settings.data.paint].name} ${BODIES[Settings.data.body].name}`, cx, 34);
  },

  // ------------------------------ settings --------------------------------
  buildSettings() {
    const m = $('#set-music'), s = $('#set-sfx'), sh = $('#set-shake');
    m.addEventListener('input', () => { Settings.data.music = +m.value; Settings.save(); Snd.applyVolumes(); });
    s.addEventListener('input', () => { Settings.data.sfx = +s.value; Settings.save(); Snd.applyVolumes(); });
    s.addEventListener('change', () => Snd.play('hit', { s: 500 }));
    sh.addEventListener('change', () => { Settings.data.shake = sh.checked; Settings.save(); });
    const list = $('#track-list');
    for (const id of Object.keys(TRACKS)) {
      const b = document.createElement('button');
      b.className = 'btn small'; b.dataset.track = id;
      b.textContent = '♪ ' + TRACKS[id].name;
      b.addEventListener('click', () => { Snd.init(); Music.play(id); this.syncSettings(); });
      list.appendChild(b);
    }
  },
  syncSettings() {
    $('#set-music').value = Settings.data.music;
    $('#set-sfx').value = Settings.data.sfx;
    $('#set-shake').checked = Settings.data.shake;
    $$('#track-list button').forEach((b) => b.classList.toggle('playing', b.dataset.track === Music.current));
  },

  nowPlaying() {
    const el = $('#now-playing');
    const t = Music.current && TRACKS[Music.current];
    el.textContent = t ? `♪ Now playing: ${t.name}` : '';
  },

  // ------------------------------ results ---------------------------------
  showResults(o) {
    // o: { title, col, score, players, stats, note, canRematch }
    $('#res-title').textContent = o.title;
    $('#res-title').style.color = o.col;
    const cols = o.players.map((p) => PAINTS[p.paint].c);
    $('#res-score').innerHTML = `<span style="color:${cols[0]}">${o.score[0]}</span> <span style="color:#777">–</span> <span style="color:${cols[1]}">${o.score[1]}</span>`;
    const rows = [['Goals', 'goals'], ['Shots', 'shots'], ['Saves', 'saves'], ['Touches', 'touches'], ['Hardest hit', 'topHit', (v) => Math.round(v * KMH) + ' km/h']];
    let html = `<tr><th></th><th style="color:${cols[0]}">${esc(o.players[0].name)}</th><th style="color:${cols[1]}">${esc(o.players[1].name)}</th></tr>`;
    for (const [label, k, f] of rows) {
      const a = o.stats[0][k] || 0, b = o.stats[1][k] || 0;
      const fmt = f || ((v) => Math.round(v));
      html += `<tr><td>${label}</td><td class="${a > b ? 'best' : ''}">${fmt(a)}</td><td class="${b > a ? 'best' : ''}">${fmt(b)}</td></tr>`;
    }
    $('#res-stats').innerHTML = html;
    $('#res-note').textContent = o.note || '';
    $('#btn-rematch').disabled = false;
    this.show('results');
  },
};

function esc(s) { return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
