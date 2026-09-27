// Raid brain for SimPlayers: role positioning around the dragon, reaction-timed dodging (skill-based, so some of
// them WILL stand in fire), whelp duty, triage healing, cooldowns, and raid-chat personality.
import * as THREE from 'three';
import { SPELLS } from '../data/spells.js';
import { bus } from '../events.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const ROT = {
  warrior: ['execute', 'victoryRush', 'mortalBlow', 'whirlwind', 'thunderclap', 'rend', 'valiantStrike'],
  paladin: ['valiantStrike', 'thunderclap'], rogue: ['valiantStrike', 'rend'],
  mage: ['pyroblast', 'fireBlast', 'fireball'], priest: ['wordOfPain', 'mindSpike', 'smite'], hunter: ['simShot'],
};

export class RaidBrain {
  constructor(unit, raid, role, slot) {
    this.u = unit; this.r = raid; this.role = role; this.slot = slot;
    unit.raidRole = role;
    this.skill = unit.persona?.skill ?? 0.7;
    this.react = 0; this.dodgeTarget = null; this.dodgeT = 0; this.failed = false;
    this.side = slot % 2 ? 1 : -1;
    this.actT = Math.random() * 0.5;
    this.shieldWallT = 0;
    if (role === 'mt' || role === 'ot') unit.threatMod = 6;
  }

  desired() {
    const r = this.r, boss = r.boss, u = this.u, b = boss.brain;
    const bp = boss.pos, f = V(-Math.sin(boss.facing), 0, -Math.cos(boss.facing)), rt = V(-f.z, 0, f.x);
    const ph = b.phase;
    if (ph === 0) { // pre-pull: stack at the entrance in a loose crowd
      const a = this.slot * 0.63, rr = 3 + (this.slot % 3) * 1.6;
      return V(r.lair.spots.raidSpawn.x + Math.cos(a) * rr, 0, r.lair.spots.raidSpawn.z - 4 + Math.sin(a) * rr);
    }
    if (ph === 2) {
      if (this.role === 'mt' || this.role === 'ot' || this.role === 'melee') {
        const w = this.whelpTarget(); if (w) return w.pos.clone();
        const nest = r.lair.spots.nests[this.slot % 2]; return V(nest.x * 0.7, 0, nest.z + 4);
      }
      const a = (this.slot / 10) * Math.PI * 2 + 0.3, rr = 17 + (this.slot % 3) * 3;
      return V(Math.cos(a) * rr, 0, Math.sin(a) * rr + 6);
    }
    const R = boss.radius;
    switch (this.role) {
      case 'mt': return bp.clone().addScaledVector(f, R + 1.6);
      case 'ot': return bp.clone().addScaledVector(rt, R + 1.4).addScaledVector(f, 1.5);
      case 'melee': return bp.clone().addScaledVector(rt, this.side * (R + 1.2)).addScaledVector(f, -0.5 + (this.slot % 3) * 0.8);
      default: {
        const ang = this.side * (Math.PI / 2 + ((this.slot * 0.37) % 0.6) - 0.3);
        const dist = 19 + (this.slot % 3) * 2.5;
        const dir = f.clone().applyAxisAngle(V(0, 1, 0), ang);
        return bp.clone().addScaledVector(dir, dist);
      }
    }
  }

  whelpTarget() {
    const u = this.u; let best = null, bd = 1e9;
    for (const w of this.r.whelps) { if (w.dead) continue; const d = Math.hypot(w.pos.x - u.pos.x, w.pos.z - u.pos.z) + (w.target && w.target.raidRole === 'heal' ? -15 : 0); if (d < bd) { bd = d; best = w; } }
    return best;
  }

  update(dt) {
    const u = this.u, r = this.r, boss = r.boss;
    if (u.dead) return;
    if (u.dash) return; // knockback in progress (handled by raid state)
    let speed = 0, mx = 0, mz = 0;
    const to = (p, spd = u.moveSpeed, stop = 0.8) => { const dx = p.x - u.pos.x, dz = p.z - u.pos.z, d = Math.hypot(dx, dz); if (d < stop) return true; speed = spd; mx = dx / d; mz = dz / d; return false; };
    // feared: flail around
    if (u.flag('fear')) { const a = (this.fa ??= Math.random() * 6.28); if (Math.random() < dt * 1.2) this.fa = Math.random() * 6.28; speed = u.moveSpeed * 0.6; mx = Math.cos(a); mz = Math.sin(a); }
    else {
      this.fa = null;
      // hazard awareness with human-ish reaction time
      const dz = r.hazards.danger(u.pos, 1.0);
      if (dz) {
        if (!this.dodgeTarget) {
          this.dodgeT = 0.25 + (1 - this.skill) * 1.1 + Math.random() * 0.35;
          this.failed = Math.random() > 0.72 + this.skill * 0.27; // a few will just stand there
          this.dodgeTarget = dz.escape;
        }
        this.dodgeT -= dt;
        if (this.dodgeT <= 0 && !this.failed) { if (u.casting && !u.casting.channel) r.combat.interrupt(u); to(this.dodgeTarget, u.moveSpeed * 1.05, 0.4); }
      } else {
        this.dodgeTarget = null;
        const want = this.desired();
        const dist = Math.hypot(want.x - u.pos.x, want.z - u.pos.z);
        const tol = this.role === 'melee' || this.role === 'mt' || this.role === 'ot' ? 1.2 : 3.0;
        if (dist > tol && !(u.casting && dist < 8)) {
          // don't walk through danger
          const step = V(u.pos.x + (want.x - u.pos.x) / dist * 3, 0, u.pos.z + (want.z - u.pos.z) / dist * 3);
          if (!r.hazards.danger(step, 0.5) || dist > 25) to(want, u.moveSpeed, tol * 0.6);
        }
      }
    }
    if (u.flag('root') || u.flag('stun')) speed = 0;
    if (speed > 0) {
      if (u.casting && !u.flag('fear')) r.combat.interrupt(u);
      u.facing = Math.atan2(-mx, -mz);
      r.sim.move(u, mx * speed * dt * u.mod('speed'), mz * speed * dt * u.mod('speed'), dt);
    }
    r.sim.vertical(u, dt);
    u.stateAnim.speed = speed; u.stateAnim.combat = boss.brain.phase > 0; u.stateAnim.grounded = u.grounded; u.stateAnim.vy = u.vy;
    if (boss.brain.phase === 0 || u.flag('fear')) { u.autoAttack = false; return; }
    this.act(dt, speed > 0);
  }

  act(dt, moving) {
    const u = this.u, r = this.r, c = r.combat, boss = r.boss;
    this.actT -= dt;
    // tank cooldown for breath
    if (this.role === 'mt' && boss.casting?.id === 'breath' && !u.hasAura('shieldWall') && this.shieldWallT <= 0) { u.addAura('shieldWall', u); this.shieldWallT = 20; if (Math.random() < 0.3) r.say(u, 'shield wall up'); }
    this.shieldWallT -= dt;
    // pick target
    let tgt = boss;
    const ph = boss.brain.phase;
    if (ph === 2 && (this.role === 'mt' || this.role === 'ot' || this.role === 'melee')) tgt = this.whelpTarget() || boss;
    if (ph !== 2 && this.role !== 'heal') { const w = this.whelpTarget(); if (w && Math.hypot(w.pos.x - u.pos.x, w.pos.z - u.pos.z) < 8) tgt = w; }
    if (tgt.dead) tgt = boss;
    u.target = tgt;
    const melee = this.role === 'mt' || this.role === 'ot' || this.role === 'melee';
    u.autoAttack = melee && !tgt.flying;
    if (!moving && !u.casting) c.faceTarget(u, tgt);
    if (this.role === 'heal') { if (!moving) this.heal(); return; }
    if (moving && !melee) return;
    if (this.actT > 0 || u.casting || u.gcd > 0) return;
    this.actT = 0.2 + (1 - this.skill) * 0.6 + Math.random() * 0.25;
    // tanks taunt-style threat bump on pickup
    if ((this.role === 'mt') && boss.target !== u && ph !== 2) { boss.threat.set(u, (boss.threat.get(u) || 0) + 2500); }
    for (const id of ROT[u.cls] || ROT.warrior) {
      const sp = SPELLS[id]; if (!sp) continue;
      if (sp.learn && sp.learn > u.level) continue;
      if (id === 'wordOfPain' && tgt.hasAura('anguish')) continue;
      if (id === 'rend' && tgt.hasAura('rend')) continue;
      if (id === 'thunderclap' && !r.whelps.some(w => !w.dead && w.pos.distanceTo(u.pos) < 8)) continue;
      if (id === 'whirlwind' && !r.whelps.some(w => !w.dead && w.pos.distanceTo(u.pos) < 8)) continue;
      if (Math.random() > 0.6 + this.skill * 0.4) break;
      if (c.canCast(u, id, tgt).ok) { c.cast(u, id, tgt); break; }
    }
  }

  heal() {
    const u = this.u, r = this.r, c = r.combat;
    if (u.casting || u.gcd > 0) return;
    this.actT -= 0;
    const raid = r.raiders.filter(m => !m.dead);
    const mt = raid.find(m => m.raidRole === 'mt');
    const scored = raid.map(m => ({ m, s: m.hpPct - (m === mt ? 0.18 : 0) - (m === r.player ? 0.05 : 0) })).sort((a, b) => a.s - b.s);
    const low = scored[0];
    if (!low || low.s > 0.92) {
      // keep renew rolling on the tank, dps a little otherwise
      if (mt && !mt.hasAura('renew') && c.canCast(u, 'renew', mt).ok) return c.cast(u, 'renew', mt);
      if (u.cls === 'priest' && Math.random() < 0.3 && c.canCast(u, 'smite', r.boss).ok && !r.boss.flying) return c.cast(u, 'smite', r.boss);
      return;
    }
    const t = low.m, pct = t.hpPct;
    const opts = pct < 0.35 ? ['aegis', 'flashHeal'] : pct < 0.6 ? (t === mt ? ['greaterHeal', 'flashHeal'] : ['flashHeal', 'renew']) : ['renew', 'flashHeal'];
    if (raid.filter(m => m.hpPct < 0.7 && m.pos.distanceTo(u.pos) < 12).length >= 3) opts.unshift('holyNova');
    for (const id of opts) {
      if (id === 'renew' && t.hasAura('renew')) continue;
      if (id === 'aegis' && t.hasAura('weakenedSoul')) continue;
      if (u.cls === 'paladin' && id !== 'flashHeal') continue;
      if (c.canCast(u, id, t).ok) { c.cast(u, id, t); return; }
    }
  }
}
