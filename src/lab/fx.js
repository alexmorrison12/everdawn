// FX lab: stage + dummies + the game's HDR/bloom renderer.
// URL params:
//   ?fx=name        effect to demo (any burst / attach / projectile / ground / cone / beam name). Default: fireball.
//   ?t=0.4          deterministic: fire, advance exactly t seconds in 1/60 steps, then freeze (for screenshots).
//   ?gallery=1      grid of stations firing many effects at once (?gallery=spells|world|ground|breath|all).
//   ?stress=1       stress scene (hundreds of emitters, projectiles, bursts) + perf stats in window.__stats().
//   ?cam=near|mid|far|top  ?dist= ?yaw= ?pitch= ?tx= ?ty= ?tz=   camera.
//   ?sky=1          daylight sky background + fog (game-like) instead of the dark stage.
//   ?hud=0          hide the text overlay.   ?atlas=1  show the sprite atlas.
//   ?sheet=name@t[@cam],...&cols=3   contact sheet: each cell = reset, fire, advance t seconds, render (deterministic).
// Keys: ←/→ cycle effect · Space re-fire · G gallery · P pause · 1/2/3 camera distance.
// Console: __fire(name) · __selftest() (every name through its API, reports errors/leaks) · __stats() · __bench(n)
//          __benchSplit(n) (frame ms with vs without the FX group, FX draw calls) · __raidBreath(name, length, angle, t)
//          __dump() (live particle slots) · __fx (the FX instance)
import * as THREE from 'three';
import { Renderer } from '../engine/renderer.js';
import { G } from '../engine/materials.js';
import { FX } from '../fx/fx.js';

const Q = new URLSearchParams(location.search);
const num = (k, d) => (Q.has(k) ? +Q.get(k) : d);

// ------------------------------------------------------------------ renderer / scene
const app = document.createElement('div'); app.style.cssText = 'position:fixed;inset:0'; document.body.appendChild(app);
const R = new Renderer(app);
const scene = new THREE.Scene();
const SKY = Q.get('sky') === '1';
scene.background = new THREE.Color(SKY ? 0x8fb4dc : 0x0e1118);
const camera = new THREE.PerspectiveCamera(55, innerWidth / innerHeight, 0.2, 2400);
R.setScene(scene, camera);
if (!SKY) { G.uFogDensity.value = 0.0; } else { G.uFogColor.value.set(0xa9c4dc); G.uFogDensity.value = 0.0022; }
const hemi = new THREE.HemisphereLight(0xbcd4f0, 0x5a6a3a, 1.2); scene.add(hemi);
const sun = new THREE.DirectionalLight(0xfff0d8, 3.0); sun.position.set(0.5, 0.7, 0.35).multiplyScalar(50); scene.add(sun);
G.uSunDir.value.copy(sun.position).normalize();

// ------------------------------------------------------------------ terrain: flat centre, rolling hills beyond
const HN = 257, HO = -128;
function heightAt(x, z) {
  const r = Math.hypot(x, z);
  const k = Math.min(1, Math.max(0, (r - 14) / 18));
  const bump = 1.6 * Math.exp(-((x - 12) ** 2 + (z + 8) ** 2) / 18);   // test hill east of centre
  return k * (1.2 * Math.sin(x * 0.11) * Math.cos(z * 0.09) + 0.8 * Math.sin(x * 0.05 + z * 0.07)) + bump;
}
{
  const hd = new Uint16Array(HN * HN);
  for (let j = 0; j < HN; j++) for (let i = 0; i < HN; i++) hd[j * HN + i] = THREE.DataUtils.toHalfFloat(heightAt(HO + i, HO + j));
  const ht = new THREE.DataTexture(hd, HN, HN, THREE.RedFormat, THREE.HalfFloatType);
  ht.magFilter = ht.minFilter = THREE.LinearFilter; ht.needsUpdate = true;
  G.uHeightTex.value = ht; G.uHeightInfo.value.set(HN, HN, HO, HO);
  const cv = document.createElement('canvas'); cv.width = cv.height = 256;
  const g = cv.getContext('2d');
  g.fillStyle = SKY ? '#4d5e3a' : '#2a3128'; g.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 4000; i++) { g.fillStyle = `rgba(${SKY ? '90,110,60' : '60,70,55'},${Math.random() * 0.25})`; g.fillRect(Math.random() * 256, Math.random() * 256, 3, 3); }
  g.strokeStyle = 'rgba(255,255,255,0.06)'; g.lineWidth = 2; for (let i = 0; i <= 4; i++) { g.beginPath(); g.moveTo(i * 64, 0); g.lineTo(i * 64, 256); g.moveTo(0, i * 64); g.lineTo(256, i * 64); g.stroke(); }
  g.strokeStyle = 'rgba(255,255,255,0.13)'; g.lineWidth = 3; g.strokeRect(0, 0, 256, 256);
  const tex = new THREE.CanvasTexture(cv); tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.repeat.set(64, 64); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8;
  const geo = new THREE.PlaneGeometry(256, 256, 256, 256); geo.rotateX(-Math.PI / 2);
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) p.setY(i, heightAt(p.getX(i), p.getZ(i)));
  geo.computeVertexNormals();
  const ground = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ map: tex }));
  scene.add(ground);
}

// ------------------------------------------------------------------ dummies
function dummy(color, x, z, h = 1.85) {
  const root = new THREE.Object3D(); root.position.set(x, heightAt(x, z), z);
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.38, h - 0.76, 4, 12), new THREE.MeshLambertMaterial({ color }));
  body.position.y = h / 2; root.add(body);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.26, 16, 12), new THREE.MeshLambertMaterial({ color: 0xd8b090 }));
  head.position.y = h - 0.05; root.add(head);
  const handR = new THREE.Object3D(); handR.position.set(0.5, 1.15, -0.35); root.add(handR);
  const handL = new THREE.Object3D(); handL.position.set(-0.5, 1.15, -0.35); root.add(handL);
  const chest = new THREE.Object3D(); chest.position.set(0, 1.25, 0); root.add(chest);
  const headS = new THREE.Object3D(); headS.position.set(0, h + 0.2, 0); root.add(headS);
  const hm = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 6), new THREE.MeshLambertMaterial({ color: 0xd8b090 })); handR.add(hm);
  scene.add(root);
  return { root, handR, handL, chest, head: headS };
}
const hero = dummy(0x3050a0, -5, 3);
const target = dummy(0x9a3030, 5, -3);
hero.root.lookAt(target.root.position.x, hero.root.position.y, target.root.position.z); hero.root.rotateY(Math.PI);
target.root.lookAt(hero.root.position.x, target.root.position.y, hero.root.position.z); target.root.rotateY(Math.PI);
// weapon for swing trails: a sword on the hero's right hand (blade along local +Y)
const sword = new THREE.Object3D(); hero.handR.add(sword);
const blade = new THREE.Mesh(new THREE.BoxGeometry(0.06, 1.1, 0.02), new THREE.MeshLambertMaterial({ color: 0xc0c8d0 })); blade.position.y = 0.6; sword.add(blade);
// dragon head placeholder for cones (mouth socket, -Z = breath direction)
const dragon = new THREE.Object3D(); dragon.position.set(0, 7, -16); scene.add(dragon);
const dragonHead = new THREE.Mesh(new THREE.ConeGeometry(1.2, 3.5, 8), new THREE.MeshLambertMaterial({ color: 0x5a2a1a }));
dragonHead.rotation.x = -Math.PI / 2; dragonHead.position.z = 1.2; dragon.add(dragonHead);
const mouth = new THREE.Object3D(); mouth.position.set(0, 0, -0.6); dragon.add(mouth);
// volcano mountain for the far-plume test
let volcanoMesh = null;
function showVolcano() {
  if (volcanoMesh) return;
  const g = new THREE.CylinderGeometry(40, 380, 210, 40, 6, true); g.translate(0, 105, 0);
  const p = g.attributes.position; for (let i = 0; i < p.count; i++) { const y = p.getY(i); const a = Math.atan2(p.getZ(i), p.getX(i)); const k = 1 + 0.08 * Math.sin(a * 7 + y * 0.03); p.setX(i, p.getX(i) * k); p.setZ(i, p.getZ(i) * k); }
  g.computeVertexNormals();
  volcanoMesh = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ color: 0x4a3a34 }));
  volcanoMesh.position.set(0, -2, -640); scene.add(volcanoMesh);
  const far = new THREE.Mesh(new THREE.PlaneGeometry(4000, 4000), new THREE.MeshLambertMaterial({ color: SKY ? 0x55643e : 0x20261e })); far.rotation.x = -Math.PI / 2; far.position.y = -3; scene.add(far);
}
// torch pole
const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 1.8, 6), new THREE.MeshLambertMaterial({ color: 0x5a3a20 }));
pole.position.set(0, 0.9, 0); scene.add(pole); pole.visible = false;

// ------------------------------------------------------------------ FX
const fx = new FX(scene, camera, { heightAt, seed: 7, bakeHeight: Q.get('bake') === '1' ? { extent: 100 } : null });
console.log('fx init ms', fx.initMs.toFixed(1), 'textures ms', fx.tex.ms.toFixed(1));
let shake = 0;
fx.onShake = (a) => { shake = Math.max(shake, a); };
window.__fx = fx;

const N = FX.NAMES;
const FAMILY = {};
for (const fam in N) for (const n of N[fam]) if (!FAMILY[n]) FAMILY[n] = fam;
const ALL = [...N.projectile, ...N.burst, ...N.attach, ...N.ground, ...N.cone, ...N.beam.filter(n => !['holy', 'shadow', 'arcane', 'frost', 'fire'].includes(n)), 'swing'];
FAMILY.swing = 'swing';

// ------------------------------------------------------------------ camera
const CAMS = { near: [7, 0.25], mid: [12, 0.32], far: [20, 0.42], top: [16, 1.1] };
const cam = { dist: 12, yaw: 0.35, pitch: 0.32, target: new THREE.Vector3(0, 1.2, 0) };
function setCam(name) { const c = CAMS[name]; if (c) { cam.dist = c[0]; cam.pitch = c[1]; } }
setCam(Q.get('cam') || 'mid');
cam.dist = num('dist', cam.dist); cam.yaw = num('yaw', cam.yaw); cam.pitch = num('pitch', cam.pitch);
cam.target.set(num('tx', 0), num('ty', 1.2), num('tz', 0));
function placeCam() {
  const cy = Math.cos(cam.pitch);
  camera.position.set(cam.target.x + Math.sin(cam.yaw) * cy * cam.dist, cam.target.y + Math.sin(cam.pitch) * cam.dist, cam.target.z + Math.cos(cam.yaw) * cy * cam.dist);
  if (shake > 0) { camera.position.x += (Math.random() - 0.5) * shake * 0.3; camera.position.y += (Math.random() - 0.5) * shake * 0.3; }
  camera.lookAt(cam.target);
  G.uCamPos.value.copy(camera.position);
}

// ------------------------------------------------------------------ demos
let current = Q.get('fx') || 'fireball';
let handles = [], timers = [];
const V = (x, y, z) => new THREE.Vector3(x, y, z);
const handObjs = { castFire: 1, castFrost: 1, castHoly: 1, castShadow: 1, castArcane: 1 };
function clearDemo() { for (const h of handles) h.stop?.(0.05); handles = []; timers = []; pole.visible = false; }
function every(period, fn, first = 0) { timers.push({ t: first, period, fn }); }

function demo(name, at = V(0, 0, 0), opt = {}) {
  const fam = FAMILY[name];
  const gy = heightAt(at.x, at.z);
  const ground = V(at.x, gy, at.z);
  switch (fam) {
    case 'projectile': {
      const from = opt.from || hero.handR, to = opt.to || target.chest;
      const o = { speed: name === 'lavaBomb' ? 16 : undefined };
      if (name === 'lavaBomb') every(1.6, () => handles.push(fx.projectile(name, from.getWorldPosition(V()), V(to.getWorldPosition(V()).x, 0, to.getWorldPosition(V()).z), o)));
      else every(name === 'arcaneMissile' ? 0.35 : name === 'arrow' ? 0.5 : 1.1, () => handles.push(fx.projectile(name, from, to, o)));
      break;
    }
    case 'burst': {
      const impact = /Impact$|^hit$|^crit$|^blood$|fireBlast|arrowHit/.test(name);
      const p = impact ? (opt.chest || target.chest).getWorldPosition(V()) : name === 'lootBeam' ? V(at.x, gy, at.z) : name === 'meteorImpact' || name === 'eruption' || name === 'splash' || name === 'dust' || name === 'charge' ? ground : ground;
      const o = name === 'lootBeam' ? { color: opt.color ?? +(Q.get('color') || 0xa335ee) } : {};
      const period = { levelUp: 3.2, lootBeam: 99, eruption: 3.2, meteorImpact: 3, resurrect: 2.8, death: 2.6, frostNova: 2.4, thunderClap: 2, holyNova: 2, bigHeal: 2, heal: 1.6, questComplete: 2 }[name] || 1.3;
      every(period, () => handles.push(fx.burst(name, p, o)));
      break;
    }
    case 'attach': {
      let obj = opt.obj || hero.root, pos = null, o = {};
      if (handObjs[name]) obj = opt.hand || hero.handR;
      if (name === 'torch') { pole.visible = !opt.obj; pole.position.set(at.x, gy + 0.9, at.z); pos = opt.obj ? null : V(at.x, gy + 1.85, at.z); }
      if (name === 'candle') obj = opt.obj || target.head;
      if (/campfire|fireflies|fallingLeaves|dustMotes|waterfallMist|portal|chimneySmoke/.test(name)) pos = name === 'chimneySmoke' ? V(at.x, gy + 5, at.z) : name === 'waterfallMist' ? V(at.x, gy, at.z) : ground;
      if (name === 'portal') { pos = V(at.x, gy, at.z - (opt.at ? 0 : 6)); o.facing = 0; }
      if (name === 'volcanoSmoke') { pos = opt.at ? ground : V(0, 205, -640); if (!opt.at) showVolcano(); }
      if (name === 'fireflies') o.radius = 6;
      handles.push(fx.attach(name, pos || obj, o));
      break;
    }
    case 'ground': {
      const o = {};
      if (name === 'telegraphCone') { o.radius = 8; o.angle = Math.PI / 3; o.dir = V(1, 0, -0.6); o.duration = 2.2; }
      else if (name === 'telegraphLine') { o.length = 14; o.width = 3.5; o.dir = V(1, 0, 0.35); o.duration = 2.2; }
      else if (name === 'telegraphCircle') { o.radius = 4; o.duration = 2.2; }
      else if (name === 'lavaCrack') { o.radius = 1.4; o.length = 10; o.dir = V(1, 0, 0.3); }
      const p = name === 'telegraphLine' || name === 'lavaCrack' ? V(at.x - 6, 0, at.z - 1) : at;
      if (name.startsWith('telegraph')) every(2.8, () => handles.push(fx.ground(name, p, o)));
      else if (name === 'flamestrike') every(4, () => handles.push(fx.ground(name, p, o)));
      else handles.push(fx.ground(name, p, o));
      break;
    }
    case 'cone': {
      handles.push(fx.cone(name, opt.mouth || mouth, { length: 16, angle: 0.55 }));
      break;
    }
    case 'beam': {
      every(name === 'lightning' ? 0.6 : 1.4, () => handles.push(fx.beam(name, hero.handR, target.chest, {})));
      break;
    }
    case 'swing': {
      every(0.9, () => { swingT = 0; handles.push(fx.swing(sword, { duration: 0.28, width: 1.2 })); });
      break;
    }
  }
}
let swingT = 99;

// ------------------------------------------------------------------ gallery / stress
const GALLERIES = {
  spells: ['fireball', 'pyroblast', 'frostbolt', 'arcaneMissile', 'shadowBolt', 'lavaBomb', 'fireImpact', 'frostImpact', 'arcaneImpact', 'shadowImpact', 'holyImpact', 'fireBlast'],
  world: ['campfire', 'torch', 'chimneySmoke', 'fireflies', 'fallingLeaves', 'portal', 'waterfallMist', 'dustMotes', 'lootBeam', 'levelUp', 'consecrate', 'firePool'],
  ground: ['telegraphCircle', 'telegraphCone', 'telegraphLine', 'firePool', 'frostPool', 'poisonPool', 'voidPool', 'stormPool', 'consecrate', 'flamestrike', 'lavaCrack', 'eruption'],
  auras: ['shield', 'renew', 'burning', 'frozen', 'poisoned', 'enrage', 'whirlwind', 'ghostAura', 'castFire', 'castFrost', 'castHoly', 'castShadow', 'castArcane', 'heal'],
  novas: ['thunderClap', 'frostNova', 'holyNova', 'levelUp', 'meteorImpact', 'enrageBurst', 'bigHeal', 'resurrect', 'questComplete', 'spawnPuff', 'death', 'whelpSpawn'],
};
const stations = [];
function stationDummy(x, z) {
  const d = dummy(0x505a70, x, z);
  return d;
}
function gallery(list, spacing = 9) {
  const cols = Math.ceil(Math.sqrt(list.length * 1.6));
  list.forEach((name, i) => {
    const cx = (i % cols - (cols - 1) / 2) * spacing, cz = (Math.floor(i / cols) - (Math.ceil(list.length / cols) - 1) / 2) * spacing;
    const fam = FAMILY[name];
    const d = stationDummy(cx, cz);
    const opt = { at: V(cx, 0, cz), obj: d.root, hand: d.handR, chest: d.chest };
    if (fam === 'projectile') { const src = stationDummy(cx - 4, cz + 2); opt.from = src.handR; opt.to = d.chest; }
    if (name === 'candle') opt.obj = d.head;
    if (name === 'volcanoSmoke' || name === 'portal') opt.at = V(cx, 0, cz);
    if (fam === 'ground' || /campfire|portal|lootBeam|fireflies|waterfallMist|chimneySmoke|fallingLeaves|dustMotes|torch|levelUp|eruption|meteorImpact/.test(name)) d.root.visible = false;
    if (fam === 'ground' || fam === 'burst') { demo(name, V(cx, 0, cz), opt); }
    else demo(name, V(cx, 0, cz), opt);
    stations.push({ name, x: cx, z: cz });
  });
}

const stress = { on: false };
function stressScene() {
  stress.on = true;
  // 120 torches, 80 candles (kobold helmets), 24 campfires, 12 chimneys, fireflies & leaves areas
  for (let i = 0; i < 120; i++) { const a = i / 120 * Math.PI * 2, r = 30 + (i % 3) * 6; const x = Math.cos(a) * r, z = Math.sin(a) * r; handles.push(fx.attach('torch', V(x, heightAt(x, z) + 1.8, z))); }
  const kob = [];
  for (let i = 0; i < 80; i++) { const o = new THREE.Object3D(); const x = (i % 10 - 4.5) * 2.2, z = 12 + Math.floor(i / 10) * 2.2; o.position.set(x, heightAt(x, z) + 1.3, z); scene.add(o); kob.push(o); handles.push(fx.attach('candle', o)); }
  for (let i = 0; i < 24; i++) { const a = i / 24 * Math.PI * 2; const x = Math.cos(a) * 20, z = Math.sin(a) * 20; handles.push(fx.attach('campfire', V(x, heightAt(x, z), z))); }
  for (let i = 0; i < 12; i++) { const x = -40 + i * 7, z = -30; handles.push(fx.attach('chimneySmoke', V(x, heightAt(x, z) + 6, z))); }
  handles.push(fx.attach('fireflies', V(0, 0, 0), { radius: 25, count: 200 }));
  handles.push(fx.attach('fallingLeaves', V(0, 0, 0), { radius: 25, rate: 30 }));
  handles.push(fx.attach('volcanoSmoke', V(0, 70, -600)));
  handles.push(fx.attach('portal', V(0, 0, -28)));
  for (const n of ['shield', 'renew', 'burning', 'enrage', 'poisoned', 'whirlwind']) handles.push(fx.attach(n, stationDummy((Math.random() - 0.5) * 30, (Math.random() - 0.5) * 10 - 8).root));
  handles.push(fx.ground('firePool', V(-10, 0, 6), { radius: 5 }));
  handles.push(fx.ground('consecrate', V(10, 0, 6), { radius: 5, duration: 1e9 }));
  handles.push(fx.cone('fireBreath', mouth, { length: 16, angle: 0.55 }));
  // 12 casters shooting continuously; bursts every frame
  const casters = []; for (let i = 0; i < 12; i++) casters.push(stationDummy(-18 + i * 3, 8));
  const names = ['fireball', 'frostbolt', 'arcaneMissile', 'shadowBolt', 'arrow', 'pyroblast'];
  every(0.1, () => { const c = casters[(Math.random() * casters.length) | 0]; handles.push(fx.projectile(names[(Math.random() * names.length) | 0], c.handR, target.chest)); });
  const bn = ['hit', 'crit', 'fireImpact', 'frostImpact', 'holyImpact', 'heal', 'blood', 'dust'];
  every(0.08, () => fx.burst(bn[(Math.random() * bn.length) | 0], V((Math.random() - 0.5) * 30, 1.2, (Math.random() - 0.5) * 20)));
  every(1.5, () => fx.burst(['thunderClap', 'frostNova', 'holyNova', 'meteorImpact'][(Math.random() * 4) | 0], V((Math.random() - 0.5) * 30, 0, (Math.random() - 0.5) * 20)));
  cam.dist = num('dist', 42); cam.pitch = num('pitch', 0.45); cam.yaw = num('yaw', cam.yaw);
  cam.target.set(num('tx', 0), num('ty', 1.2), num('tz', 0));
}

// ------------------------------------------------------------------ HUD
const hud = document.createElement('div');
hud.style.cssText = 'position:fixed;left:10px;top:8px;font:13px/1.35 monospace;color:#cfe;text-shadow:0 1px 2px #000;pointer-events:none;white-space:pre';
if (Q.get('hud') !== '0') document.body.appendChild(hud);

// ------------------------------------------------------------------ start
const G_ARG = Q.get('gallery');
if (G_ARG) {
  const list = G_ARG === 'all' || G_ARG === '1' ? GALLERIES.spells.concat(GALLERIES.novas) : (GALLERIES[G_ARG] || G_ARG.split(','));
  gallery(list, num('spacing', 9));
  if (!Q.has('dist')) cam.dist = Math.max(24, Math.sqrt(list.length) * 9 * 1.3);
  if (!Q.has('pitch')) cam.pitch = 0.55;
  hero.root.visible = target.root.visible = false;
} else if (Q.get('stress')) stressScene();
else if (!Q.get('sheet')) { demo(current); camFor(current); }
function camFor(name, preset) {
  setCam(preset || Q.get('cam') || 'mid');
  cam.yaw = num('yaw', 0.35); cam.target.set(num('tx', 0), num('ty', 1.2), num('tz', 0));
  if (Q.has('dist')) cam.dist = +Q.get('dist'); if (Q.has('pitch')) cam.pitch = +Q.get('pitch');
  if (name === 'volcanoSmoke') { cam.target.set(0, 200, -640); cam.dist = num('dist', 650); cam.pitch = num('pitch', -0.27); cam.yaw = num('yaw', 0); }
  if (FAMILY[name] === 'cone' && !Q.has('dist')) { cam.target.set(0, 2, -6); cam.dist = 20; cam.yaw = 1.1; cam.pitch = 0.25; }
  if (name === 'portal' && !Q.has('dist')) { cam.target.set(0, 3, -6); cam.dist = 14; cam.yaw = 0.3; cam.pitch = 0.12; }
  if (FAMILY[name] === 'ground' && !preset && !Q.has('dist')) { cam.dist = 15; cam.pitch = 0.6; }
  if (/^cast/.test(name) && !Q.has('tx')) { const c = hero.handR.getWorldPosition(V()); cam.target.set(c.x, c.y, c.z); if (!Q.has('dist') && !preset) cam.dist = 3.2; cam.pitch = 0.2; cam.yaw = 1.2; }
  if (FAMILY[name] === 'attach' && /shield|renew|burning|frozen|poisoned|enrage|whirlwind|ghostAura/.test(name) && !Q.has('tx')) { const c = hero.root.position; cam.target.set(c.x, c.y + 1.1, c.z); if (!Q.has('dist') && !preset) cam.dist = 6; }
  if (/torch|candle/.test(name) && !Q.has('tx')) { const c = name === 'candle' ? target.head.getWorldPosition(V()) : V(0, 1.8, 0); cam.target.copy(c); if (!Q.has('dist') && !preset) cam.dist = name === 'candle' ? 2.2 : 3.5; cam.pitch = 0.15; }
  if (/campfire/.test(name) && !Q.has('tx')) { cam.target.set(0, 0.8, 0); if (!Q.has('dist') && !preset) cam.dist = 6; }
  if (FAMILY[name] === 'burst' && /Impact$|^hit$|^crit$|^blood$|fireBlast|arrowHit/.test(name) && name !== 'meteorImpact' && !Q.has('tx')) { const c = target.chest.getWorldPosition(V()); cam.target.set(c.x, c.y, c.z); if (!Q.has('dist') && !preset) cam.dist = 8; }
  if (/chimneySmoke|fallingLeaves/.test(name) && !Q.has('dist')) { cam.target.set(0, 4, 0); cam.dist = 16; }
}

if (Q.get('atlas') === '1') {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(8, 8), new THREE.MeshBasicMaterial({ map: fx.tex.atlas, transparent: true }));
  m.position.set(0, 5, 0); scene.add(m);
  const bg = new THREE.Mesh(new THREE.PlaneGeometry(8.2, 8.2), new THREE.MeshBasicMaterial({ color: 0x000000 })); bg.position.set(0, 5, -0.01); scene.add(bg);
  cam.target.set(num('tx', 0), num('ty', 5), 0); cam.dist = num('dist', 9); cam.pitch = 0; cam.yaw = 0;
}

// ------------------------------------------------------------------ contact sheet: ?sheet=name@t[@cam],...&cols=3
function sheet(spec) {
  const cells = spec.split(',').map(c => { const [name, t, cp] = c.split('@'); return { name, t: +(t || 0.3), cp }; });
  const cols = num('cols', 3), rows = Math.ceil(cells.length / cols);
  const W = innerWidth, H = innerHeight, cw = Math.floor(W / cols), ch = Math.floor(cw * H / W);
  const out = document.createElement('canvas'); out.width = cw * cols; out.height = ch * rows;
  out.style.cssText = 'position:fixed;left:0;top:0;z-index:10;background:#000';
  const g = out.getContext('2d');
  for (let i = 0; i < cells.length; i++) {
    const c = cells[i];
    fx.reset(7); clearDemo(); simTime = 0; swingT = 99; shake = 0;
    for (const h of scene.children.filter(o => o.userData.station)) scene.remove(h);
    current = c.name; camFor(c.name, c.cp); demo(c.name);
    for (let k = 0; k < Math.round(c.t * 60); k++) step(1 / 60);
    placeCam(); R.render(1 / 60, simTime);
    g.drawImage(R.r.domElement, (i % cols) * cw, Math.floor(i / cols) * ch, cw, ch);
    g.fillStyle = '#fff'; g.font = '15px monospace'; g.shadowColor = '#000'; g.shadowBlur = 3;
    g.fillText(`${c.name} @${c.t}s  n=${fx.stats().particles}`, (i % cols) * cw + 8, Math.floor(i / cols) * ch + 20);
    g.shadowBlur = 0; g.strokeStyle = '#000'; g.strokeRect((i % cols) * cw, Math.floor(i / cols) * ch, cw, ch);
  }
  document.body.appendChild(out);
  window.__sheetDone = true;
}

// ------------------------------------------------------------------ loop
let paused = false, lastT = performance.now(), simTime = 0;
const frameMs = [], fxMs = [];
function step(dt) {
  simTime += dt;
  // animate: target strafes slowly (homing test), sword swing
  if (!G_ARG && !stress.on) {
    const tz = -3 + Math.sin(simTime * 0.8) * 2.5;
    target.root.position.set(5, heightAt(5, tz), tz);
  }
  swingT += dt;
  const sw = Math.min(1, swingT / 0.28);
  hero.handR.rotation.set(0, 0, 0);
  sword.rotation.set(-1.9 + sw * 3.2, 0, 0.3 - sw * 1.2);
  // dragon head sweeps
  const sweep = Math.sin(simTime * 0.6) * 0.35;
  dragon.lookAt(Math.sin(sweep) * 16, 0, -16 + Math.cos(sweep) * 16);
  dragon.rotateY(Math.PI);
  for (const t of timers) { t.t -= dt; if (t.t <= 0) { t.t += t.period; t.fn(); } }
  const t0 = performance.now();
  fx.update(dt);
  fxMs.push(performance.now() - t0); if (fxMs.length > 120) fxMs.shift();
  shake = Math.max(0, shake - dt * 2);
}
// deterministic freeze
const FREEZE = Q.has('t') ? +Q.get('t') : null;
if (FREEZE !== null) { for (let i = 0; i < Math.round(FREEZE * 60); i++) step(1 / 60); paused = true; }

function frame() {
  requestAnimationFrame(frame);
  const now = performance.now();
  const dt = Math.min(0.05, (now - lastT) / 1000); lastT = now;
  frameMs.push(dt * 1000); if (frameMs.length > 120) frameMs.shift();
  if (!paused) step(dt);
  placeCam();
  R.render(dt, simTime);
  if (hud.parentNode) {
    const st = fx.stats(), info = R.r.info.render;
    hud.textContent = `${G_ARG ? 'gallery: ' + G_ARG : stress.on ? 'STRESS' : current + '  (' + FAMILY[current] + ')'}${paused ? '  [frozen t=' + (FREEZE ?? '') + ']' : ''}\n` +
      `particles ${st.particles}  tasks ${st.tasks}  draw calls ${info.calls}  tris ${info.triangles}\n` +
      `fx.update ${avg(fxMs).toFixed(2)} ms  frame ${avg(frameMs).toFixed(1)} ms`;
  }
}
const avg = a => a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0;
if (Q.get('sheet')) { hud.remove(); sheet(Q.get('sheet')); } else frame();

// ------------------------------------------------------------------ controls
addEventListener('keydown', e => {
  const i = ALL.indexOf(current);
  if (e.code === 'ArrowRight' || e.code === 'ArrowLeft') {
    current = ALL[(i + (e.code === 'ArrowRight' ? 1 : ALL.length - 1)) % ALL.length];
    clearDemo(); demo(current);
  }
  if (e.code === 'Space') { clearDemo(); demo(current); }
  if (e.code === 'KeyP') paused = !paused;
  if (e.code === 'Digit1') setCam('near'); if (e.code === 'Digit2') setCam('mid'); if (e.code === 'Digit3') setCam('far');
  if (e.code === 'KeyG') location.search = '?gallery=spells';
});
let drag = null;
addEventListener('pointerdown', e => { drag = [e.clientX, e.clientY]; });
addEventListener('pointerup', () => { drag = null; });
addEventListener('pointermove', e => { if (!drag) return; cam.yaw -= (e.clientX - drag[0]) * 0.005; cam.pitch = Math.max(-0.2, Math.min(1.4, cam.pitch + (e.clientY - drag[1]) * 0.005)); drag = [e.clientX, e.clientY]; });
addEventListener('wheel', e => { cam.dist = Math.max(2, Math.min(800, cam.dist * Math.pow(1.1, Math.sign(e.deltaY)))); });

// perf: synchronous bench — N frames of update+render, GPU-synced via a 1-pixel readback
window.__stats = () => ({ ...fx.stats(), calls: R.r.info.render.calls, tris: R.r.info.render.triangles, fxUpdateMs: +avg(fxMs).toFixed(3), frameMs: +avg(frameMs).toFixed(2) });
window.__bench = (n = 120) => {
  const gl = R.r.getContext(), px = new Uint8Array(4);
  let fxT = 0; const t0 = performance.now();
  for (let i = 0; i < n; i++) {
    const a = performance.now(); step(1 / 60); fxT += performance.now() - a;
    placeCam(); R.render(1 / 60, simTime);
    gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
  }
  const ms = (performance.now() - t0) / n;
  return { msPerFrame: +ms.toFixed(2), fxUpdateMs: +(fxT / n).toFixed(3), ...fx.stats(), calls: R.r.info.render.calls };
};
// raid-scale breath test: dragon 9 m up breathing toward +Z, camera beside the raid
window.__raidBreath = (name = 'fireBreath', length = 34, angle = 1.05, t = 1.2) => {
  fx.reset(5); clearDemo();
  const o = new THREE.Object3D(); o.position.set(0, 9, -22); scene.add(o); o.lookAt(0, 0, 10); o.rotateY(Math.PI);
  fx.cone(name, o, { length, angle, duration: 3 });
  for (let i = 0; i < Math.round(t * 60); i++) fx.update(1 / 60);
  cam.target.set(0, 3, -6); cam.dist = 34; cam.yaw = 1.25; cam.pitch = 0.3; placeCam(); paused = true;
  return fx.stats().particles;
};
window.__fire = (name, opt) => { clearDemo(); current = name; demo(name, V(0, 0, 0), opt || {}); };
window.__dump = () => {
  const out = [];
  for (const [name, p] of Object.entries(fx.pools)) {
    const d = p.data, now = fx.time;
    for (let i = 0; i < p.size; i++) { const b = i * 28, age = now - d[b + 3]; if (age >= 0 && (age <= d[b + 7] || (d[b + 23] & 32))) out.push({ pool: name, slot: i, held: i >= p.ring, pos: [d[b], d[b + 1], d[b + 2]].map(v => +v.toFixed(2)), anchor: d[b + 22], sprite: d[b + 20], ramp: d[b + 19], flags: d[b + 23] }); }
  }
  return { n: out.length, anchors: Array.from(fx.anchors.data.slice(0, 16)).map(v => +v.toFixed(2)), held: out.filter(o => o.held) };
};
window.__benchSplit = (n = 120) => {
  const on = window.__bench(n);
  fx.group.visible = false;
  const off = window.__bench(n);
  fx.group.visible = true;
  return { withFx: on.msPerFrame, withoutFx: off.msPerFrame, fxGpuCpuMs: +(on.msPerFrame - off.msPerFrame).toFixed(2), fxDrawCalls: on.calls - off.calls, particles: on.particles, fxUpdateMs: on.fxUpdateMs, tasks: on.tasks };
};
// ------------------------------------------------------------------ self test: every name, every API path
window.__selftest = () => {
  const res = { ok: [], fail: [], leaks: [] };
  const errs = []; const oe = console.error; console.error = (...a) => { errs.push(a.map(String).join(' ')); oe(...a); };
  const run = (label, fn, secs = 3) => {
    fx.reset(1); errs.length = 0;
    try {
      const h = fn();
      for (let i = 0; i < secs * 60; i++) fx.update(1 / 60);
      h?.stop?.(0.1);
      for (let i = 0; i < 6 * 60; i++) fx.update(1 / 60);     // let everything die
      const st = fx.stats();
      if (errs.length) res.fail.push(label + ': ' + errs[0]);
      else res.ok.push(label);
      if (st.tasks > 0 || st.particles > 0 || st.anchors > 0) res.leaks.push(`${label}: tasks=${st.tasks} particles=${st.particles} anchors=${st.anchors}`);
    } catch (e) { res.fail.push(label + ': ' + e.message); }
  };
  const P = V(0, 1.2, 0);
  for (const n of FX.NAMES.burst) run('burst:' + n, () => fx.burst(n, P, { dir: V(1, 0, 0) }));
  for (const n of FX.NAMES.attach) run('attach:' + n, () => fx.attach(n, hero.root));
  for (const n of FX.NAMES.projectile) run('projectile:' + n, () => fx.projectile(n, hero.handR, target.chest, { onHit: () => {} }));
  for (const n of FX.NAMES.ground) run('ground:' + n, () => fx.ground(n, V(0, 0, 0), { radius: 4, duration: 2, dir: 0.5, length: 10, width: 3 }));
  for (const n of FX.NAMES.cone) run('cone:' + n, () => fx.cone(n, mouth, { length: 14, angle: 0.6, duration: 2 }));
  for (const n of FX.NAMES.beam) run('beam:' + n, () => fx.beam(n, hero.handR, target.chest, { duration: 1 }));
  run('swing', () => fx.swing(sword, { duration: 0.3 }));
  run('recolor', () => { fx.burst('fireImpact', P, { color: 0x40ff40 }); return fx.attach('campfire', V(0, 0, 0), { color: 0x6080ff }); });
  run('attach-removed-object', () => { const o = new THREE.Object3D(); scene.add(o); const h = fx.attach('burning', o); setTimeout(() => {}, 0); scene.remove(o); return null; });
  console.error = oe;
  return { total: res.ok.length + res.fail.length, ok: res.ok.length, fail: res.fail, leaks: res.leaks };
};
