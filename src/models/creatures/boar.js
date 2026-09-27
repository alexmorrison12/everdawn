// Bristleback boar: hunched, huge tusks, bristly dorsal mane, stubby legs, piglet stripes. Variants + elder (elite).
import * as THREE from 'three';
import { QuadCtl, deathAction } from './quadruped.js';
import { leafGeo, rigid } from './geo.js';
import { col } from './sdf.js';
import { addEye, addSpikes, addHorn } from './parts.js';
import { sstep, clamp01, mix, bell } from './rig.js';

const PAL = {
  bristleback: { base: 0x7c4a30, dark: 0x3a1f14, belly: 0xc08e70, stripe: 0xd2a476, snout: 0xc98676, nose: 0xe0a092, hoof: 0x2a1e1a, mane: 0x22120c, maneTip: 0x5e3a26, tusk: 0xf4e8cc, eye: 0x1a0c08 },
  dusky: { base: 0x5c5450, dark: 0x262220, belly: 0x9a8c84, stripe: 0xb4a698, snout: 0xa88480, nose: 0xc89a94, hoof: 0x1e1a18, mane: 0x1a1614, maneTip: 0x6a625c, tusk: 0xeee4cc, eye: 0x100808 },
  piglet: { base: 0x9a6444, dark: 0x5a3422, belly: 0xd8a888, stripe: 0xecc89a, snout: 0xe09a8c, nose: 0xf0b0a4, hoof: 0x3a2a24, mane: 0x4a2a1a, maneTip: 0x7a5034, tusk: 0xf4e8cc, eye: 0x1a0c08 },
  elder: { base: 0x5e3a28, dark: 0x24140c, belly: 0xa07a60, stripe: 0xb0885e, snout: 0xb07868, nose: 0xcc9084, hoof: 0x1a1210, mane: 0x120a06, maneTip: 0xb0b0a8, tusk: 0xfff4da, eye: 0xff6020, gold: 0xe8b030 },
};

export const boar = {
  variants: ['bristleback', 'dusky', 'piglet', 'elder'],
  config(variant, opts) {
    const v = PAL[variant] ? variant : (opts.elite ? 'elder' : 'bristleback');
    return { variant: v, pal: PAL[v], elite: v === 'elder' || !!opts.elite, piglet: v === 'piglet', shapeKey: v === 'piglet' ? 'piglet' : 'adult', scale: v === 'elder' ? 1.45 : v === 'piglet' ? 0.5 : 1, h: v === 'piglet' ? 0.042 : 0.0295, mat: { dfreq: 2.6 } };
  },
  rig(R) {
    R.add('body', null, [0, 0.6, 0.0]);
    R.add('hips', 'body', [0, 0.58, 0.34]);
    R.add('chest', 'body', [0, 0.62, -0.26]);
    R.add('neck', 'chest', [0, 0.64, -0.44]);
    R.add('head', 'neck', [0, 0.62, -0.55]);
    R.add('jaw', 'head', [0, 0.5, -0.6]);
    R.add('earL', 'head', [-0.1, 0.76, -0.56]); R.add('earR', 'head', [0.1, 0.76, -0.56]);
    R.add('tail1', 'hips', [0, 0.66, 0.54]); R.add('tail2', 'tail1', [0, 0.6, 0.62]);
    for (const s of [-1, 1]) {
      const n = s < 0 ? 'L' : 'R';
      R.add('fU' + n, 'chest', [0.15 * s, 0.5, -0.3]); R.add('fL' + n, 'fU' + n, [0.155 * s, 0.31, -0.2]); R.add('fP' + n, 'fL' + n, [0.155 * s, 0.11, -0.29]);
      R.add('rT' + n, 'hips', [0.14 * s, 0.56, 0.36]); R.add('rS' + n, 'rT' + n, [0.15 * s, 0.36, 0.26]); R.add('rM' + n, 'rS' + n, [0.15 * s, 0.19, 0.38]); R.add('rP' + n, 'rM' + n, [0.15 * s, 0.07, 0.35]);
    }
  },
  sculpt(S, cfg) {
    const c = cfg.pal, P = cfg.piglet;
    const hair = [0.3, 0, 0.18, 0], skin = [0.05, 0.05, 0.2, 0], hoofD = [0, 0, 0.15, 0.2];
    // barrel body, big hunched shoulders, compact rump
    S.ell('body', [0, 0.53, 0.02], [0.25, 0.24, 0.36], { k: 0.1, col: c.base, tag: 'body', dtl: hair });
    S.ell('chest', [0, 0.74, -0.2], [0.23, 0.25, 0.26], { k: 0.1, col: c.base, tag: 'hump', dtl: hair });
    S.ell('chest', [0, 0.55, -0.32], [0.21, 0.23, 0.18], { k: 0.09, col: c.base, tag: 'body', dtl: hair });
    S.ell('hips', [0, 0.58, 0.28], [0.2, 0.2, 0.18], { k: 0.09, col: c.base, tag: 'body', dtl: hair });
    for (const s of [-1, 1]) {
      const n = s < 0 ? 'L' : 'R';
      S.ell('rT' + n, [s * 0.13, 0.48, 0.34], [0.1, 0.16, 0.13], { k: 0.08, col: c.base, tag: 'ham', rot: [0.2, 0, 0], dtl: hair });
      S.ell('fU' + n, [s * 0.15, 0.47, -0.28], [0.09, 0.14, 0.11], { k: 0.08, col: c.base, tag: 'shoulder', dtl: hair });
    }
    // neck + wedge head
    S.cone('neck', [0, 0.64, -0.34], [0, 0.63, -0.52], 0.2, 0.16, { k: 0.08, col: c.base, b2: 'head', t0: 0.5, t1: 1, dtl: hair });
    S.ell('head', [0, 0.63, -0.6], [0.15, 0.155, 0.17], { k: 0.07, col: c.base, tag: 'head', dtl: hair });
    S.ell('head', [0, 0.705, -0.65], [0.12, 0.07, 0.11], { k: 0.05, col: c.dark, tag: 'brow', dtl: hair });
    for (const s of [-1, 1]) S.ell('head', [s * 0.1, 0.53, -0.66], [0.072, 0.085, 0.1], { k: 0.05, col: c.base, tag: 'jowl', dtl: hair });
    S.cone('head', [0, 0.575, -0.7], [0, 0.505, -0.86], 0.115, 0.082, { k: 0.05, col: c.snout, tag: 'snout', dtl: skin });
    S.ell('head', [0, 0.495, -0.9], [0.088, 0.074, 0.034], { k: 0.028, col: c.nose, tag: 'nose', rot: [-0.4, 0, 0], dtl: skin, soft: 0.006 });
    for (const s of [-1, 1]) S.sph('head', [s * 0.03, 0.49, -0.93], 0.017, { k: 0.01, sub: true, col: 0x3a1a18, tag: 'nostril' });
    S.cone('head', [0, 0.5, -0.68], [0, 0.49, -0.86], 0.02, 0.012, { k: 0.012, sub: true, col: 0x2a1212, tag: 'mouth' });
    // lower jaw
    S.cone('jaw', [0, 0.49, -0.62], [0, 0.462, -0.83], 0.07, 0.045, { group: 1, k: 0.03, col: c.snout, tag: 'jaw', dtl: skin });
    // dorsal crest (SDF ridge; bristles added as parts)
    for (let i = 0; i < 7; i++) {
      const t = i / 6, z = -0.58 + t * 0.7, y = 0.78 + Math.sin(t * Math.PI) * 0.12 - t * 0.02;
      S.cone(i < 2 ? 'head' : i < 5 ? 'chest' : 'body', [0, y - 0.06, z], [0, y + 0.02, z + 0.1], 0.06, 0.02, { k: 0.05, col: c.mane, tag: 'mane', dtl: hair });
    }
    // legs: short, thick above, trim below, dark hooves
    for (const s of [-1, 1]) {
      const n = s < 0 ? 'L' : 'R';
      S.cone('fU' + n, [s * 0.15, 0.5, -0.3], [s * 0.155, 0.31, -0.2], 0.075, 0.055, { k: 0.05, col: c.base, b2: 'fL' + n, t0: 0.75, t1: 1, dtl: hair });
      S.cone('fL' + n, [s * 0.155, 0.31, -0.2], [s * 0.155, 0.11, -0.29], 0.05, 0.034, { k: 0.035, col: c.base, tag: 'leg', b2: 'fP' + n, t0: 0.85, t1: 1, dtl: hair });
      S.cone('fP' + n, [s * 0.155, 0.11, -0.29], [s * 0.155, 0.045, -0.32], 0.034, 0.036, { k: 0.025, col: c.dark, tag: 'leg', dtl: hair });
      S.box('fP' + n, [s * 0.155, 0.035, -0.325], [0.042, 0.035, 0.048], 0.016, { k: 0.015, col: c.hoof, tag: 'hoof', rot: [-0.25, 0, 0], dtl: hoofD, soft: 0.004 });
      S.cone('rT' + n, [s * 0.14, 0.56, 0.36], [s * 0.15, 0.36, 0.26], 0.085, 0.058, { k: 0.05, col: c.base, b2: 'rS' + n, t0: 0.8, t1: 1, dtl: hair });
      S.cone('rS' + n, [s * 0.15, 0.36, 0.26], [s * 0.15, 0.19, 0.38], 0.055, 0.036, { k: 0.035, col: c.base, tag: 'leg', b2: 'rM' + n, t0: 0.85, t1: 1, dtl: hair });
      S.cone('rM' + n, [s * 0.15, 0.19, 0.38], [s * 0.15, 0.07, 0.35], 0.035, 0.034, { k: 0.025, col: c.dark, tag: 'leg', b2: 'rP' + n, t0: 0.8, t1: 1, dtl: hair });
      S.box('rP' + n, [s * 0.15, 0.035, 0.325], [0.04, 0.035, 0.046], 0.016, { k: 0.015, col: c.hoof, tag: 'hoof', rot: [-0.25, 0, 0], dtl: hoofD, soft: 0.004 });
    }
    // curly tail
    S.cone('tail1', [0, 0.66, 0.5], [0, 0.63, 0.6], 0.025, 0.018, { k: 0.02, col: c.base, tag: 'tail', b2: 'tail2', dtl: hair });
    S.cone('tail2', [0, 0.63, 0.6], [0.03, 0.58, 0.64], 0.018, 0.012, { k: 0.015, col: c.base, tag: 'tail', dtl: hair });
    S.ell('tail2', [0.04, 0.55, 0.65], [0.025, 0.04, 0.025], { k: 0.015, col: c.dark, tag: 'tail', dtl: hair });
  },
  paint(v, cfg) {
    const c = cfg.pal, [x, y, z] = v.p, [nx, ny, nz] = v.n;
    const jag = Math.sin(z * 40 + x * 10) * 0.5 + Math.sin(z * 67 + y * 30) * 0.3;
    // darker back, pale belly
    v.mix(c.dark, sstep(0.3, 0.8, ny + jag * 0.1) * sstep(0.6, 0.75, y) * 0.55 * (1 - v.t('snout') - v.t('nose')));
    v.mix(c.belly, sstep(-0.1, -0.6, ny + jag * 0.1) * (1 - v.t('snout') - v.t('jaw')) * 0.85);
    // piglet stripes along the flanks
    const side = sstep(0.35, 0.75, Math.abs(nx));
    const band = sstep(0.62, 0.86, Math.sin(y * (cfg.piglet ? 46 : 58) + Math.sin(z * 9) * 0.8 + 1.3));
    const strip = side * band * sstep(0.42, 0.5, y) * (1 - sstep(0.76, 0.82, y)) * sstep(-0.45, -0.3, z) * (1 - sstep(0.3, 0.42, z));
    v.mix(c.stripe, strip * (cfg.piglet ? 0.8 : 0.32) * (1 - v.t('head') - v.t('snout')));
    // snout gradient to pink nose, dark mouth
    v.mix(c.nose, v.t('nose') * 0.9);
    v.mix(0x2a1010, Math.max(v.t('nostril'), v.t('mouth')) * 0.9);
    if (v.group === 1 && ny > 0.4) v.mix(0x6a2626, 0.7);
    // hoof tops darker, legs darker toward the bottom
    v.mix(c.dark, v.t('leg') * sstep(0.2, 0.05, y) * 0.5);
    v.mul(1 + Math.sin(x * 11 + z * 7) * Math.sin(y * 9) * 0.05);
    v.fx = v.t('mane') * sstep(0.7, 0.9, y);
    if (v.t('hoof') > 0.5) v.dtl[0] = 0;
  },
  parts(acc, S, R, cfg) {
    const c = cfg.pal, b = (n) => R.index(n), P = cfg.piglet;
    for (const s of [-1, 1]) {
      addEye(acc, S, b('head'), [s * 0.1, 0.64, -0.72], [s * 0.8, 0.12, -1], 0.018, { iris: c.eye, pupil: 0x050303, irisA: cfg.elite ? 0.9 : 0, pupilA: 0.7, glow: cfg.elite ? 2.5 : 0 });
      // ears: small leaf plates, pink inside
      const g = leafGeo(0.06, P ? 0.13 : 0.11, 0.03, 0.5, 0.25, { nu: 6, nv: 5 });
      const m = new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(0.5, s * 0.6, -s * 0.55, 'YXZ'));
      m.setPosition(s * 0.1, 0.74, -0.56);
      const outer = col(c.base), inner = col(c.nose);
      acc.add(g, { matrix: m, skin: rigid(b(s < 0 ? 'earL' : 'earR')), dtl: [0.2, 0, 0.1, 0], color: (p, n, uv) => uv[0] >= 1 ? outer : (uv[0] % 1) * 2 > 0.6 ? outer : inner });
      // tusks: big curving ivory from the lower jaw (tiny on piglets)
      const T = P ? 0.35 : cfg.elite ? 1.5 : 1.3;
      addHorn(acc, b('jaw'), [s * 0.05, 0.47, -0.76], [s * (0.07 + 0.06 * T), 0.47 + 0.02 * T, -0.8 - 0.05 * T], [s * (0.08 + 0.07 * T), 0.5 + 0.13 * T, -0.79 - 0.03 * T], 0.032 * Math.sqrt(T), 0.004, { base: 0x9a8062, tip: c.tusk, radial: 8, n: 7 });
      if (cfg.elite) { // golden tusk bands
        const ring = new THREE.TorusGeometry(0.03, 0.01, 5, 12);
        const m2 = new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(Math.PI / 2 - 0.1, 0, s * 0.9)); m2.setPosition(s * 0.11, 0.49, -0.83);
        acc.add(ring, { matrix: m2, skin: rigid(b('jaw')), color: c.gold, dtl: [0, 0, 0.1, 0] });
      }
    }
    if (cfg.elite) {
      const ring = new THREE.TorusGeometry(0.035, 0.008, 5, 14);
      const m3 = new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(0.3, 0, 0)); m3.setPosition(0, 0.45, -0.93);
      acc.add(ring, { matrix: m3, skin: rigid(b('head')), color: c.gold, dtl: [0, 0, 0.1, 0] });
    }
    // bristles along the crest (stand up when charging / in combat)
    const list = [];
    const n = P ? 10 : 40;
    const hs = (i) => { const q = Math.sin(i * 91.7 + 13.1) * 43758.5; return q - Math.floor(q); };
    for (let i = 0; i < n; i++) {
      const t = i / (n - 1), z = -0.6 + t * 0.78, y = 0.84 + Math.sin(t * Math.PI) * 0.14;
      const x = (hs(i) - 0.5) * 0.09;
      const L = (P ? 0.05 : (0.1 + 0.1 * Math.sin(Math.min(1, t * 1.3) * Math.PI)) * (0.75 + 0.5 * hs(i + 50))) * (cfg.elite ? 1.25 : 1);
      list.push({ p: [x, y + 0.05, z], dir: [x * 4 + (hs(i + 9) - 0.5) * 0.4, 0.75 - t * 0.25 + (hs(i + 3) - 0.5) * 0.3, 0.6 + t * 0.35], len: L, r: 0.008 + 0.004 * hs(i + 7) });
    }
    addSpikes(acc, S, list, { base: c.mane, tip: c.maneTip, radial: 4, hackle: 1, bend: 0.35 });
  },
  sockets: { mouth: ['jaw', [0, 0.45, -0.9]], head: ['head', [0, 0.8, -0.6]], chest: ['chest', [0, 0.55, -0.4]], back: ['body', [0, 0.85, 0]] },
  height: 0.95, radius: 0.5,
  controller(inst) { return new QuadCtl(inst, BOAR_SPEC); },
  actions: ['attack', 'charge', 'hit', 'death', 'root', 'snort'],
};

const BOAR_SPEC = {
  bones: { body: 'body', hips: 'hips', chest: 'chest', neck: 'neck', head: 'head', jaw: 'jaw', tail: ['tail1', 'tail2'], ears: ['earL', 'earR'] },
  gait: {
    legs: [
      { id: 'FL', chain: ['fUL', 'fLL', 'fPL'], toe: [-0.155, 0, -0.37], body: 'chest', scap: 0.35, lift: 0.09, flex: 1.1, out: 0.05, heel: 0.3 },
      { id: 'FR', chain: ['fUR', 'fLR', 'fPR'], toe: [0.155, 0, -0.37], body: 'chest', scap: 0.35, lift: 0.09, flex: 1.1, out: 0.05, heel: 0.3 },
      { id: 'RL', chain: ['rTL', 'rSL', 'rML', 'rPL'], toe: [-0.15, 0, 0.28], body: 'hips', scap: 0.3, lift: 0.08, flex: 0.8, out: 0.1, metaK: 0.9, heel: 0.25 },
      { id: 'RR', chain: ['rTR', 'rSR', 'rMR', 'rPR'], toe: [0.15, 0, 0.28], body: 'hips', scap: 0.3, lift: 0.08, flex: 0.8, out: 0.1, metaK: 0.9, heel: 0.25 },
    ],
    maxStride: 0.5,
    gaits: [
      { v: 1.1, f: 2.0, duty: 0.64, lift: 0.8, off: { RL: 0, FL: 0.25, RR: 0.5, FR: 0.75 }, bob: 0.012, bobF: 2, roll: 0.035, rollF: 1, nod: 0.04, nodF: 2, nodPh: 0.2 },
      { v: 2.6, f: 3.0, duty: 0.46, lift: 1, off: { FL: 0, RR: 0, FR: 0.5, RL: 0.5 }, bob: 0.022, bobF: 2, bobPh: 0.3, roll: 0.03, rollF: 1, nod: 0.03, nodF: 2 },
      { v: 6.5, f: 3.9, duty: 0.27, lift: 1.2, off: { RL: 0, RR: 0.08, FL: 0.45, FR: 0.55 }, bob: 0.05, bobF: 1, bobPh: 0.6, pitch: 0.09, pitchF: 1, pitchPh: 0.05, flex: 0.08, flexF: 1, flexPh: 0.2, nod: 0.04, nodF: 1, nodPh: 0.7 },
    ],
  },
  neck: { pitch: 0, run: -0.15, combat: -0.25, walk: -0.04, headCombat: 0.05, comp: 0.3, stab: 0.6 },
  tail: { wag: 0.5, wagF: 2.2, run: 0.3, combat: 0.2 },
  breathe: 0.018, combatCrouch: 0.04, combatPitch: -0.04, runDrop: 0.02,
  fidgets: [{ name: 'root', w: 3 }, { name: 'snort', w: 2 }],
  pose(ctl) {
    ctl.jaw += 0.05 * ctl.run;
    ctl.hackle = Math.max(ctl.hackle, ctl.acts.weight('charge'));
  },
  actions: {
    attack: { dur: 0.8, a: 0.12, d: 0.78, fn(ctl, a, w) { // tusk gore: dip, then rip upward with a twist
      const P = ctl.pose, b = ctl.b, k = a.k;
      const dip = sstep(0, 0.3, k) * (1 - sstep(0.3, 0.45, k));
      const rip = sstep(0.3, 0.48, k) * (1 - sstep(0.6, 1, k));
      P.move(b.body, 0, -0.04 * dip * w, (0.05 * dip - 0.18 * rip) * w);
      P.rx(b.body, (-0.08 * dip + 0.06 * rip) * w);
      P.rx(b.neck, (-0.3 * dip + 0.3 * rip) * w);
      P.rot(b.head, (-0.25 * dip + 0.45 * rip) * w, 0, 0.35 * rip * w);
      ctl.jaw = Math.max(ctl.jaw, 0.25 * rip * w);
      ctl.hackle = Math.max(ctl.hackle, w);
    } },
    charge: { dur: 1.5, a: 0.1, d: 0.97, fn(ctl, a, w) { // wind-up: paw the ground twice, head low, then crouch to spring
      const P = ctl.pose, b = ctl.b, t = a.t;
      const low = sstep(0, 0.3, t);
      const spring = sstep(1.1, 1.45, t);
      P.move(b.body, 0, (-0.04 * low - 0.04 * spring) * w, 0.05 * spring * w);
      P.rx(b.body, (-0.06 * low - 0.05 * spring) * w);
      P.rx(b.neck, -0.3 * low * w); P.rx(b.head, (-0.1 + Math.sin(t * 20) * 0.04 * (1 - spring)) * low * w);
      // scrape: front-right hoof drags back twice
      const L = ctl.gait.legs[1];
      const sc = t > 0.2 && t < 1.05 ? ((t - 0.2) % 0.42) / 0.42 : -1;
      if (sc >= 0) {
        L.override = L.override || new THREE.Vector3();
        const fwd = sc < 0.35 ? sc / 0.35 : 1 - (sc - 0.35) / 0.65;
        L.override.set(L.home.x, sc < 0.35 ? Math.sin(sc / 0.35 * Math.PI) * 0.08 : 0.005, L.home.z - 0.12 * fwd + 0.08);
        L.overrideW = w; L.overridePaw = sc < 0.35 ? -0.6 : 0.15;
      }
      ctl.hackle = Math.max(ctl.hackle, w);
      ctl.ear = mix(ctl.ear, 1, w);
    } },
    hit: { dur: 0.4, a: 0.1, d: 0.5, fn(ctl, a, w) {
      const P = ctl.pose, b = ctl.b, j = Math.sin(a.k * Math.PI) * w;
      P.move(b.body, 0, 0.02 * j, 0.06 * j); P.rot(b.body, 0.06 * j, 0, 0.08 * j * Math.sign(Math.sin(a.seed)));
      P.rx(b.neck, 0.2 * j); P.rx(b.head, 0.15 * j); ctl.ear = mix(ctl.ear, 1, j); ctl.jaw = Math.max(ctl.jaw, 0.25 * j);
    } },
    death: deathAction({ lieY: 0.34, roll: 1.45 }),
    root: { dur: 2.6, a: 0.2, d: 0.82, fn(ctl, a, w) { // snuffle in the dirt
      const P = ctl.pose, b = ctl.b, t = a.t;
      P.rx(b.neck, -0.35 * w); P.rot(b.head, (-0.35 + Math.sin(t * 9) * 0.06) * w, Math.sin(t * 3.1) * 0.25 * w, Math.sin(t * 5) * 0.08 * w);
      P.rx(b.chest, -0.05 * w);
    } },
    snort: { dur: 0.9, a: 0.1, d: 0.6, fn(ctl, a, w) {
      const P = ctl.pose, b = ctl.b, k = a.k;
      const j = bell(clamp01(k / 0.4)) + 0.6 * bell(clamp01((k - 0.35) / 0.3));
      P.rot(b.head, 0.22 * j * w, 0, 0.1 * Math.sin(k * 25) * w); P.rx(b.neck, 0.08 * j * w);
      ctl.ear = mix(ctl.ear, 0.8, j * w); ctl.jaw = Math.max(ctl.jaw, 0.1 * j * w);
    } },
  },
};
