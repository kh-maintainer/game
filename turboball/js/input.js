'use strict';
// ---------------------------------------------------------------------------
// Input: keyboard (one or two players on one keyboard), mouse buttons and
// gamepads, merged into { throttle, steer, boost, hop } per player.
// ---------------------------------------------------------------------------

const KEYMAP = {
  // scheme 'solo': every key below drives player 0
  p1: { up: ['KeyW'], down: ['KeyS'], left: ['KeyA'], right: ['KeyD'], boost: ['ShiftLeft', 'KeyJ'], hop: ['Space', 'KeyK'] },
  p2: { up: ['ArrowUp'], down: ['ArrowDown'], left: ['ArrowLeft'], right: ['ArrowRight'], boost: ['ShiftRight', 'Slash', 'Numpad0'], hop: ['Enter', 'Period', 'NumpadEnter'] },
};

const Input = {
  keys: new Set(),
  pressedAt: {},
  mouse: { l: false, r: false, lAt: -9, rAt: -9 },
  handlers: [],
  now: 0,

  init() {
    window.addEventListener('keydown', (e) => {
      if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return;
      if (!e.repeat) this.pressedAt[e.code] = performance.now() / 1000;
      this.keys.add(e.code);
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Slash'].includes(e.code)) e.preventDefault();
      if (!e.repeat) for (const h of this.handlers) h(e.code, e);
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.keys.clear());
    const cv = document.getElementById('game');
    cv.addEventListener('mousedown', (e) => {
      const t = performance.now() / 1000;
      if (e.button === 0) { this.mouse.l = true; this.mouse.lAt = t; }
      if (e.button === 2) { this.mouse.r = true; this.mouse.rAt = t; }
    });
    window.addEventListener('mouseup', (e) => { if (e.button === 0) this.mouse.l = false; if (e.button === 2) this.mouse.r = false; });
    cv.addEventListener('contextmenu', (e) => e.preventDefault());
  },

  onKey(fn) { this.handlers.push(fn); },

  any(codes) { return codes.some((c) => this.keys.has(c)); },
  fresh(codes, win = 0.14) { const t = performance.now() / 1000; return codes.some((c) => this.keys.has(c) && t - (this.pressedAt[c] || -9) < win); },

  fromKeys(m) {
    return {
      throttle: (this.any(m.up) ? 1 : 0) - (this.any(m.down) ? 1 : 0),
      steer: (this.any(m.right) ? 1 : 0) - (this.any(m.left) ? 1 : 0),
      boost: this.any(m.boost),
      hop: this.fresh(m.hop),
    };
  },

  pads() {
    const out = [];
    const list = navigator.getGamepads ? navigator.getGamepads() : [];
    for (const gp of list) if (gp && gp.connected) out.push(gp);
    return out;
  },

  fromPad(gp, idx) {
    const t = performance.now() / 1000;
    const b = (i) => gp.buttons[i] && (gp.buttons[i].pressed || gp.buttons[i].value > 0.4);
    const val = (i) => (gp.buttons[i] ? gp.buttons[i].value : 0);
    let steer = gp.axes[0] || 0;
    if (Math.abs(steer) < 0.15) steer = 0;
    if (b(14)) steer = -1; if (b(15)) steer = 1;
    let throttle = val(7) - val(6);
    if (Math.abs(throttle) < 0.05) { const sy = -(gp.axes[1] || 0); if (Math.abs(sy) > 0.3) throttle = sy; if (b(12)) throttle = 1; if (b(13)) throttle = -1; }
    const hopNow = b(0);
    const key = 'pad' + idx;
    if (hopNow && !this.pressedAt[key + 'held']) this.pressedAt[key] = t;
    this.pressedAt[key + 'held'] = hopNow;
    return { throttle: clamp(throttle, -1, 1), steer: clamp(steer, -1, 1), boost: b(1) || b(2) || b(5), hop: hopNow && t - (this.pressedAt[key] || -9) < 0.14, start: b(9) };
  },

  merge(a, b) {
    if (!b) return a;
    return {
      throttle: Math.abs(b.throttle) > Math.abs(a.throttle) ? b.throttle : a.throttle,
      steer: Math.abs(b.steer) > Math.abs(a.steer) ? b.steer : a.steer,
      boost: a.boost || b.boost, hop: a.hop || b.hop,
    };
  },

  // scheme: 'solo' (one human, all keys) or 'local' (two humans)
  sample(scheme) {
    const pads = this.pads();
    const t = performance.now() / 1000;
    if (scheme === 'local') {
      let a = this.fromKeys(KEYMAP.p1), b = this.fromKeys(KEYMAP.p2);
      if (pads[0]) a = this.merge(a, this.fromPad(pads[0], 0));
      if (pads[1]) b = this.merge(b, this.fromPad(pads[1], 1));
      return [a, b];
    }
    let a = this.merge(this.fromKeys(KEYMAP.p1), this.fromKeys(KEYMAP.p2));
    a.boost = a.boost || this.mouse.l;
    a.hop = a.hop || (this.mouse.r && t - this.mouse.rAt < 0.14);
    for (let i = 0; i < pads.length; i++) a = this.merge(a, this.fromPad(pads[i], i));
    return [a, null];
  },
};
