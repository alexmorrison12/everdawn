// Ambient critters (cheap: coarse SDF bodies, rigid thin limbs, ≤ ~1.5k verts): rabbit, deer, chicken, crow, sheep, cat.
import * as THREE from 'three';
import { QuadCtl, deathAction } from './quadruped.js';
import { BipedCtl, bipedDeath } from './biped.js';
import { sweep, rigid, bez, taper, leafGeo } from './geo.js';
import { col } from './sdf.js';
import { addEye, addHorn, lerp3 } from './parts.js';
import { sstep, clamp01, mix, bell, TAU, fract } from './rig.js';

const V3 = THREE.Vector3;
const hs = (i) => { const q = Math.sin(i * 78.233 + 12.9898) * 43758.5453; return q - Math.floor(q); };
const L2 = (p, n) => n + (p < 0 ? 'L' : 'R');
// thin rigid limb segment
function limb(acc, bone, a, b, r0, r1, c0, c1 = c0, radial = 5) {
  const ca = col(c0), cb = col(c1);
  acc.add(sweep([a, b], [r0, r1], { radial, capStart: true }), { skin: rigid(bone), dtl: [0.15, 0, 0.15, 0], color: (p, n, uv) => lerp3(ca, cb, uv[1]) });
}
// jointed leg: consecutive joints pts[i] carried by bones[i]; knob spheres hide the joints
function jleg(acc, bones, pts, radii, cols) {
  for (let i = 0; i < bones.length; i++) {
    limb(acc, bones[i], pts[i], pts[i + 1], radii[i], radii[i + 1], cols[i], cols[i + 1]);
    if (i > 0) acc.add(new THREE.SphereGeometry(radii[i] * 1.1, 6, 3), { matrix: new THREE.Matrix4().makeTranslation(...pts[i]), skin: rigid(bones[i]), color: cols[i], dtl: [0.15, 0, 0.15, 0] });
  }
}
function ear(acc, bone, pos, rot, W, H, T, outer, inner, cup = 0.6, o = {}) {
  const g = leafGeo(W, H, T, cup, o.bend ?? 0.15, { nu: 5, nv: 5, pw: o.pw ?? 0.8 });
  const m = new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(rot[0], rot[1], rot[2], 'YXZ')); m.setPosition(...pos);
  const co = col(outer), ci = col(inner);
  acc.add(g, { matrix: m, skin: rigid(bone), dtl: [0.2, 0, 0.1, 0], color: (p, n, uv) => uv[0] >= 1 ? co : lerp3(ci, co, sstep(0.6, 0.9, (uv[0] % 1) * 2)) });
}
const graze = (neck = -0.9, head = -0.5) => ({ dur: 1, hold: true, rest: true, fadeIn: 0.6, fadeOut: 0.4, fn(ctl, a, w) {
  const P = ctl.pose, b = ctl.b, t = a.t;
  P.rx(b.neck, neck * w); P.rot(b.head, (head + Math.sin(t * 7) * 0.04) * w, Math.sin(t * 0.7) * 0.15 * w, 0);
  P.rx(b.chest, -0.05 * w);
  ctl.jaw = Math.max(ctl.jaw, (0.08 + 0.06 * Math.sin(t * 9)) * w);
} });
const hitQ = { dur: 0.35, a: 0.1, d: 0.5, fn(ctl, a, w) { const P = ctl.pose, b = ctl.b, j = Math.sin(a.k * Math.PI) * w; P.move(b.body, 0, 0.02 * j, 0.04 * j); P.rx(b.neck, 0.3 * j); ctl.ear = mix(ctl.ear, 1, j); } };

// =====================================================================================================
export const rabbit = {
  variants: ['brown', 'grey', 'white'],
  config(variant) {
    const P = { brown: [0x8a7458, 0xf0e8dc, 0x5a4a38], grey: [0x8a8680, 0xece8e2, 0x55524e], white: [0xdcd8d0, 0xe8e6e0, 0xb8b0a8] }[variant] || null;
    const v = P ? variant : 'brown', p = P || [0x8a7458, 0xf0e8dc, 0x5a4a38];
    return { variant: v, pal: { fur: p[0], belly: p[1], dark: p[2] }, shapeKey: 'base', h: 0.0138, scale: 1, mat: { dfreq: 7 } };
  },
  rig(R) {
    R.add('body', null, [0, 0.13, 0.02]); R.add('hips', 'body', [0, 0.12, 0.07]); R.add('chest', 'body', [0, 0.13, -0.05]);
    R.add('neck', 'chest', [0, 0.16, -0.08]); R.add('head', 'neck', [0, 0.2, -0.1]); R.add('jaw', 'head', [0, 0.18, -0.13]);
    R.add('earL', 'head', [-0.02, 0.235, -0.09]); R.add('earR', 'head', [0.02, 0.235, -0.09]); R.add('tail', 'hips', [0, 0.14, 0.13]);
    for (const s of [-1, 1]) {
      R.add(L2(s, 'fU'), 'chest', [s * 0.04, 0.1, -0.07]); R.add(L2(s, 'fL'), L2(s, 'fU'), [s * 0.04, 0.06, -0.06]); R.add(L2(s, 'fP'), L2(s, 'fL'), [s * 0.04, 0.018, -0.075]);
      R.add(L2(s, 'rT'), 'hips', [s * 0.05, 0.11, 0.07]); R.add(L2(s, 'rS'), L2(s, 'rT'), [s * 0.055, 0.065, 0.02]); R.add(L2(s, 'rM'), L2(s, 'rS'), [s * 0.055, 0.03, 0.1]); R.add(L2(s, 'rP'), L2(s, 'rM'), [s * 0.055, 0.014, 0.035]);
    }
  },
  sculpt(S, cfg) {
    const c = cfg.pal, f = [0.35, 0, 0.1, 0];
    S.ell('body', [0, 0.125, 0.03], [0.065, 0.07, 0.095], { k: 0.03, col: c.fur, tag: 'body', dtl: f });
    S.ell('chest', [0, 0.125, -0.045], [0.055, 0.065, 0.06], { k: 0.03, col: c.fur, tag: 'body', dtl: f });
    S.ell('head', [0, 0.195, -0.105], [0.042, 0.042, 0.052], { k: 0.025, col: c.fur, tag: 'head', dtl: f });
    for (const s of [-1, 1]) S.ell('head', [s * 0.02, 0.183, -0.14], [0.022, 0.022, 0.022], { k: 0.015, col: c.belly, tag: 'muzzle', dtl: f });
    S.sph('head', [0, 0.194, -0.158], 0.009, { k: 0.006, col: 0xd08a88, tag: 'nose' });
    for (const s of [-1, 1]) {
      S.ell(L2(s, 'rT'), [s * 0.05, 0.085, 0.065], [0.036, 0.06, 0.058], { k: 0.025, col: c.fur, tag: 'haunch', dtl: f });
      S.cone(L2(s, 'rS'), [s * 0.055, 0.06, 0.04], [s * 0.055, 0.025, 0.095], 0.022, 0.014, { k: 0.018, col: c.fur, b2: L2(s, 'rM'), dtl: f });
      S.cone(L2(s, 'fL'), [s * 0.04, 0.09, -0.065], [s * 0.04, 0.02, -0.075], 0.012, 0.01, { k: 0.012, col: c.belly, dtl: f });
      S.ell(L2(s, 'rM'), [s * 0.055, 0.015, 0.06], [0.014, 0.012, 0.045], { k: 0.012, col: c.belly, tag: 'foot', dtl: f });
    }
    S.sph('tail', [0, 0.14, 0.13], 0.022, { k: 0.015, col: 0xe8e6e0, tag: 'tail', dtl: f });
  },
  paint(v, cfg) { v.mix(cfg.pal.belly, sstep(-0.2, -0.7, v.n[1]) * 0.8); v.mix(cfg.pal.dark, sstep(0.5, 0.9, v.n[1]) * 0.25); },
  parts(acc, S, R, cfg) {
    const b = (n) => R.index(n), c = cfg.pal;
    for (const s of [-1, 1]) {
      addEye(acc, S, b('head'), [s * 0.03, 0.205, -0.125], [s * 1, 0.1, -0.5], 0.009, { pupilA: 0.9, irisA: 0, seg: 8 });
      ear(acc, b(s < 0 ? 'earL' : 'earR'), [s * 0.018, 0.225, -0.09], [0.35, s * 0.25, -s * 0.2], 0.018, 0.085, 0.008, c.fur, 0xe0a8a0, 0.6, { pw: 0.5 });
    }
  },
  sockets: { head: ['head', [0, 0.25, -0.1]], mouth: ['jaw', [0, 0.18, -0.15]], chest: ['chest', [0, 0.12, -0.08]] },
  height: 0.32, radius: 0.12,
  controller(inst) { return new QuadCtl(inst, RABBIT_SPEC); },
  actions: ['hop', 'graze', 'situp', 'flee', 'hit', 'death'],
};
const RABBIT_SPEC = {
  bones: { body: 'body', hips: 'hips', chest: 'chest', neck: 'neck', head: 'head', jaw: 'jaw', tail: ['tail'], ears: ['earL', 'earR'] },
  gait: {
    legs: [
      { id: 'FL', chain: ['fUL', 'fLL', 'fPL'], toe: [-0.04, 0, -0.09], body: 'chest', scap: 0.5, dutyMul: 0.45, lift: 0.04, flex: 0.6 },
      { id: 'FR', chain: ['fUR', 'fLR', 'fPR'], toe: [0.04, 0, -0.09], body: 'chest', scap: 0.5, dutyMul: 0.45, lift: 0.04, flex: 0.6 },
      { id: 'RL', chain: ['rTL', 'rSL', 'rML', 'rPL'], toe: [-0.055, 0, 0.0], body: 'hips', scap: 0.5, dutyMul: 0.7, lift: 0.04, flex: 0.8, metaK: 2, heel: 0.8 },
      { id: 'RR', chain: ['rTR', 'rSR', 'rMR', 'rPR'], toe: [0.055, 0, 0.0], body: 'hips', scap: 0.5, dutyMul: 0.7, lift: 0.04, flex: 0.8, metaK: 2, heel: 0.8 },
    ],
    maxStride: 0.3, fMin: 0.8, actV: 0.15,
    gaits: [ // bounding hop: hind pair then fore pair, big hop arc
      { v: 0.8, f: 2.6, duty: 0.35, lift: 1, off: { RL: 0, RR: 0.02, FL: 0.4, FR: 0.43 }, bob: 0.035, bobF: 1, bobPh: 0.75, pitch: 0.25, pitchF: 1, pitchPh: 0.1, flex: 0.15, flexF: 1, flexPh: 0.3 },
      { v: 6, f: 5.2, duty: 0.25, lift: 1.3, off: { RL: 0, RR: 0.04, FL: 0.45, FR: 0.5 }, bob: 0.06, bobF: 1, bobPh: 0.75, pitch: 0.2, pitchF: 1, pitchPh: 0.1, flex: 0.25, flexF: 1, flexPh: 0.3 },
    ],
  },
  neck: { pitch: 0, run: 0.1, combat: 0 }, tail: { wag: 0.1, wagF: 3 }, breathe: 0.03,
  fidgets: [{ name: 'situp', w: 2 }, { name: 'nibble', w: 2 }],
  pose(ctl) { // nose twitch
    const P = ctl.pose, b = ctl.b, tw = Math.sin(ctl.t * 30) * 0.02 * (Math.sin(ctl.t * 1.1) > 0 ? 1 : 0);
    P.rx(b.head, tw); ctl.ear = ctl.run * 1.0;
  },
  actions: {
    graze: graze(-0.6, -0.4),
    nibble: { dur: 2.0, a: 0.2, d: 0.8, fn(ctl, a, w) { const P = ctl.pose, b = ctl.b; P.rx(b.neck, -0.6 * w); P.rx(b.head, (-0.3 + Math.sin(a.t * 14) * 0.05) * w); } },
    situp: { dur: 2.4, a: 0.2, d: 0.8, fn(ctl, a, w) { // rear up on haunches, look around
      const P = ctl.pose, b = ctl.b, t = a.t;
      P.move(b.body, 0, 0.03 * w, 0.02 * w); P.rx(b.body, 0.7 * w); P.rx(b.neck, -0.4 * w); P.rot(b.head, -0.25 * w, Math.sin(t * 2) * 0.5 * w, 0);
      for (const L of ctl.gait.legs) if (L.id[0] === 'F') { L.override = L.override || new V3(); L.override.set(L.toe.x, 0.05, L.toe.z + 0.02); L.overrideLocal = true; L.overrideW = Math.max(L.overrideW, w); L.overridePaw = -0.8; }
      ctl.ear = mix(ctl.ear, -0.3, w);
    } },
    hop: { dur: 0.5, a: 0.05, d: 0.9, fn(ctl, a, w) { const P = ctl.pose, b = ctl.b, h = Math.sin(a.k * Math.PI); P.move(b.body, 0, 0.08 * h * w, 0); P.rx(b.body, 0.2 * Math.sin(a.k * TAU) * w); } },
    flee: { dur: 1, hold: true, fadeIn: 0.1, fadeOut: 0.5, fn(ctl, a, w) { ctl.ear = mix(ctl.ear, 1.2, w); } },
    hit: hitQ,
    death: deathAction({ lieY: 0.08, roll: 1.4 }),
  },
};

// =====================================================================================================
export const deer = {
  variants: ['doe', 'buck', 'fawn'],
  config(variant) {
    const v = ['doe', 'buck', 'fawn'].includes(variant) ? variant : 'doe';
    return { variant: v, pal: { fur: v === 'fawn' ? 0xb07a48 : 0xa06a3a, dark: 0x5a3a20, belly: 0xf0e4d0, nose: 0x201818, hoof: 0x2a2220 }, buck: v === 'buck', fawn: v === 'fawn', shapeKey: 'base', h: 0.052, scale: v === 'fawn' ? 0.6 : v === 'buck' ? 1.1 : 1, mat: { dfreq: 2.6 } };
  },
  rig(R) {
    R.add('body', null, [0, 0.86, 0.0]); R.add('hips', 'body', [0, 0.87, 0.3]); R.add('chest', 'body', [0, 0.87, -0.25]);
    R.add('neck', 'chest', [0, 0.98, -0.42]); R.add('head', 'neck', [0, 1.28, -0.58]); R.add('jaw', 'head', [0, 1.24, -0.64]);
    R.add('earL', 'head', [-0.05, 1.34, -0.56]); R.add('earR', 'head', [0.05, 1.34, -0.56]); R.add('tail', 'hips', [0, 0.92, 0.45]);
    for (const s of [-1, 1]) {
      R.add(L2(s, 'fU'), 'chest', [s * 0.12, 0.74, -0.3]); R.add(L2(s, 'fL'), L2(s, 'fU'), [s * 0.12, 0.47, -0.22]); R.add(L2(s, 'fP'), L2(s, 'fL'), [s * 0.12, 0.1, -0.29]);
      R.add(L2(s, 'rT'), 'hips', [s * 0.12, 0.82, 0.34]); R.add(L2(s, 'rS'), L2(s, 'rT'), [s * 0.12, 0.54, 0.22]); R.add(L2(s, 'rM'), L2(s, 'rS'), [s * 0.12, 0.33, 0.44]); R.add(L2(s, 'rP'), L2(s, 'rM'), [s * 0.12, 0.08, 0.4]);
    }
  },
  sculpt(S, cfg) {
    const c = cfg.pal, f = [0.28, 0, 0.12, 0];
    S.ell('body', [0, 0.86, 0.02], [0.16, 0.18, 0.36], { k: 0.08, col: c.fur, tag: 'body', dtl: f });
    S.ell('chest', [0, 0.84, -0.22], [0.15, 0.19, 0.17], { k: 0.08, col: c.fur, tag: 'body', dtl: f });
    S.ell('hips', [0, 0.88, 0.3], [0.15, 0.16, 0.16], { k: 0.08, col: c.fur, tag: 'body', dtl: f });
    for (const s of [-1, 1]) {
      S.ell(L2(s, 'fU'), [s * 0.115, 0.62, -0.26], [0.058, 0.15, 0.07], { k: 0.05, col: c.fur, dtl: f, rot: [-0.25, 0, 0] });
      S.ell(L2(s, 'rT'), [s * 0.11, 0.7, 0.29], [0.068, 0.18, 0.1], { k: 0.06, col: c.fur, rot: [0.35, 0, 0], dtl: f });
    }
    S.cone('neck', [0, 0.92, -0.34], [0, 1.25, -0.56], 0.1, 0.06, { k: 0.06, col: c.fur, b2: 'head', t0: 0.7, t1: 1, dtl: f });
    S.ell('head', [0, 1.29, -0.62], [0.066, 0.072, 0.095], { k: 0.04, col: c.fur, tag: 'head', dtl: f });
    S.cone('head', [0, 1.27, -0.66], [0, 1.225, -0.78], 0.045, 0.028, { k: 0.03, col: c.fur, tag: 'muzzle', dtl: f });
    S.sph('head', [0, 1.225, -0.795], 0.022, { k: 0.012, col: c.nose, tag: 'nose' });
    S.cone('tail', [0, 0.93, 0.44], [0, 0.86, 0.52], 0.035, 0.02, { k: 0.02, col: c.fur, tag: 'tail', dtl: f });
  },
  paint(v, cfg) {
    const c = cfg.pal, [x, y, z] = v.p, [nx, ny, nz] = v.n;
    v.mix(c.belly, sstep(-0.2, -0.7, ny) * 0.9);
    v.mix(c.dark, sstep(0.6, 0.95, ny) * sstep(0.85, 0.95, y) * 0.35);
    v.mix(c.belly, v.t('tail') * sstep(0.2, -0.4, ny) * 0.9); // white flag
    v.mix(c.belly, (1 - sstep(0.03, 0.05, Math.abs(x))) * sstep(0.4, 0.9, -nz) * sstep(1.0, 1.1, y) * (1 - sstep(1.2, 1.25, y)) * 0.8); // throat
    v.mix(c.belly, v.t('muzzle') * sstep(0.2, -0.6, ny) * 0.6);
    if (cfg.fawn) { // spots
      const sp = Math.sin(x * 60) * Math.sin(z * 45 + y * 20);
      v.mix(0xfff0dc, sstep(0.7, 0.85, sp) * sstep(0.2, 0.7, ny + Math.abs(nx) * 0.5) * (v.t('body') > 0.5 ? 1 : 0) * 0.8);
    }
  },
  parts(acc, S, R, cfg) {
    const b = (n) => R.index(n), c = cfg.pal;
    for (const s of [-1, 1]) {
      const n = s < 0 ? 'L' : 'R';
      addEye(acc, S, b('head'), [s * 0.05, 1.31, -0.66], [s * 1, 0.1, -0.5], 0.017, { pupilA: 0.9, irisA: 0, seg: 8 });
      ear(acc, b('ear' + n), [s * 0.045, 1.33, -0.56], [0.15, s * 0.5, -s * 0.9], 0.05, 0.14, 0.018, c.fur, 0xe8c8b8, 0.7);
      // legs: slender jointed segments, darker shins, dark hooves
      const lo = 0x7a4e2a;
      jleg(acc, [b('fU' + n), b('fL' + n), b('fP' + n)], [[s * 0.115, 0.8, -0.3], [s * 0.12, 0.47, -0.22], [s * 0.12, 0.1, -0.29], [s * 0.12, 0.015, -0.33]], [0.045, 0.032, 0.019, 0.022], [c.fur, c.fur, lo, c.hoof]);
      jleg(acc, [b('rT' + n), b('rS' + n), b('rM' + n), b('rP' + n)], [[s * 0.11, 0.86, 0.32], [s * 0.12, 0.54, 0.22], [s * 0.12, 0.33, 0.44], [s * 0.12, 0.08, 0.4], [s * 0.12, 0.015, 0.36]], [0.055, 0.042, 0.025, 0.018, 0.021], [c.fur, c.fur, c.fur, lo, c.hoof]);
      if (cfg.buck) { // antlers
        const base = [s * 0.035, 1.35, -0.6];
        const main = bez(base, [s * 0.09, 1.47, -0.55], [s * 0.06, 1.6, -0.62], 5);
        acc.add(sweep(main, taper(5, 0.016, 0.004), { radial: 5 }), { skin: rigid(b('head')), color: (p, nn, uv) => lerp3(col(0x6a5238), col(0xe8dcc0), uv[1]), dtl: [0, 0, 0.2, 0.3] });
        for (const t of [0.35, 0.7]) {
          const p = main[Math.round(t * 4)];
          acc.add(sweep([p, p.clone().add(new V3(s * 0.02, 0.07, -0.05))], [0.009, 0.003], { radial: 4 }), { skin: rigid(b('head')), color: 0xd8c8a8, dtl: [0, 0, 0.2, 0.3] });
        }
      }
    }
  },
  sockets: { head: ['head', [0, 1.4, -0.6]], mouth: ['jaw', [0, 1.22, -0.78]], chest: ['chest', [0, 0.8, -0.35]] },
  height: 1.45, radius: 0.4,
  controller(inst) { return new QuadCtl(inst, DEER_SPEC); },
  actions: ['graze', 'alert', 'flee', 'hit', 'death'],
};
const DEER_SPEC = {
  bones: { body: 'body', hips: 'hips', chest: 'chest', neck: 'neck', head: 'head', jaw: 'jaw', tail: ['tail'], ears: ['earL', 'earR'] },
  gait: {
    legs: [
      { id: 'FL', chain: ['fUL', 'fLL', 'fPL'], toe: [-0.12, 0, -0.33], body: 'chest', scap: 0.35, lift: 0.14, flex: 1.4, heel: 0.4 },
      { id: 'FR', chain: ['fUR', 'fLR', 'fPR'], toe: [0.12, 0, -0.33], body: 'chest', scap: 0.35, lift: 0.14, flex: 1.4, heel: 0.4 },
      { id: 'RL', chain: ['rTL', 'rSL', 'rML', 'rPL'], toe: [-0.12, 0, 0.36], body: 'hips', scap: 0.3, lift: 0.13, flex: 0.9, metaK: 1.0 },
      { id: 'RR', chain: ['rTR', 'rSR', 'rMR', 'rPR'], toe: [0.12, 0, 0.36], body: 'hips', scap: 0.3, lift: 0.13, flex: 0.9, metaK: 1.0 },
    ],
    maxStride: 0.75,
    gaits: [
      { v: 1.2, f: 1.4, duty: 0.64, lift: 0.8, off: { RL: 0, FL: 0.25, RR: 0.5, FR: 0.75 }, bob: 0.012, bobF: 2, nod: 0.05, nodF: 2, nodPh: 0.3 },
      { v: 3.5, f: 2.1, duty: 0.44, lift: 1, off: { FL: 0, RR: 0, FR: 0.5, RL: 0.5 }, bob: 0.025, bobF: 2, nod: 0.03, nodF: 2 },
      { v: 9, f: 3.0, duty: 0.22, lift: 1.4, off: { RL: 0, RR: 0.05, FL: 0.5, FR: 0.55 }, bob: 0.12, bobF: 1, bobPh: 0.65, pitch: 0.16, pitchF: 1, pitchPh: 0.05, flex: 0.12, flexF: 1, flexPh: 0.2, nod: 0.06, nodF: 1 },
    ],
  },
  neck: { pitch: 0, run: -0.3, combat: 0, walk: -0.1, stab: 0.8 }, tail: { wag: 0.3, wagF: 2.5, run: 0.9 }, breathe: 0.012,
  fidgets: [{ name: 'graze', w: 4 }, { name: 'alert', w: 1 }],
  actions: {
    graze: graze(-1.1, -0.45),
    alert: { dur: 2.4, a: 0.1, d: 0.85, fn(ctl, a, w) { const P = ctl.pose, b = ctl.b; P.rx(b.neck, 0.15 * w); P.rot(b.head, 0.1 * w, Math.sin(a.t * 1.5) * 0.4 * w, 0); ctl.ear = mix(ctl.ear, -0.4, w); if (b.tail) P.rx(b.tail[0], -0.8 * w); } },
    flee: { dur: 1, hold: true, fadeIn: 0.1, fadeOut: 0.5, fn(ctl, a, w) { if (ctl.b.tail) ctl.pose.rx(ctl.b.tail[0], -1.0 * w); } },
    hit: hitQ, death: deathAction({ lieY: 0.62, roll: 1.4 }),
  },
};

// =====================================================================================================
function birdRig(R, H) { // H: overall height scale (chicken 1, crow ~0.7)
  const p = (x, y, z) => [x * H, y * H, z * H];
  R.add('hips', null, p(0, 0.22, 0.02)); R.add('spine', 'hips', p(0, 0.25, 0)); R.add('chest', 'spine', p(0, 0.27, -0.05));
  R.add('neck', 'chest', p(0, 0.31, -0.08)); R.add('head', 'neck', p(0, 0.39, -0.1)); R.add('jaw', 'head', p(0, 0.39, -0.14));
  R.add('tail', 'hips', p(0, 0.28, 0.1));
  for (const s of [-1, 1]) {
    R.add(L2(s, 'wing'), 'chest', p(s * 0.075, 0.29, -0.04));
    R.add(L2(s, 'thigh'), 'hips', p(s * 0.04, 0.19, 0.02)); R.add(L2(s, 'shin'), L2(s, 'thigh'), p(s * 0.045, 0.11, -0.015)); R.add(L2(s, 'foot'), L2(s, 'shin'), p(s * 0.045, 0.025, 0.01));
  }
}
function birdLegs(acc, R, H, cleg) {
  const b = (n) => R.index(n), p = (x, y, z) => [x * H, y * H, z * H];
  for (const s of [-1, 1]) {
    limb(acc, b(L2(s, 'shin')), p(s * 0.045, 0.12, -0.012), p(s * 0.045, 0.025, 0.01), 0.011 * H, 0.009 * H, cleg, cleg, 5);
    for (const [dx, dz] of [[-0.02, -0.055], [0, -0.065], [0.02, -0.055], [0, 0.03]]) limb(acc, b(L2(s, 'foot')), p(s * 0.045, 0.02, 0.01), p(s * 0.045 + dx, 0.004, 0.01 + dz), 0.006 * H, 0.004 * H, cleg, cleg, 4);
  }
}
function wings(acc, R, H, c0, c1, span = 1) {
  const b = (n) => R.index(n);
  for (const s of [-1, 1]) {
    const g = leafGeo(0.06 * H * span, 0.17 * H * span, 0.018 * H, 0.15, 0.1, { nu: 5, nv: 5, pw: 0.7, tipW: 0.01 * H });
    // folded along the body: plate grows backward (+Z, slightly down), front face points outward
    const Yw = new V3(0, -0.28, 1).normalize(), Zw = new V3(-s, 0, 0), Xw = new V3().crossVectors(Yw, Zw);
    const m = new THREE.Matrix4().makeBasis(Xw, Yw, Zw);
    m.setPosition(s * 0.078 * H, 0.3 * H, -0.06 * H);
    const ca = col(c0), cb = col(c1);
    acc.add(g, { matrix: m, skin: rigid(b(L2(s, 'wing'))), dtl: [0.25, 0, 0.1, 0], color: (p, n, uv) => lerp3(ca, cb, sstep(0.4, 1, uv[1])) });
  }
}
const BIRD_ACTIONS = {
  peck: { dur: 0.9, a: 0.05, d: 0.9, fn(ctl, a, w) { const P = ctl.pose, b = ctl.b, k = a.k; const d = Math.max(bell(clamp01(k / 0.3)), bell(clamp01((k - 0.35) / 0.3)) * 0.9); P.rx(b.spine, -0.35 * d * w); P.rx(b.neck, -0.3 * d * w); P.rx(b.head, -0.5 * d * w); ctl.jaw = Math.max(ctl.jaw, 0.2 * d * w); } },
  flap: { dur: 1.1, a: 0.05, d: 0.85, fn(ctl, a, w) { ctl.flap = Math.max(ctl.flap || 0, w); ctl.pose.move(ctl.b.hips, 0, Math.max(0, Math.sin(a.k * Math.PI)) * 0.05 * w, 0); } },
  fly: { dur: 1, hold: true, fadeIn: 0.15, fadeOut: 0.3, fn(ctl, a, w) { ctl.flap = Math.max(ctl.flap || 0, w); ctl.flyW = w; } },
  hit: { dur: 0.35, a: 0.1, d: 0.5, fn(ctl, a, w) { const j = Math.sin(a.k * Math.PI) * w; ctl.pose.rx(ctl.b.spine, 0.3 * j); ctl.flap = Math.max(ctl.flap || 0, j * 0.6); } },
  death: bipedDeath({ back: -1, lie: 0.12 }),
};
function birdSpec(H, extra = {}) {
  return {
    bones: { hips: 'hips', spine: 'spine', chest: 'chest', neck: 'neck', head: 'head', jaw: 'jaw', tail: ['tail'] },
    gait: {
      legs: [
        { id: 'L', chain: ['thighL', 'shinL', 'footL'], toe: [-0.045 * H, 0, -0.05 * H], body: 'hips', scap: 0.3, lift: 0.04 * H, flex: 0.6, heel: 0.3 },
        { id: 'R', chain: ['thighR', 'shinR', 'footR'], toe: [0.045 * H, 0, -0.05 * H], body: 'hips', scap: 0.3, lift: 0.04 * H, flex: 0.6, heel: 0.3 },
      ],
      maxStride: 0.15 * H, fMin: 0.8, actV: 0.12,
      gaits: extra.gaits || [
        { v: 0.5 * H, f: 2.4, duty: 0.6, lift: 0.9, off: { L: 0, R: 0.5 }, bob: 0.008, bobF: 2, roll: 0.06, rollF: 1, rollPh: 0.25, sway: 0.01, swayF: 1, swayPh: 0.25 },
        { v: 2.5 * H, f: 4.5, duty: 0.4, lift: 1.2, off: { L: 0, R: 0.5 }, bob: 0.015, bobF: 2, roll: 0.05, rollF: 1, rollPh: 0.25 },
      ],
    },
    lean: { walk: 0.1, run: 0.4 }, twist: 0.05, waddle: 0.05, breathe: 0.03,
    fidgets: [{ name: 'peck', w: 3 }, { name: 'flap', w: 1 }],
    pose(ctl, dt) {
      const P = ctl.pose, B = P.b, G = ctl.gait;
      // pigeon head-bob: head holds still in world space, then thrusts forward each step
      const hp = fract(G.phase * 2), v = Math.abs(ctl.speedSm) / (0.5 * H);
      const hold = hp < 0.65 ? hp / 0.65 : 1 - (hp - 0.65) / 0.35;
      P.move(B.head, 0, 0, (hold - 0.5) * 0.05 * H * clamp01(v) * G.act);
      // wings: folded, twitch; flap when asked or airborne
      ctl.flap = Math.max(0, (ctl.flap || 0) - dt * 3);
      const air = Math.max(ctl.air, ctl.flyW || 0); ctl.flyW = 0;
      const fl = Math.max(ctl.flap, air);
      const beat = Math.sin(ctl.t * (air > 0.5 ? 14 : 20));
      for (const [n, s] of [['wingL', -1], ['wingR', 1]]) P.rot(B[n], -0.2 * fl, 0, s * fl * (0.9 + 0.7 * beat));
      P.rx(B.hips, -0.5 * air); P.rx(B.tail, 0.2 * air);
      if (extra.pose) extra.pose(ctl, dt);
    },
    actions: BIRD_ACTIONS,
  };
}
export const chicken = {
  variants: ['white', 'brown', 'black'],
  config(variant) {
    const P = { white: [0xe2ddd2, 0xc8c0b0], brown: [0xb8642c, 0x6a3418], black: [0x2a2a30, 0x14141a] }[variant];
    const v = P ? variant : 'white', p = P || [0xf4f0e6, 0xd8d0c0];
    return { variant: v, pal: { body: p[0], dark: p[1] }, shapeKey: 'base', h: 0.017, scale: 1, mat: { dfreq: 6 } };
  },
  rig(R) { birdRig(R, 1); },
  sculpt(S, cfg) {
    const c = cfg.pal, f = [0.3, 0, 0.1, 0];
    S.ell('spine', [0, 0.25, 0.0], [0.09, 0.095, 0.12], { k: 0.04, col: c.body, tag: 'body', dtl: f });
    S.ell('chest', [0, 0.25, -0.07], [0.075, 0.08, 0.07], { k: 0.04, col: c.body, tag: 'body', dtl: f });
    S.cone('neck', [0, 0.29, -0.08], [0, 0.37, -0.1], 0.045, 0.03, { k: 0.03, col: c.body, b2: 'head', dtl: f });
    S.ell('head', [0, 0.395, -0.105], [0.03, 0.035, 0.038], { k: 0.02, col: c.body, tag: 'head', dtl: f });
    S.cone('tail', [0, 0.27, 0.08], [0, 0.36, 0.15], 0.055, 0.025, { k: 0.03, col: c.dark, tag: 'tail', dtl: f });
    for (let i = 0; i < 3; i++) S.sph('head', [0, 0.435 + (i === 1 ? 0.01 : 0), -0.125 + i * 0.022], 0.014, { k: 0.01, col: 0xd82a22, tag: 'comb' });
    S.ell('jaw', [0, 0.36, -0.13], [0.01, 0.018, 0.01], { k: 0.008, col: 0xd82a22, tag: 'wattle' });
    for (const s of [-1, 1]) S.cone(L2(s, 'thigh'), [s * 0.04, 0.2, 0.02], [s * 0.045, 0.12, -0.012], 0.035, 0.018, { k: 0.02, col: c.body, dtl: f });
  },
  paint(v, cfg) { v.mix(cfg.pal.dark, sstep(0.8, 1, v.p[2] * 3) * 0.3); v.mix(0xd82a22, Math.max(v.t('comb'), v.t('wattle'))); },
  parts(acc, S, R, cfg) {
    const b = (n) => R.index(n);
    for (const s of [-1, 1]) addEye(acc, S, b('head'), [s * 0.025, 0.405, -0.115], [s, 0.1, -0.3], 0.008, { iris: 0xe8a020, pupilA: 0.4, irisA: 0.9, seg: 8 });
    addHorn(acc, b('head'), [0, 0.395, -0.135], [0, 0.39, -0.155], [0, 0.378, -0.168], 0.012, 0.002, { base: 0xe0a030, tip: 0xf0c050, radial: 5, n: 4 });
    wings(acc, R, 1, cfg.pal.body, cfg.pal.dark, 0.85);
    birdLegs(acc, R, 1, 0xe8b030);
  },
  sockets: { head: ['head', [0, 0.46, -0.1]], mouth: ['head', [0, 0.38, -0.16]], chest: ['chest', [0, 0.25, -0.1]] },
  height: 0.46, radius: 0.12,
  controller(inst) { return new BipedCtl(inst, CHICKEN_SPEC); },
  actions: ['peck', 'flap', 'fly', 'hit', 'death'],
};
const CHICKEN_SPEC = birdSpec(1);

export const crow = {
  variants: ['crow', 'raven'],
  config(variant) { const v = variant === 'raven' ? 'raven' : 'crow'; return { variant: v, pal: { body: 0x1c1c24, dark: 0x0c0c12 }, shapeKey: 'base', h: 0.013, scale: v === 'raven' ? 1.3 : 1, mat: { dfreq: 8, rim: 0.5 } }; },
  rig(R) { birdRig(R, 0.7); },
  sculpt(S, cfg) {
    const c = cfg.pal, f = [0.25, 0, 0.1, 0], H = 0.7, p = (x, y, z) => [x * H, y * H, z * H];
    S.ell('spine', p(0, 0.26, 0.0), [0.055, 0.06, 0.1], { k: 0.03, col: c.body, tag: 'body', dtl: f, rot: [-0.25, 0, 0] });
    S.ell('chest', p(0, 0.265, -0.06), [0.05, 0.052, 0.05], { k: 0.03, col: c.body, tag: 'body', dtl: f });
    S.ell('head', p(0, 0.37, -0.1), [0.032, 0.032, 0.038], { k: 0.025, col: c.body, tag: 'head', dtl: f });
    S.cone('neck', p(0, 0.3, -0.07), p(0, 0.36, -0.09), 0.035, 0.03, { k: 0.02, col: c.body, b2: 'head', dtl: f });
    S.cone('tail', p(0, 0.26, 0.08), p(0, 0.2, 0.22), 0.03, 0.02, { k: 0.02, col: c.dark, tag: 'tail', dtl: f });
    for (const s of [-1, 1]) S.cone(L2(s, 'thigh'), p(s * 0.04, 0.2, 0.02), p(s * 0.045, 0.12, -0.012), 0.024, 0.012, { k: 0.015, col: c.body, dtl: f });
  },
  paint(v) { v.mul(1 + 0.2 * Math.max(0, v.n[1])); },
  parts(acc, S, R, cfg) {
    const b = (n) => R.index(n), H = 0.7, p = (x, y, z) => [x * H, y * H, z * H];
    for (const s of [-1, 1]) addEye(acc, S, b('head'), p(s * 0.025, 0.38, -0.115), [s, 0.1, -0.4], 0.006, { iris: 0x3a2a1a, pupilA: 0.5, irisA: 0.9, seg: 8 });
    addHorn(acc, b('head'), p(0, 0.37, -0.13), p(0, 0.368, -0.165), p(0, 0.355, -0.19), 0.013, 0.002, { base: 0x2a2a30, tip: 0x3a3a44, radial: 5, n: 4 });
    wings(acc, R, H, 0x22222c, 0x0a0a10, 1.25);
    // tail fan
    const g = leafGeo(0.05, 0.12, 0.01, 0.1, 0.05, { nu: 5, nv: 4, pw: 0.3, tipW: 0.035 });
    const m = new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(Math.PI / 2 + 0.3, 0, 0)); m.setPosition(...p(0, 0.25, 0.1));
    acc.add(g, { matrix: m, skin: rigid(b('tail')), color: 0x121218, dtl: [0.2, 0, 0.1, 0] });
    birdLegs(acc, R, H, 0x2a2a30);
  },
  sockets: { head: ['head', [0, 0.3, -0.07]], mouth: ['head', [0, 0.25, -0.13]], chest: ['chest', [0, 0.18, -0.06]] },
  height: 0.3, radius: 0.1,
  controller(inst) { return new BipedCtl(inst, CROW_SPEC); },
  actions: ['hop', 'peck', 'flap', 'fly', 'caw', 'hit', 'death'],
};
const CROW_SPEC = birdSpec(0.7, {
  gaits: [ // two-footed hops
    { v: 0.4, f: 2.2, duty: 0.35, lift: 1.2, off: { L: 0, R: 0.02 }, bob: 0.025, bobF: 1, bobPh: 0.7, pitch: 0.08, pitchF: 1 },
    { v: 1.8, f: 3.2, duty: 0.3, lift: 1.4, off: { L: 0, R: 0.03 }, bob: 0.035, bobF: 1, bobPh: 0.7, pitch: 0.1, pitchF: 1 },
  ],
});
CROW_SPEC.actions = { ...BIRD_ACTIONS,
  caw: { dur: 1.0, a: 0.1, d: 0.8, fn(ctl, a, w) { const P = ctl.pose, b = ctl.b, j = bell(a.k); P.rx(b.neck, 0.4 * j * w); P.rx(b.head, 0.3 * j * w); ctl.jaw = Math.max(ctl.jaw, 0.5 * j * w * (0.6 + 0.4 * Math.sin(a.t * 30))); ctl.flap = Math.max(ctl.flap || 0, 0.3 * j * w); } },
  hop: { dur: 0.45, a: 0.05, d: 0.9, fn(ctl, a, w) { ctl.pose.move(ctl.b.hips, 0, Math.sin(a.k * Math.PI) * 0.06 * w, 0); } },
};
CROW_SPEC.fidgets = [{ name: 'peck', w: 3 }, { name: 'caw', w: 1 }, { name: 'hop', w: 1 }];

// =====================================================================================================
export const sheep = {
  variants: ['white', 'black', 'lamb'],
  config(variant) {
    const v = ['white', 'black', 'lamb'].includes(variant) ? variant : 'white';
    return { variant: v, pal: { wool: v === 'black' ? 0x3a3434 : 0xd6ceb8, face: v === 'black' ? 0x1a1616 : 0x2e2622, leg: 0x2a2420 }, shapeKey: 'base', h: 0.045, scale: v === 'lamb' ? 0.6 : 1, mat: { dfreq: 3 } };
  },
  rig(R) {
    R.add('body', null, [0, 0.55, 0.0]); R.add('hips', 'body', [0, 0.55, 0.25]); R.add('chest', 'body', [0, 0.56, -0.2]);
    R.add('neck', 'chest', [0, 0.62, -0.36]); R.add('head', 'neck', [0, 0.68, -0.48]); R.add('jaw', 'head', [0, 0.62, -0.54]);
    R.add('earL', 'head', [-0.06, 0.7, -0.46]); R.add('earR', 'head', [0.06, 0.7, -0.46]); R.add('tail', 'hips', [0, 0.62, 0.4]);
    for (const s of [-1, 1]) {
      R.add(L2(s, 'fU'), 'chest', [s * 0.1, 0.45, -0.22]); R.add(L2(s, 'fL'), L2(s, 'fU'), [s * 0.1, 0.29, -0.17]); R.add(L2(s, 'fP'), L2(s, 'fL'), [s * 0.1, 0.07, -0.22]);
      R.add(L2(s, 'rT'), 'hips', [s * 0.1, 0.48, 0.26]); R.add(L2(s, 'rS'), L2(s, 'rT'), [s * 0.1, 0.31, 0.19]); R.add(L2(s, 'rM'), L2(s, 'rS'), [s * 0.1, 0.18, 0.3]); R.add(L2(s, 'rP'), L2(s, 'rM'), [s * 0.1, 0.06, 0.28]);
    }
  },
  sculpt(S, cfg) {
    const c = cfg.pal, wool = [0, 0.25, 0.25, 0], f = [0.15, 0, 0.1, 0];
    S.ell('body', [0, 0.54, 0.02], [0.24, 0.24, 0.33], { k: 0.08, col: c.wool, tag: 'wool', dtl: wool });
    // wool puffs
    for (let i = 0; i < 22; i++) {
      const a = hs(i) * TAU, e = -0.3 + hs(i + 40) * 1.6, zz = -0.28 + hs(i + 80) * 0.58;
      const x = Math.cos(a) * 0.2 * Math.cos(Math.min(e, 1.2)), y = 0.54 + Math.sin(e) * 0.19;
      S.sph(zz < -0.1 ? 'chest' : zz > 0.15 ? 'hips' : 'body', [x, y, zz], 0.075 + hs(i + 9) * 0.03, { k: 0.05, col: c.wool, tag: 'wool', dtl: wool });
    }
    S.cone('neck', [0, 0.6, -0.3], [0, 0.66, -0.44], 0.1, 0.075, { k: 0.05, col: c.wool, b2: 'head', t0: 0.6, t1: 1, dtl: wool });
    S.ell('head', [0, 0.66, -0.53], [0.06, 0.07, 0.09], { k: 0.03, col: c.face, tag: 'face', dtl: f, cw: 3 });
    S.cone('head', [0, 0.65, -0.56], [0, 0.61, -0.64], 0.05, 0.035, { k: 0.03, col: c.face, tag: 'face', dtl: f, cw: 3 });
    S.sph('head', [0, 0.73, -0.47], 0.065, { k: 0.03, col: c.wool, tag: 'wool', dtl: wool });
    S.sph('tail', [0, 0.6, 0.38], 0.05, { k: 0.03, col: c.wool, tag: 'wool', dtl: wool });
  },
  paint(v, cfg) { if (v.t('wool') > 0.5) v.mul(0.85 + 0.2 * v.ao); },
  parts(acc, S, R, cfg) {
    const b = (n) => R.index(n), c = cfg.pal;
    for (const s of [-1, 1]) {
      const n = s < 0 ? 'L' : 'R';
      addEye(acc, S, b('head'), [s * 0.05, 0.685, -0.56], [s, 0.25, -0.5], 0.013, { iris: 0xc8a050, pupilA: 0.35, irisA: 0.95, seg: 8 });
      ear(acc, b('ear' + n), [s * 0.06, 0.69, -0.47], [-0.3, s * 1.2, -s * 1.5], 0.03, 0.08, 0.012, c.face, 0x8a6a60, 0.4);
      jleg(acc, [b('fU' + n), b('fL' + n), b('fP' + n)], [[s * 0.1, 0.5, -0.22], [s * 0.1, 0.29, -0.17], [s * 0.1, 0.07, -0.22], [s * 0.1, 0.012, -0.25]], [0.04, 0.026, 0.02, 0.024], [c.leg, c.leg, c.leg, 0x141010]);
      jleg(acc, [b('rT' + n), b('rS' + n), b('rM' + n), b('rP' + n)], [[s * 0.1, 0.52, 0.25], [s * 0.1, 0.31, 0.19], [s * 0.1, 0.18, 0.3], [s * 0.1, 0.06, 0.28], [s * 0.1, 0.012, 0.25]], [0.045, 0.03, 0.022, 0.02, 0.024], [c.leg, c.leg, c.leg, c.leg, 0x141010]);
    }
  },
  sockets: { head: ['head', [0, 0.8, -0.48]], mouth: ['jaw', [0, 0.6, -0.6]], chest: ['chest', [0, 0.5, -0.35]] },
  height: 0.85, radius: 0.35,
  controller(inst) { return new QuadCtl(inst, SHEEP_SPEC); },
  actions: ['graze', 'baa', 'flee', 'hit', 'death'],
};
const SHEEP_SPEC = {
  bones: { body: 'body', hips: 'hips', chest: 'chest', neck: 'neck', head: 'head', jaw: 'jaw', tail: ['tail'], ears: ['earL', 'earR'] },
  gait: {
    legs: [
      { id: 'FL', chain: ['fUL', 'fLL', 'fPL'], toe: [-0.1, 0, -0.25], body: 'chest', scap: 0.55, lift: 0.08, flex: 1.0 },
      { id: 'FR', chain: ['fUR', 'fLR', 'fPR'], toe: [0.1, 0, -0.25], body: 'chest', scap: 0.55, lift: 0.08, flex: 1.0 },
      { id: 'RL', chain: ['rTL', 'rSL', 'rML', 'rPL'], toe: [-0.1, 0, 0.24], body: 'hips', scap: 0.3, lift: 0.08, flex: 0.8 },
      { id: 'RR', chain: ['rTR', 'rSR', 'rMR', 'rPR'], toe: [0.1, 0, 0.24], body: 'hips', scap: 0.3, lift: 0.08, flex: 0.8 },
    ],
    maxStride: 0.45,
    gaits: [
      { v: 0.9, f: 1.8, duty: 0.64, lift: 0.8, off: { RL: 0, FL: 0.25, RR: 0.5, FR: 0.75 }, bob: 0.01, bobF: 2, roll: 0.03, rollF: 1, nod: 0.04, nodF: 2 },
      { v: 2.5, f: 2.8, duty: 0.45, lift: 1, off: { FL: 0, RR: 0, FR: 0.5, RL: 0.5 }, bob: 0.03, bobF: 2, roll: 0.02, rollF: 1 },
      { v: 5, f: 3.4, duty: 0.32, lift: 1.2, off: { RL: 0, RR: 0.08, FL: 0.45, FR: 0.55 }, bob: 0.06, bobF: 1, bobPh: 0.6, pitch: 0.1, pitchF: 1 },
    ],
  },
  neck: { pitch: 0, run: -0.1, walk: -0.1 }, tail: { wag: 0.4, wagF: 3 }, breathe: 0.02,
  fidgets: [{ name: 'graze', w: 4 }, { name: 'baa', w: 1 }],
  actions: {
    graze: graze(-0.7, -0.5),
    baa: { dur: 1.2, a: 0.1, d: 0.8, fn(ctl, a, w) { const P = ctl.pose, b = ctl.b, j = bell(a.k); P.rx(b.neck, 0.25 * j * w); P.rx(b.head, 0.3 * j * w); ctl.jaw = Math.max(ctl.jaw, 0.35 * j * w * (0.7 + 0.3 * Math.sin(a.t * 25))); } },
    flee: { dur: 1, hold: true, fadeIn: 0.1, fadeOut: 0.5, fn() {} },
    hit: hitQ, death: deathAction({ lieY: 0.35, roll: 1.4 }),
  },
};

// =====================================================================================================
export const cat = {
  variants: ['ginger', 'grey', 'black', 'calico'],
  config(variant) {
    const P = { ginger: [0xd8843a, 0x9a4a1a, 0xf4e0c8], grey: [0x8a8c90, 0x4a4c52, 0xe8e6e2], black: [0x26262a, 0x121214, 0x3a3a3e], calico: [0xdad6ce, 0x2a2624, 0xd8843a] };
    const v = P[variant] ? variant : 'ginger', p = P[v];
    return { variant: v, pal: { fur: p[0], stripe: p[1], belly: p[2] }, shapeKey: 'base', h: 0.0185, scale: 1, mat: { dfreq: 7 } };
  },
  rig(R) {
    R.add('body', null, [0, 0.25, 0.0]); R.add('hips', 'body', [0, 0.25, 0.12]); R.add('chest', 'body', [0, 0.26, -0.1]);
    R.add('neck', 'chest', [0, 0.3, -0.16]); R.add('head', 'neck', [0, 0.34, -0.21]); R.add('jaw', 'head', [0, 0.31, -0.25]);
    R.add('earL', 'head', [-0.033, 0.38, -0.21]); R.add('earR', 'head', [0.033, 0.38, -0.21]);
    R.add('tail1', 'hips', [0, 0.28, 0.17]); R.add('tail2', 'tail1', [0, 0.35, 0.24]); R.add('tail3', 'tail2', [0, 0.45, 0.27]); R.add('tail4', 'tail3', [0, 0.54, 0.26]);
    for (const s of [-1, 1]) {
      R.add(L2(s, 'fU'), 'chest', [s * 0.045, 0.2, -0.11]); R.add(L2(s, 'fL'), L2(s, 'fU'), [s * 0.045, 0.125, -0.085]); R.add(L2(s, 'fP'), L2(s, 'fL'), [s * 0.045, 0.03, -0.1]);
      R.add(L2(s, 'rT'), 'hips', [s * 0.045, 0.23, 0.12]); R.add(L2(s, 'rS'), L2(s, 'rT'), [s * 0.05, 0.145, 0.075]); R.add(L2(s, 'rM'), L2(s, 'rS'), [s * 0.05, 0.08, 0.15]); R.add(L2(s, 'rP'), L2(s, 'rM'), [s * 0.05, 0.022, 0.14]);
    }
  },
  sculpt(S, cfg) {
    const c = cfg.pal, f = [0.3, 0, 0.1, 0];
    S.ell('body', [0, 0.245, 0.01], [0.055, 0.06, 0.13], { k: 0.035, col: c.fur, tag: 'body', dtl: f });
    S.ell('chest', [0, 0.24, -0.1], [0.05, 0.065, 0.055], { k: 0.03, col: c.fur, tag: 'body', dtl: f });
    S.ell('hips', [0, 0.25, 0.12], [0.05, 0.055, 0.055], { k: 0.03, col: c.fur, tag: 'body', dtl: f });
    S.cone('neck', [0, 0.26, -0.13], [0, 0.33, -0.2], 0.04, 0.032, { k: 0.02, col: c.fur, b2: 'head', dtl: f });
    S.ell('head', [0, 0.34, -0.215], [0.05, 0.043, 0.045], { k: 0.02, col: c.fur, tag: 'head', dtl: f });
    for (const s of [-1, 1]) S.ell('head', [s * 0.018, 0.322, -0.25], [0.018, 0.015, 0.016], { k: 0.012, col: c.belly, tag: 'muzzle', dtl: f });
    for (const s of [-1, 1]) {
      const n = s < 0 ? 'L' : 'R';
      S.cone('fU' + n, [s * 0.045, 0.22, -0.11], [s * 0.045, 0.125, -0.085], 0.025, 0.016, { k: 0.015, col: c.fur, b2: 'fL' + n, t0: 0.8, dtl: f });
      S.cone('fL' + n, [s * 0.045, 0.125, -0.085], [s * 0.045, 0.03, -0.1], 0.015, 0.013, { k: 0.012, col: c.fur, b2: 'fP' + n, t0: 0.85, dtl: f });
      S.ell('fP' + n, [s * 0.045, 0.014, -0.11], [0.016, 0.013, 0.02], { k: 0.01, col: c.belly, tag: 'paw', dtl: f });
      S.ell('rT' + n, [s * 0.045, 0.2, 0.11], [0.03, 0.055, 0.045], { k: 0.02, col: c.fur, rot: [0.3, 0, 0], dtl: f });
      S.cone('rS' + n, [s * 0.05, 0.145, 0.075], [s * 0.05, 0.08, 0.15], 0.018, 0.013, { k: 0.012, col: c.fur, b2: 'rM' + n, t0: 0.85, dtl: f });
      S.cone('rM' + n, [s * 0.05, 0.08, 0.15], [s * 0.05, 0.022, 0.14], 0.013, 0.012, { k: 0.01, col: c.fur, b2: 'rP' + n, t0: 0.8, dtl: f });
      S.ell('rP' + n, [s * 0.05, 0.013, 0.125], [0.016, 0.013, 0.022], { k: 0.01, col: c.belly, tag: 'paw', dtl: f });
    }
    S.cone('tail1', [0, 0.27, 0.15], [0, 0.35, 0.24], 0.016, 0.014, { k: 0.012, col: c.fur, tag: 'tail', b2: 'tail2', dtl: f });
    S.cone('tail2', [0, 0.35, 0.24], [0, 0.45, 0.27], 0.014, 0.013, { k: 0.012, col: c.fur, tag: 'tail', b2: 'tail3', dtl: f });
    S.cone('tail3', [0, 0.45, 0.27], [0, 0.54, 0.26], 0.013, 0.012, { k: 0.012, col: c.fur, tag: 'tail', b2: 'tail4', dtl: f });
    S.cone('tail4', [0, 0.54, 0.26], [0, 0.6, 0.23], 0.012, 0.008, { k: 0.01, col: c.stripe, tag: 'tail', dtl: f });
  },
  paint(v, cfg) {
    const c = cfg.pal, [x, y, z] = v.p, [nx, ny] = v.n;
    v.mix(c.belly, sstep(-0.2, -0.7, ny) * 0.9 + v.t('muzzle') * 0.9);
    if (cfg.variant === 'calico') {
      const blob = Math.sin(x * 40 + 1) * Math.sin(z * 30) * Math.sin(y * 35 + 2);
      v.mix(c.stripe, sstep(0.2, 0.3, blob) * 0.9); v.mix(c.belly, sstep(0.2, 0.3, -blob) * 0.9 * sstep(0, 0.5, ny));
    } else if (cfg.variant !== 'black') { // tabby stripes
      const st = Math.sin(z * 70 + Math.sin(y * 30) * 1.5 + (v.t('tail') > 0.5 ? y * 60 : 0));
      v.mix(c.stripe, sstep(0.55, 0.8, st) * sstep(-0.2, 0.4, ny + Math.abs(nx) * 0.3) * 0.75);
    }
    v.mix(0xc07078, (1 - sstep(0.008, 0.016, Math.hypot(x, v.p[1] - 0.333, z + 0.262))) * 0.9); // nose
  },
  parts(acc, S, R, cfg) {
    const b = (n) => R.index(n), c = cfg.pal;
    for (const s of [-1, 1]) {
      const n = s < 0 ? 'L' : 'R';
      addEye(acc, S, b('head'), [s * 0.021, 0.35, -0.245], [s * 0.45, 0.05, -1], 0.0135, { iris: cfg.variant === 'black' ? 0xf0d020 : 0x9ad040, pupilA: 0.28, irisA: 0.95, seg: 10, irisEmis: 0.25, sink: 0.35 });
      ear(acc, b('ear' + n), [s * 0.03, 0.37, -0.21], [0.1, s * 0.3, -s * 0.3], 0.024, 0.045, 0.01, c.fur, 0xe0a8a0, 0.6);
      for (let i = 0; i < 3; i++) acc.add(sweep([[s * 0.02, 0.325 - i * 0.005, -0.255], [s * 0.08, 0.33 - i * 0.012, -0.24 + i * 0.01]], [0.0015, 0.0008], { radial: 3 }), { skin: rigid(b('head')), color: 0xf4f0e8, dtl: [0, 0, 0, 0] });
    }
  },
  sockets: { head: ['head', [0, 0.4, -0.21]], mouth: ['jaw', [0, 0.31, -0.27]], chest: ['chest', [0, 0.23, -0.14]] },
  height: 0.42, radius: 0.15,
  controller(inst) { return new QuadCtl(inst, CAT_SPEC); },
  actions: ['sit', 'groom', 'stretch', 'flee', 'hit', 'death'],
};
const CAT_SPEC = {
  bones: { body: 'body', hips: 'hips', chest: 'chest', neck: 'neck', head: 'head', jaw: 'jaw', tail: ['tail1', 'tail2', 'tail3', 'tail4'], ears: ['earL', 'earR'] },
  gait: {
    legs: [
      { id: 'FL', chain: ['fUL', 'fLL', 'fPL'], toe: [-0.045, 0, -0.125], body: 'chest', scap: 0.5, lift: 0.04, flex: 1.2, heel: 0.4 },
      { id: 'FR', chain: ['fUR', 'fLR', 'fPR'], toe: [0.045, 0, -0.125], body: 'chest', scap: 0.5, lift: 0.04, flex: 1.2, heel: 0.4 },
      { id: 'RL', chain: ['rTL', 'rSL', 'rML', 'rPL'], toe: [-0.05, 0, 0.105], body: 'hips', scap: 0.45, lift: 0.04, flex: 0.9 },
      { id: 'RR', chain: ['rTR', 'rSR', 'rMR', 'rPR'], toe: [0.05, 0, 0.105], body: 'hips', scap: 0.45, lift: 0.04, flex: 0.9 },
    ],
    maxStride: 0.25,
    gaits: [
      { v: 0.6, f: 2.0, duty: 0.62, lift: 0.8, off: { RL: 0, FL: 0.25, RR: 0.5, FR: 0.75 }, bob: 0.004, bobF: 2, roll: 0.02, rollF: 1 },
      { v: 1.8, f: 3.2, duty: 0.45, lift: 1, off: { FL: 0, RR: 0, FR: 0.5, RL: 0.5 }, bob: 0.008, bobF: 2 },
      { v: 5, f: 5.2, duty: 0.24, lift: 1.3, off: { RL: 0, RR: 0.08, FL: 0.45, FR: 0.55 }, bob: 0.03, bobF: 1, bobPh: 0.6, pitch: 0.12, pitchF: 1, flex: 0.2, flexF: 1, flexPh: 0.2 },
    ],
  },
  neck: { pitch: 0, run: -0.2 }, tail: { wag: 0.25, wagF: 0.7, run: -0.6 }, breathe: 0.02,
  fidgets: [{ name: 'groom', w: 2 }, { name: 'stretch', w: 1 }],
  actions: {
    sit: { dur: 1, hold: true, rest: true, fadeIn: 0.5, fadeOut: 0.3, fn(ctl, a, w) {
      const P = ctl.pose, b = ctl.b;
      P.move(b.body, 0, -0.06 * w, 0.03 * w); P.rx(b.body, 0.75 * w); P.rx(b.neck, -0.35 * w); P.rx(b.head, -0.35 * w);
      for (let i = 0; i < b.tail.length; i++) P.rot(b.tail[i], (i ? -0.3 : 0.9) * w, (i ? 0.5 : 0.3) * w, 0);
      for (const L of ctl.gait.legs) { L.override = L.override || new V3(); if (L.id[0] === 'R') L.override.set(L.toe.x * 1.1, 0, 0.03); else L.override.set(L.toe.x * 0.8, 0, -0.1); L.overrideW = Math.max(L.overrideW, w); }
    } },
    groom: { dur: 3, a: 0.15, d: 0.85, fn(ctl, a, w) { // sit back a little, lift a paw to the mouth and lick it
      const P = ctl.pose, b = ctl.b, t = a.t, L = ctl.gait.legs[0];
      P.move(b.body, 0, -0.03 * w, 0.02 * w); P.rx(b.body, 0.3 * w);
      L.override = L.override || new V3(); L.override.set(L.toe.x * 0.3, 0.2, L.toe.z + 0.03); L.overrideLocal = true; L.overrideW = Math.max(L.overrideW, w); L.overridePaw = -1.6;
      P.rot(b.neck, -0.55 * w, 0.25 * w, 0); P.rot(b.head, (-0.45 + Math.sin(t * 12) * 0.1) * w, 0.35 * w, 0.25 * w);
      ctl.jaw = Math.max(ctl.jaw, (0.1 + 0.1 * Math.sin(t * 12)) * w);
    } },
    stretch: { dur: 2.4, a: 0.25, d: 0.7, fn(ctl, a, w) { const P = ctl.pose, b = ctl.b; P.move(b.body, 0, -0.03 * w, 0); P.rx(b.body, -0.35 * w); P.rx(b.chest, -0.1 * w); P.rx(b.head, 0.4 * w); ctl.jaw = Math.max(ctl.jaw, 0.4 * w * bell(a.k)); } },
    flee: { dur: 1, hold: true, fadeIn: 0.1, fadeOut: 0.5, fn(ctl, a, w) { ctl.ear = mix(ctl.ear, 1.2, w); ctl.hackle = w; } },
    hit: hitQ, death: deathAction({ lieY: 0.18, roll: 1.4 }),
  },
};
