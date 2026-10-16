import * as THREE from 'three';

/** What a stream of pee does. Potions switch the kind. */
export type PeeKind = 'normal' | 'fire' | 'frost' | 'acid' | 'shock' | 'poison' | 'heal';

export interface PeeDef {
  name: string;
  color: number;
  verb: string; // for the kill feed
  dmg: number; // per droplet
  blurb: string;
}

export const PEE: Record<PeeKind, PeeDef> = {
  normal: { name: 'Plain Pee', color: 0xf2d83a, verb: 'drenched', dmg: 1.0, blurb: 'Classic. Makes enemies wet.' },
  fire: { name: 'Dragon Brew', color: 0xff7a1a, verb: 'toasted', dmg: 0.45, blurb: 'Sets enemies on fire (wet ones burn less).' },
  frost: { name: 'Frost Elixir', color: 0x9fe8ff, verb: 'froze', dmg: 0.5, blurb: 'Slows, then freezes solid. Wet freezes faster.' },
  acid: { name: 'Acid Tonic', color: 0x7aff2a, verb: 'melted', dmg: 0.5, blurb: 'Corrodes: damage over time and they take more.' },
  shock: { name: 'Storm Draught', color: 0xfff27a, verb: 'zapped', dmg: 0.9, blurb: 'Chains lightning. Wet enemies take double.' },
  poison: { name: 'Toadstool Tincture', color: 0xb040d0, verb: 'poisoned', dmg: 0.35, blurb: 'Lingering poison that spreads to anyone nearby.' },
  heal: { name: 'Nectar of Life', color: 0xff80c0, verb: 'healed', dmg: 0, blurb: 'Heals allies and douses fire. Harmless to enemies.' },
};

/** Potions you can find (plain pee is just what you have when none is active). */
export const POTION_KINDS: PeeKind[] = ['fire', 'frost', 'acid', 'shock', 'poison', 'heal'];
export const POTION_TIME = 40; // seconds a potion lasts

export interface PotionState {
  kind: PeeKind;
  t: number;
}

/** Anything that can be hit by pee: the player and every bot. */
export interface Combatant {
  readonly id: number;
  readonly name: string;
  readonly team: 0 | 1;
  readonly pos: THREE.Vector3;
  readonly isPlayer: boolean;
  readonly status: Status;
  alive: boolean;
  hp: number;
  maxHp: number;
  potion: PotionState | null;
  bladder: number;
  /** Direct hit: reacts and may alert. */
  hurt(amount: number, kind: PeeKind, from: Combatant | null): void;
  /** Burning, acid and poison ticks: quiet. */
  dot(amount: number, kind: PeeKind, from: Combatant | null): void;
  heal(amount: number): void;
}

/** Timers for everything that can be happening to a fighter. */
export class Status {
  wet = 0;
  burn = 0;
  acid = 0;
  poison = 0;
  chill = 0; // 0..1: how close to frozen
  frozen = 0;
  immune = 0; // brief freeze immunity after thawing
  burnBy: Combatant | null = null;
  acidBy: Combatant | null = null;
  poisonBy: Combatant | null = null;

  get speedMul(): number {
    return this.frozen > 0 ? 0 : 1 - 0.6 * this.chill;
  }

  get dmgTaken(): number {
    return this.acid > 0 ? 1.25 : 1;
  }

  get any(): boolean {
    return this.burn > 0 || this.acid > 0 || this.poison > 0 || this.chill > 0.1 || this.frozen > 0;
  }

  reset() {
    this.wet = this.burn = this.acid = this.poison = this.chill = this.frozen = this.immune = 0;
    this.burnBy = this.acidBy = this.poisonBy = null;
  }

  /** Tick all effects. `spread` is called now and then while poisoned, so the poison can jump to neighbours. */
  update(dt: number, owner: Combatant, spread?: (from: Combatant) => void) {
    this.wet = Math.max(0, this.wet - dt);
    if (this.burn > 0) {
      this.burn -= dt;
      owner.dot(9 * dt, 'fire', this.burnBy);
      if (this.wet > 1) this.burn = Math.min(this.burn, 0.3); // wet fighters put themselves out
    }
    if (this.acid > 0) {
      this.acid -= dt;
      owner.dot(7 * dt, 'acid', this.acidBy);
    }
    if (this.poison > 0) {
      this.poison -= dt;
      owner.dot(4 * dt, 'poison', this.poisonBy);
      if (spread && Math.random() < dt * 0.4) spread(owner);
    }
    if (this.frozen > 0) {
      this.frozen -= dt;
      if (this.frozen <= 0) {
        this.immune = 3;
        this.chill = 0;
      }
    } else {
      this.chill = Math.max(0, this.chill - dt * 0.25);
    }
    this.immune = Math.max(0, this.immune - dt);
  }

  /** The glow a fighter gets from what's affecting them (null = none). */
  tint(t: number): { color: number; intensity: number } | null {
    if (this.frozen > 0) return { color: 0x66ccff, intensity: 0.7 };
    if (this.burn > 0) return { color: 0xff6a10, intensity: 0.5 + 0.3 * Math.sin(t * 25) };
    if (this.acid > 0) return { color: 0x55ff22, intensity: 0.45 };
    if (this.poison > 0) return { color: 0x9a30c0, intensity: 0.4 };
    if (this.chill > 0.1) return { color: 0x66ccff, intensity: this.chill * 0.5 };
    return null;
  }
}

/** Where bots and droplets look for people: a coarse grid rebuilt every frame. */
export class SpatialGrid {
  private cells: Combatant[][];
  private readonly n: number;
  private readonly cs = 6;
  private readonly half: number;

  constructor(half: number) {
    this.half = half;
    this.n = Math.ceil((2 * half) / this.cs) + 3;
    this.cells = Array.from({ length: this.n * this.n }, () => []);
  }

  private ci(v: number): number {
    const c = Math.floor((v + this.half) / this.cs) + 1;
    return c < 0 ? 0 : c >= this.n ? this.n - 1 : c;
  }

  clear() {
    for (const c of this.cells) c.length = 0;
  }

  insert(c: Combatant) {
    this.cells[this.ci(c.pos.z) * this.n + this.ci(c.pos.x)].push(c);
  }

  /** Everyone within `r` metres (horizontally) of (x, z), appended to `out`. */
  query(x: number, z: number, r: number, out: Combatant[]) {
    out.length = 0;
    const x0 = this.ci(x - r), x1 = this.ci(x + r), z0 = this.ci(z - r), z1 = this.ci(z + r);
    const r2 = r * r;
    for (let cz = z0; cz <= z1; cz++) {
      for (let cx = x0; cx <= x1; cx++) {
        const list = this.cells[cz * this.n + cx];
        for (let k = 0; k < list.length; k++) {
          const c = list[k];
          const dx = c.pos.x - x;
          const dz = c.pos.z - z;
          if (dx * dx + dz * dz <= r2) out.push(c);
        }
      }
    }
  }
}
