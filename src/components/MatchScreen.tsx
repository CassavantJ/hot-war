import { useEffect, useRef, useState, useSyncExternalStore } from 'react';

import { Audio } from '../game/audio';
import { Match, SPEEDS } from '../game/match';
import { saveProgress } from '../sim/campaign';
import type { MissionDef } from '../sim/mission';
import { FACTIONS } from '../sim/rules';
import type { GameSettings, World } from '../sim/world';
import { Briefing } from './Campaign';
import { Help } from './Help';
import styles from './Match.module.css';
import { SaveDialog } from './SaveDialog';
import { Sidebar } from './Sidebar';

interface Props {
  source: { settings: GameSettings } | { mission: MissionDef } | { world: World };
  speed: number;
  onRestart: () => void;
  /** Straight on to the next campaign mission, if there is one. */
  onNext: (() => void) | null;
  onQuit: () => void;
}

/** A battle in progress: the battlefield, the sidebar, and the menus over them. */
export function MatchScreen({ source, speed, onRestart, onNext, onQuit }: Props) {
  const [audio] = useState(() => new Audio());
  const [match] = useState(() => new Match(source, audio));
  const mission = match.mission;
  const [briefing, setBriefing] = useState(mission !== null && !('world' in source));
  const field = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const overlay = useRef<HTMLCanvasElement>(null);
  const [menu, setMenu] = useState(false);
  const [help, setHelp] = useState(false);
  const [saving, setSaving] = useState(false);
  const [gameSpeed, setGameSpeed] = useState(speed);
  const [volume, setVolume] = useState(audio.volume);
  const [music, setMusic] = useState(audio.musicVolume);
  const [voice, setVoice] = useState(audio.voice);
  useSyncExternalStore(match.subscribe, match.getVersion);

  useEffect(() => {
    const container = field.current;
    const view = canvas.current;
    const hud = overlay.current;
    if (!container || !view || !hud) return;
    match.attach(container, view, hud);
    return () => {
      match.detach();
    };
  }, [match]);

  useEffect(
    () => () => {
      audio.close();
    },
    [audio],
  );

  useEffect(() => {
    match.setMenuHandler(() => {
      setMenu(true);
    });
  }, [match]);

  useEffect(() => {
    match.setSpeed(gameSpeed);
  }, [match, gameSpeed]);

  useEffect(() => {
    audio.setVolume(volume);
    audio.setMusicVolume(music);
    audio.setVoice(voice);
  }, [audio, volume, music, voice]);

  const outcome = match.world.outcome;
  useEffect(() => {
    match.setPaused(menu || help || briefing || saving);
  }, [match, menu, help, briefing, saving]);

  useEffect(() => {
    if (mission && outcome === 'won') saveProgress(mission);
  }, [mission, outcome]);

  const me = match.world.players[match.world.local];

  return (
    <div className={styles.match} data-faction={me?.faction}>
      <div ref={field} className={styles.field}>
        <canvas ref={canvas} className={styles.canvas} />
        <canvas ref={overlay} className={styles.overlay} aria-hidden="true" />
        <ol className={styles.messages} aria-live="polite">
          {match.messages.map((message) => (
            <li key={message.id} data-tone={message.tone}>
              {message.text}
            </li>
          ))}
        </ol>
        {match.paused && !menu && !help && !briefing && <div className={styles.paused}>Paused</div>}
        {mission && match.world.mission && (
          <ol className={styles.objectives} aria-label="Objectives">
            {mission.objectives.map((objective, i) => (
              <li key={objective.text} data-status={match.world.mission?.status[i]}>
                {objective.text}
              </li>
            ))}
          </ol>
        )}
      </div>
      <Sidebar
        match={match}
        onMenu={() => {
          setMenu(true);
        }}
      />
      {menu && outcome === 'playing' && !saving && (
        <div className={styles.backdrop}>
          <div
            className={styles.dialog}
            role="dialog"
            aria-modal="true"
            aria-labelledby="menu-title"
          >
            <h2 id="menu-title" className={styles.dialogTitle}>
              Paused
            </h2>
            <div className={styles.menuButtons}>
              <button
                type="button"
                className={styles.primary}
                onClick={() => {
                  setMenu(false);
                }}
              >
                Resume
              </button>
              <button
                type="button"
                onClick={() => {
                  setSaving(true);
                }}
              >
                Save game
              </button>
              <button
                type="button"
                onClick={() => {
                  setHelp(true);
                }}
              >
                How to play
              </button>
              <button type="button" onClick={onRestart}>
                Restart battle
              </button>
              <button type="button" onClick={onQuit}>
                Quit to setup
              </button>
            </div>
            <div className={styles.settings}>
              <label>
                <span>Game speed</span>
                <select
                  value={gameSpeed}
                  onChange={(event) => {
                    setGameSpeed(Number(event.target.value));
                  }}
                >
                  {SPEEDS.map((option) => (
                    <option key={option.label} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span>Sound effects</span>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.05}
                  value={volume}
                  onChange={(event) => {
                    setVolume(Number(event.target.value));
                  }}
                />
              </label>
              <label>
                <span>Music</span>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.05}
                  value={music}
                  onChange={(event) => {
                    setMusic(Number(event.target.value));
                  }}
                />
              </label>
              <label className={styles.checkRow}>
                <input
                  type="checkbox"
                  checked={voice}
                  onChange={(event) => {
                    setVoice(event.target.checked);
                  }}
                />
                <span>Announcer voice</span>
              </label>
            </div>
          </div>
        </div>
      )}
      {saving && (
        <SaveDialog
          world={match.world}
          onClose={() => {
            setSaving(false);
          }}
        />
      )}
      {help && (
        <Help
          onClose={() => {
            setHelp(false);
          }}
        />
      )}
      {briefing && mission && (
        <div className={styles.backdrop}>
          <div
            className={styles.dialog}
            role="dialog"
            aria-modal="true"
            aria-labelledby="briefing-title"
          >
            <Briefing mission={mission} titleId="briefing-title" />
            <div className={styles.menuButtons}>
              <button
                type="button"
                className={styles.primary}
                onClick={() => {
                  audio.unlock();
                  setBriefing(false);
                }}
              >
                Begin mission
              </button>
              <button type="button" onClick={onQuit}>
                Back
              </button>
            </div>
          </div>
        </div>
      )}
      {outcome !== 'playing' && (
        <div className={styles.backdrop} data-late="">
          <div
            className={styles.dialog}
            role="dialog"
            aria-modal="true"
            aria-labelledby="end-title"
          >
            <h2 id="end-title" className={styles.endTitle} data-outcome={outcome}>
              {mission
                ? outcome === 'won'
                  ? 'Mission accomplished'
                  : 'Mission failed'
                : outcome === 'won'
                  ? 'Victory'
                  : 'Defeat'}
            </h2>
            <p className={styles.endText}>
              {mission
                ? outcome === 'won'
                  ? `${mission.title} is done.${onNext ? ' The next mission is unlocked.' : ' That’s the end of this campaign.'}`
                  : 'Regroup and try again.'
                : outcome === 'won'
                  ? 'The enemy has been wiped off the map.'
                  : 'Your base has fallen. There’s always another war.'}
            </p>
            <table className={styles.stats}>
              <thead>
                <tr>
                  <th scope="col">Player</th>
                  <th scope="col">Units built</th>
                  <th scope="col">Kills</th>
                  <th scope="col">Losses</th>
                  <th scope="col">Buildings destroyed</th>
                  <th scope="col">Ore mined</th>
                </tr>
              </thead>
              <tbody>
                {match.world.players.map((player) => (
                  <tr key={player.index}>
                    <th scope="row">
                      <span className={styles.statSwatch} style={{ background: player.color }} />
                      {player.name}
                      <small>{FACTIONS[player.faction].name}</small>
                    </th>
                    <td>{player.stats.unitsBuilt}</td>
                    <td>{player.stats.unitsKilled}</td>
                    <td>{player.stats.unitsLost}</td>
                    <td>{player.stats.structuresKilled}</td>
                    <td>${player.stats.harvested.toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className={styles.menuButtons}>
              {mission && outcome === 'won' && onNext ? (
                <button type="button" className={styles.primary} onClick={onNext}>
                  Next mission
                </button>
              ) : null}
              <button
                type="button"
                className={mission && outcome === 'won' && onNext ? undefined : styles.primary}
                onClick={onRestart}
              >
                {mission ? (outcome === 'won' ? 'Replay mission' : 'Retry mission') : 'Play again'}
              </button>
              <button type="button" onClick={onQuit}>
                Back to setup
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
