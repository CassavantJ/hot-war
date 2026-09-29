import { MAPS } from '../sim/maps';
import { FACTIONS, type Faction } from '../sim/rules';
import { COLORS } from '../sim/setup';
import type { GameSettings, StartingUnits } from '../sim/world';
import type { Bundle } from './lockstep';
import { CREDIT_OPTIONS } from './lobby';

/**
 * The connection to the multiplayer relay: a WebSocket to a room, named by a five-letter
 * code. The relay keeps the lobby and passes orders between players; see relay/.
 */

const envUrl = import.meta.env.VITE_RELAY_URL as string | undefined;
export const RELAY_URL =
  envUrl ?? (import.meta.env.DEV ? 'ws://127.0.0.1:8787' : 'wss://hot-war-relay.raylmao.com');

/** Letters that can't be misread for one another. */
const CODE_LETTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZ';

export function newRoomCode(): string {
  const bytes = new Uint8Array(5);
  crypto.getRandomValues(bytes);
  return [...bytes].map((byte) => CODE_LETTERS[byte % CODE_LETTERS.length] ?? 'A').join('');
}

export function cleanCode(text: string): string {
  return text
    .toUpperCase()
    .replace(/[^A-Z]/g, '')
    .slice(0, 5);
}

/** The host's choices for the battle. */
export interface OnlineSetup {
  mapId: string;
  credits: number;
  startingUnits: StartingUnits;
  shortGame: boolean;
  crates: boolean;
  superweapons: boolean;
}

export const DEFAULT_ONLINE: OnlineSetup = {
  mapId: 'crossroads',
  credits: 10_000,
  startingUnits: 'none',
  shortGame: true,
  crates: true,
  superweapons: true,
};

export interface Member {
  seat: number;
  name: string;
  faction: Faction;
  color: string;
}

export interface LobbyState {
  /** The seat of the player running the room. */
  host: number;
  setup: OnlineSetup;
  members: Member[];
}

interface StartMessage {
  seed: number;
  setup: unknown;
  members: unknown;
}

/** A battle about to begin: the settings everyone uses, and who's who. */
export interface OnlineGame {
  net: Net;
  settings: GameSettings;
  /** Your player number in the battle. */
  local: number;
  /** Each player's seat in the room, by player number. */
  seats: number[];
}

/** Everything from the relay is checked before use; anything odd falls back to a default. */
function readSetup(value: unknown): OnlineSetup {
  const raw = (typeof value === 'object' && value !== null ? value : {}) as Partial<OnlineSetup>;
  const map = MAPS.find((candidate) => candidate.id === raw.mapId && !candidate.campaign);
  return {
    mapId: map?.id ?? DEFAULT_ONLINE.mapId,
    credits: CREDIT_OPTIONS.includes(raw.credits ?? 0)
      ? (raw.credits ?? 0)
      : DEFAULT_ONLINE.credits,
    startingUnits:
      raw.startingUnits === 'squad' || raw.startingUnits === 'army' ? raw.startingUnits : 'none',
    shortGame: raw.shortGame !== false,
    crates: raw.crates !== false,
    superweapons: raw.superweapons !== false,
  };
}

function readMembers(value: unknown): Member[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is Record<string, unknown> => typeof item === 'object' && item !== null)
    .map((item) => ({
      seat: typeof item.seat === 'number' ? item.seat : -1,
      name: typeof item.name === 'string' ? item.name.slice(0, 16) : 'Player',
      faction: item.faction === 'bloc' ? ('bloc' as const) : ('accord' as const),
      color: COLORS.some((color) => color.value === item.color)
        ? String(item.color)
        : COLORS[0].value,
    }))
    .filter((member) => member.seat >= 0)
    .sort((a, b) => a.seat - b.seat);
}

interface Handlers {
  turn: (seat: number, bundle: Bundle) => void;
  left: (seat: number, lastTurn: number) => void;
}

export class Net {
  readonly code: string;
  seat = -1;
  lobby: LobbyState | null = null;
  /** Why the connection ended, if it has. */
  closed: string | null = null;
  /** Called whenever the lobby changes or the connection drops. */
  onChange: () => void = () => undefined;
  onStart: (game: OnlineGame) => void = () => undefined;
  private handlers: Handlers | null = null;
  /** Orders that arrived before the battle was ready for them. */
  private readonly backlog: (() => void)[] = [];
  private readonly socket: WebSocket;

  private constructor(code: string, socket: WebSocket) {
    this.code = code;
    this.socket = socket;
  }

  /** Joins (or opens) a room. Resolves once the relay has given us a seat. */
  static open(code: string, name: string): Promise<Net> {
    return new Promise((resolve, reject) => {
      let socket: WebSocket;
      try {
        socket = new WebSocket(`${RELAY_URL}/room/${code}`);
      } catch {
        reject(new Error('Couldn’t reach the multiplayer server.'));
        return;
      }
      const net = new Net(code, socket);
      let settled = false;
      const fail = (message: string) => {
        if (settled) return;
        settled = true;
        socket.close();
        reject(new Error(message));
      };
      const timer = window.setTimeout(() => {
        fail('The multiplayer server didn’t answer.');
      }, 8000);
      socket.addEventListener('message', (event) => {
        const message = net.parse(event.data);
        if (!message) return;
        if (message.t === 'welcome' && !settled) {
          settled = true;
          window.clearTimeout(timer);
          net.seat = typeof message.seat === 'number' ? message.seat : -1;
          net.send({ t: 'hello', name });
          resolve(net);
          return;
        }
        if (message.t === 'error' && !settled) {
          window.clearTimeout(timer);
          fail(typeof message.message === 'string' ? message.message : 'The room turned us away.');
          return;
        }
        net.handle(message);
      });
      socket.addEventListener('close', () => {
        window.clearTimeout(timer);
        if (!settled) {
          fail('Couldn’t reach the multiplayer server.');
          return;
        }
        net.closed ??= 'The connection to the other players was lost.';
        net.onChange();
      });
    });
  }

  get isHost(): boolean {
    return this.lobby?.host === this.seat;
  }

  private parse(data: unknown): Record<string, unknown> | null {
    if (typeof data !== 'string') return null;
    try {
      const parsed: unknown = JSON.parse(data);
      return typeof parsed === 'object' && parsed !== null
        ? (parsed as Record<string, unknown>)
        : null;
    } catch {
      return null;
    }
  }

  private handle(message: Record<string, unknown>): void {
    switch (message.t) {
      case 'lobby':
        this.lobby = {
          host: typeof message.host === 'number' ? message.host : -1,
          setup: readSetup(message.setup),
          members: readMembers(message.members),
        };
        this.onChange();
        return;
      case 'start':
        this.onStart(this.game(message as unknown as StartMessage));
        return;
      case 'turn': {
        const seat = message.seat;
        const bundle: Bundle = {
          turn: typeof message.turn === 'number' ? message.turn : -1,
          commands: Array.isArray(message.commands) ? (message.commands as Bundle['commands']) : [],
        };
        if (typeof message.hash === 'number' && typeof message.hashTurn === 'number') {
          bundle.hash = message.hash;
          bundle.hashTurn = message.hashTurn;
        }
        if (typeof seat !== 'number') return;
        this.deliver(() => this.handlers?.turn(seat, bundle));
        return;
      }
      case 'left': {
        const seat = message.seat;
        const lastTurn = typeof message.lastTurn === 'number' ? message.lastTurn : -1;
        if (typeof seat !== 'number') return;
        this.deliver(() => this.handlers?.left(seat, lastTurn));
        if (this.lobby) {
          this.lobby.members = this.lobby.members.filter((member) => member.seat !== seat);
        }
        this.onChange();
        return;
      }
      case 'error':
        this.closed = typeof message.message === 'string' ? message.message : 'Room error.';
        this.onChange();
        return;
    }
  }

  private deliver(run: () => void): void {
    if (this.handlers) run();
    else this.backlog.push(run);
  }

  /** Orders coming in wait until something attaches again. */
  detach(): void {
    this.handlers = null;
  }

  /** The battle takes over the orders coming in (including any that arrived early). */
  attach(handlers: Handlers): void {
    this.handlers = handlers;
    for (const run of this.backlog.splice(0)) run();
  }

  private game(message: StartMessage): OnlineGame {
    const setup = readSetup(message.setup);
    const members = readMembers(message.members);
    const settings: GameSettings = {
      mapId: setup.mapId,
      seed: typeof message.seed === 'number' ? message.seed : 1,
      credits: setup.credits,
      startingUnits: setup.startingUnits,
      shortGame: setup.shortGame,
      crates: setup.crates,
      superweapons: setup.superweapons,
      players: members.map((member) => ({
        name: member.name,
        faction: member.faction,
        color: member.color,
        team: 0,
        ai: null,
      })),
    };
    return {
      net: this,
      settings,
      local: members.findIndex((member) => member.seat === this.seat),
      seats: members.map((member) => member.seat),
    };
  }

  private send(message: unknown): void {
    if (this.socket.readyState === WebSocket.OPEN) this.socket.send(JSON.stringify(message));
  }

  setName(name: string): void {
    this.send({ t: 'hello', name });
  }

  setSeat(faction: Faction, color: string): void {
    if (faction in FACTIONS) this.send({ t: 'seat', faction, color });
  }

  setSetup(setup: OnlineSetup): void {
    this.send({ t: 'setup', setup });
  }

  start(): void {
    this.send({ t: 'start' });
  }

  sendTurn(bundle: Bundle): void {
    this.send({ t: 'turn', ...bundle });
  }

  close(): void {
    this.closed ??= 'You left.';
    this.handlers = null;
    this.socket.close(1000, 'Left');
  }
}
