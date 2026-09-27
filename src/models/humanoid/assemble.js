// Merges skinned pieces into one BufferGeometry with palette-resolved colours and material attributes.
import * as THREE from 'three';
import { NSLOT } from './palette.js';

/**
 * parts: [{ p: piece, off?: Float32Array(n), keepTri?: Uint8Array(ntri), slot?: Uint8Array(n), mul?: Float32Array(3n), xf?: fn }]
 * pal: array[NSLOT] of { c:[r,g,b], spec, emis, det:[4], cast }
 */
export function assemble(parts, pal, { skinned = true } = {}) {
  let nv = 0, ni = 0;
  for (const pt of parts) {
    if (pt.keepTri) { // compact: only vertices referenced by kept triangles
      const used = new Int32Array(pt.p.n).fill(-1); let k = 0;
      for (let t = 0; t < pt.keepTri.length; t++) if (pt.keepTri[t]) { ni += 3; for (let j = 0; j < 3; j++) { const v = pt.p.idx[t * 3 + j]; if (used[v] < 0) used[v] = k++; } }
      pt.remap = used; pt.nUsed = k; nv += k;
    } else { nv += pt.p.n; ni += pt.p.idx.length; }
  }
  const pos = new Float32Array(nv * 3), nrm = new Float32Array(nv * 3), col = new Float32Array(nv * 3);
  const si = skinned ? new Uint8Array(nv * 4) : null, sw = skinned ? new Float32Array(nv * 4) : null;
  const det = new Uint8Array(nv * 4), mat = new Uint8Array(nv * 4), face = new Float32Array(nv * 2);
  const idx = nv > 65535 ? new Uint32Array(ni) : new Uint16Array(ni);
  let vo = 0, io = 0;
  for (const pt of parts) {
    const p = pt.p, n = p.n, rm = pt.remap;
    const slot = pt.slot || p.slot, mul = pt.mul || p.mul, off = pt.off;
    for (let v = 0; v < n; v++) {
      if (rm && rm[v] < 0) continue;
      const dv = rm ? rm[v] : v;
      const o3 = (vo + dv) * 3, i3 = v * 3;
      let x = p.pos[i3], y = p.pos[i3 + 1], z = p.pos[i3 + 2];
      const nx = p.nrm[i3], ny = p.nrm[i3 + 1], nz = p.nrm[i3 + 2];
      if (off) { const d = off[v]; x += nx * d; y += ny * d; z += nz * d; }
      pos[o3] = x; pos[o3 + 1] = y; pos[o3 + 2] = z;
      nrm[o3] = nx; nrm[o3 + 1] = ny; nrm[o3 + 2] = nz;
      const e = pal[slot[v]] || pal[0];
      col[o3] = e.c[0] * mul[i3]; col[o3 + 1] = e.c[1] * mul[i3 + 1]; col[o3 + 2] = e.c[2] * mul[i3 + 2];
      const o4 = (vo + dv) * 4;
      if (skinned) for (let k = 0; k < 4; k++) { si[o4 + k] = p.bi[v * 4 + k]; sw[o4 + k] = p.bw[v * 4 + k]; }
      const dd = p.det ? p.det.subarray(v * 4, v * 4 + 4) : e.det;
      det[o4] = dd[0] * 255; det[o4 + 1] = dd[1] * 255; det[o4 + 2] = dd[2] * 255; det[o4 + 3] = dd[3] * 255;
      const em = Math.min(1, (e.emis || 0) + (p.emis ? p.emis[v] : 0));
      mat[o4] = Math.min(255, (e.spec || 0) * 255); mat[o4 + 1] = em * 255; mat[o4 + 2] = ((pt.cast ?? e.cast) || 0) * 255; mat[o4 + 3] = 0;
      if (p.face) { face[(vo + dv) * 2] = p.face[v * 2]; face[(vo + dv) * 2 + 1] = p.face[v * 2 + 1]; }
      else { face[(vo + dv) * 2] = -1; face[(vo + dv) * 2 + 1] = -1; }
    }
    if (pt.keepTri) {
      const kt = pt.keepTri;
      for (let t = 0; t < kt.length; t++) if (kt[t]) { idx[io++] = rm[p.idx[t * 3]] + vo; idx[io++] = rm[p.idx[t * 3 + 1]] + vo; idx[io++] = rm[p.idx[t * 3 + 2]] + vo; }
      vo += pt.nUsed;
    } else { for (let i = 0; i < p.idx.length; i++) idx[io++] = p.idx[i] + vo; vo += n; }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  if (skinned) {
    g.setAttribute('skinIndex', new THREE.BufferAttribute(si, 4));
    g.setAttribute('skinWeight', new THREE.BufferAttribute(sw, 4));
  }
  g.setAttribute('aDet', new THREE.BufferAttribute(det, 4, true));
  g.setAttribute('aMat', new THREE.BufferAttribute(mat, 4, true));
  g.setAttribute('aFace', new THREE.BufferAttribute(face, 2));
  g.setIndex(new THREE.BufferAttribute(idx, 1));
  return g;
}
