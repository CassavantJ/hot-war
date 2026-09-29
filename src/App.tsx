import { useState } from 'react';

import { Lobby } from './components/Lobby';
import { MatchScreen } from './components/MatchScreen';
import { loadSetup, toSettings, type LobbySetup } from './game/lobby';
import { campaignMissions } from './sim/campaign';
import type { MissionDef } from './sim/mission';
import type { GameSettings } from './sim/world';

type Battle =
  | { kind: 'skirmish'; settings: GameSettings; speed: number; round: number }
  | { kind: 'mission'; mission: MissionDef; speed: number; round: number };

/** The skirmish setup screen, then the battle. */
export function App() {
  const [setup, setSetup] = useState(loadSetup);
  const [battle, setBattle] = useState<Battle | null>(null);
  const [mode, setMode] = useState<'skirmish' | 'campaign'>('skirmish');
  const start = (next: LobbySetup) => {
    setBattle({ kind: 'skirmish', settings: toSettings(next), speed: next.speed, round: 0 });
  };
  const play = (mission: MissionDef) => {
    setBattle({ kind: 'mission', mission, speed: setup.speed, round: (battle?.round ?? 0) + 1 });
  };
  if (battle) {
    const next =
      battle.kind === 'mission'
        ? campaignMissions(battle.mission.campaign)[
            campaignMissions(battle.mission.campaign).indexOf(battle.mission) + 1
          ]
        : undefined;
    return (
      <MatchScreen
        key={battle.round}
        source={
          battle.kind === 'mission' ? { mission: battle.mission } : { settings: battle.settings }
        }
        speed={battle.speed}
        onRestart={() => {
          setBattle(
            battle.kind === 'mission'
              ? { ...battle, round: battle.round + 1 }
              : { ...battle, settings: toSettings(setup), round: battle.round + 1 },
          );
        }}
        onNext={
          next
            ? () => {
                play(next);
              }
            : null
        }
        onQuit={() => {
          setBattle(null);
        }}
      />
    );
  }
  return (
    <Lobby
      setup={setup}
      mode={mode}
      onMode={setMode}
      onChange={setSetup}
      onStart={start}
      onMission={play}
    />
  );
}
