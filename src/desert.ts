import * as THREE from 'three';
import { SoftBox, lit, makePaintTexture } from './organic';
import { World } from './world';
import { HALF, type ForestInfo, type ZoneDef } from './forest';

// deterministic layout, so Desert Trip is the same every time
let seed = 777777;
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

const NEON = [0x2fe07a, 0xff4fa0, 0x30c8ff, 0xb8ff30, 0xffe030, 0xc060ff];
const MESA = [0xe8703a, 0xd9562e, 0xf08a50, 0xd04a78, 0xe8a030, 0xf06a90];

/** Desert Trip: a hot, bright, hallucinogenic desert. Same size and zone layout as the forest. */
export function buildDesert(world: World, scene: THREE.Scene): ForestInfo {
  const zones: ZoneDef[] = [
    { name: 'Dusty Outpost', x: 0, z: 68, radius: 11, owner: 0 },
    { name: 'Cactus Gardens', x: -62, z: 34, radius: 12, owner: -1 },
    { name: 'Mirage Oasis', x: 62, z: 34, radius: 12, owner: -1 },
    { name: 'The Sun Temple', x: 0, z: 0, radius: 12, owner: -1 },
    { name: 'The Boneyard', x: -62, z: -34, radius: 12, owner: -1 },
    { name: 'Neon Mesas', x: 62, z: -34, radius: 12, owner: -1 },
    { name: 'Scorched Outpost', x: 0, z: -68, radius: 11, owner: 1 },
  ];
  const baseSouth = new THREE.Vector3(0, 0, 97);
  const baseNorth = new THREE.Vector3(0, 0, -97);
  const keepClear: { x: number; z: number; r: number }[] = [
    ...zones.map((z) => ({ x: z.x, z: z.z, r: z.radius + 6 })),
    { x: baseSouth.x, z: baseSouth.z, r: 22 },
    { x: baseNorth.x, z: baseNorth.z, r: 22 },
  ];
  const clear = (x: number, z: number, pad = 0) => keepClear.every((k) => Math.hypot(x - k.x, z - k.z) > k.r + pad);

  // --- sand ----------------------------------------------------------------------------
  const gtex = makePaintTexture(200);
  gtex.repeat.set(160, 160);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(900, 900), lit({ color: 0xffd27a, map: gtex }));
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  world.group.add(ground);

  // ripples of dune, just under knee height (decor, you walk over them)
  const duneN = 70;
  const dunes = instanced(new THREE.IcosahedronGeometry(0.6, 0), lit({ color: 0xffffff, flatShading: true }), duneN);
  for (let i = 0; i < duneN; i++) {
    put(dunes, i, between(-HALF, HALF), 0, between(-HALF, HALF), between(10, 24), between(0.7, 1.5), between(10, 24), rnd() * 3, pick([0xffd98a, 0xf6c468, 0xf0b45a, 0xffe0a0]));
  }
  dunes.receiveShadow = true;
  world.group.add(dunes);

  // sandstone cliffs round the edge
  const W = HALF + 3;
  for (const [x, z, w, d] of [[0, -W, 2 * W + 8, 5], [0, W, 2 * W + 8, 5], [-W, 0, 5, 2 * W], [W, 0, 5, 2 * W]] as const) {
    world.box(x, 0, z, w, 16, d, 0xd0602e);
    world.box(x, 16, z, w, 3, d, 0xf08a50, false);
  }

  // --- spacing helper ------------------------------------------------------------------
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

  // --- cacti: neon, blocky, everywhere ---------------------------------------------------
  interface Cactus { x: number; z: number; h: number; w: number; col: number; arm: number }
  const cacti: Cactus[] = [];
  const addCactus = (x: number, z: number, big: boolean) => {
    cacti.push({ x, z, h: big ? between(7, 12) : between(3, 6.5), w: big ? between(1.1, 1.5) : between(0.7, 1.0), col: pick(NEON), arm: rnd() < 0.5 ? 1 : -1 });
    remember(x, z);
  };
  for (let attempt = 0; attempt < 6000 && cacti.length < 280; attempt++) {
    const x = between(-HALF + 5, HALF - 5);
    const z = between(-HALF + 5, HALF - 5);
    if (!clear(x, z) || !spaced(x, z, 5)) continue;
    addCactus(x, z, rnd() < 0.14);
  }
  // a garden of tall ones round Cactus Gardens
  for (let k = 0; k < 22; k++) {
    const a = (k / 22) * Math.PI * 2;
    const x = -62 + Math.cos(a) * between(17, 23);
    const z = 34 + Math.sin(a) * between(17, 23);
    if (spaced(x, z, 3)) addCactus(x, z, true);
  }
  const cTrunk = instanced(new THREE.CylinderGeometry(0.5, 0.5, 1, 7), lit({ color: 0xffffff }), cacti.length);
  const cArmH = instanced(new SoftBox(1, 1, 1), lit({ color: 0xffffff }), cacti.length);
  const cArmV = instanced(new THREE.CylinderGeometry(0.5, 0.5, 1, 6), lit({ color: 0xffffff }), cacti.length);
  cacti.forEach((c, i) => {
    put(cTrunk, i, c.x, c.h / 2, c.z, c.w, c.h, c.w, 0, c.col);
    const ay = c.h * 0.55;
    const len = c.w * 2.2;
    put(cArmH, i, c.x + c.arm * (c.w / 2 + len / 2), ay, c.z, len, c.w * 0.7, c.w * 0.7, 0, c.col);
    const vh = c.h * 0.32;
    put(cArmV, i, c.x + c.arm * (c.w / 2 + len), ay + vh / 2, c.z, c.w * 0.7, vh, c.w * 0.7, 0, c.col);
    world.addCollider(new THREE.Vector3(c.x - c.w / 2, 0, c.z - c.w / 2), new THREE.Vector3(c.x + c.w / 2, c.h, c.z + c.w / 2));
  });
  for (const m of [cTrunk, cArmH, cArmV]) {
    m.castShadow = true;
    world.group.add(m);
  }

  // --- mesas and spires --------------------------------------------------------------------
  interface Mesa { x: number; z: number; w: number; h: number; col: number }
  const mesas: Mesa[] = [];
  for (let attempt = 0; attempt < 1200 && mesas.length < 34; attempt++) {
    const x = between(-HALF + 10, HALF - 10);
    const z = between(-HALF + 10, HALF - 10);
    if (!clear(x, z, 3) || !spaced(x, z, 12)) continue;
    mesas.push({ x, z, w: between(4, 8), h: between(5, 15), col: pick(MESA) });
    remember(x, z);
  }
  for (let k = 0; k < 7; k++) { // a ring of tall ones round Neon Mesas
    const a = (k / 7) * Math.PI * 2 + 0.4;
    mesas.push({ x: 62 + Math.cos(a) * 21, z: -34 + Math.sin(a) * 21, w: between(5, 8), h: between(12, 19), col: pick([0xf06a90, 0xe8703a, 0xe8a030]) });
  }
  const mBase = instanced(new THREE.CylinderGeometry(0.5, 0.5, 1, 8), lit({ color: 0xffffff, flatShading: true }), mesas.length);
  const mTop = instanced(new THREE.CylinderGeometry(0.5, 0.5, 1, 8), lit({ color: 0xffffff, flatShading: true }), mesas.length);
  mesas.forEach((m, i) => {
    put(mBase, i, m.x, m.h * 0.35, m.z, m.w, m.h * 0.7, m.w, 0, m.col);
    put(mTop, i, m.x, m.h * 0.7 + m.h * 0.15, m.z, m.w * 0.72, m.h * 0.3, m.w * 0.72, 0.4, pick([0xffd060, 0xff8aa0, 0xffa040]));
    world.addCollider(new THREE.Vector3(m.x - m.w / 2, 0, m.z - m.w / 2), new THREE.Vector3(m.x + m.w / 2, m.h, m.z + m.w / 2));
  });
  for (const m of [mBase, mTop]) {
    m.castShadow = true;
    world.group.add(m);
  }

  // --- boulders for low cover ---------------------------------------------------------------
  const rockList: { x: number; z: number; w: number; h: number; d: number }[] = [];
  for (let attempt = 0; attempt < 800 && rockList.length < 80; attempt++) {
    const x = between(-HALF + 6, HALF - 6);
    const z = between(-HALF + 6, HALF - 6);
    if (!clear(x, z, 1) || !spaced(x, z, 3.4)) continue;
    rockList.push({ x, z, w: between(2, 4.6), h: between(1.2, 3), d: between(2, 4.6) });
    remember(x, z);
  }
  const rocks = instanced(new THREE.IcosahedronGeometry(0.6, 0), lit({ color: 0xffffff, flatShading: true }), rockList.length);
  rockList.forEach((r, i) => {
    put(rocks, i, r.x, r.h / 2, r.z, r.w, r.h, r.d, 0, pick([0xd8884a, 0xc87a3a, 0xe0a060, 0xe08a70]));
    world.addCollider(new THREE.Vector3(r.x - r.w / 2, 0, r.z - r.d / 2), new THREE.Vector3(r.x + r.w / 2, r.h, r.z + r.d / 2));
  });
  rocks.castShadow = true;
  world.group.add(rocks);

  // --- Mirage Oasis: a pool ringed with palms ------------------------------------------------
  const pond = new THREE.Mesh(new THREE.CylinderGeometry(9.5, 9.5, 0.06, 28), new THREE.MeshBasicMaterial({ color: 0x28d8f0, transparent: true, opacity: 0.85 }));
  pond.position.set(62, 0.05, 34);
  world.group.add(pond);
  const palms: { x: number; z: number; h: number }[] = [];
  for (let k = 0; k < 16; k++) {
    const a = (k / 16) * Math.PI * 2;
    const r = between(11, 17);
    palms.push({ x: 62 + Math.cos(a) * r, z: 34 + Math.sin(a) * r, h: between(6, 9.5) });
  }
  for (let attempt = 0; attempt < 400 && palms.length < 40; attempt++) {
    const x = between(-HALF + 6, HALF - 6);
    const z = between(-HALF + 6, HALF - 6);
    if (!clear(x, z, 2) || !spaced(x, z, 6)) continue;
    palms.push({ x, z, h: between(6, 9.5) });
    remember(x, z);
  }
  const pTrunk = instanced(new THREE.CylinderGeometry(0.5, 0.5, 1, 6), lit({ color: 0xb8864a }), palms.length);
  const pLeaf = instanced(new THREE.OctahedronGeometry(0.62, 0), lit({ color: 0xffffff, flatShading: true }), palms.length);
  palms.forEach((p, i) => {
    put(pTrunk, i, p.x, p.h / 2, p.z, 0.6, p.h, 0.6);
    put(pLeaf, i, p.x, p.h + 0.2, p.z, 7.5, 1.1, 7.5, rnd() * 3, pick([0x30e08a, 0x40f0b0, 0x90f040]));
    world.addCollider(new THREE.Vector3(p.x - 0.3, 0, p.z - 0.3), new THREE.Vector3(p.x + 0.3, p.h, p.z + 0.3));
  });
  pLeaf.castShadow = true;
  world.group.add(pTrunk, pLeaf);

  // --- The Sun Temple (centre): golden pillars under a spinning sun --------------------------
  for (const [x, z] of [[-8, -8], [8, -8], [-8, 8], [8, 8]] as const) {
    world.box(x, 0, z, 2.2, 8, 2.2, 0xe8c070);
    world.box(x, 8, z, 2.8, 0.8, 2.8, 0xffe060, false);
  }
  const sun = new THREE.Mesh(new THREE.CylinderGeometry(5.5, 5.5, 0.7, 14), new THREE.MeshBasicMaterial({ color: 0xffe040 }));
  sun.rotation.x = Math.PI / 2;
  sun.position.set(0, 17, 0);
  world.group.add(sun);
  const sunRays = new THREE.Mesh(new THREE.CylinderGeometry(8, 8, 0.4, 7), new THREE.MeshBasicMaterial({ color: 0xff7a30 }));
  sunRays.rotation.x = Math.PI / 2;
  sunRays.position.set(0, 17, 0.5);
  world.group.add(sunRays);

  // --- The Boneyard: giant ribs and a skull ------------------------------------------------------
  for (let k = 0; k < 6; k++) {
    const x = -62 - 15 + k * 6;
    const z = -34 + (k % 2 ? 9 : -9);
    world.box(x, 0, z - 4.5, 0.9, 8, 0.9, 0xf4f0e0);
    world.box(x, 0, z + 4.5, 0.9, 8, 0.9, 0xf4f0e0);
    world.box(x, 8, z, 0.9, 0.9, 10.5, 0xf4f0e0, false);
  }
  world.box(-62 + 17, 0, -34 + 10, 7, 5, 6, 0xf4f0e0);
  world.box(-62 + 17, 1.8, -34 + 6.9, 1.6, 1.6, 0.6, 0x1a1020, false);
  world.box(-62 + 17 + 3.4, 1.8, -34 + 6.9, 1.6, 1.6, 0.6, 0x1a1020, false);

  // --- bases: banner poles ------------------------------------------------------------------------
  const flagsSouth: THREE.Mesh[] = [];
  const flagsNorth: THREE.Mesh[] = [];
  const clothMat = new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide });
  const banners = (base: THREE.Vector3, flags: THREE.Mesh[]) => {
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2;
      const x = base.x + Math.cos(a) * 19;
      const z = base.z + Math.sin(a) * 19;
      world.box(x, 0, z, 0.5, 8, 0.5, 0x7a4a2a);
      const cloth = new THREE.Mesh(new SoftBox(0.12, 2.6, 3), clothMat.clone());
      cloth.position.set(x, 6.4, z);
      world.group.add(cloth);
      flags.push(cloth);
    }
  };
  banners(baseSouth, flagsSouth);
  banners(baseNorth, flagsNorth);

  // --- mirage orbs: glowing balls drifting about ---------------------------------------------------
  const orbN = 130;
  const orbs = instanced(new THREE.IcosahedronGeometry(0.28, 0), new THREE.MeshBasicMaterial({ color: 0xffffff }), orbN);
  const orbBase = Array.from({ length: orbN }, () => ({ x: between(-HALF, HALF), y: between(1, 7), z: between(-HALF, HALF), p: rnd() * 6, c: pick([0xff5ad0, 0x5affee, 0xfff05a, 0xff8a3a, 0xa07aff]) }));
  orbBase.forEach((o, i) => orbs.setColorAt(i, new THREE.Color(o.c)));
  world.group.add(orbs);

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
      for (let i = 0; i < orbN; i++) {
        const o = orbBase[i];
        put(orbs, i, o.x + Math.sin(t * 0.5 + o.p) * 3, o.y + Math.sin(t * 1.1 + o.p * 2) * 1.2, o.z + Math.cos(t * 0.45 + o.p) * 3, 1, 1, 1, t + o.p);
      }
      orbs.instanceMatrix.needsUpdate = true;
      sun.rotation.y = t * 0.4;
      sunRays.rotation.y = -t * 0.25;
      sun.position.y = 17 + Math.sin(t * 0.8) * 0.8;
    },
  };
}
