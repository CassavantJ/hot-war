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

/** Paratroopers in the air, landing at `at`. */
export interface Drop {
  x: number;
  z: number;
  owner: number;
  at: number;
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
const DROP_TIME = 2.5;
const DROP_SQUAD = 6;

/**
 * The superweapon or support power a building gives its owner: its own superweapon, or a
 * country's power (America's Air Command drops paratroopers).
 */
export function powerOf(world: World, structure: Structure): SuperweaponId | undefined {
  if (structure.def.superweapon) return structure.def.superweapon;
  if (structure.def.id === 'a_aircommand' && world.players[structure.owner]?.nation === 'america') {
    return 'airdrop';
  }
  return undefined;
}

export function isReady(world: World, structure: Structure): boolean {
  return powerOf(world, structure) !== undefined && structure.superCharge >= 1 && structure.working;
}

/** Charges a superweapon while it has power, and warns everyone when it's ready. */
export function chargeSuperweapon(world: World, structure: Structure): void {
  const id = powerOf(world, structure);
  const player = world.players[structure.owner];
  if (!id || !player || structure.superCharge >= 1 || player.lowPower) return;
  structure.superCharge = Math.min(1, structure.superCharge + DT / SUPERWEAPONS[id].charge);
  if (structure.superCharge < 1) return;
  world.announce(player.index, `${SUPERWEAPONS[id].name} ready.`, 'good');
  if (SUPERWEAPONS[id].support) return;
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
  const id = powerOf(world, structure);
  if (!id || !isReady(world, structure)) return false;
  const owner = structure.owner;
  const def = SUPERWEAPONS[id];
  switch (id) {
    case 'airdrop':
      if (!airdrop(world, owner, target)) return false;
      break;
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
  if (def.support) {
    world.announce(owner, 'Paratroopers on the way.', 'good');
    return true;
  }
  for (const player of world.players) {
    world.announce(
      player.index,
      player.index === owner ? `${def.name} activated.` : `Warning: enemy ${def.name} activated.`,
      player.index === owner ? 'good' : 'bad',
    );
  }
  return true;
}

/** A transport flies over and drops a squad; they land a moment later. */
function airdrop(world: World, owner: number, target: { x: number; z: number }): boolean {
  const map = world.map;
  const player = world.players[owner];
  const cell = map.cellAt(target.x, target.z);
  if (!player || cell < 0 || map.isWater(cell)) return false;
  // People can only drop where they've scouted; computer players don't keep a shroud.
  if (!player.ai && !player.shroud[cell]) return false;
  world.drops.push({ x: target.x, z: target.z, owner, at: world.time + DROP_TIME });
  // The plane comes in from the nearest map edge.
  const edges = [
    { x: -4, z: target.z, d: target.x },
    { x: map.width + 4, z: target.z, d: map.width - target.x },
    { x: target.x, z: -4, d: target.z },
    { x: target.x, z: map.height + 4, d: map.height - target.z },
  ].sort((a, b) => a.d - b.d);
  const edge = edges[0] ?? { x: -4, z: target.z };
  world.emit({
    kind: 'airdrop',
    from: { x: edge.x, z: edge.z },
    to: { x: target.x, z: target.z },
    time: DROP_TIME,
  });
  return true;
}

function land(world: World, drop: Drop): void {
  const map = world.map;
  const taken = new Set<number>();
  for (let i = 0; i < DROP_SQUAD; i++) {
    const angle = (i / DROP_SQUAD) * Math.PI * 2;
    const x = drop.x + dcos(angle) * 0.8;
    const z = drop.z + dsin(angle) * 0.8;
    let cell = map.nearestOpen(x, z, 0, 4, 'ground');
    if (cell >= 0 && taken.has(cell)) cell = map.nearestOpen(x + 1, z, 0, 5, 'ground');
    if (cell < 0) continue;
    taken.add(cell);
    const unit = world.addUnit(
      'rifleman',
      drop.owner,
      map.cellX(cell) + 0.5,
      map.cellZ(cell) + 0.5,
    );
    unit.guardX = unit.x;
    unit.guardZ = unit.z;
  }
  world.emit({ kind: 'sound', sound: 'deploy', x: drop.x, z: drop.z });
  world.announce(drop.owner, 'Paratroopers have landed.', 'good', undefined, 8, {
    x: drop.x,
    z: drop.z,
  });
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

/** Storms throw bolts; missiles and paratroopers land. */
export function tickSuperweapons(world: World): void {
  if (world.drops.length > 0) {
    for (const drop of world.drops) {
      if (world.time < drop.at) continue;
      land(world, drop);
      drop.at = Infinity;
    }
    world.drops = world.drops.filter((drop) => drop.at !== Infinity);
  }
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
      structure.owner === owner && !structure.dead && powerOf(world, structure) !== undefined,
  );
}

export function superweaponName(id: SuperweaponId): string {
  return SUPERWEAPONS[id].name;
}
