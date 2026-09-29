import { evacuate, pickWeapon } from './combat';
import { IDLE, type Entity, type Structure, type Unit } from './entities';
import type { Mobility } from './map';
import { moveTo, stopMoving } from './movement';
import { mobilityOf } from './rules';
import type { World } from './world';
import { dcos, dhypot, dsin } from './dmath';

/** Cell offsets sorted by distance, for spreading a group around a target. */
const RING: [number, number][] = [];
for (let dz = -12; dz <= 12; dz++) {
  for (let dx = -12; dx <= 12; dx++) RING.push([dx, dz]);
}
RING.sort((a, b) => a[0] * a[0] + a[1] * a[1] - (b[0] * b[0] + b[1] * b[1]));

/** Where three infantry stand within one cell. */
const SQUAD_SPOTS: [number, number][] = [
  [0.3, 0.3],
  [0.72, 0.38],
  [0.45, 0.74],
];

/**
 * Spreads a group over free cells around (x, z) so they don't all fight over one spot:
 * one vehicle per cell, up to three infantry.
 */
function formation(
  world: World,
  units: Unit[],
  x: number,
  z: number,
): Map<number, { x: number; z: number }> {
  const spots = new Map<number, { x: number; z: number }>();
  if (units.length === 1) {
    const only = units[0];
    if (only) spots.set(only.id, { x, z });
    return spots;
  }
  const sorted = units.slice().sort((a, b) => dhypot(a.x - x, a.z - z) - dhypot(b.x - x, b.z - z));
  // Ships, hovercraft and land units each spread over cells they can reach.
  for (const mobility of ['ground', 'naval', 'amphibious'] as const) {
    const group = sorted.filter((unit) => !unit.def.flies && mobilityOf(unit.def) === mobility);
    if (group.length > 0) spread(world, group, x, z, mobility, spots);
  }
  const air = sorted.filter((unit) => unit.def.flies);
  const cx = Math.floor(x);
  const cz = Math.floor(z);
  let ring = 0;
  for (const unit of air) {
    let cell: [number, number] | null = null;
    while (ring < RING.length && !cell) {
      const offset = RING[ring++];
      if (offset && world.map.inside(cx + offset[0], cz + offset[1])) {
        cell = [cx + offset[0], cz + offset[1]];
      }
    }
    spots.set(unit.id, cell ? { x: cell[0] + 0.5, z: cell[1] + 0.5 } : { x, z });
  }
  return spots;
}

function spread(
  world: World,
  units: Unit[],
  x: number,
  z: number,
  mobility: Mobility,
  spots: Map<number, { x: number; z: number }>,
): void {
  const map = world.map;
  const cx = Math.floor(x);
  const cz = Math.floor(z);
  let centre = map.inside(cx, cz) ? map.index(cx, cz) : -1;
  if (centre < 0 || map.isBlocked(centre, mobility)) {
    centre = map.nearestOpen(x, z, 0, 12, mobility);
  }
  const region = centre >= 0 ? map.regionOf(centre, mobility) : 0;
  const ox = centre >= 0 ? map.cellX(centre) : cx;
  const oz = centre >= 0 ? map.cellZ(centre) : cz;
  let ring = 0;
  const nextCell = (): [number, number] | null => {
    while (ring < RING.length) {
      const offset = RING[ring++];
      if (!offset) break;
      const nx = ox + offset[0];
      const nz = oz + offset[1];
      if (!map.inside(nx, nz)) continue;
      const index = map.index(nx, nz);
      if (map.isBlocked(index, mobility)) continue;
      if (region && map.regionOf(index, mobility) !== region) continue;
      return [nx, nz];
    }
    return null;
  };
  for (const unit of units.filter((candidate) => candidate.def.kind !== 'infantry')) {
    const cell = nextCell();
    spots.set(unit.id, cell ? { x: cell[0] + 0.5, z: cell[1] + 0.5 } : { x, z });
  }
  let squad: [number, number] | null = null;
  units
    .filter((candidate) => candidate.def.kind === 'infantry')
    .forEach((unit, i) => {
      const slot = i % SQUAD_SPOTS.length;
      if (slot === 0) squad = nextCell();
      const offset = SQUAD_SPOTS[slot] ?? [0.5, 0.5];
      const cell: [number, number] | null = squad;
      spots.set(unit.id, cell ? { x: cell[0] + offset[0], z: cell[1] + offset[1] } : { x, z });
    });
}

function undig(unit: Unit): void {
  if (unit.dugIn) {
    unit.dugIn = false;
    unit.digging = 0.8;
  }
}

export function orderMove(world: World, units: Unit[], x: number, z: number, attack = false): void {
  const spots = formation(world, units, x, z);
  for (const unit of units) {
    const spot = spots.get(unit.id) ?? { x, z };
    undig(unit);
    unit.target = 0;
    unit.order = { kind: 'move', x: spot.x, z: spot.z, attack };
    if (unit.def.flies === 'jet') continue;
    moveTo(world, unit, spot.x, spot.z);
  }
}

export function orderAttack(world: World, units: Unit[], target: Entity, force = false): void {
  for (const unit of units) {
    if (unit === target || !pickWeapon(unit, target)) continue;
    if (!force && !world.isEnemy(unit.owner, target.owner) && target.owner >= 0) continue;
    // Dug-in troops stay put and shoot from where they are.
    unit.order = { kind: 'attack', target: target.id, force };
    unit.target = target.id;
    unit.repathTimer = 0;
    if (unit.def.flies !== 'jet') stopMoving(unit);
  }
}

export function orderAttackGround(units: Unit[], x: number, z: number): void {
  for (const unit of units) {
    if (unit.def.weapons.length === 0 || unit.def.flies === 'jet') continue;
    unit.order = { kind: 'attackGround', x, z };
    unit.target = 0;
    stopMoving(unit);
  }
}

export function orderStop(units: Unit[]): void {
  for (const unit of units) {
    if (unit.def.harvester && unit.order.kind === 'harvest') continue;
    unit.order = IDLE;
    unit.target = 0;
    unit.guardX = unit.x;
    unit.guardZ = unit.z;
    if (unit.def.flies !== 'jet') stopMoving(unit);
  }
}

export function orderGuard(units: Unit[]): void {
  for (const unit of units) {
    if (unit.def.weapons.length === 0 || unit.def.flies === 'jet') continue;
    unit.order = { kind: 'guard', x: unit.x, z: unit.z };
    unit.target = 0;
    stopMoving(unit);
  }
}

export function orderDeploy(units: Unit[]): void {
  for (const unit of units) {
    if (unit.def.deploysToHq || unit.def.dugInWeapon || unit.passengers.length > 0) {
      unit.order = { kind: 'deploy' };
      unit.target = 0;
      stopMoving(unit);
    }
  }
}

/** Everyone steps a cell or two away in a random direction. */
export function orderScatter(world: World, units: Unit[]): void {
  for (const unit of units) {
    if (unit.dugIn || unit.def.flies === 'jet') continue;
    const angle = world.rng.range(0, Math.PI * 2);
    const distance = world.rng.range(1.2, 2.2);
    const x = unit.x + dcos(angle) * distance;
    const z = unit.z + dsin(angle) * distance;
    unit.order = { kind: 'move', x, z, attack: false };
    moveTo(world, unit, x, z);
  }
}

export function orderEnter(units: Unit[], target: Structure | Unit): void {
  for (const unit of units) {
    if (unit === target) continue;
    undig(unit);
    unit.order = { kind: 'enter', target: target.id };
    unit.target = 0;
    stopMoving(unit);
  }
}

/** Sends harvesters to mine a particular ore cell. */
export function orderHarvest(units: Unit[], cell: number): void {
  for (const unit of units) {
    if (!unit.def.harvester) continue;
    unit.order = { kind: 'harvest' };
    unit.lastOre = cell;
    unit.step = unit.load >= unit.def.harvester.capacity ? 'toRefinery' : 'seek';
    unit.mineTimer = 0;
    stopMoving(unit);
  }
}

/** Lets everyone out of a garrisoned building. */
export function orderEvacuate(world: World, structure: Structure): void {
  if (structure.garrison.length > 0) evacuate(world, structure, 0);
}
