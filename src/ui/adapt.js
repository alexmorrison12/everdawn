// Tolerant input normalisation so components accept either the documented UI data shapes or the game's raw
// objects (src/game/unit.js: Unit with inCombat/elite/rare/boss/hostile/kind, auras [{id, def, rem, dur, stacks}],
// casting {spell, t, dur, channel}). Wrappers are cached on the source object → no per-frame allocation.

/** 'normal'|'elite'|'rare'|'rareelite'|'boss' */
export function classification(u) {
  if (u.classification) return u.classification;
  if (u.boss) return 'boss';
  if (u.rare && u.elite) return 'rareelite';
  if (u.rare) return 'rare';
  if (u.elite) return 'elite';
  return 'normal';
}
/** 'hostile'|'neutral'|'friendly'|'player' */
export function reaction(u) {
  if (u.reaction) return u.reaction;
  if (u.hostile) return 'hostile';
  if (u.neutral) return 'neutral';
  if (u.kind === 'player' || u.kind === 'sim' || u.kind === 'remote') return 'player';
  return 'friendly';
}
export function isPlayer(u) { return u.isPlayer ?? (u.kind === 'player' || u.kind === 'sim' || u.kind === 'remote'); }
export function inCombat(u) { return u.combat ?? u.inCombat ?? false; }

/** Aura → { id, icon, name, desc, remaining, duration, stacks, debuff, type, mine } (cached wrapper for game auras). */
export function aura(a, mineSrc) {
  if (a.icon && a.remaining !== undefined || !a.def) return a;
  const w = a._ui || (a._ui = {});
  const d = a.def;
  w.id = a.id; w.icon = d.icon || 'unknown'; w.name = d.name; w.desc = typeof d.desc === 'function' ? '' : (d.desc || '');
  w.remaining = a.rem != null && a.rem < 1e8 ? a.rem : null; w.duration = a.dur != null && a.dur < 1e8 ? a.dur : null;
  w.stacks = a.stacks; w.debuff = !!d.debuff; w.type = d.dispel || (d.bleed ? 'bleed' : null) || (d.debuff && d.school && d.school !== 'physical' ? 'magic' : null);
  w.mine = mineSrc != null && a.src === mineSrc;
  return w;
}
/** Map a list of auras into a reusable output array (skips hidden). */
export function auras(list, out, mineSrc, onlyDebuffs = false) {
  out.length = 0;
  if (!list) return out;
  for (const a of list) { if (a.def && a.def.hidden) continue; const w = aura(a, mineSrc); if (!onlyDebuffs || w.debuff) out.push(w); }
  return out;
}
/** Cast → { name, icon, duration, elapsed, interruptible, channel } or null. Accepts game `casting`. */
export function cast(c) {
  if (!c) return null;
  if (c.name && c.duration !== undefined) return c;
  const w = c._ui || (c._ui = {});
  const s = c.spell || {};
  w.name = s.name || c.name || c.id; w.icon = s.icon || c.icon; w.duration = c.dur ?? c.duration;
  w.elapsed = c.t ?? c.elapsed ?? 0; w.channel = !!(c.channel || s.channel); w.interruptible = !(s.uninterruptible || c.uninterruptible);
  return w;
}
