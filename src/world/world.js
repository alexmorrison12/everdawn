// Assembles Everdawn Vale: height field, terrain, sky, lights, water, grass, forest.
import * as THREE from 'three';
import { SunLight } from 'three/addons/lights/SunLight.js';
import { Heightfield } from './heightfield.js';
import { Terrain } from './terrain.js';
import { Sky } from './sky.js';
import { Water } from './water.js';
import { Grass } from './grass.js';
import { Forest } from './trees.js';
import { terrainLayers } from '../engine/paint.js';
import { G } from '../engine/materials.js';
import { PLACES } from './zone.js';
import { buildSettlements } from './village.js';
import { buildWaterfall } from './waterfall.js';
import { Clutter } from './clutter.js';
import { buildWebs } from './webs.js';
import { CrownHeightfield, buildCapital, CITY, CROWN } from './crown.js';

let LAYERS = null; // painted terrain layers, shared by every zone

const tick = () => new Promise(r => setTimeout(r, 0));

export class World {
  /** zone: 'vale' (Everdawn Vale) | 'crown' (the Crownlands and Aurelion) */
  constructor(zone = 'vale') {
    this.zone = zone;
    this.scene = new THREE.Scene();
    this.colliders = [];
  }
  async build(progress) {
    const P = (a, b, label) => f => progress(a + (b - a) * f, label);
    const crown = this.zone === 'crown';
    this.hf = crown ? new CrownHeightfield(11) : new Heightfield(7);
    await this.hf.build(P(0, 0.3, crown ? 'Raising the Crownlands' : 'Shaping the valley'));
    progress(0.32, 'Painting the land'); await tick();
    const layers = LAYERS ||= terrainLayers(512);
    progress(0.45, 'Raising terrain'); await tick();
    this.terrain = new Terrain(this.hf, layers);
    this.scene.add(this.terrain.group);
    this.sky = new Sky();
    this.scene.add(this.sky.mesh);
    // lights
    this.sun = new SunLight(0xffffff, 3);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    this.sun.shadow.camera.near = 1;
    this.sun.shadow.camera.far = 220;
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.04;
    this.sun.shadow.radius = 2.5;
    this.scene.add(this.sun);
    this.hemi = new THREE.HemisphereLight(0xbcd4f0, 0x5a6a3a, 1.2);
    this.scene.add(this.hemi);
    this.setTime(0.64);
    progress(0.5, crown ? 'Building Aurelion' : 'Building Dawnhollow'); await tick();
    this.settle = crown ? buildCapital(this) : buildSettlements(this);
    this.scene.add(this.settle.group);
    this.colliders.push(...this.settle.colliders);
    progress(0.58, 'Growing Whisperwood'); await tick();
    const V = PLACES.village, CP = CROWN.places;
    const excl = crown ? [{ x: CITY.x, z: CITY.z, r: CITY.r + 12 }, { x: CP.camp.x, z: CP.camp.z, r: 28 }, { x: CP.quarry.x, z: CP.quarry.z, r: 44 }, { x: CP.entrance.x, z: CP.entrance.z, r: 18 }, { x: 290, z: 0, r: 120 }, { x: -80, z: 0, r: 34 }, { x: -118, z: 0, r: 30 }, { x: -48, z: 0, r: 20 }] // the city, camps, gate, harbour and the Valley of Kings
      : [{ x: V.x, z: V.z, r: V.r * 0.95 }, { x: PLACES.portal.x, z: PLACES.portal.z, r: 30 }, { x: PLACES.ruins.x, z: PLACES.ruins.z, r: 26 }, { x: -24, z: 66, r: 14 }, { x: PLACES.pass.x, z: PLACES.pass.z, r: 16 }];
    for (const c of this.settle.colliders) excl.push({ x: c.x, z: c.z, r: (c.type === 'box' ? Math.max(c.hw, c.hd) : c.r) + 2.5 });
    this.forest = new Forest(this.hf, this.scene, excl);
    const n = this.forest.scatter();
    this.scene.add(this.forest.group);
    this.colliders.push(...this.forest.colliders);
    progress(0.8, `Planted ${n} trees`); await tick();
    if (!crown) this.scene.add(buildWebs(this.hf, this.forest));
    this.clutter = new Clutter(this.hf, excl);
    const nc = this.clutter.scatter();
    this.scene.add(this.clutter.group);
    this.colliders.push(...this.clutter.colliders);
    progress(0.85, `Scattered ${nc} stones and flowers`); await tick();
    this.water = crown ? new Water(this.sky, { x: 560, z: 0, w: 1000, d: 1500 }) : new Water(this.sky);
    this.scene.add(this.water.mesh);
    this.grass = new Grass(this.terrain);
    this.scene.add(this.grass.mesh);
    if (!crown) { this.waterfall = buildWaterfall(this.hf); this.scene.add(this.waterfall); }
    this.rings = []; this.settle.group.traverse(o => { if (o.name === 'mage-ring') this.rings.push(o); });
    this.dayLength = 1800; // seconds per full day
    this.tod = 0.6;
    progress(0.9, 'Waking the realm'); await tick();
  }
  setTime(t) {
    this.tod = t;
    this.sky.setTime(t);
    // windows and lamps glow after dusk
    const night = Math.max(0, Math.min(1, (Math.abs(t - 0.5) - 0.24) / 0.08));
    const km = this.settle && this.settle.group.getObjectByName('kit-window');
    if (km) { km.material.emissiveIntensity = night * 1.6; }
    const gm = this.settle && this.settle.group.getObjectByName('kit-glow');
    if (gm) gm.material.color.setRGB(1.6 + night * 2.4, 0.9 + night * 1.4, 0.35 + night * 0.6);
    this.night = night;
    this.sun.color.copy(this.sky.sunColor);
    this.sun.intensity = this.sky.sunIntensity;
    this.sun.position.copy(G.uSunDir.value);
    this.hemi.color.copy(this.sky.ambColor);
    this.hemi.groundColor.copy(this.sky.gndColor);
    this.hemi.intensity = this.sky.hemiIntensity;
  }
  update(dt, cam, focus) {
    for (const a of this.settle.animated) a.obj.rotation.z += a.spin * dt;
    for (const r of this.rings || []) r.rotation.z += r.userData.spin * dt;
    // day/night cycle (sky + lights every ~0.5 s of game time is plenty)
    if (this.cycle !== false) {
      this.tod = (this.tod + dt / this.dayLength) % 1;
      this._todT = (this._todT || 0) + dt;
      if (this._todT > 0.5) { this._todT = 0; this.setTime(this.tod); }
    }
    G.uCamPos.value.copy(cam.position);
    this.terrain.update(cam.position);
    this.forest.update(cam.position);
    this.clutter?.update(cam.position);
    (this._crops ??= this.scene.getObjectByName('crops') || false)?.userData.update?.(cam.position);
    this.grass.update(focus);
    this.sky.mesh.position.copy(cam.position);
  }
  heightAt(x, z) { return this.hf.heightAt(x, z); }
}
