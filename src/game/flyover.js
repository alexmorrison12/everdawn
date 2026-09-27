// Foreshadowing: every few minutes today's dragon sweeps over Everdawn Vale, roars, and the realm loses its mind.
import * as THREE from 'three';
import { createModel } from '../models/factory.js';
import { bus } from './events.js';

const PATHS = [
  [[-420, 150, -300], [-200, 95, -120], [0, 70, 60], [180, 90, 160], [420, 140, 120]],
  [[400, 160, -250], [150, 90, -60], [-20, 65, 120], [-220, 95, 180], [-430, 150, 60]],
  [[0, 230, -470], [0, 120, -300], [30, 70, -60], [0, 80, 180], [-60, 160, 420]],
];

export class Flyover {
  constructor(game, dragon) {
    this.g = game; this.dragon = dragon;
    this.t = -1; this.next = 75 + Math.random() * 40; // first pass shortly after you arrive
    this.model = null; this.curve = null; this.dur = 22; this.roared = false;
  }
  ensureModel() {
    if (this.model) return;
    this.model = createModel(['dragon', { element: this.dragon.element, seed: this.dragon.seed, variant: 'boss' }]);
    this.model.root.visible = false;
    this.g.scene.add(this.model.root);
  }
  start() {
    this.ensureModel();
    const pts = PATHS[Math.floor(Math.random() * PATHS.length)].map(p => new THREE.Vector3(...p));
    this.curve = new THREE.CatmullRomCurve3(pts, false, 'centripetal');
    this.t = 0; this.roared = false; this.model.root.visible = true;
    bus.emit('sound', { name: 'wingFlap', vol: 0.8 });
  }
  update(dt) {
    if (this.t < 0) {
      this.next -= dt;
      if (this.next <= 0 && this.g.e.mode === 'world') { this.start(); this.next = 300 + Math.random() * 240; }
      return;
    }
    this.t += dt;
    const u = Math.min(1, this.t / this.dur);
    const p = this.curve.getPoint(u), ahead = this.curve.getPoint(Math.min(1, u + 0.01));
    const m = this.model;
    m.root.position.copy(p);
    m.root.rotation.y = Math.atan2(-(ahead.x - p.x), -(ahead.z - p.z));
    m.update(dt, { speed: 14, flying: true, altitude: p.y, grounded: false, combat: false });
    // roar when closest to the player
    const pl = this.g.player.pos, d = p.distanceTo(pl);
    if (!this.roared && (d < 140 || u > 0.5)) {
      this.roared = true;
      m.play?.('roar');
      bus.emit('sound', { name: 'dragonRoar', vol: 1.4 });
      bus.emit('shake', { amount: 0.8 });
      bus.emit('say', { unit: { name: this.dragon.name, pos: p }, text: 'Crawl, little things. Tonight I will be waiting.', yell: true });
      const soc = this.g.social, rng = soc.rng;
      const lines = ['DID YOU SEE THAT', 'DRAGON!!!', 'omg its awake', 'raid tonight boys', 'is that todays dragon??', `${this.dragon.name} flying over the lake!`, 'it looked at me', 'screenshot!!', 'nope. logging off', 'the maw is open'];
      for (let i = 0; i < 5; i++) soc.later(1.2 + i * 1.1 + rng.next(), () => soc.post(rng.next() < 0.7 ? 'general' : 'localdefense', soc.sims[Math.floor(rng.next() * soc.sims.length)], lines[Math.floor(rng.next() * lines.length)]));
      for (const s of this.g.sim.query(pl, 60)) if (s.kind === 'sim' && !s.dead && !s.inCombat) { s.facing = Math.atan2(-(p.x - s.pos.x), -(p.z - s.pos.z)); s.model?.play?.(rng.next() < 0.5 ? 'point' : 'cheer'); }
    }
    if (u >= 1) { this.t = -1; m.root.visible = false; }
  }
}
