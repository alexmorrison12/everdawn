// "Dressing": places every hard-surface part on the sculpted body — eyes, brow-horns, crest, cheek spikes, teeth,
// claws, spurs, dorsal spikes, tail weapon, belly plates, frills, crystals — with element style variants.
import { loft, bezier, hornPath, taper, eyeball, crystal, fin, bellyPlate, rotate, V } from './parts.js';
import { smoothstep, clamp } from '../../core/noise.js';
import { headToModel, jawToModel } from './shape.js';

const { norm, cross, dot, addS } = V;
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const mul = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
const lerp3 = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const mixc = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

/**
 * ctx: { acc, rig, pal, style, rng, body, head, jaw, aoAt(p,n), bodyW(p) → {si, sw}, KIND, eyes: [] }
 */
export function dress(ctx) {
  const { rig, pal, style, rng, KIND } = ctx;
  const J = rig.J, I = rig.idx, H = rig.P.head, P = rig.P;
  const hp = (p) => headToModel(rig, p), jp = (p) => jawToModel(rig, p);
  const hd = (d) => d; // directions unchanged (uniform scale)
  const lod = ctx.lod ?? 1;                // 1 = boss detail, 0 = whelp (cheap)
  const R = (n) => Math.max(4, Math.round(n * (lod ? 1 : 0.55)));
  const SG = (n) => lod ? n : Math.max(3, Math.round(n * 0.5));

  // ---- generic part emitter
  const part = (m, o) => {
    const { kind = KIND.hard, bone = null, base = null, c0 = pal.horn, c1 = pal.hornTip, glow = 0, glowTip = 0, aoK = 1, band = 0, tipPow = 1.6 } = o;
    let si = [0, 0, 0, 0], sw = [1, 0, 0, 0];
    if (bone != null) si = [bone, 0, 0, 0];
    else if (base) ({ si, sw } = ctx.bodyW(base));
    ctx.acc.addMesh(m, (i, c, SI, SW, d, uv) => {
      const t = m.t[i];
      const x = m.pos[i * 3], y = m.pos[i * 3 + 1], z = m.pos[i * 3 + 2];
      let col = mixc(c0, c1, Math.pow(clamp(t, 0, 1), tipPow));
      if (band) col = mul(col, 1 - band * Math.pow(Math.max(0, Math.sin(t * Math.PI * 2 * 5 + 0.5)), 6));
      const ao = aoK ? ctx.aoAt([x, y, z], [m.nrm[i * 3], m.nrm[i * 3 + 1], m.nrm[i * 3 + 2]]) : 1;
      const f = 0.25 + 0.75 * ao;
      c[0] = col[0] * f; c[1] = col[1] * f; c[2] = col[2] * f;
      for (let k = 0; k < 4; k++) { SI[k] = si[k]; SW[k] = sw[k]; }
      d[0] = kind; d[1] = glow + glowTip * Math.pow(clamp(t, 0, 1), 3); d[2] = 0; d[3] = 0;
      uv[0] = m.uv[i * 2]; uv[1] = m.uv[i * 2 + 1];
    });
  };
  const S = style;

  // ================= eyes
  for (const s of [1, -1]) {
    const c = hp([0.445 * s, 0.205, -1.0]);
    const m = eyeball(c, 0.095 * H, [0.62 * s, 0.06, -0.78], [0, 1, 0], lod ? 14 : 7);
    part(m, { kind: KIND.eye, bone: I.head, c0: [0.05, 0.02, 0.02], c1: [0.05, 0.02, 0.02], aoK: 0 });
    ctx.eyes.push(c);
  }

  // ================= brow-horns (brow ridge sweeping back into the main horn)
  const HS = P.horn ?? 1, SPK = P.spikes ?? 1;
  const hornR = 0.25 * (S.horn === 'long' ? 0.88 : S.horn === 'jag' ? 0.85 : 1) * (0.6 + 0.4 * HS);
  for (const s of [1, -1]) {
    const X = (v) => [v[0] * s, v[1], v[2]];
    // one smooth sweep: brow ridge above the eye → horn base behind the skull → style-specific horn
    const b0 = hp([0.52 * s, 0.37, -1.25]), b1 = hp([0.49 * s, 0.47, -0.8]), base = hp([0.39 * s, 0.52, -0.22]);
    const browPts = bezier([b0, b1, base], 6);
    let horn;
    const hl = (S.horn === 'long' ? 2.8 : S.horn === 'hook' ? 2.1 : S.horn === 'jag' ? 2.2 : 2.3) * H * HS * rng.range(0.94, 1.06);
    const tan = norm(sub(base, b1));                   // continue the brow direction smoothly
    const C1 = (d) => add(base, add(mul(tan, 0.28 * hl), mul(X(d), hl)));
    if (S.horn === 'swept') horn = bezier([base, C1([0.18, 0.02, 0.45]), add(base, mul(X([0.5, 0.4, 1.02]), hl))], 14);
    else if (S.horn === 'long') horn = bezier([base, C1([0.1, 0.04, 0.55]), add(base, mul(X([0.36, 0.32, 1.0]), hl))], 14);
    else if (S.horn === 'hook') horn = bezier([base, C1([0.25, 0.35, 0.3]), add(base, mul(X([0.66, 0.3, 0.76]), hl)), add(base, mul(X([0.74, -0.18, 0.52]), hl))], 16);
    else if (S.horn === 'jag') horn = [base, add(base, mul(X([0.18, 0.26, 0.34]), hl)), add(base, mul(X([0.34, 0.3, 0.52]), hl)), add(base, mul(X([0.4, 0.56, 0.66]), hl)), add(base, mul(X([0.52, 0.6, 0.86]), hl)), add(base, mul(X([0.56, 0.95, 1.0]), hl))];
    else { // spiral
      const tw = [];
      const dir = norm(X([0.42, 0.55, 0.72])), u = norm(cross(dir, [0, 1, 0])), w = cross(u, dir);
      for (let i = 0; i <= 18; i++) {
        const t = i / 18, a = t * Math.PI * 3.2 * s, r = 0.16 * H * Math.sin(t * Math.PI) * (1 - t * 0.3);
        tw.push(add(add(base, mul(dir, t * hl)), add(mul(u, Math.cos(a) * r), mul(w, Math.sin(a) * r))));
      }
      horn = tw;
    }
    const path = [...browPts, ...horn.slice(1)];
    const nb = browPts.length - 1, nt = path.length - 1;
    const rBase = hornR * H * 0.95;
    const sec = (t, i) => {
      if (i <= nb) { const f = i / nb; const r = (0.07 + (rBase / H - 0.07) * f * f) * H; return [r * 1.15, r * (0.5 + 0.5 * f)]; }
      const u = (i - nb) / (nt - nb);
      let r = rBase * Math.pow(1 - u, 1.05);
      if (S.horn !== 'jag') r *= 1 + 0.1 * Math.pow(Math.max(0, Math.sin(u * Math.PI * 11)), 5) * (1 - u);
      return [r, r * 0.84];
    };
    const m = loft(path, R(12), sec, [0, 1, 0]);
    part(m, { bone: I.head, c0: pal.horn, c1: pal.hornTip, band: 0.3, glowTip: S.crystal ? 0.3 : 0.1, tipPow: 2.4 });
    // secondary lower horn / cheek spikes
    const cheekN = S.cheek === 'frill' ? 0 : lod ? 3 : 1;
    for (let k = 0; k < cheekN; k++) {
      const b = hp([0.6 * s, 0.1 - k * 0.17, -0.02 + k * 0.08]);
      const len = (0.95 - k * 0.22) * H * (S.cheek === 'crystal' ? 0.8 : 1);
      if (S.cheek === 'crystal') { part(crystal(b, X([0.45, -0.1 - k * 0.15, 0.9]), len, 0.07 * H, lod ? 6 : 4, rng.range(0, 1)), { bone: I.head, kind: KIND.crystal, c0: pal.spike, c1: pal.spikeTip, glow: 0.5, glowTip: 0.8 }); continue; }
      const path2 = hornPath(b, X([0.5, -0.05 - k * 0.2, 0.86]), len, X([0, 1, 0]), 0.5, SG(7));
      part(loft(path2, R(8), taper(0.085 * H * (1 - k * 0.18), { flat: 0.8 }), [0, 1, 0]), { bone: I.head, c0: pal.horn, c1: pal.hornTip, glowTip: 0.1 });
    }
    // brow spikes above the eye
    for (let k = 0; k < (lod ? 2 : 0); k++) {
      const b = hp([0.52 * s, 0.46 - k * 0.02, -1.08 + k * 0.28]);
      const path3 = hornPath(b, X([0.35, 0.55, 0.75]), (0.34 - k * 0.08) * H, X([-1, 0, 0]), -0.4, 5);
      part(loft(path3, R(6), taper(0.05 * H, { flat: 0.7 }), [0, 1, 0]), { bone: I.head, c0: pal.horn, c1: pal.hornTip });
    }
    // jaw spikes (beard)
    for (let k = 0; k < (lod ? 3 : 0); k++) {
      const b = jp([0.36 * s - k * 0.05 * s, -0.24 + k * 0.01, -0.7 - k * 0.42]);
      const path4 = hornPath(b, X([0.35, -0.7, 0.62]), (0.42 - k * 0.08) * H, X([1, 0, 0]), -0.5, 5);
      part(loft(path4, R(6), taper(0.055 * H, { flat: 0.75 }), [0, 0, 1]), { bone: I.jaw, c0: pal.horn, c1: pal.hornTip });
    }
    // venom head frills: webbed fans behind the cheeks
    if (S.cheek === 'frill') {
      const basePts = [], tipPts = [];
      for (let k = 0; k <= 5; k++) {
        const f = k / 5;
        basePts.push(hp([0.55 * s, 0.35 - f * 0.6, -0.1 + f * 0.1]));
        const a = -0.2 + f * 1.4;
        tipPts.push(hp([(0.55 + 0.9 * Math.cos(a) * 0.6) * s, 0.35 - f * 0.6 + 0.5 * Math.cos(a), 0.45 + 0.35 * Math.sin(a)]));
      }
      part(fin(basePts, tipPts, 0.012 * H, X([1, 0, 0.3]), lod ? 5 : 2), { bone: I.head, kind: KIND.frill, c0: pal.frillCol, c1: pal.frillSpot, glow: 0.2, glowTip: 0.4, tipPow: 3 });
      if (lod) for (let k = 0; k <= 5; k++) part(loft([basePts[k], lerp3(basePts[k], tipPts[k], 0.5), mul(add(tipPts[k], mul(sub(tipPts[k], basePts[k]), 0.05)), 1)], 5, taper(0.028 * H), [0, 1, 0]), { bone: I.head, c0: pal.horn, c1: pal.hornTip });
    }
  }
  // nose horn
  if (S.horn !== 'hook' && lod) {
    const b = hp([0, 0.25, -2.12]);
    part(loft(hornPath(b, [0, 0.9, -0.4], 0.22 * H, [1, 0, 0], 1.1, 5), R(7), taper(0.06 * H, { flat: 0.7 }), [0, 0, -1]), { bone: I.head, c0: pal.horn, c1: pal.hornTip });
  }
  // crest along the back of the skull
  const crestN = lod ? 5 : 2;
  for (let k = 0; k < crestN; k++) {
    const f = k / (crestN - 1);
    const b = hp([0, 0.6 - f * 0.18, -0.55 + f * 0.62]);
    const len = (S.crest === 'crown' ? 0.75 - f * 0.2 : 0.45 + f * 0.12) * H;
    if (S.crest === 'crystal') { part(crystal(b, [0, 0.8, 0.6], len, 0.07 * H, lod ? 6 : 4, rng.range(0, 1)), { bone: I.head, kind: KIND.crystal, c0: pal.spike, c1: pal.spikeTip, glow: 0.5, glowTip: 0.8 }); continue; }
    const path = hornPath(b, [0, 0.75, 0.66], len, [1, 0, 0], S.crest === 'frill' ? 0.9 : 0.6, SG(6));
    part(loft(path, R(8), taper(0.075 * H, { flat: 0.4 }), [0, 0, 1]), { bone: I.head, c0: pal.spike, c1: pal.spikeTip, glowTip: 0.15 });
  }
  if (S.crest === 'crown') for (const s of [1, -1]) for (let k = 0; k < (lod ? 3 : 1); k++) {
    const b = hp([0.22 * s, 0.56 - k * 0.04, -0.35 + k * 0.25]);
    part(loft(hornPath(b, [0.3 * s, 0.85, 0.45], (0.55 - k * 0.1) * H, [1, 0, 0], 0.3, 5), R(6), taper(0.05 * H, { flat: 0.6 }), [0, 0, 1]), { bone: I.head, c0: pal.spike, c1: pal.spikeTip, glowTip: 0.4 });
  }

  // ================= mouth bag: cheek + throat membrane between palate rim and lower jaw (hidden when closed)
  {
    const N = lod ? 16 : 6, RW = lod ? 6 : 3;
    const up = [], lo = [], ctr = [];
    for (let i = 0; i <= N; i++) {
      const a = i / N, ang = (a - 0.5) * Math.PI, sx = Math.sin(ang), cz = Math.cos(ang);
      up.push(hp([0.33 * sx, -0.21, -0.86 + 0.72 * cz]));
      lo.push(jp([0.29 * sx, 0.03, -0.56 + 0.62 * cz]));
      ctr.push(cz);
    }
    const base = ctx.acc.n;
    const bulgeDir = (i) => { const a = i / N, ang = (a - 0.5) * Math.PI; return [Math.sin(ang), 0, Math.cos(ang)]; };
    for (let r = 0; r <= RW; r++) {
      const t = r / RW;
      for (let i = 0; i <= N; i++) {
        const bd = bulgeDir(i), bl = Math.sin(Math.PI * t) * 0.1 * H;
        const p = add(lerp3(up[i], lo[i], t), mul(bd, bl));
        const deep = ctr[i];
        const c = mixc(pal.mouth, mul(pal.mouth, 0.35), deep * 0.6);
        ctx.acc.vert(p[0], p[1], p[2], -bd[0], 0, -bd[2], c[0], c[1], c[2], i / N, t, [I.head, I.jaw, 0, 0], [1 - t, t, 0, 0], [KIND.mouth, 0.3 + 0.7 * deep * deep, 0, 0]);
      }
    }
    for (let r = 0; r < RW; r++) for (let i = 0; i < N; i++) {
      const a = base + r * (N + 1) + i, b = a + N + 1;
      ctx.acc.tri(a, a + 1, b); ctx.acc.tri(a + 1, b + 1, b);
    }
  }

  // ================= teeth
  const tooth = (b, dir, len, r, bone, curlAxis, curl) => {
    const path = hornPath(b, dir, len, curlAxis, curl, SG(4));
    part(loft(path, lod ? 6 : 4, taper(r, { pow: 0.9 }), [0, 0, -1]), { bone, c0: pal.toothBase, c1: pal.tooth, tipPow: 0.5, aoK: 0.5 });
  };
  const nUp = lod ? 9 : 2;
  for (const s of [1, -1]) {
    for (let k = 0; k < nUp; k++) {
      const f = k / (nUp - 1);
      const z = -0.72 - f * 1.58;
      const xw = 0.43 + (0.26 - 0.43) * ((z + 0.55) / -1.8);
      const fang = lod ? Math.exp(-((f - 0.8) ** 2) / 0.004) : f > 0.7 ? 1 : 0;
      const len = (0.1 + 0.05 * Math.sin(k * 2.3) ** 2 + fang * 0.3) * H;
      tooth(hp([(xw - 0.05) * s, -0.2 - 0.004 * k, z]), [0.1 * s, -1, 0.12], len, (0.035 + fang * 0.025) * H, I.head, [1, 0, 0], 0.25);
    }
    const nLo = lod ? 8 : 2;
    for (let k = 0; k < nLo; k++) {
      const f = k / (nLo - 1);
      const z = -0.4 - f * 1.62;
      const xw = 0.46 + (0.24 - 0.46) * ((z - 0.15) / -2.3);
      const fang = lod ? Math.exp(-((f - 0.93) ** 2) / 0.003) : f > 0.9 ? 1 : 0;
      const len = (0.08 + 0.04 * Math.sin(k * 1.7) ** 2 + fang * 0.26) * H;
      tooth(jp([(xw - 0.05 + fang * 0.04) * s, 0.06, z]), [0.08 * s, 1, 0.1], len, (0.03 + fang * 0.022) * H, I.jaw, [1, 0, 0], -0.25);
    }
    if (lod) for (let k = 0; k < 2; k++) tooth(hp([(0.08 + k * 0.08) * s, -0.2, -2.46 + k * 0.05]), [0, -1, -0.1], 0.08 * H, 0.025 * H, I.head, [1, 0, 0], 0.2);
  }

  // ================= claws & spurs
  const claw = (b, dir, len, r, bone, curlAxis, curl = 0.9) => {
    const path = hornPath(b, dir, len, curlAxis, curl, SG(7));
    part(loft(path, lod ? 7 : 4, taper(r, { flat: 0.72, pow: 0.9 }), [0, 1, 0]), { bone, c0: pal.claw, c1: pal.clawTip, tipPow: 2.5, band: 0.12 });
  };
  for (const [s, sd] of [[1, 'R'], [-1, 'L']]) {
    const G = P.girth;
    for (const dx of [-0.19, 0, 0.19]) {
      const b = add(J['claw' + sd], [dx * 1.45 * s * G, 0.08, dx === 0 ? -0.1 : 0.0]);
      claw(b, [dx * s * 0.6, -0.1, -1], 0.5, 0.1, I['fing' + sd], [1, 0, 0], -1.2);
      const bh = add(J['toe' + sd], [dx * 1.5 * s * G, 0.08, dx === 0 ? -0.1 : 0.01]);
      claw(bh, [dx * s * 0.6, -0.1, -1], 0.46, 0.095, I['toes' + sd], [1, 0, 0], -1.2);
    }
    if (lod) {
      claw(add(J['wrist' + sd], [-0.33 * s, -0.36, -0.36]), [-0.3 * s, -0.3, -1], 0.3, 0.06, I['hand' + sd], [1, 0, 0], -1.0); // dewclaw
      claw(add(J['hock' + sd], [0, 0.05, 0.18]), [0.1 * s, 0.25, 1], 0.5, 0.08, I['foot' + sd], [1, 0, 0], 0.7);   // heel spur
      claw(add(J['elbow' + sd], [0.02 * s, 0.05, 0.4]), [0.15 * s, 0.35, 1], 0.7, 0.13, I['fore' + sd], [1, 0, 0], 0.5); // elbow spike
    }
    claw(J['thumb' + sd], [0.1 * s, -0.25, -1], 0.45 * P.wing, 0.07 * P.wing, I['wing' + sd + '2'], [1, 0, 0], -1.1);
    if (lod) claw(add(J['wE' + sd], [0, 0.12, 0.1]), [0.25 * s, 0.4, 1], 0.55 * P.wing, 0.09 * P.wing, I['wing' + sd + '1'], [1, 0, 0], 0.4);
  }

  // ================= dorsal spikes (neck → back → tail) and tail weapon
  const line = ctx.mainLine; // { at(s) → {p, T} , sHead, sChest, sPelvis, total }
  const spikes = [];
  const prof = (s) => { // size profile along the body
    const { sHead, sChest, sPelvis, total } = line;
    if (s < sChest) return 0.34 + 0.4 * smoothstep(sHead, sChest, s);
    if (s < sPelvis) return 0.74 + 0.22 * Math.sin((s - sChest) / (sPelvis - sChest) * Math.PI) ;
    return 0.72 * Math.pow(1 - (s - sPelvis) / (total - sPelvis), 0.8) + 0.12;
  };
  const sStart = line.sHead + 0.55 * H, sEnd = line.total - 1.05;
  const nSp = lod ? 30 : 9;
  for (let k = 0; k < nSp; k++) {
    const f = k / (nSp - 1);
    const s = sStart + (sEnd - sStart) * Math.pow(f, 0.92);
    spikes.push({ s, size: prof(s) * SPK * rng.range(0.9, 1.1) });
  }
  for (const sp of spikes) {
    const { p, T } = line.at(sp.s);
    const U = norm(addS([0, 1, 0], T, -dot([0, 1, 0], T)));
    const hit = ctx.body.raycastOut(p[0], p[1], p[2], U[0], U[1], U[2], 6, 0.01);
    if (hit < 0) continue;
    const b = addS(p, U, hit - 0.06 * sp.size);
    const L = sp.size * (S.spike === 'tall' ? 1.35 : S.spike === 'hook' ? 0.8 : 1.05);
    const sw = rotate(U, norm(cross(U, T)), S.spike === 'tall' ? 0.35 : 0.55);   // lean back
    if (S.spike === 'crystal') {
      part(crystal(b, sw, L * 1.05, 0.13 * sp.size, lod ? 6 : 4, rng.range(0, 1)), { base: b, kind: KIND.crystal, c0: pal.spike, c1: pal.spikeTip, glow: 0.45, glowTip: 0.9 });
      if (lod && sp.size > 0.5) for (const sd of [1, -1]) {
        const side = norm(cross(T, U));
        const d2 = norm(add(add(mul(sw, 0.8), mul(side, 0.45 * sd)), mul(T, 0.2)));
        part(crystal(addS(b, side, 0.12 * sd * sp.size), d2, L * 0.55, 0.08 * sp.size, 5, rng.range(0, 1)), { base: b, kind: KIND.crystal, c0: pal.spike, c1: pal.spikeTip, glow: 0.45, glowTip: 0.9 });
      }
      continue;
    }
    const bendAx = norm(cross(T, U));
    let curl = S.spike === 'hook' ? 1.3 : S.spike === 'tall' ? 0.25 : 0.6;
    const path = hornPath(b, sw, L, mul(bendAx, -1), curl, SG(6));
    let sec = taper(0.26 * sp.size, { flat: 0.38, pow: 0.9 });
    if (S.spike === 'jagged') { const j = rng.range(0.6, 1.0); sec = ((base) => (t) => { const r = base(t); const n = 1 + 0.25 * Math.sin(t * 17 + sp.s); return [r[0] * n, r[1] * n * j]; })(sec); }
    const m = loft(path, R(8), sec, T);
    part(m, { base: b, c0: pal.spike, c1: pal.spikeTip, glowTip: 0.2, band: 0.15 });
  }
  // venom: webbed dorsal fin between neck/back spikes
  if (S.frill && lod) {
    const basePts = [], tipPts = [];
    for (const sp of spikes) {
      if (sp.s > line.sPelvis + 1.5) break;
      const { p, T } = line.at(sp.s);
      const U = [0, 1, 0];
      const hit = ctx.body.raycastOut(p[0], p[1], p[2], 0, 1, 0, 6, 0.01);
      const b = addS(p, U, hit - 0.05);
      basePts.push(b); tipPts.push(addS(addS(b, U, sp.size * 0.62), T, sp.size * 0.35));
    }
    if (basePts.length > 2) {
      const m = fin(basePts, tipPts, 0.02, [1, 0, 0], 3);
      ctx.acc.addMesh(m, (i, c, SI, SW, d, uv) => {
        const x = m.pos[i * 3], y = m.pos[i * 3 + 1], z = m.pos[i * 3 + 2];
        const { si, sw } = ctx.bodyW([x, y - 0.3, z]);
        for (let k = 0; k < 4; k++) { SI[k] = si[k]; SW[k] = sw[k]; }
        const col = mixc(pal.frillCol, pal.frillSpot, Math.pow(m.t[i], 2.5));
        c[0] = col[0]; c[1] = col[1]; c[2] = col[2];
        d[0] = KIND.frill; d[1] = 0.25 + 0.5 * m.t[i]; d[2] = 0; d[3] = 0; uv[0] = m.uv[i * 2]; uv[1] = m.uv[i * 2 + 1];
      });
    }
  }
  // lateral tail spikes
  const nLat = lod ? 4 : 1;
  for (let k = 0; k < nLat; k++) {
    const s = line.total - 1.2 - k * 0.55;
    const { p, T } = line.at(s);
    for (const sd of [1, -1]) {
      const side = norm(cross(T, [0, 1, 0]));
      const dir = norm(add(mul(side, sd), mul(T, 0.8)));
      const hit = ctx.body.raycastOut(p[0], p[1], p[2], side[0] * sd, 0, side[2] * sd, 3, 0.005);
      if (hit < 0) continue;
      const b = addS(p, mul(side, sd), hit - 0.03);
      const len = (0.35 + k * 0.08) * (S.tail === 'crystal' ? 1.2 : 1);
      if (S.spike === 'crystal') part(crystal(b, dir, len, 0.06, 5, rng.range(0, 1)), { base: b, kind: KIND.crystal, c0: pal.spike, c1: pal.spikeTip, glow: 0.4, glowTip: 0.9 });
      else part(loft(hornPath(b, dir, len, [0, 1, 0], 0.3 * sd, 5), R(6), taper(0.07, { flat: 0.45 }), [0, 1, 0]), { base: b, c0: pal.spike, c1: pal.spikeTip, glowTip: 0.2 });
    }
  }
  // tail weapon
  {
    const e = J.tailEnd, t11 = J.tail[11];
    const T = norm(sub(e, t11));
    const bone = I.tail12;
    const b = addS(e, T, -0.25);
    const side = norm(cross(T, [0, 1, 0])), up = norm(cross(side, T));
    if (S.tail === 'spade' || S.tail === 'scythe') {
      const len = 1.5, w = S.tail === 'spade' ? 0.55 : 0.4;
      const path = S.tail === 'spade' ? [b, addS(b, T, len * 0.5), addS(b, T, len)] : bezier([b, addS(addS(b, T, len * 0.6), up, 0.1), addS(addS(addS(b, T, len * 0.9), side, 0.55), up, 0.35)], 10);
      const sec = (t) => { const wd = w * Math.sin(Math.PI * Math.pow(t, 0.55)) * (1 - t * 0.2); return [Math.max(wd, 0.0), Math.max(0.07 * (1 - t), 0.0) + (t < 1 ? 0.012 : 0)]; };
      const m = loft(S.tail === 'spade' ? bezier([path[0], path[1], path[2]], 12) : path, R(10), sec, up, (a) => { const c = Math.cos(a), s2 = Math.sin(a); return [c, s2 * (0.6 + 0.4 * Math.abs(c))]; });
      part(m, { bone, c0: pal.spike, c1: pal.spikeTip, glow: 0.05, glowTip: 0.5, band: 0.1 });
      part(loft(hornPath(addS(b, T, 0.2), T, len * 1.05, side, 0, 4), R(6), taper(0.1, { flat: 1 }), up), { bone, c0: pal.spike, c1: pal.spikeTip });
    } else if (S.tail === 'crystal') {
      for (let k = 0; k < (lod ? 5 : 2); k++) {
        const d = norm(add(add(T, mul(up, rng.range(-0.3, 0.6))), mul(side, rng.range(-0.5, 0.5))));
        part(crystal(addS(b, T, 0.1 * k), k === 0 ? T : d, k === 0 ? 1.4 : rng.range(0.5, 0.9), k === 0 ? 0.14 : 0.08, lod ? 6 : 4, rng.range(0, 1)), { bone, kind: KIND.crystal, c0: pal.spike, c1: pal.spikeTip, glow: 0.5, glowTip: 1.0 });
      }
    } else if (S.tail === 'stinger') {
      const path = bezier([b, addS(addS(b, T, 0.6), up, 0.25), addS(addS(b, T, 0.7), up, 1.0), addS(addS(b, T, 0.25), up, 1.35)], 12);
      part(loft(path, R(9), (t) => { const r = 0.2 * Math.pow(1 - t, 0.7) * (1 + 0.6 * Math.exp(-((t - 0.25) ** 2) / 0.02)); return [r, r]; }, side), { bone, c0: pal.spike, c1: pal.spikeTip, glowTip: 0.8, band: 0.2 });
    } else if (S.tail === 'fork') {
      for (const sd of [1, -1]) {
        const path = hornPath(b, norm(add(T, mul(side, 0.45 * sd))), 1.2, mul(up, sd), -0.5, 8, (t) => mul(up, Math.sin(t * Math.PI * 3) * 0.06));
        part(loft(path, R(7), taper(0.11, { flat: 0.6 }), up), { bone, c0: pal.spike, c1: pal.spikeTip, glowTip: 0.6 });
      }
    }
  }

  // ================= belly plates
  const plates = [];
  const nNeck = lod ? 9 : 3, nBelly = lod ? 8 : 3, nTail = lod ? 13 : 0;
  const sN0 = line.sHead + 0.9 * H, sN1 = line.sChest - 0.2;
  for (let k = 0; k < nNeck; k++) plates.push({ s: sN0 + (sN1 - sN0) * k / nNeck, len: (sN1 - sN0) / nNeck, arc: 0.95, th: 0.05 });
  const sB0 = line.sChest - 0.2, sB1 = line.sPelvis + 0.3;
  for (let k = 0; k < nBelly; k++) plates.push({ s: sB0 + (sB1 - sB0) * k / nBelly, len: (sB1 - sB0) / nBelly, arc: 0.9, th: 0.06 });
  const sT0 = line.sPelvis + 0.9, sT1 = line.total - 1.0;
  for (let k = 0; k < nTail; k++) {
    const f = k / nTail;
    plates.push({ s: sT0 + (sT1 - sT0) * Math.pow(f, 0.85), len: (sT1 - sT0) / nTail * (1.15 - f * 0.4), arc: 0.85, th: 0.045 });
  }
  for (const pl of plates) {
    const { p, T } = line.at(pl.s + pl.len * 0.5);
    const U = norm(addS([0, 1, 0], T, -dot([0, 1, 0], T)));
    const m = bellyPlate(ctx.body, p, T, U, pl.len * 0.56, pl.arc, pl.th, lod ? 8 : 3);
    ctx.acc.addMesh(m, (i, c, SI, SW, d, uv) => {
      const x = m.pos[i * 3], y = m.pos[i * 3 + 1], z = m.pos[i * 3 + 2];
      const { si, sw } = ctx.bodyW([x, y, z]);
      for (let k = 0; k < 4; k++) { SI[k] = si[k]; SW[k] = sw[k]; }
      const vv = m.uv[i * 2 + 1], uu = m.uv[i * 2];
      const edge = Math.max(smoothstep(0.55, 1.0, vv), smoothstep(0.25, 0.0, vv) * 0.6, Math.pow(Math.abs(uu * 2 - 1), 4));
      const col = mixc(pal.plate, pal.plateEdge, edge * 0.8);
      const ao = ctx.aoAt([x, y, z], [m.nrm[i * 3], m.nrm[i * 3 + 1], m.nrm[i * 3 + 2]]);
      const f = (0.35 + 0.65 * ao) * (0.92 + 0.16 * Math.sin(uu * 9.0));
      c[0] = col[0] * f; c[1] = col[1] * f; c[2] = col[2] * f;
      d[0] = KIND.plate; d[1] = 0.25 * smoothstep(0.6, 1.0, vv); d[2] = 0; d[3] = 0;
      uv[0] = uu; uv[1] = vv;
    });
  }
}
