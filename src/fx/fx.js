// Everdawn VFX — spells, impacts, auras, ground telegraphs, breath, beams, trails, world ambience.
// Everything is procedural (sprite atlas + colour ramps generated at init, ~100 ms) and cheap: GPU-analytic
// particles (written once at spawn, animated in the vertex shader), 2 draw calls for all sprite particles,
// 1 for all projectile ribbons, 1 per 3D-debris type, 1 per decal / beam / shield / portal.
//
// ─── API ─────────────────────────────────────────────────────────────────────────────────────────────────────────
//   const fx = new FX(scene, camera, { heightAt = (x, z) => 0 })
//   fx.update(dt)                          call once per frame AFTER the game moved its objects (reads world matrices)
//
//   fx.burst(name, pos, opts)              one-shot at a point → handle (instant bursts return a no-op handle)
//       opts.scale, opts.color (hex | THREE.Color | [r,g,b] — re-themes any effect), opts.dir (Vector3: attack /
//       travel direction; sprays go against it), opts.follow (Object3D: timed bursts like heal/levelUp follow it),
//       opts.duration (lootBeam: seconds, Infinity = until stop()).
//       Character-centred bursts want `pos` at the FEET; impacts want the hit point (a chest socket is fine — impacts
//       are pulled 0.3-0.4 m toward the camera so they are not hidden inside the body; opts.surface overrides).
//   fx.attach(name, object3D | Vector3, opts) → handle { stop(fade = 0.3), setIntensity(v), alive }
//       follows object3D.getWorldPosition() (+ opts.offset in the object's LOCAL space) every frame; auto-stops when
//       the object is removed from the scene. opts.scale, opts.color, opts.duration (auto stop), opts.maxDist
//       (emission pauses beyond this camera distance). Character loops (shield, renew, burning, frozen, poisoned,
//       enrage, whirlwind, ghostAura) expect the origin at the FEET (shield centre = +1 m, opts.radius for its size).
//       Area loops (fireflies, fallingLeaves, dustMotes) take opts.radius (+ fallingLeaves: height, rate; + wind [x,z]).
//       portal: opts.facing (yaw; the disc faces forward (-sin, 0, -cos)). waterfallMist: opts.width.
//   fx.projectile(name, from, target, opts) → handle { stop(), alive, pos, dir }
//       from: Vector3 | Object3D (its current world position). target: Object3D (homes onto its world position —
//       pass a chest socket, or add opts.targetOffset) | Vector3. opts.speed (m/s, default per spell ≈ 26),
//       opts.onHit(pos), opts.arc (0 = straight homing; > 1 = parabola apex height in metres; 0..1 = fraction of
//       the travel distance — lavaBomb defaults to 0.35),
//       opts.impact (burst name to play on hit, false = none), opts.scale, opts.color.
//   fx.ground(name, pos, opts) → handle { stop(), setFill(v), alive }
//       Decal meshes conformed to the ground with heightAt at creation (lift 5 cm + polygon offset).
//       opts.radius, opts.duration (telegraphs fill 0→1 over it then flash out; pools default to "until stop()"),
//       opts.grow (pools: radius grows by grow m/s — matches Hazards.pool),
//       opts.fill (start fill; without duration it is a manual fill driven by setFill), opts.color,
//       opts.angle (telegraphCone full angle, rad), opts.length / opts.width (telegraphLine, lavaCrack fissure),
//       opts.dir (Vector3 forward, or a number = facing yaw), flamestrike: opts.delay (1 s), opts.burn (2.5 s).
//   fx.cone(name, originObject3D, opts) → handle { stop(), alive }
//       Streams along the origin's -Z axis every frame (position AND direction sub-frame interpolated, so a sweeping
//       head paints a continuous arc) and splashes where the axis meets the ground.
//       opts.length (14 m), opts.angle (full cone angle, 0.6 rad), opts.duration, opts.scale, opts.color, opts.dir.
//   fx.swing(object3D, opts) → handle      melee trail of the blade segment base→tip in the object's local space
//       (default local +Y from 0.22·width to width). opts.color, opts.width (1.1 m), opts.duration (0.3 s record time),
//       opts.trail (0.16 s ribbon length), opts.tip / opts.base (local Vector3s for other rigs).
//   fx.beam(name, from, to, opts) → handle { stop(), alive }
//       from/to: Vector3 | Object3D (followed). opts.duration (default per beam), opts.width, opts.scale, opts.color.
//
//   Extras: FX.NAMES (all names by family), fx.has(name), fx.stats(), fx.onShake = (amount 0..1, pos) => {},
//   fx.setScene(scene, heightAt, { bake: { x, z, extent } }) (move to e.g. the raid lair; bake its floor for soft
//   fade + debris landing), fx.bakeHeight(opts) / fx.useGlobalHeight(), fx.setGroundFade(false), fx.setLight(color)
//   (else smoke/dust lighting follows the scene's hemisphere + sun), fx.clear(), fx.reset(seed), fx.dispose().
//   Soft particles: sprites fade where they intersect the ground (terrain G.uHeightTex, or the baked height field),
//   no depth pre-pass needed. Debris rocks land on the same height field.
//
// ─── EFFECT NAMES ────────────────────────────────────────────────────────────────────────────────────────────────
// projectile  fireball (roiling flame core, fire streak, flame tail, embers, smoke) · pyroblast (2× fireball, swirl,
//             big impact) · frostbolt (3D ice shard, frosty mist, snowflakes) · arcaneMissile (wobbling purple bolt,
//             star core, streak) · shadowBolt (black core, purple rim + swirls, dark smoke) · arrow (3D arrow, faint
//             streak) · spear (3D spear) · lavaBomb (arcing 3D molten rock, fire + smoke trail, splash)
// burst       hit · crit (starburst flare, big sparks, shake) · blood (PG red droplets) · dust · splash (drops + water
//             rings) · charge (dust ring, pebbles) · thunderClap (ground shock ring, dust, bolts) · frostNova (ring of
//             3D ice spikes erupting outward) · holyNova (golden ground ring, motes) · blinkOut / blinkIn (arcane
//             pillar, rune, sparkles out / converging) · fireImpact · fireBlast (instant flame burst on target) ·
//             frostImpact (shatter: 3D ice shards) · arcaneImpact (glyph ring) · shadowImpact · holyImpact (smite:
//             light shaft from above) · arrowHit · lavaSplash · meteorImpact (fireball, shock ring, 3D lava rocks,
//             smoke, glowing ground cracks, shake) · eruption (cracks glow 0.9 s → lava fountain) · whelpSpawn (flame
//             puff) · enrageBurst · spawnPuff · questComplete (sparkle burst) · heal (golden swirl) · bigHeal
//             (swirl + light column) · levelUp (2.5 s "ding": gold pillar, 4 rings, rising sparks) · lootBeam
//             (rarity-coloured pillar, opts.color) · resurrect (descending light, motes, flash) · death (spirit wisps)
// attach      castFire / castFrost / castHoly / castShadow / castArcane (hand glow + orbiting motes + element bits)
//             · shield (fresnel hex bubble) · renew (golden helix) · burning · frozen (3D ice block, shatters on stop)
//             · poisoned · enrage (red aura) · whirlwind (spinning blade swooshes + dust) · ghostAura · torch · candle
//             (2 held sprites, zero per-frame cost) · campfire · chimneySmoke · fireflies · fallingLeaves · dustMotes
//             · waterfallMist · portal (6 m fiery vortex disc, spiralling embers, rim flames) · volcanoSmoke (250 m
//             plume + lava embers, visible from 600 m+)
// ground      telegraphCircle / telegraphCone / telegraphLine (fill-up warnings, crisp AA edges) · firePool ·
//             frostPool · poisonPool · voidPool · stormPool · consecrate (rotating golden rune circle) · lavaCrack
//             (radial, or a fissure with opts.length) · flamestrike (fiery rune telegraph → pillar of fire → burning
//             ground)
// cone        fireBreath · frostBreath · venomBreath · stormBreath (with lightning) · shadowBreath
// beam        lightning (forking, re-jagged at 24 Hz) · holyBeam (helix) · healBeam · drainLife (wavy, motes flow
//             back to the caster) · arcaneBeam · frostBeam · fireBeam   (aliases: holy, shadow, arcane, frost, fire)
// swing       (fx.swing) melee blade trail
import * as THREE from 'three';
import { RNG } from '../core/noise.js';
import { G } from '../engine/materials.js';
import { buildTextures } from './textures.js';
import { ParticlePool, Anchors, makeParticleMaterial, STRIDE, F } from './particles.js';
import { MeshFX } from './meshes.js';
import { BURSTS } from './bursts.js';
import { LOOPS } from './loops.js';
import { PROJECTILES } from './projectiles.js';
import { GROUND, Decal } from './ground.js';
import { BREATHS } from './breath.js';
import { BEAMS, Beam, SwingTrail } from './beams.js';
import { Inst, tintOf, NO } from './inst.js';
export { Inst, tintOf };

const _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _q = new THREE.Quaternion();
const NOOP_HANDLE = { stop() {}, setIntensity() {}, setFill() {}, alive: false };

// Projectiles: homing (or arcing) motion toward a moving Object3D / fixed Vector3.
class Projectile extends Inst {
  constructor(fx, recipe, from, target, opts) {
    super(fx, recipe, opts);
    this.fixed = from.clone ? from.clone() : new THREE.Vector3().copy(from);
    this.target = target; this.speed = opts.speed ?? recipe.speed ?? 26;
    this.arc = opts.arc ?? recipe.arc ?? 0; this.onHit = opts.onHit;
    this.tOff = opts.targetOffset || null;
    this.dir = new THREE.Vector3(0, 0, -1); this.tpos = new THREE.Vector3();
    this.start0 = this.fixed.clone(); this.traveled = 0; this.total = 0;
    this.maxLife = opts.maxLife ?? 12;
    this.base = this.fixed.clone();
    this.spin = 0;
  }
  targetPos(out) {
    const t = this.target;
    if (t?.isObject3D) t.getWorldPosition(out); else out.copy(t);
    if (this.tOff) out.add(this.tOff);
    return out;
  }
  readPos(out) { return out.copy(this.fixed); }
  start() {
    this.targetPos(this.tpos);
    this.total = Math.max(0.01, this.start0.distanceTo(this.tpos));
    this.dir.subVectors(this.tpos, this.start0).normalize();
    return super.start();
  }
  update(dt) {
    if (!this.stopping) {
      this.targetPos(this.tpos);
      const step = this.speed * dt;
      let hit = false;
      if (this.arc > 0) {
        this.traveled += step;
        const s = Math.min(1, this.traveled / this.total);
        _v.lerpVectors(this.start0, this.tpos, s);
        const apex = this.arc > 1 ? this.arc : this.arc * this.total;       // metres, or a fraction of the distance
        _v.y += apex * 4 * s * (1 - s);
        _v2.subVectors(_v, this.fixed);
        if (_v2.lengthSq() > 1e-8) this.dir.copy(_v2).normalize();
        this.fixed.copy(_v);
        hit = s >= 1;
      } else {
        _v.subVectors(this.tpos, this.base);
        const d = _v.length();
        if (d <= step || d < 0.05) { this.base.copy(this.tpos); hit = true; }
        else { _v.multiplyScalar(1 / d); this.dir.copy(_v); this.base.addScaledVector(_v, step); }
        this.fixed.copy(this.base);
        // lateral wobble (arcane missiles), fading as the bolt closes in
        const wob = this.recipe.wobble || 0;
        if (wob && !hit) {
          const fall = Math.min(1, d / 6);
          _v2.set(-this.dir.z, 0, this.dir.x).normalize();
          this.fixed.addScaledVector(_v2, Math.sin(this.age * 13 + this.seed) * wob * fall);
          this.fixed.y += Math.cos(this.age * 11 + this.seed * 2) * wob * 0.7 * fall;
        }
      }
      if (this.age > this.maxLife) hit = true;
      if (hit) {
        super.update(dt);
        this.impact();
        this.stop(this.recipe.fade ?? 0.06);
        return !this.dead;
      }
    }
    return super.update(dt);
  }
  impact() {
    const r = this.recipe, o = this.opts;
    const name = o.impact !== undefined ? o.impact : r.impact;
    if (name) this.fx.burst(name, this.fixed, { scale: this.s * (r.impactScale ?? 1), dir: this.dir, color: o.color });
    try { this.onHit?.(this.fixed.clone()); } catch (e) { console.error(e); }
  }
}

// Cone streams (dragon breath): origin socket, direction = the socket's -Z axis in world space.
class Cone extends Inst {
  constructor(fx, recipe, origin, opts) {
    super(fx, recipe, opts);
    this.obj = origin?.isObject3D ? origin : null;
    if (!this.obj) this.fixed = origin.clone();
    this.wasParented = !!this.obj?.parent;
    this.length = opts.length ?? 14; this.angle = opts.angle ?? 0.6;
    this.dir = new THREE.Vector3(0, 0, -1); this.pdir = new THREE.Vector3(0, 0, -1);
    this.fixedDir = opts.dir ? opts.dir.clone().normalize() : null;
    this.maxDist = Infinity;
  }
  readDir(out) {
    if (this.fixedDir) return out.copy(this.fixedDir);
    if (this.obj) { this.obj.getWorldQuaternion(_q); return out.set(0, 0, -1).applyQuaternion(_q); }
    return out.set(0, 0, -1);
  }
  start() { super.start(); this.readDir(this.dir); this.pdir.copy(this.dir); return this; }
  update(dt) { this.pdir.copy(this.dir); this.readDir(this.dir); return super.update(dt); }
}

export class FX {
  constructor(scene, camera, { heightAt = (x, z) => 0, seed = 1, ring = 16384, ringAlpha = 8192, held = 1536, heldAlpha = 512, bakeHeight = null } = {}) {
    this.scene = scene; this.camera = camera; this.heightAt = heightAt;
    this.time = 0; this.rng = new RNG(seed); this.bt = 0; this.curTint = null;
    const t0 = performance.now();
    this.tex = buildTextures();
    this.anchors = new Anchors(1024);
    this.u = {
      uFxTime: { value: 0 }, uRamp: { value: this.tex.ramps }, uRampRows: { value: this.tex.rampRows },
      uAnchors: { value: this.anchors.tex }, uAtlas: { value: this.tex.atlas }, uGroundFade: { value: 1 },
      uLight: { value: new THREE.Color(1, 1, 1) },
      // height field used for soft ground fade + debris landing: the terrain's global texture unless baked
      uHeightTex: { value: G.uHeightTex.value }, uHeightInfo: { value: new THREE.Vector4().copy(G.uHeightInfo.value) },
    };
    this.heightMode = 'global';
    this.group = new THREE.Group(); this.group.name = 'fx';
    const mat = makeParticleMaterial(this.u);
    this.pools = {
      alpha: new ParticlePool('alpha', ringAlpha, heldAlpha, mat, 20),
      add: new ParticlePool('add', ring, held, mat, 24),
    };
    this.group.add(this.pools.alpha.mesh, this.pools.add.mesh);
    this.meshFx = new MeshFX(this);
    scene.add(this.group);
    this.tasks = [];
    this.onShake = null;            // optional hook: (amount 0..1, worldPos) → camera shake
    this.lights = null; this._lightT = 0;
    if (bakeHeight) this.bakeHeight(bakeHeight === true ? {} : bakeHeight);
    this.initMs = performance.now() - t0;
  }

  // ------------------------------------------------------------------ public API
  update(dt) {
    dt = Math.min(Math.max(dt || 0, 0), 0.1);
    this.time += dt;
    this.u.uFxTime.value = this.time;
    if (this.heightMode === 'global') { this.u.uHeightTex.value = G.uHeightTex.value; this.u.uHeightInfo.value.copy(G.uHeightInfo.value); }
    this.updateLight(dt);
    const T = this.tasks;
    let w = 0;
    for (let i = 0; i < T.length; i++) {
      const t = T[i];
      let keep;
      try { keep = t.update(dt); } catch (e) { console.error('[fx]', t.recipe?.name, e); t.end?.(); keep = false; }
      if (keep) T[w++] = t;
    }
    T.length = w;
    this.meshFx.update(dt);
    this.pools.alpha.flush(); this.pools.add.flush();
    // skip whole draw calls while a pool has nothing alive
    for (const k in this.pools) { const p = this.pools[k]; p.mesh.visible = this.time <= p.until || p.free.length < p.heldN; }
    this.anchors.flush();
  }

  burst(name, pos, opts = NO) {
    const r = BURSTS[name];
    if (!r) { warn('burst', name); return NOOP_HANDLE; }
    if (typeof r === 'function') {
      // impacts are usually requested at a socket inside the body: pull them out to the surface facing the camera
      const surf = r.surface !== undefined ? (opts.surface ?? r.surface) : 0;
      if (surf > 0) {
        _v2.subVectors(this.camera.position, pos); const L = _v2.length();
        if (L > 1e-3) pos = _v.copy(pos).addScaledVector(_v2, Math.min(surf * (opts.scale ?? 1), L * 0.5) / L).clone();
      }
      this.curTint = opts.color !== undefined ? tintOf(opts.color) : null;
      try { r(this, pos, opts, opts.scale ?? 1); } finally { this.curTint = null; }
      return NOOP_HANDLE;
    }
    const h = new Inst(this, r, opts);
    if (opts.follow?.isObject3D) h.setFollow(opts.follow); else h.fixed = new THREE.Vector3().copy(pos);
    return this.add(h);
  }

  attach(name, obj, opts = NO) {
    const r = LOOPS[name];
    if (!r) { warn('attach', name); return NOOP_HANDLE; }
    const h = new Inst(this, r, opts);
    if (obj?.isObject3D) h.setFollow(obj); else h.fixed = new THREE.Vector3().copy(obj);
    return this.add(h);
  }

  projectile(name, from, target, opts = NO) {
    const r = PROJECTILES[name];
    if (!r) { warn('projectile', name); return NOOP_HANDLE; }
    const f = from?.isObject3D ? from.getWorldPosition(new THREE.Vector3()) : from;
    const h = new Projectile(this, r, f, target, opts);
    h.seed = this.rng.next() * 100;
    return this.add(h);
  }

  ground(name, pos, opts = NO) {
    const r = GROUND[name];
    if (!r) { warn('ground', name); return NOOP_HANDLE; }
    const h = new Decal(this, r, pos, opts);
    return this.add(h);
  }

  cone(name, origin, opts = NO) {
    const r = BREATHS[name];
    if (!r) { warn('cone', name); return NOOP_HANDLE; }
    return this.add(new Cone(this, r, origin, opts));
  }

  swing(obj, opts = NO) { return this.add(new SwingTrail(this, obj, opts)); }

  beam(name, from, to, opts = NO) {
    const r = BEAMS[name];
    if (!r) { warn('beam', name); return NOOP_HANDLE; }
    return this.add(new Beam(this, r, from, to, opts));
  }

  // Everything this module can play, by API family.
  static get NAMES() {
    return { burst: Object.keys(BURSTS), attach: Object.keys(LOOPS), projectile: Object.keys(PROJECTILES), ground: Object.keys(GROUND), cone: Object.keys(BREATHS), beam: Object.keys(BEAMS) };
  }
  has(name) { return !!(BURSTS[name] || LOOPS[name] || PROJECTILES[name] || GROUND[name] || BREATHS[name] || BEAMS[name]); }

  // Disable terrain soft-fade (e.g. inside a raid arena whose floor is not the terrain height field).
  setGroundFade(on) { this.u.uGroundFade.value = on ? 1 : 0; }
  // Bake heightAt into a private 1 m/texel height texture (for arenas / scenes without the terrain texture).
  bakeHeight({ x = 0, z = 0, extent = 80 } = {}) {
    const n = Math.round(extent) * 2 + 1, ox = Math.round(x) - Math.round(extent), oz = Math.round(z) - Math.round(extent);
    const d = new Uint16Array(n * n);
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) d[j * n + i] = THREE.DataUtils.toHalfFloat(this.heightAt(ox + i, oz + j));
    const t = new THREE.DataTexture(d, n, n, THREE.RedFormat, THREE.HalfFloatType);
    t.magFilter = t.minFilter = THREE.LinearFilter; t.needsUpdate = true;
    this.bakedHeight?.dispose();
    this.bakedHeight = t; this.heightMode = 'baked';
    this.u.uHeightTex.value = t; this.u.uHeightInfo.value.set(n, n, ox, oz);
  }
  useGlobalHeight() { this.heightMode = 'global'; }
  // Move the FX layer to another scene (e.g. Vale → raid arena): clears live effects, swaps heightAt, re-detects lights.
  setScene(scene, heightAt = this.heightAt, { bake = null } = {}) {
    this.reset();
    this.scene.remove(this.group);
    this.scene = scene; this.heightAt = heightAt; this.lights = null;
    scene.add(this.group);
    if (bake) this.bakeHeight(bake === true ? {} : bake); else this.useGlobalHeight();
  }
  // Override the light multiplier for non-additive particles (smoke/dust); otherwise sampled from scene lights.
  setLight(color) { this.u.uLight.value.copy(color); this.lights = false; }

  stats() {
    const now = this.time;
    return {
      particles: this.pools.add.alive(now) + this.pools.alpha.alive(now),
      additive: this.pools.add.alive(now), alpha: this.pools.alpha.alive(now),
      spawnedTotal: this.pools.add.spawned + this.pools.alpha.spawned,
      tasks: this.tasks.length, anchors: this.anchors.count(), meshes: this.meshFx.count(),
      heldFree: this.pools.add.free.length + this.pools.alpha.free.length,
    };
  }

  clear() { for (const t of this.tasks) t.end?.(); this.tasks.length = 0; }
  // Kill everything (tasks, live particles, debris) and restart the FX clock — for labs / zone changes.
  reset(seed) {
    this.clear();
    for (const p of Object.values(this.pools)) p.reset();
    this.meshFx.reset();
    this.anchors.reset();
    this.time = 0; this.u.uFxTime.value = 0;
    if (seed !== undefined) this.rng = new RNG(seed);
  }
  dispose() {
    this.clear();
    this.meshFx.dispose();
    for (const p of Object.values(this.pools)) p.geo.dispose();
    this.pools.add.mesh.material.dispose();
    this.anchors.tex.dispose();
    this.scene.remove(this.group);
  }

  // ------------------------------------------------------------------ internals
  add(h) { h.start(); this.tasks.push(h); return h; }
  warnOnce(msg) { if (!warned.has(msg)) { warned.add(msg); console.warn('[fx] ' + msg); } }
  shake(a, pos) { if (this.onShake) { try { this.onShake(a, pos); } catch (e) { /* ignore */ } } }

  updateLight(dt) {
    if (this.lights === false) return;
    this._lightT -= dt;
    if (this._lightT > 0 && this.lights) return;
    this._lightT = 0.5;
    if (!this.lights) {
      let hemi = null, sun = null;
      this.scene.traverse(o => { if (o.isHemisphereLight && !hemi) hemi = o; if (o.isDirectionalLight && !sun) sun = o; });
      if (!hemi && !sun) return;
      this.lights = { hemi, sun };
    }
    const { hemi, sun } = this.lights, c = this.u.uLight.value;
    c.setRGB(0, 0, 0);
    if (hemi) c.r += hemi.color.r * hemi.intensity, c.g += hemi.color.g * hemi.intensity, c.b += hemi.color.b * hemi.intensity;
    if (sun) c.r += sun.color.r * sun.intensity * 0.3, c.g += sun.color.g * sun.intensity * 0.3, c.b += sun.color.b * sun.intensity * 0.3;
    c.multiplyScalar(1 / 2.1);
    c.r = Math.min(Math.max(c.r, 0.12), 1.15); c.g = Math.min(Math.max(c.g, 0.12), 1.15); c.b = Math.min(Math.max(c.b, 0.14), 1.15);
  }

  // Write one particle. pr = compiled preset (see presets.js P()). Velocity args are (radius, angle, angVel) for orbit presets.
  // o: { scale, size, end (end-size mul), life (mul), drag (override), alpha, i, tint:[r,g,b], anchor, held, dt (backdate), rot, yaw, spin }
  spawn(pr, x, y, z, vx, vy, vz, o = NO) {
    const pool = this.pools[pr.pool];
    const rng = this.rng;
    const rr = a => a[0] === a[1] ? a[0] : a[0] + (a[1] - a[0]) * rng.next();
    const life = rr(pr.life) * (o.life ?? 1);
    const slot = o.held ? pool.allocHeld() : pool.nextRing(life);
    if (slot < 0) return -1;
    const d = pool.data, b = slot * STRIDE;
    const sc = o.scale ?? 1;
    const s0 = rr(pr.size) * sc * (o.size ?? 1);
    let flags = pr.flags;
    if (o.held) flags |= F.LOOP;
    d[b] = x; d[b + 1] = y; d[b + 2] = z; d[b + 3] = this.time - (o.dt ?? this.bt);
    d[b + 4] = vx; d[b + 5] = vy; d[b + 6] = vz; d[b + 7] = life;
    d[b + 8] = rr(pr.k0) * sc; d[b + 9] = o.drag ?? rr(pr.k1) * (pr.orbit ? sc : 1); d[b + 10] = rr(pr.turb) * sc;
    let spin = o.spin ?? rr(pr.spin); if (pr.randSpin && rng.next() < 0.5) spin = -spin;
    d[b + 11] = spin;
    d[b + 12] = s0; d[b + 13] = s0 * rr(pr.end) * (o.end ?? 1); d[b + 14] = o.rot ?? rr(pr.rot); d[b + 15] = rr(pr.stretch);
    const c = pr.color, c2 = pr.color2, it = rr(pr.i) * (o.i ?? 1);
    let cr = c[0], cg = c[1], cb = c[2];
    if (c2) { const m = rng.next(); cr += (c2[0] - cr) * m; cg += (c2[1] - cg) * m; cb += (c2[2] - cb) * m; }
    // explicit o.tint multiplies; the effect-level colour (opts.color → curTint) multiplies white-envelope
    // particles and recolours ramp-coloured ones (luminance × colour) so any effect can be re-themed
    let recolor = 0;
    if (pr.tintable !== false) {
      const tn = o.tint, ct = this.curTint;
      if (tn) { cr *= tn[0]; cg *= tn[1]; cb *= tn[2]; }
      else if (ct) {
        if (pr.white) { cr *= ct[0]; cg *= ct[1]; cb *= ct[2]; }
        else recolor = 1 + Math.round(Math.min(1, Math.max(0, ct[0])) * 255) + Math.round(Math.min(1, Math.max(0, ct[1])) * 255) * 256 + Math.round(Math.min(1, Math.max(0, ct[2])) * 255) * 65536;
      }
    }
    d[b + 16] = cr * it; d[b + 17] = cg * it; d[b + 18] = cb * it; d[b + 19] = pr.ramp;
    const sp = pr.sprites; d[b + 20] = sp.length === 1 ? sp[0] : sp[(rng.next() * sp.length) | 0];
    d[b + 21] = pr.add; d[b + 22] = o.anchor ?? -1; d[b + 23] = flags;
    d[b + 24] = rr(pr.alpha) * (o.alpha ?? 1); d[b + 25] = pr.ease; d[b + 26] = o.yaw ?? 0; d[b + 27] = recolor;
    if (o.held) pool.markHeld(slot);
    else {
      const end = d[b + 3] + life;
      if (end > pool.until) pool.until = end;
      if (o.anchor >= 0) this.anchors.touch(o.anchor, this.time + life);
    }
    return slot;
  }

  // random helpers
  r(a, b) { return a + (b - a) * this.rng.next(); }
  // random unit vector (optionally within a cone of half-angle `ang` around dir)
  rdir(out, dir = null, ang = Math.PI) {
    const rng = this.rng;
    const cosA = Math.cos(ang), z = cosA + (1 - cosA) * rng.next(), t = rng.next() * Math.PI * 2, s = Math.sqrt(Math.max(0, 1 - z * z));
    out.set(s * Math.cos(t), s * Math.sin(t), z);
    if (dir) { _q.setFromUnitVectors(_zAxis, dir); out.applyQuaternion(_q); }
    return out;
  }
}
const _zAxis = new THREE.Vector3(0, 0, 1);
const warned = new Set();
function warn(kind, name) { const k = kind + ':' + name; if (!warned.has(k)) { warned.add(k); console.warn(`[fx] unknown ${kind} effect '${name}'`); } }
