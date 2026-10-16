import * as THREE from 'three';

function hash3(x: number, y: number, z: number): number {
  const s = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453;
  return s - Math.floor(s);
}

/**
 * A box that has been through a washing machine: pillowy rounded edges, normals to match, and a slight
 * wobble so no two edges are quite straight. It is a BoxGeometry underneath, so anything that merges
 * or measures boxes still works. `round` is the corner radius as a fraction of the shortest side.
 */
export class SoftBox extends THREE.BoxGeometry {
  constructor(w = 1, h = 1, d = 1, round = 0.34, wobble = 0.04) {
    super(w, h, d, 3, 3, 3);
    const hx = w / 2;
    const hy = h / 2;
    const hz = d / 2;
    const m = Math.min(w, h, d);
    const r = m * round;
    const pos = this.attributes.position;
    const nor = this.attributes.normal;
    // the three grid lines per axis sit at -half, -half/3, half/3, half: move the inner two to where the curve starts
    const snap = (v: number, half: number) => (Math.abs(v) > half * 0.9 ? Math.sign(v) * half : Math.sign(v) * (half - r));
    const v = new THREE.Vector3();
    const inner = new THREE.Vector3();
    const dir = new THREE.Vector3();
    const wob = m * wobble;
    for (let i = 0; i < pos.count; i++) {
      v.set(snap(pos.getX(i), hx), snap(pos.getY(i), hy), snap(pos.getZ(i), hz));
      inner.set(Math.max(-(hx - r), Math.min(hx - r, v.x)), Math.max(-(hy - r), Math.min(hy - r, v.y)), Math.max(-(hz - r), Math.min(hz - r, v.z)));
      dir.subVectors(v, inner);
      const len = dir.length();
      if (len > 1e-6) {
        dir.divideScalar(len);
        v.copy(inner).addScaledVector(dir, r);
        nor.setXYZ(i, dir.x, dir.y, dir.z);
      }
      // same position -> same wobble, so seams stay closed
      pos.setXYZ(
        i,
        v.x + (hash3(v.x * 13, v.y * 7, v.z * 11) - 0.5) * wob,
        v.y + (hash3(v.y * 17, v.z * 5, v.x * 3) - 0.5) * wob,
        v.z + (hash3(v.z * 19, v.x * 9, v.y * 13) - 0.5) * wob,
      );
    }
    pos.needsUpdate = true;
    nor.needsUpdate = true;
  }
}

/** A 4-step light ramp, so shading falls in flat patches like a painted cartoon. */
const ramp = new Uint8Array([88, 150, 210, 255]);
const gradient = new THREE.DataTexture(ramp, ramp.length, 1, THREE.RedFormat);
gradient.minFilter = gradient.magFilter = THREE.NearestFilter;
gradient.generateMipmaps = false;
gradient.needsUpdate = true;

/**
 * The game's one material: cel-shaded. It stands in for a Lambert material (same colour/emissive/map
 * options), so the rest of the code does not care.
 */
export function toon(params: THREE.MeshToonMaterialParameters = {}): THREE.MeshLambertMaterial {
  return new THREE.MeshToonMaterial({ gradientMap: gradient, ...params }) as unknown as THREE.MeshLambertMaterial;
}

/** A tileable "brush strokes on paper" texture, used for the ground and for stone and wood. */
export function makePaintTexture(lo = 170, size = 128): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = `rgb(${Math.round((lo + 255) / 2)},${Math.round((lo + 255) / 2)},${Math.round((lo + 255) / 2)})`;
  ctx.fillRect(0, 0, size, size);
  for (let i = 0; i < 260; i++) {
    const x = Math.random() * size;
    const y = Math.random() * size;
    const v = lo + Math.floor(Math.random() * (255 - lo));
    const alpha = 0.18 + Math.random() * 0.25;
    const width = 2 + Math.random() * 7;
    const a = Math.random() * Math.PI;
    const len = 8 + Math.random() * 26;
    ctx.strokeStyle = `rgba(${v},${v},${v},${alpha})`;
    ctx.lineWidth = width;
    ctx.lineCap = 'round';
    // draw wrapped copies near the edges so the tile has no seams
    for (const ox of [-size, 0, size]) {
      for (const oy of [-size, 0, size]) {
        ctx.beginPath();
        ctx.moveTo(x + ox, y + oy);
        ctx.quadraticCurveTo(x + ox + Math.cos(a + 0.7) * len * 0.6, y + oy + Math.sin(a + 0.7) * len * 0.6, x + ox + Math.cos(a) * len, y + oy + Math.sin(a) * len);
        ctx.stroke();
      }
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}
