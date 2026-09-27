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
    suffix = rarity === 'epic' ? null : rng.pick(pool);
    const src = suffix ? suffix.s : cls === 'warrior' ? { str: 0.9, sta: 0.9, crit: 0.08 } : { int: 0.9, sta: 0.6, sp: 1.0, crit: 0.08 };
    for (const k in src) stats[k] = Math.max(1, Math.round(src[k] * budget * (k === 'crit' ? 1 : 1)));
    if (rarity === 'epic') { stats.crit = Math.max(1, Math.round(budget * 0.08)); }
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

export function statLines(item) {
  const names = { str: 'Strength', agi: 'Agility', sta: 'Stamina', int: 'Intellect', spi: 'Spirit' };
  const lines = [];
  for (const k of ['str', 'agi', 'sta', 'int', 'spi']) if (item.stats?.[k]) lines.push({ text: `+${item.stats[k]} ${names[k]}`, color: '#fff' });
  if (item.stats?.ap) lines.push({ text: `Equip: +${item.stats.ap} Attack Power.`, color: '#1eff00' });
  if (item.stats?.sp) lines.push({ text: `Equip: Increases damage and healing done by magical spells by up to ${item.stats.sp}.`, color: '#1eff00' });
  if (item.stats?.crit) lines.push({ text: `Equip: Improves your chance to get a critical strike by ${item.stats.crit}%.`, color: '#1eff00' });
  return lines;
}
