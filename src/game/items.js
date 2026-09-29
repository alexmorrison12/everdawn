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
  sealedOrders: { name: 'Sealed Orders', icon: 'letter', rarity: 'common', quest: true, flavor: 'Stamped with the seal of the Dawnhollow Watch.' },
  greymaskInsignia: { name: 'Greymask Insignia', icon: 'redBandana', rarity: 'common', quest: true, stack: 20 },
  stolenTin: { name: 'Crate of Stolen Tin', icon: 'oreTin', rarity: 'common', quest: true, stack: 20 },
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
// The character sheet's 19 slots (WoW's paper doll). An item's `slot` is its type: most types fit one slot, a ring or a
// trinket fits either of two. Shirts and tabards are for looks: no stats, anyone can wear them.
export const SLOTS = ['head', 'neck', 'shoulders', 'back', 'chest', 'shirt', 'tabard', 'wrist', 'hands', 'waist', 'legs', 'feet', 'finger1', 'finger2', 'trinket1', 'trinket2', 'weapon', 'offhand', 'ranged'];
/** The slot(s) an item of type `type` can go in. */
export const slotsFor = type => type === 'finger' ? ['finger1', 'finger2'] : type === 'trinket' ? ['trinket1', 'trinket2'] : [type];
/** What drops for a class. Off-hands are for casters: every warrior weapon is a two-hander. */
export const gearTypes = cls => ['head', 'neck', 'shoulders', 'back', 'chest', 'wrist', 'hands', 'waist', 'legs', 'feet', 'finger', 'trinket', 'weapon', 'ranged'].concat(cls === 'warrior' ? [] : ['offhand']);
/** A two-hander (every warrior weapon, every staff) leaves no hand free for an off-hand. */
export const isTwoHand = it => !!it && it.slot === 'weapon' && (it.twoHand ?? (it.cls === 'warrior' || /Staff|Stave|Spire/.test(it.name)));
const SLOT_WORDS = {
  plate: { head: ['Helm', 'Greathelm', 'Visor'], shoulders: ['Pauldrons', 'Spaulders', 'Shoulderplates'], chest: ['Breastplate', 'Chestguard', 'Hauberk'], hands: ['Gauntlets', 'Handguards'], legs: ['Legplates', 'Greaves'], feet: ['Sabatons', 'Warboots'], back: ['Cloak', 'Cape'], wrist: ['Bracers', 'Vambraces', 'Wristguards'], waist: ['Girdle', 'Waistguard', 'Belt'] },
  cloth: { head: ['Hood', 'Cowl', 'Circlet'], shoulders: ['Mantle', 'Amice', 'Shoulderpads'], chest: ['Robe', 'Vestments', 'Raiment'], hands: ['Gloves', 'Handwraps'], legs: ['Leggings', 'Trousers'], feet: ['Slippers', 'Sandals'], back: ['Cloak', 'Drape'], wrist: ['Bindings', 'Cuffs', 'Wristwraps'], waist: ['Cord', 'Sash', 'Belt'] },
  any: { neck: ['Amulet', 'Pendant', 'Choker', 'Necklace'], finger: ['Ring', 'Band', 'Signet', 'Loop'], trinket: ['Talisman', 'Charm', 'Idol', 'Figurine', 'Insignia'] },
};
// [name, hands, icon]
const WEAPONS = {
  warrior: [['Greatsword', 2, 'sword2h'], ['Claymore', 2, 'sword2h'], ['Battleaxe', 2, 'sword2h'], ['Warblade', 2, 'sword2h']],
  mage: [['Staff', 2, 'staff'], ['Spire', 2, 'staff'], ['Stave', 2, 'staff'], ['Dagger', 1, 'dagger'], ['Spellblade', 1, 'sword']],
  priest: [['Mace', 1, 'mace'], ['Scepter', 1, 'mace'], ['Staff', 2, 'staff']],
};
const OFFHANDS = { mage: [['Orb', 'orb'], ['Tome', 'tome'], ['Grimoire', 'tome']], priest: [['Tome', 'tome'], ['Codex', 'tome'], ['Orb', 'orb']] };
const RANGED = { warrior: [['Longbow', 'bow', 2.8], ['Shortbow', 'bow', 2.3], ['Crossbow', 'bow', 3.0]], caster: [['Wand', 'wand', 1.6], ['Rod', 'wand', 1.9]] };
const ICON = { head: 'helm', shoulders: 'shoulders', hands: 'gloves', legs: 'legs', feet: 'boots', back: 'cloak', wrist: 'bracers', waist: 'belt', neck: 'amulet', finger: 'ring', trinket: 'trinket' };
// stat budget and armor per slot (a one-handed weapon gets 1.0; the off-hand makes up the rest)
const BUDGET = { head: 1, shoulders: 1, chest: 1.2, hands: 1, legs: 1.2, feet: 1, back: 1, wrist: 0.6, waist: 0.8, neck: 0.7, finger: 0.7, trinket: 0.8, offhand: 0.6, ranged: 0.5, weapon: 1.6 };
const ARMOR = { head: 1, shoulders: 1, chest: 1.5, hands: 1, legs: 1, feet: 1, wrist: 0.5, waist: 0.7 };
const PREFIX = { poor: ['Tattered', 'Rusty', 'Cracked'], common: ['Sturdy', 'Worn', 'Simple', 'Plain'], uncommon: ['Ironbound', 'Emberforged', 'Vale-Touched', 'Stalwart', 'Gleaming', 'Scout\'s', 'Farmhand\'s'], rare: ['Dawnhollow', 'Wyrmscale', 'Moonlit', 'Runed', 'Warden\'s'], epic: ['Dragonforged', 'Emberheart', 'Cinderwrought', 'Worldbreaker\'s', 'Lastlight'] };
const SUFFIX = [
  { n: 'of the Bear', s: { sta: 1, str: 0.6 } }, { n: 'of the Eagle', s: { sta: 0.8, int: 0.8 } }, { n: 'of the Monkey', s: { agi: 1, sta: 0.6 } },
  { n: 'of the Tiger', s: { str: 0.8, agi: 0.8 } }, { n: 'of the Owl', s: { int: 1, spi: 0.6 } }, { n: 'of the Whale', s: { sta: 0.9, spi: 0.7 } },
  { n: 'of Power', s: { ap: 2 } }, { n: 'of Sorcery', s: { sp: 1.6, int: 0.4 } }, { n: 'of the Falcon', s: { agi: 0.7, int: 0.7 } },
];
const RMULT = { poor: 0.4, common: 0.7, uncommon: 1.0, rare: 1.35, epic: 1.8, legendary: 2.4 };
const TIER = { poor: 0, common: 0, uncommon: 1, rare: 2, epic: 3, legendary: 3 };

let GID = Date.now() * 100 + Math.floor(Math.random() * 100); // unique across sessions and players (friends trade and win each other's items)
export const nextUid = () => GID++;
/** Generate a gear piece for class `cls` at item level `ilvl` (`slot`: an item type; random if left out). */
export function makeGear(rng, cls, ilvl, rarity, slot = null) {
  if (typeof rng === 'number' || typeof rng === 'string') rng = new RNG(rng);
  slot = slot || rng.pick(gearTypes(cls));
  const caster = cls !== 'warrior', armorType = caster ? 'cloth' : 'plate';
  let base, icon, hands = 0;
  if (slot === 'weapon') { const w = rng.pick(WEAPONS[cls] || WEAPONS.warrior); base = w[0]; hands = w[1]; icon = w[2]; }
  else if (slot === 'offhand') { const o = rng.pick(OFFHANDS[cls] || OFFHANDS.mage); base = o[0]; icon = o[1]; }
  else if (slot === 'ranged') { const r = rng.pick(caster ? RANGED.caster : RANGED.warrior); base = r[0]; icon = r[1]; }
  else { base = rng.pick((SLOT_WORDS.any[slot] ? SLOT_WORDS.any : SLOT_WORDS[armorType])[slot]); icon = slot === 'chest' ? (caster ? 'robe' : 'chest') : ICON[slot]; }
  const pre = rng.pick(PREFIX[rarity] || PREFIX.common);
  const m = RMULT[rarity];
  const budget = (2 + ilvl * 0.9) * m * (slot === 'weapon' && hands === 1 ? 1 : BUDGET[slot] ?? 1);
  const stats = {};
  let suffix = null;
  if (rarity !== 'poor' && rarity !== 'common') {
    if (slot === 'trinket') { // trinkets carry "Equip:" effects only
      if (caster) stats.sp = Math.max(1, Math.round(budget * 1.4)); else stats.ap = Math.max(2, Math.round(budget * 2));
      if (TIER[rarity] >= 2) stats.crit = Math.max(1, Math.round(budget * 0.08));
    } else {
      // class-appropriate suffix
      const pool = caster ? SUFFIX.filter(s => s.s.int || s.s.sp || s.s.spi) : SUFFIX.filter(s => s.s.str || s.s.ap || s.s.sta && !s.s.int);
      suffix = rarity === 'epic' || rarity === 'legendary' ? null : rng.pick(pool);
      const src = suffix ? suffix.s : !caster ? { str: 0.9, sta: 0.9, crit: 0.08 } : { int: 0.9, sta: 0.6, sp: 1.0, crit: 0.08 };
      for (const k in src) stats[k] = Math.max(1, Math.round(src[k] * budget));
      if (rarity === 'epic' || rarity === 'legendary') { stats.crit = Math.max(1, Math.round(budget * 0.08)); }
    }
  }
  const item = {
    uid: GID++, gear: true, slot, cls, ilvl, rarity,
    name: `${pre} ${base}${suffix ? ' ' + suffix.n : ''}`, icon,
    armor: ARMOR[slot] ? Math.round((armorType === 'plate' ? 8 : 2.5) * ilvl * m * ARMOR[slot]) : 0,
    stats, tier: TIER[rarity], armorType,
    sell: Math.round(ilvl * 4 * m * m * Math.min(1, BUDGET[slot] ?? 1)),
  };
  if (slot === 'weapon') {
    const two = cls === 'warrior';
    item.twoHand = hands !== 1;
    const avg = (4 + ilvl * 3.1) * m * (two ? 1.35 : 0.8);
    item.dmgMin = Math.round(avg * 0.78); item.dmgMax = Math.round(avg * 1.22); item.speed = two ? 3.2 : hands === 1 ? 1.8 : 2.6;
    if (caster) item.stats.sp = (item.stats.sp || 0) + Math.round(budget * 0.8);
  }
  if (slot === 'offhand') { item.stats.sp = (item.stats.sp || 0) + Math.round(budget * 0.8); item.held = icon === 'orb' ? 'orb' : 'book'; }
  if (slot === 'ranged') { // Shoot Bow (warriors) or Shoot (a wand) fires it: data/spells.js
    const r = (caster ? RANGED.caster : RANGED.warrior).find(x => x[0] === base), avg = (3 + ilvl * 2.2) * m * (caster ? 0.9 : 1.2);
    item.speed = r[2]; item.dmgMin = Math.max(1, Math.round(avg * 0.8)); item.dmgMax = Math.max(2, Math.round(avg * 1.2));
    item.school = caster ? 'arcane' : 'physical';
  }
  return item;
}

// Shirts and tabards, for looks: `look` colours the model (models/humanoid/gear.js) and the icon.
export const COSMETICS = {
  shirtWhite: { slot: 'shirt', name: 'White Linen Shirt', rarity: 'common', price: 80, look: { color: 0xe8e0cc } },
  shirtRed: { slot: 'shirt', name: 'Red Linen Shirt', rarity: 'common', price: 120, look: { color: 0x9a2a22 } },
  shirtBlue: { slot: 'shirt', name: 'Blue Linen Shirt', rarity: 'common', price: 120, look: { color: 0x2a4a8a } },
  shirtGreen: { slot: 'shirt', name: 'Green Woolen Shirt', rarity: 'common', price: 150, look: { color: 0x3a6a30 } },
  shirtBlack: { slot: 'shirt', name: 'Stylish Black Shirt', rarity: 'uncommon', price: 600, look: { color: 0x1e1c20 }, flavor: 'Goes with everything. Especially brooding.' },
  shirtNoble: { slot: 'shirt', name: "Noble's Embroidered Shirt", rarity: 'rare', price: 2500, look: { color: 0x6a2a8a }, flavor: 'The embroidery alone took a season.' },
  tabardDawn: { slot: 'tabard', name: 'Tabard of the Dawnhollow Watch', rarity: 'common', price: 500, look: { color: 0xe8e0cc, trim: 0xc8a048, emblem: 'sun' } },
  tabardCrown: { slot: 'tabard', name: 'Tabard of Aurelion', rarity: 'uncommon', price: 1000, look: { color: 0x2a4a8a, trim: 0xe8c050, emblem: 'lion' }, flavor: 'For the Crown. And for the discount at the Gilded Griffin.' },
  tabardMaw: { slot: 'tabard', name: 'Tabard of the Dragonslayer', rarity: 'epic', marks: 12, look: { color: 0x6a1414, trim: 0xff8a30, emblem: 'star' }, flavor: 'Worn by those who walked out of the Maw. More than once.' },
};
const hex = n => n.toString(16).padStart(6, '0');
/** A shirt or tabard (icon ids carry the colours: 'shirt@rrggbb', 'tabard@rrggbb@rrggbb@emblem'). */
export function makeCosmetic(id) {
  const d = COSMETICS[id], L = d.look;
  return { uid: GID++, gear: true, cosmetic: id, slot: d.slot, name: d.name, rarity: d.rarity, ilvl: 1, stats: {}, armor: 0, tier: 0, look: { ...L }, flavor: d.flavor,
    icon: d.slot === 'shirt' ? `shirt@${hex(L.color)}` : `tabard@${hex(L.color)}@${hex(L.trim)}@${L.emblem}`, sell: Math.max(1, Math.round((d.price || 400) / 100)) };
}

// Legendary (orange): one named piece per class, a sliver of a chance from the dragon (raid/director.js). Each has
// an effect of its own that Combat runs (procs).
export const LEGENDARY_CHANCE = 0.05;
export const LEGENDARIES = {
  warrior: { slot: 'weapon', twoHand: true, icon: 'sword2h', name: 'Maw-Eater, Greatsword of the Last Dragon', flavor: 'It still remembers being a tooth.', proc: { id: 'dragonfire', chance: 0.14, dmg: 55 } },
  mage: { slot: 'weapon', twoHand: true, icon: 'staff', name: 'Emberheart, Staff of the Undying Flame', flavor: 'Warm to the touch. Always. Even at the bottom of a lake.', proc: { id: 'dragonfire', chance: 0.18, dmg: 45 } },
  priest: { slot: 'weapon', twoHand: false, icon: 'mace', name: "Lastlight, the Dawn's Promise", flavor: 'The first light of the last day, hammered into a shape a hand can hold.', proc: { id: 'dawnlight', chance: 0.22, heal: 40 } },
};
export function makeLegendary(cls) {
  cls = LEGENDARIES[cls] ? cls : 'warrior';
  const def = LEGENDARIES[cls], it = makeGear(new RNG('legendary-' + cls), cls, 18, 'legendary', def.slot);
  return Object.assign(it, { name: def.name, flavor: def.flavor, icon: def.icon, twoHand: def.twoHand, proc: { ...def.proc }, unique: true, uid: GID++ });
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
