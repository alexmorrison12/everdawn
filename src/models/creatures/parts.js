// Shared rigid-part builders used by several creatures (eyes, bristles/spines, teeth, claws, simple props).
import * as THREE from 'three';
import { sweep, eyeGeo, eyeMatrix, rigid, bez, taper } from './geo.js';
import { col } from './sdf.js';
import { mix } from './rig.js';

const lerp3 = (a, b, t) => [mix(a[0], b[0], t), mix(a[1], b[1], t), mix(a[2], b[2], t)];

/** Eye seated on the SDF surface. o: { iris, pupil, rim, pupilA, irisA, glow (emissive iris), sink, seg, group } */
export function addEye(acc, S, bone, p, dir, r, o = {}) {
  const rings = o.irisA === 0 ? [{ a: o.pupilA ?? 0.5, c: 0 }] : [{ a: o.pupilA ?? 0.32, c: 0 }, { a: o.irisA ?? 0.8, c: 1 }];
  const g = eyeGeo(r, rings, o.seg ?? 12, o.cap ?? 1.7);
  const pc = col(o.pupil ?? 0x0a0808), ic = col(o.iris ?? 0xd0a030), rc = col(o.rim ?? 0x1a1414);
  acc.add(g, {
    matrix: eyeMatrix(S, p, dir, r, o.sink ?? 0.4, o.group ?? 0), skin: rigid(bone), dtl: [0, 0, 0, 0],
    color: (q, n, uv) => uv[0] === 0 ? pc : uv[0] === 1 && rings.length > 1 ? ic : rc,
    emis: (q, uv) => o.glow ? (uv[0] <= 1 ? o.glow * (uv[0] === 0 && rings.length > 1 ? 0.35 : 1) : 0) : (uv[0] === 1 ? (o.irisEmis ?? 0.06) : 0),
  });
  // specular glint (tiny bright dot, slightly emissive so it reads at distance)
  if (o.glint !== false) {
    const m = eyeMatrix(S, p, dir, r, o.sink ?? 0.4, o.group ?? 0);
    const gp = new THREE.Vector3(-0.35 * r, 0.4 * r, r * 0.97).applyMatrix4(m);
    const gg = new THREE.SphereGeometry(r * 0.2, 4, 3);
    acc.add(gg, { matrix: new THREE.Matrix4().makeTranslation(gp.x, gp.y, gp.z), skin: rigid(bone), color: 0xffffff, emis: 0.25, dtl: [0, 0, 0, 0] });
  }
}

/**
 * Spiky hairs / bristles / spines planted on the SDF surface, skinned like the surface they grow from.
 * list: [{ p:[x,y,z] (near-surface), dir:[x,y,z], len, r }]; o: { base, tip (hex), radial, group, hackle (0..1 tip fx), bend }
 */
export function addSpikes(acc, S, list, o = {}) {
  const cb = col(o.base ?? 0x303030), ct = col(o.tip ?? 0x808080);
  for (const sp of list) {
    const { p } = S.project(sp.p.slice(), o.group ?? 0, 3);
    const d = new THREE.Vector3(...sp.dir).normalize();
    const L = sp.len, r = sp.r ?? 0.012;
    const b = new THREE.Vector3(...p).addScaledVector(d, -r * 1.5);
    const bendV = new THREE.Vector3(0, -1, 0).multiplyScalar(o.bend ?? 0);
    const mid = b.clone().addScaledVector(d, L * 0.55).addScaledVector(bendV, L * 0.1);
    const tip = b.clone().addScaledVector(d, L).addScaledVector(bendV, L * 0.35);
    const g = sweep([b, mid, tip], [r, r * 0.45, r * 0.03], { radial: o.radial ?? 4 });
    const smp = S.sampleAt(p[0], p[1], p[2]);
    const skin = { si: smp.si, sw: smp.sw };
    acc.add(g, { skin, dtl: o.dtl ?? [0.2, 0, 0.1, 0], color: (q, n, uv) => lerp3(cb, ct, Math.pow(uv[1], 1.3)), fx: (q, uv) => (o.hackle ?? 0) * uv[1] });
  }
}

/** Curved horn / tusk / fang / claw: bezier a→b→c with tapering radius. */
export function addHorn(acc, bone, a, b, c, r0, r1, o = {}) {
  const n = o.n ?? 6;
  const g = sweep(bez(a, b, c, n), taper(n, r0, r1, o.pow ?? 1), { radial: o.radial ?? 7, flat: o.flat ?? 1 });
  const c0 = col(o.base ?? 0xb8a888), c1 = col(o.tip ?? 0xf4ecd8);
  acc.add(g, { skin: typeof bone === 'number' ? rigid(bone) : bone, dtl: o.dtl ?? [0, 0, 0.12, 0.15], color: (q, n2, uv) => lerp3(c0, c1, Math.pow(uv[1], o.gpow ?? 0.8)) });
}

export { lerp3 };
