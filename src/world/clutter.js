// Scatter layer: faceted boulders, flower patches, red-cap mushrooms, stumps and fallen logs.
// All instanced, bucketed by 96 m cells for culling, placed from the height-field masks.
import * as THREE from 'three';
import { RNG, Simplex, smoothstep } from '../core/noise.js';
import { MeshBuilder, blob, tube, linColor } from '../engine/geom.js';
import { lambert } from '../engine/materials.js';
import { M } from './heightfield.js';
import { PLACES } from './zone.js';

const CELL = 160;

function rockGeo(seed) {
  const nz = new Simplex(seed);
  let g = blob(1, 1, d => 1 + nz.noise3(d.x * 1.6, d.y * 1.6, d.z * 1.6) * 0.32, [1.2, 0.72, 1]);
  g = g.toNonIndexed(); g.computeVertexNormals();
  const b = new MeshBuilder();
  const base = linColor(0x8a8278), moss = linColor(0x5a7a34), dark = linColor(0x4a4540);
  b.add(g, null, (p, n) => { const up = Math.max(0, n.y); const k = 0.75 + p.y * 0.25; const c = base.map((v, i) => v * k * (0.92 + ((p.x * 13.1 + p.z * 7.7) % 1 + 1) % 1 * 0.16)); const mt = smoothstep(0.55, 0.85, up) * 0.85; return c.map((v, i) => v + (moss[i] - v) * mt).map((v, i) => p.y < -0.3 ? v * 0.8 + dark[i] * 0.2 : v); });
  return b.build();
}

function flowerGeo(color, seed) {
  const rng = new RNG(seed), b = new MeshBuilder([{ name: 'sway', size: 1 }]);
  const petal = linColor(color), center = linColor(0xf0d040), stem = linColor(0x4a8a30);
  for (let i = 0; i < 5; i++) {
    const x = rng.range(-0.25, 0.25), z = rng.range(-0.25, 0.25), h = rng.range(0.22, 0.42);
    const st = new THREE.CylinderGeometry(0.008, 0.012, h, 3); st.translate(x, h / 2, z);
    b.add(st, null, stem, { extra: { sway: p => p.y } });
    const head = new THREE.OctahedronGeometry(0.055, 0); head.scale(1, 0.45, 1); head.translate(x, h + 0.01, z);
    b.add(head, null, petal, { extra: { sway: () => h } });
    const c = new THREE.OctahedronGeometry(0.022, 0); c.translate(x, h + 0.035, z);
    b.add(c, null, center, { extra: { sway: () => h } });
    // two leaves
    const lf = new THREE.PlaneGeometry(0.06, 0.14); lf.translate(0, 0.07, 0); lf.rotateZ(0.6); lf.rotateY(rng.range(0, 6)); lf.translate(x, 0.02, z);
    b.add(lf, null, stem, { extra: { sway: () => 0.05 } });
  }
  return b.build();
}

function mushroomGeo(seed) {
  const rng = new RNG(seed), b = new MeshBuilder();
  for (let i = 0; i < 4; i++) {
    const x = rng.range(-0.35, 0.35), z = rng.range(-0.35, 0.35), s = rng.range(0.6, 1.3);
    const st = new THREE.CylinderGeometry(0.035 * s, 0.05 * s, 0.22 * s, 6); st.translate(x, 0.11 * s, z);
    b.add(st, null, linColor(0xf0e8d8));
    const cap = new THREE.SphereGeometry(0.11 * s, 10, 5, 0, Math.PI * 2, 0, Math.PI / 2); cap.scale(1, 0.75, 1); cap.translate(x, 0.2 * s, z);
    b.add(cap, null, (p, n) => { const spot = Math.sin(p.x * 90) * Math.sin(p.z * 90) > 0.72 && n.y > 0.3; return linColor(spot ? 0xfff4e0 : 0xd02818); });
  }
  return b.build();
}

function stumpGeo(seed) {
  const rng = new RNG(seed), b = new MeshBuilder();
  const g = new THREE.CylinderGeometry(0.45, 0.62, 0.7, 9, 1); g.translate(0, 0.3, 0);
  b.add(g, null, (p, n) => n.y > 0.9 ? linColor(0xc8a070) : linColor(0x6a4a30));
  for (let i = 0; i < 4; i++) { const a = i / 4 * 6.28 + rng.range(-0.3, 0.3); b.add(tube([new THREE.Vector3(Math.cos(a) * 0.4, 0.3, Math.sin(a) * 0.4), new THREE.Vector3(Math.cos(a) * 0.8, -0.05, Math.sin(a) * 0.8)], [0.16, 0.05], 5, false), null, linColor(0x5a3e28)); }
  return b.build();
}

function logGeo(seed) {
  const rng = new RNG(seed), b = new MeshBuilder();
  const L = rng.range(3, 5);
  const pts = [new THREE.Vector3(-L / 2, 0.3, 0), new THREE.Vector3(0, 0.34, rng.range(-0.2, 0.2)), new THREE.Vector3(L / 2, 0.28, 0)];
  b.add(tube(pts, [0.38, 0.36, 0.32], 8, true), null, (p, n) => linColor(Math.abs(n.x) > 0.9 ? 0xc8a070 : 0x6a4a30));
  const moss = new THREE.SphereGeometry(0.34, 8, 4, 0, Math.PI * 2, 0, Math.PI / 3); moss.scale(L * 0.9, 0.5, 1.1); moss.translate(0, 0.48, 0);
  b.add(moss, null, linColor(0x5a8a34));
  return b.build();
}

export class Clutter {
  constructor(hf, exclusions = []) {
    this.hf = hf; this.excl = exclusions;
    this.group = new THREE.Group(); this.group.name = 'clutter';
    this.cells = [];
    const vc = (k, o = {}) => lambert({ vertexColors: true, ...o.params }, { wrap: 0.45, key: k, ...o.opts });
    const sway = vs => vs.replace('#include <common>', '#include <common>\nattribute float sway;').replace('#include <begin_vertex>', `#include <begin_vertex>
      { vec3 ip = instanceMatrix[3].xyz; transformed.xz += uWind * sin(uTime * 2.3 + ip.x * 0.6 + ip.z * 0.4) * sway * 0.12; }`);
    this.kinds = [
      { geo: [rockGeo(1), rockGeo(2), rockGeo(3)], mat: vc('rock', { params: { flatShading: true } }), shadow: true },
      { geo: [flowerGeo(0xffffff, 4), flowerGeo(0xffd830, 5), flowerGeo(0xe03040, 6), flowerGeo(0xa060e0, 7)], mat: vc('flower', { opts: { trans: 0.3, vertex: sway } }), shadow: false, flower: true },
      { geo: [mushroomGeo(8)], mat: vc('mushroom', { opts: { rim: 0.2 } }), shadow: false },
      { geo: [stumpGeo(9)], mat: vc('stump'), shadow: false },
      { geo: [logGeo(10), logGeo(11)], mat: vc('log'), shadow: false },
    ];
    for (const k of this.kinds) k.mat.side = k.flower ? THREE.DoubleSide : THREE.FrontSide;
    this.colliders = [];
  }
  excluded(x, z) { for (const e of this.excl) if ((x - e.x) ** 2 + (z - e.z) ** 2 < e.r * e.r) return true; return false; }

  scatter() {
    const hf = this.hf, rng = new RNG(31337), n2 = new Simplex(4242);
    const items = this.kinds.map(k => k.geo.map(() => []));
    const put = (ki, x, z, s, rot, sink = 0.05) => { const v = rng.int(0, this.kinds[ki].geo.length - 1); items[ki][v].push([x, hf.heightAt(x, z) - sink * s, z, rot, s]); };
    for (let z = -430; z < 430; z += 3) for (let x = -430; x < 430; x += 3) {
      const px = x + rng.range(0, 3), pz = z + rng.range(0, 3);
      const h = hf.heightAt(px, pz); if (h < 0.5) continue;
      if (this.excluded(px, pz)) continue;
      const road = hf.maskAt(px, pz, M.ROAD), farm = hf.maskAt(px, pz, M.FARM), cob = hf.maskAt(px, pz, M.COBBLE);
      if (road > 0.2 || farm > 0.2 || cob > 0.2) continue;
      const slope = hf.slopeAt(px, pz), forest = hf.maskAt(px, pz, M.FOREST), meadow = hf.maskAt(px, pz, M.MEADOW), ash = hf.maskAt(px, pz, M.ASH), web = hf.maskAt(px, pz, M.WEB);
      const r = rng.next();
      // boulders: slopes, cliff feet, mountains, forests
      const rockP = 0.004 + smoothstep(0.2, 0.5, slope) * 0.05 + (h > 25 ? 0.01 : 0) + forest * 0.006;
      if (r < rockP) { const s = rng.range(0.5, 1.6) * (slope > 0.35 ? 1.8 : 1); put(0, px, pz, s, rng.range(0, 6.28), 0.3); if (s > 1.1) this.colliders.push({ type: 'circle', x: px, z: pz, r: s * 0.9 }); continue; }
      if (ash > 0.3 || slope > 0.45) continue;
      // flowers in meadows and road verges
      const fl = meadow * 0.5 * smoothstep(0.1, 0.6, n2.noise2(px / 13, pz / 13) + 0.3) + (road > 0.02 && road < 0.2 ? 0.08 : 0);
      if (r < rockP + fl * (1 - forest)) { put(1, px, pz, rng.range(0.8, 1.4), rng.range(0, 6.28), 0); continue; }
      if (forest > 0.3 && r < rockP + 0.012 + web * 0.01) { put(2, px, pz, rng.range(0.7, 1.4), rng.range(0, 6.28), 0); continue; }
      if (forest > 0.4 && r > 0.994) { put(3, px, pz, rng.range(0.8, 1.3), rng.range(0, 6.28), 0.1); this.colliders.push({ type: 'circle', x: px, z: pz, r: 0.6 }); continue; }
      if (forest > 0.4 && r > 0.991) { put(4, px, pz, rng.range(0.8, 1.2), rng.range(0, 6.28), 0.15); continue; }
    }
    // bucket
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), p = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
    let total = 0;
    this.kinds.forEach((k, ki) => k.geo.forEach((geo, vi) => {
      const buckets = new Map();
      for (const it of items[ki][vi]) { const key = `${Math.floor(it[0] / CELL)},${Math.floor(it[2] / CELL)}`; if (!buckets.has(key)) buckets.set(key, []); buckets.get(key).push(it); }
      for (const [key, list] of buckets) {
        const im = new THREE.InstancedMesh(geo, k.mat, list.length);
        list.forEach((it, i) => { q.setFromAxisAngle(up, it[3]); sc.setScalar(it[4]); p.set(it[0], it[1], it[2]); m4.compose(p, q, sc); im.setMatrixAt(i, m4); });
        im.castShadow = k.shadow; im.receiveShadow = true; im.computeBoundingSphere();
        const [cx, cz] = key.split(',').map(Number);
        this.cells.push({ im, x: (cx + 0.5) * CELL, z: (cz + 0.5) * CELL, flower: k.flower });
        this.group.add(im);
        total += list.length;
      }
    }));
    return total;
  }
  update(cam) {
    for (const c of this.cells) {
      const d = Math.hypot(cam.x - c.x, cam.z - c.z);
      c.im.visible = d < (c.flower ? 150 : 420);
    }
  }
}
