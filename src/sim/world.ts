import { AiBrain } from './ai';
import { tickProjectiles, type Projectile } from './combat';
import { tickCrates, type Crate } from './crates';
import { tickOre } from './economy';
import { DT, Structure, Unit, type Entity } from './entities';
import type { GameMap } from './map';
import { processPaths, resolveCollisions } from './movement';
import { Pathfinder } from './path';
import type { Difficulty, Player } from './player';
import { recomputePower, tickProduction } from './production';
import { Random } from './random';
import {
  type Faction,
  type SoundId,
  type StructureType,
  type UnitType,
  type WeaponId,
} from './rules';
import { revealAround, updateShroud } from './shroud';
import { tickMission, type MissionState } from './mission';
import { tickSuperweapons, type Storm, type Strike } from './superweapons';
import { tickStructure } from './structures';
import { tickUnit } from './units';

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export type Tone = 'info' | 'good' | 'bad';

/** Things that happened this step, for the view to draw and the speakers to play. */
export type GameEvent =
  | { kind: 'shot'; weapon: WeaponId; from: Vec3; to: Vec3; owner: number }
  | { kind: 'impact'; weapon: WeaponId; at: Vec3 }
  | { kind: 'explode'; at: Vec3; size: number }
  | {
      kind: 'fall';
      type: UnitType;
      owner: number;
      x: number;
      z: number;
      facing: number;
      how: 'shot' | 'burn' | 'crush' | 'bite' | 'blast';
    }
  | { kind: 'placed'; id: number }
  | { kind: 'destroyed'; id: number; x: number; z: number; w: number; h: number }
  | { kind: 'removed'; id: number }
  | { kind: 'warp'; from: Vec3; to: Vec3 }
  | { kind: 'eva'; player: number; text: string; tone: Tone; at?: { x: number; z: number } }
  | { kind: 'crate'; player: number; x: number; z: number; text: string }
  | { kind: 'storm'; x: number; z: number; radius: number; time: number }
  | { kind: 'bolt'; x: number; z: number }
  | {
      kind: 'launch';
      from: { x: number; z: number };
      to: { x: number; z: number };
      time: number;
    }
  | { kind: 'shield'; x: number; z: number; radius: number }
  | { kind: 'promoted'; id: number; rank: number }
  | {
      kind: 'sound';
      sound: SoundId | 'build' | 'sell' | 'deploy' | 'capture';
      x: number;
      z: number;
    };

export interface PlayerSetup {
  name: string;
  faction: Faction;
  color: string;
  /** 0 = on nobody's side. */
  team: number;
  ai: Difficulty | null;
}

export type StartingUnits = 'none' | 'squad' | 'army';

export interface GameSettings {
  mapId: string;
  seed: number;
  credits: number;
  startingUnits: StartingUnits;
  /** Win by destroying every structure (and base truck), rather than every unit too. */
  shortGame: boolean;
  crates: boolean;
  /** Superweapons can be built (on unless turned off). */
  superweapons?: boolean;
  players: PlayerSetup[];
}

/** The whole battle: the map, the players, and everything on the field. */
export class World {
  readonly map: GameMap;
  readonly pathfinder: Pathfinder;
  readonly players: Player[];
  readonly settings: GameSettings;
  readonly rng: Random;
  /** The player on this screen (in multiplayer, each screen has its own). */
  local = 0;
  units: Unit[] = [];
  structures: Structure[] = [];
  projectiles: Projectile[] = [];
  crates: Crate[] = [];
  storms: Storm[] = [];
  strikes: Strike[] = [];
  /** A campaign mission's script and objectives, if this is one. */
  mission: MissionState | null = null;
  brains: AiBrain[] = [];
  time = 0;
  ticks = 0;
  events: GameEvent[] = [];
  outcome: 'playing' | 'won' | 'lost' = 'playing';
  /** Ore cells a harvester is heading for, so two don't pick the same one. */
  readonly oreClaims = new Map<number, number>();
  /** Units waiting for a path; a few are served each step. */
  readonly pathQueue: number[] = [];
  structuresChanged = true;
  /** Countdowns for things that happen every so often. */
  readonly timers = { ore: 0, crates: 45 };
  nextId = 1;
  private readonly byId = new Map<number, Entity>();
  private readonly bucketSize = 4;
  private readonly bucketsWide: number;
  private readonly buckets: Unit[][];
  private slowTimer = 0;

  constructor(map: GameMap, players: Player[], settings: GameSettings) {
    this.map = map;
    this.players = players;
    this.settings = settings;
    this.rng = new Random(settings.seed * 31 + 7);
    this.pathfinder = new Pathfinder(map);
    this.bucketsWide = Math.ceil(map.width / this.bucketSize);
    const bucketsHigh = Math.ceil(map.height / this.bucketSize);
    this.buckets = Array.from({ length: this.bucketsWide * bucketsHigh }, () => []);
    for (const player of players) {
      if (player.ai) this.brains.push(new AiBrain(this, player));
    }
  }

  get(id: number): Entity | undefined {
    const entity = this.byId.get(id);
    return entity && !entity.dead ? entity : undefined;
  }

  unit(id: number): Unit | undefined {
    const entity = this.get(id);
    return entity?.entity === 'unit' ? entity : undefined;
  }

  structure(id: number): Structure | undefined {
    const entity = this.get(id);
    return entity?.entity === 'structure' ? entity : undefined;
  }

  player(index: number): Player | undefined {
    return this.players[index];
  }

  /** Neutral things (owner -1) are nobody's enemy until someone takes them over. */
  isEnemy(a: number, b: number): boolean {
    if (a === b || a < 0 || b < 0) return false;
    const pa = this.players[a];
    const pb = this.players[b];
    if (!pa || !pb) return false;
    return pa.team === 0 || pa.team !== pb.team;
  }

  isAlly(a: number, b: number): boolean {
    return a >= 0 && b >= 0 && !this.isEnemy(a, b);
  }

  addUnit(type: UnitType, owner: number, x: number, z: number, facing = Math.PI / 2): Unit {
    const unit = new Unit(this.nextId++, type, owner, x, z, facing);
    if (unit.def.flies && unit.def.flies !== 'jet') unit.alt = unit.palt = unit.def.altitude ?? 2;
    this.units.push(unit);
    this.byId.set(unit.id, unit);
    const player = this.players[owner];
    if (player) revealAround(this, player, x, z, unit.def.sight);
    return unit;
  }

  /** Puts a structure down (rising out of the ground unless `instant`). */
  addStructure(type: StructureType, owner: number, cx: number, cz: number, instant = false) {
    const structure = new Structure(this.nextId++, type, owner, cx, cz);
    if (instant) structure.built = 1;
    const map = this.map;
    for (let z = cz; z < cz + structure.h; z++) {
      for (let x = cx; x < cx + structure.w; x++) {
        if (!map.inside(x, z)) continue;
        const index = map.index(x, z);
        map.structure[index] = structure.id;
        map.pad[index] = structure.def.walkable ? 1 : 0;
        if (map.ore[index]) {
          map.ore[index] = 0;
          map.gem[index] = 0;
          map.oreVersion++;
        }
        map.refresh(index);
      }
    }
    this.structures.push(structure);
    this.byId.set(structure.id, structure);
    this.structuresChanged = true;
    const player = this.players[owner];
    if (player) revealAround(this, player, structure.cx, structure.cz, structure.def.sight + 2);
    return structure;
  }

  /** Takes a structure off the map (it's already been marked dead or sold). */
  clearStructure(structure: Structure): void {
    const map = this.map;
    for (let z = structure.z; z < structure.z + structure.h; z++) {
      for (let x = structure.x; x < structure.x + structure.w; x++) {
        if (!map.inside(x, z)) continue;
        const index = map.index(x, z);
        if (map.structure[index] !== structure.id) continue;
        map.structure[index] = 0;
        map.pad[index] = 0;
        map.refresh(index);
      }
    }
    this.structuresChanged = true;
  }

  /** Drops dead things from the lists. */
  private sweep(): void {
    if (this.units.some((unit) => unit.dead)) {
      this.units = this.units.filter((unit) => {
        if (unit.dead) this.byId.delete(unit.id);
        return !unit.dead;
      });
    }
    if (this.structures.some((structure) => structure.dead)) {
      this.structures = this.structures.filter((structure) => {
        if (structure.dead) this.byId.delete(structure.id);
        return !structure.dead;
      });
    }
  }

  emit(event: GameEvent): void {
    this.events.push(event);
  }

  /**
   * A spoken/printed announcement to one player. With a `key`, it won't repeat within
   * `every` seconds.
   */
  announce(
    player: number,
    text: string,
    tone: Tone = 'info',
    key?: string,
    every = 8,
    at?: { x: number; z: number },
  ): void {
    const owner = this.players[player];
    if (!owner) return;
    if (key) {
      const last = owner.warned.get(key) ?? -Infinity;
      if (this.time - last < every) return;
      owner.warned.set(key, this.time);
    }
    this.emit(at ? { kind: 'eva', player, text, tone, at } : { kind: 'eva', player, text, tone });
  }

  private rebuildBuckets(): void {
    for (const bucket of this.buckets) bucket.length = 0;
    for (const unit of this.units) {
      if (unit.dead || unit.inside) continue;
      this.bucketFor(unit.x, unit.z)?.push(unit);
    }
  }

  private bucketFor(x: number, z: number): Unit[] | undefined {
    const bx = Math.min(this.bucketsWide - 1, Math.max(0, Math.floor(x / this.bucketSize)));
    const bz = Math.max(0, Math.floor(z / this.bucketSize));
    return this.buckets[bz * this.bucketsWide + bx];
  }

  /** Calls `visit` for every unit on the field within `radius` of (x, z). */
  forUnitsNear(x: number, z: number, radius: number, visit: (unit: Unit) => void): void {
    const size = this.bucketSize;
    const x0 = Math.max(0, Math.floor((x - radius) / size));
    const x1 = Math.min(this.bucketsWide - 1, Math.floor((x + radius) / size));
    const bucketsHigh = this.buckets.length / this.bucketsWide;
    const z0 = Math.max(0, Math.floor((z - radius) / size));
    const z1 = Math.min(bucketsHigh - 1, Math.floor((z + radius) / size));
    const r2 = radius * radius;
    for (let bz = z0; bz <= z1; bz++) {
      for (let bx = x0; bx <= x1; bx++) {
        const bucket = this.buckets[bz * this.bucketsWide + bx];
        if (!bucket) continue;
        for (const unit of bucket) {
          if (unit.dead || unit.inside) continue;
          const dx = unit.x - x;
          const dz = unit.z - z;
          if (dx * dx + dz * dz <= r2) visit(unit);
        }
      }
    }
  }

  unitsNear(x: number, z: number, radius: number): Unit[] {
    const found: Unit[] = [];
    this.forUnitsNear(x, z, radius, (unit) => found.push(unit));
    return found;
  }

  structureAt(x: number, z: number): Structure | undefined {
    if (!this.map.inside(Math.floor(x), Math.floor(z))) return undefined;
    const id = this.map.structure[this.map.index(Math.floor(x), Math.floor(z))] ?? 0;
    return id ? this.structure(id) : undefined;
  }

  /** Advances the battle by one step. */
  tick(): void {
    this.time += DT;
    this.ticks++;
    for (const unit of this.units) {
      unit.px = unit.x;
      unit.pz = unit.z;
      unit.palt = unit.alt;
      unit.pfacing = unit.facing;
      unit.pturret = unit.turret;
    }
    for (const structure of this.structures) structure.pturret = structure.turret;
    this.rebuildBuckets();
    if (this.structuresChanged) {
      recomputePower(this);
      this.structuresChanged = false;
    }
    for (const brain of this.brains) brain.update();
    for (const player of this.players) {
      if (!player.defeated) tickProduction(this, player);
    }
    for (const structure of this.structures) {
      if (!structure.dead) tickStructure(this, structure);
    }
    processPaths(this);
    for (const unit of this.units) {
      if (!unit.dead) tickUnit(this, unit);
    }
    this.rebuildBuckets();
    resolveCollisions(this);
    tickProjectiles(this);
    tickSuperweapons(this);
    tickOre(this);
    if (this.settings.crates) tickCrates(this);
    this.sweep();
    this.slowTimer += DT;
    if (this.slowTimer >= 0.25) {
      this.slowTimer = 0;
      updateShroud(this);
      if (this.mission) {
        if (this.ticks % 10 === 0) tickMission(this, this.mission);
      } else if (this.ticks % 20 === 0) {
        this.checkVictory();
      }
    }
  }

  /** Knocks a player out: their army blows up and their buildings fall. */
  defeat(player: Player): void {
    if (player.defeated) return;
    player.defeated = true;
    for (const unit of this.units) {
      if (unit.owner === player.index && !unit.dead) {
        unit.dead = true;
        this.emit({ kind: 'explode', at: { x: unit.x, y: unit.alt, z: unit.z }, size: 0.6 });
      }
    }
    for (const structure of this.structures) {
      if (structure.owner !== player.index || structure.dead) continue;
      if (structure.def.role === 'civilian' || structure.def.role === 'derrick') {
        structure.owner = -1;
        continue;
      }
      structure.dead = true;
      this.clearStructure(structure);
      this.emit({
        kind: 'destroyed',
        id: structure.id,
        x: structure.x,
        z: structure.z,
        w: structure.w,
        h: structure.h,
      });
    }
    for (const other of this.players) {
      if (other.index !== player.index) {
        this.announce(
          other.index,
          player.index === this.local ? 'You have been defeated.' : `${player.name} defeated.`,
          other.index === this.local && this.isEnemy(other.index, player.index) ? 'good' : 'bad',
        );
      }
    }
    if (player.index === this.local) this.announce(player.index, 'Mission failed.', 'bad');
  }

  /** Knocks out players with nothing left, and ends the game when one side remains. */
  checkVictory(): void {
    for (const player of this.players) {
      if (player.defeated) continue;
      const hasStructure = this.structures.some(
        (structure) =>
          structure.owner === player.index &&
          structure.def.role !== 'wall' &&
          structure.def.role !== 'civilian' &&
          structure.def.role !== 'derrick',
      );
      const hasTruck = this.units.some(
        (unit) => unit.owner === player.index && unit.def.deploysToHq,
      );
      const hasUnits = this.units.some((unit) => unit.owner === player.index);
      const alive = this.settings.shortGame ? hasStructure || hasTruck : hasStructure || hasUnits;
      if (!alive) this.defeat(player);
    }
    if (this.outcome !== 'playing') return;
    const me = this.players[this.local];
    if (!me) return;
    if (me.defeated) {
      this.outcome = 'lost';
      return;
    }
    const enemiesLeft = this.players.some(
      (player) => !player.defeated && this.isEnemy(me.index, player.index),
    );
    if (!enemiesLeft) {
      this.outcome = 'won';
      this.announce(me.index, 'Battle won. The enemy has been wiped out.', 'good');
    }
  }
}
