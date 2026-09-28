// Waypoints and pings. Middle-click (or Alt+click) the ground, the minimap or the world map to drop a waypoint your
// group sees: a beam of light in the world with your name and the distance, a pin on the minimap and on the world
// map. Middle-click your own waypoint again to take it down. A plain click on the minimap sends a ping, a short
// ripple your group sees there. Everything travels on the bus as 'waypoint' events: the host relays them to the
// group (net/host.js) and a friend's browser sends its own through the host (net/guest.js).
import * as THREE from 'three';
import { bus } from './events.js';
import { classColor } from '../ui/util.js';

const LIFE = 600, PING_LIFE = 3, CLEAR_R = 10;
let beamTex = null;
function beamTexture() {
  if (beamTex) return beamTex;
  const c = document.createElement('canvas'); c.width = 4; c.height = 128;
  const x = c.getContext('2d'), g = x.createLinearGradient(0, 0, 0, 128);
  g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(0.55, 'rgba(255,255,255,0.35)'); g.addColorStop(1, 'rgba(255,255,255,1)');
  x.fillStyle = g; x.fillRect(0, 0, 4, 128);
  beamTex = new THREE.CanvasTexture(c); beamTex.colorSpace = THREE.SRGBColorSpace;
  return beamTex;
}

export class Waypoints {
  constructor(app) {
    this.app = app;
    this.list = new Map();   // unit → { unit, x, z, t, color }
    this.pings = [];         // { unit, x, z, t, color }
    this.meshes = new Map(); // unit → THREE.Group
    this.labels = new Map(); // unit → DOM label
    bus.on('waypoint', e => this.onEvent(e));
  }
  get me() { return this.app.game.player; }
  /** Yours, or someone in your group's. */
  visible(u) { const me = this.me; return !!me && (u === me || (!!me.party && u.party === me.party)); }

  // ---------------------------------------------------------------- your actions
  place(x, z) {
    const me = this.me; if (!me) return;
    const cur = this.list.get(me), clear = !!cur && Math.hypot(cur.x - x, cur.z - z) < CLEAR_R;
    bus.emit('waypoint', clear ? { unit: me, clear: true } : { unit: me, x, z });
    this.app.guest?.net.send(clear ? { t: 'wp', clear: 1 } : { t: 'wp', x: Math.round(x * 10) / 10, z: Math.round(z * 10) / 10 });
  }
  ping(x, z) {
    const me = this.me; if (!me) return;
    bus.emit('waypoint', { unit: me, x, z, ping: true });
    this.app.guest?.net.send({ t: 'wp', x: Math.round(x * 10) / 10, z: Math.round(z * 10) / 10, ping: 1 });
  }
  clearMine() { const me = this.me; if (me && this.list.has(me)) { bus.emit('waypoint', { unit: me, clear: true }); this.app.guest?.net.send({ t: 'wp', clear: 1 }); } }

  onEvent(e) {
    const u = e.unit; if (!u) return;
    const color = u.cls ? classColor(u.cls) : '#ffd35a';
    if (e.ping) {
      this.pings.push({ unit: u, x: e.x, z: e.z, t: 0, color });
      if (u !== this.me && this.visible(u)) bus.emit('sound', { name: 'uiOpen' });
      return;
    }
    if (e.clear) { this.remove(u); return; }
    this.remove(u);
    this.list.set(u, { unit: u, x: e.x, z: e.z, t: 0, color });
    if (this.visible(u)) {
      bus.emit('sound', { name: 'readyCheck' });
      if (u !== this.me) bus.emit('chat', { ch: 'party', from: u.name, cls: u.cls, unit: u, text: 'placed a waypoint (look for the beam of light).', hideLocal: false, $local: 1 });
      else bus.emit('chat', { ch: 'system', text: 'Waypoint placed. Your group can see it. Middle-click it again (or type /clearwaypoint) to remove it.', $local: 1 });
    }
  }
  remove(u) {
    this.list.delete(u);
    const m = this.meshes.get(u); if (m) { m.parent?.remove(m); m.traverse(o => { o.geometry?.dispose?.(); o.material?.dispose?.(); }); this.meshes.delete(u); }
    const l = this.labels.get(u); if (l) { l.remove(); this.labels.delete(u); }
  }
  clearAll() { for (const u of [...this.list.keys()]) this.remove(u); this.pings = []; }

  // ---------------------------------------------------------------- per frame
  /** Markers for the minimap / world map. */
  markers() {
    const out = [];
    for (const w of this.list.values()) if (this.visible(w.unit)) out.push({ x: w.x, z: w.z, kind: 'wp', color: w.color, edge: true, label: `${w.unit.name}'s waypoint` });
    for (const p of this.pings) if (this.visible(p.unit)) out.push({ x: p.x, z: p.z, kind: 'ping', color: p.color, r: p.t / PING_LIFE, edge: false });
    return out;
  }
  update(dt, scene, camera, layer, heightAt, show) {
    for (let i = this.pings.length - 1; i >= 0; i--) if ((this.pings[i].t += dt) > PING_LIFE) this.pings.splice(i, 1);
    const me = this.me, W = innerWidth, H = innerHeight;
    for (const [u, w] of [...this.list]) {
      w.t += dt;
      if (w.t > LIFE || (u !== me && !this.app.game.sim.units.includes(u) && !this.app.raid?.sim?.units.includes(u))) { this.remove(u); continue; }
      const on = show && this.visible(u);
      let m = this.meshes.get(u);
      if (on && !m) m = this.build(u, w, scene, heightAt);
      if (m) m.visible = on;
      let l = this.labels.get(u);
      if (!on) { if (l) l.style.display = 'none'; continue; }
      // a thin beam that fades as you walk up to it (standing in it shouldn't hide your character)
      const near = Math.min(1, Math.max(0.12, (Math.hypot(camera.position.x - w.x, camera.position.z - w.z) - 3) / 22));
      m.children[0].material.opacity = (0.42 + Math.sin(w.t * 3) * 0.1) * near;
      const k = w.t * 0.7 % 1; m.children[1].scale.setScalar(1 + k * 0.9); m.children[1].material.opacity = 0.7 * (1 - k) * (0.4 + near * 0.6);
      if (!l) { l = document.createElement('div'); l.className = 'evd-wpl'; l.innerHTML = '<b></b><span></span>'; l.style.setProperty('--c', w.color); layer.appendChild(l); this.labels.set(u, l); l.firstChild.textContent = u === me ? 'Your waypoint' : `${u.name}'s waypoint`; }
      const v = new THREE.Vector3(w.x, m.position.y + 4, w.z).project(camera);
      if (v.z > 1 || v.x < -1.1 || v.x > 1.1 || v.y < -1.1 || v.y > 1.1) { l.style.display = 'none'; continue; }
      l.style.display = '';
      l.style.transform = `translate(${((v.x * 0.5 + 0.5) * W).toFixed(1)}px, ${((-v.y * 0.5 + 0.5) * H).toFixed(1)}px) translate(-50%, -100%)`;
      const d = me ? Math.round(Math.hypot(me.pos.x - w.x, me.pos.z - w.z)) : 0;
      if (l._d !== d) { l._d = d; l.lastChild.textContent = `${d} yd`; }
    }
  }
  build(u, w, scene, heightAt) {
    const g = new THREE.Group(), col = new THREE.Color(w.color);
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 60, 12, 1, true),
      new THREE.MeshBasicMaterial({ map: beamTexture(), color: col, transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false }));
    beam.position.y = 30;
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.9, 1.15, 36),
      new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false }));
    ring.rotation.x = -Math.PI / 2; ring.position.y = 0.15;
    g.add(beam, ring);
    g.position.set(w.x, heightAt(w.x, w.z), w.z);
    g.renderOrder = 5;
    scene.add(g);
    this.meshes.set(u, g);
    return g;
  }
  /** Move the beams into another scene (entering / leaving the raid). */
  detach() { for (const m of this.meshes.values()) m.parent?.remove(m); this.meshes.clear(); for (const l of this.labels.values()) l.remove(); this.labels.clear(); }
}

/** The ground point under a screen position (terrain ray march), or null. */
export function groundAt(camera, sx, sy, heightAt, maxDist = 900) {
  const ray = new THREE.Raycaster();
  ray.setFromCamera(new THREE.Vector2(sx / innerWidth * 2 - 1, -(sy / innerHeight) * 2 + 1), camera);
  const o = ray.ray.origin, d = ray.ray.direction, p = new THREE.Vector3();
  let prev = 0;
  for (let t = 0.5; t < maxDist; t += Math.max(0.5, t * 0.02)) {
    p.copy(o).addScaledVector(d, t);
    if (p.y <= heightAt(p.x, p.z)) {
      let a = prev, b = t;
      for (let i = 0; i < 12; i++) { const m = (a + b) / 2; p.copy(o).addScaledVector(d, m); if (p.y <= heightAt(p.x, p.z)) b = m; else a = m; }
      p.copy(o).addScaledVector(d, b);
      return p;
    }
    prev = t;
  }
  return null;
}
