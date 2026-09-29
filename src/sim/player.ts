import type { Cell } from './map';
import type { Faction, Role, StructureType, UnitType } from './rules';

export type QueueKind = 'building' | 'defense' | 'infantry' | 'vehicle' | 'aircraft';
export type Difficulty = 'easy' | 'normal' | 'hard';

export interface QueueItem {
  type: UnitType | StructureType;
  /** 0 → 1. */
  progress: number;
  /** Credits spent on it so far (refunded if cancelled). */
  paid: number;
  onHold: boolean;
}

export interface BuildQueue {
  items: QueueItem[];
  /** A finished structure waiting to be placed. */
  ready: StructureType | null;
}

export interface PlayerStats {
  unitsBuilt: number;
  unitsLost: number;
  unitsKilled: number;
  structuresBuilt: number;
  structuresLost: number;
  structuresKilled: number;
  harvested: number;
}

export class Player {
  readonly index: number;
  readonly name: string;
  readonly faction: Faction;
  readonly color: string;
  /** Players on the same non-zero team are allies. */
  readonly team: number;
  readonly ai: Difficulty | null;
  start: Cell;
  credits: number;
  powerOut = 0;
  powerUse = 0;
  radar = false;
  readonly queues: Record<QueueKind, BuildQueue> = {
    building: { items: [], ready: null },
    defense: { items: [], ready: null },
    infantry: { items: [], ready: null },
    vehicle: { items: [], ready: null },
    aircraft: { items: [], ready: null },
  };
  /** How many working structures of each role it has. */
  roles = new Map<Role, number>();
  /** 1 where the map has been seen. */
  readonly shroud: Uint8Array;
  shroudVersion = 0;
  defeated = false;
  readonly stats: PlayerStats = {
    unitsBuilt: 0,
    unitsLost: 0,
    unitsKilled: 0,
    structuresBuilt: 0,
    structuresLost: 0,
    structuresKilled: 0,
    harvested: 0,
  };
  /** When each kind of warning was last given, so they aren't repeated every second. */
  readonly warned = new Map<string, number>();

  constructor(options: {
    index: number;
    name: string;
    faction: Faction;
    color: string;
    team: number;
    ai: Difficulty | null;
    start: Cell;
    credits: number;
    cells: number;
  }) {
    this.index = options.index;
    this.name = options.name;
    this.faction = options.faction;
    this.color = options.color;
    this.team = options.team;
    this.ai = options.ai;
    this.start = options.start;
    this.credits = options.credits;
    this.shroud = new Uint8Array(options.cells);
  }

  get lowPower(): boolean {
    return this.powerUse > this.powerOut;
  }

  has(role: Role): boolean {
    return (this.roles.get(role) ?? 0) > 0;
  }

  count(role: Role): number {
    return this.roles.get(role) ?? 0;
  }

  /** How fast things build, 0–1, given the power situation. */
  get powerFactor(): number {
    if (!this.lowPower) return 1;
    if (this.powerOut <= 0) return 0.25;
    return Math.max(0.25, this.powerOut / this.powerUse);
  }
}
