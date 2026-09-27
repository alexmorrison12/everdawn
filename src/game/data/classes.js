// Playable classes (+ visual-only SimPlayer classes), base stats per level, XP curve.
export const CLASSES = {
  warrior: { name: 'Warrior', color: '#c79c6e', power: 'rage', role: 'Melee · Tank', hpBase: 70, hpPer: 30, manaBase: 0, manaPer: 0, weapon: 'sword1h', ranged: false,
    desc: 'A master of arms who charges into battle, building rage with every blow.', bar: ['valiantStrike', 'charge', 'rend', 'thunderclap', 'victoryRush', 'cleave', 'mortalBlow', 'whirlwind', 'execute', 'battleShout'] },
  mage: { name: 'Mage', color: '#69ccf0', power: 'mana', role: 'Ranged · Burst', hpBase: 52, hpPer: 21, manaBase: 90, manaPer: 24, weapon: 'staff', ranged: true,
    desc: 'A scholar of fire and frost. Chain critical strikes into instant Pyroblasts.', bar: ['fireball', 'frostbolt', 'fireBlast', 'frostNova', 'blink', 'flamestrike', 'pyroblast', 'iceBarrier', 'arcaneMissiles'] },
  priest: { name: 'Priest', color: '#ffffff', power: 'mana', role: 'Healer · Shadow', hpBase: 55, hpPer: 23, manaBase: 95, manaPer: 25, weapon: 'mace', ranged: true,
    desc: 'Wields holy light to mend allies and shadow words to punish foes. The raid lives or dies by you.', bar: ['smite', 'flashHeal', 'wordOfPain', 'aegis', 'renew', 'mindSpike', 'holyNova', 'greaterHeal'] },
  // SimPlayer-only looks
  paladin: { name: 'Paladin', color: '#f58cba', power: 'mana', hpBase: 68, hpPer: 29, manaBase: 60, manaPer: 16, weapon: 'mace' },
  rogue: { name: 'Rogue', color: '#fff569', power: 'energy', hpBase: 58, hpPer: 25, manaBase: 0, manaPer: 0, weapon: 'dagger' },
  hunter: { name: 'Hunter', color: '#abd473', power: 'mana', hpBase: 60, hpPer: 25, manaBase: 50, manaPer: 12, weapon: 'bow' },
};
export const PLAYABLE = ['warrior', 'mage', 'priest'];

export const RACES = {
  human: { name: 'Human', desc: 'Stubborn, adaptable and far too fond of taverns.' },
  dwarf: { name: 'Dwarf', desc: 'Stout mountain folk. The beard is load-bearing.' },
  orc: { name: 'Orc', desc: 'Towering warriors who settled the vale after the old wars.' },
  elf: { name: 'Elf', desc: 'Long-lived and graceful. Still annoyed about something from 800 years ago.' },
};

export const MAX_LEVEL = 10;
export const xpToNext = L => L >= MAX_LEVEL ? 0 : 180 + L * 95;
// XP for killing a mob of level ML as a level PL player (WoW-ish grey-out)
export function mobXP(PL, ML, elite = false) {
  const diff = ML - PL;
  if (diff <= -4) return 0;
  const base = 38 + ML * 6;
  return Math.round(base * Math.max(0.2, 1 + diff * 0.12) * (elite ? 2.5 : 1));
}
