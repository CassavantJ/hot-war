import { dealDamage } from './combat';
import { distanceTo, DT, type Structure } from './entities';
import { mobilityOf, SUPERWEAPONS, type SuperweaponId } from './rules';
import type { World } from './world';
import { dcos, dhypot, dsin } from './dmath';

export interface Storm {
  x: number;
  z: number;
  owner: number;
  /** Seconds of storm left, and until the next bolt. */
  left: number;
  next: number;
}

export interface Strike {
  x: number;
  z: number;
  owner: number;
  /** When the missile lands. */
  at: number;
}

const STORM_TIME = 12;
const BOLT_DAMAGE = 140;
const MISSILE_FLIGHT = 5;
const MISSILE_DAMAGE = 1400;
const SHIELD_TIME = 20;

export function isReady(structure: Structure): boolean {
  return structure.def.superweapon !== undefined && structure.superCharge >= 1 && structure.working;
}

/** Charges a superweapon while it has power, and warns everyone when it's ready. */
export function chargeSuperweapon(world: World, structure: Structure): void {
  const id = structure.def.superweapon;
  const player = world.players[structure.owner];
  if (!id || !player || structure.superCharge >= 1 || player.lowPower) return;
  structure.superCharge = Math.min(1, structure.superCharge + DT / SUPERWEAPONS[id].charge);
  if (structure.superCharge < 1) return;
  world.announce(player.index, `${SUPERWEAPONS[id].name} ready.`, 'good');
  for (const other of world.players) {
    if (world.isEnemy(other.index, player.index)) {
      world.announce(
        other.index,
        `Warning: enemy ${SUPERWEAPONS[id].name} ready.`,
        'bad',
        `ready-${id}`,
        30,
      );
    }
  }
}

/** Hits everything (friend or foe) around a point, falling off towards the edge. */
function blast(
  world: World,
  x: number,
  z: number,
  radius: number,
  damage: number,
  warhead: 'shock' | 'bomb',
  owner: number,
  air: boolean,
): void {
  world.forUnitsNear(x, z, radius, (unit) => {
    if (unit.flying && !air) return;
    const falloff = 1 - (0.7 * dhypot(unit.x - x, unit.z - z)) / radius;
    dealDamage(world, unit, damage * falloff, warhead, null, owner);
  });
  for (const structure of world.structures) {
    if (structure.dead) continue;
    const distance = distanceTo(x, z, structure);
    if (distance > radius) continue;
    dealDamage(world, structure, damage * (1 - (0.7 * distance) / radius), warhead, null, owner);
  }
}

/**
 * Fires a charged superweapon at a spot. The Phase Gate needs two: where to jump from,
 * and where to jump to. Returns false (and nothing happens) if it can't fire there.
 */
export function fireSuperweapon(
  world: World,
  structure: Structure,
  target: { x: number; z: number },
  destination?: { x: number; z: number },
): boolean {
  const id = structure.def.superweapon;
  if (!id || !isReady(structure)) return false;
  const owner = structure.owner;
  const def = SUPERWEAPONS[id];
  switch (id) {
    case 'storm':
      world.storms.push({ x: target.x, z: target.z, owner, left: STORM_TIME, next: 1.5 });
      world.emit({ kind: 'storm', x: target.x, z: target.z, radius: def.radius, time: STORM_TIME });
      break;
    case 'missile':
      world.strikes.push({ x: target.x, z: target.z, owner, at: world.time + MISSILE_FLIGHT });
      world.emit({
        kind: 'launch',
        from: { x: structure.cx, z: structure.cz },
        to: target,
        time: MISSILE_FLIGHT,
      });
      break;
    case 'shield':
      shield(world, owner, target.x, target.z, def.radius);
      break;
    case 'phase':
      if (!destination || !phase(world, owner, target, destination, def.radius)) return false;
      break;
  }
  structure.superCharge = 0;
  for (const player of world.players) {
    world.announce(
      player.index,
      player.index === owner ? `${def.name} activated.` : `Warning: enemy ${def.name} activated.`,
      player.index === owner ? 'good' : 'bad',
    );
  }
  return true;
}

function shield(world: World, owner: number, x: number, z: number, radius: number): void {
  const until = world.time + SHIELD_TIME;
  world.forUnitsNear(x, z, radius, (unit) => {
    if (unit.owner === owner) unit.shieldUntil = until;
  });
  for (const structure of world.structures) {
    if (structure.owner === owner && distanceTo(x, z, structure) <= radius)
      structure.shieldUntil = until;
  }
  world.emit({ kind: 'shield', x, z, radius });
}

/** Units near `from` jump to the same spots around `to`. */
function phase(
  world: World,
  owner: number,
  from: { x: number; z: number },
  to: { x: number; z: number },
  radius: number,
): boolean {
  const map = world.map;
  const movers = world
    .unitsNear(from.x, from.z, radius)
    .filter((unit) => unit.owner === owner && !unit.def.flies && !unit.def.naval);
  if (movers.length === 0) return false;
  const taken = new Set<number>();
  let moved = 0;
  for (const unit of movers) {
    const mobility = mobilityOf(unit.def);
    const x = to.x + (unit.x - from.x);
    const z = to.z + (unit.z - from.z);
    let cell = map.nearestOpen(x, z, 0, 4, mobility);
    if (cell >= 0 && taken.has(cell) && unit.def.kind !== 'infantry') {
      cell = map.nearestOpen(x + 1, z + 1, 0, 5, mobility);
    }
    if (cell < 0) continue;
    if (unit.def.kind !== 'infantry') taken.add(cell);
    const start = { x: unit.x, y: 0.3, z: unit.z };
    unit.x = unit.px = map.cellX(cell) + 0.5;
    unit.z = unit.pz = map.cellZ(cell) + 0.5;
    unit.waypoints = [];
    unit.pathPending = false;
    unit.order = { kind: 'idle' };
    unit.guardX = unit.x;
    unit.guardZ = unit.z;
    world.emit({ kind: 'warp', from: start, to: { x: unit.x, y: 0.3, z: unit.z } });
    moved++;
  }
  return moved > 0;
}

/** Storms throw bolts; missiles land. */
export function tickSuperweapons(world: World): void {
  if (world.storms.length > 0) {
    for (const storm of world.storms) {
      storm.left -= DT;
      storm.next -= DT;
      if (storm.next > 0 || storm.left <= 0) continue;
      storm.next = 0.22 + world.rng.next() * 0.25;
      const angle = world.rng.range(0, Math.PI * 2);
      const distance = Math.sqrt(world.rng.next()) * SUPERWEAPONS.storm.radius;
      const x = storm.x + dcos(angle) * distance;
      const z = storm.z + dsin(angle) * distance;
      world.emit({ kind: 'bolt', x, z });
      blast(world, x, z, 1.2, BOLT_DAMAGE, 'shock', storm.owner, true);
    }
    world.storms = world.storms.filter((storm) => storm.left > 0);
  }
  if (world.strikes.length > 0) {
    for (const strike of world.strikes) {
      if (world.time < strike.at) continue;
      world.emit({ kind: 'explode', at: { x: strike.x, y: 0.2, z: strike.z }, size: 4 });
      blast(
        world,
        strike.x,
        strike.z,
        SUPERWEAPONS.missile.radius,
        MISSILE_DAMAGE,
        'bomb',
        strike.owner,
        true,
      );
      strike.at = Infinity;
    }
    world.strikes = world.strikes.filter((strike) => strike.at !== Infinity);
  }
}

/** Superweapons a player owns, with their charge. */
export function superweaponsOf(world: World, owner: number): Structure[] {
  return world.structures.filter(
    (structure) =>
      structure.owner === owner && structure.def.superweapon !== undefined && !structure.dead,
  );
}

export function superweaponName(id: SuperweaponId): string {
  return SUPERWEAPONS[id].name;
}
