import { useEffect, useRef, useState } from 'react';

import {
  CREDIT_OPTIONS,
  fitSeats,
  hasOpponent,
  saveSetup,
  type LobbySetup,
  type SeatSetup,
} from '../game/lobby';
import { SPEEDS } from '../game/match';
import { buildMap, MAPS, mapSpec } from '../sim/maps';
import type { Difficulty } from '../sim/player';
import { FACTIONS, type Faction } from '../sim/rules';
import { COLORS } from '../sim/setup';
import type { StartingUnits } from '../sim/world';
import { drawPreview } from '../view/minimap';
import { Help } from './Help';
import styles from './Lobby.module.css';

interface Props {
  setup: LobbySetup;
  onChange: (setup: LobbySetup) => void;
  onStart: (setup: LobbySetup) => void;
}

const STARTING: { value: StartingUnits; label: string }[] = [
  { value: 'none', label: 'Base truck only' },
  { value: 'squad', label: 'Small squad' },
  { value: 'army', label: 'Army' },
];

const DIFFICULTIES: Difficulty[] = ['easy', 'normal', 'hard'];

function MapPreview({ mapId }: { mapId: string }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const element = canvas.current;
    if (!element) return;
    const built = buildMap(mapSpec(mapId));
    drawPreview(element, built.map, built.neutrals);
  }, [mapId]);
  return (
    <canvas ref={canvas} className={styles.preview} width={320} height={200} aria-hidden="true" />
  );
}

/** Skirmish setup: map, players and options. */
export function Lobby({ setup, onChange, onStart }: Props) {
  const [helpOpen, setHelpOpen] = useState(false);
  const spec = mapSpec(setup.mapId);
  const update = (next: LobbySetup) => {
    const fitted = fitSeats(next);
    saveSetup(fitted);
    onChange(fitted);
  };
  const seat = (index: number, change: Partial<SeatSetup>) => {
    update({
      ...setup,
      seats: setup.seats.map((current, i) => (i === index ? { ...current, ...change } : current)),
    });
  };
  const usedColors = new Set(setup.seats.map((current) => current.color));
  const addOpponent = () => {
    const color = COLORS.find((option) => !usedColors.has(option.value))?.value ?? COLORS[0].value;
    const faction: Faction = setup.seats.length % 2 === 0 ? 'accord' : 'bloc';
    update({ ...setup, seats: [...setup.seats, { faction, color, team: 0, ai: 'normal' }] });
  };
  const ready = hasOpponent(setup);
  return (
    <main className={styles.lobby}>
      <header className={styles.masthead}>
        <h1 className={styles.logo}>
          Hot <span>War</span>
        </h1>
        <p className={styles.tagline}>Skirmish · the Cold War has gone hot</p>
      </header>
      <div className={styles.columns}>
        <section className={styles.panel} aria-labelledby="maps-heading">
          <h2 id="maps-heading" className={styles.heading}>
            Battlefield
          </h2>
          <ul className={styles.maps}>
            {MAPS.map((map) => (
              <li key={map.id}>
                <button
                  type="button"
                  className={styles.map}
                  aria-pressed={map.id === setup.mapId}
                  onClick={() => {
                    update({ ...setup, mapId: map.id });
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
          <MapPreview mapId={setup.mapId} />
          <p className={styles.blurb}>{spec.blurb}</p>
        </section>
        <section className={styles.panel} aria-labelledby="players-heading">
          <h2 id="players-heading" className={styles.heading}>
            Players
          </h2>
          <div className={styles.seats}>
            {setup.seats.map((current, index) => (
              <div key={index} className={styles.seat} data-faction={current.faction}>
                <span className={styles.swatch} style={{ background: current.color }} />
                {current.ai === null ? (
                  <span className={styles.you}>You</span>
                ) : (
                  <label className={styles.field}>
                    <span className="sr-only">Computer {index} difficulty</span>
                    <select
                      value={current.ai}
                      onChange={(event) => {
                        seat(index, { ai: event.target.value as Difficulty });
                      }}
                    >
                      {DIFFICULTIES.map((difficulty) => (
                        <option key={difficulty} value={difficulty}>
                          Computer ({difficulty[0]?.toUpperCase()}
                          {difficulty.slice(1)})
                        </option>
                      ))}
                    </select>
                  </label>
                )}
                <label className={styles.field}>
                  <span className="sr-only">Faction</span>
                  <select
                    value={current.faction}
                    onChange={(event) => {
                      seat(index, { faction: event.target.value as Faction });
                    }}
                  >
                    {(Object.keys(FACTIONS) as Faction[]).map((faction) => (
                      <option key={faction} value={faction}>
                        {FACTIONS[faction].name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className={styles.field}>
                  <span className="sr-only">Colour</span>
                  <select
                    value={current.color}
                    onChange={(event) => {
                      seat(index, { color: event.target.value });
                    }}
                  >
                    {COLORS.map((option) => (
                      <option
                        key={option.id}
                        value={option.value}
                        disabled={option.value !== current.color && usedColors.has(option.value)}
                      >
                        {option.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className={styles.field}>
                  <span className="sr-only">Team</span>
                  <select
                    value={current.team}
                    onChange={(event) => {
                      seat(index, { team: Number(event.target.value) });
                    }}
                  >
                    <option value={0}>No team</option>
                    {[1, 2, 3, 4].map((team) => (
                      <option key={team} value={team}>
                        Team {team}
                      </option>
                    ))}
                  </select>
                </label>
                {index > 0 && setup.seats.length > 2 ? (
                  <button
                    type="button"
                    className={styles.remove}
                    aria-label={`Remove computer ${index}`}
                    onClick={() => {
                      update({ ...setup, seats: setup.seats.filter((_, i) => i !== index) });
                    }}
                  >
                    ×
                  </button>
                ) : (
                  <span className={styles.removeSpacer} />
                )}
              </div>
            ))}
          </div>
          {setup.seats.length < spec.players && (
            <button type="button" className={styles.add} onClick={addOpponent}>
              + Add a computer player
            </button>
          )}
          <p className={styles.factionNote}>
            <strong>{FACTIONS[setup.seats[0]?.faction ?? 'accord'].name}:</strong>{' '}
            {FACTIONS[setup.seats[0]?.faction ?? 'accord'].blurb}
          </p>
          <h2 className={styles.heading}>Options</h2>
          <div className={styles.options}>
            <label className={styles.option}>
              <span>Starting credits</span>
              <select
                value={setup.credits}
                onChange={(event) => {
                  update({ ...setup, credits: Number(event.target.value) });
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
                  update({ ...setup, startingUnits: event.target.value as StartingUnits });
                }}
              >
                {STARTING.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <label className={styles.option}>
              <span>Game speed</span>
              <select
                value={setup.speed}
                onChange={(event) => {
                  update({ ...setup, speed: Number(event.target.value) });
                }}
              >
                {SPEEDS.map((speed) => (
                  <option key={speed.label} value={speed.value}>
                    {speed.label}
                  </option>
                ))}
              </select>
            </label>
            <label className={styles.check}>
              <input
                type="checkbox"
                checked={setup.shortGame}
                onChange={(event) => {
                  update({ ...setup, shortGame: event.target.checked });
                }}
              />
              <span>Short game (destroy their buildings to win)</span>
            </label>
            <label className={styles.check}>
              <input
                type="checkbox"
                checked={setup.crates}
                onChange={(event) => {
                  update({ ...setup, crates: event.target.checked });
                }}
              />
              <span>Supply crates</span>
            </label>
          </div>
        </section>
      </div>
      <footer className={styles.footer}>
        <button
          type="button"
          className={styles.helpButton}
          onClick={() => {
            setHelpOpen(true);
          }}
        >
          How to play
        </button>
        {!ready && <p className={styles.warning}>Put at least one computer on another team.</p>}
        <button
          type="button"
          className={styles.start}
          disabled={!ready}
          onClick={() => {
            onStart(setup);
          }}
        >
          Start battle
        </button>
      </footer>
      {helpOpen && (
        <Help
          onClose={() => {
            setHelpOpen(false);
          }}
        />
      )}
    </main>
  );
}
