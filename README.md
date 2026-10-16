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
- **Bugs:** Disco Spider (fast, twin cannons), Tank Beetle (slow, tough, shotgun-style cannons), Zoom Ladybug (very
  fast, fragile). Press **E** next to one to ride it; while you ride, the bug takes the damage. Bots ride them too, and
  popped bugs come back after 40 seconds.
- **Sound:** footsteps (boots, skittering legs, beetle thumps), jumps, splashing, a night-forest ambience and a
  generative music engine that plays weird scales in odd time signatures. The scale changes with your potion.
- **Rory:** a huge, blond, bowl-cut NPC (twice a gnome's size) who wanders the forest and cannot be killed. Get close and he says "Me Rory".
- **Talking:** everyone never shuts up: gnomes shout when they spot you, get hit, burn, ride bugs (which have names), lose bugs, capture zones or just hallucinate. A deranged announcer commentates, and every minute or so a chaos event hits (moon gravity, rainbow rain, turbo pee, titan gnomes, bug stampede, disco speed). **V** shouts a battle cry.
- **Art:** hand-drawn look: pillowy rounded shapes with wobbly edges, cel-shaded paint, wobbly ink outlines that redraw 8 times a second, paper grain and pencil hatching in the shadows. **H** turns it off.
- **Trippy mode:** swirling sky, warped colour-shifting picture and drifting spores. **T** cycles full / mild / off.
- **Controls:** WASD move, Space jump, Shift walk, mouse aim, hold click to pee, E ride / hop off, Esc pause,
  M voices, N music, T trip level.

## Code map

- `src/main.ts` – game loop, HUD, minimap, tickets, respawns
- `src/forest.ts` – the map (instanced trees, mushrooms, crystals, zone sites)
- `src/world.ts` – grid-accelerated collision and raycasts (the forest has ~1000 blocks)
- `src/nav.ts` – coarse walkable grid and heap A* for 100 bots
- `src/fighter.ts` – bot models (baked into a few meshes each) and AI
- `src/pee.ts`, `src/combat.ts` – droplets, potion types, status effects
- `src/mounts.ts` – the rideable bugs; `src/music.ts` – generative music; `src/trip.ts` – sky, spores and the warp pass
- `src/potions.ts`, `src/zones.ts`, `src/player.ts`, `src/fx.ts`, `src/audio.ts`, `src/gnome.ts`
