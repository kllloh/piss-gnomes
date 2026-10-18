# Piss Gnomes: The Enchanted Forest

A silly, psychedelic 50 v 50 first-person capture-the-zones game in a huge enchanted forest. Your only weapon is
your bladder. Find potions and the stream changes what it does. Red-hat gnomes versus blue-cap gnomes; you play one
of the 50. Hop on a giant spider, beetle or ladybug with a pee cannon on its back. Single player (the other 99 are
bots). Built with TypeScript, Vite and Three.js, derived from *Gnome Strike*.

## Run it

```bash
npm install
npm run dev        # development server
# or
npm run build      # single self-contained dist/index.html you can double-click
```

## How to play

- **Pee:** hold the left mouse button. The stream arcs, so **aim up for distance**; the glowing disc shows
  where it will land. Your bladder drains as you go and refills when you stop (or grab a potion).
- **Potions:** glowing bottles lie around the forest and come back after 30 seconds. Grab one and your pee
  changes for 40 seconds:
  - **Dragon Brew** – sets enemies on fire (wet enemies burn much less).
  - **Frost Elixir** – slows, then freezes solid (wet freezes faster).
  - **Acid Tonic** – damage over time, and enemies take 25% more from everything.
  - **Storm Draught** – chain lightning; wet enemies take double.
  - **Toadstool Tincture** – lingering poison that spreads to anyone standing close (friend or foe).
  - **Nectar of Life** – heals allies and puts out fires; harmless to enemies.
  - Plain pee makes enemies **wet**, which is what makes fire weak and shock/frost strong.
- **Zones:** there are seven. Stand in one to capture it; the more of you, the faster. The side holding more zones
  drains the other's tickets, and every death costs a ticket. Run the other side out of tickets to win.
- **Weapon crates:** glowing crates around the forest (they come back after 45 s). **Piss Jugs** are grenades (G to lob,
  up to 6). The **Piss Sniper** (2, right-click to zoom) fires an instant beam: 85 damage, more for headshots, 8 shots.
  The **Piss Launcher** (3) fires big slow pee-balls with a splash, 5 shots. 1 goes back to your bladder, Q cycles. Your
  current potion changes what the blast does, and bots pick up and use all of it too.
- **Health regeneration:** stay out of trouble for 5 seconds (no damage, no burning or poison) and your health creeps back at 9 HP a second; a ✚ shows beside your health. Bots do it too.
- **Health, armour and pee mods:** **Health Kits** heal 60 and **Armour** (+50, max 100) soaks two thirds of every hit until
  it is gone. Both are left alone if you do not need them. **Double Stream** (35 s) fires two streams at twice the flow, and
  **Swirl Stream** (35 s) fires a corkscrew whose droplets do 2.2x damage; they stack, and they work with potions and bug
  cannons. Bots hunt for all of these too.
- **Kill streaks** (kills in a row without dying; rewards are lost if you die, press **R** to use the next one):
  3 kills = **Piss Turret** (a friendly auto-turret that sprays nearby enemies for 40 s and counts its kills for you),
  5 kills = **Piss Air Strike** (a smoke pillar where you aim, then nine giant jugs fall in a line), 8 kills =
  **Piss Nuke** (a 4 second siren, then a golden fireball that wipes out every enemy within 90 m of where you aimed;
  your side is safe). Bots shoot at your turret, so protect it.
- **Testing cheat:** press **I** (or open the page with `?god`) to toggle invincibility. Nothing can hurt you, and the bug you ride is safe too.
- **Bugs:** Disco Spider (fast, twin cannons), Tank Beetle (slow, tough, shotgun-style cannons), Zoom Ladybug (very
  fast, fragile). Press **E** next to one to ride it; while you ride, the bug takes the damage. Bots ride them too, and
  popped bugs come back after 40 seconds.
- **3D sound:** every sound in the world is placed in 3D with HRTF panning, so you can hear left and right, in front and behind, and above and below. Distant sounds fade, and sounds behind walls come out muffled. Wear headphones.
- **Sound:** footsteps (boots, skittering legs, beetle thumps), jumps, splashing, a night-forest ambience and a
  generative music engine that plays weird scales in odd time signatures. The scale changes with your potion.
- **Rory:** a huge, blond, bowl-cut NPC (twice a gnome's size) who wanders the forest and cannot be killed. Get close and he says "Me Rory".
- **Talking:** everyone never shuts up: gnomes shout when they spot you, get hit, burn, ride bugs (which have names), lose bugs, capture zones or just hallucinate. A deranged announcer commentates, and every minute or so a chaos event hits (moon gravity, rainbow rain, turbo pee, titan gnomes, bug stampede, disco speed). **V** shouts a battle cry.
- **Enemy markers:** a red arrow floats above every enemy within 100 m, drawn on top of the scenery.
- **Thermal vision (F):** Sniper Sprinkler and Dew Scout can switch it on: the cold world goes blue and purple, and every gnome and bug glows white-hot.
- **Chris:** a big black cat who is always with Rory. Every 14 to 22 seconds he farts a cloud of green **health gas** that heals everyone standing in it (friend or foe) for 7 seconds. Look for the green circle on the minimap. He cannot be hurt either. Rory and Chris start each match out in the wild, away from both bases.
- **Audio:** the music is much quieter now, with a volume slider and music/voices on/off buttons in the lobby (N and M also toggle them in game).
- **Derek:** once per match, at a random moment in the first two minutes, an old farmer with black hair roars in from a random edge of the map on a giant ride-on mower (about 13 m tall, ten times a gnome). He drives wide, slow turns at 11 m/s for 100 seconds, cutting down every tree, cactus, mushroom and palm under his 13 m deck and mowing down any gnome (or you) in the way, then drives off home. He cannot be hurt, only annoyed. Watch for the green block on the minimap and the announcer's warning.
- **Maps:** pick on the start screen (the page reloads with the new map). **The Enchanted Forest** is the original night
  forest. **Desert Trip** is a hot, bright, hallucinogenic desert: neon cacti, striped mesas, an oasis, giant bones, a
  spinning sun over the Sun Temple, floating mirage orbs and a swirling day sky. Same zones, bugs, weapons and bots.
- **Mushroom Hollow:** a third map, a glowing violet fungal cavern: towering neon caps you can walk under, glowcaps,
  puffball cover, a goo lagoon, a giant cap held up by six stems, and spores drifting upwards. Same zones and gear.
- **Classes and loadouts** (LOADOUT tab on the start screen): Garden Trooper, Sniper Sprinkler, Heavy Hosepipe, Double
  Dipper, Dew Scout and Field Medic, each with its own health, armour, speed and starting kit. The kit is issued every time
  you spawn. Bots draw a random class each spawn, too.
- **Easier enemies:** the other team has half the health and armour (and their bugs half the toughness), so they die 50%
  faster.
- **Lobby:** the start screen is now a Call-of-Duty-style lobby: tabs (PLAY / LOADOUT / INTEL), a 3D gnome on a turntable
  with your class prop, loadout stats, match info, a squad list and a big DEPLOY button (or press Enter).
- **Graphics options** (start screen, or **H**): **PS2** (below), **ASCII** (the whole picture redrawn as coloured text, brighter areas using denser characters) and plain **HD**.
- **Soundtracks:** Mushroom Hollow plays generative **acid techno** (134 BPM, four-on-the-floor, a squelching 303 bassline with accents and slides, claps, off-beat hats, arps and breakdowns). Desert Trip plays **stoner metal** (70 BPM, fuzzed drop-D power-chord riffs, a lumbering half-time groove, tom fills, crashes and a wailing solo). The forest keeps the weird jam. All of it is made live with Web Audio.
- **Art:** blocky PlayStation 2 style: hard-edged low-poly shapes, chunky low-res textures, a 480p picture with dithered 5-bit colour, bloom and interlace lines, on top of the psychedelic sky and warping. Neon 80s UI. **H** switches between PS2 and HD.
- **Trippy mode:** swirling sky, warped colour-shifting picture and drifting spores. The warp and colour-melt get stronger the more damage you take, and settle as your health regenerates.
- **Phones and tablets:** touch controls appear automatically: a floating move stick on the left, drag anywhere else to look, a big PEE/FIRE button (drag it to aim while firing), plus JUMP, JUG, SWAP, RIDE, ZOOM (with the sniper), YELL and pause. Play in landscape; the first tap goes fullscreen where the browser allows it.
- **Controls:** WASD move, Space jump, Shift walk, mouse aim, hold click to pee, E ride / hop off, Esc pause,
  M voices, N music, F thermal vision, G jug, 1/2/3/Q weapons.

## Code map

- `src/main.ts` – game loop, HUD, minimap, tickets, respawns
- `src/forest.ts` – the map (instanced trees, mushrooms, crystals, zone sites)
- `src/world.ts` – grid-accelerated collision and raycasts (the forest has ~1000 blocks)
- `src/nav.ts` – coarse walkable grid and heap A* for 100 bots
- `src/fighter.ts` – bot models (baked into a few meshes each) and AI
- `src/pee.ts`, `src/combat.ts` – droplets, potion types, status effects
- `src/mounts.ts` – the rideable bugs; `src/music.ts` – generative music; `src/trip.ts` – sky, spores and the warp pass
- `src/potions.ts`, `src/zones.ts`, `src/player.ts`, `src/fx.ts`, `src/audio.ts`, `src/gnome.ts`
