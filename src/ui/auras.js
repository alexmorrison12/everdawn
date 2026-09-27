// Aura icons (buffs/debuffs) with countdown text, stacks, dispel-type borders and expiry blink.
// AuraRow reconciles a list of auras by id every call and only touches changed icons.
import { h, setText, setCls, setVariant, setSrc, show, fmtCD, fmtAura } from './util.js';
import { iconURL } from './icons.js';

/**
 * Aura data: { id, icon, name?, desc?, remaining?, duration?, stacks?, type?: 'magic'|'curse'|'disease'|'poison'|'bleed',
 *              debuff?: bool, mine?: bool, rarity? }   remaining/duration in seconds (omit for permanent)
 */
export class AuraIcon {
  constructor(ui, parent, cls = '') {
    this.ui = ui;
    this.el = h('div', 'evd-aura ptr ' + cls, parent);
    this.img = h('img', 'ic', this.el);
    this.cd = h('div', 'evd-cd aura', this.el);
    this.stk = h('span', 'stk', this.el);
    this.tm = h('span', 'tm', this.el);
    this.el._tip = () => this.a && { type: 'aura', aura: this.a, remaining: this.end ? Math.max(0, this.end - this.ui.now) : null };
    this.el.addEventListener('contextmenu', e => { e.preventDefault(); if (this.a && !this.a.debuff) this.ui.emit('cancelAura', this.a.id); });
    this.a = null; this.end = 0; this.anim = 0;
  }
  set(a, forceDebuff, style) {
    this.a = a;
    const deb = forceDebuff || a.debuff;
    setSrc(this.img, iconURL(a.icon, 64));
    setVariant(this.el, 'dt-', deb ? (a.type || 'none') : null);
    setCls(this.el, 'debuff', deb);
    setCls(this.el, 'mine', a.mine);
    setText(this.stk, a.stacks > 1 ? a.stacks : '');
    if (a.remaining != null && a.duration) {
      const end = this.ui.now + a.remaining;
      if (Math.abs(end - this.end) > 0.12 || (!this.cd._on && style !== 'bar')) {
        this.end = end;
        if (style === 'bar') return;
        const cd = this.cd;
        cd._on = true; cd.classList.add('on');
        cd.style.animationName = (this.anim ^= 1) ? 'evd-sweepA' : 'evd-sweepB';
        cd.style.animationDuration = a.duration + 's';
        cd.style.animationDelay = -(a.duration - a.remaining) + 's';
      }
    } else if (this.cd._on) { this.cd._on = false; this.cd.classList.remove('on'); this.end = 0; setText(this.tm, ''); }
  }
  tick(now, style) {
    if (!this.end) return;
    const r = this.end - now;
    if (style === 'bar') setText(this.tm, r > 0 ? fmtAura(r) : '');
    else setText(this.tm, r > 0 && r < 60 ? fmtCD(r) : r >= 60 ? fmtCD(r) : '');
    setCls(this.el, 'expiring', r > 0 && r < 8 && style === 'bar');
  }
}

export class AuraRow {
  /** style: 'bar' (player buff bar: time below) | 'frame' (target/party: time inside, sweep) */
  constructor(ui, parent, cls, style = 'frame', max = 16, debuff = false) {
    this.ui = ui; this.style = style; this.max = max; this.debuff = debuff;
    this.el = h('div', 'evd-aurarow ' + cls, parent);
    this.icons = [];
    this.n = 0;
  }
  update(list) {
    list = list || [];
    const n = Math.min(list.length, this.max);
    for (let i = 0; i < n; i++) {
      let ic = this.icons[i];
      if (!ic) ic = this.icons[i] = new AuraIcon(this.ui, this.el);
      show(ic.el, true);
      ic.set(list[i], this.debuff, this.style);
    }
    for (let i = n; i < this.icons.length; i++) { show(this.icons[i].el, false); this.icons[i].a = null; this.icons[i].end = 0; }
    this.n = n;
  }
  tick(now) { for (let i = 0; i < this.n; i++) this.icons[i].tick(now, this.style); }
}

/** Player buff/debuff bar (top-right, left of the minimap). */
export class BuffBar {
  constructor(ui, parent) {
    this.ui = ui;
    this.el = h('div', 'evd-buffbar', parent);
    this.buffs = new AuraRow(ui, this.el, 'buffs', 'bar', 24);
    this.debuffs = new AuraRow(ui, this.el, 'debuffs', 'bar', 16, true);
    ui._tick.push(this);
  }
  /** set(buffs[], debuffs[]) — or set(list) where each aura has .debuff */
  set(buffs, debuffs) {
    if (!debuffs && buffs) { debuffs = buffs.filter(a => a.debuff); buffs = buffs.filter(a => !a.debuff); }
    this.buffs.update(buffs);
    this.debuffs.update(debuffs);
  }
  tick(now) { this.buffs.tick(now); this.debuffs.tick(now); }
}
