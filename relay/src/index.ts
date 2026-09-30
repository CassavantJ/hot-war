import { DurableObject } from 'cloudflare:workers';

/**
 * The Hot War multiplayer relay. Each room (a five-letter code) is one Durable Object that
 * holds the room's WebSockets: it keeps the lobby (who's in which seat, the host's choice of
 * map), starts the battle, then passes each player's orders to everyone else. It never runs
 * the game itself; every player's browser does that, in lockstep.
 */

interface Env {
  ROOM: DurableObjectNamespace<Room>;
}

const MAX_PLAYERS = 4;
const MAX_MESSAGE = 64 * 1024;
const FACTIONS = ['accord', 'bloc'];
/** The game's team colours (src/sim/setup.ts), blue and red first. */
const COLORS = [
  '#2f74e0',
  '#d8342c',
  '#e9c229',
  '#3fa34d',
  '#ec7a1c',
  '#8a4bd6',
  '#1fb3a6',
  '#e85aa6',
];
const ORIGINS = [
  /^https:\/\/hot-war\.raylmao\.com$/,
  /^https:\/\/([a-z0-9-]+\.)?hot-war\.pages\.dev$/,
  /^https:\/\/raylmao\.com$/,
  /^http:\/\/localhost:\d+$/,
  /^http:\/\/127\.0\.0\.1:\d+$/,
];

/** What the room remembers about each socket. */
interface Member {
  seat: number;
  name: string;
  faction: string;
  /** A country id, or 'random'; the game checks it. */
  nation: string;
  color: string;
  /** The last turn this player sent orders for. */
  lastTurn: number;
}

interface RoomState {
  setup: unknown;
  started: boolean;
}

type Incoming =
  | { t: 'hello'; name: string }
  | { t: 'seat'; faction: string; nation?: string; color: string }
  | { t: 'setup'; setup: unknown }
  | { t: 'start' }
  | { t: 'turn'; turn: number; commands: unknown; hash?: number; hashTurn?: number };

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const match = /^\/room\/([A-Z]{5})$/.exec(url.pathname);
    if (!match?.[1]) return new Response('Hot War relay', { status: 404 });
    if (request.headers.get('Upgrade') !== 'websocket') {
      return new Response('Expected a WebSocket', { status: 426 });
    }
    const origin = request.headers.get('Origin') ?? '';
    if (!ORIGINS.some((allowed) => allowed.test(origin))) {
      return new Response('Not allowed', { status: 403 });
    }
    const room = env.ROOM.get(env.ROOM.idFromName(match[1]));
    return room.fetch(request);
  },
} satisfies ExportedHandler<Env>;

export class Room extends DurableObject<Env> {
  private state: RoomState | null = null;

  private async load(): Promise<RoomState> {
    this.state ??= (await this.ctx.storage.get<RoomState>('room')) ?? {
      setup: null,
      started: false,
    };
    return this.state;
  }

  private async save(): Promise<void> {
    if (this.state) await this.ctx.storage.put('room', this.state);
  }

  /** Everyone still connected, with what we know about them, in seat order. */
  private members(except?: WebSocket): [WebSocket, Member][] {
    return this.ctx
      .getWebSockets()
      .filter((socket) => socket !== except && socket.readyState === WebSocket.OPEN)
      .map((socket) => [socket, socket.deserializeAttachment() as Member] as [WebSocket, Member])
      .sort((a, b) => a[1].seat - b[1].seat);
  }

  private broadcast(message: unknown, except?: WebSocket): void {
    const text = JSON.stringify(message);
    for (const [socket] of this.members(except)) {
      try {
        socket.send(text);
      } catch {
        // It's closing; its close handler will tidy up.
      }
    }
  }

  private async lobby(except?: WebSocket): Promise<void> {
    const state = await this.load();
    const members = this.members(except);
    const host = members[0]?.[1].seat ?? -1;
    this.broadcast(
      {
        t: 'lobby',
        host,
        setup: state.setup,
        members: members.map(([, member]) => ({
          seat: member.seat,
          name: member.name,
          faction: member.faction,
          nation: member.nation,
          color: member.color,
        })),
      },
      except,
    );
  }

  override async fetch(): Promise<Response> {
    const state = await this.load();
    const pair = new WebSocketPair();
    const client = pair[0];
    const server = pair[1];
    this.ctx.acceptWebSocket(server);
    const members = this.members(server);
    const refuse = (message: string) => {
      server.send(JSON.stringify({ t: 'error', message }));
      server.close(4000, message);
      return new Response(null, { status: 101, webSocket: client });
    };
    if (state.started) return refuse('That battle has already started.');
    if (members.length >= MAX_PLAYERS) return refuse('That room is full.');
    const taken = new Set(members.map(([, member]) => member.seat));
    let seat = 0;
    while (taken.has(seat)) seat++;
    const usedColors = new Set(members.map(([, member]) => member.color));
    const member: Member = {
      seat,
      name: `Player ${String(seat + 1)}`,
      faction: FACTIONS[seat % 2] ?? 'accord',
      nation: seat % 2 === 0 ? 'america' : 'russia',
      color: COLORS.find((color) => !usedColors.has(color)) ?? COLORS[0] ?? '#2f74e0',
      lastTurn: -1,
    };
    server.serializeAttachment(member);
    server.send(JSON.stringify({ t: 'welcome', seat }));
    await this.lobby();
    return new Response(null, { status: 101, webSocket: client });
  }

  override async webSocketMessage(socket: WebSocket, data: string | ArrayBuffer): Promise<void> {
    if (typeof data !== 'string' || data.length > MAX_MESSAGE) return;
    let message: Incoming;
    try {
      message = JSON.parse(data) as Incoming;
    } catch {
      return;
    }
    const member = socket.deserializeAttachment() as Member;
    const state = await this.load();
    const host = this.members()[0]?.[1].seat === member.seat;
    switch (message.t) {
      case 'hello': {
        if (state.started || typeof message.name !== 'string') return;
        const name = message.name
          .replace(/[^\p{L}\p{N} _.'-]/gu, '')
          .trim()
          .slice(0, 16);
        member.name = name || member.name;
        socket.serializeAttachment(member);
        await this.lobby();
        return;
      }
      case 'seat': {
        if (state.started) return;
        if (FACTIONS.includes(message.faction)) member.faction = message.faction;
        if (typeof message.nation === 'string' && /^[a-z]{2,12}$/.test(message.nation)) {
          member.nation = message.nation;
        }
        const clash = this.members(socket).some(([, other]) => other.color === message.color);
        if (COLORS.includes(message.color) && !clash) member.color = message.color;
        socket.serializeAttachment(member);
        await this.lobby();
        return;
      }
      case 'setup':
        if (!host || state.started) return;
        state.setup = message.setup;
        await this.save();
        await this.lobby();
        return;
      case 'start': {
        const members = this.members();
        // No setup yet means the defaults, which every client knows.
        if (!host || state.started || members.length < 2) return;
        state.started = true;
        await this.save();
        this.broadcast({
          t: 'start',
          seed: Math.floor(Math.random() * 1_000_000_000),
          setup: state.setup,
          members: members.map(([, other]) => ({
            seat: other.seat,
            name: other.name,
            faction: other.faction,
            nation: other.nation,
            color: other.color,
          })),
        });
        return;
      }
      case 'turn': {
        if (!state.started || !Number.isInteger(message.turn)) return;
        if (message.turn > member.lastTurn) {
          member.lastTurn = message.turn;
          socket.serializeAttachment(member);
        }
        this.broadcast(
          {
            t: 'turn',
            seat: member.seat,
            turn: message.turn,
            commands: message.commands,
            hash: message.hash,
            hashTurn: message.hashTurn,
          },
          socket,
        );
        return;
      }
    }
  }

  override async webSocketClose(socket: WebSocket): Promise<void> {
    await this.gone(socket);
  }

  override async webSocketError(socket: WebSocket): Promise<void> {
    await this.gone(socket);
  }

  private async gone(socket: WebSocket): Promise<void> {
    const member = socket.deserializeAttachment() as Member | null;
    const state = await this.load();
    const left = this.members(socket);
    if (member && state.started) {
      this.broadcast({ t: 'left', seat: member.seat, lastTurn: member.lastTurn }, socket);
    } else {
      await this.lobby(socket);
    }
    // An empty room forgets everything, so the code can be used again.
    if (left.length === 0) {
      this.state = null;
      await this.ctx.storage.deleteAll();
    }
    try {
      socket.close(1000, 'Bye');
    } catch {
      // Already closed.
    }
  }
}
