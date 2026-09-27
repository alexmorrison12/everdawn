// Skeleton description + procedural pose evaluation (FK with rest-aligned bones, analytic 2-bone IK).
// All bones have identity rest orientation in model space, so every rotation is a delta from the rest pose
// expressed in the model's axes: +X pitch (nose up for a -Z-facing head), +Y yaw (turn left), +Z roll (left side down... right side up).
import * as THREE from 'three';

export class Rig {
  constructor() { this.bones = []; this.byName = {}; }
  add(name, parent, pos) {
    const i = this.bones.length;
    this.bones.push({ name, parent: parent == null ? -1 : this.index(parent), rest: new THREE.Vector3(pos[0], pos[1], pos[2]) });
    this.byName[name] = i;
    return i;
  }
  index(name) { const i = this.byName[name]; if (i === undefined) throw new Error('creature rig: no bone ' + name); return i; }
  has(name) { return name in this.byName; }
  rest(name) { return this.bones[this.index(name)].rest; }
}

const _t = new THREE.Vector3(), _qa = new THREE.Quaternion(), _ax = new THREE.Vector3();
const _d = new THREE.Vector3(), _pp = new THREE.Vector3(), _u = new THREE.Vector3(), _w = new THREE.Vector3();
const _m0 = new THREE.Matrix4(), _m1 = new THREE.Matrix4(), _u0 = new THREE.Vector3(), _p0 = new THREE.Vector3(), _w0 = new THREE.Vector3();
const X = new THREE.Vector3(1, 0, 0), Y = new THREE.Vector3(0, 1, 0), Z = new THREE.Vector3(0, 0, 1);

export class Pose {
  constructor(rig) {
    const n = rig.bones.length;
    this.rig = rig; this.n = n;
    this.par = rig.bones.map(b => b.parent);
    this.rest = rig.bones.map(b => b.rest.clone());
    this.off = rig.bones.map(b => b.parent < 0 ? b.rest.clone() : b.rest.clone().sub(rig.bones[b.parent].rest));
    const mk = (f) => Array.from({ length: n }, f);
    this.lq = mk(() => new THREE.Quaternion()); this.lt = mk(() => new THREE.Vector3()); this.sc = mk(() => new THREE.Vector3(1, 1, 1));
    this.wq = mk(() => new THREE.Quaternion()); this.wp = mk(() => new THREE.Vector3());
    this.b = rig.byName;
  }
  reset() { for (let i = 0; i < this.n; i++) { this.lq[i].identity(); this.lt[i].set(0, 0, 0); this.sc[i].set(1, 1, 1); } }
  // post-multiply local rotation by axis angle (local axes = model axes at rest)
  rx(i, a) { if (a) this.lq[i].multiply(_qa.setFromAxisAngle(X, a)); return this; }
  ry(i, a) { if (a) this.lq[i].multiply(_qa.setFromAxisAngle(Y, a)); return this; }
  rz(i, a) { if (a) this.lq[i].multiply(_qa.setFromAxisAngle(Z, a)); return this; }
  rot(i, x = 0, y = 0, z = 0) { this.ry(i, y); this.rx(i, x); this.rz(i, z); return this; }
  // pre-multiply: rotate in parent-space axes (useful for yaw after pitch)
  prot(i, axis, a) { if (a) this.lq[i].premultiply(_qa.setFromAxisAngle(axis, a)); return this; }
  move(i, x, y, z) { this.lt[i].x += x; this.lt[i].y += y; this.lt[i].z += z; return this; }
  fk(from = 0) {
    const { par, lq, lt, wq, wp, off, rest } = this;
    for (let i = from; i < this.n; i++) {
      const p = par[i];
      if (p < 0) { wq[i].copy(lq[i]); wp[i].copy(rest[i]).add(lt[i]); }
      else {
        wq[i].multiplyQuaternions(wq[p], lq[i]);
        _t.copy(off[i]).add(lt[i]).applyQuaternion(wq[p]);
        wp[i].copy(wp[p]).add(_t);
      }
    }
  }
  // recompute world transforms for all descendants of bone i (after IK overrides)
  fkChildren(i) {
    const { par, lq, lt, wq, wp, off } = this;
    for (let j = i + 1; j < this.n; j++) {
      let p = par[j], anc = false;
      while (p >= 0) { if (p === i) { anc = true; break; } p = par[p]; }
      if (!anc) continue;
      p = par[j];
      wq[j].multiplyQuaternions(wq[p], lq[j]);
      _t.copy(off[j]).add(lt[j]).applyQuaternion(wq[p]);
      wp[j].copy(wp[p]).add(_t);
    }
  }
  // model-space point of rest point `r` carried by bone i in the current pose
  carry(i, r, out) { return out.copy(r).sub(this.rest[i]).applyQuaternion(this.wq[i]).add(this.wp[i]); }
  apply(bones) {
    for (let i = 0; i < this.n; i++) {
      const b = bones[i];
      b.position.copy(this.wp[i]); b.quaternion.copy(this.wq[i]); b.scale.copy(this.sc[i]);
    }
  }
}

/** Rotation that maps rest frame (u0, pole0) onto current frame (u, pole). */
export function frameRot(out, u0, p0, u, p) {
  _u0.copy(u0).normalize(); _p0.copy(p0).addScaledVector(_u0, -p0.dot(_u0)).normalize(); _w0.crossVectors(_u0, _p0);
  _u.copy(u).normalize(); _pp.copy(p).addScaledVector(_u, -p.dot(_u));
  if (_pp.lengthSq() < 1e-10) _pp.copy(_p0); _pp.normalize(); _w.crossVectors(_u, _pp);
  _m0.makeBasis(_u0, _p0, _w0).transpose();
  _m1.makeBasis(_u, _pp, _w).multiply(_m0);
  return out.setFromRotationMatrix(_m1);
}

/**
 * Two-bone IK chain A→B→C. Solves in model space; writes wq[A], wq[B], wp[B], wp[C].
 * chain = { a, b, c, l1, l2, u1, u2, pole0 } (from makeChain). pole: current bend direction hint (model space).
 * Returns the reach ratio (>1 means target was out of reach and got clamped).
 */
export function makeChain(pose, a, b, c, pole0) {
  const ra = pose.rest[a], rb = pose.rest[b], rc = pose.rest[c];
  const l1 = ra.distanceTo(rb), l2 = rb.distanceTo(rc);
  const u1 = rb.clone().sub(ra).normalize(), u2 = rc.clone().sub(rb).normalize();
  let p0;
  if (pole0) p0 = new THREE.Vector3(...pole0);
  else { // derive from rest bend
    const ac = rc.clone().sub(ra).normalize();
    p0 = rb.clone().sub(ra); p0.addScaledVector(ac, -p0.dot(ac));
    if (p0.lengthSq() < 1e-8) p0.set(0, 0, 1);
  }
  p0.normalize();
  return { a, b, c, l1, l2, u1, u2, pole0: p0 };
}
const _kn = new THREE.Vector3(), _ss = new THREE.Vector3();
export function solveIK(pose, ch, target, pole) {
  const A = pose.wp[ch.a];
  _d.subVectors(target, A);
  let d = _d.length();
  const reach = d / (ch.l1 + ch.l2);
  _d.divideScalar(d || 1e-6);
  const dmax = ch.l1 + ch.l2 - 1e-4, dmin = Math.abs(ch.l1 - ch.l2) + 1e-4;
  d = d > dmax ? dmax : d < dmin ? dmin : d;
  _pp.copy(pole).addScaledVector(_d, -pole.dot(_d));
  if (_pp.lengthSq() < 1e-10) { _pp.set(0, 1, 0).addScaledVector(_d, -_d.y); }
  _pp.normalize();
  const ca = (ch.l1 * ch.l1 + d * d - ch.l2 * ch.l2) / (2 * ch.l1 * d);
  const sa = Math.sqrt(Math.max(0, 1 - ca * ca));
  _kn.copy(A).addScaledVector(_d, ch.l1 * ca).addScaledVector(_pp, ch.l1 * sa);
  pose.wp[ch.b].copy(_kn);
  pose.wp[ch.c].copy(A).addScaledVector(_d, d);
  const pole1 = _ax.copy(_pp);
  _ss.subVectors(_kn, A);
  frameRot(pose.wq[ch.a], ch.u1, ch.pole0, _ss, pole1);
  _ss.subVectors(pose.wp[ch.c], _kn);
  frameRot(pose.wq[ch.b], ch.u2, ch.pole0, _ss, pole1);
  return reach;
}

// ---------- small math helpers for animation ----------
export const TAU = Math.PI * 2;
export const clamp01 = (x) => x < 0 ? 0 : x > 1 ? 1 : x;
export const sstep = (a, b, x) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); };
export const mix = (a, b, t) => a + (b - a) * t;
export const fract = (x) => x - Math.floor(x);
export const bell = (t) => Math.sin(Math.PI * clamp01(t)); // 0→1→0
// attack/decay envelope for one-shots: rises over [0,a], holds, falls over [d,1] of normalised time
export const env = (t, a, d) => t < a ? sstep(0, a, t) : t > d ? 1 - sstep(d, 1, t) : 1;
// smooth noise-ish wobble from a few sines (deterministic, cheap)
export const wob = (t, s = 0) => Math.sin(t * 1.3 + s) * 0.5 + Math.sin(t * 2.9 + s * 1.7) * 0.3 + Math.sin(t * 5.3 + s * 2.3) * 0.2;
export { X, Y, Z };
