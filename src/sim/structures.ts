import {
  canHit,
  coolDown,
  destroyStructure,
  evacuate,
  exitSpot,
  findTarget,
  readyToFire,
  tryFire,
} from './combat';
import {
  angleDiff,
  angleTo,
  distanceTo,
  DT,
  nearestPoint,
  type Entity,
  type Structure,
} from './entities';
import { spawnHarvester } from './economy';
import { BASIC_INFANTRY, WEAPONS } from './rules';
import type { World } from './world';

/** Seconds a new structure takes to rise out of the ground. */
const BUILD_UP = 1.4;
const TURRET_TURN = 3;

export function tickStructure(world: World, structure: Structure): void {
  coolDown(structure);
  if (structure.built < 1) {
    const time = structure.def.role === 'wall' ? 0.3 : BUILD_UP;
    structure.built = Math.min(1, structure.built + DT / time);
    if (structure.built >= 1) onBuilt(world, structure);
    return;
  }
  if (structure.selling > 0) {
    structure.selling += DT / 1.2;
    if (structure.selling >= 1) finishSale(world, structure);
    return;
  }
  if (structure.charge > 0) {
    structure.charge -= DT;
    if (structure.charge <= 0) {
      structure.charge = 0;
      destroyStructure(world, structure, world.unit(structure.chargedBy) ?? null);
      return;
    }
  }
  const player = world.players[structure.owner];
  if (structure.repairing) repair(world, structure);
  if (structure.def.income && player) {
    structure.incomeTimer += DT;
    if (structure.incomeTimer >= 3) {
      structure.incomeTimer = 0;
      player.credits += structure.def.income;
      player.stats.harvested += structure.def.income;
    }
  }
  if (structure.def.walkable && player) repairPad(world, structure);
  if (structure.garrison.length > 0) garrisonFire(world, structure);
  else if (structure.def.weapon && player) defend(world, structure);
}

function onBuilt(world: World, structure: Structure): void {
  world.structuresChanged = true;
  const player = world.players[structure.owner];
  if (!player) return;
  const role = structure.def.role;
  if (role === 'refinery') spawnHarvester(world, player, structure);
  if (role === 'barracks' || role === 'factory' || role === 'radar') {
    const hasPrimary = world.structures.some(
      (other) =>
        other !== structure &&
        other.owner === structure.owner &&
        other.def.role === role &&
        other.primary,
    );
    if (!hasPrimary) structure.primary = true;
  }
}

function finishSale(world: World, structure: Structure): void {
  const player = world.players[structure.owner];
  structure.dead = true;
  world.clearStructure(structure);
  world.emit({ kind: 'removed', id: structure.id });
  evacuate(world, structure, 0);
  if (!player) return;
  const refund = Math.floor((structure.def.cost * 0.5 * structure.hp) / structure.maxHp);
  player.credits += refund;
  if (structure.def.role === 'wall' || structure.def.role === 'defense') return;
  const survivors = world.rng.int(0, Math.min(3, Math.floor(structure.def.cost / 800)));
  for (let i = 0; i < survivors; i++) {
    const spot = exitSpot(world, structure);
    world.addUnit(BASIC_INFANTRY[player.faction], player.index, spot.x, spot.z);
  }
}

/** Repairs cost half the build price for a full fix, paid as it goes. */
function repair(world: World, structure: Structure): void {
  const player = world.players[structure.owner];
  if (!player || structure.hp >= structure.maxHp) {
    structure.repairing = false;
    return;
  }
  const heal = Math.min(structure.maxHp - structure.hp, structure.maxHp * 0.04 * DT);
  const cost = (structure.def.cost * 0.5 * heal) / structure.maxHp;
  if (player.credits < cost) {
    world.announce(player.index, 'Insufficient funds.', 'bad', 'funds', 10);
    structure.repairing = false;
    return;
  }
  player.credits -= cost;
  structure.hp += heal;
  if (structure.hp >= structure.maxHp) structure.repairing = false;
}

/** Fixes one damaged vehicle parked on the pad at a time. */
function repairPad(world: World, structure: Structure): void {
  const player = world.players[structure.owner];
  if (!player) return;
  const unit = world
    .unitsNear(structure.cx, structure.cz, 1.1)
    .find(
      (other) =>
        other.owner === structure.owner &&
        other.def.kind !== 'infantry' &&
        !other.def.flies &&
        !other.moving &&
        other.hp < other.maxHp,
    );
  if (!unit) return;
  const heal = Math.min(unit.maxHp - unit.hp, unit.maxHp * 0.08 * DT);
  const cost = (unit.def.cost * 0.4 * heal) / unit.maxHp;
  if (player.credits < cost) return;
  player.credits -= cost;
  unit.hp += heal;
  structure.sinceFired = 0;
}

function defend(world: World, structure: Structure): void {
  const player = world.players[structure.owner];
  const id = structure.def.weapon;
  if (!player || !id) return;
  if (structure.def.needsPower && player.lowPower) {
    structure.target = 0;
    return;
  }
  const weapon = WEAPONS[id];
  let target = structure.target ? world.get(structure.target) : undefined;
  if (
    target &&
    (!canHit(weapon, target) ||
      !world.isEnemy(structure.owner, target.owner) ||
      distanceTo(structure.cx, structure.cz, target) > weapon.range + 0.5)
  ) {
    target = undefined;
  }
  structure.scanTimer -= DT;
  if (!target && structure.scanTimer <= 0) {
    structure.scanTimer = 0.3;
    target = findTarget(world, structure, weapon.range + 0.5) ?? undefined;
  }
  structure.target = target?.id ?? 0;
  if (!target) return;
  const point = nearestPoint(structure.cx, structure.cz, target);
  const desired = angleTo(structure.cx, structure.cz, point.x, point.z);
  let aimed = true;
  if (structure.def.turret) {
    const diff = angleDiff(structure.turret, desired);
    const step = TURRET_TURN * DT;
    structure.turret += Math.abs(diff) <= step ? diff : Math.sign(diff) * step;
    aimed = Math.abs(angleDiff(structure.turret, desired)) < 0.12;
  } else {
    structure.turret = desired;
  }
  if (!aimed) return;
  if (structure.type === 'a_beamtower') {
    fireBeamTower(world, structure, target);
    return;
  }
  tryFire(world, structure, 0, id, target);
}

/** Idle beam towers nearby relay their charge into the one that's firing. */
function fireBeamTower(world: World, tower: Structure, target: Entity): void {
  if (!readyToFire(tower, 0)) return;
  const player = world.players[tower.owner];
  let bonus = 0;
  let helpers = 0;
  for (const other of world.structures) {
    if (helpers >= 6) break;
    if (other === tower || other.type !== tower.type || other.owner !== tower.owner) continue;
    if (!other.working || other.target !== 0 || !readyToFire(other, 0) || player?.lowPower)
      continue;
    if (Math.hypot(other.cx - tower.cx, other.cz - tower.cz) > 7.5) continue;
    other.cooldowns[0] = WEAPONS.beamTower.cooldown;
    other.sinceFired = 0;
    world.emit({
      kind: 'shot',
      weapon: 'beamTower',
      from: { x: other.cx, y: other.def.height, z: other.cz },
      to: { x: tower.cx, y: tower.def.height, z: tower.cz },
      owner: tower.owner,
    });
    bonus += 70;
    helpers++;
  }
  tryFire(world, tower, 0, 'beamTower', target, undefined, bonus);
}

/** Infantry inside a building shoot out of its windows. */
function garrisonFire(world: World, structure: Structure): void {
  const weapon = WEAPONS.garrisonGun;
  let target = structure.target ? world.get(structure.target) : undefined;
  if (
    target &&
    (!canHit(weapon, target) ||
      !world.isEnemy(structure.owner, target.owner) ||
      distanceTo(structure.cx, structure.cz, target) > weapon.range + structure.w / 2)
  ) {
    target = undefined;
  }
  structure.scanTimer -= DT;
  if (!target && structure.scanTimer <= 0) {
    structure.scanTimer = 0.4;
    target = findTarget(world, structure, weapon.range + structure.w / 2) ?? undefined;
  }
  structure.target = target?.id ?? 0;
  if (!target) return;
  const point = nearestPoint(structure.cx, structure.cz, target);
  structure.turret = angleTo(structure.cx, structure.cz, point.x, point.z);
  if (tryFire(world, structure, 0, 'garrisonGun', target)) {
    structure.cooldowns[0] = weapon.cooldown / structure.garrison.length;
  }
}
