'use strict';
// ---------------------------------------------------------------------------
// App: owns the current session (attract / bot / couch / online), routes
// events to the renderer and audio, runs the frame loop, and handles the
// online lobby flow.
// ---------------------------------------------------------------------------

const ATTRACT_PLAYERS = [{ name: 'Blaze', paint: 1, body: 0 }, { name: 'Azure', paint: 0, body: 2 }];

const App = {
  r: null, session: null, mode: 'attract', scheme: 'solo', last: 0,
  link: null, peer: null, lobbyRole: null, rematch: { me: false, them: false },
  kickoffs: 0, lastCount: null, prevBoost: [false, false], overShown: false, lastOpts: null,

  init() {
    Settings.load();
    if (!Settings.data.name) { Settings.data.name = 'Driver' + Math.floor(100 + Math.random() * 900); Settings.save(); }
    this.r = new Renderer(document.getElementById('game'));
    Input.init();
    UI.init(this);
    Input.onKey((code) => this.onKey(code));
    const unlock = () => { Snd.init(); Music.play(this.wantMusic || 'title'); UI.nowPlaying(); };
    window.addEventListener('pointerdown', unlock);
    window.addEventListener('keydown', unlock);
    this.startAttract();
    UI.show('title');
    const join = new URLSearchParams(location.search).get('join');
    if (join) {
      UI.show('online');
      document.getElementById('join-code').value = join.toUpperCase();
      UI.toast('Click Join to enter room ' + join.toUpperCase());
    }
    const P = new URLSearchParams(location.search);
    if (P.get('demo')) {
      // debug/screenshot mode: a live bot-vs-bot match in the given arena
      const s = new HostSession({ mode: 'attract', arena: P.get('demo'), length: 180, players: ATTRACT_PLAYERS, seed: +(P.get('seed') || 3), hooks: this.hooks(true) });
      this.setSession(s, 'attract');
      this.demo = true;
      const warp = +(P.get('warp') || 0);
      for (let k = 0; k < warp * 60; k++) s.update(TICK, [NO_INPUT, NO_INPUT]);
      UI.show(P.get('screen') || null);
    } else if (P.get('loopguest')) {
      // debug: render the GUEST's view of a bot-vs-bot online match over a fake 60ms link
      const q = []; let now = 0;
      const mk = (to) => ({ onMessage: null, send(m) { q.push({ at: now + 0.06, to, m: JSON.parse(JSON.stringify(m)) }); } });
      const A = mk('B'), B = mk('A'), L = { A, B };
      const arena = P.get('loopguest');
      const host = new HostSession({ mode: 'online', arena, length: 180, players: ATTRACT_PLAYERS, link: A, seed: 4 });
      const guest = new GuestSession({ start: { arena, length: 180, players: ATTRACT_PLAYERS }, link: B, hooks: this.hooks(true) });
      const hb = new Bot(0, 2, 1), gb = new Bot(1, 2, 2);
      const wrap = {
        update(dt) {
          now += dt;
          for (let i = 0; i < q.length; i++) if (q[i].at <= now) { const it = q.splice(i--, 1)[0]; const l = L[it.to]; if (l.onMessage) l.onMessage(it.m); }
          host.update(dt, [hb.input(host.match), null]);
          guest.update(dt, [gb.input({ cars: [guest.other, guest.me], ball: guest.ball, ballLive: guest.ballLive, phase: guest.phase, time: guest.time, ar: guest.ar, pads: guest.pads })]);
        },
        vm() { return guest.vm(); },
      };
      this.setSession(wrap, 'attract');
      this.demo = true;
      for (let k = 0; k < +(P.get('warp') || 0) * 60; k++) wrap.update(TICK);
      UI.show(null);
    } else if (P.get('screen') === 'results') {
      const st = (g, s, sv, t, h) => ({ goals: g, shots: s, saves: sv, touches: t, topHit: h });
      UI.showResults({ title: 'VICTORY', col: '#ffd25a', score: [4, 2], players: ATTRACT_PLAYERS, stats: [st(4, 9, 3, 41, 1012), st(2, 6, 1, 33, 870)], note: 'MVP: Blaze' });
    } else if (P.get('screen')) UI.show(P.get('screen'));
    this.wireOnline();
    this.wireGameButtons();
    this.startBgTicker();
    // debug hooks for automated two-browser tests
    if (P.get('autohost')) { this.autoStart = true; UI.show('online'); this.hostRoom(); }
    if (P.get('autojoin') && join) setTimeout(() => this.joinRoom(), 500);
    if (P.get('debug')) setInterval(() => {
      const v = this.session.vm();
      document.title = `role=${this.lobbyRole} code=${Net.code} mode=${this.mode} phase=${v.phase} score=${v.score} clock=${Math.round(v.clock)} peer=${this.peer ? this.peer.name : '-'} ui=${UI.cur}`;
    }, 500);
    if (document.fonts) document.fonts.ready.then(() => { UI.buildArenaPicks(); });
    requestAnimationFrame((t) => this.loop(t));
  },

  profile() { return { name: Settings.data.name || 'Driver', paint: Settings.data.paint, body: Settings.data.body }; },
  pickArena() { return Settings.data.arena === 'random' ? ARENAS[(Math.random() * ARENAS.length) | 0].id : Settings.data.arena; },

  music(id) { this.wantMusic = id; Music.play(id); UI.nowPlaying(); },
  menuMusic(screen) { if (this.mode === 'attract') this.music(screen === 'garage' ? 'garage' : 'title'); },

  hooks(quiet) {
    return {
      fx: (e) => this.onFx(e, quiet),
      emote: (i, idx) => this.showEmote(i, idx),
      net: (m) => this.onNet(m),
    };
  },

  setSession(s, mode, scheme) {
    this.session = s;
    this.mode = mode;
    this.scheme = scheme || 'solo';
    this.kickoffs = 0;
    this.lastCount = null;
    this.overShown = false;
    this.r.parts.length = 0;
    this.r.banner = null;
    this.r.emotes = [];
    document.getElementById('chatbar').classList.toggle('hidden', mode === 'attract');
  },

  startAttract() {
    const s = new HostSession({ mode: 'attract', arena: ARENAS[(Math.random() * ARENAS.length) | 0].id, length: 9999, players: ATTRACT_PLAYERS, hooks: this.hooks(true) });
    this.setSession(s, 'attract');
    this.music('title');
  },

  startBot() {
    const lv = Settings.data.difficulty;
    const me = this.profile();
    const botPaint = me.paint === 1 ? 0 : 1;
    const opts = { mode: 'bot', arena: this.pickArena(), length: MATCH_LENGTHS[Settings.data.length], level: lv, players: [me, { name: BOT_LEVELS[lv].name + ' Bot', paint: botPaint, body: (lv + 1) % 3 }] };
    this.lastOpts = opts;
    this.beginMatch(new HostSession(Object.assign({ hooks: this.hooks(false) }, opts)), 'bot', 'solo');
  },

  startLocal() {
    const me = this.profile();
    let p2 = Settings.data.p2paint;
    if (p2 === me.paint) p2 = (p2 + 1) % PAINTS.length;
    const opts = { mode: 'local', arena: this.pickArena(), length: MATCH_LENGTHS[Settings.data.length], players: [Object.assign({}, me, { name: me.name }), { name: 'Player 2', paint: p2, body: (me.body + 1) % 3 }] };
    this.lastOpts = opts;
    this.beginMatch(new HostSession(Object.assign({ hooks: this.hooks(false) }, opts)), 'local', 'local');
  },

  beginMatch(session, mode, scheme) {
    Snd.init();
    this.setSession(session, mode, scheme);
    UI.show(null);
    this.music(session.vm().ar.music);
    this.rematch = { me: false, them: false };
  },

  // ------------------------------ events ----------------------------------
  onFx(e, quiet) {
    const vm = this.session ? this.session.vm() : null;
    this.r.fx(e, vm);
    if (e.k === 'over') return this.onOver(e);
    if (quiet) return;
    const S = (n, o) => Snd.play(n, o);
    switch (e.k) {
      case 'hit': if (!e.dup) S('hit', { x: e.x, s: e.s }); break;
      case 'wall': S('wall', { x: e.x, s: e.s }); if (e.post && e.s > 260) { S('post', { x: e.x }); S('ooh'); } break;
      case 'bounce': S('bounce', { x: e.x, s: e.s }); break;
      case 'bump': S('bump', { x: e.x, s: e.s }); break;
      case 'cwall': S('cwall', { x: e.x, s: e.s }); break;
      case 'hop': S('hop', { x: e.x }); break;
      case 'land': S('land', { x: e.x }); break;
      case 'pad': S('pad', { x: PADS[e.p].x, big: PADS[e.p].big }); break;
      case 'goal': S('goal', { x: e.x }); break;
      case 'save': S('save', {}); break;
      case 'go': S('go'); break;
      case 'overtime': S('overtime'); this.music('overtime'); break;
      case 'reset': this.kickoffs++; break;
    }
  },

  onOver(e) {
    if (this.mode === 'attract') { setTimeout(() => { if (this.mode === 'attract') this.startAttract(); }, 3000); return; }
    if (this.overShown) return;
    this.overShown = true;
    Snd.play('whistle');
    const vm = this.session.vm();
    const my = vm.myIdx;
    const winner = e.w;
    let title, col;
    if (my < 0) { title = `${vm.players[winner].name} wins!`; col = PAINTS[vm.players[winner].paint].c; }
    else if (winner === my) { title = 'VICTORY'; col = '#ffd25a'; }
    else { title = 'DEFEAT'; col = '#ff6b6b'; }
    if (this.mode === 'bot' && my >= 0) {
      const rec = Settings.data.record[this.lastOpts.level] || [0, 0];
      rec[winner === my ? 0 : 1]++;
      Settings.data.record[this.lastOpts.level] = rec;
      Settings.save();
    }
    setTimeout(() => {
      Music.jingle(my < 0 || winner === my ? 'victory' : 'defeat');
      setTimeout(() => this.music('garage'), 2600);
      const stats = e.stats;
      const mvp = (stats[0].goals * 100 + stats[0].saves * 50 + stats[0].shots * 20) >= (stats[1].goals * 100 + stats[1].saves * 50 + stats[1].shots * 20) ? 0 : 1;
      UI.showResults({ title, col, score: e.sc, players: vm.players, stats, note: `MVP: ${vm.players[mvp].name}`, canRematch: true });
      if (this.mode === 'online') document.getElementById('res-note').textContent += this.rematch.them ? ' · Your opponent wants a rematch!' : '';
    }, 1600);
  },

  showEmote(i, idx) {
    if (!this.session || idx == null || !EMOTES[idx]) return;
    this.r.emote(i, EMOTES[idx]);
    Snd.play('emote', { x: this.session.vm().cars[i].x });
  },

  onKey(code) {
    if (this.mode === 'attract') return;
    const s = this.session;
    if (code === 'Escape') {
      if (UI.cur === 'pause') this.resume();
      else if (!UI.cur) this.pause();
      return;
    }
    if (UI.cur) return;
    const vm = s.vm();
    if (vm.phase === 'replay' && ['Space', 'Enter', 'NumpadEnter'].includes(code)) s.skipReplay();
    const m = /^Digit([1-5])$/.exec(code);
    if (m) {
      const idx = +m[1] - 1;
      const me = vm.myIdx >= 0 ? vm.myIdx : 0;
      if (this.emoteCd > performance.now()) return;
      this.emoteCd = performance.now() + 1200;
      this.showEmote(me, idx);
      if (s.emote && this.mode === 'online') s.emote(idx);
    }
  },

  pause() {
    if (!this.session || this.mode === 'attract') return;
    if (this.mode !== 'online') this.session.paused = true;
    document.getElementById('pause-note').textContent = this.mode === 'online' ? 'The match keeps running while this menu is open.' : '';
    UI.show('pause');
  },
  resume() { if (this.session) this.session.paused = false; UI.show(null); },

  wireGameButtons() {
    document.getElementById('btn-resume').addEventListener('click', () => this.resume());
    document.getElementById('btn-quit').addEventListener('click', () => this.quitToMenu());
    document.getElementById('btn-menu').addEventListener('click', () => this.quitToMenu());
    document.getElementById('btn-rematch').addEventListener('click', () => {
      Snd.play('ui');
      if (this.mode === 'online') {
        this.rematch.me = true;
        this.link && this.link.send({ t: 'rematch' });
        document.getElementById('btn-rematch').disabled = true;
        document.getElementById('res-note').textContent = 'Waiting for your opponent to accept…';
        this.tryRematch();
        return;
      }
      const o = Object.assign({}, this.lastOpts, { arena: Settings.data.arena === 'random' ? this.pickArena() : this.lastOpts.arena });
      this.lastOpts = o;
      this.beginMatch(new HostSession(Object.assign({ hooks: this.hooks(false) }, o)), this.mode, this.scheme);
    });
  },

  quitToMenu() {
    if (this.mode === 'online') { if (this.link) this.link.send({ t: 'bye' }); this.leaveOnline(); }
    this.startAttract();
    UI.show('title');
  },

  // ------------------------------- online ---------------------------------
  wireOnline() {
    document.getElementById('btn-host').addEventListener('click', () => this.hostRoom());
    document.getElementById('btn-join').addEventListener('click', () => this.joinRoom());
    document.getElementById('join-code').addEventListener('keydown', (e) => { if (e.key === 'Enter') this.joinRoom(); });
    document.getElementById('btn-copy').addEventListener('click', () => {
      const url = location.origin + location.pathname + '?join=' + Net.code;
      (navigator.clipboard ? navigator.clipboard.writeText(url) : Promise.reject()).then(() => UI.toast('Invite link copied!'), () => UI.toast(url, false, 8000));
    });
    document.getElementById('btn-start-online').addEventListener('click', () => this.hostStartMatch());
  },

  openOnline() {
    this.lobbyRole = null;
    document.getElementById('online-start').classList.remove('hidden');
    document.getElementById('online-lobby').classList.add('hidden');
  },

  leaveOnline() {
    Net.close();
    this.link = null; this.peer = null; this.lobbyRole = null;
  },

  lobbyUI() {
    const host = this.lobbyRole === 'host';
    document.getElementById('online-start').classList.add('hidden');
    document.getElementById('online-lobby').classList.remove('hidden');
    document.getElementById('room-code-wrap').classList.toggle('hidden', !host);
    document.getElementById('lobby-host-opts').classList.toggle('hidden', !host);
    document.getElementById('btn-start-online').classList.toggle('hidden', !host);
    const me = this.profile(), them = this.peer;
    const who = (p) => p ? `<span class="who"><span class="dot" style="background:${PAINTS[p.paint].c}"></span>${esc(p.name)}</span>` : '<span class="who muted">waiting…</span>';
    document.getElementById('lobby-versus').innerHTML = host ? `${who(me)}<span class="vs">VS</span>${who(them)}` : `${who(them)}<span class="vs">VS</span>${who(me)}`;
    const st = document.getElementById('lobby-status');
    if (host) {
      st.textContent = them ? `${them.name} joined! Pick an arena and start.` : 'Waiting for your opponent… share the code!';
      st.classList.toggle('ok', !!them);
      document.getElementById('btn-start-online').disabled = !them;
    } else {
      const l = this.lobbyInfo;
      st.textContent = them ? `Connected! Waiting for ${them.name} to start${l ? ` · ${l.arena === 'random' ? 'Random arena' : arenaById(l.arena).name}, ${MATCH_LENGTH_NAMES[l.length]}` : ''}…` : 'Connecting…';
      st.classList.toggle('ok', !!them);
    }
  },

  lobbyChanged() {
    if (this.lobbyRole === 'host' && this.link) this.link.send({ t: 'lobby', arena: Settings.data.arena, length: Settings.data.length });
  },

  netCallbacks() {
    return {
      ready: (code) => { document.getElementById('room-code').textContent = code; this.lobbyUI(); },
      connect: (link) => {
        this.link = link;
        link.onMessage = (m) => this.onNet(m);
        link.onClose = () => this.onDisconnect();
        link.send({ t: 'hello', v: NET_VERSION, ...this.profile() });
        this.lobbyUI();
      },
      error: (msg) => { UI.toast(msg, true, 5000); if (this.mode !== 'online') { this.leaveOnline(); this.openOnline(); } },
    };
  },

  hostRoom() {
    Snd.init();
    this.lobbyRole = 'host';
    this.peer = null;
    document.getElementById('room-code').textContent = '····';
    this.lobbyUI();
    Net.host(this.netCallbacks());
  },

  joinRoom() {
    Snd.init();
    const code = document.getElementById('join-code').value;
    this.lobbyRole = 'guest';
    this.peer = null;
    this.lobbyInfo = null;
    this.lobbyUI();
    Net.join(code, this.netCallbacks());
  },

  onNet(m) {
    switch (m.t) {
      case 'hello':
        if (m.v !== NET_VERSION) { UI.toast('Your friend is on a different version of the game. Both refresh the page!', true, 6000); }
        this.peer = { name: String(m.name || 'Rival').slice(0, 14), paint: clamp(m.paint | 0, 0, PAINTS.length - 1), body: clamp(m.body | 0, 0, BODIES.length - 1) };
        Snd.play('pad', { big: true });
        if (this.lobbyRole === 'host') this.lobbyChanged();
        if (this.mode !== 'online') this.lobbyUI();
        if (this.autoStart && this.lobbyRole === 'host') setTimeout(() => this.hostStartMatch(), 1000);
        break;
      case 'lobby': this.lobbyInfo = m; if (this.mode !== 'online') this.lobbyUI(); break;
      case 'full': UI.toast('That room is already full.', true); this.leaveOnline(); this.openOnline(); break;
      case 'start': this.guestStart(m); break;
      case 'rematch':
        this.rematch.them = true;
        UI.toast(`${this.peer ? this.peer.name : 'Opponent'} wants a rematch!`);
        if (UI.cur === 'results' && !this.rematch.me) document.getElementById('res-note').textContent = 'Your opponent wants a rematch! Press Rematch to play again.';
        this.tryRematch();
        break;
      case 'bye': UI.toast(`${this.peer ? this.peer.name : 'Your opponent'} left the match.`, true, 4500); this.leaveOnline(); this.startAttract(); UI.show('title'); break;
    }
  },

  tryRematch() {
    if (this.lobbyRole === 'host' && this.rematch.me && this.rematch.them) this.hostStartMatch();
  },

  onDisconnect() {
    if (!this.link) return;
    UI.toast('Connection to your opponent was lost.', true, 5000);
    this.leaveOnline();
    if (this.mode === 'online') { this.startAttract(); UI.show('title'); }
    else this.openOnline();
  },

  hostStartMatch() {
    if (!this.link || !this.peer) return;
    const me = this.profile(), them = Object.assign({}, this.peer);
    if (them.paint === me.paint) them.paint = (them.paint + 1) % PAINTS.length;
    const start = { t: 'start', arena: this.pickArena(), length: MATCH_LENGTHS[Settings.data.length], players: [me, them], seed: (Math.random() * 1e9) | 0 };
    this.link.send(start);
    const s = new HostSession({ mode: 'online', arena: start.arena, length: start.length, players: start.players, seed: start.seed, link: this.link, hooks: this.hooks(false) });
    this.beginMatch(s, 'online', 'solo');
  },

  guestStart(m) {
    const s = new GuestSession({ start: m, link: this.link, hooks: this.hooks(false) });
    this.beginMatch(s, 'online', 'solo');
  },

  // Browsers pause requestAnimationFrame in hidden tabs. In an online match
  // that would freeze the game for the other player, so a worker timer keeps
  // the simulation (and the network) ticking while we're in the background.
  startBgTicker() {
    try {
      const src = 'let iv=null;onmessage=(e)=>{clearInterval(iv);if(e.data)iv=setInterval(()=>postMessage(0),16);};';
      this.worker = new Worker(URL.createObjectURL(new Blob([src], { type: 'text/javascript' })));
      this.worker.onmessage = () => {
        if (!document.hidden || this.mode !== 'online' || !this.session) return;
        const now = performance.now();
        const dt = Math.min(0.05, (now - (this.bgLast || now)) / 1000);
        this.bgLast = now;
        this.session.update(dt, [NO_INPUT, NO_INPUT]);
      };
      this.worker.postMessage(1);
    } catch (e) { /* workers unavailable (e.g. file://): background ticking disabled */ }
  },

  // ------------------------------ frame loop ------------------------------
  loop(t) {
    const dt = Math.min(0.05, (t - (this.last || t)) / 1000);
    this.last = t;
    this.bgLast = performance.now();
    try { this.frame(dt); } catch (e) { console.error(e); }
    requestAnimationFrame((tt) => this.loop(tt));
  },

  frame(dt) {
    const s = this.session;
    const playing = this.mode !== 'attract';
    const inputs = playing && !UI.cur ? Input.sample(this.scheme) : [NO_INPUT, NO_INPUT];
    if (playing && UI.cur === 'pause' && this.mode === 'online') inputs[0] = NO_INPUT;
    s.update(dt, inputs);
    const vm = s.vm();
    // first kickoff: show the controls
    if (playing && this.kickoffs <= 1 && vm.phase === 'kickoff') {
      vm.hint = this.scheme === 'local'
        ? ['P1: WASD · L-Shift boost · Space hop', 'P2: Arrows · R-Shift boost · Enter hop']
        : ['W/S drive · A/D steer · SHIFT boost · SPACE hop', '1–5 quick chat · ESC menu'];
    }
    vm.attract = this.mode === 'attract' && !this.demo;
    this.r.draw(vm, dt);
    if (UI.cur === 'garage') UI.drawGarage(this.r, performance.now() / 1000);

    if (!Snd.enabled) return;
    // countdown beeps
    if (playing && vm.phase === 'kickoff') {
      const n = Math.ceil(vm.phaseT);
      if (n !== this.lastCount && n <= 3 && n >= 1) Snd.play('beep');
      this.lastCount = n;
    } else this.lastCount = null;
    // engines + boost whooshes
    if (playing && vm.phase !== 'replay') {
      const cars = vm.cars.map((c, i) => ({ x: c.x, vx: c.vx, vy: c.vy, throttle: c.throttle, boosting: c.boosting, quiet: vm.myIdx >= 0 && i !== vm.myIdx }));
      Snd.updateEngines(cars, dt);
      vm.cars.forEach((c, i) => { if (c.boosting && !this.prevBoost[i] && (vm.myIdx < 0 || vm.myIdx === i)) Snd.play('boost', { x: c.x }); this.prevBoost[i] = c.boosting; });
    } else Snd.updateEngines([], dt);
    // crowd anticipation
    let crowd = playing ? 0.12 : 0.05;
    if (playing && vm.ballLive && (vm.ball.x < FIELD.l + 180 || vm.ball.x > FIELD.r - 180) && Math.abs(vm.ball.y - CY) < 160) crowd = 0.32;
    if (vm.phase === 'goal' || vm.phase === 'over') crowd = 0.3;
    Snd.setCrowd(crowd);
  },
};

window.addEventListener('load', () => App.init());
