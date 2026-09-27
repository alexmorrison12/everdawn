// The Ember Maw: the raid arena inside Ember Peak. A basalt disc ringed by a molten moat, towering walls open to
// the sky, rock spires, a dragon's hoard and whelp nests. Five elemental palettes share the same layout.
import * as THREE from 'three';
import { RNG, Simplex, smoothstep } from '../core/noise.js';
import { lambert, G, FOG_GLSL_PARS } from '../engine/materials.js';
import { Canvas, tileNoise, voronoi } from '../engine/paint.js';
import { MeshBuilder, blob, tube, linColor } from '../engine/geom.js';
import { Sky } from './sky.js';

export const ELEMENTS = {
  ember: { name: 'Ember', lava: 0xff5a10, hot: 0xffd070, rock: 0x5a4a44, fog: 0x3a1a10, fogD: 0.0065, amb: 0x6a3a2a, gnd: 0xff6a20, moon: 0xffc8a0, time: 0.86, sky: [0x220806, 0x6a1a0a] },
  frost: { name: 'Frost', lava: 0x40b8ff, hot: 0xe0fbff, rock: 0x62748a, fog: 0x10243a, fogD: 0.006, amb: 0x5a7aa0, gnd: 0x40a0ff, moon: 0xd0e8ff, time: 0.9, sky: [0x040a1a, 0x1a3a6a] },
  venom: { name: 'Venom', lava: 0x60ff30, hot: 0xe0ffa0, rock: 0x4a5440, fog: 0x14240c, fogD: 0.0065, amb: 0x4a6a3a, gnd: 0x60ff40, moon: 0xd8ffc0, time: 0.88, sky: [0x060e04, 0x1a3a10] },
  storm: { name: 'Storm', lava: 0x8a60ff, hot: 0xe8e0ff, rock: 0x505070, fog: 0x160f30, fogD: 0.006, amb: 0x5a5a9a, gnd: 0x9070ff, moon: 0xe0d8ff, time: 0.9, sky: [0x06061a, 0x2a1a5a] },
  shadow: { name: 'Shadow', lava: 0xb030ff, hot: 0xf0c0ff, rock: 0x3e3446, fog: 0x160a20, fogD: 0.007, amb: 0x4a3a5a, gnd: 0xa040ff, moon: 0xe0c8f0, time: 0.92, sky: [0x08040c, 0x2a0a3a] },
};

const R_FLOOR = 46, R_MOAT = 62, R_WALL = 70;

function basaltTexture(seed = 5) {
  const S = 512, nz = new Simplex(seed);
  const hh = (x, y, k) => { let h = Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(seed * 97 + k, 2246822519); h = Math.imul(h ^ (h >>> 13), 1274126177); h ^= h >>> 16; return (h >>> 0) / 4294967296; };
  const cr = (x, y) => [hh(x, y, 1), hh(x, y, 2), hh(x, y, 3), hh(x, y, 4)];
  const cv = new Canvas(S);
  const crack = new Float32Array(S * S);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    // domain-warp the lookup so plates are irregular and cracks wander
    const wx = x + tileNoise(nz, x / S, y / S, 3, 2) * 22, wy = y + tileNoise(nz, x / S + 0.5, y / S + 0.3, 3, 2) * 22;
    const v = voronoi(((wx % S) + S) % S, ((wy % S) + S) % S, S, 6, cr);
    const e = v.d2 - v.d1;
    const n = tileNoise(nz, x / S, y / S, 6, 3);
    const r = cr(v.id % 6, Math.floor(v.id / 6));
    const lx = (((wx % S) + S) % S - v.cx) / v.cs, ly = (((wy % S) + S) % S - v.cy) / v.cs;
    let f = 0.62 + (r[0] - 0.5) * 0.25 - lx * 0.12 - ly * 0.15 + n * 0.12;
    f *= smoothstep(0.5, 4, e) * 0.6 + 0.4;
    const k = (y * S + x) * 3;
    cv.px[k] = 0.3 * f; cv.px[k + 1] = 0.27 * f; cv.px[k + 2] = 0.26 * f;
    crack[y * S + x] = smoothstep(2.6, 0.5, e) * smoothstep(-0.35, 0.3, n);
  }
  const t = new THREE.DataTexture(cv.toRGBA(crack), S, S, THREE.RGBAFormat);
  t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.generateMipmaps = true; t.minFilter = THREE.LinearMipmapLinearFilter; t.magFilter = THREE.LinearFilter; t.anisotropy = 8; t.needsUpdate = true;
  return t;
}

export class Lair {
  constructor(element = 'ember', seed = 1) {
    this.element = element;
    const E = this.E = ELEMENTS[element];
    const scene = this.scene = new THREE.Scene();
    this.colliders = [];
    this.rng = new RNG(seed);
    this.nz = new Simplex(seed + 3);
    this.lavaCol = new THREE.Color(E.lava); this.hotCol = new THREE.Color(E.hot);
    this.u = { uLava: { value: new THREE.Color(E.lava) }, uHot: { value: new THREE.Color(E.hot) }, uPulse: { value: 0 } };
    this.spots = {
      center: new THREE.Vector3(0, 0, 0),
      dragonSleep: new THREE.Vector3(0, 0, -30),
      raidSpawn: new THREE.Vector3(0, 0, 38),
      nests: [new THREE.Vector3(-40, 3.5, -6), new THREE.Vector3(40, 3.5, -6)],
      entrance: new THREE.Vector3(0, 0, 44),
    };
    this.buildSky(); this.buildLights(); this.buildFloor(); this.buildMoat(); this.buildWalls(); this.buildSpires(); this.buildHoard(); this.buildNests();
  }

  get noWater() { return true; }
  clamp(x, z) { const r = Math.hypot(x, z), m = R_FLOOR - 1.5; return r > m ? [x / r * m, z / r * m] : [x, z]; }
  heightAt(x, z) {
    const r = Math.hypot(x, z);
    if (r > R_FLOOR) return -1.2 - smoothstep(R_FLOOR, R_FLOOR + 4, r) * 0.6;
    let h = this.nz.noise2(x / 18, z / 18) * 0.25;
    // nest ledges
    for (const n of this.spots?.nests || []) { const d = Math.hypot(x - n.x, z - n.z); h = Math.max(h, 3.5 * smoothstep(9, 6, d)); }
    // hoard mound
    const dh = Math.hypot(x, z + 36); h = Math.max(h, 2.2 * smoothstep(12, 2, dh));
    return h;
  }

  buildSky() {
    const E = this.E;
    this.sky = new Sky();
    this.sky.setTime(E.time);
    this.sky.u.uZenith.value.set(E.sky[0]); this.sky.u.uHorizon.value.set(E.sky[1]);
    this.sky.u.uCloud.value = 0.45;
    this.sky.u.uCloudLit.value.set(E.lava).multiplyScalar(0.5); this.sky.u.uCloudShade.value.set(E.sky[0]);
    this.scene.add(this.sky.mesh);
  }

  buildLights() {
    const E = this.E;
    this.hemi = new THREE.HemisphereLight(E.amb, E.gnd, 1.9);
    this.scene.add(this.hemi);
    const moon = this.moon = new THREE.DirectionalLight(E.moon, 2.4);
    moon.position.set(-18, 60, 14); moon.target.position.set(0, 0, -6);
    moon.castShadow = true;
    const sc = moon.shadow.camera; sc.left = -55; sc.right = 55; sc.top = 55; sc.bottom = -55; sc.near = 10; sc.far = 140;
    moon.shadow.mapSize.set(2048, 2048); moon.shadow.bias = -0.0006; moon.shadow.normalBias = 0.05; moon.shadow.radius = 3;
    this.scene.add(moon, moon.target);
    this.lavaLights = [];
    for (let i = 0; i < 4; i++) {
      const a = i / 4 * Math.PI * 2 + Math.PI / 4;
      const l = new THREE.PointLight(E.lava, 60, 45, 1.6);
      l.position.set(Math.cos(a) * 52, 2.5, Math.sin(a) * 52);
      this.scene.add(l); this.lavaLights.push(l);
    }
    this.hoardLight = new THREE.PointLight(0xffc860, 30, 22, 1.5); this.hoardLight.position.set(0, 5, -34); this.scene.add(this.hoardLight);
  }

  buildFloor() {
    const E = this.E;
    const geo = new THREE.CircleGeometry(R_FLOOR + 4, 128, 0, Math.PI * 2);
    geo.rotateX(-Math.PI / 2);
    // densify for bumps: rebuild as a polar grid
    const rings = 60, segs = 160, pos = [], idx = [];
    for (let r = 0; r <= rings; r++) for (let s = 0; s <= segs; s++) {
      const rr = (r / rings) * (R_FLOOR + 5), a = s / segs * Math.PI * 2;
      const x = Math.cos(a) * rr, z = Math.sin(a) * rr;
      pos.push(x, this.heightAt(x, z), z);
    }
    for (let r = 0; r < rings; r++) for (let s = 0; s < segs; s++) { const a = r * (segs + 1) + s, b = a + segs + 1; idx.push(a, a + 1, b, a + 1, b + 1, b); }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
    const tex = basaltTexture(11);
    const mat = lambert({ map: tex, color: new THREE.Color(E.rock).lerp(new THREE.Color(0xffffff), 0.35) }, {
      wrap: 0.3, key: 'lair-floor', uniforms: { ...this.u, uNoiseL: G.uNoiseTex },
      vertex: vs => vs.replace('#include <uv_vertex>', '#include <uv_vertex>\n#ifdef USE_MAP\nvMapUv = (modelMatrix * vec4(position,1.0)).xz / 22.0;\n#endif'),
      fragment: fs => fs
        .replace('#include <common>', '#include <common>\nuniform vec3 uLava; uniform vec3 uHot; uniform float uPulse; uniform sampler2D uNoiseL;')
        .replace('#include <map_fragment>', `#include <map_fragment>
          float crack = texture2D(map, vMapUv).a;
          float rr = length(vWPos.xz);
          float zone = smoothstep(0.42, 0.62, texture2D(map, vWPos.xz / 71.0 + 0.37).a * 0.0 + texture2D(uNoiseL, vWPos.xz / 55.0).r);
          crack *= mix(0.25, 1.0, zone);
          float heat = 0.35 + 0.65 * smoothstep(20.0, 46.0, rr) + uPulse * 0.8;
          float flick = 0.75 + 0.25 * sin(uTime * 2.0 + vWPos.x * 0.3 + vWPos.z * 0.2);
          totalEmissiveRadiance += mix(uLava, uHot, crack * 0.4) * crack * heat * flick * 2.2;
          diffuseColor.a = 1.0;`),
    });
    mat.transparent = false;
    const m = new THREE.Mesh(g, mat); m.receiveShadow = true;
    this.scene.add(m);
    this.floor = m;
  }

  buildMoat() {
    const E = this.E;
    const g = new THREE.RingGeometry(R_FLOOR - 1, R_WALL + 2, 128, 4); g.rotateX(-Math.PI / 2);
    const mat = new THREE.ShaderMaterial({
      uniforms: { uTime: G.uTime, uNoise: G.uNoiseTex, uLava: this.u.uLava, uHot: this.u.uHot, uPulse: this.u.uPulse },
      vertexShader: `varying vec3 vW; void main(){ vec4 w = modelMatrix * vec4(position,1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
      fragmentShader: `uniform float uTime; uniform sampler2D uNoise; uniform vec3 uLava, uHot; uniform float uPulse; varying vec3 vW;
        void main(){
          float a = atan(vW.z, vW.x), r = length(vW.xz);
          vec2 uv = vec2(a * 8.0, r * 0.12);
          float n1 = texture2D(uNoise, uv * 0.3 + vec2(uTime * 0.01, -uTime * 0.02)).r;
          float n2 = texture2D(uNoise, vW.xz / 14.0 + vec2(-uTime * 0.03, uTime * 0.015)).g;
          float crust = smoothstep(0.55, 0.7, n1 * 0.6 + n2 * 0.6);
          vec3 col = mix(uHot * 3.2, uLava * 2.4, smoothstep(0.2, 0.8, n2));
          col = mix(col, uLava * 0.12, crust * 0.85);
          col *= 0.85 + 0.3 * sin(uTime * 1.4 + r * 0.5) + uPulse;
          gl_FragColor = vec4(col, 1.0);
        }`,
    });
    const m = new THREE.Mesh(g, mat); m.position.y = -1.6;
    this.scene.add(m);
  }

  buildWalls() {
    const E = this.E, nz = this.nz;
    const segs = 120, rows = 40, H = 75, pos = [], idx = [], col = [];
    const rockC = new THREE.Color(E.rock), hotC = new THREE.Color(E.lava);
    for (let j = 0; j <= rows; j++) for (let i = 0; i <= segs; i++) {
      const a = i / segs * Math.PI * 2, t = j / rows, y = -3 + t * H;
      let r = R_WALL + nz.noise2(Math.cos(a) * 3 + t * 2, Math.sin(a) * 3) * 6 + nz.noise2(a * 9, t * 9) * 2.2 - Math.sin(t * Math.PI) * 6 + smoothstep(0.7, 1, t) * 16;
      if (Math.abs(Math.atan2(Math.sin(a - Math.PI / 2), Math.cos(a - Math.PI / 2))) < 0.12 && t < 0.2) r += 14; // entrance tunnel mouth (south)
      pos.push(Math.cos(a) * r, y, Math.sin(a) * r);
      const glow = smoothstep(0.62, 0.9, nz.noise2(a * 14, t * 2)) * (1 - t) * 0.9;
      const c = rockC.clone().lerp(new THREE.Color(0x000000), t * 0.4).lerp(hotC, glow * 0.5);
      col.push(c.r, c.g, c.b);
    }
    for (let j = 0; j < rows; j++) for (let i = 0; i < segs; i++) { const a = j * (segs + 1) + i, b = a + segs + 1; idx.push(a, b, a + 1, a + 1, b, b + 1); }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.setIndex(idx); g.computeVertexNormals();
    const mat = lambert({ vertexColors: true, side: THREE.DoubleSide }, { wrap: 0.4, key: 'lair-wall', uniforms: { uNoise2: G.uNoiseTex, ...this.u },
      fragment: fs => fs.replace('#include <common>', '#include <common>\nuniform sampler2D uNoise2; uniform vec3 uLava;')
        .replace('#include <color_fragment>', `#include <color_fragment>
          float strata = texture2D(uNoise2, vec2(atan(vWPos.z, vWPos.x) * 3.0, vWPos.y / 30.0)).r;
          diffuseColor.rgb *= 0.7 + strata * 0.6;
          float fall = smoothstep(0.93, 0.99, texture2D(uNoise2, vec2(atan(vWPos.z, vWPos.x) * 5.0, 0.3)).g) * smoothstep(40.0, 5.0, vWPos.y);
          totalEmissiveRadiance += uLava * fall * (2.5 + sin(uTime * 3.0 + vWPos.y * 0.4));`) });
    const m = new THREE.Mesh(g, mat); m.receiveShadow = true;
    this.scene.add(m);
  }

  buildSpires() {
    const E = this.E, rng = this.rng, nz = this.nz;
    const b = new MeshBuilder();
    const rock = linColor(E.rock);
    for (let i = 0; i < 12; i++) {
      const a = i / 12 * Math.PI * 2 + rng.range(-0.15, 0.15);
      if (Math.abs(Math.atan2(Math.sin(a - Math.PI / 2), Math.cos(a - Math.PI / 2))) < 0.3) continue; // keep the entrance clear
      const r = R_FLOOR + rng.range(-2, 6), h = rng.range(14, 34);
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      const g = new THREE.CylinderGeometry(rng.range(0.3, 1.2), rng.range(3.5, 5.5), h, 7, 8);
      const p = g.attributes.position;
      for (let k = 0; k < p.count; k++) { const px = p.getX(k), py = p.getY(k), pz = p.getZ(k); const d = 1 + nz.noise3(px * 0.4 + i, py * 0.15, pz * 0.4) * 0.45 + nz.noise3(px * 1.3, py * 0.6 + i, pz * 1.3) * 0.18; const lean = (py / h + 0.5) ** 2 * 2.5; p.setXYZ(k, px * d + lean * Math.cos(a), py, pz * d + lean * Math.sin(a)); }
      g.computeVertexNormals();
      b.add(g, new THREE.Matrix4().makeTranslation(x, h / 2 - 2, z), (pp) => { const t = (pp.y + 2) / h; const k = 0.6 + t * 0.6; return [rock[0] * k * 1.4, rock[1] * k * 1.4, rock[2] * k * 1.4]; });
      if (r < R_FLOOR + 2) this.colliders.push({ type: 'circle', x, z, r: 4.2 });
    }
    const mesh = new THREE.Mesh(b.build(), lambert({ vertexColors: true }, { wrap: 0.35, key: 'lair-spire', rim: 0.25, rimColor: E.lava }));
    mesh.castShadow = true; mesh.receiveShadow = true;
    this.scene.add(mesh);
  }

  buildHoard() {
    const rng = this.rng;
    const b = new MeshBuilder();
    const gold = linColor(0xffc040), dark = linColor(0x8a5a10);
    const mound = blob(10, 3, d => 1 + this.nz.noise3(d.x * 2, d.y * 2, d.z * 2) * 0.1, [1, 0.24, 0.8]);
    b.add(mound, new THREE.Matrix4().makeTranslation(0, 0, -37), p => { const t = Math.min(1, Math.max(0, (p.y + 0.5) / 2.5)); return [dark[0] + (gold[0] - dark[0]) * t, dark[1] + (gold[1] - dark[1]) * t, dark[2] + (gold[2] - dark[2]) * t]; });
    const coin = new THREE.CylinderGeometry(0.18, 0.18, 0.05, 8);
    for (let i = 0; i < 420; i++) {
      const a = rng.range(0, Math.PI * 2), r = Math.sqrt(rng.next()) * 12;
      const x = Math.cos(a) * r, z = -37 + Math.sin(a) * r * 0.8;
      const y = Math.max(0, 2.4 * (1 - (r / 12) ** 2)) + 0.05;
      b.add(coin, new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rng.range(-0.6, 0.6), rng.range(0, 6), rng.range(-0.6, 0.6))), new THREE.Vector3(1, 1, 1)), rng.chance(0.5) ? gold : [gold[0] * 1.2, gold[1] * 1.1, gold[2] * 0.8]);
    }
    // gems + a few buried blades and chalices
    const gem = new THREE.OctahedronGeometry(0.35, 0);
    for (let i = 0; i < 40; i++) {
      const a = rng.range(0, Math.PI * 2), r = Math.sqrt(rng.next()) * 10, x = Math.cos(a) * r, z = -37 + Math.sin(a) * r * 0.8, y = Math.max(0, 2.4 * (1 - (r / 12) ** 2)) + 0.2;
      b.add(gem, new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rng.range(0, 3), rng.range(0, 3), 0)), new THREE.Vector3(1, 1.4, 1)), linColor(rng.pick([0xff2040, 0x40a0ff, 0x40ff80, 0xc040ff, 0xffffff])));
    }
    for (let i = 0; i < 9; i++) {
      const a = rng.range(0, Math.PI * 2), r = rng.range(2, 9), x = Math.cos(a) * r, z = -37 + Math.sin(a) * r * 0.8, y = Math.max(0, 2.4 * (1 - (r / 12) ** 2));
      const m = new THREE.Matrix4().compose(new THREE.Vector3(x, y + 0.8, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rng.range(-0.4, 0.4), rng.range(0, 6), rng.range(-0.4, 0.4))), new THREE.Vector3(1, 1, 1));
      b.add(new THREE.BoxGeometry(0.12, 1.8, 0.04), m, linColor(0xd0d8e0));
      b.add(new THREE.BoxGeometry(0.6, 0.1, 0.12), m.clone().multiply(new THREE.Matrix4().makeTranslation(0, 0.55, 0)), linColor(0xc09030));
    }
    const mat = lambert({ vertexColors: true }, { wrap: 0.3, spec: 1.4, shine: 40, rim: 0.3, rimColor: 0xffe0a0, key: 'hoard' });
    const mesh = new THREE.Mesh(b.build(), mat); mesh.receiveShadow = true; mesh.castShadow = true;
    this.scene.add(mesh);
  }

  buildNests() {
    const E = this.E, rng = this.rng;
    const b = new MeshBuilder();
    const rock = linColor(E.rock), eggC = new THREE.Color(E.lava).lerp(new THREE.Color(0x201010), 0.6);
    for (const n of this.spots.nests) {
      const ledge = blob(8, 2, d => 1 + this.nz.noise3(d.x * 2 + n.x, d.y * 2, d.z * 2) * 0.15, [1, 0.45, 1]);
      b.add(ledge, new THREE.Matrix4().makeTranslation(n.x, 0.2, n.z), p => { const k = 0.6 + Math.max(0, p.y) * 0.12; return [rock[0] * k * 1.5, rock[1] * k * 1.5, rock[2] * k * 1.5]; });
      for (let i = 0; i < 7; i++) {
        const a = rng.range(0, 6.28), r = rng.range(0, 4);
        b.add(blob(0.55, 1, null, [0.8, 1.15, 0.8]), new THREE.Matrix4().makeTranslation(n.x + Math.cos(a) * r, 3.9, n.z + Math.sin(a) * r), [eggC.r, eggC.g, eggC.b]);
      }
      this.colliders.push({ type: 'circle', x: n.x, z: n.z, r: 0.1 });
    }
    const mesh = new THREE.Mesh(b.build(), lambert({ vertexColors: true }, { wrap: 0.4, rim: 0.4, rimColor: E.lava, key: 'nests' }));
    mesh.castShadow = true; mesh.receiveShadow = true;
    this.scene.add(mesh);
  }

  applyAtmosphere() {
    const E = this.E;
    G.uFogColor.value.set(E.fog); G.uFogSunColor.value.set(E.lava).multiplyScalar(0.4);
    G.uFogDensity.value = E.fogD; G.uFogHeight.value = 0.05; G.uFogBase.value = -4;
    G.uSunDir.value.set(-0.3, 0.9, 0.2).normalize();
  }

  update(dt, cam) {
    this.sky.mesh.position.copy(cam.position);
    const t = G.uTime.value;
    for (let i = 0; i < this.lavaLights.length; i++) this.lavaLights[i].intensity = 55 + Math.sin(t * 3 + i * 1.7) * 12 + Math.sin(t * 7.3 + i) * 6;
    this.u.uPulse.value *= Math.exp(-dt * 2);
  }
}
