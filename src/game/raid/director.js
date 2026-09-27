// Raid night: builds the Ember Maw instance, the 10-man raid from the realm's SimPlayers, runs the pre-pull theatre
// (raid leader briefing, ready check, pull timer, the occasional early pull), the fight, wipes, the kill and loot.
import * as THREE from 'three';
import { Unit } from '../unit.js';
import { Sim } from '../sim.js';
import { Combat } from '../combat.js';
import { PlayerController } from '../player.js';
import { MobBrain } from '../ai/mob.js';
import { DragonBrain } from './boss.js';
import { RaidBrain } from './raidai.js';
import { Hazards } from './hazards.js';
import { AFFIXES, HAZARD_NAMES } from './daily.js';
import { Lair, ELEMENTS } from '../../world/lair.js';
import { createModel } from '../../models/factory.js';
import { makeGear } from '../items.js';
import { bus } from '../events.js';
import { RNG } from '../../core/noise.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const pick = (rng, a) => a[Math.floor(rng.next() * a.length)];

export class RaidState {
  constructor(engine, { dragon, player, social, world, watch = false, guests = [] }) {
    this.e = engine; this.dragon = dragon; this.player = player; this.social = social; this.worldGame = world;
    this.guests = guests; // friends' avatars (kind 'remote'): real raiders whose own browsers steer them
    this.watch = watch; // Watch mode: the player's slot is played by the raid AI and nobody is asked anything
    this.input = engine.input; this.cam = engine.cam; this.camera = engine.camera; this.settings = world?.settings || { sens: 1 };
    this.rng = new RNG(dragon.seed + (Date.now() % 1000));
    this.attempt = 1; this.state = 'building'; this.scriptT = 0; this.script = [];
    this.whelps = []; this.raiders = []; this.totalT = 0;
    this.offs = [];
  }

  // ------------------------------------------------------------ build
  build() {
    const E = this.dragon.element;
    this.lair = new Lair(E, this.dragon.seed);
    this.scene = this.lair.scene;
    this.world = this.lair; // Sim expects heightAt + colliders
    this.sim = new Sim(this.lair);
    this.combat = new Combat(this.sim);
    this.hazards = new Hazards(this);
    // boss
    const hpMul = this.dragon.affix === 'tyrannical' ? 1.25 : 1;
    const b = this.boss = new Unit({ name: this.dragon.name, kind: 'boss', hostile: true, level: 12, boss: true, elite: true, pos: this.lair.spots.dragonSleep.clone(), hp: Math.round(55000 * hpMul), dmgMin: 38, dmgMax: 52, swing: 2.0, armor: 900, radius: 5.5 });
    b.title = this.dragon.title; b.facing = Math.PI; b.base.crit = 5; b.recalc(); b.hp = b.hpMax;
    b.model = createModel(['dragon', { element: E, seed: this.dragon.seed, variant: 'boss' }]);
    b.height = Math.max(6, b.model.height || 6); b.radius = 5.5;
    this.scene.add(b.model.root);
    b.brain = new DragonBrain(b, this, this.dragon);
    this.sim.add(b);
    // player joins
    const p = this.player;
    this.worldPos = p.pos.clone();
    this.scene.add(p.model.root);
    this.sim.add(p);
    p.meter = { dmg: 0, heal: 0, taken: 0, avoidable: 0 };
    this.pc = new PlayerController(this, p);
    const CL = this.worldGame?.pc?.bar || [];
    this.pc.setBar(CL.length ? CL : []);
    for (const u of this.guests) { this.scene.add(u.model.root); this.sim.add(u); u.meter = { dmg: 0, heal: 0, taken: 0, avoidable: 0 }; u.dead = false; u.hp = u.hpMax; u.target = null; u.autoAttack = false; }
    this.buildRoster();
    this.resetPositions();
    this.onBus();
    this.state = 'prepull';
    this.prepull();
  }

  buildRoster() {
    const rng = this.rng, soc = this.social, p = this.player;
    const pool = [...(soc.party?.members || []).filter(m => m.kind === 'sim'), ...soc.sims.filter(s => soc.guild && s.guild === soc.guild), ...rng.shuffle([...soc.sims])];
    const uniq = []; for (const s of pool) if (!uniq.includes(s) && s.persona.arch !== 'afk') uniq.push(s);
    const take = pred => { const i = uniq.findIndex(pred); return i >= 0 ? uniq.splice(i, 1)[0] : null; };
    const need = [
      ['mt', s => s.cls === 'warrior' && s.persona.skill > 0.6], ['ot', s => s.cls === 'paladin' || s.cls === 'warrior'],
      ['heal', s => s.cls === 'priest'], ['heal', s => s.cls === 'priest' || s.cls === 'paladin'],
      ['melee', s => s.cls === 'rogue' || s.cls === 'warrior'], ['melee', s => s.cls === 'rogue' || s.cls === 'warrior' || s.cls === 'paladin'],
      ['ranged', s => s.cls === 'mage'], ['ranged', s => s.cls === 'hunter'], ['ranged', s => s.cls === 'mage' || s.cls === 'hunter'], ['ranged', s => true],
    ];
    need.pop(); // the player takes the last slot; a priest joins as a third healer so a new human healer can't wipe the raid alone
    for (let i = 0; i < this.guests.length; i++) { // friends replace SimPlayer damage dealers
      const roles = need.map(n => n[0]); let k = roles.lastIndexOf('ranged'); if (k < 0) k = roles.lastIndexOf('melee');
      if (k >= 0) need.splice(k, 1);
    }
    this.leader = null;
    let slot = 0;
    for (const [role, pred] of need) {
      const src = take(pred) || take(() => true);
      if (!src) continue;
      const u = new Unit({ name: src.name, kind: 'sim', hostile: false, level: 10, cls: src.cls, race: src.race, sex: src.sex, guild: src.guild, pos: V(0, 0, 38) });
      u.persona = src.persona; u.gearTier = Math.max(2, src.gearTier); u.srcSim = src;
      soc.statsFor(u, u.cls === 'hunter' ? 'hunter' : ['mage', 'priest'].includes(u.cls) ? u.cls : 'warrior');
      u.base.hp *= role === 'mt' || role === 'ot' ? 2.3 : 1.35; u.base.armor *= role === 'mt' ? 3.2 : 1.4; u.base.sp *= 1.6; u.base.ap *= 1.5; u.recalc(); u.hp = u.hpMax;
      if (role === 'heal') { u.cls = src.cls === 'paladin' ? 'paladin' : 'priest'; u.powerType = 'mana'; u.base.mana *= 3; u.recalc(); u.power = u.powerMax; }
      u.model = createModel(['humanoid', { race: u.race, sex: u.sex, cls: u.cls, gearTier: u.gearTier, seed: src.id * 97 }]);
      u.height = u.model.height || 1.9;
      this.scene.add(u.model.root);
      u.brain = new RaidBrain(u, this, role, slot++);
      this.sim.add(u);
      this.raiders.push(u);
      if (role === 'mt') this.leader = u;
    }
    p.raidRole = p.cls === 'priest' ? 'heal' : p.cls === 'warrior' ? 'melee' : 'ranged';
    this.raiders.push(p);
    for (const u of this.guests) { u.raidRole = u.cls === 'priest' ? 'heal' : u.cls === 'warrior' ? 'melee' : 'ranged'; this.raiders.push(u); }
    this.leeroy = this.raiders.find(m => m !== p && m.persona?.arch === 'leeroy');
    bus.emit('raid_roster', { raiders: this.raiders });
  }

  resetPositions() {
    const sp = this.lair.spots.raidSpawn;
    this.raiders.forEach((m, i) => {
      const a = i * 0.63, rr = 2 + (i % 3) * 1.8;
      m.pos.set(sp.x + Math.cos(a) * rr, 0, sp.z + Math.sin(a) * rr - 2); m.pos.y = this.lair.heightAt(m.pos.x, m.pos.z);
      m.facing = 0; m.dead = false; m.hp = m.hpMax; if (m.powerType === 'mana') m.power = m.powerMax; if (m.powerType === 'rage') m.power = 0;
      m.auras = []; m.cooldowns.clear(); m.casting = null; m.target = null; m.autoAttack = false; m.inCombat = false; m.threat.clear(); m.dash = null;
      m.stateAnim.dead = false; m.model?.revive?.();
    });
    const b = this.boss;
    b.pos.copy(this.lair.spots.dragonSleep); b.facing = Math.PI; b.hp = b.hpMax; b.dead = false; b.auras = []; b.threat.clear(); b.casting = null; b.target = null; b.inCombat = false; b.autoAttack = false;
    b.brain = new DragonBrain(b, this, this.dragon); b.model?.revive?.();
    for (const w of this.whelps) this.sim.remove(w);
    this.whelps = [];
    this.hazards.clear();
    for (const m of this.raiders) m.meter = { dmg: 0, heal: 0, taken: 0, avoidable: 0, avoidHits: 0 };
    this.cam._first = true;
    this.player.facing = 0; this.cam.yaw = 0;
    if (this.guests.length) this.e.net?.raidReset?.();
  }

  onBus() {
    const on = (t, f) => this.offs.push(bus.on(t, f));
    on('death', e => this.onDeath(e));
    on('charge', e => { if (this.sim.units.includes(e.unit)) { const u = e.unit, t = e.target; const d = V(t.pos.x - u.pos.x, 0, t.pos.z - u.pos.z); const L = d.length(); d.normalize(); u.dash = { from: u.pos.clone(), to: V(t.pos.x - d.x * (t.radius + 1.2), 0, t.pos.z - d.z * (t.radius + 1.2)), t: 0, dur: Math.min(0.6, L / 32) }; } });
    on('blink', e => { if (e.unit === this.player) this.worldGame?.onBlink.call(this, e); });
    on('spell_go', e => { if (this.sim.units.includes(e.unit)) e.unit.model?.play?.(e.spell.anim || 'castDirected'); });
    on('swing', e => { if (this.sim.units.includes(e.unit)) e.unit.model?.play?.(e.unit === this.boss ? 'bite' : e.unit.cls === 'warrior' ? 'attack2h' : 'attack1h'); });
  }
  dispose() { for (const off of this.offs) off(); this.offs = []; this.hazards.clear(); }

  say(u, text, ch = 'raid') { this.social.post(ch, u, text); }
  useItem(id) { if (id === 'hearthstone') return bus.emit('error', { unit: this.player, msg: "You can't do that here" }); this.worldGame.useItem(id); }
  interact() {}
  lootCorpse() {}
  at(t, fn) { this.script.push({ t: this.scriptT + t, fn }); }

  // ------------------------------------------------------------ pre-pull theatre
  prepull() {
    const L = this.leader, rng = this.rng, H = HAZARD_NAMES[this.dragon.element], d = this.dragon;
    const others = () => pick(rng, this.raiders.filter(m => m.kind === 'sim' && m !== L)); // SimPlayers only: never put words in a friend's mouth
    this.scriptT = 0; this.script = [];
    bus.emit('zone_text', { title: 'The Ember Maw', sub: `${d.name}, ${d.title}` });
    bus.emit('raid_state', { state: 'prepull', attempt: this.attempt });
    const tips = {
      ember: 'lava bombs = orange circles. MOVE OUT. the puddles burn', frost: 'ice shards leave slow patches, dont get stuck in them',
      venom: 'toxic spit leaves poison, dont stand in green', storm: 'if u get STATIC CHARGE run away from everyone for 5 sec', shadow: 'void zones GROW, get out early not late',
    };
    if (this.attempt === 1) {
      this.at(1.5, () => this.say(L, 'ok everyone gather up at the entrance'));
      this.at(4.5, () => this.say(L, `${d.name} tonight, ${ELEMENTS[d.element].name.toLowerCase()} version. affix is ${AFFIXES[d.affix].name.toLowerCase()} - ${AFFIXES[d.affix].desc.toLowerCase()}`));
      this.at(8.5, () => this.say(L, 'i tank her facing south, OT picks up whelps in p2'));
      this.at(12, () => this.say(L, 'everyone else on the SIDES. never in front (breath) never behind (tail)'));
      this.at(15.5, () => this.say(L, tips[d.element]));
      this.at(19, () => this.say(L, 'p2 she flies. DEEP BREATH = get out of the line. melee kill whelps'));
      this.at(22, () => this.say(L, 'p3 she lands and fears, heals be ready. berserk at 8 min'));
      this.at(24, () => this.say(others(), pick(rng, ['k', 'got it', 'ez', 'what if i stand in front', 'can i pull', 'brb 1 sec', 'lets gooo', 'rdy'])));
      this.at(25.5, () => this.say(others(), pick(rng, ['no', 'lol', 'dont', 'focus pls', 'kk'])));
      this.at(27, () => this.readyCheck());
    } else {
      const wipeLines = ['ok again', 'run back', 'focus this time pls', `stop standing in ${H.pool === 'firePool' ? 'fire' : 'the puddles'}`, 'we had her', 'rez up, rebuff', 'that was a good try'];
      this.at(1.5, () => this.say(L, pick(rng, wipeLines)));
      this.at(3.5, () => this.say(others(), pick(rng, ['sry that was me', 'lag', 'my bad', 'who died first lol', 'wasnt me', 'healers?', 'i was afk for p2 sorry'])));
      this.at(6, () => this.readyCheck());
    }
  }

  readyCheck() {
    if (this.state === 'combat' || this.state === 'victory') return;
    this.playerReady = undefined;
    bus.emit('sound', { name: 'readyCheck' });
    this.say(this.leader, 'ready check', 'raid');
    this.state = 'readycheck';
    const notReady = this.raiders.filter(m => m.kind === 'sim' && (m.persona?.arch === 'afk' || this.rng.next() < 0.06)).slice(0, 1);
    const attempt = this.attempt;
    const stale = () => this.state !== 'readycheck' || this.attempt !== attempt;
    if (this.watch) { this.readyDeadline = this.scriptT + 25; this.at(2, () => { if (!stale()) { this.playerReady = true; this.afterReady(notReady); } }); return; }
    bus.emit('popup', { kind: 'readycheck', from: this.leader.name, text: `${this.leader.name} has initiated a ready check.`, timeout: 25,
      onAccept: () => { if (stale()) return; this.playerReady = true; this.afterReady(notReady); },
      onDecline: () => { if (stale()) return; this.playerReady = false; this.say(this.leader, 'np tell me when'); this.at(8, () => { if (this.state === 'readycheck' && this.attempt === attempt) this.readyCheck(); }); } });
    this.readyDeadline = this.scriptT + 25;
  }
  afterReady(notReady) {
    if (this.state !== 'readycheck') return;
    this.state = 'countdown';
    const L = this.leader;
    if (notReady.length && this.attempt > 0) {
      const s = notReady[0];
      this.social.post('system', null, `${s.name} is not ready.`);
      this.at(2, () => this.say(s, pick(this.rng, ['sry 1 sec', 'brb pee', 'getting drink', 'k now'])));
      this.at(6, () => this.pullTimer());
    } else this.at(1, () => this.pullTimer());
  }
  pullTimer() {
    this.say(this.leader, 'pulling in 10');
    bus.emit('boss_timer', { id: 'pull', name: 'Pull', dur: 10, icon: 'charge', pull: true });
    for (let i = 5; i >= 1; i--) this.at(10 - i, () => { bus.emit('raid_warning', { text: `Pull in ${i}`, color: '#ffd040', small: true }); bus.emit('sound', { name: 'pullTick' }); });
    // the infamous early pull
    const leeroy = this.leeroy && this.attempt === 1 && this.rng.next() < 0.6;
    if (leeroy) {
      this.at(6.2, () => { this.say(this.leeroy, 'LEEEEEROOOOOOY', 'yell'); bus.emit('bubble', { unit: this.leeroy, text: 'LEEEEEROOOOOOY!!' }); this.leeroyRun = true; });
      this.at(7.4, () => { this.pull(this.leeroy); this.say(this.leader, 'OMG'); });
      this.at(8.2, () => this.say(pick(this.rng, this.raiders.filter(m => m.kind === 'sim')), pick(this.rng, ['WTF', 'just go go go', 'every time', 'at least he has chicken', 'GO GO GO'])));
    } else this.at(10, () => this.pull(this.leader));
  }
  pull(by) {
    if (this.state === 'combat') return;
    this.state = 'combat';
    bus.emit('popup_close', { kind: 'readycheck' });
    bus.emit('raid_warning', { text: 'GO!', color: '#40ff40', small: true });
    bus.emit('sound', { name: 'pullGo' });
    const b = this.boss;
    b.brain.wake();
    for (const m of this.raiders) { if (!m.dead) { this.combat.engage(m, b); b.threat.set(m, m.raidRole === 'mt' ? 800 : 1); } }
    if (by && by !== this.leader) b.threat.set(by, 900); // the early puller eats the first hits
    this.fightStart = this.totalT;
    bus.emit('raid_state', { state: 'combat', attempt: this.attempt });
    bus.emit('music', { name: 'raid' });
  }

  spawnWhelp(pos) {
    const w = new Unit({ name: `${this.dragon.name.split(/(?=[A-Z])/)[0]} Whelp`, kind: 'mob', hostile: true, level: 10, pos: V(pos.x, pos.y ?? 3.5, pos.z), hp: 170, dmgMin: 9, dmgMax: 14, swing: 1.6, armor: 200, radius: 0.9, moveSpeed: 8.5 });
    w.base.crit = 5; w.recalc(); w.hp = w.hpMax;
    w.model = createModel(['dragon', { element: this.dragon.element, variant: 'whelp', seed: w.id }]);
    w.height = w.model.height || 1.6;
    this.scene.add(w.model.root);
    w.brain = new MobBrain(w, { name: 'whelp', aggro: 60, abilities: [], family: 'dragonkin', leash: 999 }, this);
    const tgt = pick(this.rng, this.raiders.filter(m => !m.dead));
    if (tgt) { this.combat.engage(tgt, w); w.threat.set(tgt, 50); w.target = tgt; w.brain.state = 'combat'; }
    this.sim.add(w); this.whelps.push(w);
    bus.emit('fx', { name: 'whelpSpawn', pos: w.pos.clone() });
  }

  // ------------------------------------------------------------ events
  onDeath({ unit, killer }) {
    if (!this.sim.units.includes(unit)) return;
    if (unit === this.boss) return this.victory();
    if (unit.raidRole && unit !== this.player) {
      if (this.rng.next() < 0.5) this.combat.later(1 + this.rng.next() * 2, () => this.say(pick(this.rng, this.raiders.filter(m => !m.dead && m.kind === 'sim')) || unit, pick(this.rng, [`rip ${unit.name}`, 'heals??', `${unit.name} died lol`, 'someone died to mechanics', 'STOP STANDING IN IT', 'brez?', 'we dont have brez...'])));
      if (this.rng.next() < 0.3) this.combat.later(0.8, () => bus.emit('say', { unit: this.boss, text: pick(this.rng, ['Another for the pile.', 'Pathetic.', 'Next.']), yell: true }));
    }
    if (unit === this.player && !this.watch) { bus.emit('player_died', { raid: true }); }
  }

  checkWipe() {
    if (this.state !== 'combat') return;
    const alive = this.raiders.filter(m => !m.dead);
    const tanksDead = !alive.some(m => m.raidRole === 'mt' || m.raidRole === 'ot');
    if (alive.length === 0 || (alive.length <= 2 && this.boss.hpPct > 0.08) || (this.player.dead && tanksDead && alive.length <= 4)) this.wipe();
  }
  wipe() {
    this.state = 'wipe';
    bus.emit('raid_warning', { text: 'The raid has wiped.', color: '#ff4040' });
    bus.emit('raid_state', { state: 'wipe', attempt: this.attempt, bossPct: this.boss.hpPct });
    bus.emit('music', { name: 'wipe' });
    this.say(this.leader, pick(this.rng, ['wipe it', 'WIPE', 'ok wipe, run back', 'wipe wipe wipe']));
    this.combat.later(6, () => { this.attempt++; this.resetPositions(); this.state = 'prepull'; bus.emit('fade', { in: true }); this.prepull(); bus.emit('music', { name: 'danger' }); });
    bus.emit('fade', { out: true, dur: 5.5 });
  }
  victory() {
    if (this.state === 'victory') return;
    this.state = 'victory';
    const fightT = this.totalT - this.fightStart;
    this.hazards.clear();
    for (const w of this.whelps) if (!w.dead) this.combat.kill(w, this.player);
    bus.emit('say', { unit: this.boss, text: 'Impossible... the Maw... will... remember...', yell: true });
    bus.emit('raid_warning', { text: `${this.boss.name} has been defeated!`, color: '#ffd040', big: true });
    bus.emit('music', { name: 'victory' });
    bus.emit('shake', { amount: 2 });
    const rng = this.rng;
    this.combat.later(1.2, () => { for (const m of this.raiders.filter(x => x.kind === 'sim' && !x.dead)) { m.model?.play?.(rng.next() < 0.5 ? 'cheer' : 'dance'); } });
    const cheer = ['GG', 'GGGGG', 'LETS GOOOO', 'gg ez', 'finally', 'grats all', 'gz', 'first kill for me!!', 'ty for the carry', `gg ${this.player.name}`];
    for (let i = 0; i < 6; i++) this.combat.later(1.5 + i * 0.6 + rng.next(), () => this.say(pick(rng, this.raiders.filter(m => m.kind === 'sim')), pick(rng, cheer)));
    // loot
    const loot = [];
    const classes = [...new Set(this.raiders.map(m => m.cls))];
    const clsFor = () => rng.next() < 0.45 ? this.player.cls : pick(rng, classes.filter(c => ['warrior', 'mage', 'priest'].includes(c)).concat(['warrior', 'mage', 'priest']));
    for (let i = 0; i < 3; i++) loot.push(makeGear(rng, clsFor(), 14, 'epic', pick(rng, ['weapon', 'chest', 'shoulders', 'head', 'legs', 'hands'])));
    const mountRoll = rng.next() < 0.015;
    if (mountRoll) loot.push({ uid: 999999, mount: true, name: `Reins of the ${this.lair.E.name} Drake`, rarity: 'epic', icon: 'drakeReins', slot: 'mount' });
    const result = {
      dragon: this.dragon, killTime: fightT, attempts: this.attempt, totalTime: this.totalT,
      meter: this.raiders.map(m => ({ name: m.name, cls: m.cls, dmg: Math.round(m.meter.dmg), heal: Math.round(m.meter.heal), dead: m.dead, you: m === this.player, avoidable: Math.round(m.meter.avoidable || 0) })),
      player: { dps: this.player.meter.dmg / Math.max(1, fightT), hps: this.player.meter.heal / Math.max(1, fightT), dmg: this.player.meter.dmg, heal: this.player.meter.heal, avoidable: this.player.meter.avoidable || 0, avoidHits: this.player.meter.avoidHits || 0, died: this.player.dead, role: this.player.raidRole },
      loot,
    };
    this.result = result;
    if (this.watch) loot.forEach((it, i) => this.combat.later(4 + i * 1.6, () => this.resolveRoll(it, 'pass')));
    else this.combat.later(3.5, () => bus.emit('raid_loot', { items: loot, raid: this }));
    bus.emit('raid_state', { state: 'victory', result });
  }

  // loot roll resolution (player's choice: 'need' | 'greed' | 'pass')
  resolveRoll(item, choice) {
    const rng = this.rng, rolls = [];
    for (const m of this.raiders) {
      let kind;
      if (m === this.player) kind = choice;
      else if (m.kind === 'remote') kind = item.mount || item.cls === m.cls ? 'need' : 'greed'; // friends roll need on their own class's gear
      else {
        const useful = item.mount || item.cls === m.cls || (item.cls === 'priest' && m.cls === 'paladin');
        const greedy = m.persona?.arch === 'lootgoblin' || m.persona?.arch === 'troll';
        kind = useful ? 'need' : greedy && rng.next() < 0.5 ? 'need' : rng.next() < 0.6 ? 'greed' : 'pass';
      }
      if (kind === 'pass') continue;
      const roll = 1 + Math.floor(rng.next() * 100);
      rolls.push({ m, kind, roll });
      this.social.post('loot', null, `${m === this.player ? 'You' : m.name} ${kind === 'need' ? 'selected Need' : 'selected Greed'} for: [${item.name}] — ${roll}`, { links: [{ name: item.name, rarity: item.rarity, item }] });
    }
    const needs = rolls.filter(r => r.kind === 'need'), pool = needs.length ? needs : rolls;
    pool.sort((a, b) => b.roll - a.roll);
    const win = pool[0];
    if (!win) return null;
    this.social.post('loot', null, `${win.m === this.player ? 'You' : win.m.name} won: [${item.name}]`, { links: [{ name: item.name, rarity: item.rarity, item }] });
    if (win.m !== this.player && win.kind === 'need' && item.cls !== win.m.cls) this.combat.later(1.5, () => this.say(pick(rng, this.raiders.filter(x => x !== win.m && x.kind === 'sim')), pick(rng, ['NINJA', 'ninja looter!!', `${win.m.name} u cant even use that`, 'reported', 'wow'])));
    if (win.m === this.player) { if (item.mount) this.worldGame.hasMount = true; else this.worldGame.addGear(item); this.social.react('epic', 0.9); }
    if (win.m.kind === 'remote') this.e.net?.giveLoot?.(win.m, item);
    return win;
  }

  // ------------------------------------------------------------ frame
  update(dt) {
    this.totalT += dt; this.scriptT += dt;
    for (let i = this.script.length - 1; i >= 0; i--) if (this.script[i].t <= this.scriptT) { const s = this.script.splice(i, 1)[0]; s.fn(); }
    if (this.state === 'readycheck' && this.scriptT > this.readyDeadline && this.playerReady === undefined) { this.playerReady = true; this.afterReady([]); }
    const p = this.player;
    // dashes (charge / knockback)
    for (const u of this.sim.units) if (u.dash) {
      if (u.kind === 'remote') { this.e.net?.forceDash?.(u, u.dash); u.dash = null; continue; } // a friend plays their own knockback
      const d = u.dash; d.t += dt; const k = Math.min(1, d.t / d.dur);
      u.pos.x = d.from.x + (d.to.x - d.from.x) * k; u.pos.z = d.from.z + (d.to.z - d.from.z) * k; u.pos.y = this.lair.heightAt(u.pos.x, u.pos.z) + (d.knock ? Math.sin(k * Math.PI) * 2 : 0);
      if (k >= 1) u.dash = null;
    }
    if (!p.dash) this.pc.update(dt); else this.input.consumeDrag();
    if (this.leeroyRun && this.leeroy && !this.leeroy.dead && this.state !== 'combat') {
      const L = this.leeroy, d = Math.hypot(this.boss.pos.x - L.pos.x, this.boss.pos.z - L.pos.z);
      if (d > 8) { L.facing = Math.atan2(-(this.boss.pos.x - L.pos.x), -(this.boss.pos.z - L.pos.z)); this.sim.move(L, (this.boss.pos.x - L.pos.x) / d * 9 * dt, (this.boss.pos.z - L.pos.z) / d * 9 * dt, dt); L.stateAnim.speed = 9; }
    }
    for (const u of this.sim.units) if (u.brain && !u.dead && !(u === this.leeroy && this.leeroyRun && this.state !== 'combat')) u.brain.update(dt);
    // hold the dragon's position on the ground (no gravity while flying)
    const b = this.boss;
    b.pos.y = (b.brain.altitude || 0) + this.lair.heightAt(b.pos.x, b.pos.z) * (b.brain.altitude > 1 ? 0 : 1);
    this.combat.update(dt);
    this.hazards.update(dt);
    this.social.update(dt);
    this.checkWipe();
    // cleanup dead whelps
    for (let i = this.whelps.length - 1; i >= 0; i--) { const w = this.whelps[i]; if (w.dead) { w.deadT += 0; if (w.deadT > 6) { this.sim.remove(w); this.whelps.splice(i, 1); } } }
    // models
    for (const u of this.sim.units) {
      const m = u.model; if (!m) continue;
      m.root.position.copy(u.pos);
      let df = u.facing - m.root.rotation.y; df = Math.atan2(Math.sin(df), Math.cos(df));
      m.root.rotation.y += df * Math.min(1, dt * (u === b ? 5 : 14));
      const s = u.stateAnim; s.dead = u.dead;
      s.casting = u.casting ? (u.casting.channel ? 'channel' : (u.casting.spell?.anim === 'castOmni' ? 'omni' : 'directed')) : null;
      m.update(dt, s);
    }
    this.lair.update(dt, this.camera);
  }
}
