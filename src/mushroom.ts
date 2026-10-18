import * as THREE from 'three';
import { SoftBox, lit, makePaintTexture } from './organic';
import { World } from './world';
import { HALF, hideInstance, killBox, type ForestInfo, type Plant, type ZoneDef } from './forest';

// deterministic layout, so Mushroom Hollow is the same every time
let seed = 31337;
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
  m.frustumCulled = false;
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

const CAPS = [0xff3a8a, 0x7a4fff, 0x30d0ff, 0xffa030, 0x40ffa0, 0xff5050, 0xd04aff];
const GLOW = [0x4af0ff, 0xff5ad0, 0xb8ff40, 0xa07aff, 0xffe05a];

/** Mushroom Hollow: a glowing fungal cavern of towering caps, spore clouds and puffballs. */
export function buildMushroom(world: World, scene: THREE.Scene): ForestInfo {
  const zones: ZoneDef[] = [
    { name: 'Spore Landing', x: 0, z: 68, radius: 11, owner: 0 },
    { name: 'Toadstool Ring', x: -62, z: 34, radius: 12, owner: -1 },
    { name: 'Glowcap Lagoon', x: 62, z: 34, radius: 12, owner: -1 },
    { name: 'The Great Cap', x: 0, z: 0, radius: 12, owner: -1 },
    { name: 'Rot Log Hollow', x: -62, z: -34, radius: 12, owner: -1 },
    { name: 'Puffball Fields', x: 62, z: -34, radius: 12, owner: -1 },
    { name: 'Fungal Outpost', x: 0, z: -68, radius: 11, owner: 1 },
  ];
  const baseSouth = new THREE.Vector3(0, 0, 97);
  const baseNorth = new THREE.Vector3(0, 0, -97);
  const plants: Plant[] = [];
  const keepClear: { x: number; z: number; r: number }[] = [
    ...zones.map((z) => ({ x: z.x, z: z.z, r: z.radius + 6 })),
    { x: baseSouth.x, z: baseSouth.z, r: 22 },
    { x: baseNorth.x, z: baseNorth.z, r: 22 },
  ];
  const clear = (x: number, z: number, pad = 0) => keepClear.every((k) => Math.hypot(x - k.x, z - k.z) > k.r + pad);

  // --- the cavern floor: dark mycelium with glowing veins ----------------------------------
  const gtex = makePaintTexture(110);
  gtex.repeat.set(200, 200);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(900, 900), lit({ color: 0x4a2a6e, map: gtex }));
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  world.group.add(ground);

  const veinN = 160;
  const veins = instanced(new SoftBox(1, 0.03, 1), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.4, depthWrite: false }), veinN);
  for (let i = 0; i < veinN; i++) {
    const long = rnd() < 0.5;
    put(veins, i, between(-HALF + 6, HALF - 6), 0.03, between(-HALF + 6, HALF - 6), long ? between(6, 16) : between(0.5, 1.2), 1, long ? between(0.5, 1.2) : between(6, 16), rnd() * 3, pick(GLOW));
  }
  world.group.add(veins);

  // dark fungal cliffs round the edge
  const W = HALF + 3;
  for (const [x, z, w, d] of [[0, -W, 2 * W + 8, 5], [0, W, 2 * W + 8, 5], [-W, 0, 5, 2 * W], [W, 0, 5, 2 * W]] as const) {
    world.box(x, 0, z, w, 18, d, 0x2a1448);
    world.box(x, 18, z, w, 3, d, 0x5a2a8a, false);
  }

  // --- spacing helper -------------------------------------------------------------------------
  const placed = new Map<string, { x: number; z: number }[]>();
  const spaced = (x: number, z: number, d: number) => {
    const cx = Math.floor(x / 6);
    const cz = Math.floor(z / 6);
    for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) for (const p of placed.get(`${cx + i},${cz + j}`) ?? []) if (Math.hypot(p.x - x, p.z - z) < d) return false;
    return true;
  };
  const remember = (x: number, z: number) => {
    const k = `${Math.floor(x / 6)},${Math.floor(z / 6)}`;
    if (!placed.has(k)) placed.set(k, []);
    placed.get(k)!.push({ x, z });
  };

  // --- towering mushrooms: solid stems, caps you can walk under ----------------------------------
  interface Shroom { x: number; z: number; sh: number; sw: number; cw: number; col: number }
  const shrooms: Shroom[] = [];
  const addShroom = (x: number, z: number, big: boolean, col?: number) => {
    const sh = big ? between(11, 17) : between(6, 11);
    shrooms.push({ x, z, sh, sw: big ? between(1.8, 2.6) : between(1.0, 1.6), cw: big ? between(14, 20) : between(8, 13), col: col ?? pick(CAPS) });
    remember(x, z);
  };
  for (let attempt = 0; attempt < 6000 && shrooms.length < 120; attempt++) {
    const x = between(-HALF + 6, HALF - 6);
    const z = between(-HALF + 6, HALF - 6);
    if (!clear(x, z) || !spaced(x, z, 9)) continue;
    addShroom(x, z, rnd() < 0.2);
  }
  // Toadstool Ring: red caps, a ring round the zone
  for (let k = 0; k < 12; k++) {
    const a = (k / 12) * Math.PI * 2;
    const x = -62 + Math.cos(a) * 18;
    const z = 34 + Math.sin(a) * 18;
    if (spaced(x, z, 4)) addShroom(x, z, false, 0xe02a3a);
  }
  const sStem = instanced(new THREE.CylinderGeometry(0.5, 0.5, 1, 8), lit({ color: 0xf4ead8 }), shrooms.length);
  const sCap = instanced(new THREE.ConeGeometry(0.62, 1, 10), lit({ color: 0xffffff, flatShading: true }), shrooms.length);
  const sSpot = instanced(new THREE.IcosahedronGeometry(0.5, 0), new THREE.MeshBasicMaterial({ color: 0xfff6e0 }), shrooms.length * 4);
  shrooms.forEach((m, i) => {
    put(sStem, i, m.x, m.sh / 2, m.z, m.sw, m.sh, m.sw);
    const capH = m.cw * 0.28;
    put(sCap, i, m.x, m.sh + capH / 2 - 0.4, m.z, m.cw, capH, m.cw, rnd() * 3, m.col);
    for (let k = 0; k < 4; k++) {
      const a = k * 1.6 + i;
      const r = m.cw * 0.22;
      put(sSpot, i * 4 + k, m.x + Math.cos(a) * r, m.sh + capH * 0.55, m.z + Math.sin(a) * r, m.cw * 0.12, m.cw * 0.05, m.cw * 0.12, a);
    }
    const box = world.addCollider(new THREE.Vector3(m.x - m.sw / 2, 0, m.z - m.sw / 2), new THREE.Vector3(m.x + m.sw / 2, m.sh, m.z + m.sw / 2));
    const pl: Plant = { x: m.x, z: m.z, col: m.col, alive: true, mow() { pl.alive = false; hideInstance(sStem, i); hideInstance(sCap, i); for (let k = 0; k < 4; k++) hideInstance(sSpot, i * 4 + k); killBox(box); } };
    plants.push(pl);
  });
  for (const m of [sStem, sCap]) {
    m.castShadow = true;
    m.receiveShadow = true;
    world.group.add(m);
  }
  world.group.add(sSpot);

  // --- glowcaps: little lamps all over the floor ------------------------------------------------------
  const smallN = 420;
  const stems = instanced(new THREE.CylinderGeometry(0.5, 0.5, 1, 6), lit({ color: 0xf2e8d0 }), smallN);
  const caps = instanced(new THREE.ConeGeometry(0.62, 1, 8), new THREE.MeshBasicMaterial({ color: 0xffffff }), smallN);
  for (let i = 0; i < smallN; i++) {
    const x = between(-HALF + 4, HALF - 4);
    const z = between(-HALF + 4, HALF - 4);
    const s = between(0.8, 2);
    put(stems, i, x, 0.3 * s, z, 0.25 * s, 0.6 * s, 0.25 * s);
    const capCol = pick(GLOW);
    put(caps, i, x, 0.72 * s, z, 1.0 * s, 0.45 * s, 1.0 * s, rnd() * 3, capCol);
    const pl: Plant = { x, z, col: capCol, alive: true, mow() { pl.alive = false; hideInstance(stems, i); hideInstance(caps, i); } };
    plants.push(pl);
  }
  world.group.add(stems, caps);

  // --- puffballs and stumps for low cover ---------------------------------------------------------------
  const puffs: { x: number; z: number; r: number }[] = [];
  for (let attempt = 0; attempt < 900 && puffs.length < 60; attempt++) {
    const x = between(-HALF + 6, HALF - 6);
    const z = between(-HALF + 6, HALF - 6);
    if (!clear(x, z, 1) || !spaced(x, z, 4)) continue;
    puffs.push({ x, z, r: between(1.3, 2.4) });
    remember(x, z);
  }
  // Puffball Fields: a cluster of big ones
  for (let k = 0; k < 20; k++) {
    const a = rnd() * Math.PI * 2;
    const rr = between(5, 24);
    const x = 62 + Math.cos(a) * rr;
    const z = -34 + Math.sin(a) * rr;
    if (spaced(x, z, 4.5)) { puffs.push({ x, z, r: between(1.8, 3) }); remember(x, z); }
  }
  const pf = instanced(new THREE.IcosahedronGeometry(0.62, 0), lit({ color: 0xffffff, flatShading: true }), puffs.length);
  puffs.forEach((p, i) => {
    put(pf, i, p.x, p.r * 0.6, p.z, p.r * 2, p.r * 1.8, p.r * 2, rnd() * 3, pick([0xf4e6ff, 0xffd0f0, 0xd0f4ff, 0xe8ffd0]));
    world.addCollider(new THREE.Vector3(p.x - p.r, 0, p.z - p.r), new THREE.Vector3(p.x + p.r, p.r * 1.5, p.z + p.r));
  });
  pf.castShadow = true;
  world.group.add(pf);

  // --- Glowcap Lagoon: a pool of glowing goo with stepping-stone caps ----------------------------------
  const goo = new THREE.Mesh(new THREE.CylinderGeometry(10, 10, 0.06, 28), new THREE.MeshBasicMaterial({ color: 0x40ffd0, transparent: true, opacity: 0.8 }));
  goo.position.set(62, 0.05, 34);
  world.group.add(goo);
  const gooRim = new THREE.Mesh(new THREE.CylinderGeometry(11.4, 11.4, 0.05, 28), new THREE.MeshBasicMaterial({ color: 0xb8ff40, transparent: true, opacity: 0.35 }));
  gooRim.position.set(62, 0.04, 34);
  world.group.add(gooRim);

  // --- The Great Cap (centre): six stems holding up an enormous cap -------------------------------------
  for (let k = 0; k < 6; k++) {
    const a = (k / 6) * Math.PI * 2;
    world.box(Math.cos(a) * 10, 0, Math.sin(a) * 10, 2.4, 14, 2.4, 0xf4ead8);
  }
  const great = new THREE.Mesh(new THREE.ConeGeometry(17, 8, 14), new THREE.MeshBasicMaterial({ color: 0xff3a8a }));
  great.position.set(0, 18, 0);
  world.group.add(great);
  const greatSpots = instanced(new THREE.IcosahedronGeometry(0.5, 0), new THREE.MeshBasicMaterial({ color: 0xfff6e0 }), 9);
  for (let i = 0; i < 9; i++) {
    const a = i * 0.9;
    const r = 4 + (i % 3) * 3.5;
    put(greatSpots, i, Math.cos(a) * r, 21 + (1 - r / 17) * 1.2, Math.sin(a) * r, 2, 0.5, 2, a);
  }
  world.group.add(greatSpots);

  // --- Rot Log Hollow: a hollow of huge fallen logs ------------------------------------------------------
  const log = (x: number, z: number, w: number, d: number) => world.box(x, 0, z, w, 3.4, d, 0x5a3a28);
  log(-62 - 14, -34, 2.8, 20);
  log(-62 + 14, -34 + 2, 2.8, 16);
  log(-62, -34 - 15, 18, 2.8);
  log(-62 - 4, -34 + 15, 12, 2.8);
  log(-62 + 17, -34 - 14, 2.6, 2.6);

  // --- bases: banner poles ---------------------------------------------------------------------------------
  const flagsSouth: THREE.Mesh[] = [];
  const flagsNorth: THREE.Mesh[] = [];
  const clothMat = new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide });
  const banners = (base: THREE.Vector3, flags: THREE.Mesh[]) => {
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2;
      const x = base.x + Math.cos(a) * 19;
      const z = base.z + Math.sin(a) * 19;
      world.box(x, 0, z, 0.5, 8, 0.5, 0xd8c8f0);
      const cloth = new THREE.Mesh(new SoftBox(0.12, 2.6, 3), clothMat.clone());
      cloth.position.set(x, 6.4, z);
      world.group.add(cloth);
      flags.push(cloth);
    }
  };
  banners(baseSouth, flagsSouth);
  banners(baseNorth, flagsNorth);

  // --- spores drifting up through the cavern -------------------------------------------------------------------
  const sporeN = 220;
  const spores = instanced(new THREE.IcosahedronGeometry(0.2, 0), new THREE.MeshBasicMaterial({ color: 0xffffff }), sporeN);
  const sporeBase = Array.from({ length: sporeN }, () => ({ x: between(-HALF, HALF), y: between(0, 14), z: between(-HALF, HALF), p: rnd() * 6, s: between(0.3, 0.9) }));
  sporeBase.forEach((o, i) => spores.setColorAt(i, new THREE.Color(pick(GLOW))));
  world.group.add(spores);

  // --- spawn points and potion spots -------------------------------------------------------------------------------
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
    zones, baseSouth, baseNorth, spawnSouth, spawnNorth, flagsSouth, flagsNorth, potionSpots, plants,
    animate(t: number) {
      for (let i = 0; i < sporeN; i++) {
        const o = sporeBase[i];
        const y = (o.y + t * o.s) % 14;
        put(spores, i, o.x + Math.sin(t * 0.4 + o.p) * 2.5, y, o.z + Math.cos(t * 0.35 + o.p) * 2.5, 1, 1, 1);
      }
      spores.instanceMatrix.needsUpdate = true;
      great.rotation.y = t * 0.1;
    },
  };
}
