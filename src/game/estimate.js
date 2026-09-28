// Estimated DPS / HPS for the character sheet and item tooltips: a quick, silent 90-second fight against a training
// dummy on the real combat engine (the same spells, stats, gear and legendary effects), seeded so the same gear always
// gives the same number and a swapped item shows exactly what it changes.
import { Unit } from './unit.js';
import { Sim } from './sim.js';
import { Combat } from './combat.js';
import { SPELLS } from './data/spells.js';
import { mobStats } from './data/mobs.js';
import { bus } from './events.js';

const T = 90, DT = 0.1;
const MELEE = new Set(['warrior', 'rogue', 'paladin']);
const cache = new Map();

/** { dps, hps? } for player `p` wearing its gear, with `swap` ({ slot: item }) changes. */
export function estimate(game, p, swap = null) {
  const equip = { ...p.equip, ...(swap || {}) };
  const key = `${p.cls}|${p.level}|${Object.entries(equip).map(([s, it]) => `${s}:${it?.uid ?? ''}`).join(',')}`;
  if (cache.has(key)) return cache.get(key);
  const out = { dps: run(game, p, equip, 'dps') };
  if (p.cls === 'priest') out.hps = run(game, p, equip, 'hps');
  if (cache.size > 200) cache.clear();
  cache.set(key, out);
  return out;
}

function run(game, p, equip, mode) {
  const emit = bus.emit; bus.emit = () => {}; // silent: no sounds, effects or combat text from the dummy fight
  try {
    const sim = new Sim({ colliders: [], heightAt: () => 0, noWater: true }), cb = new Combat(sim);
    const me = new Unit({ name: 'Estimate', kind: 'player', hostile: false, level: p.level, cls: p.cls, race: p.race });
    me.equip = equip; game.levelStats(me); me.hp = me.hpMax; me.power = me.powerType === 'rage' ? 0 : me.powerMax;
    const ms = mobStats(p.level);
    const dummy = new Unit({ name: 'Training Dummy', kind: 'mob', hostile: true, level: p.level, hp: 1e6, armor: ms.armor, radius: 0.8 });
    const ally = new Unit({ name: 'Wounded Ally', kind: 'sim', hostile: false, level: p.level, hp: 1e6 });
    const range = MELEE.has(p.cls) ? 2 : 20;
    me.pos.set(0, 0, range); dummy.pos.set(0, 0, 0); ally.pos.set(3, 0, range);
    me.facing = 0; // looking toward -Z, at the dummy
    sim.add(me); sim.add(dummy); sim.add(ally);
    me.target = mode === 'hps' ? ally : dummy;
    if (mode === 'dps' && MELEE.has(p.cls)) { me.autoAttack = true; cb.engage(me, dummy); }
    const known = id => SPELLS[id] && (SPELLS[id].learn || 1) <= p.level;
    const tryCast = (id, t) => known(id) && cb.canCast(me, id, t).ok && cb.cast(me, id, t);
    for (let t = 0; t < T; t += DT) {
      if (!me.casting && me.gcd <= 0.001) (mode === 'hps' ? heal : ROTATION[p.cls] || ROTATION.warrior)(me, dummy, ally, tryCast);
      else if (p.cls === 'mage' && me.hasAura('heatingUp')) tryCast('fireBlast', dummy); // off the global cooldown
      cb.update(DT);
      dummy.hp = dummy.hpMax; dummy.dead = false;
      ally.hp = ally.hpMax * 0.4; ally.dead = false; // always hurt: every heal lands in full
    }
    return (mode === 'hps' ? me.meter.heal : me.meter.dmg) / T;
  } finally { bus.emit = emit; }
}

// a sensible single-target priority per class (what a decent player presses)
const ROTATION = {
  warrior: (me, t, a, cast) => { if (!me.hasAura('battleShout') && cast('battleShout', me)) return; if (!t.hasAura('rend') && cast('rend', t)) return; cast('mortalBlow', t) || cast('whirlwind', t) || cast('valiantStrike', t); },
  mage: (me, t, a, cast) => { (me.hasAura('hotStreak') && cast('pyroblast', t)) || cast('fireBlast', t) || cast('fireball', t) || cast('frostbolt', t); },
  priest: (me, t, a, cast) => { (!t.hasAura('anguish') && cast('wordOfPain', t)) || cast('mindSpike', t) || cast('smite', t); },
};
function heal(me, t, a, cast) { (!a.hasAura('renew') && cast('renew', a)) || cast('greaterHeal', a) || cast('flashHeal', a); }
