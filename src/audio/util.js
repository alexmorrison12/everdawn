// Shared DSP helpers for the audio system: pure JS math (no nodes created here except AudioBuffers).
import { RNG } from '../core/noise.js';
export { RNG };

export const TAU = Math.PI * 2;
export const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);
export const clamp = (x, a = 0, b = 1) => (x < a ? a : x > b ? b : x);
export const lerp = (a, b, t) => a + (b - a) * t;
export const toDb = (g) => 20 * Math.log10(Math.max(1e-9, g));
export const fromDb = (d) => Math.pow(10, d / 20);

// Fast xorshift32 white-noise generator in [-1, 1).
export function whiteGen(seed = 12345) {
  let s = (seed >>> 0) || 0x9e3779b9;
  return () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return (s >>> 0) / 2147483648 - 1; };
}

// Removes DC + linear drift (so a looped buffer joins without a step), then normalises RMS.
function conditionLoop(d, rms) {
  const n = d.length;
  const drift = d[n - 1] - d[0];
  let mean = 0;
  for (let i = 0; i < n; i++) { d[i] -= drift * (i / (n - 1)); mean += d[i]; }
  mean /= n;
  let e = 0;
  for (let i = 0; i < n; i++) { d[i] -= mean; e += d[i] * d[i]; }
  const g = rms / Math.sqrt(e / n || 1);
  for (let i = 0; i < n; i++) d[i] *= g;
}

// Mono noise buffer. color: white | pink | brown. All normalised to the same RMS (0.3) so recipe volumes agree.
export function makeNoise(ctx, seconds, color = 'white', seed = 1) {
  const sr = ctx.sampleRate, n = Math.floor(sr * seconds);
  const buf = ctx.createBuffer(1, n, sr), d = buf.getChannelData(0), w = whiteGen(seed * 7919 + 17);
  if (color === 'pink') {
    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
    for (let i = 0; i < n; i++) {
      const x = w();
      b0 = 0.99886 * b0 + x * 0.0555179; b1 = 0.99332 * b1 + x * 0.0750759; b2 = 0.969 * b2 + x * 0.153852;
      b3 = 0.8665 * b3 + x * 0.3104856; b4 = 0.55 * b4 + x * 0.5329522; b5 = -0.7616 * b5 - x * 0.016898;
      d[i] = b0 + b1 + b2 + b3 + b4 + b5 + b6 + x * 0.5362; b6 = x * 0.115926;
    }
  } else if (color === 'brown') {
    let b = 0;
    for (let i = 0; i < n; i++) { b = (b + 0.02 * w()) / 1.02; d[i] = b; }
  } else {
    for (let i = 0; i < n; i++) d[i] = w();
  }
  conditionLoop(d, 0.3);
  return buf;
}

// Generated reverb impulse response: decorrelated stereo noise, exponential decay, frequency-dependent damping
// (highs die faster), optional early reflections, pre-delay and a high-pass to keep the tail from getting muddy.
// Normalised to unit energy per channel, so a send gain of g gives roughly g × input RMS of steady-state reverb.
export function makeIR(ctx, o = {}) {
  const { dur = 3, rt60 = 2.4, pre = 0.02, fc0 = 9000, fc1 = 1400, damp = 0.3, hp = 120, er = 0, erSpread = 0.05,
    erLevel = 3, seed = 11, fadeIn = 0.012 } = o;
  const sr = ctx.sampleRate, n = Math.ceil(dur * sr), P = Math.floor(pre * sr);
  const buf = ctx.createBuffer(2, n, sr);
  const k60 = Math.pow(10, -3 / (rt60 * sr));
  const ahp = 1 - Math.exp(-TAU * hp / sr);
  const fadeN = Math.max(1, fadeIn * sr), tailN = Math.floor(0.05 * sr);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch), w = whiteGen(seed * 7 + ch * 131 + 3);
    let env = 1, lp = 0, lpH = 0, a = 0;
    for (let i = P; i < n; i++) {
      const k = i - P;
      if ((k & 31) === 0) { const fc = fc1 + (fc0 - fc1) * Math.exp(-(k / sr) / (rt60 * damp)); a = 1 - Math.exp(-TAU * fc / sr); }
      lp += a * (w() - lp);
      lpH += ahp * (lp - lpH);
      d[i] = (lp - lpH) * env * (k < fadeN ? k / fadeN : 1) * (i > n - tailN ? (n - i) / tailN : 1);
      env *= k60;
    }
    if (er > 0) {
      let e0 = 0; const m = Math.min(n, P + Math.floor(0.05 * sr));
      for (let i = P; i < m; i++) e0 += d[i] * d[i];
      const r0 = Math.sqrt(e0 / Math.max(1, m - P));
      const w2 = whiteGen(seed * 13 + ch * 17 + 5);
      for (let j = 0; j < er; j++) {
        const ti = P + Math.floor((0.003 + (w2() * 0.5 + 0.5) * erSpread) * sr);
        // Each reflection is a tiny smeared click (3 taps) rather than a single sample: less metallic.
        const amp = (w2() > 0 ? 1 : -1) * (0.5 + 0.5 * Math.abs(w2())) * (1 - j / er) * erLevel * r0;
        if (ti + 2 < n) { d[ti] += amp * 0.5; d[ti + 1] += amp; d[ti + 2] += amp * 0.5; }
      }
    }
    let e = 0; for (let i = 0; i < n; i++) e += d[i] * d[i];
    const g = 1 / Math.sqrt(e || 1);
    for (let i = 0; i < n; i++) d[i] *= g;
  }
  return buf;
}

// Karplus-Strong plucked string (extended: brightness, fractional tuning allpass, pluck-position comb,
// triangle/noise excitation). Returns a mono AudioBuffer at `sr` (default half the context rate to save memory).
export function ksBuffer(ctx, freq, o = {}) {
  // default length ≈ the -50 dB point (the remainder is inaudible in a mix and would only cost memory)
  const { t60 = 2, dur = Math.min(3, t60 * 0.85 + 0.1), bright = 0.5, pos = 0.18, shape = 0.5, sr = Math.max(22050, Math.round(ctx.sampleRate / 2)),
    seed = 1, soft = 0.4, gain = 1 } = o;
  const n = Math.floor(dur * sr);
  const buf = ctx.createBuffer(1, n, sr), out = buf.getChannelData(0);
  const N = sr / freq;
  // loop filter: y = (1-S)x[n] + S x[n-1]; phase delay ≈ S samples at low frequency
  const S = clamp(0.5 - bright * 0.42, 0.06, 0.5);
  let L = Math.floor(N - S - 0.15); if (L < 2) L = 2;
  const frac = N - S - L; // in [0.15, 1.15)
  const C = (1 - frac) / (1 + frac);
  // per-period gain for requested t60 at the fundamental, compensating the averaging filter's loss
  const w0 = TAU * freq / sr;
  const hMag = Math.sqrt((1 - S) * (1 - S) + S * S + 2 * S * (1 - S) * Math.cos(w0));
  let rho = Math.pow(0.001, 1 / (freq * t60)) / hMag; if (rho > 0.99995) rho = 0.99995;
  const dl = new Float32Array(L), w = whiteGen(seed * 101 + Math.round(freq * 10));
  // Excitation: mix of a triangle displacement (mellow, harp-like) and filtered noise (bright, lute-like).
  const P = Math.max(1, Math.min(L - 1, Math.round(pos * L)));
  let lpN = 0; const aN = clamp(0.15 + bright * 0.8, 0.05, 1);
  for (let i = 0; i < L; i++) {
    const tri = i < P ? i / P : (L - i) / (L - P);
    lpN += aN * (w() - lpN);
    dl[i] = tri * (1 - shape) + lpN * shape * 1.6;
  }
  // pluck-position comb on the noise part + DC removal
  let mean = 0; for (let i = 0; i < L; i++) mean += dl[i]; mean /= L;
  for (let i = 0; i < L; i++) dl[i] -= mean;
  // soften the very first sample transitions (finger vs pick)
  if (soft > 0) { let s = dl[L - 1]; const a = 1 - soft * 0.7; for (let i = 0; i < L; i++) { s += a * (dl[i] - s); dl[i] = s; } }
  let idx = 0, prev = 0, apIn = 0, apOut = 0, peak = 0;
  for (let i = 0; i < n; i++) {
    const x = dl[idx];
    out[i] = x;
    const f = rho * ((1 - S) * x + S * prev); prev = x;
    const ap = C * f + apIn - C * apOut; apIn = f; apOut = ap;
    dl[idx] = ap;
    if (++idx >= L) idx = 0;
    const ax = x < 0 ? -x : x; if (ax > peak) peak = ax;
  }
  // DC blocker + gentle end fade, normalise peak
  let xm1 = 0, ym1 = 0; const R = 1 - TAU * 20 / sr;
  for (let i = 0; i < n; i++) { const y = out[i] - xm1 + R * ym1; xm1 = out[i]; ym1 = y; out[i] = y; }
  const fade = Math.min(n, Math.floor(0.04 * sr));
  for (let i = 0; i < fade; i++) out[n - 1 - i] *= i / fade;
  const onset = Math.min(n, 12); for (let i = 0; i < onset; i++) out[i] *= i / onset;
  peak = 0; for (let i = 0; i < n; i++) { const ax = Math.abs(out[i]); if (ax > peak) peak = ax; }
  const g = gain * 0.9 / (peak || 1);
  for (let i = 0; i < n; i++) out[i] *= g;
  return buf;
}

// Makes a seamless loop out of a buffer rendered `xf` seconds longer than the loop: the tail is equal-power
// crossfaded into the head, so sample L-1 → sample 0 is continuous.
export function loopify(ctx, src, xf) {
  const sr = src.sampleRate, X = Math.floor(xf * sr), L = src.length - X;
  const out = ctx.createBuffer(src.numberOfChannels, L, sr);
  for (let c = 0; c < src.numberOfChannels; c++) {
    const a = src.getChannelData(c), b = out.getChannelData(c);
    for (let i = 0; i < L; i++) b[i] = a[i];
    for (let i = 0; i < X; i++) {
      const u = i / X, wIn = Math.sin(u * Math.PI / 2), wOut = Math.cos(u * Math.PI / 2);
      b[i] = a[i] * wIn + a[L + i] * wOut;
    }
  }
  return out;
}

const curveCache = new Map();
// tanh drive curve for WaveShaperNode (normalised so full-scale input maps to ±1).
export function driveCurve(k = 2, n = 2048) {
  const key = 'd' + k; if (curveCache.has(key)) return curveCache.get(key);
  const c = new Float32Array(n), norm = Math.tanh(k);
  for (let i = 0; i < n; i++) { const x = (i / (n - 1)) * 2 - 1; c[i] = Math.tanh(k * x) / norm; }
  curveCache.set(key, c); return c;
}

// Safety clipper: input is pre-scaled by 1/range, so the curve covers ±range actual amplitude. Linear up to `knee`,
// then a tanh shoulder that approaches `ceil` (never exceeds it, since WaveShaper clamps inputs beyond the curve).
export function safetyCurve(range = 2, knee = 0.7, ceil = 0.88, n = 4096) {
  const c = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const a = ((i / (n - 1)) * 2 - 1) * range, s = Math.sign(a), m = Math.abs(a);
    c[i] = m <= knee ? a : s * (knee + (ceil - knee) * Math.tanh((m - knee) / (ceil - knee)));
  }
  return c;
}

// Equal-power fade curves for setValueCurveAtTime.
export function fadeCurve(from, to, n = 64, shape = 'eq') {
  const c = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const u = i / (n - 1);
    const w = shape === 'eq' ? Math.sin(u * Math.PI / 2) : u;
    c[i] = from + (to - from) * (to > from ? w : 1 - Math.cos(u * Math.PI / 2));
  }
  c[0] = from; c[n - 1] = to;
  return c;
}
