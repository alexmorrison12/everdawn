// Waterfall pouring from a crack in the Candlerock cliffs into the plunge pool: a curved ribbon with scrolling
// painted foam, a churning splash disc at the base, and anchor points for mist FX.
import * as THREE from 'three';
import { G, FOG_GLSL_PARS } from '../engine/materials.js';
import { PLACES } from './zone.js';

export function buildWaterfall(hf) {
  const W = PLACES.waterfall;
  const group = new THREE.Group(); group.name = 'waterfall';
  // find the cliff lip: march north from the pool until the ground rises
  const x = W.x;
  let zTop = W.z, yTop = hf.heightAt(x, zTop);
  for (let z = W.z + 10; z > W.z - 30; z -= 0.5) { const h = hf.heightAt(x, z); if (h > yTop) { yTop = h; zTop = z; } if (h > 26) { zTop = z; yTop = h; break; } }
  const zBase = W.z + 9, yBase = -0.2;
  const segs = 28, width = 7;
  const pos = [], uv = [], idx = [];
  for (let i = 0; i <= segs; i++) {
    const t = i / segs;
    // ballistic-ish arc out from the lip
    const z = zTop + 1.2 + (zBase - zTop - 1.2) * (1 - Math.pow(1 - t, 2)) * 0.55 + t * 2.5;
    const y = yTop + 0.6 - (yTop + 0.6 - yBase) * Math.pow(t, 1.35);
    const w = width * (1 + t * 0.45);
    pos.push(x - w / 2, y, z, x + w / 2, y, z);
    uv.push(0, t, 1, t);
  }
  for (let i = 0; i < segs; i++) { const a = i * 2; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); geo.setIndex(idx);
  const u = { uTime: G.uTime, uNoise: G.uNoiseTex, uFogColor: G.uFogColor, uFogSunColor: G.uFogSunColor, uFogDensity: G.uFogDensity, uFogHeight: G.uFogHeight, uFogBase: G.uFogBase, uSunDir: G.uSunDir, uCamPos: G.uCamPos, uDesat: G.uDesat };
  const mat = new THREE.ShaderMaterial({
    uniforms: u, transparent: true, depthWrite: false, side: THREE.DoubleSide,
    vertexShader: `varying vec2 vUv; varying vec3 vW; void main(){ vUv = uv; vec4 w = modelMatrix * vec4(position,1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: `uniform float uTime; uniform sampler2D uNoise; uniform float uDesat; varying vec2 vUv; varying vec3 vW;
      ${FOG_GLSL_PARS}
      void main(){
        float n1 = texture2D(uNoise, vec2(vUv.x * 2.0, vUv.y * 1.2 - uTime * 0.9)).r;
        float n2 = texture2D(uNoise, vec2(vUv.x * 5.0 + 0.3, vUv.y * 3.0 - uTime * 1.6)).g;
        float streak = smoothstep(0.35, 0.75, n1 * 0.6 + n2 * 0.6);
        vec3 deep = vec3(0.16, 0.42, 0.52), foam = vec3(0.92, 0.97, 1.0);
        vec3 col = mix(deep, foam, streak * 0.8 + vUv.y * 0.35);
        float edge = smoothstep(0.0, 0.12, vUv.x) * smoothstep(1.0, 0.88, vUv.x);
        float a = (0.55 + streak * 0.45) * edge;
        col = applyFog(col * 1.25, vW);
        col = mix(col, vec3(dot(col, vec3(0.3, 0.5, 0.2))), uDesat);
        gl_FragColor = vec4(col, a);
      }`,
  });
  const fall = new THREE.Mesh(geo, mat); fall.renderOrder = 6; group.add(fall);
  // splash disc
  const sg = new THREE.CircleGeometry(6.5, 32); sg.rotateX(-Math.PI / 2);
  const smat = new THREE.ShaderMaterial({
    uniforms: u, transparent: true, depthWrite: false,
    vertexShader: `varying vec2 vUv; varying vec3 vW; void main(){ vUv = uv; vec4 w = modelMatrix * vec4(position,1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: `uniform float uTime; uniform sampler2D uNoise; varying vec2 vUv; varying vec3 vW;
      ${FOG_GLSL_PARS}
      void main(){ vec2 c = vUv - 0.5; float r = length(c) * 2.0; float a = atan(c.y, c.x);
        float n = texture2D(uNoise, vec2(a * 0.6, r * 1.5 - uTime * 0.8)).r;
        float f = smoothstep(1.0, 0.2, r) * smoothstep(0.35, 0.7, n + (1.0 - r) * 0.3);
        vec3 col = applyFog(vec3(0.95, 0.98, 1.0) * 1.3, vW);
        gl_FragColor = vec4(col, f * 0.85); }`,
  });
  const splash = new THREE.Mesh(sg, smat); splash.position.set(x, 0.06, zBase - 0.5); splash.renderOrder = 7; group.add(splash);
  group.userData.mist = new THREE.Vector3(x, 1.5, zBase);
  group.userData.top = new THREE.Vector3(x, yTop, zTop);
  return group;
}
