// GPU "analytic" particles. The CPU only writes a particle once (at spawn) into an interleaved instance buffer; the
// vertex shader evaluates position/size/colour as closed-form functions of age:
//   ballistic:  p(t) = p0 + v0·(1-e^-kt)/k + a·(t - (1-e^-kt)/k)/k  (+ sine-field turbulence)
//   orbit:      spiral around p0 (vertical axis, or a vertical plane with a yaw) with rise + radius growth
// Orientation modes: camera billboard, velocity-stretched streak, flat on the ground (XZ), vertical axis billboard.
// Colour/alpha over life come from a ramp LUT row × per-particle HDR tint. Premultiplied blending lets one draw call
// mix additive (alpha = 0) and alpha-blended (alpha = coverage) particles.
// Each pool = a ring buffer region (fire-and-forget) + a "held" region (free-list; looping particles owned by
// handles, e.g. projectile cores, hand glows). Anchors (a float texture of positions) let particles follow objects.
import * as THREE from 'three';
import { G, FOG_GLSL_PARS } from '../engine/materials.js';
import { GRID } from './textures.js';

export const STRIDE = 28;
// flag bits
export const F = {
  ORBIT: 1, ORBITV: 2,                       // motion (bits 0-1)
  STRETCH: 4, FLAT: 8, AXISY: 12,            // orientation (bits 2-4)
  LOOP: 32, NOGROUND: 64, PINGPONG: 128, FLATV: 256,
};

const vert = /* glsl */`
precision highp float;
precision highp int;
attribute vec4 aP0; attribute vec4 aV0; attribute vec4 aDyn; attribute vec4 aSize;
attribute vec4 aCol; attribute vec4 aMisc; attribute vec4 aExtra;
uniform float uFxTime;
uniform sampler2D uRamp; uniform float uRampRows;
uniform sampler2D uAnchors;
uniform sampler2D uHeightTex; uniform vec4 uHeightInfo; uniform float uGroundFade;
uniform vec3 uLight;
varying vec2 vUv; varying vec4 vColor; varying float vAdd; varying float vGround; varying float vSoft; varying float vFog; varying vec3 vFogCol;
${FOG_GLSL_PARS}
float terrainH(vec2 xz) { return texture2D(uHeightTex, (xz - uHeightInfo.zw + 0.5) / uHeightInfo.xy).r; }
void main() {
  float age = uFxTime - aP0.w;
  float life = max(aV0.w, 1e-4);
  int flags = int(aMisc.w + 0.5);
  bool loop = (flags & 32) != 0;
  float t = age / life;
  if (loop) { t = fract(t); if ((flags & 128) != 0) t = 1.0 - abs(2.0 * t - 1.0); }
  vec4 anc = vec4(0.0, 0.0, 0.0, 1.0);
  if (aMisc.z >= 0.0) { int ai = int(aMisc.z + 0.5); anc = texelFetch(uAnchors, ivec2(ai & 63, ai >> 6), 0); }
  if (age < 0.0 || (!loop && t > 1.0) || anc.w <= 0.001) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return; }
  int motion = flags & 3;
  vec3 pos; vec3 vel;
  if (motion == 0) {
    float k = aDyn.y;
    float e = exp(-k * age);
    float f = k > 1e-4 ? (1.0 - e) / k : age;
    float g = k > 1e-4 ? (age - f) / k : 0.5 * age * age;
    pos = aP0.xyz + aV0.xyz * f + vec3(0.0, aDyn.x * g, 0.0);
    vel = aV0.xyz * e + vec3(0.0, aDyn.x * f, 0.0);
  } else {
    float ang = aV0.y + aV0.z * age;
    float rad = max(aV0.x + aDyn.y * age, 0.0);
    float ca = cos(ang), sa = sin(ang);
    vec3 off = vec3(ca * rad, aDyn.x * age, sa * rad);
    vel = vec3(-sa * aV0.z * rad + ca * aDyn.y, aDyn.x, ca * aV0.z * rad + sa * aDyn.y);
    if (motion == 2) {  // orbit in a vertical plane (yaw = aExtra.z), drifting along the plane normal
      vec3 lo = vec3(ca * rad, sa * rad, aDyn.x * age);
      vec3 lv = vec3(vel.x, vel.z, aDyn.x);
      float cy = cos(aExtra.z), sy = sin(aExtra.z);
      off = vec3(lo.x * cy + lo.z * sy, lo.y, -lo.x * sy + lo.z * cy);
      vel = vec3(lv.x * cy + lv.z * sy, lv.y, -lv.x * sy + lv.z * cy);
    }
    pos = aP0.xyz + off;
  }
  if (aDyn.z > 0.0) {
    float seed = fract(aP0.w * 7.13 + aSize.z * 3.7) * 6.2831;
    vec3 q = pos * 0.85;
    float amp = aDyn.z * min(age, 1.5);
    pos += amp * vec3(sin(q.y * 1.3 + uFxTime * 1.7 + seed), sin(q.z * 1.1 + uFxTime * 1.3 + seed * 1.7) * 0.6, sin(q.x * 1.2 + uFxTime * 1.9 + seed * 2.3));
  }
  pos += anc.xyz;
  float st = 1.0 - pow(max(1.0 - t, 0.0), aExtra.y);
  float size = mix(aSize.x, aSize.y, st);
  float rot = aSize.z + aDyn.w * age;
  vec4 rc = texture2D(uRamp, vec2((t * 63.0 + 0.5) / 64.0, (aCol.w + 0.5) / uRampRows));
  float add = aMisc.y;
  vec3 col = rc.rgb * aCol.rgb;
  if (aExtra.w > 0.5) {   // recolour: luminance × packed tint (24-bit RGB + 1)
    float pk = aExtra.w - 1.0;
    float cb = floor(pk / 65536.0), cg = floor((pk - cb * 65536.0) / 256.0), cr = pk - cb * 65536.0 - cg * 256.0;
    vec3 tc = vec3(cr, cg, cb) / 255.0;
    col = tc * dot(col, vec3(0.3, 0.55, 0.15)) * 1.7;
  }
  col *= mix(uLight, vec3(1.0), add);
  float alpha = rc.a * aExtra.x * anc.w;
  int orient = (flags >> 2) & 7;
  vec2 corner = position.xy;
  float c = cos(rot), s = sin(rot);
  vec3 camR = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
  vec3 camU = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
  vec3 wp;
  if (orient == 1) {
    vec3 vv = (viewMatrix * vec4(vel, 0.0)).xyz;
    float sp = length(vv.xy);
    vec2 dir = sp > 1e-4 ? vv.xy / sp : vec2(0.0, 1.0);
    vec2 perp = vec2(-dir.y, dir.x);
    float len = size * (1.0 + aSize.w * length(vel));
    vec2 o2 = perp * corner.x * size + dir * (corner.y - 0.5) * len;
    wp = pos + camR * o2.x + camU * o2.y;
  } else if (orient == 2) {
    vec2 r2 = vec2(corner.x * c - corner.y * s, corner.x * s + corner.y * c) * size;
    wp = pos + vec3(r2.x, 0.0, r2.y);
  } else if (orient == 3) {
    vec3 tc = cameraPosition - pos;
    vec3 right = normalize(vec3(tc.z, 0.0, -tc.x) + 1e-5);
    wp = pos + right * corner.x * size + vec3(0.0, (corner.y + 0.5) * size * aSize.w, 0.0);
  } else {
    vec2 r2 = vec2(corner.x * c - corner.y * s, corner.x * s + corner.y * c) * size;
    wp = pos + camR * r2.x + camU * r2.y;
  }
  if ((flags & 256) != 0) { // vertical plane facing yaw (aExtra.z), for portals / walls
    vec2 r2 = vec2(corner.x * c - corner.y * s, corner.x * s + corner.y * c) * size;
    float cy = cos(aExtra.z), sy = sin(aExtra.z);
    wp = pos + vec3(r2.x * cy, r2.y, -r2.x * sy);
  }
  // soft intersection with the terrain (cheap stand-in for depth-buffer soft particles)
  vGround = 1e3; vSoft = 1.0;
  if ((flags & 64) == 0 && uGroundFade > 0.5) {
    float hc = terrainH(pos.xz);
    if (pos.y > hc - 2.0) { vGround = wp.y - terrainH(wp.xz); vSoft = clamp(size * 0.3, 0.05, 1.6); }
  }
  // fog on the particle centre: additive fades out, alpha blends toward fog colour
  vec3 f0 = applyFog(vec3(0.0), pos), f1 = applyFog(vec3(1.0), pos);
  vFog = clamp(1.0 - (f1.r - f0.r), 0.0, 1.0);
  vFogCol = f0 / max(vFog, 1e-3);
  float cellI = aMisc.x;
  vec2 cell = vec2(mod(cellI, ${GRID}.0), floor(cellI / ${GRID}.0));
  vUv = (cell + 0.004 + uv * 0.992) / ${GRID}.0;
  vColor = vec4(col, alpha);
  vAdd = add;
  gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
}`;

const frag = /* glsl */`
precision highp float;
uniform sampler2D uAtlas; uniform float uDesat;
varying vec2 vUv; varying vec4 vColor; varying float vAdd; varying float vGround; varying float vSoft; varying float vFog; varying vec3 vFogCol;
void main() {
  vec4 tx = texture2D(uAtlas, vUv);
  float a = tx.a * vColor.a;
  if (vGround < vSoft) a *= smoothstep(0.0, vSoft, vGround);
  if (a < 0.002) discard;
  vec3 rgb = tx.rgb * vColor.rgb;
  float fa = vFog * (1.0 - vAdd);
  rgb = mix(rgb, vFogCol, fa) * (1.0 - vFog * vAdd);
  rgb = mix(rgb, vec3(dot(rgb, vec3(0.3, 0.5, 0.2))) * vec3(0.85, 0.95, 1.1), uDesat);
  gl_FragColor = vec4(rgb * a, a * (1.0 - vAdd));
}`;

export function makeParticleMaterial(shared) {
  const m = new THREE.ShaderMaterial({
    vertexShader: vert, fragmentShader: frag,
    uniforms: {
      ...shared,
      uFogColor: G.uFogColor, uFogSunColor: G.uFogSunColor, uFogDensity: G.uFogDensity, uFogHeight: G.uFogHeight, uFogBase: G.uFogBase,
      uSunDir: G.uSunDir, uCamPos: G.uCamPos, uDesat: G.uDesat,
    },
    transparent: true, depthWrite: false, depthTest: true, side: THREE.DoubleSide,
    blending: THREE.CustomBlending, blendEquation: THREE.AddEquation,
    blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor,
    blendSrcAlpha: THREE.OneFactor, blendDstAlpha: THREE.OneMinusSrcAlphaFactor,
  });
  return m;
}

// Anchor table: 256 world positions (+ alpha in w) in a float texture, re-uploaded when dirty.
export class Anchors {
  constructor(n = 256) {
    this.n = n;
    this.data = new Float32Array(n * 4);
    this.until = new Float64Array(n);   // time until which ring particles may still reference the slot
    this.used = new Uint8Array(n);
    this.tex = new THREE.DataTexture(this.data, 64, Math.ceil(n / 64), THREE.RGBAFormat, THREE.FloatType);
    this.tex.minFilter = this.tex.magFilter = THREE.NearestFilter;
    this.tex.needsUpdate = true;
    this.dirty = false;
    this.cursor = 0;
  }
  alloc(now) {
    for (let k = 0; k < this.n; k++) {
      const i = (this.cursor + k) % this.n;
      if (!this.used[i] && this.until[i] <= now) { this.used[i] = 1; this.until[i] = now; this.set(i, 0, -9999, 0, 0); this.cursor = (i + 1) % this.n; return i; }
    }
    return -1;
  }
  set(i, x, y, z, a) {
    if (i < 0) return;
    const d = this.data, k = i * 4;
    d[k] = x; d[k + 1] = y; d[k + 2] = z; d[k + 3] = a;
    this.dirty = true;
  }
  setA(i, a) { if (i >= 0) { this.data[i * 4 + 3] = a; this.dirty = true; } }
  touch(i, until) { if (i >= 0 && until > this.until[i]) this.until[i] = until; }
  free(i) { if (i < 0) return; this.used[i] = 0; this.setA(i, 0); }
  reset() { this.used.fill(0); this.until.fill(0); this.data.fill(0); this.dirty = true; this.cursor = 0; }
  flush() { if (this.dirty) { this.tex.needsUpdate = true; this.dirty = false; } }
  count() { let c = 0; for (let i = 0; i < this.n; i++) c += this.used[i]; return c; }
}

const QUAD = (() => {
  const g = new THREE.InstancedBufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute([-0.5, -0.5, 0, 0.5, -0.5, 0, 0.5, 0.5, 0, -0.5, 0.5, 0], 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 1, 1, 0, 1], 2));
  g.setIndex([0, 1, 2, 0, 2, 3]);
  return g;
})();

export class ParticlePool {
  constructor(name, ring, held, material, renderOrder) {
    this.name = name; this.ring = ring; this.heldN = held; this.size = ring + held;
    this.data = new Float32Array(this.size * STRIDE);
    for (let i = 0; i < this.size; i++) { this.data[i * STRIDE + 3] = -1e9; this.data[i * STRIDE + 7] = 1; this.data[i * STRIDE + 22] = -1; }
    this.buf = new THREE.InstancedInterleavedBuffer(this.data, STRIDE, 1);
    this.buf.setUsage(THREE.DynamicDrawUsage);
    this.buf.onUpload(() => { this.uploads++; });
    this.uploads = 0; this.fullAt = -1;
    const g = new THREE.InstancedBufferGeometry();
    g.index = QUAD.index;
    g.setAttribute('position', QUAD.attributes.position);
    g.setAttribute('uv', QUAD.attributes.uv);
    ['aP0', 'aV0', 'aDyn', 'aSize', 'aCol', 'aMisc', 'aExtra'].forEach((n, i) => g.setAttribute(n, new THREE.InterleavedBufferAttribute(this.buf, 4, i * 4)));
    g.instanceCount = this.size;
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e7);
    this.geo = g;
    this.mesh = new THREE.Mesh(g, material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = renderOrder;
    this.mesh.name = 'fx-' + name;
    // two ring regions: short-lived bursts, and a smaller one for long-lived (> 4 s) particles (plumes, leaves,
    // chimney smoke) so heavy combat spam can never recycle them early
    const longN = Math.min(2048, ring >> 3);
    this.regions = [{ base: 0, n: ring - longN, head: 0, written: 0, start: 0 }, { base: ring - longN, n: longN, head: 0, written: 0, start: 0 }];
    this.free = []; for (let i = this.size - 1; i >= ring; i--) this.free.push(i);
    this.heldDirty = [];
    this.spawned = 0; this.until = -1;
  }
  reset() {
    for (let i = 0; i < this.size; i++) { const b = i * STRIDE; this.data[b + 3] = -1e9; this.data[b + 7] = 1; this.data[b + 22] = -1; this.data[b + 23] = 0; }
    for (const r of this.regions) { r.head = 0; r.written = 0; r.start = 0; }
    this.heldDirty.length = 0; this.until = -1;
    this.free = []; for (let i = this.size - 1; i >= this.ring; i--) this.free.push(i);
    this.fullAt = this.uploads;       // full re-upload pending until the next GPU upload happens
  }
  nextRing(life = 0) {
    const r = this.regions[life > 4 ? 1 : 0];
    const s = r.base + r.head;
    r.head = (r.head + 1) % r.n;
    r.written++;
    return s;
  }
  allocHeld() { return this.free.length ? this.free.pop() : -1; }
  killHeld(slot) {
    if (slot < this.ring) return;
    const b = slot * STRIDE;
    this.data[b + 3] = -1e9; this.data[b + 7] = 1; this.data[b + 23] = 0;   // clear LOOP so it is culled
    this.heldDirty.push(slot);
    this.free.push(slot);
  }
  markHeld(slot) { this.heldDirty.push(slot); }
  flush() {
    if (this.fullAt >= 0) {
      if (this.uploads > this.fullAt) this.fullAt = -1;
      else {
        for (const r of this.regions) { this.spawned += r.written; r.written = 0; r.start = r.head; }
        this.heldDirty.length = 0;
        this.buf.clearUpdateRanges(); this.buf.needsUpdate = true; return;
      }
    }
    let any = false;
    for (const r of this.regions) {
      if (r.written <= 0) continue;
      const n = Math.min(r.written, r.n), a = r.start;
      if (a + n <= r.n) this.buf.addUpdateRange((r.base + a) * STRIDE, n * STRIDE);
      else { this.buf.addUpdateRange((r.base + a) * STRIDE, (r.n - a) * STRIDE); this.buf.addUpdateRange(r.base * STRIDE, (a + n - r.n) * STRIDE); }
      this.spawned += r.written;
      r.written = 0; r.start = r.head; any = true;
    }
    if (this.heldDirty.length) {
      for (const s of this.heldDirty) this.buf.addUpdateRange(s * STRIDE, STRIDE);
      this.heldDirty.length = 0; any = true;
    }
    if (any) this.buf.needsUpdate = true;
  }
  alive(now) {
    let c = 0; const d = this.data;
    for (let i = 0; i < this.size; i++) { const b = i * STRIDE; const age = now - d[b + 3]; if (age >= 0 && (age <= d[b + 7] || (d[b + 23] & 32))) c++; }
    return c;
  }
}
