// Humanoid material: stylized lambert (src/engine/materials.js) + per-vertex spec/emissive, triplanar tiling
// detail texture (mail / leather / cloth / streaks), painted face compositing and hit/ghost tint.
import * as THREE from 'three';
import { lambert } from '../../engine/materials.js';
import { Simplex, RNG, clamp, smoothstep } from '../../core/noise.js';
import { tileNoise } from '../../engine/paint.js';

let DETAIL = null;
export function detailTexture() {
  if (DETAIL) return DETAIL;
  const S = 256, nz = new Simplex(77), rng = new RNG(78);
  const data = new Uint8Array(S * S * 4);
  // pre-computed scratch/pit field for leather
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const u = x / S, v = y / S, k = (y * S + x) * 4;
    // R: mail rings (brick-offset rows)
    const cells = 10;
    const ry = v * cells, row = Math.floor(ry);
    const rx = u * cells + (row % 2) * 0.5;
    const fx = rx - Math.floor(rx) - 0.5, fy = ry - row - 0.5;
    const d = Math.hypot(fx, fy * 1.1);
    const ring = Math.exp(-((d - 0.33) ** 2) / 0.006);
    const hole = smoothstep(0.24, 0.12, d);
    const shade = 0.5 + ring * 0.42 - hole * 0.35 - fy * 0.25 * (d < 0.45 ? 1 : 0);
    // G: leather grain
    const n1 = tileNoise(nz, u, v, 24, 3), n2 = tileNoise(nz, u + 0.31, v + 0.17, 7, 2);
    const leather = 0.5 + n1 * 0.22 + n2 * 0.18;
    // B: cloth weave
    const tx = Math.sin(u * Math.PI * 2 * 36), ty = Math.sin(v * Math.PI * 2 * 36);
    const chk = Math.sin(u * Math.PI * 2 * 18) * Math.sin(v * Math.PI * 2 * 18) > 0 ? 1 : -1;
    const weave = 0.5 + (chk > 0 ? tx : ty) * 0.18 + tileNoise(nz, u, v, 5, 2) * 0.16;
    // A: streaks (brushed metal / hair strands) along v
    const st = tileNoise(nz, u, v * 0.08 + 0.5, 48, 2) * 0.6 + tileNoise(nz, u + 0.5, v * 0.3, 16, 2) * 0.4;
    const streak = 0.5 + st * 0.55;
    data[k] = clamp(shade * 255, 0, 255); data[k + 1] = clamp(leather * 255, 0, 255);
    data[k + 2] = clamp(weave * 255, 0, 255); data[k + 3] = clamp(streak * 255, 0, 255);
  }
  // leather scratches
  for (let i = 0; i < 70; i++) {
    let x = rng.range(0, S), y = rng.range(0, S); const a = rng.range(0, 6.28), l = rng.range(6, 22);
    for (let t = 0; t < l; t++) { const k = ((Math.floor(y + Math.sin(a) * t) & (S - 1)) * S + (Math.floor(x + Math.cos(a) * t) & (S - 1))) * 4 + 1; data[k] = Math.max(0, data[k] - 40); }
  }
  const tex = new THREE.DataTexture(data, S, S, THREE.RGBAFormat);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.magFilter = THREE.LinearFilter; tex.minFilter = THREE.LinearMipmapLinearFilter; tex.generateMipmaps = true;
  tex.colorSpace = THREE.NoColorSpace; tex.anisotropy = 4;
  tex.needsUpdate = true;
  DETAIL = tex;
  return tex;
}

let BLANK = null;
function blankFace() {
  if (BLANK) return BLANK;
  BLANK = new THREE.DataTexture(new Uint8Array(4), 1, 1, THREE.RGBAFormat); BLANK.needsUpdate = true; return BLANK;
}

const VERT_PARS = /* glsl */`
attribute vec4 aDet; attribute vec4 aMat; attribute vec2 aFace;
varying vec4 vDet; varying vec4 vMat; varying vec2 vFace; varying vec3 vOP; varying vec3 vON;
`;
const FRAG_PARS = /* glsl */`
uniform sampler2D uDetail; uniform sampler2D uFace; uniform vec2 uFaceTile; uniform vec3 uEye; uniform float uEyeGlow;
uniform vec3 uBrow; uniform vec3 uInk; uniform vec4 uTint; uniform float uGlow; uniform vec4 uCast; uniform vec3 uSclera;
varying vec4 vDet; varying vec4 vMat; varying vec2 vFace; varying vec3 vOP; varying vec3 vON;
`;

/** Per-character uniforms (shared by the skinned body material and the rigid weapon material). */
export function makeUniforms() {
  return {
    uDetail: { value: detailTexture() },
    uFace: { value: blankFace() },
    uFaceTile: { value: new THREE.Vector2(0, 0) },
    uEye: { value: new THREE.Color(0x3a6ab0) },
    uEyeGlow: { value: 0 },
    uBrow: { value: new THREE.Color(0x3a2a1a) },
    uInk: { value: new THREE.Color(0x2a1810) },
    uSclera: { value: new THREE.Color(0xe8e2d8) },
    uTint: { value: new THREE.Vector4(1, 1, 1, 0) },
    uGlow: { value: 1.5 },
    uCast: { value: new THREE.Vector4(0.5, 0.7, 1, 0) },
  };
}

export function makeHumanoidMaterial(U, opts = {}) {
  const mat = lambert({ vertexColors: true }, {
    wrap: 0.5, spec: 1, shine: opts.shine ?? 22, rim: 0.2, rimColor: 0xfff2dc,
    key: 'humanoid' + (opts.key || ''),
    uniforms: U,
    vertex: vs => vs
      .replace('#include <common>', '#include <common>\n' + VERT_PARS)
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvDet = aDet; vMat = aMat; vFace = aFace; vOP = position; vON = normal;'),
    fragment: fs => fs
      .replace('#include <common>', '#include <common>\n' + FRAG_PARS)
      .replace('#include <color_fragment>', `#include <color_fragment>
        float eyeEmit = 0.0;
        {
          vec3 bw = abs(vON); bw = bw * bw; bw = bw * bw; bw /= (bw.x + bw.y + bw.z + 1e-5);
          vec3 op = vOP * 9.0;
          vec4 t = texture2D(uDetail, op.zy) * bw.x + texture2D(uDetail, op.xz) * bw.y + texture2D(uDetail, op.xy) * bw.z;
          float det = dot(t - 0.5, vDet);
          diffuseColor.rgb *= clamp(1.0 + det * 1.5, 0.35, 1.7);
          if (vFace.x > 0.0 && vFace.y > 0.0 && vFace.x < 1.0 && vFace.y < 1.0) {
            vec4 f = texture2D(uFace, vFace * 0.5 + uFaceTile);
            vec3 c = diffuseColor.rgb;
            c = mix(c, uBrow, f.a);
            c = mix(c, uSclera, f.g * (1.0 - f.b));
            c = mix(c, uEye, f.b * (1.0 - f.g));
            c = mix(c, vec3(1.0), f.g * f.b);
            c = mix(c, uInk, f.r);
            diffuseColor.rgb = c;
            eyeEmit = f.b * (1.0 - f.g) * (1.0 - f.r);
          }
        }`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        totalEmissiveRadiance += uEye * eyeEmit * uEyeGlow;
        totalEmissiveRadiance += diffuseColor.rgb * vMat.y * uGlow * (0.85 + 0.15 * sin(uTime * 3.0 + vOP.y * 14.0));
        totalEmissiveRadiance += uCast.rgb * uCast.a * vMat.z;`)
      .replace('+ gSpecAcc +', '+ gSpecAcc * vMat.x * (0.12 + diffuseColor.rgb * 0.55) +')
      .replace('#include <opaque_fragment>', `outgoingLight = mix(outgoingLight, uTint.rgb, uTint.a);
        #include <opaque_fragment>`),
  });
  return mat;
}
