// The Crownlands: green hills and farmland east of Everdawn Vale, walled by mountains on three sides and open to the
// sea on the fourth, where Aurelion, the Crown City, sits on its harbour: white walls and blue roofs, a canal, a
// cathedral, the royal keep, a trade district, an old town, a dwarven forge quarter and a harbour full of ships.
import * as THREE from 'three';
import { Heightfield } from './heightfield.js';
import { MAP, WATER_Y } from './zone.js';
import { smoothstep, lerp, clamp, catmull, distSeg2, RNG } from '../core/noise.js';
import { Kit, Frame, M as MX, box, cyl, cone, gableRoof } from './kit.js';
import * as S from './structures.js';
import { buildCrops } from './village.js';

const H = MAP.half;
export const CITY = { x: 120, z: 0, r: 150, h: 3.2 };
const CANAL = [[80, -470], [84, -330], [96, -230], [100, -150], [100, -40], [180, -40], [330, -40]];
const BRIDGES = [{ x: 130, z: -40, ax: 'z' }, { x: 212, z: -40, ax: 'z' }, { x: 100, z: -95, ax: 'x' }]; // land crossings over the canal (ax: the direction you walk)

export const CROWN = {
  name: 'The Crownlands', city: 'Aurelion',
  places: {
    city: CITY, gate: { x: -30, z: 0 }, southGate: { x: 120, z: 150 }, plaza: { x: 120, z: 0 }, harbor: { x: 268, z: 0 },
    cathedral: { x: 150, z: -100 }, keep: { x: 196, z: -88 }, mage: { x: 44, z: -96 }, forge: { x: 196, z: 78 }, inn: { x: 160, z: 42 }, bank: { x: 76, z: 36 },
    quarry: { x: -262, z: -196, r: 40 }, farm: { x: -150, z: 104, r: 70 }, camp: { x: -176, z: 196, r: 40 }, grove: { x: -10, z: -262, r: 60 }, coast: { x: 236, z: 246, r: 40 },
    entrance: { x: -408, z: 4 }, // the Kingsroad gate back to Everdawn Vale
  },
  roads: [
    { w: 6, pts: [[-470, 4], [-400, 4], [-330, -4], [-260, -2], [-190, 4], [-130, 2], [-44, 0]] },          // the Kingsroad
    { w: 4, pts: [[-190, 4], [-176, 56], [-150, 104], [-150, 150], [-176, 190]] },                         // farms and the camp
    { w: 4, pts: [[-330, -4], [-318, -70], [-290, -140], [-266, -178]] },                                  // the quarry
    { w: 4, pts: [[120, 152], [132, 196], [180, 226], [230, 236]] },                                       // south gate to the coast
    { w: 3.6, pts: [[-44, 0], [-60, -60], [-40, -150], [-14, -236]] },                                      // the thornwood grove
  ],
  fields: [
    { x: -118, z: 70, w: 40, l: 28, a: 0.1 }, { x: -206, z: 118, w: 36, l: 30, a: -0.05 }, { x: -110, z: 132, w: 34, l: 24, a: 0.08 },
    { x: -230, z: 60, w: 30, l: 24, a: 0 }, { x: -70, z: 100, w: 26, l: 22, a: -0.1 },
  ],
};

// ---------------------------------------------------------------- terrain
export class CrownHeightfield extends Heightfield {
  constructor(seed = 11) {
    super(seed);
    this.roadLines = CROWN.roads.map(r => ({ w: r.w, pts: catmull(r.pts, 10) }));
    this.canal = CANAL; // straight stretches: the embankments follow them exactly
  }
  canalDist(x, z) {
    let best = 1e9; const L = this.canal;
    for (let i = 0; i < L.length - 1; i++) { const d = distSeg2(x, z, L[i][0], L[i][1], L[i + 1][0], L[i + 1][1]); if (d < best) best = d; }
    return best;
  }
  rawHeight(x, z) {
    const n = this.noise, n2 = this.n2;
    let h = 7 + n.fbm2(x / 170, z / 170, 4) * 7.5 + n.fbm2(x / 42, z / 42, 3) * 1.3;
    // mountains west, north and south; none toward the sea. The Kingsroad cuts a pass through the west wall.
    const r = Math.hypot((x - 40) / 470, z / 440) + n.noise2(x / 95, z / 95) * 0.07;
    const pass = (1 - smoothstep(18, 52, Math.abs(z - 3 + n.noise2(x / 60, 1.7) * 8))) * smoothstep(-250, -330, x);
    const wall = smoothstep(0.8, 1.18, r) * (1 - smoothstep(140, 300, x)) * (1 - pass * 0.94);
    this._wall = wall;
    if (wall > 0) {
      const wx = x + n.noise2(x / 190, z / 190) * 70, wz = z + n.noise2(x / 190 + 5.2, z / 190 - 3.1) * 70;
      const mass = n2.fbm2(wx / 230, wz / 230, 3) * 0.5 + 0.5, rid = n2.ridged2(wx / 140, wz / 140, 3);
      h += Math.pow(wall, 1.6) * (40 + mass * 85 + rid * rid * 40 + n.fbm2(x / 48, z / 48, 3) * 7);
    }
    // the sea: the land falls away east of the coast (a bay sweeps in to the south-east)
    const coastX = 288 + n.noise2(z / 110, 3.1) * 18 - Math.max(0, z - 150) * 0.45;
    const sea = smoothstep(coastX - 26, coastX + 22, x);
    h = lerp(h, -7, sea);
    h = Math.max(h, sea > 0.02 ? -8 : 0.7);
    // the city: a low, flat terrace by the harbour (streets and plazas are cobble)
    const dc = Math.hypot(x - CITY.x, z - CITY.z);
    const city = 1 - smoothstep(CITY.r * 1.0, CITY.r * 1.28, dc);
    if (city > 0 && x < 286) h = lerp(h, CITY.h + n.noise2(x / 30, z / 30) * 0.12, city);
    // the harbour quay and its docks
    if (x > 236 && x < 290 && Math.abs(z) < 104) h = lerp(h, 2.3, smoothstep(236, 250, x) * (1 - smoothstep(282, 290, x)));
    // the river comes down from the northern mountains and runs through the city as a canal to the sea
    const dcan = this.canalDist(x, z), inCity = dc < CITY.r + 8 && z > -160;
    const onBridge = BRIDGES.some(b => (b.ax === 'z' ? Math.abs(x - b.x) < 5.5 && Math.abs(z - b.z) < 12 : Math.abs(z - b.z) < 5.5 && Math.abs(x - b.x) < 12));
    if (!onBridge) {
      const w0 = inCity ? 5.2 : 6.5, w1 = inCity ? 6.4 : 13;
      if (dcan < w1) h = Math.min(h, lerp(-2.6, h, smoothstep(w0, w1, dcan)));
    }
    // a quarry pit and a farm valley
    const Q = CROWN.places.quarry, dq = Math.hypot(x - Q.x, z - Q.z);
    if (dq < 48) h = lerp(h, h - 7 * (1 - dq / 48) ** 1.4, 1);
    const F = CROWN.places.farm, df = Math.hypot(x - F.x, z - F.z);
    h = lerp(h, 6.5 + n.fbm2(x / 150, z / 150, 2) * 2, (1 - smoothstep(F.r * 0.8, F.r * 1.5, df)) * 0.75);
    return h;
  }
  bakeMasks(road) {
    const m = this.mask, n = this.noise, n2 = this.n2, S1 = MAP.size + 1;
    const set = (k, c, v) => { m[k * 8 + c] = clamp(Math.round(v * 255), 0, 255); };
    this.fields = CROWN.fields;
    for (let j = 0; j < S1; j++) {
      const z = j - H;
      for (let i = 0; i < S1; i++) {
        const x = i - H, k = j * S1 + i, hh = this.h[k];
        set(k, 0, road[k]);
        let fv = 0;
        for (const f of this.fields) {
          const c = Math.cos(f.a), s = Math.sin(f.a), lx = (x - f.x) * c - (z - f.z) * s, lz = (x - f.x) * s + (z - f.z) * c;
          fv = Math.max(fv, smoothstep(1.5, -1.5, Math.max(Math.abs(lx) - f.w * 0.5, Math.abs(lz) - f.l * 0.5) + n.noise2(x / 6, z / 6) * 1.2));
        }
        set(k, 1, fv * (1 - road[k]));
        // the whole city is paved (with garden plots here and there); the quay too
        const dc = Math.hypot(x - CITY.x, z - CITY.z);
        const garden = smoothstep(0.72, 0.86, n2.noise2(x / 16, z / 16)) * (dc > 40 ? 1 : 0);
        const cob = Math.max(smoothstep(CITY.r + 2, CITY.r - 4, dc) * (1 - garden * 0.85), x > 236 && x < 288 && Math.abs(z) < 104 ? 1 : 0, smoothstep(0.3, 0.9, road[k]) * smoothstep(CITY.r + 70, CITY.r + 20, dc));
        set(k, 2, hh > WATER_Y + 0.2 ? cob : 0);
        const fd = forestCrown(x, z, n2);
        set(k, 3, fd * (1 - road[k]) * (1 - fv) * (1 - cob));
        const sand = smoothstep(2.4, 0.4, hh - WATER_Y + n.noise2(x / 9, z / 9) * 0.8) * (x > 180 || this.canalDist(x, z) > 20 ? 1 : 0) * (1 - cob);
        set(k, 4, sand);
        set(k, 5, 0); set(k, 6, 0);
        const meadow = smoothstep(0.3, 0.72, n2.noise2(x / 45, z / 45)) * (1 - fd) * (1 - road[k]) * (1 - fv) * (1 - cob);
        set(k, 7, meadow);
      }
    }
  }
}
function forestCrown(x, z, n2) {
  const g = n2.noise2(x / 70 + 3.1, z / 70 - 9.7);
  const rim = Math.hypot((x - 40) / 470, z / 440);
  let d = Math.max(smoothstep(0.2, 0.55, g) * smoothstep(0.55, 0.82, rim) * smoothstep(1.2, 0.98, rim), smoothstep(0.5, 0.78, g) * 0.75);
  const G = CROWN.places.grove; d = Math.max(d, smoothstep(G.r + 30, G.r - 20, Math.hypot(x - G.x, z - G.z)));
  d *= smoothstep(CITY.r + 20, CITY.r + 70, Math.hypot(x - CITY.x, z - CITY.z)); // the city keeps its fields of fire
  const F = CROWN.places.farm; d *= smoothstep(F.r * 0.9, F.r * 1.4, Math.hypot(x - F.x, z - F.z));
  d *= smoothstep(0, 14, Math.abs(z - 3)) + (x > -60 ? 1 : 0); // the Kingsroad stays clear
  return clamp(d * (x > 250 ? 0 : 1), 0, 1);
}

// ---------------------------------------------------------------- the city
const V = (x, y, z) => new THREE.Vector3(x, y, z);
const face = (x, z, tx, tz) => Math.atan2(tx - x, tz - z);
const WHITE = 0xf2ece2; // plaster
// Aurelion's stone is pale: tints above 1 lift the kit's grey stone texture toward white (linear rgb)
const STONE = [1.5, 1.46, 1.38], PALE = [1.62, 1.58, 1.5], TRIM = [1.3, 1.26, 1.2];

export function buildCapital(world) {
  const hf = world.hf, Hh = (x, z) => hf.heightAt(x, z), C = CITY;
  const group = new THREE.Group(); group.name = 'aurelion';
  const kits = {}, K = name => (kits[name] ||= new Kit());
  const all = () => Object.values(kits);
  const rng = new RNG(1717);
  const poi = {};
  const lights = { lamps: [], torches: [], forges: [], chimneys: [], campfires: [] };
  const gy = (x, z, r = 4) => Math.min(Hh(x, z), Hh(x + r, z), Hh(x - r, z), Hh(x, z + r), Hh(x, z - r));

  // ---------- walls, towers and gates ----------
  const W = K('walls');
  const gates = [{ a: Math.PI, half: 0.058 }, { a: Math.PI / 2, half: 0.045 }, { a: Math.atan2(-150, -20) + Math.PI * 2, half: 0.05 }];
  const a0 = 0.62, a1 = Math.PI * 2 - 0.62;
  wallRing(W, C.x, C.z, C.r, a0, a1, 12, gates, Hh);
  for (let a = a0; a <= a1 + 1e-3; a += (a1 - a0) / 12) {
    if (gates.some(g => Math.abs(angDiff(a, g.a)) < g.half + 0.03)) continue;
    const x = C.x + Math.cos(a) * C.r, z = C.z + Math.sin(a) * C.r;
    roundTower(W, x, Hh(x, z), z, 4.6, 17, 'roofBlue');
  }
  // sea walls from the ring down to the water, ending in lighthouses
  for (const s of [-1, 1]) {
    const x0 = C.x + Math.cos(a0) * C.r, z0 = s * Math.sin(a0) * C.r;
    straightWall(W, x0, z0, 300, s * 108, 10, Hh);
    roundTower(W, 300, Math.max(0.5, Hh(300, s * 108)), s * 108, 5.2, 20, 'roofBlue');
    lights.torches.push(V(300, Math.max(0.5, Hh(300, s * 108)) + 21.5, s * 108));
  }
  // the great west gate: twin towers and an arch
  gatehouse(W, -30, Hh(-30, 0), 0, face(-30, 0, -80, 0), lights, 24);
  gatehouse(W, C.x, Hh(C.x, 150), 150, face(C.x, 150, C.x, 200), lights, 17);
  // the water gate where the canal passes under the north wall
  { const a = gates[2].a, x = C.x + Math.cos(a) * C.r, z = C.z + Math.sin(a) * C.r, F = new Frame(x, 3.2, z, face(x, z, C.x, C.z));
    W.add('stone', box(14, 5, 3.4, 2), F.at(0, 11.5, 0), { tint: STONE, ao: false });
    for (const sx of [-1, 1]) roundTower(W, ...F.world(sx * 8.5, 0).flatMap((v, i) => (i === 0 ? [v, 3.2] : [v])), 4.2, 16, 'roofBlue'); }

  // ---------- the Valley of Kings: plinths for the statues outside the west gate ----------
  const VK = K('valley');
  const statues = [];
  for (let i = 0; i < 3; i++) for (const s of [-1, 1]) {
    const x = -118 + i * 26, z = s * 17, y = Hh(x, z);
    VK.add('stone', box(7, 1.2, 7), MX(x, y + 0.3, z), { tint: STONE, yGround: y });
    VK.add('stone', box(5.2, 4.2, 5.2, 2), MX(x, y + 3, z), { tint: TRIM });
    VK.add('stone', box(6, 0.6, 6), MX(x, y + 5.3, z), { tint: STONE });
    VK.add('metal', box(2.4, 0.8, 0.06), MX(x, y + 3.2, z - s * 2.62, s < 0 ? 0 : Math.PI), { tint: 0xc09838, ao: false });
    VK.circleCollider(x, z, 3.8);
    statues.push({ x, y: y + 5.6, z, rot: face(x, z, x, 0) });
    S.lampPost(VK, x + 13, Hh(x + 13, s * 9), s * 9, 0); lights.lamps.push(V(x + 13, Hh(x + 13, s * 9) + 4, s * 9));
  }

  // ---------- the trade district: shops both sides of the avenue ----------
  const T = K('trade');
  const roofs = ['roofBlue', 'roofBlue', 'roofBlue', 'roofRed'];
  for (let i = 0; i < 6; i++) for (const s of [-1, 1]) {
    const x = -8 + i * 16, z = s * 24 + rng.range(-1, 1);
    const r = house(T, x, gy(x, z), z, face(x, z, x, 0), { seed: 100 + i * 2 + (s > 0 ? 1 : 0), w: rng.range(9, 12), d: rng.range(7, 8.5), floors: rng.chance(0.5) ? 3 : 2, roof: roofs[i % 4], plaster: WHITE, shutter: 0x2a4a7a });
    if (i % 2 === 0) { const [sx, sz] = r.F.world(0, 6.2); S.stall(T, sx, Hh(sx, sz), sz, face(sx, sz, sx, 0), [0x3a6ab0, 0xc04040, 0xd0a030, 0x3a8a4a][i % 4]); }
  }
  for (let i = 0; i < 7; i++) for (const s of [-1, 1]) { const x = -16 + i * 15, z = s * 11; S.lampPost(T, x, Hh(x, z), z, 0); lights.lamps.push(V(x, Hh(x, z) + 4, z)); }

  // ---------- the plaza: a fountain, benches and the bank ----------
  const P = K('plaza');
  fountain(P, C.x, Hh(C.x, C.z), C.z, group);
  for (let i = 0; i < 10; i++) { const a = i / 10 * Math.PI * 2 + 0.2, x = C.x + Math.cos(a) * 24, z = C.z + Math.sin(a) * 24; if (Math.abs(Math.sin(a)) < 0.3 && Math.cos(a) < 0) continue; S.lampPost(P, x, Hh(x, z), z, a + Math.PI); lights.lamps.push(V(x, Hh(x, z) + 4, z)); }
  const F0 = new Frame(0, 0, 0, 0);
  for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2, x = C.x + Math.cos(a) * 13, z = C.z + Math.sin(a) * 13; S.bench(P, F0, x, Hh(x, z), z, -a + Math.PI / 2); }
  bank(P, 120, Hh(120, 48), 48, face(120, 48, 120, 0));
  // the market: stalls in a ring round the fountain
  for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2 + 0.39, x = C.x + Math.cos(a) * 33, z = C.z + Math.sin(a) * 33; S.stall(P, x, Hh(x, z), z, face(x, z, C.x, C.z), [0x3a6ab0, 0xc04040, 0xd0a030, 0x3a8a4a, 0x7a3aa0][i % 5]); }
  // houses round the plaza, with gaps for the avenues, the bridge and the bank
  const M2 = K('market');
  for (const deg of [205, 225, 246, 294, 315, 336, 22, 42, 62, 118, 138, 158]) {
    const a = deg * Math.PI / 180, x = C.x + Math.cos(a) * 52, z = C.z + Math.sin(a) * 52;
    if (Math.abs(z + 40) < 12 || Math.abs(x - 100) < 10 && z < -30) continue; // the canal
    house(M2, x, gy(x, z), z, face(x, z, C.x, C.z), { seed: 1200 + deg, w: rng.range(10, 12.5), d: rng.range(8, 9), floors: 3, roof: rng.chance(0.75) ? 'roofBlue' : 'roofRed', plaster: WHITE, shutter: 0x2a4a7a, chimney: rng.chance(0.6) });
  }
  // the harbour avenue: merchants' houses both sides, east to the quay
  for (let i = 0; i < 5; i++) for (const s of [-1, 1]) {
    const x = 170 + i * 15, z = s * 25;
    if (s > 0 && x < 176) continue; // the inn
    house(M2, x, gy(x, z), z, face(x, z, x, 0), { seed: 1300 + i * 2 + (s > 0 ? 1 : 0), w: rng.range(9, 11), d: 7.5, floors: rng.chance(0.5) ? 3 : 2, roof: rng.chance(0.7) ? 'roofBlue' : 'roofRed', plaster: rng.pick([WHITE, 0xf4eadc]), shutter: 0x2a4a7a });
  }
  for (let i = 0; i < 6; i++) for (const s of [-1, 1]) { const x = 162 + i * 16, z = s * 13; S.lampPost(M2, x, Hh(x, z), z, 0); lights.lamps.push(V(x, Hh(x, z) + 4, z)); }
  // the south-east and north-west quarters, and inside the west gate
  for (const [x, z, tx, tz] of [[142, 72, 120, 72], [142, 96, 120, 96], [142, 120, 120, 120], [236, -60, 236, -30], [248, -40, 236, -30], [72, -122, 72, -100], [86, -134, 86, -100], [-6, -44, -6, 0], [10, -46, 10, 0], [-4, 44, -4, 0], [12, 46, 12, 0], [26, -48, 26, 0], [42, -46, 42, 0]]) {
    if (Math.hypot(x - C.x, z - C.z) > C.r - 10) continue;
    house(M2, x, gy(x, z), z, face(x, z, tx, tz), { seed: 1400 + x * 3 + z, w: rng.range(8.5, 10.5), d: rng.range(7, 8), floors: rng.chance(0.6) ? 3 : 2, roof: rng.chance(0.75) ? 'roofBlue' : 'roofRed', plaster: rng.pick([WHITE, 0xf4eadc, 0xece4d8]), shutter: rng.pick([0x2a4a7a, 0x6a2a2a]) });
  }
  poi.bank = { x: 120, z: 32 };

  // ---------- the old town: rows of tall houses south of the avenue ----------
  const O = K('oldtown');
  for (let row = 0; row < 4; row++) for (let i = 0; i < 9; i++) {
    const z = 72 + row * 24 + (i % 2) * 1.5, x = -6 + i * 12.5 + (row % 2) * 5;
    if (Math.hypot(x - C.x, z - C.z) > C.r - 14 || x > 132) continue;
    const street = row % 2 === 0 ? z - 12 : z + 12;
    house(O, x, gy(x, z), z, face(x, z, x, street), { seed: 300 + row * 20 + i, w: rng.range(8, 10.5), d: rng.range(6.5, 8), floors: rng.chance(0.35) ? 3 : 2, roof: rng.chance(0.8) ? 'roofBlue' : 'roofRed', plaster: rng.pick([WHITE, 0xf4eadc, 0xece4d8]), shutter: rng.pick([0x2a4a7a, 0x6a2a2a, 0x2a5a3a]) });
  }
  for (let i = 0; i < 12; i++) { const x = 0 + i * 10, z = 66 + (i % 2) * 48; if (Math.hypot(x - C.x, z - C.z) > C.r - 10) continue; S.lampPost(O, x, Hh(x, z), z, 0); lights.lamps.push(V(x, Hh(x, z) + 4, z)); }
  // the inn: the Gilded Griffin
  S.inn(O, 160, gy(160, 44, 6), 44, face(160, 44, 140, 12));
  poi.inn = { x: 160, z: 44 };

  // ---------- the dwarven district: a great forge and its smithies ----------
  const D = K('dwarf');
  forgeHall(D, 196, gy(196, 80, 8), 80, face(196, 80, 170, 40), lights);
  for (let i = 0; i < 3; i++) { const x = 172 + i * 22, z = 110 + (i % 2) * 4; if (Math.hypot(x - C.x, z - C.z) > C.r - 10) continue; S.smithy(D, x, gy(x, z), z, face(x, z, 196, 80)); }
  lights.forges.push(...(D.forges || []));
  for (let i = 0; i < 4; i++) { const x = 226 + (i % 2) * 14, z = 40 + i * 14; house(D, x, gy(x, z), z, face(x, z, 200, 60), { seed: 500 + i, w: 8, d: 7, floors: 2, roof: 'roofRed', plaster: 0xd8ccbc, shutter: 0x5a3a2a }); }
  poi.forge = { x: 196, z: 70 };

  // ---------- north of the canal: the cathedral, the keep and the mage quarter ----------
  const N = K('north');
  cathedral(N, 150, gy(150, -100, 10), -100, face(150, -100, 150, 0), lights);
  keep(N, 196, gy(196, -88, 12), -88, face(196, -88, 196, 0), lights);
  mageTower(N, 44, gy(44, -96, 6), -96, lights, group);
  for (let i = 0; i < 5; i++) { const x = 20 + i * 14, z = -58 - (i % 2) * 16; if (Math.abs(x - 100) < 10) continue; house(N, x, gy(x, z), z, face(x, z, x, -30), { seed: 700 + i, w: 8.5, d: 7, floors: 3, roof: i % 2 ? 'roofRed' : 'roofBlue', plaster: WHITE, shutter: 0x4a2a6a }); }
  for (let i = 0; i < 4; i++) { const x = 176 + i * 30, z = -140 + (i % 2) * 8; if (Math.hypot(x - C.x, z - C.z) > C.r - 12 || (x > 205 && x < 250)) continue; house(N, x, gy(x, z), z, face(x, z, x, -40), { seed: 760 + i, w: 9, d: 7, floors: 2, roof: 'roofBlue', plaster: WHITE }); }
  for (const [x, z] of [[150, -52], [212, -52], [40, -60], [110, -120], [180, -70], [250, -70]]) { S.lampPost(N, x, Hh(x, z), z, 0); lights.lamps.push(V(x, Hh(x, z) + 4, z)); }

  // ---------- the canal: embankments with gaps for the bridges, and the bridges ----------
  const Cn = K('canal');
  canalWalls(Cn, Hh);
  for (const b of BRIDGES) bridge(Cn, b.x, b.z, b.ax, Hh);

  // ---------- the harbour: warehouses, docks and ships ----------
  const Hb = K('harbor');
  for (const z of [-88, -68, 30, 58, 86]) { const x = 252; S.barn(Hb, x, gy(x, z, 6), z, face(x, z, 220, z)); }
  for (const [z, len] of [[-58, 30], [-18, 24], [22, 34], [66, 26]]) {
    S.dock(Hb, 288, 0.6, z, -Math.PI / 2, len);
    Hb.boxCollider(288 + len / 2, z - 2.6, len, 0.4, 0); Hb.boxCollider(288 + len / 2, z + 2.6, len, 0.4, 0);
  }
  ship(Hb, 316, -48, 0.04, 28, 'roofBlue'); ship(Hb, 330, 12, -0.02, 34, 'roofRed'); ship(Hb, 314, 78, 0.05, 24, 'roofBlue');
  for (let i = 0; i < 12; i++) { const z = -96 + i * 17, x = 276; S.lampPost(Hb, x, Hh(x, z), z, -Math.PI / 2); lights.lamps.push(V(x, Hh(x, z) + 4, z)); }
  for (let i = 0; i < 10; i++) { const x = 256 + rng.range(-6, 14), z = rng.range(-90, 90), y = Hh(x, z); if (Math.abs(z) < 10) continue; if (rng.chance(0.5)) S.barrel(Hb, F0, x, y, z); else S.crate(Hb, F0, x, y, z, rng.range(0.7, 1.1), rng.range(0, 3)); }
  poi.harbor = { x: 272, z: 0 };

  // ---------- the countryside: a farmstead, the bandits' camp, the quarry, the Kingsroad gate ----------
  const Cs = K('country');
  S.house(Cs, -150, gy(-150, 112), 112, Math.PI, { seed: 901, w: 8, d: 6.5, roof: 'thatch', floors: 1, pitch: 0.8 });
  S.barn(Cs, -120, gy(-120, 150, 5), 150, Math.PI * 0.5);
  S.windmill(Cs, -200, gy(-200, 150, 3), 150, 0.4);
  for (const f of CROWN.fields) { const x0 = f.x - f.w / 2 - 1.5, x1 = f.x + f.w / 2 + 1.5, z0 = f.z - f.l / 2 - 1.5, z1 = f.z + f.l / 2 + 1.5; S.fence(Cs, [[x0, z0], [x1, z0], [x1, z1]], Hh); S.fence(Cs, [[x0 + 5, z1], [x0, z1], [x0, z0]], Hh); }
  const Cp = CROWN.places.camp;
  S.ruins(Cs, Cp.x, Hh(Cp.x, Cp.z), Cp.z, Hh);
  const Q = CROWN.places.quarry;
  S.mineEntrance(Cs, Q.x - 20, Hh(Q.x - 20, Q.z - 26), Q.z - 30, face(Q.x - 20, Q.z - 30, Q.x, Q.z));
  lights.torches.push(...(Cs.torches || []));
  for (let i = 0; i < 4; i++) { const a = i * 1.6, x = Q.x + Math.cos(a) * 18, z = Q.z + Math.sin(a) * 18; S.crate(Cs, F0, x, Hh(x, z), z, 1, a); S.cart(Cs, x + 3, Hh(x + 3, z), z, a); }
  // the Kingsroad gate: an arch at the mountain pass back to the Vale
  const E = CROWN.places.entrance;
  S.kingsGate(Cs, E.x, Hh(E.x, E.z), E.z, face(E.x, E.z, E.x + 40, E.z)); lights.torches.push(...Cs.torches.splice(-2));
  S.signpost(Cs, -380, Hh(-380, 12), 12, 0.2);
  S.signpost(Cs, -40, Hh(-40, 14), 14, 1.4);
  // the thornwood ranger's camp
  const G = CROWN.places.grove;
  lights.campfires.push(V(G.x + 20, Hh(G.x + 20, G.z + 34) + 0.1, G.z + 34));

  for (const k of all()) { k.build(group); for (const o of k.extraObjects || []) group.add(o); lights.torches.push(...(k === Cs ? [] : k.torches || [])); lights.chimneys.push(...(k.chimneys || [])); lights.campfires.push(...(k.campfires || [])); }
  group.add(buildCrops(hf));
  const colliders = all().flatMap(k => k.colliders);
  return { group, colliders, animated: all().flatMap(k => k.animated || []), lights, statues, poi, portal: null, statue: null };
}

// ---------------------------------------------------------------- building pieces
function angDiff(a, b) { let d = a - b; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2; return d; }
function house(kit, x, y, z, rot, o) { return S.house(kit, x, y, z, rot, o); }

/** A curtain wall along an arc (angles in radians, +X = 0), with gaps for gates. Merlons on the outer edge. */
function wallRing(kit, cx, cz, r, a0, a1, h, gaps, Hh) {
  const n = Math.ceil(r * (a1 - a0) / 6);
  for (let i = 0; i < n; i++) {
    const t0 = a0 + (a1 - a0) * i / n, t1 = a0 + (a1 - a0) * (i + 1) / n, tm = (t0 + t1) / 2;
    if (gaps.some(g => Math.abs(angDiff(tm, g.a)) < g.half)) continue;
    const x0 = cx + Math.cos(t0) * r, z0 = cz + Math.sin(t0) * r, x1 = cx + Math.cos(t1) * r, z1 = cz + Math.sin(t1) * r;
    wallPiece(kit, x0, z0, x1, z1, h, Hh, [Math.cos(tm), Math.sin(tm)]);
  }
}
function straightWall(kit, x0, z0, x1, z1, h, Hh) {
  const len = Math.hypot(x1 - x0, z1 - z0), n = Math.ceil(len / 6), nx = -(z1 - z0) / len, nz = (x1 - x0) / len;
  for (let i = 0; i < n; i++) wallPiece(kit, x0 + (x1 - x0) * i / n, z0 + (z1 - z0) * i / n, x0 + (x1 - x0) * (i + 1) / n, z0 + (z1 - z0) * (i + 1) / n, h, Hh, [nx * Math.sign(z0 || 1), nz * Math.sign(z0 || 1)]);
}
function wallPiece(kit, x0, z0, x1, z1, h, Hh, out) {
  const len = Math.hypot(x1 - x0, z1 - z0) + 0.3, mx = (x0 + x1) / 2, mz = (z0 + z1) / 2, rot = Math.atan2(-(z1 - z0), x1 - x0);
  const y = Math.min(Hh(x0, z0), Hh(x1, z1), Hh(mx, mz));
  const F = new Frame(mx, y, mz, rot), lz = Math.sin(rot) * out[0] + Math.cos(rot) * out[1] > 0 ? 1 : -1; // which local side faces out
  kit.add('stone', box(len, h + 2, 3.2, 2.2), F.at(0, h / 2 - 1, 0), { tint: STONE, yGround: y, aoH: 7 });
  kit.add('stone', box(len, 0.5, 3.8), F.at(0, h - 0.25, 0), { tint: TRIM, ao: false });
  for (let u = -len / 2 + 0.8; u < len / 2 - 0.4; u += 2.2) kit.add('stone', box(1.1, 1.3, 0.7), F.at(u, h + 0.6, lz * 1.55), { tint: STONE, ao: false });
  kit.colliders.push({ type: 'box', x: mx, z: mz, hw: len / 2, hd: 1.8, rot });
}
function roundTower(kit, x, y, z, r, h, roof) {
  kit.add('stone', cyl(r, r * 1.1, h + 2, 18, 2.2), MX(x, y + h / 2 - 1, z), { tint: STONE, yGround: y, aoH: 9 });
  kit.add('stone', cyl(r + 0.5, r + 0.5, 0.6, 18, 2), MX(x, y + h, z), { tint: TRIM, ao: false });
  for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2; if (i % 2) continue; kit.add('stone', box(1.2, 1.3, 0.7), MX(x + Math.cos(a) * (r + 0.2), y + h + 0.95, z + Math.sin(a) * (r + 0.2), -a + Math.PI / 2), { tint: STONE, ao: false }); }
  kit.add(roof, cone(r * 1.12, r * 1.7, 18, 2), MX(x, y + h + 0.3 + r * 0.85, z), { ao: false });
  for (let i = 0; i < 3; i++) kit.add('window', box(0.5, 1.2, 0.1), MX(x + Math.cos(i * 2.1) * (r + 0.05), y + h * (0.35 + i * 0.18), z + Math.sin(i * 2.1) * (r + 0.05), -i * 2.1 + Math.PI / 2), { ao: false });
  kit.circleCollider(x, z, r + 0.4);
}
function gatehouse(kit, x, y, z, rot, lights, h) {
  const F = new Frame(x, y, z, rot);
  for (const s of [-1, 1]) { const [tx, tz] = F.world(s * 11, 0); roundTower(kit, tx, y, tz, 6.2, h, 'roofBlue'); }
  kit.add('stone', box(18, 6, 5, 2.2), F.at(0, h - 7, 0), { tint: STONE, ao: false });                 // arch span
  kit.add('stone', box(19, 0.7, 5.6), F.at(0, h - 3.7, 0), { tint: TRIM, ao: false });
  for (let u = -8.5; u <= 8.5; u += 2.2) kit.add('stone', box(1.1, 1.3, 0.7), F.at(u, h - 2.7, 2.4), { tint: STONE, ao: false });
  for (let i = -3; i <= 3; i++) kit.add('metal', box(0.18, 4.5, 0.18), F.at(i * 1.3, h - 11.5, 0), { tint: 0x2a2a30, ao: false }); // the raised portcullis
  kit.add('paint', box(3.4, 5.5, 0.1), F.at(-4.5, h - 12, 2.55), { tint: 0x2a4a9a, ao: false }); // banners
  kit.add('paint', box(3.4, 5.5, 0.1), F.at(4.5, h - 12, 2.55), { tint: 0x2a4a9a, ao: false });
  kit.add('metal', box(1.2, 1.2, 0.12), F.at(-4.5, h - 11, 2.6), { tint: 0xe0b040, ao: false }); kit.add('metal', box(1.2, 1.2, 0.12), F.at(4.5, h - 11, 2.6), { tint: 0xe0b040, ao: false });
  for (const s of [-1, 1]) { const [bx, bz] = F.world(s * 7.2, 4.5); lights.torches.push(V(bx, y + 4.2, bz)); }
}
function fountain(kit, x, y, z, group) {
  kit.add('stone', cyl(8, 8.3, 1.0, 28, 2, true), MX(x, y + 0.3, z), { tint: STONE });
  kit.add('stone', cyl(8, 8, 0.2, 28, 2), MX(x, y - 0.1, z), { tint: TRIM, ao: false });
  kit.add('stone', cyl(8.4, 8.4, 0.35, 28, 2), MX(x, y + 0.95, z), { tint: TRIM, ao: false });
  kit.add('stone', cyl(1.2, 1.5, 4.5, 14, 2), MX(x, y + 2.4, z), { tint: STONE });
  kit.add('stone', cyl(3.2, 1.8, 0.6, 18, 2), MX(x, y + 4.5, z), { tint: TRIM });
  kit.add('stone', cyl(0.6, 0.8, 2.6, 10, 2), MX(x, y + 6.1, z), { tint: STONE });
  kit.add('metal', cone(1.3, 2.2, 8, 1), MX(x, y + 8.4, z), { tint: 0xe0b040, ao: false });
  const water = new THREE.Mesh(new THREE.CircleGeometry(7.7, 28), new THREE.MeshLambertMaterial({ color: 0x3aa0c8, emissive: 0x0a3040 }));
  water.rotation.x = -Math.PI / 2; water.position.set(x, y + 0.72, z); group.add(water);
  const top = new THREE.Mesh(new THREE.CircleGeometry(3, 18), water.material); top.rotation.x = -Math.PI / 2; top.position.set(x, y + 4.82, z); group.add(top);
  kit.circleCollider(x, z, 8.6);
}
function bank(kit, x, y, z, rot) {
  const F = new Frame(x, y, z, rot);
  kit.add('stone', box(30, 1.4, 22), F.at(0, 0.2, 0), { tint: STONE, yGround: y });
  for (let i = 0; i < 4; i++) kit.add('stone', box(24 - i * 0.2, 0.35, 2), F.at(0, 0.9 + i * 0.35, 11.5 + i * 0.6), { tint: TRIM, ao: false });
  kit.add('stone', box(26, 12, 16, 2.4), F.at(0, 7, -2), { tint: PALE, aoH: 8 });
  for (let i = 0; i < 8; i++) kit.add('stone', cyl(0.8, 0.9, 11, 12, 2), F.at(-11.2 + i * 3.2, 7, 8.5), { tint: PALE });
  kit.add('stone', box(28, 1.4, 5), F.at(0, 13.4, 8.2), { tint: TRIM });
  const { roof, gables } = gableRoof(28, 22, 5, 0.4, 0.3, 2);
  kit.add('roofBlue', roof, F.at(0, 13.6, 1), { ao: false }); kit.add('stone', gables, F.at(0, 13.6, 1), { tint: PALE, ao: false });
  kit.add('metal', box(5, 1.1, 0.15), F.at(0, 12.3, 10.8), { tint: 0xe0b040, ao: false });
  kit.add('planks', box(3, 5, 0.3), F.at(0, 3.8, 6.1), { tint: 0x5a3a20, ao: false });
  kit.boxCollider(x, z, 28, 20, rot);
}
function cathedral(kit, x, y, z, rot, lights) {
  const F = new Frame(x, y, z, rot), w = 18, d = 46, h = 17;
  kit.add('stone', box(w + 12, 1.6, d + 6), F.at(0, 0.2, -2), { tint: STONE, yGround: y });
  kit.add('stone', box(w, h, d, 2.4), F.at(0, h / 2 + 0.8, -4), { tint: PALE, aoH: 10 });
  for (const s of [-1, 1]) {
    kit.add('stone', box(6, h * 0.6, d - 8, 2.2), F.at(s * (w / 2 + 3), h * 0.3 + 0.8, -6), { tint: STONE });         // side aisles
    const r2 = gableRoof(d - 8, 6.6, 2.4, 0.3, 0.2, 2); kit.add('roofBlue', r2.roof, F.at(s * (w / 2 + 3), h * 0.6 + 0.8, -6, Math.PI / 2), { ao: false });
    for (let i = 0; i < 6; i++) { kit.add('stone', box(1.4, h * 0.9, 1.8), F.at(s * (w / 2 + 6.4), h * 0.45 + 0.8, -22 + i * 7.5), { tint: STONE }); kit.add('window', box(0.08, 6, 2.2), F.at(s * (w / 2 + 0.05), h * 0.62, -22 + i * 7.5), { ao: false }); }
  }
  const { roof, gables } = gableRoof(d, w, 8, 0.5, 0.3, 2);
  kit.add('roofBlue', roof, F.at(0, h + 0.8, -4, Math.PI / 2), { ao: false });
  kit.add('stone', gables, F.at(0, h + 0.8, -4, Math.PI / 2), { tint: PALE, ao: false });
  // twin front towers with spires, a rose window and a great door between them
  for (const s of [-1, 1]) {
    const tx = s * 9.5, tz = d / 2 - 2;
    kit.add('stone', box(8, 36, 8, 2.4), F.at(tx, 18.8, tz), { tint: PALE, aoH: 14 });
    kit.add('stone', box(9, 0.8, 9), F.at(tx, 36.8, tz), { tint: TRIM });
    kit.add('roofBlue', cone(5.6, 18, 4, 2), F.at(tx, 46.2, tz, Math.PI / 4), { ao: false });
    kit.add('metal', box(0.3, 3, 0.3), F.at(tx, 56.4, tz), { tint: 0xe0b040, ao: false });
    for (const k of [0.3, 0.55, 0.8]) kit.add('window', box(1.6, 3.4, 0.1), F.at(tx, 36 * k, tz + 4.05), { ao: false });
    kit.boxCollider(...F.world(tx, tz), 8.4, 8.4, rot);
  }
  // the rose window: blue glass in a stone ring, a gold cross over it
  kit.add('stone', cyl(3.7, 3.7, 0.3, 24, 2), F.at(0, h - 2, d / 2 - 1.85, 0, 1, 1, 1, Math.PI / 2), { tint: TRIM, ao: false });
  kit.add('paint', cyl(3.1, 3.1, 0.36, 24, 2), F.at(0, h - 2, d / 2 - 1.8, 0, 1, 1, 1, Math.PI / 2), { tint: 0x3a5ad0, ao: false });
  kit.add('metal', box(0.35, 6.2, 0.2), F.at(0, h - 2, d / 2 - 1.55), { tint: 0xe0b040, ao: false });
  kit.add('metal', box(6.2, 0.35, 0.2), F.at(0, h - 2, d / 2 - 1.55), { tint: 0xe0b040, ao: false });
  kit.add('planks', box(4.2, 7, 0.4), F.at(0, 4.3, d / 2 - 1.8), { tint: 0x6a4424, ao: false });
  kit.add('metal', box(4.8, 0.4, 0.5), F.at(0, 7.9, d / 2 - 1.7), { tint: 0xe0b040, ao: false });
  kit.boxCollider(...F.world(0, -4), w + 12.5, d + 1, rot);
  for (const s of [-1, 1]) { const [bx, bz] = F.world(s * 4, d / 2 + 1); lights.torches.push(V(bx, y + 4, bz)); }
}
function keep(kit, x, y, z, rot, lights) {
  const F = new Frame(x, y, z, rot);
  kit.add('stone', box(44, 3, 36), F.at(0, 0.5, 0), { tint: TRIM, yGround: y });
  kit.add('stone', box(36, 18, 26, 2.4), F.at(0, 11, 0), { tint: STONE, aoH: 12 });
  kit.add('stone', box(37, 0.6, 27), F.at(0, 20.2, 0), { tint: TRIM, ao: false });
  for (let u = -17.5; u <= 17.5; u += 2.3) for (const s of [-1, 1]) kit.add('stone', box(1.1, 1.3, 0.7), F.at(u, 21.1, s * 13.2), { tint: STONE, ao: false });
  kit.add('stone', box(16, 34, 16, 2.4), F.at(0, 19, -2), { tint: PALE, aoH: 16 });            // the donjon
  kit.add('stone', box(17, 0.7, 17), F.at(0, 36.3, -2), { tint: TRIM });
  kit.add('roofBlue', cone(11.5, 14, 4, 2), F.at(0, 43.7, -2, Math.PI / 4), { ao: false });
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) { const [tx, tz] = F.world(sx * 18, sz * 13); roundTower(kit, tx, y + 2, tz, 5, 28, 'roofBlue'); }
  kit.add('planks', box(6, 9, 0.4), F.at(0, 6.5, 13.2), { tint: 0x5a3a20, ao: false });
  kit.add('stone', box(8, 1.2, 1.4), F.at(0, 11.4, 13.4), { tint: TRIM, ao: false });
  for (const s of [-1, 1]) { kit.add('paint', box(3.4, 9, 0.12), F.at(s * 7, 12, 13.28), { tint: 0x2a4a9a, ao: false }); kit.add('metal', box(1.4, 1.4, 0.14), F.at(s * 7, 13.5, 13.35), { tint: 0xe0b040, ao: false }); }
  for (let i = 0; i < 5; i++) kit.add('stone', box(14 - i, 0.5, 1.6), F.at(0, 0.25 + i * 0.5, 22 - i * 1.4), { tint: TRIM, ao: false });
  kit.boxCollider(x, z, 38, 28, rot);
  for (const s of [-1, 1]) { const [bx, bz] = F.world(s * 4.5, 15); lights.torches.push(V(bx, y + 5.5, bz)); }
}
function mageTower(kit, x, y, z, lights, group) {
  kit.add('stone', cyl(7, 8, 3, 18, 2), MX(x, y + 0.5, z), { tint: TRIM, yGround: y });
  kit.add('stone', cyl(5.2, 6.2, 34, 18, 2.4), MX(x, y + 18, z), { tint: [1.56, 1.5, 1.62], aoH: 14 });
  kit.add('stone', cyl(7, 7, 1, 18, 2), MX(x, y + 35, z), { tint: TRIM });
  kit.add('cloth', cone(7.6, 16, 18, 2), MX(x, y + 43.5, z), { tint: 0x6a3aa8, ao: false });
  for (let i = 0; i < 8; i++) kit.add('window', box(0.6, 1.8, 0.1), MX(x + Math.cos(i * 0.8) * 5.8, y + 6 + i * 3.5, z + Math.sin(i * 0.8) * 5.8, -i * 0.8 + Math.PI / 2), { ao: false });
  kit.circleCollider(x, z, 7.4);
  // floating runic rings
  const mat = new THREE.MeshBasicMaterial({ color: 0xb080ff, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false });
  for (let i = 0; i < 3; i++) { const ring = new THREE.Mesh(new THREE.TorusGeometry(9 + i * 1.6, 0.12, 6, 48), mat); ring.position.set(x, y + 22 + i * 7, z); ring.rotation.x = Math.PI / 2 + (i - 1) * 0.12; ring.userData.spin = 0.2 + i * 0.12; ring.name = 'mage-ring'; group.add(ring); }
  lights.torches.push(V(x, y + 37, z));
}
function forgeHall(kit, x, y, z, rot, lights) {
  const F = new Frame(x, y, z, rot);
  kit.add('darkStone', box(30, 1.2, 22), F.at(0, 0, 0), { tint: 0x9a908a, yGround: y });
  kit.add('darkStone', box(26, 11, 16, 2.2), F.at(0, 6, -2), { tint: 0xb8aca0, aoH: 8 });
  const { roof } = gableRoof(27, 17, 4, 0.4, 0.3, 2); kit.add('roofRed', roof, F.at(0, 11.5, -2), { ao: false });
  for (const s of [-1, 1]) { kit.add('darkStone', box(3, 16, 3, 1.6), F.at(s * 9, 13, -6), { tint: 0x8a807a }); lights.chimneys.push(V(...F.world(s * 9, -6).flatMap((v, i) => (i === 0 ? [v, y + 21.5] : [v])))); }
  kit.add('planks', box(7, 7, 0.3), F.at(0, 4.2, 6.1), { tint: 0x4a3018, ao: false });
  // open-air anvils and a big forge out front (where Blacksmithing works)
  kit.add('darkStone', box(5, 1.6, 3), F.at(-7, 1.4, 9), { tint: 0xa09890 });
  kit.add('glow', box(4, 0.14, 2.2), F.at(-7, 2.25, 9), { ao: false });
  for (const u of [2, 6]) { kit.add('metal', box(1.2, 0.45, 0.45), F.at(u, 1.5, 9.5), { tint: 0x3a3a40, ao: false }); kit.add('metal', box(0.5, 0.6, 0.45), F.at(u, 1.0, 9.5), { tint: 0x3a3a40, ao: false }); }
  kit.boxCollider(...F.world(0, -2), 27, 17, rot); kit.boxCollider(...F.world(-7, 9), 5.4, 3.4, rot);
  const [fx, fz] = F.world(-7, 9); lights.forges.push(V(fx, y + 2.4, fz));
}
function canalWalls(kit, Hh) {
  // the in-city stretch: stone banks and a low parapet, broken where the bridges cross
  const segs = [[[100, -150], [100, -40]], [[100, -40], [276, -40]]];
  for (const [[x0, z0], [x1, z1]] of segs) {
    const len = Math.hypot(x1 - x0, z1 - z0), dx = (x1 - x0) / len, dz = (z1 - z0) / len;
    for (let t = 0; t < len; t += 4) {
      const cx = x0 + dx * (t + 2), cz = z0 + dz * (t + 2);
      if (BRIDGES.some(b => Math.hypot(cx - b.x, cz - b.z) < 8)) continue;
      for (const s of [-1, 1]) {
        const px = cx - dz * s * 6.1, pz = cz + dx * s * 6.1, rot = Math.atan2(-dz, dx);
        kit.add('stone', box(4.1, 6.2, 0.8, 2), MX(px, -0.4, pz, rot), { tint: TRIM, ao: false });
        kit.add('stone', box(4.1, 0.9, 0.6), MX(px, 3.65, pz, rot), { tint: STONE, ao: false });
        kit.colliders.push({ type: 'box', x: px, z: pz, hw: 2.1, hd: 0.5, rot });
      }
    }
  }
}
function bridge(kit, x, z, ax, Hh) {
  const rot = ax === 'z' ? Math.PI / 2 : 0, F = new Frame(x, 3.2, z, rot); // local X runs the way you walk
  kit.add('stone', box(16, 1.2, 8, 2), F.at(0, -0.5, 0), { tint: STONE, ao: false });
  for (const s of [-1, 1]) {
    kit.add('stone', box(16, 1.1, 0.7), F.at(0, 0.55, s * 3.8), { tint: TRIM, ao: false });
  }
  for (const s of [-1, 1]) for (const e of [-1, 1]) { kit.add('stone', box(1, 1.6, 1), F.at(e * 7.6, 0.8, s * 3.8), { tint: STONE, ao: false }); }
}
function ship(kit, x, z, rot, len, sailRoof) {
  const F = new Frame(x, 0, z, rot), wid = len * 0.28;
  const hull = new THREE.SphereGeometry(1, 16, 8, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2);
  kit.add('planks', hull, F.at(0, 1.6, 0, Math.PI / 2, wid / 2, 3.4, len / 2), { tint: 0x6a4428, ao: false });
  kit.add('planks', box(wid * 0.92, 0.3, len * 0.9, 2), F.at(0, 1.55, 0, Math.PI / 2), { tint: 0xa07a50, ao: false });
  kit.add('planks', box(wid * 0.9, 2.4, len * 0.22), F.at(-len * 0.36, 2.8, 0, Math.PI / 2), { tint: 0x7a5434 });   // stern castle
  kit.add('timber', cyl(0.18, 0.3, len * 0.5, 8), F.at(len * 0.53, 2.6, 0, 0, 1, 1, 1, 0, -1.2), {});           // bowsprit
  for (const [u, hgt] of [[len * 0.18, len * 0.9], [-len * 0.14, len * 0.75]]) {
    kit.add('timber', cyl(0.25, 0.35, hgt, 8), F.at(u, 1.6 + hgt / 2, 0), {});
    for (const k of [0.45, 0.78]) {
      kit.add('timber', cyl(0.12, 0.12, wid * 1.3, 6), F.at(u, 1.6 + hgt * k, 0, 0, 1, 1, 1, Math.PI / 2), {});
      kit.add('cloth', box(0.15, hgt * 0.26, wid * 1.2), F.at(u + 0.3, 1.6 + hgt * (k - 0.14), 0), { tint: 0xf4ece0, ao: false });
    }
    kit.add(sailRoof === 'roofRed' ? 'paint' : 'paint', box(0.1, 1.2, 2.2), F.at(u, 1.6 + hgt + 0.6, 1.2), { tint: sailRoof === 'roofRed' ? 0xa02a20 : 0x2a4a9a, ao: false });
  }
  kit.boxCollider(x, z, len * 0.95, wid, rot);
}
