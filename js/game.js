'use strict';
// ---------------------------------------------------------------------------
// Core simulation: map, buildings, item flow, economy, power, patents, save/load.
// Every player-initiated change goes through Game.apply(action) so that it can
// be replayed identically on a co-op partner's machine.
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

function invEmpty(inv) {
  for (const k in inv) if (inv[k] > 0) return false;
  return true;
}
function k0(o) { for (const k in o) return k; }

// Per-building behaviour. `md` = movement direction of the incoming item.
const LOGIC = {
  belt: {
    init(b) { b.item = null; b.p = 0; b.from = b.dir; },
    accepts(g, b, item, md) { return !b.item && md !== opp(b.dir); },
    insert(g, b, item, md) { b.item = item; b.p = g.carry; b.from = md; },
    update(g, b, dt) {
      if (!b.item) return;
      b.p += g.beltSpeed() * dt;
      if (b.p >= 1) {
        g.carry = Math.min(0.5, b.p - 1);
        if (g.pushTo(b, b.item, b.dir)) b.item = null;
        else { b.over = g.carry; b.p = 1; g.pending.push(b); }
        g.carry = 0;
      }
    },
  },

  // Miners (and Deep Drills) dig ore, and also pass along anything fed into
  // their back or sides — so a row of miners works as its own conveyor.
  miner: {
    init(b) { b.t = 0; b.out = 0; if (!b.pass) b.pass = []; b.alt = 0; },
    accepts(g, b, item, md) { return md !== opp(b.dir) && b.pass.length < 2; },
    insert(g, b, item) { b.pass.push(item); },
    update(g, b, dt) {
      const ore = g.oreAt(b.x, b.y);
      b.working = false;
      if (ore && b.out < 1) {
        b.working = true;
        b.t += dt * Math.min(20, g.minerRate() * speedOf(b.type) * g.powerFor(b.type));
        if (b.t >= 1) {
          b.t = Math.min(b.t - 1, 1);
          b.out += Math.random() < g.luckChance() ? 2 : 1;
        }
      }
      // one item out per tick; alternate between passed-through items and our own ore
      const own = ore && b.out > 0, passing = b.pass.length > 0;
      if (!own && !passing) return;
      const tryPass = passing && (!own || b.alt);
      if (tryPass) {
        if (g.pushTo(b, b.pass[0], b.dir)) { b.pass.shift(); b.alt = 0; }
      } else if (g.pushTo(b, ore, b.dir)) { b.out--; b.alt = 1; }
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
      if (familyOf(b.type) === 'smelter' && b.t === 0 && b.outQ.length === 0 && invEmpty(b.inv)) {
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
          b.t += (dt * Math.min(20 * r.time, g.craftMult() * speedOf(b.type) * g.powerFor(b.type))) / r.time;
          if (b.t >= 1) {
            b.t = 0;
            for (const k in r.in) b.inv[k] -= r.in[k];
            for (const k in r.out) for (let i = 0; i < r.out[k]; i++) b.outQ.push(k);
            const out = k0(r.out);
            g.stats.crafted[out] = (g.stats.crafted[out] || 0) + 1;
            g.meta.life.crafted[out] = (g.meta.life.crafted[out] || 0) + 1;
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

  sorter: {
    init(b) { b.item = null; b.next = 0; if (b.filter === undefined) b.filter = null; },
    accepts(g, b, item, md) { return !b.item && md === b.dir; },
    insert(g, b, item) { b.item = item; },
    update(g, b) {
      if (!b.item) return;
      if (!b.filter || b.item === b.filter) {
        if (g.pushTo(b, b.item, b.dir)) b.item = null;
        return;
      }
      const outs = [(b.dir + 3) % 4, (b.dir + 1) % 4];
      for (let i = 0; i < 2; i++) {
        const idx = (b.next + i) % 2;
        if (g.pushTo(b, b.item, outs[idx])) {
          b.item = null;
          b.next = (idx + 1) % 2;
          return;
        }
      }
    },
  },

  chest: {
    init(b) { b.store = []; },
    accepts(g, b, item, md) { return md !== opp(b.dir) && b.store.length < CHEST_CAP; },
    insert(g, b, item) { b.store.push(item); },
    update(g, b) {
      if (b.store.length && g.pushTo(b, b.store[0], b.dir)) b.store.shift();
    },
  },

  tunnel: {
    init(b) { b.q = []; b.outQ = []; if (!b.mode) b.mode = 'in'; },
    accepts(g, b, item, md) {
      return b.mode === 'in' && md === b.dir && b.q.length < 4 && !!g.tunnelPartner(b);
    },
    insert(g, b, item) {
      const p = g.tunnelPartner(b);
      const dist = Math.abs(p.x - b.x) + Math.abs(p.y - b.y);
      b.q.push({ item, t: dist / g.beltSpeed() });
    },
    update(g, b, dt) {
      if (b.mode === 'in') {
        for (const e of b.q) e.t -= dt;
        if (b.q.length && b.q[0].t <= 0) {
          const p = g.tunnelPartner(b);
          if (p && p.outQ.length < 2) p.outQ.push(b.q.shift().item);
        }
      } else if (b.outQ.length && g.pushTo(b, b.outQ[0], b.dir)) {
        b.outQ.shift();
      }
    },
  },

  generator: {
    init(b) { b.fuel = b.fuel || 0; b.burn = b.burn || 0; },
    accepts(g, b, item) { return item === 'coal' && b.fuel < GEN_FUEL_CAP; },
    insert(g, b) { b.fuel++; },
    update() { /* fuel is burned in Game.updatePower */ },
  },

  solar: {
    init() {},
    accepts() { return false; },
    update() {},
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

  launchpad: {
    init(b) { if (!b.count) b.count = 0; b.launchT = b.launchT || 0; },
    accepts(g, b, item) { return item === 'robot' && !b.launchT && b.count < g.launchReq(); },
    insert(g, b) {
      b.count++;
      if (b.count >= g.launchReq()) { b.launchT = 0.0001; g.events.push({ type: 'liftoff', x: b.x, y: b.y }); }
    },
    update(g, b, dt) {
      if (!b.launchT) return;
      b.launchT += dt;
      if (b.launchT >= 4) {
        b.launchT = 0;
        b.count = 0;
        if (!g.isGuest) g.completeLaunch();
      }
    },
  },
};
LOGIC.smelter = LOGIC.assembler = LOGIC.foundry = LOGIC.arcfurnace = LOGIC.fabricator = LOGIC.crafter;
LOGIC.deepdrill = LOGIC.miner;

// Fields that are purely cosmetic / derived and never need saving or syncing.
const TRANSIENT = { working: 1, flash: 1, acc: 1, timer: 1, _shape: 1, over: 1 };

function freshMeta() {
  return {
    patents: 0,
    patentsTotal: 0,
    patentUps: {},
    prestiges: 0,
    achievements: {},
    lifetimeEarned: 0,
    launches: 0,
    life: { sold: {}, crafted: {}, itemsSold: 0, playTime: 0 },
    storySeen: {},
  };
}

class Game {
  constructor(seed) {
    this.meta = freshMeta();
    this.isGuest = false;
    this.events = [];
    this.floaters = [];
    this.newRun(seed);
  }

  newRun(seed) {
    this.seed = seed ?? ((Math.random() * 2 ** 31) | 0);
    this.w = MAP_W;
    this.h = MAP_H;
    this.ore = new Array(this.w * this.h).fill(null);
    this.grid = new Array(this.w * this.h).fill(null);
    this.buildings = [];
    this.money = START_MONEY;
    this.runEarned = 0;
    this.upgrades = {};
    this.research = {};
    this.land = 0;
    this.stats = { sold: {}, crafted: {}, playTime: 0 };
    this.goalIdx = 0;
    this.runLaunches = 0;
    this.contract = null;
    this.contractTimer = 30;
    this.earnBuckets = new Array(10).fill(0);
    this.bucketTimer = 0;
    this.checkTimer = 0;
    this.incomeRate = 0;
    this.sellCount = 0;
    this.pending = [];
    this.carry = 0;
    this.time = 0;
    this.dirty = true;
    this.terrainDirty = true;
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
    const at = (a, dist) => [Math.round(c.x + Math.cos(a) * dist), Math.round(c.y + Math.sin(a) * dist)];
    // Guaranteed starter patches inside the starting land
    const base = rng() * Math.PI * 2;
    [['iron_ore', 6.5, 3.6], ['stone', 7.5, 2.8], ['copper_ore', 8.5, 3.2], ['coal', 9, 2.6]].forEach(([type, dist, r], i) => {
      blob(type, ...at(base + i * (Math.PI / 2) + (rng() - 0.5) * 0.5, dist), r);
    });
    // Ordinary patches further out — bigger with distance
    for (let i = 0; i < 60; i++) {
      const dist = 14 + rng() * 40;
      const roll = rng();
      const type = roll < 0.33 ? 'iron_ore' : roll < 0.6 ? 'copper_ore' : roll < 0.8 ? 'coal' : 'stone';
      blob(type, ...at(rng() * Math.PI * 2, dist), 2.5 + rng() * (1.5 + dist / 18));
    }
    // Gold: rare and far away
    for (let i = 0; i < 9; i++) {
      blob('gold_ore', ...at(rng() * Math.PI * 2, 27 + rng() * 24), 2 + rng() * 2);
    }
    // keep the spawn area clear
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) this.ore[(c.y + dy) * this.w + c.x + dx] = null;
    this.generateDecor();
  }

  // Forests, bushes, rocks and ponds. Uses its own RNG stream so ore layouts
  // (and therefore old saves) are unaffected. Trees/bushes/rocks are cleared
  // automatically when you build on them; water can't be built on.
  generateDecor() {
    const rng = mulberry32(this.seed ^ 0x9e3779b9);
    const W = this.w, H = this.h, c = this.center();
    const noise = (cell) => {
      const gw = Math.ceil(W / cell) + 2, gh = Math.ceil(H / cell) + 2;
      const grid = Array.from({ length: gw * gh }, () => rng());
      const sm = (t) => t * t * (3 - 2 * t);
      return (x, y) => {
        const fx = x / cell, fy = y / cell, ix = Math.floor(fx), iy = Math.floor(fy);
        const tx = sm(fx - ix), ty = sm(fy - iy);
        const v = (i, j) => grid[(iy + j) * gw + ix + i];
        return (v(0, 0) * (1 - tx) + v(1, 0) * tx) * (1 - ty) + (v(0, 1) * (1 - tx) + v(1, 1) * tx) * ty;
      };
    };
    const forest = noise(9), forest2 = noise(4), pond = noise(7);
    this.decor = new Uint8Array(W * H);
    this.water = new Uint8Array(W * H);
    this.cleared = new Set();
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const i = y * W + x;
        if (this.ore[i]) continue;
        const d = Math.hypot(x - c.x, y - c.y);
        if (d > 10 && pond(x, y) > 0.74) { this.water[i] = 1; continue; }
        if (d < 4.5) continue;
        const f = forest(x, y) * 0.75 + forest2(x, y) * 0.25;
        const r = rng();
        if (f > 0.6 && r < 0.6) this.decor[i] = rng() < 0.35 ? 2 : 1; // pine / round tree
        else if (r < 0.03) this.decor[i] = 3; // bush
        else if (r < 0.045) this.decor[i] = 4; // rock
      }
    }
    // keep shores from touching ore so deposits stay reachable
    for (let i = 0; i < W * H; i++) if (this.water[i] && this.ore[i]) this.water[i] = 0;
  }

  isWater(x, y) { return this.inBounds(x, y) && this.water[y * this.w + x] === 1; }
  decorAt(x, y) {
    if (!this.inBounds(x, y)) return 0;
    const i = y * this.w + x;
    return this.cleared.has(i) ? 0 : this.decor[i];
  }

  inBounds(x, y) { return x >= 0 && y >= 0 && x < this.w && y < this.h; }
  oreAt(x, y) { return this.inBounds(x, y) ? this.ore[y * this.w + x] : null; }
  at(x, y) { return this.inBounds(x, y) ? this.grid[y * this.w + x] : null; }
  landRadius() { return LAND_RADII[Math.min(this.land, LAND_RADII.length - 1)]; }
  inLand(x, y) {
    const c = this.center(), r = this.landRadius();
    return Math.abs(x - c.x) <= r && Math.abs(y - c.y) <= r;
  }

  // ------------------------------ modifiers --------------------------------
  lvl(id) { return this.upgrades[id] || 0; }
  patentLvl(id) { return (this.meta && this.meta.patentUps[id]) || 0; }
  achCount() { return Object.keys(this.meta.achievements).length; }
  beltSpeed() { return BASE_BELT_SPEED * Math.pow(1.2, this.lvl('belt_speed')) * (1 + 0.15 * this.patentLvl('rollers')); }
  minerRate() { return BASE_MINER_RATE * Math.pow(1.25, this.lvl('miner_speed')) * (1 + 0.15 * this.patentLvl('drills')); }
  craftMult() { return Math.pow(1.2, this.lvl('craft_speed')) * (1 + 0.1 * this.patentLvl('overclock')); }
  luckChance() { return 0.04 * this.lvl('lucky'); }
  patentMult() { return 1 + 0.05 * this.meta.patentsTotal; }
  achMult() { return 1 + ACH_BONUS * this.achCount(); }
  sellMult() {
    return Math.pow(1.15, this.lvl('sell_value')) * (1 + 0.25 * this.patentLvl('brand_value')) * this.patentMult() * this.achMult();
  }
  offlineEfficiency() { return 0.5 + 0.1 * this.patentLvl('night_shift'); }
  launchReq() { return Math.round(LAUNCH_REQ * Math.pow(1.5, this.meta.launches)); }

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
  landCost() { return this.land < LAND_COSTS.length ? LAND_COSTS[this.land] : Infinity; }
  patentCost(id) {
    const p = PATENT_SHOP[id];
    return Math.ceil(p.base * Math.pow(p.growth, this.patentLvl(id)));
  }

  tunnelPartner(b) {
    if (b.type !== 'tunnel' || b.mode !== 'in') return null;
    const d = DIRS[b.dir];
    for (let k = 1; k <= TUNNEL_RANGE; k++) {
      const t = this.at(b.x + d.x * k, b.y + d.y * k);
      if (t && t.type === 'tunnel' && t.dir === b.dir) return t.mode === 'out' ? t : null;
    }
    return null;
  }

  // ------------------------------- actions ---------------------------------
  // Returns { ok, err?, ... }. A pure function of (state, action), so co-op peers stay in step.
  // seed, which is chosen by the caller and carried inside the action.
  apply(a) {
    const B = (x, y) => this.at(x, y);
    this.orderDirty = true;
    switch (a.type) {
      case 'place': {
        const err = this.placeError(a.b, a.x, a.y);
        if (err) return { ok: false, err };
        this.place(a.b, a.x, a.y, a.dir);
        return { ok: true };
      }
      case 'remove': {
        const b = B(a.x, a.y);
        if (!b) return { ok: false };
        return { ok: true, refund: this.remove(a.x, a.y) };
      }
      case 'setdir': {
        const b = B(a.x, a.y);
        if (!b || !BUILDINGS[b.type].dir) return { ok: false };
        b.dir = a.dir & 3;
        return { ok: true };
      }
      case 'rotate': {
        const b = B(a.x, a.y);
        if (!b || !BUILDINGS[b.type].dir) return { ok: false };
        b.dir = (b.dir + (a.delta || 1) + 4) % 4;
        return { ok: true };
      }
      case 'recipe': {
        const b = B(a.x, a.y);
        if (!b || !CRAFTERS[b.type] || !RECIPES[a.r] || RECIPES[a.r].b !== familyOf(b.type) || !this.recipeUnlocked(a.r)) return { ok: false };
        if (b.recipe !== a.r) { b.recipe = a.r; b.inv = {}; b.t = 0; b.outQ = []; }
        this.dirty = true;
        return { ok: true };
      }
      case 'filter': {
        const b = B(a.x, a.y);
        if (!b || b.type !== 'sorter') return { ok: false };
        b.filter = a.item && ITEMS[a.item] ? a.item : null;
        this.dirty = true;
        return { ok: true };
      }
      case 'tmode': {
        const b = B(a.x, a.y);
        if (!b || b.type !== 'tunnel') return { ok: false };
        b.mode = b.mode === 'in' ? 'out' : 'in';
        b.q = []; b.outQ = [];
        this.dirty = true;
        return { ok: true };
      }
      case 'upgrade': return { ok: this.buyUpgrade(a.id) };
      case 'research': return { ok: this.buyResearch(a.id) };
      case 'land': return { ok: this.buyLand() };
      case 'patent': return { ok: this.buyPatent(a.id) };

    }
    return { ok: false };
  }

  // ------------------------------ building ---------------------------------
  placeError(type, x, y) {
    if (!BUILDINGS[type]) return 'Unknown building';
    if (!this.inBounds(x, y)) return 'Out of bounds';
    if (!this.inLand(x, y)) return 'Land not owned — buy more in Upgrades';
    if (this.at(x, y)) return 'Tile occupied';
    if (this.isWater(x, y)) return "Can't build on water";
    if (!this.buildingUnlocked(type)) return 'Not researched';
    if (familyOf(type) === 'miner' && !this.oreAt(x, y)) return 'Miners need ore';
    if (this.money < this.cost(type)) return 'Not enough money';
    return null;
  }

  place(type, x, y, dir, free = false) {
    if (!free && this.placeError(type, x, y)) return null;
    if (free && (!this.inBounds(x, y) || this.at(x, y))) return null;
    const price = free ? 0 : this.cost(type);
    this.money -= price;
    const b = { type, x, y, dir: BUILDINGS[type].dir ? dir & 3 : 0, paid: price };
    if (this.decor[y * this.w + x]) this.cleared.add(y * this.w + x); // chop the tree / clear the rock
    if (type === 'tunnel') b.mode = this.autoTunnelMode(x, y, b.dir);
    LOGIC[type].init(b);
    this.buildings.push(b);
    this.grid[y * this.w + x] = b;
    this.dirty = true;
    this.orderDirty = true;
    return b;
  }

  // A new tunnel becomes an exit if an unpaired entrance faces it from behind.
  autoTunnelMode(x, y, dir) {
    const d = DIRS[dir];
    for (let k = 1; k <= TUNNEL_RANGE; k++) {
      const t = this.at(x - d.x * k, y - d.y * k);
      if (t && t.type === 'tunnel' && t.dir === dir) return t.mode === 'in' && !this.tunnelPartner(t) ? 'out' : 'in';
    }
    return 'in';
  }

  remove(x, y) {
    const b = this.at(x, y);
    if (!b) return 0;
    this.grid[y * this.w + x] = null;
    const i = this.buildings.indexOf(b);
    if (i >= 0) this.buildings.splice(i, 1);
    this.money += b.paid;
    this.dirty = true;
    this.orderDirty = true;
    return b.paid;
  }

  // ------------------------------- economy ---------------------------------
  sell(item) {
    const v = ITEMS[item].value * this.sellMult();
    this.earn(v);
    this.stats.sold[item] = (this.stats.sold[item] || 0) + 1;
    this.meta.life.sold[item] = (this.meta.life.sold[item] || 0) + 1;
    this.meta.life.itemsSold++;
    this.sellCount++;
    const ct = this.contract;
    if (ct && item === ct.item) {
      ct.got++;
      if (ct.got >= ct.qty && !this.isGuest) this.finishContract(true);
    }
    return v;
  }

  earn(v) {
    this.money += v;
    this.runEarned += v;
    this.meta.lifetimeEarned += v;
    this.earnBuckets[0] += v;
  }

  buyUpgrade(id) {
    const u = UPGRADES[id];
    if (!u || this.lvl(id) >= u.max) return false;
    const c = this.upgradeCost(id);
    if (this.money < c) return false;
    this.money -= c;
    this.upgrades[id] = this.lvl(id) + 1;
    this.dirty = true;
    return true;
  }

  canResearch(id) {
    const r = RESEARCH[id];
    return !!r && !this.research[id] && r.req.every((q) => this.research[q]);
  }

  buyResearch(id) {
    if (!this.canResearch(id) || this.money < RESEARCH[id].cost) return false;
    this.money -= RESEARCH[id].cost;
    this.research[id] = true;
    this.dirty = true;
    return true;
  }

  buyLand() {
    const c = this.landCost();
    if (this.money < c) return false;
    this.money -= c;
    this.land++;
    this.dirty = true;
    this.terrainDirty = true;
    return true;
  }

  buyPatent(id) {
    const p = PATENT_SHOP[id];
    if (!p || this.patentLvl(id) >= p.max) return false;
    const c = this.patentCost(id);
    if (this.meta.patents < c) return false;
    this.meta.patents -= c;
    this.meta.patentUps[id] = this.patentLvl(id) + 1;
    this.dirty = true;
    this.terrainDirty = true;
    return true;
  }

  // Patents are earned, never bought with a reset. Host/solo only (synced via snapshots).
  grantPatents(n, why) {
    if (this.isGuest || n <= 0) return;
    this.meta.patents += n;
    this.meta.patentsTotal += n;
    this.events.push({ type: 'patents', n, why });
    this.storyEvent('patent');
    this.dirty = true;
  }

  completeLaunch() {
    const req = this.launchReq();
    this.meta.launches++;
    this.runLaunches++;
    this.events.push({ type: 'launch', req, next: this.launchReq() });
    this.storyEvent('launch');
    this.grantPatents(PATENT_REWARDS.launch, `Launch #${this.meta.launches}`);
  }

  // ------------------------------- story -----------------------------------
  storyEvent(key) {
    if (this.isGuest || !STORY[key] || this.meta.storySeen[key]) return;
    this.meta.storySeen[key] = 1;
    this.events.push({ type: 'story', key });
  }

  // ----------------------------- contracts ---------------------------------
  updateContract(dt) {
    if (this.goalIdx <= CONTRACT.firstAfterGoal) return;
    if (this.contract) {
      this.contract.t -= dt;
      if (this.contract.t <= 0) this.finishContract(false);
      return;
    }
    this.contractTimer -= dt;
    if (this.contractTimer <= 0) this.newContract();
  }

  newContract() {
    // ask for something the factory already makes, favouring the fancier goods
    const made = Object.keys(this.stats.sold).filter((id) => this.stats.sold[id] >= 5);
    if (!made.length) { this.contractTimer = 20; return; }
    made.sort((a, b) => ITEMS[b].value - ITEMS[a].value);
    const pool = made.slice(0, 3);
    const item = pool[(Math.random() * pool.length) | 0];
    const dur = CONTRACT.duration[0] + Math.random() * (CONTRACT.duration[1] - CONTRACT.duration[0]);
    const rate = this.stats.sold[item] / Math.max(60, this.stats.playTime); // items/s this run
    const qty = Math.max(5, Math.min(50000, Math.round((rate * dur * 0.8) / 5) * 5));
    const reward = Math.ceil(qty * ITEMS[item].value * this.sellMult() * CONTRACT.premium * (1 + 0.25 * this.patentLvl('negotiator')));
    this.contract = { item, qty, got: 0, t: dur, total: dur, reward };
    this.events.push({ type: 'contract', state: 'new', item, qty, reward });
  }

  finishContract(ok) {
    const c = this.contract;
    if (!c) return;
    this.contract = null;
    this.contractTimer = CONTRACT.gap[0] + Math.random() * (CONTRACT.gap[1] - CONTRACT.gap[0]);
    if (ok) {
      this.earn(c.reward);
      this.meta.life.contracts = (this.meta.life.contracts || 0) + 1;
      if (this.meta.life.contracts % PATENT_REWARDS.contracts === 0) this.grantPatents(1, `${this.meta.life.contracts} orders delivered`);
    }
    this.events.push({ type: 'contract', state: ok ? 'done' : 'fail', item: c.item, qty: c.qty, reward: c.reward });
    this.dirty = true;
  }

  grantIncome(seconds, efficiency) {
    const amount = this.incomeRate * seconds * efficiency;
    this.earn(amount);
    return amount;
  }

  // Achievements and goals are decided by the host (or solo player) only.
  checkProgress() {
    for (const a of ACHIEVEMENTS) {
      if (!this.meta.achievements[a.id] && a.check(this)) {
        this.meta.achievements[a.id] = Date.now();
        this.events.push({ type: 'ach', id: a.id });
        this.dirty = true;
      }
    }
    const goal = GOALS[this.goalIdx];
    if (goal && goal.check(this)) {
      this.money += goal.reward;
      this.goalIdx++;
      this.events.push({ type: 'goal', text: goal.text, reward: goal.reward, idx: this.goalIdx });
      this.storyEvent('g' + (this.goalIdx - 1));
      // finishing a chapter pays out Ada's patents
      const ch = CHAPTERS.findIndex((c) => c.from === this.goalIdx);
      if (ch > 0) this.grantPatents(PATENT_REWARDS.chapter, `Chapter ${ch}: ${CHAPTERS[ch - 1].title} complete`);
      this.dirty = true;
    }
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

  // ------------------------------- power -----------------------------------
  // One shared grid: Generators (while fuelled) and Solar Panels supply MW,
  // advanced machines draw MW. Generators only burn coal in proportion to load.
  updatePower(dt) {
    let supply = 0, demand = 0;
    const gens = [];
    for (const b of this.buildings) {
      const use = POWER_USE[b.type];
      if (use) demand += use;
      else if (b.type === 'generator') { if (b.burn > 0 || b.fuel > 0) { supply += GEN_OUTPUT; gens.push(b); } }
      else if (b.type === 'solar') supply += SOLAR_OUTPUT;
    }
    const ratio = demand > 0 ? Math.min(1, supply / demand) : 1;
    // solar covers its share first; generators make up the rest
    const solar = supply - gens.length * GEN_OUTPUT;
    const genLoad = gens.length ? Math.max(0, Math.min(1, (demand - solar) / (gens.length * GEN_OUTPUT))) : 0;
    for (const b of gens) {
      b.working = genLoad > 0;
      if (!b.working) continue;
      b.burn -= dt * genLoad;
      if (b.burn <= 0) {
        if (b.fuel > 0) { b.fuel--; b.burn += COAL_SECONDS * (1 + 0.25 * this.patentLvl('clean_burn')); } else b.burn = 0;
      }
    }
    this.power = { supply, demand, ratio };
  }

  powerFor(type) {
    return POWER_USE[type] ? (this.power ? this.power.ratio : 0) : 1;
  }

  // Buildings are simulated downstream-first so a full belt line moves in
  // lockstep: by the time an upstream building pushes, the tile in front has
  // already passed its own item on.
  rebuildOrder() {
    const seen = new Set();
    const order = [];
    const targets = (b) => {
      const outs = b.type === 'splitter' ? [b.dir, (b.dir + 3) % 4, (b.dir + 1) % 4]
        : b.type === 'sorter' ? [b.dir, (b.dir + 3) % 4, (b.dir + 1) % 4]
        : b.type === 'seller' || b.type === 'launchpad' ? [] : [b.dir];
      const res = outs.map((d) => this.at(b.x + DIRS[d].x, b.y + DIRS[d].y)).filter(Boolean);
      if (b.type === 'tunnel') { const p = this.tunnelPartner(b); if (p) res.push(p); }
      return res;
    };
    // iterative DFS, post-order
    for (const root of this.buildings) {
      if (seen.has(root)) continue;
      const stack = [[root, 0, null]];
      seen.add(root);
      while (stack.length) {
        const top = stack[stack.length - 1];
        if (!top[2]) top[2] = targets(top[0]);
        if (top[1] < top[2].length) {
          const t = top[2][top[1]++];
          if (!seen.has(t)) { seen.add(t); stack.push([t, 0, null]); }
        } else {
          order.push(top[0]);
          stack.pop();
        }
      }
    }
    this.order = order;
    this.orderDirty = false;
  }

  update(dt) {
    this.time += dt;
    this.stats.playTime += dt;
    this.meta.life.playTime += dt;
    this.pending.length = 0;
    if (this.orderDirty || !this.order) this.rebuildOrder();
    this.updatePower(dt);
    for (const b of this.order) LOGIC[b.type].update(this, b, dt);

    // Belts that were blocked may be free now that downstream items moved on.
    let moved = true;
    while (moved && this.pending.length) {
      moved = false;
      for (let i = this.pending.length - 1; i >= 0; i--) {
        const b = this.pending[i];
        this.carry = b.over || 0;
        if (b.item && this.pushTo(b, b.item, b.dir)) {
          b.item = null;
          this.pending.splice(i, 1);
          moved = true;
        }
        this.carry = 0;
      }
    }

    this.bucketTimer += dt;
    if (this.bucketTimer >= 1) {
      this.bucketTimer -= 1;
      this.incomeRate = this.earnBuckets.reduce((a, v) => a + v, 0) / this.earnBuckets.length;
      this.earnBuckets.pop();
      this.earnBuckets.unshift(0);
    }

    this.checkTimer += dt;
    if (this.checkTimer >= 0.5) {
      this.checkTimer = 0;
      if (!this.isGuest) { this.checkProgress(); this.updateContract(0.5); }
    }

    for (let i = this.floaters.length - 1; i >= 0; i--) {
      const f = this.floaters[i];
      f.life -= dt;
      f.y -= dt * 0.8;
      if (f.life <= 0) this.floaters.splice(i, 1);
    }
  }

  // ---------------------------- persistence --------------------------------
  // Full state, including items in transit, so saves and co-op syncs are exact.
  serialize() {
    return {
      v: 2,
      savedAt: Date.now(),
      meta: this.meta,
      seed: this.seed,
      money: this.money,
      runEarned: this.runEarned,
      upgrades: this.upgrades,
      research: this.research,
      land: this.land,
      stats: this.stats,
      goalIdx: this.goalIdx,
      runLaunches: this.runLaunches,
      contract: this.contract,
      contractTimer: this.contractTimer,
      incomeRate: this.incomeRate,
      earnBuckets: this.earnBuckets,
      cleared: [...this.cleared],
      buildings: this.buildings.map((b) => {
        const o = {};
        for (const k in b) if (!TRANSIENT[k]) o[k] = b[k];
        return o;
      }),
    };
  }

  // Replace this game's state in place (keeps object identity for UI/renderer).
  restore(data) {
    const seedChanged = data.seed !== this.seed;
    if (data.v !== 2) data = migrateV1(data);
    this.meta = Object.assign(freshMeta(), JSON.parse(JSON.stringify(data.meta)));
    this.meta.life = Object.assign(freshMeta().life, this.meta.life);
    if (seedChanged || !this.ore) {
      this.seed = data.seed;
      this.ore = new Array(this.w * this.h).fill(null);
      this.generateOre();
      this.terrainDirty = true;
    }
    this.grid = new Array(this.w * this.h).fill(null);
    this.buildings = [];
    this.money = data.money;
    this.runEarned = data.runEarned || 0;
    this.upgrades = Object.assign({}, data.upgrades);
    this.research = Object.assign({}, data.research);
    if (this.land !== (data.land || 0)) this.terrainDirty = true;
    this.land = data.land || 0;
    this.stats = Object.assign({ sold: {}, crafted: {}, playTime: 0 }, JSON.parse(JSON.stringify(data.stats || {})));
    this.goalIdx = data.goalIdx || 0;
    this.runLaunches = data.runLaunches || 0;
    this.contract = data.contract ? Object.assign({}, data.contract) : null;
    this.contractTimer = data.contractTimer ?? 30;
    this.meta.storySeen = this.meta.storySeen || {};
    this.incomeRate = data.incomeRate || 0;
    if (Array.isArray(data.earnBuckets) && data.earnBuckets.length === 10) this.earnBuckets = data.earnBuckets.slice();
    for (const o of data.buildings || []) {
      if (!BUILDINGS[o.type] || !this.inBounds(o.x, o.y) || this.at(o.x, o.y)) continue;
      const b = JSON.parse(JSON.stringify(o));
      LOGIC[b.type].init(Object.assign(b, {}));
      // init() resets runtime fields — put saved runtime state back on top
      Object.assign(b, JSON.parse(JSON.stringify(o)));
      this.buildings.push(b);
      this.grid[b.y * this.w + b.x] = b;
    }
    this.cleared = new Set(data.cleared || []);
    for (const b of this.buildings) if (this.decor[b.y * this.w + b.x]) this.cleared.add(b.y * this.w + b.x);
    this.dirty = true;
    this.orderDirty = true;
  }

  save() {
    if (this.isGuest) return false;
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
      return Game.fromData(JSON.parse(raw));
    } catch (e) {
      console.warn('Load failed', e);
      return null;
    }
  }

  static fromData(data) {
    const g = new Game(data.seed);
    g.restore(data);
    g.offlineSeconds = Math.max(0, (Date.now() - (data.savedAt || Date.now())) / 1000);
    return g;
  }
}

// Convert a v1 save (first prototype) into the v2 layout.
function migrateV1(d) {
  const meta = freshMeta();
  meta.lifetimeEarned = d.totalEarned || 0;
  if (d.stats && d.stats.sold) {
    meta.life.sold = Object.assign({}, d.stats.sold);
    meta.life.itemsSold = Object.values(d.stats.sold).reduce((a, v) => a + v, 0);
  }
  return {
    v: 2,
    meta,
    seed: d.seed,
    money: d.money,
    runEarned: d.totalEarned || 0,
    upgrades: d.upgrades || {},
    research: d.research || {},
    land: 2, // v1 maps had no land limits; give early players room
    stats: d.stats,
    goalIdx: 0,
    incomeRate: d.incomeRate || 0,
    savedAt: d.savedAt,
    buildings: (d.buildings || []).map((o) => ({ type: o.t, x: o.x + 8, y: o.y + 8, dir: o.d || 0, paid: o.p || 0, recipe: o.r })),
  };
}
