import * as THREE from 'three';
import { SoftBox, toon } from './organic';
import { Status, type Combatant, type PeeKind, type PotionState } from './combat';
import type { World } from './world';
import type { NavGrid } from './nav';
import type { Player } from './player';

const SCALE_XZ = 1.05; // thin
const SCALE_Y = 2.1; // and very tall
const HW = 0.45;
const H = 3.1;
const SPEED = 2.4;
const GREET_DIST = 10;

/** Rory. Big, blond, bowl-cut, friendly and completely unkillable. */
export class Rory implements Combatant {
  readonly id = -2;
  readonly name = 'Rory';
  readonly team = 0 as const;
  readonly isPlayer = false;
  readonly isNpc = true;
  readonly status = new Status();
  readonly pos = new THREE.Vector3();
  readonly group = new THREE.Group();
  readonly hitR2 = 0.8;
  readonly hitH = H;
  alive = true;
  hp = 9999;
  maxHp = 9999;
  potion: PotionState | null = null;
  bladder = 100;
  yaw = 0;
  speedNow = 0;
  stepAcc = 0;

  private legL = new THREE.Group();
  private legR = new THREE.Group();
  private armL = new THREE.Group();
  private armR = new THREE.Group();
  private phase = 0;
  private path: THREE.Vector3[] = [];
  private pathIdx = 0;
  private pauseT = 2;
  private stuckT = 0;
  private greeted = false;
  private greetCd = 0;
  private waveT = 0;
  private soakCd = 0;

  constructor(scene: THREE.Scene, private world: World, private nav: NavGrid, private say: (text: string) => void) {
    const SKIN = 0xf0c8a0;
    const BLOND = 0xe8c24a;
    const root = new THREE.Group();
    const mk = (parent: THREE.Object3D, w: number, h: number, d: number, x: number, y: number, z: number, color: number) => {
      const m = new THREE.Mesh(new SoftBox(w, h, d), toon({ color }));
      m.position.set(x, y, z);
      m.castShadow = true;
      parent.add(m);
      return m;
    };
    this.legL.position.set(-0.14, 0.45, 0);
    this.legR.position.set(0.14, 0.45, 0);
    for (const leg of [this.legL, this.legR]) {
      mk(leg, 0.24, 0.45, 0.27, 0, -0.225, 0, 0x3a4f8a); // jeans
      mk(leg, 0.26, 0.1, 0.34, 0, -0.41, -0.04, 0x2a2420); // trainers
    }
    root.add(this.legL, this.legR);
    mk(root, 0.66, 0.58, 0.38, 0, 0.74, 0, 0x2fa04a); // green t-shirt
    mk(root, 0.68, 0.08, 0.4, 0, 0.78, 0, 0xf2e04a); // stripe
    this.armL.position.set(-0.43, 1.0, 0);
    this.armR.position.set(0.43, 1.0, 0);
    for (const arm of [this.armL, this.armR]) {
      mk(arm, 0.2, 0.2, 0.2, 0, -0.1, 0, 0x2fa04a);
      mk(arm, 0.17, 0.36, 0.17, 0, -0.38, 0, SKIN);
      mk(arm, 0.18, 0.18, 0.18, 0, -0.6, 0, SKIN);
    }
    root.add(this.armL, this.armR);
    // head (front is -z), big friendly face
    mk(root, 0.42, 0.42, 0.42, 0, 1.2, 0, SKIN);
    mk(root, 0.1, 0.1, 0.08, 0, 1.14, -0.24, 0xe8908a); // nose
    mk(root, 0.07, 0.07, 0.04, -0.1, 1.2, -0.215, 0x111111);
    mk(root, 0.07, 0.07, 0.04, 0.1, 1.2, -0.215, 0x111111);
    mk(root, 0.2, 0.04, 0.04, 0, 1.06, -0.215, 0x7a2a2a); // happy mouth
    mk(root, 0.1, 0.09, 0.04, -0.12, 1.1, -0.215, 0xf0a0a0); // rosy cheeks
    mk(root, 0.1, 0.09, 0.04, 0.12, 1.1, -0.215, 0xf0a0a0);
    // the bowl cut
    mk(root, 0.5, 0.12, 0.5, 0, 1.45, 0, BLOND); // top
    mk(root, 0.48, 0.13, 0.07, 0, 1.33, -0.24, BLOND); // straight fringe
    mk(root, 0.06, 0.24, 0.48, -0.24, 1.28, 0, BLOND); // sides
    mk(root, 0.06, 0.24, 0.48, 0.24, 1.28, 0, BLOND);
    mk(root, 0.48, 0.26, 0.06, 0, 1.28, 0.24, BLOND); // back
    root.scale.set(SCALE_XZ, SCALE_Y, SCALE_XZ);
    this.group.add(root);
    scene.add(this.group);
  }

  /** Put Rory somewhere clear. */
  spawn(at: THREE.Vector3) {
    this.pos.copy(at);
    this.path = [];
    this.sync();
  }

  // Rory cannot be hurt. Pee just makes him laugh.
  hurt(_amount: number, _kind: PeeKind, _from: Combatant | null) {
    this.soaked();
  }
  dot() { /* nothing */ }
  heal() { /* nothing */ }

  private soaked() {
    if (this.soakCd > 0) return;
    this.soakCd = 9;
    this.say(['Me Rory. Me not mind.', 'Ha ha. Tickle.', 'Me Rory. Me wet now.', 'Me Rory. Warm.'][Math.floor(Math.random() * 4)]);
  }

  update(dt: number, player: Player) {
    this.soakCd = Math.max(0, this.soakCd - dt);
    this.greetCd = Math.max(0, this.greetCd - dt);
    this.waveT = Math.max(0, this.waveT - dt);
    const dx = player.pos.x - this.pos.x;
    const dz = player.pos.z - this.pos.z;
    const d = Math.hypot(dx, dz);
    this.speedNow = 0;
    if (player.alive && d < GREET_DIST) {
      // somebody is close: turn round, wave and introduce himself
      this.yaw += Math.max(-3 * dt, Math.min(3 * dt, wrap(Math.atan2(-dx, -dz) - this.yaw)));
      if (!this.greeted && this.greetCd <= 0) {
        this.greeted = true;
        this.greetCd = 25;
        this.waveT = 3.5;
        this.say('Me Rory');
      } else if (this.greeted && this.greetCd <= 0) {
        this.greetCd = 25;
        this.waveT = 2.5;
        this.say('Me Rory');
      }
    } else {
      if (d > 22) this.greeted = false;
      this.wander(dt);
    }
    this.animate(dt);
    this.sync();
  }

  private wander(dt: number) {
    if (this.pauseT > 0) { this.pauseT -= dt; return; }
    if (!this.path.length) {
      const goal = this.nav.randomFreePoint();
      this.path = this.nav.findPath(this.pos, goal) ?? [];
      this.pathIdx = 0;
      if (!this.path.length) this.pauseT = 1.5;
      return;
    }
    const wp = this.path[this.pathIdx];
    const dx = wp.x - this.pos.x;
    const dz = wp.z - this.pos.z;
    const d = Math.hypot(dx, dz) || 0.01;
    if (d < 1.5) {
      if (++this.pathIdx >= this.path.length) { this.path = []; this.pauseT = 2 + Math.random() * 5; }
      return;
    }
    this.yaw += Math.max(-2.5 * dt, Math.min(2.5 * dt, wrap(Math.atan2(-dx, -dz) - this.yaw)));
    const bx = this.pos.x;
    const bz = this.pos.z;
    this.world.moveAxis(this.pos, HW, H, 'x', (dx / d) * SPEED * dt);
    this.world.moveAxis(this.pos, HW, H, 'z', (dz / d) * SPEED * dt);
    const moved = Math.hypot(this.pos.x - bx, this.pos.z - bz);
    this.speedNow = moved / dt;
    if (moved < 0.3 * SPEED * dt) {
      this.stuckT += dt;
      if (this.stuckT > 1) { this.stuckT = 0; this.path = []; this.pauseT = 0.5; }
    } else this.stuckT = 0;
  }

  private animate(dt: number) {
    this.phase += this.speedNow * dt * 2.2;
    const sw = Math.sin(this.phase) * Math.min(1, this.speedNow / 1.5) * 0.7;
    this.legL.rotation.x = sw;
    this.legR.rotation.x = -sw;
    this.armL.rotation.x = -sw * 0.8;
    if (this.waveT > 0) { // big wave
      this.armR.rotation.x = -2.6;
      this.armR.rotation.z = Math.sin(performance.now() * 0.014) * 0.5 - 0.2;
    } else {
      this.armR.rotation.x = sw * 0.8;
      this.armR.rotation.z = 0;
    }
  }

  private sync() {
    this.group.position.copy(this.pos);
    this.group.rotation.y = this.yaw;
  }
}

function wrap(a: number): number {
  while (a > Math.PI) a -= 2 * Math.PI;
  while (a < -Math.PI) a += 2 * Math.PI;
  return a;
}
