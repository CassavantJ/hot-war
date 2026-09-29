import { useState } from 'react';

import { clock, listSaves, saveGame, SLOTS, type SaveInfo } from '../game/saves';
import type { World } from '../sim/world';
import styles from './Match.module.css';

/** Pick a slot to save the battle in; a filled slot is overwritten. */
export function SaveDialog({ world, onClose }: { world: World; onClose: () => void }) {
  const [saves, setSaves] = useState(listSaves);
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);
  const bySlot = new Map<number, SaveInfo>(saves.map((info) => [info.slot, info]));
  return (
    <div className={styles.backdrop}>
      <div className={styles.dialog} role="dialog" aria-modal="true" aria-labelledby="save-title">
        <h2 id="save-title" className={styles.dialogTitle}>
          Save game
        </h2>
        <div className={styles.menuButtons}>
          {Array.from({ length: SLOTS }, (_, slot) => {
            const info = bySlot.get(slot);
            return (
              <button
                key={slot}
                type="button"
                disabled={busy}
                className={styles.slot}
                onClick={() => {
                  setBusy(true);
                  setStatus('Saving…');
                  saveGame(slot, world)
                    .then(() => {
                      setSaves(listSaves());
                      setStatus(`Saved in slot ${String(slot + 1)}.`);
                    })
                    .catch((problem: unknown) => {
                      setStatus(problem instanceof Error ? problem.message : 'Couldn’t save.');
                    })
                    .finally(() => {
                      setBusy(false);
                    });
                }}
              >
                <strong>Slot {slot + 1}</strong>
                <small>{info ? `${info.title}, ${clock(info.time)} (overwrite)` : 'Empty'}</small>
              </button>
            );
          })}
          <button type="button" className={styles.primary} onClick={onClose}>
            Back
          </button>
        </div>
        <p className={styles.saveStatus} role="status">
          {status}
        </p>
      </div>
    </div>
  );
}
