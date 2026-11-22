'use strict';
// ---------------------------------------------------------------------------
// Procedural pixel-art sprites. Everything is drawn at native resolution
// (16x16 buildings, 8x8 items) and scaled up with nearest-neighbour filtering.
// Directional sprites are drawn facing EAST and rotated at draw time.
// ---------------------------------------------------------------------------

function mkCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

function sprite(w, h, fn) {
  const c = mkCanvas(w, h);
  const g = c.getContext('2d');
  const P = (x, y, pw, ph, col) => { g.fillStyle = col; g.fillRect(x, y, pw, ph); };
  fn(P, g);
  return c;
}

function fromStrings(rows, pal) {
  const h = rows.length;
  const w = Math.max(...rows.map((r) => r.length));
  return sprite(w, h, (P) => {
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < rows[y].length; x++) {
        const col = pal[rows[y][x]];
        if (col) P(x, y, 1, 1, col);
      }
    }
  });
}

// --------------------------------- items -----------------------------------
const SHAPES = {
  ore: [
    '........',
    '..ddd...',
    '.dabbd..',
    'dabbbcdd',
    'dbbbcbcd',
    'dbccccd.',
    '.dddddd.',
    '........',
  ],
  plate: [
    '........',
    '........',
    '.dddddd.',
    'daaaaabd',
    'dabbbbcd',
    'dbcccccd',
    '.dddddd.',
    '........',
  ],
  brick: [
    '........',
    '........',
    'dddddddd',
    'dabbdabd',
    'dbcbdbcd',
    'dddddddd',
    '........',
    '........',
  ],
  gear: [
    '..d..d..',
    '.dabbad.',
    'dab..bcd',
    '.b.dd.c.',
    '.b.dd.c.',
    'dbc..ccd',
    '.dcccd..',
    '..d..d..',
  ],
  wire: [
    '........',
    '.dddddd.',
    '..abab..',
    '..baba..',
    '..abab..',
    '..baba..',
    '.dddddd.',
    '........',
  ],
  circuit: [
    '........',
    '.dddddd.',
    'dbbbbbbd',
    'dbaaeebd',
    'dbaaeebd',
    'dbbbbbbd',
    '.dcdcdd.',
    '........',
  ],
  steel: [
    '........',
    'dddddddd',
    'daaaaaad',
    'dddbbddd',
    '..dbcd..',
    'dddbcddd',
    'dbbccccd',
    'dddddddd',
  ],
  motor: [
    '........',
    '.dddddd.',
    'dabbbbcd',
    'deffeefd',
    'deffeefd',
    'dbccccdd',
    '.dddddd.',
    '..d..d..',
  ],
  ingot: [
    '........',
    '........',
    '..dddddd',
    '.daaaabd',
    'dabbbbcd',
    'dddddddd',
    '........',
    '........',
  ],
  processor: [
    '..c.c...',
    '.dddddd.',
    'cdaeeadc',
    '.deffed.',
    'cdeffedc',
    '.dddddd.',
    '..c.c...',
    '........',
  ],
  robot: [
    '...cc...',
    '..dddd..',
    '.daaaad.',
    '.dfaafd.',
    '.daaaad.',
    '.dbbbbd.',
    '..d..d..',
    '..d..d..',
  ],
};

const ITEM_ART = {
  iron_ore:     ['ore',     { a: '#d7dde6', b: '#9aa3b2', c: '#6b7280', d: '#22262e' }],
  copper_ore:   ['ore',     { a: '#ffc08a', b: '#d9783f', c: '#9c4a22', d: '#331a0e' }],
  stone:        ['ore',     { a: '#d6cdbd', b: '#a3988a', c: '#72695d', d: '#2a2622' }],
  coal:         ['ore',     { a: '#74748a', b: '#3e3e4a', c: '#26262e', d: '#0b0b0f' }],
  iron_plate:   ['plate',   { a: '#f4f7fb', b: '#b8c0cc', c: '#7c8594', d: '#22262e' }],
  copper_plate: ['plate',   { a: '#ffd8b0', b: '#e08a4e', c: '#a8552a', d: '#331a0e' }],
  brick:        ['brick',   { a: '#f0a080', b: '#c0573a', c: '#8a3522', d: '#3a1610' }],
  gear:         ['gear',    { a: '#eef1f5', b: '#a9b1bd', c: '#6d7684', d: '#22262e' }],
  wire:         ['wire',    { a: '#ffb070', b: '#c8642c', d: '#6a4e36' }],
  circuit:      ['circuit', { a: '#1e1e24', e: '#3a3a44', b: '#2f9e4f', d: '#145a2a', c: '#f2c94c' }],
  steel:        ['steel',   { a: '#e6edf4', b: '#9fb0c0', c: '#6a7b8c', d: '#1b232d' }],
  motor:        ['motor',   { a: '#c7d3de', b: '#7d8ea0', c: '#4f5d6b', d: '#1b2129', e: '#d9783f', f: '#ffb070' }],
  gold_ore:     ['ore',     { a: '#fff0a0', b: '#e8b830', c: '#a87810', d: '#3a2a08' }],
  gold_bar:     ['ingot',   { a: '#fff3b0', b: '#f2c94c', c: '#b08a20', d: '#3a2a08' }],
  processor:    ['processor', { a: '#2a2a33', c: '#f2c94c', d: '#101014', e: '#3f6f8f', f: '#7fe0ff' }],
  robot:        ['robot',   { a: '#d0d8e0', b: '#8a96a3', c: '#ff5a4a', d: '#1b2129', f: '#7fe0ff' }],
};

// ------------------------------- buildings ---------------------------------
function frameBox(P, body, light, shade, outline) {
  P(1, 1, 14, 14, outline);
  P(2, 2, 12, 12, body);
  P(2, 2, 12, 1, light);
  P(2, 2, 1, 12, light);
  P(2, 13, 12, 1, shade);
  P(13, 2, 1, 12, shade);
}

// output chute on the east edge with a small arrow
function chute(P, outline) {
  P(13, 5, 3, 6, outline);
  P(14, 6, 2, 4, '#4a4f58');
  P(14, 7, 1, 2, '#f2c94c');
}

function beltFrame(f) {
  return sprite(16, 16, (P) => {
    P(0, 0, 16, 16, '#24242b');
    P(0, 2, 16, 12, '#2d2d35');
    // chevrons scroll eastward
    for (let k = 0; k < 2; k++) {
      const cx = k * 8 + f;
      for (let i = 0; i < 4; i++) {
        for (const t of [0, 1]) {
          const x = (cx + i + t) % 16;
          P(x, 4 + i, 1, 1, '#45454f');
          P(x, 11 - i, 1, 1, '#45454f');
        }
      }
    }
    // rails
    P(0, 0, 16, 2, '#5f5f6c');
    P(0, 1, 16, 1, '#474752');
    P(0, 14, 16, 2, '#5f5f6c');
    P(0, 15, 16, 1, '#3a3a44');
    for (const bx of [3, 11]) {
      P(bx, 0, 1, 1, '#8a8a98');
      P(bx, 14, 1, 1, '#8a8a98');
    }
  });
}

function minerFrame(f) {
  return sprite(16, 16, (P) => {
    const out = '#241d10';
    frameBox(P, '#c9a227', '#ecd06a', '#8a6d12', out);
    // hazard stripes
    for (let x = 3; x < 13; x++) P(x, 3, 1, 1, ((x >> 1) & 1) ? '#241d10' : '#f2c94c');
    // drill housing
    P(4, 6, 7, 7, out);
    P(3, 7, 9, 5, out);
    P(5, 7, 5, 5, '#8d939c');
    P(4, 8, 7, 3, '#8d939c');
    P(5, 7, 5, 1, '#b8bec7');
    // spinning bit
    if (f === 0) {
      P(7, 7, 1, 5, '#3a3f48');
      P(5, 9, 5, 1, '#3a3f48');
    } else {
      P(5, 8, 1, 1, '#3a3f48'); P(6, 9, 1, 1, '#3a3f48'); P(8, 9, 1, 1, '#3a3f48'); P(9, 8, 1, 1, '#3a3f48');
      P(5, 10, 1, 1, '#3a3f48'); P(9, 10, 1, 1, '#3a3f48'); P(7, 9, 1, 1, '#3a3f48');
    }
    P(7, 9, 1, 1, '#1a1d22');
    chute(P, out);
  });
}

function smelterFrame(f) {
  return sprite(16, 16, (P) => {
    const out = '#221c18';
    frameBox(P, '#847a70', '#a89e92', '#5a524a', out);
    // brick courses
    for (const y of [5, 9]) P(2, y, 11, 1, '#635a52');
    for (const [x, y] of [[5, 2], [10, 2], [4, 6], [9, 6], [6, 10], [11, 10]]) P(x, y, 1, 3, '#635a52');
    // mouth
    P(4, 7, 7, 6, out);
    P(5, 8, 5, 5, '#140c0a');
    if (f > 0) {
      const hot = f === 1;
      P(5, 10, 5, 3, hot ? '#ff8a2a' : '#e0661c');
      P(6, 9, 3, 2, hot ? '#ffd36b' : '#ffae3a');
      P(7, 8, 1, 1, hot ? '#fff1b8' : '#ffd36b');
    } else {
      P(5, 12, 5, 1, '#4a1c10');
    }
    // chimney
    P(10, 1, 3, 3, out);
    P(11, 2, 1, 1, '#3a322c');
    chute(P, out);
  });
}

function assemblerFrame(f) {
  return sprite(16, 16, (P) => {
    const out = '#121a24';
    frameBox(P, '#4f6d8f', '#7898bb', '#34506e', out);
    P(3, 3, 9, 9, '#3d5775');
    const g = '#c8d2dc';
    P(5, 5, 5, 5, g);
    P(6, 6, 3, 3, '#3d5775');
    P(7, 7, 1, 1, g);
    if (f === 0) {
      P(7, 3, 1, 2, g); P(7, 10, 1, 2, g); P(3, 7, 2, 1, g); P(10, 7, 2, 1, g);
    } else {
      P(4, 4, 1, 1, g); P(10, 4, 1, 1, g); P(4, 10, 1, 1, g); P(10, 10, 1, 1, g);
    }
    // status light
    P(3, 12, 2, 1, f === 0 ? '#2f9e4f' : '#7be38f');
    chute(P, out);
  });
}

function foundryFrame(f) {
  return sprite(16, 16, (P) => {
    const out = '#1c0c0c';
    frameBox(P, '#6b2f2f', '#9a4a3a', '#3d1a1a', out);
    P(3, 3, 9, 10, out);
    P(4, 4, 7, 8, '#2a1414');
    if (f > 0) {
      P(5, 6, 5, 5, f === 1 ? '#ff6a1a' : '#e04a10');
      P(6, 7, 3, 2, f === 1 ? '#ffd36b' : '#ffae3a');
    } else {
      P(5, 9, 5, 2, '#5a2010');
    }
    P(4, 4, 7, 1, '#4a2420');
    chute(P, out);
  });
}

function sellerFrame(f) {
  return sprite(16, 16, (P) => {
    const out = '#0f2416';
    frameBox(P, '#2f6b3f', '#4d9a5e', '#1d4528', out);
    // input slots on all four sides
    P(7, 0, 2, 2, out); P(7, 14, 2, 2, out); P(0, 7, 2, 2, out); P(14, 7, 2, 2, out);
    // coin
    const coin = f ? '#ffe07a' : '#f2c94c';
    P(5, 4, 6, 8, coin);
    P(4, 5, 8, 6, coin);
    P(5, 4, 6, 1, '#fff1b8');
    const s = '#a07b14';
    P(7, 4, 2, 1, s); P(6, 5, 4, 1, s); P(6, 6, 1, 1, s); P(6, 7, 4, 1, s);
    P(9, 8, 1, 1, s); P(6, 9, 4, 1, s); P(7, 10, 2, 1, s);
  });
}

function splitterFrame(f) {
  return sprite(16, 16, (P) => {
    P(0, 0, 16, 16, '#24242b');
    P(1, 1, 14, 14, '#3a3a44');
    P(2, 2, 12, 12, '#2d2d35');
    const a = f ? '#ffe07a' : '#e0c040';
    // input stub west
    P(0, 6, 3, 4, '#5f5f6c');
    // east arrow
    P(10, 5, 1, 6, a); P(11, 6, 1, 4, a); P(12, 7, 1, 2, a);
    // north arrow
    P(5, 4, 6, 1, a); P(6, 3, 4, 1, a); P(7, 2, 2, 1, a);
    // south arrow
    P(5, 11, 6, 1, a); P(6, 12, 4, 1, a); P(7, 13, 2, 1, a);
    P(5, 7, 5, 2, a);
  });
}

// Curved belt: items arrive from the SOUTH and leave EAST (mirror for north).
function beltCurveFrame(f) {
  return sprite(16, 16, (P) => {
    P(0, 0, 16, 16, '#24242b');
    P(2, 2, 14, 14, '#2d2d35');
    const c = '#45454f';
    // east-moving chevrons on the output leg (x >= 8)
    for (let k = 0; k < 2; k++) {
      const cx = k * 8 + f;
      for (let i = 0; i < 4; i++) for (const t of [0, 1]) {
        const x = (cx + i + t) % 16;
        if (x < 8) continue;
        P(x, 4 + i, 1, 1, c);
        P(x, 11 - i, 1, 1, c);
      }
    }
    // north-moving chevrons on the input leg (y >= 8)
    for (let k = 0; k < 2; k++) {
      const cy = 15 - ((k * 8 + f) % 16);
      for (let i = 0; i < 4; i++) for (const t of [0, 1]) {
        const y = (cy - i - t + 32) % 16;
        if (y < 8) continue;
        P(4 + i, y, 1, 1, c);
        P(11 - i, y, 1, 1, c);
      }
    }
    // outer rails (top + left) and inner corner post
    P(0, 0, 16, 2, '#5f5f6c');
    P(0, 1, 16, 1, '#474752');
    P(0, 0, 2, 16, '#5f5f6c');
    P(1, 2, 1, 14, '#474752');
    P(14, 14, 2, 2, '#5f5f6c');
    P(3, 0, 1, 1, '#8a8a98'); P(11, 0, 1, 1, '#8a8a98'); P(0, 11, 1, 1, '#8a8a98');
  });
}

function chestFrame(f) {
  return sprite(16, 16, (P) => {
    const out = '#2a1a0c';
    frameBox(P, '#8a5a2b', '#b07a40', '#5e3c1a', out);
    for (const y of [5, 9]) P(2, y, 11, 1, '#5e3c1a');
    P(2, 3, 11, 1, '#6e7480'); P(2, 12, 11, 1, '#6e7480');
    P(3, 2, 1, 12, '#6e7480'); P(11, 2, 1, 12, '#6e7480');
    P(6, 6, 3, 3, f ? '#ffe07a' : '#f2c94c');
    P(7, 7, 1, 1, out);
    chute(P, out);
  });
}

function tunnelFrame(mode, f) {
  return sprite(16, 16, (P) => {
    // belt half
    const bx = mode === 'in' ? 0 : 8;
    P(bx, 0, 8, 16, '#24242b');
    P(bx, 2, 8, 12, '#2d2d35');
    for (let i = 0; i < 4; i++) {
      const x = bx + ((f + i) % 8);
      P(x, 4 + i, 1, 1, '#45454f'); P(x, 11 - i, 1, 1, '#45454f');
    }
    P(bx, 0, 8, 2, '#5f5f6c'); P(bx, 14, 8, 2, '#5f5f6c');
    // portal housing
    const hx = mode === 'in' ? 7 : 0;
    P(hx, 0, 9, 16, '#3c3a36');
    P(hx + 1, 1, 7, 14, '#57534c');
    P(hx + 1, 1, 7, 1, '#77726a');
    const mx = mode === 'in' ? hx + 1 : hx + 2;
    P(mx, 3, 6, 10, '#0b0b0e');
    P(mx, 3, 6, 1, '#1d1d24');
    // hazard trim
    for (let y = 1; y < 15; y += 2) P(mode === 'in' ? hx : hx + 8, y, 1, 1, '#f2c94c');
    P(mode === 'in' ? 10 : 3, 7, 2, 2, mode === 'in' ? '#7be38f' : '#7fe0ff');
  });
}

function sorterFrame(f) {
  return sprite(16, 16, (P) => {
    P(0, 0, 16, 16, '#24242b');
    P(1, 1, 14, 14, '#4a3a5c');
    P(2, 2, 12, 12, '#2d2d35');
    P(0, 6, 3, 4, '#5f5f6c');
    const a = f ? '#e0b0ff' : '#b07ae0';
    // east arrow
    P(11, 6, 1, 4, a); P(12, 7, 1, 2, a);
    // side arrows
    P(6, 2, 4, 1, a); P(7, 1, 2, 1, a);
    P(6, 13, 4, 1, a); P(7, 14, 2, 1, a);
    // filter frame
    P(4, 4, 8, 8, '#16161b');
    P(5, 5, 6, 6, '#3a3a44');
  });
}

function launchpadFrame(f) {
  return sprite(16, 16, (P) => {
    P(0, 0, 16, 16, '#1b1e24');
    P(1, 1, 14, 14, '#4a505c');
    P(2, 2, 12, 12, '#5d6573');
    for (let i = 0; i < 16; i += 2) { P(i, 0, 1, 1, '#f2c94c'); P(i + 1, 15, 1, 1, '#f2c94c'); P(0, i + 1, 1, 1, '#f2c94c'); P(15, i, 1, 1, '#f2c94c'); }
    P(4, 4, 8, 8, '#2a2f38');
    P(5, 5, 6, 6, f ? '#ff8a2a' : '#3a404c');
    P(1, 1, 2, 2, f ? '#ff5a4a' : '#7a2a2a'); P(13, 13, 2, 2, f ? '#ff5a4a' : '#7a2a2a');
  });
}

function rocketSprite() {
  return sprite(12, 28, (P) => {
    const o = '#1b2129';
    // nose
    P(5, 0, 2, 1, o); P(4, 1, 4, 1, o); P(3, 2, 6, 2, o);
    P(5, 1, 2, 1, '#ff5a4a'); P(4, 2, 4, 2, '#ff5a4a');
    // body
    P(3, 4, 6, 18, o);
    P(4, 4, 4, 18, '#e6edf4');
    P(7, 4, 1, 18, '#9fb0c0');
    P(4, 8, 4, 1, '#3d5775');
    // window
    P(5, 10, 2, 3, '#7fe0ff'); P(5, 10, 1, 1, '#e8fbff');
    P(4, 16, 4, 1, '#ff5a4a');
    // fins
    P(1, 18, 2, 6, o); P(2, 19, 1, 4, '#ff5a4a');
    P(9, 18, 2, 6, o); P(9, 19, 1, 4, '#ff5a4a');
    // nozzle
    P(4, 22, 4, 2, '#4a505c'); P(3, 24, 6, 1, o);
  });
}

const SPR = {
  items: {},
  belt: [],
  beltCurve: [],
  miner: [],
  smelter: [],
  assembler: [],
  foundry: [],
  seller: [],
  splitter: [],
  sorter: [],
  chest: [],
  tunnel: [],
  tunnelOut: [],
  launchpad: [],
  rocket: null,
  icons: {},
};

function buildSprites() {
  for (const [id, [shape, pal]] of Object.entries(ITEM_ART)) {
    SPR.items[id] = fromStrings(SHAPES[shape], pal);
  }
  for (let f = 0; f < 8; f++) SPR.belt.push(beltFrame(f));
  for (let f = 0; f < 8; f++) SPR.beltCurve.push(beltCurveFrame(f));
  for (let f = 0; f < 8; f++) SPR.tunnel.push(tunnelFrame('in', f));
  for (let f = 0; f < 8; f++) SPR.tunnelOut.push(tunnelFrame('out', f));
  for (let f = 0; f < 2; f++) SPR.miner.push(minerFrame(f));
  for (let f = 0; f < 3; f++) SPR.smelter.push(smelterFrame(f));
  for (let f = 0; f < 2; f++) SPR.assembler.push(assemblerFrame(f));
  for (let f = 0; f < 3; f++) SPR.foundry.push(foundryFrame(f));
  for (let f = 0; f < 2; f++) SPR.seller.push(sellerFrame(f));
  for (let f = 0; f < 2; f++) SPR.splitter.push(splitterFrame(f));
  for (let f = 0; f < 2; f++) SPR.sorter.push(sorterFrame(f));
  for (let f = 0; f < 2; f++) SPR.chest.push(chestFrame(f));
  for (let f = 0; f < 2; f++) SPR.launchpad.push(launchpadFrame(f));
  SPR.rocket = rocketSprite();
  for (const id of BUILD_ORDER) SPR.icons[id] = SPR[id][id === 'smelter' || id === 'foundry' ? 1 : 0];
}

// Cached data-URLs for use in DOM <img> tags.
const ICON_URL = {};
function iconURL(kind, id) {
  const key = kind + ':' + id;
  if (!ICON_URL[key]) {
    const src = kind === 'item' ? SPR.items[id] : SPR.icons[id];
    ICON_URL[key] = src.toDataURL();
  }
  return ICON_URL[key];
}

// ------------------------------- terrain -----------------------------------
const ORE_COLORS = {
  iron_ore:   ['#c3cad6', '#8a93a3', '#4d5462'],
  copper_ore: ['#f2a46a', '#c0642f', '#6e3417'],
  stone:      ['#c9bfae', '#958a7b', '#5a5248'],
  coal:       ['#5a5a68', '#33333d', '#141418'],
  gold_ore:   ['#fff0a0', '#e8b830', '#8a6210'],
};

function renderTerrain(game) {
  const c = mkCanvas(game.w * TILE, game.h * TILE);
  const g = c.getContext('2d');
  const rng = mulberry32(game.seed ^ 0x5eed);
  const P = (x, y, w, h, col) => { g.fillStyle = col; g.fillRect(x, y, w, h); };
  const grounds = ['#2c3529', '#2e382b', '#2a3327'];
  for (let ty = 0; ty < game.h; ty++) {
    for (let tx = 0; tx < game.w; tx++) {
      const ox = tx * TILE, oy = ty * TILE;
      P(ox, oy, TILE, TILE, grounds[(rng() * grounds.length) | 0]);
      // speckles
      const n = 4 + ((rng() * 5) | 0);
      for (let i = 0; i < n; i++) {
        const r = rng();
        P(ox + ((rng() * 16) | 0), oy + ((rng() * 16) | 0), 1, 1, r < 0.5 ? '#36412f' : r < 0.85 ? '#242c21' : '#46523b');
      }
      if (rng() < 0.08) {
        const px = ox + 2 + ((rng() * 11) | 0), py = oy + 2 + ((rng() * 11) | 0);
        P(px, py, 2, 1, '#4a5340');
        P(px, py + 1, 2, 1, '#1e251b');
      }
      // ore
      const ore = game.ore[ty * game.w + tx];
      if (ore) {
        const [hi, mid, lo] = ORE_COLORS[ore];
        P(ox, oy, TILE, TILE, 'rgba(0,0,0,0.18)');
        const rocks = 4 + ((rng() * 3) | 0);
        for (let i = 0; i < rocks; i++) {
          const w = 2 + ((rng() * 3) | 0), h = 2 + ((rng() * 2) | 0);
          const rx = ox + 1 + ((rng() * (14 - w)) | 0);
          const ry = oy + 1 + ((rng() * (13 - h)) | 0);
          P(rx, ry + 1, w, h, lo);
          P(rx, ry, w, h, mid);
          P(rx, ry, w - 1, 1, hi);
        }
      }
    }
  }
  return c;
}
