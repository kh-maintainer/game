'use strict';
// ---------------------------------------------------------------------------
// Online co-op (2 players) over WebRTC via PeerJS — no game server needed.
//
// Model: the HOST is authoritative. Every player action goes through
// Net.act(action):
//   - solo / host: applied immediately; the host forwards it to the guest.
//   - guest: sent to the host, which validates + applies it and echoes it back;
//     the guest applies the echo so both simulations stay in step.
// The host also sends a full state snapshot every couple of seconds to wipe
// out any drift (e.g. from random miner luck), and forwards achievements/goals.
// ---------------------------------------------------------------------------

const NET_PREFIX = 'pixelfoundry-coop-v1-';
const NET_PROTOCOL = 2;
const SNAPSHOT_EVERY = 2; // seconds
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const PLAYER_COLORS = { host: '#f2c94c', guest: '#7fe0ff' };

const Net = {
  role: 'solo', // 'solo' | 'host' | 'guest'
  app: null,
  peer: null,
  conn: null,
  code: null,
  status: 'offline',
  partner: null, // { name, cursor: {x,y,tool,rot}, seen }
  latency: null,
  snapTimer: 0,
  curTimer: 0,
  lastCursor: '',
  myName: 'Player',

  init(app) {
    this.app = app;
    this.myName = loadSettings().name || 'Player';
  },

  available() { return typeof Peer !== 'undefined'; },
  connected() { return !!(this.conn && this.conn.open); },
  myColor() { return PLAYER_COLORS[this.role === 'guest' ? 'guest' : 'host']; },
  partnerColor() { return PLAYER_COLORS[this.role === 'guest' ? 'host' : 'guest']; },

  setStatus(s) {
    this.status = s;
    if (this.app.ui) this.app.ui.renderNet();
  },

  // ------------------------------ hosting -----------------------------------
  host() {
    if (!this.available()) return this.fail('Co-op needs an internet connection (PeerJS failed to load).');
    this.leave(true);
    this.role = 'host';
    this.code = Array.from({ length: 5 }, () => CODE_CHARS[(Math.random() * CODE_CHARS.length) | 0]).join('');
    this.setStatus('starting');
    this.peer = new Peer(NET_PREFIX + this.code, { debug: 1 });
    this.peer.on('open', () => this.setStatus('waiting'));
    this.peer.on('connection', (conn) => {
      if (this.connected()) {
        conn.on('open', () => { conn.send({ t: 'full' }); setTimeout(() => conn.close(), 500); });
        return;
      }
      this.bind(conn);
    });
    this.peer.on('disconnected', () => { if (this.peer && !this.peer.destroyed) this.peer.reconnect(); });
    this.peer.on('error', (e) => {
      if (e.type === 'unavailable-id') return this.host(); // code collision — roll a new one
      if (e.type === 'network' || e.type === 'server-error' || e.type === 'socket-error') this.fail('Could not reach the matchmaking server.');
      else console.warn('peer error', e);
    });
  },

  // ------------------------------- joining ----------------------------------
  join(code) {
    if (!this.available()) return this.fail('Co-op needs an internet connection (PeerJS failed to load).');
    code = (code || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (code.length !== 5) return this.fail('Room codes are 5 characters.');
    if (this.role === 'solo') this.app.game.save(); // keep your own factory safe while visiting
    this.leave(true);
    this.role = 'guest';
    this.code = code;
    this.setStatus('connecting');
    this.peer = new Peer({ debug: 1 });
    const timeout = setTimeout(() => {
      if (this.role === 'guest' && !this.connected()) this.fail(`Couldn't find room ${code}. Check the code and that the host is online.`);
    }, 15000);
    this.peer.on('open', () => {
      const conn = this.peer.connect(NET_PREFIX + code, { reliable: true });
      conn.on('open', () => clearTimeout(timeout));
      this.bind(conn);
    });
    this.peer.on('error', (e) => {
      clearTimeout(timeout);
      if (e.type === 'peer-unavailable') this.fail(`Room ${code} doesn't exist (or the host closed it).`);
      else this.fail('Connection error: ' + e.type);
    });
  },

  bind(conn) {
    this.conn = conn;
    conn.on('open', () => {
      this.send({ t: 'hello', name: this.myName, v: NET_PROTOCOL });
      this.hb = setInterval(() => this.send({ t: 'hb', ts: performance.now() }), 2000);
    });
    conn.on('data', (d) => this.onData(d));
    conn.on('close', () => this.onClose());
    conn.on('error', (e) => console.warn('conn error', e));
  },

  // -------------------------------- leaving ---------------------------------
  leave(silent) {
    clearInterval(this.hb);
    const wasGuest = this.role === 'guest';
    if (this.conn) { try { this.conn.close(); } catch (e) { /* ignore */ } }
    if (this.peer) { try { this.peer.destroy(); } catch (e) { /* ignore */ } }
    this.conn = null;
    this.peer = null;
    this.partner = null;
    this.role = 'solo';
    this.code = null;
    this.latency = null;
    this.app.game.isGuest = false;
    if (wasGuest) this.app.loadSolo();
    if (!silent) this.setStatus('offline');
    else this.status = 'offline';
  },

  fail(msg) {
    this.leave(true);
    this.setStatus('offline');
    this.app.ui.alert('Co-op', msg);
  },

  onClose() {
    clearInterval(this.hb);
    const name = this.partner ? this.partner.name : 'Your partner';
    this.partner = null;
    this.conn = null;
    Sound.play('leave');
    if (this.role === 'host') {
      this.app.ui.toast(`${name} left the factory`);
      this.setStatus(this.peer && !this.peer.destroyed ? 'waiting' : 'offline');
    } else if (this.role === 'guest') {
      this.leave(true);
      this.setStatus('offline');
      this.app.ui.alert('Disconnected', `${name} closed the session. You're back in your own factory.`);
    }
  },

  send(msg) {
    if (this.connected()) {
      try { this.conn.send(msg); } catch (e) { console.warn('send failed', e); }
    }
  },

  // ------------------------------- messages ---------------------------------
  onData(d) {
    if (!d || typeof d !== 'object') return;
    const g = this.app.game;
    const ui = this.app.ui;
    switch (d.t) {
      case 'hello':
        if (d.v !== NET_PROTOCOL) {
          this.send({ t: 'bye', reason: 'Game versions differ — both players should refresh to the latest version.' });
          setTimeout(() => this.conn && this.conn.close(), 300);
          return;
        }
        this.partner = { name: String(d.name || 'Partner').slice(0, 16), cursor: null, seen: performance.now() };
        Sound.play('join');
        if (this.role === 'host') {
          ui.toast(`${this.partner.name} joined your factory!`);
          this.sendSnapshot();
          this.setStatus('connected');
        } else {
          this.setStatus('syncing');
        }
        break;
      case 'full':
        this.fail('That room already has two players.');
        break;
      case 'bye':
        this.fail(d.reason || 'The host ended the session.');
        break;
      case 'snap':
        if (this.role !== 'guest') return;
        g.isGuest = true;
        g.restore(d.state);
        if (this.status !== 'connected') {
          this.setStatus('connected');
          ui.toast(`Joined ${this.partner ? this.partner.name : 'host'}'s factory`);
          this.app.renderer.centerOn(g.center());
        }
        break;
      case 'act':
        if (this.role === 'host') {
          const res = g.apply(d.a);
          if (res.ok) {
            this.send({ t: 'act', a: d.a });
            ui.onRemoteAction(d.a, this.partner);
            if (d.a.type === 'prestige') this.sendSnapshot();
          } else {
            this.send({ t: 'nack', a: d.a, err: res.err });
          }
        } else if (this.role === 'guest') {
          g.apply(d.a);
        }
        break;
      case 'nack':
        if (d.err && d.err !== 'Tile occupied') ui.toast(d.err, true);
        break;
      case 'evt':
        if (this.role === 'guest') ui.handleEvent(d.e);
        break;
      case 'cur':
        if (this.partner) { this.partner.cursor = d.c; this.partner.seen = performance.now(); }
        break;
      case 'chat':
        ui.chatLine(this.partner ? this.partner.name : '?', String(d.text).slice(0, 200), this.partnerColor());
        Sound.play('chat');
        break;
      case 'ping':
        this.app.renderer.addPing(d.x, d.y, this.partnerColor());
        Sound.play('ping');
        break;
      case 'hb':
        this.send({ t: 'hba', ts: d.ts });
        break;
      case 'hba':
        this.latency = Math.round(performance.now() - d.ts);
        ui.renderNet();
        break;
    }
  },

  sendSnapshot() {
    this.snapTimer = 0;
    this.send({ t: 'snap', state: this.app.game.serialize() });
  },

  // ---------------------------- public helpers ------------------------------
  // Perform a game action respecting the co-op role. Returns {ok, err, pending}.
  act(a) {
    const g = this.app.game;
    if (this.role === 'guest') {
      if (!this.connected()) return { ok: false, err: 'Not connected' };
      // Cheap local pre-check for instant feedback; the host has the final word.
      if (a.type === 'place') {
        const err = g.placeError(a.b, a.x, a.y);
        if (err) return { ok: false, err };
      }
      this.send({ t: 'act', a });
      return { ok: true, pending: true };
    }
    const res = g.apply(a);
    if (res.ok && this.role === 'host') {
      this.send({ t: 'act', a });
      if (a.type === 'prestige') this.sendSnapshot();
    }
    return res;
  },

  forwardEvent(e) {
    if (this.role === 'host') this.send({ t: 'evt', e });
  },

  chat(text) {
    this.send({ t: 'chat', text });
  },

  ping(x, y) {
    this.send({ t: 'ping', x, y });
  },

  update(dt, input) {
    if (!this.connected()) return;
    if (this.role === 'host') {
      this.snapTimer += dt;
      if (this.snapTimer >= SNAPSHOT_EVERY) this.sendSnapshot();
    }
    this.curTimer += dt;
    if (this.curTimer >= 0.1) {
      this.curTimer = 0;
      const h = input.hover;
      const c = h ? { x: h.x, y: h.y, tool: input.tool, rot: input.rot } : null;
      const key = JSON.stringify(c);
      if (key !== this.lastCursor) {
        this.lastCursor = key;
        this.send({ t: 'cur', c });
      }
    }
  },
};

function loadSettings() {
  try { return JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}'); } catch (e) { return {}; }
}
function saveSettings(patch) {
  const s = Object.assign(loadSettings(), patch);
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
  return s;
}
