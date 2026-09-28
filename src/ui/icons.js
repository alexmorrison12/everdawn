// Procedurally PAINTED square icons (abilities + items), cached as data URLs.
//   iconURL(id, size = 64, opts?) → 'data:image/png;base64,…'
//   opts: 'epic' (rarity shorthand) | { rarity, tint, glow }
// Every icon is painted in a 100×100 unit space at ≥128 px and downsampled for crisp anti-aliasing.
import { rng, hashStr, rarityColor, rarityName, shade, mix, rgba } from './util.js';

const TAU = Math.PI * 2;
const cache = new Map();
let K = 1.28; // device px per unit of the icon currently being painted (shadowBlur is not transformed)

export function iconURL(id, size = 64, opts) {
  if (typeof opts === 'string') opts = { rarity: opts };
  const key = id + '|' + size + '|' + (opts ? (opts.rarity || '') + '|' + (opts.tint || '') + '|' + (opts.glow || '') + '|' + (opts.element || '') : '');
  let u = cache.get(key);
  if (!u) { u = iconCanvas(id, size, opts).toDataURL(); cache.set(key, u); }
  return u;
}
export function hasIcon(id) { return !!PAINT[id]; }
export const ICON_IDS = () => Object.keys(PAINT);

/** Paint an icon into a new canvas of `size` px. */
export function iconCanvas(id, size = 64, opts = {}) {
  opts = opts || {};
  const M = size > 128 ? size : 128;
  const [c, x] = canvas(M);
  K = M / 100;
  const R = rng(hashStr(id) ^ 0x9e37);
  const fn = PAINT[id] || PAINT.unknown;
  x.save();
  fn(x, R, opts);
  x.restore();
  x.setTransform(K, 0, 0, K, 0, 0);
  x.globalCompositeOperation = 'source-over'; x.globalAlpha = 1; x.shadowBlur = 0;
  finish(x, opts);
  return size === M ? c : downscale(c, size);
}

function canvas(S) {
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const x = c.getContext('2d', { willReadFrequently: true }); // CPU raster: avoids a GPU readback per toDataURL
  x.setTransform(S / 100, 0, 0, S / 100, 0, 0);
  x.lineJoin = 'round'; x.lineCap = 'round';
  return [c, x];
}
function downscale(src, size) {
  let cur = src;
  while (cur.width / 2 >= size * 1.01 && cur.width / 2 >= size) {
    const n = document.createElement('canvas'); n.width = n.height = cur.width / 2;
    const nx = n.getContext('2d', { willReadFrequently: true }); nx.imageSmoothingQuality = 'high'; nx.drawImage(cur, 0, 0, n.width, n.height); cur = n;
  }
  if (cur.width !== size) {
    const n = document.createElement('canvas'); n.width = n.height = size;
    const nx = n.getContext('2d', { willReadFrequently: true }); nx.imageSmoothingQuality = 'high'; nx.drawImage(cur, 0, 0, size, size); cur = n;
  }
  return cur;
}

// ------------------------------------------------------------------ toolkit
function lg(x, x0, y0, x1, y1, stops) { const g = x.createLinearGradient(x0, y0, x1, y1); for (const [o, c] of stops) g.addColorStop(o, c); return g; }
function rg(x, cx, cy, r0, r1, stops, fx = cx, fy = cy) { const g = x.createRadialGradient(fx, fy, r0, cx, cy, r1); for (const [o, c] of stops) g.addColorStop(o, c); return g; }
function poly(x, pts, close = true) { x.beginPath(); x.moveTo(pts[0][0], pts[0][1]); for (let i = 1; i < pts.length; i++) x.lineTo(pts[i][0], pts[i][1]); if (close) x.closePath(); }
function ellipse(x, cx, cy, rx, ry, rot = 0) { x.beginPath(); x.ellipse(cx, cy, Math.max(0.01, rx), Math.max(0.01, ry), rot, 0, TAU); }
function circle(x, cx, cy, r) { x.beginPath(); x.arc(cx, cy, Math.max(0.01, r), 0, TAU); }
function blur(x, b, col) { x.shadowBlur = b * K; x.shadowColor = col; }
function noBlur(x) { x.shadowBlur = 0; x.shadowColor = 'transparent'; }
function add(x) { x.globalCompositeOperation = 'lighter'; }
function norm(x) { x.globalCompositeOperation = 'source-over'; x.globalAlpha = 1; }
const bez = (a, b, c, d) => t => { const u = 1 - t, A = u * u * u, B = 3 * u * u * t, C = 3 * u * t * t, D = t * t * t; return [A * a[0] + B * b[0] + C * c[0] + D * d[0], A * a[1] + B * b[1] + C * c[1] + D * d[1]]; };
const qbez = (a, b, c) => t => { const u = 1 - t; return [u * u * a[0] + 2 * u * t * b[0] + t * t * c[0], u * u * a[1] + 2 * u * t * b[1] + t * t * c[1]]; };

/** Closed shape around a centreline f(t) with width w(t). */
function ribbon(x, f, w, n = 28) {
  const L = [], Rr = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n, p = f(t), a = f(Math.max(0, t - 0.01)), b = f(Math.min(1, t + 0.01));
    let dx = b[0] - a[0], dy = b[1] - a[1]; const l = Math.hypot(dx, dy) || 1; dx /= l; dy /= l;
    const ww = w(t) / 2;
    L.push([p[0] - dy * ww, p[1] + dx * ww]); Rr.push([p[0] + dy * ww, p[1] - dx * ww]);
  }
  x.beginPath(); x.moveTo(L[0][0], L[0][1]);
  for (let i = 1; i < L.length; i++) x.lineTo(L[i][0], L[i][1]);
  for (let i = Rr.length - 1; i >= 0; i--) x.lineTo(Rr[i][0], Rr[i][1]);
  x.closePath();
}
function strokeCurve(x, f, n = 24) { x.beginPath(); const p = f(0); x.moveTo(p[0], p[1]); for (let i = 1; i <= n; i++) { const q = f(i / n); x.lineTo(q[0], q[1]); } }

/** Painterly background: radial base + directional brush strokes. pal = [light, mid, dark] */
function bg(x, R, pal, o = {}) {
  const cx = o.cx ?? 50, cy = o.cy ?? 46;
  x.fillStyle = rg(x, cx, cy, 0, o.r ?? 78, [[0, pal[0]], [o.mid ?? 0.42, pal[1]], [1, pal[2]]]);
  x.fillRect(0, 0, 100, 100);
  brush(x, R, o.n ?? 26, o.strokes || [pal[0], pal[1], pal[2]], { angle: o.angle ?? -0.7, alpha: o.alpha ?? 0.13, len: o.len ?? 30, w: o.w ?? 9 });
}
function brush(x, R, n, cols, o = {}) {
  const ang = o.angle ?? -0.6, spread = o.spread ?? 0.7;
  x.lineCap = 'round';
  for (let i = 0; i < n; i++) {
    const cx = R() * 116 - 8, cy = R() * 116 - 8;
    const a = ang + (R() - 0.5) * spread;
    const len = (o.len ?? 26) * (0.45 + R());
    const w = (o.w ?? 7) * (0.35 + R());
    const dx = Math.cos(a) * len / 2, dy = Math.sin(a) * len / 2;
    const bend = (R() - 0.5) * 0.6;
    x.strokeStyle = cols[(R() * cols.length) | 0];
    x.globalAlpha = (o.alpha ?? 0.12) * (0.35 + R());
    x.lineWidth = w;
    x.beginPath(); x.moveTo(cx - dx, cy - dy);
    x.quadraticCurveTo(cx - dy * bend, cy + dx * bend, cx + dx, cy + dy);
    x.stroke();
  }
  x.globalAlpha = 1;
}
function glow(x, cx, cy, r, col, a = 1) {
  const pc = x.globalCompositeOperation;
  add(x); x.globalAlpha = a;
  x.fillStyle = rg(x, cx, cy, 0, r, [[0, col], [0.35, rgba(col, 0.45)], [1, rgba(col, 0)]]);
  x.fillRect(cx - r, cy - r, r * 2, r * 2);
  x.globalAlpha = 1; x.globalCompositeOperation = pc;
}
function sparkle(x, cx, cy, r, col = '#ffffff', rot = 0) {
  const pc = x.globalCompositeOperation; add(x);
  glow(x, cx, cy, r * 1.3, col, 0.55);
  x.save(); x.translate(cx, cy); x.rotate(rot);
  x.fillStyle = rgba('#ffffff', 0.95);
  for (let k = 0; k < 2; k++) {
    x.beginPath();
    x.moveTo(-r, 0); x.quadraticCurveTo(0, -r * 0.09, 0, -r * (k ? 0.6 : 1)); x.quadraticCurveTo(0, -r * 0.09, r, 0);
    x.quadraticCurveTo(0, r * 0.09, 0, r * (k ? 0.6 : 1)); x.quadraticCurveTo(0, r * 0.09, -r, 0);
    x.fill(); x.rotate(Math.PI / 4); x.scale(0.55, 0.55);
  }
  x.restore(); x.globalCompositeOperation = pc;
}
function embers(x, R, n, cx, cy, spread, cols, rmax = 1.4) {
  const pc = x.globalCompositeOperation; add(x);
  for (let i = 0; i < n; i++) {
    const a = R() * TAU, d = Math.pow(R(), 0.7) * spread;
    const px = cx + Math.cos(a) * d, py = cy + Math.sin(a) * d * 0.9;
    const r = 0.4 + R() * rmax, c = cols[(R() * cols.length) | 0];
    glow(x, px, py, r * 3.2, c, 0.5);
    x.fillStyle = c; circle(x, px, py, r * 0.6); x.fill();
  }
  x.globalCompositeOperation = pc;
}
/** Single flame tongue pointing up from local (0,0). */
function tongue(x, hgt, wd, sway) {
  x.beginPath();
  x.moveTo(-wd / 2, 0);
  x.bezierCurveTo(-wd * 0.62, -hgt * 0.38, -wd * 0.05 + sway * 0.25, -hgt * 0.62, sway, -hgt);
  x.bezierCurveTo(wd * 0.25 + sway * 0.35, -hgt * 0.55, wd * 0.62, -hgt * 0.32, wd / 2, 0);
  x.quadraticCurveTo(0, wd * 0.42, -wd / 2, 0);
  x.closePath();
}
/** Layered fire: cluster of tongues at (cx,cy) pointing along rot (0 = up). */
function fire(x, R, cx, cy, hgt, wd, rot = 0, o = {}) {
  const layers = o.layers || [
    ['#7a0c00', 1.0, 1.0, 0.9], ['#d2380a', 0.86, 0.82, 0.95], ['#ff8a1a', 0.68, 0.62, 1], ['#ffd24a', 0.48, 0.42, 1], ['#fff6d0', 0.26, 0.22, 1],
  ];
  const n = o.n ?? 5;
  x.save(); x.translate(cx, cy); x.rotate(rot);
  for (let li = 0; li < layers.length; li++) {
    const [col, hs, ws, a] = layers[li];
    x.globalCompositeOperation = li < 2 ? 'source-over' : 'lighter';
    x.globalAlpha = a * (li < 2 ? 1 : 0.9);
    for (let i = 0; i < n; i++) {
      const off = (i - (n - 1) / 2) / Math.max(1, n - 1);
      const hh = hgt * hs * (1 - Math.abs(off) * 0.55) * (0.8 + R() * 0.35);
      const ww = wd * ws * (0.45 + R() * 0.25);
      x.save(); x.translate(off * wd * 0.62 * ws, 0); x.rotate(off * 0.35 + (R() - 0.5) * 0.15);
      x.fillStyle = lg(x, 0, 0, 0, -hh, [[0, col], [0.7, col], [1, rgba(col, 0)]]);
      tongue(x, hh, ww, (R() - 0.5) * ww * 0.9 + off * ww * 0.4); x.fill();
      x.restore();
    }
  }
  x.restore(); norm(x);
}
function lightning(x, R, x0, y0, x1, y1, o = {}) {
  const segs = o.segs ?? 9, jit = o.jit ?? 7;
  const pts = [[x0, y0]];
  for (let i = 1; i < segs; i++) {
    const t = i / segs; const nx = -(y1 - y0), ny = x1 - x0; const l = Math.hypot(nx, ny) || 1;
    const j = (R() - 0.5) * jit * 2;
    pts.push([x0 + (x1 - x0) * t + nx / l * j, y0 + (y1 - y0) * t + ny / l * j]);
  }
  pts.push([x1, y1]);
  add(x);
  blur(x, 5, o.col || '#6ab8ff'); x.strokeStyle = rgba(o.col || '#6ab8ff', 0.9); x.lineWidth = o.w ?? 3.2; poly(x, pts, false); x.stroke();
  noBlur(x); x.strokeStyle = '#f4fbff'; x.lineWidth = (o.w ?? 3.2) * 0.38; poly(x, pts, false); x.stroke();
  norm(x);
  return pts;
}
/** Shared final pass: vignette, gloss, bevelled dark border, rarity rim. */
let GRAIN = null;
function grain() {
  if (GRAIN) return GRAIN;
  const S = 128, c = document.createElement('canvas'); c.width = c.height = S;
  const g = c.getContext('2d', { willReadFrequently: true }), img = g.createImageData(S, S), R = rng(77);
  // blotchy low-frequency value noise + fine grain → painted-canvas texture
  const L = 9, lat = []; for (let i = 0; i < L * L; i++) lat.push(R());
  const at = (i, j) => lat[((j % L + L) % L) * L + ((i % L + L) % L)];
  for (let y = 0; y < S; y++) for (let xx = 0; xx < S; xx++) {
    const u = xx / S * (L - 1), v = y / S * (L - 1), i = Math.floor(u), j = Math.floor(v), fu = u - i, fv = v - j;
    const sm = t => t * t * (3 - 2 * t);
    const a = at(i, j) + (at(i + 1, j) - at(i, j)) * sm(fu), b = at(i, j + 1) + (at(i + 1, j + 1) - at(i, j + 1)) * sm(fu);
    const low = a + (b - a) * sm(fv);
    const val = 128 + (low - 0.5) * 70 + (R() - 0.5) * 60;
    const k = (y * S + xx) * 4; img.data[k] = img.data[k + 1] = img.data[k + 2] = val; img.data[k + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  return (GRAIN = c);
}
function finish(x, o) {
  x.globalCompositeOperation = 'soft-light'; x.globalAlpha = 0.55;
  x.drawImage(grain(), 0, 0, 100, 100);
  x.globalCompositeOperation = 'source-over'; x.globalAlpha = 1;
  x.fillStyle = rg(x, 50, 48, 26, 74, [[0, 'rgba(0,0,0,0)'], [1, 'rgba(0,0,0,.62)']]);
  x.fillRect(0, 0, 100, 100);
  x.fillStyle = lg(x, 0, 0, 0, 55, [[0, 'rgba(255,248,230,.13)'], [1, 'rgba(255,248,230,0)']]);
  x.fillRect(0, 0, 100, 55);
  // bevel
  x.lineWidth = 2.4; x.lineCap = 'butt';
  x.strokeStyle = 'rgba(255,236,200,.30)'; poly(x, [[3.6, 96.4], [3.6, 3.6], [96.4, 3.6]], false); x.stroke();
  x.strokeStyle = 'rgba(0,0,0,.55)'; poly(x, [[96.4, 3.6], [96.4, 96.4], [3.6, 96.4]], false); x.stroke();
  x.lineWidth = 3.2; x.strokeStyle = 'rgba(0,0,0,.92)'; x.strokeRect(1.6, 1.6, 96.8, 96.8);
  const rar = o && o.rarity && rarityName(o.rarity);
  if (rar === 'epic' || rar === 'legendary' || (o && o.glow)) {
    const col = rarityColor(rar || 'epic');
    x.lineWidth = 1.6; x.strokeStyle = rgba(col, 0.55); x.strokeRect(4.2, 4.2, 91.6, 91.6);
  }
  x.lineCap = 'round';
}

// ---------------------------------------------------------------- metals & materials
const METAL = {
  steel: ['#ffffff', '#c8d2de', '#7c8898', '#39414d', '#15191f'],
  gold: ['#fffbe0', '#ffd866', '#c48a22', '#6a4208', '#2a1a02'],
  bronze: ['#ffe8c8', '#d8995a', '#8e5424', '#452108', '#1c0c02'],
  iron: ['#d9dde3', '#8d949e', '#4d535c', '#262a30', '#0e1013'],
  silver: ['#ffffff', '#e6ecf5', '#a4afbf', '#5b6574', '#232830'],
  dark: ['#b8b0c8', '#6c6480', '#3a344a', '#1c1826', '#08060c'],
};
function metalLG(x, x0, y0, x1, y1, m = 'steel') {
  const p = typeof m === 'string' ? METAL[m] : m;
  return lg(x, x0, y0, x1, y1, [[0, p[3]], [0.18, p[1]], [0.34, p[0]], [0.5, p[2]], [0.78, p[3]], [1, p[4]]]);
}
/** Tint a metal palette towards a colour (for rarity/tinted gear). */
function tintMetal(base, col, t) { return METAL[base].map((c, i) => mix(c, i < 1 ? '#ffffff' : shade(col, [-0.1, -0.2, -0.45, -0.7, -0.85][i] ?? -0.5), t)); }
function outline(x, col = 'rgba(0,0,0,.85)', w = 1.4) { x.strokeStyle = col; x.lineWidth = w; x.stroke(); }
function rarityGlow(x, o, cx = 50, cy = 50, r = 42) {
  const rar = o && o.rarity && rarityName(o.rarity);
  if (rar === 'rare' || rar === 'epic' || rar === 'legendary') glow(x, cx, cy, r, rarityColor(rar), rar === 'rare' ? 0.35 : 0.5);
}
function itemBG(x, R, o, pal) {
  const rar = o && o.rarity && rarityName(o.rarity);
  pal = pal || ['#6b5a44', '#2a2119', '#070504'];
  if (rar === 'epic' || rar === 'legendary') pal = [mix(pal[0], rarityColor(rar), 0.35), mix(pal[1], rarityColor(rar), 0.18), pal[2]];
  bg(x, R, pal, { n: 22, alpha: 0.1, angle: -0.9 });
}

// ------------------------------------------------------------------ shapes
/** Sword in local coords: hilt at (0,0), blade toward -y. */
function sword(x, o) {
  const L = o.len ?? 70, w = o.w ?? 9, tip = o.tip ?? w * 1.3, m = o.metal || METAL.steel;
  const pal = typeof m === 'string' ? METAL[m] : m;
  const gl = o.grip ?? 13, gw = o.guard ?? w * 2.6;
  if (o.glowCol) { x.save(); blur(x, 7, o.glowCol); x.fillStyle = rgba(o.glowCol, 0.6); poly(x, [[-w / 2, -2], [-w / 2, -L + tip], [0, -L], [w / 2, -L + tip], [w / 2, -2]]); x.fill(); x.restore(); noBlur(x); }
  // blade halves (bevelled)
  x.fillStyle = lg(x, -w / 2, 0, 0, 0, [[0, pal[2]], [1, pal[0]]]);
  poly(x, [[-w / 2, -2], [-w / 2 * (o.taper ?? 0.92), -L + tip], [0, -L], [0, -2]]); x.fill();
  x.fillStyle = lg(x, 0, 0, w / 2, 0, [[0, pal[1]], [1, pal[3]]]);
  poly(x, [[0, -2], [0, -L], [w / 2 * (o.taper ?? 0.92), -L + tip], [w / 2, -2]]); x.fill();
  // fuller
  x.strokeStyle = rgba(pal[3], 0.55); x.lineWidth = w * 0.16; x.beginPath(); x.moveTo(0, -5); x.lineTo(0, -L * 0.72); x.stroke();
  x.strokeStyle = rgba('#ffffff', 0.55); x.lineWidth = 0.7; x.beginPath(); x.moveTo(-w / 2 + 0.6, -3); x.lineTo(-w / 2 * 0.9 + 0.6, -L + tip); x.lineTo(0, -L + 0.8); x.stroke();
  poly(x, [[-w / 2, -2], [-w / 2 * (o.taper ?? 0.92), -L + tip], [0, -L], [w / 2 * (o.taper ?? 0.92), -L + tip], [w / 2, -2]]); outline(x, 'rgba(10,10,14,.9)', 1.1);
  // guard
  const gp = METAL[o.guardMetal || 'gold'];
  x.fillStyle = lg(x, 0, -4, 0, 3, [[0, gp[0]], [0.45, gp[1]], [1, gp[3]]]);
  x.beginPath();
  x.moveTo(-gw / 2, -3); x.quadraticCurveTo(-gw / 2 - 2.5, -5.5, -gw / 2 - 1, -7.2); x.quadraticCurveTo(0, -3.5, gw / 2 + 1, -7.2);
  x.quadraticCurveTo(gw / 2 + 2.5, -5.5, gw / 2, -3); x.quadraticCurveTo(gw / 2, 2.2, 0, 2.6); x.quadraticCurveTo(-gw / 2, 2.2, -gw / 2, -3); x.closePath();
  x.fill(); outline(x, 'rgba(30,16,0,.9)', 1);
  if (o.gem) { x.fillStyle = rg(x, -0.6, -1.4, 0, 2.6, [[0, '#ffffff'], [0.3, o.gem], [1, shade(o.gem, -0.6)]]); circle(x, 0, -0.6, 2.3); x.fill(); outline(x, 'rgba(0,0,0,.7)', 0.6); }
  // grip
  x.fillStyle = lg(x, -2.4, 0, 2.4, 0, [[0, '#2a1508'], [0.4, '#6a3d1c'], [1, '#1c0e04']]);
  x.fillRect(-2.3, 2.5, 4.6, gl);
  x.strokeStyle = 'rgba(0,0,0,.55)'; x.lineWidth = 0.8;
  for (let yy = 4; yy < gl + 2; yy += 2.4) { x.beginPath(); x.moveTo(-2.3, yy); x.lineTo(2.3, yy + 1.4); x.stroke(); }
  // pommel
  x.fillStyle = rg(x, -1, gl + 3, 0.2, 4.2, [[0, gp[0]], [0.5, gp[1]], [1, gp[3]]]);
  circle(x, 0, gl + 4.4, 3.4); x.fill(); outline(x, 'rgba(30,16,0,.9)', 0.9);
}
function axeHead(x, m, s = 1, glowCol) {
  const pal = typeof m === 'string' ? METAL[m] : m;
  x.save(); x.scale(s, s);
  if (glowCol) { blur(x, 8, glowCol); }
  x.beginPath();
  x.moveTo(2, -8); x.bezierCurveTo(12, -12, 20, -22, 22, -30); x.bezierCurveTo(30, -18, 31, 6, 22, 20);
  x.bezierCurveTo(19, 12, 11, 6, 2, 5); x.closePath();
  x.fillStyle = lg(x, 2, -20, 26, 14, [[0, pal[3]], [0.35, pal[1]], [0.55, pal[0]], [0.75, pal[2]], [1, pal[4]]]); x.fill();
  noBlur(x); outline(x, 'rgba(0,0,0,.9)', 1.1);
  // edge highlight
  x.strokeStyle = rgba('#ffffff', 0.75); x.lineWidth = 1.1;
  x.beginPath(); x.moveTo(22.8, -27.5); x.bezierCurveTo(29.5, -16, 30, 5, 22.2, 17.5); x.stroke();
  // back spike
  x.beginPath(); x.moveTo(-2, -5); x.lineTo(-13, -1); x.lineTo(-2, 3); x.closePath();
  x.fillStyle = lg(x, -13, -3, -2, 3, [[0, pal[1]], [1, pal[3]]]); x.fill(); outline(x, 'rgba(0,0,0,.9)', 0.9);
  // socket
  x.fillStyle = lg(x, -3, 0, 3, 0, [[0, pal[3]], [0.5, pal[1]], [1, pal[4]]]); x.fillRect(-3.2, -10, 6.4, 17);
  x.strokeStyle = 'rgba(0,0,0,.8)'; x.lineWidth = 0.9; x.strokeRect(-3.2, -10, 6.4, 17);
  x.restore();
}
function haft(x, x0, y0, x1, y1, w = 5, cols = ['#2b1608', '#8a5a2c', '#1a0c04']) {
  const a = Math.atan2(y1 - y0, x1 - x0), l = Math.hypot(x1 - x0, y1 - y0);
  x.save(); x.translate(x0, y0); x.rotate(a);
  x.fillStyle = lg(x, 0, -w / 2, 0, w / 2, [[0, cols[0]], [0.35, cols[1]], [1, cols[2]]]);
  x.beginPath(); x.roundRect(0, -w / 2, l, w, w / 2); x.fill(); outline(x, 'rgba(0,0,0,.8)', 0.8);
  x.strokeStyle = 'rgba(255,220,170,.18)'; x.lineWidth = 0.6;
  for (let i = 6; i < l - 2; i += 9) { x.beginPath(); x.moveTo(i, -w / 2 + 1); x.quadraticCurveTo(i + 3, 0, i + 1, w / 2 - 1); x.stroke(); }
  x.restore();
}
function wrap(x, x0, y0, x1, y1, w = 6.2, col = '#3a2412') {
  const a = Math.atan2(y1 - y0, x1 - x0), l = Math.hypot(x1 - x0, y1 - y0);
  x.save(); x.translate(x0, y0); x.rotate(a);
  x.fillStyle = lg(x, 0, -w / 2, 0, w / 2, [[0, shade(col, -0.4)], [0.4, shade(col, 0.35)], [1, shade(col, -0.6)]]);
  x.fillRect(0, -w / 2, l, w);
  x.strokeStyle = 'rgba(0,0,0,.6)'; x.lineWidth = 0.7;
  for (let i = 1; i < l; i += 2.2) { x.beginPath(); x.moveTo(i, -w / 2); x.lineTo(i + 1.6, w / 2); x.stroke(); }
  x.restore();
}
function skull(x, cx, cy, s, o = {}) {
  x.save(); x.translate(cx, cy); x.scale(s, s);
  const bone = o.bone || ['#fff8e6', '#d8c9a4', '#8a7650', '#3a2e1c'];
  x.beginPath();
  x.moveTo(-20, -2); x.bezierCurveTo(-22, -26, 22, -26, 20, -2);
  x.bezierCurveTo(20, 6, 16, 9, 14, 12); x.lineTo(12, 22); x.bezierCurveTo(4, 26, -4, 26, -12, 22); x.lineTo(-14, 12);
  x.bezierCurveTo(-16, 9, -20, 6, -20, -2); x.closePath();
  x.fillStyle = rg(x, -6, -10, 2, 32, [[0, bone[0]], [0.4, bone[1]], [0.8, bone[2]], [1, bone[3]]]);
  if (o.glow) { blur(x, 8, o.glow); }
  x.fill(); noBlur(x); outline(x, 'rgba(0,0,0,.85)', 1.2);
  // cracks
  x.strokeStyle = 'rgba(40,24,8,.55)'; x.lineWidth = 0.8;
  x.beginPath(); x.moveTo(-4, -20); x.lineTo(-2, -14); x.lineTo(-5, -9); x.stroke();
  // sockets
  const eye = (ex) => {
    x.beginPath(); x.moveTo(ex - 7, 0); x.bezierCurveTo(ex - 7, -8, ex + 7, -8, ex + 7, 0); x.bezierCurveTo(ex + 6, 5, ex - 6, 5, ex - 7, 0); x.closePath();
    x.fillStyle = '#120806'; x.fill();
    if (o.eyes) { glow(x, ex, -1, 9, o.eyes, 0.9); x.fillStyle = '#ffffff'; circle(x, ex, -1, 1.2); x.fill(); }
  };
  eye(-8.5); eye(8.5);
  x.fillStyle = '#1a0c06'; x.beginPath(); x.moveTo(0, 5); x.lineTo(-3.4, 11); x.lineTo(3.4, 11); x.closePath(); x.fill();
  x.strokeStyle = 'rgba(30,18,6,.9)'; x.lineWidth = 1;
  for (let i = -8; i <= 8; i += 4) { x.beginPath(); x.moveTo(i, 15); x.lineTo(i, 22); x.stroke(); }
  x.beginPath(); x.moveTo(-11, 17); x.lineTo(11, 17); x.stroke();
  x.restore();
}
function hand(x, o = {}) {
  // open palm, fingers up, centered at (0,0), ~ 44 units tall
  x.beginPath();
  x.moveTo(-12, 22); x.bezierCurveTo(-15, 10, -15, 2, -13, -6);
  const fingers = [[-10.5, -6, -22, 5.2], [-4, -8, -30, 5.6], [3, -8, -31, 5.6], [9.5, -6, -25, 5.2]];
  for (const [fx, fy, ty, fw] of fingers) {
    x.lineTo(fx - fw / 2, fy); x.lineTo(fx - fw / 2, ty + fw / 2); x.arc(fx, ty + fw / 2, fw / 2, Math.PI, 0); x.lineTo(fx + fw / 2, fy);
  }
  x.lineTo(13, -2); x.bezierCurveTo(16, -4, 22, -12, 25, -9); x.bezierCurveTo(27, -7, 20, 4, 15, 10);
  x.bezierCurveTo(14, 16, 13, 20, 12, 22); x.closePath();
}
function tome(x, cols = ['#7a1a14', '#f4e6c0']) {
  // open book in slight perspective, centre (0,0)
  x.fillStyle = lg(x, 0, 10, 0, 20, [[0, shade(cols[0], 0.1)], [1, shade(cols[0], -0.6)]]);
  poly(x, [[-34, 8], [0, 14], [34, 8], [34, 13], [0, 20], [-34, 13]]); x.fill(); outline(x);
  for (const sgn of [-1, 1]) {
    x.fillStyle = lg(x, sgn * 30, 0, 0, 0, [[0, shade(cols[1], -0.2)], [0.7, cols[1]], [1, shade(cols[1], -0.35)]]);
    x.beginPath(); x.moveTo(0, 12); x.bezierCurveTo(sgn * 10, 4, sgn * 22, 6, sgn * 32, 8); x.lineTo(sgn * 30, -12);
    x.bezierCurveTo(sgn * 20, -14, sgn * 8, -14, 0, -8); x.closePath(); x.fill(); outline(x, 'rgba(60,30,10,.8)', 0.9);
    x.strokeStyle = 'rgba(90,60,30,.45)'; x.lineWidth = 0.7;
    for (let i = 0; i < 5; i++) { const yy = -7 + i * 3.4; x.beginPath(); x.moveTo(sgn * 6, yy + 1); x.quadraticCurveTo(sgn * 16, yy - 1.5, sgn * 26, yy + 0.4); x.stroke(); }
  }
}
function flask(x, liquid, o = {}) {
  // round-bottom flask centred at (0,8)
  const body = () => { x.beginPath(); x.arc(0, 12, 24, -Math.PI / 2 - 0.32, -Math.PI / 2 + 0.32, true); x.lineTo(7.5, -18); x.lineTo(-7.5, -18); x.closePath(); };
  body(); x.fillStyle = 'rgba(20,30,40,.55)'; x.fill();
  x.save(); body(); x.clip();
  x.fillStyle = rg(x, -4, 14, 2, 30, [[0, shade(liquid, 0.55)], [0.35, liquid], [1, shade(liquid, -0.65)]]);
  x.fillRect(-30, o.level ?? -2, 60, 50);
  x.fillStyle = rgba(shade(liquid, 0.6), 0.8); ellipse(x, 0, o.level ?? -2, 22, 2.6); x.fill();
  glow(x, -2, 14, 22, liquid, 0.4);
  // bubbles
  x.fillStyle = 'rgba(255,255,255,.55)'; for (const [bx, by, br] of [[-8, 18, 1.4], [5, 8, 1], [9, 22, 1.8], [-2, 4, 0.8]]) { circle(x, bx, by, br); x.fill(); }
  x.restore();
  body(); outline(x, 'rgba(0,0,0,.9)', 1.4);
  // glass highlights
  x.strokeStyle = 'rgba(255,255,255,.7)'; x.lineWidth = 2; x.beginPath(); x.arc(0, 12, 19, -2.6, -1.9); x.stroke();
  x.strokeStyle = 'rgba(255,255,255,.35)'; x.lineWidth = 1.2; x.beginPath(); x.arc(0, 12, 19, 0.5, 1.2); x.stroke();
  x.fillStyle = 'rgba(255,255,255,.5)'; x.fillRect(-5.5, -17, 2, 8);
  // lip + cork
  x.fillStyle = lg(x, -9, 0, 9, 0, [[0, '#6c7a86'], [0.4, '#e8f4ff'], [1, '#3a444c']]);
  x.beginPath(); x.roundRect(-9.5, -21, 19, 4, 2); x.fill(); outline(x, 'rgba(0,0,0,.8)', 0.9);
  x.fillStyle = lg(x, -7, 0, 7, 0, [[0, '#5a3414'], [0.4, '#c08a50'], [1, '#3a200a']]);
  x.beginPath(); x.moveTo(-6.5, -21); x.lineTo(-7.5, -31); x.quadraticCurveTo(0, -33.5, 7.5, -31); x.lineTo(6.5, -21); x.closePath(); x.fill(); outline(x, 'rgba(0,0,0,.8)', 0.9);
}
function gemShape(x, cx, cy, r, col, o = {}) {
  const n = o.n ?? 8, pts = [], inner = [];
  for (let i = 0; i < n; i++) { const a = -Math.PI / 2 + i / n * TAU; pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r * (o.sy ?? 1)]); inner.push([cx + Math.cos(a) * r * 0.55, cy + Math.sin(a) * r * 0.55 * (o.sy ?? 1)]); }
  if (o.glow !== false) glow(x, cx, cy, r * 2.1, col, 0.5);
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n, lit = 0.5 + 0.5 * Math.cos((i + 0.5) / n * TAU + 2.3);
    x.fillStyle = mix(shade(col, -0.65), shade(col, 0.55), lit);
    poly(x, [pts[i], pts[j], inner[j], inner[i]]); x.fill();
  }
  x.fillStyle = rg(x, cx - r * 0.2, cy - r * 0.25, 0, r * 0.7, [[0, shade(col, 0.75)], [0.5, col], [1, shade(col, -0.3)]]);
  poly(x, inner); x.fill();
  poly(x, pts); outline(x, 'rgba(0,0,0,.85)', 1);
  x.strokeStyle = rgba('#ffffff', 0.35); x.lineWidth = 0.5; for (let i = 0; i < n; i++) { x.beginPath(); x.moveTo(pts[i][0], pts[i][1]); x.lineTo(inner[i][0], inner[i][1]); x.stroke(); }
  sparkle(x, cx - r * 0.3, cy - r * 0.35, r * 0.55);
}
function wingFeathers(x, R, side, cols, n = 7, s = 1) {
  // a feathered wing sweeping up/outward from (0,0); side = 1 right, -1 left
  x.save(); x.scale(side * s, s);
  for (let i = n - 1; i >= 0; i--) {
    const t = i / (n - 1), a = -1.2 + t * 1.25, len = 26 + (1 - Math.abs(t - 0.3)) * 12;
    x.save(); x.rotate(a);
    x.beginPath(); x.moveTo(0, 0); x.bezierCurveTo(len * 0.3, -4.5, len * 0.8, -4.2, len, 0); x.bezierCurveTo(len * 0.8, 3.2, len * 0.3, 3.4, 0, 0); x.closePath();
    x.fillStyle = lg(x, 0, -4, 0, 4, [[0, cols[0]], [0.5, cols[1]], [1, cols[2]]]); x.fill(); outline(x, 'rgba(0,0,0,.6)', 0.6);
    x.strokeStyle = rgba(cols[0], 0.6); x.lineWidth = 0.5; x.beginPath(); x.moveTo(2, 0); x.lineTo(len - 2, 0); x.stroke();
    x.restore();
  }
  x.restore();
}
function dragonHead(x, R, pal) {
  // side profile facing left, centred ~ (50,52)
  x.beginPath();
  x.moveTo(80, 92); x.bezierCurveTo(74, 70, 72, 60, 66, 52); // neck back
  x.bezierCurveTo(70, 40, 74, 30, 90, 16); // horn base sweep
  x.bezierCurveTo(72, 22, 62, 28, 54, 32); // brow
  x.bezierCurveTo(44, 30, 30, 32, 18, 40); // snout top
  x.bezierCurveTo(12, 42, 10, 46, 13, 49); // nose
  x.bezierCurveTo(22, 51, 30, 52, 38, 54); // upper jaw
  x.lineTo(24, 62); x.bezierCurveTo(30, 64, 38, 64, 44, 62); // lower jaw
  x.bezierCurveTo(48, 70, 50, 80, 48, 92); x.closePath();
  x.fillStyle = rg(x, 46, 40, 4, 60, [[0, pal[0]], [0.35, pal[1]], [0.8, pal[2]], [1, pal[3]]]);
  x.fill(); outline(x, 'rgba(0,0,0,.9)', 1.3);
  // scales / ridges
  x.strokeStyle = rgba(pal[3], 0.7); x.lineWidth = 1;
  for (let i = 0; i < 6; i++) { x.beginPath(); x.arc(58 + i * 3, 60 + i * 5.5, 6, 0.2, 1.8); x.stroke(); }
  // horns
  for (const [hx, hy, ex, ey] of [[64, 34, 96, 6], [58, 36, 84, 14]]) {
    ribbon(x, qbez([hx, hy], [(hx + ex) / 2 + 4, (hy + ey) / 2 + 8], [ex, ey]), t => 7 * (1 - t) + 0.3, 20);
    x.fillStyle = lg(x, hx, hy, ex, ey, [[0, '#3a2a1a'], [0.5, '#c8b08a'], [1, '#fff4dc']]); x.fill(); outline(x, 'rgba(0,0,0,.8)', 0.8);
  }
  // teeth
  x.fillStyle = '#fff8e8';
  for (const tx of [22, 28, 34]) { poly(x, [[tx, 53], [tx + 2.4, 53.5], [tx + 1, 58]]); x.fill(); }
  // eye
  glow(x, 45, 38, 10, pal[4] || '#ffd040', 0.9);
  x.fillStyle = pal[4] || '#ffd040'; ellipse(x, 45, 38.5, 3.8, 2); x.fill();
  x.fillStyle = '#000'; ellipse(x, 45, 38.5, 0.9, 2); x.fill();
  // nostril smoke/fire
}

// ------------------------------------------------------------------ painters
const PAL = {
  fire: ['#ffac40', '#7a1c04', '#120300'],
  frost: ['#8cd8ff', '#12407e', '#020916'],
  arcane: ['#ff9eff', '#5a1a8a', '#0b0216'],
  holy: ['#fff2b8', '#a0701c', '#180d02'],
  shadow: ['#9d74ff', '#2c0c4e', '#040008'],
  nature: ['#c6ff8a', '#206014', '#030a02'],
  blood: ['#ff8a5a', '#721008', '#110201'],
  steel: ['#c8d4e0', '#34404e', '#06080b'],
  earth: ['#e8b878', '#5a3818', '#0c0602'],
  storm: ['#b8d8ff', '#26407a', '#04081a'],
  gold: ['#ffe6a0', '#8a5a14', '#140a02'],
};

const PAINT = {
  // ===================================================== WARRIOR
  valiantStrike(x, R) {
    bg(x, R, ['#ffb060', '#8a2a08', '#140402'], { angle: 0.8, strokes: ['#ff9a40', '#6a1804', '#2a0802'] });
    // slash arc
    add(x);
    for (let i = 0; i < 3; i++) {
      x.strokeStyle = rgba(['#ff7a20', '#ffc860', '#fff8e0'][i], [0.5, 0.7, 0.95][i]);
      x.lineWidth = [11, 6, 2.2][i]; blur(x, [10, 6, 3][i], '#ffb040');
      x.beginPath(); x.arc(54, 58, 36, -2.7, -0.55); x.stroke();
    }
    noBlur(x); norm(x);
    x.save(); x.translate(30, 76); x.rotate(0.72); sword(x, { len: 64, w: 9.5, metal: 'steel', gem: '#ff3a20' }); x.restore();
    sparkle(x, 76, 22, 9, '#ffe0a0', 0.3);
    embers(x, R, 14, 60, 40, 34, ['#ffb040', '#ffe080']);
  },
  charge(x, R) {
    bg(x, R, ['#e08a50', '#5e1c0a', '#100402'], { angle: 0, spread: 0.2, len: 44, w: 5, n: 30 });
    // speed streaks
    add(x);
    for (let i = 0; i < 12; i++) { const yy = 18 + R() * 70, len = 20 + R() * 34; x.strokeStyle = rgba('#ffd8a0', 0.18 + R() * 0.3); x.lineWidth = 0.8 + R() * 2.2; x.beginPath(); x.moveTo(62 + R() * 30, yy); x.lineTo(62 + R() * 30 - len, yy + (R() - 0.5) * 3); x.stroke(); }
    norm(x);
    // dust cloud behind
    for (let i = 0; i < 9; i++) { x.fillStyle = rgba(['#c8a070', '#8a6440', '#e0c090'][i % 3], 0.25); circle(x, 70 + R() * 26, 68 + R() * 24, 6 + R() * 8); x.fill(); }
    // horned helm leaning forward
    x.save(); x.translate(42, 54); x.rotate(-0.25);
    for (const s of [-1, 1]) {
      ribbon(x, bez([s * 14, -8], [s * 30, -10], [s * 34, -26], [s * 26, -40]), t => 10 * (1 - t) + 0.5, 24);
      x.fillStyle = lg(x, s * 14, -8, s * 26, -40, [[0, '#6a5030'], [0.4, '#e8d6b0'], [1, '#fffaf0']]); x.fill(); outline(x, 'rgba(0,0,0,.85)', 1);
      x.strokeStyle = 'rgba(80,60,30,.5)'; x.lineWidth = 0.7;
      for (let k = 1; k < 5; k++) { const p = bez([s * 14, -8], [s * 30, -10], [s * 34, -26], [s * 26, -40])(k / 6); x.beginPath(); x.arc(p[0], p[1], 3.5 * (1 - k / 6) + 1, 0, Math.PI); x.stroke(); }
    }
    x.beginPath(); x.moveTo(-19, 6); x.bezierCurveTo(-21, -24, 21, -24, 19, 6); x.lineTo(16, 20); x.lineTo(5, 22); x.lineTo(4, 2); x.lineTo(-4, 2); x.lineTo(-5, 22); x.lineTo(-16, 20); x.closePath();
    x.fillStyle = rg(x, -7, -12, 1, 32, [[0, '#ffffff'], [0.25, '#b8c2cc'], [0.6, '#56606c'], [1, '#1a1e24']]); x.fill(); outline(x, 'rgba(0,0,0,.9)', 1.3);
    x.fillStyle = lg(x, -20, 0, 20, 0, [[0, '#6a4410'], [0.4, '#ffd070'], [1, '#6a4410']]); x.fillRect(-19.5, -3, 39, 4.6); x.strokeStyle = 'rgba(0,0,0,.8)'; x.lineWidth = 0.8; x.strokeRect(-19.5, -3, 39, 4.6);
    x.fillStyle = '#ffe8a0'; for (let i = -16; i <= 16; i += 5.3) { circle(x, i, -0.7, 0.9); x.fill(); }
    x.fillStyle = '#0a0806'; poly(x, [[-15, 4], [-5, 4], [-5, 11], [-13, 10]]); x.fill(); poly(x, [[15, 4], [5, 4], [5, 11], [13, 10]]); x.fill();
    glow(x, -9, 7, 5, '#ff5020', 0.8); glow(x, 9, 7, 5, '#ff5020', 0.8);
    x.restore();
  },
  rend(x, R) {
    bg(x, R, ['#b86a50', '#4a1810', '#0c0202'], { angle: 0.9, strokes: ['#6a2a1a', '#2a0a06', '#8a4030'] });
    // hide texture
    brush(x, R, 40, ['#3a120a', '#7a3020'], { angle: 1.2, len: 10, w: 2, alpha: 0.25 });
    for (let i = 0; i < 3; i++) {
      const ox = 28 + i * 16, oy = 18 + i * 4;
      const f = bez([ox, oy], [ox + 10, oy + 20], [ox + 4, oy + 42], [ox - 6, oy + 64]);
      ribbon(x, f, t => Math.sin(t * Math.PI) * 9 + 0.6, 30);
      x.fillStyle = '#1a0202'; x.fill();
      ribbon(x, f, t => Math.sin(t * Math.PI) * 6 + 0.3, 30);
      x.fillStyle = lg(x, ox - 5, oy, ox + 10, oy + 60, [[0, '#ff3020'], [0.5, '#a00808'], [1, '#400000']]); x.fill();
      x.strokeStyle = rgba('#ff9a80', 0.8); x.lineWidth = 0.8; strokeCurve(x, t => { const p = f(t); return [p[0] - Math.sin(t * Math.PI) * 3.4, p[1]]; }); x.stroke();
      // drips
      const p = f(0.55 + i * 0.08);
      x.fillStyle = '#b00a0a'; x.beginPath(); x.moveTo(p[0] - 1.5, p[1]); x.quadraticCurveTo(p[0], p[1] + 14 + i * 3, p[0] + 1.5, p[1]); x.fill();
      x.fillStyle = '#d01010'; circle(x, p[0], p[1] + 12 + i * 3, 1.7); x.fill();
    }
    glow(x, 50, 50, 40, '#ff2010', 0.2);
  },
  thunderclap(x, R) {
    bg(x, R, ['#7aa0d8', '#1a2a50', '#04060e'], { cy: 70, angle: -1.4, strokes: ['#3a5a9a', '#0a1428', '#8ab0e0'] });
    // ground
    x.fillStyle = lg(x, 0, 60, 0, 100, [[0, '#3a3024'], [1, '#0c0a08']]); x.fillRect(0, 66, 100, 34);
    // cracks
    x.strokeStyle = '#9ad0ff'; x.lineWidth = 1.2; blur(x, 4, '#60b0ff');
    for (let i = 0; i < 7; i++) { const a = Math.PI + i / 6 * Math.PI; x.beginPath(); x.moveTo(50, 76); let px = 50, py = 76; for (let k = 0; k < 4; k++) { px += Math.cos(a + (R() - 0.5) * 0.8) * 7; py -= Math.sin(a + (R() - 0.5) * 0.8) * 2.2; x.lineTo(px, py); } x.stroke(); }
    noBlur(x);
    // shockwave rings
    add(x);
    for (let i = 0; i < 3; i++) { x.strokeStyle = rgba('#a8dcff', 0.75 - i * 0.2); x.lineWidth = 4 - i; blur(x, 8, '#50a8ff'); ellipse(x, 50, 76, 20 + i * 13, 6 + i * 4); x.stroke(); }
    noBlur(x); norm(x);
    glow(x, 50, 74, 30, '#80c8ff', 0.8);
    // hammer head striking
    x.save(); x.translate(50, 44); x.rotate(0.12);
    haft(x, 0, -2, 0, -44, 5.5);
    x.fillStyle = metalLG(x, -18, 0, 18, 0, 'iron'); x.beginPath(); x.roundRect(-19, -3, 38, 22, 3); x.fill(); outline(x, 'rgba(0,0,0,.9)', 1.2);
    x.fillStyle = lg(x, 0, -3, 0, 19, [[0, 'rgba(255,255,255,.35)'], [0.5, 'rgba(255,255,255,0)'], [1, 'rgba(0,0,0,.4)']]); x.beginPath(); x.roundRect(-19, -3, 38, 22, 3); x.fill();
    x.fillStyle = lg(x, -18, 0, 18, 0, [[0, '#6a4410'], [0.4, '#ffd070'], [1, '#6a4410']]); x.fillRect(-4, -3, 8, 22);
    x.restore();
    lightning(x, R, 18, 10, 36, 60, { jit: 5 }); lightning(x, R, 84, 8, 64, 62, { jit: 5, w: 2.6 });
    sparkle(x, 50, 72, 12, '#c0e8ff');
  },
  cleave(x, R) {
    bg(x, R, ['#ff9a60', '#6a1206', '#100202'], { angle: -0.2, strokes: ['#ff6030', '#4a0a04', '#a02a10'] });
    add(x);
    for (let k = 0; k < 2; k++) for (let i = 0; i < 3; i++) {
      x.strokeStyle = rgba(['#ff5010', '#ffa040', '#fff0c8'][i], [0.4, 0.6, 0.95][i] * (k ? 0.55 : 1));
      x.lineWidth = [12, 6, 2][i] * (k ? 0.7 : 1); blur(x, 8, '#ff8030');
      x.beginPath(); x.arc(50, 64 + k * 10, 38 - k * 12, Math.PI * 1.05, Math.PI * 1.95); x.stroke();
    }
    noBlur(x); norm(x);
    x.save(); x.translate(64, 30); x.rotate(0.55);
    haft(x, 0, 0, 0, 58, 5.5);
    x.save(); x.scale(-1, 1); axeHead(x, 'steel', 1.25); x.restore();
    x.restore();
    embers(x, R, 16, 50, 50, 42, ['#ff9a40', '#ffd080', '#ff5020']);
  },
  victoryRush(x, R) {
    bg(x, R, ['#ffe6a0', '#8a5010', '#120802'], { cy: 30, angle: -1.57, spread: 0.3, strokes: ['#ffd070', '#6a3a08'] });
    // radiant rays
    add(x);
    for (let i = 0; i < 16; i++) { const a = -Math.PI / 2 + (i - 7.5) * 0.16; x.fillStyle = rgba('#fff0b0', 0.08 + R() * 0.1); poly(x, [[50, 34], [50 + Math.cos(a - 0.04) * 90, 34 + Math.sin(a - 0.04) * 90], [50 + Math.cos(a + 0.04) * 90, 34 + Math.sin(a + 0.04) * 90]]); x.fill(); }
    norm(x);
    glow(x, 50, 26, 30, '#fff0a0', 0.9);
    x.save(); x.translate(50, 86); sword(x, { len: 72, w: 10, metal: 'gold', guardMetal: 'gold', gem: '#40ff60' }); x.restore();
    // green healing motes
    for (let i = 0; i < 9; i++) { const px = 16 + R() * 68, py = 30 + R() * 60; glow(x, px, py, 5, '#60ff70', 0.9); sparkle(x, px, py, 2.4, '#b0ffb0'); }
  },
  mortalBlow(x, R) {
    bg(x, R, ['#a02a24', '#3a0404', '#050000'], { angle: 1.2, strokes: ['#6a0808', '#200000'] });
    // cracked dark wound burst
    x.fillStyle = rg(x, 50, 66, 0, 28, [[0, '#000000'], [0.6, '#2a0000'], [1, 'rgba(60,0,0,0)']]); circle(x, 50, 66, 28); x.fill();
    x.strokeStyle = '#ff3020'; x.lineWidth = 1.4; blur(x, 5, '#ff1000');
    for (let i = 0; i < 9; i++) { const a = i / 9 * TAU + R() * 0.3; x.beginPath(); x.moveTo(50, 66); let px = 50, py = 66; for (let k = 0; k < 4; k++) { px += Math.cos(a + (R() - 0.5)) * 6; py += Math.sin(a + (R() - 0.5)) * 6; x.lineTo(px, py); } x.stroke(); }
    noBlur(x);
    // blade stabbing down
    x.save(); x.translate(64, 30); x.rotate(Math.PI + 0.42);
    sword(x, { len: 44, w: 14, metal: 'dark', guardMetal: 'iron', taper: 0.7, tip: 16, grip: 12, guard: 30, gem: '#ff2010', glowCol: '#ff2a10' });
    x.restore();
    // blood spray
    for (let i = 0; i < 18; i++) { const a = -Math.PI / 2 + (R() - 0.5) * 2.6, d = 8 + R() * 30; x.fillStyle = rgba(['#c00808', '#ff2a10', '#7a0000'][i % 3], 0.9); circle(x, 50 + Math.cos(a) * d, 66 + Math.sin(a) * d, 0.6 + R() * 1.8); x.fill(); }
    glow(x, 50, 66, 14, '#ff2010', 0.7);
  },
  execute(x, R) {
    bg(x, R, ['#ff4a2a', '#5a0404', '#080000'], { cy: 60, angle: 0.4, strokes: ['#a01008', '#300000'] });
    skull(x, 66, 74, 0.62, { eyes: '#ff3010' });
    x.save(); x.translate(40, 30); x.rotate(0.62);
    haft(x, 0, -10, 0, 76, 7);
    axeHead(x, 'dark', 1.7, '#ff2010');
    x.restore();
    embers(x, R, 12, 50, 40, 40, ['#ff5020', '#ffa060']);
  },
  whirlwind(x, R) {
    bg(x, R, ['#d8c8a8', '#4a4034', '#0a0806'], { angle: 0.5, strokes: ['#a89878', '#3a3024'] });
    // vortex arcs
    add(x);
    for (let i = 0; i < 10; i++) {
      x.strokeStyle = rgba(i % 2 ? '#ffffff' : '#d8e4f0', 0.18 + R() * 0.3); x.lineWidth = 1 + R() * 3;
      const r = 12 + i * 3.6, a0 = R() * TAU; x.beginPath(); x.arc(50, 50, r, a0, a0 + 1.4 + R()); x.stroke();
    }
    norm(x);
    for (let k = 0; k < 3; k++) {
      x.save(); x.translate(50, 50); x.rotate(k * TAU / 3 + 0.3);
      x.translate(0, -4);
      x.save(); x.rotate(-0.25); sword(x, { len: 44, w: 8, metal: 'steel', grip: 7, guard: 16 }); x.restore();
      x.restore();
    }
    glow(x, 50, 50, 16, '#ffffff', 0.4);
    for (let i = 0; i < 20; i++) { x.fillStyle = rgba('#8a7050', 0.5); circle(x, 50 + (R() - 0.5) * 90, 70 + R() * 26, 1 + R() * 2); x.fill(); }
  },
  battleShout(x, R) {
    bg(x, R, ['#ff9a4a', '#7a1206', '#120200'], { angle: 0, strokes: ['#c02a10', '#4a0804'] });
    // sound waves
    add(x);
    for (let i = 0; i < 4; i++) { x.strokeStyle = rgba('#ffe0a0', 0.75 - i * 0.15); x.lineWidth = 3.2 - i * 0.5; blur(x, 5, '#ffa040'); x.beginPath(); x.arc(58, 36, 14 + i * 9, -1.2, 0.5); x.stroke(); }
    noBlur(x); norm(x);
    const f = bez([14, 84], [24, 74], [30, 52], [60, 36]);
    ribbon(x, f, t => 3.5 + Math.pow(t, 2.2) * 26, 36);
    x.fillStyle = lg(x, 14, 84, 66, 30, [[0, '#4a3018'], [0.45, '#e8d2a8'], [0.8, '#fff6e0'], [1, '#c8a878']]); x.fill(); outline(x, 'rgba(0,0,0,.9)', 1.2);
    // gold bands
    for (const t of [0.22, 0.55, 0.9]) {
      const p = f(t), q = f(t + 0.04); const w = 3.5 + Math.pow(t, 2.2) * 26;
      const a = Math.atan2(q[1] - p[1], q[0] - p[0]);
      x.save(); x.translate(p[0], p[1]); x.rotate(a);
      x.fillStyle = lg(x, 0, -w / 2, 0, w / 2, [[0, '#5a3a08'], [0.35, '#ffe07a'], [1, '#6a4208']]); x.fillRect(-1.8, -w / 2 - 0.8, 3.6, w + 1.6);
      x.strokeStyle = 'rgba(0,0,0,.8)'; x.lineWidth = 0.7; x.strokeRect(-1.8, -w / 2 - 0.8, 3.6, w + 1.6);
      x.restore();
    }
    // bell mouth
    const p = f(1); x.fillStyle = '#2a1a0a'; ellipse(x, p[0] + 0.5, p[1] + 0.5, 4, 13.6, 0.9); x.fill(); outline(x, 'rgba(255,220,160,.6)', 0.8);
    embers(x, R, 8, 70, 30, 24, ['#ffe0a0']);
  },

  // ===================================================== MAGE
  fireball(x, R) {
    bg(x, R, ['#d8561a', '#4a0c02', '#0c0200'], { angle: -0.75, strokes: ['#a02a08', '#300802', '#ff7a30'] });
    fire(x, R, 60, 40, 58, 30, Math.PI * 1.25 + 0.05, { n: 6 });
    glow(x, 60, 40, 34, '#ff7a1a', 0.9);
    x.fillStyle = rg(x, 58, 38, 1, 18, [[0, '#ffffff'], [0.25, '#fff2a0'], [0.55, '#ffb030'], [0.85, '#e0500a'], [1, 'rgba(200,40,0,0)']]);
    circle(x, 60, 40, 18); x.fill();
    add(x); x.fillStyle = rg(x, 57, 37, 0, 9, [[0, 'rgba(255,255,255,1)'], [1, 'rgba(255,240,180,0)']]); circle(x, 57, 37, 9); x.fill(); norm(x);
    embers(x, R, 16, 44, 56, 32, ['#ffb040', '#ff6a10', '#ffe070']);
  },
  frostbolt(x, R) {
    bg(x, R, ['#6ab8f0', '#0e2e62', '#01050e'], { angle: -0.75, strokes: ['#2a70c0', '#081a3a', '#a0d8ff'] });
    // misty trail
    add(x);
    for (let i = 0; i < 7; i++) { const t = i / 7; glow(x, 30 - t * 20 + R() * 6, 70 + t * 18 + R() * 6, 12 - t * 5, '#6ac0ff', 0.35); }
    for (let i = 0; i < 18; i++) { const t = R(); x.strokeStyle = rgba('#d8f0ff', 0.25 + R() * 0.4); x.lineWidth = 0.6 + R() * 1.4; const px = 58 - t * 50, py = 42 + t * 50 + (R() - 0.5) * 16; x.beginPath(); x.moveTo(px, py); x.lineTo(px - 8 - R() * 8, py + 8 + R() * 8); x.stroke(); }
    norm(x);
    // crystal
    x.save(); x.translate(56, 44); x.rotate(Math.PI / 4);
    const L = 34, W = 11;
    blur(x, 12, '#58b8ff');
    const facets = [
      [[[0, -L], [-W, -L * 0.2], [0, -L * 0.05]], '#f4fcff'], [[[0, -L], [0, -L * 0.05], [W, -L * 0.2]], '#8ad0ff'],
      [[[-W, -L * 0.2], [0, L * 0.75], [0, -L * 0.05]], '#5ab0f0'], [[[W, -L * 0.2], [0, -L * 0.05], [0, L * 0.75]], '#1a5aa8'],
    ];
    for (const [pts, col] of facets) { x.fillStyle = col; poly(x, pts); x.fill(); }
    noBlur(x);
    poly(x, [[0, -L], [-W, -L * 0.2], [0, L * 0.75], [W, -L * 0.2]]); outline(x, 'rgba(0,10,30,.9)', 1.1);
    x.strokeStyle = 'rgba(255,255,255,.9)'; x.lineWidth = 0.8; x.beginPath(); x.moveTo(0, -L + 1); x.lineTo(-W + 1.5, -L * 0.2); x.stroke();
    // side shards
    for (const s of [-1, 1]) { x.fillStyle = s < 0 ? '#c8ecff' : '#3a88d8'; poly(x, [[s * 4, 2], [s * 13, 14], [s * 2, 12]]); x.fill(); outline(x, 'rgba(0,10,30,.8)', 0.7); }
    x.restore();
    glow(x, 48, 50, 18, '#bfe8ff', 0.6);
    sparkle(x, 72, 26, 8, '#e0f6ff', 0.2); sparkle(x, 30, 56, 4, '#e0f6ff'); sparkle(x, 22, 80, 3, '#e0f6ff');
  },
  fireBlast(x, R) {
    bg(x, R, ['#ff9a30', '#6a1402', '#0e0200'], { angle: 0, spread: 3, strokes: ['#ff6a10', '#300602'] });
    const burst = (cx, cy, r0, r1, n, cols) => {
      for (let c = 0; c < cols.length; c++) {
        const s = 1 - c * 0.22;
        x.beginPath();
        for (let i = 0; i <= n * 2; i++) { const a = i / (n * 2) * TAU + c * 0.2, rr = (i % 2 ? r0 : r1 * (0.7 + R() * 0.45)) * s; const px = cx + Math.cos(a) * rr, py = cy + Math.sin(a) * rr; i ? x.lineTo(px, py) : x.moveTo(px, py); }
        x.closePath(); x.globalCompositeOperation = c ? 'lighter' : 'source-over';
        x.fillStyle = rg(x, cx, cy, 0, r1 * s, [[0, cols[c]], [1, rgba(cols[c], c ? 0.2 : 0.9)]]); x.fill();
      }
      norm(x);
    };
    burst(50, 52, 14, 44, 13, ['#a01a02', '#ff5a10', '#ffb030', '#fff2b0']);
    glow(x, 50, 52, 26, '#ffd060', 0.9);
    burst(24, 26, 4, 12, 7, ['#c02a04', '#ffa030', '#fff0c0']);
    burst(78, 76, 4, 11, 7, ['#c02a04', '#ffa030', '#fff0c0']);
    embers(x, R, 24, 50, 52, 46, ['#ffd070', '#ff8020', '#ffffff']);
    x.fillStyle = rg(x, 50, 52, 0, 10, [[0, '#ffffff'], [1, 'rgba(255,255,220,0)']]); circle(x, 50, 52, 10); x.fill();
  },
  frostNova(x, R) {
    bg(x, R, ['#9ad8ff', '#16407e', '#010612'], { angle: 0, spread: 3, strokes: ['#3a80c8', '#0a2040'] });
    // frost floor ring
    x.fillStyle = rg(x, 50, 54, 8, 44, [[0, 'rgba(220,245,255,.9)'], [0.6, 'rgba(120,190,255,.4)'], [1, 'rgba(40,90,180,0)']]); ellipse(x, 50, 54, 44, 40); x.fill();
    // spikes around
    const n = 12;
    for (let i = 0; i < n; i++) {
      const a = i / n * TAU + 0.13, rr = 20 + (i % 2) * 6;
      const bx = 50 + Math.cos(a) * rr * 0.6, by = 54 + Math.sin(a) * rr * 0.6;
      const tx = 50 + Math.cos(a) * (rr + 18), ty = 54 + Math.sin(a) * (rr + 18) - 6;
      const nx = -Math.sin(a) * 4.2, ny = Math.cos(a) * 4.2;
      x.fillStyle = lg(x, bx, by, tx, ty, [[0, '#2a6ab8'], [0.6, '#a8e0ff'], [1, '#ffffff']]);
      poly(x, [[bx + nx, by + ny], [tx, ty], [bx - nx, by - ny]]); x.fill(); outline(x, 'rgba(0,20,60,.8)', 0.7);
      x.strokeStyle = 'rgba(255,255,255,.8)'; x.lineWidth = 0.6; x.beginPath(); x.moveTo(bx, by); x.lineTo(tx, ty); x.stroke();
    }
    glow(x, 50, 54, 20, '#e8f8ff', 1);
    sparkle(x, 50, 54, 14, '#ffffff');
    for (let i = 0; i < 10; i++) sparkle(x, 10 + R() * 80, 10 + R() * 80, 1.5 + R() * 2.5, '#d8f4ff', R());
  },
  blink(x, R) {
    bg(x, R, ['#c890ff', '#3a1470', '#07020f'], { angle: -0.75, strokes: ['#8a50e0', '#1a0838', '#d8b0ff'] });
    const portal = (cx, cy, s) => {
      add(x);
      for (let i = 0; i < 3; i++) { x.strokeStyle = rgba(['#8a40ff', '#d090ff', '#ffffff'][i], [0.6, 0.8, 0.9][i]); x.lineWidth = [6, 3, 1.2][i] * s; blur(x, 8, '#b070ff'); ellipse(x, cx, cy, 14 * s, 6 * s, -0.6); x.stroke(); }
      noBlur(x); norm(x);
      glow(x, cx, cy, 14 * s, '#c080ff', 0.8);
    };
    portal(26, 76, 1); portal(74, 26, 1.15);
    // streak
    add(x);
    for (let i = 0; i < 3; i++) { x.strokeStyle = rgba(['#9a50ff', '#e0b0ff', '#ffffff'][i], [0.5, 0.7, 1][i]); x.lineWidth = [9, 4, 1.4][i]; blur(x, 6, '#c080ff'); x.beginPath(); x.moveTo(28, 74); x.bezierCurveTo(40, 58, 58, 46, 72, 28); x.stroke(); }
    noBlur(x); norm(x);
    for (let i = 0; i < 14; i++) { const t = R(); const p = bez([28, 74], [40, 58], [58, 46], [72, 28])(t); sparkle(x, p[0] + (R() - 0.5) * 16, p[1] + (R() - 0.5) * 16, 1.2 + R() * 2.5, '#f0d8ff', R()); }
    sparkle(x, 74, 26, 10, '#ffffff');
  },
  flamestrike(x, R) {
    bg(x, R, ['#ff8a2a', '#5a1002', '#0a0200'], { cy: 70, angle: 1.57, spread: 0.3, strokes: ['#ff5a10', '#2a0400'] });
    // rune circle
    add(x);
    x.strokeStyle = rgba('#ffb040', 0.9); x.lineWidth = 2.4; blur(x, 8, '#ff7010'); ellipse(x, 50, 78, 38, 12); x.stroke();
    x.lineWidth = 1.2; ellipse(x, 50, 78, 30, 9); x.stroke();
    for (let i = 0; i < 12; i++) { const a = i / 12 * TAU; const px = 50 + Math.cos(a) * 34, py = 78 + Math.sin(a) * 10.5; x.fillStyle = '#ffe0a0'; x.fillRect(px - 0.8, py - 1.6, 1.6, 3.2); }
    noBlur(x); norm(x);
    glow(x, 50, 76, 36, '#ff6a10', 0.8);
    // descending pillar
    fire(x, R, 50, 80, 72, 40, 0, { n: 7 });
    x.fillStyle = lg(x, 0, 0, 0, 80, [[0, 'rgba(255,220,140,0)'], [0.6, 'rgba(255,240,200,.35)'], [1, 'rgba(255,255,255,.8)']]);
    add(x); poly(x, [[40, 0], [60, 0], [56, 80], [44, 80]]); x.fill(); norm(x);
    embers(x, R, 22, 50, 50, 44, ['#ffd070', '#ff7a20']);
  },
  pyroblast(x, R) {
    bg(x, R, ['#ff6a1a', '#5a0602', '#0a0000'], { angle: -0.8, strokes: ['#c02008', '#200000', '#ff9a40'] });
    fire(x, R, 60, 40, 66, 44, Math.PI * 1.25, { n: 8, layers: [['#5a0000', 1, 1, 1], ['#b01a04', 0.9, 0.86, 1], ['#ff5a10', 0.72, 0.66, 1], ['#ffb030', 0.5, 0.46, 1], ['#fff4d0', 0.3, 0.26, 1]] });
    // spiral
    add(x); blur(x, 6, '#ffb040');
    for (let k = 0; k < 2; k++) { x.strokeStyle = rgba(k ? '#fff0b0' : '#ff8a20', 0.8); x.lineWidth = k ? 1.4 : 3.6; x.beginPath(); for (let i = 0; i <= 60; i++) { const t = i / 60, a = t * TAU * 1.6 + k * 0.4, r = 4 + t * 22; const px = 60 + Math.cos(a) * r, py = 40 + Math.sin(a) * r; i ? x.lineTo(px, py) : x.moveTo(px, py); } x.stroke(); }
    noBlur(x); norm(x);
    glow(x, 60, 40, 40, '#ff4a0a', 0.9);
    x.fillStyle = rg(x, 58, 38, 1, 22, [[0, '#ffffff'], [0.3, '#fff0a0'], [0.6, '#ff8a20'], [0.9, '#b01a02'], [1, 'rgba(120,10,0,0)']]); circle(x, 60, 40, 22); x.fill();
    embers(x, R, 20, 50, 50, 44, ['#ffb040', '#ff4a10', '#fff0a0']);
  },
  arcaneMissiles(x, R) {
    bg(x, R, ['#e080ff', '#4a0c78', '#08010f'], { angle: -0.75, strokes: ['#b040e0', '#200838', '#ff9aff'] });
    const bolt = (bx, by, s) => {
      add(x);
      for (let i = 0; i < 3; i++) { x.strokeStyle = rgba(['#a030ff', '#ff80ff', '#ffffff'][i], [0.45, 0.7, 1][i]); x.lineWidth = [8, 4, 1.4][i] * s; blur(x, 6, '#ff60ff'); x.beginPath(); x.moveTo(bx - 30 * s, by + 30 * s); x.quadraticCurveTo(bx - 12 * s, by + 8 * s, bx, by); x.stroke(); }
      noBlur(x); norm(x);
      glow(x, bx, by, 12 * s, '#ff80ff', 1);
      x.fillStyle = '#ffffff'; circle(x, bx, by, 3.2 * s); x.fill();
      sparkle(x, bx, by, 7 * s, '#ffd0ff', 0.4);
    };
    bolt(76, 24, 1); bolt(58, 52, 0.9); bolt(84, 58, 0.72); bolt(40, 30, 0.7);
    for (let i = 0; i < 12; i++) sparkle(x, R() * 100, R() * 100, 1 + R() * 2, '#ffc8ff', R());
  },
  iceBarrier(x, R) {
    bg(x, R, ['#a8e4ff', '#1a4a8a', '#020814'], { angle: 0, spread: 3, strokes: ['#5aa0e0', '#0a2448'] });
    glow(x, 50, 50, 44, '#8ad0ff', 0.6);
    // faceted ice orb
    const pts = [];
    for (let i = 0; i < 7; i++) { const a = -Math.PI / 2 + i / 7 * TAU; pts.push([50 + Math.cos(a) * 38, 52 + Math.sin(a) * 38]); }
    const inner = pts.map(([px, py], i) => [50 + (px - 50) * 0.5 + (i % 2 ? 3 : -3), 52 + (py - 52) * 0.5]);
    for (let i = 0; i < 7; i++) {
      const j = (i + 1) % 7, lit = 0.5 + 0.5 * Math.cos(i / 7 * TAU + 2.2);
      x.fillStyle = rgba(mix('#1a5aa8', '#e8f8ff', lit), 0.85); poly(x, [pts[i], pts[j], inner[j], inner[i]]); x.fill();
    }
    x.fillStyle = rgba('#bfe8ff', 0.55); poly(x, inner); x.fill();
    x.strokeStyle = 'rgba(255,255,255,.85)'; x.lineWidth = 0.9;
    for (let i = 0; i < 7; i++) { x.beginPath(); x.moveTo(pts[i][0], pts[i][1]); x.lineTo(inner[i][0], inner[i][1]); x.stroke(); }
    poly(x, inner); x.stroke();
    poly(x, pts); outline(x, 'rgba(230,248,255,.95)', 1.8);
    // figure silhouette inside
    x.fillStyle = 'rgba(10,30,70,.55)'; circle(x, 50, 42, 5); x.fill(); x.beginPath(); x.moveTo(42, 64); x.quadraticCurveTo(50, 44, 58, 64); x.closePath(); x.fill();
    sparkle(x, 36, 30, 9, '#ffffff', 0.3); sparkle(x, 70, 70, 5, '#e0f6ff');
  },

  // ===================================================== PRIEST
  smite(x, R) {
    bg(x, R, ['#fff0b0', '#8a5a12', '#120a02'], { cy: 20, angle: 1.57, spread: 0.25, strokes: ['#ffe080', '#5a3808'] });
    add(x);
    for (let i = 0; i < 3; i++) { x.fillStyle = lg(x, 0, 0, 0, 72, [[0, rgba('#fff6d0', 0.1)], [1, rgba(['#ffc840', '#ffe890', '#ffffff'][i], 0.9)]]); const w = [16, 9, 3.5][i]; poly(x, [[50 - w * 1.4, 0], [50 + w * 1.4, 0], [50 + w * 0.5, 72], [50 - w * 0.5, 72]]); x.fill(); }
    norm(x);
    // impact burst
    glow(x, 50, 74, 30, '#ffe070', 1);
    add(x);
    for (let i = 0; i < 14; i++) { const a = Math.PI + i / 13 * Math.PI, l = 14 + R() * 18; x.strokeStyle = rgba('#fff4c0', 0.5 + R() * 0.4); x.lineWidth = 1 + R() * 1.8; x.beginPath(); x.moveTo(50, 74); x.lineTo(50 + Math.cos(a) * l * 1.3, 74 + Math.sin(a) * l * 0.6); x.stroke(); }
    norm(x);
    x.fillStyle = lg(x, 0, 78, 0, 100, [[0, '#4a3014'], [1, '#100804']]); x.beginPath(); x.ellipse(50, 92, 60, 16, 0, 0, TAU); x.fill();
    glow(x, 50, 76, 12, '#ffffff', 1);
    sparkle(x, 50, 74, 12, '#fffbe0');
  },
  flashHeal(x, R) {
    bg(x, R, ['#fff4c0', '#b0801a', '#1a1002'], { angle: -1.57, spread: 3, strokes: ['#ffe8a0', '#7a5010'] });
    add(x);
    for (let i = 0; i < 18; i++) { const a = i / 18 * TAU; x.fillStyle = rgba('#fff8d8', 0.14); poly(x, [[50, 50], [50 + Math.cos(a - 0.07) * 80, 50 + Math.sin(a - 0.07) * 80], [50 + Math.cos(a + 0.07) * 80, 50 + Math.sin(a + 0.07) * 80]]); x.fill(); }
    norm(x);
    glow(x, 50, 44, 40, '#fff0b0', 1);
    x.save(); x.translate(48, 58); x.scale(1.05, 1.05);
    hand(x); blur(x, 10, '#ffe080');
    x.fillStyle = rg(x, 0, -6, 2, 40, [[0, '#ffffff'], [0.45, '#fff4d0'], [1, '#e8b050']]); x.fill(); noBlur(x);
    outline(x, 'rgba(120,70,10,.7)', 1);
    x.strokeStyle = 'rgba(180,120,40,.5)'; x.lineWidth = 0.8; x.beginPath(); x.moveTo(-8, 8); x.quadraticCurveTo(0, 12, 8, 6); x.stroke();
    x.restore();
    sparkle(x, 50, 36, 14, '#ffffff'); sparkle(x, 22, 24, 5); sparkle(x, 80, 30, 4); sparkle(x, 76, 78, 3.5);
  },
  greaterHeal(x, R) {
    bg(x, R, ['#fff0c0', '#9a6a18', '#140c02'], { angle: -1.57, strokes: ['#ffd878', '#5a3a08'] });
    // wings of light
    x.save(); x.translate(50, 52);
    wingFeathers(x, R, 1, ['#ffffff', '#ffe8a0', '#b88a30'], 7, 1.05); wingFeathers(x, R, -1, ['#ffffff', '#ffe8a0', '#b88a30'], 7, 1.05);
    x.restore();
    glow(x, 50, 50, 34, '#fff4c0', 1);
    // halo + orb
    add(x); x.strokeStyle = rgba('#fff8e0', 0.95); x.lineWidth = 2.6; blur(x, 8, '#ffd060'); ellipse(x, 50, 30, 14, 4.6); x.stroke(); noBlur(x); norm(x);
    x.fillStyle = rg(x, 48, 48, 1, 16, [[0, '#ffffff'], [0.4, '#fff8d0'], [0.8, '#ffd060'], [1, 'rgba(255,200,60,0)']]); circle(x, 50, 50, 16); x.fill();
    // plus rune
    x.fillStyle = 'rgba(255,255,255,.95)'; x.fillRect(47.6, 42, 4.8, 16); x.fillRect(42, 47.6, 16, 4.8);
    for (let i = 0; i < 10; i++) sparkle(x, 12 + R() * 76, 60 + R() * 32, 1.4 + R() * 2.4, '#e8ffd0', R());
  },
  wordOfPain(x, R) {
    bg(x, R, ['#7a3ad0', '#1e0638', '#030006'], { angle: 0.6, strokes: ['#5a1a9a', '#10021e', '#9a5aff'] });
    // tendrils
    for (let i = 0; i < 8; i++) {
      const a = i / 8 * TAU + R() * 0.4, len = 30 + R() * 16;
      const f = bez([50, 52], [50 + Math.cos(a) * len * 0.4 + (R() - 0.5) * 20, 52 + Math.sin(a) * len * 0.4], [50 + Math.cos(a + 0.6) * len * 0.8, 52 + Math.sin(a + 0.6) * len * 0.8], [50 + Math.cos(a + 0.4) * len * 1.3, 52 + Math.sin(a + 0.4) * len * 1.3]);
      ribbon(x, f, t => 7 * (1 - t) + 0.4, 24);
      x.fillStyle = rgba('#1a0630', 0.9); x.fill();
      x.strokeStyle = rgba('#b070ff', 0.45); x.lineWidth = 0.8; x.stroke();
    }
    glow(x, 50, 50, 34, '#8a3aff', 0.6);
    skull(x, 50, 52, 0.95, { bone: ['#d8c0ff', '#8a60c8', '#3a1a6a', '#12041e'], eyes: '#e060ff', glow: '#9a40ff' });
    embers(x, R, 14, 50, 50, 44, ['#c080ff', '#ff80ff']);
  },
  aegis(x, R) {
    bg(x, R, ['#fff2c0', '#6a6a8a', '#0c0c18'], { angle: -1, strokes: ['#e0d8b0', '#3a3a5a'] });
    // figure silhouette
    x.fillStyle = 'rgba(40,30,20,.7)'; circle(x, 50, 44, 7); x.fill(); x.beginPath(); x.moveTo(36, 80); x.quadraticCurveTo(50, 48, 64, 80); x.closePath(); x.fill();
    // bubble
    x.fillStyle = rg(x, 50, 50, 20, 40, [[0, 'rgba(255,250,220,.05)'], [0.75, 'rgba(255,240,180,.3)'], [0.93, 'rgba(255,250,230,.85)'], [1, 'rgba(255,220,120,0)']]);
    circle(x, 50, 52, 40); x.fill();
    add(x); x.strokeStyle = rgba('#fffbe8', 0.9); x.lineWidth = 1.6; blur(x, 8, '#ffe080'); circle(x, 50, 52, 36.5); x.stroke(); noBlur(x); norm(x);
    // highlight arcs
    x.strokeStyle = 'rgba(255,255,255,.85)'; x.lineWidth = 3.2; x.beginPath(); x.arc(50, 52, 29, 3.5, 4.4); x.stroke();
    x.lineWidth = 1.4; x.beginPath(); x.arc(50, 52, 29, 4.6, 4.85); x.stroke();
    // rune ring
    x.strokeStyle = rgba('#ffe090', 0.55); x.lineWidth = 0.8; circle(x, 50, 52, 33); x.stroke();
    for (let i = 0; i < 16; i++) { const a = i / 16 * TAU; x.fillStyle = rgba('#fff0b0', 0.8); circle(x, 50 + Math.cos(a) * 33, 52 + Math.sin(a) * 33, 0.9); x.fill(); }
    sparkle(x, 30, 32, 7);
  },
  renew(x, R) {
    bg(x, R, ['#e0ffb0', '#3a7a18', '#040c02'], { angle: 0, spread: 3, strokes: ['#9ae060', '#1a4008'] });
    glow(x, 50, 50, 40, '#d0ff90', 0.55);
    // spiral of light
    add(x); blur(x, 5, '#c8ff80');
    for (let k = 0; k < 3; k++) { x.strokeStyle = rgba(['#8aff60', '#e8ffb0', '#ffffff'][k], [0.5, 0.8, 1][k]); x.lineWidth = [5, 2.6, 1][k]; x.beginPath(); for (let i = 0; i <= 80; i++) { const t = i / 80, a = t * TAU * 2.1 + 0.4, r = 3 + t * 36; const px = 50 + Math.cos(a) * r, py = 52 + Math.sin(a) * r * 0.9; i ? x.lineTo(px, py) : x.moveTo(px, py); } x.stroke(); }
    noBlur(x); norm(x);
    // leaves
    for (const [lx, ly, la, s] of [[50, 52, -0.9, 1], [50, 52, -2.2, 0.8]]) {
      x.save(); x.translate(lx, ly); x.rotate(la); x.scale(s, s);
      x.beginPath(); x.moveTo(0, 0); x.bezierCurveTo(6, -8, 18, -8, 26, 0); x.bezierCurveTo(18, 7, 6, 7, 0, 0); x.closePath();
      x.fillStyle = lg(x, 0, -7, 0, 7, [[0, '#e8ff9a'], [0.5, '#5ac02a'], [1, '#1a5a0a']]); x.fill(); outline(x, 'rgba(0,30,0,.8)', 0.8);
      x.strokeStyle = 'rgba(230,255,200,.7)'; x.lineWidth = 0.6; x.beginPath(); x.moveTo(1, 0); x.lineTo(24, 0); x.stroke();
      x.restore();
    }
    sparkle(x, 50, 52, 10, '#ffffe0');
    for (let i = 0; i < 8; i++) sparkle(x, R() * 100, R() * 100, 1.3 + R() * 2, '#f0ffd0', R());
  },
  mindSpike(x, R) {
    bg(x, R, ['#b060ff', '#2a0848', '#040008'], { angle: 0.6, strokes: ['#7a28c0', '#12021e'] });
    // head profile silhouette facing right
    x.beginPath();
    x.moveTo(16, 96); x.bezierCurveTo(16, 80, 10, 66, 14, 50); x.bezierCurveTo(16, 30, 34, 20, 50, 22);
    x.bezierCurveTo(66, 24, 74, 36, 72, 48); x.lineTo(78, 58); x.lineTo(72, 60); x.bezierCurveTo(74, 66, 72, 72, 66, 72);
    x.lineTo(64, 80); x.bezierCurveTo(56, 82, 50, 84, 50, 96); x.closePath();
    x.fillStyle = rg(x, 40, 44, 4, 50, [[0, '#3a1a5a'], [1, '#08020e']]); x.fill(); outline(x, 'rgba(180,120,255,.5)', 1);
    // brain glow
    glow(x, 44, 42, 22, '#e060ff', 0.8);
    // spike
    x.save(); x.translate(44, 42); x.rotate(-0.72);
    blur(x, 10, '#d070ff');
    x.fillStyle = lg(x, 0, -6, 0, 6, [[0, '#ffffff'], [0.4, '#e0a0ff'], [1, '#6a18b0']]);
    poly(x, [[0, 0], [58, -6], [62, 0], [58, 6]]); x.fill(); noBlur(x); outline(x, 'rgba(30,0,60,.9)', 1);
    x.restore();
    add(x);
    for (let i = 0; i < 10; i++) { const a = R() * TAU, l = 6 + R() * 14; x.strokeStyle = rgba('#f0c0ff', 0.7); x.lineWidth = 0.9; x.beginPath(); x.moveTo(44, 42); x.lineTo(44 + Math.cos(a) * l, 42 + Math.sin(a) * l); x.stroke(); }
    norm(x);
    sparkle(x, 44, 42, 10, '#ffe8ff');
  },
  holyNova(x, R) {
    bg(x, R, ['#fff6c8', '#a07820', '#140c02'], { angle: 0, spread: 3, strokes: ['#ffe8a0', '#5a4010'] });
    add(x);
    for (let i = 0; i < 24; i++) { const a = i / 24 * TAU, l = 30 + (i % 2) * 14; x.strokeStyle = rgba('#fff8d8', 0.45); x.lineWidth = 1.6 + (i % 2); x.beginPath(); x.moveTo(50 + Math.cos(a) * 8, 50 + Math.sin(a) * 8); x.lineTo(50 + Math.cos(a) * l, 50 + Math.sin(a) * l); x.stroke(); }
    for (let i = 0; i < 3; i++) { x.strokeStyle = rgba(['#ffc840', '#ffe890', '#ffffff'][i], [0.5, 0.7, 0.95][i]); x.lineWidth = [9, 4.5, 1.8][i]; blur(x, 8, '#ffd060'); circle(x, 50, 50, 30); x.stroke(); }
    noBlur(x); norm(x);
    glow(x, 50, 50, 26, '#fff8d0', 1);
    sparkle(x, 50, 50, 16, '#ffffff');
    for (let i = 0; i < 12; i++) { const a = i / 12 * TAU + 0.26; sparkle(x, 50 + Math.cos(a) * 30, 50 + Math.sin(a) * 30, 2.6, '#fffbe8', a); }
  },
  prayer(x, R) {
    bg(x, R, ['#fff0c0', '#8a6020', '#120a02'], { cy: 30, angle: -1.57, spread: 0.4, strokes: ['#ffe8a0', '#4a3008'] });
    add(x);
    for (let i = 0; i < 12; i++) { const a = -Math.PI / 2 + (i - 5.5) * 0.2; x.fillStyle = rgba('#fff6d0', 0.16); poly(x, [[50, 56], [50 + Math.cos(a - 0.05) * 70, 56 + Math.sin(a - 0.05) * 70], [50 + Math.cos(a + 0.05) * 70, 56 + Math.sin(a + 0.05) * 70]]); x.fill(); }
    norm(x);
    glow(x, 50, 50, 34, '#fff0b0', 0.9);
    x.save(); x.translate(50, 66); x.scale(1.05, 1.05); tome(x, ['#6a1a10', '#f8ecc8']); x.restore();
    // floating runes
    add(x);
    for (let i = 0; i < 6; i++) { const px = 30 + i * 8 + R() * 4, py = 22 + R() * 22; x.strokeStyle = rgba('#fff0b0', 0.9); x.lineWidth = 1; blur(x, 4, '#ffd060'); x.beginPath(); x.moveTo(px, py); x.lineTo(px + 2.5, py - 3.2); x.lineTo(px + 4.8, py); x.moveTo(px + 2.5, py - 3.2); x.lineTo(px + 2.5, py + 2.2); x.stroke(); }
    noBlur(x); norm(x);
    sparkle(x, 50, 42, 12, '#ffffff');
  },

  // ===================================================== GENERIC
  attack(x, R) {
    bg(x, R, ['#d8a060', '#5a2a10', '#0e0604'], { angle: 0.8, strokes: ['#a86a30', '#2a1206'] });
    x.save(); x.translate(26, 80); x.rotate(0.76); sword(x, { len: 66, w: 8.5, metal: 'steel' }); x.restore();
    x.save(); x.translate(74, 80); x.rotate(-0.76); sword(x, { len: 66, w: 8.5, metal: 'steel' }); x.restore();
    sparkle(x, 50, 38, 9, '#fff4d0');
  },
  hearthstone(x, R) {
    bg(x, R, ['#e8904a', '#4a2412', '#0a0504'], { cy: 88, angle: -1.57, spread: 0.6, strokes: ['#ff9a40', '#3a1a0a'] });
    glow(x, 50, 90, 50, '#ff8a30', 0.5);
    ellipse(x, 50, 52, 30, 36, 0.12);
    x.fillStyle = rg(x, 40, 38, 2, 44, [[0, '#dfe6ee'], [0.35, '#8a96a8'], [0.75, '#46505e'], [1, '#1a1e26']]); x.fill(); outline(x, 'rgba(0,0,0,.9)', 1.4);
    // speckles
    for (let i = 0; i < 40; i++) { x.fillStyle = rgba(R() < 0.5 ? '#ffffff' : '#1a1e26', 0.25); circle(x, 30 + R() * 40, 26 + R() * 50, 0.4 + R() * 0.8); x.fill(); }
    // carved rune
    x.save(); x.translate(50, 52); x.rotate(0.12);
    const rune = () => { x.beginPath(); x.moveTo(0, -20); x.lineTo(0, 20); x.moveTo(-12, -8); x.lineTo(0, 2); x.lineTo(12, -8); x.moveTo(-9, 12); x.lineTo(0, 6); x.lineTo(9, 12); x.moveTo(-6, -18); x.lineTo(6, -18); };
    x.strokeStyle = '#0a1a24'; x.lineWidth = 4.2; rune(); x.stroke();
    add(x); blur(x, 8, '#40d8ff'); x.strokeStyle = '#7ae8ff'; x.lineWidth = 2.6; rune(); x.stroke(); noBlur(x);
    x.strokeStyle = '#ffffff'; x.lineWidth = 0.9; rune(); x.stroke(); norm(x);
    x.restore();
    glow(x, 50, 52, 24, '#40c8ff', 0.4);
    x.strokeStyle = 'rgba(255,255,255,.5)'; x.lineWidth = 2; x.beginPath(); x.ellipse(50, 52, 26, 32, 0.12, 3.6, 4.4); x.stroke();
  },
  mount(x, R) {
    bg(x, R, ['#b8d880', '#3a5a20', '#060a04'], { angle: 0.3, strokes: ['#8ab050', '#1a3008'] });
    glow(x, 50, 46, 34, '#fff0b0', 0.5);
    const f = t => { const a = Math.PI * (0.02 + t * 1.18) - Math.PI * 0.1; return [50 + Math.cos(a + Math.PI) * 25, 48 - Math.sin(a + Math.PI) * 30]; };
    ribbon(x, t => { const a = -0.25 + t * (Math.PI + 0.5); return [50 - Math.cos(a) * 25, 50 + Math.sin(a) * 28]; }, t => 13 - Math.abs(t - 0.5) * 6, 40);
    x.fillStyle = rg(x, 40, 60, 2, 44, [[0, '#ffffff'], [0.25, '#c8d0da'], [0.6, '#6a7480'], [1, '#262a30']]); x.fill(); outline(x, 'rgba(0,0,0,.9)', 1.4);
    // nail holes
    for (let i = 0; i < 8; i++) { const t = 0.1 + i / 7 * 0.8, a = -0.25 + t * (Math.PI + 0.5); const px = 50 - Math.cos(a) * 25, py = 50 + Math.sin(a) * 28; x.fillStyle = '#1a1e24'; x.fillRect(px - 1.1, py - 1.8, 2.2, 3.6); x.fillStyle = '#e8c070'; circle(x, px, py, 0.9); x.fill(); }
    x.strokeStyle = 'rgba(255,255,255,.6)'; x.lineWidth = 1.2; x.beginPath(); x.ellipse(50, 50, 30, 33, 0, 2.3, 3.4); x.stroke();
    void f;
    sparkle(x, 76, 30, 8, '#fff8d8');
    for (let i = 0; i < 6; i++) { x.strokeStyle = rgba('#fffbe0', 0.3); x.lineWidth = 1.5; const yy = 70 + i * 4; x.beginPath(); x.moveTo(8, yy); x.lineTo(24 + R() * 10, yy); x.stroke(); }
  },
  potionHealth(x, R) { bg(x, R, ['#b85a4a', '#3a1210', '#080202'], { strokes: ['#7a2a20', '#200806'] }); x.save(); x.translate(50, 54); flask(x, '#e8141e'); x.restore(); sparkle(x, 34, 44, 4); },
  potionMana(x, R) { bg(x, R, ['#5a7ac8', '#101e48', '#02040c'], { strokes: ['#2a4a9a', '#060e24'] }); x.save(); x.translate(50, 54); flask(x, '#1a6aff'); x.restore(); sparkle(x, 34, 44, 4); },
  food(x, R) {
    bg(x, R, ['#b8905a', '#4a3018', '#0a0604'], { strokes: ['#8a6030', '#2a1808'] });
    // cloth
    x.fillStyle = lg(x, 0, 60, 0, 100, [[0, '#d8c8a0'], [1, '#6a5a3a']]); poly(x, [[4, 78], [40, 62], [96, 70], [96, 98], [4, 98]]); x.fill();
    x.strokeStyle = 'rgba(160,40,30,.55)'; x.lineWidth = 2; for (let i = 0; i < 6; i++) { x.beginPath(); x.moveTo(8 + i * 16, 98); x.lineTo(20 + i * 14, 66); x.stroke(); }
    // loaf
    x.beginPath(); x.moveTo(12, 72); x.bezierCurveTo(10, 42, 40, 30, 62, 36); x.bezierCurveTo(84, 42, 90, 62, 82, 74); x.bezierCurveTo(60, 82, 30, 82, 12, 72); x.closePath();
    x.fillStyle = rg(x, 44, 44, 2, 48, [[0, '#ffe0a0'], [0.3, '#e0a050'], [0.7, '#9a5a1a'], [1, '#3a1a06']]); x.fill(); outline(x, 'rgba(40,16,0,.9)', 1.3);
    for (let i = 0; i < 3; i++) { const cx = 32 + i * 16; x.strokeStyle = '#6a3a10'; x.lineWidth = 3; x.beginPath(); x.moveTo(cx - 5, 50 + i); x.quadraticCurveTo(cx, 44 + i, cx + 6, 46 + i); x.stroke(); x.strokeStyle = '#fff0c8'; x.lineWidth = 1.4; x.beginPath(); x.moveTo(cx - 4, 48.6 + i); x.quadraticCurveTo(cx, 43 + i, cx + 5, 45 + i); x.stroke(); }
    // apple
    x.fillStyle = rg(x, 76, 64, 1, 16, [[0, '#ff8a70'], [0.4, '#d01818'], [1, '#4a0404']]); circle(x, 78, 70, 12); x.fill(); outline(x, 'rgba(30,0,0,.9)', 1.1);
    x.strokeStyle = '#4a2a0a'; x.lineWidth = 1.6; x.beginPath(); x.moveTo(78, 59); x.lineTo(80, 53); x.stroke();
    x.fillStyle = '#4a9a20'; x.beginPath(); x.ellipse(84, 55, 4, 2, -0.5, 0, TAU); x.fill();
    x.fillStyle = 'rgba(255,255,255,.6)'; x.beginPath(); x.ellipse(73, 65, 2.4, 3.6, 0.6, 0, TAU); x.fill();
  },
  drink(x, R) {
    bg(x, R, ['#8ab0d0', '#243a5a', '#04080e'], { strokes: ['#5a80a8', '#101e30'] });
    // tankard
    x.fillStyle = lg(x, 24, 0, 70, 0, [[0, '#3a2210'], [0.3, '#a8703a'], [0.55, '#d8a060'], [1, '#2a1608']]);
    x.beginPath(); x.moveTo(26, 34); x.lineTo(28, 86); x.quadraticCurveTo(48, 92, 68, 86); x.lineTo(70, 34); x.closePath(); x.fill(); outline(x, 'rgba(0,0,0,.9)', 1.3);
    x.strokeStyle = 'rgba(30,14,4,.65)'; x.lineWidth = 0.9; for (let i = 0; i < 6; i++) { const px = 32 + i * 7; x.beginPath(); x.moveTo(px, 36); x.lineTo(px + 0.4, 88); x.stroke(); }
    for (const yy of [42, 76]) { x.fillStyle = metalLG(x, 26, 0, 70, 0, 'iron'); x.fillRect(26, yy, 44, 5); x.strokeStyle = 'rgba(0,0,0,.8)'; x.strokeRect(26, yy, 44, 5); }
    // handle
    x.strokeStyle = '#1a0e06'; x.lineWidth = 8; x.beginPath(); x.moveTo(69, 44); x.bezierCurveTo(90, 44, 90, 74, 69, 74); x.stroke();
    x.strokeStyle = '#8a5a2a'; x.lineWidth = 5; x.stroke();
    // water top + splash
    x.fillStyle = rg(x, 48, 34, 1, 22, [[0, '#e8f8ff'], [0.5, '#5ab0ff'], [1, '#1a4a8a']]); ellipse(x, 48, 34, 22, 5); x.fill(); outline(x, 'rgba(0,20,40,.8)', 0.9);
    for (let i = 0; i < 9; i++) { const px = 30 + R() * 36, py = 14 + R() * 16; x.fillStyle = rgba('#bfe6ff', 0.9); x.beginPath(); x.ellipse(px, py, 1.4 + R() * 1.4, 2 + R() * 1.6, 0, 0, TAU); x.fill(); x.fillStyle = '#ffffff'; circle(x, px - 0.4, py - 0.6, 0.5); x.fill(); }
    sparkle(x, 36, 32, 5, '#ffffff');
  },

  // ===================================================== WEAPONS
  sword(x, R, o) {
    itemBG(x, R, o); rarityGlow(x, o);
    const m = o.tint ? tintMetal('steel', o.tint, 0.35) : 'steel';
    x.save(); x.translate(27, 76); x.rotate(0.785);
    sword(x, { len: 84, w: 13.5, tip: 15, metal: m, grip: 13, guard: 32, gem: o.rarity ? rarityColor(o.rarity) : '#c02020', glowCol: glowFor(o) });
    x.restore();
    sparkle(x, 80, 18, glowFor(o) ? 8 : 5, '#ffffff');
  },
  sword2h(x, R, o) {
    itemBG(x, R, o); rarityGlow(x, o);
    const m = o.tint ? tintMetal('steel', o.tint, 0.35) : 'steel';
    x.save(); x.translate(30, 74); x.rotate(0.785);
    sword(x, { len: 86, w: 19, tip: 20, taper: 0.97, metal: m, grip: 20, guard: 44, gem: o.rarity ? rarityColor(o.rarity) : '#2060ff', glowCol: glowFor(o) });
    x.restore();
    sparkle(x, 82, 16, 6, '#ffffff');
  },
  dagger(x, R, o) {
    itemBG(x, R, o); rarityGlow(x, o);
    x.save(); x.translate(34, 70); x.rotate(0.785);
    sword(x, { len: 62, w: 15, tip: 26, taper: 0.55, metal: o.tint ? tintMetal('steel', o.tint, 0.35) : 'steel', grip: 16, guard: 30, guardMetal: 'bronze', gem: '#20c060', glowCol: glowFor(o) });
    x.restore();
  },
  axe(x, R, o) {
    itemBG(x, R, o); rarityGlow(x, o);
    x.save(); x.translate(44, 34); x.rotate(0.6);
    haft(x, 0, -8, 0, 70, 7);
    wrap(x, 0, 50, 0, 66, 8);
    axeHead(x, o.tint ? tintMetal('steel', o.tint, 0.3) : 'steel', 1.75, glowFor(o));
    x.restore();
  },
  mace(x, R, o) {
    itemBG(x, R, o); rarityGlow(x, o);
    x.save(); x.translate(26, 88); x.rotate(0.72);
    haft(x, 0, 0, 0, -62, 7.5, ['#2a2a30', '#8a8a94', '#141418']);
    wrap(x, 0, -2, 0, -20, 8.5, '#4a2a14');
    x.translate(0, -68); x.scale(1.45, 1.45);
    const m = o.tint ? tintMetal('iron', o.tint, 0.35) : 'iron';
    if (glowFor(o)) { glow(x, 0, 0, 26, glowFor(o), 0.8); }
    for (let i = 0; i < 6; i++) {
      const a = i / 6 * TAU;
      x.save(); x.rotate(a);
      x.fillStyle = metalLG(x, 0, -5, 0, 5, m); poly(x, [[4, -4], [19, -2.2], [19, 2.2], [4, 4]]); x.fill(); outline(x, 'rgba(0,0,0,.85)', 0.9);
      x.restore();
    }
    x.fillStyle = rg(x, -3, -3, 1, 12, [[0, '#ffffff'], [0.3, '#c8ccd4'], [1, '#2a2e34']]); circle(x, 0, 0, 9.5); x.fill(); outline(x, 'rgba(0,0,0,.9)', 1);
    x.fillStyle = metalLG(x, -3, 0, 3, 0, m); poly(x, [[-3, -8], [0, -20], [3, -8]]); x.fill(); outline(x, 'rgba(0,0,0,.85)', 0.9);
    x.restore();
  },
  staff(x, R, o) {
    itemBG(x, R, o);
    const orb = o.tint || (o.rarity ? rarityColor(o.rarity) : '#40a0ff');
    x.save(); x.translate(20, 96); x.rotate(0.66);
    haft(x, 0, 0, 0, -84, 7, ['#2a1406', '#9a6a36', '#140802']);
    for (const yy of [-24, -56]) { x.fillStyle = metalLG(x, -5, 0, 5, 0, 'gold'); x.fillRect(-4.8, yy, 9.6, 4); x.strokeStyle = 'rgba(0,0,0,.7)'; x.lineWidth = 0.6; x.strokeRect(-4.8, yy, 9.6, 4); }
    x.translate(0, -86); x.scale(1.45, 1.45);
    // twisted claws
    for (const s of [-1, 1]) {
      ribbon(x, bez([s * 2, 6], [s * 14, 2], [s * 14, -12], [s * 3, -18]), t => 4 * (1 - t) + 0.8, 20);
      x.fillStyle = lg(x, -10, 0, 10, 0, [[0, '#3a1c08'], [0.5, '#b07a40'], [1, '#2a1004']]); x.fill(); outline(x, 'rgba(0,0,0,.8)', 0.8);
    }
    glow(x, 0, -6, 24, orb, 1);
    x.fillStyle = rg(x, -2.5, -8.5, 0.5, 9, [[0, '#ffffff'], [0.35, shade(orb, 0.5)], [0.8, orb], [1, shade(orb, -0.5)]]); circle(x, 0, -6, 8); x.fill(); outline(x, 'rgba(0,0,0,.6)', 0.8);
    x.restore();
    sparkle(x, 76, 20, 6, '#ffffff');
  },
  bow(x, R, o) {
    itemBG(x, R, o); rarityGlow(x, o);
    x.save(); x.translate(50, 50); x.rotate(0.78); x.scale(1.12, 1.12);
    const f = t => { const a = (t - 0.5) * 2.4; return [Math.sin(a) * 40, -Math.cos(a) * 18 + 10]; };
    ribbon(x, f, t => 4 + Math.sin(t * Math.PI) * 5.5, 40);
    x.fillStyle = lg(x, 0, -20, 0, 14, [[0, '#f0c080'], [0.4, '#9a5a24'], [1, '#2a1004']]); x.fill(); outline(x, 'rgba(0,0,0,.9)', 1.1);
    const a = f(0), b = f(1);
    x.strokeStyle = '#e8e0d0'; x.lineWidth = 0.9; x.beginPath(); x.moveTo(a[0], a[1]); x.lineTo(0, 22); x.lineTo(b[0], b[1]); x.stroke();
    wrap(x, -4, -8.4, 4, -8.4, 7.5, '#5a2a14');
    // arrow
    x.strokeStyle = '#6a4020'; x.lineWidth = 1.8; x.beginPath(); x.moveTo(0, 22); x.lineTo(0, -34); x.stroke();
    x.fillStyle = metalLG(x, -3, 0, 3, 0, 'steel'); poly(x, [[0, -42], [-3.6, -33], [3.6, -33]]); x.fill(); outline(x, 'rgba(0,0,0,.85)', 0.7);
    x.fillStyle = '#e8e8e0'; poly(x, [[0, 18], [-4, 24], [0, 22], [4, 24]]); x.fill();
    x.restore();
  },
  shield(x, R, o) {
    itemBG(x, R, o); rarityGlow(x, o);
    const col = o.tint || '#1d3f8a';
    x.beginPath(); x.moveTo(20, 18); x.quadraticCurveTo(50, 12, 80, 18); x.bezierCurveTo(82, 52, 70, 76, 50, 90); x.bezierCurveTo(30, 76, 18, 52, 20, 18); x.closePath();
    x.fillStyle = rg(x, 40, 34, 2, 60, [[0, shade(col, 0.45)], [0.5, col], [1, shade(col, -0.7)]]); x.fill();
    x.lineWidth = 5.5; x.strokeStyle = metalLG(x, 20, 20, 80, 80, 'gold'); x.stroke(); outline(x, 'rgba(0,0,0,.9)', 1.1);
    // emblem: rising sun
    x.save(); x.beginPath(); x.moveTo(20, 18); x.quadraticCurveTo(50, 12, 80, 18); x.bezierCurveTo(82, 52, 70, 76, 50, 90); x.bezierCurveTo(30, 76, 18, 52, 20, 18); x.clip();
    x.fillStyle = metalLG(x, 30, 40, 70, 60, 'gold');
    for (let i = 0; i < 9; i++) { const a = Math.PI + (i + 0.5) / 9 * Math.PI; poly(x, [[50 + Math.cos(a - 0.1) * 12, 56 + Math.sin(a - 0.1) * 12], [50 + Math.cos(a) * 28, 56 + Math.sin(a) * 28], [50 + Math.cos(a + 0.1) * 12, 56 + Math.sin(a + 0.1) * 12]]); x.fill(); }
    x.beginPath(); x.arc(50, 56, 11, Math.PI, 0); x.closePath(); x.fill(); outline(x, 'rgba(60,30,0,.8)', 0.9);
    x.fillRect(22, 56, 56, 3);
    x.restore();
    for (const [rx, ry] of [[26, 24], [74, 24], [50, 84], [24, 44], [76, 44]]) { x.fillStyle = rg(x, rx - 0.6, ry - 0.6, 0, 2.4, [[0, '#fff8d0'], [1, '#6a4a10']]); circle(x, rx, ry, 1.9); x.fill(); }
    x.fillStyle = 'rgba(255,255,255,.12)'; x.beginPath(); x.moveTo(24, 21); x.quadraticCurveTo(50, 16, 76, 21); x.quadraticCurveTo(50, 30, 24, 40); x.closePath(); x.fill();
  },

  // ===================================================== ARMOR
  helm(x, R, o) {
    itemBG(x, R, o); rarityGlow(x, o);
    const m = o.tint ? tintMetal('steel', o.tint, 0.4) : METAL.steel;
    x.save(); x.translate(50, 52);
    x.beginPath(); x.moveTo(-26, 8); x.bezierCurveTo(-28, -30, 28, -30, 26, 8); x.lineTo(22, 30); x.lineTo(7, 34); x.lineTo(5, 8); x.lineTo(-5, 8); x.lineTo(-7, 34); x.lineTo(-22, 30); x.closePath();
    x.fillStyle = rg(x, -9, -16, 1, 42, [[0, m[0]], [0.25, m[1]], [0.6, m[2]], [1, m[4]]]); x.fill(); outline(x, 'rgba(0,0,0,.9)', 1.4);
    // crest ridge
    x.fillStyle = metalLG(x, -3, 0, 3, 0, 'gold'); poly(x, [[-3, -24], [0, -27], [3, -24], [2.4, 6], [-2.4, 6]]); x.fill(); outline(x, 'rgba(0,0,0,.8)', 0.8);
    // brow band
    x.fillStyle = lg(x, -26, 0, 26, 0, [[0, '#5a3a08'], [0.4, '#ffd878'], [1, '#5a3a08']]); x.beginPath(); x.moveTo(-26.5, 2); x.quadraticCurveTo(0, -4, 26.5, 2); x.lineTo(26, 7); x.quadraticCurveTo(0, 1, -26, 7); x.closePath(); x.fill(); outline(x, 'rgba(0,0,0,.8)', 0.8);
    // eye slits
    x.fillStyle = '#050608'; poly(x, [[-20, 10], [-6, 10], [-6, 16], [-18, 15]]); x.fill(); poly(x, [[20, 10], [6, 10], [6, 16], [18, 15]]); x.fill();
    // breaths
    x.fillStyle = 'rgba(0,0,0,.7)'; for (let i = 0; i < 3; i++) { x.fillRect(-18 + i * 3.4, 21, 1.4, 6); x.fillRect(14.6 - i * 3.4, 21, 1.4, 6); }
    x.restore();
  },
  shoulders(x, R, o) {
    itemBG(x, R, o); rarityGlow(x, o);
    const m = o.tint ? tintMetal('steel', o.tint, 0.4) : METAL.steel;
    for (let k = 2; k >= 0; k--) {
      const yy = 44 + k * 13, rx = 36 - k * 4;
      x.beginPath(); x.moveTo(50 - rx, yy + 10); x.bezierCurveTo(50 - rx, yy - 22 + k * 6, 50 + rx, yy - 22 + k * 6, 50 + rx, yy + 10); x.quadraticCurveTo(50, yy + 3, 50 - rx, yy + 10); x.closePath();
      x.fillStyle = rg(x, 40, yy - 12, 1, rx * 1.4, [[0, m[0]], [0.3, m[1]], [0.7, m[2]], [1, m[4]]]); x.fill(); outline(x, 'rgba(0,0,0,.9)', 1.2);
      x.strokeStyle = metalLG(x, 50 - rx, 0, 50 + rx, 0, 'gold'); x.lineWidth = 2.2; x.beginPath(); x.moveTo(50 - rx + 1.5, yy + 8.5); x.quadraticCurveTo(50, yy + 1.5, 50 + rx - 1.5, yy + 8.5); x.stroke();
    }
    // spikes
    for (const [sx, sa] of [[34, -0.5], [50, 0], [66, 0.5]]) { x.save(); x.translate(sx, 26); x.rotate(sa); x.fillStyle = metalLG(x, -3, 0, 3, 0, m); poly(x, [[-4, 4], [0, -14], [4, 4]]); x.fill(); outline(x, 'rgba(0,0,0,.85)', 0.9); x.restore(); }
    for (const rx of [22, 78]) { x.fillStyle = rg(x, rx - 0.6, 55, 0, 2.4, [[0, '#fff8d0'], [1, '#6a4a10']]); circle(x, rx, 56, 2); x.fill(); }
  },
  chest(x, R, o) {
    itemBG(x, R, o); rarityGlow(x, o);
    const m = o.tint ? tintMetal('steel', o.tint, 0.4) : METAL.steel;
    x.beginPath();
    x.moveTo(26, 18); x.lineTo(40, 14); x.quadraticCurveTo(50, 22, 60, 14); x.lineTo(74, 18); x.lineTo(84, 30); x.lineTo(76, 40); x.lineTo(74, 84);
    x.quadraticCurveTo(50, 92, 26, 84); x.lineTo(24, 40); x.lineTo(16, 30); x.closePath();
    x.fillStyle = rg(x, 42, 36, 2, 60, [[0, m[0]], [0.3, m[1]], [0.65, m[2]], [1, m[4]]]); x.fill(); outline(x, 'rgba(0,0,0,.9)', 1.4);
    // pectoral plates
    x.strokeStyle = 'rgba(0,0,0,.55)'; x.lineWidth = 1.3;
    x.beginPath(); x.moveTo(28, 44); x.quadraticCurveTo(50, 54, 72, 44); x.stroke();
    x.beginPath(); x.moveTo(50, 22); x.lineTo(50, 50); x.stroke();
    x.strokeStyle = 'rgba(255,255,255,.4)'; x.lineWidth = 0.8; x.beginPath(); x.moveTo(28, 45.4); x.quadraticCurveTo(50, 55.4, 72, 45.4); x.stroke();
    // abdomen bands
    for (let i = 0; i < 3; i++) { const yy = 60 + i * 8; x.strokeStyle = 'rgba(0,0,0,.5)'; x.lineWidth = 1.2; x.beginPath(); x.moveTo(27, yy); x.quadraticCurveTo(50, yy + 5, 73, yy); x.stroke(); x.strokeStyle = 'rgba(255,255,255,.28)'; x.lineWidth = 0.7; x.beginPath(); x.moveTo(27, yy + 1.2); x.quadraticCurveTo(50, yy + 6.2, 73, yy + 1.2); x.stroke(); }
    // gold trim collar
    x.strokeStyle = metalLG(x, 38, 0, 62, 0, 'gold'); x.lineWidth = 3; x.beginPath(); x.moveTo(40, 15); x.quadraticCurveTo(50, 23, 60, 15); x.stroke();
    gemShape(x, 50, 36, 4.5, o.rarity ? rarityColor(o.rarity) : '#e02020', { glow: false });
  },
  robe(x, R, o) {
    itemBG(x, R, o);
    const col = o.tint || '#6a2a9a';
    x.beginPath();
    x.moveTo(38, 12); x.quadraticCurveTo(50, 18, 62, 12); x.lineTo(80, 22); x.lineTo(92, 50); x.lineTo(80, 54); x.lineTo(72, 38);
    x.lineTo(78, 90); x.quadraticCurveTo(50, 96, 22, 90); x.lineTo(28, 38); x.lineTo(20, 54); x.lineTo(8, 50); x.lineTo(20, 22); x.closePath();
    x.fillStyle = rg(x, 44, 36, 2, 64, [[0, shade(col, 0.45)], [0.45, col], [1, shade(col, -0.75)]]); x.fill(); outline(x, 'rgba(0,0,0,.9)', 1.3);
    // folds
    x.strokeStyle = rgba(shade(col, -0.7), 0.7); x.lineWidth = 1.6;
    for (const fx of [36, 46, 56, 64]) { x.beginPath(); x.moveTo(fx, 56); x.quadraticCurveTo(fx - 3, 74, fx - 1, 92); x.stroke(); }
    x.strokeStyle = rgba(shade(col, 0.5), 0.5); x.lineWidth = 0.9; for (const fx of [40, 51, 60]) { x.beginPath(); x.moveTo(fx, 56); x.quadraticCurveTo(fx - 3, 74, fx - 1, 92); x.stroke(); }
    // gold trim
    x.strokeStyle = metalLG(x, 20, 0, 80, 0, 'gold'); x.lineWidth = 2.6;
    x.beginPath(); x.moveTo(50, 17); x.lineTo(50, 50); x.stroke();
    x.beginPath(); x.moveTo(23, 89); x.quadraticCurveTo(50, 95, 77, 89); x.stroke();
    x.beginPath(); x.moveTo(38, 12.6); x.quadraticCurveTo(50, 19, 62, 12.6); x.stroke();
    // sash
    x.fillStyle = lg(x, 0, 48, 0, 56, [[0, '#ffd870'], [0.5, '#a8700a'], [1, '#4a2a02']]); poly(x, [[28, 48], [72, 48], [72.5, 55], [27.5, 55]]); x.fill(); outline(x, 'rgba(0,0,0,.8)', 0.8);
    gemShape(x, 50, 51.5, 3.8, '#40e0ff', { glow: false });
    rarityGlow(x, o, 50, 50, 30);
  },
  gloves(x, R, o) {
    itemBG(x, R, o); rarityGlow(x, o);
    const col = o.tint || '#7a4a24';
    x.save(); x.translate(50, 56); x.rotate(-0.25); x.scale(1.2, 1.2);
    hand(x);
    x.fillStyle = rg(x, -4, -6, 1, 34, [[0, shade(col, 0.5)], [0.5, col], [1, shade(col, -0.7)]]); x.fill(); outline(x, 'rgba(0,0,0,.9)', 1.1);
    // knuckle plates
    x.fillStyle = metalLG(x, -12, 0, 12, 0, 'steel');
    for (const [fx, fy] of [[-10.5, -12], [-4, -15], [3, -15], [9.5, -12]]) { x.beginPath(); x.roundRect(fx - 2.8, fy - 3, 5.6, 5, 1.5); x.fill(); outline(x, 'rgba(0,0,0,.8)', 0.6); }
    // cuff
    x.fillStyle = lg(x, -16, 0, 16, 0, [[0, shade(col, -0.6)], [0.5, shade(col, 0.2)], [1, shade(col, -0.7)]]);
    poly(x, [[-15, 18], [15, 18], [18, 34], [-18, 34]]); x.fill(); outline(x, 'rgba(0,0,0,.9)', 1);
    x.strokeStyle = metalLG(x, -18, 0, 18, 0, 'gold'); x.lineWidth = 2; x.beginPath(); x.moveTo(-15, 19.5); x.lineTo(15, 19.5); x.stroke();
    x.restore();
  },
  boots(x, R, o) {
    itemBG(x, R, o); rarityGlow(x, o);
    const col = o.tint || '#6a3a1a';
    x.beginPath();
    x.moveTo(34, 12); x.lineTo(62, 12); x.lineTo(60, 60); x.bezierCurveTo(64, 64, 82, 66, 88, 74); x.lineTo(88, 84); x.lineTo(24, 84); x.lineTo(28, 60); x.closePath();
    x.fillStyle = rg(x, 44, 36, 2, 60, [[0, shade(col, 0.5)], [0.5, col], [1, shade(col, -0.75)]]); x.fill(); outline(x, 'rgba(0,0,0,.9)', 1.3);
    // sole
    x.fillStyle = lg(x, 0, 80, 0, 88, [[0, '#2a1a0e'], [1, '#0a0604']]); poly(x, [[22, 82], [90, 82], [90, 89], [22, 89]]); x.fill(); outline(x, 'rgba(0,0,0,.9)', 1);
    // cuff
    x.fillStyle = lg(x, 30, 0, 66, 0, [[0, shade(col, -0.5)], [0.4, shade(col, 0.35)], [1, shade(col, -0.6)]]); poly(x, [[31, 10], [65, 10], [64, 24], [32, 24]]); x.fill(); outline(x, 'rgba(0,0,0,.9)', 1);
    // straps + buckles
    for (const yy of [34, 48]) { x.fillStyle = '#2a160a'; x.fillRect(31, yy, 30, 4); x.fillStyle = metalLG(x, 44, 0, 50, 0, 'gold'); x.fillRect(44, yy - 1, 6, 6); x.strokeStyle = 'rgba(0,0,0,.8)'; x.lineWidth = 0.7; x.strokeRect(44, yy - 1, 6, 6); }
    x.strokeStyle = 'rgba(255,255,255,.25)'; x.lineWidth = 1.2; x.beginPath(); x.moveTo(36, 26); x.lineTo(34, 60); x.stroke();
  },
  belt(x, R, o) {
    itemBG(x, R, o); rarityGlow(x, o);
    const col = o.tint || '#5a3218';
    ribbon(x, t => [8 + t * 84, 50 + Math.sin(t * Math.PI) * -10 + 6], () => 16, 30);
    x.fillStyle = lg(x, 0, 36, 0, 64, [[0, shade(col, 0.4)], [0.5, col], [1, shade(col, -0.7)]]); x.fill(); outline(x, 'rgba(0,0,0,.9)', 1.2);
    x.strokeStyle = rgba('#e8c890', 0.5); x.lineWidth = 0.7; x.setLineDash([1.6, 1.8]);
    strokeCurve(x, t => [8 + t * 84, 50 + Math.sin(t * Math.PI) * -10 + 0.5]); x.stroke();
    strokeCurve(x, t => [8 + t * 84, 50 + Math.sin(t * Math.PI) * -10 + 11.5]); x.stroke(); x.setLineDash([]);
    // studs
    for (let i = 0; i < 7; i++) { const t = 0.08 + i * 0.14; if (Math.abs(t - 0.5) < 0.1) continue; const px = 8 + t * 84, py = 56 + Math.sin(t * Math.PI) * -10; x.fillStyle = rg(x, px - 0.5, py - 0.5, 0, 2.2, [[0, '#ffffff'], [1, '#5a6068']]); circle(x, px, py, 1.8); x.fill(); }
    // buckle
    x.lineWidth = 4; x.strokeStyle = metalLG(x, 36, 30, 64, 70, 'gold'); x.beginPath(); x.roundRect(38, 34, 24, 24, 4); x.stroke();
    x.lineWidth = 1; x.strokeStyle = 'rgba(0,0,0,.8)'; x.beginPath(); x.roundRect(36, 32, 28, 28, 5); x.stroke(); x.beginPath(); x.roundRect(40, 36, 20, 20, 3); x.stroke();
    x.fillStyle = metalLG(x, 48, 0, 52, 0, 'gold'); x.fillRect(48.5, 36, 3, 20);
    gemShape(x, 50, 46, 4.2, o.rarity ? rarityColor(o.rarity) : '#e02828', { glow: false });
  },
  legs(x, R, o) {
    itemBG(x, R, o); rarityGlow(x, o);
    const col = o.tint || '#4a5a6a';
    x.beginPath();
    x.moveTo(24, 14); x.lineTo(76, 14); x.lineTo(82, 88); x.lineTo(58, 90); x.lineTo(51, 36); x.lineTo(49, 36); x.lineTo(42, 90); x.lineTo(18, 88); x.closePath();
    x.fillStyle = rg(x, 40, 30, 2, 70, [[0, shade(col, 0.5)], [0.5, col], [1, shade(col, -0.75)]]); x.fill(); outline(x, 'rgba(0,0,0,.9)', 1.3);
    // waistband
    x.fillStyle = lg(x, 0, 14, 0, 22, [[0, '#6a4a2a'], [1, '#2a1808']]); x.fillRect(24, 14, 52, 8); x.strokeStyle = 'rgba(0,0,0,.8)'; x.lineWidth = 0.8; x.strokeRect(24, 14, 52, 8);
    // knee guards
    for (const kx of [31, 69]) { x.fillStyle = rg(x, kx - 2, 56, 1, 10, [[0, '#ffffff'], [0.3, '#c0c8d0'], [1, '#3a4048']]); ellipse(x, kx, 58, 8, 9); x.fill(); outline(x, 'rgba(0,0,0,.85)', 0.9); }
    x.strokeStyle = rgba(shade(col, -0.7), 0.7); x.lineWidth = 1.2; for (const fx of [28, 36, 64, 72]) { x.beginPath(); x.moveTo(fx, 70); x.lineTo(fx + (fx < 50 ? -2 : 2), 88); x.stroke(); }
  },
  cloak(x, R, o) {
    itemBG(x, R, o); rarityGlow(x, o);
    const col = o.tint || '#8a1a1a';
    x.beginPath(); x.moveTo(36, 14); x.quadraticCurveTo(50, 20, 64, 14); x.bezierCurveTo(74, 40, 86, 70, 90, 90);
    for (let i = 0; i < 5; i++) { const px = 90 - (i + 1) * 16; x.quadraticCurveTo(px + 8, 86 + (i % 2) * 4, px, 92); }
    x.bezierCurveTo(14, 70, 26, 40, 36, 14); x.closePath();
    x.fillStyle = rg(x, 46, 30, 2, 70, [[0, shade(col, 0.45)], [0.5, col], [1, shade(col, -0.8)]]); x.fill(); outline(x, 'rgba(0,0,0,.9)', 1.3);
    x.strokeStyle = rgba(shade(col, -0.7), 0.75); x.lineWidth = 2;
    for (const [a, b] of [[42, 26], [50, 42], [58, 58], [64, 74]]) { x.beginPath(); x.moveTo(a, 20); x.quadraticCurveTo(b + 4, 60, b, 90); x.stroke(); }
    x.strokeStyle = rgba(shade(col, 0.5), 0.45); x.lineWidth = 1; for (const [a, b] of [[45, 34], [54, 50], [61, 66]]) { x.beginPath(); x.moveTo(a, 20); x.quadraticCurveTo(b + 4, 60, b, 90); x.stroke(); }
    // clasp
    x.fillStyle = metalLG(x, 42, 10, 58, 22, 'gold'); circle(x, 50, 17, 6); x.fill(); outline(x, 'rgba(0,0,0,.85)', 1);
    gemShape(x, 50, 17, 3.4, '#30d0ff', { glow: false });
  },
  ring(x, R, o) {
    itemBG(x, R, o, ['#4a4058', '#1a1622', '#050407']); rarityGlow(x, o);
    x.lineWidth = 9; x.strokeStyle = metalLG(x, 20, 40, 80, 70, o.tint ? tintMetal('gold', o.tint, 0.3) : 'gold'); ellipse(x, 50, 60, 26, 20); x.stroke();
    x.lineWidth = 1; x.strokeStyle = 'rgba(0,0,0,.85)'; ellipse(x, 50, 60, 30.5, 24.5); x.stroke(); ellipse(x, 50, 60, 21.5, 15.5); x.stroke();
    x.strokeStyle = 'rgba(255,255,255,.7)'; x.lineWidth = 1.4; x.beginPath(); x.ellipse(50, 60, 28, 22, 0, 3.4, 4.3); x.stroke();
    // setting
    x.fillStyle = metalLG(x, 40, 30, 60, 44, 'gold'); poly(x, [[38, 44], [42, 32], [58, 32], [62, 44]]); x.fill(); outline(x, 'rgba(0,0,0,.85)', 1);
    gemShape(x, 50, 32, 10, o.rarity ? rarityColor(o.rarity) : '#e02040');
  },
  trinket(x, R, o) {
    itemBG(x, R, o, ['#4a4a5a', '#18161e', '#050407']); rarityGlow(x, o);
    // chain
    x.strokeStyle = metalLG(x, 20, 0, 80, 30, 'gold'); x.lineWidth = 1.8;
    for (let i = 0; i < 14; i++) { const t = i / 13, a = Math.PI * (1.1 - t * 1.2) + 0.05; const px = 50 + Math.cos(a) * 30, py = 38 - Math.sin(a) * 26; ellipse(x, px, py, 2.2, 1.4, a + Math.PI / 2 * (i % 2)); x.stroke(); }
    // medallion
    x.fillStyle = metalLG(x, 26, 40, 74, 86, 'gold'); circle(x, 50, 62, 22); x.fill(); outline(x, 'rgba(0,0,0,.9)', 1.3);
    x.strokeStyle = 'rgba(60,30,0,.6)'; x.lineWidth = 1.4; circle(x, 50, 62, 17); x.stroke();
    for (let i = 0; i < 12; i++) { const a = i / 12 * TAU; x.fillStyle = 'rgba(80,40,0,.6)'; poly(x, [[50 + Math.cos(a) * 17, 62 + Math.sin(a) * 17], [50 + Math.cos(a + 0.13) * 21, 62 + Math.sin(a + 0.13) * 21], [50 + Math.cos(a - 0.13) * 21, 62 + Math.sin(a - 0.13) * 21]]); x.fill(); }
    gemShape(x, 50, 62, 10, o.tint || (o.rarity ? rarityColor(o.rarity) : '#20c0a0'), { n: 6 });
  },

  // ===================================================== LOOT / QUEST ITEMS
  boarHaunch(x, R, o) {
    itemBG(x, R, o, ['#8a5a3a', '#301a0e', '#080402']);
    // bone
    x.fillStyle = lg(x, 60, 20, 80, 30, [[0, '#fffaf0'], [1, '#b8a888']]);
    x.save(); x.translate(70, 28); x.rotate(-0.8);
    x.beginPath(); x.roundRect(-4, -4, 8, 26, 3); x.fill(); outline(x, 'rgba(0,0,0,.8)', 1);
    circle(x, -4, -4, 5.5); x.fill(); outline(x, 'rgba(0,0,0,.8)', 1); circle(x, 4, -4, 5.5); x.fill(); outline(x, 'rgba(0,0,0,.8)', 1);
    x.restore();
    // meat
    x.beginPath(); x.moveTo(62, 36); x.bezierCurveTo(80, 50, 70, 86, 40, 88); x.bezierCurveTo(14, 90, 12, 60, 28, 48); x.bezierCurveTo(40, 38, 52, 34, 62, 36); x.closePath();
    x.fillStyle = rg(x, 40, 56, 2, 42, [[0, '#e87a50'], [0.35, '#b0401e'], [0.75, '#6a1e0a'], [1, '#2a0a02']]); x.fill(); outline(x, 'rgba(20,4,0,.9)', 1.3);
    // crispy skin highlights + fat marbling
    x.strokeStyle = 'rgba(255,220,180,.55)'; x.lineWidth = 1.2; for (let i = 0; i < 6; i++) { x.beginPath(); x.moveTo(26 + R() * 30, 52 + R() * 26); x.quadraticCurveTo(34 + R() * 20, 56 + R() * 20, 40 + R() * 20, 60 + R() * 20); x.stroke(); }
    x.fillStyle = 'rgba(255,255,255,.35)'; x.beginPath(); x.ellipse(36, 54, 8, 4, -0.6, 0, TAU); x.fill();
  },
  wolfPelt(x, R, o) {
    itemBG(x, R, o, ['#6a6a70', '#26262c', '#060608']);
    x.beginPath();
    x.moveTo(30, 16); x.quadraticCurveTo(50, 10, 70, 16); x.lineTo(86, 10); x.lineTo(80, 30); x.quadraticCurveTo(88, 52, 80, 74); x.lineTo(90, 88); x.lineTo(70, 84);
    x.quadraticCurveTo(50, 92, 30, 84); x.lineTo(10, 88); x.lineTo(20, 74); x.quadraticCurveTo(12, 52, 20, 30); x.lineTo(14, 10); x.closePath();
    x.fillStyle = rg(x, 46, 40, 2, 56, [[0, '#d8d4d0'], [0.4, '#8a8680'], [1, '#2a2826']]); x.fill(); outline(x, 'rgba(0,0,0,.9)', 1.3);
    x.save(); x.clip();
    x.lineCap = 'round';
    for (let i = 0; i < 260; i++) { const px = 10 + R() * 80, py = 10 + R() * 80; const a = Math.atan2(py - 50, px - 50) * 0.3 + 1.4 + (R() - 0.5) * 0.6; x.strokeStyle = rgba(['#f0ece8', '#5a5650', '#a8a49e', '#302e2a'][i % 4], 0.5); x.lineWidth = 0.6 + R() * 0.8; x.beginPath(); x.moveTo(px, py); x.lineTo(px + Math.cos(a) * 4, py + Math.sin(a) * 4); x.stroke(); }
    // darker spine stripe
    x.fillStyle = 'rgba(30,28,26,.4)'; x.beginPath(); x.ellipse(50, 50, 8, 38, 0, 0, TAU); x.fill();
    x.restore();
  },
  candle(x, R, o) {
    bg(x, R, ['#6a4a2a', '#1a120a', '#030201'], { cy: 30, strokes: ['#4a3018', '#0a0604'] });
    glow(x, 50, 26, 40, '#ffb040', 0.8);
    // wax body
    x.beginPath(); x.moveTo(34, 40); x.quadraticCurveTo(50, 36, 66, 40); x.lineTo(68, 88); x.quadraticCurveTo(50, 94, 32, 88); x.closePath();
    x.fillStyle = lg(x, 32, 0, 68, 0, [[0, '#8a7a50'], [0.35, '#fff4c8'], [0.6, '#f0e0a8'], [1, '#6a5a38']]); x.fill(); outline(x, 'rgba(40,24,0,.85)', 1.2);
    // drips
    x.fillStyle = '#fff8dc';
    for (const [dx, dl] of [[38, 18], [48, 10], [60, 22]]) { x.beginPath(); x.moveTo(dx - 3, 40); x.lineTo(dx - 2.4, 40 + dl); x.arc(dx, 40 + dl, 2.4, Math.PI, 0, true); x.lineTo(dx + 3, 40); x.fill(); }
    x.fillStyle = 'rgba(255,255,255,.8)'; ellipse(x, 50, 40, 16, 3); x.fill();
    // wick + flame
    x.strokeStyle = '#1a1008'; x.lineWidth = 1.6; x.beginPath(); x.moveTo(50, 40); x.lineTo(50, 34); x.stroke();
    fire(x, R, 50, 36, 22, 10, 0, { n: 1 });
    glow(x, 50, 26, 10, '#fff4c0', 1);
  },
  spiderSilk(x, R, o) {
    itemBG(x, R, o, ['#6a5a7a', '#241c2c', '#050408']);
    for (let k = 0; k < 26; k++) {
      const a = R() * TAU, rx = 16 + R() * 14, ry = 10 + R() * 12;
      x.strokeStyle = rgba(R() < 0.5 ? '#ffffff' : '#d8d0e8', 0.35 + R() * 0.4); x.lineWidth = 0.6 + R() * 1.4;
      ellipse(x, 48 + (R() - 0.5) * 8, 50 + (R() - 0.5) * 8, rx, ry, a); x.stroke();
    }
    glow(x, 48, 50, 22, '#ffffff', 0.35);
    // loose strands
    x.strokeStyle = 'rgba(255,255,255,.7)'; x.lineWidth = 0.6;
    for (let i = 0; i < 5; i++) { x.beginPath(); x.moveTo(60, 58); x.bezierCurveTo(74, 64 + i * 3, 80, 76 + i * 2, 92, 82 + i * 3); x.stroke(); }
    sparkle(x, 38, 40, 5);
  },
  letter(x, R, o) {
    itemBG(x, R, o, ['#7a6a4a', '#2c2418', '#070503']);
    x.save(); x.translate(50, 50); x.rotate(-0.18);
    x.fillStyle = lg(x, -34, -24, 34, 24, [[0, '#fff6dc'], [0.5, '#e8d4a4'], [1, '#a88a58']]);
    poly(x, [[-36, -24], [36, -24], [36, 24], [-36, 24]]); x.fill(); outline(x, 'rgba(60,40,10,.9)', 1.1);
    x.strokeStyle = 'rgba(120,90,50,.55)'; x.lineWidth = 1; x.beginPath(); x.moveTo(-36, -24); x.lineTo(0, 4); x.lineTo(36, -24); x.stroke();
    x.beginPath(); x.moveTo(-36, 24); x.lineTo(-8, 0); x.moveTo(36, 24); x.lineTo(8, 0); x.stroke();
    // wax seal
    x.fillStyle = rg(x, -1.5, 2, 0.5, 11, [[0, '#ff5a4a'], [0.5, '#b01010'], [1, '#4a0202']]);
    x.beginPath(); for (let i = 0; i <= 16; i++) { const a = i / 16 * TAU, r = 9 + (i % 2) * 1.2; i ? x.lineTo(Math.cos(a) * r, 4 + Math.sin(a) * r) : x.moveTo(Math.cos(a) * r, 4 + Math.sin(a) * r); } x.closePath(); x.fill(); outline(x, 'rgba(40,0,0,.9)', 0.9);
    x.strokeStyle = 'rgba(255,180,160,.6)'; x.lineWidth = 1; circle(x, 0, 4, 5.4); x.stroke();
    x.fillStyle = 'rgba(80,0,0,.8)'; x.font = 'bold 8px serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText('E', 0, 4.4);
    x.restore();
  },
  fishingNet(x, R, o) {
    itemBG(x, R, o, ['#4a6a7a', '#16242c', '#030608']);
    const P = (i, j) => [12 + i * 10.5 + Math.sin(j * 0.9 + i) * 2, 22 + j * 9 + Math.sin(i * 0.7) * 3 + i * 0.4];
    x.strokeStyle = '#c8b080'; x.lineWidth = 1.2;
    for (let j = 0; j < 8; j++) { x.beginPath(); for (let i = 0; i < 8; i++) { const p = P(i, j); i ? x.lineTo(p[0], p[1]) : x.moveTo(p[0], p[1]); } x.stroke(); }
    for (let i = 0; i < 8; i++) { x.beginPath(); for (let j = 0; j < 8; j++) { const p = P(i, j); j ? x.lineTo(p[0], p[1]) : x.moveTo(p[0], p[1]); } x.stroke(); }
    x.strokeStyle = 'rgba(40,30,10,.5)'; x.lineWidth = 0.5; for (let j = 0; j < 8; j++) for (let i = 0; i < 8; i++) { const p = P(i, j); circle(x, p[0], p[1], 0.9); x.stroke(); }
    // floats
    for (let i = 0; i < 4; i++) { const p = P(i * 2 + 0.5, 0); x.fillStyle = rg(x, p[0] - 1, p[1] - 3, 0.5, 6, [[0, '#ffd0a0'], [0.5, '#e0601a'], [1, '#6a2004']]); ellipse(x, p[0] + 3, p[1] - 3, 4.4, 3.4); x.fill(); outline(x, 'rgba(0,0,0,.8)', 0.8); }
  },
  junkFang(x, R, o) {
    itemBG(x, R, o, ['#5a5048', '#201c18', '#050404']);
    ribbon(x, bez([34, 22], [60, 30], [70, 56], [58, 86]), t => 20 * Math.pow(1 - t, 0.8) + 0.4, 30);
    x.fillStyle = lg(x, 30, 20, 70, 80, [[0, '#8a7a5a'], [0.3, '#f4ecd8'], [0.7, '#e0d0b0'], [1, '#fffaf0']]); x.fill(); outline(x, 'rgba(20,14,4,.9)', 1.2);
    x.strokeStyle = 'rgba(120,100,70,.55)'; x.lineWidth = 0.8; for (let i = 1; i < 4; i++) { const p = bez([34, 22], [60, 30], [70, 56], [58, 86])(i / 5); x.beginPath(); x.arc(p[0], p[1], 7 - i, 0.3, 2.2); x.stroke(); }
    // root end
    x.fillStyle = '#6a4a2a'; ellipse(x, 34, 22, 10, 5, 0.4); x.fill(); outline(x, 'rgba(0,0,0,.8)', 0.9);
    x.strokeStyle = 'rgba(255,255,255,.6)'; x.lineWidth = 1.4; strokeCurve(x, t => { const p = bez([34, 22], [60, 30], [70, 56], [58, 86])(t * 0.8 + 0.1); return [p[0] - 3 * (1 - t), p[1]]; }); x.stroke();
  },
  junkHide(x, R, o) {
    itemBG(x, R, o, ['#5a4a38', '#201810', '#050403']);
    const pts = []; for (let i = 0; i < 14; i++) { const a = i / 14 * TAU, r = 30 + R() * 12 * (i % 2 ? 1 : 0.4); pts.push([50 + Math.cos(a) * r, 52 + Math.sin(a) * r * 0.85]); }
    poly(x, pts); x.fillStyle = rg(x, 44, 44, 2, 48, [[0, '#b8905a'], [0.5, '#7a5230'], [1, '#2a1808']]); x.fill(); outline(x, 'rgba(0,0,0,.9)', 1.2);
    x.save(); poly(x, pts); x.clip();
    for (let i = 0; i < 90; i++) { x.strokeStyle = rgba(['#4a3018', '#c8a070', '#6a4424'][i % 3], 0.45); x.lineWidth = 0.6 + R(); const px = 10 + R() * 80, py = 10 + R() * 80; x.beginPath(); x.moveTo(px, py); x.lineTo(px + 3, py + 1.5); x.stroke(); }
    x.fillStyle = 'rgba(40,20,5,.35)'; for (let i = 0; i < 5; i++) { circle(x, 30 + R() * 40, 30 + R() * 40, 2 + R() * 4); x.fill(); }
    x.restore();
    x.strokeStyle = '#2a1a0a'; x.lineWidth = 1.2; x.setLineDash([2, 2]); x.beginPath(); x.moveTo(30, 40); x.lineTo(46, 70); x.stroke(); x.setLineDash([]);
  },
  coin(x, R, o) {
    itemBG(x, R, o, ['#6a5a3a', '#241c10', '#060402']);
    glow(x, 50, 56, 36, '#ffd060', 0.4);
    for (let i = 0; i < 6; i++) { const yy = 84 - i * 6; x.fillStyle = lg(x, 16, 0, 84, 0, [[0, '#5a3a06'], [0.3, '#ffe07a'], [0.55, '#f0b830'], [1, '#6a4206']]); ellipse(x, 36, yy + 3, 22, 7); x.fill(); outline(x, 'rgba(40,20,0,.85)', 0.8); x.fillStyle = lg(x, 16, yy, 58, yy, [[0, '#ffe890'], [1, '#c89020']]); ellipse(x, 36, yy, 22, 7); x.fill(); outline(x, 'rgba(40,20,0,.7)', 0.7); }
    // standing coin
    x.fillStyle = rg(x, 64, 42, 2, 26, [[0, '#fffbe0'], [0.35, '#ffd860'], [0.8, '#b88010'], [1, '#5a3a02']]); ellipse(x, 68, 50, 20, 22); x.fill(); outline(x, 'rgba(40,20,0,.9)', 1.1);
    x.strokeStyle = 'rgba(90,50,0,.6)'; x.lineWidth = 1.2; ellipse(x, 68, 50, 15, 17); x.stroke();
    x.save(); x.translate(68, 50); x.fillStyle = 'rgba(110,60,0,.7)'; for (let i = 0; i < 8; i++) { const a = i / 8 * TAU; poly(x, [[Math.cos(a) * 3, Math.sin(a) * 3], [Math.cos(a + 0.2) * 10, Math.sin(a + 0.2) * 10], [Math.cos(a - 0.2) * 10, Math.sin(a - 0.2) * 10]]); x.fill(); } x.restore();
    sparkle(x, 60, 36, 7);
  },
  gem(x, R, o) {
    itemBG(x, R, o, ['#4a4a5a', '#16161e', '#040406']);
    const col = o.tint || (o.rarity ? rarityColor(o.rarity) : '#e0203a');
    gemShape(x, 50, 50, 30, col, { n: 8, sy: 0.92 });
    sparkle(x, 70, 30, 6);
  },
  dragonScale(x, R, o) {
    const col = o.tint || '#d0401a';
    itemBG(x, R, o, [mix('#5a4a3a', col, 0.3), '#1a120c', '#050302']);
    const scale = (cx, cy, s, c) => {
      x.save(); x.translate(cx, cy); x.scale(s, s);
      x.beginPath(); x.moveTo(0, -30); x.bezierCurveTo(22, -26, 26, 4, 0, 30); x.bezierCurveTo(-26, 4, -22, -26, 0, -30); x.closePath();
      x.fillStyle = rg(x, -6, -10, 1, 36, [[0, shade(c, 0.6)], [0.3, c], [0.75, shade(c, -0.55)], [1, shade(c, -0.85)]]); x.fill(); outline(x, 'rgba(0,0,0,.9)', 1.2 / s);
      x.strokeStyle = rgba(shade(c, -0.7), 0.8); x.lineWidth = 1.2 / s;
      for (let i = -2; i <= 2; i++) { x.beginPath(); x.moveTo(i * 4, -24 + Math.abs(i) * 3); x.quadraticCurveTo(i * 7, 0, i * 2, 26); x.stroke(); }
      add(x); x.strokeStyle = rgba(shade(c, 0.7), 0.7); x.lineWidth = 2 / s; x.beginPath(); x.moveTo(-10, -18); x.bezierCurveTo(-16, -8, -14, 6, -6, 16); x.stroke(); norm(x);
      x.restore();
    };
    scale(34, 40, 0.7, shade(col, -0.2)); scale(66, 42, 0.7, shade(col, -0.15)); scale(50, 56, 1, col);
    rarityGlow(x, o, 50, 56, 30);
    sparkle(x, 42, 36, 5);
  },
  drakeReins(x, R, o) {
    const rar = o.rarity || 'epic';
    const col = o.tint || '#ff6a1a';
    itemBG(x, R, { rarity: rar }, ['#5a3a2a', '#1c120c', '#050302']);
    glow(x, 50, 50, 40, rarityColor(rar), 0.35);
    // looping leather straps
    for (const [f, w] of [[bez([10, 30], [40, 90], [70, 80], [90, 36]), 5], [bez([16, 70], [30, 20], [70, 16], [86, 64]), 4.4]]) {
      ribbon(x, f, () => w, 40);
      x.fillStyle = lg(x, 0, 20, 0, 90, [[0, '#9a6a3a'], [0.5, '#5a3418'], [1, '#2a1406']]); x.fill(); outline(x, 'rgba(0,0,0,.9)', 1);
      x.strokeStyle = 'rgba(240,200,140,.45)'; x.lineWidth = 0.5; x.setLineDash([1.2, 1.4]); strokeCurve(x, f, 40); x.stroke(); x.setLineDash([]);
    }
    // rings
    for (const [rx, ry] of [[14, 38], [86, 44]]) { x.lineWidth = 3; x.strokeStyle = metalLG(x, rx - 6, ry - 6, rx + 6, ry + 6, 'gold'); circle(x, rx, ry, 6); x.stroke(); }
    // drake medallion
    x.fillStyle = metalLG(x, 34, 34, 66, 66, 'gold'); circle(x, 50, 50, 17); x.fill(); outline(x, 'rgba(0,0,0,.9)', 1.2);
    x.save(); x.beginPath(); x.arc(50, 50, 14, 0, TAU); x.clip();
    x.fillStyle = rg(x, 50, 50, 1, 14, [[0, shade(col, 0.2)], [1, shade(col, -0.7)]]); x.fillRect(30, 30, 40, 40);
    x.translate(50, 50); x.scale(0.3, 0.3); x.translate(-50, -52); dragonHead(x, R, ['#fff0c0', '#e0a030', '#8a5a10', '#3a2004', '#ff3a10']);
    x.restore();
    sparkle(x, 38, 38, 6);
  },

  // ===================================================== RACES / CLASSES (character creation, meters)
  raceHuman(x, R) {
    bg(x, R, ['#6a8ad8', '#1a2a5a', '#04060e'], { strokes: ['#4a6ab8', '#0a1428'] });
    // shield with tower
    x.beginPath(); x.moveTo(24, 20); x.lineTo(76, 20); x.bezierCurveTo(78, 54, 66, 76, 50, 88); x.bezierCurveTo(34, 76, 22, 54, 24, 20); x.closePath();
    x.fillStyle = rg(x, 42, 36, 2, 60, [[0, '#4a7ae0'], [0.6, '#1a3a8a'], [1, '#0a1640']]); x.fill(); x.lineWidth = 4; x.strokeStyle = metalLG(x, 20, 20, 80, 80, 'gold'); x.stroke(); outline(x, 'rgba(0,0,0,.9)', 1);
    x.fillStyle = metalLG(x, 40, 30, 60, 70, 'silver');
    poly(x, [[42, 70], [42, 42], [39, 42], [39, 34], [43, 34], [43, 37], [47, 37], [47, 34], [53, 34], [53, 37], [57, 37], [57, 34], [61, 34], [61, 42], [58, 42], [58, 70]]); x.fill(); outline(x, 'rgba(0,0,0,.8)', 0.8);
    x.fillStyle = '#0a1020'; x.beginPath(); x.moveTo(47, 70); x.lineTo(47, 60); x.arc(50, 60, 3, Math.PI, 0); x.lineTo(53, 70); x.fill();
    // sun crown
    x.fillStyle = metalLG(x, 36, 8, 64, 24, 'gold');
    for (let i = 0; i < 7; i++) { const a = Math.PI + (i + 0.5) / 7 * Math.PI; poly(x, [[50 + Math.cos(a - 0.14) * 6, 20 + Math.sin(a - 0.14) * 6], [50 + Math.cos(a) * 15, 20 + Math.sin(a) * 15], [50 + Math.cos(a + 0.14) * 6, 20 + Math.sin(a + 0.14) * 6]]); x.fill(); }
    x.beginPath(); x.arc(50, 20, 6.5, Math.PI, 0); x.fill(); outline(x, 'rgba(60,30,0,.8)', 0.8);
  },
  raceDwarf(x, R) {
    bg(x, R, ['#d88a4a', '#5a2410', '#0e0402'], { strokes: ['#a0501a', '#2a0a04'] });
    glow(x, 50, 62, 30, '#ff8a30', 0.6);
    // anvil
    x.fillStyle = metalLG(x, 18, 50, 82, 90, 'iron');
    x.beginPath(); x.moveTo(14, 56); x.lineTo(78, 56); x.quadraticCurveTo(90, 56, 92, 50); x.lineTo(80, 64); x.lineTo(66, 66); x.lineTo(62, 76); x.lineTo(72, 86); x.lineTo(28, 86); x.lineTo(38, 76); x.lineTo(34, 66); x.lineTo(22, 64); x.closePath(); x.fill(); outline(x, 'rgba(0,0,0,.9)', 1.3);
    x.fillStyle = 'rgba(255,255,255,.4)'; x.fillRect(16, 56, 62, 2);
    // hammer
    x.save(); x.translate(56, 40); x.rotate(-0.6);
    haft(x, 0, 0, 0, 34, 5);
    x.fillStyle = metalLG(x, -14, -6, 14, 6, 'steel'); x.beginPath(); x.roundRect(-15, -8, 30, 14, 2); x.fill(); outline(x, 'rgba(0,0,0,.9)', 1.1);
    x.fillStyle = metalLG(x, -4, 0, 4, 0, 'gold'); x.fillRect(-4, -8, 8, 14);
    x.restore();
    embers(x, R, 18, 50, 54, 22, ['#ffd070', '#ff8a20']);
  },
  raceOrc(x, R) {
    bg(x, R, ['#b84a2a', '#4a1008', '#0a0201'], { strokes: ['#8a2a10', '#200402'] });
    // crossed axes behind
    for (const s of [-1, 1]) { x.save(); x.translate(50 + s * 26, 88); x.rotate(-s * 0.7); haft(x, 0, 0, 0, -76, 5); x.translate(0, -68); x.save(); x.scale(-s * 1.05, 1.05); axeHead(x, 'iron', 1); x.restore(); x.restore(); }
    // tusked skull
    skull(x, 50, 50, 0.72, { bone: ['#fff4d8', '#d0bc90', '#7a6440', '#2a2010'] });
    for (const s of [-1, 1]) { ribbon(x, qbez([50 + s * 7, 64], [50 + s * 12, 58], [50 + s * 11, 48]), t => 4.2 * (1 - t) + 0.3, 16); x.fillStyle = lg(x, 0, 64, 0, 48, [[0, '#d8c8a0'], [1, '#ffffff']]); x.fill(); outline(x, 'rgba(0,0,0,.85)', 0.8); }
  },
  raceElf(x, R) {
    bg(x, R, ['#9a7ad8', '#281a5a', '#05030e'], { strokes: ['#6a4ab0', '#10082a'] });
    glow(x, 50, 44, 34, '#d8c8ff', 0.5);
    // crescent moon
    x.save(); x.beginPath(); x.arc(46, 42, 24, 0, TAU); x.arc(56, 36, 21, 0, TAU, true); x.clip('evenodd');
    x.fillStyle = rg(x, 38, 36, 2, 30, [[0, '#ffffff'], [0.5, '#d8e0ff'], [1, '#7a88c8']]); x.fillRect(0, 0, 100, 100);
    x.restore();
    // leaf
    x.save(); x.translate(56, 80); x.rotate(-0.7);
    x.beginPath(); x.moveTo(0, 0); x.bezierCurveTo(8, -10, 26, -12, 38, 0); x.bezierCurveTo(26, 10, 8, 10, 0, 0); x.closePath();
    x.fillStyle = lg(x, 0, -10, 0, 10, [[0, '#c0ffa0'], [0.5, '#3aa040'], [1, '#0a4010']]); x.fill(); outline(x, 'rgba(0,20,0,.85)', 0.9);
    x.strokeStyle = 'rgba(230,255,210,.7)'; x.lineWidth = 0.7; x.beginPath(); x.moveTo(2, 0); x.lineTo(35, 0); for (let i = 1; i < 5; i++) { x.moveTo(i * 7, 0); x.lineTo(i * 7 + 4, -5); x.moveTo(i * 7, 0); x.lineTo(i * 7 + 4, 5); } x.stroke();
    x.restore();
    for (let i = 0; i < 8; i++) sparkle(x, 12 + R() * 76, 10 + R() * 60, 1.4 + R() * 2, '#e8e0ff', R());
  },
  classWarrior(x, R) {
    bg(x, R, ['#c89060', '#4a2410', '#0a0402'], { strokes: ['#8a5a30', '#200a02'] });
    x.save(); x.translate(50, 52); x.scale(0.8, 0.8); x.translate(-50, -50); PAINT.shield(x, () => 0.5, { tint: '#8a1a14' }); x.restore();
    x.save(); x.translate(24, 84); x.rotate(0.78); sword(x, { len: 76, w: 9, metal: 'steel' }); x.restore();
  },
  classMage(x, R) {
    bg(x, R, ['#80c8ff', '#1a3a7a', '#030814'], { strokes: ['#4a8ae0', '#081830'] });
    // arcane rune circle
    add(x); x.strokeStyle = rgba('#a8e0ff', 0.8); x.lineWidth = 1.6; blur(x, 6, '#60b0ff'); circle(x, 50, 50, 34); x.stroke(); circle(x, 50, 50, 27); x.stroke();
    x.beginPath(); for (let i = 0; i < 6; i++) { const a = i / 6 * TAU - Math.PI / 2; const px = 50 + Math.cos(a) * 27, py = 50 + Math.sin(a) * 27; i ? x.lineTo(px, py) : x.moveTo(px, py); } x.closePath(); x.stroke();
    x.beginPath(); for (let i = 0; i < 3; i++) { const a = i / 3 * TAU - Math.PI / 2; const px = 50 + Math.cos(a) * 27, py = 50 + Math.sin(a) * 27; i ? x.lineTo(px, py) : x.moveTo(px, py); } x.closePath(); x.stroke();
    noBlur(x); norm(x);
    glow(x, 50, 50, 22, '#80d0ff', 1);
    x.fillStyle = rg(x, 48, 48, 1, 12, [[0, '#ffffff'], [0.5, '#a8e8ff'], [1, 'rgba(60,150,255,0)']]); circle(x, 50, 50, 12); x.fill();
    for (let i = 0; i < 6; i++) { const a = i / 6 * TAU - Math.PI / 2; sparkle(x, 50 + Math.cos(a) * 34, 50 + Math.sin(a) * 34, 3, '#e0f4ff', 0.2); }
  },
  classPriest(x, R) {
    bg(x, R, ['#fff4d0', '#9a8050', '#161008'], { strokes: ['#e8d8a8', '#4a3a18'] });
    add(x); for (let i = 0; i < 16; i++) { const a = i / 16 * TAU; x.fillStyle = rgba('#fff8e0', 0.16); poly(x, [[50, 50], [50 + Math.cos(a - 0.08) * 80, 50 + Math.sin(a - 0.08) * 80], [50 + Math.cos(a + 0.08) * 80, 50 + Math.sin(a + 0.08) * 80]]); x.fill(); } norm(x);
    glow(x, 50, 50, 30, '#fff4c0', 1);
    // eight-point star
    x.save(); x.translate(50, 50);
    for (let k = 0; k < 2; k++) { x.rotate(k * Math.PI / 4); x.fillStyle = metalLG(x, -22, -22, 22, 22, k ? 'silver' : 'gold'); x.beginPath(); for (let i = 0; i < 8; i++) { const a = i / 8 * TAU, r = i % 2 ? 9 : 30 - k * 8; i ? x.lineTo(Math.cos(a) * r, Math.sin(a) * r) : x.moveTo(Math.cos(a) * r, Math.sin(a) * r); } x.closePath(); x.fill(); outline(x, 'rgba(60,40,0,.7)', 0.9); }
    x.restore();
    x.fillStyle = rg(x, 49, 49, 0, 7, [[0, '#ffffff'], [1, '#ffe8a0']]); circle(x, 50, 50, 6); x.fill();
  },
  classRogue(x, R) {
    bg(x, R, ['#8a8a50', '#2a2a14', '#060604'], { strokes: ['#5a5a30', '#141408'] });
    x.save(); x.translate(30, 76); x.rotate(0.9); sword(x, { len: 50, w: 9, tip: 16, taper: 0.6, metal: 'dark', guardMetal: 'iron', grip: 12, guard: 18 }); x.restore();
    x.save(); x.translate(70, 76); x.rotate(-0.9); sword(x, { len: 50, w: 9, tip: 16, taper: 0.6, metal: 'dark', guardMetal: 'iron', grip: 12, guard: 18 }); x.restore();
    glow(x, 50, 44, 12, '#c0ff40', 0.6);
  },
  classHunter(x, R) { bg(x, R, ['#a8c870', '#2a4018', '#050a02'], { strokes: ['#6a8a40', '#101c06'] }); PAINT.bow(x, () => 0.5, {}); },
  classPaladin(x, R) {
    bg(x, R, ['#ffd8e8', '#8a4a6a', '#140610'], { strokes: ['#e0a0c0', '#3a1428'] });
    glow(x, 50, 36, 30, '#fff0c0', 0.8);
    x.save(); x.translate(50, 90); haft(x, 0, 0, 0, -58, 6); x.translate(0, -62);
    x.fillStyle = metalLG(x, -20, -12, 20, 12, 'gold'); x.beginPath(); x.roundRect(-20, -12, 40, 22, 4); x.fill(); outline(x, 'rgba(0,0,0,.9)', 1.2);
    x.fillStyle = metalLG(x, -20, 0, 20, 0, 'silver'); x.fillRect(-20, -4, 40, 6); gemShape(x, 0, -1, 4.6, '#ffffff', { glow: false });
    x.restore();
    sparkle(x, 72, 22, 7);
  },
  dragon(x, R, o) {
    const E = ELEMENTS[o.element || 'ember'] || ELEMENTS.ember;
    bg(x, R, E.bg, { strokes: [E.bg[0], E.bg[1]] });
    glow(x, 40, 50, 40, E.glow, 0.55);
    dragonHead(x, R, E.head);
    // breath
    if (o.element !== 'shadow') fire(x, R, 14, 54, 26, 12, -Math.PI / 2 - 0.2, { n: 3, layers: E.breath });
    embers(x, R, 14, 50, 50, 44, [E.glow, '#ffffff']);
  },
  bag(x, R, o) {
    itemBG(x, R, o, ['#7a6448', '#2a2016', '#060403']);
    const col = o.tint || '#8a5a2a';
    // body
    x.beginPath(); x.moveTo(22, 40); x.bezierCurveTo(20, 30, 30, 26, 50, 26); x.bezierCurveTo(70, 26, 80, 30, 78, 40);
    x.lineTo(82, 80); x.bezierCurveTo(82, 90, 70, 92, 50, 92); x.bezierCurveTo(30, 92, 18, 90, 18, 80); x.closePath();
    x.fillStyle = rg(x, 40, 50, 2, 56, [[0, shade(col, 0.45)], [0.5, col], [1, shade(col, -0.75)]]); x.fill(); outline(x, 'rgba(0,0,0,.9)', 1.3);
    x.strokeStyle = rgba('#f0d8a8', 0.45); x.lineWidth = 0.8; x.setLineDash([1.6, 1.6]);
    x.beginPath(); x.moveTo(24, 44); x.lineTo(27, 84); x.moveTo(76, 44); x.lineTo(73, 84); x.stroke(); x.setLineDash([]);
    // flap
    x.beginPath(); x.moveTo(24, 38); x.bezierCurveTo(26, 22, 74, 22, 76, 38); x.lineTo(72, 58); x.quadraticCurveTo(50, 66, 28, 58); x.closePath();
    x.fillStyle = lg(x, 0, 24, 0, 62, [[0, shade(col, 0.35)], [1, shade(col, -0.45)]]); x.fill(); outline(x, 'rgba(0,0,0,.9)', 1.2);
    x.strokeStyle = rgba('#f0d8a8', 0.5); x.lineWidth = 0.8; x.setLineDash([1.6, 1.6]); x.beginPath(); x.moveTo(30, 54); x.quadraticCurveTo(50, 61, 70, 54); x.stroke(); x.setLineDash([]);
    // straps + buckle
    x.fillStyle = shade(col, -0.55); x.fillRect(46, 56, 8, 30);
    x.lineWidth = 2.6; x.strokeStyle = metalLG(x, 44, 60, 56, 72, 'gold'); x.strokeRect(45, 62, 10, 10); outline(x, 'rgba(0,0,0,.7)', 0.6);
    // handle
    x.strokeStyle = '#2a1608'; x.lineWidth = 5; x.beginPath(); x.moveTo(38, 27); x.bezierCurveTo(38, 10, 62, 10, 62, 27); x.stroke();
    x.strokeStyle = shade(col, 0.1); x.lineWidth = 3; x.stroke();
    x.fillStyle = 'rgba(255,255,255,.18)'; x.beginPath(); x.ellipse(36, 40, 8, 4, -0.4, 0, TAU); x.fill();
  },
  map(x, R, o) {
    itemBG(x, R, o, ['#6a5a40', '#241c12', '#060403']);
    x.save(); x.translate(50, 52); x.rotate(-0.12);
    // sheet with curled ends
    x.beginPath(); x.moveTo(-34, -24); x.quadraticCurveTo(0, -30, 34, -24); x.lineTo(34, 24); x.quadraticCurveTo(0, 30, -34, 24); x.closePath();
    x.fillStyle = lg(x, -34, -24, 34, 24, [[0, '#fff2cc'], [0.5, '#e8d09a'], [1, '#b08a50']]); x.fill(); outline(x, 'rgba(60,40,10,.9)', 1.2);
    for (const sx of [-1, 1]) { x.fillStyle = lg(x, sx * 30, 0, sx * 40, 0, [[0, '#c8a868'], [0.5, '#fff0c8'], [1, '#8a6a38']]); x.beginPath(); x.ellipse(sx * 36, 0, 5, 26, 0, 0, TAU); x.fill(); outline(x, 'rgba(60,40,10,.9)', 1); }
    // terrain doodles
    x.strokeStyle = 'rgba(90,60,20,.7)'; x.lineWidth = 1;
    for (let i = 0; i < 4; i++) { const mx = -20 + i * 9, my = -10 + (i % 2) * 4; x.beginPath(); x.moveTo(mx - 4, my + 4); x.lineTo(mx, my - 3); x.lineTo(mx + 4, my + 4); x.stroke(); }
    x.strokeStyle = 'rgba(40,90,160,.8)'; x.lineWidth = 1.6; x.beginPath(); x.moveTo(-28, 14); x.bezierCurveTo(-14, 6, -6, 20, 8, 12); x.stroke();
    // route + X
    x.strokeStyle = '#b01a10'; x.lineWidth = 1.6; x.setLineDash([2, 2]); x.beginPath(); x.moveTo(-22, 8); x.bezierCurveTo(-4, -4, 8, 10, 18, -8); x.stroke(); x.setLineDash([]);
    x.lineWidth = 2.6; x.beginPath(); x.moveTo(15, -12); x.lineTo(23, -4); x.moveTo(23, -12); x.lineTo(15, -4); x.stroke();
    x.restore();
    sparkle(x, 70, 36, 5);
  },
  unknownHelp(x, R) {
    bg(x, R, ['#6aa0e8', '#163a7a', '#030814'], { strokes: ['#3a70c0', '#081830'] });
    glow(x, 50, 50, 34, '#8ac8ff', 0.6);
    x.lineWidth = 4; x.strokeStyle = metalLG(x, 20, 20, 80, 80, 'gold'); circle(x, 50, 50, 32); x.stroke(); outline(x, 'rgba(0,0,0,.8)', 1);
    x.font = '900 58px Georgia, serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
    x.lineWidth = 6; x.strokeStyle = '#061430'; x.strokeText('?', 50, 54);
    x.fillStyle = lg(x, 0, 26, 0, 80, [[0, '#ffffff'], [0.5, '#e8f0ff'], [1, '#8ab0e0']]); x.fillText('?', 50, 54);
  },
  // ===================================================== game auras / misc (referenced by game data)
  enrage(x, R) {
    bg(x, R, ['#ff5a2a', '#6a0802', '#0e0100'], { cy: 60, angle: -1.57, spread: 0.5, strokes: ['#c01a04', '#300200'] });
    fire(x, R, 50, 92, 70, 70, 0, { n: 7, layers: [['#5a0000', 1, 1, 1], ['#c01a04', 0.85, 0.85, 1], ['#ff5a10', 0.62, 0.6, 1], ['#ffc040', 0.4, 0.38, 1]] });
    // snarling face
    x.fillStyle = rg(x, 50, 50, 4, 30, [[0, '#6a1004'], [1, '#1a0200']]); ellipse(x, 50, 54, 24, 22); x.fill(); outline(x, 'rgba(0,0,0,.9)', 1.2);
    for (const s of [-1, 1]) {
      x.fillStyle = '#1a0200'; poly(x, [[50 + s * 4, 44], [50 + s * 20, 38], [50 + s * 18, 48]]); x.fill();
      glow(x, 50 + s * 11, 47, 9, '#ffe040', 1); x.fillStyle = '#fff8c0'; poly(x, [[50 + s * 5, 46], [50 + s * 17, 44], [50 + s * 14, 50]]); x.fill();
    }
    x.fillStyle = '#0a0000'; x.beginPath(); x.moveTo(36, 60); x.quadraticCurveTo(50, 76, 64, 60); x.quadraticCurveTo(50, 66, 36, 60); x.fill();
    x.fillStyle = '#fff4e0'; for (const tx of [40, 46, 52, 58]) { poly(x, [[tx, 61], [tx + 3, 61.5], [tx + 1.5, 67]]); x.fill(); }
    embers(x, R, 16, 50, 40, 40, ['#ffb040', '#ff5010']);
  },
  fear(x, R) {
    bg(x, R, ['#9a6ad8', '#2a0a4a', '#050008'], { angle: 0, spread: 3, strokes: ['#6a3aa0', '#12041e'] });
    // shock rings
    x.strokeStyle = rgba('#d0a8ff', 0.5); x.lineWidth = 1.4;
    for (let i = 0; i < 4; i++) { x.beginPath(); for (let k = 0; k <= 40; k++) { const a = k / 40 * TAU, r = 30 + i * 6 + Math.sin(a * 9 + i) * 1.6; const px = 50 + Math.cos(a) * r, py = 52 + Math.sin(a) * r; k ? x.lineTo(px, py) : x.moveTo(px, py); } x.stroke(); }
    // screaming pale face
    x.beginPath(); x.moveTo(50, 20); x.bezierCurveTo(70, 20, 74, 44, 70, 60); x.bezierCurveTo(66, 80, 56, 88, 50, 88); x.bezierCurveTo(44, 88, 34, 80, 30, 60); x.bezierCurveTo(26, 44, 30, 20, 50, 20); x.closePath();
    x.fillStyle = rg(x, 46, 40, 2, 40, [[0, '#f4ecff'], [0.5, '#b8a0d8'], [1, '#4a2a6a']]); x.fill(); outline(x, 'rgba(10,0,20,.9)', 1.2);
    x.fillStyle = '#120420'; ellipse(x, 42, 46, 5, 8, 0.2); x.fill(); ellipse(x, 58, 46, 5, 8, -0.2); x.fill();
    x.fillStyle = '#ffffff'; circle(x, 42, 47, 1.2); x.fill(); circle(x, 58, 47, 1.2); x.fill();
    x.fillStyle = '#1a0628'; ellipse(x, 50, 71, 6, 11); x.fill();
    x.strokeStyle = 'rgba(60,20,90,.6)'; x.lineWidth = 1; x.beginPath(); x.moveTo(36, 36); x.lineTo(44, 38); x.moveTo(64, 36); x.lineTo(56, 38); x.stroke();
  },
  fireBreath(x, R) {
    bg(x, R, ['#ff8a30', '#5a1004', '#0c0200'], { angle: 0, spread: 0.3, strokes: ['#c03a08', '#2a0600'] });
    fire(x, R, 26, 58, 78, 44, Math.PI / 2 + 0.08, { n: 7 });
    glow(x, 60, 56, 30, '#ffb040', 0.7);
    // dragon jaw silhouette on the left
    x.fillStyle = rg(x, 14, 50, 2, 30, [[0, '#6a2a14'], [1, '#1a0602']]);
    x.beginPath(); x.moveTo(0, 30); x.bezierCurveTo(12, 26, 26, 34, 30, 48); x.lineTo(20, 52); x.lineTo(30, 62); x.bezierCurveTo(22, 76, 10, 80, 0, 78); x.closePath(); x.fill(); outline(x, 'rgba(0,0,0,.9)', 1.2);
    x.fillStyle = '#fff4d8'; for (const [tx, ty, d] of [[22, 49, 1], [26, 51, 1], [22, 63, -1], [26, 61, -1]]) { poly(x, [[tx, ty], [tx + 3, ty], [tx + 1.5, ty + 4 * d]]); x.fill(); }
    glow(x, 10, 40, 6, '#ffe040', 1);
    embers(x, R, 20, 62, 56, 34, ['#ffe080', '#ff8020']);
  },
  ghost(x, R) {
    bg(x, R, ['#8ab8d8', '#1a3048', '#03070c'], { angle: -1.57, strokes: ['#4a7a9a', '#0a1824'] });
    glow(x, 50, 46, 36, '#a8e0ff', 0.55);
    x.beginPath(); x.moveTo(30, 44); x.bezierCurveTo(30, 18, 70, 18, 70, 44); x.lineTo(72, 78);
    for (let i = 0; i < 5; i++) { const px = 72 - (i + 1) * 8.4; x.quadraticCurveTo(px + 4.2, 70 + (i % 2) * 10, px, 80 + (i % 2 ? -4 : 4)); }
    x.closePath();
    x.fillStyle = rg(x, 46, 36, 2, 44, [[0, 'rgba(255,255,255,.95)'], [0.5, 'rgba(190,230,255,.75)'], [1, 'rgba(90,150,200,.35)']]); x.fill();
    x.strokeStyle = 'rgba(230,250,255,.9)'; x.lineWidth = 1.2; x.stroke();
    x.fillStyle = '#0a2a4a'; ellipse(x, 43, 42, 4, 6); x.fill(); ellipse(x, 57, 42, 4, 6); x.fill(); ellipse(x, 50, 57, 3.5, 5); x.fill();
    glow(x, 43, 42, 6, '#8ae0ff', 0.9); glow(x, 57, 42, 6, '#8ae0ff', 0.9);
    for (let i = 0; i < 8; i++) sparkle(x, 16 + R() * 68, 12 + R() * 76, 1.2 + R() * 2, '#e0f6ff', R());
  },
  poison(x, R) {
    bg(x, R, ['#a8ff6a', '#1e5a10', '#020802'], { strokes: ['#4aa02a', '#0a2006'] });
    glow(x, 50, 56, 34, '#7aff3a', 0.55);
    x.beginPath(); x.moveTo(50, 12); x.bezierCurveTo(56, 30, 76, 46, 74, 64); x.bezierCurveTo(72, 82, 58, 90, 50, 90); x.bezierCurveTo(42, 90, 28, 82, 26, 64); x.bezierCurveTo(24, 46, 44, 30, 50, 12); x.closePath();
    x.fillStyle = rg(x, 42, 52, 2, 40, [[0, '#eaffc0'], [0.3, '#7ae83a'], [0.75, '#2a8a10'], [1, '#0a3a04']]); x.fill(); outline(x, 'rgba(0,20,0,.9)', 1.3);
    skull(x, 50, 66, 0.42, { bone: ['#f0ffe0', '#b8e0a0', '#5a8a40', '#1a3a10'] });
    x.fillStyle = 'rgba(255,255,255,.7)'; x.beginPath(); x.ellipse(40, 50, 3.5, 8, 0.4, 0, TAU); x.fill();
    for (let i = 0; i < 6; i++) { x.fillStyle = rgba('#b0ff70', 0.8); circle(x, 20 + R() * 60, 20 + R() * 20, 1 + R() * 1.5); x.fill(); }
  },
  redBandana(x, R, o) {
    itemBG(x, R, o, ['#6a4a3a', '#241810', '#060403']);
    x.beginPath(); x.moveTo(12, 34); x.quadraticCurveTo(50, 22, 88, 34); x.lineTo(56, 84); x.quadraticCurveTo(50, 90, 44, 84); x.closePath();
    x.fillStyle = rg(x, 44, 40, 2, 56, [[0, '#ff6a50'], [0.45, '#c01410'], [1, '#4a0402']]); x.fill(); outline(x, 'rgba(20,0,0,.9)', 1.3);
    x.fillStyle = 'rgba(255,240,230,.85)';
    for (let i = 0; i < 18; i++) { const px = 24 + (i % 6) * 10 + (Math.floor(i / 6) % 2) * 5, py = 36 + Math.floor(i / 6) * 11; if (Math.abs(px - 50) < 34 - (py - 34) * 0.6) { circle(x, px, py, 1.6); x.fill(); } }
    x.strokeStyle = 'rgba(80,0,0,.6)'; x.lineWidth = 1.2; x.beginPath(); x.moveTo(30, 38); x.quadraticCurveTo(46, 56, 50, 80); x.moveTo(70, 38); x.quadraticCurveTo(56, 56, 50, 80); x.stroke();
    // knot tails
    for (const s of [-1, 1]) { ribbon(x, qbez([50 + s * 36, 32], [50 + s * 46, 40], [50 + s * 42, 60]), t => 7 * (1 - t) + 2, 12); x.fillStyle = s < 0 ? '#a01008' : '#d02418'; x.fill(); outline(x, 'rgba(20,0,0,.9)', 1); }
    x.fillStyle = '#8a0a06'; circle(x, 14, 34, 4); x.fill(); circle(x, 86, 34, 4); x.fill();
  },
  stormPool(x, R) {
    bg(x, R, ['#8ab8ff', '#12286a', '#02040e'], { angle: 0, spread: 3, strokes: ['#3a6ae0', '#081030'] });
    x.fillStyle = rg(x, 50, 58, 4, 40, [[0, 'rgba(210,235,255,.95)'], [0.4, 'rgba(90,150,255,.7)'], [1, 'rgba(20,40,120,0)']]); ellipse(x, 50, 60, 42, 26); x.fill();
    add(x); blur(x, 5, '#6ab0ff');
    for (let k = 0; k < 3; k++) { x.strokeStyle = rgba(['#4a8aff', '#a8d0ff', '#ffffff'][k], 0.8); x.lineWidth = [4, 2, 0.8][k]; x.beginPath(); for (let i = 0; i <= 70; i++) { const t = i / 70, a = t * TAU * 2 + k * 0.5, r = 4 + t * 34; const px = 50 + Math.cos(a) * r, py = 60 + Math.sin(a) * r * 0.55; i ? x.lineTo(px, py) : x.moveTo(px, py); } x.stroke(); }
    noBlur(x); norm(x);
    lightning(x, R, 50, 58, 22, 10, { jit: 5, w: 2.4 }); lightning(x, R, 50, 58, 80, 14, { jit: 5, w: 2 }); lightning(x, R, 50, 58, 52, 4, { jit: 4, w: 1.6 });
    sparkle(x, 50, 58, 10, '#ffffff');
  },
  web(x, R) {
    bg(x, R, ['#8a7a9a', '#241c30', '#050407'], { strokes: ['#5a4a6a', '#120c1a'] });
    const cx = 52, cy = 46, n = 12;
    x.strokeStyle = 'rgba(240,240,255,.85)'; x.lineWidth = 1.1;
    const spokes = [];
    for (let i = 0; i < n; i++) { const a = i / n * TAU + 0.1, l = 58 + R() * 12; spokes.push(a); x.beginPath(); x.moveTo(cx, cy); x.lineTo(cx + Math.cos(a) * l, cy + Math.sin(a) * l); x.stroke(); }
    x.lineWidth = 0.9;
    for (let ring = 1; ring < 9; ring++) { const r = ring * 6.5; x.beginPath(); for (let i = 0; i <= n; i++) { const a = spokes[i % n], a2 = spokes[(i + 1) % n], sag = r * 0.12; const p1 = [cx + Math.cos(a) * r, cy + Math.sin(a) * r], p2 = [cx + Math.cos(a2) * r, cy + Math.sin(a2) * r]; if (!i) x.moveTo(p1[0], p1[1]); const mx = (p1[0] + p2[0]) / 2, my = (p1[1] + p2[1]) / 2; x.quadraticCurveTo(mx + (cx - mx) / r * sag, my + (cy - my) / r * sag, p2[0], p2[1]); } x.stroke(); }
    for (let i = 0; i < 10; i++) { const a = R() * TAU, r = 8 + R() * 44; sparkle(x, cx + Math.cos(a) * r, cy + Math.sin(a) * r, 1.4 + R() * 1.6, '#e8f0ff', R()); }
    // little spider
    x.fillStyle = '#0a0608'; circle(x, 70, 70, 4.5); x.fill(); circle(x, 70, 64, 3); x.fill();
    x.strokeStyle = '#0a0608'; x.lineWidth = 1.2; for (let i = 0; i < 4; i++) for (const s of [-1, 1]) { x.beginPath(); x.moveTo(70, 68); x.quadraticCurveTo(70 + s * 7, 62 + i * 3, 70 + s * 9, 70 + i * 3); x.stroke(); }
    glow(x, 69, 63, 3, '#ff3020', 0.9);
  },
  whelp(x, R) {
    bg(x, R, ['#ffa050', '#6a1a06', '#0e0300'], { strokes: ['#c04a10', '#2a0802'] });
    glow(x, 44, 46, 34, '#ff8a30', 0.5);
    x.save(); x.translate(50, 54); x.scale(0.82, 0.82); x.rotate(-0.12); x.translate(-50, -52);
    dragonHead(x, R, ['#ffd0a0', '#e86a2a', '#8a2a0a', '#2a0802', '#fff060']);
    x.restore();
    // little wing stub
    x.fillStyle = rg(x, 80, 70, 2, 20, [[0, '#ffb070'], [1, '#6a1a06']]); poly(x, [[70, 64], [96, 50], [90, 66], [98, 72], [74, 78]]); x.fill(); outline(x, 'rgba(0,0,0,.85)', 1);
    embers(x, R, 10, 50, 50, 40, ['#ffc060']);
  },
  unknown(x, R) {
    bg(x, R, ['#c83a2a', '#4a0a06', '#0a0201'], {});
    x.fillStyle = '#fff4d0'; x.font = '900 70px Georgia, serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
    blur(x, 6, '#000'); x.fillText('?', 50, 54); noBlur(x);
  },
  // ------------------------------------------------------------------ professions & knick-knacks
  fishingPole(x, R, o) { rod(x, R, o, '#8a5a2c'); },
  fishingPoleGold(x, R, o) { rod(x, R, o, '#c8902a', true); },
  pickaxe(x, R, o) {
    itemBG(x, R, o, ['#5a5048', '#1e1a16', '#050403']);
    x.save(); x.translate(30, 88); x.rotate(0.62);
    haft(x, 0, 0, 0, -74, 7);
    x.translate(0, -70);
    x.beginPath(); x.moveTo(-40, 10); x.quadraticCurveTo(-18, -12, 0, -10); x.quadraticCurveTo(18, -12, 42, 12); x.lineTo(38, 15); x.quadraticCurveTo(18, 0, 0, 2); x.quadraticCurveTo(-18, 0, -36, 14); x.closePath();
    x.fillStyle = metalLG(x, -40, -12, 40, 14, 'iron'); x.fill(); outline(x, 'rgba(0,0,0,.9)', 1.3);
    x.fillStyle = metalLG(x, -8, -12, 8, 6, 'steel'); x.fillRect(-7, -12, 14, 16); x.strokeStyle = 'rgba(0,0,0,.8)'; x.lineWidth = 1; x.strokeRect(-7, -12, 14, 16);
    x.restore(); sparkle(x, 76, 30, 5);
  },
  fishTrout(x, R, o) { fish(x, R, o, '#7a9aa8', '#d88a9a', true); },
  fishSun(x, R, o) { fish(x, R, o, '#d8a030', '#4a8a50', true); },
  fishSnapper(x, R, o) { fish(x, R, o, '#c8402a', '#ffd070', false); },
  fishEel(x, R, o) {
    itemBG(x, R, o, ['#3a5a5a', '#10201e', '#020505']);
    ribbon(x, bez([14, 70], [34, 30], [62, 86], [88, 34]), t => 7 * Math.sin(Math.PI * Math.min(1, t * 1.2)) + 1.5, 30);
    x.fillStyle = lg(x, 14, 30, 88, 86, [[0, '#6a8a4a'], [0.5, '#3a5a2a'], [1, '#1a2a10']]); x.fill(); outline(x, 'rgba(0,0,0,.85)', 1.2);
    x.fillStyle = '#ffe070'; ellipse(x, 84, 38, 2.2, 2.2); x.fill();
  },
  pearl(x, R, o) {
    itemBG(x, R, o, ['#4a5a6a', '#141c24', '#030406']);
    x.beginPath(); x.moveTo(14, 70); x.quadraticCurveTo(50, 96, 86, 70); x.quadraticCurveTo(50, 80, 14, 70); x.fillStyle = lg(x, 14, 70, 86, 90, [[0, '#8a7a6a'], [1, '#3a2e24']]); x.fill(); outline(x);
    x.fillStyle = rg(x, 44, 44, 2, 26, [[0, '#ffffff'], [0.3, '#f0eaf8'], [0.75, '#b8b0d0'], [1, '#6a6488']]); ellipse(x, 50, 52, 22, 22); x.fill(); outline(x, 'rgba(0,0,0,.6)', 1);
    glow(x, 50, 52, 30, '#e8e0ff', 0.35); sparkle(x, 40, 40, 7);
  },
  oreCopper(x, R, o) { ore(x, R, o, '#d0783a', '#6a4a3a'); },
  oreTin(x, R, o) { ore(x, R, o, '#c8ccd4', '#5a5a60'); },
  oreEmber(x, R, o) { ore(x, R, o, '#ff6a20', '#3a2a24', true); },
  herbPeace(x, R, o) { herb(x, R, o, '#fff8e0', '#e8c040', '#5aa040'); },
  herbSilver(x, R, o) { herb(x, R, o, null, null, '#b8c8c0', true); },
  herbBriar(x, R, o) { herb(x, R, o, '#e05a8a', '#ffd0e0', '#3a6a2a', false, true); },
  herbEmber(x, R, o) { herb(x, R, o, '#ff6020', '#ffd040', '#7a4a20'); glow(x, 50, 40, 30, '#ff7020', 0.35); },
  fishCooked(x, R, o) { cooked(x, R, o, '#c88a4a'); },
  fishCookedGold(x, R, o) { cooked(x, R, o, '#d8a040', true); },
  elixir(x, R, o) { bg(x, R, ['#6a3a8a', '#1e0a2a', '#050208'], {}); x.save(); x.translate(50, 54); flask(x, '#c040ff'); x.restore(); sparkle(x, 34, 44, 4); },
  elixirEmber(x, R, o) { bg(x, R, ['#8a4a2a', '#2a0e06', '#070201'], {}); x.save(); x.translate(50, 54); flask(x, '#ff7a20'); x.restore(); sparkle(x, 66, 36, 4); },
  firework(x, R, o) {
    bg(x, R, ['#2a2a5a', '#0a0a20', '#020206'], {});
    for (let i = 0; i < 14; i++) { const a = i / 14 * TAU; x.strokeStyle = ['#ff5040', '#ffd040', '#40c0ff', '#a060ff'][i % 4]; x.lineWidth = 2.2; x.beginPath(); x.moveTo(62 + Math.cos(a) * 8, 30 + Math.sin(a) * 8); x.lineTo(62 + Math.cos(a) * 24, 30 + Math.sin(a) * 24); x.stroke(); }
    glow(x, 62, 30, 20, '#fff0c0', 0.8);
    x.save(); x.translate(34, 80); x.rotate(0.55);
    x.fillStyle = lg(x, -7, 0, 7, 0, [[0, '#6a0a0a'], [0.5, '#e84040'], [1, '#5a0808']]); x.fillRect(-7, -34, 14, 34); x.strokeStyle = 'rgba(0,0,0,.8)'; x.lineWidth = 1; x.strokeRect(-7, -34, 14, 34);
    x.fillStyle = '#ffd040'; x.fillRect(-7, -24, 14, 4);
    poly(x, [[-9, -34], [9, -34], [0, -48]]); x.fillStyle = '#e8e0d0'; x.fill(); outline(x);
    x.strokeStyle = '#8a6a3a'; x.lineWidth = 2; x.beginPath(); x.moveTo(0, 0); x.lineTo(0, 14); x.stroke();
    x.restore();
  },
  emberMark(x, R, o) {
    bg(x, R, ['#7a3a1a', '#2a0c04', '#060100'], {});
    glow(x, 50, 50, 42, '#ff7020', 0.45);
    x.fillStyle = rg(x, 44, 42, 3, 34, [[0, '#fff0b0'], [0.3, '#f0b040'], [0.8, '#9a5a10'], [1, '#4a2a04']]); ellipse(x, 50, 50, 32, 32); x.fill(); outline(x, 'rgba(40,16,0,.95)', 1.6);
    x.strokeStyle = 'rgba(90,40,0,.7)'; x.lineWidth = 1.6; ellipse(x, 50, 50, 25, 25); x.stroke();
    fire(x, R, 50, 64, 30, 14, 0, { n: 1 });
    sparkle(x, 36, 34, 6);
  },
  campfire(x, R, o) {
    bg(x, R, ['#4a3020', '#140a04', '#030100'], { cy: 60 });
    for (const a of [-0.5, 0.5, 0]) { x.save(); x.translate(50, 78); x.rotate(a); x.fillStyle = lg(x, -30, 0, 30, 0, [[0, '#3a2210'], [0.5, '#7a4a24'], [1, '#2a1608']]); x.fillRect(-30, -4, 60, 8); x.strokeStyle = 'rgba(0,0,0,.8)'; x.lineWidth = 1; x.strokeRect(-30, -4, 60, 8); x.restore(); }
    fire(x, R, 50, 74, 48, 22, 0, { n: 3 });
    glow(x, 50, 62, 34, '#ffa040', 0.5);
  },
  anvil(x, R, o) {
    itemBG(x, R, o, ['#5a5048', '#1e1a16', '#050403']);
    x.beginPath(); x.moveTo(12, 38); x.lineTo(78, 38); x.quadraticCurveTo(92, 40, 94, 50); x.lineTo(72, 50); x.lineTo(66, 60); x.lineTo(34, 60); x.lineTo(28, 50); x.lineTo(16, 50); x.closePath();
    x.fillStyle = metalLG(x, 12, 38, 90, 60, 'iron'); x.fill(); outline(x, 'rgba(0,0,0,.9)', 1.3);
    poly(x, [[34, 60], [66, 60], [72, 84], [28, 84]]); x.fillStyle = metalLG(x, 28, 60, 72, 84, 'iron'); x.fill(); outline(x);
    x.save(); x.translate(64, 30); x.rotate(-0.6); haft(x, 0, 0, 0, -26, 5); x.fillStyle = metalLG(x, -10, -34, 10, -24, 'steel'); x.fillRect(-11, -34, 22, 10); x.restore();
    sparkle(x, 30, 30, 6, '#ffd070');
  },
};
function rod(x, R, o, wood, fancy = false) {
  itemBG(x, R, o, ['#3a5a6a', '#10202a', '#020508']);
  x.save(); x.translate(18, 90); x.rotate(0.72);
  haft(x, 0, 0, 0, -92, fancy ? 5 : 4, ['#2a1406', wood, '#140802']);
  x.fillStyle = metalLG(x, -6, 0, 6, 0, fancy ? 'gold' : 'steel'); ellipse(x, 5, -18, 6, 6); x.fill(); outline(x);
  x.restore();
  x.strokeStyle = 'rgba(230,240,255,.8)'; x.lineWidth = 1; x.beginPath(); x.moveTo(78, 14); x.quadraticCurveTo(84, 50, 70, 74); x.stroke();
  x.fillStyle = '#e03020'; ellipse(x, 70, 76, 5, 5); x.fill(); outline(x); x.fillStyle = '#fff'; ellipse(x, 70, 72, 5, 2.5); x.fill();
  if (fancy) sparkle(x, 36, 60, 6, '#ffd070');
}
function fish(x, R, o, body, fin, spots) {
  itemBG(x, R, o, ['#3a5a6a', '#10202a', '#020508']);
  x.save(); x.translate(50, 52); x.rotate(-0.35);
  poly(x, [[30, 0], [46, -16], [44, 16]]); x.fillStyle = shade(body, -0.25); x.fill(); outline(x);
  x.beginPath(); x.moveTo(-40, 0); x.bezierCurveTo(-26, -24, 18, -22, 32, 0); x.bezierCurveTo(18, 22, -26, 22, -40, 0); x.closePath();
  x.fillStyle = lg(x, 0, -20, 0, 20, [[0, shade(body, -0.35)], [0.45, body], [1, shade(body, 0.55)]]); x.fill(); outline(x, 'rgba(0,0,0,.85)', 1.3);
  x.fillStyle = fin; poly(x, [[-6, -16], [10, -26], [14, -14]]); x.fill(); outline(x, 'rgba(0,0,0,.6)', 0.8);
  if (spots) { x.fillStyle = rgba(fin, 0.8); for (let i = 0; i < 9; i++) { ellipse(x, -20 + (i * 7) % 40, -8 + (i * 5) % 14, 1.8, 1.8); x.fill(); } }
  x.fillStyle = '#101010'; ellipse(x, -28, -4, 2.6, 2.6); x.fill(); x.fillStyle = '#fff'; ellipse(x, -28.6, -4.6, 0.9, 0.9); x.fill();
  x.restore();
}
function ore(x, R, o, vein, rock, hot = false) {
  itemBG(x, R, o, ['#4a4440', '#16140f', '#040302']);
  if (hot) glow(x, 50, 56, 40, vein, 0.5);
  poly(x, [[18, 70], [26, 40], [48, 26], [74, 34], [86, 60], [70, 82], [34, 84]]);
  x.fillStyle = lg(x, 20, 26, 80, 84, [[0, shade(rock, 0.35)], [0.5, rock], [1, shade(rock, -0.55)]]); x.fill(); outline(x, 'rgba(0,0,0,.9)', 1.4);
  for (const [cx, cy, r] of [[40, 48, 8], [62, 44, 6], [56, 66, 9], [36, 70, 5], [72, 62, 5]]) { x.fillStyle = rg(x, cx - 2, cy - 2, 0.5, r, [[0, shade(vein, 0.7)], [0.5, vein], [1, shade(vein, -0.5)]]); poly(x, [[cx - r, cy], [cx - r * 0.3, cy - r], [cx + r, cy - r * 0.2], [cx + r * 0.4, cy + r]]); x.fill(); outline(x, 'rgba(0,0,0,.5)', 0.6); }
  sparkle(x, 64, 40, 5);
}
function herb(x, R, o, petal, heart, leaf, silver = false, thorn = false) {
  itemBG(x, R, o, ['#3a5a30', '#10200c', '#020502']);
  for (let i = 0; i < 6; i++) { const a = -Math.PI / 2 + (i - 2.5) * 0.42; x.save(); x.translate(50, 86); x.rotate(a + Math.PI / 2); x.beginPath(); x.moveTo(0, 0); x.quadraticCurveTo(-9, -24, 0, -46); x.quadraticCurveTo(9, -24, 0, 0); x.fillStyle = lg(x, 0, 0, 0, -46, [[0, shade(leaf, -0.5)], [1, silver ? '#f0fff8' : shade(leaf, 0.3)]]); x.fill(); outline(x, 'rgba(0,0,0,.7)', 0.8); x.restore(); }
  if (thorn) { x.strokeStyle = '#2a1a0a'; x.lineWidth = 1.4; for (let i = 0; i < 10; i++) { const px = 30 + (i * 13) % 40, py = 40 + (i * 7) % 40; x.beginPath(); x.moveTo(px, py); x.lineTo(px + 4, py - 5); x.stroke(); } }
  if (petal) for (const [cx, cy] of [[50, 30], [34, 44], [66, 42]]) {
    for (let k = 0; k < 5; k++) { const a = k / 5 * TAU; x.fillStyle = petal; ellipse(x, cx + Math.cos(a) * 5, cy + Math.sin(a) * 5, 5, 3.4, a); x.fill(); outline(x, 'rgba(0,0,0,.4)', 0.6); }
    x.fillStyle = heart; ellipse(x, cx, cy, 3, 3); x.fill();
  }
  if (silver) sparkle(x, 62, 34, 7);
}
function cooked(x, R, o, col, fancy = false) {
  itemBG(x, R, o, ['#6a4a2a', '#22160a', '#060301']);
  x.fillStyle = lg(x, 10, 60, 90, 90, [[0, '#e8e0d0'], [1, '#8a8070']]); ellipse(x, 50, 70, 42, 16); x.fill(); outline(x);
  x.save(); x.translate(50, 58); x.rotate(-0.15);
  x.beginPath(); x.moveTo(-34, 0); x.bezierCurveTo(-22, -18, 16, -18, 28, 0); x.bezierCurveTo(16, 16, -22, 16, -34, 0); x.closePath();
  x.fillStyle = lg(x, 0, -16, 0, 16, [[0, shade(col, -0.5)], [0.5, col], [1, shade(col, 0.3)]]); x.fill(); outline(x);
  x.strokeStyle = 'rgba(60,20,0,.8)'; x.lineWidth = 2; for (let i = -2; i <= 2; i++) { x.beginPath(); x.moveTo(i * 8 - 6, -10); x.lineTo(i * 8 + 4, 10); x.stroke(); }
  poly(x, [[26, 0], [40, -10], [38, 10]]); x.fillStyle = shade(col, -0.4); x.fill(); outline(x);
  x.restore();
  for (let i = 0; i < 3; i++) { x.strokeStyle = 'rgba(255,255,255,.35)'; x.lineWidth = 2; x.beginPath(); x.moveTo(36 + i * 12, 34); x.bezierCurveTo(30 + i * 12, 26, 42 + i * 12, 20, 36 + i * 12, 12); x.stroke(); }
  if (fancy) sparkle(x, 72, 30, 6, '#ffd070');
}
PAINT.junk = PAINT.junkHide;
PAINT.questItem = PAINT.letter;

const ELEMENTS = {
  ember: { bg: ['#ff8a3a', '#5a1204', '#0c0200'], glow: '#ff7a20', head: ['#ffb070', '#c0401a', '#5a1206', '#1a0402', '#ffe040'], breath: null },
  frost: { bg: ['#9ad8ff', '#12407e', '#020916'], glow: '#6ac8ff', head: ['#e8f8ff', '#6aa8e0', '#1a4a8a', '#061630', '#b8f0ff'], breath: [['#1a4a9a', 1, 1, 0.9], ['#5ab0ff', 0.8, 0.8, 1], ['#c8ecff', 0.55, 0.5, 1], ['#ffffff', 0.3, 0.25, 1]] },
  venom: { bg: ['#b8ff6a', '#1e5a10', '#030a02'], glow: '#7aff3a', head: ['#d8ffa0', '#5aa02a', '#1e4a0a', '#081804', '#e0ff40'], breath: [['#1a5a0a', 1, 1, 0.9], ['#5ad020', 0.8, 0.8, 1], ['#b8ff60', 0.55, 0.5, 1], ['#f0ffc0', 0.3, 0.25, 1]] },
  storm: { bg: ['#c0d8ff', '#26407a', '#04081a'], glow: '#8ab8ff', head: ['#f0f4ff', '#8a9ad8', '#2a3a7a', '#0a1030', '#ffffff'], breath: [['#2a3a9a', 1, 1, 0.9], ['#6a8aff', 0.8, 0.8, 1], ['#d0e0ff', 0.55, 0.5, 1], ['#ffffff', 0.3, 0.25, 1]] },
  shadow: { bg: ['#a070ff', '#2c0c4e', '#040008'], glow: '#9a50ff', head: ['#c8a8ff', '#5a3a9a', '#24104a', '#0a0418', '#ff40ff'], breath: null },
};
function glowFor(o) {
  const r = o && o.rarity && rarityName(o.rarity);
  if (o && o.glow) return typeof o.glow === 'string' ? o.glow : rarityColor(r || 'epic');
  return r === 'epic' || r === 'legendary' ? rarityColor(r) : null;
}

/** Element palette used by the dragon icon/cards: { bg, glow, head } */
export function elementColors(el) { return ELEMENTS[el] || ELEMENTS.ember; }

// Painting toolkit shared with art.js (ornaments, markers, share card).
export const paint = {
  lg, rg, poly, circle, ellipse, glow, sparkle, embers, metalLG, METAL, skull, wingFeathers, ribbon, bez, qbez, sword, haft, axeHead,
  blur, noBlur, add, norm, outline, gemShape, fire, dragonHead, brush, lightning, strokeCurve,
  /** Set device px per drawing unit (shadowBlur is not affected by transforms). */
  setK(k) { K = k; },
};
