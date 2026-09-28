// Unit container: spatial queries, movement integration with terrain + collider resolution, model syncing.
import * as THREE from 'three';
import { WATER_Y } from '../world/zone.js';

const CELL = 16;

export class Sim {
  constructor(world) {
    this.world = world;
    this.units = [];
    this.static = new Map(); // cell → colliders
    for (const c of world.colliders) this.addStatic(c);
  }
  key(cx, cz) { return cx * 73856093 ^ cz * 19349663; }
  addStatic(c) {
    const r = c.type === 'box' ? Math.hypot(c.hw, c.hd) : c.r;
    if (c.type === 'box') { c.cos = Math.cos(c.rot); c.sin = Math.sin(c.rot); }
    for (let cx = Math.floor((c.x - r) / CELL); cx <= Math.floor((c.x + r) / CELL); cx++)
      for (let cz = Math.floor((c.z - r) / CELL); cz <= Math.floor((c.z + r) / CELL); cz++) {
        const k = this.key(cx, cz); if (!this.static.has(k)) this.static.set(k, []); this.static.get(k).push(c);
      }
  }
  add(u) { this.units.push(u); return u; }
  /** Another zone's terrain and buildings (travel). */
  setWorld(world) { this.world = world; this.static = new Map(); for (const c of world.colliders) this.addStatic(c); }
  remove(u) { const i = this.units.indexOf(u); if (i >= 0) this.units.splice(i, 1); if (u.model) u.model.root.parent?.remove(u.model.root); }
  query(pos, r) {
    const out = [], r2 = r * r;
    for (const u of this.units) { const dx = u.pos.x - pos.x, dz = u.pos.z - pos.z; if (dx * dx + dz * dz <= r2) out.push(u); }
    return out;
  }
  nearest(pos, r, pred) {
    let best = null, bd = r * r;
    for (const u of this.units) { if (!pred(u)) continue; const dx = u.pos.x - pos.x, dz = u.pos.z - pos.z, d = dx * dx + dz * dz; if (d < bd) { bd = d; best = u; } }
    return best;
  }
  ground(x, z) { return this.world.heightAt(x, z); }
  isWater(x, z) { return !this.world.noWater && this.ground(x, z) < WATER_Y - 1.1; }

  // Resolve a circle against static colliders; returns corrected [x, z]
  resolve(x, z, r) {
    const cx = Math.floor(x / CELL), cz = Math.floor(z / CELL);
    for (let ox = -1; ox <= 1; ox++) for (let oz = -1; oz <= 1; oz++) {
      const list = this.static.get(this.key(cx + ox, cz + oz)); if (!list) continue;
      for (const c of list) {
        if (c.type === 'circle') {
          const dx = x - c.x, dz = z - c.z, d = Math.hypot(dx, dz), m = c.r + r;
          if (d < m && d > 1e-5) { x = c.x + dx / d * m; z = c.z + dz / d * m; }
        } else {
          // to local box space (rotation about Y by rot: local = R^-1 (p - c))
          const dx = x - c.x, dz = z - c.z;
          const lx = dx * c.cos - dz * c.sin, lz = dx * c.sin + dz * c.cos;
          const qx = Math.max(-c.hw, Math.min(c.hw, lx)), qz = Math.max(-c.hd, Math.min(c.hd, lz));
          let ex = lx - qx, ez = lz - qz, d = Math.hypot(ex, ez);
          if (d < r) {
            let nlx, nlz;
            if (d > 1e-5) { nlx = qx + ex / d * r; nlz = qz + ez / d * r; }
            else { // inside: push out along smallest axis
              const px = c.hw - Math.abs(lx), pz = c.hd - Math.abs(lz);
              if (px < pz) { nlx = Math.sign(lx || 1) * (c.hw + r); nlz = lz; } else { nlx = lx; nlz = Math.sign(lz || 1) * (c.hd + r); }
            }
            x = c.x + nlx * c.cos + nlz * c.sin; z = c.z - nlx * c.sin + nlz * c.cos;
          }
        }
      }
    }
    return [x, z];
  }

  /** Move a unit by (dx, dz) with collision; handles ground snap, gravity, water. */
  move(u, dx, dz, dt, { collide = true } = {}) {
    let x = u.pos.x + dx, z = u.pos.z + dz;
    const lim = 470; x = Math.max(-lim, Math.min(lim, x)); z = Math.max(-lim, Math.min(lim, z));
    if (this.world.clamp) [x, z] = this.world.clamp(x, z);
    if (collide) [x, z] = this.resolve(x, z, u.radius * 0.8);
    // steep slope blocking for walkers
    const gNew = this.ground(x, z), gOld = this.ground(u.pos.x, u.pos.z);
    const run = Math.hypot(x - u.pos.x, z - u.pos.z);
    if (run > 1e-4 && (gNew - gOld) / run > 1.9 && u.grounded !== false) { x = u.pos.x; z = u.pos.z; }
    u.pos.x = x; u.pos.z = z;
  }

  // Vertical integration: gravity/jump/swim; call after horizontal move.
  vertical(u, dt) {
    const g = this.ground(u.pos.x, u.pos.z);
    const waterDepth = this.world.noWater ? 0 : WATER_Y - g;
    u.swimming = waterDepth > 1.35;
    if (u.swimming) {
      const surf = WATER_Y - 1.25;
      u.vy = 0; u.pos.y += (surf - u.pos.y) * Math.min(1, dt * 6); u.grounded = false;
      return;
    }
    const was = u.grounded;
    u.vy = (u.vy || 0) - (u.gravity ?? 24) * dt;
    u.pos.y += u.vy * dt;
    if (u.pos.y <= g) { if (u.vy < -12 && u.onLand) u.onLand(u.vy); u.pos.y = g; u.vy = 0; u.grounded = true; }
    else if (was && u.vy <= 0 && u.pos.y - g < 0.6) { u.pos.y = g; u.vy = 0; u.grounded = true; } // running downhill: stay on the ground
    else u.grounded = u.pos.y - g < 0.05;
  }
}
