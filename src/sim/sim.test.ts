import { describe, expect, it } from 'vitest';

import { buildMap, MAPS } from './maps';
import { orderAttack, orderDeploy, orderMove } from './orders';
import { placeStructure, startBuild } from './production';
import { STRUCTURES } from './rules';
import { createGame } from './setup';
import type { GameSettings, PlayerSetup, World } from './world';

function settings(players: PlayerSetup[], overrides: Partial<GameSettings> = {}): GameSettings {
  return {
    mapId: 'crossroads',
    seed: 7,
    credits: 10_000,
    startingUnits: 'none',
    shortGame: true,
    crates: false,
    players,
    ...overrides,
  };
}

const human = (faction: 'accord' | 'bloc' = 'accord'): PlayerSetup => ({
  name: 'You',
  faction,
  color: '#2f74e0',
  team: 0,
  ai: null,
});

const computer = (
  faction: 'accord' | 'bloc',
  ai: 'easy' | 'normal' | 'hard' = 'normal',
): PlayerSetup => ({ name: `CPU ${faction}`, faction, color: '#d8342c', team: 0, ai });

function run(world: World, seconds: number): void {
  const steps = Math.round(seconds / 0.05);
  for (let i = 0; i < steps; i++) world.tick();
}

describe('maps', () => {
  for (const spec of MAPS) {
    it(`${spec.name} is fair and connected`, () => {
      const { map, neutrals } = buildMap(spec);
      expect(map.starts).toHaveLength(spec.players);
      const regions = new Set(map.starts.map((start) => map.regionOf(map.index(start.x, start.z))));
      expect(regions.size).toBe(1);
      expect([...regions][0]).toBeGreaterThan(0);
      for (const start of map.starts) {
        let ore = 0;
        for (let z = start.z - 18; z <= start.z + 18; z++) {
          for (let x = start.x - 18; x <= start.x + 18; x++) {
            if (map.inside(x, z)) ore += map.oreAt(map.index(x, z));
          }
        }
        expect(ore).toBeGreaterThan(150);
      }
      // Neutral buildings don't overlap each other.
      const taken = new Set<number>();
      for (const neutral of neutrals) {
        const [w, h] = STRUCTURES[neutral.type].size;
        for (let z = neutral.z; z < neutral.z + h; z++) {
          for (let x = neutral.x; x < neutral.x + w; x++) {
            const index = map.index(x, z);
            expect(taken.has(index)).toBe(false);
            taken.add(index);
          }
        }
      }
    });
  }
});

describe('base building', () => {
  it('deploys, builds power and a refinery, and mines ore', () => {
    const world = createGame(settings([human('bloc'), computer('accord', 'easy')]));
    const me = world.players[0];
    if (!me) throw new Error('no player');
    const truck = world.units.find((unit) => unit.owner === 0 && unit.def.deploysToHq);
    if (!truck) throw new Error('no truck');
    orderDeploy([truck]);
    run(world, 2);
    const hq = world.structures.find((structure) => structure.owner === 0);
    expect(hq?.type).toBe('b_hq');
    if (!hq) return;
    expect(startBuild(world, me, 'b_reactor')).toBe(true);
    run(world, 12);
    expect(me.queues.building.ready).toBe('b_reactor');
    // Too far away first, then right next to the HQ.
    expect(placeStructure(world, me, 'b_reactor', hq.x + 12, hq.z)).toBe(false);
    expect(placeStructure(world, me, 'b_reactor', hq.x + hq.w + 1, hq.z)).toBe(true);
    run(world, 2);
    expect(me.powerOut).toBe(150);
    expect(startBuild(world, me, 'b_refinery')).toBe(true);
    run(world, 40);
    expect(me.queues.building.ready).toBe('b_refinery');
    let placed = false;
    for (let dz = -6; dz <= 6 && !placed; dz++) {
      for (let dx = -6; dx <= 6 && !placed; dx++) {
        placed = placeStructure(world, me, 'b_refinery', hq.x + dx, hq.z + hq.h + 1 + Math.abs(dz));
      }
    }
    expect(placed).toBe(true);
    const before = me.credits;
    run(world, 90);
    expect(world.units.some((unit) => unit.owner === 0 && unit.def.harvester)).toBe(true);
    expect(me.stats.harvested).toBeGreaterThan(500);
    expect(me.credits).toBeGreaterThan(before);
  });
});

describe('combat', () => {
  it('tanks beat infantry, and a group gets where it is sent', () => {
    const world = createGame(settings([human('bloc'), computer('accord')]));
    const tank = world.addUnit('bear', 0, 32, 30);
    const rifleman = world.addUnit('rifleman', 1, 36, 30);
    orderAttack(world, [tank], rifleman);
    run(world, 12);
    expect(rifleman.dead).toBe(true);
    expect(tank.hp).toBeGreaterThan(tank.maxHp * 0.7);
    const group = [0, 1, 2, 3, 4].map((i) => world.addUnit('draftee', 0, 20 + i * 0.4, 20));
    orderMove(world, group, 44, 44);
    run(world, 40);
    for (const unit of group) expect(Math.hypot(unit.x - 44, unit.z - 44)).toBeLessThan(3);
  });
});

describe('skirmish', () => {
  it('two computer players build bases, fight, and one of them wins', () => {
    const world = createGame(
      settings([computer('bloc', 'hard'), computer('accord', 'easy')], { seed: 3 }),
    );
    const log: string[] = [];
    for (let minute = 1; minute <= 40; minute++) {
      run(world, 60);
      const summary = world.players.map((player) => {
        const structures = world.structures.filter((s) => s.owner === player.index).length;
        const units = world.units.filter((u) => u.owner === player.index).length;
        return `${player.name}: $${Math.round(player.credits)} s${structures} u${units} k${player.stats.unitsKilled} mined${player.stats.harvested}`;
      });
      log.push(`${minute}m ${summary.join(' | ')}`);
      if (world.players.some((player) => player.defeated)) break;
    }
    for (const player of world.players) {
      expect(player.stats.harvested, log.join('\n')).toBeGreaterThan(3000);
      expect(player.stats.structuresBuilt, log.join('\n')).toBeGreaterThan(5);
    }
    expect(
      world.players.some((player) => player.defeated),
      log.join('\n'),
    ).toBe(true);
  }, 120_000);
});
