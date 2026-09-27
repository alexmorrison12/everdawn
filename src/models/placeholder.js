// Stand-in rigs that satisfy the character contract until the real generators are wired in.
import * as THREE from 'three';
import { lambert } from '../engine/materials.js';

const mats = new Map();
const mat = (hex) => { if (!mats.has(hex)) mats.set(hex, lambert({ color: hex }, { rim: 0.3, key: 'ph' })); return mats.get(hex); };

export function createPlaceholder({ height = 1.8, radius = 0.45, color = 0xc04030, quad = false } = {}) {
  const root = new THREE.Group();
  const body = new THREE.Mesh(quad ? new THREE.CapsuleGeometry(radius * 0.8, height * 0.6, 4, 10) : new THREE.CapsuleGeometry(radius, Math.max(0.1, height - radius * 2), 4, 10), mat(color));
  if (quad) { body.rotation.x = Math.PI / 2; body.position.y = height * 0.5; }
  else body.position.y = height / 2;
  body.castShadow = true;
  root.add(body);
  const nose = new THREE.Mesh(new THREE.BoxGeometry(radius * 0.5, radius * 0.4, radius * 0.9), mat(0x222222));
  nose.position.set(0, height * (quad ? 0.55 : 0.8), -radius * (quad ? 1.6 : 0.9)); root.add(nose);
  const head = new THREE.Object3D(); head.position.y = height; root.add(head);
  const handR = new THREE.Object3D(); handR.position.set(radius, height * 0.55, -0.2); root.add(handR);
  const handL = new THREE.Object3D(); handL.position.set(-radius, height * 0.55, -0.2); root.add(handL);
  let t = 0, dead = false, action = null, actT = 0;
  return {
    root, height, radius, sockets: { head, handR, handL, chest: body, back: body, mouth: head },
    update(dt, s) {
      t += dt * (1 + Math.abs(s.speed || 0) * 0.5);
      if (s.dead && !dead) { dead = true; }
      if (dead) { body.rotation.z = Math.min(Math.PI / 2, body.rotation.z + dt * 4); body.position.y = Math.max(radius, body.position.y - dt * 3); return; }
      body.position.y = (quad ? height * 0.5 : height / 2) + Math.abs(Math.sin(t * 6)) * (Math.abs(s.speed) > 0.1 ? 0.08 : 0.01);
      if (action) { actT += dt; body.rotation.x = (quad ? Math.PI / 2 : 0) - Math.sin(Math.min(1, actT / 0.35) * Math.PI) * 0.4; if (actT > 0.4) action = null; }
    },
    play(a) { action = a; actT = 0; },
    setTint() {},
    dispose() {},
  };
}
