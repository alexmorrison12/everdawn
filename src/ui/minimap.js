// Minimap frame (game supplies the map canvas) + quest tracker.
import { h, setText, setCls, setVariant, show, replay } from './util.js';
import { portraitRing, glyphURL, questMarkURL } from './art.js';

export class Minimap {
  constructor(ui, parent) {
    this.ui = ui;
    const el = this.el = h('div', 'evd-minimap', parent);
    const plate = this.plate = h('div', 'zone', el);
    this.zone = h('span', 'zn', plate);
    const wrap = h('div', 'mmw', el);
    /** The game draws the minimap into this canvas (256×256, shown as a 180px circle). */
    this.canvas = h('canvas', 'mm ptr', wrap); this.canvas.width = this.canvas.height = 256;
    this.gloss = h('i', 'gloss', wrap);
    h('img', 'ring', wrap).src = portraitRing(200);
    this.north = h('span', 'north', wrap, 'N');
    this.arrow = h('i', 'parrow', wrap);
    const mk = (cls, glyph, tip, ev) => { const b = h('button', 'evd-iconbtn mmb ' + cls, wrap); h('img', '', b).src = glyphURL(glyph); b._tip = () => ({ type: 'text', title: tip }); if (ev) b.addEventListener('click', ev); return b; };
    this.zin = mk('zin', 'plus', 'Zoom In', () => ui.emit('minimapZoom', 1));
    this.zout = mk('zout', 'minus', 'Zoom Out', () => ui.emit('minimapZoom', -1));
    this.track = mk('track', 'track', 'Tracking: none', () => ui.emit('minimapTracking'));
    this.trackLabel = 'none'; this.track._tip = () => ({ type: 'text', title: `Tracking: ${this.trackLabel}`, lines: ['Click to switch between Find Minerals, Find Herbs and nothing.'] });
    this.mail = mk('mail', 'mail', 'You have unread mail', () => ui.emit('minimapMail'));
    this.dayw = h('div', 'day', wrap); this.sun = h('i', 'sun', this.dayw);
    this.clock = h('div', 'clock', el);
    this.coords = h('div', 'coords', el);
    this.canvas.addEventListener('click', e => {
      const r = this.canvas.getBoundingClientRect();
      ui.emit(e.altKey || e.ctrlKey || e.metaKey ? 'minimapMark' : 'minimapClick', (e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height);
    });
    this.canvas.addEventListener('pointerdown', e => { // middle-click: a waypoint for your group
      if (e.button !== 1) return; e.preventDefault();
      const r = this.canvas.getBoundingClientRect();
      ui.emit('minimapMark', (e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height);
    });
    this.canvas.addEventListener('wheel', e => { e.preventDefault(); ui.emit('minimapZoom', e.deltaY < 0 ? 1 : -1); }, { passive: false });
    show(this.mail, false);
  }
  /**
   * d: { zone, subzone?, zoneType?: 'friendly'|'hostile'|'contested'|'sanctuary'|'neutral', time?: 'hh:mm' | Date,
   *      x?, y? (map coords 0..100), mail?, tracking?: string, facing? (radians, rotates the player arrow), dayPhase? 0..1 }
   */
  set(d) {
    setText(this.zone, d.subzone || d.zone || '');
    setVariant(this.plate, 'zt-', d.zoneType || 'neutral');
    if (d.time != null) setText(this.clock, typeof d.time === 'string' ? d.time : `${String(d.time.getHours()).padStart(2, '0')}:${String(d.time.getMinutes()).padStart(2, '0')}`);
    if (d.x != null) setText(this.coords, `${d.x.toFixed(1)}, ${d.y.toFixed(1)}`);
    show(this.mail, !!d.mail);
    if (d.facing != null) { const deg = Math.round(-d.facing * 180 / Math.PI); if (deg !== this._f) { this._f = deg; this.arrow.style.transform = `rotate(${deg}deg)`; } }
    if (d.dayPhase != null) { const a = Math.round(d.dayPhase * 360); if (a !== this._d) { this._d = a; this.sun.style.transform = `rotate(${a}deg)`; } }
  }
}

// ------------------------------------------------------------------------------------ quest tracker
export class QuestTracker {
  constructor(ui, parent) {
    this.ui = ui;
    const el = this.el = h('div', 'evd-tracker', parent);
    const hd = h('div', 'hd ptr', el);
    h('span', '', hd, 'Quests');
    this.count = h('span', 'cnt', hd);
    this.tog = h('button', 'tog', hd, '–');
    this.tog.addEventListener('click', () => { const c = !el.classList.contains('collapsed'); setCls(el, 'collapsed', c); this.tog.textContent = c ? '+' : '–'; });
    this.list = h('div', 'ql', el);
    this.q = new Map();
    show(el, false);
  }
  /**
   * quests: [{ id, title, level?, complete?, objectives: [{ text, have?, need?, done? }] }]
   * Objective counter increments flash; completed objectives turn gold; complete quests get "(Complete)".
   */
  set(quests) {
    const seen = new Set();
    let i = 0;
    for (const q of quests) {
      seen.add(q.id);
      let e = this.q.get(q.id);
      if (!e) {
        e = { el: h('div', 'qt ptr'), objs: [] };
        e.title = h('div', 'tt', e.el);
        e.mark = h('img', 'qm', e.title);
        e.tt = h('span', '', e.title);
        e.ob = h('div', 'obs', e.el);
        e.el.addEventListener('click', () => this.ui.emit('questClick', q.id));
        this.q.set(q.id, e);
        replay(e.el, 'new');
      }
      if (this.list.children[i] !== e.el) this.list.insertBefore(e.el, this.list.children[i] || null);
      i++;
      const title = (q.level ? `[${q.level}] ` : '') + q.title + (q.complete ? ' (Complete)' : '');
      setText(e.tt, title);
      setCls(e.el, 'done', !!q.complete);
      if (e._c !== !!q.complete) { e._c = !!q.complete; e.mark.src = questMarkURL(q.complete ? 'complete' : 'available'); if (q.complete) replay(e.el, 'flash'); }
      const objs = q.objectives || [];
      for (let k = 0; k < objs.length; k++) {
        const o = objs[k];
        let oe = e.objs[k];
        if (!oe) { oe = e.objs[k] = h('div', 'ob', e.ob); oe._have = o.have; }
        const done = o.done ?? (o.need != null && o.have >= o.need);
        setText(oe, '- ' + o.text + (o.need != null ? `: ${Math.min(o.have || 0, o.need)}/${o.need}` : ''));
        setCls(oe, 'done', done);
        if (o.have !== oe._have) { if (o.have > oe._have) replay(oe, 'bump'); oe._have = o.have; }
        show(oe, true);
      }
      for (let k = objs.length; k < e.objs.length; k++) show(e.objs[k], false);
    }
    for (const [id, e] of this.q) if (!seen.has(id)) { e.el.remove(); this.q.delete(id); }
    setText(this.count, quests.length ? `${quests.length}/20` : '');
    show(this.el, quests.length > 0);
  }
}
