import { useState } from 'react';

import {
  CREDIT_OPTIONS,
  fitSeats,
  hasOpponent,
  saveSetup,
  type LobbySetup,
  type SeatSetup,
} from '../game/lobby';
import { SPEEDS } from '../game/match';
import { MAPS, mapSpec } from '../sim/maps';
import type { MissionDef } from '../sim/mission';
import type { Difficulty } from '../sim/player';
import { NATIONS, type Faction } from '../sim/rules';
import { COLORS } from '../sim/setup';
import type { StartingUnits } from '../sim/world';
import type { OnlineGame } from '../game/net';
import type { World } from '../sim/world';
import { Campaign } from './Campaign';
import { CountryNote, CountrySelect } from './CountrySelect';
import { MapPreview } from './MapPreview';
import { Help } from './Help';
import styles from './Lobby.module.css';
import { Multiplayer } from './Multiplayer';
import { SavedGames } from './SavedGames';

export type LobbyMode = 'skirmish' | 'campaign' | 'online' | 'load';

const MODES: { id: LobbyMode; label: string }[] = [
  { id: 'skirmish', label: 'Skirmish' },
  { id: 'campaign', label: 'Campaign' },
  { id: 'online', label: 'Multiplayer' },
  { id: 'load', label: 'Load game' },
];

interface Props {
  setup: LobbySetup;
  mode: LobbyMode;
  onMode: (mode: LobbyMode) => void;
  onChange: (setup: LobbySetup) => void;
  onStart: (setup: LobbySetup) => void;
  onMission: (mission: MissionDef) => void;
  onLoad: (world: World) => void;
  onOnline: (game: OnlineGame) => void;
}

const STARTING: { value: StartingUnits; label: string }[] = [
  { value: 'none', label: 'Base truck only' },
  { value: 'squad', label: 'Small squad' },
  { value: 'army', label: 'Army' },
];

const DIFFICULTIES: Difficulty[] = ['easy', 'normal', 'hard'];

/** Skirmish setup: map, players and options. */
export function Lobby({
  setup,
  mode,
  onMode,
  onChange,
  onStart,
  onMission,
  onLoad,
  onOnline,
}: Props) {
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
    update({
      ...setup,
      seats: [...setup.seats, { faction, nation: 'random', color, team: 0, ai: 'normal' }],
    });
  };
  const ready = hasOpponent(setup);
  return (
    <main className={styles.lobby}>
      <header className={styles.masthead}>
        <h1 className={styles.logo}>
          Hot <span>War</span>
        </h1>
        <p className={styles.tagline}>The Cold War has gone hot</p>
      </header>
      <div className={styles.modeTabs} role="tablist" aria-label="Game mode">
        {MODES.map((option) => (
          <button
            key={option.id}
            type="button"
            role="tab"
            aria-selected={mode === option.id}
            className={styles.modeTab}
            onClick={() => {
              onMode(option.id);
            }}
          >
            {option.label}
          </button>
        ))}
      </div>
      {mode === 'campaign' ? (
        <Campaign onMission={onMission} />
      ) : mode === 'load' ? (
        <SavedGames onLoad={onLoad} />
      ) : mode === 'online' ? (
        <Multiplayer onStart={onOnline} />
      ) : (
        <div className={styles.columns}>
          <section className={styles.panel} aria-labelledby="maps-heading">
            <h2 id="maps-heading" className={styles.heading}>
              Battlefield
            </h2>
            <ul className={styles.maps}>
              {MAPS.filter((map) => !map.campaign).map((map) => (
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
                  <CountrySelect
                    value={current.nation}
                    onChange={(nation) => {
                      seat(
                        index,
                        nation === 'random'
                          ? { nation }
                          : { nation, faction: NATIONS[nation].faction },
                      );
                    }}
                  />
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
            <CountryNote value={setup.seats[0]?.nation ?? 'america'} />
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
              <label className={styles.check}>
                <input
                  type="checkbox"
                  checked={setup.superweapons}
                  onChange={(event) => {
                    update({ ...setup, superweapons: event.target.checked });
                  }}
                />
                <span>Superweapons</span>
              </label>
            </div>
          </section>
        </div>
      )}
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
        {mode === 'skirmish' && !ready && (
          <p className={styles.warning}>Put at least one computer on another team.</p>
        )}
        {mode === 'skirmish' && (
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
        )}
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
