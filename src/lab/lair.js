import * as THREE from 'three';
import { Renderer } from '../engine/renderer.js';
import { G } from '../engine/materials.js';
import { Terrain } from '../world/terrain.js';
import { Lair } from '../world/lair.js';
// G.uNoiseTex is created by Terrain; make a tiny stand-in via a fake terrain texture build
import { Simplex } from '../core/noise.js';
const q = new URLSearchParams(location.search);
{ // noise texture
  const nz = new Simplex(99), NS = 256, nd = new Uint8Array(NS * NS * 4);
  for (let y = 0; y < NS; y++) for (let x = 0; x < NS; x++) { const u = x / NS, v = y / NS, k = (y * NS + x) * 4; const f = (fr, o) => nz.noise3(Math.cos(u * 6.2832) * fr + o, Math.sin(u * 6.2832) * fr, Math.cos(v * 6.2832) * fr + Math.sin(v * 6.2832) * fr * 0.7 + o * 3); nd[k] = (f(1.2, 0) * 0.5 + 0.5) * 255; nd[k + 1] = (f(3, 5) * 0.5 + 0.5) * 255; nd[k + 2] = (f(8, 9) * 0.5 + 0.5) * 255; nd[k + 3] = 255; }
  const nt = new THREE.DataTexture(nd, NS, NS, THREE.RGBAFormat); nt.wrapS = nt.wrapT = THREE.RepeatWrapping; nt.magFilter = THREE.LinearFilter; nt.minFilter = THREE.LinearMipmapLinearFilter; nt.generateMipmaps = true; nt.needsUpdate = true;
  G.uNoiseTex = { value: nt };
}
const el = q.get('el') || 'ember';
const lair = new Lair(el, 3);
lair.applyAtmosphere();
const r = new Renderer(document.body);
const cam = new THREE.PerspectiveCamera(55, innerWidth / innerHeight, 0.2, 2000);
r.setScene(lair.scene, cam);
const pos = (q.get('cam') || '0,18,62').split(',').map(Number), look = (q.get('look') || '0,2,-20').split(',').map(Number);
cam.position.set(...pos); cam.lookAt(...look);
let t = 0;
function loop() { requestAnimationFrame(loop); t += 1 / 60; G.uTime.value = t; G.uCamPos.value.copy(cam.position); lair.update(1 / 60, cam); r.render(1 / 60, t); }
loop();
