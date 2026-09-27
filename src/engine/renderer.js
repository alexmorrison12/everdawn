// WebGL renderer + post chain: MSAA HDR scene → bloom → final pass (tone map, grade, vignette, screen FX).
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';

const FinalShader = {
  uniforms: {
    tDiffuse: { value: null },
    uExposure: { value: 1.0 },
    uSat: { value: 1.06 },
    uContrast: { value: 1.06 },
    uVignette: { value: 0.32 },
    uTint: { value: new THREE.Vector3(1, 1, 1) },
    uHurt: { value: 0 },       // red edge pulse
    uFlash: { value: 0 },      // white/gold flash
    uFlashCol: { value: new THREE.Vector3(1, 0.85, 0.4) },
    uDesat: { value: 0 },
    uTime: { value: 0 },
    uRes: { value: new THREE.Vector2(1, 1) },
  },
  vertexShader: /* glsl */`varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: /* glsl */`
    uniform sampler2D tDiffuse; uniform float uExposure, uSat, uContrast, uVignette, uHurt, uFlash, uDesat, uTime;
    uniform vec3 uTint, uFlashCol; uniform vec2 uRes;
    varying vec2 vUv;
    vec3 neutral(vec3 color) {
      const float S = 0.76; const float D = 0.15;
      float x = min(color.r, min(color.g, color.b));
      float off = x < 0.08 ? x - 6.25 * x * x : 0.04;
      color -= off;
      float peak = max(color.r, max(color.g, color.b));
      if (peak < S) return color;
      float d = 1.0 - S;
      float np = 1.0 - d * d / (peak + d - S);
      color *= np / peak;
      float g = 1.0 - 1.0 / (D * (peak - np) + 1.0);
      return mix(color, vec3(np), g);
    }
    vec3 toSRGB(vec3 c) { c = max(c, 0.0); return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c)); }
    float h12(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
    void main() {
      vec3 c = texture2D(tDiffuse, vUv).rgb * uExposure * uTint;
      c = neutral(c);
      c = toSRGB(c);
      float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
      c = mix(vec3(l), c, uSat);
      c = (c - 0.5) * uContrast + 0.5;
      // gentle split toning: warm highlights, cool shadows
      c += (vec3(0.02, 0.01, -0.015) * smoothstep(0.5, 1.0, l) + vec3(-0.01, 0.0, 0.02) * smoothstep(0.5, 0.0, l));
      vec2 q = vUv - 0.5; q.x *= uRes.x / uRes.y;
      float v = smoothstep(0.95, 0.25, length(q));
      c *= mix(1.0 - uVignette, 1.0, v);
      c = mix(c, vec3(dot(c, vec3(0.3, 0.5, 0.2))) * vec3(0.82, 0.95, 1.15), uDesat);
      c = mix(c, vec3(0.75, 0.05, 0.05), uHurt * (1.0 - v) * 0.8);
      c += uFlashCol * uFlash;
      c += (h12(vUv * uRes + uTime) - 0.5) / 255.0;
      gl_FragColor = vec4(clamp(c, 0.0, 1.0), 1.0);
    }`,
};

export class Renderer {
  constructor(container) {
    const r = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance', stencil: false, depth: true, preserveDrawingBuffer: true });
    r.shadowMap.enabled = true;
    r.shadowMap.type = THREE.PCFShadowMap;
    r.outputColorSpace = THREE.SRGBColorSpace;
    r.toneMapping = THREE.NoToneMapping;
    r.info.autoReset = false;
    container.appendChild(r.domElement);
    r.domElement.id = 'game-canvas';
    this.r = r;
    this.pixelRatio = Math.min(window.devicePixelRatio || 1, 1.5);
    this.scale = 1; // dynamic resolution scale
    const rt = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: 4 });
    this.composer = new EffectComposer(r, rt);
    this.renderPass = new RenderPass(null, null);
    this.composer.addPass(this.renderPass);
    this.bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.42, 0.55, 0.92);
    this.composer.addPass(this.bloom);
    this.final = new ShaderPass(FinalShader);
    this.composer.addPass(this.final);
    this.F = this.final.uniforms;
    this.resize();
    window.addEventListener('resize', () => this.resize());
  }
  resize() {
    const w = window.innerWidth, h = window.innerHeight;
    const pr = this.pixelRatio * this.scale;
    this.r.setPixelRatio(pr);
    this.r.setSize(w, h);
    this.composer.setPixelRatio(pr);
    this.composer.setSize(w, h);
    this.F.uRes.value.set(w * pr, h * pr);
    if (this.camera) { this.camera.aspect = w / h; this.camera.updateProjectionMatrix(); }
  }
  setScene(scene, camera) {
    this.scene = scene; this.camera = camera;
    this.renderPass.scene = scene; this.renderPass.camera = camera;
    this.resize();
  }
  // quality: 'low' | 'medium' | 'high' | 'ultra'
  setQuality(q, world) {
    this.quality = q;
    const Q = { low: { pr: 0.75, shadow: 0, bloom: false, grass: 0 }, medium: { pr: 1, shadow: 1024, bloom: true, grass: 36 }, high: { pr: 1.5, shadow: 2048, bloom: true, grass: 52 }, ultra: { pr: 2, shadow: 4096, bloom: true, grass: 64 } }[q] || {};
    this.pixelRatio = Math.min(window.devicePixelRatio || 1, Q.pr);
    this.bloom.enabled = Q.bloom;
    this.r.shadowMap.enabled = Q.shadow > 0;
    if (world?.sun) { world.sun.castShadow = Q.shadow > 0; if (Q.shadow) { world.sun.shadow.mapSize.set(Q.shadow, Q.shadow); world.sun.shadow.map?.dispose(); world.sun.shadow.map = null; } }
    if (world?.grass) { world.grass.mesh.visible = Q.grass > 0; }
    this.resize();
  }
  // dynamic resolution: nudge the render scale to hold ~55+ fps
  adapt(dt) {
    this._acc = (this._acc || 0) + dt; this._n = (this._n || 0) + 1;
    if (this._acc < 2) return;
    const fps = this._n / this._acc; this._acc = 0; this._n = 0;
    this.fps = fps;
    if (this.fixedScale) return;
    const old = this.scale;
    if (fps < 48 && this.scale > 0.6) this.scale = Math.max(0.6, this.scale - 0.1);
    else if (fps > 58 && this.scale < 1) this.scale = Math.min(1, this.scale + 0.05);
    if (old !== this.scale) this.resize();
  }
  render(dt, time) {
    this.adapt(dt);
    this.r.info.reset();
    this.F.uTime.value = time % 100;
    this.composer.render(dt);
  }
}
