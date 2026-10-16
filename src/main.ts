import * as THREE from 'three';
import { World } from './world';
import { buildForest, HALF } from './forest';
import { NavGrid } from './nav';
import { Player } from './player';
import { Fighter, type FightCtx } from './fighter';
import { PeeSystem } from './pee';
import { PEE, POTION_KINDS, POTION_TIME, SpatialGrid, type Combatant, type PeeKind } from './combat';
import { Potions } from './potions';
import { Zones, type Zone } from './zones';
import { Effects } from './fx';
import { Sound } from './audio';
import type { Faction } from './gnome';

// --- rules --------------------------------------------------------------------------
const TEAM_SIZE = 50; // you + 49 bots vs 50 bots
const START_TICKETS = 400;
const PLAYER_RESPAWN = 5;
const NAMES: Record<Faction, string[]> = {
  gnome: ['Barnaby', 'Bramble', 'Pip', 'Hobb', 'Moss', 'Thistle', 'Tuck', 'Wren', 'Fennel', 'Nettle', 'Dill', 'Basil', 'Sorrel', 'Tansy', 'Burdock', 'Sage', 'Clover', 'Hazel', 'Rue', 'Yarrow', 'Bracken', 'Teasel', 'Bumble', 'Cobb', 'Dibble'],
  goblin: ['Grubnak', 'Snaggle', 'Skrag', 'Nibwick', 'Zog', 'Mugsy', 'Rotgut', 'Blort', 'Gnash', 'Krunk', 'Wartle', 'Slag', 'Gribble', 'Mog', 'Spitz', 'Drool', 'Bonk', 'Fizzle', 'Grot', 'Snot', 'Yark', 'Muckle', 'Bogey', 'Clag', 'Gubbins'],
};
const LINES: Record<Faction, string[]> = {
  gnome: ['Nature calls!', 'Hold still, I am watering!', 'Rinse and repeat!', 'Get out of my garden!'],
  goblin: ['Heh heh, wet bandit!', 'You smell now!', 'Splash!', 'Me aim good!'],
};
const FACTION_INFO: Record<Faction, { label: string; color: string; hex: number }> = {
  gnome: { label: 'GNOMES', color: '#ff7a7a', hex: 0xe04a4a },
  goblin: { label: 'GOBLINS', color: '#8fe06a', hex: 0x7ddc4a },
};
const otherFaction = (f: Faction): Faction => (f === 'gnome' ? 'goblin' : 'gnome');
const pick = <T,>(a: T[]): T => a[Math.floor(Math.random() * a.length)];
function shuffled<T>(a: T[]): T[] {
  const r = a.slice();
  for (let i = r.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [r[i], r[j]] = [r[j], r[i]];
  }
  return r;
}

// --- renderer / scene ----------------------------------------------------------------
let renderer: THREE.WebGLRenderer;
try {
  renderer = new THREE.WebGLRenderer({ antialias: true });
} catch (err) {
  const msg = document.getElementById('msg');
  if (msg) msg.textContent = 'WebGL is unavailable in this browser (check hardware acceleration).';
  throw err;
}
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x1c2a44);
const fog = new THREE.Fog(0x213a52, 30, 150);
scene.fog = fog;
scene.add(new THREE.HemisphereLight(0x9fc4ff, 0x2a4a3a, 1.35));
const moon = new THREE.DirectionalLight(0xb4ccff, 1.5);
moon.castShadow = true;
moon.shadow.mapSize.set(2048, 2048);
Object.assign(moon.shadow.camera, { left: -50, right: 50, top: 50, bottom: -50, near: 1, far: 170 });
moon.shadow.bias = -0.0006;
moon.shadow.normalBias = 0.05;
scene.add(moon, moon.target);

const camera = new THREE.PerspectiveCamera(75, innerWidth / innerHeight, 0.05, 320);
scene.add(camera);

// --- game objects ----------------------------------------------------------------------
const world = new World(HALF);
const forest = buildForest(world, scene);
const nav = new NavGrid(world);
const player = new Player(world, camera);
const fx = new Effects(scene);
const sound = new Sound();
const grid = new SpatialGrid(HALF);
const pee = new PeeSystem(scene);
const zones = new Zones(world, forest.zones);
const potions = new Potions(scene, forest.potionSpots);

// --- HUD ---------------------------------------------------------------------------------
const $ = (id: string) => document.getElementById(id)!;
const elTix = $('tix');
const elZoneBar = $('zonebar');
const elFeed = $('feed');
const elBanner = $('banner');
const elHit = $('hit');
const elMarker = $('hitmarker');
const elOverlay = $('overlay');
const elMsg = $('msg');
const elRespawn = $('respawn');
const elPotionName = $('potionname');
const elPotionFill = $('potionfill');
const elBladder = $('bladderfill');
const elHp = $('hp');
const elStats = $('stats');
const mini = $('minimap') as HTMLCanvasElement;
const miniCtx = mini.getContext('2d')!;

let bannerT = 0;
function banner(text: string, secs = 1.6) {
  elBanner.textContent = text;
  elBanner.style.opacity = '1';
  bannerT = secs;
}
let markerT = 0;
function marker(kill: boolean) {
  elMarker.style.color = kill ? '#ff3030' : '#ffffff';
  elMarker.style.opacity = '1';
  markerT = 0.12;
}
const feed: { text: string; color: string; t: number }[] = [];
function feedPush(text: string, color: string) {
  feed.push({ text, color, t: 6 });
  if (feed.length > 6) feed.shift();
}

// the potion legend on the start screen
$('legend').innerHTML = POTION_KINDS.map((k) => `<span style="color:#${PEE[k].color.toString(16).padStart(6, '0')}" title="${PEE[k].blurb}"><b>${PEE[k].name}</b> – ${PEE[k].blurb}</span>`).join('');

// --- factions -------------------------------------------------------------------------------
let faction: Faction = 'gnome';
try {
  const saved = localStorage.getItem('pw-faction');
  if (saved === 'gnome' || saved === 'goblin') faction = saved;
} catch { /* storage unavailable */ }
const factionOf = (team: 0 | 1): Faction => (team === 0 ? faction : otherFaction(faction));

function applyTeamColors() {
  zones.teamColors = [new THREE.Color(FACTION_INFO[faction].hex), new THREE.Color(FACTION_INFO[otherFaction(faction)].hex)];
  forest.flagsSouth.forEach((f) => (f.material as THREE.MeshBasicMaterial).color.setHex(FACTION_INFO[faction].hex));
  forest.flagsNorth.forEach((f) => (f.material as THREE.MeshBasicMaterial).color.setHex(FACTION_INFO[otherFaction(faction)].hex));
}

// --- the crowd --------------------------------------------------------------------------------
const fighters: Fighter[] = [];
let everyone: Combatant[] = [player];

function buildFighters() {
  for (const f of fighters) scene.remove(f.group);
  fighters.length = 0;
  for (const team of [0, 1] as const) {
    const n = team === 0 ? TEAM_SIZE - 1 : TEAM_SIZE;
    const fac = factionOf(team);
    for (let i = 0; i < n; i++) {
      const names = NAMES[fac];
      const name = names[i % names.length] + (i >= names.length ? ` ${Math.floor(i / names.length) + 1}` : '');
      fighters.push(new Fighter(scene, team, name, fac));
    }
  }
  everyone = [player, ...fighters];
}

// --- match state ------------------------------------------------------------------------------
type Phase = 'play' | 'end';
let phase: Phase = 'play';
let phaseT = 0;
let tickets: [number, number] = [START_TICKETS, START_TICKETS];
let bleedT = 5;
let kills = 0;
let deaths = 0;
let time = 0;
let respawnT = 0;
let playerWasAlive = true;

function respawnPoint(team: 0 | 1): { pos: THREE.Vector3; yaw: number } {
  const yaw = team === 0 ? 0 : Math.PI;
  const owned = zones.list.filter((z) => z.owner === team);
  if (owned.length && Math.random() < 0.65) {
    const z = pick(owned);
    for (let k = 0; k < 8; k++) {
      const a = Math.random() * Math.PI * 2;
      const r = Math.sqrt(Math.random()) * z.radius * 0.7;
      const x = z.x + Math.cos(a) * r;
      const zz = z.z + Math.sin(a) * r;
      if (nav.isFreeAt(x, zz)) return { pos: new THREE.Vector3(x, 0, zz), yaw };
    }
  }
  return { pos: pick(team === 0 ? forest.spawnSouth : forest.spawnNorth).clone(), yaw };
}

function newMatch() {
  tickets = [START_TICKETS, START_TICKETS];
  bleedT = 5;
  kills = 0;
  deaths = 0;
  phase = 'play';
  zones.reset(forest.zones);
  potions.reset();
  pee.clear();
  fx.clearGore();
  const south = shuffled(forest.spawnSouth);
  const north = shuffled(forest.spawnNorth);
  let si = 0;
  let ni = 0;
  player.respawn(south[si++], 0);
  for (const f of fighters) f.spawn(f.team === 0 ? south[si++ % south.length] : north[ni++ % north.length], f.team === 0 ? 0 : Math.PI);
  playerWasAlive = true;
  respawnT = 0;
  banner('CAPTURE THE ZONES! HOLD MORE THAN THE ENEMY!', 3);
}

// --- combat results ------------------------------------------------------------------------------
const nearBuf: Combatant[] = [];
const chainBuf: Combatant[] = [];

function spreadPoison(from: Combatant) {
  grid.query(from.pos.x, from.pos.z, 3, nearBuf);
  for (const o of nearBuf) {
    if (o === from || !o.alive || o.status.poison > 0) continue;
    o.status.poison = 6;
    o.status.poisonBy = from.status.poisonBy;
    break;
  }
}

/** One droplet landed on `victim`. */
function applyHit(victim: Combatant, kind: PeeKind, shooter: Combatant, at: THREE.Vector3) {
  const st = victim.status;
  if (kind === 'heal') {
    victim.heal(1.5);
    st.burn = 0;
    st.acid = Math.max(0, st.acid - 0.3);
    return;
  }
  let dmg = PEE[kind].dmg * st.dmgTaken;
  if (kind === 'shock' && st.wet > 0) dmg *= 2;
  const hadHp = victim.alive;
  victim.hurt(dmg, kind, shooter);
  if (shooter.isPlayer && hadHp) marker(!victim.alive);
  if (!victim.alive) return;
  switch (kind) {
    case 'normal':
      st.wet = 3.5;
      st.burn = Math.min(st.burn, 0.4); // pee puts fires out
      break;
    case 'fire':
      st.burn = st.wet > 0 ? 1.4 : 3.4;
      st.burnBy = shooter;
      break;
    case 'frost':
      st.wet = 3.5;
      st.burn = Math.min(st.burn, 0.4);
      if (st.frozen <= 0 && st.immune <= 0) {
        st.chill += st.wet > 0 ? 0.06 : 0.045;
        if (st.chill >= 1) { st.frozen = 2.2; st.chill = 1; }
      }
      break;
    case 'acid':
      st.acid = 4;
      st.acidBy = shooter;
      st.wet = 3.5;
      break;
    case 'poison':
      st.poison = 8;
      st.poisonBy = shooter;
      break;
    case 'shock':
      st.wet = 3.5;
      if (Math.random() < 0.2) {
        // lightning jumps to up to two more enemies close by
        grid.query(victim.pos.x, victim.pos.z, 6, chainBuf);
        let jumps = 0;
        for (const o of chainBuf) {
          if (jumps >= 2) break;
          if (o === victim || !o.alive || o.team !== victim.team) continue;
          jumps++;
          o.hurt(PEE.shock.dmg * 0.7 * (o.status.wet > 0 ? 2 : 1) * 3, 'shock', shooter);
          fx.tracer(new THREE.Vector3(victim.pos.x, victim.pos.y + 1, victim.pos.z), new THREE.Vector3(o.pos.x, o.pos.y + 1, o.pos.z), 0xfff27a);
        }
        if (jumps) {
          const sp = sound.spatial(victim.pos.x, victim.pos.z);
          sound.zap(sp.vol, sp.pan);
        }
      }
      break;
  }
  void at;
}

const killVerbBy = (k: PeeKind) => PEE[k].verb;

function registerKill(victim: Combatant, from: Combatant | null, kind: PeeKind) {
  tickets[victim.team] = Math.max(0, tickets[victim.team] - 1);
  const killer = from?.name ?? 'The forest';
  feedPush(`${killer} ${killVerbBy(kind)} ${victim.name}`, victim.team === 1 ? '#a8f0a8' : '#ffa0a0');
  if (from?.isPlayer) kills++;
  const sp = sound.spatial(victim.pos.x, victim.pos.z);
  if (victim instanceof Fighter) sound.gnomeDeath(sp.vol * 0.7, sp.pan, victim.voicePitch, victim.faction === 'goblin');
  if (from instanceof Fighter && Math.random() < 0.18) {
    const ks = sound.spatial(from.pos.x, from.pos.z);
    sound.taunt(pick(LINES[from.faction]), ks.vol, ks.pan, from.voicePitch, from.faction, from.voiceSeed);
  }
}

// grid of who is where, rebuilt every frame
const fightCtx: FightCtx = {
  world, nav, grid, pee, zones, potions, fx, time: 0, viewer: camera.position,
  onKill: (victim, from, kind) => registerKill(victim, from, kind),
  respawn: (f) => {
    const r = respawnPoint(f.team);
    f.spawn(r.pos, r.yaw);
  },
  spreadPoison,
};
Fighter.ctx = fightCtx;
let yelps = 2;
Fighter.onHurt = (f) => {
  if (yelps <= 0) return;
  const sp = sound.spatial(f.pos.x, f.pos.z);
  if (sp.vol < 0.15) return;
  yelps--;
  sound.gnomeHit(sp.vol * 0.6, sp.pan, f.voicePitch, f.faction === 'goblin');
};

zones.onCapture = (z: Zone, owner) => {
  const mine = owner === 0;
  banner(`${mine ? 'YOUR TEAM' : 'THE ENEMY'} CAPTURED ${z.name.toUpperCase()}!`, 2.2);
  feedPush(`${z.name} → ${FACTION_INFO[factionOf(owner)].label}`, mine ? '#a8f0a8' : '#ffa0a0');
  sound.horn(mine);
};

// --- input ---------------------------------------------------------------------------------------
let locked = false;
let firing = false;
renderer.domElement.addEventListener('mousedown', (e) => { if (e.button === 0) firing = true; });
window.addEventListener('mouseup', (e) => { if (e.button === 0) firing = false; });
window.addEventListener('contextmenu', (e) => e.preventDefault());
window.addEventListener('mousemove', (e) => { if (locked) player.look(e.movementX, e.movementY); });
window.addEventListener('keydown', (e) => {
  if (e.code === 'KeyM') {
    sound.tauntsOn = !sound.tauntsOn;
    if (!sound.tauntsOn) sound.stopTaunts();
    banner(sound.tauntsOn ? 'VOICES ON' : 'VOICES OFF', 1);
  }
});
let fallback = false;
function setRunning(on: boolean) {
  locked = on;
  elOverlay.style.display = on ? 'none' : 'flex';
  if (!on) { firing = false; sound.pee(false); elMsg.textContent = 'Paused — click to resume'; }
}
function startFallback() {
  if (locked) return;
  fallback = true;
  setRunning(true);
}
elOverlay.addEventListener('click', () => {
  sound.init();
  try {
    const r = renderer.domElement.requestPointerLock() as unknown as Promise<void> | undefined;
    r?.catch?.(() => startFallback());
  } catch {
    startFallback();
  }
  setTimeout(() => { if (!document.pointerLockElement) startFallback(); }, 400);
});
document.addEventListener('pointerlockchange', () => {
  if (document.pointerLockElement === renderer.domElement) { fallback = false; setRunning(true); }
  else if (!fallback) setRunning(false);
});
document.addEventListener('pointerlockerror', startFallback);
window.addEventListener('keydown', (e) => {
  if (e.code === 'Escape' && fallback) { fallback = false; setRunning(false); }
});
function refreshCards() {
  for (const el of document.querySelectorAll<HTMLElement>('.faction-card')) el.classList.toggle('selected', el.dataset.f === faction);
}
function setFaction(f: Faction) {
  if (f === faction) { refreshCards(); return; }
  faction = f;
  try { localStorage.setItem('pw-faction', f); } catch { /* ignore */ }
  applyTeamColors();
  buildFighters();
  newMatch();
  refreshCards();
}
for (const el of document.querySelectorAll<HTMLElement>('.faction-card')) {
  el.addEventListener('click', () => setFaction(el.dataset.f as Faction));
}
refreshCards();
if (location.search.includes('run')) { locked = true; elOverlay.style.display = 'none'; } // lets headless tests run without pointer lock
addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

// --- the player's stream ---------------------------------------------------------------------------
const dirV = new THREE.Vector3();
const originV = new THREE.Vector3();
const landV = new THREE.Vector3();
let outOfPee = false;
const marker3d = new THREE.Mesh(
  new THREE.CylinderGeometry(0.5, 0.5, 0.04, 20),
  new THREE.MeshBasicMaterial({ color: 0xf2d83a, transparent: true, opacity: 0.45, depthWrite: false }),
);
scene.add(marker3d);

function playerPee(dt: number) {
  const kind: PeeKind = player.potion?.kind ?? 'normal';
  const stuck = player.status.frozen > 0;
  if (player.bladder <= 0) outOfPee = true;
  else if (player.bladder > 20) outOfPee = false;
  camera.updateMatrixWorld();
  camera.getWorldDirection(dirV);
  player.eyePos(originV).addScaledVector(dirV, 0.45);
  originV.y -= 0.6;
  const aiming = player.alive && !stuck;
  if (aiming && pee.landing(originV, dirV, world, landV)) {
    marker3d.visible = true;
    marker3d.position.copy(landV);
    (marker3d.material as THREE.MeshBasicMaterial).color.setHex(PEE[kind].color);
  } else {
    marker3d.visible = false;
  }
  const going = firing && aiming && !outOfPee && player.bladder > 0;
  if (going) {
    pee.emit(player, originV, dirV, kind, dt, 0.012);
    player.bladder = Math.max(0, player.bladder - 16 * dt);
  } else {
    player.bladder = Math.min(100, player.bladder + 10 * dt);
  }
  sound.pee(going, ['normal', 'fire', 'frost', 'acid', 'shock', 'poison', 'heal'].indexOf(kind));
}

// --- per-frame HUD ---------------------------------------------------------------------------------
let hudT = 0;
const hex = (n: number) => '#' + n.toString(16).padStart(6, '0');

function renderHud() {
  const f0 = FACTION_INFO[faction];
  const f1 = FACTION_INFO[otherFaction(faction)];
  elTix.innerHTML =
    `<span style="color:${f0.color}">${f0.label} ${tickets[0]}</span> <span style="opacity:.6">:</span> ` +
    `<span style="color:${f1.color}">${tickets[1]} ${f1.label}</span>`;
  elZoneBar.innerHTML = zones.list
    .map((z) => {
      const c = z.owner === 0 ? f0.color : z.owner === 1 ? f1.color : '#999';
      return `<div class="pip${z.contested ? ' contested' : ''}" style="background:${c}" title="${z.name}"></div>`;
    })
    .join('');

  const kind: PeeKind = player.potion?.kind ?? 'normal';
  const col = hex(PEE[kind].color);
  elPotionName.innerHTML = `<b style="color:${col}">${PEE[kind].name}</b>`;
  elPotionFill.style.width = player.potion ? `${(player.potion.t / POTION_TIME) * 100}%` : '0%';
  elPotionFill.style.background = col;
  elBladder.style.width = `${player.bladder}%`;
  elBladder.style.background = col;
  elHp.textContent = `♥ ${Math.ceil(player.hp)}${player.status.burn > 0 ? ' 🔥' : ''}${player.status.chill > 0.2 ? ' ❄' : ''}${player.status.poison > 0 ? ' ☠' : ''}`;
  elStats.textContent = `Drenched ${kills} · Defeated ${deaths}`;
  elFeed.innerHTML = feed.map((l) => `<div style="color:${l.color}">${l.text}</div>`).join('');

  // minimap, north (-z) is up
  const s = mini.width / (2 * HALF);
  const mx = (x: number) => (x + HALF) * s;
  const mz = (z: number) => (z + HALF) * s;
  miniCtx.clearRect(0, 0, mini.width, mini.height);
  miniCtx.fillStyle = 'rgba(20,50,40,0.7)';
  miniCtx.fillRect(0, 0, mini.width, mini.height);
  for (const z of zones.list) {
    const c = z.owner === 0 ? f0.color : z.owner === 1 ? f1.color : '#aaaaaa';
    miniCtx.beginPath();
    miniCtx.arc(mx(z.x), mz(z.z), z.radius * s, 0, Math.PI * 2);
    miniCtx.fillStyle = c + '66';
    miniCtx.fill();
    miniCtx.strokeStyle = c;
    miniCtx.lineWidth = z.contested ? 3 : 1.5;
    miniCtx.stroke();
  }
  for (const p of potions.list) {
    if (!p.active) continue;
    miniCtx.fillStyle = hex(PEE[p.kind].color);
    miniCtx.fillRect(mx(p.pos.x) - 1.5, mz(p.pos.z) - 1.5, 3, 3);
  }
  for (const f of fighters) {
    if (!f.alive) continue;
    if (f.team === 1 && Math.hypot(f.pos.x - player.pos.x, f.pos.z - player.pos.z) > 42) continue; // enemies only show when close
    miniCtx.fillStyle = f.team === 0 ? f0.color : f1.color;
    miniCtx.fillRect(mx(f.pos.x) - 1.5, mz(f.pos.z) - 1.5, 3, 3);
  }
  if (player.alive) {
    miniCtx.save();
    miniCtx.translate(mx(player.pos.x), mz(player.pos.z));
    miniCtx.rotate(Math.atan2(-Math.cos(player.yaw), -Math.sin(player.yaw)));
    miniCtx.fillStyle = '#fff';
    miniCtx.beginPath();
    miniCtx.moveTo(6, 0);
    miniCtx.lineTo(-4, 4);
    miniCtx.lineTo(-4, -4);
    miniCtx.closePath();
    miniCtx.fill();
    miniCtx.restore();
  }
}

// --- the loop ----------------------------------------------------------------------------------------
const clock = new THREE.Clock();
let perfSim = 0;

// quality fallback: if the machine struggles, drop shadows, then resolution, so the game stays playable
let fpsEma = 60;
let lowQuality = 0; // 0 = full, 1 = no shadows, 2 = also 1x resolution and shorter view
let slowFor = 0;
function adaptQuality(dt: number) {
  fpsEma += (1 / Math.max(dt, 0.001) - fpsEma) * 0.08;
  slowFor = fpsEma < 28 ? slowFor + dt : 0;
  if (slowFor > 3 && lowQuality < 2) {
    lowQuality++;
    slowFor = 0;
    if (lowQuality === 1) {
      renderer.shadowMap.enabled = false;
      moon.castShadow = false;
      scene.traverse((o) => { const m = (o as THREE.Mesh).material as THREE.Material | undefined; if (m) m.needsUpdate = true; });
    } else {
      renderer.setPixelRatio(1);
      renderer.setSize(innerWidth, innerHeight);
      camera.far = 130;
      camera.updateProjectionMatrix();
      fog.far = 110;
    }
  }
}

function simulate(dt: number) {
  const t0 = performance.now();
  time += dt;
  fightCtx.time = time;
  yelps = Math.min(2, yelps + dt * 10);

  grid.clear();
  for (const c of everyone) if (c.alive) grid.insert(c);

  const hpBefore = player.hp;
  player.update(dt);
  player.status.update(dt, player, spreadPoison);
  if (player.potion) {
    player.potion.t -= dt;
    if (player.potion.t <= 0) player.potion = null;
  }
  playerPee(dt);
  if (player.alive && player.hp < hpBefore - 0.5) sound.hurt();

  for (const f of fighters) f.update(dt, fightCtx);
  pee.update(dt, {
    world, grid, fx,
    onHit: applyHit,
  });
  potions.update(dt, time, grid, (p, who) => {
    if (who.isPlayer) {
      banner(`${PEE[p.kind].name.toUpperCase()}! ${PEE[p.kind].blurb}`, 2.6);
      sound.potion();
    }
  });
  zones.update(dt, everyone, time);
  fx.update(dt);
  forest.animate(time);

  // the player dying
  if (playerWasAlive && !player.alive) {
    deaths++;
    registerKill(player, player.lastFrom, player.lastKind);
    respawnT = PLAYER_RESPAWN;
    banner(pick(['YOU WERE DRENCHED', 'WELL, THAT STINGS', 'RIP. THE FOREST IS UNIMPRESSED', 'SPLOOSH. YOU ARE DONE']), 2.2);
  }
  playerWasAlive = player.alive;
  if (!player.alive && phase === 'play') {
    respawnT -= dt;
    if (respawnT <= 0) {
      const r = respawnPoint(0);
      player.respawn(r.pos, r.yaw);
      playerWasAlive = true;
    }
  }

  // zones drain the losing side's tickets
  if (phase === 'play') {
    bleedT -= dt;
    if (bleedT <= 0) {
      bleedT = 5;
      const [a, b] = zones.owned();
      if (a > b) tickets[1] = Math.max(0, tickets[1] - (a - b));
      else if (b > a) tickets[0] = Math.max(0, tickets[0] - (b - a));
    }
    if (tickets[0] <= 0 || tickets[1] <= 0) {
      phase = 'end';
      phaseT = 9;
      const won = tickets[1] <= 0;
      banner(won ? 'VICTORY! THE FOREST IS YOURS!' : 'DEFEAT! YOUR TICKETS RAN DRY', 8);
    }
  } else {
    phaseT -= dt;
    if (phaseT <= 0) newMatch();
  }
  perfSim += (performance.now() - t0 - perfSim) * 0.05;
}

function tick() {
  requestAnimationFrame(tick);
  const raw = clock.getDelta();
  const dt = Math.min(raw, 0.05);
  if (locked) { simulate(dt); adaptQuality(raw); }

  // the shadow follows the player around the big map
  moon.target.position.set(player.pos.x, 0, player.pos.z);
  moon.position.set(player.pos.x - 35, 65, player.pos.z + 28);

  elHit.style.boxShadow = `inset 0 0 120px 30px rgba(220,0,0,${(player.hurtFlash * 0.7).toFixed(2)})`;
  player.hurtFlash = Math.max(0, player.hurtFlash - dt * 1.8);
  if (bannerT > 0) { bannerT -= dt; if (bannerT <= 0) elBanner.style.opacity = '0'; }
  if (markerT > 0) { markerT -= dt; if (markerT <= 0) elMarker.style.opacity = '0'; }
  for (const f of feed) f.t -= dt;
  while (feed.length && feed[0].t <= 0) feed.shift();
  elRespawn.style.display = !player.alive && phase === 'play' ? 'block' : 'none';
  if (!player.alive) elRespawn.textContent = `Respawning in ${Math.max(0, Math.ceil(respawnT))}…`;
  hudT += dt;
  if (hudT > 0.1) { hudT = 0; renderHud(); }

  sound.setListener(camera.position.x, camera.position.z, camera.rotation.y);
  renderer.render(scene, camera);
}

applyTeamColors();
buildFighters();
newMatch();
renderHud();
tick();

// handy for poking at the game from the console / tests
(window as unknown as { __pw: unknown }).__pw = {
  world, nav, player, fighters, zones, potions, pee, fx, forest, grid, sound, camera, scene,
  setRunning: (v: boolean) => { locked = v; },
  setFaction, newMatch, applyHit, respawnPoint, sim: simulate,
  get tickets() { return tickets; },
  get perf() { return { fps: Math.round(fpsEma), quality: lowQuality, simMs: perfSim, droplets: pee.active, drawCalls: renderer.info.render.calls, tris: renderer.info.render.triangles }; },
};
