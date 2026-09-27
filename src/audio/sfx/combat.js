// Combat & spell sounds. Bus 'sfx' (spatial when pos given).
import { METAL, CHIME, TUBE } from '../kit.js';
import { whoosh, choir, mtof } from './common.js';

const crackles = (k, n, t0, t1, vol = 0.2, dest = k.out) => {
  for (let i = 0; i < n; i++) {
    const t = t0 + (t1 - t0) * k.rnd();
    k.nz({ t, type: 'bandpass', f: k.rnd(1800, 6000), q: 2.2, a: 0.0004, d: k.rnd(0.006, 0.022), vol: vol * k.rnd(0.4, 1), dest });
  }
};

export const COMBAT = {
  swing: {
    max: 6, gain: 1, range: 35, rev: 0.12,
    fn: (k) => {
      const d = k.vary(0.24, 0.12), f = k.vary(1, 0.15);
      whoosh(k, { dur: d, f0: 600 * f, fPeak: 2300 * f, f1: 700 * f, q: 1.3, vol: 0.5, peakAt: 0.42 });
      whoosh(k, { dur: d * 1.1, f0: 250 * f, fPeak: 700 * f, f1: 250 * f, q: 0.9, vol: 0.22, color: 'pink' });
    },
  },
  swingHeavy: {
    max: 4, gain: 1, range: 40, rev: 0.12,
    fn: (k) => {
      const d = k.vary(0.4, 0.1), f = k.vary(1, 0.1);
      whoosh(k, { dur: d, f0: 300 * f, fPeak: 1300 * f, f1: 450 * f, q: 1.1, vol: 0.55, peakAt: 0.45 });
      whoosh(k, { dur: d * 1.1, f0: 120 * f, fPeak: 320 * f, f1: 120 * f, q: 0.8, vol: 0.4, color: 'brown' });
      k.tone({ fc: [[0, 700 * f], [d * 0.45, 1250 * f], [d, 600 * f]], env: [[0, 0], [d * 0.45, 1], [d, 0]], vol: 0.015 });
    },
  },
  hitFlesh: {
    clip: 1.5, max: 5, gain: 1, range: 40, rev: 0.1,
    fn: (k) => {
      const p = k.vary(1, 0.12);
      k.thump({ f0: 190 * p, f1: 82 * p, sweep: 0.05, d: 0.16, vol: 0.36 });
      k.nz({ color: 'pink', type: 'bandpass', f: 1400 * p, q: 0.9, a: 0.0008, d: 0.05, vol: 0.3 });
      k.nz({ type: 'lowpass', f: 1800 * p, q: 0.7, a: 0.002, d: 0.08, vol: 0.32 });
      k.nz({ color: 'pink', type: 'bandpass', f: 650 * p, q: 1.6, a: 0.002, d: 0.14, vol: 0.4 });
      k.nz({ t: 0.01, type: 'bandpass', f: 2500 * p, q: 2, a: 0.001, d: 0.03, vol: 0.15 });
    },
  },
  hitArmor: {
    clip: 1.6, max: 5, gain: 1, range: 45, rev: 0.14,
    fn: (k) => {
      const p = k.vary(1, 0.08);
      k.bell({ f: 480 * p, vol: 0.12, d: 0.4, partials: METAL, spread: 0.03 });
      k.bell({ f: 1210 * p, vol: 0.06, d: 0.25, partials: [[1, 1, 1], [1.73, 0.6, 0.7], [2.9, 0.4, 0.5]] });
      k.nz({ type: 'highpass', f: 3000, a: 0.0015, d: 0.06, vol: 0.22 });
      k.thump({ f0: 170, f1: 75, sweep: 0.04, d: 0.12, vol: 0.22 });
      k.nz({ type: 'bandpass', f: 1200, q: 1.2, d: 0.06, vol: 0.2 });
    },
  },
  crit: {
    clip: 2, clipIn: 1.6, max: 3, gain: 1, range: 50, rev: 0.14, pri: 2,
    fn: (k) => {
      COMBAT.hitFlesh.fn(k.sub(0, k.gain(0.9)));
      k.nz({ type: 'highpass', f: 2200, a: 0.0015, d: 0.045, vol: 0.3 });
      k.thump({ f0: 130, f1: 58, sweep: 0.08, d: 0.34, vol: 0.3 });
      k.nz({ color: 'pink', type: 'bandpass', f: 260, q: 0.9, a: 0.001, d: 0.2, vol: 0.4 });
      k.bell({ t: 0.005, f: 3200, vol: 0.05, d: 0.3, partials: METAL, spread: 0.02 });
      k.nz({ t: 0.02, type: 'bandpass', f: 1400, q: 3, d: 0.05, vol: 0.25 });
    },
  },
  block: {
    clip: 1.6, max: 4, gain: 1, range: 40, rev: 0.12,
    fn: (k) => {
      k.thump({ f0: 230, f1: 110, sweep: 0.03, d: 0.14, vol: 0.34 });
      k.nz({ type: 'bandpass', f: 900, q: 1.8, a: 0.0015, d: 0.1, vol: 0.34 });
      k.bell({ f: 640, vol: 0.05, d: 0.25, partials: [[1, 1, 1], [2.56, 0.6, 0.6], [4.1, 0.3, 0.4]] });
      k.nz({ type: 'highpass', f: 2500, d: 0.02, vol: 0.2 });
    },
  },
  parry: {
    clip: 1.3, max: 4, gain: 1, range: 40, rev: 0.15,
    fn: (k) => {
      const p = k.vary(1, 0.06);
      for (const [f, v, d] of [[2400, 0.07, 0.45], [3120, 0.06, 0.4], [4710, 0.05, 0.3], [6230, 0.04, 0.22]]) k.tone({ f: f * p, f1: f * p * 0.985, a: 0.001, d, vol: v });
      k.nz({ type: 'bandpass', f: 5200, f1: 3000, q: 3, a: 0.002, d: 0.14, vol: 0.3 });
      k.nz({ type: 'highpass', f: 3000, a: 0.0015, d: 0.025, vol: 0.18 });
      k.thump({ f0: 300, f1: 160, sweep: 0.02, d: 0.05, vol: 0.15 });
    },
  },
  bowShot: {
    clip: 1.4, max: 4, gain: 1, range: 40, rev: 0.1,
    fn: (k) => {
      k.pluck({ f: k.vary(98, 0.05), vol: 0.5, t60: 0.28, bright: 0.2, shape: 0.2 });
      k.thump({ f0: 140, f1: 90, sweep: 0.05, d: 0.12, vol: 0.2, type: 'triangle' });
      whoosh(k, { t: 0.02, dur: 0.22, f0: 3500, fPeak: 2800, f1: 1400, q: 1.5, vol: 0.18, peakAt: 0.15 });
      k.nz({ type: 'highpass', f: 2000, d: 0.02, vol: 0.2 });
    },
  },
  arrowHit: {
    clip: 2, max: 4, gain: 1, range: 40, rev: 0.1,
    fn: (k) => {
      k.nz({ type: 'bandpass', f: 700, q: 1.5, a: 0.0015, d: 0.07, vol: 0.36 });
      k.thump({ f0: 240, f1: 120, sweep: 0.03, d: 0.09, vol: 0.27 });
      const am = k.gain(0.5); k.lfo(0, 0.35, 31, 0.5, am.gain, 'triangle');
      k.tone({ type: 'triangle', f: 95, a: 0.002, d: 0.3, vol: 0.14, dest: am });
      k.nz({ type: 'highpass', f: 3000, d: 0.015, vol: 0.25 });
    },
  },
  castStartFire: {
    max: 3, gain: 1, range: 40, rev: 0.12,
    fn: (k) => {
      k.nz({ color: 'brown', type: 'bandpass', fc: [[0, 250], [0.5, 1300], [0.8, 900]], q: 0.8, env: [[0, 0], [0.35, 1], [0.8, 0]], vol: 0.6 });
      k.nz({ type: 'bandpass', fc: [[0, 800], [0.5, 3000]], q: 1, env: [[0, 0], [0.4, 1], [0.8, 0]], vol: 0.15 });
      crackles(k, 10, 0.1, 0.7, 0.25);
      const g = k.gain(0), lp = k.filter('lowpass', 700, 1, g);
      for (const f of [110, 165.5]) { const o = k.osc('sawtooth', f, 0, 0.85, lp); o.frequency.setValueAtTime(f * k.r, k.at(0)); o.frequency.linearRampToValueAtTime(f * 1.35 * k.r, k.at(0.7)); }
      k.envPts(g.gain, [[0, 0], [0.3, 0.1], [0.8, 0]]);
      return 0.85;
    },
  },
  castStartFrost: {
    max: 3, gain: 1, range: 40, rev: 0.16,
    fn: (k) => {
      const set = [2217, 2637, 2960, 3520, 3951, 4699, 5274];
      for (let i = 0; i < 7; i++) k.bell({ t: 0.05 + i * 0.09 + k.rnd(0, 0.03), f: k.pick(set) * k.vary(1, 0.01), vol: 0.05, d: 0.7, a: 0.01, partials: [[1, 1, 1], [2.4, 0.4, 0.5], [3.9, 0.2, 0.3]] });
      k.nz({ type: 'highpass', f: 5000, env: [[0, 0], [0.4, 1], [0.85, 0]], vol: 0.12 });
      k.nz({ type: 'bandpass', fc: [[0, 1800], [0.7, 4200]], q: 4, env: [[0, 0], [0.45, 1], [0.85, 0]], vol: 0.12 });
      k.tone({ fc: [[0, 700], [0.7, 1500]], env: [[0, 0], [0.4, 1], [0.85, 0]], vol: 0.05 });
      return 0.9;
    },
  },
  castStartHoly: {
    max: 3, gain: 1, range: 40, rev: 0.1, hall: 0.2,
    fn: (k) => {
      choir(k, { notes: [57, 61, 64, 69], dur: 0.5, a: 0.3, r: 0.4, vol: 0.06, vowel: 'ah' });
      k.bell({ t: 0.25, f: mtof(88), vol: 0.06, d: 1.0, partials: CHIME });
      k.bell({ t: 0.35, f: mtof(93), vol: 0.05, d: 0.9, partials: CHIME });
      k.nz({ type: 'highpass', f: 6000, env: [[0, 0], [0.5, 1], [0.95, 0]], vol: 0.08 });
      k.sparkle({ t: 0.2, dur: 0.6, n: 6, notes: [81, 85, 88, 93].map(mtof), vol: 0.03 });
      return 1.0;
    },
  },
  castStartShadow: {
    max: 3, gain: 1, range: 40, rev: 0.15,
    fn: (k) => {
      const g = k.gain(0), lp = k.filter('lowpass', 200, 1.5, g);
      lp.frequency.setValueAtTime(200 * k.r, k.at(0)); lp.frequency.exponentialRampToValueAtTime(750 * k.r, k.at(0.6));
      k.osc('sawtooth', 55, 0, 1.0, lp); k.osc('sawtooth', 58.3, 0, 1.0, lp); k.osc('sawtooth', 82.4, 0, 1.0, lp);
      k.envPts(g.gain, [[0, 0], [0.45, 0.3], [0.95, 0]]);
      const fl = k.gain(0.6); k.lfo(0, 1.0, 7, 0.4, fl.gain);
      k.nz({ type: 'bandpass', fc: [[0, 1500], [0.9, 500]], q: 3, env: [[0, 0], [0.5, 1], [0.9, 0]], vol: 0.3, dest: fl });
      k.tone({ f: 311, env: [[0, 0], [0.5, 1], [0.95, 0]], vol: 0.03 });
      k.tone({ f: 330, env: [[0, 0], [0.5, 1], [0.95, 0]], vol: 0.03 });
      k.nz({ color: 'brown', type: 'lowpass', f: 200, env: [[0, 0], [0.5, 1], [0.95, 0]], vol: 0.3 });
      return 1.0;
    },
  },
  // Magical hum while casting — use with loop().
  castLoop: {
    loop: { dur: 4, xf: 0.6 }, max: 3, gain: 1, range: 30, rev: 0.1,
    fn: (k, o) => {
      const D = o.dur ?? 2, env = o.loop ? [[0, 1], [D, 1]] : [[0, 0], [0.2, 1], [D - 0.3, 1], [D, 0]];
      const main = k.gain(0); k.envPts(main.gain, env);
      const am = k.gain(0.8, main); k.lfo(0, D, 0.5, 0.15, am.gain);
      const lp = k.filter('lowpass', 2400, 0.7, am);
      for (const [f, v] of [[220, 0.16], [220.7, 0.12], [330.4, 0.08], [441.3, 0.06], [661, 0.035], [880.6, 0.02]]) k.osc('sine', f, 0, D, k.gain(v, lp));
      const sh = k.gain(0.3, main); k.lfo(0, D, 3.1, 0.15, sh.gain);
      k.noiseSrc(0, D, k.filter('bandpass', 3200, 6, sh));
      return D;
    },
  },
  fireballLaunch: {
    max: 3, gain: 1, range: 45, rev: 0.12,
    fn: (k) => {
      k.nz({ color: 'brown', type: 'lowpass', fc: [[0, 1500], [0.5, 400]], q: 0.8, a: 0.01, d: 0.55, vol: 0.7 });
      whoosh(k, { dur: 0.4, f0: 2500, fPeak: 1800, f1: 500, q: 1, vol: 0.3, peakAt: 0.1 });
      k.thump({ f0: 130, f1: 70, sweep: 0.08, d: 0.2, vol: 0.35 });
      crackles(k, 6, 0, 0.4, 0.2);
    },
  },
  fireImpact: {
    clip: 1.5, max: 3, gain: 1, range: 60, rev: 0.16, pri: 2,
    fn: (k) => {
      k.thump({ f0: 120, f1: 50, sweep: 0.12, d: 0.55, vol: 0.5 });
      k.nz({ color: 'pink', type: 'bandpass', f: 320, q: 0.8, a: 0.002, d: 0.35, vol: 0.4 });
      k.nz({ color: 'pink', type: 'lowpass', fc: [[0, 3500], [0.6, 220]], q: 0.7, a: 0.003, d: 0.9, vol: 0.55 });
      k.nz({ type: 'highpass', f: 2500, a: 0.0015, d: 0.06, vol: 0.22 });
      for (let i = 0; i < 16; i++) { const t = 0.05 + Math.pow(k.rnd(), 1.5) * 1.0; k.nz({ t, type: 'bandpass', f: k.rnd(1500, 5000), q: 2, a: 0.0005, d: k.rnd(0.008, 0.025), vol: k.rnd(0.08, 0.25) * (1.1 - t) }); }
      k.nz({ t: 0.05, color: 'brown', type: 'lowpass', f: 500, a: 0.1, d: 1.0, vol: 0.25 });
      return 1.3;
    },
  },
  frostImpact: {
    clip: 1.6, max: 3, gain: 1, range: 55, rev: 0.18, pri: 2,
    fn: (k) => {
      k.thump({ f0: 150, f1: 70, sweep: 0.05, d: 0.12, vol: 0.24 });
      k.nz({ type: 'bandpass', f: 4000, q: 0.7, a: 0.0015, d: 0.14, vol: 0.34 });
      k.nz({ type: 'highpass', f: 1500, a: 0.0015, d: 0.035, vol: 0.2 });
      for (let i = 0; i < 22; i++) { const t = Math.pow(k.rnd(), 2) * 0.35; k.tone({ t, f: k.rnd(2500, 9500), a: 0.0005, d: k.rnd(0.04, 0.25), vol: k.rnd(0.02, 0.05) }); }
      k.nz({ type: 'highpass', f: 6500, a: 0.01, d: 0.6, vol: 0.1 });
      return 0.9;
    },
  },
  arcaneMissile: {
    max: 5, gain: 1, range: 40, rev: 0.12, burst: 3,
    fn: (k) => {
      const p = k.vary(1, 0.06);
      k.tone({ f: 1400 * p, f1: 480 * p, sweep: 0.2, a: 0.002, d: 0.25, vol: 0.22 });
      k.tone({ type: 'triangle', f: 2800 * p, f1: 950 * p, sweep: 0.18, a: 0.002, d: 0.2, vol: 0.08 });
      k.nz({ type: 'bandpass', f: 6000, q: 2, a: 0.001, d: 0.1, vol: 0.12 });
      k.tone({ type: 'square', f: 220 * p, f1: 110 * p, a: 0.001, d: 0.08, vol: 0.03 });
    },
  },
  holySmite: {
    max: 3, gain: 1, range: 50, rev: 0.12, hall: 0.2, pri: 2,
    fn: (k) => {
      whoosh(k, { dur: 0.1, f0: 5000, fPeak: 3500, f1: 1200, q: 1, vol: 0.22, peakAt: 0.7 });
      const T = 0.08;
      k.bell({ t: T, f: mtof(84), vol: 0.14, d: 1.2, partials: TUBE });
      k.bell({ t: T, f: mtof(91), vol: 0.07, d: 1.0, partials: CHIME });
      choir(k.sub(T), { notes: [60, 64, 67, 72], dur: 0.15, a: 0.02, r: 0.5, vol: 0.05, vowel: 'ah' });
      k.thump({ t: T, f0: 160, f1: 60, sweep: 0.06, d: 0.25, vol: 0.4 });
      k.nz({ t: T, type: 'highpass', f: 5000, a: 0.002, d: 0.5, vol: 0.12 });
      return 1.3;
    },
  },
  heal: {
    max: 3, gain: 1, range: 40, rev: 0.1, hall: 0.2,
    fn: (k) => {
      [72, 76, 79, 84, 88].forEach((m, i) => k.pluck({ t: i * 0.07, f: mtof(m), vol: 0.22, t60: 1.4, bright: 0.35, shape: 0.25 }));
      for (const m of [60, 64, 67]) k.tone({ type: 'triangle', f: mtof(m), env: [[0, 0], [0.25, 1], [0.8, 0.5], [1.3, 0]], vol: 0.04, vib: [5, 5] });
      k.sparkle({ t: 0.25, dur: 0.9, n: 10, notes: [84, 88, 91, 96].map(mtof), vol: 0.03 });
      k.nz({ type: 'highpass', f: 5000, env: [[0, 0], [0.3, 1], [1.2, 0]], vol: 0.05 });
      return 1.5;
    },
  },
  shield: {
    max: 3, gain: 1, range: 40, rev: 0.12,
    fn: (k) => {
      const g = k.gain(0), lp = k.filter('lowpass', 200, 7, g);
      lp.frequency.setValueAtTime(200 * k.r, k.at(0)); lp.frequency.exponentialRampToValueAtTime(2600 * k.r, k.at(0.35)); lp.frequency.exponentialRampToValueAtTime(900 * k.r, k.at(0.8));
      k.osc('sawtooth', 110, 0, 0.9, lp); k.osc('sawtooth', 165, 0, 0.9, lp, 5);
      k.envPts(g.gain, [[0, 0], [0.03, 0.18], [0.5, 0.12], [0.85, 0]]);
      k.tone({ f: 1320, a: 0.08, d: 0.7, vol: 0.05 }); k.tone({ f: 1980, a: 0.1, d: 0.6, vol: 0.035 });
      k.thump({ f0: 90, f1: 170, sweep: 0.15, d: 0.25, vol: 0.3 });
      return 0.95;
    },
  },
  nova: {
    clip: 1.4, max: 2, gain: 1, range: 55, rev: 0.16, pri: 2,
    fn: (k) => {
      k.thump({ f0: 140, f1: 62, sweep: 0.09, d: 0.3, vol: 0.45 });
      k.nz({ type: 'bandpass', fc: [[0, 400], [0.25, 4500]], q: 0.8, a: 0.005, d: 0.6, vol: 0.4 });
      k.nz({ type: 'highpass', f: 5000, a: 0.02, d: 0.8, vol: 0.12 });
      for (let i = 0; i < 12; i++) k.tone({ t: k.rnd(0.02, 0.4), f: k.rnd(3000, 8000), a: 0.0005, d: k.rnd(0.05, 0.2), vol: 0.03 });
      k.nz({ color: 'brown', type: 'lowpass', f: 400, a: 0.005, d: 0.4, vol: 0.3 });
      return 1.0;
    },
  },
  charge: {
    clip: 1.4, max: 2, gain: 1, range: 50, rev: 0.12,
    fn: (k) => {
      k.nz({ type: 'bandpass', fc: [[0, 350], [0.45, 1800]], q: 0.9, env: [[0, 0], [0.4, 1], [0.5, 0.3], [0.7, 0]], vol: 0.4 });
      k.nz({ color: 'brown', type: 'lowpass', f: 220, env: [[0, 0], [0.35, 1], [0.55, 0]], vol: 0.4 });
      k.thump({ t: 0.45, f0: 190, f1: 55, sweep: 0.06, d: 0.25, vol: 0.55 });
      k.nz({ t: 0.45, type: 'lowpass', f: 1500, d: 0.08, vol: 0.4 });
      k.nz({ t: 0.45, color: 'pink', type: 'lowpass', f: 600, a: 0.005, d: 0.4, vol: 0.2 });
      return 0.9;
    },
  },
  thunderClap: {
    clip: 1.5, max: 2, gain: 1, range: 70, rev: 0.18, pri: 2,
    fn: (k) => {
      k.thump({ f0: 100, f1: 46, sweep: 0.15, d: 1.0, vol: 0.55 });
      k.nz({ color: 'pink', type: 'bandpass', f: 180, q: 0.8, a: 0.002, d: 0.6, vol: 0.5 });
      k.nz({ type: 'highpass', f: 1500, a: 0.0015, d: 0.07, vol: 0.32 });
      const rg = k.gain(0.7); k.wobble(0, 1.8, 14, 0.3, rg.gain);
      k.nz({ color: 'brown', type: 'bandpass', f: 140, q: 0.7, a: 0.02, d: 1.6, vol: 0.55, dest: rg });
      k.nz({ type: 'bandpass', f: 320, q: 1, a: 0.001, d: 0.35, vol: 0.4 });
      k.nz({ color: 'pink', type: 'bandpass', f: 1200, q: 0.6, a: 0.002, d: 0.3, vol: 0.2 });
      return 1.8;
    },
  },
  whirlwind: {
    max: 2, gain: 1, range: 45, rev: 0.12,
    fn: (k) => {
      const p = k.pan(0); k.lfo(0, 1.3, 3.2, 0.7, p.pan);
      for (const [t, d] of [[0, 0.28], [0.24, 0.26], [0.45, 0.24], [0.64, 0.24], [0.83, 0.3]]) whoosh(k, { t, dur: d, f0: 500, fPeak: 2000, f1: 600, q: 1.2, vol: 0.4, dest: p });
      k.nz({ color: 'brown', type: 'lowpass', f: 300, env: [[0, 0], [0.3, 1], [1.0, 1], [1.2, 0]], vol: 0.25 });
      return 1.25;
    },
  },
  execute: {
    clip: 2, clipIn: 1.6, max: 2, gain: 1, range: 50, rev: 0.14, pri: 2,
    fn: (k) => {
      COMBAT.swingHeavy.fn(k);
      const T = 0.17;
      COMBAT.crit.fn(k.sub(T, k.gain(0.9)));
      k.nz({ t: T, type: 'bandpass', f: 3000, f1: 1800, q: 2.5, a: 0.002, d: 0.3, vol: 0.2 });
      k.thump({ t: T, f0: 95, f1: 48, sweep: 0.1, d: 0.5, vol: 0.28 });
      for (let i = 0; i < 3; i++) k.nz({ t: T + 0.01 + i * 0.025, type: 'bandpass', f: 1300, q: 3, d: 0.03, vol: 0.2 });
      return 1.0;
    },
  },
  blink: {
    max: 2, gain: 1, range: 45, rev: 0.12,
    fn: (k) => {
      k.tone({ fc: [[0, 300], [0.12, 2600]], a: 0.004, d: 0.22, vol: 0.18 });
      k.tone({ type: 'triangle', fc: [[0, 600], [0.12, 5200]], a: 0.004, d: 0.2, vol: 0.06 });
      k.nz({ type: 'bandpass', fc: [[0, 1000], [0.13, 6500]], q: 1.2, env: [[0, 0], [0.12, 1], [0.16, 0]], vol: 0.3 });
      k.sparkle({ t: 0.12, dur: 0.3, n: 6, lo: 3000, hi: 9000, vol: 0.04 });
      k.thump({ t: 0.13, f0: 160, f1: 80, d: 0.12, vol: 0.2 });
      return 0.55;
    },
  },
  deathPlayer: {
    bus: 'sfx', max: 1, gain: 1, rev: 0.1, hall: 0.35, pri: 3,
    fn: (k) => {
      k.thump({ f0: 70, f1: 50, sweep: 0.1, d: 0.5, vol: 0.4 });
      k.thump({ t: 0.32, f0: 65, f1: 45, sweep: 0.1, d: 0.5, vol: 0.3 });
      k.tone({ t: 0.1, type: 'triangle', f: mtof(38), env: [[0, 0], [0.5, 1], [2.5, 0.5], [3.1, 0]], vol: 0.2 });
      choir(k.sub(0.2), { notes: [50, 53, 57, 62], dur: 1.6, a: 0.6, r: 1.2, vol: 0.05, vowel: 'oo' });
      k.tone({ t: 0.3, type: 'triangle', fc: [[0, mtof(69)], [1.6, mtof(62)]], env: [[0, 0], [0.2, 1], [1.4, 0.6], [2.2, 0]], vol: 0.05, vib: [4.5, 8] });
      k.nz({ t: 0.2, color: 'pink', type: 'lowpass', f: 800, env: [[0, 0], [0.5, 1], [2.5, 0]], vol: 0.06 });
      return 3.3;
    },
  },
  resurrect: {
    bus: 'sfx', max: 1, gain: 1, rev: 0.1, hall: 0.35, pri: 3,
    fn: (k) => {
      k.nz({ color: 'pink', type: 'bandpass', fc: [[0, 300], [1.0, 4000]], q: 1, env: [[0, 0], [0.9, 1], [1.2, 0]], vol: 0.18 });
      choir(k.sub(0.1), { notes: [62, 66, 69, 74], dur: 1.4, a: 0.8, r: 1.0, vol: 0.06, vowel: 'oh', vowel2: 'ah' });
      [62, 64, 66, 69, 71, 74, 76, 78, 81, 83, 86].forEach((m, i) => k.pluck({ t: 0.1 + i * 0.07, f: mtof(m), vol: 0.18, t60: 1.6, bright: 0.35, shape: 0.25 }));
      k.bell({ t: 0.95, f: mtof(86), vol: 0.1, d: 1.6, partials: CHIME });
      k.sparkle({ t: 0.9, dur: 1.2, n: 12, notes: [86, 90, 93, 98].map(mtof), vol: 0.035 });
      return 2.7;
    },
  },
};
