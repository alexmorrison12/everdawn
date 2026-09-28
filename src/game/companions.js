// Mounts and pets. A mount is a model under the rider (who switches to a riding pose, lifted onto the saddle) plus a
// speed bonus; friends see each other's mounts (host.js/guest.js pass the mount type along). The Emberling is a little
// whelp that flutters after you; it's only on your own screen.
import * as THREE from 'three';
import { createModel } from '../models/factory.js';
import { bus } from './events.js';

export const MOUNTS = {
  strider: { name: 'Ashen Strider', spec: ['creature', 'deer', { variant: 'buck' }], height: 2.25, seat: 1.28, fwd: 0.05, speed: 1.6 },
  drake: { name: 'Ember Drake', spec: ['dragon', { element: 'ember', variant: 'whelp' }], height: 2.2, seat: 1.45, fwd: 0.2, speed: 2.0 },
};
export const MOUNT_CODE = { strider: 1, drake: 2 };
/** Scale a model to a height by its real bounding box (a model's own `height` is not always its visible size). */
function fitHeight(m, h) { const b = new THREE.Box3().setFromObject(m.root), y = b.max.y - b.min.y; if (y > 0.01) m.root.scale.multiplyScalar(h / y); }
export const MOUNT_BY_CODE = { 1: 'strider', 2: 'drake' };

export class Companions {
  constructor(app) {
    this.app = app;
    this.riders = new Map(); // unit → { type, model }
    this.pet = null;
  }
  get game() { return this.app.game; }
  get me() { return this.game.player; }
  scene() { return this.app.mode === 'raid' ? this.app.raid?.scene : this.app.world.scene; }

  /** Use a mount item: summon it (1.5 s), or get off if you're already riding. */
  toggleMount(type) {
    const p = this.me; if (!p || !MOUNTS[type]) return;
    if (p.mount) { this.dismount(p); return; }
    const err = msg => bus.emit('error', { unit: p, msg });
    if (this.app.mode === 'raid') return err("You can't mount here");
    if (p.inCombat) return err("You can't mount while in combat");
    if (p.swimming) return err("You can't mount while swimming");
    if (p.casting) return err('Another action is in progress');
    p.casting = { id: 'mount', spell: { name: MOUNTS[type].name, icon: type === 'drake' ? 'drakeReins' : 'mount' }, t: 0, dur: 1.5, target: p, channel: false, custom: () => this.setMount(p, type) };
    bus.emit('cast_start', { unit: p, spell: p.casting.spell, id: 'mount', dur: 1.5 });
  }
  dismount(u) { this.setMount(u, null); }
  /** Put a unit on a mount (or take it off): its own player, or a friend / host as reported by the network. */
  setMount(u, type) {
    const cur = this.riders.get(u);
    if ((cur?.type || null) === (type || null)) return;
    if (cur) { cur.model.root.parent?.remove(cur.model.root); cur.model.dispose?.(); this.riders.delete(u); }
    u.mount = type || null;
    if (u.stateAnim) u.stateAnim.ride = !!type;
    if (!type) { if (u === this.me) bus.emit('mount_changed', { unit: u, mount: null }); return; }
    const d = MOUNTS[type], m = createModel(d.spec);
    fitHeight(m, d.height);
    this.scene()?.add(m.root);
    this.riders.set(u, { type, model: m });
    if (u === this.me) { bus.emit('mount_changed', { unit: u, mount: type }); bus.emit('sound', { name: 'wingFlap', pos: u.pos }); }
  }

  /** Summon or dismiss the Emberling. */
  togglePet() {
    const p = this.me; if (!p) return;
    if (this.pet) { this.pet.model.root.parent?.remove(this.pet.model.root); this.pet = null; return; }
    const m = createModel(['dragon', { element: 'ember', variant: 'whelp', seed: 77 }]);
    fitHeight(m, 0.5);
    const pos = p.pos.clone().add(new THREE.Vector3(1.5, 1.2, 1.5));
    this.scene()?.add(m.root);
    this.pet = { model: m, pos, facing: p.facing, t: 0 };
    bus.emit('fx', { name: 'spawnPuff', pos: pos.clone() });
  }

  update(dt) {
    const me = this.me;
    // riders: the mount stands where the rider is, facing where they face; speed drives its legs
    for (const [u, r] of this.riders) {
      if (!u.model || (u !== me && u.dead) || !this.visible(u)) { if (u === me && (u.dead || u.swimming)) this.dismount(u); r.model.root.visible = false; continue; }
      const d = MOUNTS[r.type], root = r.model.root;
      if (root.parent !== this.scene()) this.scene()?.add(root);
      root.visible = u.model.root.visible;
      root.position.copy(u.pos);
      let df = u.facing - root.rotation.y; df = Math.atan2(Math.sin(df), Math.cos(df)); root.rotation.y += df * Math.min(1, dt * 12);
      const a = u.stateAnim || {};
      r.model.update(dt, { speed: Math.hypot(a.speed || 0, a.strafe || 0), turn: a.turn || 0, grounded: a.grounded !== false, vy: a.vy || 0, swimming: false, flying: false, combat: false });
    }
    if (me?.mount && (me.dead || me.ghost)) this.dismount(me);
    // the pet flutters a couple of metres behind you
    const pt = this.pet;
    if (pt && me) {
      pt.t += dt;
      const bx = me.pos.x + Math.sin(me.facing) * 2.2 + Math.cos(me.facing) * 1.6, bz = me.pos.z + Math.cos(me.facing) * 2.2 - Math.sin(me.facing) * 1.6;
      const gy = (this.app.mode === 'raid' ? this.app.raid.lair : this.app.world).heightAt(bx, bz);
      const ty = Math.max(gy, me.pos.y) + 1.3 + Math.sin(pt.t * 3) * 0.12 + (me.mount ? 1 : 0);
      const dx = bx - pt.pos.x, dz = bz - pt.pos.z, d = Math.hypot(dx, dz);
      if (d > 40) pt.pos.set(bx, ty, bz);
      const k = 1 - Math.exp(-dt * (d > 4 ? 4 : 2.2));
      pt.pos.x += dx * k; pt.pos.z += dz * k; pt.pos.y += (ty - pt.pos.y) * Math.min(1, dt * 3);
      if (d > 0.3) pt.facing = Math.atan2(-dx, -dz);
      const root = pt.model.root; if (root.parent !== this.scene()) this.scene()?.add(root);
      root.position.copy(pt.pos); root.rotation.y = pt.facing;
      pt.model.update(dt, { speed: d > 0.4 ? 4 : 0, flying: true, altitude: 1.3, grounded: false });
    }
  }
  visible(u) { return this.game.sim.units.includes(u) || this.app.raid?.sim?.units.includes(u) || u === this.me; }
  /** Leaving a scene (the raid): mounts and pets come along to the new one. */
  reparent() { for (const r of this.riders.values()) this.scene()?.add(r.model.root); if (this.pet) this.scene()?.add(this.pet.model.root); }
  clear(u) { if (u) this.dismount(u); }
}
