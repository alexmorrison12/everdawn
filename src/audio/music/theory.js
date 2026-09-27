// Music theory helpers: note names, chord symbols, scales, voice leading, melody DSL and a motif-based phrase generator.
const PC = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
export const pcOf = (s) => (PC[s[0]] + (s[1] === '#' ? 1 : s[1] === 'b' ? -1 : 0) + 12) % 12;
export function nm(s) {
  const m = /^([A-G])([#b]?)(-?\d)$/.exec(s);
  if (!m) throw new Error('bad note ' + s);
  return 12 * (+m[3] + 1) + PC[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0);
}

// Melody DSL: "D4:2 A4:1 G4:.5! r:1 | ..." → [{ b (beat), d (beats), m (midi), acc }]. '|' is a visual bar line.
export function mel(str) {
  const out = []; let b = 0;
  for (const tok of str.trim().split(/\s+/)) {
    if (tok === '|' || !tok) continue;
    const acc = tok.endsWith('!'); const [n, d] = tok.replace('!', '').split(':');
    const dur = parseFloat(d);
    if (n !== 'r') out.push({ b, d: dur, m: nm(n), acc });
    b += dur;
  }
  out.len = b;
  return out;
}

const Q = {
  '': [0, 4, 7], m: [0, 3, 7], 5: [0, 7], sus2: [0, 2, 7], sus4: [0, 5, 7], 7: [0, 4, 7, 10], m7: [0, 3, 7, 10],
  maj7: [0, 4, 7, 11], add9: [0, 4, 7, 14], madd9: [0, 3, 7, 14], m9: [0, 3, 7, 10, 14], maj9: [0, 4, 7, 11, 14],
  6: [0, 4, 7, 9], m6: [0, 3, 7, 9], dim: [0, 3, 6], aug: [0, 4, 8], 69: [0, 4, 7, 9, 14], 'maj7#11': [0, 4, 7, 11, 18],
  '7sus4': [0, 5, 7, 10], m7b5: [0, 3, 6, 10], 9: [0, 4, 7, 10, 14], add11: [0, 4, 7, 17], madd11: [0, 3, 7, 17], 'add#11': [0, 4, 7, 18],
};
const chordCache = new Map();
// "F/A", "Bbmaj7", "Em9", "Dsus4" → { sym, root, bass, iv, pcs, ess (essential pcs) }
export function chord(sym) {
  if (typeof sym === 'object') return sym;
  let c = chordCache.get(sym); if (c) return c;
  const [main, bass] = sym.split('/');
  const m = /^([A-G][#b]?)(.*)$/.exec(main);
  const root = pcOf(m[1]), iv = Q[m[2]];
  if (!iv) throw new Error('bad chord ' + sym);
  const pcs = [...new Set(iv.map((i) => (root + i) % 12))];
  const ess = [root];
  for (const i of iv) if (i !== 0 && i !== 7) ess.push((root + i) % 12);
  c = { sym, root, bass: bass ? pcOf(bass) : root, iv, pcs, ess: [...new Set(ess)] };
  chordCache.set(sym, c);
  return c;
}
export const inChord = (ch, m) => ch.pcs.includes(((m % 12) + 12) % 12);

export const MODES = {
  major: [0, 2, 4, 5, 7, 9, 11], minor: [0, 2, 3, 5, 7, 8, 10], dorian: [0, 2, 3, 5, 7, 9, 10], lydian: [0, 2, 4, 6, 7, 9, 11],
  mixolydian: [0, 2, 4, 5, 7, 9, 10], phrygian: [0, 1, 3, 5, 7, 8, 10], harmonic: [0, 2, 3, 5, 7, 8, 11], pentatonic: [0, 2, 4, 7, 9],
  minpent: [0, 3, 5, 7, 10],
};
export class Scale {
  constructor(tonic, mode = 'major') { this.t = typeof tonic === 'string' ? pcOf(tonic) : tonic; this.mode = mode; this.iv = MODES[mode]; this.pcs = this.iv.map((i) => (this.t + i) % 12); }
  has(m) { return this.pcs.includes(((m % 12) + 12) % 12); }
  snap(m, dir = 0) {
    if (this.has(m)) return m;
    for (let d = 1; d < 12; d++) {
      if (dir >= 0 && this.has(m + d)) return m + d;
      if (dir <= 0 && this.has(m - d)) return m - d;
    }
    return m;
  }
  step(m, k) { let x = this.snap(m); const s = Math.sign(k); for (let i = 0; i < Math.abs(k); i++) { do x += s; while (!this.has(x)); } return x; }
  // roman-numeral-ish degree → chord symbol within this key (deg 1..7, quality string)
  deg(d, oct = 4) { return 12 * (oct + 1) + this.t + this.iv[((d % 7) + 7) % 7] + 12 * Math.floor(d / 7); }
}
const NAMES = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];
export const pcName = (pc) => NAMES[((pc % 12) + 12) % 12];
// Roman numeral in a key → chord symbol. e.g. rn('G', 'IV') = 'C', rn('G','vi7') = 'Em7', rn('D', 'bVII') = 'C'
const RN = { I: 0, II: 2, III: 4, IV: 5, V: 7, VI: 9, VII: 11 };
export function rn(tonic, s) {
  const m = /^(b|#)?(iii|ii|iv|vii|vi|v|i|III|II|IV|VII|VI|V|I)(.*)$/.exec(s);
  if (!m) throw new Error('bad numeral ' + s);
  const up = m[2].toUpperCase(), minor = m[2] !== up;
  let root = (pcOf(tonic) + RN[up] + (m[1] === 'b' ? -1 : m[1] === '#' ? 1 : 0) + 12) % 12;
  let q = m[3] || '';
  let bass = '';
  const sl = q.indexOf('/'); if (sl >= 0) { bass = q.slice(sl + 1); q = q.slice(0, sl); }
  if (minor && !q.startsWith('m') && q !== 'dim' && q !== 'm7b5') q = 'm' + q;
  if (q === 'm7b5' || q === 'dim') { /* keep */ }
  let sym = pcName(root) + q;
  if (bass) {
    // bass given as chord degree: /3 /5 /7
    const ch = chord(sym);
    const bi = { 3: 1, 5: 2, 7: 3 }[bass]; const bpc = bi != null ? (root + ch.iv[bi]) % 12 : pcOf(bass);
    sym += '/' + pcName(bpc);
  }
  return sym;
}

// ---- voice leading ----
function combos(arr, k, start = 0, cur = [], out = []) {
  if (cur.length === k) { out.push(cur.slice()); return out; }
  for (let i = start; i <= arr.length - (k - cur.length); i++) { cur.push(arr[i]); combos(arr, k, i + 1, cur, out); cur.pop(); }
  return out;
}
// Choose n chord tones in [lo, hi] close to prev (smooth voice leading) with idiomatic spacing.
export function voiceChord(ch, n, lo, hi, prev = null, center = null) {
  ch = chord(ch);
  const cands = [];
  for (let m = lo; m <= hi; m++) if (inChord(ch, m)) cands.push(m);
  if (cands.length <= n) return cands;
  const target = center ?? (lo + hi) / 2;
  let best = null, bestS = 1e9;
  const pv = prev && prev.length ? prev.slice().sort((a, b) => a - b) : null;
  for (const c of combos(cands, n)) {
    let s = 0;
    const pcs = c.map((m) => m % 12);
    for (const e of ch.ess) if (!pcs.includes(e)) s += 60;
    const uniq = new Set(pcs).size; s += (n - uniq) * (uniq < ch.pcs.length ? 12 : 3);
    for (let i = 1; i < n; i++) {
      const a = c[i - 1], b = c[i], iv = b - a;
      if (a < 48 && iv < 7) s += 14; else if (a < 55 && iv < 4) s += 8;
      if (iv === 1) s += 14; else if (iv === 2 && a < 60) s += 5;
      if (i > 1 && iv > 12) s += 5;
      if (i === 1 && iv > 19) s += 5;
    }
    if (pv) {
      for (let i = 0; i < n; i++) { const p = pv[Math.min(pv.length - 1, Math.round(i * (pv.length - 1) / Math.max(1, n - 1)))]; s += Math.abs(c[i] - p) * 1.0; }
    } else {
      const mean = c.reduce((x, y) => x + y, 0) / n; s += Math.abs(mean - target) * 0.8;
    }
    if (s < bestS) { bestS = s; best = c; }
  }
  return best;
}
// Nearest pitch of pitch-class pc to m within [lo, hi]
export function nearestPc(pc, m, lo = 0, hi = 127) {
  let best = null;
  for (let x = lo; x <= hi; x++) if (((x % 12) + 12) % 12 === pc && (best === null || Math.abs(x - m) < Math.abs(best - m))) best = x;
  return best ?? m;
}
export function bassOf(ch, lo = 36, hi = 50, prev = null) {
  ch = chord(ch);
  return nearestPc(ch.bass, prev ?? (lo + hi) / 2, lo, hi);
}

// ---- rhythm cells (in beats) ----
export const CELLS = {
  3: [[2, 1], [1, 1, 1], [1.5, 0.5, 1], [1, 2], [0.5, 0.5, 1, 1], [2, 0.5, 0.5], [1, 0.5, 0.5, 1]],
  4: [[2, 2], [1, 1, 2], [1.5, 0.5, 2], [3, 1], [1, 1, 1, 1], [0.5, 0.5, 1, 2], [2, 1, 1], [1.5, 0.5, 1, 1], [1, 0.5, 0.5, 2]],
  6: [[2, 1, 2, 1], [3, 3], [1, 1, 1, 2, 1], [2, 1, 3], [3, 2, 1], [1, 1, 1, 3], [2, 1, 1, 1, 1]],
};
export const CAD = { 3: [[3], [1, 2], [0.5, 0.5, 2]], 4: [[4], [1, 3], [2, 2], [1, 1, 2]], 6: [[6], [3, 3], [1, 2, 3]] };

// Motif-driven phrase generator. chordAt(beat) → chord. Returns [{ b, d, m }].
// Strong beats land on chord tones, weak beats move by step toward an arch-shaped contour, leaps are recovered
// by contrary step, bar rhythms follow an A B A' cadence pattern, and the phrase ends long on a stable tone.
export function genPhrase(rng, o) {
  const { scale, chordAt, bars = 4, bpb = 4, lo = 60, hi = 84, start = null, cells = CELLS[bpb], cad = CAD[bpb],
    contour = 'arch', end = 'stable', rest = 0.08, strongEvery = bpb === 6 ? 3 : bpb === 4 ? 2 : 3 } = o;
  const A = rng.pick(cells), B = rng.pick(cells), C = rng.pick(cells);
  const rhythm = [];
  for (let i = 0; i < bars; i++) {
    const last = i === bars - 1;
    const cell = last ? rng.pick(cad) : (i % 4 === 0 ? A : i % 4 === 1 ? B : i % 4 === 2 ? (rng.chance(0.55) ? A : C) : rng.pick(cells));
    let b = i * bpb;
    for (const d of cell) { rhythm.push({ b, d }); b += d; }
  }
  const total = bars * bpb;
  const mid = (lo + hi) / 2;
  let cur = start ?? scale.snap(Math.round(mid - 3 + rng.range(-2, 2)));
  const ch0 = chord(chordAt(0));
  if (!inChord(ch0, cur)) cur = nearestChordTone(ch0, cur, lo, hi);
  const peak = Math.min(hi - 1, cur + rng.int(4, 9));
  const out = []; let prevIv = 0, repeats = 0;
  for (let i = 0; i < rhythm.length; i++) {
    const { b, d } = rhythm[i];
    const u = b / total;
    let want;
    if (contour === 'arch') want = cur + (u < 0.6 ? (peak - cur) * 0.35 : -(cur - (lo + 3)) * 0.3);
    else if (contour === 'down') want = cur - 1.5;
    else if (contour === 'up') want = cur + 1.5;
    else want = cur;
    const ch = chord(chordAt(b));
    const strong = b % strongEvery === 0 || d >= Math.min(2, bpb / 2);
    const lastNote = i === rhythm.length - 1;
    let m;
    if (i === 0) m = cur;
    else if (lastNote) {
      const stable = end === 'root' ? [ch.root] : [ch.root, (ch.root + ch.iv[1]) % 12, (ch.root + 7) % 12];
      m = null;
      for (let dd = 0; dd < 12 && m === null; dd++) for (const s of [-1, 1]) { const x = cur + s * dd; if (x >= lo && x <= hi && stable.includes(((x % 12) + 12) % 12)) { m = x; break; } }
      m ??= cur;
    } else if (Math.abs(prevIv) > 4) {
      m = scale.step(cur, -Math.sign(prevIv));
      if (strong && !inChord(ch, m)) { const alt = scale.step(m, -Math.sign(prevIv)); if (inChord(ch, alt)) m = alt; }
    } else if (strong) {
      const aim = cur + (want - cur) * 0.7 + rng.range(-2, 2);
      m = nearestChordTone(ch, aim, lo, hi, cur);
      if (rng.chance(0.18)) m = nearestChordTone(ch, cur + rng.sign() * rng.int(4, 7), lo, hi, cur);
    } else {
      const dir = want > cur + 0.5 ? 1 : want < cur - 0.5 ? -1 : rng.sign();
      m = scale.step(cur, rng.chance(0.82) ? dir : -dir);
      if (rng.chance(0.12)) m = scale.step(cur, dir * 2);
    }
    m = Math.max(lo, Math.min(hi, m));
    if (!scale.has(m) && !inChord(ch, m)) m = scale.snap(m);
    if (m === cur && !lastNote) { if (++repeats > 1) { m = scale.step(cur, rng.sign()); repeats = 0; } } else repeats = 0;
    if (i > 0 && !lastNote && rng.chance(rest) && d <= 1) { continue; }
    prevIv = m - cur; cur = m;
    out.push({ b, d, m });
  }
  out.len = total;
  return out;
}
export function nearestChordTone(ch, target, lo, hi, avoid = null) {
  ch = chord(ch);
  let best = null, bd = 1e9;
  for (let x = Math.max(lo, Math.floor(target) - 12); x <= Math.min(hi, Math.ceil(target) + 12); x++) {
    if (!inChord(ch, x)) continue;
    let dd = Math.abs(x - target); if (x === avoid) dd += 1.5;
    if (dd < bd) { bd = dd; best = x; }
  }
  return best ?? Math.round(target);
}
// Weighted Markov walk over roman numerals.
export function markov(rng, table, start, n, endOn = null) {
  const out = [start]; let cur = start;
  for (let i = 1; i < n; i++) {
    const row = table[cur] || table.I;
    const opts = Object.entries(row).map(([k, w]) => ({ k, w: (i === n - 1 && endOn && endOn.includes(k)) ? w * 6 : w }));
    cur = rng.weighted(opts).k; out.push(cur);
  }
  return out;
}
