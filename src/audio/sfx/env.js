// Environment loops (baked into seamless buffers; usable with loop() or as ambience beds) and ambience events.
import { clamp } from '../util.js';
import { VOWEL } from './common.js';

const loopEnv = (k, o, D, fade = 0.3) => { const g = k.gain(0); k.envPts(g.gain, o.loop ? [[0, 1], [D, 1]] : [[0, 0], [fade, 1], [D - fade, 1], [D, 0]]); return g; };

function laugh(k, t, dest, vol = 0.07) {
  const f = k.rnd(170, 260), n = 4 + Math.floor(k.rnd(0, 3)), sd = k.rnd(0.13, 0.17);
  const pitch = [], amp = [[0, 0]];
  for (let i = 0; i < n; i++) {
    const st = i * sd, ff = f * (1.12 - i * 0.05);
    pitch.push([st, ff]);
    amp.push([st + 0.02, 1 - i * 0.08], [st + sd * 0.55, 0.3], [st + sd, 0.05]);
  }
  pitch.push([n * sd + 0.05, f * 0.8]); amp.push([n * sd + 0.05, 0]);
  k.voice({ t, pitch, amp, formants: [[0, VOWEL.ah]], q: [5, 7, 8], fg: [1, 0.5, 0.2], breath: 0.35, body: 0.4, vol, dest });
}

export const ENV = {
  fireCrackle: {
    loop: { dur: 5, xf: 0.8 }, bus: 'sfx', max: 4, gain: 1, range: 25, ref: 2, rev: 0.05,
    fn: (k, o) => {
      const D = o.dur ?? 3, main = loopEnv(k, o, D);
      const body = k.gain(0.5, main); k.wobble(0, D, 3, 0.2, body.gain);
      k.noiseSrc(0, D, k.filter('lowpass', 420, 0.7, body), 'brown');
      const fl = k.gain(0.1, main); k.wobble(0, D, 7, 0.06, fl.gain);
      k.noiseSrc(0, D, k.filter('bandpass', 900, 0.8, fl), 'pink');
      const n = Math.floor(D * 14);
      for (let i = 0; i < n; i++) {
        const t = k.rnd(0, D - 0.05), big = k.chance(0.12);
        k.nz({ t, type: 'bandpass', f: big ? k.rnd(600, 1400) : k.rnd(1800, 6500), q: big ? 1.5 : 2.5, a: 0.0003, d: big ? k.rnd(0.02, 0.06) : k.rnd(0.004, 0.018), vol: big ? k.rnd(0.25, 0.45) : k.rnd(0.08, 0.3), dest: main });
      }
      return D;
    },
  },
  waterfall: {
    loop: { dur: 5, xf: 0.8 }, bus: 'sfx', max: 4, gain: 1, range: 80, ref: 8, rev: 0.05,
    fn: (k, o) => {
      const D = o.dur ?? 3, main = loopEnv(k, o, D);
      const a1 = k.gain(0.55, main); k.noiseSrc(0, D, k.filter('lowpass', 3200, 0.5, k.filter('highpass', 120, 0.7, a1)), 'pink');
      const a2 = k.gain(0.3, main); k.wobble(0, D, 4, 0.08, a2.gain); k.noiseSrc(0, D, k.filter('bandpass', 1500, 0.5, a2), 'white');
      const a3 = k.gain(0.5, main); k.noiseSrc(0, D, k.filter('lowpass', 180, 0.7, a3), 'brown');
      return D;
    },
  },
  water: {
    loop: { dur: 8, xf: 1.2 }, bus: 'sfx', max: 4, gain: 1, range: 30, ref: 4, rev: 0.05,
    fn: (k, o) => {
      const D = o.dur ?? 4, main = loopEnv(k, o, D, 0.5);
      k.noiseSrc(0, D, k.filter('lowpass', 350, 0.6, k.gain(0.12, main)), 'brown');
      const n = Math.max(2, Math.round(D / 1.2));
      for (let i = 0; i < n; i++) {
        const t = (i + k.rnd(-0.25, 0.25)) * (D / n), dur = k.rnd(0.8, 1.4);
        k.nz({ t: Math.max(0, t), color: 'pink', type: 'lowpass', fc: [[0, 300], [dur * 0.4, 1100], [dur, 400]], env: [[0, 0], [dur * 0.35, 1], [dur, 0]], vol: k.rnd(0.25, 0.45), dest: main });
        k.nz({ t: Math.max(0, t + dur * 0.3), type: 'bandpass', f: k.rnd(500, 1000), q: 1.5, a: 0.02, d: 0.3, vol: 0.15, dest: main });
      }
      for (let i = 0; i < D * 2; i++) { const f = k.rnd(700, 1500); k.tone({ t: k.rnd(0, D - 0.1), fc: [[0, f], [0.02, f * 1.8]], a: 0.001, d: 0.03, vol: 0.03, dest: main }); }
      return D;
    },
  },
  lava: {
    loop: { dur: 7, xf: 1.0 }, bus: 'sfx', max: 4, gain: 1, range: 40, ref: 5, rev: 0.08,
    fn: (k, o) => {
      const D = o.dur ?? 4, main = loopEnv(k, o, D, 0.5);
      const rb = k.gain(0.6, main); k.wobble(0, D, 2, 0.2, rb.gain);
      k.noiseSrc(0, D, k.filter('lowpass', 110, 0.8, rb), 'brown');
      const blorp = k.filter('lowpass', 700, 0.8, main);
      for (let i = 0; i < D * 1.6; i++) {
        const t = k.rnd(0, D - 0.3), f = k.rnd(60, 140);
        k.tone({ t, fc: [[0, f], [0.12, f * 2.2]], a: 0.01, d: 0.25, vol: k.rnd(0.15, 0.3), dest: blorp });
        k.nz({ t: t + 0.1, type: 'lowpass', f: 900, d: 0.05, vol: 0.12, dest: main });
      }
      const hs = k.gain(0.05, main); k.wobble(0, D, 1.5, 0.04, hs.gain); k.noiseSrc(0, D, k.filter('highpass', 3500, 0.7, hs));
      for (let i = 0; i < D * 3; i++) k.nz({ t: k.rnd(0, D - 0.05), type: 'bandpass', f: k.rnd(1500, 4000), q: 2, a: 0.0004, d: k.rnd(0.005, 0.02), vol: k.rnd(0.03, 0.1), dest: main });
      return D;
    },
  },
  // Wordless crowd babble: 9 formant "talkers" with syllable-rate vowel changes + laughs + mug clinks.
  tavern: {
    loop: { dur: 10, xf: 1.2 }, bus: 'ambience', max: 2, gain: 1, range: 40, ref: 6, rev: 0.25,
    fn: (k, o) => {
      const D = o.dur ?? 6, main = loopEnv(k, o, D, 0.6);
      const room = k.filter('lowpass', 2800, 0.6, main);
      const bed = k.gain(0.12, room); k.wobble(0, D, 0.7, 0.04, bed.gain);
      k.noiseSrc(0, D, k.filter('bandpass', 450, 0.6, bed), 'pink');
      const vowels = ['ah', 'eh', 'oh', 'uh', 'ee', 'aw', 'oo'];
      for (let v = 0; v < 9; v++) {
        const pan = k.pan(k.rnd(-0.85, 0.85), room);
        const base = k.chance(0.62) ? k.rnd(95, 135) : k.rnd(175, 235), vol = k.rnd(0.05, 0.11);
        let t = k.rnd(-1.5, 0.5);
        while (t < D) {
          const plen = k.rnd(0.7, 2.4), s0 = Math.max(0, t), L = Math.min(D, t + plen) - s0;
          if (L > 0.3) {
            const pitch = [], amp = [[0, 0]], form = [];
            let st = 0, f = base * k.rnd(0.95, 1.15);
            while (st < L - 0.15) {
              const sd = k.rnd(0.1, 0.22);
              f = clamp(f * k.rnd(0.92, 1.08), base * 0.85, base * 1.35);
              pitch.push([st, f]); form.push([st + sd * 0.3, VOWEL[k.pick(vowels)]]);
              amp.push([st + 0.03, k.rnd(0.6, 1)], [st + sd - 0.04, k.rnd(0.4, 0.8)], [st + sd, k.chance(0.25) ? 0.02 : 0.25]);
              st += sd;
            }
            if (pitch.length) {
              amp.push([st + 0.06, 0]); pitch.push([st + 0.06, f * 0.85]); form.push([st + 0.06, form[form.length - 1][1]]);
              k.voice({ t: s0, pitch, amp, formants: form, q: [5, 7, 8], fg: [1, 0.5, 0.2], breath: 0.12, body: 0.4, vol, dest: pan });
            }
          }
          t += plen + k.rnd(0.3, 2.0);
        }
      }
      for (let i = 0; i < 2; i++) laugh(k, k.rnd(0, Math.max(0.1, D - 1.5)), k.pan(k.rnd(-0.7, 0.7), room));
      for (let i = 0; i < 4; i++) k.bell({ t: k.rnd(0, D - 0.3), f: k.rnd(1700, 2600), vol: 0.03, d: 0.25, partials: [[1, 1, 1], [2.3, 0.5, 0.6], [3.9, 0.3, 0.4]], dest: k.pan(k.rnd(-0.7, 0.7), room) });
      return D;
    },
  },
  crickets: {
    loop: { dur: 8, xf: 1.0 }, bus: 'ambience', max: 2, gain: 1, range: 30, ref: 5, rev: 0.1,
    fn: (k, o) => {
      const D = o.dur ?? 4, main = loopEnv(k, o, D, 0.5);
      for (let c = 0; c < 5; c++) {
        const f = k.rnd(3900, 5200), vol = k.rnd(0.03, 0.07) * (c === 4 ? 0.4 : 1);
        const period = k.rnd(0.55, 1.1), pulses = k.pick([2, 3, 3, 4]), pr = k.rnd(22, 34);
        const g = k.gain(0, k.pan(k.rnd(-0.9, 0.9), main));
        k.osc('sine', f, 0, D, g); k.osc('sine', f * 2.01, 0, D, k.gain(0.12, g));
        let t = k.rnd(0, period);
        while (t < D - 0.2) {
          for (let p = 0; p < pulses; p++) {
            const ts = k.at(t + p / pr);
            g.gain.setValueAtTime(0, ts); g.gain.linearRampToValueAtTime(vol, ts + 0.004);
            g.gain.setValueAtTime(vol, ts + 0.011); g.gain.linearRampToValueAtTime(0, ts + 0.018);
          }
          t += period * k.vary(1, 0.06);
        }
      }
      const hs = k.gain(0.012, main); k.lfo(0, D, 31, 0.008, hs.gain);
      k.noiseSrc(0, D, k.filter('bandpass', 5200, 3, hs));
      return D;
    },
  },
};

// ---- ambience events (played by the ambience spawners; each gets a fresh Kit) ----
const bird = {
  warbler: (k, b) => {
    const n = b.n + Math.floor(k.rnd(-2, 3)), rate = b.rate * k.vary(1, 0.05);
    for (let i = 0; i < n; i++) {
      const u = i / n, f = b.f * (1 + b.drift * u) * k.vary(1, 0.02), d = 0.8 / rate;
      k.tone({ t: i / rate, fc: [[0, f * 1.18], [d * 0.8, f * 0.82]], a: 0.004, d: d * 1.4, vol: 0.12 * Math.sin(Math.PI * (0.15 + 0.8 * u)) });
    }
    return n / rate + 0.15;
  },
  whistler: (k, b) => {
    for (const [t, s, e, d] of b.pat) k.tone({ t, fc: [[0, b.f * s], [d, b.f * e]], env: [[0, 0], [0.03, 1], [d - 0.05, 0.8], [d, 0]], vol: 0.09, vib: [b.vr, 18] });
    return b.pat[b.pat.length - 1][0] + 0.5;
  },
  chirper: (k, b) => {
    const n = 3 + Math.floor(k.rnd(0, 4)); let t = 0;
    for (let i = 0; i < n; i++) {
      const d = k.rnd(0.04, 0.08), f = b.f * k.vary(1, 0.12);
      k.tone({ t, fc: [[0, f * 0.8], [d * 0.4, f * 1.25], [d, f * 0.9]], env: [[0, 0], [0.008, 1], [d * 0.6, 0.7], [d, 0]], vol: 0.08 });
      t += d + k.rnd(0.05, 0.18);
    }
    return t;
  },
  thrush: (k, b) => {
    const n = 4 + Math.floor(k.rnd(0, 4)); let t = 0;
    for (let i = 0; i < n; i++) {
      const d = k.rnd(0.08, 0.2), f = k.pick(b.set), kind = k.rnd();
      if (kind < 0.3) k.tone({ t, f, env: [[0, 0], [0.01, 1], [d - 0.02, 0.8], [d, 0]], vol: 0.07, vib: [k.rnd(25, 40), k.rnd(60, 150)] });
      else if (kind < 0.65) k.tone({ t, fc: [[0, f], [d, f * k.rnd(0.7, 1.3)]], env: [[0, 0], [0.01, 1], [d - 0.02, 0.7], [d, 0]], vol: 0.08 });
      else k.tone({ t, f, env: [[0, 0], [0.015, 1], [d, 0]], vol: 0.07 });
      t += d + k.rnd(0.02, 0.1);
    }
    return t;
  },
  dove: (k, b) => {
    for (const [t, s, d] of [[0, 0.95, 0.25], [0.35, 1.08, 0.45], [0.95, 0.95, 0.25], [1.35, 0.9, 0.3]]) {
      k.tone({ t, fc: [[0, b.f * s * 0.96], [d * 0.3, b.f * s], [d, b.f * s * 0.92]], env: [[0, 0], [0.06, 1], [d - 0.06, 0.8], [d, 0]], vol: 0.1 });
      k.tone({ t, type: 'triangle', f: b.f * s * 2, env: [[0, 0], [0.06, 1], [d, 0]], vol: 0.012 });
    }
    return 1.8;
  },
  woodpecker: (k, b) => {
    let t = 0, r = b.rate;
    for (let i = 0; i < b.n; i++) { k.nz({ t, type: 'bandpass', f: b.f, q: 5, a: 0.0005, d: 0.025, vol: 0.28 }); t += 1 / r; r *= 0.985; }
    return t;
  },
  cuckoo: (k, b) => {
    k.tone({ fc: [[0, b.f * 1.02], [0.2, b.f]], env: [[0, 0], [0.03, 1], [0.18, 0.7], [0.22, 0]], vol: 0.1 });
    k.tone({ t: 0.32, fc: [[0, b.f * 0.81], [0.3, b.f * 0.79]], env: [[0, 0], [0.03, 1], [0.26, 0.7], [0.32, 0]], vol: 0.1 });
    return 0.7;
  },
};

// Bird individual factory: species + persistent song parameters (a bird repeats its own song type).
export function makeBird(rng) {
  const r = (a, b) => a + (b - a) * rng.next();
  const sp = rng.weighted([
    { k: 'warbler', w: 3 }, { k: 'whistler', w: 3 }, { k: 'chirper', w: 3 }, { k: 'thrush', w: 3 },
    { k: 'dove', w: 1 }, { k: 'woodpecker', w: 0.6 }, { k: 'cuckoo', w: 0.4 },
  ]).k;
  const b = { sp, pan: r(-0.9, 0.9), dist: r(0.35, 1), every: [4, 10] };
  if (sp === 'warbler') Object.assign(b, { f: r(3200, 4800), rate: r(12, 17), n: 8 + Math.floor(r(0, 10)), drift: r(-0.25, 0.2), every: [4, 9] });
  if (sp === 'whistler') Object.assign(b, { f: r(2400, 3600), vr: r(18, 30), pat: rng.chance(0.5) ? [[0, 1.0, 1.0, 0.28], [0.36, 0.84, 0.8, 0.35]] : [[0, 0.9, 1.1, 0.22], [0.3, 1.0, 0.95, 0.22], [0.6, 0.8, 0.8, 0.3]], every: [5, 11] });
  if (sp === 'chirper') Object.assign(b, { f: r(3000, 4500), every: [2.5, 7] });
  if (sp === 'thrush') Object.assign(b, { set: [0, 1, 2, 3, 4].map(() => r(1800, 3600)), every: [4, 9] });
  if (sp === 'dove') Object.assign(b, { f: r(430, 560), every: [9, 20], dist: r(0.5, 1) });
  if (sp === 'woodpecker') Object.assign(b, { f: r(850, 1250), rate: r(15, 19), n: 12 + Math.floor(r(0, 8)), every: [10, 25], dist: r(0.6, 1) });
  if (sp === 'cuckoo') Object.assign(b, { f: r(650, 780), every: [8, 18], dist: r(0.7, 1) });
  return b;
}
export function birdSong(k, b) { return bird[b.sp](k, b); }

export const EVENTS = {
  frog: (k) => {
    const f = k.rnd(170, 320), n = k.pick([1, 2, 2, 3]);
    for (let i = 0; i < n; i++) k.voice({ t: i * 0.11, src: 'square', pitch: [[0, f], [0.08, f * 0.9]], amp: [[0, 0], [0.01, 1], [0.07, 0.6], [0.09, 0]], formants: [[0, [500, 1300, 2400]]], q: [4, 6, 8], fg: [1, 0.7, 0.3], fry: 0.9, fryRate: 55, fryType: 'square', vol: 0.3, breath: 0.1 });
    return n * 0.11 + 0.1;
  },
  drip: (k) => {
    const f = k.rnd(900, 2400);
    k.tone({ fc: [[0, f], [0.03, f * 1.9]], a: 0.0008, d: 0.09, vol: 0.2 });
    if (k.chance(0.3)) k.tone({ t: 0.05, fc: [[0, f * 1.3], [0.02, f * 2.2]], a: 0.0008, d: 0.05, vol: 0.08 });
    return 0.2;
  },
  stoneKnock: (k) => {
    const n = 1 + Math.floor(k.rnd(0, 3));
    for (let i = 0; i < n; i++) k.nz({ t: i * k.rnd(0.08, 0.2), type: 'bandpass', f: k.rnd(600, 1600), q: 3, a: 0.0005, d: 0.05, vol: 0.2 });
    return 0.6;
  },
  rumble: (k) => { k.nz({ color: 'brown', type: 'lowpass', f: 120, env: [[0, 0], [0.8, 1], [2.5, 0]], vol: 0.5 }); return 2.6; },
  lavaBurst: (k) => {
    const f = k.rnd(50, 90);
    k.tone({ fc: [[0, f], [0.18, f * 2.5]], a: 0.02, d: 0.4, vol: 0.35 });
    k.nz({ t: 0.15, color: 'pink', type: 'lowpass', f: 1200, a: 0.002, d: 0.25, vol: 0.3 });
    k.nz({ t: 0.18, type: 'highpass', f: 3000, env: [[0, 0], [0.1, 1], [0.9, 0]], vol: 0.06 });
    return 1.1;
  },
  firePop: (k) => { k.nz({ type: 'bandpass', f: k.rnd(700, 1600), q: 1.5, a: 0.0003, d: k.rnd(0.03, 0.08), vol: 0.5 }); return 0.1; },
  laugh: (k) => { laugh(k, 0, k.out, 0.09); return 1.2; },
  clink: (k) => {
    k.bell({ f: k.rnd(1700, 2600), vol: 0.05, d: 0.3, partials: [[1, 1, 1], [2.3, 0.5, 0.6], [3.9, 0.3, 0.4]] });
    if (k.chance(0.5)) k.bell({ t: 0.06, f: k.rnd(1900, 2700), vol: 0.035, d: 0.25, partials: [[1, 1, 1], [2.5, 0.5, 0.6]] });
    return 0.5;
  },
  leaves: (k) => { k.nz({ type: 'bandpass', f: k.rnd(3000, 5000), q: 0.8, env: [[0, 0], [0.4, 1], [1.5, 0]], vol: 0.12 }); return 1.6; },
};
