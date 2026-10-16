import * as THREE from 'three';
import { SoftBox, lit } from './organic';
import { World } from './world';
import { makePaintTexture } from './organic';

export const HALF = 110;

export interface ZoneDef {
  name: string;
  x: number;
  z: number;
  radius: number;
  /** 0 = the player's team, 1 = the enemy, -1 = nobody yet */
  owner: 0 | 1 | -1;
}

export interface ForestInfo {
  zones: ZoneDef[];
  baseSouth: THREE.Vector3; // team 0 spawns here
  baseNorth: THREE.Vector3; // team 1 spawns here
  spawnSouth: THREE.Vector3[];
  spawnNorth: THREE.Vector3[];
  /** Banner cloth on each base, recoloured to the team's faction colour. */
  flagsSouth: THREE.Mesh[];
  flagsNorth: THREE.Mesh[];
  potionSpots: THREE.Vector3[];
  animate(t: number): void;
}

// deterministic layout so the forest is the same every time
let seed = 424242;
function rnd(): number {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const between = (a: number, b: number) => a + rnd() * (b - a);
const pick = <T,>(a: T[]): T => a[Math.floor(rnd() * a.length)];

const dummy = new THREE.Object3D();

function instanced(geo: THREE.BufferGeometry, mat: THREE.Material, count: number): THREE.InstancedMesh {
  const m = new THREE.InstancedMesh(geo, mat, count);
  m.frustumCulled = false; // spread over the whole map, so culling by one big sphere is pointless
  return m;
}

function put(m: THREE.InstancedMesh, i: number, x: number, y: number, z: number, sx: number, sy: number, sz: number, ry = 0, color?: number) {
  dummy.position.set(x, y, z);
  dummy.rotation.set(0, ry, 0);
  dummy.scale.set(sx, sy, sz);
  dummy.updateMatrix();
  m.setMatrixAt(i, dummy.matrix);
  if (color !== undefined) m.setColorAt(i, new THREE.Color(color));
}

export function buildForest(world: World, scene: THREE.Scene): ForestInfo {
  const zones: ZoneDef[] = [
    { name: 'Southern Glade', x: 0, z: 68, radius: 11, owner: 0 },
    { name: 'Mushroom Village', x: -62, z: 34, radius: 12, owner: -1 },
    { name: 'Crystal Grove', x: 62, z: 34, radius: 12, owner: -1 },
    { name: 'The Old Stones', x: 0, z: 0, radius: 12, owner: -1 },
    { name: 'Fallen Ruins', x: -62, z: -34, radius: 12, owner: -1 },
    { name: 'Lily Pond', x: 62, z: -34, radius: 12, owner: -1 },
    { name: 'Northern Glade', x: 0, z: -68, radius: 11, owner: 1 },
  ];
  const baseSouth = new THREE.Vector3(0, 0, 97);
  const baseNorth = new THREE.Vector3(0, 0, -97);
  const keepClear: { x: number; z: number; r: number }[] = [
    ...zones.map((z) => ({ x: z.x, z: z.z, r: z.radius + 6 })),
    { x: baseSouth.x, z: baseSouth.z, r: 22 },
    { x: baseNorth.x, z: baseNorth.z, r: 22 },
  ];
  const clear = (x: number, z: number, pad = 0) => keepClear.every((k) => Math.hypot(x - k.x, z - k.z) > k.r + pad);

  // --- ground ---------------------------------------------------------------------
  const gtex = makePaintTexture(150);
  gtex.repeat.set(200, 200);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(900, 900), lit({ color: 0x2f6e55, map: gtex }));
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  world.group.add(ground);

  // glowing moss patches
  const patchCount = 90;
  const patches = instanced(new SoftBox(1, 0.03, 1), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.32, depthWrite: false }), patchCount);
  for (let i = 0; i < patchCount; i++) {
    put(patches, i, between(-HALF + 8, HALF - 8), 0.03, between(-HALF + 8, HALF - 8), between(3, 9), 1, between(3, 9), rnd() * 3, pick([0x4af0c0, 0x9a6aff, 0x4ab0ff, 0xff7ad0]));
  }
  world.group.add(patches);

  // --- the thorn wall around the edge ---------------------------------------------
  const W = HALF + 3;
  world.box(0, 0, -W, 2 * W + 8, 16, 5, 0x1d1730);
  world.box(0, 0, W, 2 * W + 8, 16, 5, 0x1d1730);
  world.box(-W, 0, 0, 5, 16, 2 * W, 0x1d1730);
  world.box(W, 0, 0, 5, 16, 2 * W, 0x1d1730);

  // --- trees ----------------------------------------------------------------------
  const placed = new Map<string, { x: number; z: number }[]>();
  const hashKey = (x: number, z: number) => `${Math.floor(x / 6)},${Math.floor(z / 6)}`;
  const spaced = (x: number, z: number, d: number) => {
    const cx = Math.floor(x / 6);
    const cz = Math.floor(z / 6);
    for (let i = -1; i <= 1; i++) {
      for (let j = -1; j <= 1; j++) {
        for (const p of placed.get(`${cx + i},${cz + j}`) ?? []) if (Math.hypot(p.x - x, p.z - z) < d) return false;
      }
    }
    return true;
  };
  const remember = (x: number, z: number) => {
    const k = hashKey(x, z);
    if (!placed.has(k)) placed.set(k, []);
    placed.get(k)!.push({ x, z });
  };

  interface Tree { x: number; z: number; h: number; w: number; s: number; col: number }
  const trees: Tree[] = [];
  for (let attempt = 0; attempt < 6000 && trees.length < 720; attempt++) {
    const x = between(-HALF + 5, HALF - 5);
    const z = between(-HALF + 5, HALF - 5);
    if (!clear(x, z) || !spaced(x, z, 4.6)) continue;
    const big = rnd() < 0.16;
    trees.push({
      x, z,
      h: big ? between(13, 18) : between(5.5, 9),
      w: big ? between(1.8, 2.4) : between(0.8, 1.1),
      s: big ? between(1.9, 2.4) : between(0.9, 1.3),
      col: pick([0x2f8f7a, 0x3a6fb0, 0x7a4fb0, 0x2f9a5a, 0x9a4fa0, 0x3aa6a0]),
    });
    remember(x, z);
  }
  const trunks = instanced(new THREE.CylinderGeometry(0.5, 0.5, 1, 6), lit({ color: 0xffffff }), trees.length);
  const canopy = [0, 1, 2].map(() => instanced(new THREE.IcosahedronGeometry(0.62, 0), lit({ color: 0xffffff, flatShading: true }), trees.length));
  trees.forEach((t, i) => {
    put(trunks, i, t.x, t.h / 2, t.z, t.w, t.h, t.w, 0, pick([0x5a3a52, 0x4a3448, 0x6a4658]));
    for (let l = 0; l < 3; l++) {
      const width = 5.4 * t.s * (1 - l * 0.3);
      const hh = 2.1 * t.s;
      put(canopy[l], i, t.x, t.h - 1.2 * t.s + l * 1.8 * t.s + hh / 2, t.z, width, hh, width, 0.3 * l, t.col);
    }
    world.addCollider(new THREE.Vector3(t.x - t.w / 2, 0, t.z - t.w / 2), new THREE.Vector3(t.x + t.w / 2, t.h, t.z + t.w / 2));
  });
  for (const m of [trunks, ...canopy]) {
    m.castShadow = true;
    m.receiveShadow = true;
    world.group.add(m);
  }

  // --- small glowing mushrooms ------------------------------------------------------
  const smallN = 300;
  const stems = instanced(new THREE.CylinderGeometry(0.5, 0.5, 1, 6), lit({ color: 0xf2e8d0 }), smallN);
  const caps = instanced(new THREE.ConeGeometry(0.62, 1, 8), new THREE.MeshBasicMaterial({ color: 0xffffff }), smallN);
  for (let i = 0; i < smallN; i++) {
    const x = between(-HALF + 4, HALF - 4);
    const z = between(-HALF + 4, HALF - 4);
    const s = between(0.7, 1.6);
    put(stems, i, x, 0.3 * s, z, 0.25 * s, 0.6 * s, 0.25 * s);
    put(caps, i, x, 0.7 * s, z, 1.0 * s, 0.4 * s, 1.0 * s, rnd() * 3, pick([0xff66cc, 0x66ffee, 0xffee66, 0xa87aff, 0x7aff8a]));
  }
  world.group.add(stems, caps);

  // --- giant mushrooms (solid stem, you can walk under the cap) --------------------
  const giants: { x: number; z: number; s: number; col: number }[] = [];
  const addGiant = (x: number, z: number) => giants.push({ x, z, s: between(1, 1.5), col: pick([0xc03a5a, 0x7a4fd0, 0x2a7ad0, 0xd08a2a]) });
  for (let attempt = 0; attempt < 800 && giants.length < 26; attempt++) {
    const x = between(-HALF + 8, HALF - 8);
    const z = between(-HALF + 8, HALF - 8);
    if (!clear(x, z, 2) || !spaced(x, z, 7)) continue;
    addGiant(x, z);
    remember(x, z);
  }
  // a ring of them around the Mushroom Village zone
  for (let k = 0; k < 7; k++) {
    const a = (k / 7) * Math.PI * 2 + 0.3;
    const x = -62 + Math.cos(a) * 19;
    const z = 34 + Math.sin(a) * 19;
    addGiant(x, z);
    remember(x, z);
  }
  const gStem = instanced(new THREE.CylinderGeometry(0.5, 0.5, 1, 8), lit({ color: 0xf0e4d2 }), giants.length);
  const gCap = instanced(new THREE.ConeGeometry(0.62, 1, 10), lit({ color: 0xffffff, flatShading: true }), giants.length);
  const gSpots = instanced(new SoftBox(1, 1, 1), new THREE.MeshBasicMaterial({ color: 0xfff6e0 }), giants.length * 3);
  giants.forEach((g, i) => {
    const sw = 1.7 * g.s;
    const sh = 5.2 * g.s;
    put(gStem, i, g.x, sh / 2, g.z, sw, sh, sw);
    const cw = 9 * g.s;
    put(gCap, i, g.x, sh + 0.7 * g.s, g.z, cw, 1.5 * g.s, cw, 0, g.col);
    for (let k = 0; k < 3; k++) {
      const a = k * 2.1 + i;
      put(gSpots, i * 3 + k, g.x + Math.cos(a) * cw * 0.28, sh + 1.5 * g.s + 0.02, g.z + Math.sin(a) * cw * 0.28, 1.1 * g.s, 0.1, 1.1 * g.s);
    }
    world.addCollider(new THREE.Vector3(g.x - sw / 2, 0, g.z - sw / 2), new THREE.Vector3(g.x + sw / 2, sh, g.z + sw / 2));
  });
  gCap.castShadow = true;
  world.group.add(gStem, gCap, gSpots);

  // --- rocks and fallen logs (low cover) ---------------------------------------------
  const rockList: { x: number; z: number; w: number; h: number; d: number }[] = [];
  for (let attempt = 0; attempt < 600 && rockList.length < 70; attempt++) {
    const x = between(-HALF + 6, HALF - 6);
    const z = between(-HALF + 6, HALF - 6);
    if (!clear(x, z, 1) || !spaced(x, z, 3.4)) continue;
    rockList.push({ x, z, w: between(2, 4.4), h: between(1.2, 3), d: between(2, 4.4) });
    remember(x, z);
  }
  const rocks = instanced(new THREE.IcosahedronGeometry(0.6, 0), lit({ color: 0xffffff, flatShading: true }), rockList.length);
  rockList.forEach((r, i) => {
    put(rocks, i, r.x, r.h / 2, r.z, r.w, r.h, r.d, 0, pick([0x7a7f8c, 0x6a6f7c, 0x8a8f9c]));
    world.addCollider(new THREE.Vector3(r.x - r.w / 2, 0, r.z - r.d / 2), new THREE.Vector3(r.x + r.w / 2, r.h, r.z + r.d / 2));
  });
  rocks.castShadow = true;
  world.group.add(rocks);

  const logList: { x: number; z: number; w: number; d: number }[] = [];
  for (let attempt = 0; attempt < 600 && logList.length < 46; attempt++) {
    const x = between(-HALF + 8, HALF - 8);
    const z = between(-HALF + 8, HALF - 8);
    if (!clear(x, z, 1) || !spaced(x, z, 4.2)) continue;
    const alongX = rnd() < 0.5;
    logList.push({ x, z, w: alongX ? between(6, 9) : 1.4, d: alongX ? 1.4 : between(6, 9) });
    remember(x, z);
  }
  const logs = instanced(new SoftBox(1, 1, 1), lit({ color: 0xffffff }), logList.length);
  logList.forEach((l, i) => {
    put(logs, i, l.x, 0.55, l.z, l.w, 1.1, l.d, 0, pick([0x5a3a30, 0x6a4a3a]));
    world.addCollider(new THREE.Vector3(l.x - l.w / 2, 0, l.z - l.d / 2), new THREE.Vector3(l.x + l.w / 2, 1.1, l.z + l.d / 2));
  });
  logs.castShadow = true;
  world.group.add(logs);

  // --- Crystal Grove (zone 2) -----------------------------------------------------------
  const crystalN = 34;
  const crystals = instanced(new THREE.OctahedronGeometry(0.62, 0), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.92 }), crystalN);
  for (let i = 0; i < crystalN; i++) {
    const a = rnd() * Math.PI * 2;
    const r = between(13, 28);
    const x = 62 + Math.cos(a) * r;
    const z = 34 + Math.sin(a) * r;
    const w = between(0.8, 1.7);
    const h = between(3, 9);
    put(crystals, i, x, h / 2, z, w, h, w, rnd() * 3, pick([0x66e0ff, 0xff66d8, 0xa07aff, 0x7affc8]));
    if (r > 14) world.addCollider(new THREE.Vector3(x - w / 2, 0, z - w / 2), new THREE.Vector3(x + w / 2, h, z + w / 2));
    remember(x, z);
  }
  world.group.add(crystals);

  // --- Fallen Ruins (zone 4): broken walls around the stones --------------------------
  const wall = (x: number, z: number, w: number, d: number, h: number) => world.box(x, 0, z, w, h, d, 0x8a8f9c);
  wall(-62 - 17, -34 - 6, 1.6, 12, 3.6);
  wall(-62 + 17, -34 + 3, 1.6, 10, 2.4);
  wall(-62 - 4, -34 - 18, 11, 1.6, 3.2);
  wall(-62 + 8, -34 + 18, 9, 1.6, 2.2);
  wall(-62 - 15, -34 + 13, 1.4, 1.4, 5.5);
  wall(-62 + 14, -34 - 14, 1.4, 1.4, 4.5);

  // --- Lily Pond (zone 5) ----------------------------------------------------------------
  const pond = new THREE.Mesh(
    new THREE.CylinderGeometry(9, 9, 0.06, 28),
    new THREE.MeshBasicMaterial({ color: 0x3a8adf, transparent: true, opacity: 0.8 }),
  );
  pond.position.set(62, 0.05, -34);
  world.group.add(pond);
  const lilies = instanced(new SoftBox(1, 0.05, 1), new THREE.MeshBasicMaterial({ color: 0x4acf6a }), 12);
  for (let i = 0; i < 12; i++) put(lilies, i, 62 + between(-7, 7), 0.1, -34 + between(-7, 7), between(1.2, 2), 1, between(1.2, 2), rnd() * 3);
  world.group.add(lilies);

  // --- The Old Stones (centre): a great arch ---------------------------------------------
  world.box(-5, 0, 0, 2, 9, 2, 0x8f8fa0);
  world.box(5, 0, 0, 2, 9, 2, 0x8f8fa0);
  world.box(0, 9, 0, 12, 2, 2.2, 0x9a9aac, false); // the lintel is overhead, decor only

  // --- bases: banner poles in a glade -------------------------------------------------------
  const flagsSouth: THREE.Mesh[] = [];
  const flagsNorth: THREE.Mesh[] = [];
  const clothMat = new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide });
  const banners = (base: THREE.Vector3, flags: THREE.Mesh[]) => {
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2;
      const x = base.x + Math.cos(a) * 19;
      const z = base.z + Math.sin(a) * 19;
      world.box(x, 0, z, 0.5, 8, 0.5, 0x4a3a50);
      const cloth = new THREE.Mesh(new SoftBox(0.12, 2.6, 3), clothMat.clone());
      cloth.position.set(x, 6.4, z);
      world.group.add(cloth);
      flags.push(cloth);
    }
  };
  banners(baseSouth, flagsSouth);
  banners(baseNorth, flagsNorth);

  // --- fireflies ----------------------------------------------------------------------------------
  const flyN = 160;
  const flies = instanced(new SoftBox(0.16, 0.16, 0.16), new THREE.MeshBasicMaterial({ color: 0xf6ff8a }), flyN);
  const flyBase = Array.from({ length: flyN }, () => ({ x: between(-HALF, HALF), y: between(1, 6), z: between(-HALF, HALF), p: rnd() * 6 }));
  world.group.add(flies);

  // --- spawn points and potion spots ----------------------------------------------------------------
  const spawnGrid = (base: THREE.Vector3, dir: number) => {
    const out: THREE.Vector3[] = [];
    for (let row = 0; row < 5; row++) for (let col = 0; col < 10; col++) out.push(new THREE.Vector3(base.x - 13.5 + col * 3, 0, base.z - dir * (7 - row * 3)));
    return out;
  };
  const spawnSouth = spawnGrid(baseSouth, 1);
  const spawnNorth = spawnGrid(baseNorth, -1);

  const potionSpots: THREE.Vector3[] = [];
  const open = (x: number, z: number) => {
    for (const [dx, dz] of [[0, 0], [1.5, 0], [-1.5, 0], [0, 1.5], [0, -1.5]]) if (world.pointHit(new THREE.Vector3(x + dx, 0.5, z + dz))) return false;
    return true;
  };
  for (const zn of zones) {
    for (let k = 0; k < 2; k++) {
      const a = rnd() * Math.PI * 2;
      const x = zn.x + Math.cos(a) * 6.5;
      const z = zn.z + Math.sin(a) * 6.5;
      if (open(x, z)) potionSpots.push(new THREE.Vector3(x, 0, z));
    }
  }
  for (let attempt = 0; attempt < 800 && potionSpots.length < 46; attempt++) {
    const x = between(-HALF + 8, HALF - 8);
    const z = between(-HALF + 8, HALF - 8);
    if (!open(x, z) || potionSpots.some((p) => Math.hypot(p.x - x, p.z - z) < 14)) continue;
    potionSpots.push(new THREE.Vector3(x, 0, z));
  }

  scene.add(world.group);

  return {
    zones, baseSouth, baseNorth, spawnSouth, spawnNorth, flagsSouth, flagsNorth, potionSpots,
    animate(t: number) {
      for (let i = 0; i < flyN; i++) {
        const f = flyBase[i];
        put(flies, i, f.x + Math.sin(t * 0.4 + f.p) * 2.5, f.y + Math.sin(t * 0.9 + f.p * 2) * 0.8, f.z + Math.cos(t * 0.35 + f.p) * 2.5, 1, 1, 1);
      }
      flies.instanceMatrix.needsUpdate = true;
    },
  };
}
