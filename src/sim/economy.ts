import { DT, type Structure, type Unit } from './entities';
import { advance, isMoving, moveTo, stopMoving } from './movement';
import type { Player } from './player';
import { dockCell } from './production';
import { GEM_VALUE, MAX_ORE, ORE_VALUE, type UnitType } from './rules';
import type { World } from './world';
import { dhypot } from './dmath';

const MINE_EVERY = 0.35;
const UNLOAD_EVERY = 0.1;
const UNLOAD_AMOUNT = 25;

export const HARVESTER: Record<Player['faction'], UnitType> = {
  accord: 'oretruck',
  bloc: 'orehauler',
};

/** The spot a harvester parks on to unload at a refinery. */
export function dockSpot(refinery: Structure): { x: number; z: number } {
  const cell = dockCell(refinery.x, refinery.z, refinery.w, refinery.h);
  return { x: cell.x + 0.5, z: cell.z + 0.5 };
}

/** A new refinery comes with a free harvester, parked at its dock. */
export function spawnHarvester(world: World, player: Player, refinery: Structure): void {
  const spot = dockSpot(refinery);
  const map = world.map;
  const cell = map.nearestOpen(spot.x, spot.z + 0.6, 0, 6);
  const x = cell >= 0 ? map.cellX(cell) + 0.5 : spot.x;
  const z = cell >= 0 ? map.cellZ(cell) + 0.5 : spot.z;
  const unit = world.addUnit(HARVESTER[player.faction], player.index, x, z);
  unit.order = { kind: 'harvest' };
  unit.refinery = refinery.id;
}

function claim(world: World, unit: Unit, cell: number): void {
  release(world, unit);
  unit.oreCell = cell;
  world.oreClaims.set(cell, unit.id);
}

function release(world: World, unit: Unit): void {
  if (unit.oreCell >= 0 && world.oreClaims.get(unit.oreCell) === unit.id) {
    world.oreClaims.delete(unit.oreCell);
  }
  unit.oreCell = -1;
}

/**
 * The nearest ore by ground distance, searching out from where it last mined (or where it
 * is). Prefers cells no other harvester is heading for.
 */
export function findOre(world: World, unit: Unit, limit = 9000): number {
  const map = world.map;
  const from = unit.lastOre >= 0 ? unit.lastOre : map.cellAt(unit.x, unit.z);
  const seen = new Uint8Array(map.width * map.height);
  const queue = [from];
  seen[from] = 1;
  let fallback = -1;
  for (let head = 0; head < queue.length && head < limit; head++) {
    const cell = queue[head] ?? 0;
    if (map.oreAt(cell) > 0) {
      const claimant = world.oreClaims.get(cell);
      if (claimant === undefined || claimant === unit.id || !world.unit(claimant)) return cell;
      if (fallback < 0) fallback = cell;
    }
    const x = map.cellX(cell);
    const z = map.cellZ(cell);
    for (const [dx, dz] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ] as const) {
      const nx = x + dx;
      const nz = z + dz;
      if (!map.inside(nx, nz)) continue;
      const next = map.index(nx, nz);
      if (seen[next] || map.isBlocked(next)) continue;
      seen[next] = 1;
      queue.push(next);
    }
  }
  return fallback;
}

function nearestRefinery(world: World, unit: Unit): Structure | null {
  let best: Structure | null = null;
  let bestScore = Infinity;
  for (const structure of world.structures) {
    if (structure.owner !== unit.owner || structure.def.role !== 'refinery' || !structure.working) {
      continue;
    }
    const spot = dockSpot(structure);
    let score = dhypot(spot.x - unit.x, spot.z - unit.z);
    if (structure.dock && structure.dock !== unit.id && world.unit(structure.dock)) score += 8;
    if (score < bestScore) {
      bestScore = score;
      best = structure;
    }
  }
  return best;
}

/** Mine ore, carry it home, unload, repeat. */
export function tickHarvester(world: World, unit: Unit): void {
  const harvester = unit.def.harvester;
  if (!harvester) return;
  const map = world.map;
  switch (unit.step) {
    case 'seek': {
      if (unit.load >= harvester.capacity) {
        unit.step = 'toRefinery';
        return;
      }
      unit.mineTimer -= DT;
      if (unit.mineTimer > 0) return;
      const cell = findOre(world, unit);
      if (cell < 0) {
        unit.mineTimer = 2;
        if (unit.load > 0) unit.step = 'toRefinery';
        return;
      }
      claim(world, unit, cell);
      moveTo(world, unit, map.cellX(cell) + 0.5, map.cellZ(cell) + 0.5);
      unit.step = 'toOre';
      return;
    }
    case 'toOre': {
      if (unit.oreCell < 0 || map.oreAt(unit.oreCell) === 0) {
        release(world, unit);
        unit.step = 'seek';
        return;
      }
      const x = map.cellX(unit.oreCell) + 0.5;
      const z = map.cellZ(unit.oreCell) + 0.5;
      const arrived = advance(world, unit);
      const distance = dhypot(unit.x - x, unit.z - z);
      if (distance < 0.5) {
        stopMoving(unit);
        unit.step = 'mining';
        unit.mineTimer = MINE_EVERY;
      } else if (arrived) {
        // Couldn't get there: look again, from here.
        release(world, unit);
        unit.lastOre = -1;
        unit.mineTimer = 0.5;
        unit.step = 'seek';
      }
      return;
    }
    case 'mining': {
      const x = map.cellX(unit.oreCell) + 0.5;
      const z = map.cellZ(unit.oreCell) + 0.5;
      if (dhypot(unit.x - x, unit.z - z) > 0.8) {
        moveTo(world, unit, x, z);
        unit.step = 'toOre';
        return;
      }
      unit.facing += 0.6 * DT;
      unit.mineTimer -= DT;
      if (unit.mineTimer > 0) return;
      unit.mineTimer = MINE_EVERY;
      const value = map.takeOre(unit.oreCell, ORE_VALUE, GEM_VALUE);
      unit.load = Math.min(harvester.capacity, unit.load + value);
      unit.lastOre = unit.oreCell;
      if (unit.load >= harvester.capacity) {
        release(world, unit);
        unit.step = 'toRefinery';
      } else if (map.oreAt(unit.oreCell) === 0) {
        release(world, unit);
        unit.mineTimer = 0;
        unit.step = 'seek';
      }
      return;
    }
    case 'toRefinery': {
      let refinery = world.structure(unit.refinery);
      if (!refinery?.working || refinery.owner !== unit.owner) {
        refinery = nearestRefinery(world, unit) ?? undefined;
        unit.refinery = refinery?.id ?? 0;
      }
      if (!refinery) {
        stopMoving(unit);
        return;
      }
      const spot = dockSpot(refinery);
      const free = !refinery.dock || refinery.dock === unit.id || !world.unit(refinery.dock);
      if (harvester.warp) {
        unit.warpTimer += DT;
        if (unit.warpTimer < 2.5) {
          stopMoving(unit);
          return;
        }
        unit.warpTimer = 0;
        const from = { x: unit.x, y: 0.3, z: unit.z };
        if (free) {
          refinery.dock = unit.id;
          unit.x = unit.px = spot.x;
          unit.z = unit.pz = spot.z;
          unit.facing = unit.pfacing = -Math.PI / 2;
          unit.step = 'unloading';
        } else {
          unit.x = unit.px = spot.x + 1.5;
          unit.z = unit.pz = spot.z + 1.5;
          unit.step = 'waiting';
        }
        stopMoving(unit);
        world.emit({ kind: 'warp', from, to: { x: unit.x, y: 0.3, z: unit.z } });
        return;
      }
      const distance = dhypot(unit.x - spot.x, unit.z - spot.z);
      if (free) {
        refinery.dock = unit.id;
        if (distance < 0.15) {
          stopMoving(unit);
          unit.x = spot.x;
          unit.z = spot.z;
          unit.step = 'unloading';
          unit.mineTimer = UNLOAD_EVERY;
          return;
        }
        if (!isMoving(unit) || dhypot(unit.destX - spot.x, unit.destZ - spot.z) > 0.1) {
          moveTo(world, unit, spot.x, spot.z);
        }
        if (advance(world, unit) && distance > 0.6) moveTo(world, unit, spot.x, spot.z);
        return;
      }
      if (distance > 2.5) {
        if (!isMoving(unit)) moveTo(world, unit, spot.x + 1, spot.z + 1.5);
        advance(world, unit);
      } else {
        stopMoving(unit);
        unit.step = 'waiting';
      }
      return;
    }
    case 'waiting': {
      const refinery = world.structure(unit.refinery);
      if (!refinery?.working) {
        unit.step = 'toRefinery';
        return;
      }
      if (!refinery.dock || !world.unit(refinery.dock)) {
        refinery.dock = unit.id;
        unit.step = 'toRefinery';
      }
      return;
    }
    case 'unloading': {
      const refinery = world.structure(unit.refinery);
      const player = world.players[unit.owner];
      if (!refinery?.working || !player) {
        unit.step = 'toRefinery';
        return;
      }
      const spot = dockSpot(refinery);
      unit.x = spot.x;
      unit.z = spot.z;
      unit.facing = -Math.PI / 2;
      unit.mineTimer -= DT;
      if (unit.mineTimer > 0) return;
      unit.mineTimer = UNLOAD_EVERY;
      const amount = Math.min(unit.load, UNLOAD_AMOUNT);
      unit.load -= amount;
      player.credits += amount * player.incomeRate;
      player.stats.harvested += amount;
      refinery.sinceFired = 0;
      if (unit.load <= 0) {
        unit.load = 0;
        refinery.dock = 0;
        unit.step = 'seek';
        unit.mineTimer = 0;
        // Pull forward off the dock so the next one can get in.
        moveTo(world, unit, spot.x, spot.z + 1.2);
      }
      return;
    }
  }
}

/** Ore slowly thickens where it lies, and drills spill fresh ore around them. */
export function tickOre(world: World): void {
  world.timers.ore += DT;
  if (world.timers.ore < 5) return;
  world.timers.ore = 0;
  const map = world.map;
  const rng = world.rng;
  for (let cell = 0; cell < map.ore.length; cell++) {
    const bales = map.oreAt(cell);
    if (bales > 0 && bales < MAX_ORE && rng.chance(0.18)) map.addOre(cell, 1);
  }
  for (const drill of map.drills) {
    const dx = rng.int(-3, 3);
    const dz = rng.int(-3, 3);
    const x = map.cellX(drill) + dx;
    const z = map.cellZ(drill) + dz;
    if ((dx !== 0 || dz !== 0) && map.inside(x, z)) map.addOre(map.index(x, z), 3);
  }
}
