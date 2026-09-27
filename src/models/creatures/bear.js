// Brown bear: massive shoulder hump, heavy head, small round ears, thick plantigrade legs, long claws.
import * as THREE from 'three';
import { QuadCtl, deathAction } from './quadruped.js';
import { leafGeo, rigid } from './geo.js';
import { col } from './sdf.js';
import { addEye, addHorn } from './parts.js';
import { sstep, mix } from './rig.js';

const PAL = {
  brown: { base: 0x6e4628, dark: 0x3a2414, belly: 0x8a6440, muzzle: 0xb08a64, nose: 0x181210, claw: 0xe8dcc4, tip: 0xa07a50 },
  black: { base: 0x2a2626, dark: 0x141212, belly: 0x3e3836, muzzle: 0x9a7a5a, nose: 0x0c0a0a, claw: 0xd8ccb4, tip: 0x4a4440 },
  grizzled: { base: 0x7a5a3c, dark: 0x3e2c1e, belly: 0x9a7a58, muzzle: 0xc0a07a, nose: 0x181210, claw: 0xf0e4cc, tip: 0xd8c8a8 },
  ursoc: { base: 0x4a2e1c, dark: 0x1e120a, belly: 0x6a4a30, muzzle: 0xa08060, nose: 0x100a08, claw: 0xf4e0a0, tip: 0xc8c0b0, gold: 0xf0c040 },
};

export const bear = {
  variants: ['brown', 'black', 'grizzled', 'ursoc'],
  config(variant, opts) {
    const v = PAL[variant] ? variant : (opts.elite ? 'ursoc' : 'brown');
    return { variant: v, pal: PAL[v], elite: v === 'ursoc' || !!opts.elite, shapeKey: 'base', scale: v === 'ursoc' ? 1.4 : 1, h: 0.045, mat: { dfreq: 1.8 } };
  },
  rig(R) {
    R.add('body', null, [0, 1.05, 0.05]); R.add('hips', 'body', [0, 1.0, 0.55]); R.add('chest', 'body', [0, 1.1, -0.35]);
    R.add('neck', 'chest', [0, 1.12, -0.7]); R.add('head', 'neck', [0, 1.06, -0.9]); R.add('jaw', 'head', [0, 0.97, -0.98]);
    R.add('earL', 'head', [-0.14, 1.25, -0.88]); R.add('earR', 'head', [0.14, 1.25, -0.88]); R.add('tail', 'hips', [0, 1.08, 0.85]);
    for (const s of [-1, 1]) {
      const n = s < 0 ? 'L' : 'R';
      R.add('fU' + n, 'chest', [s * 0.24, 0.95, -0.5]); R.add('fL' + n, 'fU' + n, [s * 0.25, 0.56, -0.4]); R.add('fP' + n, 'fL' + n, [s * 0.25, 0.17, -0.47]);
      R.add('rT' + n, 'hips', [s * 0.22, 0.95, 0.58]); R.add('rS' + n, 'rT' + n, [s * 0.24, 0.52, 0.44]); R.add('rP' + n, 'rS' + n, [s * 0.24, 0.15, 0.62]);
    }
  },
  sculpt(S, cfg) {
    const c = cfg.pal, fur = [0.42, 0, 0.14, 0], furS = [0.25, 0, 0.1, 0];
    S.ell('body', [0, 1.0, 0.05], [0.39, 0.41, 0.6], { k: 0.12, col: c.base, tag: 'body', dtl: fur });
    S.ell('chest', [0, 1.28, -0.3], [0.35, 0.3, 0.38], { k: 0.12, col: c.dark, tag: 'hump', dtl: fur });
    S.ell('chest', [0, 0.95, -0.42], [0.35, 0.4, 0.3], { k: 0.12, col: c.base, tag: 'body', dtl: fur });
    S.ell('hips', [0, 1.06, 0.5], [0.35, 0.35, 0.3], { k: 0.12, col: c.base, tag: 'body', dtl: fur });
    for (const s of [-1, 1]) {
      const n = s < 0 ? 'L' : 'R';
      S.ell('fU' + n, [s * 0.25, 0.86, -0.46], [0.15, 0.25, 0.18], { k: 0.1, col: c.base, dtl: fur });
      S.cone('fU' + n, [s * 0.24, 0.95, -0.5], [s * 0.25, 0.56, -0.4], 0.14, 0.11, { k: 0.08, col: c.base, b2: 'fL' + n, t0: 0.8, dtl: fur });
      S.cone('fL' + n, [s * 0.25, 0.56, -0.4], [s * 0.25, 0.17, -0.47], 0.11, 0.09, { k: 0.07, col: c.dark, tag: 'leg', b2: 'fP' + n, t0: 0.85, dtl: fur });
      S.ell('fP' + n, [s * 0.25, 0.08, -0.55], [0.12, 0.08, 0.15], { k: 0.06, col: c.dark, tag: 'paw', dtl: furS });
      S.ell('rT' + n, [s * 0.22, 0.85, 0.54], [0.16, 0.27, 0.22], { k: 0.1, col: c.base, rot: [0.3, 0, 0], dtl: fur });
      S.cone('rS' + n, [s * 0.24, 0.52, 0.44], [s * 0.24, 0.15, 0.62], 0.1, 0.085, { k: 0.07, col: c.dark, tag: 'leg', b2: 'rP' + n, t0: 0.85, dtl: fur });
      S.ell('rP' + n, [s * 0.24, 0.07, 0.52], [0.11, 0.075, 0.17], { k: 0.06, col: c.dark, tag: 'paw', dtl: furS });
      // shoulder/cheek fur clumps
      S.cone('head', [s * 0.16, 1.0, -0.86], [s * 0.26, 0.92, -0.74], 0.08, 0.015, { k: 0.05, col: c.base, tip: { col: c.tip, from: 0.6 }, tag: 'clump', dtl: fur });
    }
    for (let i = 0; i < 4; i++) S.cone('chest', [0, 1.5 - i * 0.03, -0.45 + i * 0.14], [0, 1.58 - i * 0.04, -0.3 + i * 0.14], 0.1, 0.02, { k: 0.07, col: c.dark, tip: { col: c.tip, from: 0.65 }, tag: 'hump', dtl: fur });
    // shaggy tufts: neck ruff ring, shoulder/elbow tufts, rump — short blended cones that break the silhouette
    const hs = (i) => { const q = Math.sin(i * 57.3 + 1.7) * 43758.5; return q - Math.floor(q); };
    const tuft = (bone, base, dir, L, r0, i) => {
      const dl = Math.hypot(...dir), tip = [base[0] + dir[0] / dl * L, base[1] + dir[1] / dl * L, base[2] + dir[2] / dl * L];
      S.cone(bone, base, tip, r0, 0.012, { k: 0.06, col: c.base, tip: { col: c.tip, from: 0.55 }, tag: 'tuft', dtl: fur });
    };
    let ti = 0;
    for (let i = 0; i < 11; i++) { // neck ruff
      const a = -2.2 + 4.4 * i / 10, sx = Math.sin(a), cy = Math.cos(a);
      tuft(Math.abs(a) < 1.4 ? 'neck' : 'chest', [sx * 0.27, 1.14 + cy * 0.27, -0.72], [sx * 0.6, cy * 0.4 - 0.2, 0.8], 0.16 + 0.08 * hs(ti), 0.075, ti++);
    }
    for (const s of [-1, 1]) {
      const n = s < 0 ? 'L' : 'R';
      tuft('fU' + n, [s * 0.34, 0.95, -0.4], [s * 0.4, -0.3, 0.8], 0.16, 0.07, ti++);
      tuft('fL' + n, [s * 0.27, 0.6, -0.33], [s * 0.3, -0.4, 0.9], 0.14, 0.06, ti++);
      tuft('fL' + n, [s * 0.27, 0.45, -0.36], [s * 0.3, -0.6, 0.7], 0.12, 0.055, ti++);
      tuft('rT' + n, [s * 0.34, 0.95, 0.62], [s * 0.4, -0.2, 0.8], 0.15, 0.07, ti++);
      tuft('hips', [s * 0.18, 1.3, 0.55], [s * 0.3, 0.3, 0.9], 0.14, 0.07, ti++);
      tuft('chest', [s * 0.2, 1.46, -0.2], [s * 0.4, 0.4, 0.8], 0.14, 0.07, ti++);
    }
    for (let i = 0; i < 5; i++) tuft('chest', [(i - 2) * 0.1, 0.7, -0.62], [(i - 2) * 0.1, -1, 0.3], 0.14 + 0.05 * hs(ti), 0.065, ti++); // chest shag
    // neck + head
    S.cone('neck', [0, 1.12, -0.55], [0, 1.08, -0.85], 0.3, 0.22, { k: 0.1, col: c.base, b2: 'head', t0: 0.6, dtl: fur });
    S.ell('head', [0, 1.1, -0.96], [0.23, 0.2, 0.21], { k: 0.08, col: c.base, tag: 'head', dtl: furS });
    for (const s of [-1, 1]) S.ell('head', [s * 0.14, 1.02, -0.95], [0.11, 0.12, 0.13], { k: 0.07, col: c.base, tag: 'head', dtl: fur });
    S.ell('head', [0, 1.2, -1.02], [0.17, 0.08, 0.1], { k: 0.06, col: c.base, tag: 'brow', dtl: furS });
    S.cone('head', [0, 1.06, -1.05], [0, 1.035, -1.19], 0.13, 0.09, { k: 0.06, col: c.muzzle, tag: 'muzzle', dtl: furS });
    S.ell('head', [0, 1.075, -1.235], [0.068, 0.05, 0.042], { k: 0.025, col: c.nose, tag: 'nose', soft: 0.006 });
    S.cone('head', [0, 0.975, -1.04], [0, 0.985, -1.2], 0.025, 0.018, { k: 0.015, sub: true, col: 0x2a1010, tag: 'mouth' });
    S.cone('jaw', [0, 0.97, -0.98], [0, 0.955, -1.17], 0.09, 0.056, { group: 1, k: 0.04, col: c.muzzle, tag: 'jaw', dtl: furS });
    S.cone('tail', [0, 1.08, 0.8], [0, 1.02, 0.9], 0.07, 0.04, { k: 0.05, col: c.base, tag: 'tail', dtl: fur });
  },
  paint(v, cfg) {
    const c = cfg.pal, [x, y, z] = v.p, [nx, ny] = v.n;
    const jag = Math.sin(z * 22 + x * 9) * 0.5 + Math.sin(z * 41 + y * 17) * 0.3;
    v.mix(c.belly, sstep(-0.1, -0.6, ny + jag * 0.1) * (1 - v.t('muzzle')) * 0.6);
    v.mix(c.dark, sstep(0.4, 0.9, ny + jag * 0.1) * sstep(1.2, 1.4, y) * 0.5);
    v.mix(c.muzzle, v.t('muzzle') * 0.9);
    v.mix(0x4a1a18, v.t('mouth') * 0.9); if (v.group === 1 && ny > 0.4) v.mix(0x6a2a28, 0.7);
    v.mix(c.nose, v.t('nose'));
    v.mul(1 + Math.sin(x * 7 + z * 5) * Math.sin(y * 6) * 0.05);
    v.fx = v.t('hump') * sstep(1.4, 1.55, y);
  },
  parts(acc, S, R, cfg) {
    const c = cfg.pal, b = (n) => R.index(n);
    for (const s of [-1, 1]) {
      const n = s < 0 ? 'L' : 'R';
      addEye(acc, S, b('head'), [s * 0.1, 1.16, -1.1], [s * 0.6, 0.15, -1], 0.026, { iris: cfg.elite ? 0xff8030 : 0x2a1a10, pupilA: 0.4, irisA: 0.9, glow: cfg.elite ? 2.5 : 0 });
      const g = leafGeo(0.085, 0.11, 0.04, 0.55, 0.1, { nu: 5, nv: 4, pw: 0.4, tipW: 0.035 });
      const m = new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(0.2, s * 0.4, -s * 0.4, 'YXZ')); m.setPosition(s * 0.14, 1.23, -0.88);
      const co = col(c.base), ci = col(c.dark);
      acc.add(g, { matrix: m, skin: rigid(b('ear' + n)), dtl: [0.3, 0, 0.1, 0], color: (p, nn, uv) => uv[0] >= 1 ? co : ci });
      // claws
      for (const [bn, pz, py] of [['fP', -0.66, 0.06], ['rP', 0.36, 0.05]]) for (let i = -2; i <= 1; i++) {
        const x = s * 0.25 + i * 0.045 + 0.02;
        addHorn(acc, b(bn + n), [x, py + 0.02, pz + 0.05], [x, py + 0.01, pz - 0.02], [x, py - 0.04, pz - 0.05], 0.018, 0.003, { base: 0x3a3028, tip: c.claw, radial: 5, n: 4 });
      }
    }
    // teeth
    for (const s of [-1, 1]) {
      addHorn(acc, b('head'), [s * 0.05, 1.0, -1.15], [s * 0.05, 0.97, -1.155], [s * 0.048, 0.94, -1.15], 0.016, 0.003, { base: 0xc8b898, tip: 0xf4ecd8, radial: 5, n: 3 });
      addHorn(acc, b('jaw'), [s * 0.045, 0.96, -1.11], [s * 0.046, 0.99, -1.115], [s * 0.044, 1.01, -1.11], 0.013, 0.003, { base: 0xc8b898, tip: 0xf4ecd8, radial: 5, n: 3 });
    }
    if (cfg.elite) { // golden claw caps & brow circlet
      const ring = new THREE.TorusGeometry(0.2, 0.018, 5, 22);
      acc.add(ring, { matrix: new THREE.Matrix4().makeRotationX(Math.PI / 2 - 0.35).setPosition(0, 1.2, -0.95), skin: rigid(b('head')), color: c.gold, dtl: [0, 0, 0.1, 0] });
    }
  },
  sockets: { mouth: ['jaw', [0, 0.97, -1.18]], head: ['head', [0, 1.35, -0.95]], chest: ['chest', [0, 0.9, -0.6]], back: ['body', [0, 1.45, 0]], pawR: ['fPR', [0.25, 0.08, -0.6]] },
  height: 1.6, radius: 0.75,
  controller(inst) { return new QuadCtl(inst, BEAR_SPEC); },
  actions: ['attack', 'roar', 'hit', 'death', 'sit', 'sniff'],
};

const V3 = THREE.Vector3;
const BEAR_SPEC = {
  bones: { body: 'body', hips: 'hips', chest: 'chest', neck: 'neck', head: 'head', jaw: 'jaw', tail: ['tail'], ears: ['earL', 'earR'] },
  gait: {
    legs: [
      { id: 'FL', chain: ['fUL', 'fLL', 'fPL'], toe: [-0.25, 0, -0.66], body: 'chest', scap: 0.35, lift: 0.16, flex: 0.9, heel: 0.5, out: 0.1 },
      { id: 'FR', chain: ['fUR', 'fLR', 'fPR'], toe: [0.25, 0, -0.66], body: 'chest', scap: 0.35, lift: 0.16, flex: 0.9, heel: 0.5, out: 0.1 },
      { id: 'RL', chain: ['rTL', 'rSL', 'rPL'], toe: [-0.24, 0, 0.38], body: 'hips', scap: 0.3, lift: 0.14, flex: 0.6, heel: 0.6, out: 0.15 },
      { id: 'RR', chain: ['rTR', 'rSR', 'rPR'], toe: [0.24, 0, 0.38], body: 'hips', scap: 0.3, lift: 0.14, flex: 0.6, heel: 0.6, out: 0.15 },
    ],
    maxStride: 1.0,
    gaits: [
      { v: 1.3, f: 1.1, duty: 0.66, lift: 0.8, off: { RL: 0, FL: 0.2, RR: 0.5, FR: 0.7 }, bob: 0.02, bobF: 2, roll: 0.05, rollF: 1, sway: 0.02, swayF: 1, nod: 0.06, nodF: 2, nodPh: 0.3 },
      { v: 3.2, f: 1.7, duty: 0.46, lift: 1, off: { FL: 0, RR: 0, FR: 0.5, RL: 0.5 }, bob: 0.035, bobF: 2, roll: 0.03, rollF: 1, nod: 0.04, nodF: 2 },
      { v: 8, f: 2.5, duty: 0.26, lift: 1.2, off: { RL: 0, RR: 0.1, FL: 0.45, FR: 0.55 }, bob: 0.09, bobF: 1, bobPh: 0.62, pitch: 0.1, pitchF: 1, pitchPh: 0.05, flex: 0.12, flexF: 1, flexPh: 0.2, nod: 0.06, nodF: 1 },
    ],
  },
  neck: { pitch: 0, run: -0.2, combat: -0.2, walk: -0.1, comp: 0.4, stab: 0.7 }, tail: { wag: 0.1, wagF: 1 }, breathe: 0.015,
  fidgets: [{ name: 'sniff', w: 3 }],
  pose(ctl) { ctl.jaw += 0.06 * ctl.run + 0.1 * ctl.combat; },
  actions: {
    attack: { dur: 0.9, a: 0.1, d: 0.8, fn(ctl, a, w) { // rise & swipe with the right paw
      const P = ctl.pose, b = ctl.b, k = a.k;
      const rise = sstep(0, 0.35, k) * (1 - sstep(0.55, 0.9, k)), sw = sstep(0.35, 0.55, k);
      P.move(b.body, 0, 0.1 * rise * w, 0.05 * rise * w); P.rot(b.body, 0.2 * rise * w, (0.15 * rise - 0.35 * sw * rise) * w, 0);
      P.rot(b.head, -0.1 * rise * w, -0.3 * sw * rise * w, 0);
      ctl.jaw = Math.max(ctl.jaw, 0.5 * rise * w);
      const L = ctl.gait.legs[1];
      L.override = L.override || new V3();
      L.override.set(0.25 + 0.15 * rise - 0.4 * sw, 0.5 * rise + 0.1, -0.75 - 0.2 * sw); L.overrideLocal = true; L.overrideW = Math.max(L.overrideW, rise * w); L.overridePaw = -0.6;
    } },
    roar: { dur: 2.6, a: 0.15, d: 0.85, fn(ctl, a, w) { // rear up on hind legs, head high, jaw wide
      const P = ctl.pose, b = ctl.b, t = a.t;
      const up = sstep(0, 0.7, t) * (1 - sstep(2.1, 2.6, t));
      P.move(b.body, 0, 0.35 * up * w, 0.3 * up * w); P.rx(b.body, 0.75 * up * w); P.rx(b.hips, -0.5 * up * w);
      P.rx(b.neck, -0.3 * up * w); P.rot(b.head, 0.1 * up * w, Math.sin(t * 9) * 0.1 * up * w, 0);
      ctl.jaw = Math.max(ctl.jaw, (0.6 + 0.05 * Math.sin(t * 20)) * up * sstep(0.5, 0.8, t) * w);
      ctl.ear = mix(ctl.ear, 1, up * w); ctl.hackle = Math.max(ctl.hackle, up * w);
      for (const L of ctl.gait.legs) if (L.id[0] === 'F') { L.override = L.override || new V3(); L.override.set(L.toe.x * 1.1, 0.2, L.toe.z + 0.1); L.overrideLocal = true; L.overrideW = Math.max(L.overrideW, up * w); L.overridePaw = -0.5; }
    } },
    sit: { dur: 1, hold: true, rest: true, fadeIn: 0.8, fadeOut: 0.5, fn(ctl, a, w) {
      const P = ctl.pose, b = ctl.b;
      P.move(b.body, 0, -0.35 * w, 0.2 * w); P.rx(b.body, 0.7 * w); P.rx(b.hips, 0.2 * w); P.rx(b.neck, -0.4 * w); P.rx(b.head, -0.3 * w);
      for (const L of ctl.gait.legs) { L.override = L.override || new V3(); if (L.id[0] === 'R') L.override.set(L.toe.x * 1.2, 0, 0.05); else L.override.set(L.toe.x, 0, -0.55); L.overrideW = Math.max(L.overrideW, w); }
    } },
    sniff: { dur: 2.2, a: 0.2, d: 0.8, fn(ctl, a, w) { const P = ctl.pose, b = ctl.b, t = a.t; P.rx(b.neck, -0.35 * w); P.rot(b.head, (-0.2 + Math.sin(t * 16) * 0.03) * w, Math.sin(t * 1.3) * 0.3 * w, 0); } },
    hit: { dur: 0.45, a: 0.1, d: 0.5, fn(ctl, a, w) { const P = ctl.pose, b = ctl.b, j = Math.sin(a.k * Math.PI) * w; P.move(b.body, 0, 0.03 * j, 0.06 * j); P.rot(b.neck, 0.2 * j, 0.2 * j, 0); ctl.jaw = Math.max(ctl.jaw, 0.4 * j); } },
    death: deathAction({ lieY: 0.72, roll: 1.35 }),
  },
};
