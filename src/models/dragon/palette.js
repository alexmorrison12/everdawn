// Element palettes (sRGB hex) and shape styles. Same rig; colours + horn/spike/crest/tail styles differ.
export const ELEMENTS = {
  ember: {
    back: 0x170505, flank: 0x6a0f0b, belly: 0x7e3418, plate: 0x80502c, plateEdge: 0x2a1006, stripe: 0x080203,
    limb: 0x140504, horn: 0x141010, hornTip: 0xa89480, claw: 0x100c0b, clawTip: 0x9a8a78, tooth: 0xf0e2c2, toothBase: 0x9a7a52,
    membrane: 0x5e120e, membraneUnder: 0xa23c1c, membraneEdge: 0x1c0605, mouth: 0x360806, tongue: 0x862a24,
    glow: 0xff5a10, eye: 0xffb830, spike: 0x1a1210, spikeTip: 0x8a6a50,
    style: { horn: 'swept', spike: 'blade', crest: 'spikes', cheek: 'spikes', tail: 'spade', tatter: 0, brow: 1.0, frill: 0, crystal: 0 },
  },
  frost: {
    back: 0x3a5f86, flank: 0x9cbede, belly: 0xe4f0f8, plate: 0xcfe4f2, plateEdge: 0x5e84a8, stripe: 0x24406a,
    limb: 0x243e5e, horn: 0xc6d8e6, hornTip: 0xf4fbff, claw: 0x243444, clawTip: 0xd4eaf4, tooth: 0xf4fbff, toothBase: 0x9ab8cc,
    membrane: 0x5e8ebc, membraneUnder: 0xb2d4ee, membraneEdge: 0x22406a, mouth: 0x16304e, tongue: 0x355e80,
    glow: 0x3fdcff, eye: 0xb8faff, spike: 0x7fd4f4, spikeTip: 0xe8fcff,
    glowK: 0.75, style: { horn: 'long', spike: 'crystal', crest: 'crystal', cheek: 'crystal', tail: 'crystal', tatter: 0, brow: 1.1, frill: 0, crystal: 1 },
  },
  venom: {
    back: 0x0a1e0e, flank: 0x185a2a, belly: 0x86a036, plate: 0x96a846, plateEdge: 0x28380e, stripe: 0x040e05,
    limb: 0x08160a, horn: 0x18180e, hornTip: 0x9aa468, claw: 0x10120a, clawTip: 0x8a9460, tooth: 0xeef0cc, toothBase: 0x7a8248,
    membrane: 0x17522a, membraneUnder: 0x62983a, membraneEdge: 0x051408, mouth: 0x223208, tongue: 0x62842a,
    glow: 0x8cff1e, eye: 0xe4ff3c, spike: 0x141a0c, spikeTip: 0xa4c050, frillCol: 0x2e8a3c, frillSpot: 0xd2ea44,
    style: { horn: 'hook', spike: 'hook', crest: 'frill', cheek: 'frill', tail: 'stinger', tatter: 0, brow: 0.95, frill: 1, crystal: 0 },
  },
  storm: {
    back: 0x13123a, flank: 0x2b2c80, belly: 0x6f74b4, plate: 0x8588c6, plateEdge: 0x1c1c58, stripe: 0x070720,
    limb: 0x0e1034, horn: 0x1a1a2e, hornTip: 0xc8d2ff, claw: 0x12121e, clawTip: 0xa0a8d0, tooth: 0xf0f0ff, toothBase: 0x8a8ab0,
    membrane: 0x1f2a70, membraneUnder: 0x5262b8, membraneEdge: 0x0a0e2c, mouth: 0x180e3a, tongue: 0x55358a,
    glow: 0xb06aff, eye: 0xeadcff, spike: 0x1c1c34, spikeTip: 0xb8c4ff,
    style: { horn: 'jag', spike: 'tall', crest: 'crown', cheek: 'spikes', tail: 'fork', tatter: 0, brow: 1.05, frill: 0, crystal: 0 },
  },
  shadow: {
    back: 0x0c0a10, flank: 0x2c1b40, belly: 0x5a4270, plate: 0x4a3a5c, plateEdge: 0x120c1a, stripe: 0x040306,
    limb: 0x08060c, horn: 0x100e14, hornTip: 0x5e5070, claw: 0x0a080e, clawTip: 0x6a5c7a, tooth: 0xe6e0ee, toothBase: 0x6a5a78,
    membrane: 0x1a1026, membraneUnder: 0x3a2452, membraneEdge: 0x040306, mouth: 0x180822, tongue: 0x4a2a5a,
    glow: 0xb42cff, eye: 0xff3ee6, spike: 0x120e16, spikeTip: 0x6a5a82,
    style: { horn: 'spiral', spike: 'jagged', crest: 'spikes', cheek: 'spikes', tail: 'scythe', tatter: 1, brow: 1.15, frill: 0, crystal: 0 },
  },
};

export const ELEMENT_NAMES = Object.keys(ELEMENTS);
