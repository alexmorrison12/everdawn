// Toggleable windows: Character (C), Bags (B), World Map (M), Help (H), Settings.
import { h, setText, setCls, setSrc, show, rarityName, classColor, CLASS_NAMES, replay } from './util.js';
import { iconURL } from './icons.js';
import { questMarkURL, markerURL } from './art.js';
import { moneyEl } from './tooltip.js';

export class Window {
  constructor(ui, parent, id, cls, title) {
    this.ui = ui; this.id = id;
    const el = this.el = h('div', 'evd-win-' + id + ' evd-panel ' + cls, parent);
    if (title != null) this.titleEl = h('div', 'evd-title', el, title);
    const x = h('button', 'evd-close', el); x.addEventListener('click', () => this.close());
    show(el, false); this.isOpen = false;
  }
  open() { if (this.isOpen) return; this.isOpen = true; show(this.el, true); replay(this.el, 'in'); this.onOpen && this.onOpen(); this.ui._panelOpened(this, this.id); }
  close() { if (!this.isOpen) return; this.isOpen = false; show(this.el, false); this.ui.tooltip.hide(); this.ui._panelClosed(this, this.id); }
  toggle() { this.isOpen ? this.close() : this.open(); }
}

/** Drag an icon: a ghost follows the pointer; onDrop(clientX, clientY, elementsUnderneath) when you let go. */
export function dragIcon(e, icon, onDrop) {
  const ghost = h('img', 'evd-dragghost', document.body); ghost.src = iconURL(icon, 64);
  const move = ev => { ghost.style.transform = `translate(${ev.clientX - 22}px, ${ev.clientY - 22}px)`; };
  move(e);
  const up = ev => {
    removeEventListener('pointermove', move, true); removeEventListener('pointerup', up, true);
    ghost.remove();
    onDrop(ev.clientX, ev.clientY, document.elementsFromPoint(ev.clientX, ev.clientY));
  };
  addEventListener('pointermove', move, true); addEventListener('pointerup', up, true);
}

export function itemSlot(parent, cls = '') {
  const s = h('div', 'evd-slot ptr ' + cls, parent);
  s.img = h('img', 'ic', s);
  s.cnt = h('span', 'cnt', s);
  return s;
}
export function fillSlot(s, e, placeholder) {
  const it = e && (e.item || e);
  s._item = it || null;
  s.className = s.className.replace(/\bq-\w+/g, '').trim();
  if (it) {
    s.classList.add('q-' + rarityName(it.rarity)); s.classList.remove('empty', 'ph');
    setSrc(s.img, iconURL(it.icon, 64, it.rarity && (rarityName(it.rarity) === 'epic' || rarityName(it.rarity) === 'legendary') ? { rarity: it.rarity } : undefined));
    setText(s.cnt, e.count > 1 ? e.count : '');
  } else if (placeholder) { s.classList.add('ph'); s.classList.remove('empty'); setSrc(s.img, iconURL(placeholder, 64)); setText(s.cnt, ''); }
  else { s.classList.add('empty'); setText(s.cnt, ''); }
}

// ------------------------------------------------------------------------------------ character
const LEFT = [['head', 'helm', 'Head'], ['neck', 'trinket', 'Neck'], ['shoulder', 'shoulders', 'Shoulder'], ['back', 'cloak', 'Back'], ['chest', 'chest', 'Chest'], ['shirt', 'robe', 'Shirt'], ['tabard', 'robe', 'Tabard'], ['wrist', 'gloves', 'Wrist']];
const RIGHT = [['hands', 'gloves', 'Hands'], ['waist', 'belt', 'Waist'], ['legs', 'legs', 'Legs'], ['feet', 'boots', 'Feet'], ['finger1', 'ring', 'Finger'], ['finger2', 'ring', 'Finger'], ['trinket1', 'trinket', 'Trinket'], ['trinket2', 'trinket', 'Trinket']];
const BOTTOM = [['mainhand', 'sword', 'Main Hand'], ['offhand', 'shield', 'Off Hand'], ['ranged', 'bow', 'Ranged']];

export class CharacterPanel extends Window {
  constructor(ui, parent) {
    super(ui, parent, 'character', 'heavy', 'Character');
    const el = this.el;
    this.sub = h('div', 'csub', el);
    const doll = h('div', 'doll', el);
    const colL = h('div', 'col l', doll), mid = h('div', 'mid', doll), colR = h('div', 'col r', doll);
    /** The game renders the character model into this canvas (transparent background). */
    this.modelCanvas = h('canvas', 'model', mid); this.modelCanvas.width = this.modelCanvas.height = 512; // square: matches Portraits.draw(unit, canvas, { full: true })
    this.slots = {};
    const mk = (parent, [id, ph, label]) => {
      const s = itemSlot(parent); s.ph = ph; s.label = label; s.classList.add('empty');
      s._tip = () => s._item ? { type: 'item', item: s._item, playerLevel: this.level } : { type: 'text', title: label };
      s.addEventListener('contextmenu', e => { e.preventDefault(); if (s._item) ui.emit('unequip', id, s._item); });
      this.slots[id] = s;
    };
    LEFT.forEach(d => mk(colL, d)); RIGHT.forEach(d => mk(colR, d));
    const bot = h('div', 'bot', el); BOTTOM.forEach(d => mk(bot, d));
    this.stats = h('div', 'stats', el);
  }
  onOpen() { if (!this._filled) { this._filled = true; for (const id in this.slots) if (!this.slots[id]._item) fillSlot(this.slots[id], null, this.slots[id].ph); } }
  /** Screen-space rect (CSS px) of the model area, for games that render the model into the main canvas. */
  modelRect() { return this.modelCanvas.getBoundingClientRect(); }
  /**
   * d: { name, level, race, cls, guild?, slots: { head: item, … }, statGroups: [{ title, stats: [{ label, value, color?, tip? }] }] }
   */
  set(d) {
    this.level = d.level;
    if (this.titleEl) setText(this.titleEl, d.name || 'Character');
    this.sub.textContent = '';
    this.sub.append(`Level ${d.level} ${d.race || ''} `);
    const c = h('span', '', this.sub, CLASS_NAMES[d.cls] || d.cls || ''); c.style.color = classColor(d.cls);
    if (d.guild) h('div', 'cg', this.sub, `<${d.guild}>`);
    this._filled = true;
    for (const id in this.slots) fillSlot(this.slots[id], d.slots && d.slots[id], this.slots[id].ph);
    this.stats.textContent = '';
    for (const g of d.statGroups || []) {
      const box = h('div', 'sg', this.stats);
      h('div', 'sgt', box, g.title);
      for (const s of g.stats) {
        const r = h('div', 'sr ptr', box);
        h('span', 'sl', r, s.label);
        const v = h('span', 'sv', r, s.value); if (s.color) v.style.color = s.color;
        if (s.tip) r._tip = () => ({ type: 'text', title: s.label + ' ' + s.value, lines: [s.tip] });
      }
    }
  }
}

// ------------------------------------------------------------------------------------ bags
export class Bags extends Window {
  constructor(ui, parent) {
    super(ui, parent, 'bags', 'thin', 'Backpack');
    this.grid = h('div', 'bgrid', this.el);
    this.foot = h('div', 'bfoot', this.el);
    this.free = h('span', 'bfree', this.foot);
    this.money = h('span', '', this.foot);
    this.marks = h('span', 'bmarks', this.el); this.marks._tip = () => ({ type: 'text', title: 'Ember Marks', lines: ['Earned by killing the dragon of the Ember Maw. Spend them with the Quartermaster in Dawnhollow.'] });
    this.cells = [];
  }
  dropped(i, els) {
    const j = this.cells.findIndex(c => els.includes(c));
    if (j >= 0) { if (j !== i) this.ui.emit('bagMove', i, j); return; }
    if (els.some(n => n.closest?.('.evd-win-merchant'))) { this.ui.emit('bagSell', i); return; }
    if (els.some(n => n.closest?.('.evd-win-character'))) { this.ui.emit('useItem', i, this.cells[i]._item); return; }
    const bar = els.find(n => n.classList?.contains('evd-abslot'));
    if (bar) { const j = this.ui.actionBar.slots.findIndex(s => s.el === bar); if (j >= 0 && j < 10) this.ui.emit('barItem', j, i); return; } // usable items go on the bar
    const top = els[0];
    if (top && top.tagName === 'CANVAS' && !top.closest('.evd')) this.ui.emit('bagDestroy', i); // let go over the world
  }
  /** d: { slots: [ { item, count } | null ], money (copper), title? } */
  set(d) {
    if (d.title && this.titleEl) setText(this.titleEl, d.title);
    const n = d.slots.length;
    while (this.cells.length < n) {
      const i = this.cells.length, s = itemSlot(this.grid);
      s._tip = () => s._item && { type: 'item', item: s._item };
      s.addEventListener('contextmenu', e => { e.preventDefault(); if (s._item) this.ui.emit('useItem', i, s._item); });
      s.addEventListener('click', e => { if (s._item && e.shiftKey) this.ui.emit('linkItem', s._item); });
      // drag: onto another slot to move it, onto a merchant to sell, onto your character to wear it, into the world to destroy it
      s.addEventListener('pointerdown', e => {
        if (e.button !== 0 || e.shiftKey || !s._item || e.pointerType === 'touch') return;
        const x0 = e.clientX, y0 = e.clientY;
        const mv = ev => { if (Math.hypot(ev.clientX - x0, ev.clientY - y0) < 6) return; off(); dragIcon(ev, s._item.icon, (x, y, els) => this.dropped(i, els)); };
        const off = () => { removeEventListener('pointermove', mv, true); removeEventListener('pointerup', off, true); };
        addEventListener('pointermove', mv, true); addEventListener('pointerup', off, true);
      });
      this.cells.push(s);
    }
    let used = 0;
    for (let i = 0; i < this.cells.length; i++) { show(this.cells[i], i < n); if (i < n) { fillSlot(this.cells[i], d.slots[i]); if (d.slots[i]) used++; } }
    setText(this.free, `${n - used} free`);
    this.money.textContent = ''; moneyEl(d.money || 0, this.money);
    this.marks.textContent = ''; show(this.marks, !!d.marks);
    if (d.marks) { h('img', '', this.marks).src = iconURL('emberMark', 32); this.marks.append(`${d.marks} Ember Marks`); }
  }
}

// ------------------------------------------------------------------------------------ world map
export class WorldMap extends Window {
  constructor(ui, parent) {
    super(ui, parent, 'map', 'heavy', 'Everdawn Vale');
    const frame = h('div', 'mframe', this.el);
    /** The game draws the map into this canvas (1024×704). */
    this.canvas = h('canvas', 'mcv', frame); this.canvas.width = 1024; this.canvas.height = 704;
    this.overlay = h('div', 'mov', frame);
    this.labels = h('div', 'mlabels', this.overlay);
    this.markers = h('div', 'mmarks', this.overlay);
    this.player = h('div', 'mplayer', this.overlay); h('i', '', this.player);
    this.coords = h('div', 'mcoords', this.el);
    frame.addEventListener('pointermove', e => { const r = frame.getBoundingClientRect(); setText(this.coords, `Cursor: ${((e.clientX - r.left) / r.width * 100).toFixed(1)}, ${((e.clientY - r.top) / r.height * 100).toFixed(1)}`); });
    frame.addEventListener('pointerleave', () => setText(this.coords, this._pc || ''));
    frame.addEventListener('click', e => { const r = frame.getBoundingClientRect(); ui.emit(e.altKey || e.ctrlKey || e.metaKey ? 'mapMark' : 'mapClick', (e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height); });
    frame.addEventListener('pointerdown', e => { if (e.button !== 1) return; e.preventDefault(); const r = frame.getBoundingClientRect(); ui.emit('mapMark', (e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height); }); // middle-click: waypoint
    frame.classList.add('ptr');
  }
  /** labels: [{ name, x, y (0..1), levels?: '1-3', kind?: 'zone'|'town'|'poi'|'danger' }] */
  setLabels(list) {
    this.labels.textContent = '';
    for (const l of list) {
      const e = h('div', 'ml ' + (l.kind || 'zone'), this.labels);
      e.style.left = l.x * 100 + '%'; e.style.top = l.y * 100 + '%';
      h('div', 'mn', e, l.name);
      if (l.levels) h('div', 'mlv', e, `(${l.levels})`);
    }
  }
  /** Player arrow position (0..1) and facing (radians, 0 = north/up, positive = counter-clockwise like the game). */
  setPlayer(x, y, facing = 0) {
    this.player.style.left = x * 100 + '%'; this.player.style.top = y * 100 + '%';
    this.player.style.transform = `translate(-50%,-50%) rotate(${-facing}rad)`;
    this._pc = `Player: ${(x * 100).toFixed(1)}, ${(y * 100).toFixed(1)}`; setText(this.coords, this._pc);
  }
  /** markers: [{ x, y, type: 'available'|'complete'|'incomplete'|'party'|'boss'|'skull'…, label? }] */
  setMarkers(list) {
    this.markers.textContent = '';
    for (const m of list) {
      const e = h('div', 'mm ' + m.type, this.markers);
      e.style.left = m.x * 100 + '%'; e.style.top = m.y * 100 + '%';
      if (m.type === 'area') { e.style.width = m.w * 100 + '%'; e.style.height = m.h * 100 + '%'; }
      if (['available', 'complete', 'incomplete', 'daily'].includes(m.type)) h('img', 'q', e).src = questMarkURL(m.type);
      else if (m.type === 'boss') h('img', 'b', e).src = markerURL('skull');
      else if (m.type === 'party') { const d = h('i', 'dot', e); if (m.cls) d.style.background = classColor(m.cls); }
      else if (m.type === 'wp') h('i', '', e).style.setProperty('--c', m.color || '#ffd35a');
      if (m.label) { e.classList.add('ptr'); e._tip = () => ({ type: 'text', title: m.label, lines: m.lines || [] }); }
    }
  }
}

// ------------------------------------------------------------------------------------ help / keybinds
export const DEFAULT_BINDINGS = [
  { title: 'Movement', rows: [['W,A,S,D', 'Move / turn'], ['Q,E', 'Strafe'], ['Space', 'Jump'], ['Left-drag', 'Orbit camera'], ['Right-drag', 'Steer'], ['Both buttons', 'Run forward'], ['\\,Num Lock', 'Autorun'], ['Num /', 'Walk / run'], ['Wheel', 'Zoom']] },
  { title: 'Combat', rows: [['Tab', 'Target nearest enemy'], ['1,–,=', 'Action bar'], ['Right-click', 'Attack / interact'], ['Esc', 'Clear target / close'], ['F', 'Target of target']] },
  { title: 'Interface', rows: [['C', 'Character'], ['B', 'Bags'], ['P', 'Spellbook'], ['L', 'Quest log'], ['K', 'Professions'], ['O', 'Social / group'], ['M', 'World map'], ['N', 'Damage meter'], ['Middle-click', 'Waypoint for your group'], ['H', 'This help'], ['Enter', 'Chat']] },
  { title: 'Chat', rows: [['/s,/y,/p', 'Say · Yell · Party'], ['/w Name', 'Whisper'], ['/r', 'Reply'], ['/invite', 'Invite to group'], ['/leave', 'Leave group'], ['/duel', 'Duel your target'], ['/1,/2,/4', 'General · Trade · LFG'], ['/logout', 'Log out']] },
];
export class HelpOverlay extends Window {
  constructor(ui, parent) {
    super(ui, parent, 'help', 'stone', 'Keybindings & Help');
    this.body = h('div', 'hbody', this.el);
    this.tip = h('div', 'htip', this.el, 'Every other player on Lastlight is a SimPlayer. The leaderboard is real. Press H to close.');
    this.setBindings(DEFAULT_BINDINGS);
  }
  /** groups: [{ title, rows: [[keys, description]] }] — keys: comma-separated keycaps ('W,A,S,D') or an array */
  setBindings(groups) {
    this.body.textContent = '';
    for (const g of groups) {
      const c = h('div', 'hcol', this.body);
      h('div', 'hh', c, g.title);
      for (const [k, d] of g.rows) { const r = h('div', 'hr', c); const kk = h('span', 'hk', r); for (const part of Array.isArray(k) ? k : k.split(',')) h('kbd', '', kk, part.trim()); h('span', 'hd', r, d); }
    }
  }
}

// ------------------------------------------------------------------------------------ settings
export const DEFAULT_SETTINGS = { master: 80, music: 60, sfx: 80, ambience: 70, voice: 70, quality: 'high', sensitivity: 50, invertY: false, mouseLock: true, autoLoot: true, showFPS: false, uiScale: 100, chatFade: true };
export class Settings extends Window {
  constructor(ui, parent) {
    super(ui, parent, 'settings', '', 'Game Menu');
    this.v = { ...DEFAULT_SETTINGS };
    const b = h('div', 'sbody', this.el);
    const sec = (t) => { const s = h('div', 'ssec', b); h('div', 'sst', s, t); return s; };
    this.actions = h('div', 'sgame', b); // Log Out, Leave World… (setActions)
    this.inputs = {};
    const slider = (s, key, label, min = 0, max = 100, fmt = v => v + '%') => {
      const r = h('label', 'srow', s); h('span', 'sl', r, label);
      const i = h('input', 'evd-range', r); i.type = 'range'; i.min = min; i.max = max; i.value = this.v[key];
      const o = h('span', 'sv', r, fmt(this.v[key]));
      const upd = () => { this.v[key] = +i.value; o.textContent = fmt(+i.value); i.style.setProperty('--p', ((i.value - min) / (max - min) * 100) + '%'); };
      i.addEventListener('input', () => { upd(); this._emit(); });
      this.inputs[key] = { set: v => { i.value = v; upd(); } };
      upd();
    };
    const check = (s, key, label) => {
      const r = h('label', 'srow chk', s); const i = h('input', 'evd-check', r); i.type = 'checkbox'; i.checked = this.v[key]; h('span', 'sl', r, label);
      i.addEventListener('change', () => { this.v[key] = i.checked; this._emit(); });
      this.inputs[key] = { set: v => { i.checked = v; } };
    };
    const a = sec('Audio');
    slider(a, 'master', 'Master Volume'); slider(a, 'music', 'Music'); slider(a, 'sfx', 'Sound Effects'); slider(a, 'ambience', 'Ambience'); slider(a, 'voice', 'Voice & UI');
    const g = sec('Graphics');
    const seg = h('div', 'srow seg', g); h('span', 'sl', seg, 'Quality');
    const segs = h('div', 'segs', seg); this.qBtns = {};
    for (const q of ['low', 'medium', 'high', 'ultra']) { const bt = h('button', 'sb', segs, q[0].toUpperCase() + q.slice(1)); bt.addEventListener('click', () => { this.v.quality = q; this._segs(); this._emit(); }); this.qBtns[q] = bt; }
    this.inputs.quality = { set: () => this._segs() };
    check(g, 'showFPS', 'Show FPS counter');
    const c = sec('Controls');
    slider(c, 'sensitivity', 'Mouse Sensitivity', 1, 100, v => (v / 50).toFixed(2) + '×'); check(c, 'invertY', 'Invert mouse Y');
    check(c, 'mouseLock', 'Lock the cursor while turning with the mouse (turn all the way around)');
    const gp = sec('Gameplay');
    check(gp, 'autoLoot', 'Auto Loot: clicking a corpse takes everything (Shift-click to pick items)');
    const i = sec('Interface');
    slider(i, 'uiScale', 'UI Scale', 70, 130, v => v + '%'); check(i, 'chatFade', 'Fade idle chat');
    const btns = h('div', 'sbtns', this.el);
    const def = h('button', 'evd-btn dark', btns, 'Defaults'); def.addEventListener('click', () => { this.set(DEFAULT_SETTINGS); this._emit(); });
    const ok = h('button', 'evd-btn', btns, 'Okay'); ok.addEventListener('click', () => this.close());
    this._segs();
  }
  onOpen() { this.ui.emit('settingsOpen'); }
  /** Session buttons at the top of the Game Menu: [{ id, label, dark? }] → ui 'gameAction' (id). */
  setActions(list) {
    this.actions.textContent = '';
    for (const a of list) { const bt = h('button', 'evd-btn' + (a.dark ? ' dark' : ''), this.actions, a.label); bt.addEventListener('click', () => this.ui.emit('gameAction', a.id)); }
    show(this.actions, list.length > 0);
  }
  _segs() { for (const q in this.qBtns) setCls(this.qBtns[q], 'on', this.v.quality === q); }
  _emit() { this.ui._applySettings(this.v); this.ui.emit('settings', { ...this.v }); }
  /** Set values (partial ok) without emitting. */
  set(v) { Object.assign(this.v, v); for (const k in v) if (this.inputs[k]) this.inputs[k].set(this.v[k]); this._segs(); this.ui._applySettings(this.v); }
  get() { return { ...this.v }; }
}
