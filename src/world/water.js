// Stylized lake water: depth-tinted, animated painted ripples, shoreline foam, sky fresnel + sun glints.
import * as THREE from 'three';
import { G, FOG_GLSL_PARS } from '../engine/materials.js';
import { PLACES, WATER_Y } from './zone.js';

const vert = /* glsl */`
uniform float uTime;
varying vec3 vW;
void main() {
  vec3 p = position;
  vec4 w = modelMatrix * vec4(p, 1.0);
  w.y += sin(w.x * 0.35 + uTime * 1.3) * 0.03 + sin(w.z * 0.27 - uTime * 1.1) * 0.03;
  vW = w.xyz;
  gl_Position = projectionMatrix * viewMatrix * w;
}`;

const frag = /* glsl */`
uniform float uTime; uniform sampler2D uHeightTex; uniform vec4 uHeightInfo; uniform sampler2D uNoiseTex;
uniform vec3 uShallow; uniform vec3 uDeep; uniform vec3 uSky; uniform vec3 uSkyTop; uniform vec3 uSunCol; uniform float uDesat;
varying vec3 vW;
${FOG_GLSL_PARS}
float terrainH(vec2 xz) { return texture2D(uHeightTex, (xz - uHeightInfo.zw + 0.5) / uHeightInfo.xy).r; }
void main() {
  float depth = max(vW.y - terrainH(vW.xz), 0.0);
  vec2 uv = vW.xz;
  vec4 n1 = texture2D(uNoiseTex, uv / 23.0 + vec2(uTime * 0.012, uTime * 0.007));
  vec4 n2 = texture2D(uNoiseTex, uv / 9.0 - vec2(uTime * 0.018, -uTime * 0.011));
  vec3 nrm = normalize(vec3((n1.g - 0.5) * 0.9 + (n2.b - 0.5) * 0.6, 1.0, (n1.b - 0.5) * 0.9 + (n2.g - 0.5) * 0.6));
  vec3 v = normalize(uCamPos - vW);
  float fres = pow(1.0 - max(dot(nrm, v), 0.0), 4.0) * 0.8 + 0.08;
  vec3 base = mix(uShallow, uDeep, smoothstep(0.2, 3.5, depth));
  // painted ripple bands
  float band = smoothstep(0.62, 0.7, n2.r * 0.6 + n1.r * 0.5);
  base += vec3(0.08, 0.12, 0.12) * band * smoothstep(0.3, 2.0, depth);
  vec3 refl = mix(uSky, uSkyTop, clamp(nrm.x * 2.0 + 0.4, 0.0, 1.0));
  vec3 col = mix(base, refl, fres);
  vec3 h = normalize(uSunDir + v);
  float spec = pow(max(dot(nrm, h), 0.0), 220.0) * 3.5 + pow(max(dot(nrm, h), 0.0), 40.0) * 0.18;
  col += uSunCol * spec;
  // shoreline foam: animated rings
  float foamLine = sin(depth * 9.0 - uTime * 2.2 + n1.r * 6.0) * 0.5 + 0.5;
  float foam = smoothstep(0.55, 0.0, depth) * 0.9 + smoothstep(1.0, 0.25, depth) * smoothstep(0.75, 0.95, foamLine) * 0.6;
  foam *= smoothstep(0.35, 0.55, n2.g + 0.2);
  col = mix(col, vec3(0.95, 0.98, 1.0), clamp(foam, 0.0, 1.0));
  float alpha = clamp(smoothstep(0.0, 1.4, depth) * 0.7 + 0.3 + fres * 0.4 + foam, 0.0, 1.0);
  col = applyFog(col, vW);
  col = mix(col, vec3(dot(col, vec3(0.3, 0.5, 0.2))) * vec3(0.85, 0.95, 1.1), uDesat);
  gl_FragColor = vec4(col, alpha);
}`;

export class Water {
  constructor(sky) {
    const L = PLACES.lake;
    this.u = {
      uTime: G.uTime, uHeightTex: G.uHeightTex, uHeightInfo: G.uHeightInfo, uNoiseTex: G.uNoiseTex,
      uShallow: { value: new THREE.Color(0x3aa8a0) }, uDeep: { value: new THREE.Color(0x14506a) },
      uSky: sky.u.uHorizon, uSkyTop: sky.u.uZenith, uSunCol: sky.u.uSunCol, uDesat: G.uDesat,
      uFogColor: G.uFogColor, uFogSunColor: G.uFogSunColor, uFogDensity: G.uFogDensity, uFogHeight: G.uFogHeight, uFogBase: G.uFogBase, uSunDir: G.uSunDir, uCamPos: G.uCamPos,
    };
    const mat = new THREE.ShaderMaterial({ vertexShader: vert, fragmentShader: frag, uniforms: this.u, transparent: true, depthWrite: false });
    const geo = new THREE.PlaneGeometry(L.rx * 2.6, L.rz * 2.9, 90, 70);
    geo.rotateX(-Math.PI / 2);
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.position.set(L.x, WATER_Y, L.z - 12);
    this.mesh.renderOrder = 5;
  }
}
