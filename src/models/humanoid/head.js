// Head sculpt definitions (per race/sex) as SDF primitives in head-local space (origin = head bone,
// +Y up, -Z forward), plus the orthographic face-texture mapping shared with the face painter.
import { rotEuler, rotAlign, SUB, ADD } from './sdf.js';
import { B } from './rig.js';

// Tags: 1 lips, 2 nose, 3 cheek, 4 ear, 5 eye socket
const HM = {
  s: 1.06,
  cranium: { c: [0, 0.104, 0.016], r: [0.097, 0.112, 0.117] },
  back: { c: [0, 0.07, 0.05], r: [0.085, 0.085, 0.08] },
  mid: { c: [0, 0.058, -0.046], r: [0.08, 0.068, 0.07] },
  jaw: { c: [0, 0.006, -0.044], h: [0.058, 0.03, 0.05], rd: 0.027 },
  chin: { c: [0, -0.024, -0.088], r: [0.029, 0.024, 0.024] },
  cheek: { c: [0.05, 0.066, -0.078], r: [0.029, 0.02, 0.024] },
  brow: { c: [0, 0.1, -0.098], r: [0.066, 0.017, 0.021], k: 0.02 },
  eye: { x: 0.035, y: 0.076, z: -0.1, sock: [0.021, 0.014, 0.016], ball: 0.0155 },
  noseA: [0, 0.095, -0.108], noseB: [0, 0.047, -0.127], noseR: [0.0085, 0.012], tip: 0.0135, tipY: 0.044, tipZ: -0.126, ala: [0.0105, 0.009, 0.0095], alaX: 0.0115,
  lipU: { c: [0, 0.016, -0.1], r: [0.025, 0.0075, 0.009] }, lipL: { c: [0, 0.004, -0.097], r: [0.021, 0.0078, 0.009] },
  ear: 'round', earC: [0.097, 0.068, 0.006],
  mouthY: 0.009, browY: 0.1,
  lipTint: 0.8,
};
const HF = {
  ...HM, s: 1.04, vjaw: true,
  cranium: { c: [0, 0.104, 0.012], r: [0.094, 0.11, 0.113] },
  mid: { c: [0, 0.06, -0.044], r: [0.074, 0.064, 0.066] },
  jaw: { c: [0, 0.01, -0.042], h: [0.046, 0.026, 0.044], rd: 0.028 },
  chin: { c: [0, -0.02, -0.083], r: [0.023, 0.02, 0.02] },
  cheek: { c: [0.047, 0.07, -0.075], r: [0.026, 0.018, 0.022] },
  brow: { c: [0, 0.1, -0.095], r: [0.06, 0.012, 0.014], k: 0.02 },
  eye: { x: 0.034, y: 0.077, z: -0.098, sock: [0.021, 0.014, 0.015], ball: 0.0155 },
  noseA: [0, 0.092, -0.104], noseB: [0, 0.05, -0.12], noseR: [0.0068, 0.0092], tip: 0.011, tipY: 0.048, tipZ: -0.119, ala: [0.0085, 0.0075, 0.0075], alaX: 0.0095,
  lipU: { c: [0, 0.019, -0.094], r: [0.021, 0.0075, 0.008] }, lipL: { c: [0, 0.007, -0.092], r: [0.019, 0.0082, 0.0082] },
  lipTint: 1.4, mouthY: 0.012,
};
export const HEAD_DEFS = {
  human_m: HM,
  human_f: HF,
  dwarf_m: {
    ...HM, s: 1.12,
    cranium: { c: [0, 0.098, 0.016], r: [0.102, 0.106, 0.115] },
    mid: { c: [0, 0.055, -0.048], r: [0.088, 0.07, 0.072] },
    jaw: { c: [0, 0.004, -0.046], h: [0.062, 0.032, 0.05], rd: 0.03 },
    cheek: { c: [0.052, 0.058, -0.082], r: [0.034, 0.026, 0.026] },
    brow: { c: [0, 0.098, -0.102], r: [0.072, 0.024, 0.026], k: 0.02 },
    eye: { x: 0.036, y: 0.074, z: -0.102, sock: [0.02, 0.013, 0.017], ball: 0.014 },
    noseA: [0, 0.09, -0.11], noseB: [0, 0.044, -0.13], noseR: [0.012, 0.018], tip: 0.025, tipY: 0.038, tipZ: -0.132, ala: [0.016, 0.014, 0.014], alaX: 0.017,
    ear: 'round', earC: [0.102, 0.066, 0.008], lipTint: 1.0,
  },
  dwarf_f: {
    ...HF, s: 1.06,
    cranium: { c: [0, 0.1, 0.014], r: [0.098, 0.106, 0.11] },
    mid: { c: [0, 0.056, -0.046], r: [0.082, 0.068, 0.068] },
    jaw: { c: [0, 0.008, -0.042], h: [0.052, 0.028, 0.044], rd: 0.03 },
    cheek: { c: [0.05, 0.06, -0.078], r: [0.032, 0.025, 0.025] },
    noseA: [0, 0.09, -0.107], noseB: [0, 0.047, -0.126], noseR: [0.008, 0.012], tip: 0.016, tipY: 0.043, tipZ: -0.127, ala: [0.011, 0.01, 0.01], alaX: 0.012,
    ear: 'round', earC: [0.097, 0.066, 0.006], lipTint: 1.5,
  },
  orc_m: {
    ...HM, s: 1.1,
    cranium: { c: [0, 0.094, 0.022], r: [0.1, 0.098, 0.116] },
    back: { c: [0, 0.06, 0.05], r: [0.09, 0.085, 0.085] },
    mid: { c: [0, 0.052, -0.05], r: [0.088, 0.068, 0.072] },
    jaw: { c: [0, -0.004, -0.058], h: [0.07, 0.036, 0.058], rd: 0.03 },
    chin: { c: [0, -0.03, -0.1], r: [0.036, 0.026, 0.026] },
    cheek: { c: [0.055, 0.06, -0.082], r: [0.032, 0.022, 0.024] },
    brow: { c: [0, 0.094, -0.104], r: [0.078, 0.027, 0.03], k: 0.022 },
    eye: { x: 0.036, y: 0.072, z: -0.1, sock: [0.02, 0.012, 0.018], ball: 0.013 },
    noseA: [0, 0.085, -0.114], noseB: [0, 0.05, -0.13], noseR: [0.012, 0.016], tip: 0.016, tipY: 0.047, tipZ: -0.128, ala: [0.017, 0.012, 0.012], alaX: 0.019,
    lipU: { c: [0, 0.013, -0.108], r: [0.029, 0.008, 0.01] }, lipL: { c: [0, -0.002, -0.114], r: [0.031, 0.011, 0.012] },
    ear: 'orc', earC: [0.094, 0.07, 0.01], tusks: 1, mouthY: 0.004, lipTint: 0.5,
  },
  orc_f: {
    ...HF, s: 1.04,
    cranium: { c: [0, 0.1, 0.016], r: [0.095, 0.106, 0.114] },
    jaw: { c: [0, 0.006, -0.048], h: [0.052, 0.028, 0.048], rd: 0.028 },
    chin: { c: [0, -0.022, -0.088], r: [0.026, 0.021, 0.021] },
    brow: { c: [0, 0.098, -0.098], r: [0.064, 0.016, 0.018], k: 0.02 },
    noseA: [0, 0.09, -0.108], noseB: [0, 0.05, -0.126], noseR: [0.009, 0.012], tip: 0.013, tipY: 0.047, tipZ: -0.125, ala: [0.013, 0.009, 0.01], alaX: 0.014,
    ear: 'orc', earC: [0.092, 0.07, 0.008], tusks: 0.8, lipTint: 1.2,
  },
  elf_m: {
    ...HM, s: 1.07, vjaw: true,
    cranium: { c: [0, 0.108, 0.014], r: [0.092, 0.114, 0.114] },
    mid: { c: [0, 0.056, -0.044], r: [0.074, 0.07, 0.068] },
    jaw: { c: [0, -0.002, -0.048], h: [0.048, 0.034, 0.046], rd: 0.026 },
    chin: { c: [0, -0.036, -0.087], r: [0.025, 0.026, 0.022] },
    cheek: { c: [0.05, 0.072, -0.076], r: [0.028, 0.017, 0.022] },
    brow: { c: [0, 0.103, -0.097], r: [0.062, 0.014, 0.018], k: 0.02 },
    noseA: [0, 0.098, -0.106], noseB: [0, 0.047, -0.128], noseR: [0.0072, 0.0105], tip: 0.0115, tipY: 0.045, tipZ: -0.126, ala: [0.0088, 0.0078, 0.0078], alaX: 0.0098,
    ear: 'elf', earC: [0.09, 0.075, 0.008], earLen: 1.0, lipTint: 0.7,
  },
  elf_f: {
    ...HF, s: 1.0,
    cranium: { c: [0, 0.107, 0.012], r: [0.09, 0.112, 0.112] },
    jaw: { c: [0, 0.004, -0.044], h: [0.042, 0.028, 0.042], rd: 0.027 },
    chin: { c: [0, -0.028, -0.082], r: [0.021, 0.021, 0.019] },
    ear: 'elf', earC: [0.088, 0.075, 0.008], earLen: 0.9, lipTint: 1.3,
  },
};

const sc = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];

export function faceMapping(P, J) {
  const d = P.headDef, s = d.s;
  const w = 0.17 * s;
  const m = { x0: -0.085 * s, y0: -0.055 * s, w, zCut: -0.015 * s };
  const uv = (x, y) => [(x * s - m.x0) / w, (y * s - m.y0) / w];
  m.lm = {
    eyeL: uv(-d.eye.x, d.eye.y), eyeR: uv(d.eye.x, d.eye.y), eyeW: d.eye.sock[0] * s / w,
    brow: uv(0, d.browY ?? 0.1)[1], nose: uv(0, d.tipY), mouth: uv(0, d.mouthY ?? 0.009), chin: uv(0, d.chin.c[1]),
    jawW: d.jaw.h[0] * s / w,
  };
  return m;
}

/** Adds head primitives to master (weights) and headZone (meshing) SDFs, in bind space. */
export function buildHeadPrims(master, headZone, P, J) {
  const d = P.headDef, s = d.s, H = J.head;
  const hp = p => add(H, sc(p, s));
  const both = fn => { fn(master); fn(headZone); };
  const bh = B.head;
  // neck (head zone copy is full radius; body zone is inset)
  const neckA = add(J.neck, [0, -0.045, 0.012]), neckB = add(J.head, [0, 0.03, 0.01]);
  headZone.cone(neckA, neckB, P.neckR * 1.02, P.neckR * 0.92, { bone: B.neck, k: 0.035 });
  // cranium & face masses
  both(z => z.ell(hp(d.cranium.c), sc(d.cranium.r, s), { bone: bh, k: 0.03 }));
  both(z => z.ell(hp(d.back.c), sc(d.back.r, s), { bone: bh, k: 0.03 }));
  both(z => z.ell(hp(d.mid.c), sc(d.mid.r, s), { bone: bh, k: 0.03 }));
  if (d.vjaw) { // tapered V mandible: two round cones from the jaw angles to the chin
    const jc = d.jaw.c, jh = d.jaw.h;
    const chinP = [0, d.chin.c[1] + 0.014, d.chin.c[2] + 0.012];
    for (const sg of [-1, 1]) both(z => z.cone(hp([sg * jh[0], jc[1] + 0.012, jc[2] + jh[2] * 0.55]), hp(chinP), d.jaw.rd * s * 1.05, d.jaw.rd * s * 0.78, { bone: bh, k: 0.03 }));
    both(z => z.ell(hp([0, jc[1] + 0.004, jc[2] - 0.01]), sc([jh[0] * 0.8, jh[1] * 0.9, jh[2] * 0.85], s), { bone: bh, k: 0.03 }));
  } else both(z => z.box(hp(d.jaw.c), sc(d.jaw.h, s), d.jaw.rd * s, { bone: bh, k: 0.03, rot: rotEuler(-0.12, 0, 0) }));
  both(z => z.ell(hp(d.chin.c), sc(d.chin.r, s), { bone: bh, k: 0.02 }));
  for (const sg of [-1, 1]) {
    both(z => z.ell(hp([sg * d.cheek.c[0], d.cheek.c[1], d.cheek.c[2]]), sc(d.cheek.r, s), { bone: bh, k: 0.02, tag: 3 }));
  }
  both(z => z.ell(hp(d.brow.c), sc(d.brow.r, s), { bone: bh, k: d.brow.k * s, rot: rotEuler(-0.2, 0, 0) }));
  // eyes: socket carve then eyelid bulge
  for (const sg of [-1, 1]) {
    const e = d.eye;
    headZone.ell(hp([sg * e.x, e.y + 0.001, e.z - 0.012]), sc([e.sock[0], e.sock[1] * 0.9, 0.009], s), { op: SUB, k: 0.012 * s, tag: 5, bone: bh });
    headZone.ell(hp([sg * e.x, e.y - 0.001, e.z - 0.003]), sc([e.sock[0] * 0.8, e.sock[1] * 0.62, 0.006], s), { k: 0.008 * s, tag: 5, bone: bh });
  }
  // nose
  both(z => z.cone(hp(d.noseA), hp(d.noseB), d.noseR[0] * s, d.noseR[1] * s, { bone: bh, k: 0.012 * s, tag: 2 }));
  both(z => z.sphere(hp([0, d.tipY, d.tipZ]), d.tip * s, { bone: bh, k: 0.008 * s, tag: 2 }));
  for (const sg of [-1, 1]) both(z => z.ell(hp([sg * d.alaX, d.tipY - 0.005, d.tipZ + 0.009]), sc(d.ala, s), { bone: bh, k: 0.006 * s, tag: 2 }));
  // lips
  both(z => z.ell(hp(d.lipU.c), sc(d.lipU.r, s), { bone: bh, k: 0.007 * s, tag: 1 }));
  both(z => z.ell(hp(d.lipL.c), sc(d.lipL.r, s), { bone: bh, k: 0.007 * s, tag: 1 }));
  // ears
  for (const sg of [-1, 1]) {
    const c = hp([sg * d.earC[0], d.earC[1], d.earC[2]]);
    if (d.ear === 'round') {
      both(z => z.ell(c, sc([0.012, 0.032, 0.021], s), { bone: bh, k: 0.008 * s, tag: 4, rot: rotEuler(-0.25, sg * 0.35, 0) }));
    } else if (d.ear === 'orc') {
      const dir = [sg * 0.75, 0.5, 0.42];
      both(z => z.ell(c, sc([0.011, 0.03, 0.02], s), { bone: bh, k: 0.008 * s, tag: 4, rot: rotAlign([sg * 0.2, 1, 0.25], [sg, 0, 0]) }));
      both(z => z.ell(add(c, sc([sg * 0.024, 0.02, 0.016], s)), sc([0.007, 0.036, 0.013], s), { bone: bh, k: 0.01 * s, tag: 4, rot: rotAlign(dir, [sg * 0.5, -0.2, 0.8]) }));
    } else { // elf: long, swept back and up
      const L = d.earLen ?? 1;
      const dir = [sg * 0.72, 0.5, 0.5];
      both(z => z.ell(c, sc([0.011, 0.03, 0.02], s), { bone: bh, k: 0.008 * s, tag: 4, rot: rotAlign([sg * 0.2, 1, 0.3], [sg, 0, 0]) }));
      const e1 = add(c, sc([sg * 0.038 * L, 0.028 * L, 0.03 * L], s));
      const e2 = add(c, sc([sg * 0.082 * L, 0.06 * L, 0.066 * L], s));
      both(z => z.ell(e1, sc([0.0085, 0.042 * L, 0.019], s), { bone: bh, k: 0.012 * s, tag: 4, rot: rotAlign(dir, [sg * 0.6, -0.3, 0.7]) }));
      both(z => z.ell(e2, sc([0.0075, 0.034 * L, 0.011], s), { bone: bh, k: 0.012 * s, tag: 4, rot: rotAlign(dir, [sg * 0.6, -0.3, 0.7]) }));
    }
  }
  // clip the head zone at the neck base (cap hidden inside the torso)
  // keep y >= cut(z), cut lower toward the front: -y + t*z <= -cutY + t*z0
  const t = 0.35, cutY = J.neck[1] - 0.034;
  headZone.plane([0, -1, t], -cutY + t * J.neck[2]);
}
