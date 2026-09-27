// Ambient wildlife: wander near home, graze/peck/groom, bolt away from anyone who gets close.
const IDLES = { rabbit: ['graze', 'situp'], deer: ['graze', 'alert'], chicken: ['peck', 'flap'], crow: ['peck', 'hop', 'caw'], sheep: ['graze', 'baa'], cat: ['sit', 'groom', 'stretch'] };
const SPEED = { rabbit: 7, deer: 9, chicken: 4, crow: 5, sheep: 4.5, cat: 6 };

export class CritterBrain {
  constructor(u, type, game) { this.u = u; this.type = type; this.g = game; this.t = Math.random() * 5; this.dest = null; this.flee = 0; this.scan = Math.random(); }
  update(dt) {
    const u = this.u, g = this.g;
    let speed = 0, mx = 0, mz = 0;
    this.scan -= dt;
    if (this.scan <= 0) {
      this.scan = 0.3;
      const scary = g.sim.nearest(u.pos, this.type === 'cat' ? 4 : 7, o => (o.kind === 'player' || o.kind === 'sim' || o.kind === 'remote') && !o.dead);
      if (scary && this.flee <= 0) {
        this.flee = 1.6 + Math.random();
        const dx = u.pos.x - scary.pos.x, dz = u.pos.z - scary.pos.z, d = Math.hypot(dx, dz) || 1;
        this.fleeDir = [dx / d, dz / d];
        if (this.type === 'crow' || this.type === 'chicken') u.model?.play?.(this.type === 'crow' ? 'caw' : 'flap');
      }
    }
    if (this.flee > 0) { this.flee -= dt; speed = SPEED[this.type] || 5; [mx, mz] = this.fleeDir; }
    else {
      this.t -= dt;
      if (this.t <= 0) {
        this.t = 3 + Math.random() * 7;
        if (Math.random() < 0.55) { const a = Math.random() * 6.28, r = Math.random() * 9; this.dest = [u.home.x + Math.cos(a) * r, u.home.z + Math.sin(a) * r]; }
        else { this.dest = null; const acts = IDLES[this.type]; if (acts) u.model?.play?.(acts[Math.floor(Math.random() * acts.length)]); }
      }
      if (this.dest) { const dx = this.dest[0] - u.pos.x, dz = this.dest[1] - u.pos.z, d = Math.hypot(dx, dz); if (d < 0.4) this.dest = null; else { speed = (SPEED[this.type] || 5) * 0.25; mx = dx / d; mz = dz / d; } }
    }
    if (speed > 0) { u.facing = Math.atan2(-mx, -mz); if (!g.sim.isWater(u.pos.x + mx, u.pos.z + mz)) g.sim.move(u, mx * speed * dt, mz * speed * dt, dt); }
    g.sim.vertical(u, dt);
    u.stateAnim.speed = speed;
  }
}
