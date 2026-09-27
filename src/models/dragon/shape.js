// Dragon anatomy as SDF primitives (boss units, rest pose, facing -Z).
// body: torso, neck, tail, legs, wing arms (+ inset head/jaw "stubs" so the neck fillets smoothly into the skull)
// head: skull + upper jaw (rigid, head bone)       jaw: lower jaw (rigid, jaw bone)
import { SDF } from './sdf.js';

const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const mul = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
const lerp3 = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const len = (a) => Math.hypot(a[0], a[1], a[2]);

/** Arc parameter along the main body line (0 at the snout tip), used for stripes / scale banding. */
export function mainArc(rig) {
  const J = rig.J;
  const pts = [J.snout, J.head, ...J.neck.slice().reverse(), J.chest, J.spine2, J.spine1, J.pelvis, ...J.tail, J.tailEnd];
  const s = [0];
  for (let i = 1; i < pts.length; i++) s.push(s[i - 1] + len(sub(pts[i], pts[i - 1])));
  return { pts, s, total: s[s.length - 1] };
}

// Head-local helpers: head-space point → model space (rest rotations are identity)
// Snout squash: head-local z beyond the eyes is compressed by P.snout (jaw-local z = head-local z + 0.3).
const squash = (z, k) => (z < -0.7 ? -0.7 + (z + 0.7) * k : z);
export function headLocal(rig, p) { return [p[0], p[1], squash(p[2], rig.P.snout ?? 1)]; }
export function headToModel(rig, p) { return add(rig.J.head, mul(headLocal(rig, p), rig.P.head)); }
export function jawToModel(rig, p) { const k = rig.P.snout ?? 1; return add(rig.J.jaw, mul([p[0], p[1], squash(p[2] - 0.3, k) + 0.3], rig.P.head)); }

export function buildBodySDF(rig, style) {
  const J = rig.J, P = rig.P, I = rig.idx, G = P.girth;
  const sdf = new SDF();
  const arc = mainArc(rig);
  const sOf = (name) => { // arc param of a named joint on the main line
    const map = { head: 1, chest: 8, spine2: 9, spine1: 10, pelvis: 11 };
    return arc.s[map[name]];
  };
  const sNeck = (i) => arc.s[7 - i];             // neck i (0..5)
  const sTail = (i) => arc.s[12 + i];            // tail i (0..11), 12 = end
  // ---------------- torso
  sdf.ellipsoid(add(J.pelvis, [0, 0.02, 0.15]), [1.03 * G, 0.98 * G, 1.2], { bone: I.pelvis, k: 0.55, s: sOf('pelvis'), scl: 1.15 });
  sdf.ellipsoid(add(J.spine1, [0, -0.12, 0.05]), [1.2 * G, 1.13 * G, 1.4], { bone: I.spine1, k: 0.6, s: sOf('spine1'), scl: 1.2 });
  sdf.ellipsoid(add(J.spine2, [0, 0.0, 0.0]), [1.33 * G, 1.25 * G, 1.32], { bone: I.spine2, k: 0.6, s: sOf('spine2'), scl: 1.2 });
  sdf.ellipsoid(add(J.chest, [0, -0.18, -0.35]), [1.32 * G, 1.32 * G, 1.15], { bone: I.chest, k: 0.55, s: sOf('chest'), scl: 1.2 });
  sdf.ellipsoid(add(J.chest, [0, -0.78, -0.72]), [0.92 * G, 0.78 * G, 0.85], { bone: I.chest, k: 0.45, s: sOf('chest') - 0.5 });
  // dorsal keel line
  const back = [add(J.neck[1], [0, 0.55, 0.1]), add(J.chest, [0, 1.12 * G, -0.1]), add(J.spine2, [0, 1.12 * G, 0]), add(J.spine1, [0, 1.0 * G, 0]), add(J.pelvis, [0, 0.86 * G, 0.1]), add(J.tail[1], [0, 0.62 * G, 0])];
  const backB = [I.neck2, I.chest, I.spine2, I.spine1, I.pelvis, I.tail1];
  for (let i = 0; i < back.length - 1; i++) sdf.cone(back[i], back[i + 1], 0.3, 0.3, { bone: backB[i + 1], k: 0.45, sw: 0.55, s: sOf('chest') + i * 1.2, scl: 1.3 });
  // ---------------- neck
  const nR = [1.15, 1.0, 0.88, 0.78, 0.7, 0.64, 0.6];
  const nPts = [...J.neck, J.head];
  sdf.ellipsoid(add(J.neck[0], [0, -0.05, 0.25]), [0.98 * G, 1.02 * G, 1.0], { bone: I.neck1, k: 0.5, s: sNeck(0) });
  for (let i = 0; i < 6; i++) {
    const a = nPts[i], b = i === 5 ? add(nPts[6], [0, -0.02, -0.12]) : nPts[i + 1];
    sdf.cone(a, b, nR[i] * G, nR[i + 1] * G, { bone: I['neck' + (i + 1)], k: 0.35, sw: 0.86, s: sNeck(i), scl: 0.9 - i * 0.04 });
    // throat keel (deeper underside)
    const dn = [0, -nR[i] * 0.35 * G, 0.06];
    sdf.cone(add(a, dn), add(b, [0, -nR[i + 1] * 0.35 * G, 0.06]), nR[i] * 0.62 * G, nR[i + 1] * 0.62 * G, { bone: I['neck' + (i + 1)], k: 0.3, sw: 0.8, s: sNeck(i), scl: 0.8 });
  }
  // ---------------- tail
  const tR = [1.0, 0.9, 0.8, 0.7, 0.61, 0.53, 0.46, 0.39, 0.33, 0.27, 0.22, 0.17, 0.12];
  const tPts = [...J.tail, J.tailEnd];
  sdf.cone(add(J.pelvis, [0, 0.0, 0.6]), J.tail[1], 1.0 * G, 0.88 * G, { bone: I.tail1, k: 0.5, sw: 0.95, s: sTail(0) });
  for (let i = 0; i < 12; i++) {
    const g = G * (1 - i / 24) + i / 24;
    sdf.cone(tPts[i], tPts[i + 1], tR[i] * g, tR[i + 1] * g, { bone: I['tail' + (i + 1)], k: 0.28 - i * 0.012, sw: 0.9, s: sTail(i), scl: 1.1 - i * 0.03 });
  }
  // ---------------- limbs
  for (const [s, sd] of [[1, 'R'], [-1, 'L']]) {
    const X = (v) => [v[0] * s, v[1], v[2]];
    const sh = J['sh' + sd], el = J['elbow' + sd], wr = J['wrist' + sd], kn = J['knuck' + sd], cl = J['claw' + sd], scap = J['scap' + sd];
    const fwd = [0, 0, -1];
    // shoulder / scapula mass
    sdf.ellipsoid(add(scap, X([0.18, -0.5, -0.12])), [0.52, 0.95, 0.78], { bones: [[I['scap' + sd], 0.7], [I.chest, 0.3]], k: 0.5, rot: [0.25, 0, -0.22 * s], limb: 0.3, s: sOf('chest') });
    // upper arm
    sdf.cone(add(sh, [0, 0.2, 0]), el, 0.62 * G, 0.42 * G, { bone: I['arm' + sd], k: 0.35, up: fwd, sq: 1.18, sw: 0.92, limb: 1 });
    sdf.cone(lerp3(sh, el, 0.12), lerp3(sh, el, 0.62), 0.66 * G, 0.5 * G, { bone: I['arm' + sd], k: 0.3, up: fwd, sq: 1.2, sw: 0.95, limb: 1 });
    // elbow + forearm (chunky)
    sdf.ellipsoid(add(el, [0, 0.0, 0.1]), [0.42 * G, 0.42 * G, 0.48 * G], { bone: I['fore' + sd], k: 0.22, limb: 1 });
    sdf.cone(el, wr, 0.5 * G, 0.3 * G, { bone: I['fore' + sd], k: 0.25, up: fwd, sq: 1.12, limb: 1, scl: 0.8 });
    sdf.cone(lerp3(el, wr, 0.05), lerp3(el, wr, 0.55), 0.56 * G, 0.4 * G, { bone: I['fore' + sd], k: 0.25, up: fwd, sq: 1.1, sw: 1.0, limb: 1, scl: 0.8 });
    // wrist + paw
    sdf.ellipsoid(add(wr, [0, -0.02, 0]), [0.34 * G, 0.3, 0.36], { bone: I['hand' + sd], k: 0.18, limb: 1, scl: 0.7 });
    sdf.cone(wr, add(kn, [0, 0.03, 0]), 0.32 * G, 0.3 * G, { bone: I['hand' + sd], k: 0.18, sw: 1.35, sq: 0.8, limb: 1, scl: 0.65 });
    for (const dx of [-0.19, 0, 0.19]) {
      const a = add(kn, [dx * s * G, 0.02, 0.02]), b = add(cl, [dx * 1.45 * s * G, 0.04, dx === 0 ? -0.06 : 0.04]);
      sdf.cone(a, b, 0.16 * G, 0.1 * G, { bone: I['fing' + sd], k: 0.1, limb: 1, scl: 0.55 });
    }
    sdf.cone(add(wr, X([-0.2, -0.12, -0.12])), add(wr, X([-0.3, -0.32, -0.34])), 0.1, 0.07, { bone: I['hand' + sd], k: 0.1, limb: 1, scl: 0.55 });
    // hind leg
    const hip = J['hip' + sd], ke = J['knee' + sd], ho = J['hock' + sd], ba = J['ball' + sd], to = J['toe' + sd];
    sdf.ellipsoid(add(lerp3(hip, ke, 0.36), X([0.1, 0.18, 0.12])), [0.72 * G, 1.15, 1.1], { bones: [[I['thigh' + sd], 0.85], [I.pelvis, 0.15]], k: 0.5, rot: [0.5, 0, -0.1 * s], limb: 0.5, s: sOf('pelvis') });
    sdf.cone(hip, ke, 0.7 * G, 0.44 * G, { bone: I['thigh' + sd], k: 0.35, limb: 1 });
    sdf.ellipsoid(ke, [0.42 * G, 0.42 * G, 0.45 * G], { bone: I['shin' + sd], k: 0.2, limb: 1 });
    sdf.cone(ke, ho, 0.44 * G, 0.24 * G, { bone: I['shin' + sd], k: 0.22, up: fwd, sq: 1.15, limb: 1, scl: 0.8 });
    sdf.cone(lerp3(ke, ho, 0.08), lerp3(ke, ho, 0.5), 0.47 * G, 0.33 * G, { bone: I['shin' + sd], k: 0.22, up: fwd, sq: 1.2, limb: 1, scl: 0.8 });
    sdf.ellipsoid(ho, [0.25 * G, 0.25, 0.27], { bone: I['foot' + sd], k: 0.14, limb: 1, scl: 0.7 });
    sdf.cone(ho, ba, 0.24 * G, 0.23 * G, { bone: I['foot' + sd], k: 0.14, limb: 1, scl: 0.65 });
    sdf.ellipsoid(add(ba, [0, 0.03, -0.06]), [0.36 * G, 0.2, 0.36], { bone: I['toes' + sd], k: 0.14, limb: 1, scl: 0.6 });
    for (const dx of [-0.19, 0, 0.19]) {
      const a = add(ba, [dx * s * G, 0.02, -0.05]), b = add(to, [dx * 1.5 * s * G, 0.04, dx === 0 ? -0.06 : 0.05]);
      sdf.cone(a, b, 0.16 * G, 0.1 * G, { bone: I['toes' + sd], k: 0.1, limb: 1, scl: 0.55 });
    }
    // wing arm
    const wS = J['wS' + sd], wE = J['wE' + sd], wW = J['wW' + sd], th = J['thumb' + sd];
    const W = P.wing;
    sdf.ellipsoid(add(wS, X([-0.12, -0.12, 0.12])), [0.58 * G, 0.48, 0.8], { bones: [[I.chest, 0.55], [I['wing' + sd + '0'], 0.45]], k: 0.45, limb: 0.2, s: sOf('chest') });
    sdf.cone(wS, wE, 0.42 * W, 0.25 * W, { bone: I['wing' + sd + '0'], k: 0.25, limb: 1, sq: 1.15 });
    sdf.cone(lerp3(wS, wE, 0.12), lerp3(wS, wE, 0.6), 0.45 * W, 0.3 * W, { bone: I['wing' + sd + '0'], k: 0.2, limb: 1, sq: 1.1, sw: 0.9 });
    sdf.ellipsoid(wE, [0.25 * W, 0.25 * W, 0.28 * W], { bone: I['wing' + sd + '1'], k: 0.15, limb: 1 });
    sdf.cone(wE, wW, 0.24 * W, 0.16 * W, { bone: I['wing' + sd + '1'], k: 0.16, limb: 1, scl: 0.8 });
    sdf.ellipsoid(wW, [0.22 * W, 0.19 * W, 0.24 * W], { bone: I['wing' + sd + '2'], k: 0.12, limb: 1, scl: 0.7 });
    sdf.cone(wW, th, 0.13 * W, 0.075 * W, { bone: I['wing' + sd + '2'], k: 0.1, limb: 1, scl: 0.6 });
    for (let f = 0; f < 4; f++) {
      const K = J['wK' + sd][f];
      sdf.cone(wW, lerp3(wW, K, 0.4), 0.15 * W, 0.105 * W, { bone: I[`wing${sd}f${f}a`], k: 0.1, limb: 1, scl: 0.6 });
    }
  }
  // ---------------- inset head / jaw stubs: give the neck a filleted transition into the separately meshed skull
  const H = P.head;
  const hp = (p) => headToModel(rig, p), jp = (p) => jawToModel(rig, p);
  sdf.ellipsoid(hp([0, 0.08, 0.02]), [0.44 * H, 0.44 * H, 0.42 * H], { bone: I.head, k: 0.32, s: sOf('head') });
  sdf.ellipsoid(hp([0, 0.18, -0.4]), [0.5 * H, 0.42 * H, 0.55 * H], { bone: I.head, k: 0.2, s: sOf('head') });
  for (const s of [1, -1]) sdf.ellipsoid(hp([0.44 * s, -0.12, -0.35]), [0.24 * H, 0.3 * H, 0.46 * H], { bone: I.head, k: 0.2, s: sOf('head') });
  sdf.ellipsoid(jp([0, -0.16, -0.25]), [0.36 * H, 0.15 * H, 0.45 * H], { bone: I.jaw, k: 0.3, s: sOf('head') });
  for (const s of [1, -1]) sdf.ellipsoid(jp([0.42 * s, -0.08, 0.06]), [0.14 * H, 0.2 * H, 0.2 * H], { bone: I.jaw, k: 0.2, s: sOf('head') });
  return { sdf, arc };
}

export function buildHeadSDF(rig, style) {
  const I = rig.idx, H = rig.P.head;
  const sdf = new SDF();
  const hp = (p) => headToModel(rig, p);
  const o = (k, extra = {}) => ({ bone: I.head, k: k * H, ...extra });
  const E = (c, r, k, extra) => sdf.ellipsoid(hp(c), mul(r, H), o(k, extra));
  const C = (a, b, r1, r2, k, extra) => sdf.cone(hp(a), hp(b), r1 * H, r2 * H, o(k, extra));
  const SN = rig.P.snout ?? 1;
  const TB = (c, rot, hz, back, front, dyf, r, k, extra) => sdf.tbox(hp(c), rot, hz * H * (c[2] < -0.7 ? SN : 1), mul(back, H), mul(front, H), dyf * H, r * H, o(k, extra));
  const F = Math.PI; // tbox local +z → head forward (-Z)
  const brow = style.brow ?? 1;
  // skull: wedge planform — broad muscular cheeks at the back, narrowing to the snout
  TB([0, 0.18, -0.38], [0, F, 0], 0.5, [0.54, 0.42], [0.42, 0.37], 0, 0.28, 0.25);   // cranium block (tapers forward)
  E([0, 0.32, -0.34], [0.42, 0.27, 0.52], 0.18);                                   // dome
  E([0, 0.1, 0.1], [0.5, 0.46, 0.42], 0.22);                                       // occiput
  // snout: flat-topped wedge sloping down to the nose + nose pad
  TB([0, 0.06, -1.62], [0, F, 0], 0.86, [0.42, 0.35], [0.25, 0.19], -0.12, 0.12, 0.26);
  TB([0, -0.01, -2.46], [0, F, 0], 0.13, [0.29, 0.22], [0.24, 0.17], -0.02, 0.1, 0.1);
  E([0, 0.2, -2.12], [0.11, 0.07, 0.17], 0.08);                                    // nose boss
  C([0, 0.52, -0.62], [0, 0.26, -2.2], 0.065, 0.05, 0.14, { sw: 0.9 });             // central ridge
  for (const s of [1, -1]) {
    E([0.5 * s, 0.0, -0.3], [0.33, 0.37, 0.52], 0.22);                               // masseter (widest point)
    C([0.62 * s, 0.02, 0.02], [0.47 * s, 0.1, -0.92], 0.12, 0.09, 0.12);              // zygomatic ridge
    E([0.4 * s, 0.4, -0.95], [0.15, 0.1, 0.3], 0.12, { rot: [0.1, -0.35 * s, 0.2 * s] }); // soft brow mass under the horn ridge
    C([0.42 * s, -0.16, -0.55], [0.24 * s, -0.13, -2.35], 0.085, 0.065, 0.1);       // lip overhang
  }
  // carve
  for (const s of [1, -1]) {
    E([0.48 * s, 0.21, -1.0], [0.15, 0.12, 0.19], 0.05, { sub: true });                         // eye socket
    E([0.14 * s, 0.1, -2.5], [0.055, 0.045, 0.085], 0.03, { sub: true, rot: [0.3, 0.3 * s, 0] }); // nostril
  }
  sdf.box(hp([0, -0.62, -1.9]), mul([1.2, 0.4, 1.3], H), 0.02 * H, { bone: I.head, k: 0.06 * H, sub: true, rot: [-0.045, 0, 0] }); // palate
  return sdf;
}

export function buildJawSDF(rig, style) {
  const I = rig.idx, H = rig.P.head;
  const sdf = new SDF();
  const jp = (p) => jawToModel(rig, p);
  const o = (k, extra = {}) => ({ bone: I.jaw, k: k * H, ...extra });
  const E = (c, r, k, extra) => sdf.ellipsoid(jp(c), mul(r, H), o(k, extra));
  const C = (a, b, r1, r2, k, extra) => sdf.cone(jp(a), jp(b), r1 * H, r2 * H, o(k, extra));
  const SN = rig.P.snout ?? 1;
  const TB = (c, rot, hz, back, front, dyf, r, k, extra) => sdf.tbox(jp(c), rot, hz * H * (0.5 + 0.5 * SN), mul(back, H), mul(front, H), dyf * H, r * H, o(k, extra));
  const F = Math.PI;
  TB([0, -0.1, -0.98], [0, F, 0], 1.12, [0.46, 0.21], [0.21, 0.12], 0.03, 0.09, 0.2);  // mandible block
  for (const s of [1, -1]) E([0.44 * s, -0.14, 0.08], [0.2, 0.3, 0.3], 0.16);      // jaw angle (deep)
  E([0, -0.11, -1.98], [0.18, 0.12, 0.15], 0.1);    // chin
  E([0, -0.2, -0.3], [0.37, 0.15, 0.55], 0.2);      // gular
  E([0, 0.15, -0.95], [0.33, 0.16, 1.15], 0.08, { sub: true }); // mouth trough (shallow)
  C([0, 0.0, -0.1], [0, 0.03, -1.35], 0.2, 0.12, 0.06, { sw: 1.45, sq: 0.5, tag: 7 }); // tongue fills the floor
  return sdf;
}
