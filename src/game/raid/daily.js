// The daily dragon: everyone on Earth fights the same one each UTC day.
import { RNG } from '../../core/noise.js';

export const AFFIXES = {
  tyrannical: { name: 'Tyrannical', desc: 'The dragon has 25% more health and hits 15% harder.', icon: 'enrage' },
  volcanic: { name: 'Volcanic', desc: 'Eruptions periodically burst beneath ranged raiders.', icon: 'flamestrike' },
  frenzied: { name: 'Frenzied', desc: 'Below 30% health the dragon becomes frenzied, attacking 30% faster.', icon: 'mortalBlow' },
  swarming: { name: 'Swarming', desc: 'Whelp waves are 50% larger.', icon: 'whelp' },
};

const NAMES = {
  ember: ['Pyrrhax', 'Cindrathos', 'Vulkaranth', 'Scorchmaw', 'Ashvyrn', 'Emberveil', 'Kaltharion', 'Ignivar'],
  frost: ['Vaelstrom', 'Glaciryx', 'Rimewrath', 'Frosthyrn', 'Hiemalys', 'Crystalor', 'Sylvaryx', 'Brumhild'],
  venom: ['Toxikara', 'Venomyrr', 'Blightfang', 'Sepsiraxis', 'Mirelash', 'Viridrax', 'Nox\'thurak', 'Galvyra'],
  storm: ['Thundrakos', 'Voltaryn', 'Skyrend', 'Tempestrix', 'Galeclaw', 'Zephyrax', 'Stormveil', 'Arcthyra'],
  shadow: ['Umbraxis', 'Nyxathar', 'Vorthalyx', 'Gloomwing', 'Obsidrax', 'Nocturnyx', 'Duskmaw', 'Vesperion'],
};
const TITLES = {
  ember: ['the Cinderwing', 'Scourge of Ember Peak', 'the Undying Flame', 'Tyrant of the Maw'],
  frost: ['the Frostborne', 'Queen of Rime', 'the Endless Winter', 'Breaker of Summers'],
  venom: ['the Blightmother', 'Scourge of the Fen', 'the Rotting Crown', 'Mother of Whelps'],
  storm: ['the Skybreaker', 'Voice of Thunder', 'the Tempest Wyrm', 'Lord of the Gale'],
  shadow: ['the Nightmare', 'Devourer of Stars', 'the Hollow King', 'Last of the Void Brood'],
};
export const HAZARD_NAMES = {
  ember: { hazard: 'Lava Bomb', breath: 'Searing Breath', deep: 'Deep Breath', pool: 'firePool', breathFx: 'fireBreath', school: 'fire', proj: 'lavaBomb' },
  frost: { hazard: 'Ice Shard', breath: 'Frost Breath', deep: 'Glacial Breath', pool: 'frostPool', breathFx: 'frostBreath', school: 'frost', proj: 'frostbolt' },
  venom: { hazard: 'Toxic Spit', breath: 'Venom Breath', deep: 'Plague Breath', pool: 'poisonPool', breathFx: 'venomBreath', school: 'nature', proj: 'lavaBomb' },
  storm: { hazard: 'Static Charge', breath: 'Lightning Breath', deep: 'Tempest Breath', pool: 'stormPool', breathFx: 'stormBreath', school: 'nature', proj: 'arcaneMissile' },
  shadow: { hazard: 'Void Zone', breath: 'Shadow Breath', deep: 'Oblivion Breath', pool: 'voidPool', breathFx: 'shadowBreath', school: 'shadow', proj: 'shadowBolt' },
};

export function todayKey(d = new Date()) { return d.toISOString().slice(0, 10); }

export function dailyDragon(day = todayKey()) {
  const rng = new RNG('everdawn-dragon:' + day);
  const element = rng.pick(['ember', 'frost', 'venom', 'storm', 'shadow']);
  const name = rng.pick(NAMES[element]);
  return { day, element, name, title: rng.pick(TITLES[element]), affix: rng.pick(Object.keys(AFFIXES)), seed: Math.floor(rng.next() * 1e9) };
}
