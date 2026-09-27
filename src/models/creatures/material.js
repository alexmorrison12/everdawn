// Creature material: stylized lambert (shared program) + rest-space triplanar "painted" detail
// (fur strokes / scales / mottle / weave), per-vertex emissive, hackle raise, candle-flame flicker, hit tint.
import * as THREE from 'three';
import { lambert } from '../../engine/materials.js';
import { Canvas, tileNoise, voronoi } from '../../engine/paint.js';
import { RNG, Simplex, smoothstep, clamp } from '../../core/noise.js';

let DETAIL = null;
const hh = (a, b, s) => { let h = Math.imul(a, 374761393) + Math.imul(b, 668265263) + s * 97; h = Math.imul(h ^ (h >>> 13), 1274126177); h ^= h >>> 16; return (h >>> 0) / 4294967296; };
const cellRand = seed => (x, y) => [hh(x, y, seed), hh(x, y, seed + 1), hh(x, y, seed + 2), hh(x, y, seed + 3)];

/** 256² tiling detail atlas. R: fur strokes (along u) · G: scales/bumps · B: painterly mottle · A: weave / wood grain */
export function detailTexture() {
  if (DETAIL) return DETAIL;
  const S = 256, rng = new RNG(77), nz = new Simplex(78);
  // --- fur strokes
  const fur = new Canvas(S).fill([0.5, 0.5, 0.5]);
  for (let i = 0; i < 2600; i++) {
    const light = rng.next() < 0.5;
    const v = light ? rng.range(0.66, 0.9) : rng.range(0.12, 0.34);
    fur.stroke(rng.range(0, S), rng.range(0, S), rng.range(-0.22, 0.22), rng.range(7, 17), rng.range(1.1, 1.8), 0.35, [v, v, v], rng.range(0.3, 0.62), rng.range(-0.25, 0.25));
  }
  // --- weave / grain
  const out = new Uint8Array(S * S * 4);
  const cr = cellRand(5);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const k = y * S + x;
    // fur with soft clumping
    const clump = tileNoise(nz, x / S, y / S, 6, 2);
    const f = clamp(0.5 + (fur.px[k * 3] - 0.5) * 1.15 + clump * 0.12, 0, 1);
    // scales: voronoi bumps with dark seams + top highlight
    const v = voronoi(x, y, S, 12, cr);
    const edge = smoothstep(0.0, 5.0, v.d2 - v.d1);
    const dome = 1 - clamp(v.d1 / (v.cs * 0.75), 0, 1);
    const hl = clamp((v.cy - y) / v.cs * 0.8 + 0.3, 0, 1) * dome;
    const sc = clamp(0.3 + 0.28 * edge + 0.22 * dome + 0.18 * hl, 0, 1);
    // mottle: blotches + grain
    const m = tileNoise(nz, x / S + 0.37, y / S + 0.11, 4, 3);
    const grain = hh(x, y, 9) - 0.5;
    const mo = clamp(0.5 + m * 0.34 + grain * 0.1, 0, 1);
    // weave: cloth cross-hatch + wood streaks
    const wx = Math.sin(x / S * Math.PI * 2 * 48), wy = Math.sin(y / S * Math.PI * 2 * 48);
    const streak = hh(0, (y + Math.floor(tileNoise(nz, x / S, y / S + 0.5, 3, 1) * 6) + S) % S, 3) - 0.5;
    const we = clamp(0.5 + (wx * 0.5 + 0.5) * (wy * 0.5 + 0.5) * 0.3 - 0.12 + streak * 0.25 + grain * 0.08, 0, 1);
    out[k * 4] = f * 255; out[k * 4 + 1] = sc * 255; out[k * 4 + 2] = mo * 255; out[k * 4 + 3] = we * 255;
  }
  const t = new THREE.DataTexture(out, S, S, THREE.RGBAFormat);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.generateMipmaps = true; t.minFilter = THREE.LinearMipmapLinearFilter; t.magFilter = THREE.LinearFilter;
  t.anisotropy = 4;
  t.needsUpdate = true;
  DETAIL = t;
  return t;
}

const VERT_PARS = /* glsl */`
attribute vec4 dtl; attribute vec2 aux;
varying vec4 vDtl; varying float vEmis; varying float vFlame; varying vec3 vRP; varying vec3 vRN;
uniform float uHackle; uniform float uFlame;
`;
const VERT_BODY = /* glsl */`
vRP = position; vRN = normal; vDtl = dtl; vEmis = aux.x; vFlame = 0.0;
if ( aux.y > 0.0 ) {
  transformed.y += aux.y * uHackle * 0.05; // rest-space lift: tufts/bristles stand up
} else if ( aux.y < 0.0 ) {
  float f = -aux.y; vFlame = 1.0;
  float t = uTime;
  transformed.x += ( sin( t * 9.0 + position.y * 40.0 ) * 0.6 + sin( t * 17.3 ) * 0.4 ) * 0.012 * f;
  transformed.z += cos( t * 11.0 + position.y * 35.0 ) * 0.009 * f;
  transformed.y += ( sin( t * 13.0 ) * 0.5 + 0.5 ) * 0.015 * f;
}
`;
const FRAG_PARS = /* glsl */`
varying vec4 vDtl; varying float vEmis; varying float vFlame; varying vec3 vRP; varying vec3 vRN;
uniform sampler2D uDetail; uniform float uDFreq; uniform float uFurAxis; uniform vec3 uTint; uniform float uTintAmt; uniform float uFlame; uniform float uEmisK; uniform vec3 uColorMul;
`;
const FRAG_DETAIL = /* glsl */`
#include <color_fragment>
{
  if ( vFlame > 0.5 && uFlame < 0.02 ) discard;
  vec3 an = abs( normalize( vRN ) ); vec3 bw = an * an; bw *= bw; bw /= ( bw.x + bw.y + bw.z );
  vec3 P = vRP * uDFreq;
  vec4 tX = texture2D( uDetail, mix( P.zy, P.yz, uFurAxis ) );
  vec4 tY = texture2D( uDetail, P.zx );
  vec4 tZ = texture2D( uDetail, P.yx );
  vec4 tt = tX * bw.x + tY * bw.y + tZ * bw.z;
  diffuseColor.rgb *= max( 0.0, 1.0 + dot( tt - 0.5, vDtl ) * 2.0 ) * uColorMul;
}
`;
const FRAG_EMIS = /* glsl */`
#include <emissivemap_fragment>
{
  float fl = vFlame > 0.5 ? uFlame * ( 0.85 + 0.15 * sin( uTime * 23.0 ) * sin( uTime * 7.3 + 1.0 ) ) : 1.0;
  totalEmissiveRadiance += vColor.rgb * vEmis * uEmisK * fl;
}
`;

/** One material per creature instance (all share one GL program). cfg: dfreq, furAxis (0 quadruped, 1 upright) */
export function creatureMaterial(cfg = {}) {
  const u = {
    uTint: { value: new THREE.Color(1, 1, 1) }, uTintAmt: { value: 0 },
    uHackle: { value: 0 }, uFlame: { value: 1 }, uEmisK: { value: 1 }, uColorMul: { value: new THREE.Color(1, 1, 1) },
    uDetail: { value: detailTexture() }, uDFreq: { value: cfg.dfreq ?? 3.0 }, uFurAxis: { value: cfg.furAxis ?? 0 },
  };
  const m = lambert({ vertexColors: true }, {
    key: 'creature', wrap: cfg.wrap ?? 0.5, rim: cfg.rim ?? 0.28, rimColor: 0xfff2dc, uniforms: u,
    vertex: vs => vs.replace('#include <common>', '#include <common>\n' + VERT_PARS).replace('#include <begin_vertex>', '#include <begin_vertex>\n' + VERT_BODY),
    fragment: fs => fs.replace('#include <common>', '#include <common>\n' + FRAG_PARS)
      .replace('#include <color_fragment>', FRAG_DETAIL)
      .replace('#include <emissivemap_fragment>', FRAG_EMIS)
      .replace('#include <opaque_fragment>', 'outgoingLight = mix( outgoingLight, uTint, uTintAmt );\n#include <opaque_fragment>'),
  });
  return m;
}
