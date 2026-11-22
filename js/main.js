'use strict';
// ---------------------------------------------------------------------------
// Bootstrap + main loop.
// ---------------------------------------------------------------------------

const app = {
  game: null,
  renderer: null,
  ui: null,

  start() {
    buildSprites();
    const params = new URLSearchParams(location.search);
    const fresh = params.has('new');
    let game = fresh ? null : Game.load();
    const isNew = !game;
    if (!game) game = new Game();
    this.game = game;
    this.renderer = new Renderer($('#view'), game);
    this.ui = new UI(this);

    if (params.has('demo')) buildDemo(game);

    if (isNew) {
      if (!params.has('demo')) this.ui.showHelp();
    } else if (game.offlineSeconds > 30 && game.incomeRate > 0) {
      const secs = Math.min(game.offlineSeconds, OFFLINE_CAP_SECONDS);
      const earned = game.grantIncome(secs, OFFLINE_EFFICIENCY);
      this.ui.modal(`<h2>Welcome back!</h2><p>You were away for <b>${fmtTime(game.offlineSeconds)}</b>.</p>
        <p>Your factory earned <b class="gold">$${fmt(earned)}</b> while you were gone.</p>
        <div class="mbtns"><button id="m-ok">Collect</button></div>`);
      $('#m-ok').onclick = () => this.ui.closeModal();
    }

    setInterval(() => this.game.save(), 15000);
    window.addEventListener('beforeunload', () => this.game.save());
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) this.game.save();
    });

    this.last = performance.now();
    this.acc = 0;
    requestAnimationFrame((t) => this.frame(t));
  },

  resetGame() {
    localStorage.removeItem(SAVE_KEY);
    this.game = new Game();
    this.renderer.setGame(this.game);
    this.ui.select(null);
    this.ui.selectTool(null);
    this.game.dirty = true;
  },

  frame(now) {
    let dt = (now - this.last) / 1000;
    this.last = now;
    if (dt > 1) {
      // tab was in the background: credit income at full rate instead of simulating it all
      this.game.grantIncome(dt - 0.25, 1);
      dt = 0.25;
    }
    this.acc += Math.min(dt, 0.25);
    let steps = 0;
    while (this.acc >= TICK && steps++ < 10) {
      this.game.update(TICK);
      this.acc -= TICK;
    }
    this.renderer.draw(this.ui.input);
    this.ui.update(dt);
    requestAnimationFrame((t) => this.frame(t));
  },
};

// Small pre-built factory for screenshots / testing (?demo&new).
function buildDemo(g) {
  g.money = 1e6;
  g.research = { splitter: true, assembly: true, electronics: true, metallurgy: true };
  const c = g.center();
  // a simple line: belts from left of the market, miners + smelter feeding it
  const y = c.y;
  for (let x = c.x - 8; x < c.x; x++) g.place('belt', x, y, 0);
  g.remove(c.x - 3, y);
  g.place('smelter', c.x - 3, y, 0);
  g.remove(c.x - 2, y);
  g.place('assembler', c.x - 2, y, 0);
  for (let x = c.x - 8; x < c.x - 4; x++) { g.ore[(y - 1) * g.w + x] = 'iron_ore'; g.place('miner', x, y - 1, 1); }
  for (let x = c.x - 8; x < c.x - 4; x++) { g.ore[(y + 1) * g.w + x] = 'iron_ore'; g.place('miner', x, y + 1, 3); }
  g.place('belt', c.x, y - 3, 1);
  g.place('belt', c.x, y - 2, 1);
  g.place('belt', c.x, y - 1, 1);
  g.place('splitter', c.x + 2, y + 2, 0);
  g.place('foundry', c.x + 3, y - 2, 2);
  g.money = 1e6;
  app.renderer.terrain = renderTerrain(g);
  app.renderer.cam.zoom = 4;
  app.renderer.cam.x = c.x - 2;
}

window.addEventListener('load', () => app.start());
