// Quadric-error half-edge-collapse mesh simplifier (Garland & Heckbert, collapse to an endpoint).
// Surviving vertices keep their original position/normal, so per-vertex attributes can be computed afterwards.

/**
 * @param pos Float32Array(3n) @param nrm Float32Array(3n) @param idx Uint32Array(3t)
 * @param target desired vertex count
 * @param weight optional fn(vertexIndex) -> importance multiplier (>1 keeps more detail)
 * @returns { pos, nrm, idx }
 */
export function simplify(pos, nrm, idx, target, weight = null) {
  const nV = pos.length / 3, nT = idx.length / 3;
  if (nV <= target) return { pos, nrm, idx };
  const Q = new Float64Array(nV * 10);
  const tri = new Int32Array(idx);
  const tAlive = new Uint8Array(nT).fill(1);
  // vertex -> triangles (growable lists)
  const vt = new Array(nV);
  for (let v = 0; v < nV; v++) vt[v] = [];
  for (let t = 0; t < nT; t++) {
    const a = tri[t * 3], b = tri[t * 3 + 1], c = tri[t * 3 + 2];
    vt[a].push(t); vt[b].push(t); vt[c].push(t);
    const ax = pos[a * 3], ay = pos[a * 3 + 1], az = pos[a * 3 + 2];
    const ux = pos[b * 3] - ax, uy = pos[b * 3 + 1] - ay, uz = pos[b * 3 + 2] - az;
    const wx = pos[c * 3] - ax, wy = pos[c * 3 + 1] - ay, wz = pos[c * 3 + 2] - az;
    let nx = uy * wz - uz * wy, ny = uz * wx - ux * wz, nz = ux * wy - uy * wx;
    const l = Math.sqrt(nx * nx + ny * ny + nz * nz); if (l < 1e-14) continue;
    const area = l * 0.5; nx /= l; ny /= l; nz /= l;
    const d = -(nx * ax + ny * ay + nz * az);
    const q0 = nx * nx * area, q1 = nx * ny * area, q2 = nx * nz * area, q3 = nx * d * area, q4 = ny * ny * area, q5 = ny * nz * area, q6 = ny * d * area, q7 = nz * nz * area, q8 = nz * d * area, q9 = d * d * area;
    for (let k = 0; k < 3; k++) {
      const o = tri[t * 3 + k] * 10;
      Q[o] += q0; Q[o + 1] += q1; Q[o + 2] += q2; Q[o + 3] += q3; Q[o + 4] += q4; Q[o + 5] += q5; Q[o + 6] += q6; Q[o + 7] += q7; Q[o + 8] += q8; Q[o + 9] += q9;
    }
  }
  if (weight) for (let v = 0; v < nV; v++) { const w = weight(v); if (w !== 1) for (let k = 0; k < 10; k++) Q[v * 10 + k] *= w; }
  const alive = new Uint8Array(nV).fill(1);
  const stamp = new Uint32Array(nV);
  // index heap over entries stored in parallel growable arrays
  let cap = nV * 4;
  let ec = new Float64Array(cap), ea = new Int32Array(cap), eb = new Int32Array(cap), esa = new Uint32Array(cap), esb = new Uint32Array(cap);
  let heap = new Int32Array(cap); let hn = 0, en = 0;
  const growE = () => {
    cap *= 2;
    const g = (A, T) => { const n = new T(cap); n.set(A); return n; };
    ec = g(ec, Float64Array); ea = g(ea, Int32Array); eb = g(eb, Int32Array); esa = g(esa, Uint32Array); esb = g(esb, Uint32Array); heap = g(heap, Int32Array);
  };
  const push = (c, a, b) => {
    if (en >= cap || hn >= cap) growE();
    const e = en++; ec[e] = c; ea[e] = a; eb[e] = b; esa[e] = stamp[a]; esb[e] = stamp[b];
    let i = hn++; heap[i] = e;
    while (i > 0) { const p = (i - 1) >> 1; if (ec[heap[p]] <= c) break; heap[i] = heap[p]; i = p; }
    heap[i] = e;
  };
  const pop = () => {
    const top = heap[0]; const last = heap[--hn];
    let i = 0; const lc = ec[last];
    for (;;) {
      let m = i * 2 + 1; if (m >= hn) break;
      if (m + 1 < hn && ec[heap[m + 1]] < ec[heap[m]]) m++;
      if (ec[heap[m]] >= lc) break;
      heap[i] = heap[m]; i = m;
    }
    heap[i] = last;
    return top;
  };
  const cost = (a, b) => {
    const x = pos[b * 3], y = pos[b * 3 + 1], z = pos[b * 3 + 2];
    const oa = a * 10, ob = b * 10;
    const q0 = Q[oa] + Q[ob], q1 = Q[oa + 1] + Q[ob + 1], q2 = Q[oa + 2] + Q[ob + 2], q3 = Q[oa + 3] + Q[ob + 3], q4 = Q[oa + 4] + Q[ob + 4];
    const q5 = Q[oa + 5] + Q[ob + 5], q6 = Q[oa + 6] + Q[ob + 6], q7 = Q[oa + 7] + Q[ob + 7], q8 = Q[oa + 8] + Q[ob + 8], q9 = Q[oa + 9] + Q[ob + 9];
    return q0 * x * x + 2 * q1 * x * y + 2 * q2 * x * z + 2 * q3 * x + q4 * y * y + 2 * q5 * y * z + 2 * q6 * y + q7 * z * z + 2 * q8 * z + q9;
  };
  const consider = (a, b) => { const c1 = cost(a, b), c2 = cost(b, a); if (c1 <= c2) push(c1, a, b); else push(c2, b, a); };
  for (let t = 0; t < nT; t++) {
    const a = tri[t * 3], b = tri[t * 3 + 1], c = tri[t * 3 + 2];
    if (a < b) consider(a, b); if (b < c) consider(b, c); if (c < a) consider(c, a);
  }
  // neighbour marking with stamps (no Sets)
  const mark = new Uint32Array(nV); let mk = 1;
  const nbr = []; // scratch
  const valid = (a, b) => {
    mk++;
    // mark neighbours of a
    for (const t of vt[a]) { if (!tAlive[t]) continue; for (let k = 0; k < 3; k++) { const u = tri[t * 3 + k]; if (u !== a) mark[u] = mk; } }
    // count common neighbours of b, and shared triangles
    let common = 0; mk++;
    const m1 = mk - 1;
    for (const t of vt[b]) {
      if (!tAlive[t]) continue;
      for (let k = 0; k < 3; k++) { const u = tri[t * 3 + k]; if (u !== b && mark[u] === m1) { mark[u] = mk; common++; } }
    }
    let shared = 0;
    for (const t of vt[a]) if (tAlive[t] && (tri[t * 3] === b || tri[t * 3 + 1] === b || tri[t * 3 + 2] === b)) shared++;
    // common includes b itself? no: b is a neighbour of a, but u !== b excluded above
    if (common !== shared) return false;
    // no flips
    for (const t of vt[a]) {
      if (!tAlive[t]) continue;
      const i0 = tri[t * 3], i1 = tri[t * 3 + 1], i2 = tri[t * 3 + 2];
      if (i0 === b || i1 === b || i2 === b) continue;
      if (!flipOK(pos, i0, i1, i2, i0 === a ? b : i0, i1 === a ? b : i1, i2 === a ? b : i2)) return false;
    }
    return true;
  };
  let live = nV;
  while (live > target && hn > 0) {
    const e = pop();
    const a = ea[e], b = eb[e];
    if (!alive[a] || !alive[b] || stamp[a] !== esa[e] || stamp[b] !== esb[e]) continue;
    if (!valid(a, b)) continue;
    for (const t of vt[a]) {
      if (!tAlive[t]) continue;
      if (tri[t * 3] === b || tri[t * 3 + 1] === b || tri[t * 3 + 2] === b) { tAlive[t] = 0; continue; }
      for (let k = 0; k < 3; k++) if (tri[t * 3 + k] === a) tri[t * 3 + k] = b;
      vt[b].push(t);
    }
    alive[a] = 0; live--;
    for (let k = 0; k < 10; k++) Q[b * 10 + k] += Q[a * 10 + k];
    stamp[b]++;
    if (vt[b].length > 20) { const f = []; for (const t of vt[b]) if (tAlive[t]) f.push(t); vt[b] = f; }
    // re-queue edges around b
    mk++;
    for (const t of vt[b]) {
      if (!tAlive[t]) continue;
      for (let k = 0; k < 3; k++) { const u = tri[t * 3 + k]; if (u !== b && mark[u] !== mk) { mark[u] = mk; consider(b, u); } }
    }
  }
  const remap = new Int32Array(nV).fill(-1);
  let nv2 = 0; for (let v = 0; v < nV; v++) if (alive[v]) remap[v] = nv2++;
  const P = new Float32Array(nv2 * 3), N = new Float32Array(nv2 * 3);
  for (let v = 0; v < nV; v++) if (alive[v]) { const o = remap[v] * 3; P[o] = pos[v * 3]; P[o + 1] = pos[v * 3 + 1]; P[o + 2] = pos[v * 3 + 2]; N[o] = nrm[v * 3]; N[o + 1] = nrm[v * 3 + 1]; N[o + 2] = nrm[v * 3 + 2]; }
  const I = [];
  for (let t = 0; t < nT; t++) if (tAlive[t]) {
    const a = remap[tri[t * 3]], b = remap[tri[t * 3 + 1]], c = remap[tri[t * 3 + 2]];
    if (a < 0 || b < 0 || c < 0 || a === b || b === c || a === c) continue;
    I.push(a, b, c);
  }
  return { pos: P, nrm: N, idx: new Uint32Array(I) };
}

function flipOK(pos, a0, a1, a2, b0, b1, b2) {
  const n0 = triN(pos, a0, a1, a2, _n0), n1 = triN(pos, b0, b1, b2, _n1);
  if (n1[3] < 1e-12) return false;
  return (n0[0] * n1[0] + n0[1] * n1[1] + n0[2] * n1[2]) >= 0.25;
}
const _n0 = new Float64Array(4), _n1 = new Float64Array(4);
function triN(pos, a, b, c, out) {
  const ax = pos[a * 3], ay = pos[a * 3 + 1], az = pos[a * 3 + 2];
  const ux = pos[b * 3] - ax, uy = pos[b * 3 + 1] - ay, uz = pos[b * 3 + 2] - az;
  const wx = pos[c * 3] - ax, wy = pos[c * 3 + 1] - ay, wz = pos[c * 3 + 2] - az;
  const nx = uy * wz - uz * wy, ny = uz * wx - ux * wz, nz = ux * wy - uy * wx;
  const l = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1e-20;
  out[0] = nx / l; out[1] = ny / l; out[2] = nz / l; out[3] = l;
  return out;
}
