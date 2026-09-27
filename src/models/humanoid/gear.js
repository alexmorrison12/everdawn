// Gear specification, presets, palette and body "painting" (garments displaced + coloured on the body mesh).
import { linColor } from '../../engine/geom.js';
import { SLOT, NSLOT, DET } from './palette.js';
import { CH_TORSO, CH_ARM_L, CH_ARM_R, CH_LEG_L, CH_LEG_R, CH_HEAD, CH_HAND_L, CH_HAND_R } from './rig.js';
import { clamp, lerp, smoothstep, Simplex } from '../../core/noise.js';

const NZ = new Simplex(99);

// ---------------------------------------------------------------------------------------------
// Gear spec (all fields optional):
// {
//   armor: 'plate'|'mail'|'leather'|'cloth', tier: 0..3,
//   colors: { primary, secondary, trim, metal, leather, cloth, pants, boots, gloves, belt, gem, cape, capeInner, emblem, tabard, hood },
//   head:      null | { type: 'helm'|'greathelm'|'horned'|'winged'|'hood'|'wizard'|'straw'|'bandana'|'cap'|'circlet'|'crown', mask?, gem?, glowTrim? },
//   shoulders: null | { type: 'plate'|'mail'|'leather'|'cloth'|'fur', size, layers, spikes, gem, wing, glowTrim },
//   chest:     { type: 'shirt'|'tunic'|'vest'|'robe'|'plate'|'mail'|'leather'|'rags', sleeves: 0..2 (arm coord), sleeveType?, neck: 'crew'|'v'|'high', straps? },
//   belt:      null | { type: 'leather'|'plate'|'sash'|'rope', buckle: 'square'|'gem'|'plate'|'skull'|'none', pouches },
//   legs:      { type: 'pants'|'leather'|'mail'|'plate'|'rags', kneepads? },
//   feet:      { type: 'boots'|'shoes'|'plate'|'wraps', height: 0..1, cuff? },
//   hands:     null | { type: 'gloves'|'gauntlets'|'wraps'|'bracers', cuff },
//   cloak:     null | { len, trim, emblem, glowTrim },
//   tabard:    null | { emblem, back }, apron: bool,
//   skirt:     null | { len, type, flare, panel, hemTrim },
//   mainHand:  null | { type: 'sword1h'|'sword2h'|'axe'|'axe2h'|'mace'|'staff'|'dagger'|'bow'|'wand', ... },
//   offHand:   null | { type: 'shield'|'book'|'orb'|'dagger'|'sword1h'|'axe'|'mace', emblem },
//   quiver: bool, glow: hex (epic glow colour)
// }

const C = {
  steel: 0xa8b2bc, darkSteel: 0x5c636c, iron: 0x7a7f86, gold: 0xe8b848, bronze: 0xb8803e, silver: 0xdfe6ee, blackIron: 0x3c3f46,
  leather: 0x7a5232, darkLeather: 0x4a3020, tan: 0xa8784c, blackLeather: 0x2c2826, fur: 0xb89c78, darkFur: 0x6a5642,
  linen: 0xe8dcc0, brown: 0x6a4a30, wood: 0x7a5534,
};

function preset(o) { return { tier: 0, armor: 'cloth', ...o, colors: { ...o.colors } }; }

const W = [ // warrior
  preset({ armor: 'leather', tier: 0, colors: { primary: 0x8a6a48, secondary: 0x6a5a48, trim: 0x8a7050, pants: 0x5a4a3a, boots: 0x4a3222 },
    chest: { type: 'tunic', sleeves: 0.55, neck: 'crew' }, belt: { type: 'leather', buckle: 'square' }, legs: { type: 'pants' }, feet: { type: 'boots', height: 0.45 },
    hands: { type: 'wraps', cuff: 0.25 }, mainHand: { type: 'sword1h', tier: 0 } }),
  preset({ armor: 'mail', tier: 1, colors: { primary: 0x7c848a, secondary: 0x4a6a38, trim: 0x8a6a40, pants: 0x3e5a30, boots: 0x5a3e28, gloves: 0x5a3e28, cape: 0x3e6a2e },
    chest: { type: 'mail', sleeves: 1.0, neck: 'crew' }, shoulders: { type: 'leather', size: 0.9, layers: 1 }, belt: { type: 'leather', buckle: 'square', pouches: 1 },
    legs: { type: 'mail', kneepads: true }, feet: { type: 'boots', height: 0.55, cuff: true }, hands: { type: 'gloves', cuff: 0.3 },
    mainHand: { type: 'axe', tier: 1 }, offHand: { type: 'shield', emblem: 'diamond', tier: 1 } }),
  preset({ armor: 'plate', tier: 2, colors: { primary: 0x8c96a2, secondary: 0x2e5a9a, trim: 0xc89048, pants: 0x2e4a7a, boots: 0x5a636c, cape: 0x28508a, capeInner: 0x1c2c48, emblem: 0xe0b050 },
    head: { type: 'helm' }, chest: { type: 'plate', sleeves: 1.6, neck: 'high' }, shoulders: { type: 'plate', size: 1.15, layers: 2, spikes: 0 },
    belt: { type: 'plate', buckle: 'plate' }, legs: { type: 'plate', kneepads: true }, feet: { type: 'plate', height: 0.7, cuff: true },
    hands: { type: 'gauntlets', cuff: 0.45 }, cloak: { len: 0.82, trim: true }, mainHand: { type: 'sword2h', tier: 2 } }),
  preset({ armor: 'plate', tier: 3, glow: 0xff5020, colors: { primary: 0x8a1c1c, secondary: 0x3a3c44, trim: 0xf0c050, pants: 0x3a3c44, boots: 0x6a1818, cape: 0x7a1414, capeInner: 0x28080a, emblem: 0xf0c050, gem: 0xff5a20 },
    head: { type: 'horned', gem: true, glowTrim: true }, chest: { type: 'plate', sleeves: 1.7, neck: 'high' },
    shoulders: { type: 'plate', size: 1.55, layers: 3, spikes: 3, gem: true, wing: true, glowTrim: true },
    belt: { type: 'plate', buckle: 'skull' }, legs: { type: 'plate', kneepads: true }, feet: { type: 'plate', height: 0.8, cuff: true },
    hands: { type: 'gauntlets', cuff: 0.5, glowTrim: true }, cloak: { len: 0.9, trim: true, emblem: 'skull', glowTrim: true },
    skirt: { type: 'plate', len: 0.35, flare: 0.05 }, mainHand: { type: 'axe2h', tier: 3, glow: true } }),
];
const PA = [ // paladin
  preset({ armor: 'cloth', tier: 0, colors: { primary: 0xd8d0b8, secondary: 0x8a6a40, trim: 0xb89050, pants: 0x6a5238, boots: 0x5a4028 },
    chest: { type: 'tunic', sleeves: 1.0, neck: 'v' }, belt: { type: 'leather', buckle: 'square' }, legs: { type: 'pants' }, feet: { type: 'boots', height: 0.5 },
    mainHand: { type: 'mace', tier: 0 } }),
  preset({ armor: 'mail', tier: 1, colors: { primary: 0x828a92, secondary: 0xe8e0cc, trim: 0xc8a048, pants: 0x5a6a8a, boots: 0x5a4a38, tabard: 0xe8e0cc, emblem: 0xc8a048 },
    chest: { type: 'mail', sleeves: 1.2, neck: 'crew' }, tabard: { emblem: 'cross' }, shoulders: { type: 'mail', size: 0.95 },
    belt: { type: 'leather', buckle: 'plate' }, legs: { type: 'mail' }, feet: { type: 'boots', height: 0.55, cuff: true }, hands: { type: 'gloves', cuff: 0.3 },
    mainHand: { type: 'mace', tier: 1 }, offHand: { type: 'shield', emblem: 'cross', tier: 1 } }),
  preset({ armor: 'plate', tier: 2, colors: { primary: 0xb4bec8, secondary: 0x2a5aa8, trim: 0xe0b048, pants: 0x2a4a88, boots: 0xa0aab4, cape: 0x2a5aa8, capeInner: 0xe0d8c0, emblem: 0xe8c050 },
    head: { type: 'helm', gem: true }, chest: { type: 'plate', sleeves: 1.6, neck: 'high' }, shoulders: { type: 'plate', size: 1.25, layers: 2, gem: true },
    belt: { type: 'plate', buckle: 'gem' }, legs: { type: 'plate', kneepads: true }, feet: { type: 'plate', height: 0.7, cuff: true },
    hands: { type: 'gauntlets', cuff: 0.45 }, cloak: { len: 0.85, trim: true, emblem: 'sun' },
    mainHand: { type: 'sword1h', tier: 2 }, offHand: { type: 'shield', emblem: 'sun', tier: 2 } }),
  preset({ armor: 'plate', tier: 3, glow: 0xffd880, colors: { primary: 0xdcd6c4, secondary: 0xc89828, trim: 0xffd060, pants: 0xcfc8b4, boots: 0xdcd6c4, cape: 0xf4f0e4, capeInner: 0xc89830, emblem: 0xffd060, gem: 0x80c8ff },
    head: { type: 'winged', gem: true, glowTrim: true }, chest: { type: 'plate', sleeves: 1.7, neck: 'high' },
    shoulders: { type: 'plate', size: 1.6, layers: 3, gem: true, wing: true, glowTrim: true },
    belt: { type: 'plate', buckle: 'gem' }, legs: { type: 'plate', kneepads: true }, feet: { type: 'plate', height: 0.8, cuff: true },
    hands: { type: 'gauntlets', cuff: 0.5, glowTrim: true }, cloak: { len: 0.95, trim: true, emblem: 'sun', glowTrim: true },
    skirt: { type: 'plate', len: 0.38, flare: 0.05 }, mainHand: { type: 'mace', tier: 3, glow: true }, offHand: { type: 'shield', emblem: 'sun', tier: 3, glow: true } }),
];
const MA = [ // mage
  preset({ armor: 'cloth', tier: 0, colors: { primary: 0x6a7a9a, secondary: 0x4a5068, trim: 0x9a9a8a, pants: 0x4a4a5a, boots: 0x4a3a2a },
    chest: { type: 'robe', sleeves: 1.9, neck: 'v' }, skirt: { len: 0.92, flare: 0.1 }, belt: { type: 'rope', buckle: 'none' },
    legs: { type: 'pants' }, feet: { type: 'shoes', height: 0.2 }, mainHand: { type: 'staff', tier: 0 } }),
  preset({ armor: 'cloth', tier: 1, colors: { primary: 0x3a6a4a, secondary: 0xd8c898, trim: 0xc8a050, pants: 0x3a4a3a, boots: 0x4a3a2a },
    chest: { type: 'robe', sleeves: 1.9, neck: 'v' }, skirt: { len: 0.95, flare: 0.12, panel: true, hemTrim: true }, belt: { type: 'sash', buckle: 'none' },
    shoulders: { type: 'cloth', size: 0.8 }, legs: { type: 'pants' }, feet: { type: 'shoes', height: 0.25 }, mainHand: { type: 'staff', tier: 1 } }),
  preset({ armor: 'cloth', tier: 2, colors: { primary: 0x2c4c9c, secondary: 0xd8dce8, trim: 0xc8d4e8, pants: 0x283868, boots: 0x3a3048, cape: 0x243c7c, capeInner: 0xb8c0d8, hood: 0x2c4c9c, gem: 0x80c0ff },
    head: { type: 'circlet', gem: true }, chest: { type: 'robe', sleeves: 1.95, neck: 'high' }, skirt: { len: 1.0, flare: 0.15, panel: true, hemTrim: true },
    shoulders: { type: 'cloth', size: 1.1, layers: 1, gem: true }, belt: { type: 'sash', buckle: 'gem' }, legs: { type: 'pants' }, feet: { type: 'shoes', height: 0.3 },
    cloak: { len: 0.88, trim: true }, mainHand: { type: 'staff', tier: 2, glow: true }, offHand: null }),
  preset({ armor: 'cloth', tier: 3, glow: 0xc070ff, colors: { primary: 0x5a1e8a, secondary: 0x2a0c48, trim: 0xf0c860, pants: 0x3a1460, boots: 0x3a1460, cape: 0x4a1878, capeInner: 0xf0c860, hood: 0x5a1e8a, gem: 0xd080ff, emblem: 0xf0c860 },
    head: { type: 'crown', gem: true, glowTrim: true }, chest: { type: 'robe', sleeves: 1.95, neck: 'high' }, skirt: { len: 1.05, flare: 0.2, panel: true, hemTrim: true },
    shoulders: { type: 'cloth', size: 1.5, layers: 2, gem: true, wing: true, glowTrim: true }, belt: { type: 'sash', buckle: 'gem' },
    legs: { type: 'pants' }, feet: { type: 'shoes', height: 0.3 }, cloak: { len: 0.95, trim: true, emblem: 'star', glowTrim: true },
    mainHand: { type: 'staff', tier: 3, glow: true }, offHand: { type: 'orb', tier: 3, glow: true } }),
];
const PR = [ // priest
  preset({ armor: 'cloth', tier: 0, colors: { primary: 0xe8e4d8, secondary: 0xb8a888, trim: 0xa89878, pants: 0x8a8070, boots: 0x6a5a48 },
    chest: { type: 'robe', sleeves: 1.9, neck: 'crew' }, skirt: { len: 0.95, flare: 0.1 }, belt: { type: 'rope', buckle: 'none' },
    legs: { type: 'pants' }, feet: { type: 'shoes', height: 0.2 }, mainHand: { type: 'mace', tier: 0 } }),
  preset({ armor: 'cloth', tier: 1, colors: { primary: 0xf0ead8, secondary: 0x6a88b8, trim: 0xd8b060, pants: 0x8a8070, boots: 0x6a5a48 },
    chest: { type: 'robe', sleeves: 1.9, neck: 'v' }, skirt: { len: 0.98, flare: 0.12, panel: true, hemTrim: true }, belt: { type: 'sash', buckle: 'none' },
    legs: { type: 'pants' }, feet: { type: 'shoes', height: 0.25 }, mainHand: { type: 'staff', tier: 1 }, offHand: { type: 'book', tier: 1 } }),
  preset({ armor: 'cloth', tier: 2, colors: { primary: 0xf4f0e8, secondary: 0x3a6ab8, trim: 0xe8c060, pants: 0xd8d0c0, boots: 0xc8c0b0, cape: 0xf0ece0, capeInner: 0x3a6ab8, hood: 0xf4f0e8, gem: 0x80d0ff },
    head: { type: 'hood' }, chest: { type: 'robe', sleeves: 1.95, neck: 'high' }, skirt: { len: 1.0, flare: 0.14, panel: true, hemTrim: true },
    shoulders: { type: 'cloth', size: 1.05, gem: true }, belt: { type: 'sash', buckle: 'gem' }, legs: { type: 'pants' }, feet: { type: 'shoes', height: 0.3 },
    mainHand: { type: 'mace', tier: 2 }, offHand: { type: 'book', tier: 2 } }),
  preset({ armor: 'cloth', tier: 3, glow: 0xfff0a0, colors: { primary: 0xfaf6ea, secondary: 0xe0b040, trim: 0xffd870, pants: 0xf0e8d8, boots: 0xf0e8d8, cape: 0xfaf6ea, capeInner: 0xe0b040, hood: 0xfaf6ea, gem: 0x90e8ff, emblem: 0xffd870 },
    head: { type: 'circlet', gem: true, glowTrim: true }, chest: { type: 'robe', sleeves: 1.95, neck: 'high' }, skirt: { len: 1.05, flare: 0.2, panel: true, hemTrim: true },
    shoulders: { type: 'cloth', size: 1.45, layers: 2, gem: true, wing: true, glowTrim: true }, belt: { type: 'sash', buckle: 'gem' },
    legs: { type: 'pants' }, feet: { type: 'shoes', height: 0.3 }, cloak: { len: 0.95, trim: true, emblem: 'sun', glowTrim: true },
    mainHand: { type: 'staff', tier: 3, glow: true }, offHand: { type: 'orb', tier: 3, glow: true } }),
];
const RO = [ // rogue
  preset({ armor: 'leather', tier: 0, colors: { primary: 0x5a4a3a, secondary: 0x3a3028, trim: 0x6a5a48, pants: 0x3a3430, boots: 0x3a2a20 },
    chest: { type: 'leather', sleeves: 0.5, neck: 'v' }, belt: { type: 'leather', buckle: 'square', pouches: 2 }, legs: { type: 'leather' },
    feet: { type: 'boots', height: 0.6 }, hands: { type: 'wraps', cuff: 0.3 }, mainHand: { type: 'dagger', tier: 0 }, offHand: { type: 'dagger', tier: 0 } }),
  preset({ armor: 'leather', tier: 1, colors: { primary: 0x4a3a2c, secondary: 0x2a2a2a, trim: 0x8a8a8a, pants: 0x2a2826, boots: 0x2a2220, hood: 0x3a3a38 },
    head: { type: 'hood' }, chest: { type: 'leather', sleeves: 1.9, neck: 'high', straps: true }, belt: { type: 'leather', buckle: 'square', pouches: 3 },
    legs: { type: 'leather' }, feet: { type: 'boots', height: 0.7, cuff: true }, hands: { type: 'gloves', cuff: 0.3 },
    shoulders: { type: 'leather', size: 0.8 }, mainHand: { type: 'dagger', tier: 1 }, offHand: { type: 'dagger', tier: 1 } }),
  preset({ armor: 'leather', tier: 2, colors: { primary: 0x2a2630, secondary: 0x5a2a6a, trim: 0xb0b8c0, pants: 0x221e26, boots: 0x221e26, hood: 0x2a2630, cape: 0x3a1e48, capeInner: 0x1a1020 },
    head: { type: 'hood', mask: true }, chest: { type: 'leather', sleeves: 1.9, neck: 'high', straps: true }, shoulders: { type: 'leather', size: 1.0, layers: 2, spikes: 2 },
    belt: { type: 'leather', buckle: 'plate', pouches: 3 }, legs: { type: 'leather', kneepads: true }, feet: { type: 'boots', height: 0.75, cuff: true },
    hands: { type: 'gloves', cuff: 0.35 }, cloak: { len: 0.7 }, mainHand: { type: 'sword1h', tier: 2 }, offHand: { type: 'dagger', tier: 2 } }),
  preset({ armor: 'leather', tier: 3, glow: 0x60ff70, colors: { primary: 0x1a2a1e, secondary: 0x0e140e, trim: 0x70e080, pants: 0x121a14, boots: 0x121a14, hood: 0x1a2a1e, cape: 0x14301c, capeInner: 0x08100a, gem: 0x60ff70, emblem: 0x70e080 },
    head: { type: 'hood', mask: true }, chest: { type: 'leather', sleeves: 1.9, neck: 'high', straps: true },
    shoulders: { type: 'leather', size: 1.35, layers: 3, spikes: 3, gem: true, glowTrim: true }, belt: { type: 'leather', buckle: 'gem', pouches: 3 },
    legs: { type: 'leather', kneepads: true }, feet: { type: 'boots', height: 0.8, cuff: true }, hands: { type: 'gloves', cuff: 0.4, glowTrim: true },
    cloak: { len: 0.8, trim: true, emblem: 'skull', glowTrim: true }, mainHand: { type: 'dagger', tier: 3, glow: true }, offHand: { type: 'dagger', tier: 3, glow: true } }),
];
const HU = [ // hunter
  preset({ armor: 'leather', tier: 0, colors: { primary: 0x7a5a38, secondary: 0x5a6a3a, trim: 0xb89c78, pants: 0x5a4a30, boots: 0x4a3420 },
    chest: { type: 'leather', sleeves: 0.6, neck: 'crew' }, belt: { type: 'leather', buckle: 'square', pouches: 1 }, legs: { type: 'leather' },
    feet: { type: 'boots', height: 0.6 }, hands: { type: 'bracers', cuff: 0.4 }, mainHand: { type: 'bow', tier: 0 }, quiver: true }),
  preset({ armor: 'leather', tier: 1, colors: { primary: 0x5a6a38, secondary: 0x7a5a38, trim: 0xb89c78, pants: 0x4a4a30, boots: 0x4a3420, cape: 0x4a5a2e },
    chest: { type: 'leather', sleeves: 1.0, neck: 'v', straps: true }, shoulders: { type: 'fur', size: 1.0 }, belt: { type: 'leather', buckle: 'square', pouches: 2 },
    legs: { type: 'leather', kneepads: true }, feet: { type: 'boots', height: 0.65, cuff: true }, hands: { type: 'gloves', cuff: 0.35 },
    mainHand: { type: 'bow', tier: 1 }, quiver: true }),
  preset({ armor: 'mail', tier: 2, colors: { primary: 0x767e74, secondary: 0x3a6a3a, trim: 0xb8905a, pants: 0x3a5a34, boots: 0x5a4028, cape: 0x2e5a2e, capeInner: 0x1a2a18 },
    head: { type: 'hood' }, chest: { type: 'mail', sleeves: 1.3, neck: 'crew' }, shoulders: { type: 'mail', size: 1.15, layers: 2, spikes: 1 },
    belt: { type: 'leather', buckle: 'plate', pouches: 2 }, legs: { type: 'mail', kneepads: true }, feet: { type: 'boots', height: 0.7, cuff: true },
    hands: { type: 'gloves', cuff: 0.4 }, cloak: { len: 0.75, trim: true }, mainHand: { type: 'bow', tier: 2 }, quiver: true }),
  preset({ armor: 'mail', tier: 3, glow: 0x40e0ff, colors: { primary: 0x2a6a58, secondary: 0x8a5a30, trim: 0xe8c068, pants: 0x1e4a3e, boots: 0x2a3a30, cape: 0x1e5a4a, capeInner: 0x10281e, gem: 0x40e0ff, emblem: 0xe8c068, hood: 0x2a6a58 },
    head: { type: 'horned', gem: true, glowTrim: true }, chest: { type: 'mail', sleeves: 1.5, neck: 'high', straps: true },
    shoulders: { type: 'mail', size: 1.5, layers: 3, spikes: 2, gem: true, wing: true, glowTrim: true }, belt: { type: 'plate', buckle: 'gem', pouches: 2 },
    legs: { type: 'mail', kneepads: true }, feet: { type: 'boots', height: 0.8, cuff: true }, hands: { type: 'gauntlets', cuff: 0.45, glowTrim: true },
    cloak: { len: 0.9, trim: true, emblem: 'moon', glowTrim: true }, skirt: { type: 'leather', len: 0.3, flare: 0.06 }, mainHand: { type: 'bow', tier: 3, glow: true }, quiver: true }),
];
const NPC = {
  villager: preset({ armor: 'cloth', colors: { primary: 0xd8cca8, secondary: 0x8a6a48, trim: 0x8a6a48, pants: 0x6a5238, boots: 0x4a3424 },
    chest: { type: 'shirt', sleeves: 1.2, neck: 'v' }, belt: { type: 'leather', buckle: 'square' }, legs: { type: 'pants' }, feet: { type: 'shoes', height: 0.3 } }),
  farmer: preset({ armor: 'cloth', colors: { primary: 0x8a9ab0, secondary: 0x6a5238, trim: 0x6a5238, pants: 0x7a6040, boots: 0x4a3424 },
    head: { type: 'straw' }, chest: { type: 'shirt', sleeves: 0.9, neck: 'crew' }, belt: { type: 'rope', buckle: 'none' },
    legs: { type: 'pants' }, feet: { type: 'boots', height: 0.5 } }),
  innkeeper: preset({ armor: 'cloth', colors: { primary: 0xeee8d8, secondary: 0x7a3a2a, trim: 0x7a3a2a, pants: 0x5a4030, boots: 0x3a2a20, tabard: 0xf0ece0 },
    chest: { type: 'shirt', sleeves: 1.3, neck: 'crew' }, apron: true, belt: { type: 'leather', buckle: 'square' }, legs: { type: 'pants' }, feet: { type: 'shoes', height: 0.3 } }),
  guard: preset({ armor: 'plate', tier: 1, colors: { primary: 0x8c96a2, secondary: 0x2a4a8a, trim: 0xc8a048, pants: 0x2a3a6a, boots: 0x5a5e66, tabard: 0x2a4a8a, emblem: 0xe8c050 },
    head: { type: 'helm' }, chest: { type: 'plate', sleeves: 1.2, sleeveType: 'mail', neck: 'high' }, tabard: { emblem: 'lion', back: true },
    shoulders: { type: 'plate', size: 1.0, layers: 1 }, belt: { type: 'leather', buckle: 'plate' }, legs: { type: 'mail', kneepads: true },
    feet: { type: 'plate', height: 0.6 }, hands: { type: 'gauntlets', cuff: 0.4 }, mainHand: { type: 'sword1h', tier: 1 }, offHand: { type: 'shield', emblem: 'lion', tier: 1 } }),
  marshal: preset({ armor: 'plate', tier: 2, colors: { primary: 0xa4aeb8, secondary: 0x1e3a7a, trim: 0xe8c050, pants: 0x1e3a7a, boots: 0x9aa2aa, tabard: 0x1e3a7a, emblem: 0xf0c850, cape: 0x1e3a7a, capeInner: 0xe8c050 },
    chest: { type: 'plate', sleeves: 1.6, neck: 'high' }, tabard: { emblem: 'lion', back: false }, shoulders: { type: 'plate', size: 1.25, layers: 2, gem: true },
    belt: { type: 'plate', buckle: 'gem' }, legs: { type: 'plate', kneepads: true }, feet: { type: 'plate', height: 0.7, cuff: true },
    hands: { type: 'gauntlets', cuff: 0.45 }, cloak: { len: 0.88, trim: true, emblem: 'lion' }, mainHand: { type: 'sword1h', tier: 2 } }),
  archmage: preset({ armor: 'cloth', tier: 2, glow: 0x80b0ff, colors: { primary: 0x4a2a7a, secondary: 0xe0c060, trim: 0xe8c860, pants: 0x3a2060, boots: 0x3a2060, hood: 0x4a2a7a, gem: 0x80c0ff },
    head: { type: 'wizard', glowTrim: true }, chest: { type: 'robe', sleeves: 1.98, neck: 'high' }, skirt: { len: 1.08, flare: 0.22, panel: true, hemTrim: true },
    shoulders: { type: 'cloth', size: 1.0 }, belt: { type: 'sash', buckle: 'gem' }, legs: { type: 'pants' }, feet: { type: 'shoes', height: 0.25 },
    mainHand: { type: 'staff', tier: 3, glow: true } }),
  bandit: preset({ armor: 'leather', tier: 0, colors: { primary: 0x5a4030, secondary: 0x9a2020, trim: 0x6a5040, pants: 0x3a3028, boots: 0x3a2a20, hood: 0xa02020, cape: 0x8a1c1c },
    head: { type: 'hood', mask: true }, chest: { type: 'leather', sleeves: 0.8, neck: 'v', straps: true }, belt: { type: 'leather', buckle: 'square', pouches: 2 },
    legs: { type: 'leather' }, feet: { type: 'boots', height: 0.6 }, hands: { type: 'wraps', cuff: 0.3 }, cloak: { len: 0.55 },
    mainHand: { type: 'sword1h', tier: 0 }, offHand: { type: 'dagger', tier: 0 } }),
};
export const GEAR_PRESETS = { warrior: W, paladin: PA, mage: MA, priest: PR, rogue: RO, hunter: HU, npc: NPC };

/** Resolve a gear argument: spec object | 'warrior:2' | 'npc:farmer' | 'farmer' | undefined (class default). */
export function resolveGear(gear, cls = 'warrior') {
  if (!gear) gear = cls === 'npc' ? NPC.villager : (GEAR_PRESETS[cls] || W)[1];
  if (typeof gear === 'string') {
    const [a, b] = gear.split(':');
    if (a === 'npc' || NPC[a]) gear = NPC[b || a] || NPC.villager;
    else gear = (GEAR_PRESETS[a] || W)[clamp(Number(b ?? 1), 0, 3)];
  }
  return JSON.parse(JSON.stringify(gear));
}

// ---------------------------------------------------------------------------------------------
// Palette
const mat = (hex, spec, det, emis = 0) => ({ c: linColor(hex), spec, det, emis, cast: 0 });
export function buildPalette(g, app) {
  const col = g.colors || {};
  const pal = new Array(NSLOT);
  const armorDet = { plate: DET.plate, mail: DET.mail, leather: DET.leather, cloth: DET.cloth }[g.armor] || DET.cloth;
  const armorSpec = { plate: 0.85, mail: 0.55, leather: 0.1, cloth: 0.0 }[g.armor] ?? 0;
  const prim = col.primary ?? 0x888888;
  for (let i = 0; i < NSLOT; i++) pal[i] = mat(0x808080, 0, DET.none);
  pal[SLOT.SKIN] = mat(app.skin, 0.05, DET.skin);
  pal[SLOT.HAIR] = mat(app.hairColor, 0.18, DET.hair);
  pal[SLOT.LEATHER] = mat(col.leather ?? C.leather, 0.12, DET.leather);
  pal[SLOT.CLOTH1] = mat(col.primary ?? 0x8a8a8a, 0.0, DET.cloth);
  pal[SLOT.CLOTH2] = mat(col.secondary ?? 0x5a5a5a, 0.0, DET.cloth);
  pal[SLOT.ARMOR1] = mat(prim, armorSpec, armorDet);
  pal[SLOT.ARMOR2] = mat(col.secondary ?? C.leather, g.armor === 'plate' ? 0.5 : 0.1, g.armor === 'plate' ? DET.plate : DET.leather);
  pal[SLOT.TRIM] = mat(col.trim ?? C.gold, 1.0, DET.plate, 0);
  pal[SLOT.METAL] = mat(col.metal ?? C.iron, 0.9, DET.plate);
  pal[SLOT.GEM] = mat(col.gem ?? g.glow ?? 0x60a0ff, 1.0, DET.none, 0.9);
  pal[SLOT.WOOD] = mat(C.wood, 0.05, DET.wood);
  pal[SLOT.DARK] = mat(0x1a1614, 0.1, DET.none);
  pal[SLOT.FUR] = mat(col.fur ?? C.fur, 0.0, DET.fur);
  pal[SLOT.BONE] = mat(0xe8dcc0, 0.25, DET.none);
  pal[SLOT.GLOW] = mat(g.glow ?? 0xffc060, 0, DET.none, 1);
  pal[SLOT.CAPE1] = mat(col.cape ?? col.secondary ?? prim, 0.0, DET.cloth);
  pal[SLOT.CAPE2] = mat(col.capeInner ?? 0x2a2a2a, 0.0, DET.cloth);
  pal[SLOT.EMBLEM] = mat(col.emblem ?? col.trim ?? C.gold, 0.8, DET.none, g.tier >= 3 ? 0.25 : 0);
  pal[SLOT.BELT] = mat(col.belt ?? (g.armor === 'plate' ? C.darkLeather : C.darkLeather), 0.15, DET.leather);
  pal[SLOT.BOOT] = mat(col.boots ?? C.darkLeather, g.feet?.type === 'plate' ? 0.8 : 0.12, g.feet?.type === 'plate' ? DET.plate : DET.leather);
  pal[SLOT.GLOVE] = mat(col.gloves ?? (g.hands?.type === 'gauntlets' ? prim : C.leather), g.hands?.type === 'gauntlets' ? armorSpec : 0.12, g.hands?.type === 'gauntlets' ? armorDet : DET.leather);
  pal[SLOT.PANTS] = mat(col.pants ?? 0x5a4a3a, g.legs?.type === 'plate' ? 0.8 : g.legs?.type === 'mail' ? 0.5 : g.legs?.type === 'leather' ? 0.12 : 0,
    g.legs?.type === 'plate' ? DET.plate : g.legs?.type === 'mail' ? DET.mail : g.legs?.type === 'leather' ? DET.leather : DET.cloth);
  pal[SLOT.SHIRT] = mat(col.shirt ?? C.linen, 0, DET.cloth);
  pal[SLOT.TABARD] = mat(col.tabard ?? col.secondary ?? 0x2a4a8a, 0, DET.cloth);
  pal[SLOT.HOOD] = mat(col.hood ?? col.primary ?? 0x5a5a5a, 0, DET.cloth);
  pal[SLOT.STRAW] = mat(0xd8b860, 0.05, DET.wood);
  pal[SLOT.LINEN] = mat(0xb8a484, 0, DET.cloth);
  pal[SLOT.BLADE] = mat(0xc8d0d8, 1.0, DET.plate);
  pal[SLOT.HILT] = mat(C.darkLeather, 0.1, DET.leather);
  pal[SLOT.SKIN2] = mat(app.skin, 0.05, DET.skin);
  // keep lit albedo below the bloom threshold under the strong sun (HDR pipeline): soft-cap bright colours
  for (let i = 0; i < NSLOT; i++) {
    if (i === SLOT.GEM || i === SLOT.GLOW) continue;
    const c = pal[i].c;
    for (let k = 0; k < 3; k++) { const v = c[k]; c[k] = v < 0.45 ? v : 0.45 + (v - 0.45) * 0.45; }
  }
  return pal;
}

// ---------------------------------------------------------------------------------------------
// Body painting
const GARMENT_OFF = { cloth: 0.0045, shirt: 0.004, tunic: 0.006, robe: 0.006, rags: 0.004, vest: 0.007, leather: 0.008, mail: 0.01, plate: 0.015, pants: 0.004 };

/** returns per-piece overrides { body:{slot,mul,off}, head:{..., keepTri}, handL, handR } */
export function paintBody(base, g) {
  const J = base.JJ.J, P = base.P;
  const legScale = base.JJ.legLen / 0.87;
  const waistY = J.spine[1] - 0.03;
  const neckY = J.neck[1] - 0.025;
  const chest = g.chest || { type: 'shirt', sleeves: 1 };
  const ct = chest.type;
  const isRobe = ct === 'robe';
  const chestBottom = isRobe ? -1 : (ct === 'tunic' || ct === 'shirt' || ct === 'rags') ? J.hips[1] - 0.06 * legScale : waistY - 0.035;
  const sleeves = chest.sleeves ?? 1;
  const bootTop = 2 - (g.feet?.height ?? 0.4) * 0.95;
  const gloveCuff = g.hands ? 2 - (g.hands.cuff ?? 0.3) : 9;
  const gloves = g.hands?.type;
  const neck = chest.neck || 'crew';
  const tier = g.tier || 0;
  const out = {};
  const armorSlot = ct === 'plate' || ct === 'mail' || ct === 'leather' ? SLOT.ARMOR1 : (ct === 'robe' || ct === 'tunic' || ct === 'vest') ? SLOT.CLOTH1 : ct === 'shirt' ? SLOT.CLOTH1 : SLOT.CLOTH1;
  const sleeveType = chest.sleeveType || ct;
  const legType = g.legs?.type || 'pants';
  for (const key of ['body', 'handL', 'handR', 'head']) {
    const pc = base.pieces[key];
    const n = pc.n;
    const slot = new Uint8Array(pc.slot), mul = new Float32Array(pc.mul), off = new Float32Array(n);
    for (let v = 0; v < n; v++) {
      const ch = pc.chain[v], c = pc.coord[v], a = pc.ang[v];
      const x = pc.pos[v * 3], y = pc.pos[v * 3 + 1], z = pc.pos[v * 3 + 2];
      const ny = pc.nrm[v * 3 + 1];
      let s = SLOT.SKIN, o = 0, f = 1, tint = null;
      if (ch === CH_TORSO) {
        const vd = neck === 'v' ? 0.09 * Math.pow(Math.max(0, Math.cos(a)), 4) : 0;
        const nl = neck === 'high' ? neckY + 0.05 : neckY - vd;
        if (y > nl) { s = SLOT.SKIN; }
        else if (y > chestBottom) {
          s = armorSlot; o = GARMENT_OFF[ct] ?? 0.005;
          const edgeB = y - chestBottom, edgeT = nl - y;
          f = garmentShade(ct, x, y, z, a, ny, edgeT, edgeB, J, tier);
        } else {
          s = SLOT.PANTS; o = GARMENT_OFF[legType] ?? 0.004; f = pantsShade(legType, x, y, z, a, ny);
          if (isRobe) { s = SLOT.CLOTH1; o = 0.006; }
        }
      } else if (ch === CH_ARM_L || ch === CH_ARM_R || ch === CH_HAND_L || ch === CH_HAND_R) {
        const isHand = ch === CH_HAND_L || ch === CH_HAND_R || c > 2.02;
        if ((gloves && c >= gloveCuff) || (gloves && isHand)) {
          s = SLOT.GLOVE; o = gloves === 'gauntlets' ? 0.009 : 0.004;
          f = 0.95 + 0.1 * ny;
          if (gloves === 'wraps') { f *= 0.85 + 0.2 * Math.abs(Math.sin(c * 55)); s = SLOT.LINEN; }
          if (gloves === 'bracers' && isHand) { s = SLOT.SKIN; o = 0; f = 1; }
          if (gloves === 'gauntlets' && isHand && c > 2.3) f *= 0.9 + 0.2 * Math.abs(Math.sin(c * 30));
        } else if (c < sleeves && !isHand) {
          const st = sleeveType;
          s = st === 'plate' ? SLOT.ARMOR1 : st === 'mail' ? SLOT.ARMOR1 : st === 'leather' ? SLOT.ARMOR1 : SLOT.CLOTH1;
          if (chest.sleeveType === 'mail') s = SLOT.ARMOR2;
          o = GARMENT_OFF[st] ?? 0.005;
          f = garmentShade(st, x, y, z, a, ny, 1, 1, J, tier);
          if (st === 'plate') f *= 0.92 + 0.14 * Math.max(0, Math.cos(a)) + 0.1 * Math.max(0, ny);
          if (isRobe && c > sleeves - 0.35) { o += (c - (sleeves - 0.35)) * 0.06; } // bell sleeves
        } else if (!isHand && chest.sleeves < 1.9 && ct !== 'robe' && g.armor !== 'cloth' && c < 2 && c > sleeves && (ct === 'plate' || ct === 'mail')) {
          s = SLOT.SHIRT; o = 0.003;
        }
      } else if (ch === CH_LEG_L || ch === CH_LEG_R) {
        if (c >= bootTop) {
          s = SLOT.BOOT; o = g.feet?.type === 'plate' ? 0.012 : 0.008;
          f = 0.92 + 0.12 * ny - (c > 2.0 ? 0.05 : 0);
          if (c > 2.55 && y < 0.035) f *= 0.55; // sole edge
          if (g.feet?.type === 'wraps') { s = SLOT.LINEN; f *= 0.85 + 0.2 * Math.abs(Math.sin(c * 50)); }
          if (g.feet?.type === 'plate' && Math.abs(c - 2.0) < 0.08) s = SLOT.ARMOR2;
        } else {
          s = SLOT.PANTS; o = GARMENT_OFF[legType] ?? 0.004;
          f = pantsShade(legType, x, y, z, a, ny);
          if (legType === 'plate' && c > 0.13) { s = SLOT.ARMOR1; o = 0.012; f *= 0.9 + 0.14 * Math.max(0, Math.cos(a)) + 0.1 * Math.max(0, ny); }
          if (isRobe) { s = SLOT.PANTS; }
        }
      } else if (ch === CH_HEAD) {
        s = SLOT.SKIN;
      }
      if (s !== SLOT.SKIN) {
        slot[v] = s; off[v] = o;
        // hand-painted variation: soft blotches + top light + darker undersides
        const bl = NZ.noise2(x * 7.3 + z * 3.1, y * 5.7) * 0.5 + NZ.noise2(x * 19 + 4, y * 17 - z * 11) * 0.25;
        f *= (1 + bl * 0.16) * (0.9 + 0.2 * Math.max(0, ny)) * (1 - 0.12 * Math.max(0, -ny));
        mul[v * 3] *= f; mul[v * 3 + 1] *= f; mul[v * 3 + 2] *= f;
        // garments don't need the skin's warm crevice tint; neutralise it
        const avg = (mul[v * 3] + mul[v * 3 + 1] + mul[v * 3 + 2]) / 3;
        mul[v * 3] = lerp(mul[v * 3], avg, 0.8); mul[v * 3 + 1] = lerp(mul[v * 3 + 1], avg, 0.8); mul[v * 3 + 2] = lerp(mul[v * 3 + 2], avg, 0.8);
      }
    }
    out[key] = { slot, mul, off };
  }
  // head visibility under helmets
  const ht = g.head?.type;
  if (ht === 'greathelm' || ht === 'horned' || ht === 'winged') {
    const pc = base.pieces.head, keep = new Uint8Array(pc.idx.length / 3);
    const Hy = J.head[1];
    for (let t = 0; t < keep.length; t++) {
      let vis = false;
      for (let k = 0; k < 3; k++) { const v = pc.idx[t * 3 + k]; if (pc.pos[v * 3 + 1] < Hy - 0.07 * P.headDef.s) vis = true; }
      keep[t] = vis ? 1 : 0;
    }
    out.head.keepTri = keep;
  }
  return out;
}

function garmentShade(type, x, y, z, a, ny, edgeT, edgeB, J, tier) {
  let f = 1;
  const n = NZ.noise2(x * 9 + a, y * 7) * 0.5;
  switch (type) {
    case 'plate': {
      f = 0.78 + 0.34 * Math.max(0, ny) + 0.12 * Math.max(0, Math.cos(a)) - 0.22 * smoothstep(0.07, 0, Math.min(edgeT, edgeB));
      if (y > J.chest[1] + 0.05 && z < 0) f *= 1.06 + 0.08 * Math.max(0, -Math.sin(a * 2) * 0); // chest plate sheen
      break;
    }
    case 'mail': f = 0.92 + 0.12 * ny + 0.06 * n; break;
    case 'leather': {
      f = 0.9 + 0.12 * ny + 0.1 * n;
      if (Math.abs(Math.abs(a) - Math.PI / 2) < 0.07) f *= 0.65; // side seams
      if (Math.abs(x) < 0.01 && z < 0) f *= 0.75; // front lacing
      break;
    }
    case 'robe': case 'tunic': case 'shirt': case 'cloth': case 'vest': case 'rags': {
      f = 0.9 + 0.1 * ny + 0.1 * Math.sin(a * 7 + y * 9 + n * 2) * 0.6;
      if (type === 'rags') f *= 0.85 + 0.3 * Math.max(0, n);
      break;
    }
    default: f = 1;
  }
  return f;
}
function pantsShade(type, x, y, z, a, ny) {
  const n = NZ.noise2(x * 11 + 3, y * 6);
  if (type === 'mail') return 0.9 + 0.1 * ny + 0.05 * n;
  if (type === 'leather') return 0.88 + 0.1 * ny + 0.1 * n;
  if (type === 'plate') return 0.9 + 0.15 * ny;
  return 0.88 + 0.1 * ny + 0.08 * Math.sin(a * 5 + y * 20) + 0.04 * n;
}
