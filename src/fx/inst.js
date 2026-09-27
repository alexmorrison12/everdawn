// Base instance for everything that lives over time (attached loops, timed bursts, projectiles, decals, cones, beams).
import * as THREE from 'three';

const _v = new THREE.Vector3();
export const NO = {};

// Base class for everything that lives over time (attached loops, timed bursts, projectiles, decals, cones, beams).
export class Inst {
  constructor(fx, recipe, opts = NO) {
    this.fx = fx; this.recipe = recipe; this.opts = opts;
    this.s = (opts.scale ?? 1) * (recipe?.scale ?? 1);
    this.tint = opts.color !== undefined ? tintOf(opts.color) : null;
    this.pos = new THREE.Vector3(); this.prev = new THREE.Vector3();
    this.obj = null; this.fixed = null; this.offset = opts.offset || null;
    this.anchor = -1; this.intensity = 1; this.fade = 1; this.stopping = false; this.stopDur = 0.3;
    this.age = 0; this.dt = 0; this.first = true; this.acc = Object.create(null); this.flags = Object.create(null);
    this.duration = opts.duration ?? recipe?.dur ?? Infinity;
    this.maxDist = opts.maxDist ?? recipe?.maxDist ?? 140;
    this.held = []; this.meshes = []; this.dead = false; this.wasParented = false;
    this.visibleNow = true;
  }
  get alive() { return !this.dead; }
  get k() { return this.fade * this.intensity; }
  stop(fade = this.recipe?.fade ?? 0.3) { if (this.stopping || this.dead) return; this.stopping = true; this.stopDur = Math.max(fade, 1e-3); if (fade <= 0) this.fade = 0; }
  setIntensity(v) { this.intensity = Math.max(0, v); }
  setFollow(obj) { this.obj = obj; this.fixed = null; this.wasParented = !!obj?.parent; }
  readPos(out) {
    if (this.obj) {
      if (this.offset) { _v.copy(this.offset); this.obj.localToWorld(_v); out.copy(_v); }
      else this.obj.getWorldPosition(out);
    } else if (this.fixed) { out.copy(this.fixed); if (this.offset) out.add(this.offset); }
    return out;
  }
  // emit `rate` particles per second (scaled by intensity); cb(bt, x, y, z) with sub-frame interpolated position
  emit(key, rate, cb) {
    const n0 = (this.acc[key] || 0) + rate * this.dt * this.intensity;
    let n = Math.floor(n0); this.acc[key] = n0 - n;
    if (n <= 0) return;
    if (n > 400) n = 400;
    const fx = this.fx, p = this.pos, q = this.prev;
    for (let i = 0; i < n; i++) {
      const f = (i + fx.rng.next()) / n;                  // 0 = now, 1 = start of the frame
      fx.bt = f * this.dt;
      cb(fx.bt, p.x + (q.x - p.x) * f, p.y + (q.y - p.y) * f, p.z + (q.z - p.z) * f, f);
    }
    fx.bt = 0;
  }
  once(key, t) { if (this.age >= t && !this.flags[key]) { this.flags[key] = 1; return true; } return false; }
  // looping particle owned by this instance, following its anchor (local offset x,y,z)
  hold(pr, x = 0, y = 0, z = 0, o = NO) {
    if (this.anchor < 0) this.anchor = this.fx.anchors.alloc(this.fx.time);
    const pool = this.fx.pools[pr.pool];
    let a = this.anchor;
    if (a < 0) { x += this.pos.x; y += this.pos.y; z += this.pos.z; this.fx.warnOnce('anchors exhausted: held particle will not follow'); }
    const slot = this.fx.spawn(pr, x, y, z, o.vx ?? 0, o.vy ?? 0, o.vz ?? 0, { ...o, held: true, anchor: a, scale: (o.scale ?? 1) * this.s });
    if (slot >= 0) this.held.push(pool, slot);
    return slot;
  }
  addMesh(m) { this.fx.group.add(m); this.meshes.push(m); return m; }
  start() {
    if (this.recipe?.anchor !== false) this.anchor = this.fx.anchors.alloc(this.fx.time);
    this.readPos(this.pos); this.prev.copy(this.pos);
    if (this.anchor >= 0) this.fx.anchors.set(this.anchor, this.pos.x, this.pos.y, this.pos.z, this.k);
    this.fx.curTint = this.tint;
    try { this.recipe?.init?.(this); } finally { this.fx.curTint = null; }
    return this;
  }
  update(dt) {
    this.dt = dt; this.age += dt;
    // auto-stop when the followed object is removed from the scene (checked a few times per second)
    if (this.obj && this.wasParented && !this.stopping && (this._conT = (this._conT || 0) - dt) <= 0) {
      this._conT = 0.25;
      let o = this.obj; while (o.parent) o = o.parent;
      if (o !== this.fx.scene) this.stop(0.15);
    }
    this.prev.copy(this.pos); this.readPos(this.pos);
    if (this.first) { this.prev.copy(this.pos); this.first = false; }
    if (this.stopping) this.fade = Math.max(0, this.fade - dt / this.stopDur);
    if (this.anchor >= 0) this.fx.anchors.set(this.anchor, this.pos.x, this.pos.y, this.pos.z, this.k);
    const cam = this.fx.camera.position;
    this.visibleNow = this.pos.distanceToSquared(cam) < this.maxDist * this.maxDist;
    this.fx.curTint = this.tint;
    try {
      if (!this.stopping && this.visibleNow) this.recipe?.tick?.(this, dt);
      else if (this.stopping && this.recipe?.tickStopping) this.recipe.tickStopping(this, dt);
    } finally { this.fx.curTint = null; }
    if (this.age >= this.duration && !this.stopping) this.stop(this.recipe?.fade ?? 0.3);
    if (this.stopping && this.fade <= 0) { this.end(); return false; }
    return true;
  }
  end() {
    if (this.dead) return;
    this.dead = true;
    this.recipe?.end?.(this);
    for (let i = 0; i < this.held.length; i += 2) this.held[i].killHeld(this.held[i + 1]);
    this.held.length = 0;
    for (const m of this.meshes) { m.parent?.remove(m); m.userData.dispose?.(); }
    this.meshes.length = 0;
    if (this.anchor >= 0) { this.fx.anchors.free(this.anchor); this.anchor = -1; }
  }
}

export function tintOf(c) {
  if (Array.isArray(c)) return c;
  const col = c?.isColor ? c : new THREE.Color(c);
  return [col.r, col.g, col.b];
}

