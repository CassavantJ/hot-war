import { describe, expect, it } from 'vitest';

import { stateHash } from '../sim/hash';
import { Random } from '../sim/random';
import { createGame } from '../sim/setup';
import type { GameSettings } from '../sim/world';
import { Lockstep, type Bundle } from './lockstep';

const settings: GameSettings = {
  mapId: 'crossroads',
  seed: 5,
  credits: 10_000,
  startingUnits: 'army',
  shortGame: true,
  crates: true,
  players: [
    { name: 'A', faction: 'accord', color: '#2f74e0', team: 0, ai: null },
    { name: 'B', faction: 'bloc', color: '#d8342c', team: 0, ai: null },
  ],
};

/** Two screens joined by a network that delivers each message after a random delay. */
function pair() {
  const random = new Random(99);
  const inbox: { at: number; to: number; from: number; bundle: Bundle }[] = [];
  let clock = 0;
  const lastSent = [-1, -1];
  const clients = [0, 1].map((local) => {
    const world = createGame(settings);
    world.local = local;
    const lockstep = new Lockstep(
      world,
      (bundle) => {
        // Round trips through JSON, as over a socket.
        const copy = JSON.parse(JSON.stringify(bundle)) as Bundle;
        lastSent[local] = Math.max(lastSent[local] ?? -1, bundle.turn);
        inbox.push({ at: clock + random.range(0, 6), to: 1 - local, from: local, bundle: copy });
      },
      local,
      2,
    );
    return { world, lockstep };
  });
  const deliver = () => {
    for (let i = inbox.length - 1; i >= 0; i--) {
      const message = inbox[i];
      if (!message || message.at > clock) continue;
      inbox.splice(i, 1);
      clients[message.to]?.lockstep.receive(message.from, message.bundle);
    }
  };
  // Each screen runs at its own uneven pace.
  const run = (frames: number, orders: (frame: number) => void) => {
    for (let frame = 0; frame < frames; frame++) {
      clock++;
      deliver();
      orders(frame);
      for (const client of clients) {
        const steps = random.int(0, 3);
        for (let i = 0; i < steps; i++) client.lockstep.advance();
      }
    }
  };
  /** Everything still on the wire arrives. */
  const flush = () => {
    clock += 1000;
    deliver();
  };
  return { clients, run, flush, lastSent };
}

describe('multiplayer lockstep', () => {
  it('two screens stay in step through a battle with orders flying', () => {
    const { clients, run, flush } = pair();
    const [a, b] = clients;
    if (!a || !b) throw new Error('no clients');
    run(4000, (frame) => {
      if (frame % 150 === 0) {
        for (const [index, client] of clients.entries()) {
          const mine = client.world.units.filter((unit) => unit.owner === index);
          const enemy = client.world.units.find((unit) => unit.owner !== index);
          if (enemy) {
            client.lockstep.queue({
              kind: 'move',
              units: mine.map((unit) => unit.id),
              x: enemy.x,
              z: enemy.z,
              attack: true,
            });
          }
          client.lockstep.queue({ kind: 'build', type: index === 0 ? 'lancer' : 'bear', count: 2 });
        }
      }
    });
    // Bring both to the same step, then compare.
    flush();
    const target = Math.max(a.world.ticks, b.world.ticks);
    expect(target).toBeGreaterThan(400);
    const hashAt = (client: typeof a) => {
      while (client.world.ticks < target && client.lockstep.advance());
      expect(client.world.ticks).toBe(target);
      return stateHash(client.world);
    };
    expect(a.lockstep.desync).toBe(false);
    expect(b.lockstep.desync).toBe(false);
    expect(hashAt(a)).toBe(hashAt(b));
    expect(a.world.units.length).toBeGreaterThan(0);
  });

  it('notices when two screens drift apart', () => {
    const { clients, run } = pair();
    const [a, b] = clients;
    if (!a || !b) throw new Error('no clients');
    run(200, () => undefined);
    const player = b.world.players[1];
    if (player) player.credits += 1;
    run(400, () => undefined);
    expect(a.lockstep.desync || b.lockstep.desync).toBe(true);
  });

  it('a player who leaves surrenders, and the other carries on', () => {
    const { clients, run, flush, lastSent } = pair();
    const [a, b] = clients;
    if (!a || !b) throw new Error('no clients');
    run(300, () => undefined);
    flush();
    const last = lastSent[1] ?? 0;
    a.lockstep.leave(1, last);
    for (let i = 0; i < 400; i++) a.lockstep.advance();
    expect(a.lockstep.turn).toBeGreaterThan(last + 1);
    expect(a.world.players[1]?.defeated).toBe(true);
  });
});
