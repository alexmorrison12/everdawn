// Single entry point for building unit models. Swaps in real generators as they come online.
import { createPlaceholder } from './placeholder.js';

const REG = { humanoid: null, creature: null, dragon: null };
export function registerModels(kind, fn) { REG[kind] = fn; }

const PH = {
  boar: { height: 1.1, radius: 0.7, color: 0x6a4a3a, quad: true }, wolf: { height: 1.2, radius: 0.6, color: 0x7a7a80, quad: true },
  spider: { height: 1.0, radius: 0.9, color: 0x3a2a3a, quad: true }, gurgler: { height: 1.4, radius: 0.55, color: 0x3a8a7a },
  kobold: { height: 1.3, radius: 0.5, color: 0x8a6a4a }, rabbit: { height: 0.4, radius: 0.2, color: 0xc0b0a0, quad: true },
  deer: { height: 1.5, radius: 0.5, color: 0xa07040, quad: true }, chicken: { height: 0.5, radius: 0.2, color: 0xf0f0e0 },
  sheep: { height: 0.9, radius: 0.5, color: 0xf0f0f0, quad: true }, cat: { height: 0.4, radius: 0.2, color: 0x404040, quad: true },
};

/** spec: ['humanoid', opts] | ['creature', type, opts] | ['dragon', opts] */
export const buildLog = []; // slow model builds (cache misses) for load profiling: [kind, spec, ms]
export function createModel(spec) {
  const t0 = performance.now(), m = build(spec), ms = performance.now() - t0;
  if (m) m.spec = spec; // lets a host tell guests how to build the same model
  if (ms > 8 && buildLog.length < 400) buildLog.push([spec[0], JSON.stringify(spec[1]).slice(0, 140), Math.round(ms)]);
  return m;
}
function build(spec) {
  const [kind, a, b] = spec;
  try {
    if (kind === 'humanoid' && REG.humanoid) return REG.humanoid(a);
    if (kind === 'creature' && REG.creature) return REG.creature(a, b || {});
    if (kind === 'dragon' && REG.dragon) return REG.dragon(a);
  } catch (e) { console.error('model build failed', spec, e); }
  if (kind === 'creature') { const p = PH[a] || {}; const s = b?.scale || 1; return createPlaceholder({ ...p, height: (p.height || 1) * s, radius: (p.radius || 0.5) * s }); }
  if (kind === 'dragon') return createPlaceholder({ height: 6, radius: 4, color: 0x8a2020, quad: true });
  const col = { warrior: 0xa06040, mage: 0x5080d0, priest: 0xe0e0e0, rogue: 0x404040, hunter: 0x608040, paladin: 0xd0a0b0 }[a?.cls] || 0xa08060;
  return createPlaceholder({ height: a?.race === 'dwarf' ? 1.35 : a?.race === 'orc' ? 2.0 : 1.85, radius: 0.45, color: col });
}
