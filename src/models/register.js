// Wires the finished model generators into the factory (placeholders are used for anything not registered).
import { registerModels } from './factory.js';
import { createDragon } from './dragon.js';
import { createCreature, preloadCreatures } from './creatures.js';
import { createHumanoid, randomAppearance, prewarmHumanoids, appearanceCounts, RACES } from './humanoid.js';
import { RNG } from '../core/noise.js';

export const ground = { fn: null };
registerModels('dragon', opts => createDragon(opts));
registerModels('creature', (type, opts = {}) => {
  const c = createCreature(type, opts);
  if (ground.fn && c.setGround) c.setGround(ground.fn);
  return c;
});

const OUTFIT = { marshal: 'npc:marshal', archmage: 'npc:archmage', innkeeper: 'npc:innkeeper', villager: 'npc:villager', farmer: 'npc:farmer', guard: 'npc:guard', bandit: 'npc:bandit', banditBoss: 'npc:bandit', hunter: 'hunter:2' };
/** opts: { race, sex, cls, gearTier, outfit, seed, ...appearance } → humanoid */
export function humanoidOpts(o = {}) {
  const seed = Math.floor(o.seed ?? Math.random() * 1e6);
  // roll the look for the requested race/sex so skin, hair and eyes come from that race's palettes
  const look = randomAppearance(new RNG(seed), o.race || null, o.sex || null);
  const race = look.race, sex = look.sex, R = RACES[race], n = appearanceCounts(race, sex);
  const out = { ...look, race, sex, seed };
  // appearance indices from the creation screen are 0-based slots into the race palettes; colours (hex) pass through
  const idx = (v, count) => (typeof v === 'number' && v >= 0 && v < 32 ? Math.floor(v) % count : null);
  if (idx(o.skin, n.skin) !== null) out.skin = R.skins[idx(o.skin, n.skin)]; else if (typeof o.skin === 'number') out.skin = o.skin;
  if (idx(o.hairColor, n.hairColor) !== null) out.hairColor = R.hair[idx(o.hairColor, n.hairColor)]; else if (typeof o.hairColor === 'number') out.hairColor = o.hairColor;
  if (idx(o.hair, n.hair) !== null) out.hair = idx(o.hair, n.hair);
  if (idx(o.face, n.face) !== null) out.face = idx(o.face, n.face);
  if (idx(o.beard, n.beard) !== null) out.beard = idx(o.beard, n.beard);
  if (sex === 'f') out.beard = 0;
  out.cls = o.outfit ? 'npc' : (o.cls || 'warrior');
  out.gear = o.outfit ? (OUTFIT[o.outfit] || 'npc:villager') : `${out.cls === 'npc' ? 'warrior' : out.cls}:${o.gearTier ?? 1}`;
  if (o.outfit === 'banditBoss') out.scale = 1.08;
  return out;
}
registerModels('humanoid', o => createHumanoid(humanoidOpts(o)));

export { preloadCreatures, prewarmHumanoids, appearanceCounts };
