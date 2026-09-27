// Mob templates: model, stats multipliers, abilities, loot and flavour.
export const MOBS = {
  boar: {
    name: 'Bristleback Boar', model: ['creature', 'boar', { variants: ['bristleback', 'bristleback', 'dusky'] }], hp: 1.0, dmg: 0.9, speed: 1.0, swing: 2.0, aggro: 10, radius: 0.9,
    abilities: ['mobGore'], family: 'beast', sound: { aggro: 'boarGrunt', hit: 'boarGrunt', death: 'boarSqueal' },
    loot: [{ item: 'boarHaunch', chance: 0.7, quest: 'bacon' }, { item: 'junkHide', chance: 0.4 }],
  },
  wolf: {
    name: 'Timber Wolf', model: ['creature', 'wolf', { variants: ['grey', 'grey', 'brown', 'black'] }], hp: 1.0, dmg: 1.0, speed: 1.1, swing: 1.8, aggro: 11, radius: 0.8,
    abilities: ['mobBite'], family: 'beast', sound: { aggro: 'wolfGrowl', hit: 'wolfYelp', death: 'wolfYelp' },
    loot: [{ item: 'junkFang', chance: 0.55 }, { item: 'wolfPelt', chance: 0.25 }],
  },
  greymaw: {
    name: 'Old Greymaw', model: ['creature', 'wolf', { variant: 'greymaw' }], hp: 5.5, dmg: 1.6, speed: 1.15, swing: 1.6, aggro: 18, radius: 1.3,
    elite: true, rare: true, abilities: ['mobRend', 'mobHowl', 'mobBite'], family: 'beast', sound: { aggro: 'wolfHowl', hit: 'wolfGrowl', death: 'wolfHowl' },
    loot: [{ item: 'greymawFang', chance: 1, quest: 'greymaw' }, { gear: 'rare', chance: 1 }],
  },
  gurgler: {
    name: 'Mirrormere Gurgler', model: ['creature', 'gurgler', { variants: ['marsh', 'reef', 'mud'], weapons: ['spear', 'spear', 'net'] }], hp: 0.95, dmg: 1.0, speed: 1.0, swing: 2.0, aggro: 12, radius: 0.7,
    abilities: ['mobNet'], family: 'gurgler', flee: 0.18, social: 9, sound: { aggro: 'gurgle', hit: 'gurgle', death: 'gurgle' },
    loot: [{ item: 'junkScale', chance: 0.5 }, { item: 'fishingNet', chance: 0.35, quest: 'gurgle' }],
  },
  kobold: {
    name: 'Candlerock Kobold', model: ['creature', 'kobold', { variants: ['brown', 'grey', 'tan'] }], hp: 1.0, dmg: 1.05, speed: 1.0, swing: 2.0, aggro: 12, radius: 0.6,
    abilities: [], family: 'kobold', flee: 0.2, social: 8, yell: ['Not the candle!', 'You no take candle!', 'Mine! MINE!', 'Candle is ours!'],
    sound: { aggro: 'koboldSqueak', hit: 'koboldSqueak', death: 'koboldSqueak' },
    loot: [{ item: 'candle', chance: 0.55, quest: 'candle' }, { item: 'junkWax', chance: 0.4 }],
  },
  waxbeard: {
    name: 'Chief Waxbeard', model: ['creature', 'kobold', { variant: 'waxbeard' }], hp: 4.2, dmg: 1.4, speed: 1.0, swing: 2.0, aggro: 14, radius: 0.9,
    elite: true, abilities: ['mobCandle'], family: 'kobold', yell: ['WHO TOUCH MY CANDLES?!'], sound: { aggro: 'koboldSqueak', hit: 'koboldSqueak', death: 'koboldSqueak' },
    loot: [{ item: 'candle', chance: 1, quest: 'candle' }, { gear: 'uncommon', chance: 1 }],
  },
  spider: {
    name: 'Webwood Lurker', model: ['creature', 'spider', { variants: ['webwood', 'webwood', 'venom', 'cave'] }], hp: 1.05, dmg: 1.0, speed: 1.15, swing: 1.9, aggro: 13, radius: 1.0,
    abilities: ['mobPoison', 'mobWeb'], family: 'beast', sound: { aggro: 'spiderHiss', hit: 'spiderChitter', death: 'spiderHiss' },
    loot: [{ item: 'spiderSilk', chance: 0.6, quest: 'silk' }, { item: 'junkLeg', chance: 0.4 }],
  },
  bandit: {
    name: 'Redcloak Bandit', model: ['humanoid', 'bandit'], hp: 1.1, dmg: 1.1, speed: 1.0, swing: 2.0, aggro: 14, radius: 0.55,
    abilities: ['mobBackstab', 'mobThrow'], family: 'humanoid', flee: 0.15, social: 9, yell: ['Your gold or your life!', 'Get them!', 'Nobody leaves the ruins!'],
    sound: { aggro: 'banditGrunt', hit: 'banditGrunt', death: 'banditGrunt' },
    loot: [{ item: 'redBandana', chance: 0.6, quest: 'redcloak' }, { gold: [3, 9], chance: 0.8 }, { gear: 'uncommon', chance: 0.08 }],
  },
  vex: {
    name: 'Vex Redcloak', model: ['humanoid', 'banditBoss'], hp: 5.0, dmg: 1.45, speed: 1.05, swing: 1.8, aggro: 16, radius: 0.6,
    elite: true, abilities: ['mobFlurry', 'mobBackstab'], family: 'humanoid', yell: ['You should not have come here.', 'Redcloaks! To me!'],
    sound: { aggro: 'banditGrunt', hit: 'banditGrunt', death: 'banditGrunt' },
    loot: [{ item: 'vexSignet', chance: 1, quest: 'redcloak' }, { gear: 'rare', chance: 1 }, { gold: [20, 40], chance: 1 }],
  },
};

// Level-scaled base numbers for a mob of level L (normal difficulty)
export function mobStats(L) {
  return { hp: 26 + L * 18, dmgMin: 1.5 + L * 1.25, dmgMax: 3 + L * 1.9, armor: 15 + L * 14 };
}
