// Colour slots: cached geometry stores a slot id + an rgb multiplier per vertex; the final vertex colour is
// palette[slot].color * mul. Each slot also carries material properties (spec, emissive, detail channel).
export const SLOT = {
  SKIN: 0, HAIR: 1, LEATHER: 2, CLOTH1: 3, CLOTH2: 4, ARMOR1: 5, ARMOR2: 6, TRIM: 7, METAL: 8,
  GEM: 9, WOOD: 10, DARK: 11, FUR: 12, BONE: 13, GLOW: 14, CAPE1: 15, CAPE2: 16, EMBLEM: 17,
  SKIN2: 18, STRAW: 19, LINEN: 20, BELT: 21, BOOT: 22, GLOVE: 23, PANTS: 24, SHIRT: 25, TABARD: 26, HOOD: 27,
  LIP: 28, BLADE: 29, HILT: 30, EYE: 31,
};
export const NSLOT = 32;

// detail channels in the tiling detail texture: 0 mail, 1 leather, 2 cloth, 3 metal/hair streaks
export const DET = {
  none: [0, 0, 0, 0], mail: [0.85, 0, 0, 0.05], leather: [0, 0.55, 0, 0], cloth: [0, 0, 0.45, 0], plate: [0, 0.08, 0, 0.12],
  hair: [0, 0, 0, 0.7], wood: [0, 0.4, 0, 0.35], skin: [0, 0.08, 0, 0], fur: [0, 0.3, 0.3, 0.5],
};
