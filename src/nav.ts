import * as THREE from 'three';
import type { World } from './world';

/** Binary min-heap of cell indices keyed by f-score. */
class Heap {
  private ids: number[] = [];
  private keys: number[] = [];
  get size() { return this.ids.length; }
  clear() { this.ids.length = 0; this.keys.length = 0; }
  push(id: number, key: number) {
    let i = this.ids.length;
    this.ids.push(id);
    this.keys.push(key);
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (this.keys[p] <= key) break;
      this.ids[i] = this.ids[p];
      this.keys[i] = this.keys[p];
      i = p;
    }
    this.ids[i] = id;
    this.keys[i] = key;
  }
  pop(): number {
    const top = this.ids[0];
    const lastId = this.ids.pop()!;
    const lastKey = this.keys.pop()!;
    const n = this.ids.length;
    if (n > 0) {
      let i = 0;
      for (;;) {
        let c = i * 2 + 1;
        if (c >= n) break;
        if (c + 1 < n && this.keys[c + 1] < this.keys[c]) c++;
        if (this.keys[c] >= lastKey) break;
        this.ids[i] = this.ids[c];
        this.keys[i] = this.keys[c];
        i = c;
      }
      this.ids[i] = lastId;
      this.keys[i] = lastKey;
    }
    return top;
  }
}

/** Coarse walkable grid over the whole forest (2m cells) with a heap-based A*. */
export class NavGrid {
  readonly cell: number;
  readonly n: number;
  readonly half: number;
  private blocked: Uint8Array;
  private g: Float32Array;
  private came: Int32Array;
  private seen: Int32Array;
  private closed: Int32Array;
  private version = 0;
  private heap = new Heap();

  constructor(world: World, cell = 2, radius = 0.55) {
    this.cell = cell;
    this.half = world.half;
    this.n = Math.ceil((2 * this.half) / cell);
    const n = this.n;
    this.blocked = new Uint8Array(n * n);
    this.g = new Float32Array(n * n);
    this.came = new Int32Array(n * n);
    this.seen = new Int32Array(n * n);
    this.closed = new Int32Array(n * n);
    for (const b of world.colliders) {
      if (b.min.y >= 1.7 || b.max.y <= 0.35) continue; // overhead or ankle-high
      const cx0 = Math.max(0, this.ci(b.min.x - radius) - 1);
      const cx1 = Math.min(n - 1, this.ci(b.max.x + radius) + 1);
      const cz0 = Math.max(0, this.ci(b.min.z - radius) - 1);
      const cz1 = Math.min(n - 1, this.ci(b.max.z + radius) + 1);
      for (let cz = cz0; cz <= cz1; cz++) {
        for (let cx = cx0; cx <= cx1; cx++) {
          const x = this.centre(cx);
          const z = this.centre(cz);
          if (x > b.min.x - radius && x < b.max.x + radius && z > b.min.z - radius && z < b.max.z + radius) {
            this.blocked[cz * n + cx] = 1;
          }
        }
      }
    }
  }

  private ci(v: number): number {
    return Math.floor((v + this.half) / this.cell);
  }
  private centre(c: number): number {
    return c * this.cell - this.half + this.cell / 2;
  }

  isFree(cx: number, cz: number): boolean {
    return cx >= 0 && cz >= 0 && cx < this.n && cz < this.n && this.blocked[cz * this.n + cx] === 0;
  }

  isFreeAt(x: number, z: number): boolean {
    return this.isFree(this.ci(x), this.ci(z));
  }

  randomFreePoint(maxAbs = this.half - 6): THREE.Vector3 {
    for (let i = 0; i < 400; i++) {
      const x = (Math.random() * 2 - 1) * maxAbs;
      const z = (Math.random() * 2 - 1) * maxAbs;
      if (this.isFreeAt(x, z)) return new THREE.Vector3(x, 0, z);
    }
    return new THREE.Vector3(0, 0, 0);
  }

  private nearestFree(x: number, z: number): [number, number] | null {
    const cx = this.ci(x);
    const cz = this.ci(z);
    if (this.isFree(cx, cz)) return [cx, cz];
    for (let r = 1; r < 8; r++) {
      let best: [number, number] | null = null;
      let bestD = Infinity;
      for (let dz = -r; dz <= r; dz++) {
        for (let dx = -r; dx <= r; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dz)) !== r || !this.isFree(cx + dx, cz + dz)) continue;
          const d = dx * dx + dz * dz;
          if (d < bestD) { bestD = d; best = [cx + dx, cz + dz]; }
        }
      }
      if (best) return best;
    }
    return null;
  }

  private lineClear(ax: number, az: number, bx: number, bz: number): boolean {
    const dx = bx - ax;
    const dz = bz - az;
    const steps = Math.ceil(Math.hypot(dx, dz) / (this.cell * 0.5));
    for (let i = 1; i < steps; i++) {
      const t = i / steps;
      if (!this.isFreeAt(ax + dx * t, az + dz * t)) return false;
    }
    return true;
  }

  /** A* with greedy line-of-sight smoothing. Returns waypoints (excluding the start). */
  findPath(from: THREE.Vector3, to: THREE.Vector3): THREE.Vector3[] | null {
    const s = this.nearestFree(from.x, from.z);
    const gl = this.nearestFree(to.x, to.z);
    if (!s || !gl) return null;
    const n = this.n;
    const start = s[1] * n + s[0];
    const goal = gl[1] * n + gl[0];
    const ver = ++this.version;
    const gx = gl[0];
    const gz = gl[1];
    const heur = (i: number) => {
      const dx = Math.abs((i % n) - gx);
      const dz = Math.abs(Math.floor(i / n) - gz);
      return Math.max(dx, dz) + 0.414 * Math.min(dx, dz);
    };
    this.heap.clear();
    this.g[start] = 0;
    this.seen[start] = ver;
    this.came[start] = -1;
    this.heap.push(start, heur(start));
    let found = false;
    let expansions = 0;
    while (this.heap.size && expansions++ < 6000) {
      const cur = this.heap.pop();
      if (this.closed[cur] === ver) continue;
      this.closed[cur] = ver;
      if (cur === goal) { found = true; break; }
      const cx = cur % n;
      const cz = Math.floor(cur / n);
      for (let dz = -1; dz <= 1; dz++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (!dx && !dz) continue;
          const nx = cx + dx;
          const nz = cz + dz;
          if (!this.isFree(nx, nz)) continue;
          if (dx && dz && (!this.isFree(cx + dx, cz) || !this.isFree(cx, cz + dz))) continue;
          const ni = nz * n + nx;
          if (this.closed[ni] === ver) continue;
          const tg = this.g[cur] + (dx && dz ? 1.414 : 1);
          if (this.seen[ni] !== ver || tg < this.g[ni]) {
            this.seen[ni] = ver;
            this.g[ni] = tg;
            this.came[ni] = cur;
            this.heap.push(ni, tg + heur(ni));
          }
        }
      }
    }
    if (!found) return null;

    const cells: THREE.Vector3[] = [];
    for (let c = goal; c !== -1; c = this.came[c]) {
      cells.push(new THREE.Vector3(this.centre(c % n), 0, this.centre(Math.floor(c / n))));
    }
    cells.reverse();
    if (this.isFreeAt(to.x, to.z)) cells[cells.length - 1] = new THREE.Vector3(to.x, 0, to.z);

    const out: THREE.Vector3[] = [];
    let ax = from.x;
    let az = from.z;
    let i = 0;
    while (i < cells.length) {
      let j = cells.length - 1;
      while (j > i && !this.lineClear(ax, az, cells[j].x, cells[j].z)) j--;
      out.push(cells[j]);
      ax = cells[j].x;
      az = cells[j].z;
      i = j + 1;
    }
    return out;
  }
}
