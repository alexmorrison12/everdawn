// Parametric dragon skeleton. One topology for every variant; proportions come from P.
// Model space: metres, Y up, facing -Z, feet on y = 0. Left = -X, right = +X.
// All bones have identity rest rotation, so a bone's local rotation is directly "the rotation relative to rest"
// expressed in model axes (X = pitch, Y = yaw, Z = roll) — convenient for procedural posing.

export const VARIANTS = {
  //            size  head  neck  tail  leg   wing  girth torso
  boss:  { size: 0.95, horn: 1.0, spikes: 1.0, snout: 0.86, head: 1.3, neck: 0.92, tail: 0.92, leg: 1.0, wing: 1.0, girth: 1.0, torso: 1.0 },
  whelp: { size: 0.088, horn: 0.42, spikes: 0.75, snout: 0.7, head: 2.1, neck: 0.55, tail: 0.72, leg: 0.78, wing: 1.3, girth: 1.12, torso: 0.82 },
  drake: { size: 0.3, horn: 0.8, spikes: 0.8, snout: 0.9, head: 1.3, neck: 1.1, tail: 1.0, leg: 1.08, wing: 1.05, girth: 0.82, torso: 1.0 },
};

const D2R = Math.PI / 180;
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const mul = (a, s) => [a[0] * s, a[1] * s, a[2] * s];

export function buildRigDef(P) {
  const L = P.leg, N = P.neck, T = P.tail, H = P.head, W = P.wing, Gt = P.girth, To = P.torso;
  const dy = (L - 1) * 3.5;
  const J = {};
  J.root = [0, 0, 0];
  J.pelvis = [0, 3.55 + dy, 1.5 * To];
  J.spine1 = [0, 3.76 + dy, 0.35 * To];
  J.spine2 = [0, 3.93 + dy, -0.85 * To];
  J.chest = [0, 4.0 + dy, -1.95 * To];
  // neck: S-curve rising forward
  J.neck = [];
  let p = add(J.chest, [0, 0.45, -0.92]);
  const nLen = [0.86, 0.82, 0.78, 0.74, 0.7, 0.66], nEl = [40, 44, 43, 38, 31, 22];
  for (let i = 0; i < 6; i++) {
    J.neck.push(p);
    const a = nEl[i] * D2R, l = nLen[i] * N;
    p = add(p, [0, Math.sin(a) * l, -Math.cos(a) * l]);
  }
  J.head = p;
  J.jaw = add(J.head, mul([0, -0.3, -0.3], H));
  const SN = P.snout ?? 1;
  J.snout = add(J.head, mul([0, -0.05, -0.7 - 1.85 * SN], H));
  // tail: drops then levels out
  J.tail = [];
  p = add(J.pelvis, [0, -0.1, 1.2 * To]);
  const tLen = [0.8, 0.78, 0.75, 0.72, 0.68, 0.64, 0.6, 0.56, 0.52, 0.48, 0.45, 0.42];
  const tEl = [-12, -21, -29, -34, -34, -30, -23, -15, -8, -3, 1, 4];
  for (let i = 0; i < 12; i++) {
    J.tail.push(p);
    const a = tEl[i] * D2R, l = tLen[i] * T;
    p = add(p, [0, Math.sin(a) * l, Math.cos(a) * l]);
  }
  J.tailEnd = p;

  for (const [s, side] of [[1, 'R'], [-1, 'L']]) {
    const X = (v) => [v[0] * s, v[1], v[2]];
    // front leg
    const scap = add(J.chest, X([0.82 * Gt, 0.5, 0.25]));
    const sh = [1.3 * Gt * s, 3.5 * L, -2.2 * To];
    const el = add(sh, mul(X([0.12, -1.55, 0.52]), L));
    const wr = add(el, mul(X([-0.04, -1.33, -0.55]), L));
    const kn = add(wr, mul(X([0.02, -0.4, -0.52]), L));
    const cl = add(kn, mul(X([0, -0.2, -0.55]), L));
    Object.assign(J, { ['scap' + side]: scap, ['sh' + side]: sh, ['elbow' + side]: el, ['wrist' + side]: wr, ['knuck' + side]: kn, ['claw' + side]: cl });
    // hind leg (digitigrade)
    const hip = add(J.pelvis, X([1.08 * Gt, -0.2, 0.0]));
    const kne = add(hip, mul(X([0.25, -1.3, -1.05]), L));
    const hock = add(kne, mul(X([0.03, -1.1, 1.42]), L));
    const ball = add(hock, mul(X([0.02, -0.75, -0.42]), L));
    const toe = add(ball, mul(X([0, -0.2, -0.62]), L));
    Object.assign(J, { ['hip' + side]: hip, ['knee' + side]: kne, ['hock' + side]: hock, ['ball' + side]: ball, ['toe' + side]: toe });
    // wing (spread rest pose)
    const wS = add(J.chest, X([0.8 * Gt, 0.88, 0.42]));
    const wE = add(wS, mul(X([2.5, 0.5, -0.72]), W));
    const wW = add(wE, mul(X([3.15, 0.18, 1.25]), W));
    const fAng = [15, 43, 69, 95], fLen = [5.1, 5.35, 5.0, 4.35], fDrop = [0.2, 0.36, 0.46, 0.5];
    const K = [], Tt = [];
    for (let i = 0; i < 4; i++) {
      const a0 = (fAng[i] - 7) * D2R, a1 = (fAng[i] + 6) * D2R, l = fLen[i] * W;
      const k = add(wW, [Math.cos(a0) * l * 0.42 * s, -fDrop[i] * 0.3 * W, Math.sin(a0) * l * 0.42]);
      const t = add(k, [Math.cos(a1) * l * 0.58 * s, -fDrop[i] * 0.7 * W, Math.sin(a1) * l * 0.58]);
      K.push(k); Tt.push(t);
    }
    const thumb = add(wW, mul(X([0.22, 0.08, -0.62]), W));
    Object.assign(J, { ['wS' + side]: wS, ['wE' + side]: wE, ['wW' + side]: wW, ['wK' + side]: K, ['wT' + side]: Tt, ['thumb' + side]: thumb });
  }

  // ---- bones (name, parent, joint)
  const bones = [], idx = {};
  const bone = (name, parent, pos) => { idx[name] = bones.length; bones.push({ name, parent: parent == null ? -1 : idx[parent], pos }); };
  bone('root', null, J.root);
  bone('pelvis', 'root', J.pelvis);
  bone('spine1', 'pelvis', J.spine1);
  bone('spine2', 'spine1', J.spine2);
  bone('chest', 'spine2', J.chest);
  for (let i = 0; i < 6; i++) bone('neck' + (i + 1), i ? 'neck' + i : 'chest', J.neck[i]);
  bone('head', 'neck6', J.head);
  bone('jaw', 'head', J.jaw);
  for (let i = 0; i < 12; i++) bone('tail' + (i + 1), i ? 'tail' + i : 'pelvis', J.tail[i]);
  for (const side of ['L', 'R']) {
    bone('scap' + side, 'chest', J['scap' + side]);
    bone('arm' + side, 'scap' + side, J['sh' + side]);
    bone('fore' + side, 'arm' + side, J['elbow' + side]);
    bone('hand' + side, 'fore' + side, J['wrist' + side]);
    bone('fing' + side, 'hand' + side, J['knuck' + side]);
    bone('thigh' + side, 'pelvis', J['hip' + side]);
    bone('shin' + side, 'thigh' + side, J['knee' + side]);
    bone('foot' + side, 'shin' + side, J['hock' + side]);
    bone('toes' + side, 'foot' + side, J['ball' + side]);
    bone('wing' + side + '0', 'chest', J['wS' + side]);
    bone('wing' + side + '1', 'wing' + side + '0', J['wE' + side]);
    bone('wing' + side + '2', 'wing' + side + '1', J['wW' + side]);
    for (let f = 0; f < 4; f++) {
      bone(`wing${side}f${f}a`, 'wing' + side + '2', J['wW' + side]);
      bone(`wing${side}f${f}b`, `wing${side}f${f}a`, J['wK' + side][f]);
    }
  }
  // Everything above is in "boss units" (≈ metres for a size-1 dragon). Geometry is modelled in these units and the
  // final vertex/bone positions are multiplied by S = P.size.
  return { bones, idx, J, P, S: P.size };
}
