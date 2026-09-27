// Geometry construction helpers: a merging MeshBuilder with vertex colours, tubes, blobs, cards.
import * as THREE from 'three';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';

const _v = new THREE.Vector3(), _n = new THREE.Vector3(), _m3 = new THREE.Matrix3();
const _c = new THREE.Color();

export function linColor(hex) { _c.set(hex); return [_c.r, _c.g, _c.b]; }

export class MeshBuilder {
  constructor(extra = []) {
    this.pos = []; this.nrm = []; this.col = []; this.uv = []; this.idx = [];
    this.extra = {}; for (const e of extra) this.extra[e.name] = { size: e.size, data: [] };
  }
  get count() { return this.pos.length / 3; }
  /**
   * Append a geometry. color: [r,g,b] linear | fn(p:Vector3, n:Vector3, i) => [r,g,b]
   * opts.normalFn(p, n) → override normal; opts.extra {name: value|fn}
   */
  add(geo, matrix = null, color = [1, 1, 1], opts = {}) {
    const p = geo.attributes.position, nAttr = geo.attributes.normal, uvA = geo.attributes.uv;
    const base = this.count;
    if (matrix) _m3.getNormalMatrix(matrix);
    for (let i = 0; i < p.count; i++) {
      _v.fromBufferAttribute(p, i); if (matrix) _v.applyMatrix4(matrix);
      if (nAttr) { _n.fromBufferAttribute(nAttr, i); if (matrix) _n.applyMatrix3(_m3).normalize(); } else _n.set(0, 1, 0);
      if (opts.normalFn) opts.normalFn(_v, _n);
      this.pos.push(_v.x, _v.y, _v.z); this.nrm.push(_n.x, _n.y, _n.z);
      const c = typeof color === 'function' ? color(_v, _n, i) : color;
      this.col.push(c[0], c[1], c[2]);
      if (uvA) this.uv.push(uvA.getX(i), uvA.getY(i)); else this.uv.push(0, 0);
      for (const k in this.extra) {
        const e = this.extra[k], val = opts.extra?.[k];
        const vv = typeof val === 'function' ? val(_v, _n, i) : val ?? 0;
        if (e.size === 1) e.data.push(vv); else e.data.push(...vv);
      }
    }
    if (geo.index) { const ix = geo.index.array; for (let i = 0; i < ix.length; i++) this.idx.push(base + ix[i]); }
    else for (let i = 0; i < p.count; i++) this.idx.push(base + i);
    return this;
  }
  build() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nrm, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    for (const k in this.extra) g.setAttribute(k, new THREE.Float32BufferAttribute(this.extra[k].data, this.extra[k].size));
    g.setIndex(this.count > 65535 ? new THREE.Uint32BufferAttribute(this.idx, 1) : new THREE.Uint16BufferAttribute(this.idx, 1));
    g.computeBoundingSphere(); g.computeBoundingBox();
    return g;
  }
}

/** Tube along points with per-point radius. Returns indexed BufferGeometry with normals & uv (u around, v along). */
export function tube(points, radii, radial = 8, capEnd = true) {
  const pos = [], nrm = [], uv = [], idx = [];
  const n = points.length;
  let prevN = null;
  const T = new THREE.Vector3(), N = new THREE.Vector3(), B = new THREE.Vector3();
  for (let i = 0; i < n; i++) {
    const p = points[i];
    if (i < n - 1) T.subVectors(points[i + 1], p); else T.subVectors(p, points[i - 1]);
    T.normalize();
    if (!prevN) { N.set(0, 0, 1); if (Math.abs(T.dot(N)) > 0.9) N.set(1, 0, 0); N.sub(T.clone().multiplyScalar(T.dot(N))).normalize(); }
    else { N.copy(prevN).sub(T.clone().multiplyScalar(T.dot(prevN))).normalize(); }
    prevN = N.clone();
    B.crossVectors(T, N);
    for (let r = 0; r <= radial; r++) {
      const a = r / radial * Math.PI * 2;
      const cx = Math.cos(a), cy = Math.sin(a);
      const nx = N.x * cx + B.x * cy, ny = N.y * cx + B.y * cy, nz = N.z * cx + B.z * cy;
      pos.push(p.x + nx * radii[i], p.y + ny * radii[i], p.z + nz * radii[i]);
      nrm.push(nx, ny, nz); uv.push(r / radial, i / (n - 1));
    }
  }
  for (let i = 0; i < n - 1; i++) for (let r = 0; r < radial; r++) {
    const a = i * (radial + 1) + r, b = a + radial + 1;
    idx.push(a, b, a + 1, a + 1, b, b + 1);
  }
  if (capEnd) {
    const c = pos.length / 3, p = points[n - 1];
    T.subVectors(points[n - 1], points[n - 2]).normalize();
    pos.push(p.x, p.y, p.z); nrm.push(T.x, T.y, T.z); uv.push(0.5, 1);
    for (let r = 0; r < radial; r++) idx.push((n - 1) * (radial + 1) + r, c, (n - 1) * (radial + 1) + r + 1);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  return g;
}

/** Icosphere with shared vertices, displaced by fn(dir) → radius multiplier. */
export function blob(radius, detail, dispFn = null, scale = [1, 1, 1]) {
  let g = new THREE.IcosahedronGeometry(1, detail);
  g.deleteAttribute('uv'); g.deleteAttribute('normal');
  g = mergeVertices(g);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    _v.fromBufferAttribute(p, i).normalize();
    const r = radius * (dispFn ? dispFn(_v) : 1);
    p.setXYZ(i, _v.x * r * scale[0], _v.y * r * scale[1], _v.z * r * scale[2]);
  }
  g.computeVertexNormals();
  return g;
}

/** Single quad card (two-sided handled by material). size w×h, centred at origin in XY plane, facing +Z. */
export function card(w, h) { const g = new THREE.PlaneGeometry(w, h); return g; }

export function mat4(pos, rotY = 0, scale = 1, rotX = 0, rotZ = 0) {
  const m = new THREE.Matrix4();
  m.compose(new THREE.Vector3(...(Array.isArray(pos) ? pos : [pos.x, pos.y, pos.z])), new THREE.Quaternion().setFromEuler(new THREE.Euler(rotX, rotY, rotZ, 'YXZ')), typeof scale === 'number' ? new THREE.Vector3(scale, scale, scale) : new THREE.Vector3(...scale));
  return m;
}
