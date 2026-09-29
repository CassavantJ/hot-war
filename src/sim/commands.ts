import type { Entity, Structure, Unit } from './entities';
import {
  orderAttack,
  orderAttackGround,
  orderDeploy,
  orderEnter,
  orderEvacuate,
  orderGuard,
  orderHarvest,
  orderMove,
  orderScatter,
  orderStop,
} from './orders';
import {
  cancelBuild,
  placeStructure,
  placeWalls,
  sell,
  setPrimary,
  startBuild,
  toggleRepair,
} from './production';
import { STRUCTURES, UNITS, type StructureType, type UnitType } from './rules';
import { fireSuperweapon } from './superweapons';
import type { World } from './world';

/**
 * Everything a player can tell the game to do, as plain data. In single player a command is
 * carried out at once; in multiplayer it's sent to everyone and carried out on the same step
 * on every screen, so every copy of the battle stays identical. Each command is checked
 * against the player who gave it: you can only order your own units about.
 */
export type Command =
  | { kind: 'move'; units: number[]; x: number; z: number; attack?: boolean }
  | { kind: 'attack'; units: number[]; target: number; force?: boolean }
  | { kind: 'attackGround'; units: number[]; x: number; z: number }
  | { kind: 'stop' | 'guard' | 'deploy' | 'scatter'; units: number[] }
  | { kind: 'enter'; units: number[]; target: number }
  | { kind: 'harvest'; units: number[]; cell: number }
  | { kind: 'evacuate'; structure: number }
  | { kind: 'build'; type: UnitType | StructureType; count: number }
  | { kind: 'cancel'; type: UnitType | StructureType }
  | { kind: 'place'; type: StructureType; x: number; z: number }
  | { kind: 'walls'; type: StructureType; cells: { x: number; z: number }[] }
  | { kind: 'sell' | 'repair' | 'primary'; structure: number }
  | { kind: 'rally'; structure: number; x: number; z: number }
  | {
      kind: 'superweapon';
      structure: number;
      x: number;
      z: number;
      to?: { x: number; z: number };
    }
  | { kind: 'surrender' };

function isType(type: string): type is UnitType | StructureType {
  return type in UNITS || type in STRUCTURES;
}

/** The player's own units from a list of ids (not dead, not riding inside something). */
function own(world: World, owner: number, ids: unknown): Unit[] {
  if (!Array.isArray(ids)) return [];
  const units: Unit[] = [];
  for (const id of ids) {
    if (typeof id !== 'number') continue;
    const unit = world.unit(id);
    if (unit?.owner === owner && !unit.dead && !unit.inside) units.push(unit);
  }
  return units;
}

function ownStructure(world: World, owner: number, id: number): Structure | null {
  const structure = world.structure(id);
  return structure?.owner === owner && !structure.dead ? structure : null;
}

function entity(world: World, id: number): Entity | null {
  const found = world.unit(id) ?? world.structure(id);
  return found && !found.dead ? found : null;
}

function finite(...values: unknown[]): boolean {
  return values.every((value) => typeof value === 'number' && Number.isFinite(value));
}

/** Carries out a command for `owner`. Returns false if it couldn't be done. */
export function applyCommand(world: World, owner: number, command: Command): boolean {
  const player = world.players[owner];
  if (!player || player.defeated) return false;
  switch (command.kind) {
    case 'move':
      if (!finite(command.x, command.z)) return false;
      orderMove(world, own(world, owner, command.units), command.x, command.z, command.attack);
      return true;
    case 'attack': {
      const target = entity(world, command.target);
      if (!target) return false;
      orderAttack(world, own(world, owner, command.units), target, command.force === true);
      return true;
    }
    case 'attackGround':
      if (!finite(command.x, command.z)) return false;
      orderAttackGround(own(world, owner, command.units), command.x, command.z);
      return true;
    case 'stop':
      orderStop(own(world, owner, command.units));
      return true;
    case 'guard':
      orderGuard(own(world, owner, command.units));
      return true;
    case 'deploy':
      orderDeploy(own(world, owner, command.units));
      return true;
    case 'scatter':
      orderScatter(world, own(world, owner, command.units));
      return true;
    case 'enter': {
      const target = entity(world, command.target);
      if (!target) return false;
      orderEnter(own(world, owner, command.units), target);
      return true;
    }
    case 'harvest':
      if (!finite(command.cell) || command.cell < 0 || command.cell >= world.map.ground.length) {
        return false;
      }
      orderHarvest(
        own(world, owner, command.units).filter((unit) => unit.def.harvester),
        command.cell,
      );
      return true;
    case 'evacuate': {
      const structure = ownStructure(world, owner, command.structure);
      if (!structure) return false;
      orderEvacuate(world, structure);
      return true;
    }
    case 'build':
      if (!isType(command.type)) return false;
      return startBuild(world, player, command.type, Math.max(1, Math.min(5, command.count)));
    case 'cancel':
      if (!isType(command.type)) return false;
      cancelBuild(world, player, command.type);
      return true;
    case 'place':
      if (!(command.type in STRUCTURES) || !finite(command.x, command.z)) return false;
      return placeStructure(
        world,
        player,
        command.type,
        Math.floor(command.x),
        Math.floor(command.z),
      );
    case 'walls': {
      if (!(command.type in STRUCTURES) || !Array.isArray(command.cells)) return false;
      const cells = command.cells
        .slice(0, 64)
        .filter((cell) => finite(cell.x, cell.z))
        .map((cell) => ({ x: Math.floor(cell.x), z: Math.floor(cell.z) }));
      return placeWalls(world, player, command.type, cells) > 0;
    }
    case 'sell': {
      const structure = ownStructure(world, owner, command.structure);
      if (structure) sell(world, structure);
      return structure !== null;
    }
    case 'repair': {
      const structure = ownStructure(world, owner, command.structure);
      if (structure) toggleRepair(world, structure);
      return structure !== null;
    }
    case 'primary': {
      const structure = ownStructure(world, owner, command.structure);
      if (structure) setPrimary(world, structure);
      return structure !== null;
    }
    case 'rally': {
      const structure = ownStructure(world, owner, command.structure);
      if (!structure || !finite(command.x, command.z)) return false;
      structure.rally = { x: command.x, z: command.z };
      return true;
    }
    case 'superweapon': {
      const structure = ownStructure(world, owner, command.structure);
      if (!structure || !finite(command.x, command.z)) return false;
      const target = { x: command.x, z: command.z };
      return command.to && finite(command.to.x, command.to.z)
        ? fireSuperweapon(world, structure, target, command.to)
        : fireSuperweapon(world, structure, target);
    }
    case 'surrender':
      world.defeat(player);
      return true;
  }
}
