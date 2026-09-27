// Dragon breath: fx.cone(name, mouthSocket, { length = 14, angle = 0.6 (full cone angle, rad), duration, scale }).
// The stream follows the socket's -Z axis every frame (sub-frame interpolated position AND direction, so a sweeping
// head paints a continuous arc). Layers: big turbulent body blobs + hot core + smoke/mist + sparks, a mouth glow,
// and a ground-impact layer where the cone axis meets the terrain (splash, scorch, spreading flames).
import * as THREE from 'three';
import { S, R } from './textures.js';
import { P, lin, FIRE, FROST, SHD, STORM, POI } from './presets.js';

const _d = new THREE.Vector3(), _dir = new THREE.Vector3(), _q = new THREE.Quaternion(), _z = new THREE.Vector3(0, 0, 1), _g = new THREE.Vector3();
const TAU = Math.PI * 2;

function palette(el) {
  switch (el) {
    case 'fire': return {
      body: P({ pool: 'add', add: 0.5, sprite: [S.blob, S.blob, S.smoke1], ramp: R.fire, life: [0.62, 0.85], size: [0.5, 0.8], end: [5.5, 7.5], ease: 1.6, spin: [-2.5, 2.5], drag: 1.3, accY: 1.6, turb: 0.35, i: [1.5, 2.1] }),
      core: P({ sprite: [S.blob, S.glow], ramp: R.fireCore, life: [0.3, 0.42], size: [0.35, 0.5], end: [3, 3.8], ease: 1.4, spin: [-3, 3], drag: 1.1, i: [1.1, 1.5] }),
      smoke: P({ pool: 'alpha', sprite: [S.smoke1, S.smoke2, S.plume], ramp: R.fireSmokeWarm, life: [1.3, 1.9], size: [1.2, 1.6], end: [3, 4], ease: 1.8, spin: [-0.5, 0.5], drag: 1.6, accY: 2.2, turb: 0.5 }),
      spark: FIRE.ember, sparkRate: 90, glow: [1, 0.5, 0.15],
      splash: P({ sprite: [S.blob, S.blob, S.smoke1], ramp: R.fire, life: [0.45, 0.8], size: [1.1, 1.6], end: [1.6, 2.2], ease: 2, rot: [-0.3, 0.3], spin: [-0.6, 0.6], drag: 2.2, accY: 3.5, turb: 0.3, i: [1.8, 2.5] }),
      mark: FIRE.scorch, markTint: null, groundGlow: [1, 0.4, 0.08],
    };
    case 'frost': return {
      body: P({ pool: 'add', add: 0.5, sprite: [S.blob, S.smoke1, S.smoke3], ramp: R.frost, life: [0.62, 0.85], size: [0.5, 0.8], end: [5, 7], ease: 1.6, spin: [-2, 2], drag: 1.3, accY: -0.4, turb: 0.3, i: [1.3, 1.8] }),
      core: P({ sprite: [S.blob, S.glow], ramp: R.frostCore, life: [0.3, 0.42], size: [0.35, 0.5], end: [3, 3.8], ease: 1.4, spin: [-3, 3], drag: 1.1, i: [1.0, 1.4] }),
      smoke: P({ pool: 'alpha', sprite: [S.smoke1, S.smoke2, S.smoke3], ramp: R.frostMist, life: [1.3, 1.9], size: [1.2, 1.6], end: [3, 4], ease: 1.8, spin: [-0.5, 0.5], drag: 1.8, accY: -0.6, turb: 0.4 }),
      spark: FROST.shard, sparkRate: 50, extra: FROST.flake, extraRate: 60, glow: [0.4, 0.75, 1],
      splash: P({ pool: 'alpha', sprite: [S.smoke1, S.smoke2, S.smoke3], ramp: R.frostMist, life: [1.0, 1.5], size: [1, 1.4], end: [2, 2.6], ease: 2, drag: 2.5, accY: 0.2, turb: 0.3, alpha: 1.4 }),
      mark: P({ sprite: S.snow, ramp: R.wInOut, life: [2.5, 3.5], size: [1, 1.6], orient: 'flat', color: [0.6, 0.85, 1], i: 1.3 }), groundGlow: [0.3, 0.6, 1],
    };
    case 'venom': return {
      body: P({ pool: 'add', add: 0.5, sprite: [S.blob, S.smoke1, S.smoke2], ramp: R.poison, life: [0.62, 0.85], size: [0.5, 0.8], end: [5, 7], ease: 1.6, spin: [-2, 2], drag: 1.3, accY: 0.3, turb: 0.35, i: [1.3, 1.8] }),
      core: P({ sprite: [S.blob, S.glow], ramp: R.venomCore, life: [0.3, 0.42], size: [0.35, 0.5], end: [3, 3.8], ease: 1.4, spin: [-3, 3], drag: 1.1, i: [1.0, 1.4] }),
      smoke: P({ pool: 'alpha', sprite: [S.smoke1, S.smoke2, S.smoke3], ramp: R.poisonMist, life: [1.4, 2], size: [1.3, 1.7], end: [3, 4], ease: 1.8, spin: [-0.5, 0.5], drag: 1.7, accY: 0.5, turb: 0.5, alpha: 1.3 }),
      spark: P({ sprite: S.drop, ramp: R.venomGoo, life: [0.5, 0.8], size: [0.1, 0.16], orient: 'stretch', stretch: 0.25, drag: 0.8, accY: -12, i: [1.6, 2.2] }), sparkRate: 70, glow: [0.45, 1, 0.2],
      splash: P({ sprite: S.bubble, ramp: R.poison, life: [0.5, 0.9], size: [0.2, 0.4], end: 1.6, drag: 2, accY: 1, i: [1.5, 2.2] }),
      mark: P({ pool: 'alpha', sprite: S.scorch, ramp: R.scorch, life: [3, 4], size: [1.6, 2.2], orient: 'flat', color: [2, 5, 0.6] }), groundGlow: [0.4, 1, 0.15],
    };
    case 'storm': return {
      body: P({ pool: 'add', add: 0.5, sprite: [S.blob, S.smoke1, S.glow], ramp: R.storm, life: [0.5, 0.7], size: [0.5, 0.8], end: [4.5, 6], ease: 1.6, spin: [-3, 3], drag: 1.2, turb: 0.3, i: [1.2, 1.7] }),
      core: P({ sprite: [S.glow, S.flash], ramp: R.stormCore, life: [0.25, 0.35], size: [0.35, 0.5], end: [2.6, 3.4], ease: 1.4, drag: 1.0, i: [1.1, 1.5] }),
      smoke: P({ pool: 'alpha', sprite: [S.smoke1, S.smoke2, S.smoke3], ramp: R.smoke, life: [1.2, 1.7], size: [1.2, 1.6], end: [2.8, 3.6], ease: 1.8, spin: [-0.5, 0.5], drag: 1.8, accY: 0.8, turb: 0.5, color: [0.55, 0.65, 1.0] }),
      spark: STORM.spark, sparkRate: 120, bolts: true, glow: [0.45, 0.65, 1],
      splash: STORM.spark, splashRate: 3,
      mark: P({ sprite: S.shock, ramp: R.storm, life: 0.35, size: 0.6, end: 6, ease: 3, orient: 'flat', i: 2 }), groundGlow: [0.35, 0.55, 1],
    };
    case 'shadow': return {
      body: P({ pool: 'alpha', sprite: [S.smoke1, S.smoke2, S.blob], ramp: R.void, life: [0.62, 0.85], size: [0.5, 0.8], end: [5.5, 7.5], ease: 1.6, spin: [-2, 2], drag: 1.3, accY: 0.5, turb: 0.35, alpha: 1.1 }),
      core: P({ sprite: [S.blob, S.glow], ramp: R.shadow, life: [0.45, 0.65], size: [0.45, 0.65], end: [4.5, 5.5], ease: 1.4, spin: [-4, 4], drag: 1.2, turb: 0.25, i: [0.9, 1.3] }),
      smoke: P({ pool: 'alpha', sprite: [S.smoke1, S.smoke2, S.smoke3], ramp: R.void, life: [1.3, 1.8], size: [1.3, 1.7], end: [3, 4], ease: 1.8, spin: [-0.5, 0.5], drag: 1.7, accY: 0.8, turb: 0.5 }),
      spark: SHD.spark, sparkRate: 80, glow: [0.6, 0.2, 1],
      splash: SHD.wisp,
      mark: P({ sprite: S.swirl, ramp: R.wInOut, life: [1.5, 2.2], size: [1.6, 2.2], orient: 'flat', spin: 2, color: [0.6, 0.2, 1], i: 1.5 }), groundGlow: [0.5, 0.15, 1],
    };
  }
}

function breath(el) {
  const C = palette(el);
  const mouth = P({ sprite: S.glow, ramp: R.wPulse, life: 0.14, size: 2.6, color: C.glow, i: 2.4, pingpong: true, noGround: true });
  const mouthCore = P({ sprite: S.flash, ramp: R.wPulse, life: 0.1, size: 1.2, color: [1, 1, 1], i: 2.5, pingpong: true, noGround: true });
  const gGlow = P({ sprite: S.glow, ramp: R.wInOut, life: 0.5, size: 6, orient: 'flat', color: C.groundGlow, i: 1.3 });
  const bolt = P({ sprite: S.bolt, ramp: R.wFlash, life: [0.07, 0.14], size: [2.6, 4.2], color: [0.6, 0.8, 1], i: [3, 4.5] });
  return {
    fade: 0.35, maxDist: Infinity,
    init(h) {
      h.hold(mouth, 0, 0, 0, { scale: 1 }); h.hold(mouthCore);
      h.markT = 0;
    },
    tick(h, dt) {
      const fx = h.fx, s = h.s, L = h.length * s, half = h.angle / 2;
      // Scale the stream to the requested cone: particles cover L in T seconds with the design's drag shape
      // (k·T ≈ 0.975), speed capped ~36 m/s until T hits 2.5 s; end size follows the cone's end radius.
      const T = Math.min(2.5, Math.max(0.75, L / 23)), v0 = L / (0.64 * T), kd = 0.975 / T;
      const lifeK = T / 0.75, rEnd = L * Math.tan(Math.min(half, 1.2)), sizeK = Math.max(0.7, rEnd / 4.3);
      const rateK = Math.min(1.7, 1 + (lifeK - 1) * 0.3 + (sizeK - 1) * 0.1);
      // additive overlap along a view ray grows ~ N·R/L; normalise brightness to the 14 m design cone
      const overlap = 210 * rateK * T * rEnd / L, iK = Math.min(1, Math.max(0.5, Math.pow(48.7 / overlap, 0.3)));
      const O = { scale: s, life: lifeK, drag: kd, end: sizeK, i: iK, alpha: C.body.pool === 'alpha' ? Math.max(0.5, iK) : 1 };
      const dirAt = (f, out) => out.copy(h.dir).lerp(h.pdir, f).normalize();
      const startRamp = Math.min(1, h.age / 0.25);  // ramps up over the first 0.25 s
      // body
      h.emit('body', 210 * startRamp * rateK, (bt, x, y, z, f) => {
        dirAt(f, _dir); fx.rdir(_d, _dir, half * Math.sqrt(fx.rng.next()) * 0.85);
        const sp = v0 * fx.r(0.85, 1.1);
        fx.spawn(C.body, x + _d.x * 0.3, y + _d.y * 0.3, z + _d.z * 0.3, _d.x * sp, _d.y * sp, _d.z * sp, O);
      });
      h.emit('core', 100 * startRamp * Math.min(1.6, rateK), (bt, x, y, z, f) => {
        dirAt(f, _dir); fx.rdir(_d, _dir, half * 0.3 * fx.rng.next());
        const sp = v0 * 1.35 * fx.r(0.9, 1.1);
        fx.spawn(C.core, x, y, z, _d.x * sp, _d.y * sp, _d.z * sp, { scale: s, life: lifeK * 0.9, drag: kd * 1.4, end: Math.max(1, sizeK * 0.6), i: Math.sqrt(iK) });
      });
      h.emit('smoke', 34 * startRamp * rateK, (bt, x, y, z, f) => {
        dirAt(f, _dir); fx.rdir(_d, _dir, half * 0.9);
        const sp = v0 * fx.r(0.45, 0.7);
        fx.spawn(C.smoke, x + _d.x * 2 * s, y + _d.y * 2 * s, z + _d.z * 2 * s, _d.x * sp, _d.y * sp, _d.z * sp, { scale: s, life: lifeK, drag: kd * 1.3, end: Math.max(1, sizeK * 0.8) });
      });
      h.emit('spark', C.sparkRate * startRamp * rateK, (bt, x, y, z, f) => {
        dirAt(f, _dir); fx.rdir(_d, _dir, half * 1.1);
        const sp = v0 * fx.r(0.8, 1.5);
        fx.spawn(C.spark, x, y, z, _d.x * sp, _d.y * sp, _d.z * sp, { scale: s, life: Math.min(lifeK, 2) });
      });
      if (C.extra) h.emit('extra', C.extraRate * rateK, (bt, x, y, z, f) => {
        dirAt(f, _dir); fx.rdir(_d, _dir, half);
        const sp = v0 * fx.r(0.5, 0.9);
        fx.spawn(C.extra, x, y, z, _d.x * sp, _d.y * sp, _d.z * sp, { scale: s * 1.5, life: Math.min(lifeK, 2) });
      });
      if (C.bolts) h.emit('bolt', 30, () => {
        const u = fx.r(0.15, 0.9);
        fx.rdir(_d, h.dir, half * 0.6);
        fx.spawn(bolt, h.pos.x + _d.x * L * u, h.pos.y + _d.y * L * u, h.pos.z + _d.z * L * u, 0, 0, 0, { scale: s * (0.6 + u) * Math.sqrt(sizeK), rot: fx.r(0, TAU) });
      });
      // ground impact along the cone axis
      const hit = groundHit(fx, h.pos, h.dir, L * 1.05);
      if (hit) {
        const gx = hit.x, gz = hit.z, gy = hit.y, rad = Math.max(1, hit.d * Math.tan(Math.min(half, 1.2))) * 0.9;
        h.emit('spl', (C.splashRate ?? 1) * 55 * Math.min(2, Math.sqrt(rad / 2.5)), () => {
          const a = fx.r(0, TAU), r = Math.sqrt(fx.rng.next()) * rad;
          const x = gx + Math.cos(a) * r, z = gz + Math.sin(a) * r, sp = fx.r(2, 5) * s;
          fx.spawn(C.splash, x, fx.heightAt(x, z) + 0.3, z, Math.cos(a) * sp + h.dir.x * 3, fx.r(1, 3) * s, Math.sin(a) * sp + h.dir.z * 3, { scale: s });
        });
        h.markT -= dt;
        if (h.markT <= 0) {
          h.markT = 0.12;
          const a = fx.r(0, TAU), r = Math.sqrt(fx.rng.next()) * rad * 0.8, x = gx + Math.cos(a) * r, z = gz + Math.sin(a) * r;
          fx.spawn(C.mark, x, fx.heightAt(x, z) + 0.05, z, 0, 0, 0, { scale: s * fx.r(0.9, 1.4) });
          fx.spawn(gGlow, gx, gy + 0.08, gz, 0, 0, 0, { scale: s * Math.min(2.2, rad / 2.5 + 0.5) });
        }
      }
    },
  };
}
function groundHit(fx, o, d, L) {
  let prevT = 0;
  for (let t = 0.5; t <= L; t += 0.75) {
    const x = o.x + d.x * t, y = o.y + d.y * t, z = o.z + d.z * t;
    const gy = fx.heightAt(x, z);
    if (y <= gy) {
      // refine
      let a = prevT, b = t;
      for (let i = 0; i < 5; i++) { const m = (a + b) / 2; if (o.y + d.y * m <= fx.heightAt(o.x + d.x * m, o.z + d.z * m)) b = m; else a = m; }
      const tt = (a + b) / 2;
      const x2 = o.x + d.x * tt, z2 = o.z + d.z * tt;
      return { x: x2, y: fx.heightAt(x2, z2), z: z2, d: tt };
    }
    prevT = t;
  }
  return null;
}

export const BREATHS = {
  fireBreath: breath('fire'),
  frostBreath: breath('frost'),
  venomBreath: breath('venom'),
  stormBreath: breath('storm'),
  shadowBreath: breath('shadow'),
};
