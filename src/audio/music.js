// Music engine: lookahead scheduler on the audio clock + crossfades + phase changes + stingers.
// Bars are generated when their start time enters the lookahead window (≥ 1.2 s, adaptively larger when the
// timer is starved), so brief main-thread hitches never cause gaps; if a stall exceeds the window, late bars are
// advanced silently instead of bursting. The musical clock is t += barDuration on AudioContext time (no drift).
import { RNG } from './util.js';
import { Login } from './music/login.js';
import { Vale } from './music/vale.js';
import { Village } from './music/village.js';
import { Night } from './music/night.js';
import { Danger } from './music/danger.js';
import { Raid } from './music/raid.js';
import { Victory, Wipe } from './music/stingers.js';
import { TRACK_GAIN } from './music/mix.js';

export const TRACKS = {
  login: { make: (e, n, t, s) => new Login(e, n, t, s) },
  vale: { make: (e, n, t, s) => new Vale(e, n, t, s) },
  village: { make: (e, n, t, s) => new Village(e, n, t, s) },
  night: { make: (e, n, t, s) => new Night(e, n, t, s) },
  danger: { make: (e, n, t, s) => new Danger(e, n, t, s) },
  raid: { family: 'raid', make: (e, n, t, s) => new Raid(e, n, t, s, 1) },
  raidP2: { family: 'raid', make: (e, n, t, s) => new Raid(e, n, t, s, 2) },
  raidP3: { family: 'raid', make: (e, n, t, s) => new Raid(e, n, t, s, 3) },
  victory: { stinger: true, make: (e, n, t, s) => new Victory(e, n, t, s) },
  wipe: { stinger: true, make: (e, n, t, s) => new Wipe(e, n, t, s) },
};

export class MusicEngine {
  constructor(a) {
    this.a = a; this.ctx = a.ctx; this.tracks = []; this.cur = null;
    this.baseHorizon = 1.2; this.horizon = 1.2;
    this.rng = new RNG(a.seed ^ 0x5bd1e995);
    this.stats = { bars: 0, skipped: 0, minLead: Infinity, maxTimerGap: 0, horizon: 1.2 };
    this.log = false; this._wall = 0;
  }
  get currentName() { return this.cur ? this.cur.name : null; }
  play(name, { fade = 3, then = null, seed = null } = {}) {
    const now = this.ctx.currentTime;
    if (!name) { if (this.cur) { this.cur.fadeOut(now, fade); this.cur = null; } return; }
    const def = TRACKS[name];
    if (!def) { console.warn('[audio] unknown track', name); return; }
    if (this.cur && !this.cur.stopping) {
      if (this.cur.name === name) return;
      if (def.family && this.cur.family === def.family && this.cur.setPhase) { this.cur.setPhase(name); this.cur.name = name; return; }
    }
    const t0 = now + 0.08;
    const tr = def.make(this, name, t0, seed ?? ((this.rng.next() * 4294967296) >>> 0));
    tr.family = def.family || null; tr.then = then;
    tr.out.gain.value = tr.rev.gain.value = TRACK_GAIN[tr.mixKey || name] ?? 1;
    if (def.stinger) { tr.fadeIn(t0, 0.01); if (this.cur) this.cur.fadeOut(now, Math.min(fade, 0.8)); }
    else { tr.fadeIn(t0, fade); if (this.cur) this.cur.fadeOut(now, fade); }
    this.cur = tr; this.tracks.push(tr);
    this.tick();
  }
  // Overlay a stinger on top of the current music (which dips while it plays).
  stinger(name, { dip = 0.25 } = {}) {
    const def = TRACKS[name]; if (!def) return;
    const now = this.ctx.currentTime, t0 = now + 0.05;
    const tr = def.make(this, name, t0, (this.rng.next() * 4294967296) >>> 0);
    tr.out.gain.value = tr.rev.gain.value = TRACK_GAIN[name] ?? 1;
    tr.fadeIn(t0, 0.01); tr.overlay = true; this.tracks.push(tr);
    tr.schedule(t0 + 30);
    const cur = this.cur;
    if (cur && !cur.stopping) { cur.setLevel(dip, now, 0.3); cur._restoreAt = tr.until - 1.0; }
  }
  tick() {
    const now = this.ctx.currentTime;
    if (!this.a.offline) {
      const w = performance.now();
      if (this._wall) {
        const gap = (w - this._wall) / 1000;
        if (gap > this.stats.maxTimerGap) this.stats.maxTimerGap = gap;
        // grow the lookahead quickly when the timer is starved (background tab / long frames), shrink slowly
        this.horizon = gap * 2.2 > this.horizon ? Math.min(4, gap * 2.2) : Math.max(this.baseHorizon, this.horizon - 0.01);
      }
      this._wall = w; this.stats.horizon = this.horizon;
    }
    let next = null;
    for (const tr of this.tracks.slice()) {
      if (!tr.ended) tr.schedule(now + this.horizon);
      if (tr._restoreAt && now >= tr._restoreAt) { tr._restoreAt = 0; if (!tr.stopping) tr.setLevel(1, now, 1.2); }
      if (tr === this.cur && tr.ended && tr.then && !tr.thenStarted && now > tr.until - 2) { tr.thenStarted = true; next = tr.then; }
      if ((tr.stopping && now > tr.stopAt + 0.2) || (tr.ended && now > tr.until + 0.3)) {
        tr.dispose(); this.tracks.splice(this.tracks.indexOf(tr), 1);
        if (this.cur === tr) this.cur = null;
      }
    }
    if (next) { if (this.cur && this.cur.ended) this.cur = null; this.play(next, { fade: 2 }); }
  }
}
