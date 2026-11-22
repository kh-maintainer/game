'use strict';
// ---------------------------------------------------------------------------
// Bootstrap + main loop.
// ---------------------------------------------------------------------------

const app = {
  game: null,
  renderer: null,
  ui: null,
  hadSave: false,
  pendingOffline: null,

  start() {
    buildSprites();
    Sound.loadSettings();
    const params = new URLSearchParams(location.search);
    let game = params.has('new') ? null : Game.load();
    this.hadSave = !!game;
    if (!game) game = new Game();
    this.game = game;
    this.renderer = new Renderer($('#view'), game);
    Net.init(this);
    this.ui = new UI(this);
    window.addEventListener('pointerdown', () => Sound.unlock());
    window.addEventListener('keydown', () => Sound.unlock());

    if (this.hadSave && game.offlineSeconds > 30 && game.incomeRate > 0) {
      const secs = Math.min(game.offlineSeconds, OFFLINE_CAP_SECONDS);
      const away = game.offlineSeconds;
      const earned = game.grantIncome(secs, game.offlineEfficiency());
      this.pendingOffline = () => {
        this.pendingOffline = null;
        this.ui.modal(`<h2>Welcome back!</h2><p>You were away for <b>${fmtTime(away)}</b>.</p>
          <p>Your factory earned <b class="gold">$${fmt(earned)}</b> while you were gone (${Math.round(game.offlineEfficiency() * 100)}% efficiency).</p>
          <div class="mbtns"><button id="m-ok" class="gold-btn">Collect</button></div>`, true);
        $('#m-ok').onclick = () => { Sound.play('buy'); this.ui.closeModal(); };
      };
    }

    if (params.has('demo')) {
      buildDemo(game);
    } else if (params.get('join')) {
      this.ui.showCoop();
      const inp = $('#m-code');
      if (inp) inp.value = params.get('join').toUpperCase().slice(0, 5);
    } else {
      this.ui.showTitle(this.hadSave);
    }

    setInterval(() => this.game.save(), 15000);
    window.addEventListener('beforeunload', () => this.game.save());
    document.addEventListener('visibilitychange', () => { if (document.hidden) this.game.save(); });

    this.last = performance.now();
    this.acc = 0;
    requestAnimationFrame((t) => this.frame(t));
  },

  swapGame(g) {
    this.game = g;
    this.renderer.setGame(g);
    this.ui.select(null);
    this.ui.selectTool(null);
    this.ui.lastSellCount = g.sellCount;
    this.ui.miniSeed = null;
    g.dirty = true;
  },

  loadSolo() {
    this.swapGame(Game.load() || new Game());
  },

  loadData(data) {
    const g = Game.fromData(data);
    this.swapGame(g);
    g.save();
  },

  wipe() {
    Net.leave(true);
    localStorage.removeItem(SAVE_KEY);
    this.swapGame(new Game());
    this.ui.renderNet();
    this.ui.showHelp();
  },

  frame(now) {
    let dt = (now - this.last) / 1000;
    this.last = now;
    if (dt > 1 && Net.role !== 'guest') {
      // tab was in the background: credit income instead of simulating it all
      this.game.grantIncome(dt - 0.25, 1);
      dt = 0.25;
    }
    dt = Math.min(dt, 0.25);
    this.acc += dt;
    let steps = 0;
    while (this.acc >= TICK && steps++ < 10) {
      this.game.update(TICK);
      this.acc -= TICK;
    }
    if (steps >= 10) this.acc = 0;
    if (this.ui.titleOpen) { this.renderer.cam.x += dt * 0.9; this.renderer.cam.y += dt * 0.25; this.renderer.clampCamera(); }
    this.renderer.update(dt);
    Net.update(dt, this.ui.input);
    const partner = Net.partner && Net.connected() ? { cursor: Net.partner.cursor, name: Net.partner.name, color: Net.partnerColor() } : null;
    this.renderer.draw(this.ui.input, partner);
    this.ui.update(dt);
    requestAnimationFrame((t) => this.frame(t));
  },
};

// Pre-built factory for screenshots / testing (?demo&new).
function buildDemo(g) {
  g.money = 1e9;
  for (const id in RESEARCH) g.research[id] = true;
  g.land = 3;
  const c = g.center();
  const y = c.y;
  // clear water around the showcase so every line can be built
  for (let dy = -8; dy <= 8; dy++) for (let dx = -12; dx <= 10; dx++) g.water[(y + dy) * g.w + c.x + dx] = 0;
  const ore = (x, yy, type) => { g.ore[yy * g.w + x] = type; };
  // iron line: 3 miners -> belt -> smelter -> assembler (gears) -> market
  for (let x = c.x - 9; x < c.x - 3; x++) g.place('belt', x, y, 0);
  g.place('smelter', c.x - 3, y, 0);
  g.place('assembler', c.x - 2, y, 0);
  g.place('belt', c.x - 1, y, 0);
  for (let x = c.x - 9; x < c.x - 6; x++) { ore(x, y - 1, 'iron_ore'); g.place('miner', x, y - 1, 1); }
  for (let x = c.x - 9; x < c.x - 6; x++) ore(x, y + 1, 'iron_ore');
  // copper line from the north: curve -> chest -> market
  ore(c.x - 2, y - 4, 'copper_ore'); ore(c.x - 1, y - 5, 'copper_ore');
  g.place('miner', c.x - 2, y - 4, 0);
  g.place('miner', c.x - 1, y - 5, 1);
  g.place('belt', c.x - 1, y - 4, 0);
  g.place('belt', c.x, y - 4, 1);
  g.place('belt', c.x, y - 3, 1);
  g.place('chest', c.x, y - 2, 1);
  g.place('belt', c.x, y - 1, 1);
  // stone line from the east travelling underground into the market
  ore(c.x + 6, y, 'stone');
  g.place('miner', c.x + 6, y, 2);
  g.place('belt', c.x + 5, y, 2);
  g.place('tunnel', c.x + 4, y, 2);
  g.place('tunnel', c.x + 1, y, 2);
  // copper from the south through a smelter
  for (let x = c.x - 3; x <= c.x - 1; x++) ore(x, y + 4, 'copper_ore');
  for (let x = c.x - 3; x <= c.x - 1; x++) g.place('miner', x, y + 4, 3);
  for (let x = c.x - 3; x <= c.x - 1; x++) g.place('belt', x, y + 3, 0);
  g.place('belt', c.x, y + 3, 3);
  g.place('smelter', c.x, y + 2, 3);
  g.place('belt', c.x, y + 1, 3);
  // set pieces
  g.place('foundry', c.x + 3, y - 3, 2);
  g.place('launchpad', c.x + 6, y - 4, 0);
  g.at(c.x + 6, y - 4).count = 90;
  g.money = 1e9;
  app.renderer.terrain = renderTerrain(g);
  app.renderer.cam.zoom = 4;
  app.renderer.cam.x = c.x;
}

window.addEventListener('load', () => app.start());
