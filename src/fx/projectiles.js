// Projectile recipes for fx.projectile(name, from, target, { speed, onHit, arc, impact, targetOffset, scale, color }).
// { speed, arc, wobble, scale, impact (burst name), impactScale, init(h) (held core + mesh + ribbon), tick(h) (trail) }
// h.pos = current position, h.dir = unit flight direction, h.speed; trails emit along the frame's path (sub-frame
// interpolated) and a batched ribbon gives every bolt a continuous tapered streak.
import * as THREE from 'three';
import { S, R } from './textures.js';
import { P, lin, FIRE, FROST, ARC, SHD, HOLY, PHYS, POI } from './presets.js';

const K = {
  // fire
  fbHalo: P({ sprite: S.glow, ramp: R.wPulse, life: 0.2, size: 2.2, color: [1, 0.42, 0.1], i: 1.1, pingpong: true, noGround: true }),
  fbGlow: P({ sprite: S.glow, ramp: R.wPulse, life: 0.13, size: 1.05, color: [1, 0.62, 0.25], i: 2.6, pingpong: true, noGround: true }),
  fbCore: P({ sprite: S.flash, ramp: R.wPulse, life: 0.09, size: 0.55, color: [1, 0.9, 0.7], i: 4, pingpong: true, noGround: true }),
  fbRoil: P({ sprite: [S.blob], ramp: R.wPulse, life: 0.3, size: 0.95, spin: 11, color: [1, 0.48, 0.12], i: 2.3, noGround: true }),
  fbTail: P({ sprite: [S.blob, S.blob, S.blob], ramp: R.fire, life: [0.2, 0.3], size: [0.6, 0.8], end: [0.35, 0.5], ease: 1.2, spin: [-5, 5], drag: 3.5, turb: 0.05, i: [1.8, 2.4] }),
  fbLick: P({ sprite: [S.blob, S.flame2], ramp: R.fire, life: [0.28, 0.4], size: [0.3, 0.42], end: 0.35, spin: [-3, 3], drag: 2, accY: 3, turb: 0.08, i: [2.2, 3] }),
  fbSmoke: P({ pool: 'alpha', sprite: [S.smoke1, S.smoke2, S.smoke3], ramp: R.smoke, life: [0.7, 1.0], size: [0.35, 0.5], end: [2.4, 3.2], ease: 2, spin: [-0.8, 0.8], drag: 2, accY: 1.2, turb: 0.15, alpha: 0.7 }),
  // frost
  frGlow: P({ sprite: S.glow, ramp: R.wPulse, life: 0.16, size: 1.3, color: [0.35, 0.7, 1], i: 1.9, pingpong: true, noGround: true }),
  frCore: P({ sprite: S.flash, ramp: R.wPulse, life: 0.1, size: 0.55, color: [0.8, 0.95, 1], i: 3.4, pingpong: true, noGround: true }),
  frMist: P({ pool: 'alpha', sprite: [S.smoke1, S.smoke2, S.smoke3], ramp: R.frostMist, life: [0.55, 0.85], size: [0.45, 0.6], end: [2.2, 3], ease: 2, spin: [-1, 1], drag: 3, accY: -0.4, turb: 0.1, alpha: 1.2 }),
  frTail: P({ sprite: [S.blob, S.glow], ramp: R.frost, life: [0.16, 0.24], size: [0.5, 0.65], end: 0.4, spin: [-3, 3], drag: 4, i: [1.4, 1.9] }),
  // arcane
  amGlow: P({ sprite: S.glow, ramp: R.wPulse, life: 0.12, size: 1.1, color: [0.85, 0.35, 1], i: 2.2, pingpong: true, noGround: true }),
  amCore: P({ sprite: S.flash, ramp: R.wPulse, life: 0.08, size: 0.45, color: [1, 0.8, 1], i: 4, pingpong: true, noGround: true }),
  amStar: P({ sprite: S.star, ramp: R.wConst, life: 1, size: 0.85, spin: 7, color: [1, 0.7, 1], i: 2.6, noGround: true }),
  amMote: P({ sprite: S.dot, ramp: R.arcane, life: [0.3, 0.5], size: [0.06, 0.1], end: 0.4, drag: 2.5, turb: 0.12, i: [4, 6] }),
  // shadow
  sbDark: P({ pool: 'alpha', sprite: S.soft, ramp: R.wConst, life: 1, size: 0.8, color: [0.04, 0.0, 0.08], alpha: 0.95, noGround: true }),
  sbRim: P({ sprite: S.glow, ramp: R.wPulse, life: 0.14, size: 1.45, color: [0.6, 0.18, 1], i: 1.9, pingpong: true, noGround: true }),
  sbSwirl: P({ sprite: S.swirl, ramp: R.wConst, life: 1, size: 1.1, spin: -9, color: [0.75, 0.35, 1], i: 1.9, noGround: true }),
  sbFlame: P({ sprite: [S.blob, S.blob, S.flame2], ramp: R.shadow, life: [0.22, 0.35], size: [0.45, 0.6], end: 0.4, rot: [-0.4, 0.4], spin: [-1, 1], drag: 3.5, accY: 1, i: [1.8, 2.5] }),
  sbTrail: P({ pool: 'alpha', sprite: [S.smoke1, S.smoke2, S.smoke3], ramp: R.void, life: [0.45, 0.7], size: [0.45, 0.6], end: [1.8, 2.4], ease: 2, spin: [-2, 2], drag: 3, accY: 0.4, turb: 0.1 }),
  // lava
  lvGlow: P({ sprite: S.glow, ramp: R.wPulse, life: 0.25, size: 1.9, color: [1, 0.35, 0.08], i: 1.8, pingpong: true, noGround: true }),
  lvCore: P({ sprite: S.blob, ramp: R.wConst, life: 1, size: 0.7, spin: -6, color: [1, 0.45, 0.1], i: 1.6, noGround: true }),
};

export const PROJECTILES = {
  fireball: {
    speed: 26, impact: 'fireImpact',
    init(h) {
      h.hold(K.fbHalo); h.hold(K.fbGlow); h.hold(K.fbCore);
      h.hold(K.fbRoil, 0, 0, 0, { rot: 0 }); h.hold(K.fbRoil, 0, 0, 0, { rot: 2, spin: -9, scale: 0.8 });
      h.fx.meshFx.ribbon(h, { width: 0.7, color: [2.6, 0.95, 0.22], life: 0.14 });
    },
    tick(h) {
      const fx = h.fx, s = h.s, d = h.dir, f = h.speed * 0.3;
      h.emit('tb', 130, (bt, x, y, z) => fx.spawn(K.fbTail, x + fx.r(-0.08, 0.08) * s, y + fx.r(-0.08, 0.08) * s, z + fx.r(-0.08, 0.08) * s, d.x * f + fx.r(-0.6, 0.6), d.y * f + fx.r(-0.3, 0.7), d.z * f + fx.r(-0.6, 0.6), { scale: s }));
      h.emit('fl', 45, (bt, x, y, z) => fx.spawn(K.fbLick, x + fx.r(-0.15, 0.15) * s, y, z + fx.r(-0.15, 0.15) * s, fx.r(-0.5, 0.5), fx.r(0, 0.8), fx.r(-0.5, 0.5), { scale: s }));
      h.emit('em', 40, (bt, x, y, z) => fx.spawn(FIRE.ember, x, y, z, -d.x * 2 + fx.r(-2, 2), fx.r(-0.5, 2.2), -d.z * 2 + fx.r(-2, 2), { scale: s }));
      h.emit('sm', 16, (bt, x, y, z) => fx.spawn(K.fbSmoke, x, y + 0.1 * s, z, fx.r(-0.3, 0.3), fx.r(0.2, 0.6), fx.r(-0.3, 0.3), { scale: s }));
    },
  },
  pyroblast: {
    speed: 22, impact: 'fireImpact', scale: 2.0,
    init(h) {
      h.hold(K.fbHalo, 0, 0, 0, { scale: 0.85, i: 0.6 }); h.hold(K.fbGlow, 0, 0, 0, { scale: 0.8, i: 0.8 }); h.hold(K.fbCore, 0, 0, 0, { scale: 0.8 });
      h.hold(K.fbRoil, 0, 0, 0, { rot: 0 }); h.hold(K.fbRoil, 0, 0, 0, { rot: 2, spin: -9, scale: 0.85 }); h.hold(K.fbRoil, 0, 0, 0, { rot: 4, spin: 6, scale: 1.1 });
      h.hold(P_PYRO_SWIRL, 0, 0, 0, { rot: 0 });
      h.fx.meshFx.ribbon(h, { width: 0.8, color: [2.6, 0.9, 0.2], life: 0.2 });
    },
    tick(h) {
      PROJECTILES.fireball.tick(h);
      const fx = h.fx, s = h.s;
      h.emit('sw', 40, (bt, x, y, z) => fx.spawn(FIRE.emberFloat, x + fx.r(-0.4, 0.4) * s, y + fx.r(-0.4, 0.4) * s, z + fx.r(-0.4, 0.4) * s, fx.r(-1, 1), fx.r(0, 2), fx.r(-1, 1), { scale: s * 0.8 }));
    },
  },
  frostbolt: {
    speed: 24, impact: 'frostImpact',
    init(h) {
      h.fx.meshFx.projMesh('shard', h, { roll: 9, scale: 1.25 });
      h.hold(K.frGlow); h.hold(K.frCore);
      h.fx.meshFx.ribbon(h, { width: 0.5, color: [0.5, 1.1, 2.2], life: 0.2 });
    },
    tick(h) {
      const fx = h.fx, s = h.s, d = h.dir, f = h.speed * 0.25;
      h.emit('tr', 80, (bt, x, y, z) => fx.spawn(K.frTail, x, y, z, d.x * f + fx.r(-0.3, 0.3), d.y * f + fx.r(-0.3, 0.3), d.z * f + fx.r(-0.3, 0.3), { scale: s }));
      h.emit('mi', 36, (bt, x, y, z) => fx.spawn(K.frMist, x + fx.r(-0.1, 0.1), y + fx.r(-0.1, 0.1), z + fx.r(-0.1, 0.1), fx.r(-0.4, 0.4), fx.r(-0.2, 0.3), fx.r(-0.4, 0.4), { scale: s }));
      h.emit('fl', 26, (bt, x, y, z) => fx.spawn(FROST.flake, x, y, z, fx.r(-1, 1), fx.r(-0.5, 0.8), fx.r(-1, 1), { scale: s * 1.2 }));
      h.emit('sp', 22, (bt, x, y, z) => fx.spawn(FROST.sparkle, x + fx.r(-0.25, 0.25), y + fx.r(-0.25, 0.25), z + fx.r(-0.25, 0.25), 0, 0, 0, { scale: s }));
    },
  },
  arcaneMissile: {
    speed: 30, impact: 'arcaneImpact', impactScale: 0.7, wobble: 0.35,
    init(h) {
      h.hold(K.amGlow); h.hold(K.amCore); h.hold(K.amStar, 0, 0, 0, { rot: 0 });
      h.fx.meshFx.ribbon(h, { width: 0.36, color: [1.9, 0.6, 2.6], life: 0.13 });
    },
    tick(h) {
      const fx = h.fx, s = h.s;
      h.emit('mo', 50, (bt, x, y, z) => fx.spawn(K.amMote, x, y, z, fx.r(-1.2, 1.2), fx.r(-1.2, 1.2), fx.r(-1.2, 1.2), { scale: s }));
      h.emit('sp', 26, (bt, x, y, z) => fx.spawn(ARC.star, x, y, z, fx.r(-1.5, 1.5), fx.r(-1.5, 1.5), fx.r(-1.5, 1.5), { scale: s * 0.7 }));
    },
  },
  shadowBolt: {
    speed: 22, impact: 'shadowImpact',
    init(h) {
      h.hold(K.sbRim); h.hold(K.sbDark); h.hold(K.sbSwirl, 0, 0, 0, { rot: 0 }); h.hold(K.sbSwirl, 0, 0, 0, { rot: 1.5, spin: 7, scale: 0.7 });
      h.fx.meshFx.ribbon(h, { width: 0.6, color: [1.1, 0.3, 2.0], life: 0.18 });
    },
    tick(h) {
      const fx = h.fx, s = h.s, d = h.dir, f = h.speed * 0.25;
      h.emit('fl', 80, (bt, x, y, z) => fx.spawn(K.sbFlame, x, y, z, d.x * f + fx.r(-0.5, 0.5), d.y * f + fx.r(-0.3, 0.6), d.z * f + fx.r(-0.5, 0.5), { scale: s }));
      h.emit('sm', 45, (bt, x, y, z) => fx.spawn(K.sbTrail, x + fx.r(-0.1, 0.1), y + fx.r(-0.1, 0.1), z + fx.r(-0.1, 0.1), fx.r(-0.4, 0.4), fx.r(-0.2, 0.5), fx.r(-0.4, 0.4), { scale: s }));
      h.emit('sp', 16, (bt, x, y, z) => fx.spawn(SHD.spark, x, y, z, fx.r(-2, 2), fx.r(-1, 2), fx.r(-2, 2), { scale: s }));
    },
  },
  arrow: {
    speed: 48, arc: 0.03, impact: 'arrowHit',
    init(h) {
      h.fx.meshFx.projMesh('arrow', h, { roll: 14 });
      h.fx.meshFx.ribbon(h, { width: 0.07, color: [0.9, 0.9, 0.85], life: 0.12, alpha: 0.5 });
    },
  },
  spear: {
    speed: 32, arc: 0.05, impact: 'hit',
    init(h) {
      h.fx.meshFx.projMesh('spear', h, { roll: 4 });
      h.fx.meshFx.ribbon(h, { width: 0.12, color: [0.9, 0.9, 0.85], life: 0.14, alpha: 0.55 });
    },
  },
  lavaBomb: {
    speed: 17, arc: 0.35, impact: 'lavaSplash',
    init(h) {
      h.fx.meshFx.projMesh('rock', h, { roll: 6, scale: 1.9 });
      h.hold(K.lvGlow); h.hold(K.lvCore, 0, 0, 0, { rot: 0 });
      h.fx.meshFx.ribbon(h, { width: 0.7, color: [2.4, 0.7, 0.12], life: 0.3 });
    },
    tick(h) {
      const fx = h.fx, s = h.s;
      h.emit('fl', 80, (bt, x, y, z) => fx.spawn(K.fbTail, x + fx.r(-0.15, 0.15) * s, y + fx.r(-0.15, 0.15) * s, z + fx.r(-0.15, 0.15) * s, fx.r(-0.5, 0.5), fx.r(0, 1), fx.r(-0.5, 0.5), { scale: s, life: 1.6 }));
      h.emit('sm', 26, (bt, x, y, z) => fx.spawn(FIRE.smokeWarm, x, y, z, fx.r(-0.3, 0.3), fx.r(0.3, 0.9), fx.r(-0.3, 0.3), { scale: s * 0.9, life: 1.3 }));
      h.emit('em', 30, (bt, x, y, z) => fx.spawn(FIRE.ember, x, y, z, fx.r(-2, 2), fx.r(-1, 2), fx.r(-2, 2), { scale: s }));
    },
  },
};
const P_PYRO_SWIRL = P({ sprite: S.swirl, ramp: R.wConst, life: 1, size: 1.3, spin: 6, color: [1, 0.55, 0.15], i: 1.6, noGround: true });
