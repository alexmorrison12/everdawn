// Places every structure in Everdawn Vale and builds the batched meshes, crops and point-of-interest data.
import * as THREE from 'three';
import { RNG, Simplex } from '../core/noise.js';
import { Kit, Frame, M, box } from './kit.js';
import * as S from './structures.js';
import { PLACES } from './zone.js';
import { blob, MeshBuilder, linColor } from '../engine/geom.js';
import { lambert } from '../engine/materials.js';

const face = (x, z, tx, tz) => Math.atan2(tx - x, tz - z); // Frame rot so local +Z faces (tx,tz)

export function buildSettlements(world) {
  const hf = world.hf, H = (x, z) => hf.heightAt(x, z);
  const kit = new Kit();
  const group = new THREE.Group(); group.name = 'settlements';
  const V = PLACES.village, sq = [V.x, V.z];
  const baseY = (x, z, r = 4) => Math.min(H(x, z), H(x + r, z), H(x - r, z), H(x, z + r), H(x, z - r));
  const poi = {};

  // ---------- Dawnhollow ----------
  const put = (fn, x, z, opts, r = 4) => fn(kit, x, baseY(x, z, r), z, face(x, z, ...sq), opts);
  S.inn(kit, -16, baseY(-16, 126, 6), 126, face(-16, 126, ...sq));
  poi.inn = { x: -16, z: 126 };
  S.chapel(kit, 42, baseY(42, 120, 6), 120, face(42, 120, ...sq));
  S.smithy(kit, 38, baseY(38, 173, 4), 173, face(38, 173, ...sq));
  poi.smithy = { x: 38, z: 173 };
  put(S.house, -24, 172, { seed: 1, w: 7.5, d: 6, roof: 'roofBlue' });
  put(S.house, 6, 188, { seed: 2, w: 8, d: 6.5, roof: 'roofRed', shutter: 0x6a8a3a });
  put(S.house, -46, 160, { seed: 3, w: 7, d: 6, roof: 'roofBlue', floors: 1, pitch: 0.75 });
  put(S.house, 64, 163, { seed: 4, w: 7.5, d: 6, roof: 'roofBlue', shutter: 0x8a3a3a });
  S.house(kit, -10, baseY(-10, 100), 100, face(-10, 100, 14, 100), { seed: 5, w: 7, d: 6, roof: 'roofRed' });
  put(S.house, 30, 205, { seed: 6, w: 7, d: 6, roof: 'roofBlue', floors: 1, pitch: 0.8 });
  put(S.house, -30, 200, { seed: 7, w: 8, d: 6, roof: 'thatch', floors: 1, pitch: 0.8, shutter: 0x6a5a3a });
  S.watchtower(kit, 30, baseY(30, 98, 3), 98, face(30, 98, 14, 98));
  S.statue(kit, V.x, H(V.x, V.z), V.z, 0);
  S.well(kit, 24, H(24, 160), 160);
  S.stall(kit, -3, H(-3, 140), 140, face(-3, 140, ...sq), 0xc04040);
  S.stall(kit, 23, H(23, 138), 138, face(23, 138, ...sq), 0x3a6ab0);
  S.stall(kit, -6, H(-6, 161), 161, face(-6, 161, ...sq), 0xd0a030);
  // mailbox by the inn door
  { const F = new Frame(-16, 0, 126, face(-16, 126, ...sq)); const [mx, mz] = F.world(4.4, 8.6); S.mailbox(kit, mx, H(mx, mz), mz, face(mx, mz, ...sq)); poi.mailbox = { x: mx, z: mz }; }
  S.signpost(kit, 20, H(20, 116), 116, 0.3);
  // lamp posts around the square and along roads
  for (let i = 0; i < 8; i++) {
    const a = i / 8 * Math.PI * 2 + 0.2, x = V.x + Math.cos(a) * 16.5, z = V.z + Math.sin(a) * 16.5;
    if (hf.maskAt(x, z, 0) > 0.3) continue;
    S.lampPost(kit, x, H(x, z), z, a + Math.PI);
  }
  for (const [x, z] of [[10, 118], [19, 76], [-30, 136], [-62, 132], [46, 138], [80, 132], [60, 118]]) S.lampPost(kit, x, H(x, z), z, 0);
  // props
  const rng = new RNG(33);
  const F0 = new Frame(0, 0, 0, 0);
  for (const [x, z] of [[-8, 132], [30, 150], [45, 180], [-30, 180], [2, 176]]) {
    const y = H(x, z);
    if (rng.chance(0.5)) S.barrel(kit, F0, x, y, z); else S.crate(kit, F0, x, y, z, 0.8, rng.range(0, 3));
    S.crate(kit, F0, x + 1, y, z + 0.6, 0.6, rng.range(0, 3));
  }
  S.cart(kit, 50, H(50, 148), 148, 1.1);
  S.cart(kit, -38, H(-38, 146), 146, -0.4);
  S.bench(kit, F0, 2, H(2, 159), 159, 0.3); S.bench(kit, F0, 18, H(18, 142), 142, 2.4);

  // ---------- Goldfield Farms ----------
  S.house(kit, -148, baseY(-148, 115), 115, Math.PI, { seed: 11, w: 8, d: 6.5, roof: 'thatch', floors: 1, pitch: 0.8, shutter: 0x5a7a3a });
  S.barn(kit, -100, baseY(-100, 134, 5), 134, Math.PI);
  S.windmill(kit, -226, baseY(-226, 108, 3), 108, face(-226, 108, -150, 100));
  poi.farm = { x: -148, z: 115 };
  for (const [x, z, s] of [[-92, 146, 1], [-108, 148, 0.8], [-160, 124, 0.9], [-215, 122, 1.1]]) S.haystack(kit, x, H(x, z), z, s);
  S.cart(kit, -120, H(-120, 110), 110, 0.3);
  // fences around fields
  for (const f of hf.fields) {
    const x0 = f.x - f.w / 2 - 1.5, x1 = f.x + f.w / 2 + 1.5, z0 = f.z - f.l / 2 - 1.5, z1 = f.z + f.l / 2 + 1.5;
    S.fence(kit, [[x0, z0], [x1, z0], [x1, z1]], H);
    S.fence(kit, [[x0 + 5, z1], [x0, z1], [x0, z0]], H);
  }

  // ---------- Mirrormere ----------
  S.dock(kit, -52, 0, 16, Math.PI * 0.92, 18);
  S.house(kit, -40, baseY(-40, 30), 30, face(-40, 30, -52, 16), { seed: 21, w: 5.5, d: 5, roof: 'thatch', floors: 1, pitch: 0.85, chimney: true });
  poi.dock = { x: -45, z: 20 };

  // ---------- Candlerock Mine ----------
  const MI = PLACES.mine;
  S.mineEntrance(kit, MI.x, H(MI.x, MI.z + 4), MI.z + 2, 0);
  poi.mine = { x: MI.x, z: MI.z + 6 };

  // ---------- Redcloak Ruins ----------
  const R = PLACES.ruins;
  S.ruins(kit, R.x, H(R.x, R.z), R.z, H);

  // ---------- Kingsroad Pass: the road east to the Crownlands ----------
  const KP = PLACES.pass;
  S.kingsGate(kit, KP.x, H(KP.x, KP.z), KP.z, face(KP.x, KP.z, KP.x - 40, KP.z));
  S.signpost(kit, 292, H(292, 72), 72, -1.2);

  // ---------- The Ember Maw ----------
  const P = PLACES.portal;
  S.portalGate(kit, P.x, H(P.x, P.z + 2), P.z, face(P.x, P.z, P.x, P.z + 40));

  kit.build(group);
  for (const o of kit.extraObjects || []) group.add(o);
  group.add(buildCrops(hf));

  return {
    group, colliders: kit.colliders, animated: kit.animated || [],
    lights: { lamps: kit.lamps || [], torches: kit.torches || [], forges: kit.forges || [], chimneys: kit.chimneys || [], campfires: kit.campfires || [] },
    statue: kit.statueSpot, portal: kit.portal, poi,
  };
}

// ---------- crops: wheat, pumpkins, cabbages ----------
export function buildCrops(hf) {
  const g = new THREE.Group(); g.name = 'crops';
  const rng = new RNG(88), nz = new Simplex(88);
  // wheat clump geometry
  // Near LOD: six open 3-sided stalks with 4-sided ears (~72 tris; the fields hold ~6.6k clumps).
  const wb = new MeshBuilder([{ name: 'sway', size: 1 }]);
  for (let i = 0; i < 6; i++) {
    const a = i / 6 * Math.PI * 2, r = 0.12 + (i % 2) * 0.08, x = Math.cos(a) * r, z = Math.sin(a) * r, h = 0.95 + (i % 3) * 0.12;
    const stalk = new THREE.CylinderGeometry(0.012, 0.018, h, 3, 1, true); stalk.translate(0, h / 2, 0);
    wb.add(stalk, M(x, 0, z, 0, 1, 1, 1, (i % 3 - 1) * 0.12, (i % 2 - 0.5) * 0.15), linColor(0xb09040), { extra: { sway: p => p.y } });
    const ear = new THREE.CylinderGeometry(0.035, 0.02, 0.22, 4, 1, true); ear.translate(0, h + 0.08, 0);
    wb.add(ear, M(x, 0, z, 0, 1, 1, 1, (i % 3 - 1) * 0.12, (i % 2 - 0.5) * 0.15), linColor(0xf0c860), { extra: { sway: p => p.y } });
  }
  const wheatGeo = wb.build();
  // Far LOD: two crossed cards, stalk-coloured at the root and golden at the ears (4 tris).
  const fb = new MeshBuilder([{ name: 'sway', size: 1 }]);
  for (const ry of [0, Math.PI / 2]) {
    const card = new THREE.PlaneGeometry(0.46, 1.12, 1, 1); card.translate(0, 0.56, 0);
    fb.add(card, M(0, 0, 0, ry), p => { const k = Math.min(1, p.y / 1.12); const lo = linColor(0x8a7030), hi = linColor(0xf0c860); return lo.map((c, i) => c + (hi[i] - c) * k); }, { extra: { sway: p => p.y } });
  }
  const wheatFar = fb.build();
  const wheatMat = lambert({ vertexColors: true }, {
    wrap: 0.6, trans: 0.3, key: 'wheat',
    vertex: vs => vs.replace('#include <common>', '#include <common>\nattribute float sway;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        { vec3 ip = instanceMatrix[3].xyz; float w = sin(uTime * 1.8 + ip.x * 0.25 + ip.z * 0.18) * 0.5 + sin(uTime * 3.1 + ip.x * 0.7) * 0.2;
          transformed.xz += uWind * w * sway * sway * 0.18; }`),
  });
  const pumpkin = blob(0.42, 2, d => 1 + Math.abs(Math.sin(Math.atan2(d.z, d.x) * 5)) * -0.08, [1, 0.72, 1]);
  const pb = new MeshBuilder(); pb.add(pumpkin, null, p => { const k = 0.75 + p.y * 0.6; return linColor(0xe07020).map(c => c * k); });
  pb.add(new THREE.CylinderGeometry(0.04, 0.06, 0.22, 5), M(0, 0.36, 0, 0, 1, 1, 1, 0.2), linColor(0x4a6a20));
  pb.add(blob(0.3, 0, null, [1, 0.25, 1]), M(0.35, 0.05, 0.2), linColor(0x3a7a28));
  const pumpkinGeo = pb.build();
  const cb = new MeshBuilder();
  cb.add(blob(0.3, 1, d => 1 + Math.sin(d.x * 9) * 0.05, [1, 0.8, 1]), M(0, 0.2, 0), p => { const k = 0.7 + p.y; return linColor(0x7ab048).map(c => c * k); });
  for (let i = 0; i < 5; i++) { const a = i / 5 * 6.28; cb.add(blob(0.26, 0, null, [1, 0.3, 1]), M(Math.cos(a) * 0.25, 0.08, Math.sin(a) * 0.25, a, 1, 1, 1, 0.5), linColor(0x5a9a38)); }
  const cabbageGeo = cb.build();
  const vcMat = lambert({ vertexColors: true }, { wrap: 0.45, key: 'crop' });

  const kinds = ['wheat', 'wheat', 'pumpkin', 'wheat', 'cabbage'];
  hf.fields.forEach((f, fi) => {
    const kind = kinds[fi % kinds.length];
    const sp = kind === 'wheat' ? 0.62 : kind === 'pumpkin' ? 1.7 : 1.15;
    const list = [];
    for (let z = f.z - f.l / 2 + 1; z < f.z + f.l / 2 - 0.6; z += sp) for (let x = f.x - f.w / 2 + 1; x < f.x + f.w / 2 - 0.6; x += sp) {
      if (kind !== 'wheat' && ((Math.round((z - f.z) / sp) % 2) === 0) && rng.chance(0.3)) continue;
      const jx = x + rng.range(-0.2, 0.2) * sp, jz = z + rng.range(-0.2, 0.2) * sp;
      if (kind === 'wheat' && nz.noise2(jx / 8, jz / 8) < -0.55) continue; // trampled patches
      list.push([jx, hf.heightAt(jx, jz), jz, rng.range(0, 6.28), rng.range(0.8, 1.2)]);
    }
    const geo = kind === 'wheat' ? wheatGeo : kind === 'pumpkin' ? pumpkinGeo : cabbageGeo;
    const im = new THREE.InstancedMesh(geo, kind === 'wheat' ? wheatMat : vcMat, list.length);
    const m = new THREE.Matrix4();
    list.forEach((p, i) => { im.setMatrixAt(i, M(p[0], p[1] - 0.05, p[2], p[3], p[4], p[4] * (kind === 'wheat' ? rng.range(0.85, 1.1) : 1), p[4])); });
    void m;
    im.castShadow = kind !== 'wheat'; im.receiveShadow = true;
    im.computeBoundingSphere();
    if (kind === 'wheat') { im.userData.lod = [wheatGeo, wheatFar]; im.material.side = THREE.DoubleSide; }
    g.add(im);
  });
  // swap whole wheat fields to crossed cards past ~130 m (hysteresis avoids flicker at the boundary)
  const fields = g.children.filter(c => c.userData.lod);
  g.userData.update = cam => {
    for (const im of fields) {
      const c = im.boundingSphere.center, d = Math.hypot(cam.x - c.x, cam.z - c.z) - im.boundingSphere.radius;
      const far = im.geometry === im.userData.lod[1];
      if (!far && d > 135) im.geometry = im.userData.lod[1];
      else if (far && d < 120) im.geometry = im.userData.lod[0];
    }
  };
  return g;
}
