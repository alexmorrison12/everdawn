// Centre-screen messages: zone text, error/info text, raid warnings, level-up banner, achievement toasts, countdown.
import { h, setText, replay, show } from './util.js';
import { iconURL } from './icons.js';
import { achievementShieldURL } from './art.js';

export class Alerts {
  constructor(ui, parent) {
    this.ui = ui;
    // zone text
    this.zoneEl = h('div', 'evd-zone', parent);
    this.zoneT = h('div', 'zt', this.zoneEl); this.zoneS = h('div', 'zs', this.zoneEl); this.zoneP = h('div', 'zp', this.zoneEl);
    // errors / info
    this.errEl = h('div', 'evd-errors', parent);
    this.errs = [];
    // raid warnings
    this.rwEl = h('div', 'evd-rw', parent);
    this.rws = [];
    // countdown
    this.cdEl = h('div', 'evd-count', parent);
    // level up
    this.lvlEl = h('div', 'evd-levelup', parent);
    // achievements
    this.achEl = h('div', 'evd-achs', parent);
    show(this.zoneEl, false); show(this.lvlEl, false);
    this._timers = [];
    ui._tick.push(this);
  }
  _later(t, fn) { this._timers.push({ t: this.ui.now + t, fn }); }
  tick(now) {
    for (let i = this._timers.length - 1; i >= 0; i--) { const tm = this._timers[i]; if (now >= tm.t) { this._timers.splice(i, 1); tm.fn(); } }
  }

  /** Big area-entry text. type: friendly|hostile|contested|sanctuary|neutral colours the text. */
  zone(name, sub = '', type = 'neutral', pvpLine = '') {
    setText(this.zoneT, name); setText(this.zoneS, sub); setText(this.zoneP, pvpLine);
    this.zoneEl.className = 'evd-zone zt-' + type;
    show(this.zoneEl, true); replay(this.zoneEl, 'play');
    const id = (this._zid = (this._zid || 0) + 1);
    this._later(5.4, () => { if (this._zid === id) show(this.zoneEl, false); });
  }
  /** Red UI error ("Not enough mana"). Repeats refresh the existing line. */
  error(text) { this._msg(text, 'err'); }
  /** Yellow info line ("Quest accepted: …", "Timber Wolf slain: 3/6"). */
  info(text) { this._msg(text, 'info'); }
  _msg(text, cls) {
    let e = this.errs.find(x => x.text === text);
    if (!e) {
      e = { text, el: h('div', 'em ' + cls, null, text) };
      this.errEl.appendChild(e.el); this.errs.push(e);
      if (this.errs.length > 3) { const o = this.errs.shift(); o.el.remove(); }
    }
    replay(e.el, 'show');
    e.until = this.ui.now + 2.6;
    const ref = e;
    this._later(2.65, () => { if (this.ui.now >= ref.until - 0.01) { ref.el.remove(); this.errs = this.errs.filter(x => x !== ref); } });
  }
  /** Raid warning: big pulsing text (default orange-red), 6 s, two lines max. */
  raidWarning(text, color) {
    const el = h('div', 'rwl', null, text);
    if (color) el.style.color = color;
    this.rwEl.appendChild(el); this.rws.push(el);
    if (this.rws.length > 2) this.rws.shift().remove();
    this._later(6, () => { el.classList.add('out'); this._later(0.8, () => { el.remove(); this.rws = this.rws.filter(x => x !== el); }); });
  }
  /** Boss emote style text (orange, centred, no pulse). */
  emote(text) { this.raidWarning(text, '#ffb400'); }
  /** Big countdown number (DBM style), e.g. countdown(3). */
  countdown(n, color) {
    const el = h('div', 'cn', this.cdEl, String(n));
    if (color) el.style.color = color;
    this._later(0.95, () => el.remove());
  }
  /** "You have reached Level N!" banner. opts: { abilities: [{name, icon}], stats: ['+2 Stamina'] } */
  levelUp(level, opts = {}) {
    const el = this.lvlEl; el.textContent = '';
    h('div', 'rays', el);
    const inner = h('div', 'lin', el);
    h('div', 'lv', inner, 'Level ' + level);
    h('div', 'msg', inner, `You have reached Level ${level}!`);
    for (const a of opts.abilities || []) {
      const r = h('div', 'ab', inner);
      h('img', '', r).src = iconURL(a.icon, 64);
      const t = h('span', '', r); t.append('New ability: '); h('b', '', t, a.name);
    }
    if (opts.stats && opts.stats.length) h('div', 'st', inner, opts.stats.join('   '));
    show(el, true); replay(el, 'play');
    const id = (this._lid = (this._lid || 0) + 1);
    this._later(6.2, () => { if (this._lid === id) show(el, false); });
  }
  /** Achievement toast. a: { name, desc?, points = 10, icon? } */
  achievement(a) {
    const el = h('div', 'ach ptr', this.achEl);
    const sh = h('img', 'sh', el); sh.src = achievementShieldURL(a.points ?? 10);
    if (a.icon) { const ic = h('img', 'ic', el); ic.src = iconURL(a.icon, 64); }
    const tx = h('div', 'tx', el);
    h('div', 'hd', tx, 'Achievement Earned');
    h('div', 'nm', tx, a.name);
    if (a.desc) h('div', 'ds', tx, a.desc);
    el.addEventListener('click', () => el.remove());
    this._later(6.5, () => { el.classList.add('out'); this._later(0.6, () => el.remove()); });
  }
}
