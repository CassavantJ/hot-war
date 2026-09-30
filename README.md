# Hot War

Build a base, mine ore and crush the enemy in an alternate-history war.

An original real-time strategy game in the style of the classic late-90s base builders: the
Cold War has gone hot, and two factions fight it out over ore fields, oil derricks and
occupied towns. Everything here (the factions, units, buildings, maps, models, sound effects
and music) is made for this game, in code.

- **The Accord** is fast and high-tech: Lancer tanks, missile Strikers, Beam Tanks and Beam
  Towers that relay power into each other, Skyjumper jetpack troops, a Commando, Falcon strike
  jets and Warp Harvesters.
- **The Bloc** is heavy armour and brute force: Bear tanks, the twin-cannon Behemoth, Rocket
  Trucks, Flak Trucks, Torch Troopers, Dirigible bombers and armoured Ore Haulers.

- **Nine countries**, as in the classics: America, Korea, France,
  Germany and Great Britain for the Accord; Cuba, Iraq, Libya and Russia for the Bloc. Each
  has one special: America's Airborne Drop, Korea's Kestrel jet, France's Fortress Gun,
  Germany's Tank Hunter, Britain's Marksman, Cuba's Sapper, Iraq's Mortar Team, Libya's
  Minelayer and Russia's Arc Tank. Or pick Random.
- **Skirmish** against computer players (easy, normal and hard) on five maps for two to four
  players, two of them built around the sea.
- **Navies**: shipyards on the water, three warships a side (the Bloc's Hunter Sub hides
  underwater until it fires), and an amphibious Hover Transport. The Flak Truck carries
  infantry too.
- **Superweapons**: the Accord's Storm Array and Phase Gate, the Bloc's Hellfire Silo and
  Bulwark Field. They take minutes to charge, and everyone is warned when one is ready.
- **Two short campaigns**, three missions each, with briefings, scripted attacks, objectives
  and reinforcements.
- **Multiplayer** for two to four people over the internet: one hosts a room and shares its
  five-letter code, the others join with it.
- **Save games**: three slots, from the pause menu.
- **Voiced units** that answer when selected and ordered about (the browser's own speech
  voices), and a look in the style of the late-90s pre-rendered classics: painted terrain,
  bevelled and reflective metal, craters, and a chrome sidebar.

## How it's built

- **Simulation** (`src/sim/`): plain TypeScript on a fixed 20 Hz clock, with tests. It's
  deterministic to the bit (`dmath.ts` stands in for the `Math` functions browsers may round
  differently), every player action is a plain-data command (`commands.ts`), and a whole
  battle can be saved and restored (`snapshot.ts`). The map
  grid and its generator (`map.ts`, `maps.ts`), A\* pathfinding (`path.ts`), units and their
  orders (`units.ts`, `movement.ts`), weapons, armour and projectiles (`combat.ts`, `rules.ts`),
  building, power and placement (`production.ts`, `structures.ts`), ore and harvesting
  (`economy.ts`), the shroud, crates, superweapons (`superweapons.ts`), campaign missions
  (`mission.ts`, `campaign.ts`), and the computer players (`ai.ts`). Movement works on three
  layers (land, water and amphibious), each with its own pathfinding.
- **View** (`src/view/`): three.js from a fixed isometric angle. Every model is built from simple
  solids (`models.ts`) and drawn instanced, with a team-colour shader; terrain, water, the
  shroud, particles, beams, decals, the radar and the selection overlay.
- **Game** (`src/game/`): the match loop, mouse and keyboard controls, synthesised sound
  effects, a procedural soundtrack, the announcer and unit voices (the browser's own speech
  voices), save slots, and multiplayer: lockstep (`lockstep.ts`), where every screen runs the
  same simulation and only orders cross the network, and the relay connection (`net.ts`).
- **Relay** (`relay/`): a Cloudflare Worker with a Durable Object per room. It keeps the lobby
  and passes orders between players; it never runs the game.
- **Interface** (`src/components/`): the skirmish setup screen, the sidebar (radar, credits,
  power, build tabs) and the menus.

Part of [Jake's hub](https://raylmao.com). Scaffolded from the hub's app template, so it shares
the hub's theme, font and "back to the hub" bar (see `src/hub/`).

## Develop

```bash
pnpm install
pnpm dev
```

`pnpm check` runs the typecheck, lint, format check and tests (Vitest, any `*.test.ts` under
`src/`); CI runs it on every push. The tests include a full computer-versus-computer game.

In development, `window.hotwar` is the running match, for poking at from the console.

## Deploy

Hosted as its own Cloudflare Pages project at `https://hot-war.raylmao.com`. The full steps
(GitHub repo, Pages project, subdomain and hub registry entry) are in the hub's
`ADDING_AN_APP.md`.

`public/_headers` lets the hub embed this app (`frame-ancestors`). If the app calls an API or
loads anything from another origin, add that origin to the Content-Security-Policy there (the
multiplayer relay, `wss://hot-war-relay.raylmao.com`, is already in `connect-src`).

### Multiplayer relay

The relay is deployed separately, once, from `relay/`:

```bash
cd relay
pnpm install
npx wrangler login
npx wrangler deploy
```

That creates the `hot-war-relay` Worker, its `Room` Durable Object and the custom domain
`hot-war-relay.raylmao.com` (the `raylmao.com` zone has to be on the same Cloudflare account).
Redeploy only when `relay/src/` changes.

For local testing, `pnpm dev` in `relay/` runs it on port 8787, which development builds of
the game connect to. Set `VITE_RELAY_URL` to point a build somewhere else.
