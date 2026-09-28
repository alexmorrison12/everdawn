// Professions. Gathering: Fishing, Mining, Herbalism. Crafting: Cooking, Alchemy, Blacksmithing. Everyone knows all
// six (skill 1–150, WoW-style skill-ups that slow down as a recipe or node turns green). Ore veins, herbs and the
// fishing bobber are this browser's own (a friend gets their own), so they're plain local units the host never streams.
import * as THREE from 'three';
import { Unit } from './unit.js';
import { ITEMS, makeGear } from './items.js';
import { bus } from './events.js';
import { RNG } from '../core/noise.js';
import { M } from '../world/heightfield.js';
import { lambert } from '../engine/materials.js';
import { WATER_Y, PLACES } from '../world/zone.js';
import { CROWN, CITY } from '../world/crown.js';

export const MAX_SKILL = 150;
export const PROFS = {
  fishing: { name: 'Fishing', icon: 'fishingPole', kind: 'gather', tip: 'Buy a Fishing Pole from Fisherman Gil by Mirrormere Lake, face open water and Fish. When the bobber splashes, right-click it (or press Fish again).' },
  mining: { name: 'Mining', icon: 'pickaxe', kind: 'gather', tip: 'Carry a Mining Pick (Blacksmith Hargan sells them) and right-click ore veins in the hills, along the cliffs and around Candlerock Mine. Track Minerals on the minimap.' },
  herbalism: { name: 'Herbalism', icon: 'herbPeace', kind: 'gather', tip: 'Right-click herbs in meadows, forests and on the volcano\'s ash. Track Herbs on the minimap.' },
  cooking: { name: 'Cooking', icon: 'fishCooked', kind: 'craft', tip: 'Cook your catch at a fire: light a Basic Campfire anywhere, or cook at a forge or camp fire. Food heals and makes you Well Fed.' },
  alchemy: { name: 'Alchemy', icon: 'elixir', kind: 'craft', tip: 'Brew herbs into potions and tonics, anywhere.' },
  blacksmithing: { name: 'Blacksmithing', icon: 'anvil', kind: 'craft', tip: 'Forge ore into gear for your class at an anvil (Hargan\'s smithy in Dawnhollow).' },
};

// gathering nodes: where they grow (a test on the terrain), how many, and what they give
const NODES = {
  copper: { prof: 'mining', name: 'Copper Vein', req: 1, n: 16, color: 0xd0783a, loot: [['copperOre', 2, 4], ['tigerseye', 1, 1, 0.07]] },
  tin: { prof: 'mining', name: 'Tin Vein', req: 50, n: 10, color: 0xd8dce4, loot: [['tinOre', 2, 4], ['copperOre', 1, 2, 0.3], ['tigerseye', 1, 1, 0.12]] },
  emberite: { prof: 'mining', name: 'Emberite Deposit', req: 100, n: 7, color: 0xff6a20, glow: true, loot: [['emberite', 1, 3], ['tigerseye', 1, 1, 0.2]] },
  peacebloom: { prof: 'herbalism', name: 'Peacebloom', req: 1, n: 20, color: 0xfff8e0, heart: 0xe8c040, leaf: 0x5aa040, loot: [['peacebloom', 1, 3]] },
  silverleaf: { prof: 'herbalism', name: 'Silverleaf', req: 1, n: 16, color: null, leaf: 0xc8d8d0, loot: [['silverleaf', 1, 3]] },
  briarthorn: { prof: 'herbalism', name: 'Briarthorn', req: 50, n: 12, color: 0xe05a8a, heart: 0xffd0e0, leaf: 0x3a6a2a, loot: [['briarthorn', 1, 3]] },
  embergrass: { prof: 'herbalism', name: 'Embergrass', req: 100, n: 8, color: 0xff6020, heart: 0xffd040, leaf: 0x7a4a20, glow: true, loot: [['embergrass', 1, 2]] },
};
// where each kind grows in Everdawn Vale
const VALE = {
  copper: (w, x, z) => w.hf.slopeAt(x, z) > 0.12 && (Math.hypot(x - PLACES.mine.x, z - PLACES.mine.z) < 70 || Math.hypot(x / 300, z / 312) > 0.72),
  tin: (w, x, z) => w.hf.slopeAt(x, z) > 0.15 && z < -40 && Math.hypot(x / 300, z / 312) > 0.6 && w.hf.maskAt(x, z, M.ASH) < 0.3,
  emberite: (w, x, z) => w.hf.maskAt(x, z, M.ASH) > 0.35 && w.hf.slopeAt(x, z) < 0.55 && Math.hypot(x - PLACES.peak.x, z - PLACES.peak.z) > 60,
  peacebloom: (w, x, z) => (w.hf.maskAt(x, z, M.MEADOW) > 0.25 || w.hf.maskAt(x, z, M.FARM) > 0.2) && w.hf.slopeAt(x, z) < 0.25,
  silverleaf: (w, x, z) => w.hf.maskAt(x, z, M.FOREST) > 0.45 && w.hf.slopeAt(x, z) < 0.35,
  briarthorn: (w, x, z) => w.hf.maskAt(x, z, M.FOREST) > 0.6 && (Math.hypot(x - PLACES.forest.x, z - PLACES.forest.z) < 120 || Math.hypot(x - PLACES.webwood.x, z - PLACES.webwood.z) < 90),
  embergrass: (w, x, z) => w.hf.maskAt(x, z, M.ASH) > 0.2 && w.hf.slopeAt(x, z) < 0.45 && Math.hypot(x - PLACES.peak.x, z - PLACES.peak.z) > 55,
};
// …and in the Crownlands (tin and emberite in the King's Quarry, herbs in the farmland and the Thornwood)
const outsideCity = (x, z) => Math.hypot(x - CITY.x, z - CITY.z) > CITY.r + 30;
const nearQ = (x, z, r) => Math.hypot(x - CROWN.places.quarry.x, z - CROWN.places.quarry.z) < r;
const CROWN_NODES = {
  copper: (w, x, z) => outsideCity(x, z) && w.hf.slopeAt(x, z) > 0.12 && (nearQ(x, z, 80) || Math.hypot((x - 40) / 470, z / 440) > 0.7),
  tin: (w, x, z) => outsideCity(x, z) && (nearQ(x, z, 60) || (Math.hypot((x - 40) / 470, z / 440) > 0.78 && w.hf.slopeAt(x, z) > 0.15)),
  emberite: (w, x, z) => nearQ(x, z, 34),
  peacebloom: (w, x, z) => outsideCity(x, z) && (w.hf.maskAt(x, z, M.MEADOW) > 0.25 || w.hf.maskAt(x, z, M.FARM) > 0.2) && w.hf.slopeAt(x, z) < 0.25,
  silverleaf: (w, x, z) => outsideCity(x, z) && w.hf.maskAt(x, z, M.FOREST) > 0.45 && w.hf.slopeAt(x, z) < 0.35,
  briarthorn: (w, x, z) => w.hf.maskAt(x, z, M.FOREST) > 0.55 && Math.hypot(x - CROWN.places.grove.x, z - CROWN.places.grove.z) < 120,
};
const WHERE = { vale: VALE, crown: CROWN_NODES };
// what bites where (weights), and the skill a zone's water wants
const WATERS = {
  vale: { req: 1, table: [['trout', 44], ['sunfish', 40], ['oldBoot', 9], ['pearl', 4]] },
  crown: { req: 40, table: [['snapper', 42], ['eel', 38], ['oldBoot', 8], ['pearl', 7]] },
};
export const RECIPES = [
  { id: 'cookedTrout', prof: 'cooking', req: 1, makes: 'cookedTrout', needs: { trout: 1 }, fire: true },
  { id: 'sunfishSkewer', prof: 'cooking', req: 20, makes: 'sunfishSkewer', needs: { sunfish: 1 }, fire: true },
  { id: 'snapperSupper', prof: 'cooking', req: 70, makes: 'snapperSupper', needs: { snapper: 1, eel: 1 }, fire: true },
  { id: 'minorHealing', prof: 'alchemy', req: 1, makes: 'potionHealth', needs: { peacebloom: 1, silverleaf: 1 } },
  { id: 'minorMana', prof: 'alchemy', req: 25, makes: 'potionMana', needs: { silverleaf: 2 } },
  { id: 'emberTonic', prof: 'alchemy', req: 90, makes: 'potionEmber', needs: { embergrass: 1, briarthorn: 2 } },
  { id: 'copperCirclet', prof: 'blacksmithing', req: 1, gear: { slot: 'head', ilvl: 5, rarity: 'uncommon', name: 'Rough Copper Circlet' }, needs: { copperOre: 6 }, anvil: true },
  { id: 'copperBoots', prof: 'blacksmithing', req: 20, gear: { slot: 'feet', ilvl: 7, rarity: 'uncommon', name: 'Copper-Toed Boots' }, needs: { copperOre: 8 }, anvil: true },
  { id: 'tinGloves', prof: 'blacksmithing', req: 50, gear: { slot: 'hands', ilvl: 9, rarity: 'uncommon', name: 'Tin-Knuckled Gloves' }, needs: { tinOre: 8, copperOre: 2 }, anvil: true },
  { id: 'tinMantle', prof: 'blacksmithing', req: 70, gear: { slot: 'shoulders', ilvl: 10, rarity: 'uncommon', name: 'Tin-Plated Mantle' }, needs: { tinOre: 10 }, anvil: true },
  { id: 'emberLegs', prof: 'blacksmithing', req: 100, gear: { slot: 'legs', ilvl: 13, rarity: 'rare', name: 'Emberite-Laced Leggings' }, needs: { emberite: 6, tinOre: 4 }, anvil: true },
  { id: 'emberWeapon', prof: 'blacksmithing', req: 125, gear: { slot: 'weapon', ilvl: 13, rarity: 'rare', name: { warrior: 'Emberite Warblade', mage: 'Emberite Spire', priest: 'Emberite Scepter' } }, needs: { emberite: 10, tigerseye: 2 }, anvil: true },
];
const FIRE_R = 7, ANVIL_R = 12, CAMPFIRE_T = 90;

export class Professions {
  constructor(app) {
    this.app = app;
    this.nodes = []; this.respawn = []; this.fires = []; this.bob = null;
    this.rng = new RNG(Date.now() % 100000);
    bus.on('cast_stop', e => { if (e.unit === this.me && e.reason !== 'success') { if (e.id === 'fishing') this.endFish(null, true); if (e.id === 'prof') this.queue = null; } });
  }
  get game() { return this.app.game; }
  get me() { return this.game.player; }
  get zone() { return this.app.zoneId || 'vale'; }
  skills(p = this.me) { return (p.skills ||= { fishing: 1, mining: 1, herbalism: 1, cooking: 1, alchemy: 1, blacksmithing: 1 }); }
  skill(prof) { return this.skills()[prof] || 1; }
  tool(kind) { const p = this.me; let best = null; for (const b of p.bags) { const d = ITEMS[b.id]; if (d?.tool === kind && (!best || (d.toolBonus || 0) > (best.toolBonus || 0))) best = d; } return best; }
  say(text, ch = 'system') { bus.emit('chat', { ch, text }); }
  err(msg) { bus.emit('error', { unit: this.me, msg }); return false; }

  /** WoW-style: orange while you're learning it, yellow → green as you outgrow it, grey (no more skill) at +50. */
  skillUp(prof, req) {
    const s = this.skills(), cur = s[prof] || 1;
    if (cur >= MAX_SKILL) return;
    const over = cur - req, chance = over < 20 ? 1 : over < 35 ? 0.6 : over < 50 ? 0.25 : 0;
    if (this.rng.next() >= chance) return;
    s[prof] = cur + 1;
    this.say(`Your skill in ${PROFS[prof].name} has increased to ${s[prof]}.`, 'skill');
    bus.emit('skill_up', { prof, value: s[prof] });
  }
  /** Difficulty colour for a recipe/node at your skill: 'orange' | 'yellow' | 'green' | 'grey' | 'red' (can't yet). */
  color(prof, req) { const over = this.skill(prof) - req; return over < 0 ? 'red' : over < 20 ? 'orange' : over < 35 ? 'yellow' : over < 50 ? 'green' : 'grey'; }

  /** A timed action with a cast bar, cancelled by moving (combat.js runs the timer). */
  channel(name, icon, dur, done, o = {}) {
    const p = this.me;
    if (p.casting) return this.err('Another action is in progress');
    if (p.mount) this.app.companions?.dismount(p);
    p.casting = { id: o.id || 'prof', spell: { name, icon }, t: 0, dur, target: p, channel: false, noPose: !!o.noPose, custom: done };
    bus.emit('cast_start', { unit: p, spell: p.casting.spell, id: p.casting.id, dur, channel: !!o.drain });
    return true;
  }

  // ---------------------------------------------------------------- gathering nodes
  spawnNodes(world, sim, zone = 'vale') {
    this.clearNodes(sim);
    this.world = world; this.sim = sim;
    const where = WHERE[zone] || {};
    const rng = new RNG('nodes-' + zone);
    for (const [type, test] of Object.entries(where)) {
      const def = NODES[type]; let placed = 0;
      for (let tries = 0; tries < 4000 && placed < def.n; tries++) {
        const x = rng.range(-440, 440), z = rng.range(-440, 440);
        if (!world.hf.inBounds(x, z, 30) || world.heightAt(x, z) < WATER_Y + 0.6 || world.hf.maskAt(x, z, M.ROAD) > 0.2 || !test(world, x, z)) continue;
        if (this.nodes.some(n => Math.hypot(n.pos.x - x, n.pos.z - z) < 14)) continue;
        const [rx, rz] = sim.resolve(x, z, 1.2); if (Math.hypot(rx - x, rz - z) > 0.05) continue; // not inside a house or a tree
        this.addNode(type, x, z); placed++;
      }
    }
  }
  addNode(type, x, z) {
    const def = NODES[type], y = this.world.heightAt(x, z);
    const u = new Unit({ name: def.name, kind: 'node', hostile: false, level: 1, pos: new THREE.Vector3(x, y, z), hp: 1 });
    u.node = type; u.prof = def.prof; u.facing = (u.id * 1.7) % 6.28;
    u.model = nodeModel(def, u.id); u.height = u.model.height; u.radius = u.model.radius;
    u.model.root.position.copy(u.pos); u.model.root.rotation.y = (u.id * 1.7) % 6.28;
    this.world.scene.add(u.model.root);
    this.sim.add(u); this.nodes.push(u);
    return u;
  }
  clearNodes(sim = this.sim) {
    for (const n of this.nodes) { sim?.remove(n); n.model.root.parent?.remove(n.model.root); }
    this.nodes = []; this.respawn = [];
  }
  /** Right-click a node or the bobber. */
  interact(o) {
    if (o.bobber) return this.reel();
    if (o.kind !== 'node') return;
    const p = this.me, def = NODES[o.node], prof = def.prof;
    if (Math.hypot(o.pos.x - p.pos.x, o.pos.z - p.pos.z) > 5) return this.err('You are too far away');
    if (prof === 'mining' && !this.tool('mining')) return this.err('Requires a Mining Pick');
    if (this.skill(prof) < def.req) return this.err(`Requires ${PROFS[prof].name} (${def.req})`);
    this.game.combat.faceTarget(p, o);
    if (prof === 'herbalism') p.model?.play?.('kneel');
    this.channel(prof === 'mining' ? 'Mining' : 'Herb Gathering', PROFS[prof].icon, prof === 'mining' ? 3.2 : 2.2, () => this.harvest(o), { noPose: prof === 'mining' });
    if (prof === 'mining') this.swinging = o;
  }
  harvest(n) {
    this.swinging = null;
    if (!this.nodes.includes(n)) return;
    const def = NODES[n.node], loot = [];
    for (const [id, a, b, chance = 1] of def.loot) if (this.rng.next() < chance) loot.push({ id, count: a + Math.floor(this.rng.next() * (b - a + 1)) });
    this.skillUp(def.prof, def.req);
    this.removeNode(n);
    this.respawn.push({ type: n.node, t: 90 + this.rng.next() * 90 });
    this.give(def.name, n.pos, loot);
  }
  removeNode(n) { this.nodes = this.nodes.filter(x => x !== n); this.sim.remove(n); n.model.root.parent?.remove(n.model.root); }
  /** Loot from a node or a catch: straight to your bags with Auto Loot, else the loot window. */
  give(name, pos, loot) {
    if (!loot.length) return;
    const g = this.game, c = { id: -1, name, loot, lootable: true, pos: pos.clone() };
    if (g.settings.autoLoot !== false) { g.lootAll(c); return; }
    g.lootSession = [c];
    bus.emit('loot_open', { corpse: c, items: loot.map(l => ({ ...l, from: c, ref: l })) });
  }

  // ---------------------------------------------------------------- fishing
  fish() {
    const p = this.me, g = this.game;
    if (this.bob) return this.reel();
    const pole = this.tool('fishing');
    if (!pole) return this.err('You need a Fishing Pole. Fisherman Gil by Mirrormere Lake sells them.');
    if (p.inCombat) return this.err("You can't do that while in combat");
    if (p.swimming) return this.err("You can't fish while swimming");
    const fx = -Math.sin(p.facing), fz = -Math.cos(p.facing);
    let spot = null;
    for (let d = 5; d <= 24; d++) { const x = p.pos.x + fx * d, z = p.pos.z + fz * d; if (g.sim.isWater(x, z)) { spot = [x, z]; if (d >= 9) break; } }
    if (!spot) return this.err('Face open water to fish');
    if (!this.channel('Fishing', 'fishingPole', 22, () => this.endFish('Nothing bites. Try again.'), { id: 'fishing', noPose: false, drain: true })) return false;
    const bonus = pole.toolBonus || 0;
    this.bob = { x: spot[0], z: spot[1], t: 0, bite: (3 + this.rng.next() * 11) * (bonus ? 0.7 : 1), bit: false, window: 0, bonus };
    const u = this.bob.unit = new Unit({ name: 'Fishing Bobber', kind: 'object', hostile: false, level: 1, pos: new THREE.Vector3(spot[0], WATER_Y, spot[1]), hp: 1 });
    u.bobber = true; u.model = bobberModel(); u.height = 0.6; u.radius = 0.3;
    g.scene.add(u.model.root); g.sim.add(u);
    this.rod = rodModel(!!bonus); p.model?.sockets?.handR?.add(this.rod);
    this.line = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]), new THREE.LineBasicMaterial({ color: 0xe8f0ff, transparent: true, opacity: 0.6 }));
    this.line.frustumCulled = false; g.scene.add(this.line);
    p.model?.play?.('castDirected');
    bus.emit('sound', { name: 'whoosh', pos: p.pos });
    bus.emit('fx', { name: 'splash', pos: new THREE.Vector3(spot[0], WATER_Y, spot[1]), scale: 0.5 });
    g.hint?.('fishing', 'Wait for the bobber to splash, then right-click it (or press Fish again).');
    return true;
  }
  reel() {
    const b = this.bob; if (!b) return;
    if (!b.bit) { this.endFish('You pulled in too early.'); return; }
    const w = WATERS[this.zone] || WATERS.vale, skill = this.skill('fishing') + b.bonus;
    // not enough skill for these waters: the fish tend to get away
    if (skill < w.req && this.rng.next() < Math.min(0.8, (w.req - skill) / 40)) { this.endFish('The fish got away.'); return; }
    const total = w.table.reduce((s, [, n]) => s + n, 0);
    let r = this.rng.next() * total, id = w.table[0][0];
    for (const [k, n] of w.table) { r -= n * (k === 'pearl' ? 1 + b.bonus / 25 : 1); if (r <= 0) { id = k; break; } }
    const pos = b.unit.pos.clone();
    this.skillUp('fishing', w.req);
    this.endFish(null);
    this.me.model?.play?.('cheer');
    this.give('Fishing', pos, [{ id, count: 1 }]);
  }
  endFish(msg, fromStop = false) {
    const b = this.bob, p = this.me, g = this.game; if (!b) return;
    this.bob = null;
    g.sim.remove(b.unit); b.unit.model.root.parent?.remove(b.unit.model.root);
    this.line?.parent?.remove(this.line); this.line = null;
    this.rod?.parent?.remove(this.rod); this.rod = null;
    if (!fromStop && p.casting?.id === 'fishing') { const c = p.casting; p.casting = null; bus.emit('cast_stop', { unit: p, spell: c.spell, id: 'fishing', reason: msg ? 'Interrupted' : 'success' }); }
    if (msg && !fromStop) this.say(msg);
  }

  // ---------------------------------------------------------------- crafting
  /** Where you can cook and forge: fires (a Basic Campfire, camp fires, forges) and anvils (forges). */
  near(kind) {
    const p = this.me, L = this.app.world?.settle?.lights || {};
    const spots = kind === 'fire' ? [...this.fires.map(f => f.pos), ...(L.campfires || []), ...(L.forges || [])] : [...(L.forges || [])];
    const r = kind === 'fire' ? FIRE_R : ANVIL_R;
    return spots.some(s => Math.hypot(s.x - p.pos.x, s.z - p.pos.z) < r);
  }
  canCraft(rec) {
    const p = this.me, g = this.game;
    if (this.skill(rec.prof) < rec.req) return `Requires ${PROFS[rec.prof].name} (${rec.req})`;
    for (const [id, n] of Object.entries(rec.needs)) if (g.countItem(id) < n) return `Missing ${ITEMS[id].name}`;
    if (rec.fire && !this.near('fire')) return 'Requires a cooking fire';
    if (rec.anvil && !this.near('anvil')) return 'Requires an anvil';
    if (p.inCombat) return "You can't do that while in combat";
    return null;
  }
  maxCraft(rec) { const g = this.game; return Math.min(...Object.entries(rec.needs).map(([id, n]) => Math.floor(g.countItem(id) / n))); }
  craft(id, count = 1) {
    const rec = RECIPES.find(r => r.id === id); if (!rec) return false;
    const why = this.canCraft(rec); if (why) return this.err(why);
    this.queue = { rec, left: count };
    return this.craftNext();
  }
  craftNext() {
    const q = this.queue; if (!q || q.left <= 0) { this.queue = null; return false; }
    const rec = q.rec, why = this.canCraft(rec); if (why) { this.queue = null; return this.err(why); }
    const verb = { cooking: 'Cooking', alchemy: 'Brewing', blacksmithing: 'Smithing' }[rec.prof];
    const name = rec.gear ? gearName(rec, this.me.cls) : ITEMS[rec.makes].name;
    return this.channel(`${verb}: ${name}`, rec.gear ? 'anvil' : ITEMS[rec.makes].icon, rec.prof === 'blacksmithing' ? 3 : 2, () => {
      const g = this.game, p = this.me;
      if (this.canCraft(rec)) { this.queue = null; return; }
      for (const [rid, n] of Object.entries(rec.needs)) g.removeItem(rid, n);
      if (rec.gear) {
        const it = makeGear(new RNG(`${rec.id}-${p.cls}-${Date.now()}`), p.cls, rec.gear.ilvl, rec.gear.rarity, rec.gear.slot);
        it.name = name; it.crafted = p.name;
        g.addGear(it); bus.emit('loot_item', { item: it });
      } else { g.addItem(rec.makes, 1); bus.emit('loot_item', { id: rec.makes, count: 1 }); }
      bus.emit('sound', { name: rec.prof === 'blacksmithing' ? 'clink' : 'itemPickup' });
      this.skillUp(rec.prof, rec.req);
      q.left--;
      if (q.left > 0) this.game.combat.later(0.25, () => this.craftNext()); else this.queue = null;
    }, { noPose: rec.prof === 'blacksmithing' });
  }
  /** Basic Campfire: a fire to cook at for a minute and a half. */
  campfire() {
    const p = this.me, g = this.game;
    if (p.swimming) return this.err("You can't do that while swimming");
    if (p.inCombat) return this.err("You can't do that while in combat");
    return this.channel('Basic Campfire', 'campfire', 2, () => {
      const fx = -Math.sin(p.facing), fz = -Math.cos(p.facing), x = p.pos.x + fx * 1.8, z = p.pos.z + fz * 1.8;
      const pos = new THREE.Vector3(x, g.world.heightAt(x, z), z), model = campfireModel();
      model.position.copy(pos); g.scene.add(model);
      const flame = this.app.fx?.attach('campfire', pos.clone(), { scale: 0.7 });
      this.fires.push({ pos, model, flame, t: CAMPFIRE_T });
      bus.emit('sound', { name: 'fireCrackle', pos });
    });
  }

  // ---------------------------------------------------------------- frame
  update(dt) {
    const p = this.me; if (!p) return;
    // mining: swing the pick while the cast runs
    if (this.swinging && p.casting?.id === 'prof') { this.swingT = (this.swingT || 0) - dt; if (this.swingT <= 0) { this.swingT = 0.9; p.model?.play?.('attack1h'); bus.emit('sound', { name: 'stoneKnock', pos: p.pos }); } }
    else this.swinging = null;
    for (let i = this.respawn.length - 1; i >= 0; i--) {
      const r = this.respawn[i]; r.t -= dt; if (r.t > 0 || !this.world) continue;
      this.respawn.splice(i, 1);
      const test = (WHERE[this.zone] || {})[r.type]; if (!test) continue;
      for (let k = 0; k < 400; k++) {
        const x = this.rng.range(-440, 440), z = this.rng.range(-440, 440);
        if (!this.world.hf.inBounds(x, z, 30) || this.world.heightAt(x, z) < WATER_Y + 0.6 || this.world.hf.maskAt(x, z, M.ROAD) > 0.2 || !test(this.world, x, z)) continue;
        if (Math.hypot(p.pos.x - x, p.pos.z - z) < 30 || this.nodes.some(n => Math.hypot(n.pos.x - x, n.pos.z - z) < 14)) continue;
        this.addNode(r.type, x, z); break;
      }
    }
    for (let i = this.fires.length - 1; i >= 0; i--) { const f = this.fires[i]; f.t -= dt; if (f.t <= 0) { f.model.parent?.remove(f.model); f.flame?.stop?.(1); this.fires.splice(i, 1); } }
    const b = this.bob;
    if (b) {
      b.t += dt;
      const u = b.unit, y = WATER_Y - 0.02 + Math.sin(b.t * 2.4) * 0.04 - (b.bit ? Math.max(0, Math.sin((b.t - b.bite) * 9)) * 0.14 : 0);
      u.pos.y = y; u.model.root.position.set(u.pos.x, y, u.pos.z);
      if (!b.bit && b.t >= b.bite) {
        b.bit = true; b.window = 2.6;
        bus.emit('fx', { name: 'splash', pos: u.pos.clone(), scale: 0.8 }); bus.emit('sound', { name: 'splash', pos: u.pos });
      } else if (b.bit && (b.window -= dt) <= 0) this.endFish('The fish got away.');
      if (this.line && this.bob) {
        const tip = new THREE.Vector3(); (this.rod ? this.rod.children[1] : p.model?.root)?.getWorldPosition(tip);
        const a = this.line.geometry.attributes.position; a.setXYZ(0, tip.x, tip.y, tip.z); a.setXYZ(1, u.pos.x, u.pos.y + 0.12, u.pos.z); a.needsUpdate = true;
      }
    }
  }
  /** What the Professions window shows. */
  view() {
    const s = this.skills(), g = this.game;
    return Object.entries(PROFS).map(([id, d]) => ({
      id, name: d.name, icon: d.icon, kind: d.kind, tip: d.tip, skill: s[id] || 1, max: MAX_SKILL,
      tool: id === 'fishing' ? this.tool('fishing')?.name || null : id === 'mining' ? this.tool('mining')?.name || null : undefined,
      recipes: RECIPES.filter(r => r.prof === id).map(r => ({
        id: r.id, name: r.gear ? gearName(r, this.me.cls) : ITEMS[r.makes].name, icon: r.gear ? { head: 'helm', feet: 'boots', hands: 'gloves', shoulders: 'shoulders', legs: 'legs', weapon: this.me.cls === 'warrior' ? 'sword2h' : this.me.cls === 'mage' ? 'staff' : 'mace' }[r.gear.slot] : ITEMS[r.makes].icon,
        rarity: r.gear ? r.gear.rarity : ITEMS[r.makes].rarity, req: r.req, color: this.color(id, r.req), max: this.maxCraft(r), why: this.canCraft(r),
        needs: Object.entries(r.needs).map(([nid, n]) => ({ id: nid, name: ITEMS[nid].name, icon: ITEMS[nid].icon, need: n, have: g.countItem(nid) })),
        where: r.fire ? 'Needs a fire' : r.anvil ? 'Needs an anvil' : '',
      })),
    }));
  }
  /** Minimap dots for tracked nodes. */
  tracked(kind) { return this.nodes.filter(n => n.prof === kind).map(n => ({ x: n.pos.x, z: n.pos.z, kind: 'poi', color: kind === 'mining' ? '#ffd060' : '#70ff70', edge: false })); }
}

const gearName = (rec, cls) => (typeof rec.gear.name === 'object' ? rec.gear.name[cls] || Object.values(rec.gear.name)[0] : rec.gear.name);

// ---------------------------------------------------------------- little models
const MAT = new Map();
const mat = (key, make) => MAT.get(key) || (MAT.set(key, make()), MAT.get(key));
function simpleModel(root, height, radius) { return { root, height, radius, update() {}, dispose() {} }; }
function nodeModel(def, seed) {
  const g = new THREE.Group(), rng = new RNG('node' + seed);
  if (def.prof === 'mining') {
    const rock = new THREE.Mesh(mat('rockGeo', () => new THREE.DodecahedronGeometry(0.9, 0)), mat('rock', () => lambert({ color: 0x6e665c }, { wrap: 0.4 })));
    rock.scale.set(1.3, 0.75, 1.1); rock.position.y = 0.35; rock.castShadow = true; g.add(rock);
    const chunk = mat('chunkGeo', () => new THREE.OctahedronGeometry(0.22, 0));
    const vein = mat('vein' + def.color, () => { const m = lambert({ color: def.color }, { spec: 0.8, shine: 40 }); if (def.glow) { m.emissive = new THREE.Color(def.color); m.emissiveIntensity = 0.9; } return m; });
    for (let i = 0; i < 7; i++) {
      const a = rng.next() * 6.28, h = rng.range(0.25, 0.8), c = new THREE.Mesh(chunk, vein);
      c.position.set(Math.cos(a) * rng.range(0.55, 1.05), h, Math.sin(a) * rng.range(0.45, 0.85)); c.rotation.set(rng.next() * 3, rng.next() * 3, 0); c.scale.setScalar(rng.range(0.7, 1.4));
      g.add(c);
    }
    return simpleModel(g, 1.2, 1);
  }
  const leafGeo = mat('leafGeo', () => { const s = new THREE.Shape(); s.moveTo(0, 0); s.quadraticCurveTo(0.09, 0.22, 0, 0.5); s.quadraticCurveTo(-0.09, 0.22, 0, 0); return new THREE.ShapeGeometry(s); });
  const leaf = mat('leaf' + def.leaf, () => lambert({ color: def.leaf, side: THREE.DoubleSide }, { wrap: 0.5, trans: 0.3 }));
  for (let i = 0; i < 9; i++) { const l = new THREE.Mesh(leafGeo, leaf), a = i / 9 * 6.28 + rng.next() * 0.3; l.rotation.set(-0.35 - rng.next() * 0.35, a, 0, 'YXZ'); l.scale.setScalar(rng.range(0.8, 1.3)); g.add(l); }
  if (def.color) {
    const petal = mat('petal' + def.color, () => { const m = lambert({ color: def.color }, { wrap: 0.5 }); if (def.glow) { m.emissive = new THREE.Color(def.color); m.emissiveIntensity = 0.7; } return m; });
    const heart = mat('heart' + def.heart, () => lambert({ color: def.heart || 0xffd040 }));
    const pg = mat('petalGeo', () => new THREE.SphereGeometry(0.07, 6, 4)), hg = mat('heartGeo', () => new THREE.SphereGeometry(0.045, 6, 4));
    for (let f = 0; f < 3; f++) {
      const fx = rng.range(-0.14, 0.14), fz = rng.range(-0.14, 0.14), fy = rng.range(0.4, 0.55);
      for (let k = 0; k < 5; k++) { const a = k / 5 * 6.28, m = new THREE.Mesh(pg, petal); m.position.set(fx + Math.cos(a) * 0.07, fy, fz + Math.sin(a) * 0.07); m.scale.set(1, 0.5, 1); g.add(m); }
      const h = new THREE.Mesh(hg, heart); h.position.set(fx, fy + 0.02, fz); g.add(h);
    }
  }
  return simpleModel(g, 0.7, 0.4);
}
function bobberModel() {
  const g = new THREE.Group();
  const top = new THREE.Mesh(mat('bobTopGeo', () => new THREE.SphereGeometry(0.09, 10, 6, 0, 6.3, 0, 1.6)), mat('bobRed', () => lambert({ color: 0xd02018 })));
  const bot = new THREE.Mesh(mat('bobBotGeo', () => new THREE.SphereGeometry(0.09, 10, 6, 0, 6.3, 1.55, 1.6)), mat('bobWhite', () => lambert({ color: 0xf0f0e8 })));
  const stick = new THREE.Mesh(mat('bobStick', () => new THREE.CylinderGeometry(0.012, 0.012, 0.16, 5)), mat('bobRed', () => lambert({ color: 0xd02018 })));
  stick.position.y = 0.14; top.position.y = 0.02; bot.position.y = 0.02;
  g.add(top, bot, stick);
  return simpleModel(g, 0.3, 0.2);
}
function rodModel(fancy) {
  const g = new THREE.Group();
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.028, 2.4, 6), lambert({ color: fancy ? 0xc8902a : 0x7a4a24 }));
  pole.position.y = 1.2; g.add(pole);
  const tip = new THREE.Object3D(); tip.position.y = 2.4; g.add(tip);
  g.rotation.x = -1.1; // held out over the water
  return g;
}
function campfireModel() {
  const g = new THREE.Group(), wood = lambert({ color: 0x4a2c14 }), stone = lambert({ color: 0x6a645c });
  for (let i = 0; i < 4; i++) { const l = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.07, 0.8, 6), wood); l.rotation.set(Math.PI / 2 - 0.35, i / 4 * 6.28, 0, 'YXZ'); l.position.y = 0.16; g.add(l); }
  for (let i = 0; i < 8; i++) { const s = new THREE.Mesh(new THREE.DodecahedronGeometry(0.12, 0), stone); const a = i / 8 * 6.28; s.position.set(Math.cos(a) * 0.5, 0.06, Math.sin(a) * 0.5); g.add(s); }
  return g;
}
