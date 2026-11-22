'use strict';
// ---------------------------------------------------------------------------
// DOM UI + mouse/keyboard input.
// ---------------------------------------------------------------------------

const $ = (sel) => document.querySelector(sel);
const el = (tag, cls, html) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html !== undefined) e.innerHTML = html;
  return e;
};
const itemImg = (id) => `<img class="ico" src="${iconURL('item', id)}" alt="">`;
const bldImg = (id) => `<img class="ico" src="${iconURL('bld', id)}" alt="">`;

class UI {
  constructor(app) {
    this.app = app;
    this.input = {
      tool: null,
      rot: 0,
      hover: null,
      selected: null,
      deleting: false,
    };
    this.tab = 'upgrades';
    this.keys = new Set();
    this.lastSlow = 0;
    this.buildToolbar();
    this.bindPanel();
    this.bindMouse();
    this.bindKeys();
    this.bindMenu();
  }

  get game() { return this.app.game; }
  get r() { return this.app.renderer; }

  // ------------------------------ toolbar ----------------------------------
  buildToolbar() {
    const bar = $('#toolbar');
    bar.innerHTML = '';
    this.toolBtns = {};
    BUILD_ORDER.forEach((id, i) => {
      const b = el('button', 'tool');
      b.dataset.tool = id;
      b.innerHTML = `<span class="key">${i + 1}</span>${bldImg(id)}<span class="tname">${BUILDINGS[id].name}</span><span class="tcost"></span>`;
      b.addEventListener('click', () => this.selectTool(this.input.tool === id ? null : id));
      b.addEventListener('mouseenter', () => this.showTip(b, `<b>${BUILDINGS[id].name}</b><br>${BUILDINGS[id].desc}`));
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
      b.classList.toggle('active', this.input.tool === id);
      const c = g.cost(id);
      b.classList.toggle('poor', unlocked && g.money < c);
      b.querySelector('.tcost').textContent = unlocked ? '$' + fmt(c) : 'locked';
    }
  }

  selectTool(id) {
    if (id && !this.game.buildingUnlocked(id)) {
      this.toast(`Research needed for ${BUILDINGS[id].name}`);
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
        this.tab = b.dataset.tab;
        document.querySelectorAll('#panel .tabs button').forEach((x) => x.classList.toggle('on', x === b));
        this.renderPanel();
      });
    });
    $('#panel-toggle').addEventListener('click', () => $('#panel').classList.toggle('collapsed'));
  }

  renderPanel() {
    const g = this.game;
    const body = $('#panel .body');
    body.innerHTML = '';
    if (this.tab === 'upgrades') {
      for (const id in UPGRADES) {
        const u = UPGRADES[id];
        const lvl = g.lvl(id);
        const maxed = lvl >= u.max;
        const card = el('button', 'card');
        card.dataset.cost = maxed ? '' : g.upgradeCost(id);
        card.innerHTML = `${bldImg(u.icon)}<div class="ctext"><div class="ctitle">${u.name} <span class="lvl">Lv ${lvl}</span></div>
          <div class="cdesc">${u.desc}</div></div><div class="cprice">${maxed ? 'MAX' : '$' + fmt(g.upgradeCost(id))}</div>`;
        card.disabled = maxed;
        card.addEventListener('click', () => { if (g.buyUpgrade(id)) this.sfxBuy(); });
        body.appendChild(card);
      }
    } else if (this.tab === 'research') {
      for (const id in RESEARCH) {
        const r = RESEARCH[id];
        const done = g.hasResearch(id);
        const avail = g.canResearch(id);
        const card = el('button', 'card' + (done ? ' done' : avail ? '' : ' blocked'));
        card.dataset.cost = done || !avail ? '' : r.cost;
        const req = !done && !avail ? `<div class="creq">Requires: ${r.req.map((q) => RESEARCH[q].name).join(', ')}</div>` : '';
        card.innerHTML = `<div class="ctext"><div class="ctitle">${r.name}</div><div class="cdesc">${r.desc}</div>${req}</div>
          <div class="cprice">${done ? '✔' : '$' + fmt(r.cost)}</div>`;
        card.disabled = done || !avail;
        card.addEventListener('click', () => {
          if (g.buyResearch(id)) { this.sfxBuy(); this.toast(`Researched: ${r.name}`); }
        });
        body.appendChild(card);
      }
    } else {
      const rows = [];
      rows.push(`<div class="stat"><span>Total earned</span><b>$${fmt(g.totalEarned)}</b></div>`);
      rows.push(`<div class="stat"><span>Play time</span><b>${fmtTime(g.stats.playTime)}</b></div>`);
      rows.push(`<div class="stat"><span>Buildings</span><b>${g.buildings.length}</b></div>`);
      rows.push('<h4>Sold</h4>');
      const sold = Object.entries(g.stats.sold).sort((a, b) => b[1] - a[1]);
      if (!sold.length) rows.push('<div class="muted">Nothing sold yet — connect a miner to the Market.</div>');
      for (const [id, n] of sold) rows.push(`<div class="stat">${itemImg(id)}<span>${ITEMS[id].name}</span><b>${fmt(n)}</b></div>`);
      rows.push('<h4>Item values</h4>');
      for (const id in ITEMS) rows.push(`<div class="stat">${itemImg(id)}<span>${ITEMS[id].name}</span><b>$${fmt(ITEMS[id].value * g.sellMult())}</b></div>`);
      body.innerHTML = rows.join('');
    }
  }

  refreshAffordability() {
    document.querySelectorAll('#panel .card').forEach((c) => {
      const cost = c.dataset.cost;
      c.classList.toggle('poor', cost !== '' && this.game.money < +cost);
    });
  }

  // ----------------------------- inspector ---------------------------------
  select(b) {
    this.input.selected = b;
    this.renderInspector();
  }

  renderInspector() {
    const box = $('#inspector');
    const b = this.input.selected;
    if (!b || !this.game.buildings.includes(b)) {
      box.classList.add('hidden');
      this.input.selected = null;
      return;
    }
    box.classList.remove('hidden');
    const d = BUILDINGS[b.type];
    let html = `<div class="ihead">${bldImg(b.type)}<div><div class="ctitle">${d.name}</div><div class="cdesc">${d.desc}</div></div>
      <button class="x" id="insp-close">✕</button></div><div class="istate"></div>`;
    if (CRAFTERS[b.type] && b.type !== 'smelter') {
      html += '<div class="recipes">';
      for (const id in RECIPES) {
        const r = RECIPES[id];
        if (r.b !== b.type) continue;
        const ok = this.game.recipeUnlocked(id);
        const ins = Object.entries(r.in).map(([k, n]) => `${n}${itemImg(k)}`).join(' + ');
        const outs = Object.entries(r.out).map(([k, n]) => `${n}${itemImg(k)}`).join(' ');
        html += `<button class="recipe${b.recipe === id ? ' on' : ''}" data-r="${id}" ${ok ? '' : 'disabled'}>
          <span>${ins} → ${outs}</span><small>${ok ? r.time + 's' : 'locked'}</small></button>`;
      }
      html += '</div>';
    }
    html += `<div class="iactions">${d.dir ? '<button id="insp-rot">Rotate (R)</button>' : ''}
      <button id="insp-del" class="danger">Remove (+$${fmt(b.paid)})</button></div>`;
    box.innerHTML = html;
    $('#insp-close').onclick = () => this.select(null);
    $('#insp-del').onclick = () => { this.game.remove(b.x, b.y); this.select(null); };
    const rot = $('#insp-rot');
    if (rot) rot.onclick = () => this.game.rotate(b);
    box.querySelectorAll('.recipe').forEach((btn) => {
      btn.onclick = () => { this.game.setRecipe(b, btn.dataset.r); this.renderInspector(); };
    });
    this.updateInspectorState();
  }

  updateInspectorState() {
    const b = this.input.selected;
    if (!b) return;
    const st = $('#inspector .istate');
    if (!st) return;
    let s = '';
    if (b.type === 'miner') {
      const ore = this.game.oreAt(b.x, b.y);
      s = `Mining ${itemImg(ore)} ${ITEMS[ore].name} · ${(this.game.minerRate()).toFixed(2)}/s`;
      if (b.out > 0) s += ' · <span class="warn">output blocked</span>';
    } else if (CRAFTERS[b.type]) {
      const r = RECIPES[b.recipe];
      if (r) {
        const rate = (this.game.craftMult() / r.time).toFixed(2);
        const inv = Object.keys(r.in).map((k) => `${itemImg(k)}${b.inv[k] || 0}/${r.in[k]}`).join(' ');
        s = `Recipe: ${ITEMS[k0(r.out)].name} · ${rate}/s<br>Input: ${inv} · ${Math.round(b.t * 100)}%`;
        if (b.outQ.length) s += ' · <span class="warn">output blocked</span>';
      } else s = 'Idle — feed it ore or stone.';
    } else if (b.type === 'belt' || b.type === 'splitter') {
      s = b.item ? `Carrying ${itemImg(b.item)} ${ITEMS[b.item].name}` : 'Empty';
      if (b.type === 'belt') s += ` · ${this.game.beltSpeed().toFixed(2)} tiles/s`;
    } else if (b.type === 'seller') {
      s = `Sell value ×${this.game.sellMult().toFixed(2)}`;
    }
    st.innerHTML = s;
  }

  // ------------------------------- input -----------------------------------
  bindMouse() {
    const cv = this.r.canvas;
    let down = null; // {button, sx, sy, camx, camy, moved, last}
    cv.addEventListener('contextmenu', (e) => e.preventDefault());

    const tileOf = (e) => {
      const p = this.r.screenToTile(e.clientX, e.clientY);
      return { x: Math.floor(p.x), y: Math.floor(p.y) };
    };

    cv.addEventListener('mousedown', (e) => {
      this.hideTip();
      const t = tileOf(e);
      down = { button: e.button, sx: e.clientX, sy: e.clientY, camx: this.r.cam.x, camy: this.r.cam.y, moved: false, last: t, placed: new Set() };
      const panMode = e.button === 1 || (e.button === 0 && this.keys.has(' '));
      down.pan = panMode;
      if (panMode) return;
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
      this.updateStatus(t);
      if (!down) return;
      const dx = e.clientX - down.sx, dy = e.clientY - down.sy;
      if (Math.abs(dx) + Math.abs(dy) > 4) down.moved = true;
      const panning = down.pan || (down.button === 0 && !this.input.tool);
      if (panning) {
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
        const isBelt = this.input.tool === 'belt' || this.input.tool === 'splitter';
        this.walk(down.last, t, (q, prev, dir) => {
          if (isBelt) {
            // re-aim the belt we just laid so the line bends with the cursor
            const pb = this.game.at(prev.x, prev.y);
            if (pb && down.placed.has(pb) && pb.type === 'belt') pb.dir = dir;
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
        this.select(this.game.at(t.x, t.y));
      }
      down = null;
      this.input.deleting = false;
    });

    cv.addEventListener('wheel', (e) => {
      e.preventDefault();
      const before = this.r.screenToTile(e.clientX, e.clientY);
      const z = this.r.cam.zoom + (e.deltaY < 0 ? 1 : -1);
      this.r.cam.zoom = Math.max(1, Math.min(7, z));
      const after = this.r.screenToTile(e.clientX, e.clientY);
      this.r.cam.x += before.x - after.x;
      this.r.cam.y += before.y - after.y;
      this.r.clampCamera();
    }, { passive: false });
  }

  // Step tile-by-tile from a to b (x first, then y) calling fn(tile, prevTile, dir).
  walk(a, b, fn) {
    let cur = { x: a.x, y: a.y };
    let guard = 0;
    while ((cur.x !== b.x || cur.y !== b.y) && guard++ < 200) {
      let dir;
      if (cur.x !== b.x) dir = b.x > cur.x ? 0 : 2;
      else dir = b.y > cur.y ? 1 : 3;
      const next = { x: cur.x + DIRS[dir].x, y: cur.y + DIRS[dir].y };
      fn(next, cur, dir);
      cur = next;
    }
  }

  placeAt(t, dir, down) {
    const g = this.game;
    const tool = this.input.tool;
    const err = g.placeError(tool, t.x, t.y);
    if (err) {
      // silently skip occupied tiles while dragging; complain about the rest
      if (err !== 'Tile occupied' && !(down && down.placed.size && err === 'Miners need ore')) this.toast(err);
      return;
    }
    const b = g.place(tool, t.x, t.y, dir);
    if (b && down) down.placed.add(b);
  }

  deleteAt(t) {
    const b = this.game.at(t.x, t.y);
    if (!b) return;
    if (b === this.input.selected) this.select(null);
    this.game.remove(t.x, t.y);
  }

  bindKeys() {
    window.addEventListener('keydown', (e) => {
      if (e.target.tagName === 'INPUT') return;
      const k = e.key.toLowerCase();
      this.keys.add(k);
      if (k >= '1' && k <= '9') {
        const id = BUILD_ORDER[+k - 1];
        if (id) this.selectTool(this.input.tool === id ? null : id);
      } else if (k === 'r') {
        const sel = this.input.selected;
        if (!this.input.tool && sel) this.game.rotate(sel, e.shiftKey ? -1 : 1);
        else {
          // rotate the building under the cursor if no tool, else the ghost
          const h = this.input.hover;
          const under = h && this.game.at(h.x, h.y);
          if (!this.input.tool && under) this.game.rotate(under, e.shiftKey ? -1 : 1);
          else this.input.rot = (this.input.rot + (e.shiftKey ? 3 : 1)) % 4;
        }
      } else if (k === 'q' || k === 'escape') {
        if (this.input.tool) this.selectTool(null);
        else this.select(null);
        $('#modal').classList.add('hidden');
      } else if (k === '=' || k === '+') {
        this.r.cam.zoom = Math.min(7, this.r.cam.zoom + 1);
      } else if (k === '-') {
        this.r.cam.zoom = Math.max(1, this.r.cam.zoom - 1);
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
    const speed = 30 / this.r.cam.zoom;
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
    if (ore) s += ' · ' + ITEMS[ore].name;
    if (b) s += ' · ' + BUILDINGS[b.type].name;
    $('#status').textContent = s;
  }

  // ------------------------------- menu ------------------------------------
  bindMenu() {
    $('#btn-help').onclick = () => this.showHelp();
    $('#btn-save').onclick = () => { if (this.game.save()) this.toast('Game saved'); };
    $('#btn-reset').onclick = () => {
      this.modal(`<h2>Start over?</h2><p>This wipes your factory and money. There is no undo.</p>
        <div class="mbtns"><button id="m-cancel">Cancel</button><button id="m-ok" class="danger">Reset</button></div>`);
      $('#m-cancel').onclick = () => this.closeModal();
      $('#m-ok').onclick = () => { this.closeModal(); this.app.resetGame(); };
    };
  }

  showHelp() {
    this.modal(`<h2>Pixel Foundry</h2>
      <p>Mine ore, smelt it, craft parts, and sell everything at the <b>Market</b> for ever-growing profits.</p>
      <ul>
        <li><b>1–7</b> pick a building · <b>R</b> rotate (Shift+R back) · <b>Q</b>/<b>Esc</b> cancel</li>
        <li><b>Left click</b> build · <b>drag</b> to lay conveyor lines</li>
        <li><b>Right click / drag</b> remove (full refund)</li>
        <li><b>Click</b> a building with no tool selected to inspect it / pick a recipe</li>
        <li><b>WASD</b> / arrows / drag empty ground to pan · <b>wheel</b> to zoom</li>
      </ul>
      <p class="muted">Start: put a Miner on the grey iron patch, point it at a conveyor, and run the conveyor into the Market. Add a Smelter in the line to sell plates for 4× the price.</p>
      <p class="muted">Progress autosaves. While you're away your factory earns ${OFFLINE_EFFICIENCY * 100}% of its income (up to ${OFFLINE_CAP_SECONDS / 3600}h).</p>
      <div class="mbtns"><button id="m-ok">Let's build</button></div>`);
    $('#m-ok').onclick = () => this.closeModal();
  }

  modal(html) {
    const m = $('#modal');
    m.querySelector('.mbox').innerHTML = html;
    m.classList.remove('hidden');
  }
  closeModal() { $('#modal').classList.add('hidden'); }

  toast(msg) {
    const t = el('div', 'toast', msg);
    $('#toasts').appendChild(t);
    setTimeout(() => t.classList.add('out'), 1800);
    setTimeout(() => t.remove(), 2300);
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

  sfxBuy() { /* hook for future audio */ }

  // ------------------------------ per frame --------------------------------
  update(dt) {
    const g = this.game;
    this.panFromKeys(dt);
    $('#money').textContent = '$' + fmt(g.money);
    $('#income').textContent = '+$' + fmt(g.incomeRate) + '/s';
    if (g.dirty) {
      g.dirty = false;
      this.refreshToolbar();
      this.renderPanel();
      if (this.input.selected) this.renderInspector();
    }
    const now = performance.now();
    if (now - this.lastSlow > 250) {
      this.lastSlow = now;
      this.refreshToolbar();
      this.refreshAffordability();
      this.updateInspectorState();
      if (this.tab === 'stats') this.renderPanel();
    }
  }
}
