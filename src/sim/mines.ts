import { dealDamage } from './combat';
import { dhypot } from './dmath';
import type { Unit } from './entities';
import type { World } from './world';

/** Libya's hidden anti-tank mines: laid by Minelayers, set off by any enemy on the ground. */
export interface Mine {
  x: number;
  z: number;
  owner: number;
}

const DAMAGE = 450;
const TRIGGER = 0.55;
const BLAST = 0.9;
const SPACING = 0.9;
const PER_PLAYER = 40;

/** Drops a mine in the middle of the cell the unit is on. Returns false if it can't. */
export function layMine(world: World, unit: Unit): boolean {
  const map = world.map;
  const cell = map.cellAt(unit.x, unit.z);
  const x = Math.floor(unit.x) + 0.5;
  const z = Math.floor(unit.z) + 0.5;
  if (cell < 0 || map.isWater(cell)) return false;
  if (world.mines.filter((mine) => mine.owner === unit.owner).length >= PER_PLAYER) {
    world.announce(unit.owner, 'No more mines can be laid.', 'bad', 'mines', 6);
    return false;
  }
  if (
    world.mines.some((mine) => Math.abs(mine.x - x) < SPACING && Math.abs(mine.z - z) < SPACING)
  ) {
    return false;
  }
  world.mines.push({ x, z, owner: unit.owner });
  world.emit({ kind: 'sound', sound: 'deploy', x, z });
  return true;
}

function steppedOn(world: World, mine: Mine): boolean {
  let hit = false;
  world.forUnitsNear(mine.x, mine.z, TRIGGER, (unit) => {
    if (hit || unit.dead || unit.flying || unit.def.flies || unit.def.naval || unit.inside) return;
    if (world.isEnemy(mine.owner, unit.owner)) hit = true;
  });
  return hit;
}

export function tickMines(world: World): void {
  if (world.mines.length === 0) return;
  let spent = false;
  for (const mine of world.mines) {
    if (!steppedOn(world, mine)) continue;
    world.forUnitsNear(mine.x, mine.z, BLAST, (unit) => {
      if (unit.flying || unit.def.flies || unit.def.naval) return;
      const falloff = 1 - (0.6 * dhypot(unit.x - mine.x, unit.z - mine.z)) / BLAST;
      dealDamage(world, unit, DAMAGE * falloff, 'ap', null, mine.owner);
    });
    world.emit({ kind: 'explode', at: { x: mine.x, y: 0.1, z: mine.z }, size: 0.9 });
    mine.owner = -2;
    spent = true;
  }
  if (spent) world.mines = world.mines.filter((mine) => mine.owner !== -2);
}
