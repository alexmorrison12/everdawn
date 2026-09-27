// Signed-distance modelling kit for the dragon: ellipsoids, elliptic round-cones and rounded boxes combined with
// polynomial smooth-union / smooth-subtraction. Every primitive carries bone bindings so skin weights can be derived
// from "which primitive owns this bit of surface" (primitive → bone blend factors).
import * as THREE from 'three';

export const ELL = 0, CONE = 1, BOX = 2, TBOX = 3;

const _v = new THREE.Vector3(), _x = new THREE.Vector3(), _y = new THREE.Vector3(), _z = new THREE.Vector3();
const _q = new THREE.Quaternion(), _e = new THREE.Euler();

export class Prim {
  constructor(type) {
    this.type = type;
    this.ox = 0; this.oy = 0; this.oz = 0;                         // origin (ellipsoid/box centre, cone start)
    this.xx = 1; this.xy = 0; this.xz = 0;                         // local X axis (world)
    this.yx = 0; this.yy = 1; this.yz = 0;                         // local Y axis
    this.zx = 0; this.zy = 0; this.zz = 1;                         // local Z axis
    this.ia2 = 1; this.ib2 = 1; this.ic2 = 1; this.ia4 = 1; this.ib4 = 1; this.ic4 = 1; this.rmin = 1;
    this.isw = 1; this.isq = 1; this.h = 1; this.r1 = 1; this.r2 = 1; this.ca = 1; this.cb = 0; this.lip = 1;
    this.hx = 1; this.hy = 1; this.hz = 1; this.rr = 0;
    this.ax = 1; this.ay = 1; this.bx = 1; this.by = 1; this.dyf = 0;          // tapered box: back/front half sizes, front y shift
    this.k = 0.1; this.sub = false; this.ws = 0.1;                   // blend radius, subtractive, weight falloff
    this.bones = []; this.bw = [];
    this.minx = 0; this.miny = 0; this.minz = 0; this.maxx = 0; this.maxy = 0; this.maxz = 0;
    this.s = 0; this.limb = 0; this.scl = 1; this.tag = 0;           // painting hints
    this.noW = false;                                              // excluded from skin weights
  }
}

export function primDist(p, x, y, z) {
  const dx = x - p.ox, dy = y - p.oy, dz = z - p.oz;
  let lx = dx * p.xx + dy * p.xy + dz * p.xz;
  let ly = dx * p.yx + dy * p.yy + dz * p.yz;
  const lz = dx * p.zx + dy * p.zy + dz * p.zz;
  if (p.type === CONE) {
    lx *= p.isw; ly *= p.isq;
    const q = Math.sqrt(lx * lx + ly * ly);
    const k = -p.cb * q + p.ca * lz;
    let d;
    if (k < 0) d = Math.sqrt(q * q + lz * lz) - p.r1;
    else if (k > p.ca * p.h) { const t = lz - p.h; d = Math.sqrt(q * q + t * t) - p.r2; }
    else d = q * p.ca + lz * p.cb - p.r1;
    return d * p.lip;
  } else if (p.type === ELL) {
    const a = lx * lx, b = ly * ly, c = lz * lz;
    const k0 = Math.sqrt(a * p.ia2 + b * p.ib2 + c * p.ic2);
    const k1 = Math.sqrt(a * p.ia4 + b * p.ib4 + c * p.ic4);
    if (k1 < 1e-9) return -p.rmin;
    return k0 * (k0 - 1) / k1;
  } else if (p.type === TBOX) {
    // tapered rounded box along local z: half sizes (ax,ay) at z=-hz → (bx,by) at z=+hz, centre y shifted by dyf at the front
    let t = (lz + p.hz) / (2 * p.hz); t = t < 0 ? 0 : t > 1 ? 1 : t;
    const wx = p.ax + (p.bx - p.ax) * t, wy = p.ay + (p.by - p.ay) * t, r = p.rr;
    const qx = Math.abs(lx) - wx + r, qy = Math.abs(ly - p.dyf * t) - wy + r, qz = Math.abs(lz) - p.hz + r;
    const mx = qx > 0 ? qx : 0, my = qy > 0 ? qy : 0, mz = qz > 0 ? qz : 0;
    return (Math.sqrt(mx * mx + my * my + mz * mz) + Math.min(Math.max(qx, qy, qz), 0) - r) * p.lip;
  } else {
    const qx = Math.abs(lx) - p.hx, qy = Math.abs(ly) - p.hy, qz = Math.abs(lz) - p.hz;
    const mx = qx > 0 ? qx : 0, my = qy > 0 ? qy : 0, mz = qz > 0 ? qz : 0;
    const inner = Math.max(qx, qy, qz);
    return Math.sqrt(mx * mx + my * my + mz * mz) + (inner < 0 ? inner : 0) - p.rr;
  }
}

export function smin(a, b, k) {
  if (k <= 0) return a < b ? a : b;
  const h = k - Math.abs(a - b);
  if (h <= 0) return a < b ? a : b;
  const hh = h / k;
  return (a < b ? a : b) - hh * hh * k * 0.25;
}
export function smax(a, b, k) { return -smin(-a, -b, k); }

const EMPTY = [];

export class SDF {
  constructor() { this.prims = []; this.blocks = null; }

  _finish(p, o) {
    p.k = o.k ?? 0.1;
    p.sub = !!o.sub;
    p.ws = o.ws ?? Math.max(0.02, p.k * 0.45);
    p.noW = !!o.noW;
    const b = o.bones ?? o.bone ?? 0;
    if (typeof b === 'number') { p.bones = [b]; p.bw = [1]; }
    else { p.bones = b.map(e => e[0]); p.bw = b.map(e => e[1]); }
    p.s = o.s ?? 0; p.limb = o.limb ?? 0; p.scl = o.scl ?? 1; p.tag = o.tag ?? 0;
    this.prims.push(p);
    return p;
  }
  _axesFromQuat(p, q) {
    _x.set(1, 0, 0).applyQuaternion(q); _y.set(0, 1, 0).applyQuaternion(q); _z.set(0, 0, 1).applyQuaternion(q);
    p.xx = _x.x; p.xy = _x.y; p.xz = _x.z; p.yx = _y.x; p.yy = _y.y; p.yz = _y.z; p.zx = _z.x; p.zy = _z.y; p.zz = _z.z;
  }
  static quat(rot) {
    if (!rot) return _q.identity();
    if (rot.isQuaternion) return _q.copy(rot);
    return _q.setFromEuler(_e.set(rot[0] || 0, rot[1] || 0, rot[2] || 0, rot[3] || 'YXZ'));
  }

  /** Ellipsoid centred at c with radii r=[a,b,c] (local x,y,z), optional rot (Euler array or Quaternion). */
  ellipsoid(c, r, o = {}) {
    const p = new Prim(ELL);
    p.ox = c[0]; p.oy = c[1]; p.oz = c[2];
    this._axesFromQuat(p, SDF.quat(o.rot));
    const [a, b, cc] = r;
    p.ia2 = 1 / (a * a); p.ib2 = 1 / (b * b); p.ic2 = 1 / (cc * cc);
    p.ia4 = p.ia2 * p.ia2; p.ib4 = p.ib2 * p.ib2; p.ic4 = p.ic2 * p.ic2;
    p.rmin = Math.min(a, b, cc);
    const R = Math.max(a, b, cc);
    p.minx = c[0] - R; p.miny = c[1] - R; p.minz = c[2] - R; p.maxx = c[0] + R; p.maxy = c[1] + R; p.maxz = c[2] + R;
    return this._finish(p, o);
  }

  /** Round cone from a (radius r1) to b (radius r2); cross-section scaled by sw (side) / sq (along `up`). */
  cone(a, b, r1, r2, o = {}) {
    const p = new Prim(CONE);
    p.ox = a[0]; p.oy = a[1]; p.oz = a[2];
    _z.set(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
    let h = _z.length();
    if (h < 1e-5) { _z.set(0, 0, 1); h = 1e-5; } else _z.multiplyScalar(1 / h);
    const up = o.up ? _v.set(o.up[0], o.up[1], o.up[2]) : _v.set(0, 1, 0);
    if (Math.abs(up.dot(_z)) > 0.98) { if (Math.abs(_z.z) < 0.9) up.set(0, 0, -1); else up.set(0, 1, 0); }
    _y.copy(up).addScaledVector(_z, -up.dot(_z)).normalize();
    _x.crossVectors(_y, _z);
    p.xx = _x.x; p.xy = _x.y; p.xz = _x.z; p.yx = _y.x; p.yy = _y.y; p.yz = _y.z; p.zx = _z.x; p.zy = _z.y; p.zz = _z.z;
    const sw = o.sw ?? 1, sq = o.sq ?? 1;
    p.isw = 1 / sw; p.isq = 1 / sq; p.lip = Math.min(sw, sq, 1);
    p.h = h; p.r1 = r1; p.r2 = r2;
    let cb = (r1 - r2) / h; if (cb > 0.98) cb = 0.98; if (cb < -0.98) cb = -0.98;
    p.cb = cb; p.ca = Math.sqrt(1 - cb * cb);
    const m = Math.max(sw, sq, 1);
    const R1 = r1 * m, R2 = r2 * m;
    p.minx = Math.min(a[0] - R1, b[0] - R2); p.maxx = Math.max(a[0] + R1, b[0] + R2);
    p.miny = Math.min(a[1] - R1, b[1] - R2); p.maxy = Math.max(a[1] + R1, b[1] + R2);
    p.minz = Math.min(a[2] - R1, b[2] - R2); p.maxz = Math.max(a[2] + R1, b[2] + R2);
    return this._finish(p, o);
  }

  /** Rounded box, half extents h=[x,y,z], rounding r. */
  box(c, h, r, o = {}) {
    const p = new Prim(BOX);
    p.ox = c[0]; p.oy = c[1]; p.oz = c[2];
    this._axesFromQuat(p, SDF.quat(o.rot));
    p.hx = h[0]; p.hy = h[1]; p.hz = h[2]; p.rr = r;
    const R = Math.hypot(h[0], h[1], h[2]) + r;
    p.minx = c[0] - R; p.miny = c[1] - R; p.minz = c[2] - R; p.maxx = c[0] + R; p.maxy = c[1] + R; p.maxz = c[2] + R;
    return this._finish(p, o);
  }

  /**
   * Tapered rounded box: centre c, local frame from rot, half length hz along local z (+z = front end),
   * back half-size [ax, ay], front half-size [bx, by], front centre y offset dyf, rounding r.
   */
  tbox(c, rot, hz, back, front, dyf, r, o = {}) {
    const p = new Prim(TBOX);
    p.ox = c[0]; p.oy = c[1]; p.oz = c[2];
    this._axesFromQuat(p, SDF.quat(rot));
    p.hz = hz; p.ax = back[0]; p.ay = back[1]; p.bx = front[0]; p.by = front[1]; p.dyf = dyf; p.rr = r;
    const sl = Math.max(Math.abs(back[0] - front[0]), Math.abs(back[1] - front[1]) + Math.abs(dyf)) / (2 * hz);
    p.lip = 1 / Math.sqrt(1 + sl * sl);
    const R = Math.hypot(Math.max(back[0], front[0]), Math.max(back[1], front[1]) + Math.abs(dyf), hz);
    p.minx = c[0] - R; p.miny = c[1] - R; p.minz = c[2] - R; p.maxx = c[0] + R; p.maxy = c[1] + R; p.maxz = c[2] + R;
    return this._finish(p, o);
  }

  bounds(pad = 0) {
    const mn = [1e9, 1e9, 1e9], mx = [-1e9, -1e9, -1e9];
    for (const p of this.prims) {
      if (p.sub) continue;
      mn[0] = Math.min(mn[0], p.minx); mn[1] = Math.min(mn[1], p.miny); mn[2] = Math.min(mn[2], p.minz);
      mx[0] = Math.max(mx[0], p.maxx); mx[1] = Math.max(mx[1], p.maxy); mx[2] = Math.max(mx[2], p.maxz);
    }
    return { min: mn.map(v => v - pad), max: mx.map(v => v + pad) };
  }

  /** Build block lists: every block keeps the (ordered) primitives whose inflated AABB touches it. */
  prepare(min, blockSize, nb, margin) {
    this.amin = min; this.bs = blockSize; this.nb = nb;
    const [nx, ny, nz] = nb;
    const lists = new Array(nx * ny * nz);
    for (let i = 0; i < lists.length; i++) lists[i] = null;
    const bs = blockSize;
    for (const p of this.prims) {
      const pad = p.k + margin;
      const x0 = Math.max(0, Math.floor((p.minx - pad - min[0]) / bs)), x1 = Math.min(nx - 1, Math.floor((p.maxx + pad - min[0]) / bs));
      const y0 = Math.max(0, Math.floor((p.miny - pad - min[1]) / bs)), y1 = Math.min(ny - 1, Math.floor((p.maxy + pad - min[1]) / bs));
      const z0 = Math.max(0, Math.floor((p.minz - pad - min[2]) / bs)), z1 = Math.min(nz - 1, Math.floor((p.maxz + pad - min[2]) / bs));
      for (let z = z0; z <= z1; z++) for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
        const i = x + nx * (y + ny * z);
        (lists[i] || (lists[i] = [])).push(p);
      }
    }
    for (let i = 0; i < lists.length; i++) if (!lists[i]) lists[i] = EMPTY;
    this.blocks = lists;
  }

  listAt(x, y, z) {
    if (!this.blocks) return this.prims;
    const bx = Math.floor((x - this.amin[0]) / this.bs), by = Math.floor((y - this.amin[1]) / this.bs), bz = Math.floor((z - this.amin[2]) / this.bs);
    const [nx, ny, nz] = this.nb;
    if (bx < 0 || by < 0 || bz < 0 || bx >= nx || by >= ny || bz >= nz) return EMPTY;
    return this.blocks[bx + nx * (by + ny * bz)];
  }

  evalList(L, x, y, z) {
    let d = 1e9;
    for (let i = 0, n = L.length; i < n; i++) {
      const p = L[i];
      const di = primDist(p, x, y, z);
      if (!p.sub) {
        const k = p.k, hh = k - Math.abs(d - di);
        d = hh <= 0 ? (d < di ? d : di) : (d < di ? d : di) - hh * hh * 0.25 / k;
      } else d = smax(d, -di, p.k);
    }
    return d;
  }

  eval(x, y, z) { return this.evalList(this.listAt(x, y, z), x, y, z); }

  /** Tetrahedral gradient (not normalised) into out[0..2]; returns the centre-ish value. */
  grad(x, y, z, e, out) {
    const L = this.listAt(x, y, z);
    const a = this.evalList(L, x + e, y - e, z - e);
    const b = this.evalList(L, x - e, y - e, z + e);
    const c = this.evalList(L, x - e, y + e, z - e);
    const d = this.evalList(L, x + e, y + e, z + e);
    out[0] = a - b - c + d; out[1] = -a - b + c + d; out[2] = -a + b - c + d;
    return (a + b + c + d) * 0.25;
  }

  /**
   * Skin-weight hints at a surface point: accumulates bone weights into acc (Float32Array numBones) and returns
   * painting hints { s, limb, scl, tag } weighted by the same primitive ownership factors.
   */
  weightsAt(x, y, z, acc, hint) {
    const L = this.listAt(x, y, z);
    let dmin = 1e9;
    const n = L.length;
    if (!this._dbuf || this._dbuf.length < n) this._dbuf = new Float32Array(Math.max(64, n * 2));
    const db = this._dbuf;
    for (let i = 0; i < n; i++) {
      const p = L[i];
      if (p.sub || p.noW) { db[i] = 1e9; continue; }
      const d = primDist(p, x, y, z); db[i] = d;
      if (d < dmin) dmin = d;
    }
    let tot = 0, s = 0, limb = 0, scl = 0, tagMax = -1, tagW = 0;
    for (let i = 0; i < n; i++) {
      const d = db[i]; if (d > 1e8) continue;
      const p = L[i];
      const w = Math.exp(-(d - dmin) / p.ws);
      if (w < 1e-3) continue;
      tot += w;
      for (let j = 0; j < p.bones.length; j++) acc[p.bones[j]] += w * p.bw[j];
      s += w * p.s; limb += w * p.limb; scl += w * p.scl;
      if (w > tagW) { tagW = w; tagMax = p.tag; }
    }
    if (hint) {
      const it = tot > 0 ? 1 / tot : 0;
      hint.s = s * it; hint.limb = limb * it; hint.scl = scl * it; hint.tag = tagMax;
    }
    return tot;
  }

  /** March from an interior point c along unit dir d until the surface; returns distance or -1. */
  raycastOut(cx, cy, cz, dx, dy, dz, maxT = 20, minStep = 0.01) {
    let t = 0, f = this.eval(cx, cy, cz);
    if (f > 0) return 0;
    let tPrev = 0;
    for (let i = 0; i < 200 && t < maxT; i++) {
      tPrev = t;
      t += Math.max(Math.abs(f) * 0.9, minStep);
      f = this.eval(cx + dx * t, cy + dy * t, cz + dz * t);
      if (f > 0) {
        let a = tPrev, b = t;
        for (let k = 0; k < 8; k++) {
          const m = (a + b) * 0.5;
          if (this.eval(cx + dx * m, cy + dy * m, cz + dz * m) > 0) b = m; else a = m;
        }
        return (a + b) * 0.5;
      }
    }
    return -1;
  }
}

/** Evaluate several SDFs as a union (used for AO so the head/jaw occlude the neck and vice versa). */
export function unionEval(sdfs, x, y, z) {
  let d = 1e9;
  for (let i = 0; i < sdfs.length; i++) { const v = sdfs[i].eval(x, y, z); if (v < d) d = v; }
  return d;
}
