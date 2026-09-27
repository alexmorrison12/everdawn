// Hair styles, beards and hoods: SDF-sculpted in head space, meshed with Surface Nets, decimated, skinned.
import { SDF, ADD, SUB, INT, rotEuler, rotAlign, surfaceNets, sdfAO, marchIn, refineVerts } from './sdf.js';
import { simplify } from './simplify.js';
import { makePiece, weightsAt, mergePieces } from './body.js';
import * as THREE from 'three';
import { PB } from './pieces.js';
import { B } from './rig.js';
import { SLOT } from './palette.js';
import { cached } from './pieces.js';
import { clamp, lerp, smoothstep, Simplex } from '../../core/noise.js';

const NZ = new Simplex(31);
// style names per race+sex (index = opts.hair)
export const HAIR_STYLES = {
  human_m: ['short', 'swept', 'ponytail', 'mohawk', 'bald', 'long'],
  human_f: ['long', 'ponytail', 'bun', 'braids', 'bob', 'pigtails'],
  dwarf_m: ['sides', 'short', 'backbraid', 'bald', 'mohawk'],
  dwarf_f: ['buns', 'braids', 'bun', 'pigtails'],
  orc_m: ['topknot', 'mohawk', 'bald', 'ponytail', 'short'],
  orc_f: ['ponytail', 'braids', 'mohawk', 'long', 'topknot'],
  elf_m: ['long', 'ponytail', 'swept', 'topknot', 'mohawk'],
  elf_f: ['long', 'ponytail', 'bun', 'braids', 'pigtails'],
};
export const BEARD_STYLES = ['none', 'goatee', 'full', 'braided', 'mustache', 'chops'];

// head-space helpers ---------------------------------------------------------------------------
function frame(base) {
  const d = base.P.headDef, s = d.s, H = base.JJ.J.head;
  const hp = (p) => [H[0] + p[0] * s, H[1] + p[1] * s, H[2] + p[2] * s];
  const sc = (r) => r.map(v => v * s);
  return { d, s, H, hp, sc };
}

function meshPiece(base, sdf, bmin, bmax, h, target, slot, wfn, shade) {
  const fn = (x, y, z) => sdf.eval(x, y, z);
  let m = surfaceNets(fn, bmin, bmax, h, { refine: -1, near: sdf.near ? (x, y, z, R) => sdf.near(x, y, z, R) : null });
  if (m.pos.length / 3 > target) m = simplify(m.pos, m.nrm, m.idx, target);
  refineVerts(fn, m.pos, m.nrm, h, 1);
  const n = m.pos.length / 3;
  const pc = makePiece(n, m.idx.length);
  pc.pos.set(m.pos); pc.nrm.set(m.nrm); pc.idx.set(m.idx);
  const headFn = (x, y, z) => Math.min(fn(x, y, z), base.sdfHead.eval(x, y, z));
  for (let v = 0; v < n; v++) {
    const x = m.pos[v * 3], y = m.pos[v * 3 + 1], z = m.pos[v * 3 + 2];
    const nx = m.nrm[v * 3], ny = m.nrm[v * 3 + 1], nz = m.nrm[v * 3 + 2];
    const w = wfn(x, y, z);
    let s = 0; for (const [, ww] of w) s += ww;
    for (let k = 0; k < 4; k++) { if (k < w.length) { pc.bi[v * 4 + k] = w[k][0]; pc.bw[v * 4 + k] = w[k][1] / s; } }
    const ao = sdfAO(headFn, x, y, z, nx, ny, nz, 0.008, 1);
    const f = (0.5 + 0.5 * ao) * shade(x, y, z, nx, ny, nz);
    pc.mul[v * 3] = f; pc.mul[v * 3 + 1] = f; pc.mul[v * 3 + 2] = f;
    pc.slot[v] = slot;
  }
  return pc;
}

// strand streak shading (hand-painted look)
function strandShade(F) {
  return (x, y, z, nx, ny, nz) => {
    const lx = (x - F.H[0]) / F.s, ly = (y - F.H[1]) / F.s, lz = (z - F.H[2]) / F.s;
    const az = Math.atan2(lx, lz);
    // painted strands: groove shadows + streaks that follow the fall of the hair
    const g = Math.abs(Math.sin(az * 13 + ly * 10));
    const st = 0.74 + 0.34 * Math.pow(g, 0.6) + 0.1 * NZ.noise2(az * 9, ly * 26);
    // sheen band across the crown, darker toward the tips/underside
    const sheen = 0.22 * Math.exp(-Math.pow((ly - 0.17) / 0.05, 2)) * Math.max(0, ny + 0.3);
    const top = 0.78 + 0.32 * Math.max(0, ny) - 0.15 * Math.max(0, -ny);
    return st * top + sheen;
  };
}

// ------------------------------------------------------------------------------------------------
export function hairPiece(base, style) {
  if (!style || style === 'bald') return null;
  return cached(`${base.key}|hair|${style}`, () => {
    const F = frame(base), { d, s, H, hp, sc } = F;
    const sd = new SDF();
    const cr = d.cranium;
    const thick = 0.014;
    const k = 0.02 * s;
    const bw = { op: ADD, k };
    // tags: 0 cap(head), 1 tail(hairA-C), 2 braidL, 3 braidR, 4 bun(head)
    const cap = (extra = 0, back = 0) => {
      sd.ell(hp([cr.c[0], cr.c[1] + 0.004 + extra * 0.5, cr.c[2] + 0.004 + back * 0.3]), sc([cr.r[0] + thick + extra * 0.3, cr.r[1] + thick * 0.7 + extra, cr.r[2] + thick + back]), { ...bw, tag: 0 });
    };
    const tailChain = (pts, r0, r1, tag = 1) => {
      for (let i = 0; i < pts.length - 1; i++) sd.cone(hp(pts[i]), hp(pts[i + 1]), lerp(r0, r1, i / (pts.length - 1)) * s, lerp(r0, r1, (i + 1) / (pts.length - 1)) * s, { k: 0.012 * s, tag });
    };
    const braid = (start, dir, len, r, tag) => {
      const n = Math.round(len / (r * 1.3));
      for (let i = 0; i < n; i++) {
        const t = i / n, wob = (i % 2 ? 1 : -1) * r * 0.35;
        const c = [start[0] + dir[0] * len * t + wob * (tag === 2 ? -0.3 : 0.3), start[1] + dir[1] * len * t, start[2] + dir[2] * len * t + wob * 0.5];
        sd.ell(hp(c), sc([r * (1 - t * 0.35), r * 0.85, r * (1 - t * 0.35)]), { k: 0.006 * s, tag });
      }
    };
    const hairlineCut = (fore = 0.086, side = 0.07, nape = -0.03, ears = true) => {
      // remove the face region: wide face ellipsoid gives a natural temple line; clear the ears for short styles
      const fy = (d.browY ?? 0.1) + 0.03;
      sd.ell(hp([0, fy - 0.1, -0.135]), sc([0.135, 0.1 + (fore - 0.086) * 0.5, 0.11]), { op: SUB, k: 0.018 * s });
      for (const sg of [-1, 1]) {
        sd.ell(hp([sg * 0.1, 0.025, -0.075]), sc([0.06, side, 0.055]), { op: SUB, k: 0.015 * s });
        if (ears) sd.ell(hp([sg * (d.earC[0] + 0.01), d.earC[1] - 0.005, d.earC[2] + 0.004]), sc([0.03, 0.042, 0.034]), { op: SUB, k: 0.012 * s });
      }
      // keep y >= cutY - 0.5 (z - z0): hair reaches lower at the back than at the sideburns
      sd.plane([0, -1, -0.5], -(H[1] + nape * s) - 0.5 * H[2], { op: INT, k: 0.02 * s });
    };
    switch (style) {
      case 'short': cap(0.004); hairlineCut(0.09); break;
      case 'bob': cap(0.012, 0.01); sd.ell(hp([0, 0.05, 0.025]), sc([0.118, 0.085, 0.11]), { k }); hairlineCut(0.085, 0.05, -0.04, false); break;
      case 'swept': cap(0.02, 0.02); sd.ell(hp([0, 0.17, 0.02]), sc([0.08, 0.05, 0.1]), { k }); sd.ell(hp([0, 0.1, 0.1]), sc([0.09, 0.08, 0.05]), { k }); hairlineCut(0.095); break;
      case 'long': case 'ponytail': case 'bun': case 'braids': case 'pigtails': case 'buns': case 'backbraid': {
        cap(0.01, 0.006);
        if (style === 'long') {
          sd.ell(hp([0, 0.02, 0.07]), sc([0.1, 0.13, 0.07]), { k: 0.03 * s, tag: 0 });
          tailChain([[0, 0.0, 0.09], [0, -0.1, 0.1], [0, -0.22, 0.08], [0, -0.32, 0.06]], 0.085, 0.06, 1);
          for (const sg of [-1, 1]) sd.ell(hp([sg * 0.09, 0.0, 0.03]), sc([0.03, 0.1, 0.05]), { k: 0.02 * s, tag: 0 });
        }
        if (style === 'ponytail') { sd.sphere(hp([0, 0.14, 0.11]), 0.03 * s, { k }); tailChain([[0, 0.14, 0.13], [0, 0.07, 0.17], [0, -0.05, 0.17], [0, -0.2, 0.14], [0, -0.3, 0.12]], 0.032, 0.012, 1); }
        if (style === 'bun') { sd.sphere(hp([0, 0.175, 0.125]), 0.05 * s, { k: 0.008 * s, tag: 4 }); sd.torus(hp([0, 0.165, 0.112]), 0.042 * s, 0.009 * s, { k: 0.006 * s, tag: 4, rot: rotEuler(0.9, 0, 0) }); }
        if (style === 'buns') { for (const sg of [-1, 1]) sd.sphere(hp([sg * 0.075, 0.11, 0.06]), 0.045 * s, { k, tag: 4 }); braid([0, 0.02, 0.11], [0, -1, 0.1], 0.2, 0.024, 1); }
        if (style === 'braids') { for (const sg of [-1, 1]) braid([sg * 0.085, 0.01, 0.0], [sg * 0.15, -1, -0.25], 0.26, 0.022, sg < 0 ? 2 : 3); }
        if (style === 'pigtails') { for (const sg of [-1, 1]) { sd.sphere(hp([sg * 0.09, 0.08, 0.05]), 0.03 * s, { k }); tailChain([[sg * 0.1, 0.08, 0.06], [sg * 0.13, -0.02, 0.06], [sg * 0.13, -0.14, 0.05]], 0.03, 0.012, sg < 0 ? 2 : 3); } }
        if (style === 'backbraid') { braid([0, 0.04, 0.11], [0, -1, 0.15], 0.3, 0.03, 1); }
        hairlineCut(style === 'long' ? 0.085 : 0.09, 0.06, style === 'long' ? -0.2 : -0.03, !(style === 'long' || style === 'bob'));
        break;
      }
      case 'mohawk': case 'topknot': {
        cap(-0.008); // stubble-thin base
        if (style === 'mohawk') { for (let i = 0; i < 7; i++) { const t = i / 6; const a = lerp(-0.4, 2.3, t); sd.ell(hp([0, cr.c[1] + Math.cos(a) * (cr.r[1] + 0.01), cr.c[2] + Math.sin(a) * (cr.r[2] + 0.01)]), sc([0.018, 0.045 - Math.abs(t - 0.3) * 0.02, 0.03]), { k: 0.015 * s, rot: rotEuler(-a, 0, 0) }); } }
        else { sd.sphere(hp([0, 0.2, 0.05]), 0.042 * s, { k, tag: 4 }); tailChain([[0, 0.23, 0.06], [0, 0.18, 0.13], [0, 0.08, 0.17], [0, -0.06, 0.16], [0, -0.18, 0.13]], 0.03, 0.014, 1); }
        hairlineCut(0.1, 0.08, 0.02);
        break;
      }
      case 'sides': { // bald top, bushy sides + back (dwarf)
        sd.ell(hp([0, 0.05, 0.04]), sc([0.118, 0.07, 0.11]), { k });
        sd.ell(hp([0, 0.2, 0.0]), sc([0.2, 0.08, 0.2]), { op: SUB, k: 0.03 * s });
        hairlineCut(0.08, 0.03, -0.04);
        break;
      }
      default: cap(0.004); hairlineCut();
    }
    sd.build();
    // grooves: perturb the field for strand ridges
    const groove = (d0, x, y, z) => {
      if (d0 > 0.01) return d0;
      const az = Math.atan2(x - H[0], z - H[2]);
      return d0 + 0.0028 * s * (Math.abs(Math.sin(az * 13 + (y - H[1]) * 10)) - 0.5);
    };
    const wrap = { eval: (x, y, z) => groove(sd.eval(x, y, z), x, y, z), near: (cx, cy, cz, R) => { const f = sd.near(cx, cy, cz, R); return (x, y, z) => groove(f(x, y, z), x, y, z); } };
    const hs = 0.0078 * s;
    const bmin = [H[0] - 0.2 * s, H[1] - 0.42 * s, H[2] - 0.2 * s], bmax = [H[0] + 0.2 * s, H[1] + 0.3 * s, H[2] + 0.28 * s];
    const tailY = [base.JJ.J.hairA[1], base.JJ.J.hairB[1], base.JJ.J.hairC[1]];
    const pd = new Float32Array(sd.n);
    const wfn = (x, y, z) => {
      const tagD = [1e9, 1e9, 1e9, 1e9, 1e9];
      sd.evalPrims(x, y, z, pd);
      for (let i = 0; i < sd.n; i++) if (sd.opOf(i) === ADD) { const t = sd.tagOf(i); tagD[t] = Math.min(tagD[t], pd[i]); }
      let best = 0; for (let t = 1; t < 5; t++) if (tagD[t] < tagD[best] - 0.004) best = t;
      if (best === 1) {
        if (y > tailY[0]) return [[B.head, 0.6], [B.hairA, 0.4]];
        if (y > tailY[1]) { const t = (tailY[0] - y) / (tailY[0] - tailY[1]); return [[B.hairA, 1 - t], [B.hairB, t]]; }
        if (y > tailY[2]) { const t = (tailY[1] - y) / (tailY[1] - tailY[2]); return [[B.hairB, 1 - t], [B.hairC, t]]; }
        return [[B.hairC, 1]];
      }
      if (best === 2 || best === 3) {
        const b1 = best === 2 ? B.braidL1 : B.braidR1, b2 = best === 2 ? B.braidL2 : B.braidR2;
        const y1 = base.JJ.J[best === 2 ? 'braidL2' : 'braidR2'][1];
        const t = clamp((H[1] - y) / (H[1] - y1 + 1e-4), 0, 1);
        return [[B.head, Math.max(0, 1 - t * 2)], [b1, Math.min(t, 1 - t) * 2 + 0.01], [b2, Math.max(0, t * 2 - 1)]];
      }
      return [[B.head, 1]];
    };
    const pc = meshPiece(base, wrap, bmin, bmax, hs, style === 'long' || style === 'braids' || style === 'pigtails' || style === 'buns' ? 1050 : 760, SLOT.HAIR, wfn, strandShade(F));
    return pc;
  });
}

// ------------------------------------------------------------------------------------------------
export function beardPiece(base, style) {
  if (!style || style === 'none') return null;
  return cached(`${base.key}|beard|${style}`, () => {
    const F = frame(base), { d, s, H, hp, sc } = F;
    const sd = new SDF();
    const jz = d.jaw.c[2], jy = d.jaw.c[1];
    const k = 0.015 * s;
    const dwarf = base.P.race === 'dwarf';
    const big = dwarf ? 1.35 : 1;
    // keep hanging masses in front of the chest surface
    const tor = base.chainSDF.torso, J = base.JJ.J;
    const frontZ = (y) => { const r = marchIn((x, yy, z) => tor.eval(x, yy, z), 0, y, J.spine[2], 0, 0, -1, 0.6); return J.spine[2] - r; };
    const onChest = (c, rz) => { if (c[1] > J.neck[1]) return c; const fz = frontZ(c[1]); return [c[0], c[1], Math.min(c[2], fz - rz * 0.55)]; };
    const must = () => { for (const sg of [-1, 1]) sd.cone(hp([sg * 0.006, d.mouthY + 0.014, -0.114]), hp([sg * 0.034 * big, d.mouthY - 0.004, -0.098]), 0.009 * s * big, 0.005 * s, { k: 0.006 * s, tag: 0 }); };
    if (style === 'goatee') { sd.ell(hp([0, jy - 0.042, -0.09]), sc([0.026, 0.035, 0.022]), { k }); must(); }
    if (style === 'mustache') must();
    if (style === 'chops') { for (const sg of [-1, 1]) sd.ell(hp([sg * 0.07, 0.03, -0.045]), sc([0.022, 0.05, 0.035]), { k }); must(); }
    if (style === 'full' || style === 'braided') {
      // jaw-hugging mass + chin mass hanging down
      sd.ell(hp([0, jy - 0.005, jz - 0.012]), sc([d.jaw.h[0] + 0.022, d.jaw.h[1] + 0.03, d.jaw.h[2] + 0.02]), { k: 0.02 * s, tag: 0 });
      for (const sg of [-1, 1]) sd.ell(hp([sg * 0.07, 0.035, -0.035]), sc([0.022, 0.045, 0.04]), { k: 0.02 * s, tag: 0 });
      sd.ell(onChest(hp([0, jy - 0.07 * big, -0.09 - 0.01 * big]), 0.045 * big * s), sc([0.06 * big, 0.08 * big, 0.045 * big]), { k: 0.03 * s, tag: 1 });
      if (dwarf) sd.ell(onChest(hp([0, jy - 0.15 * big, -0.1]), 0.04 * big * s), sc([0.07 * big, 0.07 * big, 0.04 * big]), { k: 0.03 * s, tag: 1 });
      must();
      if (style === 'braided') {
        for (const sg of [-1, 0, 1]) {
          const n = 10, L = (sg === 0 ? 0.2 : 0.17) * big;
          for (let i = 0; i < n; i++) {
            const t = i / (n - 1);
            const wob = (i % 2 ? 1 : -1) * 0.004 * big;
            const c = [sg * 0.036 * big + wob, jy - (dwarf ? 0.19 : 0.12) * big - t * L, -0.1 - 0.02 * big + t * 0.01];
            const r = (sg === 0 ? 0.021 : 0.017) * big * (1 - t * 0.35);
            sd.ell(onChest(hp(c), r * s), sc([r, r * 0.75, r * 0.85]), { k: 0.009 * s, tag: 1, rot: rotEuler(0, 0, (i % 2 ? 0.35 : -0.35)) });
          }
        }
      }
      // carve the mouth opening a little
      sd.ell(hp([0, d.mouthY - 0.004, -0.112]), sc([0.022, 0.009, 0.02]), { op: SUB, k: 0.006 * s });
    }
    sd.build();
    const bg = (d0, x, y, z) => (d0 > 0.01 ? d0 : d0 + 0.0016 * s * (Math.abs(Math.sin((x - H[0]) / s * 160 + (y - H[1]) / s * 25)) - 0.5));
    const g = { eval: (x, y, z) => bg(sd.eval(x, y, z), x, y, z), near: (cx, cy, cz, R) => { const f = sd.near(cx, cy, cz, R); return (x, y, z) => bg(f(x, y, z), x, y, z); } };
    const hs = 0.007 * s;
    const bmin = [H[0] - 0.16 * s, H[1] - 0.55 * s, H[2] - 0.3 * s], bmax = [H[0] + 0.16 * s, H[1] + 0.12 * s, H[2] + 0.05 * s];
    const y1 = base.JJ.J.beard1[1], y2 = base.JJ.J.beard2[1];
    const wfn = (x, y, z) => {
      if (y > y1) return [[B.head, 1]];
      if (y > y2) { const t = (y1 - y) / (y1 - y2); return [[B.head, 1 - t], [B.beard1, t]]; }
      return [[B.beard1, 0.4], [B.beard2, 0.6]];
    };
    const shade = (x, y, z, nx, ny, nz) => 0.85 + 0.2 * Math.max(0, ny) + 0.12 * Math.sin((x - H[0]) / s * 140 + (y - H[1]) / s * 20);
    const pc = meshPiece(base, g, bmin, bmax, hs, style === 'braided' ? 850 : 620, SLOT.HAIR, wfn, shade);
    if (style !== 'braided') return pc;
    // metal rings clasping the braid ends
    const pb = new PB(base);
    for (const sg of [-1, 0, 1]) {
      const L = (sg === 0 ? 0.2 : 0.17) * big;
      const c = onChest(hp([sg * 0.036 * big, jy - (dwarf ? 0.19 : 0.12) * big - L * 0.82, -0.1 - 0.02 * big + 0.008]), 0.02 * s);
      const r = (sg === 0 ? 0.021 : 0.017) * big * 0.72 * s;
      const ring = new THREE.CylinderGeometry(r * 1.12, r * 1.12, r * 1.1, 8, 1, true);
      pb.add(ring, { m: new THREE.Matrix4().makeTranslation(c[0], c[1], c[2]), slot: SLOT.METAL, bw: [[B.beard2, 1]], mulFn: (p, n) => { const f = 0.85 + 0.35 * Math.max(0, n.y) + 0.1 * Math.abs(n.x); return [f, f, f]; } });
    }
    return mergePieces([pc, pb.build()]);
  });
}

// ------------------------------------------------------------------------------------------------
export function hoodPiece(base, sp = {}) {
  return cached(`${base.key}|hood|${sp.peak ?? 1}`, () => {
    const F = frame(base), { d, s, H, hp, sc } = F;
    const J = base.JJ.J, P = base.P;
    const sd = new SDF();
    const cr = d.cranium;
    const t = 0.026;
    sd.ell(hp([cr.c[0], cr.c[1] + 0.006, cr.c[2] + 0.012]), sc([cr.r[0] + t, cr.r[1] + t, cr.r[2] + t + 0.012]), { k: 0.03 * s });
    sd.ell(hp([0, 0.02, 0.03]), sc([0.1 + t * 0.6, 0.1, 0.1]), { k: 0.04 * s });
    // peak
    sd.cone(hp([0, cr.c[1] + cr.r[1] * 0.6, cr.c[2] - 0.02]), hp([0, cr.c[1] + cr.r[1] + t + 0.02, cr.c[2] + 0.02]), 0.05 * s, 0.01 * s, { k: 0.03 * s });
    // cowl over the neck & shoulders (bind space)
    const cw = [J.neck[0], J.neck[1] - 0.02, J.neck[2] + 0.01];
    sd.ell(cw, [P.neckR * 2.3, 0.075, P.neckR * 2.0], { k: 0.05 });
    sd.ell([cw[0], cw[1] - 0.06, cw[2] + 0.01], [P.shX * 0.72, 0.06, P.ribs[2] * 0.95], { k: 0.05 });
    // face opening
    sd.ell(hp([0, 0.055, -0.16]), sc([0.078, 0.1, 0.1]), { op: SUB, k: 0.02 * s });
    sd.build();
    const hs = 0.009 * s;
    const bmin = [H[0] - 0.3, J.neck[1] - 0.2, H[2] - 0.22 * s], bmax = [H[0] + 0.3, H[1] + 0.32 * s, H[2] + 0.3 * s];
    const wfn = (x, y, z) => { const bi = [0, 0, 0, 0], bw = [0, 0, 0, 0]; weightsAt(base.master, x, y, z, bi, bw, 0, 0.02); const o = []; for (let k = 0; k < 4; k++) if (bw[k] > 0) o.push([bi[k], bw[k]]); return o.length ? o : [[B.head, 1]]; };
    const shade = (x, y, z, nx, ny, nz) => 0.82 + 0.22 * Math.max(0, ny) + 0.08 * Math.sin(Math.atan2(x - H[0], z - H[2]) * 9 + y * 20);
    return meshPiece(base, sd, bmin, bmax, hs, 820, SLOT.HOOD, wfn, shade);
  });
}
