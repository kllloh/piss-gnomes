import * as THREE from 'three';
import { SoftBox, lit } from './organic';
import { PEE, POTION_KINDS, POTION_TIME, type Combatant, type PeeKind, type SpatialGrid } from './combat';

export interface Pickup {
  kind: PeeKind;
  readonly pos: THREE.Vector3;
  readonly group: THREE.Group;
  active: boolean;
  respawnT: number;
  phase: number;
  body: THREE.Mesh;
  neck: THREE.Mesh;
  halo: THREE.Mesh;
}

const near: Combatant[] = [];

/** Potion bottles lying around the forest. Grab one and your pee changes type for a while. */
export class Potions {
  readonly list: Pickup[] = [];

  constructor(scene: THREE.Scene, spots: THREE.Vector3[]) {
    const bodyGeo = new SoftBox(0.42, 0.55, 0.42);
    const neckGeo = new SoftBox(0.2, 0.26, 0.2);
    const corkGeo = new SoftBox(0.24, 0.12, 0.24);
    const haloGeo = new SoftBox(1, 1, 1);
    const corkMat = lit({ color: 0x8a5a2a });
    for (const s of spots) {
      const group = new THREE.Group();
      const body = new THREE.Mesh(bodyGeo, new THREE.MeshBasicMaterial({ color: 0xffffff }));
      const neck = new THREE.Mesh(neckGeo, new THREE.MeshBasicMaterial({ color: 0xffffff }));
      neck.position.y = 0.4;
      const cork = new THREE.Mesh(corkGeo, corkMat);
      cork.position.y = 0.58;
      const halo = new THREE.Mesh(haloGeo, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.25, depthWrite: false }));
      halo.position.y = 0.2;
      group.add(body, neck, cork, halo);
      group.position.set(s.x, 0.9, s.z);
      scene.add(group);
      const p: Pickup = { kind: 'fire', pos: new THREE.Vector3(s.x, 0, s.z), group, active: true, respawnT: 0, phase: Math.random() * 6, body, neck, halo };
      this.setKind(p, POTION_KINDS[Math.floor(Math.random() * POTION_KINDS.length)]);
      this.list.push(p);
    }
  }

  private setKind(p: Pickup, kind: PeeKind) {
    p.kind = kind;
    const col = PEE[kind].color;
    (p.body.material as THREE.MeshBasicMaterial).color.setHex(col);
    (p.neck.material as THREE.MeshBasicMaterial).color.setHex(col);
    (p.halo.material as THREE.MeshBasicMaterial).color.setHex(col);
  }

  /** Closest bottle that is lying about, within `maxDist`. */
  nearest(x: number, z: number, maxDist: number): Pickup | null {
    let best: Pickup | null = null;
    let bd = maxDist;
    for (const p of this.list) {
      if (!p.active) continue;
      const d = Math.hypot(p.pos.x - x, p.pos.z - z);
      if (d < bd) { bd = d; best = p; }
    }
    return best;
  }

  reset() {
    for (const p of this.list) {
      p.active = true;
      p.group.visible = true;
      this.setKind(p, POTION_KINDS[Math.floor(Math.random() * POTION_KINDS.length)]);
    }
  }

  update(dt: number, t: number, grid: SpatialGrid, onTake: (p: Pickup, who: Combatant) => void) {
    for (const p of this.list) {
      if (!p.active) {
        p.respawnT -= dt;
        if (p.respawnT <= 0) {
          p.active = true;
          p.group.visible = true;
          this.setKind(p, POTION_KINDS[Math.floor(Math.random() * POTION_KINDS.length)]);
        }
        continue;
      }
      p.group.position.y = 0.9 + Math.sin(t * 2 + p.phase) * 0.15;
      p.group.rotation.y = t * 1.5 + p.phase;
      const s = 0.8 + Math.sin(t * 3 + p.phase) * 0.12;
      p.halo.scale.set(s, s * 1.4, s);
      grid.query(p.pos.x, p.pos.z, 1.7, near);
      for (const who of near) {
        if (!who.alive || who.isNpc) continue;
        p.active = false;
        p.group.visible = false;
        p.respawnT = 30;
        who.potion = { kind: p.kind, t: POTION_TIME };
        who.bladder = 100;
        onTake(p, who);
        break;
      }
    }
  }
}
