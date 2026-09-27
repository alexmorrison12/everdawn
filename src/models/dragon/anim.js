// Procedural animation for the dragon rig.
// Layers: locomotion modes (idle / combat / walk / hover / fly / glide / sleep / dead) cross-faded per bone,
// one-shot actions (slerp overrides with envelopes), look-at, spring secondary motion (neck/tail/wings),
// two-bone leg IK with a lateral-sequence gait, material effects (breath, eyes, throat, glow, membrane billow).
import * as THREE from 'three';
import { clamp, lerp, smoothstep, damp } from '../../core/noise.js';

const _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _q3 = new THREE.Quaternion();
const _e = new THREE.Euler();
const _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _v3 = new THREE.Vector3(), _v4 = new THREE.Vector3();
const _m = new THREE.Matrix4();
const TAU = Math.PI * 2;
const ss = (a, b, t) => smoothstep(a, b, t);
const env = (t, a, b, c, d) => ss(a, b, t) * (1 - ss(c, d, t)); // trapezoid envelope
const ease = (t) => t * t * (3 - 2 * t);
const V3 = (a) => new THREE.Vector3(a[0], a[1], a[2]);

export const ACTIONS = {
  roar: 2.8, bite: 1.1, cleave: 1.5, tailSwipe: 1.7, breath: 3.6, takeoff: 2.2, land: 1.9,
  deepBreath: 4.8, stagger: 1.2, enrage: 3.2, wake: 4.2, death: 3.2,
};

class Pose {
  constructor(n) { this.q = Array.from({ length: n }, () => new THREE.Quaternion()); this.p = new THREE.Vector3(); this.r = new THREE.Quaternion(); this.jaw = 0; }
  reset() { for (const q of this.q) q.identity(); this.p.set(0, 0, 0); this.r.identity(); this.jaw = 0; return this; }
}

export class DragonAnimator {
  constructor(dragon, rig, mats) {
    this.d = dragon; this.rig = rig; this.U = mats.U;
    this.bones = dragon.bones;
    const n = this.n = this.bones.length;
    const I = this.I = rig.idx, J = rig.J, S = this.S = rig.S;
    this.parent = rig.bones.map(b => b.parent);
    this.localPos = rig.bones.map((b, i) => b.parent < 0 ? V3(b.pos).multiplyScalar(S) : V3(b.pos).sub(V3(rig.bones[b.parent].pos)).multiplyScalar(S));
    this.side = rig.bones.map(b => /^(scap|arm|fore|hand|fing|thigh|shin|foot|toes)L$|^wingL/.test(b.name) ? -1 : 1); // mirror left limbs
    // world (root-space) FK buffers
    this.wq = Array.from({ length: n }, () => new THREE.Quaternion());
    this.wp = Array.from({ length: n }, () => new THREE.Vector3());
    // poses
    this.P = { idle: new Pose(n), walk: new Pose(n), fly: new Pose(n), hover: new Pose(n), glide: new Pose(n), sleep: new Pose(n), dead: new Pose(n), out: new Pose(n), act: new Pose(n) };
    this.w = { idle: 1, walk: 0, fly: 0, hover: 0, glide: 0, sleep: 0, dead: 0 };
    this.t = 0; this.gait = 0; this.flapPh = 0; this.hoverPh = 0; this.glideT = 0;
    this.actions = [];
    this.lookTarget = null; this.look = new THREE.Vector2(); // yaw, pitch
    this.glowBase = 1; this.glowCur = 1; this.enraged = 0;
    this.combat = 0; this.speedS = 0; this.turnS = 0;
    this.blinkT = 3; this.blink = 0;
    this.throat = 0; this.eyeOpen = 1;
    this.sleeping = false; this.dead = false;
    this.spring = { tailYaw: new Float32Array(12), tailYawV: new Float32Array(12), neckYaw: 0, neckYawV: 0 };
    // rest directions for aim/IK
    const dir = (a, b) => V3(b).sub(V3(a)).normalize();
    this.restDir = {};
    for (const sd of ['L', 'R']) {
      this.restDir['wing' + sd + '0'] = dir(J['wS' + sd], J['wE' + sd]);
      this.restDir['wing' + sd + '1'] = dir(J['wE' + sd], J['wW' + sd]);
      for (let f = 0; f < 4; f++) {
        this.restDir[`wing${sd}f${f}a`] = dir(J['wW' + sd], J['wK' + sd][f]);
        this.restDir[`wing${sd}f${f}b`] = dir(J['wK' + sd][f], J['wT' + sd][f]);
      }
    }
    // legs: IK data
    this.legs = [];
    for (const sd of ['L', 'R']) {
      const s = sd === 'L' ? -1 : 1;
      this.legs.push(this._legDef('F' + sd, s, I['arm' + sd], I['fore' + sd], I['hand' + sd], I['fing' + sd], J['sh' + sd], J['elbow' + sd], J['wrist' + sd], J['knuck' + sd], 0.25 + (s > 0 ? 0.5 : 0), true));
      this.legs.push(this._legDef('H' + sd, s, I['thigh' + sd], I['shin' + sd], I['foot' + sd], I['toes' + sd], J['hip' + sd], J['knee' + sd], J['hock' + sd], J['ball' + sd], s > 0 ? 0.5 : 0, false));
    }
    this.onStep = null;
    this._fold = this._precomputeFold(false);
    this._foldTight = this._precomputeFold(true);
  }

  _legDef(name, s, a, b, c, d, pA, pB, pC, pD, phase, front) {
    const S = this.S;
    const A = V3(pA), B = V3(pB), C = V3(pC), D = V3(pD);
    const l1 = A.distanceTo(B) * S, l2 = B.distanceTo(C) * S;
    const line = C.clone().sub(A).normalize();
    const pole = B.clone().sub(A); pole.sub(line.clone().multiplyScalar(pole.dot(line))).normalize();
    return {
      name, s, a, b, c, d, l1, l2, phase, front,
      restDirA: B.clone().sub(A).normalize(), restDirB: C.clone().sub(B).normalize(), pole,
      endOff: C.clone().sub(D).multiplyScalar(S),        // wrist/hock relative to the contact joint (rest)
      neutral: new THREE.Vector3(D.x * S, 0, D.z * S),     // contact point on the ground
      contactY: D.y * S,
      swingPrev: false, cur: new THREE.Vector3(D.x * S, 0, D.z * S),
    };
  }

  // ---------------------------------------------------------------- helpers
  E(pose, name, x, y, z) { const i = this.I[name]; const s = this.side[i]; pose.q[i].setFromEuler(_e.set(x, y * s, z * s, 'YXZ')); }
  Emul(pose, name, x, y, z) { const i = this.I[name]; const s = this.side[i]; _q.setFromEuler(_e.set(x, y * s, z * s, 'YXZ')); pose.q[i].multiply(_q); }
  Epre(pose, name, x, y, z) { const i = this.I[name]; const s = this.side[i]; _q.setFromEuler(_e.set(x, y * s, z * s, 'YXZ')); pose.q[i].premultiply(_q); }

  /** Folded wing: aim each bone at a direction expressed in the chest frame (right side; mirrored for left). */
  _precomputeFold(tight = false) {
    const out = {};
    for (const sd of ['L', 'R']) {
      const s = sd === 'L' ? -1 : 1;
      const X = (x, y, z) => new THREE.Vector3(x * s, y, z).normalize();
      const aims = [
        ['wing' + sd + '0', tight ? X(0.42, 0.42, 0.8) : X(0.26, 0.82, 0.5)],
        ['wing' + sd + '1', tight ? X(0.1, -0.2, -0.97) : X(0.12, -0.12, -0.98)],
      ];
      for (let f = 0; f < 4; f++) {
        aims.push([`wing${sd}f${f}a`, X(0.1 + f * 0.02, (tight ? -0.2 : -0.1) - f * 0.12, 1)]);
        aims.push([`wing${sd}f${f}b`, X(0.06 + f * 0.02, (tight ? -0.3 : -0.2) - f * 0.16, 1)]);
      }
      // compute local quats sequentially (parent world known)
      const wq = {};
      const pw = (name) => {
        const b = this.I[name], p = this.parent[b], pn = this.rig.bones[p].name;
        return wq[pn] || new THREE.Quaternion();
      };
      out[sd] = {};
      for (const [name, d] of aims) {
        const rest = this.restDir[name];
        const Qw = new THREE.Quaternion().setFromUnitVectors(rest, d);
        // add a twist so the folded membrane hangs outboard
        if (name.endsWith('0')) Qw.premultiply(new THREE.Quaternion().setFromAxisAngle(d, -0.5 * s));
        const par = pw(name);
        const local = par.clone().invert().multiply(Qw);
        out[sd][name] = local;
        wq[name] = Qw;
        if (name.endsWith('1')) { wq['wing' + sd + '2'] = Qw.clone(); out[sd]['wing' + sd + '2'] = new THREE.Quaternion(); }
      }
    }
    return out;
  }

  /** Wing pose: spread 0..1 (0 = folded on the back), flap angle (rad, + up), sweep (+ fwd), fingerFan, twist. */
  wing(pose, sd, spread, flap = 0, sweep = 0, fan = 0, twist = 0, lagFlap = 0, curl = 0, tight = 0) {
    const s = sd === 'L' ? -1 : 1;
    const F = this._fold[sd], FT = this._foldTight[sd];
    const names = ['wing' + sd + '0', 'wing' + sd + '1', 'wing' + sd + '2'];
    for (let f = 0; f < 4; f++) names.push(`wing${sd}f${f}a`, `wing${sd}f${f}b`);
    for (const nm of names) {
      const i = this.I[nm];
      // spread pose (Euler) for this bone
      let ex = 0, ey = 0, ez = 0;
      if (nm.endsWith('0')) { ez = flap; ey = sweep; ex = twist; }
      else if (nm.endsWith('1')) { ez = -lagFlap * 0.5 - curl * 0.3; ey = -curl * 0.9; }
      else if (nm.endsWith('2')) { ez = -lagFlap * 0.45; ey = curl * 0.6; }
      else {
        const f = +nm[nm.length - 2];
        const seg = nm[nm.length - 1];
        ey = (seg === 'a' ? fan * (f - 1.5) * 0.12 - curl * 0.45 : -curl * 0.25);
        ez = seg === 'a' ? -lagFlap * 0.3 : -lagFlap * 0.35;
      }
      _q.setFromEuler(_e.set(ex, ey * s, ez * s, 'YXZ'));
      pose.q[i].copy(F[nm]);
      if (tight > 0) pose.q[i].slerp(FT[nm], tight);
      pose.q[i].slerp(_q, clamp(spread, 0, 1));
    }
  }

  // ---------------------------------------------------------------- locomotion poses
  poseIdle(P, t, combat, enr) {
    P.reset();
    const br = Math.sin(t * TAU / (3.6 - combat * 1.2));
    // body settles; combat crouch
    P.p.y = -0.06 * this.S + br * 0.03 * this.S - combat * 0.35 * this.S;
    this.E(P, 'pelvis', 0.02 * br, 0, 0);
    this.E(P, 'spine2', -0.015 * br, 0, 0);
    this.E(P, 'chest', -0.02 * br - combat * 0.06, 0, 0);
    // neck: S-curve, combat lowers the head and pushes it forward
    const sway = Math.sin(t * 0.45) * 0.08, nod = Math.sin(t * 0.7 + 1) * 0.03;
    const nb = [0.16, 0.12, 0.02, -0.12, -0.2, -0.24];
    const nc = [-0.12, -0.14, -0.1, 0.02, 0.12, 0.18];
    for (let i = 0; i < 6; i++) this.E(P, 'neck' + (i + 1), nb[i] + combat * nc[i] + nod * (i < 3 ? -1 : 1), sway * (0.4 + i * 0.12), 0);
    this.E(P, 'head', -0.05 + combat * 0.1 + Math.sin(t * 0.9) * 0.03, Math.sin(t * 0.33) * 0.12, Math.sin(t * 0.5) * 0.03);
    P.jaw = combat * (0.08 + 0.04 * Math.sin(t * 3.1));
    // tail: lazy traveling wave, lies closer to the ground; combat raises and lashes
    for (let i = 0; i < 12; i++) {
      const f = i / 11;
      const yaw = Math.sin(t * (0.9 + combat * 1.4) - i * 0.45) * (0.05 + f * 0.1) * (1 + combat * 0.8);
      this.E(P, 'tail' + (i + 1), (i < 4 ? 0.04 : -0.1 + f * 0.08) - combat * (i < 6 ? 0.08 : 0), yaw + (i > 3 ? 0.06 : 0), 0);
    }
    // wings: folded, breathing with the body, occasional resettling twitch; combat half-raises them
    const wr = 0.02 * br;
    for (const sd of ['L', 'R']) {
      const tp = ((t + (sd === 'L' ? 3.1 : 0)) % (sd === 'L' ? 8.9 : 7.3)) / 1.1;
      const tw = tp < 1 ? Math.sin(Math.PI * tp) * (1 - combat) : 0;
      this.wing(P, sd, combat * 0.28 + tw * 0.22, wr + combat * 0.3 + tw * 0.3, 0, 0, 0, Math.sin(tp * 9) * 0.08 * tw, 0.3 * combat + tw * 0.2);
    }
    return P;
  }

  poseWalk(P, t, ph, speed) {
    this.poseIdle(P, t, this.combat * 0.4, 0);
    const a = TAU * ph;
    const amp = clamp(Math.abs(speed) / (3 * this.S * 1.05), 0.3, 1.2);
    // heavy body: bob twice per cycle, roll towards the stance side, shoulders roll
    P.p.y += (-0.1 * Math.abs(Math.cos(a)) + 0.03) * this.S * amp;
    P.r.setFromEuler(_e.set(Math.sin(a * 2) * 0.012 * amp, Math.sin(a) * 0.03 * amp, Math.sin(a) * 0.035 * amp, 'YXZ'));
    this.Emul(P, 'chest', 0, Math.sin(a + 0.8) * 0.06 * amp, Math.sin(a + 0.8) * 0.05 * amp);
    this.Emul(P, 'pelvis', 0, -Math.sin(a) * 0.05 * amp, -Math.sin(a) * 0.03 * amp);
    // head stabilised: neck counter-sways
    for (let i = 0; i < 6; i++) this.Emul(P, 'neck' + (i + 1), Math.cos(a * 2) * 0.012 * amp, -Math.sin(a + 0.8) * 0.02 * amp, 0);
    this.Emul(P, 'head', -Math.cos(a * 2) * 0.03 * amp, 0, 0);
    // tail sways with the gait
    for (let i = 0; i < 12; i++) this.Emul(P, 'tail' + (i + 1), 0, Math.sin(a - 0.6 - i * 0.35) * (0.03 + i * 0.012) * amp, 0);
    // wings bounce slightly
    for (const sd of ['L', 'R']) this.Emul(P, 'wing' + sd + '0', 0, 0, Math.cos(a * 2) * 0.03 * amp);
    return P;
  }

  poseFlyBody(P, t) {
    // shared flight body: horizontal, neck forward, legs tucked, tail streaming
    P.reset();
    const nb = [-0.28, -0.24, -0.16, -0.06, 0.04, 0.1];
    for (let i = 0; i < 6; i++) this.E(P, 'neck' + (i + 1), nb[i], 0, 0);
    this.E(P, 'head', 0.05, 0, 0);
    for (let i = 0; i < 12; i++) this.E(P, 'tail' + (i + 1), i < 5 ? -0.13 : 0.05 - i * 0.004, Math.sin(t * 1.4 - i * 0.5) * 0.035 * (1 + i * 0.1), 0);
    for (const sd of ['L', 'R']) {
      this.E(P, 'arm' + sd, -1.05, 0, 0.08); this.E(P, 'fore' + sd, 1.9, 0, 0); this.E(P, 'hand' + sd, -0.4, 0, 0); this.E(P, 'fing' + sd, 0.8, 0, 0);
      this.E(P, 'scap' + sd, 0.1, 0, 0);
      this.E(P, 'thigh' + sd, -0.75, 0, 0.06); this.E(P, 'shin' + sd, -0.55, 0, 0); this.E(P, 'foot' + sd, -0.9, 0, 0); this.E(P, 'toes' + sd, 0.6, 0, 0);
    }
    return P;
  }

  poseFly(P, t, ph, bank) {
    this.poseFlyBody(P, t);
    const a = TAU * ph;
    const down = Math.cos(a);                 // +1 top of stroke → -1 bottom
    const flap = 0.12 + down * 0.55;
    const lag = -Math.sin(a) * 0.5;           // tips trail the arm
    const fold = Math.max(0, Math.sin(a)) * 0.55; // partial fold on the upstroke
    P.p.y = -Math.sin(a) * 0.25 * this.S;
    this.E(P, 'chest', Math.sin(a) * 0.03, 0, 0);
    for (const sd of ['L', 'R']) this.wing(P, sd, 1, flap, -0.08 - fold * 0.2, 0.3, 0.1 + fold * 0.12, lag, fold);
    P.r.setFromEuler(_e.set(0.0, 0, bank, 'YXZ'));
    return P;
  }

  poseHover(P, t, ph) {
    this.poseFlyBody(P, t);
    const a = TAU * ph;
    const down = Math.cos(a);
    // upright body, deep figure-8 strokes, legs dangling, tail hanging
    P.r.setFromEuler(_e.set(0.3, 0, 0, 'YXZ'));
    P.p.y = -Math.sin(a) * 0.35 * this.S;
    for (let i = 0; i < 6; i++) this.E(P, 'neck' + (i + 1), [0.08, 0.06, 0.02, -0.06, -0.14, -0.2][i], Math.sin(t * 0.6) * 0.03, 0);
    this.E(P, 'head', -0.2, Math.sin(t * 0.4) * 0.1, 0);
    for (let i = 0; i < 12; i++) this.E(P, 'tail' + (i + 1), i < 4 ? 0.12 : 0.02, Math.sin(t * 1.1 - i * 0.4) * 0.05, 0);
    for (const sd of ['L', 'R']) {
      this.E(P, 'arm' + sd, -0.2, 0, 0.1); this.E(P, 'fore' + sd, 0.7, 0, 0); this.E(P, 'hand' + sd, 0.1, 0, 0); this.E(P, 'fing' + sd, 0.5, 0, 0);
      this.E(P, 'thigh' + sd, 0.15, 0, 0.1); this.E(P, 'shin' + sd, -0.2, 0, 0); this.E(P, 'foot' + sd, 0.2, 0, 0); this.E(P, 'toes' + sd, 0.4, 0, 0);
      const fold = Math.max(0, Math.sin(a)) * 0.6;
      this.wing(P, sd, 1, 0.05 + down * 0.8, 0.35 * down - 0.1, 0.4, 0.35 * -Math.sin(a), -Math.sin(a) * 0.55, fold);
    }
    return P;
  }

  poseGlide(P, t, bank) {
    this.poseFlyBody(P, t);
    const b = Math.sin(t * 0.7) * 0.04;
    for (const sd of ['L', 'R']) this.wing(P, sd, 1, 0.14 + b + (sd === 'L' ? bank : -bank) * 0.25, -0.12, 0.5, 0.08, Math.sin(t * 1.9) * 0.05, 0.05);
    P.r.setFromEuler(_e.set(0.03, 0, bank, 'YXZ'));
    P.p.y = Math.sin(t * 0.7) * 0.1 * this.S;
    return P;
  }

  poseSleep(P, t) {
    const br = Math.sin(t * TAU / 5.5);
    if (!this._sleepCache) {
      const C = new Pose(this.n), S = this.S, I = this.I;
      C.p.y = -2.05 * S;
      C.r.setFromEuler(_e.set(0.03, 0.15, 0.04, 'YXZ'));
      this.E(C, 'chest', 0, -0.1, 0); this.E(C, 'spine1', 0, 0.08, 0);
      for (const sd of ['L', 'R']) this.wing(C, sd, 0, 0, 0, 0, 0, 0, 0, 1);
      // neck: curl back along the right flank, head resting on the floor facing the tail
      const neck = [1, 2, 3, 4, 5, 6].map(i => I['neck' + i]);
      for (let i = 0; i < 6; i++) this.E(C, 'neck' + (i + 1), i === 0 ? -0.5 : 0.05, -0.32, 0);
      const headQ = new THREE.Quaternion().setFromEuler(_e.set(0.05, -2.3, -0.2, 'YXZ'));
      this.ccd(C, [...neck, I.head], new THREE.Vector3(0, -0.1 * S * this.rig.P.head, -1.2 * S * this.rig.P.head), new THREE.Vector3(3.0 * S, 0.75 * S, 0.9 * S), 14, 0.3, headQ);
      // tail: wrap around the left side towards the front
      const tail = Array.from({ length: 12 }, (_, i) => I['tail' + (i + 1)]);
      for (let i = 0; i < 12; i++) this.E(C, 'tail' + (i + 1), i < 3 ? 0.18 : 0.0, 0.2, 0);
      this.ccd(C, tail, new THREE.Vector3(0, 0, 0.5 * S), new THREE.Vector3(-2.9 * S, 0.45 * S, -2.6 * S), 10, 0.25);
      this._sleepCache = C;
    }
    const C = this._sleepCache;
    for (let i = 0; i < this.n; i++) P.q[i].copy(C.q[i]);
    P.p.copy(C.p); P.p.y += br * 0.04 * this.S; P.r.copy(C.r); P.jaw = 0;
    return P;
  }

  poseDead(P, t) {
    P.reset();
    // slumped on its left side: body on the ground, legs splayed, neck laid along the floor, head on its cheek
    P.p.set(1.1 * this.S, -1.95 * this.S, 0.2 * this.S);
    P.r.setFromEuler(_e.set(0.02, 0.12, 0.62, 'YXZ'));
    const np = [-0.2, -0.24, -0.2, -0.12, -0.04, 0.04], ny = [0.06, 0.09, 0.11, 0.11, 0.09, 0.06];
    for (let i = 0; i < 6; i++) this.E(P, 'neck' + (i + 1), np[i], ny[i], 0.04);
    this.E(P, 'head', 0.88, 0.2, 0.55);
    P.jaw = 0.3;
    for (let i = 0; i < 12; i++) this.E(P, 'tail' + (i + 1), i < 3 ? 0.18 : 0.03, 0.08 + 0.04 * Math.sin(i * 0.7), 0);
    // legs: the upper (right) pair sprawls, the lower pair folds under
    this.E(P, 'armR', -0.3, 0.2, 0.9); this.E(P, 'foreR', 0.5, 0, 0); this.E(P, 'handR', 0.5, 0, 0); this.E(P, 'fingR', 0.6, 0, 0);
    this.E(P, 'armL', 0.6, 0, -0.3); this.E(P, 'foreL', -1.2, 0, 0); this.E(P, 'handL', 0.9, 0, 0); this.E(P, 'fingL', 0.4, 0, 0);
    this.E(P, 'thighR', 0.2, 0, 0.8); this.E(P, 'shinR', -0.5, 0, 0); this.E(P, 'footR', 0.6, 0, 0); this.E(P, 'toesR', 0.5, 0, 0);
    this.E(P, 'thighL', 0.9, 0, -0.2); this.E(P, 'shinL', -1.5, 0, 0); this.E(P, 'footL', 1.0, 0, 0); this.E(P, 'toesL', 0.3, 0, 0);
    // wings drape: upper wing half-open over the flank, lower wing splayed on the floor
    this.wing(P, 'R', 0.55, -0.55, -0.2, 0.3, 0.25, 0.2, 0.3);
    this.wing(P, 'L', 0.85, 0.35, 0.1, 0.5, -0.1, -0.15, 0.1);
    return P;
  }

  // ---------------------------------------------------------------- actions
  play(name, { speed = 1 } = {}) {
    if (!(name in ACTIONS)) return false;
    if (name === 'death') { this.actions.length = 0; }
    if (name === 'wake') { this.sleeping = false; }
    // restart same action
    this.actions = this.actions.filter(a => a.name !== name);
    this.actions.push({ name, t: 0, dur: ACTIONS[name], speed, fired: {} });
    if (name === 'enrage') this.enraged = 1;
    return true;
  }

  /** Action pose → writes overrides into A (act pose), returns {w per bone mask fn, root, jaw, throat...}. */
  _action(a, base, out) {
    const t = a.t, D = a.dur, I = this.I, S = this.S, A = this.P.act;
    A.reset();
    const fx = { w: 0, bones: null, rootW: 0, jawW: 0, throat: 0, glow: 0, eye: null, legs: null };
    const setAll = (names) => { fx.bones = names.map(n => I[n]); };
    const neck = ['neck1', 'neck2', 'neck3', 'neck4', 'neck5', 'neck6', 'head'];
    const tail = Array.from({ length: 12 }, (_, i) => 'tail' + (i + 1));
    const wingsN = [];
    for (const sd of ['L', 'R']) { wingsN.push('wing' + sd + '0', 'wing' + sd + '1', 'wing' + sd + '2'); for (let f = 0; f < 4; f++) wingsN.push(`wing${sd}f${f}a`, `wing${sd}f${f}b`); }
    const copyBase = (names) => { for (const n of names) A.q[I[n]].copy(base.q[I[n]]); };
    switch (a.name) {
      case 'roar': {
        const k = env(t, 0, 0.35, 2.3, 2.8);
        const rear = ss(0, 0.5, t) * (1 - ss(0.5, 0.9, t)), thrust = ss(0.45, 0.8, t) * (1 - ss(2.2, 2.7, t));
        const shake = Math.sin(t * 38) * 0.025 * thrust;
        const np = [-0.05 + rear * 0.15 + thrust * 0.1, -0.05 + rear * 0.1, rear * 0.05 - thrust * 0.05, -thrust * 0.1, -thrust * 0.12, -thrust * 0.08];
        for (let i = 0; i < 6; i++) this.E(A, 'neck' + (i + 1), np[i], shake, 0);
        this.E(A, 'head', rear * 0.35 + thrust * 0.25, shake * 2, shake);
        A.jaw = ss(0.4, 0.7, t) * (1 - ss(2.1, 2.6, t)) * 0.62 + rear * 0.15;
        A.p.y = (rear * 0.35 + thrust * 0.15) * S; A.r.setFromEuler(_e.set(rear * 0.12 + thrust * 0.05, 0, 0, 'YXZ'));
        const mantle = Math.max(rear * 0.6, thrust);
        for (const sd of ['L', 'R']) this.wing(A, sd, 0.9 * mantle, 0.5 * mantle, 0.25 * mantle, 0.5, 0.15, Math.sin(t * 20) * 0.05 * thrust, 0.25 * (1 - thrust));
        setAll([...neck, ...wingsN]); fx.w = k; fx.rootW = k; fx.jawW = k; fx.throat = thrust * 0.8;
        if (!a.fired.shake && t > 0.8) { a.fired.shake = 1; this._emit('roar', this.wp[I.head], 0.6); }
        break;
      }
      case 'bite': {
        const k = env(t, 0, 0.15, 0.8, 1.1);
        const wind = ss(0, 0.3, t) * (1 - ss(0.3, 0.45, t)), lunge = ss(0.3, 0.45, t) * (1 - ss(0.6, 1.0, t));
        const np = [0.1 * wind - 0.2 * lunge, 0.12 * wind - 0.22 * lunge, 0.1 * wind - 0.15 * lunge, 0.05 * wind - 0.05 * lunge, 0.0, -0.05 * wind + 0.1 * lunge];
        for (let i = 0; i < 6; i++) this.E(A, 'neck' + (i + 1), np[i], 0, 0);
        this.E(A, 'head', 0.25 * wind - 0.2 * lunge, 0, 0);
        A.jaw = ss(0.05, 0.3, t) * (1 - ss(0.42, 0.5, t)) * 0.75;
        A.p.set(0, -0.1 * lunge * S, -0.4 * lunge * S);
        setAll(neck); fx.w = k; fx.rootW = k; fx.jawW = k;
        if (!a.fired.snap && t > 0.48) { a.fired.snap = 1; this._emit('bite', this.wp[I.jaw], 0.5); }
        break;
      }
      case 'cleave': {
        // right forepaw raised, swipes across the front
        const k = env(t, 0, 0.2, 1.1, 1.5);
        const raise = ss(0.0, 0.4, t) * (1 - ss(0.95, 1.4, t)), swipe = ss(0.4, 0.68, t);
        copyBase(neck);
        this.Epre(A, 'head', 0.1 * raise, 0.25 * (1 - swipe) - 0.1, 0);
        A.r.setFromEuler(_e.set(0.1 * raise, 0.25 * (1 - swipe * 2) * raise, 0.08 * raise, 'YXZ'));
        A.p.y = 0.25 * raise * S;
        const sd = 'R';
        this.E(A, 'arm' + sd, (-1.35 + 0.75 * swipe) * raise, (0.95 - 1.9 * swipe) * raise, (0.75 - 0.55 * swipe) * raise);
        this.E(A, 'fore' + sd, (1.1 - 0.5 * swipe) * raise, 0, 0);
        this.E(A, 'hand' + sd, -0.5 * raise, 0, 0);
        this.E(A, 'fing' + sd, -0.8 * raise, 0, 0);
        for (const s2 of ['L', 'R']) this.wing(A, s2, 0.25 * raise, 0.3 * raise, 0, 0.2, 0, 0, 0.3);
        setAll(['armR', 'foreR', 'handR', 'fingR', 'head', ...wingsN]); fx.w = k; fx.rootW = k; fx.legs = { FR: raise };
        if (!a.fired.hit && t > 0.6) { a.fired.hit = 1; this._emit('cleave', this.wp[I.fingR], 0.8); }
        break;
      }
      case 'tailSwipe': {
        const k = env(t, 0, 0.2, 1.3, 1.7);
        const wind = ss(0, 0.45, t) * (1 - ss(0.45, 0.7, t)), whip = ss(0.45, 0.72, t) * (1 - ss(1.0, 1.6, t));
        const dir = 1;
        A.r.setFromEuler(_e.set(0, (-0.15 * wind + 0.32 * whip) * dir, 0, 'YXZ'));
        for (let i = 0; i < 12; i++) {
          const lagW = ss(0.45 + i * 0.012, 0.75 + i * 0.012, t) * (1 - ss(1.0, 1.6, t));
          this.E(A, 'tail' + (i + 1), i < 4 ? -0.08 * (wind + lagW) : 0.02, (-0.12 * wind + 0.2 * lagW) * dir * (0.6 + i * 0.07), 0);
        }
        this.E(A, 'pelvis', 0, (-0.08 * wind + 0.15 * whip) * dir, 0);
        copyBase(neck);
        for (let i = 0; i < 6; i++) this.Epre(A, 'neck' + (i + 1), 0, (-0.05 * wind + 0.08 * whip) * dir, 0);
        setAll([...tail, 'pelvis', ...neck]); fx.w = k; fx.rootW = k;
        if (!a.fired.hit && t > 0.72) { a.fired.hit = 1; this._emit('tailSwipe', this.wp[I.tail10], 1.0); }
        break;
      }
      case 'breath': {
        // inhale (rear back) → head low towards the ground ahead, jaw wide, sustained ~3 s
        const k = env(t, 0, 0.3, 3.2, 3.6);
        const inhale = ss(0, 0.45, t) * (1 - ss(0.5, 0.8, t)), low = ss(0.5, 0.85, t) * (1 - ss(3.2, 3.6, t));
        const sweep = Math.sin((t - 0.8) * 1.2) * 0.12 * low;
        const np = [0.12 * inhale - 0.3 * low, 0.1 * inhale - 0.25 * low, 0.05 * inhale - 0.12 * low, -0.02 * low, 0.1 * low, 0.18 * low];
        for (let i = 0; i < 6; i++) this.E(A, 'neck' + (i + 1), np[i], sweep * (0.4 + i * 0.1), 0);
        this.E(A, 'head', 0.3 * inhale + 0.02 * low, sweep, 0);
        A.jaw = inhale * 0.15 + low * 0.8;
        A.p.y = (0.3 * inhale - 0.2 * low) * S; A.r.setFromEuler(_e.set(0.1 * inhale - 0.04 * low, 0, 0, 'YXZ'));
        for (const sd of ['L', 'R']) this.wing(A, sd, 0.35 * inhale + 0.3 * low, 0.35 * inhale + 0.25 * low, 0, 0.3, 0.1, 0, 0.4);
        setAll([...neck, ...wingsN]); fx.w = k; fx.rootW = k; fx.jawW = k; fx.throat = inhale * 0.5 + low * 1.0;
        fx.breathing = low;
        break;
      }
      case 'takeoff': {
        const crouch = ss(0, 0.55, t) * (1 - ss(0.55, 0.8, t)), leap = ss(0.6, 0.95, t);
        const k = env(t, 0, 0.2, 1.7, 2.2);
        A.p.y = (-0.8 * crouch + 1.0 * leap * (1 - ss(1.2, 2.0, t))) * S;
        A.r.setFromEuler(_e.set(-0.1 * crouch + 0.2 * leap * (1 - ss(1.3, 2.1, t)), 0, 0, 'YXZ'));
        // strokes: raise (0.1-0.6), slam (0.6-0.9), recover (0.9-1.25), second stroke (1.25-1.55), settle
        let flap, lag;
        if (t < 0.6) { flap = 1.1 * ss(0.1, 0.55, t); lag = 0.25 * ss(0.1, 0.5, t); }
        else if (t < 0.9) { flap = 1.1 - 1.8 * ease((t - 0.6) / 0.3); lag = -0.5; }
        else if (t < 1.25) { flap = -0.7 + 1.5 * ease((t - 0.9) / 0.35); lag = 0.45; }
        else if (t < 1.55) { flap = 0.8 - 1.4 * ease((t - 1.25) / 0.3); lag = -0.45; }
        else { flap = -0.6 + 0.7 * ease(Math.min(1, (t - 1.55) / 0.45)); lag = 0.2; }
        const fold = lag > 0 ? lag * 0.8 : 0;
        for (const sd of ['L', 'R']) this.wing(A, sd, ss(0.05, 0.45, t), flap, -0.1, 0.4, 0.15, lag, fold);
        copyBase(neck);
        for (let i = 0; i < 6; i++) this.Epre(A, 'neck' + (i + 1), -0.06 * leap + 0.05 * crouch, 0, 0);
        setAll([...wingsN, ...neck]); fx.w = k; fx.rootW = k;
        if (!a.fired.jump && t > 0.8) { a.fired.jump = 1; this._emit('takeoff', this.wp[I.pelvis], 1.2, true); }
        break;
      }
      case 'land': {
        const k = env(t, 0, 0.15, 1.5, 1.9);
        const flare = ss(0, 0.35, t) * (1 - ss(0.9, 1.3, t)), impact = ss(0.85, 1.0, t) * (1 - ss(1.0, 1.6, t));
        A.p.y = (0.5 * flare * (1 - ss(0.6, 0.95, t)) - 0.7 * impact) * S;
        A.r.setFromEuler(_e.set(0.12 * flare - 0.12 * impact, 0, 0, 'YXZ'));
        for (const sd of ['L', 'R']) this.wing(A, sd, Math.max(flare, 1 - ss(1.0, 1.7, t)), 0.35 * flare - 0.3 * impact, 0.3 * flare, 0.6, -0.4 * flare, -0.2 * flare, 0.1);
        setAll(wingsN); fx.w = k; fx.rootW = k;
        if (!a.fired.touch && t > 0.95) { a.fired.touch = 1; this._emit('land', this.wp[I.pelvis], 2.0, true); }
        break;
      }
      case 'deepBreath': {
        // in flight: head down, long inhale → exhale sweeping forward/down
        const k = env(t, 0, 0.4, 4.3, 4.8);
        const inhale = ss(0, 1.8, t) * (1 - ss(2.0, 2.4, t)), exhale = ss(2.0, 2.4, t) * (1 - ss(4.2, 4.8, t));
        const np = [0.1 * inhale - 0.25 * exhale, 0.14 * inhale - 0.2 * exhale, 0.1 * inhale - 0.15 * exhale, 0.02 * inhale - 0.05 * exhale, -0.05 * inhale + 0.05 * exhale, -0.1 * inhale + 0.1 * exhale];
        for (let i = 0; i < 6; i++) this.E(A, 'neck' + (i + 1), np[i] - 0.05, 0, 0);
        this.E(A, 'head', 0.25 * inhale - 0.45 * exhale, 0, 0);
        A.jaw = 0.1 * inhale + 0.85 * exhale;
        A.r.setFromEuler(_e.set(0.12 * inhale - 0.12 * exhale, 0, 0, 'YXZ'));
        setAll(neck); fx.w = k; fx.rootW = k; fx.jawW = k; fx.throat = Math.min(1, inhale * 1.1) * 0.9 + exhale;
        fx.breathing = exhale; fx.chest = inhale;
        break;
      }
      case 'stagger': {
        const k = env(t, 0, 0.06, 0.8, 1.2);
        const hit = Math.exp(-t * 4) * Math.sin(t * 14);
        for (let i = 0; i < 6; i++) this.E(A, 'neck' + (i + 1), 0.08 * hit, 0.06 * hit, 0);
        this.E(A, 'head', 0.3 * hit, 0.15 * hit, 0.1 * hit);
        A.r.setFromEuler(_e.set(0.06 * hit, 0.04 * hit, 0.08 * hit, 'YXZ'));
        A.p.y = -0.2 * Math.abs(hit) * S;
        A.jaw = 0.3 * Math.abs(hit);
        setAll(neck); fx.w = k; fx.rootW = k; fx.jawW = k;
        break;
      }
      case 'enrage': {
        // rear up on the hind legs, wings spread wide, roar; glow ramps and stays
        const k = env(t, 0, 0.4, 2.6, 3.2);
        const rear = ss(0, 0.8, t) * (1 - ss(2.4, 3.1, t)), roar = ss(0.7, 1.0, t) * (1 - ss(2.3, 2.8, t));
        const shake = Math.sin(t * 40) * 0.02 * roar;
        A.r.setFromEuler(_e.set(0.55 * rear, 0, 0, 'YXZ'));
        const piv = this._pelvisPivot;
        A.p.set(0, 0.2 * rear * S, 0);
        A.p.add(_v.copy(piv).sub(_v2.copy(piv).applyQuaternion(A.r)));
        for (let i = 0; i < 6; i++) this.E(A, 'neck' + (i + 1), [0.25, 0.2, 0.05, -0.1, -0.15, -0.12][i] * rear + [0.1, 0.05, 0, -0.08, -0.1, -0.1][i] * roar, shake, 0);
        this.E(A, 'head', 0.35 * roar - 0.1 * rear, shake * 2, 0);
        A.jaw = 0.9 * roar;
        for (const sd of ['L', 'R']) {
          this.E(A, 'arm' + sd, -0.5 * rear, 0, 0.35 * rear); this.E(A, 'fore' + sd, 0.8 * rear, 0, 0); this.E(A, 'hand' + sd, -0.2 * rear, 0, 0); this.E(A, 'fing' + sd, -0.5 * rear, 0, 0);
          this.wing(A, sd, rear, 0.5 * rear + Math.sin(t * 9) * 0.06 * roar, 0.2, 0.6, 0.1, 0, 0);
        }
        for (let i = 0; i < 12; i++) this.E(A, 'tail' + (i + 1), i < 4 ? 0.35 * rear : 0.05 * rear, 0, 0);
        setAll([...neck, ...wingsN, 'armL', 'foreL', 'handL', 'fingL', 'armR', 'foreR', 'handR', 'fingR', ...tail]);
        fx.w = k; fx.rootW = k; fx.jawW = k; fx.throat = roar * 0.9; fx.glow = ss(0.6, 1.4, t); fx.legs = { FL: rear, FR: rear };
        if (!a.fired.roar && t > 1.0) { a.fired.roar = 1; this._emit('enrage', this.wp[I.head], 1.0); }
        if (!a.fired.stomp && t > 2.95) { a.fired.stomp = 1; this._emit('stomp', this.wp[I.chest], 1.6, true); }
        break;
      }
      case 'wake': {
        // from sleep: eyes open, head lifts, rises, stretches, shakes, short roar
        const k = 1 - ss(3.6, 4.2, t);
        const sl = this.P.sleep; this.poseSleep(sl, this.t);
        const rise = ss(1.2, 2.6, t), lift = ss(0.4, 1.4, t), stretch = ss(2.0, 2.6, t) * (1 - ss(2.9, 3.4, t));
        const roar = ss(2.8, 3.1, t) * (1 - ss(3.5, 3.9, t));
        // blend from the sleep pose towards the base (idle) pose
        for (let i = 0; i < this.n; i++) A.q[i].copy(sl.q[i]).slerp(base.q[i], rise);
        A.p.copy(sl.p).lerp(base.p, rise); A.r.copy(sl.r).slerp(base.r, rise);
        // head comes up first
        for (let i = 0; i < 6; i++) { _q.copy(sl.q[I['neck' + (i + 1)]]).slerp(base.q[I['neck' + (i + 1)]], Math.max(rise, lift * 0.7)); A.q[I['neck' + (i + 1)]].copy(_q); this.Emul(A, 'neck' + (i + 1), 0.06 * stretch + 0.05 * roar, 0, 0); }
        this.Emul(A, 'head', 0.3 * stretch + 0.3 * roar, Math.sin(t * 22) * 0.05 * stretch, Math.sin(t * 25) * 0.08 * stretch);
        for (const sd of ['L', 'R']) this.wing(A, sd, stretch * 0.7 + roar * 0.4, stretch * 0.6 + 0.3 * roar, 0, 0.5, 0, Math.sin(t * 18) * 0.1 * stretch, 0.2);
        A.jaw = 0.35 * stretch + 0.75 * roar;
        fx.bones = null; fx.all = true; fx.w = k; fx.rootW = k; fx.jawW = k; fx.throat = roar * 0.7;
        fx.eye = ss(0.1, 0.5, t);
        if (!a.fired.roar && t > 3.0) { a.fired.roar = 1; this._emit('roar', this.wp[I.head], 0.8); }
        break;
      }
      case 'death': {
        const k = 1;
        const fall = ease(ss(0.3, 2.2, t)), buckle = ss(0, 0.6, t);
        const dp = this.P.dead; this.poseDead(dp, this.t);
        for (let i = 0; i < this.n; i++) A.q[i].copy(base.q[i]).slerp(dp.q[i], Math.min(1, fall * 1.1 + buckle * 0.1));
        A.p.copy(base.p).lerp(dp.p, fall); A.r.copy(base.r).slerp(dp.r, fall);
        // death throes: head thrown up then collapses
        const throe = ss(0.0, 0.3, t) * (1 - ss(0.5, 1.3, t));
        this.Epre(A, 'head', 0.5 * throe, 0, 0);
        A.jaw = 0.8 * throe + dp.jaw * fall;
        fx.all = true; fx.w = k; fx.rootW = k; fx.jawW = k; fx.throat = throe * 0.6;
        fx.eye = 1 - ss(1.4, 2.6, t); fx.glow = -ss(1.0, 3.0, t);
        if (!a.fired.thud && t > 2.0) { a.fired.thud = 1; this._emit('death', this.wp[I.spine1], 2.2, true); }
        break;
      }
    }
    return fx;
  }

  _emit(kind, wpos, strength, ground = false) {
    if (!this.onStep) return;
    const p = _v4.copy(wpos);
    if (ground) p.y = 0;
    this.d.root.localToWorld(p);
    this.onStep({ foot: kind, position: p.clone(), strength });
  }

  // ---------------------------------------------------------------- CCD chain IK (resting poses)
  /**
   * Rotate `chain` (bone indices root→tip) so that a point at `effOff` (in the tip bone's frame) reaches `target`
   * (root space). maxA limits each step. Optionally sets the tip bone's world orientation to `tipQ`.
   */
  ccd(P, chain, effOff, target, iters = 12, maxA = 0.35, tipQ = null) {
    const tip = chain[chain.length - 1];
    const eff = new THREE.Vector3(), a = new THREE.Vector3(), b = new THREE.Vector3(), q = new THREE.Quaternion(), qi = new THREE.Quaternion();
    for (let it = 0; it < iters; it++) {
      for (let j = chain.length - 1; j >= 0; j--) {
        this.fk(P);
        eff.copy(effOff).applyQuaternion(this.wq[tip]).add(this.wp[tip]);
        const bi = chain[j], J = this.wp[bi];
        a.subVectors(eff, J); b.subVectors(target, J);
        if (a.lengthSq() < 1e-8 || b.lengthSq() < 1e-8) continue;
        a.normalize(); b.normalize();
        q.setFromUnitVectors(a, b);
        const ang = 2 * Math.acos(Math.min(1, Math.abs(q.w)));
        if (ang > maxA) q.slerp(qi.identity(), 1 - maxA / ang);
        const par = this.parent[bi];
        // world' = q * world → local' = parentWorld^-1 * q * world
        const pw = this.wq[par];
        P.q[bi].copy(pw).invert().multiply(q).multiply(this.wq[bi]);
      }
    }
    if (tipQ) { this.fk(P); P.q[tip].copy(this.wq[this.parent[tip]]).invert().multiply(tipQ); }
  }

  // ---------------------------------------------------------------- FK / IK
  fk(pose) {
    const n = this.n, par = this.parent, wq = this.wq, wp = this.wp;
    for (let i = 0; i < n; i++) {
      const p = par[i];
      if (p < 0) { wq[i].copy(pose.r); wp[i].copy(this.localPos[i]).add(pose.p); continue; }
      wq[i].copy(wq[p]).multiply(pose.q[i]);
      wp[i].copy(this.localPos[i]).applyQuaternion(wq[p]).add(wp[p]);
    }
  }

  _basis(dir, pole, out) {
    _v.copy(dir).normalize();
    _v2.copy(pole).addScaledVector(_v, -pole.dot(_v)).normalize();
    _v3.crossVectors(_v, _v2);
    _m.makeBasis(_v, _v2, _v3);
    return out.setFromRotationMatrix(_m);
  }

  /** Solve one leg to put its contact joint at `target` (root space) with end bone world rotation endRot. */
  solveLeg(pose, L, target, endRot, toeCurl = 0) {
    const T = this._ikTmp || (this._ikTmp = { dvec: new THREE.Vector3(), pole: new THREE.Vector3(), pp: new THREE.Vector3(), Jp: new THREE.Vector3(), TjC: new THREE.Vector3(), QA: new THREE.Quaternion(), QB: new THREE.Quaternion(), R0: new THREE.Quaternion() });
    const pa = this.parent[L.a];
    const A = this.wp[L.a]; // joint position of the upper bone (after fk)
    const Qp = this.wq[pa];
    const Tj = _v4.copy(L.endOff).applyQuaternion(endRot).add(target);
    const dvec = T.dvec.subVectors(Tj, A);
    let d = dvec.length();
    const l1 = L.l1, l2 = L.l2;
    d = clamp(d, Math.abs(l1 - l2) + 1e-3, (l1 + l2) * 0.999);
    const dir = dvec.normalize();
    const pole = T.pole.copy(L.pole).applyQuaternion(Qp);
    const a = (l1 * l1 + d * d - l2 * l2) / (2 * d), h = Math.sqrt(Math.max(l1 * l1 - a * a, 0));
    const pp = T.pp.copy(pole).addScaledVector(dir, -pole.dot(dir)).normalize();
    const Jp = T.Jp.copy(A).addScaledVector(dir, a).addScaledVector(pp, h);
    const TjC = T.TjC.copy(A).addScaledVector(dir, d);
    const QA = T.QA, QB = T.QB, R0 = T.R0;
    // rest bases
    this._basis(L.restDirA, L.pole, R0); this._basis(_v4.subVectors(Jp, A), pole, QA); QA.multiply(R0.invert());
    this._basis(L.restDirB, L.pole, R0); this._basis(_v4.subVectors(TjC, Jp), pole, QB); QB.multiply(R0.invert());
    pose.q[L.a].copy(Qp).invert().multiply(QA);
    pose.q[L.b].copy(QA).invert().multiply(QB);
    pose.q[L.c].copy(QB).invert().multiply(endRot);
    _q.setFromEuler(_e.set(toeCurl, 0, 0, 'YXZ'));
    pose.q[L.d].copy(_q);
  }

  // ---------------------------------------------------------------- main update
  update(dt, st = {}) {
    dt = Math.min(dt, 0.1);
    this.t += dt;
    const t = this.t, S = this.S;
    const speed = st.speed || 0, turn = st.turn || 0;
    this.speedS = damp(this.speedS, speed, 5, dt);
    this.turnS = damp(this.turnS, turn, 4, dt);
    this.combat = damp(this.combat, st.combat || st.enraged ? 1 : 0, 2, dt);
    if (st.enraged) this.enraged = 1; else if (!this.actions.some(a => a.name === 'enrage')) this.enraged = damp(this.enraged, 0, 0.5, dt);
    if (st.sleep !== undefined && !this.actions.some(a => a.name === 'wake')) this.sleeping = !!st.sleep;
    const dying = this.actions.find(a => a.name === 'death');
    const stDead = !!st.dead;
    if (stDead && !this._stDeadPrev && !dying && !this.dead) this.play('death');
    if (!stDead && this._stDeadPrev) this.revive();          // only a true → false edge revives
    this._stDeadPrev = stDead;
    // ---- mode weights
    const flying = !!st.flying && !st.dead;
    const hoverMode = flying && (st.hover || Math.abs(speed) < 4 * S * 1.05);
    let glideMode = flying && !hoverMode && (st.glide ?? this._autoGlide(dt, speed));
    const target = { idle: 0, walk: 0, fly: 0, hover: 0, glide: 0, sleep: 0, dead: 0 };
    if (this.dead) target.dead = 1;
    else if (this.sleeping) target.sleep = 1;
    else if (flying) { if (hoverMode) target.hover = 1; else if (glideMode) target.glide = 1; else target.fly = 1; }
    else if (Math.abs(this.speedS) > 0.15 * S || Math.abs(this.turnS) > 0.2) target.walk = 1;
    else target.idle = 1;
    const rate = this.dead ? 0 : 3.0;
    let tot = 0;
    const snap = this.dead || !this._started;
    this._started = true;
    for (const k in this.w) { this.w[k] = snap ? target[k] : damp(this.w[k], target[k], k === 'walk' ? 5 : rate, dt); tot += this.w[k]; }
    for (const k in this.w) this.w[k] /= tot || 1;
    // ---- phases
    const stride = 3.9 * S * clamp(Math.abs(this.speedS) / (3 * S) * 0.35 + 0.75, 0.8, 1.4);
    const gaitSpeed = Math.max(Math.abs(this.speedS), Math.abs(this.turnS) * 4 * S);
    this.gait = (this.gait + gaitSpeed / stride * dt * Math.sign(this.speedS || 1)) % 1; if (this.gait < 0) this.gait += 1;
    const tempo = Math.sqrt(0.95 / S);                        // small dragons beat their wings faster
    this.flapPh = (this.flapPh + dt * tempo / 1.7) % 1;
    this.hoverPh = (this.hoverPh + dt * tempo / 1.35) % 1;
    const bank = clamp(-this.turnS * 0.6, -0.6, 0.6);
    // ---- poses
    const out = this.P.out; out.reset();
    const acc = []; // [pose, w]
    if (this.w.idle > 1e-3) acc.push([this.poseIdle(this.P.idle, t, this.combat, this.enraged), this.w.idle]);
    if (this.w.walk > 1e-3) acc.push([this.poseWalk(this.P.walk, t, this.gait, this.speedS), this.w.walk]);
    if (this.w.fly > 1e-3) acc.push([this.poseFly(this.P.fly, t, this.flapPh, bank), this.w.fly]);
    if (this.w.hover > 1e-3) acc.push([this.poseHover(this.P.hover, t, this.hoverPh), this.w.hover]);
    if (this.w.glide > 1e-3) acc.push([this.poseGlide(this.P.glide, t, bank), this.w.glide]);
    if (this.w.sleep > 1e-3) acc.push([this.poseSleep(this.P.sleep, t), this.w.sleep]);
    if (this.w.dead > 1e-3) acc.push([this.poseDead(this.P.dead, t), this.w.dead]);
    this._blend(out, acc);
    // flying close to the ground: legs reach down (landing prep)
    const low = flying ? smoothstep(6 * S / 0.95, 1.5 * S / 0.95, st.altitude ?? 99) * (1 - this.w.hover) : 0;
    if (low > 0.01) {
      const L = this.P.act; L.reset();
      for (const sd of ['L', 'R']) {
        this.E(L, 'arm' + sd, -0.15, 0, 0.08); this.E(L, 'fore' + sd, 0.45, 0, 0); this.E(L, 'hand' + sd, 0.25, 0, 0); this.E(L, 'fing' + sd, 0.3, 0, 0);
        this.E(L, 'thigh' + sd, 0.25, 0, 0.08); this.E(L, 'shin' + sd, -0.25, 0, 0); this.E(L, 'foot' + sd, 0.1, 0, 0); this.E(L, 'toes' + sd, 0.3, 0, 0);
      }
      for (const sd of ['L', 'R']) for (const b of ['arm', 'fore', 'hand', 'fing', 'thigh', 'shin', 'foot', 'toes']) { const i = this.I[b + sd]; out.q[i].slerp(L.q[i], low); }
    }
    // ---- secondary: turning bends the spine/neck, tail lags on springs
    const sp = this.spring;
    for (let i = 0; i < 12; i++) {
      const tgt = -this.turnS * 0.09 * (1 + i * 0.12);
      const k = 18 - i * 0.9, c = 4.5;
      sp.tailYawV[i] += ((tgt - sp.tailYaw[i]) * k - sp.tailYawV[i] * c) * dt;
      sp.tailYaw[i] += sp.tailYawV[i] * dt;
      _q.setFromEuler(_e.set(0, sp.tailYaw[i], 0, 'YXZ')); out.q[this.I['tail' + (i + 1)]].multiply(_q);
    }
    sp.neckYawV += ((this.turnS * 0.07 - sp.neckYaw) * 14 - sp.neckYawV * 4) * dt; sp.neckYaw += sp.neckYawV * dt;
    for (let i = 0; i < 6; i++) { _q.setFromEuler(_e.set(0, sp.neckYaw, 0, 'YXZ')); out.q[this.I['neck' + (i + 1)]].multiply(_q); }
    _q.setFromEuler(_e.set(0, this.turnS * 0.05, 0, 'YXZ')); out.q[this.I.chest].multiply(_q);
    // ---- look-at (head tracking)
    this._lookAt(out, dt);
    // ---- actions
    let throat = 0, glowAdd = 0, eyeOv = null, legOv = {}, breathing = 0, chestIn = 0;
    this._pelvisPivot = this._pelvisPivot || new THREE.Vector3(0, this.rig.J.pelvis[1] * S, this.rig.J.pelvis[2] * S);
    for (const a of this.actions) {
      a.t += dt * a.speed;
      const fx = this._action(a, out, null);
      const A = this.P.act;
      if (fx.all) { for (let i = 0; i < this.n; i++) out.q[i].slerp(A.q[i], fx.w); }
      else if (fx.bones) for (const b of fx.bones) out.q[b].slerp(A.q[b], fx.w);
      if (fx.rootW) {
        if (fx.all) { out.p.lerp(A.p, fx.rootW); out.r.slerp(A.r, fx.rootW); }
        else { out.p.addScaledVector(A.p, fx.rootW); _q.identity().slerp(A.r, fx.rootW); out.r.multiply(_q); }
      }
      if (fx.jawW) out.jaw = lerp(out.jaw, A.jaw, fx.jawW);
      throat = Math.max(throat, fx.throat || 0);
      glowAdd += fx.glow || 0;
      if (fx.eye != null) eyeOv = fx.eye;
      if (fx.legs) for (const k in fx.legs) legOv[k] = Math.max(legOv[k] || 0, fx.legs[k] * fx.w);
      breathing = Math.max(breathing, fx.breathing || 0); chestIn = Math.max(chestIn, fx.chest || 0);
    }
    this.actions = this.actions.filter(a => a.t < a.dur || a.name === 'death');
    const deathA = this.actions.find(a => a.name === 'death');
    if (deathA && deathA.t >= deathA.dur) { this.dead = true; this.actions = this.actions.filter(a => a !== deathA); for (const k in this.w) this.w[k] = k === 'dead' ? 1 : 0; }
    // ---- legs: IK on the ground
    const groundW = this.w.idle + this.w.walk + this.w.sleep;
    this.fk(out);
    if (groundW > 0.02 && !this.dead) this._legs(out, dt, groundW, legOv);
    // ---- apply to bones
    const bones = this.bones;
    bones[0].position.copy(this.localPos[0]).add(out.p);
    bones[0].quaternion.copy(out.r);
    for (let i = 1; i < this.n; i++) bones[i].quaternion.copy(out.q[i]);
    _q.setFromEuler(_e.set(-out.jaw, 0, 0, 'YXZ'));
    bones[this.I.jaw].quaternion.multiply(_q);
    this.jawAngle = out.jaw;
    // ---- material effects
    const U = this.U;
    this.blinkT -= dt;
    if (this.blinkT < 0) { this.blink = 0.18; this.blinkT = 3 + ((this.t * 7.31) % 5); }
    this.blink = Math.max(0, this.blink - dt);
    const asleep = this.w.sleep + this.w.dead;
    let eye = (1 - asleep) * (this.blink > 0 ? Math.abs(this.blink - 0.09) / 0.09 : 1);
    if (eyeOv != null) eye = eyeOv;
    this.eyeOpen = damp(this.eyeOpen, eye, 18, dt);
    U.uEyeOpen.value = this.eyeOpen;
    U.uEyeGlow.value = 0.35 + 0.65 * this.eyeOpen;
    this.throat = damp(this.throat, throat, 6, dt);
    U.uThroat.value = this.throat;
    const breathRate = this.sleeping ? 5.5 : 3.6 - this.combat * 1.2;
    U.uBreath.value = (Math.sin(t * TAU / breathRate) * 0.5 + 0.5) * 0.05 * S + chestIn * 0.14 * S;
    const glowT = (this.glowBase + this.enraged * 0.8 + glowAdd) * (this.dead ? 0.0 : 1);
    this.glowCur = damp(this.glowCur, Math.max(0, glowT), this.dead ? 0.8 : 3, dt);
    U.uGlow.value = this.glowCur * (0.85 + 0.15 * Math.sin(t * 3.1));
    const billow = (this.w.fly * -Math.cos(TAU * this.flapPh) * 0.22 + this.w.hover * -Math.cos(TAU * this.hoverPh) * 0.28 + this.w.glide * 0.12) * S;
    U.uBillow.value.set(billow, billow);
  }

  _autoGlide(dt, speed) {
    // flap for three beats, glide for ~4 s (big creatures soar); deterministic so the raid replays identically
    this.glideT += dt;
    const beat = 1.7 * Math.sqrt(this.S / 0.95), cyc = beat * 3 + 4.2;
    return (this.glideT % cyc) > beat * 3;
  }

  _blend(out, acc) {
    if (!acc.length) return;
    if (acc.length === 1) {
      const [p] = acc[0];
      for (let i = 0; i < this.n; i++) out.q[i].copy(p.q[i]);
      out.p.copy(p.p); out.r.copy(p.r); out.jaw = p.jaw; return;
    }
    // sequential slerp accumulation (weights normalised)
    let wsum = 0;
    for (const [p, w] of acc) {
      wsum += w; const f = w / wsum;
      for (let i = 0; i < this.n; i++) { if (wsum === w) out.q[i].copy(p.q[i]); else out.q[i].slerp(p.q[i], f); }
      if (wsum === w) { out.p.copy(p.p); out.r.copy(p.r); out.jaw = p.jaw; }
      else { out.p.lerp(p.p, f); out.r.slerp(p.r, f); out.jaw = lerp(out.jaw, p.jaw, f); }
    }
  }

  _lookAt(out, dt) {
    let ty = 0, tp = 0;
    if (this.lookTarget && !this.dead && !this.sleeping) {
      const h = this.wp[this.I.head];
      _v.copy(this.lookTarget); this.d.root.worldToLocal(_v);
      _v.sub(h);
      ty = clamp(Math.atan2(-_v.x, -_v.z), -1.3, 1.3);
      tp = clamp(Math.atan2(_v.y, Math.hypot(_v.x, _v.z)), -0.6, 0.5);
    }
    this.look.x = damp(this.look.x, ty, 3, dt); this.look.y = damp(this.look.y, tp, 3, dt);
    const f = [0.08, 0.1, 0.12, 0.13, 0.14, 0.15];
    for (let i = 0; i < 6; i++) { _q.setFromEuler(_e.set(this.look.y * f[i] * 0.6, this.look.x * f[i], 0, 'YXZ')); out.q[this.I['neck' + (i + 1)]].premultiply(_q); }
    _q.setFromEuler(_e.set(this.look.y * 0.5, this.look.x * 0.28, 0, 'YXZ')); out.q[this.I.head].premultiply(_q);
  }

  _legs(out, dt, gw, legOv) {
    const I = this.I, S = this.S;
    const sp = this.speedS, walking = this.w.walk;
    const stride = 3.9 * S * clamp(Math.abs(sp) / (3 * S) * 0.35 + 0.75, 0.8, 1.4);
    const gaitSpeed = Math.max(Math.abs(sp), Math.abs(this.turnS) * 4 * S);
    const duty = 0.66;
    const turnR = this.turnS;
    for (const L of this.legs) {
      const ov = legOv[L.name] || 0;
      // gait target (root space)
      const ph = ((this.gait - L.phase) % 1 + 1) % 1;
      let off = 0, lift = 0, curl = 0, swing = false;
      if (ph < duty) off = -0.5 + ph / duty;
      else { const s = (ph - duty) / (1 - duty); off = 0.5 - ease(s); lift = Math.sin(Math.PI * s); curl = Math.sin(Math.PI * Math.min(1, s * 1.3)); swing = true; }
      // exact stance kinematics: a planted foot travels (in root space) exactly what the body covers while it is
      // planted — translation |v|·duty·period backwards and rotation turn·duty·period about the root origin
      const period = stride / Math.max(gaitSpeed, 1e-3);
      const dirZ = sp >= 0 ? 1 : -1;
      const lin = Math.abs(sp) * duty * period;
      const Th = clamp(turnR, -1.5, 1.5) * duty * period;
      const nx = L.neutral.x, nz = L.neutral.z;
      let tx, tz;
      const w = clamp(turnR, -1.5, 1.5);
      if (Math.abs(w) > 1e-3) {
        // world-fixed point seen from a frame moving forward (-Z) at v while yawing at w: rotation about the
        // instantaneous centre of rotation (x = -v/w)
        const cx = -sp / w;
        const phi = -Th * off * walking, c = Math.cos(phi), sn = Math.sin(phi);
        const rx = nx - cx, rz = nz;
        tx = cx + rx * c + rz * sn; tz = -rx * sn + rz * c;
      } else { tx = nx; tz = nz + dirZ * off * lin * walking; }
      const moveAmt = Math.min(1, gaitSpeed / (0.5 * S));
      L.cur.set(tx, lift * 0.55 * S * walking * moveAmt, tz);
      // step event
      if (L.swingPrev && !swing && walking > 0.5 && ov < 0.5) this._emit(L.name, _v2.set(L.cur.x, 0, L.cur.z), L.front ? 1.0 : 0.8, true);
      L.swingPrev = swing;
      // end rotation: flat on the ground; curls during swing
      const endRot = _q2.setFromEuler(_e.set(-curl * 0.5 * walking, 0, 0, 'YXZ'));
      const target = _v3.copy(L.cur).setY(L.cur.y + L.contactY);
      const slw = this.w.sleep / Math.max(gw, 1e-3);
      if (slw > 0) {
        // tucked: forepaws folded forward under the chest, hind feet drawn up beside the haunches
        const tx = L.neutral.x * (L.front ? 0.8 : 1.15), tz = L.front ? L.neutral.z - 0.9 * S : L.neutral.z + 0.35 * S;
        _v2.set(tx, L.contactY * 0.6, tz);
        target.lerp(_v2, slw);
        endRot.slerp(_q.setFromEuler(_e.set(L.front ? 0.2 : -0.35, 0, 0, 'YXZ')), slw);
      }
      // pre-IK pose = locomotion FK + any action that animates this leg; blend IK out by (1 - ground weight) and
      // by the action's override weight so grabbing / releasing a leg never pops
      const saved = this._legSaved || (this._legSaved = [new THREE.Quaternion(), new THREE.Quaternion(), new THREE.Quaternion(), new THREE.Quaternion()]);
      saved[0].copy(out.q[L.a]); saved[1].copy(out.q[L.b]); saved[2].copy(out.q[L.c]); saved[3].copy(out.q[L.d]);
      this.solveLeg(out, L, target, endRot, curl * 0.6 * walking);
      const keep = Math.max(1 - gw, ov);
      if (keep > 0.001) { out.q[L.a].slerp(saved[0], keep); out.q[L.b].slerp(saved[1], keep); out.q[L.c].slerp(saved[2], keep); out.q[L.d].slerp(saved[3], keep); }
    }
  }

  setLookTarget(v) { this.lookTarget = v ? v.clone() : null; }

  /** Clear death/sleep and one-shots (e.g. raid reset). */
  revive() {
    this.dead = false; this.sleeping = false;
    this.actions.length = 0;
    this._started = false; this.enraged = 0; this.glowCur = this.glowBase;
  }
}
