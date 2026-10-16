import * as THREE from 'three';
import type { World } from './world';
import type { Effects } from './fx';
import { PEE, type Combatant, type PeeKind, type SpatialGrid } from './combat';

const MAX = 5200;
export const DROP_SPEED = 20;
export const GRAVITY = 9;
export const RATE = 48; // droplets per second while peeing
const LIFE = 2.4;
const KINDS: PeeKind[] = ['normal', 'fire', 'frost', 'acid', 'shock', 'poison', 'heal'];
const COLORS = KINDS.map((k) => new THREE.Color(PEE[k].color));

export interface PeeContext {
  world: World;
  grid: SpatialGrid;
  fx: Effects;
  /** A droplet landed on somebody. */
  onHit: (victim: Combatant, kind: PeeKind, shooter: Combatant, at: THREE.Vector3) => void;
}

const tmpP = new THREE.Vector3();
const near: Combatant[] = [];
const dummy = new THREE.Object3D();

/** Every droplet of pee in the air, drawn as one instanced mesh. */
export class PeeSystem {
  private mesh: THREE.InstancedMesh;
  private px = new Float32Array(MAX);
  private py = new Float32Array(MAX);
  private pz = new Float32Array(MAX);
  private vx = new Float32Array(MAX);
  private vy = new Float32Array(MAX);
  private vz = new Float32Array(MAX);
  private life = new Float32Array(MAX);
  private kind = new Uint8Array(MAX);
  private shooter: (Combatant | null)[] = new Array(MAX).fill(null);
  private count = 0;
  private acc = new Map<number, number>();
  /** Chaos events: everybody's stream is stronger. */
  rateMul = 1;

  constructor(scene: THREE.Scene) {
    this.mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(0.1, 0.1, 0.1), new THREE.MeshBasicMaterial({ color: 0xffffff }), MAX);
    this.mesh.frustumCulled = false;
    this.mesh.count = 0;
    this.mesh.setColorAt(0, COLORS[0]);
    scene.add(this.mesh);
  }

  get active(): number {
    return this.count;
  }

  clear() {
    this.count = 0;
    this.mesh.count = 0;
    this.acc.clear();
  }

  /** Emit this frame's share of a continuous stream. */
  emit(shooter: Combatant, origin: THREE.Vector3, dir: THREE.Vector3, kind: PeeKind, dt: number, spread = 0.03, rate = 1) {
    const a = (this.acc.get(shooter.id) ?? 0) + dt * RATE * rate * this.rateMul;
    const n = Math.floor(a);
    this.acc.set(shooter.id, a - n);
    const ki = KINDS.indexOf(kind);
    for (let k = 0; k < n && this.count < MAX; k++) {
      const i = this.count++;
      const sp = DROP_SPEED * (0.96 + Math.random() * 0.08);
      const back = ((k + Math.random()) / Math.max(1, n)) * dt; // spread the new droplets along this frame's travel
      this.vx[i] = dir.x * sp + (Math.random() - 0.5) * spread * DROP_SPEED;
      this.vy[i] = dir.y * sp + (Math.random() - 0.5) * spread * DROP_SPEED;
      this.vz[i] = dir.z * sp + (Math.random() - 0.5) * spread * DROP_SPEED;
      this.px[i] = origin.x + this.vx[i] * back;
      this.py[i] = origin.y + this.vy[i] * back;
      this.pz[i] = origin.z + this.vz[i] * back;
      this.life[i] = LIFE;
      this.kind[i] = ki;
      this.shooter[i] = shooter;
      this.mesh.setColorAt(i, COLORS[ki]);
    }
  }

  private remove(i: number) {
    const last = --this.count;
    if (i !== last) {
      this.px[i] = this.px[last]; this.py[i] = this.py[last]; this.pz[i] = this.pz[last];
      this.vx[i] = this.vx[last]; this.vy[i] = this.vy[last]; this.vz[i] = this.vz[last];
      this.life[i] = this.life[last];
      this.kind[i] = this.kind[last];
      this.shooter[i] = this.shooter[last];
      this.mesh.setColorAt(i, COLORS[this.kind[i]]);
    }
    this.shooter[last] = null;
  }

  update(dt: number, c: PeeContext) {
    for (let i = this.count - 1; i >= 0; i--) {
      this.life[i] -= dt;
      if (this.life[i] <= 0) { this.remove(i); continue; }
      this.vy[i] -= GRAVITY * dt;
      this.px[i] += this.vx[i] * dt;
      this.py[i] += this.vy[i] * dt;
      this.pz[i] += this.vz[i] * dt;
      const x = this.px[i];
      const y = this.py[i];
      const z = this.pz[i];
      const kind = KINDS[this.kind[i]];
      if (y < 0.05) {
        if (Math.random() < 0.08) c.fx.splat(tmpP.set(x, 0, z), PEE[kind].color, 0.35 + Math.random() * 0.3);
        this.remove(i);
        continue;
      }
      if (c.world.pointHit(tmpP.set(x, y, z))) { this.remove(i); continue; }

      // did it land on somebody?
      const shooter = this.shooter[i]!;
      c.grid.query(x, z, 1.2, near);
      let hit: Combatant | null = null;
      for (let k = 0; k < near.length; k++) {
        const t = near[k];
        if (!t.alive || t === shooter) continue;
        if (kind === 'heal' ? t.team !== shooter.team : t.team === shooter.team) continue; // heal goes to friends, the rest to enemies
        const dx = t.pos.x - x;
        const dz = t.pos.z - z;
        if (dx * dx + dz * dz < (t.hitR2 ?? 0.3) && y > t.pos.y && y < t.pos.y + (t.hitH ?? 1.6)) { hit = t; break; }
      }
      if (hit) {
        c.onHit(hit, kind, shooter, tmpP.set(x, y, z));
        this.remove(i);
      }
    }
    for (let i = 0; i < this.count; i++) {
      dummy.position.set(this.px[i], this.py[i], this.pz[i]);
      dummy.updateMatrix();
      this.mesh.setMatrixAt(i, dummy.matrix);
    }
    this.mesh.count = this.count;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }

  /** Where a stream aimed this way would land (for the aiming marker). */
  landing(origin: THREE.Vector3, dir: THREE.Vector3, world: World, out: THREE.Vector3): boolean {
    const vx = dir.x * DROP_SPEED;
    const vy = dir.y * DROP_SPEED;
    const vz = dir.z * DROP_SPEED;
    for (let t = 0.05; t < LIFE; t += 0.05) {
      out.set(origin.x + vx * t, origin.y + vy * t - 0.5 * GRAVITY * t * t, origin.z + vz * t);
      if (out.y < 0.05) { out.y = 0.05; return true; }
      if (world.pointHit(out)) return true;
    }
    return false;
  }
}
