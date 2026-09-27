// Track base: owns a fade gain pair (dry + hall send), instruments, a musical clock (bar start times on the audio
// clock) and arrangement helpers. Subclasses implement playBar(bar, t) → bar duration (seconds) or 0 when finished.
import { RNG } from '../util.js';
import { voiceChord, bassOf, chord, inChord } from './theory.js';
import { MIX } from './mix.js';

export class Track {
  constructor(eng, name, t0, seed) {
    this.eng = eng; this.a = eng.a; this.ctx = eng.ctx; this.name = name;
    const ctx = this.ctx, bus = this.a.bus.music;
    this.fade = ctx.createGain(); this.fade.gain.value = 0; this.fade.connect(bus.in);
    this.fadeR = ctx.createGain(); this.fadeR.gain.value = 0; this.fadeR.connect(bus.rev);
    this.out = ctx.createGain(); this.out.connect(this.fade);
    this.rev = ctx.createGain(); this.rev.connect(this.fadeR);
    this.t = t0; this.t0 = t0; this.bar = 0; this.rng = new RNG(seed); this.seed = seed;
    this.inst = {}; this.vl = new Map();
    this.srcs = []; this.kept = []; this.until = t0;
    this.ended = false; this.stopping = false; this.stopAt = Infinity; this.silent = false;
    this.bpm = 90; this.spb = 60 / 90; this.bpb = 4;
    this.log = eng.log ? [] : null;
  }
  // ---- lifecycle ----
  reg(src, end) { this.srcs.push(src); src._end = end; if (end > this.until) this.until = end; }
  keep(node) { this.kept.push(node); }
  // instruments are created once per track; MIX[track][key] is the calibrated stem gain (see mix.js)
  I(key, Cls, o = {}) { return this.inst[key] || (this.inst[key] = new Cls(this, { name: key, ...o, vol: (o.vol ?? 1) * ((MIX[this.mixKey || this.name] || {})[key] ?? 1) })); }
  _ramp(p, t, from, to, dur) {
    if (p.cancelAndHoldAtTime) p.cancelAndHoldAtTime(t); else p.cancelScheduledValues(t);
    if (dur <= 0.02) { p.setValueAtTime(to, t); return; }
    const n = 32, c = new Float32Array(n);
    for (let i = 0; i < n; i++) { const u = i / (n - 1); c[i] = to > from ? from + (to - from) * Math.sin(u * Math.PI / 2) : to + (from - to) * Math.cos(u * Math.PI / 2); }
    p.setValueCurveAtTime(c, t, dur);
  }
  fadeIn(t, dur) { for (const g of [this.fade, this.fadeR]) this._ramp(g.gain, t, 0, 1, dur); this.level = 1; }
  fadeOut(t, dur) {
    const from = this.level ?? 1;
    for (const g of [this.fade, this.fadeR]) this._ramp(g.gain, t, from, 0, Math.max(0.05, dur));
    this.stopping = true; this.stopAt = t + Math.max(0.05, dur); this.level = 0;
  }
  setLevel(v, t, dur = 0.4) { for (const g of [this.fade, this.fadeR]) { const p = g.gain; if (p.cancelAndHoldAtTime) p.cancelAndHoldAtTime(t); else p.cancelScheduledValues(t); p.setTargetAtTime(v, t, dur / 3); } this.level = v; }
  schedule(until) {
    const st = this.eng.stats;
    let guard = 0;
    while (!this.ended && this.t < until && this.t < this.stopAt && guard++ < 64) {
      const now = this.ctx.currentTime;
      const lead = this.t - now;
      if (lead < -0.03) {
        // fell behind (main thread stalled longer than the lookahead): advance the form silently, never burst
        this.silent = true; const len = this.playBar(this.bar, this.t); this.silent = false;
        st.skipped++;
        if (!len) { this.ended = true; break; }
        this.t += len; this.bar++; continue;
      }
      if (this.bar > 0 && lead < st.minLead) st.minLead = lead;
      const len = this.playBar(this.bar, this.t);
      st.bars++;
      if (!len) { this.ended = true; break; }
      this.t += len; this.bar++;
    }
    if (this.srcs.length > 400) { const now = this.ctx.currentTime; this.srcs = this.srcs.filter((s) => s._end > now); }
  }
  dispose() {
    const now = this.ctx.currentTime;
    for (const s of this.srcs) { try { s.stop(now); } catch (e) { /* not started / already stopped */ } }
    for (const k of this.kept) { try { k.stop(now); } catch (e) { /* noop */ } }
    this.srcs = []; this.kept = [];
    try { this.fade.disconnect(); this.fadeR.disconnect(); } catch (e) { /* noop */ }
    this.ended = true;
  }
  // ---- musical helpers ----
  tempo(bpm, bpb = this.bpb) { this.bpm = bpm; this.spb = 60 / bpm; this.bpb = bpb; }
  get barDur() { return this.bpb * this.spb; }
  bt(t, beat) { return t + beat * this.spb; }
  hum(ms = 8) { return (this.rng.next() * 2 - 1) * ms / 1000; }
  // Voice-led chord on an instrument (state kept per key).
  pad(inst, t, dur, ch, { n = 4, lo = 55, hi = 76, vel = 0.5, key = null, spread = 12, ...o } = {}) {
    key = key || inst.o.name;
    const v = voiceChord(ch, n, lo, hi, this.vl.get(key));
    this.vl.set(key, v);
    for (const m of v) { const tt = t + this.hum(spread); inst.note(tt, m, dur, vel * (0.92 + 0.16 * this.rng.next()), o); }
    return v;
  }
  bass(inst, t, dur, ch, { lo = 36, hi = 50, vel = 0.5, key = null, oct = false, ...o } = {}) {
    key = key || inst.o.name;
    const prev = this.vl.get(key);
    const m = bassOf(ch, lo, hi, prev ? prev[0] : null);
    this.vl.set(key, [m]);
    inst.note(t, m, dur, vel, o);
    if (oct) { inst.note(t, m + 12, dur, vel * 0.6, o); }
    return m;
  }
  voicing(ch, n, lo, hi, key) { const v = voiceChord(ch, n, lo, hi, this.vl.get(key)); this.vl.set(key, v); return v; }
  bassPitch(ch, lo = 36, hi = 50, key = 'bassP') {
    const prev = this.vl.get(key), m = bassOf(ch, lo, hi, prev ? prev[0] : null);
    this.vl.set(key, [m]); return m;
  }
  // octave-shift a transposition so a melody sits inside [lo, hi]
  fit(notes, tr, lo, hi) {
    let mn = 127, mx = 0; for (const n of notes) { mn = Math.min(mn, n.m + tr); mx = Math.max(mx, n.m + tr); }
    while (mn < lo && mx + 12 <= hi + 3) { tr += 12; mn += 12; mx += 12; }
    while (mx > hi && mn - 12 >= lo - 3) { tr -= 12; mn -= 12; mx -= 12; }
    return tr;
  }
  tones(ch, lo, count) { const c = chord(ch), out = []; for (let m = lo; out.length < count && m < lo + 48; m++) if (inChord(c, m)) out.push(m); return out; }
  arp(inst, t, beats, ch, { pat = [0, 1, 2, 3, 2, 1], step = 0.5, lo = 55, vel = 0.45, accent = 1.15, len = 2, from = 0, key = null } = {}) {
    const tones = this.tones(ch, lo, Math.max(...pat) + 1);
    const steps = Math.round(beats / step);
    for (let i = from; i < steps; i++) {
      const m = tones[pat[i % pat.length]]; if (m == null) continue;
      const tt = t + i * step * this.spb + this.hum(5), v = vel * (i % pat.length === 0 ? accent : 1) * (0.88 + 0.24 * this.rng.next());
      inst.note(tt, m, step * this.spb * len, v);
    }
  }
  line(inst, t, notes, { vel = 0.6, tr = 0, legato = 0.97, accent = 1.12, hum = 7, key = null, ...o } = {}) {
    for (const n of notes) {
      const tt = t + n.b * this.spb + this.hum(hum), d = n.d * this.spb * legato, v = vel * (n.acc ? accent : 1) * (0.94 + 0.12 * this.rng.next());
      inst.note(tt, n.m + tr, d, v, o);
    }
  }
  // notes of a pre-parsed melody that start inside bar `bar` (bpb beats per bar), re-based to the bar start
  barSlice(notes, bar, bpb = this.bpb) {
    const b0 = bar * bpb; const out = [];
    for (const n of notes) if (n.b >= b0 - 1e-6 && n.b < b0 + bpb - 1e-6) out.push({ ...n, b: n.b - b0 });
    return out;
  }
}
