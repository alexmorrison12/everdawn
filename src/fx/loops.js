// Looping effects for fx.attach(name, object3D | Vector3, opts). Recipe = { init(h), tick(h, dt), end(h), maxDist, fade }.
// h.pos is the followed world position (object origin + opts.offset in the object's local space). Character-centred
// loops (shield, renew, burning, frozen, poisoned, enrage, whirlwind, ghostAura) assume the origin is at the FEET.
// World particles spawn at sub-frame interpolated positions so moving emitters leave continuous trails; "held"
// particles are owned by the handle and follow its anchor.
import * as THREE from 'three';
import { S, R } from './textures.js';
import { P, lin, FIRE, FROST, ARC, SHD, HOLY, NAT, STORM, POI, PHYS, MISC } from './presets.js';

const TAU = Math.PI * 2;

// ------------------------------------------------------------------ presets local to loops
const L = {
  handGlow: P({ sprite: S.glow, ramp: R.wPulse, life: 0.9, size: 0.95, i: 1.7, noGround: true }),
  handHalo: P({ sprite: S.glow, ramp: R.wPulse, life: 1.3, size: 1.9, i: 0.55, pingpong: true, noGround: true }),
  handCore: P({ sprite: S.flash, ramp: R.wPulse, life: 0.6, size: 0.42, i: 2.6, noGround: true }),
  orbitMote: P({ sprite: S.dot, ramp: R.wInOut, life: [0.45, 0.7], size: [0.06, 0.09], end: 0.4, motion: 'orbit', rise: 0.25, rgrow: -0.3, i: [4, 6], noGround: true }),
  castFlame: P({ sprite: [S.flame1, S.flame2], ramp: R.fire, life: [0.3, 0.5], size: [0.16, 0.26], end: 0.3, rot: [-0.2, 0.2], drag: 2, accY: 2.5, turb: 0.05, i: [2.5, 3.5], noGround: true }),
  castFlake: P({ sprite: S.snow, ramp: R.frostCore, life: [0.4, 0.7], size: [0.06, 0.1], end: 0.5, spin: [-3, 3], drag: 2, accY: -0.4, turb: 0.08, i: [2, 3], noGround: true }),
  castMist: P({ pool: 'alpha', sprite: [S.smoke1, S.smoke3], ramp: R.frostMist, life: [0.5, 0.8], size: [0.12, 0.2], end: 3, ease: 2, drag: 2, accY: -0.4, noGround: true }),
  castStar: P({ sprite: S.star, ramp: R.wInOut, life: [0.35, 0.6], size: [0.08, 0.14], end: 0.3, spin: [-3, 3], drag: 2, accY: 0.6, i: [3, 4.5], noGround: true }),
  castWisp: P({ sprite: [S.wisp, S.swirl], ramp: R.shadow, life: [0.35, 0.6], size: [0.2, 0.32], end: 1.2, spin: [-4, 4], randSpin: true, drag: 2, accY: 0.6, i: [2, 3], noGround: true }),
  castVoid: P({ pool: 'alpha', sprite: [S.smoke1, S.smoke2], ramp: R.void, life: [0.4, 0.7], size: [0.15, 0.22], end: 2.2, ease: 2, drag: 2, accY: 0.5, noGround: true }),
  castGlyph: P({ sprite: [S.glyph1, S.glyph2], ramp: R.wInOut, life: [0.5, 0.8], size: [0.12, 0.18], end: 0.7, spin: [-1.5, 1.5], motion: 'orbit', rise: 0.35, rgrow: 0.08, i: [2, 3], noGround: true }),
  // shield/renew/auras
  renewSpiral: P({ sprite: S.dot, ramp: R.wInOut, life: [1.3, 1.6], size: [0.06, 0.1], end: 0.6, motion: 'orbit', rise: 1.25, rgrow: 0, i: [3.5, 5.5] }),
  renewStar: P({ sprite: S.star, ramp: R.wInOut, life: [1.3, 1.6], size: [0.14, 0.2], end: 0.4, motion: 'orbit', rise: 1.25, spin: 2, i: [2.5, 3.5] }),
  auraFlat: P({ sprite: S.glow, ramp: R.wPulse, life: 1.4, size: 2.2, orient: 'flat', i: 1.1, pingpong: true }),
  burnFlame: P({ sprite: [S.flame1, S.flame2], ramp: R.fire, life: [0.4, 0.7], size: [0.35, 0.55], end: [0.3, 0.5], rot: [-0.2, 0.2], drag: 1.8, accY: 3.5, turb: 0.1, i: [1.7, 2.4] }),
  frostAura: P({ pool: 'alpha', sprite: [S.smoke1, S.smoke3], ramp: R.frostMist, life: [1.2, 1.8], size: [0.5, 0.8], end: 2, ease: 2, drag: 2, accY: -0.2, turb: 0.2 }),
  poisonBubble: P({ sprite: S.bubble, ramp: R.poison, life: [0.6, 1.0], size: [0.07, 0.13], end: 1.4, drag: 1.5, accY: 1.3, turb: 0.1, i: [1.8, 2.6] }),
  enrageFlame: P({ sprite: [S.flame1, S.flame2, S.wisp], ramp: R.enrage, life: [0.45, 0.7], size: [0.35, 0.6], end: 0.5, rot: [-0.25, 0.25], drag: 2, accY: 3, turb: 0.15, i: [1.8, 2.6] }),
  crescent: P({ sprite: S.crescent, ramp: R.wConst, life: 1, size: 3.2, orient: 'flat', color: [1, 0.95, 0.85], i: 1.6 }),
  windStreak: P({ sprite: S.spark, ramp: R.wInOut, life: [0.25, 0.4], size: [0.06, 0.1], orient: 'stretch', stretch: 0.25, color: [1, 1, 1], i: 1.6, alpha: 0.8 }),
  ghostGlow: P({ sprite: S.glow, ramp: R.wPulse, life: 2.2, size: 2.4, color: lin(0x9fdcff), i: 0.9, pingpong: true }),
  // fires
  torchFlame: P({ sprite: [S.flame1, S.flame2], ramp: R.fire, life: [0.28, 0.45], size: [0.22, 0.32], end: [0.3, 0.5], rot: [-0.15, 0.15], drag: 2, accY: 3, turb: 0.05, i: [1.8, 2.4] }),
  torchGlow: P({ sprite: S.glow, ramp: R.wPulse, life: 0.35, size: 1.1, color: [1, 0.5, 0.15], i: 1.2, pingpong: true, noGround: true }),
  candleFlame: P({ sprite: S.flame1, ramp: R.wPulse, life: 0.23, size: 0.13, rot: [-0.1, 0.1], color: [1, 0.62, 0.2], i: 3.5, pingpong: true, noGround: true }),
  candleGlow: P({ sprite: S.glow, ramp: R.wPulse, life: 0.31, size: 0.45, color: [1, 0.55, 0.18], i: 1.1, pingpong: true, noGround: true }),
  campFlame: P({ sprite: [S.flame1, S.flame2], ramp: R.fire, life: [0.55, 0.9], size: [0.6, 0.95], end: [0.25, 0.45], ease: 1.3, rot: [-0.2, 0.2], drag: 1.5, accY: 3.2, turb: 0.1, i: [1.5, 2.1] }),
  campBase: P({ sprite: [S.blob, S.flame2], ramp: R.fireCore, life: [0.3, 0.5], size: [0.5, 0.7], end: 0.6, spin: [-2, 2], drag: 2, accY: 1.5, i: [1.2, 1.6] }),
  campCore: P({ sprite: S.glow, ramp: R.wPulse, life: 0.5, size: 1.5, color: [1, 0.55, 0.18], i: 1.5, pingpong: true }),
  campGround: P({ sprite: S.glow, ramp: R.wPulse, life: 0.7, size: 5, orient: 'flat', color: [1, 0.45, 0.12], i: 0.55, pingpong: true }),
  chimney: P({ pool: 'alpha', sprite: [S.soft, S.plume, S.smoke3], ramp: R.smokeLight, life: [5, 7], size: [0.6, 0.9], end: [5, 7], ease: 1.5, spin: [-0.2, 0.2], drag: 0.6, accY: 0.15, turb: 0.8, color: [0.95, 0.95, 0.98], alpha: 0.75 }),
  mist: P({ pool: 'alpha', sprite: [S.smoke1, S.smoke2, S.smoke3], ramp: R.smokeLight, life: [2, 3], size: [1.2, 1.8], end: [2, 2.8], ease: 2, spin: [-0.3, 0.3], drag: 1.2, accY: 0.4, turb: 0.4, color: [1, 1.03, 1.08], alpha: 0.8 }),
  spray: P({ pool: 'alpha', sprite: S.drop, ramp: R.water, life: [0.5, 0.9], size: [0.05, 0.09], orient: 'stretch', stretch: 0.3, drag: 0.8, accY: -9, color: [0.95, 1, 1.05] }),
  // portal
  portalEmber: P({ sprite: S.ember, ramp: R.ember, life: [1.2, 1.8], size: [0.1, 0.18], end: 0.4, motion: 'orbitV', rise: 0, rgrow: -1.6, i: [4, 7] }),
  portalFlame: P({ sprite: [S.flame1, S.flame2, S.blob], ramp: R.fire, life: [0.5, 0.8], size: [0.7, 1.1], end: 0.4, rot: [-0.3, 0.3], drag: 1.5, accY: 3, turb: 0.2, i: [2.2, 3] }),
  portalWisp: P({ sprite: S.swirl, ramp: R.wPulse, life: 1.6, size: 4.5, end: 0.4, orient: 'plane', spin: 2.5, color: [1, 0.4, 0.08], i: 0.6 }),
  // volcano
  plume: P({ pool: 'alpha', sprite: [S.plume, S.smoke1, S.smoke2], ramp: R.plume, life: [22, 30], size: [24, 34], end: [4.5, 6], ease: 1.3, spin: [-0.04, 0.04], drag: 0.075, accY: 0.35, turb: 9, color: [1, 1, 1] }),
  plumeBase: P({ pool: 'alpha', sprite: [S.smoke1, S.smoke2, S.smoke3], ramp: R.fireSmokeWarm, life: [6, 9], size: [18, 26], end: [2, 2.6], ease: 1.5, spin: [-0.08, 0.08], drag: 0.2, accY: 0.3, turb: 4, alpha: 1.1 }),
  volcanoEmber: P({ sprite: S.glow, ramp: R.lava, life: [3, 5], size: [3, 5], end: 0.6, accY: -9, drag: 0.1, i: [2.5, 4], noGround: true }),
  craterGlow: P({ sprite: S.glow, ramp: R.wPulse, life: 3, size: 80, color: [1, 0.32, 0.07], i: 1.0, pingpong: true, noGround: true }),
};

const handCast = (ramp, extra) => ({
  maxDist: 90, fade: 0.2,
  init(h) {
    const t = h.tint;
    h.hold(L.handGlow, 0, 0, 0, { tint: t ? t : RAMPCOL[ramp].glow });
    h.hold(L.handHalo, 0, 0, 0, { tint: t ? t : RAMPCOL[ramp].glow });
    h.hold(L.handCore, 0, 0, 0, { tint: t ? t : RAMPCOL[ramp].core });
  },
  tick(h, dt) {
    const fx = h.fx, s = h.s;
    h.emit('orb', 40, () => fx.spawn(L.orbitMote, 0, fx.r(-0.12, 0.05) * s, 0, fx.r(0.28, 0.45) * s, fx.r(0, TAU), fx.r(5, 8) * (fx.rng.next() < 0.5 ? -1 : 1), { anchor: h.anchor, scale: s, tint: h.tint || RAMPCOL[ramp].mote }));
    extra(h, fx, s);
  },
});
const RAMPCOL = {
  fire: { glow: [1, 0.45, 0.12], core: [1, 0.75, 0.4], mote: [1, 0.6, 0.2] },
  frost: { glow: [0.35, 0.7, 1], core: [0.75, 0.92, 1], mote: [0.6, 0.85, 1] },
  holy: { glow: [1, 0.8, 0.35], core: [1, 0.95, 0.7], mote: [1, 0.85, 0.45] },
  shadow: { glow: [0.55, 0.2, 1], core: [0.8, 0.55, 1], mote: [0.7, 0.35, 1] },
  arcane: { glow: [0.8, 0.35, 1], core: [1, 0.75, 1], mote: [0.9, 0.5, 1] },
};

export const LOOPS = {
  castFire: handCast('fire', (h, fx, s) => {
    h.emit('fl', 26, (bt, x, y, z) => fx.spawn(L.castFlame, x + fx.r(-0.08, 0.08) * s, y + fx.r(-0.05, 0.05) * s, z + fx.r(-0.08, 0.08) * s, 0, fx.r(0.2, 0.6) * s, 0, { scale: s }));
    h.emit('em', 8, (bt, x, y, z) => fx.spawn(FIRE.emberFloat, x, y, z, fx.r(-0.6, 0.6), fx.r(0.5, 1.5), fx.r(-0.6, 0.6), { scale: s * 0.8 }));
  }),
  castFrost: handCast('frost', (h, fx, s) => {
    h.emit('fl', 14, (bt, x, y, z) => fx.spawn(L.castFlake, x + fx.r(-0.15, 0.15) * s, y + fx.r(-0.1, 0.1) * s, z + fx.r(-0.15, 0.15) * s, fx.r(-0.3, 0.3), fx.r(-0.2, 0.3), fx.r(-0.3, 0.3), { scale: s }));
    h.emit('mi', 10, (bt, x, y, z) => fx.spawn(L.castMist, x, y, z, fx.r(-0.3, 0.3), fx.r(-0.3, 0.1), fx.r(-0.3, 0.3), { scale: s }));
  }),
  castHoly: handCast('holy', (h, fx, s) => {
    h.emit('st', 12, (bt, x, y, z) => fx.spawn(L.castStar, x + fx.r(-0.15, 0.15) * s, y, z + fx.r(-0.15, 0.15) * s, 0, fx.r(0.2, 0.6), 0, { scale: s, tint: h.tint || [1, 0.85, 0.45] }));
    h.emit('mo', 10, (bt, x, y, z) => fx.spawn(HOLY.mote, x, y, z, fx.r(-0.3, 0.3), fx.r(0.2, 0.8), fx.r(-0.3, 0.3), { scale: s }));
  }),
  castShadow: handCast('shadow', (h, fx, s) => {
    h.emit('wi', 12, (bt, x, y, z) => fx.spawn(L.castWisp, x + fx.r(-0.1, 0.1) * s, y, z + fx.r(-0.1, 0.1) * s, 0, fx.r(0.2, 0.5), 0, { scale: s }));
    h.emit('vo', 12, (bt, x, y, z) => fx.spawn(L.castVoid, x, y, z, fx.r(-0.2, 0.2), fx.r(0, 0.4), fx.r(-0.2, 0.2), { scale: s }));
  }),
  castArcane: handCast('arcane', (h, fx, s) => {
    h.emit('st', 12, (bt, x, y, z) => fx.spawn(L.castStar, x + fx.r(-0.15, 0.15) * s, y, z + fx.r(-0.15, 0.15) * s, 0, fx.r(0.2, 0.6), 0, { scale: s, tint: [0.9, 0.5, 1] }));
    h.emit('gl', 4, () => fx.spawn(L.castGlyph, 0, fx.r(-0.1, 0.1) * s, 0, 0.3 * s, fx.r(0, TAU), 2.5, { anchor: h.anchor, scale: s, tint: [0.85, 0.45, 1] }));
  }),

  shield: {
    fade: 0.35,
    init(h) { h.offset = h.offset || new THREE.Vector3(0, 1.0, 0); h.readPos(h.pos); h.shield = h.fx.meshFx.shield(h, h.tint || lin(0xffd98a)); },
    tick(h) {
      const fx = h.fx, s = h.s;
      h.emit('sp', 6, () => { fx.rdir(_d); fx.spawn(SHIELD_SPARK, _d.x * 1.15 * s, _d.y * 1.15 * s, _d.z * 1.15 * s, 0, 0.3, 0, { anchor: h.anchor, scale: s, tint: h.tint }); });
    },
  },
  renew: {
    fade: 0.4,
    init(h) { h.hold(L.auraFlat, 0, 0.06, 0, { tint: h.tint || [1, 0.85, 0.45], scale: 0.7 }); },
    tick(h) {
      const fx = h.fx, s = h.s, T = h.tint || [1, 0.85, 0.45];
      h.emit('sp', 30, () => { const arm = (fx.rng.next() * 3) | 0; fx.spawn(L.renewSpiral, 0, 0.05, 0, 0.62 * s, arm * TAU / 3 + fx.time * 0.8, 3.2, { anchor: h.anchor, scale: s, tint: T }); });
      h.emit('st', 7, () => { const arm = (fx.rng.next() * 3) | 0; fx.spawn(L.renewStar, 0, 0.05, 0, 0.62 * s, arm * TAU / 3 + fx.time * 0.8, 3.2, { anchor: h.anchor, scale: s, tint: T }); });
    },
  },
  burning: {
    fade: 0.3,
    init(h) { h.hold(BURN_GLOW, 0, 1.0 * h.s, 0); },
    tick(h) {
      const fx = h.fx, s = h.s;
      h.emit('fl', 55, (bt, x, y, z) => { const a = fx.r(0, TAU), r = fx.r(0.38, 0.55) * s; fx.spawn(L.burnFlame, x + Math.cos(a) * r, y + fx.r(0.1, 1.7) * s, z + Math.sin(a) * r, Math.cos(a) * 0.3, fx.r(0.5, 1.2) * s, Math.sin(a) * 0.3, { scale: s }); });
      h.emit('em', 12, (bt, x, y, z) => { const a = fx.r(0, TAU); fx.spawn(FIRE.emberFloat, x + Math.cos(a) * 0.5 * s, y + fx.r(0.5, 1.8) * s, z + Math.sin(a) * 0.5 * s, 0, fx.r(1, 2), 0, { scale: s }); });
      h.emit('sm', 6, (bt, x, y, z) => fx.spawn(FIRE.smoke, x, y + fx.r(1.5, 2.1) * s, z, 0, fx.r(0.5, 1), 0, { scale: s * 0.8 }));
    },
  },
  frozen: {
    fade: 0.25,
    init(h) {
      const fx = h.fx, s = h.s, p = h.pos;
      h.spikes = fx.meshFx.iceBlock(p.x, fx.heightAt(p.x, p.z), p.z, s);
      h.hold(ICE_GLOW, 0, 0.9 * s, 0);
    },
    tick(h) {
      const fx = h.fx, s = h.s;
      h.emit('mi', 5, (bt, x, y, z) => fx.spawn(L.frostAura, x + fx.r(-0.5, 0.5) * s, y + fx.r(0, 1.2) * s, z + fx.r(-0.5, 0.5) * s, 0, 0, 0, { scale: s }));
      h.emit('sp', 6, (bt, x, y, z) => fx.spawn(FROST.sparkle, x + fx.r(-0.6, 0.6) * s, y + fx.r(0.2, 1.8) * s, z + fx.r(-0.6, 0.6) * s, 0, 0, 0, { scale: s }));
      h.emit('fl', 4, (bt, x, y, z) => fx.spawn(FROST.flake, x + fx.r(-0.6, 0.6) * s, y + fx.r(1, 2) * s, z + fx.r(-0.6, 0.6) * s, 0, -0.2, 0, { scale: s }));
    },
    end(h) {
      const fx = h.fx, p = h.pos;
      fx.meshFx.kill(h.spikes);
      fx.burst('frostImpact', new THREE.Vector3(p.x, p.y + 0.8 * h.s, p.z), { scale: 0.8 * h.s });
    },
  },
  poisoned: {
    fade: 0.3,
    init(h) { h.hold(L.auraFlat, 0, 0.06, 0, { tint: [0.4, 1, 0.2], scale: 0.6 }); },
    tick(h) {
      const fx = h.fx, s = h.s;
      h.emit('bu', 16, (bt, x, y, z) => { const a = fx.r(0, TAU), r = fx.r(0.4, 0.55) * s; fx.spawn(L.poisonBubble, x + Math.cos(a) * r, y + fx.r(0.3, 1.7) * s, z + Math.sin(a) * r, 0, fx.r(0.2, 0.5), 0, { scale: s }); });
      h.emit('dr', 5, (bt, x, y, z) => { const a = fx.r(0, TAU), r = 0.45 * s; fx.spawn(POI.drip, x + Math.cos(a) * r, y + fx.r(0.6, 1.4) * s, z + Math.sin(a) * r, 0, 0, 0, { scale: s }); });
      h.emit('mi', 5, (bt, x, y, z) => { const a = fx.r(0, TAU), r = 0.5 * s; fx.spawn(POI.mist, x + Math.cos(a) * r, y + fx.r(0.2, 1.4) * s, z + Math.sin(a) * r, 0, 0.2, 0, { scale: s * 0.8 }); });
    },
  },
  enrage: {
    fade: 0.4,
    init(h) { h.hold(L.auraFlat, 0, 0.06, 0, { tint: [1, 0.15, 0.08], scale: 1.1 }); h.hold(ENRAGE_GLOW, 0, 1.1 * h.s, 0); },
    tick(h) {
      const fx = h.fx, s = h.s;
      h.emit('fl', 34, (bt, x, y, z) => { const a = fx.r(0, TAU), r = fx.r(0.42, 0.65) * s; fx.spawn(L.enrageFlame, x + Math.cos(a) * r, y + fx.r(0, 1.4) * s, z + Math.sin(a) * r, 0, fx.r(0.5, 1.5) * s, 0, { scale: s }); });
      h.emit('sp', 10, (bt, x, y, z) => fx.spawn(FIRE.emberFloat, x + fx.r(-0.5, 0.5) * s, y + fx.r(0.2, 1.8) * s, z + fx.r(-0.5, 0.5) * s, 0, fx.r(1, 2), 0, { scale: s, tint: [1, 0.35, 0.25] }));
    },
  },
  whirlwind: {
    fade: 0.2,
    init(h) {
      const s = h.s;
      h.hold(L.crescent, 0, 0.75 * s, 0, { spin: -15, rot: 0 });
      h.hold(L.crescent, 0, 1.05 * s, 0, { spin: -15, rot: 2.1, scale: 0.9 });
      h.hold(L.crescent, 0, 1.35 * s, 0, { spin: -15, rot: 4.2, scale: 0.75 });
    },
    tick(h) {
      const fx = h.fx, s = h.s;
      h.emit('du', 26, (bt, x, y, z) => { const a = fx.r(0, TAU); fx.spawn(PHYS.dust, x + Math.cos(a) * 1.2 * s, y + 0.2, z + Math.sin(a) * 1.2 * s, -Math.sin(a) * 4 * s + Math.cos(a) * 1.5, fx.r(0.2, 0.8), Math.cos(a) * 4 * s + Math.sin(a) * 1.5, { scale: s * 0.8 }); });
      h.emit('ws', 30, (bt, x, y, z) => { const a = fx.r(0, TAU), r = fx.r(1.1, 1.6) * s; fx.spawn(L.windStreak, x + Math.cos(a) * r, y + fx.r(0.3, 1.6) * s, z + Math.sin(a) * r, Math.sin(a) * 9 * s, 0, -Math.cos(a) * 9 * s, { scale: s }); });
    },
  },
  torch: {
    maxDist: 120,
    init(h) { h.hold(L.torchGlow, 0, 0.15 * h.s, 0); },
    tick(h) {
      const fx = h.fx, s = h.s;
      h.emit('fl', 20, (bt, x, y, z) => fx.spawn(L.torchFlame, x + fx.r(-0.05, 0.05) * s, y, z + fx.r(-0.05, 0.05) * s, 0, fx.r(0.3, 0.7) * s, 0, { scale: s }));
      h.emit('em', 3, (bt, x, y, z) => fx.spawn(FIRE.emberFloat, x, y + 0.2 * s, z, fx.r(-0.4, 0.4), fx.r(0.8, 1.6), fx.r(-0.4, 0.4), { scale: s * 0.7 }));
      h.emit('sm', 2, (bt, x, y, z) => fx.spawn(FIRE.smoke, x, y + 0.45 * s, z, 0, 0.6, 0, { scale: s * 0.35 }));
    },
  },
  candle: { // held-only: zero spawn cost per frame (dozens of kobold helmets)
    maxDist: 80,
    init(h) {
      const s = h.s;
      h.hold(L.candleFlame, 0, 0.05 * s, 0, { rot: 0 });
      h.hold(L.candleGlow, 0, 0.05 * s, 0);
    },
  },
  campfire: {
    maxDist: 160,
    init(h) {
      const s = h.s;
      h.hold(L.campCore, 0, 0.45 * s, 0);
      h.hold(L.campGround, 0, 0.05, 0);
    },
    tick(h) {
      const fx = h.fx, s = h.s;
      h.emit('fl', 44, (bt, x, y, z) => { const a = fx.r(0, TAU), r = fx.r(0, 0.45) * s; fx.spawn(L.campFlame, x + Math.cos(a) * r, y + 0.15 * s, z + Math.sin(a) * r, -Math.cos(a) * 0.3, fx.r(0.4, 1.0) * s, -Math.sin(a) * 0.3, { scale: s }); });
      h.emit('fb', 20, (bt, x, y, z) => { const a = fx.r(0, TAU), r = fx.r(0, 0.35) * s; fx.spawn(L.campBase, x + Math.cos(a) * r, y + 0.2 * s, z + Math.sin(a) * r, 0, fx.r(0.2, 0.6) * s, 0, { scale: s }); });
      h.emit('em', 9, (bt, x, y, z) => fx.spawn(FIRE.emberFloat, x + fx.r(-0.3, 0.3) * s, y + 0.5 * s, z + fx.r(-0.3, 0.3) * s, fx.r(-0.5, 0.5), fx.r(1.5, 3), fx.r(-0.5, 0.5), { scale: s }));
      h.emit('sm', 3.5, (bt, x, y, z) => fx.spawn(FIRE.smoke, x, y + 1.3 * s, z, fx.r(-0.2, 0.2), fx.r(0.6, 1), fx.r(-0.2, 0.2), { scale: s * 0.8, life: 2 }));
      if (fx.rng.next() < 0.02 * h.intensity) for (let i = 0; i < 6; i++) fx.spawn(FIRE.ember, h.pos.x, h.pos.y + 0.4 * s, h.pos.z, fx.r(-2, 2), fx.r(3, 6), fx.r(-2, 2), { scale: s }); // pop!
    },
  },
  chimneySmoke: {
    maxDist: 260,
    tick(h) {
      const fx = h.fx, s = h.s, w = h.opts.wind || WIND;
      h.emit('sm', 4, (bt, x, y, z) => fx.spawn(L.chimney, x + fx.r(-0.1, 0.1), y, z + fx.r(-0.1, 0.1), w[0] * s, fx.r(0.9, 1.3) * s, w[1] * s, { scale: s }));
    },
  },
  fireflies: {
    maxDist: 90,
    tick(h) {
      const fx = h.fx, rad = h.opts.radius ?? 8, n = h.opts.count ?? Math.round(rad * rad * 0.35);
      h.emit('ff', n / 3.5, () => { const a = fx.r(0, TAU), r = Math.sqrt(fx.rng.next()) * rad; fx.spawn(MISC.firefly, h.pos.x + Math.cos(a) * r, h.pos.y + fx.r(0.3, 2.6), h.pos.z + Math.sin(a) * r, fx.r(-0.3, 0.3), fx.r(-0.1, 0.1), fx.r(-0.3, 0.3), { tint: h.tint }); });
    },
  },
  fallingLeaves: {
    maxDist: 110,
    tick(h) {
      const fx = h.fx, rad = h.opts.radius ?? 10, top = h.opts.height ?? 9, w = h.opts.wind || WIND;
      h.emit('lf', h.opts.rate ?? rad * 0.5, () => { const a = fx.r(0, TAU), r = Math.sqrt(fx.rng.next()) * rad; fx.spawn(MISC.leaf, h.pos.x + Math.cos(a) * r, h.pos.y + top * fx.r(0.6, 1), h.pos.z + Math.sin(a) * r, w[0] * 0.8, 0, w[1] * 0.8, { tint: h.tint }); });
    },
  },
  dustMotes: {
    maxDist: 60,
    tick(h) {
      const fx = h.fx, rad = h.opts.radius ?? 6;
      h.emit('dm', rad * rad * 0.25, () => { const a = fx.r(0, TAU), r = Math.sqrt(fx.rng.next()) * rad; fx.spawn(MISC.mote, h.pos.x + Math.cos(a) * r, h.pos.y + fx.r(0.2, 3), h.pos.z + Math.sin(a) * r, fx.r(-0.1, 0.1), fx.r(-0.05, 0.1), fx.r(-0.1, 0.1), { tint: h.tint }); });
    },
  },
  waterfallMist: {
    maxDist: 220,
    tick(h) {
      const fx = h.fx, s = h.s, wdt = h.opts.width ?? 6;
      h.emit('mi', 6 * wdt / 6, (bt, x, y, z) => fx.spawn(L.mist, x + fx.r(-0.5, 0.5) * wdt, y + fx.r(0, 0.6), z + fx.r(-0.5, 0.5) * 1.5, fx.r(-1, 1), fx.r(0.4, 1.4), fx.r(0.5, 2.2), { scale: s }));
      h.emit('sp', 40 * wdt / 6, (bt, x, y, z) => fx.spawn(L.spray, x + fx.r(-0.5, 0.5) * wdt, y + 0.2, z + fx.r(-0.3, 0.3), fx.r(-1, 1), fx.r(2, 5), fx.r(0.5, 2.5), { scale: s }));
    },
  },
  portal: {
    maxDist: 400,
    init(h) {
      h.yaw = h.opts.facing ?? 0;
      h.disc = h.fx.meshFx.portal(h, h.yaw, 3 * h.s, h.tint);
      h.hold(L.portalWisp, 0, 3.1 * h.s, 0, { yaw: h.yaw, scale: 1.3 });
      h.hold(PORTAL_GROUND, 0, 0.06, 0, { scale: h.s });
    },
    tick(h) {
      const fx = h.fx, s = h.s, R0 = 3 * s, cy = 3.1 * s, yaw = h.yaw;
      const cyw = Math.cos(yaw), syw = Math.sin(yaw);
      h.emit('em', 60, () => fx.spawn(L.portalEmber, 0, cy, 0, fx.r(2.6, 3.4) * s, fx.r(0, TAU), fx.r(1.4, 2.2), { anchor: h.anchor, scale: s, yaw }));
      h.emit('fl', 30, () => { // rim flames licking outward and up
        const a = fx.r(0, TAU), lx = Math.cos(a) * R0, ly = Math.sin(a) * R0;
        fx.spawn(L.portalFlame, lx * cyw, cy + ly, -lx * syw, Math.cos(a) * cyw * 0.8, Math.sin(a) * 0.8 + 0.5, -Math.cos(a) * syw * 0.8, { anchor: h.anchor, scale: s });
      });
      h.emit('sm', 4, () => { const a = fx.r(0, TAU); fx.spawn(FIRE.smoke, Math.cos(a) * R0 * cyw, cy + Math.sin(a) * R0 + 1, -Math.cos(a) * R0 * syw, 0, 1.2, 0, { anchor: h.anchor, scale: s * 1.6 }); });
    },
  },
  volcanoSmoke: {
    maxDist: Infinity,
    init(h) { h.hold(L.craterGlow, 0, 0, 0, { scale: h.s }); },
    tick(h) {
      const fx = h.fx, s = h.s, w = h.opts.wind || WIND;
      h.emit('pl', 1.6, (bt, x, y, z) => fx.spawn(L.plume, x + fx.r(-10, 10) * s, y + fx.r(5, 20) * s, z + fx.r(-10, 10) * s, w[0] * 9 * s + fx.r(-2, 2), fx.r(14, 19) * s, w[1] * 9 * s + fx.r(-2, 2), { scale: s }));
      h.emit('pb', 1.2, (bt, x, y, z) => fx.spawn(L.plumeBase, x + fx.r(-12, 12) * s, y + fx.r(0, 6) * s, z + fx.r(-12, 12) * s, fx.r(-2, 2), fx.r(5, 8) * s, fx.r(-2, 2), { scale: s }));
      h.emit('em', 4, (bt, x, y, z) => fx.spawn(L.volcanoEmber, x + fx.r(-10, 10) * s, y + 5 * s, z + fx.r(-10, 10) * s, fx.r(-9, 9) * s, fx.r(24, 42) * s, fx.r(-9, 9) * s, { scale: s }));
    },
  },
  ghostAura: {
    fade: 0.5,
    init(h) { h.hold(L.ghostGlow, 0, 1.0 * h.s, 0); },
    tick(h) {
      const fx = h.fx, s = h.s;
      h.emit('w', 5, (bt, x, y, z) => fx.spawn(MISC.wisp, x + fx.r(-0.3, 0.3) * s, y + fx.r(0.2, 1.2) * s, z + fx.r(-0.3, 0.3) * s, 0, 0.2, 0, { scale: s * 0.6 }));
      h.emit('m', 8, (bt, x, y, z) => fx.spawn(FROST.sparkle, x + fx.r(-0.5, 0.5) * s, y + fx.r(0.2, 1.9) * s, z + fx.r(-0.5, 0.5) * s, 0, 0.3, 0, { scale: s, tint: [0.8, 0.9, 1] }));
    },
  },
};
const _d = new THREE.Vector3();
const WIND = [0.6, 0.2];
const SHIELD_SPARK = P({ sprite: S.star, ramp: R.wInOut, life: [0.4, 0.7], size: [0.1, 0.16], end: 0.3, spin: 2, color: [1, 0.9, 0.6], i: 3 });
const BURN_GLOW = P({ sprite: S.glow, ramp: R.wPulse, life: 0.4, size: 2.4, color: [1, 0.4, 0.1], i: 0.8, pingpong: true });
const ICE_GLOW = P({ sprite: S.glow, ramp: R.wPulse, life: 1.6, size: 2.6, color: [0.3, 0.6, 1], i: 0.8, pingpong: true });
const ENRAGE_GLOW = P({ sprite: S.glow, ramp: R.wPulse, life: 0.5, size: 2.6, color: [1, 0.12, 0.05], i: 0.9, pingpong: true });
const PORTAL_GROUND = P({ sprite: S.glow, ramp: R.wPulse, life: 1.3, size: 9, orient: 'flat', color: [1, 0.35, 0.08], i: 0.9, pingpong: true });
