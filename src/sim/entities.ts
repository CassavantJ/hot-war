import type { Point } from './path';
import {
  STRUCTURES,
  UNITS,
  type StructureDef,
  type StructureType,
  type UnitDef,
  type UnitType,
} from './rules';

/** One simulation step, in seconds. */
export const DT = 0.05;

export type Order =
  | { kind: 'idle' }
  /** `attack`: fight anything met on the way (attack-move). */
  | { kind: 'move'; x: number; z: number; attack: boolean }
  | { kind: 'attack'; target: number; force: boolean }
  | { kind: 'attackGround'; x: number; z: number }
  | { kind: 'guard'; x: number; z: number }
  | { kind: 'harvest' }
  | { kind: 'enter'; target: number }
  | { kind: 'deploy' };

export const IDLE: Order = { kind: 'idle' };

export type HarvestStep = 'seek' | 'toOre' | 'mining' | 'toRefinery' | 'waiting' | 'unloading';

export type FlightStep = 'landed' | 'flying' | 'landing';

export class Unit {
  readonly entity = 'unit';
  readonly id: number;
  readonly type: UnitType;
  readonly def: UnitDef;
  owner: number;
  x: number;
  z: number;
  alt = 0;
  /** Where it was last step, for smooth drawing between steps. */
  px: number;
  pz: number;
  palt = 0;
  facing: number;
  pfacing: number;
  turret: number;
  pturret: number;
  hp: number;
  order: Order = IDLE;
  /** Where the current path leads, and the points along it. */
  waypoints: Point[] = [];
  destX: number;
  destZ: number;
  pathPending = false;
  /** Who it's shooting at (0 for nobody), and whether it picked them itself. */
  target = 0;
  autoTarget = false;
  cooldowns = [0, 0];
  burstLeft = [0, 0];
  burstTimer = [0, 0];
  /** Credits' worth of kills; enough makes it a veteran, then elite. */
  xp = 0;
  rank = 0;
  dugIn = false;
  /** Seconds left digging in or out. */
  digging = 0;
  /** The structure it's inside (garrisoned or docked), or 0. */
  inside = 0;
  // Harvesting.
  load = 0;
  step: HarvestStep = 'seek';
  oreCell = -1;
  lastOre = -1;
  refinery = 0;
  mineTimer = 0;
  warpTimer = 0;
  // Aircraft.
  ammo: number;
  pad = 0;
  flight: FlightStep = 'flying';
  reload = 0;
  // Book-keeping.
  scanTimer = 0;
  /** Seconds spent with nothing to do. */
  idleTime = 0;
  repathTimer = 0;
  stuckTimer = 0;
  stuckCount = 0;
  progressX: number;
  progressZ: number;
  moving = false;
  /** Seconds since it last fired (for recoil and muzzle flashes). */
  sinceFired = 99;
  lastHit = -99;
  lastAttacker = 0;
  guardX: number;
  guardZ: number;
  speedBonus = 1;
  armorBonus = 1;
  firepowerBonus = 1;
  /** Units carried inside (for transports). */
  passengers: number[] = [];
  /** Hidden underwater (submarines, until they fire). */
  submerged = false;
  /** Invulnerable until this time (a Bulwark Field). */
  shieldUntil = -1;
  dead = false;

  constructor(id: number, type: UnitType, owner: number, x: number, z: number, facing = 0) {
    this.id = id;
    this.type = type;
    this.def = UNITS[type];
    this.owner = owner;
    this.x = this.px = this.destX = this.progressX = this.guardX = x;
    this.z = this.pz = this.destZ = this.progressZ = this.guardZ = z;
    this.facing = this.pfacing = this.turret = this.pturret = facing;
    this.hp = this.def.hp;
    this.ammo = this.def.ammo ?? 0;
  }

  get flying(): boolean {
    return this.def.flies !== undefined && (this.def.flies !== 'jet' || this.flight !== 'landed');
  }

  get maxHp(): number {
    return this.def.hp;
  }
}

export class Structure {
  readonly entity = 'structure';
  readonly id: number;
  readonly type: StructureType;
  readonly def: StructureDef;
  owner: number;
  /** Top-left cell of the footprint. */
  readonly x: number;
  readonly z: number;
  readonly w: number;
  readonly h: number;
  hp: number;
  /** 0 → 1 while it rises out of the ground; it works once this reaches 1. */
  built = 0;
  /** 0, or 0 → 1 while it's being sold. */
  selling = 0;
  repairing = false;
  primary = false;
  rally: Point | null = null;
  cooldowns = [0, 0];
  burstLeft = [0, 0];
  burstTimer = [0, 0];
  target = 0;
  scanTimer = 0;
  turret = 0;
  pturret = 0;
  sinceFired = 99;
  /** Infantry inside, by id. */
  garrison: number[] = [];
  /** The harvester using the dock, or 0. */
  dock = 0;
  /** Jets parked on each pad (0 = free). */
  pads: number[];
  /** Seconds until planted charges go off, or 0. */
  charge = 0;
  chargedBy = 0;
  incomeTimer = 0;
  lastHit = -99;
  lastAttacker = 0;
  /** Superweapons: 0 → 1 while charging. */
  superCharge = 0;
  shieldUntil = -1;
  dead = false;

  constructor(id: number, type: StructureType, owner: number, x: number, z: number) {
    this.id = id;
    this.type = type;
    this.def = STRUCTURES[type];
    this.owner = owner;
    this.x = x;
    this.z = z;
    [this.w, this.h] = this.def.size;
    this.hp = this.def.hp;
    this.pads = Array.from({ length: this.def.pads ?? 0 }, () => 0);
  }

  get cx(): number {
    return this.x + this.w / 2;
  }

  get cz(): number {
    return this.z + this.h / 2;
  }

  get maxHp(): number {
    return this.def.hp;
  }

  get working(): boolean {
    return this.built >= 1 && this.selling === 0;
  }
}

export type Entity = Unit | Structure;

/** Distance from a point to an entity's edge (a unit's centre, or a structure's footprint). */
export function distanceTo(x: number, z: number, entity: Entity): number {
  if (entity.entity === 'unit') return Math.hypot(entity.x - x, entity.z - z);
  const dx = Math.max(entity.x - x, 0, x - (entity.x + entity.w));
  const dz = Math.max(entity.z - z, 0, z - (entity.z + entity.h));
  return Math.hypot(dx, dz);
}

/** The point of an entity closest to (x, z). */
export function nearestPoint(x: number, z: number, entity: Entity): { x: number; z: number } {
  if (entity.entity === 'unit') return { x: entity.x, z: entity.z };
  return {
    x: Math.min(Math.max(x, entity.x + 0.3), entity.x + entity.w - 0.3),
    z: Math.min(Math.max(z, entity.z + 0.3), entity.z + entity.h - 0.3),
  };
}

export function angleTo(fromX: number, fromZ: number, toX: number, toZ: number): number {
  return Math.atan2(toZ - fromZ, toX - fromX);
}

/** The signed difference between two angles, in (-π, π]. */
export function angleDiff(a: number, b: number): number {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d <= -Math.PI) d += Math.PI * 2;
  return d;
}

/** Turns `from` towards `to` by at most `step`. */
export function turnTowards(from: number, to: number, step: number): number {
  const d = angleDiff(from, to);
  if (Math.abs(d) <= step) return to;
  return from + Math.sign(d) * step;
}
