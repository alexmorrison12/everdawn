// Procedural WoW-style humanoid characters: sculpted SDF bodies (cached per race+sex), painted faces,
// sculpted hair/beards, conforming + hard-surface gear, oversized weapons and layered procedural animation.
//
//   import { createHumanoid, GEAR_PRESETS, randomAppearance, prewarmHumanoids } from './models/humanoid.js';
//   const c = createHumanoid({ race: 'orc', sex: 'm', cls: 'warrior', gear: GEAR_PRESETS.warrior[3] });
//   scene.add(c.root); c.update(dt, state); c.play('attack2h');
//
// createHumanoid(opts) -> {
//   root, mesh, height, radius, opts, stats:{verts,tris,drawCalls,ms},
//   sockets: { handR, handL, back, head, chest, mouth }   // Object3Ds (head: eye-level head centre, -Z out of the face)
//   update(dt, state), play(action, { speed }), setGear(gear), setTint(hex, amount), setCastColor(hex), dispose()
// }
// opts: { race:'human'|'dwarf'|'orc'|'elf', sex:'m'|'f', skin:hex, hair:int, hairColor:hex, face:int(0..3), beard:int(0..5, males),
//         eye:hex, eyeGlow:number, cls:'warrior'|'paladin'|'mage'|'priest'|'rogue'|'hunter'|'npc', gear, scale, seed }
// gear: spec object (see humanoid/gear.js), or a preset string 'warrior:2' | 'npc:farmer' | 'farmer'; default = class tier 1.
// state = { speed, strafe, turn, grounded, vy, combat, casting: null|'directed'|'omni'|'channel', swimming, dead, sit }
//   - combat draws weapons (short draw/sheathe gesture); sheathed weapons ride on the back/hips.
//   - swimming: place root.y at the water surface; the body hangs below with the head above water.
//   - dead: collapses and holds; sit: sits on the ground. Emotes/dances stop when the character moves.
// Actions (upper-body when moving, full-body when standing): attack1h (alternates 2 variants), attack2h, attackOff, shieldBash,
//   shoot, castDirected, castOmni, hit (additive flinch), dodge, roar. Emotes: wave, cheer, laugh, point, bow, kneel (holds),
//   dance (loops; distinct per race+sex).
// Performance: geometry is cached aggressively (bases per race+sex ~80 ms each, hair/beards/hoods/gear pieces per race+sex+spec,
//   weapons per spec). Warm createHumanoid() costs ~1 ms; call prewarmHumanoids() during loading to fill caches. 1 skinned draw
//   call + 1 per weapon (<= 3 total), ~6.8-11.8k vertices, ~12 us/frame animation update per character.
import * as THREE from 'three';
import { getBase } from './humanoid/body.js';
import { BONES, B, NB, PARENTS } from './humanoid/rig.js';
import { assemble } from './humanoid/assemble.js';
import { SLOT } from './humanoid/palette.js';
import { makeUniforms, makeHumanoidMaterial } from './humanoid/material.js';
import { faceTexture, FACE_COUNT } from './humanoid/face.js';
import { Animator } from './humanoid/anim.js';
import { GEAR_PRESETS, resolveGear, buildPalette, paintBody } from './humanoid/gear.js';
import { ringPiece, pauldronPiece, headgearPiece, capePiece, skirtPiece, panelPiece, copPiece, cuffPiece, beltPiece, tusksPiece, quiverPiece, strapPiece, lamesPiece, limbPlatesPiece } from './humanoid/pieces.js';
import { hairPiece, beardPiece, hoodPiece, HAIR_STYLES, BEARD_STYLES } from './humanoid/hair.js';
import { weaponGeometry } from './humanoid/weapons.js';
import { RNG } from '../core/noise.js';

export { GEAR_PRESETS, HAIR_STYLES, BEARD_STYLES };

// ------------------------------------------------------------------------------------------------
export const RACES = {
  human: { name: 'Human', skins: [0xf0c8a8, 0xe2b08c, 0xd09a74, 0xb27a54, 0x8a5a3a, 0x6a4028], hair: [0x1e1612, 0x3a2616, 0x6a4424, 0x9a6a38, 0xd8b068, 0xa04a24, 0x8a8a88, 0xe8e0d0],
    eyes: [0x3a6ab0, 0x4a8a5a, 0x6a4a2a, 0x5a7a8a], eyeGlow: 0, height: 1.86 },
  dwarf: { name: 'Dwarf', skins: [0xf0c0a0, 0xe6a88a, 0xd8967a, 0xb88064, 0x8a5e46, 0x9aa0a8], hair: [0x2a1a10, 0x5a3418, 0x8a4a1e, 0xb86a2a, 0xd8b068, 0x9a9a98, 0xe8e4dc, 0x1a1a1e],
    eyes: [0x3a5a8a, 0x5a4a2a, 0x4a7a5a], eyeGlow: 0, height: 1.38 },
  orc: { name: 'Orc', skins: [0x6f9a3e, 0x5a8a34, 0x7aa050, 0x4a7a3a, 0x8a9a4a, 0x6a7a3a], hair: [0x141210, 0x2a2018, 0x4a3a2a, 0x6a6a68, 0x3a2a1a],
    eyes: [0xd8a020, 0xc84a1a, 0xe0c040], eyeGlow: 0.35, height: 2.0 },
  elf: { name: 'Elf', skins: [0xb8a6e0, 0xa898d8, 0x9aa8e0, 0xc8b8e8, 0xf0d8c8, 0xe8c8b8], hair: [0x2a3a6a, 0x4a2a6a, 0xd8dce8, 0x2a6a5a, 0x1e1e2e, 0xb8e0e8, 0x6a2a4a],
    eyes: [0xffd070, 0xc0f0ff, 0xa0ffc0], eyeGlow: 1.6, height: 2.08 },
};
export const CLASSES = {
  warrior: { armor: 'plate', style: 'melee' }, paladin: { armor: 'plate', style: 'melee' }, mage: { armor: 'cloth', style: 'caster' },
  priest: { armor: 'cloth', style: 'caster' }, rogue: { armor: 'leather', style: 'melee' }, hunter: { armor: 'mail', style: 'ranged' }, npc: { armor: 'cloth', style: 'npc' },
};
export const ACTIONS = ['attack1h', 'attack2h', 'attackOff', 'shieldBash', 'shoot', 'castDirected', 'castOmni', 'hit', 'dodge', 'roar'];
export const EMOTES = ['wave', 'cheer', 'laugh', 'point', 'bow', 'kneel', 'dance'];

/** Random appearance (no gear/class). rng = new RNG(seed) */
export function randomAppearance(rng = new RNG(1), race0 = null, sex0 = null) {
  const race = race0 || rng.pick(['human', 'human', 'dwarf', 'orc', 'elf']);
  const sex = sex0 || (rng.chance(0.5) ? 'm' : 'f');
  const R = RACES[race];
  const styles = HAIR_STYLES[`${race}_${sex}`];
  let beard = 0;
  if (sex === 'm') beard = race === 'dwarf' ? rng.pick([2, 3, 3]) : rng.pick([0, 0, 1, 2, 4, 5, 0]);
  return {
    race, sex, skin: rng.pick(R.skins), hair: rng.int(0, styles.length - 1), hairColor: rng.pick(R.hair), face: rng.int(0, FACE_COUNT - 1),
    beard, eye: rng.pick(R.eyes), eyeGlow: R.eyeGlow, seed: rng.int(1, 1e6),
  };
}

/** How many choices each creation-screen appearance option has for this race and sex. */
export function appearanceCounts(race = 'human', sex = 'm') {
  const R = RACES[race] || RACES.human;
  return { skin: R.skins.length, face: FACE_COUNT, hair: (HAIR_STYLES[`${race}_${sex}`] || HAIR_STYLES.human_m).length, hairColor: R.hair.length, beard: sex === 'm' ? BEARD_STYLES.length : 1 };
}

// ------------------------------------------------------------------------------------------------
const INV_CACHE = new Map();
function makeSkeleton(base) {
  const bones = BONES.map((n) => { const b = new THREE.Bone(); b.name = n; return b; });
  const J = base.joints;
  for (let i = 0; i < NB; i++) {
    const p = PARENTS[i];
    if (p < 0) bones[i].position.set(J[i * 3], J[i * 3 + 1], J[i * 3 + 2]);
    else { bones[i].position.set(J[i * 3] - J[p * 3], J[i * 3 + 1] - J[p * 3 + 1], J[i * 3 + 2] - J[p * 3 + 2]); bones[p].add(bones[i]); }
  }
  let inv = INV_CACHE.get(base.key);
  if (!inv) {
    bones[0].updateMatrixWorld(true);
    inv = bones.map(b => new THREE.Matrix4().copy(b.matrixWorld).invert());
    INV_CACHE.set(base.key, inv);
  }
  return { bones, skeleton: new THREE.Skeleton(bones, inv) };
}

function weaponStyle(g) {
  const m = g.mainHand?.type, o = g.offHand?.type;
  if (!m) return 'fists';
  if (m === 'sword2h' || m === 'axe2h') return '2h';
  if (m === 'staff') return 'staff';
  if (m === 'bow') return 'bow';
  if (o === 'shield') return '1hShield';
  if (o === 'book' || o === 'orb') return '1hCaster';
  if (o) return 'dual';
  return '1h';
}

/** list of gear pieces for a base + resolved gear spec */
function gearPieces(base, g) {
  const L = [];
  const J = base.JJ.J;
  const add = (p, extra = {}) => { if (p) L.push({ p, ...extra }); };
  const chest = g.chest || { type: 'shirt', sleeves: 1 };
  const ct = chest.type, tier = g.tier || 0;
  const legScale = base.JJ.legLen / 0.87;
  const sl = chest.sleeves ?? 1;
  if (sl > 0.25 && sl < 1.93 && !(g.hands && sl > 2 - (g.hands.cuff ?? 0.3))) {
    for (const s of ['L', 'R']) {
      if (ct === 'plate') add(ringPiece(base, 'arm' + s, sl, { profile: 'lip', w: 0.03, t: 0.022, slot: SLOT.TRIM, off: 0.012 }));
      else if (ct === 'leather' || ct === 'mail') add(ringPiece(base, 'arm' + s, sl, { profile: 'band', w: 0.028, t: 0.012, slot: SLOT.ARMOR2, off: 0.008, stitch: true }));
      else add(ringPiece(base, 'arm' + s, sl, { profile: 'tube', w: 0.018, slot: tier >= 1 ? SLOT.CLOTH2 : SLOT.CLOTH1, off: 0.006 }));
    }
  }
  if (ct === 'robe' && sl >= 1.9) for (const s of ['L', 'R']) add(cuffPiece(base, 'arm' + s, 1.72, { w: 0.13, flare: 0.045, t: 0.008, slot: SLOT.CLOTH1, off: 0.012, trim: tier >= 1 }));
  if (chest.neck === 'high') {
    if (ct === 'plate') add(ringPiece(base, 'torso', J.neck[1] + 0.012, { profile: 'band', w: 0.05, t: 0.02, slot: SLOT.TRIM, off: 0.012, rMax: 0.3 }));
    else add(ringPiece(base, 'torso', J.neck[1] + 0.01, { profile: 'flare', w: 0.06, t: 0.008, flare: 0.02, slot: ct === 'robe' ? SLOT.CLOTH2 : SLOT.ARMOR2, off: 0.01, rMax: 0.3 }));
  }
  if (ct === 'tunic' || ct === 'shirt' || ct === 'rags') add(ringPiece(base, 'torso', J.hips[1] - 0.06 * legScale, { profile: 'tube', w: 0.016, slot: SLOT.CLOTH2, off: 0.01 }));
  if (chest.straps && ct !== 'robe') add(strapPiece(base, { off: ct === 'mail' ? 0.018 : 0.014 }));
  if (ct === 'plate') add(lamesPiece(base, { count: 3, trim: tier >= 2 }));
  if (ct === 'plate' || g.legs?.type === 'plate') {
    const gl = g.hands ? 2 - (g.hands.cuff ?? 0.3) : 9;
    add(limbPlatesPiece(base, { arms: ct === 'plate' ? [0.45, 1.3] : [], legs: g.legs?.type === 'plate' ? [0.13, 0.72, 1.3] : [] }));
  }
  if (ct === 'robe' && g.skirt?.panel) add(panelPiece(base, { top: J.neck[1] - 0.02, bottom: J.spine[1] - 0.01, hw: 0.05 * base.scale, slot: SLOT.CLOTH2, trim: true, front: true }));
  if (g.belt) {
    const bt = g.belt.type;
    if (bt === 'sash') add(beltPiece(base, { type: 'sash', w: 0.075, slot: SLOT.CLOTH2, buckle: g.belt.buckle || 'none', off: 0.012 }));
    else if (bt === 'rope') add(ringPiece(base, 'torso', J.spine[1] - 0.035, { profile: 'tube', w: 0.02, slot: SLOT.STRAW, off: 0.012 }));
    else add(beltPiece(base, { type: bt, w: bt === 'plate' ? 0.07 : 0.055, slot: bt === 'plate' ? SLOT.ARMOR2 : SLOT.BELT, buckle: g.belt.buckle, pouches: g.belt.pouches || 0, off: ct === 'plate' ? 0.02 : 0.013 }));
  }
  if (g.feet) {
    const bt = 2 - (g.feet.height ?? 0.4) * 0.95;
    for (const s of ['L', 'R']) {
      if (g.feet.cuff) add(cuffPiece(base, 'leg' + s, bt + 0.04, { w: 0.08, flare: g.feet.type === 'plate' ? 0.03 : 0.025, t: 0.01, slot: SLOT.BOOT, off: 0.01, trim: g.feet.type === 'plate' && tier >= 2 }));
      else add(ringPiece(base, 'leg' + s, bt, { profile: 'tube', w: 0.016, slot: SLOT.BOOT, off: 0.01 }));
      if (g.feet.type === 'plate') add(copPiece(base, s, 'toe', { slot: SLOT.BOOT, size: 1 }));
    }
  }
  if (g.hands) {
    const gc = 2 - (g.hands.cuff ?? 0.3);
    for (const s of ['L', 'R']) {
      if (g.hands.type === 'gauntlets') add(cuffPiece(base, 'arm' + s, gc + 0.04, { w: 0.1, flare: 0.04, t: 0.012, slot: SLOT.GLOVE, off: 0.012, trim: tier >= 2, glowTrim: g.hands.glowTrim }));
      else if (g.hands.type === 'gloves') add(cuffPiece(base, 'arm' + s, gc + 0.03, { w: 0.07, flare: 0.02, t: 0.008, slot: SLOT.GLOVE, off: 0.006 }));
      else add(ringPiece(base, 'arm' + s, g.hands.type === 'bracers' ? 1.6 : gc + 0.02, { profile: 'band', w: g.hands.type === 'bracers' ? 0.12 : 0.03, t: 0.01, slot: g.hands.type === 'bracers' ? SLOT.LEATHER : SLOT.LINEN, off: 0.007, stitch: true }));
    }
  }
  if (g.shoulders) for (const s of ['L', 'R']) add(pauldronPiece(base, s, { ...g.shoulders, tier }));
  if (g.legs?.kneepads) for (const s of ['L', 'R']) add(copPiece(base, s, 'knee', { slot: g.legs.type === 'leather' ? SLOT.ARMOR2 : SLOT.ARMOR1, size: g.legs.type === 'plate' ? 1.15 : 1, rim: g.legs.type === 'plate' && tier >= 2, spike: tier >= 3 }));
  if (ct === 'plate' && tier >= 2) for (const s of ['L', 'R']) add(copPiece(base, s, 'elbow', { slot: SLOT.ARMOR1, size: 1.1, rim: true }));
  let hideHair = false;
  const ht = g.head?.type;
  if (ht === 'hood') { add(hoodPiece(base)); hideHair = true; }
  else if (ht) { add(headgearPiece(base, { type: ht, gem: g.head.gem, glowTrim: g.head.glowTrim })); if (/helm|horned|winged|bandana|cap/.test(ht)) hideHair = true; }
  if (g.head?.mask) add(headgearPiece(base, { type: 'none', mask: true }));
  if (g.cloak) add(capePiece(base, { len: g.cloak.len, trim: g.cloak.trim, emblem: g.cloak.emblem, glowTrim: g.cloak.glowTrim, hem: g.cloak.hem || (tier >= 2 && g.cloak.trim ? 'v' : g.armor === 'leather' && tier < 2 ? 'tatter' : 'round') }));
  if (ct === 'robe' || g.skirt) {
    const sk = g.skirt || {};
    const isPlate = sk.type === 'plate' || sk.type === 'leather';
    add(skirtPiece(base, { len: sk.len ?? 0.95, flare: sk.flare ?? 0.12, panel: sk.panel, hemTrim: sk.hemTrim, slot: isPlate ? SLOT.ARMOR1 : SLOT.CLOTH1, hemSlot: SLOT.TRIM, top: isPlate ? -0.05 : -0.02, off: isPlate ? 0.02 : 0.012 }));
  }
  if (g.tabard) add(panelPiece(base, { emblem: g.tabard.emblem, back: g.tabard.back, slot: SLOT.TABARD, trim: true }));
  if (g.apron) add(panelPiece(base, { top: J.chest[1] + 0.06, bottom: J.shinL[1] + 0.02, hw: base.P.core[1] * 0.95, slot: SLOT.TABARD }));
  if (g.quiver) add(quiverPiece(base));
  return { list: L, hideHair };
}

// ------------------------------------------------------------------------------------------------
// weapon mounting (socket transforms authored in the neutral frame of the hand bone)
const _m4 = new THREE.Matrix4();
function handSocket(anim, bone, side, hs, kind = 'grip') {
  const sg = side === 'R' ? 1 : -1;
  const o = new THREE.Object3D(); o.name = 'socket_' + kind + side;
  const Ninv = anim.N[B['hand' + side]].clone().invert();
  let pos, q;
  if (kind === 'shield') { // strapped on the forearm, face outward
    pos = new THREE.Vector3(sg * 0.06 * hs, 0.1 * hs, 0.0);
    const X = new THREE.Vector3(0, 0, -sg), Y = new THREE.Vector3(0, 1, 0), Z = new THREE.Vector3().crossVectors(X, Y);
    q = new THREE.Quaternion().setFromRotationMatrix(_m4.makeBasis(X, Y, Z));
  } else if (kind === 'book') {
    pos = new THREE.Vector3(-sg * 0.05 * hs, -0.085 * hs, -0.02);
    q = new THREE.Quaternion().setFromRotationMatrix(_m4.makeBasis(new THREE.Vector3(0, 0, -1), new THREE.Vector3(0, -1, 0), new THREE.Vector3(1, 0, 0)));
  } else if (kind === 'orb') {
    pos = new THREE.Vector3(-sg * 0.15 * hs, -0.07 * hs, -0.02); q = new THREE.Quaternion();
  } else { // fist grip: weapon +Y along the thumb (neutral -Z), blade width along the fingers
    pos = new THREE.Vector3(-sg * 0.034 * hs, -0.072 * hs, 0.004);
    q = new THREE.Quaternion().setFromRotationMatrix(_m4.makeBasis(new THREE.Vector3(0, -1, 0), new THREE.Vector3(0, 0, -1), new THREE.Vector3(1, 0, 0)));
  }
  o.position.copy(pos.applyQuaternion(Ninv));
  o.quaternion.copy(Ninv).multiply(q);
  bone.add(o);
  return o;
}

function backSocket(base, bones, kind) {
  const P = base.P;
  const o = new THREE.Object3D(); o.name = 'sheath_' + kind;
  const zBack = P.ribs[2] + 0.07 + P.back[2] * 0.3;
  const basis = (dir, z = new THREE.Vector3(0, 0, 1)) => { const Y = dir.normalize(), X = new THREE.Vector3().crossVectors(Y, z).normalize(), Z = new THREE.Vector3().crossVectors(X, Y); return new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(X, Y, Z)); };
  if (kind === 'backDiag' || kind === 'backStaff' || kind === 'backBow' || kind === 'backAxe') {
    bones[B.chest].add(o);
    // sword: hilt over the right shoulder, blade down to the left hip; axes/staves/bows: head up over the right shoulder
    if (kind === 'backDiag') { o.position.set(0.1, P.shY + 0.06, zBack); o.quaternion.copy(basis(new THREE.Vector3(-0.38, -0.92, 0))); }
    if (kind === 'backAxe') { o.position.set(-0.06, P.shY - 0.42, zBack); o.quaternion.copy(basis(new THREE.Vector3(0.36, 0.93, 0))); }
    if (kind === 'backStaff') { o.position.set(-0.05, P.shY - 0.28, zBack); o.quaternion.copy(basis(new THREE.Vector3(0.34, 0.94, 0))); }
    if (kind === 'backBow') { o.position.set(0.0, P.shY - 0.14, zBack + 0.02); o.quaternion.copy(basis(new THREE.Vector3(0.5, 0.86, 0))); }
  } else if (kind === 'backShield') {
    bones[B.chest].add(o); o.position.set(0, P.shY - 0.14, zBack + 0.05);
  } else { // hips
    bones[B.hips].add(o);
    const sg = kind === 'hipL' ? -1 : 1;
    o.position.set(sg * (P.pelvis[0] + 0.035), -0.03, 0.03);
    o.quaternion.copy(basis(new THREE.Vector3(sg * 0.1, -0.9, 0.42), new THREE.Vector3(sg, 0, 0)));
  }
  return o;
}

// ------------------------------------------------------------------------------------------------
/**
 * createHumanoid(opts) -> { root, height, radius, sockets, update(dt,state), play(action,{speed}), setGear(gear), setTint(hex,amount), dispose(), opts }
 * opts: { race, sex, skin, hair, hairColor, face, beard, eye, eyeGlow, cls, gear, scale, seed }
 */
export function createHumanoid(opts = {}) {
  const t0 = performance.now();
  const o = { race: 'human', sex: 'm', cls: 'warrior', scale: 1, hair: 0, face: 0, seed: 1, ...opts };
  const R = RACES[o.race] || RACES.human;
  if (o.skin == null) o.skin = R.skins[1];
  if (o.hairColor == null) o.hairColor = R.hair[1];
  if (o.eye == null) o.eye = R.eyes[0];
  if (o.eyeGlow == null) o.eyeGlow = R.eyeGlow;
  if (o.beard == null) o.beard = o.sex === 'm' ? (o.race === 'dwarf' ? 3 : 0) : 0;
  const base = getBase(o.race, o.sex);
  const U = makeUniforms();
  U.uFace.value = faceTexture(base, o.face || 0);
  U.uEye.value.set(o.eye); U.uEyeGlow.value = o.eyeGlow;
  U.uBrow.value.set(o.hairColor).multiplyScalar(0.85);
  { const sk = new THREE.Color(o.skin); U.uInk.value.setRGB(sk.r * 0.07 + 0.006, sk.g * 0.045 + 0.004, sk.b * 0.04 + 0.004); }
  const matSkinned = makeHumanoidMaterial(U);
  const matRigid = makeHumanoidMaterial(U, { key: 'r' });
  const mesh = new THREE.SkinnedMesh(new THREE.BufferGeometry(), matSkinned);
  const { bones, skeleton } = makeSkeleton(base);
  mesh.add(bones[0]);
  mesh.bind(skeleton, new THREE.Matrix4());
  mesh.castShadow = true; mesh.receiveShadow = true;
  mesh.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, base.height * 0.5, 0), base.height * 0.95);
  const root = new THREE.Group(); root.name = 'humanoid';
  const inner = new THREE.Group(); inner.scale.setScalar(o.scale);
  inner.add(mesh); root.add(inner);

  const c = { root, mesh, bones, skeleton, U, base, opts: o, height: base.height * o.scale, radius: base.P.radius * o.scale, sockets: {}, stats: {} };
  const anim = new Animator(c);
  c.anim = anim;
  const hs = base.P.hand, hd = base.P.headDef;
  c.sockets.handR = handSocket(anim, bones[B.handR], 'R', hs, 'grip');
  c.sockets.handL = handSocket(anim, bones[B.handL], 'L', hs, 'grip');
  const mk = (name, bone, x, y, z) => { const s = new THREE.Object3D(); s.name = name; s.position.set(x, y, z); bones[bone].add(s); return s; };
  c.sockets.head = mk('socket_head', B.head, 0, hd.eye.y * hd.s, 0);         // eye-level centre of the head; -Z = out of the face
  c.sockets.mouth = mk('socket_mouth', B.head, 0, (hd.mouthY ?? 0.01) * hd.s, -0.12 * hd.s);
  c.sockets.chest = mk('socket_chest', B.chest, 0, base.P.shY - 0.06, -base.P.ribs[2] - 0.04);
  c.sockets.back = mk('socket_back', B.chest, 0, base.P.shY - 0.05, base.P.ribs[2] + 0.08);
  const mounts = {};
  const mount = (k) => mounts[k] || (mounts[k] = backSocket(base, bones, k));
  const wm = { main: null, off: null, string: null };

  function applyGear(gearArg) {
    const g = resolveGear(gearArg, o.cls);
    c.gear = g;
    const paint = paintBody(base, g);
    const P = base.pieces;
    const parts = [
      { p: P.body, ...paint.body },
      { p: P.head, ...paint.head },
      { p: P.handL, ...paint.handL, cast: 1 },
      { p: P.handR, ...paint.handR, cast: 1 },
    ];
    const gp = gearPieces(base, g);
    const styles = HAIR_STYLES[base.key];
    if (!gp.hideHair) { const hp = hairPiece(base, styles[(o.hair ?? 0) % styles.length]); if (hp) parts.push({ p: hp }); }
    if (o.sex === 'm') { const bp = beardPiece(base, BEARD_STYLES[(o.beard || 0) % BEARD_STYLES.length]); if (bp) parts.push({ p: bp }); }
    const tk = tusksPiece(base); if (tk) parts.push({ p: tk });
    for (const it of gp.list) parts.push(it);
    c.stats.parts = parts.map(pt => pt.nUsed ?? pt.p.n);
    const pal = buildPalette(g, { skin: o.skin, hairColor: o.hairColor });
    const old = mesh.geometry;
    mesh.geometry = assemble(parts, pal);
    old.dispose();
    // weapons
    for (const k of ['main', 'off']) if (wm[k]) { wm[k].parent?.remove(wm[k]); wm[k] = null; }
    if (wm.string) { wm.string.geometry.dispose(); wm.string = null; }
    anim.weaponStyle = weaponStyle(g);
    const mkW = (spec) => {
      if (!spec) return null;
      const w = weaponGeometry({ ...spec, glowColor: spec.glow ? (g.glow ?? 0x80c0ff) : undefined });
      if (!w) return null;
      const m = new THREE.Mesh(w.geo, matRigid); m.castShadow = true; m.userData.info = w.info; m.userData.type = spec.type;
      if (spec.type === 'shield') m.userData.scale = Math.min(1, 0.5 + 0.5 * base.scale);
      return m;
    };
    wm.main = mkW(g.mainHand); wm.off = mkW(g.offHand);
    anim.twoHand = wm.main && wm.main.userData.info.grip2 !== undefined ? { socket: c.sockets.handR, grip2: wm.main.userData.info.grip2 } : null;
    if (g.mainHand?.type === 'bow' && wm.main) {
      const info = wm.main.userData.info;
      const sg = new THREE.BufferGeometry();
      sg.setAttribute('position', new THREE.Float32BufferAttribute([...info.stringTop, info.stringTop[0], 0, info.stringTop[2], ...info.stringBot], 3));
      sg.setIndex([0, 1, 1, 2]);
      wm.string = new THREE.LineSegments(sg, STRING_MAT);
      wm.main.add(wm.string);
    }
    attachWeapons(anim.drawn);
    c.stats.verts = mesh.geometry.attributes.position.count;
    c.stats.tris = mesh.geometry.index.count / 3;
    c.stats.drawCalls = 1 + (wm.main ? 1 : 0) + (wm.off ? 1 : 0) + (wm.string ? 1 : 0);
  }

  function attachWeapons(drawn) {
    const g = c.gear;
    const mt = g.mainHand?.type, ot = g.offHand?.type;
    const put = (m, parent) => { if (!m) return; parent.add(m); m.position.set(0, 0, 0); m.quaternion.identity(); m.scale.setScalar(m.userData.scale || 1); };
    if (wm.main) {
      const m = wm.main;
      if (drawn) {
        if (mt === 'bow') { put(m, c.sockets.handL); m.quaternion.setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 2); }
        else put(m, c.sockets.handR);
      } else {
        if (mt === 'sword2h') put(m, mount('backDiag'));
        else if (mt === 'axe2h') put(m, mount('backAxe'));
        else if (mt === 'staff') put(m, mount('backStaff'));
        else if (mt === 'bow') put(m, mount('backBow'));
        else if (mt === 'dagger') put(m, mount('hipR'));
        else put(m, mount('hipL'));
      }
    }
    if (wm.off) {
      const m = wm.off;
      if (ot === 'shield') {
        if (drawn) { c.sockets.shieldL ||= handSocket(anim, bones[B.handL], 'L', hs, 'shield'); put(m, c.sockets.shieldL); }
        else put(m, mount('backShield'));
      } else if (ot === 'orb') {
        c.sockets.orbL ||= handSocket(anim, bones[B.handL], 'L', hs, 'orb'); put(m, c.sockets.orbL); m.userData.float = true;
      } else if (ot === 'book') {
        if (drawn) { c.sockets.bookL ||= handSocket(anim, bones[B.handL], 'L', hs, 'book'); put(m, c.sockets.bookL); }
        else put(m, mount('hipR'));
      } else {
        if (drawn) put(m, c.sockets.handL);
        else put(m, mount(mt === 'dagger' ? 'hipL' : 'hipR'));
      }
    }
  }
  anim.onSheath = (drawn) => attachWeapons(drawn);

  applyGear(o.gear);
  c.stats.ms = performance.now() - t0; c.stats.baseMs = base.ms;

  const _v = new THREE.Vector3();
  c.update = (dt, state = {}) => {
    const P = anim.update(dt, state);
    U.uFaceTile.value.set((P.face & 1) * 0.5, (P.face >> 1) * 0.5);
    U.uCast.value.w = anim.castW * (0.3 + 0.12 * Math.sin(anim.t * 9));
    if (wm.off?.userData.float) { wm.off.position.y = 0.03 + Math.sin(anim.t * 2.4) * 0.02; wm.off.rotation.y += dt * 1.2; }
    if (wm.string && wm.main) {
      const pos = wm.string.geometry.attributes.position, info = wm.main.userData.info;
      const draw = anim.action?.name === 'shoot' ? (anim.ctx.bowDraw || 0) : 0;
      if (draw > 0.01) {
        bones[B.handR].updateWorldMatrix(true, false); wm.main.updateWorldMatrix(true, false);
        _v.set(0, 0, 0); bones[B.handR].localToWorld(_v); wm.main.worldToLocal(_v);
        pos.setXYZ(1, _v.x * draw, _v.y * draw, info.stringTop[2] + (_v.z - info.stringTop[2]) * draw);
      } else pos.setXYZ(1, info.stringTop[0], 0, info.stringTop[2]);
      pos.needsUpdate = true;
    }
  };
  c.play = (name, opt) => anim.play(name, opt);
  c.setGear = (gear) => { o.gear = gear; applyGear(gear); };
  c.setTint = (hex, amount = 0.5) => { const col = new THREE.Color(hex); U.uTint.value.set(col.r, col.g, col.b, amount); };
  c.setCastColor = (hex) => { const col = new THREE.Color(hex); U.uCast.value.x = col.r; U.uCast.value.y = col.g; U.uCast.value.z = col.b; };
  c.dispose = () => {
    root.parent?.remove(root);
    mesh.geometry.dispose(); matSkinned.dispose(); matRigid.dispose(); skeleton.dispose();
    if (wm.string) wm.string.geometry.dispose();
  };
  c.weapons = wm;
  c.setCastColor(o.cls === 'priest' || o.cls === 'paladin' ? 0xffe6a0 : o.cls === 'mage' ? 0x9ab8ff : 0xc0ffd0);
  anim.update(0, {});
  return c;
}
const STRING_MAT = new THREE.LineBasicMaterial({ color: 0xe8e0d0 });

/** Build caches for one appearance+gear synchronously (creates and disposes a throwaway character). */
export function warmHumanoid(opts) { const c = createHumanoid(opts); c.dispose(); }

/**
 * Fill geometry caches progressively during loading so later createHumanoid() calls cost ~1 ms.
 * Yields to the event loop between items. Returns a Promise.
 * opts: { races, sexes, hair: true, beards: true, hoods: true, gear: ['warrior:1', 'npc:villager', ...], onProgress(f) }
 */
export async function prewarmHumanoids(opts = {}) {
  const races = opts.races || Object.keys(RACES), sexes = opts.sexes || ['m', 'f'];
  const tasks = [];
  for (const r of races) for (const s of sexes) {
    tasks.push(() => getBase(r, s));
    const key = `${r}_${s}`;
    if (opts.hair !== false) HAIR_STYLES[key].forEach(st => tasks.push(() => hairPiece(getBase(r, s), st)));
    if (opts.beards !== false && s === 'm') BEARD_STYLES.forEach(st => tasks.push(() => beardPiece(getBase(r, s), st)));
    if (opts.hoods !== false) tasks.push(() => hoodPiece(getBase(r, s)));
    if (opts.faces !== false) for (let f = 0; f < FACE_COUNT; f++) tasks.push(() => faceTexture(getBase(r, s), f));
    for (const g of opts.gear || []) tasks.push(() => warmHumanoid({ race: r, sex: s, gear: g, hair: 0 }));
  }
  // yield every ~40 ms rather than after every task: nested setTimeout(0) is clamped to 4 ms, which added up to
  // about a second of idle time across a few hundred small tasks
  let slice = performance.now();
  for (let i = 0; i < tasks.length; i++) {
    tasks[i]();
    if (performance.now() - slice > 40 || i === tasks.length - 1) { opts.onProgress?.((i + 1) / tasks.length); await new Promise(res => setTimeout(res, 0)); slice = performance.now(); }
  }
}
