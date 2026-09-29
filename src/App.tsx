import { useState } from 'react';

import { Lobby, type LobbyMode } from './components/Lobby';
import { MatchScreen } from './components/MatchScreen';
import { loadSetup, toSettings, type LobbySetup } from './game/lobby';
import { campaignMissions } from './sim/campaign';
import type { MissionDef } from './sim/mission';
import type { GameSettings, World } from './sim/world';

/** A battle to play; `saved` carries on a saved one, the first time round. */
type Battle =
  | { kind: 'skirmish'; settings: GameSettings; speed: number; round: number; saved?: World }
  | { kind: 'mission'; mission: MissionDef; speed: number; round: number; saved?: World };

/** The skirmish setup screen, then the battle. */
export function App() {
  const [setup, setSetup] = useState(loadSetup);
  const [battle, setBattle] = useState<Battle | null>(null);
  const [mode, setMode] = useState<LobbyMode>('skirmish');
  const start = (next: LobbySetup) => {
    setBattle({ kind: 'skirmish', settings: toSettings(next), speed: next.speed, round: 0 });
  };
  const play = (mission: MissionDef) => {
    setBattle({ kind: 'mission', mission, speed: setup.speed, round: (battle?.round ?? 0) + 1 });
  };
  const resume = (world: World) => {
    const round = (battle?.round ?? 0) + 1;
    const mission = world.mission?.def;
    setBattle(
      mission
        ? { kind: 'mission', mission, speed: setup.speed, round, saved: world }
        : { kind: 'skirmish', settings: world.settings, speed: setup.speed, round, saved: world },
    );
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
          battle.saved
            ? { world: battle.saved }
            : battle.kind === 'mission'
              ? { mission: battle.mission }
              : { settings: battle.settings }
        }
        speed={battle.speed}
        onRestart={() => {
          const { saved, ...rest } = battle;
          setBattle(
            rest.kind === 'mission'
              ? { ...rest, round: rest.round + 1 }
              : {
                  ...rest,
                  // A loaded skirmish restarts on its own map and players.
                  settings: saved ? saved.settings : toSettings(setup),
                  round: rest.round + 1,
                },
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
      onLoad={resume}
    />
  );
}
