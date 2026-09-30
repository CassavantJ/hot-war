import { Copy } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

import { CREDIT_OPTIONS } from '../game/lobby';
import {
  cleanCode,
  DEFAULT_ONLINE,
  Net,
  newRoomCode,
  type OnlineGame,
  type OnlineSetup,
} from '../game/net';
import { MAPS, mapSpec } from '../sim/maps';
import { NATIONS } from '../sim/rules';
import { COLORS } from '../sim/setup';
import type { StartingUnits } from '../sim/world';
import { CountryNote, CountrySelect } from './CountrySelect';
import styles from './Lobby.module.css';
import { MapPreview } from './MapPreview';

const NAME_KEY = 'hotwar.name';

function loadName(): string {
  try {
    return localStorage.getItem(NAME_KEY) ?? '';
  } catch {
    return '';
  }
}

function saveName(name: string): void {
  try {
    localStorage.setItem(NAME_KEY, name);
  } catch {
    // Not remembered in private browsing.
  }
}

const STARTING: { value: StartingUnits; label: string }[] = [
  { value: 'none', label: 'Base truck only' },
  { value: 'squad', label: 'Small squad' },
  { value: 'army', label: 'Army' },
];

/** Play people over the internet: host a room and share its code, or join one. */
export function Multiplayer({ onStart }: { onStart: (game: OnlineGame) => void }) {
  const [name, setName] = useState(loadName);
  const [code, setCode] = useState('');
  const [net, setNet] = useState<Net | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  const [, setVersion] = useState(0);
  const started = useRef(false);

  // Leaving this screen before the battle starts leaves the room.
  useEffect(
    () => () => {
      if (net && !started.current) net.close();
    },
    [net],
  );

  const connect = (room: string) => {
    const player = name.trim() || 'Commander';
    saveName(player);
    setBusy(true);
    setError('');
    Net.open(room, player)
      .then((opened) => {
        opened.onChange = () => {
          setVersion((version) => version + 1);
        };
        opened.onStart = (game) => {
          started.current = true;
          onStart(game);
        };
        setNet(opened);
        setBusy(false);
      })
      .catch((problem: unknown) => {
        setError(problem instanceof Error ? problem.message : 'Couldn’t connect.');
        setBusy(false);
      });
  };

  if (!net) {
    return (
      <section className={styles.panel} aria-labelledby="online-heading" data-narrow="">
        <h2 id="online-heading" className={styles.heading}>
          Multiplayer
        </h2>
        <p className={styles.blurb}>
          Play up to three friends over the internet. One of you hosts and shares the room code;
          everyone else joins with it.
        </p>
        <label className={styles.option}>
          <span>Your name</span>
          <input
            type="text"
            value={name}
            maxLength={16}
            autoComplete="nickname"
            onChange={(event) => {
              setName(event.target.value);
            }}
          />
        </label>
        <div className={styles.onlineActions}>
          <button
            type="button"
            className={styles.start}
            disabled={busy}
            onClick={() => {
              connect(newRoomCode());
            }}
          >
            Host a game
          </button>
          <form
            className={styles.join}
            onSubmit={(event) => {
              event.preventDefault();
              if (code.length === 5) connect(code);
            }}
          >
            <label className={styles.option}>
              <span>Room code</span>
              <input
                type="text"
                value={code}
                placeholder="ABCDE"
                autoCapitalize="characters"
                autoComplete="off"
                spellCheck={false}
                onChange={(event) => {
                  setCode(cleanCode(event.target.value));
                }}
              />
            </label>
            <button type="submit" className={styles.small} disabled={busy || code.length !== 5}>
              Join
            </button>
          </form>
        </div>
        {busy && <p className={styles.blurb}>Connecting…</p>}
        {error && (
          <p className={styles.error} role="alert">
            {error}
          </p>
        )}
      </section>
    );
  }

  const lobby = net.lobby;
  const setup: OnlineSetup = lobby?.setup ?? DEFAULT_ONLINE;
  const members = lobby?.members ?? [];
  const me = members.find((member) => member.seat === net.seat);
  const host = net.isHost;
  const spec = mapSpec(setup.mapId);
  const tooMany = members.length > spec.players;
  const change = (next: Partial<OnlineSetup>) => {
    net.setSetup({ ...setup, ...next });
  };
  const leave = () => {
    net.close();
    setNet(null);
  };
  const usedColors = new Set(members.map((member) => member.color));

  return (
    <div className={styles.columns}>
      <section className={styles.panel} aria-labelledby="room-heading">
        <h2 id="room-heading" className={styles.heading}>
          Room
        </h2>
        <div className={styles.roomCode}>
          <strong aria-label={`Room code ${net.code.split('').join(' ')}`}>{net.code}</strong>
          <button
            type="button"
            className={styles.small}
            onClick={() => {
              void navigator.clipboard
                .writeText(net.code)
                .then(() => {
                  setCopied(true);
                })
                .catch(() => undefined);
            }}
          >
            <Copy aria-hidden="true" size={14} /> {copied ? 'Copied' : 'Copy'}
          </button>
        </div>
        <p className={styles.blurb}>
          {host
            ? 'Share this code. Start when everyone’s in.'
            : 'Waiting for the host to start the battle.'}
        </p>
        <h2 className={styles.heading}>Players</h2>
        <div className={styles.seats}>
          {members.map((member) => (
            <div
              key={member.seat}
              className={`${styles.seat} ${styles.onlineSeat}`}
              data-faction={member.faction}
            >
              <span className={styles.swatch} style={{ background: member.color }} />
              <span className={styles.you}>
                {member.name}
                {member.seat === lobby?.host ? ' (host)' : ''}
                {member.seat === net.seat ? ' (you)' : ''}
              </span>
              {member.seat === net.seat && me ? (
                <>
                  <CountrySelect
                    value={me.nation}
                    onChange={(nation) => {
                      net.setSeat(nation, me.color);
                    }}
                  />
                  <label className={styles.field}>
                    <span className="sr-only">Colour</span>
                    <select
                      value={me.color}
                      onChange={(event) => {
                        net.setSeat(me.nation, event.target.value);
                      }}
                    >
                      {COLORS.map((option) => (
                        <option
                          key={option.id}
                          value={option.value}
                          disabled={option.value !== me.color && usedColors.has(option.value)}
                        >
                          {option.name}
                        </option>
                      ))}
                    </select>
                  </label>
                </>
              ) : (
                <span className={styles.memberFaction}>
                  {member.nation === 'random' ? 'Random' : NATIONS[member.nation].name}
                </span>
              )}
            </div>
          ))}
        </div>
        {me && <CountryNote value={me.nation} />}
        {net.closed && (
          <p className={styles.error} role="alert">
            {net.closed}
          </p>
        )}
        <div className={styles.onlineActions}>
          {host && (
            <button
              type="button"
              className={styles.start}
              disabled={members.length < 2 || tooMany || net.closed !== null}
              onClick={() => {
                net.start();
              }}
            >
              Start battle
            </button>
          )}
          <button type="button" className={styles.small} onClick={leave}>
            Leave room
          </button>
        </div>
        {host && members.length < 2 && (
          <p className={styles.blurb}>You need at least one other player.</p>
        )}
        {tooMany && (
          <p className={styles.warning}>
            {spec.name} is for {spec.players} players. Pick a bigger map.
          </p>
        )}
      </section>
      <section className={styles.panel} aria-labelledby="online-map-heading">
        <h2 id="online-map-heading" className={styles.heading}>
          Battlefield
        </h2>
        {host ? (
          <ul className={styles.maps}>
            {MAPS.filter((map) => !map.campaign).map((map) => (
              <li key={map.id}>
                <button
                  type="button"
                  className={styles.map}
                  aria-pressed={map.id === setup.mapId}
                  disabled={map.players < members.length}
                  onClick={() => {
                    change({ mapId: map.id });
                  }}
                >
                  <strong>{map.name}</strong>
                  <small>
                    {map.players} players · {map.width}×{map.height}
                  </small>
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className={styles.blurb}>
            <strong>{spec.name}</strong>, {spec.players} players
          </p>
        )}
        <MapPreview mapId={setup.mapId} />
        <h2 className={styles.heading}>Options</h2>
        <fieldset className={styles.options} disabled={!host}>
          <legend className="sr-only">Battle options (the host sets these)</legend>
          <label className={styles.option}>
            <span>Starting credits</span>
            <select
              value={setup.credits}
              onChange={(event) => {
                change({ credits: Number(event.target.value) });
              }}
            >
              {CREDIT_OPTIONS.map((credits) => (
                <option key={credits} value={credits}>
                  ${credits.toLocaleString()}
                </option>
              ))}
            </select>
          </label>
          <label className={styles.option}>
            <span>Starting units</span>
            <select
              value={setup.startingUnits}
              onChange={(event) => {
                change({ startingUnits: event.target.value as StartingUnits });
              }}
            >
              {STARTING.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label className={styles.check}>
            <input
              type="checkbox"
              checked={setup.shortGame}
              onChange={(event) => {
                change({ shortGame: event.target.checked });
              }}
            />
            <span>Short game (destroy their buildings to win)</span>
          </label>
          <label className={styles.check}>
            <input
              type="checkbox"
              checked={setup.crates}
              onChange={(event) => {
                change({ crates: event.target.checked });
              }}
            />
            <span>Supply crates</span>
          </label>
          <label className={styles.check}>
            <input
              type="checkbox"
              checked={setup.superweapons}
              onChange={(event) => {
                change({ superweapons: event.target.checked });
              }}
            />
            <span>Superweapons</span>
          </label>
        </fieldset>
      </section>
    </div>
  );
}
