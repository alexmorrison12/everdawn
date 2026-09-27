// Game orchestrator: world + simulation + player + quests + loot + progression. UI/FX/audio subscribe via the bus.
import * as THREE from 'three';
import { Unit } from './unit.js';
import { Sim } from './sim.js';
import { Combat } from './combat.js';
import { PlayerController } from './player.js';
import { MobBrain } from './ai/mob.js';
import { CritterBrain } from './ai/critter.js';
import { MOBS, mobStats } from './data/mobs.js';
import { CLASSES, xpToNext, mobXP, MAX_LEVEL } from './data/classes.js';
import { SPELLS } from './data/spells.js';
import { NPCS, QUESTS, QUEST } from './data/quests.js';
import { ITEMS, makeGear, SLOTS } from './items.js';
import { CAMPS, PLACES, WATER_Y } from '../world/zone.js';
import { createModel } from '../models/factory.js';
import { bus } from './events.js';
import { RNG } from '../core/noise.js';
import { G } from '../engine/materials.js';
import { Social } from './social.js';

const V3 = (x, y, z) => new THREE.Vector3(x, y, z);
export const fmtMoney = c => { const g = Math.floor(c / 10000), s = Math.floor(c / 100) % 100, cc = c % 100; return [g && `${g}g`, s && `${s}s`, (cc || (!g && !s)) && `${cc}c`].filter(Boolean).join(' '); };

export class GameState {
  constructor(engine) {
    this.e = engine;                  // { renderer, camera, input, world, cam, scene }
    this.world = engine.world; this.scene = engine.world.scene; this.camera = engine.camera; this.input = engine.input; this.cam = engine.cam;
    this.sim = new Sim(this.world);
    this.combat = new Combat(this.sim);
    this.rng = new RNG(Date.now() % 100000);
    this.spawnPoints = [];
    this.corpses = [];
    this.respawns = [];
    this.npcs = {};
    this.time = 0;
    this.settings = { sens: 1, invertY: false };
    this.social = new Social(this);
    bus.on('death', e => this.onDeath(e));
    bus.on('charge', e => this.onCharge(e));
    bus.on('blink', e => this.onBlink(e));
    // (events replayed from a host carry $net: their animations arrive separately as 'anim')
    bus.on('spell_go', e => { if (!e.$net) e.unit.model?.play?.(e.spell.anim || 'castDirected'); });
    bus.on('swing', e => { if (!e.$net) e.unit.model?.play?.(e.unit.cls === 'warrior' ? (Math.random() < 0.5 ? 'attack2h' : 'attack1h') : 'attack'); });
  }

  // ------------------------------------------------------------ units
  addModel(u, spec) {
    u.model = createModel(spec);
    animTap(u);
    u.height = u.model.height || u.height;
    u.radius = u.model.radius ?? u.radius;
    this.scene.add(u.model.root);
    this.syncModel(u, 0);
    return u;
  }

  levelStats(u) {
    const c = CLASSES[u.cls], L = u.level;
    u.base.hp = c.hpBase + c.hpPer * L;
    u.base.mana = c.manaBase + c.manaPer * L;
    u.base.crit = 6 + (u.cls === 'mage' ? 2 : 0);
    u.base.sp = u.cls === 'warrior' ? 0 : 2 + L * 2.2;
    u.base.ap = u.cls === 'warrior' ? 10 + L * 4 : L * 2;
    if (u.cls === 'warrior') { u.base.dmgMin = 5 + L * 3.2; u.base.dmgMax = 9 + L * 4.4; u.base.swing = 3.0; }
    else { u.base.dmgMin = 2 + L; u.base.dmgMax = 4 + L * 1.5; u.base.swing = 2.6; }
    u.base.armor = (u.cls === 'warrior' ? 60 : 20) + L * (u.cls === 'warrior' ? 22 : 8);
    this.applyGear(u);
  }

  applyGear(u) {
    const gs = { sta: 0, str: 0, agi: 0, int: 0, spi: 0, ap: 0, sp: 0, crit: 0, haste: 0, armor: 0, dmgMin: 0, dmgMax: 0 };
    for (const slot of SLOTS) {
      const it = u.equip?.[slot]; if (!it) continue;
      for (const k in it.stats) gs[k] = (gs[k] || 0) + it.stats[k];
      gs.armor += it.armor || 0;
      if (slot === 'weapon') { gs.dmgMin += it.dmgMin * 0.8; gs.dmgMax += it.dmgMax * 0.8; }
    }
    u.gearStats = gs;
    u.recalc();
  }

  hint(id, text) {
    this.hintsShown = this.hintsShown || new Set();
    if (this.hintsShown.has(id) || this.e.noHints) return;
    this.hintsShown.add(id);
    bus.emit('hint', { id, text });
  }
  createPlayer(ch) {
    const P = PLACES.village;
    const u = new Unit({ name: ch.name, kind: 'player', hostile: false, level: ch.level || 1, cls: ch.cls, race: ch.race, sex: ch.sex, pos: V3(P.x + 2, 0, P.z - 8) });
    u.appearance = ch.appearance || {};
    u.xp = ch.xp || 0; u.gold = ch.gold ?? 0;
    u.equip = {}; u.bags = []; u.quests = []; u.questsDone = new Set(ch.questsDone || []);
    for (const s of SLOTS) u.equip[s] = null;
    if (ch.equip) Object.assign(u.equip, ch.equip);
    else u.equip.weapon = makeGear(this.rng, u.cls, 1, 'common', 'weapon');
    this.levelStats(u);
    u.hp = u.hpMax; u.power = u.powerType === 'rage' ? 0 : u.powerMax;
    u.pos.y = this.world.heightAt(u.pos.x, u.pos.z);
    { const [mx, mz] = NPCS.dunmore.pos; u.facing = Math.atan2(-(mx - u.pos.x), -(mz - u.pos.z)); } // face the first quest giver
    { const tiers = SLOTS.map(s => u.equip[s]?.tier || 0).sort((a, b) => b - a); u.gearLook = Math.min(3, tiers[1] ?? 0); }
    this.addModel(u, ['humanoid', { race: u.race, sex: u.sex, cls: u.cls, ...u.appearance, gearTier: u.gearLook, seed: u.appearance?.seed ?? 7 }]);
    this.sim.add(u);
    this.player = u;
    this.pc = new PlayerController(this, u);
    this.pc.setBar(CLASSES[u.cls].bar.filter(id => SPELLS[id].learn <= u.level));
    if (!ch.bags) { this.addItem('hearthstone', 1); this.addItem(u.powerType === 'mana' ? 'water' : 'bread', 5); this.addItem('potionHealth', 2); }
    this.cam.yaw = u.facing; this.cam._first = true;
    if (ch.bags) u.bags = ch.bags.map(b => ({ ...b }));
    if (ch.quests) u.quests = ch.quests.map(q => ({ id: q.id, progress: [...q.progress] }));
    if (ch.pos) { u.pos.set(ch.pos[0], 0, ch.pos[1]); u.pos.y = this.world.heightAt(u.pos.x, u.pos.z); }
    u.played = ch.played || 0; u.created = ch.created || Date.now(); u.jump = !!ch.jump; u.speedrunDone = !!ch.speedrunDone;
    if (ch.guild) { this.social.guild = ch.guild; this.social.guildName = ch.guild; u.guild = ch.guild; }
    this.hasMount = !!ch.hasMount;
    this.refreshQuestMarkers();
    return u;
  }

  // "Jump to Raid": a fair, identical level-10 kit for everyone (blue quest gear), no leveling required
  refreshBar() { const u = this.player; this.pc.setBar(CLASSES[u.cls].bar.filter(id => SPELLS[id].learn <= u.level)); }
  premadeGear(cls) {
    const rng = new RNG('everdawn-premade-' + cls);
    const eq = {};
    for (const slot of SLOTS) eq[slot] = makeGear(rng, cls, 12, slot === 'weapon' || slot === 'chest' ? 'rare' : 'uncommon', slot);
    return eq;
  }

  // Called once when the player first appears in the Vale
  enterWorld(dragon) {
    const p = this.player;
    this.dragon = dragon;
    const say = (t, text) => this.social.later(t, () => bus.emit('chat', { ch: 'system', text }));
    say(0.2, 'Welcome to Lastlight. Population: FULL (2,847). Humans online: 1.');
    say(0.4, `Message of the Day: The Ember Maw is open. Tonight's dragon: ${dragon.name}, ${dragon.title}.`);
    bus.emit('zone_text', { title: 'Dawnhollow', sub: 'Everdawn Vale' });
    this.social.later(2.5, () => this.hint('move', this.input.touch ? 'Drag on the left side to move and anywhere else to look around. Tap to target; tap again to talk, loot or attack.' : 'Use W A S D to move. Hold the right mouse button and drag to steer the camera.'));
    // on claude.ai the SimPlayers can answer in their own words (voices.js): say so once, after the first minute
    this.social.later(60, () => { if (this.social.voices.sample && !this.social.voices.off && !this.input.touch) this.hint('voices', 'Psst. The players here talk back. Click a name in chat (or type /w name) to whisper one.'); });
    this.social.later(7, () => { if (!p.quests.length && !p.questsDone.size) this.hint('talk', `Marshal Dunmore has a quest for you. ${this.input.touch ? 'Tap' : 'Right-click'} him (the yellow ! ) to talk.`); });
    this.lastArea = 'Dawnhollow';
  }
  onFirstCombat() {
    const bar = CLASSES[this.player.cls].bar;
    const warrior = this.player?.cls === 'warrior';
    this.hint('combat', this.input.touch
      ? (warrior ? `Tap an enemy, then tap it again to attack. Your swings build rage for ${SPELLS[bar[0]].name}.` : `Tap ${SPELLS[bar[0]].name} on your action bar. Tap an enemy to target it, tap it again to attack.`)
      : (warrior ? `Right-click an enemy to attack. Swinging builds rage; press 1 for ${SPELLS[bar[0]].name} once you have 12.` : `Press 1 to use ${SPELLS[bar[0]].name}. Tab cycles targets, right-click an enemy to attack.`));
  }

  spawnMob(key, x, z, level, extra = {}) {
    const t = MOBS[key], ms = mobStats(level);
    const u = new Unit({
      name: t.name, kind: 'mob', hostile: true, level, template: key, elite: t.elite, rare: t.rare,
      pos: V3(x, this.world.heightAt(x, z), z), facing: Math.random() * 6.28,
      hp: Math.round(ms.hp * t.hp * (t.elite ? 1 : 1)), dmgMin: ms.dmgMin * t.dmg, dmgMax: ms.dmgMax * t.dmg, swing: t.swing, armor: ms.armor,
      moveSpeed: 6.6 * t.speed, radius: t.radius, spells: t.abilities,
    });
    u.base.crit = 5; u.base.ap = level * 2; u.recalc(); u.hp = u.hpMax;
    u.brain = new MobBrain(u, t, this);
    Object.assign(u, extra);
    let spec = t.model;
    if (spec[0] === 'humanoid') spec = ['humanoid', { outfit: t.model[1], race: 'human', sex: Math.random() < 0.3 ? 'f' : 'm', cls: 'npc', seed: u.id }];
    else if (spec[2]?.variants) { const o = spec[2], i = Math.floor(Math.random() * o.variants.length); spec = [spec[0], spec[1], { variant: o.variants[i], weapon: o.weapons?.[i], seed: u.id }]; }
    else spec = [spec[0], spec[1], { ...(spec[2] || {}), seed: u.id }];
    this.addModel(u, spec);
    this.sim.add(u);
    return u;
  }

  spawnCamps() {
    const rng = new RNG(777);
    for (const camp of CAMPS) {
      for (let i = 0; i < camp.n; i++) {
        let x, z, tries = 0;
        do {
          const a = rng.range(0, Math.PI * 2), r = Math.sqrt(rng.next()) * camp.r;
          x = camp.x + Math.cos(a) * r; z = camp.z + Math.sin(a) * r; tries++;
          const h = this.world.heightAt(x, z);
          const ok = camp.mob === 'gurgler' ? (h > -1.0 && h < 1.6) : h > 0.8 && this.world.hf.slopeAt(x, z) < 0.45;
          if (ok) break;
        } while (tries < 40);
        const lv = rng.int(camp.lv[0], camp.lv[1]);
        const spot = { key: camp.mob, x, z, lv, camp };
        spot.unit = this.spawnMob(camp.mob, x, z, lv);
        this.spawnPoints.push(spot);
      }
    }
    // named elites
    const named = [['greymaw', 176, 22, 7], ['waxbeard', -165, -104, 6], ['vex', 172, 186, 9]];
    for (const [k, x, z, lv] of named) { const spot = { key: k, x, z, lv, named: true }; spot.unit = this.spawnMob(k, x, z, lv); this.spawnPoints.push(spot); }
    // Greymaw patrols
    const gm = this.spawnPoints.find(s => s.key === 'greymaw').unit;
    gm.brain.t = { ...gm.brain.t, wander: 26 };
  }

  spawnCritters() {
    const rng = new RNG(4711);
    const groups = [
      ['rabbit', ['brown', 'grey', 'white'], [[-60, 120, 30], [60, 100, 25], [-110, 60, 25], [40, 60, 30]], 14],
      ['deer', ['doe', 'doe', 'buck', 'fawn'], [[120, 20, 30], [200, 90, 30], [-220, -20, 30]], 7],
      ['chicken', ['white', 'brown', 'black'], [[-140, 122, 8], [0, 176, 10], [-100, 128, 6]], 9],
      ['sheep', ['white', 'white', 'black', 'lamb'], [[-205, 150, 14], [-90, 150, 10]], 8],
      ['cat', ['ginger', 'grey', 'black', 'calico'], [[-10, 140, 12], [30, 160, 8], [-40, 26, 4]], 4],
      ['crow', ['crow', 'raven'], [[-170, 72, 16], [-118, 76, 12]], 6],
    ];
    const NAMES = { rabbit: 'Rabbit', deer: 'Deer', chicken: 'Chicken', sheep: 'Sheep', cat: 'Cat', crow: 'Crow' };
    for (const [type, variants, spots, n] of groups) for (let i = 0; i < n; i++) {
      const [sx, sz, r] = spots[i % spots.length];
      const a = rng.range(0, 6.28), rr = rng.range(0, r), x = sx + Math.cos(a) * rr, z = sz + Math.sin(a) * rr;
      if (this.world.heightAt(x, z) < 0.6) continue;
      const u = new Unit({ name: NAMES[type], kind: 'critter', hostile: false, level: 1, pos: V3(x, this.world.heightAt(x, z), z), hp: 4, radius: 0.3 });
      u.facing = rng.range(0, 6.28);
      this.addModel(u, ['creature', type, { variant: variants[i % variants.length], seed: u.id }]);
      u.brain = new CritterBrain(u, type, this);
      this.sim.add(u);
    }
  }

  spawnNPCs() {
    for (const [id, n] of Object.entries(NPCS)) {
      const [x, z] = n.pos;
      const u = new Unit({ name: n.name, kind: 'npc', hostile: false, level: n.guard ? 20 : 10, pos: V3(x, this.world.heightAt(x, z), z), hp: 2000, dmgMin: 30, dmgMax: 45 });
      u.facing = Math.atan2(-(n.face[0] - x), -(n.face[1] - z));
      u.npcId = id; u.title = n.title; u.guard = !!n.guard; u.npc = n;
      this.addModel(u, ['humanoid', { race: n.race, sex: n.sex, outfit: n.outfit, cls: 'npc', seed: id.length * 31 + x }]);
      this.sim.add(u);
      this.npcs[id] = u;
    }
    this.refreshQuestMarkers();
  }

  // ------------------------------------------------------------ inventory
  addItem(id, n = 1) {
    const u = this.player, def = ITEMS[id];
    const st = u.bags.find(b => b.id === id && def?.stack);
    if (st) st.count += n; else u.bags.push({ id, count: n });
    bus.emit('bags_changed', { unit: u });
    return true;
  }
  countItem(id) { return this.player.bags.filter(b => b.id === id).reduce((s, b) => s + b.count, 0); }
  removeItem(id, n = 1) {
    const u = this.player;
    for (const b of u.bags) { if (b.id !== id) continue; const k = Math.min(n, b.count); b.count -= k; n -= k; if (n <= 0) break; }
    u.bags = u.bags.filter(b => b.count > 0 || b.gear);
    bus.emit('bags_changed', { unit: u });
  }
  addGear(item, autoEquip = true) {
    const u = this.player;
    const cur = u.equip[item.slot];
    const score = it => !it ? -1 : (it.ilvl || 0) * 10 + ['poor', 'common', 'uncommon', 'rare', 'epic', 'legendary'].indexOf(it.rarity) * 5;
    if (autoEquip && item.cls === u.cls && score(item) > score(cur)) {
      u.bags.push({ gear: item, count: 1 });
      this.equip(item);
      bus.emit('chat', { ch: 'system', text: `You equip [${item.name}].`, links: [{ name: item.name, rarity: item.rarity, item }] });
      return;
    }
    u.bags.push({ gear: item, count: 1 }); bus.emit('bags_changed', { unit: u });
  }
  sellJunk() {
    const u = this.player; let total = 0;
    u.bags = u.bags.filter(b => { const d = ITEMS[b.id]; if (d?.rarity === 'poor') { total += (d.sell || 1) * b.count * 25; return false; } if (b.gear && b.gear.cls !== u.cls) { total += b.gear.sell * 25; return false; } return true; });
    if (total) { u.gold += total; bus.emit('money', { amount: total }); bus.emit('chat', { ch: 'system', text: `You sold your junk for ${fmtMoney(total)}.` }); bus.emit('bags_changed', { unit: u }); }
    return total;
  }
  buy(id, n, price) {
    const u = this.player;
    if (u.gold < price) { bus.emit('error', { unit: u, msg: "You don't have enough money" }); return false; }
    u.gold -= price; this.addItem(id, n); bus.emit('money', { amount: -price }); return true;
  }
  equip(item) {
    const u = this.player;
    const old = u.equip[item.slot];
    u.equip[item.slot] = item;
    u.bags = u.bags.filter(b => b.gear !== item);
    if (old) u.bags.push({ gear: old, count: 1 });
    this.applyGear(u);
    const tiers = SLOTS.map(s => u.equip[s]?.tier || 0).sort((a, b) => b - a);
    const tier = Math.min(3, tiers[1] ?? tiers[0] ?? 0); // look follows your second-best piece (one epic doesn't make a full set)
    if (tier !== u.gearLook) { u.gearLook = tier; u.model?.setGear?.(`${u.cls}:${tier}`); }
    bus.emit('equip_changed', { unit: u, item, old });
    bus.emit('bags_changed', { unit: u });
  }
  useItem(id) {
    const u = this.player, def = ITEMS[id];
    if (!def?.use || this.countItem(id) <= 0) return;
    if (def.use === 'healPotion') { if (u.cdLeft('potion') > 0) return bus.emit('error', { unit: u, msg: 'Item is not ready yet' }); this.combat.heal(u, u, 40 + u.level * 18); u.cooldowns.set('potion', 60); this.removeItem(id); }
    else if (def.use === 'manaPotion') { if (u.cdLeft('potion') > 0) return bus.emit('error', { unit: u, msg: 'Item is not ready yet' }); u.gain(50 + u.level * 22); u.cooldowns.set('potion', 60); this.removeItem(id); }
    else if (def.use === 'eat' || def.use === 'drink') { if (u.inCombat) return bus.emit('error', { unit: u, msg: "You can't do that while in combat" }); u.addAura(def.use === 'eat' ? 'eating' : 'drinking', u); this.pc.sitting = true; this.removeItem(id); }
    else if (def.use === 'hearth') this.startHearth();
    bus.emit('item_used', { id });
  }
  startHearth() {
    const u = this.player;
    if (u.inCombat) return bus.emit('error', { unit: u, msg: "You can't do that while in combat" });
    if (u.cdLeft('hearth') > 0) return bus.emit('error', { unit: u, msg: 'Hearthstone is not ready yet' });
    u.casting = { id: 'hearth', spell: { name: 'Hearthstone', icon: 'hearthstone', target: 'self' }, t: 0, dur: 5, target: u, channel: false, custom: () => { const P = PLACES.village; u.pos.set(P.x - 8, 0, P.z - 18); u.pos.y = this.world.heightAt(u.pos.x, u.pos.z); u.cooldowns.set('hearth', 120); this.cam._first = true; bus.emit('fx', { name: 'blinkIn', pos: u.pos.clone() }); } };
    bus.emit('cast_start', { unit: u, spell: u.casting.spell, id: 'hearth', dur: 5 });
  }

  // ------------------------------------------------------------ progression
  giveXP(n, src = 'kill') {
    const u = this.player; if (u.level >= MAX_LEVEL || n <= 0) return;
    u.xp += n;
    bus.emit('xp', { unit: u, amount: n, src });
    while (u.level < MAX_LEVEL && u.xp >= xpToNext(u.level)) {
      u.xp -= xpToNext(u.level); u.level++;
      this.levelStats(u);
      u.hp = u.hpMax; if (u.powerType === 'mana') u.power = u.powerMax;
      const learned = CLASSES[u.cls].bar.filter(id => SPELLS[id].learn === u.level);
      this.pc.setBar(CLASSES[u.cls].bar.filter(id => SPELLS[id].learn <= u.level));
      bus.emit('level_up', { unit: u, level: u.level, learned });
    }
    if (u.level >= MAX_LEVEL) u.xp = 0;
    this.checkQuestObjectives();
  }

  // ------------------------------------------------------------ quests
  questState(q) {
    const u = this.player;
    if (u.questsDone.has(q.id)) return 'done';
    const a = u.quests.find(x => x.id === q.id);
    if (a) return this.questComplete(a) ? 'complete' : 'active';
    const prereqOk = QUESTS.every(p => !(p.next || []).includes(q.id) || u.questsDone.has(p.id));
    return prereqOk && u.level >= (q.level - 1) ? 'available' : 'locked';
  }
  questComplete(a) { return a.progress.every((p, i) => p >= (QUEST[a.id].obj[i].count ?? 1)); }
  acceptQuest(id) {
    const u = this.player, q = QUEST[id];
    if (u.quests.find(x => x.id === id) || u.questsDone.has(id)) return;
    const a = { id, progress: q.obj.map(() => 0) };
    u.quests.push(a);
    if (q.startItem) this.addItem(q.startItem, 1);
    this.checkQuestObjectives();
    bus.emit('quest_accept', { quest: q });
    this.refreshQuestMarkers();
  }
  completeQuest(id, choice) {
    const u = this.player, q = QUEST[id];
    const a = u.quests.find(x => x.id === id); if (!a || !this.questComplete(a)) return;
    u.quests = u.quests.filter(x => x !== a);
    u.questsDone.add(id);
    for (const o of q.obj) if (o.type === 'item') this.removeItem(o.item, o.count);
    if (q.startItem) this.removeItem(q.startItem, 1);
    u.gold += q.gold * 100 + 0;
    if (Array.isArray(q.rewards)) q.rewards.forEach(r => this.addItem(r, 1));
    else if (choice) { this.addGear(choice); }
    bus.emit('quest_complete', { quest: q });
    this.giveXP(q.xp, 'quest');
    this.refreshQuestMarkers();
  }
  questRewardChoices(q) {
    if (q.rewards !== 'gear' && q.rewards !== 'rare') return null;
    const u = this.player, rng = new RNG(q.id + u.name);
    const rarity = q.rewards === 'rare' ? 'rare' : 'uncommon';
    const slots = rng.shuffle(['shoulders', 'chest', 'weapon', 'head', 'legs', 'hands', 'feet']).slice(0, 3);
    return slots.map(s => makeGear(rng, u.cls, q.level + 3, rarity, s));
  }
  progressQuests(pred, amount = 1) {
    const u = this.player; let changed = false;
    for (const a of u.quests) {
      const q = QUEST[a.id];
      q.obj.forEach((o, i) => { if (pred(o) && a.progress[i] < (o.count ?? 1)) { a.progress[i] = Math.min(o.count ?? 1, a.progress[i] + amount); changed = true; bus.emit('quest_progress', { quest: q, obj: o, value: a.progress[i] }); } });
    }
    if (changed) { this.refreshQuestMarkers(); bus.emit('quests_changed', {}); }
  }
  checkQuestObjectives() {
    const u = this.player; if (!u) return;
    for (const a of u.quests) {
      const q = QUEST[a.id];
      q.obj.forEach((o, i) => {
        let v = a.progress[i];
        if (o.type === 'item') v = Math.min(o.count, this.countItem(o.item));
        if (o.type === 'level') v = u.level >= o.level ? 1 : 0;
        if (v !== a.progress[i]) { a.progress[i] = v; bus.emit('quest_progress', { quest: q, obj: o, value: v }); }
      });
    }
    this.refreshQuestMarkers(); bus.emit('quests_changed', {});
  }
  refreshQuestMarkers() {
    if (!this.player) return;
    for (const [id, n] of Object.entries(this.npcs)) {
      let mark = null;
      for (const q of QUESTS) {
        const st = this.questState(q);
        if (q.turnin === id && st === 'complete') { mark = '?'; break; }
        if (q.giver === id && st === 'available') mark = mark || '!';
        if (q.turnin === id && st === 'active' && q.obj.some(o => o.type === 'talk' && o.npc === id)) mark = '?';
      }
      n.questMark = mark;
    }
  }
  interact(o) {
    if (o.kind !== 'npc') { bus.emit('interact_sim', { unit: o }); return; }
    const id = o.npcId;
    // talk objectives
    this.progressQuests(ob => ob.type === 'talk' && ob.npc === id);
    const offers = [];
    for (const q of QUESTS) {
      const st = this.questState(q);
      if (q.turnin === id && st === 'complete') offers.push({ q, kind: 'complete' });
      else if (q.giver === id && st === 'available') offers.push({ q, kind: 'offer' });
      else if (q.turnin === id && st === 'active') offers.push({ q, kind: 'progress' });
    }
    this.player.facing = Math.atan2(-(o.pos.x - this.player.pos.x), -(o.pos.z - this.player.pos.z));
    bus.emit('gossip', { npc: o, def: o.npc, offers });
  }

  // ------------------------------------------------------------ loot & death
  // title screen: the realm keeps living with nobody logged in
  updateNoPlayer(dt) {
    for (const u of this.sim.units) if (u.brain && !u.dead) u.brain.update(dt);
    this.combat.update(dt);
    this.social?.update(dt);
    for (let i = this.corpses.length - 1; i >= 0; i--) { const c = this.corpses[i]; c.t += dt; if (c.t > 40) { this.corpses.splice(i, 1); this.sim.remove(c.u); } }
    for (let i = this.respawns.length - 1; i >= 0; i--) { const r = this.respawns[i]; r.t -= dt; if (r.t <= 0) { this.respawns.splice(i, 1); r.spot.unit = this.spawnMob(r.spot.key, r.spot.x, r.spot.z, r.spot.lv); } }
    const camPos = this.camera.position;
    for (const u of this.sim.units) { if (!u.model) continue; const d = Math.hypot(u.pos.x - camPos.x, u.pos.z - camPos.z); const vis = d < (u.kind === 'critter' ? 60 : 125); u.model.root.visible = vis; if (vis) { unitShadow(u, d < (u.kind === 'critter' ? 20 : 42)); this.syncModel(u, dt); } }
  }

  onDeath({ unit: u, killer }) {
    if (!this.sim.units.includes(u)) return; // not in the open world (e.g. raid instance)
    if (u.kind === 'player') { if (this.e.mode !== 'raid') bus.emit('player_died', {}); return; } // the raid announces its own deaths
    if (!u.hostile) return;
    const t = MOBS[u.template];
    const p = this.player;
    const credit = p && u.tapper && (u.tapper === p || u.tapper === p.party);
    if (credit) {
      this.giveXP(mobXP(p.level, u.level, u.elite) * (p.party && p.party.members.length > 1 ? 0.75 : 1));
      this.progressQuests(o => o.type === 'kill' && o.mob === u.template);
      // loot table
      u.loot = [];
      for (const l of t.loot || []) {
        if (this.rng.next() > l.chance) continue;
        if (l.item) { const q = ITEMS[l.item]; if (q?.quest && l.quest && !p.quests.find(a => a.id === l.quest)) continue; u.loot.push({ id: l.item, count: 1 }); }
        else if (l.gold) u.loot.push({ gold: Math.round((l.gold[0] + this.rng.next() * (l.gold[1] - l.gold[0])) * 100 * (0.5 + u.level * 0.1)) });
        else if (l.gear) u.loot.push({ gear: makeGear(this.rng, p.cls, u.level + (l.gear === 'rare' ? 3 : 1), l.gear) });
      }
      if (!u.loot.some(l => l.gold) && this.rng.next() < 0.6) u.loot.push({ gold: Math.round(10 + u.level * 14 * this.rng.next()) });
      u.lootable = u.loot.length > 0;
    }
    this.corpses.push({ u, t: 0 });
    const spot = this.spawnPoints.find(s => s.unit === u);
    if (spot) {
      // dynamic respawn: depleted camps near the player refill faster (the vale is crowded)
      const camp = spot.camp, alive = camp ? this.spawnPoints.filter(s => s.camp === camp && s.unit && !s.unit.dead).length / camp.n : 1;
      const near = camp && this.player && Math.hypot(this.player.pos.x - camp.x, this.player.pos.z - camp.z) < camp.r + 60;
      this.respawns.push({ spot, t: spot.named ? 90 : (near && alive < 0.6 ? 12 : 24) + this.rng.next() * 12 });
    }
  }
  lootCorpse(u) {
    if (!u.lootable || !u.loot) { bus.emit('error', { unit: this.player, msg: 'You cannot loot that corpse' }); return; }
    bus.emit('loot_open', { corpse: u, items: u.loot });
  }
  takeLoot(u, idx) {
    const l = u.loot[idx]; if (!l) return;
    const p = this.player;
    if (l.gold) { p.gold += l.gold; bus.emit('money', { amount: l.gold }); }
    else if (l.gear) { this.addGear(l.gear); bus.emit('loot_item', { item: l.gear }); }
    else { this.addItem(l.id, l.count); bus.emit('loot_item', { id: l.id, count: l.count }); }
    u.loot.splice(idx, 1);
    if (!u.loot.length) { u.lootable = false; bus.emit('loot_close', {}); }
    this.checkQuestObjectives();
  }
  lootAll(u) { while (u.loot && u.loot.length) this.takeLoot(u, 0); }

  releaseSpirit() {
    const p = this.player; if (!p.dead) return;
    p.corpsePos = p.pos.clone();
    const gy = V3(52, 0, 118); gy.y = this.world.heightAt(gy.x, gy.z);
    p.pos.copy(gy); p.ghost = true; p.dead = false; p.hp = 1;
    p.addAura('ghost', p);
    G.uDesat.value = 1; this.e.renderer.F.uDesat.value = 0.6;
    this.cam._first = true;
    bus.emit('ghost', { on: true, corpse: p.corpsePos });
  }
  resurrect() {
    const p = this.player; if (!p.ghost) return;
    if (p.pos.distanceTo(p.corpsePos) > 30) { bus.emit('error', { unit: p, msg: 'You must be closer to your corpse' }); return; }
    p.ghost = false; p.removeAura('ghost'); p.hp = Math.round(p.hpMax * 0.5); if (p.powerType === 'mana') p.power = Math.round(p.powerMax * 0.5);
    p.pos.copy(p.corpsePos);
    G.uDesat.value = 0; this.e.renderer.F.uDesat.value = 0;
    p.stateAnim.dead = false; p.model?.revive?.();
    bus.emit('ghost', { on: false }); bus.emit('fx', { name: 'resurrect', pos: p.pos.clone() });
  }

  // ------------------------------------------------------------ specials
  onCharge({ unit: u, target: t }) {
    if (!this.sim.units.includes(u) || this.e.mode === 'raid' || u.kind === 'remote') return; // a friend's own browser moves them
    // rush the unit to the target over ~0.35 s
    const from = u.pos.clone();
    const dir = V3(t.pos.x - from.x, 0, t.pos.z - from.z); const d = dir.length(); dir.normalize();
    const to = V3(t.pos.x - dir.x * (t.radius + 1.2), 0, t.pos.z - dir.z * (t.radius + 1.2));
    u.dash = { from, to, t: 0, dur: Math.min(0.6, d / 32) };
    bus.emit('fx', { name: 'charge', pos: from.clone() });
  }
  onBlink({ unit: u, dist }) {
    if ((this.e?.mode === 'raid' && this instanceof GameState) || u.kind === 'remote') return;
    const fx = -Math.sin(u.facing), fz = -Math.cos(u.facing);
    bus.emit('fx', { name: 'blinkOut', pos: u.pos.clone() });
    let x = u.pos.x, z = u.pos.z;
    for (let i = 0; i < 16; i++) { const nx = x + fx * dist / 16, nz = z + fz * dist / 16; const [rx, rz] = this.sim.resolve(nx, nz, u.radius); if (Math.hypot(rx - nx, rz - nz) > 0.2) break; x = nx; z = nz; }
    u.pos.x = x; u.pos.z = z; u.pos.y = this.world.heightAt(x, z);
    bus.emit('fx', { name: 'blinkIn', pos: u.pos.clone() });
  }

  // ------------------------------------------------------------ frame
  syncModel(u, dt) {
    const m = u.model; if (!m) return;
    if (u.frozenModel) { m.root.position.copy(u.pos); m.root.rotation.y = u.facing; return; }
    m.root.position.copy(u.pos);
    let df = u.facing - (m.root.rotation.y || 0); df = Math.atan2(Math.sin(df), Math.cos(df));
    m.root.rotation.y += df * Math.min(1, dt * 14);
    const s = u.stateAnim;
    s.dead = u.dead; s.casting = u.casting ? (u.casting.channel ? 'channel' : (u.casting.spell?.anim === 'castOmni' ? 'omni' : 'directed')) : null;
    if (u.kind !== 'player') s.combat = s.combat || u.inCombat;
    if (u.hitStop > 0) { u.hitStop -= dt; dt *= 0.08; } // see bridge.js damage
    m.update(dt, s);
  }

  update(dt) {
    if (this.mirror) return this.updateMirror(dt);
    this.time += dt;
    const p = this.player;
    if (!p) return this.updateNoPlayer(dt);
    // player
    if (p.dash) {
      const d = p.dash; d.t += dt; const k = Math.min(1, d.t / d.dur);
      p.pos.x = d.from.x + (d.to.x - d.from.x) * k; p.pos.z = d.from.z + (d.to.z - d.from.z) * k; p.pos.y = this.world.heightAt(p.pos.x, p.pos.z);
      p.stateAnim.speed = 20;
      if (k >= 1) p.dash = null;
      this.input.consumeDrag();
    } else this.pc.update(dt);
    // brains
    for (const u of this.sim.units) if (u.brain && !u.dead) u.brain.update(dt);
    this.combat.update(dt);
    this.social?.update(dt);
    // corpses & respawns
    for (let i = this.corpses.length - 1; i >= 0; i--) {
      const c = this.corpses[i]; c.t += dt;
      if (c.t > (c.u.lootable ? 90 : 40)) { this.corpses.splice(i, 1); this.sim.remove(c.u); c.u.model?.dispose?.(); }
    }
    for (let i = this.respawns.length - 1; i >= 0; i--) {
      const r = this.respawns[i]; r.t -= dt;
      if (r.t <= 0) {
        const s = r.spot, d = Math.hypot(p.pos.x - s.x, p.pos.z - s.z);
        if (d < 25) { r.t = 5; continue; } // don't pop in on top of the player
        this.respawns.splice(i, 1);
        s.unit = this.spawnMob(s.key, s.x, s.z, s.lv);
        if (s.key === 'greymaw') s.unit.brain.t = { ...s.unit.brain.t, wander: 26 };
      }
    }
    p.played = (p.played || 0) + dt;
    this.updatePrompts(dt);
    this.updateModels(dt);
  }

  /** Joining a friend: this realm's own mobs and SimPlayers leave; the host's arrive as mirrored units instead.
   *  NPCs (quest givers) and critters stay local: quests are per character and critters are scenery. */
  becomeMirror() {
    this.mirror = true;
    for (const u of [...this.sim.units]) if (u.kind === 'mob' || u.kind === 'sim' || u.kind === 'boss') { this.sim.remove(u); u.model?.dispose?.(); }
    this.spawnPoints = []; this.respawns = []; this.corpses = [];
    this.social.sims = []; this.social.party = null;
  }

  // A guest's world: the host's browser simulates everything; snapshots place the units (net/guest.js), so this
  // only runs the local player, the prompts and the models.
  updateMirror(dt) {
    this.time += dt;
    const p = this.player;
    if (!p) { this.updateModels(dt); return; }
    if (p.dash) {
      const d = p.dash; d.t += dt; const k = Math.min(1, d.t / d.dur);
      p.pos.x = d.from.x + (d.to.x - d.from.x) * k; p.pos.z = d.from.z + (d.to.z - d.from.z) * k; p.pos.y = this.world.heightAt(p.pos.x, p.pos.z);
      p.stateAnim.speed = 20;
      if (k >= 1) p.dash = null;
      this.input.consumeDrag();
    } else this.pc.update(dt);
    p.played = (p.played || 0) + dt;
    this.updatePrompts(dt);
    this.updateModels(dt);
  }

  updatePrompts(dt) {
    const p = this.player;
    // reach objectives + portal prompt
    if (Math.floor(this.time * 2) !== Math.floor((this.time - dt) * 2)) {
      const P = PLACES.portal, dP = Math.hypot(p.pos.x - P.x, p.pos.z - P.z);
      if (dP < 16 && p.quests.length) this.progressQuests(o => o.type === 'reach' && o.place === 'portal');
      if (dP < 13 && !p.dead && !p.ghost) {
        if (!this.portalPrompted) {
          this.portalPrompted = true;
          if (this.mirror) bus.emit('error', { unit: p, msg: 'Your host opens the raid. Ask them to step into the portal.' });
          else if (p.level >= 10) bus.emit('popup', { kind: 'confirm', text: `Enter **The Ember Maw**?\nTonight: **${this.dragon?.name || 'the dragon'}**. A raid is forming.`, accept: 'Enter', decline: 'Not yet', onAccept: () => this.e.enterRaid() });
          else bus.emit('error', { unit: p, msg: 'You must be level 10 to enter the Ember Maw' });
        }
      } else if (dP > 22) this.portalPrompted = false;
      if (p.ghost && p.corpsePos && p.pos.distanceTo(p.corpsePos) < 26 && !this.resPrompted) {
        this.resPrompted = true;
        bus.emit('popup', { kind: 'confirm', text: 'Resurrect now?', accept: 'Resurrect', decline: 'Wait', onAccept: () => { this.resurrect(); this.resPrompted = false; }, onDecline: () => { this.resPrompted = false; } });
      }
    }
  }

  updateModels(dt) {
    const p = this.player || {};
    // models (skip far ones)
    const camPos = this.camera.position;
    const reach = { low: 0.6, medium: 0.8 }[this.e.renderer?.quality] || 1; // draw distance follows the quality preset
    for (const u of this.sim.units) {
      if (!u.model) continue;
      const d = Math.hypot(u.pos.x - camPos.x, u.pos.z - camPos.z);
      const vis = d < (u.kind === 'critter' ? 60 : u.kind === 'mob' ? 115 : 135) * reach || u === p.target;
      u.model.root.visible = vis;
      if (!vis) continue;
      // characters are 10-20k triangles: only the nearby ones are worth drawing again into the shadow cascades
      unitShadow(u, d < (u.kind === 'critter' ? 20 : 42) || u === p);
      // far units animate at a reduced rate
      if (d > 70) { u._animAcc = (u._animAcc || 0) + dt; if (u._animAcc < 0.05) { u.model.root.position.copy(u.pos); continue; } this.syncModel(u, u._animAcc); u._animAcc = 0; }
      else this.syncModel(u, dt);
    }
  }
}

// Every animation a unit plays is announced as 'anim' so a host can replay it on its guests' screens.
export function animTap(u) {
  const m = u.model; if (!m?.play || m._tapped) return;
  const play = m.play; m._tapped = true;
  m.play = (name, opt) => { bus.emit('anim', { unit: u, name }); return play.call(m, name, opt); };
}

// Toggle a unit model's shadow casting (remembering which meshes cast to begin with); traverses only on change.
function unitShadow(u, on) {
  if (u._shadow === on) return;
  u._shadow = on;
  u.model.root.traverse(o => { if (!o.isMesh) return; if (o.userData.cs0 === undefined) o.userData.cs0 = o.castShadow; o.castShadow = on && o.userData.cs0; });
}
