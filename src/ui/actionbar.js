// Main action bar (12 slots + end caps), XP bar, micro menu.
import { h, setText, setCls, setSrc, show, setFill, setStyle, fmtCD, fmtInt, replay } from './util.js';
import { iconURL } from './icons.js';
import { endCap, glyphURL } from './art.js';

export const KEYBINDS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0', '-', '='];
const KEYCODES = ['Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5', 'Digit6', 'Digit7', 'Digit8', 'Digit9', 'Digit0', 'Minus', 'Equal'];

class ActionSlot {
  constructor(bar, parent, i) {
    this.bar = bar; this.ui = bar.ui; this.i = i;
    const el = this.el = h('div', 'evd-slot evd-abslot ptr empty', parent);
    this.img = h('img', 'ic', el);
    this.tint = h('div', 'tint', el);
    this.cd = h('div', 'evd-cd', el);
    this.gcd = h('div', 'evd-cd gcd', el);
    this.cdt = h('div', 'evd-cdtxt', el);
    this.kb = h('span', 'kb', el, KEYBINDS[i]);
    this.cnt = h('span', 'cnt', el);
    this.proc = h('div', 'proc', el); h('i', 'ants', this.proc);
    this.flash = h('div', 'flash', el);
    el._tip = () => this.d && (this.d.spell ? { type: 'spell', spell: this.d.spell, icon: this.d.icon } : this.d.name ? { type: 'text', title: this.d.name } : null);
    el.addEventListener('pointerdown', e => { if (e.button === 0) { this.press(); this.ui.emit('action', i); } });
    this.d = null; this.cdEnd = 0; this.cdDur = 0; this.gEnd = 0; this.fA = 0; this.fB = 0; this._txt = '';
  }
  /** d: null | { icon, name?, spell?, keybind?, cd?: {remaining,duration}, usable?, noResource?, outOfRange?, proc?, active?, count? } */
  set(d) {
    this.d = d;
    setCls(this.el, 'empty', !d);
    if (!d) { this._cd(null); return; }
    setSrc(this.img, iconURL(d.icon, 64));
    if (d.keybind != null) setText(this.kb, d.keybind);
    setCls(this.el, 'nomana', !!d.noResource);
    setCls(this.el, 'unusable', d.usable === false && !d.noResource);
    setCls(this.el, 'oor', !!d.outOfRange);
    setCls(this.el, 'active', !!d.active);
    setText(this.cnt, d.count != null && d.count !== '' ? d.count : '');
    const p = !!d.proc;
    if (p !== this._p) { this._p = p; setCls(this.el, 'proc', p); if (p) replay(this.proc, 'burst'); }
    this._cd(d.cd);
    if (d.gcd) this.gcdStart(d.gcd.remaining, d.gcd.duration);
  }
  _cd(cd) {
    if (cd && cd.remaining > 0) {
      const end = this.ui.now + cd.remaining;
      if (Math.abs(end - this.cdEnd) > 0.1) {
        this.cdEnd = end; this.cdDur = cd.duration;
        const s = this.cd.style;
        s.animationName = (this.fA ^= 1) ? 'evd-sweepA' : 'evd-sweepB';
        s.animationDuration = cd.duration + 's';
        s.animationDelay = -(cd.duration - cd.remaining) + 's';
        setCls(this.cd, 'on', true);
        this.bar._active.add(this);
      }
    } else if (this.cdEnd) this._cdEnd();
  }
  _cdEnd() {
    this.cdEnd = 0; setCls(this.cd, 'on', false); setText(this.cdt, ''); this._txt = '';
    if (this.d) replay(this.el, 'ready');
  }
  gcdStart(rem, dur) {
    const end = this.ui.now + rem;
    if (Math.abs(end - this.gEnd) < 0.08) return;
    if (this.cdEnd && this.cdEnd > end) return; // longer real cooldown already showing
    this.gEnd = end;
    const s = this.gcd.style;
    s.animationName = (this.fB ^= 1) ? 'evd-sweepA' : 'evd-sweepB';
    s.animationDuration = dur + 's'; s.animationDelay = -(dur - rem) + 's';
    setCls(this.gcd, 'on', true);
    this.bar._active.add(this);
  }
  press() { replay(this.flash, 'on'); replay(this.el, 'pressed'); }
  tick(now) {
    let busy = false;
    if (this.cdEnd) {
      const r = this.cdEnd - now;
      if (r <= 0) this._cdEnd();
      else {
        busy = true;
        const t = this.cdDur >= 2 ? fmtCD(r) : '';
        if (t !== this._txt) { this._txt = t; setText(this.cdt, t); setCls(this.cdt, 'soon', r < 3); }
      }
    }
    if (this.gEnd) { if (now >= this.gEnd) { this.gEnd = 0; setCls(this.gcd, 'on', false); } else busy = true; }
    return busy;
  }
}

export class ActionBar {
  constructor(ui, parent) {
    this.ui = ui;
    const el = this.el = h('div', 'evd-ab', parent);
    this.capL = h('img', 'cap l', el); this.capL.src = endCap('left');
    this.capR = h('img', 'cap r', el); this.capR.src = endCap('right');
    this.plate = h('div', 'plate', el);
    this.xp = new XPBar(ui, this.plate);
    const row = h('div', 'slots', this.plate);
    this.slots = KEYBINDS.map((_, i) => new ActionSlot(this, row, i));
    this._active = new Set();
    ui._tick.push(this);
    ui._keyHooks.push(e => {
      const i = KEYCODES.indexOf(e.code);
      if (i < 0 || e.repeat || e.altKey || e.ctrlKey || e.metaKey) return false;
      this.slots[i].press();
      if (ui.opts.actionKeys) ui.emit('action', i);
      return false;
    });
  }
  /** Set one slot (0..11). */
  setSlot(i, d) { this.slots[i].set(d); }
  /** Set all 12 slots from an array (missing → empty). */
  set(list) { for (let i = 0; i < 12; i++) this.slots[i].set(list[i] || null); }
  /** Visual press feedback for slot i (call when the game fires the action from a key). */
  press(i) { this.slots[i].press(); }
  /** Start a global cooldown sweep on every non-empty slot. */
  gcd(duration, remaining = duration) { for (const s of this.slots) if (s.d && !s.d.offGCD) s.gcdStart(remaining, duration); }
  tick(now) { for (const s of this._active) if (!s.tick(now)) this._active.delete(s); }
}

// ------------------------------------------------------------------------------------ XP bar
export class XPBar {
  constructor(ui, parent) {
    this.ui = ui;
    const el = this.el = h('div', 'evd-xp ptr', parent);
    this.rest = h('i', 'rest', el);
    this.fill = h('i', 'fill', el);
    this.ticks = h('i', 'ticks', el);
    this.mark = h('i', 'mark', el);
    this.txt = h('span', 'txt', el);
    el._tip = () => this.d && { type: 'text', title: `Level ${this.d.level ?? ''}`, lines: [`XP: ${fmtInt(this.d.xp)} / ${fmtInt(this.d.xpMax)} (${Math.floor(this.d.xp / this.d.xpMax * 100)}%)`, this.d.rested ? { text: `Rested: ${fmtInt(this.d.rested)} XP (200% from kills)`, color: '#6fb3ff' } : { text: 'You feel normal.', color: '#aaa' }] };
    this.d = null;
  }
  /** d: { xp, xpMax, rested? (bonus xp amount), level? , max?: bool (hide at max level) } */
  set(d) {
    this.d = d;
    show(this.el, !d.max);
    const f = d.xpMax ? d.xp / d.xpMax : 0;
    setFill(this.fill, f);
    const r = d.rested ? Math.min(1, (d.xp + d.rested) / d.xpMax) : 0;
    setFill(this.rest, r);
    setCls(this.el, 'rested', !!d.rested);
    setStyle(this.mark, 'transform', `translateX(${(r || f) * 100}%)`);
    show(this.mark, !!d.rested);
    setText(this.txt, `XP ${fmtInt(d.xp)} / ${fmtInt(d.xpMax)}` + (d.rested ? `  (+${fmtInt(d.rested)} rested)` : ''));
  }
}

// ------------------------------------------------------------------------------------ micro menu
export const MICRO = [
  { id: 'character', icon: 'helm', key: 'C', label: 'Character Info' },
  { id: 'bags', icon: 'bag', key: 'B', label: 'Bags' },
  { id: 'spellbook', icon: 'prayer', key: 'P', label: 'Spellbook & Abilities' },
  { id: 'quests', icon: 'letter', key: 'L', label: 'Quest Log' },
  { id: 'map', icon: 'map', key: 'M', label: 'World Map' },
  { id: 'meter', icon: 'dragonScale', key: 'N', label: 'Damage Meter' },
  { id: 'help', icon: 'unknownHelp', key: 'H', label: 'Help & Keybinds' },
  { id: 'settings', icon: 'gear', key: 'Esc', label: 'Game Menu / Settings' },
];
export class MicroMenu {
  constructor(ui, parent) {
    this.ui = ui;
    this.el = h('div', 'evd-micro', parent);
    this.btn = {};
    for (const m of MICRO) {
      const b = h('button', 'mb', this.el);
      const img = h('img', '', b); img.src = m.icon === 'gear' ? glyphURL('gear') : iconURL(m.icon, 64);
      b._tip = () => ({ type: 'text', title: m.label, lines: [{ text: `Hotkey: ${m.key}`, color: '#ffd100' }] });
      b.addEventListener('click', () => ui.emit('micro', m.id));
      this.btn[m.id] = b;
    }
    this.bagSlots = h('div', 'bags', this.el);
    this.money = h('div', 'evd-money', this.el);
  }
  setActive(id, on) { if (this.btn[id]) setCls(this.btn[id], 'on', on); }
}
