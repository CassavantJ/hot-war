import { describe, expect, it } from 'vitest';

import { applyCommand } from './commands';
import { orderDeploy, orderMove } from './orders';
import { available } from './production';
import { NATIONS, type Nation } from './rules';
import { createGame } from './setup';
import { revealAll } from './shroud';
import type { GameSettings, World } from './world';

function run(world: World, seconds: number): void {
  const steps = Math.round(seconds / 0.05);
  for (let i = 0; i < steps && world.outcome === 'playing'; i++) world.tick();
}

function game(you: Nation, them: Nation, ai: boolean): GameSettings {
  return {
    mapId: 'crossroads',
    seed: 3,
    credits: 20_000,
    startingUnits: 'none',
    shortGame: true,
    crates: false,
    players: [
      {
        name: 'A',
        faction: NATIONS[you].faction,
        nation: you,
        color: '#2f74e0',
        team: 0,
        ai: ai ? 'hard' : null,
      },
      {
        name: 'B',
        faction: NATIONS[them].faction,
        nation: them,
        color: '#d8342c',
        team: 0,
        ai: 'hard',
      },
    ],
  };
}

/** Two bases with the buildings that unlock everything, and no computer players. */
function sandbox(you: Nation, them: Nation): World {
  const world = createGame(game(you, them, false));
  world.brains = [];
  for (const unit of world.units) unit.dead = true;
  const accord = NATIONS[you].faction === 'accord';
  const base = accord
    ? ['a_hq', 'a_power', 'a_power', 'a_refinery', 'a_barracks', 'a_factory', 'a_aircommand']
    : ['b_hq', 'b_reactor', 'b_reactor', 'b_refinery', 'b_barracks', 'b_factory', 'b_radar'];
  let x = 2;
  for (const type of base) {
    const structure = world.addStructure(type as 'a_hq', 0, x, 50, true);
    x += structure.w + 1;
  }
  world.addStructure(NATIONS[them].faction === 'accord' ? 'a_hq' : 'b_hq', 1, 58, 2, true);
  world.structuresChanged = true;
  run(world, 1);
  return world;
}

describe('countries', () => {
  it('only the right country can build its special', () => {
    const britain = sandbox('britain', 'russia');
    const america = sandbox('america', 'russia');
    const you = (world: World) => {
      const player = world.players[0];
      if (!player) throw new Error('no player');
      return player;
    };
    expect(available(britain, you(britain), 'marksman')).toBe(true);
    expect(available(america, you(america), 'marksman')).toBe(false);
    expect(available(america, you(america), 'a_fortress')).toBe(false);
    const france = sandbox('france', 'russia');
    expect(available(france, you(france), 'a_fortress')).toBe(true);
    const russia = sandbox('russia', 'america');
    expect(available(russia, you(russia), 'arctank')).toBe(true);
    expect(available(russia, you(russia), 'minelayer')).toBe(false);
  });

  it('America drops paratroopers where it has scouted, once charged', () => {
    const world = sandbox('america', 'russia');
    const command = world.structures.find((structure) => structure.type === 'a_aircommand');
    const player = world.players[0];
    if (!command || !player) throw new Error('no air command');
    command.superCharge = 1;
    const riflemen = () => world.units.filter((unit) => unit.type === 'rifleman').length;
    // Not somewhere unexplored.
    player.shroud.fill(0);
    expect(
      applyCommand(world, 0, { kind: 'superweapon', structure: command.id, x: 30, z: 30 }),
    ).toBe(false);
    revealAll(player);
    expect(
      applyCommand(world, 0, { kind: 'superweapon', structure: command.id, x: 30, z: 30 }),
    ).toBe(true);
    expect(riflemen()).toBe(0);
    run(world, 3);
    expect(riflemen()).toBe(6);
    expect(command.superCharge).toBeLessThan(1);
  });

  it('Libya’s mines are laid on deploy and blow up enemy tanks', () => {
    const world = sandbox('libya', 'america');
    const layer = world.addUnit('minelayer', 0, 20.5, 30.5);
    orderDeploy([layer]);
    run(world, 1);
    expect(world.mines).toHaveLength(1);
    // A second mine can't go on the same spot.
    orderDeploy([layer]);
    run(world, 1);
    expect(world.mines).toHaveLength(1);
    orderMove(world, [layer], 14, 36);
    run(world, 6);
    const tank = world.addUnit('lancer', 1, 24.5, 30.5);
    orderMove(world, [tank], 16, 30.5);
    run(world, 6);
    expect(world.mines).toHaveLength(0);
    expect(tank.hp < tank.maxHp || tank.dead).toBe(true);
  });

  // Nine twelve-minute games: slow on a shared CI machine, so it gets a generous limit.
  it(
    'every country plays a full game against the computer without trouble',
    { timeout: 60_000 },
    () => {
      const nations = Object.keys(NATIONS) as Nation[];
      for (const [i, nation] of nations.entries()) {
        const rival = nations[(i + 4) % nations.length] ?? 'russia';
        const world = createGame(game(nation, rival, true));
        run(world, 12 * 60);
        const built = world.players.map((player) => player.stats.unitsBuilt);
        expect(built.every((count) => count > 0)).toBe(true);
      }
    },
  );
});
