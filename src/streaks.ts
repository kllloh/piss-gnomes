import * as THREE from 'three';
import { SoftBox, lit } from './organic';
import { PEE, Status, type Combatant, type PeeKind, type PotionState, type SpatialGrid } from './combat';
import { DROP_SPEED, GRAVITY, type PeeSystem } from './pee';
import type { World } from './world';
import type { Effects } from './fx';
import type { Weapons } from './weapons';

export type Reward = 'turret' | 'airstrike' | 'nuke';

export const REWARD_INFO: Record<Reward, { name: string; at: number }> = {
  turret: { name: 'Piss Turret', at: 3 },
  airstrike: { name: 'Piss Air Strike', at: 5 },
  nuke: { name: 'Piss Nuke', at: 8 },
};

const NUKE_RADIUS = 90;
const STRIKE_BOMBS = 9;

/** Elevation that lands a stream on a target `dy` higher and `d` away (low arc). */
function aimPitch(d: number, dy: number): number {
  const v2 = DROP_SPEED * DROP_SPEED;
  const disc = v2 * v2 - GRAVITY * (GRAVITY * d * d + 2 * dy * v2);
  if (disc < 0) return Math.PI / 4;
  return Math.atan((v2 - Math.sqrt(disc)) / (GRAVITY * d));
}

function wrapAngle(a: number): number {
  while (a > Math.PI) a -= 2 * Math.PI;
  while (a < -Math.PI) a += 2 * Math.PI;
  return a;
}

let nextTurretId = -100;
const near: Combatant[] = [];
const dirV = new THREE.Vector3();
const orgV = new THREE.Vector3();

/** A friendly pee turret. Bots shoot at it, it shoots back, and its kills count for its owner. */
export class Turret implements Combatant {
  readonly id = nextTurretId--;
  readonly name = 'Piss Turret';
  readonly isPlayer = false;
  readonly pos = new THREE.Vector3();
  readonly status = new Status();
  readonly group = new THREE.Group();
  readonly hitR2 = 0.8;
  readonly hitH = 1.4;
  alive = true;
  hp = 170;
  maxHp = 170;
  potion: PotionState | null = null;
  bladder = 100;
  life = 40;
  yaw: number;
  private head = new THREE.Group();
  private barrelPitch = 0;
  private target: Combatant | null = null;
  private scanT = 0;

  constructor(scene: THREE.Scene, readonly team: 0 | 1, readonly owner: Combatant, at: THREE.Vector3, yaw: number, private kind: PeeKind, teamColour: number) {
    this.pos.copy(at);
    this.yaw = yaw;
    const dark = lit({ color: 0x3a3340 });
    const glass = lit({ color: 0xf2c31a });
    const g = this.group;
    g.add(new THREE.Mesh(new SoftBox(1.0, 0.22, 1.0), dark));
    const post = new THREE.Mesh(new SoftBox(0.28, 0.6, 0.28), dark);
    post.position.y = 0.4;
    g.add(post);
    const stripe = new THREE.Mesh(new SoftBox(1.04, 0.08, 1.04), new THREE.MeshBasicMaterial({ color: teamColour }));
    stripe.position.y = 0.13;
    g.add(stripe);
    this.head.position.y = 0.95;
    const flask = new THREE.Mesh(new SoftBox(0.62, 0.6, 0.62), glass);
    const neck = new THREE.Mesh(new SoftBox(0.26, 0.2, 0.26), glass);
    neck.position.y = 0.38;
    const barrel = new THREE.Mesh(new SoftBox(0.2, 0.2, 1.0), dark);
    barrel.position.set(0, -0.05, -0.7);
    const tip = new THREE.Mesh(new SoftBox(0.26, 0.26, 0.06), new THREE.MeshBasicMaterial({ color: PEE[kind].color }));
    tip.position.set(0, -0.05, -1.22);
    this.head.add(flask, neck, barrel, tip);
    g.add(this.head);
    g.scale.setScalar(1.25);
    g.position.copy(this.pos);
    scene.add(g);
  }

  hurt(amount: number) {
    if (this.alive) this.hp -= amount;
  }
  dot() { /* statuses do nothing to a turret */ }
  heal(n: number) {
    if (this.alive) this.hp = Math.min(this.maxHp, this.hp + n);
  }

  update(dt: number, c: { grid: SpatialGrid; world: World; pee: PeeSystem }) {
    this.life -= dt;
    if (this.life <= 0 || this.hp <= 0) { this.alive = false; return; }
    this.scanT -= dt;
    if (this.scanT <= 0) {
      this.scanT = 0.25;
      c.grid.query(this.pos.x, this.pos.z, 32, near);
      let best: Combatant | null = null;
      let bd = Infinity;
      for (const t of near) {
        if (!t.alive || t.isNpc || t.team === this.team) continue;
        const d = Math.hypot(t.pos.x - this.pos.x, t.pos.z - this.pos.z);
        if (d >= bd) continue;
        orgV.set(this.pos.x, 1.2, this.pos.z);
        dirV.set(t.pos.x - orgV.x, t.pos.y + 0.9 - orgV.y, t.pos.z - orgV.z);
        const len = dirV.length();
        dirV.divideScalar(len);
        if (c.world.raycast(orgV, dirV, len) >= len - 0.6) { best = t; bd = d; }
      }
      this.target = best;
    }
    const t = this.target;
    if (t && t.alive) {
      const dx = t.pos.x - this.pos.x;
      const dz = t.pos.z - this.pos.z;
      const d = Math.hypot(dx, dz) || 0.01;
      const want = Math.atan2(-dx, -dz);
      const err = wrapAngle(want - this.yaw);
      this.yaw += Math.max(-5 * dt, Math.min(5 * dt, err));
      this.barrelPitch = aimPitch(d, t.pos.y + 0.8 - 1.2);
      if (Math.abs(err) < 0.12) {
        const cp = Math.cos(this.barrelPitch);
        orgV.set(this.pos.x - Math.sin(this.yaw) * 1.4, 1.2, this.pos.z - Math.cos(this.yaw) * 1.4);
        dirV.set(-Math.sin(this.yaw) * cp, Math.sin(this.barrelPitch), -Math.cos(this.yaw) * cp);
        c.pee.emit(this, orgV, dirV, this.kind, dt, 0.045, 1.7);
      }
    } else {
      this.yaw += dt * 0.6; // sweeping for trouble
      this.barrelPitch *= 0.9;
    }
    this.head.rotation.y = this.yaw;
    this.head.rotation.x = this.barrelPitch;
  }

  dispose(scene: THREE.Scene) {
    scene.remove(this.group);
  }
}

interface Strike {
  t: number;
  dropped: number;
  target: THREE.Vector3;
  dx: number;
  dz: number;
  owner: Combatant;
  kind: PeeKind;
  marker: THREE.Mesh;
}

interface NukeVictim {
  c: Combatant;
  delay: number;
  done: boolean;
}

interface Nuke {
  t: number;
  fired: boolean;
  target: THREE.Vector3;
  owner: Combatant;
  team: 0 | 1;
  marker: THREE.Mesh;
  victims: NukeVictim[];
  ball?: THREE.Mesh;
  ball2?: THREE.Mesh;
  stem?: THREE.Mesh;
  cap?: THREE.Mesh;
}

export interface StreakHooks {
  flash: (a: number) => void;
  shake: (a: number) => void;
  sound: (what: 'siren' | 'flyby' | 'nuke') => void;
  /** The nuke went off: damage free bugs around the blast. */
  blastMounts: (at: THREE.Vector3, radius: number) => void;
  /** Called the moment the nuke detonates, so the game can reset the player's streak. */
  nukeFired: () => void;
}

/** Turrets, air strikes and the nuke. */
export class Streaks {
  readonly turrets: Turret[] = [];
  hooks: StreakHooks = { flash: () => {}, shake: () => {}, sound: () => {}, blastMounts: () => {}, nukeFired: () => {} };
  private strikes: Strike[] = [];
  private nukes: Nuke[] = [];
  private flashT = 0;

  constructor(
    private scene: THREE.Scene,
    private world: World,
    private grid: SpatialGrid,
    private pee: PeeSystem,
    private fx: Effects,
    private weapons: Weapons,
    private everyone: () => Combatant[],
  ) {}

  deployTurret(owner: Combatant, team: 0 | 1, at: THREE.Vector3, yaw: number, kind: PeeKind, teamColour: number) {
    const t = new Turret(this.scene, team, owner, at, yaw, kind, teamColour);
    this.turrets.push(t);
    if (this.turrets.length > 2) this.dropTurret(this.turrets[0]);
    this.fx.burst(new THREE.Vector3(at.x, 0.4, at.z), 0xf2d83a, 12, 4, 1.5);
    return t;
  }

  private dropTurret(t: Turret) {
    const i = this.turrets.indexOf(t);
    if (i >= 0) this.turrets.splice(i, 1);
    t.dispose(this.scene);
    this.fx.burst(new THREE.Vector3(t.pos.x, 1, t.pos.z), 0xf2d83a, 18, 6, 2);
    this.fx.splat(new THREE.Vector3(t.pos.x, 0, t.pos.z), 0xf2d83a, 2);
  }

  private pillar(at: THREE.Vector3, color: number, radius: number): THREE.Mesh {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, 90, 10), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.5, depthWrite: false }));
    m.position.set(at.x, 45, at.z);
    this.scene.add(m);
    return m;
  }

  callStrike(owner: Combatant, target: THREE.Vector3, yaw: number, kind: PeeKind) {
    const marker = this.pillar(target, 0xf2d83a, 0.5);
    this.strikes.push({ t: -2.5, dropped: 0, target: target.clone(), dx: -Math.sin(yaw), dz: -Math.cos(yaw), owner, kind, marker });
    this.hooks.sound('siren');
  }

  callNuke(owner: Combatant, team: 0 | 1, target: THREE.Vector3) {
    const marker = this.pillar(target, 0xff3030, 1.6);
    this.nukes.push({ t: -4, fired: false, target: target.clone(), owner, team, marker, victims: [] });
    this.hooks.sound('siren');
  }

  clear() {
    for (const t of this.turrets) t.dispose(this.scene);
    this.turrets.length = 0;
    for (const s of this.strikes) this.scene.remove(s.marker);
    this.strikes.length = 0;
    for (const n of this.nukes) this.removeNuke(n);
    this.nukes.length = 0;
    this.hooks.flash(0);
  }

  private removeNuke(n: Nuke) {
    for (const m of [n.marker, n.ball, n.ball2, n.stem, n.cap]) if (m) this.scene.remove(m);
  }

  private blob(r: number, color: number, opacity: number): THREE.Mesh {
    const m = new THREE.Mesh(new THREE.IcosahedronGeometry(r, 1), new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false, fog: false }));
    this.scene.add(m);
    return m;
  }

  update(dt: number) {
    // turrets
    for (let i = this.turrets.length - 1; i >= 0; i--) {
      const t = this.turrets[i];
      t.update(dt, { grid: this.grid, world: this.world, pee: this.pee });
      if (!t.alive) this.dropTurret(t);
    }

    // air strikes: a pillar of yellow smoke, then a carpet of jugs from the sky
    for (let i = this.strikes.length - 1; i >= 0; i--) {
      const s = this.strikes[i];
      s.t += dt;
      (s.marker.material as THREE.MeshBasicMaterial).opacity = 0.35 + 0.3 * Math.sin(s.t * 14);
      if (s.t >= -1.2 && s.dropped === 0) this.hooks.sound('flyby');
      while (s.t >= 0 && s.dropped < STRIKE_BOMBS && s.t >= s.dropped * 0.17) {
        const k = s.dropped - (STRIKE_BOMBS - 1) / 2;
        this.weapons.dropBomb(s.owner, s.target.x + s.dx * k * 4.4 + (Math.random() - 0.5) * 2.4, s.target.z + s.dz * k * 4.4 + (Math.random() - 0.5) * 2.4, s.kind);
        s.dropped++;
      }
      if (s.dropped >= STRIKE_BOMBS && s.t > STRIKE_BOMBS * 0.17 + 1.5) {
        this.scene.remove(s.marker);
        this.strikes.splice(i, 1);
      }
    }

    // the nuke
    for (let i = this.nukes.length - 1; i >= 0; i--) {
      const n = this.nukes[i];
      n.t += dt;
      if (!n.fired) {
        (n.marker.material as THREE.MeshBasicMaterial).opacity = 0.25 + 0.35 * Math.abs(Math.sin(n.t * (3 + (n.t + 4) * 2)));
        if (n.t >= 0) this.detonate(n);
        continue;
      }
      const t = n.t;
      this.hooks.shake(Math.max(0, 1 - t / 3));
      // the shockwave and the fireball
      const rr = NUKE_RADIUS * (1 - Math.pow(1 - Math.min(1, t / 1.6), 3));
      n.ball!.scale.setScalar(Math.max(0.01, rr));
      (n.ball!.material as THREE.MeshBasicMaterial).opacity = Math.max(0, 0.85 - Math.max(0, t - 1.0) * 0.55);
      n.ball2!.scale.setScalar(Math.max(0.01, rr * 0.7));
      (n.ball2!.material as THREE.MeshBasicMaterial).opacity = Math.max(0, 0.9 - Math.max(0, t - 0.6) * 0.5);
      // the mushroom cloud
      const rise = Math.min(1, t / 3.5);
      n.stem!.scale.set(1, Math.max(0.01, rise), 1);
      n.stem!.position.y = (50 * rise) / 2;
      n.cap!.position.y = 50 * rise + 6;
      n.cap!.scale.set(26 * rise + 0.1, 13 * rise + 0.1, 26 * rise + 0.1);
      const fade = Math.max(0, 1 - Math.max(0, t - 5.5) / 3);
      (n.stem!.material as THREE.MeshBasicMaterial).opacity = 0.8 * fade;
      (n.cap!.material as THREE.MeshBasicMaterial).opacity = 0.85 * fade;
      for (const v of n.victims) {
        if (v.done || t < v.delay) continue;
        v.done = true;
        if (!v.c.alive) continue;
        v.c.hurt(700, 'normal', n.owner);
        if (v.c.alive) v.c.hurt(700, 'normal', n.owner); // a rider survives losing the bug
        this.fx.burst(new THREE.Vector3(v.c.pos.x, 1, v.c.pos.z), 0xffe040, 8, 7, 2);
      }
      if (t > 9) {
        this.removeNuke(n);
        this.nukes.splice(i, 1);
      }
    }
    if (this.flashT > 0) {
      this.flashT = Math.max(0, this.flashT - dt / 2.2);
      this.hooks.flash(this.flashT);
    }
  }

  private detonate(n: Nuke) {
    n.fired = true;
    n.t = 0;
    this.scene.remove(n.marker);
    const at = n.target;
    this.hooks.nukeFired();
    this.hooks.sound('nuke');
    this.hooks.flash(1);
    this.flashT = 1;
    this.hooks.blastMounts(at, NUKE_RADIUS);
    n.ball = this.blob(1, 0xfff2a0, 0.85);
    n.ball.position.set(at.x, 2, at.z);
    n.ball2 = this.blob(1, 0xff9020, 0.9);
    n.ball2.position.set(at.x, 2, at.z);
    n.stem = new THREE.Mesh(new THREE.CylinderGeometry(5, 8, 50, 12), new THREE.MeshBasicMaterial({ color: 0xffb030, transparent: true, opacity: 0.8, depthWrite: false, fog: false }));
    n.stem.position.set(at.x, 0, at.z);
    this.scene.add(n.stem);
    n.cap = this.blob(1, 0xffe060, 0.85);
    n.cap.position.set(at.x, 6, at.z);
    n.stem.position.x = n.cap.position.x = at.x;
    // wrap the stem/cap positions in the ground-zero x/z; the y is animated per frame
    this.fx.burst(new THREE.Vector3(at.x, 3, at.z), 0xffe040, 70, 26, 4);
    this.fx.burst(new THREE.Vector3(at.x, 3, at.z), 0xffffff, 40, 18, 3);
    this.fx.splat(new THREE.Vector3(at.x, 0, at.z), 0xf2d83a, 30);
    for (const c of this.everyone()) {
      if (!c.alive || c.isNpc || c.team === n.team) continue;
      const d = Math.hypot(c.pos.x - at.x, c.pos.z - at.z);
      if (d <= NUKE_RADIUS) n.victims.push({ c, delay: d / 70, done: false });
    }
  }

  get busy(): boolean {
    return this.nukes.length > 0;
  }
}
