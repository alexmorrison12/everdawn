// Wings: lofted finger bones + skinned membranes (finger panels with scalloped trailing edges and a Coons-patch
// body panel from arm → last finger → trailing edge → flank). Built in the spread rest pose; skin weights
// interpolate between the bounding bones so the membrane folds with the fingers.
import { loft, taper, V } from './parts.js';
import { smoothstep, clamp } from '../../core/noise.js';

const { norm, cross, dot, addS } = V;
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const mul = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
const lerp3 = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const mixc = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

/** Polyline sampler by normalised arc length. */
function poly(pts) {
  const L = [0];
  for (let i = 1; i < pts.length; i++) L.push(L[i - 1] + Math.hypot(...sub(pts[i], pts[i - 1])));
  const tot = L[L.length - 1];
  return {
    L, tot, pts,
    at(t) {
      const d = clamp(t, 0, 1) * tot;
      let i = 1; while (i < L.length - 1 && L[i] < d) i++;
      const f = (d - L[i - 1]) / (L[i] - L[i - 1] || 1);
      return { p: lerp3(pts[i - 1], pts[i], clamp(f, 0, 1)), seg: i - 1, f };
    },
  };
}

// weights as small maps {bone: w}
const wAdd = (acc, w, s) => { for (const k in w) acc[k] = (acc[k] || 0) + w[k] * s; return acc; };
function wTop4(m) {
  const e = Object.entries(m).map(([k, v]) => [+k, v]).filter(e => e[1] > 1e-4).sort((a, b) => b[1] - a[1]).slice(0, 4);
  const t = e.reduce((a, b) => a + b[1], 0) || 1;
  const si = [0, 0, 0, 0], sw = [0, 0, 0, 0];
  e.forEach((x, i) => { si[i] = x[0]; sw[i] = x[1] / t; });
  if (!e.length) sw[0] = 1;
  return { si, sw };
}

/**
 * ctx: { acc, rig, pal, style, rng, body, bodyW(p) → {si,sw}, KIND, lod }
 */
export function buildWings(ctx) {
  const { rig, pal, style, rng, KIND, acc } = ctx;
  const J = rig.J, I = rig.idx, W = rig.P.wing;
  const lod = ctx.lod ?? 1;
  const glowMem = style.crystal ? 0.25 : style.frill ? 0.45 : 0.6;
  for (const [s, sd] of [[1, 'R'], [-1, 'L']]) {
    const S = J['wS' + sd], E = J['wE' + sd], Wr = J['wW' + sd], K = J['wK' + sd], T = J['wT' + sd];
    const bArm0 = I['wing' + sd + '0'], bArm1 = I['wing' + sd + '1'], bHand = I['wing' + sd + '2'];
    const bF = (f, seg) => I[`wing${sd}f${f}${seg}`];
    const fingers = [0, 1, 2, 3].map(f => poly([Wr, K[f], T[f]]));
    const kFrac = fingers.map(fp => fp.L[1] / fp.tot);
    const fingerW = (f, v) => { // weights along a finger at normalised length v
      const k = kFrac[f], b = smoothstep(k - 0.07, k + 0.07, v);
      const w = {}; w[bF(f, 'a')] = 1 - b; w[bF(f, 'b')] = b;
      const hand = 1 - smoothstep(0.0, 0.12, v);
      if (hand > 0) { for (const key in w) w[key] *= 1 - hand; w[bHand] = (w[bHand] || 0) + hand; }
      return w;
    };
    // ---------- finger bones (lofted, knuckle bulge, claw-like tips)
    for (let f = 0; f < 4; f++) {
      const fp = fingers[f];
      const pts = [];
      const n = lod ? 14 : 6;
      for (let i = 0; i <= n; i++) pts.push(fp.at(i / n).p);
      const r0 = (0.13 - f * 0.012) * W;
      const sec = (t) => {
        const knuckle = Math.exp(-((t - kFrac[f]) ** 2) / 0.003) * 0.35;
        const r = r0 * (1 - t * 0.78) * (1 + knuckle);
        return [r, r * 0.9];
      };
      const m = loft(pts, lod ? 8 : 5, sec, [0, 1, 0]);
      acc.addMesh(m, (i, c, si, sw, d, uv) => {
        const t = m.t[i];
        const { si: a, sw: b } = wTop4(fingerW(f, t));
        for (let k = 0; k < 4; k++) { si[k] = a[k]; sw[k] = b[k]; }
        const col = mixc(pal.flank, pal.back, 0.5 + 0.5 * t);
        const f2 = 0.8 + 0.2 * m.nrm[i * 3 + 1];
        c[0] = col[0] * f2; c[1] = col[1] * f2; c[2] = col[2] * f2;
        d[0] = KIND.skin; d[1] = 0.1; d[2] = 1 / 0.07; d[3] = 0;
        uv[0] = m.uv[i * 2]; uv[1] = t;
      });
      // tip talon
      const tip = fp.at(1).p, dir = norm(sub(tip, fp.at(0.95).p));
      const tm = loft([tip, addS(tip, dir, 0.18 * W), addS(addS(tip, dir, 0.32 * W), [0, -1, 0], 0.06 * W)], 5, taper(0.035 * W), [0, 1, 0]);
      acc.addMesh(tm, (i, c, si, sw, d) => {
        si[0] = bF(f, 'b'); sw[0] = 1; sw[1] = sw[2] = sw[3] = 0;
        const col = mixc(pal.claw, pal.clawTip, tm.t[i]); c[0] = col[0]; c[1] = col[1]; c[2] = col[2];
        d[0] = KIND.hard; d[1] = 0; d[2] = 0; d[3] = 0;
      });
    }
    // ---------- membrane
    const tatter = style.tatter || 0;
    const memCol = (u, v, edgeBand, boneNear) => {
      let c = mixc(pal.membrane, pal.membraneEdge, clamp(edgeBand, 0, 1) * 0.85);
      c = mixc(c, pal.back, boneNear * 0.5);
      const n = 0.9 + 0.2 * Math.sin(u * 17.0 + v * 5.0) * Math.sin(v * 11.0);
      return mul(c, n);
    };
    const pushGrid = (NU, NV, posFn, wFn, colFn, billowFn, uvFn) => {
      const base = acc.n;
      for (let j = 0; j <= NV; j++) for (let i = 0; i <= NU; i++) {
        const u = i / NU, v = j / NV;
        const p = posFn(u, v);
        const { si, sw } = wTop4(wFn(u, v));
        const col = colFn(u, v);
        const [uu, vv] = uvFn(u, v);
        acc.vert(p[0], p[1], p[2], 0, 1, 0, col[0], col[1], col[2], uu, vv, si, sw, [KIND.membrane, glowMem, 0, billowFn(u, v)]);
      }
      // winding: front face = top side of the spread wing
      const ci = base + Math.floor(NV / 2) * (NU + 1) + Math.floor(NU / 2);
      const P = acc.P, pa = [P[ci * 3], P[ci * 3 + 1], P[ci * 3 + 2]];
      const pb = [P[(ci + NU + 1) * 3], P[(ci + NU + 1) * 3 + 1], P[(ci + NU + 1) * 3 + 2]];
      const pc = [P[(ci + 1) * 3], P[(ci + 1) * 3 + 1], P[(ci + 1) * 3 + 2]];
      const flip = cross(sub(pb, pa), sub(pc, pa))[1] < 0;
      const i0 = acc.I.length;
      for (let j = 0; j < NV; j++) for (let i = 0; i < NU; i++) {
        const a = base + j * (NU + 1) + i, b = a + NU + 1;
        if (!flip) { acc.tri(a, b, a + 1); acc.tri(a + 1, b, b + 1); }
        else { acc.tri(a, a + 1, b); acc.tri(a + 1, b + 1, b); }
      }
      // smooth normals for this grid
      const nv = (NU + 1) * (NV + 1), N = new Float32Array(nv * 3);
      for (let t = i0; t < acc.I.length; t += 3) {
        const A = acc.I[t], B = acc.I[t + 1], C = acc.I[t + 2];
        const n = cross(sub([P[B * 3], P[B * 3 + 1], P[B * 3 + 2]], [P[A * 3], P[A * 3 + 1], P[A * 3 + 2]]), sub([P[C * 3], P[C * 3 + 1], P[C * 3 + 2]], [P[A * 3], P[A * 3 + 1], P[A * 3 + 2]]));
        for (const v of [A, B, C]) { const o = (v - base) * 3; N[o] += n[0]; N[o + 1] += n[1]; N[o + 2] += n[2]; }
      }
      for (let v = 0; v < nv; v++) {
        const l = Math.hypot(N[v * 3], N[v * 3 + 1], N[v * 3 + 2]) || 1;
        acc.N[(base + v) * 3] = N[v * 3] / l; acc.N[(base + v) * 3 + 1] = N[v * 3 + 1] / l; acc.N[(base + v) * 3 + 2] = N[v * 3 + 2] / l;
      }
      return base;
    };
    const wingUp = norm(cross(sub(T[0], Wr), sub(T[3], Wr))); // membrane normal (approx)
    const up = s > 0 ? mul(wingUp, -1) : wingUp;
    // finger panels
    for (let f = 0; f < 3; f++) {
      const A = fingers[f], B = fingers[f + 1];
      const gap = Math.hypot(...sub(T[f], T[f + 1]));
      const scal = clamp(0.28 * gap / A.tot, 0.12, 0.34) * (1 + tatter * 0.2);
      const jag = (u) => tatter ? 0.06 * Math.sin(u * 31 + f * 7) * Math.sin(u * 13) : 0;
      const vmax = (u) => 1 - scal * Math.sin(Math.PI * u) - Math.abs(jag(u)) * Math.sin(Math.PI * u);
      const NU = lod ? 8 : 4, NV = lod ? 12 : 5;
      const base = pushGrid(NU, NV,
        (u, v) => {
          const vv = v * vmax(u);
          const p = lerp3(A.at(vv).p, B.at(vv).p, u);
          const sag = 0.12 * W * Math.sin(Math.PI * u) * Math.sin(Math.PI * v);
          return addS(p, up, -sag);
        },
        (u, v) => { const vv = v * vmax(u); return wAdd(wAdd({}, fingerW(f, vv), 1 - u), fingerW(f + 1, vv), u); },
        (u, v) => memCol(u, v, smoothstep(0.82, 1.0, v) + smoothstep(0.1, 0.0, Math.min(u, 1 - u)) * 0.5, smoothstep(0.08, 0.0, Math.min(u, 1 - u)) + smoothstep(0.1, 0.0, v)),
        (u, v) => Math.sin(Math.PI * u) * Math.sin(Math.PI * v),
        (u, v) => [u, v]);
    }
    // body panel (Coons patch): u from flank (0) to finger 3 (1); v from arm (0) to trailing edge (1)
    {
      const arm = poly([S, E, Wr]);
      // flank attach line (raycast the body side), from the wing root back to the hip
      const flank = [];
      const hipZ = J.pelvis[2] + 0.35;
      for (let k = 0; k <= 4; k++) {
        const z = S[2] + (hipZ - S[2]) * (k / 4);
        const y = S[1] - 0.45 * (k / 4) - 0.25 * Math.sin(k / 4 * Math.PI);
        const c = [0, y - 0.4, z];
        const dir = norm([s, 0.55, 0]);
        const h = ctx.body.raycastOut(c[0], c[1], c[2], dir[0], dir[1], dir[2], 4, 0.01);
        flank.push(k === 0 ? S : addS(c, dir, (h > 0 ? h : 1) - 0.06));
      }
      const D0 = poly(flank), D1 = fingers[3];
      const Hp = flank[flank.length - 1], T3 = T[3];
      const trailIn = norm(sub(lerp3(E, Wr, 0.5), lerp3(Hp, T3, 0.5)));
      const trailLen = Math.hypot(...sub(T3, Hp));
      const jag = (u) => tatter ? 0.05 * Math.sin(u * 37) * Math.sin(u * 11 + 1) : 0;
      const C1 = (u) => addS(lerp3(Hp, T3, u), trailIn, (0.2 * trailLen * (1 + tatter * 0.2) + jag(u) * trailLen) * Math.sin(Math.PI * u));
      const bodyW = D0.pts.map(p => { const w = ctx.bodyW(p); const o = {}; w.si.forEach((b, i) => { if (w.sw[i] > 0) o[b] = (o[b] || 0) + w.sw[i]; }); return o; });
      const flankW = (v) => { const q = D0.at(v); const a = bodyW[q.seg], b = bodyW[Math.min(q.seg + 1, bodyW.length - 1)]; return wAdd(wAdd({}, a, 1 - q.f), b, q.f); };
      const armW = (u) => {
        const q = arm.at(u);
        const w = {};
        if (q.seg === 0) { w[bArm0] = 1 - smoothstep(0.75, 1.0, q.f) * 0.5; w[bArm1] = smoothstep(0.75, 1.0, q.f) * 0.5; }
        else { w[bArm1] = 1 - smoothstep(0.7, 1.0, q.f); w[bHand] = smoothstep(0.7, 1.0, q.f); if (q.f < 0.2) { w[bArm0] = (0.2 - q.f) * 2.5 * 0.5; } }
        return w;
      };
      const NU = lod ? 14 : 6, NV = lod ? 12 : 5;
      pushGrid(NU, NV,
        (u, v) => {
          const c0 = arm.at(u).p, c1 = C1(u), d0 = D0.at(v).p, d1 = D1.at(v).p;
          const p = [0, 1, 2].map(k => (1 - v) * c0[k] + v * c1[k] + (1 - u) * d0[k] + u * d1[k]
            - ((1 - u) * (1 - v) * S[k] + u * (1 - v) * Wr[k] + (1 - u) * v * Hp[k] + u * v * T3[k]));
          const sag = 0.18 * W * Math.sin(Math.PI * u) * Math.sin(Math.PI * v);
          return addS(p, up, -sag);
        },
        (u, v) => {
          const e = 0.06;
          const wf = 1 / (v + e) ** 2, wb = 1 / (1 - v + e) ** 2, wl = 1 / (u + e) ** 2, wr = 1 / (1 - u + e) ** 2;
          const trail = wAdd(wAdd({}, flankW(1), 1 - u), fingerW(3, 1), u);
          const m = {};
          wAdd(m, armW(u), wf); wAdd(m, trail, wb); wAdd(m, flankW(v), wl); wAdd(m, fingerW(3, v), wr);
          return m;
        },
        (u, v) => memCol(u, v, smoothstep(0.85, 1.0, v) + smoothstep(0.06, 0.0, u) * 0.6, smoothstep(0.06, 0.0, v) + smoothstep(0.05, 0.0, 1 - u)),
        (u, v) => Math.sin(Math.PI * u) * Math.sin(Math.PI * v),
        (u, v) => [u, v]);
    }
  }
}
