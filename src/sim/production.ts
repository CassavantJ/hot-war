import { exitSpot } from './combat';
import { DT, type Structure } from './entities';
import { claimPad, padSpot } from './units';
import { moveTo } from './movement';
import type { Player, QueueKind } from './player';
import {
  BUILD_RATE,
  BUILD_REACH,
  STRUCTURES,
  structureAvailableTo,
  UNITS,
  unitAvailableTo,
  type Producer,
  type Role,
  type StructureDef,
  type StructureType,
  type UnitDef,
  type UnitType,
} from './rules';
import type { World } from './world';

export function isUnitType(type: string): type is UnitType {
  return type in UNITS;
}

export function isStructureType(type: string): type is StructureType {
  return type in STRUCTURES;
}

export function costOf(type: UnitType | StructureType): number {
  return isUnitType(type) ? UNITS[type].cost : STRUCTURES[type].cost;
}

export function nameOf(type: UnitType | StructureType): string {
  return isUnitType(type) ? UNITS[type].name : STRUCTURES[type].name;
}

export function queueFor(type: UnitType | StructureType): QueueKind {
  if (isUnitType(type)) {
    const def = UNITS[type];
    if (def.from === 'radar') return 'aircraft';
    if (def.from === 'naval') return 'naval';
    return def.kind === 'infantry' ? 'infantry' : 'vehicle';
  }
  return STRUCTURES[type].tab === 'defense' ? 'defense' : 'building';
}

const PRODUCER_ROLE: Record<Producer, Role> = {
  barracks: 'barracks',
  factory: 'factory',
  radar: 'radar',
  naval: 'naval',
};

/** Works out each player's power, roles and radar from their working structures. */
export function recomputePower(world: World): void {
  for (const player of world.players) {
    const wasLow = player.powerUse > player.powerOut;
    let out = 0;
    let use = 0;
    const roles = new Map<Role, number>();
    for (const structure of world.structures) {
      if (structure.owner !== player.index || structure.dead || !structure.working) continue;
      const power = structure.def.power;
      if (power > 0) out += power;
      else use -= power;
      roles.set(structure.def.role, (roles.get(structure.def.role) ?? 0) + 1);
    }
    player.powerOut = out;
    player.powerUse = use;
    player.roles = roles;
    player.radar = (roles.get('radar') ?? 0) > 0 && !player.lowPower;
    if (!wasLow && use > out && world.time > 1) {
      world.announce(player.index, 'Low power.', 'bad', 'power', 6);
    }
  }
}

function prereqsMet(player: Player, prereqs: Role[]): boolean {
  return prereqs.every((role) => player.has(role));
}

function queuedCount(player: Player, type: UnitType | StructureType): number {
  return player.queues[queueFor(type)].items.filter((item) => item.type === type).length;
}

/** Can this player build this right now (tech, faction and limits)? */
export function available(world: World, player: Player, type: UnitType | StructureType): boolean {
  const tech = world.mission?.def.tech;
  if (tech && player.index === world.local && !tech.includes(type)) return false;
  if (isUnitType(type)) {
    const def = UNITS[type];
    if (!unitAvailableTo(def, player.faction) || !prereqsMet(player, def.prereqs)) return false;
    if (def.unique) {
      const alive = world.units.some((unit) => unit.owner === player.index && unit.type === type);
      if (alive || queuedCount(player, type) > 0) return false;
    }
    if (def.from === 'radar') {
      let pads = 0;
      for (const structure of world.structures) {
        if (structure.owner === player.index && structure.working) pads += structure.pads.length;
      }
      const jets = world.units.filter(
        (unit) => unit.owner === player.index && unit.def.from === 'radar',
      ).length;
      if (jets + queuedCount(player, type) >= pads) return false;
    }
    return true;
  }
  const def = STRUCTURES[type];
  if (def.superweapon && world.settings.superweapons === false) return false;
  return structureAvailableTo(def, player.faction) && prereqsMet(player, def.prereqs);
}

/** Everything a player's faction could ever build, in sidebar order. */
export function buildList(player: Player): (UnitType | StructureType)[] {
  const structures = Object.values(STRUCTURES)
    .filter((def) => structureAvailableTo(def, player.faction))
    .map((def) => def.id);
  const units = Object.values(UNITS)
    .filter((def) => unitAvailableTo(def, player.faction))
    .map((def) => def.id);
  return [...structures, ...units];
}

/** Seconds to build something: more producers and full power make it quicker. */
export function buildTime(_world: World, player: Player, type: UnitType | StructureType): number {
  let producers = 1;
  if (isUnitType(type)) producers = player.count(PRODUCER_ROLE[UNITS[type].from]);
  else producers = player.count('hq');
  const speedup = Math.min(2.5, 1 / 0.8 ** Math.max(0, producers - 1));
  const rate = BUILD_RATE * speedup * player.powerFactor;
  return Math.max(1, costOf(type) / rate) / player.buildRate;
}

/** Starts building (or queues up more of) something. Returns false if it can't. */
export function startBuild(
  world: World,
  player: Player,
  type: UnitType | StructureType,
  count = 1,
): boolean {
  const queue = player.queues[queueFor(type)];
  const held = queue.items.find((item) => item.type === type && item.onHold);
  if (held) {
    held.onHold = false;
    return true;
  }
  if (!available(world, player, type)) return false;
  if (isStructureType(type)) {
    if (queue.items.length > 0 || queue.ready) return false;
    queue.items.push({ type, progress: 0, paid: 0, onHold: false });
    return true;
  }
  const room = Math.max(0, 30 - queue.items.length);
  const def = UNITS[type];
  const allowed = def.unique ? Math.min(1, room) : Math.min(count, room);
  for (let i = 0; i < allowed; i++) queue.items.push({ type, progress: 0, paid: 0, onHold: false });
  return allowed > 0;
}

/**
 * Right-clicking a build button: drops one queued copy; for the one being built, puts it
 * on hold, then cancels it (refunding what was spent).
 */
export function cancelBuild(world: World, player: Player, type: UnitType | StructureType): void {
  const queue = player.queues[queueFor(type)];
  if (queue.ready === type) {
    queue.ready = null;
    player.credits += costOf(type);
    world.announce(player.index, 'Cancelled.');
    return;
  }
  const indexes = queue.items
    .map((item, index) => (item.type === type ? index : -1))
    .filter((index) => index >= 0);
  const last = indexes.at(-1);
  if (last === undefined) return;
  const item = queue.items[last];
  if (!item) return;
  if (last > 0 || indexes.length > 1) {
    player.credits += item.paid;
    queue.items.splice(last, 1);
    return;
  }
  if (!item.onHold) {
    item.onHold = true;
    world.announce(player.index, 'On hold.');
    return;
  }
  player.credits += item.paid;
  queue.items.splice(last, 1);
  world.announce(player.index, 'Cancelled.');
}

export function tickProduction(world: World, player: Player): void {
  for (const kind of ['building', 'defense', 'infantry', 'vehicle', 'aircraft', 'naval'] as const) {
    const queue = player.queues[kind];
    const item = queue.items[0];
    if (!item || item.onHold || queue.ready) continue;
    const type = item.type;
    const unit = isUnitType(type);
    if (unit ? !producerFor(world, player, UNITS[type]) : !player.has('hq')) continue;
    if (!unit && !available(world, player, type)) continue;
    if (unit && !prereqsMet(player, UNITS[type].prereqs)) continue;
    const cost = costOf(type);
    const step = DT / buildTime(world, player, type);
    const price = Math.min(cost - item.paid, cost * step);
    if (price > 0) {
      if (player.credits < price) {
        world.announce(player.index, 'Insufficient funds.', 'bad', 'funds', 12);
        continue;
      }
      player.credits -= price;
      item.paid += price;
    }
    item.progress = Math.min(1, item.progress + step);
    if (item.progress < 1) continue;
    queue.items.shift();
    if (unit) {
      spawnUnit(world, player, type);
      world.announce(player.index, 'Unit ready.', 'good', 'unit-ready', 2);
    } else {
      queue.ready = type;
      world.announce(player.index, 'Construction complete.', 'good');
    }
  }
}

/** The structure that makes this kind of unit: the primary one if several. */
export function producerFor(world: World, player: Player, def: UnitDef): Structure | null {
  const role = PRODUCER_ROLE[def.from];
  let found: Structure | null = null;
  for (const structure of world.structures) {
    if (structure.owner !== player.index || structure.def.role !== role || !structure.working) {
      continue;
    }
    if (def.from === 'radar' && !structure.pads.includes(0)) continue;
    if (structure.primary) return structure;
    found ??= structure;
  }
  return found;
}

export function spawnUnit(world: World, player: Player, type: UnitType) {
  const def = UNITS[type];
  const producer = producerFor(world, player, def);
  if (!producer) return null;
  player.stats.unitsBuilt++;
  if (def.flies === 'jet') {
    const jet = world.addUnit(type, player.index, producer.cx, producer.cz);
    jet.flight = 'landed';
    const pad = claimPad(world, jet);
    if (pad) {
      const spot = padSpot(pad, pad.pads.indexOf(jet.id));
      jet.x = jet.px = spot.x;
      jet.z = jet.pz = spot.z;
      jet.alt = jet.palt = spot.y;
    }
    return jet;
  }
  if (def.flies) {
    const craft = world.addUnit(type, player.index, producer.cx, producer.cz);
    craft.alt = craft.palt = 1;
    moveTo(
      world,
      craft,
      producer.rally?.x ?? producer.cx,
      producer.rally?.z ?? producer.z + producer.h + 2,
    );
    craft.order = { kind: 'move', x: craft.destX, z: craft.destZ, attack: false };
    return craft;
  }
  if (def.naval || def.amphibious) {
    const map = world.map;
    const mobility = def.naval ? 'naval' : 'amphibious';
    const cell = map.nearestOpen(producer.cx, producer.z + producer.h + 0.5, 0, 8, mobility);
    const x = cell >= 0 ? map.cellX(cell) + 0.5 : producer.cx;
    const z = cell >= 0 ? map.cellZ(cell) + 0.5 : producer.cz;
    const ship = world.addUnit(type, player.index, x, z, Math.PI / 2);
    if (producer.rally) {
      moveTo(world, ship, producer.rally.x, producer.rally.z);
      ship.order = { kind: 'move', x: ship.destX, z: ship.destZ, attack: false };
    }
    return ship;
  }
  const spot = exitSpot(world, producer);
  const unit = world.addUnit(type, player.index, spot.x, spot.z, Math.PI / 2);
  if (def.harvester) {
    unit.order = { kind: 'harvest' };
    return unit;
  }
  const rally = producer.rally ?? { x: spot.x, z: spot.z + 1.5 };
  moveTo(world, unit, rally.x, rally.z);
  unit.order = { kind: 'move', x: unit.destX, z: unit.destZ, attack: false };
  return unit;
}

export interface PlacementCheck {
  ok: boolean;
  reason: string;
  /** Per footprint cell, whether it's clear (for drawing the green/red grid). */
  cells: { x: number; z: number; ok: boolean }[];
}

/** Where a refinery's harvesters park to unload: the cell below its middle. */
export function dockCell(x: number, z: number, w: number, h: number): { x: number; z: number } {
  return { x: x + Math.floor(w / 2), z: z + h };
}

/** Can this structure go with its top-left corner at (cx, cz)? */
export function placementCheck(
  world: World,
  player: Player,
  type: StructureType,
  cx: number,
  cz: number,
  options: { ignoreReach?: boolean; ignore?: number } = {},
): PlacementCheck {
  const map = world.map;
  const def = STRUCTURES[type];
  const [w, h] = def.size;
  const cells: PlacementCheck['cells'] = [];
  let reason = '';
  for (let z = cz; z < cz + h; z++) {
    for (let x = cx; x < cx + w; x++) {
      let ok = map.inside(x, z);
      if (ok) {
        const index = map.index(x, z);
        // Shipyards float on water; everything else needs dry land.
        ok =
          !map.isBlocked(index, def.onWater ? 'naval' : 'ground') &&
          (map.structure[index] ?? 0) === 0;
      }
      if (ok) {
        world.forUnitsNear(x + 0.5, z + 0.5, 1, (unit) => {
          if (unit.id === options.ignore || unit.def.flies) return;
          if (Math.floor(unit.x) === x && Math.floor(unit.z) === z) ok = false;
        });
      }
      if (!ok) reason = 'Can’t build there.';
      cells.push({ x, z, ok });
    }
  }
  if (def.role === 'refinery') {
    const dock = dockCell(cx, cz, w, h);
    const ok =
      map.passable(dock.x, dock.z) && (map.structure[map.index(dock.x, dock.z)] ?? 0) === 0;
    cells.push({ x: dock.x, z: dock.z, ok });
    if (!ok) reason = 'The refinery needs a clear dock in front.';
  }
  if (!reason && !options.ignoreReach && !withinReach(world, player, def, cx, cz, w, h)) {
    reason = 'Too far from your base.';
    for (const cell of cells) cell.ok = false;
  }
  return { ok: reason === '', reason, cells };
}

function withinReach(
  world: World,
  player: Player,
  def: StructureDef,
  cx: number,
  cz: number,
  w: number,
  h: number,
): boolean {
  return world.structures.some((structure) => {
    if (structure.owner !== player.index || structure.dead) return false;
    if (structure.def.role === 'civilian' || structure.def.role === 'derrick') return false;
    if (structure.def.role === 'wall' && def.role !== 'wall') return false;
    const gapX = Math.max(0, structure.x - (cx + w), cx - (structure.x + structure.w));
    const gapZ = Math.max(0, structure.z - (cz + h), cz - (structure.z + structure.h));
    return Math.max(gapX, gapZ) <= BUILD_REACH;
  });
}

/** Places a finished structure. Returns false (and says why) if it can't go there. */
export function placeStructure(
  world: World,
  player: Player,
  type: StructureType,
  cx: number,
  cz: number,
): boolean {
  const queue = player.queues[queueFor(type)];
  if (queue.ready !== type) return false;
  const check = placementCheck(world, player, type, cx, cz);
  if (!check.ok) {
    world.announce(player.index, check.reason, 'bad', 'place', 1);
    return false;
  }
  queue.ready = null;
  const structure = world.addStructure(type, player.index, cx, cz);
  player.stats.structuresBuilt++;
  world.emit({ kind: 'placed', id: structure.id });
  world.emit({ kind: 'sound', sound: 'build', x: structure.cx, z: structure.cz });
  return true;
}

/**
 * Places a line of wall: the first piece was already paid for; the rest cost the same
 * each, as long as the money lasts.
 */
export function placeWalls(
  world: World,
  player: Player,
  type: StructureType,
  cells: { x: number; z: number }[],
): number {
  const queue = player.queues[queueFor(type)];
  if (queue.ready !== type) return 0;
  const cost = STRUCTURES[type].cost;
  let placed = 0;
  for (const cell of cells) {
    if (!placementCheck(world, player, type, cell.x, cell.z).ok) continue;
    if (placed > 0) {
      if (player.credits < cost) {
        world.announce(player.index, 'Insufficient funds.', 'bad', 'funds', 4);
        break;
      }
      player.credits -= cost;
    }
    const wall = world.addStructure(type, player.index, cell.x, cell.z);
    world.emit({ kind: 'placed', id: wall.id });
    placed++;
  }
  if (placed > 0) {
    queue.ready = null;
    world.emit({ kind: 'sound', sound: 'build', x: cells[0]?.x ?? 0, z: cells[0]?.z ?? 0 });
  }
  return placed;
}

export function sell(world: World, structure: Structure): void {
  if (!structure.working || structure.owner < 0) return;
  if (structure.def.role === 'civilian' || structure.def.role === 'derrick') return;
  structure.selling = 0.001;
  structure.repairing = false;
  world.structuresChanged = true;
  world.emit({ kind: 'sound', sound: 'sell', x: structure.cx, z: structure.cz });
}

export function toggleRepair(world: World, structure: Structure): void {
  if (!structure.working || structure.hp >= structure.maxHp) return;
  if (structure.def.role === 'civilian') return;
  structure.repairing = !structure.repairing;
  world.emit({ kind: 'sound', sound: 'build', x: structure.cx, z: structure.cz });
}

export function setPrimary(world: World, structure: Structure): void {
  const role = structure.def.role;
  if (role !== 'barracks' && role !== 'factory' && role !== 'radar') return;
  for (const other of world.structures) {
    if (other.owner === structure.owner && other.def.role === role) other.primary = false;
  }
  structure.primary = true;
}
