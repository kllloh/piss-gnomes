import * as THREE from 'three';
import type { World } from './world';
import type { Combatant } from './combat';
import type { ZoneDef } from './forest';

export interface Zone extends ZoneDef {
  index: number;
  /** -1 = fully the enemy's, +1 = fully team 0's */
  progress: number;
  contested: boolean;
  count: [number, number];
  disc: THREE.Mesh;
  beacon: THREE.Mesh;
  pillar: THREE.Mesh;
  /** How many bots of each team are currently heading here. */
  assigned: [number, number];
}

const GREY = new THREE.Color(0xc8c8d8);
const tmpC = new THREE.Color();

/** The capture points: stone ring, glowing beacon and a light pillar that shows who owns it. */
export class Zones {
  readonly list: Zone[] = [];
  teamColors: [THREE.Color, THREE.Color] = [new THREE.Color(0xe04a4a), new THREE.Color(0x7ddc4a)];
  onCapture: ((z: Zone, owner: 0 | 1) => void) | null = null;

  constructor(world: World, defs: ZoneDef[]) {
    defs.forEach((d, index) => {
      // ring of standing stones
      for (let k = 0; k < 8; k++) {
        const a = (k / 8) * Math.PI * 2 + 0.2;
        world.box(d.x + Math.cos(a) * (d.radius - 0.8), 0, d.z + Math.sin(a) * (d.radius - 0.8), 1.1, 3.4, 1.1, 0x9a9aac);
      }
      world.box(d.x, 0, d.z, 2.2, 1.2, 2.2, 0xb0b0c0);
      const disc = new THREE.Mesh(
        new THREE.CylinderGeometry(d.radius, d.radius, 0.06, 40),
        new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.28, depthWrite: false }),
      );
      disc.position.set(d.x, 0.05, d.z);
      const beacon = new THREE.Mesh(new THREE.BoxGeometry(1.2, 1.2, 1.2), new THREE.MeshBasicMaterial({ color: 0xffffff }));
      beacon.position.set(d.x, 2.3, d.z);
      const pillar = new THREE.Mesh(
        new THREE.BoxGeometry(0.5, 40, 0.5),
        new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.35, depthWrite: false }),
      );
      pillar.position.set(d.x, 20, d.z);
      world.group.add(disc, beacon, pillar);
      this.list.push({
        ...d, index, progress: d.owner === 0 ? 1 : d.owner === 1 ? -1 : 0, contested: false, count: [0, 0],
        disc, beacon, pillar, assigned: [0, 0],
      });
    });
    this.paint();
  }

  /** Back to the starting ownership (new match). */
  reset(defs: ZoneDef[]) {
    this.list.forEach((z, i) => {
      z.owner = defs[i].owner;
      z.progress = z.owner === 0 ? 1 : z.owner === 1 ? -1 : 0;
      z.assigned = [0, 0];
    });
    this.paint();
  }

  private paint() {
    for (const z of this.list) {
      const c = tmpC.copy(GREY);
      if (z.progress > 0) c.lerp(this.teamColors[0], z.progress);
      else if (z.progress < 0) c.lerp(this.teamColors[1], -z.progress);
      for (const m of [z.disc, z.beacon, z.pillar]) (m.material as THREE.MeshBasicMaterial).color.copy(c);
    }
  }

  /** Count who is standing in each zone and move the capture bars. */
  update(dt: number, everyone: Combatant[], t: number) {
    for (const z of this.list) {
      let c0 = 0;
      let c1 = 0;
      const r2 = z.radius * z.radius;
      for (const c of everyone) {
        if (!c.alive) continue;
        const dx = c.pos.x - z.x;
        const dz = c.pos.z - z.z;
        if (dx * dx + dz * dz < r2) { if (c.team === 0) c0++; else c1++; }
      }
      z.count = [c0, c1];
      z.contested = c0 > 0 && c1 > 0;
      const net = c0 - c1;
      if (net !== 0) z.progress = Math.max(-1, Math.min(1, z.progress + Math.sign(net) * Math.min(Math.abs(net), 8) * 0.04 * dt));
      const was = z.owner;
      if (z.progress >= 0.999) z.owner = 0;
      else if (z.progress <= -0.999) z.owner = 1;
      else if (Math.abs(z.progress) < 0.05) z.owner = -1;
      if (z.owner !== was && z.owner !== -1) this.onCapture?.(z, z.owner);
      const pulse = 1 + Math.sin(t * 3 + z.index) * 0.12;
      z.beacon.scale.setScalar(pulse);
      z.beacon.rotation.y = t;
    }
    this.paint();
  }

  /** How many zones each team owns. */
  owned(): [number, number] {
    let a = 0;
    let b = 0;
    for (const z of this.list) { if (z.owner === 0) a++; else if (z.owner === 1) b++; }
    return [a, b];
  }

  /** Pick a zone for a bot to go to: mostly ones that aren't theirs yet, nearest first, spreading out the crowd. */
  assign(team: 0 | 1, x: number, z: number): Zone {
    let best = this.list[0];
    let bw = -1;
    for (const zone of this.list) {
      const d = Math.hypot(zone.x - x, zone.z - z);
      let w = 1 / (d + 25);
      const mine = zone.owner === team;
      if (!mine) w *= zone.owner === -1 ? 3 : 3.4;
      else if (zone.contested) w *= 2.4;
      else w *= 0.35;
      w /= 1 + zone.assigned[team] / 7;
      w *= 0.6 + Math.random() * 0.8;
      if (w > bw) { bw = w; best = zone; }
    }
    return best;
  }
}
