import {
  cancelBurst,
  canHit,
  coolDown,
  findTarget,
  pickWeapon,
  reach,
  releaseUnit,
  tryFire,
} from './combat';
import { tickHarvester } from './economy';
import {
  angleDiff,
  angleTo,
  distanceTo,
  DT,
  IDLE,
  nearestPoint,
  turnTowards,
  type Entity,
  type Structure,
  type Unit,
} from './entities';
import { advance, fly, isMoving, moveTo, stopMoving } from './movement';
import { placementCheck } from './production';
import { HQ, WEAPONS, type WeaponDef } from './rules';
import type { World } from './world';

const TURRET_TURN = 5;
const SCAN_EVERY = 0.4;
/** How far a guarding unit will chase before going back. */
const GUARD_LEASH = 7;

export function tickUnit(world: World, unit: Unit): void {
  coolDown(unit);
  if (unit.inside) return;
  heal(unit);
  // Submarines dive again a little while after firing.
  unit.submerged = unit.def.submarine === true && unit.sinceFired > 2.5;
  carry(world, unit);
  if (unit.digging > 0) {
    unit.digging = Math.max(0, unit.digging - DT);
    return;
  }
  if (unit.def.flies === 'jet') {
    tickJet(world, unit);
    return;
  }
  if (unit.def.flies) fly(unit, unit.def.altitude ?? 2);
  const order = unit.order;
  if (order.kind !== 'idle') unit.idleTime = 0;
  switch (order.kind) {
    case 'idle':
      advance(world, unit);
      if (!autoEngage(world, unit, 0)) relaxTurret(unit);
      // Harvesters left standing about go back to work after a moment.
      if (unit.def.harvester) {
        unit.idleTime += DT;
        if (unit.idleTime > 4) {
          unit.order = { kind: 'harvest' };
          unit.step = unit.load >= unit.def.harvester.capacity ? 'toRefinery' : 'seek';
          unit.lastOre = -1;
        }
      }
      break;
    case 'move':
      tickMove(world, unit, order.x, order.z, order.attack);
      break;
    case 'attack': {
      const target = world.get(order.target);
      if (!target || !validTarget(world, unit, target, order.force)) {
        finish(unit);
        break;
      }
      unit.target = target.id;
      unit.autoTarget = false;
      attack(world, unit, target, true);
      break;
    }
    case 'attackGround':
      attackSpot(world, unit, order.x, order.z);
      break;
    case 'guard':
      tickGuard(world, unit, order.x, order.z);
      break;
    case 'harvest':
      tickHarvester(world, unit);
      if (unit.def.weapons.length > 0 && !autoEngage(world, unit, 0, false)) relaxTurret(unit);
      break;
    case 'enter':
      tickEnter(world, unit, order.target);
      break;
    case 'deploy':
      deploy(world, unit);
      break;
  }
  if (!unit.def.turret) unit.turret = unit.facing;
}

function heal(unit: Unit): void {
  const rate = (unit.def.selfHeal ?? 0) + (unit.rank === 2 ? unit.maxHp * 0.01 : 0);
  if (rate > 0 && unit.hp < unit.maxHp) unit.hp = Math.min(unit.maxHp, unit.hp + rate * DT);
}

function finish(unit: Unit): void {
  unit.order = IDLE;
  unit.target = 0;
  unit.guardX = unit.x;
  unit.guardZ = unit.z;
  cancelBurst(unit);
}

function relaxTurret(unit: Unit): void {
  unit.target = 0;
  if (unit.def.turret) unit.turret = turnTowards(unit.turret, unit.facing, TURRET_TURN * 0.5 * DT);
}

function validTarget(world: World, unit: Unit, target: Entity, force: boolean): boolean {
  if (target.dead) return false;
  if (target.entity === 'unit' && target.inside) return false;
  if (!force && !world.isEnemy(unit.owner, target.owner)) return false;
  return pickWeapon(unit, target) !== null;
}

/** How far a unit looks for things to shoot on its own. */
function acquireRadius(unit: Unit): number {
  if (unit.def.flies === 'airship') return 1.2;
  let radius = 0;
  for (const id of unit.dugIn && unit.def.dugInWeapon ? [unit.def.dugInWeapon] : unit.def.weapons) {
    const weapon = WEAPONS[id];
    radius = Math.max(radius, Math.min(weapon.range, unit.def.sight + 1));
  }
  if (unit.def.dog) radius = unit.def.sight;
  return radius;
}

/**
 * Shoots at enemies that come near, if it has a gun. `chase` is how far past its weapon's
 * reach it will go after them. Returns true while it's busy fighting.
 */
function autoEngage(world: World, unit: Unit, chase: number, mayMove = true): boolean {
  if (unit.def.weapons.length === 0) return false;
  unit.scanTimer -= DT;
  let target = unit.target ? world.get(unit.target) : undefined;
  if (target && !validTarget(world, unit, target, false)) target = undefined;
  const radius = acquireRadius(unit) + chase + (unit.def.dog ? chase : 0);
  if (target && distanceTo(unit.x, unit.z, target) > radius + 1) target = undefined;
  if (!target && unit.scanTimer <= 0) {
    unit.scanTimer = SCAN_EVERY + ((unit.id * 7) % 5) * 0.03;
    target = findTarget(world, unit, radius) ?? undefined;
    if (!target && world.time - unit.lastHit < 3) {
      // Shoot back at whoever is hurting us.
      const attacker = world.get(unit.lastAttacker);
      if (
        attacker &&
        validTarget(world, unit, attacker, false) &&
        distanceTo(unit.x, unit.z, attacker) < unit.def.sight + 3
      ) {
        target = attacker;
      }
    }
  }
  if (!target) {
    unit.target = 0;
    return false;
  }
  unit.target = target.id;
  unit.autoTarget = true;
  const canChase = mayMove && !unit.dugIn && (chase > 0 || unit.def.dog === true);
  attack(world, unit, target, canChase);
  return true;
}

/** Closes to weapon range if allowed, then aims and fires. */
function attack(world: World, unit: Unit, target: Entity, mayMove: boolean): void {
  const pick = pickWeapon(unit, target);
  if (!pick) {
    unit.target = 0;
    return;
  }
  const weapon = WEAPONS[pick.id];
  const distance = distanceTo(unit.x, unit.z, target);
  const point = nearestPoint(unit.x, unit.z, target);
  if (distance > reach(weapon, target)) {
    cancelBurst(unit);
    aim(unit, point.x, point.z, false);
    if (!mayMove || unit.dugIn) return;
    unit.repathTimer -= DT;
    const drift = Math.hypot(unit.destX - point.x, unit.destZ - point.z);
    if (!isMoving(unit) || (unit.repathTimer <= 0 && drift > 1.5)) {
      unit.repathTimer = 1;
      moveTo(world, unit, point.x, point.z);
    }
    advance(world, unit);
    return;
  }
  if (weapon.minRange && distance < weapon.minRange) return;
  stopMoving(unit);
  shoot(world, unit, pick.slot, pick.id, weapon, target, point.x, point.z);
}

function aim(unit: Unit, x: number, z: number, body: boolean): boolean {
  const desired = angleTo(unit.x, unit.z, x, z);
  const def = unit.def;
  if (def.turret) {
    unit.turret = turnTowards(unit.turret, desired, TURRET_TURN * DT);
    return Math.abs(angleDiff(unit.turret, desired)) < 0.12;
  }
  if (def.kind === 'infantry' || def.flies) {
    if (body || def.kind === 'infantry') unit.facing = desired;
    return true;
  }
  if (!body) return false;
  unit.facing = turnTowards(unit.facing, desired, def.turn * DT);
  return Math.abs(angleDiff(unit.facing, desired)) < 0.12;
}

function shoot(
  world: World,
  unit: Unit,
  slot: number,
  id: keyof typeof WEAPONS,
  weapon: WeaponDef,
  target: Entity | null,
  x: number,
  z: number,
): void {
  const aimed = weapon.projectile === 'bomb' ? true : aim(unit, x, z, true);
  if (aimed) tryFire(world, unit, slot, id, target, target ? undefined : { x, z });
}

function tickMove(world: World, unit: Unit, x: number, z: number, attackMove: boolean): void {
  if (attackMove) {
    if (autoEngage(world, unit, 1)) return;
    if (!isMoving(unit) && Math.hypot(unit.x - x, unit.z - z) > 0.6) moveTo(world, unit, x, z);
  } else if (unit.def.turret && unit.def.weapons.length > 0) {
    // Turrets shoot on the move without stopping.
    opportunisticFire(world, unit);
  }
  if (advance(world, unit)) finish(unit);
}

function opportunisticFire(world: World, unit: Unit): void {
  unit.scanTimer -= DT;
  let target = unit.target ? world.get(unit.target) : undefined;
  if (target && !validTarget(world, unit, target, false)) target = undefined;
  if (!target && unit.scanTimer <= 0) {
    unit.scanTimer = SCAN_EVERY;
    target = findTarget(world, unit, acquireRadius(unit)) ?? undefined;
  }
  if (!target) {
    relaxTurret(unit);
    return;
  }
  unit.target = target.id;
  const pick = pickWeapon(unit, target);
  if (!pick) return;
  const weapon = WEAPONS[pick.id];
  const point = nearestPoint(unit.x, unit.z, target);
  if (distanceTo(unit.x, unit.z, target) > reach(weapon, target)) {
    unit.target = 0;
    return;
  }
  const desired = angleTo(unit.x, unit.z, point.x, point.z);
  unit.turret = turnTowards(unit.turret, desired, TURRET_TURN * DT);
  if (Math.abs(angleDiff(unit.turret, desired)) < 0.12) {
    tryFire(world, unit, pick.slot, pick.id, target);
  }
}

function attackSpot(world: World, unit: Unit, x: number, z: number): void {
  const slot = unit.def.weapons.findIndex((id) => WEAPONS[id].ground !== false);
  const id = unit.dugIn && unit.def.dugInWeapon ? unit.def.dugInWeapon : unit.def.weapons[slot];
  if (slot < 0 || !id) {
    finish(unit);
    return;
  }
  const weapon = WEAPONS[id];
  const distance = Math.hypot(x - unit.x, z - unit.z);
  if (distance > weapon.range) {
    if (unit.dugIn) {
      finish(unit);
      return;
    }
    if (!isMoving(unit)) moveTo(world, unit, x, z);
    advance(world, unit);
    return;
  }
  stopMoving(unit);
  shoot(world, unit, slot, id, weapon, null, x, z);
}

function tickGuard(world: World, unit: Unit, x: number, z: number): void {
  const fighting = autoEngage(world, unit, GUARD_LEASH - 2);
  if (fighting) {
    if (Math.hypot(unit.x - x, unit.z - z) > GUARD_LEASH) {
      unit.target = 0;
      moveTo(world, unit, x, z);
    }
    return;
  }
  if (Math.hypot(unit.x - x, unit.z - z) > 0.8) {
    if (!isMoving(unit)) moveTo(world, unit, x, z);
    advance(world, unit);
  }
}

/** Passengers ride along with their transport. */
function carry(world: World, unit: Unit): void {
  for (const id of unit.passengers) {
    const passenger = world.unit(id);
    if (!passenger) continue;
    passenger.x = passenger.px = unit.x;
    passenger.z = passenger.pz = unit.z;
  }
}

/** Slots a unit takes up in a transport, or Infinity if it can't ride in this one. */
export function seatCost(transport: Unit, rider: Unit): number {
  const room = transport.def.transport;
  if (!room || rider === transport || rider.owner !== transport.owner) return Infinity;
  if (rider.def.flies || rider.def.naval || rider.def.amphibious || rider.def.transport)
    return Infinity;
  if (rider.def.kind === 'infantry') return 1;
  if (rider.def.kind === 'vehicle' && room.vehicles && !rider.def.deploysToHq) return 4;
  return Infinity;
}

export function seatsFree(world: World, transport: Unit): number {
  const room = transport.def.transport?.slots ?? 0;
  let used = 0;
  for (const id of transport.passengers) {
    const rider = world.unit(id);
    if (rider) used += rider.def.kind === 'infantry' ? 1 : 4;
  }
  return room - used;
}

function board(world: World, unit: Unit, transport: Unit): void {
  const cost = seatCost(transport, unit);
  if (cost > seatsFree(world, transport)) {
    finish(unit);
    return;
  }
  const reach = transport.def.radius + unit.def.radius + 0.45;
  if (Math.hypot(unit.x - transport.x, unit.z - transport.z) > reach) {
    unit.repathTimer -= DT;
    if (!isMoving(unit) || unit.repathTimer <= 0) {
      unit.repathTimer = 0.8;
      moveTo(world, unit, transport.x, transport.z);
    }
    advance(world, unit);
    return;
  }
  stopMoving(unit);
  transport.passengers.push(unit.id);
  unit.inside = transport.id;
  unit.target = 0;
  unit.dugIn = false;
  unit.order = IDLE;
  world.emit({ kind: 'sound', sound: 'deploy', x: unit.x, z: unit.z });
}

/** Lets everyone out onto dry land around a transport. Returns false if there's nowhere. */
export function unload(world: World, transport: Unit): boolean {
  const map = world.map;
  const riders = transport.passengers
    .map((id) => world.unit(id))
    .filter((rider) => rider !== undefined);
  if (riders.length === 0) return false;
  const taken = new Set<number>();
  let placed = 0;
  for (const rider of riders) {
    let cell = -1;
    for (let radius = 1; radius <= 3 && cell < 0; radius++) {
      for (let dz = -radius; dz <= radius && cell < 0; dz++) {
        for (let dx = -radius; dx <= radius; dx++) {
          const x = Math.floor(transport.x) + dx;
          const z = Math.floor(transport.z) + dz;
          if (!map.passable(x, z)) continue;
          const index = map.index(x, z);
          if (taken.has(index) && rider.def.kind !== 'infantry') continue;
          cell = index;
          break;
        }
      }
    }
    if (cell < 0) break;
    if (rider.def.kind !== 'infantry') taken.add(cell);
    rider.inside = 0;
    rider.x = rider.px = map.cellX(cell) + 0.3 + world.rng.next() * 0.4;
    rider.z = rider.pz = map.cellZ(cell) + 0.3 + world.rng.next() * 0.4;
    rider.order = IDLE;
    rider.guardX = rider.x;
    rider.guardZ = rider.z;
    transport.passengers = transport.passengers.filter((id) => id !== rider.id);
    placed++;
  }
  if (placed === 0) {
    world.announce(transport.owner, 'Can’t unload here.', 'bad', 'unload', 2);
    return false;
  }
  world.emit({ kind: 'sound', sound: 'deploy', x: transport.x, z: transport.z });
  return true;
}

function tickEnter(world: World, unit: Unit, id: number): void {
  const carrier = world.unit(id);
  if (carrier) {
    board(world, unit, carrier);
    return;
  }
  const structure = world.structure(id);
  if (!structure) {
    finish(unit);
    return;
  }
  if (structure.def.walkable) {
    // Drive onto the repair pad and wait there.
    if (Math.hypot(unit.x - structure.cx, unit.z - structure.cz) > 0.5) {
      if (!isMoving(unit)) moveTo(world, unit, structure.cx, structure.cz);
      if (advance(world, unit) && Math.hypot(unit.x - structure.cx, unit.z - structure.cz) > 1.2) {
        finish(unit);
      }
      return;
    }
    stopMoving(unit);
    if (unit.hp >= unit.maxHp) finish(unit);
    return;
  }
  const distance = distanceTo(unit.x, unit.z, structure);
  if (distance > 0.75) {
    if (!isMoving(unit)) moveTo(world, unit, structure.cx, structure.cz);
    if (advance(world, unit) && distanceTo(unit.x, unit.z, structure) > 1.5) finish(unit);
    return;
  }
  stopMoving(unit);
  interact(world, unit, structure);
}

/** What a unit does when it reaches a building it was sent into. */
function interact(world: World, unit: Unit, structure: Structure): void {
  const def = unit.def;
  const friendly = world.isAlly(unit.owner, structure.owner) || structure.owner === unit.owner;
  if (def.engineer) {
    if (friendly) {
      if (structure.hp < structure.maxHp) {
        structure.hp = structure.maxHp;
        world.announce(unit.owner, 'Structure repaired.', 'good');
        consume(world, unit);
        world.emit({ kind: 'sound', sound: 'capture', x: structure.cx, z: structure.cz });
        return;
      }
    } else if (structure.def.capturable) {
      const previous = structure.owner;
      structure.owner = unit.owner;
      structure.repairing = false;
      structure.primary = false;
      structure.rally = null;
      structure.target = 0;
      world.structuresChanged = true;
      world.announce(unit.owner, 'Building captured.', 'good');
      if (previous >= 0) world.announce(previous, 'Our building has been captured.', 'bad');
      world.emit({ kind: 'sound', sound: 'capture', x: structure.cx, z: structure.cz });
      consume(world, unit);
      return;
    }
    finish(unit);
    return;
  }
  if (def.commando && structure.owner !== unit.owner && !friendly && structure.charge === 0) {
    structure.charge = 3;
    structure.chargedBy = unit.id;
    world.emit({ kind: 'sound', sound: 'deploy', x: structure.cx, z: structure.cz });
    finish(unit);
    return;
  }
  const capacity = structure.def.garrison ?? 0;
  if (
    def.canGarrison &&
    capacity > 0 &&
    (structure.owner < 0 || structure.owner === unit.owner) &&
    structure.garrison.length < capacity
  ) {
    structure.owner = unit.owner;
    structure.garrison.push(unit.id);
    unit.inside = structure.id;
    unit.target = 0;
    unit.dugIn = false;
    unit.order = IDLE;
    world.emit({ kind: 'sound', sound: 'deploy', x: structure.cx, z: structure.cz });
    return;
  }
  if (def.harvester && structure.def.role === 'refinery' && structure.owner === unit.owner) {
    unit.refinery = structure.id;
    unit.step = unit.load > 0 ? 'toRefinery' : 'seek';
    unit.order = { kind: 'harvest' };
    return;
  }
  finish(unit);
}

/** The unit is used up (an engineer walking into a building). */
function consume(world: World, unit: Unit): void {
  unit.dead = true;
  releaseUnit(world, unit);
}

function deploy(world: World, unit: Unit): void {
  const def = unit.def;
  stopMoving(unit);
  if (def.transport) {
    unload(world, unit);
    finish(unit);
    return;
  }
  if (def.deploysToHq) {
    const player = world.players[unit.owner];
    if (!player) return;
    const type = HQ[player.faction];
    const cx = Math.round(unit.x - 2);
    const cz = Math.round(unit.z - 2);
    const check = placementCheck(world, player, type, cx, cz, {
      ignoreReach: true,
      ignore: unit.id,
    });
    if (!check.ok) {
      world.announce(unit.owner, 'Can’t deploy here.', 'bad', 'deploy', 2);
      finish(unit);
      return;
    }
    unit.dead = true;
    releaseUnit(world, unit);
    const hq = world.addStructure(type, unit.owner, cx, cz);
    hq.hp = hq.maxHp * (unit.hp / unit.maxHp);
    world.emit({ kind: 'placed', id: hq.id });
    world.emit({ kind: 'sound', sound: 'deploy', x: unit.x, z: unit.z });
    return;
  }
  if (def.dugInWeapon) {
    unit.dugIn = !unit.dugIn;
    unit.digging = 0.8;
    unit.target = 0;
    world.emit({ kind: 'sound', sound: 'deploy', x: unit.x, z: unit.z });
  }
  finish(unit);
}

/** Where a jet sits on each of an air command's pads. */
export function padSpot(structure: Structure, slot: number): { x: number; z: number; y: number } {
  const col = slot % 2;
  const row = Math.floor(slot / 2);
  return {
    x: structure.x + 0.75 + col * 1.5,
    z: structure.z + 0.75 + row * 1.5,
    y: structure.def.height + 0.05,
  };
}

/** Finds (and claims) a free pad for a jet, or returns null. */
export function claimPad(world: World, unit: Unit): Structure | null {
  const current = world.structure(unit.pad);
  if (current?.pads.includes(unit.id)) return current;
  for (const structure of world.structures) {
    if (structure.owner !== unit.owner || structure.dead || !structure.working) continue;
    const slot = structure.pads.indexOf(0);
    if (slot < 0) continue;
    structure.pads[slot] = unit.id;
    unit.pad = structure.id;
    return structure;
  }
  return null;
}

/**
 * Jets always fly forward. They take off to strike, fire their missiles, and fly home to
 * their pad to land and rearm.
 */
function tickJet(world: World, unit: Unit): void {
  const def = unit.def;
  const order = unit.order;
  const pad = claimPad(world, unit);
  const slot = pad ? pad.pads.indexOf(unit.id) : -1;
  const spot = pad ? padSpot(pad, slot) : null;
  if (unit.flight === 'landed') {
    if (!pad || !spot) {
      unit.flight = 'flying';
      return;
    }
    unit.x = spot.x;
    unit.z = spot.z;
    unit.alt = spot.y;
    if (unit.ammo < (def.ammo ?? 0)) {
      unit.reload += DT;
      if (unit.reload >= 3) {
        unit.reload = 0;
        unit.ammo++;
      }
    }
    if ((order.kind === 'attack' && unit.ammo > 0) || order.kind === 'move') {
      unit.flight = 'flying';
    } else if (order.kind !== 'idle') {
      unit.order = IDLE;
    }
    return;
  }
  let goalX = unit.x + Math.cos(unit.facing) * 2;
  let goalZ = unit.z + Math.sin(unit.facing) * 2;
  let landing = false;
  if (order.kind === 'attack' && unit.ammo > 0) {
    const target = world.get(order.target);
    if (!target || !validTarget(world, unit, target, order.force)) {
      unit.order = IDLE;
    } else {
      const point = nearestPoint(unit.x, unit.z, target);
      goalX = point.x;
      goalZ = point.z;
      const weapon = WEAPONS.falconMissiles;
      const distance = distanceTo(unit.x, unit.z, target);
      const facing = Math.abs(angleDiff(unit.facing, angleTo(unit.x, unit.z, goalX, goalZ)));
      unit.turret = unit.facing;
      if (distance <= weapon.range && facing < 0.5 && canHit(weapon, target)) {
        if (tryFire(world, unit, 0, 'falconMissiles', target)) {
          unit.ammo--;
          if (unit.ammo <= 0) unit.order = IDLE;
        }
      }
    }
  } else if (order.kind === 'move') {
    goalX = order.x;
    goalZ = order.z;
    if (unit.ammo <= 0) unit.order = IDLE;
  } else if (order.kind !== 'idle') {
    unit.order = IDLE;
  }
  if (unit.order.kind === 'idle' && spot) {
    goalX = spot.x;
    goalZ = spot.z;
    landing = true;
  }
  const distance = Math.hypot(goalX - unit.x, goalZ - unit.z);
  if (landing && distance < 0.35) {
    unit.x = goalX;
    unit.z = goalZ;
    fly(unit, spot?.y ?? 0);
    if (spot && unit.alt <= spot.y + 0.01) {
      unit.flight = 'landed';
      unit.reload = 0;
    }
    return;
  }
  fly(unit, def.altitude ?? 2.5);
  const desired = angleTo(unit.x, unit.z, goalX, goalZ);
  const turn = def.turn * (landing && distance < 3 ? 2.5 : 1);
  unit.facing = turnTowards(unit.facing, desired, turn * DT);
  const slow = landing ? Math.max(0.25, Math.min(1, distance / 3)) : 1;
  const step = def.speed * slow * DT;
  unit.x = Math.min(world.map.width - 0.5, Math.max(0.5, unit.x + Math.cos(unit.facing) * step));
  unit.z = Math.min(world.map.height - 0.5, Math.max(0.5, unit.z + Math.sin(unit.facing) * step));
  unit.moving = true;
}
