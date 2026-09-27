// Gurgler: squat amphibian fish-man (original design): pear body, huge frog mouth + throat pouch, bulging eyes,
// axolotl-style gill fronds, sail crest, webbed 3-finger hands & flipper feet, crude spear (or a fishing net).
import * as THREE from 'three';
import { BipedCtl, armRot, bipedDeath } from './biped.js';
import { sweep, rigid, bez, taper, leafGeo } from './geo.js';
import { col } from './sdf.js';
import { addEye, lerp3 } from './parts.js';
import { sstep, mix, TAU } from './rig.js';

const PAL = {
  marsh: { back: 0x2e8a78, dark: 0x185248, belly: 0xece0a0, fin: 0xf0684c, finDark: 0xa0302a, lip: 0x3c7060, eye: 0xf6d63a, spot: 0x1a5a4a },
  reef: { back: 0x3a64b4, dark: 0x1e3470, belly: 0xf0dcb0, fin: 0xffa030, finDark: 0xc05a10, lip: 0x34508a, eye: 0xfff070, spot: 0x22407e },
  mud: { back: 0x6a7a36, dark: 0x3a4418, belly: 0xd8c890, fin: 0xb05ac8, finDark: 0x6a2a80, lip: 0x505a28, eye: 0xf0a030, spot: 0x3e4a1a },
  tidecaller: { back: 0x1f7a8c, dark: 0x0e3c48, belly: 0xf4e8b8, fin: 0xff4a6a, finDark: 0xa01838, lip: 0x1e5a68, eye: 0x9ffcff, spot: 0x0e4854, gold: 0xf0c040 },
};

export const gurgler = {
  variants: ['marsh', 'reef', 'mud', 'tidecaller'],
  config(variant, opts) {
    const v = PAL[variant] ? variant : (opts.elite ? 'tidecaller' : 'marsh');
    const weapon = opts.weapon ?? (v === 'mud' ? 'net' : 'spear');
    return { variant: v, pal: PAL[v], elite: v === 'tidecaller' || !!opts.elite, weapon, key: weapon, shapeKey: 'base', scale: v === 'tidecaller' ? 1.4 : 1, h: 0.0275, hg: { 2: 0.017, 3: 0.019 }, mat: { dfreq: 4.2, furAxis: 1 } };
  },
  rig(R) {
    R.add('hips', null, [0, 0.42, 0.02]);
    R.add('spine', 'hips', [0, 0.56, 0.0]);
    R.add('chest', 'spine', [0, 0.72, -0.02]);
    R.add('head', 'chest', [0, 0.88, -0.05]);
    R.add('jaw', 'head', [0, 0.85, -0.04]);
    R.add('throat', 'chest', [0, 0.74, -0.14]);
    R.add('crest', 'head', [0, 1.06, 0.0]);
    R.add('gillL', 'head', [-0.19, 0.95, 0.0]); R.add('gillR', 'head', [0.19, 0.95, 0.0]);
    R.add('tail', 'hips', [0, 0.38, 0.18]);
    for (const s of [-1, 1]) {
      const n = s < 0 ? 'L' : 'R';
      R.add('armU' + n, 'chest', [s * 0.22, 0.78, -0.02]); R.add('armL' + n, 'armU' + n, [s * 0.31, 0.57, -0.04]); R.add('hand' + n, 'armL' + n, [s * 0.34, 0.41, -0.09]);
      R.add('thigh' + n, 'hips', [s * 0.13, 0.38, 0.02]); R.add('shin' + n, 'thigh' + n, [s * 0.17, 0.22, -0.05]); R.add('foot' + n, 'shin' + n, [s * 0.18, 0.075, 0.02]);
    }
  },
  sculpt(S, cfg) {
    const c = cfg.pal;
    const sk = [0, 0.2, 0.18, 0], skS = [0, 0.12, 0.15, 0];
    S.ell('spine', [0, 0.53, 0.0], [0.25, 0.25, 0.23], { k: 0.08, col: c.back, tag: 'body', b2: 'chest', t0: 0.6, t1: 1, dtl: sk });
    S.ell('hips', [0, 0.42, 0.04], [0.2, 0.14, 0.18], { k: 0.08, col: c.back, tag: 'body', dtl: sk });
    S.ell('chest', [0, 0.72, -0.03], [0.24, 0.2, 0.21], { k: 0.08, col: c.back, tag: 'body', dtl: sk });
    S.ell('head', [0, 0.9, -0.08], [0.23, 0.15, 0.2], { k: 0.07, col: c.back, tag: 'head', dtl: sk });
    S.ell('head', [0, 0.875, -0.22], [0.2, 0.065, 0.1], { k: 0.05, col: c.lip, tag: 'lip', dtl: skS });
    for (const s of [-1, 1]) S.ell('head', [s * 0.1, 1.0, -0.15], [0.07, 0.07, 0.07], { k: 0.05, col: c.back, tag: 'eyemound', dtl: sk });
    S.ell('head', [0, 0.842, -0.2], [0.19, 0.016, 0.12], { k: 0.012, sub: true, col: 0x3a0e18, tag: 'mouth' });
    S.ell('throat', [0, 0.745, -0.14], [0.16, 0.095, 0.1], { k: 0.06, col: c.belly, tag: 'throat', dtl: skS });
    // lower jaw (separate surface)
    S.ell('jaw', [0, 0.8, -0.19], [0.195, 0.055, 0.13], { group: 1, k: 0.04, col: c.lip, tag: 'jaw', dtl: skS });
    S.ell('jaw', [0, 0.77, -0.14], [0.15, 0.05, 0.1], { group: 1, k: 0.04, col: c.belly, tag: 'chin', dtl: skS });
    // arms
    for (const s of [-1, 1]) {
      const n = s < 0 ? 'L' : 'R';
      S.sph('armU' + n, [s * 0.21, 0.76, -0.02], 0.07, { k: 0.05, col: c.back, dtl: sk });
      S.cone('armU' + n, [s * 0.22, 0.78, -0.02], [s * 0.31, 0.57, -0.04], 0.052, 0.042, { k: 0.04, col: c.back, b2: 'armL' + n, t0: 0.8, t1: 1, dtl: sk });
      S.cone('armL' + n, [s * 0.31, 0.57, -0.04], [s * 0.34, 0.42, -0.09], 0.042, 0.036, { k: 0.035, col: c.back, tag: 'arm', b2: 'hand' + n, t0: 0.85, t1: 1, dtl: sk });
      // legs: fat thighs, bowed
      S.cone('thigh' + n, [s * 0.13, 0.38, 0.02], [s * 0.17, 0.22, -0.05], 0.085, 0.062, { k: 0.05, col: c.back, b2: 'shin' + n, t0: 0.8, t1: 1, dtl: sk });
      S.cone('shin' + n, [s * 0.17, 0.22, -0.05], [s * 0.18, 0.085, 0.02], 0.058, 0.044, { k: 0.04, col: c.back, tag: 'leg', b2: 'foot' + n, t0: 0.85, t1: 1, dtl: sk });
      // hands: palm + 3 webbed fingers (fine group)
      const hx = s * 0.35, hy = 0.37, hz = -0.105;
      S.ell('hand' + n, [hx, hy, hz], [0.04, 0.055, 0.035], { group: 2, k: 0.02, col: c.back, tag: 'hand', dtl: skS });
      for (let f = -1; f <= 1; f++) {
        const fx = hx + s * 0.005 + f * 0.024, fz = hz - 0.01 + Math.abs(f) * 0.008;
        S.cone('hand' + n, [fx, hy - 0.03, fz], [fx + f * 0.012, hy - 0.11 + Math.abs(f) * 0.015, fz - 0.035], 0.017, 0.011, { group: 2, k: 0.022, col: c.back, tip: { col: c.dark, from: 0.7 }, tag: 'finger', dtl: skS });
      }
      S.cone('hand' + n, [hx - s * 0.03, hy, hz - 0.02], [hx - s * 0.05, hy - 0.05, hz - 0.06], 0.016, 0.011, { group: 2, k: 0.02, col: c.back, tag: 'finger', dtl: skS });
      // flipper feet: 3 splayed toes + heel, webbed by blending (fine group)
      const fx0 = s * 0.18;
      S.ell('foot' + n, [fx0, 0.055, 0.02], [0.05, 0.045, 0.06], { group: 3, k: 0.03, col: c.back, tag: 'foot', dtl: skS });
      for (let f = -1; f <= 1; f++) {
        S.cone('foot' + n, [fx0 + f * 0.018, 0.04, -0.01], [fx0 + f * 0.06 + s * 0.015, 0.018, -0.19 + Math.abs(f) * 0.02], 0.028, 0.017, { group: 3, k: 0.045, col: c.back, tip: { col: c.fin, from: 0.55 }, tag: 'toe', dtl: skS });
      }
    }
    S.cone('tail', [0, 0.38, 0.16], [0, 0.29, 0.32], 0.07, 0.02, { k: 0.05, col: c.back, tag: 'tail', dtl: sk });
  },
  paint(v, cfg) {
    const c = cfg.pal, [x, y, z] = v.p, [nx, ny, nz] = v.n;
    const g = v.group;
    // big pale belly from throat to crotch
    if (g === 0) {
      const front = sstep(0.05, 0.5, -nz) * sstep(0.2, 0.34, y) * (1 - sstep(0.76, 0.84, y)) * (1 - sstep(0.12, 0.22, Math.abs(x) - (-nz) * 0.05));
      v.mix(c.belly, Math.max(front * 0.95, v.t('throat')) * (1 - v.t('arm')));
      // spots on back and head
      const sp = Math.sin(x * 31 + Math.sin(y * 13) * 2) * Math.sin(y * 27 + z * 19) * Math.sin(z * 23 + x * 7);
      v.mix(c.spot, sstep(0.25, 0.4, sp) * sstep(-0.2, 0.3, nz + ny * 0.5) * (1 - front) * 0.8);
      // darker top of head & back ridge
      v.mix(c.dark, sstep(0.5, 0.95, ny) * sstep(0.9, 1.05, y) * 0.35);
      v.mix(0x5a1020, v.t('mouth') * 0.9);
      v.mix(c.lip, v.t('lip') * sstep(-0.2, -0.7, ny) * 0.5);
    }
    if (g === 1) { v.mix(0x7a2030, sstep(0.3, 0.7, ny) * (z < -0.12 ? 1 : 0) * 0.8); }
    if (g === 2 || g === 3) v.mix(c.belly, sstep(-0.3, -0.8, ny) * 0.4);
    v.mul(1 + Math.sin(x * 13 + z * 9) * Math.sin(y * 11) * 0.05);
  },
  parts(acc, S, R, cfg) {
    const c = cfg.pal, b = (n) => R.index(n);
    // big bulging eyes on top
    for (const s of [-1, 1]) addEye(acc, S, b('head'), [s * 0.11, 1.02, -0.19], [s * 0.45, 0.35, -1], 0.052, { iris: c.eye, pupil: 0x080606, rim: 0x14201c, pupilA: 0.42, irisA: 0.95, sink: 0.35, glow: cfg.elite ? 1.1 : 0, seg: 14 });
    // gill fronds: 3 stalks per side with fringes
    const fc = col(c.fin), fd = col(c.finDark);
    for (const s of [-1, 1]) {
      const bone = b(s < 0 ? 'gillL' : 'gillR');
      for (let i = 0; i < 3; i++) {
        const a = -0.55 + i * 0.55;
        const base = [s * 0.19, 0.95 + i * 0.02 - 0.02, -0.02 + i * 0.03];
        const dir = [s * Math.cos(a) * 0.8, 0.45 + Math.sin(a) * 0.55, 0.35 + i * 0.12];
        const L = 0.2 - Math.abs(i - 1) * 0.03;
        const pts = bez(base, [base[0] + dir[0] * L * 0.5, base[1] + dir[1] * L * 0.5 + 0.02, base[2] + dir[2] * L * 0.5], [base[0] + dir[0] * L, base[1] + dir[1] * L - 0.02, base[2] + dir[2] * L], 5);
        acc.add(sweep(pts, taper(5, 0.02, 0.007), { radial: 6 }), { skin: rigid(bone), dtl: [0, 0.2, 0.1, 0], color: (p, n, uv) => lerp3(fd, fc, uv[1]) });
        for (let k = 1; k < 5; k++) for (const side of [-1, 1]) { // feathery fringe
          const p = pts[k], q = new THREE.Vector3(side * 0.02, 0.03, side * -0.015 + 0.01).add(p);
          acc.add(sweep([p, q], [0.008, 0.002], { radial: 3 }), { skin: rigid(bone), color: c.fin, dtl: [0, 0, 0, 0] });
        }
      }
    }
    // sail crest over the head & down the back (membrane with dark rays)
    const crest = (bone, pos, W, H, rotX, rotY = 0) => {
      const g = leafGeo(W, H, 0.014, 0.1, -0.2, { nu: 7, nv: 5, pw: 0.7 });
      const m = new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(rotX, Math.PI / 2 + rotY, 0, 'YXZ')); m.setPosition(...pos);
      acc.add(g, { matrix: m, skin: rigid(b(bone)), dtl: [0, 0.1, 0.1, 0], color: (p, n, uv) => { const u = (uv[0] % 1) * 2, ray = Math.abs(Math.sin(u * 7)) > 0.8 ? 1 : 0; return lerp3(lerp3(fc, fd, ray * 0.7), fd, sstep(0.6, 1, uv[1]) * 0.5); } });
    };
    crest('crest', [0, 1.02, -0.03], 0.13, 0.16, -0.25);
    crest('chest', [0, 0.88, 0.13], 0.1, 0.12, -0.75);
    // teeth along the lips
    const tc = col(0xf4f0e0);
    for (let i = 0; i < 7; i++) {
      const a = -0.9 + i * 0.3, x = Math.sin(a) * 0.17, z = -0.2 - Math.cos(a) * 0.1;
      acc.add(sweep([[x, 0.842, z], [x * 1.01, 0.815, z - 0.005]], [0.009, 0.001], { radial: 4 }), { skin: rigid(b('head')), color: tc, dtl: [0, 0, 0, 0] });
      if (i % 2) acc.add(sweep([[x * 0.95, 0.83, z + 0.01], [x * 0.95, 0.852, z + 0.005]], [0.008, 0.001], { radial: 4 }), { skin: rigid(b('jaw')), color: tc, dtl: [0, 0, 0, 0] });
    }
    // claws on fingers/toes
    for (const s of [-1, 1]) {
      const n = s < 0 ? 'L' : 'R';
      for (let f = -1; f <= 1; f++) {
        const fx = s * 0.18 + f * 0.06 + s * 0.015;
        acc.add(sweep([[fx, 0.02, -0.2 + Math.abs(f) * 0.02], [fx, 0.01, -0.235 + Math.abs(f) * 0.02]], [0.008, 0.002], { radial: 4 }), { skin: rigid(b('foot' + n)), color: 0x1a1414, dtl: [0, 0, 0, 0] });
      }
    }
    // weapon in the right hand
    const hand = b('handR'), H = new THREE.Vector3(0.35, 0.37, -0.12);
    const wood = col(0x7a5530), woodD = col(0x4a3018);
    if (cfg.weapon === 'spear') {
      const dir = new THREE.Vector3(0.16, 1, -0.3).normalize();
      const a = H.clone().addScaledVector(dir, -0.42), e = H.clone().addScaledVector(dir, 0.95);
      acc.add(sweep([a, H, e], [0.017, 0.018, 0.015], { radial: 6, capStart: true }), { skin: rigid(hand), dtl: [0, 0, 0.1, 0.5], color: (p, n, uv) => lerp3(woodD, wood, 0.5 + 0.5 * Math.sin(uv[1] * 40) * 0.3) });
      // knapped stone / fishbone tip
      const tipBase = e.clone(), tipEnd = e.clone().addScaledVector(dir, 0.26);
      const tip = sweep([tipBase, tipBase.clone().addScaledVector(dir, 0.08), tipEnd], [0.03, 0.05, 0.002], { radial: 4, flat: 0.35, up: [1, 0, 0] });
      acc.add(tip, { skin: rigid(hand), dtl: [0, 0, 0.3, 0], color: cfg.elite ? c.gold : 0xb8b4a6 });
      // rope lashing
      for (let i = 0; i < 3; i++) {
        const r = new THREE.TorusGeometry(0.02, 0.006, 4, 8), p = e.clone().addScaledVector(dir, -0.02 - i * 0.018);
        const m = new THREE.Matrix4().makeRotationFromQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), dir)); m.setPosition(p.x, p.y, p.z);
        acc.add(r, { matrix: m, skin: rigid(hand), color: 0xc8b078, dtl: [0, 0, 0, 0.4] });
      }
      // dangling feathers
      const fp = e.clone().addScaledVector(dir, -0.05);
      acc.add(sweep([fp, fp.clone().add(new THREE.Vector3(0.05, -0.12, 0.02))], [0.012, 0.002], { radial: 3, flat: 0.3 }), { skin: rigid(hand), color: c.fin, dtl: [0, 0, 0, 0] });
    } else {
      // fishing net: pole + hoop + sagging mesh bag + cork floats
      const dir = new THREE.Vector3(0.1, 1, -0.35).normalize();
      const a = H.clone().addScaledVector(dir, -0.3), e = H.clone().addScaledVector(dir, 0.75);
      acc.add(sweep([a, H, e], [0.016, 0.017, 0.015], { radial: 6, capStart: true }), { skin: rigid(hand), dtl: [0, 0, 0.1, 0.5], color: wood });
      const hoopC = e.clone().addScaledVector(dir, 0.16), R0 = 0.16;
      const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), dir);
      const ring = new THREE.TorusGeometry(R0, 0.01, 4, 16);
      const m = new THREE.Matrix4().makeRotationFromQuaternion(q); m.setPosition(hoopC.x, hoopC.y, hoopC.z);
      acc.add(ring, { matrix: m, skin: rigid(hand), color: woodD, dtl: [0, 0, 0, 0.3] });
      const side = new THREE.Vector3(1, 0, 0).applyQuaternion(q), up2 = new THREE.Vector3(0, 1, 0).applyQuaternion(q);
      const bagDir = new THREE.Vector3(0, -1, 0.3).normalize();
      const netc = col(0xd8cca8);
      for (let i = 0; i < 8; i++) { // meridians sagging down
        const an = i / 8 * TAU;
        const r0 = hoopC.clone().addScaledVector(side, Math.cos(an) * R0).addScaledVector(up2, Math.sin(an) * R0);
        const bottom = hoopC.clone().addScaledVector(bagDir, 0.26);
        const mid = r0.clone().lerp(bottom, 0.5).addScaledVector(bagDir, 0.06);
        acc.add(sweep(bez(r0.toArray(), mid.toArray(), bottom.toArray(), 5), [0.004, 0.004, 0.004, 0.004, 0.004], { radial: 3 }), { skin: rigid(hand), color: netc, dtl: [0, 0, 0, 0] });
      }
      for (let j = 1; j <= 2; j++) { // rings
        const pts = [];
        for (let i = 0; i <= 12; i++) {
          const an = i / 12 * TAU, f = j / 3;
          const r0 = hoopC.clone().addScaledVector(side, Math.cos(an) * R0 * (1 - f * 0.7)).addScaledVector(up2, Math.sin(an) * R0 * (1 - f * 0.7)).addScaledVector(bagDir, 0.26 * f + 0.05 * Math.sin(f * Math.PI));
          pts.push(r0);
        }
        acc.add(sweep(pts, pts.map(() => 0.004), { radial: 3 }), { skin: rigid(hand), color: netc, dtl: [0, 0, 0, 0] });
      }
      for (let i = 0; i < 4; i++) { // cork floats on the hoop
        const an = i / 4 * TAU + 0.4, p = hoopC.clone().addScaledVector(side, Math.cos(an) * R0).addScaledVector(up2, Math.sin(an) * R0);
        acc.add(new THREE.SphereGeometry(0.022, 6, 4), { matrix: new THREE.Matrix4().makeTranslation(p.x, p.y, p.z), skin: rigid(hand), color: 0xc05a30, dtl: [0, 0, 0.2, 0] });
      }
    }
    if (cfg.elite) { // shell necklace with gold beads
      for (let i = 0; i < 9; i++) {
        const a = -1.2 + i * 0.3, p = [Math.sin(a) * 0.21, 0.79 - Math.cos(a) * 0.02, -0.03 - Math.cos(a) * 0.17];
        acc.add(new THREE.SphereGeometry(i % 2 ? 0.02 : 0.028, 6, 4), { matrix: new THREE.Matrix4().makeTranslation(...p), skin: rigid(b('chest')), color: i % 2 ? c.gold : 0xf0e0d0, dtl: [0, 0, 0.1, 0] });
      }
    }
  },
  sockets: { mouth: ['jaw', [0, 0.82, -0.3]], head: ['head', [0, 1.12, -0.05]], chest: ['chest', [0, 0.72, -0.2]], handR: ['handR', [0.35, 0.37, -0.12]], handL: ['handL', [-0.35, 0.37, -0.12]], back: ['chest', [0, 0.8, 0.2]] },
  height: 1.15, radius: 0.4,
  controller(inst) { return new BipedCtl(inst, GURGLER_SPEC); },
  actions: ['attack', 'throw', 'gurgle', 'hit', 'death', 'cheer'],
};

const GURGLER_SPEC = {
  bones: { hips: 'hips', spine: 'spine', chest: 'chest', head: 'head', jaw: 'jaw', tail: ['tail'], armL: ['armUL', 'armLL', 'handL'], armR: ['armUR', 'armLR', 'handR'] },
  gait: {
    legs: [
      { id: 'L', chain: ['thighL', 'shinL', 'footL'], toe: [-0.2, 0, -0.18], body: 'hips', scap: 0.35, lift: 0.1, flex: 0.5, heel: 0.35, out: 0.35 },
      { id: 'R', chain: ['thighR', 'shinR', 'footR'], toe: [0.2, 0, -0.18], body: 'hips', scap: 0.35, lift: 0.1, flex: 0.5, heel: 0.35, out: 0.35 },
    ],
    maxStride: 0.45, fMin: 0.7,
    gaits: [
      { v: 1.1, f: 2.1, duty: 0.6, lift: 0.8, off: { L: 0, R: 0.5 }, bob: 0.02, bobF: 2, bobPh: 0.1, roll: 0.13, rollF: 1, rollPh: 0.25, sway: 0.035, swayF: 1, swayPh: 0.25, nod: 0.04, nodF: 2 },
      { v: 4.2, f: 3.9, duty: 0.34, lift: 1.2, off: { L: 0, R: 0.5 }, bob: 0.035, bobF: 2, bobPh: 0.3, roll: 0.09, rollF: 1, rollPh: 0.25, sway: 0.02, swayF: 1, swayPh: 0.25, nod: 0.05, nodF: 2 },
    ],
  },
  arm: { weaponSwing: 0.35, swing: 0.35, out: 0.3, elbow: 0.35, runSwing: 0.7, runOut: 0.35, runElbow: 0.5, combatUp: 0.3, combatElbow: 0.5 },
  lean: { walk: 0.05, run: 0.35, combat: 0.1 }, twist: 0.1, waddle: 0.06, crouch: 0.04, breathe: 0.03,
  fidgets: [{ name: 'gurgle', w: 3 }, { name: 'cheer', w: 1 }],
  pose(ctl) {
    const P = ctl.pose, B = P.b, t = ctl.t;
    // gill fronds sway, crest flutters; spear arm holds the weapon upright
    const run = ctl.run;
    P.rot(B.gillL, Math.sin(t * 3.1) * 0.12 + run * 0.4, Math.sin(t * 2.3) * 0.15, -0.1 * Math.sin(t * 4.1));
    P.rot(B.gillR, Math.sin(t * 3.1 + 1) * 0.12 + run * 0.4, -Math.sin(t * 2.3 + 1) * 0.15, 0.1 * Math.sin(t * 4.1 + 1));
    P.rx(B.crest, Math.sin(t * 2.5) * 0.06 - run * 0.2);
    P.rx(ctl.b.armR[0], -0.15); P.rx(ctl.b.armR[1], 0.2);
    ctl.jaw += 0.06 * run + 0.03 * Math.sin(t * 1.7) ** 8;
  },
  actions: {
    attack: { dur: 0.75, a: 0.1, d: 0.8, fn(ctl, a, w) { // spear jab: draw back, lunge & thrust
      const P = ctl.pose, b = ctl.b, k = a.k;
      const draw = sstep(0, 0.3, k) * (1 - sstep(0.32, 0.45, k));
      const jab = sstep(0.32, 0.45, k) * (1 - sstep(0.6, 1, k));
      P.move(b.hips, 0, -0.03 * draw * w, (0.04 * draw - 0.12 * jab) * w);
      P.rot(b.spine, (0.05 * draw - 0.2 * jab) * w, (0.35 * draw - 0.25 * jab) * w, 0);
      P.rot(b.chest, -0.1 * jab * w, (0.2 * draw - 0.2 * jab) * w, 0);
      armRot(ctl, 1, 0.2 * draw + 1.45 * jab, 0.9 * draw - 0.1 * jab, w, 0.2 * draw, 0);
      armRot(ctl, -1, 0.4 * jab, 0.6, w, 0.2);
      ctl.jaw = Math.max(ctl.jaw, (0.2 * draw + 0.5 * jab) * w);
    } },
    throw: { dur: 1.0, a: 0.1, d: 0.8, fn(ctl, a, w) { // overhead net cast
      const P = ctl.pose, b = ctl.b, k = a.k;
      const up = sstep(0, 0.4, k) * (1 - sstep(0.42, 0.55, k)), cast = sstep(0.42, 0.55, k) * (1 - sstep(0.7, 1, k));
      P.rot(b.spine, (0.2 * up - 0.3 * cast) * w, (0.3 * up - 0.3 * cast) * w, 0);
      armRot(ctl, 1, 2.6 * up + 1.3 * cast, 0.6 * up, w, 0.2);
      ctl.jaw = Math.max(ctl.jaw, 0.5 * cast * w);
    } },
    gurgle: { dur: 1.8, a: 0.12, d: 0.85, fn(ctl, a, w) { // the signature mrrgl: flappy jaw, pouch pumps, head wobble, arms up
      const P = ctl.pose, b = ctl.b, t = a.t, B = P.b;
      const flap = 0.5 + 0.5 * Math.sin(t * 34);
      ctl.jaw = Math.max(ctl.jaw, (0.12 + 0.4 * flap) * w);
      P.sc[B.throat].setScalar(1 + (0.25 + 0.2 * Math.sin(t * 17)) * w);
      P.rot(b.head, (0.25 + 0.05 * Math.sin(t * 17)) * w, Math.sin(t * 9) * 0.25 * w, Math.sin(t * 7) * 0.15 * w);
      P.rot(b.chest, 0.06 * w, 0, Math.sin(t * 9) * 0.06 * w);
      armRot(ctl, -1, 1.2 + 0.3 * Math.sin(t * 17), 1.0, w, 0.5);
      armRot(ctl, 1, 0.4 + 0.2 * Math.sin(t * 17 + 1), 0.6, w, 0.4);
    } },
    cheer: { dur: 1.4, a: 0.15, d: 0.8, fn(ctl, a, w) { // hop & wave arms
      const P = ctl.pose, b = ctl.b, t = a.t;
      const hop = Math.abs(Math.sin(t * 9)) * 0.06;
      P.move(b.hips, 0, hop * w, 0);
      armRot(ctl, -1, 2.6 + Math.sin(t * 18) * 0.3, 0.3, w, 0.4);
      armRot(ctl, 1, 2.2 + Math.sin(t * 18 + 2) * 0.3, 0.3, w, 0.3);
      ctl.jaw = Math.max(ctl.jaw, 0.4 * w * (0.5 + 0.5 * Math.sin(t * 25)));
    } },
    hit: { dur: 0.4, a: 0.1, d: 0.5, fn(ctl, a, w) {
      const P = ctl.pose, b = ctl.b, j = Math.sin(a.k * Math.PI) * w;
      P.move(b.hips, 0, 0, 0.05 * j); P.rot(b.spine, 0.25 * j, 0, 0.1 * j * Math.sign(Math.sin(a.seed)));
      P.rx(b.head, 0.3 * j); armRot(ctl, -1, 0.6, 0.8, j, 0.6); ctl.jaw = Math.max(ctl.jaw, 0.4 * j);
    } },
    death: bipedDeath({ back: 1, lie: 0.3 }),
  },
};
