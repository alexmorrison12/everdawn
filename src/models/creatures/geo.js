// Geometry accumulation for skinned creature meshes (+ rigid part helpers: sweeps, cones, eyes, tufts).
import * as THREE from 'three';
import { col } from './sdf.js';

const _v = new THREE.Vector3(), _n = new THREE.Vector3(), _m3 = new THREE.Matrix3();

export class GeoAcc {
  constructor() { this.P = []; this.N = []; this.C = []; this.SI = []; this.SW = []; this.D = []; this.A = []; this.I = []; }
  get count() { return this.P.length / 3; }
  vert(x, y, z, nx, ny, nz, r, g, b, si, sw, d0, d1, d2, d3, emis, fx) {
    this.P.push(x, y, z); this.N.push(nx, ny, nz); this.C.push(r, g, b);
    this.SI.push(si[0], si[1], si[2], si[3]); this.SW.push(sw[0], sw[1], sw[2], sw[3]);
    this.D.push(d0, d1, d2, d3); this.A.push(emis, fx);
  }
  tri(a, b, c) { this.I.push(a, b, c); }
  /**
   * Append a geometry. o: matrix, color ([r,g,b] | hex | fn(p,n,uv,i)), skin ({si,sw} | fn(p) → {si,sw}),
   * dtl [4], emis (num | fn), fx (num | fn), normalFn(p, n) → modify n
   */
  add(geo, o = {}) {
    const p = geo.attributes.position, na = geo.attributes.normal, uva = geo.attributes.uv;
    const m = o.matrix || null;
    if (m) _m3.getNormalMatrix(m);
    const base = this.count;
    const colr = typeof o.color === 'function' ? null : col(o.color ?? 0xffffff);
    const d = o.dtl ?? [0, 0, 0.2, 0];
    const uv = [0, 0];
    let skin = typeof o.skin === 'function' ? null : o.skin;
    for (let i = 0; i < p.count; i++) {
      _v.fromBufferAttribute(p, i); if (m) _v.applyMatrix4(m);
      if (na) { _n.fromBufferAttribute(na, i); if (m) _n.applyMatrix3(_m3).normalize(); } else _n.set(0, 1, 0);
      if (uva) { uv[0] = uva.getX(i); uv[1] = uva.getY(i); }
      if (o.normalFn) o.normalFn(_v, _n, uv);
      const c = colr || col(o.color(_v, _n, uv, i));
      if (typeof o.skin === 'function') skin = o.skin(_v);
      const em = typeof o.emis === 'function' ? o.emis(_v, uv) : (o.emis ?? 0);
      const fx = typeof o.fx === 'function' ? o.fx(_v, uv) : (o.fx ?? 0);
      this.vert(_v.x, _v.y, _v.z, _n.x, _n.y, _n.z, c[0], c[1], c[2], skin.si, skin.sw, d[0], d[1], d[2], d[3], em, fx);
    }
    if (geo.index) { const ix = geo.index.array; for (let i = 0; i < ix.length; i++) this.I.push(base + ix[i]); }
    else for (let i = 0; i < p.count; i++) this.I.push(base + i);
    return this;
  }
  build() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.P, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.N, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.C, 3));
    g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(this.SI, 4));
    g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(this.SW, 4));
    g.setAttribute('dtl', new THREE.Float32BufferAttribute(this.D, 4));
    g.setAttribute('aux', new THREE.Float32BufferAttribute(this.A, 2));
    g.setIndex(this.count > 65535 ? new THREE.Uint32BufferAttribute(this.I, 1) : new THREE.Uint16BufferAttribute(this.I, 1));
    g.computeBoundingBox(); g.computeBoundingSphere();
    return g;
  }
}

export const rigid = (bone) => ({ si: [bone, 0, 0, 0], sw: [1, 0, 0, 0] });
export const blend2 = (b0, b1, t) => ({ si: [b0, b1, 0, 0], sw: [1 - t, t, 0, 0] });

/**
 * Sweep a (possibly elliptical) cross-section along a polyline.
 * pts: Vector3[] | [x,y,z][]; radii: number[]; o: { radial, capStart, capEnd, flat (y-scale), up (ref vector), twist }
 * uv.x = around, uv.y = along (0..1). Caps get uv.y = 0 / 1.
 */
export function sweep(pts, radii, o = {}) {
  pts = pts.map(p => Array.isArray(p) ? new THREE.Vector3(p[0], p[1], p[2]) : p);
  const radial = o.radial ?? 8, n = pts.length, flat = o.flat ?? 1;
  const pos = [], nrm = [], uv = [], idx = [];
  const T = new THREE.Vector3(), N = new THREE.Vector3(), Bv = new THREE.Vector3();
  const up = o.up ? new THREE.Vector3(...o.up).normalize() : null;
  let prevN = null;
  // arc length
  const acc = [0]; for (let i = 1; i < n; i++) acc.push(acc[i - 1] + pts[i].distanceTo(pts[i - 1]));
  const L = acc[n - 1] || 1;
  for (let i = 0; i < n; i++) {
    const p = pts[i];
    if (i === 0) T.subVectors(pts[1], p); else if (i === n - 1) T.subVectors(p, pts[i - 1]); else T.subVectors(pts[i + 1], pts[i - 1]);
    T.normalize();
    if (!prevN) {
      if (up) N.copy(up); else { N.set(0, 1, 0); if (Math.abs(T.dot(N)) > 0.9) N.set(1, 0, 0); }
      N.addScaledVector(T, -T.dot(N)).normalize();
    } else N.copy(prevN).addScaledVector(T, -T.dot(prevN)).normalize();
    prevN = N.clone();
    Bv.crossVectors(T, N);
    const r = radii[i];
    for (let k = 0; k <= radial; k++) {
      const a = k / radial * Math.PI * 2 + (o.twist ?? 0);
      const cx = Math.cos(a), cy = Math.sin(a);
      // ellipse: N axis scaled by flat
      const ox = Bv.x * cx * r + N.x * cy * r * flat, oy = Bv.y * cx * r + N.y * cy * r * flat, oz = Bv.z * cx * r + N.z * cy * r * flat;
      pos.push(p.x + ox, p.y + oy, p.z + oz);
      let nx = Bv.x * cx * flat + N.x * cy, ny = Bv.y * cx * flat + N.y * cy, nz = Bv.z * cx * flat + N.z * cy;
      // taper tilt
      const dr = (i < n - 1 ? radii[i + 1] - radii[i] : radii[i] - radii[i - 1]) / ((i < n - 1 ? acc[i + 1] - acc[i] : acc[i] - acc[i - 1]) || 1);
      nx -= T.x * dr; ny -= T.y * dr; nz -= T.z * dr;
      const l = Math.hypot(nx, ny, nz) || 1;
      nrm.push(nx / l, ny / l, nz / l); uv.push(k / radial, acc[i] / L);
    }
  }
  for (let i = 0; i < n - 1; i++) for (let k = 0; k < radial; k++) {
    const a = i * (radial + 1) + k, b = a + radial + 1;
    idx.push(a, b, a + 1, a + 1, b, b + 1);
  }
  const cap = (i, dir, v) => {
    const c = pos.length / 3, p = pts[i];
    pos.push(p.x, p.y, p.z); nrm.push(dir.x, dir.y, dir.z); uv.push(0.5, v);
    for (let k = 0; k < radial; k++) {
      const a = i * (radial + 1) + k;
      if (v > 0.5) idx.push(a, c, a + 1); else idx.push(a + 1, c, a);
    }
  };
  if (o.capEnd !== false && radii[n - 1] > 1e-5) cap(n - 1, T.clone().subVectors(pts[n - 1], pts[n - 2]).normalize(), 1);
  if (o.capStart && radii[0] > 1e-5) cap(0, new THREE.Vector3().subVectors(pts[0], pts[1]).normalize(), 0);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  return g;
}

// Quadratic bezier helper → n points
export function bez(a, b, c, n = 6) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1), u = 1 - t;
    out.push(new THREE.Vector3(u * u * a[0] + 2 * u * t * b[0] + t * t * c[0], u * u * a[1] + 2 * u * t * b[1] + t * t * c[1], u * u * a[2] + 2 * u * t * b[2] + t * t * c[2]));
  }
  return out;
}
export const taper = (n, r0, r1, pow = 1) => Array.from({ length: n }, (_, i) => r0 + (r1 - r0) * Math.pow(i / (n - 1), pow));

/**
 * Eye: spherical cap facing +Z with crisp concentric colour rings.
 * rings: [{a: angle(rad) from axis, c: hex}] ascending; returns geometry with uv.x = ring index
 */
export function eyeGeo(r, rings, seg = 12, capAngle = 1.75) {
  const pos = [], nrm = [], uv = [], idx = [];
  const angles = [0];
  for (const rg of rings) { angles.push(rg.a - 0.004, rg.a + 0.004); }
  angles.push(capAngle);
  const ringCol = (a) => { for (let i = 0; i < rings.length; i++) if (a < rings[i].a) return i; return rings.length; };
  // centre vertex
  pos.push(0, 0, r); nrm.push(0, 0, 1); uv.push(0, 0);
  for (let j = 1; j < angles.length; j++) {
    const th = angles[j];
    for (let k = 0; k < seg; k++) {
      const ph = k / seg * Math.PI * 2;
      const x = Math.sin(th) * Math.cos(ph), y = Math.sin(th) * Math.sin(ph), z = Math.cos(th);
      pos.push(x * r, y * r, z * r); nrm.push(x, y, z); uv.push(ringCol(th), th);
    }
  }
  for (let k = 0; k < seg; k++) idx.push(0, 1 + k, 1 + (k + 1) % seg);
  for (let j = 1; j < angles.length - 1; j++) {
    const a0 = 1 + (j - 1) * seg, a1 = 1 + j * seg;
    for (let k = 0; k < seg; k++) {
      const k1 = (k + 1) % seg;
      idx.push(a0 + k, a1 + k, a1 + k1, a0 + k, a1 + k1, a0 + k1);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  return g;
}

// Matrix placing local +Z along dir (with up hint) at pos, optional uniform/non-uniform scale
const _x = new THREE.Vector3();
export function aim(pos, dir, up = [0, 1, 0], scale = 1) {
  const f = new THREE.Vector3(...dir).normalize();
  const u = new THREE.Vector3(...up);
  _x.crossVectors(u, f); if (_x.lengthSq() < 1e-8) _x.set(1, 0, 0); _x.normalize();
  const yv = new THREE.Vector3().crossVectors(f, _x).normalize();
  const m = new THREE.Matrix4().makeBasis(_x, yv, f);
  const s = typeof scale === 'number' ? [scale, scale, scale] : scale;
  m.scale(new THREE.Vector3(...s));
  m.setPosition(pos[0], pos[1], pos[2]);
  return m;
}

export function mirrorX(p) { return [-p[0], p[1], p[2]]; }

/**
 * Leaf / ear / fin plate: base at origin, grows along +Y (height H), width 2W across X, thickness T,
 * concave front (-Z) by `cup`, bends back (+Z) by `bend`. uv.x: 0 = front face, 1 = back face; uv.y = along.
 * o: { nu, nv, pw (width falloff exponent), tipW, bendX (sideways curl) }
 */
export function leafGeo(W, H, T, cup = 0.5, bend = 0.2, o = {}) {
  const nu = o.nu ?? 7, nv = o.nv ?? 6, pw = o.pw ?? 0.85;
  const pos = [], uv = [], idx = [];
  const face = (front) => {
    const base = pos.length / 3;
    for (let j = 0; j < nv; j++) {
      const v = j / (nv - 1);
      const w = W * Math.pow(1 - v, pw) + (o.tipW ?? 0.002);
      const zc = bend * v * v * H, xc = (o.bendX ?? 0) * v * v * H;
      const zr = zc - 0.2 * T * (1 - v);
      for (let i = 0; i < nu; i++) {
        const u = -1 + 2 * i / (nu - 1);
        const x = xc + u * w, y = v * H;
        const z = front ? zr + cup * T * (1 - u * u) * (1 - v) : zr + T * Math.sqrt(Math.max(0, 1 - u * u)) * (1 - 0.6 * v);
        pos.push(x, y, z); uv.push(front ? 0 : 1, v, Math.abs(u));
      }
    }
    for (let j = 0; j < nv - 1; j++) for (let i = 0; i < nu - 1; i++) {
      const a = base + j * nu + i, b = a + 1, c = a + nu, d = c + 1;
      if (front) idx.push(a, c, b, b, c, d); else idx.push(a, b, c, b, d, c);
    }
  };
  face(true); face(false);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  // uv.x = face (0 front / 1 back) + |u| * 0.5 ; uv.y = along
  const uv2 = []; for (let i = 0; i < uv.length; i += 3) uv2.push(uv[i] + uv[i + 2] * 0.5, uv[i + 1]);
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv2, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/** March from p along dir to the SDF zero crossing (bisection). Returns the surface point [x,y,z]. */
export function surfaceAlong(S, p, dir, group = 0, range = 0.12) {
  const l = Math.hypot(dir[0], dir[1], dir[2]); const d = [dir[0] / l, dir[1] / l, dir[2] / l];
  const at = (t) => S.sdf(p[0] + d[0] * t, p[1] + d[1] * t, p[2] + d[2] * t, group);
  let a = -range, b = range;
  if (at(a) > 0) return p.slice(); // already outside at the inner end: give up
  if (at(b) < 0) return [p[0] + d[0] * b, p[1] + d[1] * b, p[2] + d[2] * b];
  for (let i = 0; i < 24; i++) { const m = (a + b) / 2; if (at(m) < 0) a = m; else b = m; }
  const t = (a + b) / 2;
  return [p[0] + d[0] * t, p[1] + d[1] * t, p[2] + d[2] * t];
}

/** Seat an eye on the surface: returns the matrix for eyeGeo (centre pushed in by `sink`·r). */
export function eyeMatrix(S, p, dir, r, sink = 0.45, group = 0, squash = 1) {
  const sp = surfaceAlong(S, p, dir, group);
  const l = Math.hypot(dir[0], dir[1], dir[2]);
  const c = [sp[0] - dir[0] / l * r * sink, sp[1] - dir[1] / l * r * sink, sp[2] - dir[2] / l * r * sink];
  return aim(c, dir, [0, 1, 0], [1, squash, 1]);
}
