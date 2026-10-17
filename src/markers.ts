import * as THREE from 'three';
import type { Combatant } from './combat';

const MAX = 80;

/** Red arrows floating above every enemy, drawn on top of the scenery so they are easy to pick out. */
export class Markers {
  private geo = new THREE.BufferGeometry();
  private pos = new Float32Array(MAX * 3);
  private col = new Float32Array(MAX * 3);
  private points: THREE.Points;
  private mat: THREE.ShaderMaterial;

  constructor(scene: THREE.Scene) {
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const g = c.getContext('2d')!;
    // a chunky downward-pointing arrow with a dark outline
    g.beginPath();
    g.moveTo(8, 10);
    g.lineTo(56, 10);
    g.lineTo(32, 56);
    g.closePath();
    g.fillStyle = '#05020c';
    g.fill();
    g.beginPath();
    g.moveTo(16, 16);
    g.lineTo(48, 16);
    g.lineTo(32, 46);
    g.closePath();
    g.fillStyle = '#ffffff';
    g.fill();
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    this.geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    this.geo.setAttribute('color', new THREE.BufferAttribute(this.col, 3));
    this.geo.setDrawRange(0, 0);
    this.mat = new THREE.ShaderMaterial({
      uniforms: { map: { value: tex }, pxScale: { value: 1 } },
      vertexShader: `
        attribute vec3 color;
        varying vec3 vC;
        uniform float pxScale;
        void main() {
          vC = color;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_Position = projectionMatrix * mv;
          // a steady on-screen size, a little bigger when close
          gl_PointSize = clamp(420.0 / max(-mv.z, 1.0), 14.0, 34.0) * pxScale;
        }`,
      fragmentShader: `
        uniform sampler2D map;
        varying vec3 vC;
        void main() {
          vec4 t = texture2D(map, vec2(gl_PointCoord.x, 1.0 - gl_PointCoord.y));
          if (t.a < 0.2) discard;
          gl_FragColor = vec4(t.rgb * vC, 1.0);
        }`,
      transparent: true,
      depthTest: false,
      depthWrite: false,
    });
    this.points = new THREE.Points(this.geo, this.mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = 50;
    scene.add(this.points);
  }

  /** Put an arrow over each living enemy within range. */
  update(everyone: Combatant[], cam: THREE.Vector3, t: number, lift: (c: Combatant) => number, pxScale = 1, enabled = true) {
    this.mat.uniforms.pxScale.value = pxScale;
    let n = 0;
    if (enabled) {
      for (const c of everyone) {
        if (!c.alive || c.team !== 1 || c.isNpc) continue;
        const dx = c.pos.x - cam.x;
        const dz = c.pos.z - cam.z;
        const d2 = dx * dx + dz * dz;
        if (d2 > 100 * 100) continue;
        if (n >= MAX) break;
        const d = Math.sqrt(d2);
        this.pos[n * 3] = c.pos.x;
        this.pos[n * 3 + 1] = c.pos.y + lift(c) + 2.9 + Math.sin(t * 4 + c.id) * 0.12;
        this.pos[n * 3 + 2] = c.pos.z;
        const f = d > 60 ? 0.65 : 1; // far ones dim a little
        this.col[n * 3] = 1 * f;
        this.col[n * 3 + 1] = 0.22 * f;
        this.col[n * 3 + 2] = 0.22 * f;
        n++;
      }
    }
    this.geo.setDrawRange(0, n);
    (this.geo.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    (this.geo.attributes.color as THREE.BufferAttribute).needsUpdate = true;
  }
}
