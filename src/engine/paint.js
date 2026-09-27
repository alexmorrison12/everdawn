// Procedural "hand-painted" textures. Everything tiles seamlessly.
// Per-pixel work goes through a Float32 RGB buffer (linear-ish painting space, sRGB bytes on output).
import { RNG, Simplex, clamp, smoothstep, lerp } from '../core/noise.js';

export class Canvas {
  constructor(size) {
    this.size = size;
    this.px = new Float32Array(size * size * 3);
  }
  fill(c) { for (let i = 0; i < this.px.length; i += 3) { this.px[i] = c[0]; this.px[i + 1] = c[1]; this.px[i + 2] = c[2]; } return this; }
  get(x, y) { const s = this.size; x = ((x % s) + s) % s; y = ((y % s) + s) % s; const k = (y * s + x) * 3; return [this.px[k], this.px[k + 1], this.px[k + 2]]; }
  // blend colour c into pixel with alpha a (wrapping coordinates)
  blend(x, y, c, a) {
    const s = this.size; x = ((x % s) + s) % s; y = ((y % s) + s) % s;
    const k = (y * s + x) * 3, p = this.px;
    p[k] += (c[0] - p[k]) * a; p[k + 1] += (c[1] - p[k + 1]) * a; p[k + 2] += (c[2] - p[k + 2]) * a;
  }
  mul(x, y, f) {
    const s = this.size; x = ((x % s) + s) % s; y = ((y % s) + s) % s;
    const k = (y * s + x) * 3; this.px[k] *= f; this.px[k + 1] *= f; this.px[k + 2] *= f;
  }
  // soft round dab
  dab(cx, cy, r, c, a, hard = 0.3) {
    const r2 = r * r;
    for (let y = Math.floor(cy - r); y <= Math.ceil(cy + r); y++) {
      for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++) {
        const d2 = (x - cx) ** 2 + (y - cy) ** 2;
        if (d2 > r2) continue;
        const f = smoothstep(1, hard, Math.sqrt(d2) / r);
        this.blend(x, y, c, a * f);
      }
    }
  }
  // tapered stroke (blade / leaf) from (x0,y0) along angle with length, width
  stroke(x0, y0, ang, len, w0, w1, c, a, bend = 0) {
    const steps = Math.max(2, Math.ceil(len * 1.5));
    let x = x0, y = y0, dir = ang;
    for (let i = 0; i <= steps; i++) {
      const t = i / steps, w = lerp(w0, w1, t);
      this.dab(x, y, Math.max(0.6, w), c, a * (1 - t * 0.3), 0.55);
      dir += bend / steps; x += Math.cos(dir) * len / steps; y += Math.sin(dir) * len / steps;
    }
  }
  // per-pixel noise modulation (tileable via torus mapping of 4D-ish trick: sample 3D noise on a cylinder pair)
  modulate(noise, freq, amt, tint = null) {
    const s = this.size;
    for (let y = 0; y < s; y++) for (let x = 0; x < s; x++) {
      const v = tileNoise(noise, x / s, y / s, freq);
      const k = (y * s + x) * 3, f = 1 + v * amt;
      if (tint) { const t = clamp(v * 0.5 + 0.5, 0, 1); this.px[k] = lerp(this.px[k], tint[0], t * tint[3]) * f; this.px[k + 1] = lerp(this.px[k + 1], tint[1], t * tint[3]) * f; this.px[k + 2] = lerp(this.px[k + 2], tint[2], t * tint[3]) * f; }
      else { this.px[k] *= f; this.px[k + 1] *= f; this.px[k + 2] *= f; }
    }
    return this;
  }
  // bytes (sRGB-ish: we paint directly in display space)
  toRGBA(alpha = null) {
    const s = this.size, out = new Uint8Array(s * s * 4);
    for (let i = 0, j = 0; i < s * s; i++, j += 3) {
      out[i * 4] = clamp(this.px[j] * 255, 0, 255); out[i * 4 + 1] = clamp(this.px[j + 1] * 255, 0, 255); out[i * 4 + 2] = clamp(this.px[j + 2] * 255, 0, 255);
      out[i * 4 + 3] = alpha ? clamp(alpha[i] * 255, 0, 255) : 255;
    }
    return out;
  }
}

// Seamless noise: map (u,v) on a torus embedded in 3D-ish via two circles (uses noise3 with angle mapping)
export function tileNoise(noise, u, v, freq, oct = 3) {
  let s = 0, a = 1, n = 0, f = freq;
  for (let o = 0; o < oct; o++) {
    const au = u * Math.PI * 2, av = v * Math.PI * 2, R = f / (Math.PI * 2);
    // 3D noise on a (non-uniform) torus: good enough for seamless textures
    const x = Math.cos(au) * R, y = Math.sin(au) * R, z = Math.cos(av) * R + Math.sin(av) * R * 0.5 + o * 17.3;
    const w = Math.sin(av) * R;
    s += a * (noise.noise3(x, y + w * 0.7, z) ); n += a; a *= 0.5; f *= 2;
  }
  return s / n;
}

// Toroidal jittered-grid Voronoi: returns {d1, d2, id, cx, cy} for pixel (x,y) in a canvas of size s with `cells` per side
export function voronoi(x, y, s, cells, rng2) {
  const cs = s / cells;
  const gx = Math.floor(x / cs), gy = Math.floor(y / cs);
  let d1 = 1e9, d2 = 1e9, id = 0, cx = 0, cy = 0;
  for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) {
    const ix = gx + ox, iy = gy + oy;
    const wx = ((ix % cells) + cells) % cells, wy = ((iy % cells) + cells) % cells;
    const h = rng2(wx, wy);
    const px = (ix + 0.15 + 0.7 * h[0]) * cs, py = (iy + 0.15 + 0.7 * h[1]) * cs;
    const d = Math.hypot(px - x, py - y);
    if (d < d1) { d2 = d1; d1 = d; id = wy * cells + wx; cx = px; cy = py; } else if (d < d2) d2 = d;
  }
  return { d1, d2, id, cx, cy, cs };
}
const hh = (a, b, s) => { let h = Math.imul(a, 374761393) + Math.imul(b, 668265263) + s * 97; h = Math.imul(h ^ (h >>> 13), 1274126177); h ^= h >>> 16; return (h >>> 0) / 4294967296; };
const cellRand = seed => (x, y) => [hh(x, y, seed), hh(x, y, seed + 1), hh(x, y, seed + 2), hh(x, y, seed + 3)];

const C = (hex) => [((hex >> 16) & 255) / 255, ((hex >> 8) & 255) / 255, (hex & 255) / 255];
const mix3 = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
const jitter = (c, rng, amt) => { const f = 1 + (rng.next() - 0.5) * amt; return [c[0] * f, c[1] * f, c[2] * f]; };

// ---------------- terrain layers ----------------
export function paintGrass(size = 512, seed = 1) {
  const rng = new RNG(seed), nz = new Simplex(seed);
  const cv = new Canvas(size).fill(C(0x4a7e2a));
  cv.modulate(nz, 3, 0.2, [...C(0x6a8e30), 0.5]);
  // big soft colour blotches
  for (let i = 0; i < 90; i++) cv.dab(rng.range(0, size), rng.range(0, size), rng.range(20, 60), jitter(rng.pick([C(0x5c9a34), C(0x3f7a28), C(0x6fa03a), C(0x4a8230)]), rng, 0.2), 0.25, 0.0);
  // blades
  const greens = [C(0x70a23e), C(0x5a9234), C(0x3a6a24), C(0x84b04a), C(0x4a8030), C(0x9ab854), C(0x6a8a34)];
  for (let i = 0; i < 5200; i++) {
    const c = jitter(rng.pick(greens), rng, 0.25);
    cv.stroke(rng.range(0, size), rng.range(0, size), -Math.PI / 2 + rng.range(-0.7, 0.7), rng.range(5, 13), 1.3, 0.35, c, rng.range(0.35, 0.7), rng.range(-0.6, 0.6));
  }
  // dark gaps + clover specks
  for (let i = 0; i < 900; i++) cv.dab(rng.range(0, size), rng.range(0, size), rng.range(1, 2.5), C(0x2c5a1c), 0.35);
  for (let i = 0; i < 160; i++) { const x = rng.range(0, size), y = rng.range(0, size); for (let k = 0; k < 3; k++) cv.dab(x + rng.range(-3, 3), y + rng.range(-3, 3), 2.2, C(0x8ac04c), 0.6); }
  return cv;
}

export function paintDirt(size = 512, seed = 2) {
  const rng = new RNG(seed), nz = new Simplex(seed);
  const cv = new Canvas(size).fill(C(0x8a6a44));
  cv.modulate(nz, 4, 0.16, [...C(0x7a5a3a), 0.5]);
  for (let i = 0; i < 70; i++) cv.dab(rng.range(0, size), rng.range(0, size), rng.range(15, 45), jitter(rng.pick([C(0x96744a), C(0x7c5c3c), C(0xa0805a)]), rng, 0.2), 0.3, 0);
  // wheel-rut-ish streaks
  for (let i = 0; i < 260; i++) cv.stroke(rng.range(0, size), rng.range(0, size), rng.range(-0.3, 0.3), rng.range(10, 40), 1.4, 0.6, jitter(C(0x6e5034), rng, 0.2), 0.25);
  // pebbles
  for (let i = 0; i < 700; i++) {
    const x = rng.range(0, size), y = rng.range(0, size), r = rng.range(1.2, 4.2);
    const base = jitter(rng.pick([C(0xa89a86), C(0x8c7c68), C(0xb8a88e), C(0x7a6c5c)]), rng, 0.2);
    cv.dab(x + r * 0.35, y + r * 0.4, r * 1.05, C(0x4a3624), 0.45);   // shadow
    cv.dab(x, y, r, base, 0.95, 0.75);
    cv.dab(x - r * 0.3, y - r * 0.35, r * 0.45, mix3(base, [1, 1, 0.95], 0.45), 0.7);
  }
  return cv;
}

export function paintRock(size = 512, seed = 3) {
  const nz = new Simplex(seed), cr = cellRand(seed);
  const cv = new Canvas(size);
  const base = C(0x8c8478), dark = C(0x4a4640), light = C(0xc4bcac), moss = C(0x5a7a34);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    // blocks are squashed vertically (the pattern repeats twice per tile, so it still tiles): layered rock, not flagstones
    const v = voronoi(x, (y * 2) % size, size, 6, cr);
    const r = cr(v.id % 6, Math.floor(v.id / 6));
    // faceted shading: each cell is a tilted plane lit from top-left
    const nx = (r[0] - 0.5) * 1.6, ny = (r[1] - 0.5) * 1.6;
    const lx = (x - v.cx) / v.cs, ly = (y - v.cy) / v.cs;
    let shade = 0.78 + (-nx * 0.55 - ny * 0.45) * 0.35 + (-lx * nx - ly * ny) * 0.1;
    // sub-facets
    const v2 = voronoi(x + 1000, y + 1000, size, 19, cellRand(seed + 9));
    const r2 = cr(v2.id % 19 + 50, Math.floor(v2.id / 19));
    shade += (r2[0] - 0.5) * 0.14;
    // crevices
    // crevices come and go along each border instead of outlining every block
    const open = smoothstep(-0.2, 0.35, tileNoise(nz, x / size + 0.61, y / size, 5, 2));
    const edge = 1 - (1 - smoothstep(0, 5.5, v.d2 - v.d1)) * open, edge2 = smoothstep(0, 2.2, v2.d2 - v2.d1);
    let c = mix3(base, r[2] > 0.5 ? light : base, r[3] * 0.35);
    c = mix3(dark, c, edge);
    shade *= lerp(0.72, 1, edge2);
    // top highlight on crevice lips
    const lip = smoothstep(5.5, 3, v.d2 - v.d1) * smoothstep(0, 1.5, v.d2 - v.d1) * (ny < 0 ? 1 : 0.3);
    c = mix3(c, light, lip * 0.35);
    const n = tileNoise(nz, x / size, y / size, 6, 3);
    shade *= 1 + n * 0.12;
    // strata
    shade *= 1 + Math.sin((y + n * 30) / size * Math.PI * 2 * 9) * 0.09 + Math.sin((y + n * 12) / size * Math.PI * 2 * 23) * 0.035;
    // moss on "upward" facets
    const mossT = smoothstep(0.15, 0.55, -ny * 0.6 + tileNoise(nz, x / size + 0.37, y / size, 3, 2) * 0.8) * 0.55;
    c = mix3(c, moss, mossT * edge);
    const k = (y * size + x) * 3;
    cv.px[k] = c[0] * shade; cv.px[k + 1] = c[1] * shade; cv.px[k + 2] = c[2] * shade;
  }
  return cv;
}

export function paintFarmland(size = 512, seed = 4) {
  const rng = new RNG(seed), nz = new Simplex(seed);
  const cv = new Canvas(size).fill(C(0x6e4c2e));
  const rows = 16;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const n = tileNoise(nz, x / size, y / size, 5, 2);
    const ph = ((y + n * 6) / size * rows) % 1;
    const ridge = Math.sin(ph * Math.PI);           // 0 in furrow, 1 on ridge
    const k = (y * size + x) * 3;
    const lit = 0.72 + ridge * 0.42 - (ph > 0.5 ? 0.12 : 0) + n * 0.1;
    const c = mix3(C(0x4e331e), C(0x8a623c), ridge);
    cv.px[k] = c[0] * lit; cv.px[k + 1] = c[1] * lit; cv.px[k + 2] = c[2] * lit;
  }
  // clods + sprouts along ridges
  for (let i = 0; i < 800; i++) cv.dab(rng.range(0, size), rng.range(0, size), rng.range(1, 2.6), jitter(C(0x9a7048), rng, 0.3), 0.6, 0.6);
  for (let r = 0; r < rows; r++) {
    const y0 = (r + 0.5) / rows * size;
    for (let x = 0; x < size; x += rng.range(5, 11)) {
      const g = jitter(rng.pick([C(0x6aa83a), C(0x8cc04a), C(0x4e8a2c)]), rng, 0.2);
      for (let b = 0; b < 3; b++) cv.stroke(x, y0 + rng.range(-2, 2), -Math.PI / 2 + rng.range(-0.8, 0.8), rng.range(3, 6), 1.1, 0.4, g, 0.9);
    }
  }
  return cv;
}

export function paintCobble(size = 512, seed = 5) {
  const nz = new Simplex(seed), cr = cellRand(seed);
  const cv = new Canvas(size);
  const grout = C(0x4a4238);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const v = voronoi(x, y, size, 14, cr);
    const r = cr(v.id % 14, Math.floor(v.id / 14));
    const e = v.d2 - v.d1;
    const stone = mix3(mix3(C(0x9c968a), C(0x8a8e94), r[0]), C(0xb0a690), r[1] * 0.4);
    // dome shading: bright toward top-left of each stone
    const lx = (x - v.cx) / v.cs, ly = (y - v.cy) / v.cs;
    const dome = 0.88 - lx * 0.22 - ly * 0.3 + (r[2] - 0.5) * 0.2;
    const n = tileNoise(nz, x / size, y / size, 12, 2);
    let c = mix3(grout, stone, smoothstep(1.5, 4.5, e));
    const f = lerp(0.8, dome, smoothstep(1.5, 5, e)) * (1 + n * 0.1);
    const k = (y * size + x) * 3;
    cv.px[k] = c[0] * f; cv.px[k + 1] = c[1] * f; cv.px[k + 2] = c[2] * f;
  }
  return cv;
}

export function paintForestFloor(size = 512, seed = 6) {
  const rng = new RNG(seed), nz = new Simplex(seed);
  const cv = new Canvas(size).fill(C(0x3e5a24));
  cv.modulate(nz, 4, 0.2, [...C(0x5a4a2a), 0.55]);
  for (let i = 0; i < 1800; i++) {
    const c = jitter(rng.pick([C(0x4a7a2a), C(0x35581e), C(0x5e8a34)]), rng, 0.25);
    cv.stroke(rng.range(0, size), rng.range(0, size), -Math.PI / 2 + rng.range(-0.8, 0.8), rng.range(4, 9), 1.1, 0.3, c, 0.5, rng.range(-0.5, 0.5));
  }
  // fallen leaves
  for (let i = 0; i < 1300; i++) {
    const c = jitter(rng.pick([C(0x9a6a2a), C(0xb07a30), C(0x7a5024), C(0x8a8a34), C(0xa05a24)]), rng, 0.25);
    const x = rng.range(0, size), y = rng.range(0, size), a = rng.range(0, 6.28), l = rng.range(3, 6.5);
    cv.stroke(x - Math.cos(a) * l * 0.5 + 1, y - Math.sin(a) * l * 0.5 + 1.2, a, l, 1.2, 1.6, C(0x2a2012), 0.35);
    cv.stroke(x - Math.cos(a) * l * 0.5, y - Math.sin(a) * l * 0.5, a, l, 1.0, 1.7, c, 0.9);
  }
  // twigs
  for (let i = 0; i < 90; i++) cv.stroke(rng.range(0, size), rng.range(0, size), rng.range(0, 6.28), rng.range(8, 20), 0.9, 0.5, C(0x4a3420), 0.8, rng.range(-0.4, 0.4));
  return cv;
}

export function paintSand(size = 512, seed = 7) {
  const rng = new RNG(seed), nz = new Simplex(seed);
  const cv = new Canvas(size).fill(C(0xcdb888));
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const n = tileNoise(nz, x / size, y / size, 4, 3);
    const rip = Math.sin((x * 0.6 + y + n * 40) / size * Math.PI * 2 * 22) * 0.05;
    const k = (y * size + x) * 3, f = 1 + n * 0.08 + rip + (hh(x, y, seed) - 0.5) * 0.08;
    cv.px[k] *= f; cv.px[k + 1] *= f; cv.px[k + 2] *= f;
  }
  for (let i = 0; i < 300; i++) cv.dab(rng.range(0, size), rng.range(0, size), rng.range(1, 2.4), jitter(C(0xa89878), rng, 0.3), 0.7, 0.7);
  for (let i = 0; i < 40; i++) cv.dab(rng.range(0, size), rng.range(0, size), rng.range(2, 3.5), C(0xeee4cc), 0.8, 0.6); // shells
  return cv;
}

export function paintAsh(size = 512, seed = 8) {
  const rng = new RNG(seed), nz = new Simplex(seed), cr = cellRand(seed);
  const cv = new Canvas(size);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const v = voronoi(x, y, size, 9, cr);
    const n = tileNoise(nz, x / size, y / size, 5, 3);
    const e = smoothstep(0, 3, v.d2 - v.d1);
    const c = mix3(C(0x2a2220), mix3(C(0x5a4e48), C(0x6a5a50), n * 0.5 + 0.5), e);
    const crack = (1 - e) * smoothstep(0.1, 0.5, n);
    const k = (y * size + x) * 3;
    cv.px[k] = c[0] + crack * 0.55; cv.px[k + 1] = c[1] + crack * 0.12; cv.px[k + 2] = c[2];
  }
  for (let i = 0; i < 500; i++) cv.dab(rng.range(0, size), rng.range(0, size), rng.range(1, 3), jitter(C(0x3a3230), rng, 0.3), 0.6, 0.6);
  return cv;
}

export function terrainLayers(size = 512) {
  return [
    paintGrass(size), paintDirt(size), paintRock(size), paintFarmland(size),
    paintCobble(size), paintForestFloor(size), paintSand(size), paintAsh(size),
  ];
}
