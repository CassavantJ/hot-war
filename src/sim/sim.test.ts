import { describe, expect, it } from 'vitest';

import { MISSIONS } from './campaign';
import { GROUND } from './map';
import { buildMap, MAPS } from './maps';
import { createMission } from './mission';
import { orderAttack, orderDeploy, orderEnter, orderMove } from './orders';
import { placeStructure, sell, spawnUnit, startBuild } from './production';
import { mobilityOf, STRUCTURES } from './rules';
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

describe('special abilities', () => {
  const blank = () => {
    const world = createGame(settings([human('accord'), computer('bloc')]));
    world.brains = [];
    for (const unit of world.units) unit.dead = true;
    // Headquarters in the far corners, so nobody counts as beaten.
    world.addStructure('a_hq', 0, 1, 58, true);
    world.addStructure('b_hq', 1, 59, 1, true);
    world.tick();
    return world;
  };

  it('infantry garrison a town building, which shoots back until it is burned out', () => {
    const world = blank();
    const house = world.structures.find((structure) => structure.type === 'c_flats');
    if (!house) throw new Error('no flats');
    const squad = [0, 1, 2].map((i) =>
      world.addUnit('rifleman', 0, house.cx - 2 + i * 0.4, house.z + house.h + 2),
    );
    orderEnter(squad, house);
    run(world, 12);
    expect(house.garrison).toHaveLength(3);
    expect(house.owner).toBe(0);
    const enemy = world.addUnit('draftee', 1, house.cx, house.z + house.h + 4);
    run(world, 8);
    expect(enemy.dead).toBe(true);
    const torches = [0, 1, 2, 3].map((i) =>
      world.addUnit('torch', 1, house.cx - 1 + i * 0.5, house.z + house.h + 2.5),
    );
    orderAttack(world, torches, house);
    run(world, 20);
    expect(house.garrison).toHaveLength(0);
    expect(house.owner).toBe(-1);
  });

  it('engineers capture oil derricks, which then pay out', () => {
    const world = blank();
    const derrick = world.structures.find((structure) => structure.type === 'c_derrick');
    if (!derrick) throw new Error('no derrick');
    const engineer = world.addUnit('engineer', 0, derrick.cx, derrick.z + derrick.h + 3);
    orderEnter([engineer], derrick);
    run(world, 10);
    expect(derrick.owner).toBe(0);
    expect(engineer.dead).toBe(true);
    const me = world.players[0];
    const before = me?.credits ?? 0;
    run(world, 10);
    expect((me?.credits ?? 0) - before).toBeGreaterThanOrEqual(50);
  });

  it('jets take off, strike, and fly home to rearm', () => {
    const world = blank();
    const command = world.addStructure('a_aircommand', 0, 10, 10, true);
    world.structuresChanged = true;
    world.tick();
    const me = world.players[0];
    if (!me) throw new Error('no player');
    const jet = spawnUnit(world, me, 'falcon');
    if (!jet) throw new Error('no jet');
    expect(jet.flight).toBe('landed');
    const target = world.addUnit('bear', 1, 30, 30);
    orderAttack(world, [jet], target);
    run(world, 6);
    expect(target.hp).toBeLessThan(target.maxHp);
    expect(jet.ammo).toBe(0);
    run(world, 16);
    expect(jet.flight).toBe('landed');
    expect(command.pads).toContain(jet.id);
    run(world, 7);
    expect(jet.ammo).toBe(2);
  });

  it('commandos blow up buildings, and selling refunds half', () => {
    const world = blank();
    const target = world.addStructure('b_barracks', 1, 30, 30, true);
    const commando = world.addUnit('commando', 0, 28, 34);
    orderEnter([commando], target);
    run(world, 10);
    expect(target.dead).toBe(true);
    const me = world.players[0];
    if (!me) throw new Error('no player');
    const plant = world.addStructure('a_power', 0, 12, 12, true);
    const before = me.credits;
    sell(world, plant);
    run(world, 2);
    expect(plant.dead).toBe(true);
    expect(me.credits - before).toBe(400);
  });
});

describe('campaign', () => {
  for (const def of MISSIONS) {
    it(`${def.title} sets up cleanly and runs`, () => {
      const world = createMission(def);
      const map = world.map;
      for (const structure of world.structures) {
        for (let z = structure.z; z < structure.z + structure.h; z++) {
          for (let x = structure.x; x < structure.x + structure.w; x++) {
            expect(map.inside(x, z), `${structure.type} off the map`).toBe(true);
            const index = map.index(x, z);
            expect(map.structure[index], `${structure.type} overlaps at ${x},${z}`).toBe(
              structure.id,
            );
            const ground = map.groundAt(index);
            if (!structure.def.onWater) {
              expect(
                ground === GROUND.water || ground === GROUND.cliff,
                `${structure.type} on water or cliff at ${x},${z}`,
              ).toBe(false);
            }
          }
        }
      }
      for (const unit of world.units) {
        const cell = map.cellAt(unit.x, unit.z);
        expect(
          map.isBlocked(cell, mobilityOf(unit.def)),
          `${unit.type} stuck at ${unit.x},${unit.z}`,
        ).toBe(false);
      }
      run(world, 90);
      expect(world.outcome).toBe('playing');
      expect(world.mission?.status.length).toBe(def.objectives.length);
    });
  }
});
