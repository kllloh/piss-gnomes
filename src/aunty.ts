import * as THREE from 'three';
import { SoftBox, lit } from './organic';
import type { Effects } from './fx';
import { HALF } from './forest';

const SPEED = 2.4;
const LINES = [
  'Stop that fighting at once!',
  'Look at the MESS you have made!',
  'Who is going to clean this up? Not me!',
  'Wipe your feet, all of you!',
  'In my day we settled things with a nice cup of tea.',
  'You are all grounded!',
  'I have told you gnomes before!',
  'Put that jug down this instant!',
  'Pee in the toilet like everybody else!',
  'Honestly. Nobody ever listens to Aunty Ali.',
];
const pick = <T,>(a: T[]): T => a[Math.floor(Math.random() * a.length)];

function wrap(a: number): number {
  while (a > Math.PI) a -= 2 * Math.PI;
  while (a < -Math.PI) a += 2 * Math.PI;
  return a;
}

/**
 * Aunty Ali: an old woman with brown hair and a broom, as big as Derek, who wanders the forest sweeping and
 * telling the gnomes off for the mess. She has no effect on anything: pee goes through her and bots ignore her.
 */
export class AuntyAli {
  readonly group = new THREE.Group();
  readonly pos = new THREE.Vector3();
  yaw = 0;
  onSay: ((text: string) => void) | null = null;

  private broom = new THREE.Group();
  private body = new THREE.Group();
  private tx = 0;
  private tz = 0;
  private retarget = 0;
  private chat = 6;
  private dust = 0;
  private clock = Math.random() * 10;

  constructor(scene: THREE.Scene, private fx: Effects) {
    const g = this.group;
    const add = (parent: THREE.Object3D, mat: THREE.Material, w: number, h: number, d: number, x: number, y: number, z: number) => {
      const m = new THREE.Mesh(new SoftBox(w, h, d), mat);
      m.position.set(x, y, z);
      m.castShadow = true;
      parent.add(m);
      return m;
    };
    const dress = lit({ color: 0x7a5a9a });
    const cardigan = lit({ color: 0xb05a7a });
    const apron = lit({ color: 0xf4f0e0 });
    const skin = lit({ color: 0xe8c0a0 });
    const hair = lit({ color: 0x5a3a22 });
    const slipper = lit({ color: 0xe88aa0 });
    const white = lit({ color: 0xf8f8f8 });
    const dark = lit({ color: 0x222222 });
    const wood = lit({ color: 0x8a5a30 });
    const straw = lit({ color: 0xd8b050 });

    // long skirt, three tiers
    add(g, dress, 7.2, 2.6, 5.4, 0, 1.3, 0);
    add(g, dress, 6.4, 2.6, 4.8, 0, 3.9, 0);
    add(g, dress, 5.6, 2.6, 4.4, 0, 6.5, 0);
    for (const sx of [-1, 1]) add(g, slipper, 1.8, 0.9, 3.0, sx * 1.4, 0.45, -2.6); // fluffy slippers peeking out
    // the top half sways a little as she walks
    this.body.position.y = 7.8;
    g.add(this.body);
    add(this.body, cardigan, 5.2, 5.2, 3.8, 0, 2.6, 0);
    add(this.body, apron, 3.6, 5.8, 0.4, 0, 1.4, -2.0); // flowery apron
    for (const y of [3.2, 1.8]) add(this.body, lit({ color: 0xf2c31a }), 0.45, 0.45, 0.2, 0.9, y, -2.15); // cardigan buttons
    add(this.body, white, 4.6, 0.6, 3.9, 0, 5.3, 0); // lace collar
    // arms: the left hangs, the right holds the broom
    const armL = new THREE.Group();
    armL.position.set(-3.2, 4.8, 0);
    add(armL, cardigan, 1.4, 4.4, 1.5, 0, -2.2, 0);
    add(armL, skin, 1.5, 1.2, 1.5, 0, -4.8, 0);
    this.body.add(armL);
    const armR = new THREE.Group();
    armR.position.set(3.2, 4.8, 0);
    armR.rotation.x = -0.7;
    add(armR, cardigan, 1.4, 3.2, 1.5, 0, -1.6, -0.2);
    add(armR, skin, 1.5, 1.3, 1.5, 0, -3.6, -0.4);
    this.body.add(armR);
    // the broom, held at the hand and swung to sweep
    this.broom.position.set(3.4, 1.6, -2.6);
    add(this.broom, wood, 0.4, 13, 0.4, 0, -3.4, 0);
    add(this.broom, lit({ color: 0xb02020 }), 1.4, 0.6, 1.4, 0, -8.6, 0);
    add(this.broom, straw, 2.8, 3.2, 2.8, 0, -10.6, 0);
    this.body.add(this.broom);
    // the head: old, brown hair in a bun, glasses, a scolding mouth
    add(this.body, skin, 3.8, 4.0, 3.6, 0, 7.4, 0);
    add(this.body, hair, 4.2, 1.5, 4.0, 0, 9.6, 0.1);
    add(this.body, hair, 0.7, 3.2, 3.8, -2.0, 8.4, 0.1);
    add(this.body, hair, 0.7, 3.2, 3.8, 2.0, 8.4, 0.1);
    add(this.body, hair, 4.2, 3.6, 0.7, 0, 8.4, 2.0);
    add(this.body, hair, 2.2, 2.2, 2.2, 0, 10.8, 1.2); // the bun
    for (const sx of [-1, 1]) {
      add(this.body, lit({ color: 0xbfe6ff }), 1.2, 1.0, 0.2, sx * 0.9, 7.9, -1.85); // glasses
      add(this.body, dark, 1.5, 0.15, 0.2, sx * 0.9, 8.5, -1.85);
      add(this.body, dark, 0.4, 0.4, 0.15, sx * 0.9, 7.9, -1.95);
      add(this.body, lit({ color: 0xf0a0a0 }), 0.9, 0.7, 0.2, sx * 1.4, 6.7, -1.85); // rosy cheeks
      add(this.body, skin, 0.5, 1.0, 0.7, sx * 2.1, 7.3, 0); // ears
    }
    add(this.body, dark, 1.0, 0.2, 0.2, 0, 7.9, -1.85); // glasses bridge
    add(this.body, lit({ color: 0xd8a888 }), 0.7, 1.0, 0.7, 0, 7.2, -2.1); // nose
    add(this.body, lit({ color: 0x8a2a2a }), 1.4, 0.7, 0.3, 0, 6.1, -1.85); // mouth open mid-lecture
    g.scale.setScalar(0.85);
    scene.add(g);
  }

  spawn(x: number, z: number) {
    this.pos.set(x, 0, z);
    this.pickTarget();
    this.chat = 6;
    this.sync();
  }

  private pickTarget() {
    const r = HALF - 10;
    this.tx = (Math.random() * 2 - 1) * r;
    this.tz = (Math.random() * 2 - 1) * r;
    this.retarget = 25 + Math.random() * 15;
  }

  update(dt: number, playerX: number, playerZ: number) {
    this.clock += dt;
    this.retarget -= dt;
    if (Math.hypot(this.tx - this.pos.x, this.tz - this.pos.z) < 12 || this.retarget <= 0) this.pickTarget();
    const want = Math.atan2(-(this.tx - this.pos.x), -(this.tz - this.pos.z));
    this.yaw += Math.max(-0.5 * dt, Math.min(0.5 * dt, wrap(want - this.yaw)));
    this.pos.x += -Math.sin(this.yaw) * SPEED * dt;
    this.pos.z += -Math.cos(this.yaw) * SPEED * dt;
    // sweeping as she goes
    const sweep = Math.sin(this.clock * 2.4);
    this.broom.rotation.x = 0.25 + sweep * 0.22;
    this.broom.rotation.z = Math.sin(this.clock * 1.2) * 0.12;
    this.body.rotation.z = Math.sin(this.clock * 1.5) * 0.04;
    this.body.position.y = 7.8 + Math.abs(Math.sin(this.clock * 1.5)) * 0.15;
    this.dust -= dt;
    if (this.dust <= 0) {
      this.dust = 0.5;
      const bx = this.pos.x - Math.sin(this.yaw) * 4.2;
      const bz = this.pos.z - Math.cos(this.yaw) * 4.2;
      this.fx.cloud(new THREE.Vector3(bx, 0.6, bz), 0xc8b090, 1.5, 2, 1.2);
    }
    // telling off whoever is near enough to hear
    this.chat -= dt;
    if (this.chat <= 0) {
      this.chat = 10 + Math.random() * 6;
      if (Math.hypot(playerX - this.pos.x, playerZ - this.pos.z) < 90) this.onSay?.(pick(LINES));
    }
    this.sync();
  }

  private sync() {
    this.group.position.x = this.pos.x;
    this.group.position.z = this.pos.z;
    this.group.rotation.y = this.yaw;
  }
}
