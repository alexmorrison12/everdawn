// SimPlayer brain: an AI "player" that quests, idles in town, fishes, follows your party, duels and dies like a person.
import { SPELLS } from '../data/spells.js';
import { CAMPS, PLACES } from '../../world/zone.js';
import { bus } from '../events.js';
import { isHuman } from '../party.js';

const TOWN_SPOTS = [
  { x: 4, z: 142, act: 'mailbox' }, { x: 10, z: 157, act: 'statue' }, { x: -6, z: 136, act: 'inn' }, { x: 22, z: 164, act: 'well' },
  { x: 2, z: 160, act: 'bench', sit: true }, { x: 18, z: 143, act: 'bench', sit: true }, { x: 30, z: 170, act: 'smithy' }, { x: 12, z: 132, act: 'questgiver' },
  { x: -2, z: 147, act: 'square' }, { x: 20, z: 152, act: 'square' },
];
const FISH_SPOTS = [{ x: -54, z: 4, face: Math.PI }, { x: -52, z: 2, face: Math.PI * 0.9 }, { x: -96, z: 0, face: -0.3 }, { x: -20, z: -8, face: 0.9 }];

export class SimBrain {
  constructor(unit, game, social) {
    this.u = unit; this.g = game; this.s = social;
    this.act = null; this.actT = 0; this.dest = null; this.stuckT = 0; this.lastPos = unit.pos.clone();
    this.kills = 0; this.killGoal = 0; this.camp = null;
    this.restT = 0; this.emoteT = 5 + Math.random() * 20; this.jumpT = Math.random() * 8;
    this.skill = unit.persona.skill;
    this.reactT = 0.3 + (1 - this.skill) * 0.9;
    this.decideT = 0;
    this.choose();
  }

  choose(force) {
    const u = this.u, r = Math.random();
    if (force) { this.set(force); return; }
    if (u.party) { this.set('follow'); return; }
    if (u.persona.arch === 'afk' && r < 0.35) return this.set('afk');
    if (r < 0.52) this.set('quest');
    else if (r < 0.8) this.set('town');
    else if (r < 0.9) this.set('fish');
    else this.set('afk');
  }

  set(act) {
    const u = this.u;
    this.act = act; this.actT = 0; this.dest = null; this.camp = null; this.u.afk = false; this.u.fishing = false;
    if (act === 'quest') {
      const busy = c => this.s.sims.filter(o => o.brain?.act === 'quest' && o.brain.camp === c).length;
      const ok = CAMPS.filter(c => c.lv[0] <= u.level + 1 && c.lv[1] >= u.level - 2 && busy(c) < 2);
      if (!ok.length) { this.set('town'); return; }
      this.camp = (ok.length ? ok : CAMPS)[Math.floor(Math.random() * (ok.length || CAMPS.length))];
      const a = Math.random() * 6.28, rr = Math.random() * this.camp.r * 0.6;
      this.dest = [this.camp.x + Math.cos(a) * rr, this.camp.z + Math.sin(a) * rr];
      this.kills = 0; this.killGoal = 3 + Math.floor(Math.random() * 7);
      this.dur = 180 + Math.random() * 200;
    } else if (act === 'town') {
      this.spot = TOWN_SPOTS[Math.floor(Math.random() * TOWN_SPOTS.length)];
      this.dest = [this.spot.x + (Math.random() - 0.5) * 4, this.spot.z + (Math.random() - 0.5) * 4];
      this.dur = 40 + Math.random() * 100;
    } else if (act === 'fish') {
      this.spot = FISH_SPOTS[Math.floor(Math.random() * FISH_SPOTS.length)];
      this.dest = [this.spot.x, this.spot.z];
      this.dur = 90 + Math.random() * 120;
    } else if (act === 'afk') { this.dur = 30 + Math.random() * 90; u.afk = true; }
    else if (act === 'follow') { this.dur = 1e9; }
    else if (act === 'duel') { this.dur = 60; }
  }

  // ---------------------------------------------------------------- per frame
  update(dt) {
    const u = this.u, g = this.g;
    if (u.dead) { this.deadT = (this.deadT || 0) + dt; if (this.deadT > 14) this.s.respawnSim(u); return; }
    this.actT += dt; this.decideT -= dt;
    let speed = 0, mx = 0, mz = 0;
    const walk = (tx, tz, spd = u.moveSpeed, stop = 0.8) => {
      const dx = tx - u.pos.x, dz = tz - u.pos.z, d = Math.hypot(dx, dz);
      if (d < stop) return true;
      speed = spd; mx = dx / d; mz = dz / d; return false;
    };
    const inFight = u.target && !u.target.dead && u.isEnemy(u.target);
    if (u.flag('fear')) { speed = u.moveSpeed * 0.6; const a = (this.fearA ??= Math.random() * 6.28); mx = Math.cos(a); mz = Math.sin(a); }
    else if (inFight) this.fight(dt, (spd, x, z) => { speed = spd; mx = x; mz = z; });
    else {
      u.autoAttack = false;
      if (this.act !== 'follow' && this.actT > this.dur && this.decideT <= 0) { this.decideT = 2; this.choose(); }
      // rest when hurt
      if (u.hpPct < 0.55 && !u.inCombat && this.act !== 'follow') {
        this.restT += dt; u.stateAnim.sit = true;
        if (u.hpPct > 0.95) { this.restT = 0; }
        if (u.powerType === 'mana') u.gain(u.powerMax * 0.05 * dt);
        u.hp = Math.min(u.hpMax, u.hp + u.hpMax * 0.06 * dt);
      } else {
        u.stateAnim.sit = false;
        switch (this.act) {
          case 'quest': this.questing(dt, walk); break;
          case 'town': if (this.dest && walk(this.dest[0], this.dest[1], u.moveSpeed * 0.9)) { this.dest = null; this.arrived(); } this.idleFidget(dt); break;
          case 'fish': if (this.dest && walk(this.dest[0], this.dest[1])) { this.dest = null; u.fishing = true; u.facing = this.spot.face; } break;
          case 'follow': this.following(dt, walk); break;
          case 'afk': break;
          case 'duel': break;
        }
      }
    }
    // stuck detection
    if (speed > 0) {
      const moved = Math.hypot(u.pos.x - this.lastPos.x, u.pos.z - this.lastPos.z);
      this.stuckT = moved < speed * dt * 0.2 ? this.stuckT + dt : 0;
      if (this.stuckT > 1.2) { this.stuckT = 0; const a = Math.random() * 6.28; this.detour = [u.pos.x + Math.cos(a) * 8, u.pos.z + Math.sin(a) * 8, 1.2]; }
    }
    if (this.detour) { this.detour[2] -= dt; const dx = this.detour[0] - u.pos.x, dz = this.detour[1] - u.pos.z, d = Math.hypot(dx, dz) || 1; mx = dx / d; mz = dz / d; speed = u.moveSpeed; if (this.detour[2] <= 0) this.detour = null; }
    this.lastPos.copy(u.pos);
    if (u.flag('root') || u.flag('stun')) speed = 0;
    if (speed > 0) {
      if (!inFight || !u.casting) u.facing = Math.atan2(-mx, -mz);
      if (u.casting) g.combat.interrupt(u);
      g.sim.move(u, mx * speed * dt * u.mod('speed'), mz * speed * dt * u.mod('speed'), dt);
    }
    // bunny hop like a real player
    this.jumpT -= dt;
    if (this.jumpT <= 0) { this.jumpT = 4 + Math.random() * 14; if (speed > 0 && u.grounded && Math.random() < 0.5 + (u.persona.arch === 'noob' ? 0.3 : 0)) { u.vy = 8; u.grounded = false; u.model?.play?.('jump'); } }
    g.sim.vertical(u, dt);
    u.stateAnim.speed = speed; u.stateAnim.strafe = 0; u.stateAnim.combat = inFight; u.stateAnim.grounded = u.grounded; u.stateAnim.vy = u.vy; u.stateAnim.swimming = u.swimming;
  }

  arrived() {
    const u = this.u, sp = this.spot;
    if (!sp) return;
    if (sp.act === 'mailbox' && Math.random() < 0.6) { u.model?.play?.('dance'); u.dancing = true; }
    if (sp.sit) u.stateAnim.sit = true;
    if (sp.act === 'statue' || sp.act === 'square') u.facing = Math.random() * 6.28;
  }

  idleFidget(dt) {
    const u = this.u;
    this.emoteT -= dt;
    if (this.emoteT <= 0 && !this.dest) {
      this.emoteT = 8 + Math.random() * 25;
      const e = ['wave', 'cheer', 'laugh', 'point', 'dance', 'bow', 'roar'][Math.floor(Math.random() * 7)];
      u.model?.play?.(e);
      if (e === 'dance') u.dancing = true;
      // wave at the player when near
      const p = this.g.player;
      if (p && !this.wavedAt && Math.hypot(p.pos.x - u.pos.x, p.pos.z - u.pos.z) < 12 && Math.random() < 0.05 && !(this.s.lastWaveT > this.g.time - 45)) {
        this.s.lastWaveT = this.g.time;
        this.wavedAt = true;
        u.facing = Math.atan2(-(p.pos.x - u.pos.x), -(p.pos.z - u.pos.z)); u.model?.play?.('wave');
        bus.emit('emote', { unit: u, text: `${u.name} waves at you.` });
      }
    }
  }

  questing(dt, walk) {
    const u = this.u, g = this.g, c = this.camp;
    if (!c) return this.choose();
    const dCamp = Math.hypot(c.x - u.pos.x, c.z - u.pos.z);
    if (this.dest) { if (walk(this.dest[0], this.dest[1])) this.dest = null; if (dCamp > c.r + 15) return; }
    // look for a mob nobody else is fighting
    this.scanT = (this.scanT || 0) - dt;
    if (this.scanT <= 0) {
      this.scanT = 0.6 + Math.random() * 0.8;
      // ...and leave the human some room: mobs within 22 m of the player are theirs unless the player is in our group
      const pl = g.player, mine = pl && u.party && u.party === pl.party;
      const t = g.sim.nearest(u.pos, 34, m => m.hostile && !m.dead && m.kind === 'mob' && m.template === c.mob && (!m.tapper || m.tapper === u || m.tapper === u.party) && !m.boss && !m.elite
        && (m.tapper || mine || !pl || pl.dead || Math.hypot(m.pos.x - pl.pos.x, m.pos.z - pl.pos.z) > 22));
      if (t) { this.engage(t); return; }
      if (!this.dest) { const a = Math.random() * 6.28, rr = Math.random() * c.r; this.dest = [c.x + Math.cos(a) * rr, c.z + Math.sin(a) * rr]; }
    }
    if (this.kills >= this.killGoal) this.choose();
  }

  following(dt, walk) {
    const u = this.u, party = u.party;
    // follow the group's leader (a human leads any group with people in it), or the nearest person in it
    const here = m => isHuman(m) && !m.offline;
    const leader = here(party?.leader) ? party.leader : party?.all.find(here);
    if (!leader) { this.choose(); return; }
    const slot = party.all.filter(m => m.kind === 'sim').indexOf(u);
    const ang = leader.facing + (slot - 1.5) * 0.65; // behind the leader: +sin/+cos of facing
    const tx = leader.pos.x + Math.sin(ang) * 3.4, tz = leader.pos.z + Math.cos(ang) * 3.4;
    const d = Math.hypot(tx - u.pos.x, tz - u.pos.z);
    if (d > 60) { u.pos.set(tx, this.g.world.heightAt(tx, tz), tz); return; }
    walk(tx, tz, u.moveSpeed * (d > 12 ? 1.15 : 1), 1.4);
    // assist
    const tgt = leader.target;
    if (tgt && !tgt.dead && u.isEnemy(tgt) && (leader.inCombat || tgt.inCombat)) this.engage(tgt);
    // heal the leader / party
    if (u.role === 'heal') this.healParty();
  }

  engage(t) {
    const u = this.u;
    u.target = t;
    this.g.combat.faceTarget(u, t);
  }

  healParty() {
    const u = this.u, g = this.g;
    if (u.casting || u.gcd > 0) return;
    const party = u.party ? u.party.all : [u];
    const low = party.filter(m => m && !m.dead && m.hpPct < 0.72).sort((a, b) => a.hpPct - b.hpPct)[0];
    if (!low) return;
    const spell = u.cls === 'priest' ? (low.hpPct < 0.45 && u.level >= 4 && !low.hasAura('weakenedSoul') ? 'aegis' : u.level >= 5 && !low.hasAura('renew') ? 'renew' : 'flashHeal') : 'flashHeal';
    g.combat.cast(u, spell, low);
  }

  fight(dt, steer) {
    const u = this.u, g = this.g, t = u.target;
    const d = Math.hypot(t.pos.x - u.pos.x, t.pos.z - u.pos.z);
    const ranged = u.cls === 'mage' || u.cls === 'priest' || u.cls === 'hunter';
    const want = ranged ? 22 : 2.2 + t.radius;
    if (d > want) steer(u.moveSpeed, (t.pos.x - u.pos.x) / d, (t.pos.z - u.pos.z) / d);
    else if (!u.casting) g.combat.faceTarget(u, t);
    if (!ranged) u.autoAttack = true;
    // survival instincts: one potion per fight, healers self-heal
    if (u.hpPct < 0.3 && !this.potted && Math.random() < dt * 3) { this.potted = true; g.combat.heal(u, u, u.hpMax * 0.04); }
    this.reactT -= dt;
    if (this.reactT > 0 || u.casting || u.gcd > 0) return;
    if ((u.cls === 'priest' || u.cls === 'paladin') && u.hpPct < 0.5 && g.combat.canCast(u, 'flashHeal', u).ok) { g.combat.cast(u, 'flashHeal', u); return; }
    this.reactT = 0.25 + (1 - this.skill) * 0.8 + Math.random() * 0.3;
    if (u.role === 'heal' || u.cls === 'priest' || u.cls === 'paladin') { const before = u.casting; this.healParty(); if (u.casting !== before) return; }
    const rot = ROTATION[u.cls] || ROTATION.warrior;
    for (const id of rot) {
      const sp = SPELLS[id];
      if (sp.learn && sp.learn > u.level) continue;
      if (sp.requiresTargetBelow && t.hpPct > sp.requiresTargetBelow) continue;
      if (id === 'wordOfPain' && t.hasAura('anguish')) continue;
      if (id === 'rend' && t.hasAura('rend')) continue;
      if (id === 'thunderclap' && g.sim.query(u.pos, 8).filter(m => u.isEnemy(m) && !m.dead).length < 2) continue;
      if (id === 'charge' && d < 9) continue;
      const chk = g.combat.canCast(u, id, t);
      if (!chk.ok) continue;
      if (Math.random() > 0.55 + this.skill * 0.45) break; // imperfect players skip buttons
      g.combat.cast(u, id, t);
      break;
    }
  }

  onKill() { this.kills++; this.potted = false; }
}

const ROTATION = {
  warrior: ['execute', 'victoryRush', 'charge', 'mortalBlow', 'thunderclap', 'rend', 'valiantStrike'],
  paladin: ['charge', 'valiantStrike', 'thunderclap'],
  rogue: ['valiantStrike', 'rend'],
  mage: ['pyroblast', 'fireBlast', 'frostNova', 'fireball', 'frostbolt'],
  priest: ['wordOfPain', 'mindSpike', 'smite'],
  hunter: ['simShot'],
};
