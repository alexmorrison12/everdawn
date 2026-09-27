// Procedural layered animation for humanoids.
// Poses are per-bone Euler angles authored in "neutral" frames (arms/legs hanging straight down, frames aligned
// with the character: X right, Y up, Z back, facing -Z). Leg poses are driven by foot targets + analytic IK.
// Sign conventions: torso/head x<0 bends forward, y>0 turns left, z>0 leans left.
//   arms: x>0 swings forward, abduction = sg*z (sg=+1 right, -1 left), internal twist = sg*y; elbow x>0 flexes.
//   legs: thigh x>0 swings forward; knee x<0 flexes; foot x>0 toes up.
import * as THREE from 'three';
import { BONES, B, NB, PARENTS, UPPER_MASK, ARM_MASK } from './rig.js';
import { clamp, lerp, smoothstep, damp } from '../../core/noise.js';
import { ACTIONS, EMOTES, DANCES, holdPose, castPose } from './moves.js';
import { Pose, setArm, setFingers, setClav, setTorso, stance } from './pose.js';
export { Pose };

const XZY = 1, YXZ = 0, EXP = 2;
// shoulders/hips: rotation vector (x, z) + twist y (no gimbal lock for combined forward/side raises)
export const ORDER = BONES.map(n => /^(uarm|thigh)/.test(n) ? EXP : /^(farm|hand|idx|fng|thb|shin|foot|toe|cape|hair|braid|beard|clav)/.test(n) ? XZY : YXZ);

// ---- math --------------------------------------------------------------------------------------
const _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _q3 = new THREE.Quaternion();
function eulerQuat(q, x, y, z, order) {
  if (order === EXP) { // q = exp(x,0,z) * Ry(y)
    const a = Math.sqrt(x * x + z * z);
    let ax = 0, az = 0, cw = 1;
    if (a > 1e-7) { const sa = Math.sin(a / 2) / a; ax = x * sa; az = z * sa; cw = Math.cos(a / 2); }
    const sy = Math.sin(y / 2), cy = Math.cos(y / 2);
    // (ax,0,az,cw) * (0,sy,0,cy)
    q.x = ax * cy - az * sy; q.y = cw * sy; q.z = az * cy + ax * sy; q.w = cw * cy;
    return q;
  }
  const c1 = Math.cos(x / 2), c2 = Math.cos(y / 2), c3 = Math.cos(z / 2), s1 = Math.sin(x / 2), s2 = Math.sin(y / 2), s3 = Math.sin(z / 2);
  if (order === XZY) { // R = Rx Rz Ry
    q.x = s1 * c2 * c3 - c1 * s2 * s3; q.y = c1 * s2 * c3 - s1 * c2 * s3; q.z = c1 * c2 * s3 + s1 * s2 * c3; q.w = c1 * c2 * c3 + s1 * s2 * s3;
  } else { // YXZ: R = Ry Rx Rz
    q.x = s1 * c2 * c3 + c1 * s2 * s3; q.y = c1 * s2 * c3 - s1 * c2 * s3; q.z = c1 * c2 * s3 - s1 * s2 * c3; q.w = c1 * c2 * c3 + s1 * s2 * s3;
  }
  return q;
}
const _v1 = new THREE.Vector3(), _v2 = new THREE.Vector3(), _v3 = new THREE.Vector3(), _v4 = new THREE.Vector3(), _v5 = new THREE.Vector3();
const _m = new THREE.Matrix4(), _m2 = new THREE.Matrix4();
const _v6 = new THREE.Vector3(), _v7 = new THREE.Vector3(), _v8 = new THREE.Vector3(), _v9 = new THREE.Vector3(), _v10 = new THREE.Vector3(), _v11 = new THREE.Vector3();
const _qa = new THREE.Quaternion(), _qb = new THREE.Quaternion(), _qc = new THREE.Quaternion(), _qd = new THREE.Quaternion();
function basisQuat(q, X, Y, Z) { _m.makeBasis(X, Y, Z); return q.setFromRotationMatrix(_m); }

// ---- spring for secondary motion ---------------------------------------------------------------
class Spring {
  constructor(k = 60, c = 9) { this.x = 0; this.v = 0; this.k = k; this.c = c; }
  step(target, dt, ext = 0) {
    const n = Math.max(1, Math.ceil(dt / 0.012)); const h = dt / n;
    for (let i = 0; i < n; i++) { this.v += (this.k * (target - this.x) - this.c * this.v + ext) * h; this.x += this.v * h; }
    return this.x;
  }
}

// ================================================================================================
export class Animator {
  constructor(c) {
    this.c = c;
    const base = c.base, J = base.joints, P = base.P;
    const jv = (n) => new THREE.Vector3(J[B[n] * 3], J[B[n] * 3 + 1], J[B[n] * 3 + 2]);
    this.rig = {
      hips: jv('hips'), hipOffL: jv('thighL').sub(jv('hips')), hipOffR: jv('thighR').sub(jv('hips')),
      L1: base.JJ.thighLen, L2: base.JJ.shinLen, ankleH: J[B.footL * 3 + 1],
      stanceX: Math.abs(J[B.thighL * 3]) * 1.08, legLen: base.JJ.thighLen + base.JJ.shinLen,
      height: base.height, race: P.race, sex: P.sex,
      toeZ: J[B.toeL * 3 + 2] - J[B.footL * 3 + 2],
      bodyScale: base.scale, shX: P.shX, shY: P.shY, hs: P.headDef.s, torso: J[B.neck * 3 + 1] - J[B.hips * 3 + 1],
      chin: [J[B.head * 3] - J[B.chest * 3], J[B.head * 3 + 1] - J[B.chest * 3 + 1], J[B.head * 3 + 2] - J[B.chest * 3 + 2]],
    };
    // neutral quats
    this.N = []; this.Npi = [];
    for (let i = 0; i < NB; i++) {
      const q = new THREE.Quaternion(base.N[i * 4], base.N[i * 4 + 1], base.N[i * 4 + 2], base.N[i * 4 + 3]);
      this.N.push(q);
    }
    for (let i = 0; i < NB; i++) this.Npi.push(PARENTS[i] >= 0 ? this.N[PARENTS[i]].clone().invert() : new THREE.Quaternion());
    this.bones = c.bones;
    this.restPos = this.bones.map(b => b.position.clone());
    const dist = (a, b2) => Math.hypot(J[B[a] * 3] - J[B[b2] * 3], J[B[a] * 3 + 1] - J[B[b2] * 3 + 1], J[B[a] * 3 + 2] - J[B[b2] * 3 + 2]);
    this.armL1 = dist('uarmL', 'farmL'); this.armL2 = dist('farmL', 'handL');
    this.armR1 = dist('uarmR', 'farmR'); this.armR2 = dist('farmR', 'handR');
    this.armIK = { L: { t: [0, 0, 0], pole: [0, 0, 0], w: 0 }, R: { t: [0, 0, 0], pole: [0, 0, 0], w: 0 } };
    this.palmOff = 0.075 * P.hand;
    this.twoHand = null;
    // state
    this.t = 0; this.phase = 0; this.speed = 0; this.strafe = 0; this.moveW = 0; this.gait = 0; this.dirYaw = 0;
    this.combatW = 0; this.airW = 0; this.swimW = 0; this.sitW = 0; this.deadW = 0; this.deadT = 0; this.castW = 0; this.castT = 0; this.castType = 'directed';
    this.landT = 9; this.wasGrounded = true; this.airT = 0; this.vy = 0;
    this.action = null; this.emote = null; this.hitT = 9; this.hitDir = 1;
    let rs = (c.opts?.seed ?? 12345) >>> 0;
    this.rand = () => { rs = (rs + 0x6D2B79F5) >>> 0; let t = rs; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
    this.blinkT = 2 + this.rand() * 3; this.blinkOn = 0;
    this.look = 0; this.lookT = 3; this.lookTarget = 0;
    this.seed = this.rand() * 100;
    this.cape = [new Spring(40, 7), new Spring(40, 7), new Spring(36, 6), new Spring(32, 5)];
    this.capeR = [new Spring(30, 6), new Spring(30, 6), new Spring(28, 5), new Spring(26, 5)];
    this.hair = [new Spring(55, 6), new Spring(45, 5), new Spring(40, 4.5)];
    this.hairR = [new Spring(50, 6), new Spring(45, 5), new Spring(40, 4.5)];
    this.braid = [new Spring(60, 6), new Spring(50, 5)];
    this.beard = [new Spring(70, 7), new Spring(60, 6)];
    this.prevVel = new THREE.Vector3(); this.accel = new THREE.Vector3();
    this.headPrev = null;
    // pose buffers
    this.P = new Pose(); this.T1 = new Pose(); this.T2 = new Pose(); this.T3 = new Pose();
    this.ctx = { rig: this.rig, anim: this, style: 'unarmed', t: 0 };
    this.weaponStyle = 'unarmed';
    this.onSheath = null; // callback(drawn:boolean)
    this.drawn = false; this.drawT = 9;
  }

  play(name, { speed = 1 } = {}) {
    if (EMOTES[name] || DANCES[name] || name === 'dance') {
      const def = name === 'dance' ? DANCES[this.rig.race + '_' + this.rig.sex] : (EMOTES[name] || DANCES[name]);
      if (!def) return false;
      this.emote = { name, def, t: 0, speed, w: 0 };
      return true;
    }
    if (name === 'hit') { this.hitT = 0; this.hitDir = this.rand() < 0.5 ? -1 : 1; return true; }
    let def = ACTIONS[name];
    if (name === 'attack1h') { this.alt = !this.alt; def = ACTIONS[this.alt ? 'attack1h' : 'attack1hB']; }
    if (!def) return false;
    this.action = { name, def, t: 0, speed, dur: def.dur };
    return true;
  }

  update(dt, s = {}) {
    dt = Math.min(dt, 0.1);
    this.t += dt; const t = this.t;
    const ctx = this.ctx; ctx.t = t; ctx.style = this.weaponStyle; ctx.drawn = this.drawn;
    const speed = s.speed || 0, strafe = s.strafe || 0;
    const mv = Math.hypot(speed, strafe);
    const grounded = s.grounded !== false, swimming = !!s.swimming, dead = !!s.dead;
    // smoothed params
    this.speed = damp(this.speed, speed, 10, dt); this.strafe = damp(this.strafe, strafe, 10, dt);
    const smv = Math.hypot(this.speed, this.strafe);
    this.moveW = damp(this.moveW, mv > 0.25 ? 1 : 0, 8, dt);
    this.gait = damp(this.gait, smoothstep(2.8, 5.2, mv), 5, dt);
    this.combatW = damp(this.combatW, s.combat ? 1 : 0, 6, dt);
    this.swimW = damp(this.swimW, swimming ? 1 : 0, 4, dt);
    this.airW = damp(this.airW, !grounded && !swimming ? 1 : 0, 12, dt);
    this.sitW = damp(this.sitW, s.sit && mv < 0.1 ? 1 : 0, 5, dt);
    this.castType = s.casting || this.castType;
    this.castW = damp(this.castW, s.casting ? 1 : 0, 10, dt);
    if (s.casting) this.castT += dt; else this.castT = 0;
    this.vy = s.vy || 0;
    if (!grounded) this.airT += dt; else { if (!this.wasGrounded && this.airT > 0.15) this.landT = 0; this.airT = 0; }
    this.wasGrounded = grounded; this.landT += dt;
    if (dead) this.deadT += dt; else this.deadT = 0;
    this.deadW = dead ? 1 : damp(this.deadW, 0, 3, dt);
    // weapon draw/sheath
    const wantDrawn = !!s.combat;
    if (wantDrawn !== this.drawn && this.drawT > 0.45) { this.drawT = 0; this.drawTarget = wantDrawn; }
    if (this.drawT < 0.45) { this.drawT += dt; if (this.drawT >= 0.22 && this.drawn !== this.drawTarget) { this.drawn = this.drawTarget; this.onSheath?.(this.drawn); } }
    else this.drawT += dt;
    // cancel emotes when moving / acting
    if (this.emote && (mv > 0.3 || !grounded || swimming || dead || s.casting)) this.emote.cancel = true;
    // movement direction (root space): forward = -Z
    const dirYawTarget = mv > 0.1 ? Math.atan2(strafe, speed) : 0; // 0 fwd, +pi/2 right, pi back
    // phase
    const R = this.rig;
    const legK = Math.sqrt(R.legLen / 0.87);
    const period = lerp(1.05, 0.7, this.gait) * legK;
    const cad = smv > 0.05 ? 1 / period : 0;
    const turnStep = Math.abs(s.turn || 0) > 0.6 && mv < 0.2 ? 0.9 : 0;
    this.phase = (this.phase + dt * Math.max(cad, turnStep)) % 1;
    this.turnW = damp(this.turnW || 0, turnStep ? 1 : 0, 6, dt);

    // ---------------- build pose ----------------
    this.armIK.L.w = 0; this.armIK.R.w = 0;
    const P = this.P.clear();
    idlePose(P, t, ctx, this);
    if (this.combatW > 0.01) { combatIdle(this.T1.clear(), t, ctx, this); P.lerp(this.T1, this.combatW); }
    if (this.turnW > 0.01 && this.moveW < 0.5) { locoPose(this.T1.clear(), ctx, this, 0.9, s.turn > 0 ? -Math.PI / 2 : Math.PI / 2, 0.25); P.lerp(this.T1, this.turnW * 0.7, LEGS_MASK); }
    if (this.moveW > 0.01) {
      locoPose(this.T1.clear(), ctx, this, Math.max(smv, 1.2), Math.atan2(this.strafe, this.speed), 1);
      P.lerp(this.T1, this.moveW);
    }
    if (this.airW > 0.01) { jumpPose(this.T1.clear(), ctx, this); P.lerp(this.T1, this.airW); }
    if (this.landT < 0.35) { const k = Math.sin(clamp(this.landT / 0.35, 0, 1) * Math.PI) * (1 - this.moveW * 0.6); P.hip[1] -= 0.11 * k * R.legLen / 0.87; P.add(B.spine, -0.12 * k, 0, 0); P.add(B.chest, -0.06 * k, 0, 0); }
    if (this.swimW > 0.01) { swimPose(this.T1.clear(), ctx, this, smv); P.lerp(this.T1, this.swimW); }
    if (this.sitW > 0.01) { sitPose(this.T1.clear(), ctx, this); P.lerp(this.T1, this.sitW); }
    // emotes / dances (full body)
    if (this.emote) {
      const e = this.emote;
      e.t += dt * e.speed;
      const dur = e.def.dur || 1e9;
      if (!e.def.loop && e.t >= dur) e.cancel = true;
      e.w = damp(e.w, e.cancel ? 0 : 1, e.cancel ? 10 : 8, dt);
      if (e.cancel && e.w < 0.02) this.emote = null;
      else { this.T2.copy(P); e.def.fn(this.T2, e.t, ctx, this); P.lerp(this.T2, e.w, e.def.upper ? UPPER_MASK : null); }
    }
    // weapon hold on arms (combat, not casting)
    // casting hold
    if (this.castW > 0.01) { this.T2.copy(P); castPose(this.T2, this.castType, this.castT, ctx, this); P.lerp(this.T2, this.castW, UPPER_MASK); }
    // sheath / draw gesture
    if (this.drawT < 0.45) { const k = Math.sin(this.drawT / 0.45 * Math.PI); drawGesture(this.T2.copy(P), ctx, this); P.lerp(this.T2, k * 0.9, UPPER_MASK); }
    // one-shot action
    if (this.action) {
      const a = this.action;
      a.t += dt * a.speed;
      const u = a.t / a.dur;
      if (u >= 1) this.action = null;
      else {
        const env = smoothstep(0, a.def.blendIn ?? 0.12, u) * (1 - smoothstep(a.def.blendOut ?? 0.8, 1, u));
        this.T2.copy(P); a.def.fn(this.T2, u, ctx, this);
        this.armIK.L.w *= env; this.armIK.R.w *= env;
        const full = a.def.full && this.moveW < 0.5 && grounded;
        P.lerp(this.T2, env, full ? null : UPPER_MASK);
        if (!full && a.def.lower) { a.def.lower(P, u, env * (1 - this.moveW), ctx, this); }
      }
    }
    // hit flinch (additive)
    if (this.hitT < 0.4) { this.hitT += dt; const k = Math.sin(clamp(this.hitT / 0.35, 0, 1) * Math.PI) * (1 - this.hitT / 0.4); P.add(B.chest, 0.22 * k, 0.12 * k * this.hitDir, 0.08 * k * this.hitDir); P.add(B.head, 0.25 * k, 0.15 * k * this.hitDir, 0); P.add(B.spine, 0.08 * k, 0, 0); P.hip[2] += 0.04 * k; setClav(P, 'L', 0.15 * k); setClav(P, 'R', 0.15 * k); P.face = 1; }
    // death (overrides)
    if (this.deadW > 0.01) { deathPose(this.T1.clear(), ctx, this); P.lerp(this.T1, this.deadW); }
    // blink
    this.blinkT -= dt;
    if (this.blinkT < 0) { this.blinkOn = 0.12; this.blinkT = 2.5 + this.rand() * 4; }
    if (this.blinkOn > 0) { this.blinkOn -= dt; if (P.face === 0) P.face = 1; else if (P.face === 2) P.face = 3; }
    if (dead && this.deadT > 0.6) P.face = 1;
    this.apply(P, dt, s);
    return P;
  }

  // ---------------- apply pose to bones (with leg IK + secondary) ----------------
  apply(P, dt, s) {
    const bones = this.bones, R = this.rig;
    // hips position
    const hb = bones[B.hips];
    hb.position.set(R.hips.x + P.hip[0], R.hips.y + P.hip[1], R.hips.z + P.hip[2]);
    // FK quats for all bones
    for (let i = 0; i < NB; i++) {
      eulerQuat(_q, P.r[i * 3], P.r[i * 3 + 1], P.r[i * 3 + 2], ORDER[i]);
      bones[i].quaternion.multiplyQuaternions(this.Npi[i], _q).multiply(this.N[i]);
    }
    // leg IK
    if (P.ikw > 0.01) this.solveLegs(P);
    this.secondary(P, dt, s);
    // off hand on a two-handed grip
    const th = this.twoHand;
    const w2 = th && this.drawn ? this.combatW * (1 - (this.emote ? this.emote.w : 0)) * (1 - this.deadW) * (1 - this.swimW) * (this.drawT < 0.45 ? 0 : 1) : 0;
    if (w2 > 0.02) this.solveOffHand(th, w2);
    this.solveArmRequests();
  }

  /** two-bone IK: put the left wrist on the weapon's second grip point (world space) */
  solveOffHand(th, w) {
    const socket = th.socket;
    socket.updateWorldMatrix(true, false);
    const T = _v1.set(0, th.grip2, 0).applyMatrix4(socket.matrixWorld);
    const ws = _v4.setFromMatrixScale(socket.matrixWorld).x || 1;
    this.solveArm('L', T, [-0.6, -1, 0.35], w, this.palmOff * ws);
  }

  /** generic arm IK. T: world-space wrist target (Vector3, may be modified). poleLocal: elbow direction in clavicle space. */
  solveArm(side, T, poleLocal, w, palmOff = 0) {
    const bones = this.bones, sg = side === 'R' ? 1 : -1;
    const bC = bones[B['clav' + side]], bU = bones[B['uarm' + side]], bF = bones[B['farm' + side]];
    bC.updateWorldMatrix(true, false);
    const S = _v2.setFromMatrixPosition(_m.multiplyMatrices(bC.matrixWorld, _m2.compose(bU.position, bU.quaternion, bU.scale)));
    const ws = _v4.setFromMatrixScale(bC.matrixWorld).x || 1;
    if (palmOff) { const toS = _v3.subVectors(S, T).normalize(); T.addScaledVector(toS, palmOff); }
    const L1 = (side === 'L' ? this.armL1 : this.armR1) * ws, L2 = (side === 'L' ? this.armL2 : this.armR2) * ws;
    const D = _v4.subVectors(T, S); let d = D.length();
    d = clamp(d, Math.abs(L1 - L2) + 1e-3, (L1 + L2) * 0.999); D.normalize();
    const a = Math.acos(clamp((L1 * L1 + d * d - L2 * L2) / (2 * L1 * d), -1, 1));
    bC.getWorldQuaternion(_q3);
    const pole = _v5.set(poleLocal[0], poleLocal[1], poleLocal[2]).applyQuaternion(_q3).normalize();
    const perp = pole.addScaledVector(D, -pole.dot(D)).normalize();
    const E = _v6.copy(S).addScaledVector(D, Math.cos(a) * L1).addScaledVector(perp, Math.sin(a) * L1);
    const armDir = _v7.subVectors(E, S).normalize(), foreDir = _v8.subVectors(T, E).normalize();
    const X = _v9.crossVectors(armDir, foreDir); if (X.lengthSq() < 1e-8) X.set(1, 0, 0).applyQuaternion(_q3); X.normalize();
    const Yu = _v10.copy(armDir).negate(), Zu = _v11.crossVectors(X, Yu).normalize();
    const Au = basisQuat(_qa, X, Yu, Zu);
    const Yf = _v10.copy(foreDir).negate(), Zf = _v11.crossVectors(X, Yf).normalize();
    const Af = basisQuat(_qb, X, Yf, Zf);
    const Eu = _qc.copy(_q3).invert().multiply(Au);
    const qu = _qd.multiplyQuaternions(this.Npi[B['uarm' + side]], Eu).multiply(this.N[B['uarm' + side]]);
    bU.quaternion.slerp(qu, w);
    const Ef = _qc.copy(Au).invert().multiply(Af);
    const qf = _qd.multiplyQuaternions(this.Npi[B['farm' + side]], Ef).multiply(this.N[B['farm' + side]]);
    bF.quaternion.slerp(qf, w);
  }

  /** chest-local arm IK requests set by moves (A.armIK[side] = {t:[x,y,z], pole:[x,y,z], w}) */
  solveArmRequests() {
    for (const side of ['L', 'R']) {
      const r = this.armIK[side];
      if (!r || r.w <= 0.01) continue;
      const bc = this.bones[B.chest]; bc.updateWorldMatrix(true, false);
      const T = _v1.set(r.t[0], r.t[1], r.t[2]).applyMatrix4(bc.matrixWorld);
      this.solveArm(side, T, r.pole, clamp(r.w, 0, 1));
    }
  }

  solveLegs(P) {
    const R = this.rig, bones = this.bones;
    eulerQuat(_q3, P.r[B.hips * 3], P.r[B.hips * 3 + 1], P.r[B.hips * 3 + 2], YXZ); // A_hips
    const hipsPos = bones[B.hips].position;
    for (let side = 0; side < 2; side++) {
      const s = side === 0 ? 'L' : 'R', sg = side === 0 ? -1 : 1;
      const off = side === 0 ? R.hipOffL : R.hipOffR;
      const H = _v1.copy(off).applyQuaternion(_q3).add(hipsPos);
      const f = P.feet, o = side * 5;
      const T = _v2.set(f[o], f[o + 1], f[o + 2]);
      const yaw = f[o + 4];
      // knee hint: forward rotated by foot yaw, slightly outward
      const hint = _v3.set(-Math.sin(yaw) + sg * 0.12, 0, -Math.cos(yaw));
      // blend FK <-> IK: compute IK then slerp
      const d = _v4.subVectors(T, H); let dl = d.length();
      const L1 = R.L1, L2 = R.L2;
      dl = clamp(dl, Math.abs(L1 - L2) + 1e-3, (L1 + L2) * 0.9995);
      d.normalize();
      const a = (L1 * L1 + dl * dl - L2 * L2) / (2 * L1 * dl);
      const ang = Math.acos(clamp(a, -1, 1));
      // bend plane normal
      const side2 = _v5.crossVectors(d, hint); if (side2.lengthSq() < 1e-6) side2.set(1, 0, 0); side2.normalize();
      const up = new THREE.Vector3().crossVectors(side2, d).normalize(); // points toward knee side (forward)
      const knee = new THREE.Vector3().copy(H).addScaledVector(d, Math.cos(ang) * L1).addScaledVector(up, Math.sin(ang) * L1);
      const thighDir = new THREE.Vector3().subVectors(knee, H).normalize();
      const shinDir = new THREE.Vector3().subVectors(T, knee).normalize();
      // thigh frame: Y = -dir, Z = -forward(knee cap), X = Y x Z
      const X = new THREE.Vector3().copy(side2);             // hinge axis
      if (X.x * sg < -0.0 && false) X.negate();
      let Y = thighDir.clone().negate();
      let Z = new THREE.Vector3().crossVectors(X, Y).normalize();
      X.crossVectors(Y, Z).normalize();
      const Athigh = basisQuat(new THREE.Quaternion(), X, Y, Z);
      const Ys = shinDir.clone().negate();
      const Zs = new THREE.Vector3().crossVectors(X, Ys).normalize();
      const Xs = new THREE.Vector3().crossVectors(Ys, Zs).normalize();
      const Ashin = basisQuat(new THREE.Quaternion(), Xs, Ys, Zs);
      // foot: yaw + pitch in root space
      eulerQuat(_q, f[o + 3], yaw, 0, YXZ);
      const Afoot = _q.clone();
      // E = A_parent^-1 * A_child ; bone quat = Npinv * E * N
      const Eth = _q2.copy(_q3).invert().multiply(Athigh);
      const bt = bones[B['thigh' + s]], bs = bones[B['shin' + s]], bf = bones[B['foot' + s]];
      const w = P.ikw;
      const qth = new THREE.Quaternion().multiplyQuaternions(this.Npi[B['thigh' + s]], Eth).multiply(this.N[B['thigh' + s]]);
      const Esh = Athigh.clone().invert().multiply(Ashin);
      const qsh = new THREE.Quaternion().multiplyQuaternions(this.Npi[B['shin' + s]], Esh).multiply(this.N[B['shin' + s]]);
      const Eft = Ashin.clone().invert().multiply(Afoot);
      const qft = new THREE.Quaternion().multiplyQuaternions(this.Npi[B['foot' + s]], Eft).multiply(this.N[B['foot' + s]]);
      if (w >= 0.999) { bt.quaternion.copy(qth); bs.quaternion.copy(qsh); bf.quaternion.copy(qft); }
      else { bt.quaternion.slerp(qth, w); bs.quaternion.slerp(qsh, w); bf.quaternion.slerp(qft, w); }
      // toe
      eulerQuat(_q, P.toe[side], 0, 0, XZY);
      bones[B['toe' + s]].quaternion.multiplyQuaternions(this.Npi[B['toe' + s]], _q).multiply(this.N[B['toe' + s]]);
    }
  }

  secondary(P, dt, s) {
    const bones = this.bones, t = this.t;
    // world-ish orientation of chest (root space) to keep cape hanging with gravity
    const r = P.r;
    const chestPitch = r[B.hips * 3] + r[B.spine * 3] + r[B.chest * 3];
    const chestRoll = r[B.hips * 3 + 2] + r[B.spine * 3 + 2] + r[B.chest * 3 + 2];
    const fwd = this.speed, side = this.strafe;
    // acceleration in root space
    const vx = side, vz = -fwd;
    const ax = (vx - this.prevVel.x) / Math.max(dt, 1e-3), az = (vz - this.prevVel.z) / Math.max(dt, 1e-3);
    this.prevVel.set(vx, this.vy, vz);
    this.accel.x = damp(this.accel.x, ax, 8, dt); this.accel.z = damp(this.accel.z, az, 8, dt);
    const lying = this.deadW * smoothstep(0.3, 0.9, this.deadT);
    // cape: pitch (+ swings back when moving forward)
    const drag = clamp(Math.max(0, fwd) * 0.075 + Math.max(0, -this.vy) * 0.03, 0, 0.95) * (1 - this.swimW);
    const up = clamp(this.vy * 0.05, -0.4, 0.4) * this.airW;
    let acc = 0;
    for (let i = 0; i < 4; i++) {
      const flutter = (Math.sin(t * 9.5 + i * 1.3) * 0.5 + Math.sin(t * 13.1 + i * 2.1) * 0.3) * 0.06 * drag * (i + 1) * 0.5;
      let target = (i === 0 ? -chestPitch : 0) - drag * (i === 0 ? 0.75 : 0.25) - up * 0.3 + flutter;
      target -= Math.max(0, this.gait * this.moveW * 0.1 * (i === 0 ? 1 : 0));
      if (lying > 0) target = lerp(target, i === 0 ? -0.2 : -0.05, lying);
      let v = this.cape[i].step(target, dt, this.accel.z * 0.35 * (i === 0 ? 1 : 0.5));
      if (i === 0) v = Math.min(v, 0.05 - chestPitch * 0.0); // do not swing into the back
      acc += v;
      const rollT = (i === 0 ? -chestRoll : 0) + clamp(this.accel.x * 0.02, -0.25, 0.25) + clamp(side * 0.04, -0.3, 0.3) * (i === 0 ? 1 : 0.4);
      const vr = this.capeR[i].step(rollT, dt);
      eulerQuat(_q, v, 0, vr, XZY);
      const b = B['cape' + i];
      bones[b].quaternion.multiplyQuaternions(this.Npi[b], _q).multiply(this.N[b]);
    }
    // hair / braids / beard follow head motion
    const hp = r[B.hips * 3] + r[B.spine * 3] + r[B.chest * 3] + r[B.neck * 3] + r[B.head * 3];
    const hr = r[B.hips * 3 + 2] + r[B.spine * 3 + 2] + r[B.chest * 3 + 2] + r[B.neck * 3 + 2] + r[B.head * 3 + 2];
    const bounce = Math.sin(this.phase * Math.PI * 4) * 0.12 * this.moveW * (0.4 + this.gait * 0.6);
    for (let i = 0; i < 3; i++) {
      const tgt = (i === 0 ? -hp * 0.8 : -hp * 0.1) - drag * 0.3 + bounce * (i + 1) * 0.3;
      const v = this.hair[i].step(clamp(tgt, -1.2, 1.2), dt, this.accel.z * 0.2);
      const vr = this.hairR[i].step(i === 0 ? -hr * 0.8 : 0, dt, this.accel.x * 0.15);
      eulerQuat(_q, v, 0, vr, XZY);
      const b = B[['hairA', 'hairB', 'hairC'][i]];
      bones[b].quaternion.multiplyQuaternions(this.Npi[b], _q).multiply(this.N[b]);
    }
    for (let i = 0; i < 2; i++) {
      const tgt = (i === 0 ? -hp * 0.7 : 0) + bounce * 0.5;
      const v = this.braid[i].step(clamp(tgt, -1, 1), dt, this.accel.z * 0.2);
      eulerQuat(_q, v, 0, i === 0 ? -hr * 0.6 : 0, XZY);
      for (const n of ['braidL' + (i + 1), 'braidR' + (i + 1)]) bones[B[n]].quaternion.multiplyQuaternions(this.Npi[B[n]], _q).multiply(this.N[B[n]]);
    }
    for (let i = 0; i < 2; i++) {
      const tgt = (i === 0 ? -hp * 0.35 : 0) + bounce * 0.4;
      const v = this.beard[i].step(clamp(tgt, -0.8, 0.8), dt, this.accel.z * 0.1);
      eulerQuat(_q, v, 0, 0, XZY);
      const b = B['beard' + (i + 1)];
      bones[b].quaternion.multiplyQuaternions(this.Npi[b], _q).multiply(this.N[b]);
    }
  }
}

const LEGS_MASK = new Float32Array(NB);
for (const n of ['thighL', 'shinL', 'footL', 'toeL', 'thighR', 'shinR', 'footR', 'toeR', 'hips']) LEGS_MASK[B[n]] = 1;

// ================================================================================================
// Base poses
function idlePose(p, t, ctx, A) {
  const R = ctx.rig, sd = A.seed;
  const breath = Math.sin(t * 1.6 + sd) * 0.5 + 0.5;
  const shift = Math.sin(t * 0.42 + sd * 1.7);
  // look around occasionally
  A.lookT -= 1 / 60;
  if (A.lookT < 0) { A.lookTarget = A.rand() < 0.5 ? 0 : (A.rand() - 0.5) * 1.2; A.lookT = 2 + A.rand() * 4; }
  A.look = lerp(A.look, A.lookTarget, 0.02);
  const heroic = R.race === 'orc' ? 1.3 : R.race === 'dwarf' ? 1.15 : 1;
  p.set(B.hips, 0.02, shift * 0.04, shift * 0.035);
  p.hip[0] = shift * 0.025; p.hip[1] = -0.012 - breath * 0.004;
  p.set(B.spine, 0.03, -shift * 0.02, -shift * 0.02);
  p.set(B.chest, 0.02 - breath * 0.035, -shift * 0.02, -shift * 0.012);
  p.set(B.neck, -0.05, A.look * 0.35, 0);
  p.set(B.head, 0.03 + breath * 0.02, A.look * 0.55, shift * 0.02);
  setClav(p, 'L', 0.02 + breath * 0.03); setClav(p, 'R', 0.02 + breath * 0.03);
  const ab = 0.12 * heroic;
  setArm(p, 'L', 0.06 + breath * 0.02, ab + breath * 0.02, 0.1, 0.22 + shift * 0.03, 0.05, 0, 0.38);
  setArm(p, 'R', 0.06 + breath * 0.02, ab + breath * 0.02, 0.1, 0.22 - shift * 0.03, 0.05, 0, 0.38);
  stance(p, ctx, 0.04 * heroic, 0.03 + shift * 0.01, -0.03, 0.16);
  p.feet[1] += 0; p.feet[6] += 0;
  p.face = 0;
}

function combatIdle(p, t, ctx, A) {
  const R = ctx.rig, sd = A.seed;
  const bob = Math.sin(t * 3.2 + sd);
  p.hip[1] = -0.07 * R.legLen / 0.87 + bob * 0.008; p.hip[2] = 0.02;
  p.set(B.hips, 0.05, -0.18, 0);
  p.set(B.spine, -0.08, 0.1, 0);
  p.set(B.chest, -0.06 + bob * 0.015, 0.1, 0);
  p.set(B.neck, 0.04, 0.0, 0);
  p.set(B.head, 0.06, -0.02, 0);
  stance(p, ctx, 0.1, 0.14, -0.12, 0.3);
  holdPose(p, ctx.drawn ? ctx.style : 'fists', t, ctx, A, bob);
}

function locoPose(p, ctx, A, speed, dir, amp) {
  const R = ctx.rig;
  const g = A.gait * amp;                      // 0 walk .. 1 run
  const ph = A.phase * Math.PI * 2;
  const back = Math.cos(dir) < -0.3;
  const sideness = Math.abs(Math.sin(dir));
  let legYaw = !back ? -clamp(dir, -1.2, 1.2) * 0.62 : -clamp(Math.atan2(Math.sin(dir), -Math.cos(dir)), -1.2, 1.2) * 0.5;
  const dx = Math.sin(dir), dz = -Math.cos(dir);
  const legScale = R.legLen / 0.87;
  const period = lerp(1.05, 0.7, A.gait) * Math.sqrt(legScale);
  const duty = lerp(0.6, 0.34, g);
  const S = Math.min(speed * duty * period, lerp(0.8, 0.95, g) * R.legLen) * amp;
  const lift = lerp(0.1, 0.3, g) * legScale * amp;
  const uF = lerp(0.5, 0.3, g), uB = uF - 1;
  // pelvis bob: lowest at mid-stance, highest mid-flight
  const bobA = lerp(0.018, 0.04, g) * legScale * amp;
  p.hip[1] = -lerp(0.025, 0.06, g) * legScale - bobA * Math.cos(4 * Math.PI * (A.phase - duty * 0.5));
  p.hip[0] = Math.sin(ph) * lerp(0.03, 0.012, g) * amp;
  p.hip[2] = lerp(0, 0.05, g) * (back ? -1 : 1) * amp;
  const hipYaw = legYaw + Math.sin(ph) * lerp(0.12, 0.2, g) * amp;
  p.set(B.hips, lerp(0.0, -0.12, g) * (back ? -0.4 : 1), hipYaw, Math.sin(ph) * 0.05 * amp);
  for (let side = 0; side < 2; side++) {
    const fph = (A.phase + (side === 0 ? 0 : 0.5)) % 1;
    let u, y = 0, pitch, toe = 0;
    if (fph < duty) {
      const k = fph / duty;
      u = lerp(uF, uB, k);
      if (!back) pitch = k < 0.18 ? lerp(0.28 * (1 - g * 0.6), 0, k / 0.18) : -smoothstep(0.6, 1, k) * lerp(0.35, 0.6, g);
      else pitch = k < 0.18 ? lerp(-0.3, 0, k / 0.18) : smoothstep(0.7, 1, k) * 0.2;
      toe = smoothstep(0.6, 1, k) * lerp(0.4, 0.7, g) * (back ? 0.3 : 1);
    } else {
      const k = (fph - duty) / (1 - duty);
      const e = smoothstep(lerp(0.0, 0.18, g), 0.92, k);
      u = lerp(uB, uF, e);
      const lk = Math.sin(Math.PI * Math.pow(k, lerp(1, 0.6, g)));
      y = lift * lk;
      pitch = back ? lerp(0.2, -0.3, k) : lerp(lerp(-0.45, -0.95, g), lerp(0.2, 0.1, g), smoothstep(0.25, 0.95, k));
      toe = (1 - k) * 0.25;
    }
    const sg = side === 0 ? -1 : 1, o = side * 5;
    const wid = R.stanceX * (1 - sideness * 0.3) + sideness * 0.02 - g * 0.02;
    const lx = sg * wid * Math.cos(legYaw), lz = sg * wid * Math.sin(legYaw);
    p.feet[o] = lx + dx * u * S; p.feet[o + 1] = R.ankleH + y; p.feet[o + 2] = lz + dz * u * S;
    p.feet[o + 3] = pitch; p.feet[o + 4] = legYaw + sg * 0.1;
    p.toe[side] = toe;
  }
  // upper body
  const sw = Math.sin(ph);
  const leanB = back ? 0.08 : 1;
  p.set(B.spine, lerp(-0.02, -0.12, g) * leanB * amp, -hipYaw * 0.45, -Math.sin(ph) * 0.03);
  p.set(B.chest, lerp(-0.02, -0.1, g) * leanB * amp + Math.abs(Math.cos(ph)) * 0.02 * g, -hipYaw * 0.45 - sw * 0.06 * g, 0);
  p.set(B.neck, lerp(0.0, 0.12, g) * leanB * amp, 0, 0);
  p.set(B.head, lerp(0.02, 0.14, g) * leanB * amp, 0, 0);
  // arms swing opposite to legs; run = compact pumping fists
  const armAmp = lerp(0.32, 0.62, g) * amp;
  for (const s of ['L', 'R']) {
    const a = (s === 'L' ? -sw : sw);
    const fwd = Math.max(0, a);
    setArm(p, s, lerp(0.04, 0.12, g) + a * armAmp, lerp(0.1, 0.17, g), lerp(0.05, 0.35, g),
      lerp(0.22 + fwd * 0.2, 1.45 + fwd * 0.3 - Math.max(0, -a) * 0.25, g), 0.1, 0, lerp(0.4, 1.25, g));
    setClav(p, s, 0.03 + fwd * 0.05 * g, a * 0.1 * g);
  }
  if (A.combatW > 0.01 && ctx.drawn) { // hold weapon while moving
    const T = A.T3.copy(p);
    holdPose(T, ctx.style, ctx.t, ctx, A, sw * 0.3);
    p.lerp(T, A.combatW * 0.8, ARM_MASK);
  }
}

function jumpPose(p, ctx, A) {
  const R = ctx.rig, legScale = R.legLen / 0.87;
  const vy = A.vy, rising = clamp(vy / 5, -1, 1);
  const moving = A.moveW;
  p.ikw = 1;
  p.hip[1] = 0.02;
  const tuck = clamp(0.6 - Math.abs(rising) * 0.3 + (rising < 0 ? -rising * 0.2 : 0), 0, 1);
  // standing jump: both knees up; running: split
  const split = moving;
  for (let side = 0; side < 2; side++) {
    const sg = side === 0 ? -1 : 1, o = side * 5;
    const lead = side === 1 ? 1 : -1;
    p.feet[o] = sg * R.stanceX * 1.05;
    p.feet[o + 1] = R.ankleH + (0.28 * tuck) * legScale * (1 - split * 0.5) + (split * (lead > 0 ? 0.3 : 0.18)) * legScale;
    p.feet[o + 2] = (-lead * 0.28 * split + 0.05 * (1 - split)) * legScale;
    p.feet[o + 3] = lerp(-0.4, -0.2, tuck); p.feet[o + 4] = sg * -0.1;
  }
  p.set(B.hips, -0.08 * tuck, 0, 0);
  p.set(B.spine, -0.08, 0, 0); p.set(B.chest, -0.05 + rising * 0.08, 0, 0);
  p.set(B.head, 0.1 * rising, 0, 0);
  const armUp = 0.5 + rising * 0.5;
  setArm(p, 'L', 0.3 + armUp * 0.4, 0.45 + armUp * 0.3, 0.1, 0.6, 0, 0, 0.5);
  setArm(p, 'R', 0.3 + armUp * 0.4, 0.45 + armUp * 0.3, 0.1, 0.6, 0, 0, 0.5);
  if (A.combatW > 0.01 && ctx.drawn) { const T = A.T3.copy(p); holdPose(T, ctx.style, ctx.t, ctx, A, 0); p.lerp(T, A.combatW * 0.7, ARM_MASK); }
}

function swimPose(p, ctx, A, speed) {
  const R = ctx.rig, t = ctx.t;
  const mv = clamp(speed / 4, 0, 1);
  const ph = t * lerp(1.4, 2.4, mv) * Math.PI * 2 * 0.5;
  p.ikw = 0;
  const pitch = -lerp(0.35, 1.2, mv); // body leans forward toward horizontal
  // root sits at the water surface: keep the neck just below it (head above water)
  p.hip[1] = -R.hips.y - lerp(R.torso * Math.cos(0.35) + 0.04, R.torso * Math.cos(1.2) - 0.02, mv) + Math.sin(ph) * 0.02;
  p.hip[2] = lerp(0, 0.35, mv) * R.legLen;
  p.set(B.hips, pitch, 0, Math.sin(ph * 0.5) * 0.05);
  p.set(B.spine, 0.1 * mv, 0, 0);
  p.set(B.chest, 0.18 * mv, 0, 0);
  p.set(B.neck, 0.3 * mv, 0, 0);
  p.set(B.head, 0.35 * mv + 0.1, 0, 0);
  // breaststroke arms
  const st = (Math.sin(ph) + 1) * 0.5; // 0 extended, 1 pulled
  for (const s of ['L', 'R']) {
    setArm(p, s, lerp(2.4, 1.2, st) * mv + (1 - mv) * (0.6 + Math.sin(ph + (s === 'L' ? 0 : 1)) * 0.3), lerp(0.2, 1.0, st), 0.4, lerp(0.1, 1.2, st), 0.3, 0, 0.1);
  }
  // frog kick / tread
  for (const s of ['L', 'R']) {
    const sg = s === 'R' ? 1 : -1;
    const k = (Math.sin(ph + Math.PI * 0.5) + 1) * 0.5;
    p.set(B['thigh' + s], lerp(-0.1, 0.9, k) * mv + (1 - mv) * (0.3 + Math.sin(ph + (s === 'L' ? 0 : Math.PI)) * 0.3), 0, sg * lerp(0.1, 0.5, k));
    p.set(B['shin' + s], -lerp(0.1, 1.6, k) * mv - (1 - mv) * (0.7 + Math.sin(ph + (s === 'L' ? 0 : Math.PI)) * 0.4), 0, 0);
    p.set(B['foot' + s], -0.5 * mv, 0, 0);
  }
}

function sitPose(p, ctx, A) {
  const R = ctx.rig, t = ctx.t;
  p.ikw = 0;
  const legScale = R.legLen / 0.87;
  p.hip[1] = -(R.hips.y - 0.12 * legScale - 0.05); p.hip[2] = 0.05;
  const br = Math.sin(t * 1.5) * 0.015;
  p.set(B.hips, 0.25, 0, 0);
  p.set(B.spine, -0.15, 0, 0); p.set(B.chest, -0.2 + br, 0, 0); p.set(B.neck, 0.05, 0, 0); p.set(B.head, 0.1, Math.sin(t * 0.3) * 0.2, 0);
  for (const s of ['L', 'R']) {
    const sg = s === 'R' ? 1 : -1;
    p.set(B['thigh' + s], 1.3, -sg * 0.1, sg * 0.3);
    p.set(B['shin' + s], -2.1, 0, 0);
    p.set(B['foot' + s], 0.4, 0, 0);
    setArm(p, s, 0.55, 0.35, -0.2, 0.7, -0.2, 0, 0.3);
  }
}

function deathPose(p, ctx, A) {
  const R = ctx.rig, t = A.deadT;
  const k1 = smoothstep(0, 0.35, t), k2 = smoothstep(0.25, 0.8, t);
  const bounce = t > 0.8 && t < 1.1 ? Math.sin((t - 0.8) / 0.3 * Math.PI) * 0.03 : 0;
  p.ikw = 1 - k2;
  const legScale = R.legLen / 0.87;
  stance(p, ctx, 0.05, 0.1 * k1, -0.1 * k1, 0.2);
  p.hip[1] = lerp(-0.25 * k1 * legScale, -(R.hips.y - 0.13), k2) + bounce;
  p.hip[2] = lerp(0.05 * k1, 0.35 * legScale, k2);
  p.set(B.hips, lerp(0.15 * k1, Math.PI / 2 - 0.05, k2), 0.1 * k2, 0.05 * k2);
  p.set(B.spine, lerp(-0.2 * k1, 0.05, k2), 0, 0);
  p.set(B.chest, lerp(-0.25 * k1, 0.02, k2), 0, 0);
  p.set(B.neck, lerp(-0.1, 0.1, k2), 0, 0);
  p.set(B.head, lerp(-0.2, 0.1, k2), 0.7 * k2, 0.2 * k2);
  setArm(p, 'L', lerp(0.3, 0.1, k2), lerp(0.3, 1.2, k2), 0, lerp(0.8, 0.3, k2), 0, 0, 0.25);
  setArm(p, 'R', lerp(0.3, 0.3, k2), lerp(0.3, 0.8, k2), 0, lerp(0.8, 0.6, k2), 0, 0, 0.3);
  // FK legs once down
  p.set(B.thighL, lerp(0, -0.05, k2), 0, -0.12); p.set(B.shinL, lerp(-0.8, -0.1, k2), 0, 0); p.set(B.footL, 0.3 * k2, 0, 0);
  p.set(B.thighR, lerp(0, 0.35, k2), 0, 0.1); p.set(B.shinR, lerp(-0.8, -0.7, k2), 0, 0); p.set(B.footR, 0.2 * k2, 0, 0);
}

function drawGesture(p, ctx, A) {
  // reach over the right shoulder (back weapons) or across to the left hip
  const hip = ctx.style === 'dual' || ctx.style === '1h' || ctx.style === 'sword1h';
  if (hip) setArm(p, 'R', 0.5, -0.35, 0.3, 1.2, 0.2, 0, 1.0);
  else setArm(p, 'R', 2.4, 0.5, 0.2, 1.8, 0.2, 0, 1.0);
  p.add(B.chest, 0, hip ? 0.25 : -0.15, 0);
}
