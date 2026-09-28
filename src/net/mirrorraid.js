// A guest's view of the raid. The host runs the real RaidState (director, dragon, SimPlayers, hazards); this builds
// the same lair (it is deterministic from the day's seed), holds the mirrored units, and exposes the fields the HUD,
// minimap and camera read from a raid: raiders, boss, leader, state, meter and the player's controller.
import { Lair } from '../world/lair.js';
import { Sim } from '../game/sim.js';
import { Combat } from '../game/combat.js';
import { PlayerController } from '../game/player.js';
import { createModel } from '../models/factory.js';
import { bus } from '../game/events.js';

export class MirrorRaid {
  constructor(app, dragon, session) {
    const p = this.player = app.game.player;
    this.e = app; this.dragon = dragon; this.session = session; this.mirror = true;
    this.input = app.input; this.cam = app.cam; this.camera = app.camera; this.settings = app.game.settings;
    this.lair = new Lair(dragon.element, dragon.seed); this.scene = this.lair.scene; this.world = this.lair;
    this.sim = new Sim(this.lair); this.combat = new Combat(this.sim);
    this.hazards = { list: [] };  // telegraphs arrive as effects; the minimap shows units only
    this.raiders = [p]; this.whelps = []; this.leader = null;
    this.boss = { name: dragon.name, pos: this.lair.spots.dragonSleep.clone(), dead: false, target: null, hpPct: 1, facing: Math.PI, height: 7, stateAnim: {}, brain: { phase: 0, altitude: 0 } };
    this.state = 'prepull'; this.totalT = 0; this.fightStart = 0; this.result = null; this.attempt = 1;
    this.worldPos = p.pos.clone();
    this.scene.add(p.model.root); this.sim.add(p);
    p.meter = { dmg: 0, heal: 0, taken: 0, avoidable: 0 };
    p.raidRole = p.cls === 'priest' ? 'heal' : p.cls === 'warrior' ? 'melee' : 'ranged';
    const sp = this.lair.spots.raidSpawn;
    p.pos.set(sp.x, this.lair.heightAt(sp.x, sp.z), sp.z); p.facing = 0; p.dead = false;
    this.pc = new PlayerController(this, p); this.pc.setBar(app.game.pc.bar);
    session.hookCombat(this.combat); session.hookController(this.pc);
    this.offs = [
      bus.on('blink', e => { if (e.unit === p && e.$net) app.game.onBlink.call(this, e); }),
      bus.on('death', e => { if (e.unit === p && e.$net) bus.emit('player_died', { raid: true }); }),
    ];
  }
  useItem(id) { if (id === 'hearthstone') return bus.emit('error', { unit: this.player, msg: "You can't do that here" }); this.e.game.useItem(id); }
  interact(o) { if (o && (o.kind === 'sim' || o.kind === 'remote')) bus.emit('interact_sim', { unit: o }); }
  lootCorpse() {}
  addModel(u, spec) {
    u.model = createModel(spec);
    u.height = u.model.height || u.height; u.radius = u.model.radius ?? u.radius;
    this.scene.add(u.model.root);
    return u;
  }
  // raid-wide state from the host's snapshots (see HostSession.raidState)
  applyRaid(rs, s) {
    if (rs.st) this.state = rs.st;
    if (rs.att) this.attempt = rs.att;
    if (rs.dur !== undefined) this.fightStart = this.totalT - rs.dur;
    if (rs.bo) { const b = s.resolve(rs.bo); if (b) this.boss = b; }
    this.boss.brain = { phase: rs.ph || 0, altitude: this.boss.altitude || 0 }; // what the director camera reads
    if (rs.le) this.leader = s.resolve(rs.le) || null;
    if (rs.ro) this.raiders = rs.ro.map(([id, role]) => { const u = s.resolve(id); if (u) { u.raidRole = role; u.meter ||= { dmg: 0, heal: 0 }; } return u; }).filter(Boolean);
    if (rs.mt) for (const [id, dmg, heal] of rs.mt) { const u = s.resolve(id); if (u) { u.meter ||= { dmg: 0, heal: 0 }; u.meter.dmg = dmg; u.meter.heal = heal; } }
    this.whelps = [...s.units.values()].filter(u => u.kind === 'mob');
  }
  update(dt) {
    this.totalT += dt;
    const p = this.player;
    if (p.dash) { // a knockback or charge the host sent
      const d = p.dash; d.t += dt; const k = Math.min(1, d.t / d.dur);
      p.pos.x = d.from.x + (d.to.x - d.from.x) * k; p.pos.z = d.from.z + (d.to.z - d.from.z) * k;
      p.pos.y = this.lair.heightAt(p.pos.x, p.pos.z) + (d.knock ? Math.sin(k * Math.PI) * 2 : 0);
      if (k >= 1) p.dash = null;
      this.input.consumeDrag();
    } else this.pc.update(dt);
    for (const u of this.sim.units) {
      const m = u.model; if (!m) continue;
      m.root.position.copy(u.pos);
      let df = u.facing - m.root.rotation.y; df = Math.atan2(Math.sin(df), Math.cos(df));
      m.root.rotation.y += df * Math.min(1, dt * (u === this.boss ? 5 : 14));
      const s = u.stateAnim; s.dead = u.dead;
      s.casting = u.casting ? (u.casting.channel ? 'channel' : (u.casting.spell?.anim === 'castOmni' ? 'omni' : 'directed')) : null;
      m.update(dt, s);
    }
    this.lair.update(dt, this.camera);
  }
  dispose() { for (const off of this.offs) off(); this.offs = []; }
}
