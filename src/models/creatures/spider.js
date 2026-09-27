// Webwood spider: 8 jointed legs (rigid exoskeleton segments, IK, alternating tetrapod gait), patterned abdomen,
// fangs, pedipalps, 8 glowing eyes. Variants: webwood, venom, cave, broodmother (elite).
import * as THREE from 'three';
import { Gait } from './gait.js';
import { ActionSet } from './quadruped.js';
import { sweep, rigid } from './geo.js';
import { col } from './sdf.js';
import { addEye, addHorn, addSpikes, lerp3 } from './parts.js';
import { sstep, clamp01, mix, bell, TAU } from './rig.js';

const PAL = {
  webwood: { body: 0x2e2a22, dark: 0x16130f, abd: 0x2a2620, mark: 0x9ccc3c, mark2: 0xe8d040, leg: 0x2c261e, band: 0xa08050, eye: 0xc01810, fang: 0x1a1210 },
  venom: { body: 0x2c1f36, dark: 0x140d1a, abd: 0x2a1c34, mark: 0x60e040, mark2: 0xb0ff60, leg: 0x281c30, band: 0x7a5a90, eye: 0x7cff40, fang: 0x14101a },
  cave: { body: 0x6a6258, dark: 0x3a3430, abd: 0x5e564c, mark: 0xd8ccb4, mark2: 0xf0e8d0, leg: 0x5a5248, band: 0xc0b49c, eye: 0x7ad8ff, fang: 0x2a2420 },
  broodmother: { body: 0x241a14, dark: 0x0e0a08, abd: 0x2a1c14, mark: 0xff9a20, mark2: 0xffd050, leg: 0x2a1e16, band: 0xd09040, eye: 0xd03008, fang: 0x100a08 },
};
const LEGS = [ // coxa angle, toe angle, toe reach, knee height, knee reach
  { a: 0.5, t: 0.36, R: 1.08, kh: 0.8, kr: 0.6 },
  { a: 1.0, t: 0.98, R: 1.0, kh: 0.78, kr: 0.58 },
  { a: 1.6, t: 1.75, R: 0.98, kh: 0.76, kr: 0.56 },
  { a: 2.25, t: 2.55, R: 1.1, kh: 0.8, kr: 0.6 },
];
const legName = (i, s) => 'l' + i + (s < 0 ? 'L' : 'R');
const C0 = [0, 0.46, -0.02]; // cephalothorax centre
function legPts(i, s) {
  const L = LEGS[i];
  const cx = C0[0] + s * Math.sin(L.a) * 0.13, cz = C0[2] - Math.cos(L.a) * 0.15;
  const ka = (L.a * 0.35 + L.t * 0.65), kr = L.kr;
  const knee = [s * Math.sin(ka) * kr, L.kh, -Math.cos(ka) * kr + C0[2]];
  const ank = [s * Math.sin(L.t) * L.R * 0.88, 0.2, -Math.cos(L.t) * L.R * 0.88 + C0[2]];
  const toe = [s * Math.sin(L.t) * L.R, 0, -Math.cos(L.t) * L.R + C0[2]];
  return { coxa: [cx, C0[1] - 0.02, cz], knee, ank, toe };
}

export const spider = {
  variants: ['webwood', 'venom', 'cave', 'broodmother'],
  config(variant, opts) {
    const v = PAL[variant] ? variant : (opts.elite ? 'broodmother' : 'webwood');
    return { variant: v, pal: PAL[v], elite: v === 'broodmother' || !!opts.elite, shapeKey: 'base', scale: v === 'broodmother' ? 1.6 : 1, h: 0.03, mat: { dfreq: 2.8, rim: 0.35 } };
  },
  rig(R) {
    R.add('body', null, C0);
    R.add('abdomen', 'body', [0, 0.52, 0.16]);
    for (const s of [-1, 1]) {
      const n = s < 0 ? 'L' : 'R';
      R.add('chel' + n, 'body', [s * 0.045, 0.42, -0.24]);
      R.add('palp' + n, 'body', [s * 0.085, 0.42, -0.22]); R.add('palp2' + n, 'palp' + n, [s * 0.13, 0.46, -0.36]);
      for (let i = 0; i < 4; i++) {
        const P = legPts(i, s), nm = legName(i, s);
        R.add(nm + 'F', 'body', P.coxa); R.add(nm + 'T', nm + 'F', P.knee); R.add(nm + 'A', nm + 'T', P.ank);
      }
    }
  },
  sculpt(S, cfg) {
    const c = cfg.pal;
    const chit = [0.12, 0.1, 0.25, 0], hairy = [0.35, 0, 0.15, 0];
    // cephalothorax (carapace) + head bump
    S.ell('body', [0, 0.47, -0.04], [0.21, 0.13, 0.25], { k: 0.06, col: c.body, tag: 'carapace', dtl: chit });
    S.ell('body', [0, 0.51, -0.2], [0.14, 0.11, 0.11], { k: 0.05, col: c.body, tag: 'head', dtl: chit });
    S.ell('body', [0, 0.41, -0.02], [0.15, 0.07, 0.18], { k: 0.05, col: c.dark, tag: 'sternum', dtl: chit });
    // pedicel + big abdomen tilted up
    S.cone('abdomen', [0, 0.49, 0.14], [0, 0.53, 0.24], 0.06, 0.08, { k: 0.04, col: c.dark, tag: 'pedicel', dtl: chit });
    S.ell('abdomen', [0, 0.66, 0.52], [0.34, 0.3, 0.42], { k: 0.06, col: c.abd, tag: 'abdomen', rot: [-0.35, 0, 0], dtl: hairy });
    S.cone('abdomen', [0, 0.56, 0.82], [0, 0.5, 0.9], 0.07, 0.03, { k: 0.04, col: c.dark, tag: 'spinner', dtl: chit });
    // chelicerae (fang bases)
    for (const s of [-1, 1]) S.ell('chel' + (s < 0 ? 'L' : 'R'), [s * 0.048, 0.39, -0.27], [0.042, 0.06, 0.045], { k: 0.025, col: c.body, tag: 'chel', rot: [0.3, 0, 0], dtl: chit });
  },
  paint(v, cfg) {
    const c = cfg.pal, [x, y, z] = v.p, [nx, ny, nz] = v.n;
    const ab = v.t('abdomen');
    if (ab > 0.3) {
      // chevrons marching down the back + central stripe + side spots
      const top = sstep(-0.1, 0.4, ny);
      const u = (z - 0.25) * 7 - Math.abs(x) * 5.5;
      const chev = sstep(0.62, 0.78, Math.abs(Math.sin(u * Math.PI))) * top * sstep(0.2, 0.3, z) * (1 - sstep(0.8, 0.86, z)) * (1 - sstep(0.16, 0.2, Math.abs(x)));
      v.mix(c.mark, chev * 0.95);
      const stripe = (1 - sstep(0.018, 0.03, Math.abs(x))) * top * sstep(0.18, 0.25, z) * (1 - sstep(0.78, 0.85, z));
      v.mix(c.mark2, stripe * 0.8);
      for (let i = 0; i < 3; i++) for (const s of [-1, 1]) {
        const d = Math.hypot(x - s * 0.24, y - (0.66 - i * 0.03), z - (0.35 + i * 0.15));
        v.mix(c.mark2, (1 - sstep(0.03, 0.045, d)) * 0.9);
      }
      v.mix(c.dark, sstep(-0.2, -0.7, ny) * 0.7);
    }
    // carapace: radial grooves + lighter rim
    if (v.t('carapace') + v.t('head') > 0.4) {
      const a = Math.atan2(x, z + 0.04);
      v.mul(1 - sstep(0.85, 0.97, Math.abs(Math.sin(a * 4))) * 0.35 * sstep(0.3, 0.8, ny));
      v.mix(c.band, sstep(0.3, 0.0, ny) * sstep(-0.3, 0.1, ny) * 0.25);
    }
    v.mul(1 + Math.sin(x * 14 + z * 9) * Math.sin(y * 11) * 0.06);
  },
  parts(acc, S, R, cfg) {
    const c = cfg.pal, b = (n) => R.index(n);
    const cl = col(c.leg), cb = col(c.band), cd = col(c.dark);
    const hs = (i) => { const q = Math.sin(i * 51.7 + 7.1) * 43758.5; return q - Math.floor(q); };
    let hi = 0;
    for (const s of [-1, 1]) for (let i = 0; i < 4; i++) {
      const P = legPts(i, s), nm = legName(i, s);
      const seg = (bone, a, bb, r0, r1, bulge, bandAt) => {
        const A = new THREE.Vector3(...a), B = new THREE.Vector3(...bb);
        const pts = [], rad = [];
        for (let k = 0; k <= 5; k++) { const t = k / 5; pts.push(A.clone().lerp(B, t)); rad.push(mix(r0, r1, t) * (1 + bulge * Math.sin(t * Math.PI))); }
        const g = sweep(pts, rad, { radial: 7, capEnd: true });
        // dark segment with a pale hairy band mid-way and darker joint ends
        acc.add(g, { skin: rigid(b(bone)), dtl: [0.35, 0, 0.15, 0], color: (p, n, uv) => { const t = uv[1]; const band = sstep(bandAt - 0.12, bandAt - 0.04, t) * (1 - sstep(bandAt + 0.02, bandAt + 0.1, t)); return lerp3(lerp3(cl, cd, sstep(0.85, 1, t) + sstep(0.12, 0, t)), cb, band * 0.8); } });
        // joint knob at the start
        const kg = new THREE.SphereGeometry(r0 * 1.12, 7, 5);
        acc.add(kg, { matrix: new THREE.Matrix4().makeTranslation(A.x, A.y, A.z), skin: rigid(b(bone)), color: cd, dtl: [0.1, 0, 0.2, 0] });
      };
      seg(nm + 'F', P.coxa, P.knee, 0.05, 0.03, 0.3, 0.62);
      seg(nm + 'T', P.knee, P.ank, 0.03, 0.017, 0.15, 0.55);
      // tarsus: thin, pointed, dark tip
      const A = new THREE.Vector3(...P.ank), T = new THREE.Vector3(...P.toe);
      const g = sweep([A, A.clone().lerp(T, 0.6), T], [0.018, 0.012, 0.003], { radial: 6 });
      acc.add(g, { skin: rigid(b(nm + 'A')), dtl: [0.2, 0, 0.1, 0], color: (p, n, uv) => lerp3(cb, cd, sstep(0.2, 0.7, uv[1])) });
      // hairs along femur/tibia
      for (const [bone, a, bb] of [[nm + 'F', P.coxa, P.knee], [nm + 'T', P.knee, P.ank]]) {
        for (let k = 0; k < 4; k++) {
          const t = 0.2 + k * 0.2, p = [mix(a[0], bb[0], t), mix(a[1], bb[1], t), mix(a[2], bb[2], t)];
          const dir = [s * (0.5 + hs(hi++)), 0.6 + hs(hi++) * 0.6, (hs(hi++) - 0.5) * 0.8];
          const H = sweep([p, [p[0] + dir[0] * 0.07, p[1] + dir[1] * 0.07, p[2] + dir[2] * 0.07]], [0.007, 0.001], { radial: 3 });
          acc.add(H, { skin: rigid(b(bone)), color: cd, dtl: [0, 0, 0, 0] });
        }
      }
    }
    // fangs (curved, pointing down/back) on chelicerae
    for (const s of [-1, 1]) {
      const n = s < 0 ? 'L' : 'R';
      addHorn(acc, b('chel' + n), [s * 0.05, 0.36, -0.29], [s * 0.05, 0.3, -0.32], [s * 0.03, 0.27, -0.27], 0.018, 0.003, { base: c.fang, tip: 0xd8d0c0, radial: 6, gpow: 2 });
      // pedipalps: two short segments with a club tip
      const p0 = [s * 0.085, 0.42, -0.22], p1 = [s * 0.13, 0.46, -0.36], p2 = [s * 0.12, 0.38, -0.44];
      acc.add(sweep([p0, p1], [0.02, 0.017], { radial: 6 }), { skin: rigid(b('palp' + n)), color: c.leg, dtl: [0.3, 0, 0.1, 0] });
      acc.add(sweep([p1, p2], [0.017, 0.022], { radial: 6 }), { skin: rigid(b('palp2' + n)), color: (p, nn, uv) => lerp3(cl, cb, uv[1]), dtl: [0.3, 0, 0.1, 0] });
    }
    // eyes: 2 big front, 2 medium, 4 small on top — all glowing
    const eo = { iris: c.eye, pupil: c.eye, rim: 0x100404, irisA: 0, pupilA: 0.9, glow: cfg.elite ? 1.6 : 1.1, glint: true, sink: 0.45 };
    for (const s of [-1, 1]) {
      addEye(acc, S, b('body'), [s * 0.035, 0.53, -0.31], [s * 0.2, 0.15, -1], 0.026, eo);
      addEye(acc, S, b('body'), [s * 0.088, 0.53, -0.29], [s * 0.7, 0.2, -1], 0.017, eo);
      addEye(acc, S, b('body'), [s * 0.05, 0.6, -0.26], [s * 0.3, 1, -0.7], 0.014, eo);
      addEye(acc, S, b('body'), [s * 0.1, 0.58, -0.23], [s * 0.8, 0.8, -0.4], 0.012, eo);
    }
    // bristly hairs on the abdomen (elite: spikes)
    const list = [];
    for (let i = 0; i < (cfg.elite ? 22 : 14); i++) {
      const a = hs(hi++) * TAU, e = 0.2 + hs(hi++) * 0.9;
      const d = [Math.cos(a) * Math.cos(e) * 0.3, Math.sin(e) * 0.27, Math.sin(a) * Math.cos(e) * 0.38];
      list.push({ p: [d[0], 0.64 + d[1], 0.5 + d[2]], dir: [d[0], d[1] + 0.1, d[2] + 0.15], len: cfg.elite ? 0.14 : 0.07, r: cfg.elite ? 0.016 : 0.008 });
    }
    addSpikes(acc, S, list, { base: c.dark, tip: cfg.elite ? c.mark : c.band, radial: 4 });
  },
  sockets: { mouth: ['body', [0, 0.36, -0.32]], head: ['body', [0, 0.62, -0.2]], chest: ['body', [0, 0.45, -0.1]], back: ['abdomen', [0, 0.9, 0.45]], spinner: ['abdomen', [0, 0.5, 0.9]] },
  height: 0.95, radius: 0.8,
  controller(inst) { return new SpiderCtl(inst); },
  actions: ['attack', 'leap', 'hit', 'death', 'rear', 'tap'],
};

function spiderLegs() {
  const legs = [];
  for (const s of [-1, 1]) for (let i = 0; i < 4; i++) {
    const P = legPts(i, s), nm = legName(i, s);
    legs.push({ id: nm, chain: [nm + 'F', nm + 'T', nm + 'A'], toe: P.toe, body: 'body', lift: 0.16, flex: 0, heel: 0, out: 0 });
  }
  return legs;
}
// tetrapod: L0 R1 L2 R3 together, R0 L1 R2 L3 together (with a slight metachronal ripple)
const off = {}; for (let i = 0; i < 4; i++) { off[legName(i, -1)] = (i % 2 ? 0.5 : 0) + i * 0.04; off[legName(i, 1)] = (i % 2 ? 0 : 0.5) + i * 0.04; }
const offWave = {}; for (let i = 0; i < 4; i++) { offWave[legName(i, -1)] = (3 - i) * 0.125; offWave[legName(i, 1)] = 0.5 + (3 - i) * 0.125; }
const SPIDER_GAIT = {
  legs: spiderLegs(), maxStride: 0.9, fMin: 0.7, actV: 0.2, actTurn: 1.2, settleDist: 0.1,
  gaits: [
    { v: 1.2, f: 1.5, duty: 0.66, lift: 0.9, off: offWave, bob: 0.01, bobF: 4, sway: 0.01, swayF: 2, roll: 0.02, rollF: 2 },
    { v: 3.0, f: 2.6, duty: 0.52, lift: 1, off, bob: 0.015, bobF: 2, sway: 0.012, swayF: 2, roll: 0.02, rollF: 2 },
    { v: 7.0, f: 3.8, duty: 0.42, lift: 1.1, off, bob: 0.02, bobF: 2, pitch: 0.02, pitchF: 2, lean: 0.05 },
  ],
};

class SpiderCtl {
  constructor(inst) {
    this.inst = inst; this.pose = inst.pose;
    const P = this.pose, B = P.b;
    this.b = { body: B.body, abd: B.abdomen, chelL: B.chelL, chelR: B.chelR, palpL: B.palpL, palpR: B.palpR, palp2L: B.palp2L, palp2R: B.palp2R };
    this.gait = new Gait(P, SPIDER_GAIT);
    this.acts = new ActionSet(this, SPIDER_ACTIONS);
    this.t = Math.random() * 50; this.combat = 0; this.dead = false; this.air = 0; this.fidgetT = 3 + Math.random() * 4;
    this.abdLag = 0; this.abdV = 0; this.turnSm = 0; this.fang = 0;
  }
  play(name, speed = 1) {
    if (name === 'idle' || name === 'stand') { this.acts.stop(); return true; }
    if (name === 'revive') { this.dead = false; this.acts.stop(); return true; }
    if (this.dead && name !== 'death') return false;
    if (name === 'death') this.dead = true;
    return this.acts.play(name, speed);
  }
  update(dt, state = {}) {
    dt = Math.min(dt, 0.1);
    const P = this.pose, b = this.b, G = this.gait;
    this.t += dt;
    let speed = (state.speed ?? 0) / this.inst.scale, turn = state.turn ?? 0, strafe = (state.strafe ?? 0) / this.inst.scale;
    // state.dead true → die; revive only on a true→false transition (play('death') alone also holds)
    if (state.dead && !this.dead) this.play('death');
    if (this._sd && !state.dead && this.dead) this.play('revive');
    this._sd = !!state.dead;
    if (this.dead) { speed = 0; turn = 0; strafe = 0; }
    this.acts.update(dt);
    const dW = this.acts.weight('death');
    this.combat += ((state.combat ? 1 : 0) - this.combat) * (1 - Math.exp(-4 * dt));
    this.turnSm += (turn - this.turnSm) * (1 - Math.exp(-4 * dt));
    this.air += ((state.grounded === false ? 1 : 0) - this.air) * (1 - Math.exp(-10 * dt));
    P.reset();
    G.update(dt, speed * (1 - dW), turn * (1 - dW), strafe * (1 - dW));
    const idle = 1 - clamp01(G.act * 1.5);
    // body: low slung, sways; combat raises the front and spreads the stance
    const breath = Math.sin(this.t * 2.2);
    G.adaptBody(dt);
    P.move(b.body, G.sway, G.bob - 0.04 * this.combat + 0.01 * breath * idle + G.gOff, 0);
    P.rot(b.body, G.pitch + 0.1 * this.combat - G.lean * clamp01(Math.abs(speed) / 6) + G.gPitch, 0, G.roll + this.turnSm * 0.05 + G.gRoll);
    for (const L of G.legs) L.homeOff.set(Math.sign(L.toe.x) * 0.06 * this.combat, 0, L.toe.z < 0 ? -0.04 * this.combat : 0.02 * this.combat);
    // abdomen: lagging spring + breathing pulse
    const target = -G.bob * 6 + G.pitch;
    this.abdV += ((target - this.abdLag) * 60 - this.abdV * 9) * dt; this.abdLag += this.abdV * dt;
    P.rot(b.abd, this.abdLag * 0.6 + 0.04 * Math.sin(this.t * 1.3), -this.turnSm * 0.12 + Math.sin(this.t * 0.7) * 0.03 * idle, -G.sway * 2);
    P.sc[b.abd].setScalar(1 + 0.02 * breath);
    // pedipalps & fangs twitch
    const tw = (o) => Math.pow(Math.max(0, Math.sin(this.t * 2.3 + o)), 8);
    P.rot(b.palpL, -0.2 * tw(0) + Math.sin(this.t * 7) * 0.05 * this.combat, 0.15 * tw(1), 0);
    P.rot(b.palpR, -0.2 * tw(2) + Math.sin(this.t * 7 + 1) * 0.05 * this.combat, -0.15 * tw(3), 0);
    P.rx(b.palp2L, 0.3 * tw(0.4)); P.rx(b.palp2R, 0.3 * tw(2.4));
    this.fang = 0.15 * this.combat * (0.5 + 0.5 * Math.sin(this.t * 5)) + 0.1 * tw(5);
    // idle fidget
    if (idle > 0.9 && !this.dead && !this.acts.list.length) { this.fidgetT -= dt; if (this.fidgetT < 0) { this.fidgetT = 3 + Math.random() * 5; this.acts.play(Math.random() < 0.7 ? 'tap' : 'rear'); } }
    this.acts.apply();
    P.rot(b.chelL, this.fang, 0, 0.3 * this.fang); P.rot(b.chelR, this.fang, 0, -0.3 * this.fang);
    P.fk();
    G.solve(P, { air: this.air * (1 - dW), airPaw: 0 });
    P.apply(this.inst.bones);
    this.inst.material.userData.u.uEmisK.value = mix(1, 0.15, dW);
  }
}

const legOverride = (L, v, w) => { L.override = L.override || new THREE.Vector3(); L.override.copy(v); L.overrideLocal = true; L.overrideW = Math.max(L.overrideW, w); };
const _v = new THREE.Vector3();
const SPIDER_ACTIONS = {
  attack: { dur: 0.9, a: 0.1, d: 0.8, fn(ctl, a, w) { // rear up, then strike down with fangs
    const P = ctl.pose, b = ctl.b, k = a.k;
    const up = sstep(0, 0.35, k) * (1 - sstep(0.4, 0.55, k));
    const strike = sstep(0.4, 0.55, k) * (1 - sstep(0.7, 1, k));
    P.move(b.body, 0, (0.12 * up - 0.06 * strike) * w, (0.08 * up - 0.25 * strike) * w);
    P.rx(b.body, (0.45 * up - 0.15 * strike) * w);
    ctl.fang = Math.max(ctl.fang, (0.7 * up + 0.2 * strike) * w);
    for (const L of ctl.gait.legs) if (L.id[1] === '0') legOverride(L, _v.set(L.toe.x * 0.55, 0.75 * up + 0.2 * strike, L.toe.z * 0.6 - 0.15 * strike), (up + strike * 0.5) * w);
  } },
  rear: { dur: 1.4, a: 0.2, d: 0.75, fn(ctl, a, w) { // threat display: front legs raised & waving
    const P = ctl.pose, b = ctl.b, t = a.t;
    const up = bell(clamp01(a.k * 1.1)) * w;
    P.move(b.body, 0, 0.1 * up, 0.06 * up); P.rx(b.body, 0.35 * up);
    ctl.fang = Math.max(ctl.fang, 0.5 * up);
    for (const L of ctl.gait.legs) if (L.id[1] === '0' || L.id[1] === '1') {
      const f = L.id[1] === '0' ? 1 : 0.5;
      legOverride(L, _v.set(L.toe.x * 0.7, (0.55 + 0.1 * Math.sin(t * 8 + (L.toe.x > 0 ? 1 : 0))) * f, L.toe.z * 0.7), up * f);
    }
  } },
  tap: { dur: 0.8, a: 0.15, d: 0.7, fn(ctl, a, w) { // one front leg taps the ground
    const L = ctl.gait.legs[Math.floor(a.seed) % 2 ? 0 : 4];
    const k = a.k, h = Math.abs(Math.sin(k * Math.PI * 2)) * 0.12;
    L.override = L.override || new THREE.Vector3(); L.override.set(L.home.x * 1.05, h, L.home.z - 0.05); L.overrideLocal = false; L.overrideW = Math.max(L.overrideW, w);
  } },
  leap: { dur: 1.25, a: 0.05, d: 0.9, fn(ctl, a, w) { // crouch, spring up & forward (legs splayed), land
    const P = ctl.pose, b = ctl.b, k = a.k;
    const crouch = sstep(0, 0.25, k) * (1 - sstep(0.28, 0.36, k)) + sstep(0.78, 0.86, k) * (1 - sstep(0.9, 1, k)) * 0.7;
    const airT = clamp01((k - 0.3) / 0.5), inAir = k > 0.3 && k < 0.8 ? 1 : 0;
    const h = Math.sin(airT * Math.PI) * 0.7 * inAir;
    P.move(b.body, 0, (-0.16 * crouch + h) * w, (-0.9 * sstep(0.3, 0.8, k) * (1 - sstep(0.85, 1, k))) * w);
    P.rx(b.body, (0.25 * Math.sin(airT * Math.PI) * inAir - 0.1 * crouch) * w);
    ctl.fang = Math.max(ctl.fang, 0.6 * inAir * w);
    for (const L of ctl.gait.legs) {
      const fr = L.toe.z < 0 ? 1 : 0;
      const spread = inAir * sstep(0.3, 0.45, k);
      legOverride(L, _v.set(L.toe.x * (1 + 0.2 * spread), 0.3 * spread + (fr ? 0.2 : 0) * spread, L.toe.z * (1 + 0.25 * spread)), spread * w);
    }
  } },
  hit: { dur: 0.4, a: 0.1, d: 0.5, fn(ctl, a, w) {
    const P = ctl.pose, b = ctl.b, j = Math.sin(a.k * Math.PI) * w;
    P.move(b.body, 0, 0.04 * j, 0.08 * j); P.rot(b.body, 0.15 * j, 0, 0.08 * j * Math.sign(Math.sin(a.seed)));
    P.rx(b.abd, -0.2 * j); ctl.fang = Math.max(ctl.fang, 0.5 * j);
  } },
  death: { dur: 1.2, hold: true, excl: true, fadeIn: 0.05, fn(ctl, a, w) { // drop, tilt, legs curl in and up
    const P = ctl.pose, b = ctl.b, t = a.t;
    const drop = sstep(0.05, 0.45, t), curl = sstep(0.2, 1.1, t);
    const tw = Math.sin(t * 40) * 0.04 * (1 - sstep(0.3, 1.0, t));
    P.move(b.body, 0, -0.3 * drop * w, 0);
    P.rot(b.body, (0.1 * drop + tw) * w, 0, 0.3 * drop * w);
    P.rx(b.abd, -0.15 * drop * w);
    ctl.fang = Math.max(ctl.fang, 0.4 * drop * w);
    for (const L of ctl.gait.legs) legOverride(L, _v.set(L.toe.x * mix(1, 0.2, curl), mix(0, 0.62, curl), L.toe.z * mix(1, 0.3, curl)), Math.max(drop * 0.5, curl) * w);
  } },
};
