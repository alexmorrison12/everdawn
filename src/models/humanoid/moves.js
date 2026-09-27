// Authored procedural moves: weapon holds, cast holds, one-shot actions, emotes and dances.
// Every fn writes angles into a pose that starts as a copy of the current (locomotion) pose.
import { B } from './rig.js';
import { setArm, setFingers, setClav, stance } from './pose.js';

/** smooth keyed curve: K(u, u0, v0, u1, v1, ...) */
export function K(u, ...kv) {
  if (u <= kv[0]) return kv[1];
  for (let i = 2; i < kv.length; i += 2) {
    if (u <= kv[i]) { const t = (u - kv[i - 2]) / (kv[i] - kv[i - 2] || 1); const s = t * t * (3 - 2 * t); return kv[i - 1] + (kv[i + 1] - kv[i - 1]) * s; }
  }
  return kv[kv.length - 1];
}
const sin = Math.sin, cos = Math.cos, PI = Math.PI;
const tri = x => { x = x - Math.floor(x); return x < 0.5 ? x * 4 - 1 : 3 - x * 4; }; // -1..1 triangle
const pulse = (x, w = 0.25) => { x = x - Math.floor(x); return x < w ? sin(x / w * PI) : 0; };

// ------------------------------------------------------------------------------------------------
// weapon-ready holds (upper body)
export function holdPose(p, style, t, ctx, A, bob = 0) {
  const b = bob * 0.05;
  switch (style) {
    case '2h':
      setArm(p, 'R', 0.62 + b, 0.1, 0.25, 1.35, 0.35, 0.55, 1.3);
      setArm(p, 'L', 0.8 + b, -0.18, -0.35, 1.45, 0.2, 0.4, 1.3);
      p.add(B.chest, 0, 0.18, 0);
      break;
    case 'staff':
      setArm(p, 'R', 0.3 + b, 0.22, 0.25, 1.05, 0.15, 0.25, 1.25);
      setArm(p, 'L', 0.7 + b, 0.28, -0.25, 1.35, -0.25, 0, 0.35);
      break;
    case 'bow':
      setArm(p, 'L', 0.55 + b, 0.28, -0.1, 0.55, 0, 0.15, 1.25);
      setArm(p, 'R', 0.35, 0.22, 0.1, 0.9, 0, 0, 0.8);
      break;
    case 'dual':
      setArm(p, 'R', 0.62 + b, 0.3, 0.1, 1.5, 0.1, 0.5, 1.25);
      setArm(p, 'L', 0.62 - b, 0.3, 0.1, 1.5, 0.1, 0.5, 1.25);
      break;
    case '1hShield':
      setArm(p, 'R', 0.55 + b, 0.3, 0.1, 1.4, 0.1, 0.5, 1.25);
      setArm(p, 'L', 0.95 - b, 0.3, -0.85, 1.55, 0, 0.2, 1.15);
      break;
    case '1hCaster':
      setArm(p, 'R', 0.55 + b, 0.3, 0.1, 1.4, 0.1, 0.5, 1.25);
      setArm(p, 'L', 0.8 - b, 0.22, -0.35, 1.3, -0.3, 0, 0.3);
      break;
    case '1h':
      setArm(p, 'R', 0.55 + b, 0.3, 0.1, 1.4, 0.1, 0.5, 1.25);
      setArm(p, 'L', 0.6 - b, 0.32, 0, 1.55, 0, 0, 1.2);
      break;
    default: // fists
      setArm(p, 'R', 0.7 + b, 0.35, 0.3, 1.9, 0.1, 0.2, 1.3);
      setArm(p, 'L', 0.8 - b, 0.35, 0.3, 1.95, 0.1, 0.2, 1.3);
  }
  setClav(p, 'L', 0.06); setClav(p, 'R', 0.06);
}

// casting holds (state.casting)
export function castPose(p, type, t, ctx, A) {
  const tr = sin(t * 23) * 0.012, sw = sin(t * 2.2) * 0.04;
  if (type === 'omni') {
    setArm(p, 'L', 0.9 + sw, 0.95, -0.9, 0.5, -0.5, 0, 0.12);
    setArm(p, 'R', 0.9 - sw, 0.95, -0.9, 0.5, -0.5, 0, 0.12);
    p.add(B.head, -0.25, 0, 0); p.add(B.chest, 0.08, 0, 0);
    setClav(p, 'L', 0.18); setClav(p, 'R', 0.18);
  } else if (type === 'channel') {
    setArm(p, 'R', 1.4 + tr, 0.2, -1.2, 0.2, -0.9, 0, 0.1);
    setArm(p, 'L', 1.25 - tr, 0.35, -1.0, 0.45, -0.7, 0, 0.15);
    p.add(B.chest, -0.1, 0.12, 0); p.add(B.head, 0.05, -0.08, 0);
  } else { // directed: gather energy between the hands in front of the chest
    setArm(p, 'R', 0.85 + tr, -0.05, -0.2, 1.75, -0.4, 0.1, 0.25);
    setArm(p, 'L', 0.85 - tr, -0.05, -0.2, 1.75, -0.4, 0.1, 0.25);
    p.add(B.chest, -0.1 + sw * 0.5, -0.12, 0); p.add(B.spine, -0.05, -0.1, 0); p.add(B.head, 0.08, 0.1, 0);
  }
}

// ------------------------------------------------------------------------------------------------
// one-shot actions. u in [0,1). full: take over the legs when standing still.
function stepFwd(p, u, amt, t0, t1, ctx) { // left foot steps forward during [t0,t1]
  const k = K(u, t0, 0, t1, 1, 0.85, 1, 1, 0);
  p.feet[2] -= 0.3 * amt * k; p.feet[1] += 0.06 * amt * Math.sin(Math.min(1, Math.max(0, (u - t0) / (t1 - t0))) * PI);
  p.hip[2] -= 0.12 * amt * k; p.hip[1] -= 0.06 * amt * k;
}
export const ACTIONS = {
  attack1h: { dur: 0.62, full: true, blendIn: 0.1, blendOut: 0.78, fn(p, u, ctx) { // overhead diagonal slash
    const tw = K(u, 0, 0, 0.32, -0.45, 0.5, 0.5, 0.7, 0.55, 1, 0);
    p.add(B.spine, K(u, 0, 0, 0.32, 0.08, 0.5, -0.18, 1, 0), tw * 0.4, 0);
    p.add(B.chest, K(u, 0, 0, 0.32, 0.12, 0.5, -0.2, 1, 0), tw * 0.6, 0);
    setArm(p, 'R', K(u, 0, 0.6, 0.32, 2.6, 0.48, 0.7, 0.7, 0.35, 1, 0.55), K(u, 0, 0.3, 0.32, 0.55, 0.48, -0.2, 0.7, -0.45, 1, 0.3), 0.2,
      K(u, 0, 1.4, 0.32, 1.7, 0.48, 0.25, 0.7, 0.4, 1, 1.4), 0.1, K(u, 0, 0.5, 0.32, 0.9, 0.48, -0.2, 1, 0.5), 1.3);
    setArm(p, 'L', K(u, 0, 0.6, 0.32, 0.9, 0.5, -0.1, 1, 0.6), 0.35, 0, 1.3, 0, 0, 1.2);
    stepFwd(p, u, 1, 0.3, 0.5, ctx);
  } },
  attack1hB: { dur: 0.58, full: true, blendIn: 0.1, blendOut: 0.78, fn(p, u, ctx) { // horizontal sweep R->L
    const tw = K(u, 0, 0, 0.3, -0.6, 0.5, 0.6, 0.72, 0.5, 1, 0);
    p.add(B.spine, -0.05, tw * 0.45, 0); p.add(B.chest, -0.05, tw * 0.55, 0);
    setArm(p, 'R', K(u, 0, 0.6, 0.3, 0.9, 0.5, 1.35, 0.72, 1.1, 1, 0.55), K(u, 0, 0.3, 0.3, 1.25, 0.5, 0.0, 0.72, -0.55, 1, 0.3), K(u, 0, 0.1, 0.3, 0.6, 0.5, -0.4, 1, 0.1),
      K(u, 0, 1.4, 0.3, 1.2, 0.5, 0.15, 0.72, 0.5, 1, 1.4), 0.1, K(u, 0, 0.5, 0.3, 0.2, 0.5, 0.0, 1, 0.5), 1.3);
    setArm(p, 'L', K(u, 0, 0.6, 0.3, 0.9, 0.55, 0.2, 1, 0.6), 0.4, 0, 1.3, 0, 0, 1.2);
    stepFwd(p, u, 0.7, 0.28, 0.5, ctx);
  } },
  attack2h: { dur: 0.95, full: true, blendIn: 0.1, blendOut: 0.8, fn(p, u, ctx) { // big overhead chop
    const up = K(u, 0, 0, 0.4, 1, 0.56, 0, 1, 0);
    const down = K(u, 0.4, 0, 0.56, 1, 0.8, 1, 1, 0);
    p.add(B.spine, 0.15 * up - 0.3 * down, -0.2 * up + 0.15 * down, 0);
    p.add(B.chest, 0.15 * up - 0.3 * down, -0.15 * up + 0.1 * down, 0);
    p.add(B.head, -0.1 * up + 0.2 * down, 0, 0);
    setArm(p, 'R', 0.62 + 2.1 * up + 0.55 * down, 0.1 + 0.2 * up - 0.1 * down, 0.25, 1.35 + 0.4 * up - 1.05 * down, 0.35, 0.55 + 0.5 * up - 0.35 * down, 1.3);
    setArm(p, 'L', 0.8 + 2.0 * up + 0.45 * down, -0.18 + 0.1 * up, -0.35, 1.45 + 0.3 * up - 1.05 * down, 0.2, 0.4, 1.3);
    stepFwd(p, u, 1.2, 0.42, 0.58, ctx);
    p.hip[1] -= 0.08 * down;
  } },
  attackOff: { dur: 0.5, full: false, fn(p, u) {
    const k = K(u, 0, 0, 0.3, -0.3, 0.5, 1, 0.75, 0.8, 1, 0);
    p.add(B.chest, 0, -0.35 * Math.max(0, k), 0); p.add(B.spine, 0, -0.2 * Math.max(0, k), 0);
    setArm(p, 'L', 0.6 + 1.0 * Math.max(0, k) - 0.3 * Math.min(0, k), 0.3 - 0.35 * Math.max(0, k), 0.1, 1.5 - 1.3 * Math.max(0, k) + 0.3 * -Math.min(0, k), 0.1, 0.45, 1.25);
  } },
  shieldBash: { dur: 0.62, full: true, fn(p, u, ctx) {
    const k = K(u, 0, 0, 0.3, -0.4, 0.5, 1, 0.72, 0.9, 1, 0);
    const kp = Math.max(0, k), kn = Math.max(0, -k);
    p.add(B.chest, -0.2 * kp, 0.3 * kn - 0.45 * kp, 0); p.add(B.spine, -0.1 * kp, -0.25 * kp, 0);
    setArm(p, 'L', 0.95 + 0.45 * kp - 0.2 * kn, 0.3 - 0.1 * kp, -0.85 + 0.2 * kp, 1.55 - 0.7 * kp + 0.2 * kn, 0, 0.2, 1.15);
    stepFwd(p, u, 1.1, 0.32, 0.5, ctx);
  } },
  shoot: { dur: 1.15, full: true, blendIn: 0.08, blendOut: 0.85, fn(p, u, ctx, A) { // bow: turn side-on, draw to the chin, release
    const aim = K(u, 0, 0, 0.2, 1, 0.9, 1, 1, 0.3);
    const draw = K(u, 0.18, 0, 0.52, 1, 0.66, 1, 0.68, 0.3, 0.85, 0);
    const rel = K(u, 0.66, 0, 0.7, 1, 0.88, 0.6, 1, 0);
    p.add(B.spine, 0, -0.5 * aim, 0); p.add(B.chest, -0.04 * aim, -0.55 * aim, 0);
    p.add(B.neck, 0, 0.5 * aim, 0); p.add(B.head, 0.04, 0.55 * aim, 0.12 * aim);
    // bow arm points at the target (left-forward in the turned chest frame)
    setArm(p, 'L', 0.55 + 0.35 * aim, 0.28 + 1.05 * aim, -0.1 - 0.9 * aim, 0.5 - 0.42 * aim, 0, 0.15, 1.25);
    setClav(p, 'L', 0.06 * aim, 0.12 * aim);
    // draw hand: IK from the string (near the bow hand) to the chin, flies back on release
    const Rg = A.rig, ch = Rg.chin;
    const s0 = [-Rg.shX * 2.1, Rg.shY + 0.03, -0.25 * Rg.bodyScale], s1 = [ch[0] + 0.035 * Rg.hs, ch[1] - 0.005, ch[2] - 0.075 * Rg.hs], s2 = [Rg.shX * 1.1, Rg.shY + 0.16, 0.1 * Rg.bodyScale];
    const t = [0, 1, 2].map(i => s0[i] + (s1[i] - s0[i]) * draw + (s2[i] - s1[i]) * rel * 0.8);
    const r = A.armIK.R; r.t[0] = t[0]; r.t[1] = t[1]; r.t[2] = t[2];
    r.pole[0] = 1; r.pole[1] = 0.35; r.pole[2] = 0.7; r.w = aim;
    setFingers(p, 'R', 0.9 - 0.7 * rel, 0.6, 0.6);
    setClav(p, 'R', 0.1 * aim, -0.12 * draw);
    ctx.bowDraw = draw * aim;
  } },
  castDirected: { dur: 0.7, full: false, blendIn: 0.05, blendOut: 0.75, fn(p, u) {
    const g = K(u, 0, 0, 0.35, 1, 0.45, 0, 1, 0);
    const r = K(u, 0.35, 0, 0.47, 1, 0.75, 1, 1, 0);
    p.add(B.chest, 0.05 * g - 0.18 * r, -0.4 * g + 0.3 * r, 0); p.add(B.spine, 0, -0.2 * g + 0.15 * r, 0);
    setArm(p, 'R', 0.7 * g + 1.45 * r + 0.3 * (1 - g - r), 0.5 * g + 0.05 * r, -0.1, 1.9 * g + 0.15 * r + 0.3 * (1 - g - r), -0.9 * r, 0.1, 0.4 - 0.35 * r);
    setArm(p, 'L', 0.8 * g + 1.0 * r + 0.3 * (1 - g - r), 0.1 * g + 0.25 * r, -0.2, 1.7 * g + 0.6 * r + 0.3 * (1 - g - r), -0.5 * r, 0.1, 0.35);
  } },
  castOmni: { dur: 0.95, full: true, fn(p, u) {
    const up = K(u, 0, 0, 0.45, 1, 0.58, 0, 1, 0);
    const out = K(u, 0.45, 0, 0.58, 1, 0.82, 1, 1, 0);
    p.add(B.chest, 0.15 * up - 0.2 * out, 0, 0); p.add(B.head, -0.35 * up + 0.1 * out, 0, 0);
    for (const s of ['L', 'R']) setArm(p, s, 0.4 + 0.5 * up + 0.3 * out, 0.3 + 2.3 * up + 0.9 * out, -0.4, 0.5 - 0.3 * up, -0.3, 0, 0.15);
    p.hip[1] -= 0.1 * out;
    setClav(p, 'L', 0.25 * up); setClav(p, 'R', 0.25 * up);
  } },
  dodge: { dur: 0.5, full: true, fn(p, u) {
    const k = K(u, 0, 0, 0.35, 1, 1, 0);
    const s = 1;
    p.hip[0] += 0.35 * k * s; p.hip[1] -= 0.12 * k;
    p.feet[0] += 0.25 * k * s; p.feet[5] += 0.45 * k * s; p.feet[6] += 0.12 * Math.sin(Math.min(1, u / 0.35) * PI);
    p.add(B.hips, 0, 0, -0.15 * k * s); p.add(B.spine, 0, 0, 0.25 * k * s); p.add(B.chest, -0.1 * k, 0, 0.2 * k * s);
    setArm(p, 'L', 0.6, 0.5 + 0.5 * k, 0, 1.0, 0, 0, 0.6); setArm(p, 'R', 0.4, 0.3 + 0.3 * k, 0, 1.2, 0, 0, 0.6);
  } },
  roar: { dur: 1.35, full: true, fn(p, u) {
    const k = K(u, 0, 0, 0.25, 1, 0.8, 1, 1, 0);
    const sh = Math.sin(u * 60) * 0.02 * k;
    p.add(B.chest, 0.18 * k + sh, 0, 0); p.add(B.spine, 0.06 * k, 0, 0);
    p.add(B.neck, -0.15 * k, 0, 0); p.add(B.head, -0.25 * k + sh * 2, 0, 0);
    for (const s of ['L', 'R']) { setArm(p, s, -0.25 * k, 0.55 * k + 0.15, 0.3, 0.9 * k + 0.2, 0.3, 0, 1.4); setClav(p, s, 0.15 * k); }
    p.hip[1] -= 0.08 * k;
    p.face = u > 0.2 && u < 0.85 ? 2 : 0;
  } },
  draw: { dur: 0.45, full: false, fn(p, u, ctx) {
    const k = Math.sin(u * PI);
    setArm(p, 'R', 2.2 * k + 0.2, 0.5 * k, 0.2, 1.8 * k, 0.2, 0, 1.0);
  } },
};

// ------------------------------------------------------------------------------------------------
// emotes (full body; cancelled by movement). fn(p, t, ctx, A) with t in seconds
export const EMOTES = {
  wave: { dur: 2.2, fn(p, t) {
    const k = K(t, 0, 0, 0.3, 1, 1.9, 1, 2.2, 0);
    const w = Math.sin(t * 9) * 0.35 * k;
    setArm(p, 'R', 0.5 * k, 0.3 + 2.0 * k, -0.5 * k, 0.4 + 0.5 * k + w * 0.3, -0.2, 0, 0.1);
    p.set(B.farmR, 0.4 + 0.5 * k, w * 1.2, 0);
    p.add(B.head, 0.05 * k, 0.1 * k, -0.12 * k); p.add(B.chest, 0, 0.08 * k, -0.06 * k);
    setClav(p, 'R', 0.2 * k);
  } },
  cheer: { dur: 2.4, fn(p, t) {
    const k = K(t, 0, 0, 0.25, 1, 2.1, 1, 2.4, 0);
    const pump = Math.abs(Math.sin(t * 5.5));
    for (const s of ['L', 'R']) { setArm(p, s, 0.4 * k, (0.3 + 2.4 * k) - 0.35 * pump * k, 0.2, 0.3 + 0.7 * pump * k, 0.1, 0, 1.3); setClav(p, s, 0.25 * k); }
    p.hip[1] += 0.06 * pump * k - 0.03 * k; p.feet[1] += 0.05 * pump * k; p.feet[6] += 0.05 * pump * k;
    p.add(B.head, -0.25 * k, 0, 0); p.add(B.chest, 0.12 * k, 0, 0);
    p.face = k > 0.5 ? 2 : 0;
  } },
  laugh: { dur: 2.4, fn(p, t) {
    const k = K(t, 0, 0, 0.3, 1, 2.1, 1, 2.4, 0);
    const sh = Math.sin(t * 16) * 0.05 * k;
    p.add(B.spine, -0.1 * k, 0, 0); p.add(B.chest, -0.05 * k + sh, 0, 0); p.add(B.head, -0.3 * k + sh, 0.1 * k, 0.1 * k);
    setArm(p, 'R', 0.55 * k, -0.35 * k + 0.1, 0.2, 1.5 * k, 0.2, 0, 0.5);
    setArm(p, 'L', 0.35 * k, 0.1, 0.1, 1.1 * k, 0.1, 0, 0.5);
    setClav(p, 'L', 0.1 * k + sh); setClav(p, 'R', 0.1 * k + sh);
    p.face = k > 0.3 ? 3 : 0;
  } },
  point: { dur: 2.0, fn(p, t) {
    const k = K(t, 0, 0, 0.25, 1, 1.7, 1, 2.0, 0);
    setArm(p, 'R', 1.45 * k + 0.05, 0.12 + 0.05 * k, -0.2 * k, 0.1 + 0.2 * (1 - k), -0.1, 0, 1.3);
    setFingers(p, 'R', 1.3 * k, 0.0, 0.9);
    p.add(B.chest, 0, -0.18 * k, 0); p.add(B.head, 0, -0.1 * k, 0);
  } },
  bow: { dur: 2.4, fn(p, t) {
    const k = K(t, 0, 0, 0.5, 1, 1.6, 1, 2.2, 0);
    p.add(B.hips, -0.45 * k, 0, 0); p.add(B.spine, -0.25 * k, 0, 0); p.add(B.chest, -0.1 * k, 0, 0); p.add(B.head, -0.2 * k, 0, 0);
    p.hip[2] += 0.1 * k;
    setArm(p, 'R', 0.45 * k + 0.1, -0.55 * k + 0.1, 0.5 * k, 2.0 * k, 0.1, 0, 0.3);
    setArm(p, 'L', -0.5 * k, 0.1, 0.5 * k, 0.9 * k, 0, 0, 0.5);
  } },
  kneel: { dur: 0, loop: true, fn(p, t, ctx) {
    const k = K(t, 0, 0, 0.5, 1);
    const R = ctx.rig, L = R.legLen;
    p.hip[1] -= 0.46 * L * k; p.hip[2] += 0.05 * k;
    // left foot planted forward, right knee down
    p.feet[0] = -R.stanceX; p.feet[1] = R.ankleH; p.feet[2] = -0.32 * L * k; p.feet[3] = 0;
    p.feet[5] = R.stanceX * 0.8; p.feet[6] = R.ankleH + 0.06 * k; p.feet[7] = 0.55 * L * k; p.feet[8] = -1.2 * k;
    p.toe[1] = 0.9 * k;
    p.add(B.hips, 0.05 * k, 0, 0); p.add(B.spine, -0.1 * k, 0, 0); p.add(B.head, -0.35 * k, 0, 0);
    setArm(p, 'L', 0.9 * k, 0.1, 0, 1.2 * k, 0, 0, 0.5);
    setArm(p, 'R', 0.3 * k, 0.1, 0.2, 0.7 * k, 0, 0, 0.5);
  } },
  sitEmote: { dur: 0, loop: true, fn() {} },
};

// ------------------------------------------------------------------------------------------------
// dances: loop until the character moves. Distinct per race+sex.
const beat = (t, bpm = 120) => t * bpm / 60;
export const DANCES = {
  human_m: { loop: true, fn(p, t, ctx) { // disco point
    const b = beat(t, 116), ph = b * PI;
    const s = Math.sin(ph);
    p.hip[0] += 0.05 * s; p.hip[1] += -0.04 + 0.03 * Math.abs(Math.cos(ph));
    p.add(B.hips, 0, 0.15 * s, 0.1 * s); p.add(B.chest, 0, -0.2 * s, -0.08 * s);
    const up = (Math.floor(b / 2) % 2) === 0;
    const k = Math.sin((b % 2) / 2 * PI);
    // right arm points diagonally up then down across the body
    setArm(p, 'R', up ? 0.4 + 0.3 * k : 0.6, up ? 0.6 + 1.9 * k : -0.5 * k + 0.2, -0.3, 0.1, 0, 0, 1.2);
    setFingers(p, 'R', 1.3, 0, 0.9);
    setArm(p, 'L', -0.2, 0.55, 0.9, 1.9, 0.3, 0, 1.2); // hand on hip
    p.add(B.head, 0, up ? -0.3 * k : 0.2 * k, 0);
    stance(p, ctx, 0.08, 0.05 * s, -0.05 * s, 0.25);
    p.feet[6] += 0.05 * Math.max(0, -s); p.feet[1] += 0.05 * Math.max(0, s);
  } },
  human_f: { loop: true, fn(p, t, ctx) { // pop bounce with alternating waves
    const b = beat(t, 124), ph = b * PI;
    const s = Math.sin(ph);
    p.hip[0] += 0.07 * s; p.hip[1] += -0.05 + 0.03 * Math.abs(Math.sin(ph));
    p.add(B.hips, 0, 0.1 * s, 0.18 * s); p.add(B.spine, 0, 0, -0.15 * s); p.add(B.chest, 0, -0.1 * s, -0.1 * s);
    const aL = 0.5 + 0.5 * Math.sin(ph * 0.5), aR = 0.5 - 0.5 * Math.sin(ph * 0.5);
    setArm(p, 'L', 0.3, 0.4 + 2.2 * aL, -0.4, 0.6 + 0.5 * (1 - aL), -0.3, 0, 0.3);
    setArm(p, 'R', 0.3, 0.4 + 2.2 * aR, -0.4, 0.6 + 0.5 * (1 - aR), -0.3, 0, 0.3);
    p.add(B.head, 0.08 * Math.abs(s), 0, 0.12 * s);
    stance(p, ctx, 0.06, 0, 0, 0.2);
    p.feet[1] += 0.06 * Math.max(0, s); p.feet[6] += 0.06 * Math.max(0, -s);
  } },
  dwarf_m: { loop: true, fn(p, t, ctx) { // cossack squat kicks
    const b = beat(t, 132), ph = b * PI;
    const R = ctx.rig, L = R.legLen;
    const side = Math.floor(b) % 2 === 0 ? 1 : -1, k = Math.sin((b % 1) * PI);
    p.hip[1] -= 0.42 * L + 0.05 * Math.abs(Math.sin(ph)); p.hip[2] += 0.08;
    // squat foot + kicking foot
    const kick = side > 0 ? 1 : 0;
    p.feet[0] = -R.stanceX * 1.3; p.feet[5] = R.stanceX * 1.3;
    p.feet[1] = R.ankleH + (kick ? 0 : 0.35 * L * k); p.feet[2] = kick ? 0.1 : -0.75 * L * k; p.feet[3] = kick ? 0 : 0.6 * k;
    p.feet[6] = R.ankleH + (kick ? 0.35 * L * k : 0); p.feet[7] = kick ? -0.75 * L * k : 0.1; p.feet[8] = kick ? 0.6 * k : 0;
    p.add(B.spine, 0.1, 0, 0); p.add(B.chest, 0.1, 0.1 * side, 0);
    // arms crossed in front of chest
    setArm(p, 'L', 0.62, 0.05, 1.35, 1.85, 0, 0, 1.2); setArm(p, 'R', 0.5, 0.05, 1.3, 1.95, 0, 0, 1.2);
    p.add(B.head, -0.1, 0.25 * side * k, 0);
  } },
  dwarf_f: { loop: true, fn(p, t, ctx) { // stomping jig, hands on hips
    const b = beat(t, 140), R = ctx.rig, L = R.legLen;
    const side = Math.floor(b) % 2 === 0 ? 0 : 1, k = Math.sin((b % 1) * PI);
    p.hip[1] += -0.05 + 0.04 * k;
    stance(p, ctx, 0.04, 0, 0, 0.2);
    p.feet[side * 5 + 1] += 0.3 * L * k; p.feet[side * 5 + 2] -= 0.08 * k; p.feet[side * 5 + 3] = -0.4 * k;
    p.add(B.hips, 0, 0, (side ? 0.1 : -0.1) * k); p.add(B.chest, 0, (side ? -0.15 : 0.15) * k, 0);
    setArm(p, 'L', -0.2, 0.6, 0.9, 1.9, 0.3, 0, 1.2); setArm(p, 'R', -0.2, 0.6, 0.9, 1.9, 0.3, 0, 1.2);
    p.add(B.head, 0.1 * k, 0, (side ? 0.15 : -0.15));
  } },
  orc_m: { loop: true, fn(p, t, ctx) { // heavy running-man groove with air punches
    const b = beat(t, 100), R = ctx.rig, L = R.legLen;
    const ph = b * PI, s = Math.sin(ph);
    p.hip[1] += -0.08 + 0.05 * Math.abs(s);
    stance(p, ctx, 0.12, 0.12 * s, -0.12 * s, 0.3);
    p.feet[1] += 0.12 * Math.max(0, s) * L; p.feet[6] += 0.12 * Math.max(0, -s) * L;
    p.add(B.spine, -0.15, 0.2 * s, 0); p.add(B.chest, -0.1, 0.2 * s, 0); p.add(B.head, 0.15 * Math.abs(s), 0, 0);
    const pl = Math.max(0, s), pr = Math.max(0, -s);
    setArm(p, 'L', 0.6 + 1.0 * pl, 0.3, 0.2, 1.8 - 1.4 * pl, 0.1, 0, 1.3);
    setArm(p, 'R', 0.6 + 1.0 * pr, 0.3, 0.2, 1.8 - 1.4 * pr, 0.1, 0, 1.3);
  } },
  orc_f: { loop: true, fn(p, t, ctx) { // the sprinkler
    const b = beat(t, 128);
    const cyc = b % 8, dir = cyc < 4 ? 1 : -1;
    const step = Math.floor(b * 2) % 8;
    const ang = (dir > 0 ? step : 8 - step) / 8;
    p.add(B.spine, 0, (ang - 0.5) * 0.9, 0); p.add(B.chest, 0, (ang - 0.5) * 0.7, 0);
    setArm(p, 'L', 2.3, 1.2, -0.3, 2.2, 0.3, 0, 1.0); // hand behind head
    setArm(p, 'R', 1.45, 0.3, 0.2, 0.2, 0, 0, 1.1);
    p.hip[1] += -0.05 + 0.03 * Math.abs(Math.sin(b * PI * 2));
    stance(p, ctx, 0.1, 0, 0, 0.2);
    p.feet[1] += 0.05 * Math.max(0, Math.sin(b * PI * 2));
    p.add(B.head, 0, (ang - 0.5) * 0.4, 0);
  } },
  elf_m: { loop: true, fn(p, t, ctx) { // the robot: stiff pops and holds
    const b = beat(t, 110);
    const i = Math.floor(b) % 8, f = b % 1;
    const snap = f < 0.15 ? f / 0.15 : 1;
    const poses = [
      [0.2, 0.3, 1.57, 0.2, 0.3, 1.57, 0, 0], [1.57, 0.2, 1.57, 0.2, 0.3, 0.0, 0.3, 0.2], [0.2, 0.3, 0.0, 1.57, 0.2, 1.57, -0.3, -0.2],
      [1.57, 1.3, 1.57, 1.57, 1.3, 1.57, 0, 0], [0.2, 1.5, 0.0, 0.2, 1.5, 0.0, 0.4, 0], [1.2, 0.2, 1.57, 1.2, 0.2, 1.57, -0.4, 0],
      [0.0, 0.2, 0.0, 2.8, 0.3, 0.0, 0, 0.3], [2.8, 0.3, 0.0, 0.0, 0.2, 0.0, 0, -0.3],
    ];
    const P0 = poses[(i + 7) % 8], P1 = poses[i], m = (a, c) => a + (c - a) * snap;
    setArm(p, 'L', m(P0[0], P1[0]), m(P0[1], P1[1]), 0, m(P0[2], P1[2]), 0, 0, 0.1);
    setArm(p, 'R', m(P0[3], P1[3]), m(P0[4], P1[4]), 0, m(P0[5], P1[5]), 0, 0, 0.1);
    p.add(B.chest, 0, m(P0[6], P1[6]), 0); p.add(B.head, 0, m(P0[7], P1[7]) * 2, 0);
    p.hip[1] += -0.04 * (i % 2); stance(p, ctx, 0.1, 0, 0, 0.0);
  } },
  elf_f: { loop: true, fn(p, t, ctx) { // graceful twirl
    const b = beat(t, 96), ph = b * PI * 0.5;
    const spin = (b % 8) / 8;
    p.add(B.hips, 0, spin > 0.75 ? (spin - 0.75) * 4 * PI * 2 : 0, 0.1 * Math.sin(ph));
    p.add(B.spine, 0, 0, -0.12 * Math.sin(ph)); p.add(B.chest, -0.05, 0.15 * Math.sin(ph), -0.1 * Math.sin(ph));
    const a = Math.sin(ph), c = Math.cos(ph);
    setArm(p, 'L', 0.6 + 0.6 * c, 1.2 + 1.0 * a, -0.4, 0.4 + 0.3 * c, -0.4, 0, 0.15);
    setArm(p, 'R', 0.6 - 0.6 * c, 1.2 - 1.0 * a + 0.8, -0.4, 0.4 - 0.3 * c, -0.4, 0, 0.15);
    p.add(B.head, -0.15, 0.3 * a, 0.15 * a);
    p.hip[1] += 0.02 * Math.abs(a);
    stance(p, ctx, 0.0, 0.05, -0.05, 0.3);
    p.feet[3] = -0.3; p.feet[8] = -0.3; p.feet[1] += 0.04; p.feet[6] += 0.04; // on tiptoes
  } },
};
