// Raid frames: up to 20 (4 groups of 5) class-coloured cells with role icons, dead/ghost/offline states,
// dispel highlight, range fade, selection outline, aggro border, absorb shields, click-to-target.
import { h, setText, setCls, setVariant, setFill, setSrc, setStyle, show, classColor, fmtShort } from './util.js';
import { roleURL, glyphURL, markerURL } from './art.js';
import { AuraRow } from './auras.js';
import * as N from './adapt.js';

class Cell {
  constructor(ui, parent) {
    this.ui = ui;
    const el = this.el = h('div', 'evd-rc ptr', parent);
    this.bg = h('i', 'bg', el);
    this.fill = h('i', 'fill', el);
    this.absorb = h('i', 'abs', el);
    this.pw = h('i', 'pw', el); this.pwf = h('i', 'pwf', this.pw);
    this.role = h('img', 'role', el);
    this.lead = h('img', 'lead', el); this.lead.src = glyphURL('crown');
    this.mk = h('img', 'mk', el);
    this.nm = h('span', 'nm', el);
    this.st = h('span', 'st', el);
    this.auras = new AuraRow(ui, el, 'rdebuffs', 'frame', 2, true);
    el.addEventListener('click', () => this.u && ui.emit('target', this.u.id));
    el._tip = () => this.u && { type: 'unit', unit: { ...this.u, isPlayer: true, reaction: 'friendly' } };
    this.v = {};
  }
  set(u) {
    this.u = u;
    const v = this.v;
    if (u.cls !== v.cls) { v.cls = u.cls; setStyle(this.el, '--cc', classColor(u.cls)); }
    setText(this.nm, u.name.length > 10 ? u.name.slice(0, 10) : u.name);
    const dead = u.dead || u.ghost;
    setFill(this.fill, dead || u.offline ? 0 : u.hp / (u.hpMax || 1));
    setFill(this.absorb, u.absorb && !dead ? Math.min(1, (u.hp + u.absorb) / u.hpMax) : 0);
    const deficit = u.hpMax - u.hp;
    setText(this.st, u.offline ? 'Offline' : u.ghost ? 'Ghost' : u.dead ? 'Dead' : deficit > u.hpMax * 0.05 ? '-' + fmtShort(deficit) : '');
    const hasPw = u.powerType === 'mana' && u.powerMax;
    show(this.pw, !!hasPw);
    if (hasPw) setFill(this.pwf, u.power / u.powerMax);
    setCls(this.el, 'dead', dead); setCls(this.el, 'offline', !!u.offline);
    setCls(this.el, 'oor', u.inRange === false);
    setCls(this.el, 'sel', !!u.selected);
    setCls(this.el, 'aggro', !!u.aggro);
    setCls(this.el, 'low', !dead && u.hp / u.hpMax < 0.3);
    setVariant(this.el, 'dt-', u.debuff || null);
    const role = u.role ?? u.raidRole;
    if (role !== v.role) { v.role = role; show(this.role, !!role); if (role) setSrc(this.role, roleURL(role)); }
    show(this.lead, !!u.leader);
    if (u.marker !== v.mk) { v.mk = u.marker; show(this.mk, !!u.marker); if (u.marker) setSrc(this.mk, markerURL(u.marker)); }
    this.auras.update(u.auras && u.auras[0] && u.auras[0].def ? N.auras(u.auras, this._na || (this._na = []), null) : u.auras);
  }
}

export class RaidFrames {
  constructor(ui, parent) {
    this.ui = ui;
    const el = this.el = h('div', 'evd-raid', parent);
    const hd = h('div', 'hd', el);
    this.title = h('span', '', hd, 'Raid');
    this.count = h('span', 'cnt', hd);
    this.grid = h('div', 'grid', el);
    this.groups = [];
    this.cells = [];
    for (let g = 0; g < 4; g++) {
      const col = h('div', 'grp', this.grid);
      h('div', 'gh', col, 'Group ' + (g + 1));
      this.groups.push(col);
      for (let i = 0; i < 5; i++) { const c = new Cell(ui, col); show(c.el, false); this.cells.push(c); }
    }
    show(el, false);
    this.n = 0;
    ui._tick.push(this);
  }
  /**
   * members: ≤20 of { id, name, cls, role: tank|healer|dps, hp, hpMax, power?, powerMax?, powerType?, dead?, ghost?, offline?,
   *   inRange?, selected?, aggro?, debuff?: magic|curse|disease|poison, absorb?, leader?, marker?, group? (1..4), auras? }
   * Members are placed by .group (1-based) if given, else sequentially 5 per group.
   */
  set(members) {
    members = members || [];
    show(this.el, members.length > 0);
    const fill = [0, 0, 0, 0];
    const used = this._used || (this._used = new Array(20));
    used.fill(false);
    let seq = 0;
    for (const m of members) {
      let g = m.group ? m.group - 1 : Math.floor(seq / 5);
      seq++;
      if (g > 3 || fill[g] >= 5) continue;
      const idx = g * 5 + fill[g]++;
      used[idx] = true;
      const c = this.cells[idx];
      show(c.el, true); c.set(m);
    }
    for (let i = 0; i < 20; i++) if (!used[i]) { show(this.cells[i].el, false); this.cells[i].u = null; }
    for (let g = 0; g < 4; g++) show(this.groups[g], fill[g] > 0);
    setText(this.count, `${members.length}/${members.length > 10 ? 20 : 10}`);
    this.n = members.length;
  }
  tick(now) { if (this.n) for (const c of this.cells) if (c.u) c.auras.tick(now); }
}
