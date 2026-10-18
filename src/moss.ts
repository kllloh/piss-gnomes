import * as THREE from 'three';
import { SoftBox, lit } from './organic';
import { Status, type Combatant, type PotionState } from './combat';
import type { Effects } from './fx';

const RISE_TIME = 8;
const STRIKE_RADIUS = 4.5;
const TELEGRAPH = 1.5;

interface Beam {
  eye: THREE.Vector3;
  to: THREE.Vector3;
  t: number;
  fired: boolean;
  marker: THREE.Mesh;
  aim: THREE.Line;
  ray?: THREE.Mesh;
  glow?: THREE.Mesh;
}

/**
 * Moss: a gigantic tuxedo cat who sits on the horizon in the end game and fires lasers out of his eyes.
 * He is also a Combatant-shaped name tag, so kills can be credited to him.
 */
export class Moss implements Combatant {
  readonly id = -5;
  readonly name = 'Moss';
  readonly team = 0 as const;
  readonly isPlayer = false;
  readonly isNpc = true;
  readonly status = new Status();
  readonly pos = new THREE.Vector3();
  readonly group = new THREE.Group();
  readonly hitR2 = 0;
  readonly hitH = 0;
  alive = false; // never a target
  hp = 1;
  maxHp = 1;
  potion: PotionState | null = null;
  bladder = 0;
  active = false;
  /** Picks where the next laser lands; null if there is nobody left. */
  pickTarget: () => { x: number; z: number } | null = () => null;
  /** A laser has landed here. */
  onStrike: ((x: number, z: number) => void) | null = null;
  onArrive: (() => void) | null = null;

  private head = new THREE.Group();
  private eyes: THREE.Mesh[] = [];
  private tail: THREE.Group[] = [];
  private beams: Beam[] = [];
  private riseT = 0;
  private fireT = 3;
  private eyeIdx = 0;
  private clock = 0;

  constructor(private scene: THREE.Scene, private fx: Effects) {
    const black = lit({ color: 0x0b0b12, fog: false });
    const white = lit({ color: 0xf6f6f6, fog: false });
    const pink = lit({ color: 0xe88aa0, fog: false });
    const glow = new THREE.MeshBasicMaterial({ color: 0xff3030, fog: false });
    const add = (parent: THREE.Object3D, mat: THREE.Material, w: number, h: number, d: number, x: number, y: number, z: number) => {
      const m = new THREE.Mesh(new SoftBox(w, h, d), mat);
      m.position.set(x, y, z);
      parent.add(m);
      return m;
    };
    const g = this.group;
    // a sitting tuxedo cat, front is -z, about 190 m tall
    add(g, black, 62, 72, 72, 0, 36, 4); // body
    add(g, white, 34, 54, 10, 0, 40, -33); // the white tuxedo bib
    add(g, white, 16, 12, 24, -13, 6, -42); // white socks on the front paws
    add(g, white, 16, 12, 24, 13, 6, -42);
    add(g, black, 14, 34, 16, -13, 20, -38); // front legs
    add(g, black, 14, 34, 16, 13, 20, -38);
    add(g, white, 16, 12, 24, -24, 5, 28); // back feet
    add(g, white, 16, 12, 24, 24, 5, 28);
    this.head.position.set(0, 90, -26);
    g.add(this.head);
    add(this.head, black, 48, 42, 42, 0, 0, 0); // head
    add(this.head, white, 24, 16, 12, 0, -6, -22); // white muzzle
    add(this.head, pink, 7, 5, 5, 0, -1, -27.5); // nose
    for (const sx of [-1, 1]) {
      add(this.head, black, 11, 20, 9, sx * 16, 28, 2); // ears
      add(this.head, pink, 6, 12, 4, sx * 16, 27, -2);
      const eye = add(this.head, glow, 13, 15, 3, sx * 12, 5, -21.5); // the laser eyes
      this.eyes.push(eye);
      add(this.head, black, 3, 13, 2, sx * 12, 5, -23.5); // slit pupils
      for (let w = 0; w < 3; w++) add(this.head, white, 30, 0.9, 0.9, sx * 28, -4 + w * 3, -22); // whiskers
    }
    let parent: THREE.Object3D = g;
    for (let i = 0; i < 6; i++) { // a long tail
      const seg = new THREE.Group();
      seg.position.set(0, i === 0 ? 14 : 0, i === 0 ? 40 : 18);
      add(seg, black, 9, 9, 20, 0, 0, 9);
      parent.add(seg);
      this.tail.push(seg);
      parent = seg;
    }
    g.scale.setScalar(1.6); // about 190 m tall: big enough to tower over the trees
    g.visible = false;
    scene.add(g);
  }

  /** The end game starts: Moss rises over the horizon. */
  arrive() {
    if (this.active) return;
    this.active = true;
    // somewhere up north, looking in at the forest
    const spots: [number, number][] = [[0, -250], [150, -215], [-150, -215]];
    const [x, z] = spots[Math.floor(Math.random() * spots.length)];
    this.pos.set(x, 0, z);
    this.group.position.set(x, -230, z);
    this.group.rotation.y = Math.atan2(-(0 - x), -(0 - z));
    this.group.visible = true;
    this.riseT = 0;
    this.fireT = 3.5;
    this.onArrive?.();
  }

  reset() {
    this.active = false;
    this.group.visible = false;
    for (const b of this.beams) this.dropBeam(b);
    this.beams.length = 0;
  }

  hurt() { /* a tuxedo cat the size of a mountain does not care */ }
  dot() { /* nothing */ }
  heal() { /* nothing */ }

  private dropBeam(b: Beam) {
    this.scene.remove(b.marker, b.aim);
    if (b.ray) this.scene.remove(b.ray);
    if (b.glow) this.scene.remove(b.glow);
  }

  private eyeWorld(i: number, out: THREE.Vector3) {
    this.group.updateMatrixWorld(true);
    return this.eyes[i].getWorldPosition(out);
  }

  update(dt: number) {
    if (!this.active) return;
    this.clock += dt;
    // rising over the horizon
    this.riseT = Math.min(RISE_TIME, this.riseT + dt);
    const k = this.riseT / RISE_TIME;
    this.group.position.y = -230 * (1 - k * k * (3 - 2 * k));
    this.tail.forEach((s, i) => {
      s.rotation.y = Math.sin(this.clock * 0.9 - i * 0.6) * 0.3;
      s.rotation.x = i === 0 ? -0.7 : -0.1;
    });
    this.head.rotation.y = Math.sin(this.clock * 0.3) * 0.15;
    // the eyes glow brighter when about to fire
    const charge = this.beams.some((b) => !b.fired);
    for (const e of this.eyes) (e.material as THREE.MeshBasicMaterial).color.setHex(charge ? 0xffa0a0 : 0xff3030);

    if (this.riseT >= RISE_TIME) {
      this.fireT -= dt;
      if (this.fireT <= 0) {
        this.fireT = Math.max(1.3, 2.8 - this.clock * 0.01);
        const target = this.pickTarget();
        if (target) this.aim(target.x, target.z);
      }
    }

    for (let i = this.beams.length - 1; i >= 0; i--) {
      const b = this.beams[i];
      b.t += dt;
      if (!b.fired) {
        const pulse = 0.3 + 0.25 * Math.sin(b.t * 16);
        (b.marker.material as THREE.MeshBasicMaterial).opacity = pulse;
        if (b.t >= 0) { // fire!
          b.fired = true;
          this.scene.remove(b.aim);
          this.scene.remove(b.marker);
          const len = b.eye.distanceTo(b.to);
          const mid = b.eye.clone().lerp(b.to, 0.5);
          b.ray = new THREE.Mesh(new THREE.BoxGeometry(1.4, 1.4, len), new THREE.MeshBasicMaterial({ color: 0xff2a2a, fog: false, depthWrite: false }));
          b.ray.position.copy(mid);
          b.ray.lookAt(b.to);
          b.glow = new THREE.Mesh(new THREE.BoxGeometry(5, 5, len), new THREE.MeshBasicMaterial({ color: 0xff6a4a, transparent: true, opacity: 0.3, fog: false, depthWrite: false }));
          b.glow.position.copy(mid);
          b.glow.lookAt(b.to);
          this.scene.add(b.ray, b.glow);
          this.fx.burst(new THREE.Vector3(b.to.x, 1.5, b.to.z), 0xff5a30, 24, 11, 2.4);
          this.fx.burst(new THREE.Vector3(b.to.x, 1.5, b.to.z), 0xffffff, 10, 7, 1.6);
          this.onStrike?.(b.to.x, b.to.z);
        }
      } else if (b.t > 0.55) {
        this.dropBeam(b);
        this.beams.splice(i, 1);
      } else if (b.glow) {
        (b.glow.material as THREE.MeshBasicMaterial).opacity = 0.3 * (1 - b.t / 0.55);
      }
    }
  }

  private aim(x: number, z: number) {
    const eye = this.eyeWorld(this.eyeIdx++ % 2, new THREE.Vector3());
    const to = new THREE.Vector3(x, 0.3, z);
    const marker = new THREE.Mesh(new THREE.CylinderGeometry(STRIKE_RADIUS, STRIKE_RADIUS, 0.12, 24), new THREE.MeshBasicMaterial({ color: 0xff2020, transparent: true, opacity: 0.4, depthWrite: false }));
    marker.position.set(x, 0.1, z);
    const aim = new THREE.Line(new THREE.BufferGeometry().setFromPoints([eye.clone(), to.clone()]), new THREE.LineBasicMaterial({ color: 0xff5050, transparent: true, opacity: 0.8, fog: false }));
    this.scene.add(marker, aim);
    this.beams.push({ eye, to, t: -TELEGRAPH, fired: false, marker, aim });
  }

  get radius() {
    return STRIKE_RADIUS;
  }
}
