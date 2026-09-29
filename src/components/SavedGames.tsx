import { useState } from 'react';

import { clock, deleteSave, listSaves, loadGame, SLOTS, type SaveInfo } from '../game/saves';
import type { World } from '../sim/world';
import styles from './Lobby.module.css';

function when(savedAt: number): string {
  return new Date(savedAt).toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

/** The save slots: load a battle back up, or clear a slot. */
export function SavedGames({ onLoad }: { onLoad: (world: World) => void }) {
  const [saves, setSaves] = useState(listSaves);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const bySlot = new Map<number, SaveInfo>(saves.map((info) => [info.slot, info]));
  return (
    <section className={styles.panel} aria-labelledby="saves-heading" data-narrow="">
      <h2 id="saves-heading" className={styles.heading}>
        Saved games
      </h2>
      <ol className={styles.saves}>
        {Array.from({ length: SLOTS }, (_, slot) => {
          const info = bySlot.get(slot);
          return (
            <li key={slot} className={styles.save}>
              <div>
                <strong>
                  Slot {slot + 1}
                  {info ? `: ${info.title}` : ''}
                </strong>
                <small>
                  {info
                    ? `${clock(info.time)} into the battle, saved ${when(info.savedAt)}`
                    : 'Empty'}
                </small>
              </div>
              {info && (
                <div className={styles.saveButtons}>
                  <button
                    type="button"
                    className={styles.start}
                    disabled={busy}
                    onClick={() => {
                      setBusy(true);
                      setError('');
                      loadGame(slot)
                        .then(onLoad)
                        .catch((problem: unknown) => {
                          setError(
                            problem instanceof Error ? problem.message : 'That save won’t load.',
                          );
                          setBusy(false);
                        });
                    }}
                  >
                    Load
                  </button>
                  <button
                    type="button"
                    className={styles.small}
                    disabled={busy}
                    aria-label={`Delete slot ${String(slot + 1)}`}
                    onClick={() => {
                      deleteSave(slot);
                      setSaves(listSaves());
                    }}
                  >
                    Delete
                  </button>
                </div>
              )}
            </li>
          );
        })}
      </ol>
      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}
      <p className={styles.blurb}>
        Save from the pause menu during a battle. Saves stay in this browser.
      </p>
    </section>
  );
}
