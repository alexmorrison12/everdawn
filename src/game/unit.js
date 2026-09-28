// Unit: anything that can fight — player, SimPlayers, NPCs, mobs, bosses.
import * as THREE from 'three';
import { CLASSES } from './data/classes.js';
import { AURAS } from './data/spells.js';
import { bus } from './events.js';

let NEXT_ID = 1;
export const SCALE = 10; // all health/damage/healing numbers are scaled for satisfying big numbers

export class Unit {
  constructor(o = {}) {
    this.id = NEXT_ID++;
    this.name = o.name || 'Unknown';
    this.kind = o.kind || 'mob';            // player | sim | npc | mob | boss | critter
    this.hostile = o.hostile ?? (this.kind === 'mob' || this.kind === 'boss');
    this.level = o.level || 1;
    this.cls = o.cls || null;
    this.race = o.race || null;
    this.sex = o.sex || 'm';
    this.guild = o.guild || null;
    this.template = o.template || null;     // mob template key
    this.elite = !!o.elite; this.rare = !!o.rare; this.boss = !!o.boss;
    this.pos = new THREE.Vector3().copy(o.pos || new THREE.Vector3());
    this.home = this.pos.clone();
    this.facing = o.facing || 0;
    this.radius = o.radius || 0.5;
    this.height = 1.9;
    this.vel = new THREE.Vector3();
    this.moveSpeed = o.moveSpeed || 7;
    this.powerType = o.powerType ?? (this.cls ? CLASSES[this.cls]?.power : null) ?? null;
    this.base = { hp: o.hp || 100, mana: o.mana || 0, dmgMin: o.dmgMin || 2, dmgMax: o.dmgMax || 4, swing: o.swing || 2.0, armor: o.armor || 0, ap: 0, sp: 0, crit: 5, haste: 0 };
    this.gearStats = { sta: 0, str: 0, agi: 0, int: 0, spi: 0, ap: 0, sp: 0, crit: 0, haste: 0, armor: 0, dmgMin: 0, dmgMax: 0 };
    this.stats = {};
    this.auras = [];
    this.cooldowns = new Map();
    this.gcd = 0; this.gcdMax = 1.5;
    this.casting = null;        // { spell, id, t, dur, target, point, channel, ticks, tickT }
    this.target = null;
    this.autoAttack = false;
    this.swingT = 0;
    this.threat = new Map();    // mobs: unit → threat
    this.inCombat = false; this.combatT = 0;
    this.dead = false; this.deadT = 0;
    this.model = null;          // rig from models/*
    this.brain = null;          // AI controller
    this.party = null;          // Party (game/party.js)
    this.duel = null; this.duelWith = null; // game/duel.js: the duel you're in, and your opponent once it has begun
    this.spells = o.spells || [];
    this.lastDamagedBy = null;
    this.tapper = null;         // who gets credit (first damager's party); UI reads the boolean `tapped`
    this.stateAnim = { speed: 0, strafe: 0, turn: 0, grounded: true, vy: 0, combat: false, casting: null, swimming: false, dead: false, sit: false };
    this.recalc();
    this.hp = this.hpMax;
    this.power = this.powerType === 'rage' ? 0 : this.powerMax;
    this.meter = { dmg: 0, heal: 0, taken: 0, start: 0 };
  }

  get alive() { return !this.dead; }
  get hpPct() { return this.hpMax ? this.hp / this.hpMax : 0; }
  isEnemy(u) { return !!u && u !== this && (this.duelWith === u || (this.hostile !== u.hostile && u.kind !== 'critter' && u.kind !== 'npc')); } // duel opponents are enemies to each other alone

  recalc() {
    const g = this.gearStats, b = this.base;
    const auraAP = this.auras.reduce((s, a) => s + (a.opts?.ap || 0), 0);
    const hpPct = this.hpMax ? this.hp / this.hpMax : 1;
    const mpPct = this.powerMax ? this.power / this.powerMax : 1;
    this.hpMax = Math.round((b.hp + g.sta * 10) * SCALE);
    this.powerMax = this.powerType === 'rage' ? 100 : this.powerType === 'energy' ? 100 : Math.round(b.mana + g.int * 15);
    const L = this.level;
    this.stats = {
      ap: b.ap + g.ap + g.str * 2 + g.agi + auraAP + L * 3,
      sp: b.sp + g.sp + g.int * 0.5,
      crit: b.crit + g.crit + g.agi * 0.05 + g.int * 0.03,
      haste: b.haste + g.haste,
      armor: b.armor + g.armor,
      dmgMin: b.dmgMin + g.dmgMin, dmgMax: b.dmgMax + g.dmgMax,
      swing: b.swing,
    };
    if (this.hp !== undefined) { this.hp = Math.min(this.hpMax, Math.round(this.hpMax * hpPct)); }
    if (this.power !== undefined && this.powerType !== 'rage') this.power = Math.min(this.powerMax, Math.round(this.powerMax * mpPct));
  }

  // ------- auras -------
  hasAura(id) { return this.auras.some(a => a.id === id); }
  getAura(id) { return this.auras.find(a => a.id === id); }
  mod(key) { // multiplicative mods from auras
    let m = 1; for (const a of this.auras) { const v = a.def.mods?.[key]; if (typeof v === 'number') m *= v; }
    return m;
  }
  flag(key) { return this.auras.some(a => a.def.mods?.[key] === true); }
  addAura(id, src, opts = {}) {
    const def = AURAS[id]; if (!def) { console.warn('no aura', id); return null; }
    let a = this.auras.find(x => x.id === id && (def.shared !== false ? true : x.src === src));
    const dur = opts.dur ?? def.dur;
    if (a) { a.rem = dur; a.dur = dur; a.opts = { ...a.opts, ...opts }; if (def.maxStacks > 1) a.stacks = Math.min(def.maxStacks, a.stacks + 1); if (def.absorb) a.absorb = opts.absorb !== undefined ? opts.absorb * SCALE : a.absorb; }
    else {
      a = { id, def, src, rem: dur, dur, stacks: 1, tickT: def.tick || 0, opts, absorb: def.absorb ? (opts.absorb || 0) * SCALE : 0, applied: performance.now() };
      this.auras.push(a);
      bus.emit('aura_apply', { unit: this, aura: a });
    }
    if (opts.ap !== undefined) this.recalc();
    return a;
  }
  removeAura(id) {
    const i = this.auras.findIndex(a => a.id === id);
    if (i >= 0) { const [a] = this.auras.splice(i, 1); bus.emit('aura_remove', { unit: this, aura: a }); if (a.opts?.ap !== undefined) this.recalc(); }
  }
  removeAurasWith(modKey) { for (const a of [...this.auras]) if (a.def.mods?.[modKey]) this.removeAura(a.id); }

  gain(n) {
    if (!this.powerType) return;
    this.power = Math.max(0, Math.min(this.powerMax, this.power + n));
  }

  cdLeft(id) { return this.cooldowns.get(id) || 0; }

  enterCombat() { this.inCombat = true; this.combatT = 6; }
}
