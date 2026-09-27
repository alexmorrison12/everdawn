// Nameplates: pooled, keyed by unit id. Game pushes screen x/y/scale/visibility every frame.
import { h, setText, setCls, setVariant, setFill, setSrc, setStyle, show, classColor, conColor, REACTION } from './util.js';
import { questMarkURL, markerURL, eliteGlyph, glyphURL } from './art.js';
import { iconURL } from './icons.js';
import * as N from './adapt.js';

class Plate {
  constructor(parent) {
    const el = this.el = h('div', 'evd-np');
    parent.appendChild(el);
    this.qm = h('img', 'qm', el);
    this.mk = h('img', 'mk', el);
    this.nm = h('div', 'nm', el);
    this.name = h('span', 'n', this.nm);
    this.guild = h('div', 'gd', el);
    const hb = this.hb = h('div', 'hb', el);
    this.lv = h('span', 'lv', hb);
    this.skull = h('img', 'sk', hb); this.skull.src = glyphURL('skull');
    const bar = h('div', 'bar', hb);
    this.fill = h('i', 'fill', bar);
    this.pct = h('span', 'pct', bar);
    this.elite = h('img', 'el', hb);
    const cb = this.cb = h('div', 'cb', el);
    this.ci = h('img', 'ci', cb);
    const cbar = h('div', 'bar', cb);
    this.cfill = h('i', 'fill', cbar);
    this.cname = h('span', 'cn', cbar);
    this.v = {};
    this.used = false;
  }
  set(d, S, me) {
    const v = this.v, el = this.el;
    const sc = (d.scale ?? 1) * Math.min(1.7, Math.max(0.95, S)) * 1.08;
    const tx = Math.round(d.x * 2) / 2, ty = Math.round(d.y * 2) / 2, ss = Math.round(sc * 100) / 100;
    if (tx !== v.x || ty !== v.y || ss !== v.s) { v.x = tx; v.y = ty; v.s = ss; el.style.transform = `translate3d(${tx}px,${ty}px,0) scale(${ss}) translate(-50%,-100%)`; }
    const z = d.target ? 30000 : 10000 - Math.round((d.depth ?? 0) * 10);
    if (z !== v.z) { v.z = z; el.style.zIndex = z; }
    if (d.id !== v.id) { v.id = d.id; v.name = v.guild = v.q = v.mk = v.cl = v.rc = undefined; }
    if (d.name !== v.name) { v.name = d.name; setText(this.name, d.name); }
    const pl = N.isPlayer(d), react = N.reaction(d);
    const rc = d.dead ? 'dead' : pl && react !== 'hostile' ? 'player' : react;
    if (rc !== v.rc || d.cls !== v.cls) {
      v.rc = rc; v.cls = d.cls;
      setVariant(el, 'r-', rc);
      const col = rc === 'dead' ? '#8a8a8a' : pl && d.cls ? classColor(d.cls) : (REACTION[rc] || REACTION.hostile).text;
      this.name.style.color = col;
      setStyle(el, '--hc', pl && d.cls && rc !== 'hostile' ? classColor(d.cls) : rc === 'friendly' ? '#1ec41e' : rc === 'neutral' ? '#e8c81a' : rc === 'tapped' ? '#8a8a8a' : '#d8201a');
    }
    const g = d.guild ? `<${d.guild}>` : '';
    if (g !== v.guild) { v.guild = g; setText(this.guild, g); show(this.guild, !!g); }
    const showHp = d.showHealth ?? ((rc === 'hostile' || rc === 'neutral') || (d.hpMax && d.hp < d.hpMax) || d.target);
    setCls(el, 'nohp', !showHp || d.dead);
    if (showHp) {
      setFill(this.fill, d.hpMax ? d.hp / d.hpMax : 0);
      const boss = d.level === '??' || d.level < 0 || N.classification(d) === 'boss';
      show(this.skull, boss); show(this.lv, !boss);
      if (!boss) { setText(this.lv, d.level ?? ''); setStyle(this.lv, 'color', conColor(d.level, d.playerLevel ?? me ?? d.level)); }
      setText(this.pct, d.target && d.hpMax ? Math.ceil(d.hp / d.hpMax * 100) + '%' : '');
    }
    const cl = N.classification(d);
    if (cl !== v.cl) { v.cl = cl; const e = cl === 'elite' || cl === 'rare' || cl === 'rareelite' || cl === 'boss'; show(this.elite, e); if (e) setSrc(this.elite, eliteGlyph(cl)); }
    setCls(el, 'tgt', !!d.target);
    setCls(el, 'dim', d.dim ?? false);
    const q = d.quest || null;
    if (q !== v.q) { v.q = q; show(this.qm, !!q); if (q) setSrc(this.qm, questMarkURL(q)); }
    const mk = d.marker || null;
    if (mk !== v.mk) { v.mk = mk; show(this.mk, !!mk); if (mk) setSrc(this.mk, markerURL(mk)); }
    const c = d.cast !== undefined ? d.cast : N.cast(d.casting);
    show(this.cb, !!c && showHp);
    if (c) {
      if (c.name !== v.cn) { v.cn = c.name; setText(this.cname, c.name); if (c.icon) setSrc(this.ci, iconURL(c.icon, 64)); show(this.ci, !!c.icon); }
      setCls(this.cb, 'noint', c.interruptible === false);
      const p = c.progress ?? (c.duration ? (c.elapsed || 0) / c.duration : 0);
      setFill(this.cfill, c.channel ? 1 - p : p);
    } else v.cn = null;
  }
}

export class Nameplates {
  constructor(ui, parent) {
    this.ui = ui;
    this.el = h('div', 'evd-nps', parent);
    this.map = new Map();
    this.free = [];
    this.frame = 0;
  }
  /** Begin a frame of updates. */
  begin() { this.frame++; }
  /**
   * Set/update one plate. d: { id, x, y (screen px, anchor = above the head), scale=1, visible=true, depth?, name, guild?, level,
   *   reaction, isPlayer?, cls?, hp, hpMax, showHealth?, target?, dim?, marker?, quest?: 'available'|'complete'|'incomplete'|'daily'|'low',
   *   classification?, cast?: { name, icon, progress | elapsed+duration, interruptible, channel }, dead?, playerLevel? }
   */
  set(d) {
    if (d.visible === false) return;
    let p = this.map.get(d.id);
    if (!p) { p = this.free.pop() || new Plate(this.el); this.map.set(d.id, p); show(p.el, true); }
    p.frame = this.frame;
    p.set(d, this.ui.scale, this.ui.me && this.ui.me.level);
  }
  /** End the frame: hides plates that were not set this frame. */
  end() {
    for (const [id, p] of this.map) if (p.frame !== this.frame) { show(p.el, false); this.map.delete(id); p.v = {}; this.free.push(p); }
  }
  /** Convenience: update(list) = begin + set each + end. */
  update(list) { this.begin(); for (const d of list) this.set(d); this.end(); }
  clear() { this.begin(); this.end(); }
}
