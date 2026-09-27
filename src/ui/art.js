// Procedural UI art: tileable textures, 9-slice frame borders, the portrait ring, the elite dragon
// ornament, action-bar end caps, coins, quest marks, raid markers, role icons and small glyphs.
// Everything is drawn on CPU-backed canvases at 2× density and cached as data URLs.
import { paint as P } from './icons.js';
import { rng, rgba, mix } from './util.js';

const TAU = Math.PI * 2;
const cache = new Map();
const memo = (key, fn) => { let v = cache.get(key); if (v === undefined) { v = fn(); cache.set(key, v); } return v; };
function cv(w, h) {
  const c = document.createElement('canvas'); c.width = Math.ceil(w); c.height = Math.ceil(h);
  const x = c.getContext('2d', { willReadFrequently: true }); x.lineJoin = 'round'; x.lineCap = 'round';
  return [c, x];
}
const url = c => c.toDataURL();
const { lg, rg, poly, circle, ellipse, glow, sparkle, metalLG, METAL, outline, ribbon, bez, qbez } = P;

// ------------------------------------------------------------------ periodic value noise
function valueNoise(S, cells, R) {
  const lat = new Float32Array(cells * cells); for (let i = 0; i < lat.length; i++) lat[i] = R();
  const out = new Float32Array(S * S), sm = t => t * t * (3 - 2 * t);
  for (let y = 0; y < S; y++) {
    const v = y / S * cells, j = Math.floor(v), fv = sm(v - j), j0 = j % cells, j1 = (j + 1) % cells;
    for (let x = 0; x < S; x++) {
      const u = x / S * cells, i = Math.floor(u), fu = sm(u - i), i0 = i % cells, i1 = (i + 1) % cells;
      const a = lat[j0 * cells + i0] + (lat[j0 * cells + i1] - lat[j0 * cells + i0]) * fu;
      const b = lat[j1 * cells + i0] + (lat[j1 * cells + i1] - lat[j1 * cells + i0]) * fu;
      out[y * S + x] = a + (b - a) * fv;
    }
  }
  return out;
}
function fbm(S, octs, seed) {
  const R = rng(seed), out = new Float32Array(S * S); let tot = 0;
  for (const [cells, amp] of octs) { const n = valueNoise(S, cells, R); for (let i = 0; i < out.length; i++) out[i] += n[i] * amp; tot += amp; }
  for (let i = 0; i < out.length; i++) out[i] /= tot;
  return out;
}
function texFrom(S, fn) {
  const [c, x] = cv(S, S); const img = x.createImageData(S, S), d = img.data;
  for (let i = 0; i < S * S; i++) { const [r, g, b, a = 255] = fn(i); d[i * 4] = r; d[i * 4 + 1] = g; d[i * 4 + 2] = b; d[i * 4 + 3] = a; }
  x.putImageData(img, 0, 0);
  return c;
}

/** Dark tooled leather (tileable 256). */
export const leatherTex = () => memo('leather', () => {
  const S = 256, n = fbm(S, [[4, 0.5], [8, 0.3], [32, 0.16]], 11), w = fbm(S, [[8, 0.6], [16, 0.4]], 12), R = rng(5);
  return url(texFrom(S, i => {
    const ridge = 1 - Math.abs(w[i] * 2 - 1), crease = ridge > 0.95 ? (ridge - 0.95) * 4 : 0;
    const v = 0.74 + n[i] * 0.5 - crease * 0.35 + (R() - 0.5) * 0.14;
    return [34 * v, 27 * v, 21 * v];
  }));
});
/** Aged parchment (tileable 256). */
export const parchmentTex = () => memo('parchment', () => {
  const S = 256, n = fbm(S, [[3, 0.5], [6, 0.3], [12, 0.2]], 21), f = fbm(S, [[64, 1]], 22), R = rng(9);
  const [c, x] = cv(S, S);
  x.drawImage(texFrom(S, i => {
    const b = n[i], t = Math.max(0, b - 0.52) * 2.2, g = (f[i] - 0.5) * 18 + (R() - 0.5) * 10;
    return [238 - t * 50 + g, 222 - t * 64 + g, 180 - t * 86 + g * 0.8];
  }), 0, 0);
  // fibres
  x.lineWidth = 0.6;
  for (let i = 0; i < 200; i++) {
    const px = R() * S, py = R() * S, a = R() * TAU, l = 3 + R() * 12;
    x.strokeStyle = R() < 0.5 ? 'rgba(120,80,30,.10)' : 'rgba(255,250,230,.14)';
    const ex = px + Math.cos(a) * l, ey = py + Math.sin(a) * l;
    x.beginPath(); x.moveTo(px, py); x.lineTo(ex, ey);
    if (ex < 0 || ex > S || ey < 0 || ey > S) { const ox = ex < 0 ? S : ex > S ? -S : 0, oy = ey < 0 ? S : ey > S ? -S : 0; x.moveTo(px + ox, py + oy); x.lineTo(ex + ox, ey + oy); }
    x.stroke();
  }
  return url(c);
});
/** Dark slate / stone for dialog backgrounds (tileable 256). */
export const stoneTex = () => memo('stone', () => {
  const S = 256, n = fbm(S, [[4, 0.5], [8, 0.3], [32, 0.2]], 31), v2 = fbm(S, [[6, 0.7], [12, 0.3]], 32), R = rng(3);
  return url(texFrom(S, i => {
    const vein = 1 - Math.abs(v2[i] * 2 - 1), vv = vein > 0.95 ? (vein - 0.95) * 8 : 0;
    const v = 0.7 + n[i] * 0.6 + vv * 0.4 + (R() - 0.5) * 0.06;
    return [22 * v, 21 * v, 26 * v];
  }));
});

// ------------------------------------------------------------------ 9-slice frame borders
/**
 * Gilded bronze border for border-image. Returns { url, slice, width } where slice is in image px
 * and width the recommended CSS border width. kind: 'bronze' | 'thin' | 'heavy' | 'silver'
 */
export function frameBorder(kind = 'bronze') {
  return memo('frame:' + kind, () => {
    const cfg = { bronze: [64, 20, 7, 'bronze'], thin: [48, 14, 4.5, 'bronze'], heavy: [96, 30, 11, 'bronze'], silver: [64, 20, 7, 'silver'] }[kind];
    const [S, slice, band, metal] = cfg;
    const [c, x] = cv(S, S);
    const m = METAL[metal === 'silver' ? 'silver' : 'bronze'], g = METAL.gold;
    const pal = metal === 'silver' ? m : [g[0], mix(g[1], m[1], 0.35), mix(g[2], m[2], 0.4), m[3], m[4]];
    const o = 1.2, i = o + band;
    const sides = [
      [[o, o], [S - o, o], [S - i, i], [i, i], lg(x, 0, o, 0, i, [[0, pal[1]], [0.35, pal[0]], [0.7, pal[2]], [1, pal[3]]])],
      [[o, S - o], [S - o, S - o], [S - i, S - i], [i, S - i], lg(x, 0, S - o, 0, S - i, [[0, pal[4]], [0.4, pal[2]], [0.75, pal[1]], [1, pal[3]]])],
      [[o, o], [o, S - o], [i, S - i], [i, i], lg(x, o, 0, i, 0, [[0, pal[1]], [0.35, pal[0]], [0.7, pal[2]], [1, pal[3]]])],
      [[S - o, o], [S - o, S - o], [S - i, S - i], [S - i, i], lg(x, S - o, 0, S - i, 0, [[0, pal[4]], [0.4, pal[2]], [0.75, pal[1]], [1, pal[3]]])],
    ];
    for (const [a, b, cc, d, grad] of sides) { x.fillStyle = grad; poly(x, [a, b, cc, d]); x.fill(); }
    x.lineWidth = 1.4; x.strokeStyle = 'rgba(0,0,0,.95)'; x.strokeRect(o - 0.5, o - 0.5, S - 2 * o + 1, S - 2 * o + 1);
    x.lineWidth = 1.2; x.strokeStyle = 'rgba(0,0,0,.8)'; x.strokeRect(i + 0.4, i + 0.4, S - 2 * i - 0.8, S - 2 * i - 0.8);
    x.lineWidth = 0.8; x.strokeStyle = rgba(pal[0], 0.55); x.beginPath(); x.moveTo(o + 1.6, S - o - 2); x.lineTo(o + 1.6, o + 1.6); x.lineTo(S - o - 2, o + 1.6); x.stroke();
    // corner plates with rivet + filigree
    const cs = slice - 1.5;
    for (const [sx, sy] of [[0, 0], [1, 0], [0, 1], [1, 1]]) {
      x.save(); x.translate(sx ? S : 0, sy ? S : 0); x.scale(sx ? -1 : 1, sy ? -1 : 1);
      x.beginPath(); x.moveTo(0.6, 0.6); x.lineTo(cs, 0.6); x.lineTo(cs, band * 0.55 + 2); x.quadraticCurveTo(band + 3, band + 3, band * 0.55 + 2, cs); x.lineTo(0.6, cs); x.closePath();
      x.fillStyle = rg(x, cs * 0.35, cs * 0.35, 0.5, cs * 1.1, [[0, pal[0]], [0.35, pal[1]], [0.75, pal[2]], [1, pal[4]]]); x.fill();
      outline(x, 'rgba(0,0,0,.95)', 1.2);
      x.strokeStyle = rgba(pal[0], 0.6); x.lineWidth = 0.7; x.beginPath(); x.moveTo(2, cs - 2); x.lineTo(2, 2); x.lineTo(cs - 2, 2); x.stroke();
      const r = Math.max(1.8, band * 0.42), rc = band * 0.5 + o + 0.4;
      x.fillStyle = rg(x, rc - r * 0.35, rc - r * 0.35, 0.2, r * 1.2, [[0, '#fffbe8'], [0.4, pal[1]], [1, pal[4]]]); circle(x, rc, rc, r); x.fill(); outline(x, 'rgba(0,0,0,.9)', 0.8);
      x.strokeStyle = 'rgba(40,20,0,.55)'; x.lineWidth = 0.8;
      x.beginPath(); x.moveTo(rc + r + 2, rc - 0.5); x.quadraticCurveTo(cs - 2, rc - 1, cs - 1, band * 0.5 + 2); x.stroke();
      x.beginPath(); x.moveTo(rc - 0.5, rc + r + 2); x.quadraticCurveTo(rc - 1, cs - 2, band * 0.5 + 2, cs - 1); x.stroke();
      x.restore();
    }
    return { url: url(c), slice, width: slice / 2 };
  });
}

// ------------------------------------------------------------------ portrait ring
/** Bronze ring for round portraits. D = display diameter (px). Returns data URL drawn at 2×. */
export function portraitRing(D = 72, kind = 'bronze') {
  return memo('ring:' + D + kind, () => {
    const S = D * 2, [c, x] = cv(S, S), cx = S / 2, R0 = S / 2 - 1, W = Math.max(8, S * 0.085), R1 = R0 - W;
    P.setK(1);
    const pal = kind === 'silver' ? METAL.silver : [METAL.gold[0], mix(METAL.gold[1], METAL.bronze[1], 0.3), mix(METAL.gold[2], METAL.bronze[2], 0.4), METAL.bronze[3], METAL.bronze[4]];
    // inner shadow onto the portrait
    x.fillStyle = rg(x, cx, cx, R1 * 0.7, R1 + 1, [[0, 'rgba(0,0,0,0)'], [1, 'rgba(0,0,0,.7)']]); circle(x, cx, cx, R1 + 1); x.fill();
    // ring
    x.beginPath(); x.arc(cx, cx, R0, 0, TAU); x.arc(cx, cx, R1, 0, TAU, true);
    x.fillStyle = lg(x, cx - R0, cx - R0, cx + R0, cx + R0, [[0, pal[0]], [0.25, pal[1]], [0.5, pal[2]], [0.62, pal[1]], [0.85, pal[3]], [1, pal[4]]]); x.fill();
    x.strokeStyle = 'rgba(0,0,0,.95)'; x.lineWidth = 2; circle(x, cx, cx, R0 - 0.5); x.stroke(); circle(x, cx, cx, R1 + 0.5); x.stroke();
    x.strokeStyle = rgba(pal[0], 0.7); x.lineWidth = 1.2; x.beginPath(); x.arc(cx, cx, R0 - W * 0.32, Math.PI * 0.95, Math.PI * 1.6); x.stroke();
    x.strokeStyle = 'rgba(0,0,0,.35)'; x.lineWidth = 1; x.beginPath(); x.arc(cx, cx, R0 - W * 0.55, 0, TAU); x.stroke();
    for (let i = 0; i < 8; i++) {
      const a = i / 8 * TAU + Math.PI / 8, rr = R1 + W / 2, px = cx + Math.cos(a) * rr, py = cx + Math.sin(a) * rr, r = W * 0.24;
      x.fillStyle = rg(x, px - r * 0.4, py - r * 0.4, 0.2, r * 1.3, [[0, '#fffbe8'], [0.45, pal[1]], [1, pal[4]]]); circle(x, px, py, r); x.fill(); outline(x, 'rgba(0,0,0,.85)', 0.8);
    }
    return url(c);
  });
}

// ------------------------------------------------------------------ elite / rare / boss dragon ornament
/**
 * Winged dragon ornament that wraps a round portrait (target frame). The portrait centre sits at
 * (cx, cy) of the returned image; r = portrait ring radius used for the geometry. Display at 1× size w×h.
 * kind: 'elite' (gold) | 'rare' (silver) | 'rareelite' (silver+gold) | 'boss' (gold + ruby)
 */
export function eliteOrnament(kind = 'elite', r = 36, mirror = false) {
  return memo(`elite:${kind}:${r}:${mirror}`, () => {
    const k = 2, w = r * 3.8, h = r * 3.4, cx = r * 1.3, cy = r * 1.82;
    const [c, x] = cv(w * k, h * k); x.scale(k, k); P.setK(k);
    if (mirror) { x.translate(w, 0); x.scale(-1, 1); }
    const silver = kind === 'rare' || kind === 'rareelite';
    const pal = silver ? METAL.silver : METAL.gold;
    const trim = kind === 'rareelite' ? METAL.gold : pal;
    const fillM = (x0, y0, x1, y1, p = pal) => lg(x, x0, y0, x1, y1, [[0, p[3]], [0.2, p[1]], [0.4, p[0]], [0.62, p[2]], [0.85, p[3]], [1, p[4]]]);
    x.save(); x.translate(cx, cy);
    const R = r;
    // --- membrane wing (behind): arm → wrist, four fingers, scalloped panels with alternating fold tones
    const root = [R * 0.55, -R * 0.66], wrist = [R * 1.15, -R * 1.12];
    const tips = [[R * 1.0, -R * 1.72], [R * 1.72, -R * 1.62], [R * 2.25, -R * 1.12], [R * 2.4, -R * 0.45]];
    const tail0 = [R * 0.98, -R * 0.12];
    const panels = [[tips[0], tips[1]], [tips[1], tips[2]], [tips[2], tips[3]], [tips[3], tail0]];
    const memCols = silver ? ['#e8eef8', '#9aa6ba', '#4a5468'] : ['#ffe7a0', '#c8902a', '#6a3e08'];
    panels.forEach(([a, b], i) => {
      x.beginPath(); x.moveTo(wrist[0], wrist[1]); x.lineTo(a[0], a[1]);
      const mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2, px = (wrist[0] - mx) * 0.38, py = (wrist[1] - my) * 0.38;
      x.quadraticCurveTo(mx + px, my + py, b[0], b[1]);
      if (i === 3) x.lineTo(root[0], root[1]);
      x.closePath();
      x.fillStyle = lg(x, wrist[0], wrist[1], mx, my, [[0, memCols[2]], [0.55, i % 2 ? memCols[1] : mix(memCols[1], memCols[0], 0.35)], [1, i % 2 ? memCols[0] : memCols[1]]]);
      x.fill(); outline(x, 'rgba(20,10,0,.9)', 0.9);
      // membrane veins
      x.strokeStyle = silver ? 'rgba(50,60,80,.35)' : 'rgba(90,50,0,.35)'; x.lineWidth = 0.6;
      for (let k = 1; k < 3; k++) { const t = k / 3; x.beginPath(); x.moveTo(wrist[0], wrist[1]); x.quadraticCurveTo((wrist[0] + a[0] * (1 - t) + b[0] * t) / 2 + 2, (wrist[1] + a[1] * (1 - t) + b[1] * t) / 2, (a[0] * (1 - t) + b[0] * t + mx + px) / 2, (a[1] * (1 - t) + b[1] * t + my + py) / 2); x.stroke(); }
    });
    // arm
    ribbon(x, qbez(root, [R * 0.7, -R * 1.2], wrist), tt => 6.5 - tt * 2, 14); x.fillStyle = fillM(root[0], root[1] - 10, wrist[0], wrist[1]); x.fill(); outline(x, 'rgba(20,10,0,.95)', 1);
    // finger bones
    for (const t of tips) {
      ribbon(x, qbez(wrist, [(wrist[0] + t[0]) / 2 - 1.5, (wrist[1] + t[1]) / 2 - 2], t), tt => 4.2 * (1 - tt) + 1, 16);
      x.fillStyle = fillM(wrist[0], wrist[1] - 20, t[0], t[1]); x.fill(); outline(x, 'rgba(20,10,0,.95)', 0.9);
      x.fillStyle = fillM(t[0] - 3, t[1] - 3, t[0] + 3, t[1] + 3); circle(x, t[0], t[1], 1.6); x.fill(); outline(x, 'rgba(20,10,0,.95)', 0.6);
    }
    // wrist claw + knuckle
    x.fillStyle = fillM(wrist[0] - 6, wrist[1] - 10, wrist[0] + 4, wrist[1]); x.beginPath(); x.moveTo(wrist[0] - 3.5, wrist[1] - 1); x.quadraticCurveTo(wrist[0] - 6, wrist[1] - 8, wrist[0] - 2, wrist[1] - 12); x.quadraticCurveTo(wrist[0] - 1, wrist[1] - 6, wrist[0] + 3, wrist[1] - 2); x.closePath(); x.fill(); outline(x, 'rgba(20,10,0,.95)', 0.8);
    x.fillStyle = rg(x, wrist[0] - 1, wrist[1] - 1, 0.3, 4.5, [[0, pal[0]], [0.5, pal[1]], [1, pal[3]]]); circle(x, wrist[0], wrist[1], 3.6); x.fill(); outline(x, 'rgba(20,10,0,.95)', 0.8);
    // --- tail curling under and around to the left
    const tail = bez([R * 0.78, R * 0.55], [R * 1.55, R * 1.35], [R * 0.3, R * 1.62], [-R * 0.55, R * 1.2]);
    ribbon(x, tail, tt => 9 * (1 - tt) + 2, 30); x.fillStyle = fillM(-R, R * 0.5, R * 1.5, R * 1.6, trim); x.fill(); outline(x, 'rgba(20,10,0,.95)', 1.1);
    x.strokeStyle = 'rgba(40,20,0,.5)'; x.lineWidth = 0.8;
    for (let i = 1; i < 9; i++) { const p = tail(i / 10), q = tail(i / 10 + 0.02); const a = Math.atan2(q[1] - p[1], q[0] - p[0]) + Math.PI / 2, ww = (9 * (1 - i / 10) + 2) / 2; x.beginPath(); x.moveTo(p[0] + Math.cos(a) * ww, p[1] + Math.sin(a) * ww); x.lineTo(p[0] - Math.cos(a) * ww, p[1] - Math.sin(a) * ww); x.stroke(); }
    const e = tail(1), e0 = tail(0.96), ang = Math.atan2(e[1] - e0[1], e[0] - e0[0]);
    x.save(); x.translate(e[0], e[1]); x.rotate(ang);
    x.beginPath(); x.moveTo(-2, -5.5); x.lineTo(9, 0); x.lineTo(-2, 5.5); x.quadraticCurveTo(1, 0, -2, -5.5); x.closePath();
    x.fillStyle = fillM(-2, -5, 9, 5, trim); x.fill(); outline(x, 'rgba(20,10,0,.95)', 0.9);
    x.restore();
    // --- crest spikes over the top of the ring
    for (let i = 0; i < 5; i++) {
      const a = -Math.PI * 0.78 + i * 0.25, len = (i === 2 ? 0.62 : i % 2 ? 0.46 : 0.36) * R;
      const bx = Math.cos(a) * R * 0.94, by = Math.sin(a) * R * 0.94, tx = Math.cos(a - 0.06) * (R + len), ty = Math.sin(a - 0.06) * (R + len);
      const nx = -Math.sin(a) * 5, ny = Math.cos(a) * 5;
      x.fillStyle = fillM(bx, by, tx, ty, trim); x.beginPath(); x.moveTo(bx + nx, by + ny); x.quadraticCurveTo((bx + tx) / 2 + nx * 0.2, (by + ty) / 2 + ny * 0.2, tx, ty); x.quadraticCurveTo((bx + tx) / 2 - nx * 0.5, (by + ty) / 2 - ny * 0.5, bx - nx, by - ny); x.closePath(); x.fill(); outline(x, 'rgba(20,10,0,.95)', 0.9);
    }
    // --- collar band around the ring (drawn as a thick arc on the right half)
    x.lineWidth = R * 0.2; x.strokeStyle = fillM(-R, -R, R, R, trim); x.beginPath(); x.arc(0, 0, R * 1.02, -Math.PI * 0.85, Math.PI * 0.35); x.stroke();
    x.lineWidth = 1; x.strokeStyle = 'rgba(20,10,0,.9)'; x.beginPath(); x.arc(0, 0, R * 1.12, -Math.PI * 0.85, Math.PI * 0.35); x.stroke(); x.beginPath(); x.arc(0, 0, R * 0.92, -Math.PI * 0.85, Math.PI * 0.35); x.stroke();
    if (kind === 'boss' || kind === 'rareelite') {
      const gy = -R * 1.05; P.gemShape(x, 0, gy, R * 0.16, kind === 'boss' ? '#ff2a20' : '#40a0ff', { glow: true });
    }
    x.restore();
    // punch out the portrait hole so the ornament never covers the face
    x.globalCompositeOperation = 'destination-out'; circle(x, cx, cy, R * 0.9); x.fill(); x.globalCompositeOperation = 'source-over';
    return { url: url(c), w, h, cx: mirror ? w - cx : cx, cy };
  });
}

// ------------------------------------------------------------------ heraldic wing
/**
 * Feathered wing: feathers attach along an arm curve (shoulder → tip) and hang toward `out` side.
 * rows: [{ n, len0, len1, w, cols:[hi, mid, lo] , off }] drawn back → front.
 */
function heraldicWing(x, arm, rows, side = -1) {
  for (const row of rows) {
    for (let i = row.n - 1; i >= 0; i--) {
      const t = (i + 0.5) / row.n * (row.span ?? 1) + (row.start ?? 0);
      const p = arm(t), q = arm(Math.min(1, t + 0.02)), p0 = arm(Math.max(0, t - 0.02));
      const ta = Math.atan2(q[1] - p0[1], q[0] - p0[0]);
      // feather direction: perpendicular to the arm (downward/outward), swinging toward the arm direction near the tip
      const perp = ta + side * Math.PI / 2;
      const dir = perp + (ta - perp) * Math.pow(t, 1.6) * (row.swing ?? 0.75);
      const len = row.len0 + (row.len1 - row.len0) * Math.pow(t, row.pow ?? 1.3);
      const wid = row.w * (0.85 + 0.3 * t);
      x.save(); x.translate(p[0] + Math.cos(perp) * (row.off || 0), p[1] + Math.sin(perp) * (row.off || 0)); x.rotate(dir);
      x.beginPath(); x.moveTo(0, -wid * 0.55); x.bezierCurveTo(len * 0.3, -wid * 0.75, len * 0.78, -wid * 0.6, len, 0);
      x.bezierCurveTo(len * 0.8, wid * 0.7, len * 0.3, wid * 0.8, 0, wid * 0.55); x.closePath();
      x.fillStyle = lg(x, 0, -wid, 0, wid, [[0, row.cols[0]], [0.45, row.cols[1]], [1, row.cols[2]]]); x.fill();
      outline(x, 'rgba(25,12,0,.95)', 0.85);
      x.strokeStyle = rgba(row.cols[0], 0.75); x.lineWidth = 0.6; x.beginPath(); x.moveTo(len * 0.05, -wid * 0.12); x.quadraticCurveTo(len * 0.5, -wid * 0.35, len * 0.94, -wid * 0.05); x.stroke();
      x.strokeStyle = 'rgba(40,20,0,.35)'; x.lineWidth = 0.5; for (let k = 1; k < 4; k++) { const fx = len * k / 4.2; x.beginPath(); x.moveTo(fx, -wid * 0.1); x.lineTo(fx + wid * 0.8, wid * 0.45); x.stroke(); }
      x.restore();
    }
  }
}

// ------------------------------------------------------------------ action-bar end caps
/** Winged dawn-sun crest on a stone plinth. side: 'left' | 'right'. Display size w×h. */
export function endCap(side = 'left', w = 132, h = 124) {
  return memo(`cap:${side}:${w}:${h}`, () => {
    const k = 2, [c, x] = cv(w * k, h * k); x.scale(k, k); P.setK(k);
    if (side === 'right') { x.translate(w, 0); x.scale(-1, 1); }
    const R = rng(side === 'left' ? 5 : 6);
    const g = METAL.gold, b = METAL.bronze;
    const gold = (x0, y0, x1, y1) => lg(x, x0, y0, x1, y1, [[0, b[3]], [0.22, g[1]], [0.42, g[0]], [0.6, g[2]], [0.85, b[3]], [1, b[4]]]);
    // disc centre (on the inner side, near the bar)
    const dx = w * 0.7, dy = h * 0.62, dr = h * 0.25;
    // --- wing: primaries (long) + coverts (short), sweeping up and outward (to the left)
    const layer = (n, len0, len1, a0, a1, wid, cols, ox, oy) => {
      for (let i = n - 1; i >= 0; i--) {
        const t = i / (n - 1), a = a0 + (a1 - a0) * t, len = len0 + (len1 - len0) * Math.sin(t * Math.PI * 0.85 + 0.15);
        x.save(); x.translate(ox, oy); x.rotate(a);
        x.beginPath(); x.moveTo(0, 0); x.bezierCurveTo(len * 0.25, -wid, len * 0.75, -wid * 1.05, len, -wid * 0.1); x.quadraticCurveTo(len * 0.96, wid * 0.4, len * 0.86, wid * 0.55); x.bezierCurveTo(len * 0.6, wid * 0.8, len * 0.25, wid * 0.7, 0, 0); x.closePath();
        x.fillStyle = lg(x, 0, -wid, 0, wid, [[0, cols[0]], [0.45, cols[1]], [1, cols[2]]]); x.fill(); outline(x, 'rgba(25,12,0,.95)', 0.9);
        x.strokeStyle = rgba(cols[0], 0.8); x.lineWidth = 0.7; x.beginPath(); x.moveTo(len * 0.06, -wid * 0.1); x.quadraticCurveTo(len * 0.5, -wid * 0.5, len * 0.92, -wid * 0.12); x.stroke();
        x.restore();
      }
    };
    void layer;
    const arm = qbez([dx - dr * 0.5, dy - dr * 0.62], [dx - dr * 0.7, dy - h * 0.66], [w * 0.28, h * 0.05]);
    heraldicWing(x, arm, [
      { n: 9, len0: h * 0.2, len1: h * 0.4, w: 7.5, cols: [g[1], mix(g[2], b[2], 0.3), b[4]], off: 1, swing: 0.9, start: 0.08, span: 0.92 },
      { n: 8, len0: h * 0.16, len1: h * 0.3, w: 7, cols: [g[0], g[1], b[3]], off: 0.5, swing: 0.8, start: 0.05, span: 0.8 },
      { n: 7, len0: h * 0.1, len1: h * 0.16, w: 6.5, cols: ['#fff6d0', g[1], b[2]], off: 0, swing: 0.6, start: 0.02, span: 0.72 },
    ], -1);
    // arm bone / leading edge
    ribbon(x, arm, t => 7 * (1 - t) + 3, 24); x.fillStyle = gold(dx - 30, dy - h * 0.6, dx, dy); x.fill(); outline(x, 'rgba(25,12,0,.95)', 1);
    x.strokeStyle = rgba(g[0], 0.8); x.lineWidth = 0.8; P.strokeCurve(x, t => { const p = arm(t); return [p[0] + 1, p[1] - 1.5]; }, 20); x.stroke();
    // --- plinth
    const px0 = w * 0.18, py0 = h * 0.78;
    x.fillStyle = lg(x, 0, py0, 0, h, [[0, '#4a4550'], [0.2, '#2e2b33'], [1, '#0e0d11']]);
    x.beginPath(); x.moveTo(px0, py0); x.lineTo(w - 1, py0); x.lineTo(w - 1, h - 1); x.lineTo(px0 - 10, h - 1); x.closePath(); x.fill(); outline(x, 'rgba(0,0,0,.95)', 1.2);
    x.fillStyle = gold(0, py0 - 3, 0, py0 + 4); x.fillRect(px0 - 2, py0 - 3, w - px0 + 2, 5.5); x.strokeStyle = 'rgba(0,0,0,.9)'; x.lineWidth = 1; x.strokeRect(px0 - 2, py0 - 3, w - px0 + 2, 5.5);
    x.strokeStyle = 'rgba(255,255,255,.08)'; x.lineWidth = 1; for (let i = 0; i < 4; i++) { const yy = py0 + 9 + i * 5.5; x.beginPath(); x.moveTo(px0 - 4 - i * 1.5, yy); x.lineTo(w - 2, yy); x.stroke(); }
    // --- sun rays behind the disc
    for (let i = 0; i < 11; i++) {
      const a = Math.PI + (i + 0.5) / 11 * Math.PI, l = dr * (i % 2 ? 1.45 : 1.75);
      x.fillStyle = gold(dx + Math.cos(a) * dr, dy + Math.sin(a) * dr, dx + Math.cos(a) * l, dy + Math.sin(a) * l);
      poly(x, [[dx + Math.cos(a - 0.12) * dr * 0.9, dy + Math.sin(a - 0.12) * dr * 0.9], [dx + Math.cos(a) * l, dy + Math.sin(a) * l], [dx + Math.cos(a + 0.12) * dr * 0.9, dy + Math.sin(a + 0.12) * dr * 0.9]]); x.fill(); outline(x, 'rgba(25,12,0,.9)', 0.8);
    }
    // --- disc
    x.fillStyle = rg(x, dx - dr * 0.35, dy - dr * 0.4, dr * 0.1, dr * 1.1, [[0, g[0]], [0.35, g[1]], [0.75, b[2]], [1, b[4]]]); circle(x, dx, dy, dr); x.fill(); outline(x, 'rgba(20,10,0,.95)', 1.4);
    x.strokeStyle = 'rgba(60,30,0,.7)'; x.lineWidth = 1.4; circle(x, dx, dy, dr * 0.78); x.stroke();
    x.strokeStyle = rgba(g[0], 0.7); x.lineWidth = 1; x.beginPath(); x.arc(dx, dy, dr * 0.9, Math.PI * 1.05, Math.PI * 1.55); x.stroke();
    for (let i = 0; i < 12; i++) { const a = i / 12 * TAU; x.fillStyle = 'rgba(70,35,0,.55)'; circle(x, dx + Math.cos(a) * dr * 0.89, dy + Math.sin(a) * dr * 0.89, 1); x.fill(); }
    // --- inner: half-rising sun emblem with a gem
    x.save(); x.beginPath(); x.arc(dx, dy, dr * 0.74, 0, TAU); x.clip();
    x.fillStyle = rg(x, dx, dy, 0, dr * 0.74, [[0, '#3a1c08'], [1, '#150802']]); x.fillRect(dx - dr, dy - dr, dr * 2, dr * 2);
    x.fillStyle = gold(dx - dr, dy - dr, dx + dr, dy + dr);
    for (let i = 0; i < 7; i++) { const a = Math.PI + (i + 0.5) / 7 * Math.PI; poly(x, [[dx + Math.cos(a - 0.16) * dr * 0.26, dy + dr * 0.18 + Math.sin(a - 0.16) * dr * 0.26], [dx + Math.cos(a) * dr * 0.66, dy + dr * 0.18 + Math.sin(a) * dr * 0.66], [dx + Math.cos(a + 0.16) * dr * 0.26, dy + dr * 0.18 + Math.sin(a + 0.16) * dr * 0.26]]); x.fill(); }
    x.fillRect(dx - dr, dy + dr * 0.18, dr * 2, dr * 0.1);
    x.restore();
    P.gemShape(x, dx, dy + dr * 0.08, dr * 0.2, '#ff5a1a', { glow: true, n: 8 });
    void R;
    return url(c);
  });
}

// ------------------------------------------------------------------ coins
export function coinURL(type = 'gold') {
  return memo('coin:' + type, () => {
    const S = 28, [c, x] = cv(S, S);
    const pal = { gold: ['#fff6c0', '#ffd24a', '#b07a10', '#4a2a02'], silver: ['#ffffff', '#dfe6ee', '#8a96a6', '#3a404a'], copper: ['#ffd8b0', '#e0864a', '#8a3e12', '#3a1402'] }[type];
    x.fillStyle = rg(x, S * 0.38, S * 0.36, 1, S * 0.55, [[0, pal[0]], [0.35, pal[1]], [0.8, pal[2]], [1, pal[3]]]); circle(x, S / 2, S / 2, S / 2 - 2); x.fill();
    x.strokeStyle = 'rgba(0,0,0,.85)'; x.lineWidth = 1.6; x.stroke();
    x.strokeStyle = rgba(pal[3], 0.6); x.lineWidth = 1.2; circle(x, S / 2, S / 2, S / 2 - 6); x.stroke();
    x.fillStyle = 'rgba(255,255,255,.75)'; x.beginPath(); x.ellipse(S * 0.38, S * 0.34, 3, 1.8, -0.6, 0, TAU); x.fill();
    return url(c);
  });
}

// ------------------------------------------------------------------ quest marks
/** kind: 'available' (gold !), 'complete' (gold ?), 'incomplete' (grey ?), 'daily' (blue !), 'low' (grey !) */
export function questMarkURL(kind = 'available') {
  return memo('qm:' + kind, () => {
    const W = 44, H = 72, [c, x] = cv(W, H); P.setK(1);
    const ex = kind === 'available' || kind === 'daily' || kind === 'low';
    const cols = kind === 'daily' ? ['#e8f6ff', '#5ab4ff', '#1a5aa8', '#0a2448'] : (kind === 'incomplete' || kind === 'low') ? ['#ffffff', '#c8c8c8', '#6a6a6a', '#2a2a2a'] : ['#fffbe0', '#ffd83a', '#d08a08', '#5a3002'];
    const shape = () => {
      x.beginPath();
      if (ex) {
        x.moveTo(W / 2 - 9, 6); x.lineTo(W / 2 + 9, 6); x.lineTo(W / 2 + 5, 46); x.lineTo(W / 2 - 5, 46); x.closePath();
        x.moveTo(W / 2 + 7.5, 58); x.arc(W / 2, 58, 7.5, 0, TAU);
      } else {
        x.moveTo(W / 2 + 7.5, 60); x.arc(W / 2, 60, 7.5, 0, TAU);
      }
    };
    const hook = () => { x.beginPath(); x.moveTo(8, 20); x.bezierCurveTo(8, 3, 36, 2, 36, 18); x.bezierCurveTo(36, 30, 22, 30, 22, 44); };
    x.shadowBlur = 6; x.shadowColor = rgba(cols[1], 0.9);
    if (!ex) { hook(); x.strokeStyle = cols[3]; x.lineWidth = 14; x.stroke(); }
    shape(); x.fillStyle = cols[3]; x.fill(); x.shadowBlur = 0;
    x.lineWidth = 4; x.strokeStyle = 'rgba(0,0,0,.95)'; shape(); x.stroke();
    if (!ex) { hook(); x.strokeStyle = '#000'; x.lineWidth = 15; x.stroke(); hook(); x.strokeStyle = lg(x, 0, 0, W, H * 0.6, [[0, cols[0]], [0.4, cols[1]], [1, cols[2]]]); x.lineWidth = 9; x.stroke(); }
    shape(); x.fillStyle = lg(x, 0, 0, W, H, [[0, cols[0]], [0.35, cols[1]], [0.8, cols[2]], [1, cols[3]]]); x.fill();
    x.strokeStyle = 'rgba(255,255,255,.7)'; x.lineWidth = 1.6;
    if (ex) { x.beginPath(); x.moveTo(W / 2 - 6, 9); x.lineTo(W / 2 - 3, 42); x.stroke(); } else { x.beginPath(); x.moveTo(11, 18); x.bezierCurveTo(11, 8, 22, 6, 28, 8); x.stroke(); }
    return url(c);
  });
}

// ------------------------------------------------------------------ raid target markers
export const MARKERS = ['star', 'circle', 'diamond', 'triangle', 'moon', 'square', 'cross', 'skull'];
export function markerURL(type) {
  return memo('mk:' + type, () => {
    const S = 64, [c, x] = cv(S, S), m = S / 2; P.setK(0.64);
    const shaded = (cols) => rg(x, m - 8, m - 10, 2, 30, [[0, cols[0]], [0.4, cols[1]], [1, cols[2]]]);
    const fin = () => { outline(x, 'rgba(0,0,0,.95)', 3); };
    x.shadowBlur = 4; x.shadowColor = 'rgba(0,0,0,.8)';
    switch (type) {
      case 'star': { x.beginPath(); for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i / 10 * TAU, r = i % 2 ? 11 : 27; i ? x.lineTo(m + Math.cos(a) * r, m + 2 + Math.sin(a) * r) : x.moveTo(m + Math.cos(a) * r, m + 2 + Math.sin(a) * r); } x.closePath(); x.fillStyle = shaded(['#ffffd0', '#ffe020', '#b08800']); x.fill(); fin(); break; }
      case 'circle': { circle(x, m, m, 24); x.fillStyle = shaded(['#ffe0a0', '#ff8a10', '#9a3a00']); x.fill(); fin(); break; }
      case 'diamond': { poly(x, [[m, 4], [m + 22, m], [m, S - 4], [m - 22, m]]); x.fillStyle = shaded(['#ffc8ff', '#c040ff', '#5a0a8a']); x.fill(); fin(); break; }
      case 'triangle': { poly(x, [[m, 6], [S - 5, S - 9], [5, S - 9]]); x.fillStyle = shaded(['#d0ffc0', '#30d020', '#0a6a04']); x.fill(); fin(); break; }
      case 'moon': { x.beginPath(); x.arc(m, m, 25, 0, TAU); x.arc(m + 13, m - 9, 20, 0, TAU, true); x.fillStyle = shaded(['#ffffff', '#c8d8f0', '#6a7a98']); x.fill('evenodd'); x.beginPath(); x.arc(m, m, 25, 0.1, 4.2); x.strokeStyle = 'rgba(0,0,0,.9)'; x.lineWidth = 3; x.stroke(); break; }
      case 'square': { x.beginPath(); x.roundRect(9, 9, S - 18, S - 18, 3); x.fillStyle = shaded(['#c8e8ff', '#1a8aff', '#04307a']); x.fill(); fin(); break; }
      case 'cross': {
        x.save(); x.translate(m, m); x.rotate(Math.PI / 4);
        x.beginPath(); x.roundRect(-7, -27, 14, 54, 3); x.roundRect(-27, -7, 54, 14, 3);
        x.fillStyle = rg(x, -6, -8, 2, 30, [[0, '#ffb0a0'], [0.4, '#ff2a10'], [1, '#7a0400']]); x.fill('nonzero'); x.restore();
        x.save(); x.translate(m, m); x.rotate(Math.PI / 4); x.beginPath(); x.moveTo(-7, -27); x.lineTo(7, -27); x.lineTo(7, -7); x.lineTo(27, -7); x.lineTo(27, 7); x.lineTo(7, 7); x.lineTo(7, 27); x.lineTo(-7, 27); x.lineTo(-7, 7); x.lineTo(-27, 7); x.lineTo(-27, -7); x.lineTo(-7, -7); x.closePath(); outline(x, 'rgba(0,0,0,.95)', 3); x.restore();
        break;
      }
      case 'skull': { x.shadowBlur = 0; P.skull(x, m, m + 2, 1.1, { bone: ['#ffffff', '#e8e8e8', '#9a9a9a', '#3a3a3a'] }); break; }
    }
    x.shadowBlur = 0;
    if (type !== 'skull' && type !== 'moon') { x.fillStyle = 'rgba(255,255,255,.55)'; x.beginPath(); x.ellipse(m - 7, m - 9, 6, 3.5, -0.6, 0, TAU); x.fill(); }
    return url(c);
  });
}

// ------------------------------------------------------------------ role icons
export function roleURL(role) {
  return memo('role:' + role, () => {
    const S = 40, [c, x] = cv(S, S), m = S / 2; P.setK(0.4);
    x.fillStyle = rg(x, m - 4, m - 5, 1, 21, [[0, '#4a4a52'], [1, '#101014']]); circle(x, m, m, 18.5); x.fill();
    x.strokeStyle = metalLG(x, 0, 0, S, S, 'gold'); x.lineWidth = 2.6; circle(x, m, m, 17.5); x.stroke(); outline(x, 'rgba(0,0,0,.9)', 1);
    if (role === 'tank') {
      x.beginPath(); x.moveTo(m - 10, 9); x.quadraticCurveTo(m, 7, m + 10, 9); x.bezierCurveTo(m + 11, 21, m + 6, 28, m, 32); x.bezierCurveTo(m - 6, 28, m - 11, 21, m - 10, 9); x.closePath();
      x.fillStyle = rg(x, m - 3, 14, 1, 20, [[0, '#a8d0ff'], [0.5, '#2a6ae0'], [1, '#0a2060']]); x.fill(); outline(x, 'rgba(0,0,0,.9)', 1.4);
      x.strokeStyle = 'rgba(255,255,255,.7)'; x.lineWidth = 1.2; x.beginPath(); x.moveTo(m, 10); x.lineTo(m, 29); x.stroke();
    } else if (role === 'healer') {
      x.beginPath(); const a = 4.4, b = 12; x.moveTo(m - a, m - b); x.lineTo(m + a, m - b); x.lineTo(m + a, m - a); x.lineTo(m + b, m - a); x.lineTo(m + b, m + a); x.lineTo(m + a, m + a); x.lineTo(m + a, m + b); x.lineTo(m - a, m + b); x.lineTo(m - a, m + a); x.lineTo(m - b, m + a); x.lineTo(m - b, m - a); x.lineTo(m - a, m - a); x.closePath();
      x.fillStyle = rg(x, m - 3, m - 4, 1, 16, [[0, '#d8ffd0'], [0.45, '#2ad030'], [1, '#0a6010']]); x.fill(); outline(x, 'rgba(0,0,0,.9)', 1.4);
    } else {
      x.save(); x.translate(m - 8, m + 9); x.rotate(Math.PI / 4); P.sword(x, { len: 22, w: 5.5, tip: 6, grip: 5, guard: 11, metal: 'steel', guardMetal: 'gold' }); x.restore();
      x.fillStyle = 'rgba(255,60,40,.0)';
    }
    return url(c);
  });
}

// ------------------------------------------------------------------ small glyphs
/**
 * name: crown | rested | combat | skull | mail | track | close | dice | gear | lock | arrowL | arrowR | plus | minus |
 *       ready | notready | waiting | need | greed | pass | shield | male | female | star | cog
 */
export function glyphURL(name, S = 40) {
  return memo('g:' + name + S, () => {
    const [c, x] = cv(S, S); x.scale(S / 40, S / 40); P.setK(S / 40);
    const gold = (a, b, cc, d) => metalLG(x, a, b, cc, d, 'gold');
    const OL = (w = 1.6) => outline(x, 'rgba(0,0,0,.95)', w);
    switch (name) {
      case 'crown': {
        x.beginPath(); x.moveTo(6, 30); x.lineTo(4, 12); x.lineTo(13, 20); x.lineTo(20, 7); x.lineTo(27, 20); x.lineTo(36, 12); x.lineTo(34, 30); x.closePath();
        x.fillStyle = gold(4, 6, 36, 32); x.fill(); OL();
        x.fillStyle = gold(6, 30, 34, 35); x.fillRect(6, 29, 28, 5); x.strokeStyle = '#000'; x.lineWidth = 1.2; x.strokeRect(6, 29, 28, 5);
        for (const [px, py, col] of [[20, 22, '#ff3030'], [11, 25, '#3080ff'], [29, 25, '#30ff60']]) { x.fillStyle = col; circle(x, px, py, 2.2); x.fill(); }
        break;
      }
      case 'rested': {
        x.font = '900 20px Georgia, serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
        for (const [t, px, py, s] of [['Z', 14, 26, 1], ['z', 26, 14, 0.75]]) { x.save(); x.translate(px, py); x.scale(s, s); x.lineWidth = 4; x.strokeStyle = '#000'; x.strokeText(t, 0, 0); x.fillStyle = lg(x, 0, -10, 0, 10, [[0, '#e8f4ff'], [1, '#5aa0ff']]); x.fillText(t, 0, 0); x.restore(); }
        break;
      }
      case 'combat': {
        for (const s of [-1, 1]) { x.save(); x.translate(20 + s * 9, 31); x.rotate(-s * Math.PI / 4); P.sword(x, { len: 24, w: 5, tip: 6, grip: 5, guard: 11, metal: 'steel', guardMetal: 'gold' }); x.restore(); }
        break;
      }
      case 'skull': { P.skull(x, 20, 21, 0.7, { bone: ['#ffffff', '#f0e8d8', '#a09080', '#3a3024'] }); break; }
      case 'mail': {
        x.fillStyle = lg(x, 0, 10, 0, 32, [[0, '#fffaf0'], [1, '#c8b890']]); x.beginPath(); x.roundRect(5, 10, 30, 21, 2); x.fill(); OL(1.4);
        x.strokeStyle = 'rgba(80,60,30,.8)'; x.lineWidth = 1.4; x.beginPath(); x.moveTo(6, 11); x.lineTo(20, 22); x.lineTo(34, 11); x.stroke();
        x.fillStyle = '#c01818'; circle(x, 20, 22, 3.4); x.fill(); OL(1);
        break;
      }
      case 'track': {
        x.lineWidth = 3.6; x.strokeStyle = gold(0, 0, 40, 40); circle(x, 17, 17, 9); x.stroke(); OL(1);
        x.fillStyle = 'rgba(160,220,255,.35)'; circle(x, 17, 17, 7.2); x.fill();
        x.save(); x.translate(24, 24); x.rotate(Math.PI / 4); x.fillStyle = lg(x, -3, 0, 3, 0, [[0, '#3a2210'], [0.5, '#9a6a3a'], [1, '#2a1406']]); x.beginPath(); x.roundRect(0, -2.6, 13, 5.2, 2); x.fill(); OL(1); x.restore();
        break;
      }
      case 'close': {
        x.fillStyle = rg(x, 17, 15, 1, 18, [[0, '#ff6a50'], [0.5, '#b01008'], [1, '#4a0402']]); circle(x, 20, 20, 16); x.fill();
        x.lineWidth = 3; x.strokeStyle = gold(0, 0, 40, 40); circle(x, 20, 20, 16.5); x.stroke(); OL(1);
        x.strokeStyle = '#000'; x.lineWidth = 6; x.beginPath(); x.moveTo(13.5, 13.5); x.lineTo(26.5, 26.5); x.moveTo(26.5, 13.5); x.lineTo(13.5, 26.5); x.stroke();
        x.strokeStyle = '#ffe8c0'; x.lineWidth = 3.4; x.stroke();
        break;
      }
      case 'dice': {
        x.fillStyle = lg(x, 6, 6, 34, 34, [[0, '#ffffff'], [0.6, '#e8e0d0'], [1, '#9a9080']]); x.beginPath(); x.roundRect(6, 6, 28, 28, 6); x.fill(); OL(1.8);
        x.fillStyle = '#b01010'; for (const [px, py] of [[13, 13], [27, 13], [20, 20], [13, 27], [27, 27]]) { circle(x, px, py, 2.8); x.fill(); }
        break;
      }
      case 'gear': case 'cog': {
        x.beginPath(); for (let i = 0; i < 16; i++) { const a = i / 16 * TAU, r = i % 2 ? 12 : 16; i ? x.lineTo(20 + Math.cos(a) * r, 20 + Math.sin(a) * r) : x.moveTo(20 + Math.cos(a) * r, 20 + Math.sin(a) * r); } x.closePath();
        x.fillStyle = gold(4, 4, 36, 36); x.fill(); OL(1.4); x.fillStyle = '#1a1208'; circle(x, 20, 20, 5.5); x.fill(); OL(1);
        break;
      }
      case 'lock': {
        x.lineWidth = 4; x.strokeStyle = metalLG(x, 0, 0, 40, 0, 'steel'); x.beginPath(); x.arc(20, 17, 8, Math.PI, 0); x.lineTo(28, 20); x.moveTo(12, 20); x.lineTo(12, 17); x.stroke();
        x.fillStyle = gold(8, 18, 32, 36); x.beginPath(); x.roundRect(8, 18, 24, 17, 3); x.fill(); OL(1.4);
        x.fillStyle = '#1a1208'; circle(x, 20, 25, 2.6); x.fill(); x.fillRect(19, 25, 2, 6);
        break;
      }
      case 'arrowL': case 'arrowR': {
        x.save(); if (name === 'arrowR') { x.translate(40, 0); x.scale(-1, 1); }
        x.fillStyle = rg(x, 18, 16, 1, 20, [[0, '#ffe8a0'], [0.4, '#e8a820'], [1, '#6a3a04']]); poly(x, [[8, 20], [28, 6], [28, 34]]); x.fill(); OL(2);
        x.strokeStyle = 'rgba(255,255,255,.6)'; x.lineWidth = 1.2; x.beginPath(); x.moveTo(12, 19); x.lineTo(26, 9); x.stroke();
        x.restore(); break;
      }
      case 'plus': case 'minus': {
        x.fillStyle = rg(x, 17, 15, 1, 18, [[0, '#5a5048'], [1, '#141008']]); circle(x, 20, 20, 15); x.fill();
        x.lineWidth = 3; x.strokeStyle = gold(0, 0, 40, 40); circle(x, 20, 20, 15.5); x.stroke(); OL(1);
        x.strokeStyle = '#000'; x.lineWidth = 6; x.beginPath(); x.moveTo(12, 20); x.lineTo(28, 20); if (name === 'plus') { x.moveTo(20, 12); x.lineTo(20, 28); } x.stroke();
        x.strokeStyle = '#ffe8a0'; x.lineWidth = 3; x.stroke();
        break;
      }
      case 'ready': { x.strokeStyle = '#000'; x.lineWidth = 9; x.beginPath(); x.moveTo(7, 21); x.lineTo(16, 30); x.lineTo(33, 9); x.stroke(); x.strokeStyle = lg(x, 0, 8, 0, 32, [[0, '#c8ff90'], [1, '#1aa010']]); x.lineWidth = 5; x.stroke(); break; }
      case 'notready': case 'pass': { x.strokeStyle = '#000'; x.lineWidth = 9; x.beginPath(); x.moveTo(9, 9); x.lineTo(31, 31); x.moveTo(31, 9); x.lineTo(9, 31); x.stroke(); x.strokeStyle = lg(x, 0, 8, 0, 32, [[0, '#ff9a80'], [1, '#b01008']]); x.lineWidth = 5; x.stroke(); break; }
      case 'waiting': { x.font = '900 32px Georgia, serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.lineWidth = 5; x.strokeStyle = '#000'; x.strokeText('?', 20, 22); x.fillStyle = lg(x, 0, 6, 0, 34, [[0, '#fff4c0'], [1, '#e0a010']]); x.fillText('?', 20, 22); break; }
      case 'need': {
        x.save(); x.translate(20, 20); x.rotate(-0.25);
        x.fillStyle = lg(x, -13, -13, 13, 13, [[0, '#ffffff'], [0.6, '#f0e8d8'], [1, '#a09080']]); x.beginPath(); x.roundRect(-13, -13, 26, 26, 5); x.fill(); OL(1.8);
        x.fillStyle = '#c01010'; for (const [px, py] of [[-6, -6], [6, 6], [0, 0], [6, -6], [-6, 6]]) { circle(x, px, py, 2.6); x.fill(); }
        x.restore(); break;
      }
      case 'greed': {
        x.fillStyle = rg(x, 16, 14, 1, 20, [[0, '#fffbe0'], [0.35, '#ffd24a'], [0.8, '#b07a10'], [1, '#4a2a02']]); circle(x, 20, 20, 15); x.fill(); OL(1.8);
        x.strokeStyle = 'rgba(90,50,0,.7)'; x.lineWidth = 1.4; circle(x, 20, 20, 10.5); x.stroke();
        x.font = '900 14px Georgia, serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillStyle = 'rgba(110,60,0,.85)'; x.fillText('G', 20, 21);
        break;
      }
      case 'shield': {
        x.beginPath(); x.moveTo(8, 7); x.quadraticCurveTo(20, 4, 32, 7); x.bezierCurveTo(33, 22, 28, 30, 20, 35); x.bezierCurveTo(12, 30, 7, 22, 8, 7); x.closePath();
        x.fillStyle = metalLG(x, 6, 4, 34, 36, 'silver'); x.fill(); OL(1.8);
        x.strokeStyle = 'rgba(0,0,0,.4)'; x.lineWidth = 1.2; x.beginPath(); x.moveTo(20, 7); x.lineTo(20, 32); x.stroke();
        break;
      }
      case 'male': case 'female': {
        x.lineWidth = 7; x.strokeStyle = '#000';
        const draw = () => {
          x.beginPath(); x.arc(name === 'male' ? 17 : 20, name === 'male' ? 23 : 15, 9, 0, TAU);
          if (name === 'male') { x.moveTo(23.5, 16.5); x.lineTo(33, 7); x.moveTo(25, 7); x.lineTo(33, 7); x.lineTo(33, 15); }
          else { x.moveTo(20, 24); x.lineTo(20, 36); x.moveTo(14, 31); x.lineTo(26, 31); }
          x.stroke();
        };
        draw(); x.lineWidth = 3.6; x.strokeStyle = gold(4, 4, 36, 36); draw();
        break;
      }
      case 'star': { x.beginPath(); for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i / 10 * TAU, r = i % 2 ? 7 : 17; i ? x.lineTo(20 + Math.cos(a) * r, 21 + Math.sin(a) * r) : x.moveTo(20 + Math.cos(a) * r, 21 + Math.sin(a) * r); } x.closePath(); x.fillStyle = gold(4, 4, 36, 36); x.fill(); OL(1.6); break; }
    }
    return url(c);
  });
}

// ------------------------------------------------------------------ achievement shield
export function achievementShieldURL(points = 10) {
  return memo('ach:' + points, () => {
    const W = 128, H = 140, [c, x] = cv(W, H); P.setK(1.28);
    x.save(); x.translate(W / 2, 8);
    x.beginPath(); x.moveTo(-50, 6); x.quadraticCurveTo(0, -8, 50, 6); x.bezierCurveTo(54, 64, 30, 104, 0, 126); x.bezierCurveTo(-30, 104, -54, 64, -50, 6); x.closePath();
    x.fillStyle = metalLG(x, -50, 0, 50, 120, 'gold'); x.fill(); outline(x, 'rgba(20,10,0,.95)', 2.5);
    x.beginPath(); x.moveTo(-38, 16); x.quadraticCurveTo(0, 6, 38, 16); x.bezierCurveTo(40, 62, 22, 92, 0, 110); x.bezierCurveTo(-22, 92, -40, 62, -38, 16); x.closePath();
    x.fillStyle = rg(x, -10, 40, 4, 80, [[0, '#6a3a10'], [1, '#1a0a02']]); x.fill(); outline(x, 'rgba(255,230,160,.6)', 1.5);
    x.font = '900 40px Cinzel, Georgia, serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
    x.lineWidth = 5; x.strokeStyle = '#000'; x.strokeText(String(points), 0, 56);
    x.fillStyle = lg(x, 0, 36, 0, 76, [[0, '#fffbe0'], [0.5, '#ffd24a'], [1, '#b07a10']]); x.fillText(String(points), 0, 56);
    x.restore();
    sparkle(x, 34, 22, 9);
    return url(c);
  });
}

// ------------------------------------------------------------------ install textures as CSS variables
/** Sets --evd-* custom properties (textures, frames) on the given element. Cheap after the first call. */
export function installArt(el) {
  const fb = frameBorder('bronze'), ft = frameBorder('thin');
  const vars = {
    '--evd-leather': `url("${leatherTex()}")`,
    '--evd-frame': `url("${fb.url}")`, '--evd-frame-slice': fb.slice,
    '--evd-frame-thin': `url("${ft.url}")`, '--evd-frame-thin-slice': ft.slice,
    '--evd-coin-g': `url("${coinURL('gold')}")`, '--evd-coin-s': `url("${coinURL('silver')}")`, '--evd-coin-c': `url("${coinURL('copper')}")`,
    '--evd-close': `url("${glyphURL('close')}")`,
  };
  for (const k in vars) el.style.setProperty(k, vars[k]);
}
/** Textures not needed for the first HUD frame (stone, parchment, heavy/silver frames). Call when idle. */
export function installArtLate(el) {
  if (el._lateArt) return; el._lateArt = true;
  const fh = frameBorder('heavy'), fs = frameBorder('silver');
  const vars = {
    '--evd-stone': `url("${stoneTex()}")`, '--evd-parchment': `url("${parchmentTex()}")`,
    '--evd-frame-heavy': `url("${fh.url}")`, '--evd-frame-heavy-slice': fh.slice, '--evd-frame-silver': `url("${fs.url}")`,
  };
  for (const k in vars) el.style.setProperty(k, vars[k]);
}

// ------------------------------------------------------------------ logo crest (login / results)
/** Winged rising sun behind the EVERDAWN logo. Display size w×h. */
export function logoCrest(w = 1000, h = 340) {
  return memo(`crest:${w}:${h}`, () => {
    const k = 2, [c, x] = cv(w * k, h * k); x.scale(k, k); P.setK(k);
    const g = METAL.gold, b = METAL.bronze, cx = w / 2, cy = h * 0.8, r = h * 0.3;
    // rays
    x.save(); x.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 29; i++) {
      const a = Math.PI + (i + 0.5) / 29 * Math.PI, l = r * (i % 2 ? 1.9 : 2.6);
      const gr = lg(x, cx, cy, cx + Math.cos(a) * l, cy + Math.sin(a) * l, [[0, 'rgba(255,220,140,.5)'], [1, 'rgba(255,200,100,0)']]);
      x.fillStyle = gr; poly(x, [[cx + Math.cos(a - 0.035) * r, cy + Math.sin(a - 0.035) * r], [cx + Math.cos(a) * l, cy + Math.sin(a) * l], [cx + Math.cos(a + 0.035) * r, cy + Math.sin(a + 0.035) * r]]); x.fill();
    }
    x.restore();
    const gl = rg(x, cx, cy, 0, r * 2.4, [[0, 'rgba(255,200,110,.55)'], [0.4, 'rgba(255,150,60,.18)'], [1, 'rgba(255,120,40,0)']]); x.fillStyle = gl; x.fillRect(0, 0, w, h);
    // wings
    const gold = (x0, y0, x1, y1) => lg(x, x0, y0, x1, y1, [[0, b[3]], [0.22, g[1]], [0.42, g[0]], [0.6, g[2]], [0.85, b[3]], [1, b[4]]]);
    for (const side of [-1, 1]) {
      x.save();
      if (side === 1) { x.translate(w, 0); x.scale(-1, 1); }
      const arm = qbez([cx - r * 0.55, cy - r * 0.35], [cx - r * 1.2, cy - h * 0.72], [w * 0.05, h * 0.1]);
      heraldicWing(x, arm, [
        { n: 13, len0: h * 0.2, len1: h * 0.5, w: 11, cols: [g[1], mix(g[2], b[2], 0.3), b[4]], off: 1, swing: 0.9, start: 0.06, span: 0.94 },
        { n: 11, len0: h * 0.14, len1: h * 0.3, w: 10, cols: [g[0], g[1], b[3]], off: 0.5, swing: 0.8, start: 0.04, span: 0.82 },
        { n: 9, len0: h * 0.08, len1: h * 0.15, w: 9, cols: ['#fff6d0', g[1], b[2]], off: 0, swing: 0.6, start: 0.02, span: 0.74 },
      ], -1);
      ribbon(x, arm, t => 10 * (1 - t) + 4, 30); x.fillStyle = gold(cx - r, cy - h * 0.7, cx, cy); x.fill(); outline(x, 'rgba(25,12,0,.95)', 1.2);
      x.restore();
    }
    // sun disc (upper half visible)
    x.save(); x.beginPath(); x.rect(0, 0, w, cy + 2); x.clip();
    x.fillStyle = rg(x, cx - r * 0.3, cy - r * 0.5, r * 0.1, r * 1.1, [[0, '#fffbe0'], [0.3, g[1]], [0.75, g[2]], [1, b[3]]]); circle(x, cx, cy, r); x.fill(); outline(x, 'rgba(20,10,0,.95)', 2);
    x.strokeStyle = 'rgba(80,40,0,.6)'; x.lineWidth = 2; circle(x, cx, cy, r * 0.82); x.stroke();
    x.restore();
    return url(c);
  });
}

// ------------------------------------------------------------------ small elite glyph (nameplates)
/** Gold (elite/boss) or silver (rare) dragon-wing glyph, 60×52 image for ~30×26 display. */
export function eliteGlyph(kind = 'elite') {
  return memo('eg:' + kind, () => {
    const W = 60, H = 52, [c, x] = cv(W, H); P.setK(0.5);
    const silver = kind === 'rare' || kind === 'rareelite';
    const pal = silver ? METAL.silver : METAL.gold;
    const fillM = (x0, y0, x1, y1) => lg(x, x0, y0, x1, y1, [[0, pal[3]], [0.25, pal[1]], [0.45, pal[0]], [0.65, pal[2]], [1, pal[4]]]);
    const wrist = [18, 30], tips = [[16, 4], [34, 3], [50, 12], [57, 28]], root = [8, 44];
    const panels = [[tips[0], tips[1]], [tips[1], tips[2]], [tips[2], tips[3]], [tips[3], [30, 44]]];
    panels.forEach(([a, b], i) => {
      x.beginPath(); x.moveTo(wrist[0], wrist[1]); x.lineTo(a[0], a[1]);
      const mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2;
      x.quadraticCurveTo(mx + (wrist[0] - mx) * 0.35, my + (wrist[1] - my) * 0.35, b[0], b[1]); x.closePath();
      x.fillStyle = lg(x, wrist[0], wrist[1], mx, my, [[0, pal[3]], [1, i % 2 ? pal[1] : pal[0]]]); x.fill(); outline(x, 'rgba(20,10,0,.95)', 1.6);
    });
    for (const t of tips) { ribbon(x, qbez(wrist, [(wrist[0] + t[0]) / 2, (wrist[1] + t[1]) / 2 - 1], t), tt => 4.4 * (1 - tt) + 1.2, 12); x.fillStyle = fillM(wrist[0], wrist[1] - 20, t[0], t[1]); x.fill(); outline(x, 'rgba(20,10,0,.95)', 1.2); }
    ribbon(x, qbez(root, [6, 34], wrist), tt => 7 - tt * 2, 10); x.fillStyle = fillM(0, 30, 20, 50); x.fill(); outline(x, 'rgba(20,10,0,.95)', 1.4);
    if (kind === 'boss' || kind === 'rareelite') { x.fillStyle = kind === 'boss' ? '#ff3a20' : '#ffd24a'; circle(x, wrist[0], wrist[1], 3.4); x.fill(); outline(x, 'rgba(0,0,0,.9)', 1); }
    return url(c);
  });
}
