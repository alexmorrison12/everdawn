// Hard-surface and body-conforming gear pieces, built in bind space and skinned.
import * as THREE from 'three';
import { makePiece, weightsAt } from './body.js';
import { marchIn, rotEuler } from './sdf.js';
import { B, NB } from './rig.js';
import { SLOT } from './palette.js';
import { clamp, lerp, smoothstep, Simplex } from '../../core/noise.js';

const NZ = new Simplex(4242);
const _v = new THREE.Vector3(), _n = new THREE.Vector3(), _m3 = new THREE.Matrix3();

// ------------------------------------------------------------------------------------------------
export class PB {
  constructor(base) { this.base = base; this.P = []; this.N = []; this.I = []; this.BI = []; this.BW = []; this.S = []; this.M = []; this.E = []; }
  get n() { return this.P.length / 3; }
  /** raw vertex */
  v(x, y, z, nx, ny, nz, slot, mul, emis, bw) {
    this.P.push(x, y, z); this.N.push(nx, ny, nz); this.S.push(slot); this.M.push(mul[0], mul[1], mul[2]); this.E.push(emis || 0);
    this.pushW(bw, x, y, z);
    return this.n - 1;
  }
  pushW(bw, x, y, z) {
    if (typeof bw === 'number') { this.BI.push(bw, 0, 0, 0); this.BW.push(1, 0, 0, 0); return; }
    if (typeof bw === 'function') bw = bw(x, y, z);
    if (bw === 'auto' || !bw) { const bi = [0, 0, 0, 0], ww = [0, 0, 0, 0]; weightsAt(this.base.master, x, y, z, bi, ww, 0, 0.013); this.BI.push(...bi); this.BW.push(...ww); return; }
    if (bw.bi) { this.BI.push(...bw.bi); this.BW.push(...bw.bw); return; }
    const arr = bw.slice(0, 4); let s = 0; for (const [, w] of arr) s += w;
    for (let k = 0; k < 4; k++) { if (k < arr.length) { this.BI.push(arr[k][0]); this.BW.push(arr[k][1] / s); } else { this.BI.push(0); this.BW.push(0); } }
  }
  tri(a, b, c) { this.I.push(a, b, c); }
  /** append a THREE geometry: opts {m: Matrix4, slot|slotFn, mul|mulFn, emis, bw} */
  add(geo, o = {}) {
    const g = geo.index ? geo : geo;
    const p = g.attributes.position, nA = g.attributes.normal;
    const m = o.m || null; if (m) _m3.getNormalMatrix(m);
    const base = this.n;
    for (let i = 0; i < p.count; i++) {
      _v.fromBufferAttribute(p, i); if (m) _v.applyMatrix4(m);
      if (nA) { _n.fromBufferAttribute(nA, i); if (m) _n.applyMatrix3(_m3).normalize(); } else _n.set(0, 1, 0);
      const slot = o.slotFn ? o.slotFn(_v, _n, i) : (o.slot ?? SLOT.METAL);
      const mul = o.mulFn ? o.mulFn(_v, _n, i) : (o.mul || [1, 1, 1]);
      const em = typeof o.emis === 'function' ? o.emis(_v, _n, i) : (o.emis || 0);
      this.v(_v.x, _v.y, _v.z, _n.x, _n.y, _n.z, slot, mul, em, o.bw ?? 'auto');
    }
    if (g.index) { const ix = g.index.array; for (let i = 0; i < ix.length; i += 3) this.I.push(base + ix[i], base + ix[i + (o.flip ? 2 : 1)], base + ix[i + (o.flip ? 1 : 2)]); }
    else for (let i = 0; i < p.count; i += 3) this.I.push(base + i, base + i + (o.flip ? 2 : 1), base + i + (o.flip ? 1 : 2));
    return this;
  }
  build() {
    // orient every triangle to agree with its authored vertex normals
    const P = this.P, Nn = this.N, I = this.I;
    for (let t = 0; t < I.length; t += 3) {
      const a = I[t], b = I[t + 1], c = I[t + 2];
      const ux = P[b * 3] - P[a * 3], uy = P[b * 3 + 1] - P[a * 3 + 1], uz = P[b * 3 + 2] - P[a * 3 + 2];
      const vx = P[c * 3] - P[a * 3], vy = P[c * 3 + 1] - P[a * 3 + 1], vz = P[c * 3 + 2] - P[a * 3 + 2];
      const fx = uy * vz - uz * vy, fy = uz * vx - ux * vz, fz = ux * vy - uy * vx;
      const sx = Nn[a * 3] + Nn[b * 3] + Nn[c * 3], sy = Nn[a * 3 + 1] + Nn[b * 3 + 1] + Nn[c * 3 + 1], sz = Nn[a * 3 + 2] + Nn[b * 3 + 2] + Nn[c * 3 + 2];
      if (fx * sx + fy * sy + fz * sz < 0) { I[t + 1] = c; I[t + 2] = b; }
    }
    const n = this.n, pc = makePiece(n, this.I.length);
    // occlusion against the body (pauldron undersides, collar/cuff insides, belt edges read as tucked in)
    const M = this.M;
    if (this.base.master && n > 0 && this.ao !== false) {
      let cx = 0, cy = 0, cz = 0; for (let i = 0; i < n; i++) { cx += P[i * 3]; cy += P[i * 3 + 1]; cz += P[i * 3 + 2]; }
      cx /= n; cy /= n; cz /= n;
      let r = 0; for (let i = 0; i < n; i++) r = Math.max(r, Math.hypot(P[i * 3] - cx, P[i * 3 + 1] - cy, P[i * 3 + 2] - cz));
      const f = this.base.master.near(cx, cy, cz, r + 0.12);
      for (let i = 0; i < n; i++) {
        const x = P[i * 3], y = P[i * 3 + 1], z = P[i * 3 + 2], nx = Nn[i * 3], ny = Nn[i * 3 + 1], nz = Nn[i * 3 + 2];
        const d1 = f(x + nx * 0.015, y + ny * 0.015, z + nz * 0.015), d2 = f(x + nx * 0.045, y + ny * 0.045, z + nz * 0.045);
        const occ = 0.45 + 0.55 * smoothstep(-0.005, 0.03, Math.min(d1 * 1.6, d2));
        M[i * 3] *= occ; M[i * 3 + 1] *= occ; M[i * 3 + 2] *= occ;
      }
    }
    pc.pos.set(this.P); pc.nrm.set(this.N); pc.idx.set(this.I); pc.bi.set(this.BI); pc.bw.set(this.BW);
    pc.slot.set(this.S); pc.mul.set(this.M);
    if (this.E.some(e => e > 0)) { pc.emis = new Float32Array(this.E); }
    return pc;
  }
}

// shading helpers for hard-surface "paint"
export const topLit = (k = 0.22, base = 0.92) => (p, n) => { const f = base + k * n.y; return [f, f, f]; };
function mulc(a, f) { return [a[0] * f, a[1] * f, a[2] * f]; }

// matrix: position + basis from an axis
function axisMatrix(origin, yAxis, xHint = [1, 0, 0]) {
  const Y = new THREE.Vector3(...yAxis).normalize();
  const X = new THREE.Vector3(...xHint); X.sub(Y.clone().multiplyScalar(X.dot(Y))); if (X.lengthSq() < 1e-6) X.set(0, 0, 1).sub(Y.clone().multiplyScalar(Y.z)); X.normalize();
  const Z = new THREE.Vector3().crossVectors(X, Y).normalize();
  return new THREE.Matrix4().makeBasis(X, Y, Z).setPosition(origin[0], origin[1], origin[2]);
}
const M4 = (R, t) => { const m = new THREE.Matrix4(); m.set(R[0], R[1], R[2], t[0], R[3], R[4], R[5], t[1], R[6], R[7], R[8], t[2], 0, 0, 0, 1); return m; };

// ------------------------------------------------------------------------------------------------
// Contour rings: ray-march a body cross-section and sweep a 2D profile (dr, dh) around it.
export const PROFILES = {
  band: (w, t) => [[0, -w / 2], [t * 0.75, -w / 2], [t, -w * 0.38], [t, w * 0.38], [t * 0.75, w / 2], [0, w / 2]],
  tube: (w) => { const r = w / 2, pts = []; for (let i = 0; i < 8; i++) { const a = -Math.PI / 2 + i / 7 * Math.PI; pts.push([r * 0.3 + Math.cos(a) * r, Math.sin(a) * r]); } return pts; },
  flare: (w, t, f) => [[0, -w / 2], [t, -w / 2], [t + f, w / 2], [t * 0.5 + f, w / 2 + t * 0.3], [f * 0.6, w / 2]],
  fur: (w) => { const r = w / 2, pts = []; for (let i = 0; i < 9; i++) { const a = -Math.PI / 2 + i / 8 * Math.PI; pts.push([r * 0.2 + Math.cos(a) * r * 1.1, Math.sin(a) * r]); } return pts; },
  lip: (w, t) => [[0, -w / 2], [t, -w * 0.3], [t * 1.1, w * 0.1], [t * 0.6, w / 2], [0, w / 2]],
};

/**
 * spec: { sdf, C:[x,y,z], axis, front, n, off, profile:[[dr,dh]], slot, rMax, arc:[a0,a1], mulFn(j,k,info), stitch, bw }
 */
export function ringSweep(pb, spec) {
  const fn = (x, y, z) => spec.sdf.eval(x, y, z);
  const C = spec.C, ax = new THREE.Vector3(...spec.axis).normalize();
  const fr = new THREE.Vector3(...spec.front); fr.sub(ax.clone().multiplyScalar(fr.dot(ax))).normalize();
  const sd = new THREE.Vector3().crossVectors(ax, fr).normalize();
  const n = spec.n || 24, closed = !spec.arc;
  const cnt = closed ? n : n + 1;
  const rs = [], dirs = [];
  for (let j = 0; j < cnt; j++) {
    const th = closed ? j / n * Math.PI * 2 : lerp(spec.arc[0], spec.arc[1], j / n);
    const d = fr.clone().multiplyScalar(Math.cos(th)).addScaledVector(sd, Math.sin(th));
    let r = marchIn(fn, C[0], C[1], C[2], d.x, d.y, d.z, spec.rMax || 0.5);
    if (spec.minR) r = Math.max(r, spec.minR);
    rs.push(r); dirs.push(d);
  }
  // smooth (keep outermost)
  for (let it = 0; it < (spec.smooth ?? 2); it++) {
    const cp = rs.slice();
    for (let j = 0; j < cnt; j++) {
      const a = closed ? cp[(j - 1 + cnt) % cnt] : cp[Math.max(0, j - 1)], b = closed ? cp[(j + 1) % cnt] : cp[Math.min(cnt - 1, j + 1)];
      rs[j] = Math.max(cp[j], (a + b + cp[j] * 2) / 4);
    }
  }
  const prof = spec.profile, np = prof.length;
  // profile normals (CCW polygon in (dr, dh)) -> outward normal (ey, -ex)
  const pn = prof.map((p, k) => {
    const a = prof[(k - 1 + np) % np], b = prof[(k + 1) % np];
    let ex = b[0] - a[0], ey = b[1] - a[1];
    if (k === 0 && !spec.closedProfile) { ex = prof[1][0] - p[0]; ey = prof[1][1] - p[1]; }
    if (k === np - 1 && !spec.closedProfile) { ex = p[0] - prof[k - 1][0]; ey = p[1] - prof[k - 1][1]; }
    const l = Math.hypot(ex, ey) || 1; return [ey / l, -ex / l];
  });
  const base = pb.n;
  for (let j = 0; j < cnt; j++) {
    const d = dirs[j], r = rs[j] + (spec.off || 0) + (spec.offFn ? spec.offFn(j / n) : 0);
    const sx = C[0] + d.x * rs[j], sy = C[1] + d.y * rs[j], sz = C[2] + d.z * rs[j];
    const bi = [0, 0, 0, 0], bw = [0, 0, 0, 0];
    if (spec.bw && spec.bw !== 'auto') { const w = typeof spec.bw === 'function' ? spec.bw(sx, sy, sz, j / n) : spec.bw; if (typeof w === 'number') { bi[0] = w; bw[0] = 1; } else { let s = 0; w.forEach(([b, ww], k) => { bi[k] = b; bw[k] = ww; s += ww; }); for (let k = 0; k < 4; k++) bw[k] /= s || 1; } }
    else weightsAt(pb.base.master, sx, sy, sz, bi, bw, 0, 0.013);
    for (let k = 0; k < np; k++) {
      const [dr, dh] = prof[k];
      const x = C[0] + ax.x * dh + d.x * (r + dr), y = C[1] + ax.y * dh + d.y * (r + dr), z = C[2] + ax.z * dh + d.z * (r + dr);
      const nx = d.x * pn[k][0] + ax.x * pn[k][1], ny = d.y * pn[k][0] + ax.y * pn[k][1], nz = d.z * pn[k][0] + ax.z * pn[k][1];
      const l = Math.hypot(nx, ny, nz) || 1;
      let mul = [1, 1, 1];
      const lit = 0.9 + 0.2 * (ny / l) + 0.08 * pn[k][0];
      mul = [lit, lit, lit];
      if (spec.mulFn) mul = spec.mulFn(j, k, mul, { x, y, z, u: j / n });
      if (spec.stitch && k === Math.floor(np / 2) && j % 2 === 0) mul = mulc(mul, 1.35);
      const slot = spec.slotFn ? spec.slotFn(j, k) : spec.slot;
      pb.v(x, y, z, nx / l, ny / l, nz / l, slot, mul, spec.emis || 0, { bi, bw });
    }
  }
  const segs = closed ? cnt : cnt - 1;
  const kmax = spec.closedProfile ? np : np - 1;
  let tris = [];
  for (let j = 0; j < segs; j++) {
    const j1 = (j + 1) % cnt;
    for (let k = 0; k < kmax; k++) {
      const k1 = (k + 1) % np;
      const a = base + j * np + k, b = base + j1 * np + k, c = base + j1 * np + k1, d2 = base + j * np + k1;
      tris.push(a, b, c, a, c, d2);
    }
  }
  // orientation check against intended normals
  const t0 = tris.slice(0, 3);
  const P = pb.P, Nn = pb.N;
  const e1 = [P[t0[1] * 3] - P[t0[0] * 3], P[t0[1] * 3 + 1] - P[t0[0] * 3 + 1], P[t0[1] * 3 + 2] - P[t0[0] * 3 + 2]];
  const e2 = [P[t0[2] * 3] - P[t0[0] * 3], P[t0[2] * 3 + 1] - P[t0[0] * 3 + 1], P[t0[2] * 3 + 2] - P[t0[0] * 3 + 2]];
  const cr = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
  const dot = cr[0] * Nn[t0[0] * 3] + cr[1] * Nn[t0[0] * 3 + 1] + cr[2] * Nn[t0[0] * 3 + 2];
  if (dot < 0) for (let i = 0; i < tris.length; i += 3) { const t = tris[i + 1]; tris[i + 1] = tris[i + 2]; tris[i + 2] = t; }
  for (const i of tris) pb.I.push(i);
  // open profile ends (caps) are left open: rings sit on the body surface
  return { rs, dirs };
}

// frames for chains in bind space
export function chainFrame(base, chain, at) {
  const J = base.JJ.J;
  if (chain === 'torso') return { C: [0, at, J.spine[2]], axis: [0, 1, 0], front: [0, 0, -1], sdf: base.chainSDF.torso };
  const s = chain.slice(-1), isArm = chain.startsWith('arm');
  const pts = isArm ? [J['uarm' + s], J['farm' + s], J['hand' + s], J['hand' + s].map((v, i) => v + (J['hand' + s][i] - J['farm' + s][i]) * 0.6)] : [J['thigh' + s], J['shin' + s], J['foot' + s], J['toe' + s]];
  const i = Math.min(2, Math.max(0, Math.floor(at))), f = at - i;
  const a = pts[i], b = pts[i + 1];
  const C = [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f];
  let axis = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  if (!isArm && i === 2) axis = [0, 1, 0.0001]; // foot: horizontal section
  let front = [0, 0, -1];
  if (!isArm && i === 2) front = [0, 0, -1];
  return { C, axis, front, sdf: isArm ? base.chainSDF['arm' + s] : base.chainSDF['leg' + s] };
}

// ------------------------------------------------------------------------------------------------
// Generic ring piece (cached)
const CACHE = new Map();
export function cached(key, fn) { if (CACHE.has(key)) return CACHE.get(key); const v = fn(); CACHE.set(key, v); return v; }

/** ring around a chain at coordinate `at` (torso: y metres; arm/leg: 0..3) */
export function ringPiece(base, chain, at, o) {
  return cached(`${base.key}|ring|${chain}|${at.toFixed(3)}|${JSON.stringify(o)}`, () => {
    const pb = new PB(base);
    const f = chainFrame(base, chain, at);
    const prof = o.profile === 'tube' ? PROFILES.tube(o.w) : o.profile === 'flare' ? PROFILES.flare(o.w, o.t, o.flare ?? 0.02) : o.profile === 'fur' ? PROFILES.fur(o.w) : o.profile === 'lip' ? PROFILES.lip(o.w, o.t) : PROFILES.band(o.w, o.t);
    ringSweep(pb, { ...f, n: o.n || 20, off: o.off ?? 0.004, profile: prof, slot: o.slot, rMax: o.rMax || (chain === 'torso' ? 0.42 : 0.2), stitch: o.stitch, arc: o.arc, emis: o.emis,
      mulFn: o.furry ? (j, k, m) => { const q = 0.8 + 0.35 * Math.abs(NZ.noise2(j * 0.9, k * 0.7)); return [m[0] * q, m[1] * q, m[2] * q]; } : null,
      offFn: o.furry ? (u) => Math.abs(NZ.noise2(u * 23, 3.1)) * o.w * 0.35 : null });
    return pb.build();
  });
}

// ------------------------------------------------------------------------------------------------
// Pauldrons (built in the arm's neutral frame, then rotated into bind A-pose)
export function pauldronPiece(base, side, sp) {
  return cached(`${base.key}|pauldron|${side}|${JSON.stringify(sp)}`, () => {
    const pb = new PB(base);
    const P = base.P, A = base.JJ.A[side], sg = A.sg;
    const S = A.S;
    const X = M4(A.RA, [S[0] - (A.RA[0] * S[0] + A.RA[1] * S[1] + A.RA[2] * S[2]), S[1] - (A.RA[3] * S[0] + A.RA[4] * S[1] + A.RA[5] * S[2]), S[2] - (A.RA[6] * S[0] + A.RA[7] * S[1] + A.RA[8] * S[2])]);
    const bone = B['uarm' + side], clav = B['clav' + side];
    const bw = [[bone, 0.85], [clav, 0.15]];
    const raceK = P.race === 'dwarf' ? 0.8 : P.race === 'orc' ? 0.92 : 1;
    const size = (sp.size ?? 1) * raceK, R = P.delt[0] * 1.55 * size, H = R * (sp.h ?? 0.7);
    const kind = sp.type || 'plate';
    const C = [S[0] + sg * 0.018 * size, S[1] + 0.03 + 0.02 * size, S[2]];
    const axis = [sg * 0.6, 0.8, 0];
    const ML = axisMatrix(C, axis, [0, 0, -1]);
    const Mfull = new THREE.Matrix4().multiplyMatrices(X, ML);
    const main = kind === 'cloth' ? SLOT.ARMOR1 : SLOT.ARMOR1;
    // dome profile (outer arc, rolled rim, inner arc)
    const prof = [];
    const N = 7;
    const t = 0.012;
    prof.push(new THREE.Vector2(R * 0.8, -0.02));
    prof.push(new THREE.Vector2(R * 1.02, -0.012));
    for (let i = 0; i <= N; i++) { const a = i / N * Math.PI / 2; prof.push(new THREE.Vector2(Math.max(0.001, Math.cos(a) * R), Math.sin(a) * H)); }
    const dome = new THREE.LatheGeometry(prof, 16);
    pb.add(dome, { m: Mfull, slot: main, bw, mulFn: (p, n) => { const f = 0.82 + 0.3 * Math.max(0, n.y) ; return [f, f, f]; } });
    // rim roll
    if (sp.rim !== false) {
      const tor = new THREE.TorusGeometry(R * 1.0, 0.011 * size + (sp.tier >= 2 ? 0.004 : 0), 5, 18);
      const mt = new THREE.Matrix4().multiplyMatrices(Mfull, new THREE.Matrix4().makeRotationX(Math.PI / 2).setPosition(0, -0.008, 0));
      pb.add(tor, { m: mt, slot: sp.tier >= 1 ? SLOT.TRIM : SLOT.ARMOR2, bw, mul: [1.05, 1.05, 1.05], emis: sp.glowTrim ? 0.35 : 0 });
    }
    // stacked lames down the arm (outer side)
    const lames = sp.layers ?? 1;
    for (let i = 0; i < lames; i++) {
      const r0 = P.uarmR[0] + 0.03 + 0.012 * (lames - i), y0 = S[1] - 0.04 - i * 0.045 * size;
      const pr = [new THREE.Vector2(r0 + 0.012, y0 - 0.042), new THREE.Vector2(r0 + 0.028, y0 - 0.04), new THREE.Vector2(r0 + 0.022, y0 - 0.012), new THREE.Vector2(r0 + 0.012, y0 + 0.012)];
      const lame = new THREE.LatheGeometry(pr.map(v => new THREE.Vector2(v.x, v.y - y0)), 12, sg > 0 ? -Math.PI * 0.62 : Math.PI * 0.38, Math.PI * 1.24);
      const ml = new THREE.Matrix4().makeTranslation(S[0] + sg * 0.01, y0, S[2]);
      pb.add(lame, { m: new THREE.Matrix4().multiplyMatrices(X, ml), slot: i % 2 ? SLOT.ARMOR2 : main, bw: [[bone, 1]], mulFn: (p, n) => { const f = 0.8 + 0.3 * Math.max(0, n.y); return [f, f, f]; } });
    }
    // spikes / horns: curved, chunky, rising from the dome
    const nsp = sp.spikes || 0;
    for (let i = 0; i < nsp; i++) {
      const a = nsp === 1 ? 0 : (i / (nsp - 1) - 0.5) * 1.4;
      const phi = 0.42 + Math.abs(a) * 0.15;
      const b0 = new THREE.Vector3(Math.sin(a) * Math.sin(phi) * R * 0.95, Math.cos(phi) * H * 0.95, Math.cos(a) * Math.sin(phi) * R * 0.95);
      const out = new THREE.Vector3(Math.sin(a) * 0.35, 0.75, 0.55).normalize();
      const len = (0.075 + 0.03 * (sp.tier || 0)) * size * (i === Math.floor(nsp / 2) ? 1.2 : 1);
      const pts = [], rads = [];
      for (let k = 0; k <= 5; k++) { const t = k / 5; pts.push(new THREE.Vector3().copy(b0).addScaledVector(out, t * len).add(new THREE.Vector3(0, t * t * len * 0.35, -t * t * len * 0.25))); rads.push(0.03 * size * Math.pow(1 - t, 0.85) + 0.002); }
      pb.add(tubeGeo(pts, rads, 7), { m: Mfull, slot: sp.spikeSlot ?? (sp.type === 'leather' || sp.type === 'fur' ? SLOT.BONE : SLOT.METAL), bw, mulFn: (p, n) => { const f = 0.78 + 0.35 * Math.max(0, n.y); return [f, f, f]; } });
    }
    // epic: toothed flare collar rising around the outer side of the dome
    if (sp.wing) {
      const prof = [new THREE.Vector2(R * 0.96, H * 0.02), new THREE.Vector2(R * 1.22, H * 0.42), new THREE.Vector2(R * 1.34, H * 0.8), new THREE.Vector2(R * 1.28, H * 0.82), new THREE.Vector2(R * 1.16, H * 0.46), new THREE.Vector2(R * 0.92, H * 0.06)];
      const fl = new THREE.LatheGeometry(prof, 16, -Math.PI * 0.62, Math.PI * 1.24);
      const fp = fl.attributes.position;
      for (let i = 0; i < fp.count; i++) { const y = fp.getY(i); if (y > H * 0.7) { const ph = Math.atan2(fp.getX(i), fp.getZ(i)); fp.setY(i, y + H * 0.45 * Math.pow(0.5 + 0.5 * Math.cos(ph * 7), 2)); } }
      fl.computeVertexNormals();
      pb.add(fl, { m: Mfull, slot: SLOT.TRIM, bw, mulFn: (p, n) => { const f = 0.8 + 0.3 * Math.max(0, n.y); return [f, f, f]; }, emis: sp.glowTrim ? 0.18 : 0 });
    }
    // gem
    if (sp.gem) {
      const gem = new THREE.OctahedronGeometry(0.022 * size, 0);
      const mg = new THREE.Matrix4().makeTranslation(0, H * 0.45, -R * 0.78);
      pb.add(gem, { m: new THREE.Matrix4().multiplyMatrices(Mfull, mg), slot: SLOT.GEM, bw, mul: [1.2, 1.2, 1.2], emis: 1 });
      const set = new THREE.TorusGeometry(0.024 * size, 0.006, 5, 10);
      pb.add(set, { m: new THREE.Matrix4().multiplyMatrices(Mfull, mg), slot: SLOT.TRIM, bw });
    }
    return pb.build();
  });
}

// ------------------------------------------------------------------------------------------------
// Head gear (rigid to head)
export function headgearPiece(base, sp) {
  return cached(`${base.key}|head|${JSON.stringify(sp)}`, () => {
    const pb = new PB(base);
    const d = base.P.headDef, s = d.s, J = base.JJ.J, H = J.head;
    const cr = d.cranium, cc = [H[0] + cr.c[0] * s, H[1] + cr.c[1] * s, H[2] + cr.c[2] * s];
    const rx = cr.r[0] * s, ry = cr.r[1] * s, rz = cr.r[2] * s;
    const bw = [[B.head, 1]];
    const type = sp.type;
    const Mh = (x, y, z) => new THREE.Matrix4().makeTranslation(x, y, z);
    const pad = type === 'hood' ? 0.02 : 0.016;
    const browY = H[1] + (d.browY ?? 0.1) * s;
    if (type === 'helm' || type === 'greathelm' || type === 'horned' || type === 'winged') {
      const full = type !== 'helm';
      // dome
      const prof = [];
      const bottom = full ? H[1] - 0.075 * s : browY - 0.006;
      const top = cc[1] + ry + pad + 0.012;
      const N = 10;
      for (let i = 0; i <= N; i++) {
        const t = i / N; const y = lerp(bottom, top, t);
        const e = clamp((y - cc[1]) / (ry + pad + 0.012), -1, 1);
        let r = Math.sqrt(Math.max(0, 1 - e * e)) * (Math.max(rx, rz) + pad);
        if (full && y < cc[1]) r = Math.max(r, (Math.max(rx, rz) + pad) * (0.92 - (cc[1] - y) * 0.6));
        prof.push(new THREE.Vector2(Math.max(0.002, r), y - cc[1]));
      }
      const dome = new THREE.LatheGeometry(prof, 20);
      const sc = new THREE.Matrix4().makeScale(1, 1, (rz + pad) / (Math.max(rx, rz) + pad) * 1.02);
      const m = new THREE.Matrix4().multiplyMatrices(Mh(cc[0], cc[1], cc[2] - 0.004), sc);
      pb.add(dome, { m, slot: SLOT.ARMOR1, bw, mulFn: (p, n) => { const f = 0.8 + 0.32 * Math.max(0, n.y) + 0.06 * n.z; return [f, f, f]; } });
      // brim / rim
      const rim = new THREE.TorusGeometry(Math.max(rx, rz) + pad + 0.003, 0.009 * s, 6, 24);
      const mr = new THREE.Matrix4().multiplyMatrices(Mh(cc[0], bottom + 0.004, cc[2] - 0.004), new THREE.Matrix4().makeRotationX(Math.PI / 2).multiply(new THREE.Matrix4().makeScale(1, (rz + pad) / (Math.max(rx, rz) + pad), 1)));
      pb.add(rim, { m: mr, slot: SLOT.TRIM, bw, emis: sp.glowTrim ? 0.4 : 0 });
      // crest ridge
      const ridge = new THREE.TorusGeometry(ry + pad + 0.006, 0.01 * s, 5, 18, Math.PI * 1.1);
      const mrd = new THREE.Matrix4().multiplyMatrices(Mh(cc[0], cc[1] - 0.005, cc[2]), new THREE.Matrix4().makeRotationY(Math.PI / 2).multiply(new THREE.Matrix4().makeRotationZ(-0.05)));
      pb.add(ridge, { m: mrd, slot: SLOT.TRIM, bw, mulFn: topLit(0.3, 0.95), emis: sp.glowTrim ? 0.4 : 0 });
      if (!full) { // nasal guard
        const nas = new THREE.BoxGeometry(0.018 * s, 0.07 * s, 0.012 * s);
        pb.add(nas, { m: Mh(H[0], browY - 0.02 * s, H[2] + (d.noseA[2] - 0.012) * s), slot: SLOT.ARMOR1, bw, mulFn: topLit() });
        for (const sg of [-1, 1]) { // cheek guards
          const ch = new THREE.BoxGeometry(0.012 * s, 0.07 * s, 0.07 * s);
          pb.add(ch, { m: new THREE.Matrix4().multiplyMatrices(Mh(H[0] + sg * (rx + 0.012), browY - 0.05 * s, H[2] - 0.035 * s), new THREE.Matrix4().makeRotationZ(sg * 0.12)), slot: SLOT.ARMOR1, bw, mulFn: topLit() });
        }
      } else { // visor: curved dark eye slit + nasal slot lying flush on the dome
        const R0 = Math.max(rx, rz) + pad, zs = (rz + pad) / R0 * 1.02;
        const domeR = (y) => { const e = clamp((y - cc[1]) / (ry + pad + 0.012), -1, 1); let r = Math.sqrt(Math.max(0, 1 - e * e)) * R0; if (y < cc[1]) r = Math.max(r, R0 * (0.92 - (cc[1] - y) * 0.6)); return r; };
        const slitY = H[1] + (d.eye.y + 0.004) * s;
        const strip = (y, h, ang, slot, mul, emis = 0) => {
          const r = domeR(y) + 0.0025;
          const g = new THREE.CylinderGeometry(r, r, h, 10, 1, true, Math.PI - ang, ang * 2);
          const m = new THREE.Matrix4().multiplyMatrices(Mh(cc[0], y, cc[2] - 0.004), new THREE.Matrix4().makeScale(1, 1, zs));
          pb.add(g, { m, slot, bw, mul, emis });
        };
        strip(slitY, 0.02 * s, 0.62, SLOT.DARK, [0.15, 0.15, 0.15]);
        // vertical breath slot
        const r2 = domeR(slitY - 0.04 * s) + 0.0025;
        const vs = new THREE.CylinderGeometry(r2, r2, 0.055 * s, 3, 1, true, Math.PI - 0.07, 0.14);
        pb.add(vs, { m: new THREE.Matrix4().multiplyMatrices(Mh(cc[0], slitY - 0.045 * s, cc[2] - 0.004), new THREE.Matrix4().makeScale(1, 1, zs)), slot: SLOT.DARK, bw, mul: [0.15, 0.15, 0.15] });
        // raised brow band above the slit
        const rb = domeR(slitY + 0.02 * s) + 0.006;
        const band = new THREE.TorusGeometry(rb, 0.008 * s, 5, 16, 1.5);
        pb.add(band, { m: new THREE.Matrix4().multiplyMatrices(Mh(cc[0], slitY + 0.021 * s, cc[2] - 0.004), new THREE.Matrix4().makeScale(1, 1, zs).multiply(new THREE.Matrix4().makeRotationX(Math.PI / 2)).multiply(new THREE.Matrix4().makeRotationZ(Math.PI / 2 - 0.75 + Math.PI))), slot: SLOT.TRIM, bw, emis: sp.glowTrim ? 0.35 : 0 });
      }
      if (type === 'horned') {
        for (const sg of [-1, 1]) {
          const pts = []; const rads = [];
          for (let i = 0; i <= 8; i++) { const t = i / 8; pts.push(new THREE.Vector3(cc[0] + sg * (rx * 0.85 + t * 0.14 * s), cc[1] + 0.03 + Math.sin(t * 2.2) * 0.12 * s, cc[2] - t * 0.05 * s + t * t * 0.02)); rads.push(0.028 * s * (1 - t * 0.92)); }
          pb.add(tubeGeo(pts, rads, 7), { slot: SLOT.BONE, bw, mulFn: (p, n) => { const f = 0.8 + 0.3 * n.y; return [f, f * 0.97, f * 0.9]; } });
        }
      }
      if (type === 'winged') {
        for (const sg of [-1, 1]) {
          const sh = new THREE.Shape(); sh.moveTo(0, 0); sh.quadraticCurveTo(0.06, 0.1, 0.03, 0.2); sh.quadraticCurveTo(0.09, 0.12, 0.12, 0.08); sh.quadraticCurveTo(0.08, 0.02, 0, 0);
          const w = new THREE.ExtrudeGeometry(sh, { depth: 0.008, bevelEnabled: true, bevelThickness: 0.004, bevelSize: 0.004, bevelSegments: 1, curveSegments: 6 });
          const mw = new THREE.Matrix4().multiplyMatrices(Mh(cc[0] + sg * (rx + pad), cc[1], cc[2] + 0.01), new THREE.Matrix4().makeRotationY(sg > 0 ? -Math.PI / 2 + 0.3 : Math.PI / 2 - 0.3).multiply(new THREE.Matrix4().makeScale(s * 1.1, s * 1.1, 1)));
          pb.add(w, { m: mw, slot: SLOT.TRIM, bw, mulFn: topLit(0.3, 0.95), emis: sp.glowTrim ? 0.5 : 0 });
        }
      }
      if (sp.gem) {
        const gem = new THREE.OctahedronGeometry(0.018 * s, 0);
        pb.add(gem, { m: Mh(H[0], browY + 0.028 * s, cc[2] - rz - pad - 0.008), slot: SLOT.GEM, bw, emis: 1 });
      }
    } else if (type === 'wizard') {
      const brimR = Math.max(rx, rz) + 0.13 * s, y0 = browY + 0.02;
      const brim = new THREE.LatheGeometry([new THREE.Vector2(0.001, 0.0), new THREE.Vector2(brimR - 0.01, -0.02), new THREE.Vector2(brimR + 0.006, -0.02), new THREE.Vector2(brimR, -0.012), new THREE.Vector2(Math.max(rx, rz) + 0.02, 0.014), new THREE.Vector2(0.001, 0.012)], 22);
      pb.add(brim, { m: Mh(cc[0], y0, cc[2]), slot: SLOT.HOOD, bw, mulFn: topLit(0.3, 0.85) });
      // tall cone with a bent tip
      const pts = [], rads = [];
      const hh = 0.46 * s;
      for (let i = 0; i <= 10; i++) { const t = i / 10; pts.push(new THREE.Vector3(cc[0], y0 + t * hh, cc[2] + Math.pow(t, 2.5) * 0.14 * s)); rads.push((Math.max(rx, rz) + 0.022) * (1 - t) * (1 - t * 0.12) + 0.006); }
      pb.add(tubeGeo(pts, rads, 14), { slot: SLOT.HOOD, bw, mulFn: (p, n) => { const f = 0.85 + 0.2 * Math.max(0, n.y) + 0.06 * Math.sin((p.y - y0) * 60); return [f, f, f]; } });
      const band = new THREE.TorusGeometry(Math.max(rx, rz) + 0.022, 0.012 * s, 5, 22);
      pb.add(band, { m: new THREE.Matrix4().multiplyMatrices(Mh(cc[0], y0 + 0.028, cc[2]), new THREE.Matrix4().makeRotationX(Math.PI / 2)), slot: SLOT.TRIM, bw, emis: sp.glowTrim ? 0.5 : 0 });
      // stars on the cone
      for (let i = 0; i < 4; i++) {
        const st = starGeo(0.018 * s, 5, 0.004);
        const a = i * 1.7, t = 0.15 + i * 0.16, r = (Math.max(rx, rz) + 0.02) * (1 - t);
        pb.add(st, { m: new THREE.Matrix4().multiplyMatrices(Mh(cc[0] + Math.sin(a) * r, y0 + t * hh, cc[2] - Math.cos(a) * r), new THREE.Matrix4().makeRotationY(-a + Math.PI)), slot: SLOT.TRIM, bw, emis: 0.6 });
      }
    } else if (type === 'straw') {
      const brimR = Math.max(rx, rz) + 0.16 * s, y0 = browY + 0.03;
      const brim = new THREE.LatheGeometry([new THREE.Vector2(0.001, -0.01), new THREE.Vector2(brimR * 0.5, -0.013), new THREE.Vector2(brimR - 0.01, -0.043), new THREE.Vector2(brimR + 0.006, -0.043), new THREE.Vector2(brimR, -0.035), new THREE.Vector2(brimR * 0.5, -0.005), new THREE.Vector2(0.001, 0.0)], 24);
      pb.add(brim, { m: Mh(cc[0], y0, cc[2]), slot: SLOT.STRAW, bw, mulFn: (p, n) => { const a = Math.atan2(p.x - cc[0], p.z - cc[2]); const f = 0.85 + 0.2 * n.y + 0.08 * Math.sin(a * 40) + 0.05 * Math.sin(Math.hypot(p.x - cc[0], p.z - cc[2]) * 200); return [f, f, f]; } });
      const crown = new THREE.LatheGeometry([new THREE.Vector2(Math.max(rx, rz) + 0.018, -0.02), new THREE.Vector2(Math.max(rx, rz) + 0.012, 0.07 * s), new THREE.Vector2((Math.max(rx, rz)) * 0.8, 0.1 * s), new THREE.Vector2(0.001, 0.105 * s)], 20);
      pb.add(crown, { m: Mh(cc[0], y0, cc[2]), slot: SLOT.STRAW, bw, mulFn: (p, n) => { const f = 0.85 + 0.25 * n.y + 0.08 * Math.sin(p.y * 300); return [f, f, f]; } });
      const band = new THREE.TorusGeometry(Math.max(rx, rz) + 0.02, 0.011, 5, 20);
      pb.add(band, { m: new THREE.Matrix4().multiplyMatrices(Mh(cc[0], y0 + 0.012, cc[2]), new THREE.Matrix4().makeRotationX(Math.PI / 2)), slot: SLOT.CLOTH2, bw });
    } else if (type === 'circlet' || type === 'crown') {
      const r = Math.max(rx, rz) + 0.008;
      const ring = new THREE.TorusGeometry(r, 0.006 * s, 5, 26);
      const sc2 = new THREE.Matrix4().makeScale(1, (rz + 0.008) / r, 1);
      pb.add(ring, { m: new THREE.Matrix4().multiplyMatrices(Mh(cc[0], browY + 0.018, cc[2] - 0.004), new THREE.Matrix4().makeRotationX(Math.PI / 2).multiply(sc2)), slot: SLOT.TRIM, bw, emis: sp.glowTrim ? 0.4 : 0 });
      const gem = new THREE.OctahedronGeometry(0.016 * s, 0);
      pb.add(gem, { m: Mh(H[0], browY + 0.022, cc[2] - rz - 0.012), slot: SLOT.GEM, bw, emis: 1 });
      if (type === 'crown') for (let i = 0; i < 7; i++) {
        const a = (i / 7) * Math.PI * 2; const sp2 = new THREE.ConeGeometry(0.012 * s, 0.05 * s, 4); sp2.translate(0, 0.025 * s, 0);
        pb.add(sp2, { m: Mh(cc[0] + Math.sin(a) * r, browY + 0.02, cc[2] - 0.004 + Math.cos(a) * (rz + 0.008)), slot: SLOT.TRIM, bw, emis: sp.glowTrim ? 0.3 : 0 });
      }
    } else if (type === 'bandana' || type === 'cap') {
      const prof = []; const N = 8;
      const bottom = browY - 0.008;
      for (let i = 0; i <= N; i++) { const t = i / N; const y = lerp(bottom, cc[1] + ry + 0.008, t); const e = clamp((y - cc[1]) / (ry + 0.008), -1, 1); prof.push(new THREE.Vector2(Math.max(0.002, Math.sqrt(1 - e * e) * (Math.max(rx, rz) + 0.008)), y - cc[1])); }
      const dome = new THREE.LatheGeometry(prof, 16);
      pb.add(dome, { m: new THREE.Matrix4().multiplyMatrices(Mh(cc[0], cc[1], cc[2]), new THREE.Matrix4().makeScale(1, 1, (rz + 0.008) / (Math.max(rx, rz) + 0.008))), slot: SLOT.HOOD, bw, mulFn: (p, n) => { const f = 0.85 + 0.2 * n.y + 0.06 * Math.sin((p.x + p.y) * 90); return [f, f, f]; } });
      // knot + tails at the back
      const knot = new THREE.SphereGeometry(0.022 * s, 6, 5);
      pb.add(knot, { m: Mh(cc[0], browY + 0.02, cc[2] + rz + 0.01), slot: SLOT.HOOD, bw, mulFn: topLit() });
      for (const sg of [-1, 1]) {
        const tl = new THREE.BoxGeometry(0.03 * s, 0.1 * s, 0.006);
        pb.add(tl, { m: new THREE.Matrix4().multiplyMatrices(Mh(cc[0] + sg * 0.015, browY - 0.03, cc[2] + rz + 0.02), new THREE.Matrix4().makeRotationZ(sg * 0.25)), slot: SLOT.HOOD, bw: [[B.head, 0.6], [B.neck, 0.4]], mulFn: topLit() });
      }
    }
    if (sp.mask) { // bandit face mask covering nose & mouth: subdivided grid bent around the face
      const w = 0.2 * s, top = 0.047 * s, R0 = 0.118 * s;
      const noseFront = (Math.abs(d.tipZ) + d.tip) * s;
      const cz = noseFront + 0.012 - R0;
      const g = new THREE.PlaneGeometry(w, 1, 14, 8);
      const pa = g.attributes.position;
      for (let i = 0; i < pa.count; i++) {
        const x = pa.getX(i), t = pa.getY(i) + 0.5; // 0 bottom .. 1 top
        const bot = -(0.045 + 0.055 * (1 - Math.abs(x) / (w / 2))) * s;
        const y = bot + (top - bot) * t;
        const a = x / R0;
        const bulge = 0.006 * s * Math.exp(-(x * x) / (0.0015 * s * s));
        pa.setXYZ(i, Math.sin(a) * R0, y, -Math.cos(a) * R0 - cz - bulge + Math.max(0, -y) * 0.12);
      }
      g.computeVertexNormals();
      const na = g.attributes.normal;
      let dot = 0; for (let i = 0; i < na.count; i++) dot += na.getX(i) * pa.getX(i) - na.getZ(i);
      if (dot < 0) for (let i = 0; i < na.count; i++) na.setXYZ(i, -na.getX(i), -na.getY(i), -na.getZ(i));
      const inner = g.clone(); const ni = inner.attributes.normal; for (let i = 0; i < ni.count; i++) ni.setXYZ(i, -ni.getX(i), -ni.getY(i), -ni.getZ(i));
      const mk = Mh(H[0], H[1] + (d.tipY - 0.012) * s, H[2]);
      pb.add(g, { m: mk, slot: SLOT.HOOD, bw, mulFn: (p, n) => { const f = 0.82 + 0.12 * Math.sin(p.y * 220) + 0.12 * Math.max(0, n.y); return [f, f, f]; } });
      pb.add(inner, { m: mk, slot: SLOT.HOOD, bw, mul: [0.45, 0.45, 0.45] });
      // knot tails behind the head
      for (const sg of [-1, 1]) {
        const tl = new THREE.BoxGeometry(0.028 * s, 0.09 * s, 0.006);
        pb.add(tl, { m: new THREE.Matrix4().multiplyMatrices(Mh(H[0] + sg * 0.02 * s, H[1] + 0.0 * s, H[2] + 0.1 * s), new THREE.Matrix4().makeRotationZ(sg * 0.3)), slot: SLOT.HOOD, bw: [[B.head, 0.7], [B.neck, 0.3]], mulFn: topLit() });
      }
    }
    return pb.build();
  });
}

// ------------------------------------------------------------------------------------------------
// Cape with thickness, hanging from the shoulders, skinned to cape0..cape3
export function capePiece(base, sp) {
  return cached(`${base.key}|cape|${JSON.stringify(sp)}`, () => {
    const pb = new PB(base);
    const J = base.JJ.J, P = base.P;
    const fn = base.chainSDF.torsoLegs;
    const top = J.cape0[1], len = (top - 0.12) * (sp.len ?? 0.85);
    const hw0 = (P.shX + P.delt[0] * 0.3) * 0.95, hw1 = hw0 * (sp.flare ?? 1.35);
    const cols = 9, rows = 12;
    const Z = [];
    const capeY = [J.cape0[1], J.cape1[1], J.cape2[1], J.cape3[1]];
    let running = new Float32Array(cols + 1).fill(-1);
    const grid = [];
    const hem = sp.hem || 'round';
    const hemK = (u) => hem === 'v' ? 1 - 0.16 * Math.abs(u) : hem === 'tatter' ? 1 - 0.09 * Math.abs(NZ.noise2(u * 7.3, 2.2)) - 0.05 * Math.abs(u) : 1 - 0.06 * u * u;
    for (let r = 0; r <= rows; r++) {
      const v = r / rows;
      const row = [];
      for (let c = 0; c <= cols; c++) {
        const u = c / cols * 2 - 1;
        const y = top - v * len * hemK(u);
        const hw = lerp(hw0, hw1, Math.pow(v, 0.8));
        const x = u * hw;
        // back surface z (march from behind)
        let z = J.cape0[2] - 0.02;
        const rr = marchIn((xx, yy, zz) => fn.eval(xx, yy, zz), x, y, J.spine[2], 0, 0, 1, 0.45);
        if (rr > 0.01) z = J.spine[2] + rr;
        z += 0.022 + v * 0.03;
        running[c] = Math.max(running[c] < -0.5 ? z : running[c] - 0.004 * 0, z);
        let zz = r < 2 ? z : Math.max(z, running[c] - 0.0);
        // wrap the top edge forward around the shoulders
        const wrap = (1 - smoothstep(0, 0.12, v)) * Math.pow(Math.abs(u), 2) * 0.07;
        zz -= wrap;
        // folds
        const fold = Math.sin(u * Math.PI * 3.5 + 0.6) * 0.018 * smoothstep(0.1, 1, v) + Math.sin(u * 11) * 0.004 * v;
        zz += fold;
        row.push([x + Math.sin(v * 3 + u) * 0.004, y, zz, u, v]);
      }
      grid.push(row);
    }
    // weights by height along cape bones
    const wfn = (y) => {
      for (let i = 0; i < 3; i++) if (y >= capeY[i + 1]) { const t = (capeY[i] - y) / (capeY[i] - capeY[i + 1]); return [[B['cape' + i], 1 - t], [B['cape' + (i + 1)], t]]; }
      return [[B.cape3, 1]];
    };
    const thick = 0.009;
    const trimW = sp.trim ? 0.1 : 0;
    const vid = [[], []];
    for (let face = 0; face < 2; face++) {
      for (let r = 0; r <= rows; r++) for (let c = 0; c <= cols; c++) {
        const [x, y, z, u, v] = grid[r][c];
        // normal approx: outward = +Z (back)
        const zz = face === 0 ? z + thick * 0.5 : z - thick * 0.5;
        const edge = Math.max(Math.abs(u), smoothstep(0.85, 1, v));
        const trim = trimW && (Math.abs(u) > 0.86 || v > 0.93);
        const slot = face === 0 ? (trim ? SLOT.TRIM : SLOT.CAPE1) : SLOT.CAPE2;
        const f = (face === 0 ? 0.95 - 0.12 * v : 0.7) * (1 - 0.15 * Math.max(0, Math.sin(u * Math.PI * 3.5 + 0.6 + 1.57))) * (r === 0 ? 0.8 : 1);
        let bw = wfn(y);
        if (r === 0) bw = [[B.chest, 0.5], [B.cape0, 0.5]];
        const id = pb.v(x, y, zz, 0, 0, face === 0 ? 1 : -1, slot, [f, f, f], trim && sp.glowTrim ? 0.22 : 0, bw);
        vid[face].push(id);
      }
    }
    const W = cols + 1;
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      const a = r * W + c, b = a + 1, cc2 = a + W, d = cc2 + 1;
      pb.tri(vid[0][a], vid[0][cc2], vid[0][d]); pb.tri(vid[0][a], vid[0][d], vid[0][b]);
      pb.tri(vid[1][a], vid[1][d], vid[1][cc2]); pb.tri(vid[1][a], vid[1][b], vid[1][d]);
    }
    // rim around the border (sides + bottom)
    const border = [];
    for (let r = 0; r <= rows; r++) border.push(r * W);
    for (let c = 1; c <= cols; c++) border.push(rows * W + c);
    for (let r = rows - 1; r >= 0; r--) border.push(r * W + cols);
    for (let i = 0; i < border.length - 1; i++) {
      const a = border[i], b = border[i + 1];
      pb.tri(vid[0][a], vid[1][a], vid[1][b]); pb.tri(vid[0][a], vid[1][b], vid[0][b]);
    }
    // smooth normals from the outer face grid
    const Pp = pb.P, Nn = pb.N;
    for (let face = 0; face < 2; face++) for (let r = 0; r <= rows; r++) for (let c = 0; c <= cols; c++) {
      const i = vid[face][r * W + c];
      const il = vid[face][r * W + Math.max(0, c - 1)], ir = vid[face][r * W + Math.min(cols, c + 1)];
      const iu = vid[face][Math.max(0, r - 1) * W + c], id2 = vid[face][Math.min(rows, r + 1) * W + c];
      const tx = [Pp[ir * 3] - Pp[il * 3], Pp[ir * 3 + 1] - Pp[il * 3 + 1], Pp[ir * 3 + 2] - Pp[il * 3 + 2]];
      const ty = [Pp[iu * 3] - Pp[id2 * 3], Pp[iu * 3 + 1] - Pp[id2 * 3 + 1], Pp[iu * 3 + 2] - Pp[id2 * 3 + 2]];
      let nx = tx[1] * ty[2] - tx[2] * ty[1], ny = tx[2] * ty[0] - tx[0] * ty[2], nz = tx[0] * ty[1] - tx[1] * ty[0];
      const l = Math.hypot(nx, ny, nz) || 1; const sgn = (face === 0 ? 1 : -1) * (nz >= 0 ? 1 : -1);
      Nn[i * 3] = nx / l * sgn; Nn[i * 3 + 1] = ny / l * sgn; Nn[i * 3 + 2] = nz / l * sgn;
    }
    // emblem on the back
    if (sp.emblem) {
      const e = emblemGeo(sp.emblem, 0.09 * base.scale);
      const r = Math.round(rows * 0.35), c = Math.round(cols / 2);
      const [x, y, z] = grid[r][c];
      pb.add(e, { m: new THREE.Matrix4().makeTranslation(x, y, z + thick * 0.5 + 0.002), slot: SLOT.EMBLEM, bw: wfn(y), mulFn: topLit(0.2, 1.0), emis: sp.glowTrim ? 0.3 : 0 });
    }
    return pb.build();
  });
}

// ------------------------------------------------------------------------------------------------
// Skirt / robe lower / tassets: rings from the waist down, flaring around both legs.
export function skirtPiece(base, sp) {
  return cached(`${base.key}|skirt|${JSON.stringify(sp)}`, () => {
    const pb = new PB(base);
    const J = base.JJ.J, P = base.P;
    const fn = base.chainSDF.torsoLegs;
    const y0 = J.spine[1] + (sp.top ?? -0.02), legTop = J.thighL[1];
    const hem = lerp(legTop, 0.06, sp.len ?? 1);
    const rows = sp.rows || 9, n = sp.n || 22;
    const ring = [];
    let prevR = null;
    for (let r = 0; r <= rows; r++) {
      const t = r / rows, y = lerp(y0, hem, t);
      const rs = [];
      for (let j = 0; j < n; j++) {
        const th = j / n * Math.PI * 2;
        const dx = Math.sin(th), dz = -Math.cos(th);
        let rr = marchIn((x, yy, z) => fn.eval(x, yy, z), 0, y, J.hips[2], dx, 0, dz, 0.6);
        rr = Math.max(rr, 0.05);
        rs.push(rr);
      }
      // smooth & flare, never shrink going down, make convex-ish
      for (let it = 0; it < 3; it++) { const cp = rs.slice(); for (let j = 0; j < n; j++) rs[j] = Math.max(cp[j], (cp[(j + n - 1) % n] + cp[(j + 1) % n]) * 0.5); }
      const flare = (sp.flare ?? 0.12) * t * t;
      for (let j = 0; j < n; j++) {
        rs[j] += (sp.off ?? 0.012) + flare;
        if (prevR) rs[j] = Math.max(rs[j], prevR[j] * (t > 0.3 ? 1.0 : 0.97));
      }
      prevR = rs.slice();
      ring.push({ y, rs, t });
    }
    const hy0 = y0, hy1 = hem;
    const wfn = (x, y, t, z = 0) => {
      const sL = smoothstep(0.06, -0.06, x), sR = 1 - sL;
      const h = t;
      const back = smoothstep(-0.02, 0.08, z - J.hips[2]); // rear half follows the hips (thighs swinging forward would lift it)
      const wh = 1 - smoothstep(0.0, 0.45, h) * 0.9 * (1 - back * 0.55);
      const wt = smoothstep(0.0, 0.45, h) * (1 - smoothstep(0.55, 1, h) * 0.4) * (1 - back * 0.6);
      const ws = smoothstep(0.5, 1, h) * 0.5 * (1 - back * 0.7);
      const out = [[B.hips, wh + 0.001]];
      if (sL > 0.01) out.push([B.thighL, wt * sL], [B.shinL, ws * sL]);
      if (sR > 0.01) out.push([B.thighR, wt * sR], [B.shinR, ws * sR]);
      out.sort((a, b) => b[1] - a[1]);
      return out.slice(0, 4);
    };
    const ids = [];
    for (let r = 0; r <= rows; r++) {
      const { y, rs, t } = ring[r];
      const row = [];
      for (let j = 0; j <= n; j++) {
        const jj = j % n, th = jj / n * Math.PI * 2;
        const dx = Math.sin(th), dz = -Math.cos(th);
        const x = dx * rs[jj], z = J.hips[2] + dz * rs[jj];
        const front = Math.cos(th);
        let slot = sp.slot ?? SLOT.CLOTH1;
        const panel = sp.panel && Math.abs(Math.atan2(dx, -dz)) < 0.3;
        if (panel) slot = sp.panelSlot ?? SLOT.CLOTH2;
        if (sp.hemTrim && t > 0.9) slot = sp.hemSlot ?? SLOT.TRIM;
        const fold = 0.88 + 0.14 * Math.sin(th * 9 + t * 1.5) * t;
        const f = fold * (0.95 - 0.12 * t) * (0.9 + 0.1 * front);
        const id = pb.v(x, y, z, dx, 0.15, dz, slot, [f, f, f], 0, wfn(x, y, t, z));
        row.push(id);
      }
      ids.push(row);
    }
    for (let r = 0; r < rows; r++) for (let j = 0; j < n; j++) {
      const a = ids[r][j], b = ids[r][j + 1], c = ids[r + 1][j + 1], d = ids[r + 1][j];
      pb.tri(a, d, c); pb.tri(a, c, b);
    }
    // inner surface (dark) so the robe has thickness when seen from below
    const ids2 = [];
    for (let r = rows - 2; r <= rows; r++) {
      const { y, rs } = ring[r];
      const row = [];
      for (let j = 0; j <= n; j++) {
        const jj = j % n, th = jj / n * Math.PI * 2, dx = Math.sin(th), dz = -Math.cos(th);
        row.push(pb.v(dx * (rs[jj] - 0.01), y, J.hips[2] + dz * (rs[jj] - 0.01), -dx, 0, -dz, sp.slot ?? SLOT.CLOTH1, [0.35, 0.35, 0.35], 0, wfn(dx * rs[jj], y, r / rows, J.hips[2] + dz * rs[jj])));
      }
      ids2.push(row);
    }
    for (let r = 0; r < 2; r++) for (let j = 0; j < n; j++) { const a = ids2[r][j], b = ids2[r][j + 1], c = ids2[r + 1][j + 1], d = ids2[r + 1][j]; pb.tri(a, c, d); pb.tri(a, b, c); }
    for (let j = 0; j < n; j++) { const a = ids[rows][j], b = ids[rows][j + 1], c = ids2[2][j + 1], d = ids2[2][j]; pb.tri(a, c, d); pb.tri(a, b, c); }
    // fix normals from geometry for the outer rows
    recomputeRowNormals(pb, ids);
    return pb.build();
  });
}

function recomputeRowNormals(pb, ids) {
  const P = pb.P, N = pb.N;
  const R = ids.length, C = ids[0].length;
  for (let r = 0; r < R; r++) for (let c = 0; c < C; c++) {
    const i = ids[r][c];
    const il = ids[r][(c - 1 + C - 1) % (C - 1)], ir = ids[r][(c + 1) % (C - 1)];
    const iu = ids[Math.max(0, r - 1)][c], id = ids[Math.min(R - 1, r + 1)][c];
    const tx = [P[ir * 3] - P[il * 3], P[ir * 3 + 1] - P[il * 3 + 1], P[ir * 3 + 2] - P[il * 3 + 2]];
    const ty = [P[iu * 3] - P[id * 3], P[iu * 3 + 1] - P[id * 3 + 1], P[iu * 3 + 2] - P[id * 3 + 2]];
    let nx = tx[1] * ty[2] - tx[2] * ty[1], ny = tx[2] * ty[0] - tx[0] * ty[2], nz = tx[0] * ty[1] - tx[1] * ty[0];
    const l = Math.hypot(nx, ny, nz) || 1; nx /= l; ny /= l; nz /= l;
    // keep outward (same side as stored radial normal)
    if (nx * N[i * 3] + nz * N[i * 3 + 2] < 0) { nx = -nx; ny = -ny; nz = -nz; }
    N[i * 3] = nx; N[i * 3 + 1] = ny; N[i * 3 + 2] = nz;
  }
}

// ------------------------------------------------------------------------------------------------
// Tabard / apron panels (front + optional back), conforming at the top, hanging below the belt
export function panelPiece(base, sp) {
  return cached(`${base.key}|panel|${JSON.stringify(sp)}`, () => {
    const pb = new PB(base);
    const J = base.JJ.J, P = base.P;
    const fn = base.chainSDF.torso;
    const top = sp.top ?? (J.chest[1] + 0.1), bot = sp.bottom ?? (J.shinL[1] + 0.08);
    const hw = sp.hw ?? P.core[1] * 0.75;
    const cols = 6, rows = 12;
    for (const face of sp.back ? [-1, 1] : [-1]) { // -1 front, +1 back
      const ids = [];
      let running = new Float32Array(cols + 1).fill(-1);
      for (let r = 0; r <= rows; r++) {
        const v = r / rows, y = lerp(top, bot, v);
        const row = [];
        for (let c = 0; c <= cols; c++) {
          const u = c / cols * 2 - 1, x = u * hw * (1 + v * 0.1);
          const rr = marchIn((xx, yy, zz) => fn.eval(xx, yy, zz), x, y, J.spine[2], 0, 0, face, 0.45);
          let z = J.spine[2] + face * (rr > 0.01 ? rr : 0.05) + face * 0.018;
          if (face < 0) { running[c] = running[c] < -0.5 ? z : Math.min(running[c], z); z = Math.min(z, running[c]); }
          else { running[c] = running[c] < -0.5 ? z : Math.max(running[c], z); z = Math.max(z, running[c]); }
          const slot = (sp.trim && (Math.abs(u) > 0.8 || v > 0.9)) ? SLOT.TRIM : (sp.slot ?? SLOT.TABARD);
          const f = 0.92 - 0.1 * v + 0.05 * Math.cos(u * 3);
          const bw = y > J.hips[1] ? 'auto' : [[B.hips, 0.6], [B.thighL, 0.2 * smoothstep(0.2, -0.3, u) + 0.05], [B.thighR, 0.2 * smoothstep(-0.2, 0.3, u) + 0.05]];
          row.push(pb.v(x, y, z, 0, 0, face, slot, [f, f, f], 0, bw));
        }
        ids.push(row);
      }
      for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
        const a = ids[r][c], b = ids[r][c + 1], cc = ids[r + 1][c + 1], d = ids[r + 1][c];
        if (face < 0) { pb.tri(a, cc, d); pb.tri(a, b, cc); } else { pb.tri(a, d, cc); pb.tri(a, cc, b); }
      }
      // backside of the hanging part (thin)
      for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
        const a = ids[r][c], b = ids[r][c + 1], cc = ids[r + 1][c + 1], d = ids[r + 1][c];
        if (face < 0) { pb.tri(a, d, cc); pb.tri(a, cc, b); } else { pb.tri(a, cc, d); pb.tri(a, b, cc); }
      }
      recomputeRowNormalsPanel(pb, ids, face);
      if (sp.emblem) {
        const r = Math.round(rows * 0.3), [x, y, z] = [pb.P[ids[r][cols / 2] * 3], pb.P[ids[r][cols / 2] * 3 + 1], pb.P[ids[r][cols / 2] * 3 + 2]];
        const e = emblemGeo(sp.emblem, 0.075 * base.scale);
        const m = new THREE.Matrix4().makeTranslation(x, y, z + face * 0.004);
        if (face < 0) m.multiply(new THREE.Matrix4().makeRotationY(Math.PI));
        pb.add(e, { m, slot: SLOT.EMBLEM, bw: 'auto', mulFn: topLit(0.2, 1) });
      }
    }
    return pb.build();
  });
}
function recomputeRowNormalsPanel(pb, ids, face) {
  const P = pb.P, N = pb.N, R = ids.length, C = ids[0].length;
  for (let r = 0; r < R; r++) for (let c = 0; c < C; c++) {
    const i = ids[r][c], il = ids[r][Math.max(0, c - 1)], ir = ids[r][Math.min(C - 1, c + 1)], iu = ids[Math.max(0, r - 1)][c], id = ids[Math.min(R - 1, r + 1)][c];
    const tx = [P[ir * 3] - P[il * 3], P[ir * 3 + 1] - P[il * 3 + 1], P[ir * 3 + 2] - P[il * 3 + 2]];
    const ty = [P[iu * 3] - P[id * 3], P[iu * 3 + 1] - P[id * 3 + 1], P[iu * 3 + 2] - P[id * 3 + 2]];
    let nx = tx[1] * ty[2] - tx[2] * ty[1], ny = tx[2] * ty[0] - tx[0] * ty[2], nz = tx[0] * ty[1] - tx[1] * ty[0];
    const l = Math.hypot(nx, ny, nz) || 1; if (nz * face < 0) { nx = -nx; ny = -ny; nz = -nz; }
    N[i * 3] = nx / l; N[i * 3 + 1] = ny / l; N[i * 3 + 2] = nz / l;
  }
}

// ------------------------------------------------------------------------------------------------
// Knee / elbow cops, toe caps, glove cuffs (lathe shells in limb frames)
export function copPiece(base, side, where, sp) {
  return cached(`${base.key}|cop|${side}|${where}|${JSON.stringify(sp)}`, () => {
    const pb = new PB(base);
    const J = base.JJ.J, P = base.P;
    const sz = sp.size ?? 1;
    let C, out, bw, R;
    if (where === 'knee') {
      const K = J['shin' + side]; out = [0, 0.08, -1]; R = P.thighR[1] * 0.85 * sz; bw = [[B['shin' + side], 0.5], [B['thigh' + side], 0.5]];
      const lf = base.chainSDF['leg' + side];
      const rr = marchIn((x, y, z) => lf.eval(x, y, z), K[0], K[1] + 0.01, K[2], 0, 0, -1, 0.3);
      C = [K[0], K[1] + 0.01, K[2] - rr - 0.004];
    } else if (where === 'elbow') {
      const Jf = J['farm' + side]; const A = base.JJ.A[side];
      const back = [A.RA[2] * 1, A.RA[5] * 1, A.RA[8] * 1]; // neutral +Z (back of elbow) in bind
      C = [Jf[0] + back[0] * P.farmR[0] * 0.7, Jf[1] + back[1] * P.farmR[0] * 0.7, Jf[2] + back[2] * P.farmR[0] * 0.7]; out = back; R = P.farmR[0] * 0.95 * sz;
      bw = [[B['farm' + side], 0.5], [B['uarm' + side], 0.5]];
    } else { // toe cap
      const T = J['toe' + side]; C = [T[0], T[1] + 0.005, T[2] - P.foot[2] * 0.25]; out = [0, 0.6, -1]; R = P.foot[0] * 1.15 * sz; bw = [[B['toe' + side], 0.7], [B['foot' + side], 0.3]];
    }
    const H = R * 0.55;
    const prof = [new THREE.Vector2(R * 0.92, -0.008)];
    for (let i = 0; i <= 5; i++) { const a = i / 5 * Math.PI / 2; prof.push(new THREE.Vector2(Math.max(0.001, Math.cos(a) * R), Math.sin(a) * H)); }
    const g = new THREE.LatheGeometry(prof, 12);
    const m = axisMatrix(C, out, [1, 0, 0]);
    pb.add(g, { m, slot: sp.slot ?? SLOT.ARMOR1, bw, mulFn: (p, n) => { const f = 0.85 + 0.25 * Math.max(0, n.y) ; return [f, f, f]; } });
    if (sp.spike) {
      const cone = new THREE.ConeGeometry(0.014, 0.05, 5); cone.translate(0, 0.025, 0);
      pb.add(cone, { m: new THREE.Matrix4().multiplyMatrices(m, new THREE.Matrix4().makeTranslation(0, H * 0.8, 0)), slot: SLOT.METAL, bw });
    }
    if (sp.rim) {
      const tor = new THREE.TorusGeometry(R * 0.95, 0.006, 5, 14);
      pb.add(tor, { m: new THREE.Matrix4().multiplyMatrices(m, new THREE.Matrix4().makeRotationX(Math.PI / 2)), slot: SLOT.TRIM, bw });
    }
    return pb.build();
  });
}

// flared cuff (gauntlet / boot top) around a limb at coordinate `at`
export function cuffPiece(base, chain, at, sp) {
  return cached(`${base.key}|cuff|${chain}|${at}|${JSON.stringify(sp)}`, () => {
    const pb = new PB(base);
    const f = chainFrame(base, chain, at);
    const w = sp.w ?? 0.07, fl = sp.flare ?? 0.03, t = sp.t ?? 0.01;
    // profile along axis: bottom tight, top flared (toward the proximal end = -axis)
    const prof = [[fl * 0.5, -w / 2], [t * 0.4 + fl, -w / 2 - t * 0.4], [t + fl, -w / 2], [t, w / 2], [0, w / 2]];
    ringSweep(pb, { ...f, n: 14, off: sp.off ?? 0.006, profile: prof, slot: sp.slot ?? SLOT.ARMOR1, rMax: 0.2, emis: sp.emis || 0,
      mulFn: (j, k, m) => { const q = k === 2 || k === 3 ? 1.12 : 0.95; return [m[0] * q, m[1] * q, m[2] * q]; } });
    if (sp.trim) ringSweep(pb, { ...f, C: f.C.map((v, i) => v - f.axis[i] / Math.hypot(...f.axis) * (w / 2)), n: 14, off: (sp.off ?? 0.006) + fl + t * 0.5, profile: PROFILES.tube(0.012), slot: SLOT.TRIM, rMax: 0.2, emis: sp.glowTrim ? 0.4 : 0 });
    return pb.build();
  });
}

// ------------------------------------------------------------------------------------------------
// Belt with buckle & pouches
export function beltPiece(base, sp) {
  return cached(`${base.key}|belt|${JSON.stringify(sp)}`, () => {
    const pb = new PB(base);
    const J = base.JJ.J, P = base.P;
    const y = J.spine[1] + (sp.dy ?? -0.035);
    const w = (sp.w ?? 0.055) * Math.max(0.85, base.scale);
    const f = chainFrame(base, 'torso', y);
    const { rs, dirs } = ringSweep(pb, { ...f, n: 28, off: sp.off ?? 0.012, profile: PROFILES.band(w, 0.012), slot: sp.slot ?? SLOT.BELT, rMax: 0.42, stitch: sp.type === 'leather',
      mulFn: (j, k, m) => (k === 0 || k === 5) ? [m[0] * 0.7, m[1] * 0.7, m[2] * 0.7] : m });
    const frontR = rs[0] + (sp.off ?? 0.012) + 0.014;
    const bc = [0, y, f.C[2] - frontR];
    const bwb = 'auto';
    if (sp.buckle === 'gem' || sp.buckle === 'plate' || sp.buckle === 'skull') {
      const plate = new THREE.CylinderGeometry(w * 0.72, w * 0.72, 0.012, sp.buckle === 'skull' ? 8 : 6);
      pb.add(plate, { m: new THREE.Matrix4().makeRotationX(Math.PI / 2).setPosition(bc[0], bc[1], bc[2] - 0.004), slot: SLOT.TRIM, bw: bwb, mulFn: topLit(0.3, 0.95) });
      const gem = new THREE.OctahedronGeometry(w * 0.3, 0);
      pb.add(gem, { m: new THREE.Matrix4().makeTranslation(bc[0], bc[1], bc[2] - 0.014), slot: sp.buckle === 'skull' ? SLOT.BONE : SLOT.GEM, bw: bwb, emis: sp.buckle === 'skull' ? 0 : 1 });
    } else if (sp.buckle !== 'none') {
      // square frame buckle
      const bs = w * 0.9, bt = 0.008;
      for (const [dx, dy, sx, sy] of [[0, bs / 2, bs + bt, bt], [0, -bs / 2, bs + bt, bt], [bs / 2, 0, bt, bs], [-bs / 2, 0, bt, bs]]) {
        const bx = new THREE.BoxGeometry(sx, sy, 0.008);
        pb.add(bx, { m: new THREE.Matrix4().makeTranslation(bc[0] + dx, bc[1] + dy, bc[2]), slot: SLOT.METAL, bw: bwb, mulFn: topLit(0.3, 1.0) });
      }
    }
    for (let i = 0; i < (sp.pouches || 0); i++) {
      const j = Math.round(28 * (i % 2 === 0 ? 0.3 : 0.7) + (i >> 1) * 3);
      const d = dirs[j % 28], r = rs[j % 28] + 0.03;
      const pouch = new THREE.BoxGeometry(0.06, 0.07, 0.035, 1, 1, 1);
      rounden(pouch, 0.012);
      const m = new THREE.Matrix4().makeRotationY(Math.atan2(d.x, d.z)).setPosition(d.x * r, y - 0.03, f.C[2] + d.z * r);
      pb.add(pouch, { m, slot: SLOT.LEATHER, bw: bwb, mulFn: topLit(0.3, 0.85) });
    }
    return pb.build();
  });
}

// ------------------------------------------------------------------------------------------------
// bandolier strap over the left shoulder to the right hip (tilted contour ring on the torso)
export function strapPiece(base, sp = {}) {
  return cached(`${base.key}|strap|${JSON.stringify(sp)}`, () => {
    const pb = new PB(base);
    const J = base.JJ.J, P = base.P;
    const sh = [-P.shX * 0.5, J.neck[1] - 0.005], hp = [P.core[0] * 0.95, J.spine[1] - 0.05];
    let dx = hp[0] - sh[0], dy = hp[1] - sh[1]; const l = Math.hypot(dx, dy); dx /= l; dy /= l;
    const axis = [dy, -dx, 0]; // perpendicular to the strap direction within XY (plane contains Z)
    const C = [(sh[0] + hp[0]) / 2, (sh[1] + hp[1]) / 2, J.spine[2]];
    ringSweep(pb, { sdf: base.chainSDF.torso, C, axis, front: [0, 0, -1], n: 32, off: sp.off ?? 0.014, profile: PROFILES.band(0.04 * base.scale, 0.011), slot: SLOT.BELT, rMax: 0.5, stitch: true, smooth: 3 });
    // buckle on the chest
    const bpos = [C[0] - dx * 0.05, C[1] - dy * 0.05 + 0.05, 0];
    const rr = marchIn((x, y, z) => base.chainSDF.torso.eval(x, y, z), bpos[0], bpos[1], J.spine[2], 0, 0, -1, 0.5);
    const bz = J.spine[2] - rr - 0.03;
    for (const [ox, oy, w, h] of [[0, 0.022, 0.05, 0.008], [0, -0.022, 0.05, 0.008], [0.022, 0, 0.008, 0.05], [-0.022, 0, 0.008, 0.05]]) {
      const bx = new THREE.BoxGeometry(w, h, 0.008);
      pb.add(bx, { m: new THREE.Matrix4().makeTranslation(bpos[0] + ox, bpos[1] + oy, bz), slot: SLOT.METAL, bw: 'auto', mulFn: topLit(0.3, 1) });
    }
    return pb.build();
  });
}

// plate limb segmentation: raised plate edges around arms/legs
export function limbPlatesPiece(base, sp = {}) {
  return cached(`${base.key}|limbplates|${JSON.stringify(sp)}`, () => {
    const pb = new PB(base);
    const arms = sp.arms ?? [0.45, 1.35, 1.62], legs = sp.legs ?? [0.35, 0.7, 1.3, 1.62];
    for (const side of ['L', 'R']) {
      for (const a of arms) { const f = chainFrame(base, 'arm' + side, a); ringSweep(pb, { ...f, n: 12, off: 0.014, profile: PROFILES.lip(0.022, 0.011), slot: SLOT.ARMOR1, rMax: 0.2, mulFn: (j, k, m) => (k >= 3 ? [m[0] * 1.2, m[1] * 1.2, m[2] * 1.2] : [m[0] * 0.75, m[1] * 0.75, m[2] * 0.75]) }); }
      for (const l of legs) { const f = chainFrame(base, 'leg' + side, l); ringSweep(pb, { ...f, n: 13, off: 0.015, profile: PROFILES.lip(0.024, 0.012), slot: l > 1.5 ? SLOT.BOOT : SLOT.ARMOR1, rMax: 0.25, arc: l > 1.5 ? null : [-1.9, 1.9], mulFn: (j, k, m) => (k >= 3 ? [m[0] * 1.2, m[1] * 1.2, m[2] * 1.2] : [m[0] * 0.75, m[1] * 0.75, m[2] * 0.75]) }); }
    }
    return pb.build();
  });
}

// horizontal plate lames across the belly (front arcs)
export function lamesPiece(base, sp = {}) {
  return cached(`${base.key}|lames|${JSON.stringify(sp)}`, () => {
    const pb = new PB(base);
    const J = base.JJ.J;
    const n = sp.count ?? 3;
    for (let i = 0; i < n; i++) {
      const y = J.spine[1] + 0.02 + i * 0.048 * base.scale;
      const f = chainFrame(base, 'torso', y);
      ringSweep(pb, { ...f, arc: [-1.35, 1.35], n: 14, off: 0.014, profile: PROFILES.lip(0.03, 0.012), slot: i === n - 1 && sp.trim ? SLOT.TRIM : SLOT.ARMOR1, rMax: 0.42,
        mulFn: (j, k, m) => (k >= 3 ? [m[0] * 1.15, m[1] * 1.15, m[2] * 1.15] : [m[0] * 0.8, m[1] * 0.8, m[2] * 0.8]) });
    }
    return pb.build();
  });
}

export function tusksPiece(base) {
  return cached(`${base.key}|tusks`, () => {
    const pb = new PB(base);
    const d = base.P.headDef, s = d.s, H = base.JJ.J.head;
    const k = d.tusks || 0;
    if (!k) return null;
    for (const sg of [-1, 1]) {
      const pts = [], rads = [];
      for (let i = 0; i <= 6; i++) {
        const t = i / 6;
        pts.push(new THREE.Vector3(H[0] + sg * (0.028 + t * 0.012) * s, H[1] + (d.lipL.c[1] - 0.004 + t * 0.045 * k) * s, H[2] + (d.lipL.c[2] + 0.004 - t * 0.012 * k + t * t * 0.01) * s));
        rads.push(0.0085 * s * k * (1 - t * 0.85) + 0.001);
      }
      pb.add(tubeGeo(pts, rads, 6), { slot: SLOT.BONE, bw: [[B.head, 1]], mulFn: (p, n) => { const f = 0.85 + 0.25 * n.y; return [f, f * 0.98, f * 0.9]; } });
    }
    return pb.build();
  });
}

export function quiverPiece(base, sp = {}) {
  return cached(`${base.key}|quiver`, () => {
    const pb = new PB(base);
    const J = base.JJ.J, P = base.P;
    const c = [J.chest[0] + 0.07, J.chest[1] + 0.1, J.chest[2] + P.ribs[2] + 0.06];
    const L = 0.5 * base.scale;
    const m = axisMatrix(c, [-0.35, 1, 0.05]);
    const tube = new THREE.CylinderGeometry(0.055, 0.045, L, 10, 1, false);
    pb.add(tube, { m, slot: SLOT.LEATHER, bw: [[B.chest, 1]], mulFn: (p, n) => { const f = 0.8 + 0.2 * n.x; return [f, f, f]; } });
    for (const y of [-L * 0.4, L * 0.35]) { const t = new THREE.TorusGeometry(0.056, 0.006, 4, 12); pb.add(t, { m: new THREE.Matrix4().multiplyMatrices(m, new THREE.Matrix4().makeRotationX(Math.PI / 2).setPosition(0, y, 0)), slot: SLOT.TRIM, bw: [[B.chest, 1]] }); }
    for (let i = 0; i < 6; i++) { // arrow fletchings
      const a = i / 6 * Math.PI * 2;
      const sh = new THREE.CylinderGeometry(0.004, 0.004, 0.12, 4);
      pb.add(sh, { m: new THREE.Matrix4().multiplyMatrices(m, new THREE.Matrix4().makeTranslation(Math.cos(a) * 0.028, L / 2 + 0.05, Math.sin(a) * 0.028)), slot: SLOT.WOOD, bw: [[B.chest, 1]] });
      const fl = new THREE.BoxGeometry(0.004, 0.05, 0.022);
      pb.add(fl, { m: new THREE.Matrix4().multiplyMatrices(m, new THREE.Matrix4().makeTranslation(Math.cos(a) * 0.028, L / 2 + 0.1, Math.sin(a) * 0.028)), slot: SLOT.CLOTH2, bw: [[B.chest, 1]] });
    }
    // strap across the chest
    return pb.build();
  });
}

// ------------------------------------------------------------------------------------------------
// shared geometry helpers
export function tubeGeo(points, radii, radial = 8) {
  const pos = [], nrm = [], idx = [];
  const n = points.length;
  let prevN = null;
  const T = new THREE.Vector3(), N = new THREE.Vector3(), Bn = new THREE.Vector3();
  for (let i = 0; i < n; i++) {
    const p = points[i];
    if (i < n - 1) T.subVectors(points[i + 1], p); else T.subVectors(p, points[i - 1]);
    T.normalize();
    if (!prevN) { N.set(0, 0, 1); if (Math.abs(T.dot(N)) > 0.9) N.set(1, 0, 0); N.sub(T.clone().multiplyScalar(T.dot(N))).normalize(); }
    else N.copy(prevN).sub(T.clone().multiplyScalar(T.dot(prevN))).normalize();
    prevN = N.clone(); Bn.crossVectors(T, N);
    for (let r = 0; r <= radial; r++) {
      const a = r / radial * Math.PI * 2, cx = Math.cos(a), cy = Math.sin(a);
      const nx = N.x * cx + Bn.x * cy, ny = N.y * cx + Bn.y * cy, nz = N.z * cx + Bn.z * cy;
      pos.push(p.x + nx * radii[i], p.y + ny * radii[i], p.z + nz * radii[i]); nrm.push(nx, ny, nz);
    }
  }
  for (let i = 0; i < n - 1; i++) for (let r = 0; r < radial; r++) { const a = i * (radial + 1) + r, b = a + radial + 1; idx.push(a, b, a + 1, a + 1, b, b + 1); }
  // tip cap
  const c = pos.length / 3, p = points[n - 1]; pos.push(p.x, p.y, p.z); nrm.push(T.x, T.y, T.z);
  for (let r = 0; r < radial; r++) idx.push((n - 1) * (radial + 1) + r, c, (n - 1) * (radial + 1) + r + 1);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3)); g.setIndex(idx);
  return g;
}
export function starGeo(r, points = 5, depth = 0.004, inner = 0.45) {
  const sh = new THREE.Shape();
  for (let i = 0; i <= points * 2; i++) { const a = i / (points * 2) * Math.PI * 2 + Math.PI / 2; const rr = i % 2 ? r * inner : r; if (i === 0) sh.moveTo(Math.cos(a) * rr, Math.sin(a) * rr); else sh.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); }
  return new THREE.ExtrudeGeometry(sh, { depth, bevelEnabled: true, bevelThickness: depth * 0.5, bevelSize: depth * 0.4, bevelSegments: 1 });
}
/** heraldic emblems centred at origin facing +Z */
export function emblemGeo(kind, r) {
  const sh = new THREE.Shape();
  if (kind === 'star') return starGeo(r, 5, 0.006, 0.42);
  if (kind === 'sun') return starGeo(r, 12, 0.006, 0.7);
  if (kind === 'lion' || kind === 'shield') {
    sh.moveTo(-r * 0.8, r); sh.lineTo(r * 0.8, r); sh.lineTo(r * 0.8, 0); sh.quadraticCurveTo(r * 0.7, -r * 0.8, 0, -r * 1.15); sh.quadraticCurveTo(-r * 0.7, -r * 0.8, -r * 0.8, 0); sh.lineTo(-r * 0.8, r);
  } else if (kind === 'cross') {
    const w = r * 0.28; sh.moveTo(-w, r); sh.lineTo(w, r); sh.lineTo(w, w); sh.lineTo(r, w); sh.lineTo(r, -w); sh.lineTo(w, -w); sh.lineTo(w, -r); sh.lineTo(-w, -r); sh.lineTo(-w, -w); sh.lineTo(-r, -w); sh.lineTo(-r, w); sh.lineTo(-w, w); sh.lineTo(-w, r);
  } else if (kind === 'moon') {
    sh.absarc(0, 0, r, 0.4, Math.PI * 2 - 0.4, false); sh.absarc(r * 0.45, 0, r * 0.75, Math.PI * 2 - 0.9, 0.9, true);
  } else if (kind === 'skull') {
    sh.absarc(0, r * 0.15, r * 0.75, 0, Math.PI * 2, false);
    const g1 = new THREE.Path(); g1.absarc(-r * 0.3, r * 0.15, r * 0.2, 0, Math.PI * 2, true); sh.holes.push(g1);
    const g2 = new THREE.Path(); g2.absarc(r * 0.3, r * 0.15, r * 0.2, 0, Math.PI * 2, true); sh.holes.push(g2);
  } else { // diamond
    sh.moveTo(0, r); sh.lineTo(r * 0.7, 0); sh.lineTo(0, -r); sh.lineTo(-r * 0.7, 0); sh.lineTo(0, r);
  }
  return new THREE.ExtrudeGeometry(sh, { depth: 0.006, bevelEnabled: true, bevelThickness: 0.003, bevelSize: 0.003, bevelSegments: 1, curveSegments: 4 });
}
function rounden(geo, r) { // push box verts toward a rounded box (cheap)
  geo.computeBoundingBox(); const bb = geo.boundingBox; const c = new THREE.Vector3(); bb.getCenter(c);
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) { _v.fromBufferAttribute(p, i).sub(c); _v.multiplyScalar(0.97); p.setXYZ(i, _v.x + c.x, _v.y + c.y, _v.z + c.z); }
  geo.computeVertexNormals();
}
