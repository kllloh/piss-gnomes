import * as THREE from 'three';
import { SoftBox, lit } from './organic';
import { Status, type Combatant, type PotionState, type SpatialGrid } from './combat';
import type { World } from './world';
import type { Effects } from './fx';
import type { Rory } from './rory';

const HW = 0.8;
const H = 2.2;
const GAS_RADIUS = 6.5;
const GAS_TIME = 7;
const nearBuf: Combatant[] = [];

interface Gas {
  x: number;
  z: number;
  t: number;
  puff: number;
  dome: THREE.Mesh;
}

/** Chris: a big black cat who follows Rory around and farts clouds of health gas. */
export class Chris implements Combatant {
  readonly id = -3;
  readonly name = 'Chris';
  readonly team = 0 as const;
  readonly isPlayer = false;
  readonly isNpc = true;
  readonly status = new Status();
  readonly pos = new THREE.Vector3();
  readonly group = new THREE.Group();
  readonly hitR2 = 2.2;
  readonly hitH = 2.8;
  alive = true;
  hp = 9999;
  maxHp = 9999;
  potion: PotionState | null = null;
  bladder = 100;
  yaw = 0;
  speedNow = 0;
  stepAcc = 0;
  readonly gas: Gas[] = [];
  /** Called when Chris lets one go, with where it happened. */
  onFart: ((x: number, z: number) => void) | null = null;
  /** Called for the odd meow. */
  onMeow: (() => void) | null = null;

  private legs: THREE.Group[] = [];
  private tail: THREE.Group[] = [];
  private phase = 0;
  private fartT = 6 + Math.random() * 6;
  private meowT = 8 + Math.random() * 10;
  private stuckT = 0;
  private soakCd = 0;
  private sideT = 0;

  constructor(private scene: THREE.Scene, private world: World, private fx: Effects) {
    const black = lit({ color: 0x0e0e16 });
    const paw = lit({ color: 0x20202c });
    const pink = lit({ color: 0xe88aa0 });
    const glow = new THREE.MeshBasicMaterial({ color: 0x40ff60 });
    const white = new THREE.MeshBasicMaterial({ color: 0xf4f4f4 });
    const add = (parent: THREE.Object3D, mat: THREE.Material, w: number, h: number, d: number, x: number, y: number, z: number) => {
      const m = new THREE.Mesh(new SoftBox(w, h, d), mat);
      m.position.set(x, y, z);
      m.castShadow = true;
      parent.add(m);
      return m;
    };
    const g = this.group;
    add(g, black, 1.4, 1.15, 2.5, 0, 1.55, 0); // body
    add(g, black, 1.0, 0.95, 0.8, 0, 1.95, -1.35); // chest and neck
    add(g, black, 1.2, 1.0, 1.05, 0, 2.3, -1.95); // head
    for (const sx of [-1, 1]) {
      add(g, black, 0.3, 0.5, 0.22, sx * 0.42, 2.95, -1.8); // ears
      add(g, pink, 0.16, 0.3, 0.1, sx * 0.42, 2.92, -1.92);
      add(g, glow, 0.26, 0.22, 0.06, sx * 0.32, 2.42, -2.5); // big green eyes
      add(g, black, 0.08, 0.2, 0.07, sx * 0.32, 2.42, -2.54); // slit pupils
      for (let w = 0; w < 3; w++) add(g, white, 0.7, 0.03, 0.03, sx * 0.85, 2.18 + w * 0.08, -2.45); // whiskers
    }
    add(g, pink, 0.2, 0.14, 0.1, 0, 2.2, -2.5); // nose
    add(g, pink, 0.3, 0.06, 0.06, 0, 2.03, -2.5); // mouth
    // four legs that swing
    for (const [x, z] of [[-0.5, -0.9], [0.5, -0.9], [-0.5, 0.9], [0.5, 0.9]]) {
      const leg = new THREE.Group();
      leg.position.set(x, 1.05, z);
      add(leg, black, 0.34, 1.05, 0.34, 0, -0.52, 0);
      add(leg, paw, 0.4, 0.16, 0.5, 0, -1.0, -0.06);
      g.add(leg);
      this.legs.push(leg);
    }
    // a long tail made of swishing segments
    let parent: THREE.Object3D = g;
    for (let i = 0; i < 5; i++) {
      const seg = new THREE.Group();
      seg.position.set(0, i === 0 ? 1.9 : 0, i === 0 ? 1.3 : 0.55);
      add(seg, black, 0.26, 0.26, 0.62, 0, 0, 0.28);
      parent.add(seg);
      this.tail.push(seg);
      parent = seg;
    }
    g.scale.setScalar(1.0);
    scene.add(g);
  }

  spawn(at: THREE.Vector3) {
    this.pos.copy(at);
    this.fartT = 6 + Math.random() * 6;
    for (const gs of this.gas) this.scene.remove(gs.dome);
    this.gas.length = 0;
    this.sync();
  }

  // Chris cannot be hurt either. Pee just gets a hiss.
  hurt() {
    if (this.soakCd > 0) return;
    this.soakCd = 6;
    this.onMeow?.();
  }
  dot() { /* nothing */ }
  heal() { /* nothing */ }

  update(dt: number, rory: Rory, grid: SpatialGrid) {
    this.soakCd = Math.max(0, this.soakCd - dt);
    // stay by Rory's side: behind and to the right of him
    const fx = -Math.sin(rory.yaw);
    const fz = -Math.cos(rory.yaw);
    const tx = rory.pos.x - fx * 5.5 + -fz * 4.5;
    const tz = rory.pos.z - fz * 5.5 + fx * 4.5;
    let dx = tx - this.pos.x;
    let dz = tz - this.pos.z;
    const dist = Math.hypot(dx, dz);
    this.speedNow = 0;
    if (dist > 28) { // fell behind: pop back to Rory
      this.pos.set(tx, 0, tz);
      dx = dz = 0;
    }
    if (dist > 1.2) {
      const speed = Math.min(6.5, 1 + dist * 1.1);
      let mx = dx / dist;
      let mz = dz / dist;
      if (this.sideT > 0) { // wiggle round whatever is in the way
        this.sideT -= dt;
        const ox = mx;
        mx = mx * 0.3 - mz;
        mz = mz * 0.3 + ox;
      }
      this.yaw += Math.max(-4 * dt, Math.min(4 * dt, wrap(Math.atan2(-mx, -mz) - this.yaw)));
      const bx = this.pos.x;
      const bz = this.pos.z;
      this.world.moveAxis(this.pos, HW, H, 'x', mx * speed * dt);
      this.world.moveAxis(this.pos, HW, H, 'z', mz * speed * dt);
      const moved = Math.hypot(this.pos.x - bx, this.pos.z - bz);
      this.speedNow = moved / dt;
      if (moved < 0.25 * speed * dt) {
        this.stuckT += dt;
        if (this.stuckT > 0.6) { this.sideT = 0.8; }
        if (this.stuckT > 3) { this.pos.set(tx, 0, tz); this.stuckT = 0; }
      } else this.stuckT = 0;
    } else {
      // idle: look at Rory
      this.yaw += Math.max(-2 * dt, Math.min(2 * dt, wrap(Math.atan2(-(rory.pos.x - this.pos.x), -(rory.pos.z - this.pos.z)) - this.yaw)));
    }

    // the occasional meow, and the occasional... other thing
    this.meowT -= dt;
    if (this.meowT <= 0) { this.meowT = 10 + Math.random() * 15; this.onMeow?.(); }
    this.fartT -= dt;
    if (this.fartT <= 0) {
      this.fartT = 14 + Math.random() * 8;
      this.letOneGo();
    }
    this.updateGas(dt, grid);
    this.animate(dt);
    this.sync();
  }

  private letOneGo() {
    const bx = this.pos.x + Math.sin(this.yaw) * 2.0;
    const bz = this.pos.z + Math.cos(this.yaw) * 2.0;
    const dome = new THREE.Mesh(new THREE.SphereGeometry(1, 14, 10), new THREE.MeshBasicMaterial({ color: 0x7dff9a, transparent: true, opacity: 0.16, depthWrite: false }));
    dome.position.set(bx, 0, bz);
    this.scene.add(dome);
    this.gas.push({ x: bx, z: bz, t: GAS_TIME, puff: 0, dome });
    this.fx.cloud(new THREE.Vector3(bx, 1.2, bz), 0x9dff9d, 2.5, 8, 1.8);
    this.onFart?.(bx, bz);
  }

  /** Health gas heals everyone standing in it: friend, foe and Rory's other friends. */
  private updateGas(dt: number, grid: SpatialGrid) {
    for (let i = this.gas.length - 1; i >= 0; i--) {
      const g = this.gas[i];
      g.t -= dt;
      const age = GAS_TIME - g.t;
      const grow = Math.min(1, age / 0.9);
      const r = GAS_RADIUS * (0.3 + 0.7 * grow);
      g.dome.scale.set(r, r * 0.55, r);
      (g.dome.material as THREE.MeshBasicMaterial).opacity = 0.16 * Math.min(1, g.t / 1.2);
      g.puff -= dt;
      if (g.puff <= 0) {
        g.puff = 0.35;
        this.fx.cloud(new THREE.Vector3(g.x + (Math.random() - 0.5) * r * 1.4, 0.6 + Math.random() * 1.6, g.z + (Math.random() - 0.5) * r * 1.4), 0x9dff9d, 2.2, 3, 1.5);
      }
      grid.query(g.x, g.z, r, nearBuf);
      for (const c of nearBuf) {
        if (!c.alive || c.isNpc) continue;
        c.heal(16 * dt);
      }
      if (g.t <= 0) {
        this.scene.remove(g.dome);
        this.gas.splice(i, 1);
      }
    }
  }

  private animate(dt: number) {
    this.phase += this.speedNow * dt * 1.7;
    const amp = Math.min(1, this.speedNow / 2.5) * 0.7;
    this.legs.forEach((l, i) => {
      l.rotation.x = Math.sin(this.phase + (i === 0 || i === 3 ? 0 : Math.PI)) * amp; // diagonal pairs, like a real cat
    });
    const t = performance.now() / 1000;
    this.tail.forEach((s, i) => {
      s.rotation.y = Math.sin(t * 2.2 - i * 0.7) * 0.35;
      s.rotation.x = i === 0 ? -0.9 : -0.18 + Math.sin(t * 1.5 - i) * 0.05; // the tail sticks up and curls
    });
    this.group.position.y = Math.abs(Math.sin(this.phase)) * 0.05 * amp;
  }

  private sync() {
    this.group.position.x = this.pos.x;
    this.group.position.z = this.pos.z;
    this.group.rotation.y = this.yaw;
  }
}

function wrap(a: number): number {
  while (a > Math.PI) a -= 2 * Math.PI;
  while (a < -Math.PI) a += 2 * Math.PI;
  return a;
}
