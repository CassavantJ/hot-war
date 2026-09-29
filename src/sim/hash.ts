import type { World } from './world';

const float = new Float64Array(1);
const words = new Uint32Array(float.buffer);

/**
 * A fingerprint of the battle: every unit's position and health, every building's health,
 * every player's money. Multiplayer screens swap these now and then; if two ever differ,
 * the copies of the battle have drifted apart.
 */
export function stateHash(world: World): number {
  let hash = 2166136261;
  const mix = (value: number) => {
    float[0] = value;
    hash = Math.imul(hash ^ (words[0] ?? 0), 16777619);
    hash = Math.imul(hash ^ (words[1] ?? 0), 16777619);
  };
  mix(world.ticks);
  for (const unit of world.units) {
    mix(unit.id);
    mix(unit.x);
    mix(unit.z);
    mix(unit.hp);
    mix(unit.facing);
  }
  for (const structure of world.structures) {
    mix(structure.id);
    mix(structure.hp);
  }
  for (const player of world.players) {
    mix(player.credits);
    mix(player.powerOut);
  }
  return hash >>> 0;
}
