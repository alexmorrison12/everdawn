// Oversized WoW-style weapons (rigid meshes). Local space: grip centre at origin, business end along +Y,
// blade flat faces +/-Z. Geometry is cached per spec and shared between characters.
import * as THREE from 'three';
import { PB, tubeGeo, emblemGeo, topLit } from './pieces.js';
import { assemble } from './assemble.js';
import { SLOT, NSLOT, DET } from './palette.js';
import { linColor } from '../../engine/geom.js';
import { Simplex } from '../../core/noise.js';

const NZ = new Simplex(7);
const CACHE = new Map();
const FAKE_BASE = { master: null };

const TIER_METAL = [0x8a9098, 0x9aa4ae, 0xa8b4c2, 0xb4c0d0];
const TIER_TRIM = [0x8a6a40, 0xb08a48, 0xd8a848, 0xffd060];

function weaponPalette(sp, colors = {}) {
  const pal = [];
  const m = (hex, spec, det, emis = 0) => ({ c: linColor(hex), spec, det, emis, cast: 0 });
  for (let i = 0; i < NSLOT; i++) pal.push(m(0x808080, 0, DET.none));
  const t = sp.tier ?? 1;
  pal[SLOT.BLADE] = m(colors.blade ?? TIER_METAL[t], 0.65, DET.plate);
  pal[SLOT.METAL] = m(colors.metal ?? 0x6a7078, 0.9, DET.plate);
  pal[SLOT.TRIM] = m(colors.trim ?? TIER_TRIM[t], 1.0, DET.plate);
  pal[SLOT.HILT] = m(colors.hilt ?? 0x4a2e1c, 0.12, DET.leather);
  pal[SLOT.WOOD] = m(colors.wood ?? 0x6a4a2e, 0.06, DET.wood);
  pal[SLOT.LEATHER] = m(0x5a3a24, 0.12, DET.leather);
  pal[SLOT.GEM] = m(colors.gem ?? sp.glowColor ?? 0x60a0ff, 1, DET.none, 0.95);
  pal[SLOT.GLOW] = m(sp.glowColor ?? 0x80c0ff, 0, DET.none, 1);
  pal[SLOT.CLOTH1] = m(colors.primary ?? 0x2a4a8a, 0, DET.cloth);
  pal[SLOT.CLOTH2] = m(colors.secondary ?? 0xe0d0a0, 0, DET.cloth);
  pal[SLOT.EMBLEM] = m(colors.emblem ?? TIER_TRIM[t], 0.8, DET.none, t >= 3 ? 0.3 : 0);
  pal[SLOT.LINEN] = m(0xeee4c8, 0, DET.cloth);
  for (let i = 0; i < NSLOT; i++) { if (i === SLOT.GEM || i === SLOT.GLOW) continue; const c = pal[i].c; for (let k = 0; k < 3; k++) { const v = c[k]; c[k] = v < 0.45 ? v : 0.45 + (v - 0.45) * 0.45; } }
  pal[SLOT.DARK] = m(0x1a1614, 0.1, DET.none);
  pal[SLOT.BONE] = m(0xe8dcc0, 0.2, DET.none);
  return pal;
}

const M = () => new THREE.Matrix4();
const T = (x, y, z) => new THREE.Matrix4().makeTranslation(x, y, z);
const bw = 0; // rigid (bone 0 placeholder, not skinned)
const edgeLit = (p, n) => { const f = 0.8 + 0.35 * Math.abs(n.x) + 0.2 * Math.max(0, n.y); return [f, f, f]; };

function blade(pb, len, w, th, opts = {}) {
  const sh = new THREE.Shape();
  const tip = opts.tip ?? 0.18;
  sh.moveTo(-w / 2, 0);
  sh.lineTo(-w / 2 * (opts.taper ?? 0.85), len * (1 - tip));
  sh.quadraticCurveTo(-w * 0.3, len * (1 - tip * 0.4), 0, len);
  sh.quadraticCurveTo(w * 0.3, len * (1 - tip * 0.4), w / 2 * (opts.taper ?? 0.85), len * (1 - tip));
  sh.lineTo(w / 2, 0); sh.lineTo(-w / 2, 0);
  const g = new THREE.ExtrudeGeometry(sh, { depth: th * 0.3, bevelEnabled: true, bevelThickness: th * 0.35, bevelSize: w * 0.18, bevelSegments: 1, curveSegments: 6 });
  g.translate(0, 0, -th * 0.15);
  pb.add(g, { m: opts.m || M(), slot: SLOT.BLADE, bw, mulFn: (p, n) => { const e = Math.abs(n.x) + Math.abs(n.y) * 0.5; const f = 0.78 + e * 0.45 + 0.06 * NZ.noise2(p.y * 12, p.x * 30); return [f, f, f * 1.02]; } });
  // fuller
  const fu = new THREE.BoxGeometry(w * 0.16, len * 0.62, th * 1.02);
  pb.add(fu, { m: new THREE.Matrix4().multiplyMatrices(opts.m || M(), T(0, len * 0.38, 0)), slot: opts.glow ? SLOT.GLOW : SLOT.METAL, bw, mul: opts.glow ? [1, 1, 1] : [0.55, 0.55, 0.6], emis: opts.glow ? 1 : 0 });
}
function guard(pb, w, h, d, y, opts = {}) {
  const g = new THREE.BoxGeometry(w, h, d);
  pb.add(g, { m: T(0, y, 0), slot: SLOT.TRIM, bw, mulFn: topLit(0.3, 0.9) });
  for (const s of [-1, 1]) {
    const c = new THREE.SphereGeometry(h * 0.75, 6, 5);
    pb.add(c, { m: T(s * w / 2, y + (opts.curl ? h * 0.8 : 0), 0), slot: SLOT.TRIM, bw, mulFn: topLit(0.3, 0.95) });
    if (opts.wings) {
      const sh = new THREE.Shape(); sh.moveTo(0, 0); sh.quadraticCurveTo(w * 0.25, h * 2, w * 0.45, h * 4); sh.quadraticCurveTo(w * 0.2, h * 1.5, 0, h * 0.8);
      const wg = new THREE.ExtrudeGeometry(sh, { depth: d * 0.5, bevelEnabled: true, bevelThickness: d * 0.2, bevelSize: d * 0.2, bevelSegments: 1 });
      const m = T(s * w * 0.35, y, -d * 0.25); if (s < 0) m.multiply(new THREE.Matrix4().makeScale(-1, 1, 1));
      pb.add(wg, { m, slot: SLOT.TRIM, bw, mulFn: topLit(0.3, 0.95), flip: s < 0 });
    }
  }
  if (opts.gem) { const gm = new THREE.OctahedronGeometry(h * 0.9, 0); pb.add(gm, { m: T(0, y, -d * 0.55), slot: SLOT.GEM, bw, emis: 1 }); pb.add(gm, { m: T(0, y, d * 0.55), slot: SLOT.GEM, bw, emis: 1 }); }
}
function grip(pb, len, r, y0 = -0.5) {
  const g = new THREE.CylinderGeometry(r, r * 1.05, len, 8, 6);
  pb.add(g, { m: T(0, y0 * len + len / 2 + y0 * 0, 0), slot: SLOT.HILT, bw, mulFn: (p) => { const f = 0.8 + 0.3 * Math.abs(Math.sin(p.y * 90)); return [f, f, f]; } });
}
function pommel(pb, r, y, gem) {
  const g = new THREE.SphereGeometry(r, 8, 6);
  pb.add(g, { m: T(0, y, 0), slot: SLOT.TRIM, bw, mulFn: topLit(0.35, 0.9) });
  if (gem) { const gm = new THREE.OctahedronGeometry(r * 0.6, 0); pb.add(gm, { m: T(0, y - r * 0.5, 0), slot: SLOT.GEM, bw, emis: 1 }); }
}

export function weaponGeometry(sp) {
  const key = JSON.stringify(sp);
  if (CACHE.has(key)) return CACHE.get(key);
  const pb = new PB(FAKE_BASE);
  const t = sp.tier ?? 1, epic = t >= 3, glow = !!sp.glow;
  const S = 1 + t * 0.08; // higher tiers = bigger
  let info = { type: sp.type, len: 1, grip: 0 };
  switch (sp.type) {
    case 'sword1h': {
      const L = 0.72 * S, W = (0.07 + t * 0.01);
      blade(pb, L, W, 0.014, { m: T(0, 0.075, 0), glow: glow && epic });
      guard(pb, 0.2 * S, 0.028, 0.035, 0.07, { wings: t >= 2, gem: t >= 2, curl: t >= 1 });
      grip(pb, 0.13, 0.017, -0.45);
      pommel(pb, 0.026, -0.075, t >= 2);
      info.len = L + 0.1;
      break;
    }
    case 'sword2h': {
      const L = 1.1 * S, W = 0.1 + t * 0.012;
      blade(pb, L, W, 0.018, { m: T(0, 0.1, 0), glow: glow, tip: 0.14 });
      guard(pb, 0.32 * S, 0.034, 0.045, 0.09, { wings: t >= 2, gem: t >= 1, curl: true });
      grip(pb, 0.3, 0.02, -0.55);
      pommel(pb, 0.034, -0.2, t >= 1);
      info.len = L + 0.15; info.grip2 = -0.14;
      break;
    }
    case 'axe': case 'axe2h': {
      const two = sp.type === 'axe2h';
      const H = (two ? 1.25 : 0.68) * S;
      const shaft = tubeGeo([new THREE.Vector3(0, -H * 0.18, 0), new THREE.Vector3(0, H * 0.82, 0)], [0.022, 0.02], 7);
      pb.add(shaft, { slot: SLOT.WOOD, bw, mulFn: (p) => { const f = 0.8 + 0.2 * NZ.noise2(p.y * 8, 1); return [f, f, f]; } });
      for (const y of [0, H * 0.1, H * 0.2]) { const w = new THREE.CylinderGeometry(0.025, 0.025, 0.03, 7); pb.add(w, { m: T(0, y - 0.02, 0), slot: SLOT.HILT, bw }); }
      const head = (side) => {
        const sh = new THREE.Shape();
        const hw = (two ? 0.3 : 0.2) * S, hh = (two ? 0.34 : 0.24) * S;
        sh.moveTo(0, -hh * 0.18); sh.lineTo(hw * 0.35, -hh * 0.22);
        sh.quadraticCurveTo(hw * 0.8, -hh * 0.55, hw * 1.05, -hh * 0.62);
        sh.quadraticCurveTo(hw * 0.85, 0, hw * 1.05, hh * 0.62);
        sh.quadraticCurveTo(hw * 0.8, hh * 0.55, hw * 0.35, hh * 0.22);
        sh.lineTo(0, hh * 0.18); sh.lineTo(0, -hh * 0.18);
        const g = new THREE.ExtrudeGeometry(sh, { depth: 0.012, bevelEnabled: true, bevelThickness: 0.01, bevelSize: 0.014, bevelSegments: 1, curveSegments: 8 });
        g.translate(0, 0, -0.006);
        const m = T(0, H * 0.72, 0); if (side < 0) m.multiply(new THREE.Matrix4().makeScale(-1, 1, 1));
        pb.add(g, { m, slot: SLOT.BLADE, bw, flip: side < 0, mulFn: (p, n) => { const f = 0.8 + 0.4 * Math.abs(n.x) * 0 + 0.3 * (Math.abs(p.x) > 0.15 * S ? 1 : 0) + 0.1 * n.y; return [f, f, f]; } });
        if (glow) { const e = new THREE.TorusGeometry(hw * 0.95, 0.006, 4, 12, 1.4); const me = T(0, H * 0.72, 0).multiply(new THREE.Matrix4().makeRotationZ(-0.7)); if (side < 0) me.premultiply(new THREE.Matrix4().makeScale(-1, 1, 1)); pb.add(e, { m: me, slot: SLOT.GLOW, bw, emis: 1 }); }
      };
      head(1); if (two) head(-1); else { const sp2 = new THREE.ConeGeometry(0.022, 0.12, 5); sp2.rotateZ(Math.PI / 2); pb.add(sp2, { m: T(-0.07, H * 0.72, 0), slot: SLOT.METAL, bw }); }
      const cap = new THREE.CylinderGeometry(0.035, 0.035, 0.1 * S, 8); pb.add(cap, { m: T(0, H * 0.72, 0), slot: SLOT.TRIM, bw, mulFn: topLit() });
      const top = new THREE.ConeGeometry(0.025, 0.08, 6); pb.add(top, { m: T(0, H * 0.84, 0), slot: SLOT.TRIM, bw });
      if (t >= 2) { const gm = new THREE.OctahedronGeometry(0.03, 0); pb.add(gm, { m: T(0, H * 0.72, -0.035), slot: SLOT.GEM, bw, emis: 1 }); pb.add(gm, { m: T(0, H * 0.72, 0.035), slot: SLOT.GEM, bw, emis: 1 }); }
      info.len = H; if (two) info.grip2 = -0.18;
      break;
    }
    case 'mace': {
      const H = 0.66 * S;
      const shaft = tubeGeo([new THREE.Vector3(0, -0.12, 0), new THREE.Vector3(0, H * 0.8, 0)], [0.021, 0.019], 7);
      pb.add(shaft, { slot: t >= 2 ? SLOT.METAL : SLOT.WOOD, bw });
      grip(pb, 0.15, 0.022, -0.5);
      const hy = H * 0.84, hr = 0.058 * S;
      const core = new THREE.IcosahedronGeometry(hr, 1);
      pb.add(core, { m: T(0, hy, 0), slot: glow ? SLOT.GEM : SLOT.METAL, bw, emis: glow ? 0.9 : 0, mulFn: topLit(0.3, 0.85) });
      // triangular flanges radiating from the head
      const nf = t >= 2 ? 8 : 6;
      for (let i = 0; i < nf; i++) {
        const a = i / nf * Math.PI * 2;
        const sh = new THREE.Shape();
        sh.moveTo(0, -hr * 1.35); sh.lineTo(hr * 1.05, -hr * 0.35); sh.lineTo(hr * 1.1, hr * 0.45); sh.lineTo(0, hr * 1.35); sh.lineTo(0, -hr * 1.35);
        const fl = new THREE.ExtrudeGeometry(sh, { depth: 0.012, bevelEnabled: true, bevelThickness: 0.004, bevelSize: 0.004, bevelSegments: 1 });
        fl.translate(0, 0, -0.006);
        const m = T(0, hy, 0).multiply(new THREE.Matrix4().makeRotationY(-a)).multiply(T(hr * 0.35, 0, 0));
        pb.add(fl, { m, slot: SLOT.BLADE, bw, mulFn: (p, n) => { const f = 0.78 + 0.3 * Math.max(0, n.y) + 0.15 * Math.abs(n.z); return [f, f, f]; } });
      }
      const top = new THREE.ConeGeometry(0.028 * S, 0.12 * S, 6); pb.add(top, { m: T(0, hy + hr * 1.3, 0), slot: SLOT.TRIM, bw, mulFn: topLit(0.3, 0.9) });
      const collar = new THREE.CylinderGeometry(0.032, 0.036, 0.05, 8); pb.add(collar, { m: T(0, hy - hr * 1.25, 0), slot: SLOT.TRIM, bw, mulFn: topLit(0.3, 0.9) });
      pommel(pb, 0.026, -0.13, t >= 2);
      info.len = H + 0.1;
      break;
    }
    case 'dagger': {
      const L = 0.4 * S;
      blade(pb, L, 0.05, 0.01, { m: T(0, 0.045, 0), glow: glow && epic, tip: 0.35, taper: 0.7 });
      guard(pb, 0.1, 0.018, 0.026, 0.04, { gem: t >= 2 });
      grip(pb, 0.09, 0.014, -0.5);
      pommel(pb, 0.018, -0.05, t >= 3);
      info.len = L;
      break;
    }
    case 'staff': {
      const H = 1.7 * (1 + t * 0.03);
      const pts = [], rads = [];
      for (let i = 0; i <= 12; i++) { const u = i / 12; pts.push(new THREE.Vector3(NZ.noise2(u * 4, 1) * 0.02, -H * 0.42 + u * H, NZ.noise2(u * 4, 5) * 0.02)); rads.push(0.021 + 0.006 * Math.sin(u * 25) * (t >= 1 ? 1 : 0.4) + (u > 0.88 ? (u - 0.88) * 0.3 : 0)); }
      pb.add(tubeGeo(pts, rads, 7), { slot: SLOT.WOOD, bw, mulFn: (p, n) => { const f = 0.78 + 0.25 * Math.abs(Math.sin(p.y * 40 + NZ.noise2(p.x * 50, p.y * 6) * 3)); return [f, f * 0.95, f * 0.9]; } });
      const topY = H * 0.58;
      // prongs holding a crystal
      const cr = 0.05 + t * 0.012;
      for (let i = 0; i < 3 + (t >= 2 ? 1 : 0); i++) {
        const a = i / (3 + (t >= 2 ? 1 : 0)) * Math.PI * 2;
        const pp = [new THREE.Vector3(0, topY - 0.02, 0), new THREE.Vector3(Math.cos(a) * cr * 1.3, topY + cr * 0.6, Math.sin(a) * cr * 1.3), new THREE.Vector3(Math.cos(a) * cr * 0.8, topY + cr * 2.2, Math.sin(a) * cr * 0.8)];
        pb.add(tubeGeo(pp, [0.012, 0.01, 0.004], 5), { slot: t >= 2 ? SLOT.TRIM : SLOT.WOOD, bw });
      }
      const crystal = new THREE.OctahedronGeometry(cr, 0); crystal.scale(0.8, 1.6, 0.8);
      pb.add(crystal, { m: T(0, topY + cr * 1.4, 0), slot: SLOT.GEM, bw, emis: 1, mulFn: (p, n) => { const f = 0.9 + 0.3 * n.y; return [f, f, f]; } });
      if (t >= 2) { for (const r0 of [cr * 1.9, cr * 2.4]) { const ring = new THREE.TorusGeometry(r0, 0.005, 4, 20); pb.add(ring, { m: T(0, topY + cr * 1.4, 0).multiply(new THREE.Matrix4().makeRotationX(Math.PI / 2 + (r0 > cr * 2 ? 0.5 : -0.4))), slot: SLOT.GLOW, bw, emis: 1 }); } }
      if (t >= 1) { const band = new THREE.CylinderGeometry(0.026, 0.026, 0.04, 8); for (const y of [topY - 0.1, -0.05]) pb.add(band, { m: T(0, y, 0), slot: SLOT.TRIM, bw }); }
      info.len = H; info.crystal = [0, topY + cr * 1.4, 0];
      break;
    }
    case 'wand': {
      pb.add(tubeGeo([new THREE.Vector3(0, -0.1, 0), new THREE.Vector3(0, 0.3, 0)], [0.012, 0.008], 6), { slot: SLOT.WOOD, bw });
      const gm = new THREE.OctahedronGeometry(0.022, 0); gm.scale(1, 1.6, 1); pb.add(gm, { m: T(0, 0.32, 0), slot: SLOT.GEM, bw, emis: 1 });
      info.len = 0.35;
      break;
    }
    case 'bow': {
      const L = 1.25 * (1 + t * 0.04);
      const pts = [], rads = [];
      for (let i = 0; i <= 16; i++) {
        const u = i / 16 * 2 - 1;
        const curve = -0.14 * (1 - u * u) + (t >= 1 ? 0.06 * Math.pow(Math.abs(u), 3) : 0);
        pts.push(new THREE.Vector3(0, u * L / 2, curve)); rads.push(0.022 - Math.abs(u) * 0.012 + (Math.abs(u) < 0.12 ? 0.008 : 0));
      }
      pb.add(tubeGeo(pts, rads, 7), { slot: SLOT.WOOD, bw, mulFn: (p) => { const f = 0.8 + 0.2 * Math.abs(Math.sin(p.y * 30)); return [f, f, f]; } });
      const gr = new THREE.CylinderGeometry(0.03, 0.03, 0.14, 8); pb.add(gr, { m: T(0, 0, -0.14), slot: SLOT.HILT, bw });
      if (t >= 2) for (const s of [-1, 1]) { const tip = new THREE.ConeGeometry(0.018, 0.1, 5); if (s < 0) tip.rotateX(Math.PI); pb.add(tip, { m: T(0, s * L / 2 * 1.02, 0.07), slot: SLOT.TRIM, bw }); }
      if (sp.glow) for (let i = 0; i < 2; i++) { const g = new THREE.OctahedronGeometry(0.02, 0); pb.add(g, { m: T(0, (i ? 1 : -1) * L * 0.3, -0.12), slot: SLOT.GEM, bw, emis: 1 }); }
      info.len = L; info.stringTop = [0, L / 2, 0.02 + (t >= 1 ? 0.06 : 0)]; info.stringBot = [0, -L / 2, 0.02 + (t >= 1 ? 0.06 : 0)];
      break;
    }
    case 'shield': {
      const R = (0.3 + t * 0.025);
      const heater = sp.emblem === 'lion' || sp.emblem === 'cross' || sp.emblem === 'sun' || t >= 2;
      if (heater) {
        const sh = new THREE.Shape(); sh.moveTo(-R, R * 1.05); sh.lineTo(R, R * 1.05); sh.lineTo(R, 0); sh.quadraticCurveTo(R * 0.9, -R * 0.9, 0, -R * 1.45); sh.quadraticCurveTo(-R * 0.9, -R * 0.9, -R, 0); sh.lineTo(-R, R * 1.05);
        const g = new THREE.ExtrudeGeometry(sh, { depth: 0.03, bevelEnabled: true, bevelThickness: 0.015, bevelSize: 0.022, bevelSegments: 2, curveSegments: 10 });
        // bulge the face
        const p = g.attributes.position; for (let i = 0; i < p.count; i++) { const x = p.getX(i), y = p.getY(i); p.setZ(i, p.getZ(i) + 0.05 * (1 - (x * x + y * y) / (R * R * 1.6))); }
        g.computeVertexNormals();
        pb.add(g, { slotFn: (p, n) => { const e = Math.max(Math.abs(p.x) / R, p.y > R * 0.85 ? 1 : 0, -p.y / (R * 1.25)); return e > 0.86 ? SLOT.TRIM : (sp.quarter && p.x * p.y > 0 ? SLOT.CLOTH2 : SLOT.CLOTH1); }, bw, mulFn: (p, n) => { const f = 0.85 + 0.2 * n.y + 0.08 * n.z; return [f, f, f]; } });
      } else {
        const g = new THREE.CylinderGeometry(R, R, 0.04, 20, 2); g.rotateX(Math.PI / 2);
        const p = g.attributes.position; for (let i = 0; i < p.count; i++) { const x = p.getX(i), y = p.getY(i), z = p.getZ(i); if (z > 0) p.setZ(i, z + 0.04 * (1 - (x * x + y * y) / (R * R))); }
        g.computeVertexNormals();
        pb.add(g, { slotFn: (p) => (Math.hypot(p.x, p.y) > R * 0.86 ? SLOT.METAL : SLOT.WOOD), bw, mulFn: (p, n) => { const f = 0.85 + 0.15 * n.y + 0.1 * Math.sin(p.x * 60); return [f, f, f]; } });
        const rim = new THREE.TorusGeometry(R, 0.016, 5, 24); pb.add(rim, { m: T(0, 0, 0.02), slot: SLOT.METAL, bw });
      }
      const boss = new THREE.SphereGeometry(0.06, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2); boss.rotateX(Math.PI / 2);
      if (sp.emblem) { const e = emblemGeo(sp.emblem, R * 0.45); pb.add(e, { m: T(0, heater ? R * 0.1 : 0, 0.09), slot: SLOT.EMBLEM, bw, mulFn: topLit(0.2, 1.0), emis: glow ? 0.5 : 0 }); }
      else pb.add(boss, { m: T(0, 0, 0.06), slot: SLOT.METAL, bw, mulFn: topLit(0.3, 0.9) });
      if (glow) { const gm = new THREE.OctahedronGeometry(0.035, 0); pb.add(gm, { m: T(0, heater ? R * 0.85 : R * 0.7, 0.08), slot: SLOT.GEM, bw, emis: 1 }); }
      // strap on the back
      const strap = new THREE.BoxGeometry(0.05, 0.22, 0.02); pb.add(strap, { m: T(0, 0, -0.035), slot: SLOT.LEATHER, bw });
      info.len = R * 2;
      break;
    }
    case 'book': {
      const W = 0.19, H = 0.25, D = 0.055;
      const cover = new THREE.BoxGeometry(W, H, D); pb.add(cover, { slot: SLOT.CLOTH1, bw, mulFn: topLit(0.2, 0.9) });
      const pages = new THREE.BoxGeometry(W * 0.94, H * 0.94, D * 0.8); pb.add(pages, { m: T(0.01, 0, 0), slot: SLOT.LINEN, bw, mulFn: (p) => { const f = 0.85 + 0.1 * Math.sin(p.z * 400); return [f, f, f * 0.95]; } });
      for (const [x, y] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) { const c = new THREE.BoxGeometry(0.04, 0.04, D * 1.08); pb.add(c, { m: T(x * (W / 2 - 0.018), y * (H / 2 - 0.018), 0), slot: SLOT.TRIM, bw }); }
      const e = emblemGeo(t >= 2 ? 'star' : 'diamond', 0.05); pb.add(e, { m: T(0, 0.01, D / 2), slot: t >= 2 ? SLOT.GEM : SLOT.TRIM, bw, emis: t >= 2 ? 0.8 : 0 });
      info.len = H;
      break;
    }
    case 'orb': {
      const o = new THREE.IcosahedronGeometry(0.075, 2); pb.add(o, { slot: SLOT.GEM, bw, emis: 1, mulFn: (p, n) => { const f = 0.75 + 0.45 * Math.max(0, n.y); return [f, f, f]; } });
      for (const a of [0, 1.2]) { const r = new THREE.TorusGeometry(0.1, 0.006, 4, 22); pb.add(r, { m: new THREE.Matrix4().makeRotationX(Math.PI / 2 + a).multiply(new THREE.Matrix4().makeRotationY(a * 0.7)), slot: SLOT.TRIM, bw }); }
      info.len = 0.2; info.float = true;
      break;
    }
    default: return null;
  }
  const piece = pb.build();
  const pal = weaponPalette(sp, sp.colors);
  const geo = assemble([{ p: piece }], pal, { skinned: false });
  geo.computeBoundingSphere();
  const out = { geo, info };
  CACHE.set(key, out);
  return out;
}
