'use strict';
// ---------------------------------------------------------------------------
// Static game data: constants, items, recipes, buildings, upgrades, research,
// prestige shop, achievements and the guided goal chain.
// ---------------------------------------------------------------------------

const TILE = 16;
const MAP_W = 112;
const MAP_H = 112;
const TICK = 1 / 20;
const START_MONEY = 250;
const SAVE_KEY = 'pixelfoundry_save_v1';
const SETTINGS_KEY = 'pixelfoundry_settings';
const OFFLINE_CAP_SECONDS = 8 * 3600;
const TUNNEL_RANGE = 5;
const CHEST_CAP = 64;
const LAUNCH_REQ = 150;

// Land: owned area is a square of radius LAND_RADII[level] around the centre.
const LAND_RADII = [12, 18, 24, 30, 36, 42, 48, 55];
const LAND_COSTS = [600, 4000, 25000, 160000, 1.2e6, 9e6, 7e7];

// 0 = east, 1 = south, 2 = west, 3 = north
const DIRS = [
  { x: 1, y: 0 },
  { x: 0, y: 1 },
  { x: -1, y: 0 },
  { x: 0, y: -1 },
];
const opp = (d) => (d + 2) % 4;

const ITEMS = {
  iron_ore:     { name: 'Iron Ore',     value: 1 },
  copper_ore:   { name: 'Copper Ore',   value: 1 },
  stone:        { name: 'Stone',        value: 0.6 },
  coal:         { name: 'Coal',         value: 1.5 },
  gold_ore:     { name: 'Gold Ore',     value: 3 },
  iron_plate:   { name: 'Iron Plate',   value: 4 },
  copper_plate: { name: 'Copper Plate', value: 4 },
  brick:        { name: 'Brick',        value: 3.5 },
  gold_bar:     { name: 'Gold Bar',     value: 14 },
  gear:         { name: 'Gear',         value: 11 },
  wire:         { name: 'Copper Wire',  value: 3 },
  circuit:      { name: 'Circuit',      value: 32 },
  steel:        { name: 'Steel Beam',   value: 24 },
  motor:        { name: 'Motor',        value: 160 },
  processor:    { name: 'Processor',    value: 130 },
  robot:        { name: 'Robot',        value: 1100 },
};

// b = building that crafts it, in/out = item counts, time = seconds at 1x speed
const RECIPES = {
  iron_plate:   { b: 'smelter',   in: { iron_ore: 1 },   out: { iron_plate: 1 },   time: 1.2 },
  copper_plate: { b: 'smelter',   in: { copper_ore: 1 }, out: { copper_plate: 1 }, time: 1.2 },
  brick:        { b: 'smelter',   in: { stone: 2 },      out: { brick: 1 },        time: 1.6 },
  gold_bar:     { b: 'smelter',   in: { gold_ore: 1 },   out: { gold_bar: 1 },     time: 1.5, unlock: 'goldworking' },
  gear:         { b: 'assembler', in: { iron_plate: 2 }, out: { gear: 1 },         time: 1.5, unlock: 'assembly' },
  wire:         { b: 'assembler', in: { copper_plate: 1 }, out: { wire: 2 },       time: 1.0, unlock: 'electronics' },
  circuit:      { b: 'assembler', in: { iron_plate: 1, wire: 3 }, out: { circuit: 1 }, time: 2.5, unlock: 'electronics' },
  steel:        { b: 'foundry',   in: { iron_plate: 2, coal: 1 }, out: { steel: 1 }, time: 3.0, unlock: 'metallurgy' },
  motor:        { b: 'assembler', in: { gear: 2, steel: 1, circuit: 1 }, out: { motor: 1 }, time: 4.0, unlock: 'motors' },
  processor:    { b: 'assembler', in: { circuit: 2, gold_bar: 1 }, out: { processor: 1 }, time: 4.0, unlock: 'processors' },
  robot:        { b: 'assembler', in: { motor: 1, processor: 2, steel: 2 }, out: { robot: 1 }, time: 6.0, unlock: 'robotics' },
};

const BUILDINGS = {
  belt:      { name: 'Conveyor',   cost: 2,    growth: 1.0,  dir: true,  key: '1', desc: 'Moves items forward. Click and drag to lay a line — it bends to follow you.' },
  miner:     { name: 'Miner',      cost: 40,   growth: 1.12, dir: true,  key: '2', desc: 'Place on an ore patch. Pushes ore out of its front.' },
  smelter:   { name: 'Smelter',    cost: 100,  growth: 1.15, dir: true,  key: '3', desc: 'Ore into plates or bars, stone into bricks. Picks its recipe automatically.' },
  seller:    { name: 'Market',     cost: 150,  growth: 1.35, dir: false, key: '4', desc: 'Sells anything delivered to it, from any side.' },
  splitter:  { name: 'Splitter',   cost: 30,   growth: 1.04, dir: true,  key: '5', desc: 'Takes items from behind and deals them front / left / right in turn.', unlock: 'splitter' },
  assembler: { name: 'Assembler',  cost: 500,  growth: 1.18, dir: true,  key: '6', desc: 'Crafts parts. Click it to choose a recipe.', unlock: 'assembly' },
  foundry:   { name: 'Foundry',    cost: 2500, growth: 1.2,  dir: true,  key: '7', desc: 'Iron plates + coal into steel beams.', unlock: 'metallurgy' },
  chest:     { name: 'Chest',      cost: 80,   growth: 1.08, dir: true,  key: '8', desc: `Buffers up to ${CHEST_CAP} items and releases them out the front.`, unlock: 'logistics' },
  tunnel:    { name: 'Tunnel',     cost: 40,   growth: 1.05, dir: true,  key: '9', desc: `Place an entrance, then an exit up to ${TUNNEL_RANGE} tiles ahead. Items travel underground.`, unlock: 'logistics' },
  sorter:    { name: 'Sorter',     cost: 120,  growth: 1.06, dir: true,  key: '0', desc: 'Filtered item goes straight on, everything else goes left / right. Click to set the filter.', unlock: 'logistics' },
  launchpad: { name: 'Launch Pad', cost: 5e6,  growth: 2.0,  dir: false, key: 'P', desc: `Feed it ${LAUNCH_REQ} Robots to launch the Orbital Foundry.`, unlock: 'spaceflight' },
};
const BUILD_ORDER = ['belt', 'miner', 'smelter', 'seller', 'splitter', 'assembler', 'foundry', 'chest', 'tunnel', 'sorter', 'launchpad'];
const CRAFTERS = { smelter: 'iron_plate', assembler: 'gear', foundry: 'steel' };
// Buildings that push items out of their front face (for belt-curve detection).
const FRONT_OUTPUT = { belt: 1, miner: 1, smelter: 1, assembler: 1, foundry: 1, chest: 1, splitter: 1, sorter: 1 };

const UPGRADES = {
  miner_speed: { name: 'Drill Bits',      desc: 'Miners +25% speed',             base: 150, growth: 2.1, max: 30, icon: 'miner' },
  belt_speed:  { name: 'Greased Rollers', desc: 'Conveyors & tunnels +20% speed', base: 120, growth: 2.0, max: 25, icon: 'belt' },
  craft_speed: { name: 'Hotter Furnaces', desc: 'Crafting +20% speed',           base: 250, growth: 2.1, max: 30, icon: 'smelter' },
  sell_value:  { name: 'Trade Contacts',  desc: 'Sell value +15%',               base: 300, growth: 2.3, max: 60, icon: 'seller' },
  lucky:       { name: 'Lucky Strikes',   desc: '+4% chance a miner yields double', base: 2000, growth: 2.6, max: 20, icon: 'miner' },
};

const RESEARCH = {
  splitter:    { name: 'Splitters',   cost: 300,   req: [],                          desc: 'Unlocks the Splitter.' },
  assembly:    { name: 'Assembly',    cost: 1500,  req: [],                          desc: 'Unlocks the Assembler and the Gear recipe.' },
  logistics:   { name: 'Logistics',   cost: 4000,  req: ['splitter'],                desc: 'Unlocks Chests, Tunnels and Sorters.' },
  electronics: { name: 'Electronics', cost: 8000,  req: ['assembly'],                desc: 'Copper Wire and Circuit recipes.' },
  metallurgy:  { name: 'Metallurgy',  cost: 20000, req: ['assembly'],                desc: 'Unlocks the Foundry and Steel Beams.' },
  motors:      { name: 'Motors',      cost: 1e5,   req: ['electronics', 'metallurgy'], desc: 'Motor recipe: gears + steel + circuit.' },
  goldworking: { name: 'Goldworking', cost: 3e5,   req: ['electronics'],             desc: 'Smelters can turn gold ore into gold bars. Gold lies far from the centre.' },
  processors:  { name: 'Processors',  cost: 1.5e6, req: ['goldworking'],             desc: 'Processor recipe: circuits + gold bar.' },
  robotics:    { name: 'Robotics',    cost: 1e7,   req: ['processors', 'motors'],    desc: 'Robot recipe: motor + processors + steel.' },
  spaceflight: { name: 'Spaceflight', cost: 6e7,   req: ['robotics'],                desc: 'Unlocks the Launch Pad. Launch the Orbital Foundry!' },
};

// Permanent upgrades bought with Patents (prestige currency).
const PATENT_SHOP = {
  seed_capital: { name: 'Seed Capital',     desc: 'Start each run with more money',          base: 1, growth: 2,   max: 10 },
  brand_value:  { name: 'Brand Value',      desc: '+25% sell value',                        base: 2, growth: 1.7, max: 40 },
  drills:       { name: 'Diamond Drills',   desc: '+15% miner speed',                       base: 1, growth: 1.6, max: 40 },
  rollers:      { name: 'Maglev Rollers',   desc: '+15% conveyor speed',                    base: 1, growth: 1.6, max: 30 },
  night_shift:  { name: 'Night Shift',      desc: '+10% offline earnings (base 50%)',        base: 1, growth: 2,   max: 5 },
  land_grant:   { name: 'Land Grants',      desc: 'Start each run with +1 land expansion',  base: 3, growth: 2.5, max: 5 },
  archives:     { name: 'Company Archives', desc: 'Keep all research when you prestige',    base: 12, growth: 1,  max: 1 },
};
const PATENT_DIVISOR = 25000; // claimable = floor(sqrt(runEarned / divisor))

const totalSold = (g) => g.meta.life.itemsSold;
const lifeSold = (g, id) => g.meta.life.sold[id] || 0;
const ACHIEVEMENTS = [
  { id: 'first_sale',  name: 'Open for Business', desc: 'Sell your first item',            check: (g) => totalSold(g) >= 1 },
  { id: 'sold_100',    name: 'Shopkeeper',        desc: 'Sell 100 items',                  check: (g) => totalSold(g) >= 100 },
  { id: 'sold_5k',     name: 'Wholesaler',        desc: 'Sell 5,000 items',                check: (g) => totalSold(g) >= 5000 },
  { id: 'sold_100k',   name: 'Conglomerate',      desc: 'Sell 100,000 items',              check: (g) => totalSold(g) >= 1e5 },
  { id: 'plates',      name: 'Heat Treatment',    desc: 'Sell an iron plate',              check: (g) => lifeSold(g, 'iron_plate') >= 1 },
  { id: 'bricks',      name: 'Bricklayer',        desc: 'Sell 50 bricks',                  check: (g) => lifeSold(g, 'brick') >= 50 },
  { id: 'gears',       name: 'Clockwork',         desc: 'Sell a gear',                     check: (g) => lifeSold(g, 'gear') >= 1 },
  { id: 'circuits',    name: 'Integrated',        desc: 'Sell a circuit',                  check: (g) => lifeSold(g, 'circuit') >= 1 },
  { id: 'steel',       name: 'Forged',            desc: 'Sell a steel beam',               check: (g) => lifeSold(g, 'steel') >= 1 },
  { id: 'motors',      name: 'Torque',            desc: 'Sell a motor',                    check: (g) => lifeSold(g, 'motor') >= 1 },
  { id: 'gold',        name: 'Gold Rush',         desc: 'Sell a gold bar',                 check: (g) => lifeSold(g, 'gold_bar') >= 1 },
  { id: 'processors',  name: 'Silicon Valley',    desc: 'Sell a processor',                check: (g) => lifeSold(g, 'processor') >= 1 },
  { id: 'robots',      name: 'Uprising',          desc: 'Build a robot',                   check: (g) => (g.meta.life.crafted.robot || 0) >= 1 },
  { id: 'belts_100',   name: 'Spaghetti',         desc: 'Have 100 conveyors at once',      check: (g) => g.count('belt') >= 100 },
  { id: 'belts_500',   name: 'Belt Baron',        desc: 'Have 500 conveyors at once',      check: (g) => g.count('belt') >= 500 },
  { id: 'miners_30',   name: 'Strip Mine',        desc: 'Have 30 miners at once',          check: (g) => g.count('miner') >= 30 },
  { id: 'tunnels',     name: 'Mole People',       desc: 'Build a working tunnel pair',     check: (g) => g.buildings.some((b) => b.type === 'tunnel' && b.mode === 'in' && g.tunnelPartner(b)) },
  { id: 'income_10',   name: 'Side Hustle',       desc: 'Earn $10/s',                      check: (g) => g.incomeRate >= 10 },
  { id: 'income_1k',   name: 'Going Concern',     desc: 'Earn $1K/s',                      check: (g) => g.incomeRate >= 1e3 },
  { id: 'income_100k', name: 'Industrialist',     desc: 'Earn $100K/s',                    check: (g) => g.incomeRate >= 1e5 },
  { id: 'income_10m',  name: 'Tycoon',            desc: 'Earn $10M/s',                     check: (g) => g.incomeRate >= 1e7 },
  { id: 'earn_1m',     name: 'Millionaire',       desc: 'Earn $1M in total',               check: (g) => g.meta.lifetimeEarned >= 1e6 },
  { id: 'earn_1b',     name: 'Billionaire',       desc: 'Earn $1B in total',               check: (g) => g.meta.lifetimeEarned >= 1e9 },
  { id: 'land_max',    name: 'Manifest Destiny',  desc: 'Own all the land',                check: (g) => g.land >= LAND_COSTS.length },
  { id: 'upgrades_40', name: 'Min-Maxer',         desc: 'Reach 40 total upgrade levels',   check: (g) => Object.values(g.upgrades).reduce((a, v) => a + v, 0) >= 40 },
  { id: 'prestige_1',  name: 'Fresh Start',       desc: 'Prestige once',                   check: (g) => g.meta.prestiges >= 1 },
  { id: 'prestige_5',  name: 'Serial Founder',    desc: 'Prestige 5 times',                check: (g) => g.meta.prestiges >= 5 },
  { id: 'launch',      name: 'Liftoff',           desc: 'Launch the Orbital Foundry',      check: (g) => g.meta.launches >= 1 },
  { id: 'launch_3',    name: 'Space Program',     desc: 'Launch 3 times',                  check: (g) => g.meta.launches >= 3 },
];
const ACH_BONUS = 0.02; // +2% income per achievement

// Guided goal chain. Resets every run; rewards scale with the run's prestige count.
const runSold = (g, id) => g.stats.sold[id] || 0;
const GOALS = [
  { text: 'Place a Miner on the grey iron ore',          reward: 20,     check: (g) => g.buildings.some((b) => b.type === 'miner' && g.oreAt(b.x, b.y) === 'iron_ore') },
  { text: 'Run conveyors to the Market and sell 10 iron ore', reward: 50, check: (g) => runSold(g, 'iron_ore') >= 10 },
  { text: 'Build a Smelter in the line — sell 10 iron plates', reward: 100, check: (g) => runSold(g, 'iron_plate') >= 10 },
  { text: 'Reach an income of $5/s',                      reward: 150,    check: (g) => g.incomeRate >= 5 },
  { text: 'Buy an upgrade from the Upgrades tab',          reward: 150,    check: (g) => Object.keys(g.upgrades).length > 0 },
  { text: 'Research Splitters',                           reward: 200,    check: (g) => g.hasResearch('splitter') },
  { text: 'Expand your land',                             reward: 400,    check: (g) => g.land > g.startLand() },
  { text: 'Research Assembly and sell 20 gears',          reward: 1000,   check: (g) => runSold(g, 'gear') >= 20 },
  { text: 'Sell 20 bricks (smelt 2 stone each)',          reward: 1000,   check: (g) => runSold(g, 'brick') >= 20 },
  { text: 'Research Logistics',                           reward: 1500,   check: (g) => g.hasResearch('logistics') },
  { text: 'Sell 25 circuits',                             reward: 5000,   check: (g) => runSold(g, 'circuit') >= 25 },
  { text: 'Sell 25 steel beams',                          reward: 10000,  check: (g) => runSold(g, 'steel') >= 25 },
  { text: 'Reach an income of $1K/s',                     reward: 20000,  check: (g) => g.incomeRate >= 1000 },
  { text: 'Sell 20 motors',                               reward: 50000,  check: (g) => runSold(g, 'motor') >= 20 },
  { text: 'Sell 20 gold bars',                            reward: 1e5,    check: (g) => runSold(g, 'gold_bar') >= 20 },
  { text: 'Sell 20 processors',                           reward: 5e5,    check: (g) => runSold(g, 'processor') >= 20 },
  { text: 'Build 10 robots',                              reward: 3e6,    check: (g) => (g.stats.crafted.robot || 0) >= 10 },
  { text: 'Research Spaceflight',                         reward: 1e7,    check: (g) => g.hasResearch('spaceflight') },
  { text: `Launch the Orbital Foundry (${LAUNCH_REQ} robots)`, reward: 0, check: (g) => g.runLaunches > 0 },
];

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
