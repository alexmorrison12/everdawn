// Mesh-based FX: GPU-animated 3D ice spikes & lava-rock debris (instanced, analytic like the sprite particles),
// CPU-posed projectile meshes (arrow / spear / ice shard / lava rock, one InstancedMesh per type),
// and per-instance meshes: fresnel shield bubble, fiery portal vortex disc.
import * as THREE from 'three';
import { G, FOG_GLSL_PARS, lambert } from '../engine/materials.js';
import { MeshBuilder, linColor } from '../engine/geom.js';

const MSTRIDE = 16;
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _s = new THREE.Vector3(), _v = new THREE.Vector3();
const _fwd = new THREE.Vector3(0, 0, -1);

// ------------------------------------------------------------------ shared GLSL
const NOISE_GLSL = /* glsl */`
float h31(vec3 p){ p = fract(p * 0.1031); p += dot(p, p.zyx + 31.32); return fract((p.x + p.y) * p.z); }
float vn3(vec3 p){ vec3 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(h31(i), h31(i + vec3(1,0,0)), f.x), mix(h31(i + vec3(0,1,0)), h31(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(h31(i + vec3(0,0,1)), h31(i + vec3(1,0,1)), f.x), mix(h31(i + vec3(0,1,1)), h31(i + vec3(1,1,1)), f.x), f.y), f.z); }
`;
const SOLID_FRAG = /* glsl */`
uniform float uKind; uniform vec3 uColor; uniform vec3 uLight; uniform float uDesat; uniform float uFxTime;
varying vec3 vN; varying vec3 vW; varying float vHeat; varying vec3 vLocal;
${FOG_GLSL_PARS}
${NOISE_GLSL}
void main() {
  vec3 n = normalize(vN);
  vec3 v = normalize(cameraPosition - vW);
  float ndl = dot(n, uSunDir);
  float wrap = clamp((ndl + 0.45) / 1.45, 0.0, 1.0);
  vec3 col;
  if (uKind < 0.5) {            // ice: bright body, strong fresnel, glowing tips
    float fres = pow(1.0 - abs(dot(n, v)), 2.2);
    col = uColor * (0.42 + 0.5 * wrap) * (0.55 + 0.45 * uLight);
    col += vec3(0.45, 0.75, 1.1) * fres * 0.9;
    col += vec3(0.3, 0.6, 1.2) * smoothstep(0.6, 1.0, vLocal.y / 1.3) * 0.5;
    col += vec3(0.4, 0.75, 1.5) * vHeat * 1.2;
    float glint = pow(max(dot(reflect(-uSunDir, n), v), 0.0), 40.0);
    col += vec3(1.5) * glint;
  } else {                      // basalt with cooling lava cracks
    col = uColor * (0.3 + 0.7 * wrap) * uLight;
    float c = vn3(vLocal * 9.0) * 0.6 + vn3(vLocal * 21.0) * 0.4;
    float crack = smoothstep(0.52, 0.66, c) * (1.0 - smoothstep(0.66, 0.8, c) * 0.4);
    col += vec3(3.2, 1.0, 0.18) * crack * vHeat + vec3(1.2, 0.3, 0.05) * vHeat * 0.35;
  }
  col = applyFog(col, vW);
  col = mix(col, vec3(dot(col, vec3(0.3, 0.5, 0.2))) * vec3(0.85, 0.95, 1.1), uDesat);
  gl_FragColor = vec4(col, 1.0);
}`;

// GPU pool vertex shader (instanced interleaved attributes)
const POOL_VERT = /* glsl */`
attribute vec4 iP; attribute vec4 iV; attribute vec4 iR; attribute vec4 iS;
uniform float uFxTime; uniform sampler2D uHeightTex; uniform vec4 uHeightInfo;
varying vec3 vN; varying vec3 vW; varying float vHeat; varying vec3 vLocal;
float terrainH(vec2 xz) { return texture2D(uHeightTex, (xz - uHeightInfo.zw + 0.5) / uHeightInfo.xy).r; }
mat3 eul(vec3 e) {
  float cx = cos(e.x), sx = sin(e.x), cy = cos(e.y), sy = sin(e.y), cz = cos(e.z), sz = sin(e.z);
  mat3 rx = mat3(1.0, 0.0, 0.0, 0.0, cx, sx, 0.0, -sx, cx);
  mat3 ry = mat3(cy, 0.0, -sy, 0.0, 1.0, 0.0, sy, 0.0, cy);
  mat3 rz = mat3(cz, sz, 0.0, -sz, cz, 0.0, 0.0, 0.0, 1.0);
  return ry * rx * rz;
}
void main() {
  float age = uFxTime - iP.w, life = iV.w, killed = uFxTime - iS.w;
  if (age < 0.0 || age > life || killed > 0.35) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return; }
  vec3 p = position * iS.x; mat3 R; vec3 pos;
  if (iS.y < 0.5) {                               // debris: ballistic, lands and stops on the terrain
    float g = iS.z, vy = iV.y, y0 = iP.y;
    float gy = terrainH(iP.xz) + 0.12 * iS.x;
    float disc = vy * vy - 2.0 * g * (y0 - gy);
    float tl = disc > 0.0 ? (-vy - sqrt(disc)) / g : life;
    if (tl < 0.0) tl = life;
    float ta = min(age, tl);
    pos = iP.xyz + iV.xyz * ta + vec3(0.0, 0.5 * g * ta * ta, 0.0);
    R = eul(iR.xyz + vec3(1.0, 0.63, 0.37) * iR.w * ta);
    p *= 1.0 - smoothstep(0.72, 1.0, age / life);
    vHeat = 1.0 - smoothstep(0.0, life * 0.85, age);
  } else {                                        // spike: erupts from the ground, then sinks / shatters
    R = eul(iR.xyz);
    float grow = smoothstep(0.0, 0.09, age);
    float gone = max(smoothstep(life - 0.35, life, age), smoothstep(0.0, 0.3, killed));
    float h = grow * (1.0 - gone);
    p.y *= h; p.xz *= mix(0.5, 1.0, h);
    pos = iP.xyz;
    vHeat = (1.0 - smoothstep(0.0, 0.25, age)) * 0.8;
  }
  vec3 wp = pos + R * p;
  vN = R * normal; vW = wp; vLocal = position;
  gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
}`;

// InstancedMesh (CPU matrices) variant, for projectile shards / rocks
const INST_VERT = /* glsl */`
uniform float uHeatV;
varying vec3 vN; varying vec3 vW; varying float vHeat; varying vec3 vLocal;
void main() {
  mat4 m = modelMatrix;
  #ifdef USE_INSTANCING
    m = m * instanceMatrix;
  #endif
  vec4 wp = m * vec4(position, 1.0);
  vN = normalize(mat3(m) * normal); vW = wp.xyz; vLocal = position; vHeat = uHeatV;
  gl_Position = projectionMatrix * viewMatrix * wp;
}`;

function solidMaterial(fx, vert, kind, color) {
  return new THREE.ShaderMaterial({
    vertexShader: vert, fragmentShader: SOLID_FRAG,
    uniforms: {
      uFxTime: fx.u.uFxTime, uLight: fx.u.uLight, uKind: { value: kind }, uColor: { value: new THREE.Color(color) }, uHeatV: { value: kind > 0.5 ? 1 : 0.3 },
      uFogColor: G.uFogColor, uFogSunColor: G.uFogSunColor, uFogDensity: G.uFogDensity, uFogHeight: G.uFogHeight, uFogBase: G.uFogBase,
      uSunDir: G.uSunDir, uCamPos: G.uCamPos, uDesat: G.uDesat, uHeightTex: fx.u.uHeightTex, uHeightInfo: fx.u.uHeightInfo,
    },
  });
}

// ------------------------------------------------------------------ geometry
function faceted(g) { if (g.index) g = g.toNonIndexed(); g.computeVertexNormals(); return g; }
function spikeGeo() { // faceted crystal, base at y=0, tip at y=1.3
  const pts = [new THREE.Vector2(0, 0), new THREE.Vector2(0.24, 0.02), new THREE.Vector2(0.28, 0.5), new THREE.Vector2(0.16, 1.0), new THREE.Vector2(0, 1.35)];
  return faceted(new THREE.LatheGeometry(pts, 5));
}
function rockGeo() {
  const g = new THREE.IcosahedronGeometry(0.28, 0);
  const p = g.attributes.position;
  const seen = new Map();
  for (let i = 0; i < p.count; i++) {
    const k = `${p.getX(i).toFixed(3)},${p.getY(i).toFixed(3)},${p.getZ(i).toFixed(3)}`;
    let f = seen.get(k); if (f === undefined) { f = 0.75 + Math.abs(Math.sin(i * 12.9898 + 4.1)) * 0.5; seen.set(k, f); }
    p.setXYZ(i, p.getX(i) * f, p.getY(i) * f * 0.8, p.getZ(i) * f);
  }
  return faceted(g);
}
function shardGeo() { // double-pointed ice bolt along -Z
  const pts = [new THREE.Vector2(0, -0.55), new THREE.Vector2(0.13, -0.15), new THREE.Vector2(0.11, 0.25), new THREE.Vector2(0, 0.62)];
  const g = new THREE.LatheGeometry(pts, 6); g.rotateX(-Math.PI / 2);
  return faceted(g);
}
function arrowGeo() {
  const b = new MeshBuilder();
  const shaft = new THREE.CylinderGeometry(0.014, 0.014, 0.8, 5); shaft.rotateX(Math.PI / 2);
  b.add(shaft, null, linColor(0x8a6038));
  const head = new THREE.ConeGeometry(0.035, 0.12, 4); head.rotateX(-Math.PI / 2); head.translate(0, 0, -0.45);
  b.add(head, null, linColor(0xb8bcc4));
  for (let i = 0; i < 3; i++) {
    const f = new THREE.PlaneGeometry(0.05, 0.16); f.translate(0.03, 0, 0); f.rotateX(Math.PI / 2); f.rotateZ(i * Math.PI * 2 / 3); f.translate(0, 0, 0.33);
    b.add(f, null, linColor(i ? 0xe8e0d0 : 0xb03020));
  }
  return b.build();
}
function spearGeo() {
  const b = new MeshBuilder();
  const shaft = new THREE.CylinderGeometry(0.028, 0.028, 1.9, 6); shaft.rotateX(Math.PI / 2);
  b.add(shaft, null, linColor(0x6e4a2a));
  const head = new THREE.LatheGeometry([new THREE.Vector2(0, 0), new THREE.Vector2(0.07, 0.1), new THREE.Vector2(0.05, 0.28), new THREE.Vector2(0, 0.4)], 4);
  head.rotateX(-Math.PI / 2); head.translate(0, 0, -0.95);
  b.add(head, null, linColor(0xc8ccd4));
  const wrap = new THREE.CylinderGeometry(0.036, 0.036, 0.12, 6); wrap.rotateX(Math.PI / 2); wrap.translate(0, 0, -0.9);
  b.add(wrap, null, linColor(0x8a2a1a));
  return b.build();
}

// ------------------------------------------------------------------ GPU mesh pool
class MeshPool {
  constructor(geo, mat, ring, held, name) {
    this.ring = ring; this.size = ring + held;
    this.data = new Float32Array(this.size * MSTRIDE);
    for (let i = 0; i < this.size; i++) { this.data[i * MSTRIDE + 3] = -1e9; this.data[i * MSTRIDE + 7] = 1; this.data[i * MSTRIDE + 15] = 1e9; }
    this.buf = new THREE.InstancedInterleavedBuffer(this.data, MSTRIDE, 1);
    this.buf.setUsage(THREE.DynamicDrawUsage);
    this.uploads = 0; this.fullAt = -1;
    this.buf.onUpload(() => { this.uploads++; });
    const g = new THREE.InstancedBufferGeometry();
    g.index = geo.index; g.setAttribute('position', geo.attributes.position); g.setAttribute('normal', geo.attributes.normal);
    ['iP', 'iV', 'iR', 'iS'].forEach((n, i) => g.setAttribute(n, new THREE.InterleavedBufferAttribute(this.buf, 4, i * 4)));
    g.instanceCount = this.size;
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e7);
    this.mesh = new THREE.Mesh(g, mat);
    this.mesh.frustumCulled = false; this.mesh.name = 'fx-' + name;
    this.head = 0; this.dirty = []; this.free = []; this.pendingFree = []; this.until = -1;
    for (let i = this.size - 1; i >= ring; i--) this.free.push(i);
  }
  write(slot, now, x, y, z, vx, vy, vz, life, rx, ry, rz, spin, scale, mode, g) {
    const d = this.data, b = slot * MSTRIDE;
    if (slot < this.ring && now + life > this.until) this.until = now + life;
    d[b] = x; d[b + 1] = y; d[b + 2] = z; d[b + 3] = now;
    d[b + 4] = vx; d[b + 5] = vy; d[b + 6] = vz; d[b + 7] = life;
    d[b + 8] = rx; d[b + 9] = ry; d[b + 10] = rz; d[b + 11] = spin;
    d[b + 12] = scale; d[b + 13] = mode; d[b + 14] = g; d[b + 15] = 1e9;
    this.dirty.push(slot);
  }
  spawn(held, ...a) {
    let slot;
    if (held) { slot = this.free.pop(); if (slot === undefined) return -1; }
    else { slot = this.head; this.head = (this.head + 1) % this.ring; }
    this.write(slot, ...a);
    return slot;
  }
  kill(slot, now) {
    this.data[slot * MSTRIDE + 15] = now; this.dirty.push(slot);
    if (slot >= this.ring) this.pendingFree.push([slot, now + 0.4]);
  }
  reset() {
    for (let i = 0; i < this.size; i++) { this.data[i * MSTRIDE + 3] = -1e9; this.data[i * MSTRIDE + 15] = 1e9; }
    this.head = 0; this.dirty.length = 0; this.pendingFree.length = 0; this.until = -1;
    this.free = []; for (let i = this.size - 1; i >= this.ring; i--) this.free.push(i);
    this.fullAt = this.uploads;
  }
  flush(now) {
    this.mesh.visible = now <= this.until + 0.5 || this.free.length < this.size - this.ring || this.pendingFree.length > 0;
    if (this.fullAt >= 0) {
      if (this.uploads > this.fullAt) this.fullAt = -1;
      else { this.dirty.length = 0; this.buf.clearUpdateRanges(); this.buf.needsUpdate = true; return; }
    }
    if (this.pendingFree.length) {
      for (let i = this.pendingFree.length - 1; i >= 0; i--) {
        const [slot, t] = this.pendingFree[i];
        if (now >= t) { this.data[slot * MSTRIDE + 3] = -1e9; this.dirty.push(slot); this.free.push(slot); this.pendingFree.splice(i, 1); }
      }
    }
    if (!this.dirty.length) return;
    for (const s of this.dirty) this.buf.addUpdateRange(s * MSTRIDE, MSTRIDE);
    this.dirty.length = 0;
    this.buf.needsUpdate = true;
  }
}

// ------------------------------------------------------------------ shield bubble
const SHIELD_VERT = /* glsl */`
varying vec3 vN; varying vec3 vW; varying vec3 vO;
void main() { vec4 wp = modelMatrix * vec4(position, 1.0); vW = wp.xyz; vN = normalize(mat3(modelMatrix) * normal); vO = position; gl_Position = projectionMatrix * viewMatrix * wp; }`;
const SHIELD_FRAG = /* glsl */`
uniform vec3 uColor; uniform float uAlpha; uniform float uFxTime; uniform float uHit;
varying vec3 vN; varying vec3 vW; varying vec3 vO;
${NOISE_GLSL}
float hexEdge(vec2 p) {
  p *= vec2(1.0, 1.1547);
  vec2 a = mod(p, vec2(1.0, 1.732)) - vec2(0.5, 0.866);
  vec2 b = mod(p + vec2(0.5, 0.866), vec2(1.0, 1.732)) - vec2(0.5, 0.866);
  vec2 g = dot(a, a) < dot(b, b) ? a : b;
  g = abs(g);
  float d = max(dot(g, vec2(0.5, 0.866)), g.x);
  return smoothstep(0.42, 0.5, d);
}
void main() {
  vec3 n = normalize(vN), v = normalize(cameraPosition - vW);
  float nv = abs(dot(n, v));
  float fres = pow(1.0 - nv, 2.6);
  vec3 o = normalize(vO);
  vec2 uv = vec2(atan(o.z, o.x) * 2.2, o.y * 3.4);
  float hex = hexEdge(uv * 1.2 + vec2(0.0, uFxTime * 0.08));
  float flow = vn3(vO * 3.0 + vec3(0.0, uFxTime * 0.6, 0.0));
  float band = smoothstep(0.0, 0.2, sin(o.y * 5.0 - uFxTime * 2.5) * 0.5 + 0.5 - 0.7);
  float a = fres * 1.25 + hex * (0.1 + 0.35 * fres) * (0.6 + 0.8 * flow) + band * 0.12 + 0.04;
  a *= uAlpha * (gl_FrontFacing ? 1.0 : 0.45);
  vec3 col = uColor * a * (1.6 + uHit * 2.0);
  gl_FragColor = vec4(col, 0.0);
}`;

// ------------------------------------------------------------------ portal disc
const PORTAL_VERT = /* glsl */`
varying vec2 vP; varying vec3 vW;
void main() { vP = position.xy; vec4 wp = modelMatrix * vec4(position, 1.0); vW = wp.xyz; gl_Position = projectionMatrix * viewMatrix * wp; }`;
const PORTAL_FRAG = /* glsl */`
uniform float uFxTime; uniform float uR; uniform float uAlpha; uniform vec3 uTint;
varying vec2 vP; varying vec3 vW;
${NOISE_GLSL}
${FOG_GLSL_PARS}
void main() {
  float r = length(vP) / uR;
  if (r > 1.08) discard;
  float a = atan(vP.y, vP.x);
  float t = uFxTime;
  // log-spiral swirl sucking inward
  float sw = a * 3.0 + log(max(r, 0.02)) * 5.5 + t * 2.6;
  float n1 = vn3(vec3(cos(sw) * 1.6, sin(sw) * 1.6, r * 4.0 - t * 1.2));
  float n2 = vn3(vec3(vP * 1.3 / uR * 3.0, t * 0.7));
  float arms = pow(0.5 + 0.5 * sin(sw + n2 * 3.0), 2.0);
  float heat = clamp(arms * 0.65 + n1 * 0.55 - r * 0.25, 0.0, 1.0);
  vec3 hot = vec3(4.0, 2.2, 0.8), mid = vec3(2.4, 0.55, 0.08), cool = vec3(0.35, 0.03, 0.01);
  vec3 col = mix(cool, mid, smoothstep(0.1, 0.55, heat));
  col = mix(col, hot, smoothstep(0.6, 0.95, heat));
  // dark eye in the centre, bright rim
  float eye = smoothstep(0.45, 0.05, r);
  col *= 1.0 - eye * 0.94;
  float rim = exp(-pow((r - 0.97) / 0.06, 2.0)) * (0.8 + 0.6 * n2);
  col += vec3(5.0, 2.2, 0.6) * rim;
  float edge = smoothstep(1.06, 0.96, r + (n2 - 0.5) * 0.08);
  col *= uTint;
  // premultiplied: dark core occludes (alpha), fiery arms add
  float alpha = edge * clamp(0.62 + eye * 0.38 - heat * 0.25, 0.0, 1.0) * uAlpha;
  vec3 f0 = applyFog(vec3(0.0), vW), f1 = applyFog(vec3(1.0), vW);
  float fog = clamp(1.0 - (f1.r - f0.r), 0.0, 1.0);
  gl_FragColor = vec4(col * edge * uAlpha * (1.0 - fog), alpha * (1.0 - fog));
}`;

// ------------------------------------------------------------------ ribbon batch (projectile trails, 1 draw call)
const RIB_VERT = /* glsl */`
attribute vec4 aCol; attribute vec2 aUv;
varying vec4 vCol; varying vec2 vUv;
void main() { vCol = aCol; vUv = aUv; gl_Position = projectionMatrix * viewMatrix * vec4(position, 1.0); }`;
const RIB_FRAG = /* glsl */`
uniform float uDesat;
varying vec4 vCol; varying vec2 vUv;
void main() {
  float x = abs(vUv.x);
  float soft = exp(-x * x * 3.0);
  float core = exp(-x * x * 16.0);
  float m = max(vCol.r, max(vCol.g, vCol.b));
  vec3 rgb = (vCol.rgb * soft + vec3(m) * core * 0.45) * vCol.a;
  rgb = mix(rgb, vec3(dot(rgb, vec3(0.3, 0.5, 0.2))) * vec3(0.85, 0.95, 1.1), uDesat);
  gl_FragColor = vec4(rgb, 0.0);
}`;
class RibbonBatch {
  constructor(fx, maxRibbons = 96, maxPts = 22) {
    this.fx = fx; this.maxPts = maxPts; this.maxR = maxRibbons;
    const nv = maxRibbons * (maxPts + 1) * 2;
    this.pos = new Float32Array(nv * 3); this.col = new Float32Array(nv * 4); this.uv = new Float32Array(nv * 2);
    this.idx = new Uint16Array(maxRibbons * maxPts * 6);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aCol', new THREE.BufferAttribute(this.col, 4).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aUv', new THREE.BufferAttribute(this.uv, 2).setUsage(THREE.DynamicDrawUsage));
    g.setIndex(new THREE.BufferAttribute(this.idx, 1).setUsage(THREE.DynamicDrawUsage));
    g.setDrawRange(0, 0);
    this.mesh = new THREE.Mesh(g, new THREE.ShaderMaterial({ vertexShader: RIB_VERT, fragmentShader: RIB_FRAG, uniforms: { uDesat: G.uDesat }, ...PREMUL, side: THREE.DoubleSide }));
    this.mesh.frustumCulled = false; this.mesh.renderOrder = 23; this.mesh.name = 'fx-ribbons';
    this.list = [];
  }
  add(h, o) {
    if (this.list.length >= this.maxR) return null;
    let color = o.color ?? [1, 1, 1];
    if (h.tint) { const l = color[0] * 0.3 + color[1] * 0.55 + color[2] * 0.15; color = h.tint.map(c => c * l * 1.7); }  // follow opts.color
    const r = { h, width: o.width ?? 0.3, color, life: o.life ?? 0.15, alpha: o.alpha ?? 1, pts: [], head: o.head ?? 1 };
    this.list.push(r); return r;
  }
  update() {
    const now = this.fx.time, cam = this.fx.camera.position;
    const P = this.pos, C = this.col, U = this.uv, I = this.idx;
    let v = 0, ii = 0, w = 0;
    for (const r of this.list) {
      const live = !r.h.dead && !r.h.stopping;
      const pts = r.pts, hp = r.h.pos;
      if (live) {
        const last = pts[pts.length - 1];
        if (!last || now - last.t >= 1 / 90 || (last.x - hp.x) ** 2 + (last.y - hp.y) ** 2 + (last.z - hp.z) ** 2 > 0.04) pts.push({ x: hp.x, y: hp.y, z: hp.z, t: now });
        else { last.x = hp.x; last.y = hp.y; last.z = hp.z; }
      }
      while (pts.length && now - pts[0].t > r.life) pts.shift();
      while (pts.length > this.maxPts) pts.shift();
      if (!live && pts.length < 2) continue;
      this.list[w++] = r;
      const n = pts.length;
      if (n < 2) continue;
      const base = v;
      for (let i = 0; i < n; i++) {
        const p = pts[i], a = pts[Math.max(0, i - 1)], b = pts[Math.min(n - 1, i + 1)];
        _v.set(b.x - a.x, b.y - a.y, b.z - a.z);
        const age = Math.min(1, (now - p.t) / r.life);
        _s.set(cam.x - p.x, cam.y - p.y, cam.z - p.z).cross(_v);
        const L = _s.length() || 1;
        const k = Math.pow(1 - age, 0.8) * (i === n - 1 ? r.head : 1);
        const hw = r.width * 0.5 * (0.25 + 0.75 * k) * r.h.s / L;
        const al = Math.pow(1 - age, 1.4) * r.alpha * (live ? 1 : r.h.fade * 0 + 1);
        for (let sd = -1; sd <= 1; sd += 2) {
          P[v * 3] = p.x + _s.x * hw * sd; P[v * 3 + 1] = p.y + _s.y * hw * sd; P[v * 3 + 2] = p.z + _s.z * hw * sd;
          C[v * 4] = r.color[0]; C[v * 4 + 1] = r.color[1]; C[v * 4 + 2] = r.color[2]; C[v * 4 + 3] = al;
          U[v * 2] = sd; U[v * 2 + 1] = age; v++;
        }
      }
      for (let i = 0; i < n - 1; i++) { const a = base + i * 2; I[ii++] = a; I[ii++] = a + 1; I[ii++] = a + 2; I[ii++] = a + 1; I[ii++] = a + 3; I[ii++] = a + 2; }
    }
    this.list.length = w;
    const g = this.mesh.geometry;
    g.setDrawRange(0, ii);
    this.mesh.visible = ii > 0;
    if (ii) {
      g.attributes.position.addUpdateRange(0, v * 3); g.attributes.position.needsUpdate = true;
      g.attributes.aCol.addUpdateRange(0, v * 4); g.attributes.aCol.needsUpdate = true;
      g.attributes.aUv.addUpdateRange(0, v * 2); g.attributes.aUv.needsUpdate = true;
      g.index.addUpdateRange(0, ii); g.index.needsUpdate = true;
    }
  }
}

const PREMUL = { transparent: true, depthWrite: false, blending: THREE.CustomBlending, blendEquation: THREE.AddEquation, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor, blendSrcAlpha: THREE.OneFactor, blendDstAlpha: THREE.OneMinusSrcAlphaFactor };

export class MeshFX {
  constructor(fx) {
    this.fx = fx;
    const iceMat = solidMaterial(fx, POOL_VERT, 0, 0x9fdcff);
    const rockMat = solidMaterial(fx, POOL_VERT, 1, 0x3a302c);
    this.spikes = new MeshPool(spikeGeo(), iceMat, 480, 96, 'spikes');
    this.rocks = new MeshPool(rockGeo(), rockMat, 256, 0, 'rocks');
    fx.group.add(this.spikes.mesh, this.rocks.mesh);
    // projectile meshes
    const wood = lambert({ vertexColors: true }, { key: 'fx-proj', spec: 0.3, shine: 30 });
    this.proj = {
      arrow: this.makeInst(arrowGeo(), wood, 128),
      spear: this.makeInst(spearGeo(), wood, 32),
      shard: this.makeInst(shardGeo(), solidMaterial(fx, INST_VERT, 0, 0xbfeaff), 64),
      rock: this.makeInst(rockGeo(), solidMaterial(fx, INST_VERT, 1, 0x3a302c), 32),
    };
    this.users = { arrow: [], spear: [], shard: [], rock: [] };
    this.live = [];                // [{ mesh, h, tick }]
    this.ribbons = new RibbonBatch(fx);
    fx.group.add(this.ribbons.mesh);
  }
  makeInst(geo, mat, n) {
    const m = new THREE.InstancedMesh(geo, mat, n);
    m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    m.count = 0; m.frustumCulled = false; m.castShadow = false; m.visible = false;
    this.fx.group.add(m);
    return m;
  }
  reset() {
    this.spikes.reset(); this.rocks.reset();
    for (const L of this.live) { L.mesh.parent?.remove(L.mesh); L.mesh.material.dispose(); if (L.mesh.geometry !== SHIELD_GEO) L.mesh.geometry.dispose(); }
    this.live.length = 0;
    for (const t in this.users) this.users[t].length = 0;
    this.ribbons.list.length = 0;
  }
  dispose() {
    this.reset();
    for (const m of [this.spikes.mesh, this.rocks.mesh, this.ribbons.mesh, ...Object.values(this.proj)]) { m.geometry.dispose(); m.material.dispose(); }
  }
  count() { return this.live.length + Object.values(this.users).reduce((a, u) => a + u.length, 0); }

  // continuous tapered streak following instance h (h.pos), fading over `life` seconds
  ribbon(h, o) { return this.ribbons.add(h, o); }
  // attach a projectile mesh of `type` to instance h (posed from h.pos / h.dir each frame, removed when h dies)
  projMesh(type, h, { roll = 0, scale = 1 } = {}) { this.users[type].push({ h, roll, scale, spin: 0 }); }

  update(dt) {
    const now = this.fx.time;
    for (const type in this.users) {
      const list = this.users[type], mesh = this.proj[type];
      let n = 0;
      for (let i = 0; i < list.length; i++) {
        const u = list[i];
        if (u.h.dead || u.h.stopping) continue;
        list[n] = u;
        if (n < mesh.instanceMatrix.count) {
          u.spin += u.roll * dt;
          _q.setFromUnitVectors(_fwd, u.h.dir);
          _q2.setFromAxisAngle(_fwd, u.spin); _q.multiply(_q2);
          _s.setScalar(u.scale * u.h.s);
          _m.compose(u.h.pos, _q, _s);
          mesh.setMatrixAt(n, _m);
        }
        n++;
      }
      list.length = n;
      mesh.count = Math.min(n, mesh.instanceMatrix.count);
      mesh.visible = n > 0;
      if (n) mesh.instanceMatrix.needsUpdate = true;
    }
    let w = 0;
    for (const L of this.live) {
      if (L.h.dead) { L.mesh.parent?.remove(L.mesh); L.mesh.material.dispose(); if (L.mesh.geometry !== SHIELD_GEO) L.mesh.geometry.dispose(); continue; }
      L.tick(L, dt);
      this.live[w++] = L;
    }
    this.live.length = w;
    this.spikes.flush(now); this.rocks.flush(now);
    this.ribbons.update();
  }

  // ---- ice spikes
  iceNova(x, y, z, s = 1) {
    const fx = this.fx, now = fx.time, H = fx.heightAt;
    const rings = [[1.3, 8, 0.95], [2.3, 12, 1.2], [3.4, 16, 1.05], [4.5, 20, 0.8]];
    for (const [r0, n, sc] of rings) {
      const r = r0 * s;
      for (let i = 0; i < n; i++) {
        const a = (i + fx.rng.next() * 0.6) / n * Math.PI * 2, rr = r + fx.r(-0.3, 0.3) * s;
        const px = x + Math.cos(a) * rr, pz = z + Math.sin(a) * rr, py = H(px, pz) - 0.05;
        const delay = rr / (16 * s);
        this.spikes.spawn(false, now + delay, px, py, pz, 0, 0, 0, fx.r(1.5, 2.0), fx.r(0.18, 0.5), Math.PI / 2 - a + fx.r(-0.3, 0.3), fx.r(-0.2, 0.2), 0, sc * s * fx.r(0.75, 1.25), 1, 0);
      }
    }
  }
  iceBlock(x, y, z, s = 1) {
    const fx = this.fx, now = fx.time, H = fx.heightAt, slots = [];
    for (let i = 0; i < 9; i++) {
      const a = (i + fx.rng.next() * 0.5) / 9 * Math.PI * 2, rr = fx.r(0.35, 0.6) * s;
      const px = x + Math.cos(a) * rr, pz = z + Math.sin(a) * rr;
      slots.push(this.spikes.spawn(true, now + i * 0.015, px, H(px, pz) - 0.05, pz, 0, 0, 0, 1e5, fx.r(0.15, 0.4), Math.PI / 2 - a, fx.r(-0.15, 0.15), 0, fx.r(1.0, 1.45) * s, 1, 0));
    }
    for (let i = 0; i < 7; i++) {
      const a = fx.r(0, Math.PI * 2), rr = fx.r(0.6, 1.0) * s;
      const px = x + Math.cos(a) * rr, pz = z + Math.sin(a) * rr;
      slots.push(this.spikes.spawn(true, now, px, H(px, pz) - 0.05, pz, 0, 0, 0, 1e5, fx.r(0.5, 0.9), Math.PI / 2 - a, 0, 0, fx.r(0.4, 0.7) * s, 1, 0));
    }
    return slots.filter(s => s >= 0);
  }
  kill(slots) {
    if (!slots) return;
    const now = this.fx.time;
    for (const s of slots) this.spikes.kill(s, now);
  }
  iceShatter(x, y, z, n, s = 1) {   // real 3D ice shards flying out (spike mesh in ballistic mode)
    const fx = this.fx, now = fx.time;
    for (let i = 0; i < n; i++) {
      const a = fx.r(0, Math.PI * 2), up = fx.r(-0.2, 1), sp = fx.r(3, 7) * s;
      this.spikes.spawn(false, now, x, y, z, Math.cos(a) * sp * (1 - Math.abs(up) * 0.4), up * sp, Math.sin(a) * sp * (1 - Math.abs(up) * 0.4), fx.r(0.9, 1.4), fx.r(0, 6), fx.r(0, 6), fx.r(0, 6), fx.r(8, 16), fx.r(0.2, 0.35) * s, 0, -14 * s);
    }
  }
  debris(x, y, z, n, s = 1, speed = 8) {
    const fx = this.fx, now = fx.time;
    for (let i = 0; i < n; i++) {
      const a = fx.r(0, Math.PI * 2), up = fx.r(0.45, 1), sp = fx.r(0.4, 1) * speed * s;
      this.rocks.spawn(false, now, x, y, z, Math.cos(a) * sp * (1 - up * 0.5), up * sp * 1.1, Math.sin(a) * sp * (1 - up * 0.5), fx.r(2.2, 3.2), fx.r(0, 6), fx.r(0, 6), fx.r(0, 6), fx.r(4, 10), fx.r(0.5, 1.4) * s, 0, -16 * s);
    }
  }

  // ---- shield bubble following instance h (h.pos is the bubble centre)
  shield(h, tint) {
    const mat = new THREE.ShaderMaterial({
      vertexShader: SHIELD_VERT, fragmentShader: SHIELD_FRAG,
      uniforms: { uColor: { value: new THREE.Color().setRGB(...tint) }, uAlpha: { value: 0 }, uFxTime: this.fx.u.uFxTime, uHit: { value: 1 } },
      side: THREE.DoubleSide, ...PREMUL,
    });
    const mesh = new THREE.Mesh(SHIELD_GEO, mat);
    mesh.renderOrder = 18; mesh.frustumCulled = false;
    this.fx.group.add(mesh);
    const R = (h.opts.radius ?? 1.15) * h.s;
    this.live.push({
      mesh, h, tick: (L, dt) => {
        const a = L.h.age, pop = a < 0.25 ? 1 + Math.sin(a / 0.25 * Math.PI) * 0.12 : 1;
        mesh.position.copy(L.h.pos);
        mesh.scale.setScalar(R * pop * (L.h.stopping ? 1 + (1 - L.h.fade) * 0.25 : 1));
        mat.uniforms.uAlpha.value = Math.min(1, a / 0.12) * L.h.k;
        mat.uniforms.uHit.value = Math.max(0, 1 - a / 0.4);
      },
    });
    return mesh;
  }
  // ---- fiery vortex disc (vertical, facing yaw), centre 3.1*s above h.pos
  portal(h, yaw, radius, tint) {
    const mat = new THREE.ShaderMaterial({
      vertexShader: PORTAL_VERT, fragmentShader: PORTAL_FRAG,
      uniforms: {
        uFxTime: this.fx.u.uFxTime, uR: { value: radius }, uAlpha: { value: 0 }, uTint: { value: new THREE.Vector3(...(tint || [1, 1, 1])) },
        uFogColor: G.uFogColor, uFogSunColor: G.uFogSunColor, uFogDensity: G.uFogDensity, uFogHeight: G.uFogHeight, uFogBase: G.uFogBase, uSunDir: G.uSunDir, uCamPos: G.uCamPos,
      },
      side: THREE.DoubleSide, ...PREMUL,
    });
    const mesh = new THREE.Mesh(new THREE.CircleGeometry(radius * 1.1, 72), mat);
    mesh.renderOrder = 19;
    this.fx.group.add(mesh);
    this.live.push({
      mesh, h, tick: (L) => {
        mesh.position.copy(L.h.pos); mesh.position.y += radius * 1.033;
        mesh.rotation.set(0, yaw, 0);
        mat.uniforms.uAlpha.value = Math.min(1, L.h.age / 0.6) * L.h.k;
      },
    });
    return mesh;
  }
}
const SHIELD_GEO = new THREE.IcosahedronGeometry(1, 4);
