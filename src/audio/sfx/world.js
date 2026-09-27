// Movement + creature sounds. Bus 'sfx' (spatial).
import { METAL } from '../kit.js';
import { whoosh, VOWEL } from './common.js';

export const MOVE = {
  footGrass: {
    max: 3, gain: 1, range: 25, ref: 2, rev: 0.03, burst: 1, gap: 0.05,
    fn: (k) => {
      const p = k.vary(1, 0.12), v = k.vary(1, 0.15);
      for (let i = 0; i < 3; i++) k.nz({ t: i * k.rnd(0.012, 0.025), type: 'highpass', f: 1800 * p, q: 0.7, a: 0.002, d: k.rnd(0.04, 0.08), vol: 0.22 * v * (1 - i * 0.25) });
      k.thump({ f0: 95 * p, f1: 60 * p, sweep: 0.04, d: 0.07, vol: 0.22 * v });
      k.nz({ color: 'pink', type: 'lowpass', f: 450 * p, a: 0.002, d: 0.05, vol: 0.14 * v });
    },
  },
  footDirt: {
    max: 3, gain: 1, range: 25, ref: 2, rev: 0.03, burst: 1, gap: 0.05,
    fn: (k) => {
      const p = k.vary(1, 0.12), v = k.vary(1, 0.15);
      k.nz({ color: 'pink', type: 'bandpass', f: 850 * p, q: 1.1, a: 0.002, d: 0.08, vol: 0.28 * v });
      k.nz({ t: 0.006, type: 'highpass', f: 3200 * p, a: 0.001, d: 0.035, vol: 0.1 * v });
      k.thump({ f0: 115 * p, f1: 70 * p, sweep: 0.03, d: 0.08, vol: 0.26 * v });
    },
  },
  footStone: {
    max: 3, gain: 1, range: 25, ref: 2, rev: 0.06, burst: 1, gap: 0.05,
    fn: (k) => {
      const p = k.vary(1, 0.12), v = k.vary(1, 0.15);
      k.nz({ type: 'bandpass', f: 2600 * p, q: 2.2, a: 0.0005, d: 0.025, vol: 0.4 * v });
      k.tone({ f: 950 * p, a: 0.0005, d: 0.035, vol: 0.05 * v });
      k.thump({ f0: 160 * p, f1: 105 * p, sweep: 0.02, d: 0.05, vol: 0.2 * v });
      k.nz({ t: 0.004, type: 'highpass', f: 5000, a: 0.001, d: 0.02, vol: 0.08 * v });
    },
  },
  jump: {
    max: 2, gain: 1, range: 25, ref: 2, rev: 0.03,
    fn: (k) => {
      whoosh(k, { dur: 0.22, f0: 700, fPeak: 1800, f1: 1100, q: 1, vol: 0.2, peakAt: 0.35 });
      k.nz({ type: 'lowpass', f: 400, d: 0.05, vol: 0.15 });
      k.bell({ t: 0.05, f: k.rnd(2500, 3500), vol: 0.015, d: 0.08, partials: METAL });
    },
  },
  land: {
    clip: 1.5, max: 2, gain: 1, range: 30, ref: 2, rev: 0.05,
    fn: (k) => {
      k.thump({ f0: 135, f1: 68, sweep: 0.05, d: 0.13, vol: 0.45 });
      k.nz({ color: 'pink', type: 'lowpass', f: 750, a: 0.001, d: 0.09, vol: 0.4 });
      k.nz({ t: 0.01, type: 'highpass', f: 2200, a: 0.002, d: 0.12, vol: 0.07 });
      for (let i = 0; i < 2; i++) k.bell({ t: 0.02 + i * 0.05, f: k.rnd(2600, 3800), vol: 0.025, d: 0.08, partials: METAL });
    },
  },
  splash: {
    max: 3, gain: 1, range: 40, rev: 0.06,
    fn: (k) => {
      k.nz({ type: 'bandpass', f: 1300, q: 0.6, a: 0.004, d: 0.4, vol: 0.45 });
      k.nz({ color: 'pink', type: 'lowpass', f: 650, a: 0.003, d: 0.3, vol: 0.4 });
      k.nz({ type: 'highpass', f: 4000, a: 0.005, d: 0.5, vol: 0.08 });
      for (let i = 0; i < 10; i++) { const t = 0.05 + Math.pow(k.rnd(), 1.5) * 0.7, f = k.rnd(700, 1600); k.tone({ t, fc: [[0, f], [0.025, f * 1.9]], a: 0.004, d: 0.06, vol: k.rnd(0.015, 0.035) }); }
      return 0.9;
    },
  },
  swim: {
    max: 2, gain: 1, range: 30, rev: 0.05,
    fn: (k) => {
      k.nz({ color: 'pink', type: 'lowpass', f: 900, env: [[0, 0], [0.18, 1], [0.6, 0]], vol: 0.35 });
      k.nz({ type: 'bandpass', f: 1800, q: 1, env: [[0, 0], [0.12, 1], [0.45, 0]], vol: 0.12 });
      for (let i = 0; i < 4; i++) { const t = k.rnd(0.1, 0.6), f = k.rnd(350, 700); k.tone({ t, fc: [[0, f], [0.025, f * 2.6]], a: 0.001, d: 0.035, vol: 0.05 }); }
      return 0.7;
    },
  },
};

export const CREATURES = {
  wolfGrowl: {
    max: 3, gain: 1, range: 45, rev: 0.1,
    fn: (k) => {
      const s = k.vary(1, 0.08);
      k.voice({
        pitch: [[0, 80 * s], [0.3, 96 * s], [0.8, 84 * s], [1.15, 70 * s]],
        amp: [[0, 0], [0.15, 0.9], [0.4, 1], [0.8, 0.85], [1.15, 0]],
        formants: [[0, [360, 950, 2400]], [0.5, [440, 1050, 2500]], [1.15, [380, 900, 2300]]],
        q: [4, 6, 8], fg: [1, 0.55, 0.25], fry: 0.7, fryRate: 34, jitter: 35, jitterHz: 18, breath: 0.35, body: 0.5, vol: 0.5, drive: 1.5,
      });
      k.nz({ color: 'brown', type: 'lowpass', f: 180, env: [[0, 0], [0.2, 1], [1.1, 0]], vol: 0.2 });
      return 1.2;
    },
  },
  wolfHowl: {
    max: 2, gain: 1, range: 140, ref: 6, rev: 0.25, hall: 0.25,
    fn: (k) => {
      const s = k.vary(1, 0.06);
      const pc = [[0, 360], [0.35, 540], [0.8, 690], [1.8, 680], [2.35, 520], [2.8, 400]].map(([t, f]) => [t, f * s]);
      k.voice({
        src: 'triangle', pitch: pc, amp: [[0, 0], [0.3, 0.8], [0.8, 1], [2.0, 0.9], [2.8, 0]],
        formants: [[0, VOWEL.oo], [0.8, [450, 900, 2500]], [2.0, [480, 850, 2500]], [2.8, VOWEL.oo]],
        q: [5, 7, 9], fg: [1, 0.35, 0.1], vib: [5.2, 18], breath: 0.06, body: 0.9, vol: 0.45, jitter: 8, jitterHz: 6,
      });
      k.tone({ fc: pc, env: [[0, 0], [0.3, 0.7], [0.8, 1], [2, 0.9], [2.8, 0]], vol: 0.12, vib: [5.2, 18] });
      return 2.9;
    },
  },
  wolfYelp: {
    max: 3, gain: 1, range: 45, rev: 0.1,
    fn: (k) => {
      const s = k.vary(1, 0.08);
      k.voice({
        pitch: [[0, 1150 * s], [0.06, 1250 * s], [0.25, 620 * s]], amp: [[0, 0], [0.015, 1], [0.12, 0.6], [0.26, 0]],
        formants: [[0, [700, 1900, 2900]], [0.25, [500, 1300, 2600]]], q: [4, 6, 8], fg: [1, 0.6, 0.3], breath: 0.2, vol: 0.45, jitter: 20,
      });
      return 0.3;
    },
  },
  boarGrunt: {
    max: 3, gain: 1, range: 40, rev: 0.08,
    fn: (k) => {
      const s = k.vary(1, 0.1);
      k.voice({
        src: 'square', pitch: [[0, 92 * s], [0.12, 112 * s], [0.35, 78 * s]], amp: [[0, 0], [0.03, 1], [0.2, 0.8], [0.38, 0]],
        formants: [[0, [320, 850, 2100]], [0.38, [280, 700, 2000]]], q: [3, 5, 6], fg: [1, 0.6, 0.3],
        fry: 0.8, fryRate: 24, breath: 0.45, jitter: 40, body: 0.6, vol: 0.5, drive: 1.2,
      });
      k.nz({ t: 0.3, type: 'bandpass', f: 2200, q: 2, a: 0.01, d: 0.1, vol: 0.18 });
      return 0.45;
    },
  },
  boarSqueal: {
    max: 2, gain: 1, range: 50, rev: 0.1,
    fn: (k) => {
      const s = k.vary(1, 0.08);
      k.voice({
        pitch: [[0, 850 * s], [0.12, 1500 * s], [0.45, 1350 * s], [0.7, 780 * s]], amp: [[0, 0], [0.04, 1], [0.5, 0.8], [0.7, 0]],
        formants: [[0, [1000, 2500, 3700]], [0.7, [800, 2000, 3300]]], q: [3, 4, 5], fg: [1, 0.7, 0.4],
        vib: [11, 55], breath: 0.3, jitter: 50, vol: 0.4, drive: 1.3,
      });
      return 0.75;
    },
  },
  spiderHiss: {
    max: 3, gain: 1, range: 35, rev: 0.08,
    fn: (k) => {
      const am = k.gain(0.75); k.lfo(0, 0.75, 38, 0.25, am.gain, 'square');
      k.nz({ type: 'bandpass', f: 5500, q: 0.6, env: [[0, 0], [0.06, 1], [0.4, 0.8], [0.7, 0]], vol: 0.55, dest: am });
      k.nz({ type: 'highpass', f: 3000, env: [[0, 0], [0.05, 1], [0.6, 0]], vol: 0.2 });
      return 0.75;
    },
  },
  spiderChitter: {
    max: 3, gain: 1, range: 35, rev: 0.08,
    fn: (k) => {
      const n = 9 + Math.floor(k.rnd(0, 6)), rate = k.rnd(28, 40);
      let t = 0;
      for (let i = 0; i < n; i++) {
        const e = Math.sin(Math.PI * (i + 0.5) / n);
        k.nz({ t, type: 'bandpass', f: k.rnd(2600, 4600), q: 6, a: 0.0005, d: 0.014, vol: 0.5 * (0.4 + e) });
        k.tone({ t, f: k.rnd(1800, 2400), a: 0.0005, d: 0.012, vol: 0.04 });
        t += (1 / rate) * k.vary(1, 0.2);
      }
      return t + 0.05;
    },
  },
  // "Mrglglgl": gargled voice — synced AM + FM at ~16 Hz, wobbling formants, bubbles.
  gurgle: {
    max: 3, gain: 1, range: 45, rev: 0.1,
    fn: (k) => {
      const T = 1.1, s = k.vary(1, 0.08);
      const am = k.gain(0.5);
      const v = k.voice({
        pitch: [[0, 240 * s], [0.25, 320 * s], [0.6, 290 * s], [0.9, 360 * s], [1.1, 430 * s]],
        amp: [[0, 0], [0.05, 1], [0.8, 0.9], [1.1, 0]], formants: [[0, VOWEL.oo], [1.1, VOWEL.uh]],
        q: [4, 6, 8], fg: [1, 0.6, 0.25], breath: 0.15, body: 0.5, vol: 0.55, dest: am,
      });
      const l1 = k.lfo(0, T, 15, 0.5, am.gain, 'triangle');
      const l2 = k.lfo(0, T, 15, 130, v.osc.detune, 'sine');
      for (const l of [l1, l2]) { l.o.frequency.setValueAtTime(13, k.at(0)); l.o.frequency.linearRampToValueAtTime(19, k.at(T)); }
      for (const bp of v.bps) k.lfo(0, T, 6.5, 160, bp.frequency);
      for (let i = 0; i < 5; i++) { const f = k.rnd(300, 600); k.tone({ t: k.rnd(0, 1.0), fc: [[0, f], [0.03, f * k.rnd(2, 2.6)]], a: 0.001, d: 0.04, vol: 0.06 }); }
      return 1.15;
    },
  },
  // Squeaky panicked gibberish: 3–4 tiny syllables, the last one rising.
  koboldSqueak: {
    max: 3, gain: 1, range: 45, rev: 0.08,
    fn: (k) => {
      let t = 0; const n = 3 + (k.chance(0.5) ? 1 : 0);
      for (let i = 0; i < n; i++) {
        const last = i === n - 1, d = last ? k.rnd(0.18, 0.26) : k.rnd(0.08, 0.14);
        const f0 = k.rnd(650, 950) * (last ? 1.25 : 1), up = last || k.chance(0.5);
        const v1 = VOWEL[k.pick(['ee', 'ah', 'eh', 'oo'])], v2 = VOWEL[k.pick(['ee', 'ah', 'eh'])];
        k.voice({
          t, pitch: [[0, f0], [d, f0 * (up ? 1.45 : 0.75)]], amp: [[0, 0], [0.012, 1], [d * 0.7, 0.8], [d, 0]],
          formants: [[0, v1.map((x) => x * 1.35)], [d, v2.map((x) => x * 1.35)]], q: [4, 5, 6], fg: [1, 0.7, 0.35],
          breath: 0.12, vol: 0.4, jitter: 30,
        });
        t += d + k.rnd(0.025, 0.06);
      }
      return t + 0.1;
    },
  },
  banditGrunt: {
    max: 3, gain: 1, range: 40, rev: 0.08,
    fn: (k) => {
      const s = k.vary(1, 0.1);
      k.voice({
        pitch: [[0, 135 * s], [0.08, 165 * s], [0.3, 105 * s]], amp: [[0, 0], [0.02, 1], [0.15, 0.7], [0.32, 0]],
        formants: [[0, VOWEL.uh], [0.3, VOWEL.oh]], q: [5, 7, 8], fg: [1, 0.5, 0.2], breath: 0.35, fry: 0.3, fryRate: 45, jitter: 25, body: 0.5, vol: 0.5,
      });
      k.nz({ t: 0.18, type: 'bandpass', f: 1200, q: 0.8, a: 0.01, d: 0.12, vol: 0.08 });
      return 0.4;
    },
  },
  // The big one: inhale → twin distorted fry-throats with moving formants, rattled breath, ring-modulated screech,
  // sub-bass swell and chest rumble. Duck the music around it (audio.duck).
  dragonRoar: {
    max: 1, gain: 1, range: 400, ref: 20, rev: 0.2, hall: 0.3, pri: 3,
    fn: (k) => {
      k.nz({ color: 'pink', type: 'bandpass', fc: [[0, 450], [0.32, 1500]], q: 0.9, env: [[0, 0], [0.28, 0.5], [0.34, 0]], vol: 0.2 });
      const T = 0.3, s = k.vary(1, 0.05);
      const pitch = [[0, 128], [0.12, 104], [0.5, 96], [1.3, 100], [2.2, 90], [3.0, 70], [3.6, 52]].map(([t, f]) => [t, f * s]);
      const form = [[0, [520, 1000, 2400]], [0.5, [700, 1150, 2550]], [1.6, [760, 1250, 2650]], [2.6, [560, 900, 2300]], [3.6, [420, 780, 2100]]];
      const amp = [[0, 0], [0.08, 1], [0.35, 0.85], [1.0, 1], [2.2, 0.92], [3.0, 0.6], [3.6, 0]];
      // throat: three voiced layers, each with its own fry rate, moving formants and grit
      for (const [det, v, fr] of [[-14, 0.42, 29], [11, 0.38, 33], [3, 0.3, 37]]) {
        k.voice({ t: T, pitch, detune: det, amp, formants: form, q: [4, 5, 6], fg: [1, 0.75, 0.4], fry: 0.45, fryRate: fr,
          jitter: 22, jitterHz: 9, breath: 0.12, body: 0.5, drive: 2.2, vol: v, hp: 55 });
      }
      // upper "scream" formant layer
      k.voice({ t: T, pitch: pitch.map(([t, f]) => [t, f * 3.02]), amp: [[0, 0], [0.3, 0.5], [1.2, 1], [2.3, 0.6], [3.3, 0]],
        formants: [[0, [1300, 2400, 3300]], [3.3, [1100, 2100, 3000]]], q: [5, 6, 7], fg: [1, 0.6, 0.3], fry: 0.35, fryRate: 41, jitter: 30, jitterHz: 11, drive: 1.6, vol: 0.13, hp: 400 });
      // breath rasp following the formant motion
      const rat = k.gain(0.65); k.lfo(T, 3.7, 31, 0.35, rat.gain, 'sawtooth');
      k.nz({ t: T, color: 'pink', type: 'bandpass', fc: [[0, 800], [0.6, 1300], [2.0, 1100], [3.4, 650]], q: 0.9, env: [[0, 0], [0.12, 1], [2.4, 0.8], [3.5, 0]], vol: 0.22, dest: rat });
      // ring-modulated screech (quiet, monstrous edge)
      const rm = k.gain(0, k.filter('bandpass', 2100, 1.5)); k.lfo(T, 3.7, 67, 1, rm.gain, 'sine');
      k.tone({ t: T, type: 'sawtooth', fc: pitch.map(([t, f]) => [t, f * 5.1]), env: [[0, 0], [0.4, 0.5], [1.5, 1], [2.5, 0.4], [3.4, 0]], vol: 0.06, dest: rm });
      // bark attack, sub swell, chest rumble
      k.nz({ t: T, type: 'lowpass', f: 2200, a: 0.004, d: 0.18, vol: 0.28 });
      k.tone({ t: T, fc: [[0, 55], [1.5, 48], [3.5, 40]], env: [[0, 0], [0.4, 1], [2.5, 0.7], [3.6, 0]], vol: 0.28 });
      k.nz({ t: T, color: 'brown', type: 'bandpass', f: 110, q: 0.8, env: [[0, 0], [0.3, 1], [3.0, 0.6], [3.8, 0]], vol: 0.3 });
      return 4.3;
    },
  },
  wingFlap: {
    max: 3, gain: 1, range: 150, ref: 10, rev: 0.12,
    fn: (k) => {
      k.nz({ color: 'brown', type: 'lowpass', fc: [[0, 500], [0.35, 140]], q: 0.9, env: [[0, 0], [0.07, 1], [0.5, 0]], vol: 0.8 });
      const fl = k.gain(0.6); k.lfo(0, 0.5, 24, 0.4, fl.gain);
      k.nz({ type: 'bandpass', f: 900, q: 0.7, env: [[0, 0], [0.08, 1], [0.4, 0]], vol: 0.3, dest: fl });
      k.thump({ t: 0.03, f0: 65, f1: 40, sweep: 0.1, d: 0.35, vol: 0.45 });
      return 0.65;
    },
  },
  // Roaring flame stream — loop() it while the breath lasts (play() gives a 2.6 s burst).
  fireBreath: {
    loop: { dur: 4, xf: 0.6 }, max: 2, gain: 1, range: 150, ref: 10, rev: 0.15,
    fn: (k, o) => {
      const D = o.dur ?? 2.6, loop = !!o.loop;
      const main = k.gain(0); k.envPts(main.gain, loop ? [[0, 1], [D, 1]] : [[0, 0], [0.12, 1], [D - 0.4, 0.9], [D, 0]]);
      const rg = k.gain(0.75, main); k.wobble(0, D, 9, 0.25, rg.gain);
      const lp = k.filter('lowpass', 1000, 0.8, rg); k.wobble(0, D, 5, 350, lp.frequency);
      k.noiseSrc(0, D, lp, 'brown');
      const hiss = k.gain(0.16, main); k.wobble(0, D, 13, 0.08, hiss.gain);
      k.noiseSrc(0, D, k.filter('bandpass', 2600, 0.6, hiss), 'white');
      const n = Math.floor(D * 9);
      for (let i = 0; i < n; i++) k.nz({ t: k.rnd(0, D - 0.05), type: 'bandpass', f: k.rnd(1500, 5000), q: 2, a: 0.0005, d: k.rnd(0.008, 0.03), vol: k.rnd(0.05, 0.2), dest: main });
      k.osc('sine', 48, 0, D, k.gain(0.15, main));
      return D;
    },
  },
  eruption: {
    clip: 1.3, max: 3, gain: 1, range: 90, ref: 6, rev: 0.16, pri: 2,
    fn: (k) => {
      k.nz({ color: 'brown', type: 'lowpass', f: 150, env: [[0, 0], [0.3, 1], [1.2, 0.5], [2.0, 0]], vol: 0.6 });
      k.thump({ t: 0.3, f0: 100, f1: 42, sweep: 0.16, d: 1.2, vol: 0.55 });
      k.nz({ t: 0.3, color: 'pink', type: 'bandpass', f: 220, q: 0.8, a: 0.003, d: 0.6, vol: 0.45 });
      k.nz({ t: 0.3, color: 'pink', type: 'lowpass', fc: [[0, 4000], [1.2, 250]], q: 0.7, a: 0.004, d: 1.4, vol: 0.55 });
      k.nz({ t: 0.3, type: 'highpass', f: 2500, a: 0.0005, d: 0.06, vol: 0.4 });
      for (let i = 0; i < 16; i++) k.nz({ t: 0.4 + Math.pow(k.rnd(), 1.4) * 1.5, type: 'bandpass', f: k.rnd(900, 3200), q: 3, a: 0.0005, d: k.rnd(0.015, 0.05), vol: k.rnd(0.1, 0.3) });
      k.nz({ t: 0.35, type: 'highpass', f: 3500, env: [[0, 0], [0.2, 1], [1.6, 0]], vol: 0.12 });
      return 2.4;
    },
  },
  whelpScreech: {
    max: 3, gain: 1, range: 70, rev: 0.12,
    fn: (k) => {
      const s = k.vary(1, 0.1);
      k.voice({
        pitch: [[0, 700 * s], [0.12, 1300 * s], [0.5, 1120 * s], [0.8, 620 * s]], amp: [[0, 0], [0.03, 1], [0.55, 0.8], [0.8, 0]],
        formants: [[0, [900, 2200, 3300]], [0.8, [700, 1800, 3000]]], q: [3, 4, 5], fg: [1, 0.7, 0.4],
        fry: 0.4, fryRate: 47, jitter: 70, jitterHz: 20, breath: 0.3, drive: 1.8, vol: 0.4,
      });
      return 0.85;
    },
  },
  groundShake: {
    max: 2, gain: 1, range: 120, ref: 15, rev: 0.12, pri: 2,
    fn: (k) => {
      k.nz({ color: 'brown', type: 'lowpass', f: 95, env: [[0, 0], [0.4, 1], [2.0, 0.8], [2.6, 0]], vol: 1.0 });
      const rg = k.gain(0.7); k.wobble(0, 2.6, 10, 0.3, rg.gain);
      k.nz({ color: 'brown', type: 'bandpass', f: 220, q: 1, env: [[0, 0], [0.4, 1], [2.6, 0]], vol: 0.35, dest: rg });
      for (let i = 0; i < 6; i++) k.thump({ t: k.rnd(0.1, 2.0), f0: 55, f1: 36, sweep: 0.08, d: 0.25, vol: k.rnd(0.2, 0.4) });
      for (let i = 0; i < 10; i++) k.nz({ t: k.rnd(0.2, 2.2), type: 'bandpass', f: k.rnd(1500, 3500), q: 4, d: 0.02, vol: k.rnd(0.03, 0.08) });
      return 2.7;
    },
  },
};
