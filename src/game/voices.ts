import type { Faction, UnitType } from '../sim/rules';

/**
 * What units say when you select them or give them an order, spoken with the browser's own
 * speech voices: each kind of unit has its own lines, and each side its own pitch and pace.
 */

export type ReplyKind = 'select' | 'move' | 'attack';

type Lines = Record<ReplyKind, string[]>;

type Group =
  | 'infantry'
  | 'engineer'
  | 'jumper'
  | 'commando'
  | 'torch'
  | 'armour'
  | 'artillery'
  | 'harvester'
  | 'basetruck'
  | 'jet'
  | 'airship'
  | 'ship'
  | 'sub'
  | 'hover'
  | 'dog';

const GROUP: Record<UnitType, Group> = {
  rifleman: 'infantry',
  draftee: 'infantry',
  flakgunner: 'infantry',
  engineer: 'engineer',
  hound: 'dog',
  skyjumper: 'jumper',
  commando: 'commando',
  torch: 'torch',
  lancer: 'armour',
  bear: 'armour',
  behemoth: 'armour',
  beamtank: 'armour',
  flaktruck: 'armour',
  striker: 'artillery',
  rockettruck: 'artillery',
  oretruck: 'harvester',
  orehauler: 'harvester',
  basetruck: 'basetruck',
  falcon: 'jet',
  dirigible: 'airship',
  frigate: 'ship',
  cruiser: 'ship',
  monitor: 'ship',
  flakboat: 'ship',
  missileship: 'ship',
  sub: 'sub',
  hovercraft: 'hover',
};

/** Lines each side's soldiers use; the Bloc's are blunter. */
const LINES: Record<Faction, Record<Exclude<Group, 'dog'>, Lines>> = {
  accord: {
    infantry: {
      select: ['Rifles ready.', 'Squad standing by.', 'Go ahead, command.', 'Listening.'],
      move: ['On our way.', 'Moving up.', 'Double time.', 'Copy that.'],
      attack: ['Engaging!', 'Weapons free!', 'Taking the shot.', 'Contact!'],
    },
    engineer: {
      select: ['Engineer here.', 'Tools ready.'],
      move: ['Heading over.', 'On my way.'],
      attack: ['I can work with that.', 'Leave it to me.'],
    },
    jumper: {
      select: ['Jump pack charged.', 'Skyjumper, ready.'],
      move: ['Lifting off.', 'Up and over.'],
      attack: ['Diving in!', 'Strafing run!'],
    },
    commando: {
      select: ['Talk to me.', 'Who needs sorting out?', 'I’m listening.'],
      move: ['Got it.', 'Easy.', 'On the quiet.'],
      attack: ['Watch this.', 'Lights out.', 'Nothing personal.'],
    },
    torch: {
      select: ['Tanks are full.', 'Ready to burn.'],
      move: ['Coming through.', 'Marching.'],
      attack: ['Burn it down!', 'Fire and flame!'],
    },
    armour: {
      select: ['Armour standing by.', 'Engines hot.', 'Crew ready.', 'Tank here.'],
      move: ['Rolling.', 'On the move.', 'Heading out.', 'Moving, moving.'],
      attack: ['Target locked.', 'Firing!', 'Hit it!', 'Round away!'],
    },
    artillery: {
      select: ['Launchers loaded.', 'Fire support ready.'],
      move: ['Relocating.', 'Changing position.'],
      attack: ['Ranging in.', 'Salvo away!'],
    },
    harvester: {
      select: ['Harvester.', 'Ready to mine.'],
      move: ['Rerouting.', 'Heading there.'],
      attack: ['I’m not armed!', 'That’s not my job.'],
    },
    basetruck: {
      select: ['Base truck ready.', 'Where do we set up?'],
      move: ['Moving the base.', 'Rolling out.'],
      attack: ['I’m just a truck!', 'Not a chance.'],
    },
    jet: {
      select: ['Falcon on station.', 'Pilot here.', 'Wings level.'],
      move: ['Vectoring.', 'Changing course.'],
      attack: ['Weapons hot.', 'Beginning my run!', 'Missiles away!'],
    },
    airship: {
      select: ['Airship holding.', 'Gondola ready.'],
      move: ['Changing heading.', 'Slow and steady.'],
      attack: ['Bombs away!', 'Opening the bay.'],
    },
    ship: {
      select: ['Bridge here.', 'All hands ready.', 'Captain speaking.'],
      move: ['Full ahead.', 'Setting course.', 'Aye.'],
      attack: ['Guns, fire!', 'Engaging target.', 'Broadside!'],
    },
    sub: {
      select: ['Running silent.', 'Periscope depth.'],
      move: ['Diving.', 'Changing depth.'],
      attack: ['Torpedo away!', 'Fire one!'],
    },
    hover: {
      select: ['Hover transport.', 'Skirt’s up.'],
      move: ['Skimming over.', 'Heading out.'],
      attack: ['We’re a transport!', 'Can’t do that.'],
    },
  },
  bloc: {
    infantry: {
      select: ['Draftee here.', 'Orders?', 'For the Bloc.', 'Awaiting orders.'],
      move: ['We march.', 'Forward.', 'At once.', 'Moving.'],
      attack: ['Attack!', 'Crush them!', 'Fire!', 'For the Bloc!'],
    },
    engineer: {
      select: ['Engineer.', 'I have my tools.'],
      move: ['Going.', 'I go.'],
      attack: ['I will take it.', 'It will be ours.'],
    },
    jumper: {
      select: ['Pack is ready.'],
      move: ['Up.'],
      attack: ['Attack from above!'],
    },
    commando: {
      select: ['Speak.', 'Yes?'],
      move: ['It is done.'],
      attack: ['They will not see me.'],
    },
    torch: {
      select: ['Torch Trooper.', 'Fuel is full.', 'Warm day.'],
      move: ['Marching.', 'Make way.'],
      attack: ['Burn!', 'Into the fire!', 'Nothing will be left!'],
    },
    armour: {
      select: ['Heavy armour.', 'Treads turning.', 'Tank crew here.', 'Steel is ready.'],
      move: ['Rolling forward.', 'Nothing stops us.', 'Advance.', 'Moving.'],
      attack: ['Destroy them!', 'Main gun, fire!', 'Flatten it!', 'Smash it!'],
    },
    artillery: {
      select: ['Rockets loaded.', 'Battery ready.'],
      move: ['Moving the battery.', 'New position.'],
      attack: ['Rockets away!', 'Saturate the area!'],
    },
    harvester: {
      select: ['Ore Hauler.', 'Ready to haul.'],
      move: ['Going.', 'New route.'],
      attack: ['I only haul ore!', 'No guns here.'],
    },
    basetruck: {
      select: ['Base truck.', 'Where do we build?'],
      move: ['Moving the base.', 'Rolling.'],
      attack: ['No weapons!', 'Impossible.'],
    },
    jet: {
      select: ['Pilot ready.'],
      move: ['New heading.'],
      attack: ['Attacking!'],
    },
    airship: {
      select: ['Dirigible, holding steady.', 'The sky is ours.', 'Bombs loaded.'],
      move: ['Changing heading.', 'Slow, but sure.', 'We drift onward.'],
      attack: ['Bombs away!', 'Bomb bay open!', 'Target below.'],
    },
    ship: {
      select: ['Bridge.', 'Crew at stations.', 'Captain here.'],
      move: ['Full ahead.', 'New course.', 'Steaming.'],
      attack: ['Fire all guns!', 'Engage!', 'Sink them!'],
    },
    sub: {
      select: ['Hunter Sub. Silent.', 'Below the waves.'],
      move: ['Diving.', 'Deeper.'],
      attack: ['Torpedoes!', 'Fire!'],
    },
    hover: {
      select: ['Hover transport.'],
      move: ['Moving.'],
      attack: ['We carry, we do not fight.'],
    },
  },
};

/** How each side sounds: pitch and pace, a little different for each kind of unit. */
const STYLE: Record<Faction, { pitch: number; rate: number }> = {
  accord: { pitch: 1.05, rate: 1.12 },
  bloc: { pitch: 0.62, rate: 0.96 },
};

const GROUP_PITCH: Partial<Record<Group, number>> = {
  commando: 0.9,
  armour: 0.85,
  ship: 0.8,
  airship: 0.75,
  jumper: 1.12,
  engineer: 1.1,
};

export interface Reply {
  text: string;
  pitch: number;
  rate: number;
  /** Which of the browser's voices to prefer, so each kind of unit keeps its own. */
  voice: number;
}

let turn = 0;

/** A line for this unit to say, or 'bark' for the dogs. */
export function replyFor(type: UnitType, faction: Faction, kind: ReplyKind): Reply | 'bark' {
  const group = GROUP[type];
  if (group === 'dog') return 'bark';
  const lines = LINES[faction][group][kind];
  turn++;
  const text = lines[turn % lines.length] ?? lines[0] ?? '';
  const style = STYLE[faction];
  return {
    text,
    pitch: Math.max(0.1, style.pitch * (GROUP_PITCH[group] ?? 1)),
    rate: style.rate,
    voice: Object.keys(GROUP).indexOf(type),
  };
}
