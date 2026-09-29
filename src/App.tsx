import { useState } from 'react';

import { Lobby } from './components/Lobby';
import { MatchScreen } from './components/MatchScreen';
import { loadSetup, toSettings, type LobbySetup } from './game/lobby';
import type { GameSettings } from './sim/world';

interface Battle {
  settings: GameSettings;
  speed: number;
  /** Bumped to start the same battle again from scratch. */
  round: number;
}

/** The skirmish setup screen, then the battle. */
export function App() {
  const [setup, setSetup] = useState(loadSetup);
  const [battle, setBattle] = useState<Battle | null>(null);
  const start = (next: LobbySetup) => {
    setBattle({ settings: toSettings(next), speed: next.speed, round: 0 });
  };
  if (battle) {
    return (
      <MatchScreen
        key={battle.round}
        settings={battle.settings}
        speed={battle.speed}
        onRestart={() => {
          setBattle({ ...battle, settings: toSettings(setup), round: battle.round + 1 });
        }}
        onQuit={() => {
          setBattle(null);
        }}
      />
    );
  }
  return <Lobby setup={setup} onChange={setSetup} onStart={start} />;
}
