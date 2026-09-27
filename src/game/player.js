// Player controller: WoW-style movement, camera, targeting (tab / click / right-click interact), action keys.
import * as THREE from 'three';
import { SPELLS } from './data/spells.js';
import { bus } from './events.js';

const KEYS = ['Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5', 'Digit6', 'Digit7', 'Digit8', 'Digit9', 'Digit0', 'Minus', 'Equal'];
const _v = new THREE.Vector3();

export class PlayerController {
  constructor(game, unit) {
    this.g = game; this.u = unit;
    this.bar = new Array(12).fill(null);
    this.autorun = false;
    this.jumpBuffered = 0;
    this.moving = false;
    this.lastTabT = 0; this.tabList = [];
  }

  setBar(ids) { this.bar = new Array(12).fill(null); ids.forEach((id, i) => { if (i < 12) this.bar[i] = id; }); bus.emit('bar_changed', { bar: this.bar }); }

  update(dt) {
    const g = this.g, I = g.input, u = this.u, cam = g.cam;
    const [dx, dy] = I.consumeDrag();
    const sens = (g.settings?.sens ?? 1) * 0.0042;
    if (dx || dy) { cam.applyDrag(dx, dy * (g.settings?.invertY ? -1 : 1), sens); if (I.buttons & 2) u.facing = cam.yaw; }
    if (I.wheel) cam.zoom(I.wheel);
    if (u.dead) { this.deadUpdate(dt); return; }

    const stunned = u.flag('stun'), rooted = u.flag('root') || stunned, feared = u.flag('fear');
    const steer = (I.buttons & 2) !== 0;
    let f = 0, s = 0;
    if (I.hit('NumLock') || I.hit('Backquote')) this.autorun = !this.autorun;
    if (I.down('KeyW') || I.down('ArrowUp') || I.buttons === 3) { f += 1; this.autorun = false; }
    if (I.down('KeyS') || I.down('ArrowDown')) { f -= 1; this.autorun = false; }
    if (this.autorun) f = 1;
    if (I.down('KeyQ')) s -= 1; if (I.down('KeyE')) s += 1;
    let turn = 0;
    if (steer) { if (I.down('KeyA')) s -= 1; if (I.down('KeyD')) s += 1; if (I.buttons & 2) u.facing = cam.yaw; }
    else { if (I.down('KeyA') || I.down('ArrowLeft')) turn += 1; if (I.down('KeyD') || I.down('ArrowRight')) turn -= 1; }
    if (!stunned && !feared) u.facing += turn * 3.4 * dt;
    // touch stick: run toward the stick direction relative to the camera. The camera swings in behind only while
    // the stick points mostly ahead, so pushing sideways runs straight across the screen instead of circling.
    const st = I.stick, stickMag = st?.active ? Math.min(1, Math.hypot(st.x, st.y)) : 0;
    this.camFollow = true;
    let walk = 1;
    if (stickMag > 0.14 && !stunned && !feared) {
      const ang = Math.atan2(-st.x, -st.y);
      u.facing = cam.yaw + ang; f = 1; s = 0; this.autorun = false;
      this.camFollow = Math.abs(ang) < 0.35;
      walk = stickMag < 0.5 ? 0.5 : 1;
    }
    let speed = (f < 0 ? 4.6 : 7.2) * walk;
    speed *= u.mod('speed') * (u.swimming ? 0.62 : 1) * (this.mounted ? 1.6 : 1);
    if (feared) { f = 1; s = 0; if (!this.fearA || Math.random() < dt) this.fearA = Math.random() * Math.PI * 2; u.facing = this.fearA; }
    const fx = -Math.sin(u.facing), fz = -Math.cos(u.facing);
    const rx = -fz, rz = fx;
    let mx = fx * f + rx * s, mz = fz * f + rz * s; const ml = Math.hypot(mx, mz);
    this.moving = ml > 0 && !rooted;
    if (this.moving) {
      mx /= ml; mz /= ml;
      if (u.casting && !u.casting.channel) g.combat.interrupt(u, 'Interrupted');
      else if (u.casting && u.casting.channel) g.combat.interrupt(u, 'Interrupted');
      if (u.hasAura('drinking')) u.removeAura('drinking'); if (u.hasAura('eating')) u.removeAura('eating');
      this.sitting = false;
      g.sim.move(u, mx * speed * dt, mz * speed * dt, dt);
    }
    // jump
    if (I.hit('Space')) this.jumpBuffered = 0.15;
    this.jumpBuffered -= dt;
    if (this.jumpBuffered > 0 && u.grounded && !rooted && !u.swimming) { u.vy = 8.2; u.grounded = false; this.jumpBuffered = 0; u.model?.play?.('jump'); bus.emit('sound', { name: 'jump', pos: u.pos }); if (u.casting) g.combat.interrupt(u); }
    g.sim.vertical(u, dt);
    // sit
    if (I.hit('KeyX')) this.sitting = !this.sitting;

    // keep facing the target while swinging, unless the player is turning or steering themselves (a mob that ends
    // up beside you after a charge would otherwise leave every swing "facing the wrong way")
    if (u.autoAttack && u.target && !u.target.dead && !stunned && !feared && !turn && !steer && !(stickMag > 0.14)) {
      const want = Math.atan2(-(u.target.pos.x - u.pos.x), -(u.target.pos.z - u.pos.z)); let dA = want - u.facing; dA = Math.atan2(Math.sin(dA), Math.cos(dA));
      u.facing += Math.sign(dA) * Math.min(Math.abs(dA), 9 * dt);
    }
    // anim state (signed forward speed / strafe)
    const along = this.moving ? (mx * fx + mz * fz) * speed : 0, side = this.moving ? (mx * rx + mz * rz) * speed : 0;
    Object.assign(u.stateAnim, { speed: along, strafe: side, turn: turn * 3.4, grounded: u.grounded, vy: u.vy, swimming: u.swimming, sit: this.sitting || u.flag('sit'), combat: u.inCombat || !!u.casting });

    // targeting
    if (I.hit('Tab')) this.tabTarget();
    for (const c of I.clicks) this.click(c);
    // actions
    for (let i = 0; i < KEYS.length; i++) if (I.hit(KEYS[i]) && this.bar[i]) this.useSlot(i);
    if (I.hit('KeyF') && u.target && !u.target.dead && u.isEnemy(u.target)) this.startAttack();
    // auto-attack only for melee classes when target hostile
    if (u.target && (u.target.dead || !u.isEnemy(u.target))) u.autoAttack = false;
  }

  deadUpdate(dt) {
    Object.assign(this.u.stateAnim, { speed: 0, strafe: 0, dead: true });
  }

  useSlot(i) {
    const id = this.bar[i]; if (!id) return;
    if (id.startsWith('item:')) { this.g.useItem?.(id.slice(5)); return; }
    const sp = SPELLS[id]; if (!sp) return;
    if (sp.learn > this.u.level) { bus.emit('error', { unit: this.u, msg: 'You have not learned that ability yet' }); return; }
    const u = this.u;
    let target = u.target;
    if (sp.target === 'enemy' && (!target || target.dead || !u.isEnemy(target))) {
      // auto-acquire nearest enemy in front, like WoW's auto-targeting
      target = this.findTarget(sp.range + 2);
      if (target) this.setTarget(target);
    }
    if (sp.target === 'ally' && this.g.mouseoverAlly) target = this.g.mouseoverAlly;
    if (sp.melee && target && target !== u && !this.moving) this.g.combat.faceTarget(u, target); // melee strikes turn you to the target
    const ok = this.g.combat.cast(u, id, target);
    if (ok) bus.emit('action_used', { slot: i, id });
    // melee abilities start auto-attack even when they fail (a level 1 warrior has 0 rage: swinging is how rage comes)
    if ((ok || sp.melee) && (sp.melee || u.cls === 'warrior') && target && !target.dead && u.isEnemy(target)) this.startAttack();
    return ok;
  }

  startAttack() {
    const u = this.u;
    if (u.cls === 'warrior' || u.cls === 'rogue' || u.cls === 'paladin') { u.autoAttack = true; u.swingT = Math.min(u.swingT, 0.3); }
  }

  setTarget(t) {
    const u = this.u;
    if (u.target === t) return;
    u.target = t; u.autoAttack = false;
    bus.emit('target_changed', { unit: u, target: t });
    if (t) bus.emit('sound', { name: 'uiClick' });
  }

  findTarget(range = 40, excludeSet = null) {
    const u = this.u; let best = null, bs = Infinity;
    const cam = this.g.cam; const fwdYaw = cam.yaw;
    for (const o of this.g.sim.query(u.pos, range)) {
      if (!u.isEnemy(o) || o.dead || (excludeSet && excludeSet.has(o))) continue;
      const dx = o.pos.x - u.pos.x, dz = o.pos.z - u.pos.z, d = Math.hypot(dx, dz);
      const ang = Math.atan2(-dx, -dz); let da = ang - fwdYaw; da = Math.atan2(Math.sin(da), Math.cos(da));
      if (Math.abs(da) > Math.PI * 0.55) continue;
      const score = d + Math.abs(da) * 12;
      if (score < bs) { bs = score; best = o; }
    }
    return best;
  }

  tabTarget() {
    const now = performance.now();
    if (now - this.lastTabT > 2500) this.tabList = [];
    this.lastTabT = now;
    const ex = new Set(this.tabList);
    let t = this.findTarget(42, ex);
    if (!t) { this.tabList = []; t = this.findTarget(42); }
    if (t) { this.tabList.push(t); this.setTarget(t); }
  }

  // screen-space pick of the unit under the cursor
  pick(x, y) {
    const g = this.g, cam = g.camera, W = innerWidth, H = innerHeight;
    let best = null, bd = Infinity;
    for (const o of g.sim.units) {
      if (o === this.u || o.kind === 'critter' && o.dead) continue;
      _v.set(o.pos.x, o.pos.y + o.height * 0.55, o.pos.z).project(cam);
      if (_v.z > 1) continue;
      const sx = (_v.x * 0.5 + 0.5) * W, sy = (-_v.y * 0.5 + 0.5) * H;
      const dist = cam.position.distanceTo(o.pos);
      const rad = Math.max(18, (o.height * 0.6 + o.radius) / dist * H * 0.9);
      const d = Math.hypot(sx - x, sy - y);
      if (d < rad && dist < bd) { bd = dist; best = o; }
    }
    return best;
  }

  click(c) {
    if (c.x === undefined) return;
    const o = this.pick(c.x, c.y);
    const u = this.u;
    // touch has no right button: tapping the current target (or any NPC or lootable corpse) acts on it
    if (c.touch && o && (o === u.target || o.kind === 'npc' || (o.dead && o.hostile && o.lootable))) c = { ...c, button: 2 };
    if (c.button === 0) { if (o) this.setTarget(o); else if (!c.shift) this.setTarget(null); }
    else if (c.button === 2) {
      if (!o) return;
      this.setTarget(o);
      const d = Math.hypot(o.pos.x - u.pos.x, o.pos.z - u.pos.z);
      if (o.dead && o.hostile) { if (d < 6) this.g.lootCorpse?.(o); else bus.emit('error', { unit: u, msg: 'You are too far away' }); return; }
      if (u.isEnemy(o)) { this.startAttack(); return; }
      if (o.kind === 'npc' || o.kind === 'sim') { if (d < 7) this.g.interact?.(o); else bus.emit('error', { unit: u, msg: 'You are too far away' }); }
    }
  }
}
