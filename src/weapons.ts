import * as THREE from 'three';
import { SoftBox, lit } from './organic';
import { PEE, type Combatant, type PeeKind, type SpatialGrid } from './combat';
import type { World } from './world';

export type WeaponType = 'sniper' | 'launcher';
export type PickupType = 'jug' | WeaponType | 'health' | 'armor' | 'double' | 'swirl';

export const PROJ_GRAVITY = 9;
export const JUG_SPEED = 15;
export const ROCKET_SPEED = 28;
export const SNIPER_DMG = 85;

export interface BlastSpec {
  radius: number;
  dmg: number;
}
export const JUG_BLAST: BlastSpec = { radius: 5, dmg: 55 };
export const ROCKET_BLAST: BlastSpec = { radius: 6.5, dmg: 70 };

interface Proj {
  mesh: THREE.Group;
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  kind: 'jug' | 'rocket';
  pee: PeeKind;
  shooter: Combatant;
  age: number;
  mat: THREE.MeshBasicMaterial;
}

interface Beam {
  mesh: THREE.Mesh;
  life: number;
}

const near: Combatant[] = [];
const tmp = new THREE.Vector3();
const up = new THREE.Vector3(0, 1, 0);

/** Build the little yellow jug used both as a pickup and as the thrown grenade. */
function makeJug(color: number): THREE.Group {
  const g = new THREE.Group();
  const glass = lit({ color: 0xf2c31a });
  const dark = lit({ color: 0x6a4a2a });
  const body = new THREE.Mesh(new SoftBox(0.4, 0.5, 0.34), glass);
  const neck = new THREE.Mesh(new SoftBox(0.2, 0.2, 0.18), glass);
  neck.position.y = 0.33;
  const cork = new THREE.Mesh(new SoftBox(0.14, 0.1, 0.14), dark);
  cork.position.y = 0.46;
  const handle = new THREE.Mesh(new SoftBox(0.07, 0.3, 0.12), dark);
  handle.position.set(0.26, 0.08, 0);
  const label = new THREE.Mesh(new SoftBox(0.3, 0.12, 0.02), new THREE.MeshBasicMaterial({ color }));
  label.position.set(0, 0, -0.18);
  g.add(body, neck, cork, handle, label);
  return g;
}

function makeSniper(): THREE.Group {
  const g = new THREE.Group();
  const metal = lit({ color: 0x3a3340 });
  const wood = lit({ color: 0x8a5a30 });
  const barrel = new THREE.Mesh(new SoftBox(0.09, 0.09, 1.1), metal);
  barrel.position.z = -0.25;
  const stock = new THREE.Mesh(new SoftBox(0.14, 0.2, 0.45), wood);
  stock.position.set(0, -0.03, 0.45);
  const scope = new THREE.Mesh(new SoftBox(0.11, 0.11, 0.34), metal);
  scope.position.set(0, 0.13, 0);
  const lens = new THREE.Mesh(new SoftBox(0.08, 0.08, 0.04), new THREE.MeshBasicMaterial({ color: 0x19e3ff }));
  lens.position.set(0, 0.13, -0.19);
  const flask = new THREE.Mesh(new SoftBox(0.24, 0.3, 0.22), lit({ color: 0xf2c31a }));
  flask.position.set(0, -0.22, 0.05);
  g.add(barrel, stock, scope, lens, flask);
  g.scale.setScalar(1.05);
  return g;
}

function makeLauncher(): THREE.Group {
  const g = new THREE.Group();
  const tube = new THREE.Mesh(new SoftBox(0.34, 0.34, 1.0), lit({ color: 0x4a7a3a }));
  const mouth = new THREE.Mesh(new SoftBox(0.42, 0.42, 0.14), lit({ color: 0x2a3a22 }));
  mouth.position.z = -0.55;
  const flask = new THREE.Mesh(new SoftBox(0.34, 0.4, 0.3), lit({ color: 0xf2c31a }));
  flask.position.set(0, 0.36, 0.1);
  const grip = new THREE.Mesh(new SoftBox(0.12, 0.3, 0.14), lit({ color: 0x6a4a2a }));
  grip.position.set(0, -0.3, 0.1);
  g.add(tube, mouth, flask, grip);
  g.scale.setScalar(0.9);
  return g;
}

/** Thrown jugs, launched pee-balls and sniper beams. The game decides what an explosion does. */
function at(m: THREE.Mesh, x: number, y: number, z: number): THREE.Mesh {
  m.position.set(x, y, z);
  return m;
}

function makeHealth(): THREE.Group {
  const g = new THREE.Group();
  g.add(new THREE.Mesh(new SoftBox(0.56, 0.42, 0.28), lit({ color: 0xf7f4ec })));
  const red = new THREE.MeshBasicMaterial({ color: 0xe0203a });
  for (const z of [-0.15, 0.15]) {
    g.add(at(new THREE.Mesh(new SoftBox(0.3, 0.09, 0.02), red), 0, 0, z));
    g.add(at(new THREE.Mesh(new SoftBox(0.09, 0.3, 0.02), red), 0, 0, z));
  }
  g.add(at(new THREE.Mesh(new SoftBox(0.2, 0.06, 0.06), lit({ color: 0x6a4a2a })), 0, 0.24, 0));
  return g;
}

function makeArmor(): THREE.Group {
  const g = new THREE.Group();
  const steel = lit({ color: 0x8fa4c0 });
  const gold = lit({ color: 0xe8b830 });
  g.add(new THREE.Mesh(new SoftBox(0.5, 0.62, 0.12), steel));
  g.add(at(new THREE.Mesh(new SoftBox(0.56, 0.08, 0.14), gold), 0, 0.3, 0));
  g.add(at(new THREE.Mesh(new SoftBox(0.08, 0.6, 0.14), gold), 0, 0, 0));
  g.add(at(new THREE.Mesh(new SoftBox(0.18, 0.18, 0.08), gold), 0, 0.02, -0.08));
  g.scale.setScalar(1.15);
  return g;
}

function makeDouble(): THREE.Group {
  const g = new THREE.Group();
  for (const x of [-0.3, 0.3]) {
    const j = makeJug(0xffa030);
    j.position.x = x;
    j.scale.setScalar(0.85);
    g.add(j);
  }
  return g;
}

function makeSwirl(): THREE.Group {
  const g = new THREE.Group();
  for (let i = 0; i < 9; i++) {
    const a = i * 0.9;
    const m = new THREE.Mesh(new SoftBox(0.15, 0.11, 0.15), new THREE.MeshBasicMaterial({ color: new THREE.Color().setHSL((i * 0.09 + 0.75) % 1, 0.9, 0.6) }));
    m.position.set(Math.cos(a) * 0.24, -0.34 + i * 0.09, Math.sin(a) * 0.24);
    g.add(m);
  }
  g.add(at(new THREE.Mesh(new SoftBox(0.14, 0.7, 0.14), lit({ color: 0xf2c31a })), 0, 0, 0));
  return g;
}

export class Weapons {
  private projs: Proj[] = [];
  private beams: Beam[] = [];
  /** Everyone who can be shot by the sniper. */
  everyone: () => Combatant[] = () => [];
  onExplode: ((pos: THREE.Vector3, blast: BlastSpec, kind: PeeKind, shooter: Combatant, rocket: boolean) => void) | null = null;
  onFire: ((type: PickupType, pos: THREE.Vector3) => void) | null = null;
  /** The sniper hit somebody (or the scenery). */
  onSnipe: ((victim: Combatant | null, head: boolean, at: THREE.Vector3, kind: PeeKind, shooter: Combatant) => void) | null = null;

  constructor(private scene: THREE.Scene, private world: World, private grid: SpatialGrid) {}

  private spawn(kind: 'jug' | 'rocket', shooter: Combatant, origin: THREE.Vector3, dir: THREE.Vector3, speed: number, pee: PeeKind) {
    const color = PEE[pee].color;
    let mesh: THREE.Group;
    const mat = new THREE.MeshBasicMaterial({ color });
    if (kind === 'jug') {
      mesh = makeJug(color);
    } else {
      mesh = new THREE.Group();
      mesh.add(new THREE.Mesh(new SoftBox(0.5, 0.5, 0.7, 0.45), mat));
      mesh.add(new THREE.Mesh(new SoftBox(0.3, 0.3, 0.3, 0.45), new THREE.MeshBasicMaterial({ color: 0xffffff })));
    }
    this.scene.add(mesh);
    const p: Proj = { mesh, pos: origin.clone(), vel: dir.clone().multiplyScalar(speed), kind, pee, shooter, age: 0, mat };
    mesh.position.copy(p.pos);
    this.projs.push(p);
    if (this.projs.length > 60) this.kill(this.projs.shift()!);
  }

  throwJug(shooter: Combatant, origin: THREE.Vector3, dir: THREE.Vector3, pee: PeeKind) {
    this.spawn('jug', shooter, origin, dir, JUG_SPEED, pee);
    this.onFire?.('jug', origin);
  }

  fireLauncher(shooter: Combatant, origin: THREE.Vector3, dir: THREE.Vector3, pee: PeeKind) {
    this.spawn('rocket', shooter, origin, dir, ROCKET_SPEED, pee);
    this.onFire?.('launcher', origin);
  }

  /** An instant beam of high-pressure pee. Hits the first enemy (or wall) along the ray. */
  snipe(shooter: Combatant, origin: THREE.Vector3, dir: THREE.Vector3, pee: PeeKind) {
    const wall = this.world.raycast(origin, dir, 320);
    let bestT = Math.min(wall, 320);
    let victim: Combatant | null = null;
    for (const c of this.everyone()) {
      if (!c.alive || c === shooter) continue;
      if (!c.isNpc && (pee === 'heal' ? c.team !== shooter.team : c.team === shooter.team)) continue;
      const dx = c.pos.x - origin.x;
      const dz = c.pos.z - origin.z;
      const t = dx * dir.x + dz * dir.z; // flat-distance param, then fix for the 3D ray below
      const hl = Math.hypot(dir.x, dir.z);
      if (hl < 1e-4) continue;
      const tt = t / (hl * hl); // ray parameter of the closest approach in the ground plane
      if (tt <= 0 || tt >= bestT) continue;
      const px = origin.x + dir.x * tt - c.pos.x;
      const pz = origin.z + dir.z * tt - c.pos.z;
      const r2 = c.hitR2 ?? 0.3;
      if (px * px + pz * pz > r2) continue;
      const y = origin.y + dir.y * tt;
      if (y < c.pos.y || y > c.pos.y + (c.hitH ?? 1.6)) continue;
      bestT = tt;
      victim = c;
    }
    const end = origin.clone().addScaledVector(dir, bestT);
    this.beam(origin, end, PEE[pee].color);
    this.onFire?.('sniper', origin);
    const head = !!victim && end.y > victim.pos.y + (victim.hitH ?? 1.6) - 0.5;
    this.onSnipe?.(victim, head, end, pee, shooter);
  }

  private beam(a: THREE.Vector3, b: THREE.Vector3, color: number) {
    const len = a.distanceTo(b);
    const m = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.07, len), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.95, depthWrite: false }));
    m.position.copy(a).lerp(b, 0.5);
    m.lookAt(b);
    this.scene.add(m);
    this.beams.push({ mesh: m, life: 0.35 });
  }

  private kill(p: Proj) {
    this.scene.remove(p.mesh);
  }

  clear() {
    for (const p of this.projs) this.kill(p);
    this.projs.length = 0;
    for (const b of this.beams) this.scene.remove(b.mesh);
    this.beams.length = 0;
  }

  update(dt: number) {
    for (let i = this.beams.length - 1; i >= 0; i--) {
      const b = this.beams[i];
      b.life -= dt;
      (b.mesh.material as THREE.MeshBasicMaterial).opacity = Math.max(0, b.life / 0.35);
      if (b.life <= 0) {
        this.scene.remove(b.mesh);
        this.beams.splice(i, 1);
      }
    }
    for (let i = this.projs.length - 1; i >= 0; i--) {
      const p = this.projs[i];
      p.age += dt;
      p.vel.y -= PROJ_GRAVITY * dt;
      const steps = Math.max(1, Math.ceil((p.vel.length() * dt) / 0.5)); // small steps so fast rockets do not tunnel
      const h = dt / steps;
      let boom = false;
      for (let s = 0; s < steps && !boom; s++) {
        p.pos.addScaledVector(p.vel, h);
        if (p.pos.y < 0.15 || this.world.pointHit(p.pos)) boom = true;
        else if (p.age > 0.08) {
          this.grid.query(p.pos.x, p.pos.z, 1.3, near);
          for (const c of near) {
            if (!c.alive || c === p.shooter) continue;
            if (!c.isNpc && c.team === p.shooter.team) continue;
            const dx = c.pos.x - p.pos.x;
            const dz = c.pos.z - p.pos.z;
            if (dx * dx + dz * dz < (c.hitR2 ?? 0.3) + 0.25 && p.pos.y > c.pos.y - 0.2 && p.pos.y < c.pos.y + (c.hitH ?? 1.6) + 0.2) { boom = true; break; }
          }
        }
      }
      if (boom || p.age > 6) {
        this.kill(p);
        this.projs.splice(i, 1);
        this.onExplode?.(tmp.copy(p.pos), p.kind === 'jug' ? JUG_BLAST : ROCKET_BLAST, p.pee, p.shooter, p.kind === 'rocket');
        continue;
      }
      p.mesh.position.copy(p.pos);
      p.mesh.rotation.y += dt * (p.kind === 'jug' ? 9 : 0);
      if (p.kind === 'jug') p.mesh.rotation.z += dt * 7;
      else p.mesh.lookAt(tmp.copy(p.pos).add(p.vel));
    }
  }
}

// --- weapons lying around the forest --------------------------------------------------------------

export interface WeaponPickup {
  type: PickupType;
  readonly pos: THREE.Vector3;
  readonly group: THREE.Group;
  active: boolean;
  respawnT: number;
  phase: number;
  halo: THREE.Mesh;
}

export const PICKUP_INFO: Record<PickupType, { name: string; blurb: string; amount: number; color: number; respawn?: number }> = {
  health: { name: 'Health Kit', blurb: 'Patched right up.', amount: 60, color: 0xff4060, respawn: 30 },
  armor: { name: 'Armour', blurb: 'Soaks most of the next hits.', amount: 50, color: 0x60a0ff, respawn: 40 },
  double: { name: 'Double Stream', blurb: 'Two streams. Twice the damage, for 35 seconds.', amount: 35, color: 0xffa030 },
  swirl: { name: 'Swirl Stream', blurb: 'A corkscrew stream that hits much harder, for 35 seconds.', amount: 35, color: 0xb050ff },
  jug: { name: 'Piss Jugs', blurb: 'Grenades! Press G to lob one.', amount: 3, color: 0xf2d83a },
  sniper: { name: 'Piss Sniper', blurb: 'Press 2. Right-click to zoom. One shot, one soaking.', amount: 8, color: 0x19e3ff },
  launcher: { name: 'Piss Launcher', blurb: 'Press 3. Big, slow, splashy.', amount: 5, color: 0xff2bd6 },
};

const pnear: Combatant[] = [];

export class WeaponPickups {
  readonly list: WeaponPickup[] = [];

  constructor(scene: THREE.Scene, spots: { type: PickupType; pos: THREE.Vector3 }[]) {
    for (const s of spots) {
      const group = new THREE.Group();
      const model =
        s.type === 'jug' ? makeJug(0xffffff)
        : s.type === 'sniper' ? makeSniper()
        : s.type === 'launcher' ? makeLauncher()
        : s.type === 'health' ? makeHealth()
        : s.type === 'armor' ? makeArmor()
        : s.type === 'double' ? makeDouble()
        : makeSwirl();
      if (s.type === 'jug') model.scale.setScalar(1.5);
      const halo = new THREE.Mesh(new SoftBox(1, 1, 1, 0.45), new THREE.MeshBasicMaterial({ color: PICKUP_INFO[s.type].color, transparent: true, opacity: 0.22, depthWrite: false }));
      halo.position.y = 0.1;
      halo.scale.set(1.5, 1.6, 1.5);
      group.add(model, halo);
      group.position.set(s.pos.x, 0.9, s.pos.z);
      scene.add(group);
      this.list.push({ type: s.type, pos: new THREE.Vector3(s.pos.x, 0, s.pos.z), group, active: true, respawnT: 0, phase: Math.random() * 6, halo });
    }
  }

  nearest(x: number, z: number, maxDist: number): WeaponPickup | null {
    let best: WeaponPickup | null = null;
    let bd = maxDist;
    for (const p of this.list) {
      if (!p.active) continue;
      const d = Math.hypot(p.pos.x - x, p.pos.z - z);
      if (d < bd) { bd = d; best = p; }
    }
    return best;
  }

  reset() {
    for (const p of this.list) { p.active = true; p.group.visible = true; }
  }

  update(dt: number, t: number, grid: SpatialGrid, onTake: (p: WeaponPickup, who: Combatant) => void) {
    for (const p of this.list) {
      if (!p.active) {
        p.respawnT -= dt;
        if (p.respawnT <= 0) { p.active = true; p.group.visible = true; }
        continue;
      }
      p.group.position.y = 0.9 + Math.sin(t * 2 + p.phase) * 0.15;
      p.group.rotation.y = t * 1.2 + p.phase;
      grid.query(p.pos.x, p.pos.z, 1.8, pnear);
      for (const who of pnear) {
        if (!who.alive || who.isNpc) continue;
        if (p.type === 'health' && who.hp >= who.maxHp) continue; // leave it for someone who needs it
        if (p.type === 'armor' && (who.armor ?? 0) >= 100) continue;
        p.active = false;
        p.group.visible = false;
        p.respawnT = PICKUP_INFO[p.type].respawn ?? 45;
        onTake(p, who);
        break;
      }
    }
  }
}

export { up as WORLD_UP };
