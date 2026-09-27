// Ground decals: telegraphs (circle / cone / line fill-up warnings), persistent hazard pools, consecrate, flamestrike,
// lava cracks. Each decal is a small grid mesh whose vertices are conformed to the ground with fx.heightAt at creation;
// one shared shader (branching on a uniform) draws every kind with analytic, anti-aliased edges.
//   fx.ground(name, pos, { radius, duration, color, fill, angle, length, width, dir, delay })
//   dir: Vector3 (world forward) or number (facing yaw, forward = (-sin, 0, -cos)); angle = full cone angle (rad).
//   Telegraphs fill 0→1 over `duration` then flash out; pass fill (number) + no duration to drive it with setFill().
import * as THREE from 'three';
import { G, FOG_GLSL_PARS } from '../engine/materials.js';
import { Inst, tintOf } from './inst.js';
import { S, R } from './textures.js';
import { P, lin, FIRE, FROST, HOLY, STORM, POI, SHD, PHYS } from './presets.js';

const TAU = Math.PI * 2;

const VERT = /* glsl */`
attribute vec2 aLocal;
varying vec2 vL; varying vec3 vW;
void main() { vL = aLocal; vW = position; gl_Position = projectionMatrix * viewMatrix * vec4(position, 1.0); }`;

const FRAG = /* glsl */`
uniform int uKind; uniform float uR; uniform float uLen; uniform float uW; uniform float uHalf; uniform float uFill; uniform float uAlpha;
uniform float uFlash; uniform float uFxTime; uniform vec3 uColor; uniform vec3 uColor2; uniform float uSeed; uniform vec3 uLight; uniform float uDesat;
uniform sampler2D uRune;
varying vec2 vL; varying vec3 vW;
${FOG_GLSL_PARS}
float h21(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float vn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(h21(i), h21(i + vec2(1.0, 0.0)), f.x), mix(h21(i + vec2(0.0, 1.0)), h21(i + vec2(1.0, 1.0)), f.x), f.y); }
float fbm(vec2 p){ float s = 0.0, a = 0.5; for (int i = 0; i < 4; i++) { s += a * vn(p); p = p * 2.03 + 17.1; a *= 0.5; } return s; }
vec2 vor(vec2 p) {
  vec2 i = floor(p), f = fract(p); float f1 = 8.0, f2 = 8.0;
  for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
    vec2 g = vec2(float(x), float(y)); vec2 o = vec2(h21(i + g + uSeed), h21(i + g + 19.7 + uSeed));
    vec2 r = g + o - f; float d = dot(r, r);
    if (d < f1) { f2 = f1; f1 = d; } else if (d < f2) f2 = d;
  }
  f1 = sqrt(f1); f2 = sqrt(f2);
  return vec2(f1, f2 - f1);
}
void main() {
  vec2 p = vL; float t = uFxTime;
  vec3 rgbA = vec3(0.0);  // alpha-blended colour (premultiplied later)
  float a = 0.0;          // coverage
  vec3 add = vec3(0.0);   // additive glow
  if (uKind <= 2) {
    // ---------------- telegraphs
    float sd, prog;
    if (uKind == 0) { float r = length(p); sd = r - uR; prog = r / uR; }
    else if (uKind == 1) {
      float r = length(p);
      vec2 q = vec2(abs(p.x), p.y);
      vec2 sdir = vec2(sin(uHalf), cos(uHalf));
      float side = dot(q, vec2(sdir.y, -sdir.x));
      if (uHalf > 1.5707) side = (abs(atan(p.x, p.y)) - uHalf) * r;
      sd = max(r - uR, side);
      prog = r / uR;
    } else {
      vec2 q = vec2(abs(p.x) - uW * 0.5, abs(p.y - uLen * 0.5) - uLen * 0.5);
      sd = length(max(q, 0.0)) + min(max(q.x, q.y), 0.0);
      prog = clamp(p.y / uLen, 0.0, 1.0);
    }
    float px = max(fwidth(sd), 0.002);
    float inside = 1.0 - smoothstep(-px, px, sd);
    float ew = max(0.07 + uR * 0.008, px * 1.5);
    float edge = inside * smoothstep(-ew - px, -ew + px, sd);
    float pp = max(fwidth(prog), 1e-4);
    float filled = 1.0 - smoothstep(-pp, pp, prog - uFill);
    float fr = (prog - uFill) * (uKind == 2 ? uLen : uR);
    float front = exp(-fr * fr / 0.02) * step(0.002, uFill) * step(uFill, 0.998);
    float body = 0.18 + 0.2 * pow(clamp(prog, 0.0, 1.0), 3.0);
    float stripes = smoothstep(0.55, 0.75, sin(prog * (uKind == 2 ? uLen : uR) * 2.8 - t * 5.0)) * 0.05 * (1.0 - filled);
    a = inside * (body + filled * 0.3 + stripes);
    rgbA = uColor * a;
    float pulse = 0.85 + 0.15 * sin(t * 10.0) * step(0.8, uFill);
    add = uColor2 * (edge * 3.0 * pulse + front * 2.0 * inside + filled * inside * 0.14 + uFlash * inside * 2.0);
  } else if (uKind == 3 || uKind == 10 || uKind == 12) {
    // ---------------- fire pool (3) / scorched ground (10) / flamestrike base (12)
    float r = length(p) / uR;
    float n = fbm(p * 0.8 + vec2(0.0, -t * 0.25) + uSeed);
    float warp = fbm(p * 0.45 + n * 1.4 + t * 0.07);
    float mask = smoothstep(1.0, 0.8, r + (warp - 0.5) * 0.4);
    vec2 v = vor(p * 0.85 + warp * 1.3);
    float crack = 1.0 - smoothstep(0.0, 0.14, v.y);
    float heat = fbm(p * 1.2 - vec2(t * 0.35, t * 0.2));
    float hot = crack * 0.9 + smoothstep(0.5, 0.85, heat) * 0.6 + (1.0 - r) * 0.3;
    vec3 lava = mix(vec3(1.4, 0.28, 0.04), vec3(4.2, 1.7, 0.35), smoothstep(0.45, 0.85, heat + crack * 0.3));
    float flick = 0.8 + 0.2 * sin(t * 6.0 + heat * 14.0);
    if (uKind == 10) { hot *= 0.35 * uFill; lava *= 0.7; }
    a = mask * (uKind == 10 ? 0.85 : 0.88);
    rgbA = vec3(0.05, 0.018, 0.01) * uLight * a;
    add = lava * clamp(hot, 0.0, 1.3) * mask * flick * (uKind == 10 ? 1.0 : 1.0);
    // glowing rim
    add += vec3(2.2, 0.6, 0.1) * exp(-pow((r - 0.86) / 0.1, 2.0)) * (uKind == 10 ? 0.0 : 0.5);
    if (uKind == 12) { add *= 0.6 + 0.8 * uFill; }
  } else if (uKind == 4) {
    // ---------------- frost pool
    float r = length(p) / uR;
    float n = fbm(p * 0.7 + uSeed);
    float mask = smoothstep(1.0, 0.82, r + (n - 0.5) * 0.35);
    vec2 v = vor(p * 1.3);
    vec2 v2 = vor(p * 3.1 + 7.0);
    float lines = (1.0 - smoothstep(0.0, 0.05, v.y)) + (1.0 - smoothstep(0.0, 0.04, v2.y)) * 0.5;
    float frost = fbm(p * 2.5) ;
    a = mask * (0.55 + frost * 0.3);
    rgbA = mix(vec3(0.5, 0.72, 0.95), vec3(0.9, 0.97, 1.0), frost) * uLight * a;
    float tw = step(0.985, h21(floor(p * 9.0) + floor(t * 3.0 + h21(floor(p * 9.0)) * 3.0)));
    add = (vec3(0.35, 0.75, 1.5) * lines * 0.8 + vec3(2.5, 3.0, 3.5) * tw) * mask;
    add += vec3(0.4, 0.8, 1.6) * exp(-pow((r - 0.88) / 0.08, 2.0)) * 0.6;
  } else if (uKind == 5) {
    // ---------------- poison pool
    float r = length(p) / uR;
    float n = fbm(p * 0.7 + uSeed + vec2(t * 0.05, 0.0));
    float mask = smoothstep(1.0, 0.84, r + (n - 0.5) * 0.4);
    float goo = fbm(p * 1.6 + vec2(sin(t * 0.3), t * 0.2));
    vec2 v = vor(p * 1.6 + vec2(0.0, t * 0.1));
    float bub = fract(t * 0.7 + h21(floor(p * 1.6 + vec2(0.0, t * 0.1)))); // bubble ring phase per cell
    float ring = exp(-pow((v.x - bub * 0.45) / 0.035, 2.0)) * (1.0 - bub);
    a = mask * 0.85;
    rgbA = mix(vec3(0.05, 0.16, 0.02), vec3(0.18, 0.45, 0.05), goo) * uLight * a;
    add = vec3(0.6, 1.8, 0.2) * (smoothstep(0.62, 0.8, goo) * 0.6 + ring * 1.1) * mask;
    add += vec3(0.5, 1.4, 0.15) * exp(-pow((r - 0.9) / 0.07, 2.0)) * 0.5;
  } else if (uKind == 6) {
    // ---------------- void pool
    float r = length(p) / uR;
    float ang = atan(p.y, p.x);
    float sw = ang * 3.0 + log(max(r, 0.03)) * 4.0 + t * 1.6;
    float arms = pow(0.5 + 0.5 * sin(sw + fbm(p * 1.2) * 3.0), 3.0);
    float mask = smoothstep(1.0, 0.86, r + (fbm(p * 0.9 + uSeed) - 0.5) * 0.3);
    a = mask * mix(0.95, 0.75, r);
    rgbA = vec3(0.02, 0.0, 0.04) * a;
    add = vec3(0.8, 0.25, 1.6) * arms * mask * (0.35 + r * 0.9);
    add += vec3(1.4, 0.5, 2.6) * exp(-pow((r - 0.93) / 0.06, 2.0)) * mask;
  } else if (uKind == 7) {
    // ---------------- storm pool
    float r = length(p) / uR;
    float mask = smoothstep(1.0, 0.85, r + (fbm(p * 0.8 + uSeed) - 0.5) * 0.3);
    float cloud = fbm(p * 0.9 + vec2(t * 0.3, -t * 0.2));
    float slice = floor(t * 12.0);
    vec2 v = vor(p * 1.1 + h21(vec2(slice)) * 5.0);
    float arc = (1.0 - smoothstep(0.0, 0.035, v.y)) * step(0.55, h21(floor(p * 1.1) + slice));
    a = mask * 0.8;
    rgbA = mix(vec3(0.05, 0.07, 0.14), vec3(0.18, 0.24, 0.4), cloud) * a;
    add = vec3(1.4, 2.2, 4.0) * arc * mask + vec3(0.2, 0.35, 0.9) * smoothstep(0.55, 0.85, cloud) * mask;
    add += vec3(0.5, 0.8, 2.0) * exp(-pow((r - 0.9) / 0.07, 2.0)) * 0.6;
  } else if (uKind == 8 || uKind == 11) {
    // ---------------- consecrate (8) / flamestrike rune (11)
    float r = length(p) / uR;
    float c = cos(t * 0.25), s = sin(t * 0.25);
    vec2 q = mat2(c, -s, s, c) * p / uR;
    float rune = texture2D(uRune, q * 0.5 + 0.5).r * step(r, 1.0);
    float glow = smoothstep(1.0, 0.0, r);
    float pulse = 0.8 + 0.2 * sin(t * 3.0);
    float mask = smoothstep(1.02, 0.97, r);
    a = mask * (0.12 + 0.18 * glow);
    rgbA = uColor * 0.4 * a;
    add = uColor2 * (rune * 2.2 * pulse + glow * 0.35 + exp(-pow((r - 0.985) / 0.02, 2.0)) * 1.5) * mask;
    if (uKind == 11) add *= 0.4 + uFill * 1.6;
  } else if (uKind == 9) {
    // ---------------- lava crack fissure
    vec2 q = p;
    float along = uLen > 0.0 ? clamp(p.y / uLen, 0.0, 1.0) : 0.0;
    float d = uLen > 0.0 ? max(abs(p.x) / uR, abs(p.y - uLen * 0.5) / (uLen * 0.5)) : length(p) / uR;
    float mask = smoothstep(1.0, 0.7, d + (fbm(p * 0.9 + uSeed) - 0.5) * 0.4);
    float mainLine = uLen > 0.0 ? exp(-pow((p.x - (fbm(vec2(p.y * 0.35, uSeed)) - 0.5) * uR * 1.2) / (0.12 + 0.15 * uFill), 2.0)) : 0.0;
    vec2 v = vor(q * 0.9);
    float cr = (1.0 - smoothstep(0.0, 0.07 + 0.05 * uFill, v.y)) * smoothstep(1.0, 0.3, d);
    float glow = max(mainLine, cr);
    float pulse = 0.75 + 0.25 * sin(t * 4.0 + fbm(p) * 6.0);
    a = mask * 0.7;
    rgbA = vec3(0.06, 0.03, 0.02) * uLight * a;
    add = mix(vec3(2.2, 0.45, 0.06), vec3(4.5, 2.0, 0.4), glow * uFill) * glow * mask * pulse * (0.4 + uFill);
  }
  // fog + fade
  vec3 f0 = applyFog(vec3(0.0), vW), f1 = applyFog(vec3(1.0), vW);
  float fog = clamp(1.0 - (f1.r - f0.r), 0.0, 1.0);
  vec3 fc = f0 / max(fog, 1e-3);
  rgbA = mix(rgbA, fc * a, fog);
  add *= 1.0 - fog;
  vec3 rgb = (rgbA + add) * uAlpha;
  rgb = mix(rgb, vec3(dot(rgb, vec3(0.3, 0.5, 0.2))) * vec3(0.85, 0.95, 1.1), uDesat);
  gl_FragColor = vec4(rgb, a * uAlpha);
}`;

const KIND = { circle: 0, cone: 1, line: 2, fire: 3, frost: 4, poison: 5, void: 6, storm: 7, consecrate: 8, crack: 9, scorch: 10, strikeRune: 11, strikeBase: 12 };

export class Decal extends Inst {
  constructor(fx, recipe, pos, opts) {
    super(fx, recipe, opts);
    this.fixed = new THREE.Vector3().copy(pos);
    this.radius0 = this.radius = (opts.radius ?? recipe.radius ?? 3) * (opts.scale ?? 1);
    this.grow = opts.grow ?? 0;          // m/s: radius grows over time (spreading pools); mesh is built for the max
    this.length = opts.length ?? recipe.length ?? 12;
    this.width = opts.width ?? recipe.width ?? 3;
    this.angle = opts.angle ?? recipe.angle ?? Math.PI / 3;
    const d = opts.dir;
    if (typeof d === 'number') this.fwd = new THREE.Vector3(-Math.sin(d), 0, -Math.cos(d));
    else if (d) this.fwd = new THREE.Vector3(d.x, 0, d.z).normalize();
    else this.fwd = new THREE.Vector3(0, 0, -1);
    if (this.fwd.lengthSq() < 0.5) this.fwd.set(0, 0, -1);
    this.manualFill = typeof opts.fill === 'number' && opts.duration === undefined ? opts.fill : null;
    this.fill0 = typeof opts.fill === 'number' ? Math.max(0, Math.min(1, opts.fill)) : 0;
    this.duration = opts.duration ?? recipe.dur ?? Infinity;
    this.maxDist = opts.maxDist ?? 260;
    this.kind = recipe.kind;
  }
  setFill(v) { this.manualFill = Math.max(0, Math.min(1, v)); }
  get fill() { return this.manualFill ?? (isFinite(this.duration) ? Math.min(1, this.fill0 + (1 - this.fill0) * this.age / this.duration) : 1); }
  start() {
    const r = this.recipe;
    this.mat = new THREE.ShaderMaterial({
      vertexShader: VERT, fragmentShader: FRAG,
      uniforms: {
        uKind: { value: KIND[r.kind] }, uR: { value: this.radius }, uLen: { value: r.kind === 'line' || r.kind === 'crack' && this.opts.length ? this.length : 0 },
        uW: { value: this.width }, uHalf: { value: this.angle / 2 }, uFill: { value: 0 }, uAlpha: { value: 0 }, uFlash: { value: 0 },
        uColor: { value: new THREE.Color(...(this.opts.color !== undefined ? tintOf(this.opts.color) : r.color || lin(0xff3a10))) },
        uColor2: { value: new THREE.Color(...(this.opts.color !== undefined ? tintOf(this.opts.color) : r.color2 || lin(0xff8a20))) },
        uSeed: { value: this.fx.r(0, 50) }, uFxTime: this.fx.u.uFxTime, uLight: this.fx.u.uLight, uRune: { value: this.fx.tex.runeTex },
        uFogColor: G.uFogColor, uFogSunColor: G.uFogSunColor, uFogDensity: G.uFogDensity, uFogHeight: G.uFogHeight, uFogBase: G.uFogBase, uSunDir: G.uSunDir, uCamPos: G.uCamPos, uDesat: G.uDesat,
      },
      transparent: true, depthWrite: false, side: THREE.DoubleSide,
      blending: THREE.CustomBlending, blendEquation: THREE.AddEquation, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor,
      blendSrcAlpha: THREE.OneFactor, blendDstAlpha: THREE.OneMinusSrcAlphaFactor,
      polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4,
    });
    this.mesh = new THREE.Mesh(this.buildGeo(), this.mat);
    this.mesh.renderOrder = 3; this.mesh.frustumCulled = true;
    this.addMesh(this.mesh);
    return super.start();
  }
  buildGeo() {
    const r = this.recipe, kind = r.kind, c = this.fixed, f = this.fwd, rx = -f.z, rz = f.x, H = this.fx.heightAt;
    const lift = 0.05;
    const pos = [], loc = [], idx = [];
    const put = (lx, ly) => {
      const wx = c.x + rx * lx + f.x * ly, wz = c.z + rz * lx + f.z * ly;
      pos.push(wx, H(wx, wz) + lift, wz); loc.push(lx, ly);
    };
    if (kind === 'line' || (kind === 'crack' && this.opts.length)) {
      const L = this.length, W = kind === 'crack' ? this.radius * 2 : this.width, m = 0.3;
      const nx = Math.max(2, Math.ceil((W + 2 * m) / 1.0)), ny = Math.max(2, Math.ceil((L + 2 * m) / 1.0));
      for (let j = 0; j <= ny; j++) for (let i = 0; i <= nx; i++) put(-W / 2 - m + (W + 2 * m) * i / nx, -m + (L + 2 * m) * j / ny);
      for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) { const a = j * (nx + 1) + i, b = a + 1, d = a + nx + 1, e = d + 1; idx.push(a, d, b, b, d, e); }
    } else {
      const Rmax = this.grow > 0 ? this.radius0 + this.grow * Math.min(isFinite(this.duration) ? this.duration : 20, 30) : this.radius;
      const R0 = Rmax * 1.06 + 0.15;
      const cone = kind === 'cone';
      const a0 = cone ? -this.angle / 2 - 0.08 : 0, a1 = cone ? this.angle / 2 + 0.08 : TAU;
      const rings = Math.max(4, Math.min(28, Math.ceil(R0 / 0.7)));
      const segs = cone ? Math.max(8, Math.ceil((a1 - a0) * R0 / 0.6)) : Math.max(24, Math.min(96, Math.ceil(TAU * R0 / 0.6)));
      put(0, 0);
      for (let k = 1; k <= rings; k++) {
        const rr = R0 * k / rings;
        for (let s = 0; s <= segs; s++) { const a = a0 + (a1 - a0) * s / segs; put(Math.sin(a) * rr, Math.cos(a) * rr); }
      }
      const row = segs + 1;
      for (let s = 0; s < segs; s++) idx.push(0, 1 + s + 1, 1 + s);
      for (let k = 1; k < rings; k++) for (let s = 0; s < segs; s++) {
        const a = 1 + (k - 1) * row + s, b = a + 1, d = a + row, e = d + 1;
        idx.push(a, b, d, b, e, d);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('aLocal', new THREE.Float32BufferAttribute(loc, 2));
    g.setIndex(idx);
    g.computeBoundingSphere();
    this.mesh && this.mesh.geometry.dispose();
    return g;
  }
  update(dt) {
    const keep = super.update(dt);
    const u = this.mat.uniforms;
    const fin = isFinite(this.duration);
    if (this.grow > 0) { this.radius = this.radius0 + this.grow * this.age; u.uR.value = this.radius; }
    const fadeIn = Math.min(1, this.age / (this.recipe.fadeIn ?? 0.15));
    u.uAlpha.value = fadeIn * this.k;
    u.uFill.value = this.fill;
    if (this.recipe.telegraph) u.uFlash.value = this.stopping && fin && this.age >= this.duration ? this.fade : 0;
    return keep;
  }
  end() { super.end(); this.mesh?.geometry.dispose(); this.mat?.dispose(); }
  // uniform-space position of the decal centre offset along its frame (for recipes)
  local(lx, ly, out) { const f = this.fwd; return out.set(this.fixed.x - f.z * lx + f.x * ly, 0, this.fixed.z + f.x * lx + f.z * ly); }
}

// ------------------------------------------------------------------ recipes
const _p = new THREE.Vector3();
const G_ = {
  heat: P({ pool: 'alpha', sprite: [S.smoke1, S.smoke3], ramp: R.fireSmokeWarm, life: [1.2, 1.8], size: [0.6, 0.9], end: 2.2, ease: 2, drag: 1, accY: 1, turb: 0.3, alpha: 0.5 }),
  lick: P({ sprite: [S.flame1, S.flame2], ramp: R.fire, life: [0.35, 0.6], size: [0.35, 0.6], end: 0.4, rot: [-0.2, 0.2], drag: 2, accY: 2.5, i: [2, 3] }),
  frostMist: P({ pool: 'alpha', sprite: [S.smoke1, S.smoke2, S.smoke3], ramp: R.frostMist, life: [1.6, 2.4], size: [0.8, 1.2], end: 1.8, ease: 2, drag: 1.5, accY: 0.1, turb: 0.3, alpha: 0.7 }),
  poisonBub: P({ sprite: S.bubble, ramp: R.poison, life: [0.4, 0.7], size: [0.12, 0.25], end: 1.6, accY: 0.8, drag: 2, i: [1.4, 2.2] }),
  voidMote: P({ sprite: S.dot, ramp: R.shadowCore, life: [1.0, 1.5], size: [0.06, 0.1], end: 0.5, motion: 'orbit', rise: 0.4, rgrow: -1.2, i: [3, 5] }),
  voidWisp: P({ sprite: [S.wisp, S.swirl], ramp: R.shadow, life: [0.8, 1.2], size: [0.5, 0.8], end: 1.3, spin: [-2, 2], randSpin: true, drag: 1.5, accY: 1.2, turb: 0.2, i: [1.4, 2.2] }),
  arcBolt: P({ sprite: S.bolt, ramp: R.wFlash, life: [0.07, 0.14], size: [0.8, 1.4], color: [0.55, 0.75, 1], i: [3.5, 5] }),
  holyMote: P({ sprite: S.dot, ramp: R.holyWarm, life: [1.4, 2.2], size: [0.05, 0.09], end: 0.5, drag: 0.6, accY: 1.0, turb: 0.25, i: [4, 6] }),
  holyRay: P({ sprite: S.beam, ramp: R.wInOut, life: [1.0, 1.6], size: [0.2, 0.35], orient: 'axisY', stretch: 9, color: [1, 0.85, 0.45], i: [1.2, 2] }),
  strikeCol: P({ sprite: [S.blob, S.flame1, S.flame2], ramp: R.fire, life: [0.5, 0.9], size: [0.9, 1.4], end: [1.2, 1.8], ease: 2, rot: [-0.35, 0.35], spin: [-0.8, 0.8], drag: 1.2, accY: 6, turb: 0.3, i: [2.5, 3.5] }),
  strikePillar: P({ sprite: S.beam, ramp: R.wInOut, life: 0.9, size: 3.4, end: 1.2, orient: 'axisY', stretch: 3.4, color: [1, 0.45, 0.1], i: 2.4 }),
};
const around = (h, rmax, fn) => { const fx = h.fx, a = fx.r(0, TAU), r = Math.sqrt(fx.rng.next()) * rmax; const x = h.fixed.x + Math.cos(a) * r, z = h.fixed.z + Math.sin(a) * r; fn(x, fx.heightAt(x, z), z); };

const tele = kind => ({ kind, telegraph: true, color: lin(0xff2a08), color2: lin(0xff7a18), fade: 0.18, dur: 2 });
export const GROUND = {
  telegraphCircle: tele('circle'),
  telegraphCone: tele('cone'),
  telegraphLine: tele('line'),
  firePool: {
    kind: 'fire', radius: 3.5, fade: 0.6, fadeIn: 0.4,
    tick(h) {
      const fx = h.fx, R0 = h.radius, rate = R0 * R0;
      h.emit('fl', rate * 2.6, () => around(h, R0 * 0.85, (x, y, z) => fx.spawn(G_.lick, x, y + 0.1, z, 0, fx.r(0.4, 1), 0)));
      h.emit('em', rate * 0.9, () => around(h, R0 * 0.85, (x, y, z) => fx.spawn(FIRE.emberFloat, x, y + 0.2, z, 0, fx.r(0.8, 2), 0)));
      h.emit('sm', rate * 0.25, () => around(h, R0 * 0.8, (x, y, z) => fx.spawn(G_.heat, x, y + 0.5, z, 0, fx.r(0.4, 1), 0)));
    },
  },
  frostPool: {
    kind: 'frost', radius: 3.5, fade: 0.6, fadeIn: 0.4,
    tick(h) {
      const fx = h.fx, R0 = h.radius, rate = R0 * R0;
      h.emit('mi', rate * 0.35, () => around(h, R0 * 0.85, (x, y, z) => fx.spawn(G_.frostMist, x, y + 0.3, z, fx.r(-0.2, 0.2), 0.05, fx.r(-0.2, 0.2))));
      h.emit('sp', rate * 0.8, () => around(h, R0 * 0.9, (x, y, z) => fx.spawn(FROST.sparkle, x, y + fx.r(0.1, 0.6), z, 0, 0.1, 0)));
      h.emit('fl', rate * 0.3, () => around(h, R0 * 0.9, (x, y, z) => fx.spawn(FROST.flake, x, y + fx.r(1, 2.5), z, 0, -0.3, 0)));
    },
  },
  poisonPool: {
    kind: 'poison', radius: 3.5, fade: 0.6, fadeIn: 0.4,
    tick(h) {
      const fx = h.fx, R0 = h.radius, rate = R0 * R0;
      h.emit('bu', rate * 1.2, () => around(h, R0 * 0.85, (x, y, z) => fx.spawn(G_.poisonBub, x, y + 0.08, z, 0, fx.r(0.1, 0.4), 0)));
      h.emit('mi', rate * 0.35, () => around(h, R0 * 0.85, (x, y, z) => fx.spawn(POI.mist, x, y + 0.4, z, 0, fx.r(0.2, 0.5), 0)));
    },
  },
  voidPool: {
    kind: 'void', radius: 3.5, fade: 0.6, fadeIn: 0.4,
    tick(h) {
      const fx = h.fx, R0 = h.radius, rate = R0 * R0;
      h.emit('mo', rate * 1.4, () => { const y = fx.heightAt(h.fixed.x, h.fixed.z); fx.spawn(G_.voidMote, h.fixed.x, y + 0.15, h.fixed.z, R0 * fx.r(0.75, 1.0), fx.r(0, TAU), fx.r(1.2, 2.2)); });
      h.emit('wi', rate * 0.4, () => around(h, R0 * 0.7, (x, y, z) => fx.spawn(G_.voidWisp, x, y + 0.3, z, 0, fx.r(0.3, 0.8), 0)));
    },
  },
  stormPool: {
    kind: 'storm', radius: 3.5, fade: 0.6, fadeIn: 0.4, color: lin(0x6aa0ff),
    tick(h) {
      const fx = h.fx, R0 = h.radius, rate = R0 * R0;
      h.emit('bo', rate * 0.7, () => around(h, R0 * 0.85, (x, y, z) => fx.spawn(G_.arcBolt, x, y + fx.r(0.3, 0.7), z, 0, 0, 0, { rot: fx.r(-0.8, 0.8) })));
      h.emit('sp', rate * 1.5, () => around(h, R0 * 0.85, (x, y, z) => fx.spawn(STORM.spark, x, y + 0.1, z, fx.r(-2, 2), fx.r(2, 5), fx.r(-2, 2))));
    },
  },
  consecrate: {
    kind: 'consecrate', radius: 4, fade: 0.6, fadeIn: 0.35, dur: 8, color: lin(0xffc860), color2: lin(0xffd070),
    tick(h) {
      const fx = h.fx, R0 = h.radius, rate = R0 * R0;
      h.emit('mo', rate * 1.3, () => around(h, R0 * 0.95, (x, y, z) => fx.spawn(G_.holyMote, x, y + 0.1, z, 0, fx.r(0.4, 1), 0, { tint: h.tint })));
      h.emit('ra', rate * 0.12, () => around(h, R0 * 0.8, (x, y, z) => fx.spawn(G_.holyRay, x, y, z, 0, 0, 0, { tint: h.tint })));
    },
  },
  lavaCrack: {
    kind: 'crack', radius: 2.5, fade: 0.5, fadeIn: 0.5,
    tick(h) {
      const fx = h.fx, R0 = h.radius, L = h.opts.length;
      const n = L ? R0 * L : R0 * R0 * 2;
      h.emit('sm', n * 0.2, () => {
        const lx = fx.r(-0.4, 0.4) * R0, ly = L ? fx.r(0, L) : fx.r(-R0, R0);
        const p = L ? h.local(lx, ly, _p) : _p.set(h.fixed.x + fx.r(-R0, R0) * 0.7, 0, h.fixed.z + fx.r(-R0, R0) * 0.7);
        fx.spawn(FIRE.smoke, p.x, fx.heightAt(p.x, p.z) + 0.2, p.z, 0, fx.r(0.4, 1), 0, { scale: 0.7 });
      });
      h.emit('em', n * 0.5, () => {
        const lx = fx.r(-0.2, 0.2) * R0, ly = L ? fx.r(0, L) : fx.r(-R0, R0);
        const p = L ? h.local(lx, ly, _p) : _p.set(h.fixed.x + fx.r(-R0, R0) * 0.6, 0, h.fixed.z + fx.r(-R0, R0) * 0.6);
        fx.spawn(FIRE.emberFloat, p.x, fx.heightAt(p.x, p.z) + 0.1, p.z, 0, fx.r(1, 2.5), 0);
      });
    },
  },
  flamestrike: {
    kind: 'strikeRune', radius: 3, fade: 0.8, fadeIn: 0.2, color: lin(0xff5a10), color2: lin(0xff7a20),
    init(h) { h.delay = h.opts.delay ?? 1.0; h.duration = h.delay + (h.opts.burn ?? 2.5); },
    tick(h) {
      const fx = h.fx, R0 = h.radius, c = h.fixed;
      if (h.age < h.delay) { h.manualFill = h.age / h.delay; return; }
      if (h.once('strike', h.delay)) {
        const u = h.mat.uniforms; u.uKind.value = KIND.strikeBase; h.manualFill = 1;
        const y = fx.heightAt(c.x, c.z);
        fx.spawn(G_.strikePillar, c.x, y, c.z, 0, 0, 0, { scale: R0 / 3 });
        fx.spawn(FIRE.flash, c.x, y + 1.5, c.z, 0, 0, 0, { scale: R0 * 1.3 });
        for (let i = 0; i < 40; i++) around(h, R0 * 0.9, (x, yy, z) => fx.spawn(G_.strikeCol, x, yy + 0.2, z, fx.r(-0.5, 0.5), fx.r(4, 11), fx.r(-0.5, 0.5), { scale: R0 / 3 }));
        for (let i = 0; i < 30; i++) around(h, R0, (x, yy, z) => fx.spawn(FIRE.ember, x, yy + 0.5, z, fx.r(-3, 3), fx.r(6, 14), fx.r(-3, 3)));
        fx.spawn(PHYS.ring, c.x, y + 0.1, c.z, 0, 0, 0, { scale: R0 / 3 * 0.9, tint: [1, 0.5, 0.2] });
        fx.shake(0.35, c);
      }
      const k = Math.max(0, 1 - (h.age - h.delay) / 1.2);
      h.manualFill = Math.max(0.2, k);
      h.emit('col', 90 * k * R0 / 3, () => around(h, R0 * 0.85, (x, y, z) => fx.spawn(G_.strikeCol, x, y + 0.2, z, 0, fx.r(3, 8), 0, { scale: R0 / 3 * 0.8 })));
      h.emit('fl', 25 * R0 / 3, () => around(h, R0 * 0.85, (x, y, z) => fx.spawn(G_.lick, x, y + 0.1, z, 0, fx.r(0.4, 1), 0)));
      h.emit('sm', 8, () => around(h, R0 * 0.7, (x, y, z) => fx.spawn(FIRE.smokeWarm, x, y + 1.5, z, 0, fx.r(1, 2), 0, { scale: 1.3 })));
    },
  },
};
