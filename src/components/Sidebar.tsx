import { Building2, DollarSign, Menu, Shield, Truck, Users, Wrench } from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';

import type { Match } from '../game/match';
import type { Player } from '../sim/player';
import { available, buildList, costOf, isUnitType, nameOf, queueFor } from '../sim/production';
import {
  buildTab,
  STRUCTURES,
  UNITS,
  type BuildTab,
  type StructureType,
  type UnitType,
} from '../sim/rules';
import { SUPERWEAPONS } from '../sim/rules';
import { powerOf, superweaponsOf } from '../sim/superweapons';
import { renderIcons } from '../view/icons';
import styles from './Match.module.css';
import { Radar } from './Radar';

const TABS: { id: BuildTab; label: string; icon: typeof Building2 }[] = [
  { id: 'building', label: 'Buildings', icon: Building2 },
  { id: 'defense', label: 'Defences', icon: Shield },
  { id: 'infantry', label: 'Infantry', icon: Users },
  { id: 'vehicle', label: 'Vehicles', icon: Truck },
];

type Buildable = UnitType | StructureType;

function tabOf(type: Buildable): BuildTab {
  if (isUnitType(type)) return buildTab(UNITS[type]);
  return STRUCTURES[type].tab === 'defense' ? 'defense' : 'building';
}

interface Item {
  type: Buildable;
  state: 'idle' | 'building' | 'ready' | 'hold' | 'blocked';
  progress: number;
  count: number;
}

function items(match: Match, player: Player, tab: BuildTab): Item[] {
  const world = match.world;
  const result: Item[] = [];
  for (const type of buildList(player)) {
    if (tabOf(type) !== tab) continue;
    const queue = player.queues[queueFor(type)];
    const queued = queue.items.filter((item) => item.type === type);
    const first = queue.items[0];
    if (!available(world, player, type) && queued.length === 0 && queue.ready !== type) continue;
    let state: Item['state'] = 'idle';
    let progress = 0;
    if (queue.ready === type) {
      state = 'ready';
      progress = 1;
    } else if (first?.type === type) {
      state = first.onHold ? 'hold' : 'building';
      progress = first.progress;
    } else if (!isUnitType(type) && (queue.items.length > 0 || queue.ready)) {
      state = 'blocked';
    }
    result.push({ type, state, progress, count: queued.length });
  }
  return result;
}

const iconCache = new Map<string, Map<string, string>>();

function iconsFor(player: Player): Map<string, string> {
  const key = `${player.faction}:${player.color}`;
  let icons = iconCache.get(key);
  if (!icons) {
    icons = renderIcons(buildList(player), player.color, player.faction);
    iconCache.set(key, icons);
  }
  return icons;
}

/** Counts the credits up and down like an odometer. */
function Credits({ match }: { match: Match }) {
  const text = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    let shown = match.world.players[match.world.local]?.credits ?? 0;
    let frame = requestAnimationFrame(function tick() {
      frame = requestAnimationFrame(tick);
      const actual = match.world.players[match.world.local]?.credits ?? 0;
      const gap = actual - shown;
      shown =
        Math.abs(gap) < 1 ? actual : shown + Math.sign(gap) * Math.max(1, Math.abs(gap) * 0.12);
      if (text.current) text.current.textContent = `$${Math.floor(shown).toLocaleString()}`;
    });
    return () => {
      cancelAnimationFrame(frame);
    };
  }, [match]);
  return <span ref={text} className={styles.creditsValue} aria-live="off" />;
}

function PowerBar({ player }: { player: Player }) {
  const scale = Math.max(200, player.powerOut, player.powerUse) * 1.15;
  const level = player.powerOut / scale;
  const use = player.powerUse / scale;
  const state =
    player.powerOut === 0 && player.powerUse === 0
      ? 'none'
      : player.lowPower
        ? 'low'
        : player.powerOut < player.powerUse * 1.15
          ? 'tight'
          : 'good';
  return (
    <div
      className={styles.power}
      data-state={state}
      title={`Power ${player.powerOut} / ${player.powerUse} used`}
    >
      <span className={styles.powerFill} style={{ height: `${level * 100}%` }} />
      <span className={styles.powerUse} style={{ bottom: `${use * 100}%` }} />
    </div>
  );
}

export function Sidebar({ match, onMenu }: { match: Match; onMenu: () => void }) {
  const world = match.world;
  const player = world.players[world.local];
  const [tab, setTab] = useState(0);
  const [hover, setHover] = useState<Buildable | null>(null);
  useEffect(() => {
    match.setTabHandler((next) => {
      setTab((current) => (next === 'next' ? (current + 1) % TABS.length : next));
    });
  }, [match]);
  const icons = useMemo(() => (player ? iconsFor(player) : new Map<string, string>()), [player]);
  if (!player) return null;
  const controller = match.controller;
  const current = TABS[tab] ?? TABS[0];
  const list = current ? items(match, player, current.id) : [];
  const readyTabs = new Set(
    TABS.filter((entry) =>
      items(match, player, entry.id).some((item) => item.state === 'ready'),
    ).map((entry) => entry.id),
  );
  const mode = controller?.mode.kind ?? 'normal';
  const info = hover ?? null;

  const click = (item: Item, shift: boolean) => {
    match.audio.unlock();
    if (item.state === 'ready' && !isUnitType(item.type)) {
      controller?.startPlacement(item.type);
      match.audio.play('click');
      return;
    }
    const started = match.issue({ kind: 'build', type: item.type, count: shift ? 5 : 1 });
    match.audio.play(started === false ? 'error' : 'click');
    match.notify();
  };

  return (
    <aside className={styles.sidebar} data-faction={player.faction} aria-label="Command sidebar">
      <div className={styles.sideTop}>
        <button type="button" className={styles.menuButton} onClick={onMenu} aria-label="Menu">
          <Menu aria-hidden="true" size={16} />
          <span>Menu</span>
        </button>
      </div>
      <Radar match={match} online={player.radar} />
      <div className={styles.bank}>
        <button
          type="button"
          className={styles.modeButton}
          aria-pressed={mode === 'repair'}
          aria-label="Repair mode"
          title="Repair (Z)"
          onClick={() => {
            controller?.setMode(mode === 'repair' ? { kind: 'normal' } : { kind: 'repair' });
            match.notify();
          }}
        >
          <Wrench aria-hidden="true" size={16} />
        </button>
        <Credits match={match} />
        <button
          type="button"
          className={styles.modeButton}
          aria-pressed={mode === 'sell'}
          aria-label="Sell mode"
          title="Sell (K)"
          onClick={() => {
            controller?.setMode(mode === 'sell' ? { kind: 'normal' } : { kind: 'sell' });
            match.notify();
          }}
        >
          <DollarSign aria-hidden="true" size={16} />
        </button>
      </div>
      <Superweapons match={match} icons={icons} />
      <div className={styles.build}>
        <PowerBar player={player} />
        <div className={styles.buildMain}>
          <div className={styles.tabs} role="tablist" aria-label="Build">
            {TABS.map((entry, index) => {
              const Icon = entry.icon;
              return (
                <button
                  key={entry.id}
                  type="button"
                  role="tab"
                  aria-selected={index === tab}
                  aria-label={entry.label}
                  title={`${entry.label} (${'QWER'[index] ?? ''})`}
                  className={styles.tab}
                  data-ready={readyTabs.has(entry.id) || undefined}
                  onClick={() => {
                    setTab(index);
                  }}
                >
                  <Icon aria-hidden="true" size={18} />
                </button>
              );
            })}
          </div>
          <div className={styles.cameos} role="tabpanel">
            {list.length === 0 && (
              <p className={styles.empty}>
                {emptyText(
                  current?.id ?? 'building',
                  player,
                  match.world.mission?.def.tech?.length === 0,
                )}
              </p>
            )}
            {list.map((item) => (
              <button
                key={item.type}
                type="button"
                className={styles.cameo}
                data-state={item.state}
                aria-label={`${nameOf(item.type)}, $${costOf(item.type)}`}
                disabled={item.state === 'blocked'}
                style={{ '--progress': item.progress } as CSSProperties}
                onClick={(event) => {
                  click(item, event.shiftKey);
                }}
                onContextMenu={(event) => {
                  event.preventDefault();
                  match.issue({ kind: 'cancel', type: item.type });
                  match.audio.play('click');
                  match.notify();
                }}
                onPointerEnter={() => {
                  setHover(item.type);
                }}
                onPointerLeave={() => {
                  setHover(null);
                }}
              >
                {icons.get(item.type) ? (
                  <img src={icons.get(item.type)} alt="" draggable={false} />
                ) : (
                  <span className={styles.cameoFallback} />
                )}
                <span className={styles.cameoName}>{nameOf(item.type)}</span>
                {(item.state === 'building' || item.state === 'hold') && (
                  <span className={styles.clock} />
                )}
                {item.state === 'ready' && <span className={styles.cameoLabel}>Ready</span>}
                {item.state === 'hold' && <span className={styles.cameoLabel}>On hold</span>}
                {item.count > 1 && <span className={styles.count}>{item.count}</span>}
              </button>
            ))}
          </div>
        </div>
      </div>
      <div className={styles.info} aria-live="polite">
        {info ? (
          <Details type={info} player={player} />
        ) : (
          <p className={styles.hint}>{hint(mode)}</p>
        )}
      </div>
    </aside>
  );
}

/** A button per superweapon you own: its countdown, then click to aim it. */
function Superweapons({ match, icons }: { match: Match; icons: Map<string, string> }) {
  const world = match.world;
  const owned = superweaponsOf(world, world.local);
  if (owned.length === 0) return null;
  const aiming = match.controller?.mode.kind === 'superweapon' ? match.controller.mode.id : 0;
  return (
    <div className={styles.supers}>
      {owned.map((structure) => {
        const id = powerOf(world, structure);
        if (!id) return null;
        const def = SUPERWEAPONS[id];
        const ready = structure.superCharge >= 1 && structure.working;
        const left = Math.ceil((1 - structure.superCharge) * def.charge);
        const clock = `${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`;
        return (
          <button
            key={structure.id}
            type="button"
            className={styles.super}
            data-ready={ready || undefined}
            aria-pressed={aiming === structure.id}
            aria-label={`${def.name}: ${ready ? 'ready' : clock}`}
            title={def.prompt}
            disabled={!ready}
            style={{ '--charge': structure.superCharge } as CSSProperties}
            onClick={() => {
              match.audio.unlock();
              match.controller?.startSuperweapon(structure.id);
              match.notify();
            }}
          >
            {icons.get(structure.type) ? <img src={icons.get(structure.type)} alt="" /> : null}
            <span className={styles.superName}>{def.name}</span>
            <span className={styles.superTime}>{ready ? 'Ready' : clock}</span>
          </button>
        );
      })}
    </div>
  );
}

function Details({ type, player }: { type: Buildable; player: Player }) {
  const cost = costOf(type);
  if (isUnitType(type)) {
    const def = UNITS[type];
    return (
      <div className={styles.details}>
        <strong>{def.name}</strong>
        <span className={styles.cost}>${cost}</span>
        <p>{def.blurb}</p>
      </div>
    );
  }
  const def = STRUCTURES[type];
  const power = def.power;
  return (
    <div className={styles.details}>
      <strong>{def.name}</strong>
      <span className={styles.cost}>
        ${cost}
        {power !== 0 && (
          <span className={power > 0 ? styles.powerPlus : styles.powerMinus}>
            {power > 0 ? `+${power}` : power} power
          </span>
        )}
      </span>
      <p>{def.blurb}</p>
      {player.lowPower && power < 0 && <p className={styles.warn}>You’re short of power.</p>}
    </div>
  );
}

function hint(mode: string): string {
  if (mode === 'sell') return 'Click one of your buildings to sell it. Right-click to stop.';
  if (mode === 'repair') return 'Click a damaged building to repair it. Right-click to stop.';
  if (mode === 'place') return 'Click near your base to place it. Right-click to cancel.';
  if (mode === 'attackMove') return 'Click where to attack-move to.';
  if (mode === 'superweapon') return 'Click the map to fire. Right-click to cancel.';
  return 'Left-click a button to build; right-click to pause or cancel. Shift-click queues five.';
}

function emptyText(tab: BuildTab, player: Player, noBase: boolean): string {
  if (noBase) return 'No base this time: the army you have is all you get.';
  if (!player.has('hq')) return 'Deploy your Base Truck to start building.';
  if (tab === 'infantry') return 'Build a Barracks to train infantry.';
  if (tab === 'vehicle') return 'Build a Refinery, then a vehicle factory.';
  if (tab === 'defense') return 'Build power and Barracks to unlock defences.';
  return 'Nothing to build yet.';
}
