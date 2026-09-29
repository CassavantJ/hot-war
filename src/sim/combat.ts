import { DT, distanceTo, nearestPoint, type Entity, type Structure, type Unit } from './entities';
import {
  BASIC_INFANTRY,
  VERSUS,
  WEAPONS,
  type Armor,
  type ProjectileKind,
  type Warhead,
  type WeaponDef,
  type WeaponId,
} from './rules';
import type { Vec3, World } from './world';
import { dcos, dhypot, dsin } from './dmath';

export interface Projectile {
  weapon: WeaponId;
  kind: ProjectileKind;
  owner: number;
  attacker: number;
  x: number;
  y: number;
  z: number;
  px: number;
  py: number;
  pz: number;
  sx: number;
  sy: number;
  sz: number;
  tx: number;
  ty: number;
  tz: number;
  /** Entity it homes in on, or 0 for a fixed spot. */
  target: number;
  speed: number;
  progress: number;
  firepower: number;
  dead: boolean;
}

/** Veterans take less damage and shoot faster; elites also hit harder. */
const RANK_ARMOR = [1, 1.25, 1.5];
const RANK_RATE = [1, 0.85, 0.72];
const RANK_FIREPOWER = [1, 1, 1.25];
/** Kills worth this many times its own cost make a unit a veteran, then elite. */
const RANKS = [1, 3];

export type Shooter = Unit | Structure;

export function armorOf(entity: Entity): Armor {
  return entity.def.armor;
}

export function isAirborne(entity: Entity): boolean {
  return entity.entity === 'unit' && entity.flying;
}

/** Can this weapon hurt this target at all? */
export function canHit(weapon: WeaponDef, target: Entity): boolean {
  if (target.dead) return false;
  if (target.entity === 'unit') {
    if (target.inside) return false;
    // Submerged submarines can only be hit by torpedoes and depth charges.
    if (target.submerged) return weapon.underwater === true;
    if (weapon.shipsOnly && !target.def.naval) return false;
  } else if (weapon.shipsOnly) {
    return false;
  }
  if (isAirborne(target) ? weapon.air !== true : weapon.ground === false) return false;
  return VERSUS[weapon.warhead][armorOf(target)] > 0;
}

export function weaponsOf(shooter: Shooter): WeaponId[] {
  if (shooter.entity === 'structure') {
    if (shooter.garrison.length > 0) return ['garrisonGun'];
    return shooter.def.weapon ? [shooter.def.weapon] : [];
  }
  if (shooter.dugIn && shooter.def.dugInWeapon) return [shooter.def.dugInWeapon];
  return shooter.def.weapons;
}

/** The first of the shooter's weapons that can hit the target, with its slot. */
export function pickWeapon(
  shooter: Shooter,
  target: Entity,
): { slot: number; id: WeaponId } | null {
  const weapons = weaponsOf(shooter);
  for (let slot = 0; slot < weapons.length; slot++) {
    const id = weapons[slot];
    if (id && canHit(WEAPONS[id], target)) return { slot, id };
  }
  return null;
}

export function shooterX(shooter: Shooter): number {
  return shooter.entity === 'unit' ? shooter.x : shooter.cx;
}

export function shooterZ(shooter: Shooter): number {
  return shooter.entity === 'unit' ? shooter.z : shooter.cz;
}

/** Where shots come from. */
function muzzle(shooter: Shooter): Vec3 {
  if (shooter.entity === 'structure') {
    return { x: shooter.cx, y: shooter.def.height * 0.75, z: shooter.cz };
  }
  const height = shooter.def.kind === 'infantry' ? 0.22 : 0.35;
  return {
    x: shooter.x + dcos(shooter.turret) * shooter.def.radius * 0.8,
    y: shooter.alt + height,
    z: shooter.z + dsin(shooter.turret) * shooter.def.radius * 0.8,
  };
}

/** Where shots land on a target. */
export function aimPoint(target: Entity, fromX: number, fromZ: number): Vec3 {
  if (target.entity === 'unit') {
    return {
      x: target.x,
      y: target.alt + (target.def.kind === 'infantry' ? 0.15 : 0.25),
      z: target.z,
    };
  }
  const point = nearestPoint(fromX, fromZ, target);
  return { x: point.x, y: Math.min(0.8, target.def.height * 0.5), z: point.z };
}

function firepower(shooter: Shooter): number {
  if (shooter.entity === 'structure') return 1;
  return shooter.firepowerBonus * (RANK_FIREPOWER[shooter.rank] ?? 1);
}

/** Counts down weapon timers; call once per step. */
export function coolDown(shooter: Shooter): void {
  for (let slot = 0; slot < shooter.cooldowns.length; slot++) {
    shooter.cooldowns[slot] = Math.max(0, (shooter.cooldowns[slot] ?? 0) - DT);
    if ((shooter.burstLeft[slot] ?? 0) > 0) {
      shooter.burstTimer[slot] = (shooter.burstTimer[slot] ?? 0) - DT;
    }
  }
  shooter.sinceFired += DT;
}

export function readyToFire(shooter: Shooter, slot: number): boolean {
  if ((shooter.burstLeft[slot] ?? 0) > 0) return (shooter.burstTimer[slot] ?? 0) <= 0;
  return (shooter.cooldowns[slot] ?? 0) <= 0;
}

/** Stops a burst halfway (the target died or moved off). */
export function cancelBurst(shooter: Shooter): void {
  shooter.burstLeft.fill(0);
}

/**
 * Fires one shot (or the next shot of a burst) at a target entity or a spot on the ground,
 * if the weapon is ready. Returns true if it fired.
 */
export function tryFire(
  world: World,
  shooter: Shooter,
  slot: number,
  id: WeaponId,
  target: Entity | null,
  spot?: { x: number; z: number },
  bonus = 0,
): boolean {
  if (!readyToFire(shooter, slot)) return false;
  const weapon = WEAPONS[id];
  if ((shooter.burstLeft[slot] ?? 0) > 0) {
    shooter.burstLeft[slot] = (shooter.burstLeft[slot] ?? 1) - 1;
    shooter.burstTimer[slot] = weapon.burstDelay ?? 0.2;
  } else {
    const rate = shooter.entity === 'unit' ? (RANK_RATE[shooter.rank] ?? 1) : 1;
    shooter.cooldowns[slot] = weapon.cooldown * rate;
    shooter.burstLeft[slot] = (weapon.burst ?? 1) - 1;
    shooter.burstTimer[slot] = weapon.burstDelay ?? 0.2;
  }
  fire(world, shooter, id, target, spot, bonus);
  shooter.sinceFired = 0;
  return true;
}

function fire(
  world: World,
  shooter: Shooter,
  id: WeaponId,
  target: Entity | null,
  spot: { x: number; z: number } | undefined,
  bonus: number,
): void {
  const weapon = WEAPONS[id];
  const from = muzzle(shooter);
  const to: Vec3 = target
    ? aimPoint(target, shooterX(shooter), shooterZ(shooter))
    : { x: spot?.x ?? from.x, y: 0.05, z: spot?.z ?? from.z };
  const power = firepower(shooter);
  const damage = weapon.damage * power + bonus;
  world.emit({ kind: 'shot', weapon: id, from, to, owner: shooter.owner });
  switch (weapon.projectile) {
    case 'instant':
    case 'melee':
    case 'flame':
    case 'beam': {
      if (target) dealDamage(world, target, damage, weapon.warhead, shooter, shooter.owner);
      if (weapon.splash) {
        splash(world, to, weapon.splash, damage, weapon.warhead, shooter, target?.id ?? 0);
      }
      if (weapon.split && target) splitBeam(world, shooter, id, target, to, damage * 0.4);
      return;
    }
    case 'bomb': {
      world.projectiles.push(
        projectile(shooter, id, from, { x: from.x, y: 0.05, z: from.z }, 0, power),
      );
      return;
    }
    case 'artillery': {
      const shot = projectile(shooter, id, from, { ...to, y: 0.05 }, 0, power);
      world.projectiles.push(shot);
      return;
    }
    default: {
      world.projectiles.push(projectile(shooter, id, from, to, target?.id ?? 0, power));
    }
  }
}

function projectile(
  shooter: Shooter,
  id: WeaponId,
  from: Vec3,
  to: Vec3,
  target: number,
  power: number,
): Projectile {
  const weapon = WEAPONS[id];
  const low = weapon.projectile === 'torpedo';
  return {
    weapon: id,
    kind: weapon.projectile,
    owner: shooter.owner,
    attacker: shooter.id,
    x: from.x,
    y: low ? 0 : from.y,
    z: from.z,
    px: from.x,
    py: low ? 0 : from.y,
    pz: from.z,
    sx: from.x,
    sy: low ? 0 : from.y,
    sz: from.z,
    tx: to.x,
    ty: low ? 0 : to.y,
    tz: to.z,
    target,
    speed: weapon.speed ?? 12,
    progress: 0,
    firepower: power,
    dead: false,
  };
}

/** A beam tank's beam splits on impact and jumps to enemies nearby. */
function splitBeam(
  world: World,
  shooter: Shooter,
  id: WeaponId,
  target: Entity,
  at: Vec3,
  damage: number,
): void {
  const weapon = WEAPONS[id];
  const count = weapon.split ?? 0;
  const hits: Entity[] = [];
  world.forUnitsNear(at.x, at.z, 2.6, (unit) => {
    if (unit === target || hits.length >= count) return;
    if (!world.isEnemy(shooter.owner, unit.owner) || !canHit(weapon, unit)) return;
    hits.push(unit);
  });
  if (hits.length < count) {
    for (const structure of world.structures) {
      if (hits.length >= count) break;
      if (structure === target || !world.isEnemy(shooter.owner, structure.owner)) continue;
      if (distanceTo(at.x, at.z, structure) <= 2.6) hits.push(structure);
    }
  }
  for (const hit of hits) {
    world.emit({
      kind: 'shot',
      weapon: id,
      from: at,
      to: aimPoint(hit, at.x, at.z),
      owner: shooter.owner,
    });
    dealDamage(world, hit, damage, weapon.warhead, shooter, shooter.owner);
  }
}

export function tickProjectiles(world: World): void {
  if (world.projectiles.length === 0) return;
  for (const shot of world.projectiles) {
    shot.px = shot.x;
    shot.py = shot.y;
    shot.pz = shot.z;
    if (shot.target) {
      const target = world.get(shot.target);
      if (target) {
        const aim = aimPoint(target, shot.x, shot.z);
        shot.tx = aim.x;
        shot.ty = shot.kind === 'torpedo' ? 0 : aim.y;
        shot.tz = aim.z;
      } else {
        shot.target = 0;
      }
    }
    if (shot.kind === 'artillery') {
      const total = Math.max(0.5, dhypot(shot.tx - shot.sx, shot.tz - shot.sz));
      shot.progress = Math.min(1, shot.progress + (shot.speed * DT) / total);
      const t = shot.progress;
      shot.x = shot.sx + (shot.tx - shot.sx) * t;
      shot.z = shot.sz + (shot.tz - shot.sz) * t;
      shot.y = shot.sy + (shot.ty - shot.sy) * t + total * 0.3 * 4 * t * (1 - t);
      if (t >= 1) impact(world, shot);
      continue;
    }
    if (shot.kind === 'bomb') {
      shot.speed += 9 * DT;
      shot.y -= shot.speed * DT;
      if (shot.y <= shot.ty) {
        shot.y = shot.ty;
        impact(world, shot);
      }
      continue;
    }
    const dx = shot.tx - shot.x;
    const dy = shot.ty - shot.y;
    const dz = shot.tz - shot.z;
    const distance = dhypot(dx, dy, dz);
    const step = shot.speed * DT;
    if (distance <= step) {
      shot.x = shot.tx;
      shot.y = shot.ty;
      shot.z = shot.tz;
      impact(world, shot);
    } else {
      shot.x += (dx / distance) * step;
      shot.y += (dy / distance) * step;
      shot.z += (dz / distance) * step;
    }
  }
  world.projectiles = world.projectiles.filter((shot) => !shot.dead);
}

function impact(world: World, shot: Projectile): void {
  shot.dead = true;
  const weapon = WEAPONS[shot.weapon];
  const at = { x: shot.x, y: shot.y, z: shot.z };
  world.emit({ kind: 'impact', weapon: shot.weapon, at });
  const attacker = world.get(shot.attacker) ?? null;
  const damage = weapon.damage * shot.firepower;
  const target = shot.target ? world.get(shot.target) : undefined;
  if (target) dealDamage(world, target, damage, weapon.warhead, attacker, shot.owner);
  if (weapon.splash) {
    splash(world, at, weapon.splash, damage, weapon.warhead, attacker, target?.id ?? 0, shot.owner);
  }
}

/** Damages enemies around a point, falling off towards the edge. */
function splash(
  world: World,
  at: Vec3,
  radius: number,
  damage: number,
  warhead: Warhead,
  attacker: Shooter | null,
  skip: number,
  owner = attacker?.owner ?? -1,
): void {
  const inAir = at.y > 1;
  world.forUnitsNear(at.x, at.z, radius, (unit) => {
    if (unit.id === skip || !world.isEnemy(owner, unit.owner)) return;
    if (isAirborne(unit) !== inAir) return;
    const falloff = 1 - (0.75 * dhypot(unit.x - at.x, unit.z - at.z)) / radius;
    dealDamage(world, unit, damage * falloff, warhead, attacker, owner);
  });
  if (inAir) return;
  for (const structure of world.structures) {
    if (structure.id === skip || structure.dead || !world.isEnemy(owner, structure.owner)) continue;
    const distance = distanceTo(at.x, at.z, structure);
    if (distance > radius) continue;
    dealDamage(
      world,
      structure,
      damage * (1 - (0.75 * distance) / radius),
      warhead,
      attacker,
      owner,
    );
  }
}

function causeOf(warhead: Warhead): 'shot' | 'burn' | 'bite' | 'blast' {
  if (warhead === 'fire') return 'burn';
  if (warhead === 'bite') return 'bite';
  if (warhead === 'he' || warhead === 'bomb' || warhead === 'ap') return 'blast';
  return 'shot';
}

export function dealDamage(
  world: World,
  target: Entity,
  amount: number,
  warhead: Warhead,
  attacker: Shooter | null,
  owner: number,
): void {
  if (target.dead || target.shieldUntil > world.time) return;
  let multiplier = VERSUS[warhead][armorOf(target)];
  if (target.entity === 'unit') {
    multiplier /= target.armorBonus * (RANK_ARMOR[target.rank] ?? 1);
    if (target.dugIn) multiplier *= 0.6;
  }
  const damage = amount * multiplier;
  if (damage <= 0) return;
  target.hp -= damage;
  target.lastHit = world.time;
  target.lastAttacker = attacker?.id ?? 0;
  if (target.entity === 'structure') {
    if (target.owner >= 0 && target.def.role !== 'wall' && world.isEnemy(owner, target.owner)) {
      world.announce(target.owner, 'Our base is under attack.', 'bad', 'base', 20, {
        x: target.cx,
        z: target.cz,
      });
    }
    if (target.garrison.length > 0 && warhead === 'fire') burnOut(world, target, attacker);
    if (target.hp <= 0) destroyStructure(world, target, attacker);
    return;
  }
  if (target.def.harvester && world.isEnemy(owner, target.owner)) {
    world.announce(target.owner, 'Harvester under attack.', 'bad', 'harvester', 20, {
      x: target.x,
      z: target.z,
    });
  }
  if (target.hp <= 0) killUnit(world, target, attacker, causeOf(warhead));
}

/** Flames kill the infantry hiding inside a building, one at a time. */
function burnOut(world: World, structure: Structure, attacker: Shooter | null): void {
  const id = structure.garrison.shift();
  const unit = id ? world.unit(id) : undefined;
  if (unit) {
    unit.inside = 0;
    unit.x = structure.cx;
    unit.z = structure.z + structure.h + 0.3;
    killUnit(world, unit, attacker, 'burn');
  }
  if (structure.garrison.length === 0 && structure.def.role === 'civilian') structure.owner = -1;
}

export function killUnit(
  world: World,
  unit: Unit,
  killer: Shooter | null,
  how: 'shot' | 'burn' | 'crush' | 'bite' | 'blast',
): void {
  if (unit.dead) return;
  unit.dead = true;
  unit.hp = 0;
  if (unit.def.kind === 'infantry' && !unit.inside) {
    world.emit({
      kind: 'fall',
      type: unit.type,
      owner: unit.owner,
      x: unit.x,
      z: unit.z,
      facing: unit.facing,
      how: unit.def.flies ? 'blast' : how,
    });
    if (unit.def.flies) {
      world.emit({ kind: 'explode', at: { x: unit.x, y: unit.alt, z: unit.z }, size: 0.3 });
    }
  } else if (!unit.inside) {
    const size = unit.def.flies === 'airship' ? 2 : unit.def.armor === 'heavy' ? 1 : 0.7;
    world.emit({ kind: 'explode', at: { x: unit.x, y: unit.alt, z: unit.z }, size });
  }
  releaseUnit(world, unit);
  // Whoever was riding inside goes down with it.
  for (const id of unit.passengers) {
    const passenger = world.unit(id);
    if (passenger) killUnit(world, passenger, killer, 'blast');
  }
  unit.passengers = [];
  const owner = world.players[unit.owner];
  if (owner) {
    owner.stats.unitsLost++;
    world.announce(unit.owner, 'Unit lost.', 'bad', 'unit-lost', 12);
  }
  if (killer && world.isEnemy(killer.owner, unit.owner)) {
    const player = world.players[killer.owner];
    if (player) player.stats.unitsKilled++;
    if (killer.entity === 'unit') gainXp(world, killer, unit.def.cost);
  }
  if (unit.def.flies === 'airship') {
    // A falling airship still flattens what's under it.
    splash(
      world,
      { x: unit.x, y: 0, z: unit.z },
      1.8,
      300,
      'bomb',
      null,
      unit.id,
      killer?.owner ?? -1,
    );
  }
}

/** Frees whatever a unit was holding on to: its ore cell, dock, pad or building. */
export function releaseUnit(world: World, unit: Unit): void {
  if (unit.oreCell >= 0 && world.oreClaims.get(unit.oreCell) === unit.id) {
    world.oreClaims.delete(unit.oreCell);
  }
  const refinery = world.structure(unit.refinery);
  if (refinery?.dock === unit.id) refinery.dock = 0;
  const pad = world.structure(unit.pad);
  if (pad) pad.pads = pad.pads.map((id) => (id === unit.id ? 0 : id));
  const inside = world.structure(unit.inside);
  if (inside) {
    inside.garrison = inside.garrison.filter((id) => id !== unit.id);
    if (inside.garrison.length === 0 && inside.def.role === 'civilian') inside.owner = -1;
  }
  const carrier = world.unit(unit.inside);
  if (carrier) carrier.passengers = carrier.passengers.filter((id) => id !== unit.id);
}

function gainXp(world: World, unit: Unit, value: number): void {
  if (unit.def.harvester || unit.def.deploysToHq) return;
  unit.xp += value;
  const next = RANKS[unit.rank];
  if (next !== undefined && unit.xp >= unit.def.cost * next) {
    unit.rank++;
    world.emit({ kind: 'promoted', id: unit.id, rank: unit.rank });
    world.announce(unit.owner, 'Unit promoted.', 'good', 'promoted', 6);
  }
}

export function promote(world: World, unit: Unit): void {
  if (unit.rank >= 2) return;
  unit.rank++;
  unit.xp = Math.max(unit.xp, unit.def.cost * (RANKS[unit.rank - 1] ?? 1));
  world.emit({ kind: 'promoted', id: unit.id, rank: unit.rank });
}

/** Knocks a structure down, freeing anyone inside and letting a few survivors out. */
export function destroyStructure(world: World, structure: Structure, killer: Shooter | null): void {
  if (structure.dead) return;
  structure.dead = true;
  structure.hp = 0;
  world.clearStructure(structure);
  world.emit({
    kind: 'destroyed',
    id: structure.id,
    x: structure.x,
    z: structure.z,
    w: structure.w,
    h: structure.h,
  });
  evacuate(world, structure, 0.5);
  for (const unit of world.units) {
    if (unit.pad === structure.id) unit.pad = 0;
    if (unit.refinery === structure.id) unit.refinery = 0;
  }
  const owner = world.players[structure.owner];
  if (owner && structure.def.role !== 'wall') {
    owner.stats.structuresLost++;
    world.announce(structure.owner, 'Structure lost.', 'bad', 'structure-lost', 6);
    const survivors = structure.def.role === 'defense' ? 0 : world.rng.int(0, 2);
    spawnSurvivors(world, structure, survivors);
  }
  if (killer && world.isEnemy(killer.owner, structure.owner)) {
    const player = world.players[killer.owner];
    if (player && structure.def.role !== 'wall') player.stats.structuresKilled++;
    if (killer.entity === 'unit') gainXp(world, killer, structure.def.cost * 0.5);
  }
}

/** Puts infantry out of a building around its edge, hurt by `hurt` of their health. */
export function evacuate(world: World, structure: Structure, hurt: number): void {
  const inside = structure.garrison;
  structure.garrison = [];
  for (const id of inside) {
    const unit = world.unit(id);
    if (!unit) continue;
    unit.inside = 0;
    const spot = exitSpot(world, structure);
    unit.x = unit.px = spot.x;
    unit.z = unit.pz = spot.z;
    unit.hp = Math.max(1, unit.hp * (1 - hurt));
    unit.order = { kind: 'idle' };
  }
  if (structure.def.role === 'civilian') structure.owner = -1;
}

function spawnSurvivors(world: World, structure: Structure, count: number): void {
  const owner = world.players[structure.owner];
  if (!owner) return;
  for (let i = 0; i < count; i++) {
    const spot = exitSpot(world, structure);
    const unit = world.addUnit(BASIC_INFANTRY[owner.faction], owner.index, spot.x, spot.z);
    unit.hp = unit.maxHp * 0.6;
  }
}

/** A free spot just outside a structure's footprint. */
export function exitSpot(world: World, structure: Structure): { x: number; z: number } {
  const map = world.map;
  const cell = map.nearestOpen(structure.cx, structure.z + structure.h + 0.5, 0, 6);
  if (cell < 0) return { x: structure.cx, z: structure.z + structure.h + 0.5 };
  return {
    x: map.cellX(cell) + 0.3 + world.rng.next() * 0.4,
    z: map.cellZ(cell) + 0.3 + world.rng.next() * 0.4,
  };
}

/**
 * The best enemy to shoot within `radius`: things that can shoot back first, then whatever
 * our weapons hurt most, then the closest.
 */
export function findTarget(world: World, shooter: Shooter, radius: number): Entity | null {
  const weapons = weaponsOf(shooter).map((id) => WEAPONS[id]);
  if (weapons.length === 0) return null;
  const x = shooterX(shooter);
  const z = shooterZ(shooter);
  let best: Entity | null = null;
  let bestScore = Infinity;
  const consider = (target: Entity, distance: number) => {
    let verses = 0;
    for (const weapon of weapons) {
      if (!canHit(weapon, target)) continue;
      if (distance > weapon.range + (target.entity === 'unit' ? target.def.radius : 0)) continue;
      if (weapon.minRange && distance < weapon.minRange) continue;
      verses = Math.max(verses, VERSUS[weapon.warhead][armorOf(target)]);
    }
    if (verses <= 0) return;
    let score = distance;
    if (target.entity === 'unit') {
      if (target.def.weapons.length > 0) score -= 2;
    } else if (target.def.weapon || target.garrison.length > 0) {
      score -= 1;
    } else {
      score += 5;
    }
    score /= 0.3 + Math.min(verses, 1.5);
    if (score < bestScore) {
      bestScore = score;
      best = target;
    }
  };
  world.forUnitsNear(x, z, radius + 1, (unit) => {
    if (!world.isEnemy(shooter.owner, unit.owner)) return;
    consider(unit, dhypot(unit.x - x, unit.z - z));
  });
  for (const structure of world.structures) {
    if (structure.dead || structure.def.role === 'wall') continue;
    if (!world.isEnemy(shooter.owner, structure.owner)) continue;
    const distance = distanceTo(x, z, structure);
    if (distance <= radius) consider(structure, distance);
  }
  return best;
}

/** How far a weapon reaches to this target (a little extra for a unit's size). */
export function reach(weapon: WeaponDef, target: Entity): number {
  return weapon.range + (target.entity === 'unit' ? target.def.radius * 0.5 : 0);
}
