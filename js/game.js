'use strict';
// ---------------------------------------------------------------------------
// Core simulation: map, buildings, item flow, economy, save/load.
// ---------------------------------------------------------------------------

function mulberry32(a) {
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Per-building behaviour. `md` = movement direction of the incoming item.
const LOGIC = {
  belt: {
    init(b) { b.item = null; b.p = 0; },
    accepts(g, b, item, md) { return !b.item && md !== opp(b.dir); },
    insert(g, b, item) { b.item = item; b.p = 0; },
    update(g, b, dt) {
      if (!b.item) return;
      if (b.p < 1) b.p = Math.min(1, b.p + g.beltSpeed() * dt);
      if (b.p >= 1) {
        if (g.pushTo(b, b.item, b.dir)) b.item = null;
        else g.pending.push(b);
      }
    },
  },

  miner: {
    init(b) { b.t = 0; b.out = 0; },
    accepts() { return false; },
    update(g, b, dt) {
      const ore = g.oreAt(b.x, b.y);
      b.working = false;
      if (!ore) return;
      if (b.out < 1) {
        b.working = true;
        b.t += dt * g.minerRate();
        if (b.t >= 1) { b.t -= 1; b.out++; }
      }
      if (b.out > 0 && g.pushTo(b, ore, b.dir)) b.out--;
    },
  },

  crafter: {
    init(b) {
      b.inv = {};
      b.outQ = [];
      b.t = 0;
      if (!b.recipe) b.recipe = CRAFTERS[b.type];
    },
    accepts(g, b, item, md) {
      if (md === opp(b.dir)) return false; // never take input through the output face
      const r = RECIPES[b.recipe];
      if (r && r.in[item]) return (b.inv[item] || 0) < r.in[item] * 2;
      // smelters re-tune themselves when idle and empty
      if (b.type === 'smelter' && b.t === 0 && b.outQ.length === 0 && invEmpty(b.inv)) {
        return !!g.smelterRecipeFor(item);
      }
      return false;
    },
    insert(g, b, item) {
      const r = RECIPES[b.recipe];
      if (!r || !r.in[item]) {
        b.recipe = g.smelterRecipeFor(item);
        b.inv = {};
      }
      b.inv[item] = (b.inv[item] || 0) + 1;
    },
    update(g, b, dt) {
      const r = RECIPES[b.recipe];
      b.working = false;
      if (r && b.outQ.length === 0 && g.recipeUnlocked(b.recipe)) {
        let ready = true;
        for (const k in r.in) if ((b.inv[k] || 0) < r.in[k]) { ready = false; break; }
        if (ready) {
          b.working = true;
          b.t += (dt * g.craftMult()) / r.time;
          if (b.t >= 1) {
            b.t = 0;
            for (const k in r.in) b.inv[k] -= r.in[k];
            for (const k in r.out) for (let i = 0; i < r.out[k]; i++) b.outQ.push(k);
            g.stats.crafted[k0(r.out)] = (g.stats.crafted[k0(r.out)] || 0) + 1;
          }
        }
      }
      if (b.outQ.length && g.pushTo(b, b.outQ[0], b.dir)) b.outQ.shift();
    },
  },

  splitter: {
    init(b) { b.item = null; b.next = 0; },
    accepts(g, b, item, md) { return !b.item && md === b.dir; },
    insert(g, b, item) { b.item = item; },
    update(g, b) {
      if (!b.item) return;
      const outs = [b.dir, (b.dir + 3) % 4, (b.dir + 1) % 4];
      for (let i = 0; i < 3; i++) {
        const idx = (b.next + i) % 3;
        if (g.pushTo(b, b.item, outs[idx])) {
          b.item = null;
          b.next = (idx + 1) % 3;
          return;
        }
      }
    },
  },

  seller: {
    init(b) { b.acc = 0; b.flash = 0; b.timer = 0; },
    accepts() { return true; },
    insert(g, b, item) { b.acc += g.sell(item); b.flash = 0.15; },
    update(g, b, dt) {
      b.flash = Math.max(0, b.flash - dt);
      b.timer += dt;
      if (b.timer >= 0.8) {
        b.timer = 0;
        if (b.acc > 0) {
          g.floaters.push({ x: b.x + 0.5, y: b.y, text: '+$' + fmt(b.acc), life: 1.2 });
          b.acc = 0;
        }
      }
    },
  },
};
LOGIC.smelter = LOGIC.assembler = LOGIC.foundry = LOGIC.crafter;

function invEmpty(inv) {
  for (const k in inv) if (inv[k] > 0) return false;
  return true;
}
function k0(o) { for (const k in o) return k; }

class Game {
  constructor(seed) {
    this.newGame(seed);
  }

  newGame(seed) {
    this.seed = seed ?? ((Math.random() * 2 ** 31) | 0);
    this.w = MAP_W;
    this.h = MAP_H;
    this.ore = new Array(this.w * this.h).fill(null);
    this.grid = new Array(this.w * this.h).fill(null);
    this.buildings = [];
    this.money = START_MONEY;
    this.totalEarned = 0;
    this.upgrades = {};
    this.research = {};
    this.stats = { sold: {}, crafted: {}, playTime: 0 };
    this.earnBuckets = new Array(10).fill(0);
    this.bucketTimer = 0;
    this.incomeRate = 0;
    this.pending = [];
    this.floaters = [];
    this.time = 0;
    this.dirty = true; // UI needs a refresh
    this.generateOre();
    const c = this.center();
    this.place('seller', c.x, c.y, 0, true);
  }

  center() { return { x: (this.w / 2) | 0, y: (this.h / 2) | 0 }; }

  generateOre() {
    const rng = mulberry32(this.seed);
    const c = this.center();
    const blob = (type, bx, by, r) => {
      const R = Math.ceil(r);
      for (let dy = -R; dy <= R; dy++) {
        for (let dx = -R; dx <= R; dx++) {
          const x = bx + dx, y = by + dy;
          if (!this.inBounds(x, y)) continue;
          const d = Math.hypot(dx, dy);
          if (d <= r * (0.65 + 0.35 * rng())) this.ore[y * this.w + x] = type;
        }
      }
    };
    // Guaranteed starter patches around the market
    const base = rng() * Math.PI * 2;
    const starters = [
      ['iron_ore', 6.5, 3.6],
      ['stone', 8, 3],
      ['copper_ore', 11, 3.6],
      ['coal', 14, 3.2],
    ];
    starters.forEach(([type, dist, r], i) => {
      const a = base + i * (Math.PI / 2) + (rng() - 0.5) * 0.6;
      blob(type, Math.round(c.x + Math.cos(a) * dist), Math.round(c.y + Math.sin(a) * dist), r);
    });
    // Random patches further out — richer ones are bigger
    for (let i = 0; i < 42; i++) {
      const a = rng() * Math.PI * 2;
      const dist = 16 + rng() * 34;
      const roll = rng();
      const type = roll < 0.34 ? 'iron_ore' : roll < 0.6 ? 'copper_ore' : roll < 0.8 ? 'coal' : 'stone';
      blob(type, Math.round(c.x + Math.cos(a) * dist), Math.round(c.y + Math.sin(a) * dist), 2.5 + rng() * (2 + dist / 20));
    }
    // keep the spawn area clear
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) this.ore[(c.y + dy) * this.w + c.x + dx] = null;
  }

  inBounds(x, y) { return x >= 0 && y >= 0 && x < this.w && y < this.h; }
  oreAt(x, y) { return this.inBounds(x, y) ? this.ore[y * this.w + x] : null; }
  at(x, y) { return this.inBounds(x, y) ? this.grid[y * this.w + x] : null; }

  // ------------------------------ modifiers --------------------------------
  lvl(id) { return this.upgrades[id] || 0; }
  beltSpeed() { return BASE_BELT_SPEED * Math.pow(1.2, this.lvl('belt_speed')); }
  minerRate() { return BASE_MINER_RATE * Math.pow(1.25, this.lvl('miner_speed')); }
  craftMult() { return Math.pow(1.2, this.lvl('craft_speed')); }
  sellMult() { return Math.pow(1.15, this.lvl('sell_value')); }

  hasResearch(id) { return !!this.research[id]; }
  buildingUnlocked(type) { const u = BUILDINGS[type].unlock; return !u || this.hasResearch(u); }
  recipeUnlocked(id) { const u = RECIPES[id].unlock; return !u || this.hasResearch(u); }
  smelterRecipeFor(item) {
    for (const id in RECIPES) {
      const r = RECIPES[id];
      if (r.b === 'smelter' && r.in[item] && this.recipeUnlocked(id)) return id;
    }
    return null;
  }

  count(type) {
    let n = 0;
    for (const b of this.buildings) if (b.type === type) n++;
    return n;
  }
  cost(type) {
    const d = BUILDINGS[type];
    return Math.ceil(d.cost * Math.pow(d.growth, this.count(type)));
  }
  upgradeCost(id) {
    const u = UPGRADES[id];
    return Math.ceil(u.base * Math.pow(u.growth, this.lvl(id)));
  }

  // ------------------------------ building ---------------------------------
  placeError(type, x, y) {
    if (!this.inBounds(x, y)) return 'Out of bounds';
    if (this.at(x, y)) return 'Tile occupied';
    if (!this.buildingUnlocked(type)) return 'Not researched';
    if (type === 'miner' && !this.oreAt(x, y)) return 'Miners need ore';
    if (this.money < this.cost(type)) return 'Not enough money';
    return null;
  }

  place(type, x, y, dir, free = false) {
    if (!free && this.placeError(type, x, y)) return null;
    if (free && (!this.inBounds(x, y) || this.at(x, y))) return null;
    const price = free ? 0 : this.cost(type);
    this.money -= price;
    const b = { type, x, y, dir: BUILDINGS[type].dir ? dir : 0, paid: price };
    LOGIC[type].init(b);
    this.buildings.push(b);
    this.grid[y * this.w + x] = b;
    this.dirty = true;
    return b;
  }

  remove(x, y) {
    const b = this.at(x, y);
    if (!b) return 0;
    this.grid[y * this.w + x] = null;
    const i = this.buildings.indexOf(b);
    if (i >= 0) this.buildings.splice(i, 1);
    this.money += b.paid;
    this.dirty = true;
    return b.paid;
  }

  rotate(b, delta = 1) {
    if (BUILDINGS[b.type].dir) b.dir = (b.dir + delta + 4) % 4;
  }

  setRecipe(b, id) {
    if (!CRAFTERS[b.type] || RECIPES[id].b !== b.type || !this.recipeUnlocked(id)) return;
    if (b.recipe === id) return;
    b.recipe = id;
    b.inv = {};
    b.t = 0;
    this.dirty = true;
  }

  // ------------------------------- economy ---------------------------------
  sell(item) {
    const v = ITEMS[item].value * this.sellMult();
    this.money += v;
    this.totalEarned += v;
    this.earnBuckets[0] += v;
    this.stats.sold[item] = (this.stats.sold[item] || 0) + 1;
    return v;
  }

  buyUpgrade(id) {
    const u = UPGRADES[id];
    if (this.lvl(id) >= u.max) return false;
    const c = this.upgradeCost(id);
    if (this.money < c) return false;
    this.money -= c;
    this.upgrades[id] = this.lvl(id) + 1;
    this.dirty = true;
    return true;
  }

  canResearch(id) {
    const r = RESEARCH[id];
    return !this.research[id] && r.req.every((q) => this.research[q]);
  }

  buyResearch(id) {
    if (!this.canResearch(id) || this.money < RESEARCH[id].cost) return false;
    this.money -= RESEARCH[id].cost;
    this.research[id] = true;
    this.dirty = true;
    return true;
  }

  grantIncome(seconds, efficiency) {
    const amount = this.incomeRate * seconds * efficiency;
    this.money += amount;
    this.totalEarned += amount;
    return amount;
  }

  // ----------------------------- simulation --------------------------------
  pushTo(src, item, dir) {
    const d = DIRS[dir];
    const t = this.at(src.x + d.x, src.y + d.y);
    if (!t) return false;
    const L = LOGIC[t.type];
    if (!L.accepts(this, t, item, dir)) return false;
    L.insert(this, t, item, dir);
    return true;
  }

  update(dt) {
    this.time += dt;
    this.stats.playTime += dt;
    this.pending.length = 0;
    for (const b of this.buildings) LOGIC[b.type].update(this, b, dt);

    // Belts that were blocked may be free now that downstream items moved on.
    let moved = true;
    while (moved && this.pending.length) {
      moved = false;
      for (let i = this.pending.length - 1; i >= 0; i--) {
        const b = this.pending[i];
        if (b.item && this.pushTo(b, b.item, b.dir)) {
          b.item = null;
          this.pending.splice(i, 1);
          moved = true;
        }
      }
    }

    this.bucketTimer += dt;
    if (this.bucketTimer >= 1) {
      this.bucketTimer -= 1;
      this.incomeRate = this.earnBuckets.reduce((a, v) => a + v, 0) / this.earnBuckets.length;
      this.earnBuckets.pop();
      this.earnBuckets.unshift(0);
    }

    for (let i = this.floaters.length - 1; i >= 0; i--) {
      const f = this.floaters[i];
      f.life -= dt;
      f.y -= dt * 0.8;
      if (f.life <= 0) this.floaters.splice(i, 1);
    }
  }

  // ---------------------------- persistence --------------------------------
  serialize() {
    return {
      v: 1,
      seed: this.seed,
      money: this.money,
      totalEarned: this.totalEarned,
      upgrades: this.upgrades,
      research: this.research,
      stats: this.stats,
      incomeRate: this.incomeRate,
      savedAt: Date.now(),
      buildings: this.buildings.map((b) => {
        const o = { t: b.type, x: b.x, y: b.y, d: b.dir, p: b.paid };
        if (b.recipe) o.r = b.recipe;
        return o;
      }),
    };
  }

  static deserialize(data) {
    const g = new Game(data.seed);
    g.buildings = [];
    g.grid.fill(null);
    g.money = data.money;
    g.totalEarned = data.totalEarned || 0;
    g.upgrades = data.upgrades || {};
    g.research = data.research || {};
    g.stats = Object.assign({ sold: {}, crafted: {}, playTime: 0 }, data.stats);
    g.incomeRate = data.incomeRate || 0;
    for (const o of data.buildings || []) {
      if (!BUILDINGS[o.t] || !g.inBounds(o.x, o.y) || g.at(o.x, o.y)) continue;
      const b = { type: o.t, x: o.x, y: o.y, dir: o.d || 0, paid: o.p || 0, recipe: o.r };
      LOGIC[b.type].init(b);
      g.buildings.push(b);
      g.grid[b.y * g.w + b.x] = b;
    }
    return g;
  }

  save() {
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify(this.serialize()));
      return true;
    } catch (e) {
      console.warn('Save failed', e);
      return false;
    }
  }

  static load() {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return null;
      const data = JSON.parse(raw);
      const g = Game.deserialize(data);
      g.offlineSeconds = Math.max(0, (Date.now() - (data.savedAt || Date.now())) / 1000);
      return g;
    } catch (e) {
      console.warn('Load failed', e);
      return null;
    }
  }
}
