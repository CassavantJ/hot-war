import type { Player } from './player';
import type { World } from './world';

/** Marks everything within `radius` of (x, z) as seen by `player`. */
export function revealAround(world: World, player: Player, x: number, z: number, radius: number) {
  if (player.ai) return;
  const map = world.map;
  const r = Math.ceil(radius);
  const cx = Math.floor(x);
  const cz = Math.floor(z);
  const r2 = (radius + 0.5) * (radius + 0.5);
  let changed = false;
  for (let dz = -r; dz <= r; dz++) {
    const nz = cz + dz;
    if (nz < 0 || nz >= map.height) continue;
    for (let dx = -r; dx <= r; dx++) {
      const nx = cx + dx;
      if (nx < 0 || nx >= map.width || dx * dx + dz * dz > r2) continue;
      const index = nz * map.width + nx;
      if (player.shroud[index] === 0) {
        player.shroud[index] = 1;
        changed = true;
      }
    }
  }
  if (changed) player.shroudVersion++;
}

export function revealAll(player: Player): void {
  player.shroud.fill(1);
  player.shroudVersion++;
}

/** Lets each human player see around everything they own. */
export function updateShroud(world: World): void {
  for (const player of world.players) {
    if (player.ai || player.defeated) continue;
    for (const unit of world.units) {
      if (unit.owner === player.index && !unit.inside) {
        revealAround(world, player, unit.x, unit.z, unit.def.sight);
      }
    }
    for (const structure of world.structures) {
      if (structure.owner === player.index) {
        revealAround(world, player, structure.cx, structure.cz, structure.def.sight + 1);
      }
    }
  }
}

export function seen(player: Player, index: number): boolean {
  return player.shroud[index] !== 0;
}
