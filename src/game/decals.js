// World-space UI: the selection ring under the current target (red hostile / yellow neutral / green friendly),
// and a soft blob shadow helper.
import * as THREE from 'three';

export class SelectionRing {
  constructor(scene) {
    const g = new THREE.RingGeometry(0.86, 1.0, 48, 1); g.rotateX(-Math.PI / 2);
    this.mat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4,
      uniforms: { uColor: { value: new THREE.Color(1, 0.2, 0.2) }, uTime: { value: 0 } },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: `uniform vec3 uColor; uniform float uTime; varying vec2 vUv;
        void main(){ float a = 0.75 + 0.25 * sin(uTime * 4.0); gl_FragColor = vec4(uColor * 2.2, a); }`,
    });
    this.mesh = new THREE.Mesh(g, this.mat); this.mesh.renderOrder = 8; this.mesh.visible = false;
    scene.add(this.mesh);
  }
  attach(scene) { scene.add(this.mesh); }
  update(dt, unit, player, heightAt) {
    const m = this.mesh;
    if (!unit || !unit.model) { m.visible = false; return; }
    m.visible = true;
    const r = Math.max(0.7, (unit.radius || 0.5) * 1.35 + 0.25);
    m.scale.setScalar(r);
    m.position.set(unit.pos.x, (unit.flying ? heightAt(unit.pos.x, unit.pos.z) : unit.pos.y) + 0.08, unit.pos.z);
    this.mat.uniforms.uTime.value += dt;
    const c = this.mat.uniforms.uColor.value;
    if (unit.dead) c.setRGB(0.5, 0.5, 0.5);
    else if (player.isEnemy(unit)) c.setRGB(1, 0.12, 0.08);
    else if (unit.kind === 'npc' || unit.kind === 'sim' || unit.kind === 'player' || unit.kind === 'remote') c.setRGB(0.2, 1, 0.25);
    else c.setRGB(1, 0.85, 0.1);
  }
}
