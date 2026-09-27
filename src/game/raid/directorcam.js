// Spectator camera for Watch mode: a short shot list around the dragon, cutting on the fight's big moments
// (pull, breath, take-off, landing, wipe, kill) and otherwise every 6-9 seconds. Every shot is framed from live
// positions, so it keeps working while the dragon turns, flies, or chases a raider across the lair.
import * as THREE from 'three';
import { damp } from '../../core/noise.js';

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const ROTATION = ['orbit', 'hero', 'side', 'low', 'orbit', 'raid'];
const PREPULL = ['raid', 'sleeper', 'raid'];
const LIMIT = 58; // stay inside the lair walls

export class DirectorCam {
  constructor(camera) {
    this.camera = camera;
    this.pos = V(); this.look = V(); this.gPos = V(); this.gLook = V();
    this.shot = null; this.t = 0; this.i = 0; this.a = Math.random() * Math.PI * 2; this.cut = true;
    this.hero = null; this.phase = -1; this.state = null; this.breath = null;
  }
  reset() { this.shot = null; this.t = 0; this.cut = true; this.phase = -1; this.state = null; }

  choose(raid, forced, dur) {
    const b = raid.boss, br = b.brain;
    let shot = forced;
    if (!shot) {
      if (br.phase === 0 || raid.state === 'prepull' || raid.state === 'readycheck' || raid.state === 'countdown') shot = PREPULL[this.i++ % PREPULL.length];
      else if ((br.altitude || 0) > 1.5) shot = this.i++ % 2 ? 'sky' : 'orbit';
      else shot = ROTATION[this.i++ % ROTATION.length];
    }
    this.shot = shot; this.cut = true;
    this.t = dur ?? (shot === 'breath' ? 4.2 : shot === 'kill' ? 14 : 6 + Math.random() * 3);
    this.a = Math.random() * Math.PI * 2;
    const alive = raid.raiders.filter(m => !m.dead && m.raidRole !== 'mt');
    this.hero = alive[Math.floor(Math.random() * alive.length)] || raid.raiders[0];
  }

  update(dt, raid) {
    const b = raid.boss, br = b.brain, lair = raid.lair;
    // cut on events
    if (raid.state !== this.state) {
      const s = this.state; this.state = raid.state;
      if (raid.state === 'combat' && s) this.choose(raid, 'side');
      else if (raid.state === 'victory') this.choose(raid, 'kill');
      else if (raid.state === 'wipe') this.choose(raid, 'orbit');
      else if (!this.shot) this.choose(raid);
    }
    if (br.phase !== this.phase) { const first = this.phase < 0; this.phase = br.phase; if (!first && raid.state === 'combat') this.choose(raid, br.phase === 2 ? 'sky' : 'low'); }
    const breath = b.casting && /breath/i.test(b.casting.id) ? b.casting.id : null;
    if (breath && breath !== this.breath && raid.state === 'combat') this.choose(raid, (br.altitude || 0) > 1.5 ? 'sky' : 'breath');
    this.breath = breath;
    this.t -= dt;
    if (this.t <= 0 || (this.shot === 'hero' && this.hero?.dead)) this.choose(raid);

    const bp = b.pos, fly = br.altitude || 0;
    const f = V(-Math.sin(b.facing), 0, -Math.cos(b.facing)), rt = V(-f.z, 0, f.x);
    const head = V(bp.x + f.x * 4, bp.y + (b.height || 7) * 0.7, bp.z + f.z * 4);
    const P = this.gPos, L = this.gLook;
    this.a += dt * (this.shot === 'kill' ? 0.12 : 0.07);
    const ring = (r, h) => P.set(Math.cos(this.a) * r, h, Math.sin(this.a) * r);
    switch (this.shot) {
      case 'raid': { // behind the raid, dragon ahead
        const sp = lair.spots.raidSpawn; P.set(sp.x + 6, 5.5, sp.z + 13); L.set(bp.x * 0.5, 3.5, (bp.z + sp.z) * 0.5 - 6); break;
      }
      case 'sleeper': P.set(bp.x + 12, bp.y + 3.2, bp.z + 17); L.copy(head); break;
      case 'side': P.copy(bp).addScaledVector(rt, 24).addScaledVector(f, 7); P.y = bp.y + 7; L.copy(bp).addScaledVector(f, 6); L.y = bp.y + 3.5; break;
      case 'breath': P.copy(bp).addScaledVector(rt, 21).addScaledVector(f, 13); P.y = bp.y + 5.5; L.copy(bp).addScaledVector(f, 13); L.y = bp.y + 2; break;
      case 'low': { const d = V(Math.cos(this.a), 0, Math.sin(this.a)); P.copy(bp).addScaledVector(d, 19); P.y = 1.6; L.set(bp.x, bp.y + (b.height || 7) * 0.75, bp.z); break; }
      case 'hero': {
        const m = this.hero || b, away = V(m.pos.x - bp.x, 0, m.pos.z - bp.z); const dl = away.length() || 1; away.multiplyScalar(1 / dl);
        P.copy(m.pos).addScaledVector(away, 6.5).addScaledVector(V(-away.z, 0, away.x), 2.2); P.y = m.pos.y + 3; L.set(bp.x, bp.y + 4.5, bp.z); break;
      }
      case 'sky': ring(30, 3.5); L.set(bp.x, bp.y + fly * 0.2 + 3, bp.z); break;
      case 'kill': ring(24, 9); L.set(bp.x, 2.5, bp.z); break;
      default: ring(36, 15); L.set(bp.x, bp.y + 3.5, bp.z); break; // orbit
    }
    // tall screens see a narrow slice horizontally: pull back so the dragon still fits
    const k = Math.min(1.9, Math.max(1, 1.2 / this.camera.aspect));
    if (k > 1) P.sub(L).multiplyScalar(k).add(L);
    // keep inside the walls and above the floor
    const r = Math.hypot(P.x, P.z); if (r > LIMIT) { P.x *= LIMIT / r; P.z *= LIMIT / r; }
    P.y = Math.max(P.y, lair.heightAt(P.x, P.z) + 1.2);
    if (this.cut) { this.pos.copy(P); this.look.copy(L); this.cut = false; }
    else {
      const k = this.shot === 'hero' || this.shot === 'sky' ? 5 : 2.5;
      this.pos.set(damp(this.pos.x, P.x, k, dt), damp(this.pos.y, P.y, k, dt), damp(this.pos.z, P.z, k, dt));
      this.look.set(damp(this.look.x, L.x, 6, dt), damp(this.look.y, L.y, 6, dt), damp(this.look.z, L.z, 6, dt));
    }
    this.camera.position.copy(this.pos); this.camera.lookAt(this.look);
  }
}
