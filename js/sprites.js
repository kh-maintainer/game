'use strict';
// ---------------------------------------------------------------------------
// Procedural pixel art. Everything is built from one cohesive palette
// (based on Sweetie 16) at native resolution — 16x16 buildings, 8x8 items —
// and scaled up with nearest-neighbour filtering. Directional sprites face
// EAST and are rotated at draw time.
// ---------------------------------------------------------------------------

const PAL = {
  ink: '#1a1c2c', plum: '#5d275d', red: '#b13e53', orange: '#ef7d57', gold: '#ffcd75',
  lime: '#a7f070', green: '#38b764', teal: '#257179', navy: '#29366f', blue: '#3b5dc9',
  sky: '#41a6f6', cyan: '#73eff7', white: '#f4f4f4', mist: '#94b0c2', steel: '#566c86', slate: '#333c57',
  // extended ramps
  deep: '#11121d', slate2: '#3e4a6b', groove: '#262b44',
  wood: '#8f563b', woodL: '#c28569', woodD: '#663931', woodDD: '#3f2832',
  leafO: '#173828', leafD: '#22553a', leafM: '#2f7a42', leafL: '#4fa34a', leafH: '#8fd16a',
  grassD: '#3f8a45', grass: '#4c9a4b', grassL: '#5aa852', grassH: '#7cc35f', grassDD: '#33733d',
  dirt: '#7a5236', dirtD: '#5a3a28', dirtL: '#9a6a44',
  waterD: '#29366f', water: '#3b5dc9', waterL: '#41a6f6',
};

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

// filled pixel circle (centre may be fractional)
function disc(P, cx, cy, r, col) {
  for (let y = Math.floor(cy - r); y <= Math.ceil(cy + r); y++) {
    for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++) {
      const dx = x + 0.5 - cx, dy = y + 0.5 - cy;
      if (dx * dx + dy * dy <= r * r) P(x, y, 1, 1, col);
    }
  }
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
  coin: [
    '..dddd..',
    '.daaaad.',
    'dabbbbcd',
    'dabddbcd',
    'dabddbcd',
    'dabbbbcd',
    '.dcccdd.',
    '..dddd..',
  ],
};

const K = PAL.ink;
const ITEM_ART = {
  iron_ore:     ['ore',     { a: PAL.white, b: PAL.mist, c: PAL.steel, d: K }],
  copper_ore:   ['ore',     { a: '#ffc59a', b: PAL.orange, c: '#a5482f', d: K }],
  stone:        ['ore',     { a: '#e2d6c2', b: '#b3a58d', c: '#7d705e', d: K }],
  coal:         ['ore',     { a: PAL.steel, b: PAL.slate, c: PAL.groove, d: '#07070c' }],
  gold_ore:     ['ore',     { a: '#fff6c8', b: PAL.gold, c: '#c98f3a', d: K }],
  iron_plate:   ['plate',   { a: PAL.white, b: PAL.mist, c: PAL.steel, d: K }],
  copper_plate: ['plate',   { a: '#ffd9b5', b: PAL.orange, c: '#a5482f', d: K }],
  brick:        ['brick',   { a: '#f59a7a', b: PAL.red, c: '#7a2a3a', d: K }],
  gold_bar:     ['ingot',   { a: '#fff6c8', b: PAL.gold, c: '#c98f3a', d: K }],
  gear:         ['gear',    { a: PAL.white, b: PAL.mist, c: PAL.steel, d: K }],
  wire:         ['wire',    { a: '#ffb88a', b: PAL.orange, d: PAL.woodD }],
  circuit:      ['circuit', { a: PAL.ink, e: PAL.slate, b: PAL.green, d: PAL.teal, c: PAL.gold }],
  steel:        ['steel',   { a: PAL.white, b: PAL.mist, c: PAL.steel, d: K }],
  motor:        ['motor',   { a: PAL.mist, b: PAL.steel, c: PAL.slate, d: K, e: PAL.orange, f: '#ffb88a' }],
  processor:    ['processor', { a: PAL.slate, c: PAL.gold, d: K, e: PAL.blue, f: PAL.cyan }],
  robot:        ['robot',   { a: PAL.white, b: PAL.mist, c: PAL.red, d: K, f: PAL.cyan }],
};

// ------------------------------- buildings ---------------------------------
// Bevelled box: outline, body, light top/left edge, dark bottom/right edge.
function box(P, x, y, w, h, body, light, shade, out = K) {
  P(x, y, w, h, out);
  P(x + 1, y + 1, w - 2, h - 2, body);
  P(x + 1, y + 1, w - 2, 1, light);
  P(x + 1, y + 1, 1, h - 2, light);
  P(x + 1, y + h - 2, w - 2, 1, shade);
  P(x + w - 2, y + 1, 1, h - 2, shade);
}

// output port on the east edge
function port(P, lit) {
  P(13, 5, 3, 6, K);
  P(14, 6, 2, 4, PAL.slate);
  P(14, 6, 2, 1, PAL.steel);
  P(15, 7, 1, 2, lit ? PAL.gold : PAL.orange);
}

function beltBase(P) {
  P(0, 0, 16, 16, K);
  P(0, 3, 16, 10, PAL.slate);
  // side rails
  P(0, 1, 16, 1, PAL.mist);
  P(0, 2, 16, 1, PAL.steel);
  P(0, 13, 16, 1, PAL.steel);
  P(0, 14, 16, 1, PAL.slate2);
}

function chevrons(P, f, xmin = 0, xmax = 16) {
  for (let k = 0; k < 2; k++) {
    const cx = k * 8 + f;
    for (let i = 0; i < 3; i++) {
      for (const t of [0, 1]) {
        const x = (cx + i + t) % 16;
        if (x < xmin || x >= xmax) continue;
        P(x, 5 + i, 1, 1, PAL.slate2);
        P(x, 10 - i, 1, 1, PAL.slate2);
      }
    }
    const tip = (cx + 3) % 16;
    if (tip >= xmin && tip < xmax) { P(tip, 7, 1, 2, PAL.steel); }
  }
}

function beltFrame(f) {
  return sprite(16, 16, (P) => {
    beltBase(P);
    // grooves
    for (let x = 0; x < 16; x++) if ((x + 16 - f) % 4 === 0) { P(x, 3, 1, 1, PAL.groove); P(x, 12, 1, 1, PAL.groove); }
    chevrons(P, f);
    for (const bx of [3, 11]) { P(bx, 1, 1, 1, PAL.white); P(bx, 13, 1, 1, PAL.mist); }
  });
}

// Curved belt: items arrive from the SOUTH and leave EAST (mirror for north).
function beltCurveFrame(f) {
  return sprite(16, 16, (P) => {
    P(0, 0, 16, 16, K);
    P(3, 3, 13, 13, PAL.slate);
    // outer rails (top + left)
    P(0, 1, 16, 1, PAL.mist); P(0, 2, 16, 1, PAL.steel);
    P(1, 0, 1, 16, PAL.mist); P(2, 2, 1, 14, PAL.steel);
    // inner corner post
    P(13, 13, 3, 3, PAL.steel); P(14, 14, 2, 2, PAL.mist);
    // east-moving chevrons on the output leg
    chevrons(P, f, 8, 16);
    // north-moving chevrons on the input leg
    for (let k = 0; k < 2; k++) {
      const cy = (32 - (k * 8 + f)) % 16;
      for (let i = 0; i < 3; i++) for (const t of [0, 1]) {
        const y = (cy - i - t + 32) % 16;
        if (y < 8 || y > 12) continue;
        P(5 + i, y, 1, 1, PAL.slate2);
        P(10 - i, y, 1, 1, PAL.slate2);
      }
    }
    P(3, 1, 1, 1, PAL.white); P(11, 1, 1, 1, PAL.white); P(1, 11, 1, 1, PAL.white);
  });
}

function minerFrame(f, o = {}) {
  return sprite(16, 16, (P) => {
    // base plate
    box(P, 0, 1, 15, 15, PAL.steel, PAL.mist, PAL.slate);
    for (const [x, y] of [[2, 3], [12, 3], [2, 13], [12, 13]]) P(x, y, 1, 1, PAL.slate);
    // housing (bobs while working)
    const b = f % 2;
    box(P, 2, 3 + b, 11, 10, o.body || PAL.gold, o.light || '#fff1c4', o.shade || PAL.orange);
    // hazard band
    for (let x = 3; x < 12; x++) P(x, 4 + b, 1, 1, ((x + f) >> 1) & 1 ? K : (o.stripe || PAL.gold));
    // drill window
    P(4, 6 + b, 7, 5, K);
    P(5, 7 + b, 5, 3, PAL.mist);
    const s = PAL.slate;
    const pat = [[[7, 7], [7, 8], [7, 9], [5, 8], [6, 8], [8, 8], [9, 8]], [[5, 7], [6, 7], [8, 9], [9, 9], [7, 8]], [[7, 7], [7, 8], [7, 9], [5, 8], [6, 8], [8, 8], [9, 8]], [[9, 7], [8, 7], [6, 9], [5, 9], [7, 8]]][f];
    for (const [x, y] of pat) P(x, y + b, 1, 1, s);
    P(5, 7 + b, 5, 1, PAL.white);
    // beacon
    P(3, 2, 2, 2, K);
    P(3, 2, 1, 1, f < 2 ? PAL.lime : PAL.green);
    port(P, f < 2);
  });
}

function smelterFrame(f, o = {}) {
  // o.arc = electric Arc Furnace variant (blue flame, dark casing with coils)
  const F = o.arc ? { orange: PAL.sky, red: PAL.blue, gold: PAL.cyan } : { orange: PAL.orange, red: PAL.red, gold: PAL.gold };
  return sprite(16, 16, (P) => {
    if (o.arc) {
      box(P, 0, 1, 15, 15, PAL.slate, PAL.steel, PAL.groove);
      for (let y = 3; y < 14; y += 2) { P(1, y, 2, 1, f ? PAL.cyan : PAL.sky); P(12, y, 1, 1, f ? PAL.cyan : PAL.sky); }
    } else {
      box(P, 0, 1, 15, 15, PAL.steel, PAL.mist, PAL.slate);
      // brick courses
      for (let r = 0; r < 4; r++) {
        const y = 3 + r * 3;
        P(1, y, 13, 1, PAL.slate);
        for (let x = 1 + (r % 2) * 3; x < 14; x += 6) P(x, y - 2 < 2 ? 2 : y - 2, 1, 2, PAL.slate);
      }
    }
    // mouth (arched)
    P(3, 7, 9, 8, K);
    P(4, 6, 7, 1, K);
    P(4, 7, 7, 7, PAL.ink);
    P(4, 7, 7, 1, PAL.groove);
    if (f > 0) {
      const hot = f === 1;
      P(4, 10, 7, 4, hot ? F.orange : F.red);
      P(5, 9, 5, 3, hot ? F.gold : F.orange);
      P(6, 8, 3, 2, hot ? PAL.white : F.gold);
      P(hot ? 5 : 8, 8, 1, 1, F.gold);
      P(4, 14, 7, 1, F.red);
    } else {
      P(4, 12, 7, 2, '#3a1e2a');
      P(5, 13, 2, 1, PAL.plum);
    }
    // chimney
    P(10, 0, 4, 4, K);
    P(11, 0, 2, 3, PAL.slate2);
    P(11, 0, 2, 1, f ? PAL.orange : PAL.steel);
    port(P, f > 0);
  });
}

function assemblerFrame(f, o = {}) {
  return sprite(16, 16, (P) => {
    box(P, 0, 1, 15, 15, o.body || PAL.blue, o.light || PAL.sky, o.shade || PAL.navy);
    // work bed
    P(2, 8, 11, 6, K);
    P(3, 9, 9, 4, PAL.navy);
    P(3, 9, 9, 1, PAL.slate2);
    // part on the bed
    P(5 + (f % 2), 10, 3, 2, PAL.mist);
    // robotic arm: shoulder top-left, sweeps across
    const tips = [[6, 8], [8, 8], [10, 8], [8, 8]];
    const [tx, ty] = tips[f];
    P(2, 2, 3, 3, K);
    P(3, 3, 1, 1, PAL.gold);
    for (let i = 0; i <= 6; i++) {
      const x = Math.round(3 + ((tx - 3) * i) / 6), y = Math.round(4 + ((ty - 2 - 4) * i) / 6);
      P(x, y, 2, 1, PAL.mist);
    }
    P(tx - 1, ty - 2, 3, 1, K);
    P(tx - 1, ty - 1, 1, 1, PAL.gold); P(tx + 1, ty - 1, 1, 1, PAL.gold);
    // status lights
    P(11, 3, 2, 1, f % 2 ? PAL.lime : PAL.green);
    P(11, 5, 2, 1, PAL.cyan);
    port(P, true);
  });
}

function foundryFrame(f) {
  return sprite(16, 16, (P) => {
    box(P, 0, 1, 15, 15, PAL.plum, '#8a3c6e', '#3a1838');
    // rivets
    for (const [x, y] of [[2, 3], [12, 3], [2, 13], [12, 13]]) P(x, y, 1, 1, PAL.red);
    // crucible
    disc(P, 7.5, 8.5, 5, K);
    disc(P, 7.5, 8.5, 4, '#2a1428');
    if (f > 0) {
      disc(P, 7.5, 8.5, 3.4, f === 1 ? PAL.orange : PAL.red);
      disc(P, 7.5, 8, 2.2, f === 1 ? PAL.gold : PAL.orange);
      P(f === 1 ? 6 : 8, 7, 1, 1, PAL.white);
      P(f === 1 ? 9 : 5, 9, 1, 1, PAL.gold);
    } else {
      disc(P, 7.5, 9, 3, '#4a2030');
    }
    // pipe
    P(12, 1, 2, 5, K); P(12, 1, 1, 4, PAL.mist);
    port(P, f > 0);
  });
}

function sellerFrame(f) {
  return sprite(16, 16, (P) => {
    // counter
    box(P, 1, 7, 14, 9, PAL.wood, PAL.woodL, PAL.woodD);
    P(2, 11, 12, 1, PAL.woodD);
    // coin sign
    disc(P, 8, 11.5, 2.6, K);
    disc(P, 8, 11.5, 1.9, f ? '#fff6c8' : PAL.gold);
    P(8, 10, 1, 3, PAL.orange);
    // posts
    P(1, 4, 2, 4, K); P(13, 4, 2, 4, K);
    P(1, 4, 1, 3, PAL.woodL); P(14, 4, 1, 3, PAL.woodL);
    // striped awning with scalloped edge
    P(0, 0, 16, 6, K);
    for (let x = 1; x < 15; x++) {
      const col = ((x - 1) >> 1) % 2 ? PAL.white : PAL.red;
      P(x, 1, 1, 4, col);
      if (x % 2) P(x, 5, 1, 1, col);
    }
    P(1, 1, 14, 1, f ? PAL.gold : '#ffd9c8');
    // sparkle when selling
    if (f) { P(13, 9, 1, 3, PAL.white); P(12, 10, 3, 1, PAL.white); }
  });
}

function splitterFrame(f) {
  return sprite(16, 16, (P) => {
    beltBase(P);
    box(P, 2, 2, 12, 12, PAL.slate2, PAL.steel, PAL.slate);
    const a = f ? PAL.gold : PAL.orange;
    // east arrow
    P(10, 6, 1, 4, a); P(11, 7, 1, 2, a);
    // north / south arrows
    P(6, 4, 4, 1, a); P(7, 3, 2, 1, a);
    P(6, 11, 4, 1, a); P(7, 12, 2, 1, a);
    // hub
    P(5, 6, 4, 4, K); P(6, 7, 2, 2, a);
  });
}

function sorterFrame(f) {
  return sprite(16, 16, (P) => {
    beltBase(P);
    box(P, 2, 2, 12, 12, PAL.plum, '#8a3c6e', '#3a1838');
    const a = f ? PAL.cyan : PAL.sky;
    P(12, 6, 1, 4, a); P(13, 7, 1, 2, a);
    P(6, 3, 4, 1, a); P(7, 2, 2, 1, a);
    P(6, 12, 4, 1, a); P(7, 13, 2, 1, a);
    // filter window
    P(4, 4, 8, 8, K);
    P(5, 5, 6, 6, PAL.slate);
    P(5, 5, 6, 1, PAL.slate2);
  });
}

function chestFrame(f) {
  return sprite(16, 16, (P) => {
    box(P, 1, 2, 14, 13, PAL.wood, PAL.woodL, PAL.woodD);
    // lid seam + planks
    P(2, 6, 12, 1, K);
    P(2, 10, 12, 1, PAL.woodD);
    P(2, 3, 12, 1, PAL.woodL);
    // metal corners
    for (const [x, y] of [[1, 2], [13, 2], [1, 13], [13, 13]]) { P(x, y, 2, 2, PAL.mist); P(x, y, 1, 1, PAL.white); }
    // lock
    P(6, 5, 4, 4, K);
    P(7, 6, 2, 2, f ? PAL.white : PAL.gold);
    port(P, f);
  });
}

function tunnelFrame(mode, f) {
  return sprite(16, 16, (P) => {
    const bx = mode === 'in' ? 0 : 8;
    // belt half
    P(bx, 0, 8, 16, K);
    P(bx, 3, 8, 10, PAL.slate);
    P(bx, 1, 8, 1, PAL.mist); P(bx, 2, 8, 1, PAL.steel);
    P(bx, 13, 8, 1, PAL.steel); P(bx, 14, 8, 1, PAL.slate2);
    for (let i = 0; i < 3; i++) {
      const x = bx + ((f + i) % 8);
      P(x, 5 + i, 1, 1, PAL.slate2); P(x, 10 - i, 1, 1, PAL.slate2);
    }
    // stone arch
    const hx = mode === 'in' ? 6 : 0;
    P(hx, 0, 10, 16, K);
    P(hx + 1, 1, 8, 14, PAL.steel);
    for (let y = 2; y < 15; y += 3) P(hx + 1, y, 8, 1, PAL.slate);
    P(hx + 1, 1, 8, 1, PAL.mist);
    // dark opening
    const mx = mode === 'in' ? hx + 1 : hx + 3;
    P(mx, 3, 6, 11, K);
    P(mx + 1, 2, 4, 1, K);
    P(mx, 3, 6, 1, PAL.deep);
    // moss
    P(hx + 1, 14, 2, 1, PAL.green); P(hx + 7, 1, 2, 1, PAL.green); P(hx + 8, 2, 1, 1, PAL.leafD);
    // signal light
    P(mode === 'in' ? 13 : 2, 1, 2, 1, mode === 'in' ? PAL.lime : PAL.cyan);
  });
}

function launchpadFrame(f) {
  return sprite(16, 16, (P) => {
    box(P, 0, 0, 16, 16, PAL.mist, PAL.white, PAL.steel);
    for (let i = 1; i < 15; i++) {
      const c = ((i >> 1) % 2) ? K : PAL.gold;
      P(i, 1, 1, 1, c); P(i, 14, 1, 1, c); P(1, i, 1, 1, c); P(14, i, 1, 1, c);
    }
    disc(P, 8, 8, 5, PAL.slate);
    disc(P, 8, 8, 4, PAL.slate2);
    P(4, 7, 8, 2, PAL.steel); P(7, 4, 2, 8, PAL.steel);
    P(2, 2, 2, 2, f ? PAL.red : '#5a1e2a'); P(12, 12, 2, 2, f ? PAL.red : '#5a1e2a');
    P(12, 2, 2, 2, f ? '#5a1e2a' : PAL.red); P(2, 12, 2, 2, f ? '#5a1e2a' : PAL.red);
  });
}

function rocketSprite() {
  return sprite(12, 28, (P) => {
    // nose
    P(5, 0, 2, 1, K); P(4, 1, 4, 1, K); P(3, 2, 6, 3, K);
    P(5, 1, 1, 1, PAL.orange); P(4, 2, 4, 3, PAL.red); P(4, 2, 1, 2, PAL.orange);
    // body
    P(2, 5, 8, 17, K);
    P(3, 5, 6, 17, PAL.white);
    P(7, 5, 2, 17, PAL.mist);
    P(3, 5, 1, 17, '#ffffff');
    P(3, 9, 6, 1, PAL.navy);
    // window
    P(4, 11, 4, 4, K); P(5, 12, 2, 2, PAL.cyan); P(5, 12, 1, 1, PAL.white);
    P(3, 17, 6, 1, PAL.red); P(3, 19, 6, 1, PAL.red);
    // fins
    P(0, 17, 3, 7, K); P(1, 18, 1, 5, PAL.red);
    P(9, 17, 3, 7, K); P(10, 18, 1, 5, PAL.red);
    // nozzle
    P(3, 22, 6, 3, K); P(4, 22, 4, 2, PAL.steel);
    P(2, 25, 8, 1, K);
  });
}

// ------------------------------- nature ------------------------------------
function treeSprite(v) {
  // returns { trunk, canopy } so the canopy can sway independently
  const trunk = sprite(16, 24, (P) => {
    P(6, 15, 4, 8, K);
    P(7, 15, 2, 7, PAL.wood);
    P(7, 15, 1, 7, PAL.woodL);
    P(5, 21, 6, 2, K); P(6, 21, 4, 1, PAL.woodD);
  });
  const canopy = sprite(16, 24, (P) => {
    if (v === 1) {
      // round broadleaf
      disc(P, 8, 9, 7.2, PAL.leafO);
      disc(P, 8, 9.5, 6.3, PAL.leafD);
      disc(P, 7.2, 8.4, 5.2, PAL.leafM);
      disc(P, 6.2, 7, 3.4, PAL.leafL);
      disc(P, 5.6, 5.8, 1.4, PAL.leafH);
      P(10, 11, 2, 1, PAL.leafM); P(4, 12, 2, 1, PAL.leafD);
      // apples / flowers on some trees
      P(10, 6, 1, 1, PAL.red); P(4, 10, 1, 1, PAL.red); P(11, 10, 1, 1, PAL.red);
    } else {
      // pine
      const tiers = [[3, 2], [7, 3.6], [11, 5], [15, 6.2]];
      for (let i = tiers.length - 1; i >= 0; i--) {
        const [yb, half] = tiers[i];
        for (let y = 0; y < 6; y++) {
          const hw = Math.round((half * (y + 1)) / 6);
          const yy = yb - 5 + y + 2;
          P(8 - hw - 1, yy, hw * 2 + 2, 1, PAL.leafO);
          P(8 - hw, yy, hw * 2, 1, PAL.teal);
          P(8 - hw, yy, Math.max(1, hw - 1), 1, PAL.leafM);
        }
      }
      P(7, 0, 2, 1, PAL.leafO); P(7, 1, 1, 1, PAL.leafH);
      P(6, 9, 1, 1, PAL.leafH); P(5, 13, 1, 1, PAL.leafH); P(4, 17, 1, 1, PAL.leafH);
    }
  });
  return { trunk, canopy };
}

function bushSprite() {
  return sprite(16, 16, (P) => {
    disc(P, 6, 10.5, 4.2, PAL.leafO);
    disc(P, 10.5, 11, 3.8, PAL.leafO);
    disc(P, 6, 10.5, 3.3, PAL.leafD);
    disc(P, 10.5, 11, 2.9, PAL.leafM);
    disc(P, 5.5, 9.5, 2, PAL.leafL);
    P(4, 8, 1, 1, PAL.leafH);
    P(8, 10, 1, 1, PAL.red); P(11, 9, 1, 1, PAL.red); P(6, 12, 1, 1, PAL.red);
  });
}

function rockSprite() {
  return sprite(16, 16, (P) => {
    P(3, 9, 10, 5, K); P(4, 8, 8, 1, K); P(5, 7, 5, 1, K);
    P(4, 9, 8, 4, PAL.steel);
    P(5, 8, 6, 1, PAL.mist); P(4, 9, 4, 1, PAL.mist); P(5, 8, 2, 1, PAL.white);
    P(9, 11, 3, 2, PAL.slate);
    P(4, 12, 2, 1, PAL.green);
  });
}

function cloudSprite(seed) {
  const rng = mulberry32(seed);
  return sprite(96, 48, (P) => {
    for (let i = 0; i < 9; i++) disc(P, 20 + rng() * 56, 18 + rng() * 14, 9 + rng() * 9, '#000');
  });
}

// Coal Generator: hopper, firebox and a spinning flywheel. f: 0 off, 1-2 running.
function generatorFrame(f) {
  return sprite(16, 16, (P) => {
    box(P, 0, 2, 16, 14, PAL.slate2, PAL.steel, PAL.slate);
    // coal hopper
    P(1, 0, 7, 6, K); P(2, 1, 5, 4, PAL.groove);
    P(2, 1, 2, 1, PAL.steel); P(4, 2, 2, 1, PAL.slate2); P(3, 3, 1, 1, PAL.steel);
    // firebox
    P(2, 8, 6, 6, K);
    P(3, 9, 4, 4, f ? (f === 1 ? PAL.orange : PAL.red) : '#2a1d2a');
    if (f) { P(4, 10, 2, 2, PAL.gold); P(f === 1 ? 4 : 5, 10, 1, 1, PAL.white); }
    // flywheel
    disc(P, 11.5, 9.5, 3.6, K);
    disc(P, 11.5, 9.5, 2.8, PAL.mist);
    disc(P, 11.5, 9.5, 1.2, K);
    const spokes = [[[11, 7], [11, 12]], [[9, 9], [14, 9]], [[9, 7], [13, 11]], [[13, 7], [9, 11]]];
    const s = spokes[(f ? f + 1 : 0) % 4];
    for (const [x, y] of s) P(x, y, 1, 1, PAL.slate);
    // lightning badge
    P(9, 3, 5, 3, K); P(10, 4, 1, 1, PAL.gold); P(11, 4, 1, 1, PAL.gold); P(12, 4, 1, 1, f ? PAL.gold : PAL.steel);
  });
}

function solarFrame(f) {
  return sprite(16, 16, (P) => {
    P(0, 1, 16, 15, K);
    P(1, 2, 14, 13, PAL.mist);
    for (let gy = 0; gy < 3; gy++) for (let gx = 0; gx < 3; gx++) {
      const x = 2 + gx * 4, y = 3 + gy * 4;
      P(x, y, 3, 3, PAL.navy);
      P(x, y, 3, 1, PAL.blue);
      P(x, y, 1, 1, PAL.sky);
    }
    if (f) { P(3, 4, 1, 1, PAL.white); P(11, 8, 1, 1, PAL.white); P(7, 12, 1, 1, PAL.cyan); }
  });
}

// Tiny lightning icon shown over machines that are short on power.
function boltIcon(col) {
  return fromStrings(['..kkk', '.kyyk', 'kyyk.', 'kyyyk', '.kyk.', 'kyk..', 'kk...'], { k: K, y: col });
}

// ------------------------------ characters ---------------------------------
const SKIN = '#f2c09a', SKIN_D = '#d39a72';

// Little engineer, 16x16. facing: 0 down, 1 up, 2 side (right). frame 0/1 = walk step, 2 = hammer swing.
function avatarSprite(helmet, helmetD, facing, frame) {
  return sprite(16, 16, (P) => {
    const shirt = PAL.blue, shirtD = PAL.navy, pants = PAL.slate;
    // legs
    const step = frame === 1;
    if (facing === 2) {
      P(5, 12, 6, 4, K);
      P(6, 12, 2, step ? 2 : 3, pants); P(9, 12, 2, step ? 3 : 2, pants);
      P(step ? 5 : 6, 15, 3, 1, K); P(step ? 9 : 8, 15, 3, 1, K);
    } else {
      P(4, 12, 8, 4, K);
      P(5, 12, 2, step ? 2 : 3, pants); P(9, 12, 2, step ? 3 : 2, pants);
      P(5, 14 + (step ? 0 : 1), 2, 1, K); P(9, 14 + (step ? 1 : 0), 2, 1, K);
    }
    // body
    P(3, 8, 10, 5, K);
    P(4, 8, 8, 4, shirt);
    P(4, 11, 8, 1, shirtD);
    P(7, 8, 2, 3, facing === 1 ? shirtD : PAL.gold); // overall strap / back
    // arms
    if (frame === 2) {
      P(11, 4, 2, 5, K); P(11, 5, 1, 3, SKIN);
      P(12, 1, 1, 5, PAL.woodL);           // hammer handle
      P(10, 0, 5, 2, K); P(11, 0, 3, 1, PAL.mist); // hammer head
    } else {
      P(2, 9, 2, 3, K); P(12, 9, 2, 3, K);
      P(2, 9, 1, 2, SKIN); P(13, 9, 1, 2, SKIN);
    }
    // head
    P(3, 1, 10, 8, K);
    if (facing === 1) {
      P(4, 4, 8, 4, '#7a4a2a'); // hair from behind
    } else {
      P(4, 4, 8, 4, SKIN);
      P(4, 7, 8, 1, SKIN_D);
      if (facing === 0) { P(6, 5, 1, 1, K); P(9, 5, 1, 1, K); P(5, 6, 1, 1, '#f59a7a'); P(10, 6, 1, 1, '#f59a7a'); }
      else { P(10, 5, 1, 1, K); P(12, 6, 1, 1, SKIN_D); P(4, 4, 3, 3, '#7a4a2a'); }
    }
    // hard hat
    P(4, 1, 8, 3, helmet);
    P(5, 1, 4, 1, '#ffffff');
    P(3, 3, 10, 1, helmetD);
    if (facing === 2) P(12, 3, 2, 1, helmetD);
  });
}

// BOLT, a hovering helper robot (12x14). frame toggles thruster flame.
function boltSprite(frame) {
  return sprite(12, 14, (P) => {
    disc(P, 6, 6, 5.5, K);
    disc(P, 6, 6, 4.6, PAL.mist);
    disc(P, 4.6, 4.4, 1.8, PAL.white);
    P(2, 5, 8, 3, K);
    P(3, 6, 2, 1, PAL.cyan); P(7, 6, 2, 1, PAL.cyan);
    P(8, 8, 1, 1, PAL.orange); // rust
    P(5, 0, 2, 1, K); P(5, 0, 1, 1, PAL.red);
    P(4, 11, 4, 1, K);
    P(5, 12, 2, 1, frame ? PAL.gold : PAL.orange);
    if (frame) P(5, 13, 2, 1, PAL.orange);
  });
}

// Marlo the trader, standing (16x16). frame 1 = waving.
function marloSprite(frame) {
  return sprite(16, 16, (P) => {
    P(4, 12, 8, 4, K); P(5, 12, 2, 3, PAL.woodD); P(9, 12, 2, 3, PAL.woodD);
    P(3, 7, 10, 6, K); P(4, 7, 8, 5, PAL.green); P(7, 7, 2, 5, PAL.white); P(4, 11, 8, 1, PAL.teal);
    if (frame) { P(12, 2, 2, 6, K); P(12, 2, 1, 2, '#e0a070'); } else { P(12, 8, 2, 3, K); P(12, 8, 1, 2, '#e0a070'); }
    P(2, 8, 2, 3, K); P(2, 8, 1, 2, '#e0a070');
    P(4, 2, 8, 6, K); P(5, 3, 6, 4, '#e0a070');
    P(6, 4, 1, 1, K); P(9, 4, 1, 1, K);
    P(5, 6, 6, 1, '#4a2a1a'); P(4, 5, 1, 1, '#4a2a1a'); P(11, 5, 1, 1, '#4a2a1a');
    // fez
    P(5, 0, 6, 3, K); P(6, 0, 4, 2, PAL.red); P(6, 2, 4, 1, PAL.gold); P(10, 0, 1, 3, PAL.gold);
  });
}

// Dialogue portraits, 24x24.
function portrait(who) {
  return sprite(24, 24, (P) => {
    const bg = { bolt: PAL.navy, marlo: '#5d3a2a', quill: '#3a1f4f', ada: '#8f563b' }[who];
    P(0, 0, 24, 24, bg);
    for (let y = 0; y < 24; y += 2) P(0, y, 24, 1, 'rgba(255,255,255,0.04)');
    if (who === 'bolt') {
      P(11, 1, 2, 4, K); P(11, 0, 2, 2, PAL.red);
      disc(P, 12, 13, 9.2, K); disc(P, 12, 13, 8.2, PAL.mist); disc(P, 9, 10, 3.2, PAL.white);
      P(4, 10, 16, 5, K); P(6, 11, 4, 3, PAL.cyan); P(14, 11, 4, 3, PAL.cyan); P(7, 11, 1, 1, PAL.white); P(15, 11, 1, 1, PAL.white);
      P(9, 17, 6, 1, K); P(9, 19, 6, 1, K); P(17, 16, 2, 1, PAL.orange); P(6, 18, 1, 1, PAL.orange);
      P(2, 12, 2, 3, PAL.steel); P(20, 12, 2, 3, PAL.steel);
    } else if (who === 'marlo') {
      P(4, 20, 16, 4, PAL.green); P(10, 20, 4, 4, PAL.white);
      disc(P, 12, 13, 7.2, K); disc(P, 12, 13, 6.3, '#e0a070');
      P(6, 2, 12, 7, K); P(7, 3, 10, 5, PAL.red); P(7, 6, 10, 1, PAL.gold); P(17, 3, 1, 6, PAL.gold); P(17, 9, 2, 1, PAL.gold);
      P(9, 11, 1, 2, K); P(14, 11, 1, 2, K);
      P(7, 15, 10, 2, '#4a2a1a'); P(6, 14, 1, 1, '#4a2a1a'); P(17, 14, 1, 1, '#4a2a1a');
      P(10, 18, 4, 1, '#8a3a2a');
    } else if (who === 'quill') {
      P(4, 20, 16, 4, PAL.plum); P(10, 20, 4, 2, PAL.white);
      disc(P, 12, 10, 8.2, '#c9c9d6'); disc(P, 12, 2.5, 3, '#c9c9d6');
      disc(P, 12, 13, 6.2, SKIN);
      P(7, 12, 4, 3, K); P(13, 12, 4, 3, K); P(8, 13, 2, 1, PAL.cyan); P(14, 13, 2, 1, PAL.cyan); P(11, 13, 2, 1, K);
      P(3, 9, 2, 7, K); P(4, 16, 5, 1, K); P(9, 16, 1, 1, PAL.red);
      P(10, 17, 4, 1, '#a5482f');
    } else {
      P(4, 20, 16, 4, PAL.wood); P(8, 19, 8, 2, PAL.red);
      disc(P, 12, 11, 8.4, PAL.white);
      disc(P, 12, 13.5, 6.2, SKIN);
      P(6, 6, 12, 3, K); P(7, 7, 4, 1, PAL.gold); P(13, 7, 4, 1, PAL.gold);
      P(8, 13, 3, 1, K); P(13, 13, 3, 1, K);
      P(7, 15, 2, 1, '#f59a7a'); P(15, 15, 2, 1, '#f59a7a');
      P(10, 17, 4, 1, '#a5482f');
    }
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
  deepdrill: [],
  generator: [],
  solar: [],
  arcfurnace: [],
  fabricator: [],
  rocket: null,
  trees: [],
  bush: null,
  rock: null,
  clouds: [],
  coin: null,
  icons: {},
};

function buildSprites() {
  for (const [id, [shape, pal]] of Object.entries(ITEM_ART)) SPR.items[id] = fromStrings(SHAPES[shape], pal);
  SPR.coin = fromStrings(SHAPES.coin, { a: '#fff6c8', b: PAL.gold, c: PAL.orange, d: K });
  for (let f = 0; f < 8; f++) SPR.belt.push(beltFrame(f));
  for (let f = 0; f < 8; f++) SPR.beltCurve.push(beltCurveFrame(f));
  for (let f = 0; f < 8; f++) SPR.tunnel.push(tunnelFrame('in', f));
  for (let f = 0; f < 8; f++) SPR.tunnelOut.push(tunnelFrame('out', f));
  for (let f = 0; f < 4; f++) SPR.miner.push(minerFrame(f));
  for (let f = 0; f < 3; f++) SPR.smelter.push(smelterFrame(f));
  for (let f = 0; f < 4; f++) SPR.assembler.push(assemblerFrame(f));
  for (let f = 0; f < 4; f++) SPR.deepdrill.push(minerFrame(f, { body: PAL.red, light: '#e0607a', shade: PAL.plum, stripe: PAL.orange }));
  for (let f = 0; f < 3; f++) SPR.arcfurnace.push(smelterFrame(f, { arc: true }));
  for (let f = 0; f < 3; f++) SPR.generator.push(generatorFrame(f));
  for (let f = 0; f < 2; f++) SPR.solar.push(solarFrame(f));
  SPR.lowPower = boltIcon(PAL.gold);
  SPR.noPower = boltIcon(PAL.red);
  for (let f = 0; f < 4; f++) SPR.fabricator.push(assemblerFrame(f, { body: PAL.plum, light: '#8a3c8a', shade: '#3a1838' }));
  for (let f = 0; f < 3; f++) SPR.foundry.push(foundryFrame(f));
  for (let f = 0; f < 2; f++) SPR.seller.push(sellerFrame(f));
  for (let f = 0; f < 2; f++) SPR.splitter.push(splitterFrame(f));
  for (let f = 0; f < 2; f++) SPR.sorter.push(sorterFrame(f));
  for (let f = 0; f < 2; f++) SPR.chest.push(chestFrame(f));
  for (let f = 0; f < 2; f++) SPR.launchpad.push(launchpadFrame(f));
  SPR.rocket = rocketSprite();
  // player avatars: host wears a gold hard hat, guest a cyan one
  SPR.avatar = {};
  for (const [role, h, hd] of [['host', PAL.gold, PAL.orange], ['guest', PAL.cyan, PAL.sky]]) {
    SPR.avatar[role] = [0, 1, 2].map((facing) => [0, 1, 2].map((f) => avatarSprite(h, hd, facing, f)));
  }
  SPR.bolt = [boltSprite(0), boltSprite(1)];
  SPR.marlo = [marloSprite(0), marloSprite(1)];
  SPR.portraits = {};
  for (const who of ['bolt', 'marlo', 'quill', 'ada']) SPR.portraits[who] = portrait(who);
  SPR.trees = [null, treeSprite(1), treeSprite(2)];
  SPR.bush = bushSprite();
  SPR.rock = rockSprite();
  for (let i = 0; i < 4; i++) SPR.clouds.push(cloudSprite(77 + i));
  for (const id of BUILD_ORDER) SPR.icons[id] = SPR[id][id === 'smelter' || id === 'foundry' || id === 'arcfurnace' || id === 'generator' ? 1 : 0];
}

// Cached data-URLs for use in DOM <img> tags.
const ICON_URL = {};
function iconURL(kind, id) {
  const key = kind + ':' + id;
  if (!ICON_URL[key]) {
    const src = kind === 'item' ? SPR.items[id] : kind === 'coin' ? SPR.coin : kind === 'portrait' ? SPR.portraits[id] : SPR.icons[id];
    ICON_URL[key] = src.toDataURL();
  }
  return ICON_URL[key];
}

// ------------------------------- terrain -----------------------------------
const ORE_COLORS = {
  iron_ore:   [PAL.white, PAL.mist, PAL.steel],
  copper_ore: ['#ffc59a', PAL.orange, '#a5482f'],
  stone:      ['#e2d6c2', '#b3a58d', '#7d705e'],
  coal:       [PAL.steel, PAL.slate, '#07070c'],
  gold_ore:   ['#fff6c8', PAL.gold, '#c98f3a'],
};

function renderTerrain(game) {
  const W = game.w, H = game.h;
  const c = mkCanvas(W * TILE, H * TILE);
  const g = c.getContext('2d');
  const rng = mulberry32(game.seed ^ 0x5eed);
  const P = (x, y, w, h, col) => { g.fillStyle = col; g.fillRect(x, y, w, h); };
  const water = (x, y) => game.isWater(x, y);
  const ore = (x, y) => game.oreAt(x, y);

  // 1. grass: smooth large-scale tone, dithered in 2x2 clumps so no tile grid shows
  {
    const PW = W * TILE, PH = H * TILE;
    const img = g.createImageData(PW, PH);
    const d = img.data;
    const hex = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
    const cols = [hex(PAL.grassDD), hex(PAL.grassD), hex(PAL.grass), hex(PAL.grassL)];
    const k1 = 0.21 / TILE, k2 = 0.07 / TILE, k3 = 0.17 / TILE, k4 = 0.11 / TILE, k5 = 0.6 / TILE;
    const seedOff = (game.seed % 1000) * 0.37;
    for (let y = 0; y < PH; y++) {
      for (let x = 0; x < PW; x++) {
        const tone = (Math.sin(x * k1 + y * k2 + seedOff) + Math.sin(y * k3 - x * k4) + Math.sin((x + y) * k5) * 0.35 + 2.35) / 4.7;
        const cx = x >> 1, cy = y >> 1;
        let hsh = (cx * 374761393 + cy * 668265263) | 0;
        hsh = Math.imul(hsh ^ (hsh >>> 13), 1274126177);
        const dither = (((hsh ^ (hsh >>> 16)) >>> 0) & 1023) / 1023 - 0.5;
        const v = tone + dither * 0.32;
        const c = cols[v < 0.3 ? 0 : v < 0.47 ? 1 : v < 0.68 ? 2 : 3];
        const o = (y * PW + x) * 4;
        d[o] = c[0]; d[o + 1] = c[1]; d[o + 2] = c[2]; d[o + 3] = 255;
      }
    }
    g.putImageData(img, 0, 0);
  }
  for (let ty = 0; ty < H; ty++) {
    for (let tx = 0; tx < W; tx++) {
      const ox = tx * TILE, oy = ty * TILE;
      // blades & speckles
      for (let i = 0; i < 7; i++) {
        const x = ox + ((rng() * 16) | 0), y = oy + ((rng() * 15) | 0);
        const r = rng();
        if (r < 0.5) { P(x, y, 1, 2, PAL.grassDD); }
        else if (r < 0.85) { P(x, y, 1, 1, PAL.grassH); }
        else { P(x, y, 1, 1, PAL.grassD); }
      }
      // grass tufts
      if (rng() < 0.3) {
        const x = ox + 2 + ((rng() * 11) | 0), y = oy + 3 + ((rng() * 10) | 0);
        P(x, y, 1, 2, PAL.grassH); P(x - 1, y + 1, 1, 1, PAL.grassH); P(x + 1, y + 1, 1, 1, PAL.grassH);
        P(x - 1, y + 2, 3, 1, PAL.grassDD);
      }
      // flowers
      if (rng() < 0.12) {
        const cols = [PAL.gold, PAL.white, '#f59a7a', PAL.cyan, '#e8a0ff'];
        const fc = cols[(rng() * cols.length) | 0];
        const n = 1 + ((rng() * 3) | 0);
        for (let k = 0; k < n; k++) {
          const x = ox + 2 + ((rng() * 12) | 0), y = oy + 2 + ((rng() * 12) | 0);
          P(x, y + 1, 1, 1, PAL.grassDD);
          P(x, y, 1, 1, fc);
        }
      }
    }
  }

  // 2. ore deposits: dug-out dirt mounds with chunky rocks
  for (let ty = 0; ty < H; ty++) {
    for (let tx = 0; tx < W; tx++) {
      const o = ore(tx, ty);
      if (!o) continue;
      const ox = tx * TILE, oy = ty * TILE;
      P(ox, oy, TILE, TILE, PAL.dirt);
      // soft rim where the deposit meets grass
      if (ore(tx, ty - 1) !== o) { P(ox, oy, TILE, 1, PAL.grassDD); P(ox, oy + 1, TILE, 1, PAL.dirtL); }
      if (ore(tx, ty + 1) !== o) P(ox, oy + 15, TILE, 1, PAL.dirtD);
      if (ore(tx - 1, ty) !== o) P(ox, oy, 1, TILE, PAL.dirtD);
      if (ore(tx + 1, ty) !== o) P(ox + 15, oy, 1, TILE, PAL.dirtD);
      for (let i = 0; i < 6; i++) P(ox + ((rng() * 16) | 0), oy + ((rng() * 16) | 0), 1, 1, rng() < 0.5 ? PAL.dirtD : PAL.dirtL);
      const [hi, mid, lo] = ORE_COLORS[o];
      const rocks = 3 + ((rng() * 3) | 0);
      for (let i = 0; i < rocks; i++) {
        const w = 3 + ((rng() * 3) | 0), h = 2 + ((rng() * 2) | 0);
        const rx = ox + 1 + ((rng() * (14 - w)) | 0);
        const ry = oy + 1 + ((rng() * (13 - h)) | 0);
        P(rx - 1, ry, w + 2, h + 1, K);
        P(rx, ry - 1, w, 1, K);
        P(rx, ry, w, h, mid);
        P(rx, ry + h - 1, w, 1, lo);
        P(rx, ry, w - 1, 1, hi);
        P(rx - 1, ry + h + 1, w + 2, 1, 'rgba(0,0,0,0.25)');
      }
    }
  }

  // 3. water with sandy shores
  for (let ty = 0; ty < H; ty++) {
    for (let tx = 0; tx < W; tx++) {
      if (!water(tx, ty)) continue;
      const ox = tx * TILE, oy = ty * TILE;
      const deep = water(tx - 1, ty) && water(tx + 1, ty) && water(tx, ty - 1) && water(tx, ty + 1);
      P(ox, oy, TILE, TILE, deep ? PAL.water : PAL.waterL);
      if (deep) {
        for (let i = 0; i < 3; i++) P(ox + ((rng() * 14) | 0), oy + ((rng() * 16) | 0), 3, 1, PAL.waterD);
      }
      // shore: sand + foam on edges that touch land
      const edge = (dx, dy, fn) => { if (!water(tx + dx, ty + dy)) fn(); };
      edge(0, -1, () => { P(ox, oy, TILE, 2, '#e4c590'); P(ox, oy + 2, TILE, 1, PAL.cyan); });
      edge(0, 1, () => { P(ox, oy + 14, TILE, 2, '#c9a26b'); P(ox, oy + 13, TILE, 1, PAL.cyan); });
      edge(-1, 0, () => { P(ox, oy, 2, TILE, '#e4c590'); P(ox + 2, oy, 1, TILE, PAL.cyan); });
      edge(1, 0, () => { P(ox + 14, oy, 2, TILE, '#c9a26b'); P(ox + 13, oy, 1, TILE, PAL.cyan); });
      // lily pads
      if (deep && rng() < 0.12) {
        const x = ox + 3 + ((rng() * 8) | 0), y = oy + 3 + ((rng() * 8) | 0);
        P(x, y, 4, 3, PAL.leafM); P(x + 1, y, 1, 1, PAL.leafL); P(x + 2, y + 1, 1, 1, PAL.water);
        if (rng() < 0.4) P(x + 1, y + 1, 1, 1, '#ffb0d0');
      }
    }
  }
  return c;
}
