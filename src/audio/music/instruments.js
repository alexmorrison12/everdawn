// Orchestra voices for the music engine. Each instrument owns a small bus (EQ/formants/chorus → pan → track out +
// hall send) and schedules per-note node graphs at absolute audio times. All per-note modulators (vibrato,
// tremolo) are per-note nodes so finished notes are fully garbage-collectable (no shared node → param fan-out).
import { mtof, clamp, driveCurve } from '../util.js';
import { VOWEL } from '../sfx/common.js';

const DET = [-10, 1, 11, -5, 6];

function biq(ctx, type, f, q = 0.707, g = 0) { const n = ctx.createBiquadFilter(); n.type = type; n.frequency.value = f; n.Q.value = q; n.gain.value = g; return n; }
function link(...nodes) { for (let i = 0; i < nodes.length - 1; i++) nodes[i].connect(nodes[i + 1]); return nodes[nodes.length - 1]; }

// Stereo ensemble chorus: dry + two modulated short delays panned L/R.
function chorus(tr, input, { mix = 0.45, depth = 0.0022, rates = [0.21, 0.33], times = [0.011, 0.018] } = {}) {
  const ctx = tr.ctx, out = ctx.createGain();
  input.connect(out);
  for (let i = 0; i < 2; i++) {
    const d = ctx.createDelay(0.05); d.delayTime.value = times[i];
    const l = ctx.createOscillator(); l.frequency.value = rates[i];
    const lg = ctx.createGain(); lg.gain.value = depth; l.connect(lg); lg.connect(d.delayTime);
    l.start(); tr.keep(l);
    const w = ctx.createGain(); w.gain.value = mix;
    const p = ctx.createStereoPanner(); p.pan.value = i ? 0.75 : -0.75;
    link(input, d, w, p, out);
  }
  return out;
}

class Inst {
  constructor(tr, o = {}) {
    this.tr = tr; this.ctx = tr.ctx; this.o = o; this.rng = tr.rng;
    const ctx = this.ctx;
    this.in = ctx.createGain(); this.in.gain.value = o.vol ?? 1;
    const last = this.build(this.in, o);
    this.panner = ctx.createStereoPanner(); this.panner.pan.value = o.pan ?? 0;
    last.connect(this.panner); this.panner.connect(tr.out);
    if (o.rev) { const s = ctx.createGain(); s.gain.value = o.rev; this.panner.connect(s); s.connect(tr.rev); }
  }
  build(n) { return n; }
  // schedulable? (not skipped/late/solo-muted); also records the note for the lab's piano roll
  live(t, m = 0, d = 0, v = 0) {
    const so = this.tr.eng.solo;
    const ok = !this.tr.silent && t > this.ctx.currentTime - 0.01 && (!so || so.includes(this.o.name));
    if (ok && this.tr.log) this.tr.log.push([this.o.name, +t.toFixed(3), m, +d.toFixed(3), +v.toFixed(2)]);
    return ok;
  }
  vib(t, end, rate, depth, delay = 0, type = 'sine') {
    const ctx = this.ctx, l = ctx.createOscillator(), g = ctx.createGain();
    l.type = type; l.frequency.value = rate * (0.93 + 0.14 * this.rng.next());
    if (delay > 0) { g.gain.setValueAtTime(0, t); g.gain.setValueAtTime(0, t + delay); g.gain.linearRampToValueAtTime(depth, t + delay + 0.5); } else g.gain.value = depth;
    l.connect(g);
    l.start(Math.max(ctx.currentTime, t - this.rng.next() * 0.2)); l.stop(end); this.tr.reg(l, end);
    return g;
  }
  osc(type, f, t, end, dest, detune = 0) {
    const o = this.ctx.createOscillator();
    if (typeof type === 'string') o.type = type; else o.setPeriodicWave(type);
    o.frequency.value = f; o.detune.value = detune; o.connect(dest); o.start(t); o.stop(end); this.tr.reg(o, end);
    return o;
  }
  noise(t, end, dest, color = 'white', rate = 1) {
    const s = this.ctx.createBufferSource(), b = this.tr.a.noise[color];
    s.buffer = b; s.loop = true; s.playbackRate.value = rate; s.connect(dest);
    s.start(t, this.rng.next() * (b.duration - 0.2)); s.stop(end); this.tr.reg(s, end);
    return s;
  }
  gainNode(v = 0, dest = this.in) { const g = this.ctx.createGain(); g.gain.value = v; if (dest) g.connect(dest); return g; }
}

// ---------------------------------------------------------------- strings
// art: 'legato' (pad/long), 'spicc' (short bowed ostinato), 'trem' (tremolo), 'pizz' (Karplus-Strong pluck)
export class Strings extends Inst {
  constructor(tr, o = {}) { super(tr, { pan: -0.2, rev: 0.35, ...o }); this.bright = o.bright ?? 1; this.voices = o.voices ?? 3; this.scale = o.scale ?? 0.075; }
  build(n, o) {
    const ctx = this.ctx;
    const last = link(n, biq(ctx, 'highpass', o.hp ?? 60, 0.7), biq(ctx, 'peaking', o.body ?? 260, 1.1, 2), biq(ctx, 'peaking', 3200, 1.0, -1.5), biq(ctx, 'highshelf', 8000, 0.7, -3.5));
    return o.chorus === false ? last : chorus(this.tr, last, { mix: 0.4 });
  }
  note(t, m, dur, vel = 0.6, o = {}) {
    if (!this.live(t, m, dur, vel)) return;
    const ctx = this.ctx, f = mtof(m), art = o.art || this.o.art || 'legato';
    if (art === 'pizz') return this.pizz(t, m, vel);
    const out = this.gainNode(0);
    let head = out;
    const bright = this.bright * (o.bright ?? 1);
    const cBase = clamp(f * 2.2, 380, 9000), cPeak = clamp(f * (3.2 + 10 * vel * bright), 1100, 14000);
    const lp = biq(ctx, 'lowpass', cBase, 0.6);
    const pk = vel * this.scale * (o.gain ?? 1);
    let end;
    if (art === 'spicc') {
      const a = 0.007, d = Math.max(0.16, o.d ?? 0.2);
      const pS = pk * 1.45; // single oscillator vs the 2-saw version
      out.gain.setValueAtTime(0, t); out.gain.linearRampToValueAtTime(pS * 3, t + a); out.gain.setTargetAtTime(pS * 1.2, t + a, 0.03); out.gain.setTargetAtTime(0, t + a + 0.05, d / 3.2);
      lp.frequency.value = Math.min(14000, cPeak * 1.1); // static filter (a ~0.1 s note needs no filter envelope)
      end = t + a + d * 1.8;
      // bow scratch transient (skipped on very short 16ths: inaudible there, saves nodes in dense ostinati)
      if (dur > 0.14) {
        const bn = this.gainNode(0, out); const bp = biq(ctx, 'bandpass', clamp(f * 6, 1500, 5000), 1.2); bp.connect(bn);
        bn.gain.setValueAtTime(0, t); bn.gain.linearRampToValueAtTime(pk * 0.5, t + 0.004); bn.gain.setTargetAtTime(0, t + 0.004, 0.012);
        this.noise(t, t + 0.08, bp);
      }
    } else {
      const a = o.a ?? clamp(0.12 + (1 - vel) * 0.45, 0.05, 1.5), r = o.r ?? 0.6, hold = Math.max(a, dur);
      out.gain.setValueAtTime(0, t);
      if (o.swell) { out.gain.linearRampToValueAtTime(pk * 0.45, t + a); out.gain.linearRampToValueAtTime(pk, t + hold * 0.62); out.gain.linearRampToValueAtTime(pk * 0.75, t + hold); }
      else { out.gain.linearRampToValueAtTime(pk, t + a); out.gain.linearRampToValueAtTime(pk * 0.88, t + hold); }
      out.gain.setTargetAtTime(0, t + hold, r / 3.5);
      lp.frequency.setValueAtTime(cBase, t); lp.frequency.linearRampToValueAtTime(cPeak, t + a); lp.frequency.setTargetAtTime(cPeak * 0.8, t + a, 0.6);
      lp.frequency.setTargetAtTime(cBase, t + hold, r / 2.5);
      end = t + hold + r * 1.6;
      if (art === 'trem') {
        const tg = this.gainNode(0.55, out); head = tg;
        this.vib(t, end, o.tremRate ?? 13, 0.45, 0, 'triangle').connect(tg.gain);
      }
    }
    lp.connect(head);
    const lite = this.tr.a.lite, spicc = art === 'spicc';
    // spiccato notes are ~0.1 s: one oscillator and no sheen/vibrato are perceptually equivalent and ~half the nodes
    const sheen = spicc || lite ? null : biq(ctx, 'highpass', clamp(f * 6, 2500, 9000), 0.6);
    if (sheen) sheen.connect(this.gainNode(0.22 * (this.o.sheen ?? 1) * bright, head));
    const vg = spicc ? null : this.vib(t, end, 5.3, 7, 0.25);
    const n = spicc ? 1 : Math.min(lite ? 2 : 3, o.voices ?? this.voices);
    for (let i = 0; i < n; i++) { const osc = this.osc('sawtooth', f, t, end, lp, (spicc ? this.rng.range(-8, 8) : DET[i] + this.rng.range(-3, 3))); if (sheen) osc.connect(sheen); if (vg) vg.connect(osc.detune); }
    return end;
  }
  pizz(t, m, vel) {
    const f = mtof(m), buf = this.tr.a.ks(f, { t60: clamp(1.4 - (m - 36) * 0.02, 0.35, 1.2), bright: 0.25, pos: 0.25, shape: 0.35 });
    const g = this.gainNode(vel * this.scale * 3.2);
    const s = this.ctx.createBufferSource(); s.buffer = buf; s.connect(g); s.start(t); this.tr.reg(s, t + buf.duration);
  }
}

// ---------------------------------------------------------------- choir (formant bank on the bus)
export class Choir extends Inst {
  constructor(tr, o = {}) { super(tr, { pan: 0, rev: 0.5, ...o }); this.scale = o.scale ?? 0.2; }
  build(n, o) {
    const ctx = this.ctx, sum = ctx.createGain();
    const v = VOWEL[o.vowel || 'ah'];
    this.fb = [...v, 3400].map((f, i) => {
      const bp = biq(ctx, 'bandpass', f, [5, 7, 9, 10][i]); const g = ctx.createGain(); g.gain.value = [1, 0.55, 0.3, 0.14][i];
      link(n, bp, g, sum); return bp;
    });
    link(n, biq(ctx, 'lowpass', 380, 0.7), (() => { const g = ctx.createGain(); g.gain.value = 0.3; return g; })(), sum);
    return chorus(this.tr, link(sum, biq(ctx, 'highpass', 90, 0.7)), { mix: 0.5, depth: 0.003 });
  }
  setVowel(v, t, glide = 1.5) { VOWEL[v].forEach((f, i) => this.fb[i].frequency.setTargetAtTime(f, t, glide / 3)); }
  note(t, m, dur, vel = 0.6, o = {}) {
    if (!this.live(t, m, dur, vel)) return;
    const f = mtof(m), out = this.gainNode(0), pk = vel * this.scale * (o.gain ?? 1);
    let end;
    if (o.art === 'stacc') {
      out.gain.setValueAtTime(0, t); out.gain.linearRampToValueAtTime(pk * 1.2, t + 0.02); out.gain.setTargetAtTime(0, t + 0.05, 0.07);
      end = t + 0.45;
    } else {
      const a = o.a ?? 0.45, r = o.r ?? 0.9, hold = Math.max(a, dur);
      out.gain.setValueAtTime(0, t);
      if (o.swell) { out.gain.linearRampToValueAtTime(pk * 0.5, t + a); out.gain.linearRampToValueAtTime(pk, t + hold * 0.7); }
      else out.gain.linearRampToValueAtTime(pk, t + a);
      out.gain.setValueAtTime(o.swell ? pk : pk, t + hold);
      out.gain.setTargetAtTime(0, t + hold, r / 3.5);
      end = t + hold + r * 1.6;
    }
    const stacc = o.art === 'stacc', vg = stacc ? null : this.vib(t, end, 5.1, 10, 0.15);
    for (let i = 0; i < 2; i++) { const osc = this.osc('sawtooth', f, t, end, out, (i ? 7 : -8) + this.rng.range(-3, 3)); if (vg) vg.connect(osc.detune); }
    if (!stacc && !this.tr.a.lite) { const air = biq(this.ctx, 'bandpass', 7000, 0.8); air.connect(this.gainNode(0.12, out)); this.noise(t, end, air); }
    return end;
  }
}

// ---------------------------------------------------------------- horns & brass
export class Horn extends Inst {
  constructor(tr, o = {}) { super(tr, { pan: 0.25, rev: 0.45, ...o }); this.kind = o.kind || 'horn'; this.scale = o.scale ?? (this.kind === 'brass' ? 0.11 : 0.16); }
  build(n, o) {
    const ctx = this.ctx, brass = (o.kind || 'horn') === 'brass';
    let last = link(n, biq(ctx, 'peaking', brass ? 900 : 380, 1, brass ? 2 : 3), biq(ctx, 'lowpass', brass ? 7500 : 3600, 0.6), biq(ctx, 'highpass', 70, 0.7));
    if (brass) { const ws = ctx.createWaveShaper(); ws.curve = driveCurve(1.4); ws.oversample = '2x'; const pre = ctx.createGain(); pre.gain.value = 1.2; last = link(last, pre, ws); }
    return last;
  }
  note(t, m, dur, vel = 0.7, o = {}) {
    if (!this.live(t, m, dur, vel)) return;
    const ctx = this.ctx, f = mtof(m), brass = this.kind === 'brass', art = o.art || 'sus';
    const out = this.gainNode(0), pk = vel * this.scale * (o.gain ?? 1);
    const lp = biq(ctx, 'lowpass', f, brass ? 1.4 : 1.1); lp.connect(out);
    const a = o.a ?? (art === 'swell' ? dur * 0.7 : brass ? 0.025 : clamp(0.09 - vel * 0.05, 0.03, 0.12));
    const r = o.r ?? (brass ? 0.18 : 0.3);
    const hold = art === 'stab' ? Math.min(dur, 0.2) : Math.max(a, dur);
    const peakMul = brass ? 3 + 10 * vel : 2.2 + 5 * vel, susMul = brass ? 2.4 + 6 * vel : 1.8 + 3.4 * vel;
    lp.frequency.setValueAtTime(f * 1.1, t);
    lp.frequency.linearRampToValueAtTime(clamp(f * peakMul, 300, 14000), t + Math.max(0.02, a * (art === 'swell' ? 1 : 1.4)));
    lp.frequency.setTargetAtTime(clamp(f * susMul, 250, 12000), t + a * 1.4, 0.2);
    lp.frequency.setTargetAtTime(f * 1.1, t + hold, r / 2);
    out.gain.setValueAtTime(0, t);
    if (art === 'swell') { out.gain.linearRampToValueAtTime(pk, t + a); out.gain.setValueAtTime(pk, t + hold); }
    else if (art === 'stab') { out.gain.linearRampToValueAtTime(pk * 1.25, t + a); out.gain.setTargetAtTime(pk * 0.35, t + a, 0.06); }
    else { out.gain.linearRampToValueAtTime(pk, t + a); out.gain.linearRampToValueAtTime(pk * 0.85, t + a + 0.15); out.gain.setValueAtTime(pk * 0.85, t + hold); }
    out.gain.setTargetAtTime(0, t + hold, r / 3.5);
    const end = t + hold + r * 1.7;
    const vg = art === 'stab' ? null : this.vib(t, end, 5, brass ? 3 : 4.5, 0.3);
    for (const d of [-5, 5]) {
      const osc = this.osc('sawtooth', f, t, end, lp, d);
      osc.detune.setValueAtTime(d - (brass ? 18 : 28), t); osc.detune.linearRampToValueAtTime(d, t + 0.06);
      if (vg) vg.connect(osc.detune);
    }
    return end;
  }
}

// ---------------------------------------------------------------- woodwinds
const WAVES = {
  flute: [1, 0.32, 0.1, 0.05, 0.025, 0.012],
  oboe: [0.7, 1, 0.9, 0.62, 0.42, 0.3, 0.22, 0.15, 0.1, 0.07, 0.05, 0.03],
  clarinet: [1, 0.04, 0.55, 0.03, 0.32, 0.02, 0.18, 0.02, 0.1, 0.01, 0.05],
  recorder: [1, 0.13, 0.26, 0.05, 0.09, 0.02, 0.04],
  pad: [1, 0.4, 0.2, 0.1, 0.05, 0.03],
};
export class Wind extends Inst {
  // kind: flute | oboe | clarinet | recorder
  constructor(tr, o = {}) {
    super(tr, { pan: -0.1, rev: 0.4, ...o });
    this.kind = o.kind || 'flute'; this.wave = tr.a.wave(this.kind, WAVES[this.kind]);
    this.scale = o.scale ?? ({ flute: 0.22, oboe: 0.11, clarinet: 0.16, recorder: 0.2 })[this.kind];
    this.breath = ({ flute: 1, oboe: 0.25, clarinet: 0.35, recorder: 0.7 })[this.kind];
  }
  build(n, o) {
    const ctx = this.ctx, k = o.kind || 'flute';
    if (k === 'oboe') return link(n, biq(ctx, 'highpass', 230, 0.7), biq(ctx, 'peaking', 1150, 1.3, 5), biq(ctx, 'peaking', 2900, 2, 2), biq(ctx, 'lowpass', 6500, 0.7));
    if (k === 'clarinet') return link(n, biq(ctx, 'highpass', 150, 0.7), biq(ctx, 'peaking', 1500, 1, 2), biq(ctx, 'lowpass', 5000, 0.7));
    return link(n, biq(ctx, 'highpass', 220, 0.7), biq(ctx, 'peaking', 2600, 1, 1.5), biq(ctx, 'lowpass', 9000, 0.7));
  }
  note(t, m, dur, vel = 0.6, o = {}) {
    if (!this.live(t, m, dur, vel)) return;
    const ctx = this.ctx, f = mtof(m), out = this.gainNode(0), pk = vel * this.scale * (o.gain ?? 1);
    const a = o.a ?? (this.kind === 'oboe' ? 0.04 : 0.05), r = o.r ?? 0.12, hold = Math.max(a, dur - 0.02);
    out.gain.setValueAtTime(0, t); out.gain.linearRampToValueAtTime(pk, t + a);
    if (hold > 0.5) { out.gain.linearRampToValueAtTime(pk * 1.08, t + hold * 0.6); out.gain.linearRampToValueAtTime(pk * 0.9, t + hold); }
    else out.gain.setValueAtTime(pk, t + hold);
    out.gain.setTargetAtTime(0, t + hold, r / 3);
    const end = t + hold + r * 2;
    const vd = this.kind === 'recorder' ? 5 : this.kind === 'clarinet' ? 3 : 12;
    const vg = this.vib(t, end, this.kind === 'oboe' ? 5.6 : 5.1, vd, hold > 0.4 ? 0.22 : 10);
    const o1 = this.osc(this.wave, f, t, end, out); vg.connect(o1.detune);
    if (this.kind === 'oboe') { const o2 = this.osc(this.wave, f, t, end, this.gainNode(0.4, out), 5); vg.connect(o2.detune); }
    // breath: tuned noise band + attack chiff
    if (this.breath > 0) {
      const bg = this.gainNode(pk * 0.35 * this.breath, out); const bp = biq(ctx, 'bandpass', clamp(f * 2, 400, 9000), 2.5); bp.connect(bg);
      this.noise(t, end, bp);
      const cg = this.gainNode(0, out), hp = biq(ctx, 'highpass', 2200, 0.7); hp.connect(cg);
      cg.gain.setValueAtTime(0, t); cg.gain.linearRampToValueAtTime(pk * 0.6 * this.breath, t + 0.006); cg.gain.setTargetAtTime(0, t + 0.006, 0.02);
      this.noise(t, t + 0.12, hp);
    }
    return end;
  }
}

// ---------------------------------------------------------------- plucked (Karplus-Strong)
export class Harp extends Inst {
  constructor(tr, o = {}) { super(tr, { pan: -0.4, rev: 0.45, ...o }); this.scale = o.scale ?? 0.34; }
  build(n) { const ctx = this.ctx; return link(n, biq(ctx, 'peaking', 220, 1, 2), biq(ctx, 'lowpass', 7000, 0.7)); }
  note(t, m, dur, vel = 0.6, o = {}) {
    if (!this.live(t, m, dur, vel)) return;
    const f = mtof(m), buf = this.tr.a.ks(f, { t60: clamp(5.2 - (m - 40) * 0.075, 1.3, 4.5), bright: 0.55, pos: 0.13, shape: 0.25 });
    const g = this.gainNode(vel * this.scale * (o.gain ?? 1));
    const s = this.ctx.createBufferSource(); s.buffer = buf; s.connect(g);
    const end = o.damp ? t + dur + 0.1 : t + buf.duration;
    if (o.damp) { g.gain.setValueAtTime(vel * this.scale, t + dur); g.gain.linearRampToValueAtTime(0, t + dur + 0.1); }
    s.start(t); s.stop(end); this.tr.reg(s, end);
    return end;
  }
  gliss(t, notes, span = 0.6, vel = 0.4) { notes.forEach((m, i) => this.note(t + (i / notes.length) * span, m, 1, vel * (0.7 + 0.3 * i / notes.length))); }
}
export class Lute extends Inst {
  constructor(tr, o = {}) { super(tr, { pan: 0.15, rev: 0.25, ...o }); this.scale = o.scale ?? 0.28; }
  build(n) { const ctx = this.ctx; return link(n, biq(ctx, 'highpass', 85, 0.7), biq(ctx, 'peaking', 210, 1.8, 4), biq(ctx, 'peaking', 480, 1.5, 2), biq(ctx, 'peaking', 2400, 1.5, -2), biq(ctx, 'lowpass', 6000, 0.7)); }
  note(t, m, dur, vel = 0.6, o = {}) {
    if (!this.live(t, m, dur, vel)) return;
    const f = mtof(m), buf = this.tr.a.ks(f, { t60: clamp(2.4 - (m - 45) * 0.04, 0.8, 2.4), bright: 0.6, pos: 0.12, shape: 0.7 });
    const g = this.gainNode(vel * this.scale * (o.gain ?? 1));
    const end = t + Math.min(buf.duration, (o.let ?? 3));
    for (const [dt, det] of [[0, -4], [0.004, 4]]) {
      const s = this.ctx.createBufferSource(); s.buffer = buf; s.detune.value = det; s.connect(g); s.start(t + dt); s.stop(end); this.tr.reg(s, end);
    }
    return end;
  }
  strum(t, notes, vel = 0.5, { dir = 1, spread = 0.022 } = {}) {
    const ns = dir > 0 ? notes : notes.slice().reverse();
    ns.forEach((m, i) => this.note(t + i * spread, m, 1, vel * (i === 0 ? 1 : 0.85)));
  }
}

// ---------------------------------------------------------------- tuned percussion
const BELLS = {
  celesta: { p: [[1, 1, 1], [2, 0.28, 0.45], [3, 0.08, 0.3], [4.2, 0.05, 0.2]], d: 1.6, a: 0.003 },
  glock: { p: [[1, 1, 1], [2.76, 0.4, 0.5], [5.4, 0.18, 0.3], [8.93, 0.08, 0.2]], d: 2.4, a: 0.001 },
  tubular: { p: [[1, 1, 1], [2.02, 0.55, 0.75], [2.99, 0.4, 0.55], [4.16, 0.3, 0.4], [5.43, 0.12, 0.3]], d: 5, a: 0.002 },
};
export class Bells extends Inst {
  constructor(tr, o = {}) { super(tr, { pan: 0.3, rev: 0.5, ...o }); this.kind = o.kind || 'celesta'; this.scale = o.scale ?? 0.12; }
  build(n) { return link(n, biq(this.ctx, 'highpass', 200, 0.7)); }
  note(t, m, dur, vel = 0.5, o = {}) {
    if (!this.live(t, m, dur, vel)) return;
    const K = BELLS[this.kind], f = mtof(m), pk = vel * this.scale * (o.gain ?? 1);
    let end = t;
    for (const [ratio, amp, dm] of K.p) {
      if (f * ratio > 16000) continue;
      const g = this.gainNode(0), d = K.d * dm * (o.decay ?? 1);
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(pk * amp, t + K.a); g.gain.setTargetAtTime(0, t + K.a, d / 6.9);
      const e = t + K.a + d; this.osc('sine', f * ratio, t, e, g); if (e > end) end = e;
    }
    return end;
  }
}

// ---------------------------------------------------------------- soft synth pad (night / ambient textures)
export class Pad extends Inst {
  constructor(tr, o = {}) { super(tr, { pan: 0, rev: 0.55, ...o }); this.scale = o.scale ?? 0.1; this.wave = tr.a.wave('pad', WAVES.pad); }
  build(n) { return chorus(this.tr, link(n, biq(this.ctx, 'lowpass', 2600, 0.5)), { mix: 0.55, depth: 0.003 }); }
  note(t, m, dur, vel = 0.5, o = {}) {
    if (!this.live(t, m, dur, vel)) return;
    const f = mtof(m), out = this.gainNode(0), pk = vel * this.scale * (o.gain ?? 1);
    const a = o.a ?? 1.2, r = o.r ?? 1.8, hold = Math.max(a, dur);
    out.gain.setValueAtTime(0, t); out.gain.linearRampToValueAtTime(pk, t + a); out.gain.setValueAtTime(pk, t + hold); out.gain.setTargetAtTime(0, t + hold, r / 3.5);
    const end = t + hold + r * 1.6;
    const vg = this.vib(t, end, 0.3, 6);
    for (const d of [-6, 6]) { const osc = this.osc(this.wave, f, t, end, out, d); vg.connect(osc.detune); }
    return end;
  }
}

// ---------------------------------------------------------------- drums
export class Timpani extends Inst {
  constructor(tr, o = {}) { super(tr, { pan: 0.15, rev: 0.4, ...o }); this.scale = o.scale ?? 0.5; }
  build(n) { return link(n, biq(this.ctx, 'lowpass', 3000, 0.7), biq(this.ctx, 'highpass', 35, 0.7)); }
  hit(t, m, vel = 0.7, o = {}) {
    if (!this.live(t, m, 0.4, vel)) return;
    const ctx = this.ctx, f = mtof(m), pk = vel * this.scale, dec = (o.decay ?? 2.4) * (0.6 + 0.4 * vel);
    for (const [ratio, amp, dm] of [[1, 1, 1], [1.504, 0.42, 0.65], [1.742, 0.22, 0.5], [2.0, 0.28, 0.55], [2.245, 0.1, 0.4]]) {
      const g = this.gainNode(0), d = dec * dm;
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(pk * amp, t + 0.004); g.gain.setTargetAtTime(0, t + 0.004, d / 6.9);
      const osc = this.osc('sine', f * ratio, t, t + d, g);
      osc.frequency.setValueAtTime(f * ratio * 1.018, t); osc.frequency.exponentialRampToValueAtTime(f * ratio, t + 0.12);
    }
    const ng = this.gainNode(0), lp = biq(ctx, 'lowpass', 900, 0.7); lp.connect(ng);
    ng.gain.setValueAtTime(0, t); ng.gain.linearRampToValueAtTime(pk * 0.8, t + 0.002); ng.gain.setTargetAtTime(0, t + 0.002, 0.018);
    this.noise(t, t + 0.15, lp);
  }
  roll(t, m, dur, v0 = 0.1, v1 = 0.8, o = {}) {
    if (!this.live(t, m, dur, v1)) return;
    const ctx = this.ctx, f = mtof(m), end = t + dur + 0.6;
    const out = this.gainNode(0);
    out.gain.setValueAtTime(v0 * this.scale * 0.5, t); out.gain.linearRampToValueAtTime(v1 * this.scale * 0.5, t + dur); out.gain.setTargetAtTime(0, t + dur, 0.15);
    const am = this.gainNode(0.6, out); this.vib(t, end, 17, 0.4, 0, 'triangle').connect(am.gain);
    for (const [ratio, amp] of [[1, 1], [1.504, 0.4], [2, 0.25]]) this.osc('sine', f * ratio, t, end, this.gainNode(amp, am));
    const lp = biq(ctx, 'lowpass', 1100, 0.7); lp.connect(this.gainNode(0.5, am)); this.noise(t, end, lp);
    if (o.hit !== false) this.hit(t + dur, m, Math.min(1, v1 * 1.1));
  }
}
export class Taiko extends Inst {
  constructor(tr, o = {}) { super(tr, { pan: 0, rev: 0.32, ...o }); this.size = o.size || 'big'; this.scale = o.scale ?? (this.size === 'small' ? 0.45 : this.size === 'mid' ? 0.42 : 0.36); }
  build(n) {
    const ctx = this.ctx, ws = ctx.createWaveShaper(); ws.curve = driveCurve(1.3); ws.oversample = '2x';
    return link(n, biq(ctx, 'highpass', 40, 0.7), ws, biq(ctx, 'peaking', 2500, 1, 3));
  }
  hit(t, vel = 0.8, o = {}) {
    if (!this.live(t, this.size === 'big' ? 30 : this.size === 'small' ? 34 : 32, 0.12, vel)) return;
    const ctx = this.ctx, sz = this.size, p = (o.pitch ?? 1) * (0.97 + 0.06 * this.rng.next()), pk = vel * this.scale;
    const f0 = (sz === 'big' ? 160 : sz === 'small' ? 390 : 240) * p, f1 = (sz === 'big' ? 64 : sz === 'small' ? 190 : 100) * p;
    const dec = (sz === 'big' ? 1.1 : sz === 'small' ? 0.28 : 0.6) * (0.65 + 0.35 * vel);
    const g = this.gainNode(0); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(pk, t + 0.002); g.gain.setTargetAtTime(0, t + 0.002, dec / 6.9);
    const osc = this.osc('sine', f0, t, t + dec, g);
    osc.frequency.setValueAtTime(f0, t); osc.frequency.exponentialRampToValueAtTime(f1 * 1.06, t + 0.035); osc.frequency.exponentialRampToValueAtTime(f1, t + 0.3);
    if (sz !== 'small') { const g2 = this.gainNode(0); g2.gain.setValueAtTime(0, t); g2.gain.linearRampToValueAtTime(pk * 0.22, t + 0.002); g2.gain.setTargetAtTime(0, t + 0.002, dec * 0.35 / 6.9);
    this.osc('triangle', f1 * 1.58, t, t + dec * 0.4, g2); }
    const sg = this.gainNode(0), bp = biq(ctx, 'bandpass', sz === 'big' ? 330 : sz === 'small' ? 950 : 560, 1); bp.connect(sg);
    sg.gain.setValueAtTime(0, t); sg.gain.linearRampToValueAtTime(pk * 1.6, t + 0.001); sg.gain.setTargetAtTime(0, t + 0.001, 0.035);
    this.noise(t, t + 0.2, bp);
    const hg = this.gainNode(0), hp = biq(ctx, 'highpass', 1800, 0.7); hp.connect(hg);
    hg.gain.setValueAtTime(0, t); hg.gain.linearRampToValueAtTime(pk * (o.rim ? 1.1 : 0.55), t + 0.0008); hg.gain.setTargetAtTime(0, t + 0.0008, 0.008);
    this.noise(t, t + 0.05, hp);
  }
}
export class HandDrum extends Inst {
  // frame drum (hit), tambourine (tamb), shaker (shake)
  constructor(tr, o = {}) { super(tr, { pan: 0.1, rev: 0.2, ...o }); this.scale = o.scale ?? 0.4; }
  hit(t, vel = 0.7, o = {}) {
    if (!this.live(t, 30, 0.12, vel)) return;
    const ctx = this.ctx, pk = vel * this.scale, open = o.open !== false, dec = open ? 0.38 : 0.12;
    const g = this.gainNode(0); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(pk, t + 0.002); g.gain.setTargetAtTime(0, t + 0.002, dec / 6.9);
    const osc = this.osc('sine', 125, t, t + dec, g); osc.frequency.setValueAtTime(125, t); osc.frequency.exponentialRampToValueAtTime(84, t + 0.12);
    const sg = this.gainNode(0), bp = biq(ctx, 'bandpass', open ? 650 : 1100, 0.9); bp.connect(sg);
    sg.gain.setValueAtTime(0, t); sg.gain.linearRampToValueAtTime(pk * 0.7, t + 0.001); sg.gain.setTargetAtTime(0, t + 0.001, 0.02);
    this.noise(t, t + 0.15, bp);
  }
  tamb(t, vel = 0.5) {
    if (!this.live(t, 98, 0.08, vel)) return;
    const ctx = this.ctx, pk = vel * this.scale * 0.8;
    for (const [f, q, d] of [[7400, 2.5, 0.16], [10500, 3, 0.1]]) {
      const g = this.gainNode(0), bp = biq(ctx, 'bandpass', f, q); bp.connect(g);
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(pk, t + 0.002); g.gain.setTargetAtTime(0, t + 0.002, d / 6.9);
      this.noise(t, t + d + 0.02, bp);
    }
  }
  shake(t, vel = 0.4) {
    if (!this.live(t, 97, 0.05, vel)) return;
    const pk = vel * this.scale * 0.5, g = this.gainNode(0), bp = biq(this.ctx, 'bandpass', 6500, 1.2); bp.connect(g);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(pk, t + 0.025); g.gain.setTargetAtTime(0, t + 0.03, 0.02);
    this.noise(t, t + 0.15, bp);
  }
}
export class Cymbal extends Inst {
  constructor(tr, o = {}) { super(tr, { pan: -0.15, rev: 0.4, ...o }); this.scale = o.scale ?? 0.14; }
  build(n) { return link(n, biq(this.ctx, 'highpass', 300, 0.7)); }
  crash(t, vel = 0.7) {
    if (!this.live(t, 99, 1, vel)) return;
    const ctx = this.ctx, pk = vel * this.scale;
    for (const [type, f, q, d, v] of [['highpass', 3800, 0.7, 2.6, 1], ['bandpass', 5200, 1.4, 0.9, 0.8], ['bandpass', 9000, 1.2, 1.6, 0.6]]) {
      const g = this.gainNode(0), fl = biq(ctx, type, f, q); fl.connect(g);
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(pk * v, t + 0.003); g.gain.setTargetAtTime(0, t + 0.003, d / 6.9);
      this.noise(t, t + d + 0.05, fl);
    }
  }
  swell(t, dur = 2, vel = 0.6) {
    if (!this.live(t, 99, dur, vel)) return;
    const pk = vel * this.scale, g = this.gainNode(0), hp = biq(this.ctx, 'highpass', 2000, 0.7); hp.connect(g);
    hp.frequency.setValueAtTime(1800, t); hp.frequency.exponentialRampToValueAtTime(5000, t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(pk, t + dur); g.gain.linearRampToValueAtTime(0, t + dur + 0.03);
    this.noise(t, t + dur + 0.05, hp);
  }
}
