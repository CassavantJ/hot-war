import { Lock } from 'lucide-react';
import { useState } from 'react';

import { campaignMissions, loadProgress } from '../sim/campaign';
import type { MissionDef } from '../sim/mission';
import { FACTIONS } from '../sim/rules';
import styles from './Lobby.module.css';
import briefingStyles from './Match.module.css';

/** A mission's briefing: where, what's going on, and what to do. */
export function Briefing({ mission, titleId }: { mission: MissionDef; titleId: string }) {
  return (
    <>
      <h2 id={titleId} className={briefingStyles.dialogTitle}>
        {mission.title}
      </h2>
      <p className={briefingStyles.location}>{mission.location}</p>
      <div className={briefingStyles.briefingText}>
        {mission.briefing.map((paragraph) => (
          <p key={paragraph}>{paragraph}</p>
        ))}
      </div>
      <ul className={briefingStyles.goals}>
        {mission.objectives.map((objective) => (
          <li key={objective.text}>{objective.text}</li>
        ))}
      </ul>
    </>
  );
}

/** Both campaigns' missions; each unlocks when the one before it is won. */
export function Campaign({ onMission }: { onMission: (mission: MissionDef) => void }) {
  const [progress] = useState(loadProgress);
  const [selected, setSelected] = useState<MissionDef | null>(
    () => campaignMissions('accord')[Math.min(progress.accord, 2)] ?? null,
  );
  return (
    <div className={styles.columns}>
      <section className={styles.panel} aria-labelledby="campaigns-heading">
        <h2 id="campaigns-heading" className={styles.heading}>
          Campaigns
        </h2>
        {(['accord', 'bloc'] as const).map((faction) => (
          <div key={faction} className={styles.campaign}>
            <h3 className={styles.campaignName} data-faction={faction}>
              {FACTIONS[faction].name}
            </h3>
            <ol className={styles.maps}>
              {campaignMissions(faction).map((mission, index) => {
                const locked = index > progress[faction];
                const done = index < progress[faction];
                return (
                  <li key={mission.id}>
                    <button
                      type="button"
                      className={styles.map}
                      aria-pressed={selected?.id === mission.id}
                      disabled={locked}
                      onClick={() => {
                        setSelected(mission);
                      }}
                    >
                      <strong>
                        {index + 1}. {mission.title}
                      </strong>
                      <small>
                        {locked ? (
                          <Lock aria-label="Locked" size={14} />
                        ) : done ? (
                          'Complete'
                        ) : (
                          'Ready'
                        )}
                      </small>
                    </button>
                  </li>
                );
              })}
            </ol>
          </div>
        ))}
      </section>
      <section className={styles.panel} aria-live="polite">
        {selected ? (
          <>
            <Briefing mission={selected} titleId="mission-title" />
            <button
              type="button"
              className={styles.start}
              onClick={() => {
                onMission(selected);
              }}
            >
              Start mission
            </button>
          </>
        ) : (
          <p className={styles.blurb}>Pick a mission.</p>
        )}
      </section>
    </div>
  );
}
