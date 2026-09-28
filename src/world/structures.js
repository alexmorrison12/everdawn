// Parametric structures: timber-frame houses, inn, chapel, smithy, tower, windmill, barn, well, stalls, lamps,
// fences, props, mine entrance, ruins, dock, raid portal. All merged into the Kit's batched meshes.
import * as THREE from 'three';
import { RNG } from '../core/noise.js';
import { box, cyl, cone, gableRoof, Frame, M } from './kit.js';
import { blob, tube } from '../engine/geom.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);

// ---------- timber framing on a rectangular wall block ----------
function timberFrame(kit, F, w, d, y0, h, { braces = true, posts = 1.9, tint = 0xffffff } = {}) {
  const t = 0.22, o = 0.05;
  // horizontal beams (sill + plate)
  for (const y of [y0 + 0.11, y0 + h - 0.11]) {
    kit.add('timber', box(w + 2 * o + 0.02, t, t), F.at(0, y, d / 2 + o - t / 2 + 0.06), { tint, ao: false });
    kit.add('timber', box(w + 2 * o + 0.02, t, t), F.at(0, y, -d / 2 - o + t / 2 - 0.06), { tint, ao: false });
    kit.add('timber', box(t, t, d + 2 * o), F.at(w / 2 + o - t / 2 + 0.06, y, 0), { tint, ao: false });
    kit.add('timber', box(t, t, d + 2 * o), F.at(-w / 2 - o + t / 2 - 0.06, y, 0), { tint, ao: false });
  }
  // posts along each face
  const face = (len, place) => {
    const n = Math.max(1, Math.round(len / posts));
    for (let i = 0; i <= n; i++) {
      const u = -len / 2 + len * i / n;
      place(u, i, n);
    }
  };
  face(w, (u, i, n) => {
    for (const s of [1, -1]) {
      kit.add('timber', box(t, h, t), F.at(u, y0 + h / 2, s * (d / 2 + 0.06)), { tint, ao: false });
      if (braces && i < n && (i + (s > 0 ? 0 : 1)) % 2 === 0) {
        const seg = w / n, len = Math.hypot(seg, h) * 0.98, ang = Math.atan2(h, seg);
        kit.add('timber', box(len, t * 0.8, t * 0.8), F.at(u + seg / 2, y0 + h / 2, s * (d / 2 + 0.06), 0, 1, 1, 1, 0, (i % 2 ? 1 : -1) * ang));
      }
    }
  });
  face(d, (u) => {
    for (const s of [1, -1]) kit.add('timber', box(t, h, t), F.at(s * (w / 2 + 0.06), y0 + h / 2, u), { tint, ao: false });
  });
}

function windowAt(kit, F, x, y, z, ry, { w = 0.95, h = 1.1, shutter = 0x3a6a8a, box: flower = false } = {}) {
  const fr = F.at(x, y, z, ry);
  kit.add('window', box(w, h, 0.06), fr.clone().multiply(M(0, 0, 0.02)), { ao: false });
  kit.add('timber', box(w + 0.24, 0.14, 0.14), fr.clone().multiply(M(0, h / 2 + 0.07, 0.08)), { ao: false });
  kit.add('timber', box(w + 0.3, 0.12, 0.22), fr.clone().multiply(M(0, -h / 2 - 0.06, 0.1)), { ao: false });
  // shutters
  for (const s of [-1, 1]) kit.add('planks', box(w * 0.5, h, 0.06), fr.clone().multiply(M(s * (w * 0.75 + 0.05), 0, 0.1)), { tint: shutter, ao: false });
  if (flower) {
    kit.add('planks', box(w + 0.1, 0.25, 0.3), fr.clone().multiply(M(0, -h / 2 - 0.25, 0.22)), { tint: 0x9a7048, ao: false });
    const rng = kit.rng;
    for (let i = 0; i < 5; i++) {
      const c = rng.pick([0xe04060, 0xf0d040, 0xf0f0f0, 0xa050e0, 0xff8040]);
      kit.add('paint', blob(0.12, 0), fr.clone().multiply(M(-w / 2 + 0.12 + i * (w - 0.24) / 4, -h / 2 - 0.08, 0.24)), { tint: c, ao: false });
      kit.add('paint', blob(0.13, 0), fr.clone().multiply(M(-w / 2 + 0.2 + i * (w - 0.3) / 4, -h / 2 - 0.12, 0.3)), { tint: 0x4a8a30, ao: false });
    }
  }
}

function door(kit, F, x, z, ry, { w = 1.25, h = 2.2, tint = 0x8a5a34 } = {}) {
  const fr = F.at(x, 0, z, ry);
  kit.add('planks', box(w, h, 0.12), fr.clone().multiply(M(0, h / 2 + 0.6, 0.02)), { tint, ao: false });
  kit.add('timber', box(w + 0.35, 0.22, 0.24), fr.clone().multiply(M(0, h + 0.7, 0.08)), { ao: false });
  for (const s of [-1, 1]) kit.add('timber', box(0.2, h + 0.1, 0.24), fr.clone().multiply(M(s * (w / 2 + 0.1), h / 2 + 0.6, 0.08)), { ao: false });
  kit.add('metal', box(0.08, 0.08, 0.1), fr.clone().multiply(M(w * 0.3, h * 0.5 + 0.6, 0.1)), { tint: 0x333030, ao: false });
  kit.add('stone', box(w + 0.8, 0.3, 0.9), fr.clone().multiply(M(0, 0.45, 0.45)), { ao: false });
}

/** Timber-frame house. Local +Z is the front. */
export function house(kit, x, y, z, rot, o = {}) {
  const rng = new RNG(o.seed ?? 1);
  const w = o.w ?? 7.5, d = o.d ?? 6, floors = o.floors ?? 2, fh = 2.9;
  const F = new Frame(x, y, z, rot);
  const roofMat = o.roof ?? 'roofBlue';
  const plasterTint = o.plaster ?? rng.pick([0xffffff, 0xfff4e0, 0xf6ecd8, 0xfff0e8]);
  const base = 0.6;
  // foundation
  kit.add('stone', box(w + 0.5, 2.6, d + 0.5, 1.6), F.at(0, base - 1.3, 0), { yGround: y - 0.5 });
  let top = base, ww = w, dd = d;
  for (let f = 0; f < floors; f++) {
    if (f > 0) { ww += 0.5; dd += 0.5; // jetty + joist ends
      for (let i = -ww / 2 + 0.4; i < ww / 2; i += 0.8) kit.add('timber', box(0.18, 0.18, 0.5), F.at(i, top - 0.1, dd / 2 - 0.15), { ao: false });
    }
    kit.add('plaster', box(ww, fh, dd, 2.2), F.at(0, top + fh / 2, 0), { tint: plasterTint, yGround: y, aoH: 4 });
    timberFrame(kit, F, ww, dd, top, fh, { braces: f > 0 || rng.chance(0.5) });
    // windows
    const nw = Math.max(1, Math.floor(ww / 2.6));
    for (let i = 0; i < nw; i++) {
      const u = -ww / 2 + ww * (i + 0.5) / nw;
      if (f === 0 && Math.abs(u) < 1.2) continue; // door gap
      windowAt(kit, F, u, top + fh * 0.55, dd / 2 + 0.03, 0, { shutter: o.shutter ?? 0x3a6a8a, box: f === 0 && rng.chance(0.6) });
      windowAt(kit, F, u, top + fh * 0.55, -dd / 2 - 0.03, Math.PI, { shutter: o.shutter ?? 0x3a6a8a });
    }
    if (dd > 5) { windowAt(kit, F, ww / 2 + 0.03, top + fh * 0.55, 0, Math.PI / 2, { shutter: o.shutter ?? 0x3a6a8a }); windowAt(kit, F, -ww / 2 - 0.03, top + fh * 0.55, 0, -Math.PI / 2, { shutter: o.shutter ?? 0x3a6a8a }); }
    top += fh;
  }
  door(kit, F, 0, d / 2 + 0.03, 0);
  // roof
  const rise = dd * (o.pitch ?? 0.62);
  const { roof, gables } = gableRoof(ww, dd, rise, 0.55, 0.2, 2);
  kit.add(roofMat, roof, F.at(0, top, 0), { ao: false, tint: o.roofTint ?? 0xffffff });
  kit.add('plaster', gables, F.at(0, top, 0), { tint: plasterTint, ao: false });
  // gable timbers (king post + collar)
  for (const s of [-1, 1]) {
    kit.add('timber', box(0.2, rise * 0.95, 0.2), F.at(s * (ww / 2 + 0.07), top + rise * 0.47, 0), { ao: false });
    kit.add('timber', box(0.2, 0.2, dd * 0.55), F.at(s * (ww / 2 + 0.07), top + rise * 0.45, 0), { ao: false });
  }
  kit.add('timber', box(ww + 1.3, 0.28, 0.28), F.at(0, top + rise + 0.1, 0), { ao: false }); // ridge beam
  // chimney
  if (o.chimney !== false) {
    const cx = (rng.chance(0.5) ? 1 : -1) * (ww / 2 - 0.6);
    kit.add('stone', box(1.0, rise + 2.2, 1.0, 1.4), F.at(cx, top + (rise + 2.2) / 2 - 0.4, -dd * 0.18), { ao: false });
    kit.add('stone', box(1.2, 0.25, 1.2, 1.4), F.at(cx, top + rise + 1.75, -dd * 0.18), { ao: false });
    const [wx, wz] = F.world(cx, -dd * 0.18);
    kit.chimneys = kit.chimneys || [];
    kit.chimneys.push(V(wx, y + top + rise + 2.0, wz));
  }
  kit.boxCollider(x, z, w + 0.6, d + 0.6, rot);
  return { top: top + rise, F };
}

export function inn(kit, x, y, z, rot) {
  const r = house(kit, x, y, z, rot, { w: 13, d: 9, floors: 2, roof: 'roofRed', seed: 77, shutter: 0x7a3a2a, pitch: 0.55 });
  const F = r.F;
  // porch roof over the door
  const { roof } = gableRoof(4.4, 2.2, 0.7, 0.25, 0.16, 2);
  kit.add('roofRed', roof, F.at(0, 3.55, 5.6, Math.PI / 2 * 0), { ao: false });
  for (const s of [-1, 1]) kit.add('timber', box(0.25, 3.0, 0.25), F.at(s * 2.0, 2.1, 6.5), { ao: false });
  // hanging sign on an iron bracket
  kit.add('metal', box(1.8, 0.08, 0.08), F.at(-3.8, 4.1, 5.35), { tint: 0x2a2a2a, ao: false });
  kit.add('planks', box(1.3, 0.95, 0.1), F.at(-4.1, 3.45, 5.35), { tint: 0xb07840, ao: false });
  kit.add('paint', box(0.9, 0.55, 0.12), F.at(-4.1, 3.45, 5.36), { tint: 0xe0b040, ao: false });
  // barrels and a bench by the door
  for (let i = 0; i < 3; i++) barrel(kit, F, 3.2 + i * 0.85, 0.6, 5.4 + (i % 2) * 0.5);
  bench(kit, F, -2.4, 0.6, 5.8, 0);
  return r;
}

export function chapel(kit, x, y, z, rot) {
  const F = new Frame(x, y, z, rot);
  const w = 7, d = 12, h = 5.5;
  kit.add('stone', box(w + 0.6, 1.4, d + 0.6), F.at(0, -0.1, 0), { yGround: y - 0.6 });
  kit.add('stone', box(w, h, d, 2.2), F.at(0, 0.6 + h / 2, 0), { tint: 0xf0e8e0 });
  // buttresses
  for (let i = -1; i <= 1; i++) for (const s of [-1, 1]) kit.add('stone', box(0.7, h * 0.8, 1.0), F.at(s * (w / 2 + 0.3), 0.6 + h * 0.4, i * 4), {});
  const { roof, gables } = gableRoof(d, w, 4.6, 0.5, 0.25, 2);
  kit.add('roofBlue', roof, F.at(0, 0.6 + h, 0, Math.PI / 2), { ao: false });
  kit.add('stone', gables, F.at(0, 0.6 + h, 0, Math.PI / 2), { ao: false, tint: 0xf0e8e0 });
  // tall arched windows
  for (let i = -1; i <= 1; i++) for (const s of [-1, 1]) {
    kit.add('window', box(0.06, 2.4, 1.0), F.at(s * (w / 2 + 0.02), 3.2, i * 3.6), { ao: false });
  }
  // bell tower at the front
  const tw = 3.2, th = 13;
  kit.add('stone', box(tw, th, tw, 2.2), F.at(0, th / 2, d / 2 + tw / 2 - 0.4), { tint: 0xf4ece4 });
  kit.add('stone', box(tw + 0.4, 0.4, tw + 0.4), F.at(0, th - 3.2, d / 2 + tw / 2 - 0.4), {});
  kit.add('window', box(1.2, 1.8, tw + 0.05), F.at(0, th - 1.6, d / 2 + tw / 2 - 0.4), { ao: false });
  kit.add('window', box(tw + 0.05, 1.8, 1.2), F.at(0, th - 1.6, d / 2 + tw / 2 - 0.4), { ao: false });
  kit.add('roofBlue', cone(tw * 0.85, 6.5, 4, 2), F.at(0, th + 3.25, d / 2 + tw / 2 - 0.4, Math.PI / 4), { ao: false });
  kit.add('metal', box(0.12, 1.6, 0.12), F.at(0, th + 7.2, d / 2 + tw / 2 - 0.4), { tint: 0xd0a040, ao: false });
  kit.add('metal', box(0.9, 0.12, 0.12), F.at(0, th + 7.4, d / 2 + tw / 2 - 0.4), { tint: 0xd0a040, ao: false });
  door(kit, F, 0, d / 2 + tw - 0.35, 0, { w: 1.6, h: 2.8 });
  kit.boxCollider(x, z, w + 1.2, d + 1.2, rot);
  const [tx, tz] = F.world(0, d / 2 + tw / 2 - 0.4);
  kit.boxCollider(tx, tz, tw + 0.4, tw + 0.4, rot);
}

export function smithy(kit, x, y, z, rot) {
  const F = new Frame(x, y, z, rot);
  const w = 8, d = 6;
  kit.add('stone', box(w + 0.4, 1.2, d + 0.4), F.at(0, 0, 0), { yGround: y - 0.6 });
  kit.add('stone', box(w, 3.2, 0.6, 1.6), F.at(0, 0.6 + 1.6, -d / 2 + 0.3), {});
  kit.add('stone', box(0.6, 3.2, d, 1.6), F.at(-w / 2 + 0.3, 0.6 + 1.6, 0), {});
  for (const u of [-w / 2 + 0.3, 0, w / 2 - 0.3]) kit.add('timber', box(0.3, 3.4, 0.3), F.at(u, 0.6 + 1.7, d / 2 - 0.3), {});
  kit.add('timber', box(0.3, 3.4, 0.3), F.at(w / 2 - 0.3, 0.6 + 1.7, -d / 2 + 0.3), {});
  kit.add('timber', box(w + 0.4, 0.3, 0.3), F.at(0, 3.9, d / 2 - 0.3), { ao: false });
  // lean-to roof
  kit.add('roofRed', box(w + 1.2, 0.2, d + 1.4, 2), F.at(0, 4.3, 0, 0, 1, 1, 1, -0.28), { ao: false });
  // forge + chimney
  kit.add('stone', box(2.2, 1.1, 1.8), F.at(-2.2, 1.15, -1.6), { tint: 0xb0a8a0 });
  kit.add('glow', box(1.5, 0.12, 1.1), F.at(-2.2, 1.72, -1.5), { ao: false });
  kit.add('stone', box(1.4, 6.5, 1.4, 1.4), F.at(-2.2, 3.8, -2.4), {});
  // anvil
  kit.add('metal', box(0.9, 0.35, 0.35), F.at(0.8, 1.35, 0.6), { tint: 0x3a3a40, ao: false });
  kit.add('metal', box(0.4, 0.5, 0.35), F.at(0.8, 0.95, 0.6), { tint: 0x3a3a40, ao: false });
  kit.add('timber', cyl(0.35, 0.4, 0.5, 8), F.at(0.8, 0.6, 0.6), {});
  // weapon rack
  kit.add('timber', box(2, 0.12, 0.12), F.at(2.8, 2.2, -2.4), { ao: false });
  for (let i = 0; i < 4; i++) kit.add('metal', box(0.08, 1.4, 0.03), F.at(2.1 + i * 0.45, 1.6, -2.35, 0, 1, 1, 1, 0, 0.08), { tint: 0xc0c8d0, ao: false });
  for (let i = 0; i < 2; i++) barrel(kit, F, 3.2, 0.6, 1.8 - i * 0.9);
  kit.boxCollider(x, z, w + 0.4, d + 0.4, rot);
  kit.forges = kit.forges || []; const [fx, fz] = F.world(-2.2, -1.5); kit.forges.push(V(fx, y + 1.8, fz));
}

export function watchtower(kit, x, y, z, rot, h = 11) {
  const F = new Frame(x, y, z, rot);
  kit.add('stone', box(4.4, h, 4.4, 2), F.at(0, h / 2 - 0.8, 0), { yGround: y - 0.8, aoH: 5 });
  kit.add('stone', box(5.2, 0.5, 5.2), F.at(0, h - 0.6, 0), {});
  for (let i = 0; i < 4; i++) for (let j = -1; j <= 1; j++) {
    const a = i * Math.PI / 2;
    kit.add('stone', box(0.9, 0.9, 0.5), F.at(Math.sin(a) * 2.35 + Math.cos(a) * j * 1.6, h + 0.1, Math.cos(a) * 2.35 - Math.sin(a) * j * 1.6, a), {});
  }
  for (const s of [-1, 1]) for (const t of [-1, 1]) kit.add('timber', box(0.25, 2.6, 0.25), F.at(s * 2.1, h + 0.9, t * 2.1), {});
  kit.add('roofRed', cone(3.9, 3.2, 4), F.at(0, h + 3.7, 0, Math.PI / 4), { ao: false });
  kit.add('window', box(0.6, 1.2, 4.45), F.at(0, h * 0.55, 0), { ao: false });
  door(kit, F, 0, 2.23, 0, { w: 1.1, h: 2.0 });
  kit.boxCollider(x, z, 4.6, 4.6, rot);
  kit.torches = kit.torches || []; const [tx, tz] = F.world(0, 2.9); kit.torches.push(V(tx, y + 3.2, tz));
}

export function windmill(kit, x, y, z, rot) {
  const F = new Frame(x, y, z, rot);
  kit.add('stone', cyl(2.6, 3.6, 10, 12, 2), F.at(0, 4.4, 0), { yGround: y - 0.6, aoH: 5, tint: 0xf4ece0 });
  kit.add('thatch', cone(3.3, 3.4, 12), F.at(0, 11.1, 0), { ao: false });
  kit.add('window', box(0.8, 1.1, 0.1), F.at(0, 6.5, 2.95, 0, 1, 1, 1, -0.09), { ao: false });
  door(kit, F, 0, 3.35, 0, { w: 1.2, h: 2.1 });
  kit.add('timber', box(0.45, 0.45, 1.6), F.at(0, 9.2, 2.9), { ao: false });
  kit.circleCollider(x, z, 3.7);
  // separate rotating sails
  const sails = new THREE.Group();
  const mk = new THREE.Group();
  const matT = kit.mats.timber, matC = kit.mats.cloth;
  for (let i = 0; i < 4; i++) {
    const arm = new THREE.Group(); arm.rotation.z = i * Math.PI / 2;
    const spar = new THREE.Mesh(box(0.22, 8.5, 0.18), matT); spar.position.y = 4.4; arm.add(spar);
    const sail = new THREE.Mesh(box(1.9, 6.6, 0.05, 2), matC); sail.position.set(1.05, 5.0, -0.05); arm.add(sail);
    for (let k = 0; k < 5; k++) { const rung = new THREE.Mesh(box(2.1, 0.08, 0.1), matT); rung.position.set(1.05, 2.0 + k * 1.5, 0.02); arm.add(rung); }
    mk.add(arm);
  }
  const hub = new THREE.Mesh(cyl(0.45, 0.45, 0.6, 10), matT); hub.rotation.x = Math.PI / 2; mk.add(hub);
  mk.traverse(o => { if (o.isMesh) { o.castShadow = true; o.geometry.setAttribute('color', new THREE.Float32BufferAttribute(new Float32Array(o.geometry.attributes.position.count * 3).fill(0.9), 3)); } });
  sails.add(mk);
  const [sx, sz] = F.world(0, 3.8);
  sails.position.set(sx, y + 9.2, sz); sails.rotation.y = rot;
  sails.userData.spin = mk;
  kit.animated = kit.animated || []; kit.animated.push({ obj: mk, spin: 0.35 });
  kit.extraObjects = kit.extraObjects || []; kit.extraObjects.push(sails);
}

export function barn(kit, x, y, z, rot) {
  const F = new Frame(x, y, z, rot);
  const w = 10, d = 7.5, h = 4.2;
  kit.add('stone', box(w + 0.3, 1.2, d + 0.3), F.at(0, -0.1, 0), { yGround: y - 0.6 });
  kit.add('planks', box(w, h, d, 2.4), F.at(0, 0.5 + h / 2, 0), { tint: 0xc04a34, yGround: y, aoH: 3 });
  for (const s of [-1, 1]) for (const u of [-w / 2, w / 2]) kit.add('timber', box(0.3, h, 0.3), F.at(u, 0.5 + h / 2, s * d / 2), { ao: false, tint: 0xf0e8e0 });
  const { roof, gables } = gableRoof(w, d, 3.8, 0.6, 0.22, 2);
  kit.add('thatch', roof, F.at(0, 0.5 + h, 0), { ao: false });
  kit.add('planks', gables, F.at(0, 0.5 + h, 0), { tint: 0xc04a34, ao: false });
  // big double door with white X braces
  kit.add('planks', box(3.2, 3.2, 0.14), F.at(0, 0.5 + 1.6, d / 2 + 0.04), { tint: 0xa83a28, ao: false });
  for (const s of [-1, 1]) kit.add('timber', box(4.4, 0.18, 0.1), F.at(0, 2.1, d / 2 + 0.13, 0, 1, 1, 1, 0, s * 0.78), { ao: false, tint: 0xf0e8e0 });
  kit.boxCollider(x, z, w + 0.4, d + 0.4, rot);
}

export function well(kit, x, y, z) {
  const F = new Frame(x, y, z, 0);
  kit.add('stone', cyl(1.3, 1.4, 1.1, 14, 1.4), F.at(0, 0.45, 0), { yGround: y - 0.1 });
  kit.add('darkStone', cyl(1.0, 1.0, 0.05, 14), F.at(0, 0.95, 0), { ao: false, tint: 0x203040 });
  for (const s of [-1, 1]) kit.add('timber', box(0.2, 2.4, 0.2), F.at(s * 1.15, 1.6, 0), {});
  kit.add('timber', box(2.6, 0.18, 0.18), F.at(0, 2.5, 0), { ao: false });
  const { roof } = gableRoof(2.8, 2.2, 0.9, 0.2, 0.1, 2);
  kit.add('roofBlue', roof, F.at(0, 2.7, 0), { ao: false });
  kit.add('planks', cyl(0.22, 0.18, 0.35, 8), F.at(0.2, 1.9, 0), { ao: false, tint: 0x9a7048 });
  kit.circleCollider(x, z, 1.5);
}

export function lampPost(kit, x, y, z, rot = 0) {
  const F = new Frame(x, y, z, rot);
  kit.add('metal', cyl(0.07, 0.1, 3.4, 6), F.at(0, 1.7, 0), { tint: 0x2a2a30, ao: false });
  kit.add('metal', box(0.7, 0.07, 0.07), F.at(0.3, 3.35, 0), { tint: 0x2a2a30, ao: false });
  kit.add('metal', cone(0.28, 0.3, 4), F.at(0.6, 3.25, 0, Math.PI / 4), { tint: 0x2a2a30, ao: false });
  kit.add('glow', box(0.22, 0.34, 0.22), F.at(0.6, 2.95, 0), { ao: false });
  kit.lamps = kit.lamps || []; const [lx, lz] = F.world(0.6, 0); kit.lamps.push(V(lx, y + 2.95, lz));
  kit.circleCollider(x, z, 0.25);
}

export function barrel(kit, F, x, y, z) {
  kit.add('planks', cyl(0.36, 0.36, 0.95, 10, 1), F.at(x, y + 0.48, z), { tint: 0xa87850 });
  for (const hy of [0.18, 0.78]) kit.add('metal', cyl(0.375, 0.375, 0.07, 10, 1, true), F.at(x, y + hy, z), { tint: 0x3a3a3a, ao: false });
}
export function crate(kit, F, x, y, z, s = 0.8, ry = 0) {
  kit.add('planks', box(s, s, s, 0.9), F.at(x, y + s / 2, z, ry), { tint: 0xc09060 });
  kit.add('timber', box(s + 0.04, 0.1, s + 0.04), F.at(x, y + 0.06, z, ry), { ao: false });
  kit.add('timber', box(s + 0.04, 0.1, s + 0.04), F.at(x, y + s - 0.06, z, ry), { ao: false });
}
export function bench(kit, F, x, y, z, ry) {
  kit.add('planks', box(1.8, 0.1, 0.45, 1), F.at(x, y + 0.48, z, ry), { tint: 0xa87850, ao: false });
  for (const s of [-1, 1]) kit.add('timber', box(0.1, 0.45, 0.4), F.at(x + Math.cos(ry) * s * 0.7, y + 0.22, z - Math.sin(ry) * s * 0.7, ry), {});
}
export function cart(kit, x, y, z, rot) {
  const F = new Frame(x, y, z, rot);
  kit.add('planks', box(1.6, 0.5, 2.6, 1), F.at(0, 1.0, 0), { tint: 0xa87850 });
  for (const s of [-1, 1]) {
    const wheel = new THREE.TorusGeometry(0.55, 0.09, 6, 14);
    kit.add('timber', wheel, F.at(s * 0.9, 0.6, -0.3, Math.PI / 2), { ao: false });
    kit.add('timber', box(0.08, 1.0, 0.08), F.at(s * 0.9, 0.6, -0.3), { ao: false });
    kit.add('timber', box(0.08, 0.08, 2.4), F.at(s * 0.5, 0.8, 2.2), { ao: false });
  }
  for (let i = 0; i < 3; i++) kit.add('cloth', blob(0.35, 1, null, [1, 0.8, 1]), F.at(-0.35 + i * 0.35, 1.45, -0.5 + (i % 2) * 0.5), { tint: 0xd8c8a0, ao: false });
  kit.boxCollider(x, z, 1.8, 3.0, rot);
}
export function haystack(kit, x, y, z, s = 1) {
  kit.add('thatch', blob(1.3 * s, 1, d => 1 + d.y * 0.1, [1, 0.75, 1]), M(x, y + 0.6 * s, z), { tint: 0xf0d080 });
  kit.circleCollider(x, z, 1.2 * s);
}
export function fence(kit, pts, heightAt, { post = 2.4, tint = 0xa07850 } = {}) {
  for (let i = 0; i < pts.length - 1; i++) {
    const [ax, az] = pts[i], [bx, bz] = pts[i + 1];
    const len = Math.hypot(bx - ax, bz - az), n = Math.max(1, Math.round(len / post));
    const ang = Math.atan2(-(bz - az), bx - ax);
    for (let k = 0; k <= n; k++) {
      const t = k / n, x = ax + (bx - ax) * t, z = az + (bz - az) * t, y = heightAt(x, z);
      kit.add('timber', box(0.16, 1.2, 0.16), M(x, y + 0.5, z, ang), { tint });
      if (k < n) {
        const t2 = (k + 0.5) / n, mx = ax + (bx - ax) * t2, mz = az + (bz - az) * t2, my = heightAt(mx, mz);
        const seg = len / n;
        for (const hy of [0.45, 0.9]) kit.add('planks', box(seg + 0.1, 0.12, 0.06, 1.5), M(mx, my + hy, mz, ang), { tint, ao: false });
      }
    }
  }
}
export function stall(kit, x, y, z, rot, color = 0xc04040) {
  const F = new Frame(x, y, z, rot);
  kit.add('planks', box(2.6, 0.9, 1.1, 1), F.at(0, 0.45, 0), { tint: 0xa87850 });
  for (const s of [-1, 1]) for (const t of [-1, 1]) kit.add('timber', box(0.12, 2.5, 0.12), F.at(s * 1.25, 1.25, t * 0.55), {});
  // striped canopy
  for (let i = 0; i < 6; i++) kit.add('cloth', box(0.45, 0.04, 1.8, 1), F.at(-1.1 + i * 0.45, 2.55, 0.15, 0, 1, 1, 1, -0.25), { tint: i % 2 ? color : 0xf0e8d8, ao: false });
  for (let i = 0; i < 5; i++) kit.add('paint', blob(0.16, 0), F.at(-0.9 + i * 0.45, 1.0, 0.1), { tint: [0xe04030, 0x60b030, 0xf0c030, 0xe07020, 0x9050c0][i], ao: false });
  kit.boxCollider(x, z, 2.8, 1.3, rot);
}
export function signpost(kit, x, y, z, rot) {
  const F = new Frame(x, y, z, rot);
  kit.add('timber', box(0.18, 2.6, 0.18), F.at(0, 1.3, 0), {});
  kit.add('planks', box(1.3, 0.3, 0.06), F.at(0.55, 2.2, 0, 0, 1, 1, 1, 0, 0.05), { tint: 0xc09060, ao: false });
  kit.add('planks', box(1.2, 0.3, 0.06), F.at(-0.5, 1.8, 0.02, 0.4, 1, 1, 1, 0, -0.05), { tint: 0xc09060, ao: false });
  kit.circleCollider(x, z, 0.2);
}
export function mailbox(kit, x, y, z, rot) {
  const F = new Frame(x, y, z, rot);
  kit.add('metal', cyl(0.06, 0.06, 1.1, 6), F.at(0, 0.55, 0), { tint: 0x2a2a30, ao: false });
  kit.add('paint', box(0.55, 0.6, 0.45), F.at(0, 1.35, 0), { tint: 0x3060b0, ao: false });
  kit.add('paint', cyl(0.28, 0.28, 0.45, 10, 1), F.at(0, 1.65, 0, 0, 1, 1, 1, Math.PI / 2), { tint: 0x3060b0, ao: false });
  kit.add('metal', box(0.35, 0.05, 0.05), F.at(0, 1.4, 0.24), { tint: 0xd0a040, ao: false });
  kit.circleCollider(x, z, 0.35);
}

/** Heroic statue on a plinth (a simplified stone knight until the character system can pose a real one). */
export function statue(kit, x, y, z, rot) {
  const F = new Frame(x, y, z, rot);
  kit.add('stone', box(4.2, 0.6, 4.2), F.at(0, 0.3, 0), { yGround: y });
  kit.add('stone', box(3.2, 1.8, 3.2), F.at(0, 1.5, 0), {});
  kit.add('stone', box(3.6, 0.3, 3.6), F.at(0, 2.5, 0), {});
  kit.add('metal', box(1.6, 0.5, 0.05), F.at(0, 1.6, 1.62), { tint: 0xc09838, ao: false }); // plaque
  kit.circleCollider(x, z, 2.4);
  kit.statueSpot = { x, y: y + 2.65, z, rot };
}

// ---------- outdoor areas ----------
export function mineEntrance(kit, x, y, z, rot) {
  const F = new Frame(x, y, z, rot);
  // dark tunnel mouth
  kit.add('darkStone', box(5.2, 5.0, 6), F.at(0, 2.2, -3.2), { tint: 0x0a0806, ao: false });
  for (const s of [-1, 1]) {
    kit.add('timber', box(0.5, 4.8, 0.5), F.at(s * 2.4, 2.4, 0), {});
    kit.add('timber', box(0.4, 0.4, 3), F.at(s * 2.4, 4.6, -1.3), { ao: false });
  }
  kit.add('timber', box(5.8, 0.55, 0.6), F.at(0, 4.9, 0), { ao: false });
  kit.add('planks', box(2.4, 0.6, 0.08), F.at(0, 5.55, 0.25), { tint: 0xc09060, ao: false });
  // rails
  for (const s of [-1, 1]) kit.add('metal', box(0.08, 0.1, 14), F.at(s * 0.55, 0.12, 2), { tint: 0x5a4a40, ao: false });
  for (let i = 0; i < 16; i++) kit.add('timber', box(1.6, 0.1, 0.25), F.at(0, 0.05, -4 + i * 0.9), { ao: false });
  // minecart
  kit.add('metal', box(1.3, 0.8, 1.8), F.at(0, 0.75, 5.2), { tint: 0x5a5250 });
  kit.add('darkStone', blob(0.55, 1, null, [1.1, 0.5, 1.4]), F.at(0, 1.2, 5.2), { tint: 0xd0a060, ao: false });
  crate(kit, F, 2.8, 0, 2.2, 0.9, 0.3); crate(kit, F, 3.2, 0, 3.3, 0.7, 0.8); crate(kit, F, 2.9, 0.9, 2.3, 0.6, 0.1);
  barrel(kit, F, -3.0, 0, 2.5); barrel(kit, F, -3.6, 0, 3.3);
  kit.torches = kit.torches || [];
  for (const s of [-1, 1]) { const [tx, tz] = F.world(s * 2.4, 0.45); kit.torches.push(V(tx, y + 3.5, tz)); }
  kit.boxCollider(...F.world(-3.4, 2.9), 1.6, 1.6, rot); kit.boxCollider(...F.world(3.0, 2.8), 1.8, 2.2, rot);
}

export function ruins(kit, cx, cy, cz, heightAt) {
  const rng = new RNG(909);
  // broken keep walls (square with gaps)
  const size = 22;
  const wallSeg = (x0, z0, x1, z1) => {
    const len = Math.hypot(x1 - x0, z1 - z0), n = Math.ceil(len / 2.2), ang = Math.atan2(-(z1 - z0), x1 - x0);
    for (let i = 0; i < n; i++) {
      if (rng.chance(0.18)) continue;
      const t = (i + 0.5) / n, x = cx + x0 + (x1 - x0) * t, z = cz + z0 + (z1 - z0) * t;
      const h = rng.chance(0.3) ? rng.range(0.6, 1.8) : rng.range(2.5, 5.5);
      const y = heightAt(x, z);
      kit.add('stone', box(len / n + 0.05, h, 1.1, 1.6), M(x, y + h / 2 - 0.4, z, ang, 1, 1, 1, 0, rng.range(-0.03, 0.03)), { yGround: y, aoH: 3, tint: 0xe0d8d0 });
      if (h > 2.4) kit.colliders.push({ type: 'box', x, z, hw: len / n / 2, hd: 0.6, rot: ang });
    }
  };
  const s = size / 2;
  wallSeg(-s, -s, s, -s); wallSeg(s, -s, s, s); wallSeg(s, s, 3, s); wallSeg(-3, s, -s, s); wallSeg(-s, s, -s, -s);
  // corner tower stump
  const tx = cx - s, tz = cz - s, ty = heightAt(tx, tz);
  kit.add('stone', cyl(2.6, 3.0, 8, 12, 2), M(tx, ty + 3.2, tz), { yGround: ty, aoH: 5, tint: 0xe0d8d0 });
  kit.circleCollider(tx, tz, 3.1);
  // pillars (some fallen)
  for (let i = 0; i < 8; i++) {
    const a = i / 8 * Math.PI * 2, r = 7;
    const x = cx + Math.cos(a) * r, z = cz + Math.sin(a) * r, y = heightAt(x, z);
    if (rng.chance(0.35)) kit.add('stone', cyl(0.45, 0.45, 4.2, 10, 1.6), M(x, y + 0.45, z, rng.range(0, 3), 1, 1, 1, Math.PI / 2), { yGround: y, tint: 0xe8e0d8 });
    else { const h = rng.range(2.5, 5); kit.add('stone', cyl(0.45, 0.5, h, 10, 1.6), M(x, y + h / 2, z), { yGround: y, tint: 0xe8e0d8 }); kit.add('stone', box(1.2, 0.35, 1.2), M(x, y + h, z), { tint: 0xe8e0d8 }); kit.circleCollider(x, z, 0.6); }
  }
  // rubble
  for (let i = 0; i < 26; i++) {
    const x = cx + rng.range(-s - 4, s + 4), z = cz + rng.range(-s - 4, s + 4), y = heightAt(x, z);
    kit.add('stone', blob(rng.range(0.3, 0.8), 0, null, [1, 0.6, 1]), M(x, y + 0.1, z, rng.range(0, 6)), { tint: 0xd8d0c8 });
  }
  // bandit tents
  for (let i = 0; i < 4; i++) {
    const a = i * 1.6 + 0.4, x = cx + Math.cos(a) * 5, z = cz + Math.sin(a) * 5, y = heightAt(x, z);
    const pts = new THREE.BufferGeometry();
    const w = 2.2, d = 3, h = 2.2;
    const P = [-w, 0, -d, w, 0, -d, 0, h, -d, -w, 0, d, w, 0, d, 0, h, d];
    pts.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
    pts.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 2, 0, 1, 1, 0, 0, 2, 0, 1, 1], 2));
    pts.setIndex([0, 3, 2, 2, 3, 5, 1, 2, 4, 2, 5, 4, 0, 2, 1, 3, 4, 5]);
    pts.computeVertexNormals();
    kit.add('cloth', pts, M(x, y, z, a), { tint: 0xa83028, ao: false });
    kit.boxCollider(x, z, 4.2, 5.8, a);
  }
  kit.campfires = kit.campfires || []; kit.campfires.push(V(cx, heightAt(cx, cz) + 0.1, cz));
  // campfire stones
  for (let i = 0; i < 8; i++) { const a = i / 8 * 6.28; kit.add('stone', blob(0.25, 0), M(cx + Math.cos(a) * 0.9, heightAt(cx, cz) + 0.1, cz + Math.sin(a) * 0.9), { tint: 0x8a8480 }); }
}

export function dock(kit, x, y, z, rot, len = 16) {
  const F = new Frame(x, y, z, rot);
  kit.add('planks', box(3, 0.2, len, 2), F.at(0, 0.7, -len / 2), { tint: 0xb08a60, ao: false });
  for (let i = 0; i <= len; i += 3) for (const s of [-1, 1]) kit.add('timber', cyl(0.14, 0.14, 3.6, 6), F.at(s * 1.35, -0.6, -i), {});
  // rope posts
  for (const s of [-1, 1]) kit.add('timber', cyl(0.15, 0.15, 1.4, 6), F.at(s * 1.35, 1.3, -len), {});
  crate(kit, F, 0.8, 0.8, -3, 0.7); barrel(kit, F, -0.9, 0.8, -4.2);
  // little boat
  const hull = new THREE.SphereGeometry(1, 12, 6, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2);
  kit.add('planks', hull, F.at(3.4, 0.35, -len * 0.7, 0.2, 0.9, 0.55, 2.4), { tint: 0x9a6a40, ao: false });
}

export function portalGate(kit, x, y, z, rot) {
  const F = new Frame(x, y, z, rot);
  // stairs
  // (no vertex AO: it treats each low step as the foot of a wall and turned the whole flight black)
  for (let i = 0; i < 6; i++) kit.add('darkStone', box(12 - i * 0.6, 0.45, 2.2), F.at(0, i * 0.45 + 0.2, 9 - i * 1.3), { tint: 0x8a8282, ao: false });
  kit.add('darkStone', box(14, 2.8, 8), F.at(0, 1.3, 0), { yGround: y - 1 });
  // massive pillars with horned caps
  for (const s of [-1, 1]) {
    kit.add('darkStone', box(2.6, 13, 2.6, 2), F.at(s * 5.2, 9.2, -1), { tint: 0x9a9090, aoH: 8 });
    kit.add('darkStone', box(3.3, 1.0, 3.3), F.at(s * 5.2, 3.2, -1), { tint: 0x8a8080 });
    kit.add('darkStone', box(3.3, 1.2, 3.3), F.at(s * 5.2, 15.8, -1), { tint: 0x8a8080 });
    const horn = tube([V(0, 0, 0), V(s * 0.8, 1.6, 0.3), V(s * 2.2, 2.6, 0.2), V(s * 3.2, 2.4, -0.4)], [0.7, 0.55, 0.3, 0.05], 8);
    kit.add('darkStone', horn, F.at(s * 5.8, 16.2, -1), { tint: 0xc0b8b0, ao: false });
    // rune strips
    for (let k = 0; k < 4; k++) kit.add('glow', box(0.25, 1.2, 0.05), F.at(s * 5.2, 5.5 + k * 2.4, 0.33), { ao: false });
  }
  // arch lintel
  kit.add('darkStone', box(13.5, 2.0, 2.8), F.at(0, 17.3, -1), { tint: 0x9a9090 });
  kit.add('darkStone', box(4.0, 3.2, 1.2), F.at(0, 19.4, -1), { tint: 0x8a8080 });
  // braziers
  for (const s of [-1, 1]) {
    kit.add('metal', cyl(0.9, 0.5, 0.9, 10), F.at(s * 7.8, 3.3, 6), { tint: 0x3a3230, ao: false });
    kit.add('metal', cyl(0.18, 0.25, 1.0, 6), F.at(s * 7.8, 2.4, 6), { tint: 0x3a3230, ao: false });
    kit.add('glow', cyl(0.75, 0.75, 0.1, 10), F.at(s * 7.8, 3.72, 6), { ao: false });
    kit.torches = kit.torches || []; const [bx, bz] = F.world(s * 7.8, 6); kit.torches.push(V(bx, y + 4.0, bz));
  }
  for (const s of [-1, 1]) kit.boxCollider(...F.world(s * 5.2, -1), 2.8, 2.8, rot);
  const [px, pz] = F.world(0, -1);
  kit.portal = { x: px, y: y + 9.6, z: pz, rot };
}

/** The Kingsroad gate: a stone arch where the road leaves one zone for the other. */
export function kingsGate(kit, x, y, z, rot) {
  const F = new Frame(x, y, z, rot);
  for (const s of [-1, 1]) { kit.add('stone', box(4, 14, 4, 2), F.at(s * 7, 6, 0), { tint: 0xe6ded2, aoH: 8 }); kit.add('stone', box(5, 1, 5), F.at(s * 7, 13.3, 0), { tint: 0xd8d0c4 }); kit.boxCollider(...F.world(s * 7, 0), 4.4, 4.4, rot); }
  kit.add('stone', box(18, 2.4, 4.4), F.at(0, 14.4, 0), { tint: 0xe6ded2 });
  kit.add('paint', box(5, 1.2, 0.1), F.at(0, 14.4, 2.25), { tint: 0x2a4a9a, ao: false });
  kit.torches = kit.torches || [];
  for (const s of [-1, 1]) { const [bx, bz] = F.world(s * 7, 2.6); kit.torches.push(V(bx, y + 5, bz)); }
}
