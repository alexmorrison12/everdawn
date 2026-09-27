// SFX registry: name → recipe { fn(kit, opts) → duration?, bus, max, burst, gap, gain, range, ref, rev, hall, pri, loop }
//   bus    'sfx' (default) | 'ui' | 'ambience'
//   max    concurrent voices of this name (oldest is stolen)      burst/gap: max starts within `gap` seconds
//   gain   loudness trim (calibrated offline, see LEVELS)          range/ref: 3D audible radius / full-volume radius (m)
//   rev    room-reverb send       hall  hall-reverb send          pri: 0..3 priority for global voice stealing
//   loop   { dur, xf } → loopable (baked seamless buffer for loop())
import { UI } from './ui.js';
import { COMBAT } from './combat.js';
import { MOVE, CREATURES } from './world.js';
import { ENV } from './env.js';
import { LEVELS } from './levels.js';

export const SFX = { ...UI, ...COMBAT, ...MOVE, ...CREATURES, ...ENV };
export const CATEGORIES = {
  ui: Object.keys(UI), combat: Object.keys(COMBAT), movement: Object.keys(MOVE), creatures: Object.keys(CREATURES), environment: Object.keys(ENV),
};
for (const [name, g] of Object.entries(LEVELS)) if (SFX[name]) SFX[name].gain = g;
export const ALIAS = { fire: 'fireCrackle', stream: 'water', lavaLoop: 'lava' };
