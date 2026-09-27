// Stingers: 'victory' (triumphant ~6.5 s fanfare, the raid motif turned major) and 'wipe' (somber ~7 s).
import { Track } from './track.js';
import { Strings, Horn, Choir, Timpani, Cymbal, Harp, Bells } from './instruments.js';
import { mel } from './theory.js';

export class Victory extends Track {
  constructor(e, n, t0, seed) {
    super(e, n, t0, seed);
    this.tempo(100, 4);
    this.I('str', Strings, { pan: -0.2, rev: 0.45 });
    this.I('low', Strings, { pan: 0.25, rev: 0.35, bright: 0.8, body: 180, hp: 35 });
    this.I('brass', Horn, { kind: 'brass', pan: 0.15, rev: 0.45, scale: 0.1 });
    this.I('horn', Horn, { pan: 0.3, rev: 0.55 });
    this.I('choir', Choir, { vowel: 'ah', rev: 0.6 });
    this.I('timp', Timpani, { rev: 0.45 });
    this.I('cym', Cymbal, { rev: 0.5 });
    this.I('harp', Harp, { rev: 0.5 });
    this.I('glock', Bells, { kind: 'glock', rev: 0.6, scale: 0.08 });
  }
  playBar(bar, t) {
    if (bar > 0) return 0;
    const I = this.inst, s = this.spb, T = (b) => t + b * s;
    // pickup: timpani roll + cymbal swell + string tremolo
    I.timp.roll(t, 45, 1.5 * s, 0.1, 0.85, { hit: false });
    I.cym.swell(t, 1.5 * s, 0.55);
    I.str.note(t, 57, 1.5 * s, 0.35, { art: 'trem', a: 0.4 }); I.str.note(t, 69, 1.5 * s, 0.3, { art: 'trem', a: 0.4 });
    // fanfare (raid motif in D major): brass + horns in octaves
    const fan = mel('D4:.75! D4:.25 A4:1 | F#4:.5 A4:.5 D5:1.5!');
    this.line(I.brass, T(1.5), fan, { vel: 0.8, legato: 0.9 });
    this.line(I.horn, T(1.5), fan, { vel: 0.7, tr: -12, legato: 0.9 });
    I.timp.hit(T(1.5), 38, 0.8); I.timp.hit(T(2.25), 38, 0.55); I.timp.hit(T(2.5), 45, 0.7);
    for (const b of [1.5, 2.5, 3.5]) this.bass(I.low, T(b), s * 0.9, 'D', { lo: 38, hi: 50, vel: 0.5, oct: true });
    // tutti D major
    const H = T(4.5);
    I.cym.crash(H, 0.9); I.timp.hit(H, 38, 1);
    this.pad(I.str, H, s * 2, 'D', { n: 5, lo: 50, hi: 78, vel: 0.55, a: 0.05 });
    this.pad(I.choir, H, s * 2, 'D', { n: 4, lo: 57, hi: 76, vel: 0.6, a: 0.1, key: 'choir' });
    this.pad(I.brass, H, s * 1.6, 'D', { n: 4, lo: 50, hi: 69, vel: 0.7, key: 'brass' });
    this.bass(I.low, H, s * 2, 'D', { lo: 26, hi: 38, vel: 0.6, oct: true });
    // plagal "amen": G/D → D(add9)
    const G = T(6.5), E = T(7.5);
    this.pad(I.str, G, s, 'G/D', { n: 5, lo: 50, hi: 79, vel: 0.5, a: 0.1 });
    this.pad(I.choir, G, s, 'G/D', { n: 4, lo: 57, hi: 76, vel: 0.5, a: 0.1, key: 'choir' });
    this.pad(I.horn, G, s, 'G/D', { n: 3, lo: 55, hi: 67, vel: 0.55, key: 'horns' });
    this.pad(I.str, E, s * 2.2, 'Dadd9', { n: 5, lo: 50, hi: 79, vel: 0.5, a: 0.1, r: 1.6 });
    this.pad(I.choir, E, s * 2.2, 'Dadd9', { n: 4, lo: 57, hi: 76, vel: 0.5, a: 0.1, r: 1.6, key: 'choir' });
    this.pad(I.horn, E, s * 2, 'D', { n: 3, lo: 55, hi: 67, vel: 0.5, key: 'horns', r: 1.2 });
    this.bass(I.low, G, s, 'D', { lo: 26, hi: 38, vel: 0.5, oct: true }); this.bass(I.low, E, s * 2.2, 'D', { lo: 26, hi: 38, vel: 0.5, oct: true, r: 1.5 });
    I.timp.roll(G, 38, s * 0.95, 0.2, 0.6, { hit: true });
    I.harp.gliss(E, [62, 64, 66, 69, 71, 74, 76, 78, 81, 83, 86, 88], s * 1.2, 0.45);
    [86, 90, 93, 98].forEach((m, i) => I.glock.note(E + s * 0.9 + i * 0.12, m, 1, 0.5));
    I.cym.crash(E, 0.45);
    return 10 * s;
  }
}

export class Wipe extends Track {
  constructor(e, n, t0, seed) {
    super(e, n, t0, seed);
    this.tempo(58, 4);
    this.I('str', Strings, { pan: -0.2, rev: 0.5, bright: 0.7 });
    this.I('low', Strings, { pan: 0.25, rev: 0.4, bright: 0.55, body: 160, hp: 28 });
    this.I('horn', Horn, { pan: 0.25, rev: 0.6 });
    this.I('choir', Choir, { vowel: 'oo', rev: 0.65 });
    this.I('timp', Timpani, { rev: 0.5 });
    this.I('bell', Bells, { kind: 'tubular', pan: 0.3, rev: 0.7, scale: 0.08 });
  }
  playBar(bar, t) {
    if (bar > 0) return 0;
    const I = this.inst, s = this.spb, T = (b) => t + b * s;
    I.timp.hit(t, 38, 0.6, { decay: 3.5 });
    I.bell.note(T(0.02), 50, 5, 0.55);
    I.low.note(t, 26, s * 6, 0.45, { a: 0.8, r: 2 }); I.low.note(t, 38, s * 6, 0.35, { a: 1, r: 2 });
    this.pad(I.choir, T(0.2), s * 2.6, 'Dm', { n: 4, lo: 57, hi: 72, vel: 0.5, a: 1.4, r: 1.2, key: 'choir' });
    this.pad(I.str, T(0.3), s * 2.5, 'Dm', { n: 4, lo: 50, hi: 69, vel: 0.35, a: 1.2, key: 'str' });
    this.line(I.horn, T(0.9), mel('A4:1 G4:1 F4:1 E4:.75 D4:2.5'), { vel: 0.6, legato: 1 });
    this.pad(I.str, T(3), s * 1.6, 'Gm/D', { n: 4, lo: 50, hi: 69, vel: 0.32, a: 0.6, key: 'str' });
    this.pad(I.choir, T(3), s * 1.6, 'Gm/D', { n: 4, lo: 57, hi: 72, vel: 0.42, a: 0.6, key: 'choir' });
    this.pad(I.str, T(4.6), s * 1.8, 'Dm', { n: 4, lo: 50, hi: 69, vel: 0.28, a: 0.8, r: 2.2, key: 'str' });
    this.pad(I.choir, T(4.6), s * 1.8, 'Dm', { n: 4, lo: 57, hi: 72, vel: 0.36, a: 0.8, r: 2.2, key: 'choir' });
    I.timp.hit(T(4.6), 38, 0.35, { decay: 3 });
    I.bell.note(T(4.62), 45, 5, 0.35);
    return 8 * s;
  }
}
