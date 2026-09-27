// Humanoid skeleton definition shared by the mesh builder and the procedural animator.
// Bind pose: A-pose (arms rotated outward by armA about the shoulder, legs spread by legS about the hip).
// Animation "neutral" pose: arms hanging straight down, legs straight down, all bone frames aligned with the
// character (X = character right, Y = up, Z = back; the model faces -Z).
// bone.quaternion = Nparent^-1 * E * N, where E is the animation rotation authored in neutral frames.

export const BONES = [
  'hips', 'spine', 'chest', 'neck', 'head',
  'clavL', 'uarmL', 'farmL', 'handL', 'idxL1', 'idxL2', 'fngL1', 'fngL2', 'thbL1', 'thbL2',
  'clavR', 'uarmR', 'farmR', 'handR', 'idxR1', 'idxR2', 'fngR1', 'fngR2', 'thbR1', 'thbR2',
  'thighL', 'shinL', 'footL', 'toeL', 'thighR', 'shinR', 'footR', 'toeR',
  'cape0', 'cape1', 'cape2', 'cape3',
  'hairA', 'hairB', 'hairC', 'braidL1', 'braidL2', 'braidR1', 'braidR2', 'beard1', 'beard2',
];
export const B = Object.fromEntries(BONES.map((n, i) => [n, i]));
export const NB = BONES.length;

const PARENT = {
  hips: null, spine: 'hips', chest: 'spine', neck: 'chest', head: 'neck',
  clavL: 'chest', uarmL: 'clavL', farmL: 'uarmL', handL: 'farmL', idxL1: 'handL', idxL2: 'idxL1', fngL1: 'handL', fngL2: 'fngL1', thbL1: 'handL', thbL2: 'thbL1',
  clavR: 'chest', uarmR: 'clavR', farmR: 'uarmR', handR: 'farmR', idxR1: 'handR', idxR2: 'idxR1', fngR1: 'handR', fngR2: 'fngR1', thbR1: 'handR', thbR2: 'thbR1',
  thighL: 'hips', shinL: 'thighL', footL: 'shinL', toeL: 'footL', thighR: 'hips', shinR: 'thighR', footR: 'shinR', toeR: 'footR',
  cape0: 'chest', cape1: 'cape0', cape2: 'cape1', cape3: 'cape2',
  hairA: 'head', hairB: 'hairA', hairC: 'hairB', braidL1: 'head', braidL2: 'braidL1', braidR1: 'head', braidR2: 'braidR1',
  beard1: 'head', beard2: 'beard1',
};
export const PARENTS = BONES.map(n => PARENT[n] === null ? -1 : B[PARENT[n]]);

// chains used for garment coverage rules
export const CH_TORSO = 0, CH_ARM_L = 1, CH_ARM_R = 2, CH_LEG_L = 3, CH_LEG_R = 4, CH_HEAD = 5, CH_HAND_L = 6, CH_HAND_R = 7;
export const BONE_CHAIN = BONES.map(n => {
  if (/^(hips|spine|chest|neck|clav|cape)/.test(n)) return CH_TORSO;
  if (n === 'head' || /^(hair|braid|beard)/.test(n)) return CH_HEAD;
  if (/L\d?$/.test(n) && /^(uarm|farm)/.test(n)) return CH_ARM_L;
  if (/R\d?$/.test(n) && /^(uarm|farm)/.test(n)) return CH_ARM_R;
  if (/^(hand|idx|fng|thb)L/.test(n) || n === 'handL') return CH_HAND_L;
  if (/^(hand|idx|fng|thb)R/.test(n) || n === 'handR') return CH_HAND_R;
  if (/L$/.test(n)) return CH_LEG_L;
  return CH_LEG_R;
});

// upper-body mask for layered one-shots (1 = fully driven by upper layer)
export const UPPER_MASK = new Float32Array(NB);
for (const n of BONES) {
  const i = B[n];
  if (n === 'spine') UPPER_MASK[i] = 0.7;
  else if (n === 'chest' || n === 'neck' || n === 'head') UPPER_MASK[i] = 1;
  else if (/^(clav|uarm|farm|hand|idx|fng|thb)/.test(n)) UPPER_MASK[i] = 1;
  else UPPER_MASK[i] = 0;
}
export const ARM_MASK = new Float32Array(NB);
for (const n of BONES) if (/^(clav|uarm|farm|hand|idx|fng|thb)/.test(n)) ARM_MASK[B[n]] = 1;

export const SECONDARY = ['cape0', 'cape1', 'cape2', 'cape3', 'hairA', 'hairB', 'hairC', 'braidL1', 'braidL2', 'braidR1', 'braidR2', 'beard1', 'beard2'].map(n => B[n]);
