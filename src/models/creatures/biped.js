// Procedural animation controller for two-legged creatures (gurgler, kobold, birds).
// Lower body: shared Gait (2 legs, planted feet). Upper body: lean, counter-twist, arm swing opposite to legs,
// waddle roll, look-around. One-shot / held actions layer on top (attacks mostly drive the arms + torso).
import * as THREE from 'three';
import { Gait } from './gait.js';
import { ActionSet } from './quadruped.js';
import { sstep, clamp01, mix, TAU } from './rig.js';

/**
 * spec: { bones: { hips, spine, chest, head, jaw?, neck?, tail?:[], ears?:[L,R],
 *                  armL:[up, lo, hand], armR:[up, lo, hand] },
 *         gait, arm: { swing, out, elbow, run, runElbow }, lean: { walk, run }, twist, waddle,
 *         actions, fidgets, pose(ctl, dt) }
 */
export class BipedCtl {
  constructor(inst, spec) {
    this.inst = inst; this.pose = inst.pose; this.spec = spec;
    const P = this.pose, b = {};
    for (const [k, v] of Object.entries(spec.bones)) b[k] = Array.isArray(v) ? v.map(n => P.b[n]) : P.b[v];
    this.b = b;
    this.gait = new Gait(P, spec.gait);
    this.acts = new ActionSet(this, spec.actions || {});
    this.t = Math.random() * 100;
    this.combat = 0; this.run = 0; this.turnSm = 0; this.speedSm = 0; this.air = 0; this.dead = false;
    this.look = { y: 0, p: 0, ty: 0, tp: 0, timer: 1 + Math.random() * 3 };
    this.fidgetTimer = 2 + Math.random() * 4;
    this.jaw = 0; this.ear = 0; this.locoW = 1; this.armW = 1;
    this.state = {};
  }
  play(name, speed = 1) {
    if (name === 'idle' || name === 'stand') { this.acts.stop(); return true; }
    if (name === 'revive') { this.dead = false; this.acts.stop(); return true; }
    if (this.dead && name !== 'death') return false;
    if (name === 'death') this.dead = true;
    return this.acts.play(name, speed);
  }
  update(dt, state = {}) {
    dt = Math.min(dt, 0.1);
    const P = this.pose, b = this.b, spec = this.spec, G = this.gait;
    this.state = state; this.t += dt;
    const sc = this.inst.scale;
    let speed = (state.speed ?? 0) / sc, turn = state.turn ?? 0, strafe = (state.strafe ?? 0) / sc;
    // state.dead true → die; revive only on a true→false transition (play('death') alone also holds)
    if (state.dead && !this.dead) this.play('death');
    if (this._sd && !state.dead && this.dead) this.play('revive');
    this._sd = !!state.dead;
    if (this.dead) { speed = 0; turn = 0; strafe = 0; }
    if (Math.abs(speed) > 0.3) for (const a of this.acts.list) if (a.d.rest) a.out = true;
    this.acts.update(dt);
    let restW = 0; for (const a of this.acts.list) if (a.d.rest || a.name === 'death') restW = Math.max(restW, a.w);
    this.locoW = 1 - restW;
    const k6 = 1 - Math.exp(-6 * dt);
    this.speedSm += (speed - this.speedSm) * k6;
    this.turnSm += (turn - this.turnSm) * (1 - Math.exp(-4 * dt));
    this.combat += ((state.combat ? 1 : 0) - this.combat) * (1 - Math.exp(-4 * dt));
    const gs = spec.gait.gaits;
    this.run = sstep(gs[0].v * 1.2, gs[gs.length - 1].v, Math.abs(this.speedSm));
    this.air += ((state.grounded === false ? 1 : 0) - this.air) * (1 - Math.exp(-10 * dt));

    P.reset();
    G.update(dt, speed * this.locoW, turn * this.locoW, strafe * this.locoW);
    const act = G.act, idle = 1 - clamp01(act * 1.5), ph = G.phase * TAU;
    // ---------- pelvis & spine ----------
    const breath = Math.sin(this.t * TAU * mix(0.3, 0.8, Math.max(this.run, this.combat * 0.4)));
    const L = spec.lean || {};
    const lean = (L.walk ?? 0.1) * clamp01(Math.abs(this.speedSm) / 1.5) * (1 - this.run) + (L.run ?? 0.3) * this.run + (L.combat ?? 0.08) * this.combat;
    const twA = (spec.twist ?? 0.12) * act;
    const wad = (spec.waddle ?? 0) * act;
    G.adaptBody(dt, false);
    P.move(b.hips, G.sway, G.bob - (spec.crouch ?? 0.03) * this.combat - 0.02 * this.run + G.gOff, 0);
    P.rot(b.hips, G.pitch - lean * 0.3, -twA * Math.cos(ph), G.roll + wad * Math.sin(ph) + this.turnSm * clamp01(Math.abs(this.speedSm) / 3) * 0.08);
    P.rot(b.spine, -lean * 0.4 + 0.015 * breath, twA * 0.6 * Math.cos(ph), -wad * 0.5 * Math.sin(ph));
    P.rot(b.chest, -lean * 0.3 - 0.01 * breath, twA * 0.6 * Math.cos(ph), -(G.roll + wad * Math.sin(ph)) * 0.5);
    P.sc[b.chest].setScalar(1 + breath * (spec.breathe ?? 0.015));
    // ---------- look & head ----------
    const lk = this.look;
    lk.timer -= dt;
    if (lk.timer <= 0) { lk.timer = 1.5 + Math.random() * 3.5; lk.ty = Math.random() < 0.3 ? 0 : (Math.random() - 0.5) * 1.4; lk.tp = (Math.random() - 0.4) * 0.3; }
    const lookK = idle * (1 - this.combat * 0.6);
    lk.y += (lk.ty * lookK - lk.y) * (1 - Math.exp(-3 * dt)); lk.p += (lk.tp * lookK - lk.p) * (1 - Math.exp(-3 * dt));
    const headStab = (lean - G.pitch) * 0.85; // torso pitch is (G.pitch - lean): keep the head level
    if (b.neck !== undefined) P.rot(b.neck, headStab * 0.4 + lk.p * 0.4, lk.y * 0.4 + this.turnSm * 0.1, 0);
    P.rot(b.head, headStab * (b.neck !== undefined ? 0.5 : 0.8) + lk.p * 0.6 + G.nod, lk.y * 0.6 + this.turnSm * 0.12 - twA * 0.8 * Math.cos(ph), -(G.roll + wad * Math.sin(ph)) * 0.3);
    // ---------- arms ----------
    const A = spec.arm || {};
    const swing = (A.swing ?? 0.45) * act * (1 - this.run * 0.3) + (A.runSwing ?? 0.9) * this.run * act;
    for (const [arm, s, sgn] of [[b.armL, -1, -1], [b.armR, 1, 1]]) {
      if (!arm) continue;
      const fw = sgn * Math.cos(ph) * (s > 0 ? (A.weaponSwing ?? 1) : 1); // right arm forward when left leg forward
      const out = (A.out ?? 0.15) + (A.runOut ?? 0.1) * this.run + (A.combatOut ?? 0.1) * this.combat;
      const elbow = (A.elbow ?? 0.25) + (A.runElbow ?? 1.1) * this.run + (A.combatElbow ?? 0.4) * this.combat;
      P.rot(arm[0], swing * fw + (A.combatUp ?? 0.2) * this.combat + 0.02 * breath, 0, s * out);
      P.rot(arm[1], elbow + Math.max(0, swing * fw) * 0.5, 0, 0);
      if (arm[2] !== undefined) P.rot(arm[2], (A.wrist ?? 0), 0, 0);
    }
    // ---------- tail / ears ----------
    if (b.tail) for (let i = 0; i < b.tail.length; i++) {
      const wv = Math.sin(this.t * 2.2 - i * 0.8) * (0.15 + 0.1 * i) * (1 - act * 0.5) + Math.sin(ph - i) * 0.15 * act;
      P.rot(b.tail[i], (spec.tailLift ?? 0.1) * this.run / b.tail.length - 0.05, wv - this.turnSm * 0.2 / b.tail.length, 0);
    }
    this.jaw = 0; this.ear = this.run * 0.5 + this.combat * 0.4;
    // ---------- fidgets ----------
    if (spec.fidgets && idle > 0.9 && !this.dead && this.combat < 0.3 && !this.acts.list.length) {
      this.fidgetTimer -= dt;
      if (this.fidgetTimer <= 0) {
        this.fidgetTimer = 3.5 + Math.random() * 5;
        const tot = spec.fidgets.reduce((s, f) => s + f.w, 0);
        let r = Math.random() * tot;
        for (const f of spec.fidgets) { r -= f.w; if (r <= 0) { this.acts.play(f.name, 1); break; } }
      }
    }
    if (spec.pose) spec.pose(this, dt);
    this.acts.apply();
    if (b.ears) for (let i = 0; i < b.ears.length; i++) {
      const s = i === 0 ? 1 : -1, tw = Math.pow(Math.max(0, Math.sin(this.t * 1.9 + i * 2.3)), 30) * idle;
      P.rot(b.ears[i], this.ear * 0.6 + tw * 0.3, 0, s * (this.ear * 0.4 + tw * 0.3));
    }
    if (b.jaw !== undefined) P.rx(b.jaw, -this.jaw);
    P.fk();
    G.solve(P, { air: this.air * this.locoW, airPaw: -0.3 });
    P.apply(this.inst.bones);
  }
}

// helpers for actions
export const armRot = (ctl, side, up, lo, w, out = 0, twist = 0) => {
  const arm = side < 0 ? ctl.b.armL : ctl.b.armR, P = ctl.pose;
  P.rot(arm[0], up * w, twist * w, side * out * w);
  P.rot(arm[1], lo * w, 0, 0);
};
export function bipedDeath(opts = {}) { // topple backwards (or forwards), arms flung, hold
  const back = opts.back ?? 1, lie = opts.lie ?? 0.35;
  return {
    dur: opts.dur ?? 1.3, hold: true, excl: true, fadeIn: 0.05,
    fn(ctl, a, w) {
      const P = ctl.pose, b = ctl.b, t = a.t;
      const st = sstep(0, 0.3, t) * (1 - sstep(0.3, 0.6, t));
      const fall = sstep(0.2, 0.85, t);
      const bounce = t > 0.85 ? Math.sin(clamp01((t - 0.85) / 0.25) * Math.PI) * 0.025 : 0;
      P.move(b.hips, 0, (-lie * fall + bounce) * w, 0.1 * back * fall * w);
      P.rot(b.hips, (back * 1.35 * fall - 0.1 * st * back) * w, 0, 0.12 * fall * w);
      P.rx(b.spine, (0.2 * st) * w); P.rx(b.chest, 0.1 * fall * w);
      P.rot(b.head, (-0.3 * st + 0.35 * fall * back) * w, 0.3 * fall * w, 0);
      for (const [arm, s] of [[b.armL, -1], [b.armR, 1]]) if (arm) { P.rot(arm[0], (-0.4 * st + 1.6 * fall * back) * w, 0, s * 0.9 * fall * w); P.rx(arm[1], 0.5 * fall * w); }
      ctl.jaw = Math.max(ctl.jaw, 0.35 * fall * w);
      for (const L of ctl.gait.legs) {
        L.override = L.override || new THREE.Vector3();
        L.override.set(L.toe.x * 1.4, L.toe.y + 0.05, L.toe.z + 0.1); L.overrideLocal = true; L.overrideW = Math.max(L.overrideW, fall * w);
      }
    },
  };
}
