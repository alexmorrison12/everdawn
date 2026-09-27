// Creature lab: lineup / turntable / filmstrip QA for src/models/creatures.js
// URL params:
//   type=wolf,boar | all        variant=grey (only with a single type) · elite=1
//   anim=idle|walk|trot|run|<action>   speed=m/s   turn=rad/s   combat=1   air=1   loop=seconds (one-shot repeat)
//   cam=3q|side|front|back|top|close|head   dist=m   rot=turntable rad/s   yaw=deg   pitch=deg   fov
//   strip=N (N copies of each type, gait phases spread over one cycle, frozen)   t=seconds (freeze at time)
//   move=1 (creatures really translate; camera tracks)   grid=1 (checker ground)   scale=   stats=1   dt=
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { Renderer } from '../engine/renderer.js';
import { G } from '../engine/materials.js';
import { createCreature, creatureStats, CREATURE_TYPES, creatureInfo, preloadCreatures } from '../models/creatures.js';
import { paintGrass } from '../engine/paint.js';

const Q = new URLSearchParams(location.search);
const num = (k, d) => Q.has(k) ? +Q.get(k) : d;
const anim = Q.get('anim') || 'idle';
const LOCO = { idle: 0, walk: 1.3, trot: 3.2, run: 7.5 };

const app = document.createElement('div'); app.style.cssText = 'position:fixed;inset:0'; document.body.appendChild(app);
const renderer = new Renderer(app);
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x9fb8d0);
const camera = new THREE.PerspectiveCamera(num('fov', 35), innerWidth / innerHeight, 0.05, 500);
renderer.setScene(scene, camera);
scene.add(new THREE.HemisphereLight(0xbcd4f0, 0x5a6a3a, 1.2));
const sun = new THREE.DirectionalLight(0xfff0d8, 3.0);
sun.position.set(0.5, 0.7, 0.35).multiplyScalar(40);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -16, right: 16, top: 16, bottom: -16, near: 1, far: 120 });
sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.02;
scene.add(sun); scene.add(sun.target);
G.uSunDir.value.copy(sun.position).normalize();
G.uFogDensity.value = 0.0;

// ground
const gcv = document.createElement('canvas'); gcv.width = gcv.height = 256;
const gx = gcv.getContext('2d');
if (Q.get('grid') === '1') {
  for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) { gx.fillStyle = (x + y) % 2 ? '#6d8a4a' : '#5c7a3e'; gx.fillRect(x * 32, y * 32, 32, 32); }
} else {
  const g = paintGrass(256, 3);
  gx.putImageData(new ImageData(new Uint8ClampedArray(g.toRGBA()), 256, 256), 0, 0);
}
const gtex = new THREE.CanvasTexture(gcv); gtex.wrapS = gtex.wrapT = THREE.RepeatWrapping; gtex.repeat.set(40, 40); gtex.colorSpace = THREE.SRGBColorSpace; gtex.anisotropy = 8;
// ?hills=A : rolling terrain (creatures get setGround → feet plant on slopes, bodies tilt)
const HA = num('hills', 0);
const heightAt = (x, z) => HA * (Math.sin(x * 0.45) * Math.cos(z * 0.35) + 0.5 * Math.sin(x * 0.9 + z * 0.7));
const gGeo = new THREE.PlaneGeometry(120, 120, HA ? 240 : 1, HA ? 240 : 1); gGeo.rotateX(-Math.PI / 2);
if (HA) { const p = gGeo.attributes.position; for (let i = 0; i < p.count; i++) p.setY(i, heightAt(p.getX(i), p.getZ(i))); gGeo.computeVertexNormals(); }
const ground = new THREE.Mesh(gGeo, new THREE.MeshLambertMaterial({ map: gtex }));
ground.receiveShadow = true; scene.add(ground);

// ---------- lineup ----------
let types = (Q.get('type') || 'all');
types = types === 'all' ? CREATURE_TYPES() : types.split(',');
const specs = [];
for (const t0 of types) {
  const [t, v] = t0.split(':');           // "wolf:greymaw" picks one variant
  const info = creatureInfo(t);
  if (v) specs.push({ type: t, variant: v });
  else if (Q.has('variant') && Q.get('variant')) specs.push({ type: t, variant: Q.get('variant'), elite: Q.get('elite') === '1' });
  else if (Q.has('variant')) specs.push({ type: t, variant: info.variants[0] });
  else for (const vv of info.variants) specs.push({ type: t, variant: vv });
}
types = types.map(t => t.split(':')[0]);
const strip = num('strip', 0);
const T0 = performance.now();
const items = [];
const buildLog = [];
for (const s of specs) {
  const n = strip || 1;
  for (let i = 0; i < n; i++) {
    const t1 = performance.now();
    const c = createCreature(s.type, { variant: s.variant, elite: s.elite, scale: num('scale', 1) });
    buildLog.push(`${s.type}/${s.variant} #${i}: ${(performance.now() - t1).toFixed(1)} ms`);
    items.push({ c, spec: s, i });
  }
}
const buildMs = performance.now() - T0;
// layout: every creature faces +X (root.rotation.y = -PI/2); camera yaw is measured from the creature's right side
// (0 = right side view, 90 = front, -90 = back); the row runs along the screen-horizontal axis.
const facing = -Math.PI / 2;
const angles = { '3q': [40, 12], side: [0, 4], front: [90, 6], back: [-90, 8], top: [0, 70], close: [60, 8], head: [75, 4], rear3q: [-40, 14] };
const cam = Q.get('cam') || '3q';
let [yaw, pitch] = angles[cam] || angles['3q'];
yaw = num('yaw', yaw); pitch = num('pitch', pitch);
const yr0 = THREE.MathUtils.degToRad(yaw);
const rowDir = new THREE.Vector3(Math.cos(yr0), 0, -Math.sin(yr0));
let x = 0;
const gap = num('gap', 0.5);
for (const it of items) { const w = Math.max(it.c.radius * 2.4, 0.6); it.x = x + w / 2; x += w + gap; }
const total = x - gap;
for (const it of items) {
  it.c.root.position.copy(rowDir).multiplyScalar(it.x - total / 2);
  it.c.root.rotation.y = facing;
  scene.add(it.c.root);
}
const gridMode = !strip && Q.get('hero') !== '1' && new Set(items.map(i => i.spec.type)).size > 2 && Q.get('row') !== '1';
let gridExtent = 0;
if (gridMode) { // one row per type (variants along the row), rows receding in depth
  const depthDir = new THREE.Vector3(Math.sin(yr0), 0, Math.cos(yr0)).multiplyScalar(-1);
  const byType = []; for (const it of items) { let r = byType.find(r => r.type === it.spec.type); if (!r) byType.push(r = { type: it.spec.type, list: [] }); r.list.push(it); }
  let depth = 0;
  for (const row of byType) {
    const rr = Math.max(...row.list.map(i => i.c.radius));
    let xx = 0; const pos = row.list.map(it => { const w = Math.max(it.c.radius * 2.6, 0.5); const p = xx + w / 2; xx += w + 0.25; return p; });
    row.list.forEach((it, i) => it.c.root.position.copy(rowDir).multiplyScalar(pos[i] - xx / 2).addScaledVector(depthDir, depth + rr));
    depth += rr * 2 + 0.6; gridExtent = Math.max(gridExtent, xx);
  }
  gridExtent = Math.max(gridExtent, depth);
}
if (Q.get('hero') === '1') { // curated two-row layout: regular variants in front, elites behind
  const rows = [items.filter(i => !i.c.elite), items.filter(i => i.c.elite)];
  const depthDir = new THREE.Vector3(Math.sin(yr0), 0, Math.cos(yr0)).multiplyScalar(-1);
  rows.forEach((row, r) => {
    let xx = 0; const pos = row.map(it => { const w = Math.max(it.c.radius * 2.2, 0.5); const p = xx + w / 2; xx += w + gap * 0.6; return p; });
    row.forEach((it, i) => { it.c.root.position.copy(rowDir).multiplyScalar(pos[i] - xx / 2).addScaledVector(depthDir, r * num('rowGap', 3.2)); });
  });
}
const maxH = Math.max(...items.map(i => i.c.height));

// ---------- animation state ----------
const speed = Q.has('speed') ? +Q.get('speed') : (LOCO[anim] ?? 0);
const isAction = !(anim in LOCO);
const state = { speed, turn: num('turn', 0), grounded: Q.get('air') !== '1', combat: Q.get('combat') === '1', dead: false };
const loopT = num('loop', 2.5);
const move = Q.get('move') === '1';
function stepAll(dt, t) {
  for (const it of items) {
    const c = it.c;
    if (isAction && anim !== 'none') {
      it.nextPlay = it.nextPlay ?? 0.3;
      if (t >= it.nextPlay) { c.play(anim); it.nextPlay = t + loopT; }
    }
    if (move) {
      c.root.rotation.y += state.turn * dt;
      const f = c.root.rotation.y;
      c.root.position.x += -Math.sin(f) * speed * dt; c.root.position.z += -Math.cos(f) * speed * dt;
    }
    if (HA) { c.root.position.y = heightAt(c.root.position.x, c.root.position.z); if (!it.gset) { c.setGround(heightAt); it.gset = true; } }
    if (Q.get('rest') !== '1') c.update(dt, state);
  }
}
// warm-up / filmstrip phase spreading
const fixedDt = num('dt', 1 / 60);
let simT = 0;
const warm = num('warm', 1.2);
{
  const steps = Math.round(warm / fixedDt);
  const saveAction = isAction;
  for (let s = 0; s < steps; s++) { for (const it of items) { if (move) { const f = it.c.root.rotation.y; it.c.root.position.x += -Math.sin(f) * speed * fixedDt; it.c.root.position.z += -Math.cos(f) * speed * fixedDt; } if (HA) { it.c.root.position.y = heightAt(it.c.root.position.x, it.c.root.position.z); if (!it.gset) { it.c.setGround(heightAt); it.gset = true; } } if (Q.get('rest') !== '1') it.c.update(fixedDt, state); } simT += fixedDt; }
  if (strip) {
    // one-shot actions start together at the end of warm-up; copy i shows time i/(N-1)·span into it.
    // locomotion: copy i is advanced by i/N of a gait cycle.
    const perType = {};
    for (const it of items) (perType[it.spec.type + it.spec.variant] ||= []).push(it);
    for (const list of Object.values(perType)) {
      const g = list[0].c.ctl.gait;
      const span = num('span', saveAction ? 1.0 : (g ? 1 / g.f : 1));
      list.forEach((it, i) => {
        if (saveAction) it.c.play(anim);
        const f = saveAction ? i / Math.max(1, list.length - 1) : i / list.length;
        const n = Math.round(f * span / fixedDt); for (let s = 0; s < n; s++) it.c.update(fixedDt, state);
      });
    }
  }
}
const freezeAt = Q.has('t') ? +Q.get('t') : null;
if (freezeAt !== null) { const steps = Math.round(freezeAt / fixedDt); for (let s = 0; s < steps; s++) { stepAll(fixedDt, simT); simT += fixedDt; } }
const frozen = freezeAt !== null || !!strip;

// ---------- camera ----------
const controls = new OrbitControls(camera, renderer.r.domElement);
const center = new THREE.Vector3(0, maxH * 0.45, 0);
if (typeof gridMode !== 'undefined' && gridMode) { const c0 = new THREE.Vector3(); items.forEach(i => c0.add(i.c.root.position)); center.copy(c0.divideScalar(items.length)); center.y = 0.5; }
let dist = num('dist', gridMode ? gridExtent * 1.25 + 2 : Math.max(total * 0.75, maxH * 3) + 1);
if (cam === 'close' || cam === 'head') { dist = num('dist', maxH * 1.6); center.y = maxH * (cam === 'head' ? 0.8 : 0.55); }
if (Q.has('focus')) { // centre on a socket of the first creature (e.g. focus=head)
  const c0 = items[0].c; c0.root.updateMatrixWorld(true);
  const so = c0.sockets[Q.get('focus')]; if (so) { so.getWorldPosition(center); dist = num('dist', 1.2); }
}
if (Q.has('cy')) center.y = +Q.get('cy');
if (Q.has('cx')) center.x = +Q.get('cx');
function placeCam() {
  const yr = THREE.MathUtils.degToRad(yaw), pr = THREE.MathUtils.degToRad(pitch);
  camera.position.set(center.x + Math.sin(yr) * Math.cos(pr) * dist, center.y + Math.sin(pr) * dist, center.z + Math.cos(yr) * Math.cos(pr) * dist);
  controls.target.copy(center); controls.update();
}
placeCam();
const rot = num('rot', 0);

// ---------- labels & stats ----------
const labels = items.map(it => {
  const d = document.createElement('div');
  d.style.cssText = 'position:fixed;color:#fff;font:600 12px sans-serif;text-shadow:0 1px 2px #000;pointer-events:none;transform:translate(-50%,-100%);white-space:nowrap';
  d.textContent = strip || Q.get('labels') === '0' ? '' : `${it.spec.type}${it.spec.variant ? ' · ' + it.spec.variant : ''}`;
  document.body.appendChild(d); return d;
});
const hud = document.createElement('pre');
hud.style.cssText = 'position:fixed;left:8px;top:8px;margin:0;color:#fff;font:9px monospace;text-shadow:0 1px 2px #000;pointer-events:none;opacity:0.8';
document.body.appendChild(hud);
const st = creatureStats();
hud.textContent = Q.get('stats') === '0' ? '' : `anim=${anim} speed=${speed} build ${buildMs.toFixed(0)}ms\n` + st.map(s => `${s.key.padEnd(22)} ${s.verts}v ${s.tris}t ${s.bones}b  ${s.ms.toFixed(0)}ms`).join('\n');
console.log('build total', buildMs.toFixed(1), 'ms');
console.log(st.map(s => `${s.key} verts=${s.verts} (sdf ${s.sdfVerts}) tris=${s.tris} bones=${s.bones} ms=${s.ms.toFixed(1)} sdf=${s.sdfMs.toFixed(1)} evals=${s.evals} ` + (s.t ? Object.entries(s.t).map(([k, v]) => k + ':' + v.toFixed(1)).join(' ') : '')).join('\n'));
if (Q.get('log') === '1') console.log(buildLog.join('\n'));

// ---------- loop ----------
const clock = new THREE.Timer ? null : null; let lastNow = performance.now();
let t = 0;
const _p = new THREE.Vector3();
function frame() {
  requestAnimationFrame(frame);
  const now = performance.now(); const dt = Math.min(0.05, (now - lastNow) / 1000); lastNow = now;
  t += dt;
  G.uTime.value = t;
  if (!frozen) { stepAll(dt, simT); simT += dt; }
  if (rot) { yaw += THREE.MathUtils.radToDeg(rot * dt); placeCam(); }
  if (move) {
    const avg = new THREE.Vector3(); items.forEach(i => avg.add(i.c.root.position)); avg.divideScalar(items.length);
    center.x = avg.x; center.z = avg.z; placeCam();
  }
  G.uCamPos.value.copy(camera.position);
  renderer.render(dt, t);
  for (let i = 0; i < items.length; i++) {
    const c = items[i].c;
    _p.copy(c.root.position); _p.y += c.height + 0.15; _p.project(camera);
    labels[i].style.left = ((_p.x + 1) / 2 * innerWidth) + 'px'; labels[i].style.top = ((1 - _p.y) / 2 * innerHeight) + 'px';
  }
}
frame();

// ---------- toolbar (reloads with URL params) ----------
{
  const bar = document.createElement('div');
  bar.style.cssText = 'position:fixed;right:8px;top:8px;display:flex;flex-wrap:wrap;gap:4px;max-width:560px;justify-content:flex-end;font:12px sans-serif';
  const go = (k, v) => { const q = new URLSearchParams(location.search); if (v === null) q.delete(k); else q.set(k, v); if (k === 'type') q.delete('variant'); location.search = q.toString(); };
  const btn = (label, k, v, on) => { const b = document.createElement('button'); b.textContent = label; b.style.cssText = `background:${on ? '#c9a24a' : '#222a'};color:#fff;border:1px solid #666;border-radius:3px;padding:2px 7px;cursor:pointer`; b.onclick = () => go(k, v); bar.appendChild(b); };
  const sel = document.createElement('select'); sel.style.cssText = 'background:#222;color:#fff;border:1px solid #666';
  for (const t of ['all', ...CREATURE_TYPES()]) { const o = document.createElement('option'); o.value = o.textContent = t; if ((Q.get('type') || 'all') === t) o.selected = true; sel.appendChild(o); }
  sel.onchange = () => go('type', sel.value); bar.appendChild(sel);
  const acts = types.length === 1 ? creatureInfo(types[0]).actions : ['attack', 'hit', 'death'];
  for (const a of ['idle', 'walk', 'trot', 'run', ...acts]) btn(a, 'anim', a, anim === a);
  btn('combat', 'combat', Q.get('combat') === '1' ? null : '1', Q.get('combat') === '1');
  btn('turntable', 'rot', Q.get('rot') ? null : '0.4', !!Q.get('rot'));
  btn('move', 'move', Q.get('move') === '1' ? null : '1', Q.get('move') === '1');
  if (Q.get('stats') !== '0') document.body.appendChild(bar);
}

// ---------- QA API ----------
// ?perf=N : N creatures of the listed types wandering in circles; logs frame timings
if (Q.has('perf')) {
  const N = +Q.get('perf'), crowd = [];
  for (let i = 0; i < N; i++) {
    const s = specs[i % specs.length];
    const c = createCreature(s.type, { variant: s.variant, seed: i + 1 });
    const a = i * 2.39996, r = 3 + Math.sqrt(i) * 1.6;
    c.root.position.set(Math.cos(a) * r, 0, Math.sin(a) * r); c.root.rotation.y = Math.random() * 6.28;
    scene.add(c.root); crowd.push({ c, sp: [0, 1.3, 3.2, 6][i % 4], turn: (Math.random() - 0.5) * 0.8 });
  }
  items.forEach(it => it.c.root.visible = false);
  let fr = 0, tUpd = 0, tRen = 0, t0 = performance.now();
  const tick = () => {
    const a = performance.now();
    for (const o of crowd) {
      const c = o.c, f = c.root.rotation.y;
      c.root.position.x += -Math.sin(f) * o.sp / 60; c.root.position.z += -Math.cos(f) * o.sp / 60; c.root.rotation.y += o.turn / 60;
      c.update(1 / 60, { speed: o.sp, turn: o.turn, combat: fr % 300 > 150 });
      if (fr % 90 === (crowd.indexOf(o) % 90)) c.play('attack');
    }
    const b = performance.now();
    renderer.render(1 / 60, fr / 60);
    const d = performance.now();
    tUpd += b - a; tRen += d - b; fr++;
    if (fr === 240) console.log(`perf n=${N} update=${(tUpd / fr).toFixed(3)}ms render(submit)=${(tRen / fr).toFixed(3)}ms calls=${renderer.r.info.render.calls} tris=${renderer.r.info.render.triangles} wall=${((performance.now() - t0) / fr).toFixed(2)}ms/frame`);
    else requestAnimationFrame(tick);
  };
  dist = 26; pitch = 35; placeCam();
  requestAnimationFrame(tick);
}

window.__lab = {
  items, THREE, scene, camera,
  smoke() { // every type × variant × action, plus state edge cases; returns problems found
    const out = [];
    for (const type of CREATURE_TYPES()) {
      const info = creatureInfo(type);
      for (const variant of info.variants) {
        try {
          const c = createCreature(type, { variant });
          scene.add(c.root);
          const states = [{ speed: 0 }, { speed: 1.5 }, { speed: 7, turn: 1 }, { speed: -1 }, { strafe: 1.5 }, { speed: 3, grounded: false }, { combat: true }, { sit: true }];
          for (const st of states) for (let i = 0; i < 20; i++) c.update(1 / 30, st);
          for (const a of info.actions) { if (!c.play(a)) out.push(`${type}/${variant}: play(${a}) refused`); for (let i = 0; i < 45; i++) c.update(1 / 30, { speed: 0 }); c.play(a === 'death' ? 'revive' : 'idle'); }
          c.update(1 / 30, { dead: true }); for (let i = 0; i < 60; i++) c.update(1 / 30, { dead: true });
          c.update(1 / 30, { dead: false }); for (let i = 0; i < 20; i++) c.update(1 / 30, { speed: 2 });
          c.update(0, {}); c.update(0.5, { speed: 100, turn: 50 });
          c.setTint(0xffffff, 0.5); c.setTint(0xffffff, 0);
          c.root.updateMatrixWorld(true);
          for (const k of ['head', 'chest', 'mouth', 'back']) if (!c.sockets[k]) out.push(`${type}/${variant}: missing socket ${k}`);
          const p = new THREE.Vector3(); c.sockets.head.getWorldPosition(p);
          if (!isFinite(p.x + p.y + p.z)) out.push(`${type}/${variant}: NaN pose`);
          for (const bn of c.bones) if (!isFinite(bn.position.x + bn.quaternion.w)) { out.push(`${type}/${variant}: NaN bone ${bn.name}`); break; }
          c.dispose();
        } catch (e) { out.push(`${type}/${variant}: ${e.message} ${e.stack.split('\n')[1]}`); }
      }
    }
    return out.length ? out : 'ok';
  },
  // average horizontal slip (m/s) of stance toes in world space while moving at `v` for `sec`
  slide(type = items[0].spec.type, v = 3, sec = 3, turn = 0, hills = 0) {
    const c = createCreature(type, {});
    scene.add(c.root);
    const hf = (x, z) => hills * (Math.sin(x * 0.45) * Math.cos(z * 0.35) + 0.5 * Math.sin(x * 0.9 + z * 0.7));
    if (hills) c.setGround(hf);
    const dt = 1 / 60, st2 = { speed: v, turn, grounded: true };
    const toe = new THREE.Vector3(), prev = new Map();
    let slip = 0, n = 0, maxSlip = 0, worst = null; const perLeg = {};
    for (let f = 0; f < sec / dt; f++) {
      c.root.rotation.y += turn * dt; const fa = c.root.rotation.y;
      c.root.position.x += -Math.sin(fa) * v * dt; c.root.position.z += -Math.cos(fa) * v * dt;
      if (hills) c.root.position.y = hf(c.root.position.x, c.root.position.z);
      c.update(dt, st2);
      c.root.updateMatrixWorld(true);
      if (f < 60) continue;
      for (const L of c.ctl.gait.legs) {
        const bone = c.bones[L.paw];
        toe.copy(L.toe).sub(c.pose.rest[L.paw]); bone.localToWorld(toe);
        if (L.stance && prev.has(L)) {
          const p = prev.get(L); const d = Math.hypot(toe.x - p.x, toe.z - p.z) / dt;
          slip += d; n++; if (d > maxSlip) { maxSlip = d; worst = { leg: L.id, lp: +((c.ctl.gait.phase) % 1).toFixed(2), footY: +toe.y.toFixed(3), tgtErr: +(Math.hypot(L.F.x - (toe.x), 0)).toFixed(3) }; }
          perLeg[L.id] = Math.max(perLeg[L.id] || 0, d);
        }
        prev.set(L, L.stance ? toe.clone() : null);
        if (!L.stance) prev.delete(L);
      }
    }
    scene.remove(c.root); c.dispose();
    for (const k in perLeg) perLeg[k] = +perLeg[k].toFixed(3);
    return { type, v, avgSlip: +(slip / Math.max(1, n)).toFixed(4), maxSlip: +maxSlip.toFixed(3), samples: n, perLeg, worst };
  },
  // stance-foot drift split into: target drift (F in world) vs IK error (toe vs F)
  turnDebug(type = 'wolf', v = 3.2, turn = 1.5) {
    const c = createCreature(type, {}); scene.add(c.root);
    const dt = 1 / 60, st2 = { speed: v, turn, grounded: true };
    const toe = new THREE.Vector3(), fw = new THREE.Vector3(), prevF = new Map();
    let fDrift = 0, ikErr = 0, n = 0;
    for (let f = 0; f < 240; f++) {
      c.root.rotation.y += turn * dt; const fa = c.root.rotation.y;
      c.root.position.x += -Math.sin(fa) * v * dt; c.root.position.z += -Math.cos(fa) * v * dt;
      c.update(dt, st2); c.root.updateMatrixWorld(true);
      if (f < 60) continue;
      for (const L of c.ctl.gait.legs) {
        fw.copy(L.F); c.pivot.localToWorld(fw);
        toe.copy(L.toe).sub(c.pose.rest[L.paw]); c.bones[L.paw].localToWorld(toe);
        if (L.stance) {
          ikErr += Math.hypot(toe.x - fw.x, toe.z - fw.z); n++;
          if (prevF.has(L)) { const p = prevF.get(L); fDrift += Math.hypot(fw.x - p.x, fw.z - p.z) / dt; }
          prevF.set(L, fw.clone());
        } else prevF.delete(L);
      }
    }
    scene.remove(c.root); c.dispose();
    return { type, v, turn, avgTargetDrift: +(fDrift / n).toFixed(4), avgIkErr: +(ikErr / n).toFixed(4) };
  },
  preloadAll() { // build every type × variant (cold unless already built); returns timings
    const list = []; for (const t of CREATURE_TYPES()) for (const v of creatureInfo(t).variants) list.push([t, v]);
    const t0 = performance.now(); const st = preloadCreatures(list); const ms = performance.now() - t0;
    return { variants: list.length, totalMs: +ms.toFixed(1), perVariant: st.map((s, i) => list[i].join('/') + ':' + s.ms.toFixed(1) + (s.recolor ? 'r' : '')).join(' ') };
  },
  timeSpawn(type = 'wolf', n = 12) {
    createCreature(type, {});
    const t0 = performance.now(); const list = [];
    for (let i = 0; i < n; i++) list.push(createCreature(type, {}));
    const ms = (performance.now() - t0) / n;
    list.forEach(c => c.dispose());
    return { type, perSpawnMs: +ms.toFixed(3) };
  },
  timeUpdate(type = 'wolf', n = 20, frames = 120) {
    const list = []; for (let i = 0; i < n; i++) list.push(createCreature(type, {}));
    const t0 = performance.now();
    for (let f = 0; f < frames; f++) for (const c of list) c.update(1 / 60, { speed: 3 });
    const ms = (performance.now() - t0) / frames;
    list.forEach(c => c.dispose());
    return { type, n, msPerFrame: +ms.toFixed(3) };
  },
  info: () => renderer.r.info.render,
};
