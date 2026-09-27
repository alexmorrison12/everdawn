// Procedural stylized trees (oak, pine, dead, bush) with painted leaf/bark textures, wind sway,
// 3 LODs, and a cell-based instanced scatter over the height-field masks.
import * as THREE from 'three';
import { RNG, Simplex, smoothstep, clamp } from '../core/noise.js';
import { MeshBuilder, tube, blob, linColor } from '../engine/geom.js';
import { lambert, G } from '../engine/materials.js';
import { Canvas, tileNoise } from '../engine/paint.js';
import { M } from './heightfield.js';
import { PLACES } from './zone.js';

// ---------------- textures ----------------
function leafAtlas() {
  const W = 512, Hh = 256;
  const cv = document.createElement('canvas'); cv.width = W; cv.height = Hh;
  const ctx = cv.getContext('2d');
  const rng = new RNG(11);
  const leaf = (x, y, a, l, w, col) => {
    ctx.save(); ctx.translate(x, y); ctx.rotate(a);
    ctx.fillStyle = col; ctx.beginPath();
    ctx.moveTo(0, 0); ctx.quadraticCurveTo(l * 0.5, -w, l, 0); ctx.quadraticCurveTo(l * 0.5, w, 0, 0); ctx.fill();
    ctx.strokeStyle = 'rgba(30,50,10,0.35)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(1, 0); ctx.lineTo(l * 0.85, 0); ctx.stroke();
    ctx.restore();
  };
  const greens = ['#5f9a34', '#4c8a2c', '#78ae40', '#3e7426', '#8cbc4a', '#6aa23a', '#a4c858'];
  // left: alpha leaf cluster (round-ish silhouette)
  for (let i = 0; i < 520; i++) {
    const ang = rng.range(0, Math.PI * 2), rr = Math.sqrt(rng.next()) * 105;
    const x = 128 + Math.cos(ang) * rr, y = 128 + Math.sin(ang) * rr * 0.92;
    const shade = 1 - rr / 150;
    ctx.globalAlpha = 1;
    leaf(x, y, rng.range(0, Math.PI * 2), rng.range(14, 24), rng.range(5, 8), greens[Math.floor(rng.next() * greens.length * (0.55 + shade * 0.45))]);
  }
  // right: opaque leaf mass (for puff surfaces)
  ctx.fillStyle = '#4a822c'; ctx.fillRect(256, 0, 256, 256);
  for (let i = 0; i < 1400; i++) {
    const x = 256 + rng.range(-10, 266), y = rng.range(-10, 266);
    leaf(x, y, rng.range(0, Math.PI * 2), rng.range(12, 22), rng.range(4, 7), greens[rng.int(0, greens.length - 1)]);
  }
  // make sure the seam columns stay opaque
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  return tex;
}

function barkTexture(seed = 3, base = [0.36, 0.26, 0.17]) {
  const S = 256, nz = new Simplex(seed), rng = new RNG(seed);
  const cv = new Canvas(S);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const n = tileNoise(nz, x / S, y / S, 3, 3);
    const streak = Math.sin((x / S * 14 + n * 1.8) * Math.PI * 2);
    const groove = smoothstep(0.55, 0.95, Math.abs(streak));
    const k = (y * S + x) * 3, f = (0.8 + n * 0.25) * (1 - groove * 0.45) * (1 + (tileNoise(nz, x / S + 0.3, y / S, 16, 2)) * 0.12);
    cv.px[k] = base[0] * f; cv.px[k + 1] = base[1] * f; cv.px[k + 2] = base[2] * f;
  }
  for (let i = 0; i < 60; i++) cv.dab(rng.range(0, S), rng.range(0, S), rng.range(3, 8), [0.36, 0.42, 0.2], 0.35, 0.2); // lichen
  const t = new THREE.DataTexture(cv.toRGBA(), S, S, THREE.RGBAFormat);
  t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.generateMipmaps = true; t.minFilter = THREE.LinearMipmapLinearFilter; t.magFilter = THREE.LinearFilter; t.needsUpdate = true;
  return t;
}

// ---------------- shared materials ----------------
let MATS = null;
function windVertex(amp) {
  return vs => vs
    .replace('#include <common>', '#include <common>\nattribute float sway;\nvarying vec3 vTreePos;')
    .replace('#include <begin_vertex>', `#include <begin_vertex>
      {
        vec3 ip = vec3(0.0);
        #ifdef USE_INSTANCING
          ip = instanceMatrix[3].xyz;
        #endif
        vTreePos = (modelMatrix * vec4(ip, 1.0)).xyz;
        float ph = ip.x * 0.13 + ip.z * 0.17;
        float w = sin(uTime * 1.3 + ph) * 0.6 + sin(uTime * 2.7 + ph * 2.3 + position.y * 0.4) * 0.4;
        transformed.xz += uWind * w * sway * ${amp.toFixed(3)};
        transformed.y += sin(uTime * 3.1 + ph + position.x) * sway * ${(amp * 0.25).toFixed(3)};
      }`);
}
// Ordered 4x4 Bayer threshold: a fine, stable pattern for dissolves (per-pixel random hashes read as static).
const BAYER = `const float BAYER[16] = float[16](0.,8.,2.,10.,12.,4.,14.,6.,3.,11.,1.,9.,15.,7.,13.,5.);
  float bayer4() { ivec2 q = ivec2(gl_FragCoord.xy) & 3; return (BAYER[q.y * 4 + q.x] + 0.5) / 16.0; }`;
// foliage right in front of the camera dissolves instead of filling the screen; a crown the camera is inside of
// fades out as a whole, and leaves between the camera and the player turn to lace so you can always see yourself
const nearFade = fs => fs.replace('#include <common>', `#include <common>\nuniform vec3 uPlayerPos;\nvarying vec3 vTreePos;\n${BAYER}`).replace('#include <alphatest_fragment>', `#include <alphatest_fragment>
  { float dc = distance(vWPos, uCamPos), b = bayer4();
    if (dc < 4.0 && b > (dc - 1.4) / 2.6) discard;
    float inCrown = smoothstep(6.5, 3.5, distance(uCamPos, vTreePos + vec3(0.0, 5.0, 0.0)));
    if (b < inCrown) discard;
    vec3 toP = uPlayerPos - uCamPos; float dp = length(toP); toP /= max(dp, 1e-3);
    vec3 toF = vWPos - uCamPos; float along = dot(toF, toP); float perp = length(toF - toP * along);
    if (along > 0.0 && along < dp - 0.6 && perp < 1.6 + along * 0.12 && b > 0.25) discard; }`);
// a trunk between the camera and the player turns to lace instead of hiding the player (no camera jumps)
const trunkFade = fs => fs.replace('#include <common>', `#include <common>\nuniform vec3 uPlayerPos;\n${BAYER}`).replace('#include <map_fragment>', `#include <map_fragment>
  { vec3 toP = uPlayerPos - uCamPos; float dp = length(toP); toP /= max(dp, 1e-3);
    vec3 toF = vWPos - uCamPos; float along = dot(toF, toP); float perp = length(toF - toP * along);
    float b = bayer4();
    if (distance(vWPos, uCamPos) < 1.2) discard;
    if (along > 0.0 && along < dp - 0.8 && perp < 0.9 && b > 0.3) discard; }`);
export function treeMaterials() {
  if (MATS) return MATS;
  const leaves = leafAtlas();
  MATS = {
    leaves: lambert({ map: leaves, vertexColors: true, alphaTest: 0.45, side: THREE.DoubleSide }, { wrap: 0.55, trans: 0.45, rim: 0.12, rimColor: 0xe8ffb0, key: 'leaves', vertex: windVertex(0.12), fragment: nearFade, uniforms: { uPlayerPos: G.uPlayerPos } }),
    bark: lambert({ map: barkTexture(3), vertexColors: true }, { wrap: 0.3, key: 'bark', vertex: windVertex(0.02), fragment: trunkFade, uniforms: { uPlayerPos: G.uPlayerPos } }),
    barkDark: lambert({ map: barkTexture(8, [0.46, 0.42, 0.44]), vertexColors: true }, { wrap: 0.3, key: 'barkd', vertex: windVertex(0.02), fragment: trunkFade, uniforms: { uPlayerPos: G.uPlayerPos } }),
    needles: lambert({ map: leaves, vertexColors: true, alphaTest: 0.45, side: THREE.DoubleSide }, { wrap: 0.5, trans: 0.25, key: 'needles', vertex: windVertex(0.06), fragment: nearFade, uniforms: { uPlayerPos: G.uPlayerPos } }),
  };
  return MATS;
}

// ---------------- generators ----------------
const V = (x, y, z) => new THREE.Vector3(x, y, z);
function bentPath(from, to, bend, segs, rng) {
  const pts = [];
  const side = V(rng.range(-1, 1), 0, rng.range(-1, 1)).normalize().multiplyScalar(bend);
  for (let i = 0; i <= segs; i++) {
    const t = i / segs;
    const p = from.clone().lerp(to, t);
    p.addScaledVector(side, Math.sin(t * Math.PI));
    pts.push(p);
  }
  return pts;
}

// Puff UVs: spherical projection into the opaque right half of the leaf atlas
function puffUV(g) {
  const p = g.attributes.position, uv = new Float32Array(p.count * 2);
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i), l = Math.hypot(x, y, z) || 1;
    uv[i * 2] = 0.52 + 0.46 * (Math.atan2(z, x) / (Math.PI * 2) + 0.5);
    uv[i * 2 + 1] = 0.04 + 0.92 * (Math.acos(clamp(y / l, -1, 1)) / Math.PI);
  }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return g;
}
function cardUV(g) { // left half of atlas
  const uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setX(i, uv.getX(i) * 0.5);
  return g;
}

/**
 * Oak: flared trunk, 3–4 limbs, clumpy canopy of displaced puffs + leaf cards. lod 0/1/2.
 * Returns { trunk: BufferGeometry, leaves: BufferGeometry, height }
 */
export function makeOak(seed, lod = 0, opts = {}) {
  const rng = new RNG(seed), nz = new Simplex(seed);
  const scale = opts.scale ?? rng.range(0.9, 1.15);
  const trunkB = new MeshBuilder([{ name: 'sway', size: 1 }]);
  const leafB = new MeshBuilder([{ name: 'sway', size: 1 }]);
  const radial = [9, 6, 4][lod];
  const splitH = rng.range(3.2, 4.4) * scale;
  const lean = V(rng.range(-0.5, 0.5), 0, rng.range(-0.5, 0.5));
  const top = V(lean.x, splitH, lean.z);
  const trunkPts = bentPath(V(0, -0.4, 0), top, 0.25, lod === 2 ? 2 : 5, rng);
  const trunkR = trunkPts.map((p, i) => (0.62 - 0.26 * (i / (trunkPts.length - 1))) * scale * (i === 0 ? 1.25 : 1));
  const barkCol = (p) => { const t = clamp(p.y / splitH, 0, 1); const c = 0.72 + t * 0.35; return [c, c * 0.97, c * 0.92]; };
  trunkB.add(tube(trunkPts, trunkR, radial), null, barkCol, { extra: { sway: p => clamp(p.y / 12, 0, 1) * 0.3 } });
  // roots
  if (lod < 2) {
    const nr = rng.int(4, 5);
    for (let i = 0; i < nr; i++) {
      const a = i / nr * Math.PI * 2 + rng.range(-0.3, 0.3);
      const d = V(Math.cos(a), 0, Math.sin(a));
      const pts = [V(d.x * 0.25, 1.0 * scale, d.z * 0.25), V(d.x * 0.8 * scale, 0.35 * scale, d.z * 0.8 * scale), V(d.x * rng.range(1.3, 1.9) * scale, -0.25, d.z * rng.range(1.3, 1.9) * scale)];
      trunkB.add(tube(pts, [0.32 * scale, 0.2 * scale, 0.07 * scale], Math.max(4, radial - 3), false), null, [0.62, 0.58, 0.52], { extra: { sway: 0 } });
    }
  }
  // limbs and canopy puffs
  const nl = rng.int(3, 4);
  const puffs = [];
  const crownR = rng.range(3.6, 4.6) * scale;
  for (let i = 0; i < nl; i++) {
    const a = i / nl * Math.PI * 2 + rng.range(-0.4, 0.4);
    const out = rng.range(0.55, 0.85) * crownR;
    const end = V(top.x + Math.cos(a) * out, top.y + rng.range(2.2, 3.4) * scale, top.z + Math.sin(a) * out);
    const pts = bentPath(top.clone().add(V(0, -0.4, 0)), end, 0.4, lod === 2 ? 2 : 4, rng);
    trunkB.add(tube(pts, pts.map((_, k) => (0.36 - 0.24 * k / (pts.length - 1)) * scale), Math.max(4, radial - 2), true), null, barkCol, { extra: { sway: p => clamp(p.y / 12, 0, 1) * 0.5 } });
    puffs.push({ c: end.clone().add(V(0, rng.range(0.4, 1.0), 0)), r: rng.range(2.3, 3.0) * scale });
  }
  puffs.push({ c: V(top.x + rng.range(-0.6, 0.6), top.y + rng.range(4.6, 5.6) * scale, top.z + rng.range(-0.6, 0.6)), r: rng.range(2.6, 3.2) * scale });
  // a few filler puffs between
  for (let i = 0; i < (lod === 2 ? 0 : 3); i++) {
    const a = rng.range(0, Math.PI * 2);
    puffs.push({ c: V(top.x + Math.cos(a) * crownR * 0.55, top.y + rng.range(1.8, 4.2) * scale, top.z + Math.sin(a) * crownR * 0.55), r: rng.range(1.8, 2.4) * scale });
  }
  const cc = new THREE.Vector3(); puffs.forEach(p => cc.add(p.c)); cc.multiplyScalar(1 / puffs.length);
  let yMin = Infinity, yMax = -Infinity; puffs.forEach(p => { yMin = Math.min(yMin, p.c.y - p.r); yMax = Math.max(yMax, p.c.y + p.r); });
  const dark = linColor(opts.leafDark ?? 0x2c5a1c), light = linColor(opts.leafLight ?? 0xb4d860);
  const hue = rng.range(-0.06, 0.06);
  const leafColor = (p) => {
    const t = clamp((p.y - yMin) / (yMax - yMin), 0, 1);
    const inner = clamp(p.distanceTo(cc) / (crownR * 1.4), 0, 1);
    const k = clamp(t * 0.75 + inner * 0.45 - 0.1, 0, 1);
    return [dark[0] + (light[0] - dark[0]) * k + hue, dark[1] + (light[1] - dark[1]) * k, dark[2] + (light[2] - dark[2]) * k - hue * 0.5];
  };
  const sphNormal = (p, n) => { const s = p.clone().sub(cc).normalize(); n.lerp(s, 0.75).normalize(); };
  const detail = [2, 1, 1][lod];
  for (const pf of puffs) {
    const g = puffUV(blob(pf.r, detail, d => 1 + nz.noise3(d.x * 1.7 + pf.c.x, d.y * 1.7, d.z * 1.7) * 0.22, [1, 0.82, 1]));
    leafB.add(g, new THREE.Matrix4().makeTranslation(pf.c.x, pf.c.y, pf.c.z), leafColor, { normalFn: sphNormal, extra: { sway: p => clamp((p.y - splitH) / 8, 0.1, 1) } });
    // leaf cards around the puff silhouette
    const nc = [16, 7, 0][lod];
    for (let i = 0; i < nc; i++) {
      const d = V(rng.range(-1, 1), rng.range(-0.5, 1), rng.range(-1, 1)).normalize();
      const pos = pf.c.clone().addScaledVector(d, pf.r * rng.range(0.78, 0.98));
      const sz = rng.range(1.5, 2.3) * scale;
      const q = new THREE.Quaternion().setFromUnitVectors(V(0, 0, 1), d);
      q.multiply(new THREE.Quaternion().setFromAxisAngle(V(0, 0, 1), rng.range(0, Math.PI * 2)));
      const m = new THREE.Matrix4().compose(pos, q, V(sz, sz, sz));
      leafB.add(cardUV(new THREE.PlaneGeometry(1, 1)), m, leafColor, { normalFn: sphNormal, extra: { sway: p => clamp((p.y - splitH) / 8, 0.1, 1) * 1.3 } });
    }
  }
  return { trunk: trunkB.build(), leaves: leafB.build(), height: yMax };
}

export function makePine(seed, lod = 0, opts = {}) {
  const rng = new RNG(seed), nz = new Simplex(seed);
  const scale = opts.scale ?? rng.range(0.85, 1.2);
  const H = rng.range(11, 15) * scale;
  const trunkB = new MeshBuilder([{ name: 'sway', size: 1 }]);
  const leafB = new MeshBuilder([{ name: 'sway', size: 1 }]);
  const pts = [V(0, -0.4, 0), V(rng.range(-0.2, 0.2), H * 0.5, rng.range(-0.2, 0.2)), V(0, H, 0)];
  trunkB.add(tube(pts, [0.42 * scale, 0.22 * scale, 0.04], [7, 5, 4][lod]), null, [0.8, 0.72, 0.66], { extra: { sway: p => p.y / H * 0.3 } });
  const tiers = [6, 5, 3][lod];
  const dark = linColor(0x1e4a2a), light = linColor(0x6a9a4a);
  for (let i = 0; i < tiers; i++) {
    const t = i / tiers;
    const y0 = H * (0.18 + t * 0.72), rr = (1 - t * 0.78) * 3.3 * scale, hh = H * 0.3 * (1 - t * 0.3);
    const seg = [12, 9, 7][lod];
    const g = new THREE.ConeGeometry(rr, hh, seg, 2, true);
    // droop + jagged rim
    const p = g.attributes.position;
    for (let k = 0; k < p.count; k++) {
      const x = p.getX(k), y = p.getY(k), z = p.getZ(k);
      const a = Math.atan2(z, x);
      const rim = y < -hh * 0.45 ? 1 : 0;
      const j = 1 + rim * (Math.sin(a * 7 + i) * 0.12 + nz.noise2(a * 2, i) * 0.12);
      p.setXYZ(k, x * j, y - rim * (0.35 + Math.abs(Math.sin(a * 7 + i)) * 0.35), z * j);
    }
    g.computeVertexNormals();
    // uv into opaque leaf mass
    const uv = g.attributes.uv; for (let k = 0; k < uv.count; k++) uv.setXY(k, 0.52 + uv.getX(k) * 0.46, 0.04 + uv.getY(k) * 0.9);
    const col = (pp) => { const s = clamp((pp.y - y0 + hh * 0.5) / hh, 0, 1) * 0.6 + t * 0.4; return [dark[0] + (light[0] - dark[0]) * s, dark[1] + (light[1] - dark[1]) * s, dark[2] + (light[2] - dark[2]) * s]; };
    leafB.add(g, new THREE.Matrix4().makeTranslation(0, y0 + hh * 0.5, 0), col, { normalFn: (pp, n) => { n.y = Math.max(n.y, 0.25); n.normalize(); }, extra: { sway: pp => pp.y / H } });
  }
  return { trunk: trunkB.build(), leaves: leafB.build(), height: H };
}

export function makeDead(seed, lod = 0, opts = {}) {
  const rng = new RNG(seed);
  const scale = opts.scale ?? rng.range(0.8, 1.2);
  const b = new MeshBuilder([{ name: 'sway', size: 1 }]);
  const radial = [7, 5, 4][lod];
  const grow = (from, dir, len, r, depth) => {
    const to = from.clone().addScaledVector(dir, len);
    const pts = bentPath(from, to, len * 0.18, depth === 0 ? 5 : 3, rng);
    b.add(tube(pts, pts.map((_, k) => r * (1 - 0.55 * k / (pts.length - 1))), Math.max(3, radial - depth * 2), true), null, [0.8, 0.78, 0.8], { extra: { sway: p => clamp(p.y / 10, 0, 1) * 0.4 } });
    if (depth >= (lod === 2 ? 1 : 3)) return;
    const n = depth === 0 ? 3 : 2;
    for (let i = 0; i < n; i++) {
      const nd = dir.clone().add(V(rng.range(-0.9, 0.9), rng.range(0.1, 0.6), rng.range(-0.9, 0.9))).normalize();
      grow(pts[pts.length - 1 - (i % 2)], nd, len * rng.range(0.5, 0.7), r * 0.55, depth + 1);
    }
  };
  grow(V(0, -0.4, 0), V(rng.range(-0.15, 0.15), 1, rng.range(-0.15, 0.15)).normalize(), rng.range(4.5, 6.5) * scale, 0.45 * scale, 0);
  return { trunk: b.build(), leaves: null, height: 8 * scale };
}

export function makeBush(seed, lod = 0) {
  const rng = new RNG(seed), nz = new Simplex(seed);
  const leafB = new MeshBuilder([{ name: 'sway', size: 1 }]);
  const n = rng.int(3, 5);
  const puffs = [];
  for (let i = 0; i < n; i++) puffs.push({ c: V(rng.range(-0.8, 0.8), rng.range(0.4, 0.9), rng.range(-0.8, 0.8)), r: rng.range(0.6, 1.05) });
  const cc = V(0, 0.5, 0);
  const dark = linColor(0x2a5a1e), light = linColor(0x9ac850);
  const col = p => { const t = clamp(p.y / 1.8, 0, 1); return [dark[0] + (light[0] - dark[0]) * t, dark[1] + (light[1] - dark[1]) * t, dark[2] + (light[2] - dark[2]) * t]; };
  const sph = (p, nn) => { nn.lerp(p.clone().sub(cc).normalize(), 0.7).normalize(); };
  for (const pf of puffs) {
    leafB.add(puffUV(blob(pf.r, lod === 0 ? 1 : 0, d => 1 + nz.noise3(d.x * 2 + pf.c.x, d.y * 2, d.z * 2) * 0.2, [1, 0.8, 1])), new THREE.Matrix4().makeTranslation(pf.c.x, pf.c.y, pf.c.z), col, { normalFn: sph, extra: { sway: p => p.y * 0.3 } });
    for (let i = 0; i < (lod === 0 ? 6 : 2); i++) {
      const d = V(rng.range(-1, 1), rng.range(-0.2, 1), rng.range(-1, 1)).normalize();
      const q = new THREE.Quaternion().setFromUnitVectors(V(0, 0, 1), d).multiply(new THREE.Quaternion().setFromAxisAngle(V(0, 0, 1), rng.range(0, 6.28)));
      const s = rng.range(0.8, 1.2);
      leafB.add(cardUV(new THREE.PlaneGeometry(1, 1)), new THREE.Matrix4().compose(pf.c.clone().addScaledVector(d, pf.r * 0.85), q, V(s, s, s)), col, { normalFn: sph, extra: { sway: p => p.y * 0.4 } });
    }
  }
  return { trunk: null, leaves: leafB.build(), height: 1.6 };
}

// ---------------- scatter ----------------
const CELL = 128;
const LOD_D = [150, 340, 640];

export class Forest {
  constructor(hf, scene, exclusions = []) {
    this.hf = hf; this.scene = scene;
    this.mats = treeMaterials();
    this.group = new THREE.Group(); this.group.name = 'forest';
    this.cells = new Map();
    this.exclusions = exclusions; // [{x,z,r}]
    this.colliders = [];          // trunks for movement blocking {x,z,r}
    this.species = {
      oak: [0, 1, 2].map(i => [0, 1, 2].map(l => makeOak(100 + i, l))),
      pine: [0, 1, 2].map(i => [0, 1, 2].map(l => makePine(200 + i, l))),
      dead: [0, 1].map(i => [0, 1, 2].map(l => makeDead(300 + i, l))),
      bush: [0, 1, 2].map(i => [0, 1, 2].map(l => makeBush(400 + i, l))),
    };
  }

  excluded(x, z) { for (const e of this.exclusions) if ((x - e.x) ** 2 + (z - e.z) ** 2 < e.r * e.r) return true; return false; }

  scatter() {
    const hf = this.hf, rng = new RNG(4242), n2 = new Simplex(777);
    const inst = []; // {sp, v, x, y, z, rot, s}
    const step = 6.5;
    for (let z = -500; z < 500; z += step) for (let x = -500; x < 500; x += step) {
      const px = x + rng.range(0, step), pz = z + rng.range(0, step);
      const h = hf.heightAt(px, pz);
      if (h < 0.9) continue;
      const slope = hf.slopeAt(px, pz);
      const road = hf.maskAt(px, pz, M.ROAD), farm = hf.maskAt(px, pz, M.FARM), cob = hf.maskAt(px, pz, M.COBBLE);
      if (road > 0.05 || farm > 0.2 || cob > 0.1) continue;
      if (this.excluded(px, pz)) continue;
      const forest = hf.maskAt(px, pz, M.FOREST), web = hf.maskAt(px, pz, M.WEB), ash = hf.maskAt(px, pz, M.ASH);
      const rim = Math.sqrt((px / 300) ** 2 + (pz / 312) ** 2);
      const r = rng.next();
      let sp = null;
      if (slope > 0.55) continue;
      if (web > 0.4) { if (r < 0.34 * web) sp = rng.chance(0.6) ? 'dead' : 'oak'; }
      else if (ash > 0.35) { if (r < 0.05) sp = 'dead'; }
      else if (h > 24 || rim > 0.95) { if (r < 0.28 * smoothstep(0.8, 1.05, rim + (h > 24 ? 0.3 : 0)) * (slope < 0.4 ? 1 : 0.4)) sp = rng.chance(0.85) ? 'pine' : 'oak'; }
      else if (forest > 0.1) {
        if (r < forest * 0.62) sp = rng.chance(0.12 + (pz < -60 ? 0.3 : 0)) ? 'pine' : 'oak';
        else if (r < forest * 0.85) sp = 'bush';
      } else {
        const meadow = n2.noise2(px / 60, pz / 60);
        if (r < 0.012 + smoothstep(0.4, 0.8, meadow) * 0.05) sp = 'oak';
        else if (r < 0.03) sp = 'bush';
      }
      if (!sp) continue;
      const list = this.species[sp];
      const v = rng.int(0, list.length - 1);
      inst.push({ sp, v, x: px, y: h - (sp === 'bush' ? 0.15 : 0.05), z: pz, rot: rng.range(0, Math.PI * 2), s: sp === 'bush' ? rng.range(0.8, 1.4) : rng.range(0.85, 1.2) });
      if (sp !== 'bush') this.colliders.push({ x: px, z: pz, r: sp === 'pine' ? 0.5 : 0.7 });
    }
    this.instances = inst;
    // bucket into cells
    const buckets = new Map();
    for (const it of inst) {
      const key = `${Math.floor(it.x / CELL)},${Math.floor(it.z / CELL)}`;
      if (!buckets.has(key)) buckets.set(key, []);
      buckets.get(key).push(it);
    }
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3(), up = V(0, 1, 0);
    for (const [key, items] of buckets) {
      const [cx, cz] = key.split(',').map(Number);
      const cell = { center: V((cx + 0.5) * CELL, 0, (cz + 0.5) * CELL), groups: [], lod: -1 };
      const byVar = new Map();
      for (const it of items) { const k = it.sp + it.v; if (!byVar.has(k)) byVar.set(k, []); byVar.get(k).push(it); }
      let ySum = 0; items.forEach(it => ySum += it.y); cell.center.y = ySum / items.length;
      for (const [k, list] of byVar) {
        const sp = list[0].sp, v = list[0].v;
        const lods = this.species[sp][v];
        const meshes = [];
        for (const part of ['trunk', 'leaves']) {
          if (!lods[0][part]) continue;
          const mat = part === 'leaves' ? (sp === 'pine' ? this.mats.needles : this.mats.leaves) : (sp === 'dead' ? this.mats.barkDark : this.mats.bark);
          const im = new THREE.InstancedMesh(lods[0][part], mat, list.length);
          list.forEach((it, i) => { q.setFromAxisAngle(up, it.rot); s.setScalar(it.s); p.set(it.x, it.y, it.z); m.compose(p, q, s); im.setMatrixAt(i, m); });
          im.castShadow = true; im.receiveShadow = true;
          im.computeBoundingSphere();
          im.userData.lods = lods.map(l => l[part]);
          meshes.push(im);
          this.group.add(im);
        }
        cell.groups.push(...meshes);
      }
      this.cells.set(key, cell);
    }
    return inst.length;
  }

  update(cam) {
    for (const cell of this.cells.values()) {
      const d = Math.hypot(cam.x - cell.center.x, cam.z - cell.center.z);
      const lod = d < LOD_D[0] ? 0 : d < LOD_D[1] ? 1 : d < LOD_D[2] ? 2 : 3;
      if (lod === cell.lod) continue;
      cell.lod = lod;
      for (const im of cell.groups) {
        if (lod === 3) { im.visible = false; continue; }
        im.visible = true;
        im.geometry = im.userData.lods[lod];
        im.castShadow = lod < 1;
      }
    }
  }
}
