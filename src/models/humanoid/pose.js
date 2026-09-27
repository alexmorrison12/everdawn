// Pose buffer + authoring helpers (see anim.js for sign conventions).
import { B, NB } from './rig.js';

export class Pose {
  constructor() {
    this.r = new Float32Array(NB * 3);
    this.hip = new Float32Array(3);       // hips offset from rest (character space)
    this.feet = new Float32Array(10);     // L: x,y,z,pitch,yaw  R: x,y,z,pitch,yaw (ankle targets, character space)
    this.toe = new Float32Array(2);
    this.ikw = 1;                         // leg IK weight (0 = FK leg angles)
    this.face = 0;                        // 0 normal, 1 blink, 2 mouth open, 3 laugh
  }
  clear() { this.r.fill(0); this.hip.fill(0); this.feet.fill(0); this.toe.fill(0); this.ikw = 1; this.face = 0; return this; }
  copy(p) { this.r.set(p.r); this.hip.set(p.hip); this.feet.set(p.feet); this.toe.set(p.toe); this.ikw = p.ikw; this.face = p.face; return this; }
  lerp(p, w, mask = null) {
    if (w <= 0) return this;
    const r = this.r, q = p.r;
    if (mask) { for (let b = 0; b < NB; b++) { const m = mask[b] * w; if (m <= 0) continue; const o = b * 3; r[o] += (q[o] - r[o]) * m; r[o + 1] += (q[o + 1] - r[o + 1]) * m; r[o + 2] += (q[o + 2] - r[o + 2]) * m; } }
    else for (let i = 0; i < r.length; i++) r[i] += (q[i] - r[i]) * w;
    const wl = mask ? w * (mask[B.thighL] > 0 ? 1 : 0) : w;
    if (wl > 0) {
      for (let i = 0; i < 3; i++) this.hip[i] += (p.hip[i] - this.hip[i]) * wl;
      for (let i = 0; i < 10; i++) this.feet[i] += (p.feet[i] - this.feet[i]) * wl;
      for (let i = 0; i < 2; i++) this.toe[i] += (p.toe[i] - this.toe[i]) * wl;
      this.ikw += (p.ikw - this.ikw) * wl;
    }
    if (w > 0.5 && p.face) this.face = p.face;
    return this;
  }
  set(b, x, y, z) { const o = b * 3; this.r[o] = x; this.r[o + 1] = y; this.r[o + 2] = z; return this; }
  add(b, x, y, z) { const o = b * 3; this.r[o] += x; this.r[o + 1] += y; this.r[o + 2] += z; return this; }
}

// ---- pose helpers ------------------------------------------------------------------------------
export function setArm(p, s, swing, abd, twist, elbow, wflex = 0, wdev = 0, curl = 0.35, farmTwist = 0) {
  const sg = s === 'R' ? 1 : -1;
  p.set(B['uarm' + s], swing, sg * twist, sg * abd);
  p.set(B['farm' + s], elbow, sg * farmTwist, 0);
  p.set(B['hand' + s], wdev, 0, -sg * wflex);
  setFingers(p, s, curl);
}
export function setFingers(p, s, curl, idx = curl, thumb = curl * 0.8) {
  const sg = s === 'R' ? 1 : -1;
  p.set(B['idx' + s + '1'], 0, 0, -sg * idx * 1.1); p.set(B['idx' + s + '2'], 0, 0, -sg * idx * 1.3);
  p.set(B['fng' + s + '1'], 0, 0, -sg * curl * 1.15); p.set(B['fng' + s + '2'], 0, 0, -sg * curl * 1.35);
  p.set(B['thb' + s + '1'], -thumb * 0.3, sg * thumb * 0.5, -sg * thumb * 0.5); p.set(B['thb' + s + '2'], 0, 0, -sg * thumb * 0.7);
}
export function setClav(p, s, raise, fwd = 0) { const sg = s === 'R' ? 1 : -1; p.set(B['clav' + s], 0, -sg * fwd, sg * raise); }
export function setTorso(p, x, y, z, spread = [0.3, 0.35, 0.35]) { // distributes a bend over hips-less spine chain
  p.add(B.spine, x * spread[0], y * spread[0], z * spread[0]);
  p.add(B.chest, x * spread[1], y * spread[1], z * spread[1]);
  p.add(B.neck, x * spread[2] * 0.4, y * spread[2] * 0.4, z * spread[2] * 0.4);
}
export function stance(p, ctx, wid = 0, fwdL = 0, fwdR = 0, yawOut = 0.12) {
  const f = p.feet, R = ctx.rig;
  f[0] = -R.stanceX - wid; f[1] = R.ankleH; f[2] = -fwdL; f[3] = 0; f[4] = yawOut;
  f[5] = R.stanceX + wid; f[6] = R.ankleH; f[7] = -fwdR; f[8] = 0; f[9] = -yawOut;
}

