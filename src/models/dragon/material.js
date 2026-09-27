// Dragon shading on top of the stylized lambert (materials.js): rest-space 3D Voronoi scales with bump, pulsing
// emissive cracks/veins, glowing slit-pupil eyes, throat glow, crystal glow, fresnel rim, membrane veins +
// translucency + tattering. Geometry carries aDat = (kind, glowMask, scaleFreq, breath|billow).
import * as THREE from 'three';
import { lambert } from '../../engine/materials.js';

const NOISE = /* glsl */`
vec3 dgH3(vec3 p) {
  p = vec3(dot(p, vec3(127.1, 311.7, 74.7)), dot(p, vec3(269.5, 183.3, 246.1)), dot(p, vec3(113.5, 271.9, 124.6)));
  return fract(sin(p) * 43758.5453);
}
vec3 dgVoro(vec3 x) {
  vec3 p = floor(x), f = fract(x);
  float d1 = 8.0, d2 = 8.0, id = 0.0;
  for (int k = -1; k <= 1; k++) for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++) {
    vec3 b = vec3(float(i), float(j), float(k));
    vec3 h = dgH3(p + b);
    vec3 r = b - f + h * 0.8 + 0.1;
    float d = dot(r, r);
    if (d < d1) { d2 = d1; d1 = d; id = h.x; } else if (d < d2) d2 = d;
  }
  return vec3(sqrt(d1), sqrt(d2), id);
}
float dgN2(vec2 p) {
  vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  float a = fract(sin(dot(i, vec2(127.1, 311.7))) * 43758.5453), b = fract(sin(dot(i + vec2(1, 0), vec2(127.1, 311.7))) * 43758.5453);
  float c = fract(sin(dot(i + vec2(0, 1), vec2(127.1, 311.7))) * 43758.5453), d = fract(sin(dot(i + vec2(1, 1), vec2(127.1, 311.7))) * 43758.5453);
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}
`;

function vertexHook(wing) {
  return (vs) => vs
    .replace('#include <common>', `#include <common>
      attribute vec4 aDat;
      varying vec4 vDat; varying vec3 vRest; varying vec2 vUv2; flat varying float vKind;
      uniform float uBreath; uniform float uEyeOpen; uniform vec3 uEyeL; uniform vec3 uEyeR; uniform vec2 uBillow;`)
    .replace('#include <begin_vertex>', `#include <begin_vertex>
      vDat = aDat; vRest = position; vUv2 = uv; vKind = aDat.x;
      ${wing
        ? 'transformed += normal * aDat.w * ( position.x < 0.0 ? uBillow.x : uBillow.y );'
        : `transformed += normal * aDat.w * uBreath;
      if ( abs( aDat.x - 3.0 ) < 0.5 ) {
        vec3 ec = position.x < 0.0 ? uEyeL : uEyeR;
        float o = max( uEyeOpen, 0.02 );
        transformed.y = ec.y + ( transformed.y - ec.y ) * o;
        transformed = mix( ec + ( transformed - ec ) * 0.8, transformed, o );
      }`}`);
}

const SURFACE = /* glsl */`
{
  float kind = floor(vKind + 0.5);
  float isSkin = 1.0 - step(0.5, kind);
  float isHard = step(0.5, kind) * (1.0 - step(1.5, kind));
  float isPlate = step(1.5, kind) * (1.0 - step(2.5, kind));
  float isEye = step(2.5, kind) * (1.0 - step(3.5, kind));
  float isMouth = step(3.5, kind) * (1.0 - step(4.5, kind));
  float isCrystal = step(4.5, kind) * (1.0 - step(5.5, kind));
  float isMem = step(5.5, kind) * (1.0 - step(6.5, kind));
  float isFrill = step(6.5, kind);
  vec3 rp = vRest / uS;
  float pulse = 0.6 + 0.4 * sin(uTime * 2.3 - rp.z * 0.55 + rp.y * 0.35);
  float pulse2 = 0.5 + 0.5 * sin(uTime * 1.3 + rp.x * 0.8 - rp.z * 0.3);
  vec3 gc = uGlowColor * uGlow;
  // ---- scales
  vec3 sp = rp * vDat.z * vec3(1.0, 1.0, 0.72);
  vec3 vr = dgVoro(sp);
  float edge = vr.y - vr.x;
  float fw = length(fwidth(sp));
  float fade = 1.0 - smoothstep(0.35, 0.9, fw);
  float cellM = smoothstep(0.02, 0.14, edge);
  float dome = 1.0 - smoothstep(0.05, 0.8, vr.x);
  float sc = isSkin * uScaleAmt * step(0.001, vDat.z) * fade;
  float tint = 0.9 + 0.2 * vr.z;
  diffuseColor.rgb *= mix(1.0, (0.82 + 0.18 * cellM) * (0.92 + 0.16 * dome) * tint, sc);
  gScaleH = sc * (cellM * 0.6 + dome * 0.4);
  float crackPatch = smoothstep(0.35, 0.75, dgN2(rp.xz * 0.35 + rp.y * 0.21) * 0.6 + dgN2(rp.zy * 0.9 + 4.0) * 0.4);
  float crack = (1.0 - smoothstep(0.0, 0.06, edge)) * smoothstep(0.15, 0.5, vDat.y) * isSkin * mix(0.6, 1.0, fade) * mix(0.25, 1.0, crackPatch);
  gEmis += gc * crack * pulse * 2.4;
  // ---- hard parts / plates
  gEmis += gc * vDat.y * (isHard + isPlate * 0.8) * pulse * 1.7;
  float grooves = isPlate * (1.0 - 0.28 * smoothstep(0.42, 0.5, abs(fract(vUv2.y * 2.0 + 0.25) - 0.5)));
  diffuseColor.rgb *= mix(1.0, grooves, isPlate);
  // ---- crystals: inner glow + facet sparkle
  gEmis += gc * isCrystal * (0.25 + vDat.y * 1.1) * (0.7 + 0.3 * pulse);
  // ---- mouth / throat
  gEmis += gc * isMouth * vDat.y * vDat.y * uThroat * 6.0;
  diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * (1.0 + uThroat * vDat.y * 2.0), isMouth);
  // ---- eyes: glowing iris + slit pupil
  vec2 e = vUv2 - 0.5;
  float slit = smoothstep(0.035, 0.075, abs(e.x) * (1.0 + e.y * e.y * 7.0));
  float iris = 1.0 - smoothstep(0.18, 0.46, length(e));
  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.015), isEye);
  gEmis += isEye * uEyeColor * uEyeGlow * (0.25 + 2.6 * iris * iris) * mix(0.02, 1.0, slit) * 3.0;
  // ---- frills: translucent spotted webs
  float spots = smoothstep(0.62, 0.72, dgN2(vUv2 * vec2(14.0, 6.0)));
  diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * 1.6, isFrill * spots);
  gEmis += gc * isFrill * (vDat.y * 0.8 + spots * 0.9) * pulse2;
  gSpecMask = 0.035 * isSkin + 0.16 * isHard + 0.3 * isPlate + 1.5 * isCrystal + 0.9 * isEye + 0.35 * isMouth + 0.2 * isMem;
  gTransMask = isMem + isFrill * 0.8;
  #ifdef DRAGON_WING
  if (isMem > 0.5) {
    // membrane: veins radiating from the bones, darker edge band, lighter underside
    float u = vUv2.x, v = vUv2.y;
    float vein = 0.0;
    // main veins: gently bowed, running from the bones towards the trailing edge, thinning out
    for (int i = 1; i <= 3; i++) {
      float fi = float(i);
      float c = fi / 4.0 + 0.05 * sin(v * 3.14159) * (fi - 2.0) + 0.012 * sin(v * 17.0 + fi * 4.0);
      float w = 0.0035 + 0.009 * (1.0 - v);
      vein = max(vein, 1.0 - smoothstep(w * 0.5, w, abs(u - c)));
    }
    // capillary branches: faint cellular network
    vec3 cv = dgVoro(vec3(u * 7.0, v * 5.0, 0.5));
    float cap = (1.0 - smoothstep(0.0, 0.05, cv.y - cv.x)) * 0.45 * smoothstep(0.15, 0.6, v);
    vein = max(vein, cap) * smoothstep(0.02, 0.12, v);
    diffuseColor.rgb *= 1.0 - vein * 0.45;
    if (!gl_FrontFacing) diffuseColor.rgb = mix(diffuseColor.rgb, uUnderColor, 0.55);
    gEmis += gc * vein * vDat.y * pulse * 1.4;
    if (uTatter > 0.0) {
      float n = dgN2(vUv2 * vec2(7.0, 11.0) + 3.1) * 0.65 + dgN2(vUv2 * vec2(19.0, 23.0)) * 0.35;
      float edgeP = smoothstep(0.55, 1.0, v);
      if (n * edgeP * uTatter > 0.36) discard;
    }
  }
  #endif
  gEmis += uFlashColor * uFlash;
}
`;

const BUMP = /* glsl */`
{
  vec3 dpx = dFdx(-vViewPosition), dpy = dFdy(-vViewPosition);
  float hx = dFdx(gScaleH), hy = dFdy(gScaleH);
  vec3 r1 = cross(dpy, normal), r2 = cross(normal, dpx);
  float det = dot(dpx, r1);
  vec3 grd = sign(det) * (hx * r1 + hy * r2);
  normal = normalize(abs(det) * normal - grd * uBump);
}
`;

function fragmentHook(wing) {
  return (fs) => {
    fs = fs.replace('#include <common>', `#include <common>
      varying vec4 vDat; varying vec3 vRest; varying vec2 vUv2; flat varying float vKind;
      uniform vec3 uGlowColor; uniform vec3 uEyeColor; uniform vec3 uUnderColor; uniform float uGlow; uniform float uThroat; uniform float uEyeGlow;
      uniform float uFlash; uniform vec3 uFlashColor; uniform float uScaleAmt; uniform float uTatter; uniform float uS; uniform float uBump;
      float gSpecMask = 1.0; float gTransMask = 1.0; float gScaleH = 0.0; vec3 gEmis = vec3(0.0);
      ${NOISE}`)
      .replace('#include <color_fragment>', `#include <color_fragment>
      ${SURFACE}`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
      ${BUMP}`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
      totalEmissiveRadiance += gEmis;`)
      .replace('* uSpec * saturate( nl * 4.0 )', '* uSpec * gSpecMask * saturate( nl * 4.0 )')
      .replace('float rimF = pow( 1.0 - saturate( dot( geometryNormal, geometryViewDir ) ), 3.0 ) * uRim;', 'float rimF = pow( 1.0 - saturate( dot( nonPerturbedNormal, geometryViewDir ) ), 3.0 ) * uRim;')
      .replace('irradiance += uTrans * saturate( -nl ) * directLight.color * vec3( 0.9, 1.0, 0.6 );', 'irradiance += uTrans * gTransMask * saturate( -nl ) * directLight.color * vec3( 1.0, 0.7, 0.55 );');
    return fs;
  };
}

/** Per-instance materials (program is shared through the cache key; uniforms are per dragon). */
export function createDragonMaterials(pal, { S = 1, eyes = [], tatter = 0 } = {}) {
  const hex = pal.hex;
  const glow = new THREE.Color(hex.glow);
  const U = {
    uGlowColor: { value: glow.clone() },
    uEyeColor: { value: new THREE.Color(hex.eye) },
    uUnderColor: { value: new THREE.Color(hex.membraneUnder) },
    uGlow: { value: hex.glowK ?? 1 },
    uThroat: { value: 0 },
    uEyeGlow: { value: 1 },
    uEyeOpen: { value: 1 },
    uEyeL: { value: new THREE.Vector3(...(eyes[1] || [0, 0, 0])) },
    uEyeR: { value: new THREE.Vector3(...(eyes[0] || [0, 0, 0])) },
    uBreath: { value: 0 },
    uBillow: { value: new THREE.Vector2(0, 0) },
    uFlash: { value: 0 },
    uFlashColor: { value: new THREE.Color(1, 1, 1) },
    uScaleAmt: { value: 1 },
    uTatter: { value: tatter },
    uS: { value: S },
    uBump: { value: 0.014 * S },
  };
  const rimCol = glow.clone().lerp(new THREE.Color(0xffffff), 0.45);
  const body = lambert({ vertexColors: true }, {
    wrap: 0.42, rim: 0.3, rimColor: rimCol.getHex(), spec: 0.5, shine: 22, uniforms: U,
    vertex: vertexHook(false), fragment: fragmentHook(false), key: 'dragon-body',
  });
  const wing = lambert({ vertexColors: true, side: THREE.DoubleSide }, {
    wrap: 0.5, rim: 0.28, rimColor: rimCol.getHex(), spec: 0.4, shine: 26, trans: 0.55, uniforms: U,
    vertex: vertexHook(true), fragment: fragmentHook(true), defines: { DRAGON_WING: 1 }, key: 'dragon-wing',
  });
  return { body, wing, U, rimCol };
}
