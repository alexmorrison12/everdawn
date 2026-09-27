// Humanoid lab: lineup / closeups / turntable. URL params:
//   ?view=lineup|face|back|single  &anim=idle|run|walk|...  &race=&sex=&cls=&tier=  &t=<fixed time>  &rot=<deg>
import * as THREE from 'three';
import { Renderer } from '../engine/renderer.js';
import { G } from '../engine/materials.js';
import { createHumanoid, randomAppearance, GEAR_PRESETS, prewarmHumanoids } from '../models/humanoid.js';
import { weaponGeometry } from '../models/humanoid/weapons.js';
import { makeUniforms, makeHumanoidMaterial } from '../models/humanoid/material.js';
import { RNG } from '../core/noise.js';

const Q = new URLSearchParams(location.search);
const view = Q.get('view') || 'lineup';
const renderer = new Renderer(document.body);
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x8fa9c4);
const camera = new THREE.PerspectiveCamera(Number(Q.get('fov') || 32), innerWidth / innerHeight, 0.05, 200);
renderer.setScene(scene, camera);
scene.add(new THREE.HemisphereLight(0xbcd4f0, 0x5a6a3a, 1.2));
const sun = new THREE.DirectionalLight(0xfff0d8, 3.0);
sun.position.set(5, 7, 3.5); sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048); sun.shadow.camera.left = -8; sun.shadow.camera.right = 8; sun.shadow.camera.top = 6; sun.shadow.camera.bottom = -2;
sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.03;
scene.add(sun);
const ground = new THREE.Mesh(new THREE.CircleGeometry(30, 48), new THREE.MeshLambertMaterial({ color: 0x5f7f3a }));
ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; scene.add(ground);

const chars = [];
const log = [];
function add(opts, x, z = 0, ry = 0) {
  const t0 = performance.now();
  const c = createHumanoid(opts);
  const ms = performance.now() - t0;
  c.root.position.set(x, 0, z); c.root.rotation.y = ry;
  scene.add(c.root); chars.push(c);
  log.push(`${opts.race}/${opts.sex} ${opts.gear || ''}: ${ms.toFixed(1)}ms (base ${c.stats.baseMs.toFixed(1)}ms) verts ${c.stats.verts} tris ${c.stats.tris} draws ${c.stats.drawCalls}`);
  return c;
}

const RACES = [['human', 0xe2b08c], ['dwarf', 0xe6a88a], ['orc', 0x6f9a3e], ['elf', 0xb8a6e0]];
const rot = (Number(Q.get('rot') ?? (view === 'back' ? 0 : 180)) || 0) * Math.PI / 180;
const LINEUP = [
  { race: 'human', sex: 'm', cls: 'warrior', gear: 'warrior:3', hair: 1, beard: 2, skin: 0xe2b08c, hairColor: 0x3a2616 },
  { race: 'human', sex: 'f', cls: 'priest', gear: 'priest:2', hair: 0, skin: 0xf0c8a8, hairColor: 0xd8b068 },
  { race: 'dwarf', sex: 'm', cls: 'paladin', gear: 'paladin:2', beard: 3, hair: 0, skin: 0xe6a88a, hairColor: 0x8a4a1e },
  { race: 'dwarf', sex: 'f', cls: 'hunter', gear: 'hunter:1', hair: 0, skin: 0xf0c0a0, hairColor: 0xb86a2a },
  { race: 'orc', sex: 'm', cls: 'warrior', gear: 'warrior:2', hair: 0, skin: 0x6f9a3e, hairColor: 0x141210 },
  { race: 'orc', sex: 'f', cls: 'rogue', gear: 'rogue:1', hair: 0, skin: 0x7aa050, hairColor: 0x2a2018 },
  { race: 'elf', sex: 'm', cls: 'mage', gear: 'mage:3', hair: 0, skin: 0xb8a6e0, hairColor: 0xd8dce8 },
  { race: 'elf', sex: 'f', cls: 'hunter', gear: 'hunter:3', hair: 1, skin: 0xa898d8, hairColor: 0x2a6a5a },
];
if (view === 'lineup' || view === 'lineupBack') {
  let x = -5.25;
  const gOverride = Q.get('gear');
  const r0 = view === 'lineupBack' ? (Number(Q.get('rot') || 0) * Math.PI / 180) : rot;
  for (const L of LINEUP) { const opts = { ...L, face: Number(Q.get('face') || 0), seed: 3 }; if (gOverride) opts.gear = gOverride; if (Q.get('naked')) opts.gear = 'npc:villager'; add(opts, x, 0, r0); x += 1.5; }
  if (view === 'lineupBack') { camera.position.set(0, 4.2, 10.5); camera.lookAt(0, 1.0, 0); }
  else { camera.position.set(0, 1.6, 11.5); camera.lookAt(0, 1.0, 0); }
} else if (view === 'perf' || view === 'crowd') {
  const rng = new RNG(Number(Q.get('seed') || 42));
  const N = Number(Q.get('n') || 40);
  const times = [];
  const classes = ['warrior', 'paladin', 'mage', 'priest', 'rogue', 'hunter'];
  for (let i = 0; i < N; i++) {
    const app = randomAppearance(rng);
    const cls = rng.pick(classes), tier = rng.int(0, 3);
    const t0 = performance.now();
    const c = createHumanoid({ ...app, cls, gear: `${cls}:${tier}` });
    times.push(performance.now() - t0);
    const col = i % 10, row = Math.floor(i / 10);
    c.root.position.set((col - 4.5) * 1.6, 0, -row * 2.2); c.root.rotation.y = Math.PI;
    scene.add(c.root); chars.push(c);
  }
  const sorted = times.slice().sort((a, b) => a - b);
  console.log(`created ${N}: total ${times.reduce((a, b) => a + b, 0).toFixed(0)}ms, first ${times[0].toFixed(1)}, median ${sorted[N >> 1].toFixed(2)}ms, last10 avg ${(times.slice(-10).reduce((a, b) => a + b, 0) / 10).toFixed(2)}ms, 40th ${times[N - 1].toFixed(2)}ms`);
  const verts = chars.map(c => c.stats.verts), draws = chars.map(c => c.stats.drawCalls);
  console.log(`verts avg ${(verts.reduce((a, b) => a + b, 0) / N).toFixed(0)} max ${Math.max(...verts)} min ${Math.min(...verts)}; draw calls avg ${(draws.reduce((a, b) => a + b, 0) / N).toFixed(2)} max ${Math.max(...draws)}`);
  // second pass: identical appearances -> everything cached
  { const rng2 = new RNG(Number(Q.get('seed') || 42)); const t2 = [];
    for (let i = 0; i < N; i++) { const app = randomAppearance(rng2); const cls = rng2.pick(classes), tier = rng2.int(0, 3); const t0 = performance.now(); const c = createHumanoid({ ...app, cls, gear: `${cls}:${tier}` }); t2.push(performance.now() - t0); c.dispose(); }
    const s2 = t2.slice().sort((a, b) => a - b);
    console.log(`warm pass: median ${s2[N >> 1].toFixed(2)}ms, max ${s2[N - 1].toFixed(2)}ms, avg ${(t2.reduce((a, b) => a + b, 0) / N).toFixed(2)}ms`);
  }
  // update cost
  const st2 = { speed: 7, grounded: true };
  const u0 = performance.now(); for (let f = 0; f < 60; f++) for (const c of chars) c.update(1 / 60, st2);
  console.log(`update: ${((performance.now() - u0) / 60).toFixed(2)}ms/frame for ${N} chars (${((performance.now() - u0) / 60 / N * 1000).toFixed(1)}us each)`);
  camera.position.set(0, 6, 12); camera.lookAt(0, 0.5, -3);
} else if (view === 'tiers') {
  const cls = Q.get('cls') || 'warrior';
  const races = (Q.get('races') || 'human_m,orc_f').split(',');
  let x = -5.25;
  for (const rs of races) for (let t = 0; t < 4; t++) {
    const [race, sex] = rs.split('_');
    add({ race, sex, cls, gear: `${cls}:${t}`, hair: 1, beard: sex === 'm' ? 2 : 0, seed: 5, skin: (RACES.find(r => r[0] === race) || RACES[0])[1], hairColor: 0x3a2616 }, x, 0, rot); x += 1.5;
  }
  camera.position.set(0, 1.6, 11.5); camera.lookAt(0, 1.0, 0);
} else if (view === 'npcs') {
  const list = ['villager', 'farmer', 'innkeeper', 'guard', 'marshal', 'archmage', 'bandit', 'bandit'];
  const who = [['human', 'm', 0], ['human', 'f', 1], ['dwarf', 'm', 2], ['human', 'm', 3], ['human', 'm', 1], ['elf', 'm', 0], ['orc', 'm', 3], ['human', 'f', 3]];
  let x = -5.25;
  list.forEach((n, i) => { const [race, sex, hair] = who[i]; add({ race, sex, cls: 'npc', gear: 'npc:' + n, hair, beard: n === 'archmage' ? 2 : sex === 'm' ? 1 : 0, hairColor: n === 'archmage' ? 0xe8e4dc : 0x5a3a1e, skin: (RACES.find(r => r[0] === race) || RACES[0])[1], seed: 9 }, x, 0, rot); x += 1.5; });
  camera.position.set(0, 1.6, 11.5); camera.lookAt(0, 1.0, 0);
} else if (view === 'hair') {
  const race = Q.get('race') || 'human', sex = Q.get('sex') || 'm';
  const n = Number(Q.get('n') || 6);
  let x = -(n - 1) * 0.55;
  for (let i = 0; i < n; i++) { add({ race, sex, hair: i, beard: sex === 'm' ? i % 6 : 0, gear: 'npc:villager', hairColor: [0x3a2616, 0xd8b068, 0xa04a24, 0x1e1612, 0x8a8a88, 0x6a4424][i % 6], skin: (RACES.find(r => r[0] === race) || RACES[0])[1], seed: 2 }, x, 0, rot); x += 1.1; }
  camera.position.set(0, 1.55, 6.5); camera.lookAt(0, 1.35, 0);
} else if (view === 'game') {
  // gameplay camera: behind & above the player (FOV 55, ~9 m), a few SimPlayers around
  const idx = Number(Q.get('i') ?? 0);
  const L = LINEUP[idx];
  const me = add({ ...L, seed: 4, gear: Q.get('gear') || L.gear }, 0, 0, 0);
  const others = [[2, -3.5, -6, 0.4], [5, 3, -9, -0.3], [6, -2, -12, 0.2], [1, 4.5, -4, -0.6], [3, -5.5, -10, 0.9]];
  for (const [j, x, z, r] of others) add({ ...LINEUP[j], seed: 10 + j }, x, z, r);
  camera.fov = 55; camera.updateProjectionMatrix();
  const pitch = Number(Q.get('pitch') || 0.32), dist = Number(Q.get('dist') || 9);
  camera.position.set(0, 1.7 + Math.sin(pitch) * dist, Math.cos(pitch) * dist); camera.lookAt(0, 1.7, 0);
  ground.material.color.set(0x5a7a34);
} else if (view === 'portrait') {
  // unit-frame portrait: camera in front of sockets.head (as the UI would frame it)
  const idx = Number(Q.get('i') ?? 0);
  const c = add({ ...LINEUP[idx], seed: 4 }, 0, 0, 0);
  c.update(0.016, {}); c.root.updateMatrixWorld(true);
  const hp = c.sockets.head.getWorldPosition(new THREE.Vector3());
  const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(c.sockets.head.getWorldQuaternion(new THREE.Quaternion()));
  camera.fov = 30; camera.aspect = 1; camera.updateProjectionMatrix();
  camera.position.copy(hp).addScaledVector(fwd, 0.62 * c.height / 1.9).add(new THREE.Vector3(0.12, 0.03, 0));
  camera.lookAt(hp.x, hp.y - 0.03, hp.z);
  scene.background = new THREE.Color(0x1a1410);
} else if (view === 'prewarm') {
  (async () => {
    const t0 = performance.now();
    let frames = 0, maxGap = 0, lastT = performance.now();
    await prewarmHumanoids({ onProgress: () => { const n = performance.now(); maxGap = Math.max(maxGap, n - lastT); lastT = n; frames++; } });
    const tw = performance.now() - t0;
    const rng = new RNG(7); const classes = ['warrior', 'paladin', 'mage', 'priest', 'rogue', 'hunter'];
    const times = [];
    for (let i = 0; i < 40; i++) { const app = randomAppearance(rng); const cls = rng.pick(classes); const t1 = performance.now(); const c = createHumanoid({ ...app, cls, gear: `${cls}:${rng.int(0, 3)}` }); times.push(performance.now() - t1); c.root.position.set((i % 10 - 4.5) * 1.6, 0, -Math.floor(i / 10) * 2.2); c.root.rotation.y = Math.PI; scene.add(c.root); chars.push(c); }
    const sorted = times.slice().sort((a, b) => a - b);
    console.log(`prewarm (all races, hair, beards, hoods, faces): ${tw.toFixed(0)}ms in ${frames} slices (longest slice ${maxGap.toFixed(0)}ms); then 40 random SimPlayers: total ${times.reduce((a, b) => a + b, 0).toFixed(0)}ms, median ${sorted[20].toFixed(2)}ms, max ${sorted[39].toFixed(1)}ms, 40th ${times[39].toFixed(2)}ms`);
    window.__prewarmDone = true;
  })();
  camera.position.set(0, 6, 12); camera.lookAt(0, 0.5, -3);
} else if (view === 'api') {
  const errors = []; let calls = 0;
  const acts = ['attack1h', 'attack1h', 'attack2h', 'attackOff', 'shieldBash', 'shoot', 'castDirected', 'castOmni', 'hit', 'dodge', 'roar', 'wave', 'cheer', 'laugh', 'point', 'bow', 'kneel', 'dance', 'draw'];
  const states = [{}, { speed: 2.5 }, { speed: 7 }, { speed: -4.5 }, { strafe: 7 }, { speed: 5, strafe: -5 }, { grounded: false, vy: 5 }, { grounded: false, vy: -8 }, { swimming: true, speed: 3 }, { swimming: true },
    { sit: true }, { combat: true }, { combat: true, speed: 7 }, { casting: 'directed' }, { casting: 'omni' }, { casting: 'channel', speed: 3 }, { turn: 3 }, { dead: true }, {}];
  for (const r of ['human', 'dwarf', 'orc', 'elf']) for (const sx of ['m', 'f']) {
    try {
      const c = createHumanoid({ race: r, sex: sx, cls: 'hunter', gear: 'hunter:2', hair: 3, beard: 4, face: 2, scale: 1.1 });
      scene.add(c.root);
      for (const gname of ['warrior:3', 'paladin:3', 'mage:3', 'priest:1', 'rogue:3', 'npc:archmage', 'npc:bandit', 'npc:farmer']) {
        c.setGear(gname); calls++;
        for (const st of states) { for (let f = 0; f < 20; f++) c.update(1 / 30, { grounded: true, ...st }); calls++; }
        for (const a of acts) { c.play(a); for (let f = 0; f < 12; f++) c.update(1 / 30, { grounded: true, combat: true, speed: a === 'attack1h' ? 7 : 0 }); calls++; }
      }
      c.setTint(0xff0000, 0.5); c.update(1 / 30, {});
      if (!(c.sockets.handR && c.sockets.handL && c.sockets.back && c.sockets.head && c.sockets.chest)) errors.push('missing socket');
      if (!isFinite(c.height) || !isFinite(c.radius)) errors.push('bad height/radius');
      // NaN check on bone matrices
      c.root.updateMatrixWorld(true);
      for (const b of c.bones) if (!b.matrixWorld.elements.every(Number.isFinite)) { errors.push(r + sx + ' NaN bone ' + b.name); break; }
      c.dispose();
    } catch (e) { errors.push(`${r}_${sx}: ${e.message}\n${e.stack.split('\n').slice(0, 3).join(' | ')}`); }
  }
  console.log(`api test: ${calls} call groups, errors: ${errors.length ? errors.join(' || ') : 'none'}`);
} else if (view === 'weapons') {
  const types = ['sword1h', 'sword2h', 'axe', 'axe2h', 'mace', 'staff', 'dagger', 'bow', 'shield', 'book', 'orb', 'wand'];
  const mat = makeHumanoidMaterial(makeUniforms(), { key: 'w' });
  const tiers = [1, 3];
  tiers.forEach((t, row) => types.forEach((ty, i) => {
    const w = weaponGeometry({ type: ty, tier: t, glow: t >= 3, glowColor: 0x80c0ff, emblem: ty === 'shield' ? (t >= 3 ? 'sun' : 'lion') : undefined });
    const m = new THREE.Mesh(w.geo, mat); m.castShadow = true;
    const len = w.info.len || 1, sc = Math.min(1, 1.1 / len);
    m.scale.setScalar(sc);
    m.position.set((i - (types.length - 1) / 2) * 0.62, 1.2 - row * 1.25 + (ty === 'shield' || ty === 'book' || ty === 'orb' ? 0.35 : 0), 0);
    if (ty === 'shield' || ty === 'book') m.rotation.y = Math.PI; else m.rotation.y = 0.5;
    scene.add(m);
  }));
  camera.position.set(0, 0.9, 7.5); camera.lookAt(0, 0.85, 0);
} else if (view === 'budget') {
  const gears = []; for (const cls of ['warrior', 'paladin', 'mage', 'priest', 'rogue', 'hunter']) for (let t = 0; t < 4; t++) gears.push(`${cls}:${t}`);
  for (const n of Object.keys(GEAR_PRESETS.npc)) gears.push('npc:' + n);
  const rows = []; let maxV = 0, maxD = 0, sumV = 0, cnt = 0, worst = '';
  const t0 = performance.now();
  for (const r of ['human', 'dwarf', 'orc', 'elf']) for (const sx of ['m', 'f']) for (const g of gears) {
    const c = createHumanoid({ race: r, sex: sx, gear: g, hair: 2, beard: sx === 'm' ? 3 : 0 });
    sumV += c.stats.verts; cnt++;
    if (c.stats.verts > maxV) { maxV = c.stats.verts; worst = `${r}_${sx} ${g}`; }
    maxD = Math.max(maxD, c.stats.drawCalls);
    c.dispose();
  }
  console.log(`budget: ${cnt} combos in ${(performance.now() - t0).toFixed(0)}ms; verts avg ${(sumV / cnt).toFixed(0)} max ${maxV} (${worst}); max draw calls ${maxD}`);
} else if (view === 'strip') {
  const race = Q.get('race') || 'human', sex = Q.get('sex') || 'm', n = Number(Q.get('n') || 6);
  const skin = (RACES.find(r => r[0] === race) || RACES[0])[1];
  const idx = Number(Q.get('i') ?? -1);
  const L = idx >= 0 ? LINEUP[idx] : { race, sex, skin, cls: Q.get('cls') || 'warrior', gear: Q.get('gear') || undefined };
  const sp = Number(Q.get('spacing') || 1.25);
  for (let i = 0; i < n; i++) { const c = add({ ...L, seed: 7, gear: Q.get('gear') || L.gear }, (i - (n - 1) / 2) * sp, 0, Number(Q.get('rot') ?? 90) * Math.PI / 180); c.stripOffset = i / n; }
  const cz = Number(Q.get('cz') || 10); camera.position.set(0, 1.1 * (Number(Q.get('ch') || 1)), cz); camera.lookAt(0, 0.95, 0);
} else {
  const race = Q.get('race') || 'human', sex = Q.get('sex') || 'm';
  const skin = (RACES.find(r => r[0] === race) || RACES[0])[1];
  const idx = Number(Q.get('i') ?? -1);
  const L = idx >= 0 ? LINEUP[idx] : { race, sex, skin, hairColor: 0x4a3020 };
  const opts = { ...L, face: Number(Q.get('face') || L.face || 0), seed: 3 };
  if (Q.get('gear')) opts.gear = Q.get('gear');
  if (Q.get('hair')) opts.hair = Number(Q.get('hair'));
  if (Q.get('beard')) opts.beard = Number(Q.get('beard'));
  const c = add(opts, 0, 0, rot);
  if (Q.get('tile')) c.U.uFaceTile.value.set(...Q.get('tile').split(',').map(Number));
  const h = c.height;
  if (view === 'face') {
    c.update(0.016, {}); c.root.updateMatrixWorld(true);
    const hp = c.sockets.head.getWorldPosition(new THREE.Vector3());
    const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(c.sockets.head.getWorldQuaternion(new THREE.Quaternion()));
    camera.fov = 26; camera.updateProjectionMatrix();
    camera.position.copy(hp).addScaledVector(fwd, 0.95).add(new THREE.Vector3(Number(Q.get('cx') || 0), 0.02, 0)); camera.lookAt(hp.x, hp.y - 0.05, hp.z);
  }
  else if (view === 'back') { camera.position.set(0, h * 1.5, 5.2); camera.lookAt(0, h * 0.55, 0); }
  else { camera.position.set(0, h * 0.6, 4.4); camera.lookAt(0, h * 0.5, 0); }
}
console.log(log.join('\n'));

// animation state from ?anim=
const ANIMS = {
  idle: {}, walk: { speed: 2.5 }, run: { speed: 7 }, back: { speed: -4.5 }, strafeL: { strafe: -7 }, strafeR: { strafe: 7 },
  diag: { speed: 5, strafe: 5 }, jump: { grounded: false, vy: 3 }, fall: { grounded: false, vy: -6 }, swim: { swimming: true, speed: 3 }, tread: { swimming: true },
  sit: { sit: true }, dead: { dead: true }, combat: { combat: true }, combatRun: { combat: true, speed: 7 },
  cast: { casting: 'directed', combat: true }, omni: { casting: 'omni', combat: true }, channel: { casting: 'channel', combat: true },
  turn: { turn: 3 },
};
const animName = Q.get('anim') || 'idle';
const st = { grounded: true, ...(ANIMS[animName] || {}) };
const playName = Q.get('play');
let time = 0;
const T = Q.has('t') ? Number(Q.get('t')) : null;
function step(dt) {
  time += dt; G.uTime.value = time;
  if (animName === 'jumpcycle') { const ph = time % 1.2; st.grounded = ph > 0.8; st.vy = st.grounded ? 0 : 4.5 - ph * 11; }
  for (const c of chars) c.update(dt, st);
}
const playAfter = Q.has('after');
if (playName && !playAfter) for (const c of chars) c.play(playName);
if (T !== null) { const n = Math.round(T * 60); for (let i = 0; i < n; i++) step(1 / 60); }
if (playName && playAfter) for (const c of chars) c.play(playName);
// strip: advance each copy by a fraction of the cycle period (sampling (i+0.5)/n when playing a one-shot)
const stripPeriod = Number(Q.get('period') || 0.7);
for (const c of chars) if (c.stripOffset !== undefined) { const f = playAfter ? c.stripOffset + 0.5 / chars.length : c.stripOffset; const n = Math.round(f * stripPeriod * 60); for (let i = 0; i < n; i++) c.update(1 / 60, st); }
// ---- interactive controls (keyboard) + turntable ----
let spin = Number(Q.get('spin') || 0) * Math.PI / 180;
const KEYS = { '1': 'idle', '2': 'walk', '3': 'run', '4': 'back', '5': 'strafeR', '6': 'jumpcycle', '7': 'swim', '8': 'sit', '9': 'dead', '0': 'combat', 'c': 'cast', 'o': 'omni', 'h': 'channel', 'r': 'combatRun', 't': 'turn' };
const PLAYS = { 'a': 'attack1h', 's': 'attack2h', 'f': 'attackOff', 'b': 'shieldBash', 'x': 'shoot', 'q': 'castDirected', 'e': 'castOmni', 'z': 'hit', 'v': 'dodge', 'y': 'roar', 'd': 'dance', 'w': 'wave', 'u': 'cheer', 'l': 'laugh', 'p': 'point', 'n': 'bow', 'k': 'kneel' };
let curAnim = animName;
function setAnim(name) { curAnim = name; for (const k of Object.keys(st)) delete st[k]; Object.assign(st, { grounded: true }, ANIMS[name] || {}); }
window.__setAnim = setAnim;
window.__play = (n) => chars.forEach(c => c.play(n));
let tierCycle = 0;
addEventListener('keydown', (e) => {
  if (KEYS[e.key]) setAnim(KEYS[e.key]);
  else if (PLAYS[e.key]) window.__play(PLAYS[e.key]);
  else if (e.key === ' ') spin = spin ? 0 : 0.6;
  else if (e.key === 'g') { tierCycle = (tierCycle + 1) % 4; chars.forEach(c => { const cls = c.opts.cls === 'npc' ? 'warrior' : c.opts.cls; c.setGear(`${cls}:${tierCycle}`); }); }
  else if (e.key === 'm') chars.forEach(c => c.setTint(0xffffff, 0.6));
  hud.textContent = help();
});
const hud = document.createElement('div');
hud.style.cssText = 'position:fixed;left:8px;top:8px;color:#eee;font:12px monospace;background:rgba(0,0,0,.45);padding:6px 8px;white-space:pre;pointer-events:none';
const help = () => `anim: ${curAnim}   [1-0,c,o,h,r,t] states  [a s f b x q e z v y] actions\n[d]ance [w]ave [u]cheer [l]augh [p]oint [n]bow [k]neel  [g] cycle tier  [m] hit tint  [space] turntable`;
if (!Q.has('nohud') && T === null) { hud.textContent = help(); document.body.appendChild(hud); }
let last = performance.now();
let frames = 0;
function frame() {
  const now = performance.now(); const dt = Math.min(0.05, (now - last) / 1000); last = now;
  if (T === null) {
    step(dt);
    if (playName && Q.has('loopPlay')) for (const c of chars) if (!c.anim.action && !c.anim.emote) c.play(playName);
    if (spin) for (const c of chars) c.root.rotation.y += spin * dt;
    for (const c of chars) { const u = c.U.uTint.value; if (u.w > 0) u.w = Math.max(0, u.w - dt * 2.5); }
  }
  G.uCamPos.value.copy(camera.position);
  renderer.render(dt, time);
  if (++frames === 3) window.__done = true; // deterministic screenshots: poses are frozen when ?t= is given
  requestAnimationFrame(frame);
}
frame();
window.__chars = chars;
