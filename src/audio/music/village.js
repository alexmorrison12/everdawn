// 'village' — cozy town/tavern. 6/8 lilt (dotted quarter ≈ 60), D major with Mixolydian B section. Lute (strums and
// arpeggios), recorder tune, frame drum / tambourine / shaker, bowed drone; a quieter "evening" section and a lute
// solo keep the loop fresh. Beat unit = eighth note (6 per bar).
import { Track } from './track.js';
import { Strings, Wind, Lute, HandDrum } from './instruments.js';
import { mel, Scale, genPhrase } from './theory.js';

// Original tunes (units: eighth notes).
const TUNE_A = mel('D5:2 A4:1 F#4:2 A4:1 | A4:1 B4:1 A4:1 F#4:2 E4:1 | D4:2 G4:1 B4:2 D5:1 | C#5:2 B4:1 A4:3 | D5:2 E5:1 F#5:2 E5:1 | D5:1 C#5:1 B4:1 F#4:3 | G4:1 B4:1 D5:1 C#5:1 B4:1 C#5:1 | D5:6');
const TUNE_A_CH = ['D', 'D', 'G', 'A', 'D', 'Bm', ['G', 'A'], 'D'];
const TUNE_B = mel('F#5:2 E5:1 D5:2 A4:1 | G4:2 E4:1 C5:2 G4:1 | B4:2 A4:1 G4:2 D5:1 | A4:3 F#4:3 | A4:1 D5:1 F#5:1 E5:2 D5:1 | E5:2 C5:1 G4:3 | B4:1 D5:1 B4:1 C#5:1 E5:1 C#5:1 | D5:6');
const TUNE_B_CH = ['D', 'C', 'G', 'D', 'D', 'C', ['G', 'A'], 'D'];
const EVE_CH = [['Bm', 'G', 'D', 'A', 'Bm', 'G', 'Em', 'A'], ['G', 'D/F#', 'Em', 'D', 'G', 'A', 'Bm', 'A']];

export class Village extends Track {
  constructor(e, n, t0, seed) {
    super(e, n, t0, seed);
    this.tempo(this.rng.range(174, 186), 6);
    this.I('lute', Lute, { pan: 0.2, rev: 0.28 });
    this.I('lute2', Lute, { pan: -0.3, rev: 0.28, scale: 0.22 });
    this.I('rec', Wind, { kind: 'recorder', pan: -0.12, rev: 0.32 });
    this.I('fid', Strings, { pan: -0.25, rev: 0.3, bright: 1.2, voices: 2, scale: 0.06 });
    this.I('drone', Strings, { pan: 0.25, rev: 0.25, bright: 0.6, body: 170, hp: 40, voices: 2, scale: 0.06 });
    this.I('drum', HandDrum, { pan: 0.05, rev: 0.18 });
    this.scale = new Scale('D', 'major'); this.mixo = new Scale('D', 'mixolydian');
    this.form = ['intro', 'A', 'B', 'A', 'lute', 'eve', 'A', 'B'];
    this.si = 0; this.sb = 0; this.loops = 0;
    this.make();
  }
  make() {
    const r = this.rng, type = this.form[this.si];
    const S = { type, bars: type === 'intro' ? 4 : 8, var: r.next() };
    S.ch = type === 'B' ? TUNE_B_CH : type === 'eve' ? r.pick(EVE_CH) : type === 'intro' ? ['D', 'G', 'D', 'A'] : TUNE_A_CH;
    S.tune = type === 'B' ? TUNE_B : TUNE_A;
    if (type === 'eve') {
      const chordAt = (b) => S.ch[Math.min(7, Math.floor(b / 6))];
      S.mel = genPhrase(r, { scale: this.scale, chordAt, bars: 4, bpb: 6, lo: 67, hi: 83, cells: [[3, 3], [6], [2, 1, 3]], cad: [[6]], rest: 0.05 })
        .concat(genPhrase(r, { scale: this.scale, chordAt: (b) => chordAt(b + 24), bars: 4, bpb: 6, lo: 64, hi: 81, cells: [[3, 3], [2, 1, 3], [3, 2, 1]], cad: [[6]], contour: 'down', rest: 0.05 }).map((n) => ({ ...n, b: n.b + 24 })));
    }
    // light ornamentation on repeats of A: grace-note turns on long notes
    if (type === 'A' && this.loops + this.si > 1) S.orn = true;
    this.S = S;
  }
  strumPat(t, c, dur, vel, lute, kind) {
    const v = this.voicing(c, 4, 55, 71, 'lutev');
    const bass = this.bassPitch(c, 40, 52, 'luteb');
    const s = this.spb;
    if (kind === 0) { // boom . chick | boom . chick
      lute.note(t, bass, s * 2, vel); lute.strum(t + 2 * s, v, vel * 0.7);
      lute.note(t + 3 * s, bass + 7 <= 57 ? bass + 7 : bass - 5, s * 2, vel * 0.85); lute.strum(t + 5 * s, v, vel * 0.6, { dir: -1 });
    } else if (kind === 1) { // rolling arpeggio
      const ar = [bass, v[0], v[1], v[2], v[3] ?? v[2] + 12, v[1]];
      ar.forEach((m, i) => lute.note(t + i * s + this.hum(5), m, s * 3, vel * (i % 3 === 0 ? 1 : 0.75)));
    } else { // full strums on 1 and 4 with a lift on 6
      lute.note(t, bass, s * 3, vel); lute.strum(t + 0.01, v, vel * 0.85);
      lute.strum(t + 3 * s, v, vel * 0.75, { dir: -1 }); lute.strum(t + 5 * s, v.slice(1), vel * 0.5);
    }
  }
  ornament(notes) {
    const out = [];
    for (const n of notes) {
      if (n.d >= 2 && this.rng.chance(0.35)) { const up = this.scale.step(n.m, 1); out.push({ b: n.b, d: 0.5, m: n.m }, { b: n.b + 0.5, d: 0.5, m: up }, { b: n.b + 1, d: n.d - 1, m: n.m }); }
      else out.push(n);
    }
    return out;
  }
  playBar(bar, t) {
    const S = this.S, sb = this.sb, I = this.inst, B = this.barDur, s = this.spb;
    const cs = Array.isArray(S.ch[sb]) ? S.ch[sb] : [S.ch[sb]];
    const each = (fn) => cs.forEach((c, i) => fn(c, t + i * (B / cs.length), B / cs.length));
    const drums = (lvl, tamb) => {
      I.drum.hit(t, 0.7 * lvl); I.drum.hit(t + 3 * s, 0.45 * lvl, { open: false });
      if (sb % 2 === 1) I.drum.hit(t + 5 * s, 0.35 * lvl, { open: false });
      if (tamb) { I.drum.tamb(t + 2 * s, 0.45 * lvl); I.drum.tamb(t + 5 * s, 0.35 * lvl); }
      for (let k = 0; k < 6; k++) I.drum.shake(t + k * s + this.hum(4), (k % 3 === 0 ? 0.4 : 0.25) * lvl);
    };
    switch (S.type) {
      case 'intro':
        each((c, tt, d) => this.strumPat(tt, c, d, 0.5, I.lute, sb < 2 ? 1 : 0));
        if (sb === 3) I.drum.hit(t + 3 * s, 0.4, { open: false });
        break;
      case 'A': case 'B': {
        const notes = this.barSlice(S.tune, sb, 6);
        this.line(I.rec, t, S.orn ? this.ornament(notes) : notes, { vel: 0.55, hum: 5 });
        if (S.type === 'B' && S.var > 0.4) this.line(I.fid, t, notes, { vel: 0.3, tr: -12, a: 0.05, hum: 5 });
        each((c, tt, d) => this.strumPat(tt, c, d, 0.46, I.lute, S.type === 'B' ? 2 : (sb % 4 === 3 ? 1 : 0)));
        if (sb % 4 === 0) { I.drone.note(t, 38, B * 4, 0.35, { a: 1.2, r: 1 }); I.drone.note(t, 45, B * 4, 0.25, { a: 1.2, r: 1 }); }
        drums(S.type === 'B' ? 1 : 0.85, S.type === 'B');
        break;
      }
      case 'lute': {
        this.line(I.lute2, t, this.barSlice(TUNE_A, sb, 6), { vel: 0.5, hum: 5 });
        each((c, tt, d) => this.strumPat(tt, c, d, 0.34, I.lute, 1));
        I.drum.hit(t, 0.35); I.drum.hit(t + 3 * s, 0.25, { open: false });
        break;
      }
      case 'eve': {
        this.line(I.rec, t, this.barSlice(S.mel, sb, 6), { vel: 0.42, hum: 8 });
        each((c, tt, d) => this.strumPat(tt, c, d, 0.36, I.lute, 1));
        if (sb % 2 === 0) this.bass(I.drone, t, B * 2, cs[0], { lo: 38, hi: 50, vel: 0.28, a: 1.2 });
        break;
      }
    }
    if (++this.sb >= S.bars) {
      this.sb = 0;
      if (++this.si >= this.form.length) { this.loops++; this.form = ['A', this.rng.pick(['B', 'lute']), 'A', 'eve', 'B', 'A', this.rng.pick(['lute', 'B'])]; this.si = 0; }
      this.make();
    }
    return B;
  }
}
