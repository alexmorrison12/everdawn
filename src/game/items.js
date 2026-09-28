// Items: templates for quest items/junk/consumables and a procedural gear generator with WoW-style names.
import { RNG } from '../core/noise.js';

export const RARITY = ['poor', 'common', 'uncommon', 'rare', 'epic', 'legendary'];
export const RARITY_COLOR = { poor: '#9d9d9d', common: '#ffffff', uncommon: '#1eff00', rare: '#0070dd', epic: '#a335ee', legendary: '#ff8000' };

export const ITEMS = {
  boarHaunch: { name: 'Bristleback Haunch', icon: 'boarHaunch', rarity: 'common', quest: true, stack: 20, flavor: 'Still twitching. Mostly.' },
  wolfPelt: { name: 'Timber Wolf Pelt', icon: 'wolfPelt', rarity: 'common', stack: 20, sell: 8 },
  greymawFang: { name: "Old Greymaw's Fang", icon: 'junkFang', rarity: 'uncommon', quest: true, flavor: 'Longer than your forearm.' },
  fishingNet: { name: 'Stolen Fishing Net', icon: 'fishingNet', rarity: 'common', quest: true, stack: 20 },
  candle: { name: 'Candlerock Candle', icon: 'candle', rarity: 'common', quest: true, stack: 20, flavor: 'You no take... oh. You took it.' },
  spiderSilk: { name: 'Webwood Silk', icon: 'spiderSilk', rarity: 'common', quest: true, stack: 20 },
  redBandana: { name: 'Red Bandana', icon: 'redBandana', rarity: 'common', quest: true, stack: 20 },
  vexSignet: { name: "Vex's Signet", icon: 'ring', rarity: 'uncommon', quest: true },
  letter: { name: 'Sealed Letter', icon: 'letter', rarity: 'common', quest: true, flavor: 'Smells faintly of fish and heartbreak.' },
  junkFang: { name: 'Broken Fang', icon: 'junkFang', rarity: 'poor', stack: 20, sell: 3 },
  junkHide: { name: 'Torn Hide', icon: 'junkHide', rarity: 'poor', stack: 20, sell: 4 },
  junkScale: { name: 'Slimy Scale', icon: 'junkHide', rarity: 'poor', stack: 20, sell: 3 },
  junkWax: { name: 'Lump of Wax', icon: 'candle', rarity: 'poor', stack: 20, sell: 2 },
  junkLeg: { name: 'Hairy Spider Leg', icon: 'spiderSilk', rarity: 'poor', stack: 20, sell: 4 },
  potionHealth: { name: 'Minor Healing Potion', icon: 'potionHealth', rarity: 'common', stack: 5, use: 'healPotion', flavor: 'Tastes like cherries and regret.' },
  potionMana: { name: 'Minor Mana Potion', icon: 'potionMana', rarity: 'common', stack: 5, use: 'manaPotion' },
  bread: { name: 'Fresh Dawnhollow Bread', icon: 'food', rarity: 'common', stack: 20, use: 'eat' },
  water: { name: 'Refreshing Spring Water', icon: 'drink', rarity: 'common', stack: 20, use: 'drink' },
  hearthstone: { name: 'Hearthstone', icon: 'hearthstone', rarity: 'common', use: 'hearth', flavor: 'Returns you to Dawnhollow.' },
  // ---- professions (game/professions.js): tools, catches, ore, herbs and what you make from them
  fishingPole: { name: 'Fishing Pole', icon: 'fishingPole', rarity: 'common', tool: 'fishing', sell: 1, flavor: 'Point the pointy end at the water.' },
  dragonscalePole: { name: 'Dragonscale Fishing Pole', icon: 'fishingPoleGold', rarity: 'rare', tool: 'fishing', toolBonus: 25, sell: 12, flavor: 'The line never tangles. The fish can tell.' },
  miningPick: { name: 'Mining Pick', icon: 'pickaxe', rarity: 'common', tool: 'mining', sell: 2 },
  trout: { name: 'Mirrormere Trout', icon: 'fishTrout', rarity: 'common', stack: 20, sell: 3 },
  sunfish: { name: 'Spotted Sunfish', icon: 'fishSun', rarity: 'common', stack: 20, sell: 3 },
  snapper: { name: 'Stormfin Snapper', icon: 'fishSnapper', rarity: 'common', stack: 20, sell: 6 },
  eel: { name: 'Harbor Eel', icon: 'fishEel', rarity: 'common', stack: 20, sell: 5 },
  oldBoot: { name: 'Old Boot', icon: 'boots', rarity: 'poor', stack: 5, sell: 1, flavor: 'Size eleven. Left foot. Still looking for the right one.' },
  pearl: { name: 'Glimmering Pearl', icon: 'pearl', rarity: 'uncommon', stack: 10, sell: 60 },
  copperOre: { name: 'Copper Ore', icon: 'oreCopper', rarity: 'common', stack: 20, sell: 5 },
  tinOre: { name: 'Tin Ore', icon: 'oreTin', rarity: 'common', stack: 20, sell: 8 },
  emberite: { name: 'Emberite Ore', icon: 'oreEmber', rarity: 'uncommon', stack: 20, sell: 16, flavor: 'Warm. Warmer than it should be.' },
  tigerseye: { name: "Tigerseye", icon: 'gem', rarity: 'uncommon', stack: 10, sell: 30 },
  peacebloom: { name: 'Peacebloom', icon: 'herbPeace', rarity: 'common', stack: 20, sell: 2 },
  silverleaf: { name: 'Silverleaf', icon: 'herbSilver', rarity: 'common', stack: 20, sell: 2 },
  briarthorn: { name: 'Briarthorn', icon: 'herbBriar', rarity: 'common', stack: 20, sell: 5 },
  embergrass: { name: 'Embergrass', icon: 'herbEmber', rarity: 'uncommon', stack: 20, sell: 10 },
  cookedTrout: { name: 'Cooked Trout', icon: 'fishCooked', rarity: 'common', stack: 20, use: 'eatWell', sell: 4 },
  sunfishSkewer: { name: 'Sunfish Skewer', icon: 'fishCooked', rarity: 'common', stack: 20, use: 'eatWell', sell: 4 },
  snapperSupper: { name: 'Stormfin Supper', icon: 'fishCookedGold', rarity: 'uncommon', stack: 20, use: 'eatWell', sell: 8, flavor: 'The captain\'s own recipe. He would like it back.' },
  potionEmber: { name: 'Ember Tonic', icon: 'elixirEmber', rarity: 'uncommon', stack: 10, use: 'elixir', sell: 10 },
  // ---- Ember Marks buy these from the Quartermaster (game/game.js stock)
  firework: { name: 'Ember Firework', icon: 'firework', rarity: 'common', stack: 20, use: 'firework' },
  mawElixir: { name: 'Elixir of the Maw', icon: 'elixir', rarity: 'uncommon', stack: 10, use: 'elixir', flavor: 'Bottled in the dragon\'s own lair. Do not ask how.' },
  emberling: { name: 'Emberling Whistle', icon: 'whelp', rarity: 'rare', use: 'pet', flavor: 'A tiny whelp who thinks you are its mother.' },
  striderReins: { name: 'Reins of the Ashen Strider', icon: 'mount', rarity: 'epic', use: 'mount', mount: 'strider' },
  drakeReins: { name: 'Reins of the Ember Drake', icon: 'drakeReins', rarity: 'epic', use: 'mount', mount: 'drake', flavor: 'The Maw remembers. So does this drake.' },
};

// ---------------- gear ----------------
export const SLOTS = ['head', 'shoulders', 'chest', 'hands', 'legs', 'feet', 'back', 'weapon'];
const SLOT_WORDS = {
  plate: { head: ['Helm', 'Greathelm', 'Visor'], shoulders: ['Pauldrons', 'Spaulders', 'Shoulderplates'], chest: ['Breastplate', 'Chestguard', 'Hauberk'], hands: ['Gauntlets', 'Handguards'], legs: ['Legplates', 'Greaves'], feet: ['Sabatons', 'Warboots'], back: ['Cloak', 'Cape'] },
  cloth: { head: ['Hood', 'Cowl', 'Circlet'], shoulders: ['Mantle', 'Amice', 'Shoulderpads'], chest: ['Robe', 'Vestments', 'Raiment'], hands: ['Gloves', 'Handwraps'], legs: ['Leggings', 'Trousers'], feet: ['Slippers', 'Sandals'], back: ['Cloak', 'Drape'] },
};
const WEAPONS = { warrior: ['Greatsword', 'Claymore', 'Battleaxe', 'Warblade'], mage: ['Staff', 'Spire', 'Stave'], priest: ['Mace', 'Scepter', 'Staff'] };
const PREFIX = { poor: ['Tattered', 'Rusty', 'Cracked'], common: ['Sturdy', 'Worn', 'Simple', 'Plain'], uncommon: ['Ironbound', 'Emberforged', 'Vale-Touched', 'Stalwart', 'Gleaming', 'Scout\'s', 'Farmhand\'s'], rare: ['Dawnhollow', 'Wyrmscale', 'Moonlit', 'Runed', 'Warden\'s'], epic: ['Dragonforged', 'Emberheart', 'Cinderwrought', 'Worldbreaker\'s', 'Lastlight'] };
const SUFFIX = [
  { n: 'of the Bear', s: { sta: 1, str: 0.6 } }, { n: 'of the Eagle', s: { sta: 0.8, int: 0.8 } }, { n: 'of the Monkey', s: { agi: 1, sta: 0.6 } },
  { n: 'of the Tiger', s: { str: 0.8, agi: 0.8 } }, { n: 'of the Owl', s: { int: 1, spi: 0.6 } }, { n: 'of the Whale', s: { sta: 0.9, spi: 0.7 } },
  { n: 'of Power', s: { ap: 2 } }, { n: 'of Sorcery', s: { sp: 1.6, int: 0.4 } }, { n: 'of the Falcon', s: { agi: 0.7, int: 0.7 } },
];
const RMULT = { poor: 0.4, common: 0.7, uncommon: 1.0, rare: 1.35, epic: 1.8, legendary: 2.4 };
const TIER = { poor: 0, common: 0, uncommon: 1, rare: 2, epic: 3, legendary: 3 };

let GID = 1;
export const nextUid = () => GID++;
/** Generate a gear piece for class `cls` at item level `ilvl`. */
export function makeGear(rng, cls, ilvl, rarity, slot = null) {
  if (typeof rng === 'number' || typeof rng === 'string') rng = new RNG(rng);
  slot = slot || rng.pick(SLOTS);
  const armorType = cls === 'warrior' ? 'plate' : 'cloth';
  const base = slot === 'weapon' ? rng.pick(WEAPONS[cls] || WEAPONS.warrior) : rng.pick(SLOT_WORDS[armorType][slot]);
  const pre = rng.pick(PREFIX[rarity] || PREFIX.common);
  const m = RMULT[rarity];
  const budget = (2 + ilvl * 0.9) * m * (slot === 'weapon' ? 1.6 : slot === 'chest' || slot === 'legs' ? 1.2 : 1);
  const stats = {};
  let suffix = null;
  if (rarity !== 'poor' && rarity !== 'common') {
    // class-appropriate suffix
    const pool = cls === 'warrior' ? SUFFIX.filter(s => s.s.str || s.s.ap || s.s.sta && !s.s.int) : SUFFIX.filter(s => s.s.int || s.s.sp || s.s.spi);
    suffix = rarity === 'epic' || rarity === 'legendary' ? null : rng.pick(pool);
    const src = suffix ? suffix.s : cls === 'warrior' ? { str: 0.9, sta: 0.9, crit: 0.08 } : { int: 0.9, sta: 0.6, sp: 1.0, crit: 0.08 };
    for (const k in src) stats[k] = Math.max(1, Math.round(src[k] * budget * (k === 'crit' ? 1 : 1)));
    if (rarity === 'epic' || rarity === 'legendary') { stats.crit = Math.max(1, Math.round(budget * 0.08)); }
  }
  const item = {
    uid: GID++, gear: true, slot, cls, ilvl, rarity,
    name: `${pre} ${base}${suffix ? ' ' + suffix.n : ''}`,
    icon: slot === 'weapon' ? (cls === 'warrior' ? 'sword2h' : cls === 'mage' ? 'staff' : 'mace') : { head: 'helm', shoulders: 'shoulders', chest: cls === 'warrior' ? 'chest' : 'robe', hands: 'gloves', legs: 'legs', feet: 'boots', back: 'cloak' }[slot],
    armor: slot === 'weapon' || slot === 'back' ? 0 : Math.round((armorType === 'plate' ? 8 : 2.5) * ilvl * m * (slot === 'chest' ? 1.5 : 1)),
    stats, tier: TIER[rarity], armorType,
    sell: Math.round(ilvl * 4 * m * m),
  };
  if (slot === 'weapon') {
    const two = cls === 'warrior';
    const avg = (4 + ilvl * 3.1) * m * (two ? 1.35 : 0.8);
    item.dmgMin = Math.round(avg * 0.78); item.dmgMax = Math.round(avg * 1.22); item.speed = two ? 3.2 : 2.6;
    if (cls !== 'warrior') item.stats.sp = (item.stats.sp || 0) + Math.round(budget * 0.8);
  }
  return item;
}

// Legendary (orange): one named piece per class, a sliver of a chance from the dragon (raid/director.js). Each has
// an effect of its own that Combat runs (procs).
export const LEGENDARY_CHANCE = 0.05;
export const LEGENDARIES = {
  warrior: { slot: 'weapon', name: 'Maw-Eater, Greatsword of the Last Dragon', flavor: 'It still remembers being a tooth.', proc: { id: 'dragonfire', chance: 0.14, dmg: 55 } },
  mage: { slot: 'weapon', name: 'Emberheart, Staff of the Undying Flame', flavor: 'Warm to the touch. Always. Even at the bottom of a lake.', proc: { id: 'dragonfire', chance: 0.18, dmg: 45 } },
  priest: { slot: 'weapon', name: "Lastlight, the Dawn's Promise", flavor: 'The first light of the last day, hammered into a shape a hand can hold.', proc: { id: 'dawnlight', chance: 0.22, heal: 40 } },
};
export function makeLegendary(cls) {
  cls = LEGENDARIES[cls] ? cls : 'warrior';
  const def = LEGENDARIES[cls], it = makeGear(new RNG('legendary-' + cls), cls, 18, 'legendary', def.slot);
  return Object.assign(it, { name: def.name, flavor: def.flavor, proc: { ...def.proc }, unique: true, uid: GID++ });
}
/** The effect line a proc shows in the tooltip. */
export function procText(p) {
  if (p?.id === 'dragonfire') return `Engulfs the enemy in dragonfire for ${p.dmg * 10} Fire damage.`;
  if (p?.id === 'dawnlight') return `Equip: Your heals have a chance to call the dawn, healing your target again for ${p.heal * 10}.`;
  return null;
}

export function statLines(item) {
  const names = { str: 'Strength', agi: 'Agility', sta: 'Stamina', int: 'Intellect', spi: 'Spirit' };
  const lines = [];
  for (const k of ['str', 'agi', 'sta', 'int', 'spi']) if (item.stats?.[k]) lines.push({ text: `+${item.stats[k]} ${names[k]}`, color: '#fff' });
  if (item.stats?.ap) lines.push({ text: `Equip: +${item.stats.ap} Attack Power.`, color: '#1eff00' });
  if (item.stats?.sp) lines.push({ text: `Equip: Increases damage and healing done by magical spells by up to ${item.stats.sp}.`, color: '#1eff00' });
  if (item.stats?.crit) lines.push({ text: `Equip: Improves your chance to get a critical strike by ${item.stats.crit}%.`, color: '#1eff00' });
  if (item.proc?.id === 'dawnlight') lines.push({ text: procText(item.proc), color: '#1eff00' });
  return lines;
}
