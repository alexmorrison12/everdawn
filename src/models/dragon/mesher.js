// Naive surface nets over a two-level block-culled grid, then Newton projection of every vertex onto the true SDF
// surface, analytic (gradient) normals and a mesh-based mean-curvature estimate for cavity painting.
const EDGES = [
  [0, 1], [2, 3], [4, 5], [6, 7],
  [0, 2], [1, 3], [4, 6], [5, 7],
  [0, 4], [1, 5], [2, 6], [3, 7],
];
const CO = [[0, 0, 0], [1, 0, 0], [0, 1, 0], [1, 1, 0], [0, 0, 1], [1, 0, 1], [0, 1, 1], [1, 1, 1]];

/**
 * sdf: SDF instance. opts: { cell, bounds:{min,max}, margin, project=1 }
 * Returns { pos, nrm, curv, idx, count, stats }
 */
export function surfaceNets(sdf, opts) {
  const cell = opts.cell;
  const BL = 8, SB = 4;                 // list block (cells), culling sub-block (cells)
  const min = opts.bounds.min, max = opts.bounds.max;
  const bs = BL * cell;
  const nb = [0, 1, 2].map(i => Math.max(1, Math.ceil((max[i] - min[i]) / bs)));
  sdf.prepare(min, bs, nb, opts.margin ?? cell * 2.5);
  const NX = nb[0] * BL, NY = nb[1] * BL, NZ = nb[2] * BL;
  const SX = NX + 1, SY = NY + 1, SZ = NZ + 1, SXY = SX * SY;
  const F = new Float32Array(SX * SY * SZ);
  const S = new Uint8Array(SX * SY * SZ);
  const ns = [NX / SB, NY / SB, NZ / SB];
  const active = new Uint8Array(ns[0] * ns[1] * ns[2]);
  const hd = 0.5 * SB * cell * Math.sqrt(3);
  const thr = hd * 1.25 + cell * 1.5;
  let evals = 0, nActive = 0;
  const mx = min[0], my = min[1], mz = min[2];
  for (let sz = 0; sz < ns[2]; sz++) for (let sy = 0; sy < ns[1]; sy++) for (let sx = 0; sx < ns[0]; sx++) {
    const x0 = sx * SB, y0 = sy * SB, z0 = sz * SB;
    const L = sdf.blocks[((x0 / BL) | 0) + nb[0] * (((y0 / BL) | 0) + nb[1] * ((z0 / BL) | 0))];
    let fillVal = bs;
    if (L.length) {
      const dc = sdf.evalList(L, mx + (x0 + SB * 0.5) * cell, my + (y0 + SB * 0.5) * cell, mz + (z0 + SB * 0.5) * cell);
      evals++;
      if (Math.abs(dc) <= thr) {
        active[sx + ns[0] * (sy + ns[1] * sz)] = 1; nActive++;
        for (let z = z0; z <= z0 + SB; z++) {
          const wz = mz + z * cell;
          for (let y = y0; y <= y0 + SB; y++) {
            const wy = my + y * cell;
            let i = x0 + SX * (y + SY * z);
            for (let x = x0; x <= x0 + SB; x++, i++) {
              if (S[i] === 2) continue;
              F[i] = sdf.evalList(L, mx + x * cell, wy, wz); S[i] = 2; evals++;
            }
          }
        }
        continue;
      }
      fillVal = dc;
    }
    for (let z = z0; z <= z0 + SB; z++) for (let y = y0; y <= y0 + SB; y++) {
      let i = x0 + SX * (y + SY * z);
      for (let x = x0; x <= x0 + SB; x++, i++) if (S[i] === 0) { F[i] = fillVal; S[i] = 1; }
    }
  }

  // ---- vertices
  const cellV = new Int32Array(NX * NY * NZ);
  const P = [];
  const cv = new Float32Array(8);
  const off = [0, 1, SX, SX + 1, SXY, SXY + 1, SXY + SX, SXY + SX + 1];
  const cells = [];
  for (let sz = 0; sz < ns[2]; sz++) for (let sy = 0; sy < ns[1]; sy++) for (let sx = 0; sx < ns[0]; sx++) {
    if (!active[sx + ns[0] * (sy + ns[1] * sz)]) continue;
    for (let z = sz * SB; z < sz * SB + SB; z++) for (let y = sy * SB; y < sy * SB + SB; y++) {
      for (let x = sx * SB; x < sx * SB + SB; x++) {
        const i0 = x + SX * (y + SY * z);
        let mask = 0;
        for (let c = 0; c < 8; c++) { const v = F[i0 + off[c]]; cv[c] = v; if (v < 0) mask |= 1 << c; }
        if (mask === 0 || mask === 255) continue;
        let px = 0, py = 0, pz = 0, n = 0;
        for (let e = 0; e < 12; e++) {
          const a = EDGES[e][0], b = EDGES[e][1];
          const va = cv[a], vb = cv[b];
          if ((va < 0) === (vb < 0)) continue;
          const t = va / (va - vb);
          const A = CO[a], B = CO[b];
          px += A[0] + (B[0] - A[0]) * t; py += A[1] + (B[1] - A[1]) * t; pz += A[2] + (B[2] - A[2]) * t; n++;
        }
        P.push(mx + (x + px / n) * cell, my + (y + py / n) * cell, mz + (z + pz / n) * cell);
        cellV[x + NX * (y + NY * z)] = P.length / 3;
        cells.push(x, y, z);
      }
    }
  }

  // ---- faces
  const I = [];
  const pos = new Float32Array(P);
  const quad = (a, b, c, d, flip) => {
    if (!a || !b || !c || !d) return;
    a--; b--; c--; d--;
    const d1 = dist2(pos, a, c), d2 = dist2(pos, b, d);
    if (!flip) { if (d1 < d2) I.push(a, b, c, a, c, d); else I.push(a, b, d, b, c, d); }
    else { if (d1 < d2) I.push(a, c, b, a, d, c); else I.push(a, d, b, b, d, c); }
  };
  const cvi = (xx, yy, zz) => cellV[xx + NX * (yy + NY * zz)];
  for (let k = 0; k < cells.length; k += 3) {
    const x = cells[k], y = cells[k + 1], z = cells[k + 2];
    const i0 = x + SX * (y + SY * z);
    const f0 = F[i0] < 0;
    if (y > 0 && z > 0 && f0 !== (F[i0 + 1] < 0)) quad(cvi(x, y, z), cvi(x, y - 1, z), cvi(x, y - 1, z - 1), cvi(x, y, z - 1), !f0);
    if (x > 0 && z > 0 && f0 !== (F[i0 + SX] < 0)) quad(cvi(x, y, z), cvi(x, y, z - 1), cvi(x - 1, y, z - 1), cvi(x - 1, y, z), !f0);
    if (x > 0 && y > 0 && f0 !== (F[i0 + SXY] < 0)) quad(cvi(x, y, z), cvi(x - 1, y, z), cvi(x - 1, y - 1, z), cvi(x, y - 1, z), !f0);
  }

  // ---- project + normals
  const count = pos.length / 3;
  const nrm = new Float32Array(count * 3);
  const g = [0, 0, 0];
  const e = cell * 0.3, i4e = 1 / (4 * e);
  const iters = opts.project ?? 1;
  for (let i = 0; i < count; i++) {
    let x = pos[i * 3], y = pos[i * 3 + 1], z = pos[i * 3 + 2];
    let moved = 0;
    for (let it = 0; it < iters; it++) {
      const f = sdf.grad(x, y, z, e, g);
      const gx = g[0] * i4e, gy = g[1] * i4e, gz = g[2] * i4e;
      const gl2 = gx * gx + gy * gy + gz * gz;
      if (gl2 < 1e-8) break;
      let sx = f * gx / gl2, sy = f * gy / gl2, sz = f * gz / gl2;
      const sl = Math.sqrt(sx * sx + sy * sy + sz * sz);
      if (sl > cell) { const r = cell / sl; sx *= r; sy *= r; sz *= r; }
      x -= sx; y -= sy; z -= sz; moved = Math.max(moved, sl);
    }
    pos[i * 3] = x; pos[i * 3 + 1] = y; pos[i * 3 + 2] = z;
    // the projection moves along the gradient, so the last gradient is a good normal unless the step was large
    if (moved > cell * 0.35) sdf.grad(x, y, z, e, g);
    const l = Math.hypot(g[0], g[1], g[2]) || 1;
    nrm[i * 3] = g[0] / l; nrm[i * 3 + 1] = g[1] / l; nrm[i * 3 + 2] = g[2] / l;
  }
  const idx = new Uint32Array(I);
  const curv = meshCurvature(pos, nrm, idx, count);
  return { pos, nrm, curv, idx, count, stats: { evals, grid: [NX, NY, NZ], active: nActive } };
}

/** Mean curvature estimate from vertex normals: avg over edges of (nj-ni)·(pj-pi)/|pj-pi|². (+ convex, - concave) */
export function meshCurvature(pos, nrm, idx, count) {
  const sum = new Float32Array(count), cnt = new Uint16Array(count);
  const edge = (a, b) => {
    const dx = pos[b * 3] - pos[a * 3], dy = pos[b * 3 + 1] - pos[a * 3 + 1], dz = pos[b * 3 + 2] - pos[a * 3 + 2];
    const l2 = dx * dx + dy * dy + dz * dz; if (l2 < 1e-12) return;
    const k = ((nrm[b * 3] - nrm[a * 3]) * dx + (nrm[b * 3 + 1] - nrm[a * 3 + 1]) * dy + (nrm[b * 3 + 2] - nrm[a * 3 + 2]) * dz) / l2;
    sum[a] += k; cnt[a]++; sum[b] += k; cnt[b]++;
  };
  for (let i = 0; i < idx.length; i += 3) { edge(idx[i], idx[i + 1]); edge(idx[i + 1], idx[i + 2]); edge(idx[i + 2], idx[i]); }
  for (let i = 0; i < count; i++) sum[i] = cnt[i] ? sum[i] / cnt[i] : 0;
  // one smoothing pass (curvature from normals is noisy at surface-nets scale)
  const out = new Float32Array(count), c2 = new Uint16Array(count);
  for (let i = 0; i < idx.length; i += 3) {
    const a = idx[i], b = idx[i + 1], c = idx[i + 2];
    out[a] += sum[b] + sum[c]; out[b] += sum[a] + sum[c]; out[c] += sum[a] + sum[b]; c2[a] += 2; c2[b] += 2; c2[c] += 2;
  }
  for (let i = 0; i < count; i++) out[i] = (out[i] / Math.max(1, c2[i])) * 0.5 + sum[i] * 0.5;
  return out;
}

function dist2(p, a, b) {
  const dx = p[a * 3] - p[b * 3], dy = p[a * 3 + 1] - p[b * 3 + 1], dz = p[a * 3 + 2] - p[b * 3 + 2];
  return dx * dx + dy * dy + dz * dz;
}
