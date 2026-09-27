// Spline camera paths for the title screen flyover and the character-select stage.
import * as THREE from 'three';

const P = (x, y, z) => new THREE.Vector3(x, y, z);

// Title loop: over Dawnhollow's roofs → past the waterfall → up the Ember Road → a slow reveal of the peak.
export const TITLE_PATH = {
  pos: [P(-60, 38, 250), P(-20, 22, 190), P(20, 18, 150), P(-10, 26, 90), P(-40, 20, 20), P(-60, 16, -60), P(-10, 48, -92), P(40, 56, -150), P(60, 70, -120), P(20, 60, 60), P(-60, 38, 250)],
  look: [P(10, 6, 150), P(10, 8, 140), P(-20, 8, 100), P(-60, 6, -20), P(-70, 12, -100), P(-70, 20, -112), P(0, 60, -300), P(0, 120, -410), P(0, 130, -410), P(10, 20, 150), P(10, 6, 150)],
  dur: 95,
};

export class CinematicCam {
  constructor(camera) {
    this.camera = camera; this.t = 0; this.path = null;
    this.curveP = null; this.curveL = null;
  }
  play(path, t0 = 0) {
    this.path = path; this.t = t0;
    this.curveP = new THREE.CatmullRomCurve3(path.pos, false, 'centripetal');
    this.curveL = new THREE.CatmullRomCurve3(path.look, false, 'centripetal');
  }
  update(dt, heightAt) {
    if (!this.path) return;
    this.t += dt;
    const u = (this.t / this.path.dur) % 1;
    const e = u; // constant speed along the path
    const p = this.curveP.getPoint(e), l = this.curveL.getPoint(e);
    if (heightAt) p.y = Math.max(p.y, heightAt(p.x, p.z) + 6);
    this.camera.position.copy(p);
    this.camera.lookAt(l);
  }
}

// A scenic stage for character creation: a grassy knoll west of town, the valley and peak behind.
export const STAGE = { pos: P(-24, 0, 66), face: Math.PI * 1.06, cam: { dist: 4.4, height: 1.2, side: 0.9 } };
