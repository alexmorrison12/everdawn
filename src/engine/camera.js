// WoW-style third-person camera: orbit, zoom, terrain collision, smart follow behind a moving character.
import * as THREE from 'three';
import { clamp, damp, dampAngle, wrapAngle } from '../core/noise.js';

export class OrbitCam {
  constructor(camera, heightFn) {
    this.cam = camera;
    this.heightFn = heightFn;
    this.yaw = 0;          // radians, camera looks along -forward of yaw; 0 = looking toward -Z
    this.pitch = 0.32;     // positive = looking down
    this.dist = 9; this.distTarget = 9;
    this.target = new THREE.Vector3();
    this.smoothTarget = new THREE.Vector3();
    this.shake = 0;
    this.minDist = 1.2; this.maxDist = 30;
    this.followStrength = 0;
    this._first = true;
  }
  // drag: [dx, dy] in px. mode: 'orbit' | 'steer'
  applyDrag(dx, dy, sens = 0.0042) {
    this.yaw -= dx * sens;
    this.pitch = clamp(this.pitch + dy * sens, -1.2, 1.45);
  }
  zoom(steps) { this.distTarget = clamp(this.distTarget * Math.pow(1.13, steps), this.minDist, this.maxDist); }
  // Called each frame with the character focus point and facing.
  update(dt, focus, facing, { moving = false, dragging = false } = {}) {
    if (this._first) { this.smoothTarget.copy(focus); this._first = false; }
    this.smoothTarget.x = damp(this.smoothTarget.x, focus.x, 22, dt);
    this.smoothTarget.z = damp(this.smoothTarget.z, focus.z, 22, dt);
    this.smoothTarget.y = damp(this.smoothTarget.y, focus.y, 12, dt);
    // smart follow: swing behind the character while it moves and the mouse is free
    if (moving && !dragging) this.yaw = dampAngle(this.yaw, facing, 2.2, dt);
    this.dist = damp(this.dist, this.distTarget, 10, dt);
    const cy = Math.cos(this.pitch), sy = Math.sin(this.pitch);
    const dir = new THREE.Vector3(Math.sin(this.yaw) * cy, sy, Math.cos(this.yaw) * cy); // from target to camera
    // collision against terrain: shorten along the ray
    let d = this.dist;
    for (let i = 1; i <= 8; i++) {
      const t = d * i / 8;
      const px = this.smoothTarget.x + dir.x * t, pz = this.smoothTarget.z + dir.z * t, py = this.smoothTarget.y + dir.y * t;
      const gh = this.heightFn(px, pz) + 0.45;
      if (py < gh) {
        // allow going over the lip by raising pitch effect: clamp distance
        d = Math.max(this.minDist * 0.7, t * 0.92);
        break;
      }
    }
    // buildings: ray vs extruded footprints (boxes from their ground up to ~10 m)
    if (this.boxes) {
      const ox = this.smoothTarget.x, oy = this.smoothTarget.y, oz = this.smoothTarget.z;
      for (const b of this.boxes) {
        const dx0 = ox - b.x, dz0 = oz - b.z;
        if (dx0 * dx0 + dz0 * dz0 > (d + b.hw + b.hd + 2) ** 2) continue;
        // into box space
        const lx = dx0 * b.cos - dz0 * b.sin, lz = dx0 * b.sin + dz0 * b.cos;
        const rx = dir.x * b.cos - dir.z * b.sin, rz = dir.x * b.sin + dir.z * b.cos;
        let t0 = 0, t1 = d;
        const slab = (o, r, h) => { if (Math.abs(r) < 1e-6) return Math.abs(o) <= h; let a = (-h - o) / r, bb = (h - o) / r; if (a > bb) [a, bb] = [bb, a]; t0 = Math.max(t0, a); t1 = Math.min(t1, bb); return t0 <= t1; };
        if (!slab(lx, rx, b.hw + 0.3) || !slab(lz, rz, b.hd + 0.3)) continue;
        const yAt = oy + dir.y * t0;
        if (yAt > (b.top ?? 1e9)) continue;
        if (t0 > 0.05 && t0 < d) d = Math.max(this.minDist * 0.6, t0 - 0.3);
      }
    }
    const pos = this.smoothTarget.clone().addScaledVector(dir, d);
    const gh = this.heightFn(pos.x, pos.z) + 0.5;
    if (pos.y < gh) pos.y = gh;
    if (this.shake > 0) {
      const s = this.shake * 0.25;
      pos.x += (Math.random() - 0.5) * s; pos.y += (Math.random() - 0.5) * s; pos.z += (Math.random() - 0.5) * s;
      this.shake = Math.max(0, this.shake - dt * 3);
    }
    this.cam.position.copy(pos);
    this.cam.lookAt(this.smoothTarget);
    this.lastDist = d;
  }
  // forward direction on the ground plane that the camera looks at
  forward(out = new THREE.Vector3()) { return out.set(-Math.sin(this.yaw), 0, -Math.cos(this.yaw)); }
}
