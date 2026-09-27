// Particle presets: appearance + physics of one particle type. Values are numbers or [min, max] ranges.
// Recipes (bursts/loops/projectiles/...) combine presets with positions & velocities.
import * as THREE from 'three';
import { S, R } from './textures.js';
import { F } from './particles.js';

const toR = v => Array.isArray(v) ? v : [v, v];
// ramps that carry only an envelope (white): colour comes from the preset colour / opts.color multiply
const WHITE_RAMPS = new Set([R.wFade, R.wInOut, R.wFlash, R.wPulse, R.wLate, R.wSolid, R.wConst, R.wBlink, R.wHot]);
const _c = new THREE.Color();
export const lin = hex => { _c.set(hex); return [_c.r, _c.g, _c.b]; };

/**
 * Compile a preset.
 * pool 'add'|'alpha' · sprite (index | [indices]) · ramp · life · size · end (end-size multiplier) · ease (size ease-out power)
 * rot · spin (rad/s; randSpin flips sign randomly) · drag · accY (gravity < 0 < buoyancy) · turb (sine-field wobble, m)
 * stretch (velocity streak factor) · color [r,g,b] linear · color2 (random mix) · i (HDR intensity) · alpha · add (0..1)
 * orient 'billboard'|'stretch'|'flat'|'axisY'|'plane' · motion 'ballistic'|'orbit'|'orbitV' (rise, rgrow) · noGround · pingpong
 */
export function P(d) {
  let flags = 0;
  if (d.motion === 'orbit') flags |= F.ORBIT; else if (d.motion === 'orbitV') flags |= F.ORBITV;
  if (d.orient === 'stretch') flags |= F.STRETCH; else if (d.orient === 'flat') flags |= F.FLAT | F.NOGROUND; else if (d.orient === 'axisY') flags |= F.AXISY;
  else if (d.orient === 'plane') flags |= F.FLATV;
  if (d.loop) flags |= F.LOOP; if (d.pingpong) flags |= F.PINGPONG; if (d.noGround) flags |= F.NOGROUND;
  const add = d.add ?? (d.pool === 'alpha' ? 0 : 1);
  const orbit = !!(flags & 3);
  const ramp = d.ramp ?? R.wFade;
  return {
    pool: d.pool || (add > 0.5 ? 'add' : 'alpha'),
    sprites: Array.isArray(d.sprite) ? d.sprite : [d.sprite ?? S.glow],
    ramp, white: WHITE_RAMPS.has(ramp),
    life: toR(d.life ?? 1), size: toR(d.size ?? 1), end: toR(d.end ?? 1), ease: d.ease ?? 1,
    rot: toR(d.rot ?? [0, 6.2832]), spin: toR(d.spin ?? 0), randSpin: !!d.randSpin,
    k0: toR(orbit ? (d.rise ?? 0) : (d.accY ?? 0)), k1: toR(orbit ? (d.rgrow ?? 0) : (d.drag ?? 0)), orbit,
    turb: toR(d.turb ?? 0), stretch: toR(d.stretch ?? (d.orient === 'axisY' ? 1 : 0)),
    color: d.color ?? [1, 1, 1], color2: d.color2 ?? null, i: toR(d.i ?? 1), alpha: toR(d.alpha ?? 1), add,
    tintable: d.tintable ?? true, flags,
  };
}
// derive a preset with overrides
export const V = (base, over) => P({ ...base.src, ...over });
function D(d) { const p = P(d); p.src = d; return p; }

const W = [1, 1, 1];
// ------------------------------------------------------------------ fire
export const FIRE = {
  flame: D({ sprite: [S.flame1, S.flame2], ramp: R.fire, life: [0.45, 0.75], size: [0.5, 0.75], end: [0.25, 0.45], ease: 1.2, rot: [-0.25, 0.25], spin: [-0.6, 0.6], drag: 1.5, accY: 3.2, turb: 0.12, i: [1.6, 2.3] }),
  lick: D({ sprite: [S.flame1, S.flame2], ramp: R.fire, life: [0.3, 0.5], size: [0.28, 0.42], end: [0.3, 0.5], rot: [-0.2, 0.2], drag: 2, accY: 3, i: [1.8, 2.5] }),
  blob: D({ sprite: [S.blob, S.flame1, S.flame2], ramp: R.fire, life: [0.35, 0.6], size: [0.6, 0.9], end: [1.6, 2.2], ease: 2, rot: [-0.35, 0.35], spin: [-0.8, 0.8], drag: 4, accY: 2, turb: 0.15, i: [1.7, 2.4] }),
  core: D({ sprite: S.glow, ramp: R.fireCore, life: [0.15, 0.25], size: [0.9, 1.2], end: 0.4, i: 2.2 }),
  ember: D({ sprite: S.spark, ramp: R.ember, life: [0.5, 1.1], size: [0.05, 0.09], orient: 'stretch', stretch: 0.9, drag: 1.2, accY: -4, turb: 0.2, i: [5, 8] }),
  emberFloat: D({ sprite: S.ember, ramp: R.ember, life: [0.9, 1.8], size: [0.05, 0.09], end: 0.5, drag: 0.8, accY: 1.5, turb: 0.5, i: [4, 7] }),
  smoke: D({ pool: 'alpha', sprite: [S.smoke1, S.smoke2, S.smoke3], ramp: R.smoke, life: [1.0, 1.6], size: [0.5, 0.8], end: [2.2, 3.2], ease: 2, spin: [-0.5, 0.5], drag: 1.2, accY: 1.2, turb: 0.25 }),
  smokeWarm: D({ pool: 'alpha', sprite: [S.smoke1, S.smoke2, S.smoke3], ramp: R.fireSmokeWarm, life: [0.9, 1.4], size: [0.6, 0.9], end: [2.2, 3.0], ease: 2, spin: [-0.6, 0.6], drag: 1.5, accY: 1.5, turb: 0.2 }),
  flash: D({ sprite: S.flash, ramp: R.wFlash, life: 0.16, size: 2.0, end: 1.4, ease: 2, color: [1, 0.55, 0.2], i: 2.1, noGround: true }),
  scorch: D({ pool: 'alpha', sprite: S.scorch, ramp: R.scorch, life: [3, 4], size: [1.6, 2], end: 1.05, orient: 'flat' }),
  groundGlow: D({ sprite: S.glow, ramp: R.wInOut, life: 0.5, size: 3, end: 1.2, orient: 'flat', color: [1, 0.4, 0.08], i: 1.4 }),
  lava: D({ sprite: [S.ember, S.dot], ramp: R.lava, life: [0.8, 1.2], size: [0.14, 0.24], end: 0.6, drag: 0.3, accY: -14, i: [3, 5] }),
};
// ------------------------------------------------------------------ frost
export const FROST = {
  mist: D({ pool: 'alpha', sprite: [S.smoke1, S.smoke2, S.smoke3], ramp: R.frostMist, life: [0.8, 1.3], size: [0.4, 0.6], end: [2, 3], ease: 2, spin: [-0.4, 0.4], drag: 2.5, accY: -0.3, turb: 0.2 }),
  glow: D({ sprite: S.glow, ramp: R.frost, life: [0.3, 0.5], size: [0.5, 0.8], end: 0.4, i: 2.2 }),
  flake: D({ sprite: S.snow, ramp: R.frostCore, life: [0.6, 1.1], size: [0.1, 0.18], end: 0.6, spin: [-3, 3], drag: 2, accY: -0.6, turb: 0.25, i: [1.6, 2.6] }),
  sparkle: D({ sprite: S.star, ramp: R.frostCore, life: [0.25, 0.5], size: [0.12, 0.22], end: 0.2, spin: [-2, 2], i: [2.5, 4] }),
  shard: D({ sprite: S.shard, ramp: R.frostCore, life: [0.5, 0.9], size: [0.18, 0.34], end: 0.7, spin: [-9, 9], drag: 0.8, accY: -12, i: [1.6, 2.4], randSpin: true }),
  spark: D({ sprite: S.spark, ramp: R.frostCore, life: [0.3, 0.55], size: [0.05, 0.08], orient: 'stretch', stretch: 1.1, drag: 2.5, accY: -3, i: [4, 6] }),
  flash: D({ sprite: S.flash, ramp: R.wFlash, life: 0.16, size: 1.9, end: 1.4, ease: 2, color: [0.45, 0.8, 1.0], i: 2.1, noGround: true }),
};
// ------------------------------------------------------------------ arcane / shadow / holy / nature / storm / poison
export const ARC = {
  glow: D({ sprite: S.glow, ramp: R.arcane, life: [0.3, 0.5], size: [0.5, 0.8], end: 0.3, i: 2.6 }),
  star: D({ sprite: S.star, ramp: R.arcane, life: [0.35, 0.7], size: [0.14, 0.26], end: 0.2, spin: [-3, 3], drag: 2, turb: 0.15, i: [3, 5] }),
  spark: D({ sprite: S.spark, ramp: R.arcane, life: [0.3, 0.6], size: [0.05, 0.08], orient: 'stretch', stretch: 1.0, drag: 3, i: [4, 6] }),
  glyph: D({ sprite: [S.glyph1, S.glyph2, S.hex], ramp: R.arcane, life: [0.5, 0.8], size: [0.22, 0.34], end: 0.6, spin: [-1.5, 1.5], drag: 2, accY: 0.8, i: [2, 3] }),
  flash: D({ sprite: S.flash, ramp: R.wFlash, life: 0.16, size: 1.9, end: 1.4, ease: 2, color: [0.8, 0.35, 1.0], i: 2.2, noGround: true }),
};
export const SHD = {
  glow: D({ sprite: S.glow, ramp: R.shadow, life: [0.3, 0.5], size: [0.6, 0.9], end: 0.4, i: 2.2 }),
  smoke: D({ pool: 'alpha', sprite: [S.smoke1, S.smoke2, S.smoke3], ramp: R.void, life: [0.6, 1.0], size: [0.4, 0.6], end: [1.8, 2.6], ease: 2, spin: [-1, 1], drag: 2, accY: 0.6, turb: 0.2 }),
  wisp: D({ sprite: [S.wisp, S.swirl], ramp: R.shadow, life: [0.4, 0.7], size: [0.4, 0.6], end: 1.4, spin: [-4, 4], drag: 2, accY: 0.5, turb: 0.2, i: [2, 3], randSpin: true }),
  spark: D({ sprite: S.spark, ramp: R.shadowCore, life: [0.3, 0.55], size: [0.05, 0.08], orient: 'stretch', stretch: 1.0, drag: 2.5, accY: 1, i: [3.5, 5.5] }),
  flash: D({ sprite: S.flash, ramp: R.wFlash, life: 0.2, size: 2.3, end: 1.4, ease: 2, color: [0.6, 0.2, 1.0], i: 2.5, noGround: true }),
};
export const HOLY = {
  glow: D({ sprite: S.glow, ramp: R.holy, life: [0.3, 0.5], size: [0.5, 0.8], end: 0.4, i: 2.4 }),
  star: D({ sprite: S.star, ramp: R.holy, life: [0.5, 1.0], size: [0.12, 0.24], end: 0.3, spin: [-2, 2], drag: 1.5, turb: 0.15, i: [3, 5] }),
  cross: D({ sprite: S.holy, ramp: R.holy, life: [0.5, 0.8], size: [0.9, 1.3], end: 1.3, spin: [-0.5, 0.5], i: 3 }),
  mote: D({ sprite: S.dot, ramp: R.holyWarm, life: [0.8, 1.4], size: [0.05, 0.1], end: 0.4, drag: 0.8, accY: 1.6, turb: 0.3, i: [4, 7] }),
  spark: D({ sprite: S.spark, ramp: R.holyWarm, life: [0.35, 0.6], size: [0.05, 0.08], orient: 'stretch', stretch: 1, drag: 2.5, accY: 1, i: [4, 6] }),
  flash: D({ sprite: S.flash, ramp: R.wFlash, life: 0.22, size: 2.2, end: 1.5, ease: 2, color: [1, 0.85, 0.45], i: 2.2, noGround: true }),
  pillar: D({ sprite: S.beam, ramp: R.wInOut, life: 0.7, size: 1.4, end: 0.8, orient: 'axisY', stretch: 6, color: [1, 0.82, 0.4], i: 3 }),
};
export const NAT = {
  mote: D({ sprite: S.dot, ramp: R.nature, life: [0.8, 1.3], size: [0.05, 0.09], end: 0.4, drag: 0.8, accY: 1.2, turb: 0.3, i: [3, 5] }),
  leafy: D({ sprite: S.star, ramp: R.nature, life: [0.5, 0.9], size: [0.12, 0.2], end: 0.3, spin: [-2, 2], i: [2.5, 4] }),
};
export const STORM = {
  bolt: D({ sprite: S.bolt, ramp: R.wFlash, life: [0.08, 0.16], size: [0.9, 1.5], end: 1.1, color: [0.55, 0.75, 1], i: [4, 6] }),
  spark: D({ sprite: S.spark, ramp: R.stormCore, life: [0.2, 0.4], size: [0.04, 0.07], orient: 'stretch', stretch: 1.2, drag: 3, accY: -2, i: [5, 8] }),
  glow: D({ sprite: S.glow, ramp: R.storm, life: [0.2, 0.4], size: [0.6, 0.9], end: 0.5, i: 2.4 }),
};
export const POI = {
  bubble: D({ sprite: S.bubble, ramp: R.poison, life: [0.6, 1.1], size: [0.08, 0.16], end: 1.3, drag: 1, accY: 1.2, turb: 0.15, i: [1.5, 2.5] }),
  mist: D({ pool: 'alpha', sprite: [S.smoke1, S.smoke2, S.smoke3], ramp: R.poisonMist, life: [0.9, 1.4], size: [0.4, 0.6], end: [1.8, 2.6], ease: 2, spin: [-0.4, 0.4], drag: 1.5, accY: 0.4, turb: 0.2 }),
  drip: D({ sprite: S.drop, ramp: R.venomGoo, life: [0.5, 0.8], size: [0.07, 0.11], orient: 'stretch', stretch: 0.3, accY: -9, i: [1.4, 2] }),
  glow: D({ sprite: S.glow, ramp: R.poison, life: [0.3, 0.5], size: [0.5, 0.8], end: 0.4, i: 2 }),
};
// ------------------------------------------------------------------ physical
export const PHYS = {
  spark: D({ sprite: S.spark, ramp: R.ember, life: [0.2, 0.4], size: [0.04, 0.07], orient: 'stretch', stretch: 1.3, drag: 3, accY: -9, color: [1, 0.9, 0.6], i: [5, 8] }),
  hitFlash: D({ sprite: S.flash, ramp: R.wFlash, life: 0.12, size: 1.3, end: 1.3, ease: 2, color: [1, 0.85, 0.55], i: 2.8, noGround: true }),
  dust: D({ pool: 'alpha', sprite: [S.dust, S.smoke2, S.smoke3], ramp: R.dust, life: [0.8, 1.3], size: [0.5, 0.8], end: [2.2, 3], ease: 2.5, spin: [-0.6, 0.6], drag: 3, accY: 0.3, turb: 0.1 }),
  pebble: D({ pool: 'alpha', sprite: S.rock, ramp: R.wSolid, life: [0.5, 0.8], size: [0.06, 0.12], spin: [-8, 8], drag: 0.5, accY: -14, color: [0.35, 0.3, 0.25] }),
  blood: D({ pool: 'alpha', sprite: S.drop, ramp: R.blood, life: [0.35, 0.6], size: [0.09, 0.14], orient: 'stretch', stretch: 0.45, drag: 1.5, accY: -11 }),
  bloodMist: D({ pool: 'alpha', sprite: S.smoke2, ramp: R.blood, life: 0.35, size: 0.35, end: 2.2, ease: 2, alpha: 0.5 }),
  drop: D({ pool: 'alpha', sprite: S.drop, ramp: R.water, life: [0.5, 0.9], size: [0.08, 0.14], orient: 'stretch', stretch: 0.35, drag: 0.6, accY: -12, color: [0.85, 0.95, 1.05] }),
  mistW: D({ pool: 'alpha', sprite: [S.smoke1, S.smoke3], ramp: R.smokeLight, life: [0.7, 1.2], size: [0.4, 0.7], end: [2, 3], ease: 2, drag: 2.5, accY: 0.2, color: [1, 1.05, 1.1] }),
  ring: D({ sprite: S.shock, ramp: R.wFade, life: 0.35, size: 0.4, end: 9, ease: 3, orient: 'flat', color: [1, 0.9, 0.7], i: 1.6 }),
  shockB: D({ sprite: S.ring, ramp: R.wFade, life: 0.25, size: 0.3, end: 10, ease: 3, color: [1, 0.95, 0.8], i: 2 }),
};
export const MISC = {
  wisp: D({ sprite: S.wisp, ramp: R.spirit, life: [1.4, 2.0], size: [0.5, 0.8], end: 1.3, spin: [-0.6, 0.6], drag: 0.5, accY: 1.4, turb: 0.35, i: [1.6, 2.4], randSpin: true }),
  spiritGlow: D({ sprite: S.glow, ramp: R.spirit, life: [1.2, 1.8], size: [0.8, 1.1], end: 0.6, drag: 0.5, accY: 1.6, i: 2 }),
  firefly: D({ sprite: S.glow, ramp: R.wBlink, life: [2.5, 4.5], size: [0.16, 0.24], turb: 1.4, drag: 1, color: [0.75, 1, 0.3], i: [3, 5], loop: false }),
  leaf: D({ pool: 'alpha', sprite: S.leaf, ramp: R.wSolid, life: [5, 8], size: [0.16, 0.24], spin: [-2, 2], randSpin: true, drag: 1.4, accY: -1.1, turb: 1.1, color: [0.85, 0.5, 0.12], color2: [0.55, 0.62, 0.12] }),
  mote: D({ sprite: S.dot, ramp: R.wInOut, life: [4, 7], size: [0.025, 0.045], turb: 0.6, drag: 1, color: [1, 0.95, 0.8], i: [1.5, 2.5], alpha: 0.8 }),
};
export const WHITE = [1, 1, 1];
export { W };
