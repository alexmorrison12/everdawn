// Skin weights (from SDF primitive ownership), SDF ambient occlusion and a compact mesh accumulator with skinning.
import * as THREE from 'three';
import { unionEval } from './sdf.js';

/** Top-4 extraction from a dense bone-weight row. */
export function top4(acc, nB, si, sw, o) {
  let i0 = -1, i1 = -1, i2 = -1, i3 = -1, w0 = 0, w1 = 0, w2 = 0, w3 = 0;
  for (let b = 0; b < nB; b++) {
    const w = acc[b];
    if (w <= w3) continue;
    if (w > w0) { i3 = i2; w3 = w2; i2 = i1; w2 = w1; i1 = i0; w1 = w0; i0 = b; w0 = w; }
    else if (w > w1) { i3 = i2; w3 = w2; i2 = i1; w2 = w1; i1 = b; w1 = w; }
    else if (w > w2) { i3 = i2; w3 = w2; i2 = b; w2 = w; }
    else { i3 = b; w3 = w; }
  }
  // drop tiny influences
  if (w3 < 0.02) w3 = 0; if (w2 < 0.02) w2 = 0; if (w1 < 0.01) w1 = 0;
  const t = w0 + w1 + w2 + w3 || 1;
  si[o] = Math.max(i0, 0); si[o + 1] = Math.max(i1, 0); si[o + 2] = Math.max(i2, 0); si[o + 3] = Math.max(i3, 0);
  sw[o] = w0 / t; sw[o + 1] = w1 / t; sw[o + 2] = w2 / t; sw[o + 3] = w3 / t;
}

/**
 * Weights for SDF-meshed vertices. Optional mesh smoothing (Laplacian on the dense rows) for softer joints.
 * Returns { si, sw, hs, hl, hc, ht } (skin index/weight + painting hints per vertex).
 */
export function sdfWeights(sdf, pos, count, nB, idx = null, smooth = 0) {
  const si = new Uint16Array(count * 4), sw = new Float32Array(count * 4);
  const hs = new Float32Array(count), hl = new Float32Array(count), hc = new Float32Array(count), ht = new Int16Array(count);
  const acc = new Float32Array(nB), hint = { s: 0, limb: 0, scl: 1, tag: 0 };
  const dense = smooth ? new Float32Array(count * nB) : null;
  for (let i = 0; i < count; i++) {
    acc.fill(0);
    const tot = sdf.weightsAt(pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2], acc, hint);
    if (tot > 0) for (let b = 0; b < nB; b++) acc[b] /= tot;
    hs[i] = hint.s; hl[i] = hint.limb; hc[i] = hint.scl; ht[i] = hint.tag;
    if (dense) dense.set(acc, i * nB); else top4(acc, nB, si, sw, i * 4);
  }
  if (dense) {
    // adjacency
    const nbr = buildAdjacency(idx, count);
    let src = dense, dst = new Float32Array(count * nB);
    for (let it = 0; it < smooth; it++) {
      for (let i = 0; i < count; i++) {
        const o = i * nB, a = nbr.start[i], b = nbr.start[i + 1], n = b - a;
        for (let k = 0; k < nB; k++) dst[o + k] = src[o + k] * 0.5;
        if (!n) { for (let k = 0; k < nB; k++) dst[o + k] = src[o + k]; continue; }
        const f = 0.5 / n;
        for (let j = a; j < b; j++) { const q = nbr.list[j] * nB; for (let k = 0; k < nB; k++) dst[o + k] += src[q + k] * f; }
      }
      const t = src; src = dst; dst = t;
    }
    for (let i = 0; i < count; i++) { for (let k = 0; k < nB; k++) acc[k] = src[i * nB + k]; top4(acc, nB, si, sw, i * 4); }
  }
  return { si, sw, hs, hl, hc, ht };
}

export function buildAdjacency(idx, count) {
  const deg = new Uint32Array(count + 1);
  for (let i = 0; i < idx.length; i += 3) { deg[idx[i]] += 2; deg[idx[i + 1]] += 2; deg[idx[i + 2]] += 2; }
  const start = new Uint32Array(count + 1);
  for (let i = 0; i < count; i++) start[i + 1] = start[i] + deg[i];
  const fill = start.slice(0, count), list = new Uint32Array(start[count]);
  for (let i = 0; i < idx.length; i += 3) {
    const a = idx[i], b = idx[i + 1], c = idx[i + 2];
    list[fill[a]++] = b; list[fill[a]++] = c; list[fill[b]++] = a; list[fill[b]++] = c; list[fill[c]++] = a; list[fill[c]++] = b;
  }
  return { start, list };
}

/** SDF ambient occlusion along the normal at two scales. */
export function sdfAO(sdfs, pos, nrm, count, fine, broad) {
  const ao = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    const x = pos[i * 3], y = pos[i * 3 + 1], z = pos[i * 3 + 2], nx = nrm[i * 3], ny = nrm[i * 3 + 1], nz = nrm[i * 3 + 2];
    ao[i] = aoAt(sdfs, x, y, z, nx, ny, nz, fine, broad);
  }
  return ao;
}

export function aoAt(sdfs, x, y, z, nx, ny, nz, fine, broad) {
  let occ = 0, wt = 0;
  for (let k = 1; k <= 3; k++) {
    const h = fine * k / 3, d = unionEval(sdfs, x + nx * h, y + ny * h, z + nz * h);
    const w = 1 / k; occ += w * Math.min(1, Math.max(0, (h - d) / h)); wt += w;
  }
  const a1 = 1 - occ / wt;
  occ = 0; wt = 0;
  for (let k = 1; k <= 2; k++) {
    const h = broad * k / 2, d = unionEval(sdfs, x + nx * h, y + ny * h, z + nz * h);
    const w = 1 / (k + 1); occ += w * Math.min(1, Math.max(0, (h - d) / h)); wt += w;
  }
  const a2 = 1 - occ / wt;
  return Math.max(0, Math.min(1, a1 * (0.35 + 0.65 * a2)));
}

/** Growable accumulator for skinned geometry with vertex colours and a vec4 data channel (aDat). */
export class Acc {
  constructor() {
    this.P = []; this.N = []; this.C = []; this.UV = []; this.SI = []; this.SW = []; this.D = []; this.I = [];
  }
  get n() { return this.P.length / 3; }
  vert(x, y, z, nx, ny, nz, r, g, b, u, v, si, sw, d) {
    this.P.push(x, y, z); this.N.push(nx, ny, nz); this.C.push(r, g, b); this.UV.push(u, v);
    this.SI.push(si[0], si[1], si[2], si[3]); this.SW.push(sw[0], sw[1], sw[2], sw[3]); this.D.push(d[0], d[1], d[2], d[3]);
    return this.n - 1;
  }
  tri(a, b, c) { this.I.push(a, b, c); }
  /** Append a raw mesh: pos/nrm typed arrays, idx; per-vertex callbacks fill colour / skin / dat. */
  addMesh(m, cb) {
    const base = this.n, col = [1, 1, 1], si = [0, 0, 0, 0], sw = [1, 0, 0, 0], d = [0, 0, 0, 0], uv = [0, 0];
    for (let i = 0; i < m.count; i++) {
      cb(i, col, si, sw, d, uv);
      this.vert(m.pos[i * 3], m.pos[i * 3 + 1], m.pos[i * 3 + 2], m.nrm[i * 3], m.nrm[i * 3 + 1], m.nrm[i * 3 + 2], col[0], col[1], col[2], uv[0], uv[1], si, sw, d);
    }
    const I = m.idx;
    for (let i = 0; i < I.length; i++) this.I.push(base + I[i]);
    return base;
  }
  build(scale = 1) {
    const g = new THREE.BufferGeometry();
    const P = new Float32Array(this.P);
    if (scale !== 1) for (let i = 0; i < P.length; i++) P[i] *= scale;
    g.setAttribute('position', new THREE.BufferAttribute(P, 3));
    g.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(this.N), 3));
    g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(this.C), 3));
    g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(this.UV), 2));
    g.setAttribute('skinIndex', new THREE.BufferAttribute(new Uint16Array(this.SI), 4));
    g.setAttribute('skinWeight', new THREE.BufferAttribute(new Float32Array(this.SW), 4));
    g.setAttribute('aDat', new THREE.BufferAttribute(new Float32Array(this.D), 4));
    const n = this.n;
    g.setIndex(n > 65535 ? new THREE.BufferAttribute(new Uint32Array(this.I), 1) : new THREE.BufferAttribute(new Uint16Array(this.I), 1));
    g.computeBoundingSphere(); g.computeBoundingBox();
    return g;
  }
}
