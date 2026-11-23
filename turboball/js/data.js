'use strict';
// Game constants: field geometry, arenas, cars, boost pads.

const W = 1040, H = 620;                       // world size (px)
const FIELD = { l: 70, r: 970, t: 70, b: 550, corner: 74, goalT: 242, goalB: 378, depth: 48 };
const CX = (FIELD.l + FIELD.r) / 2, CY = (FIELD.t + FIELD.b) / 2;
const BALL_R = 15;
const TICK = 1 / 60;
const MATCH_LENGTHS = [120, 180, 300];
const MATCH_LENGTH_NAMES = ['2 min', '3 min', '5 min'];
const KMH = 0.3;                                // px/s -> "km/h" for display

const CAR = {
  hl: 18, hw: 10,            // half length / half width of the body box
  circR: 10.5, circOff: 7.5, // two collision circles along the body
  accel: 560, brake: 1000, reverseMax: 220, max: 340,
  boostAccel: 1050, boostMax: 580, boostUse: 33,
  turn: 3.7, airTurn: 2.2,
  hopV: 270, hopPush: 230, hopCd: 1.1, gravity: 950,
  height: 17,
};

const ARENAS = [
  {
    id: 'park', name: 'Sunset Park', music: 'park', grip: 9.5, ballDrag: 0.42, wallE: 0.78,
    desc: 'Fresh grass at golden hour.',
    pitch: ['#4c9a3e', '#57a646'], line: 'rgba(255,255,255,0.78)', wall: '#f4ede0', wallDark: '#b5a58a',
    stands: '#5b4a5e', standsDark: '#2f2638', seat: '#8a3b4b', grade: 'rgba(255,150,70,0.10)', night: 0,
    shadow: [9, 7], crowd: ['#ffd166', '#ef476f', '#06d6a0', '#118ab2', '#f4f1de', '#e07a5f', '#ffffff'], sky: '#ffb36b',
  },
  {
    id: 'neon', name: 'Neon Night', music: 'neon', grip: 9.5, ballDrag: 0.40, wallE: 0.82,
    desc: 'Synthwave stadium under the lights.',
    pitch: ['#101631', '#131a3a'], line: '#ff4fd8', wall: '#38e8ff', wallDark: '#145a80',
    stands: '#140f2b', standsDark: '#07060f', seat: '#2a1c4f', grade: 'rgba(60,20,120,0.10)', night: 0.55,
    shadow: [4, 5], crowd: ['#ff4fd8', '#38e8ff', '#ffe066', '#9d7bff', '#ff8a3d'], grid: '#2b3a8a', sky: '#9d7bff',
  },
  {
    id: 'rink', name: 'Frostbite Rink', music: 'rink', grip: 3.6, ballDrag: 0.24, wallE: 0.86,
    desc: 'Ice! Slippery cars, fast ball.',
    pitch: ['#dcf0fb', '#e6f5fd'], line: 'rgba(40,110,220,0.75)', wall: '#ffffff', wallDark: '#9cc3de',
    stands: '#33476b', standsDark: '#1b2740', seat: '#4b6fa5', grade: 'rgba(120,190,255,0.08)', night: 0.1,
    shadow: [6, 6], crowd: ['#ffffff', '#7ec8ff', '#ff6b6b', '#ffd93d', '#c0f0ff'], sky: '#bfe6ff', ice: true,
  },
  {
    id: 'dunes', name: 'Dune Bowl', music: 'dunes', grip: 8, ballDrag: 0.55, wallE: 0.7,
    desc: 'Desert sand. Heavy ball, big drifts.',
    pitch: ['#e0b46a', '#e6bd77'], line: 'rgba(255,250,235,0.7)', wall: '#c9773f', wallDark: '#7a3f20',
    stands: '#7a4a2c', standsDark: '#3e2414', seat: '#a8572f', grade: 'rgba(255,120,30,0.09)', night: 0,
    shadow: [10, 8], crowd: ['#fff3c4', '#e76f51', '#2a9d8f', '#f4a261', '#264653', '#ffffff'], sky: '#ffcf7a', sand: true,
  },
  {
    id: 'skyline', name: 'Skyline Rooftop', music: 'skyline', grip: 10.5, ballDrag: 0.40, wallE: 0.8,
    desc: 'Asphalt court above the city at dusk.',
    pitch: ['#34363e', '#383a43'], line: 'rgba(255,214,90,0.85)', wall: '#d94b4b', wallDark: '#6b1f2a',
    stands: '#1e2230', standsDark: '#0d0f17', seat: '#3a4058', grade: 'rgba(255,90,140,0.08)', night: 0.35,
    shadow: [5, 6], crowd: ['#ffd25a', '#ff6fa3', '#6fd6ff', '#ffffff', '#b38cff'], sky: '#ff7aa8', city: true,
  },
];
const arenaById = (id) => ARENAS.find((a) => a.id === id) || ARENAS[0];

const PAINTS = [
  { name: 'Azure', c: '#2f7bff' }, { name: 'Blaze', c: '#ff5a1f' }, { name: 'Lime', c: '#3ddc5a' }, { name: 'Gold', c: '#ffc21a' },
  { name: 'Violet', c: '#a54dff' }, { name: 'Cherry', c: '#ff2e5b' }, { name: 'Aqua', c: '#18d5d5' }, { name: 'Pearl', c: '#eeeef4' },
];
const BODIES = [
  { id: 'striker', name: 'Striker', desc: 'Sleek all-rounder' },
  { id: 'brick', name: 'Brick', desc: 'Boxy bruiser' },
  { id: 'wedge', name: 'Wedge', desc: 'Low and pointy' },
];

const PADS = [
  { x: 150, y: 128, big: true }, { x: 890, y: 128, big: true }, { x: 150, y: 492, big: true }, { x: 890, y: 492, big: true },
  { x: 330, y: 190 }, { x: 710, y: 190 }, { x: 330, y: 430 }, { x: 710, y: 430 },
  { x: CX, y: 132 }, { x: CX, y: 488 }, { x: 240, y: CY }, { x: 800, y: CY },
];
const PAD_RESPAWN = { big: 10, small: 4.5 };
const PAD_AMOUNT = { big: 100, small: 22 };

// Kickoff spots for player 0 (player 1 is mirrored).
const KICKOFFS = [
  { x: 330, y: CY, a: 0 },
  { x: 300, y: CY - 90, a: 0.42 },
  { x: 300, y: CY + 90, a: -0.42 },
  { x: 250, y: CY, a: 0 },
];

const EMOTES = ['Nice shot!', 'What a save!', 'Wow!', 'Oops...', 'GG'];
