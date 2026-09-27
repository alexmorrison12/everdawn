// Signed-distance modelling (smooth-unioned primitives) + narrow-band Surface Nets mesher.
// Used to sculpt humanoid bodies, heads, hands, hair and beards. Everything is evaluated on the CPU once
// per (race, sex, style) and cached by the callers.

const T_SPHERE = 0, T_ELL = 1, T_CONE = 2, T_BOX = 3, T_PLANE = 4, T_TORUS = 5;
export const ADD = 0, SUB = 1, INT = 2;
const STRIDE = 34;
// layout: 0 type, 1 op, 2 k, 3 bone, 4 tag, 5-7 bound centre, 8 bound radius, 9.. params
//   sphere: 9-11 c, 12 r
//   ell:    9-11 c, 12-14 radii, 15-23 world->local rot (row-major)
//   cone:   9-11 a, 12-14 b, 15 ra, 16 rb, 17-19 ba, 20 l2, 21 rr, 22 a2, 23 il2, 24-26 1/squash, 27 min squash
//   box:    9-11 c, 12-14 half, 15 round, 16-24 rot
//   plane:  9-11 n, 12 h                     (d = n.p - h, negative "below")
//   torus:  9-11 c, 12 R, 13 r, 16-24 rot (torus in local XZ plane)

export function smin(a, b, k) {
  if (k <= 0) return a < b ? a : b;
  const h = Math.max(k - Math.abs(a - b), 0) / k;
  return (a < b ? a : b) - h * h * k * 0.25;
}
export function smax(a, b, k) { return -smin(-a, -b, k); }

// rotation helpers (3x3 row-major arrays)
export function rotEuler(x, y, z) { // R = Rx * Ry * Rz (three.js 'XYZ')
  const a = Math.cos(x), b = Math.sin(x), c = Math.cos(y), d = Math.sin(y), e = Math.cos(z), f = Math.sin(z);
  const ae = a * e, af = a * f, be = b * e, bf = b * f;
  return [c * e, -c * f, d, af + be * d, ae - bf * d, -b * c, bf - ae * d, be + af * d, a * c];
}
export function rotAlign(dir, side = null) { // local->world rotation: local Y -> dir, local X -> side (orthogonalised)
  const [dx, dy, dz] = norm3(dir);
  let s = side;
  if (!s) { // horizontal perpendicular: cross(dir, up), fallback X
    const cx = -dz, cz = dx; // dir x (0,1,0) = (-dz, 0, dx)
    s = Math.hypot(cx, cz) > 0.2 ? [cx, 0, cz] : [1, 0, 0];
  }
  const t = s[0] * dx + s[1] * dy + s[2] * dz;
  let xx = s[0] - t * dx, xy = s[1] - t * dy, xz = s[2] - t * dz;
  const l = Math.hypot(xx, xy, xz) || 1; xx /= l; xy /= l; xz /= l;
  const zx = xy * dz - xz * dy, zy = xz * dx - xx * dz, zz = xx * dy - xy * dx;
  return colsToRows([xx, xy, xz], [dx, dy, dz], [zx, zy, zz]);
}
function colsToRows(X, Y, Z) { return [X[0], Y[0], Z[0], X[1], Y[1], Z[1], X[2], Y[2], Z[2]]; }
export function mulR(A, B) {
  const o = new Array(9);
  for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) o[r * 3 + c] = A[r * 3] * B[c] + A[r * 3 + 1] * B[3 + c] + A[r * 3 + 2] * B[6 + c];
  return o;
}
export function norm3(v) { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; }

/**
 * Transform helper: an affine rigid transform {R (3x3 rows), t} applied to primitive inputs.
 */
export function xform(R, t) { return { R, t }; }
function xp(X, p) { if (!X) return p; const R = X.R; return [R[0] * p[0] + R[1] * p[1] + R[2] * p[2] + X.t[0], R[3] * p[0] + R[4] * p[1] + R[5] * p[2] + X.t[1], R[6] * p[0] + R[7] * p[1] + R[8] * p[2] + X.t[2]]; }
function xr(X, R) { return X ? mulR(X.R, R) : R; }

export class SDF {
  constructor() { this.items = []; this.X = null; this.data = null; }
  setXform(X) { this.X = X; return this; }
  _add(type, o, bc, br, params) {
    this.items.push({ type, op: o.op ?? ADD, k: o.k ?? 0, bone: o.bone ?? -1, tag: o.tag ?? 0, bc, br, params, sig: o.sig ?? 1, wk: o.wk ?? 1 });
    return this;
  }
  sphere(c, r, o = {}) { c = xp(this.X, c); return this._add(T_SPHERE, o, c, r, [...c, r]); }
  /** ellipsoid; o.rot = 3x3 row-major local->world rotation (from rotEuler/rotAlign) */
  ell(c, radii, o = {}) {
    c = xp(this.X, c);
    const R = xr(this.X, o.rot || [1, 0, 0, 0, 1, 0, 0, 0, 1]);
    const Rt = [R[0], R[3], R[6], R[1], R[4], R[7], R[2], R[5], R[8]]; // world->local
    return this._add(T_ELL, o, c, Math.max(...radii), [...c, ...radii, ...Rt]);
  }
  /** round cone from a (radius ra) to b (radius rb) */
  cone(a, b, ra, rb = ra, o = {}) {
    a = xp(this.X, a); b = xp(this.X, b);
    const ba = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
    const l2 = Math.max(1e-10, ba[0] * ba[0] + ba[1] * ba[1] + ba[2] * ba[2]);
    const rr = ra - rb, a2 = l2 - rr * rr, il2 = 1 / l2;
    const bc = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2];
    const br = Math.sqrt(l2) / 2 + Math.max(ra, rb);
    const sq = o.sq || [1, 1, 1]; // world-axis squash about a (<=1)
    return this._add(T_CONE, o, bc, br, [...a, ...b, ra, rb, ...ba, l2, rr, a2, il2, 1 / sq[0], 1 / sq[1], 1 / sq[2], Math.min(...sq)]);
  }
  box(c, half, round = 0, o = {}) {
    c = xp(this.X, c);
    const R = xr(this.X, o.rot || [1, 0, 0, 0, 1, 0, 0, 0, 1]);
    const Rt = [R[0], R[3], R[6], R[1], R[4], R[7], R[2], R[5], R[8]];
    return this._add(T_BOX, o, c, Math.hypot(...half), [...c, ...half, round, ...Rt]);
  }
  torus(c, R0, r, o = {}) {
    c = xp(this.X, c);
    const R = xr(this.X, o.rot || [1, 0, 0, 0, 1, 0, 0, 0, 1]);
    const Rt = [R[0], R[3], R[6], R[1], R[4], R[7], R[2], R[5], R[8]];
    return this._add(T_TORUS, o, c, R0 + r, [...c, R0, r, 0, 0, ...Rt]);
  }
  /** half-space n.p <= h is "inside"; use with op INT to clip */
  plane(n, h, o = {}) {
    const l = Math.hypot(n[0], n[1], n[2]) || 1;
    n = [n[0] / l, n[1] / l, n[2] / l];
    return this._add(T_PLANE, { op: INT, ...o }, [0, 0, 0], 1e9, [...n, h / l]);
  }
  /** new SDF containing only items passing filter(item) (params are already in world space) */
  subset(filter) { const s = new SDF(); s.items = this.items.filter(filter); return s.build(); }
  build() {
    const n = this.items.length, D = new Float32Array(n * STRIDE);
    this.items.forEach((it, i) => {
      const b = i * STRIDE;
      D[b] = it.type; D[b + 1] = it.op; D[b + 2] = it.k; D[b + 3] = it.bone; D[b + 4] = it.tag;
      D[b + 5] = it.bc[0]; D[b + 6] = it.bc[1]; D[b + 7] = it.bc[2]; D[b + 8] = it.br;
      for (let j = 0; j < it.params.length; j++) D[b + 9 + j] = it.params[j];
    });
    this.data = D; this.n = n;
    this.sig = new Float32Array(this.items.map(it => it.sig));
    this.wk = new Float32Array(this.items.map(it => it.wk));
    return this;
  }
  eval(x, y, z) {
    const D = this.data, n = this.n;
    let d = 1e9;
    for (let i = 0; i < n; i++) {
      const b = i * STRIDE, op = D[b + 1], k = D[b + 2];
      if (op === 0) {
        const ex = x - D[b + 5], ey = y - D[b + 6], ez = z - D[b + 7];
        const lb = Math.sqrt(ex * ex + ey * ey + ez * ez) - D[b + 8];
        if (lb > d + k) continue;
        const v = prim(D, b, x, y, z);
        d = smin(d, v, k);
      } else if (op === 1) {
        const ex = x - D[b + 5], ey = y - D[b + 6], ez = z - D[b + 7];
        const lb = Math.sqrt(ex * ex + ey * ey + ez * ez) - D[b + 8];
        if (lb > k - d) continue;
        const v = prim(D, b, x, y, z);
        d = smax(d, -v, k);
      } else {
        d = smax(d, prim(D, b, x, y, z), k);
      }
    }
    return d;
  }
  /** evaluator restricted to primitives that can influence points within R of (cx,cy,cz) */
  near(cx, cy, cz, R) {
    const D = this.data, L = [];
    for (let i = 0; i < this.n; i++) {
      const b = i * STRIDE, op = D[b + 1];
      if (op === 2) { L.push(i); continue; }
      const ex = cx - D[b + 5], ey = cy - D[b + 6], ez = cz - D[b + 7];
      if (Math.sqrt(ex * ex + ey * ey + ez * ez) - D[b + 8] - D[b + 2] < R) L.push(i);
    }
    if (L.length === this.n) return (x, y, z) => this.eval(x, y, z);
    if (L.length === 0) return () => R;
    const idx = Int32Array.from(L);
    return (x, y, z) => this.evalList(x, y, z, idx, R);
  }
  evalList(x, y, z, L, R) {
    const D = this.data;
    let d = R * 2;
    for (let j = 0; j < L.length; j++) {
      const b = L[j] * STRIDE, op = D[b + 1], k = D[b + 2];
      if (op === 0) {
        const ex = x - D[b + 5], ey = y - D[b + 6], ez = z - D[b + 7];
        const lb = Math.sqrt(ex * ex + ey * ey + ez * ez) - D[b + 8];
        if (lb > d + k) continue;
        d = smin(d, prim(D, b, x, y, z), k);
      } else if (op === 1) {
        const ex = x - D[b + 5], ey = y - D[b + 6], ez = z - D[b + 7];
        const lb = Math.sqrt(ex * ex + ey * ey + ez * ez) - D[b + 8];
        if (lb > k - d) continue;
        d = smax(d, -prim(D, b, x, y, z), k);
      } else d = smax(d, prim(D, b, x, y, z), k);
    }
    return d;
  }
  /** raw per-primitive distances */
  evalPrims(x, y, z, out) {
    const D = this.data;
    for (let i = 0; i < this.n; i++) out[i] = prim(D, i * STRIDE, x, y, z);
    return out;
  }
  boneOf(i) { return this.data[i * STRIDE + 3]; }
  tagOf(i) { return this.data[i * STRIDE + 4]; }
  opOf(i) { return this.data[i * STRIDE + 1]; }
}

function prim(D, b, x, y, z) {
  switch (D[b]) {
    case T_SPHERE: { const ex = x - D[b + 9], ey = y - D[b + 10], ez = z - D[b + 11]; return Math.sqrt(ex * ex + ey * ey + ez * ez) - D[b + 12]; }
    case T_ELL: {
      const px = x - D[b + 9], py = y - D[b + 10], pz = z - D[b + 11];
      const lx = D[b + 15] * px + D[b + 16] * py + D[b + 17] * pz;
      const ly = D[b + 18] * px + D[b + 19] * py + D[b + 20] * pz;
      const lz = D[b + 21] * px + D[b + 22] * py + D[b + 23] * pz;
      const rx = D[b + 12], ry = D[b + 13], rz = D[b + 14];
      const ax = lx / rx, ay = ly / ry, az = lz / rz, bx = ax / rx, by = ay / ry, bz = az / rz;
      const k0 = Math.sqrt(ax * ax + ay * ay + az * az);
      const k1 = Math.sqrt(bx * bx + by * by + bz * bz);
      if (k1 < 1e-9) return -Math.min(rx, ry, rz);
      return k0 * (k0 - 1) / k1;
    }
    case T_CONE: {
      const pax = (x - D[b + 9]) * D[b + 24], pay = (y - D[b + 10]) * D[b + 25], paz = (z - D[b + 11]) * D[b + 26], sqm = D[b + 27];
      const bax = D[b + 17], bay = D[b + 18], baz = D[b + 19], l2 = D[b + 20], rr = D[b + 21], a2 = D[b + 22], il2 = D[b + 23];
      const r1 = D[b + 15], r2 = D[b + 16];
      const yy = pax * bax + pay * bay + paz * baz;
      const zz = yy - l2;
      const qx = pax * l2 - bax * yy, qy = pay * l2 - bay * yy, qz = paz * l2 - baz * yy;
      const x2 = qx * qx + qy * qy + qz * qz;
      const y2 = yy * yy * l2, z2 = zz * zz * l2;
      const k = Math.sign(rr) * rr * rr * x2;
      if (Math.sign(zz) * a2 * z2 > k) return (Math.sqrt(x2 + z2) * il2 - r2) * sqm;
      if (Math.sign(yy) * a2 * y2 < k) return (Math.sqrt(x2 + y2) * il2 - r1) * sqm;
      return ((Math.sqrt(x2 * a2 * il2) + yy * rr) * il2 - r1) * sqm;
    }
    case T_BOX: {
      const px = x - D[b + 9], py = y - D[b + 10], pz = z - D[b + 11];
      const lx = D[b + 16] * px + D[b + 17] * py + D[b + 18] * pz;
      const ly = D[b + 19] * px + D[b + 20] * py + D[b + 21] * pz;
      const lz = D[b + 22] * px + D[b + 23] * py + D[b + 24] * pz;
      const r = D[b + 15];
      const qx = Math.abs(lx) - D[b + 12] + r, qy = Math.abs(ly) - D[b + 13] + r, qz = Math.abs(lz) - D[b + 14] + r;
      const ox = Math.max(qx, 0), oy = Math.max(qy, 0), oz = Math.max(qz, 0);
      return Math.sqrt(ox * ox + oy * oy + oz * oz) + Math.min(Math.max(qx, qy, qz), 0) - r;
    }
    case T_PLANE: return D[b + 9] * x + D[b + 10] * y + D[b + 11] * z - D[b + 12];
    case T_TORUS: {
      const px = x - D[b + 9], py = y - D[b + 10], pz = z - D[b + 11];
      const lx = D[b + 16] * px + D[b + 17] * py + D[b + 18] * pz;
      const ly = D[b + 19] * px + D[b + 20] * py + D[b + 21] * pz;
      const lz = D[b + 22] * px + D[b + 23] * py + D[b + 24] * pz;
      const q = Math.sqrt(lx * lx + lz * lz) - D[b + 12];
      return Math.sqrt(q * q + ly * ly) - D[b + 13];
    }
  }
  return 1e9;
}

/**
 * Narrow-band Surface Nets. fn(x,y,z) -> signed distance (negative inside).
 * Returns { pos: Float32Array, nrm: Float32Array, idx: Uint32Array }.
 * opts.refine: number of Newton projection steps (default 1). opts.lip: Lipschitz safety factor.
 */
export function surfaceNets(fn, bmin, bmax, h, opts = {}) {
  const pad = 2;
  const ox = bmin[0] - pad * h, oy = bmin[1] - pad * h, oz = bmin[2] - pad * h;
  const C = 8, F = 2, lip = opts.lip ?? 1.35;
  const nx = Math.ceil(((bmax[0] - bmin[0]) / h + 2 * pad) / C) * C + 1;
  const ny = Math.ceil(((bmax[1] - bmin[1]) / h + 2 * pad) / C) * C + 1;
  const nz = Math.ceil(((bmax[2] - bmin[2]) / h + 2 * pad) / C) * C + 1;
  const sxy = nx * ny;
  const val = new Float32Array(nx * ny * nz);
  const reachC = C * h * 0.87 * lip + h, reachF = F * h * 0.87 * lip + h * 0.5;
  const localR = C * h * 0.87 + reachF * 2 + h;
  const exact = [];      // fine blocks to evaluate exactly (min corner i,j,k)
  const blockFns = [];   // [start, end, fn] ranges of `exact` sharing a local evaluator
  const fill = (i0, j0, k0, n, v) => {
    for (let k = k0; k <= k0 + n; k++) for (let j = j0; j <= j0 + n; j++) { let id = k * sxy + j * nx + i0; for (let i = 0; i <= n; i++, id++) val[id] = v; }
  };
  for (let k0 = 0; k0 < nz - 1; k0 += C) for (let j0 = 0; j0 < ny - 1; j0 += C) for (let i0 = 0; i0 < nx - 1; i0 += C) {
    const cx = ox + (i0 + C / 2) * h, cy = oy + (j0 + C / 2) * h, cz = oz + (k0 + C / 2) * h;
    const dc = fn(cx, cy, cz);
    if (Math.abs(dc) > reachC) { fill(i0, j0, k0, C, dc > 0 ? C * h : -C * h); continue; }
    const lf = opts.near ? opts.near(cx, cy, cz, localR) : fn;
    const first = exact.length;
    for (let kk = k0; kk < k0 + C; kk += F) for (let jj = j0; jj < j0 + C; jj += F) for (let ii = i0; ii < i0 + C; ii += F) {
      const df = lf(ox + (ii + F / 2) * h, oy + (jj + F / 2) * h, oz + (kk + F / 2) * h);
      if (Math.abs(df) > reachF) fill(ii, jj, kk, F, df > 0 ? F * h : -F * h);
      else exact.push(ii, jj, kk);
    }
    if (exact.length > first) blockFns.push(first, exact.length, lf);
  }
  const done = new Uint8Array(nx * ny * nz);
  for (let r = 0; r < blockFns.length; r += 3) {
    const lf = blockFns[r + 2];
    for (let q = blockFns[r]; q < blockFns[r + 1]; q += 3) {
      const i0 = exact[q], j0 = exact[q + 1], k0 = exact[q + 2];
      for (let k = k0; k <= k0 + F; k++) for (let j = j0; j <= j0 + F; j++) {
        let id = k * sxy + j * nx + i0;
        for (let i = i0; i <= i0 + F; i++, id++) { if (done[id]) continue; done[id] = 1; val[id] = lf(ox + i * h, oy + j * h, oz + k * h); }
      }
    }
  }
  // vertices: only cells inside exact fine blocks can straddle the surface
  const cellV = new Map();
  const P = [], VC = [];
  const eo = [[0, 1], [2, 3], [4, 5], [6, 7], [0, 2], [1, 3], [4, 6], [5, 7], [0, 4], [1, 5], [2, 6], [3, 7]];
  const cof = [[0, 0, 0], [1, 0, 0], [0, 1, 0], [1, 1, 0], [0, 0, 1], [1, 0, 1], [0, 1, 1], [1, 1, 1]];
  const coff = cof.map(c => c[0] + c[1] * nx + c[2] * sxy);
  const cv = new Float32Array(8);
  for (let q = 0; q < exact.length; q += 3) {
    const i0 = exact[q], j0 = exact[q + 1], k0 = exact[q + 2];
    for (let k = k0; k < k0 + F; k++) for (let j = j0; j < j0 + F; j++) for (let i = i0; i < i0 + F; i++) {
      const id = k * sxy + j * nx + i;
      let mask = 0;
      for (let c = 0; c < 8; c++) { const v = val[id + coff[c]]; cv[c] = v; if (v < 0) mask |= 1 << c; }
      if (mask === 0 || mask === 255) continue;
      let sx = 0, sy = 0, sz = 0, cnt = 0;
      for (let e = 0; e < 12; e++) {
        const a = eo[e][0], b = eo[e][1];
        const va = cv[a], vb = cv[b];
        if ((va < 0) === (vb < 0)) continue;
        const t = va / (va - vb);
        sx += cof[a][0] + (cof[b][0] - cof[a][0]) * t;
        sy += cof[a][1] + (cof[b][1] - cof[a][1]) * t;
        sz += cof[a][2] + (cof[b][2] - cof[a][2]) * t;
        cnt++;
      }
      cellV.set(id, P.length / 3);
      VC.push(i, j, k);
      P.push(ox + (i + sx / cnt) * h, oy + (j + sy / cnt) * h, oz + (k + sz / cnt) * h);
    }
  }
  const I = [];
  const cidx = (i, j, k) => { const v = cellV.get(k * sxy + j * nx + i); return v === undefined ? -1 : v; };
  const quad = (a, b, c, d, flip) => {
    if (a < 0 || b < 0 || c < 0 || d < 0) return;
    if (flip) { const t = b; b = d; d = t; }
    const dac = dist2(P, a, c), dbd = dist2(P, b, d);
    if (dac < dbd) I.push(a, b, c, a, c, d); else I.push(a, b, d, b, c, d);
  };
  for (let q = 0; q < VC.length; q += 3) {
    const i = VC[q], j = VC[q + 1], k = VC[q + 2];
    const id = k * sxy + j * nx + i; const s0 = val[id] < 0;
    if (j > 0 && k > 0 && (val[id + 1] < 0) !== s0) quad(cidx(i, j - 1, k - 1), cidx(i, j, k - 1), cidx(i, j, k), cidx(i, j - 1, k), !s0);
    if (i > 0 && k > 0 && (val[id + nx] < 0) !== s0) quad(cidx(i - 1, j, k - 1), cidx(i - 1, j, k), cidx(i, j, k), cidx(i, j, k - 1), !s0);
    if (i > 0 && j > 0 && (val[id + sxy] < 0) !== s0) quad(cidx(i - 1, j - 1, k), cidx(i, j - 1, k), cidx(i, j, k), cidx(i - 1, j, k), !s0);
  }
  const pos = new Float32Array(P), nrm = new Float32Array(P.length);
  if ((opts.refine ?? 1) >= 0) refineVerts(fn, pos, nrm, h, opts.refine ?? 1);
  return { pos, nrm, idx: new Uint32Array(I) };
}
function dist2(P, a, b) { const dx = P[a * 3] - P[b * 3], dy = P[a * 3 + 1] - P[b * 3 + 1], dz = P[a * 3 + 2] - P[b * 3 + 2]; return dx * dx + dy * dy + dz * dz; }

/** Newton-project vertices onto the zero set and compute gradient normals. */
export function refineVerts(fn, pos, nrm, h, steps = 1) {
  const e = h * 0.25;
  const n = pos.length / 3;
  for (let v = 0; v < n; v++) {
    let x = pos[v * 3], y = pos[v * 3 + 1], z = pos[v * 3 + 2];
    let gx = 0, gy = 0, gz = 0;
    for (let s = 0; s <= steps; s++) {
      const a = fn(x + e, y - e, z - e), b = fn(x - e, y - e, z + e), c = fn(x - e, y + e, z - e), d = fn(x + e, y + e, z + e);
      gx = a - b - c + d; gy = -a - b + c + d; gz = -a + b - c + d;
      const gl = Math.hypot(gx, gy, gz) || 1;
      gx /= gl; gy /= gl; gz /= gl;
      if (s < steps) {
        const f = fn(x, y, z);
        const step = Math.max(-h * 0.6, Math.min(h * 0.6, f));
        x -= gx * step; y -= gy * step; z -= gz * step;
      }
    }
    pos[v * 3] = x; pos[v * 3 + 1] = y; pos[v * 3 + 2] = z;
    nrm[v * 3] = gx; nrm[v * 3 + 1] = gy; nrm[v * 3 + 2] = gz;
  }
}

/** SDF ambient occlusion at p along n. */
export function sdfAO(fn, x, y, z, nx, ny, nz, step = 0.02, strength = 1) {
  let occ = 0, w = 1;
  for (let i = 1; i <= 5; i++) {
    const t = step * i;
    const d = fn(x + nx * t, y + ny * t, z + nz * t);
    occ += (t - d) * w; w *= 0.55;
  }
  return Math.max(0, Math.min(1, 1 - occ * strength / step * 0.35));
}

/** March from far outside toward the origin point along dir; return first hit radius (or fallback). */
export function marchIn(fn, ox, oy, oz, dx, dy, dz, rMax, eps = 0.0015) {
  let r = rMax;
  for (let i = 0; i < 64; i++) {
    const d = fn(ox + dx * r, oy + dy * r, oz + dz * r);
    if (d < eps) return r;
    r -= Math.max(d * 0.9, eps * 0.5);
    if (r <= 0) return 0;
  }
  return r;
}
