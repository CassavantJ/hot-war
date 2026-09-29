import { spawnHarvester } from './economy';
import { GameMap } from './map';
import { buildMap, type MapSpec } from './maps';
import { orderMove } from './orders';
import { Player, type Difficulty } from './player';
import { STRUCTURES, type Faction, type StructureType, type UnitType } from './rules';
import { revealAround } from './shroud';
import { World } from './world';

export type Objective =
  | { kind: 'destroyAll'; owner: number; text: string }
  | { kind: 'destroy'; tag: string; text: string }
  | { kind: 'protect'; tag: string; text: string }
  | { kind: 'capture'; tag: string; text: string }
  | { kind: 'survive'; seconds: number; text: string }
  | { kind: 'reach'; x: number; z: number; radius: number; text: string };

export type MissionEvent =
  | { at: number; kind: 'message'; text: string }
  | {
      at: number;
      kind: 'reinforce';
      owner: number;
      units: UnitType[];
      x: number;
      z: number;
      /** Where they head once they arrive (attack-moving). */
      attack?: { x: number; z: number };
      text?: string;
    };

export interface MissionSide {
  name: string;
  faction: Faction;
  color: string;
  team: number;
  /** For computer players: how clever, and whether they build and attack. */
  ai: Difficulty | null;
  builds?: boolean;
  attacks?: boolean;
}

export interface MissionDef {
  id: string;
  campaign: Faction;
  title: string;
  location: string;
  briefing: string[];
  map: MapSpec;
  credits: number;
  /** Index 0 is you. */
  sides: MissionSide[];
  structures: { type: StructureType; owner: number; x: number; z: number; tag?: string }[];
  units: { type: UnitType; owner: number; x: number; z: number; count?: number; tag?: string }[];
  objectives: Objective[];
  events: MissionEvent[];
  /** What you're allowed to build (everything your faction has if missing). */
  tech?: (UnitType | StructureType)[];
  superweapons?: boolean;
  /** Where the camera starts. */
  camera: { x: number; z: number };
}

export interface MissionState {
  def: MissionDef;
  /** Tagged things, by name. */
  tags: Map<string, number>;
  /** Per objective: done, failed, or neither yet. */
  status: ('open' | 'done' | 'failed')[];
  fired: boolean[];
  timer: number;
}

/** Builds the world for a campaign mission. */
export function createMission(def: MissionDef, seed = 1): World {
  const { map, neutrals } = buildMap(def.map, seed);
  const players = def.sides.map(
    (side, index) =>
      new Player({
        index,
        name: side.name,
        faction: side.faction,
        color: side.color,
        team: side.team,
        ai: side.ai,
        start: map.starts[index] ?? { x: Math.floor(def.camera.x), z: Math.floor(def.camera.z) },
        credits: index === 0 ? def.credits : 10_000,
        cells: map.width * map.height,
      }),
  );
  const world = new World(map, players, {
    mapId: def.map.id,
    seed,
    credits: def.credits,
    startingUnits: 'none',
    shortGame: true,
    crates: false,
    superweapons: def.superweapons ?? false,
    players: def.sides.map((side) => ({
      name: side.name,
      faction: side.faction,
      color: side.color,
      team: side.team,
      ai: side.ai,
    })),
  });
  for (const brain of world.brains) {
    const side = def.sides[brain.player.index];
    brain.configure({ builds: side?.builds ?? true, attacks: side?.attacks ?? true });
  }
  for (const neutral of neutrals) world.addStructure(neutral.type, -1, neutral.x, neutral.z, true);
  const tags = new Map<string, number>();
  for (const spec of def.structures) {
    clearGround(map, spec.x, spec.z, STRUCTURES[spec.type].size);
    const structure = world.addStructure(spec.type, spec.owner, spec.x, spec.z, true);
    if (spec.tag) tags.set(spec.tag, structure.id);
    const owner = world.players[spec.owner];
    if (owner && structure.def.role === 'refinery') spawnHarvester(world, owner, structure);
  }
  for (const spec of def.units) {
    const count = spec.count ?? 1;
    for (let i = 0; i < count; i++) {
      const angle = (i / Math.max(1, count)) * Math.PI * 2;
      const spread = count > 1 ? 0.6 + (i % 3) * 0.35 : 0;
      const unit = world.addUnit(
        spec.type,
        spec.owner,
        spec.x + Math.cos(angle) * spread,
        spec.z + Math.sin(angle) * spread,
      );
      if (spec.tag && i === 0) tags.set(spec.tag, unit.id);
    }
  }
  const you = world.players[0];
  if (you) revealAround(world, you, def.camera.x, def.camera.z, 12);
  world.mission = {
    def,
    tags,
    status: def.objectives.map(() => 'open'),
    fired: def.events.map(() => false),
    timer: 0,
  };
  world.structuresChanged = true;
  return world;
}

function clearGround(map: GameMap, x: number, z: number, [w, h]: [number, number]): void {
  for (let dz = -1; dz <= h; dz++) {
    for (let dx = -1; dx <= w; dx++) {
      if (!map.inside(x + dx, z + dz)) continue;
      const index = map.index(x + dx, z + dz);
      map.tree[index] = 0;
      map.refresh(index);
    }
  }
}

function alive(world: World, id: number | undefined): boolean {
  return id !== undefined && world.get(id) !== undefined;
}

/** Runs a mission's script and checks its objectives. Called every half second. */
export function tickMission(world: World, state: MissionState): void {
  const def = state.def;
  def.events.forEach((event, i) => {
    if (state.fired[i] || world.time < event.at) return;
    state.fired[i] = true;
    if (event.kind === 'message') {
      world.announce(0, event.text, 'info');
      return;
    }
    const units = event.units.map((type, n) =>
      world.addUnit(
        type,
        event.owner,
        event.x + (n % 3) * 0.8 - 0.8,
        event.z + Math.floor(n / 3) * 0.8,
      ),
    );
    if (event.attack) orderMove(world, units, event.attack.x, event.attack.z, true);
    if (event.text) world.announce(0, event.text, event.owner === 0 ? 'good' : 'bad');
  });
  if (world.outcome !== 'playing') return;
  const you = world.players[0];
  def.objectives.forEach((objective, i) => {
    if (state.status[i] !== 'open' && objective.kind !== 'protect') return;
    switch (objective.kind) {
      case 'destroyAll': {
        const left = world.structures.some(
          (structure) =>
            structure.owner === objective.owner &&
            !structure.dead &&
            structure.def.role !== 'wall' &&
            structure.def.role !== 'civilian' &&
            structure.def.role !== 'derrick',
        );
        if (!left) complete(world, state, i);
        break;
      }
      case 'destroy':
        if (!alive(world, state.tags.get(objective.tag))) complete(world, state, i);
        break;
      case 'protect':
        if (!alive(world, state.tags.get(objective.tag))) state.status[i] = 'failed';
        break;
      case 'capture': {
        const target = world.structure(state.tags.get(objective.tag) ?? 0);
        if (!target) state.status[i] = 'failed';
        else if (target.owner === 0) complete(world, state, i);
        break;
      }
      case 'survive':
        if (world.time >= objective.seconds) complete(world, state, i);
        break;
      case 'reach':
        if (
          world.units.some(
            (unit) =>
              unit.owner === 0 &&
              Math.hypot(unit.x - objective.x, unit.z - objective.z) <= objective.radius,
          )
        ) {
          complete(world, state, i);
        }
        break;
    }
  });
  const failed = state.status.includes('failed');
  const lostEverything =
    you !== undefined &&
    !world.structures.some((structure) => structure.owner === 0 && !structure.dead) &&
    !world.units.some((unit) => unit.owner === 0 && !unit.dead);
  if (failed || lostEverything) {
    world.outcome = 'lost';
    world.announce(0, 'Mission failed.', 'bad');
    return;
  }
  const done = def.objectives.every(
    (objective, i) => objective.kind === 'protect' || state.status[i] === 'done',
  );
  if (done) {
    def.objectives.forEach((objective, i) => {
      if (objective.kind === 'protect') state.status[i] = 'done';
    });
    world.outcome = 'won';
    world.announce(0, 'Mission accomplished.', 'good');
  }
}

function complete(world: World, state: MissionState, index: number): void {
  if (state.status[index] === 'done') return;
  state.status[index] = 'done';
  world.announce(0, 'Objective complete.', 'good');
}
