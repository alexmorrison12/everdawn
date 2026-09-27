// Bakes the Everdawn Vale height field (1 m grid) plus ground-cover masks used by the terrain shader,
// vegetation scattering and the minimap. CPU queries: heightAt / normalAt / slopeAt / maskAt.
import { Simplex, smoothstep, lerp, clamp, catmull, distSeg2 } from '../core/noise.js';
import { MAP, PLACES, RIDGE, ROADS, WATER_Y } from './zone.js';

const N = MAP.size;          // cells per side
const S = N + 1;             // samples per side
const H = MAP.half;

// mask channels (Uint8, 0..255), one byte per sample per channel
export const M = { ROAD: 0, FARM: 1, COBBLE: 2, FOREST: 3, SAND: 4, ASH: 5, WEB: 6, MEADOW: 7 };
const NM = 8;

const yieldFrame = () => new Promise(r => setTimeout(r, 0));

export class Heightfield {
  constructor(seed = 7) {
    this.noise = new Simplex(seed);
    this.n2 = new Simplex(seed + 101);
    this.h = new Float32Array(S * S);
    this.mask = new Uint8Array(S * S * NM);
    this.roadLines = ROADS.map(r => ({ w: r.w, pts: catmull(r.pts, 10) }));
    this.ridgeLine = catmull(RIDGE, 8);
  }

  // ---------- analytic pieces ----------
  ridgeSigned(x, z) {
    // signed distance to the ridge polyline: positive = north side
    if (z < -215) return { d: 100, ends: x < -300 || x > 40 };
    if (z > -45) return { d: -100, ends: x < -300 || x > 40 };
    let best = 1e9, sgn = 1;
    const L = this.ridgeLine;
    for (let i = 0; i < L.length - 1; i++) {
      const [ax, az] = L[i], [bx, bz] = L[i + 1];
      const d = distSeg2(x, z, ax, az, bx, bz);
      if (d < best) {
        best = d;
        const cross = (bx - ax) * (z - az) - (bz - az) * (x - ax);
        sgn = cross < 0 ? 1 : -1; // line runs west→east; north (-z) is left of travel
      }
    }
    const ends = x < L[0][0] - 30 || x > L[L.length - 1][0] + 30;
    return { d: best * sgn, ends };
  }

  rawHeight(x, z) {
    const n = this.noise, n2 = this.n2;
    // rolling valley floor
    let h = 5.5 + n.fbm2(x / 150, z / 150, 4) * 6.5 + n.fbm2(x / 38, z / 38, 3) * 1.4;

    // valley walls: massive rounded mountains (domain-warped), lower in the north so Ember Peak dominates
    const r = Math.sqrt((x / 300) ** 2 + (z / 312) ** 2) + n.noise2(x / 95, z / 95) * 0.07;
    const wall = smoothstep(0.84, 1.3, r);
    this._wall = wall;
    if (wall > 0) {
      const north = smoothstep(0.25, 0.8, -z / (Math.hypot(x, z) + 1e-3)) * smoothstep(420, 260, Math.hypot(x, z + 380));
      const wx = x + n.noise2(x / 190, z / 190) * 70, wz = z + n.noise2(x / 190 + 5.2, z / 190 - 3.1) * 70;
      const mass = n2.fbm2(wx / 230, wz / 230, 3) * 0.5 + 0.5;
      const rid = n2.ridged2(wx / 140, wz / 140, 3);
      const detail = n.fbm2(x / 48, z / 48, 3);
      let mh = 38 + mass * 95 + rid * rid * 45 + detail * 7;
      mh *= 1 - north * 0.62;
      h += Math.pow(wall, 1.7) * mh;
    }

    // Ember Peak volcano with crater
    const pk = PLACES.peak;
    const dp = Math.hypot(x - pk.x, z - pk.z);
    if (dp < 230) {
      const t = 1 - dp / 230;
      const a = Math.atan2(z - pk.z, x - pk.x);
      const gul = 0.84 + 0.16 * n2.ridged2(Math.cos(a) * 2.5 + dp / 60, Math.sin(a) * 2.5, 3);
      const cone = Math.pow(t, 1.35) * 0.75 + Math.pow(t, 3.2) * 0.35;
      h += pk.h * cone * gul;
      if (dp < 38) h -= (1 - dp / 38) ** 1.25 * 70; // crater bowl
    }

    // Candlerock cliffs: plateau north of the ridge line, sharp step at the line
    const rs = this.ridgeSigned(x, z);
    if (!rs.ends) {
      const taper = smoothstep(18, -26, x) * smoothstep(-300, -240, x);
      const jag = n.noise2(x / 14, z / 14) * 3.5 + n.noise2(x / 5, z / 5) * 0.8;
      const step = smoothstep(-3, 7, rs.d + jag);
      h += step * taper * (25 + n.fbm2(x / 60, z / 60, 3) * 6);
      // talus shelf at the foot
      h += smoothstep(-16, -2, rs.d) * (1 - step) * taper * 2.5;
    }

    // no stray puddles: dry land stays above the waterline outside the lake/pool
    h = Math.max(h, 0.6);
    // Mirrormere basin
    const L = PLACES.lake;
    const dl = Math.sqrt(((x - L.x) / L.rx) ** 2 + ((z - L.z) / L.rz) ** 2) + n.noise2(x / 40, z / 40) * 0.1;
    const lf = 1 - smoothstep(0.72, 1.22, dl);
    if (lf > 0) h = lerp(h, -5.2 + dl * 4.6, lf);
    // plunge pool under the waterfall, feeding the lake
    const WF = PLACES.waterfall;
    const dpool = Math.hypot((x - WF.x) * 0.8, z - WF.z - 9);
    if (dpool < 26) h = lerp(h, -3.2, 1 - smoothstep(9, 24, dpool));

    // Webwood hollow: a shallow bowl (never below the water line)
    const W = PLACES.webwood;
    const dw = Math.hypot(x - W.x, z - W.z);
    const bowl = 1 - smoothstep(10, W.r + 10, dw);
    if (bowl > 0) h = Math.max(h - 6 * bowl, lerp(h, 1.6, bowl));

    // Redcloak ruins: a flat-topped knoll
    const R = PLACES.ruins;
    const dr = Math.hypot(x - R.x, z - R.z);
    h = lerp(h, 12.5 + n.noise2(x / 20, z / 20) * 0.4, 1 - smoothstep(R.r * 0.55, R.r * 1.25, dr));

    // Dawnhollow: flatten
    const V = PLACES.village;
    const dv = Math.hypot(x - V.x, z - V.z);
    h = lerp(h, V.h + n.noise2(x / 25, z / 25) * 0.5, 1 - smoothstep(V.r * 0.72, V.r * 1.3, dv));

    // Goldfield: calm the detail noise
    const F = PLACES.farms;
    const df = Math.hypot(x - F.x, z - F.z);
    const ff = 1 - smoothstep(F.r * 0.6, F.r * 1.2, df);
    if (ff > 0) h = lerp(h, 5.2 + n.fbm2(x / 150, z / 150, 2) * 3, ff * 0.8);

    // Portal plateau
    const P = PLACES.portal;
    const dpp = Math.hypot(x - P.x, z - P.z);
    h = lerp(h, P.h, 1 - smoothstep(20, 34, dpp));
    return h;
  }

  // ---------- bake ----------
  async build(onProgress = () => {}) {
    const h = this.h;
    const wallW = new Float32Array(S * S);
    for (let j = 0; j < S; j++) {
      const z = j - H;
      for (let i = 0; i < S; i++) { h[j * S + i] = this.rawHeight(i - H, z); wallW[j * S + i] = this._wall; }
      if ((j & 63) === 0) { onProgress(j / S * 0.6); await yieldFrame(); }
    }
    // soften the mountains (the 1 m grid makes ridged noise needle-like)
    const soft = boxBlur(h, S, 3);
    for (let k = 0; k < S * S; k++) if (wallW[k] > 0) h[k] = lerp(h[k], soft[k], Math.min(1, wallW[k] * 1.5) * 0.85);
    // roads: flatten toward a blurred copy of the terrain
    const blur = boxBlur(h, S, 5);
    const road = new Float32Array(S * S);
    for (const rl of this.roadLines) rasterPolyline(road, rl.pts, rl.w * 0.5, rl.w * 0.5 + 3.5);
    for (let k = 0; k < S * S; k++) if (road[k] > 0) h[k] = lerp(h[k], blur[k] - 0.12 * road[k], smoothstep(0, 1, road[k]));
    onProgress(0.7); await yieldFrame();
    this.bakeMasks(road);
    onProgress(0.95); await yieldFrame();
    this.minH = Infinity; this.maxH = -Infinity;
    for (let k = 0; k < S * S; k++) { if (h[k] < this.minH) this.minH = h[k]; if (h[k] > this.maxH) this.maxH = h[k]; }
    onProgress(1);
  }

  bakeMasks(road) {
    const m = this.mask, n = this.noise, n2 = this.n2;
    const set = (k, c, v) => { m[k * NM + c] = clamp(Math.round(v * 255), 0, 255); };
    const V = PLACES.village, F = PLACES.farms, W = PLACES.webwood, P = PLACES.peak, L = PLACES.lake, R = PLACES.ruins;
    // farm fields: rotated rectangles
    this.fields = [
      { x: -170, z: 72, w: 44, l: 30, a: 0 }, { x: -118, z: 76, w: 34, l: 26, a: 0 },
      { x: -192, z: 130, w: 38, l: 30, a: 0 }, { x: -140, z: 138, w: 40, l: 24, a: 0 },
      { x: -92, z: 100, w: 22, l: 20, a: 0 },
    ];
    for (let j = 0; j < S; j++) {
      const z = j - H;
      for (let i = 0; i < S; i++) {
        const x = i - H, k = j * S + i, hh = this.h[k];
        set(k, M.ROAD, road[k]);
        // fields
        let fv = 0;
        if (Math.abs(x - F.x) < 110 && Math.abs(z - F.z) < 100) {
          const jit = n.noise2(x / 6, z / 6) * 1.2;
          for (const f of this.fields) {
            const c = Math.cos(f.a), s = Math.sin(f.a);
            const lx = (x - f.x) * c - (z - f.z) * s, lz = (x - f.x) * s + (z - f.z) * c;
            const e = Math.max(Math.abs(lx) - f.w * 0.5, Math.abs(lz) - f.l * 0.5);
            fv = Math.max(fv, smoothstep(1.5, -1.5, e + jit));
          }
        }
        set(k, M.FARM, fv * (1 - road[k]));
        // cobble: village square + lanes
        const dv = Math.hypot(x - V.x, z - V.z);
        const cob = Math.max(smoothstep(15, 12, dv + n.noise2(x / 3, z / 3) * 1.5), smoothstep(0.3, 0.9, road[k]) * smoothstep(40, 26, dv));
        set(k, M.COBBLE, cob);
        // forest floor
        const fd = forestDensity(x, z, n2);
        set(k, M.FOREST, fd * (1 - road[k]) * (1 - fv));
        // shore sand
        const dl = Math.sqrt(((x - L.x) / L.rx) ** 2 + ((z - L.z) / L.rz) ** 2);
        const sand = smoothstep(2.3, 0.4, hh - WATER_Y + n.noise2(x / 9, z / 9) * 0.8) * smoothstep(1.5, 1.05, dl);
        set(k, M.SAND, sand);
        // volcanic ash
        const dp = Math.hypot(x - P.x, z - P.z);
        set(k, M.ASH, smoothstep(185, 120, dp + n.noise2(x / 30, z / 30) * 25));
        // webwood blight
        const dw = Math.hypot(x - W.x, z - W.z);
        set(k, M.WEB, smoothstep(W.r + 12, W.r - 18, dw + n.noise2(x / 18, z / 18) * 10));
        // meadow flower patches (+ ruins dirt through A as well is handled in shader)
        const meadow = smoothstep(0.35, 0.75, n2.noise2(x / 45, z / 45)) * (1 - fd) * (1 - road[k]) * (1 - fv);
        set(k, M.MEADOW, meadow * smoothstep(0.2, 1.0, 1 - Math.hypot(x - R.x, z - R.z) / 400));
      }
    }
  }

  // ---------- queries ----------
  heightAt(x, z) {
    const fx = clamp(x + H, 0, N - 0.001), fz = clamp(z + H, 0, N - 0.001);
    const i = fx | 0, j = fz | 0, tx = fx - i, tz = fz - j;
    const k = j * S + i, h = this.h;
    const a = h[k], b = h[k + 1], c = h[k + S], d = h[k + S + 1];
    // triangle interpolation matching the mesh split (diagonal from (0,0) to (1,1))
    if (tx > tz) return a + (b - a) * tx + (d - b) * tz;
    return a + (d - c) * tx + (c - a) * tz;
  }
  normalAt(x, z, out = [0, 1, 0]) {
    const e = 1;
    const hx = this.heightAt(x + e, z) - this.heightAt(x - e, z);
    const hz = this.heightAt(x, z + e) - this.heightAt(x, z - e);
    const l = Math.hypot(hx, 2 * e, hz);
    out[0] = -hx / l; out[1] = 2 * e / l; out[2] = -hz / l;
    return out;
  }
  slopeAt(x, z) { const nn = this.normalAt(x, z); return 1 - nn[1]; }
  maskAt(x, z, c) {
    const i = clamp(Math.round(x + H), 0, N), j = clamp(Math.round(z + H), 0, N);
    return this.mask[(j * S + i) * NM + c] / 255;
  }
  inBounds(x, z, margin = 0) { return Math.abs(x) < H - margin && Math.abs(z) < H - margin; }
}

export function forestDensity(x, z, n2) {
  const F = PLACES.forest, W = PLACES.webwood;
  let d = 0;
  d = Math.max(d, smoothstep(F.r + 30, F.r - 30, Math.hypot(x - F.x, z - F.z)));
  d = Math.max(d, smoothstep(W.r + 30, W.r - 10, Math.hypot(x - W.x, z - W.z)));
  // groves around the valley rim and between areas
  const g = n2.noise2(x / 70 + 13.1, z / 70 - 7.7);
  const rim = Math.sqrt((x / 300) ** 2 + (z / 312) ** 2);
  d = Math.max(d, smoothstep(0.25, 0.6, g) * smoothstep(0.55, 0.85, rim) * smoothstep(1.2, 1.0, rim));
  d = Math.max(d, smoothstep(0.45, 0.75, g) * 0.8);
  // keep clear areas clear
  const clearings = [PLACES.village, PLACES.farms, PLACES.ruins];
  for (const c of clearings) d *= smoothstep(c.r * 0.9, c.r * 1.35, Math.hypot(x - c.x, z - c.z));
  const L = PLACES.lake;
  d *= smoothstep(1.05, 1.3, Math.sqrt(((x - L.x) / L.rx) ** 2 + ((z - L.z) / L.rz) ** 2));
  d *= smoothstep(150, 200, Math.hypot(x - PLACES.peak.x, z - PLACES.peak.z));
  return clamp(d, 0, 1);
}

function boxBlur(src, S, r) {
  const tmp = new Float32Array(src.length), out = new Float32Array(src.length);
  const w = 2 * r + 1;
  for (let j = 0; j < S; j++) {
    let acc = 0;
    for (let i = -r; i <= r; i++) acc += src[j * S + clamp(i, 0, S - 1)];
    for (let i = 0; i < S; i++) {
      tmp[j * S + i] = acc / w;
      acc += src[j * S + clamp(i + r + 1, 0, S - 1)] - src[j * S + clamp(i - r, 0, S - 1)];
    }
  }
  for (let i = 0; i < S; i++) {
    let acc = 0;
    for (let j = -r; j <= r; j++) acc += tmp[clamp(j, 0, S - 1) * S + i];
    for (let j = 0; j < S; j++) {
      out[j * S + i] = acc / w;
      acc += tmp[clamp(j + r + 1, 0, S - 1) * S + i] - tmp[clamp(j - r, 0, S - 1) * S + i];
    }
  }
  return out;
}

// writes max(mask) of a thick polyline into a float grid: 1 inside r0, fading to 0 at r1
function rasterPolyline(grid, pts, r0, r1) {
  for (let s = 0; s < pts.length - 1; s++) {
    const [ax, az] = pts[s], [bx, bz] = pts[s + 1];
    const x0 = Math.floor(Math.min(ax, bx) - r1) + H, x1 = Math.ceil(Math.max(ax, bx) + r1) + H;
    const z0 = Math.floor(Math.min(az, bz) - r1) + H, z1 = Math.ceil(Math.max(az, bz) + r1) + H;
    for (let j = Math.max(0, z0); j <= Math.min(N, z1); j++) {
      for (let i = Math.max(0, x0); i <= Math.min(N, x1); i++) {
        const d = distSeg2(i - H, j - H, ax, az, bx, bz);
        const v = smoothstep(r1, r0, d);
        const k = j * S + i;
        if (v > grid[k]) grid[k] = v;
      }
    }
  }
}

export const HF_SAMPLES = S;
