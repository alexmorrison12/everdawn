// Cast bar: fill + spark run as CSS animations (compositor), JS only updates the time text.
// Used for the player cast bar and the target cast bar.
import { h, setText, setCls, setSrc, show } from './util.js';
import { iconURL } from './icons.js';
import { glyphURL } from './art.js';

export class CastBar {
  constructor(ui, parent, cls = '') {
    this.ui = ui;
    const el = this.el = h('div', 'evd-cast ' + cls, parent);
    this.icon = h('img', 'ci', el);
    const bar = this.bar = h('div', 'cb', el);
    this.fill = h('i', 'fill', bar);
    this.sparkW = h('i', 'sparkw', bar); h('i', 'spark', this.sparkW);
    this.flash = h('i', 'flash', bar);
    const txt = h('div', 'txt', bar);
    this.name = h('span', 'nm', txt);
    this.time = h('span', 'tm', txt);
    this.shield = h('img', 'shield', el); this.shield.src = glyphURL('shield');
    this.c = null; this.state = 'idle'; this.flip = 0; this.hideAt = 0;
    show(el, false);
    ui._tick.push(this);
  }
  /**
   * Start (or keep) a cast. Calling every frame with the same cast is cheap (no restart).
   * c: { name, icon, duration, elapsed = 0, interruptible = true, channel = false }
   */
  start(c) {
    const now = this.ui.now, t0 = now - (c.elapsed || 0);
    const cur = this.c;
    if (cur && this.state === 'cast' && cur.name === c.name && Math.abs(cur.t0 - t0) < 0.12 && Math.abs(cur.duration - c.duration) < 0.05) return;
    this.c = { name: c.name, icon: c.icon, duration: c.duration, t0, channel: !!c.channel, interruptible: c.interruptible !== false };
    this.state = 'cast'; this.hideAt = 0;
    const el = this.el;
    el.classList.remove('done', 'intr', 'fade');
    setCls(el, 'channel', this.c.channel);
    setCls(el, 'noint', !this.c.interruptible);
    setText(this.name, c.name);
    if (c.icon) setSrc(this.icon, iconURL(c.icon, 64));
    show(this.icon, !!c.icon);
    show(el, true);
    const f = (this.flip ^= 1);
    for (const [node, nameA, nameB] of [[this.fill, 'evd-fillA', 'evd-fillB'], [this.sparkW, 'evd-slideA', 'evd-slideB']]) {
      const s = node.style;
      s.transform = '';
      s.animationName = f ? nameA : nameB;
      s.animationDuration = c.duration + 's';
      s.animationDelay = -(c.elapsed || 0) + 's';
      s.animationDirection = this.c.channel ? 'reverse' : 'normal';
      s.animationPlayState = 'running';
    }
  }
  /** Pushback / resync: set elapsed seconds of the current cast. */
  setElapsed(e) { if (this.c && this.state === 'cast') this.start({ ...this.c, elapsed: e }); }
  succeed() {
    if (this.state !== 'cast') return;
    this.state = 'done';
    this._freeze(this.c.channel ? 0 : 1);
    this.el.classList.add('done');
    this.hideAt = this.ui.now + 0.55;
  }
  interrupt(text = 'Interrupted') { this._end('intr', text); }
  fail(text = 'Failed') { this._end('intr', text); }
  stop(immediate = true) {
    if (immediate) { this.state = 'idle'; this.c = null; show(this.el, false); return; }
    if (this.state === 'cast') this.succeed();
  }
  _end(cls, text) {
    if (this.state !== 'cast' && this.state !== 'done') return;
    this.state = cls;
    const p = this.c ? Math.min(1, (this.ui.now - this.c.t0) / this.c.duration) : 1;
    this._freeze(this.c && this.c.channel ? 1 - p : p);
    this.el.classList.remove('done');
    this.el.classList.add(cls);
    setText(this.name, text); setText(this.time, '');
    this.hideAt = this.ui.now + 1.1;
  }
  _freeze(p) {
    for (const node of [this.fill, this.sparkW]) { node.style.animationName = 'none'; }
    this.fill.style.transform = `scaleX(${p})`;
    this.sparkW.style.transform = `translateX(${p * 100}%)`;
  }
  tick(now) {
    if (this.hideAt) {
      if (now >= this.hideAt - 0.4) setCls(this.el, 'fade', true);
      if (now >= this.hideAt) { this.hideAt = 0; this.state = 'idle'; this.c = null; show(this.el, false); }
      return;
    }
    if (this.state !== 'cast') return;
    const c = this.c, e = now - c.t0;
    if (e >= c.duration) { if (c.channel) { this.state = 'done'; this.el.classList.add('fade'); this.hideAt = now + 0.35; } else this.succeed(); return; }
    const rem = c.channel ? c.duration - e : e;
    setText(this.time, this.el.classList.contains('tcast') ? (c.duration - e).toFixed(1) : `${rem.toFixed(1)} / ${c.duration.toFixed(1)}`);
  }
}
