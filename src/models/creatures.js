// Everdawn creatures — procedural monsters & critters (character contract: see ARCHITECTURE.md).
//
//   import { createCreature, preloadCreatures } from './models/creatures.js';
//   const c = createCreature('wolf', { variant: 'grey', scale: 1, seed: 7 }); // elite: true → elite variant; seed → size/colour jitter; tint: hex multiplier
//   scene.add(c.root);                                                    // game drives root.position / root.rotation.y
//   c.update(dt, { speed, turn, strafe, grounded, combat, dead, sit });   // every frame (speed m/s along facing, turn rad/s)
//   c.play('attack', { speed: 1 });                                       // one-shots layer over locomotion; returns false if unknown/dead
//   c.setTint(0xffffff, 0.6);                                             // hit flash (fade the amount yourself), 0 = off
//   c.onFootstep = (legId, worldPos, strength) => {};                     // dust puffs / footstep sounds
//   c.setGround((x, z) => heightAt(x, z));                                // optional: feet plant on slopes, body tilts
//   c.dispose();
//
// Instance fields: root, height, radius, sockets{head, chest, mouth, back, handR, handL, + type extras (candle, tail,
// spinner, pawR)}, actions (list), type, variant, elite, scale.
// Every model faces -Z. Deaths hold their last pose; state.dead=true plays death, a true→false transition revives
// (as does play('revive')). play('idle') cancels actions / held poses (sit, sleep, cower, flee...).
//
// Types (variants — elite variant last):
//   wolf     grey, brown, black, greymaw (Old Greymaw: ×1.5, pale, scarred, glowing eyes)
//            attack (lunge bite), pounce, hit, death, howl, sit, sleep, sniff, yawn, scratch (hind paw), shake
//   boar     bristleback, dusky, piglet (×0.5), elder (×1.45, gold tusk bands + nose ring)
//            attack (tusk gore), charge (wind-up: hoof scrape), hit, death, root, snort
//   spider   webwood, venom, cave, broodmother (×1.6)       attack (rear & strike), leap, hit, death (legs curl), rear, tap
//   gurgler  marsh, reef, mud (net), tidecaller (×1.4, shell/gold necklace); opts.weapon 'spear' | 'net'
//            attack (spear jab), throw (net cast), gurgle, cheer, hit, death
//   kobold   brown, grey, tan, waxbeard (Chief Waxbeard ×1.4: wax beard, 3-candle crown, golden pick)
//            attack (pickaxe chop), cower (held), flee (held, arms flail), sniff, scratch, hit, death (candle goes out)
//   bear     brown, black, grizzled, ursoc (×1.4)            attack (paw swipe), roar (rears up), sit, sniff, hit, death
//   critters rabbit (brown, grey, white): hop, graze, situp, flee · deer (doe, buck, fawn): graze (held), alert, flee
//            chicken (white, brown, black): peck, flap, fly · crow (crow, raven): hop, peck, flap, fly (held), caw
//            sheep (white, black, lamb): graze (held), baa, flee · cat (ginger, grey, black, calico): sit, groom, stretch, flee
//            all critters: hit, death
//
// Geometry: smooth-unioned SDF primitives meshed with surface nets, skinned from primitive→bone influence, painted
// into vertex colours (baked AO + gradients + markings) plus rigid parts (eyes, teeth, claws, weapons...), all in ONE
// skinned mesh = 1 draw call (+ shadow). Built once per (type, variant); palette-swap variants reuse the meshed shape
// (recolour only). Each instance owns bones, a skeleton and a material clone (one shared GL program).
import * as THREE from 'three';
import { Rig, Pose } from './creatures/rig.js';
import { Sculpt } from './creatures/sdf.js';
import { GeoAcc } from './creatures/geo.js';
import { creatureMaterial, detailTexture } from './creatures/material.js';
import { wolf } from './creatures/wolf.js';
import { boar } from './creatures/boar.js';
import { spider } from './creatures/spider.js';
import { gurgler } from './creatures/gurgler.js';
import { kobold } from './creatures/kobold.js';
import { rabbit, deer, chicken, crow, sheep, cat } from './creatures/critters.js';
import { bear } from './creatures/bear.js';

const DEFS = { wolf, boar, spider, gurgler, kobold, bear, rabbit, deer, chicken, crow, sheep, cat };
const CACHE = new Map();   // type:variant → built entry (geometry etc.)
const SHAPES = new Map();  // type:shapeKey → meshed SDF shape (palette-free), shared by palette-swap variants
const IDENT = new THREE.Matrix4();

export function registerCreature(type, def) { DEFS[type] = def; }

function buildEntry(type, cfg, def) {
  const t0 = performance.now();
  const rig = new Rig();
  def.rig(rig, cfg);
  const S = new Sculpt(rig);
  def.sculpt(S, cfg);
  const acc = new GeoAcc();
  const mcfg = {
    h: cfg.h ?? 0.03, hg: cfg.hg, paint: def.paint ? (v) => def.paint(v, cfg) : null,
    ao: cfg.ao ?? { dist: 0.035 * (cfg.aoScale ?? 1), str: 0.8 }, grad: cfg.grad ?? { top: 0.18, bottom: 0.32, y0: 0, y1: 0.5, low: 0.22 },
    dtl: cfg.dtl, smoothW: cfg.smoothW ?? 2,
  };
  const skey = cfg.shapeKey !== undefined ? type + ':' + cfg.shapeKey : null;
  let stats;
  const shared = skey && SHAPES.get(skey);
  if (shared && shared.primCount === S.prims.length) stats = S.recolor(shared, acc, mcfg);
  else { stats = S.mesh(acc, mcfg); if (skey) SHAPES.set(skey, S.shape); }
  const sdfVerts = acc.count;
  if (def.parts) def.parts(acc, S, rig, cfg);
  const geo = acc.build();
  const boneInverses = rig.bones.map(b => new THREE.Matrix4().makeTranslation(-b.rest.x, -b.rest.y, -b.rest.z));
  const bb = geo.boundingBox;
  const sphere = new THREE.Sphere(); bb.getBoundingSphere(sphere); sphere.radius *= 1.35;
  const sockets = {};
  for (const [name, [bone, pos]] of Object.entries(def.sockets || {})) sockets[name] = { bone: rig.index(bone), pos: new THREE.Vector3(...pos) };
  const entry = {
    type, cfg, def, rig, geo, boneInverses, sockets, sphere,
    height: def.height ?? bb.max.y, radius: def.radius ?? Math.max(bb.max.x - bb.min.x, bb.max.z - bb.min.z) * 0.35,
    stats: { ms: performance.now() - t0, sdfMs: stats.ms, verts: geo.attributes.position.count, sdfVerts, tris: geo.index.count / 3, bones: rig.bones.length, evals: stats.evals, t: stats.t, recolor: !!stats.recolor },
  };
  return entry;
}

function getEntry(type, opts) {
  const def = DEFS[type];
  if (!def) throw new Error('unknown creature type: ' + type);
  const cfg = def.config(opts.variant, opts);
  const key = type + ':' + cfg.variant + (cfg.elite ? ':elite' : '') + (cfg.key ? ':' + cfg.key : '');
  let e = CACHE.get(key);
  if (!e) { e = buildEntry(type, cfg, def); CACHE.set(key, e); }
  return e;
}

export class Creature {
  constructor(type, entry, opts = {}) {
    const cfg = entry.cfg;
    this.type = type; this.variant = cfg.variant; this.elite = !!cfg.elite;
    // per-instance variety: opts.seed → ±6% size and a subtle brightness / warmth shift (0 or undefined = none)
    const rnd = (k) => { const x = Math.sin((opts.seed || 0) * 12.9898 + k * 78.233) * 43758.5453; return x - Math.floor(x); };
    const vary = opts.seed ? 1 : 0;
    this.scale = (opts.scale ?? 1) * (cfg.scale ?? 1) * (1 + (rnd(1) - 0.5) * 0.12 * vary);
    this.root = new THREE.Object3D(); this.root.name = 'creature:' + type;
    this.pivot = new THREE.Object3D(); this.pivot.scale.setScalar(this.scale); this.root.add(this.pivot);
    this.bones = entry.rig.bones.map(b => { const bone = new THREE.Bone(); bone.name = b.name; bone.position.copy(b.rest); this.pivot.add(bone); return bone; });
    this.skeleton = new THREE.Skeleton(this.bones, entry.boneInverses);
    this.material = creatureMaterial(cfg.mat || entry.def.mat || {});
    if (vary) { const b = 1 + (rnd(2) - 0.5) * 0.16, w = (rnd(3) - 0.5) * 0.08; this.material.userData.u.uColorMul.value.setRGB(b * (1 + w), b, b * (1 - w)); }
    if (opts.tint !== undefined) this.material.userData.u.uColorMul.value.multiply(new THREE.Color(opts.tint));
    this.mesh = new THREE.SkinnedMesh(entry.geo, this.material);
    this.mesh.bind(this.skeleton, IDENT);
    this.mesh.boundingSphere = entry.sphere.clone();
    this.mesh.castShadow = true; this.mesh.receiveShadow = true;
    this.pivot.add(this.mesh);
    this.pose = new Pose(entry.rig);
    this.sockets = {};
    for (const [name, s] of Object.entries(entry.sockets)) {
      const o = new THREE.Object3D(); o.name = name;
      o.position.copy(s.pos).sub(entry.rig.bones[s.bone].rest);
      this.bones[s.bone].add(o); this.sockets[name] = o;
    }
    // every creature exposes the standard sockets; missing ones alias the closest available
    const S = this.sockets;
    S.chest ||= S.back || S.head; S.head ||= S.chest; S.mouth ||= S.head; S.back ||= S.chest;
    S.handR ||= S.mouth; S.handL ||= S.mouth;
    this.height = entry.height * this.scale;
    this.radius = entry.radius * this.scale;
    this.actions = entry.def.actions || [];
    this.ctl = entry.def.controller(this, opts);
    this.entry = entry;
    /** optional callback (legId, worldPosition: Vector3, strength 0..1) fired when a foot plants — dust puffs / footstep sounds */
    this.onFootstep = null;
    const g = this.ctl.gait;
    if (g) {
      const wp = new THREE.Vector3();
      g.onStep = (L) => {
        if (!this.onFootstep) return;
        wp.copy(L.F); this.pivot.localToWorld(wp);
        this.onFootstep(L.id, wp, Math.min(1, Math.abs(g.sSm) / 4 + 0.3));
      };
    }
    if (opts.rest !== true) this.update(0, {});
  }
  update(dt, state = {}) { this.ctl.update(dt, state); }
  /**
   * Optional terrain following: fn(worldX, worldZ) → ground height. Feet plant on the terrain and the body pitches /
   * rolls with the slope (the game still sets root.position.y to the ground height at the root). null disables.
   */
  setGround(fn) {
    const g = this.ctl.gait; if (!g) return;
    if (!fn) { g.ground = null; return; }
    const r = this.root;
    g.ground = (lx, lz) => {
      const s = this.scale, f = r.rotation.y, c = Math.cos(f), sn = Math.sin(f);
      const wx = r.position.x + (lx * c + lz * sn) * s, wz = r.position.z + (-lx * sn + lz * c) * s;
      return (fn(wx, wz) - r.position.y) / s;
    };
  }
  play(action, { speed = 1 } = {}) { return this.ctl.play(action, speed); }
  setTint(hex, amount = 0.5) { const u = this.material.userData.u; u.uTint.value.set(hex); u.uTintAmt.value = amount; }
  dispose() {
    this.root.removeFromParent();
    this.material.dispose(); this.skeleton.dispose();
  }
}

export function createCreature(type, opts = {}) {
  const entry = getEntry(type, opts);
  return new Creature(type, entry, opts);
}

/** Build (and cache) geometry ahead of time, e.g. during the loading screen. list: [type | [type, variant]] */
export function preloadCreatures(list) {
  detailTexture();
  const out = [];
  for (const it of list) { const [type, variant] = Array.isArray(it) ? it : [it]; out.push(getEntry(type, { variant }).stats); }
  return out;
}

/** Free all cached creature geometry (e.g. on zone change). Still-alive creatures re-upload their buffers if rendered. */
export function disposeCreatureCache() {
  for (const e of CACHE.values()) e.geo.dispose();
  CACHE.clear(); SHAPES.clear();
}

export function creatureStats() { return [...CACHE.entries()].map(([k, e]) => ({ key: k, ...e.stats })); }
export const CREATURE_TYPES = () => Object.keys(DEFS);
export function creatureInfo(type) { const d = DEFS[type]; return d && { variants: d.variants, actions: d.actions, sockets: Object.keys(d.sockets || {}), height: d.height, radius: d.radius }; }
/** { type: { variants, actions, sockets, height, radius } } for every registered type */
export function creatureCatalog() { const o = {}; for (const t of Object.keys(DEFS)) o[t] = creatureInfo(t); return o; }
