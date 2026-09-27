// Dragon lab: lava-cave stage, orbit camera, URL-driven element / action / state / frozen time.
// ?el=ember|frost|venom|storm|shadow  ?variant=boss|whelp|drake  ?seed=0
// ?anim=roar|bite|cleave|tailSwipe|breath|takeoff|land|deepBreath|stagger|enrage|wake|death  ?at=0 (action start time)
// ?fly=1 ?glide=1 ?hover=1 ?walk=3 (m/s) ?turn=0.3 ?sleep=1 ?dead=1 ?combat=1 ?enraged=1 ?alt=8 ?glow=1
// ?t=1.2 (simulate to t seconds then freeze) ?cam=hero|profile|head|below|front|back|top|low|mouth ?grid=1 (all elements)
// ?cp=x,y,z&ct=x,y,z (explicit camera) ?look=x,y,z (head look target) ?wire=1 ?nobloom=1 ?hud=0
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { Renderer } from '../engine/renderer.js';
import { G, lambert } from '../engine/materials.js';
import { paintAsh } from '../engine/paint.js';
import { blob } from '../engine/geom.js';
import { RNG } from '../core/noise.js';
import { createDragon } from '../models/dragon.js';

const Q = new URLSearchParams(location.search);
const num = (k, d) => (Q.has(k) ? parseFloat(Q.get(k)) : d);
const vec = (k) => (Q.has(k) ? Q.get(k).split(',').map(Number) : null);
const EL = Q.get('el') || 'ember';
const VARIANT = Q.get('variant') || 'boss';
const FREEZE = Q.has('t') ? num('t', 0) : null;

const app = document.createElement('div'); document.body.appendChild(app);
const R = new Renderer(app);
if (Q.get('nobloom') === '1') R.bloom.enabled = false;
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x120a0a);
const camera = new THREE.PerspectiveCamera(42, innerWidth / innerHeight, 0.1, 800);
R.setScene(scene, camera);

// ---------------- stage: lava cave (default) or neutral studio (?stage=studio, game-default lighting)
const STUDIO = Q.get('stage') === 'studio';
G.uFogColor.value.set(0x1c0f0c); G.uFogSunColor.value.set(0x5a2610); G.uFogDensity.value = 0.006; G.uFogHeight.value = 0.035;
const hemi = new THREE.HemisphereLight(0x7080b0, 0x8a3a18, 1.1); scene.add(hemi);
const sun = new THREE.DirectionalLight(0xffd6ac, 2.6);
sun.position.set(-12, 20, -14); sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -26, right: 26, top: 26, bottom: -26, near: 1, far: 90 });
sun.shadow.bias = -0.0005; sun.shadow.normalBias = 0.05;
scene.add(sun); scene.add(sun.target);
G.uSunDir.value.copy(sun.position).normalize();
const rimL = new THREE.DirectionalLight(0x8aa8ff, 2.4); rimL.position.set(14, 14, 22); scene.add(rimL);
const lavaA = new THREE.PointLight(0xff6a1c, 70, 40, 1.5); lavaA.position.set(-9, 1.2, -8); scene.add(lavaA);
const lavaB = new THREE.PointLight(0xff4a10, 50, 36, 1.5); lavaB.position.set(10, 1.0, 6); scene.add(lavaB);

function tex(cv) {
  const t = new THREE.DataTexture(cv.toRGBA(), cv.size, cv.size, THREE.RGBAFormat);
  t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.generateMipmaps = true;
  t.minFilter = THREE.LinearMipmapLinearFilter; t.magFilter = THREE.LinearFilter; t.anisotropy = 8; t.needsUpdate = true; return t;
}
const groundTex = tex(paintAsh(256, 8)); groundTex.repeat.set(14, 14);
const ground = new THREE.Mesh(new THREE.CircleGeometry(140, 64).rotateX(-Math.PI / 2), lambert({ map: groundTex, color: 0x8a7a70 }, { key: 'lab-ground' }));
ground.receiveShadow = true; scene.add(ground);
// lava pools
const lavaMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(3.2, 0.9, 0.18) });
if (STUDIO) {
  scene.background.set(0x46505c); G.uFogDensity.value = 0.0008; G.uFogColor.value.set(0x46505c); G.uFogSunColor.value.set(0x8a8070);
  hemi.color.set(0xbcd4f0); hemi.groundColor.set(0x5a6a3a); hemi.intensity = 1.2;
  sun.color.set(0xfff0d8); sun.intensity = 3.0; sun.position.set(Q.get('sun') === 'game' ? 0.5 : -0.55, 0.7, Q.get('sun') === 'game' ? 0.35 : -0.45).multiplyScalar(30);
  rimL.color.set(0xa0b8ff); rimL.intensity = 1.2; rimL.position.set(8, 6, 16);
  G.uSunDir.value.copy(sun.position).normalize();
  lavaA.intensity = 0; lavaB.intensity = 0; ground.material.color.set(0x9a9a90);
}
for (const [x, z, r] of (STUDIO ? [] : [[-9, -8, 2.6], [10, 6, 2.2], [-15, 10, 3.2], [16, -12, 2.8]])) {
  const m = new THREE.Mesh(new THREE.CircleGeometry(r, 32).rotateX(-Math.PI / 2), lavaMat); m.position.set(x, 0.02, z); scene.add(m);
}
// rocks / pillars
const rrng = new RNG(4);
const rockMat = lambert({ vertexColors: false, color: 0x4a3a34 }, { key: 'lab-rock' });
for (let i = 0; i < 14; i++) {
  const a = i / 14 * Math.PI * 2 + rrng.range(-0.2, 0.2), d = rrng.range(52, 70);
  const h = rrng.range(10, 30), r = rrng.range(3.5, 7);
  const g = blob(1, 2, v => 1 + 0.18 * Math.sin(v.x * 5 + i) * Math.cos(v.z * 4));
  const m = new THREE.Mesh(g, rockMat); m.scale.set(r, h, r); m.position.set(Math.cos(a) * d, h * 0.4, Math.sin(a) * d); m.castShadow = true; scene.add(m);
}

// ---------------- hoard (sleep shots): a gold mound + scattered coins and a few gems
if (Q.get('hoard') === '1' || (Q.get('sleep') === '1' && Q.get('hoard') !== '0')) {
  const hr = new RNG(9);
  const mound = blob(1, 4, v => 1 + 0.06 * Math.sin(v.x * 9) * Math.sin(v.z * 7) + 0.05 * Math.sin(v.x * 21 + v.z * 17));
  const pc = mound.attributes.position, col = [];
  for (let i = 0; i < pc.count; i++) { const f = 0.55 + 0.2 * Math.sin(pc.getX(i) * 40) * Math.sin(pc.getZ(i) * 37); col.push(0.62 * f, 0.36 * f, 0.08 * f); }
  mound.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  const gold = lambert({ vertexColors: true, color: 0xffffff }, { spec: 0.35, shine: 40, key: 'lab-gold' });
  const m = new THREE.Mesh(mound, gold); m.scale.set(9, 1.3, 11); m.position.set(0, -0.4, 0.5); m.receiveShadow = true; scene.add(m);
  const coinG = new THREE.CylinderGeometry(0.16, 0.16, 0.03, 10);
  const coins = new THREE.InstancedMesh(coinG, gold, 420);
  const mm = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler();
  for (let i = 0; i < 420; i++) {
    const a = hr.range(0, Math.PI * 2), r = Math.sqrt(hr.next()) * 12;
    const x = Math.cos(a) * r, z = Math.sin(a) * r * 1.1 + 0.5;
    const h = Math.max(0.02, 0.9 * (1 - (x * x) / 81 - ((z - 0.5) ** 2) / 121));
    q.setFromEuler(e.set(hr.range(-0.6, 0.6), hr.range(0, 6), hr.range(-0.6, 0.6)));
    mm.compose(new THREE.Vector3(x, h, z), q, new THREE.Vector3(1, 1, 1)); coins.setMatrixAt(i, mm);
  }
  scene.add(coins);
  const gemM = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.1, 0.6, 1.0) });
  for (let i = 0; i < 12; i++) { const g = new THREE.Mesh(new THREE.OctahedronGeometry(0.2), gemM); const a = hr.range(0, 6.28), r = hr.range(3, 10); g.position.set(Math.cos(a) * r, 0.4, Math.sin(a) * r); scene.add(g); }
}

// ---------------- dragons
// ?sheet=N : contact sheet — N instances of the same dragon, instance i simulated to t_i = t0 + i*(t1-t0)/(N-1)
const SHEET = Q.has('sheet') ? Math.max(2, Math.min(12, num('sheet', 6))) : 0;
const els = Q.get('grid') === '1' ? ['ember', 'frost', 'venom', 'storm', 'shadow'] : SHEET ? Array(SHEET).fill(EL) : [EL];
const dragons = [];
const tb0 = performance.now();
els.forEach((el, i) => {
  const t0 = performance.now();
  const d = createDragon({ element: el, variant: VARIANT, seed: num('seed', 0) });
  const ms = performance.now() - t0;
  const spacing = VARIANT === 'whelp' ? 2.2 : VARIANT === 'drake' ? 7 : 11;
  const k = i - (els.length - 1) / 2;
  d.root.position.x = SHEET ? 0 : k * spacing;
  if (els.length > 1 && !SHEET) { d.root.position.z = Math.abs(k) * spacing * 0.45; d.root.rotation.y = -k * 0.22; }
  scene.add(d.root);
  dragons.push(d);
  console.log(`[dragon] ${el} ${VARIANT} built in ${ms.toFixed(1)} ms`, JSON.stringify(d.stats));
});
const buildMs = performance.now() - tb0;
const D = dragons[0];

// ---------------- camera presets
const controls = new OrbitControls(camera, R.r.domElement);
controls.enableDamping = true;
const S = VARIANT === 'whelp' ? 0.095 : VARIANT === 'drake' ? 0.32 : 1;
const alt = num('alt', Q.get('fly') === '1' || Q.get('glide') === '1' || Q.get('hover') === '1' ? 9 : 0);
const presets = {
  hero: [[-13, 3.2, -15], [0, 4.2, -2.5]],
  profile: [[26, 5.5, -0.5], [0, 4, 0]],
  head: [[-3.6, 7.2, -10.6], [0, 6.4, -7.2]],
  mouth: [[-5.5, 5.6, -11.5], [0, 6.0, -7.2]],
  face: [[-4.2, 6.6, -11.8], [0, 6.3, -7.0]],
  below: [[7, -13 + alt, 20], [0, 3 + alt, -1]],
  front: [[0, 5, -23], [0, 4, 0]],
  back: [[8, 9, 22], [0, 4, 0]],
  top: [[0.1, 34, 0.1], [0, 0, 0]],
  low: [[-9, 1.2, -11], [0, 5, -3]],
  wide: [[-24, 9, -26], [0, 4, 0]],
};
let cp = presets[Q.get('cam') || 'hero'] || presets.hero;
if (els.length > 1 && !SHEET) cp = [[0, 12.5, -41], [0, 3.6, 6]];
const cpos = vec('cp') || cp[0].map(v => v * S), ctgt = vec('ct') || cp[1].map(v => v * S);
if (!vec('cp') && alt) { cpos[1] += Q.get('cam') === 'below' ? 0 : alt; ctgt[1] += Q.get('cam') === 'below' ? 0 : alt; }
camera.position.fromArray(cpos); controls.target.fromArray(ctgt); controls.update();

// ---------------- state
const state = {
  speed: num('walk', 0), turn: num('turn', 0), grounded: !(Q.get('fly') === '1' || Q.get('glide') === '1' || Q.get('hover') === '1'),
  flying: Q.get('fly') === '1' || Q.get('glide') === '1' || Q.get('hover') === '1', glide: Q.get('glide') === '1', hover: Q.get('hover') === '1',
  altitude: alt, dead: Q.get('dead') === '1', combat: Q.get('combat') === '1', enraged: Q.get('enraged') === '1', sleep: Q.get('sleep') === '1',
};
for (const d of dragons) {
  d.root.position.y = alt;
  if (Q.has('glow')) d.setGlow?.(num('glow', 1));
  if (Q.has('look')) { const v = vec('look'); d.setLookTarget?.(new THREE.Vector3(...v)); }
  d.onStep = (e) => { if (!FREEZE) console.log('[step]', e.foot, e.strength?.toFixed?.(2)); };
}
const anim = Q.get('anim'), animAt = num('at', 0);
let simT = 0, fired = false;
// scripted game-side state for transitions the game would drive (altitude / flags)
function script(st, tt, d) {
  const ta = tt - animAt;
  if (anim === 'takeoff' && ta >= 0) {
    const k = Math.min(1, Math.max(0, (ta - 0.75) / 1.6));
    st.altitude = 9 * k * k * (3 - 2 * k); st.flying = ta > 0.95; st.grounded = !st.flying; st.speed = st.flying ? 4 : 0;
  }
  if (anim === 'land') {
    const k = Math.min(1, Math.max(0, (ta + 0.2) / 1.15));
    st.altitude = 7 * (1 - k * k * (3 - 2 * k)); st.flying = ta < 0.95; st.grounded = !st.flying; st.speed = st.flying ? 3 : 0;
  }
  if (anim === 'wake' && ta >= 0) st.sleep = false;
  d.root.position.y = st.altitude ?? d.root.position.y;
}
function sim(dt) {
  simT += dt;
  G.uTime.value = simT;
  if (anim && !fired && simT >= animAt) { fired = true; for (const d of dragons) d.play(anim); }
  for (const d of dragons) { script(state, simT, d); d.update(dt, state); }
}

// ---------------- HUD
const hud = document.createElement('div');
hud.style.cssText = 'position:fixed;left:8px;top:6px;color:#fc9;font:12px/1.35 monospace;text-shadow:0 1px 2px #000;pointer-events:none;white-space:pre';
if (Q.get('hud') !== '0') document.body.appendChild(hud);

if (SHEET) {
  // simulate each instance to its own time, then render each into a cell of a 2D canvas
  const t0 = num('t0', 0), t1 = num('t1', 3);
  const times = dragons.map((_, i) => t0 + (t1 - t0) * i / (dragons.length - 1));
  for (let i = 0; i < dragons.length; i++) {
    let tt = 0; const d = dragons[i]; let fired2 = false;
    const st = { ...state };
    if (anim === 'land') { st.flying = true; st.grounded = false; }
    while (tt < times[i] - 1e-6) { const dt = Math.min(1 / 60, times[i] - tt); tt += dt; G.uTime.value = tt; if (anim && !fired2 && tt >= animAt) { fired2 = true; d.play(anim); } script(st, tt, d); d.update(dt, st); }
  }
  const cols = dragons.length <= 4 ? 2 : 3, rows = Math.ceil(dragons.length / cols);
  const cw = Math.floor(innerWidth / cols), ch = Math.floor(innerHeight / rows);
  const out = document.createElement('canvas'); out.width = cw * cols; out.height = ch * rows;
  out.style.cssText = 'position:fixed;left:0;top:0;width:100%;height:100%;z-index:5';
  const ctx2 = out.getContext('2d'); ctx2.fillStyle = '#000'; ctx2.fillRect(0, 0, out.width, out.height);
  const baseCam = camera.position.clone(), baseTgt = controls.target.clone();
  hud.style.zIndex = 6;
  dragons.forEach((d, i) => {
    dragons.forEach((o, j) => o.root.visible = i === j);
    camera.position.copy(baseCam); controls.target.copy(baseTgt); camera.lookAt(controls.target);
    camera.aspect = cw / ch; camera.updateProjectionMatrix();
    G.uCamPos.value.copy(camera.position); G.uTime.value = times[i];
    R.render(0.016, times[i]);
    ctx2.drawImage(R.r.domElement, 0, 0, R.r.domElement.width, R.r.domElement.height, (i % cols) * cw, Math.floor(i / cols) * ch, cw, ch);
    ctx2.fillStyle = '#fc9'; ctx2.font = '16px monospace'; ctx2.fillText(`${anim || 'idle'} t=${times[i].toFixed(2)}`, (i % cols) * cw + 8, Math.floor(i / cols) * ch + ch - 10);
  });
  document.body.appendChild(out);
}
if (FREEZE != null && !SHEET) { const dt = 1 / 60; while (simT < FREEZE - 1e-6) sim(Math.min(dt, FREEZE - simT)); }
// head-relative cameras (after the pose is settled): ?cam=hside|htop|hfront|h34
{
  const hc = { hside: [-5.2, 0.3, 0.2], htop: [-0.6, 5.5, 0.4], hfront: [-0.5, 0.6, -5.6], h34: [-3.8, 1.2, -4.2] }[Q.get('cam')];
  if (hc) {
    scene.updateMatrixWorld(true);
    const hp = D.sockets.head.getWorldPosition(new THREE.Vector3());
    const k = S * (Q.has('hz') ? num('hz', 1) : 1);
    camera.position.set(hp.x + hc[0] * k, hp.y + hc[1] * k, hp.z + hc[2] * k); controls.target.copy(hp); camera.lookAt(hp); controls.update();
  }
}
let last = performance.now(), frames = 0, acc = 0, fps = 0;
function loop() {
  requestAnimationFrame(loop);
  const now = performance.now(), dt = Math.min(0.05, (now - last) / 1000); last = now;
  const tu = performance.now();
  if (FREEZE == null && !SHEET) sim(dt);
  const upd = performance.now() - tu;
  if (SHEET) return;
  controls.update();
  G.uCamPos.value.copy(camera.position);
  R.render(dt, simT);
  frames++; acc += dt; if (acc > 0.5) { fps = frames / acc; frames = 0; acc = 0; }
  const info = R.r.info;
  const dcalls = dragons.reduce((a, d) => a + (d.root.visible ? 2 : 0), 0);
  hud.textContent = `Everdawn dragon lab — ${els.join(',')} (${VARIANT})  t=${simT.toFixed(2)}${anim ? ' anim=' + anim : ''}  dragon draw calls: ${dcalls} (+${dcalls} shadow)\n` +
    `verts ${D.stats.verts}  tris ${D.stats.tris}  build ${buildMs.toFixed(0)} ms ${JSON.stringify(D.stats.ms)}\n` +
    `draw calls ${info.render.calls}  fps ${fps.toFixed(0)}  update ${upd.toFixed(2)} ms`;
}
loop();
// ?sockets=1 : axes at every socket + a 12 m ray along the mouth socket's -Z (breath direction)
if (Q.get('sockets') === '1') {
  for (const [name, o] of Object.entries(D.sockets)) { if (['handL', 'handR', 'back'].includes(name)) continue; const ax = new THREE.AxesHelper(0.8 * S); ax.material.depthTest = false; ax.renderOrder = 10; o.add(ax); }
  const g = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, -12 * S)]);
  const ray = new THREE.Line(g, new THREE.LineBasicMaterial({ color: 0xffff40, depthTest: false }));
  ray.renderOrder = 11; D.sockets.mouth.add(ray);
}
// ?perf=1 : 1 boss + 15 whelps, measure update() cost (ms per frame) over 300 simulated frames
if (Q.get('perf') === '1') {
  const tW0 = performance.now();
  const whelps = [];
  for (let i = 0; i < 15; i++) { const w = createDragon({ element: EL, variant: 'whelp', seed: 1 }); w.root.position.set(-12 + (i % 5) * 6, 2 + Math.floor(i / 5) * 3, 14); scene.add(w.root); whelps.push(w); }
  const whelpMs = (performance.now() - tW0) / 15;
  const stF = { speed: 0, flying: true, altitude: 3 };
  let steps = 0; D.onStep = () => steps++;
  const stW = { speed: 3, turn: 0.2, grounded: true };
  D.setLookTarget(new THREE.Vector3(10, 2, -10));
  // warm up
  for (let i = 0; i < 30; i++) { D.update(1 / 60, stW); for (const w of whelps) w.update(1 / 60, stF); }
  let tb = 0, tw = 0;
  for (let i = 0; i < 300; i++) {
    const a = performance.now(); D.update(1 / 60, stW); const b = performance.now();
    for (const w of whelps) w.update(1 / 60, stF);
    const c = performance.now(); tb += b - a; tw += c - b;
  }
  console.log('[perf]', JSON.stringify({ bossUpdateMs: +(tb / 300).toFixed(3), whelps15UpdateMs: +(tw / 300).toFixed(3), whelpCreateMsAvg: +whelpMs.toFixed(2), stepsIn300Frames: steps, bossVerts: D.stats.verts, whelpVerts: whelps[0].stats.verts, bossBones: D.bones.length }));
}
window.__lab = { dragons, camera, controls, scene, state, THREE, R };
window.__done = true;
