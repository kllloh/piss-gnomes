import * as THREE from 'three';
import type { World } from './world';
import type { Combatant } from './combat';
import { Status, soak, type PeeKind, type PotionState } from './combat';
import type { Mount, Rider } from './mounts';

export const REGEN_DELAY = 5;
export const REGEN_RATE = 9; // hp per second
export const PLAYER_HW = 0.3;
export const PLAYER_H = 1.75;
export const EYE = 1.6;

export const GRAVITY_BASE = 24;
const JUMP = 7.5;
const RUN = 5.6;

export class Player implements Rider {
  readonly id = -1;
  readonly name = 'You';
  readonly isPlayer = true;
  readonly team: 0 | 1 = 0;
  readonly pos = new THREE.Vector3();
  readonly vel = new THREE.Vector3();
  readonly status = new Status();
  yaw = 0;
  pitch = 0;
  hp = 100;
  maxHp = 100;
  alive = true;
  onGround = false;
  potion: PotionState | null = null;
  bladder = 100;
  frozen = false; // paused between rounds etc.: can look but not move
  hurtFlash = 0; // 0..1 red-screen flash, decays in main
  deathT = 0;
  shake = 0;
  protect = 0;
  lastFrom: Combatant | null = null;
  lastKind: PeeKind = 'normal';
  mount: Mount | null = null;
  armor = 0;
  /** Seconds since last losing health; after a few quiet seconds health creeps back. */
  sinceHurt = 99;
  get regen(): boolean {
    return this.alive && this.sinceHurt > REGEN_DELAY && this.hp < this.maxHp;
  }
  mods = { double: 0, swirl: 0 };
  hitR2?: number;
  hitH?: number;
  gravityMul = 1; // chaos events
  sens = 1; // mouse sensitivity, lower when scoped
  moveX = 0; // touch stick, -1..1
  moveY = 0;
  jumpHeld = false; // touch jump button
  roll = 0; // psychedelic camera sway, set by the game
  private keys = new Set<string>();

  constructor(private world: World, readonly camera: THREE.PerspectiveCamera) {
    camera.rotation.order = 'YXZ';
    window.addEventListener('keydown', (e) => this.keys.add(e.code));
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.keys.clear());
  }

  get horizSpeed(): number {
    return Math.hypot(this.vel.x, this.vel.z);
  }

  eyePos(out = new THREE.Vector3()): THREE.Vector3 {
    return out.set(this.pos.x, this.pos.y + EYE + (this.mount?.def.lift ?? 0), this.pos.z);
  }

  look(dx: number, dy: number) {
    if (!this.alive) return;
    this.yaw -= dx * 0.0022 * this.sens;
    this.pitch = Math.max(-1.5, Math.min(1.5, this.pitch - dy * 0.0022 * this.sens));
  }

  onDismount() {
    this.protect = 1.2;
    this.vel.y = 5;
    this.onGround = false;
  }

  hurt(amount: number, kind: PeeKind, from: Combatant | null) {
    if (!this.alive || this.protect > 0) return;
    if (this.mount) { // the bug takes it
      this.hurtFlash = Math.min(1, this.hurtFlash + 0.12);
      this.mount.damage(amount, kind, from);
      return;
    }
    this.hp -= soak(this, amount);
    this.sinceHurt = 0;
    this.lastKind = kind;
    this.hurtFlash = Math.min(1, this.hurtFlash + 0.25);
    this.lastFrom = from;
    if (this.hp <= 0) this.kill();
  }

  dot(amount: number, kind: PeeKind, from: Combatant | null) {
    if (!this.alive || this.protect > 0) return;
    if (this.mount) { this.mount.damage(amount, kind, from); return; }
    this.hp -= soak(this, amount);
    this.sinceHurt = 0;
    this.lastKind = kind;
    this.hurtFlash = Math.max(this.hurtFlash, 0.12);
    this.lastFrom = from;
    if (this.hp <= 0) this.kill();
  }

  heal(amount: number) {
    if (this.alive) this.hp = Math.min(this.maxHp, this.hp + amount);
  }

  private kill() {
    this.hp = 0;
    this.alive = false;
    this.deathT = 0;
    this.vel.set(0, 0, 0);
  }

  respawn(at: THREE.Vector3, yaw: number) {
    this.pos.copy(at);
    this.vel.set(0, 0, 0);
    this.hp = this.maxHp;
    this.alive = true;
    this.status.reset();
    this.potion = null;
    this.armor = 0;
    this.sinceHurt = 99;
    this.mods.double = this.mods.swirl = 0;
    this.bladder = 100;
    this.protect = 2.5;
    this.mount = null;
    this.hitR2 = undefined;
    this.hitH = undefined;
    this.yaw = yaw;
    this.pitch = 0;
    this.camera.rotation.z = 0;
  }

  update(dt: number) {
    this.protect = Math.max(0, this.protect - dt);
    this.mods.double = Math.max(0, this.mods.double - dt);
    this.mods.swirl = Math.max(0, this.mods.swirl - dt);
    this.sinceHurt += dt;
    if (this.regen) this.hp = Math.min(this.maxHp, this.hp + REGEN_RATE * dt);
    if (this.alive) this.move(dt);
    else this.deathT += dt;
    this.shake = Math.max(0, this.shake - dt * 2);
    this.applyCamera();
  }

  private move(dt: number) {
    const stuck = this.frozen || this.status.frozen > 0; // frozen solid: no steering
    const k = stuck ? new Set<string>() : this.keys;
    const f = (k.has('KeyW') ? 1 : 0) - (k.has('KeyS') ? 1 : 0) + (stuck ? 0 : this.moveY);
    const s = (k.has('KeyD') ? 1 : 0) - (k.has('KeyA') ? 1 : 0) + (stuck ? 0 : this.moveX);
    const sin = Math.sin(this.yaw);
    const cos = Math.cos(this.yaw);
    let wx = -sin * f + cos * s;
    let wz = -cos * f - sin * s;
    const len = Math.hypot(wx, wz);
    if (len > 1) { wx /= len; wz /= len; } // (a half-pushed stick walks slower)
    const run = this.mount ? this.mount.def.speed : RUN;
    const speed = (k.has('ShiftLeft') || k.has('ShiftRight') ? run * 0.5 : run) * this.status.speedMul;
    const accel = this.onGround ? 55 : 9;
    const stepX = accel * dt;
    this.vel.x += Math.max(-stepX, Math.min(stepX, wx * speed - this.vel.x));
    this.vel.z += Math.max(-stepX, Math.min(stepX, wz * speed - this.vel.z));

    if (this.onGround && (k.has('Space') || (!stuck && this.jumpHeld))) {
      this.vel.y = JUMP;
      this.onGround = false;
    }

    const hw = this.mount ? this.mount.def.hw : PLAYER_HW;
    const steps = Math.max(1, Math.ceil(dt / 0.01));
    const h = dt / steps;
    for (let i = 0; i < steps; i++) {
      this.vel.y = Math.max(-30, this.vel.y - GRAVITY_BASE * this.gravityMul * h);
      if (this.world.moveAxis(this.pos, hw, PLAYER_H, 'x', this.vel.x * h)) this.vel.x = 0;
      if (this.world.moveAxis(this.pos, hw, PLAYER_H, 'z', this.vel.z * h)) this.vel.z = 0;
      this.onGround = false;
      if (this.world.moveAxis(this.pos, hw, PLAYER_H, 'y', this.vel.y * h)) {
        if (this.vel.y < 0) this.onGround = true;
        this.vel.y = 0;
      }
      if (this.pos.y <= 0) {
        this.pos.y = 0;
        if (this.vel.y < 0) this.vel.y = 0;
        this.onGround = true;
      }
    }
  }

  private applyCamera() {
    const drop = this.alive ? 0 : Math.min(1.3, this.deathT * 3);
    this.camera.position.set(this.pos.x, this.pos.y + EYE + (this.mount?.def.lift ?? 0) - drop, this.pos.z);
    this.camera.rotation.y = this.yaw + (Math.random() - 0.5) * 0.06 * this.shake;
    this.camera.rotation.x = this.pitch + (Math.random() - 0.5) * 0.06 * this.shake;
    this.camera.rotation.z = this.alive ? this.roll : Math.min(1.2, this.deathT * 2);
  }
}
