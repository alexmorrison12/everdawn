// Architecture kit: painted building textures, per-surface materials, and a merging builder that batches
// every structure in the zone into ~12 draw calls. Boxes/roofs get metre-scaled UVs so textures tile correctly.
import * as THREE from 'three';
import { RNG, Simplex, clamp, smoothstep, lerp } from '../core/noise.js';
import { Canvas, tileNoise } from '../engine/paint.js';
import { MeshBuilder, linColor } from '../engine/geom.js';
import { lambert } from '../engine/materials.js';

const C = hex => [((hex >> 16) & 255) / 255, ((hex >> 8) & 255) / 255, (hex & 255) / 255];
const mix3 = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];

function tex(cv, repeat = true) {
  const t = new THREE.DataTexture(cv.toRGBA(), cv.size, cv.size, THREE.RGBAFormat);
  t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.generateMipmaps = true; t.minFilter = THREE.LinearMipmapLinearFilter; t.magFilter = THREE.LinearFilter; t.anisotropy = 8;
  t.needsUpdate = true;
  return t;
}

// ---------- painters ----------
function paintPlaster(S = 256) {
  const nz = new Simplex(21), rng = new RNG(21);
  const cv = new Canvas(S).fill(C(0xe8dcc0));
  cv.modulate(nz, 4, 0.07, [...C(0xd8c8a4), 0.5]);
  for (let i = 0; i < 90; i++) cv.dab(rng.range(0, S), rng.range(0, S), rng.range(6, 18), rng.pick([C(0xf4ead4), C(0xd6c6a2), C(0xe0d2b4)]), 0.25, 0);
  for (let i = 0; i < 60; i++) cv.stroke(rng.range(0, S), rng.range(0, S), rng.range(-0.3, 0.3), rng.range(10, 30), 2, 1, C(0xf2e8d2), 0.2);
  for (let i = 0; i < 25; i++) cv.dab(rng.range(0, S), rng.range(0, S), rng.range(1, 3), C(0x9a8a6a), 0.3); // pits
  return cv;
}
function paintTimber(S = 256) {
  const nz = new Simplex(22);
  const cv = new Canvas(S);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const n = tileNoise(nz, x / S, y / S, 3, 2);
    const grain = Math.sin((x / S * 26 + n * 3 + Math.sin(y / S * Math.PI * 2 * 2) * 0.4) * Math.PI * 2) * 0.5 + 0.5;
    const k = (y * S + x) * 3, c = mix3(C(0x4a2e1a), C(0x6e4628), grain * 0.6 + n * 0.3 + 0.2);
    cv.px[k] = c[0]; cv.px[k + 1] = c[1]; cv.px[k + 2] = c[2];
  }
  return cv;
}
function paintStone(S = 512, palette = [0x9a948a, 0x8a8a90, 0xa89e8a, 0x7e7a74]) {
  const nz = new Simplex(23), rng = new RNG(23);
  const cv = new Canvas(S).fill(C(0x5a544c));
  const rows = 8, rh = S / rows;
  for (let r = 0; r < rows; r++) {
    let x = (r % 2) * rh * 0.7;
    const xEnd = x + S;
    while (x < xEnd) {
      const w = rh * rng.range(1.1, 2.1);
      const base = C(rng.pick(palette));
      const jit = rng.range(0.85, 1.12);
      for (let yy = 2; yy < rh - 2; yy++) for (let xx = 2; xx < w - 2; xx++) {
        const px = Math.floor(x + xx), py = Math.floor(r * rh + yy);
        const ex = Math.min(xx, w - xx) / 5, ey = Math.min(yy, rh - yy) / 5;
        const edge = clamp(Math.min(ex, ey), 0, 1);
        const n = tileNoise(nz, px / S, py / S, 10, 2);
        let f = jit * (0.82 + edge * 0.18 + n * 0.12);
        if (yy < 6) f *= 1.12; if (xx < 6) f *= 1.06; if (yy > rh - 7) f *= 0.8;
        cv.blend(px, py, [base[0] * f, base[1] * f, base[2] * f], 1);
      }
      x += w;
    }
  }
  // moss specks near bottom rows and cracks
  for (let i = 0; i < 70; i++) cv.dab(rng.range(0, S), rng.range(S * 0.6, S), rng.range(2, 6), C(0x5a7a34), 0.25, 0.2);
  return cv;
}
function paintShingles(S = 256, pal, rows = 8, cols = 6, round = true) {
  const nz = new Simplex(24), rng = new RNG(pal[0]);
  const cv = new Canvas(S).fill(C(pal[3] ?? 0x202020));
  const rh = S / rows, cw = S / cols;
  for (let r = 0; r < rows + 1; r++) {
    const off = (r % 2) * cw * 0.5;
    for (let c = -1; c < cols + 1; c++) {
      const base = mix3(C(pal[0]), C(pal[1]), rng.next()); const jit = rng.range(0.85, 1.12);
      const x0 = c * cw + off, y0 = r * rh;
      for (let yy = 0; yy < rh * 1.35; yy++) for (let xx = 1; xx < cw - 1; xx++) {
        const u = (xx / cw) * 2 - 1, v = yy / (rh * 1.35);
        const bottom = round ? 1 - Math.pow(Math.abs(u), 3) * 0.35 : 1;
        if (v > bottom) continue;
        const shade = jit * (0.72 + v * 0.38) * (1 - Math.abs(u) * 0.12) * (1 + tileNoise(nz, (x0 + xx) / S, (y0 + yy) / S, 8, 2) * 0.1);
        const edge = smoothstep(bottom, bottom - 0.08, v);
        cv.blend(Math.floor(x0 + xx), Math.floor(y0 + yy), [base[0] * shade * (0.6 + edge * 0.4), base[1] * shade * (0.6 + edge * 0.4), base[2] * shade * (0.6 + edge * 0.4)], 1);
      }
    }
  }
  return cv;
}
function paintThatch(S = 256) {
  const rng = new RNG(25);
  const cv = new Canvas(S).fill(C(0x8a6a34));
  for (let i = 0; i < 2600; i++) {
    const c = rng.pick([C(0xc8a050), C(0xb08a40), C(0xdcb868), C(0x96763a), C(0xa88440)]);
    cv.stroke(rng.range(0, S), rng.range(0, S), Math.PI / 2 + rng.range(-0.15, 0.15), rng.range(14, 34), 1.2, 0.6, c, 0.7);
  }
  for (let r = 0; r < 6; r++) for (let x = 0; x < S; x++) for (let k = 0; k < 4; k++) cv.mul(x, Math.floor(r * S / 6 + k), 0.8 + k * 0.05);
  return cv;
}
function paintPlanks(S = 256, base = 0x8a6038) {
  const nz = new Simplex(26), rng = new RNG(26);
  const cv = new Canvas(S);
  const n = 6, ph = S / n;
  const cols = []; for (let i = 0; i < n; i++) cols.push(rng.range(0.82, 1.15));
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const p = Math.floor(y / ph), py = y - p * ph;
    const g = tileNoise(nz, x / S, y / S * 0.2 + p * 0.37, 4, 2);
    const grain = Math.sin((y / S * 60 + g * 4) * Math.PI) * 0.06;
    let f = cols[p] * (0.9 + g * 0.15 + grain);
    if (py < 2 || py > ph - 3) f *= 0.45;
    const k = (y * S + x) * 3, c = C(base);
    cv.px[k] = c[0] * f; cv.px[k + 1] = c[1] * f; cv.px[k + 2] = c[2] * f;
  }
  for (let i = 0; i < 40; i++) { const x = rng.range(0, S), y = Math.floor(rng.range(0, n)) * ph + ph / 2; cv.dab(x, y, 1.6, C(0x3a2a1a), 0.8); } // nails
  return cv;
}
function paintWindow(S = 128) {
  const cv = new Canvas(S).fill(C(0x3a2616));
  const glass = C(0x28364a);
  for (let y = 8; y < S - 8; y++) for (let x = 8; x < S - 8; x++) {
    const d1 = ((x + y) % 22), d2 = ((x - y + 220) % 22);
    const lead = d1 < 2 || d2 < 2;
    const k = (y * S + x) * 3;
    const hl = smoothstep(60, 10, Math.hypot(x - 40, y - 36)) * 0.35;
    const c = lead ? C(0x1a1a1a) : mix3(glass, C(0x8ab0d0), hl);
    cv.px[k] = c[0]; cv.px[k + 1] = c[1]; cv.px[k + 2] = c[2];
  }
  return cv;
}
function paintCanvasCloth(S = 128, base = 0xd8c8a0) {
  const nz = new Simplex(27);
  const cv = new Canvas(S).fill(C(base));
  cv.modulate(nz, 5, 0.1);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) if ((x + y) % 4 === 0) cv.mul(x, y, 0.96);
  return cv;
}

// ---------- materials ----------
let MAT = null;
export function kitMaterials() {
  if (MAT) return MAT;
  const winCv = paintWindow();
  MAT = {
    plaster: lambert({ map: tex(paintPlaster()), vertexColors: true }, { wrap: 0.35, key: 'k-plaster' }),
    timber: lambert({ map: tex(paintTimber()), vertexColors: true }, { wrap: 0.3, key: 'k-timber' }),
    stone: lambert({ map: tex(paintStone()), vertexColors: true }, { wrap: 0.3, key: 'k-stone' }),
    darkStone: lambert({ map: tex(paintStone(512, [0x4a4448, 0x3e3a3e, 0x55504c, 0x3a3434])), vertexColors: true }, { wrap: 0.3, key: 'k-dstone' }),
    roofBlue: lambert({ map: tex(paintShingles(256, [0x3a5a8a, 0x4a6ea0, 0, 0x14202e])), vertexColors: true }, { wrap: 0.4, key: 'k-rblue' }),
    roofRed: lambert({ map: tex(paintShingles(256, [0xa0442a, 0xc05a34, 0, 0x2e140c])), vertexColors: true }, { wrap: 0.4, key: 'k-rred' }),
    thatch: lambert({ map: tex(paintThatch()), vertexColors: true }, { wrap: 0.45, key: 'k-thatch' }),
    planks: lambert({ map: tex(paintPlanks()), vertexColors: true }, { wrap: 0.35, key: 'k-planks' }),
    window: lambert({ map: tex(winCv, false), vertexColors: true, emissive: 0xffb050, emissiveIntensity: 0.0 }, { wrap: 0.3, spec: 0.8, shine: 60, key: 'k-window' }),
    metal: lambert({ color: 0xffffff, vertexColors: true }, { spec: 0.9, shine: 40, wrap: 0.25, key: 'k-metal' }),
    cloth: lambert({ map: tex(paintCanvasCloth()), vertexColors: true, side: THREE.DoubleSide }, { wrap: 0.5, trans: 0.2, key: 'k-cloth' }),
    glow: new THREE.MeshBasicMaterial({ color: 0xffc070, toneMapped: false }),
    paint: lambert({ vertexColors: true }, { wrap: 0.4, key: 'k-paint' }),
  };
  MAT.glow.color.setRGB(3.2, 1.9, 0.8);
  return MAT;
}

// ---------- geometry primitives with metre-scaled UVs ----------
/** Box centred at origin with UVs in metres / tile. */
export function box(w, h, d, tile = 2) {
  const g = new THREE.BoxGeometry(w, h, d);
  const uv = g.attributes.uv;
  const dims = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
  for (let f = 0; f < 6; f++) for (let i = 0; i < 4; i++) {
    const k = f * 4 + i;
    uv.setXY(k, uv.getX(k) * dims[f][0] / tile, uv.getY(k) * dims[f][1] / tile);
  }
  return g;
}
export function cyl(rt, rb, h, seg = 10, tile = 2, open = false) {
  const g = new THREE.CylinderGeometry(rt, rb, h, seg, 1, open);
  const uv = g.attributes.uv, circ = Math.PI * (rt + rb);
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * circ / tile, uv.getY(i) * h / tile);
  return g;
}
export function cone(r, h, seg = 12, tile = 2) {
  const g = new THREE.ConeGeometry(r, h, seg, 1, true);
  const uv = g.attributes.uv, circ = Math.PI * 2 * r, sl = Math.hypot(r, h);
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * circ / tile, uv.getY(i) * sl / tile);
  return g;
}
/** Gable roof: ridge along X. w = length along ridge, d = depth, h = rise, overhang. Returns {roof, gables} */
export function gableRoof(w, d, h, over = 0.5, thick = 0.18, tile = 2) {
  const W = w / 2 + over, D = d / 2 + over, H = h + over * h / (d / 2);
  const pos = [], uv = [], idx = [];
  const slope = Math.hypot(D, H);
  // two slopes (top + bottom surfaces for thickness)
  const quad = (a, b, c, d2, uvs) => { const i = pos.length / 3; pos.push(...a, ...b, ...c, ...d2); uv.push(...uvs); idx.push(i, i + 1, i + 2, i, i + 2, i + 3); };
  const y0 = -over * h / (d / 2);
  for (const s of [-1, 1]) {
    const top = [s < 0 ? -W : W, h, 0], eaveZ = s * D;
    // outer
    if (s > 0) quad([-W, h, 0], [-W, y0, D], [W, y0, D], [W, h, 0], [0, 0, 0, slope / tile, 2 * W / tile, slope / tile, 2 * W / tile, 0]);
    else quad([W, h, 0], [W, y0, -D], [-W, y0, -D], [-W, h, 0], [0, 0, 0, slope / tile, 2 * W / tile, slope / tile, 2 * W / tile, 0]);
    // underside
    if (s > 0) quad([-W, h - thick, 0], [W, h - thick, 0], [W, y0 - thick, D], [-W, y0 - thick, D], [0, 0, 1, 0, 1, 1, 0, 1]);
    else quad([W, h - thick, 0], [-W, h - thick, 0], [-W, y0 - thick, -D], [W, y0 - thick, -D], [0, 0, 1, 0, 1, 1, 0, 1]);
    // eave edge
    quad([-W, y0, eaveZ], [-W, y0 - thick, eaveZ], [W, y0 - thick, eaveZ], [W, y0, eaveZ], [0, 0, 0, 0.1, 1, 0.1, 1, 0]);
    void top;
  }
  const roof = new THREE.BufferGeometry();
  roof.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  roof.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  roof.setIndex(idx); roof.computeVertexNormals();
  // gable triangles (walls) at ±x, inset to the wall plane
  const gp = [], gu = [], gi = [];
  for (const s of [-1, 1]) {
    const x = s * w / 2, i = gp.length / 3;
    gp.push(x, 0, -d / 2, x, 0, d / 2, x, h, 0);
    gu.push(-d / 2 / tile, 0, d / 2 / tile, 0, 0, h / tile);
    if (s > 0) gi.push(i, i + 2, i + 1); else gi.push(i, i + 1, i + 2);
  }
  const gables = new THREE.BufferGeometry();
  gables.setAttribute('position', new THREE.Float32BufferAttribute(gp, 3));
  gables.setAttribute('uv', new THREE.Float32BufferAttribute(gu, 2));
  gables.setIndex(gi); gables.computeVertexNormals();
  return { roof, gables };
}

// ---------- merging kit ----------
export class Kit {
  constructor() {
    this.mats = kitMaterials();
    this.b = {};
    for (const k in this.mats) this.b[k] = new MeshBuilder();
    this.colliders = []; // {type:'box', x,z,hw,hd,rot} | {type:'circle', x,z,r}
    this.rng = new RNG(5150);
  }
  /**
   * Add geometry `g` with world matrix `m` into surface `mat`.
   * shade: base tint (hex or [r,g,b] linear) ; ao: darken toward yGround (world) over aoH metres
   */
  add(mat, g, m, { tint = 0xffffff, ao = true, yGround = null, aoH = 2.5, jitter = 0.06 } = {}) {
    const base = Array.isArray(tint) ? tint : linColor(tint);
    const j = 1 + (this.rng.next() - 0.5) * jitter;
    const yg = yGround ?? (m ? m.elements[13] : 0);
    this.b[mat].add(g, m, ao ? (p) => { const f = clamp(0.55 + (p.y - yg) / aoH * 0.45, 0.55, 1) * j; return [base[0] * f, base[1] * f, base[2] * f]; } : [base[0] * j, base[1] * j, base[2] * j]);
  }
  boxCollider(x, z, w, d, rot) { this.colliders.push({ type: 'box', x, z, hw: w / 2, hd: d / 2, rot }); }
  circleCollider(x, z, r) { this.colliders.push({ type: 'circle', x, z, r }); }
  build(group) {
    for (const k in this.b) {
      if (!this.b[k].count) continue;
      const mesh = new THREE.Mesh(this.b[k].build(), this.mats[k]);
      mesh.castShadow = k !== 'glow' && k !== 'window';
      mesh.receiveShadow = true;
      mesh.name = 'kit-' + k;
      group.add(mesh);
    }
  }
}

// Matrix helper: position, yaw, scale
const _q = new THREE.Quaternion(), _e = new THREE.Euler();
export function M(x, y, z, ry = 0, sx = 1, sy = 1, sz = 1, rx = 0, rz = 0) {
  _e.set(rx, ry, rz, 'YXZ'); _q.setFromEuler(_e);
  return new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), _q, new THREE.Vector3(sx, sy, sz));
}
// Local frame for a structure: T(local) → world
export class Frame {
  constructor(x, y, z, rot) { this.m = M(x, y, z, rot); this.x = x; this.y = y; this.z = z; this.rot = rot; }
  at(lx, ly, lz, ry = 0, sx = 1, sy = 1, sz = 1, rx = 0, rz = 0) { return this.m.clone().multiply(M(lx, ly, lz, ry, sx, sy, sz, rx, rz)); }
  world(lx, lz) { const c = Math.cos(this.rot), s = Math.sin(this.rot); return [this.x + lx * c + lz * s, this.z - lx * s + lz * c]; }
}
