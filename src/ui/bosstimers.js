// DBM-style boss timer bars (drain animation on the compositor) + big countdown for imminent timers,
// and the Details!-style damage / healing meter.
import { h, setText, setCls, setFill, setSrc, setStyle, show, fmtClock, fmtShort, classColor } from './util.js';
import { iconURL } from './icons.js';

const KIND = { default: '#e8a21a', important: '#e0301a', add: '#e87a1a', aoe: '#a040e0', target: '#2a7ae0', interrupt: '#1a50c0', phase: '#3ab04a', move: '#e8d01a' };

export class BossTimers {
  constructor(ui, parent) {
    this.ui = ui;
    this.el = h('div', 'evd-bt', parent);
    this.huge = h('div', 'evd-bt huge', parent);
    this.bars = new Map();
    this.enlargeAt = 6;
    ui._tick.push(this);
  }
  /**
   * Start / refresh a timer. t: { id, name, duration, remaining = duration, icon?, kind?: default|important|add|aoe|target|interrupt|phase|move,
   *   color?, countdown?: n (big "n..1" numbers at the end), onEnd? }
   */
  start(t) {
    let b = this.bars.get(t.id);
    const rem = t.remaining ?? t.duration;
    if (!b) {
      b = { el: h('div', 'bt'), f: 0 };
      b.ic = h('img', 'ic', b.el);
      const bar = h('div', 'bb', b.el);
      b.fill = h('i', 'fill', bar);
      b.nm = h('span', 'nm', bar); b.tm = h('span', 'tm', bar);
      this.bars.set(t.id, b);
    }
    b.t = t; b.end = this.ui.now + rem; b.dur = t.duration; b.big = false; b.lastCount = null;
    b.el.classList.remove('big', 'done');
    this.el.appendChild(b.el);
    setText(b.nm, t.name);
    if (t.icon) setSrc(b.ic, iconURL(t.icon, 64)); show(b.ic, !!t.icon);
    setStyle(b.el, '--bc', t.color || KIND[t.kind] || KIND.default);
    this._anim(b);
    this._sort();
  }
  _anim(b) {
    const rem = Math.max(0, b.end - this.ui.now);
    const s = b.fill.style;
    s.animationName = (b.f ^= 1) ? 'evd-drainA' : 'evd-drainB';
    s.animationDuration = b.dur + 's';
    s.animationDelay = -(b.dur - rem) + 's';
  }
  _sort() {
    const list = [...this.bars.values()].filter(b => !b.big).sort((a, b) => a.end - b.end);
    list.forEach((b, i) => { if (this.el.children[i] !== b.el) this.el.insertBefore(b.el, this.el.children[i] || null); });
  }
  cancel(id) { const b = this.bars.get(id); if (b) { b.el.remove(); this.bars.delete(id); } }
  clear() { for (const id of [...this.bars.keys()]) this.cancel(id); }
  tick(now) {
    for (const [id, b] of this.bars) {
      const r = b.end - now;
      if (r <= 0) {
        if (!b.doneAt) { b.doneAt = now; b.el.classList.add('done'); setText(b.tm, ''); if (b.t.onEnd) b.t.onEnd(); }
        if (now - b.doneAt > 0.6) { b.el.remove(); this.bars.delete(id); }
        continue;
      }
      b.doneAt = 0;
      setText(b.tm, r < 10 ? r.toFixed(1) : fmtClock(Math.ceil(r)));
      if (!b.big && r <= this.enlargeAt) { b.big = true; this.huge.appendChild(b.el); b.el.classList.add('big'); this._anim(b); }
      if (b.t.countdown && r <= b.t.countdown + 0.05) {
        const n = Math.ceil(r - 0.05);
        if (n >= 1 && n !== b.lastCount) { b.lastCount = n; this.ui.alerts.countdown(n); }
      }
    }
  }
}

// ------------------------------------------------------------------------------------ damage meter
export class Meter {
  constructor(ui, parent) {
    this.ui = ui;
    const el = this.el = h('div', 'evd-meter ptr', parent);
    const hd = h('div', 'hd', el);
    this.title = h('span', 'tt', hd, 'Damage Done');
    this.seg = h('span', 'seg', hd);
    this.tabs = {};
    for (const [m, label] of [['damage', 'DMG'], ['healing', 'HEAL']]) {
      const b = this.tabs[m] = h('button', 'mt', hd, label);
      b.addEventListener('click', () => { this.mode = m; this._render(); ui.emit('meterMode', m); });
    }
    this.rowsEl = h('div', 'rows', el);
    this.rows = [];
    for (let i = 0; i < 10; i++) {
      const r = { el: h('div', 'row', this.rowsEl) };
      r.fill = h('i', 'fill', r.el);
      r.ic = h('img', 'ci', r.el);
      r.nm = h('span', 'nm', r.el);
      r.val = h('span', 'val', r.el);
      show(r.el, false);
      this.rows.push(r);
    }
    this.foot = h('div', 'ft', el);
    this.mode = 'damage';
    this.data = { damage: [], healing: [] };
    this._sorted = [];
    this.visibleRows = 8;
    this._dirty = true; this._last = -1;
    ui._tick.push(this);
  }
  /**
   * d: { damage?: [row], healing?: [row], duration? (s), segment? }   row: { name, cls, total, perSecond?, isPlayer? }
   * Rows are sorted here; pass the same arrays every frame if you like (only changed text is written).
   */
  set(d) {
    if (d.damage) this.data.damage = d.damage;
    if (d.healing) this.data.healing = d.healing;
    if (d.duration != null) this.duration = d.duration;
    if (d.segment) this.segment = d.segment;
    this._dirty = true;
  }
  setMode(m) { this.mode = m; this._render(); }
  /** Re-renders at most 4×/s (like Details!), so calling set() every frame is cheap. */
  tick(now) { if (this._dirty && now - this._last >= 0.25) { this._dirty = false; this._last = now; this._render(); } }
  _render() {
    for (const m in this.tabs) setCls(this.tabs[m], 'on', m === this.mode);
    setText(this.title, this.mode === 'damage' ? 'Damage Done' : 'Healing Done');
    setText(this.seg, `${this.segment || 'Current'}${this.duration ? ' · ' + fmtClock(this.duration) : ''}`);
    const src = this.data[this.mode] || [];
    const S = this._sorted; S.length = 0;
    for (const r of src) S.push(r);
    S.sort((a, b) => b.total - a.total);
    let tot = 0; for (const r of S) tot += r.total;
    const top = S[0] ? S[0].total : 1;
    const n = Math.min(this.visibleRows, S.length);
    let list = S.slice(0, n);
    const pi = S.findIndex(r => r.isPlayer);
    if (pi >= n && n > 0) list[n - 1] = S[pi];
    for (let i = 0; i < this.rows.length; i++) {
      const R = this.rows[i], r = list[i];
      show(R.el, !!r);
      if (!r) continue;
      const rank = S.indexOf(r) + 1;
      setFill(R.fill, r.total / (top || 1));
      setStyle(R.el, '--cc', classColor(r.cls));
      if (R._cls !== r.cls) { R._cls = r.cls; setSrc(R.ic, iconURL('class' + (r.cls || 'warrior')[0].toUpperCase() + (r.cls || 'warrior').slice(1), 32)); }
      setText(R.nm, `${rank}. ${r.name}`);
      const ps = r.perSecond ?? (this.duration ? r.total / this.duration : 0);
      setText(R.val, `${fmtShort(r.total)} (${fmtShort(ps)}, ${tot ? (r.total / tot * 100).toFixed(1) : 0}%)`);
      setCls(R.el, 'me', !!r.isPlayer);
    }
    const allPS = this.duration ? tot / this.duration : 0;
    setText(this.foot, S.length ? `Raid ${this.mode === 'damage' ? 'DPS' : 'HPS'}: ${fmtShort(allPS)} · Total ${fmtShort(tot)}` : 'No data — go hit something.');
  }
}
