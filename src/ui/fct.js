// Floating combat text: pooled DOM nodes in the unscaled world layer, animated with transform/opacity only.
import { h, SCHOOL_COLORS, fmtInt } from './util.js';

const TYPES = {
  damage:   { color: '#ffffff', size: 24, life: 1.25, rise: 70 },
  spell:    { color: '#ffe060', size: 24, life: 1.3, rise: 70 },
  crit:     { color: '#ffffff', size: 40, life: 1.75, rise: 38, pop: true },
  heal:     { color: '#2eff3a', size: 22, life: 1.35, rise: 64 },
  healCrit: { color: '#2eff3a', size: 34, life: 1.75, rise: 38, pop: true },
  miss:     { color: '#e8e8e8', size: 20, life: 1.2, rise: 56 },
  incoming: { color: '#ff2a1a', size: 24, life: 1.3, rise: 80 },
  incomingCrit: { color: '#ff2a1a', size: 34, life: 1.6, rise: 60, pop: true },
  xp:       { color: '#b69cff', size: 20, life: 2.2, rise: 60 },
  rep:      { color: '#7ab8ff', size: 18, life: 2.2, rise: 60 },
  honor:    { color: '#ffb84a', size: 20, life: 2.2, rise: 60 },
  text:     { color: '#ffd100', size: 20, life: 1.8, rise: 50 },
  absorb:   { color: '#e0e0ff', size: 18, life: 1.2, rise: 50 },
};

export class FloatingText {
  constructor(ui, parent, poolSize = 90) {
    this.ui = ui;
    this.el = h('div', 'evd-fctl', parent);
    this.pool = [];
    this.live = [];
    this.anchors = new Map();
    for (let i = 0; i < poolSize; i++) { const e = h('div', 'evd-fct', this.el); e.style.display = 'none'; this.pool.push(e); }
    this.lane = new Map();
    ui._tick.push(this);
  }
  /** Update an anchor's screen position (CSS px) — call every frame for units with active text. */
  anchor(id, x, y, visible = true) {
    let a = this.anchors.get(id);
    if (!a) { a = { x, y, v: visible }; this.anchors.set(id, a); } else { a.x = x; a.y = y; a.v = visible; }
  }
  /**
   * Spawn a number/text.
   * e: { anchor?: id, x?, y? (screen px if no anchor), amount?, text?, type: damage|spell|crit|heal|healCrit|miss|incoming|incomingCrit|xp|rep|honor|text|absorb,
   *      school?: physical|fire|frost|arcane|holy|shadow|nature, crit?: bool, color? }
   */
  add(e) {
    let type = e.type || 'damage';
    if (e.crit) type = type === 'heal' ? 'healCrit' : type === 'incoming' ? 'incomingCrit' : type === 'damage' || type === 'spell' ? 'crit' : type;
    const T = TYPES[type] || TYPES.text;
    const el = this.pool.pop() || this._steal();
    let text = e.text;
    if (text == null) {
      const n = fmtInt(e.amount || 0);
      text = type === 'heal' || type === 'healCrit' ? '+' + n : type === 'incoming' || type === 'incomingCrit' ? '-' + n : n;
      if (T.pop && type !== 'healCrit') text += '!';
    }
    el.style.display = '';
    el.style.opacity = '0';
    el.textContent = text;
    let color = e.color || T.color;
    if (!e.color && e.school && e.school !== 'physical' && (type === 'damage' || type === 'spell' || type === 'crit')) color = SCHOOL_COLORS[e.school];
    if (!e.color && (type === 'crit') && (!e.school || e.school === 'physical')) color = '#ffffff';
    el.style.color = color;
    el.style.fontSize = T.size + 'px';
    el.className = 'evd-fct t-' + type + (T.pop ? ' pop' : '');
    // lanes so rapid numbers on the same anchor don't overlap
    const key = e.anchor || '_';
    const now = this.ui.now;
    let ln = this.lane.get(key);
    if (!ln || now - ln.t > 0.5) ln = { n: 0, t: now };
    ln.n++; ln.t = now; this.lane.set(key, ln);
    const lanes = [0, -1, 1, -0.5, 0.5, -1.5, 1.5];
    const incoming = type.startsWith('incoming');
    const spread = incoming ? 18 : 34;
    const ox = (e.anchor ? lanes[(ln.n - 1) % lanes.length] * spread : 0) + (Math.random() - 0.5) * 10 + (incoming ? -40 : 0);
    const oy = T.pop ? -8 : -((ln.n - 1) % 3) * 10;
    // fountain bump: young numbers on the same anchor are pushed up so nothing overlaps
    const push = T.size * 0.9 + 6;
    for (const o of this.live) if (o.a === (e.anchor || null) && now - o.t0 < o.T.life * 0.7) o.bumpT += push;
    this.live.push({ el, a: e.anchor || null, x: e.x ?? innerWidth / 2, y: e.y ?? innerHeight * 0.55, ox, oy, t0: now, T, drift: (Math.random() - 0.5) * 24, bumpT: 0, bumpV: 0 });
  }
  _steal() { const o = this.live.shift(); return o.el; }
  clear() { for (const o of this.live) { o.el.style.display = 'none'; this.pool.push(o.el); } this.live.length = 0; }
  tick(now, dt = 0.016) {
    const S = this.ui.scale, k = Math.min(1, dt * 12);
    const L = this.live;
    for (let i = L.length - 1; i >= 0; i--) {
      const o = L[i], T = o.T, t = (now - o.t0) / T.life;
      if (t >= 1) { o.el.style.display = 'none'; this.pool.push(o.el); L.splice(i, 1); continue; }
      let bx = o.x, by = o.y, vis = true;
      if (o.a) { const a = this.anchors.get(o.a); if (a) { bx = o.x = a.x; by = o.y = a.y; vis = a.v; } }
      let sc = 1, y = -T.rise * S * easeOut(t), x = o.drift * t * S;
      if (T.pop) { const p = Math.min(1, (now - o.t0) / 0.14); sc = p < 1 ? 1.9 - 0.9 * easeOut(p) : 1; y = -T.rise * S * easeOut(Math.max(0, t - 0.2) / 0.8); }
      o.bumpV += (o.bumpT - o.bumpV) * k; y -= o.bumpV * S;
      const a = !vis ? 0 : t < 0.08 ? t / 0.08 : t > 0.62 ? 1 - (t - 0.62) / 0.38 : 1;
      o.el.style.transform = `translate3d(${(bx + o.ox * S + x).toFixed(1)}px,${(by + o.oy * S + y).toFixed(1)}px,0) translate(-50%,-50%) scale(${(sc * S).toFixed(3)})`;
      o.el.style.opacity = a.toFixed(2);
    }
  }
}
const easeOut = t => 1 - (1 - t) * (1 - t);
