// Painted sky dome: gradient, sun, stylized cumulus, layered distant ranges (parallax backdrop), and time-of-day.
import * as THREE from 'three';
import { G } from '../engine/materials.js';

const vert = /* glsl */`
varying vec3 vDir;
void main() {
  vDir = normalize(position);
  vec4 p = projectionMatrix * mat4(mat3(viewMatrix)) * vec4(position, 1.0);
  gl_Position = p.xyww; // at far plane
}`;

const frag = /* glsl */`
uniform vec3 uZenith; uniform vec3 uHorizon; uniform vec3 uGround; uniform vec3 uSunCol; uniform vec3 uSunDir;
uniform float uTime; uniform float uCloud; uniform vec3 uCloudLit; uniform vec3 uCloudShade; uniform vec3 uRange1; uniform vec3 uRange2; uniform float uStars;
uniform float uDesat;
varying vec3 vDir;
float h21(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float vn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
  return mix(mix(h21(i), h21(i+vec2(1,0)), f.x), mix(h21(i+vec2(0,1)), h21(i+vec2(1,1)), f.x), f.y); }
float fbm(vec2 p){ float s = 0.0, a = 0.5; for (int i = 0; i < 5; i++){ s += a * vn(p); p = p * 2.03 + 17.1; a *= 0.5; } return s; }
float ridge(float x, float seed) { // 1D mountain silhouette
  float s = 0.0, a = 0.5, f = 1.0;
  for (int i = 0; i < 5; i++) { s += a * (1.0 - abs(vn(vec2(x * f, seed)) * 2.0 - 1.0)); f *= 2.1; a *= 0.5; }
  return s;
}
void main() {
  vec3 d = normalize(vDir);
  float y = d.y;
  float az = atan(d.z, d.x);
  // gradient
  float t = pow(clamp(y, 0.0, 1.0), 0.55);
  vec3 col = mix(uHorizon, uZenith, t);
  float sd = max(dot(d, uSunDir), 0.0);
  col += uSunCol * (pow(sd, 6.0) * 0.28 + pow(sd, 60.0) * 0.5);
  col += uSunCol * smoothstep(0.9993, 0.9997, sd) * 6.0;               // disc
  // stars at night
  if (uStars > 0.0) {
    // ~0.4 degree cells; ~3% hold one soft, tinted, twinkling point somewhere inside (a few px across on screen)
    vec2 sp = vec2(az, asin(clamp(y, -1.0, 1.0))) * 140.0;
    vec2 cell = floor(sp), f = fract(sp);
    float h = h21(cell);
    if (h > 0.97) {
      vec2 c = vec2(h21(cell + 7.1), h21(cell + 3.7)) * 0.6 + 0.2;
      float size = 0.1 + 0.16 * h21(cell + 1.3) * h21(cell + 5.9);
      float st = smoothstep(size, 0.0, length(f - c)) * smoothstep(0.0, 0.25, y);
      float tw = 0.6 + 0.4 * sin(uTime * (1.2 + h * 3.0) + h * 40.0);
      vec3 tint = mix(vec3(0.72, 0.84, 1.0), vec3(1.0, 0.88, 0.72), h21(cell + 9.2));
      col += tint * st * tw * uStars * 1.8;
    }
  }
  // clouds on a virtual plane
  if (y > 0.0) {
    vec2 cp = d.xz / (y + 0.12) * 1.4 + vec2(uTime * 0.012, uTime * 0.004);
    float c = fbm(cp * 1.1);
    float c2 = fbm(cp * 2.7 + 3.0);
    float cov = smoothstep(0.52 - uCloud * 0.25, 0.78 - uCloud * 0.2, c * 0.8 + c2 * 0.35);
    float lit = clamp(0.55 + (fbm(cp * 1.1 + uSunDir.xz * 0.12) - c) * 5.0, 0.0, 1.0);
    vec3 cc = mix(uCloudShade, uCloudLit, lit);
    cc += uSunCol * pow(sd, 8.0) * 0.4 * (1.0 - cov * 0.5);
    float fade = smoothstep(0.0, 0.18, y);
    col = mix(col, cc, cov * fade * 0.92);
  }
  // distant ranges (parallax backdrop) just above the horizon
  float r1 = 0.035 + ridge(az * 2.2, 3.1) * 0.075;
  float r2 = 0.015 + ridge(az * 4.0 + 1.3, 7.7) * 0.05;
  float haze1 = smoothstep(r1, r1 - 0.004, y);
  float haze2 = smoothstep(r2, r2 - 0.003, y);
  col = mix(col, mix(uRange1, uHorizon, 0.35 + 0.4 * (1.0 - y / max(r1, 0.001))), haze1);
  col = mix(col, uRange2, haze2);
  // below horizon
  col = mix(col, uGround, smoothstep(0.0, -0.08, y));
  col = mix(col, vec3(dot(col, vec3(0.3, 0.5, 0.2))) * vec3(0.85, 0.95, 1.1), uDesat);
  gl_FragColor = vec4(col, 1.0);
}`;

// Time-of-day palette keys (t = 0..1 over the day; 0.5 = noon)
const KEYS = [
  { t: 0.0, zen: 0x0b1236, hor: 0x24305a, sun: 0x8a9ad8, fog: 0x2a365e, cl: 0x3a4468, cs: 0x141a34, amb: 0x5468a8, gnd: 0x26322c, sunI: 1.1, hemi: 1.35, stars: 1 },
  { t: 0.22, zen: 0x2a3a7a, hor: 0xf0a070, sun: 0xff9a50, fog: 0xc89a8a, cl: 0xffc090, cs: 0x6a5078, amb: 0x8a8ab0, gnd: 0x3a3a2a, sunI: 1.4, hemi: 1.0, stars: 0.2 },
  { t: 0.32, zen: 0x3f7fd0, hor: 0xbfd8ec, sun: 0xfff0d0, fog: 0xa9c4dc, cl: 0xffffff, cs: 0x9aa8c0, amb: 0xbcd4f0, gnd: 0x5a6a3a, sunI: 3.0, hemi: 1.15, stars: 0 },
  { t: 0.5, zen: 0x2f6fd0, hor: 0xc8e2f6, sun: 0xfff6e8, fog: 0xb0cfe8, cl: 0xffffff, cs: 0xb4c2dc, amb: 0xd4e0f0, gnd: 0x6a6a44, sunI: 3.2, hemi: 1.55, stars: 0 },
  { t: 0.68, zen: 0x3068c8, hor: 0xe6dcc8, sun: 0xffdca0, fog: 0xc4d0dc, cl: 0xfff4e0, cs: 0xb0b0c8, amb: 0xd8dce8, gnd: 0x6a6a44, sunI: 3.0, hemi: 1.5, stars: 0 },
  { t: 0.78, zen: 0x2a4a9a, hor: 0xf8a060, sun: 0xff9040, fog: 0xd8a080, cl: 0xffb070, cs: 0x7a5070, amb: 0x9a8ab0, gnd: 0x3e3c2c, sunI: 1.8, hemi: 1.05, stars: 0.1 },
  { t: 0.86, zen: 0x162050, hor: 0x5a3a68, sun: 0x9a8ac0, fog: 0x3e3a5e, cl: 0x6a4a6a, cs: 0x201830, amb: 0x5a5a98, gnd: 0x2a2c24, sunI: 0.9, hemi: 1.25, stars: 0.7 },
  { t: 1.0, zen: 0x0b1236, hor: 0x24305a, sun: 0x8a9ad8, fog: 0x2a365e, cl: 0x3a4468, cs: 0x141a34, amb: 0x5468a8, gnd: 0x26322c, sunI: 1.1, hemi: 1.35, stars: 1 },
];
const _a = new THREE.Color(), _b = new THREE.Color();
function lerpHex(out, h1, h2, t) { _a.set(h1); _b.set(h2); return out.copy(_a).lerp(_b, t); }

export class Sky {
  constructor() {
    this.u = {
      uZenith: { value: new THREE.Color() }, uHorizon: { value: new THREE.Color() }, uGround: { value: new THREE.Color() },
      uSunCol: { value: new THREE.Color() }, uSunDir: G.uSunDir, uTime: G.uTime, uCloud: { value: 0.2 },
      uCloudLit: { value: new THREE.Color() }, uCloudShade: { value: new THREE.Color() },
      uRange1: { value: new THREE.Color(0x7d93b0) }, uRange2: { value: new THREE.Color(0x6a7f98) }, uStars: { value: 0 },
      uDesat: G.uDesat,
    };
    const mat = new THREE.ShaderMaterial({ vertexShader: vert, fragmentShader: frag, uniforms: this.u, side: THREE.BackSide, depthWrite: false, depthTest: true });
    this.mesh = new THREE.Mesh(new THREE.SphereGeometry(10, 32, 16), mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = -1000;
    this.sunColor = new THREE.Color(); this.ambColor = new THREE.Color(); this.gndColor = new THREE.Color();
    this.sunIntensity = 3; this.hemiIntensity = 1.2;
    this.timeOfDay = 0.64;
  }
  // t: 0..1 day fraction
  setTime(t) {
    this.timeOfDay = t;
    let i = 0; while (i < KEYS.length - 2 && KEYS[i + 1].t < t) i++;
    const a = KEYS[i], b = KEYS[i + 1], f = THREE.MathUtils.clamp((t - a.t) / (b.t - a.t), 0, 1);
    const s = f * f * (3 - 2 * f);
    lerpHex(this.u.uZenith.value, a.zen, b.zen, s);
    lerpHex(this.u.uHorizon.value, a.hor, b.hor, s);
    lerpHex(this.u.uSunCol.value, a.sun, b.sun, s);
    lerpHex(this.u.uCloudLit.value, a.cl, b.cl, s);
    lerpHex(this.u.uCloudShade.value, a.cs, b.cs, s);
    lerpHex(G.uFogColor.value, a.fog, b.fog, s);
    lerpHex(this.ambColor, a.amb, b.amb, s);
    lerpHex(this.gndColor, a.gnd, b.gnd, s);
    this.u.uGround.value.copy(G.uFogColor.value).multiplyScalar(0.8);
    this.u.uRange1.value.copy(G.uFogColor.value).lerp(this.u.uZenith.value, 0.25).multiplyScalar(0.82);
    this.u.uRange2.value.copy(G.uFogColor.value).lerp(this.gndColor, 0.3).multiplyScalar(0.72);
    G.uFogSunColor.value.copy(this.u.uSunCol.value);
    this.sunColor.copy(this.u.uSunCol.value);
    this.sunIntensity = a.sunI + (b.sunI - a.sunI) * s;
    this.hemiIntensity = a.hemi + (b.hemi - a.hemi) * s;
    this.u.uStars.value = a.stars + (b.stars - a.stars) * s;
    // sun path: rises east (+x), sets west, tilted south
    const ang = (t - 0.25) * Math.PI * 2; // 0 at sunrise
    const el = Math.sin(ang);
    const dir = new THREE.Vector3(Math.cos(ang), Math.max(el, -0.2) * 0.9 + 0.08, 0.45).normalize();
    // at night use the moon (opposite side) for light direction
    if (el < 0.02) dir.set(-Math.cos(ang), Math.max(-el, 0.1) * 0.8 + 0.2, 0.3).normalize();
    G.uSunDir.value.copy(dir);
  }
}
