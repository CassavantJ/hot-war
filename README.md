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

Stage 1 is skirmish against computer players (easy, normal and hard) on three maps for two to
four players. Later stages add naval units, superweapons, transports and a campaign.

## How it's built

- **Simulation** (`src/sim/`): plain TypeScript on a fixed 20 Hz clock, with tests. The map
  grid and its generator (`map.ts`, `maps.ts`), A\* pathfinding (`path.ts`), units and their
  orders (`units.ts`, `movement.ts`), weapons, armour and projectiles (`combat.ts`, `rules.ts`),
  building, power and placement (`production.ts`, `structures.ts`), ore and harvesting
  (`economy.ts`), the shroud, crates, and the computer players (`ai.ts`).
- **View** (`src/view/`): three.js from a fixed isometric angle. Every model is built from simple
  solids (`models.ts`) and drawn instanced, with a team-colour shader; terrain, water, the
  shroud, particles, beams, decals, the radar and the selection overlay.
- **Game** (`src/game/`): the match loop, mouse and keyboard controls, synthesised sound
  effects, a procedural soundtrack, and the announcer (the browser's own speech voice).
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
loads anything from another origin, add that origin to the Content-Security-Policy there.
