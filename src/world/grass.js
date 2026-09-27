// GPU grass: a camera-following grid of instanced clumps. Positions snap to world cells so the pattern is stable;
// height, density and colour are all resolved in the vertex shader from the terrain textures.
import * as THREE from 'three';
import { lambert, G } from '../engine/materials.js';

export class Grass {
  constructor(terrain, { radius = 52, spacing = 0.8 } = {}) {
    this.radius = radius; this.spacing = spacing;
    const n = Math.floor(radius * 2 / spacing);
    const geo = new THREE.InstancedBufferGeometry();
    // clump: 7 blades
    const pos = [], nrm = [], uvy = [], idx = [];
    const blades = 9;
    for (let b = 0; b < blades; b++) {
      const a = (b / blades) * Math.PI * 2 + b * 0.7;
      const r = b === 0 ? 0 : 0.1 + (b % 3) * 0.07;
      const bx = Math.cos(a) * r, bz = Math.sin(a) * r;
      const facing = a + 1.3 + b;
      const w = 0.05 - (b % 2) * 0.01, h = 0.28 + ((b * 37) % 7) / 7 * 0.26;
      const lean = 0.18 + (b % 3) * 0.06;
      const dx = Math.cos(facing), dz = Math.sin(facing);
      const lx = Math.cos(a), lz = Math.sin(a);
      const base = pos.length / 3;
      const segs = [0, 0.45, 1];
      segs.forEach((t, i) => {
        const ww = w * (1 - t * 0.85);
        const cx = bx + lx * lean * t * t, cz = bz + lz * lean * t * t, cy = h * t;
        if (i < 2) {
          pos.push(cx - dx * ww, cy, cz - dz * ww, cx + dx * ww, cy, cz + dz * ww);
          nrm.push(lx * 0.3, 1, lz * 0.3, lx * 0.3, 1, lz * 0.3);
          uvy.push(t, t);
        } else {
          pos.push(cx, cy, cz); nrm.push(lx * 0.3, 1, lz * 0.3); uvy.push(1);
        }
      });
      idx.push(base, base + 1, base + 2, base + 1, base + 3, base + 2, base + 2, base + 3, base + 4);
    }
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
    geo.setAttribute('ty', new THREE.Float32BufferAttribute(uvy, 1));
    geo.setIndex(idx);
    const off = new Float32Array(n * n * 2);
    let k = 0;
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) { off[k++] = (i - n / 2) * spacing; off[k++] = (j - n / 2) * spacing; }
    geo.setAttribute('aOff', new THREE.InstancedBufferAttribute(off, 2));
    geo.instanceCount = n * n;
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e6);

    this.uCenter = { value: new THREE.Vector2() };
    const mat = lambert({}, {
      wrap: 0.6, trans: 0.35, key: 'grass',
      uniforms: { uCenter: this.uCenter, uSpacing: { value: spacing }, uRadius: { value: radius }, uCtrlA: { value: terrain.ctrlA }, uCtrlB: { value: terrain.ctrlB }, uLayers: { value: terrain.layerTex }, uNoise: { value: terrain.noiseTex } },
      vertex: vs => vs
        .replace('#include <common>', `#include <common>
          precision highp sampler2DArray;
          attribute vec2 aOff; attribute float ty;
          uniform vec2 uCenter; uniform float uSpacing; uniform float uRadius;
          uniform sampler2D uHeightTex; uniform vec4 uHeightInfo; uniform sampler2D uCtrlA; uniform sampler2D uCtrlB; uniform sampler2DArray uLayers; uniform sampler2D uNoise;
          varying vec3 vGrassCol; varying float vTy;
          float gh(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }`)
        .replace('#include <begin_vertex>', `
          vec2 cell = floor(uCenter / uSpacing) * uSpacing + aOff;
          float r1 = gh(cell), r2 = gh(cell + 17.3), r3 = gh(cell + 41.1);
          vec2 wxz = cell + (vec2(r1, r2) - 0.5) * uSpacing * 1.1;
          vec2 cuv = (wxz + 512.0 + 0.5) / 1025.0;
          vec4 ca = texture2D(uCtrlA, cuv), cb = texture2D(uCtrlB, cuv);
          float hy = texture2D(uHeightTex, (wxz - uHeightInfo.zw + 0.5) / uHeightInfo.xy).r;
          // slope from neighbouring heights
          float hx = texture2D(uHeightTex, (wxz + vec2(1.5, 0.0) - uHeightInfo.zw + 0.5) / uHeightInfo.xy).r;
          float hz = texture2D(uHeightTex, (wxz + vec2(0.0, 1.5) - uHeightInfo.zw + 0.5) / uHeightInfo.xy).r;
          float slope = length(vec2(hx - hy, hz - hy)) / 1.5;
          float dens = 1.0 - max(max(ca.r * 1.4, ca.b * 1.6), max(ca.g * 0.8, max(cb.r * 1.5, cb.g * 1.2)));
          dens *= 1.0 - ca.a * 0.55;
          dens *= smoothstep(0.75, 0.45, slope);
          dens *= step(0.35, hy); // no grass under water
          float dist = length(wxz - uCenter);
          float fade = smoothstep(uRadius, uRadius * 0.62, dist);
          float s = step(r3, dens) * fade * (0.7 + r1 * 0.6) * (1.0 + cb.a * 0.35);
          float rot = r2 * 6.2832;
          mat2 R = mat2(cos(rot), -sin(rot), sin(rot), cos(rot));
          vec3 transformed = vec3(position);
          transformed.xz = R * transformed.xz;
          transformed *= s;
          // wind
          float wv = texture2D(uNoise, wxz / 26.0 + vec2(uTime * 0.05, uTime * 0.02)).r;
          float sway = (sin(uTime * 2.2 + wxz.x * 0.35 + wxz.y * 0.2) * 0.35 + (wv - 0.5) * 2.0) * ty * ty * 0.22;
          transformed.x += sway * uWind.x; transformed.z += sway * uWind.y;
          transformed.xz += wxz; transformed.y += hy - 0.03;
          vec3 gcol = texture(uLayers, vec3(wxz / 5.0, 0.0)).rgb;
          gcol = mix(gcol, texture(uLayers, vec3(wxz / 4.0, 5.0)).rgb * 1.2, ca.a * 0.7);
          gcol *= mix(vec3(0.92, 1.0, 0.82), vec3(1.08, 1.02, 0.86), texture2D(uNoise, wxz / 180.0).r);
          gcol = mix(gcol, gcol * vec3(1.18, 1.1, 0.72), cb.a * 0.7);
          vGrassCol = gcol * mix(0.62, 1.05, ty) * vec3(1.0, 0.97, 0.9);
          vTy = ty;
        `),
      fragment: fs => fs
        .replace('#include <common>', '#include <common>\nvarying vec3 vGrassCol; varying float vTy;')
        .replace('#include <color_fragment>', 'diffuseColor.rgb = vGrassCol;'),
    });
    mat.side = THREE.DoubleSide;
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.frustumCulled = false;
    this.mesh.receiveShadow = true;
  }
  update(camTarget) {
    this.uCenter.value.set(camTarget.x, camTarget.z);
  }
}
