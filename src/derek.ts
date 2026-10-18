import * as THREE from 'three';
import { SoftBox, lit } from './organic';
import { Status, type Combatant, type PotionState, type SpatialGrid } from './combat';
import type { Effects } from './fx';
import { HALF, type Plant } from './forest';

const SPEED = 11;
const TURN = 0.85; // radians per second: a very big mower
const CUT_RADIUS = 6.5; // the deck is about 13 m wide
const LIFE = 100; // seconds he spends mowing before he drives off home
const SIZE_NOTE = 'about 13 m tall on his mower: ten times a gnome';

const LINES = {
  spawn: ['Right! Which one of you has been in my garden?', 'Get off my lawn, ye little gnomes!', 'Time to cut the grass. And everything on it!'],
  idle: ['Bloomin\' gnomes!', 'I paid good money for this lawn!', 'Is that PEE on my grass?!', 'Mow mow mow! Hee hee!', 'My wife said I could not mow the forest. WATCH ME.', 'This is a very expensive mower, you know!', 'I\'ll have the lot of ye!'],
  mow: ['Ha ha! Mowed it!', 'That\'ll learn ye!', 'Lovely stripes!', 'Grass-cutting is a contact sport!'],
  soaked: ['Oi! Who spat on me mower?!', 'That is NOT water!', 'My overalls! These are good overalls!'],
};
const pick = <T,>(a: T[]): T => a[Math.floor(Math.random() * a.length)];

const near: Combatant[] = [];
const tmp = new THREE.Vector3();

function wrap(a: number): number {
  while (a > Math.PI) a -= 2 * Math.PI;
  while (a < -Math.PI) a += 2 * Math.PI;
  return a;
}

/** Derek: an old farmer with black hair (clean shaven) on a giant ride-on mower. He cannot be stopped, and he mows down plants and gnomes alike. */
export class Derek implements Combatant {
  readonly id = -4;
  readonly name = 'Derek';
  readonly team = 0 as const;
  readonly isPlayer = false;
  readonly isNpc = true;
  readonly status = new Status();
  readonly pos = new THREE.Vector3();
  readonly group = new THREE.Group();
  readonly hitR2 = 36;
  readonly hitH = 14;
  alive = false; // not here until he arrives
  hp = 9999;
  maxHp = 9999;
  potion: PotionState | null = null;
  bladder = 100;
  yaw = 0;
  speedNow = 0;
  readonly note = SIZE_NOTE;
  /** Everything he can cut down. */
  plants: () => Plant[] = () => [];
  /** Called for every gnome (or player) he runs over. */
  onMow: ((victim: Combatant) => void) | null = null;
  onSay: ((text: string) => void) | null = null;
  onMowPlant: ((x: number, z: number) => void) | null = null;
  /** True from his arrival until he has left; once per match. */
  active = false;
  used = false;

  private wheels: THREE.Group[] = [];
  private blades: THREE.Object3D[] = [];
  private wheel!: THREE.Group;
  private life = LIFE;
  private leaving = false;
  private tx = 0;
  private tz = 0;
  private retarget = 0;
  private spray = 0;
  private smoke = 0;
  private chat = 8;
  private soakCd = 0;
  private lastTurn = 0;

  constructor(private scene: THREE.Scene, private fx: Effects) {
    const g = this.group;
    const green = lit({ color: 0x2f9a3a });
    const dgreen = lit({ color: 0x1f6a2a });
    const black = lit({ color: 0x1a1a1a });
    const yellow = lit({ color: 0xf2c31a });
    const glow = new THREE.MeshBasicMaterial({ color: 0xfff0a0 });
    const add = (parent: THREE.Object3D, mat: THREE.Material, w: number, h: number, d: number, x: number, y: number, z: number) => {
      const m = new THREE.Mesh(new SoftBox(w, h, d), mat);
      m.position.set(x, y, z);
      m.castShadow = true;
      parent.add(m);
      return m;
    };

    // --- the mower: front is -z ---
    add(g, green, 8, 1.4, 10.5, 0, 2.3, 0); // chassis
    add(g, dgreen, 6, 2.3, 4.6, 0, 4.0, -3.4); // bonnet
    add(g, black, 5, 1.6, 0.3, 0, 3.9, -5.8); // grille
    for (const sx of [-1, 1]) add(g, glow, 0.9, 0.9, 0.3, sx * 2.3, 4.2, -5.95); // headlights
    add(g, black, 3.2, 0.9, 3.2, 0, 4.1, 3.2); // seat
    add(g, black, 3.2, 3.2, 0.7, 0, 5.5, 4.7); // backrest
    add(g, yellow, 13, 0.7, 5.6, 0, 1.0, -9.2); // the cutting deck, slung out in front of the front wheels
    for (const sx of [-1, 1]) add(g, yellow, 0.8, 0.8, 2.4, sx * 2.6, 1.7, -6.5); // the arms that hold it on
    add(g, black, 13.2, 0.4, 5.8, 0, 0.55, -9.2); // its skirt
    add(g, yellow, 1.6, 1.8, 2.4, 6.9, 1.6, -8.6); // discharge chute
    for (const sx of [-1, 1]) add(g, black, 0.4, 6, 0.4, sx * 3.6, 6.0, 4.6); // roll bar
    add(g, black, 7.6, 0.4, 0.4, 0, 9.1, 4.6);
    const exhaust = add(g, black, 0.5, 3.6, 0.5, 2.5, 6.1, -2.8);
    exhaust.name = 'exhaust';
    for (let i = 0; i < 3; i++) { // three whirring blades under the deck
      const b = add(g, lit({ color: 0xb0b0b8 }), 4.2, 0.12, 0.5, -4 + i * 4, 0.35, -9.2);
      this.blades.push(b);
    }
    const mkWheel = (r: number, w: number, x: number, y: number, z: number) => {
      const wg = new THREE.Group();
      wg.position.set(x, y, z);
      const tyre = new THREE.Mesh(new THREE.CylinderGeometry(r, r, w, 14), black);
      tyre.rotation.z = Math.PI / 2;
      const hub = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.5, r * 0.5, w + 0.15, 8), yellow);
      hub.rotation.z = Math.PI / 2;
      const lug = new THREE.Mesh(new SoftBox(w + 0.3, r * 0.3, r * 0.3), yellow);
      wg.add(tyre, hub, lug);
      g.add(wg);
      this.wheels.push(wg);
    };
    mkWheel(2.8, 1.8, -4.5, 2.8, 3.3);
    mkWheel(2.8, 1.8, 4.5, 2.8, 3.3);
    mkWheel(1.6, 1.2, -3.7, 1.6, -3.7);
    mkWheel(1.6, 1.2, 3.7, 1.6, -3.7);
    // steering wheel: tilted up and back towards the driver, with a column running down into the dashboard
    this.wheel = new THREE.Group();
    this.wheel.position.set(0, 6.5, -0.8);
    this.wheel.rotation.x = -1.1; // the wheel's face points up and back at Derek
    const ring = new THREE.Mesh(new THREE.TorusGeometry(1.1, 0.22, 6, 16), black);
    this.wheel.add(ring);
    add(this.wheel, black, 2.2, 0.2, 0.2, 0, 0, 0); // spokes
    add(this.wheel, black, 0.2, 2.2, 0.2, 0, 0, 0);
    add(this.wheel, yellow, 0.7, 0.7, 0.3, 0, 0, 0.05); // hub cap
    add(this.wheel, black, 0.45, 0.45, 2.7, 0, 0, -1.4); // the column, along the wheel's own axis
    g.add(this.wheel);

    // --- Derek, seated and shouting ---
    const d = new THREE.Group();
    d.position.set(0, 4.6, 3.1);
    g.add(d);
    const skin = lit({ color: 0xe0aa86 });
    const darkSkin = lit({ color: 0xb88060 });
    const shirt = lit({ color: 0xb02020 });
    const blue = lit({ color: 0x3a5a9a });
    const welly = lit({ color: 0x2a6a2a });
    const hair = lit({ color: 0x08080a });
    const grey = lit({ color: 0xbcbcbc });
    add(d, shirt, 3.4, 4.4, 2.2, 0, 3.0, 0); // flannel shirt
    for (const x of [-1.1, 0, 1.1]) add(d, lit({ color: 0x141414 }), 0.25, 4.4, 2.25, x, 3.0, 0); // its dark stripes
    add(d, blue, 2.8, 2.8, 0.35, 0, 2.3, -1.15); // dungaree bib
    for (const sx of [-1, 1]) {
      add(d, blue, 0.4, 2.6, 0.35, sx * 1.1, 4.2, -1.15); // straps
      add(d, yellow, 0.35, 0.35, 0.15, sx * 1.1, 3.4, -1.35); // buttons
    }
    for (const sx of [-1, 1]) { // legs forward onto the footplate
      add(d, blue, 1.2, 1.3, 3.8, sx * 0.9, 0.5, -1.3);
      add(d, blue, 1.1, 3.4, 1.1, sx * 0.9, -1.0, -3.0);
      add(d, welly, 1.3, 1.6, 2.2, sx * 0.9, -2.6, -3.5);
    }
    for (const sx of [-1, 1]) { // arms out to the wheel
      const arm = new THREE.Group();
      arm.position.set(sx * 2.1, 4.6, -0.2);
      arm.rotation.x = 0.5; // upper arm angles forward and down
      arm.rotation.z = -sx * 0.18; // and a little inward
      add(arm, shirt, 1.0, 2.6, 1.0, 0, -1.3, 0);
      const fore = new THREE.Group();
      fore.position.set(0, -2.6, 0);
      fore.rotation.x = 0.9; // forearm reaches forward to the steering wheel
      add(fore, skin, 0.9, 2.2, 0.9, 0, -1.1, 0);
      add(fore, skin, 1.0, 0.9, 1.0, 0, -2.4, 0); // hand
      arm.add(fore);
      d.add(arm);
    }
    // the head: weathered, shouting, with a lot of black hair
    add(d, skin, 2.7, 2.9, 2.6, 0, 6.5, 0);
    add(d, hair, 3.0, 1.0, 2.9, 0, 8.1, 0.05); // black hair on top
    add(d, hair, 0.5, 1.8, 2.7, -1.4, 7.3, 0.05); // sides
    add(d, hair, 0.5, 1.8, 2.7, 1.4, 7.3, 0.05);
    add(d, hair, 2.8, 0.55, 0.5, 0.3, 7.6, -1.3); // fringe
    add(d, hair, 3.0, 2.2, 0.5, 0, 7.4, 1.3); // back
    for (const sx of [-1, 1]) {
      add(d, grey, 0.9, 0.3, 0.3, sx * 0.7, 7.1, -1.35); // bushy grey brows
      add(d, lit({ color: 0xf4f4f4 }), 0.6, 0.45, 0.2, sx * 0.7, 6.7, -1.35); // eyes
      add(d, black, 0.25, 0.3, 0.2, sx * 0.7, 6.65, -1.45);
      add(d, skin, 0.45, 0.9, 0.5, sx * 1.5, 6.3, 0); // ears
    }
    add(d, darkSkin, 0.7, 1.0, 0.8, 0, 6.2, -1.6); // big nose
    add(d, lit({ color: 0x3a1010 }), 1.0, 0.6, 0.3, 0, 4.95, -1.4); // shouting mouth
    for (const y of [7.15, 6.95]) add(d, darkSkin, 1.9, 0.1, 0.1, 0, y + 0.0, -1.32); // forehead wrinkles
    for (const sx of [-1, 1]) add(d, darkSkin, 0.1, 0.9, 0.1, sx * 1.0, 5.6, -1.33); // laughter lines

    g.visible = false;
    scene.add(g);
  }

  /** Arrive at the edge of the map and head in. */
  spawn(x: number, z: number) {
    this.pos.set(x, 0, z);
    this.alive = true;
    this.active = true;
    this.used = true;
    this.leaving = false;
    this.life = LIFE;
    this.chat = 5;
    this.yaw = Math.atan2(-(0 - x), -(0 - z)); // facing the middle
    this.pickTarget();
    this.group.visible = true;
    this.sync();
    this.onSay?.(pick(LINES.spawn));
  }

  despawn() {
    this.alive = false;
    this.active = false;
    this.group.visible = false;
  }

  /** New match: he can come again. */
  reset() {
    this.despawn();
    this.used = false;
  }

  // He is far too big to hurt. Pee just annoys him.
  hurt() {
    if (this.soakCd > 0) return;
    this.soakCd = 7;
    this.onSay?.(pick(LINES.soaked));
  }
  dot() { /* nothing */ }
  heal() { /* nothing */ }

  private pickTarget() {
    const r = HALF - 14;
    this.tx = (Math.random() * 2 - 1) * r;
    this.tz = (Math.random() * 2 - 1) * r;
    this.retarget = 12 + Math.random() * 6;
  }

  update(dt: number, grid: SpatialGrid) {
    if (!this.active) return;
    this.soakCd = Math.max(0, this.soakCd - dt);
    this.life -= dt;
    if (this.life <= 0 && !this.leaving) {
      this.leaving = true; // drive off home, through the nearest edge
      const l = Math.hypot(this.pos.x, this.pos.z) || 1;
      this.tx = (this.pos.x / l) * (HALF + 50);
      this.tz = (this.pos.z / l) * (HALF + 50);
      this.onSay?.('Right, that\'s the lawn done! Tea time!');
    }
    if (!this.leaving) {
      this.retarget -= dt;
      if (Math.hypot(this.tx - this.pos.x, this.tz - this.pos.z) < 16 || this.retarget <= 0) this.pickTarget();
    }
    // steer: a wide, slow turning circle
    const want = Math.atan2(-(this.tx - this.pos.x), -(this.tz - this.pos.z));
    const turn = Math.max(-TURN * dt, Math.min(TURN * dt, wrap(want - this.yaw)));
    this.yaw += turn;
    this.lastTurn = turn / Math.max(dt, 1e-3);
    this.speedNow = SPEED;
    this.pos.x += -Math.sin(this.yaw) * SPEED * dt;
    this.pos.z += -Math.cos(this.yaw) * SPEED * dt;

    if (this.leaving && (Math.abs(this.pos.x) > HALF + 30 || Math.abs(this.pos.z) > HALF + 30)) {
      this.despawn();
      return;
    }

    // cut everything under the deck: the plants...
    const cx = this.pos.x - Math.sin(this.yaw) * 9.2; // the deck is out in front
    const cz = this.pos.z - Math.cos(this.yaw) * 9.2;
    let burst = 0;
    for (const p of this.plants()) {
      if (!p.alive) continue;
      const dx = p.x - cx;
      const dz = p.z - cz;
      if (dx * dx + dz * dz > CUT_RADIUS * CUT_RADIUS) continue;
      p.mow();
      this.onMowPlant?.(p.x, p.z);
      if (burst++ < 6) this.fx.burst(tmp.set(p.x, 1.2, p.z), p.col, 7, 8, 1.6);
    }
    // ...and the gnomes
    grid.query(cx, cz, CUT_RADIUS + 1, near);
    for (const c of near) {
      if (!c.alive || c.isNpc) continue;
      const dx = c.pos.x - cx;
      const dz = c.pos.z - cz;
      if (dx * dx + dz * dz > CUT_RADIUS * CUT_RADIUS) continue;
      this.onMow?.(c);
    }

    // grass spraying from the deck, exhaust smoke, chatter
    this.spray -= dt;
    if (this.spray <= 0) {
      this.spray = 0.12;
      for (const side of [-1, 1]) this.fx.burst(tmp.set(cx + Math.cos(this.yaw) * side * 6, 0.6, cz - Math.sin(this.yaw) * side * 6), 0x5ac84a, 4, 6, 1.3);
    }
    this.smoke -= dt;
    if (this.smoke <= 0) {
      this.smoke = 0.35;
      this.fx.cloud(tmp.set(this.pos.x + Math.cos(this.yaw) * 2.5 + Math.sin(this.yaw) * 2.8, 9, this.pos.z - Math.sin(this.yaw) * 2.5 + Math.cos(this.yaw) * 2.8), 0x666666, 1.6, 2, 1.6);
    }
    this.chat -= dt;
    if (this.chat <= 0) {
      this.chat = 9 + Math.random() * 8;
      this.onSay?.(pick(LINES.idle));
    }
    this.animate(dt);
    this.sync();
  }

  /** A line for when he flattens someone. */
  sayMow() {
    this.onSay?.(pick(LINES.mow));
  }

  private animate(dt: number) {
    for (const w of this.wheels) w.rotation.x -= (this.speedNow * dt) / 2.4;
    for (const b of this.blades) b.rotation.y += dt * 40;
    this.wheel.rotation.z = this.lastTurn * -1.2;
    this.group.position.y = Math.sin(performance.now() / 60) * 0.06; // engine shudder
  }

  private sync() {
    this.group.position.x = this.pos.x;
    this.group.position.z = this.pos.z;
    this.group.rotation.y = this.yaw;
  }

  dispose() {
    this.scene.remove(this.group);
  }
}
