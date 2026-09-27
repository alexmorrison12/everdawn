// Painted face masks. One RGBA DataTexture per (race, sex, face), 2x2 tiles of T px:
//   tile (0,0) normal · (1,0) eyes closed (blink) · (0,1) mouth open · (1,1) laugh (mouth open + eyes closed)
// Channels: R = ink (lashes, pupils, mouth, shading) · G = sclera (+catchlight where B too) · B = iris · A = brows/stubble.
// Canvas y grows with face v (upward), matching DataTexture row order.
import * as THREE from 'three';
import { RNG } from '../../core/noise.js';

const T = 192, S = T * 2, K = T / 128;
const CACHE = new Map();

// race/sex face styles
const STYLE = {
  human_m: { eyeW: 0.9, eyeH: 0.38, tilt: 0.0, iris: 0.34, brow: 'straight', browW: 1.0, lash: 1.0, mouthW: 0.36, lips: 0.5, jawShade: 0.25 },
  human_f: { eyeW: 1.08, eyeH: 0.5, tilt: 0.08, iris: 0.38, brow: 'arch', browW: 0.55, lash: 1.5, wing: 1, mouthW: 0.32, lips: 1, blush: 1 },
  dwarf_m: { eyeW: 0.9, eyeH: 0.4, tilt: -0.02, iris: 0.4, brow: 'bushy', browW: 1.6, lash: 0.9, mouthW: 0.34, lips: 0.4, jawShade: 0.1 },
  dwarf_f: { eyeW: 1.02, eyeH: 0.52, tilt: 0.04, iris: 0.4, brow: 'arch', browW: 0.7, lash: 1.4, wing: 0.6, mouthW: 0.3, lips: 1, blush: 1.3 },
  orc_m: { eyeW: 0.92, eyeH: 0.34, tilt: -0.14, iris: 0.4, brow: 'angry', browW: 1.5, lash: 1.1, mouthW: 0.42, lips: 0.3, jawShade: 0.3, pupilSlit: 0 },
  orc_f: { eyeW: 1.0, eyeH: 0.44, tilt: -0.03, iris: 0.38, brow: 'arch', browW: 0.8, lash: 1.4, wing: 1, mouthW: 0.34, lips: 0.9 },
  elf_m: { eyeW: 1.08, eyeH: 0.38, tilt: 0.16, iris: 0.44, brow: 'swept', browW: 1.1, lash: 1.0, mouthW: 0.3, lips: 0.4, noPupil: 1, jawShade: 0.15 },
  elf_f: { eyeW: 1.14, eyeH: 0.46, tilt: 0.2, iris: 0.44, brow: 'swept', browW: 0.65, lash: 1.5, wing: 1.2, mouthW: 0.28, lips: 1, noPupil: 1 },
};
// face variants (opts.face 0..3)
const VARIANTS = [
  { eye: 1, brow: 1, extra: null },
  { eye: 0.92, brow: 1.25, extra: 'scar', tilt: -0.04 },
  { eye: 1.06, brow: 0.85, extra: 'freckles', tilt: 0.04 },
  { eye: 0.96, brow: 1.1, extra: 'paint' },
];
export const FACE_COUNT = VARIANTS.length;

function mkCanvas() {
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(S, S);
  const c = document.createElement('canvas'); c.width = S; c.height = S; return c;
}

export function faceTexture(base, faceIdx = 0) {
  const key = base.key + ':' + faceIdx;
  if (CACHE.has(key)) return CACHE.get(key);
  const st = STYLE[base.key], va = VARIANTS[faceIdx % VARIANTS.length];
  const lm = base.faceMap.lm;
  const ch = [0, 1, 2, 3].map(() => { const c = mkCanvas(); const x = c.getContext('2d', { willReadFrequently: true }); x.fillStyle = '#000'; x.fillRect(0, 0, S, S); return x; });
  const [R, Gc, Bc, A] = ch;
  const rng = new RNG(faceIdx * 7 + base.key.length * 13);
  for (let tile = 0; tile < 4; tile++) {
    const ox = (tile & 1) * T, oy = (tile >> 1) * T;
    const closed = tile === 1 || tile === 3, open = tile >= 2;
    const X = u => ox + u * T, Y = v => oy + v * T;
    for (const c of ch) { c.save(); c.beginPath(); c.rect(ox + 1, oy + 1, T - 2, T - 2); c.clip(); }
    paintFace({ R, G: Gc, B: Bc, A, X, Y, st, va, lm, closed, open, rng: new RNG(faceIdx * 7 + 3), race: base.P.race, sex: base.P.sex });
    for (const c of ch) c.restore();
  }
  const imgs = ch.map(c => c.getImageData(0, 0, S, S).data);
  const data = new Uint8Array(S * S * 4);
  for (let i = 0, n = S * S; i < n; i++) {
    data[i * 4] = imgs[0][i * 4]; data[i * 4 + 1] = imgs[1][i * 4]; data[i * 4 + 2] = imgs[2][i * 4]; data[i * 4 + 3] = imgs[3][i * 4];
  }
  const tex = new THREE.DataTexture(data, S, S, THREE.RGBAFormat);
  tex.colorSpace = THREE.NoColorSpace; tex.magFilter = THREE.LinearFilter; tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.generateMipmaps = true; tex.anisotropy = 4; tex.needsUpdate = true;
  CACHE.set(key, tex);
  return tex;
}

const W = a => `rgba(255,255,255,${a})`;

function paintFace(o) {
  const { R, G, B, A, X, Y, st, va, lm, closed, open } = o;
  const ew = lm.eyeW * st.eyeW * va.eye * 1.02;     // eye half-width in uv
  const eh = ew * st.eyeH * 1.0;                   // eye half-height
  const tilt = st.tilt + (va.tilt || 0);
  for (const side of [-1, 1]) {
    const c = side < 0 ? lm.eyeL : lm.eyeR;
    // inner corner is toward the nose (u = 0.5)
    const inner = [c[0] - side * ew, c[1] - tilt * ew * 0.5];
    const outer = [c[0] + side * ew, c[1] + tilt * ew * 0.5];
    const eye = { c, inner, outer, ew, eh, side };
    if (!closed) paintOpenEye(o, eye);
    else paintClosedEye(o, eye);
    paintBrow(o, eye);
  }
  paintNose(o);
  paintMouth(o, open);
  paintExtras(o);
  // painterly planes: cheek hollows, temples, inner eye sockets
  for (const sg of [-1, 1]) {
    const c = sg < 0 ? lm.eyeL : lm.eyeR;
    softEllipse(R, X(0.5 + sg * 0.24), Y(lm.nose[1] - 0.05), 9 * K, 14 * K, 0.13);          // under the cheekbone
    softEllipse(R, X(0.5 + sg * 0.37), Y(lm.brow + 0.03), 7 * K, 12 * K, 0.1);             // temple
    softEllipse(R, X(c[0] - sg * 0.055), Y(c[1] + 0.035), 5 * K, 5 * K, 0.14);             // inner socket
  }
}

function almondPath(ctx, X, Y, e, shrink = 1) {
  const { inner, outer, eh, c } = e;
  const up = eh * shrink, dn = eh * 0.8 * shrink;
  ctx.beginPath();
  ctx.moveTo(X(inner[0]), Y(inner[1]));
  ctx.bezierCurveTo(X(inner[0] + (outer[0] - inner[0]) * 0.25), Y(c[1] + up * 1.25), X(inner[0] + (outer[0] - inner[0]) * 0.72), Y(c[1] + up * 1.3), X(outer[0]), Y(outer[1]));
  ctx.bezierCurveTo(X(inner[0] + (outer[0] - inner[0]) * 0.7), Y(c[1] - dn * 1.2), X(inner[0] + (outer[0] - inner[0]) * 0.3), Y(c[1] - dn * 1.15), X(inner[0]), Y(inner[1]));
  ctx.closePath();
}

function paintOpenEye(o, e) {
  const { R, G, B, X, Y, st } = o;
  const { c, ew, eh, inner, outer, side } = e;
  // sclera
  G.fillStyle = W(1); almondPath(G, X, Y, e); G.fill();
  // iris clipped to the almond
  const ir = ew * st.iris * 2.0;
  const ic = [c[0] + side * ew * 0.04, c[1] + eh * 0.12];
  for (const ctx of [B, G]) { ctx.save(); almondPath(ctx, X, Y, e); ctx.clip(); }
  B.fillStyle = W(1); B.beginPath(); B.ellipse(X(ic[0]), Y(ic[1]), ir * T, ir * T * 1.05, 0, 0, Math.PI * 2); B.fill();
  G.fillStyle = '#000'; G.beginPath(); G.ellipse(X(ic[0]), Y(ic[1]), ir * T, ir * T * 1.05, 0, 0, Math.PI * 2); G.fill();
  // catchlight (G + B)
  G.fillStyle = W(0.95); G.beginPath(); G.ellipse(X(ic[0] - ir * 0.35), Y(ic[1] + ir * 0.35), ir * T * 0.26, ir * T * 0.26, 0, 0, Math.PI * 2); G.fill();
  B.restore(); G.restore();
  // pupil + iris ring (ink)
  R.save(); almondPath(R, X, Y, e); R.clip();
  if (!st.noPupil) {
    R.fillStyle = W(0.95); R.beginPath(); R.ellipse(X(ic[0]), Y(ic[1]), ir * T * 0.42, ir * T * 0.46, 0, 0, Math.PI * 2); R.fill();
    R.strokeStyle = W(0.45); R.lineWidth = 1.2 * K; R.beginPath(); R.ellipse(X(ic[0]), Y(ic[1]), ir * T, ir * T * 1.05, 0, 0, Math.PI * 2); R.stroke();
  } else {
    // glowing elf eyes: faint inner ring only
    R.strokeStyle = W(0.18); R.lineWidth = 1 * K; R.beginPath(); R.ellipse(X(ic[0]), Y(ic[1]), ir * T * 0.9, ir * T * 0.95, 0, 0, Math.PI * 2); R.stroke();
  }
  // upper lid shadow on the eyeball
  const g = R.createLinearGradient(0, Y(c[1] + eh * 1.3), 0, Y(c[1] + eh * 0.2));
  g.addColorStop(0, W(0.55)); g.addColorStop(1, W(0));
  R.fillStyle = g; R.fillRect(X(Math.min(inner[0], outer[0]) - 0.01), Y(c[1] - eh * 2), (Math.abs(outer[0] - inner[0]) + 0.02) * T, eh * T * 4);
  R.restore();
  // lash line (upper), thicker toward the outer corner
  const lw = 1.6 * st.lash;
  R.strokeStyle = W(1); R.lineCap = 'round';
  for (let i = 0; i < 3; i++) {
    R.lineWidth = lw * K * (1 + i * 0.35);
    R.beginPath();
    const t0 = i * 0.25;
    const sx = inner[0] + (outer[0] - inner[0]) * t0;
    R.moveTo(X(sx), Y(c[1] + eh * (0.6 + t0 * 0.9) - (outer[1] - inner[1]) * 0));
    R.bezierCurveTo(X(inner[0] + (outer[0] - inner[0]) * Math.max(0.25, t0 + 0.1)), Y(c[1] + eh * 1.25), X(inner[0] + (outer[0] - inner[0]) * 0.72), Y(c[1] + eh * 1.3), X(outer[0]), Y(outer[1]));
    R.stroke();
  }
  if (st.wing) { // winged outer lash
    R.lineWidth = lw * K * 1.4; R.beginPath(); R.moveTo(X(outer[0] - side * ew * 0.12), Y(outer[1] + eh * 0.25));
    R.quadraticCurveTo(X(outer[0] + side * ew * 0.18), Y(outer[1] + eh * 0.2), X(outer[0] + side * ew * 0.32 * st.wing), Y(outer[1] + eh * 0.55 * st.wing)); R.stroke();
  }
  // lower lid
  R.strokeStyle = W(0.45); R.lineWidth = 1.1 * K; R.beginPath(); R.moveTo(X(inner[0] + (outer[0] - inner[0]) * 0.15), Y(c[1] - eh * 0.72));
  R.quadraticCurveTo(X(inner[0] + (outer[0] - inner[0]) * 0.55), Y(c[1] - eh * 1.1), X(outer[0]), Y(outer[1])); R.stroke();
  // crease
  R.strokeStyle = W(0.28); R.lineWidth = 1.4 * K; R.beginPath(); R.moveTo(X(inner[0] + (outer[0] - inner[0]) * 0.1), Y(c[1] + eh * 1.6));
  R.quadraticCurveTo(X(inner[0] + (outer[0] - inner[0]) * 0.55), Y(c[1] + eh * 2.25), X(outer[0] + side * ew * 0.05), Y(outer[1] + eh * 0.7)); R.stroke();
  // under-eye soft shade
  softEllipse(R, X(c[0]), Y(c[1] - eh * 1.9), ew * T * 0.9, eh * T * 0.9, 0.12);
}

function paintClosedEye(o, e) {
  const { R, X, Y, st } = o;
  const { c, eh, inner, outer, ew, side } = e;
  R.strokeStyle = W(1); R.lineCap = 'round'; R.lineWidth = 1.8 * K * st.lash;
  R.beginPath(); R.moveTo(X(inner[0]), Y(inner[1]));
  R.quadraticCurveTo(X((inner[0] + outer[0]) / 2), Y(c[1] - eh * 0.7), X(outer[0]), Y(outer[1])); R.stroke();
  if (st.wing) { R.lineWidth = 1.6 * K; R.beginPath(); R.moveTo(X(outer[0] - side * ew * 0.1), Y(outer[1])); R.lineTo(X(outer[0] + side * ew * 0.25), Y(outer[1] + eh * 0.2)); R.stroke(); }
  R.strokeStyle = W(0.3); R.lineWidth = 1.3 * K; R.beginPath(); R.moveTo(X(inner[0] + (outer[0] - inner[0]) * 0.1), Y(c[1] + eh * 1.2));
  R.quadraticCurveTo(X((inner[0] + outer[0]) / 2), Y(c[1] + eh * 1.9), X(outer[0]), Y(outer[1] + eh * 0.6)); R.stroke();
}

function paintBrow(o, e) {
  const { A, R, X, Y, st, va } = o;
  const { c, ew, side } = e;
  const by = o.lm.brow;
  const th = st.browW * va.brow;
  const x0 = c[0] - side * ew * 1.05, x1 = c[0] + side * ew * 1.25;
  let y0 = by - 0.01, ym = by + 0.018, y1 = by - 0.004;
  if (st.brow === 'angry') { y0 = by - 0.03; ym = by + 0.005; y1 = by + 0.022; }
  if (st.brow === 'arch') { y0 = by - 0.012; ym = by + 0.03; y1 = by - 0.012; }
  if (st.brow === 'swept') { y0 = by - 0.018; ym = by + 0.012; y1 = by + 0.05; }
  if (st.brow === 'bushy') { y0 = by - 0.018; ym = by + 0.012; y1 = by - 0.01; }
  const n = 16, top = [], bot = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const x = x0 + (x1 - x0) * t;
    const y = (1 - t) * (1 - t) * y0 + 2 * (1 - t) * t * ym + t * t * y1;
    const w = Math.max(0.0035, th * (st.brow === 'swept' ? (1.05 - t * 0.8) : (0.8 + Math.sin(t * Math.PI) * 0.45 - t * 0.35)) * 0.0105);
    top.push([X(x), Y(y + w)]); bot.push([X(x), Y(y - w * 0.8)]);
  }
  A.fillStyle = W(0.95); A.beginPath(); A.moveTo(...top[0]);
  for (const p of top) A.lineTo(...p);
  for (let i = bot.length - 1; i >= 0; i--) A.lineTo(...bot[i]);
  A.closePath(); A.fill();
  A.strokeStyle = W(0.5); A.lineWidth = 1 * K; A.stroke();
  if (st.brow === 'bushy') { // hairy strokes
    A.strokeStyle = W(0.8); A.lineWidth = 1.2 * K;
    for (let i = 0; i < 18; i++) { const t = i / 17; const x = x0 + (x1 - x0) * t, y = (1 - t) * (1 - t) * y0 + 2 * (1 - t) * t * ym + t * t * y1; A.beginPath(); A.moveTo(X(x), Y(y - 0.012)); A.lineTo(X(x + side * 0.012), Y(y + 0.018)); A.stroke(); }
  }
  // brow shadow onto the lid
  softEllipse(R, X(c[0]), Y(by - 0.03), ew * T * 1.1, 4 * K, 0.1);
}

function paintNose(o) {
  const { R, X, Y, lm } = o;
  const nx = 0.5, ny = lm.nose[1];
  for (const s of [-1, 1]) {
    R.fillStyle = W(0.55); R.beginPath(); R.ellipse(X(nx + s * 0.045), Y(ny - 0.028), 2.4 * K, 1.5 * K, s * 0.5, 0, Math.PI * 2); R.fill();
    softEllipse(R, X(nx + s * 0.07), Y(ny - 0.005), 3 * K, 5 * K, 0.12); // ala crease
  }
  softEllipse(R, X(nx), Y(ny - 0.055), 7 * K, 3 * K, 0.2);  // shadow under nose
  softEllipse(R, X(nx), Y(ny + 0.1), 3 * K, 11 * K, 0.06);  // bridge side shade
}

function paintMouth(o, open) {
  const { R, G, X, Y, st, lm, race } = o;
  const my = lm.mouth[1], mw = st.mouthW * 0.5 * (lm.jawW / 0.34);
  const x0 = 0.5 - mw, x1 = 0.5 + mw;
  if (!open) {
    R.strokeStyle = W(0.85); R.lineWidth = 1.5 * K; R.lineCap = 'round';
    R.beginPath(); R.moveTo(X(x0), Y(my + 0.004)); R.bezierCurveTo(X(0.5 - mw * 0.4), Y(my - 0.006), X(0.5 + mw * 0.4), Y(my - 0.006), X(x1), Y(my + 0.004)); R.stroke();
    // corners
    R.fillStyle = W(0.5); for (const x of [x0, x1]) { R.beginPath(); R.arc(X(x), Y(my + 0.003), 1.3 * K, 0, Math.PI * 2); R.fill(); }
    // lip shading: upper lip darker, lower lip light shadow beneath
    const L = st.lips;
    softEllipse(R, X(0.5), Y(my + 0.02), mw * T * 0.85, (2.6 + L) * K, 0.18 + L * 0.12);
    softEllipse(R, X(0.5), Y(my - 0.045), mw * T * 0.55, 2.2 * K, 0.16);
    if (L > 0.8) softEllipse(R, X(0.5), Y(my - 0.018), mw * T * 0.7, 2.8 * K, 0.12);
  } else {
    // open mouth: dark interior + teeth
    R.fillStyle = W(1); R.beginPath(); R.ellipse(X(0.5), Y(my - 0.022), mw * T * 0.95, 0.05 * T, 0, 0, Math.PI * 2); R.fill();
    G.save(); G.beginPath(); G.ellipse(X(0.5), Y(my - 0.022), mw * T * 0.95, 0.05 * T, 0, 0, Math.PI * 2); G.clip();
    G.fillStyle = W(0.9); G.fillRect(X(0.5 - mw), Y(my - 0.004), mw * 2 * T, 0.012 * T);
    if (race === 'orc') { G.fillRect(X(0.5 - mw * 0.9), Y(my - 0.065), mw * 1.8 * T, 0.014 * T); }
    G.restore();
    R.strokeStyle = W(0.6); R.lineWidth = 1 * K; R.beginPath(); R.ellipse(X(0.5), Y(my - 0.022), mw * T * 0.97, 0.052 * T, 0, 0, Math.PI * 2); R.stroke();
  }
  // chin shadow
  softEllipse(R, X(0.5), Y(lm.chin[1] + 0.035), mw * T * 0.6, 3 * K, 0.1);
  if (st.jawShade) { // stubble / beard shadow in hair channel
    const A = o.A; A.save();
    for (let i = 0; i < 900; i++) {
      const a = o.rng.next() * Math.PI, rr = 0.2 + o.rng.next() * 0.2;
      const x = 0.5 + Math.cos(a) * rr * 0.95, y = my + 0.02 - Math.sin(a) * rr * 0.75;
      if (y > my + 0.05 && Math.abs(x - 0.5) < 0.2) continue;
      A.fillStyle = W(st.jawShade * (0.5 + o.rng.next() * 0.5)); A.fillRect(X(x), Y(y), K, K);
    }
    A.restore();
  }
}

function paintExtras(o) {
  const { R, X, Y, va, lm, rng, race, sex } = o;
  if (va.extra === 'scar') {
    R.strokeStyle = W(0.5); R.lineWidth = 1.4 * K; R.beginPath();
    R.moveTo(X(lm.eyeR[0] + 0.02), Y(lm.brow + 0.08)); R.lineTo(X(lm.eyeR[0] - 0.05), Y(lm.eyeR[1] - 0.14)); R.stroke();
    R.lineWidth = 0.9 * K; for (let i = 0; i < 5; i++) { const t = (i + 0.5) / 5; const x = lm.eyeR[0] + 0.02 - 0.07 * t, y = lm.brow + 0.08 - (lm.brow + 0.08 - lm.eyeR[1] + 0.14) * t; R.beginPath(); R.moveTo(X(x - 0.012), Y(y - 0.004)); R.lineTo(X(x + 0.012), Y(y + 0.004)); R.stroke(); }
  } else if (va.extra === 'freckles') {
    for (let i = 0; i < 60; i++) {
      const s = rng.next() < 0.5 ? -1 : 1;
      const x = 0.5 + s * (0.06 + rng.next() * 0.16), y = lm.nose[1] + (rng.next() - 0.3) * 0.12;
      R.fillStyle = W(0.12 + rng.next() * 0.12); R.beginPath(); R.arc(X(x), Y(y), (0.7 + rng.next() * 0.6) * K, 0, Math.PI * 2); R.fill();
    }
  } else if (va.extra === 'paint') {
    if (race === 'orc' || race === 'dwarf') { // war paint stripes
      R.fillStyle = W(0.55);
      for (const s of [-1, 1]) { R.beginPath(); R.moveTo(X(0.5 + s * 0.05), Y(lm.eyeR[1] + 0.02)); R.lineTo(X(0.5 + s * 0.42), Y(lm.eyeR[1] + 0.05)); R.lineTo(X(0.5 + s * 0.42), Y(lm.eyeR[1] - 0.04)); R.lineTo(X(0.5 + s * 0.08), Y(lm.eyeR[1] - 0.03)); R.closePath(); R.fill(); }
      R.fillRect(X(0.48), Y(lm.chin[1] - 0.02), 0.04 * T, (lm.mouth[1] - lm.chin[1] - 0.02) * T);
    } else if (race === 'elf') { // markings under the eyes
      R.strokeStyle = W(0.5); R.lineWidth = 1.6 * K;
      for (const s of [-1, 1]) { const c = s < 0 ? lm.eyeL : lm.eyeR; R.beginPath(); R.moveTo(X(c[0] - s * 0.02), Y(c[1] - 0.05)); R.quadraticCurveTo(X(c[0] + s * 0.03), Y(c[1] - 0.12), X(c[0] + s * 0.02), Y(c[1] - 0.2)); R.stroke(); }
    } else { // age lines
      R.strokeStyle = W(0.22); R.lineWidth = 1 * K;
      for (let i = 0; i < 3; i++) { R.beginPath(); R.moveTo(X(0.33), Y(lm.brow + 0.06 + i * 0.025)); R.quadraticCurveTo(X(0.5), Y(lm.brow + 0.075 + i * 0.025), X(0.67), Y(lm.brow + 0.06 + i * 0.025)); R.stroke(); }
      for (const s of [-1, 1]) { R.beginPath(); R.moveTo(X(0.5 + s * 0.1), Y(lm.nose[1] - 0.01)); R.quadraticCurveTo(X(0.5 + s * 0.17), Y(lm.mouth[1] - 0.01), X(0.5 + s * 0.14), Y(lm.mouth[1] - 0.05)); R.stroke(); }
    }
  }
}

function softEllipse(ctx, x, y, rx, ry, a) {
  const g = ctx.createRadialGradient(x, y, 0, x, y, 1);
  ctx.save(); ctx.translate(x, y); ctx.scale(Math.max(0.5, rx), Math.max(0.5, ry)); ctx.translate(-x, -y);
  const gg = ctx.createRadialGradient(x, y, 0, x, y, 1);
  gg.addColorStop(0, W(a)); gg.addColorStop(1, W(0));
  ctx.fillStyle = gg; ctx.beginPath(); ctx.arc(x, y, 1, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}
