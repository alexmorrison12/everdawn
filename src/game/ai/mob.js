// Mob brain: wander → aggro → chase/attack with abilities → flee/call for help → leash/evade → respawn.
import { SPELLS } from '../data/spells.js';
import { bus } from '../events.js';

export class MobBrain {
  constructor(unit, tmpl, game) {
    this.u = unit; this.t = tmpl; this.g = game;
    this.state = 'idle';
    this.wanderT = Math.random() * 6; this.dest = null;
    this.scanT = Math.random() * 0.3;
    this.fleeT = 0; this.fled = false;
    this.abilityT = 1 + Math.random() * 2;
    this.leash = tmpl.leash ?? 48;
    this.yelled = false;
  }

  pickTarget() {
    const u = this.u; let best = null, bv = -1;
    for (const [o, v] of u.threat) { if (o.dead || !o.inCombat && o.kind !== 'player') continue; if (v > bv) { bv = v; best = o; } }
    return best;
  }

  aggroRadius(o) { return Math.max(4, (this.t.aggro || 12) - (o.level - this.u.level) * 1.6); }

  update(dt) {
    const u = this.u, g = this.g, sim = g.sim;
    if (u.dead) return;
    const speedMul = u.mod('speed');
    let moveX = 0, moveZ = 0, speed = 0;
    const stunned = u.flag('stun'), rooted = u.flag('root') || stunned;

    if (this.state === 'evade') {
      const dx = u.home.x - u.pos.x, dz = u.home.z - u.pos.z, d = Math.hypot(dx, dz);
      u.immune = true;
      if (d < 1.5) { this.state = 'idle'; u.immune = false; u.hp = u.hpMax; u.threat.clear(); u.target = null; u.inCombat = false; u.tapper = null; u.autoAttack = false; u.auras = []; this.fled = false; }
      else { speed = u.moveSpeed * 1.25; moveX = dx / d; moveZ = dz / d; }
    } else if (u.flag('fear')) {
      if (!this.fearDir || Math.random() < dt * 1.5) { const a = Math.random() * Math.PI * 2; this.fearDir = [Math.cos(a), Math.sin(a)]; }
      moveX = this.fearDir[0]; moveZ = this.fearDir[1]; speed = u.moveSpeed * 0.6;
    } else {
      // scan for aggro
      this.scanT -= dt;
      if (this.scanT <= 0 && this.state === 'idle' && !this.t.passive) {
        this.scanT = 0.25;
        for (const o of sim.query(u.pos, 22)) {
          if (!u.isEnemy(o) || o.dead || (o.kind !== 'player' && o.kind !== 'sim' && o.kind !== 'remote') || o.flag?.('ghost')) continue;
          if (o.hasAura('ghost')) continue;
          const d = Math.hypot(o.pos.x - u.pos.x, o.pos.z - u.pos.z);
          if (d < this.aggroRadius(o)) { this.aggro(o); break; }
        }
      }
      if (u.inCombat && this.state !== 'combat' && this.state !== 'flee') this.state = 'combat';
      if (this.state === 'combat' || this.state === 'flee') {
        const tgt = this.pickTarget() || (u.target && !u.target.dead ? u.target : null);
        const dh = Math.hypot(u.pos.x - u.home.x, u.pos.z - u.home.z);
        if (!tgt || dh > this.leash) { this.evade(); }
        else {
          u.target = tgt;
          // flee at low hp (humanoids / critters)
          if (this.t.flee && !this.fled && u.hpPct < this.t.flee) {
            this.fled = true; this.state = 'flee'; this.fleeT = 4.5;
            bus.emit('emote', { unit: u, text: `${u.name} attempts to run away in fear!` });
          }
          if (this.state === 'flee') {
            this.fleeT -= dt;
            const dx = u.pos.x - tgt.pos.x, dz = u.pos.z - tgt.pos.z, d = Math.hypot(dx, dz) || 1;
            moveX = dx / d; moveZ = dz / d; speed = u.moveSpeed * 0.62;
            u.autoAttack = false;
            if (this.fleeT <= 0) this.state = 'combat';
          } else {
            const d = Math.hypot(tgt.pos.x - u.pos.x, tgt.pos.z - u.pos.z);
            const reach = 2.1 + u.radius * 0.5 + tgt.radius;
            u.autoAttack = true;
            // abilities
            this.abilityT -= dt;
            if (this.abilityT <= 0 && !u.casting && !stunned) {
              this.abilityT = 1.2;
              for (const id of this.t.abilities || []) {
                const sp = SPELLS[id];
                if (u.cdLeft(id) > 0) continue;
                const chk = g.combat.canCast(u, id, tgt);
                if (!chk.ok) continue;
                if (sp.minRange && d < sp.minRange) continue;
                if (g.combat.cast(u, id, tgt)) { u.model?.play(sp.anim || 'attack'); break; }
              }
            }
            if (d > reach * 0.92 && !rooted) { speed = u.moveSpeed * speedMul; moveX = (tgt.pos.x - u.pos.x) / d; moveZ = (tgt.pos.z - u.pos.z) / d; }
            u.facing = Math.atan2(-(tgt.pos.x - u.pos.x), -(tgt.pos.z - u.pos.z));
          }
        }
      } else {
        // idle wander
        this.wanderT -= dt;
        if (this.wanderT <= 0) {
          this.wanderT = 5 + Math.random() * 9;
          if (Math.random() < 0.6) {
            const a = Math.random() * Math.PI * 2, r = Math.random() * (this.t.wander ?? 7);
            this.dest = [u.home.x + Math.cos(a) * r, u.home.z + Math.sin(a) * r];
          }
        }
        if (this.dest) {
          const dx = this.dest[0] - u.pos.x, dz = this.dest[1] - u.pos.z, d = Math.hypot(dx, dz);
          if (d < 0.5) this.dest = null; else { speed = u.moveSpeed * 0.3; moveX = dx / d; moveZ = dz / d; }
        }
      }
    }
    if (rooted && this.state !== 'evade') speed = 0;
    if (speed > 0 && (moveX || moveZ)) {
      if (this.state !== 'combat') u.facing = Math.atan2(-moveX, -moveZ);
      const water = this.t.family === 'gurgler' ? false : sim.isWater(u.pos.x + moveX * speed * dt * 4, u.pos.z + moveZ * speed * dt * 4);
      if (!water || this.state === 'evade') sim.move(u, moveX * speed * dt, moveZ * speed * dt, dt, { collide: this.state !== 'evade' });
    }
    sim.vertical(u, dt);
    u.stateAnim.speed = speed * (speed > 0 ? 1 : 0);
    u.stateAnim.combat = this.state === 'combat';
  }

  aggro(o) {
    const u = this.u, g = this.g;
    g.combat.engage(o, u);
    u.threat.set(o, (u.threat.get(o) || 0) + 5);
    u.target = o; this.state = 'combat';
    if (this.t.sound?.aggro) bus.emit('sound', { name: this.t.sound.aggro, pos: u.pos });
    if (this.t.yell && !this.yelled && Math.random() < 0.7) { this.yelled = true; bus.emit('say', { unit: u, text: this.t.yell[Math.floor(Math.random() * this.t.yell.length)], yell: true }); }
    // social pull
    if (this.t.social) for (const m of g.sim.query(u.pos, this.t.social)) {
      if (m !== u && m.brain instanceof MobBrain && !m.dead && m.brain.state === 'idle' && m.template === u.template) { m.brain.state = 'combat'; g.combat.engage(o, m); m.target = o; }
    }
  }

  evade() {
    const u = this.u;
    this.state = 'evade'; u.autoAttack = false; u.target = null; u.threat.clear();
    u.tapper = null; // an evading mob is nobody's anymore (it stays grey otherwise, long after the fight)
    if (u.casting) this.g.combat.interrupt(u);
    bus.emit('evade', { unit: u });
  }
}
