// 'vale' — pastoral forest/meadow exploration. 3/4, ~76 BPM. Warm string pads, harp arpeggios, flute/oboe melodies,
// gentle horns. Long-form: a "piece" is 6–8 sections (dawn / theme / answer / swell / stillness / themeB / wander /
// outro, shuffled), 2–3 minutes, followed by 20–45 s of silence; every piece picks a new key and tempo.
import { Track } from './track.js';
import { Strings, Wind, Harp, Horn, Bells, Cymbal, Timpani } from './instruments.js';
import { mel, rn, Scale, genPhrase, markov, pcOf } from './theory.js';

// Original themes (written in G major; transposed per piece).
const THEME_A = mel('D5:2 B4:1 | E5:1.5 D5:.5 B4:1 | C5:1 E5:1 G5:1 | F#5:2 E5:.5 D5:.5 | D5:1 G5:1 F#5:.5 E5:.5 | E5:2 C5:1 | A4:1 C5:.5 B4:.5 A4:1 | G4:3');
const THEME_A_CH = ['I', 'vi', 'IV', 'V', 'I/3', 'IV', 'V7', 'I'];
const THEME_B = mel('B4:2 E5:1 | G5:1.5 F#5:.5 E5:1 | D5:2 B4:1 | A4:3 | B4:1 E5:1 G5:1 | A5:2 G5:.5 F#5:.5 | E5:1 F#5:1 D5:1 | E5:3');
const THEME_B_CH = ['vi', 'IV', 'I', 'V', 'vi', 'ii', 'V', 'vi'];

const MARKOV = {
  I: { IV: 3, vi: 2, V: 1.4, iii: 1, ii: 1, II: 0.6 },
  IV: { I: 3, V: 2, ii: 1, vi: 1.5, iv: 0.4 },
  V: { I: 3, vi: 2, IV: 1.2, iii: 0.4 },
  vi: { IV: 3, ii: 1.5, V: 1.5, iii: 1, I: 0.8 },
  ii: { V: 3, IV: 1, vi: 0.8 },
  iii: { vi: 2.5, IV: 2, ii: 0.5 },
  II: { IV: 2, I: 1.5, V: 1 },
  iv: { I: 3 },
};
const COLOR = { I: ['I', 'Iadd9', 'I'], IV: ['IV', 'IVmaj7', 'IVadd9'], vi: ['vi', 'vi7', 'vi'], ii: ['ii7', 'ii'], V: ['V', 'Vsus4', 'V'], iii: ['iii', 'iii7'], II: ['II'], iv: ['iv', 'iv6'] };
const KEYS = ['G', 'D', 'C', 'F', 'A', 'Eb'];
const ARPS = [[0, 1, 2, 3, 4, 3], [0, 2, 1, 3, 2, 4], [0, 2, 4, 2, 3, 1], [0, 1, 2, 4, 3, 2]];

export class Vale extends Track {
  constructor(e, n, t0, seed) {
    super(e, n, t0, seed);
    this.I('str', Strings, { pan: -0.15, rev: 0.4, vol: 1 });
    this.I('low', Strings, { pan: 0.3, rev: 0.3, bright: 0.7, body: 180, hp: 40 });
    this.I('vln', Strings, { pan: -0.35, rev: 0.45, bright: 1.3, voices: 3 });
    this.I('harp', Harp, { pan: -0.45, rev: 0.45 });
    this.I('flute', Wind, { kind: 'flute', pan: -0.05, rev: 0.45 });
    this.I('oboe', Wind, { kind: 'oboe', pan: 0.12, rev: 0.42 });
    this.I('clar', Wind, { kind: 'clarinet', pan: 0.05, rev: 0.42 });
    this.I('horn', Horn, { pan: 0.3, rev: 0.55 });
    this.I('cel', Bells, { kind: 'celesta', pan: 0.35, rev: 0.55 });
    this.I('cym', Cymbal, { rev: 0.5 });
    this.I('timp', Timpani, { rev: 0.45 });
    this.keyIdx = 0; this.gap = 0;
    this.newPiece(true);
  }
  newPiece(first = false) {
    const r = this.rng;
    this.key = first ? 'G' : KEYS[(this.keyIdx = (this.keyIdx + 1 + r.int(0, 1)) % KEYS.length)];
    this.shift = ((pcOf(this.key) - 7 + 18) % 12) - 6; // transpose G themes into the key (−6..+5)
    this.scale = new Scale(this.key, 'major');
    this.tempo(r.range(72, 80), 3);
    const mids = r.shuffle(['answer', 'swell', 'still', 'themeB', 'wander']).slice(0, 3 + r.int(0, 1));
    const form = ['dawn', 'theme', ...mids];
    if (r.chance(0.6)) form.splice(form.length - 1, 0, 'theme');
    form.push('outro');
    this.form = form.map((type) => this.makeSection(type));
    this.si = 0; this.sb = 0; this.dyn = r.range(0.9, 1.1);
    this.arpPat = r.pick(ARPS);
  }
  prog(bars, per = 2, start = 'I', end = ['V', 'I']) {
    const n = Math.ceil(bars / per), rom = markov(this.rng, MARKOV, start, n, end);
    const out = [];
    for (const x of rom) { const c = rn(this.key, this.rng.pick(COLOR[x] || [x])); for (let i = 0; i < per; i++) out.push(c); }
    return out.slice(0, bars);
  }
  makeSection(type) {
    const r = this.rng, K = this.key;
    const S = { type, bars: 8 };
    if (type === 'theme') { S.ch = THEME_A_CH.map((x) => rn(K, x)); S.mel = THEME_A; S.inst = r.pick(['flute', 'flute', 'oboe']); }
    else if (type === 'themeB') { S.ch = THEME_B_CH.map((x) => rn(K, x)); S.mel = THEME_B; S.inst = r.pick(['oboe', 'clar', 'flute']); }
    else if (type === 'outro') { S.bars = 4; S.ch = [rn(K, 'IV'), rn(K, 'IV'), rn(K, 'Iadd9'), rn(K, 'Iadd9')]; }
    else if (type === 'dawn') S.ch = this.prog(8, 2, 'I', ['V']);
    else if (type === 'still') S.ch = this.prog(8, 2, r.pick(['IV', 'vi', 'I']), ['V', 'I']);
    else if (type === 'swell') S.ch = this.prog(8, 2, r.pick(['IV', 'vi']), ['V']);
    else S.ch = this.prog(8, 1, r.pick(['I', 'IV', 'vi']), ['V', 'I']);
    if (type === 'answer' || type === 'wander' || type === 'swell') {
      const chordAt = (b) => S.ch[Math.min(S.bars - 1, Math.floor(b / 3))];
      if (type === 'swell') {
        S.mel = genPhrase(r, { scale: this.scale, chordAt, bars: 8, bpb: 3, lo: 67 + this.shift, hi: 84 + this.shift, cells: [[3], [2, 1], [1, 2]], cad: [[3]], rest: 0 });
      } else {
        const per = type === 'wander' ? 2 : 4;
        S.phrases = [];
        for (let p = 0; p < 8 / per; p++) {
          const off = p * per;
          S.phrases.push({ bar: off, inst: type === 'wander' ? (p % 2 ? 'oboe' : 'flute') : r.pick(p % 2 ? ['oboe', 'clar', 'horn'] : ['flute', 'oboe']),
            notes: genPhrase(r, { scale: this.scale, chordAt: (b) => chordAt(b + off * 3), bars: per, bpb: 3, lo: 66 + this.shift, hi: 83 + this.shift, rest: 0.12 }) });
        }
      }
    }
    return S;
  }
  playBar(bar, t) {
    const B = this.barDur, r = this.rng;
    if (this.gap > 0) { if (--this.gap === 0) this.newPiece(); return B; }
    const S = this.form[this.si], sb = this.sb, ch = S.ch[sb], I = this.inst, d = this.dyn;
    const even = sb % 2 === 0, chordLen = (S.ch[sb + 1] === ch && even) ? 2 : 1;
    const newChord = sb === 0 || S.ch[sb - 1] !== ch;
    const bassLo = 38, bassHi = 52;
    switch (S.type) {
      case 'dawn': {
        if (newChord) { this.pad(I.str, t, B * chordLen, ch, { n: 4, lo: 55, hi: 74, vel: 0.36 * d, a: sb === 0 ? 2.5 : 1.2, r: 1.2 }); this.bass(I.low, t, B * chordLen, ch, { lo: bassLo, hi: bassHi, vel: 0.3 * d, a: 1.2 }); }
        if (sb > 0 || this.si > 0) this.arp(I.harp, t, 3, ch, { pat: this.arpPat, lo: 55, vel: 0.3 * d });
        break;
      }
      case 'theme': case 'themeB': {
        const inst = I[S.inst], low = S.inst === 'oboe' || S.inst === 'clar';
        const tr = this.fit(S.mel, this.shift + (low ? -12 : 0), low ? 58 : 65, low ? 81 : 91);
        this.line(inst, t, this.barSlice(S.mel, sb, 3), { vel: 0.6 * d, tr });
        if (newChord) this.pad(I.str, t, B * chordLen, ch, { n: 4, lo: 52, hi: 71, vel: 0.33 * d, a: 0.6, r: 0.9 });
        this.bass(I.low, t, B, ch, { lo: bassLo, hi: bassHi, vel: 0.3 * d, a: 0.3 });
        this.arp(I.harp, t, 3, ch, { pat: sb % 4 === 3 ? [0, 1, 2, 3, 4, 5] : this.arpPat, lo: 50, vel: 0.26 * d });
        if (S.type === 'theme' && this.si > 2 && (sb === 3 || sb === 7)) this.pad(I.horn, this.bt(t, 1), B * 0.9, ch, { n: 2, lo: 55, hi: 67, vel: 0.35 * d, art: 'swell', key: 'hornpair' });
        break;
      }
      case 'answer': case 'wander': {
        for (const ph of S.phrases) if (ph.bar <= sb && sb < ph.bar + (S.type === 'wander' ? 2 : 4)) {
          const inst = I[ph.inst], tr = ph.inst === 'horn' ? -12 : (ph.inst === 'clar' ? -12 : 0);
          this.line(inst, t, this.barSlice(ph.notes, sb - ph.bar, 3), { vel: (ph.inst === 'horn' ? 0.5 : 0.55) * d, tr });
        }
        if (newChord) this.pad(I.str, t, B * chordLen, ch, { n: 4, lo: 52, hi: 71, vel: 0.3 * d, a: 0.8 });
        if (S.type === 'wander') {
          I.low.note(t, this.bassPitch(ch, bassLo, bassHi, 'lowp'), B, 0.5 * d, { art: 'pizz' });
          const tn = this.tones(ch, 62, 4);
          I.harp.note(this.bt(t, 1), tn[1], B, 0.24 * d); I.harp.note(this.bt(t, 2), tn[2], B, 0.22 * d);
        } else {
          this.bass(I.low, t, B, ch, { lo: bassLo, hi: bassHi, vel: 0.28 * d });
          this.arp(I.harp, t, 3, ch, { pat: [0, 2, 1, 3, 2, 1], step: 1, lo: 55, vel: 0.26 * d, len: 3 });
        }
        break;
      }
      case 'swell': {
        const u = sb / 7, v = 0.36 + 0.2 * u;
        if (sb === 0) I.harp.gliss(t, this.tones(ch, 50, 14), B * 0.8, 0.28 * d);
        if (newChord) {
          this.pad(I.str, t, B * chordLen, ch, { n: 5, lo: 55, hi: 79, vel: v * d, a: 0.8, swell: true });
          this.bass(I.low, t, B * chordLen, ch, { lo: 36, hi: 48, vel: 0.36 * d, oct: true });
          this.pad(I.horn, this.bt(t, 0.5), B * chordLen - 0.4, ch, { n: 2, lo: 55, hi: 69, vel: (0.4 + 0.2 * u) * d, art: 'swell', key: 'hornpair' });
        }
        this.line(I.vln, t, this.barSlice(S.mel, sb, 3), { vel: (0.42 + 0.15 * u) * d, a: 0.25, r: 0.8 });
        if (sb === 7) { I.cym.swell(this.bt(t, 0.2), B - 0.2, 0.35); I.timp.roll(this.bt(t, 1), 38 + ((pcOf(this.key) + 5) % 12), B - this.spb - 0.05, 0.05, 0.4, { hit: false }); }
        break;
      }
      case 'still': {
        if (newChord) this.pad(I.str, t, B * chordLen, ch, { n: 3, lo: 55, hi: 72, vel: 0.24 * d, a: 2.0, r: 1.6 });
        if (r.chance(0.7)) { const tn = this.tones(ch, 76, 5); I.cel.note(this.bt(t, r.pick([0, 1, 1.5, 2])), r.pick(tn), 1, 0.32 * d); }
        if (r.chance(0.25)) { const tn = this.tones(ch, 69, 4); const a = r.pick(tn); I.flute.note(this.bt(t, 1), a + 2 <= 88 ? a : a - 12, this.spb * 1.4, 0.35 * d); }
        if (even) this.bass(I.low, t, B * 2, ch, { lo: bassLo, hi: bassHi, vel: 0.18 * d, a: 1.5 });
        break;
      }
      case 'outro': {
        if (newChord) { this.pad(I.str, t, B * (sb === 0 ? 2 : 2.5), ch, { n: 4, lo: 55, hi: 74, vel: 0.3 * d, a: 1, r: 2.5 }); this.bass(I.low, t, B * 2.2, ch, { lo: bassLo, hi: bassHi, vel: 0.28 * d, r: 2 }); }
        if (sb === 2) { this.arp(I.harp, t, 3, ch, { pat: [0, 1, 2, 3, 4, 5], lo: 55, vel: 0.28 * d, len: 6 }); I.flute.note(this.bt(t, 1), this.tones(ch, 74, 1)[0], B * 1.6, 0.38 * d); }
        break;
      }
    }
    if (++this.sb >= S.bars) {
      this.sb = 0;
      if (++this.si >= this.form.length) this.gap = Math.max(1, Math.round(r.range(20, 45) / B));
    }
    return B;
  }
}
