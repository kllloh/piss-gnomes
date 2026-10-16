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
/** 0 = plain hard-edged boxes (PlayStation 2 look). Raise it for pillowy shapes. */
export const SOFTNESS = 0;

export class SoftBox extends THREE.BoxGeometry {
  constructor(w = 1, h = 1, d = 1, round = 0.34, wobble = 0.04) {
    super(w, h, d, SOFTNESS > 0 ? 3 : 1, SOFTNESS > 0 ? 3 : 1, SOFTNESS > 0 ? 3 : 1);
    if (SOFTNESS <= 0) return;
    round *= SOFTNESS;
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

/** The game's one material: plain lit colour, like a PS2 vertex-lit surface. */
export function lit(params: THREE.MeshLambertMaterialParameters = {}): THREE.MeshLambertMaterial {
  return new THREE.MeshLambertMaterial(params);
}

/** A tiny, chunky, low-res texture (nearest-neighbour, so the pixels show), used for ground, stone and wood. */
export function makePaintTexture(lo = 170, size = 32): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d')!;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const v = lo + Math.floor(Math.random() * (255 - lo));
      ctx.fillStyle = `rgb(${v},${v},${v})`;
      ctx.fillRect(x, y, 1, 1);
    }
  }
  // a few 2x2 and 3x2 clumps, the way old game textures have
  for (let i = 0; i < size * 1.4; i++) {
    const v = lo + Math.floor(Math.random() * (255 - lo));
    ctx.fillStyle = `rgb(${v},${v},${v})`;
    ctx.fillRect(Math.floor(Math.random() * size), Math.floor(Math.random() * size), 2 + Math.floor(Math.random() * 2), 2);
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.magFilter = THREE.NearestFilter;
  t.minFilter = THREE.NearestMipmapLinearFilter;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
