import { applyCommand, type Command } from '../sim/commands';
import { stateHash } from '../sim/hash';
import type { World } from '../sim/world';

/** Steps per turn: a turn is a tenth of a second. */
export const TURN_TICKS = 2;
/** Commands given now are carried out this many turns later, so they reach everyone in time. */
export const DELAY = 3;
/** How often (in turns) screens compare fingerprints of the battle. */
const CHECK_EVERY = 10;

/** One player's orders for one turn. */
export interface Bundle {
  turn: number;
  commands: Command[];
  /** A fingerprint of the battle at the start of `hashTurn`. */
  hash?: number;
  hashTurn?: number;
}

/**
 * Deterministic lockstep: every screen runs the same simulation, and nobody starts a turn
 * until they have every player's orders for it. Orders you give are sent out for a turn a
 * little in the future, then everyone carries them out together, in player order.
 */
export class Lockstep {
  /** The next turn to run. */
  turn = 0;
  /** Stuck waiting on another player's orders. */
  waiting = false;
  /** Set if this screen's battle has drifted from someone else's. */
  desync = false;
  private step = 0;
  private pending: Command[] = [];
  private readonly received = new Map<number, Map<number, Command[]>>();
  /** Players who've gone, and the last turn they sent orders for. */
  private readonly gone = new Map<number, number>();
  private readonly ours = new Map<number, number>();
  private readonly theirs = new Map<number, number[]>();
  private readonly world: World;
  private readonly send: (bundle: Bundle) => void;
  private readonly local: number;
  private readonly players: number;

  constructor(world: World, send: (bundle: Bundle) => void, local: number, players: number) {
    this.world = world;
    this.send = send;
    this.local = local;
    this.players = players;
    // Nobody can have given orders for the first few turns.
    for (let turn = 0; turn < DELAY; turn++) {
      for (let player = 0; player < players; player++) this.store(turn, player, []);
    }
  }

  /** One of your orders, to go out with the next bundle. */
  queue(command: Command): void {
    this.pending.push(command);
  }

  /** Another player's orders arrived. */
  receive(player: number, bundle: Bundle): void {
    if (!Number.isInteger(bundle.turn) || bundle.turn < this.turn) return;
    this.store(bundle.turn, player, Array.isArray(bundle.commands) ? bundle.commands : []);
    if (bundle.hash !== undefined && bundle.hashTurn !== undefined) {
      const list = this.theirs.get(bundle.hashTurn) ?? [];
      list.push(bundle.hash);
      this.theirs.set(bundle.hashTurn, list);
      this.compare(bundle.hashTurn);
    }
  }

  /** A player left after sending orders up to `lastTurn`; they surrender after that. */
  leave(player: number, lastTurn: number): void {
    if (this.gone.has(player)) return;
    this.gone.set(player, Math.max(lastTurn, DELAY - 1));
  }

  /** How many turns are ready to run beyond this one: more than a few means we've fallen behind. */
  backlog(): number {
    let turns = 0;
    while (this.ready(this.turn + turns + 1)) turns++;
    return turns;
  }

  /** Runs one step of the battle, unless we're waiting for someone. */
  advance(): boolean {
    if (this.step === 0) {
      if (!this.ready(this.turn)) {
        this.waiting = true;
        return false;
      }
      this.waiting = false;
      this.beginTurn();
    }
    this.world.tick();
    this.step++;
    if (this.step === TURN_TICKS) {
      this.step = 0;
      this.turn++;
    }
    return true;
  }

  private store(turn: number, player: number, commands: Command[]): void {
    let bundles = this.received.get(turn);
    if (!bundles) {
      bundles = new Map();
      this.received.set(turn, bundles);
    }
    bundles.set(player, commands);
  }

  private ready(turn: number): boolean {
    const bundles = this.received.get(turn);
    for (let player = 0; player < this.players; player++) {
      const last = this.gone.get(player);
      if (last !== undefined && turn > last) continue;
      if (!bundles?.has(player)) return false;
    }
    return true;
  }

  private beginTurn(): void {
    const turn = this.turn;
    const bundle: Bundle = { turn: turn + DELAY, commands: this.pending };
    this.pending = [];
    if (turn % CHECK_EVERY === 0) {
      const hash = stateHash(this.world);
      this.ours.set(turn, hash);
      bundle.hash = hash;
      bundle.hashTurn = turn;
      this.compare(turn);
    }
    this.store(bundle.turn, this.local, bundle.commands);
    this.send(bundle);
    for (const [player, last] of this.gone) {
      if (turn === last + 1) applyCommand(this.world, player, { kind: 'surrender' });
    }
    const bundles = this.received.get(turn);
    for (let player = 0; player < this.players; player++) {
      for (const command of bundles?.get(player) ?? []) applyCommand(this.world, player, command);
    }
    this.received.delete(turn);
    // Old fingerprints are no use once everyone has reported.
    this.ours.delete(turn - CHECK_EVERY * 6);
    this.theirs.delete(turn - CHECK_EVERY * 6);
  }

  private compare(turn: number): void {
    const ours = this.ours.get(turn);
    const theirs = this.theirs.get(turn);
    if (ours === undefined || !theirs) return;
    if (theirs.some((hash) => hash !== ours)) this.desync = true;
  }
}
