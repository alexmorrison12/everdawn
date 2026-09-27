// Spider webs strung around Webwood Hollow: canvas-drawn radial webs on double-sided alpha planes.
import * as THREE from 'three';
import { RNG } from '../core/noise.js';
import { PLACES } from './zone.js';

function webTexture() {
  const S = 256, cv = document.createElement('canvas'); cv.width = cv.height = S;
  const c = cv.getContext('2d'), rng = new RNG(66), cx = S / 2, cy = S / 2;
  c.strokeStyle = 'rgba(235,240,255,0.85)'; c.lineWidth = 1.3;
  const spokes = 14, ang = [];
  for (let i = 0; i < spokes; i++) ang.push(i / spokes * Math.PI * 2 + rng.range(-0.1, 0.1));
  for (const a of ang) { c.beginPath(); c.moveTo(cx, cy); c.lineTo(cx + Math.cos(a) * S * 0.49, cy + Math.sin(a) * S * 0.49); c.stroke(); }
  c.lineWidth = 1;
  for (let r = 8; r < S * 0.47; r += rng.range(6, 10)) {
    c.beginPath();
    ang.forEach((a, i) => { const rr = r * rng.range(0.94, 1.04), x = cx + Math.cos(a) * rr, y = cy + Math.sin(a) * rr + (i % 2) * 1.5; if (i === 0) c.moveTo(x, y); else c.lineTo(x, y); });
    c.closePath(); c.stroke();
  }
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function buildWebs(hf, forest) {
  const W = PLACES.webwood, rng = new RNG(99);
  const mat = new THREE.MeshBasicMaterial({ map: webTexture(), transparent: true, depthWrite: false, side: THREE.DoubleSide, opacity: 0.55, fog: false, toneMapped: false });
  mat.color.setRGB(1.1, 1.1, 1.25);
  const trees = (forest?.instances || []).filter(t => t.sp !== 'bush' && Math.hypot(t.x - W.x, t.z - W.z) < W.r);
  const geo = new THREE.PlaneGeometry(1, 1);
  const im = new THREE.InstancedMesh(geo, mat, Math.min(90, trees.length * 2));
  let n = 0; const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler();
  for (const t of trees) {
    for (let k = 0; k < 2 && n < im.count; k++) {
      const other = trees[Math.floor(rng.next() * trees.length)];
      const dx = other.x - t.x, dz = other.z - t.z, d = Math.hypot(dx, dz);
      let x, z, y, s, yaw;
      if (d > 2 && d < 9) { x = t.x + dx / 2; z = t.z + dz / 2; s = d * 0.9; yaw = Math.atan2(-dz, dx); }
      else { const a = rng.range(0, 6.28); x = t.x + Math.cos(a) * 1.4; z = t.z + Math.sin(a) * 1.4; s = rng.range(2, 3.5); yaw = a + Math.PI / 2; }
      y = hf.heightAt(x, z) + s * 0.5 + rng.range(0.5, 2.5);
      e.set(rng.range(-0.2, 0.2), yaw, rng.range(-0.3, 0.3)); q.setFromEuler(e);
      m.compose(new THREE.Vector3(x, y, z), q, new THREE.Vector3(s, s, s)); im.setMatrixAt(n++, m);
    }
  }
  im.count = n; im.renderOrder = 4; im.computeBoundingSphere();
  return im;
}
