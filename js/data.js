'use strict';
// ---------------------------------------------------------------------------
// Static game data: constants, items, recipes, buildings, upgrades, research.
// ---------------------------------------------------------------------------

const TILE = 16;
const MAP_W = 96;
const MAP_H = 96;
const TICK = 1 / 20;
const START_MONEY = 250;
const SAVE_KEY = 'pixelfoundry_save_v1';
const OFFLINE_EFFICIENCY = 0.5;
const OFFLINE_CAP_SECONDS = 8 * 3600;

// 0 = east, 1 = south, 2 = west, 3 = north
const DIRS = [
  { x: 1, y: 0 },
  { x: 0, y: 1 },
  { x: -1, y: 0 },
  { x: 0, y: -1 },
];
const opp = (d) => (d + 2) % 4;

const ORES = ['iron_ore', 'copper_ore', 'stone', 'coal'];

const ITEMS = {
  iron_ore:     { name: 'Iron Ore',     value: 1 },
  copper_ore:   { name: 'Copper Ore',   value: 1 },
  stone:        { name: 'Stone',        value: 0.6 },
  coal:         { name: 'Coal',         value: 1.5 },
  iron_plate:   { name: 'Iron Plate',   value: 4 },
  copper_plate: { name: 'Copper Plate', value: 4 },
  brick:        { name: 'Brick',        value: 3.5 },
  gear:         { name: 'Gear',         value: 11 },
  wire:         { name: 'Copper Wire',  value: 3 },
  circuit:      { name: 'Circuit',      value: 32 },
  steel:        { name: 'Steel Beam',   value: 24 },
  motor:        { name: 'Motor',        value: 160 },
};

// b = building that crafts it, in/out = item counts, time = seconds at 1x speed
const RECIPES = {
  iron_plate:   { b: 'smelter',   in: { iron_ore: 1 },   out: { iron_plate: 1 },   time: 1.2 },
  copper_plate: { b: 'smelter',   in: { copper_ore: 1 }, out: { copper_plate: 1 }, time: 1.2 },
  brick:        { b: 'smelter',   in: { stone: 2 },      out: { brick: 1 },        time: 1.6 },
  gear:         { b: 'assembler', in: { iron_plate: 2 }, out: { gear: 1 },         time: 1.5, unlock: 'assembly' },
  wire:         { b: 'assembler', in: { copper_plate: 1 }, out: { wire: 2 },       time: 1.0, unlock: 'electronics' },
  circuit:      { b: 'assembler', in: { iron_plate: 1, wire: 3 }, out: { circuit: 1 }, time: 2.5, unlock: 'electronics' },
  steel:        { b: 'foundry',   in: { iron_plate: 2, coal: 1 }, out: { steel: 1 }, time: 3.0, unlock: 'metallurgy' },
  motor:        { b: 'assembler', in: { gear: 2, steel: 1, circuit: 1 }, out: { motor: 1 }, time: 4.0, unlock: 'motors' },
};

const BUILDINGS = {
  belt:      { name: 'Conveyor',  cost: 2,    growth: 1.0,  dir: true,  desc: 'Moves items forward. Click and drag to lay a line.' },
  miner:     { name: 'Miner',     cost: 40,   growth: 1.12, dir: true,  desc: 'Place on an ore patch. Pushes ore out of its front.' },
  smelter:   { name: 'Smelter',   cost: 100,  growth: 1.15, dir: true,  desc: 'Ore into plates, stone into bricks. Picks its recipe automatically.' },
  seller:    { name: 'Market',    cost: 150,  growth: 1.35, dir: false, desc: 'Sells anything delivered to it, from any side.' },
  splitter:  { name: 'Splitter',  cost: 30,   growth: 1.04, dir: true,  desc: 'Takes items from behind, deals them front / left / right.', unlock: 'splitter' },
  assembler: { name: 'Assembler', cost: 500,  growth: 1.18, dir: true,  desc: 'Crafts parts from plates. Click it to choose a recipe.', unlock: 'assembly' },
  foundry:   { name: 'Foundry',   cost: 2500, growth: 1.2,  dir: true,  desc: 'Iron plates + coal into steel beams.', unlock: 'metallurgy' },
};
const BUILD_ORDER = ['belt', 'miner', 'smelter', 'seller', 'splitter', 'assembler', 'foundry'];
const CRAFTERS = { smelter: 'iron_plate', assembler: 'gear', foundry: 'steel' };

const UPGRADES = {
  miner_speed: { name: 'Drill Bits',      desc: 'Miners +25% speed',    base: 150, growth: 2.1, max: 25, icon: 'miner' },
  belt_speed:  { name: 'Greased Rollers', desc: 'Conveyors +20% speed', base: 120, growth: 2.0, max: 20, icon: 'belt' },
  craft_speed: { name: 'Hotter Furnaces', desc: 'Crafting +20% speed',  base: 250, growth: 2.1, max: 25, icon: 'smelter' },
  sell_value:  { name: 'Trade Contacts',  desc: 'Sell value +15%',      base: 300, growth: 2.3, max: 40, icon: 'seller' },
};

const RESEARCH = {
  splitter:    { name: 'Splitters',   cost: 300,    req: [],                          desc: 'Unlocks the Splitter.' },
  assembly:    { name: 'Assembly',    cost: 1500,   req: [],                          desc: 'Unlocks the Assembler and the Gear recipe.' },
  electronics: { name: 'Electronics', cost: 8000,   req: ['assembly'],                desc: 'Copper Wire and Circuit recipes.' },
  metallurgy:  { name: 'Metallurgy',  cost: 20000,  req: ['assembly'],                desc: 'Unlocks the Foundry and Steel Beams.' },
  motors:      { name: 'Motors',      cost: 100000, req: ['electronics', 'metallurgy'], desc: 'Motor recipe: gears + steel + circuit.' },
};

const BASE_BELT_SPEED = 1.6;  // tiles per second
const BASE_MINER_RATE = 0.6;  // items per second

function fmt(n) {
  if (!isFinite(n)) return '∞';
  const neg = n < 0;
  n = Math.abs(n);
  let s;
  if (n < 1000) {
    s = n < 100 ? (Math.floor(n * 10) / 10).toString() : Math.floor(n).toString();
  } else {
    const units = ['K', 'M', 'B', 'T', 'Qa', 'Qi', 'Sx', 'Sp', 'Oc', 'No', 'Dc'];
    let i = -1;
    while (n >= 1000 && i < units.length - 1) { n /= 1000; i++; }
    s = (n < 10 ? n.toFixed(2) : n < 100 ? n.toFixed(1) : Math.floor(n).toString()) + units[i];
  }
  return (neg ? '-' : '') + s;
}

function fmtTime(sec) {
  sec = Math.floor(sec);
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
  if (h) return `${h}h ${m}m`;
  if (m) return `${m}m ${s}s`;
  return `${s}s`;
}
