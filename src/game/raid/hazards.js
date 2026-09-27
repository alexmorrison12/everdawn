// Ground mechanics: telegraphed circles/cones/lines that resolve into damage, and persistent pools.
// The AI queries danger() to decide when to move; the FX layer listens to 'fx_ground' events.
import * as THREE from 'three';
import { bus } from '../events.js';

let HID = 1;
const angDiff = (a, b) => { let d = a - b; return Math.atan2(Math.sin(d), Math.cos(d)); };

export class Hazards {
  constructor(raid) { this.r = raid; this.list = []; }

  add(h) {
    h.id = HID++; h.t = 0; this.list.push(h);
    bus.emit('fx_ground', { id: h.id, name: h.fx, pos: h.pos?.clone?.(), radius: h.radius, duration: h.delay ?? h.dur, angle: h.angle, dir: h.dir, length: h.length, width: h.width, color: h.color, telegraph: h.kind !== 'pool' });
    return h;
  }
  circle(pos, radius, delay, dmg, school, o = {}) { return this.add({ kind: 'circle', pos: pos.clone(), radius, delay, dmg, school, fx: o.fx || 'telegraphCircle', color: o.color, then: o.then, name: o.name, src: o.src }); }
  cone(pos, dir, angle, length, delay, dmg, school, o = {}) { return this.add({ kind: 'cone', pos: pos.clone(), dir, angle, length, delay, dmg, school, fx: o.fx || 'telegraphCone', color: o.color, then: o.then, name: o.name, src: o.src, radius: length }); }
  line(pos, dir, length, width, delay, dmg, school, o = {}) { return this.add({ kind: 'line', pos: pos.clone(), dir, length, width, delay, dmg, school, fx: o.fx || 'telegraphLine', color: o.color, then: o.then, name: o.name, src: o.src, radius: length }); }
  pool(pos, radius, dur, dps, school, o = {}) { return this.add({ kind: 'pool', pos: pos.clone(), radius, r0: radius, grow: o.grow || 0, dur, dps, school, fx: o.fx || 'firePool', tick: 0, name: o.name, src: o.src, slow: o.slow }); }

  contains(h, p, margin = 0) {
    const dx = p.x - h.pos.x, dz = p.z - h.pos.z;
    if (h.kind === 'circle' || h.kind === 'pool') return dx * dx + dz * dz < (h.radius + margin) ** 2;
    if (h.kind === 'cone') {
      const d = Math.hypot(dx, dz); if (d > h.length + margin) return false; if (d < 1.5) return true;
      const a = Math.atan2(-dx, -dz); return Math.abs(angDiff(a, h.dir)) < h.angle / 2 + margin / Math.max(d, 1);
    }
    if (h.kind === 'line') {
      const fx = -Math.sin(h.dir), fz = -Math.cos(h.dir);
      const along = dx * fx + dz * fz, side = -dx * fz + dz * fx;
      return along > -2 && along < h.length && Math.abs(side) < h.width / 2 + margin;
    }
    return false;
  }

  /** Returns { hazard, escape: Vector3 } if p is inside any active hazard (with margin), else null. */
  danger(p, margin = 1.2) {
    for (const h of this.list) {
      if (h.done) continue;
      if (!this.contains(h, p, margin)) continue;
      return { hazard: h, escape: this.escapeFrom(h, p, margin) };
    }
    return null;
  }
  escapeFrom(h, p, margin) {
    const out = new THREE.Vector3();
    if (h.kind === 'circle' || h.kind === 'pool') {
      let dx = p.x - h.pos.x, dz = p.z - h.pos.z;
      if (Math.hypot(dx, dz) < 0.2) { const a = Math.atan2(p.z, p.x) + (Math.random() - 0.5); dx = -Math.cos(a); dz = -Math.sin(a); } // step toward the arena centre-ish
      // growing pools: head for where the edge will be, not where it is now ("get out early, not late")
      const r = h.radius + margin + 1.5 + (h.grow ? h.grow * Math.max(0, h.dur - h.t) : 0); const l = Math.hypot(dx, dz) || 1;
      return out.set(h.pos.x + dx / l * r, 0, h.pos.z + dz / l * r);
    }
    if (h.kind === 'line') {
      const fx = -Math.sin(h.dir), fz = -Math.cos(h.dir);
      const dx = p.x - h.pos.x, dz = p.z - h.pos.z, side = -dx * fz + dz * fx;
      const s = side >= 0 ? 1 : -1, off = h.width / 2 + margin + 2.5 - Math.abs(side);
      return out.set(p.x + s * off * -fz, 0, p.z + s * off * fx);
    }
    if (h.kind === 'cone') { // step sideways out of the cone
      const d = Math.hypot(p.x - h.pos.x, p.z - h.pos.z);
      const a = Math.atan2(-(p.x - h.pos.x), -(p.z - h.pos.z)); const s = angDiff(a, h.dir) >= 0 ? 1 : -1;
      const na = h.dir + s * (h.angle / 2 + 0.35);
      return out.set(h.pos.x - Math.sin(na) * Math.max(d, 8), 0, h.pos.z - Math.cos(na) * Math.max(d, 8));
    }
    return out.copy(p);
  }

  update(dt) {
    const units = this.r.sim.units;
    for (let i = this.list.length - 1; i >= 0; i--) {
      const h = this.list[i]; h.t += dt;
      if (h.kind === 'pool') {
        h.radius = h.r0 + h.grow * h.t;
        h.tick -= dt;
        if (h.tick <= 0) {
          h.tick = 0.5;
          for (const u of units) if (!u.dead && !u.hostile && this.contains(h, u.pos)) { this.r.combat.damage(h.src || this.r.boss, u, h.dps * 0.5, h.school, { dot: true, noMiss: true, avoidable: true, spellId: h.name || 'pool' }); if (h.slow) u.addAura('chilled', h.src || this.r.boss, { dur: 1 }); }
        }
        if (h.t >= h.dur) { h.done = true; this.list.splice(i, 1); bus.emit('fx_ground_stop', { id: h.id }); }
        continue;
      }
      if (h.t >= h.delay && !h.done) {
        h.done = true;
        for (const u of units) if (!u.dead && !u.hostile && this.contains(h, u.pos)) this.r.combat.damage(h.src || this.r.boss, u, h.dmg, h.school, { noMiss: true, noCrit: true, avoidable: true, spellId: h.name });
        bus.emit('fx_ground_stop', { id: h.id, resolve: true, name: h.fx, pos: h.pos });
        bus.emit('hazard_resolve', { hazard: h });
        this.list.splice(i, 1);
        h.then?.(h);
      }
    }
  }
  clear() { for (const h of this.list) bus.emit('fx_ground_stop', { id: h.id }); this.list = []; }
}
