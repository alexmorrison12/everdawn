// Chunked LOD terrain with skirts, painted texture-array splatting, triplanar cliffs and baked curvature AO.
import * as THREE from 'three';
import { lambert, G } from '../engine/materials.js';
import { MAP } from './zone.js';
import { HF_SAMPLES, M } from './heightfield.js';
import { Simplex } from '../core/noise.js';

const CHUNK = 64;
const NCH = MAP.size / CHUNK;
const LODS = [1, 2, 4, 8];
const LOD_DIST = [110, 240, 460];

export class Terrain {
  constructor(hf, layers) {
    this.hf = hf;
    this.group = new THREE.Group();
    this.group.name = 'terrain';
    this.chunks = [];
    this.makeTextures(layers);
    this.material = this.makeMaterial();
    for (let cz = 0; cz < NCH; cz++) for (let cx = 0; cx < NCH; cx++) {
      const mesh = new THREE.Mesh(undefined, this.material);
      mesh.receiveShadow = true;
      mesh.matrixAutoUpdate = false;
      const ch = { cx, cz, mesh, lod: -1, geos: [], center: new THREE.Vector3((cx + 0.5) * CHUNK - MAP.half, 0, (cz + 0.5) * CHUNK - MAP.half) };
      this.setLod(ch, 3);
      this.chunks.push(ch);
      this.group.add(mesh);
    }
  }

  makeTextures(layers) {
    const size = layers[0].size;
    const data = new Uint8Array(size * size * 4 * layers.length);
    layers.forEach((l, i) => data.set(l.toRGBA(), i * size * size * 4));
    const arr = new THREE.DataArrayTexture(data, size, size, layers.length);
    arr.format = THREE.RGBAFormat;
    arr.colorSpace = THREE.SRGBColorSpace;
    arr.wrapS = arr.wrapT = THREE.RepeatWrapping;
    arr.minFilter = THREE.LinearMipmapLinearFilter;
    arr.magFilter = THREE.LinearFilter;
    arr.generateMipmaps = true;
    arr.anisotropy = 8;
    arr.needsUpdate = true;
    this.layerTex = arr;

    // control masks: two RGBA textures at 1 m/px
    const S = HF_SAMPLES, m = this.hf.mask;
    const a = new Uint8Array(S * S * 4), b = new Uint8Array(S * S * 4);
    for (let k = 0; k < S * S; k++) {
      for (let c = 0; c < 4; c++) { a[k * 4 + c] = m[k * 8 + c]; b[k * 4 + c] = m[k * 8 + 4 + c]; }
    }
    const mk = (d) => { const t = new THREE.DataTexture(d, S, S, THREE.RGBAFormat); t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearFilter; t.needsUpdate = true; return t; };
    this.ctrlA = mk(a); this.ctrlB = mk(b);

    // height texture (half float) for GPU consumers (grass, decals, water depth)
    const hdata = new Uint16Array(S * S);
    for (let k = 0; k < S * S; k++) hdata[k] = THREE.DataUtils.toHalfFloat(this.hf.h[k]);
    const ht = new THREE.DataTexture(hdata, S, S, THREE.RedFormat, THREE.HalfFloatType);
    ht.magFilter = THREE.LinearFilter; ht.minFilter = THREE.LinearFilter; ht.needsUpdate = true;
    G.uHeightTex.value = ht;
    G.uHeightInfo.value.set(S, S, -MAP.half, -MAP.half);

    // macro variation noise
    const nz = new Simplex(99), NS = 256, nd = new Uint8Array(NS * NS * 4);
    for (let y = 0; y < NS; y++) for (let x = 0; x < NS; x++) {
      const u = x / NS, v = y / NS, k = (y * NS + x) * 4;
      // tileable by sampling on a torus
      const f = (fr, o) => nz.noise3(Math.cos(u * 6.2832) * fr + o, Math.sin(u * 6.2832) * fr, Math.cos(v * 6.2832) * fr + Math.sin(v * 6.2832) * fr * 0.7 + o * 3);
      nd[k] = (f(1.2, 0) * 0.5 + 0.5) * 255; nd[k + 1] = (f(3, 5) * 0.5 + 0.5) * 255; nd[k + 2] = (f(8, 9) * 0.5 + 0.5) * 255; nd[k + 3] = 255;
    }
    const nt = new THREE.DataTexture(nd, NS, NS, THREE.RGBAFormat);
    nt.wrapS = nt.wrapT = THREE.RepeatWrapping; nt.magFilter = THREE.LinearFilter; nt.minFilter = THREE.LinearMipmapLinearFilter; nt.generateMipmaps = true; nt.needsUpdate = true;
    this.noiseTex = nt;
    G.uNoiseTex = { value: nt };
  }

  makeMaterial() {
    const mat = lambert({ vertexColors: false }, {
      wrap: 0.25,
      uniforms: { uLayers: { value: this.layerTex }, uCtrlA: { value: this.ctrlA }, uCtrlB: { value: this.ctrlB }, uNoise: { value: this.noiseTex } },
      key: 'terrain',
      vertex: vs => vs
        .replace('#include <common>', '#include <common>\nattribute float ao;\nvarying float vAO;\nvarying vec3 vNrmW;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvAO = ao;\nvNrmW = normal;'),
      fragment: fs => fs
        .replace('#include <common>', `#include <common>
          precision highp sampler2DArray;
          uniform sampler2DArray uLayers; uniform sampler2D uCtrlA; uniform sampler2D uCtrlB; uniform sampler2D uNoise;
          varying float vAO; varying vec3 vNrmW;
          vec3 L(float i, vec2 uv) { return texture(uLayers, vec3(uv, i)).rgb; }
          vec3 tri(float i, vec3 p, vec3 n, float s) {
            vec3 w = pow(abs(n), vec3(4.0)); w /= (w.x + w.y + w.z);
            return L(i, p.zy * s) * w.x + L(i, p.xz * s) * w.y + L(i, p.xy * s) * w.z;
          }`)
        .replace('#include <map_fragment>', `
          vec2 cuv = (vWPos.xz + 512.0 + 0.5) / 1025.0;
          vec4 ca = texture(uCtrlA, cuv), cb = texture(uCtrlB, cuv);
          vec4 nz = texture(uNoise, vWPos.xz / 180.0);
          vec4 nz2 = texture(uNoise, vWPos.xz / 37.0);
          vec2 uv = vWPos.xz;
          // grass with anti-tiling: two rotated scales blended by noise
          vec2 uvr = mat2(0.8, -0.6, 0.6, 0.8) * uv;
          vec3 grass = mix(L(0.0, uv / 5.0), L(0.0, uvr / 11.0), smoothstep(0.35, 0.65, nz2.g));
          // warm/cool macro variation
          grass *= mix(vec3(0.92, 1.0, 0.82), vec3(1.08, 1.02, 0.86), nz.r);
          grass = mix(grass, grass * vec3(1.18, 1.1, 0.72), cb.a * 0.7);    // meadow: golden-green
          vec3 col = grass;
          vec3 forest = mix(L(5.0, uv / 4.0), L(5.0, uvr / 9.0), nz2.b) * 1.22;
          vec3 web = forest * vec3(0.62, 0.6, 0.68) + vec3(0.03, 0.02, 0.05);
          forest = mix(forest, web, cb.b);
          col = mix(col, forest, smoothstep(0.05, 0.6, ca.a + (nz2.r - 0.5) * 0.4));
          col = mix(col, mix(grass, forest, 0.5) * vec3(0.75, 0.72, 0.85), cb.b * (1.0 - ca.a) * 0.6);
          col = mix(col, L(3.0, uv / 6.0), smoothstep(0.2, 0.7, ca.g));
          col = mix(col, L(6.0, uv / 5.0), smoothstep(0.25, 0.75, cb.r + (nz2.g - 0.5) * 0.3));
          vec3 dirt = mix(L(1.0, uv / 4.0), L(1.0, uvr / 9.0), nz2.r);
          float dw = smoothstep(0.15, 0.55, ca.r + (L(1.0, uv / 4.0).r - 0.5) * 0.6 + (nz2.b - 0.5) * 0.3);
          col = mix(col, dirt, dw);
          col = mix(col, L(4.0, uv / 3.5), smoothstep(0.3, 0.7, ca.b));
          col = mix(col, L(7.0, uv / 7.0), smoothstep(0.2, 0.7, cb.g));
          // cliffs: slope + altitude → triplanar rock
          vec3 nw = normalize(vNrmW);
          float slope = 1.0 - nw.y;
          float rockW = smoothstep(0.26, 0.42, slope + (nz2.r - 0.5) * 0.18) ;
          rockW = max(rockW, smoothstep(95.0, 140.0, vWPos.y + nz.g * 30.0) * 0.8);
          vec3 rock = tri(2.0, vWPos, nw, 1.0 / 9.0);
          // volcanic basalt: darken + warm the rock on Ember Peak
          rock = mix(rock, rock * vec3(0.3, 0.27, 0.27) + vec3(0.025, 0.008, 0.0), smoothstep(0.1, 0.6, cb.g));
          col = mix(col, rock, rockW);
          // snow caps on the ring mountains (not the volcano)
          float snow = smoothstep(150.0, 175.0, vWPos.y + nz.b * 25.0) * smoothstep(0.55, 0.3, slope) * (1.0 - cb.g);
          col = mix(col, vec3(0.92, 0.95, 1.0), snow);
          col *= vAO;
          // molten rivers running down the volcano from the crater
          vec2 pk = vWPos.xz - vec2(0.0, -410.0);
          float pa = atan(pk.y, pk.x), pr = length(pk);
          float wig = (texture(uNoise, vWPos.xz / 240.0).g - 0.5) * 1.6 + (texture(uNoise, vWPos.xz / 70.0).b - 0.5) * 0.35;
          float riv = abs(sin(pa * 4.0 + wig));
          float rivW = mix(0.02, 0.07, smoothstep(210.0, 60.0, pr));
          float lava = smoothstep(rivW, rivW * 0.3, riv) * smoothstep(215.0, 70.0, pr) * smoothstep(40.0, 70.0, pr) * cb.g;
          lava *= 0.55 + 0.45 * smoothstep(0.3, 0.7, texture(uNoise, vWPos.xz / 25.0 + vec2(0.0, uTime * 0.01)).b);
          col = mix(col, vec3(0.08, 0.03, 0.02), smoothstep(rivW * 2.5, rivW, riv) * smoothstep(215.0, 70.0, pr) * cb.g * 0.8);
          lava = max(lava, smoothstep(45.0, 25.0, pr) * cb.g * 0.9);   // crater lake glow
          totalEmissiveRadiance += vec3(4.0, 1.1, 0.25) * lava * (0.75 + 0.25 * sin(uTime * 1.7 + vWPos.x * 0.1));
          vec4 diffuseColor2 = vec4(col, 1.0);
          diffuseColor.rgb *= diffuseColor2.rgb;
        `),
    });
    mat.color.set(0xffffff);
    return mat;
  }

  buildGeometry(cx, cz, step) {
    const hf = this.hf, S = HF_SAMPLES;
    const n = CHUNK / step;           // quads per side
    const v = n + 1;
    const x0 = cx * CHUNK, z0 = cz * CHUNK; // sample-space origin
    const count = v * v + 4 * v;       // grid + skirts
    const pos = new Float32Array(count * 3), nrm = new Float32Array(count * 3), ao = new Float32Array(count);
    const idx = [];
    const H = hf.h;
    const sample = (i, j) => H[Math.min(S - 1, j) * S + Math.min(S - 1, i)];
    const put = (k, i, j, drop) => {
      const h = sample(i, j);
      pos[k * 3] = i - MAP.half; pos[k * 3 + 1] = h - drop; pos[k * 3 + 2] = j - MAP.half;
      const hl = sample(Math.max(0, i - 1), j), hr = sample(i + 1, j), hd = sample(i, Math.max(0, j - 1)), hu = sample(i, j + 1);
      let nx = hl - hr, ny = 2, nz = hd - hu; const l = Math.hypot(nx, ny, nz); nrm[k * 3] = nx / l; nrm[k * 3 + 1] = ny / l; nrm[k * 3 + 2] = nz / l;
      // curvature AO at 3 m and 9 m scale
      const r1 = 3, r2 = 9;
      const c1 = (sample(Math.max(0, i - r1), j) + sample(i + r1, j) + sample(i, Math.max(0, j - r1)) + sample(i, j + r1)) * 0.25 - h;
      const c2 = (sample(Math.max(0, i - r2), j) + sample(i + r2, j) + sample(i, Math.max(0, j - r2)) + sample(i, j + r2)) * 0.25 - h;
      ao[k] = Math.max(0.55, Math.min(1.12, 1 - c1 * 0.09 - c2 * 0.035));
    };
    for (let j = 0; j < v; j++) for (let i = 0; i < v; i++) put(j * v + i, x0 + i * step, z0 + j * step, 0);
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
      const a = j * v + i, b = a + 1, c = a + v, d = c + 1;
      idx.push(a, d, b, a, c, d);
    }
    // skirts
    const drop = step * 1.5 + 1;
    const edges = [
      { f: t => [t, 0], g: t => t },
      { f: t => [n, t], g: t => t * v + n },
      { f: t => [n - t, n], g: t => n * v + (n - t) },
      { f: t => [0, n - t], g: t => (n - t) * v },
    ];
    let base = v * v;
    for (const e of edges) {
      for (let t = 0; t < v; t++) {
        const [i, j] = e.f(t);
        put(base + t, x0 + i * step, z0 + j * step, drop);
      }
      for (let t = 0; t < n; t++) {
        const a = e.g(t), b = e.g(t + 1), c = base + t, d = base + t + 1;
        idx.push(a, c, b, b, c, d);
      }
      base += v;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
    geo.setAttribute('ao', new THREE.BufferAttribute(ao, 1));
    geo.setIndex(idx);
    geo.computeBoundingSphere();
    geo.computeBoundingBox();
    return geo;
  }

  setLod(ch, lod) {
    if (ch.lod === lod) return;
    if (!ch.geos[lod]) ch.geos[lod] = this.buildGeometry(ch.cx, ch.cz, LODS[lod]);
    ch.mesh.geometry = ch.geos[lod];
    ch.lod = lod;
  }

  update(camPos) {
    let built = 0;
    for (const ch of this.chunks) {
      const d = Math.hypot(camPos.x - ch.center.x, camPos.z - ch.center.z);
      const want = d < LOD_DIST[0] ? 0 : d < LOD_DIST[1] ? 1 : d < LOD_DIST[2] ? 2 : 3;
      if (want !== ch.lod) {
        // limit expensive builds per frame
        if (!ch.geos[want] && built >= 2) continue;
        if (!ch.geos[want]) built++;
        this.setLod(ch, want);
      }
    }
  }

  // Force-build every LOD 0/1 chunk near a point (used during loading)
  warm(camPos) {
    for (const ch of this.chunks) {
      const d = Math.hypot(camPos.x - ch.center.x, camPos.z - ch.center.z);
      const want = d < LOD_DIST[0] ? 0 : d < LOD_DIST[1] ? 1 : d < LOD_DIST[2] ? 2 : 3;
      this.setLod(ch, want);
    }
  }
}
