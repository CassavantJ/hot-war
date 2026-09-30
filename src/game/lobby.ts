import { mapSpec } from '../sim/maps';
import type { Difficulty } from '../sim/player';
import { DEFAULT_NATION, isNation, NATIONS, type Faction, type Nation } from '../sim/rules';
import { COLORS } from '../sim/setup';
import type { GameSettings, PlayerSetup, StartingUnits } from '../sim/world';

export type NationChoice = Nation | 'random';

export interface SeatSetup {
  faction: Faction;
  /** The country played, or 'random' to have one picked at the start. */
  nation: NationChoice;
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
    { faction: 'accord', nation: 'america', color: COLORS[1].value, team: 0, ai: null },
    { faction: 'bloc', nation: 'russia', color: COLORS[0].value, team: 0, ai: 'normal' },
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
    // Setups saved before countries existed get their side's first country.
    const seats = setup.seats.map((seat): SeatSetup => {
      const nation: unknown = seat.nation;
      const choice: NationChoice =
        nation === 'random' || isNation(nation) ? nation : DEFAULT_NATION[seat.faction];
      return { ...seat, nation: choice };
    });
    return fitSeats({ ...setup, seats });
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

/** A country for a choice: itself, or any of the nine at random. */
export function resolveNation(choice: NationChoice, random: () => number): Nation {
  if (choice !== 'random') return choice;
  const all = Object.keys(NATIONS) as Nation[];
  return all[Math.floor(random() * all.length)] ?? 'america';
}

export function toSettings(setup: LobbySetup): GameSettings {
  const players: PlayerSetup[] = setup.seats.map((seat, index) => {
    const nation = resolveNation(seat.nation, Math.random);
    return {
      name: seat.ai ? `Computer ${index} (${AI_NAMES[seat.ai]})` : 'You',
      faction: NATIONS[nation].faction,
      nation,
      color: seat.color,
      team: seat.team,
      ai: seat.ai,
    };
  });
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
