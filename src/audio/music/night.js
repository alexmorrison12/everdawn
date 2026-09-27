// 'night' — sparse, gentle, mysterious. E minor / Dorian colours, ~56 BPM 4/4. Soft pads and "oo" choir that
// breathe in and out, sparse harp and celesta, a low flute now and then, a distant bell; long silences between pieces.
import { Track } from './track.js';
import { Strings, Wind, Harp, Choir, Bells, Pad } from './instruments.js';
import { Scale, genPhrase } from './theory.js';

const SEQS = [
  ['Em9', 'Cmaj7', 'Am9', 'Bsus4'],
  ['Em9', 'A/E', 'Em9', 'D69'],
  ['Emadd9', 'Gmaj7', 'Cmaj7#11', 'Bsus4'],
  ['Em9', 'Fmaj7#11', 'Em9', 'Dsus2'],
  ['Cmaj7', 'G/B', 'Am9', 'Em9'],
];
const PENTA = [64, 66, 67, 71, 74, 76, 78, 79, 83];

export class Night extends Track {
  constructor(e, n, t0, seed) {
    super(e, n, t0, seed);
    this.tempo(this.rng.range(52, 58), 4);
    this.I('pad', Pad, { rev: 0.6 });
    this.I('str', Strings, { pan: -0.15, rev: 0.5, bright: 0.55 });
    this.I('low', Strings, { pan: 0.25, rev: 0.4, bright: 0.5, body: 160, hp: 30, voices: 2 });
    this.I('choir', Choir, { vowel: 'oo', rev: 0.65, scale: 0.16 });
    this.I('harp', Harp, { pan: -0.4, rev: 0.6 });
    this.I('cel', Bells, { kind: 'celesta', pan: 0.35, rev: 0.65 });
    this.I('bell', Bells, { kind: 'tubular', pan: 0.45, rev: 0.7, scale: 0.05 });
    this.I('flute', Wind, { kind: 'flute', pan: -0.05, rev: 0.6 });
    this.scale = new Scale('E', 'dorian');
    this.piece();
  }
  piece() {
    const r = this.rng;
    this.secs = 3 + r.int(0, 2); this.sec = 0; this.gap = 0;
    this.section();
  }
  section() {
    const r = this.rng;
    this.seq = r.pick(SEQS); this.sb = 0;
    this.choirOn = r.chance(0.5); this.padInst = r.chance(0.5) ? 'pad' : 'str';
    this.fl = null;
    if (r.chance(0.55)) {
      const off = r.pick([2, 4]);
      const chordAt = (b) => this.seq[Math.floor((b / 4 + off) / 2) % 4];
      this.fl = { bar: off, notes: genPhrase(r, { scale: this.scale, chordAt, bars: 2, bpb: 4, lo: 64, hi: 79, cells: [[2, 2], [3, 1], [1.5, 0.5, 2]], cad: [[4]], rest: 0.15 }) };
    }
  }
  playBar(bar, t) {
    const B = this.barDur, I = this.inst, r = this.rng;
    if (this.gap > 0) { if (--this.gap === 0) this.piece(); return B; }
    const sb = this.sb, ch = this.seq[Math.floor(sb / 2) % 4];
    if (sb % 2 === 0) {
      this.pad(I[this.padInst], t, B * 2, ch, { n: 4, lo: 52, hi: 71, vel: this.padInst === 'pad' ? 0.42 : 0.26, a: 1.8, r: 2.2, key: 'pad' });
      this.bass(I.low, t, B * 2, ch, { lo: 28, hi: 40, vel: 0.24, a: 2, r: 2 });
      if (this.choirOn && sb % 4 === 0) this.pad(I.choir, this.bt(t, 1), B * 3, ch, { n: 3, lo: 57, hi: 72, vel: 0.34, a: 2.5, r: 2.5, swell: true, key: 'choir' });
    }
    // harp: slow broken chord, sometimes absent
    if (r.chance(0.55)) {
      const tn = this.tones(ch, 52, 6), start = r.pick([0, 1, 2]);
      for (let k = start; k < 4; k++) if (r.chance(0.7)) I.harp.note(this.bt(t, k) + this.hum(15), tn[(k * 2 + sb) % tn.length], B, 0.22 + 0.06 * r.next());
    }
    // celesta: a small pentatonic figure
    if (r.chance(0.3)) {
      const n = 2 + r.int(0, 2); let b = r.pick([0.5, 1, 2]);
      let m = r.pick(PENTA) + 12;
      for (let k = 0; k < n && b < 4; k++) { I.cel.note(this.bt(t, b), m, 1, 0.26); b += r.pick([0.5, 1, 1]); m = PENTA[Math.max(0, Math.min(PENTA.length - 1, PENTA.indexOf(m - 12) + r.pick([-2, -1, 1, 2])))] + 12 || m; }
    }
    if (this.fl && sb >= this.fl.bar && sb < this.fl.bar + 2) this.line(I.flute, t, this.barSlice(this.fl.notes, sb - this.fl.bar, 4), { vel: 0.4, hum: 12 });
    if (sb === 0 && this.sec % 2 === 0) I.bell.note(this.bt(t, 0.5), 52, 4, 0.3);
    if (++this.sb >= 8) {
      this.sec++;
      if (this.sec >= this.secs) this.gap = Math.max(1, Math.round(r.range(15, 35) / B));
      else this.section();
    }
    return B;
  }
}
