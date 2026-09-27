// 'raid' / 'raidP2' / 'raidP3' — the dragon fight. One composer with three phases; music('raidP2') while the raid
// is playing switches phase on the next bar through a one-bar transition (timpani roll, cymbal swell, brass rip,
// taiko fill) instead of a crossfade, so the groove never breaks.
//   P1 ground   D minor 138 BPM: 3-3-2 taiko, spiccato string ostinato, brass stabs, horn theme, choir chant
//   P2 airborne E minor 146 BPM: higher ostinato, constant small taiko, extra brass calls
//   P3 enrage   F minor 154 BPM: relentless — taiko on every beat + 16ths, Phrygian bII, choir staccato
import { Track } from './track.js';
import { Strings, Horn, Choir, Taiko, Timpani, Cymbal } from './instruments.js';
import { mel, chord, pcName } from './theory.js';

const THEME = mel('D4:1.5! D4:.5 A4:2 | G4:.5 F4:.5 E4:.5 F4:.5 D4:2 | D4:1.5! D4:.5 Bb4:2 | A4:.5 G4:.5 F4:.5 G4:.5 E4:2 | F4:1 A4:1 D5:2! | C5:.5 Bb4:.5 A4:.5 Bb4:.5 F4:2 | G4:1 Bb4:1 A4:1 C#5:1 | D5:4!');
const PH = {
  1: { shift: 0, bpm: 138, A: ['Dm', 'Dm', 'Bb', 'C', 'Dm', 'Dm', 'Gm', 'A'], C: ['Bb', 'C', 'Dm', 'Dm', 'Gm', 'Bb', 'A', 'A'] },
  2: { shift: 2, bpm: 146, A: ['Dm', 'Bb', 'C', 'A', 'Dm', 'Bb', 'Gm', 'A'], C: ['Gm', 'A', 'Dm', 'Bb', 'Gm', 'C', 'A', 'A'] },
  3: { shift: 3, bpm: 154, A: ['Dm', 'Eb', 'Dm', 'C', 'Dm', 'Eb', 'Bb', 'A'], C: ['Dm', 'Eb', 'Dm', 'Eb', 'Bb', 'C', 'A', 'A'] },
};
const B_CH = ['Dm', 'Dm', 'Bb', 'C', 'Dm', 'Bb', ['Gm', 'A'], 'Dm'];
const BRIDGE = ['Dm', 'Bb', 'Gm', 'A'];
const tc = (sym, s) => { const c = chord(sym); const q = sym.slice(sym[1] === 'b' || sym[1] === '#' ? 2 : 1).split('/')[0]; return pcName(c.root + s) + q + (sym.includes('/') ? '/' + pcName(c.bass + s) : ''); };

export class Raid extends Track {
  constructor(e, n, t0, seed, phase = 1) {
    super(e, n, t0, seed);
    this.mixKey = 'raid';
    this.I('low', Strings, { pan: 0.2, rev: 0.25, bright: 1, body: 200, hp: 40, voices: 2 });
    this.I('hi', Strings, { pan: -0.35, rev: 0.35, bright: 1.1, voices: 2 });
    this.I('str', Strings, { pan: -0.1, rev: 0.4 });
    this.I('brass', Horn, { kind: 'brass', pan: 0.2, rev: 0.4, scale: 0.09 });
    this.I('horn', Horn, { pan: 0.3, rev: 0.5 });
    this.I('choir', Choir, { vowel: 'ah', rev: 0.5, scale: 0.2 });
    this.I('taiko', Taiko, { size: 'big', rev: 0.35 });
    this.I('mid', Taiko, { size: 'mid', pan: 0.25, rev: 0.3, scale: 0.45 });
    this.I('small', Taiko, { size: 'small', pan: -0.25, rev: 0.3 });
    this.I('timp', Timpani, { rev: 0.4 });
    this.I('cym', Cymbal, { rev: 0.45 });
    this.setup(phase, true);
  }
  setup(phase, first = false) {
    this.phase = phase; const P = PH[phase];
    this.tempo(P.bpm, 4); this.sh = P.shift;
    this.form = first && phase === 1 ? ['intro', 'A', 'B', 'C', 'bridge'] : phase === 3 ? ['A', 'C', 'B', 'C', 'bridge'] : ['A', 'B', 'C', 'bridge'];
    this.si = 0; this.sb = 0; this.pending = 0;
  }
  setPhase(name) { const p = name === 'raidP3' ? 3 : name === 'raidP2' ? 2 : 1; if (p !== this.phase || this.pending) this.pending = p; }
  chs(type) { const P = PH[this.phase]; return type === 'A' || type === 'intro' ? P.A : type === 'C' ? P.C : type === 'B' ? B_CH : BRIDGE; }
  playBar(bar, t) {
    const I = this.inst, s = this.spb, B = this.barDur, r = this.rng;
    if (this.pending) { const p = this.pending; this.transition(t); this.setup(p); return B; }
    const type = this.form[this.si], sb = this.sb, len = type === 'intro' || type === 'bridge' ? 4 : 8;
    const raw = this.chs(type)[sb % 8], list = (Array.isArray(raw) ? raw : [raw]).map((c) => tc(c, this.sh));
    const ph = this.phase, sh = this.sh;
    const each = (fn) => list.forEach((c, i) => fn(c, t + i * (B / list.length), B / list.length));
    const c0 = chord(list[0]), tp = 38 + ((c0.bass - 2 + 12) % 12); // timpani pitch D2..C#3
    const P3 = ph === 3, P2 = ph === 2;
    // --- drums ---
    const big = type === 'intro' ? (sb < 2 ? [0] : [0, 3, 6]) : P3 ? [0, 2, 3, 4, 6] : P2 ? [0, 3, 4, 6] : [0, 3, 6];
    for (const k of big) I.taiko.hit(this.bt(t, k * 0.5), k === 0 ? 0.95 : k === 3 || k === 6 ? 0.78 : 0.6);
    if (type !== 'intro') { I.mid.hit(this.bt(t, 1), 0.5); I.mid.hit(this.bt(t, 3), 0.55, { rim: sb % 2 === 1 }); }
    if (P3 || (type === 'C') || (P2 && type !== 'B')) for (let k = 0; k < (P3 ? 16 : 8); k++) I.small.hit(this.bt(t, k * (P3 ? 0.25 : 0.5)), (P3 ? (k % 4 === 0 ? 0.5 : 0.22) : (k % 2 ? 0.22 : 0.32)));
    if (type !== 'intro' || sb >= 2) I.timp.hit(t, tp, sb % 4 === 0 ? 0.8 : 0.55);
    if (sb === 0 && type !== 'intro') I.cym.crash(t, type === 'bridge' ? 0.5 : 0.75);
    if (sb === len - 1) { I.cym.swell(this.bt(t, 1), B - s, 0.55); if (type !== 'intro') for (let k = 0; k < 4; k++) I.small.hit(this.bt(t, 3 + k * 0.25), 0.3 + k * 0.1); }
    if (type === 'intro' && sb === 3) I.timp.roll(t, 38 + sh, B - 0.05, 0.1, 0.9, { hit: false });
    // --- low strings: 8ths (16ths in P3) with 3-3-2 accents ---
    const step = P3 ? 0.25 : 0.5, n = Math.round(4 / step);
    each((c, tt, d) => {
      const cc = chord(c), rt = 36 + ((cc.bass - 0 + 12) % 12) + (cc.bass < 2 ? 12 : 0);
      for (let k = 0; k < Math.round(d / (step * s)); k++) {
        const slot = Math.round(k * step * 2) % 8, acc = slot === 0 || slot === 3 || slot === 6;
        I.low.note(tt + k * step * s, rt + ((P3 && k % 2) ? 12 : 0), s * step * 0.8, acc ? 0.62 : 0.4, { art: 'spicc', d: 0.12 });
      }
    });
    // --- high string ostinato (16ths) ---
    if (type !== 'intro' && type !== 'bridge') {
      each((c, tt, d) => {
        const tn = this.tones(c, (P2 || P3 ? 74 : 67) , 4), pat = P3 ? [3, 0, 3, 1, 3, 2, 3, 1] : [2, 0, 1, 0, 3, 0, 1, 0];
        for (let k = 0; k < Math.round(d / (0.25 * s)); k++) I.hi.note(tt + k * 0.25 * s, tn[pat[k % 8]], s * 0.22, k % 4 === 0 ? 0.5 : 0.36, { art: 'spicc', d: 0.09 });
      });
    }
    // --- brass stabs on chord changes + anticipations ---
    if (type === 'A' || type === 'C' || (P3 && type !== 'bridge')) {
      each((c, tt) => { for (const m of this.voicing(c, 4, 50, 69, 'bst')) I.brass.note(tt, m, s * 0.9, P3 ? 0.8 : 0.7, { art: 'stab' }); });
      if (sb % 2 === 1 || P3) { const nx = tc([].concat(this.chs(type)[(sb + 1) % 8])[0], sh); for (const m of this.voicing(nx, 3, 50, 67, 'bst2')) I.brass.note(this.bt(t, 3.5), m, s * 0.5, 0.6, { art: 'stab' }); }
      if (P2 && sb % 4 === 2) [0, 7, 12].forEach((iv, i) => I.horn.note(this.bt(t, 2 + i * 0.5), 57 + sh + iv, s * (i === 2 ? 1.4 : 0.45), 0.7));
    }
    // --- theme / pads / choir ---
    if (type === 'B') {
      this.line(I.horn, t, this.barSlice(THEME, sb, 4), { vel: 0.8, tr: sh });
      this.line(I.brass, t, this.barSlice(THEME, sb, 4), { vel: 0.55, tr: sh - 12 });
      each((c, tt, d) => { this.pad(I.choir, tt, d, c, { n: 4, lo: 55, hi: 72, vel: 0.5, a: 0.25, key: 'choir' }); this.pad(I.str, tt, d, c, { n: 4, lo: 50, hi: 69, vel: 0.35, a: 0.2 }); });
    }
    if (type === 'C') {
      // choir chant: staccato 3-3-2 rhythm on chord tones (P3 constant 8ths)
      each((c, tt, d) => {
        const v = this.voicing(c, 3, 57, 72, 'chant');
        const slots = P3 ? [0, 1, 2, 3, 4, 5, 6, 7] : [0, 2, 3, 5, 6];
        for (const sl of slots) if (sl * 0.5 * s < d - 0.01) for (const m of v) I.choir.note(tt + sl * 0.5 * s, m, s * 0.4, sl % 3 === 0 ? 0.62 : 0.45, { art: 'stacc' });
        this.pad(I.str, tt, d, c, { n: 4, lo: 52, hi: 72, vel: 0.3, a: 0.2 });
      });
      if (sb >= 4) this.line(I.horn, t, [{ b: 0, d: 3.8, m: this.voicing(list[0], 1, 64, 76, 'hornTop')[0] }], { vel: 0.6 });
    }
    if (type === 'bridge') {
      if (sb === 0) this.pad(I.choir, t, B * 4, list[0], { n: 4, lo: 55, hi: 74, vel: 0.55, a: 2.5, swell: true, key: 'choir' });
      each((c, tt, d) => this.bass(I.str, tt, d, c, { lo: 45, hi: 57, vel: 0.35, a: 0.5 }));
      if (sb === 3) I.timp.roll(t, 38 + sh, B - 0.05, 0.1, 0.9, { hit: false });
    }
    if (++this.sb >= len) { this.sb = 0; if (++this.si >= this.form.length) this.si = this.phase === 1 && this.form[0] === 'intro' ? 1 : 0; }
    return B;
  }
  transition(t) {
    const I = this.inst, s = this.spb, B = this.barDur, sh = this.sh;
    I.timp.roll(t, 45 + sh, B - 0.05, 0.15, 1, { hit: false });
    I.cym.swell(t, B - 0.02, 0.7);
    for (let k = 0; k < 16; k++) I.small.hit(this.bt(t, k * 0.25), 0.2 + k * 0.035);
    I.taiko.hit(t, 0.9); I.taiko.hit(this.bt(t, 3), 0.8);
    for (let k = 0; k < 8; k++) I.brass.note(this.bt(t, 2 + k * 0.25), 50 + sh + k * 2, s * 0.24, 0.45 + k * 0.05, { art: 'stab' });
    this.pad(I.choir, t, B, tc('A', sh), { n: 4, lo: 55, hi: 74, vel: 0.55, a: 1.5, swell: true, key: 'choir' });
    for (let k = 0; k < 8; k++) I.low.note(this.bt(t, k * 0.5), 45 + sh - 12, s * 0.4, 0.5 + k * 0.04, { art: 'spicc' });
  }
}
