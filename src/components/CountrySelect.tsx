import type { NationChoice } from '../game/lobby';
import { FACTIONS, NATIONS, nationsOf, type Faction } from '../sim/rules';
import styles from './Lobby.module.css';

/** Pick a country (grouped by side), or leave it to chance. */
export function CountrySelect({
  value,
  onChange,
  label = 'Country',
}: {
  value: NationChoice;
  onChange: (value: NationChoice) => void;
  label?: string;
}) {
  return (
    <label className={styles.field}>
      <span className="sr-only">{label}</span>
      <select
        value={value}
        onChange={(event) => {
          const next = event.target.value;
          onChange(next === 'random' || next in NATIONS ? (next as NationChoice) : 'random');
        }}
      >
        <option value="random">Random</option>
        {(Object.keys(FACTIONS) as Faction[]).map((faction) => (
          <optgroup key={faction} label={FACTIONS[faction].name}>
            {nationsOf(faction).map((nation) => (
              <option key={nation} value={nation}>
                {NATIONS[nation].name}
              </option>
            ))}
          </optgroup>
        ))}
      </select>
    </label>
  );
}

/** "America (The Accord): Airborne Drop. …" for a choice. */
export function CountryNote({ value }: { value: NationChoice }) {
  if (value === 'random') {
    return (
      <p className={styles.factionNote}>
        <strong>Random:</strong> a country is picked for you when the battle starts.
      </p>
    );
  }
  const nation = NATIONS[value];
  return (
    <p className={styles.factionNote}>
      <strong>
        {nation.name} ({FACTIONS[nation.faction].name}), {nation.special}:
      </strong>{' '}
      {nation.blurb}
    </p>
  );
}
