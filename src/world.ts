import * as THREE from 'three';

export interface AABB {
  min: THREE.Vector3;
  max: THREE.Vector3;
}

type Axis = 'x' | 'y' | 'z';

const EPS = 0.001;
const TILE = 2;

export function makeNoiseTexture(size = 16, lo = 205): THREE.CanvasTexture {
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
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.magFilter = THREE.NearestFilter;
  t.minFilter = THREE.NearestMipmapLinearFilter;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Distance along the ray to the box, or Infinity if missed. */
export function rayAABB(o: THREE.Vector3, d: THREE.Vector3, min: THREE.Vector3, max: THREE.Vector3): number {
  let tmin = 0;
  let tmax = Infinity;
  for (const a of ['x', 'y', 'z'] as const) {
    if (d[a] === 0) {
      if (o[a] < min[a] || o[a] > max[a]) return Infinity;
      continue;
    }
    const inv = 1 / d[a];
    let t1 = (min[a] - o[a]) * inv;
    let t2 = (max[a] - o[a]) * inv;
    if (t1 > t2) [t1, t2] = [t2, t1];
    if (t1 > tmin) tmin = t1;
    if (t2 < tmax) tmax = t2;
    if (tmin > tmax) return Infinity;
  }
  return tmin;
}

/**
 * Static scenery for a big map. Colliders live in a uniform grid so that raycasts, movement and
 * droplet checks only look at the few blocks near them (the forest has ~1000 of them).
 */
export class World {
  readonly colliders: AABB[] = [];
  readonly group = new THREE.Group();
  readonly half: number;

  private readonly cell = 6;
  private readonly nx: number;
  private grid: number[][];
  private stamp = new Int32Array(4096);
  private stampId = 0;
  private mats = new Map<number, THREE.MeshLambertMaterial>();
  private tex = makeNoiseTexture(16);

  constructor(half = 110) {
    this.half = half;
    this.nx = Math.ceil((2 * half) / this.cell) + 2;
    this.grid = Array.from({ length: this.nx * this.nx }, () => []);
  }

  private ci(v: number): number {
    const c = Math.floor((v + this.half) / this.cell) + 1;
    return c < 0 ? 0 : c >= this.nx ? this.nx - 1 : c;
  }

  /** Register a solid block (movement, bullets-of-pee and sight all stop at it). */
  addCollider(min: THREE.Vector3, max: THREE.Vector3): AABB {
    const c: AABB = { min, max };
    const id = this.colliders.length;
    this.colliders.push(c);
    if (id >= this.stamp.length) {
      const bigger = new Int32Array(this.stamp.length * 2);
      bigger.set(this.stamp);
      this.stamp = bigger;
    }
    const x0 = this.ci(min.x), x1 = this.ci(max.x), z0 = this.ci(min.z), z1 = this.ci(max.z);
    for (let cz = z0; cz <= z1; cz++) for (let cx = x0; cx <= x1; cx++) this.grid[cz * this.nx + cx].push(id);
    return c;
  }

  private mat(color: number): THREE.MeshLambertMaterial {
    let m = this.mats.get(color);
    if (!m) {
      m = new THREE.MeshLambertMaterial({ color, map: this.tex });
      this.mats.set(color, m);
    }
    return m;
  }

  /** A block with a mesh. (cx, cz) is the footprint centre, y0 the base height. */
  box(cx: number, y0: number, cz: number, w: number, h: number, d: number, color: number, solid = true): THREE.Mesh {
    const g = new THREE.BoxGeometry(w, h, d);
    const uv = g.attributes.uv as THREE.BufferAttribute;
    const dims: [number, number][] = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
    for (let f = 0; f < 6; f++) {
      for (let v = 0; v < 4; v++) {
        const i = f * 4 + v;
        uv.setXY(i, (uv.getX(i) * dims[f][0]) / TILE, (uv.getY(i) * dims[f][1]) / TILE);
      }
    }
    const mesh = new THREE.Mesh(g, this.mat(color));
    mesh.position.set(cx, y0 + h / 2, cz);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    this.group.add(mesh);
    if (solid) this.addCollider(new THREE.Vector3(cx - w / 2, y0, cz - d / 2), new THREE.Vector3(cx + w / 2, y0 + h, cz + d / 2));
    return mesh;
  }

  /** Nearest hit distance along the ray (blocks + ground), or Infinity. */
  raycast(o: THREE.Vector3, dir: THREE.Vector3, maxT = Infinity): number {
    let best = maxT;
    if (dir.y < 0) {
      const tg = -o.y / dir.y;
      if (tg > 0 && tg < best) best = tg;
    }
    const limit = Math.min(best, 500);
    const cs = this.cell;
    const h = this.half;
    const dx = dir.x;
    const dz = dir.z;
    let cx = this.ci(o.x);
    let cz = this.ci(o.z);
    const sx = dx > 0 ? 1 : -1;
    const sz = dz > 0 ? 1 : -1;
    let tMaxX = dx !== 0 ? (((dx > 0 ? cx : cx - 1) * cs - h) - o.x) / dx : Infinity;
    let tMaxZ = dz !== 0 ? (((dz > 0 ? cz : cz - 1) * cs - h) - o.z) / dz : Infinity;
    const tDx = dx !== 0 ? cs / Math.abs(dx) : Infinity;
    const tDz = dz !== 0 ? cs / Math.abs(dz) : Infinity;
    const stamp = ++this.stampId;
    for (let guard = 0; guard < 400; guard++) {
      const list = this.grid[cz * this.nx + cx];
      for (let k = 0; k < list.length; k++) {
        const id = list[k];
        if (this.stamp[id] === stamp) continue;
        this.stamp[id] = stamp;
        const b = this.colliders[id];
        const t = rayAABB(o, dir, b.min, b.max);
        if (t < best) best = t;
      }
      const tExit = Math.min(tMaxX, tMaxZ);
      if (best <= tExit || tExit > limit) break;
      if (tMaxX < tMaxZ) { cx += sx; tMaxX += tDx; } else { cz += sz; tMaxZ += tDz; }
      if (cx < 0 || cz < 0 || cx >= this.nx || cz >= this.nx) break;
    }
    return best === maxT && maxT !== Infinity ? Infinity : best;
  }

  /** Is this point inside any block? (used for droplets) */
  pointHit(p: THREE.Vector3): boolean {
    const list = this.grid[this.ci(p.z) * this.nx + this.ci(p.x)];
    for (let k = 0; k < list.length; k++) {
      const b = this.colliders[list[k]];
      if (p.x > b.min.x && p.x < b.max.x && p.y > b.min.y && p.y < b.max.y && p.z > b.min.z && p.z < b.max.z) return true;
    }
    return false;
  }

  /** Move a box (feet-centre `pos`, half-width `hw`, height `h`) along one axis, sliding out of blocks. */
  moveAxis(pos: THREE.Vector3, hw: number, h: number, axis: Axis, d: number): boolean {
    if (d === 0) return false;
    pos[axis] += d;
    let hit = false;
    const x0 = this.ci(pos.x - hw), x1 = this.ci(pos.x + hw), z0 = this.ci(pos.z - hw), z1 = this.ci(pos.z + hw);
    const stamp = ++this.stampId;
    for (let cz = z0; cz <= z1; cz++) {
      for (let cx = x0; cx <= x1; cx++) {
        const list = this.grid[cz * this.nx + cx];
        for (let k = 0; k < list.length; k++) {
          const id = list[k];
          if (this.stamp[id] === stamp) continue;
          this.stamp[id] = stamp;
          const b = this.colliders[id];
          if (
            pos.x + hw <= b.min.x || pos.x - hw >= b.max.x ||
            pos.z + hw <= b.min.z || pos.z - hw >= b.max.z ||
            pos.y + h <= b.min.y || pos.y >= b.max.y
          ) continue;
          hit = true;
          if (axis === 'y') pos.y = d > 0 ? b.min.y - h - EPS : b.max.y;
          else if (d > 0) pos[axis] = b.min[axis] - hw - EPS;
          else pos[axis] = b.max[axis] + hw + EPS;
        }
      }
    }
    return hit;
  }
}
