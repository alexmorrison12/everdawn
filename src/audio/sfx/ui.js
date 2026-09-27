// UI sounds. Bus 'ui' (not ducked, not spatial).
import { CHIME, METAL } from '../kit.js';
import { brass, choir, mtof } from './common.js';

export const UI = {
  uiClick: {
    bus: 'ui', max: 3, burst: 1, gap: 0.02, gain: 1,
    fn: (k) => {
      k.tone({ f: k.vary(1850, 0.03), f1: 1250, sweep: 0.025, a: 0.0008, d: 0.035, vol: 0.3 });
      k.nz({ type: 'bandpass', f: 3800, q: 1.8, a: 0.0005, d: 0.012, vol: 0.35 });
      k.tone({ type: 'triangle', f: 620, a: 0.001, d: 0.03, vol: 0.12 });
    },
  },
  uiOpen: {
    bus: 'ui', max: 2, burst: 1, gain: 1,
    fn: (k) => {
      k.nz({ type: 'bandpass', f: 450, f1: 2600, sweep: 0.16, q: 1.4, a: 0.05, d: 0.16, vol: 0.4 });
      k.tone({ type: 'triangle', f: 420, f1: 760, sweep: 0.1, a: 0.01, d: 0.12, vol: 0.12 });
      k.nz({ type: 'lowpass', f: 900, a: 0.001, d: 0.05, vol: 0.35 });
      k.tone({ t: 0.09, f: 1320, a: 0.002, d: 0.18, vol: 0.05 });
    },
  },
  uiClose: {
    bus: 'ui', max: 2, burst: 1, gain: 1,
    fn: (k) => {
      k.nz({ type: 'bandpass', f: 2400, f1: 420, sweep: 0.15, q: 1.4, a: 0.02, d: 0.14, vol: 0.38 });
      k.tone({ type: 'triangle', f: 640, f1: 330, sweep: 0.1, a: 0.005, d: 0.1, vol: 0.1 });
      k.nz({ t: 0.1, type: 'lowpass', f: 650, a: 0.002, d: 0.07, vol: 0.45 });
      k.thump({ t: 0.1, f0: 190, f1: 110, sweep: 0.04, d: 0.08, vol: 0.18 });
    },
  },
  questAccept: {
    bus: 'ui', max: 1, gain: 1, hall: 0.25,
    fn: (k) => {
      k.nz({ type: 'bandpass', f: 2600, q: 0.9, a: 0.01, d: 0.12, vol: 0.18 });
      k.nz({ t: 0.05, type: 'highpass', f: 3500, q: 0.7, a: 0.005, d: 0.08, vol: 0.12 });
      k.bell({ t: 0.04, f: mtof(79), vol: 0.2, d: 1.0, partials: CHIME });
      k.bell({ t: 0.16, f: mtof(86), vol: 0.22, d: 1.3, partials: CHIME });
      k.tone({ t: 0.04, type: 'triangle', f: mtof(55), a: 0.01, d: 0.8, vol: 0.12 });
    },
  },
  questComplete: {
    bus: 'ui', max: 1, gain: 1, hall: 0.35, pri: 2,
    fn: (k) => {
      [[0, 72], [0.11, 76], [0.22, 79]].forEach(([t, m]) => brass(k, { t, f: mtof(m), dur: 0.1, vol: 0.13, bright: 3.5, a: 0.012, r: 0.08 }));
      brass(k, { t: 0.33, f: mtof(84), dur: 0.75, vol: 0.16, bright: 3, a: 0.015, r: 0.5 });
      for (const m of [60, 64, 67]) brass(k, { t: 0.33, f: mtof(m), dur: 0.7, vol: 0.07, bright: 2, a: 0.03, r: 0.6 });
      k.bell({ t: 0.33, f: mtof(96), vol: 0.07, d: 1.2 });
      k.bell({ t: 0.4, f: mtof(100), vol: 0.05, d: 1.1 });
      k.thump({ t: 0.33, f0: 110, f1: 65, sweep: 0.1, d: 0.6, vol: 0.28 });
      k.sparkle({ t: 0.4, dur: 1.0, n: 8, lo: 3500, hi: 8000, vol: 0.03 });
      return 2.0;
    },
  },
  // THE ding: riser → warm impact + major-add9 brass/choir chord → bell cascade → sparkling tail.
  levelUp: {
    bus: 'ui', max: 1, gain: 1, hall: 0.55, pri: 3,
    fn: (k) => {
      k.nz({ color: 'pink', type: 'bandpass', fc: [[0, 300], [0.32, 5200]], q: 1.2, env: [[0, 0], [0.28, 1], [0.33, 0]], vol: 0.28 });
      k.tone({ type: 'triangle', fc: [[0, 220], [0.3, 880]], env: [[0, 0], [0.27, 1], [0.32, 0]], vol: 0.07 });
      const T = 0.3;
      k.thump({ t: T, f0: 98, f1: 65.4, sweep: 0.12, d: 1.8, vol: 0.42 });
      k.tone({ t: T, f: 130.8, a: 0.004, d: 1.6, vol: 0.12 });
      k.nz({ t: T, type: 'highpass', f: 5000, q: 0.5, a: 0.002, d: 1.4, vol: 0.12 });
      k.nz({ t: T, type: 'bandpass', f: 8000, q: 1.5, a: 0.001, d: 0.6, vol: 0.1 });
      for (const m of [48, 55, 60, 64, 67, 74]) brass(k, { t: T, f: mtof(m), dur: 1.25, vol: m < 55 ? 0.06 : 0.045, bright: 2.4, a: 0.03, r: 1.1 });
      choir(k, { t: T, notes: [60, 64, 67, 72, 76], dur: 1.6, a: 0.22, r: 1.0, vol: 0.05, vowel: 'ah', vowel2: 'oh' });
      // the cascade: C major add9 climbing two octaves, each bell ringing into the next
      [72, 76, 79, 84, 86, 88, 91, 96, 100].forEach((m, i) => {
        k.bell({ t: T + 0.02 + i * 0.07, f: mtof(m), vol: 0.17 - i * 0.008, d: 2.1 - i * 0.1 });
        k.tone({ t: T + 0.02 + i * 0.07, f: mtof(m), a: 0.002, d: 1.4, vol: 0.05, type: 'triangle' });
      });
      k.sparkle({ t: T + 0.35, dur: 2.4, n: 30, notes: [84, 88, 91, 93, 96, 100, 103].map(mtof), vol: 0.07, d: 0.7 });
      k.nz({ t: T, type: 'highpass', f: 7000, env: [[0, 0], [0.3, 1], [2.8, 0]], vol: 0.05 });
      return 3.7;
    },
  },
  loot: {
    bus: 'ui', max: 2, gain: 1,
    fn: (k) => {
      const n = 4 + Math.floor(k.rnd(0, 3.99));
      const coin = [[1, 1, 1], [1.51, 0.6, 0.8], [2.37, 0.45, 0.6], [3.2, 0.25, 0.4]];
      for (let i = 0; i < n; i++) {
        const t = Math.pow(k.rnd(), 1.3) * 0.28;
        k.bell({ t, f: k.rnd(2400, 4200), vol: k.rnd(0.05, 0.1), d: k.rnd(0.12, 0.3), partials: coin, spread: 0.02 });
        k.nz({ t, type: 'highpass', f: 6000, a: 0.0005, d: 0.012, vol: 0.12 });
      }
      k.nz({ type: 'bandpass', f: 1800, q: 1, a: 0.01, d: 0.08, vol: 0.12 });
    },
  },
  itemPickup: {
    bus: 'ui', max: 2, gain: 1,
    fn: (k) => {
      k.nz({ type: 'bandpass', f: 1300, f1: 3400, sweep: 0.1, q: 1.1, a: 0.02, d: 0.1, vol: 0.28 });
      k.thump({ t: 0.06, f0: 320, f1: 170, sweep: 0.03, d: 0.07, vol: 0.2 });
      k.nz({ t: 0.06, type: 'lowpass', f: 1200, d: 0.04, vol: 0.2 });
      k.bell({ t: 0.07, f: 2600, vol: 0.03, d: 0.12, partials: CHIME });
    },
  },
  error: {
    bus: 'ui', max: 1, burst: 1, gap: 0.15, gain: 1,
    fn: (k) => {
      const g = k.gain(0), lp = k.filter('lowpass', 950, 0.9, g);
      k.osc('sawtooth', 110, 0, 0.3, lp); k.osc('sawtooth', 116.5, 0, 0.3, lp);
      const sq = k.gain(0.35, lp); k.osc('square', 55, 0, 0.3, sq);
      k.envPts(g.gain, [[0, 0], [0.012, 0.22], [0.16, 0.2], [0.24, 0]]);
      return 0.26;
    },
  },
  whisper: {
    bus: 'ui', max: 1, gain: 1, hall: 0.2,
    fn: (k) => {
      k.bell({ f: mtof(88), vol: 0.13, d: 0.7, partials: CHIME });
      k.bell({ t: 0.1, f: mtof(95), vol: 0.1, d: 0.8, partials: CHIME });
    },
  },
  raidWarning: {
    bus: 'ui', max: 1, gain: 1, hall: 0.3, pri: 3,
    fn: (k) => {
      const horn = (t, f, dur) => {
        const T = k.at(t), R = k.r;
        const g = k.gain(0, k.drive(1.6));
        const lp = k.filter('lowpass', f * 2, 2.2, g);
        lp.frequency.setValueAtTime(f * 1.5 * R, T);
        lp.frequency.linearRampToValueAtTime(f * 7 * R, T + 0.08);
        lp.frequency.setTargetAtTime(f * 4.5 * R, T + 0.08, 0.2);
        lp.frequency.setTargetAtTime(f * 1.5 * R, T + dur - 0.05, 0.06);
        for (const [dt, v, mul] of [[-8, 1, 1], [7, 1, 1], [3, 0.45, 1.5], [-4, 0.3, 2]]) {
          const og = k.gain(v, lp); const o = k.osc('sawtooth', f * mul, t, dur + 0.1, og, dt);
          o.detune.setValueAtTime(dt - 90, T); o.detune.linearRampToValueAtTime(dt, T + 0.1);
        }
        k.envPts(g.gain, [[0, 0], [0.05, 0.3], [dur - 0.12, 0.27], [dur, 0]], t);
      };
      horn(0, mtof(45), 0.62);
      horn(0.68, mtof(50), 0.9);
      k.bell({ t: 0, f: 880, vol: 0.06, d: 0.8, partials: METAL });
      k.thump({ t: 0, f0: 120, f1: 60, sweep: 0.08, d: 0.4, vol: 0.25 });
      return 1.7;
    },
  },
  readyCheck: {
    bus: 'ui', max: 1, gain: 1, hall: 0.3, pri: 2,
    fn: (k) => {
      brass(k, { t: 0, f: mtof(67), dur: 0.22, vol: 0.12, bright: 3, a: 0.02, r: 0.1 });
      brass(k, { t: 0.26, f: mtof(74), dur: 0.5, vol: 0.14, bright: 3, a: 0.02, r: 0.4 });
      brass(k, { t: 0.26, f: mtof(62), dur: 0.5, vol: 0.06, bright: 2, a: 0.03, r: 0.4 });
      k.bell({ t: 0.26, f: mtof(86), vol: 0.07, d: 1.0, partials: CHIME });
      k.thump({ f0: 160, f1: 90, sweep: 0.05, d: 0.25, vol: 0.3 });
      k.nz({ type: 'bandpass', f: 1500, q: 1, d: 0.05, vol: 0.12 });
      return 1.3;
    },
  },
  pullTick: {
    clip: 1.5, bus: 'ui', max: 2, gain: 1,
    fn: (k) => {
      k.nz({ type: 'bandpass', f: 1750, q: 5, a: 0.0012, d: 0.07, vol: 0.6 });
      k.tone({ type: 'triangle', f: 1180, a: 0.0005, d: 0.06, vol: 0.12 });
      k.tone({ f: 590, a: 0.0005, d: 0.05, vol: 0.08 });
    },
  },
  pullGo: {
    bus: 'ui', max: 1, gain: 1, hall: 0.35, pri: 3,
    fn: (k) => {
      k.thump({ f0: 140, f1: 62, sweep: 0.08, d: 0.8, vol: 0.5 });
      k.nz({ type: 'bandpass', f: 250, q: 1, d: 0.25, vol: 0.4 });
      k.nz({ type: 'highpass', f: 4500, a: 0.001, d: 1.3, vol: 0.14 });
      for (const m of [50, 57, 62, 66, 69]) brass(k, { t: 0.01, f: mtof(m), dur: 0.35, vol: 0.075, bright: 4, a: 0.012, r: 0.35 });
      return 1.4;
    },
  },
  achievement: {
    bus: 'ui', max: 1, gain: 1, hall: 0.45, pri: 2,
    fn: (k) => {
      [84, 88, 91, 96].forEach((m, i) => k.bell({ t: i * 0.08, f: mtof(m), vol: 0.09, d: 1.4 }));
      for (const m of [60, 67, 72, 76]) brass(k, { t: 0.1, f: mtof(m), dur: 0.8, vol: 0.06, bright: 2.5, a: 0.12, r: 0.9 });
      k.sparkle({ t: 0.3, dur: 1.5, n: 16, notes: [84, 88, 91, 96, 100].map(mtof), vol: 0.035 });
      k.nz({ type: 'highpass', f: 6000, env: [[0, 0], [0.3, 1], [1.8, 0]], vol: 0.06 });
      k.thump({ t: 0.1, f0: 110, f1: 65, d: 0.8, vol: 0.2 });
      return 2.3;
    },
  },
  epicLoot: {
    bus: 'ui', max: 1, gain: 1, hall: 0.45, pri: 2,
    fn: (k) => {
      [72, 74, 76, 78, 79, 83, 84, 88].forEach((m, i) => k.bell({ t: i * 0.045, f: mtof(m + 12), vol: 0.07, d: 1.0 + i * 0.05 }));
      for (const m of [48, 55, 64, 71, 78]) k.tone({ t: 0.05, type: 'triangle', f: mtof(m), env: [[0, 0], [0.3, 1], [1.2, 0.6], [2.0, 0]], vol: 0.05, vib: [5.5, 6] });
      k.nz({ type: 'highpass', f: 7000, env: [[0, 0], [0.2, 1], [1.6, 0]], vol: 0.07 });
      k.thump({ f0: 95, f1: 60, sweep: 0.2, d: 1.0, vol: 0.18 });
      k.sparkle({ t: 0.2, dur: 1.4, n: 14, lo: 4000, hi: 10000, vol: 0.03 });
      return 2.1;
    },
  },
  legendary: {
    bus: 'ui', max: 1, gain: 1, hall: 0.6, pri: 3,
    fn: (k) => {
      k.nz({ color: 'pink', type: 'bandpass', fc: [[0, 200], [0.85, 6000]], q: 1, env: [[0, 0], [0.8, 1], [0.86, 0]], vol: 0.3 });
      k.tone({ type: 'triangle', fc: [[0, 110], [0.85, 440]], env: [[0, 0], [0.8, 1], [0.86, 0]], vol: 0.06 });
      const T = 0.85;
      k.thump({ t: T, f0: 85, f1: 41, sweep: 0.2, d: 2.0, vol: 0.45 });
      k.nz({ t: T, type: 'lowpass', color: 'brown', f: 300, d: 1.5, vol: 0.4 });
      k.nz({ t: T, type: 'highpass', f: 4000, a: 0.002, d: 2.6, vol: 0.14 });
      choir(k, { t: T, notes: [50, 57, 62, 66, 69, 74], dur: 2.0, a: 0.12, r: 1.4, vol: 0.055, vowel: 'ah', vowel2: 'oh' });
      for (const m of [50, 57, 62, 66]) brass(k, { t: T, f: mtof(m), dur: 1.6, vol: 0.06, bright: 3.2, a: 0.02, r: 1.0 });
      [[0, 69], [0.14, 74], [0.28, 78], [0.42, 81]].forEach(([dt, m], i) => brass(k, { t: T + dt, f: mtof(m), dur: i === 3 ? 1.3 : 0.12, vol: 0.09, bright: 3.8, a: 0.012, r: i === 3 ? 0.9 : 0.08 }));
      [74, 78, 81, 86, 90, 93, 98].forEach((m, i) => k.bell({ t: T + 0.05 + i * 0.07, f: mtof(m), vol: 0.08, d: 2.0 }));
      k.sparkle({ t: T + 0.3, dur: 3.2, n: 34, notes: [86, 90, 93, 95, 98, 102, 105].map(mtof), vol: 0.04, d: 0.7 });
      k.nz({ t: T, type: 'highpass', f: 6500, env: [[0, 0], [0.4, 1], [3.6, 0]], vol: 0.07 });
      return 4.9;
    },
  },
};
