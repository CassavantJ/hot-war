import { buildMap, mapSpec } from './maps';
import { Player } from './player';
import { Random } from './random';
import { BASIC_INFANTRY, type Faction, type UnitType } from './rules';
import { revealAround } from './shroud';
import { World, type GameSettings, type StartingUnits } from './world';
import { datan2, dcos, dsin } from './dmath';

/** Team colours players can pick. */
export const COLORS = [
  { id: 'red', name: 'Red', value: '#d8342c' },
  { id: 'blue', name: 'Blue', value: '#2f74e0' },
  { id: 'yellow', name: 'Yellow', value: '#e9c229' },
  { id: 'green', name: 'Green', value: '#3fa34d' },
  { id: 'orange', name: 'Orange', value: '#ec7a1c' },
  { id: 'purple', name: 'Purple', value: '#8a4bd6' },
  { id: 'teal', name: 'Teal', value: '#1fb3a6' },
  { id: 'pink', name: 'Pink', value: '#e85aa6' },
] as const;

const TANK: Record<Faction, UnitType> = { accord: 'lancer', bloc: 'bear' };
const ANTI_AIR: Record<Faction, UnitType> = { accord: 'striker', bloc: 'flaktruck' };

function startingForce(faction: Faction, force: StartingUnits): UnitType[] {
  const infantry = BASIC_INFANTRY[faction];
  if (force === 'none') return [];
  if (force === 'squad') return [infantry, infantry, infantry, TANK[faction], 'hound'];
  return [
    infantry,
    infantry,
    infantry,
    infantry,
    infantry,
    infantry,
    TANK[faction],
    TANK[faction],
    TANK[faction],
    ANTI_AIR[faction],
    'hound',
    'hound',
    'engineer',
  ];
}

/** Builds a new skirmish from the lobby's settings. */
export function createGame(settings: GameSettings): World {
  const spec = mapSpec(settings.mapId);
  const { map, neutrals } = buildMap(spec, 1);
  const rng = new Random(settings.seed);
  const starts = map.starts.slice();
  for (let i = starts.length - 1; i > 0; i--) {
    const j = rng.int(0, i);
    const a = starts[i];
    const b = starts[j];
    if (a && b) {
      starts[i] = b;
      starts[j] = a;
    }
  }
  const setups = settings.players.slice(0, spec.players);
  const players = setups.map(
    (setup, index) =>
      new Player({
        index,
        name: setup.name,
        faction: setup.faction,
        color: setup.color,
        team: setup.team,
        ai: setup.ai,
        start: starts[index] ?? { x: map.width / 2, z: map.height / 2 },
        credits: settings.credits,
        cells: map.width * map.height,
      }),
  );
  const world = new World(map, players, { ...settings, players: setups });
  for (const neutral of neutrals) world.addStructure(neutral.type, -1, neutral.x, neutral.z, true);
  const middle = { x: map.width / 2, z: map.height / 2 };
  for (const player of players) {
    const { x, z } = player.start;
    const facing = datan2(middle.z - z, middle.x - x);
    world.addUnit('basetruck', player.index, x + 0.5, z + 0.5, facing);
    const force = startingForce(player.faction, settings.startingUnits);
    force.forEach((type, i) => {
      const angle = facing + (i - (force.length - 1) / 2) * 0.32;
      const distance = 4.2 + (i % 2) * 1.1;
      world.addUnit(
        type,
        player.index,
        x + 0.5 + dcos(angle) * distance,
        z + 0.5 + dsin(angle) * distance,
        facing,
      );
    });
    revealAround(world, player, x + 0.5, z + 0.5, 10);
  }
  world.structuresChanged = true;
  return world;
}
