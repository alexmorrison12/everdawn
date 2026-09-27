// Shared recipe helpers (built on Kit).
import { mtof } from '../util.js';
export { mtof };

// Brass-like tone: detuned saws through an opening low-pass (the "blat"), small pitch scoop.
export function brass(k, { t = 0, f = 220, dur = 0.4, vol = 0.2, bright = 3, a = 0.02, r = 0.15, dest = k.out, q = 1.3, scoop = 30 }) {
  const T = k.at(t), R = k.r, ny = k.nyq;
  const g = k.gain(0, dest);
  const lp = k.filter('lowpass', f, q, g);
  lp.frequency.setValueAtTime(Math.min(ny, f * 1.1 * R), T);
  lp.frequency.linearRampToValueAtTime(Math.min(ny, f * (1 + bright * 1.5) * R), T + a * 1.6);
  lp.frequency.setTargetAtTime(Math.min(ny, f * (1 + bright) * R), T + a * 1.6, 0.12);
  lp.frequency.setTargetAtTime(Math.min(ny, f * 1.2 * R), T + dur, r * 0.4);
  for (const dt of [-6, 6]) {
    const o = k.osc('sawtooth', f, t, dur + r + 0.05, lp, dt);
    o.detune.setValueAtTime(dt - scoop, T); o.detune.linearRampToValueAtTime(dt, T + 0.05);
  }
  g.gain.setValueAtTime(0, T);
  g.gain.linearRampToValueAtTime(vol, T + a);
  g.gain.linearRampToValueAtTime(vol * 0.8, T + a + 0.1);
  g.gain.setValueAtTime(vol * 0.8, T + Math.max(a + 0.1, dur));
  g.gain.linearRampToValueAtTime(0, T + Math.max(a + 0.1, dur) + r);
  return g;
}

// Swept band-pass noise "whoosh" (weapon swings, wings, spells).
export function whoosh(k, { t = 0, dur = 0.25, f0 = 600, fPeak = 2200, f1 = 800, q = 1.2, vol = 0.35, color = 'white', dest = k.out, peakAt = 0.4 }) {
  return k.nz({
    t, color, type: 'bandpass', q, dest, vol,
    fc: [[0, f0], [dur * peakAt, fPeak], [dur, f1]],
    env: [[0, 0], [dur * peakAt, 1], [dur, 0]],
  });
}

// Vowel formant tables (F1, F2, F3)
export const VOWEL = {
  ah: [780, 1150, 2700], oh: [480, 820, 2650], oo: [330, 760, 2450], eh: [540, 1800, 2550], ee: [300, 2250, 3000],
  uh: [620, 1180, 2500], aw: [620, 900, 2600],
};

// Choir-ish sustained chord of formant voices.
export function choir(k, { t = 0, notes = [60, 64, 67], dur = 1.5, a = 0.3, r = 0.8, vol = 0.06, vowel = 'ah', vowel2 = null, dest = k.out, vib = [5.2, 9] }) {
  const f1 = VOWEL[vowel], f2 = vowel2 ? VOWEL[vowel2] : f1;
  for (const m of notes) {
    const f = mtof(m);
    k.voice({
      t, dest, vol, pitch: [[0, f], [dur + r, f]],
      amp: [[0, 0], [a, 1], [dur, 0.85], [dur + r, 0]],
      formants: [[0, f1], [dur + r, f2]], q: [5, 7, 9], fg: [1, 0.45, 0.18],
      vib: [vib[0] * k.vary(1, 0.08), vib[1]], breath: 0.015, body: 0.35, detune: k.rnd(-6, 6),
    });
  }
}
