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
import { Music } from './music';
import { Trip } from './trip';
import { say as sayLine, announce, SAY_CHANCE, type SayCtx, type AnnounceCtx } from './talk';
import { Rory } from './rory';
import { Mounts, MOUNT_DEFS, type MountSpot, type MountType } from './mounts';
import type { Faction } from './gnome';

// --- rules --------------------------------------------------------------------------
const TEAM_SIZE = 50; // you + 49 bots vs 50 bots
const START_TICKETS = 400;
const PLAYER_RESPAWN = 5;
const NAMES: Record<Faction, string[]> = {
  gnome: ['Barnaby', 'Bramble', 'Pip', 'Hobb', 'Moss', 'Thistle', 'Tuck', 'Wren', 'Fennel', 'Nettle', 'Dill', 'Basil', 'Sorrel', 'Tansy', 'Burdock', 'Sage', 'Clover', 'Hazel', 'Rue', 'Yarrow', 'Bracken', 'Teasel', 'Bumble', 'Cobb', 'Dibble'],
  goblin: ['Grumbold', 'Snorri', 'Flint', 'Gimble', 'Nobbin', 'Pebble', 'Rumble', 'Tinker', 'Wobble', 'Burl', 'Mudge', 'Nibbs', 'Oakley', 'Pogo', 'Quill', 'Rooster', 'Stumpy', 'Tumble', 'Umber', 'Wick', 'Yodel', 'Zinnia', 'Crumb', 'Doodle', 'Fungo'],
};
const LINES: Record<Faction, string[]> = {
  gnome: ['Nature calls!', 'Hold still, I am watering!', 'Rinse and repeat!', 'Get out of my garden!', 'Gnome sweet gnome!'],
  goblin: ['Taste the rainbow!', 'Stream of consciousness!', 'Did somebody say wee?', 'Piss gnomes forever!', 'Whoa, the colours!'],
};
const FACTION_INFO: Record<Faction, { label: string; color: string; hex: number }> = {
  gnome: { label: 'RED HATS', color: '#ff7a7a', hex: 0xe04a4a },
  goblin: { label: 'BLUE CAPS', color: '#7ab4ff', hex: 0x4a8aff },
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
const hemi = new THREE.HemisphereLight(0x9fc4ff, 0x2a4a3a, 1.35);
scene.add(hemi);
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
const music = new Music(() => sound.context);
const trip = new Trip(renderer, scene);

// giant bugs to ride: a few at each base, a couple around every zone
const mountSpots: MountSpot[] = [];
{
  const types: MountType[] = ['spider', 'beetle', 'ladybug'];
  let n = 0;
  const clear = (x: number, z: number): THREE.Vector3 => {
    for (let k = 0; k < 20; k++) {
      const px = x + (Math.random() - 0.5) * 2 * (3 + k);
      const pz = z + (Math.random() - 0.5) * 2 * (3 + k);
      if (nav.isFreeAt(px, pz)) return new THREE.Vector3(px, 0, pz);
    }
    return new THREE.Vector3(x, 0, z);
  };
  for (const side of [1, -1]) {
    const b = side === 1 ? forest.baseSouth : forest.baseNorth;
    for (let i = 0; i < 3; i++) mountSpots.push({ type: types[n++ % 3], pos: clear(b.x + (i - 1) * 7, b.z - side * 9) });
  }
  for (const z of forest.zones) for (let i = 0; i < 2; i++) mountSpots.push({ type: types[n++ % 3], pos: clear(z.x + (i ? 9 : -9), z.z + (i ? -6 : 6)) });
}
const mounts = new Mounts(scene, mountSpots);

// Rory: big, blond, unkillable
const rory = new Rory(scene, world, nav, (text) => {
  const sp = sound.spatial(rory.pos.x, rory.pos.z);
  sound.taunt(text, sp.vol, sp.pan, 0.5, 'goblin', 1, 2, 'Rory');
});
{
  let spot = new THREE.Vector3(0, 0, 8);
  for (let k = 0; k < 40 && !nav.isFreeAt(spot.x, spot.z); k++) spot = new THREE.Vector3((Math.random() - 0.5) * 24, 0, (Math.random() - 0.5) * 24);
  rory.spawn(spot);
}

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
const elMount = $('mountinfo');
const elPrompt = $('prompt');
const elChatter = $('chatter');
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

// --- talking ---------------------------------------------------------------------------------------
let chatterT = 0;
const VOICE_COLOURS = { gnome: '#ff9a9a', goblin: '#9ac4ff', announcer: '#ffe45c' } as const;
sound.onSpeak = (name, text, voice) => {
  const colour = name === 'You' ? '#ffffff' : name === 'Rory' ? '#ffd070' : VOICE_COLOURS[voice];
  elChatter.innerHTML = `<b style="color:${colour}">${name || '???'}</b> ${text}`;
  elChatter.style.opacity = '1';
  chatterT = 3.6;
};

/** A bot says something, if it is close enough to hear and it feels like it. */
function fighterSay(f: Fighter, ctx: SayCtx, bug?: string) {
  if (Math.random() > SAY_CHANCE[ctx]) return;
  const sp = sound.spatial(f.pos.x, f.pos.z);
  if (sp.vol < 0.2) return;
  const text = sayLine(ctx, f.faction, { bug: bug ?? f.mount?.petName });
  if (text) sound.taunt(text, sp.vol, sp.pan, f.voicePitch, f.faction, f.voiceSeed, 0, f.name);
}
/** The player talks (in their own side's voice). */
function playerSay(ctx: SayCtx, prio = 1) {
  const text = sayLine(ctx, faction, { bug: player.mount?.petName });
  if (text) sound.taunt(text, 1, 0, 1.5, faction, 3, prio, 'You');
}
function announcer(ctx: AnnounceCtx) {
  sound.taunt(announce(ctx), 1, 0, 1, 'announcer', 0, 3, 'ANNOUNCER');
}
Fighter.onSay = (f, ctx) => fighterSay(f, ctx);

// --- chaos: every minute or so the forest does something unhinged ---------------------------------
let timeScale = 1;
interface Chaos { id: AnnounceCtx; label: string; dur: number; start: () => void; end: () => void; tick?: () => void }
function rainbowRoll() {
  const give = (c: Combatant) => { if (c.alive) c.potion = { kind: pick(POTION_KINDS), t: 12 }; c.bladder = 100; };
  give(player);
  for (const f of fighters) give(f);
}
const CHAOS: Chaos[] = [
  { id: 'chaos_moon', label: 'MOON GRAVITY', dur: 25, start: () => { player.gravityMul = 0.3; }, end: () => { player.gravityMul = 1; } },
  { id: 'chaos_rainbow', label: 'RAINBOW RAIN', dur: 20, start: rainbowRoll, end: () => {}, tick: rainbowRoll },
  { id: 'chaos_turbo', label: 'TURBO PEE', dur: 20, start: () => { pee.rateMul = 2; }, end: () => { pee.rateMul = 1; } },
  { id: 'chaos_titan', label: 'TITAN GNOMES', dur: 25, start: () => { Fighter.size = 1.6; }, end: () => { Fighter.size = 1; } },
  { id: 'chaos_stampede', label: 'BUG STAMPEDE', dur: 2, start: () => { for (const m of mounts.list) if (!m.alive) m.reset(); }, end: () => {} },
  { id: 'chaos_zoom', label: 'DISCO SPEED', dur: 20, start: () => { timeScale = 1.6; }, end: () => { timeScale = 1; } },
];
let chaos: { def: Chaos; t: number; tickT: number } | null = null;
let chaosIn = 45 + Math.random() * 30;
function endChaos() {
  if (!chaos) return;
  chaos.def.end();
  chaos = null;
}
function startChaos() {
  endChaos();
  const def = pick(CHAOS);
  chaos = { def, t: def.dur, tickT: 4 };
  def.start();
  banner(`⚡ ${def.label} ⚡`, 3.2);
  announcer(def.id);
  feedPush(`CHAOS: ${def.label}`, '#ffe45c');
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
let streak = 0;
let idleT = 3;
let fillerT = 40;
let warned50 = false;
let warned20 = false;
let firstMatch = true;

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
  endChaos();
  chaosIn = 45 + Math.random() * 30;
  streak = 0;
  warned50 = warned20 = false;
  zones.reset(forest.zones);
  potions.reset();
  mounts.reset();
  player.mount = null;
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
  if (!firstMatch) setTimeout(() => announcer('start'), 1200);
}

// --- combat results ------------------------------------------------------------------------------
const nearBuf: Combatant[] = [];
const chainBuf: Combatant[] = [];

function spreadPoison(from: Combatant) {
  grid.query(from.pos.x, from.pos.z, 3, nearBuf);
  for (const o of nearBuf) {
    if (o === from || !o.alive || o.isNpc || o.status.poison > 0) continue;
    o.status.poison = 6;
    o.status.poisonBy = from.status.poisonBy;
    break;
  }
}

/** One droplet landed on `victim`. */
function applyHit(victim: Combatant, kind: PeeKind, shooter: Combatant, at: THREE.Vector3) {
  if (victim.isNpc) { victim.hurt(0, kind, shooter); return; } // Rory laughs it off
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
          if (o === victim || !o.alive || o.isNpc || o.team !== victim.team) continue;
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
  if (from?.isPlayer) {
    kills++;
    streak++;
    if (streak === 3) announcer('streak3');
    else if (streak === 5) announcer('streak5');
    else if (streak === 10) announcer('streak10');
    else if (Math.random() < 0.4) playerSay('kill');
  }
  if (victim.isPlayer) { streak = 0; if (Math.random() < 0.6) playerSay('death'); }
  const sp = sound.spatial(victim.pos.x, victim.pos.z);
  if (victim instanceof Fighter) sound.gnomeDeath(sp.vol * 0.7, sp.pan, victim.voicePitch, victim.faction === 'goblin');
  if (victim instanceof Fighter) fighterSay(victim, 'death');
  if (from instanceof Fighter) {
    fighterSay(from, 'kill');
    if (Math.random() < 0.3) { // a mate cheers
      grid.query(from.pos.x, from.pos.z, 16, nearBuf);
      const mate = nearBuf.find((o) => o instanceof Fighter && o !== from && o.alive && o.team === from.team);
      if (mate instanceof Fighter) fighterSay(mate, 'cheer');
    }
  }
}

// grid of who is where, rebuilt every frame
const fightCtx: FightCtx = {
  world, nav, grid, pee, zones, potions, mounts, fx, time: 0, viewer: camera.position,
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
  grid.query(z.x, z.z, z.radius, nearBuf);
  const talker = nearBuf.find((o) => o instanceof Fighter && o.alive && o.team === owner);
  if (talker instanceof Fighter) fighterSay(talker, 'capture');
  if (Math.random() < 0.7) announcer(mine ? 'capture' : 'lost');
};

mounts.onHurt = (m) => {
  const sp = sound.spatial(m.pos.x, m.pos.z);
  if (Math.random() < 0.35) sound.mountHit(sp.vol * 0.7, sp.pan);
};
mounts.onBreak = (m, rider, from) => {
  const at = new THREE.Vector3(m.pos.x, 0.8, m.pos.z);
  const up = new THREE.Vector3(0, 1, 0);
  fx.gibs(at, [0xff40a0, 0x40ffd0, 0xffe040, 0x8a3fd0], 22, 7, 0xff40a0, up);
  fx.splat(m.pos, 0xff40a0, 2.2);
  const sp = sound.spatial(m.pos.x, m.pos.z);
  sound.mountBreak(Math.max(sp.vol, rider?.isPlayer ? 1 : 0), sp.pan);
  const who = from?.name ?? 'The forest';
  feedPush(`${who} popped ${rider ? rider.name + "'s " : ''}${m.petName} the ${MOUNT_DEFS[m.type].name}`, '#ffd0ff');
  if (rider?.isPlayer) { banner(`${m.petName.toUpperCase()} EXPLODED INTO GOO!`, 2); playerSay('bugpop', 2); }
  else if (rider instanceof Fighter) fighterSay(rider, 'bugpop', m.petName);
  else if (Math.random() < 0.4) announcer('bugpop');
};

// --- input ---------------------------------------------------------------------------------------
let locked = false;
let firing = false;
renderer.domElement.addEventListener('mousedown', (e) => { if (e.button === 0) firing = true; });
window.addEventListener('mouseup', (e) => { if (e.button === 0) firing = false; });
window.addEventListener('contextmenu', (e) => e.preventDefault());
window.addEventListener('mousemove', (e) => { if (locked) player.look(e.movementX, e.movementY); });
function toggleRide() {
  if (!player.alive || !locked) return;
  if (player.mount) {
    const m = player.mount;
    mounts.dismount(player);
    player.pos.x += Math.cos(player.yaw) * (m.def.hw + 0.8); // hop off to the side
    player.pos.z -= Math.sin(player.yaw) * (m.def.hw + 0.8);
    player.vel.y = 4;
    player.onGround = false;
    sound.dismount();
    return;
  }
  const m = mounts.nearestFree(player.pos.x, player.pos.z, 3.6);
  if (m) {
    mounts.board(m, player);
    banner(`${m.petName.toUpperCase()} THE ${m.def.name.toUpperCase()}! Press E to hop off.`, 2.4);
    sound.mount();
    if (Math.random() < 0.85) playerSay('mount');
  }
}
window.addEventListener('keydown', (e) => {
  if (e.code === 'KeyE' && !e.repeat) toggleRide();
  if (e.code === 'KeyV' && !e.repeat && locked && player.alive) playerSay('shout', 2);
  if (e.code === 'KeyT') {
    trip.level = (trip.level + 2) % 3; // 2 -> 1 -> 0 -> 2
    banner(['TRIP: OFF (BORING)', 'TRIP: MILD', 'TRIP: FULL SEND'][trip.level], 1.2);
  }
  if (e.code === 'KeyH') {
    trip.ink = trip.ink > 0 ? 0 : 1;
    banner(trip.ink > 0 ? 'ART: PAINTED' : 'ART: PLAIN', 1.2);
  }
  if (e.code === 'KeyN') {
    music.setEnabled(!music.on);
    banner(music.on ? 'MUSIC ON' : 'MUSIC OFF', 1);
  }
  if (e.code === 'KeyM') {
    sound.tauntsOn = !sound.tauntsOn;
    if (!sound.tauntsOn) sound.stopTaunts();
    banner(sound.tauntsOn ? 'VOICES ON' : 'VOICES OFF', 1);
  }
});
let fallback = false;
function setRunning(on: boolean) {
  locked = on;
  if (on && firstMatch) { firstMatch = false; setTimeout(() => announcer('start'), 900); }
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
  music.start();
  sound.ambient(true);
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
  trip.resize();
});

// --- the player's stream ---------------------------------------------------------------------------
const dirV = new THREE.Vector3();
const originV = new THREE.Vector3();
const landV = new THREE.Vector3();
let outOfPee = false;
let gurgleT = 0;
const KIND_IDX: PeeKind[] = ['normal', 'fire', 'frost', 'acid', 'shock', 'poison', 'heal'];
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
  const m = player.mount;
  player.eyePos(originV).addScaledVector(dirV, m ? 1.0 : 0.45);
  originV.y -= m ? 0.45 : 0.6;
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
    pee.emit(player, originV, dirV, kind, dt, m ? m.def.spread * 0.4 : 0.012, m ? m.def.rate : 1);
    player.bladder = Math.max(0, player.bladder - 16 * dt * (m ? m.def.drain : 1));
  } else {
    player.bladder = Math.min(100, player.bladder + 10 * dt);
  }
  sound.pee(going, KIND_IDX.indexOf(kind));
  sound.cannon(going && !!m, m?.type === 'beetle');
  if (going) {
    gurgleT -= dt;
    if (gurgleT <= 0 && marker3d.visible) {
      gurgleT = 0.11 + Math.random() * 0.08;
      const sp = sound.spatial(marker3d.position.x, marker3d.position.z);
      sound.gurgle(sp.vol, sp.pan);
    }
  }
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
  if (player.mount) {
    const m = player.mount;
    elMount.style.display = 'block';
    elMount.innerHTML = `<b>${m.petName}</b> the ${m.def.name} ${Math.max(0, Math.ceil(m.hp))}/${m.maxHp}<div class="bar"><div class="fill" style="width:${(m.hp / m.maxHp) * 100}%;background:#ff40a0"></div></div>`;
    elPrompt.style.display = 'block';
    elPrompt.textContent = 'E — hop off';
  } else {
    elMount.style.display = 'none';
    const near = player.alive ? mounts.nearestFree(player.pos.x, player.pos.z, 3.6) : null;
    elPrompt.style.display = near ? 'block' : 'none';
    if (near) elPrompt.textContent = `E — ride ${near.petName} the ${near.def.name}`;
  }
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
  miniCtx.fillStyle = '#ffd070';
  miniCtx.beginPath();
  miniCtx.arc(mx(rory.pos.x), mz(rory.pos.z), 4, 0, Math.PI * 2);
  miniCtx.fill();
  for (const m of mounts.list) {
    if (!m.alive || m.rider) continue;
    miniCtx.fillStyle = '#ff60e0';
    miniCtx.fillRect(mx(m.pos.x) - 2.5, mz(m.pos.z) - 2.5, 5, 5);
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
      trip.resize();
      camera.far = 130;
      camera.updateProjectionMatrix();
      fog.far = 110;
    }
  }
}

let stepDist = 0;
let wasGround = true;
let airT = 0;
let lowBladderT = 0;
let hadPotion = false;
let wasBurn = false;
let wasFrozen = false;
let stepBudget = 0;

/** Footsteps, jumps and landings for the player and the bots near you; status-effect cues. */
function movementSounds(dt: number) {
  if (player.alive) {
    const m = player.mount;
    if (player.onGround) {
      stepDist += player.horizSpeed * dt;
      const stride = m ? (m.type === 'beetle' ? 2.4 : 1.4) : 2.1;
      if (stepDist > stride) {
        stepDist = 0;
        if (player.horizSpeed > 0.8) sound.step(0.75, 0, m ? (m.type === 'beetle' ? 2 : 1) : 0);
      }
    }
    if (wasGround && !player.onGround && player.vel.y > 2) { sound.jump(); airT = 0; }
    if (!player.onGround) airT += dt;
    else {
      if (!wasGround && airT > 0.2) sound.land(Math.min(1, airT * 1.5));
      airT = 0;
    }
    wasGround = player.onGround;
    const burning = player.status.burn > 0;
    if (burning && !wasBurn) sound.ignite();
    wasBurn = burning;
    const frozen = player.status.frozen > 0;
    if (frozen && !wasFrozen) sound.freeze();
    wasFrozen = frozen;
    if (hadPotion && !player.potion) sound.potionEnd();
    hadPotion = !!player.potion;
    lowBladderT -= dt;
    if (firing && player.bladder < 14 && lowBladderT <= 0) { lowBladderT = 1; sound.lowBladder(); }
  }
  rory.stepAcc += rory.speedNow * dt;
  if (rory.stepAcc > 2.6) {
    rory.stepAcc = 0;
    const dx = rory.pos.x - player.pos.x;
    const dz = rory.pos.z - player.pos.z;
    const dist = Math.hypot(dx, dz);
    if (dist < 30) {
      const sp = sound.spatial(rory.pos.x, rory.pos.z);
      sound.step(sp.vol * (1 - dist / 30) * 1.2, sp.pan, 2);
    }
  }
  stepBudget = 4;
  for (const f of fighters) {
    if (!f.alive || f.speedNow < 1) continue;
    const dx = f.pos.x - player.pos.x;
    const dz = f.pos.z - player.pos.z;
    const d2 = dx * dx + dz * dz;
    if (d2 > 26 * 26) continue;
    f.stepAcc += f.speedNow * dt;
    const m = f.mount;
    if (f.stepAcc > (m ? (m.type === 'beetle' ? 2.4 : 1.4) : 1.9)) {
      f.stepAcc = 0;
      if (stepBudget-- > 0) {
        const sp = sound.spatial(f.pos.x, f.pos.z);
        sound.step(sp.vol * (1 - Math.sqrt(d2) / 26) * 0.8, sp.pan, m ? (m.type === 'beetle' ? 2 : 1) : 0);
      }
    }
  }
}

function simulate(dt: number) {
  const t0 = performance.now();
  time += dt;
  fightCtx.time = time;
  yelps = Math.min(2, yelps + dt * 10);

  idleT -= dt;
  if (idleT <= 0) {
    idleT = 1.3 + Math.random() * 1.7;
    grid.query(player.pos.x, player.pos.z, 30, nearBuf);
    const o = nearBuf[Math.floor(Math.random() * nearBuf.length)];
    if (o instanceof Fighter && o.alive) fighterSay(o, 'idle');
  }
  fillerT -= dt;
  if (fillerT <= 0) { fillerT = 40 + Math.random() * 30; announcer('filler'); }
  if (phase === 'play') {
    chaosIn -= dt;
    if (chaosIn <= 0) { chaosIn = 55 + Math.random() * 35; startChaos(); }
  }
  if (chaos) {
    chaos.t -= dt;
    chaos.tickT -= dt;
    if (chaos.tickT <= 0) { chaos.tickT = 4; chaos.def.tick?.(); }
    if (chaos.t <= 0) endChaos();
  }

  grid.clear();
  for (const c of everyone) if (c.alive) grid.insert(c);
  grid.insert(rory);

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
  rory.update(dt, player);
  mounts.update(dt, time);
  movementSounds(dt);
  pee.update(dt, {
    world, grid, fx,
    onHit: applyHit,
  });
  potions.update(dt, time, grid, (p, who) => {
    if (who.isPlayer) {
      banner(`${PEE[p.kind].name.toUpperCase()}! ${PEE[p.kind].blurb}`, 2.6);
      sound.potion();
      if (Math.random() < 0.6) playerSay(p.kind as SayCtx);
    } else if (who instanceof Fighter) {
      fighterSay(who, p.kind as SayCtx);
    }
  });
  zones.update(dt, everyone, time);
  fx.update(dt);
  forest.animate(time);

  // the player dying
  if (playerWasAlive && !player.alive) {
    deaths++;
    mounts.dismount(player);
    sound.cannon(false);
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
      sound.respawn();
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
    if (!warned50 && Math.min(tickets[0], tickets[1]) <= 50) { warned50 = true; announcer('low50'); }
    if (!warned20 && Math.min(tickets[0], tickets[1]) <= 20) { warned20 = true; announcer('low20'); }
    if (tickets[0] <= 0 || tickets[1] <= 0) {
      phase = 'end';
      phaseT = 9;
      const won = tickets[1] <= 0;
      banner(won ? 'VICTORY! THE FOREST IS YOURS!' : 'DEFEAT! YOUR TICKETS RAN DRY', 8);
      announcer(won ? 'victory' : 'defeat');
    }
  } else {
    phaseT -= dt;
    if (phaseT <= 0) newMatch();
  }
  perfSim += (performance.now() - t0 - perfSim) * 0.05;
}

const fogCol = new THREE.Color();
const TINTS: Record<PeeKind, number> = { normal: 0, fire: -0.7, frost: 0.9, acid: 0.35, shock: 0.15, poison: -1.0, heal: 0.6 };
let tintNow = 0;
let ampNow = 0.55;
let fovNow = 75;

function psychedelia(dt: number, vt: number, beat: number) {
  const kind: PeeKind = player.potion?.kind ?? 'normal';
  const target = 0.55 + (player.potion ? 0.2 : 0) + (player.mount ? 0.12 : 0) + (firing ? 0.08 : 0) + (chaos ? 0.25 : 0) + player.hurtFlash * 0.25;
  ampNow += (Math.min(1, target) - ampNow) * Math.min(1, dt * 2);
  tintNow += (TINTS[kind] - tintNow) * Math.min(1, dt * 1.5);
  const lvl = trip.level / 2;
  trip.update(vt, camera.position, beat);
  trip.horizon(vt, fogCol);
  fog.color.copy(fogCol);
  (scene.background as THREE.Color).copy(fogCol);
  hemi.color.setHSL((vt * 0.02) % 1, 0.55, 0.72);
  hemi.groundColor.setHSL((vt * 0.02 + 0.5) % 1, 0.5, 0.26);
  moon.color.setHSL((vt * 0.03 + 0.6) % 1, 0.45, 0.82);
  const fovTarget = 75 + (Math.sin(vt * 0.7) * 2 + beat * 2.5) * ampNow * lvl + (player.mount ? 6 : 0);
  fovNow += (fovTarget - fovNow) * Math.min(1, dt * 4);
  if (Math.abs(camera.fov - fovNow) > 0.01) { camera.fov = fovNow; camera.updateProjectionMatrix(); }
  player.roll = (Math.sin(vt * 0.9) * 0.018 + Math.sin(vt * 0.37) * 0.012) * ampNow * lvl;
}

function tick() {
  requestAnimationFrame(tick);
  const raw = clock.getDelta();
  const vt = clock.elapsedTime;
  const beat = music.pulse();
  psychedelia(Math.min(raw, 0.05), vt, beat);
  const dt = Math.min(raw, 0.05);
  if (locked) { simulate(dt * timeScale); adaptQuality(raw); }

  // the shadow follows the player around the big map
  moon.target.position.set(player.pos.x, 0, player.pos.z);
  moon.position.set(player.pos.x - 35, 65, player.pos.z + 28);

  elHit.style.boxShadow = `inset 0 0 120px 30px rgba(220,0,0,${(player.hurtFlash * 0.7).toFixed(2)})`;
  player.hurtFlash = Math.max(0, player.hurtFlash - dt * 1.8);
  if (bannerT > 0) { bannerT -= dt; if (bannerT <= 0) elBanner.style.opacity = '0'; }
  if (chatterT > 0) { chatterT -= dt; if (chatterT <= 0) elChatter.style.opacity = '0'; }
  if (markerT > 0) { markerT -= dt; if (markerT <= 0) elMarker.style.opacity = '0'; }
  for (const f of feed) f.t -= dt;
  while (feed.length && feed[0].t <= 0) feed.shift();
  elRespawn.style.display = !player.alive && phase === 'play' ? 'block' : 'none';
  if (!player.alive) elRespawn.textContent = `Respawning in ${Math.max(0, Math.ceil(respawnT))}…`;
  hudT += dt;
  if (hudT > 0.1) {
    hudT = 0;
    renderHud();
    grid.query(player.pos.x, player.pos.z, 24, nearBuf);
    let foes = 0;
    for (const o of nearBuf) if (o.alive && o.team === 1) foes++;
    music.setIntensity(Math.min(1, foes / 8 * 0.5 + (player.potion ? 0.25 : 0) + (player.mount ? 0.2 : 0) + (firing ? 0.15 : 0)));
    music.setMood(KIND_IDX.indexOf(player.potion?.kind ?? 'normal'));
  }

  sound.setListener(camera.position.x, camera.position.z, camera.rotation.y);
  trip.render(scene, camera, vt, ampNow, beat, tintNow);
}

applyTeamColors();
buildFighters();
newMatch();
renderHud();
tick();

// handy for poking at the game from the console / tests
(window as unknown as { __pw: unknown }).__pw = {
  rory, fighterSay, playerSay, announcer, startChaos, endChaos, CHAOS,
  world, nav, player, fighters, zones, potions, pee, fx, forest, grid, sound, camera, scene, mounts, music, trip, toggleRide,
  setRunning: (v: boolean) => { locked = v; },
  setFaction, newMatch, applyHit, respawnPoint, sim: simulate,
  get tickets() { return tickets; },
  get perf() { return { fps: Math.round(fpsEma), quality: lowQuality, simMs: perfSim, droplets: pee.active, drawCalls: renderer.info.render.calls, tris: renderer.info.render.triangles }; },
};
