import { killUnit } from './combat';
import { angleDiff, DT, turnTowards, type Unit } from './entities';
import { GROUND } from './map';
import { lineClear, smoothPath, type Point } from './path';
import { mobilityOf } from './rules';
import type { World } from './world';
import { datan2, dcos, dhypot, dsin } from './dmath';

/** How many paths are worked out per step; the rest wait their turn. */
const PATHS_PER_STEP = 12;

/** Veterans and elites move a little quicker. */
const RANK_SPEED = [1, 1.1, 1.2];

/** Sends a unit towards (x, z). Paths are found a few per step, so it may pause briefly. */
export function moveTo(world: World, unit: Unit, x: number, z: number): void {
  const map = world.map;
  const tx = Math.min(map.width - 0.5, Math.max(0.5, x));
  const tz = Math.min(map.height - 0.5, Math.max(0.5, z));
  unit.destX = tx;
  unit.destZ = tz;
  unit.stuckTimer = 0;
  unit.stuckCount = 0;
  unit.progressX = unit.x;
  unit.progressZ = unit.z;
  if (unit.def.flies) {
    unit.waypoints = [{ x: tx, z: tz }];
    unit.pathPending = false;
    return;
  }
  const goal = map.cellAt(tx, tz);
  const mobility = mobilityOf(unit.def);
  if (
    !map.isBlocked(goal, mobility) &&
    dhypot(tx - unit.x, tz - unit.z) < 10 &&
    lineClear(map, unit.x, unit.z, tx, tz, mobility)
  ) {
    unit.waypoints = [{ x: tx, z: tz }];
    unit.pathPending = false;
    return;
  }
  unit.waypoints = [];
  if (!unit.pathPending) {
    unit.pathPending = true;
    world.pathQueue.push(unit.id);
  }
}

export function stopMoving(unit: Unit): void {
  unit.waypoints = [];
  unit.pathPending = false;
  unit.moving = false;
}

export function isMoving(unit: Unit): boolean {
  return unit.pathPending || unit.waypoints.length > 0;
}

export function processPaths(world: World): void {
  let budget = PATHS_PER_STEP;
  while (budget > 0 && world.pathQueue.length > 0) {
    const unit = world.unit(world.pathQueue.shift() ?? 0);
    if (!unit?.pathPending) continue;
    unit.pathPending = false;
    unit.waypoints = planPath(world, unit, unit.destX, unit.destZ);
    budget--;
  }
}

function planPath(world: World, unit: Unit, x: number, z: number): Point[] {
  const map = world.map;
  const mobility = mobilityOf(unit.def);
  let start = map.cellAt(unit.x, unit.z);
  if (map.isBlocked(start, mobility)) {
    start = map.nearestOpen(unit.x, unit.z, 0, 4, mobility);
    if (start < 0) return [];
  }
  const region = map.regionOf(start, mobility);
  let goal = map.cellAt(x, z);
  let end: Point = { x, z };
  if (map.isBlocked(goal, mobility) || map.regionOf(goal, mobility) !== region) {
    goal = map.nearestOpen(x, z, region, 48, mobility);
    if (goal < 0) return [];
    end = { x: map.cellX(goal) + 0.5, z: map.cellZ(goal) + 0.5 };
  }
  const cells = world.pathfinder.find(start, goal, mobility);
  if (!cells) return [];
  const points = smoothPath(map, unit.x, unit.z, cells, mobility);
  if (points.length === 0) return [end];
  points[points.length - 1] = end;
  return points;
}

function terrainSpeed(world: World, unit: Unit): number {
  if (unit.def.flies) return 1;
  const ground = world.map.groundAt(world.map.cellAt(unit.x, unit.z));
  if (ground === GROUND.road || ground === GROUND.pavement)
    return unit.def.kind === 'vehicle' ? 1.15 : 1;
  if (ground === GROUND.rough) return 0.85;
  return 1;
}

export function unitSpeed(world: World, unit: Unit): number {
  return (
    unit.def.speed * unit.speedBonus * (RANK_SPEED[unit.rank] ?? 1) * terrainSpeed(world, unit)
  );
}

/**
 * Moves a unit one step along its path. Returns true when it has arrived (or has nowhere
 * to go).
 */
export function advance(world: World, unit: Unit): boolean {
  if (unit.pathPending) {
    unit.moving = false;
    return false;
  }
  const point = unit.waypoints[0];
  if (!point) {
    unit.moving = false;
    return true;
  }
  const def = unit.def;
  const dx = point.x - unit.x;
  const dz = point.z - unit.z;
  const distance = dhypot(dx, dz);
  const last = unit.waypoints.length === 1;
  if (distance < (last ? 0.05 : 0.25)) {
    unit.waypoints.shift();
    if (unit.waypoints.length === 0) {
      unit.moving = false;
      return true;
    }
    return false;
  }
  const desired = datan2(dz, dx);
  let pace = 1;
  if (def.kind === 'infantry' || def.flies === 'jumpjet') {
    unit.facing = desired;
  } else {
    const diff = Math.abs(angleDiff(unit.facing, desired));
    unit.facing = turnTowards(unit.facing, desired, def.turn * DT);
    if (def.flies !== 'airship') {
      if (diff > 0.9) {
        unit.moving = false;
        return false;
      }
      pace = Math.max(0.35, dcos(diff));
    }
  }
  const step = Math.min(distance, unitSpeed(world, unit) * pace * DT);
  const nx = unit.x + (dx / distance) * step;
  const nz = unit.z + (dz / distance) * step;
  const map = world.map;
  const mobility = mobilityOf(def);
  const here = map.passable(Math.floor(unit.x), Math.floor(unit.z), mobility);
  if (!def.flies && here && !map.passable(Math.floor(nx), Math.floor(nz), mobility)) {
    // Something was built in the way: find a new route.
    moveTo(world, unit, unit.destX, unit.destZ);
    unit.moving = false;
    return false;
  }
  unit.x = nx;
  unit.z = nz;
  unit.moving = true;
  checkStuck(world, unit);
  return false;
}

/** Re-routes a unit that has stopped making progress, and gives up if it's close enough. */
function checkStuck(world: World, unit: Unit): void {
  unit.stuckTimer += DT;
  if (unit.stuckTimer < 1.5) return;
  unit.stuckTimer = 0;
  const progress = dhypot(unit.x - unit.progressX, unit.z - unit.progressZ);
  unit.progressX = unit.x;
  unit.progressZ = unit.z;
  if (progress > unit.def.speed * 0.4) {
    unit.stuckCount = 0;
    return;
  }
  unit.stuckCount++;
  const left = dhypot(unit.destX - unit.x, unit.destZ - unit.z);
  if ((unit.stuckCount >= 2 && left < 2.5) || unit.stuckCount >= 6) {
    stopMoving(unit);
    return;
  }
  const count = unit.stuckCount;
  moveTo(world, unit, unit.destX, unit.destZ);
  unit.stuckCount = count;
}

/** Flying units drift towards their target height. */
export function fly(unit: Unit, target: number): void {
  const step = 1.6 * DT;
  if (Math.abs(unit.alt - target) <= step) unit.alt = target;
  else unit.alt += Math.sign(target - unit.alt) * step;
}

function settled(unit: Unit): boolean {
  return unit.step === 'unloading' || unit.digging > 0 || unit.dugIn;
}

/**
 * Units that overlap push each other apart: idle units make way for moving ones, and
 * infantry for vehicles. Tanks run over enemy infantry.
 */
export function resolveCollisions(world: World): void {
  const map = world.map;
  for (const unit of world.units) {
    if (unit.dead || unit.inside || unit.def.flies === 'jet') continue;
    const air = unit.def.flies !== undefined;
    world.forUnitsNear(unit.x, unit.z, unit.def.radius + 0.6, (other) => {
      if (other.id <= unit.id || other.dead || unit.dead || other.def.flies === 'jet') return;
      if ((other.def.flies !== undefined) !== air) return;
      let dx = other.x - unit.x;
      let dz = other.z - unit.z;
      let distance = dhypot(dx, dz);
      const reach = unit.def.radius + other.def.radius;
      if (distance >= reach) return;
      if (!air && crush(world, unit, other, distance)) return;
      if (distance < 1e-4) {
        const angle = ((unit.id * 97 + other.id * 31) % 628) / 100;
        dx = dcos(angle);
        dz = dsin(angle);
        distance = 1;
      }
      const overlap = reach - distance;
      let share = 0.5;
      const unitHeavy = unit.def.kind !== 'infantry';
      const otherHeavy = other.def.kind !== 'infantry';
      if (settled(unit) && !settled(other)) share = 0;
      else if (settled(other) && !settled(unit)) share = 1;
      else if (unitHeavy && !otherHeavy) share = 0.05;
      else if (otherHeavy && !unitHeavy) share = 0.95;
      else if (unit.moving && !other.moving) share = 0.15;
      else if (other.moving && !unit.moving) share = 0.85;
      // Infantry squeeze in closer than vehicles.
      const soft = !unitHeavy && !otherHeavy ? 0.35 : 0.6;
      const push = overlap * soft;
      const ux = unit.x - (dx / distance) * push * share;
      const uz = unit.z - (dz / distance) * push * share;
      const ox = other.x + (dx / distance) * push * (1 - share);
      const oz = other.z + (dz / distance) * push * (1 - share);
      if (air || map.passable(Math.floor(ux), Math.floor(uz), mobilityOf(unit.def))) {
        unit.x = Math.min(map.width - 0.2, Math.max(0.2, ux));
        unit.z = Math.min(map.height - 0.2, Math.max(0.2, uz));
      }
      if (air || map.passable(Math.floor(ox), Math.floor(oz), mobilityOf(other.def))) {
        other.x = Math.min(map.width - 0.2, Math.max(0.2, ox));
        other.z = Math.min(map.height - 0.2, Math.max(0.2, oz));
      }
    });
  }
}

/** A moving tank over enemy infantry squashes them. Returns true if someone was crushed. */
function crush(world: World, a: Unit, b: Unit, distance: number): boolean {
  const pairs: [Unit, Unit][] = [
    [a, b],
    [b, a],
  ];
  for (const [tank, soldier] of pairs) {
    if (
      tank.def.crusher &&
      tank.moving &&
      soldier.def.crushable &&
      soldier.def.kind === 'infantry' &&
      !soldier.def.flies &&
      world.isEnemy(tank.owner, soldier.owner) &&
      distance < tank.def.radius * 0.85
    ) {
      killUnit(world, soldier, tank, 'crush');
      return true;
    }
  }
  return false;
}
