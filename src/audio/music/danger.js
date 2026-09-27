// 'danger' — tense ostinato for elites/rares and the dark forest. C minor/Phrygian, ~112 BPM 4/4.
// Spiccato low-string ostinato, taiko pulses, low brass swells and stabs, high string tremolo clusters, dark choir.
// Form cycles prowl → stalk → strike → recede with new ostinato patterns and progressions each time.
import { Track } from './track.js';
import { Strings, Horn, Choir, Taiko, Timpani, Cymbal } from './instruments.js';
import { chord } from './theory.js';

const PROGS = [
  ['Cm', 'Cm', 'Ab', 'Ab', 'Fm', 'Fm', 'Db', 'G'],
  ['Cm', 'Db', 'Cm', 'Bb', 'Ab', 'Db', 'Gsus4', 'G'],
  ['Cm', 'Cm', 'Ebm/Bb', 'Ab', 'Cm', 'Cm', 'Db', 'Db'],
];
const OST = [
  [0, 0, 3, 0, 1, 0, -2, 0],
  [0, 12, 0, 10, 0, 8, 0, 7],
  [0, 0, 7, 0, 6, 0, 3, 1],
  [0, 3, 7, 3, 0, 3, 8, 7],
];

export class Danger extends Track {
  constructor(e, n, t0, seed) {
    super(e, n, t0, seed);
    this.tempo(this.rng.range(108, 116), 4);
    this.I('low', Strings, { pan: 0.2, rev: 0.25, bright: 0.9, body: 200, hp: 45, voices: 2 });
    this.I('hi', Strings, { pan: -0.35, rev: 0.45, bright: 0.9 });
    this.I('brass', Horn, { kind: 'brass', pan: 0.25, rev: 0.4, scale: 0.09 });
    this.I('horn', Horn, { pan: 0.3, rev: 0.5 });
    this.I('choir', Choir, { vowel: 'oh', rev: 0.55, scale: 0.18 });
    this.I('taiko', Taiko, { size: 'big', rev: 0.35 });
    this.I('small', Taiko, { size: 'small', pan: -0.2, rev: 0.3 });
    this.I('timp', Timpani, { rev: 0.4 });
    this.I('cym', Cymbal, { rev: 0.45 });
    this.form = ['prowl', 'stalk', 'strike', 'recede']; this.si = 0; this.sb = 0; this.cycle = 0;
    this.newCycle();
  }
  newCycle() {
    const r = this.rng;
    this.prog = r.pick(PROGS); this.ost = r.pick(OST); this.ost2 = r.pick(OST);
  }
  playBar(bar, t) {
    const I = this.inst, B = this.barDur, s = this.spb, r = this.rng;
    const type = this.form[this.si], sb = this.sb, len = type === 'recede' ? 4 : 8;
    const chs = type === 'recede' ? ['Cm', 'Cm', 'Db', 'Cm'] : this.prog;
    const ch = chs[sb % chs.length], c = chord(ch), root = 36 + ((c.bass - 0 + 12) % 12);
    const ost = sb >= 4 ? this.ost2 : this.ost;
    const inten = { prowl: 0.78, stalk: 0.88, strike: 1, recede: 0.55 }[type];
    // ostinato (8ths)
    if (type !== 'recede' || sb < 2) for (let k = 0; k < 8; k++) {
      const m = root + ost[k];
      I.low.note(this.bt(t, k * 0.5) + this.hum(3), m, s * 0.45, (k % 2 === 0 ? 0.62 : 0.45) * inten, { art: 'spicc', d: 0.15 });
      if (type === 'strike') I.low.note(this.bt(t, k * 0.5), m + 12, s * 0.45, 0.3, { art: 'spicc', d: 0.12 });
    }
    // drums
    if (type === 'prowl') { I.taiko.hit(t, 0.55); if (sb % 2 === 1) I.taiko.hit(this.bt(t, 2.5), 0.35); }
    if (type === 'stalk') { I.taiko.hit(t, 0.7); I.taiko.hit(this.bt(t, 2), 0.55); for (let k = 0; k < 8; k++) I.small.hit(this.bt(t, k * 0.5), k % 2 ? 0.2 : 0.3); }
    if (type === 'strike') {
      for (const b of [0, 1.5, 3]) I.taiko.hit(this.bt(t, b), b === 0 ? 0.9 : 0.7);
      for (let k = 0; k < 16; k++) I.small.hit(this.bt(t, k * 0.25), k % 4 === 0 ? 0.45 : k % 2 ? 0.18 : 0.3);
      if (sb % 2 === 0) I.timp.hit(t, root < 40 ? root : root - 12, 0.7);
      if (sb === 0) I.cym.crash(t, 0.6);
    }
    if (type === 'recede') { if (sb === 0) I.timp.hit(t, 36, 0.5); if (sb === 3) I.timp.roll(this.bt(t, 1), 36, B - s - 0.05, 0.03, 0.55, { hit: false }); }
    // low sul-tasto tremolo under the prowl (unease), high tremolo cluster in stalk/recede
    if (type === 'prowl' && sb % 4 === 0) { I.hi.note(t, 55, B * 4 - 0.1, 0.22, { art: 'trem', a: 1.2, r: 0.8, bright: 0.6 }); I.hi.note(t, 56, B * 4 - 0.1, 0.16, { art: 'trem', a: 1.8, r: 0.8, bright: 0.6 }); }
    if ((type === 'stalk' || type === 'recede') && sb % 4 === 0) {
      const top = 79 + (c.root % 12 === 1 ? 1 : 0);
      I.hi.note(t, top, B * 4 - 0.1, 0.28, { art: 'trem', a: 1.5, r: 0.8 }); I.hi.note(t, top + 1, B * 4 - 0.1, 0.22, { art: 'trem', a: 2, r: 0.8 });
    }
    // brass
    if (type === 'stalk' && sb % 4 === 0) this.pad(I.horn, t, B * 2, ch, { n: 2, lo: 48, hi: 62, vel: 0.5, art: 'swell', key: 'hornL' });
    if (type === 'strike') {
      const v = this.voicing(ch, 4, 48, 67, 'bst');
      for (const m of v) { I.brass.note(t, m, s * 0.8, 0.75, { art: 'stab' }); if (sb % 2 === 1) I.brass.note(this.bt(t, 2.5), m, s * 0.6, 0.6, { art: 'stab' }); }
      if (sb % 4 === 0) this.pad(I.choir, t, B * 4, ch, { n: 4, lo: 48, hi: 67, vel: 0.5, a: 0.8, key: 'choir' });
      if (sb === 7) I.cym.swell(this.bt(t, 1), B - s, 0.5);
    }
    if (++this.sb >= len) {
      this.sb = 0;
      if (++this.si >= this.form.length) { this.si = 0; this.cycle++; this.newCycle(); if (r.chance(0.5)) this.form = ['stalk', 'strike', 'prowl', 'strike', 'recede']; else this.form = ['prowl', 'stalk', 'strike', 'recede']; }
    }
    return B;
  }
}
