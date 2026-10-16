import * as THREE from 'three';
import { SoftBox, lit } from './organic';
import { randomBugName } from './talk';
import { PEE, type Combatant, type PeeKind } from './combat';

export type MountType = 'spider' | 'beetle' | 'ladybug';

export interface MountDef {
  name: string;
  hp: number;
  speed: number;
  /** How high the rider sits above the ground. */
  lift: number;
  /** Collision half-width while riding. */
  hw: number;
  /** Pee cannon: droplet rate multiplier, spread, and how slowly the bladder drains. */
  rate: number;
  spread: number;
  drain: number;
  hitR2: number;
}

export const MOUNT_DEFS: Record<MountType, MountDef> = {
  spider: { name: 'Disco Spider', hp: 220, speed: 7.2, lift: 0.95, hw: 0.6, rate: 2, spread: 0.05, drain: 0.5, hitR2: 0.85 },
  beetle: { name: 'Tank Beetle', hp: 420, speed: 4.6, lift: 0.8, hw: 0.7, rate: 3, spread: 0.12, drain: 0.5, hitR2: 1.2 },
  ladybug: { name: 'Zoom Ladybug', hp: 150, speed: 9, lift: 0.7, hw: 0.5, rate: 1.5, spread: 0.035, drain: 0.4, hitR2: 0.7 },
};

/** Anything that can climb on a bug: the player and the bots. */
export interface Rider extends Combatant {
  mount: Mount | null;
  yaw: number;
  /** Called when the bug is blown out from under them. */
  onDismount(): void;
}

const boxGeo = new SoftBox(1, 1, 1);

/** A giant bug with a pee cannon on its back. */
export class Mount {
  readonly group = new THREE.Group();
  readonly pos = new THREE.Vector3();
  readonly home = new THREE.Vector3();
  /** Every bug has a name. Its rider will scream it. */
  readonly petName = randomBugName();
  yaw = 0;
  hp: number;
  readonly maxHp: number;
  rider: Rider | null = null;
  alive = true;
  respawnT = 0;
  flash = 0;
  speedNow = 0;
  private legs: { g: THREE.Group; side: number; idx: number }[] = [];
  private bodyMat: THREE.MeshLambertMaterial;
  private glowMat: THREE.MeshBasicMaterial;
  private tipMat: THREE.MeshBasicMaterial;
  private phase = Math.random() * 6;
  private hueOff = Math.random();
  private lx = 0;
  private lz = 0;

  constructor(scene: THREE.Scene, readonly type: MountType, home: THREE.Vector3, private mgr: Mounts) {
    this.home.copy(home);
    this.pos.copy(home);
    const def = MOUNT_DEFS[type];
    this.hp = this.maxHp = def.hp;
    // garden-ornament bugs: glossy painted bodies, big googly eyes, rosy cheeks, a white beard and a pointy hat
    this.bodyMat = lit({ color: 0xffffff });
    const darkMat = lit({ color: type === 'ladybug' ? 0x161616 : type === 'beetle' ? 0x6a3a1a : 0x4a2a6a });
    this.glowMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    this.tipMat = new THREE.MeshBasicMaterial({ color: 0xf2d83a });
    const saddleMat = lit({ color: 0x7a2a3a });
    const whiteMat = lit({ color: 0xf7f4ec });
    const pinkMat = lit({ color: 0xe8808a });
    const cheekMat = lit({ color: 0xf0a0a0 });
    const blackMat = lit({ color: 0x161616 });
    const hatMat = lit({ color: type === 'beetle' ? 0xe8b830 : type === 'ladybug' ? 0x2b5fe0 : 0xd42b2b });
    const box = (m: THREE.Material, w: number, h: number, d: number, x: number, y: number, z: number, parent: THREE.Object3D = this.group) => {
      const mesh = new THREE.Mesh(boxGeo, m);
      mesh.scale.set(w, h, d);
      mesh.position.set(x, y, z);
      parent.add(mesh);
      return mesh;
    };
    const eyes = (x: number, y: number, z: number, size: number) => {
      for (const sx of [-1, 1]) {
        box(whiteMat, size, size, size * 0.5, sx * x, y, z);
        box(blackMat, size * 0.45, size * 0.45, size * 0.3, sx * x + sx * size * 0.05, y - size * 0.05, z - size * 0.3);
      }
    };
    const cheeks = (x: number, y: number, z: number, size: number) => {
      for (const sx of [-1, 1]) box(cheekMat, size, size * 0.75, size * 0.3, sx * x, y, z);
    };
    const beard = (x: number, y: number, z: number, w: number) => {
      [1, 0.8, 0.55, 0.3].forEach((k, i) => box(whiteMat, w * k, w * 0.26, w * 0.4, x, y - i * w * 0.24, z));
    };
    const hat = (x: number, y: number, z: number, w: number) => {
      box(hatMat, w * 1.3, w * 0.14, w * 1.3, x, y, z);
      [0.95, 0.76, 0.58, 0.4, 0.24].forEach((k, i) => box(hatMat, w * k, w * 0.3, w * k, x, y + w * 0.22 + i * w * 0.3, z + (i >= 3 ? w * 0.08 * (i - 2) : 0)));
      box(this.glowMat, w * 0.14, w * 0.14, w * 0.14, x, y + w * 1.55, z + w * 0.22); // a glowing bobble on the bent tip
    };
    const dot = (x: number, y: number, z: number, size: number) => box(whiteMat, size, size * 0.3, size, x, y, z);
    const leg = (side: number, z: number, y: number, reach: number, drop: number, idx: number, thick = 0.14) => {
      const g = new THREE.Group();
      g.position.set(side * 0.3, y, z);
      box(darkMat, reach, thick, thick, side * reach * 0.5, 0.12, 0, g);
      box(darkMat, thick, drop, thick, side * reach, 0.12 - drop * 0.5, 0, g);
      box(blackMat, thick * 1.7, thick * 0.9, thick * 2.4, side * reach, 0.12 - drop + thick * 0.2, -thick * 0.4, g); // a little black boot
      this.group.add(g);
      this.legs.push({ g, side, idx });
    };
    if (type === 'spider') {
      box(this.bodyMat, 1.0, 0.72, 1.1, 0, 0.85, 0.55); // painted abdomen with white polka dots
      for (const [x, z] of [[-0.27, 0.25], [0.27, 0.25], [0, 0.6], [-0.27, 0.95], [0.27, 0.95]]) dot(x, 1.22, z, 0.22);
      for (const sx of [-1, 1]) for (const z of [0.3, 0.8]) box(whiteMat, 0.04, 0.2, 0.2, sx * 0.51, 0.9, z);
      box(darkMat, 0.7, 0.55, 0.6, 0, 0.8, -0.2); // thorax
      box(this.bodyMat, 0.66, 0.52, 0.52, 0, 0.88, -0.72); // big round head
      eyes(0.17, 1.0, -1.0, 0.2);
      box(pinkMat, 0.14, 0.14, 0.12, 0, 0.88, -1.02); // round nose
      cheeks(0.25, 0.8, -0.99, 0.12);
      beard(0, 0.68, -0.98, 0.5);
      hat(0, 1.14, -0.72, 0.5);
      for (const sx of [-1, 1]) {
        box(darkMat, 0.16, 0.16, 0.95, sx * 0.44, 1.32, -0.2); // pee cannons on its back
        box(this.tipMat, 0.22, 0.22, 0.06, sx * 0.44, 1.32, -0.7);
      }
      box(saddleMat, 0.45, 0.1, 0.45, 0, 1.22, 0.05);
      for (let i = 0; i < 4; i++) { leg(-1, -0.45 + i * 0.32, 0.8, 0.85, 0.95, i); leg(1, -0.45 + i * 0.32, 0.8, 0.85, 0.95, i); }
    } else if (type === 'beetle') {
      box(this.bodyMat, 1.35, 0.7, 1.7, 0, 0.75, 0.2); // shell
      box(whiteMat, 0.06, 0.04, 1.7, 0, 1.1, 0.2);
      for (const z of [-0.25, 0.3, 0.85]) for (const sx of [-1, 1]) dot(sx * 0.42, 1.11, z, 0.26);
      box(darkMat, 0.8, 0.56, 0.56, 0, 0.66, -0.95); // head
      eyes(0.2, 0.82, -1.25, 0.22);
      box(pinkMat, 0.16, 0.16, 0.14, 0, 0.66, -1.25);
      cheeks(0.3, 0.58, -1.24, 0.13);
      beard(0, 0.46, -1.22, 0.58);
      hat(0, 0.96, -0.95, 0.56);
      for (const sx of [-1, 1]) {
        box(darkMat, 0.2, 0.2, 1.05, sx * 0.47, 1.22, -0.2); // twin heavy cannons
        box(this.tipMat, 0.28, 0.28, 0.06, sx * 0.47, 1.22, -0.74);
      }
      box(saddleMat, 0.55, 0.1, 0.55, 0, 1.13, 0.35);
      for (let i = 0; i < 3; i++) { leg(-1, -0.3 + i * 0.55, 0.55, 0.8, 0.6, i, 0.16); leg(1, -0.3 + i * 0.55, 0.55, 0.8, 0.6, i, 0.16); }
    } else {
      box(this.bodyMat, 1.15, 0.6, 1.3, 0, 0.62, 0.15); // red shell, black spots
      box(darkMat, 0.05, 0.04, 1.3, 0, 0.93, 0.15);
      for (const [x, z] of [[-0.3, -0.15], [0.3, -0.15], [-0.3, 0.45], [0.3, 0.45]]) box(darkMat, 0.26, 0.05, 0.26, x, 0.93, z);
      box(darkMat, 0.7, 0.46, 0.46, 0, 0.56, -0.72); // head
      eyes(0.17, 0.7, -0.97, 0.2);
      box(pinkMat, 0.13, 0.13, 0.12, 0, 0.56, -0.97);
      cheeks(0.25, 0.48, -0.96, 0.11);
      beard(0, 0.38, -0.95, 0.38);
      hat(0, 0.8, -0.72, 0.46);
      for (const sx of [-1, 1]) {
        box(darkMat, 0.05, 0.4, 0.05, sx * 0.3, 1.1, -0.5); // antennae with glowing bobbles
        box(this.glowMat, 0.12, 0.12, 0.12, sx * 0.3, 1.33, -0.5);
        box(darkMat, 0.14, 0.14, 0.75, sx * 0.4, 1.0, 0.2); // twin pea-shooters
        box(this.tipMat, 0.2, 0.2, 0.06, sx * 0.4, 1.0, -0.2);
      }
      box(saddleMat, 0.4, 0.08, 0.4, 0, 0.97, 0.35);
      for (let i = 0; i < 3; i++) { leg(-1, -0.2 + i * 0.4, 0.45, 0.6, 0.5, i); leg(1, -0.2 + i * 0.4, 0.45, 0.6, 0.5, i); }
    }
    this.group.position.copy(home);
    scene.add(this.group);
  }

  get def(): MountDef {
    return MOUNT_DEFS[this.type];
  }

  /** The rider's pee hits the bug first. Returns true if that finished it off. */
  damage(amount: number, kind: PeeKind, from: Combatant | null): boolean {
    if (!this.alive) return false;
    this.hp -= amount * 0.6;
    this.flash = 0.18;
    this.mgr.onHurt?.(this);
    if (this.hp <= 0) { this.mgr.breakMount(this, from, kind); return true; }
    return false;
  }

  reset() {
    this.alive = true;
    this.rider = null;
    this.hp = this.maxHp;
    this.pos.copy(this.home);
    this.group.visible = true;
    this.group.position.copy(this.home);
    this.group.rotation.y = this.yaw = Math.random() * 6.28;
  }

  update(dt: number, t: number) {
    if (!this.alive) {
      this.respawnT -= dt;
      if (this.respawnT <= 0) this.reset();
      return;
    }
    if (this.rider) {
      this.pos.copy(this.rider.pos);
      this.yaw = this.rider.yaw;
      this.tipMat.color.setHex(PEE[this.rider.potion?.kind ?? 'normal'].color);
    } else {
      this.tipMat.color.setHex(0xf2d83a);
    }
    const moved = Math.hypot(this.pos.x - this.lx, this.pos.z - this.lz);
    this.lx = this.pos.x;
    this.lz = this.pos.z;
    this.speedNow = dt > 0 ? moved / dt : 0;
    this.phase += moved * 3.2;
    const idle = this.rider ? 0 : Math.sin(t * 1.5 + this.hueOff * 9) * 0.03; // fidgets while waiting
    const amp = Math.min(1, this.speedNow / 2.5);
    for (const l of this.legs) {
      const p = this.phase + l.idx * 1.7 + (l.side > 0 ? Math.PI : 0);
      l.g.rotation.y = l.side * Math.sin(p) * 0.45 * amp + idle;
      l.g.rotation.z = Math.max(0, Math.cos(p)) * 0.22 * amp * l.side * -1;
    }
    this.group.position.set(this.pos.x, this.pos.y + Math.abs(Math.sin(this.phase * 0.5)) * 0.06 * amp, this.pos.z);
    this.group.rotation.y = this.yaw;
    // the shell slowly shimmers through the rainbow; a hit flashes it white
    if (this.flash > 0) {
      this.flash -= dt;
      this.bodyMat.color.setRGB(2, 2, 2);
    } else if (this.type === 'ladybug') {
      this.bodyMat.color.setHSL(0.99 + Math.sin(t * 0.5 + this.hueOff * 6) * 0.04, 0.95, 0.5);
    } else {
      this.bodyMat.color.setHSL((t * 0.06 + this.hueOff) % 1, 0.85, 0.5);
    }
    this.glowMat.color.setHSL((t * 0.35 + this.hueOff + 0.5) % 1, 1, 0.6);
  }
}

export interface MountSpot {
  type: MountType;
  pos: THREE.Vector3;
}

/** All the rideable bugs in the forest. */
export class Mounts {
  readonly list: Mount[] = [];
  onBreak: ((m: Mount, rider: Rider | null, from: Combatant | null, kind: PeeKind) => void) | null = null;
  onHurt: ((m: Mount) => void) | null = null;

  constructor(scene: THREE.Scene, spots: MountSpot[]) {
    for (const s of spots) this.list.push(new Mount(scene, s.type, s.pos, this));
  }

  /** The closest unridden bug within `maxDist`. */
  nearestFree(x: number, z: number, maxDist: number): Mount | null {
    let best: Mount | null = null;
    let bd = maxDist;
    for (const m of this.list) {
      if (!m.alive || m.rider) continue;
      const d = Math.hypot(m.pos.x - x, m.pos.z - z);
      if (d < bd) { bd = d; best = m; }
    }
    return best;
  }

  board(m: Mount, who: Rider) {
    if (!m.alive || m.rider || who.mount) return;
    m.rider = who;
    who.mount = m;
    who.hitR2 = m.def.hitR2;
    who.hitH = 1.6 + m.def.lift;
    who.pos.x = m.pos.x;
    who.pos.z = m.pos.z;
    who.yaw = m.yaw;
  }

  dismount(who: Rider) {
    const m = who.mount;
    if (!m) return;
    who.mount = null;
    who.hitR2 = undefined;
    who.hitH = undefined;
    m.rider = null;
    m.pos.copy(who.pos);
  }

  breakMount(m: Mount, from: Combatant | null, kind: PeeKind) {
    const rider = m.rider;
    if (rider) { this.dismount(rider); rider.onDismount(); }
    m.alive = false;
    m.respawnT = 40;
    m.group.visible = false;
    this.onBreak?.(m, rider, from, kind);
  }

  reset() {
    for (const m of this.list) {
      if (m.rider) { m.rider.mount = null; m.rider.hitR2 = undefined; m.rider.hitH = undefined; }
      m.reset();
    }
  }

  update(dt: number, t: number) {
    for (const m of this.list) m.update(dt, t);
  }
}
