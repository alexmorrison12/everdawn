// 'login' — the title theme for "the last server": epic, noble, melancholic. D minor, 4/4, ~64 BPM.
// Form (cycles with variation): intro → A (horn theme) → A2 (+choir, countermelody, timpani) → B (strings+choir
// soar in F) → interlude (solo oboe, Dorian, harp) → A3 (tutti, brass in octaves) → coda → (new cycle).
import { Track } from './track.js';
import { Strings, Wind, Harp, Horn, Choir, Timpani, Cymbal, Bells } from './instruments.js';
import { mel, Scale, genPhrase } from './theory.js';

// Original melodies.
const THEME = mel('D4:2 A4:1 G4:.5 F4:.5 | G4:1.5 A4:.5 Bb4:2 | A4:3 F4:.5 G4:.5 | E4:2 C4:2 | D4:2 A4:1 C5:1 | Bb4:1.5 A4:.5 G4:1 F4:1 | G4:1.5 F4:.5 E4:2 | D4:4');
const THEME_CH = ['Dm', 'Gm', 'F', 'C', 'Dm', 'Bb', ['Gm', 'A'], 'Dm'];
const B_THEME = mel('F4:1 Bb4:1 D5:2 | C5:1.5 Bb4:.5 A4:2 | G4:1 C5:1 E5:2 | D5:3 A4:1 | Bb4:1 D5:1 F5:2 | E5:1 D5:1 C5:2 | Bb4:1.5 A4:.5 G4:2 | A4:4');
const B_CH = ['Bb', 'F', 'C', 'Dm', 'Bb', 'F/A', 'Gm', ['Asus4', 'A']];
const INTER_CH = [['Dm', 'Dm', 'G/D', 'Dm', 'C', 'Bb', 'Gm', ['Asus4', 'A']], ['Dm', 'Bbmaj7', 'Gm', 'Dm', 'Bb', 'C', 'Asus4', 'A']];
const CODA_CH = ['Dm', 'Bb', 'Gm', ['Asus4', 'A']];

export class Login extends Track {
  constructor(e, n, t0, seed) {
    super(e, n, t0, seed);
    this.tempo(64, 4);
    this.I('str', Strings, { pan: -0.2, rev: 0.45 });
    this.I('low', Strings, { pan: 0.3, rev: 0.35, bright: 0.75, body: 170, hp: 35 });
    this.I('vln', Strings, { pan: -0.4, rev: 0.5, bright: 1.25 });
    this.I('horn', Horn, { pan: 0.25, rev: 0.6 });
    this.I('tbn', Horn, { kind: 'brass', pan: 0.35, rev: 0.5, scale: 0.08 });
    this.I('choir', Choir, { vowel: 'oh', rev: 0.6 });
    this.I('harp', Harp, { pan: -0.45, rev: 0.5 });
    this.I('oboe', Wind, { kind: 'oboe', pan: 0.1, rev: 0.5 });
    this.I('timp', Timpani, { rev: 0.5 });
    this.I('cym', Cymbal, { rev: 0.55 });
    this.I('bell', Bells, { kind: 'tubular', pan: 0.2, rev: 0.6, scale: 0.07 });
    this.scale = new Scale('D', 'minor');
    this.dorian = new Scale('D', 'dorian');
    this.cycle = 0; this.plan();
  }
  plan() {
    const r = this.rng, first = this.cycle === 0;
    this.form = first ? ['intro', 'A', 'A2', 'B', 'inter', 'A3', 'coda'] : r.pick([['inter', 'A2', 'B', 'A3', 'coda'], ['breath', 'A', 'B', 'inter', 'A3', 'coda'], ['intro', 'A2', 'inter', 'B', 'A3', 'coda']]);
    this.si = 0; this.sb = 0; this.cycle++;
    this.makeSection();
  }
  makeSection() {
    const r = this.rng, type = this.form[this.si];
    const S = { type, bars: { intro: 4, coda: 4, breath: 2 }[type] || 8 };
    S.ch = type === 'B' ? B_CH : type === 'inter' ? r.pick(INTER_CH) : type === 'coda' ? CODA_CH : type === 'intro' ? ['Dm', 'Dm', 'Dm', ['Dm', 'A']] : type === 'breath' ? ['Dm', 'Asus4'] : THEME_CH;
    const chordAt = (b) => { const c = S.ch[Math.min(S.bars - 1, Math.floor(b / 4))]; return Array.isArray(c) ? c[(b % 4) < 2 ? 0 : 1] : c; };
    if (type === 'inter') S.solo = genPhrase(r, { scale: this.dorian, chordAt, bars: 4, bpb: 4, lo: 62, hi: 79, contour: 'arch', rest: 0.1 }).concat(
      genPhrase(r, { scale: this.dorian, chordAt: (b) => chordAt(b + 16), bars: 4, bpb: 4, lo: 60, hi: 77, contour: 'down', rest: 0.1 }).map((n) => ({ ...n, b: n.b + 16 })));
    if (type === 'A2') S.counter = genPhrase(r, { scale: this.scale, chordAt, bars: 8, bpb: 4, lo: 69, hi: 86, cells: [[4], [2, 2], [3, 1]], cad: [[4]], rest: 0 });
    this.S = S;
  }
  chordsOf(c) { return Array.isArray(c) ? c : [c]; }
  playBar(bar, t) {
    const S = this.S, sb = this.sb, I = this.inst, B = this.barDur, spb = this.spb, r = this.rng;
    const cs = this.chordsOf(S.ch[sb]), half = cs.length > 1;
    const each = (fn) => cs.forEach((c, i) => fn(c, t + i * (B / cs.length), B / cs.length));
    switch (S.type) {
      case 'intro': {
        if (sb === 0) {
          I.low.note(t, 38, B * 3.5, 0.42, { a: 3, r: 0.8 }); I.low.note(t, 50, B * 3.5, 0.3, { a: 3.5, r: 0.8 });
          I.bell.note(this.bt(t, 0.02), 62, 4, 0.5);
        }
        if (sb === 1) this.pad(I.choir, t, B * 2.5, 'Dm', { n: 4, lo: 57, hi: 74, vel: 0.5, a: 3.5, r: 0.7, swell: true });
        if (sb === 1) this.pad(I.str, this.bt(t, 2), B * 2, 'Dm', { n: 4, lo: 50, hi: 69, vel: 0.32, a: 3, r: 0.7 });
        if (sb === 2) I.timp.roll(this.bt(t, 0), 45, B * 2 - 0.06, 0.03, 0.75, { hit: false });
        if (sb === 3) {
          // half cadence: the whole ensemble moves to A major, timpani resolves to D on the downbeat
          I.cym.swell(this.bt(t, 1), B - spb, 0.5);
          this.pad(I.horn, this.bt(t, 2), B * 0.5, 'A', { n: 2, lo: 57, hi: 69, vel: 0.45, art: 'swell', key: 'hornpair' });
          this.pad(I.choir, this.bt(t, 2), B * 0.5, 'A', { n: 4, lo: 57, hi: 73, vel: 0.45, a: 1.2, swell: true });
          I.low.note(this.bt(t, 2), 45, B * 0.5, 0.4, { a: 0.6, r: 0.4 }); I.low.note(this.bt(t, 2), 33, B * 0.5, 0.3, { a: 0.6, r: 0.4 });
          I.timp.hit(t + B, 38, 0.8);
        }
        break;
      }
      case 'breath': {
        if (sb === 0) { this.pad(I.choir, t, B * 2, 'Dm', { n: 4, lo: 57, hi: 74, vel: 0.4, a: 2.5, swell: true }); I.low.note(t, 38, B * 2, 0.35, { a: 2 }); I.bell.note(t, 62, 4, 0.45); }
        if (sb === 1) this.pad(I.str, this.bt(t, 2), B * 0.5, 'Asus4', { n: 4, lo: 52, hi: 69, vel: 0.3, a: 1.2 });
        break;
      }
      case 'A': case 'A2': case 'A3': {
        const full = S.type !== 'A', tutti = S.type === 'A3';
        this.line(I.horn, t, this.barSlice(THEME, sb, 4), { vel: tutti ? 0.78 : 0.62 });
        if (tutti) this.line(I.tbn, t, this.barSlice(THEME, sb, 4), { vel: 0.55, tr: -12 });
        each((c, tt, d) => {
          this.pad(I.str, tt, d, c, { n: tutti ? 5 : 4, lo: 50, hi: tutti ? 74 : 70, vel: (tutti ? 0.46 : 0.36), a: 0.5 });
          this.bass(I.low, tt, d, c, { lo: 33, hi: 45, vel: tutti ? 0.5 : 0.4, oct: full });
          if (full) this.pad(I.choir, tt, d, c, { n: 4, lo: 55, hi: 74, vel: tutti ? 0.55 : 0.42, a: 0.6, key: 'choir' });
        });
        if (!tutti) this.arp(I.harp, t, 4, cs[0], { pat: [0, 1, 2, 3, 4, 3, 2, 1], lo: 50, vel: 0.26 });
        if (S.type === 'A2' && S.counter) this.line(I.vln, t, this.barSlice(S.counter, sb, 4), { vel: 0.38, a: 0.4, r: 0.8 });
        if (tutti) {
          I.timp.hit(t, sb % 2 ? 45 : 38, sb % 4 === 0 ? 0.85 : 0.6);
          if (sb % 2 === 1) I.timp.hit(this.bt(t, 3.5), 45, 0.45);
          if (sb === 0 || sb === 4) I.cym.crash(t, sb ? 0.5 : 0.75);
          // driving low-string pulse on the bass note
          const bm = this.vl.get('low')[0];
          for (let k = 0; k < 8; k++) if (k % 2 === 1) I.low.note(this.bt(t, k * 0.5), bm + 12, spb * 0.4, 0.3, { art: 'spicc' });
        } else if (full && (sb === 0 || sb === 4)) I.timp.hit(t, 38, 0.55);
        if (S.type === 'A' && sb === 7) I.timp.roll(this.bt(t, 2), 38, B * 0.5 - 0.05, 0.05, 0.45, { hit: false });
        break;
      }
      case 'B': {
        this.line(I.vln, t, this.barSlice(B_THEME, sb, 4), { vel: 0.58, a: 0.2, r: 0.7 });
        this.line(I.choir, t, this.barSlice(B_THEME, sb, 4), { vel: 0.35, tr: -12, a: 0.25, r: 0.6, key: 'choirMel' });
        each((c, tt, d) => {
          this.pad(I.str, tt, d, c, { n: 4, lo: 48, hi: 67, vel: 0.36, a: 0.5 });
          this.bass(I.low, tt, d, c, { lo: 34, hi: 46, vel: 0.44, oct: true });
          this.pad(I.horn, tt + 0.03, d, c, { n: 2, lo: 53, hi: 65, vel: 0.36, key: 'hornpair', a: 0.4 });
        });
        this.arp(I.harp, t, 4, cs[0], { pat: [0, 2, 4, 2], step: 1, lo: 53, vel: 0.25, len: 3 });
        if (sb === 4) I.cym.crash(t, 0.4);
        if (sb === 7) { I.timp.roll(this.bt(t, 0), 45, B - 0.05, 0.05, 0.7); I.cym.swell(this.bt(t, 1), B - spb, 0.5); }
        break;
      }
      case 'inter': {
        this.line(I.oboe, t, this.barSlice(S.solo, sb, 4), { vel: 0.55 });
        each((c, tt, d) => {
          this.pad(I.str, tt, d, c, { n: 3, lo: 52, hi: 67, vel: 0.24, a: 1.2, r: 1.2 });
          if (sb % 2 === 0 || half) this.bass(I.low, tt, d * (half ? 1 : 2), c, { lo: 38, hi: 50, vel: 0.26, a: 0.8 });
        });
        this.arp(I.harp, t, 4, cs[0], { pat: [0, 1, 2, 3, 2, 3, 4, 3], lo: 50, vel: 0.24 });
        if (sb === 7 && r.chance(0.7)) I.timp.roll(this.bt(t, 2), 45, B * 0.5 - 0.05, 0.04, 0.4, { hit: false });
        break;
      }
      case 'coda': {
        const v = 0.5 - sb * 0.06;
        each((c, tt, d) => {
          this.pad(I.str, tt, d * (sb === 3 ? 1.6 : 1), c, { n: 5, lo: 50, hi: 74, vel: v, a: 0.6, r: 1.6 });
          this.pad(I.choir, tt, d, c, { n: 4, lo: 55, hi: 72, vel: v, a: 0.7, key: 'choir' });
          this.bass(I.low, tt, d, c, { lo: 33, hi: 45, vel: v, oct: true });
        });
        this.line(I.horn, t, [[{ b: 0, d: 4, m: 62 }], [{ b: 0, d: 2, m: 65 }, { b: 2, d: 2, m: 62 }], [{ b: 0, d: 4, m: 62 }], [{ b: 0, d: 2, m: 64 }, { b: 2, d: 2, m: 61 }]][sb], { vel: v + 0.1 });
        if (sb === 0) I.timp.hit(t, 38, 0.6);
        if (sb === 3) { I.timp.roll(this.bt(t, 2), 45, B * 0.5 - 0.05, 0.04, 0.5, { hit: false }); I.bell.note(this.bt(t, 2), 57, 4, 0.35); }
        break;
      }
    }
    if (++this.sb >= S.bars) {
      this.sb = 0;
      if (++this.si >= this.form.length) this.plan(); else this.makeSection();
    }
    return B;
  }
}
