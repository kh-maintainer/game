'use strict';
// ---------------------------------------------------------------------------
// Static game data: constants, items, recipes, buildings, upgrades, research,
// patent office, achievements, story and the guided goal chain.
// ---------------------------------------------------------------------------

const TILE = 16;
const MAP_W = 112;
const MAP_H = 112;
const TICK = 1 / 20;
const START_MONEY = 400;
const SAVE_KEY = 'pixelfoundry_save_v1';
const SETTINGS_KEY = 'pixelfoundry_settings';
const OFFLINE_CAP_SECONDS = 8 * 3600;
const TUNNEL_RANGE = 5;
const BUILD_RANGE = 3.6;   // tiles from your character you can build or remove
const WALK_SPEED = 5.5;    // tiles per second (Shift sprints at 1.7x)
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
  coal:         { name: 'Coal',         value: 1 },
  gold_ore:     { name: 'Gold Ore',     value: 1.5 },
  iron_plate:   { name: 'Iron Plate',   value: 4 },
  copper_plate: { name: 'Copper Plate', value: 4 },
  brick:        { name: 'Brick',        value: 3.5 },
  gold_bar:     { name: 'Gold Bar',     value: 10 },
  gear:         { name: 'Gear',         value: 11 },
  wire:         { name: 'Copper Wire',  value: 3 },
  circuit:      { name: 'Circuit',      value: 32 },
  steel:        { name: 'Steel Beam',   value: 24 },
  motor:        { name: 'Motor',        value: 160 },
  processor:    { name: 'Processor',    value: 150 },
  robot:        { name: 'Robot',        value: 1300 },
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
  miner:     { name: 'Miner',      cost: 40,   growth: 1.12, dir: true,  key: '2', family: 'miner', desc: 'Place on ore. Pushes ore out of its front — and passes along items fed in from behind, so miners can chain.' },
  smelter:   { name: 'Smelter',    cost: 100,  growth: 1.15, dir: true,  key: '3', desc: 'Ore into plates or bars, stone into bricks. Picks its recipe automatically.' },
  seller:    { name: 'Market',     cost: 150,  growth: 1.35, dir: false, key: '4', desc: 'Sells anything delivered to it, from any side.' },
  splitter:  { name: 'Splitter',   cost: 30,   growth: 1.04, dir: true,  key: '5', desc: 'Takes items from behind and deals them front / left / right in turn.', unlock: 'splitter' },
  assembler: { name: 'Assembler',  cost: 500,  growth: 1.18, dir: true,  key: '6', desc: 'Crafts parts. Click it to choose a recipe.', unlock: 'assembly' },
  foundry:   { name: 'Foundry',    cost: 2500, growth: 1.2,  dir: true,  key: '7', desc: 'Iron plates + coal into steel beams.', unlock: 'metallurgy' },
  chest:     { name: 'Chest',      cost: 80,   growth: 1.08, dir: true,  key: '8', desc: `Buffers up to ${CHEST_CAP} items and releases them out the front.`, unlock: 'logistics' },
  tunnel:    { name: 'Tunnel',     cost: 40,   growth: 1.05, dir: true,  key: '9', desc: `Place an entrance, then an exit up to ${TUNNEL_RANGE} tiles ahead. Items travel underground.`, unlock: 'logistics' },
  sorter:    { name: 'Sorter',     cost: 120,  growth: 1.06, dir: true,  key: '0', desc: 'Filtered item goes straight on, everything else goes left / right. Click to set the filter.', unlock: 'logistics' },
  launchpad: { name: 'Launch Pad', cost: 2e6,  growth: 2.0,  dir: false, key: 'P', desc: 'Feed it Robots to launch a piece of the Orbital Foundry. Every launch pays 5 patents; each one needs more robots.', unlock: 'spaceflight' },
  generator: { name: 'Generator',  cost: 300,  growth: 1.15, dir: false, key: 'V', desc: 'Burns coal to make 20 MW of power for Assemblers and other advanced machines. Feed it coal from any side.', unlock: 'assembly' },
  solar:     { name: 'Solar Panel', cost: 20000, growth: 1.12, dir: false, key: 'B', desc: 'Makes 8 MW of clean power, no fuel needed.', unlock: 'solar' },
  deepdrill: { name: 'Deep Drill', cost: 450,  growth: 1.14, dir: true,  key: 'Z', family: 'miner', speed: 3, desc: 'A Miner that digs 3x faster. Chains like a Miner.', unlock: 'deepdrills' },
  arcfurnace:{ name: 'Arc Furnace', cost: 3500, growth: 1.16, dir: true, key: 'X', family: 'smelter', speed: 3, desc: 'An electric Smelter: 3x faster, same recipes.', unlock: 'arcfurnace' },
  fabricator:{ name: 'Fabricator', cost: 25000, growth: 1.18, dir: true, key: 'C', family: 'assembler', speed: 3, desc: 'A 3x faster Assembler. Click it to choose a recipe.', unlock: 'fabrication' },
};
const BUILD_ORDER = ['belt', 'miner', 'smelter', 'seller', 'splitter', 'assembler', 'generator', 'foundry', 'chest', 'tunnel', 'sorter', 'solar', 'deepdrill', 'arcfurnace', 'fabricator', 'launchpad'];

// Power: advanced machines draw MW from a shared grid. If demand outstrips supply,
// every powered machine slows down by the same ratio.
const POWER_USE = { assembler: 4, foundry: 6, deepdrill: 3, arcfurnace: 10, fabricator: 14 };
const GEN_OUTPUT = 20;    // MW per fuelled Generator
const SOLAR_OUTPUT = 8;   // MW per Solar Panel
const COAL_SECONDS = 5;   // one coal runs a Generator at full load for this long
const GEN_FUEL_CAP = 10;
const familyOf = (type) => (BUILDINGS[type] && BUILDINGS[type].family) || type;
const speedOf = (type) => (BUILDINGS[type] && BUILDINGS[type].speed) || 1;
const CRAFTERS = { smelter: 'iron_plate', assembler: 'gear', foundry: 'steel', arcfurnace: 'iron_plate', fabricator: 'gear' };
// Buildings that push items out of their front face (for belt-curve detection).
const FRONT_OUTPUT = { belt: 1, miner: 1, smelter: 1, assembler: 1, foundry: 1, chest: 1, splitter: 1, sorter: 1, deepdrill: 1, arcfurnace: 1, fabricator: 1 };

const UPGRADES = {
  miner_speed: { name: 'Drill Bits',      desc: 'Miners +25% speed',             base: 150, growth: 2.1, max: 10, icon: 'miner' },
  belt_speed:  { name: 'Greased Rollers', desc: 'Conveyors & tunnels +20% speed', base: 120, growth: 2.0, max: 15, icon: 'belt' },
  craft_speed: { name: 'Hotter Furnaces', desc: 'Crafting +20% speed',           base: 250, growth: 2.1, max: 18, icon: 'smelter' },
  sell_value:  { name: 'Trade Contacts',  desc: 'Sell value +15%',               base: 300, growth: 2.3, max: 60, icon: 'seller' },
  lucky:       { name: 'Lucky Strikes',   desc: '+4% chance a miner yields double', base: 2000, growth: 2.6, max: 20, icon: 'miner' },
};

const RESEARCH = {
  splitter:    { name: 'Splitters',   cost: 300,   req: [],                          desc: 'Unlocks the Splitter.' },
  assembly:    { name: 'Assembly',    cost: 800,   req: [],                          desc: 'Unlocks the Assembler, the Gear recipe and coal Generators to power them.' },
  logistics:   { name: 'Logistics',   cost: 2500,  req: ['splitter'],                desc: 'Unlocks Chests, Tunnels and Sorters.' },
  electronics: { name: 'Electronics', cost: 6000,  req: ['assembly'],                desc: 'Copper Wire and Circuit recipes.' },
  metallurgy:  { name: 'Metallurgy',  cost: 15000, req: ['assembly'],                desc: 'Unlocks the Foundry and Steel Beams.' },
  deepdrills:  { name: 'Deep Drills', cost: 35000, req: ['metallurgy'],              desc: 'Unlocks the Deep Drill: a Miner that digs 3x faster.' },
  motors:      { name: 'Motors',      cost: 6e4,   req: ['electronics', 'metallurgy'], desc: 'Motor recipe: gears + steel + circuit.' },
  solar:       { name: 'Solar Power', cost: 1.5e5, req: ['electronics'],             desc: 'Unlocks Solar Panels: power without coal.' },
  goldworking: { name: 'Goldworking', cost: 2e5,   req: ['electronics'],             desc: 'Smelters can turn gold ore into gold bars. Gold lies far from the centre.' },
  arcfurnace:  { name: 'Arc Furnaces', cost: 4.5e5, req: ['deepdrills', 'goldworking'], desc: 'Unlocks the Arc Furnace: a Smelter that works 3x faster.' },
  processors:  { name: 'Processors',  cost: 1e6,   req: ['goldworking'],             desc: 'Processor recipe: circuits + gold bar.' },
  fabrication: { name: 'Fabrication', cost: 2.5e6, req: ['processors', 'arcfurnace'], desc: 'Unlocks the Fabricator: an Assembler that works 3x faster.' },
  robotics:    { name: 'Robotics',    cost: 5e6,   req: ['processors', 'motors'],    desc: 'Robot recipe: motor + processors + steel.' },
  spaceflight: { name: 'Spaceflight', cost: 2.5e7, req: ['robotics'],                desc: 'Unlocks the Launch Pad. Launch the Orbital Foundry!' },
};

// Patents: Ada's inventions, earned by finishing chapters, delivering Marlo's
// orders and launching rockets. Nothing is ever reset — each patent gives
// +5% income forever, and they can be spent on permanent upgrades.
const PATENT_REWARDS = { chapter: 2, contracts: 10, launch: 5 }; // contracts: 1 patent per this many orders
const PATENT_SHOP = {
  brand_value:  { name: 'Brand Value',      desc: '+25% sell value',                         base: 2, growth: 1.7, max: 40 },
  drills:       { name: 'Diamond Drills',   desc: '+15% miner speed',                        base: 1, growth: 1.6, max: 20 },
  rollers:      { name: 'Maglev Rollers',   desc: '+15% conveyor speed',                     base: 1, growth: 1.6, max: 20 },
  overclock:    { name: 'Overclocking',     desc: '+10% crafting speed',                     base: 1, growth: 1.6, max: 20 },
  clean_burn:   { name: 'Clean Combustion', desc: 'Generators get 25% more out of each coal', base: 2, growth: 2,   max: 6 },
  negotiator:   { name: 'Silver Tongue',    desc: "Marlo's orders pay +25% more",            base: 1, growth: 1.8, max: 10 },
  night_shift:  { name: 'Night Shift',      desc: '+10% offline earnings (base 50%)',         base: 1, growth: 2,   max: 5 },
};

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
  { id: 'power',       name: 'Let There Be Light', desc: 'Power your factory with a Generator', check: (g) => g.count('generator') >= 1 && g.power && g.power.supply > 0 },
  { id: 'tunnels',     name: 'Mole People',       desc: 'Build a working tunnel pair',     check: (g) => g.buildings.some((b) => b.type === 'tunnel' && b.mode === 'in' && g.tunnelPartner(b)) },
  { id: 'income_10',   name: 'Side Hustle',       desc: 'Earn $10/s',                      check: (g) => g.incomeRate >= 10 },
  { id: 'income_1k',   name: 'Going Concern',     desc: 'Earn $1K/s',                      check: (g) => g.incomeRate >= 1e3 },
  { id: 'income_100k', name: 'Industrialist',     desc: 'Earn $100K/s',                    check: (g) => g.incomeRate >= 1e5 },
  { id: 'income_10m',  name: 'Tycoon',            desc: 'Earn $10M/s',                     check: (g) => g.incomeRate >= 1e7 },
  { id: 'earn_1m',     name: 'Millionaire',       desc: 'Earn $1M in total',               check: (g) => g.meta.lifetimeEarned >= 1e6 },
  { id: 'earn_1b',     name: 'Billionaire',       desc: 'Earn $1B in total',               check: (g) => g.meta.lifetimeEarned >= 1e9 },
  { id: 'land_max',    name: 'Manifest Destiny',  desc: 'Own all the land',                check: (g) => g.land >= LAND_COSTS.length },
  { id: 'upgrades_40', name: 'Min-Maxer',         desc: 'Reach 40 total upgrade levels',   check: (g) => Object.values(g.upgrades).reduce((a, v) => a + v, 0) >= 40 },
  { id: 'patents_10',  name: 'Inventor',          desc: 'Earn 10 patents',                 check: (g) => g.meta.patentsTotal >= 10 },
  { id: 'contracts_25', name: "Marlo's Favourite", desc: "Deliver 25 of Marlo's orders",  check: (g) => (g.meta.life.contracts || 0) >= 25 },
  { id: 'launch',      name: 'Liftoff',           desc: 'Launch the Orbital Foundry',      check: (g) => g.meta.launches >= 1 },
  { id: 'launch_3',    name: 'Space Program',     desc: 'Launch 3 times',                  check: (g) => g.meta.launches >= 3 },
];
const ACH_BONUS = 0.02; // +2% income per achievement

// Guided goal chain (the story's spine). Resets every run.
// prog(g) -> [current, target] drives the progress bar in the goal widget.
const runSold = (g, id) => g.stats.sold[id] || 0;
const sold = (id, n) => ({ check: (g) => runSold(g, id) >= n, prog: (g) => [Math.min(n, runSold(g, id)), n] });
const flag = (fn) => ({ check: fn, prog: (g) => [fn(g) ? 1 : 0, 1] });
const goalIncome = (n) => ({ check: (g) => g.incomeRate >= n, prog: (g) => [Math.min(n, g.incomeRate), n], money: true });
const GOALS = [
  { text: 'Place a Miner on the grey iron ore', reward: 20, ...flag((g) => g.buildings.some((b) => b.type === 'miner' && g.oreAt(b.x, b.y) === 'iron_ore')) },
  { text: 'Lay conveyors into the Market and sell iron ore', reward: 50, ...sold('iron_ore', 10) },
  { text: 'Put a Smelter in the line and sell iron plates', reward: 100, ...sold('iron_plate', 10) },
  { text: 'Grow your income', reward: 150, ...goalIncome(5) },
  { text: 'Buy an upgrade (Upgrades tab)', reward: 150, ...flag((g) => Object.keys(g.upgrades).length > 0) },
  { text: 'Research Splitters', reward: 200, ...flag((g) => g.hasResearch('splitter')) },
  { text: 'Buy more land (Upgrades tab)', reward: 400, ...flag((g) => g.land > 0) },
  { text: 'Research Assembly and sell gears', reward: 1000, ...sold('gear', 20) },
  { text: 'Smelt stone into bricks and sell them', reward: 1000, ...sold('brick', 20) },
  { text: 'Research Logistics', reward: 1500, ...flag((g) => g.hasResearch('logistics')) },
  { text: 'Sell circuits (Electronics research)', reward: 5000, ...sold('circuit', 25) },
  { text: 'Sell steel beams (Metallurgy research)', reward: 10000, ...sold('steel', 25) },
  { text: 'Grow your income', reward: 20000, ...goalIncome(1000) },
  { text: 'Sell motors', reward: 50000, ...sold('motor', 20) },
  { text: 'Find gold far from home and sell gold bars', reward: 1e5, ...sold('gold_bar', 20) },
  { text: 'Sell processors', reward: 5e5, ...sold('processor', 20) },
  { text: 'Build robots', reward: 3e6, check: (g) => (g.stats.crafted.robot || 0) >= 10, prog: (g) => [Math.min(10, g.stats.crafted.robot || 0), 10] },
  { text: 'Research Spaceflight', reward: 1e7, ...flag((g) => g.hasResearch('spaceflight')) },
  { text: 'Load a Launch Pad with robots and launch!', reward: 0, check: (g) => g.runLaunches > 0,
    prog: (g) => [Math.max(0, ...g.buildings.filter((b) => b.type === 'launchpad').map((b) => b.count || 0)), g.launchReq()] },
];

// ------------------------------- story -------------------------------------
const CHAPTERS = [
  { from: 0,  title: 'The Inheritance' },
  { from: 4,  title: 'Open for Business' },
  { from: 9,  title: 'The Industrial Age' },
  { from: 13, title: 'Gold Fever' },
  { from: 16, title: 'Reach for the Stars' },
];
const chapterOf = (goalIdx) => { let c = 0; CHAPTERS.forEach((ch, i) => { if (goalIdx >= ch.from) c = i; }); return c; };

const CHARACTERS = {
  bolt:  { name: 'BOLT',      role: "Ada's robot assistant",      color: '#73eff7' },
  marlo: { name: 'Marlo',     role: 'Trader',                      color: '#ffcd75' },
  quill: { name: 'Dr. Quill', role: 'Astronomer (on the radio)',   color: '#c9a0ff' },
  ada:   { name: 'Grandma Ada', role: 'A letter',                  color: '#ef7d57' },
};

// Lines play once per save (tracked in meta.storySeen). Keys: intro, g<N> (after goal N), launch, patent.
const STORY = {
  intro: [
    ['bolt', 'BZZT! Oh! A visitor! …Wait. You have Ada\'s eyes. You must be her grandchild!'],
    ['bolt', 'I am BOLT, her assistant. Model 7. Mostly rust. She left you this island — and her workshop.'],
    ['ada', 'My dear, I spent my life dreaming of the Orbital Foundry: a factory among the stars. I ran out of time. You won\'t. Start small. — Ada'],
    ['bolt', 'Start small! I can do small. Walk with WASD (Shift to run). See the grey rocks? Iron! Walk up close, press 2 (Miner) and click on them.'],
  ],
  g0: [
    ['bolt', 'Beautiful drilling! Press 1 and drag Conveyors from the Miner\'s yellow arrow into the Market. Your arms are short, so walk alongside as you build!'],
    ['bolt', 'Tip: Miners pass items through, so a row of Miners pointing the same way works as its own conveyor.'],
  ],
  g1: [
    ['marlo', 'Well, well — fresh ore! Name\'s Marlo. I run the trading post here, and I\'ll buy anything you send into that Market.'],
    ['marlo', 'Raw ore is cheap, though. Melt it into plates (Smelter, key 3) and I\'ll pay four times as much.'],
  ],
  g2: [['bolt', 'Plates! Ada would be proud. More miners and more smelters means more money. Let\'s grow!']],
  g3: [['marlo', 'Now you\'re making real coin. Spend it! The Upgrades tab on the right makes everything faster.']],
  g4: [
    ['quill', '*krrsh* …this is Dr. Quill at the observatory. Ada\'s frequency is active again?! You must be continuing her work.'],
    ['quill', 'I can help with research. Start with Splitters — you\'ll want to divide your belts.'],
  ],
  g5: [['bolt', 'See the golden fence? Ada owned far more land than that. Buy more in the Upgrades tab!']],
  g6: [
    ['quill', 'Assembly research gives you Assemblers. Gears are the heart of every machine — and of the Foundry.'],
    ['bolt', 'Careful: Assemblers run on electricity! Build a Generator (key V) and feed it coal. A coal Miner pointed into it is the easy way.'],
  ],
  g7: [['marlo', 'Gears sell like hot cakes! The mainland builders want bricks too: two stone each, straight from a Smelter.']],
  g8: [['quill', 'Your factory sounds tangled from here. Logistics research brings Chests, Tunnels and Sorters.']],
  g9: [['quill', 'Next, Electronics: copper wire, then circuits. Ada\'s notes say the Foundry\'s brain is made of them.']],
  g10: [['bolt', 'Circuits! My cousins! …Ada also needed steel. Foundries fuse iron plates with coal.']],
  g11: [
    ['marlo', 'Steel beams! The mainland can\'t get enough. Hit a thousand a second and we\'ll talk big plans.'],
    ['quill', 'With steel I can design Deep Drills, three times faster than a Miner. Check the Research tab!'],
  ],
  g12: [['quill', 'Motors are next: gears, steel and a circuit. A space station needs hundreds of them.']],
  g13: [['bolt', 'Ada wrote: "gold glimmers far from home." Buy land toward the edges, then research Goldworking!']],
  g14: [['quill', 'Gold makes the finest conductors. Processors need two circuits and a gold bar.']],
  g15: [['quill', 'This is it — Robotics. Robots will assemble the Orbital Foundry up in orbit. Motors, processors, steel.']],
  g16: [['bolt', 'Ten robots! They call me "grandpa". …I am deeply moved. BZZT.']],
  g17: [['quill', 'Spaceflight unlocked! Build a Launch Pad (key P) and feed it robots. Ada\'s dream is one launch away.']],
  launch: [
    ['quill', 'Liftoff confirmed! The Orbital Foundry is in orbit. I… I can see it through my telescope!'],
    ['ada', 'If you are reading this, you did it. I knew you would. But a station is never finished — keep building, keep launching, and look after BOLT for me. — Ada'],
    ['marlo', 'Ha! I\'ll be selling souvenir rockets for years. Pleasure doing business, partner.'],
    ['quill', 'And this is only the first module! Keep launching and the station keeps growing. Every launch earns more of Ada\'s patents.'],
  ],
  patent: [['marlo', "Word travels fast! Finishing a chapter earned you some of Ada's patents. They're yours forever: each one boosts all income by 5%, and you can spend them in the Patents tab."]],
};

// Marlo's delivery contracts: short side-objectives that pay a premium.
const CONTRACT = {
  firstAfterGoal: 2,       // contracts start once you can make plates
  gap: [40, 90],           // seconds between contracts
  duration: [150, 300],    // seconds to complete
  premium: 3,              // reward = qty * value * sellMult * premium
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
