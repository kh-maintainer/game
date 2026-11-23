'use strict';
// ---------------------------------------------------------------------------
// Online play over WebRTC (PeerJS): peer-to-peer, no game server. The host
// registers "turboball-v1-<CODE>" on the free PeerJS broker; the guest
// connects to that id. Messages are small JSON objects.
// ---------------------------------------------------------------------------

const NET_PREFIX = 'turboball-v1-';
const NET_VERSION = 1;
const CODE_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

const Net = {
  peer: null, conn: null, role: null, code: null, link: null,

  available() { return typeof Peer !== 'undefined'; },

  makeLink(conn) {
    const link = {
      onMessage: null, onClose: null,
      send(m) { if (conn.open) { try { conn.send(m); } catch (e) { /* channel closing */ } } },
    };
    conn.on('data', (d) => { if (link.onMessage) link.onMessage(d); });
    conn.on('close', () => { if (link.onClose) link.onClose(); });
    conn.on('error', (e) => console.warn('conn error', e));
    return link;
  },

  // cb: { ready(code), connect(link), error(msg) }
  host(cb) {
    if (!this.available()) return cb.error('Online play needs an internet connection (PeerJS failed to load).');
    this.close();
    this.role = 'host';
    this.code = Array.from({ length: 4 }, () => CODE_CHARS[(Math.random() * CODE_CHARS.length) | 0]).join('');
    const peer = this.peer = new Peer(NET_PREFIX + this.code, { debug: 1 });
    peer.on('open', () => cb.ready(this.code));
    peer.on('connection', (conn) => {
      if (this.conn && this.conn.open) { conn.on('open', () => { conn.send({ t: 'full' }); setTimeout(() => conn.close(), 400); }); return; }
      conn.on('open', () => {
        this.conn = conn;
        this.link = this.makeLink(conn);
        cb.connect(this.link);
      });
    });
    peer.on('disconnected', () => { if (!peer.destroyed) peer.reconnect(); });
    peer.on('error', (e) => {
      if (e.type === 'unavailable-id') return this.host(cb);
      cb.error(e.type === 'network' || e.type === 'server-error' || e.type === 'socket-error' ? 'Could not reach the matchmaking server. Check your connection.' : 'Connection error: ' + e.type);
    });
  },

  join(code, cb) {
    if (!this.available()) return cb.error('Online play needs an internet connection (PeerJS failed to load).');
    code = (code || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (code.length !== 4) return cb.error('Room codes are 4 characters.');
    this.close();
    this.role = 'guest';
    this.code = code;
    const peer = this.peer = new Peer({ debug: 1 });
    const timeout = setTimeout(() => { if (!this.conn) cb.error(`Couldn't reach room ${code}. Check the code and that the host is still waiting.`); }, 15000);
    peer.on('open', () => {
      const conn = peer.connect(NET_PREFIX + code, { reliable: true, serialization: 'json' });
      conn.on('open', () => {
        clearTimeout(timeout);
        this.conn = conn;
        this.link = this.makeLink(conn);
        cb.connect(this.link);
      });
    });
    peer.on('error', (e) => {
      clearTimeout(timeout);
      cb.error(e.type === 'peer-unavailable' ? `Room ${code} doesn't exist (or the host left).` : 'Connection error: ' + e.type);
    });
  },

  close() {
    if (this.conn) { try { this.conn.close(); } catch (e) { /* ignore */ } }
    if (this.peer) { try { this.peer.destroy(); } catch (e) { /* ignore */ } }
    this.conn = null; this.peer = null; this.link = null; this.role = null; this.code = null;
  },
};
