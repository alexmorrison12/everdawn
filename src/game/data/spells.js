// Spell + aura definitions. Numbers scale with caster level (L), spell power (sp) and attack power (ap).
// effect(ctx): ctx = { caster, target, L, sp, ap, rng, damage(t, amt, school, o), heal(t, amt, o), aura(t, id, o),
//   weapon(mult) → rolled weapon damage, enemiesNear(center, r), alliesNear(center, r), point (ground target) }
export const GCD = 1.5;

const R = (ctx, a, b) => a + (b - a) * ctx.rng();

export const SPELLS = {
  // ------------------------------------------------ WARRIOR ------------------------------------------------
  valiantStrike: {
    name: 'Valiant Strike', icon: 'valiantStrike', cls: 'warrior', learn: 1, school: 'physical', melee: true,
    cost: 12, powerType: 'rage', range: 5, target: 'enemy', anim: 'attack1h', sound: 'swingHeavy',
    effect: c => c.damage(c.target, c.weapon(1.0) + 6 + c.L * 2.4, 'physical', { ability: true }),
    desc: c => `A powerful strike that deals weapon damage plus ${Math.round(6 + c.L * 2.4)}.`,
  },
  charge: {
    name: 'Charge', icon: 'charge', cls: 'warrior', learn: 1, school: 'physical', gcd: 0.5,
    cost: 0, powerType: 'rage', range: 25, minRange: 8, cd: 15, target: 'enemy', offGcd: false, charge: true, sound: 'charge',
    effect: c => { c.aura(c.target, 'stun', { dur: 1.2 }); c.caster.gain(18); },
    desc: () => 'Charge an enemy, generating 18 rage and stunning it for 1.2 sec.',
  },
  rend: {
    name: 'Rend', icon: 'rend', cls: 'warrior', learn: 2, school: 'physical', melee: true,
    cost: 10, powerType: 'rage', range: 5, target: 'enemy', anim: 'attack1h', sound: 'swing',
    effect: c => c.aura(c.target, 'rend', { tickDmg: 4 + c.L * 1.6 + c.ap * 0.03 }),
    desc: c => `Wounds the target, causing ${Math.round((4 + c.L * 1.6) * 5)} damage over 15 sec.`,
  },
  battleShout: {
    name: 'Battle Shout', icon: 'battleShout', cls: 'warrior', learn: 3, school: 'physical',
    cost: 10, powerType: 'rage', range: 0, target: 'none', anim: 'roar', sound: 'uiOpen',
    effect: c => { for (const a of c.alliesNear(c.caster.pos, 30)) c.aura(a, 'battleShout', { ap: 10 + c.L * 3 }); },
    desc: c => `Increases attack power of nearby party members by ${10 + c.L * 3} for 2 min.`,
  },
  thunderclap: {
    name: 'Thunderclap', icon: 'thunderclap', cls: 'warrior', learn: 4, school: 'physical',
    cost: 18, powerType: 'rage', cd: 6, range: 0, target: 'none', anim: 'attack2h', fx: { self: 'thunderClap' }, sound: 'thunderClap', aoe: 8,
    effect: c => { for (const e of c.enemiesNear(c.caster.pos, 8)) { c.damage(e, R(c, 6, 9) + c.L * 2.6 + c.ap * 0.1, 'physical', { ability: true, aoe: true }); c.aura(e, 'thunderclapSlow'); } },
    desc: c => `Blasts nearby enemies for ${Math.round(7 + c.L * 2.6)} damage and slows their attacks.`,
  },
  victoryRush: {
    name: 'Victory Rush', icon: 'victoryRush', cls: 'warrior', learn: 5, school: 'physical', melee: true,
    cost: 0, powerType: 'rage', range: 5, target: 'enemy', requiresAura: 'victorious', anim: 'attack1h', sound: 'swingHeavy',
    effect: c => { c.damage(c.target, c.weapon(0.8) + c.L * 3, 'physical', { ability: true }); c.heal(c.caster, c.caster.hpMax * 0.022); c.caster.removeAura('victorious'); },
    desc: () => 'Instantly attack after a killing blow, healing you for 22% of your maximum health.',
  },
  cleave: {
    name: 'Cleave', icon: 'cleave', cls: 'warrior', learn: 6, school: 'physical', melee: true,
    cost: 18, powerType: 'rage', range: 5, target: 'enemy', anim: 'attack2h', sound: 'swingHeavy', cd: 3,
    effect: c => { let n = 0; for (const e of [c.target, ...c.enemiesNear(c.target.pos, 6).filter(e => e !== c.target)]) { if (n++ >= 3) break; c.damage(e, c.weapon(0.85) + 4 + c.L * 1.8, 'physical', { ability: true, aoe: n > 1 }); } },
    desc: () => 'A sweeping attack that strikes your target and 2 nearby enemies.',
  },
  mortalBlow: {
    name: 'Mortal Blow', icon: 'mortalBlow', cls: 'warrior', learn: 8, school: 'physical', melee: true,
    cost: 25, powerType: 'rage', cd: 6, range: 5, target: 'enemy', anim: 'attack2h', sound: 'swingHeavy',
    effect: c => { c.damage(c.target, c.weapon(1.5) + 10 + c.L * 3.4, 'physical', { ability: true }); c.aura(c.target, 'mortalWound'); },
    desc: c => `A vicious strike dealing 150% weapon damage plus ${Math.round(10 + c.L * 3.4)} and reducing healing received by 50%.`,
  },
  whirlwind: {
    name: 'Whirlwind', icon: 'whirlwind', cls: 'warrior', learn: 9, school: 'physical',
    cost: 25, powerType: 'rage', cd: 9, range: 0, target: 'none', anim: 'attack2h', fx: { attach: 'whirlwind', attachDur: 0.9 }, sound: 'whirlwind', aoe: 8,
    effect: c => { for (const e of c.enemiesNear(c.caster.pos, 8).slice(0, 5)) c.damage(e, c.weapon(1.1) + c.L * 1.5, 'physical', { ability: true, aoe: true }); },
    desc: () => 'Spin in a whirl of steel, striking up to 5 nearby enemies.',
  },
  execute: {
    name: 'Execute', icon: 'execute', cls: 'warrior', learn: 10, school: 'physical', melee: true,
    cost: 15, powerType: 'rage', range: 5, target: 'enemy', requiresTargetBelow: 0.2, anim: 'attack2h', sound: 'execute', drainsPower: true,
    effect: c => { const extra = c.caster.power; c.caster.power = 0; c.damage(c.target, c.weapon(1.0) + 20 + c.L * 4 + extra * (2.2 + c.L * 0.25), 'physical', { ability: true }); },
    desc: () => 'Attempt to finish off a wounded foe (below 20% health). Consumes all remaining rage for extra damage.',
  },

  // ------------------------------------------------ MAGE ------------------------------------------------
  fireball: {
    name: 'Fireball', icon: 'fireball', cls: 'mage', learn: 1, school: 'fire',
    cost: c => 16 + c.L * 2.2, powerType: 'mana', cast: 2.0, range: 36, target: 'enemy', anim: 'castDirected',
    fx: { cast: 'castFire', projectile: 'fireball', impact: 'fireImpact' }, speed: 30, sound: 'castStartFire', launchSound: 'fireballLaunch', impactSound: 'fireImpact',
    effect: c => { c.damage(c.target, R(c, 14, 18) + c.L * 5.4 + c.sp * 1.0, 'fire', { canHeat: true }); c.aura(c.target, 'ignite', { tickDmg: 1 + c.L * 0.7 }); },
    desc: c => `Hurls a fiery ball that causes ${Math.round(13 + c.L * 5.6)} Fire damage and burns the target.`,
  },
  frostbolt: {
    name: 'Frostbolt', icon: 'frostbolt', cls: 'mage', learn: 2, school: 'frost',
    cost: c => 14 + c.L * 2, powerType: 'mana', cast: 1.8, range: 36, target: 'enemy', anim: 'castDirected',
    fx: { cast: 'castFrost', projectile: 'frostbolt', impact: 'frostImpact' }, speed: 28, sound: 'castStartFrost', impactSound: 'frostImpact',
    effect: c => { c.damage(c.target, R(c, 9, 12) + c.L * 4.6 + c.sp * 0.85, 'frost'); c.aura(c.target, 'chilled'); },
    desc: c => `Launches a bolt of frost dealing ${Math.round(10 + c.L * 4.6)} Frost damage and slowing movement by 40%.`,
  },
  fireBlast: {
    name: 'Fire Blast', icon: 'fireBlast', cls: 'mage', learn: 3, school: 'fire',
    cost: c => 14 + c.L * 2, powerType: 'mana', cd: 8, range: 24, target: 'enemy', anim: 'castDirected', offGcd: true,
    fx: { impact: 'fireBlast' }, sound: 'fireImpact',
    effect: c => c.damage(c.target, R(c, 9, 12) + c.L * 4.2 + c.sp * 0.6, 'fire', { forceCrit: c.caster.hasAura('heatingUp'), canHeat: true }),
    desc: c => `Blasts the enemy for ${Math.round(10 + c.L * 4.2)} Fire damage. Always critical while Heating Up. Not on the global cooldown.`,
  },
  frostNova: {
    name: 'Frost Nova', icon: 'frostNova', cls: 'mage', learn: 4, school: 'frost',
    cost: c => 18 + c.L * 2, powerType: 'mana', cd: 20, range: 0, target: 'none', anim: 'castOmni', fx: { self: 'frostNova' }, sound: 'frostImpact', aoe: 10,
    effect: c => { for (const e of c.enemiesNear(c.caster.pos, 10)) { c.damage(e, R(c, 4, 6) + c.L * 1.2, 'frost', { aoe: true }); c.aura(e, 'frozen'); } },
    desc: () => 'Blasts enemies near the caster, freezing them in place for up to 6 sec.',
  },
  blink: {
    name: 'Blink', icon: 'blink', cls: 'mage', learn: 5, school: 'arcane', gcd: 0.5,
    cost: c => 12 + c.L, powerType: 'mana', cd: 15, range: 0, target: 'none', blink: 16, sound: 'blink',
    effect: c => { c.caster.removeAurasWith('root'); c.caster.removeAurasWith('stun'); },
    desc: () => 'Teleports you 16 yards forward, breaking roots and stuns.',
  },
  // Hot Streak passive is learned at 6 (handled in combat via canHeat)
  flamestrike: {
    name: 'Flamestrike', icon: 'flamestrike', cls: 'mage', learn: 7, school: 'fire',
    cost: c => 30 + c.L * 3, powerType: 'mana', cast: 2.0, range: 34, target: 'ground', radius: 8, anim: 'castOmni',
    fx: { cast: 'castFire', ground: 'flamestrike' }, sound: 'castStartFire', impactSound: 'fireImpact', aoe: 8,
    effect: c => { for (const e of c.enemiesNear(c.point, 8)) { c.damage(e, R(c, 12, 16) + c.L * 3.6 + c.sp * 0.5, 'fire', { aoe: true }); c.aura(e, 'ignite', { tickDmg: 2 + c.L * 0.8 }); } },
    desc: c => `Calls down a pillar of fire, burning all enemies in the area for ${Math.round(14 + c.L * 3.6)} Fire damage.`,
  },
  pyroblast: {
    name: 'Pyroblast', icon: 'pyroblast', cls: 'mage', learn: 8, school: 'fire',
    cost: c => 30 + c.L * 3.5, powerType: 'mana', cast: 3.5, range: 36, target: 'enemy', anim: 'castDirected', instantWith: 'hotStreak',
    fx: { cast: 'castFire', projectile: 'pyroblast', impact: 'fireImpact' }, speed: 24, sound: 'castStartFire', launchSound: 'fireballLaunch', impactSound: 'fireImpact',
    effect: c => { c.damage(c.target, R(c, 26, 34) + c.L * 9.5 + c.sp * 1.6, 'fire', { canHeat: true }); c.aura(c.target, 'ignite', { tickDmg: 3 + c.L * 1.4 }); },
    desc: c => `Hurls an immense fiery boulder for ${Math.round(30 + c.L * 9.5)} Fire damage. Instant with Hot Streak.`,
  },
  iceBarrier: {
    name: 'Ice Barrier', icon: 'iceBarrier', cls: 'mage', learn: 9, school: 'frost',
    cost: c => 26 + c.L * 2.5, powerType: 'mana', cd: 25, range: 0, target: 'self', anim: 'castOmni', sound: 'shield',
    effect: c => c.aura(c.caster, 'iceBarrier', { absorb: 40 + c.L * 9 + c.sp }),
    desc: c => `Shields you with ice, absorbing ${Math.round(40 + c.L * 9)} damage.`,
  },
  arcaneMissiles: {
    name: 'Arcane Missiles', icon: 'arcaneMissiles', cls: 'mage', learn: 10, school: 'arcane',
    cost: c => 30 + c.L * 3, powerType: 'mana', channel: 2.5, ticks: 5, range: 34, target: 'enemy', anim: 'castDirected',
    fx: { cast: 'castArcane', projectile: 'arcaneMissile', impact: 'arcaneImpact' }, speed: 34, sound: 'arcaneMissile',
    effect: c => c.damage(c.target, R(c, 5, 7) + c.L * 2.1 + c.sp * 0.3, 'arcane'),
    desc: c => `Channel 5 arcane missiles, each dealing ${Math.round(6 + c.L * 2.1)} Arcane damage.`,
  },

  // ------------------------------------------------ PRIEST ------------------------------------------------
  smite: {
    name: 'Smite', icon: 'smite', cls: 'priest', learn: 1, school: 'holy',
    cost: c => 14 + c.L * 2, powerType: 'mana', cast: 1.8, range: 32, target: 'enemy', anim: 'castDirected',
    fx: { cast: 'castHoly', impact: 'holyImpact' }, sound: 'castStartHoly', impactSound: 'holySmite',
    effect: c => c.damage(c.target, R(c, 10, 13) + c.L * 4.8 + c.sp * 0.9, 'holy'),
    desc: c => `Smite an enemy for ${Math.round(11 + c.L * 4.8)} Holy damage.`,
  },
  flashHeal: {
    name: 'Flash Heal', icon: 'flashHeal', cls: 'priest', learn: 1, school: 'holy', heal: true,
    cost: c => 18 + c.L * 2.6, powerType: 'mana', cast: 1.5, range: 36, target: 'ally', anim: 'castOmni',
    fx: { cast: 'castHoly', impact: 'heal' }, sound: 'castStartHoly', impactSound: 'heal',
    effect: c => c.heal(c.target, R(c, 18, 24) + c.L * 7.5 + c.sp * 1.1),
    desc: c => `Heals a friendly target for ${Math.round(21 + c.L * 7.5)}.`,
  },
  wordOfPain: {
    name: 'Word of Anguish', icon: 'wordOfPain', cls: 'priest', learn: 2, school: 'shadow',
    cost: c => 12 + c.L * 1.6, powerType: 'mana', range: 34, target: 'enemy', anim: 'castDirected', fx: { impact: 'shadowImpact' }, sound: 'castStartShadow',
    effect: c => c.aura(c.target, 'anguish', { tickDmg: 3 + c.L * 1.9 + c.sp * 0.2 }),
    desc: c => `A word of darkness that causes ${Math.round((3 + c.L * 1.9) * 6)} Shadow damage over 18 sec.`,
  },
  aegis: {
    name: 'Aegis', icon: 'aegis', cls: 'priest', learn: 4, school: 'holy',
    cost: c => 22 + c.L * 2.5, powerType: 'mana', range: 36, target: 'ally', anim: 'castOmni', sound: 'shield',
    blockedBy: 'weakenedSoul',
    effect: c => { c.aura(c.target, 'aegis', { absorb: 30 + c.L * 11 + c.sp * 1.2 }); c.aura(c.target, 'weakenedSoul'); },
    desc: c => `Shields an ally, absorbing ${Math.round(30 + c.L * 11)} damage. Cannot be reapplied for 12 sec.`,
  },
  renew: {
    name: 'Renew', icon: 'renew', cls: 'priest', learn: 5, school: 'holy', heal: true,
    cost: c => 16 + c.L * 2, powerType: 'mana', range: 36, target: 'ally', anim: 'castOmni', sound: 'heal',
    effect: c => c.aura(c.target, 'renew', { tickHeal: 4 + c.L * 2.6 + c.sp * 0.25 }),
    desc: c => `Heals the target for ${Math.round((4 + c.L * 2.6) * 5)} over 15 sec.`,
  },
  mindSpike: {
    name: 'Mind Spike', icon: 'mindSpike', cls: 'priest', learn: 6, school: 'shadow',
    cost: c => 20 + c.L * 2.4, powerType: 'mana', cast: 1.5, cd: 8, range: 34, target: 'enemy', anim: 'castDirected',
    fx: { cast: 'castShadow', projectile: 'shadowBolt', impact: 'shadowImpact' }, speed: 32, sound: 'castStartShadow',
    effect: c => c.damage(c.target, R(c, 18, 24) + c.L * 6.4 + c.sp * 1.1, 'shadow'),
    desc: c => `Blasts the target's mind for ${Math.round(21 + c.L * 6.4)} Shadow damage.`,
  },
  holyNova: {
    name: 'Holy Nova', icon: 'holyNova', cls: 'priest', learn: 8, school: 'holy', heal: true,
    cost: c => 30 + c.L * 3, powerType: 'mana', range: 0, target: 'none', anim: 'castOmni', fx: { self: 'holyNova' }, sound: 'nova', aoe: 12,
    effect: c => {
      for (const e of c.enemiesNear(c.caster.pos, 12)) c.damage(e, R(c, 6, 9) + c.L * 2.2, 'holy', { aoe: true });
      for (const a of c.alliesNear(c.caster.pos, 12)) c.heal(a, R(c, 9, 13) + c.L * 3.4 + c.sp * 0.3);
    },
    desc: () => 'Holy light erupts around you, damaging nearby enemies and healing nearby allies.',
  },
  greaterHeal: {
    name: 'Greater Heal', icon: 'greaterHeal', cls: 'priest', learn: 10, school: 'holy', heal: true,
    cost: c => 45 + c.L * 5, powerType: 'mana', cast: 2.5, range: 36, target: 'ally', anim: 'castOmni',
    fx: { cast: 'castHoly', impact: 'bigHeal' }, sound: 'castStartHoly', impactSound: 'heal',
    effect: c => c.heal(c.target, R(c, 55, 70) + c.L * 18 + c.sp * 2),
    desc: c => `A slow but powerful heal for ${Math.round(62 + c.L * 18)}.`,
  },

  simShot: { name: 'Auto Shot', school: 'physical', range: 32, cd: 2.2, target: 'enemy', anim: 'shoot', fx: { projectile: 'arrow' }, speed: 48, sound: 'bowShot',
    effect: c => c.damage(c.target, c.weapon(0.9) + 3 + c.L * 2.2, 'physical', { ability: true }) },
  // ------------------------------------------------ MOBS ------------------------------------------------
  mobBite: { name: 'Bite', school: 'physical', melee: true, range: 4, cd: 8, target: 'enemy', anim: 'attack', effect: c => c.damage(c.target, c.weapon(1.1) + 1, 'physical', { ability: true }) },
  mobRend: { name: 'Rending Bite', school: 'physical', melee: true, range: 4, cd: 12, target: 'enemy', anim: 'attack', effect: c => c.aura(c.target, 'rend', { tickDmg: 3 + c.L * 1.2 }) },
  mobHowl: { name: 'Terrifying Howl', school: 'physical', range: 0, cd: 20, target: 'none', anim: 'howl', effect: c => { for (const e of c.enemiesNear(c.caster.pos, 10)) c.aura(e, 'fear', { dur: 2.5 }); } },
  mobGore: { name: 'Gore', school: 'physical', melee: true, range: 4, cd: 9, target: 'enemy', anim: 'attack', effect: c => c.damage(c.target, c.weapon(1.5) + 3, 'physical', { ability: true }) },
  mobPoison: { name: 'Venom Bite', school: 'nature', melee: true, range: 4, cd: 10, target: 'enemy', anim: 'attack', effect: c => c.aura(c.target, 'poison', { tickDmg: 2 + c.L * 1.1 }) },
  mobWeb: { name: 'Web Spray', school: 'nature', range: 22, minRange: 5, cd: 16, target: 'enemy', anim: 'attack', effect: c => c.aura(c.target, 'webbed') },
  mobNet: { name: 'Net', school: 'physical', range: 18, minRange: 4, cd: 18, target: 'enemy', anim: 'attack', effect: c => c.aura(c.target, 'netted') },
  mobBackstab: { name: 'Backstab', school: 'physical', melee: true, range: 4, cd: 8, target: 'enemy', anim: 'attack1h', effect: c => c.damage(c.target, c.weapon(1.6) + 3, 'physical', { ability: true }) },
  mobThrow: { name: 'Throw Dagger', school: 'physical', range: 25, minRange: 6, cd: 6, target: 'enemy', anim: 'attack1h', fx: { projectile: 'arrow' }, speed: 40, effect: c => c.damage(c.target, c.weapon(0.8), 'physical', { ability: true }) },
  mobCandle: { name: 'Candle Flare', school: 'fire', range: 0, cd: 12, target: 'none', anim: 'attack', fx: { self: 'fireImpact' }, effect: c => { for (const e of c.enemiesNear(c.caster.pos, 7)) c.damage(e, 6 + c.L * 2.4, 'fire', { aoe: true }); } },
  mobFlurry: { name: 'Blade Flurry', school: 'physical', range: 0, cd: 14, target: 'none', anim: 'attack2h', fx: { attach: 'whirlwind', attachDur: 1 }, effect: c => { for (const e of c.enemiesNear(c.caster.pos, 6)) c.damage(e, c.weapon(1.2) + 4, 'physical', { aoe: true, ability: true }); } },
};

// ---------------------------------------------- AURAS ----------------------------------------------
// tick: seconds between ticks; tickDmg/tickHeal supplied via opts at application (snapshotted)
export const AURAS = {
  stun: { name: 'Stunned', icon: 'charge', debuff: true, dur: 1.2, mods: { stun: true } },
  fear: { name: 'Feared', icon: 'fear', debuff: true, dur: 2.5, mods: { fear: true } },
  rend: { name: 'Rend', icon: 'rend', debuff: true, dur: 15, tick: 3, school: 'physical', bleed: true },
  ignite: { name: 'Ignite', icon: 'fireball', debuff: true, dur: 4, tick: 2, school: 'fire', maxStacks: 1 },
  anguish: { name: 'Word of Anguish', icon: 'wordOfPain', debuff: true, dur: 18, tick: 3, school: 'shadow' },
  poison: { name: 'Venom', icon: 'poison', debuff: true, dur: 12, tick: 3, school: 'nature', dispel: 'poison' },
  chilled: { name: 'Chilled', icon: 'frostbolt', debuff: true, dur: 6, mods: { speed: 0.6 } },
  frozen: { name: 'Frost Nova', icon: 'frostNova', debuff: true, dur: 6, mods: { root: true }, breakOnDamage: 1.0 },
  webbed: { name: 'Webbed', icon: 'web', debuff: true, dur: 3, mods: { root: true } },
  netted: { name: 'Netted', icon: 'fishingNet', debuff: true, dur: 2.5, mods: { root: true } },
  thunderclapSlow: { name: 'Thunderclap', icon: 'thunderclap', debuff: true, dur: 10, mods: { attackSpeed: 0.7 } },
  mortalWound: { name: 'Mortal Wound', icon: 'mortalBlow', debuff: true, dur: 10, mods: { healingTaken: 0.5 } },
  weakenedSoul: { name: 'Weakened Soul', icon: 'aegis', debuff: true, dur: 12, hidden: false },
  battleShout: { name: 'Battle Shout', icon: 'battleShout', dur: 120, statFromOpts: 'ap' },
  aegis: { name: 'Aegis', icon: 'aegis', dur: 20, absorb: true, fx: 'shield' },
  iceBarrier: { name: 'Ice Barrier', icon: 'iceBarrier', dur: 45, absorb: true, fx: 'shield' },
  renew: { name: 'Renew', icon: 'renew', dur: 15, tick: 3, fx: 'renew' },
  victorious: { name: 'Victorious', icon: 'victoryRush', dur: 20 },
  heatingUp: { name: 'Heating Up', icon: 'fireBlast', dur: 8 },
  hotStreak: { name: 'Hot Streak!', icon: 'pyroblast', dur: 10, proc: 'pyroblast' },
  drinking: { name: 'Drink', icon: 'drink', dur: 18, mods: { sit: true }, regenPct: 0.07 },
  eating: { name: 'Food', icon: 'food', dur: 18, mods: { sit: true }, healPct: 0.07 },
  rested: { name: 'Well Rested', icon: 'food', dur: 3600 },
  ghost: { name: 'Ghost', icon: 'ghost', dur: 1e9, mods: { speed: 1.25 } },
  enrage: { name: 'Enrage', icon: 'enrage', dur: 1e9, mods: { damage: 1.5, attackSpeed: 1.4 } },
  staticCharge: { name: 'Static Charge', icon: 'stormPool', debuff: true, dur: 5 },
  shieldWall: { name: 'Shield Wall', icon: 'aegis', dur: 6, mods: { damageTaken: 0.45 } },
  whelpBolster: { name: 'Bolstered', icon: 'enrage', dur: 20, mods: { damage: 1.2 } },
  // dragon (raid) auras are defined in the raid module and merged in at runtime
};
