// Legged locomotion shared by all creatures (quadrupeds, bipeds, spiders).
// - Gaits are blended by speed (phase offsets per leg, duty factor, stride frequency, body oscillation).
// - Stance feet are integrated with the ground velocity in model space (forward speed + turn), so feet stay
//   planted: stride length scales with speed automatically (no ice-skating).
// - Swing feet fly from their lift-off point to the predicted touchdown with an arc.
// - When the creature stops, unfinished swings land at home and stray feet take small settle steps.
import * as THREE from 'three';
import { makeChain, solveIK, fract, clamp01, mix, sstep, TAU } from './rig.js';

const _v = new THREE.Vector3(), _p = new THREE.Vector3(), _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion();
const X = new THREE.Vector3(1, 0, 0), Y = new THREE.Vector3(0, 1, 0);

function circMix(G, w, id) { // per-gait phase offsets of one leg, blended on the unit circle by gait weights
  let c = 0, s = 0;
  for (let i = 0; i < G.length; i++) { const wi = w[i]; if (!wi) continue; const o = (G[i].off[id] ?? 0) * TAU; c += Math.cos(o) * wi; s += Math.sin(o) * wi; }
  return fract(Math.atan2(s, c) / TAU + 1);
}

/**
 * cfg.legs: [{ id, chain:[upper, lower, end(, paw)], toe:[x,0,z] rest contact point, body: bone whose rotation carries the pole,
 *              lift, flex (swing paw curl rad), pole?:[x,y,z], out: outward pole bias }]
 *   3-bone chain: IK upper→lower→end, end bone orientation = paw pitch (front legs, biped feet).
 *   4-bone chain: IK upper→lower→meta, meta pitched by gait, paw = 4th (digitigrade hind legs).
 * cfg.gaits: [{ v, f, duty, lift, off:{id:phase}, bob, bobF, bobPh, pitch, pitchPh, flex, flexPh, roll, rollPh, sway, swayPh, lean }]
 */
export class Gait {
  constructor(pose, cfg) {
    this.pose = pose; this.cfg = cfg;
    this.phase = 0; this.f = cfg.gaits[0].f; this.sSm = 0; this.act = 0; this.moving = false;
    this.maxStride = cfg.maxStride ?? 1.0;
    this.gw = cfg.gaits.map((_, i) => i === 0 ? 1 : 0);
    this.legs = cfg.legs.map(L => {
      const idx = L.chain.map(n => pose.b[n]);
      const four = idx.length === 4;
      const chain = makeChain(pose, idx[0], idx[1], idx[2], L.pole);
      const toe = new THREE.Vector3(...L.toe);
      const endRest = pose.rest[four ? idx[3] : idx[2]];
      return {
        id: L.id, idx, four, chain, paw: four ? idx[3] : idx[2], meta: four ? idx[2] : -1,
        toe, toeOff: toe.clone().sub(endRest), // end joint → toe (rest)
        metaVec: four ? pose.rest[idx[3]].clone().sub(pose.rest[idx[2]]) : null, // hock → paw joint
        home: toe.clone(), homeOff: new THREE.Vector3(),
        F: toe.clone(), liftF: toe.clone(), T: toe.clone(),
        stance: true, u: 1, dur: 0.3, settle: false, lastLp: 0,
        liftH: L.lift ?? 0.08, flex: L.flex ?? 0.9, body: pose.b[L.body], out: L.out ?? 0.15, side: Math.sign(L.toe[0]) || 1,
        pawPitch: 0, metaPitch: 0, air: 0, override: null, overrideW: 0, down: 0,
        metaK: L.metaK ?? 1.2, metaBase: L.metaBase ?? 0, heel: L.heel ?? 0.35, scap: L.scap ?? 0, dutyMul: L.dutyMul ?? 1,
      };
    });
    this.bob = 0; this.pitch = 0; this.roll = 0; this.sway = 0; this.flex = 0; this.lean = 0; this.nod = 0;
    this.onStep = null;
    this.ground = null;            // optional (lx, lz) → local ground height (terrain following), set by Creature.setGround
    this.gOff = 0; this.gPitch = 0; this.gRoll = 0; // smoothed body adaptation to the ground under the feet
  }
  gy(x, z) { return this.ground ? this.ground(x, z) : 0; }
  /** Smoothed body height / pitch / roll from the ground under the legs' home positions. */
  adaptBody(dt, pitchRoll = true) {
    if (!this.ground) { this.gOff = this.gPitch = this.gRoll = 0; return; }
    let sum = 0, fr = 0, fn = 0, re = 0, rn = 0, le = 0, ln = 0, ri = 0, rin = 0, fz = 0, rz = 0, lx = 0, rx = 0;
    for (const L of this.legs) {
      const h = this.gy(L.home.x, L.home.z); sum += h;
      if (L.home.z < 0) { fr += h; fn++; fz += L.home.z; } else { re += h; rn++; rz += L.home.z; }
      if (L.home.x < 0) { le += h; ln++; lx += L.home.x; } else { ri += h; rin++; rx += L.home.x; }
    }
    const k = 1 - Math.exp(-8 * dt);
    this.gOff += (sum / this.legs.length - this.gOff) * k;
    let p = 0, r = 0;
    if (pitchRoll && fn && rn) p = Math.atan2(fr / fn - re / rn, rz / rn - fz / fn);
    if (pitchRoll && ln && rin) r = Math.atan2(ri / rin - le / ln, rx / rin - lx / ln);
    this.gPitch += (Math.max(-0.5, Math.min(0.5, p)) - this.gPitch) * k;
    this.gRoll += (Math.max(-0.4, Math.min(0.4, r)) * 0.8 - this.gRoll) * k;
  }
  get speedSm() { return this.sSm; }
  _gaitParams(s) {
    const G = this.cfg.gaits;
    const w = this.gw; w.fill(0);
    if (s <= G[0].v) w[0] = 1;
    else if (s >= G[G.length - 1].v) w[G.length - 1] = 1;
    else for (let i = 0; i < G.length - 1; i++) if (s >= G[i].v && s < G[i + 1].v) { const t = sstep(0, 1, (s - G[i].v) / (G[i + 1].v - G[i].v)); w[i] = 1 - t; w[i + 1] = t; break; }
    return w;
  }
  _mixKey(k, def = 0) { let s = 0; const G = this.cfg.gaits; for (let i = 0; i < G.length; i++) if (this.gw[i]) s += (G[i][k] ?? def) * this.gw[i]; return s; }
  _osc(amp, freq, ph) { let s = 0; const G = this.cfg.gaits; for (let i = 0; i < G.length; i++) { const w = this.gw[i]; if (!w) continue; const g = G[i]; s += w * (g[amp] ?? 0) * Math.cos(TAU * ((g[freq] ?? 2) * this.phase + (g[ph] ?? 0))); } return s; }

  /** speed/turn in model units (m/s, rad/s along the model's -Z facing). */
  update(dt, speed, turn, strafe = 0) {
    const cfg = this.cfg;
    this.sSm += (speed - this.sSm) * (1 - Math.exp(-6 * dt));
    const as = Math.abs(this.sSm);
    const w = this._gaitParams(as);
    const G = cfg.gaits;
    let f = this._mixKey('f');
    if (as < G[0].v) f *= mix(cfg.fMin ?? 0.6, 1, as / G[0].v);
    const tr = Math.abs(turn);
    const actT = clamp01(Math.hypot(speed, strafe) / (cfg.actV ?? 0.25) + tr * (cfg.actTurn ?? 0.9));
    this.act += (actT - this.act) * (1 - Math.exp(-(actT > this.act ? 10 : 5) * dt));
    const moving = actT > 0.04;
    this.moving = moving;
    const dutyAll = this._mixKey('duty', 0.6);
    const liftK = this._mixKey('lift', 1);
    if (moving) { this.f = f; this.phase = fract(this.phase + f * dt); }
    // body oscillations
    const a = this.act;
    this.bob = this._osc('bob', 'bobF', 'bobPh') * a;
    this.pitch = this._osc('pitch', 'pitchF', 'pitchPh') * a;
    this.roll = this._osc('roll', 'rollF', 'rollPh') * a;
    this.sway = this._osc('sway', 'swayF', 'swayPh') * a;
    this.flex = this._osc('flex', 'flexF', 'flexPh') * a;
    this.nod = this._osc('nod', 'nodF', 'nodPh') * a;
    this.lean = this._mixKey('lean') * clamp01(as / 2);
    const swingDur = (1 - dutyAll) / Math.max(0.3, this.f);
    for (const L of this.legs) {
      L.overrideW = 0; L.overrideLocal = false; L.overridePaw = 0; L.pawAdd = 0; L.overrideMeta = undefined;
      // home (rest contact + species offset), ground velocity at the foot
      L.home.copy(L.toe).add(L.homeOff);
      const vgx = -turn * L.F.z - strafe, vgz = speed + turn * L.F.x;
      if (moving) {
        const off = circMix(G, w, L.id);
        const lp = fract(this.phase + off);
        const duty = dutyAll * L.dutyMul;
        const inStance = lp < duty;
        if (inStance) {
          if (!L.stance) { L.stance = true; L.settle = false; L.down = 1; if (this.onStep) this.onStep(L); }
          L.u = 1;
          // exact ground motion in model space (game convention: facing turns, then the root moves along the new facing)
          const ca = Math.cos(turn * dt), sa = Math.sin(turn * dt), fx = L.F.x, fz = L.F.z;
          L.F.x = fx * ca - fz * sa - strafe * dt; L.F.z = fx * sa + fz * ca + speed * dt; L.F.y = this.gy(L.F.x, L.F.z);
          const s01 = lp / duty;
          L.pawPitch = -L.heel * sstep(0.65, 1.0, s01) * clamp01(as / 1.5);
        } else {
          if (L.stance) { L.stance = false; L.liftF.copy(L.F); }
          const u = (lp - duty) / (1 - duty);
          L.u = u;
          // predicted touchdown: centre the next stance on home
          const Dx = vgx * duty / this.f, Dz = vgz * duty / this.f;
          const dl = Math.hypot(Dx, Dz), k = dl > this.maxStride ? this.maxStride / dl : 1;
          L.T.set(L.home.x - Dx * 0.5 * k, 0, L.home.z - Dz * 0.5 * k); L.T.y = this.gy(L.T.x, L.T.z);
          this._swing(L, u, liftK * a);
        }
      } else {
        // stopped: finish swings at home, then settle strays one at a time
        if (!L.stance) {
          L.u = Math.min(1, L.u + dt / Math.max(0.12, swingDur));
          L.T.copy(L.home); L.T.y = this.gy(L.T.x, L.T.z);
          this._swing(L, L.u, liftK * 0.6);
          if (L.u >= 1) { L.stance = true; L.settle = false; L.F.copy(L.T); L.down = 1; if (this.onStep) this.onStep(L); }
        } else {
          L.pawPitch *= Math.exp(-8 * dt);
          L.F.y = this.gy(L.F.x, L.F.z);
        }
      }
      L.down = Math.max(0, L.down - dt * 6);
    }
    if (!moving) {
      // settle steps: at most one leg swinging at a time
      let busy = this.legs.some(L => !L.stance);
      if (!busy) {
        let worst = null, wd = cfg.settleDist ?? 0.07;
        for (const L of this.legs) { const d = Math.hypot(L.F.x - L.home.x, L.F.z - L.home.z); if (d > wd) { wd = d; worst = L; } }
        if (worst) { worst.stance = false; worst.settle = true; worst.u = 0; worst.liftF.copy(worst.F); }
      }
    }
  }
  _swing(L, u, liftK) {
    const e = u * u * (3 - 2 * u);
    L.F.lerpVectors(L.liftF, L.T, e);
    const h = L.liftH * liftK * (L.settle ? 0.6 : 1);
    L.F.y = L.liftF.y + (L.T.y - L.liftF.y) * e + h * Math.pow(Math.sin(Math.PI * Math.min(1, u * 1.08)), 0.8);
    L.pawPitch = -L.flex * Math.sin(Math.PI * u) * clamp01(liftK * 1.5);
  }

  /** Solve all legs after FK. airborne (0..1): tuck toward rest pose relative to the body. */
  solve(pose, opts = {}) {
    const air = opts.air ?? 0;
    for (const L of this.legs) {
      const bodyQ = pose.wq[L.body];
      // foot target & paw orientation
      _p.copy(L.F);
      let pawPitch = L.pawPitch, metaPitch = 0;
      if (L.four) {
        // metatarsus tilt: follows foot's fore/aft offset under the hip + swing curl
        const rel = (L.F.z - L.home.z);
        metaPitch = L.metaBase - rel * L.metaK - (L.stance ? 0 : L.flex * 0.45 * Math.sin(Math.PI * L.u));
      }
      const ow = L.overrideW;
      if (air > 0) {
        // airborne: legs hang in their rest pose relative to the body, paws curled
        pose.carry(L.body, L.toe, _v);
        _p.lerp(_v, air);
        pawPitch = mix(pawPitch, opts.airPaw ?? -0.6, air);
      }
      if (ow > 0) {
        const o = L.overrideLocal ? pose.carry(L.body, L.override, _v) : _v.copy(L.override);
        _p.lerp(o, ow);
        pawPitch = mix(pawPitch, L.overridePaw ?? 0, ow);
        if (L.overrideMeta !== undefined) metaPitch = mix(metaPitch, L.overrideMeta, ow);
      }
      // yaw of the body only (paws stay level with the ground)
      const yaw = yawOf(bodyQ);
      _q.setFromAxisAngle(Y, yaw).multiply(_q2.setFromAxisAngle(X, pawPitch + (L.pawAdd || 0)));
      if (air > 0 || ow > 0) _q.slerp(bodyQ, Math.max(air * 0.5, ow * (L.overrideLocal ? 1 : 0)));
      // end joint position from toe
      _v.copy(L.toeOff).applyQuaternion(_q);
      const endP = _p.sub(_v); // joint position (front wrist / hind paw joint)
      const pole = _v.copy(L.chain.pole0).applyQuaternion(bodyQ);
      pole.x += L.side * L.out;
      if (L.four) {
        if (L.scap) { // pelvis glide (hip joint follows the foot fore/aft)
          const rel = Math.max(-0.45, Math.min(0.45, L.F.z - L.home.z)) * (1 - ow) * (1 - air);
          tmpV.set(0, -Math.abs(rel) * 0.12, rel * L.scap).applyQuaternion(bodyQ);
          pose.wp[L.chain.a].add(tmpV);
        }
        const qm = _q2.setFromAxisAngle(Y, yaw).multiply(tmpQ.setFromAxisAngle(X, metaPitch));
        const hock = tmpV.copy(L.metaVec).applyQuaternion(qm).negate().add(endP);
        solveIK(pose, L.chain, hock, pole);
        pose.wq[L.meta].copy(qm);
        pose.wp[L.paw].copy(pose.wp[L.meta]).add(tmpV2.copy(L.metaVec).applyQuaternion(qm));
        pose.wq[L.paw].copy(_q);
      } else {
        if (L.scap) { // scapula glide: the shoulder joint follows the foot fore/aft (adds reach, avoids overextension)
          const rel = Math.max(-0.45, Math.min(0.45, L.F.z - L.home.z)) * (1 - ow) * (1 - air);
          tmpV.set(0, -Math.abs(rel) * 0.12, rel * L.scap).applyQuaternion(bodyQ);
          pose.wp[L.chain.a].add(tmpV);
        }
        solveIK(pose, L.chain, endP, pole);
        pose.wq[L.paw].copy(_q);
      }
      if (pose.hasKids?.[L.paw]) pose.fkChildren(L.paw);
    }
  }
}
const tmpQ = new THREE.Quaternion(), tmpV = new THREE.Vector3(), tmpV2 = new THREE.Vector3();
const _fw = new THREE.Vector3();
export function yawOf(q) { _fw.set(0, 0, -1).applyQuaternion(q); return Math.atan2(-_fw.x, -_fw.z); }
