// Everdawn raid dragon — SDF-sculpted, skinned and procedurally animated. Original design ("Everdawn wyrm").
//
// createDragon({ element, scale, seed, variant }) → character contract (ARCHITECTURE.md) plus:
//   sockets: { mouth, head, chest, tail, wingL, wingR, rider }  — Object3Ds parented to bones.
//            mouth: breath/projectiles travel along the socket's local -Z (world dir: socket.getWorldDirection
//            returns +Z in three.js, so use v.set(0,0,-1).transformDirection(mouth.matrixWorld)). Its origin sits
//            between the jaws and it pitches down with half the jaw angle.
//   update(dt, state)  state: { speed, turn, grounded, flying, altitude, dead, combat, enraged,
//                               (optional) sleep, glide, hover }
//   play(action, { speed })  actions: roar bite cleave tailSwipe breath takeoff land deepBreath stagger enrage wake death
//   setLookTarget(v3|null), onStep = fn({ foot, position, strength }), setGlow(0..2), setTint(hex, amount)
import * as THREE from 'three';
import { buildDragonGeometry } from './dragon/build.js';
import { createDragonMaterials } from './dragon/material.js';
import { DragonAnimator, ACTIONS } from './dragon/anim.js';
import { headToModel } from './dragon/shape.js';

const CACHE = new Map();

export function createDragon({ element = 'ember', scale = 1, seed = 0, variant = 'boss' } = {}) {
  const key = `${element}|${seed}|${variant}`;
  let g = CACHE.get(key);
  if (!g) { g = buildDragonGeometry({ element, seed, variant }); CACHE.set(key, g); }
  const rig = g.rig, S = rig.S, J = rig.J, I = rig.idx;
  const root = new THREE.Object3D();
  root.name = 'dragon-' + element;
  const bones = rig.bones.map(b => { const bo = new THREE.Bone(); bo.name = b.name; return bo; });
  rig.bones.forEach((b, i) => {
    const p = b.pos;
    if (b.parent < 0) { bones[i].position.set(p[0] * S, p[1] * S, p[2] * S); root.add(bones[i]); }
    else { const pp = rig.bones[b.parent].pos; bones[i].position.set((p[0] - pp[0]) * S, (p[1] - pp[1]) * S, (p[2] - pp[2]) * S); bones[b.parent].add(bones[i]); }
  });
  root.updateMatrixWorld(true);
  const skeleton = new THREE.Skeleton(bones);
  const mats = createDragonMaterials(g.pal, { S, eyes: g.eyes, tatter: g.style.tatter });
  const mesh = new THREE.SkinnedMesh(g.geo, mats.body);
  const wingMesh = new THREE.SkinnedMesh(g.wingGeo, mats.wing);
  for (const m of [mesh, wingMesh]) {
    m.castShadow = true; m.receiveShadow = true;
    root.add(m); m.bind(skeleton);
    // generous bounds (animation moves far from the bind pose)
    m.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 4 * S, 0), 16 * S);
    m.frustumCulled = variant !== 'boss';
  }
  wingMesh.name = 'wings'; mesh.name = 'body';

  // ---- sockets
  const sock = (name, boneName, modelPos) => {
    const o = new THREE.Object3D(); o.name = 'socket-' + name;
    const b = rig.bones[I[boneName]].pos;
    o.position.set((modelPos[0] - b[0]) * S, (modelPos[1] - b[1]) * S, (modelPos[2] - b[2]) * S);
    bones[I[boneName]].add(o); return o;
  };
  const mouthRest = headToModel(rig, [0, -0.3, -2.3]);
  const sockets = {
    mouth: sock('mouth', 'head', mouthRest),
    head: sock('head', 'head', headToModel(rig, [0, 0.2, -0.9])),
    chest: sock('chest', 'chest', [0, J.chest[1] - 0.6, J.chest[2] - 1.1]),
    tail: sock('tail', 'tail12', J.tailEnd),
    wingL: sock('wingL', 'wingLf0b', J.wTL[0]),
    wingR: sock('wingR', 'wingRf0b', J.wTR[0]),
    rider: sock('rider', 'spine2', [0, J.spine2[1] + 1.25 * rig.P.girth, J.spine2[2] - 0.3]),
  };
  sockets.handL = sockets.wingL; sockets.handR = sockets.wingR; sockets.back = sockets.rider;
  const mouthBase = sockets.mouth.position.clone();
  const jawLen = 2.1 * rig.P.head * S;

  const anim = new DragonAnimator({ root, bones }, rig, mats);
  anim.glowBase = anim.glowCur = g.pal.hex.glowK ?? 1;
  root.scale.setScalar(scale);

  // height/radius in metres (scaled)
  const height = (J.head[1] + 0.9 * rig.P.head) * S * scale;
  const radius = 2.6 * S * scale * rig.P.girth;

  const api = {
    root, mesh, wingMesh, skeleton, bones, sockets, mats, stats: g.stats, variant, element,
    height, radius,
    actions: Object.keys(ACTIONS),
    get onStep() { return anim.onStep; },
    set onStep(fn) { anim.onStep = fn; },
    update(dt, state = {}) {
      anim.update(dt, state);
      // mouth socket follows the jaw: halfway down the gape, pitched by half the jaw angle
      const a = anim.jawAngle || 0;
      sockets.mouth.position.set(mouthBase.x, mouthBase.y - Math.sin(a) * jawLen * 0.45, mouthBase.z + (1 - Math.cos(a)) * jawLen * 0.3);
      sockets.mouth.rotation.set(-a * 0.5, 0, 0);
      if (api._tint > 0) { api._tint = Math.max(0, api._tint - dt * 4); mats.U.uFlash.value = api._tint * api._tintAmt; }
    },
    play(action, opts) { return anim.play(action, opts); },
    setLookTarget(v) { anim.setLookTarget(v); },
    setGlow(v) { anim.glowBase = Math.max(0, Math.min(2, v)) * (g.pal.hex.glowK ?? 1); },
    revive() { anim.revive(); },
    setTint(hex, amount = 0.6) { mats.U.uFlashColor.value.set(hex); api._tint = 1; api._tintAmt = amount; mats.U.uFlash.value = amount; },
    get anim() { return anim; },
    dispose() {
      mats.body.dispose(); mats.wing.dispose();
      root.removeFromParent();
      // geometry is cached/shared between instances of the same element/seed/variant
    },
  };
  api._tint = 0; api._tintAmt = 0;
  return api;
}

/** Drop cached geometry (e.g. after the raid). */
export function disposeDragonCache() { for (const g of CACHE.values()) { g.geo.dispose(); g.wingGeo.dispose(); } CACHE.clear(); }
