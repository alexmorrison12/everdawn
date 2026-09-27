// Offline rendering + objective analysis for the audio lab (not imported by the game).
// Renders sounds/tracks/ambience through the FULL engine graph (buses, reverbs, limiter, clipper) into an
// OfflineAudioContext, then measures peak / RMS / LUFS (BS.1770 K-weighting, gated) / DC / band energies / tail.
import { Audio } from './audio.js';

const SR = 48000;

// All renders pre-roll PRE seconds before anything plays (DynamicsCompressorNode starts in an attenuated state
// right after context creation), then trim the pre-roll from the returned buffer.
const PRE = 0.6;
function trim(buf, from = PRE) {
  const n0 = Math.floor(from * buf.sampleRate), out = new AudioBuffer({ numberOfChannels: buf.numberOfChannels, length: buf.length - n0, sampleRate: buf.sampleRate });
  for (let c = 0; c < buf.numberOfChannels; c++) out.copyToChannel(buf.getChannelData(c).subarray(n0), c);
  return out;
}
const mk = (seconds, seed, raw) => { const oac = new OfflineAudioContext(2, Math.ceil(SR * (seconds + PRE)), SR); const a = new Audio(); a.init({ context: oac, seed, raw }); return [oac, a]; };
const at = (oac, t, fn) => { const tt = +(PRE + t).toFixed(4); if (tt * SR >= oac.length - 128) return; oac.suspend(tt).then(() => { fn(); oac.resume(); }); };

export async function renderSound(name, { dur = 6, opts = {}, seed = 1, vol = null, raw = false } = {}) {
  const [oac, a] = mk(dur, seed, raw);
  if (vol) for (const [k, v] of Object.entries(vol)) a.setVolume(k, v);
  at(oac, 0, () => a.play(name, opts));
  return trim(await oac.startRendering());
}
// Render many sounds at scheduled times: events [{ name, t, opts }]
export async function renderEvents(events, dur, { seed = 1, setup = null, raw = false } = {}) {
  const [oac, a] = mk(dur, seed, raw);
  const times = [...new Set(events.map((e) => e.t))].sort((x, y) => x - y);
  at(oac, 0, () => { if (setup) setup(a); });
  for (const t of times) {
    const evs = events.filter((e) => e.t === t);
    if (t <= 0) at(oac, 0.001, () => evs.forEach((e) => a.play(e.name, e.opts || {})));
    else at(oac, t, () => evs.forEach((e) => a.play(e.name, e.opts || {})));
  }
  if (setup) for (let t = 0.1; t < dur; t += 0.1) at(oac, t + 0.002, () => a._tick());
  return { buf: trim(await oac.startRendering()), audio: a };
}
// Render a music track for `seconds`, driving the scheduler exactly like the realtime timer (every `step` s).
export async function renderMusic(name, seconds, { seed = 7, step = 0.1, log = true, actions = [], vol = null, raw = false, solo = null } = {}) {
  const [oac, a] = mk(seconds, seed, raw);
  if (vol) for (const [k, v] of Object.entries(vol)) a.setVolume(k, v);
  const mu = a._mus(); mu.log = log; mu.solo = solo;
  const logs = [];
  const grab = () => { for (const tr of mu.tracks) if (tr.log && tr.log.length) { logs.push(...tr.log.map((e) => [tr.name, e[0], +(e[1] - PRE).toFixed(3), ...e.slice(2)])); tr.log.length = 0; } };
  const acts = actions.slice().sort((x, y) => x.t - y.t);
  at(oac, 0, () => { if (name) a.music(name, { fade: 0.05, seed }); a._tick(); grab(); });
  for (let t = step; t < seconds; t += step) {
    const tt = +t.toFixed(4);
    at(oac, tt, () => { while (acts.length && acts[0].t <= tt) acts.shift().fn(a); a._tick(); grab(); });
  }
  const buf = trim(await oac.startRendering());
  grab();
  return { buf, log: logs, stats: { ...mu.stats } };
}
export async function renderAmbience(levels, seconds, { seed = 3, step = 0.1, raw = false } = {}) {
  const [oac, a] = mk(seconds, seed, raw);
  await a.prepare(['water', 'crickets', 'fireCrackle', 'tavern', 'lava']);
  at(oac, 0, () => { a.ambience(levels); a._tick(); });
  for (let t = step; t < seconds; t += step) { const tt = +t.toFixed(4); at(oac, tt, () => a._tick()); }
  return trim(await oac.startRendering());
}
export async function renderLoop(name, seconds, { seed = 5, pos = null, raw = false } = {}) {
  const [oac, a] = mk(seconds, seed, raw);
  await a.prepare([name]);
  at(oac, 0, () => a.loop(name, { pos, fade: 0.05 }));
  return trim(await oac.startRendering());
}

// ---------------------------------------------------------------- measurements
function biquadRun(x, b0, b1, b2, a1, a2) {
  const y = new Float32Array(x.length); let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  for (let i = 0; i < x.length; i++) { const v = b0 * x[i] + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2; x2 = x1; x1 = x[i]; y2 = y1; y1 = v; y[i] = v; }
  return y;
}
const kWeight = (x) => biquadRun(biquadRun(x, 1.53512485958697, -2.69169618940638, 1.19839281085285, -1.69065929318241, 0.73248077421585), 1, -2, 1, -1.99004745483398, 0.99007225036621);
const dB = (x) => (x > 0 ? 10 * Math.log10(x) : -200);
const r1 = (x) => Math.round(x * 10) / 10;

export function fft(re, im) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) { let bit = n >> 1; for (; j & bit; bit >>= 1) j ^= bit; j ^= bit; if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]]; } }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = -2 * Math.PI / len, wr = Math.cos(ang), wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cr = 1, ci = 0;
      for (let k = 0; k < len / 2; k++) {
        const a = i + k, b = a + len / 2, tr = re[b] * cr - im[b] * ci, ti = re[b] * ci + im[b] * cr;
        re[b] = re[a] - tr; im[b] = im[a] - ti; re[a] += tr; im[a] += ti;
        const t = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = t;
      }
    }
  }
}
export const BANDS = [['sub', 20, 60], ['low', 60, 250], ['lowmid', 250, 1000], ['mid', 1000, 4000], ['high', 4000, 10000], ['air', 10000, 20000]];

export function analyze(buf, { from = 0, to = null } = {}) {
  const sr = buf.sampleRate, n0 = Math.floor(from * sr), n1 = Math.min(buf.length, to ? Math.floor(to * sr) : buf.length);
  const chs = [];
  for (let c = 0; c < buf.numberOfChannels; c++) chs.push(buf.getChannelData(c).subarray(n0, n1));
  const n = n1 - n0;
  let peak = 0, clip = 0, ss = 0; const dc = [];
  for (const x of chs) { let s = 0; for (let i = 0; i < n; i++) { const v = x[i], a = v < 0 ? -v : v; if (a > peak) peak = a; if (a >= 0.999) clip++; s += v; ss += v * v; } dc.push(s / n); }
  const thr = Math.pow(10, -60 / 20);
  let first = -1, last = -1;
  for (let i = 0; i < n; i++) { let a = 0; for (const x of chs) a = Math.max(a, Math.abs(x[i])); if (a > thr) { if (first < 0) first = i; last = i; } }
  const active = first < 0 ? 0 : (last - first) / sr;
  // K-weighted loudness
  const kw = chs.map(kWeight);
  const blk = Math.floor(0.4 * sr), hop = Math.floor(0.1 * sr), blocks = [];
  for (let i = 0; i + blk <= n; i += hop) { let s = 0; for (const y of kw) { let e = 0; for (let j = i; j < i + blk; j++) e += y[j] * y[j]; s += e / blk; } blocks.push(-0.691 + dB(s)); }
  const mMax = blocks.length ? Math.max(...blocks) : -200;
  const abs = blocks.filter((l) => l > -70);
  const mean = (arr) => arr.length ? -0.691 + dB(arr.reduce((acc, l) => acc + Math.pow(10, (l + 0.691) / 10), 0) / arr.length) : -200;
  const rel = mean(abs) - 10, gated = abs.filter((l) => l > rel), lufs = mean(gated);
  const st = []; const stW = 30; // 3 s short-term from 100 ms hops
  for (let i = 0; i + stW <= blocks.length; i += 5) st.push(mean(blocks.slice(i, i + stW)));
  // spectrum (averaged power, Hann, 8192)
  const N = 8192, re = new Float64Array(N), im = new Float64Array(N), pw = new Float64Array(N / 2);
  const w = new Float64Array(N); for (let i = 0; i < N; i++) w[i] = 0.5 - 0.5 * Math.cos(2 * Math.PI * i / (N - 1));
  let frames = 0; const hopF = Math.max(N / 2, Math.floor(n / 60));
  for (let i = 0; i + N <= n; i += hopF) {
    for (let j = 0; j < N; j++) { let v = 0; for (const x of chs) v += x[i + j]; re[j] = v * w[j] / chs.length; im[j] = 0; }
    fft(re, im); for (let k = 0; k < N / 2; k++) pw[k] += re[k] * re[k] + im[k] * im[k]; frames++;
  }
  if (!frames && n > 256) { const M = n; for (let j = 0; j < N; j++) { let v = 0; if (j < M) for (const x of chs) v += x[j]; re[j] = v / chs.length * (j < M ? 0.5 - 0.5 * Math.cos(2 * Math.PI * j / (M - 1)) : 0); im[j] = 0; } fft(re, im); for (let k = 0; k < N / 2; k++) pw[k] += re[k] * re[k] + im[k] * im[k]; frames = 1; }
  let tot = 0, cen = 0; const bands = {};
  for (let k = 1; k < N / 2; k++) { const f = k * sr / N; tot += pw[k]; cen += pw[k] * f; }
  for (const [nm, lo, hi] of BANDS) { let e = 0; for (let k = Math.ceil(lo * N / sr); k < Math.min(N / 2, hi * N / sr); k++) e += pw[k]; bands[nm] = Math.round(1000 * e / (tot || 1)) / 10; }
  // tail
  const tn = Math.floor(0.1 * sr); let te = 0; for (const x of chs) for (let i = Math.max(0, n - tn); i < n; i++) te += x[i] * x[i];
  let corr = 0;
  if (chs.length === 2) { let lr = 0, ll = 0, rr = 0; for (let i = 0; i < n; i++) { lr += chs[0][i] * chs[1][i]; ll += chs[0][i] ** 2; rr += chs[1][i] ** 2; } corr = lr / Math.sqrt(ll * rr || 1); }
  const activeRms = first < 0 ? 0 : Math.sqrt(ss / (chs.length * Math.max(1, last - first)));
  return {
    dur: r1(n / sr * 100) / 100, active: Math.round(active * 100) / 100, start: first < 0 ? null : Math.round(first / sr * 1000) / 1000,
    peakDb: r1(20 * Math.log10(peak || 1e-9)), rmsDb: r1(20 * Math.log10(activeRms || 1e-9)), crest: r1(20 * Math.log10((peak || 1e-9) / (activeRms || 1e-9))),
    lufs: r1(lufs), mMax: r1(mMax), stMax: st.length ? r1(Math.max(...st)) : null, stMin: st.length ? r1(Math.min(...st)) : null,
    dc: dc.map((d) => +d.toExponential(1)), clip, tailDb: r1(10 * Math.log10(te / (tn * chs.length) || 1e-20)), corr: Math.round(corr * 100) / 100,
    centroid: Math.round(cen / (tot || 1)), bands,
  };
}
// K-weighted mean-square power per 400 ms block (100 ms hop)
export function blockPower(buf) {
  const sr = buf.sampleRate, kw = []; for (let c = 0; c < buf.numberOfChannels; c++) kw.push(kWeight(buf.getChannelData(c)));
  const blk = Math.floor(0.4 * sr), hop = Math.floor(0.1 * sr), out = [];
  for (let i = 0; i + blk <= buf.length; i += hop) { let s = 0; for (const y of kw) { let e = 0; for (let j = i; j < i + blk; j++) e += y[j] * y[j]; s += e / blk; } out.push(s); }
  return out;
}
// Loudness over time: [{ t, m (momentary LUFS), peak }] per `win` seconds
export function timeline(buf, win = 1) {
  const sr = buf.sampleRate, W = Math.floor(win * sr), out = [];
  const chs = []; for (let c = 0; c < buf.numberOfChannels; c++) chs.push(buf.getChannelData(c));
  const kw = chs.map(kWeight);
  for (let i = 0; i + W <= buf.length; i += W) {
    let s = 0, pk = 0;
    for (let c = 0; c < chs.length; c++) { let e = 0; for (let j = i; j < i + W; j++) { e += kw[c][j] ** 2; const a = Math.abs(chs[c][j]); if (a > pk) pk = a; } s += e / W; }
    out.push({ t: i / sr, m: r1(-0.691 + dB(s)), peak: r1(20 * Math.log10(pk || 1e-9)) });
  }
  return out;
}

// ---------------------------------------------------------------- export / pictures
export function toWav(buf, bits = 16) {
  const nc = buf.numberOfChannels, n = buf.length, sr = buf.sampleRate, bps = bits / 8;
  const ab = new ArrayBuffer(44 + n * nc * bps), v = new DataView(ab);
  const ws = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
  ws(0, 'RIFF'); v.setUint32(4, 36 + n * nc * bps, true); ws(8, 'WAVE'); ws(12, 'fmt '); v.setUint32(16, 16, true);
  v.setUint16(20, 1, true); v.setUint16(22, nc, true); v.setUint32(24, sr, true); v.setUint32(28, sr * nc * bps, true);
  v.setUint16(32, nc * bps, true); v.setUint16(34, bits, true); ws(36, 'data'); v.setUint32(40, n * nc * bps, true);
  const chs = []; for (let c = 0; c < nc; c++) chs.push(buf.getChannelData(c));
  let o = 44;
  for (let i = 0; i < n; i++) for (let c = 0; c < nc; c++) { const s = Math.max(-1, Math.min(1, chs[c][i])); v.setInt16(o, s < 0 ? s * 32768 : s * 32767, true); o += 2; }
  return ab;
}
const PAL = [[0, 0, 4], [40, 11, 84], [101, 21, 110], [159, 42, 99], [212, 72, 66], [245, 125, 21], [250, 193, 39], [252, 255, 164]];
function palette(u) { u = Math.max(0, Math.min(1, u)) * (PAL.length - 1); const i = Math.min(PAL.length - 2, Math.floor(u)), f = u - i; return PAL[i].map((c, k) => Math.round(c + (PAL[i + 1][k] - c) * f)); }
// Log-frequency spectrogram (+ waveform strip) → canvas
export function spectrogram(buf, { w = 1200, h = 360, fmin = 30, fmax = 16000, range = 90, title = '' } = {}) {
  const sr = buf.sampleRate, n = buf.length, N = 2048;
  const L = buf.getChannelData(0), R = buf.numberOfChannels > 1 ? buf.getChannelData(1) : L;
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h + 70;
  const g = cv.getContext('2d'); g.fillStyle = '#000'; g.fillRect(0, 0, w, h + 70);
  const img = g.createImageData(w, h), re = new Float64Array(N), im = new Float64Array(N);
  const win = new Float64Array(N); for (let i = 0; i < N; i++) win[i] = 0.5 - 0.5 * Math.cos(2 * Math.PI * i / (N - 1));
  const rowBin = new Float64Array(h); for (let y = 0; y < h; y++) rowBin[y] = fmin * Math.pow(fmax / fmin, 1 - y / (h - 1)) * N / sr;
  let gmax = -300; const cols = [];
  for (let x = 0; x < w; x++) {
    const c = Math.floor((x / w) * (n - N)); if (c < 0) { cols.push(null); continue; }
    for (let i = 0; i < N; i++) { re[i] = (L[c + i] + R[c + i]) * 0.5 * win[i]; im[i] = 0; }
    fft(re, im);
    const col = new Float64Array(h);
    for (let y = 0; y < h; y++) {
      const b = rowBin[y], b0 = Math.max(1, Math.floor(b)), b1 = Math.min(N / 2 - 1, Math.max(b0, Math.floor(y > 0 ? rowBin[y - 1] : b)));
      let p = 0; for (let k = b0; k <= b1; k++) p = Math.max(p, re[k] * re[k] + im[k] * im[k]);
      col[y] = 10 * Math.log10(p + 1e-20); if (col[y] > gmax) gmax = col[y];
    }
    cols.push(col);
  }
  for (let x = 0; x < w; x++) { const col = cols[x]; if (!col) continue; for (let y = 0; y < h; y++) { const [r, gg, b] = palette((col[y] - gmax + range) / range); const o = (y * w + x) * 4; img.data[o] = r; img.data[o + 1] = gg; img.data[o + 2] = b; img.data[o + 3] = 255; } }
  g.putImageData(img, 0, 0);
  g.fillStyle = 'rgba(255,255,255,0.55)'; g.font = '11px monospace';
  for (const f of [50, 100, 200, 500, 1000, 2000, 5000, 10000]) { const y = (1 - Math.log(f / fmin) / Math.log(fmax / fmin)) * (h - 1); g.fillRect(0, y, 6, 1); g.fillText(f >= 1000 ? f / 1000 + 'k' : '' + f, 8, y + 4); }
  // waveform strip (peak envelope per column)
  const y0 = h + 35;
  g.strokeStyle = '#6cf'; g.beginPath();
  for (let x = 0; x < w; x++) { const a = Math.floor(x / w * n), b = Math.floor((x + 1) / w * n); let mx = 0; for (let i = a; i < b; i++) mx = Math.max(mx, Math.abs(L[i]), Math.abs(R[i])); g.moveTo(x, y0 - mx * 32); g.lineTo(x, y0 + mx * 32); }
  g.stroke();
  g.fillStyle = '#fff'; g.fillText(`${title}  ${(n / sr).toFixed(2)} s`, w - 260, 14);
  for (let s = 0; s < n / sr; s += (n / sr > 30 ? 10 : n / sr > 6 ? 1 : 0.25)) { const x = s / (n / sr) * w; g.fillStyle = 'rgba(255,255,255,0.35)'; g.fillRect(x, h, 1, 6); }
  return cv;
}
