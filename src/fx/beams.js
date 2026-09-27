// Ribbon effects: beams between two points/objects (lightning, holy, shadow drain, arcane, frost, fire, heal) and melee
// swing trails. Both build a camera-facing triangle strip on the CPU every frame (a few dozen vertices each).
import * as THREE from 'three';
import { Inst, tintOf } from './inst.js';
import { S, R } from './textures.js';
import { P, lin, FIRE, FROST, ARC, SHD, HOLY, NAT, STORM, PHYS } from './presets.js';

const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _t = new THREE.Vector3(), _s = new THREE.Vector3(), _c = new THREE.Vector3(), _p = new THREE.Vector3(), _n = new THREE.Vector3(), _m = new THREE.Vector3();
const PREMUL = { transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.CustomBlending, blendEquation: THREE.AddEquation, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor, blendSrcAlpha: THREE.OneFactor, blendDstAlpha: THREE.OneMinusSrcAlphaFactor };

const BEAM_VERT = /* glsl */`
attribute vec3 aUv;   // across (-1..1), along (m), strand brightness
varying vec3 vUv;
void main() { vUv = aUv; gl_Position = projectionMatrix * viewMatrix * vec4(position, 1.0); }`;
const BEAM_FRAG = /* glsl */`
uniform vec3 uColor; uniform vec3 uCore; uniform float uAlpha; uniform float uFxTime; uniform float uScroll; uniform float uKind; uniform float uLen;
varying vec3 vUv;
float h11(float p) { p = fract(p * 0.1031); p *= p + 33.33; p *= p + p; return fract(p); }
float vn1(float x) { float i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f); return mix(h11(i), h11(i + 1.0), f); }
void main() {
  float x = abs(vUv.x);
  float core = exp(-x * x * 22.0);
  float glow = exp(-x * x * 3.2);
  float flow = 1.0;
  if (uKind > 0.5) flow = 0.65 + 0.7 * vn1(vUv.y * 1.3 - uFxTime * uScroll) * vn1(vUv.y * 3.1 - uFxTime * uScroll * 1.7 + 4.0);
  float ends = smoothstep(0.0, 0.6, vUv.y) * smoothstep(0.0, 0.6, uLen - vUv.y);
  vec3 col = (uCore * core * 1.3 + uColor * glow * 0.9 * flow) * vUv.z * uAlpha * mix(0.6, 1.0, ends);
  gl_FragColor = vec4(col, 0.0);
}`;

const TRAIL_VERT = /* glsl */`
attribute vec2 aT;   // x: age 0 (new) .. 1 (old), y: 0 base .. 1 tip
varying vec2 vT;
void main() { vT = aT; gl_Position = projectionMatrix * viewMatrix * vec4(position, 1.0); }`;
const TRAIL_FRAG = /* glsl */`
uniform vec3 uColor; uniform float uAlpha;
varying vec2 vT;
void main() {
  float age = clamp(vT.x, 0.0, 1.0);
  float side = vT.y;
  float edge = smoothstep(0.0, 0.35, side) * (0.35 + 0.65 * side);
  float tipLine = exp(-pow((1.0 - side) / 0.07, 2.0)) * (1.0 - age);
  float a = pow(1.0 - age, 1.6) * edge;
  vec3 col = uColor * a * 1.6 + vec3(1.0, 0.97, 0.9) * tipLine * 2.2 * (1.0 - age);
  gl_FragColor = vec4(col * uAlpha, 0.0);
}`;

function readPt(src, out) { if (src?.isObject3D) return src.getWorldPosition(out); return out.copy(src); }

export class Beam extends Inst {
  constructor(fx, recipe, from, to, opts) {
    super(fx, recipe, opts);
    this.from = from; this.to = to;
    this.width = (opts.width ?? recipe.width ?? 0.5) * this.s;
    this.duration = opts.duration ?? recipe.dur ?? 1.0;
    this.N = recipe.segments ?? 28; this.strands = recipe.strands ?? 1;
    this.maxDist = Infinity;
    this.A = new THREE.Vector3(); this.B = new THREE.Vector3();
    this.jag = []; this.jagT = 0;
    this.fixed = new THREE.Vector3();
  }
  start() {
    readPt(this.from, this.A); readPt(this.to, this.B); this.fixed.copy(this.B);
    const nv = this.strands * (this.N + 1) * 2;
    this.posArr = new Float32Array(nv * 3); this.uvArr = new Float32Array(nv * 3);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.posArr, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aUv', new THREE.BufferAttribute(this.uvArr, 3).setUsage(THREE.DynamicDrawUsage));
    const idx = [];
    for (let s = 0; s < this.strands; s++) for (let i = 0; i < this.N; i++) { const a = (s * (this.N + 1) + i) * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    g.setIndex(idx);
    const r = this.recipe;
    const col = this.tint || r.color, core = r.core || [1, 1, 1];
    this.mat = new THREE.ShaderMaterial({
      vertexShader: BEAM_VERT, fragmentShader: BEAM_FRAG,
      uniforms: { uColor: { value: new THREE.Color(...col) }, uCore: { value: new THREE.Color(...core) }, uAlpha: { value: 0 }, uFxTime: this.fx.u.uFxTime, uScroll: { value: r.scroll ?? 6 }, uKind: { value: r.kind === 'lightning' ? 0 : 1 }, uLen: { value: 1 } },
      ...PREMUL,
    });
    this.mesh = new THREE.Mesh(g, this.mat); this.mesh.frustumCulled = false; this.mesh.renderOrder = 23;
    this.mesh.userData.dispose = () => { g.dispose(); this.mat.dispose(); };
    this.addMesh(this.mesh);
    return super.start();
  }
  readPos(out) { readPt(this.to, out); return out; }
  update(dt) {
    readPt(this.from, this.A); readPt(this.to, this.B);
    const keep = super.update(dt);
    if (this.dead) return keep;
    this.build(dt);
    this.mat.uniforms.uAlpha.value = Math.min(1, this.age / 0.06) * this.k;
    return keep;
  }
  build(dt) {
    const r = this.recipe, fx = this.fx, N = this.N, A = this.A, B = this.B, cam = fx.camera.position;
    _t.subVectors(B, A); const len = _t.length(); if (len < 1e-3) return; _t.multiplyScalar(1 / len);
    this.mat.uniforms.uLen.value = len;
    // basis perpendicular to the beam
    _n.set(0, 1, 0); if (Math.abs(_t.y) > 0.9) _n.set(1, 0, 0);
    _s.crossVectors(_t, _n).normalize(); _n.crossVectors(_s, _t).normalize();
    const lightning = r.kind === 'lightning';
    if (lightning) {
      this.jagT -= dt;
      if (this.jagT <= 0 || this.jag.length !== this.strands) {
        this.jagT = 1 / 24;
        this.jag = [];
        for (let s = 0; s < this.strands; s++) {
          const arr = new Float32Array((N + 1) * 2);
          // midpoint displacement, amplitude ∝ length
          const disp = (i0, i1, amp) => {
            if (i1 - i0 < 2) return;
            const m = (i0 + i1) >> 1;
            arr[m * 2] = (arr[i0 * 2] + arr[i1 * 2]) / 2 + fx.r(-amp, amp);
            arr[m * 2 + 1] = (arr[i0 * 2 + 1] + arr[i1 * 2 + 1]) / 2 + fx.r(-amp, amp);
            disp(i0, m, amp * 0.55); disp(m, i1, amp * 0.55);
          };
          disp(0, N, len * (s === 0 ? 0.09 : 0.14));
          this.jag.push(arr);
        }
      }
    }
    let v = 0;
    const P = this.posArr, U = this.uvArr;
    for (let s = 0; s < this.strands; s++) {
      const bright = s === 0 ? 1 : (r.strandBright ?? 0.55);
      const w = this.width * (s === 0 ? 1 : (r.strandWidth ?? 0.45));
      for (let i = 0; i <= N; i++) {
        const u = i / N, env = Math.sin(Math.PI * u);
        _p.copy(A).addScaledVector(_t, len * u);
        if (lightning) { const j = this.jag[s]; _p.addScaledVector(_s, j[i * 2]).addScaledVector(_n, j[i * 2 + 1]); }
        else if (r.helix && s > 0) {
          const th = u * len * 1.6 - this.age * (r.helixSpeed ?? 7) + s * Math.PI * 2 / (this.strands - 1);
          const rad = w * 0.9 * Math.min(1, env * 3);
          _p.addScaledVector(_s, Math.cos(th) * rad).addScaledVector(_n, Math.sin(th) * rad);
        } else if (r.wave) {
          const ph = u * len * 1.4 - this.age * 9 + s * 2.1;
          _p.addScaledVector(_s, Math.sin(ph) * r.wave * env * this.s).addScaledVector(_n, Math.cos(ph * 0.7) * r.wave * 0.6 * env * this.s);
        }
        // camera-facing side vector
        _c.subVectors(cam, _p).normalize();
        _m.crossVectors(_t, _c).normalize().multiplyScalar(w * 0.5 * (r.taper ? 0.4 + 0.6 * Math.min(1, env * 4) : 1));
        P[v * 3] = _p.x - _m.x; P[v * 3 + 1] = _p.y - _m.y; P[v * 3 + 2] = _p.z - _m.z;
        U[v * 3] = -1; U[v * 3 + 1] = u * len; U[v * 3 + 2] = bright; v++;
        P[v * 3] = _p.x + _m.x; P[v * 3 + 1] = _p.y + _m.y; P[v * 3 + 2] = _p.z + _m.z;
        U[v * 3] = 1; U[v * 3 + 1] = u * len; U[v * 3 + 2] = bright; v++;
      }
    }
    const g = this.mesh.geometry;
    g.attributes.position.needsUpdate = true; g.attributes.aUv.needsUpdate = true;
  }
}

// Melee swing trail. The blade is the segment base→tip in the object's local space (default along local +Y from
// 0.25·width to width). Records the blade every frame for `duration`, shows the last `trail` seconds as a ribbon.
export class SwingTrail extends Inst {
  constructor(fx, obj, opts) {
    super(fx, { name: 'swing', anchor: false, fade: 0.01 }, opts);
    this.setFollow(obj);
    this.width = opts.width ?? 1.1;
    this.duration = opts.duration ?? 0.3;
    this.trail = opts.trail ?? 0.16;
    this.tipL = opts.tip ? opts.tip.clone() : new THREE.Vector3(0, this.width, 0);
    this.baseL = opts.base ? opts.base.clone() : this.tipL.clone().multiplyScalar(0.22);
    this.col = opts.color !== undefined ? tintOf(opts.color) : lin(0xffe2a8);
    this.samples = []; this.maxDist = Infinity;
  }
  start() {
    const MAXV = 64 * 3 * 2;
    this.posArr = new Float32Array(MAXV * 3); this.tArr = new Float32Array(MAXV * 2);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.posArr, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aT', new THREE.BufferAttribute(this.tArr, 2).setUsage(THREE.DynamicDrawUsage));
    const idx = []; for (let i = 0; i < MAXV / 2 - 1; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    g.setIndex(idx); g.setDrawRange(0, 0);
    this.mat = new THREE.ShaderMaterial({ vertexShader: TRAIL_VERT, fragmentShader: TRAIL_FRAG, uniforms: { uColor: { value: new THREE.Color(...this.col) }, uAlpha: { value: 1 } }, ...PREMUL });
    this.mesh = new THREE.Mesh(g, this.mat); this.mesh.frustumCulled = false; this.mesh.renderOrder = 23;
    this.mesh.userData.dispose = () => { g.dispose(); this.mat.dispose(); };
    this.addMesh(this.mesh);
    return super.start();
  }
  update(dt) {
    this.age += dt; this.dt = dt;
    const now = this.fx.time;
    if (this.age <= this.duration && this.obj) {
      const b = this.obj.localToWorld(this.baseL.clone()), t = this.obj.localToWorld(this.tipL.clone());
      this.samples.push({ b, t, time: now });
    }
    while (this.samples.length && now - this.samples[0].time > this.trail) this.samples.shift();
    if (this.samples.length > 60) this.samples.splice(0, this.samples.length - 60);
    if (this.age > this.duration && this.samples.length < 2) { this.end(); return false; }
    this.build(now);
    return true;
  }
  build(now) {
    const S = this.samples, n = S.length, P = this.posArr, T = this.tArr;
    if (n < 2) { this.mesh.geometry.setDrawRange(0, 0); return; }
    let v = 0;
    const sub = 3;
    const cr = (p0, p1, p2, p3, t, out) => {
      const t2 = t * t, t3 = t2 * t;
      return out.set(
        0.5 * (2 * p1.x + (-p0.x + p2.x) * t + (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 + (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3),
        0.5 * (2 * p1.y + (-p0.y + p2.y) * t + (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 + (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3),
        0.5 * (2 * p1.z + (-p0.z + p2.z) * t + (2 * p0.z - 5 * p1.z + 4 * p2.z - p3.z) * t2 + (-p0.z + 3 * p1.z - 3 * p2.z + p3.z) * t3));
    };
    for (let i = n - 1; i >= 1 && v < P.length / 3 - 2; i--) {
      const s0 = S[Math.min(n - 1, i + 1)], s1 = S[i], s2 = S[i - 1], s3 = S[Math.max(0, i - 2)];
      for (let k = 0; k < sub; k++) {
        const f = k / sub;
        const time = s1.time + (s2.time - s1.time) * f;
        const age = (now - time) / this.trail;
        cr(s0.b, s1.b, s2.b, s3.b, f, _a); cr(s0.t, s1.t, s2.t, s3.t, f, _b);
        P[v * 3] = _a.x; P[v * 3 + 1] = _a.y; P[v * 3 + 2] = _a.z; T[v * 2] = age; T[v * 2 + 1] = 0; v++;
        P[v * 3] = _b.x; P[v * 3 + 1] = _b.y; P[v * 3 + 2] = _b.z; T[v * 2] = age; T[v * 2 + 1] = 1; v++;
      }
    }
    const last = S[0];
    P[v * 3] = last.b.x; P[v * 3 + 1] = last.b.y; P[v * 3 + 2] = last.b.z; T[v * 2] = (now - last.time) / this.trail; T[v * 2 + 1] = 0; v++;
    P[v * 3] = last.t.x; P[v * 3 + 1] = last.t.y; P[v * 3 + 2] = last.t.z; T[v * 2] = (now - last.time) / this.trail; T[v * 2 + 1] = 1; v++;
    const g = this.mesh.geometry;
    g.setDrawRange(0, Math.max(0, (v / 2 - 1) * 6));
    g.attributes.position.needsUpdate = true; g.attributes.aT.needsUpdate = true;
    g.attributes.position.addUpdateRange(0, v * 3); g.attributes.aT.addUpdateRange(0, v * 2);
  }
}

// ------------------------------------------------------------------ beam recipes
const B = {
  motes: P({ sprite: S.dot, ramp: R.wInOut, life: 0.5, size: [0.06, 0.1], end: 0.5, i: [3, 5] }),
  hitGlow: P({ sprite: S.glow, ramp: R.wFlash, life: 0.12, size: [0.8, 1.2], i: 2.5, noGround: true }),
};
function flowAlong(h, rate, pr, speed, reverse, tint) {
  const fx = h.fx;
  h.emit('fl', rate, () => {
    const u = fx.rng.next();
    const A = reverse ? h.B : h.A, Bp = reverse ? h.A : h.B;
    _t.subVectors(Bp, A); const len = _t.length(); _t.multiplyScalar(1 / Math.max(len, 1e-3));
    _p.copy(A).addScaledVector(_t, len * u);
    const life = Math.max(0.05, Math.min(0.6, len * (1 - u) / speed));
    fx.spawn(pr, _p.x + fx.r(-0.1, 0.1), _p.y + fx.r(-0.1, 0.1), _p.z + fx.r(-0.1, 0.1), _t.x * speed, _t.y * speed, _t.z * speed, { life: life / ((pr.life[0] + pr.life[1]) * 0.5), tint, scale: h.s });
  });
}
function atEnd(h, rate, pr, tint, spd = 3) {
  const fx = h.fx;
  h.emit('he', rate, () => { fx.rdir(_c); fx.spawn(pr, h.B.x, h.B.y, h.B.z, _c.x * spd, _c.y * spd, _c.z * spd, { tint, scale: h.s }); });
}
export const BEAMS = {
  lightning: {
    kind: 'lightning', width: 0.42, strands: 3, dur: 0.45, color: [0.45, 0.62, 1.4], core: [1.2, 1.3, 1.6], strandWidth: 0.55, strandBright: 0.6, segments: 24,
    tick(h) {
      atEnd(h, 60, STORM.spark, null, 6);
      h.emit('g', 14, () => h.fx.spawn(B.hitGlow, h.B.x, h.B.y, h.B.z, 0, 0, 0, { tint: [0.5, 0.7, 1] }));
      h.emit('g2', 10, () => h.fx.spawn(B.hitGlow, h.A.x, h.A.y, h.A.z, 0, 0, 0, { tint: [0.5, 0.7, 1], size: 0.6 }));
    },
  },
  holyBeam: {
    kind: 'smooth', width: 0.7, strands: 3, dur: 1.0, helix: true, color: [1, 0.75, 0.3], core: [1.2, 1.1, 0.85], scroll: 7, taper: true,
    tick(h) { flowAlong(h, 40, B.motes, 10, false, [1, 0.85, 0.5]); atEnd(h, 20, HOLY.star, null, 2); },
  },
  healBeam: {
    kind: 'smooth', width: 0.6, strands: 3, dur: 1.0, helix: true, color: [0.45, 1, 0.35], core: [1, 1.2, 0.9], scroll: 7, taper: true,
    tick(h) { flowAlong(h, 40, B.motes, 10, false, [0.6, 1, 0.5]); atEnd(h, 16, NAT.leafy, null, 2); },
  },
  drainLife: { // shadow drain: motes flow from the target back to the caster
    kind: 'smooth', width: 0.55, strands: 2, dur: 1.5, wave: 0.22, color: [0.55, 0.15, 1], core: [0.9, 0.6, 1.2], scroll: -6, taper: true,
    tick(h) { flowAlong(h, 50, B.motes, 9, true, [0.7, 0.3, 1]); atEnd(h, 18, SHD.wisp, null, 1.5); },
  },
  arcaneBeam: {
    kind: 'smooth', width: 0.45, strands: 2, dur: 1.0, wave: 0.12, color: [0.85, 0.3, 1], core: [1.2, 0.9, 1.3], scroll: 10, taper: true,
    tick(h) { flowAlong(h, 45, ARC.star, 12, false, null); atEnd(h, 20, ARC.spark, null, 5); },
  },
  frostBeam: {
    kind: 'smooth', width: 0.55, strands: 2, dur: 1.0, wave: 0.1, color: [0.3, 0.7, 1.3], core: [1, 1.15, 1.3], scroll: 8, taper: true,
    tick(h) { flowAlong(h, 30, FROST.flake, 10, false, null); atEnd(h, 24, FROST.sparkle, null, 2); },
  },
  fireBeam: {
    kind: 'smooth', width: 0.7, strands: 2, dur: 1.0, wave: 0.18, color: [1, 0.35, 0.06], core: [1.3, 1.0, 0.6], scroll: 9, taper: true,
    tick(h) { flowAlong(h, 60, FIRE.lick, 12, false, null); atEnd(h, 30, FIRE.ember, null, 5); },
  },
};
// short aliases
Object.assign(BEAMS, { holy: BEAMS.holyBeam, shadow: BEAMS.drainLife, arcane: BEAMS.arcaneBeam, frost: BEAMS.frostBeam, fire: BEAMS.fireBeam });
