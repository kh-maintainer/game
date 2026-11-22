'use strict';
// ---------------------------------------------------------------------------
// DOM UI + mouse/keyboard input. All world changes go through act() which
// routes them via Net (solo / host / guest).
// ---------------------------------------------------------------------------

const $ = (sel) => document.querySelector(sel);
const el = (tag, cls, html) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html !== undefined) e.innerHTML = html;
  return e;
};
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const itemImg = (id) => `<img class="ico" src="${iconURL('item', id)}" alt="">`;
const bldImg = (id) => `<img class="ico" src="${iconURL('bld', id)}" alt="">`;
const FORWARD_EVENTS = { ach: 1, goal: 1, launch: 1 };
const MINI_COLORS = {
  belt: '#8a8a98', miner: '#f2c94c', smelter: '#ff8a2a', seller: '#7be38f', splitter: '#e0c040', assembler: '#7898bb',
  foundry: '#c0573a', chest: '#b07a40', tunnel: '#5a5a66', sorter: '#b07ae0', launchpad: '#ffffff',
};

class UI {
  constructor(app) {
    this.app = app;
    const settings = loadSettings();
    this.input = {
      tool: null,
      rot: 0,
      hover: null,
      selected: null, // {x, y}
      deleting: false,
      showGrid: settings.grid !== false,
      dayNight: settings.dayNight !== false,
    };
    this.tab = 'upgrades';
    this.keys = new Set();
    this.lastSlow = 0;
    this.lastMini = 0;
    this.lastSellCount = 0;
    $('#coin-ico').src = iconURL('coin');
    this.buildToolbar();
    this.bindPanel();
    this.bindMouse();
    this.bindKeys();
    this.bindTopbar();
    this.bindChat();
    this.bindMinimap();
    this.renderNet();
  }

  get game() { return this.app.game; }
  get r() { return this.app.renderer; }

  act(a) {
    const res = Net.act(a);
    if (!res.ok && res.err && res.err !== 'Tile occupied') { this.toast(res.err, true); }
    return res;
  }

  // ------------------------------ toolbar ----------------------------------
  buildToolbar() {
    const bar = $('#toolbar');
    bar.innerHTML = '';
    this.toolBtns = {};
    BUILD_ORDER.forEach((id) => {
      const d = BUILDINGS[id];
      const b = el('button', 'tool');
      b.innerHTML = `<span class="key">${d.key}</span>${bldImg(id)}<span class="tname">${d.name}</span><span class="tcost"></span>`;
      b.addEventListener('click', () => { Sound.play('click'); this.selectTool(this.input.tool === id ? null : id); });
      b.addEventListener('mouseenter', () => this.showTip(b, `<b>${d.name}</b> <span class="muted">[${d.key}]</span><br>${d.desc}`));
      b.addEventListener('mouseleave', () => this.hideTip());
      bar.appendChild(b);
      this.toolBtns[id] = b;
    });
  }

  refreshToolbar() {
    const g = this.game;
    for (const id of BUILD_ORDER) {
      const b = this.toolBtns[id];
      const unlocked = g.buildingUnlocked(id);
      b.classList.toggle('locked', !unlocked);
      b.classList.toggle('hidden', !unlocked && id === 'launchpad');
      b.classList.toggle('active', this.input.tool === id);
      const c = g.cost(id);
      b.classList.toggle('poor', unlocked && g.money < c);
      b.querySelector('.tcost').textContent = unlocked ? '$' + fmt(c) : 'locked';
    }
  }

  selectTool(id) {
    if (id && !this.game.buildingUnlocked(id)) {
      this.toast(`Research needed for ${BUILDINGS[id].name}`, true);
      return;
    }
    this.input.tool = id;
    if (id) this.select(null);
    this.refreshToolbar();
  }

  // ------------------------------- panel -----------------------------------
  bindPanel() {
    document.querySelectorAll('#panel .tabs button').forEach((b) => {
      b.addEventListener('click', () => {
        Sound.play('click');
        this.tab = b.dataset.tab;
        document.querySelectorAll('#panel .tabs button').forEach((x) => x.classList.toggle('on', x === b));
        this.renderPanel();
      });
    });
    $('#panel-toggle').addEventListener('click', () => $('#panel').classList.toggle('collapsed'));
  }

  card({ icon = '', title, sub = '', desc = '', price = '', cost = '', cls = '', disabled = false, onClick }) {
    const c = el('button', 'card ' + cls);
    c.dataset.cost = cost;
    c.innerHTML = `${icon}<div class="ctext"><div class="ctitle">${title}${sub}</div><div class="cdesc">${desc}</div></div><div class="cprice">${price}</div>`;
    c.disabled = disabled;
    if (onClick) c.addEventListener('click', onClick);
    return c;
  }

  renderPanel() {
    const g = this.game;
    const body = $('#panel .body');
    const scroll = body.scrollTop;
    body.innerHTML = '';
    const add = (x) => body.appendChild(x);
    const h4 = (t) => add(el('h4', '', t));

    if (this.tab === 'upgrades') {
      h4('Land');
      const maxed = g.land >= LAND_COSTS.length;
      add(this.card({
        icon: '<div class="bigico">⛳</div>', title: 'Buy Land', sub: ` <span class="lvl">${g.land}/${LAND_COSTS.length}</span>`,
        desc: maxed ? 'You own the whole map.' : `Grow your plot to ${LAND_RADII[g.land + 1] * 2 + 1}×${LAND_RADII[g.land + 1] * 2 + 1} tiles`,
        price: maxed ? 'MAX' : '$' + fmt(g.landCost()), cost: maxed ? '' : g.landCost(), disabled: maxed,
        onClick: () => { if (this.act({ type: 'land' }).ok) { Sound.play('buy'); } },
      }));
      h4('Upgrades');
      for (const id in UPGRADES) {
        const u = UPGRADES[id];
        const lvl = g.lvl(id);
        const mx = lvl >= u.max;
        add(this.card({
          icon: bldImg(u.icon), title: u.name, sub: ` <span class="lvl">Lv ${lvl}${mx ? ' MAX' : ''}</span>`, desc: u.desc,
          price: mx ? 'MAX' : '$' + fmt(g.upgradeCost(id)), cost: mx ? '' : g.upgradeCost(id), disabled: mx,
          onClick: () => { if (this.act({ type: 'upgrade', id }).ok) Sound.play('buy'); },
        }));
      }
    } else if (this.tab === 'research') {
      for (const id in RESEARCH) {
        const r = RESEARCH[id];
        const done = g.hasResearch(id);
        const avail = g.canResearch(id);
        const req = !done && !avail ? `<div class="creq">Requires: ${r.req.map((q) => RESEARCH[q].name).join(', ')}</div>` : '';
        add(this.card({
          icon: `<div class="bigico">${done ? '✔' : avail ? '🔬' : '🔒'}</div>`, title: r.name, desc: r.desc + req,
          price: done ? '' : '$' + fmt(r.cost), cost: done || !avail ? '' : r.cost,
          cls: done ? 'done' : avail ? '' : 'blocked', disabled: done || !avail,
          onClick: () => {
            if (this.act({ type: 'research', id }).ok) { Sound.play('research'); this.toast(`Researched: ${r.name}`); }
          },
        }));
      }
    } else if (this.tab === 'patents') {
      const claim = g.claimablePatents();
      const next = Math.pow(claim + 1, 2) * PATENT_DIVISOR;
      const info = el('div', 'prestige');
      info.innerHTML = `
        <div class="pbig"><span class="patent">✦</span> ${fmt(g.meta.patents)} <small>Patents</small></div>
        <div class="cdesc">Lifetime patents: <b>${fmt(g.meta.patentsTotal)}</b> → <b class="good">+${fmt(g.meta.patentsTotal * 5)}%</b> income</div>
        <div class="cdesc">Earned this run: <b>$${fmt(g.runEarned)}</b></div>
        <div class="cdesc">Next patent at $${fmt(next)} this run</div>`;
      const btn = el('button', 'prestige-btn' + (claim < 1 ? '' : ' ready'),
        claim < 1 ? `Sell company (need $${fmt(PATENT_DIVISOR)} this run)` : `Sell company for ${fmt(claim)} Patent${claim > 1 ? 's' : ''}`);
      btn.disabled = claim < 1;
      btn.onclick = () => this.confirmPrestige();
      info.appendChild(btn);
      add(info);
      h4('Patent Office');
      for (const id in PATENT_SHOP) {
        const p = PATENT_SHOP[id];
        const lvl = g.patentLvl(id);
        const mx = lvl >= p.max;
        const c = g.patentCost(id);
        const card = this.card({
          icon: '<div class="bigico patent">✦</div>', title: p.name, sub: ` <span class="lvl">Lv ${lvl}</span>`, desc: p.desc,
          price: mx ? 'MAX' : `✦${fmt(c)}`, disabled: mx || g.meta.patents < c, cls: 'pcard',
          onClick: () => { if (this.act({ type: 'patent', id }).ok) Sound.play('research'); },
        });
        add(card);
      }
    } else if (this.tab === 'awards') {
      const n = g.achCount();
      add(el('div', 'cdesc', `${n} / ${ACHIEVEMENTS.length} unlocked · <b class="good">+${Math.round(n * ACH_BONUS * 100)}%</b> income`));
      const grid = el('div', 'awards');
      for (const a of ACHIEVEMENTS) {
        const got = !!g.meta.achievements[a.id];
        const d = el('div', 'award' + (got ? ' got' : ''), `<div class="trophy">${got ? '🏆' : '?'}</div><div><b>${a.name}</b><div class="cdesc">${a.desc}</div></div>`);
        grid.appendChild(d);
      }
      add(grid);
    } else {
      const L = g.meta.life;
      const row = (k, v, ico = '') => `<div class="stat">${ico}<span>${k}</span><b>${v}</b></div>`;
      const rows = [];
      rows.push('<h4>This run</h4>');
      rows.push(row('Earned', '$' + fmt(g.runEarned)));
      rows.push(row('Play time', fmtTime(g.stats.playTime)));
      rows.push(row('Buildings', g.buildings.length));
      rows.push(row('Sell multiplier', '×' + fmt(g.sellMult())));
      rows.push('<h4>Lifetime</h4>');
      rows.push(row('Earned', '$' + fmt(g.meta.lifetimeEarned)));
      rows.push(row('Items sold', fmt(L.itemsSold)));
      rows.push(row('Play time', fmtTime(L.playTime)));
      rows.push(row('Prestiges', g.meta.prestiges));
      rows.push(row('Launches', g.meta.launches));
      rows.push('<h4>Items (sold this run · value)</h4>');
      for (const id in ITEMS) rows.push(row(ITEMS[id].name, `${fmt(g.stats.sold[id] || 0)} · $${fmt(ITEMS[id].value * g.sellMult())}`, itemImg(id)));
      body.innerHTML = rows.join('');
    }
    body.scrollTop = scroll;
  }

  refreshAffordability() {
    document.querySelectorAll('#panel .card').forEach((c) => {
      const cost = c.dataset.cost;
      c.classList.toggle('poor', cost !== '' && cost !== undefined && this.game.money < +cost);
    });
  }

  confirmPrestige() {
    const g = this.game;
    const n = g.claimablePatents();
    const keep = g.patentLvl('archives') ? 'Research is kept (Company Archives).' : 'Research is reset.';
    this.modal(`<h2>Sell the company?</h2>
      <p>You'll receive <b class="patent">✦ ${fmt(n)} Patents</b>. Each lifetime patent permanently adds <b>+5% income</b>, and you can spend them in the Patent Office.</p>
      <p class="muted">Your factory, money, upgrades and land are reset and you start on a brand-new map. ${keep} Achievements and patents are kept.${Net.role !== 'solo' ? ' <b>This affects both players.</b>' : ''}</p>
      <div class="mbtns"><button id="m-cancel">Not yet</button><button id="m-ok" class="gold-btn">Sell & restart</button></div>`);
    $('#m-cancel').onclick = () => this.closeModal();
    $('#m-ok').onclick = () => {
      this.closeModal();
      this.act({ type: 'prestige', seed: (Math.random() * 2 ** 31) | 0 });
    };
  }

  // ----------------------------- goal widget -------------------------------
  renderGoal() {
    const g = this.game;
    const box = $('#goal');
    const goal = GOALS[g.goalIdx];
    if (!goal) {
      box.innerHTML = `<div class="gtitle">ALL GOALS COMPLETE</div><div>Sell the company in the <b>Patents</b> tab to go even bigger.</div>`;
      return;
    }
    box.innerHTML = `<div class="gtitle">GOAL ${g.goalIdx + 1}/${GOALS.length}${goal.reward ? ` · <span class="gold">+$${fmt(goal.reward)}</span>` : ''}</div><div>${goal.text}</div>`;
  }

  // ----------------------------- inspector ---------------------------------
  selectedBuilding() {
    const s = this.input.selected;
    return s ? this.game.at(s.x, s.y) : null;
  }

  select(b) {
    this.input.selected = b ? { x: b.x, y: b.y, type: b.type } : null;
    this.renderInspector();
  }

  renderInspector() {
    const box = $('#inspector');
    const b = this.selectedBuilding();
    if (!b || (this.input.selected && b.type !== this.input.selected.type)) {
      box.classList.add('hidden');
      this.input.selected = null;
      return;
    }
    box.classList.remove('hidden');
    const g = this.game;
    const d = BUILDINGS[b.type];
    const pos = { x: b.x, y: b.y };
    let html = `<div class="ihead">${bldImg(b.type)}<div><div class="ctitle">${d.name}</div><div class="cdesc">${d.desc}</div></div>
      <button class="x" id="insp-close">✕</button></div><div class="istate"></div>`;
    if (CRAFTERS[b.type] && b.type !== 'smelter') {
      html += '<div class="recipes">';
      for (const id in RECIPES) {
        const r = RECIPES[id];
        if (r.b !== b.type) continue;
        const ok = g.recipeUnlocked(id);
        const ins = Object.entries(r.in).map(([k, n]) => `${n}${itemImg(k)}`).join(' + ');
        const outs = Object.entries(r.out).map(([k, n]) => `${n}${itemImg(k)}`).join(' ');
        html += `<button class="recipe${b.recipe === id ? ' on' : ''}" data-r="${id}" ${ok ? '' : 'disabled'}>
          <span>${ins} → ${outs}</span><small>${ok ? r.time + 's' : '🔒 ' + RESEARCH[r.unlock].name}</small></button>`;
      }
      html += '</div>';
    }
    if (b.type === 'sorter') {
      html += '<div class="cdesc">Filter (goes straight through):</div><div class="filters">';
      html += `<button class="filt${!b.filter ? ' on' : ''}" data-i="">∅</button>`;
      for (const id in ITEMS) html += `<button class="filt${b.filter === id ? ' on' : ''}" data-i="${id}" title="${ITEMS[id].name}">${itemImg(id)}</button>`;
      html += '</div>';
    }
    html += `<div class="iactions">${d.dir ? '<button id="insp-rot">Rotate (R)</button>' : ''}
      ${b.type === 'tunnel' ? '<button id="insp-mode">Swap entry/exit</button>' : ''}
      <button id="insp-del" class="danger">Remove (+$${fmt(b.paid)})</button></div>`;
    box.innerHTML = html;
    $('#insp-close').onclick = () => this.select(null);
    $('#insp-del').onclick = () => { if (this.act({ type: 'remove', ...pos }).ok) Sound.play('remove'); this.select(null); };
    const rot = $('#insp-rot');
    if (rot) rot.onclick = () => { this.act({ type: 'rotate', ...pos, delta: 1 }); Sound.play('rotate'); };
    const mode = $('#insp-mode');
    if (mode) mode.onclick = () => { this.act({ type: 'tmode', ...pos }); Sound.play('rotate'); setTimeout(() => this.renderInspector(), 120); };
    box.querySelectorAll('.recipe').forEach((btn) => {
      btn.onclick = () => { this.act({ type: 'recipe', ...pos, r: btn.dataset.r }); Sound.play('click'); setTimeout(() => this.renderInspector(), 120); };
    });
    box.querySelectorAll('.filt').forEach((btn) => {
      btn.onclick = () => { this.act({ type: 'filter', ...pos, item: btn.dataset.i || null }); Sound.play('click'); setTimeout(() => this.renderInspector(), 120); };
    });
    this.updateInspectorState();
  }

  updateInspectorState() {
    const b = this.selectedBuilding();
    if (!b) { if (this.input.selected) this.renderInspector(); return; }
    const st = $('#inspector .istate');
    if (!st) return;
    const g = this.game;
    let s = '';
    if (b.type === 'miner') {
      const ore = g.oreAt(b.x, b.y);
      s = `Mining ${itemImg(ore)} ${ITEMS[ore].name} · ${Math.min(20, g.minerRate()).toFixed(2)}/s`;
      if (b.out > 0 && !b.working) s += ' · <span class="warn">output blocked</span>';
    } else if (CRAFTERS[b.type]) {
      const r = RECIPES[b.recipe];
      if (r) {
        const rate = (g.craftMult() / r.time).toFixed(2);
        const inv = Object.keys(r.in).map((k) => `${itemImg(k)}${b.inv[k] || 0}/${r.in[k]}`).join(' ');
        s = `Making ${itemImg(k0(r.out))} ${ITEMS[k0(r.out)].name} · ${rate}/s<br>Input: ${inv} · ${Math.round(b.t * 100)}%`;
        if (b.outQ.length) s += ' · <span class="warn">output blocked</span>';
        if (!g.recipeUnlocked(b.recipe)) s += ' · <span class="warn">recipe locked</span>';
      } else s = 'Idle — feed it ore or stone.';
    } else if (b.type === 'belt' || b.type === 'splitter' || b.type === 'sorter') {
      s = b.item ? `Carrying ${itemImg(b.item)} ${ITEMS[b.item].name}` : 'Empty';
      if (b.type === 'belt') s += ` · ${g.beltSpeed().toFixed(2)} tiles/s`;
    } else if (b.type === 'chest') {
      const counts = {};
      for (const it of b.store) counts[it] = (counts[it] || 0) + 1;
      s = `${b.store.length}/${CHEST_CAP} items<br>` + (Object.entries(counts).map(([k, n]) => `${itemImg(k)}${n}`).join(' ') || '<span class="muted">empty</span>');
    } else if (b.type === 'tunnel') {
      const p = g.tunnelPartner(b);
      s = b.mode === 'in'
        ? (p ? `Entrance → exit ${Math.abs(p.x - b.x) + Math.abs(p.y - b.y)} tiles ahead · ${b.q.length} underground` : '<span class="warn">No exit found</span> — place an exit (same direction) within ' + TUNNEL_RANGE + ' tiles ahead')
        : 'Exit — items surface here.';
    } else if (b.type === 'seller') {
      s = `Sell value ×${fmt(g.sellMult())}`;
    } else if (b.type === 'launchpad') {
      s = b.launchT ? '<b class="gold">LIFTOFF!</b>' : `Robots loaded: ${itemImg('robot')} ${b.count || 0}/${LAUNCH_REQ}`;
    }
    st.innerHTML = s;
  }

  // ------------------------------- input -----------------------------------
  bindMouse() {
    const cv = this.r.canvas;
    let down = null;
    cv.addEventListener('contextmenu', (e) => e.preventDefault());

    const tileOf = (e) => {
      const p = this.r.screenToTile(e.clientX, e.clientY);
      return { x: Math.floor(p.x), y: Math.floor(p.y) };
    };

    cv.addEventListener('mousedown', (e) => {
      this.hideTip();
      if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
      const t = tileOf(e);
      down = { button: e.button, sx: e.clientX, sy: e.clientY, camx: this.r.cam.x, camy: this.r.cam.y, moved: false, last: t, placed: new Set() };
      down.pan = e.button === 1 || (e.button === 0 && this.keys.has(' '));
      if (down.pan) return;
      if (e.button === 0 && e.altKey) { this.ping(t); down = null; return; }
      if (e.button === 2) {
        this.input.deleting = true;
        this.deleteAt(t);
      } else if (e.button === 0 && this.input.tool) {
        this.placeAt(t, this.input.rot, down);
      }
    });

    window.addEventListener('mousemove', (e) => {
      const t = tileOf(e);
      this.input.hover = e.target === cv ? t : null;
      if (e.target === cv) this.updateStatus(t);
      if (!down) return;
      const dx = e.clientX - down.sx, dy = e.clientY - down.sy;
      if (Math.abs(dx) + Math.abs(dy) > 4) down.moved = true;
      if (down.pan || (down.button === 0 && !this.input.tool)) {
        const s = (this.r.scale() / this.r.dpr) * TILE;
        this.r.cam.x = down.camx - dx / s;
        this.r.cam.y = down.camy - dy / s;
        this.r.clampCamera();
        return;
      }
      if (t.x === down.last.x && t.y === down.last.y) return;
      if (down.button === 2) {
        this.walk(down.last, t, (p) => this.deleteAt(p));
      } else if (down.button === 0 && this.input.tool) {
        const lineTool = this.input.tool === 'belt';
        this.walk(down.last, t, (q, prev, dir) => {
          if (lineTool) {
            // re-aim the belt we just laid so the line bends with the cursor
            const key = prev.x + ',' + prev.y;
            const pb = this.game.at(prev.x, prev.y);
            if (down.placed.has(key) && pb && pb.type === 'belt' && pb.dir !== dir) this.act({ type: 'setdir', x: prev.x, y: prev.y, dir });
            this.input.rot = dir;
          }
          this.placeAt(q, this.input.rot, down);
        });
      }
      down.last = t;
    });

    window.addEventListener('mouseup', (e) => {
      if (down && down.button === 0 && !down.moved && !this.input.tool && !down.pan && e.target === cv) {
        const t = tileOf(e);
        const b = this.game.at(t.x, t.y);
        this.select(b);
        if (b) Sound.play('click');
      }
      down = null;
      this.input.deleting = false;
    });

    cv.addEventListener('wheel', (e) => {
      e.preventDefault();
      this.zoomAt(e.deltaY < 0 ? 1 : -1, e.clientX, e.clientY);
    }, { passive: false });
  }

  zoomAt(delta, sx = window.innerWidth / 2, sy = window.innerHeight / 2) {
    const before = this.r.screenToTile(sx, sy);
    this.r.cam.zoom = Math.max(1, Math.min(7, this.r.cam.zoom + delta));
    const after = this.r.screenToTile(sx, sy);
    this.r.cam.x += before.x - after.x;
    this.r.cam.y += before.y - after.y;
    this.r.clampCamera();
  }

  // Step tile-by-tile from a to b (x first, then y) calling fn(tile, prevTile, dir).
  walk(a, b, fn) {
    let cur = { x: a.x, y: a.y };
    let guard = 0;
    while ((cur.x !== b.x || cur.y !== b.y) && guard++ < 300) {
      let dir;
      if (cur.x !== b.x) dir = b.x > cur.x ? 0 : 2;
      else dir = b.y > cur.y ? 1 : 3;
      const next = { x: cur.x + DIRS[dir].x, y: cur.y + DIRS[dir].y };
      fn(next, cur, dir);
      cur = next;
    }
  }

  placeAt(t, dir, down) {
    const tool = this.input.tool;
    const err = this.game.placeError(tool, t.x, t.y);
    if (err) {
      // stay quiet about occupied tiles / bare ground while dragging
      const dragging = down && down.placed.size;
      if (err !== 'Tile occupied' && !(dragging && err === 'Miners need ore')) { this.toast(err, true); }
      return;
    }
    const res = this.act({ type: 'place', b: tool, x: t.x, y: t.y, dir });
    if (res.ok) {
      Sound.play('place');
      if (down) down.placed.add(t.x + ',' + t.y);
    }
  }

  deleteAt(t) {
    if (!this.game.at(t.x, t.y)) return;
    if (this.input.selected && this.input.selected.x === t.x && this.input.selected.y === t.y) this.select(null);
    if (this.act({ type: 'remove', x: t.x, y: t.y }).ok) { Sound.play('remove'); this.r.dust(t.x, t.y); }
  }

  ping(t) {
    if (!this.game.inBounds(t.x, t.y)) return;
    this.r.addPing(t.x, t.y, Net.myColor());
    Sound.play('ping');
    Net.ping(t.x, t.y);
  }

  bindKeys() {
    window.addEventListener('keydown', (e) => {
      const tag = e.target.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') {
        if (e.key === 'Escape') e.target.blur();
        return;
      }
      if (!$('#modal').classList.contains('hidden')) {
        if (e.key === 'Escape' && this.modalClosable) this.closeModal();
        return;
      }
      const k = e.key.toLowerCase();
      this.keys.add(k);
      const toolKey = BUILD_ORDER.find((id) => BUILDINGS[id].key.toLowerCase() === k);
      if (toolKey) {
        this.selectTool(this.input.tool === toolKey ? null : toolKey);
        Sound.play('click');
      } else if (k === 'r') {
        const h = this.input.hover;
        const under = h && this.game.at(h.x, h.y);
        const sel = this.selectedBuilding();
        const delta = e.shiftKey ? -1 : 1;
        if (this.input.tool) this.input.rot = (this.input.rot + delta + 4) % 4;
        else if (under) this.act({ type: 'rotate', x: under.x, y: under.y, delta });
        else if (sel) this.act({ type: 'rotate', x: sel.x, y: sel.y, delta });
        Sound.play('rotate');
      } else if (k === 'q') {
        // pipette: copy the building under the cursor, otherwise cancel
        const h = this.input.hover;
        const under = h && this.game.at(h.x, h.y);
        if (under && this.game.buildingUnlocked(under.type)) { this.selectTool(under.type); this.input.rot = under.dir; Sound.play('click'); }
        else if (this.input.tool) this.selectTool(null);
        else this.select(null);
      } else if (k === 'escape') {
        if (this.input.tool) this.selectTool(null);
        else this.select(null);
      } else if (k === 'g') {
        if (this.input.hover) this.ping(this.input.hover);
      } else if (k === 'enter') {
        if (Net.role !== 'solo') { e.preventDefault(); $('#chat-input').focus(); }
      } else if (k === 'm') {
        Sound.settings.muted = !Sound.settings.muted;
        Sound.applyVolumes();
        saveSettings({ sound: Sound.settings });
        this.toast(Sound.settings.muted ? 'Sound muted' : 'Sound on');
      } else if (k === 'h' || k === 'f1') {
        e.preventDefault();
        this.showHelp();
      } else if (k === '=' || k === '+') {
        this.zoomAt(1);
      } else if (k === '-') {
        this.zoomAt(-1);
      } else if (k === ' ') {
        e.preventDefault();
      }
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.key.toLowerCase()));
    window.addEventListener('blur', () => this.keys.clear());
  }

  panFromKeys(dt) {
    let dx = 0, dy = 0;
    if (this.keys.has('a') || this.keys.has('arrowleft')) dx--;
    if (this.keys.has('d') || this.keys.has('arrowright')) dx++;
    if (this.keys.has('w') || this.keys.has('arrowup')) dy--;
    if (this.keys.has('s') || this.keys.has('arrowdown')) dy++;
    if (!dx && !dy) return;
    const speed = (this.keys.has('shift') ? 70 : 32) / this.r.cam.zoom;
    this.r.cam.x += dx * speed * dt;
    this.r.cam.y += dy * speed * dt;
    this.r.clampCamera();
  }

  updateStatus(t) {
    const g = this.game;
    if (!g.inBounds(t.x, t.y)) { $('#status').textContent = ''; return; }
    const ore = g.oreAt(t.x, t.y);
    const b = g.at(t.x, t.y);
    let s = `(${t.x}, ${t.y})`;
    if (!g.inLand(t.x, t.y)) s += ' · unowned land';
    if (ore) s += ' · ' + ITEMS[ore].name;
    if (b) s += ' · ' + BUILDINGS[b.type].name;
    $('#status').textContent = s;
  }

  // ------------------------------ topbar -----------------------------------
  bindTopbar() {
    $('#btn-help').onclick = () => { Sound.play('click'); this.showHelp(); };
    $('#btn-settings').onclick = () => { Sound.play('click'); this.showSettings(); };
    $('#net-pill').onclick = () => { Sound.play('click'); this.showCoop(); };
  }

  renderNet() {
    const pill = $('#net-pill');
    if (!pill) return;
    const st = Net.status;
    let txt = '👥 Co-op', cls = '';
    if (Net.role === 'host') {
      if (st === 'connected') { txt = `👥 ${esc(Net.partner ? Net.partner.name : 'Partner')} · ${Net.latency ?? '…'}ms`; cls = 'on'; }
      else txt = st === 'starting' ? '👥 Starting…' : `👥 Room ${Net.code} · waiting`;
      if (st !== 'connected') cls = 'wait';
    } else if (Net.role === 'guest') {
      if (st === 'connected') { txt = `👥 In ${esc(Net.partner ? Net.partner.name : 'host')}'s factory · ${Net.latency ?? '…'}ms`; cls = 'on guest'; }
      else { txt = '👥 Connecting…'; cls = 'wait'; }
    }
    pill.innerHTML = txt;
    pill.className = cls;
    $('#chat').classList.toggle('hidden', Net.role === 'solo');
  }

  showCoop() {
    if (Net.role === 'host') {
      this.modal(`<h2>Hosting co-op</h2>
        <p>Share this room code with your friend:</p>
        <div class="roomcode">${Net.code || '…'}</div>
        <p class="muted">${Net.status === 'connected' ? `${esc(Net.partner.name)} is building with you.` : 'Waiting for someone to join… (keep this tab open)'}</p>
        <div class="mbtns"><button id="m-copy">Copy code</button>${location.protocol.startsWith('http') ? '<button id="m-link">Copy invite link</button>' : ''}<button id="m-stop" class="danger">Stop hosting</button><button id="m-ok">Close</button></div>`, true);
      $('#m-copy').onclick = () => { navigator.clipboard && navigator.clipboard.writeText(Net.code); this.toast('Code copied'); };
      const link = $('#m-link');
      if (link) link.onclick = () => { navigator.clipboard && navigator.clipboard.writeText(`${location.origin}${location.pathname}?join=${Net.code}`); this.toast('Invite link copied'); };
      $('#m-stop').onclick = () => { Net.leave(); this.closeModal(); this.toast('Stopped hosting'); };
      $('#m-ok').onclick = () => this.closeModal();
      return;
    }
    if (Net.role === 'guest') {
      this.modal(`<h2>Co-op</h2><p>You're playing in ${esc(Net.partner ? Net.partner.name : 'the host')}'s factory. Progress is saved on their computer.</p>
        <div class="mbtns"><button id="m-leave" class="danger">Leave</button><button id="m-ok">Close</button></div>`, true);
      $('#m-leave').onclick = () => { Net.leave(); this.closeModal(); };
      $('#m-ok').onclick = () => this.closeModal();
      return;
    }
    this.modal(`<h2>Co-op (2 players)</h2>
      <p>Build one factory together over the internet. The host's world and save are used; money, research and upgrades are shared.</p>
      <label class="field">Your name <input id="m-name" maxlength="16" value="${esc(Net.myName)}"></label>
      <div class="coopgrid">
        <div><h3>Host</h3><p class="muted">Invite a friend into <b>this</b> factory.</p><button id="m-host" class="gold-btn">Host game</button></div>
        <div><h3>Join</h3><p class="muted">Enter your friend's room code.</p><input id="m-code" maxlength="5" placeholder="ABCDE" class="codeinput"><button id="m-join">Join</button></div>
      </div>
      <div class="mbtns"><button id="m-ok">Close</button></div>`, true);
    const saveName = () => { Net.myName = ($('#m-name').value.trim() || 'Player').slice(0, 16); saveSettings({ name: Net.myName }); };
    $('#m-host').onclick = () => { saveName(); Net.host(); this.showCoop(); };
    $('#m-join').onclick = () => { saveName(); Net.join($('#m-code').value); this.closeModal(); this.toast('Connecting…'); };
    $('#m-code').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('#m-join').click(); });
    $('#m-ok').onclick = () => this.closeModal();
  }

  // ------------------------------- chat ------------------------------------
  bindChat() {
    const inp = $('#chat-input');
    inp.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        const text = inp.value.trim();
        if (text) {
          Net.chat(text);
          this.chatLine(Net.myName, text, Net.myColor());
        }
        inp.value = '';
        inp.blur();
      }
    });
  }

  chatLine(name, text, color) {
    const log = $('#chat-log');
    const line = el('div', 'chatline', `<b style="color:${color}">${esc(name)}:</b> ${esc(text)}`);
    log.appendChild(line);
    while (log.children.length > 30) log.firstChild.remove();
    log.scrollTop = log.scrollHeight;
  }

  // ------------------------------ minimap ----------------------------------
  bindMinimap() {
    const mm = $('#minimap');
    let dragging = false;
    const go = (e) => {
      const r = mm.getBoundingClientRect();
      this.r.cam.x = ((e.clientX - r.left) / r.width) * this.game.w;
      this.r.cam.y = ((e.clientY - r.top) / r.height) * this.game.h;
      this.r.clampCamera();
    };
    mm.addEventListener('mousedown', (e) => { dragging = true; go(e); });
    window.addEventListener('mousemove', (e) => { if (dragging) go(e); });
    window.addEventListener('mouseup', () => { dragging = false; });
  }

  drawMinimap() {
    const g = this.game;
    const mm = $('#minimap');
    if (mm.width !== g.w) { mm.width = g.w; mm.height = g.h; }
    const ctx = mm.getContext('2d');
    if (this.miniSeed !== g.seed) {
      this.miniSeed = g.seed;
      const img = ctx.createImageData(g.w, g.h);
      const col = { iron_ore: [148, 176, 194], copper_ore: [239, 125, 87], stone: [179, 165, 141], coal: [38, 43, 68], gold_ore: [255, 205, 117] };
      for (let i = 0; i < g.w * g.h; i++) {
        const c = col[g.ore[i]] || (g.water[i] ? [59, 93, 201] : g.decor[i] === 1 || g.decor[i] === 2 ? [34, 85, 58] : [76, 154, 75]);
        img.data.set([c[0], c[1], c[2], 255], i * 4);
      }
      this.miniBase = img;
    }
    ctx.putImageData(this.miniBase, 0, 0);
    const c = g.center(), r = g.landRadius();
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(0, 0, g.w, c.y - r);
    ctx.fillRect(0, c.y + r + 1, g.w, g.h);
    ctx.fillRect(0, c.y - r, c.x - r, 2 * r + 1);
    ctx.fillRect(c.x + r + 1, c.y - r, g.w, 2 * r + 1);
    for (const b of g.buildings) {
      ctx.fillStyle = MINI_COLORS[b.type] || '#fff';
      ctx.fillRect(b.x, b.y, 1, 1);
    }
    // viewport
    const tl = this.r.screenToTile(0, 0), br = this.r.screenToTile(window.innerWidth, window.innerHeight);
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1;
    ctx.strokeRect(Math.round(tl.x) + 0.5, Math.round(tl.y) + 0.5, Math.round(br.x - tl.x), Math.round(br.y - tl.y));
    if (Net.partner && Net.partner.cursor) {
      ctx.fillStyle = Net.partnerColor();
      ctx.fillRect(Net.partner.cursor.x - 1, Net.partner.cursor.y - 1, 3, 3);
    }
  }

  // ------------------------------ modals -----------------------------------
  showTitle(hasSave) {
    const g = this.game;
    this.modal(`<div class="title">
        <div class="tlogo">PIXEL<span>FOUNDRY</span></div>
        <div class="tsub">an incremental factory game · solo or 2-player co-op</div>
        <div class="tbtns">
          <button id="t-play" class="gold-btn big">${hasSave ? 'Continue' : 'New Game'}</button>
          <button id="t-coop" class="big">Co-op</button>
          <button id="t-help" class="big">How to play</button>
        </div>
        ${hasSave ? `<div class="muted">Saved factory · $${fmt(g.money)} · ${fmtTime(g.meta.life.playTime)} played${g.meta.prestiges ? ` · ✦${fmt(g.meta.patentsTotal)}` : ''}</div>` : ''}
        <div class="muted small">Sound and music are synthesized live — press M to mute.</div>
      </div>`);
    this.titleOpen = true;
    $('#modal').classList.add('title-mode');
    const start = () => Sound.unlock();
    $('#t-play').onclick = () => {
      start();
      this.closeModal();
      if (this.app.pendingOffline) this.app.pendingOffline();
      else if (!hasSave) this.showHelp();
    };
    $('#t-coop').onclick = () => { start(); this.closeModal(); this.showCoop(); };
    $('#t-help').onclick = () => { start(); this.showHelp(true); };
  }

  showHelp(fromTitle) {
    this.modal(`<h2>How to play</h2>
      <p>Mine ore, smelt it, craft parts, and sell everything at the <b>Market</b>. Reinvest in upgrades, research and land, then <b>sell the company</b> for Patents and go again — bigger. Final goal: launch the <b>Orbital Foundry</b>.</p>
      <ul>
        <li><b>1–9, 0, P</b> pick a building · <b>R</b> rotate (Shift+R back) · <b>Q</b> copy building under cursor · <b>Esc</b> cancel</li>
        <li><b>Left click</b> build · <b>drag</b> to lay conveyor lines that bend with you</li>
        <li><b>Right click / drag</b> remove (full refund)</li>
        <li><b>Click</b> a building to inspect it, pick a recipe or set a filter</li>
        <li><b>WASD</b> / arrows / drag ground to pan (Shift = faster) · <b>wheel</b> zoom · click the minimap to jump</li>
        <li>Co-op: <b>Enter</b> chat · <b>G</b> or <b>Alt+click</b> ping a tile for your partner</li>
        <li><b>M</b> mute · <b>H</b> help</li>
      </ul>
      <p class="muted">Start: put a Miner on the grey iron patch facing a conveyor, and run the conveyor into the Market. Then put a Smelter in the line — plates sell for 4×. Follow the goal in the top-left.</p>
      <div class="mbtns"><button id="m-ok">${fromTitle ? 'Back' : "Let's build"}</button></div>`, !fromTitle);
    $('#m-ok').onclick = () => { if (fromTitle) this.showTitle(!!this.app.hadSave); else this.closeModal(); };
  }

  showSettings() {
    const S = Sound.settings;
    this.modal(`<h2>Settings</h2>
      <label class="field">Player name <input id="s-name" maxlength="16" value="${esc(Net.myName)}"></label>
      <label class="field">Sound effects <input id="s-sfx" type="range" min="0" max="1" step="0.05" value="${S.sfx}"></label>
      <label class="field">Music <input id="s-music" type="range" min="0" max="1" step="0.05" value="${S.music}"></label>
      <label class="check"><input id="s-mute" type="checkbox" ${S.muted ? 'checked' : ''}> Mute everything (M)</label>
      <label class="check"><input id="s-grid" type="checkbox" ${this.input.showGrid ? 'checked' : ''}> Show grid</label>
      <label class="check"><input id="s-day" type="checkbox" ${this.input.dayNight ? 'checked' : ''}> Day / night cycle</label>
      <h4>Save data</h4>
      <div class="mbtns left"><button id="s-save">Save now</button><button id="s-export">Export</button><button id="s-import">Import</button><button id="s-reset" class="danger">Wipe everything</button></div>
      <textarea id="s-text" class="hidden" rows="4" placeholder="Paste a save here, then press Import again"></textarea>
      <div class="mbtns"><button id="m-ok">Done</button></div>`, true);
    const upd = () => {
      S.sfx = +$('#s-sfx').value; S.music = +$('#s-music').value; S.muted = $('#s-mute').checked;
      Sound.applyVolumes();
      this.input.showGrid = $('#s-grid').checked;
      this.input.dayNight = $('#s-day').checked;
      Net.myName = ($('#s-name').value.trim() || 'Player').slice(0, 16);
      saveSettings({ sound: S, grid: this.input.showGrid, dayNight: this.input.dayNight, name: Net.myName });
    };
    ['#s-sfx', '#s-music', '#s-mute', '#s-grid', '#s-day', '#s-name'].forEach((id) => $(id).addEventListener('input', upd));
    $('#s-sfx').addEventListener('change', () => Sound.play('buy'));
    $('#s-save').onclick = () => { if (this.game.save()) this.toast('Game saved'); else this.toast('Guests can’t save — the host keeps the world', true); };
    $('#s-export').onclick = () => {
      const ta = $('#s-text');
      ta.classList.remove('hidden');
      ta.value = btoa(unescape(encodeURIComponent(JSON.stringify(this.game.serialize()))));
      ta.select();
      navigator.clipboard && navigator.clipboard.writeText(ta.value).then(() => this.toast('Save copied to clipboard'));
    };
    $('#s-import').onclick = () => {
      const ta = $('#s-text');
      if (ta.classList.contains('hidden') || !ta.value.trim()) { ta.classList.remove('hidden'); ta.value = ''; ta.focus(); return; }
      if (Net.role !== 'solo') { this.toast('Leave co-op before importing a save', true); return; }
      try {
        const data = JSON.parse(decodeURIComponent(escape(atob(ta.value.trim()))));
        this.app.loadData(data);
        this.closeModal();
        this.toast('Save imported');
      } catch (e) { this.toast('That save code is invalid', true); }
    };
    $('#s-reset').onclick = () => {
      this.modal(`<h2>Wipe everything?</h2><p>This deletes your factory <b>and</b> all patents, achievements and stats. There is no undo.</p>
        <div class="mbtns"><button id="m-cancel">Cancel</button><button id="m-ok" class="danger">Wipe</button></div>`, true);
      $('#m-cancel').onclick = () => this.showSettings();
      $('#m-ok').onclick = () => { this.closeModal(); this.app.wipe(); };
    };
    $('#m-ok').onclick = () => this.closeModal();
  }

  alert(title, msg) {
    this.modal(`<h2>${esc(title)}</h2><p>${esc(msg)}</p><div class="mbtns"><button id="m-ok">OK</button></div>`, true);
    $('#m-ok').onclick = () => this.closeModal();
  }

  modal(html, closable = false) {
    const m = $('#modal');
    m.querySelector('.mbox').innerHTML = html;
    m.classList.remove('hidden');
    m.classList.remove('title-mode');
    this.titleOpen = false;
    this.modalClosable = closable;
    this.hideTip();
  }
  closeModal() { $('#modal').classList.add('hidden'); this.titleOpen = false; }

  toast(msg, bad) {
    if (bad) Sound.play('error');
    const t = el('div', 'toast' + (bad ? ' bad' : ''), msg);
    $('#toasts').appendChild(t);
    while ($('#toasts').children.length > 5) $('#toasts').firstChild.remove();
    setTimeout(() => t.classList.add('out'), 2200);
    setTimeout(() => t.remove(), 2700);
  }

  bigToast(icon, title, sub) {
    const t = el('div', 'bigtoast', `<div class="bt-icon">${icon}</div><div><div class="bt-title">${title}</div><div class="bt-sub">${sub}</div></div>`);
    $('#toasts').appendChild(t);
    setTimeout(() => t.classList.add('out'), 3500);
    setTimeout(() => t.remove(), 4000);
  }

  showTip(anchor, html) {
    const tip = $('#tooltip');
    tip.innerHTML = html;
    tip.classList.remove('hidden');
    const r = anchor.getBoundingClientRect();
    tip.style.left = Math.max(8, Math.min(window.innerWidth - 248, r.left + r.width / 2 - 120)) + 'px';
    tip.style.top = r.top - 10 + 'px';
  }
  hideTip() { $('#tooltip').classList.add('hidden'); }

  // --------------------------- game events ---------------------------------
  handleEvent(e) {
    const g = this.game;
    switch (e.type) {
      case 'ach': {
        const a = ACHIEVEMENTS.find((x) => x.id === e.id);
        if (!a) return;
        Sound.play('achievement');
        this.bigToast('🏆', `Achievement: ${a.name}`, `${a.desc} · +${ACH_BONUS * 100}% income`);
        break;
      }
      case 'goal':
        Sound.play('goal');
        this.bigToast('✔', 'Goal complete!', `${e.text}${e.reward ? ` · +$${fmt(e.reward)}` : ''}`);
        break;
      case 'prestige':
        Sound.play('prestige');
        this.r.setGame(g);
        this.select(null);
        this.selectTool(null);
        this.bigToast('✦', `Company sold for ${fmt(e.n)} Patents!`, 'A new map awaits. Your patents boost all income.');
        break;
      case 'liftoff':
        Sound.play('liftoff');
        break;
      case 'launch':
        Sound.play('victory');
        this.modal(`<div class="victory"><div class="vrocket">🚀</div><h2>The Orbital Foundry has launched!</h2>
          <p>Your factory built a space station out of ${LAUNCH_REQ} robots. ${g.meta.launches > 1 ? `That's launch #${g.meta.launches}.` : 'You beat Pixel Foundry!'}</p>
          <p>Reward: <b class="patent">✦ 5 Patents</b></p>
          <p class="muted">Lifetime: $${fmt(g.meta.lifetimeEarned)} earned · ${fmt(g.meta.life.itemsSold)} items sold · ${fmtTime(g.meta.life.playTime)} played</p>
          <p class="muted">Keep going: every launch pays out more patents, and prestiging makes the next run faster.</p>
          <div class="mbtns"><button id="m-ok" class="gold-btn">Keep building</button></div></div>`, true);
        $('#m-ok').onclick = () => this.closeModal();
        break;
    }
  }

  onRemoteAction(a, partner) {
    // light feedback when the partner does something notable
    if (a.type === 'research') this.toast(`${esc(partner ? partner.name : 'Partner')} researched ${RESEARCH[a.id].name}`);
    else if (a.type === 'land') this.toast(`${esc(partner ? partner.name : 'Partner')} bought more land`);
    else if (a.type === 'upgrade') this.toast(`${esc(partner ? partner.name : 'Partner')} upgraded ${UPGRADES[a.id].name}`);
  }

  // ------------------------------ per frame --------------------------------
  update(dt) {
    const g = this.game;
    this.panFromKeys(dt);

    while (g.events.length) {
      const e = g.events.shift();
      this.handleEvent(e);
      if (FORWARD_EVENTS[e.type]) Net.forwardEvent(e);
    }
    if (g.sellCount !== this.lastSellCount) {
      if (g.sellCount > this.lastSellCount) Sound.play('sell');
      this.lastSellCount = g.sellCount;
    }

    $('#money-val').textContent = '$' + fmt(g.money);
    $('#income').textContent = '+$' + fmt(g.incomeRate) + '/s';
    if (g.dirty) {
      g.dirty = false;
      this.refreshToolbar();
      this.renderPanel();
      this.renderGoal();
      if (this.input.selected) this.renderInspector();
      const pp = $('#patents');
      pp.classList.toggle('hidden', g.meta.patentsTotal === 0 && g.claimablePatents() === 0);
    }
    const now = performance.now();
    if (now - this.lastSlow > 250) {
      this.lastSlow = now;
      this.refreshToolbar();
      this.refreshAffordability();
      this.updateInspectorState();
      const claim = g.claimablePatents();
      $('#patents').innerHTML = `✦ ${fmt(g.meta.patents)}${claim ? ` <span class="good">(+${fmt(claim)})</span>` : ''}`;
      if (claim > 0) $('#patents').classList.remove('hidden');
      const ds = dayState();
      const hour = Math.floor(((ds.ph + 0.25) % 1) * 24);
      $('#clock').innerHTML = this.input.dayNight
        ? `<span class="${ds.night > 0.5 ? 'moon' : 'sun'}">${ds.night > 0.5 ? '☾' : '☀'}</span> ${String(hour).padStart(2, '0')}:00`
        : '';
      if (this.tab === 'stats' || this.tab === 'patents') {
        if (!document.querySelector('#panel .body:hover')) this.renderPanel();
      }
    }
    if (now - this.lastMini > 300) {
      this.lastMini = now;
      this.drawMinimap();
    }
  }
}
