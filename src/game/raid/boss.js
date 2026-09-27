// The dragon: a three-phase raid boss driven by ability timers. Ground (P1) → airborne (P2) → enraged landing (P3).
import * as THREE from 'three';
import { bus } from '../events.js';
import { HAZARD_NAMES } from './daily.js';

// the enrage: a clean kill lands around 5-6 minutes; a raid still fighting at 8 is out of time
const BERSERK = 480;

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const FWD = a => V(-Math.sin(a), 0, -Math.cos(a));
const face = (from, to) => Math.atan2(-(to.x - from.x), -(to.z - from.z));
const angDiff = (a, b) => { let d = a - b; return Math.atan2(Math.sin(d), Math.cos(d)); };

const LINES = {
  wake: {
    ember: 'Who dares disturb my slumber? Your bones will melt into my hoard!', frost: 'Warm blood in my halls? It will not stay warm for long.',
    venom: 'Fresh meat for my brood. How thoughtful.', storm: 'The sky itself answers my call. You answer to me.', shadow: 'Another night. Another raid. Another feast.',
  },
  air: 'Enough! Face me in the sky, if you can!',
  land: { ember: 'Now... you BURN!', frost: 'Your hearts will freeze where you stand!', venom: 'Rot, all of you!', storm: 'Feel the fury of the storm!', shadow: 'Let the darkness take you!' },
  kill: ['Another for the pile.', 'Pathetic.', 'Is that all Lastlight has to offer?', 'Next.'],
  berserk: 'I tire of this game. DIE!',
  death: 'Impossible... the Maw... will... remember...',
};

export class DragonBrain {
  constructor(unit, raid, cfg) {
    this.u = unit; this.r = raid; this.cfg = cfg;
    this.el = cfg.element; this.H = HAZARD_NAMES[this.el];
    this.affix = cfg.affix;
    this.phase = 0;           // 0 asleep, 1 ground, 2 air, 3 ground enraged
    this.t = {};              // ability timers
    this.fightT = 0;
    this.home = V(0, 0, -13);
    this.sub = null;          // current scripted action { kind, t, ... }
    this.altitude = 0; this.altTarget = 0;
    this.circleA = 0;
    this.dmgMul = this.affix === 'tyrannical' ? 1.15 : 1;
    this.frenzied = false; this.berserk = false;
  }
  timersFor(p) {
    const T = this.t;
    if (p === 1) Object.assign(T, { cleave: 8, tail: 11, breath: 22, hazard: 12, volcanic: 7 });
    if (p === 2) Object.assign(T, { fireball: 3, deep: 11, whelps: 3, volcanic: 7 });
    if (p === 3) Object.assign(T, { cleave: 6, tail: 10, breath: 18, hazard: 10, roar: 8, erupt: 6, volcanic: 7 });
  }
  say(text, rw = null) {
    bus.emit('say', { unit: this.u, text, yell: true });
    if (rw) bus.emit('raid_warning', { text: rw, color: '#ff4040' });
  }
  timer(name, id, dur, icon) { bus.emit('boss_timer', { id, name, dur, icon }); }

  wake() {
    const u = this.u;
    this.phase = 1; this.timersFor(1); this.fightT = 0;
    u.model?.play?.('wake');
    this.say(LINES.wake[this.el]);
    this.sub = { kind: 'walkHome', t: 0 };
    bus.emit('boss_phase', { phase: 1 });
    this.announceTimers();
  }
  announceTimers() {
    const T = this.t, H = this.H;
    if (this.phase === 1 || this.phase === 3) { this.timer(H.breath, 'breath', T.breath, 'fireBreath'); this.timer(H.hazard, 'hazard', T.hazard, 'flamestrike'); }
    if (this.phase === 2) { this.timer(H.deep, 'deep', T.deep, 'fireBreath'); this.timer('Whelps', 'whelps', T.whelps, 'whelp'); }
    if (this.phase === 3) this.timer('Bellowing Roar', 'roar', T.roar, 'fear');
    if (!this.berserk) this.timer('Berserk', 'berserk', Math.max(0, BERSERK - this.fightT), 'enrage');
  }

  topThreat() {
    const u = this.u; let best = null, bv = -1;
    for (const [o, v] of u.threat) if (!o.dead && v > bv) { bv = v; best = o; }
    return best;
  }
  raiders() { return this.r.raiders.filter(m => !m.dead); }
  randomRaider(excludeTank = true) {
    const list = this.raiders().filter(m => !excludeTank || m !== this.u.target);
    return list[Math.floor(Math.random() * list.length)] || this.raiders()[0];
  }

  update(dt) {
    const u = this.u, r = this.r;
    if (u.dead) return;
    const state = u.stateAnim;
    state.flying = this.phase === 2; state.enraged = this.phase === 3 || this.berserk;
    if (this.phase === 0) { state.speed = 0; state.sleep = true; return; }
    state.sleep = false;
    this.fightT += dt;
    // berserk
    if (!this.berserk && this.fightT > BERSERK) { this.berserk = true; this.dmgMul *= 3; u.addAura('enrage', u); this.say(LINES.berserk, `${u.name} goes BERSERK!`); u.model?.play?.('enrage'); }
    if (this.affix === 'frenzied' && !this.frenzied && u.hpPct < 0.3) { this.frenzied = true; u.base.swing *= 0.77; u.recalc(); bus.emit('raid_warning', { text: `${u.name} becomes frenzied!`, color: '#ff8040' }); }
    // phase transitions
    if (this.phase === 1 && u.hpPct <= 0.65 && !this.sub) this.startAir();
    if (this.phase === 2) this.airT = (this.airT || 0) + dt;
    if (this.phase === 2 && (u.hpPct <= 0.4 || this.airT > 70) && !this.sub) this.startLand();
    // timers
    for (const k in this.t) this.t[k] -= dt * (this.frenzied ? 1.25 : 1);
    // altitude
    this.altitude += (this.altTarget - this.altitude) * Math.min(1, dt * 1.2);
    u.altitude = this.altitude; u.flying = this.altitude > 4;
    state.altitude = this.altitude;
    if (this.sub) { this.runSub(dt); return; }
    if (this.phase === 2) { this.airLoop(dt); return; }
    this.groundLoop(dt);
  }

  // ---------------------------------------------------------------- ground phases
  groundLoop(dt) {
    const u = this.u, r = this.r, T = this.t;
    const tgt = this.topThreat();
    u.target = tgt; u.autoAttack = !!tgt;
    // stay near home, turn to face the tank slowly (big creature)
    if (tgt) {
      const want = face(u.pos, tgt.pos);
      const d = angDiff(want, u.facing); u.facing += Math.sign(d) * Math.min(Math.abs(d), dt * 1.6);
      u.stateAnim.turn = Math.sign(d) * Math.min(1, Math.abs(d) * 3);
      const dist = Math.hypot(tgt.pos.x - u.pos.x, tgt.pos.z - u.pos.z);
      if (dist > u.radius + 6) { const f = FWD(u.facing); r.sim.move(u, f.x * 5 * dt, f.z * 5 * dt, dt, { collide: false }); u.stateAnim.speed = 5; } else u.stateAnim.speed = 0;
    }
    if (u.casting) return;
    if (T.breath <= 0) return this.breath();
    if (T.hazard <= 0) return this.hazard();
    if (this.phase === 3 && T.roar <= 0) return this.roar();
    if (this.phase === 3 && T.erupt <= 0) return this.eruptions();
    if (T.cleave <= 0) return this.cleave();
    if (T.tail <= 0) return this.tail();
    if (this.affix === 'volcanic' && T.volcanic <= 0) this.volcanic();
  }

  cleave() {
    const u = this.u; this.t.cleave = 9 + Math.random() * 2;
    u.model?.play?.('cleave');
    this.r.hazards.cone(u.pos, u.facing, 1.25, u.radius + 9, 0.55, 75 * this.dmgMul, 'physical', { name: 'Cleave', fx: 'telegraphCone', src: u });
  }
  tail() {
    const u = this.u; this.t.tail = 11 + Math.random() * 3;
    u.model?.play?.('tailSwipe');
    const back = u.facing + Math.PI;
    this.r.hazards.cone(u.pos, back, 1.8, u.radius + 11, 0.7, 55 * this.dmgMul, 'physical', { name: 'Tail Swipe', src: u, then: h => this.knockback(h) });
  }
  knockback(h) {
    for (const m of this.raiders()) if (this.r.hazards.contains(h, m.pos)) {
      const dx = m.pos.x - this.u.pos.x, dz = m.pos.z - this.u.pos.z, d = Math.hypot(dx, dz) || 1;
      m.dash = { from: m.pos.clone(), to: V(m.pos.x + dx / d * 9, 0, m.pos.z + dz / d * 9), t: 0, dur: 0.45, knock: true };
    }
  }
  breath() {
    const u = this.u, H = this.H; this.t.breath = 24 + Math.random() * 4;
    bus.emit('emote', { unit: u, text: `${u.name} takes a deep breath...` });
    u.model?.play?.('breath');
    const f = u.facing;
    this.r.hazards.cone(u.pos, f, 1.05, 34, 2.4, 170 * this.dmgMul, H.school, { name: H.breath, fx: 'telegraphCone', src: u,
      then: () => bus.emit('fx_cone', { name: H.breathFx, unit: u, length: 34, angle: 1.05, duration: 1.4 }) });
    this.timer(H.breath, 'breath', this.t.breath, 'fireBreath');
    u.casting = { id: 'breath', spell: { name: H.breath, icon: 'fireBreath', target: 'none' }, t: 0, dur: 2.4, target: null, channel: false, custom: () => {} };
    bus.emit('cast_start', { unit: u, spell: u.casting.spell, id: 'breath', dur: 2.4 });
  }
  hazard() {
    const u = this.u, H = this.H, r = this.r;
    this.t.hazard = (this.phase === 3 ? 12 : 15) + Math.random() * 3;
    this.timer(H.hazard, 'hazard', this.t.hazard, 'flamestrike');
    if (this.el === 'storm') {
      // static charge: two raiders become bombs — everyone near them when it detonates takes damage
      const targets = [this.randomRaider(), this.randomRaider()].filter((v, i, a) => v && a.indexOf(v) === i);
      for (const t of targets) {
        t.addAura('staticCharge', u, { dur: 5 });
        bus.emit('raid_warning', { text: `${t === r.player ? 'YOU have' : t.name + ' has'} Static Charge! Spread out!`, color: '#a080ff', personal: t === r.player });
        r.combat.later(5, () => {
          if (u.dead) return;
          bus.emit('fx', { name: 'crit', pos: t.pos.clone().add(new THREE.Vector3(0, 1.1, 0)), color: 0xa080ff, scale: 2.5 });
          for (const m of this.raiders()) if (m !== t && Math.hypot(m.pos.x - t.pos.x, m.pos.z - t.pos.z) < 8) r.combat.damage(u, m, 120 * this.dmgMul, 'nature', { noMiss: true, avoidable: true, spellId: 'Static Charge' });
          if (!t.dead) r.combat.damage(u, t, 40, 'nature', { noMiss: true, spellId: 'Static Charge' });
        });
      }
      return;
    }
    const n = 3 + (this.phase === 3 ? 1 : 0);
    const used = new Set();
    for (let i = 0; i < n; i++) {
      let t = this.randomRaider(); for (let k = 0; k < 4 && used.has(t); k++) t = this.randomRaider(); used.add(t);
      if (!t) continue;
      const pos = t.pos.clone();
      const grow = this.el === 'shadow' ? 0.2 : 0;
      r.hazards.circle(pos, 4.5, 2.1, 100 * this.dmgMul, H.school, { name: H.hazard, fx: 'telegraphCircle', src: u,
        then: () => { bus.emit('fx', { name: this.el === 'frost' ? 'frostImpact' : this.el === 'venom' ? 'splash' : this.el === 'shadow' ? 'shadowImpact' : 'meteorImpact', pos }); r.hazards.pool(pos, 4.2, this.el === 'shadow' ? 12 : 9, 26 * this.dmgMul * (this.el === 'shadow' ? 0.7 : 1), H.school, { fx: H.pool, name: H.hazard, src: u, grow, slow: this.el === 'frost' }); } });
      bus.emit('fx_projectile', { name: this.H.proj, from: u.model?.sockets?.mouth || u.pos, to: pos, arc: 6, speed: 20, color: this.el === 'venom' ? 0x70ff30 : this.el === 'shadow' ? 0xa040ff : undefined });
    }
  }
  volcanic() {
    this.t.volcanic = 9;
    const ranged = this.raiders().filter(m => m.raidRole === 'ranged' || m.raidRole === 'heal' || m === this.r.player);
    for (let i = 0; i < 2; i++) {
      const t = ranged[Math.floor(Math.random() * ranged.length)]; if (!t) continue;
      const p = t.pos.clone();
      this.r.hazards.circle(p, 3, 1.8, 55, 'fire', { name: 'Volcanic Plume', fx: 'telegraphCircle', src: this.u, then: () => bus.emit('fx', { name: 'eruption', pos: p }) });
    }
  }
  roar() {
    const u = this.u; this.t.roar = 24 + Math.random() * 3;
    this.timer('Bellowing Roar', 'roar', this.t.roar, 'fear');
    u.model?.play?.('roar');
    bus.emit('raid_warning', { text: `${u.name} begins to cast Bellowing Roar!`, color: '#ff4040' });
    bus.emit('sound', { name: 'dragonRoar', vol: 1.2 });
    u.casting = { id: 'roar', spell: { name: 'Bellowing Roar', icon: 'fear', target: 'none' }, t: 0, dur: 1.6, custom: () => {
      bus.emit('shake', { amount: 1.2 });
      for (const m of this.raiders()) if (Math.hypot(m.pos.x - u.pos.x, m.pos.z - u.pos.z) < 60) this.r.combat.applyAura(u, m, 'fear', { dur: 3 });
    } };
    bus.emit('cast_start', { unit: u, spell: u.casting.spell, id: 'roar', dur: 1.6 });
  }
  eruptions() {
    this.t.erupt = 10 + Math.random() * 3;
    const r = this.r;
    for (let i = 0; i < 5; i++) {
      const t = i < 3 ? this.randomRaider(false) : null;
      const a = Math.random() * Math.PI * 2, rr = 8 + Math.random() * 30;
      const p = t ? V(t.pos.x + (Math.random() - 0.5) * 6, 0, t.pos.z + (Math.random() - 0.5) * 6) : V(Math.cos(a) * rr, 0, Math.sin(a) * rr);
      r.hazards.circle(p, 4, 2.4, 95 * this.dmgMul, this.H.school, { name: 'Eruption', fx: 'telegraphCircle', src: this.u, then: () => bus.emit('fx', { name: 'eruption', pos: p }) });
    }
  }

  // ---------------------------------------------------------------- air phase
  startAir() {
    const u = this.u;
    this.phase = 2; this.timersFor(2);
    this.say(LINES.air, `${u.name} takes to the skies!`);
    u.autoAttack = false; u.model?.play?.('takeoff');
    this.sub = { kind: 'takeoff', t: 0 };
    bus.emit('boss_phase', { phase: 2 });
    this.announceTimers();
    bus.emit('sound', { name: 'wingFlap', vol: 1.3 });
  }
  airLoop(dt) {
    const u = this.u, T = this.t;
    this.circleA += dt * 0.22;
    const tx = Math.cos(this.circleA) * 13, tz = Math.sin(this.circleA) * 13 - 4;
    const dx = tx - u.pos.x, dz = tz - u.pos.z, d = Math.hypot(dx, dz);
    if (d > 0.3) { const s = Math.min(8, d * 2); u.pos.x += dx / d * s * dt; u.pos.z += dz / d * s * dt; u.facing = face(u.pos, V(tx + Math.cos(this.circleA + 0.4) * 5, 0, tz + Math.sin(this.circleA + 0.4) * 5)); }
    u.stateAnim.speed = 6;
    if (T.fireball <= 0) {
      T.fireball = 2.6;
      const t = this.randomRaider(false);
      if (t) {
        bus.emit('fx_projectile', { name: this.H.proj === 'lavaBomb' ? 'fireball' : this.H.proj, from: u.model?.sockets?.mouth || u.pos, to: t, speed: 28, color: this.el === 'venom' ? 0x70ff30 : undefined });
        const dd = Math.hypot(t.pos.x - u.pos.x, t.pos.z - u.pos.z) / 28;
        this.r.combat.later(dd + 0.2, () => { if (!t.dead) this.r.combat.damage(u, t, 45 * this.dmgMul, this.H.school, { noMiss: true, spellId: 'Dragonfire' }); });
      }
    }
    if (T.whelps <= 0) this.whelps();
    if (T.deep <= 0) this.startDeepBreath();
    if (this.affix === 'volcanic' && T.volcanic <= 0) this.volcanic();
  }
  whelps() {
    const r = this.r; this.t.whelps = 22;
    this.timer('Whelps', 'whelps', this.t.whelps, 'whelp');
    const n = Math.round(3 * (this.affix === 'swarming' ? 1.5 : 1));
    bus.emit('raid_warning', { text: 'Whelps are hatching!', color: '#ffb040' });
    for (const nest of r.lair.spots.nests) for (let i = 0; i < n; i++) r.spawnWhelp(nest.clone().add(V((Math.random() - 0.5) * 5, 0, (Math.random() - 0.5) * 5)));
  }
  startDeepBreath() {
    const u = this.u, H = this.H;
    this.t.deep = 30;
    const side = Math.random() < 0.5 ? -1 : 1;
    const axis = Math.random() < 0.5 ? 'x' : 'z';
    const start = axis === 'x' ? V(side * 42, 0, -4) : V(0, 0, side < 0 ? -42 : 34);
    this.sub = { kind: 'deepFly', t: 0, start, axis, side };
  }

  runSub(dt) {
    const u = this.u, s = this.sub, r = this.r, H = this.H;
    s.t += dt;
    u.autoAttack = false;
    if (s.kind === 'walkHome') {
      const d = Math.hypot(this.home.x - u.pos.x, this.home.z - u.pos.z);
      if (s.t < 2.2) { u.stateAnim.speed = 0; return; } // wake animation
      if (d > 1) { u.facing = face(u.pos, this.home); r.sim.move(u, (this.home.x - u.pos.x) / d * 6 * dt, (this.home.z - u.pos.z) / d * 6 * dt, dt, { collide: false }); u.stateAnim.speed = 6; }
      else { this.sub = null; u.stateAnim.speed = 0; }
      return;
    }
    if (s.kind === 'takeoff') {
      if (s.t > 0.8) this.altTarget = 18;
      u.stateAnim.speed = 0;
      if (s.t > 3) { this.sub = null; this.circleA = Math.atan2(u.pos.z + 4, u.pos.x); }
      return;
    }
    if (s.kind === 'deepFly') {
      const d = Math.hypot(s.start.x - u.pos.x, s.start.z - u.pos.z);
      if (d > 1.5) { const k = Math.min(16, d * 2); u.pos.x += (s.start.x - u.pos.x) / d * k * dt; u.pos.z += (s.start.z - u.pos.z) / d * k * dt; u.facing = face(u.pos, s.start); u.stateAnim.speed = 10; return; }
      // face across the arena and inhale
      const across = s.axis === 'x' ? V(-s.side * 42, 0, -4) : V(0, 0, s.side < 0 ? 34 : -42);
      u.facing = face(u.pos, across);
      this.sub = { kind: 'deepBreath', t: 0, from: u.pos.clone(), dir: u.facing };
      u.model?.play?.('deepBreath');
      bus.emit('raid_warning', { text: `${u.name} takes a DEEP BREATH!`, color: '#ff2020', big: true });
      bus.emit('sound', { name: 'raidWarning' });
      r.hazards.line(V(u.pos.x, 0, u.pos.z), u.facing, 95, 16, 4.2, 480 * this.dmgMul, H.school, { name: H.deep, fx: 'telegraphLine', src: u,
        then: () => bus.emit('fx_cone', { name: H.breathFx, unit: u, length: 90, angle: 0.3, duration: 1.6, deep: true }) });
      this.timer(H.deep, 'deep', this.t.deep + 4, 'fireBreath');
      return;
    }
    if (s.kind === 'deepBreath') { u.stateAnim.speed = 0; if (s.t > 5.6) this.sub = null; return; }
    if (s.kind === 'land') {
      const d = Math.hypot(this.home.x - u.pos.x, this.home.z - u.pos.z);
      if (d > 1) { u.pos.x += (this.home.x - u.pos.x) / d * Math.min(9, d * 2) * dt; u.pos.z += (this.home.z - u.pos.z) / d * Math.min(9, d * 2) * dt; u.facing = face(u.pos, this.home); u.stateAnim.speed = 8; return; }
      if (!s.landing) { s.landing = true; s.t2 = 0; this.altTarget = 0; u.model?.play?.('land'); }
      s.t2 += dt;
      if (s.t2 > 2.4) { this.sub = null; u.facing = 0 + Math.PI; bus.emit('shake', { amount: 1.5 }); this.say(LINES.land[this.el], `${u.name} lands! Tanks, pick her up!`); this.announceTimers(); }
      return;
    }
  }
  startLand() {
    this.phase = 3; this.timersFor(3);
    this.sub = { kind: 'land', t: 0 };
    bus.emit('boss_phase', { phase: 3 });
  }
}
