// Duels. Challenge another player (a SimPlayer, a co-op friend, or the host); if they accept, a flag goes up
// between you and three seconds later you are enemies to each other alone. The first to be beaten yields at 1
// health instead of dying; stray 50 m from the flag for 10 seconds and you forfeit. This runs where the realm runs
// (solo, or on the host): a friend's requests arrive from net/host.js as the same calls, and their browser learns
// about its duel from its snapshot (see HostSession.meState).
import * as THREE from 'three';
import { bus } from './events.js';
import { lambert } from '../engine/materials.js';
import { REACT } from './data/chat.js';

const RANGE = 30, BOUNDS = 50, FLEE_T = 10, COUNT = 3, ANNOUNCE = 100;
const isPlayerUnit = u => !!u && (u.kind === 'player' || u.kind === 'sim' || u.kind === 'remote');
const pick = a => a[Math.floor(Math.random() * a.length)];
const dist = (a, b) => Math.hypot(a.pos.x - b.pos.x, a.pos.z - b.pos.z);

export class Duels {
  constructor(game) {
    this.g = game; this.list = [];
    this.invites = new Map(); // challenged unit → { from, t }
    game.combat.duels = this;
  }
  get soc() { return this.g.social; }
  tell(u, text) { this.soc.tell(u, text); }
  alive(u) { return this.g.sim.units.includes(u); }

  challenge(from, to) {
    if (!from || !to) return;
    if (this.g.e?.mode === 'raid') return this.tell(from, "You can't duel here.");
    if (!isPlayerUnit(to) || to === from) return this.tell(from, 'Invalid target. Challenge another player.');
    if (from.duel) return this.tell(from, 'You are already in a duel.');
    if (to.duel) return this.tell(from, `${to.name} is already in a duel.`);
    if (from.dead || from.ghost) return this.tell(from, "You can't do that while dead.");
    if (to.dead || to.ghost) return this.tell(from, `${to.name} is dead.`);
    if (dist(from, to) > RANGE) return this.tell(from, `${to.name} is too far away.`);
    const inv = this.invites.get(to);
    if (inv && inv.from !== from) return this.tell(from, `${to.name} is considering another challenge.`);
    this.invites.set(to, { from, t: 30 });
    this.tell(from, `You have challenged ${to.name} to a duel.`);
    if (to.kind === 'sim') {
      this.soc.later(1.2 + Math.random() * 2, () => {
        if (this.invites.get(to)?.from !== from) return;
        const keen = { tryhard: 0.95, troll: 0.9, noob: 0.7 }[to.persona?.arch] ?? 0.6;
        if (!to.inCombat && !to.dead && !to.afk && Math.random() < keen) {
          this.soc.post('say', to, pick(['ok bring it', 'lets go', 'u sure?', 'ez', 'you asked for it']));
          bus.emit('bubble', { unit: to, text: 'lets go' });
          this.accept(to);
        } else { this.decline(to); this.soc.whisperTo(from, to, pick(['not now', 'nah im questing', 'maybe later', 'no ty', 'brb'])); }
      });
    } else if (to === this.g.player) bus.emit('popup', { kind: 'duel', from: from.name, onAccept: () => this.accept(to), onDecline: () => this.decline(to) });
    else if (to.kind === 'remote') this.g.e?.net?.duelInvite?.(to, from);
  }
  accept(to) {
    const inv = this.invites.get(to); if (!inv) return;
    this.invites.delete(to);
    const from = inv.from;
    if (from.duel || to.duel || from.dead || to.dead || !this.alive(from) || !this.alive(to)) { this.tell(to, 'That duel request has expired.'); return; }
    this.start(from, to);
  }
  decline(to) {
    const inv = this.invites.get(to); if (!inv) return;
    this.invites.delete(to);
    this.tell(inv.from, `${to.name} has declined your challenge.`);
  }

  start(a, b) {
    const x = (a.pos.x + b.pos.x) / 2, z = (a.pos.z + b.pos.z) / 2;
    const d = { a, b, x, z, t: COUNT, live: false, out: new Map(), flag: duelFlag(this.g.scene, x, this.g.world.heightAt(x, z), z) };
    a.duel = b.duel = d;
    this.list.push(d);
    for (const [u, o] of [[a, b], [b, a]]) {
      bus.emit('duel_state', { unit: u, op: 'count', n: COUNT, other: o });
      if (u.kind === 'sim') { u.brain?.set('duel'); u.target = null; u.autoAttack = false; this.g.combat.faceTarget(u, o); }
    }
  }
  update(dt) {
    for (const [u, inv] of this.invites) if ((inv.t -= dt) <= 0) this.invites.delete(u);
    for (const d of [...this.list]) {
      const { a, b } = d;
      d.flag.userData.spin = (d.flag.userData.spin || 0) + dt;
      d.flag.children[1].rotation.y = Math.sin(d.flag.userData.spin * 2.2) * 0.25;
      if (!this.alive(a) || !this.alive(b) || a.dead || b.dead || a.ghost || b.ghost) { this.end(d, null, 'interrupted'); continue; }
      if (!d.live) {
        const before = Math.ceil(d.t); d.t -= dt;
        if (d.t <= 0) {
          d.live = true; a.duelWith = b; b.duelWith = a;
          for (const [u, o] of [[a, b], [b, a]]) {
            bus.emit('duel_state', { unit: u, op: 'go', other: o });
            if (u.kind === 'sim') { u.target = o; this.g.combat.engage(u, o); }
          }
        } else if (Math.ceil(d.t) !== before) for (const u of [a, b]) bus.emit('duel_state', { unit: u, op: 'count', n: Math.ceil(d.t) });
        continue;
      }
      for (const u of [a, b]) {
        const far = Math.hypot(u.pos.x - d.x, u.pos.z - d.z) > BOUNDS, t = d.out.get(u);
        if (far && t === undefined) { d.out.set(u, FLEE_T); bus.emit('duel_state', { unit: u, op: 'out', n: FLEE_T }); }
        else if (far) { d.out.set(u, t - dt); if (t - dt <= 0) { this.end(d, u === a ? b : a, 'fled'); break; } }
        else if (t !== undefined) { d.out.delete(u); bus.emit('duel_state', { unit: u, op: 'back' }); }
      }
    }
  }
  /** Asked by Combat before a killing blow: a duelist beaten by their opponent yields at 1 health instead. */
  yields(dst, src) {
    const d = dst.duel;
    if (!d || !d.live || dst.duelWith !== src) return false;
    dst.hp = 1;
    this.end(d, src, 'won');
    return true;
  }
  forfeit(u) {
    const d = u?.duel; if (!d) return;
    this.end(d, d.live ? (u === d.a ? d.b : d.a) : null, d.live ? 'fled' : 'cancel');
  }
  end(d, winner, how = 'won') {
    const i = this.list.indexOf(d); if (i < 0) return;
    this.list.splice(i, 1);
    const { a, b } = d, loser = winner ? (winner === a ? b : a) : null;
    for (const [u, o] of [[a, b], [b, a]]) {
      u.duel = null; u.duelWith = null;
      if (u.target === o) u.autoAttack = false;
      if (u.casting && u.casting.target === o) this.g.combat.interrupt(u, 'Interrupted');
      u.threat?.delete(o);
      for (const au of [...u.auras]) if (au.src === o && au.def.debuff) u.removeAura(au.id); // WoW clears what the duel left on you
      if (![...(u.threat?.keys() || [])].some(m => m.hostile && !m.dead && m.inCombat)) { u.inCombat = false; u.combatT = 0; }
      if (u.kind === 'sim') { u.target = null; u.brain?.choose(); }
      bus.emit('duel_state', { unit: u, op: 'end', winner: winner?.name || null, how });
    }
    d.flag.parent?.remove(d.flag);
    const text = how === 'cancel' ? `The duel between ${a.name} and ${b.name} was called off.` : !winner ? `The duel between ${a.name} and ${b.name} has ended.`
      : how === 'fled' ? `${loser.name} has fled from ${winner.name} in a duel.` : `${winner.name} has defeated ${loser.name} in a duel.`;
    for (const u of [this.g.player, ...this.g.sim.units.filter(m => m.kind === 'remote')]) if (u && Math.hypot(u.pos.x - d.x, u.pos.z - d.z) < ANNOUNCE) this.tell(u, text);
    if (loser) {
      loser.model?.play?.('kneel');
      if (loser.kind === 'sim') this.soc.later(1.5, () => this.soc.post('say', loser, pick(REACT.duelLose)));
      if (winner.kind === 'sim') this.soc.later(2.2, () => { this.soc.post('say', winner, pick(REACT.duelWin)); winner.model?.play?.('cheer'); });
    }
  }
}

/** The banner planted between two duellists (also built by a friend's browser for their own duel). */
export function duelFlag(scene, x, y, z) {
  const root = new THREE.Group();
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.07, 3.4, 8), lambert({ color: 0x4a2e18 }));
  pole.position.y = 1.7;
  const cloth = new THREE.Group(); cloth.position.y = 2.75;
  const banner = new THREE.Mesh(new THREE.PlaneGeometry(1.15, 0.8), lambert({ color: 0xb01818, side: THREE.DoubleSide }));
  banner.position.x = 0.6;
  const trim = new THREE.Mesh(new THREE.PlaneGeometry(1.15, 0.12), lambert({ color: 0xe0b040, side: THREE.DoubleSide }));
  trim.position.set(0.6, -0.42, 0.001);
  cloth.add(banner, trim);
  const knob = new THREE.Mesh(new THREE.SphereGeometry(0.11, 10, 8), lambert({ color: 0xe0b040 }, { spec: 0.6, shine: 30 }));
  knob.position.y = 3.45;
  root.add(pole, cloth, knob);
  root.position.set(x, y, z);
  for (const m of [pole, banner, knob]) m.castShadow = true;
  scene.add(root);
  return root;
}
