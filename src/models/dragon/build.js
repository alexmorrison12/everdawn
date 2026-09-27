// Builds (and caches) the dragon geometry for an element/seed/variant: SDF body + head + jaw meshes, hard parts,
// wings; skin weights, baked AO and hand-painted vertex colours.
import { buildRigDef, VARIANTS } from './rig.js';
import { buildBodySDF, buildHeadSDF, buildJawSDF } from './shape.js';
import { surfaceNets } from './mesher.js';
import { sdfWeights, sdfAO, aoAt, Acc, top4 } from './skin.js';
import { dress } from './dress.js';
import { buildWings } from './wings.js';
import { ELEMENTS } from './palette.js';
import { Simplex, RNG, smoothstep, clamp } from '../../core/noise.js';
import { linColor } from '../../engine/geom.js';

export const KIND = { skin: 0, hard: 1, plate: 2, eye: 3, mouth: 4, crystal: 5, membrane: 6, frill: 7 };

const RES = {
  boss: { body: 0.105, head: 0.06, jaw: 0.062, aoMargin: 0.9, fine: 0.35, broad: 1.7, smooth: 0 },
  drake: { body: 0.15, head: 0.085, jaw: 0.09, aoMargin: 0.9, fine: 0.4, broad: 1.7, smooth: 0 },
  whelp: { body: 0.4, head: 0.3, jaw: 0.3, aoMargin: 1.0, fine: 0.5, broad: 1.7, smooth: 0 },
};

export function makePalette(element) {
  const src = ELEMENTS[element] || ELEMENTS.ember;
  const pal = { style: src.style, hex: src };
  for (const k in src) if (typeof src[k] === 'number') pal[k] = linColor(src[k]);
  return pal;
}

const mix = (a, b, t, o) => { o[0] = a[0] + (b[0] - a[0]) * t; o[1] = a[1] + (b[1] - a[1]) * t; o[2] = a[2] + (b[2] - a[2]) * t; return o; };

export function buildDragonGeometry({ element = 'ember', seed = 0, variant = 'boss' } = {}) {
  const t0 = performance.now();
  const P = VARIANTS[variant] || VARIANTS.boss;
  const R = RES[variant] || RES.boss;
  const rig = buildRigDef(P);
  const pal = makePalette(element);
  const style = pal.style;
  const rng = new RNG((seed * 7919 + element.length * 131 + 17) >>> 0);
  const nz = new Simplex(seed + 3);
  const nB = rig.bones.length;
  const I = rig.idx;

  const { sdf: body, arc } = buildBodySDF(rig, style);
  const head = buildHeadSDF(rig, style);
  const jaw = buildJawSDF(rig, style);
  const tS = performance.now();
  const mb = surfaceNets(body, { cell: R.body, bounds: body.bounds(R.body * 3) });
  const mh = surfaceNets(head, { cell: R.head, bounds: head.bounds(R.head * 3) });
  const mj = surfaceNets(jaw, { cell: R.jaw, bounds: jaw.bounds(R.jaw * 3) });
  const tM = performance.now();
  // wider primitive lists for long-range queries (AO, part placement)
  for (const s of [body, head, jaw]) { const b = s.bounds(R.broad + 0.5); const bs = 0.8; s.prepare(b.min, bs, [0, 1, 2].map(i => Math.ceil((b.max[i] - b.min[i]) / bs)), R.aoMargin); }
  const sdfs = [body, head, jaw];
  const acc = new Acc();
  const sChest = arc.s[8], sHead = arc.s[1];

  // ---------------- body skin
  const wb = sdfWeights(body, mb.pos, mb.count, nB, mb.idx, R.smooth);
  const aob = sdfAO(sdfs, mb.pos, mb.nrm, mb.count, R.fine, R.broad);
  const tW = performance.now();
  const col = [0, 0, 0], tmp = [0, 0, 0];
  const paintSkin = (x, y, z, nx, ny, nzn, s, limb, curv, ao, region, out) => {
    // dorsal → flank → belly gradient
    const up = ny;
    mix(pal.belly, pal.flank, smoothstep(-0.72, -0.18, up), out);
    mix(out, pal.back, smoothstep(-0.02, 0.62, up), out);
    // banding: wedge stripes that start wide at the dorsal line and taper down the flanks
    const ph = s / 1.25 + nz.noise3(x * 0.25, y * 0.25, z * 0.25) * 0.18;
    const fr = Math.abs((ph - Math.floor(ph)) - 0.5) * 2;           // 0 at stripe centre → 1 between
    const width = 0.34 * smoothstep(-0.25, 0.75, up);
    const stripe = (1 - smoothstep(width * 0.75, width, fr)) * (width > 0.02 ? 1 : 0) * (1 - limb * 0.8) * (region === 0 ? 1 : 0.0);
    mix(out, pal.stripe, stripe * 0.75, out);
    // extremities darken (feet, wing-hands)
    if (limb > 0.01) {
      const ext = limb * smoothstep(1.3, 0.25, y) * 0.85;
      mix(out, pal.limb, ext, out);
    }
    // painterly mottling
    const n1 = nz.noise3(x * 0.9, y * 0.9, z * 0.9), n2 = nz.noise3(x * 3.1 + 7, y * 3.1, z * 3.1);
    let f = 1 + n1 * 0.13 + n2 * 0.06;
    // cavity / convexity
    f *= 1 + clamp(curv * 0.12, -0.28, 0.22);
    // baked AO
    f *= 0.2 + 0.8 * ao;
    out[0] *= f; out[1] *= f * (1 - n1 * 0.02); out[2] *= f;
    return out;
  };
  const glowMask = (x, y, z, ny, s, limb) => {
    // underside / throat crack glow, flank veins
    const under = smoothstep(-0.3, -0.75, ny) * (1 - limb);
    const neckThroat = smoothstep(sChest + 1, sHead + 0.5, s) * smoothstep(-0.1, -0.6, ny);
    const vein = smoothstep(0.62, 0.9, nz.noise3(x * 0.45 + 11, y * 0.45, z * 0.45) * 0.5 + 0.5) * smoothstep(0.2, -0.4, ny) * (1 - limb);
    return clamp(Math.max(under * 0.85, neckThroat * 0.9) + vein * 0.35, 0, 1);
  };
  acc.addMesh(mb, (i, c, si, sw, d) => {
    const x = mb.pos[i * 3], y = mb.pos[i * 3 + 1], z = mb.pos[i * 3 + 2], ny = mb.nrm[i * 3 + 1];
    const s = wb.hs[i], limb = wb.hl[i];
    paintSkin(x, y, z, mb.nrm[i * 3], ny, mb.nrm[i * 3 + 2], s, limb, mb.curv[i], aob[i], 0, c);
    for (let k = 0; k < 4; k++) { si[k] = wb.si[i * 4 + k]; sw[k] = wb.sw[i * 4 + k]; }
    const breath = Math.exp(-((s - sChest - 1.2) ** 2) / 3.5) * (1 - limb) * 0.6 + Math.exp(-((s - sHead - 1.2) ** 2) / 1.2) * smoothstep(0.2, -0.6, ny) * 0.5;
    d[0] = KIND.skin; d[1] = glowMask(x, y, z, ny, s, limb); d[2] = 1 / (0.2 * wb.hc[i]); d[3] = breath;
  });

  // ---------------- head
  const aoh = sdfAO(sdfs, mh.pos, mh.nrm, mh.count, R.fine * 0.7, R.broad * 0.6);
  const H = P.head;
  const hj = rig.J.head;
  acc.addMesh(mh, (i, c, si, sw, d) => {
    const x = mh.pos[i * 3], y = mh.pos[i * 3 + 1], z = mh.pos[i * 3 + 2], ny = mh.nrm[i * 3 + 1];
    const lx = (x - hj[0]) / H, ly = (y - hj[1]) / H, lz = (z - hj[2]) / H;
    paintSkin(x, y, z, mh.nrm[i * 3], ny, mh.nrm[i * 3 + 2], sHead + lz, 0, mh.curv[i] * 0.6, aoh[i], 1, c);
    // palate (mouth roof): underside inside the lip line
    const palate = smoothstep(-0.55, -0.85, ny) * smoothstep(-0.12, -0.2, ly) * smoothstep(-0.4, -0.7, lz);
    si[0] = I.head; sw[0] = 1; sw[1] = sw[2] = sw[3] = 0; si[1] = si[2] = si[3] = 0;
    const deep = smoothstep(-2.2, -0.6, lz);
    d[0] = palate > 0.5 ? KIND.mouth : KIND.skin; d[1] = palate > 0.5 ? 0.1 + 0.32 * deep : glowMask(x, y, z, ny, sHead, 0) * 0.45 * smoothstep(-0.5, -0.1, lz); d[2] = 1 / (0.09); d[3] = 0;
    if (palate > 0) mix(c, pal.mouth, palate, c);
  });

  // ---------------- jaw
  const aoj = sdfAO(sdfs, mj.pos, mj.nrm, mj.count, R.fine * 0.7, R.broad * 0.6);
  const jj = rig.J.jaw;
  acc.addMesh(mj, (i, c, si, sw, d) => {
    const x = mj.pos[i * 3], y = mj.pos[i * 3 + 1], z = mj.pos[i * 3 + 2], ny = mj.nrm[i * 3 + 1];
    const lx = (x - jj[0]) / H, ly = (y - jj[1]) / H, lz = (z - jj[2]) / H;
    paintSkin(x, y, z, mj.nrm[i * 3], ny, mj.nrm[i * 3 + 2], sHead + lz, 0, mj.curv[i] * 0.6, aoj[i], 2, c);
    // inside of the mouth: upward-facing and inside the jaw rim
    const inner = smoothstep(0.25, 0.7, ny) * smoothstep(0.3, 0.2, Math.abs(lx)) * smoothstep(0.05, -0.02, ly - 0.02);
    const rim = smoothstep(-0.2, 0.3, ny);   // no lava cracks on the lip rim
    const tongue = Math.abs(lx) < 0.2 && ly < 0.05 && lz < -0.1 && ny > 0.3 ? 1 : 0;
    si[0] = I.jaw; sw[0] = 1; sw[1] = sw[2] = sw[3] = 0; si[1] = si[2] = si[3] = 0;
    const m = Math.max(inner, tongue);
    if (m > 0) mix(c, tongue ? pal.tongue : pal.mouth, m, c);
    const deepJ = smoothstep(-1.9, -0.3, lz);
    d[0] = m > 0.5 ? KIND.mouth : KIND.skin; d[1] = m > 0.5 ? 0.08 + 0.3 * deepJ : glowMask(x, y, z, ny, sHead, 0) * 0.5 * (1 - rim) * smoothstep(-1.2, -0.4, lz); d[2] = 1 / 0.09; d[3] = 0;
  });
  // ---------------- hard parts
  const tP = performance.now();
  const pts = arc.pts, ss = arc.s;
  const mainLine = {
    sHead: ss[1], sChest: ss[8], sPelvis: ss[11], total: arc.total,
    at(s) {
      let i = 1; while (i < ss.length - 1 && ss[i] < s) i++;
      const a = pts[i - 1], b = pts[i], t = Math.max(0, Math.min(1, (s - ss[i - 1]) / (ss[i] - ss[i - 1] || 1)));
      const p = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
      const d = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], l = Math.hypot(d[0], d[1], d[2]) || 1;
      return { p, T: [d[0] / l, d[1] / l, d[2] / l] };
    },
  };
  const wacc = new Float32Array(nB), wsi = new Uint16Array(4), wsw = new Float32Array(4);
  const ctx = {
    acc, rig, pal, style, rng, body, head, jaw, KIND, eyes: [], mainLine, lod: variant === 'whelp' ? 0 : 1,
    aoAt: (p, n) => aoAt(sdfs, p[0], p[1], p[2], n[0], n[1], n[2], R.fine * 0.6, R.broad * 0.5),
    bodyW: (p) => { wacc.fill(0); const t = body.weightsAt(p[0], p[1], p[2], wacc, null); if (t > 0) for (let b = 0; b < nB; b++) wacc[b] /= t; else wacc[I.chest] = 1; top4(wacc, nB, wsi, wsw, 0); return { si: Array.from(wsi), sw: Array.from(wsw) }; },
  };
  dress(ctx);
  const tWing = performance.now();
  const wacc2 = new Acc();
  buildWings({ ...ctx, acc: wacc2 });
  const tEnd = performance.now();
  const geo = acc.build(rig.S);
  const wingGeo = wacc2.build(rig.S);
  return {
    geo, wingGeo, rig, pal, style, eyes: ctx.eyes.map(e => e.map(v => v * rig.S)),
    stats: {
      verts: acc.n + wacc2.n, tris: (acc.I.length + wacc2.I.length) / 3, wingVerts: wacc2.n, body: mb.count, head: mh.count, jaw: mj.count,
      ms: { sdf: +(tS - t0).toFixed(1), mesh: +(tM - tS).toFixed(1), weights: +(tW - tM).toFixed(1), headjaw: +(tP - tW).toFixed(1), parts: +(tWing - tP).toFixed(1), wings: +(tEnd - tWing).toFixed(1), total: +(performance.now() - t0).toFixed(1) },
      grid: mb.stats,
    },
  };
}
