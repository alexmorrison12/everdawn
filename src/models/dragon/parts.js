// Hard-surface pieces: lofted horns / spikes / claws / teeth, eyes, faceted crystals, fins and
// SDF-conforming belly plates. All generators return raw { pos, nrm, uv, idx, count, t } arrays
// (t = per-vertex param along the piece, 0 base → 1 tip) in model space.

const norm = (v) => { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const addS = (a, b, s) => [a[0] + b[0] * s, a[1] + b[1] * s, a[2] + b[2] * s];
export const V = { norm, cross, dot, addS };

/** Quadratic/cubic Bezier sampled into n+1 points. ctrl: array of 3 or 4 points. */
export function bezier(ctrl, n) {
  const out = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n, u = 1 - t;
    let p;
    if (ctrl.length === 3) {
      const a = u * u, b = 2 * u * t, c = t * t;
      p = [0, 1, 2].map(k => a * ctrl[0][k] + b * ctrl[1][k] + c * ctrl[2][k]);
    } else {
      const a = u * u * u, b = 3 * u * u * t, c = 3 * u * t * t, d = t * t * t;
      p = [0, 1, 2].map(k => a * ctrl[0][k] + b * ctrl[1][k] + c * ctrl[2][k] + d * ctrl[3][k]);
    }
    out.push(p);
  }
  return out;
}

/**
 * Loft a cross-section along a path with parallel-transport frames.
 * sec(t, i) → [rx, ry] half sizes (side, up) at ring i; optional shape(a) → [cx, cy] unit profile (default circle).
 * up0 = initial "up" (ry direction). Tip closed with a single vertex when the last radius is ~0.
 */
export function loft(path, radial, sec, up0 = [0, 1, 0], shape = null, twist = null) {
  const n = path.length;
  const pos = [], uv = [], tt = [], idx = [];
  let up = null;
  const L = [0];
  for (let i = 1; i < n; i++) L.push(L[i - 1] + Math.hypot(path[i][0] - path[i - 1][0], path[i][1] - path[i - 1][1], path[i][2] - path[i - 1][2]));
  const total = L[n - 1] || 1;
  const rings = [];
  for (let i = 0; i < n; i++) {
    const a = path[Math.max(0, i - 1)], b = path[Math.min(n - 1, i + 1)];
    const T = norm([b[0] - a[0], b[1] - a[1], b[2] - a[2]]);
    if (!up) { up = norm(addS(up0, T, -dot(up0, T))); if (!isFinite(up[0])) up = norm(cross(T, [1, 0, 0])); }
    else { up = norm(addS(up, T, -dot(up, T))); }
    let side = cross(up, T);
    let u2 = up;
    const t = L[i] / total;
    if (twist) { const ang = twist(t); const c = Math.cos(ang), s = Math.sin(ang); const s2 = addS(mulv(side, c), up, s); u2 = addS(mulv(up, c), side, -s); side = s2; }
    const [rx, ry] = sec(t, i);
    const tip = i === n - 1 && rx < 1e-4 && ry < 1e-4;
    rings.push(pos.length / 3);
    if (tip) { pos.push(path[i][0], path[i][1], path[i][2]); uv.push(0.5, 1); tt.push(1); continue; }
    for (let r = 0; r <= radial; r++) {
      const ang = r / radial * Math.PI * 2;
      let cx = Math.cos(ang), cy = Math.sin(ang);
      if (shape) [cx, cy] = shape(ang, t);
      const p = path[i];
      pos.push(p[0] + side[0] * cx * rx + u2[0] * cy * ry, p[1] + side[1] * cx * rx + u2[1] * cy * ry, p[2] + side[2] * cx * rx + u2[2] * cy * ry);
      uv.push(r / radial, t); tt.push(t);
    }
  }
  for (let i = 0; i < n - 1; i++) {
    const a0 = rings[i], b0 = rings[i + 1];
    const tipNext = (i + 1 === n - 1) && (pos.length / 3 - b0 === 1);
    for (let r = 0; r < radial; r++) {
      if (tipNext) { idx.push(a0 + r, a0 + r + 1, b0); continue; }
      idx.push(a0 + r, a0 + r + 1, b0 + r, a0 + r + 1, b0 + r + 1, b0 + r);
    }
  }
  const m = finish(pos, uv, idx, tt);
  weldSeamNormals(m, rings, radial);
  return m;
}
const mulv = (a, s) => [a[0] * s, a[1] * s, a[2] * s];

function weldSeamNormals(m, rings, radial) {
  for (const r0 of rings) {
    const a = r0, b = r0 + radial;
    if (b * 3 + 2 >= m.nrm.length) continue;
    for (let k = 0; k < 3; k++) { const v = (m.nrm[a * 3 + k] + m.nrm[b * 3 + k]) * 0.5; m.nrm[a * 3 + k] = v; m.nrm[b * 3 + k] = v; }
    const l = Math.hypot(m.nrm[a * 3], m.nrm[a * 3 + 1], m.nrm[a * 3 + 2]) || 1;
    for (let k = 0; k < 3; k++) { m.nrm[a * 3 + k] /= l; m.nrm[b * 3 + k] = m.nrm[a * 3 + k]; }
  }
}

/** Build typed arrays + smooth face-accumulated normals. */
export function finish(pos, uv, idx, tt, flat = false) {
  if (flat) {
    // unweld: every triangle gets its own vertices
    const P = [], U = [], T = [], I = [];
    for (let i = 0; i < idx.length; i++) {
      const v = idx[i]; P.push(pos[v * 3], pos[v * 3 + 1], pos[v * 3 + 2]); U.push(uv[v * 2], uv[v * 2 + 1]); T.push(tt[v]); I.push(i);
    }
    pos = P; uv = U; tt = T; idx = I;
  }
  const count = pos.length / 3;
  const nrm = new Float32Array(count * 3);
  for (let i = 0; i < idx.length; i += 3) {
    const a = idx[i], b = idx[i + 1], c = idx[i + 2];
    const ux = pos[b * 3] - pos[a * 3], uy = pos[b * 3 + 1] - pos[a * 3 + 1], uz = pos[b * 3 + 2] - pos[a * 3 + 2];
    const vx = pos[c * 3] - pos[a * 3], vy = pos[c * 3 + 1] - pos[a * 3 + 1], vz = pos[c * 3 + 2] - pos[a * 3 + 2];
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    for (const v of [a, b, c]) { nrm[v * 3] += nx; nrm[v * 3 + 1] += ny; nrm[v * 3 + 2] += nz; }
  }
  for (let i = 0; i < count; i++) {
    const l = Math.hypot(nrm[i * 3], nrm[i * 3 + 1], nrm[i * 3 + 2]) || 1;
    nrm[i * 3] /= l; nrm[i * 3 + 1] /= l; nrm[i * 3 + 2] /= l;
  }
  return { pos: new Float32Array(pos), nrm, uv: new Float32Array(uv), idx: new Uint32Array(idx), count, t: new Float32Array(tt) };
}

/** A curved cone ("horn") from base along dir, bending towards bendDir by `bend` radians over its length. */
export function hornPath(base, dir, length, bendAxis, bend, segs = 10, extra = null) {
  const pts = [];
  let d = norm(dir), p = base.slice();
  const ax = norm(bendAxis);
  const ds = length / segs;
  for (let i = 0; i <= segs; i++) {
    pts.push(extra ? addS(p, extra(i / segs), 1) : p.slice());
    p = addS(p, d, ds);
    d = rotate(d, ax, bend / segs);
  }
  return pts;
}
export function rotate(v, axis, a) {
  const c = Math.cos(a), s = Math.sin(a), k = axis;
  const kv = cross(k, v), kd = dot(k, v);
  return [v[0] * c + kv[0] * s + k[0] * kd * (1 - c), v[1] * c + kv[1] * s + k[1] * kd * (1 - c), v[2] * c + kv[2] * s + k[2] * kd * (1 - c)];
}

/** Standard tapered cone section: r0 at base → 0 at tip, with optional growth-ring ridges and flattening. */
export function taper(r0, { pow = 0.85, flat = 1, ridges = 0, ridgeAmp = 0.06, bulge = 0 } = {}) {
  return (t) => {
    let r = r0 * Math.pow(1 - t, pow) * (1 + bulge * Math.sin(t * Math.PI));
    if (ridges) r *= 1 + ridgeAmp * Math.pow(Math.max(0, Math.sin(t * Math.PI * 2 * ridges)), 4);
    return [r * flat, r];
  };
}

/** UV sphere (eye) centred at c, radius r, "front" pole along look (uv = planar projection facing look). */
export function eyeball(c, r, look, up = [0, 1, 0], seg = 14) {
  const L = norm(look), R = norm(cross(up, L)), U = cross(L, R);
  const pos = [], uv = [], idx = [], tt = [];
  const rows = seg, cols = seg;
  for (let i = 0; i <= rows; i++) {
    const th = i / rows * Math.PI; // 0 at front pole
    for (let j = 0; j <= cols; j++) {
      const ph = j / cols * Math.PI * 2;
      const lx = Math.sin(th) * Math.cos(ph), ly = Math.sin(th) * Math.sin(ph), lz = Math.cos(th);
      pos.push(c[0] + (R[0] * lx + U[0] * ly + L[0] * lz) * r, c[1] + (R[1] * lx + U[1] * ly + L[1] * lz) * r, c[2] + (R[2] * lx + U[2] * ly + L[2] * lz) * r);
      uv.push(lx * 0.5 + 0.5, ly * 0.5 + 0.5); tt.push(lz);
    }
  }
  for (let i = 0; i < rows; i++) for (let j = 0; j < cols; j++) {
    const a = i * (cols + 1) + j, b = a + cols + 1;
    idx.push(a, b, a + 1, a + 1, b, b + 1);
  }
  return finish(pos, uv, idx, tt);
}

/** Faceted crystal: n-gon prism with pyramidal tip, flat shaded. */
export function crystal(base, dir, length, radius, sides = 6, rot = 0, tipFrac = 0.3) {
  const T = norm(dir);
  let U = norm(cross(T, Math.abs(T[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0]));
  const Sd = cross(T, U);
  const pos = [], uv = [], idx = [], tt = [];
  const ring = (h, r) => {
    const o = pos.length / 3;
    for (let i = 0; i < sides; i++) {
      const a = rot + i / sides * Math.PI * 2;
      const q = addS(addS(addS(base, T, h), U, Math.cos(a) * r), Sd, Math.sin(a) * r);
      pos.push(...q); uv.push(i / sides, h / length); tt.push(h / length);
    }
    return o;
  };
  const r0 = ring(-radius * 0.3, radius * 0.9), r1 = ring(length * (1 - tipFrac), radius);
  const tip = pos.length / 3; pos.push(...addS(base, T, length)); uv.push(0.5, 1); tt.push(1);
  for (let i = 0; i < sides; i++) {
    const j = (i + 1) % sides;
    idx.push(r0 + i, r0 + j, r1 + i, r0 + j, r1 + j, r1 + i);
    idx.push(r1 + i, r1 + j, tip);
  }
  return finish(pos, uv, idx, tt, true);
}

/** Thin double-sided fin / frill: fan of spines from base points to tip points, as a thin closed shell. */
export function fin(basePts, tipPts, thick, normalHint, cols = 4) {
  // grid: rows along the base line (i), columns from base to tip (j)
  const nI = basePts.length, pos = [], uv = [], idx = [], tt = [];
  const N = norm(normalHint);
  for (const sgn of [1, -1]) {
    const o = pos.length / 3;
    for (let i = 0; i < nI; i++) for (let j = 0; j <= cols; j++) {
      const t = j / cols;
      const p = [0, 1, 2].map(k => basePts[i][k] + (tipPts[i][k] - basePts[i][k]) * t);
      const th = thick * (1 - t * 0.85) * sgn;
      pos.push(p[0] + N[0] * th, p[1] + N[1] * th, p[2] + N[2] * th); uv.push(i / (nI - 1), t); tt.push(t);
    }
    for (let i = 0; i < nI - 1; i++) for (let j = 0; j < cols; j++) {
      const a = o + i * (cols + 1) + j, b = a + cols + 1;
      if (sgn > 0) idx.push(a, b, a + 1, a + 1, b, b + 1); else idx.push(a, a + 1, b, a + 1, b + 1, b);
    }
  }
  return finish(pos, uv, idx, tt);
}

/**
 * Belly plate conforming to an SDF surface. c = centre on the body axis, T = axis tangent (towards tail), U = local up.
 * halfLen along T, arc = ±angle around -U. Built as a shingle: tucked front edge, raised back lip.
 */
export function bellyPlate(sdf, c, T, U, halfLen, arc, thick, cols = 8) {
  const Sd = norm(cross(T, U));
  const rows = [
    { f: -1.0, off: -0.35 }, { f: -0.55, off: 0.55 }, { f: 0.0, off: 0.9 }, { f: 0.55, off: 1.0 }, { f: 0.92, off: 0.95 }, { f: 1.05, off: -0.2 },
  ];
  const pos = [], uv = [], idx = [], tt = [];
  for (let r = 0; r < rows.length; r++) {
    const o = addS(c, T, rows[r].f * halfLen);
    for (let j = 0; j <= cols; j++) {
      const u = j / cols, a = (u * 2 - 1) * arc;
      const d = norm(addS(mulv(U, -Math.cos(a)), Sd, Math.sin(a)));
      let hit = sdf.raycastOut(o[0], o[1], o[2], d[0], d[1], d[2], 8, 0.01);
      if (hit < 0) hit = 0.5;
      const edge = Math.pow(Math.abs(u * 2 - 1), 3);           // lateral edges sink into the skin
      const off = thick * (rows[r].off * (1 - edge) - edge * 0.5);
      const p = addS(o, d, hit + off);
      pos.push(...p); uv.push(u, r / (rows.length - 1)); tt.push(1 - edge);
    }
  }
  for (let r = 0; r < rows.length - 1; r++) for (let j = 0; j < cols; j++) {
    const a = r * (cols + 1) + j, b = a + cols + 1;
    idx.push(a, b, a + 1, a + 1, b, b + 1);
  }
  return finish(pos, uv, idx, tt);
}
