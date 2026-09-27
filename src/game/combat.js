// Combat engine: casting, cooldowns, GCD, projectiles, channels, melee swings, damage/heal pipeline,
// crits, absorbs, threat, auras, regen, death. Everything observable is emitted on the bus.
import { SPELLS, AURAS, GCD } from './data/spells.js';
import { bus } from './events.js';
import { RNG } from '../core/noise.js';
import { SCALE } from './unit.js';

const MELEE_REACH = 2.6;

export class Combat {
  constructor(sim) {
    this.sim = sim;
    this.rng = new RNG(1234);
    this.flying = [];     // projectiles in flight { caster, spell, id, target, t, ctxOpts }
    this.delayed = [];    // { t, fn }
    this.time = 0;
  }

  // ---------------------------------------------------------------- casting
  spellCost(caster, sp) {
    const c = typeof sp.cost === 'function' ? sp.cost({ L: caster.level }) : (sp.cost || 0);
    return Math.round(sp.powerType === 'mana' ? c * 0.6 : c);
  }
  rangeTo(a, b) { return Math.max(0, Math.hypot(a.pos.x - b.pos.x, a.pos.z - b.pos.z) - (a.radius + b.radius) * 0.5); }
  facingOk(a, b, arc = Math.PI * 0.6) {
    const ang = Math.atan2(-(b.pos.x - a.pos.x), -(b.pos.z - a.pos.z));
    let d = ang - a.facing; d = Math.atan2(Math.sin(d), Math.cos(d));
    return Math.abs(d) <= arc;
  }

  canCast(caster, id, target, point) {
    const sp = SPELLS[id];
    if (!sp) return { ok: false, err: 'Unknown spell' };
    if (caster.dead) return { ok: false, err: 'You are dead' };
    if (caster.flag('stun')) return { ok: false, err: "Can't do that while stunned" };
    if (caster.flag('fear')) return { ok: false, err: "Can't do that while feared" };
    if (caster.casting) return { ok: false, err: 'Another action is in progress', silent: true };
    if (caster.cdLeft(id) > 0) return { ok: false, err: 'Spell is not ready yet' };
    if (!sp.offGcd && caster.gcd > 0) return { ok: false, err: 'Spell is not ready yet', silent: true };
    const cost = this.spellCost(caster, sp);
    if (sp.requiresAura && !caster.hasAura(sp.requiresAura)) return { ok: false, err: 'You must have killed an enemy recently' };
    if (sp.powerType && caster.powerType === sp.powerType && caster.power < cost) return { ok: false, err: sp.powerType === 'rage' ? 'Not enough rage' : sp.powerType === 'energy' ? 'Not enough energy' : 'Not enough mana' };
    if (sp.target === 'enemy') {
      if (!target || target.dead) return { ok: false, err: 'You have no target' };
      if (!caster.isEnemy(target)) return { ok: false, err: 'Invalid target' };
      const d = this.rangeTo(caster, target);
      const range = sp.melee ? Math.max(sp.range, MELEE_REACH + target.radius) : sp.range;
      if (d > range) return { ok: false, err: 'Out of range' };
      if (sp.minRange && d < sp.minRange) return { ok: false, err: 'Target is too close' };
      if (sp.melee && target.flying) return { ok: false, err: 'Target is too high to reach' };
      if (sp.melee && !this.facingOk(caster, target)) return { ok: false, err: 'You are facing the wrong way!' };
      if (sp.requiresTargetBelow && target.hpPct > sp.requiresTargetBelow) return { ok: false, err: 'Target must be below 20% health' };
    }
    if (sp.target === 'ally') {
      const t = target && !caster.isEnemy(target) && !target.dead ? target : caster;
      if (this.rangeTo(caster, t) > sp.range) return { ok: false, err: 'Out of range' };
      if (sp.blockedBy && t.hasAura(sp.blockedBy)) return { ok: false, err: 'Target is affected by Weakened Soul' };
    }
    if (sp.target === 'ground' && point && Math.hypot(point.x - caster.pos.x, point.z - caster.pos.z) > sp.range) return { ok: false, err: 'Out of range' };
    return { ok: true, cost };
  }

  /** Try to cast. Returns true on start/success. */
  cast(caster, id, target = caster.target, point = null) {
    const sp = SPELLS[id];
    if (sp?.target === 'ally') target = target && !caster.isEnemy(target) && !target.dead ? target : caster;
    if (sp?.target === 'self' || sp?.target === 'none') target = caster;
    if (sp?.target === 'ground' && !point) point = (caster.target && !caster.target.dead) ? caster.target.pos.clone() : caster.pos.clone();
    const chk = this.canCast(caster, id, target, point);
    if (!chk.ok) { if (!chk.silent) bus.emit('error', { unit: caster, msg: chk.err }); return false; }
    const instant = !sp.cast && !sp.channel || (sp.instantWith && caster.hasAura(sp.instantWith));
    if (sp.target === 'enemy' || sp.target === 'ally') this.faceTarget(caster, target);
    caster.enterCombatIf = sp.target === 'enemy';
    if (!sp.offGcd) { caster.gcd = (sp.gcd ?? GCD) / (1 + caster.stats.haste / 100); caster.gcdMax = caster.gcd; }
    if (instant) {
      if (sp.instantWith && caster.hasAura(sp.instantWith)) caster.removeAura(sp.instantWith);
      this.execute(caster, id, target, point);
    } else {
      const dur = (sp.cast || sp.channel) / (1 + caster.stats.haste / 100);
      caster.casting = { id, spell: sp, t: 0, dur, target, point, channel: !!sp.channel, ticks: sp.ticks || 0, tickT: 0, done: 0 };
      if (sp.channel) this.pay(caster, sp);
      bus.emit('cast_start', { unit: caster, spell: sp, id, dur, target, channel: !!sp.channel });
    }
    return true;
  }

  faceTarget(u, t) { if (t && t !== u) u.facing = Math.atan2(-(t.pos.x - u.pos.x), -(t.pos.z - u.pos.z)); }

  pay(caster, sp) {
    const cost = this.spellCost(caster, sp);
    if (sp.powerType && caster.powerType === sp.powerType && !sp.drainsPower) caster.power = Math.max(0, caster.power - cost);
    if (sp.drainsPower) caster.power = Math.max(0, caster.power - cost);
  }

  interrupt(u, reason = 'Interrupted') {
    if (!u.casting) return;
    const c = u.casting; u.casting = null;
    bus.emit('cast_stop', { unit: u, spell: c.spell, id: c.id, reason });
  }

  execute(caster, id, target, point) {
    const sp = SPELLS[id];
    if (!sp.channel) this.pay(caster, sp);
    if (sp.cd) caster.cooldowns.set(id, sp.cd);
    if (sp.target === 'enemy' && target) { this.engage(caster, target); }
    // special movement
    if (sp.charge && target) bus.emit('charge', { unit: caster, target });
    if (sp.blink) bus.emit('blink', { unit: caster, dist: sp.blink });
    bus.emit('spell_go', { unit: caster, spell: sp, id, target, point });
    const apply = () => this.applyEffect(caster, sp, id, target, point);
    if (sp.fx?.projectile && target && target !== caster) {
      const d = Math.hypot(target.pos.x - caster.pos.x, target.pos.z - caster.pos.z);
      this.flying.push({ caster, sp, id, target, t: d / (sp.speed || 30), point });
    } else if (sp.charge && target) {
      const d = this.rangeTo(caster, target);
      this.later(Math.min(0.9, d / 30), apply);
    } else apply();
  }

  applyEffect(caster, sp, id, target, point) {
    if (sp.target === 'enemy' && (!target || target.dead)) return;
    const ctx = this.ctx(caster, target, point, sp, id);
    try { sp.effect?.(ctx); } catch (e) { console.error('spell effect', id, e); }
    bus.emit('spell_hit', { unit: caster, spell: sp, id, target, point });
  }

  ctx(caster, target, point, sp, id) {
    const sim = this.sim, self = this;
    return {
      caster, target, point, L: caster.level, sp: caster.stats.sp, ap: caster.stats.ap, rng: () => self.rng.next(),
      damage: (t, amt, school, o = {}) => self.damage(caster, t, amt, school, { ...o, spell: sp, spellId: id }),
      heal: (t, amt, o = {}) => self.heal(caster, t, amt, { ...o, spell: sp, spellId: id }),
      aura: (t, aid, o = {}) => self.applyAura(caster, t, aid, o),
      weapon: (mult = 1) => self.weaponRoll(caster) * mult,
      enemiesNear: (c, r) => sim.query(c, r).filter(u => caster.isEnemy(u) && !u.dead),
      alliesNear: (c, r) => sim.query(c, r).filter(u => !u.dead && u.hostile === caster.hostile && (u.kind === 'player' || u.kind === 'sim' || u.kind === 'remote' || u.kind === 'npc' && u.guard)),
    };
  }

  weaponRoll(u) {
    const s = u.stats;
    return (s.dmgMin + (s.dmgMax - s.dmgMin) * this.rng.next()) + s.ap / 14 * s.swing;
  }

  applyAura(src, dst, id, opts = {}) {
    if (!dst || dst.dead) return null;
    const def = AURAS[id];
    if (!def) return null;
    if (def.debuff && src.isEnemy(dst)) this.engage(src, dst);
    if (def.mods?.fear && dst.boss) return null;
    const a = dst.addAura(id, src, opts);
    if (def.mods?.root || def.mods?.stun || def.mods?.fear) { if (dst.casting) this.interrupt(dst, 'Interrupted'); }
    return a;
  }

  engage(a, b) {
    if (!a || !b || a === b) return;
    a.enterCombat(); b.enterCombat();
    if (b.hostile && !b.tapper) b.tapper = a.party || a;
    if (a.hostile && !a.tapper) a.tapper = b.party || b;
    if (b.threat && !b.threat.has(a)) b.threat.set(a, 1);
    if (a.threat && !a.threat.has(b)) a.threat.set(b, 1);
    if (!b.target && b.brain) b.target = a;
    bus.emit('engage', { a, b });
  }

  // ---------------------------------------------------------------- damage & healing
  damage(src, dst, amt, school = 'physical', o = {}) {
    if (!dst || dst.dead || amt <= 0) return 0;
    amt *= SCALE;
    if (dst.immune) { bus.emit('miss', { src, dst, what: 'Immune' }); return 0; }
    this.engage(src, dst);
    // avoidance for direct hits
    if (!o.dot && !o.noMiss) {
      const r = this.rng.next();
      const lvl = Math.max(0, (dst.level - src.level)) * 0.01;
      if (school === 'physical') {
        if (r < 0.03 + lvl) { bus.emit('miss', { src, dst, what: 'Miss' }); return 0; }
        if (r < 0.05 + lvl && (dst.kind === 'mob' || dst.kind === 'boss') && !o.ability) { bus.emit('miss', { src, dst, what: 'Dodge' }); return 0; }
      } else if (r < 0.015 + lvl) { bus.emit('miss', { src, dst, what: 'Resist' }); return 0; }
    }
    let crit = false;
    if (!o.dot && !o.noCrit) {
      const cc = src.stats.crit + (school === 'fire' && src.cls === 'mage' ? 6 : 0);
      crit = !!o.forceCrit || this.rng.next() * 100 < cc;
    }
    let dmg = amt * (crit ? (school === 'physical' ? 2 : 1.6) : 1);
    dmg *= src.mod('damage') * dst.mod('damageTaken');
    if (school === 'physical' && !o.bleed) {
      const ar = dst.stats.armor, dr = Math.min(0.7, ar / (ar + 400 + 85 * src.level));
      dmg *= 1 - dr;
    }
    dmg = Math.max(1, Math.round(dmg * (0.95 + this.rng.next() * 0.1)));
    // absorbs
    let absorbed = 0;
    for (const a of dst.auras) {
      if (!a.def.absorb || a.absorb <= 0) continue;
      const take = Math.min(a.absorb, dmg - absorbed);
      a.absorb -= take; absorbed += take;
      if (a.absorb <= 0) this.later(0, () => dst.removeAura(a.id));
      if (absorbed >= dmg) break;
    }
    const dealt = dmg - absorbed;
    dst.hp -= dealt;
    // break-on-damage auras
    for (const a of [...dst.auras]) if (a.def.breakOnDamage !== undefined && a.dur - a.rem > a.def.breakOnDamage && !o.dot) dst.removeAura(a.id);
    // threat
    if (dst.threat) dst.threat.set(src, (dst.threat.get(src) || 0) + (dealt + absorbed) * (src.threatMod || 1));
    // rage
    if (src.powerType === 'rage' && !o.dot) src.gain(o.ability ? 0 : 6 + dealt / SCALE * 0.08);
    if (dst.powerType === 'rage') dst.gain(2 + dealt / SCALE * 0.12);
    // meters
    src.meter.dmg += dealt + absorbed; dst.meter.taken += dealt;
    if (o.avoidable) { dst.meter.avoidable = (dst.meter.avoidable || 0) + dealt; dst.meter.avoidHits = (dst.meter.avoidHits || 0) + 1; }
    dst.lastDamagedBy = src;
    // hot streak
    if (o.canHeat && src.cls === 'mage' && src.level >= 6) {
      if (crit) {
        if (src.hasAura('heatingUp')) { src.removeAura('heatingUp'); src.addAura('hotStreak', src); bus.emit('proc', { unit: src, id: 'hotStreak' }); }
        else src.addAura('heatingUp', src);
      } else if (o.spellId !== 'fireBlast') src.removeAura('heatingUp');
    }
    bus.emit('damage', { src, dst, amount: dealt, absorbed, school, crit, spell: o.spell, spellId: o.spellId, dot: !!o.dot, melee: !!o.melee, aoe: !!o.aoe });
    if (dst.hp <= 0) this.kill(dst, src);
    return dealt;
  }

  heal(src, dst, amt, o = {}) {
    if (!dst || dst.dead) return 0;
    amt *= SCALE;
    const crit = !o.hot && this.rng.next() * 100 < src.stats.crit;
    let h = amt * (crit ? 1.5 : 1) * dst.mod('healingTaken');
    h = Math.round(h * (0.95 + this.rng.next() * 0.1));
    const eff = Math.min(h, dst.hpMax - dst.hp);
    dst.hp += eff;
    src.meter.heal += eff;
    // healing threat on engaged mobs
    if (eff > 0 && (src.inCombat || dst.inCombat)) for (const m of this.sim.query(dst.pos, 40)) if (m.threat && m.hostile && m.threat.has(dst)) m.threat.set(src, (m.threat.get(src) || 0) + eff * 0.5);
    bus.emit('heal', { src, dst, amount: eff, over: h - eff, crit, spell: o.spell, spellId: o.spellId, hot: !!o.hot });
    return eff;
  }

  kill(dst, src) {
    if (dst.dead) return;
    dst.dead = true; dst.hp = 0; dst.deadT = 0;
    this.interrupt(dst, 'Died');
    dst.auras = dst.auras.filter(a => a.id === 'ghost');
    dst.autoAttack = false;
    if (src && src.kind !== 'mob' && dst.hostile && src.cls === 'warrior') src.addAura('victorious', src);
    bus.emit('death', { unit: dst, killer: src });
  }

  // ---------------------------------------------------------------- per-frame
  later(t, fn) { this.delayed.push({ t, fn }); }

  update(dt) {
    this.time += dt;
    for (let i = this.delayed.length - 1; i >= 0; i--) { const d = this.delayed[i]; d.t -= dt; if (d.t <= 0) { this.delayed.splice(i, 1); d.fn(); } }
    for (let i = this.flying.length - 1; i >= 0; i--) {
      const p = this.flying[i]; p.t -= dt;
      if (p.t <= 0) { this.flying.splice(i, 1); this.applyEffect(p.caster, p.sp, p.id, p.target, p.point); }
    }
    for (const u of this.sim.units) this.updateUnit(u, dt);
  }

  updateUnit(u, dt) {
    if (u.dead) { u.deadT += dt; return; }
    // cooldowns
    if (u.gcd > 0) u.gcd = Math.max(0, u.gcd - dt);
    for (const [k, v] of u.cooldowns) { if (v <= dt) u.cooldowns.delete(k); else u.cooldowns.set(k, v - dt); }
    // auras
    for (let i = u.auras.length - 1; i >= 0; i--) {
      const a = u.auras[i];
      if (!a) continue;
      a.rem -= dt;
      if (a.def.tick) {
        a.tickT -= dt;
        while (a.tickT <= 0 && a.rem > -0.01) {
          a.tickT += a.def.tick;
          if (a.opts.tickDmg && a.src && !a.src.dead) this.damage(a.src, u, a.opts.tickDmg * (a.stacks || 1), a.def.school || 'physical', { dot: true, noMiss: true, bleed: a.def.bleed, spellId: a.id });
          else if (a.opts.tickDmg && a.src) this.damage(a.src, u, a.opts.tickDmg, a.def.school || 'physical', { dot: true, noMiss: true, bleed: a.def.bleed, spellId: a.id });
          if (a.opts.tickHeal) this.heal(a.src || u, u, a.opts.tickHeal, { hot: true, spellId: a.id });
          if (u.dead) return;
        }
      }
      if (a.def.regenPct && u.powerType === 'mana') u.gain(u.powerMax * a.def.regenPct * dt);
      if (a.def.healPct) u.hp = Math.min(u.hpMax, u.hp + u.hpMax * a.def.healPct * dt);
      if (a.rem <= 0) u.removeAura(a.id);
    }
    // eating/drinking cancel in combat or when moving handled by controller
    // combat timer
    if (u.inCombat) {
      const engaged = u.threat.size > 0 && [...u.threat.keys()].some(o => !o.dead && o.inCombat);
      if (u.hostile) { if (!engaged && !u.target) u.combatT -= dt; else u.combatT = 6; }
      else u.combatT -= dt;
      if (u.combatT <= 0) { u.inCombat = false; u.threat.clear(); }
    }
    // regen
    if (!u.inCombat) {
      u.hp = Math.min(u.hpMax, u.hp + u.hpMax * (u.kind === 'player' || u.kind === 'remote' ? 0.025 : 0.05) * dt);
      if (u.powerType === 'rage') u.gain(-2.5 * dt);
    }
    if (u.powerType === 'mana') {
      const castRecently = (this.time - (u.lastCastTime ?? -99)) < 4;
      u.gain(u.powerMax * (castRecently ? 0.022 : (u.inCombat ? 0.035 : 0.045)) * dt);
    }
    if (u.powerType === 'energy') u.gain(12 * dt);
    // casting
    const c = u.casting;
    if (c) {
      if (u.flag('stun') || u.flag('fear')) { this.interrupt(u, 'Interrupted'); }
      else if (c.target && c.target.dead && c.spell.target === 'enemy') this.interrupt(u, 'Target died');
      else {
        c.t += dt;
        if (c.channel) {
          const every = c.dur / c.ticks;
          while (c.done < c.ticks && c.t >= every * (c.done + 1) - 1e-4) {
            c.done++;
            if (c.target && !c.target.dead) {
              bus.emit('spell_go', { unit: u, spell: c.spell, id: c.id, target: c.target, tick: true });
              const d = Math.hypot(c.target.pos.x - u.pos.x, c.target.pos.z - u.pos.z);
              this.flying.push({ caster: u, sp: c.spell, id: c.id, target: c.target, t: d / (c.spell.speed || 30) });
            }
          }
          if (c.t >= c.dur) { u.casting = null; u.lastCastTime = this.time; bus.emit('cast_stop', { unit: u, spell: c.spell, id: c.id, reason: 'success' }); }
        } else if (c.t >= c.dur && c.custom) {
          u.casting = null; u.lastCastTime = this.time;
          bus.emit('cast_stop', { unit: u, spell: c.spell, id: c.id, reason: 'success' });
          c.custom();
        } else if (c.t >= c.dur) {
          u.casting = null; u.lastCastTime = this.time;
          // re-validate range/power at completion
          const sp = c.spell;
          if (sp.target === 'enemy' && c.target && this.rangeTo(u, c.target) > sp.range + 3) { bus.emit('cast_stop', { unit: u, spell: sp, id: c.id, reason: 'Out of range' }); bus.emit('error', { unit: u, msg: 'Out of range' }); }
          else {
            bus.emit('cast_stop', { unit: u, spell: sp, id: c.id, reason: 'success' });
            this.execute(u, c.id, c.target, c.point);
          }
        }
      }
    }
    // melee auto-attack
    if (u.autoAttack && u.target && !u.target.dead && !u.casting && !u.flag('stun') && !u.flag('fear')) {
      u.swingT -= dt * u.mod('attackSpeed') * (1 + u.stats.haste / 100);
      const reach = MELEE_REACH + u.radius * 0.5 + u.target.radius;
      const d = Math.hypot(u.target.pos.x - u.pos.x, u.target.pos.z - u.pos.z);
      if (u.swingT <= 0 && d <= reach && !u.target.flying) {
        if (u.kind !== 'player' || this.facingOk(u, u.target, Math.PI * 0.65)) {
          u.swingT = u.stats.swing;
          bus.emit('swing', { unit: u, target: u.target });
          this.damage(u, u.target, this.weaponRoll(u), 'physical', { melee: true });
        } else u.swingT = 0.2;
      }
    }
  }
}
