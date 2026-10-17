import type { PeeKind } from './combat';

/** Starting kit for a fighter. The player picks one in the lobby; bots draw one at random each time they spawn. */
export interface ClassDef {
  id: string;
  name: string;
  tag: string;
  desc: string;
  /** Short badge shown on the class card. */
  badge: string;
  colour: string;
  hp: number;
  armor: number;
  /** Run speed multiplier. */
  speed: number;
  jugs: number;
  sniper: number;
  launcher: number;
  /** Seconds of each pee mod you start with. */
  double: number;
  swirl: number;
  potion?: PeeKind;
  /** How often bots pick this class. */
  weight: number;
  /** Which prop to show next to the gnome in the lobby. */
  prop: 'jug' | 'sniper' | 'launcher' | 'double' | 'swirl' | 'health';
}

export const CLASSES: ClassDef[] = [
  { id: 'trooper', name: 'Garden Trooper', tag: 'ALL-ROUNDER', desc: 'Solid health, two grenade jugs and a steady stream. Good at everything, great at nothing.', badge: 'TRP', colour: '#7ad0ff', hp: 100, armor: 0, speed: 1, jugs: 2, sniper: 0, launcher: 0, double: 0, swirl: 0, weight: 30, prop: 'jug' },
  { id: 'sniper', name: 'Sniper Sprinkler', tag: 'LONG RANGE', desc: 'Starts with the Piss Sniper and eight shots. Fragile, so stay hidden and keep your distance.', badge: 'SNP', colour: '#19e3ff', hp: 80, armor: 0, speed: 1, jugs: 0, sniper: 8, launcher: 0, double: 0, swirl: 0, weight: 10, prop: 'sniper' },
  { id: 'heavy', name: 'Heavy Hosepipe', tag: 'TANK', desc: 'Tough and armoured with a Piss Launcher. Slow, loud and very hard to ignore.', badge: 'HVY', colour: '#ff2bd6', hp: 120, armor: 60, speed: 0.88, jugs: 0, sniper: 0, launcher: 4, double: 0, swirl: 0, weight: 15, prop: 'launcher' },
  { id: 'assault', name: 'Double Dipper', tag: 'ASSAULT', desc: 'Runs a Double Stream for two minutes, plus a little armour and a grenade. Hits twice as hard up close.', badge: 'ASL', colour: '#ffa030', hp: 100, armor: 20, speed: 1.05, jugs: 1, sniper: 0, launcher: 0, double: 120, swirl: 0, weight: 20, prop: 'double' },
  { id: 'scout', name: 'Dew Scout', tag: 'FAST', desc: 'Quick on their feet with a Swirl Stream for two minutes. Low health: hit hard and run.', badge: 'SCT', colour: '#b050ff', hp: 75, armor: 0, speed: 1.25, jugs: 0, sniper: 0, launcher: 0, double: 0, swirl: 120, weight: 15, prop: 'swirl' },
  { id: 'medic', name: 'Field Medic', tag: 'SUPPORT', desc: 'Starts with Nectar of Life, so the stream heals friends and puts out fires. Armoured, with two jugs.', badge: 'MED', colour: '#ff80c0', hp: 100, armor: 30, speed: 1, jugs: 2, sniper: 0, launcher: 0, double: 0, swirl: 0, potion: 'heal', weight: 10, prop: 'health' },
];

export const classOf = (id: string): ClassDef => CLASSES.find((c) => c.id === id) ?? CLASSES[0];

export function randomClass(): ClassDef {
  let total = 0;
  for (const c of CLASSES) total += c.weight;
  let r = Math.random() * total;
  for (const c of CLASSES) {
    r -= c.weight;
    if (r <= 0) return c;
  }
  return CLASSES[0];
}
