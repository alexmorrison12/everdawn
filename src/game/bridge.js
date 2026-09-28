// Glue between gameplay events (bus) and the presentation layers: FX (particles/decals), Audio, camera shake.
// Written defensively: every call is guarded so a missing effect or sound never breaks gameplay.
import * as THREE from 'three';
import { bus } from './events.js';
import { AURAS } from './data/spells.js';
import { MOBS } from './data/mobs.js';
import { M } from '../world/heightfield.js';

const _v = new THREE.Vector3();
const SCHOOL_FX = { fire: 'fireImpact', frost: 'frostImpact', arcane: 'arcaneImpact', shadow: 'shadowImpact', holy: 'holyImpact', nature: 'splash', physical: 'hit' };
const SCHOOL_CAST = { fire: 'castStartFire', frost: 'castStartFrost', holy: 'castStartHoly', shadow: 'castStartShadow', arcane: 'castStartFrost' };

function chest(u) {
  const s = u.model?.sockets?.chest;
  if (s?.getWorldPosition) return s.getWorldPosition(new THREE.Vector3());
  return new THREE.Vector3(u.pos.x, u.pos.y + (u.height || 1.8) * 0.6, u.pos.z);
}
function hand(u) {
  const s = u.model?.sockets?.handR;
  if (s?.getWorldPosition) return s.getWorldPosition(new THREE.Vector3());
  return new THREE.Vector3(u.pos.x, u.pos.y + (u.height || 1.8) * 0.7, u.pos.z);
}
function targetObj(u) { return u.model?.sockets?.chest || u.model?.root || chest(u); }

export class Bridge {
  constructor(engine) {
    this.e = engine;
    this.fx = null; this.audio = null;
    this.castFx = new Map(); this.castSnd = new Map(); this.auraFx = new Map(); this.ground = new Map();
    this.stepT = 0; this.ambT = 0;
    this.offs = [];
  }
  get fxOn() { return !!this.fx; }
  safe(fn) { try { return fn(); } catch (e) { if (!this._warned) { console.warn('[bridge]', e); this._warned = true; } } }
  near(pos, r = 90) { const c = this.e.camera.position; return Math.hypot(pos.x - c.x, pos.z - c.z) < r; }
  play(name, pos, o = {}) { if (!this.audio) return; this.safe(() => this.audio.play(name, { pos, ...o })); }

  attach(fx, audio) {
    this.fx = fx; this.audio = audio;
    const on = (t, f) => this.offs.push(bus.on(t, d => this.safe(() => f(d))));
    on('cast_start', ({ unit: u, spell, id, dur }) => {
      if (!this.near(u.pos)) return;
      const name = spell.fx?.cast || (id === 'hearth' ? 'castArcane' : null);
      if (name && fx) this.castFx.set(u, fx.attach(name, u.model?.sockets?.handR || u.model?.root, { duration: dur }));
      if (spell.sound) this.play(spell.sound, u.pos, { vol: u.kind === 'player' ? 0.9 : 0.5 });
      if (audio && (spell.cast || spell.channel) && u.kind === 'player') this.castSnd.set(u, audio.loop?.('castLoop', { pos: u.pos, vol: 0.35 }));
    });
    on('cast_stop', ({ unit: u, reason }) => {
      this.castFx.get(u)?.stop?.(0.25); this.castFx.delete(u);
      this.castSnd.get(u)?.stop?.(0.2); this.castSnd.delete(u);
      if (reason !== 'success' && u.kind === 'player') this.play('error', null, { vol: 0.4 });
    });
    on('spell_go', ({ unit: u, spell, target, point }) => {
      if (!this.near(u.pos)) return;
      if (spell.fx?.projectile && target && target !== u && fx) fx.projectile(spell.fx.projectile, hand(u), targetObj(target), { speed: spell.speed || 30 });
      if (spell.fx?.self && fx) fx.burst(spell.fx.self, new THREE.Vector3(u.pos.x, u.pos.y + 0.1, u.pos.z), { scale: 1 });
      if (spell.fx?.attach && fx) { const h = fx.attach(spell.fx.attach, u.model?.root); setTimeout(() => h?.stop?.(0.2), (spell.fx.attachDur || 1) * 1000); }
      if (spell.fx?.ground && point && fx) fx.ground(spell.fx.ground, point.clone(), { radius: spell.radius || 8, duration: 1.2 });
      if (spell.launchSound) this.play(spell.launchSound, u.pos);
      if (!spell.cast && !spell.channel && spell.sound && !spell.fx?.cast) this.play(spell.sound, u.pos, { vol: u.kind === 'player' ? 1 : 0.5 });
      if (spell.melee && fx && u.model?.sockets?.handR) fx.swing?.(u.model.sockets.handR, { color: 0xffe0a0 });
    });
    on('spell_hit', ({ unit: u, spell, target }) => {
      if (!target || !this.near(target.pos)) return;
      if (spell.fx?.impact && fx) fx.burst(spell.fx.impact, chest(target), { scale: target.boss ? 2 : 1 });
      if (spell.impactSound) this.play(spell.impactSound, target.pos);
    });
    on('damage', ({ src, dst, amount, crit, melee, school, dot }) => {
      if (!this.near(dst.pos, 70)) return;
      if (melee) {
        if (fx) fx.burst(crit ? 'crit' : 'hit', chest(dst), { scale: dst.boss ? 2 : 1 });
        this.play(crit ? 'crit' : (dst.kind === 'mob' && !MOBS[dst.template]?.family?.includes('humanoid')) ? 'hitFlesh' : 'hitArmor', dst.pos, { vol: src.kind === 'player' || dst.kind === 'player' ? 0.9 : 0.35 });
      }
      if (dst === this.e.game.player && amount > dst.hpMax * 0.08) { this.e.renderer.F.uHurt.value = Math.min(1, this.e.renderer.F.uHurt.value + 0.5); }
      if (crit && src === this.e.game.player && !dot) this.e.cam.shake = Math.max(this.e.cam.shake, 0.35);
      // hit-stop: your melee blows freeze you and the target for a few frames so they land with weight
      if (melee && !dot && src === this.e.game.player && !dst.boss) src.hitStop = dst.hitStop = crit ? 0.1 : 0.05;
      // creature vocal on hit
      const t = dst.template && MOBS[dst.template];
      if (t?.sound?.hit && Math.random() < 0.25) this.play(t.sound.hit, dst.pos, { vol: 0.5, rate: 0.9 + Math.random() * 0.2 });
    });
    on('heal', ({ dst, hot }) => { if (!hot && fx && this.near(dst.pos)) fx.burst('heal', chest(dst)); });
    on('miss', () => {});
    on('death', ({ unit: u }) => {
      const t = u.template && MOBS[u.template];
      if (t?.sound?.death) this.play(t.sound.death, u.pos, { vol: 0.7 });
      if (u.kind === 'player') { this.play('deathPlayer'); fx?.burst?.('death', chest(u)); }
      this.auraFx.forEach((h, k) => { if (k.startsWith(u.id + ':')) { h?.stop?.(0.3); this.auraFx.delete(k); } });
    });
    on('aura_apply', ({ unit: u, aura }) => {
      const name = aura.def.fx || (aura.id === 'frozen' ? 'frozen' : aura.id === 'poison' ? 'poisoned' : aura.id === 'ignite' ? 'burning' : aura.id === 'enrage' ? 'enrage' : null);
      if (!name || !fx || !u.model) return;
      const key = u.id + ':' + aura.id; if (this.auraFx.has(key)) return;
      this.auraFx.set(key, fx.attach(name, u.model.root, { radius: (u.radius || 0.5) * 2.2 }));
    });
    on('aura_remove', ({ unit: u, aura }) => { const key = u.id + ':' + aura.id; this.auraFx.get(key)?.stop?.(0.3); this.auraFx.delete(key); });
    on('level_up', ({ unit: u }) => { fx?.burst('levelUp', new THREE.Vector3(u.pos.x, u.pos.y, u.pos.z)); this.play('levelUp'); this.e.renderer.F.uFlash.value = 0.35; });
    on('quest_accept', () => this.play('questAccept'));
    on('quest_complete', () => { this.play('questComplete'); fx?.burst('questComplete', chest(this.e.game.player)); });
    on('loot_item', e => this.play(e.item?.rarity === 'legendary' ? 'legendary' : e.item?.rarity === 'epic' ? 'epicLoot' : 'itemPickup'));
    on('money', () => this.play('loot'));
    on('error', e => { if (e.unit === this.e.game.player) this.play('error', null, { vol: 0.5 }); });
    on('chat', e => { if (e.ch === 'whisper') this.play('whisper', null, { vol: 0.6 }); });
    on('raid_warning', e => { if (!e.small) this.play('raidWarning', null, { vol: 0.7 }); });
    on('sound', e => this.play(e.name, e.pos, { vol: e.vol ?? 1 }));
    on('music', e => this.audio?.music?.(e.name));
    on('fx', e => { if (fx && e.pos) fx.burst(e.name, e.pos, { color: e.color, scale: e.scale }); });
    on('fx_ground', e => { if (!fx) return; const h = fx.ground(e.name, e.pos, { radius: e.radius, duration: e.duration, angle: e.angle, dir: e.dir, length: e.length, width: e.width, fill: e.telegraph ? 1 : 0, color: e.color }); this.ground.set(e.id, h); });
    on('fx_ground_stop', e => { this.ground.get(e.id)?.stop?.(); this.ground.delete(e.id); });
    on('fx_cone', e => { if (fx) fx.cone(e.name, e.unit.model?.sockets?.mouth || e.unit.model?.root, { length: e.length, angle: e.angle, duration: e.duration }); this.play('fireBreath', e.unit.pos, { vol: 1.2 }); });
    on('fx_projectile', e => { if (fx) fx.projectile(e.name, e.from?.getWorldPosition ? e.from.getWorldPosition(new THREE.Vector3()) : e.from.clone?.() || e.from, e.to?.model ? targetObj(e.to) : e.to, { speed: e.speed || 24, arc: e.arc || 0, color: e.color }); });
    on('shake', e => { this.e.cam.shake = Math.max(this.e.cam.shake, e.amount || 1); });
    on('blink', () => this.play('blink'));
    on('charge', e => this.play('charge', e.unit.pos));
    on('boss_phase', ({ phase }) => { if (this.e.mode === 'raid') this.forceMusic(phase === 3 ? 'raidP3' : phase === 2 ? 'raidP2' : 'raid'); });
    on('raid_state', ({ state }) => {
      if (state === 'victory') { this.forceMusic(null); try { this.audio?.music('victory', { then: 'vale' }); } catch { } }
      else if (state === 'wipe') { try { this.audio?.stinger?.('wipe'); } catch { } this.forceMusic('danger'); }
      else if (state === 'prepull') this.wantMusic('danger');
    });
    on('level_up', () => { try { this.audio?.duck?.(0.6, 2.5); } catch { } });
    on('engage', ({ a, b }) => { const t = b.template && MOBS[b.template]; if (t?.sound?.aggro && a === this.e.game.player && !b._aggroSnd) { b._aggroSnd = true; this.play(t.sound.aggro, b.pos, { vol: 0.8 }); } });
  }

  // ------------------------------------------------------------------ music director
  wantMusic(track) {
    if (!this.audio) return;
    if (this.musicWant !== track) { this.musicWant = track; this.musicT = 0; }
  }
  musicTick(dt) {
    if (!this.audio || !this.musicWant) return;
    this.musicT += dt;
    if (this.musicWant !== this.musicNow && (this.musicT > 3 || !this.musicNow)) { this.musicNow = this.musicWant; try { this.audio.music(this.musicNow); } catch { } }
  }
  forceMusic(track) { this.musicWant = this.musicNow = track; try { this.audio?.music(track); } catch { } }

  // positional loops (waterfall, forge, campfire, portal lava), per world: travel stops one zone's and starts the other's
  worldLoops(world) {
    this.world = world;
    if (!this.audio || world.loops) return;
    const L = world.settle.lights, P = [];
    if (world.waterfall?.userData.mist) P.push(['waterfall', world.waterfall.userData.mist, 1]);
    for (const f of L.forges) P.push(['fireCrackle', f, 0.7]);
    for (const c of L.campfires) P.push(['fireCrackle', c, 0.9]);
    if (world.settle.portal) P.push(['lava', { x: world.settle.portal.x, y: world.settle.portal.y, z: world.settle.portal.z }, 0.8]);
    world.loops = P.map(([n, pos, vol]) => this.safe(() => this.audio.loop(n, { pos, vol })));
    this.loops = world.loops;
  }

  // world ambience: persistent emitters at settlement anchors (kept per world so travel can take them down)
  worldAnchors(world) {
    const fx = this.fx; if (!fx || world.fxHandles) return;
    const L = world.settle.lights, H = world.fxHandles = [];
    const at = (...a) => { const h = fx.attach(...a); if (h) H.push(h); };
    this.safe(() => {
      for (const p of L.chimneys) at('chimneySmoke', p);
      for (const p of L.torches) at('torch', p);
      for (const p of L.forges) at('campfire', p, { scale: 0.6 });
      for (const p of L.campfires) at('campfire', p);
      if (world.settle.portal) at('portal', new THREE.Vector3(world.settle.portal.x, world.settle.portal.y - 2.2, world.settle.portal.z), { facing: world.settle.portal.rot + Math.PI, scale: 1.35 });
      if (world.zone !== 'crown') at('volcanoSmoke', new THREE.Vector3(0, world.heightAt(0, -410) + 8, -410));
      if (world.waterfall?.userData.mist) at('waterfallMist', world.waterfall.userData.mist, { width: 9 });
    });
  }
  /** Leaving a zone: its fire, smoke and sound anchors stop (they'd float in the next zone otherwise). */
  leaveWorld(world) {
    for (const h of world.fxHandles || []) this.safe(() => h.stop?.(0));
    world.fxHandles = null;
    for (const l of world.loops || []) this.safe(() => l?.stop?.(0.5));
    world.loops = null;
  }

  // per-frame: footsteps, ambience mix, listener, hurt/flash decay
  update(dt, player, hf, night = 0) {
    const R = this.e.renderer.F;
    R.uHurt.value = Math.max(0, R.uHurt.value - dt * 1.5);
    R.uFlash.value = Math.max(0, R.uFlash.value - dt * 0.8);
    if (!this.audio || !player) return;
    this.safe(() => this.audio.setListener(player.pos, this.e.cam.yaw));
    // footsteps
    const sp = Math.abs(player.stateAnim.speed || 0) + Math.abs(player.stateAnim.strafe || 0);
    if (sp > 0.5 && player.grounded && !player.swimming) {
      this.stepT -= dt * (sp / 7.2);
      if (this.stepT <= 0) {
        this.stepT = 0.36;
        let surf = 'footGrass';
        if (hf) { if (hf.maskAt(player.pos.x, player.pos.z, M.COBBLE) > 0.4) surf = 'footStone'; else if (hf.maskAt(player.pos.x, player.pos.z, M.ROAD) > 0.4) surf = 'footDirt'; }
        else surf = 'footStone';
        this.play(surf, null, { vol: 0.35, rate: 0.9 + Math.random() * 0.2 });
      }
    }
    this.musicTick(dt);
    // ambience (world only)
    this.ambT -= dt;
    if (this.ambT <= 0 && hf) {
      this.ambT = 0.5;
      const x = player.pos.x, z = player.pos.z;
      const forest = hf.maskAt(x, z, M.FOREST), dl = Math.hypot((x + 70) / 80, (z + 42) / 64), wf = Math.hypot(x + 70, z + 105);
      const village = Math.hypot(x - 10, z - 150) < 60 ? 1 : 0;
      // music by place and time
      const eliteFight = player.inCombat && [...player.threat.keys(), ...(player.target ? [player.target] : [])].some(u => u && (u.elite || u.rare) && !u.dead);
      const dangerZone = Math.hypot(x - 165, z + 135) < 70 || Math.hypot(x - 172, z - 190) < 50 || Math.hypot(x, z + 282) < 60;
      this.wantMusic(eliteFight || dangerZone ? 'danger' : night > 0.6 ? 'night' : village ? 'village' : 'vale');
      this.safe(() => this.audio.ambience({
        birds: (0.35 + forest * 0.5) * (1 - night), wind: 0.25 + Math.min(0.5, Math.max(0, player.pos.y - 20) / 60),
        water: Math.max(0, 1.2 - dl) * 0.8, waterfall: Math.max(0, 1 - wf / 70), crickets: night * 0.8,
        fire: Math.max(0, 1 - Math.hypot(x - 172, z - 190) / 25) + Math.max(0, 1 - Math.hypot(x - 36, z - 171) / 18) * 0.6,
        tavern: Math.max(0, 1 - Math.hypot(x + 16, z - 126) / 16) * 0.8, lava: Math.max(0, 1 - Math.hypot(x, z + 282) / 60),
      }));
    }
  }
  detach() { for (const o of this.offs) o(); this.offs = []; }
}
