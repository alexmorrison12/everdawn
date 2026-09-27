// Generic procedural animation controller for four-legged creatures (wolf, boar, bear, deer, sheep, cat…).
// Layers: gait (legs + body oscillation) → carriage (neck/head/tail, combat stance, look-around, breathing)
//         → one-shot / held actions (additive pose deltas with envelopes) → FK → leg IK.
import * as THREE from 'three';
import { Gait } from './gait.js';
import { sstep, clamp01, mix, TAU, env } from './rig.js';

export class ActionSet {
  constructor(ctl, defs) { this.ctl = ctl; this.defs = defs; this.list = []; }
  play(name, speed = 1) {
    const d = this.defs[name];
    if (!d) return false;
    // one instance per action name; restarting replaces it
    for (const a of this.list) if (a.name === name && !a.out) { if (d.hold) return true; a.t = 0; a.speed = speed; return true; }
    if (d.excl) for (const a of this.list) if (this.defs[a.name].hold || this.defs[a.name].excl) a.out = true;
    this.list.push({ name, d, t: 0, speed, w: 0, out: false, outT: 0, k: 0, seed: Math.random() * 100 });
    return true;
  }
  stop(name) { for (const a of this.list) if (!name || a.name === name) a.out = true; }
  has(name) { return this.list.some(a => a.name === name && !a.out); }
  weight(name) { let w = 0; for (const a of this.list) if (a.name === name) w = Math.max(w, a.w); return w; }
  update(dt) {
    for (const a of this.list) {
      const d = a.d;
      a.t += dt * a.speed;
      const dur = d.dur ?? 1;
      a.k = Math.min(1, a.t / dur);
      if (a.out) { if (a.w0 === undefined) a.w0 = a.w; a.outT += dt; a.w = a.w0 * (1 - clamp01(a.outT / (d.fadeOut ?? 0.35))); }
      else if (d.hold) a.w = clamp01(a.t / (d.fadeIn ?? 0.3));
      else a.w = env(a.k, d.a ?? 0.12, d.d ?? 0.8);
      if (!d.hold && a.k >= 1 && !a.out) a.done = true;
    }
    let j = 0;
    for (let i = 0; i < this.list.length; i++) { const a = this.list[i]; if (!a.done && !(a.out && a.w <= 0.001)) this.list[j++] = a; }
    this.list.length = j;
  }
  apply() { for (const a of this.list) if (a.w > 0) a.d.fn(this.ctl, a, a.w); }
}

/**
 * spec: { bones: {body, hips, chest, neck, head, jaw, tail:[..], ears:[L,R]}, gait (Gait cfg), neck: {pitch, run, combat}, tail: {...},
 *         actions: {name: {dur, hold, fn(ctl, act, w)}}, fidgets: [{name, w, fn}], pose(ctl, dt) (species extras), lieY }
 */
export class QuadCtl {
  constructor(inst, spec) {
    this.inst = inst; this.pose = inst.pose; this.spec = spec;
    const P = this.pose;
    const b = {};
    for (const [k, v] of Object.entries(spec.bones)) b[k] = Array.isArray(v) ? v.map(n => P.b[n]) : P.b[v];
    this.b = b;
    this.gait = new Gait(P, spec.gait);
    this.acts = new ActionSet(this, spec.actions || {});
    this.t = Math.random() * 100;
    this.combat = 0; this.run = 0; this.turnSm = 0; this.speedSm = 0; this.accel = 0; this.air = 0;
    this.look = { y: 0, p: 0, ty: 0, tp: 0, timer: 1 + Math.random() * 3 };
    this.fidget = null; this.fidgetTimer = 2 + Math.random() * 4;
    this.dead = false; this.hackle = 0; this.jaw = 0; this.ear = 0; this.locoW = 1;
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
    this.state = state;
    this.t += dt;
    const sc = this.inst.scale;
    let speed = (state.speed ?? 0) / sc, turn = state.turn ?? 0, strafe = (state.strafe ?? 0) / sc;
    // state.dead true → die; revive only on a true→false transition (play('death') alone also holds)
    if (state.dead && !this.dead) this.play('death');
    if (this._sd && !state.dead && this.dead) this.play('revive');
    this._sd = !!state.dead;
    if (this.dead) { speed = 0; turn = 0; strafe = 0; }
    // moving cancels resting holds
    if (Math.abs(speed) > 0.3) for (const a of this.acts.list) if (a.d.rest) a.out = true;
    if (state.sit && !this.acts.has('sit') && Math.abs(speed) < 0.1 && spec.actions?.sit) this.play('sit');
    if (state.sit === false && this.acts.has('sit')) this.acts.stop('sit');
    this.acts.update(dt);
    let restW = 0; for (const a of this.acts.list) if ((a.d.rest || a.name === 'death') && a.w > restW) restW = a.w;
    this.locoW = 1 - restW;
    const k6 = 1 - Math.exp(-6 * dt);
    const prevS = this.speedSm;
    this.speedSm += (speed - this.speedSm) * k6;
    this.accel += (((this.speedSm - prevS) / Math.max(dt, 1e-4)) - this.accel) * k6;
    this.turnSm += (turn - this.turnSm) * (1 - Math.exp(-4 * dt));
    this.combat += ((state.combat ? 1 : 0) - this.combat) * (1 - Math.exp(-4 * dt));
    const gs = spec.gait.gaits;
    this.run = sstep(gs[1]?.v ?? 3, gs[gs.length - 1].v, Math.abs(this.speedSm));
    const walkK = clamp01(Math.abs(this.speedSm) / 1.2);
    const airT = state.grounded === false ? 1 : 0;
    this.air += (airT - this.air) * (1 - Math.exp(-10 * dt));

    P.reset();
    G.update(dt, speed * this.locoW, turn * this.locoW, strafe * this.locoW);
    const idle = 1 - clamp01(G.act * 1.5);
    // ---------- body ----------
    const breathF = mix(0.28, 0.9, Math.max(this.run, this.combat * 0.5));
    const breath = Math.sin(this.t * TAU * breathF);
    P.sc[b.chest].setScalar(1 + breath * (spec.breathe ?? 0.012));
    const crouch = (spec.combatCrouch ?? 0.05) * this.combat * (1 - this.run);
    const lean = clamp01(this.accel * 0.05) * 0.12 - clamp01(-this.accel * 0.05) * 0.1;
    G.adaptBody(dt);
    P.move(b.body, G.sway, G.bob - crouch - this.run * (spec.runDrop ?? 0.03) + G.gOff, 0);
    P.rot(b.body, G.pitch - lean * 0.5 + (spec.combatPitch ?? -0.05) * this.combat + G.gPitch, 0, G.roll + this.turnSm * clamp01(Math.abs(this.speedSm) / 4) * 0.12 + G.gRoll);
    P.rx(b.chest, G.flex - crouch * 0.6);
    P.rx(b.hips, -G.flex * 0.8);
    // ---------- look around (idle) ----------
    const L = this.look;
    L.timer -= dt;
    if (L.timer <= 0) {
      L.timer = 1.5 + Math.random() * 3.5;
      const r = Math.random();
      L.ty = r < 0.3 ? 0 : (Math.random() - 0.5) * 1.3; L.tp = (Math.random() - 0.4) * 0.35;
    }
    const lookK = idle * (1 - this.combat * 0.7);
    L.y += (L.ty * lookK - L.y) * (1 - Math.exp(-3 * dt)); L.p += (L.tp * lookK - L.p) * (1 - Math.exp(-3 * dt));
    // ---------- neck & head ----------
    const N = spec.neck || {};
    const stab = -(G.pitch + G.flex) * (N.stab ?? 0.85);
    const neckP = (N.pitch ?? 0) + (N.run ?? -0.25) * this.run + (N.combat ?? -0.3) * this.combat + (N.walk ?? -0.05) * walkK * (1 - this.run);
    P.rot(b.neck, neckP + stab * 0.4 + L.p * 0.4, L.y * 0.45 + this.turnSm * 0.12, 0);
    P.rot(b.head, stab * 0.6 + G.nod + L.p * 0.6 - neckP * (N.comp ?? 0.6) + (N.headCombat ?? 0.15) * this.combat, L.y * 0.55 + this.turnSm * 0.1, -L.y * 0.25);
    // ---------- tail ----------
    if (b.tail) {
      const T = spec.tail || {};
      const n = b.tail.length;
      const wagA = (T.wag ?? 0.25) * idle * (1 - this.combat) + 0.08 * G.act;
      for (let i = 0; i < n; i++) {
        const ph = this.t * TAU * (T.wagF ?? 0.6) - i * 0.9;
        const sway = Math.sin(ph) * wagA * (0.6 + i * 0.3) + Math.sin(G.phase * TAU * 2 - i) * 0.1 * G.act;
        const pitch = -((T.run ?? 0.45) * this.run + (T.combat ?? 0.3) * this.combat) / n + Math.sin(this.t * 2.1 - i) * 0.03 + (G.pitch * 0.5) / n;
        P.rot(b.tail[i], pitch, sway + this.turnSm * 0.15, 0);
      }
    }
    // ---------- ears / jaw / hackles (species parts) ----------
    this.jaw = 0; this.ear = this.run * 0.6 + this.combat * 0.5;
    this.hackle = mix(this.hackle, this.combat, 1 - Math.exp(-5 * dt));
    // ---------- idle fidgets ----------
    if (spec.fidgets && idle > 0.9 && !this.dead && this.combat < 0.3 && !this.acts.list.length) {
      this.fidgetTimer -= dt;
      if (this.fidgetTimer <= 0) {
        this.fidgetTimer = 4 + Math.random() * 6;
        const tot = spec.fidgets.reduce((s, f) => s + f.w, 0);
        let r = Math.random() * tot;
        for (const f of spec.fidgets) { r -= f.w; if (r <= 0) { this.acts.play(f.name, 1); this.fidgetHold = { name: f.name, until: this.t + (f.hold ?? 4 + Math.random() * 5) }; break; } }
      }
    }
    // held fidgets (e.g. graze) end by themselves
    if (this.fidgetHold && this.t > this.fidgetHold.until) { if (this.acts.defs[this.fidgetHold.name]?.hold) this.acts.stop(this.fidgetHold.name); this.fidgetHold = null; }
    // ---------- species extras + actions ----------
    if (spec.pose) spec.pose(this, dt);
    this.acts.apply();
    if (b.ears) for (let i = 0; i < b.ears.length; i++) {
      const s = i === 0 ? 1 : -1;
      const tw = Math.pow(Math.max(0, Math.sin(this.t * 1.7 + i * 2.1)), 40) * 0.5 * idle;
      P.rot(b.ears[i], this.ear * 0.8 + tw * 0.3, 0, s * (this.ear * 0.3 + tw * 0.25));
    }
    if (b.jaw !== undefined) P.rx(b.jaw, -this.jaw);
    // ---------- solve ----------
    P.fk();
    G.solve(P, { air: this.air * this.locoW });
    P.apply(this.inst.bones);
    const u = this.inst.material.userData.u;
    u.uHackle.value = this.hackle;
  }
}

// ---------- reusable action building blocks ----------
/** Generic quadruped death: stagger, collapse onto side, hold. */
export function deathAction(opts = {}) {
  const side = opts.side ?? 1, lieY = opts.lieY ?? 0.55, roll = opts.roll ?? 1.35;
  return {
    dur: opts.dur ?? 1.4, hold: true, excl: true, fadeIn: 0.05,
    fn(ctl, a, w) {
      const P = ctl.pose, b = ctl.b, t = a.t;
      const st = sstep(0, 0.35, t) * (1 - sstep(0.35, 0.6, t));
      const fall = sstep(0.25, 0.95, t);
      const bounce = Math.sin(clamp01((t - 0.95) / 0.3) * Math.PI) * 0.03 * (t > 0.95 ? 1 : 0);
      P.move(b.body, 0, (-lieY * fall + bounce) * w, 0);
      P.rot(b.body, (-0.15 * st + 0.08 * fall) * w, 0, (side * roll * fall + side * 0.1 * st) * w);
      P.rx(b.neck, (-0.35 * st - 0.2 * fall) * w);
      P.rot(b.head, (-0.2 * fall) * w, 0, side * 0.3 * fall * w);
      if (b.tail) for (const tb of b.tail) P.rx(tb, -0.15 * fall * w);
      ctl.jaw = Math.max(ctl.jaw, 0.25 * fall * w);
      ctl.ear = mix(ctl.ear, 0.8, fall * w);
      for (const L of ctl.gait.legs) {
        L.override = L.override || new THREE.Vector3();
        // legs go limp: paws drawn up toward the body, loosely bent, fore/hind pairs slightly apart
        const H = ctl.inst.entry.height * 0.22;
        const front = L.toe.z < 0;
        L.override.set(L.toe.x * 1.15, L.toe.y + H * (front ? 1.0 : 0.8), L.toe.z + (front ? -0.6 : 0.5) * H);
        L.overridePaw = -0.5;
        L.overrideLocal = true;
        L.overrideW = Math.max(L.overrideW, fall * w);
      }
      ctl.hackle = 0;
    },
  };
}
