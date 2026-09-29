import { mapSpec } from '../sim/maps';
import type { Difficulty } from '../sim/player';
import type { Faction } from '../sim/rules';
import { COLORS } from '../sim/setup';
import type { GameSettings, PlayerSetup, StartingUnits } from '../sim/world';

export interface SeatSetup {
  faction: Faction;
  color: string;
  team: number;
  /** null for you. */
  ai: Difficulty | null;
}

export interface LobbySetup {
  mapId: string;
  credits: number;
  startingUnits: StartingUnits;
  shortGame: boolean;
  crates: boolean;
  superweapons: boolean;
  speed: number;
  seats: SeatSetup[];
}

export const CREDIT_OPTIONS = [5000, 7500, 10000, 15000, 20000, 30000];

export const DEFAULT_SETUP: LobbySetup = {
  mapId: 'crossroads',
  credits: 10000,
  startingUnits: 'squad',
  shortGame: true,
  crates: true,
  superweapons: true,
  speed: 1,
  seats: [
    { faction: 'accord', color: COLORS[1].value, team: 0, ai: null },
    { faction: 'bloc', color: COLORS[0].value, team: 0, ai: 'normal' },
  ],
};

const KEY = 'hotwar.setup.v1';

export function loadSetup(): LobbySetup {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return DEFAULT_SETUP;
    const saved = JSON.parse(raw) as Partial<LobbySetup>;
    const setup = { ...DEFAULT_SETUP, ...saved };
    if (!Array.isArray(setup.seats) || setup.seats.length < 2 || setup.seats[0]?.ai !== null) {
      return DEFAULT_SETUP;
    }
    return fitSeats(setup);
  } catch {
    return DEFAULT_SETUP;
  }
}

export function saveSetup(setup: LobbySetup): void {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(setup));
  } catch {
    // Private browsing: it just won't be remembered.
  }
}

/** Trims players to what the map holds. */
export function fitSeats(setup: LobbySetup): LobbySetup {
  const room = mapSpec(setup.mapId).players;
  return setup.seats.length > room ? { ...setup, seats: setup.seats.slice(0, room) } : setup;
}

const AI_NAMES: Record<Difficulty, string> = { easy: 'Easy', normal: 'Normal', hard: 'Hard' };

export function toSettings(setup: LobbySetup): GameSettings {
  const players: PlayerSetup[] = setup.seats.map((seat, index) => ({
    name: seat.ai ? `Computer ${index} (${AI_NAMES[seat.ai]})` : 'You',
    faction: seat.faction,
    color: seat.color,
    team: seat.team,
    ai: seat.ai,
  }));
  return {
    mapId: setup.mapId,
    seed: Math.floor(Math.random() * 1_000_000),
    credits: setup.credits,
    startingUnits: setup.startingUnits,
    shortGame: setup.shortGame,
    crates: setup.crates,
    superweapons: setup.superweapons,
    players,
  };
}

/** Is the setup playable: at least two sides? */
export function hasOpponent(setup: LobbySetup): boolean {
  const you = setup.seats[0];
  if (!you) return false;
  return setup.seats.slice(1).some((seat) => you.team === 0 || seat.team !== you.team);
}
