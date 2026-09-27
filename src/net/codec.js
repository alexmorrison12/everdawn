// Wire encoding for game events. Units travel as {$u: hostUnitId}, vectors and 3D sockets as {$v: [x, y, z]}, and
// spell/aura objects by id. Functions and host-only objects (the raid, parties, popups) never leave the host.
import * as THREE from 'three';
import { SPELLS, AURAS } from '../game/data/spells.js';

const r2 = v => Math.round(v * 100) / 100;
const _w = new THREE.Vector3();

export function enc(v, depth = 0) {
  if (v === null || v === undefined) return v;
  const t = typeof v;
  if (t === 'number') return Number.isFinite(v) ? r2(v) : 0;
  if (t === 'string' || t === 'boolean') return v;
  if (t === 'function') return undefined;
  if (v.isVector3) return { $v: [r2(v.x), r2(v.y), r2(v.z)] };
  if (v.isObject3D) { v.getWorldPosition(_w); return { $v: [r2(_w.x), r2(_w.y), r2(_w.z)] }; }
  if (v.stateAnim && v.pos) return { $u: v.id }; // a Unit
  if (depth > 3) return undefined;
  if (Array.isArray(v)) return v.map(x => enc(x, depth + 1));
  if (v.def && v.id && v.rem !== undefined) return { $a: v.id, st: v.stacks || 1 }; // an aura instance
  const out = {};
  for (const k in v) { const e = enc(v[k], depth + 1); if (e !== undefined) out[k] = e; }
  return out;
}

/** resolve(hostId) → local unit or undefined. Returns null if a referenced unit is unknown here. */
export function dec(v, resolve) {
  let missing = false;
  const walk = x => {
    if (x === null || typeof x !== 'object') return x;
    if (Array.isArray(x)) return x.map(walk);
    if ('$u' in x) { const u = resolve(x.$u); if (!u) missing = true; return u; }
    if ('$v' in x) return new THREE.Vector3(x.$v[0], x.$v[1], x.$v[2]);
    if ('$a' in x) return { id: x.$a, def: AURAS[x.$a] || { name: x.$a }, stacks: x.st, rem: 0, dur: 0 };
    const o = {}; for (const k in x) o[k] = walk(x[k]); return o;
  };
  const out = walk(v);
  return missing ? null : out;
}

/** Spell objects travel as their id; mob abilities and custom casts that aren't in SPELLS travel inline. */
export function spellOut(sp, id) { return id && SPELLS[id] ? undefined : sp ? { name: sp.name, icon: sp.icon, anim: sp.anim } : undefined; }
export function spellIn(id, inline) { return SPELLS[id] || inline || { name: id || 'Spell', icon: 'fireball' }; }

/** The subset of a unit a guest needs to build and label it. */
export function unitSpawn(u) {
  return {
    id: u.id, k: u.kind === 'player' ? 'remote' : u.kind, n: u.name, lv: u.level, cls: u.cls, race: u.race, sex: u.sex, g: u.guild || undefined,
    ti: u.title || undefined, tpl: u.template || undefined, el: u.elite || undefined, ra: u.rare || undefined, bo: u.boss || undefined,
    h: u.hostile, spec: u.model?.spec, rad: r2(u.radius), ht: r2(u.height), pt: u.powerType, npc: u.npcId || undefined,
    x: r2(u.pos.x), y: r2(u.pos.y), z: r2(u.pos.z), f: r2(u.facing), hp: Math.round(u.hp), hm: u.hpMax, ghost: u.remoteGhost || undefined,
  };
}
