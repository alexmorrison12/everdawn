// Creature sculpting: smooth-unioned SDF primitives (ellipsoids / round cones / rounded boxes) bound to bones,
// meshed with surface nets (narrow-band, block-culled), projected onto the true surface, then skinned
// (primitive→bone influence, mesh-smoothed), painted (blended primitive colours + creature paint fn) and
// shaded (baked SDF ambient occlusion + top/bottom gradient) into vertex attributes.
import * as THREE from 'three';
import { linColor } from '../../engine/geom.js';

const _q = new THREE.Quaternion(), _e = new THREE.Euler(), _m = new THREE.Matrix4(), _v = new THREE.Vector3();
const ZA = new THREE.Vector3(0, 0, 1);

export function smin(a, b, k) {
  if (k <= 0) return a < b ? a : b;
  const h = k - Math.abs(a - b);
  if (h <= 0) return a < b ? a : b;
  const t = h / k;
  return (a < b ? a : b) - t * t * k * 0.25;
}
export const smax = (a, b, k) => -smin(-a, -b, k);
export const col = (c) => Array.isArray(c) ? c : linColor(c);

// world→local rotation (row-major 3x3) from {rot:[x,y,z]} | {dir:[x,y,z], roll} | identity
function frame(o) {
  if (o.rot) _q.setFromEuler(_e.set(o.rot[0], o.rot[1], o.rot[2], 'YXZ'));
  else if (o.dir) {
    _v.set(o.dir[0], o.dir[1], o.dir[2]).normalize();
    _q.setFromUnitVectors(ZA, _v);
    if (o.roll) _q.multiply(new THREE.Quaternion().setFromAxisAngle(ZA, o.roll));
  } else _q.identity();
  _m.makeRotationFromQuaternion(_q);
  const e = _m.elements;
  return [e[0], e[1], e[2], e[4], e[5], e[6], e[8], e[9], e[10]];
}

let PRIM_ID = 0;
export class Prim {
  constructor(kind, bone, o) {
    this.id = PRIM_ID++;
    this.kind = kind; this.bone = bone; this.o = o;
    this.group = o.group ?? 0;
    this.k = o.k ?? 0.03;
    this.sub = !!o.sub;
    this.color = col(o.col ?? 0x808080);
    this.tag = o.tag ?? null;
    this.soft = o.soft ?? (this.k * 0.3 + 0.006);         // colour blend width
    this.wsoft = o.wsoft ?? (this.k * 0.55 + 0.012);      // skin blend width
    this.wmul = o.wmul ?? 1;
    this.cw = o.cw ?? 1;             // colour priority (garments, markings)
    this.dtl = o.dtl ?? null;
    this.emis = o.emis ?? 0;
    this.mod = o.mod ?? null;
    this.b2 = o.b2 ?? -1; this.t0 = o.t0 ?? 0.25; this.t1 = o.t1 ?? 0.85;
    this.ao = o.ao ?? true;       // participates in AO
    this.tip = o.tip ? { c: col(o.tip.col ?? o.tip.c), from: o.tip.from ?? 0.4, to: o.tip.to ?? 1 } : null; // colour gradient along axis
  }
  // axis parameter (0..1) along the primitive's main axis, used for 2-bone blending
  axisT(x, y, z) {
    if (this.kind === 1) {
      const t = ((x - this.ax) * this.bax + (y - this.ay) * this.bay + (z - this.az) * this.baz) / this.l2;
      return t < 0 ? 0 : t > 1 ? 1 : t;
    }
    const px = x - this.ox, py = y - this.oy, pz = z - this.oz, R = this.R;
    const lz = R[6] * px + R[7] * py + R[8] * pz;
    const t = (lz / this.hz + 1) * 0.5;
    return t < 0 ? 0 : t > 1 ? 1 : t;
  }
  dist(x, y, z) {
    let d;
    if (this.kind === 0) { // ellipsoid (iq bound)
      const px = x - this.ox, py = y - this.oy, pz = z - this.oz, R = this.R;
      const lx = R[0] * px + R[1] * py + R[2] * pz, ly = R[3] * px + R[4] * py + R[5] * pz, lz = R[6] * px + R[7] * py + R[8] * pz;
      const ax = lx * this.ix, ay = ly * this.iy, az = lz * this.iz;
      const k0 = Math.sqrt(ax * ax + ay * ay + az * az);
      const bx = ax * this.ix, by = ay * this.iy, bz = az * this.iz;
      const k1 = Math.sqrt(bx * bx + by * by + bz * bz);
      d = k1 < 1e-9 ? -this.rmin : k0 * (k0 - 1) / k1;
    } else if (this.kind === 1) { // round cone (iq)
      const pax = x - this.ax, pay = y - this.ay, paz = z - this.az;
      const bax = this.bax, bay = this.bay, baz = this.baz, l2 = this.l2;
      const yy = pax * bax + pay * bay + paz * baz, zz = yy - l2;
      const qx = pax * l2 - bax * yy, qy = pay * l2 - bay * yy, qz = paz * l2 - baz * yy;
      const x2 = qx * qx + qy * qy + qz * qz, y2 = yy * yy * l2, z2 = zz * zz * l2;
      const rr = this.rr, a2 = this.a2, il2 = this.il2;
      const k = (rr > 0 ? 1 : rr < 0 ? -1 : 0) * rr * rr * x2;
      if ((zz > 0 ? 1 : zz < 0 ? -1 : 0) * a2 * z2 > k) d = Math.sqrt(x2 + z2) * il2 - this.r2;
      else if ((yy > 0 ? 1 : yy < 0 ? -1 : 0) * a2 * y2 < k) d = Math.sqrt(x2 + y2) * il2 - this.r1;
      else d = (Math.sqrt(x2 * a2 * il2) + yy * rr) * il2 - this.r1;
    } else { // rounded box
      const px = x - this.ox, py = y - this.oy, pz = z - this.oz, R = this.R;
      const lx = Math.abs(R[0] * px + R[1] * py + R[2] * pz) - this.bx;
      const ly = Math.abs(R[3] * px + R[4] * py + R[5] * pz) - this.by;
      const lz = Math.abs(R[6] * px + R[7] * py + R[8] * pz) - this.bz;
      const mx = lx > 0 ? lx : 0, my = ly > 0 ? ly : 0, mz = lz > 0 ? lz : 0;
      const inner = Math.max(lx, ly, lz);
      d = Math.sqrt(mx * mx + my * my + mz * mz) + (inner < 0 ? inner : 0) - this.rr;
    }
    return this.mod ? this.mod(x, y, z, d) : d;
  }
}

function mkEll(bone, c, r, o) {
  const p = new Prim(0, bone, o);
  p.ox = c[0]; p.oy = c[1]; p.oz = c[2];
  p.R = frame(o);
  p.ix = 1 / r[0]; p.iy = 1 / r[1]; p.iz = 1 / r[2]; p.rmin = Math.min(r[0], r[1], r[2]); p.hz = r[2];
  const R = p.R, ex = [0, 0, 0];
  for (let i = 0; i < 3; i++) ex[i] = Math.hypot(R[i] * r[0], R[3 + i] * r[1], R[6 + i] * r[2]);
  const pad = p.k + (o.pad ?? 0);
  p.bb = [c[0] - ex[0] - pad, c[1] - ex[1] - pad, c[2] - ex[2] - pad, c[0] + ex[0] + pad, c[1] + ex[1] + pad, c[2] + ex[2] + pad];
  return p;
}
function mkCone(bone, a, b, ra, rb, o) {
  const p = new Prim(1, bone, o);
  p.ax = a[0]; p.ay = a[1]; p.az = a[2];
  p.bax = b[0] - a[0]; p.bay = b[1] - a[1]; p.baz = b[2] - a[2];
  p.l2 = p.bax * p.bax + p.bay * p.bay + p.baz * p.baz;
  const L = Math.sqrt(p.l2);
  if (Math.abs(ra - rb) >= L) { // degenerate: shrink the smaller radius
    if (ra > rb) rb = ra - L * 0.95; else ra = rb - L * 0.95;
  }
  p.r1 = ra; p.r2 = rb; p.rr = ra - rb; p.a2 = p.l2 - p.rr * p.rr; p.il2 = 1 / p.l2;
  const pad = p.k + (o.pad ?? 0);
  p.bb = [Math.min(a[0] - ra, b[0] - rb) - pad, Math.min(a[1] - ra, b[1] - rb) - pad, Math.min(a[2] - ra, b[2] - rb) - pad,
    Math.max(a[0] + ra, b[0] + rb) + pad, Math.max(a[1] + ra, b[1] + rb) + pad, Math.max(a[2] + ra, b[2] + rb) + pad];
  return p;
}
function mkBox(bone, c, half, round, o) {
  const p = new Prim(2, bone, o);
  p.ox = c[0]; p.oy = c[1]; p.oz = c[2];
  p.R = frame(o);
  p.rr = round; p.bx = half[0] - round; p.by = half[1] - round; p.bz = half[2] - round; p.hz = half[2];
  const R = p.R, ex = [0, 0, 0];
  for (let i = 0; i < 3; i++) ex[i] = Math.abs(R[i]) * half[0] + Math.abs(R[3 + i]) * half[1] + Math.abs(R[6 + i]) * half[2];
  const pad = p.k + (o.pad ?? 0);
  p.bb = [c[0] - ex[0] - pad, c[1] - ex[1] - pad, c[2] - ex[2] - pad, c[0] + ex[0] + pad, c[1] + ex[1] + pad, c[2] + ex[2] + pad];
  return p;
}

function evalList(L, x, y, z) {
  let d = 1e9;
  for (let i = 0; i < L.length; i++) {
    const p = L[i], di = p.dist(x, y, z);
    d = p.sub ? smax(d, -di, p.k) : smin(d, di, p.k);
  }
  return d;
}

// One painted vertex handed to the creature's paint(v) callback.
class PaintVert {
  constructor(tagIds) { this.p = [0, 0, 0]; this.n = [0, 0, 0]; this.c = [0, 0, 0]; this.dtl = [0, 0, 0, 0]; this.tw = new Float32Array(tagIds.size); this.tagIds = tagIds; this.emis = 0; this.ao = 1; this.group = 0; this.aoMul = 1; this.fx = 0; }
  t(tag) { const i = this.tagIds.get(tag); return i === undefined ? 0 : this.tw[i]; }
  mix(hex, a) { if (a <= 0) return; const c = col(hex); a = Math.min(1, a); for (let i = 0; i < 3; i++) this.c[i] += (c[i] - this.c[i]) * a; }
  mul(f) { this.c[0] *= f; this.c[1] *= f; this.c[2] *= f; }
}

export class Sculpt {
  constructor(rig) { this.rig = rig; this.prims = []; }
  _b(b) { return typeof b === 'number' ? b : this.rig.index(b); }
  _o(o) { o = { ...o }; if (typeof o.b2 === 'string') o.b2 = this.rig.index(o.b2); return o; }
  ell(bone, c, r, o = {}) { const p = mkEll(this._b(bone), c, r, this._o(o)); this.prims.push(p); return p; }
  sph(bone, c, r, o = {}) { return this.ell(bone, c, [r, r, r], o); }
  cone(bone, a, b, ra, rb, o = {}) { const p = mkCone(this._b(bone), a, b, ra, rb, this._o(o)); this.prims.push(p); return p; }
  box(bone, c, half, round, o = {}) { const p = mkBox(this._b(bone), c, half, round, this._o(o)); this.prims.push(p); return p; }
  // ellipsoid spanning a→b (z radius = half length * zs), cross radii rx, ry
  seg(bone, a, b, rx, ry, o = {}) {
    const d = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], L = Math.hypot(d[0], d[1], d[2]);
    return this.ell(bone, [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2], [rx, ry ?? rx, L / 2 * (o.zs ?? 1)], { ...o, dir: d });
  }

  // full SDF (all groups, additive + subtractive in order) — used for AO / tuft placement
  sdf(x, y, z, group = null) {
    let d = 1e9;
    for (const p of this.prims) {
      if (group !== null && p.group !== group) continue;
      const di = p.dist(x, y, z);
      d = p.sub ? smax(d, -di, p.k) : smin(d, di, p.k);
    }
    return d;
  }
  // union of groups' SDFs (for AO: each group is its own closed surface)
  sdfAll(x, y, z) {
    const A = this._ao;
    const ix = Math.floor((x - A.x0) / A.cs), iy = Math.floor((y - A.y0) / A.cs), iz = Math.floor((z - A.z0) / A.cs);
    if (ix < 0 || iy < 0 || iz < 0 || ix >= A.nx || iy >= A.ny || iz >= A.nz) return 1e9;
    const cell = A.cells[ix + A.nx * (iy + A.ny * iz)];
    if (!cell) return 1e9;
    let best = 1e9;
    for (const L of cell) { if (!L.length) continue; const d = evalList(L, x, y, z); if (d < best) best = d; }
    return best;
  }
  _buildAO(pad) {
    const P = this.prims.filter(p => p.ao);
    let x0 = 1e9, y0 = 1e9, z0 = 1e9, x1 = -1e9, y1 = -1e9, z1 = -1e9;
    for (const p of P) { x0 = Math.min(x0, p.bb[0]); y0 = Math.min(y0, p.bb[1]); z0 = Math.min(z0, p.bb[2]); x1 = Math.max(x1, p.bb[3]); y1 = Math.max(y1, p.bb[4]); z1 = Math.max(z1, p.bb[5]); }
    const cs = 0.09;
    x0 -= pad; y0 -= pad; z0 -= pad; x1 += pad; y1 += pad; z1 += pad;
    const nx = Math.ceil((x1 - x0) / cs), ny = Math.ceil((y1 - y0) / cs), nz = Math.ceil((z1 - z0) / cs);
    const cells = new Array(nx * ny * nz);
    const gi = new Map(); this._groups.forEach((g, i) => gi.set(g.g, i));
    for (const p of P) {
      const b = p.bb, g = gi.get(p.group);
      const ax = Math.max(0, Math.floor((b[0] - pad - x0) / cs)), bx = Math.min(nx - 1, Math.floor((b[3] + pad - x0) / cs));
      const ay = Math.max(0, Math.floor((b[1] - pad - y0) / cs)), by = Math.min(ny - 1, Math.floor((b[4] + pad - y0) / cs));
      const az = Math.max(0, Math.floor((b[2] - pad - z0) / cs)), bz = Math.min(nz - 1, Math.floor((b[5] + pad - z0) / cs));
      for (let z = az; z <= bz; z++) for (let y = ay; y <= by; y++) for (let x = ax; x <= bx; x++) {
        const c = x + nx * (y + ny * z);
        let cell = cells[c]; if (!cell) { cell = cells[c] = this._groups.map(() => []); }
        cell[g].push(p);
      }
    }
    this._ao = { x0, y0, z0, nx, ny, nz, cs, cells };
  }
  normal(x, y, z, out, group = null, e = 0.004) {
    const f = (a, b, c) => this.sdf(a, b, c, group);
    const a = f(x + e, y - e, z - e), b = f(x - e, y - e, z + e), c = f(x - e, y + e, z - e), d = f(x + e, y + e, z + e);
    out[0] = a - b - c + d; out[1] = -a - b + c + d; out[2] = -a + b - c + d;
    const l = Math.hypot(out[0], out[1], out[2]) || 1; out[0] /= l; out[1] /= l; out[2] /= l;
    return out;
  }
  // project point onto a group's surface (for placing tufts / parts)
  project(p, group = 0, iters = 4) {
    const n = [0, 0, 0];
    for (let i = 0; i < iters; i++) {
      const d = this.sdf(p[0], p[1], p[2], group);
      this.normal(p[0], p[1], p[2], n, group);
      p[0] -= n[0] * d; p[1] -= n[1] * d; p[2] -= n[2] * d;
    }
    return { p, n };
  }

  // Influence of each primitive at a point → blended colour, skin weights, tags
  _influence(L, x, y, z, nb, Wb, cOut, dOut, tw, tagIds, rec = null) {
    let cs = 0, ws = 0; cOut[0] = cOut[1] = cOut[2] = 0; dOut[0] = dOut[1] = dOut[2] = dOut[3] = 0; tw.fill(0);
    let emis = 0, dsum = 0;
    if (rec) rec.n = 0;
    for (let i = 0; i < L.length; i++) {
      const p = L[i];
      let d = p.dist(x, y, z);
      if (p.sub) d = -d;
      const dd = d > 0 ? d : (p.sub ? -d : 0);
      const wc = Math.exp(-dd / p.soft) * (p.sub ? 3 : 1) * p.cw;
      if (wc > 1e-4) {
        let f = 0;
        if (p.tip) {
          const t = p.axisT(x, y, z); f = t <= p.tip.from ? 0 : t >= p.tip.to ? 1 : (t - p.tip.from) / (p.tip.to - p.tip.from);
          const c0 = p.color, c1 = p.tip.c;
          cOut[0] += (c0[0] + (c1[0] - c0[0]) * f) * wc; cOut[1] += (c0[1] + (c1[1] - c0[1]) * f) * wc; cOut[2] += (c0[2] + (c1[2] - c0[2]) * f) * wc;
        } else { cOut[0] += p.color[0] * wc; cOut[1] += p.color[1] * wc; cOut[2] += p.color[2] * wc; }
        cs += wc;
        if (rec && rec.n < rec.pi.length) { rec.pi[rec.n] = p.idx; rec.w[rec.n] = wc; rec.tf[rec.n] = f; rec.n++; }
        if (p.dtl) { dOut[0] += p.dtl[0] * wc; dOut[1] += p.dtl[1] * wc; dOut[2] += p.dtl[2] * wc; dOut[3] += p.dtl[3] * wc; dsum += wc; }
        emis += p.emis * wc;
        if (p.tag !== null) tw[tagIds.get(p.tag)] += wc;
      }
      const w = Math.exp(-dd / p.wsoft) * p.wmul;
      if (w > 1e-5 && Wb) {
        if (p.b2 >= 0) {
          const t = p.axisT(x, y, z), s = t <= p.t0 ? 0 : t >= p.t1 ? 1 : ((t - p.t0) / (p.t1 - p.t0)) ** 2 * (3 - 2 * (t - p.t0) / (p.t1 - p.t0));
          Wb[p.bone] += w * (1 - s); Wb[p.b2] += w * s;
        } else Wb[p.bone] += w;
        ws += w;
      }
    }
    if (cs > 0) { cOut[0] /= cs; cOut[1] /= cs; cOut[2] /= cs; for (let i = 0; i < tw.length; i++) tw[i] /= cs; emis /= cs; }
    if (dsum > 0) { dOut[0] /= dsum; dOut[1] /= dsum; dOut[2] /= dsum; dOut[3] /= dsum; dOut.has = dsum / Math.max(cs, 1e-9); } else dOut.has = 0;
    return emis;
  }

  /**
   * Mesh all groups into acc (GeoAcc).
   * cfg: h (voxel size), hg {group: h}, paint(v), ao {dist, str}, grad {top, bottom, y0, y1}, dtl (default detail [fur, scale, mottle, weave]),
   *      smoothW (weight smoothing iterations)
   */
  mesh(acc, cfg) {
    const t0 = performance.now();
    const nb = this.rig.bones.length;
    const tags = new Map(); for (const p of this.prims) if (p.tag !== null && !tags.has(p.tag)) tags.set(p.tag, tags.size);
    const groups = [...new Set(this.prims.map(p => p.group))].sort((a, b) => a - b);
    this._groups = groups.map(g => ({ g, aoList: this.prims.filter(p => p.group === g && p.ao) }));
    this._buildAO((cfg.ao?.dist ?? 0.05) * 3 + 0.03);
    this.prims.forEach((p, i) => { p.idx = i; });
    const stats = { verts: 0, evals: 0 };
    this.shape = { groups: [], tagIds: tags, primCount: this.prims.length };
    for (const g of groups) this._meshGroup(g, cfg.hg?.[g] ?? cfg.h, acc, cfg, nb, tags, stats);
    const tp = performance.now();
    for (const G of this.shape.groups) this._paintEmit(G, acc, cfg, tags);
    if (stats.t) stats.t.paint = performance.now() - tp;
    stats.ms = performance.now() - t0;
    return stats;
  }

  _meshGroup(g, h, acc, cfg, nb, tagIds, stats) {
    const T = stats.t || (stats.t = {}); let tt = performance.now();
    const lap = (k) => { const n = performance.now(); T[k] = (T[k] || 0) + n - tt; tt = n; };
    const P = this.prims.filter(p => p.group === g);
    let x0 = 1e9, y0 = 1e9, z0 = 1e9, x1 = -1e9, y1 = -1e9, z1 = -1e9;
    for (const p of P) if (!p.sub) {
      x0 = Math.min(x0, p.bb[0]); y0 = Math.min(y0, p.bb[1]); z0 = Math.min(z0, p.bb[2]);
      x1 = Math.max(x1, p.bb[3]); y1 = Math.max(y1, p.bb[4]); z1 = Math.max(z1, p.bb[5]);
    }
    x0 -= 2 * h; y0 -= 2 * h; z0 -= 2 * h; x1 += 2 * h; y1 += 2 * h; z1 += 2 * h;
    const nx = Math.ceil((x1 - x0) / h) + 1, ny = Math.ceil((y1 - y0) / h) + 1, nz = Math.ceil((z1 - z0) / h) + 1;
    const B = 4;
    const nbx = Math.max(1, Math.ceil((nx - 1) / B)), nby = Math.max(1, Math.ceil((ny - 1) / B)), nbz = Math.max(1, Math.ceil((nz - 1) / B));
    const lists = new Array(nbx * nby * nbz), elists = new Array(nbx * nby * nbz);
    const V = new Float32Array(nx * ny * nz);
    const FAR = 1e3;
    const R = Math.sqrt(3) * B * h * 0.5;
    let kmax = 0; for (const p of P) kmax = Math.max(kmax, p.k);
    for (let bz = 0; bz < nbz; bz++) for (let by = 0; by < nby; by++) for (let bx = 0; bx < nbx; bx++) {
      const bi = bx + nbx * (by + nby * bz);
      const ax = x0 + bx * B * h - h, ay = y0 + by * B * h - h, az = z0 + bz * B * h - h;
      const cx = ax + B * h + 2 * h, cy = ay + B * h + 2 * h, cz = az + B * h + 2 * h;
      const LA = [];
      for (const p of P) { const b = p.bb; if (b[0] <= cx && b[3] >= ax && b[1] <= cy && b[4] >= ay && b[2] <= cz && b[5] >= az) LA.push(p); }
      lists[bi] = LA;
      const sx0 = bx * B, sy0 = by * B, sz0 = bz * B;
      const sx1 = bx === nbx - 1 ? nx - 1 : sx0 + B - 1, sy1 = by === nby - 1 ? ny - 1 : sy0 + B - 1, sz1 = bz === nbz - 1 ? nz - 1 : sz0 + B - 1;
      const qx = x0 + (sx0 + B * 0.5) * h, qy = y0 + (sy0 + B * 0.5) * h, qz = z0 + (sz0 + B * 0.5) * h;
      // dominance culling: drop additive prims that cannot affect the union anywhere in this block
      let L = LA;
      if (LA.length > 2) {
        const ds = LA.map(p => p.dist(qx, qy, qz));
        let ub = 1e9; for (let i = 0; i < LA.length; i++) if (!LA[i].sub && ds[i] + R * 1.5 < ub) ub = ds[i] + R * 1.5;
        L = LA.filter((p, i) => p.sub || ds[i] - R * 1.5 <= ub + p.k);
      }
      elists[bi] = L;
      let fill = 0;
      if (!L.length) fill = FAR;
      else {
        const dc = evalList(L, qx, qy, qz); stats.evals++;
        if (dc > R * 1.3 + kmax * 0.25) fill = FAR; else if (dc < -(R * 1.3 + kmax * 0.25)) fill = -FAR;
      }
      for (let z = sz0; z <= sz1; z++) for (let y = sy0; y <= sy1; y++) {
        let k = sx0 + nx * (y + ny * z);
        if (fill !== 0) { for (let x = sx0; x <= sx1; x++) V[k++] = fill; continue; }
        const py = y0 + y * h, pz = z0 + z * h;
        for (let x = sx0; x <= sx1; x++) { V[k++] = evalList(L, x0 + x * h, py, pz); }
        stats.evals += sx1 - sx0 + 1;
      }
    }
    lap('grid');
    // ---- surface nets ----
    const ncx = nx - 1, ncy = ny - 1, ncz = nz - 1;
    const cellV = new Int32Array(ncx * ncy * ncz).fill(-1);
    const vx = [], vcell = [];
    const cv = new Float32Array(8);
    const EDGES = [[0, 1], [2, 3], [4, 5], [6, 7], [0, 2], [1, 3], [4, 6], [5, 7], [0, 4], [1, 5], [2, 6], [3, 7]];
    for (let z = 0; z < ncz; z++) for (let y = 0; y < ncy; y++) for (let x = 0; x < ncx; x++) {
      let mask = 0;
      for (let i = 0; i < 8; i++) {
        const v = V[(x + (i & 1)) + nx * ((y + ((i >> 1) & 1)) + ny * (z + ((i >> 2) & 1)))];
        cv[i] = v; if (v < 0) mask |= 1 << i;
      }
      if (mask === 0 || mask === 255) continue;
      let sx = 0, sy = 0, sz = 0, cnt = 0;
      for (const [a, b] of EDGES) {
        const va = cv[a], vb = cv[b];
        if ((va < 0) === (vb < 0)) continue;
        let t = va / (va - vb); if (!(t >= 0 && t <= 1)) t = 0.5;
        sx += (a & 1) + (((b & 1) - (a & 1)) * t);
        sy += ((a >> 1) & 1) + ((((b >> 1) & 1) - ((a >> 1) & 1)) * t);
        sz += ((a >> 2) & 1) + ((((b >> 2) & 1) - ((a >> 2) & 1)) * t);
        cnt++;
      }
      const ci = x + ncx * (y + ncy * z);
      cellV[ci] = vx.length / 3;
      vx.push(x0 + (x + sx / cnt) * h, y0 + (y + sy / cnt) * h, z0 + (z + sz / cnt) * h);
      vcell.push(Math.min(Math.floor(x / B), nbx - 1) + nbx * (Math.min(Math.floor(y / B), nby - 1) + nby * Math.min(Math.floor(z / B), nbz - 1)));
    }
    const nv = vx.length / 3;
    // quads
    const quads = [];
    for (let z = 0; z < ncz; z++) for (let y = 0; y < ncy; y++) for (let x = 0; x < ncx; x++) {
      const ci = x + ncx * (y + ncy * z);
      if (cellV[ci] < 0) continue;
      const v0 = V[x + nx * (y + ny * z)];
      for (let ax = 0; ax < 3; ax++) {
        // edge from sample (x,y,z) along axis ax
        const ex = x + (ax === 0), ey = y + (ax === 1), ez = z + (ax === 2);
        if (ex >= nx || ey >= ny || ez >= nz) continue;
        const v1 = V[ex + nx * (ey + ny * ez)];
        if ((v0 < 0) === (v1 < 0)) continue;
        // the 4 cells sharing this edge
        let c1, c2, c3;
        if (ax === 0) { if (y === 0 || z === 0) continue; c1 = ci - ncx; c2 = ci - ncx - ncx * ncy; c3 = ci - ncx * ncy; }
        else if (ax === 1) { if (x === 0 || z === 0) continue; c1 = ci - 1; c2 = ci - 1 - ncx * ncy; c3 = ci - ncx * ncy; }
        else { if (x === 0 || y === 0) continue; c1 = ci - 1; c2 = ci - 1 - ncx; c3 = ci - ncx; }
        const a = cellV[ci], b = cellV[c1], c = cellV[c2], d = cellV[c3];
        if (a < 0 || b < 0 || c < 0 || d < 0) continue;
        quads.push(a, b, c, d, ax, v0 < 0 ? 1 : -1);
      }
    }
    lap('nets');
    // ---- refine: project onto surface, normals ----
    const nrm = new Float32Array(nv * 3);
    const e = h * 0.3;
    for (let i = 0; i < nv; i++) {
      const L = elists[vcell[i]];
      let px = vx[i * 3], py = vx[i * 3 + 1], pz = vx[i * 3 + 2];
      let gx = 0, gy = 0, gz = 0;
      for (let it = 0; it < 2; it++) {
        const a = evalList(L, px + e, py - e, pz - e), b = evalList(L, px - e, py - e, pz + e);
        const c = evalList(L, px - e, py + e, pz - e), d = evalList(L, px + e, py + e, pz + e);
        gx = a - b - c + d; gy = -a - b + c + d; gz = -a + b - c + d;
        const gl = Math.hypot(gx, gy, gz) || 1e-9;
        gx /= gl; gy /= gl; gz /= gl;
        if (it === 1) break;
        const f = (a + b + c + d) * 0.25;
        let step = f; if (step > h) step = h; else if (step < -h) step = -h;
        px -= gx * step; py -= gy * step; pz -= gz * step;
      }
      vx[i * 3] = px; vx[i * 3 + 1] = py; vx[i * 3 + 2] = pz;
      nrm[i * 3] = gx; nrm[i * 3 + 1] = gy; nrm[i * 3 + 2] = gz;
    }
    stats.evals += nv * 8;
    lap('project');
    // ---- neighbours (for weight smoothing) ----
    const nbrStart = new Int32Array(nv + 1), deg = new Int32Array(nv);
    for (let q = 0; q < quads.length; q += 6) for (let j = 0; j < 4; j++) deg[quads[q + j]] += 2;
    for (let i = 0; i < nv; i++) nbrStart[i + 1] = nbrStart[i] + deg[i];
    const nbr = new Int32Array(nbrStart[nv]), fillp = nbrStart.slice(0, nv);
    for (let q = 0; q < quads.length; q += 6) for (let j = 0; j < 4; j++) {
      const a = quads[q + j];
      nbr[fillp[a]++] = quads[q + ((j + 1) & 3)]; nbr[fillp[a]++] = quads[q + ((j + 3) & 3)];
    }
    // ---- influences: skin, tags, detail, AO, colour contributions (palette-independent "shape" data) ----
    const K = 8, nT = tagIds.size;
    const W = new Float32Array(nv * nb);
    const G = { g, nv, vx: Float32Array.from(vx), nrm, si: new Uint16Array(nv * 4), sw: new Float32Array(nv * 4), pi: new Int16Array(nv * K).fill(-1), pw: new Float32Array(nv * K), pt: new Float32Array(nv * K), tw: new Float32Array(nv * nT), dtl: new Float32Array(nv * 4), emis: new Float32Array(nv), ao: new Float32Array(nv), tris: null };
    const cTmp = [0, 0, 0], dTmp = [0, 0, 0, 0], Wv = new Float32Array(nb), twTmp = new Float32Array(nT);
    const rec = { n: 0, pi: new Int32Array(64), w: new Float32Array(64), tf: new Float32Array(64) }, ord = new Int32Array(64);
    const aoC = cfg.ao ?? { dist: 0.05, str: 0.7 };
    const defD = cfg.dtl ?? [0.3, 0, 0.25, 0];
    for (let i = 0; i < nv; i++) {
      const L = lists[vcell[i]];
      const x = vx[i * 3], y = vx[i * 3 + 1], z = vx[i * 3 + 2];
      Wv.fill(0);
      const em = this._influence(L, x, y, z, nb, Wv, cTmp, dTmp, twTmp, tagIds, rec);
      W.set(Wv, i * nb);
      // keep the K strongest colour contributions
      const n = rec.n;
      for (let k = 0; k < n; k++) ord[k] = k;
      const byW = Array.prototype.slice.call(ord, 0, n).sort((a2, b2) => rec.w[b2] - rec.w[a2]);
      for (let k = 0; k < Math.min(K, n); k++) { const j = byW[k]; G.pi[i * K + k] = rec.pi[j]; G.pw[i * K + k] = rec.w[j]; G.pt[i * K + k] = rec.tf[j]; }
      G.tw.set(twTmp, i * nT);
      const hd = dTmp.has || 0;
      for (let k = 0; k < 4; k++) G.dtl[i * 4 + k] = dTmp[k] * hd + defD[k] * (1 - hd);
      G.emis[i] = em;
      // AO: occlusion along the normal against all groups
      let occ = 0;
      if (aoC.str > 0) {
        const nx_ = nrm[i * 3], ny_ = nrm[i * 3 + 1], nz_ = nrm[i * 3 + 2];
        let wsum = 0;
        for (let s2 = 1; s2 <= 3; s2++) {
          const dd = aoC.dist * s2;
          const f = this.sdfAll(x + nx_ * dd, y + ny_ * dd, z + nz_ * dd);
          const w = 1 / s2;
          occ += w * Math.max(0, (dd - f) / dd); wsum += w;
        }
        occ /= wsum;
        stats.evals += 3;
      }
      G.ao[i] = 1 - Math.min(1, occ * 1.6);
    }
    lap('influence');
    // ---- smooth skin weights over the mesh ----
    const iters = cfg.smoothW ?? 2;
    let Wa = W, Wt = new Float32Array(W.length);
    for (let it = 0; it < iters; it++) {
      for (let i = 0; i < nv; i++) {
        const s0 = nbrStart[i], en = nbrStart[i + 1], cnt = en - s0;
        const o = i * nb;
        let tot = 0; for (let bb = 0; bb < nb; bb++) tot += Wa[o + bb];
        const inv = tot > 0 ? 1 / tot : 0;
        for (let bb = 0; bb < nb; bb++) Wt[o + bb] = Wa[o + bb] * inv * 0.5;
        if (!cnt) { for (let bb = 0; bb < nb; bb++) Wt[o + bb] *= 2; continue; }
        const f = 0.5 / cnt;
        for (let j = s0; j < en; j++) {
          const on = nbr[j] * nb;
          let tn = 0; for (let bb = 0; bb < nb; bb++) tn += Wa[on + bb];
          const fi = tn > 0 ? f / tn : 0;
          for (let bb = 0; bb < nb; bb++) Wt[o + bb] += Wa[on + bb] * fi;
        }
      }
      const tmp = Wa; Wa = Wt; Wt = tmp;
    }
    const si = [0, 0, 0, 0], sw = [0, 0, 0, 0];
    for (let i = 0; i < nv; i++) { topWeights(Wa, i * nb, nb, si, sw); G.si.set(si, i * 4); G.sw.set(sw, i * 4); }
    lap('smooth');
    // ---- triangles (topological winding, shorter diagonal) ----
    const tris = [];
    for (let q = 0; q < quads.length; q += 6) {
      let a = quads[q], b = quads[q + 1], c = quads[q + 2], d = quads[q + 3];
      const ax = quads[q + 4], inside0 = quads[q + 5] > 0;
      if (inside0 === (ax === 1)) { const t = b; b = d; d = t; }
      const dac = dist2(vx, a, c), dbd = dist2(vx, b, d);
      if (dac <= dbd) tris.push(a, b, c, a, c, d); else tris.push(a, b, d, b, c, d);
    }
    G.tris = Uint32Array.from(tris);
    this.shape.groups.push(G);
    stats.verts += nv;
    lap('emit');
  }

  // Paint + shade + emit one cached group using the current primitives' colours.
  _paintEmit(G, acc, cfg, tagIds) {
    const pv = new PaintVert(tagIds), K = 8, nT = tagIds.size, prims = this.prims;
    const aoC = cfg.ao ?? { dist: 0.05, str: 0.7 };
    const base = acc.count, si = [0, 0, 0, 0], sw = [0, 0, 0, 0];
    const { vx, nrm } = G;
    for (let i = 0; i < G.nv; i++) {
      let cr = 0, cg = 0, cb = 0, cs = 0;
      for (let k = 0; k < K; k++) {
        const pi = G.pi[i * K + k]; if (pi < 0) break;
        const p = prims[pi], w = G.pw[i * K + k], f = G.pt[i * K + k];
        let c0 = p.color;
        if (p.tip && f > 0) { const c1 = p.tip.c; cr += (c0[0] + (c1[0] - c0[0]) * f) * w; cg += (c0[1] + (c1[1] - c0[1]) * f) * w; cb += (c0[2] + (c1[2] - c0[2]) * f) * w; }
        else { cr += c0[0] * w; cg += c0[1] * w; cb += c0[2] * w; }
        cs += w;
      }
      if (cs > 0) { cr /= cs; cg /= cs; cb /= cs; }
      const x = vx[i * 3], y = vx[i * 3 + 1], z = vx[i * 3 + 2];
      pv.p[0] = x; pv.p[1] = y; pv.p[2] = z;
      pv.n[0] = nrm[i * 3]; pv.n[1] = nrm[i * 3 + 1]; pv.n[2] = nrm[i * 3 + 2];
      pv.c[0] = cr; pv.c[1] = cg; pv.c[2] = cb;
      for (let t = 0; t < nT; t++) pv.tw[t] = G.tw[i * nT + t];
      for (let k = 0; k < 4; k++) pv.dtl[k] = G.dtl[i * 4 + k];
      pv.emis = G.emis[i]; pv.ao = G.ao[i]; pv.group = G.g; pv.aoMul = 1; pv.fx = 0;
      if (cfg.paint) cfg.paint(pv);
      const ao = 1 - (1 - pv.ao) * aoC.str * pv.aoMul;
      let sh = ao;
      if (cfg.grad) {
        const Gr = cfg.grad, up = pv.n[1];
        sh *= 1 + (Gr.top ?? 0.12) * Math.max(0, up) - (Gr.bottom ?? 0.22) * Math.max(0, -up);
        if (Gr.y1 !== undefined) sh *= 1 - (Gr.low ?? 0.25) * (1 - Math.min(1, Math.max(0, (y - Gr.y0) / (Gr.y1 - Gr.y0))));
      }
      for (let k = 0; k < 4; k++) { si[k] = G.si[i * 4 + k]; sw[k] = G.sw[i * 4 + k]; }
      acc.vert(x, y, z, pv.n[0], pv.n[1], pv.n[2], pv.c[0] * sh, pv.c[1] * sh, pv.c[2] * sh, si, sw, pv.dtl[0], pv.dtl[1], pv.dtl[2], pv.dtl[3], pv.emis, pv.fx);
    }
    const T = G.tris; for (let t = 0; t < T.length; t += 3) acc.tri(base + T[t], base + T[t + 1], base + T[t + 2]);
  }

  /** Re-emit a cached shape (same primitive layout, different palette): only paints. */
  recolor(shape, acc, cfg) {
    const t0 = performance.now();
    if (shape.primCount !== this.prims.length) throw new Error('shape mismatch');
    this.prims.forEach((p, i) => { p.idx = i; });
    for (const G of shape.groups) this._paintEmit(G, acc, cfg, shape.tagIds);
    return { verts: shape.groups.reduce((s, G) => s + G.nv, 0), evals: 0, ms: performance.now() - t0, recolor: true };
  }

  // Sample colour/skin at an arbitrary surface point (for rigid parts glued onto the body)
  sampleAt(x, y, z, n = [0, 1, 0], paint = null) {
    const nb = this.rig.bones.length;
    const tags = new Map(); for (const p of this.prims) if (p.tag !== null && !tags.has(p.tag)) tags.set(p.tag, tags.size);
    const pv = new PaintVert(tags), Wv = new Float32Array(nb), c = [0, 0, 0], d = [0, 0, 0, 0];
    const em = this._influence(this.prims, x, y, z, nb, Wv, c, d, pv.tw, tags);
    pv.p = [x, y, z]; pv.n = n.slice(); pv.c = c; pv.dtl = d.slice(); pv.emis = em; pv.ao = 1;
    if (paint) paint(pv);
    const si = [0, 0, 0, 0], sw = [0, 0, 0, 0];
    topWeights(Wv, 0, nb, si, sw);
    return { c: pv.c, si, sw, dtl: pv.dtl };
  }
}

function dist2(v, a, b) { const x = v[a * 3] - v[b * 3], y = v[a * 3 + 1] - v[b * 3 + 1], z = v[a * 3 + 2] - v[b * 3 + 2]; return x * x + y * y + z * z; }

export function topWeights(W, o, nb, si, sw) {
  si[0] = si[1] = si[2] = si[3] = 0; sw[0] = sw[1] = sw[2] = sw[3] = 0;
  for (let b = 0; b < nb; b++) {
    const w = W[o + b];
    if (w <= sw[3]) continue;
    let j = 3; while (j > 0 && w > sw[j - 1]) { sw[j] = sw[j - 1]; si[j] = si[j - 1]; j--; }
    sw[j] = w; si[j] = b;
  }
  // drop tiny influences, renormalise
  const tot0 = sw[0] + sw[1] + sw[2] + sw[3];
  for (let j = 1; j < 4; j++) if (sw[j] < tot0 * 0.03) sw[j] = 0;
  const tot = sw[0] + sw[1] + sw[2] + sw[3];
  if (tot > 0) for (let j = 0; j < 4; j++) sw[j] /= tot; else sw[0] = 1;
}
