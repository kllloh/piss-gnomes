import * as THREE from 'three';
import { lit } from './organic';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { createFighter, type Faction } from './gnome';
import type { World } from './world';
import type { NavGrid } from './nav';
import type { Effects } from './fx';
import { PEE, Status, soak, type Combatant, type PeeKind, type PotionState, type SpatialGrid } from './combat';
import { DROP_SPEED, GRAVITY, type PeeSystem } from './pee';
import type { Zone, Zones } from './zones';
import type { Pickup, Potions } from './potions';
import type { Mount, Mounts, Rider } from './mounts';
import type { SayCtx } from './talk';
import { JUG_SPEED, ROCKET_SPEED, type PickupType, type WeaponPickup, type Weapons, type WeaponPickups } from './weapons';

const HW = 0.3;
const H = 1.4;
const SPEED = 4.3;
const HALF = 110;

/** What a fighter needs to know about the world each frame. */
export interface FightCtx {
  world: World;
  nav: NavGrid;
  grid: SpatialGrid;
  pee: PeeSystem;
  zones: Zones;
  potions: Potions;
  mounts: Mounts;
  weapons: Weapons;
  pickups: WeaponPickups;
  fx: Effects;
  time: number;
  /** Where the camera is, so far-away fighters can be skipped when drawing. */
  viewer: THREE.Vector3;
  onKill: (victim: Fighter, from: Combatant | null, kind: PeeKind) => void;
  respawn: (f: Fighter) => void;
  spreadPoison: (from: Combatant) => void;
}

// --- cheap models: every limb baked into one mesh with vertex colours ------------------------

function bake(root: THREE.Object3D, group: THREE.Object3D, skip: (m: THREE.Mesh) => boolean, exclude?: Set<THREE.Object3D>): THREE.BufferGeometry | null {
  root.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(group.matrixWorld).invert();
  const geos: THREE.BufferGeometry[] = [];
  const visit = (o: THREE.Object3D) => {
    if (exclude?.has(o)) return;
    const m = o as THREE.Mesh;
    if (m.isMesh && !skip(m)) {
      const g = m.geometry.clone();
      g.applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, m.matrixWorld));
      const col = (m.material as THREE.MeshLambertMaterial).color;
      const n = g.attributes.position.count;
      const arr = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) { arr[i * 3] = col.r; arr[i * 3 + 1] = col.g; arr[i * 3 + 2] = col.b; }
      g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
      geos.push(g);
    }
    o.children.forEach(visit);
  };
  group.children.forEach(visit);
  return geos.length ? mergeGeometries(geos, false) : null;
}

/** The rifle the old fighters carry has no place in this game. */
const isGun = (m: THREE.Mesh) => {
  const p = (m.geometry as THREE.BoxGeometry).parameters;
  return !!p && ((p.width === 0.09 && p.height === 0.6) || (p.width === 0.07 && p.depth === 0.2));
};

interface Lite {
  root: THREE.Group;
  legL: THREE.Group;
  legR: THREE.Group;
  mat: THREE.MeshLambertMaterial;
}

function makeLite(faction: Faction): Lite {
  const model = createFighter(faction);
  const root = model.root;
  // legs stay separate so they can swing; torso, arms and hat become one mesh (fewer draw calls for a crowd)
  const groups: THREE.Group[] = [model.legL, model.legR];
  const geos = groups.map((g) => bake(root, g, isGun));
  const bodyGeo = bake(root, root, isGun, new Set<THREE.Object3D>(groups));
  const mat = lit({ vertexColors: true });
  for (const c of root.children.slice()) if (!groups.includes(c as THREE.Group)) root.remove(c);
  groups.forEach((g, i) => {
    g.clear();
    if (geos[i]) g.add(new THREE.Mesh(geos[i]!, mat));
  });
  if (bodyGeo) root.add(new THREE.Mesh(bodyGeo, mat));
  return { root, legL: model.legL, legR: model.legR, mat };
}

// --- the fighter ---------------------------------------------------------------------------

function wrapAngle(a: number): number {
  while (a > Math.PI) a -= 2 * Math.PI;
  while (a < -Math.PI) a += 2 * Math.PI;
  return a;
}

/** Elevation that lands a stream on a target `dy` higher and `d` away (low arc). */
function aimPitch(d: number, dy: number, speed = DROP_SPEED): number {
  const v2 = speed * speed;
  const disc = v2 * v2 - GRAVITY * (GRAVITY * d * d + 2 * dy * v2);
  if (disc < 0) return Math.PI / 4;
  return Math.atan((v2 - Math.sqrt(disc)) / (GRAVITY * d));
}

const cand: Combatant[] = [];
const sepBuf: Combatant[] = [];
const eye = new THREE.Vector3();
const dirV = new THREE.Vector3();
const org = new THREE.Vector3();

let nextId = 1;

export class Fighter implements Rider {
  /** Set by the game once; lets hits and deaths reach the world. */
  static ctx: FightCtx | null = null;
  static onHurt: ((f: Fighter) => void) | null = null;
  /** Something worth saying out loud happened to this fighter. */
  static onSay: ((f: Fighter, ctx: SayCtx) => void) | null = null;
  /** Chaos events can make everybody huge. */
  static size = 1;

  readonly id = nextId++;
  readonly isPlayer = false;
  readonly pos = new THREE.Vector3();
  readonly group = new THREE.Group();
  readonly status = new Status();
  readonly voicePitch: number;
  readonly voiceSeed = Math.floor(Math.random() * 997);
  alive = true;
  hp = 100;
  maxHp = 100;
  potion: PotionState | null = null;
  bladder = 100;
  yaw = 0;
  peeing = false;
  mount: Mount | null = null;
  armor = 0;
  mods = { double: 0, swirl: 0 };
  hitR2?: number;
  hitH?: number;
  speedNow = 0;
  stepAcc = 0;
  deadT = 0;

  private lite: Lite;
  private target: Combatant | null = null;
  private zone: Zone | null = null;
  private goalT = 0;
  private wx = 0;
  private wz = 0;
  private wanderT = 0;
  private path: THREE.Vector3[] = [];
  private pathIdx = 0;
  private pathGx = 1e9;
  private pathGz = 1e9;
  private repathT = 0;
  private potionGoal: Pickup | null = null;
  private mountGoal: Mount | null = null;
  private weaponGoal: WeaponPickup | null = null;
  private weaponT = Math.random() * 5;
  private weaponCd = 2;
  ammoSniper = 0;
  ammoLauncher = 0;
  jugs = 0;
  private mountT = Math.random() * 6;
  private mountWant = Math.random() < 0.8;
  private potionT = Math.random() * 4;
  private scanT = Math.random() * 0.3;
  private strafeDir = 1;
  private strafeT = 0;
  private burstT = 0;
  private pauseT = Math.random();
  private stuckT = 0;
  private sideT = 0;
  private sideDir = 1;
  private walkPhase = Math.random() * 6;
  private protect = 0;
  private tinted = false;
  private deathKind: PeeKind = 'normal';
  private respawnDelay = 7;
  private shown = true;

  constructor(scene: THREE.Scene, readonly team: 0 | 1, readonly name: string, readonly faction: Faction) {
    this.lite = makeLite(faction);
    this.group.add(this.lite.root);
    scene.add(this.group);
    this.voicePitch = faction === 'gnome' ? 1.5 + Math.random() * 0.5 : 0.55 + Math.random() * 0.3;
  }

  spawn(at: THREE.Vector3, yaw: number) {
    if (this.mount) { this.mount.rider = null; this.mount = null; }
    this.hitR2 = undefined;
    this.hitH = undefined;
    this.mountGoal = null;
    this.weaponGoal = null;
    this.ammoSniper = this.ammoLauncher = this.jugs = 0;
    this.armor = 0;
    this.mods.double = this.mods.swirl = 0;
    this.pos.copy(at);
    this.yaw = yaw;
    this.alive = true;
    this.hp = this.maxHp;
    this.potion = null;
    this.bladder = 100;
    this.status.reset();
    this.target = null;
    this.peeing = false;
    this.path = [];
    this.potionGoal = null;
    this.protect = 2.5;
    this.deadT = 0;
    this.respawnDelay = 6 + Math.random() * 5;
    this.shown = true;
    this.group.visible = true;
    this.group.scale.set(1, 1, 1);
    this.group.rotation.set(0, yaw, 0);
    this.lite.mat.color.setHex(0xffffff);
    this.lite.mat.emissive.setHex(0);
    this.tinted = false;
    this.goalT = 0;
    this.sync();
  }

  /** Picked up a weapon crate. */
  give(type: PickupType, amount: number) {
    if (type === 'jug') this.jugs = Math.min(6, this.jugs + amount);
    else if (type === 'sniper') this.ammoSniper += amount;
    else if (type === 'launcher') this.ammoLauncher += amount;
    else if (type === 'health') this.heal(amount);
    else if (type === 'armor') this.armor = Math.min(100, this.armor + amount);
    else this.mods[type] = amount;
  }

  heal(n: number) {
    if (this.alive) this.hp = Math.min(this.maxHp, this.hp + n);
  }

  hurt(amount: number, kind: PeeKind, from: Combatant | null) {
    if (!this.alive || this.protect > 0) return;
    if (this.mount) { // the bug takes it
      this.mount.damage(amount, kind, from);
      if (from && !this.target && from.alive && from.team !== this.team) this.target = from;
      return;
    }
    this.hp -= soak(this, amount);
    if (this.hp <= 0) { this.die(kind, from); return; }
    Fighter.onHurt?.(this);
    Fighter.onSay?.(this, kind === 'fire' ? 'burn' : this.hp < 25 ? 'lowhp' : 'hit');
    if (from && !this.target && from.alive && from.team !== this.team) this.target = from; // turn on whoever is peeing on us
  }

  onDismount() {
    this.protect = 1.2;
    this.mountGoal = null;
    this.mountWant = Math.random() < 0.5;
  }

  /** Walking speed, or the bug's. */
  private get spd(): number {
    return this.mount ? this.mount.def.speed : SPEED;
  }

  private get hw(): number {
    return this.mount ? this.mount.def.hw : HW;
  }

  dot(amount: number, kind: PeeKind, from: Combatant | null) {
    if (!this.alive || this.protect > 0) return;
    if (this.mount) { this.mount.damage(amount, kind, from); return; }
    this.hp -= soak(this, amount);
    if (this.hp <= 0) this.die(kind, from);
  }

  private die(kind: PeeKind, from: Combatant | null) {
    const c = Fighter.ctx!;
    this.alive = false;
    this.deadT = 0;
    this.peeing = false;
    this.potion = null;
    this.target = null;
    this.deathKind = kind;
    if (this.zone) { this.zone.assigned[this.team] = Math.max(0, this.zone.assigned[this.team] - 1); this.zone = null; }
    c.onKill(this, from, kind);
    org.set(this.pos.x, this.pos.y + 0.8, this.pos.z);
    const away = dirV.set(Math.random() - 0.5, 0, Math.random() - 0.5).normalize();
    switch (kind) {
      case 'frost':
        // frozen solid, then shatters
        this.shown = false;
        this.group.visible = false;
        c.fx.gibs(org, [0xbfeaff, 0x9fd8ff, 0xffffff], 12, 5, 0x9fe8ff, away);
        break;
      case 'fire':
        this.lite.mat.color.setHex(0x1a1a1a); // crispy
        this.lite.mat.emissive.setHex(0);
        c.fx.burst(org, 0x333333, 10, 3, 3);
        break;
      case 'shock':
        c.fx.burst(org, 0xfff27a, 14, 6, 2);
        break;
      case 'acid':
        c.fx.splat(this.pos, 0x7aff2a, 1.6);
        break;
      default:
        c.fx.splat(this.pos, PEE[kind].color, 1.3);
    }
  }

  private updateDead(dt: number, c: FightCtx) {
    this.deadT += dt;
    if (this.deathKind === 'acid') {
      this.group.scale.set(1, Math.max(0.04, 1 - this.deadT * 1.3), 1); // melts into a puddle
    } else {
      this.group.rotation.x = -Math.min(1, this.deadT * 3) * (Math.PI / 2);
    }
    if (this.deadT > 4 && this.shown) { this.shown = false; this.group.visible = false; }
    if (this.deadT > this.respawnDelay) c.respawn(this);
  }

  update(dt: number, c: FightCtx) {
    if (!this.alive) { this.updateDead(dt, c); return; }
    this.protect = Math.max(0, this.protect - dt);
    this.status.update(dt, this, c.spreadPoison);
    if (!this.alive) return; // burned or poisoned to death
    if (this.potion) {
      this.potion.t -= dt;
      if (this.potion.t <= 0) this.potion = null;
    }
    this.mods.double = Math.max(0, this.mods.double - dt);
    this.mods.swirl = Math.max(0, this.mods.swirl - dt);
    this.bladder = Math.min(100, this.bladder + (this.peeing ? 0 : 9) * dt);
    this.speedNow = 0;
    if (this.status.frozen > 0) { // frozen solid
      this.peeing = false;
      this.applyTint(c.time);
      this.sync();
      return;
    }
    this.scanT -= dt;
    if (this.scanT <= 0) {
      this.scanT = 0.25 + Math.random() * 0.2;
      this.findTarget(c);
    }
    if (this.target && !this.target.alive) this.target = null;
    if (this.target) this.fight(dt, c);
    else { this.peeing = false; this.travel(dt, c); }
    this.separate(dt, c);
    this.animate(dt);
    this.applyTint(c.time);
    this.sync();
  }

  // --- who to pee on ------------------------------------------------------------------------

  private findTarget(c: FightCtx) {
    const healer = this.potion?.kind === 'heal';
    c.grid.query(this.pos.x, this.pos.z, healer ? 18 : this.ammoSniper > 0 ? 60 : 34, cand);
    const scored: { t: Combatant; s: number }[] = [];
    for (const t of cand) {
      if (!t.alive || t === this || t.isNpc) continue;
      const d = Math.hypot(t.pos.x - this.pos.x, t.pos.z - this.pos.z);
      if (healer && t.team === this.team) {
        if (t.hp < t.maxHp * 0.8) scored.push({ t, s: d - 30 }); // hurt friends come first
      } else if (t.team !== this.team) {
        scored.push({ t, s: d + (this.target === t ? -4 : 0) });
      }
    }
    scored.sort((a, b) => a.s - b.s);
    const prev = this.target;
    this.target = null;
    eye.set(this.pos.x, 0.9, this.pos.z);
    for (let i = 0; i < Math.min(3, scored.length); i++) {
      const t = scored[i].t;
      const dx = t.pos.x - eye.x;
      const dy = t.pos.y + 0.9 - eye.y;
      const dz = t.pos.z - eye.z;
      const d = Math.hypot(dx, dy, dz);
      dirV.set(dx / d, dy / d, dz / d);
      if (c.world.raycast(eye, dirV, d) >= d - 0.6) {
        if (!prev && t.team !== this.team) Fighter.onSay?.(this, 'spot');
        this.target = t;
        return;
      }
    }
  }

  private fight(dt: number, c: FightCtx) {
    const t = this.target!;
    const dx = t.pos.x - this.pos.x;
    const dz = t.pos.z - this.pos.z;
    const d = Math.hypot(dx, dz) || 0.01;
    const want = Math.atan2(-dx, -dz);
    this.yaw += Math.max(-7 * dt, Math.min(7 * dt, wrapAngle(want - this.yaw)));
    const ally = t.team === this.team;
    const kind: PeeKind = this.potion?.kind ?? 'normal';
    const speed = this.spd * this.status.speedMul;

    // keep a comfortable distance and strafe a little
    let mx = 0;
    let mz = 0;
    let sp = speed;
    if (ally) {
      if (d > 5) { mx = dx / d; mz = dz / d; }
    } else if (d > (this.ammoSniper > 0 ? 50 : 15)) {
      mx = dx / d; mz = dz / d;
    } else if (d < (this.ammoSniper > 0 ? 24 : 7)) {
      mx = -dx / d; mz = -dz / d; sp = speed * 0.7;
    } else {
      this.strafeT -= dt;
      if (this.strafeT <= 0) { this.strafeDir = -this.strafeDir; this.strafeT = 0.8 + Math.random() * 1.4; }
      mx = (-dz / d) * this.strafeDir * 0.8;
      mz = (dx / d) * this.strafeDir * 0.8;
      sp = speed * 0.55;
    }
    if (mx || mz) this.steer(c, mx, mz, sp, dt);

    // pee in bursts
    this.pauseT -= dt;
    this.burstT -= dt;
    const aimed = Math.abs(wrapAngle(want - this.yaw)) < 0.3;
    if (this.peeing) {
      if (this.burstT <= 0 || this.bladder <= 2) { this.peeing = false; this.pauseT = 0.5 + Math.random() * 0.9; }
    } else if (this.pauseT <= 0 && this.bladder > 25 && aimed && d < 28) {
      this.peeing = true;
      this.burstT = 1.4 + Math.random() * 1.6;
    }
    if (this.peeing && aimed) {
      const m = this.mount;
      const lift = m ? m.def.lift : 0;
      org.set(this.pos.x - Math.sin(this.yaw) * (m ? 0.9 : 0.45), 0.62 + lift + (m ? 0.35 : 0), this.pos.z - Math.cos(this.yaw) * (m ? 0.9 : 0.45));
      const pitch = aimPitch(d, t.pos.y + 0.8 - org.y);
      const cp = Math.cos(pitch);
      dirV.set((dx / d) * cp, Math.sin(pitch), (dz / d) * cp);
      c.pee.emit(this, org, dirV, kind, dt, m ? m.def.spread : 0.045, m ? m.def.rate : 1);
      this.bladder -= 16 * dt * (m ? m.def.drain : 1);
    }

    // fancy weapons: jugs, the launcher and the sniper
    this.weaponCd -= dt;
    if (!ally && this.weaponCd <= 0 && aimed) {
      const m = this.mount;
      const lift = m ? m.def.lift : 0;
      const ox = this.pos.x - Math.sin(this.yaw) * 0.5;
      const oz = this.pos.z - Math.cos(this.yaw) * 0.5;
      const wob = () => (Math.random() - 0.5) * 0.05;
      if (this.ammoSniper > 0 && d > 20) {
        org.set(ox, 1.0 + lift, oz);
        const tx = t.pos.x - ox;
        const ty = t.pos.y + 0.9 - org.y;
        const tz = t.pos.z - oz;
        const len = Math.hypot(tx, ty, tz) || 1;
        dirV.set(tx / len + wob() * 0.4, ty / len + wob() * 0.4, tz / len + wob() * 0.4).normalize();
        c.weapons.snipe(this, org, dirV, kind);
        this.ammoSniper--;
        this.weaponCd = 2.2 + Math.random() * 1.5;
      } else if (this.ammoLauncher > 0 && d > 9 && d < 45) {
        org.set(ox, 1.0 + lift, oz);
        const pitch = aimPitch(d, t.pos.y + 0.8 - org.y, ROCKET_SPEED);
        const cp = Math.cos(pitch);
        dirV.set((dx / d) * cp + wob(), Math.sin(pitch), (dz / d) * cp + wob()).normalize();
        c.weapons.fireLauncher(this, org, dirV, kind);
        this.ammoLauncher--;
        this.weaponCd = 2.5 + Math.random() * 1.5;
      } else if (this.jugs > 0 && d > 8 && d < 22) {
        org.set(ox, 1.0 + lift, oz);
        const pitch = aimPitch(d, t.pos.y + 0.8 - org.y, JUG_SPEED);
        const cp = Math.cos(pitch);
        dirV.set((dx / d) * cp + wob(), Math.sin(pitch), (dz / d) * cp + wob()).normalize();
        c.weapons.throwJug(this, org, dirV, kind);
        this.jugs--;
        this.weaponCd = 3 + Math.random() * 2;
      }
    }
  }

  // --- getting around -----------------------------------------------------------------------

  private chooseGoal(c: FightCtx) {
    if (this.zone) this.zone.assigned[this.team] = Math.max(0, this.zone.assigned[this.team] - 1);
    const z = c.zones.assign(this.team, this.pos.x, this.pos.z);
    z.assigned[this.team]++;
    this.zone = z;
    this.goalT = 14 + Math.random() * 14;
    this.pickWander(z);
    this.path = [];
  }

  private pickWander(z: Zone) {
    const a = Math.random() * Math.PI * 2;
    const r = Math.sqrt(Math.random()) * z.radius * 0.6;
    this.wx = Math.cos(a) * r;
    this.wz = Math.sin(a) * r;
    this.wanderT = 3 + Math.random() * 4;
  }

  private travel(dt: number, c: FightCtx) {
    this.goalT -= dt;
    if (!this.zone || this.goalT <= 0) this.chooseGoal(c);
    const zone = this.zone!;

    // grab a potion if one is lying close by
    this.potionT -= dt;
    if (this.potionT <= 0) {
      this.potionT = 4 + Math.random() * 4;
      if (!this.potion || this.potion.t < 10) this.potionGoal = c.potions.nearest(this.pos.x, this.pos.z, 32);
    }
    if (this.potionGoal && !this.potionGoal.active) this.potionGoal = null;

    // hop on a giant bug if one is standing around nearby
    this.mountT -= dt;
    if (this.mountT <= 0) {
      this.mountT = 3 + Math.random() * 4;
      if (!this.mount && this.mountWant) this.mountGoal = c.mounts.nearestFree(this.pos.x, this.pos.z, 30);
    }
    if (this.mountGoal && (this.mount || !this.mountGoal.alive || this.mountGoal.rider)) this.mountGoal = null;
    if (this.mountGoal && Math.hypot(this.mountGoal.pos.x - this.pos.x, this.mountGoal.pos.z - this.pos.z) < 2) {
      c.mounts.board(this.mountGoal, this);
      Fighter.onSay?.(this, 'mount');
      this.mountGoal = null;
      this.path = [];
    }

    // spot a weapon crate we actually want
    this.weaponT -= dt;
    if (this.weaponT <= 0) {
      this.weaponT = 4 + Math.random() * 4;
      let best: WeaponPickup | null = null;
      let bd = 32;
      for (const p of c.pickups.list) {
        if (!p.active) continue;
        const wanted =
          p.type === 'jug' ? this.jugs < 3
          : p.type === 'sniper' ? this.ammoSniper <= 0
          : p.type === 'launcher' ? this.ammoLauncher <= 0
          : p.type === 'health' ? this.hp < 70
          : p.type === 'armor' ? this.armor < 40
          : this.mods[p.type] < 5;
        const dd = Math.hypot(p.pos.x - this.pos.x, p.pos.z - this.pos.z);
        if (wanted && dd < bd) { bd = dd; best = p; }
      }
      this.weaponGoal = best;
    }
    if (this.weaponGoal && !this.weaponGoal.active) this.weaponGoal = null;

    const goal = this.mountGoal ?? this.weaponGoal ?? this.potionGoal;
    const gx = goal ? goal.pos.x : zone.x + this.wx;
    const gz = goal ? goal.pos.z : zone.z + this.wz;
    const dxg = gx - this.pos.x;
    const dzg = gz - this.pos.z;
    const dg = Math.hypot(dxg, dzg) || 0.01;
    const mul = this.status.speedMul;
    const SPEED = this.spd;

    const inZone = !goal && Math.hypot(this.pos.x - zone.x, this.pos.z - zone.z) < zone.radius * 0.8;
    if (inZone) {
      // loiter inside the zone: that's what captures it
      this.wanderT -= dt;
      if (this.wanderT <= 0) this.pickWander(zone);
      if (dg > 1.2) {
        this.steer(c, dxg / dg, dzg / dg, SPEED * 0.55 * mul, dt);
        this.yaw += Math.max(-8 * dt, Math.min(8 * dt, wrapAngle(Math.atan2(-dxg, -dzg) - this.yaw)));
      }
      return;
    }

    this.repathT -= dt;
    if (this.path.length === 0 || this.repathT <= 0 || Math.hypot(gx - this.pathGx, gz - this.pathGz) > 4) {
      this.path = c.nav.findPath(this.pos, org.set(gx, 0, gz)) ?? [];
      this.pathIdx = 0;
      this.pathGx = gx;
      this.pathGz = gz;
      this.repathT = 3 + Math.random() * 2;
    }
    const wp = this.path[this.pathIdx];
    let vx = dxg / dg;
    let vz = dzg / dg;
    if (wp) {
      const dx = wp.x - this.pos.x;
      const dz = wp.z - this.pos.z;
      const d = Math.hypot(dx, dz) || 0.01;
      if (d < 1.4 && this.pathIdx < this.path.length - 1) this.pathIdx++;
      vx = dx / d;
      vz = dz / d;
    }
    this.steer(c, vx, vz, SPEED * mul, dt);
    this.yaw += Math.max(-8 * dt, Math.min(8 * dt, wrapAngle(Math.atan2(-vx, -vz) - this.yaw)));
  }

  private steer(c: FightCtx, vx: number, vz: number, speed: number, dt: number) {
    let ax = vx;
    let az = vz;
    if (this.sideT > 0) { // wiggle round whatever is in the way
      this.sideT -= dt;
      ax = vx * 0.3 - vz * this.sideDir;
      az = vz * 0.3 + vx * this.sideDir;
    }
    const l = Math.hypot(ax, az) || 1;
    ax /= l;
    az /= l;
    const bx = this.pos.x;
    const bz = this.pos.z;
    c.world.moveAxis(this.pos, this.hw, H, 'x', ax * speed * dt);
    c.world.moveAxis(this.pos, this.hw, H, 'z', az * speed * dt);
    this.pos.x = Math.max(-HALF + 3, Math.min(HALF - 3, this.pos.x));
    this.pos.z = Math.max(-HALF + 3, Math.min(HALF - 3, this.pos.z));
    const moved = Math.hypot(this.pos.x - bx, this.pos.z - bz);
    this.speedNow = moved / dt;
    if (moved < 0.3 * speed * dt) {
      this.stuckT += dt;
      if (this.stuckT > 0.35) {
        this.stuckT = 0;
        this.sideT = 0.7;
        this.sideDir = Math.random() < 0.5 ? -1 : 1;
        this.path = [];
        this.repathT = 0;
      }
    } else {
      this.stuckT = 0;
    }
  }

  private separate(dt: number, c: FightCtx) {
    c.grid.query(this.pos.x, this.pos.z, 0.9, sepBuf);
    for (const o of sepBuf) {
      if (o === this || !o.alive) continue;
      const dx = this.pos.x - o.pos.x;
      const dz = this.pos.z - o.pos.z;
      const d = Math.hypot(dx, dz);
      if (d < 0.8 && d > 0.001) {
        const push = (0.8 - d) * 3 * dt;
        c.world.moveAxis(this.pos, this.hw, H, 'x', (dx / d) * push);
        c.world.moveAxis(this.pos, this.hw, H, 'z', (dz / d) * push);
      }
    }
  }

  private animate(dt: number) {
    this.walkPhase += this.speedNow * dt * 2.4;
    const swing = this.mount ? 0 : Math.sin(this.walkPhase) * Math.min(1, this.speedNow / 3) * 0.9;
    this.lite.legL.rotation.x = swing;
    this.lite.legR.rotation.x = -swing;
    const lean = this.peeing ? 0.3 : 0; // hips forward, proud stance
    this.lite.root.rotation.x += (lean - this.lite.root.rotation.x) * Math.min(1, dt * 8);
  }

  private applyTint(t: number) {
    const tint = this.status.tint(t);
    if (tint) {
      this.lite.mat.emissive.setHex(tint.color);
      this.lite.mat.emissiveIntensity = tint.intensity;
      this.tinted = true;
    } else if (this.tinted) {
      this.lite.mat.emissive.setHex(0);
      this.tinted = false;
    }
  }

  private sync() {
    this.group.position.copy(this.pos);
    if (this.mount) this.group.position.y += this.mount.def.lift;
    if (this.alive) {
      this.group.rotation.y = this.yaw;
      const sz = Fighter.size;
      if (this.group.scale.x !== sz) this.group.scale.set(sz, sz, sz);
    }
    if (this.shown) {
      const v = Fighter.ctx!.viewer;
      const dx = this.pos.x - v.x;
      const dz = this.pos.z - v.z;
      this.group.visible = dx * dx + dz * dz < 110 * 110;
    }
  }
}
