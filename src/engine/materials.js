// Stylized lighting for every world material.
// Lambert base (keeps shadows, skinning, instancing, vertex colours) with:
//   wrapped diffuse + soft terminator, optional Blinn spec (metal), rim light, foliage translucency,
//   world-space height fog with sun in-scattering (replaces three's fog), per-material wind sway hooks.
import * as THREE from 'three';

// Shared uniforms (same objects referenced by every material → one update per frame)
export const G = {
  uTime: { value: 0 },
  uFogColor: { value: new THREE.Color(0xa9c4dc) },
  uFogSunColor: { value: new THREE.Color(0xffd9a0) },
  uFogDensity: { value: 0.0016 },
  uFogHeight: { value: 0.012 },   // height falloff
  uFogBase: { value: 0.0 },
  uSunDir: { value: new THREE.Vector3(0.5, 0.6, 0.3).normalize() },
  uWind: { value: new THREE.Vector2(1, 0.3) },
  uCamPos: { value: new THREE.Vector3() },
  uPlayerPos: { value: new THREE.Vector3(0, -999, 0) },
  uDesat: { value: 0 },           // ghost world
  uHeightTex: { value: null },    // terrain height field (R32F), for grass/decals
  uHeightInfo: { value: new THREE.Vector4(1024, 1024, -512, -512) }, // size.x, size.y, origin.x, origin.z
};

export const FOG_GLSL_PARS = /* glsl */`
uniform vec3 uFogColor; uniform vec3 uFogSunColor; uniform float uFogDensity; uniform float uFogHeight; uniform float uFogBase;
uniform vec3 uSunDir; uniform vec3 uCamPos;
vec3 applyFog(vec3 col, vec3 wpos) {
  vec3 d = wpos - uCamPos;
  float dist = length(d);
  vec3 dir = d / max(dist, 1e-4);
  // analytic exponential height fog integral along the ray
  float h0 = max(uCamPos.y - uFogBase, 0.0), dy = d.y;
  float k = uFogHeight;
  float lineInt = (abs(dy) > 0.01) ? (exp(-k * h0) - exp(-k * max(h0 + dy, 0.0))) / (k * dy) : exp(-k * h0);
  float amount = 1.0 - exp(-uFogDensity * dist * clamp(lineInt, 0.0, 4.0));
  float sun = pow(max(dot(dir, uSunDir), 0.0), 6.0);
  vec3 fc = mix(uFogColor, uFogSunColor, sun * 0.65);
  return mix(col, fc, clamp(amount, 0.0, 1.0));
}
`;

const LIGHT_PARS = /* glsl */`
varying vec3 vViewPosition;
uniform float uWrap; uniform float uSpec; uniform float uShine; uniform float uTrans; uniform vec3 uRimColor; uniform float uRim;
struct LambertMaterial { vec3 diffuseColor; float specularStrength; };
vec3 gSpecAcc = vec3(0.0);
void RE_Direct_Lambert( const in IncidentLight directLight, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in LambertMaterial material, inout ReflectedLight reflectedLight ) {
  float nl = dot( geometryNormal, directLight.direction );
  float w = saturate( ( nl + uWrap ) / ( 1.0 + uWrap ) );
  w = w * w * ( 3.0 - 2.0 * w ) * 0.35 + w * 0.65; // soften, keep energy
  vec3 irradiance = w * directLight.color;
  irradiance += uTrans * saturate( -nl ) * directLight.color * vec3( 0.9, 1.0, 0.6 );
  reflectedLight.directDiffuse += irradiance * BRDF_Lambert( material.diffuseColor );
  if ( uSpec > 0.0 ) {
    vec3 hv = normalize( directLight.direction + geometryViewDir );
    gSpecAcc += directLight.color * pow( saturate( dot( geometryNormal, hv ) ), uShine ) * uSpec * saturate( nl * 4.0 );
  }
}
void RE_IndirectDiffuse_Lambert( const in vec3 irradiance, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in LambertMaterial material, inout ReflectedLight reflectedLight ) {
  reflectedLight.indirectDiffuse += irradiance * BRDF_Lambert( material.diffuseColor );
}
#define RE_Direct RE_Direct_Lambert
#define RE_IndirectDiffuse RE_IndirectDiffuse_Lambert
`;

/**
 * Patch a MeshLambertMaterial with the stylized model.
 * opts: wrap, spec, shine, trans, rim, rimColor, fog(bool), vertex(fn(shader)), fragment(fn(shader)), uniforms{}, defines{}
 */
export function stylize(mat, opts = {}) {
  const u = {
    uWrap: { value: opts.wrap ?? 0.35 },
    uSpec: { value: opts.spec ?? 0 },
    uShine: { value: opts.shine ?? 24 },
    uTrans: { value: opts.trans ?? 0 },
    uRim: { value: opts.rim ?? 0.0 },
    uRimColor: { value: new THREE.Color(opts.rimColor ?? 0xfff0d8) },
    ...opts.uniforms,
  };
  mat.userData.u = u;
  const key = opts.key || JSON.stringify([opts.wrap, opts.spec > 0, opts.trans > 0, !!opts.vertex, !!opts.fragment, opts.fog !== false, opts.defines]);
  mat.customProgramCacheKey = () => 'sty:' + key + (opts.cacheKey || '');
  if (opts.defines) mat.defines = { ...(mat.defines || {}), ...opts.defines };
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, u, G);
    let vs = shader.vertexShader, fs = shader.fragmentShader;
    vs = vs.replace('#include <common>', '#include <common>\nvarying vec3 vWPos;\nuniform float uTime; uniform vec2 uWind;\n');
    vs = vs.replace('#include <worldpos_vertex>', `#include <worldpos_vertex>
      {
        vec4 wp4 = vec4( transformed, 1.0 );
        #ifdef USE_BATCHING
          wp4 = batchingMatrix * wp4;
        #endif
        #ifdef USE_INSTANCING
          wp4 = instanceMatrix * wp4;
        #endif
        vWPos = ( modelMatrix * wp4 ).xyz;
      }`);
    fs = fs.replace('#include <common>', '#include <common>\nvarying vec3 vWPos;\nuniform float uTime; uniform float uDesat;\n' + FOG_GLSL_PARS);
    fs = fs.replace('#include <lights_lambert_pars_fragment>', LIGHT_PARS);
    fs = fs.replace('vec3 outgoingLight = reflectedLight.directDiffuse + reflectedLight.indirectDiffuse + totalEmissiveRadiance;',
      `float rimF = pow( 1.0 - saturate( dot( geometryNormal, geometryViewDir ) ), 3.0 ) * uRim;
       vec3 outgoingLight = reflectedLight.directDiffuse + reflectedLight.indirectDiffuse + totalEmissiveRadiance + gSpecAcc + uRimColor * rimF * ( 0.35 + 0.65 * diffuseColor.rgb );`);
    if (opts.fog !== false) fs = fs.replace('#include <fog_fragment>', `gl_FragColor.rgb = applyFog( gl_FragColor.rgb, vWPos );
      gl_FragColor.rgb = mix( gl_FragColor.rgb, vec3( dot( gl_FragColor.rgb, vec3( 0.3, 0.5, 0.2 ) ) ) * vec3( 0.85, 0.95, 1.1 ), uDesat );`);
    if (opts.vertex) vs = opts.vertex(vs);
    if (opts.fragment) fs = opts.fragment(fs);
    shader.vertexShader = vs; shader.fragmentShader = fs;
    mat.userData.shader = shader;
  };
  return mat;
}

export function lambert(params = {}, opts = {}) {
  return stylize(new THREE.MeshLambertMaterial(params), opts);
}

// Linear colour helper for vertex colour buffers
const _c = new THREE.Color();
export function lin(hex) { _c.set(hex); return [_c.r, _c.g, _c.b]; } // THREE.Color.set converts sRGB hex → linear working space
