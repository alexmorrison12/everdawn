// Race/sex body definitions and the sculpted (SDF) base mesh: body zone + head zone + hand zones.
// Output is cached per race+sex: bind joints, neutral-frame rotations, and skinned "pieces".
import { SDF, ADD, SUB, rotEuler, rotAlign, mulR, surfaceNets, sdfAO, norm3, refineVerts } from './sdf.js';
import { BONES, B, NB, PARENTS, BONE_CHAIN, CH_TORSO, CH_ARM_L, CH_ARM_R, CH_LEG_L, CH_LEG_R, CH_HEAD, CH_HAND_L, CH_HAND_R } from './rig.js';
import { buildHeadPrims, HEAD_DEFS, faceMapping } from './head.js';
import { SLOT } from './palette.js';
import { simplify } from './simplify.js';

// ------------------------------------------------------------------------------------------------
// Parameters (metres). Girth arrays are ellipsoid radii [x, y, z] or cone radii [start, end].
const HUMAN_M = {
  ankleH: 0.09, shin: 0.42, thigh: 0.43, hipW: 0.1, legS: 0.07,
  pelvisUp: 0.055, spine: 0.13, chest: 0.16, neckBase: 0.26, neckLen: 0.08, headFwd: 0.0, hunch: 0,
  shX: 0.228, shY: 0.2, shZ: 0.012, clavX: 0.03, clavY: 0.21, clavZ: -0.025,
  uarm: 0.28, farm: 0.26, armA: 0.66,
  core: [0.15, 0.2, 0.7], // torso core cone radii (hips, chest) + depth squash
  pelvis: [0.155, 0.1, 0.11], glute: [0.08, 0.09, 0.075], belly: [0.14, 0.12, 0.115], ribs: [0.19, 0.19, 0.138],
  pec: [0.098, 0.07, 0.056], bust: null, lat: [0.09, 0.14, 0.085], back: [0.17, 0.11, 0.07],
  trap: 0.066, neckR: 0.06, delt: [0.09, 0.092, 0.09],
  uarmR: [0.07, 0.056], bicep: [0.058, 0.1, 0.057], farmR: [0.062, 0.045], farmBulge: [0.07, 0.1, 0.06],
  thighR: [0.1, 0.066], quad: [0.08, 0.16, 0.072], calf: [0.066, 0.11, 0.066], shinR: [0.058, 0.046],
  foot: [0.064, 0.05, 0.14], hand: 1.3, tk: 0.085,
  radius: 0.45,
};
const RAW = {
  human_m: HUMAN_M,
  human_f: {
    ...HUMAN_M, ankleH: 0.085, shin: 0.43, thigh: 0.44, hipW: 0.1, legS: 0.055, pelvisUp: 0.05, spine: 0.12, chest: 0.14,
    neckBase: 0.232, neckLen: 0.085, shX: 0.172, shY: 0.19, clavX: 0.025, clavY: 0.195, uarm: 0.25, farm: 0.23, armA: 0.6,
    core: [0.14, 0.14, 0.72],
    pelvis: [0.16, 0.105, 0.11], glute: [0.09, 0.098, 0.084], belly: [0.11, 0.11, 0.09], ribs: [0.135, 0.16, 0.108],
    pec: null, bust: [0.064, 0.06, 0.058], lat: [0.06, 0.11, 0.064], back: [0.12, 0.08, 0.055],
    trap: 0.042, neckR: 0.045, delt: [0.058, 0.062, 0.058],
    uarmR: [0.047, 0.037], bicep: [0.038, 0.09, 0.038], farmR: [0.041, 0.03], farmBulge: [0.045, 0.09, 0.04],
    thighR: [0.098, 0.056], quad: [0.072, 0.15, 0.064], calf: [0.056, 0.1, 0.056], shinR: [0.048, 0.036],
    foot: [0.05, 0.04, 0.115], hand: 1.08, tk: 0.08, radius: 0.38,
  },
  dwarf_m: {
    ...HUMAN_M, ankleH: 0.08, shin: 0.23, thigh: 0.24, hipW: 0.11, legS: 0.08, pelvisUp: 0.05, spine: 0.13, chest: 0.14,
    neckBase: 0.2, neckLen: 0.06, headFwd: 0.02, shX: 0.25, shY: 0.175, clavY: 0.18, uarm: 0.23, farm: 0.21, armA: 0.74,
    core: [0.18, 0.22, 0.8],
    pelvis: [0.18, 0.11, 0.14], glute: [0.09, 0.09, 0.08], belly: [0.19, 0.15, 0.17], ribs: [0.215, 0.18, 0.17],
    pec: [0.105, 0.072, 0.064], lat: [0.1, 0.12, 0.095], back: [0.19, 0.11, 0.085],
    trap: 0.078, neckR: 0.075, delt: [0.098, 0.096, 0.096],
    uarmR: [0.078, 0.066], bicep: [0.068, 0.09, 0.066], farmR: [0.07, 0.054], farmBulge: [0.078, 0.09, 0.068],
    thighR: [0.11, 0.078], quad: [0.09, 0.11, 0.08], calf: [0.074, 0.085, 0.074], shinR: [0.072, 0.058],
    foot: [0.07, 0.054, 0.135], hand: 1.3, tk: 0.1, radius: 0.48,
  },
  dwarf_f: {
    ...HUMAN_M, ankleH: 0.075, shin: 0.22, thigh: 0.23, hipW: 0.105, legS: 0.07, pelvisUp: 0.05, spine: 0.12, chest: 0.13,
    neckBase: 0.19, neckLen: 0.07, headFwd: 0.01, shX: 0.2, shY: 0.17, clavY: 0.17, uarm: 0.2, farm: 0.185, armA: 0.68,
    core: [0.17, 0.17, 0.8],
    pelvis: [0.175, 0.11, 0.13], glute: [0.095, 0.095, 0.085], belly: [0.16, 0.13, 0.14], ribs: [0.17, 0.16, 0.135],
    pec: null, bust: [0.074, 0.066, 0.066], lat: [0.08, 0.1, 0.08], back: [0.155, 0.09, 0.07],
    trap: 0.058, neckR: 0.058, delt: [0.072, 0.072, 0.072],
    uarmR: [0.06, 0.05], bicep: [0.05, 0.08, 0.05], farmR: [0.054, 0.042], farmBulge: [0.06, 0.08, 0.054],
    thighR: [0.105, 0.07], quad: [0.084, 0.1, 0.074], calf: [0.066, 0.08, 0.066], shinR: [0.062, 0.05],
    foot: [0.06, 0.046, 0.115], hand: 1.12, tk: 0.1, radius: 0.44,
  },
  orc_m: {
    ...HUMAN_M, ankleH: 0.095, shin: 0.45, thigh: 0.46, hipW: 0.12, legS: 0.08, pelvisUp: 0.06, spine: 0.14, chest: 0.17,
    neckBase: 0.28, neckLen: 0.07, headFwd: 0.075, hunch: 0.34, shX: 0.285, shY: 0.2, shZ: 0.03, clavX: 0.035, clavY: 0.21,
    uarm: 0.33, farm: 0.31, armA: 0.76,
    core: [0.17, 0.24, 0.72],
    pelvis: [0.175, 0.11, 0.125], glute: [0.092, 0.1, 0.086], belly: [0.17, 0.14, 0.14], ribs: [0.23, 0.23, 0.17],
    pec: [0.12, 0.084, 0.07], lat: [0.12, 0.17, 0.105], back: [0.22, 0.14, 0.1],
    trap: 0.11, neckR: 0.082, delt: [0.115, 0.115, 0.112],
    uarmR: [0.086, 0.07], bicep: [0.074, 0.12, 0.07], farmR: [0.078, 0.058], farmBulge: [0.087, 0.12, 0.074],
    thighR: [0.118, 0.08], quad: [0.095, 0.18, 0.085], calf: [0.08, 0.13, 0.08], shinR: [0.072, 0.058],
    foot: [0.074, 0.058, 0.155], hand: 1.55, tk: 0.1, radius: 0.55,
  },
  orc_f: {
    ...HUMAN_M, ankleH: 0.09, shin: 0.44, thigh: 0.45, hipW: 0.105, legS: 0.06, pelvisUp: 0.05, spine: 0.13, chest: 0.15,
    neckBase: 0.25, neckLen: 0.08, headFwd: 0.03, hunch: 0.14, shX: 0.195, shY: 0.195, clavY: 0.2, uarm: 0.28, farm: 0.26, armA: 0.64,
    core: [0.15, 0.16, 0.72],
    pelvis: [0.165, 0.105, 0.115], glute: [0.092, 0.1, 0.086], belly: [0.125, 0.12, 0.1], ribs: [0.155, 0.17, 0.118],
    pec: null, bust: [0.07, 0.064, 0.062], lat: [0.07, 0.12, 0.07], back: [0.14, 0.09, 0.062],
    trap: 0.056, neckR: 0.052, delt: [0.07, 0.072, 0.07],
    uarmR: [0.056, 0.045], bicep: [0.048, 0.095, 0.047], farmR: [0.05, 0.037], farmBulge: [0.055, 0.095, 0.048],
    thighR: [0.104, 0.064], quad: [0.08, 0.155, 0.07], calf: [0.062, 0.105, 0.062], shinR: [0.054, 0.042],
    foot: [0.056, 0.045, 0.125], hand: 1.2, tk: 0.08, radius: 0.42,
  },
  elf_m: {
    ...HUMAN_M, ankleH: 0.095, shin: 0.5, thigh: 0.5, hipW: 0.098, legS: 0.06, pelvisUp: 0.05, spine: 0.14, chest: 0.17,
    neckBase: 0.27, neckLen: 0.095, shX: 0.225, shY: 0.205, uarm: 0.32, farm: 0.29, armA: 0.62,
    core: [0.14, 0.19, 0.68],
    pelvis: [0.14, 0.095, 0.1], glute: [0.075, 0.088, 0.07], belly: [0.125, 0.12, 0.095], ribs: [0.175, 0.2, 0.125],
    pec: [0.09, 0.064, 0.05], lat: [0.085, 0.14, 0.078], back: [0.16, 0.11, 0.065],
    trap: 0.056, neckR: 0.052, delt: [0.08, 0.084, 0.08],
    uarmR: [0.06, 0.047], bicep: [0.05, 0.11, 0.05], farmR: [0.052, 0.038], farmBulge: [0.058, 0.11, 0.05],
    thighR: [0.092, 0.058], quad: [0.074, 0.18, 0.064], calf: [0.058, 0.13, 0.058], shinR: [0.052, 0.04],
    foot: [0.056, 0.046, 0.14], hand: 1.2, tk: 0.08, radius: 0.43,
  },
  elf_f: {
    ...HUMAN_M, ankleH: 0.09, shin: 0.49, thigh: 0.49, hipW: 0.1, legS: 0.05, pelvisUp: 0.05, spine: 0.13, chest: 0.15,
    neckBase: 0.24, neckLen: 0.1, shX: 0.165, shY: 0.19, clavX: 0.024, clavY: 0.195, uarm: 0.29, farm: 0.255, armA: 0.58,
    core: [0.135, 0.13, 0.72],
    pelvis: [0.152, 0.1, 0.105], glute: [0.086, 0.095, 0.08], belly: [0.105, 0.11, 0.085], ribs: [0.128, 0.165, 0.1],
    pec: null, bust: [0.058, 0.056, 0.054], lat: [0.056, 0.11, 0.058], back: [0.112, 0.08, 0.05],
    trap: 0.038, neckR: 0.042, delt: [0.054, 0.058, 0.054],
    uarmR: [0.044, 0.034], bicep: [0.036, 0.1, 0.036], farmR: [0.038, 0.028], farmBulge: [0.041, 0.1, 0.036],
    thighR: [0.094, 0.052], quad: [0.068, 0.17, 0.06], calf: [0.052, 0.12, 0.052], shinR: [0.045, 0.034],
    foot: [0.048, 0.04, 0.12], hand: 1.02, tk: 0.08, radius: 0.36,
  },
};

// ------------------------------------------------------------------------------------------------
const v3 = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub3 = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const sc3 = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
const rot = (R, p) => [R[0] * p[0] + R[1] * p[1] + R[2] * p[2], R[3] * p[0] + R[4] * p[1] + R[5] * p[2], R[6] * p[0] + R[7] * p[1] + R[8] * p[2]];
const mirrorX = p => [-p[0], p[1], p[2]];
// quaternion from 3x3 row-major rotation
function quatFromR(m) {
  const [m11, m12, m13, m21, m22, m23, m31, m32, m33] = m;
  const tr = m11 + m22 + m33; let x, y, z, w;
  if (tr > 0) { const s = 0.5 / Math.sqrt(tr + 1); w = 0.25 / s; x = (m32 - m23) * s; y = (m13 - m31) * s; z = (m21 - m12) * s; }
  else if (m11 > m22 && m11 > m33) { const s = 2 * Math.sqrt(1 + m11 - m22 - m33); w = (m32 - m23) / s; x = 0.25 * s; y = (m12 + m21) / s; z = (m13 + m31) / s; }
  else if (m22 > m33) { const s = 2 * Math.sqrt(1 + m22 - m11 - m33); w = (m13 - m31) / s; x = (m12 + m21) / s; y = 0.25 * s; z = (m23 + m32) / s; }
  else { const s = 2 * Math.sqrt(1 + m33 - m11 - m22); w = (m21 - m12) / s; x = (m13 + m31) / s; y = (m23 + m32) / s; z = 0.25 * s; }
  return [x, y, z, w];
}
const RT = R => [R[0], R[3], R[6], R[1], R[4], R[7], R[2], R[5], R[8]];

export function bodyParams(race, sex) {
  const P = { ...RAW[`${race}_${sex}`] };
  P.race = race; P.sex = sex; P.key = `${race}_${sex}`;
  P.headDef = HEAD_DEFS[P.key];
  return P;
}

/** Bind joint positions + neutral frames. */
export function buildJoints(P) {
  const J = {};
  const legLen = P.shin + P.thigh;
  const yHipJ = P.ankleH + legLen * Math.cos(P.legS);
  J.hips = [0, yHipJ + P.pelvisUp, 0];
  J.spine = v3(J.hips, [0, P.spine, 0.004]);
  J.chest = v3(J.spine, [0, P.chest, 0.004]);
  const Rh = rotEuler(-P.hunch, 0, 0), Rh2 = rotEuler(-P.hunch * 0.5, 0, 0);
  J.neck = v3(J.chest, rot(Rh, [0, P.neckBase, 0.01]));
  J.head = v3(J.neck, [0, P.neckLen, -P.headFwd]);
  const A = {}; // per side transforms
  for (const s of ['L', 'R']) {
    const sg = s === 'R' ? 1 : -1;
    J['clav' + s] = v3(J.chest, rot(Rh2, [sg * P.clavX, P.clavY, P.clavZ]));
    const S = v3(J.chest, rot(Rh2, [sg * P.shX, P.shY, P.shZ]));
    const RA = rotEuler(0, 0, sg * P.armA);
    const tf = p => v3(S, rot(RA, sub3(p, S)));  // neutral -> bind
    const hs = P.hand;
    const E = v3(S, [0, -P.uarm, 0]), W = v3(E, [0, -P.farm, 0]);
    const K = v3(W, [0, -0.1 * hs, 0]);
    const n = { S, E, W, K,
      idx1: v3(K, [0, 0, -0.03 * hs]), idx2: v3(K, [0, -0.045 * hs, -0.032 * hs]),
      fng1: v3(K, [0, 0, 0.012 * hs]), fng2: v3(K, [0, -0.045 * hs, 0.012 * hs]),
      thb1: v3(W, [-sg * 0.012 * hs, -0.028 * hs, -0.032 * hs]), thb2: v3(W, [-sg * 0.022 * hs, -0.065 * hs, -0.058 * hs]) };
    A[s] = { RA, tf, n, S, sg };
    J['uarm' + s] = tf(S); J['farm' + s] = tf(E); J['hand' + s] = tf(W);
    J['idx' + s + '1'] = tf(n.idx1); J['idx' + s + '2'] = tf(n.idx2);
    J['fng' + s + '1'] = tf(n.fng1); J['fng' + s + '2'] = tf(n.fng2);
    J['thb' + s + '1'] = tf(n.thb1); J['thb' + s + '2'] = tf(n.thb2);
    // legs
    const H = [sg * P.hipW, yHipJ, 0];
    const RS = rotEuler(0, 0, sg * P.legS);
    const tl = p => v3(H, rot(RS, sub3(p, H)));
    const Kn = v3(H, [0, -P.thigh, 0]), An = v3(Kn, [0, -P.shin, 0]);
    const fl = P.foot[2];
    const ball = v3(An, [0, -P.ankleH + 0.028, -fl * 0.95]);
    J['thigh' + s] = tl(H); J['shin' + s] = tl(Kn); J['foot' + s] = tl(An); J['toe' + s] = tl(ball);
    A[s].RS = RS; A[s].tl = tl; A[s].H = H; A[s].Kn = Kn; A[s].An = An; A[s].ball = ball;
  }
  // secondary bones (placed later by pieces; defaults near parents)
  const hd = P.headDef, hs = hd.s;
  J.cape0 = v3(J.chest, rot(Rh2, [0, P.shY + 0.005, P.ribs[2] + 0.035]));
  J.cape1 = v3(J.cape0, [0, -0.3 * (legLen / 0.87), 0.03]);
  J.cape2 = v3(J.cape1, [0, -0.3 * (legLen / 0.87), 0.02]);
  J.cape3 = v3(J.cape2, [0, -0.28 * (legLen / 0.87), 0.01]);
  J.hairA = v3(J.head, [0, 0.12 * hs, 0.1 * hs]);
  J.hairB = v3(J.hairA, [0, -0.12 * hs, 0.03 * hs]);
  J.hairC = v3(J.hairB, [0, -0.13 * hs, 0.01 * hs]);
  J.braidL1 = v3(J.head, [-0.085 * hs, 0.02 * hs, -0.02 * hs]); J.braidL2 = v3(J.braidL1, [0, -0.13 * hs, 0]);
  J.braidR1 = v3(J.head, [0.085 * hs, 0.02 * hs, -0.02 * hs]); J.braidR2 = v3(J.braidR1, [0, -0.13 * hs, 0]);
  J.beard1 = v3(J.head, [0, -0.04 * hs, -0.09 * hs]); J.beard2 = v3(J.beard1, [0, -0.1 * hs, -0.02 * hs]);

  const joints = new Float32Array(NB * 3);
  BONES.forEach((n, i) => { joints.set(J[n], i * 3); });
  // neutral rotation per bone (bind -> neutral), as quaternion
  const N = new Float32Array(NB * 4);
  BONES.forEach((n, i) => {
    let R = null;
    const side = /L\d?$/.test(n) ? 'L' : /R\d?$/.test(n) ? 'R' : null;
    if (side && /^(uarm|farm|hand|idx|fng|thb)/.test(n)) R = RT(A[side].RA);
    else if (side && /^(thigh|shin|foot|toe)/.test(n)) R = RT(A[side].RS);
    const q = R ? quatFromR(R) : [0, 0, 0, 1];
    N.set(q, i * 4);
  });
  const legLenL = Math.hypot(...sub3(J.thighL, J.shinL)), shinLenL = Math.hypot(...sub3(J.shinL, J.footL));
  return { J, joints, N, A, yHipJ, legLen, thighLen: legLenL, shinLen: shinLenL };
}

// ------------------------------------------------------------------------------------------------
// Primitive construction. Each prim is added to the master SDF (weights) and zone SDFs (meshing).
function buildPrims(P, JJ) {
  const { J, A } = JJ;
  const master = new SDF(), body = new SDF(), head = new SDF(), hand = new SDF();
  const both = (fn) => { fn(master); fn(body); };
  const Rh = rotEuler(-P.hunch, 0, 0), Rh2 = rotEuler(-P.hunch * 0.55, 0, 0);
  const inC = (p) => v3(J.chest, rot(Rh2, p));  // chest local (hunched) -> bind
  const kT = P.tk, kL = 0.035;
  // --- smooth torso core (elliptical round cone hips -> upper chest)
  const coreTop = inC([0, 0.12, 0.004]);
  both(s => s.cone(v3(J.hips, [0, -0.01, 0.004]), v3(J.spine, [0, 0.02, 0.004]), P.core[0], (P.core[0] + P.core[1]) * 0.5 * 0.96, { bone: B.spine, k: kT, sq: [1, 1, P.core[2]] }));
  both(s => s.cone(v3(J.spine, [0, 0.02, 0.004]), coreTop, (P.core[0] + P.core[1]) * 0.5 * 0.96, P.core[1], { bone: B.chest, k: kT, sq: [1, 1, P.core[2]] }));
  // --- pelvis / hips
  both(s => s.ell(v3(J.hips, [0, -0.025, 0.004]), P.pelvis, { bone: B.hips, k: kT }));
  for (const sg of [-1, 1]) {
    both(s => s.ell(v3(J.hips, [sg * P.glute[0] * 0.82, -0.06, 0.05]), P.glute, { bone: B.hips, k: kT, rot: rotEuler(0.2, 0, 0) }));
  }
  both(s => s.ell(v3(J.hips, [0, -0.085, -0.015]), [P.pelvis[0] * 0.42, 0.06, 0.065], { bone: B.hips, k: 0.03 }));
  // --- abdomen
  both(s => s.ell(v3(J.spine, [0, -0.005, -0.004]), P.belly, { bone: B.spine, k: kT }));
  // --- ribcage & chest
  const ribC = inC([0, 0.095, 0.004]);
  both(s => s.ell(ribC, P.ribs, { bone: B.chest, k: kT, rot: Rh2 }));
  both(s => s.ell(inC([0, P.shY - 0.03, P.ribs[2] * 0.45]), P.back, { bone: B.chest, k: 0.05, rot: Rh2 }));
  for (const sg of [-1, 1]) {
    if (P.pec) both(s => s.ell(inC([sg * P.pec[0] * 0.88, P.shY - 0.07, -P.ribs[2] * 0.58]), P.pec, { bone: B.chest, k: 0.035, rot: mulR(Rh2, rotEuler(0.15, sg * 0.25, sg * -0.15)) }));
    if (P.bust) both(s => s.ell(inC([sg * P.bust[0] * 0.95, P.shY - 0.1, -P.ribs[2] * 0.62]), P.bust, { bone: B.chest, k: 0.035, rot: mulR(Rh2, rotEuler(0.25, sg * 0.3, 0)) }));
    both(s => s.ell(inC([sg * (P.ribs[0] * 0.62), P.shY - 0.1, P.ribs[2] * 0.2]), P.lat, { bone: B.chest, k: 0.05, rot: mulR(Rh2, rotEuler(0, 0, sg * 0.25)) }));
    // trapezius slope neck -> shoulder
    const S = A[sg > 0 ? 'R' : 'L'].S;
    both(s => s.cone(v3(J.neck, [sg * 0.01, -0.02, 0.02]), v3(S, [-sg * 0.045, 0.028, 0.02]), P.trap, P.trap * 0.72, { bone: B.chest, k: 0.04 }));
  }
  // --- neck (body zone slightly inset so the head zone covers it)
  const neckA = v3(J.neck, [0, -0.04, 0.012]), neckB = v3(J.head, [0, 0.03, 0.01]);
  master.cone(neckA, neckB, P.neckR * 1.02, P.neckR * 0.92, { bone: B.neck, k: 0.035 });
  body.cone(neckA, v3(J.head, [0, -0.01, 0.01]), P.neckR * 0.95, P.neckR * 0.82, { bone: B.neck, k: 0.035 });
  // --- arms
  for (const s of ['L', 'R']) {
    const a = A[s], sg = a.sg, n = a.n;
    const X = { R: a.RA, t: sub3(a.S, rot(a.RA, a.S)) };
    master.setXform(X); body.setXform(X);
    const bu = B['uarm' + s], bf = B['farm' + s];
    both(sd => sd.ell(v3(n.S, [sg * 0.012, 0.004, 0.004]), P.delt, { bone: bu, k: 0.04, sig: 1.35 }));
    both(sd => sd.cone(n.S, n.E, P.uarmR[0], P.uarmR[1], { bone: bu, k: kL }));
    both(sd => sd.ell(v3(n.S, [0, -P.uarm * 0.45, -P.uarmR[1] * 0.4]), P.bicep, { bone: bu, k: 0.03 }));
    both(sd => sd.ell(v3(n.S, [sg * 0.004, -P.uarm * 0.38, P.uarmR[1] * 0.35]), [P.bicep[0] * 0.95, P.bicep[1], P.bicep[2] * 0.95], { bone: bu, k: 0.03 }));
    both(sd => sd.cone(n.E, n.W, P.farmR[0], P.farmR[1], { bone: bf, k: kL }));
    both(sd => sd.ell(v3(n.E, [sg * 0.004, -P.farm * 0.3, -0.004]), P.farmBulge, { bone: bf, k: 0.03 }));
    // hand zone: continues the forearm a little + hand (built for R only, mirrored later)
    master.cone(v3(n.W, [0, 0.04, 0]), v3(n.W, [0, -0.01, 0]), P.farmR[1] * 1.03, P.farmR[1] * 1.0, { bone: bf, k: 0.02 });
    addHand(master, P, n, sg, s);
    if (s === 'R') {
      hand.setXform(X);
      hand.cone(v3(n.W, [0, 0.06, 0]), v3(n.W, [0, -0.01, 0]), P.farmR[1] * 1.03, P.farmR[1] * 1.0, { bone: bf, k: 0.02 });
      addHand(hand, P, n, sg, s);
      hand.setXform(null);
    }
    master.setXform(null); body.setXform(null);
  }
  // --- legs
  for (const s of ['L', 'R']) {
    const a = A[s], sg = a.sg;
    const X = { R: a.RS, t: sub3(a.H, rot(a.RS, a.H)) };
    master.setXform(X); body.setXform(X);
    const bt = B['thigh' + s], bs = B['shin' + s], bfo = B['foot' + s], bto = B['toe' + s];
    const H = a.H, K = a.Kn, An = a.An;
    both(sd => sd.cone(v3(H, [0, 0.01, 0]), K, P.thighR[0], P.thighR[1], { bone: bt, k: kL }));
    both(sd => sd.ell(v3(H, [sg * 0.004, -P.thigh * 0.45, -P.thighR[1] * 0.35]), P.quad, { bone: bt, k: 0.03 }));
    both(sd => sd.ell(v3(H, [sg * 0.018, -P.thigh * 0.3, P.thighR[1] * 0.25]), [P.quad[0] * 0.95, P.quad[1] * 0.95, P.quad[2]], { bone: bt, k: 0.035 }));
    both(sd => sd.sphere(v3(K, [0, 0, -0.01]), P.thighR[1] * 0.92, { bone: bs, k: 0.025, sig: 0.8 }));
    both(sd => sd.cone(K, v3(An, [0, 0.01, 0]), P.shinR[0], P.shinR[1], { bone: bs, k: kL }));
    both(sd => sd.ell(v3(K, [sg * 0.003, -P.shin * 0.3, P.shinR[0] * 0.35]), P.calf, { bone: bs, k: 0.03 }));
    // foot (boot-like chunky)
    const fw = P.foot[0], fh = P.foot[1], fl = P.foot[2];
    both(sd => sd.sphere(An, P.shinR[1] * 1.05, { bone: bfo, k: 0.03 }));
    both(sd => sd.box(v3(An, [0, -P.ankleH * 0.62, -fl * 0.4]), [fw * 0.92, fh * 0.9, fl * 0.62], Math.min(fw, fh) * 0.8, { bone: bfo, k: 0.03, rot: rotEuler(0.06, 0, 0) }));
    both(sd => sd.box(v3(An, [0, -P.ankleH + fh * 0.62, -fl * 1.18]), [fw * 0.95, fh * 0.62, fl * 0.36], fh * 0.6, { bone: bto, k: 0.028 }));
    master.setXform(null); body.setXform(null);
  }
  // --- head (head zone + master)
  buildHeadPrims(master, head, P, J);
  master.build(); body.build(); head.build(); hand.build();
  return { master, body, head, hand };
}

function addHand(sd, P, n, sg, s) {
  const hs = P.hand, W = n.W;
  const bh = B['hand' + s];
  // palm: thickness along X (palm faces -sg*X), length along -Y, width along Z
  sd.box(v3(W, [0, -0.052 * hs, -0.004 * hs]), [0.021 * hs, 0.05 * hs, 0.046 * hs], 0.019 * hs, { bone: bh, k: 0.02 });
  sd.ell(v3(W, [-sg * 0.012 * hs, -0.04 * hs, -0.03 * hs]), [0.02 * hs, 0.035 * hs, 0.022 * hs], { bone: bh, k: 0.015 }); // thenar
  // fingers
  const fingers = [
    { z: -0.031, len: [0.045, 0.029, 0.024], r: 0.0118, b1: 'idx', b2: 'idx' },
    { z: -0.0105, len: [0.048, 0.031, 0.025], r: 0.0122, b1: 'fng', b2: 'fng' },
    { z: 0.0105, len: [0.045, 0.029, 0.024], r: 0.0116, b1: 'fng', b2: 'fng' },
    { z: 0.03, len: [0.036, 0.023, 0.02], r: 0.0104, b1: 'fng', b2: 'fng' },
  ];
  for (const f of fingers) {
    const k0 = v3(n.K, [0, 0.004 * hs, f.z * hs]);
    const k1 = v3(k0, [0, -f.len[0] * hs, 0]);
    const k2 = v3(k1, [0, -f.len[1] * hs, 0]);
    const k3 = v3(k2, [0, -f.len[2] * hs, 0]);
    const b1 = B[f.b1 + s + '1'], b2 = B[f.b2 + s + '2'];
    sd.cone(k0, k1, f.r * 1.1 * hs, f.r * hs, { bone: b1, k: 0.006 });
    sd.cone(k1, k2, f.r * hs, f.r * 0.92 * hs, { bone: b2, k: 0.005 });
    sd.cone(k2, k3, f.r * 0.92 * hs, f.r * 0.8 * hs, { bone: b2, k: 0.005 });
  }
  // thumb
  const t0 = v3(W, [-sg * 0.006 * hs, -0.022 * hs, -0.03 * hs]);
  const t1 = n.thb2;
  const t2 = v3(t1, [-sg * 0.012 * hs, -0.03 * hs, -0.02 * hs]);
  sd.cone(t0, t1, 0.017 * hs, 0.0135 * hs, { bone: B['thb' + s + '1'], k: 0.012 });
  sd.cone(t1, t2, 0.0135 * hs, 0.0115 * hs, { bone: B['thb' + s + '2'], k: 0.006 });
}

// ------------------------------------------------------------------------------------------------
// Skin weights from primitive proximity (soft-min over primitive distances, grouped per bone).
const _pd = new Float32Array(512);
export function weightsAt(master, x, y, z, outI, outW, o, sigma, boneFilter = null) {
  const n = master.n;
  master.evalPrims(x, y, z, _pd);
  const acc = new Float32Array(NB);
  let dmin = 1e9;
  for (let i = 0; i < n; i++) if (master.opOf(i) === ADD && master.boneOf(i) >= 0) { if (_pd[i] < dmin) dmin = _pd[i]; }
  for (let i = 0; i < n; i++) {
    if (master.opOf(i) !== ADD) continue;
    const b = master.boneOf(i); if (b < 0) continue;
    if (boneFilter && !boneFilter[b]) continue;
    const s = sigma * master.sig[i];
    const w = Math.exp(-(Math.max(_pd[i], dmin) - dmin) / s);
    if (w > acc[b]) acc[b] = w; // max per bone (bones with many prims don't dominate)
  }
  // top 4
  const top = [];
  for (let b = 0; b < NB; b++) if (acc[b] > 0.004) top.push(b);
  top.sort((a, b) => acc[b] - acc[a]);
  let sum = 0; for (let k = 0; k < 4 && k < top.length; k++) sum += acc[top[k]];
  for (let k = 0; k < 4; k++) {
    if (k < top.length && sum > 0) { outI[o + k] = top[k]; outW[o + k] = acc[top[k]] / sum; }
    else { outI[o + k] = 0; outW[o + k] = 0; }
  }
  if (sum === 0) { outI[o] = B.hips; outW[o] = 1; }
}

// ------------------------------------------------------------------------------------------------
// Piece: a skinned, cacheable chunk of geometry with slot-based colouring.
export function makePiece(n, nIdx) {
  return {
    n, pos: new Float32Array(n * 3), nrm: new Float32Array(n * 3), idx: new Uint32Array(nIdx),
    bi: new Uint8Array(n * 4), bw: new Float32Array(n * 4), slot: new Uint8Array(n), mul: new Float32Array(n * 3).fill(1),
    face: null, chain: null, coord: null, ang: null, emis: null, det: null,
  };
}

/** concatenate pieces (same attribute layout) */
export function mergePieces(list) {
  list = list.filter(Boolean);
  if (list.length === 1) return list[0];
  let n = 0, ni = 0; for (const p of list) { n += p.n; ni += p.idx.length; }
  const pc = makePiece(n, ni);
  const hasE = list.some(p => p.emis);
  if (hasE) pc.emis = new Float32Array(n);
  let vo = 0, io = 0;
  for (const p of list) {
    pc.pos.set(p.pos, vo * 3); pc.nrm.set(p.nrm, vo * 3); pc.bi.set(p.bi, vo * 4); pc.bw.set(p.bw, vo * 4); pc.slot.set(p.slot, vo); pc.mul.set(p.mul, vo * 3);
    if (hasE && p.emis) pc.emis.set(p.emis, vo);
    for (let i = 0; i < p.idx.length; i++) pc.idx[io + i] = p.idx[i] + vo;
    vo += p.n; io += p.idx.length;
  }
  return pc;
}

function meshZone(sdfZone, master, bmin, bmax, h, sigma, opts = {}) {
  const fn = (x, y, z) => sdfZone.eval(x, y, z);
  let m = surfaceNets(fn, bmin, bmax, h, { refine: -1, near: (x, y, z, R) => sdfZone.near(x, y, z, R) });
  const raw = m.pos.length / 3;
  if (opts.target) m = simplify(m.pos, m.nrm, m.idx, opts.target, opts.weight ? (v) => opts.weight(m.pos[v * 3], m.pos[v * 3 + 1], m.pos[v * 3 + 2]) : null);
  refineVerts(fn, m.pos, m.nrm, h, 1);
  const n = m.pos.length / 3;
  const pc = makePiece(n, m.idx.length);
  pc.pos.set(m.pos); pc.nrm.set(m.nrm); pc.idx.set(m.idx);
  for (let v = 0; v < n; v++) {
    weightsAt(master, m.pos[v * 3], m.pos[v * 3 + 1], m.pos[v * 3 + 2], pc.bi, pc.bw, v * 4, sigma, opts.boneFilter);
  }
  return { piece: pc, fn, raw };
}

function mirrorPiece(src, boneMap) {
  const pc = makePiece(src.n, src.idx.length);
  for (let v = 0; v < src.n; v++) {
    pc.pos[v * 3] = -src.pos[v * 3]; pc.pos[v * 3 + 1] = src.pos[v * 3 + 1]; pc.pos[v * 3 + 2] = src.pos[v * 3 + 2];
    pc.nrm[v * 3] = -src.nrm[v * 3]; pc.nrm[v * 3 + 1] = src.nrm[v * 3 + 1]; pc.nrm[v * 3 + 2] = src.nrm[v * 3 + 2];
    for (let k = 0; k < 4; k++) { pc.bi[v * 4 + k] = boneMap[src.bi[v * 4 + k]]; pc.bw[v * 4 + k] = src.bw[v * 4 + k]; }
    pc.slot[v] = src.slot[v];
    pc.mul[v * 3] = src.mul[v * 3]; pc.mul[v * 3 + 1] = src.mul[v * 3 + 1]; pc.mul[v * 3 + 2] = src.mul[v * 3 + 2];
  }
  for (let t = 0; t < src.idx.length; t += 3) { pc.idx[t] = src.idx[t]; pc.idx[t + 1] = src.idx[t + 2]; pc.idx[t + 2] = src.idx[t + 1]; }
  if (src.chain) { pc.chain = src.chain.map(c => c === CH_HAND_R ? CH_HAND_L : c === CH_ARM_R ? CH_ARM_L : c); pc.coord = src.coord.slice(); pc.ang = src.ang.slice(); }
  return pc;
}
export const LR_MAP = (() => { const m = new Uint8Array(NB); BONES.forEach((n, i) => { let o = n; if (/L(\d?)$/.test(n) && n !== 'hips') o = n.replace(/L(\d?)$/, 'R$1'); else if (/R(\d?)$/.test(n)) o = n.replace(/R(\d?)$/, 'L$1'); m[i] = B[o] ?? i; }); return m; })();

// Per-vertex region data used by garment rules: chain id, coordinate along the chain, angle around it.
function regionData(pc, JJ) {
  const { J } = JJ;
  pc.chain = new Uint8Array(pc.n); pc.coord = new Float32Array(pc.n); pc.ang = new Float32Array(pc.n);
  const chainSum = new Float32Array(8);
  const segs = {};
  for (const s of ['L', 'R']) {
    segs['arm' + s] = [J['uarm' + s], J['farm' + s], J['hand' + s], ext(J['farm' + s], J['hand' + s], 0.75)];
    segs['leg' + s] = [J['thigh' + s], J['shin' + s], J['foot' + s], J['toe' + s]];
  }
  for (let v = 0; v < pc.n; v++) {
    chainSum.fill(0);
    for (let k = 0; k < 4; k++) chainSum[BONE_CHAIN[pc.bi[v * 4 + k]]] += pc.bw[v * 4 + k];
    let best = 0; for (let c = 1; c < 8; c++) if (chainSum[c] > chainSum[best]) best = c;
    const x = pc.pos[v * 3], y = pc.pos[v * 3 + 1], z = pc.pos[v * 3 + 2];
    pc.chain[v] = best;
    if (best === CH_TORSO || best === CH_HEAD) { pc.coord[v] = y; pc.ang[v] = Math.atan2(x, -z); }
    else {
      const key = (best === CH_ARM_L || best === CH_HAND_L) ? 'armL' : (best === CH_ARM_R || best === CH_HAND_R) ? 'armR' : best === CH_LEG_L ? 'legL' : 'legR';
      const { t, ang } = polyCoord(segs[key], x, y, z, key.startsWith('leg'));
      pc.coord[v] = t; pc.ang[v] = ang;
    }
  }
}
function ext(a, b, f) { return [b[0] + (b[0] - a[0]) * f, b[1] + (b[1] - a[1]) * f, b[2] + (b[2] - a[2]) * f]; }
function polyCoord(pts, x, y, z, isLeg) {
  let best = 1e9, bt = 0, bang = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i], b = pts[i + 1];
    const dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2];
    const l2 = dx * dx + dy * dy + dz * dz;
    let t = ((x - a[0]) * dx + (y - a[1]) * dy + (z - a[2]) * dz) / l2;
    const tc = Math.max(i === 0 ? -0.6 : 0, Math.min(i === pts.length - 2 ? 1.4 : 1, t));
    const px = a[0] + dx * tc, py = a[1] + dy * tc, pz = a[2] + dz * tc;
    const d = Math.hypot(x - px, y - py, z - pz);
    if (d < best) {
      best = d; bt = i + tc;
      // angle around segment: 0 = front (-Z)
      bang = Math.atan2(x - px, -(z - pz));
    }
  }
  return { t: bt, ang: bang };
}

// ------------------------------------------------------------------------------------------------
// Skin shading multipliers (AO, top light, warm crevices) baked per vertex.
function shadeSkin(pc, fn, scale, extra = null) {
  for (let v = 0; v < pc.n; v++) {
    const x = pc.pos[v * 3], y = pc.pos[v * 3 + 1], z = pc.pos[v * 3 + 2];
    const nx = pc.nrm[v * 3], ny = pc.nrm[v * 3 + 1], nz = pc.nrm[v * 3 + 2];
    const ao = sdfAO(fn, x, y, z, nx, ny, nz, 0.018 * scale, 1.0);
    const top = 0.9 + 0.16 * ny;
    const aoC = 0.32 + 0.68 * ao;
    let r = aoC * top, g = aoC * top, b = aoC * top;
    // warm subsurface in crevices
    const warm = (1 - ao) * 0.35;
    r *= 1 + warm * 0.25; g *= 1 - warm * 0.1; b *= 1 - warm * 0.18;
    pc.mul[v * 3] = r; pc.mul[v * 3 + 1] = g; pc.mul[v * 3 + 2] = b;
    pc.slot[v] = SLOT.SKIN;
    if (extra) extra(v, x, y, z, nx, ny, nz, ao);
  }
}

// ------------------------------------------------------------------------------------------------
const CACHE = new Map();
export function getBase(race, sex) {
  const key = `${race}_${sex}`;
  if (CACHE.has(key)) return CACHE.get(key);
  const t0 = performance.now();
  const P = bodyParams(race, sex);
  const JJ = buildJoints(P);
  const S = buildPrims(P, JJ);
  const J = JJ.J;
  const cr = P.headDef.cranium;
  const H = J.head[1] + (cr.c[1] + cr.r[1] + 0.028) * P.headDef.s; // top of the head (+hair allowance)
  const scale = H / 1.86;
  const sigma = 0.013 * Math.max(0.8, scale);
  // body zone
  const bb = [-(P.shX + P.uarm + P.farm + 0.2), -0.02, -0.4], bt = [(P.shX + P.uarm + P.farm + 0.2), J.head[1] + 0.05, 0.4];
  const hBody = 0.021 * Math.max(0.86, scale);
  const bodyZ = meshZone(S.body, S.master, bb, bt, hBody, sigma, { target: Math.round(3000 * Math.min(1.0, Math.max(0.85, scale))) });
  // head zone
  const hs = P.headDef.s;
  const hmin = [J.head[0] - 0.24 * hs, J.neck[1] - 0.06, J.head[2] - 0.2 * hs], hmax = [J.head[0] + 0.24 * hs, J.head[1] + 0.3 * hs, J.head[2] + 0.22 * hs];
  const Jh = J.head;
  const headZ = meshZone(S.head, S.master, hmin, hmax, 0.0072 * hs, sigma * 0.8, {
    target: 1350,
    weight: (x, y, z) => {
      const lx = (x - Jh[0]) / hs, ly = (y - Jh[1]) / hs, lz = (z - Jh[2]) / hs;
      if (lz < -0.05 && Math.abs(lx) < 0.075 && ly > -0.06 && ly < 0.12) return 6; // face
      if (Math.abs(lx) > 0.085) return 2; // ears
      return 1;
    },
  });
  // right hand zone (mirrored for left)
  const W = J.handR, hsz = 0.17 * P.hand;
  const handZ = meshZone(S.hand, S.master, [W[0] - hsz, W[1] - hsz * 1.3, W[2] - hsz], [W[0] + hsz, W[1] + 0.08, W[2] + hsz], 0.0068 * P.hand, 0.008, { target: 400 });
  // region + shading
  regionData(bodyZ.piece, JJ);
  regionData(handZ.piece, JJ);
  headZ.piece.chain = new Uint8Array(headZ.piece.n).fill(CH_HEAD);
  headZ.piece.coord = new Float32Array(headZ.piece.n); headZ.piece.ang = new Float32Array(headZ.piece.n);
  for (let v = 0; v < headZ.piece.n; v++) { headZ.piece.coord[v] = headZ.piece.pos[v * 3 + 1]; headZ.piece.ang[v] = Math.atan2(headZ.piece.pos[v * 3], -(headZ.piece.pos[v * 3 + 2] - J.head[2])); }
  shadeSkin(bodyZ.piece, bodyZ.fn, scale);
  shadeSkin(handZ.piece, handZ.fn, scale * 0.5, (v, x, y, z) => {
    // knuckles & fingertips a touch redder
    const m = handZ.piece.mul; m[v * 3] *= 1.03; m[v * 3 + 2] *= 0.97;
  });
  const faceMap = faceMapping(P, J);
  const headTagged = headShading(headZ.piece, headZ.fn, S.head, P, J, faceMap);
  const handL = mirrorPiece(handZ.piece, LR_MAP);
  handL.chain = new Uint8Array(handL.n).fill(CH_HAND_L);
  handZ.piece.chain.fill(CH_HAND_R);
  const chainSDF = {};
  const bc = (it) => it.bone >= 0 ? BONE_CHAIN[it.bone] : -1;
  chainSDF.torso = S.master.subset(it => it.op === ADD && (bc(it) === CH_TORSO || ((bc(it) === CH_LEG_L || bc(it) === CH_LEG_R) && /^thigh/.test(BONES[it.bone]))));
  chainSDF.torsoLegs = S.master.subset(it => it.op === ADD && (bc(it) === CH_TORSO || bc(it) === CH_LEG_L || bc(it) === CH_LEG_R));
  chainSDF.armL = S.master.subset(it => it.op === ADD && (bc(it) === CH_ARM_L || bc(it) === CH_HAND_L));
  chainSDF.armR = S.master.subset(it => it.op === ADD && (bc(it) === CH_ARM_R || bc(it) === CH_HAND_R));
  chainSDF.legL = S.master.subset(it => it.op === ADD && bc(it) === CH_LEG_L);
  chainSDF.legR = S.master.subset(it => it.op === ADD && bc(it) === CH_LEG_R);
  chainSDF.head = S.head;
  const base = {
    key, P, JJ, joints: JJ.joints, N: JJ.N, master: S.master, sdfBody: S.body, sdfHead: S.head, chainSDF,
    pieces: { body: bodyZ.piece, head: headZ.piece, handR: handZ.piece, handL },
    height: H, scale, faceMap, headTagged,
    ms: 0,
  };
  base.ms = performance.now() - t0;
  base.raw = { body: bodyZ.raw, head: headZ.raw, hand: handZ.raw };
  CACHE.set(key, base);
  return base;
}

// head colouring + face UVs
function headShading(pc, fn, sdfHead, P, J, fm) {
  const pd = new Float32Array(sdfHead.n);
  pc.face = new Float32Array(pc.n * 2).fill(-1);
  const hs = P.headDef.s;
  shadeSkin(pc, fn, 0.45 * hs, (v, x, y, z, nx, ny, nz, ao) => {
    sdfHead.evalPrims(x, y, z, pd);
    let lip = 0, nose = 0, cheek = 0, ear = 0, sock = 0;
    for (let i = 0; i < sdfHead.n; i++) {
      const tg = sdfHead.tagOf(i); if (!tg) continue;
      const w = Math.exp(-Math.max(0, pd[i]) / (0.006 * hs));
      if (tg === 1) lip = Math.max(lip, w); else if (tg === 2) nose = Math.max(nose, w); else if (tg === 3) cheek = Math.max(cheek, w);
      else if (tg === 4) ear = Math.max(ear, w); else if (tg === 5) sock = Math.max(sock, w);
    }
    const m = pc.mul;
    const red = lip * 0.28 * (P.headDef.lipTint ?? 1) + nose * 0.08 + cheek * 0.1 + ear * 0.12;
    m[v * 3] *= 1 + red * 0.2; m[v * 3 + 1] *= 1 - red * 0.55; m[v * 3 + 2] *= 1 - red * 0.5;
    const dk = 1 - sock * 0.12 - lip * 0.08;
    m[v * 3] *= dk; m[v * 3 + 1] *= dk; m[v * 3 + 2] *= dk * 1.02;
    // face uv (front half of head)
    const lx = x - J.head[0], ly = y - J.head[1], lz = z - J.head[2];
    if (lz < fm.zCut && Math.abs(lx) < fm.w * 0.62) {
      pc.face[v * 2] = (lx - fm.x0) / fm.w;
      pc.face[v * 2 + 1] = (ly - fm.y0) / fm.w;
    }
  });
  return true;
}

export { RAW as BODY_RAW };
