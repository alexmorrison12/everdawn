// Kobold: small hunched rat-dog miner (original design): big round ears, long snout, buck teeth, whiskers,
// ragged vest, rope belt, digitigrade legs, rat tail, pickaxe, and a lit candle on a leather cap (sockets.candle).
// Elite: "Chief Waxbeard" — bigger, dripping wax beard, three-candle crown, gold trim, golden pick.
import * as THREE from 'three';
import { BipedCtl, armRot, bipedDeath } from './biped.js';
import { sweep, rigid, bez, leafGeo, blend2 } from './geo.js';
import { col, smax, smin } from './sdf.js';
import { addEye, lerp3 } from './parts.js';
import { sstep, clamp01, mix } from './rig.js';

const PAL = {
  brown: { fur: 0x8a6446, dark: 0x4e3424, belly: 0xc8a482, skin: 0xe0a092, vest: 0x4a5a6e, vest2: 0x8a7650, pants: 0x4a3a2c, cap: 0x3e2616, eye: 0x100808 },
  grey: { fur: 0x7c7672, dark: 0x45403e, belly: 0xbdb4ac, skin: 0xd89890, vest: 0x7a3a2a, vest2: 0x9a7a52, pants: 0x3e3a36, cap: 0x3a2416, eye: 0x100808 },
  tan: { fur: 0xb4895a, dark: 0x6e4e30, belly: 0xe4c8a0, skin: 0xeaa89a, vest: 0x46583a, vest2: 0x8a7a50, pants: 0x4e4030, cap: 0x40281a, eye: 0x100808 },
  waxbeard: { fur: 0x6e5646, dark: 0x3a2a20, belly: 0xb09a84, skin: 0xd09488, vest: 0x6a2a24, vest2: 0xe0b040, pants: 0x3a2a24, cap: 0x4a2e1c, eye: 0xff9a30, gold: 0xf0c040, wax: 0xeadcb4 },
};

export const kobold = {
  variants: ['brown', 'grey', 'tan', 'waxbeard'],
  config(variant, opts) {
    const v = PAL[variant] ? variant : (opts.elite ? 'waxbeard' : 'brown');
    return { variant: v, pal: PAL[v], elite: v === 'waxbeard' || !!opts.elite, shapeKey: 'base', scale: v === 'waxbeard' ? 1.4 : 1, h: 0.022, hg: { 2: 0.014, 3: 0.016 }, mat: { dfreq: 3.4, furAxis: 1 } };
  },
  rig(R) {
    R.add('hips', null, [0, 0.46, 0.04]);
    R.add('spine', 'hips', [0, 0.58, 0.0]);
    R.add('chest', 'spine', [0, 0.7, -0.05]);
    R.add('neck', 'chest', [0, 0.8, -0.1]);
    R.add('head', 'neck', [0, 0.86, -0.14]);
    R.add('jaw', 'head', [0, 0.83, -0.19]);
    R.add('earL', 'head', [-0.075, 0.95, -0.11]); R.add('earR', 'head', [0.075, 0.95, -0.11]);
    R.add('tail1', 'hips', [0, 0.44, 0.15]); R.add('tail2', 'tail1', [0, 0.36, 0.3]); R.add('tail3', 'tail2', [0, 0.26, 0.44]);
    for (const s of [-1, 1]) {
      const n = s < 0 ? 'L' : 'R';
      R.add('armU' + n, 'chest', [s * 0.15, 0.75, -0.06]); R.add('armL' + n, 'armU' + n, [s * 0.2, 0.55, -0.03]); R.add('hand' + n, 'armL' + n, [s * 0.22, 0.39, -0.1]);
      R.add('thigh' + n, 'hips', [s * 0.09, 0.44, 0.04]); R.add('shin' + n, 'thigh' + n, [s * 0.11, 0.28, -0.07]); R.add('meta' + n, 'shin' + n, [s * 0.11, 0.13, 0.05]); R.add('foot' + n, 'meta' + n, [s * 0.11, 0.045, 0.0]);
    }
  },
  sculpt(S, cfg) {
    const c = cfg.pal;
    const fur = [0.3, 0, 0.12, 0], furS = [0.18, 0, 0.12, 0], cloth = [0, 0, 0.25, 0.55], skin = [0, 0.05, 0.15, 0];
    // hunched torso + pot belly
    const torso = [
      S.ell('spine', [0, 0.6, -0.02], [0.13, 0.15, 0.12], { k: 0.06, col: c.fur, tag: 'body', dtl: fur }),
      S.ell('chest', [0, 0.71, -0.07], [0.145, 0.11, 0.12], { k: 0.06, col: c.fur, tag: 'body', dtl: fur }),
      S.ell('spine', [0, 0.53, -0.05], [0.125, 0.11, 0.11], { k: 0.06, col: c.belly, tag: 'belly', dtl: fur }),
      S.ell('hips', [0, 0.46, 0.03], [0.13, 0.09, 0.11], { k: 0.05, col: c.fur, tag: 'body', dtl: fur }),
    ];
    const torsoD = (x, y, z) => { let d = 1e9; for (const p of torso) d = smin(d, p.dist(x, y, z), p.k); return d; };
    // ragged vest: offset shell of the torso, zig-zag hem, open V front
    S.ell('chest', [0, 0.66, -0.04], [0.19, 0.22, 0.18], {
      k: 0.008, col: c.vest, tag: 'vest', dtl: cloth, cw: 8, soft: 0.005,
      mod: (x, y, z) => {
        const a = Math.atan2(x, -z);
        const hem = 0.52 + 0.024 * Math.abs(((a * 3.2) % 1 + 1) % 1 - 0.5) * 2 + 0.01 * Math.sin(a * 7);
        const openF = z < -0.04 ? (0.02 + (0.8 - y) * 0.25) - Math.abs(x) : -1;
        return smax(smax(smax(torsoD(x, y, z) - 0.017, hem - y, 0.008), openF, 0.008), y - 0.8, 0.01);
      },
    });
    // short pants with a ragged hem
    S.ell('hips', [0, 0.45, 0.02], [0.17, 0.12, 0.15], {
      k: 0.008, col: c.pants, tag: 'pants', dtl: cloth, cw: 8, soft: 0.005,
      mod: (x, y, z) => { const a = Math.atan2(x, -z); return smax(smax(torsoD(x, y, z) - 0.014, (0.395 + 0.014 * Math.sin(a * 11) + 0.008 * Math.sin(a * 5)) - y, 0.008), y - 0.52, 0.01); },
    });
    // neck + head
    S.cone('neck', [0, 0.76, -0.08], [0, 0.86, -0.14], 0.075, 0.07, { k: 0.05, col: c.fur, b2: 'head', t0: 0.5, t1: 1, dtl: fur });
    S.ell('head', [0, 0.9, -0.14], [0.1, 0.09, 0.1], { k: 0.04, col: c.fur, tag: 'head', dtl: furS });
    for (const s of [-1, 1]) S.ell('head', [s * 0.06, 0.86, -0.16], [0.055, 0.05, 0.06], { k: 0.04, col: c.belly, tag: 'cheek', dtl: fur });
    S.cone('head', [0, 0.875, -0.22], [0, 0.848, -0.355], 0.062, 0.03, { k: 0.035, col: c.fur, tag: 'snout', dtl: furS });
    S.sph('head', [0, 0.852, -0.37], 0.024, { k: 0.012, col: c.skin, tag: 'nose', dtl: skin, soft: 0.004 });
    S.cone('head', [0, 0.829, -0.22], [0, 0.834, -0.35], 0.012, 0.008, { k: 0.008, sub: true, col: 0x2a1212, tag: 'mouth' });
    // leather cap (candle holder sits on top)
    S.ell('head', [0, 0.96, -0.135], [0.098, 0.048, 0.1], {
      k: 0.01, col: c.cap, tag: 'cap', dtl: [0, 0, 0.3, 0.2],
      mod: (x, y, z, d) => smax(d, 0.935 - y, 0.008),
    });
    // lower jaw
    S.cone('jaw', [0, 0.83, -0.2], [0, 0.827, -0.33], 0.04, 0.022, { group: 1, k: 0.02, col: c.belly, tag: 'jaw', dtl: furS });
    // arms, hands (fine group), legs, feet (fine group)
    for (const s of [-1, 1]) {
      const n = s < 0 ? 'L' : 'R';
      S.sph('armU' + n, [s * 0.14, 0.74, -0.06], 0.05, { k: 0.04, col: c.fur, dtl: fur });
      S.cone('armU' + n, [s * 0.15, 0.75, -0.06], [s * 0.2, 0.55, -0.03], 0.04, 0.032, { k: 0.03, col: c.fur, b2: 'armL' + n, t0: 0.8, t1: 1, dtl: fur });
      S.cone('armL' + n, [s * 0.2, 0.55, -0.03], [s * 0.22, 0.4, -0.1], 0.032, 0.026, { k: 0.025, col: c.fur, tag: 'arm', b2: 'hand' + n, t0: 0.85, t1: 1, dtl: fur });
      const hx = s * 0.225, hy = 0.375, hz = -0.115;
      S.ell('hand' + n, [hx, hy, hz], [0.03, 0.038, 0.028], { group: 2, k: 0.015, col: c.skin, tag: 'hand', dtl: skin });
      for (let f = -1; f <= 1; f++) S.cone('hand' + n, [hx + f * 0.017, hy - 0.025, hz - 0.01], [hx + f * 0.022, hy - 0.075, hz - 0.035], 0.012, 0.008, { group: 2, k: 0.012, col: c.skin, tag: 'finger', dtl: skin });
      S.cone('hand' + n, [hx - s * 0.02, hy, hz - 0.015], [hx - s * 0.035, hy - 0.035, hz - 0.045], 0.011, 0.008, { group: 2, k: 0.01, col: c.skin, tag: 'finger', dtl: skin });
      S.cone('thigh' + n, [s * 0.09, 0.44, 0.04], [s * 0.11, 0.28, -0.07], 0.058, 0.042, { k: 0.04, col: c.fur, b2: 'shin' + n, t0: 0.8, t1: 1, dtl: fur });
      S.cone('shin' + n, [s * 0.11, 0.28, -0.07], [s * 0.11, 0.13, 0.05], 0.036, 0.026, { k: 0.03, col: c.fur, tag: 'leg', b2: 'meta' + n, t0: 0.85, t1: 1, dtl: fur });
      S.cone('meta' + n, [s * 0.11, 0.13, 0.05], [s * 0.11, 0.05, 0.0], 0.025, 0.022, { k: 0.02, col: c.skin, tag: 'leg', b2: 'foot' + n, t0: 0.8, t1: 1, dtl: skin });
      S.ell('foot' + n, [s * 0.11, 0.03, -0.03], [0.035, 0.025, 0.055], { group: 3, k: 0.015, col: c.skin, tag: 'foot', dtl: skin });
      for (let f = -1; f <= 1; f++) S.cone('foot' + n, [s * 0.11 + f * 0.018, 0.02, -0.05], [s * 0.11 + f * 0.028, 0.012, -0.11], 0.013, 0.009, { group: 3, k: 0.012, col: c.skin, tag: 'toe', dtl: skin });
    }
    // rat tail
    S.cone('tail1', [0, 0.44, 0.12], [0, 0.36, 0.3], 0.03, 0.022, { k: 0.02, col: c.skin, tag: 'tail', b2: 'tail2', t0: 0.6, t1: 1, dtl: skin });
    S.cone('tail2', [0, 0.36, 0.3], [0, 0.26, 0.44], 0.022, 0.015, { k: 0.015, col: c.skin, tag: 'tail', b2: 'tail3', t0: 0.6, t1: 1, dtl: skin });
    S.cone('tail3', [0, 0.26, 0.44], [0, 0.12, 0.54], 0.015, 0.006, { k: 0.01, col: c.skin, tag: 'tail', dtl: skin });
  },
  paint(v, cfg) {
    const c = cfg.pal, [x, y, z] = v.p, [nx, ny, nz] = v.n;
    const vest = v.t('vest');
    if (vest > 0.3) {
      // patch + stitches + darker hem
      const pd = Math.max(Math.abs(y - 0.64) - 0.035, Math.abs(z - 0.02) - 0.04);
      v.mix(c.vest2, (x > 0.05 && pd < 0 ? 1 : 0) * 0.85);
      v.mix(0x2a1e14, (x > 0.05 && Math.abs(pd) < 0.004 ? 1 : 0) * 0.8);
      v.mix(0x2a1e14, sstep(0.56, 0.52, y) * 0.35);
      if (cfg.elite) v.mix(c.gold, (Math.abs(Math.abs(x) - 0.04) < 0.012 && z < 0 ? 1 : 0) * 0.9 + sstep(0.545, 0.53, y) * 0.9);
    }
    // pale belly/muzzle, dark back stripe
    v.mix(c.belly, sstep(-0.2, -0.7, nz) * (v.t('body') + v.t('head')) * sstep(0.7, 0.9, y) * 0.4);
    v.mix(c.dark, sstep(0.4, 0.8, nz) * v.t('body') * 0.4);
    v.mix(c.skin, v.t('nose'));
    v.mix(0x3a1414, v.t('mouth') * 0.9);
    if (v.group === 1 && ny > 0.4) v.mix(0x7a3030, 0.6);
    v.mix(c.dark, v.t('snout') * sstep(0.3, 0.8, ny) * 0.35);
    v.mul(1 + Math.sin(x * 15 + z * 11) * Math.sin(y * 13) * 0.05);
  },
  parts(acc, S, R, cfg) {
    const c = cfg.pal, b = (n) => R.index(n), E = cfg.elite;
    for (const s of [-1, 1]) {
      addEye(acc, S, b('head'), [s * 0.052, 0.915, -0.215], [s * 0.6, 0.15, -1], 0.017, { iris: c.eye, pupil: 0x050303, irisA: E ? 0.95 : 0, pupilA: 0.8, glow: E ? 2.5 : 0 });
      // huge round ears, pink inside
      const g = leafGeo(0.075, 0.12, 0.022, 0.7, 0.05, { nu: 7, nv: 6, pw: 0.45, tipW: 0.02 });
      const m = new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(0.1, s * 0.55, -s * 0.75, 'YXZ')); m.setPosition(s * 0.07, 0.94, -0.105);
      const outer = col(c.fur), inner = col(c.skin), rim = col(c.dark);
      acc.add(g, { matrix: m, skin: rigid(b(s < 0 ? 'earL' : 'earR')), dtl: [0.15, 0, 0.12, 0], color: (p, n, uv) => uv[0] >= 1 ? outer : lerp3(inner, rim, sstep(0.75, 0.95, (uv[0] % 1) * 2)) });
      // whiskers
      for (let i = 0; i < 3; i++) {
        const p0 = [s * 0.03, 0.855 - i * 0.008, -0.33 + i * 0.01];
        acc.add(sweep([p0, [s * (0.14 + i * 0.01), 0.87 - i * 0.03, -0.3 + i * 0.02]], [0.003, 0.001], { radial: 3 }), { skin: rigid(b('head')), color: 0x2a2420, dtl: [0, 0, 0, 0] });
      }
      // claws
      for (let f = -1; f <= 1; f++) acc.add(sweep([[s * 0.11 + f * 0.028, 0.012, -0.105], [s * 0.11 + f * 0.03, 0.006, -0.13]], [0.006, 0.001], { radial: 4 }), { skin: rigid(b('foot' + (s < 0 ? 'L' : 'R'))), color: 0x201a18, dtl: [0, 0, 0, 0] });
    }
    // buck teeth
    for (const s of [-1, 1]) {
      const bx = new THREE.BoxGeometry(0.014, 0.024, 0.008);
      acc.add(bx, { matrix: new THREE.Matrix4().makeTranslation(s * 0.0085, 0.818, -0.345), skin: rigid(b('head')), color: 0xf6eecc, dtl: [0, 0, 0, 0] });
    }
    // rope belt
    const belt = new THREE.TorusGeometry(0.135, 0.011, 5, 18);
    acc.add(belt, { matrix: new THREE.Matrix4().makeRotationX(Math.PI / 2).setPosition(0, 0.49, 0.0), skin: rigid(b('hips')), color: E ? c.gold : 0xb49a64, dtl: [0, 0, 0.1, 0.6] });
    // candle(s): wax stick with drips + emissive flame (fx<0 → flicker)
    const wax = col(E ? c.wax : 0xf2e8c8), waxD = col(0xd8c8a0);
    const candle = (x, z, h, r, tilt = 0) => {
      const base = new THREE.Vector3(x, 0.975, z), top = base.clone().add(new THREE.Vector3(Math.sin(tilt) * h, h, 0));
      acc.add(sweep([base, top], [r, r * 0.95], { radial: 8, capEnd: true }), { skin: rigid(b('head')), color: (p, n, uv) => lerp3(waxD, wax, uv[1]), dtl: [0, 0, 0.15, 0] });
      for (let i = 0; i < 3; i++) { // drips
        const a = i * 2.1 + x * 10, dp = top.clone().add(new THREE.Vector3(Math.cos(a) * r, -0.005, Math.sin(a) * r));
        acc.add(sweep([dp, dp.clone().add(new THREE.Vector3(0, -0.025 - i * 0.012, 0))], [r * 0.35, r * 0.3], { radial: 5 }), { skin: rigid(b('head')), color: wax, dtl: [0, 0, 0.1, 0] });
      }
      acc.add(sweep([top, top.clone().add(new THREE.Vector3(0, 0.014, 0))], [0.003, 0.002], { radial: 3 }), { skin: rigid(b('head')), color: 0x1a1210, dtl: [0, 0, 0, 0] });
      // flame: teardrop, white-yellow core → orange tip
      const f0 = top.clone().add(new THREE.Vector3(0, 0.008, 0));
      const pts = [0, 0.25, 0.5, 0.75, 1].map(t => f0.clone().add(new THREE.Vector3(0, t * 0.065, 0)));
      const g = sweep(pts, [0.004, 0.016, 0.015, 0.009, 0.001], { radial: 7 });
      const fc0 = col(0xfff4c0), fc1 = col(0xff8a20);
      acc.add(g, { skin: rigid(b('head')), dtl: [0, 0, 0, 0], color: (p, n, uv) => lerp3(fc0, fc1, sstep(0.3, 1, uv[1])), emis: (p, uv) => 3.2 - uv[1] * 1.2, fx: (p, uv) => -(0.1 + uv[1]) });
      return top;
    };
    candle(0, -0.135, E ? 0.12 : 0.09, E ? 0.028 : 0.022);
    if (E) {
      candle(-0.07, -0.12, 0.07, 0.018, -0.25); candle(0.07, -0.12, 0.07, 0.018, 0.25);
      // gold crown band on the cap
      const crown = new THREE.TorusGeometry(0.1, 0.012, 5, 20);
      acc.add(crown, { matrix: new THREE.Matrix4().makeRotationX(Math.PI / 2).setPosition(0, 0.95, -0.135), skin: rigid(b('head')), color: c.gold, dtl: [0, 0, 0.1, 0] });
      // dripping wax beard: a band of wax under the jaw with irregular drips
      const wb = blend2(b('jaw'), b('head'), 0.4);
      const hsh = (i) => { const q = Math.sin(i * 12.9898 + 4.1) * 43758.5; return q - Math.floor(q); };
      const band = []; for (let i = 0; i <= 10; i++) { const a = -1.25 + i * 0.25; band.push(new THREE.Vector3(Math.sin(a) * 0.08, 0.828 - Math.cos(a) * 0.012, -0.205 - Math.cos(a) * 0.065)); }
      acc.add(sweep(band, band.map((_, i) => 0.02 + 0.006 * Math.sin(i * 1.7)), { radial: 6 }), { skin: wb, color: wax, dtl: [0, 0, 0.15, 0] });
      for (let i = 0; i < 11; i++) {
        const a = -1.2 + i * 0.24, p0 = [Math.sin(a) * 0.08, 0.825, -0.205 - Math.cos(a) * 0.065];
        const L = 0.04 + 0.09 * hsh(i) * Math.cos(a * 0.9) + 0.02;
        const r0 = 0.012 + 0.006 * hsh(i + 20);
        acc.add(sweep([p0, [p0[0] * 0.95, p0[1] - L * 0.55, p0[2] - 0.006], [p0[0] * 0.92, p0[1] - L, p0[2] + 0.004]], [r0, r0 * 0.8, r0 * 0.75], { radial: 6 }), { skin: wb, color: (p, n, uv) => lerp3(wax, waxD, uv[1] * 0.5), dtl: [0, 0, 0.15, 0] });
        acc.add(new THREE.SphereGeometry(r0 * 1.05, 6, 4), { matrix: new THREE.Matrix4().makeTranslation(p0[0] * 0.92, p0[1] - L, p0[2] + 0.004), skin: wb, color: waxD, dtl: [0, 0, 0.1, 0] });
      }
    }
    // pickaxe in the right hand: handle + double-pointed iron head
    const hand = b('handR'), H = new THREE.Vector3(0.225, 0.37, -0.13);
    const dir = new THREE.Vector3(0.05, 0.25, -1).normalize();
    const a = H.clone().addScaledVector(dir, -0.12), e = H.clone().addScaledVector(dir, 0.46);
    const wood = col(0x8a6038), woodD = col(0x5a3a20);
    acc.add(sweep([a, H, e], [0.014, 0.015, 0.016], { radial: 6, capStart: true }), { skin: rigid(hand), dtl: [0, 0, 0.1, 0.6], color: (p, n, uv) => lerp3(woodD, wood, uv[1]) });
    const up = new THREE.Vector3(0, 1, 0).addScaledVector(dir, -dir.y).normalize();
    const hc = e.clone().addScaledVector(dir, -0.02);
    const pick = sweep(bez(hc.clone().addScaledVector(up, -0.17).addScaledVector(dir, -0.05).toArray(), hc.clone().addScaledVector(dir, 0.035).toArray(), hc.clone().addScaledVector(up, 0.17).addScaledVector(dir, -0.05).toArray(), 7), [0.004, 0.017, 0.024, 0.026, 0.024, 0.017, 0.004], { radial: 6, flat: 0.7 });
    const iron = col(E ? c.gold : 0x6c6e74), ironD = col(E ? 0xa07020 : 0x34363c);
    acc.add(pick, { skin: rigid(hand), dtl: [0, 0, 0.25, 0], color: (p, n, uv) => lerp3(iron, ironD, Math.abs(uv[1] - 0.5) * 1.6) });
  },
  sockets: {
    candle: ['head', [0, 1.08, -0.135]], mouth: ['jaw', [0, 0.82, -0.34]], head: ['head', [0, 1.12, -0.13]], chest: ['chest', [0, 0.7, -0.18]],
    handR: ['handR', [0.225, 0.37, -0.13]], handL: ['handL', [-0.225, 0.37, -0.13]], back: ['chest', [0, 0.72, 0.1]],
  },
  height: 1.12, radius: 0.32,
  controller(inst) { return new BipedCtl(inst, KOBOLD_SPEC); },
  actions: ['attack', 'hit', 'death', 'cower', 'flee', 'sniff', 'scratch'],
};

const KOBOLD_SPEC = {
  bones: { hips: 'hips', spine: 'spine', chest: 'chest', neck: 'neck', head: 'head', jaw: 'jaw', tail: ['tail1', 'tail2', 'tail3'], ears: ['earL', 'earR'], armL: ['armUL', 'armLL', 'handL'], armR: ['armUR', 'armLR', 'handR'] },
  gait: {
    legs: [
      { id: 'L', chain: ['thighL', 'shinL', 'metaL', 'footL'], toe: [-0.12, 0, -0.1], body: 'hips', scap: 0.25, lift: 0.08, flex: 0.8, heel: 0.3, out: 0.12, metaK: 1.2, metaBase: 0 },
      { id: 'R', chain: ['thighR', 'shinR', 'metaR', 'footR'], toe: [0.12, 0, -0.1], body: 'hips', scap: 0.25, lift: 0.08, flex: 0.8, heel: 0.3, out: 0.12, metaK: 1.2, metaBase: 0 },
    ],
    maxStride: 0.38, fMin: 0.65,
    gaits: [
      { v: 1.2, f: 2.5, duty: 0.6, lift: 0.8, off: { L: 0, R: 0.5 }, bob: 0.015, bobF: 2, bobPh: 0.1, roll: 0.05, rollF: 1, rollPh: 0.25, sway: 0.015, swayF: 1, swayPh: 0.25, nod: 0.04, nodF: 2 },
      { v: 4.8, f: 4.3, duty: 0.38, lift: 1.2, off: { L: 0, R: 0.5 }, bob: 0.03, bobF: 2, bobPh: 0.3, roll: 0.04, rollF: 1, rollPh: 0.25, nod: 0.05, nodF: 2 },
    ],
  },
  arm: { weaponSwing: 0.35, swing: 0.5, out: 0.12, elbow: 0.5, runSwing: 1.0, runOut: 0.15, runElbow: 1.3, combatUp: 0.3, combatElbow: 0.7 },
  lean: { walk: 0.2, run: 0.5, combat: 0.15 }, twist: 0.14, waddle: 0.02, crouch: 0.05, breathe: 0.02, tailLift: 0.4,
  fidgets: [{ name: 'sniff', w: 3 }, { name: 'scratch', w: 2 }],
  pose(ctl) {
    const P = ctl.pose, B = P.b;
    // pickaxe rests on the shoulder when idle (suppressed while swinging / cowering / fleeing)
    const busy = Math.max(ctl.acts.weight('attack'), ctl.acts.weight('cower'), ctl.acts.weight('flee'), ctl.acts.weight('death'));
    const idle = (1 - clamp01(ctl.gait.act * 1.5) * (1 - ctl.run)) * (1 - busy);
    P.rot(ctl.b.armR[0], 0.5 * idle, 0, 0.1 * idle); P.rx(ctl.b.armR[1], 1.1 * idle);
    ctl.jaw += 0.05 * ctl.run;
    // candle goes out after death
    const u = ctl.inst.material.userData.u, dA = ctl.acts.list.find(a => a.name === 'death');
    u.uFlame.value = dA ? 1 - sstep(1.2, 1.6, dA.t) : 1;
  },
  actions: {
    attack: { dur: 0.8, a: 0.06, d: 0.85, fn(ctl, a, w) { // overhead pickaxe swing: wind up behind the head, chop down
      const P = ctl.pose, b = ctl.b, k = a.k;
      const wind = sstep(0, 0.35, k), chop = sstep(0.35, 0.5, k), rec = sstep(0.6, 1, k);
      const up = mix(mix(0.2, 2.75, wind), 0.05, chop) * (1 - rec) + 0.2 * rec;
      const el = mix(mix(0.3, 0.75, wind), 0.1, chop) * (1 - rec) + 0.3 * rec;
      const lean = (0.25 * wind * (1 - chop) - 0.35 * chop) * (1 - rec);
      P.move(b.hips, 0, -0.03 * chop * (1 - rec) * w, -0.05 * chop * (1 - rec) * w);
      P.rot(b.spine, lean * w, 0.15 * wind * (1 - chop) * w, 0);
      P.rot(b.chest, lean * 0.5 * w, 0, 0);
      armRot(ctl, 1, up, el, w, 0.1);
      armRot(ctl, -1, up * 0.6, 0.9, w, 0.25);
      ctl.jaw = Math.max(ctl.jaw, 0.45 * chop * (1 - rec) * w);
      ctl.ear = mix(ctl.ear, 1, w);
    } },
    cower: { dur: 1, hold: true, rest: true, fadeIn: 0.25, fadeOut: 0.3, fn(ctl, a, w) { // crouch, hands over head, trembling
      const P = ctl.pose, b = ctl.b, t = a.t;
      const tr = Math.sin(t * 55) * 0.02;
      P.move(b.hips, tr * w, -0.12 * w, 0.03 * w);
      P.rot(b.spine, -0.5 * w, 0, tr * w); P.rx(b.chest, -0.3 * w); P.rot(b.head, 0.15 * w, 0, 0);
      armRot(ctl, -1, 2.5, 1.9, w, 0.2); armRot(ctl, 1, 2.3, 1.9, w, 0.2);
      ctl.ear = mix(ctl.ear, 1.2, w);
      for (const L of ctl.gait.legs) { L.override = L.override || new THREE.Vector3(); L.override.set(L.home.x * 1.2, 0, L.home.z + 0.03); L.overrideW = Math.max(L.overrideW, w); }
      if (ctl.b.tail) for (const tb of ctl.b.tail) P.ry(tb, 0.35 * w);
    } },
    flee: { dur: 3, hold: true, fadeIn: 0.2, fadeOut: 0.4, fn(ctl, a, w) { // panicked: arms flail overhead, looks back
      const P = ctl.pose, b = ctl.b, t = a.t;
      armRot(ctl, -1, 2.7 + Math.sin(t * 16) * 0.4, 0.4, w, 0.3); armRot(ctl, 1, 2.5 + Math.sin(t * 16 + 2) * 0.4, 0.4, w, 0.3);
      P.rot(b.head, 0.1 * w, Math.sin(t * 2.5) * 0.9 * w, 0);
      ctl.jaw = Math.max(ctl.jaw, 0.4 * w); ctl.ear = mix(ctl.ear, 1.2, w);
    } },
    sniff: { dur: 1.8, a: 0.2, d: 0.8, fn(ctl, a, w) {
      const P = ctl.pose, b = ctl.b, t = a.t;
      P.rot(b.head, (0.25 + Math.sin(t * 22) * 0.04) * w, Math.sin(t * 2) * 0.3 * w, 0);
      P.rx(b.neck, 0.15 * w);
    } },
    scratch: { dur: 1.6, a: 0.2, d: 0.8, fn(ctl, a, w) { // scratch behind the ear with the free hand
      const P = ctl.pose, b = ctl.b, t = a.t;
      armRot(ctl, -1, 2.6, 2.0 + Math.sin(t * 25) * 0.15, w, 0.5);
      P.rot(b.head, -0.1 * w, -0.3 * w, 0.3 * w);
      ctl.ear = mix(ctl.ear, 0.2, w);
    } },
    hit: { dur: 0.4, a: 0.1, d: 0.5, fn(ctl, a, w) {
      const P = ctl.pose, b = ctl.b, j = Math.sin(a.k * Math.PI) * w;
      P.move(b.hips, 0, 0, 0.05 * j); P.rot(b.spine, 0.3 * j, 0, 0.12 * j * Math.sign(Math.sin(a.seed)));
      P.rx(b.head, 0.3 * j); ctl.ear = mix(ctl.ear, 1.2, j); ctl.jaw = Math.max(ctl.jaw, 0.4 * j);
    } },
    death: bipedDeath({ back: 1, lie: 0.36 }),
  },
};
