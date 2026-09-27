// One-shot effects. A burst is either a function (fx, pos, opts, scale) that spawns everything at once — particles may
// be born in the future (o.dt < 0) to stage a sequence without timers — or a timed recipe object
// { dur, init(h), tick(h, dt), end(h) } run as an instance (h.pos follows opts.follow when given).
// Character-centred bursts (heal, levelUp, resurrect, death, spawnPuff, questComplete, novas, blinks, enrageBurst)
// expect `pos` at the FEET; impacts expect the hit point.
import * as THREE from 'three';
import { S, R } from './textures.js';
import { P, lin, FIRE, FROST, ARC, SHD, HOLY, NAT, STORM, POI, PHYS, MISC } from './presets.js';

const _d = new THREE.Vector3(), _u = new THREE.Vector3(0, 1, 0), _p = new THREE.Vector3();
const up = (p, dy) => _p.set(p.x, p.y + dy, p.z);
const TAU = Math.PI * 2;

// radial burst: n particles, horizontal speed [a,b], vertical speed [ua,ub], spawn radius r0
function radial(fx, pr, n, p, a, b, ua, ub, s, o = {}, r0 = 0, y0 = 0) {
  for (let i = 0; i < n; i++) {
    const ang = (i + fx.rng.next()) / n * TAU, sp = fx.r(a, b) * s, c = Math.cos(ang), si = Math.sin(ang);
    fx.spawn(pr, p.x + c * r0 * s, p.y + y0 * s, p.z + si * r0 * s, c * sp, fx.r(ua, ub) * s, si * sp, { scale: s, ...o });
  }
}
// spherical burst (optionally within a cone around dir)
function sphere(fx, pr, n, p, a, b, s, o = {}, dir = null, ang = Math.PI, r0 = 0) {
  for (let i = 0; i < n; i++) {
    fx.rdir(_d, dir, ang);
    const sp = fx.r(a, b) * s;
    fx.spawn(pr, p.x + _d.x * r0 * s, p.y + _d.y * r0 * s, p.z + _d.z * r0 * s, _d.x * sp, _d.y * sp, _d.z * sp, { scale: s, ...o });
  }
}
// direction particles should spray out of a hit surface: against the attack direction if given (or along it for
// blood, which exits the far side), otherwise toward the viewer so the spray is never hidden inside the body
function outDir(fx, p, o, through = false) {
  if (o.dir) { const v = new THREE.Vector3().copy(o.dir).normalize(); return through ? v.multiplyScalar(0.3).add(new THREE.Vector3().subVectors(fx.camera.position, p).normalize()).normalize() : v.negate(); }
  return new THREE.Vector3().subVectors(fx.camera.position, p).normalize();
}
const at = (fx, pr, p, s, o = {}, dx = 0, dy = 0, dz = 0) => fx.spawn(pr, p.x + dx * s, p.y + dy * s, p.z + dz * s, 0, 0, 0, { scale: s, ...o });
const groundY = (fx, p) => fx.heightAt(p.x, p.z);
const nearGround = (fx, p, h = 1.2) => p.y - groundY(fx, p) < h;

// ------------------------------------------------------------------ extra presets used only here
const X = {
  fireRing: P({ sprite: S.shock, ramp: R.fire, life: 0.4, size: 0.5, end: 8, ease: 3, orient: 'flat', i: 2.2 }),
  fireShock: P({ sprite: S.ring, ramp: R.wFade, life: 0.22, size: 0.3, end: 8, ease: 3, color: [1, 0.6, 0.25], i: 2.4 }),
  hitDust: P({ pool: 'alpha', sprite: [S.dust, S.smoke2], ramp: R.dust, life: [0.35, 0.5], size: [0.25, 0.35], end: 2.2, ease: 2.5, drag: 4, alpha: 0.5 }),
  critFlare: P({ sprite: S.flare, ramp: R.wFlash, life: 0.16, size: 3.2, end: 1.3, ease: 2, color: [1, 0.85, 0.55], i: 2.6, noGround: true }),
  critChunk: P({ sprite: S.ember, ramp: R.ember, life: [0.3, 0.5], size: [0.1, 0.16], end: 0.5, drag: 2, accY: -8, i: [4, 6] }),
  fireCoreBurst: P({ sprite: [S.blob], ramp: R.fireCore, life: [0.3, 0.42], size: [0.7, 0.9], end: [2, 2.5], ease: 2.5, spin: [-3, 3], drag: 3, accY: 2, i: [1.7, 2.2] }),
  fireBurst: P({ sprite: [S.blob, S.blob, S.flame1], ramp: R.blast, life: [0.45, 0.7], size: [0.5, 0.7], end: [2, 2.6], ease: 2.5, rot: [-0.35, 0.35], spin: [-1, 1], drag: 4.5, accY: 2.5, turb: 0.1, i: [1.6, 2.2] }),
  frostBloom: P({ sprite: [S.blob, S.smoke1], ramp: R.frost, life: 0.35, size: 0.8, end: 2.4, ease: 3, spin: 2, i: 1.0 }),
  arcBloom: P({ sprite: [S.blob], ramp: R.arcane, life: 0.35, size: 0.8, end: 2.4, ease: 3, spin: 2, i: 2 }),
  glyphOut: P({ sprite: [S.glyph1, S.glyph2, S.hex], ramp: R.arcane, life: 0.55, size: 0.36, end: 0.8, motion: 'orbit', rise: 0.8, rgrow: 3.2, spin: 1, i: 2.6 }),
  shadowBurst: P({ sprite: [S.blob, S.flame1, S.flame2], ramp: R.shadow, life: [0.35, 0.55], size: [0.5, 0.7], end: [1.6, 2.2], ease: 2.5, rot: [-0.35, 0.35], spin: [-1, 1], drag: 4, accY: 1.5, i: [1.8, 2.5] }),
  frostRing: P({ sprite: S.shock, ramp: R.frost, life: 0.45, size: 0.5, end: 10, ease: 3, orient: 'flat', i: 2 }),
  frostGround: P({ sprite: S.glow, ramp: R.wInOut, life: 2.2, size: 11, end: 1.05, orient: 'flat', color: [0.55, 0.8, 1], i: 0.55 }),
  holyRing: P({ sprite: S.shock, ramp: R.holy, life: 0.55, size: 0.5, end: 10, ease: 2.5, orient: 'flat', i: 2.4 }),
  holyRingThin: P({ sprite: S.ring, ramp: R.holy, life: 0.7, size: 0.8, end: 8, ease: 2.2, orient: 'flat', i: 2.6 }),
  runeFlat: P({ sprite: S.rune, ramp: R.wInOut, life: 0.6, size: 1.6, end: 1.5, ease: 2, orient: 'flat', spin: 1.5, i: 2.2 }),
  swirlIn: P({ sprite: S.swirl, ramp: R.wInOut, life: 0.45, size: 2.2, end: 0.2, spin: 9, i: 2.2 }),
  stormRing: P({ sprite: S.shock, ramp: R.storm, life: 0.4, size: 0.5, end: 12, ease: 3, orient: 'flat', i: 2.2 }),
  stormRing2: P({ sprite: S.ring, ramp: R.storm, life: 0.55, size: 1, end: 10, ease: 2, orient: 'flat', i: 2.2 }),
  dustRing: P({ pool: 'alpha', sprite: [S.dust, S.smoke2, S.smoke1], ramp: R.dust, life: [0.9, 1.4], size: [0.8, 1.1], end: [2.2, 3], ease: 2, spin: [-0.5, 0.5], drag: 3.2, accY: 0.4 }),
  starBurst: P({ sprite: S.star, ramp: R.wFlash, life: 0.22, size: 1.6, end: 1.8, ease: 2, spin: 2, color: [1, 0.85, 0.5], i: 3, noGround: true }),
  pillarGold: P({ sprite: S.beam, ramp: R.wInOut, life: 2.4, size: 2.2, end: 1.1, orient: 'axisY', stretch: 7, color: [1, 0.8, 0.35], i: 2.4 }),
  pillarCore: P({ sprite: S.beam, ramp: R.wInOut, life: 2.2, size: 0.8, end: 0.7, orient: 'axisY', stretch: 16, color: [1, 0.95, 0.75], i: 3.5 }),
  flatGlow: P({ sprite: S.glow, ramp: R.wInOut, life: 1.2, size: 4, end: 1.2, orient: 'flat', color: [1, 0.75, 0.3], i: 1.6 }),
  riseSpark: P({ sprite: S.spark, ramp: R.holyWarm, life: [0.8, 1.4], size: [0.06, 0.1], orient: 'stretch', stretch: 0.35, drag: 0.4, accY: 1.5, turb: 0.2, i: [5, 8] }),
  orbitStar: P({ sprite: S.star, ramp: R.holyWarm, life: [0.8, 1.2], size: [0.18, 0.28], end: 0.3, motion: 'orbit', rise: 1.8, rgrow: 0.12, spin: [-3, 3], i: [3, 5] }),
  orbitMote: P({ sprite: S.dot, ramp: R.holyWarm, life: [0.8, 1.2], size: [0.06, 0.1], end: 0.5, motion: 'orbit', rise: 1.6, rgrow: 0.05, i: [4, 7] }),
  healGlow: P({ sprite: S.glow, ramp: R.wInOut, life: 0.9, size: 2.2, end: 1.2, color: [1, 0.85, 0.45], i: 0.7 }),
  converge: P({ sprite: S.star, ramp: R.arcane, life: [0.3, 0.4], size: [0.22, 0.34], end: 0.3, motion: 'orbit', rise: 0, rgrow: -4.5, spin: 3, i: [3, 5] }),
  blinkOrb: P({ sprite: S.glow, ramp: R.wLate, life: 0.32, size: 0.4, end: 5, ease: 0.5, color: [0.75, 0.45, 1], i: 2 }),
  blinkPillar: P({ sprite: S.beam, ramp: R.wFlash, life: 0.35, size: 1.4, end: 0.3, orient: 'axisY', stretch: 2.6, color: [0.7, 0.45, 1], i: 3 }),
  confetti: P({ sprite: [S.star, S.dot], ramp: R.wInOut, life: [0.9, 1.5], size: [0.1, 0.2], end: 0.4, spin: [-4, 4], drag: 2.2, accY: -1.5, color: [1, 0.85, 0.35], color2: [1, 1, 0.9], i: [3, 5] }),
  lootCore: P({ sprite: S.beam, ramp: R.wPulse, life: 1.6, size: 0.35, orient: 'axisY', stretch: 22, i: 4, pingpong: true }),
  lootWide: P({ sprite: S.beam, ramp: R.wPulse, life: 2.2, size: 1.2, orient: 'axisY', stretch: 6.5, i: 1.6 }),
  lootBase: P({ sprite: S.glow, ramp: R.wPulse, life: 1.4, size: 1.8, orient: 'flat', i: 1.6 }),
  lootMote: P({ sprite: S.dot, ramp: R.wInOut, life: [1.2, 2], size: [0.05, 0.09], accY: 1.8, drag: 0.6, turb: 0.1, i: [3, 5] }),
  wispUp: P({ sprite: S.wisp, ramp: R.spirit, life: [1.2, 1.8], size: [0.5, 0.8], end: 1.4, motion: 'orbit', rise: 1.3, rgrow: 0.05, spin: [-0.5, 0.5], i: [1.8, 2.6] }),
  spiritCore: P({ sprite: S.glow, ramp: R.spirit, life: 2.2, size: 0.9, end: 0.5, accY: 1.2, drag: 0.4, turb: 0.25, i: 2.6 }),
  puff: P({ pool: 'alpha', sprite: [S.smoke1, S.smoke2, S.smoke3], ramp: R.smokeLight, life: [0.7, 1.1], size: [0.6, 0.9], end: [2.2, 2.8], ease: 3, spin: [-1, 1], drag: 4, accY: 0.6, color: [0.8, 0.75, 0.9] }),
  crackGlow: P({ sprite: S.crack, ramp: R.wLate, life: 1.0, size: 3.4, end: 1.15, orient: 'flat', color: [1, 0.4, 0.08], i: 3.5 }),
  lavaBlob: P({ sprite: [S.blob, S.ember], ramp: R.lava, life: [0.9, 1.4], size: [0.3, 0.55], end: 0.5, spin: [-4, 4], drag: 0.2, accY: -13, i: [2, 3] }),
  column: P({ sprite: [S.blob, S.flame1, S.flame2], ramp: R.blast, life: [0.6, 1.0], size: [0.9, 1.4], end: [1.5, 2.2], ease: 2, rot: [-0.35, 0.35], spin: [-0.8, 0.8], drag: 1.6, accY: 4, turb: 0.3, i: [1.5, 2.1] }),
  bigSmoke: P({ pool: 'alpha', sprite: [S.smoke1, S.smoke2, S.plume], ramp: R.fireSmokeWarm, life: [2.4, 3.4], size: [1.8, 2.6], end: [2.6, 3.4], ease: 2, spin: [-0.3, 0.3], drag: 1.2, accY: 1.8, turb: 0.5, alpha: 1.3 }),
  groundFlash: P({ sprite: S.glow, ramp: R.wFlash, life: 0.35, size: 6, end: 1.6, ease: 2, orient: 'flat', i: 2 }),
  lavaJet: P({ sprite: S.spark, ramp: R.lava, life: [1.0, 1.5], size: [0.16, 0.26], orient: 'stretch', stretch: 0.08, drag: 0.15, accY: -14, i: [2.5, 3.5] }),
  redRing: P({ sprite: S.shock, ramp: R.enrage, life: 0.5, size: 0.5, end: 7, ease: 3, orient: 'flat', i: 2.4 }),
  redSpark: P({ sprite: S.spark, ramp: R.enrage, life: [0.4, 0.7], size: [0.06, 0.1], orient: 'stretch', stretch: 0.8, drag: 2, accY: 2, i: [4, 6] }),
  redWisp: P({ sprite: [S.flame1, S.flame2, S.wisp], ramp: R.enrage, life: [0.5, 0.8], size: [0.5, 0.8], end: 0.6, rot: [-0.3, 0.3], drag: 2, accY: 3, turb: 0.2, i: [2, 3] }),
  redFlash: P({ sprite: S.flash, ramp: R.wFlash, life: 0.22, size: 3, end: 1.4, ease: 2, color: [1, 0.2, 0.1], i: 2.5, noGround: true }),
  meteorFlash: P({ sprite: S.flash, ramp: R.wFlash, life: 0.3, size: 7, end: 1.4, ease: 2, color: [1, 0.6, 0.25], i: 1.8, noGround: true }),
  smiteBeam: P({ sprite: S.beam, ramp: R.wFlash, life: 0.5, size: 1.6, end: 0.4, orient: 'axisY', stretch: 7, color: [1, 0.85, 0.45], i: 4 }),
  shadowOrb: P({ pool: 'alpha', sprite: S.soft, ramp: R.void, life: 0.4, size: 1.2, end: 2.2, ease: 2 }),
};

export const BURSTS = {
  // ---------------------------------------------------------------- melee
  hit(fx, p, o, s) {
    at(fx, PHYS.hitFlash, p, s);
    at(fx, P_HITSTAR, p, s, { rot: fx.r(0, 1) });
    const back = outDir(fx, p, o);
    sphere(fx, PHYS.spark, 14, p, 4, 9, s, {}, back, 1.2);
    sphere(fx, X.hitDust, 3, p, 0.5, 1.2, s);
  },
  crit(fx, p, o, s) {
    at(fx, PHYS.hitFlash, p, s * 1.8);
    at(fx, X.starBurst, p, s, { rot: fx.r(0, 1) });
    at(fx, X.critFlare, p, s, { rot: fx.r(-0.3, 0.3) });
    const back = outDir(fx, p, o);
    sphere(fx, PHYS.spark, 26, p, 7, 14, s, {}, back, 1.4);
    sphere(fx, X.critChunk, 10, p, 3, 7, s);
    sphere(fx, FIRE.emberFloat, 8, p, 1, 3, s, { tint: [1.2, 1, 0.8] });
    fx.shake(0.15, p);
  },
  blood(fx, p, o, s) {
    const back = outDir(fx, p, o);
    sphere(fx, PHYS.blood, 16, p, 2.5, 5.5, s, {}, back, 1.1);
    sphere(fx, PHYS.blood, 8, p, 1, 2.5, s, { size: 1.5 }, back, 1.4);
    at(fx, PHYS.bloodMist, p, s);
  },
  dust(fx, p, o, s) {
    radial(fx, PHYS.dust, 7, p, 0.8, 1.8, 0.2, 0.6, s, {}, 0.2, 0.25);
    radial(fx, PHYS.pebble, 4, p, 1, 2.5, 2, 4, s);
  },
  splash(fx, p, o, s) {
    const y = p.y;
    for (let i = 0; i < 26; i++) {
      const a = fx.r(0, TAU), r = fx.r(0, 0.35) * s, h = fx.r(0.3, 1.2);
      fx.spawn(PHYS.drop, p.x + Math.cos(a) * r, y, p.z + Math.sin(a) * r, Math.cos(a) * fx.r(0.6, 2.2) * s, fx.r(3, 6.5) * s * h, Math.sin(a) * fx.r(0.6, 2.2) * s, { scale: s });
    }
    radial(fx, PHYS.mistW, 6, p, 0.4, 1.2, 0.3, 0.8, s, {}, 0.2, 0.2);
    fx.spawn(SPLASH_RING, p.x, y + 0.03, p.z, 0, 0, 0, { scale: s });
    fx.spawn(SPLASH_RING, p.x, y + 0.03, p.z, 0, 0, 0, { scale: s * 0.8, dt: -0.25 });
  },
  charge(fx, p, o, s) {
    radial(fx, X.dustRing, 16, p, 2.5, 5, 0.3, 1.2, s, {}, 0.4, 0.3);
    radial(fx, PHYS.pebble, 10, p, 1.5, 4, 3, 6, s);
    radial(fx, PHYS.spark, 8, p, 3, 6, 1, 3, s, { tint: [1, 0.85, 0.6] }, 0, 0.3);
    fx.spawn(PHYS.ring, p.x, p.y + 0.06, p.z, 0, 0, 0, { scale: s * 0.7, tint: [0.8, 0.7, 0.55] });
    fx.shake(0.25, p);
  },
  thunderClap(fx, p, o, s) {
    const y = groundY(fx, p) + 0.08;
    fx.spawn(X.stormRing, p.x, y, p.z, 0, 0, 0, { scale: s });
    fx.spawn(X.stormRing2, p.x, y + 0.02, p.z, 0, 0, 0, { scale: s, dt: -0.08 });
    fx.spawn(PHYS.ring, p.x, y + 0.03, p.z, 0, 0, 0, { scale: s * 1.2, tint: [0.75, 0.68, 0.55], life: 1.3 });
    fx.spawn(X.groundFlash, p.x, y + 0.04, p.z, 0, 0, 0, { scale: s, tint: [0.5, 0.7, 1] });
    radial(fx, X.dustRing, 22, p, 6, 9, 0.2, 1.0, s, {}, 0.8, 0.3);
    radial(fx, STORM.spark, 26, p, 5, 11, 1, 5, s, {}, 0.3, 0.3);
    for (let i = 0; i < 7; i++) {
      const a = fx.r(0, TAU), r = fx.r(1, 4) * s;
      fx.spawn(STORM.bolt, p.x + Math.cos(a) * r, y + 0.6 * s, p.z + Math.sin(a) * r, 0, 0, 0, { scale: s, dt: -fx.r(0, 0.2), rot: fx.r(-0.6, 0.6) });
    }
    fx.shake(0.45, p);
  },
  frostNova(fx, p, o, s) {
    const y = groundY(fx, p);
    fx.meshFx.iceNova(p.x, y, p.z, s);
    fx.spawn(X.frostRing, p.x, y + 0.08, p.z, 0, 0, 0, { scale: s });
    fx.spawn(X.frostGround, p.x, y + 0.06, p.z, 0, 0, 0, { scale: s });
    fx.spawn(FROST.flash, p.x, y + 1, p.z, 0, 0, 0, { scale: s * 1.4 });
    radial(fx, FROST.mist, 22, p, 5, 8, 0.1, 0.6, s, {}, 0.6, 0.35);
    radial(fx, FROST.flake, 30, p, 3, 7, 0.5, 3, s, {}, 0.3, 0.5);
    radial(fx, FROST.sparkle, 24, p, 4, 9, 0.2, 2, s, {}, 0.5, 0.4);
    fx.shake(0.2, p);
  },
  holyNova(fx, p, o, s) {
    const y = groundY(fx, p);
    fx.spawn(X.holyRing, p.x, y + 0.08, p.z, 0, 0, 0, { scale: s });
    fx.spawn(X.holyRingThin, p.x, y + 0.1, p.z, 0, 0, 0, { scale: s, dt: -0.08 });
    at(fx, HOLY.flash, p, s * 1.3, {}, 0, 1, 0);
    at(fx, X.starBurst, p, s * 1.2, {}, 0, 1, 0);
    for (let i = 0; i < 40; i++) {
      const a = fx.r(0, TAU), r = fx.r(0.5, 9) * s;
      fx.spawn(HOLY.mote, p.x + Math.cos(a) * r, y + fx.r(0.1, 0.6), p.z + Math.sin(a) * r, 0, fx.r(0.5, 1.5) * s, 0, { scale: s, dt: -r / (20 * s) });
    }
    radial(fx, HOLY.star, 20, p, 5, 10, 0.5, 2.5, s, {}, 0.3, 1);
  },
  blinkOut(fx, p, o, s) {
    at(fx, ARC.flash, p, s * 1.2, {}, 0, 1, 0);
    fx.spawn(X.blinkPillar, p.x, p.y, p.z, 0, 0, 0, { scale: s });
    sphere(fx, ARC.star, 26, up(p, 1), 2, 6, s);
    sphere(fx, ARC.spark, 16, up(p, 1), 3, 8, s);
    fx.spawn(X.runeFlat, p.x, groundY(fx, p) + 0.06, p.z, 0, 0, 0, { scale: s, tint: [0.75, 0.45, 1], life: 0.6 });
  },
  blinkIn(fx, p, o, s) {
    for (let i = 0; i < 40; i++) {
      const a = fx.r(0, TAU), rad = fx.r(1.2, 1.9) * s;
      fx.spawn(X.converge, p.x, p.y + fx.r(0.2, 1.9) * s, p.z, rad, a, fx.r(4, 8), { scale: s });
    }
    fx.spawn(X.blinkOrb, p.x, p.y + 1 * s, p.z, 0, 0, 0, { scale: s });
    fx.spawn(X.runeFlat, p.x, groundY(fx, p) + 0.06, p.z, 0, 0, 0, { scale: s, tint: [0.75, 0.45, 1], life: 0.7 });
    at(fx, ARC.flash, p, s * 1.2, { dt: -0.3 }, 0, 1, 0);
    fx.spawn(X.blinkPillar, p.x, p.y, p.z, 0, 0, 0, { scale: s, dt: -0.28 });
    sphere(fx, ARC.spark, 14, up(p, 1), 3, 7, s, { dt: -0.3 });
  },
  // ---------------------------------------------------------------- spell impacts
  fireImpact(fx, p, o, s) {
    at(fx, FIRE.flash, p, s, { size: 0.7, life: 0.7 });
    for (let i = 0; i < 4; i++) { fx.rdir(_d); fx.spawn(X.fireCoreBurst, p.x + _d.x * 0.15 * s, p.y + _d.y * 0.15 * s, p.z + _d.z * 0.15 * s, _d.x * s, _d.y * s + 0.5 * s, _d.z * s, { scale: s }); }
    sphere(fx, X.fireBurst, 16, p, 2.5, 5.5, s, {}, null, Math.PI, 0.15);
    sphere(fx, FIRE.lick, 8, p, 0.5, 1.5, s, { size: 1.6 }, _u, 0.8, 0.2);
    sphere(fx, FIRE.ember, 32, p, 4, 10, s);
    sphere(fx, FIRE.smokeWarm, 6, p, 0.5, 1.5, s, { dt: -0.12 });
    if (nearGround(fx, p, 2.2 * s)) {
      const y = groundY(fx, p) + 0.04;
      fx.spawn(FIRE.scorch, p.x, y, p.z, 0, 0, 0, { scale: s });
      fx.spawn(FIRE.groundGlow, p.x, y + 0.02, p.z, 0, 0, 0, { scale: s });
    }
    if (s > 1.5) fx.shake(0.3 * s / 2, p);
  },
  fireBlast(fx, p, o, s) {
    at(fx, FIRE.flash, p, s, { size: 0.8, life: 0.8 });
    for (let i = 0; i < 24; i++) {
      fx.rdir(_d, _u, 1.2);
      const sp = fx.r(1.5, 4.5) * s;
      fx.spawn(X.column, p.x + _d.x * 0.3 * s, p.y - 0.6 * s, p.z + _d.z * 0.3 * s, _d.x * sp * 0.6, _d.y * sp + 2.5 * s, _d.z * sp * 0.6, { scale: s * 0.75 });
    }
    for (let i = 0; i < 3; i++) fx.spawn(X.fireCoreBurst, p.x, p.y + i * 0.3 * s, p.z, 0, 1.5 * s, 0, { scale: s });
    sphere(fx, FIRE.ember, 30, p, 4, 10, s, {}, _u, 1.2);
    sphere(fx, FIRE.smokeWarm, 5, up(p, 0.8 * s), 0.5, 1.5, s, { dt: -0.2 });
  },
  frostImpact(fx, p, o, s) {
    at(fx, FROST.flash, p, s, { size: 0.6, life: 0.7 });
    at(fx, X.frostBloom, p, s);
    fx.meshFx.iceShatter(p.x, p.y, p.z, 9, s);
    sphere(fx, FROST.shard, 16, p, 3, 7, s, { size: 1.4 });
    sphere(fx, FROST.flake, 14, p, 1.5, 4, s, { size: 1.3 });
    sphere(fx, FROST.sparkle, 16, p, 2, 5, s);
    sphere(fx, FROST.spark, 14, p, 4, 9, s);
    sphere(fx, FROST.mist, 9, p, 0.8, 2.2, s, { size: 1.2 });
  },
  arcaneImpact(fx, p, o, s) {
    at(fx, ARC.flash, p, s, { size: 0.65, life: 0.8 });
    at(fx, X.arcBloom, p, s);
    for (let i = 0; i < 7; i++) fx.spawn(X.glyphOut, p.x, p.y - 0.2 * s, p.z, 0.2 * s, i / 7 * TAU, 1.2, { scale: s });
    sphere(fx, ARC.star, 22, p, 2, 6, s);
    sphere(fx, ARC.spark, 16, p, 4, 9, s);
    at(fx, X.swirlIn, p, s * 0.7, { tint: [0.9, 0.45, 1] });
  },
  shadowImpact(fx, p, o, s) {
    at(fx, SHD.flash, p, s, { size: 0.7, life: 0.8 });
    at(fx, X.shadowOrb, p, s);
    sphere(fx, SHD.smoke, 12, p, 1, 3.2, s, { size: 1.3 });
    sphere(fx, X.shadowBurst, 12, p, 1.5, 4, s);
    sphere(fx, SHD.spark, 18, p, 3, 8, s);
    at(fx, X.swirlIn, p, s, { tint: [0.6, 0.25, 1] });
  },
  holyImpact(fx, p, o, s) { // smite: a shaft of golden light from above
    const gy = groundY(fx, p);
    fx.spawn(X.smiteBeam, p.x, Math.min(p.y - 1.2 * s, gy + 0.02), p.z, 0, 0, 0, { scale: s });
    at(fx, HOLY.flash, p, s * 1.1);
    at(fx, HOLY.cross, p, s);
    sphere(fx, HOLY.star, 16, p, 2, 5, s);
    sphere(fx, HOLY.spark, 18, p, 3, 8, s, {}, _u, 1.4);
    fx.spawn(X.holyRingThin, p.x, gy + 0.08, p.z, 0, 0, 0, { scale: s * 0.45 });
  },
  // ---------------------------------------------------------------- big world events
  meteorImpact(fx, p, o, s) {
    const y = groundY(fx, p);
    const g = _d.set(p.x, y + 0.5 * s, p.z).clone();
    at(fx, X.meteorFlash, g, s, {}, 0, 1.5, 0);
    fx.spawn(X.fireRing, p.x, y + 0.1, p.z, 0, 0, 0, { scale: s * 1.8 });
    fx.spawn(PHYS.ring, p.x, y + 0.12, p.z, 0, 0, 0, { scale: s * 1.9, tint: [0.7, 0.6, 0.5], life: 1.6 });
    for (let i = 0; i < 40; i++) {
      fx.rdir(_d, _u, 1.35);
      const sp = fx.r(3, 11) * s;
      fx.spawn(X.column, g.x, g.y, g.z, _d.x * sp, _d.y * sp * 0.8 + 3 * s, _d.z * sp, { scale: s * 1.5, life: 1.3 });
    }
    for (let i = 0; i < 18; i++) { // second, slower rolling wave
      const a = fx.r(0, TAU), r = fx.r(0.5, 3) * s;
      fx.spawn(X.column, g.x + Math.cos(a) * r, g.y, g.z + Math.sin(a) * r, Math.cos(a) * 2 * s, fx.r(3, 7) * s, Math.sin(a) * 2 * s, { scale: s * 1.4, life: 1.5, dt: -fx.r(0.15, 0.4) });
    }
    sphere(fx, X.lavaBlob, 24, g, 6, 14, s, {}, _u, 1.1);
    sphere(fx, FIRE.ember, 60, g, 8, 18, s, {}, _u, 1.4);
    radial(fx, X.dustRing, 26, g, 8, 13, 0.2, 1.5, s, { size: 1.4 }, 1.2);
    for (let i = 0; i < 18; i++) fx.spawn(X.bigSmoke, g.x + fx.r(-2.5, 2.5) * s, g.y + fx.r(0, 2) * s, g.z + fx.r(-2.5, 2.5) * s, fx.r(-1.5, 1.5) * s, fx.r(3, 7) * s, fx.r(-1.5, 1.5) * s, { scale: s, dt: -fx.r(0.1, 0.6) });
    fx.meshFx.debris(g.x, g.y, g.z, 16, s * 1.2, 9);
    fx.spawn(FIRE.scorch, p.x, y + 0.05, p.z, 0, 0, 0, { scale: s * 3.2, life: 8 });
    fx.spawn(X.crackGlow, p.x, y + 0.07, p.z, 0, 0, 0, { scale: s * 2.2, life: 5, dt: -0.2 });
    fx.shake(1, p);
  },
  whelpSpawn(fx, p, o, s) {
    at(fx, FIRE.flash, p, s * 1.2, {}, 0, 0.8, 0);
    sphere(fx, FIRE.blob, 20, up(p, 0.8 * s), 2, 5, s);
    sphere(fx, FIRE.ember, 24, up(p, 0.8 * s), 3, 8, s);
    sphere(fx, FIRE.smokeWarm, 8, up(p, 0.8 * s), 1, 2.5, s, { dt: -0.12 });
    fx.spawn(X.fireRing, p.x, groundY(fx, p) + 0.08, p.z, 0, 0, 0, { scale: s * 0.6 });
  },
  enrageBurst(fx, p, o, s) {
    const y = groundY(fx, p);
    at(fx, X.redFlash, p, s * 1.2, {}, 0, 1.4, 0);
    fx.spawn(X.redRing, p.x, y + 0.08, p.z, 0, 0, 0, { scale: s });
    fx.spawn(X.redRing, p.x, y + 0.1, p.z, 0, 0, 0, { scale: s * 0.7, dt: -0.12 });
    for (let i = 0; i < 24; i++) {
      const a = fx.r(0, TAU), r = fx.r(0.2, 0.7) * s;
      fx.spawn(X.redWisp, p.x + Math.cos(a) * r, y + fx.r(0, 1.2) * s, p.z + Math.sin(a) * r, Math.cos(a) * s, fx.r(1, 3) * s, Math.sin(a) * s, { scale: s, dt: -fx.r(0, 0.3) });
    }
    radial(fx, X.redSpark, 24, p, 2, 6, 3, 8, s, {}, 0.3, 0.5);
    fx.shake(0.3, p);
  },
  spawnPuff(fx, p, o, s) {
    radial(fx, X.puff, 14, p, 1, 3.2, 0.4, 1.6, s, {}, 0.2, 0.5);
    fx.spawn(PHYS.ring, p.x, groundY(fx, p) + 0.06, p.z, 0, 0, 0, { scale: s * 0.45, tint: [0.8, 0.75, 1] });
    sphere(fx, ARC.star, 10, up(p, 0.8), 1, 3, s, { tint: [0.8, 0.8, 1] });
    at(fx, PHYS.hitFlash, p, s * 1.8, { tint: [0.8, 0.7, 1] }, 0, 0.8, 0);
  },
  questComplete(fx, p, o, s) {
    const c = _d.set(p.x, p.y + 2.2 * s, p.z).clone();
    at(fx, HOLY.flash, c, s * 1.1);
    at(fx, X.starBurst, c, s * 1.3);
    sphere(fx, X.confetti, 40, c, 3, 7, s, {}, _u, 1.5);
    sphere(fx, HOLY.star, 20, c, 2, 5, s);
    sphere(fx, X.riseSpark, 16, c, 2, 6, s, {}, _u, 0.9);
    fx.spawn(X.holyRingThin, p.x, groundY(fx, p) + 0.08, p.z, 0, 0, 0, { scale: s * 0.5 });
  },
  arrowHit(fx, p, o, s) {
    at(fx, PHYS.hitFlash, p, s * 0.5);
    const back = outDir(fx, p, o);
    sphere(fx, PHYS.spark, 5, p, 2, 5, s, {}, back, 1.0);
    if (nearGround(fx, p, 0.4)) radial(fx, PHYS.dust, 3, p, 0.3, 0.8, 0.2, 0.5, s * 0.5);
  },
  lavaSplash(fx, p, o, s) {
    const y = groundY(fx, p);
    const g = _d.set(p.x, Math.max(p.y, y) + 0.2, p.z).clone();
    at(fx, FIRE.flash, g, s * 1.4);
    sphere(fx, FIRE.blob, 18, g, 2, 5, s, {}, _u, 1.2);
    sphere(fx, X.lavaBlob, 16, g, 3, 7, s, {}, _u, 1.0);
    sphere(fx, FIRE.ember, 30, g, 4, 10, s, {}, _u, 1.3);
    for (let i = 0; i < 5; i++) fx.spawn(FIRE.smokeWarm, g.x, g.y + 0.5, g.z, fx.r(-1, 1), fx.r(1.5, 3), fx.r(-1, 1), { scale: s * 1.3, dt: -fx.r(0.05, 0.2) });
    fx.spawn(X.fireRing, p.x, y + 0.08, p.z, 0, 0, 0, { scale: s * 0.5 });
    fx.spawn(FIRE.scorch, p.x, y + 0.04, p.z, 0, 0, 0, { scale: s * 1.4, life: 5 });
    fx.spawn(FIRE.groundGlow, p.x, y + 0.06, p.z, 0, 0, 0, { scale: s * 1.2, life: 1.2 });
    fx.meshFx.debris(g.x, g.y, g.z, 5, s * 0.7, 5);
    fx.shake(0.25, p);
  },
  // ---------------------------------------------------------------- timed (instances)
  heal: {
    dur: 0.9, fade: 0.2,
    init(h) {
      const fx = h.fx, s = h.s;
      h.hold(X.healGlow, 0, 1.0, 0, { tint: h.tint, life: 1.2 });
      for (let i = 0; i < 3; i++) fx.spawn(HOLY.star, h.pos.x, h.pos.y + fx.r(0.5, 1.6) * s, h.pos.z, fx.r(-1, 1), fx.r(0.5, 1.5), fx.r(-1, 1), { scale: s, tint: h.tint });
    },
    tick(h) {
      const fx = h.fx, s = h.s, T = h.tint;
      h.emit('sw', 70, (bt) => {
        const arm = Math.floor(fx.rng.next() * 3);
        const a = arm * TAU / 3 + h.age * 7;
        fx.spawn(X.orbitStar, 0, fx.r(0, 0.3) * s, 0, 0.7 * s, a, 5.5, { anchor: h.anchor, scale: s, tint: T });
      });
      h.emit('mo', 40, () => fx.spawn(X.orbitMote, 0, fx.r(0, 0.6) * s, 0, fx.r(0.3, 0.7) * s, fx.r(0, TAU), fx.r(3, 6), { anchor: h.anchor, scale: s, tint: T }));
    },
  },
  bigHeal: {
    dur: 1.2, fade: 0.3,
    init(h) {
      const fx = h.fx, s = h.s;
      h.hold(X.healGlow, 0, 1.0, 0, { tint: h.tint, scale: 1.5, life: 1.2 });
      fx.spawn(X.pillarGold, 0, 0, 0, 0, 0, 0, { anchor: h.anchor, scale: s * 0.7, life: 1.4, tint: h.tint });
      fx.spawn(X.holyRingThin, 0, 0.1, 0, 0, 0, 0, { anchor: h.anchor, scale: s * 0.35, tint: h.tint });
      fx.spawn(X.starBurst, 0, 1.2 * s, 0, 0, 0, 0, { anchor: h.anchor, scale: s, tint: h.tint });
    },
    tick(h) {
      const fx = h.fx, s = h.s, T = h.tint;
      h.emit('sw', 110, () => {
        const arm = Math.floor(fx.rng.next() * 4);
        fx.spawn(X.orbitStar, 0, fx.r(0, 0.3) * s, 0, 0.7 * s, arm * TAU / 4 + h.age * 6, 5, { anchor: h.anchor, scale: s * 1.2, tint: T });
      });
      h.emit('mo', 60, () => fx.spawn(X.orbitMote, 0, fx.r(0, 0.8) * s, 0, fx.r(0.3, 1) * s, fx.r(0, TAU), fx.r(2, 5), { anchor: h.anchor, scale: s, tint: T }));
    },
  },
  levelUp: {
    dur: 2.5, fade: 0.4,
    init(h) {
      const fx = h.fx, s = h.s, A = h.anchor;
      fx.spawn(X.pillarGold, 0, 0, 0, 0, 0, 0, { anchor: A, scale: s });
      fx.spawn(X.pillarCore, 0, 0, 0, 0, 0, 0, { anchor: A, scale: s });
      fx.spawn(X.flatGlow, 0, 0.06, 0, 0, 0, 0, { anchor: A, scale: s, life: 2.4 });
      fx.spawn(HOLY.flash, 0, 1.2 * s, 0, 0, 0, 0, { anchor: A, scale: s * 2 });
      fx.spawn(X.starBurst, 0, 1.3 * s, 0, 0, 0, 0, { anchor: A, scale: s * 1.6 });
      [0, 0.25, 0.6, 1.1].forEach((d, i) => {
        fx.spawn(i % 2 ? X.holyRingThin : X.holyRing, 0, 0.08 + i * 0.01, 0, 0, 0, 0, { anchor: A, scale: s * (i % 2 ? 0.8 : 0.75), dt: -d });
      });
      for (let i = 0; i < 26; i++) {
        const a = fx.r(0, TAU), sp = fx.r(2, 5) * s;
        fx.spawn(HOLY.spark, 0, 0.3, 0, Math.cos(a) * sp, fx.r(1, 5) * s, Math.sin(a) * sp, { anchor: A, scale: s });
      }
      fx.shake(0.2, h.pos);
    },
    tick(h) {
      const fx = h.fx, s = h.s, A = h.anchor, k = Math.max(0, 1 - h.age / 2.3);
      h.emit('rs', 70 * k, () => {
        const a = fx.r(0, TAU), r = fx.r(0.2, 1.2) * s;
        fx.spawn(X.riseSpark, Math.cos(a) * r, fx.r(0, 0.5), Math.sin(a) * r, 0, fx.r(2, 5) * s, 0, { anchor: A, scale: s });
      });
      h.emit('os', 50 * k, () => fx.spawn(X.orbitStar, 0, fx.r(0, 0.5) * s, 0, fx.r(0.8, 1.3) * s, fx.r(0, TAU), fx.r(1.5, 3), { anchor: A, scale: s }));
      if (h.once('mid', 0.9)) fx.spawn(X.starBurst, 0, 2.2 * s, 0, 0, 0, 0, { anchor: A, scale: s * 1.2 });
    },
  },
  lootBeam: {
    dur: 12, fade: 0.6, maxDist: 400,
    init(h) {
      const t = h.tint || lin(0xa335ee);
      h.col = t;
      h.hold(X.lootCore, 0, 0, 0, { tint: t });
      h.hold(X.lootWide, 0, 0, 0, { tint: t });
      h.hold(X.lootBase, 0, 0.06, 0, { tint: t });
    },
    tick(h) {
      const fx = h.fx, s = h.s;
      h.emit('m', 10, () => { const a = fx.r(0, TAU), r = fx.r(0, 0.4) * s; fx.spawn(X.lootMote, Math.cos(a) * r, fx.r(0, 0.4), Math.sin(a) * r, 0, fx.r(0.5, 1.5) * s, 0, { anchor: h.anchor, scale: s, tint: h.col }); });
    },
  },
  resurrect: {
    dur: 2.2, fade: 0.4,
    init(h) {
      const fx = h.fx, s = h.s, A = h.anchor;
      fx.spawn(X.pillarGold, 0, 0, 0, 0, 0, 0, { anchor: A, scale: s * 0.9, life: 2.2, tint: [1, 1, 1.05] });
      fx.spawn(X.pillarCore, 0, 0, 0, 0, 0, 0, { anchor: A, scale: s, life: 2.0 });
      fx.spawn(X.flatGlow, 0, 0.06, 0, 0, 0, 0, { anchor: A, scale: s * 0.8, life: 2.2 });
      fx.spawn(HOLY.flash, 0, 1.2 * s, 0, 0, 0, 0, { anchor: A, scale: s * 2, dt: -1.0 });
      fx.spawn(X.holyRing, 0, 0.08, 0, 0, 0, 0, { anchor: A, scale: s * 0.6, dt: -1.0 });
      fx.spawn(HOLY.cross, 0, 1.4 * s, 0, 0, 0, 0, { anchor: A, scale: s * 1.3, dt: -1.0, life: 1.0 });
    },
    tick(h) {
      const fx = h.fx, s = h.s, A = h.anchor;
      if (h.age < 1.0) h.emit('d', 60, () => { // motes spiralling down onto the body
        fx.spawn(RES_DOWN, 0, fx.r(2.5, 3.5) * s, 0, fx.r(0.8, 1.2) * s, fx.r(0, TAU), fx.r(2, 4), { anchor: A, scale: s });
      });
      else h.emit('u', 40, () => fx.spawn(X.riseSpark, fx.r(-0.4, 0.4) * s, fx.r(0, 1.5) * s, fx.r(-0.4, 0.4) * s, 0, fx.r(1, 3) * s, 0, { anchor: A, scale: s }));
    },
  },
  death: {
    dur: 1.0, fade: 0.5,
    init(h) {
      const fx = h.fx, s = h.s;
      fx.spawn(X.spiritCore, h.pos.x, h.pos.y + 0.9 * s, h.pos.z, 0, 0.3, 0, { scale: s });
      fx.spawn(PHYS.hitFlash, h.pos.x, h.pos.y + 1 * s, h.pos.z, 0, 0, 0, { scale: s * 2, tint: [0.6, 0.85, 1] });
    },
    tick(h) {
      const fx = h.fx, s = h.s;
      h.emit('w', 14, (bt, x, y, z) => fx.spawn(X.wispUp, x, y + fx.r(0.3, 1.2) * s, z, fx.r(0.1, 0.4) * s, fx.r(0, TAU), fx.r(-2, 2), { scale: s }));
      h.emit('m', 20, (bt, x, y, z) => fx.spawn(MISC.spiritGlow, x + fx.r(-0.3, 0.3), y + fx.r(0.2, 1.4) * s, z + fx.r(-0.3, 0.3), 0, fx.r(0.5, 1), 0, { scale: s * 0.3 }));
    },
  },
  eruption: {
    dur: 2.4, fade: 0.2,
    init(h) {
      const fx = h.fx, s = h.s, p = h.pos, y = fx.heightAt(p.x, p.z);
      h.gy = y;
      fx.spawn(X.crackGlow, p.x, y + 0.06, p.z, 0, 0, 0, { scale: s, life: 2.6 });
      fx.spawn(FIRE.groundGlow, p.x, y + 0.08, p.z, 0, 0, 0, { scale: s * 1.3, life: 1.3 });
    },
    tick(h) {
      const fx = h.fx, s = h.s, p = h.pos, y = h.gy;
      if (h.age < 0.9) {
        h.emit('sm', 16, () => { const a = fx.r(0, TAU), r = fx.r(0, 1.4) * s; fx.spawn(FIRE.smoke, p.x + Math.cos(a) * r, y + 0.2, p.z + Math.sin(a) * r, 0, fx.r(0.5, 1.5) * s, 0, { scale: s * 0.8 }); });
        h.emit('em', 25, () => { const a = fx.r(0, TAU), r = fx.r(0, 1.4) * s; fx.spawn(FIRE.emberFloat, p.x + Math.cos(a) * r, y + 0.1, p.z + Math.sin(a) * r, 0, fx.r(1, 3) * s, 0, { scale: s }); });
      }
      if (h.once('boom', 0.9)) {
        const g = _d.set(p.x, y, p.z).clone();
        at(fx, X.meteorFlash, g, s * 0.6, {}, 0, 1, 0);
        for (let i = 0; i < 30; i++) {
          const a = fx.r(0, TAU), r = fx.r(0, 0.9) * s;
          fx.spawn(X.column, g.x + Math.cos(a) * r, g.y + 0.2, g.z + Math.sin(a) * r, Math.cos(a) * fx.r(0.5, 2) * s, fx.r(6, 13) * s, Math.sin(a) * fx.r(0.5, 2) * s, { scale: s });
        }
        sphere(fx, X.lavaBlob, 22, g, 5, 11, s, {}, _u, 0.6);
        sphere(fx, FIRE.ember, 40, g, 6, 14, s, {}, _u, 0.7);
        for (let i = 0; i < 6; i++) fx.spawn(X.bigSmoke, g.x + fx.r(-1, 1), g.y + fx.r(1, 3) * s, g.z + fx.r(-1, 1), fx.r(-1, 1), fx.r(3, 6) * s, fx.r(-1, 1), { scale: s * 0.8, dt: -fx.r(0.1, 0.4) });
        fx.spawn(X.fireRing, g.x, g.y + 0.1, g.z, 0, 0, 0, { scale: s * 0.8 });
        fx.meshFx.debris(g.x, g.y + 0.3, g.z, 9, s, 7);
        fx.spawn(FIRE.scorch, g.x, g.y + 0.05, g.z, 0, 0, 0, { scale: s * 1.8, life: 6 });
        fx.shake(0.6, g);
      }
      if (h.age > 0.9 && h.age < 1.8) {
        const k = 1 - (h.age - 0.9) / 0.9;
        h.emit('col', 70 * k, () => { const a = fx.r(0, TAU), r = fx.r(0, 0.7) * s; fx.spawn(X.column, p.x + Math.cos(a) * r, y + 0.2, p.z + Math.sin(a) * r, Math.cos(a) * s, fx.r(8, 15) * s, Math.sin(a) * s, { scale: s * 0.8 }); });
        h.emit('jet', 90 * k, () => { const a = fx.r(0, TAU), sp = fx.r(0.5, 3) * s; fx.spawn(X.lavaJet, p.x, y + 0.3, p.z, Math.cos(a) * sp, fx.r(11, 18) * s, Math.sin(a) * sp, { scale: s }); });
      }
    },
  },
};
for (const [n, d] of Object.entries({ hit: 0.4, crit: 0.4, blood: 0.4, arrowHit: 0.3, fireImpact: 0.35, frostImpact: 0.35, arcaneImpact: 0.35, shadowImpact: 0.35, fireBlast: 0.3 })) BURSTS[n].surface = d;
const P_HITSTAR = P({ sprite: S.star, ramp: R.wFlash, life: 0.12, size: 0.7, end: 1.4, color: [1, 0.9, 0.7], i: 3, noGround: true });
const SPLASH_RING = P({ pool: 'alpha', sprite: S.ring, ramp: R.water, life: 0.8, size: 0.4, end: 7, ease: 2.5, orient: 'flat', color: [1, 1, 1] });
const RES_DOWN = P({ sprite: S.star, ramp: R.holyWarm, life: [0.9, 1.1], size: [0.14, 0.22], end: 0.5, motion: 'orbit', rise: -2.8, rgrow: -0.9, spin: 3, i: [3, 5] });
