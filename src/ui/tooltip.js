// Tooltip system: item, unit, spell, aura and free-text tooltips. One DOM node, rebuilt on show.
import { h, rarityColor, splitMoney, classColor, CLASS_NAMES, REACTION, fmtInt, conColor, setFill } from './util.js';
import { iconURL } from './icons.js';
import * as N from './adapt.js';

const GOLD = '#ffd100', GREEN = '#1eff00', RED = '#ff2020', GREY = '#9d9d9d', WHITE = '#ffffff';

/** Money element builder (gold/silver/copper with coin icons). */
export function moneyEl(copper, parent) {
  const m = splitMoney(copper), el = h('span', 'evd-money', parent);
  if (m.g) h('i', 'g', el, m.g);
  if (m.g || m.s) h('i', 's', el, m.s);
  h('i', 'c', el, m.c);
  return el;
}

export class Tooltip {
  constructor(ui, parent) {
    this.ui = ui;
    this.el = h('div', 'evd-tip', parent);
    this.ic = h('img', 'tic', this.el);
    this.body = h('div', 'tb', this.el);
    this.visible = false;
    this.el.style.display = 'none';
    this.anchor = null;
  }
  hide() { if (this.visible) { this.visible = false; this.el.style.display = 'none'; this.anchor = null; } }

  /** Show tooltip data anchored to a DOM element (e.g. a slot). */
  showFor(anchorEl, data) { this.anchor = anchorEl; this._build(data); this._placeEl(anchorEl); }
  /** Show at screen coordinates (CSS px), e.g. under the mouse for world objects. */
  showAt(x, y, data) { this.anchor = null; this._build(data); this._placeXY(x, y); }
  /** Show at the default world-tooltip anchor (bottom-right, like the classic GameTooltip). */
  show(data) { this.anchor = null; this._build(data); this._placeDefault(); }

  showItem(item, at) { this._route({ type: 'item', item }, at); }
  showUnit(unit, at) { this._route({ type: 'unit', unit }, at); }
  showSpell(spell, at) { this._route({ type: 'spell', spell }, at); }
  showText(title, lines, at) { this._route({ type: 'text', title, lines }, at); }
  _route(d, at) { if (!at) this.show(d); else if (at.nodeType) this.showFor(at, d); else this.showAt(at.x, at.y, d); }

  // ------------------------------------------------------------------ builders
  _build(d) {
    const b = this.body; b.textContent = '';
    this.el.className = 'evd-tip';
    let icon = null;
    if (d.type === 'item') icon = this._item(d.item, d);
    else if (d.type === 'unit') this._unit(d.unit);
    else if (d.type === 'spell') icon = this._spell(d.spell, d.icon);
    else if (d.type === 'aura') icon = this._aura(d.aura, d.remaining);
    else this._text(d);
    if (icon) { this.ic.src = iconURL(icon, 64); this.ic.style.display = ''; } else this.ic.style.display = 'none';
    this.el.style.display = ''; this.visible = true;
  }
  _line(text, color = WHITE, cls = '') { const l = h('div', 'tl ' + cls, this.body, text); if (color) l.style.color = color; return l; }
  _pair(left, right, cl = WHITE, cr = WHITE) {
    const l = h('div', 'tl pair', this.body);
    const a = h('span', '', l, left); a.style.color = cl;
    const r = h('span', '', l, right); r.style.color = cr;
    return l;
  }
  _text(d) {
    if (d.title) this._line(d.title, d.color || WHITE, 'title');
    for (const ln of d.lines || []) {
      if (typeof ln === 'string') this._line(ln, GOLD, 'wrap');
      else if (ln.right != null) this._pair(ln.text, ln.right, ln.color || WHITE, ln.rightColor || WHITE);
      else this._line(ln.text, ln.color || GOLD, ln.wrap === false ? '' : 'wrap');
    }
  }
  /**
   * item: { name, icon, rarity, bind?, unique?, questItem?, slot?, type?, armor?, damage?: {min,max,speed}, dps?,
   *   stats?: [{stat, value}] | {Strength: 5}, durability?: [cur,max], classes?, reqLevel?, itemLevel?,
   *   equip?: [string], use?: string|[string], chance?: [string], flavor?, sell? (copper), setName?, count? }
   * opts: { playerLevel?, compare? }
   */
  _item(it, o = {}) {
    const q = rarityColor(it.rarity);
    this.el.classList.add('item');
    this._line(it.name, q, 'title');
    if (it.itemLevel) this._line(`Item Level ${it.itemLevel}`, GOLD);
    if (it.questItem) this._line('Quest Item');
    if (it.bind) this._line(it.bind === 'pickup' ? 'Binds when picked up' : it.bind === 'equip' ? 'Binds when equipped' : it.bind === 'use' ? 'Binds when used' : it.bind);
    if (it.unique) this._line('Unique');
    if (it.slot || it.type) this._pair(it.slot || '', it.type || '');
    if (it.damage) {
      this._pair(`${it.damage.min} - ${it.damage.max} Damage`, `Speed ${Number(it.damage.speed).toFixed(2)}`);
      const dps = it.dps ?? (it.damage.min + it.damage.max) / 2 / it.damage.speed;
      this._line(`(${dps.toFixed(1)} damage per second)`);
    }
    if (it.armor) this._line(`${it.armor} Armor`);
    const stats = Array.isArray(it.stats) ? it.stats : it.stats ? Object.entries(it.stats).map(([stat, value]) => ({ stat, value })) : [];
    for (const s of stats) this._line(`${s.value >= 0 ? '+' : ''}${s.value} ${s.stat}`, s.value >= 0 ? WHITE : RED);
    if (it.durability) this._line(`Durability ${it.durability[0]} / ${it.durability[1]}`);
    if (it.classes) this._line(`Classes: ${[].concat(it.classes).map(c => CLASS_NAMES[c] || c).join(', ')}`);
    if (it.reqLevel) this._line(`Requires Level ${it.reqLevel}`, o.playerLevel != null && o.playerLevel < it.reqLevel ? RED : WHITE);
    for (const e of [].concat(it.equip || [])) this._line(`Equip: ${e}`, GREEN, 'wrap');
    for (const u of [].concat(it.use || [])) this._line(`Use: ${u}`, GREEN, 'wrap');
    for (const c of [].concat(it.chance || [])) this._line(`Chance on hit: ${c}`, GREEN, 'wrap');
    if (it.setName) { this._line(''); this._line(it.setName, GOLD); }
    if (it.flavor) this._line(`"${it.flavor}"`, GOLD, 'wrap flavor');
    if (it.sell) { const l = this._line('Sell Price: ', WHITE, 'sell'); moneyEl(it.sell * (it.count || 1), l); }
    return it.icon;
  }
  /**
   * unit: { name, level, cls?, race?, isPlayer?, reaction, guild?, classification?, creatureType?, hp?, hpMax?, dead?,
   *         target?: string, pvp?, playerLevel?, status?: string, title? }
   */
  _unit(u) {
    const rc = REACTION[N.reaction(u)] || REACTION.hostile, pl = N.isPlayer(u), cl = N.classification(u);
    const nameColor = pl && u.cls ? classColor(u.cls) : rc.text;
    this._line(u.title ? `${u.name} ${u.title}` : u.name, nameColor, 'title');
    if (u.guild) this._line(`<${u.guild}>`, WHITE);
    const boss = u.level === '??' || u.level < 0 || cl === 'boss';
    const lv = h('div', 'tl', this.body);
    const pl2 = u.playerLevel ?? (this.ui.me && this.ui.me !== u ? this.ui.me.level : null);
    const lspan = h('span', '', lv, `Level ${boss ? '??' : u.level}`); lspan.style.color = pl2 != null ? conColor(boss ? -1 : u.level, pl2) : WHITE;
    const race = u.race ? u.race[0].toUpperCase() + u.race.slice(1) : '';
    const rest = pl ? ` ${race} ${CLASS_NAMES[u.cls] || ''} (Player)` : ` ${u.creatureType || ''}${cl === 'elite' ? ' (Elite)' : cl === 'rare' ? ' (Rare)' : cl === 'rareelite' ? ' (Rare Elite)' : boss ? ' (Boss)' : ''}`;
    h('span', '', lv, rest).style.color = WHITE;
    if (u.pvp) this._line('PvP', WHITE);
    if (u.status) this._line(u.status, GREY);
    if (u.dead) this._line('Corpse', GREY);
    if (u.target) this._line(`Target: ${u.target}`, GOLD);
    if (u.hpMax) {
      const bar = h('div', 'evd-bar hp tbar', this.body); h('i', 'lag', bar); const f = h('i', 'fill', bar);
      setFill(f, u.dead ? 0 : u.hp / u.hpMax);
      h('span', 'txt', bar, `${fmtInt(u.dead ? 0 : u.hp)} / ${fmtInt(u.hpMax)}`);
    }
  }
  /** spell: { name, icon, rank?, cost?, range?, castTime?, cooldown?, desc, reqLevel?, school? } */
  _spell(s, icon) {
    const top = this._pair(s.name, s.rank ? `Rank ${s.rank}` : '', WHITE, GREY); top.classList.add('title');
    if (s.cost || s.range) this._pair(s.cost || '', s.range || '');
    if (s.castTime || s.cooldown) this._pair(s.castTime || '', s.cooldown || '');
    if (s.desc) this._line(s.desc, GOLD, 'wrap');
    if (s.reqLevel) this._line(`Requires Level ${s.reqLevel}`, RED);
    if (s.note) this._line(s.note, GREEN, 'wrap');
    return s.icon || icon;
  }
  _aura(a, remaining) {
    this._line(a.name || a.icon, a.debuff ? (a.type ? ({ magic: '#3399ff', curse: '#9933ff', disease: '#996600', poison: '#009900' })[a.type] || RED : RED) : WHITE, 'title');
    if (a.desc) this._line(a.desc, GOLD, 'wrap');
    if (remaining != null) this._line(remaining >= 60 ? `${Math.ceil(remaining / 60)} min remaining` : `${Math.ceil(remaining)} sec remaining`, GOLD);
    return a.icon;
  }

  // ------------------------------------------------------------------ placement (virtual px inside the scaled layer)
  _vw() { return innerWidth / this.ui.scale; }
  _vh() { return innerHeight / this.ui.scale; }
  _placeEl(el) {
    const s = this.ui.scale, r = el.getBoundingClientRect();
    const ax = r.left / s, ay = r.top / s, aw = r.width / s, ah = r.height / s;
    const tw = this.el.offsetWidth, th = this.el.offsetHeight, vw = this._vw(), vh = this._vh();
    let x = ax + aw + 8, y = ay - th - 6;
    if (y < 6) y = ay + ah + 6;
    if (ay + ah > vh * 0.66) { y = ay - th - 8; x = ax + aw * 0.5 - tw * 0.3; } // bottom widgets: above
    else y = Math.max(6, ay);
    if (x + tw > vw - 6) x = ax - tw - 8;
    if (x < 6) x = 6;
    if (y + th > vh - 6) y = vh - 6 - th;
    this._set(x, y);
  }
  _placeXY(sx, sy) {
    const s = this.ui.scale, tw = this.el.offsetWidth, th = this.el.offsetHeight, vw = this._vw(), vh = this._vh();
    let x = sx / s + 18, y = sy / s + 18;
    if (x + tw > vw - 6) x = sx / s - tw - 12;
    if (y + th > vh - 6) y = sy / s - th - 12;
    this._set(Math.max(6, x), Math.max(6, y));
  }
  _placeDefault() {
    const tw = this.el.offsetWidth, th = this.el.offsetHeight, vw = this._vw(), vh = this._vh();
    const a = this.ui.layout.tooltip;
    this._set(vw - a.right - tw, vh - a.bottom - th);
  }
  _set(x, y) { this.el.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px)`; }
}
