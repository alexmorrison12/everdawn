// Kit: a tiny node-graph toolkit bound to one voice. Recipes call helpers with times RELATIVE to the voice start;
// every source is started/stopped automatically and tracked so the engine knows when the voice ends and can steal it.
import { RNG, driveCurve } from './util.js';

// Partial tables [ratio, amp, decayMul]
export const BELL = [[1, 1, 1], [2.76, 0.45, 0.55], [5.4, 0.22, 0.32], [8.93, 0.1, 0.2]];     // glockenspiel-ish
export const CHIME = [[1, 1, 1], [2, 0.32, 0.6], [3.01, 0.14, 0.4], [4.2, 0.07, 0.25]];       // soft, near-harmonic
export const TUBE = [[1, 1, 1], [2.02, 0.5, 0.7], [2.99, 0.3, 0.5], [4.16, 0.25, 0.35], [5.43, 0.12, 0.25]];
export const METAL = [[1, 1, 1], [2.52, 0.8, 0.8], [4.43, 0.6, 0.6], [7.27, 0.4, 0.45], [10.9, 0.25, 0.3]];

export class Kit {
  constructor(eng, ctx, out, t0, { rate = 1, rng = null, seed = 1, o = {} } = {}) {
    this.e = eng; this.ctx = ctx; this.out = out; this.t0 = t0; this.r = rate; this.o = o;
    this.rng = rng || new RNG(seed);
    this.st = { srcs: [], end: t0 };
    this.nyq = ctx.sampleRate * 0.45;
  }
  // ---- randomness ----
  rnd(a = 0, b = 1) { return a + (b - a) * this.rng.next(); }
  vary(x, amt = 0.1) { return x * (1 + (this.rng.next() * 2 - 1) * amt); }
  pick(arr) { return arr[Math.floor(this.rng.next() * arr.length)]; }
  chance(p) { return this.rng.next() < p; }
  at(t) { return this.t0 + t; }
  // child kit sharing the output and source list, offset in time (for layering recipes)
  sub(dt = 0, out = this.out) { const k = Object.create(this); k.t0 = this.t0 + dt; k.out = out; return k; }

  // ---- node factories ----
  _src(n, t0, t1) {
    n.start(t0); n.stop(t1); n._end = t1; this.st.srcs.push(n);
    if (t1 > this.st.end) this.st.end = t1;
    return n;
  }
  gain(v = 1, dest = this.out) { const g = this.ctx.createGain(); g.gain.value = v; if (dest) g.connect(dest); return g; }
  filter(type, f, q = 0.707, dest = this.out, gainDb = 0) {
    const n = this.ctx.createBiquadFilter(); n.type = type;
    n.frequency.value = Math.min(this.nyq, f * this.r); n.Q.value = q; if (gainDb) n.gain.value = gainDb;
    if (dest) n.connect(dest); return n;
  }
  pan(p = 0, dest = this.out) { const n = this.ctx.createStereoPanner(); n.pan.value = p; if (dest) n.connect(dest); return n; }
  drive(k = 2, dest = this.out) {
    const n = this.ctx.createWaveShaper(); n.curve = driveCurve(k); n.oversample = '2x'; if (dest) n.connect(dest); return n;
  }
  delay(time, dest = this.out, max = 1) { const n = this.ctx.createDelay(max); n.delayTime.value = time; if (dest) n.connect(dest); return n; }
  osc(type, f, t, dur, dest = this.out, detune = 0) {
    const o = this.ctx.createOscillator();
    if (typeof type === 'string') o.type = type; else o.setPeriodicWave(type);
    o.frequency.value = Math.min(this.nyq, f * this.r); o.detune.value = detune;
    if (dest) o.connect(dest);
    return this._src(o, this.at(t), this.at(t + dur));
  }
  noiseSrc(t, dur, dest = this.out, color = 'white', rate = 1) {
    const s = this.ctx.createBufferSource(), b = this.e.noise[color];
    s.buffer = b; s.loop = true; s.playbackRate.value = rate;
    if (dest) s.connect(dest);
    s.start(this.at(t), this.rng.next() * (b.duration - 0.1));
    s.stop(this.at(t + dur)); s._end = this.at(t + dur); this.st.srcs.push(s);
    if (this.at(t + dur) > this.st.end) this.st.end = this.at(t + dur);
    return s;
  }
  bufSrc(buffer, t, dest = this.out, rate = 1, dur = null, detune = 0) {
    const s = this.ctx.createBufferSource(); s.buffer = buffer; s.playbackRate.value = rate * this.r;
    if (detune) s.detune.value = detune;
    if (dest) s.connect(dest);
    const d = dur ?? buffer.duration / (rate * this.r);
    return this._src(s, this.at(t), this.at(t + d));
  }
  // random piecewise-linear LFO in ±depth (a noise buffer played extremely slowly: a new random point every 1/hz s)
  wobble(t, dur, hz, depth, param) {
    const g = this.ctx.createGain(); g.gain.value = depth / 0.52; g.connect(param);
    this.noiseSrc(t, dur, g, 'white', hz / this.ctx.sampleRate);
    return g;
  }
  lfo(t, dur, hz, depth, param, type = 'sine') {
    const g = this.ctx.createGain(); g.gain.value = depth; g.connect(param);
    const o = this.ctx.createOscillator(); o.type = type; o.frequency.value = hz; o.connect(g);
    this._src(o, this.at(t), this.at(t + dur));
    return { o, g };
  }

  // ---- automation (relative times) ----
  // exponential frequency path [[dt, hz], ...] (hz scaled by rate)
  freqPts(param, pts, t = 0) {
    const r = this.r, nyq = this.nyq;
    param.setValueAtTime(Math.min(nyq, Math.max(1, pts[0][1] * r)), this.at(t + pts[0][0]));
    for (let i = 1; i < pts.length; i++) param.exponentialRampToValueAtTime(Math.min(nyq, Math.max(1, pts[i][1] * r)), this.at(t + pts[i][0]));
  }
  // linear value path [[dt, v], ...]
  envPts(param, pts, t = 0, scale = 1) {
    param.setValueAtTime(pts[0][1] * scale, this.at(t + pts[0][0]));
    for (let i = 1; i < pts.length; i++) param.linearRampToValueAtTime(pts[i][1] * scale, this.at(t + pts[i][0]));
  }
  // attack (linear) → hold → exponential decay; d = time to fall 60 dB
  perc(param, t, a, d, peak, hold = 0) {
    const T = this.at(t);
    param.setValueAtTime(0, T);
    param.linearRampToValueAtTime(peak, T + a);
    if (hold > 0) param.setValueAtTime(peak, T + a + hold);
    param.setTargetAtTime(0, T + a + hold, d / 6.9);
    return a + hold + d;
  }

  // ---- high level voices ----
  // Oscillator with amplitude envelope and pitch motion.
  tone(o) {
    const { t = 0, f = 440, f1 = 0, sweep = 0, fc = null, type = 'sine', a = 0.003, d = 0.3, hold = 0, vol = 0.3, dest = this.out,
      detune = 0, env = null, vib = null, lin = false } = o;
    const g = this.gain(0, dest);
    const osc = this.ctx.createOscillator();
    if (typeof type === 'string') osc.type = type; else osc.setPeriodicWave(type);
    osc.detune.value = detune;
    const len = env ? env[env.length - 1][0] : a + hold + d;
    if (fc) this.freqPts(osc.frequency, fc, t);
    else {
      osc.frequency.setValueAtTime(Math.min(this.nyq, f * this.r), this.at(t));
      if (f1) {
        const T1 = this.at(t + (sweep || len)), v = Math.min(this.nyq, f1 * this.r);
        if (lin) osc.frequency.linearRampToValueAtTime(v, T1); else osc.frequency.exponentialRampToValueAtTime(v, T1);
      }
    }
    if (vib) this.lfo(t, len + 0.05, vib[0], vib[1], osc.detune);
    osc.connect(g);
    if (env) this.envPts(g.gain, env, t, vol); else this.perc(g.gain, t, a, d, vol, hold);
    this._src(osc, this.at(t), this.at(t + len + 0.02));
    return { osc, g };
  }
  // Filtered noise burst. type null = unfiltered. fc = frequency path for the filter.
  nz(o) {
    const { t = 0, color = 'white', type = 'bandpass', f = 1000, f1 = 0, sweep = 0, fc = null, q = 1, a = 0.002, d = 0.2, hold = 0,
      vol = 0.3, dest = this.out, env = null, rate = 1 } = o;
    const g = this.gain(0, dest);
    const len = env ? env[env.length - 1][0] : a + hold + d;
    let head = g, flt = null;
    if (type) {
      flt = this.filter(type, f, q, g);
      if (fc) this.freqPts(flt.frequency, fc, t);
      else if (f1) { flt.frequency.setValueAtTime(Math.min(this.nyq, f * this.r), this.at(t)); flt.frequency.exponentialRampToValueAtTime(Math.min(this.nyq, f1 * this.r), this.at(t + (sweep || len))); }
      head = flt;
    }
    this.noiseSrc(t, len + 0.02, head, color, rate);
    if (env) this.envPts(g.gain, env, t, vol); else this.perc(g.gain, t, a, d, vol, hold);
    return { g, flt };
  }
  // Additive bell/metal: partials [[ratio, amp, decayMul]]
  bell(o) {
    const { t = 0, f = 1000, vol = 0.2, d = 1.2, a = 0.001, partials = BELL, dest = this.out, type = 'sine', spread = 0 } = o;
    for (const [ratio, amp, dm = 1] of partials) {
      const fr = f * ratio * (spread ? 1 + (this.rng.next() * 2 - 1) * spread : 1);
      if (fr * this.r > this.nyq) continue;
      this.tone({ t, f: fr, a, d: d * dm, vol: vol * amp, dest, type });
    }
  }
  // Pitched body (kick/thud): fast downward sweep.
  thump(o) {
    const { t = 0, f0 = 150, f1 = 50, sweep = 0.08, d = 0.3, a = 0.002, vol = 0.5, dest = this.out, type = 'sine', hold = 0 } = o;
    return this.tone({ t, fc: [[0, f0], [sweep, f1]], type, a, d, vol, dest, hold });
  }
  // Short sparkle pings (random high notes) spread over a window.
  sparkle({ t = 0, dur = 1, n = 10, lo = 3000, hi = 9000, vol = 0.05, d = 0.35, dest = this.out, notes = null, panSpread = 0.8 }) {
    for (let i = 0; i < n; i++) {
      const u = Math.pow(this.rng.next(), 1.6), tt = t + u * dur;
      const f = notes ? this.pick(notes) : lo * Math.pow(hi / lo, this.rng.next());
      const p = this.pan((this.rng.next() * 2 - 1) * panSpread, dest);
      this.tone({ t: tt, f, a: 0.002, d: d * (0.6 + this.rng.next() * 0.8), vol: vol * (1 - u * 0.6), dest: p });
    }
  }
  // Formant voice for creatures/choir stabs. pitch/amp/formants are time paths relative to t.
  voice(o) {
    const { t = 0, pitch = [[0, 200], [0.3, 200]], amp = [[0, 0], [0.03, 1], [0.3, 0]], vol = 0.3, src = 'sawtooth',
      formants = [[0, [700, 1150, 2700]]], q = [6, 8, 10], fg = [1, 0.5, 0.22], fry = 0, fryRate = 30, fryType = 'sawtooth',
      jitter = 0, jitterHz = 12, breath = 0, drive = 0, vib = null, body = 0, dest = this.out, detune = 0, hp = 45 } = o;
    const len = amp[amp.length - 1][0];
    const g = this.gain(0, hp ? this.filter('highpass', hp, 0.7, dest) : dest);
    this.envPts(g.gain, amp, t, vol);
    const sum = this.gain(1, drive ? this.drive(drive, g) : g);
    const bps = formants[0][1].map((f, i) => { const bp = this.filter('bandpass', f, q[i] ?? 8, null); bp.connect(this.gain(fg[i] ?? 0.2, sum)); return bp; });
    if (formants.length > 1) for (let i = 0; i < bps.length; i++) this.freqPts(bps[i].frequency, formants.map(([dt, fs]) => [dt, fs[i]]), t);
    const osc = this.ctx.createOscillator();
    if (typeof src === 'string') osc.type = src; else osc.setPeriodicWave(src);
    osc.detune.value = detune;
    this.freqPts(osc.frequency, pitch, t);
    let s = osc;
    if (fry > 0) {
      const am = this.gain(1 - fry, null); osc.connect(am);
      this.lfo(t, len + 0.05, fryRate, fry, am.gain, fryType);
      s = am;
    }
    for (const bp of bps) s.connect(bp);
    if (body > 0) { const lp = this.filter('lowpass', 500, 0.7, this.gain(body, sum)); s.connect(lp); }
    if (breath > 0) { const bn = this.gain(breath, null); for (const bp of bps) bn.connect(bp); this.noiseSrc(t, len + 0.05, bn, 'white'); }
    if (jitter > 0) this.wobble(t, len + 0.05, jitterHz, jitter, osc.detune);
    if (vib) this.lfo(t, len + 0.05, vib[0], vib[1], osc.detune);
    this._src(osc, this.at(t), this.at(t + len + 0.03));
    return { g, osc, bps };
  }
  // Karplus-Strong pluck (buffers cached by the engine).
  pluck({ t = 0, f = 220, vol = 0.4, t60 = 1.5, bright = 0.5, pos = 0.2, shape = 0.5, dest = this.out, detune = 0 }) {
    const buf = this.e.ks(f, { t60, bright, pos, shape });
    const g = this.gain(vol, dest);
    this.bufSrc(buf, t, g, 1, null, detune);
    return g;
  }
}
