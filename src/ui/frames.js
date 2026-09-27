// Unit frames: player, target (+cast bar, auras, elite ornament), target-of-target, party (≤4).
import { h, setText, setCls, setVariant, setFill, setSrc, setStyle, show, fmtInt, fmtShort, conColor, classColor, REACTION, replay } from './util.js';
import { portraitRing, eliteOrnament, glyphURL, roleURL } from './art.js';
import { iconURL } from './icons.js';
import { AuraRow } from './auras.js';
import { CastBar } from './castbar.js';
import * as N from './adapt.js';

/** Shared bar helper: sets fill + delayed "lag" chunk when value drops. */
export class Bar {
  constructor(parent, cls, withText = true) {
    this.el = h('div', 'evd-bar ' + cls, parent);
    this.lag = h('i', 'lag', this.el);
    this.fill = h('i', 'fill', this.el);
    this.txt = withText ? h('span', 'txt', this.el) : null;
    this.f = -1;
  }
  set(frac) {
    frac = frac > 1 ? 1 : frac > 0 ? frac : 0;
    if (frac === this.f) return;
    const up = frac > this.f;
    setCls(this.el, 'up', up);
    this.f = frac;
    setFill(this.fill, frac);
    setFill(this.lag, frac);
  }
  kind(k) { if (this._k !== k) { if (this._k) this.el.classList.remove(this._k); this._k = k; if (k) this.el.classList.add(k); } }
  color(c) { setStyle(this.el, '--c', c); }
}

/** Draw an icon (or any image URL) into a portrait canvas as a fallback when the game doesn't render one. */
export function drawPortraitIcon(canvas, id) {
  const img = new Image();
  img.onload = () => { const x = canvas.getContext('2d'); x.clearRect(0, 0, canvas.width, canvas.height); x.drawImage(img, -canvas.width * 0.08, -canvas.height * 0.08, canvas.width * 1.16, canvas.height * 1.16); };
  img.src = id.startsWith('data:') ? id : iconURL(id, 128);
}

function powerKind(t) { return t === 'rage' ? 'rage' : t === 'energy' ? 'energy' : t === 'focus' ? 'focus' : 'mana'; }
function numText(cur, max) { return max >= 100000 ? `${fmtShort(cur)} / ${fmtShort(max)}` : `${fmtInt(cur)} / ${fmtInt(max)}`; }

// ------------------------------------------------------------------------------------ player frame
export class PlayerFrame {
  constructor(ui, parent, opts = {}) {
    this.ui = ui;
    const el = this.el = h('div', 'evd-uf evd-player ptr', parent);
    this.plate = h('div', 'plate', el);
    const nm = h('div', 'nm', this.plate);
    this.name = h('span', 'n', nm);
    this.status = h('span', 's', nm);
    this.hp = new Bar(this.plate, 'hp');
    this.pw = new Bar(this.plate, 'mana');
    this.glow = h('div', 'cglow', el);
    const pw = h('div', 'ptw', el);
    this.portrait = h('canvas', 'pt', pw); this.portrait.width = this.portrait.height = 128;
    h('img', 'ring', pw).src = portraitRing(88);
    this.lvl = h('div', 'lvl', pw);
    this.lvlT = h('span', '', this.lvl);
    this.combatI = h('img', 'cbt', this.lvl); this.combatI.src = glyphURL('combat');
    this.leader = h('img', 'lead', pw); this.leader.src = glyphURL('crown');
    this.rested = h('img', 'rest', pw); this.rested.src = glyphURL('rested');
    this.hit = h('div', 'hitflash', pw);
    el.addEventListener('click', () => ui.emit('target', opts.unitId || 'player'));
    this.v = {};
  }
  /** u: { name, level, hp, hpMax, power, powerMax, powerType, combat, rested, leader, dead, ghost, cls, portraitIcon } */
  set(u) {
    const v = this.v;
    setText(this.name, u.name);
    setText(this.lvlT, u.level);
    if (u.nameColor) setStyle(this.name, 'color', u.nameColor); // own name stays gold (WoW convention)
    const dead = u.dead || u.ghost;
    setText(this.status, u.ghost ? 'Ghost' : u.dead ? 'Dead' : '');
    this.hp.set(dead ? 0 : u.hp / (u.hpMax || 1));
    setText(this.hp.txt, dead ? '' : numText(u.hp, u.hpMax));
    const pk = powerKind(u.powerType);
    this.pw.kind(pk);
    this.pw.set(u.powerMax ? u.power / u.powerMax : 0);
    setText(this.pw.txt, u.powerMax ? numText(u.power, u.powerMax) : '');
    const combat = N.inCombat(u);
    setCls(this.el, 'combat', combat);
    setCls(this.el, 'dead', dead);
    setCls(this.el, 'resting', u.rested && !combat);
    show(this.leader, !!u.leader);
    if (u.hp < v.hp && !dead) replay(this.hit, 'on');
    v.hp = u.hp;
    if (u.portraitIcon && u.portraitIcon !== v.pi) { v.pi = u.portraitIcon; drawPortraitIcon(this.portrait, u.portraitIcon); }
  }
}

// ------------------------------------------------------------------------------------ target frame
export class TargetFrame {
  constructor(ui, parent) {
    this.ui = ui;
    const el = this.el = h('div', 'evd-uf evd-target ptr', parent);
    this.orn = h('img', 'orn', el);
    this.plate = h('div', 'plate', el);
    const nm = h('div', 'nm', this.plate);
    this.name = h('span', 'n', nm);
    this.hp = new Bar(this.plate, 'hp');
    this.hpl = h('span', 'l', this.hp.txt); this.hpr = h('span', 'r', this.hp.txt);
    this.pw = new Bar(this.plate, 'mana');
    const pw = h('div', 'ptw', el);
    this.portrait = h('canvas', 'pt', pw); this.portrait.width = this.portrait.height = 128;
    h('img', 'ring', pw).src = portraitRing(88);
    this.lvl = h('div', 'lvl', pw);
    this.lvlT = h('span', '', this.lvl);
    this.skull = h('img', 'skull', this.lvl); this.skull.src = glyphURL('skull');
    this.leader = h('img', 'lead', pw); this.leader.src = glyphURL('crown');
    this.hit = h('div', 'hitflash', pw);
    this.below = h('div', 'below', el);
    this.cast = new CastBar(ui, this.below, 'tcast');
    this.buffs = new AuraRow(ui, this.below, 'tbuffs', 'frame', 16);
    this.debuffs = new AuraRow(ui, this.below, 'tdebuffs', 'frame', 16, true);
    el.addEventListener('contextmenu', e => { e.preventDefault(); ui.emit('targetMenu', this.u && this.u.id); });
    this.u = null; this.v = {};
    show(el, false);
    ui._tick.push(this);
  }
  /**
   * u: null | { id, name, level ('??'|-1 = skull), reaction: hostile|neutral|friendly|player, classification: normal|elite|rare|rareelite|boss,
   *   hp, hpMax, power, powerMax, powerType, cls, isPlayer, dead, tapped, playerLevel, portraitIcon, leader,
   *   auras?: [aura], cast?: { name, icon, duration, elapsed, interruptible, channel } }
   */
  set(u) {
    this.u = u;
    show(this.el, !!u);
    if (!u) { this.cast.stop(true); return; }
    const v = this.v;
    if (u.id !== v.id) { v.id = u.id; replay(this.el, 'appear'); v.hp = u.hp; }
    setText(this.name, u.name);
    const cl = N.classification(u), boss = u.level === '??' || u.level < 0 || cl === 'boss';
    show(this.skull, boss); setText(this.lvlT, boss ? '' : u.level);
    setStyle(this.lvlT, 'color', conColor(u.level, u.playerLevel ?? (this.ui.me && this.ui.me.level) ?? u.level));
    const reaction = u.tapped === true || u.tapped === 'other' ? 'tapped' : N.reaction(u);
    setVariant(this.el, 'r-', reaction);
    setStyle(this.plate, '--band', N.isPlayer(u) && u.cls && reaction !== 'hostile' ? classColor(u.cls) : (REACTION[reaction] || { band: '#666' }).band);
    if (cl !== v.cl) {
      v.cl = cl;
      setVariant(this.el, 'c-', cl);
      if (cl !== 'normal' && cl !== 'minus') { const o = eliteOrnament(cl, 44); setSrc(this.orn, o.url); this.orn.style.cssText = `width:${o.w}px;height:${o.h}px;left:${this.ptCx - o.cx}px;top:${this.ptCy - o.cy}px`; show(this.orn, true); }
      else show(this.orn, false);
    }
    const dead = u.dead;
    this.hp.set(dead ? 0 : u.hp / (u.hpMax || 1));
    const pct = u.hpMax ? Math.ceil(u.hp / u.hpMax * 100) : 0;
    setText(this.hpr, dead ? 'Dead' : pct + '%');
    setText(this.hpl, dead ? '' : (u.hpMax >= 10000 ? fmtShort(u.hp) + ' / ' + fmtShort(u.hpMax) : fmtInt(u.hp) + ' / ' + fmtInt(u.hpMax)));
    const hasPow = u.powerMax > 0;
    setCls(this.el, 'nopow', !hasPow);
    if (hasPow) { this.pw.kind(powerKind(u.powerType)); this.pw.set(u.power / u.powerMax); setText(this.pw.txt, ''); }
    setCls(this.el, 'dead', dead);
    show(this.leader, !!u.leader);
    if (u.hp < v.hp) replay(this.hit, 'on');
    v.hp = u.hp;
    if (u.portraitIcon && u.portraitIcon !== v.pi) { v.pi = u.portraitIcon; drawPortraitIcon(this.portrait, u.portraitIcon); }
    if (u.auras) this.setAuras(u.auras[0] && u.auras[0].def ? N.auras(u.auras, this._na || (this._na = []), this.ui.me) : u.auras);
    if ('cast' in u) this.setCast(u.cast); else if ('casting' in u) this.setCast(N.cast(u.casting));
  }
  get ptCx() { return 270 - 44; }
  get ptCy() { return 44; }
  setAuras(list) {
    // buffs first row, debuffs second (mine first); allocation-free partition into cached arrays
    const b = this._b || (this._b = []), d = this._d || (this._d = []);
    b.length = 0; d.length = 0;
    for (const a of list) (a.debuff ? d : b).push(a);
    this.buffs.update(b); this.debuffs.update(d);
  }
  /** cast: null | { name, icon, duration, elapsed = 0, interruptible = true, channel = false } */
  setCast(c) { if (c) this.cast.start(c); else this.cast.stop(false); }
  tick(now) { if (this.u) { this.buffs.tick(now); this.debuffs.tick(now); } }
}

// ------------------------------------------------------------------------------------ target of target
export class ToTFrame {
  constructor(ui, parent) {
    this.ui = ui;
    const el = this.el = h('div', 'evd-tot ptr', parent);
    const pw = h('div', 'ptw', el);
    this.portrait = h('canvas', 'pt', pw); this.portrait.width = this.portrait.height = 64;
    h('img', 'ring', pw).src = portraitRing(40);
    this.plate = h('div', 'plate', el);
    this.name = h('div', 'n', this.plate);
    this.hp = new Bar(this.plate, 'hp', false);
    el.addEventListener('click', () => this.u && ui.emit('target', this.u.id));
    show(el, false); this.v = {};
  }
  /** u: null | { id, name, hp, hpMax, reaction, cls, isPlayer, portraitIcon } */
  set(u) {
    this.u = u; show(this.el, !!u); if (!u) return;
    setText(this.name, u.name);
    setStyle(this.name, 'color', N.isPlayer(u) && u.cls ? classColor(u.cls) : (REACTION[N.reaction(u)] || REACTION.hostile).text);
    this.hp.set(u.hp / (u.hpMax || 1));
    if (u.portraitIcon && u.portraitIcon !== this.v.pi) { this.v.pi = u.portraitIcon; drawPortraitIcon(this.portrait, u.portraitIcon); }
  }
}

// ------------------------------------------------------------------------------------ party frames
class PartyMember {
  constructor(ui, parent, i) {
    this.ui = ui;
    const el = this.el = h('div', 'evd-pm ptr', parent);
    this.plate = h('div', 'plate', el);
    const nm = h('div', 'nm', this.plate);
    this.name = h('span', 'n', nm);
    this.role = h('img', 'role', nm);
    this.hp = new Bar(this.plate, 'hp');
    this.pw = new Bar(this.plate, 'mana', false);
    const pw = h('div', 'ptw', el);
    this.portrait = h('canvas', 'pt', pw); this.portrait.width = this.portrait.height = 96;
    h('img', 'ring', pw).src = portraitRing(56);
    this.lvl = h('div', 'lvl', pw);
    this.leader = h('img', 'lead', pw); this.leader.src = glyphURL('crown');
    this.debuffs = new AuraRow(ui, el, 'pdebuffs', 'frame', 4, true);
    el.addEventListener('click', () => this.u && ui.emit('target', this.u.id));
    this.i = i; this.v = {};
  }
  set(u) {
    this.u = u;
    const v = this.v;
    setText(this.name, u.name);
    setStyle(this.name, 'color', classColor(u.cls));
    setText(this.lvl, u.level ?? '');
    const dead = u.dead || u.ghost;
    this.hp.set(dead || u.offline ? 0 : u.hp / (u.hpMax || 1));
    setText(this.hp.txt, u.offline ? 'Offline' : u.ghost ? 'Ghost' : u.dead ? 'Dead' : fmtShort(u.hp) + ' / ' + fmtShort(u.hpMax));
    this.pw.kind(powerKind(u.powerType)); this.pw.set(u.powerMax ? u.power / u.powerMax : 0);
    setCls(this.el, 'dead', dead); setCls(this.el, 'offline', u.offline);
    setCls(this.el, 'oor', u.inRange === false);
    setCls(this.el, 'sel', u.selected);
    setVariant(this.el, 'dt-', u.debuff || null);
    show(this.leader, !!u.leader);
    const role = u.role ?? u.raidRole;
    if (role !== v.role) { v.role = role; if (role) setSrc(this.role, roleURL(role)); show(this.role, !!role); }
    if (u.portraitIcon && u.portraitIcon !== v.pi) { v.pi = u.portraitIcon; drawPortraitIcon(this.portrait, u.portraitIcon); }
    this.debuffs.update(u.auras && u.auras[0] && u.auras[0].def ? N.auras(u.auras, this._na || (this._na = []), null, true) : u.auras);
  }
}
export class PartyFrames {
  constructor(ui, parent) {
    this.ui = ui;
    this.el = h('div', 'evd-party', parent);
    this.m = [0, 1, 2, 3].map(i => new PartyMember(ui, this.el, i));
    this.m.forEach(m => show(m.el, false));
    this.n = 0;
    ui._tick.push(this);
  }
  /** Portrait canvas of member i (0..3) for the game to draw into. */
  portrait(i) { return this.m[i].portrait; }
  /** list of ≤4 members: { id, name, level, cls, hp, hpMax, power, powerMax, powerType, leader, dead, ghost, offline, role, debuff, inRange, selected, auras, portraitIcon } */
  set(list) {
    list = list || [];
    this.n = Math.min(4, list.length);
    for (let i = 0; i < 4; i++) { show(this.m[i].el, i < this.n); if (i < this.n) this.m[i].set(list[i]); }
  }
  tick(now) { for (let i = 0; i < this.n; i++) this.m[i].debuffs.tick(now); }
}
