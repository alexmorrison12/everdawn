// Renders WoW-style 3D head portraits of units into small canvases (unit frames, party/raid frames, share card).
// Uses the main renderer + a dedicated camera layer so only the subject (and the scene's lights) are drawn.
import * as THREE from 'three';

const LAYER = 3;
// linear → sRGB for the 8-bit read-back, as a table (a Math.pow per channel per pixel cost tens of ms on a 512² card)
const GAMMA = new Uint8Array(256).map((_, i) => Math.round(Math.pow(i / 255, 1 / 2.2) * 255));

export class Portraits {
  constructor(renderer) {
    this.r = renderer;
    this.size = 128;
    this.rt = new THREE.WebGLRenderTarget(this.size, this.size, { type: THREE.UnsignedByteType, samples: 4 });
    this.cam = new THREE.PerspectiveCamera(26, 1, 0.05, 50);
    this.cam.layers.set(LAYER);
    this.px = new Uint8Array(this.size * this.size * 4);
    this.cache = new Map();
    this.key = new THREE.DirectionalLight(0xfff0e0, 2.2); this.key.layers.set(LAYER);
    this.fill = new THREE.HemisphereLight(0xc8d8ff, 0x403020, 1.4); this.fill.layers.set(LAYER);
  }
  enable(obj, on) { obj.traverse(o => { if (on) o.layers.enable(LAYER); else o.layers.disable(LAYER); }); }

  /** Render unit's head into `canvas` (2D). opts.full = full-body shot (share card). */
  draw(unit, canvas, opts = {}) {
    const m = unit.model; if (!m || !canvas) return false;
    const scene = m.root.parent; if (!scene) return false;
    const head = m.sockets?.head;
    const target = new THREE.Vector3();
    if (head) head.getWorldPosition(target); else target.set(unit.pos.x, unit.pos.y + unit.height * 0.9, unit.pos.z);
    const fwd = new THREE.Vector3(-Math.sin(unit.facing), 0, -Math.cos(unit.facing));
    const scale = unit.boss ? 6 : unit.height > 2.5 ? unit.height / 2 : 1;
    if (opts.full) {
      target.set(unit.pos.x, unit.pos.y + unit.height * 0.55, unit.pos.z);
      this.cam.position.copy(target).addScaledVector(fwd, unit.height * 2.1).add(new THREE.Vector3(0, unit.height * 0.08, 0));
      this.cam.fov = 30;
    } else {
      this.cam.position.copy(target).addScaledVector(fwd, 1.15 * scale).add(new THREE.Vector3(0, 0.05 * scale, 0)).addScaledVector(new THREE.Vector3(-fwd.z, 0, fwd.x), 0.25 * scale);
      this.cam.fov = 26;
      target.y -= 0.04 * scale;
    }
    this.cam.updateProjectionMatrix();
    this.cam.lookAt(target);
    this.key.position.copy(this.cam.position).add(new THREE.Vector3(0.6, 1.2, 0.3)); this.key.target.position.copy(target);
    scene.add(this.key, this.key.target, this.fill);
    this.enable(m.root, true);
    const r = this.r, prevRT = r.getRenderTarget(), prevClear = r.getClearColor(new THREE.Color()), prevAlpha = r.getClearAlpha();
    const w = opts.full ? 512 : this.size;
    const rt = opts.full ? (this.rtFull ||= new THREE.WebGLRenderTarget(512, 512, { samples: 4 })) : this.rt;
    r.setRenderTarget(rt);
    r.setClearColor(0x000000, 0); r.clear();
    const bgWas = scene.background; scene.background = null;
    const fogCam = this.cam;
    r.render(scene, fogCam);
    scene.background = bgWas;
    const px = opts.full ? (this.pxFull ||= new Uint8Array(512 * 512 * 4)) : this.px;
    r.readRenderTargetPixels(rt, 0, 0, w, w, px);
    r.setRenderTarget(prevRT); r.setClearColor(prevClear, prevAlpha);
    this.enable(m.root, false);
    scene.remove(this.key, this.key.target, this.fill);
    // flip Y + gamma into the 2D canvas
    const ctx = canvas.getContext('2d');
    const buf = (this.bufs ||= {})[w] ||= (() => { const c = document.createElement('canvas'); c.width = c.height = w; const cx = c.getContext('2d'); return { c, cx, img: cx.createImageData(w, w) }; })();
    const d = buf.img.data;
    for (let y = 0; y < w; y++) {
      const src = (w - 1 - y) * w * 4, dst = y * w * 4;
      for (let x = 0; x < w * 4; x += 4) {
        d[dst + x] = GAMMA[px[src + x]]; d[dst + x + 1] = GAMMA[px[src + x + 1]]; d[dst + x + 2] = GAMMA[px[src + x + 2]]; d[dst + x + 3] = px[src + x + 3];
      }
    }
    buf.cx.putImageData(buf.img, 0, 0); const tmp = buf.c;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (!opts.transparent) { const g = ctx.createRadialGradient(canvas.width / 2, canvas.height * 0.4, 4, canvas.width / 2, canvas.height / 2, canvas.width * 0.7); g.addColorStop(0, '#3a3024'); g.addColorStop(1, '#0c0a08'); ctx.fillStyle = g; ctx.fillRect(0, 0, canvas.width, canvas.height); }
    ctx.drawImage(tmp, 0, 0, canvas.width, canvas.height);
    return true;
  }
}
