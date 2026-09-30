import { describe, expect, it } from 'vitest';

import { MISSIONS } from './campaign';
import { createMission } from './mission';
import { createGame } from './setup';
import { deserialize, serialize } from './snapshot';
import type { World } from './world';

function run(world: World, seconds: number): void {
  const steps = Math.round(seconds / 0.05);
  for (let i = 0; i < steps && world.outcome === 'playing'; i++) world.tick();
}

/** Everything that matters about where a battle has got to, as one string. */
function digest(world: World): string {
  const units = world.units
    .map((unit) => `${unit.id}:${unit.type}:${unit.x.toFixed(3)},${unit.z.toFixed(3)}:${unit.hp}`)
    .join('|');
  const structures = world.structures
    .map((structure) => `${structure.id}:${structure.type}:${structure.hp}`)
    .join('|');
  const players = world.players
    .map((player) => `${player.credits.toFixed(2)}:${player.powerOut}`)
    .join('|');
  return `${world.ticks}#${units}#${structures}#${players}#${world.outcome}`;
}

describe('save games', () => {
  it('a restored skirmish carries on exactly as the original does', { timeout: 30_000 }, () => {
    const world = createGame({
      mapId: 'crossroads',
      seed: 11,
      credits: 10_000,
      startingUnits: 'squad',
      shortGame: true,
      crates: true,
      players: [
        { name: 'A', faction: 'accord', color: '#2f74e0', team: 0, ai: 'hard' },
        { name: 'B', faction: 'bloc', color: '#d8342c', team: 0, ai: 'hard' },
      ],
    });
    run(world, 240);
    const saved = serialize(world);
    const restored = deserialize(saved);
    expect(digest(restored)).toBe(digest(world));
    expect(saved.length).toBeLessThan(3_000_000);
    run(world, 120);
    run(restored, 120);
    expect(digest(restored)).toBe(digest(world));
    // The restored world is its own copy, not the original's objects.
    expect(restored.units[0]).not.toBe(world.units[0]);
    expect(restored.units[0]?.def).toBe(world.units[0]?.def);
  });

  it('a restored mission keeps its script and objectives', () => {
    const mission = MISSIONS[0];
    if (!mission) throw new Error('No missions');
    const world = createMission(mission);
    run(world, 60);
    const restored = deserialize(serialize(world));
    expect(restored.mission?.def).toBe(mission);
    run(world, 60);
    run(restored, 60);
    expect(digest(restored)).toBe(digest(world));
  });
});
