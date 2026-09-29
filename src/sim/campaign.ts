import type { MissionDef, MissionSide } from './mission';
import type { StructureType, UnitType } from './rules';

/**
 * The two short campaigns: three missions for the Accord, three for the Bloc. Each has its
 * own map, a scripted opening and objectives. Missions unlock in order.
 */

const BLUE = '#2f74e0';
const RED = '#d8342c';
const ORANGE = '#ec7a1c';

const accordYou: MissionSide = { name: 'You', faction: 'accord', color: BLUE, team: 1, ai: null };
const blocYou: MissionSide = { name: 'You', faction: 'bloc', color: RED, team: 1, ai: null };

/** How a mission's enemy starts: its credits and when it may first attack. */
interface Pace {
  credits?: number;
  firstAttack?: number;
}

function blocEnemy(
  ai: 'easy' | 'normal' | 'hard',
  builds: boolean,
  attacks: boolean,
  pace: Pace = {},
): MissionSide {
  return {
    name: 'Bloc forces',
    faction: 'bloc',
    color: ORANGE,
    team: 2,
    ai,
    builds,
    attacks,
    ...pace,
  };
}

function accordEnemy(
  ai: 'easy' | 'normal' | 'hard',
  builds: boolean,
  attacks: boolean,
  pace: Pace = {},
): MissionSide {
  return {
    name: 'Accord forces',
    faction: 'accord',
    color: BLUE,
    team: 2,
    ai,
    builds,
    attacks,
    ...pace,
  };
}

type Placed = MissionDef['structures'][number];

function at(type: StructureType, owner: number, x: number, z: number, tag?: string): Placed {
  return tag ? { type, owner, x, z, tag } : { type, owner, x, z };
}

/** A superweapon that starts `delay` of its charge behind, so you have time to build up. */
function slow(placed: Placed, delay: number): Placed {
  return { ...placed, charge: -delay };
}

function squad(type: UnitType, owner: number, x: number, z: number, count = 1) {
  return { type, owner, x, z, count };
}

const ACCORD_EARLY: (UnitType | StructureType)[] = [
  'a_power',
  'a_refinery',
  'a_barracks',
  'a_factory',
  'a_pillbox',
  'a_wall',
  'rifleman',
  'engineer',
  'hound',
  'lancer',
  'oretruck',
];

const ACCORD_MID: (UnitType | StructureType)[] = [
  ...ACCORD_EARLY,
  'a_aircommand',
  'a_repair',
  'a_beamtower',
  'a_sam',
  'skyjumper',
  'striker',
  'falcon',
];

const BLOC_MID: (UnitType | StructureType)[] = [
  'b_reactor',
  'b_refinery',
  'b_barracks',
  'b_factory',
  'b_radar',
  'b_repair',
  'b_nest',
  'b_bastion',
  'b_flak',
  'b_wall',
  'draftee',
  'engineer',
  'hound',
  'flakgunner',
  'torch',
  'bear',
  'flaktruck',
  'rockettruck',
  'orehauler',
];

export const MISSIONS: MissionDef[] = [
  {
    id: 'a1',
    campaign: 'accord',
    title: 'Beachhead',
    location: 'The eastern coast, dawn',
    briefing: [
      'The Bloc has crossed the border and dug an outpost into our farmland. They think the coast is theirs.',
      'Land your Base Truck on the beach, deploy it and build up a base. When you’re ready, push north-east and flatten every building in their outpost.',
      'They’ll probe your base with small raids. A Pillbox or two will make them think twice.',
    ],
    map: {
      id: 'm-a1',
      name: 'Beachhead',
      blurb: '',
      players: 2,
      width: 64,
      height: 56,
      theme: 'temperate',
      symmetry: 'none',
      trees: 0.035,
      campaign: true,
      features: [
        { kind: 'start', at: [14, 42] },
        { kind: 'start', at: [52, 10] },
        { kind: 'lake', at: [-3, 60], r: 15 },
        { kind: 'ore', at: [24, 36], r: 4, drill: true },
        { kind: 'ore', at: [40, 24], r: 3.5 },
        { kind: 'ore', at: [44, 44], r: 3 },
        { kind: 'forest', at: [30, 10], r: 5, density: 0.55 },
        { kind: 'forest', at: [58, 34], r: 4, density: 0.5 },
        { kind: 'forest', at: [8, 20], r: 5, density: 0.5 },
        { kind: 'rocks', at: [34, 28], r: 1.8 },
        { kind: 'plaza', at: [40, 50], r: 3.5 },
        { kind: 'building', type: 'c_house', at: [38, 47] },
        { kind: 'building', type: 'c_store', at: [41, 50] },
      ],
    },
    credits: 6000,
    sides: [accordYou, blocEnemy('easy', false, false)],
    structures: [
      at('b_reactor', 1, 50, 5),
      at('b_reactor', 1, 53, 5),
      at('b_barracks', 1, 47, 9),
      at('b_refinery', 1, 52, 9),
      at('b_nest', 1, 46, 15),
      at('b_nest', 1, 51, 15),
      at('b_nest', 1, 44, 11),
    ],
    units: [
      squad('basetruck', 0, 12, 43),
      squad('rifleman', 0, 16, 45, 4),
      squad('lancer', 0, 13, 47, 2),
      squad('draftee', 1, 49, 17, 5),
      squad('bear', 1, 54, 17),
      squad('hound', 1, 47, 17),
    ],
    objectives: [
      { kind: 'destroyAll', owner: 1, text: 'Destroy every building in the Bloc outpost.' },
    ],
    events: [
      { at: 2, kind: 'message', text: 'Deploy the Base Truck on the beach and build up.' },
      {
        at: 150,
        kind: 'reinforce',
        owner: 1,
        units: ['draftee', 'draftee', 'draftee', 'draftee', 'hound'],
        x: 56,
        z: 20,
        attack: { x: 15, z: 41 },
        text: 'Bloc infantry crossing the fields.',
      },
      {
        at: 330,
        kind: 'reinforce',
        owner: 1,
        units: ['bear', 'bear', 'draftee', 'draftee', 'draftee'],
        x: 56,
        z: 20,
        attack: { x: 15, z: 41 },
        text: 'Enemy tanks inbound.',
      },
      {
        at: 420,
        kind: 'reinforce',
        owner: 0,
        units: ['lancer', 'lancer', 'rifleman', 'rifleman'],
        x: 5,
        z: 49,
        text: 'Reinforcements have landed.',
      },
      {
        at: 560,
        kind: 'reinforce',
        owner: 1,
        units: ['bear', 'bear', 'bear', 'flaktruck', 'draftee', 'draftee'],
        x: 56,
        z: 20,
        attack: { x: 15, z: 41 },
        text: 'A big Bloc column is heading your way.',
      },
    ],
    tech: ACCORD_EARLY,
    camera: { x: 14, z: 42 },
  },
  {
    id: 'a2',
    campaign: 'accord',
    title: 'Hold the Line',
    location: 'A mining town in the northern hills',
    briefing: [
      'The Bloc’s spring offensive is coming straight through this town, and our main army is ten minutes out.',
      'Hold the town until they arrive. Keep your Headquarters standing: if it falls, the town falls.',
      'Two oil derricks sit either side of town. Send Engineers to capture them: every credit counts.',
    ],
    map: {
      id: 'm-a2',
      name: 'Hold the Line',
      blurb: '',
      players: 2,
      width: 72,
      height: 72,
      theme: 'snow',
      symmetry: 'none',
      trees: 0.03,
      campaign: true,
      features: [
        { kind: 'start', at: [35, 48] },
        { kind: 'start', at: [36, 3] },
        { kind: 'ore', at: [24, 58], r: 4, drill: true },
        { kind: 'ore', at: [50, 60], r: 3.5 },
        { kind: 'plaza', at: [36, 26], r: 7 },
        { kind: 'building', type: 'c_flats', at: [30, 22] },
        { kind: 'building', type: 'c_house', at: [35, 21] },
        { kind: 'building', type: 'c_church', at: [40, 22] },
        { kind: 'building', type: 'c_store', at: [31, 28] },
        { kind: 'building', type: 'c_house', at: [39, 28] },
        { kind: 'forest', at: [10, 12], r: 6, density: 0.5 },
        { kind: 'forest', at: [62, 12], r: 6, density: 0.5 },
        { kind: 'forest', at: [8, 50], r: 5, density: 0.45 },
        { kind: 'forest', at: [64, 50], r: 5, density: 0.45 },
        { kind: 'rocks', at: [22, 38], r: 2 },
        { kind: 'rocks', at: [50, 38], r: 2 },
      ],
    },
    credits: 3500,
    sides: [accordYou, blocEnemy('normal', false, false)],
    structures: [
      at('a_hq', 0, 34, 46, 'hq'),
      at('a_power', 0, 39, 46),
      at('a_power', 0, 39, 49),
      at('a_refinery', 0, 29, 46),
      at('a_barracks', 0, 34, 51),
      at('a_factory', 0, 37, 52),
      at('a_pillbox', 0, 33, 43),
      at('a_pillbox', 0, 38, 43),
      at('c_derrick', -1, 13, 30, 'derrickWest'),
      at('c_derrick', -1, 57, 30, 'derrickEast'),
    ],
    units: [
      squad('rifleman', 0, 35, 42, 4),
      squad('lancer', 0, 31, 43, 2),
      squad('striker', 0, 40, 42),
      squad('engineer', 0, 36, 56, 2),
    ],
    objectives: [
      { kind: 'survive', seconds: 600, text: 'Hold out for ten minutes.' },
      { kind: 'protect', tag: 'hq', text: 'Keep your Headquarters standing.' },
      { kind: 'capture', tag: 'derrickWest', text: 'Capture the western oil derrick.' },
      { kind: 'capture', tag: 'derrickEast', text: 'Capture the eastern oil derrick.' },
    ],
    events: [
      { at: 3, kind: 'message', text: 'Hold the town for ten minutes. Capture both derricks.' },
      {
        at: 60,
        kind: 'reinforce',
        owner: 1,
        units: ['draftee', 'draftee', 'draftee', 'draftee', 'draftee', 'bear'],
        x: 36,
        z: 3,
        attack: { x: 35, z: 45 },
        text: 'Bloc troops from the north.',
      },
      {
        at: 150,
        kind: 'reinforce',
        owner: 1,
        units: ['draftee', 'draftee', 'draftee', 'draftee', 'flakgunner', 'bear', 'bear', 'bear'],
        x: 69,
        z: 38,
        attack: { x: 36, z: 47 },
        text: 'Enemies from the east.',
      },
      {
        at: 240,
        kind: 'reinforce',
        owner: 1,
        units: ['bear', 'bear', 'bear', 'bear', 'rockettruck', 'rockettruck'],
        x: 36,
        z: 3,
        attack: { x: 35, z: 45 },
        text: 'Tanks and artillery from the north.',
      },
      {
        at: 330,
        kind: 'reinforce',
        owner: 1,
        units: [
          'draftee',
          'draftee',
          'draftee',
          'draftee',
          'draftee',
          'torch',
          'torch',
          'torch',
          'bear',
        ],
        x: 2,
        z: 38,
        attack: { x: 33, z: 47 },
        text: 'Flamethrowers from the west.',
      },
      {
        at: 400,
        kind: 'reinforce',
        owner: 1,
        units: ['dirigible', 'dirigible'],
        x: 69,
        z: 3,
        attack: { x: 36, z: 48 },
        text: 'An airship is heading for your Headquarters.',
      },
      {
        at: 470,
        kind: 'reinforce',
        owner: 1,
        units: [
          'bear',
          'bear',
          'bear',
          'bear',
          'bear',
          'bear',
          'flaktruck',
          'rockettruck',
          'draftee',
          'draftee',
          'draftee',
          'draftee',
        ],
        x: 36,
        z: 3,
        attack: { x: 35, z: 45 },
        text: 'Their main attack is coming.',
      },
      {
        at: 540,
        kind: 'reinforce',
        owner: 1,
        units: ['behemoth', 'behemoth', 'bear', 'bear', 'bear', 'rockettruck', 'rockettruck'],
        x: 69,
        z: 38,
        attack: { x: 36, z: 47 },
        text: 'Behemoth sighted to the east.',
      },
      {
        at: 600,
        kind: 'reinforce',
        owner: 0,
        units: ['lancer', 'lancer', 'lancer', 'beamtank', 'beamtank', 'striker'],
        x: 36,
        z: 70,
        text: 'Our army has arrived. Well held, Commander.',
      },
    ],
    tech: ACCORD_MID,
    camera: { x: 36, z: 47 },
  },
  {
    id: 'a3',
    campaign: 'accord',
    title: 'Storm Front',
    location: 'The southern bay',
    briefing: [
      'The Bloc has built a Hellfire Silo on the far side of the bay. When it fires, the missile will flatten a whole base.',
      'Build up fast. Destroy the Hellfire Silo, then wipe out the rest of their base. Their fleet guards the bay, so decide whether to fight for the water or march round.',
      'Our scientists have finished the Storm Array. If you can afford one, use it.',
    ],
    map: {
      id: 'm-a3',
      name: 'Storm Front',
      blurb: '',
      players: 2,
      width: 96,
      height: 72,
      theme: 'temperate',
      symmetry: 'none',
      trees: 0.03,
      campaign: true,
      features: [
        { kind: 'start', at: [13, 34] },
        { kind: 'start', at: [84, 36] },
        { kind: 'lake', at: [48, 72], r: 22 },
        { kind: 'lake', at: [48, 46], r: 8 },
        { kind: 'ore', at: [12, 22], r: 4, drill: true },
        { kind: 'ore', at: [22, 46], r: 3.5 },
        { kind: 'ore', at: [48, 12], r: 4, gems: true },
        { kind: 'ore', at: [80, 50], r: 4, drill: true },
        { kind: 'forest', at: [30, 8], r: 5, density: 0.5 },
        { kind: 'forest', at: [66, 8], r: 5, density: 0.5 },
        { kind: 'rocks', at: [48, 26], r: 2 },
        { kind: 'building', type: 'c_derrick', at: [36, 20] },
        { kind: 'building', type: 'c_derrick', at: [58, 20] },
      ],
    },
    credits: 10000,
    sides: [accordYou, blocEnemy('easy', true, true, { credits: 3000, firstAttack: 540 })],
    structures: [
      at('b_hq', 1, 82, 32),
      at('b_reactor', 1, 87, 30),
      at('b_reactor', 1, 87, 33),
      at('b_reactor', 1, 87, 36),
      at('b_refinery', 1, 78, 42),
      at('b_barracks', 1, 79, 30),
      at('b_factory', 1, 83, 38),
      at('b_radar', 1, 90, 38),
      slow(at('b_silo', 1, 86, 22, 'silo'), 0.5),
      at('b_nest', 1, 76, 34),
      at('b_bastion', 1, 76, 38),
      at('b_bastion', 1, 80, 26),
    ],
    units: [
      squad('basetruck', 0, 13, 34),
      squad('rifleman', 0, 17, 36, 4),
      squad('lancer', 0, 16, 31, 3),
      squad('striker', 0, 18, 33),
      squad('engineer', 0, 15, 38),
      squad('bear', 1, 76, 30, 3),
      squad('draftee', 1, 73, 37, 6),
    ],
    objectives: [
      { kind: 'destroy', tag: 'silo', text: 'Destroy the Hellfire Silo.' },
      { kind: 'destroyAll', owner: 1, text: 'Destroy every Bloc building.' },
    ],
    events: [
      { at: 3, kind: 'message', text: 'Deploy and build up. The Hellfire Silo is across the bay.' },
      { at: 540, kind: 'message', text: 'Their missile is charging. Don’t bunch your base up.' },
    ],
    superweapons: true,
    camera: { x: 14, z: 34 },
  },
  {
    id: 'b1',
    campaign: 'bloc',
    title: 'First Strike',
    location: 'The Accord border, midnight',
    briefing: [
      'The border post ahead watches our every move. Tonight it goes dark.',
      'You have no base, only the column you arrive with, and more tanks on the way. Beam Towers guard the post, but they need power: knock out the Fusion Plants and the towers go silent.',
      'Destroy every building at the border post.',
    ],
    map: {
      id: 'm-b1',
      name: 'First Strike',
      blurb: '',
      players: 2,
      width: 64,
      height: 64,
      theme: 'snow',
      symmetry: 'none',
      trees: 0.035,
      campaign: true,
      features: [
        { kind: 'start', at: [12, 54] },
        { kind: 'start', at: [50, 10] },
        { kind: 'forest', at: [30, 32], r: 5, density: 0.5 },
        { kind: 'forest', at: [12, 20], r: 6, density: 0.5 },
        { kind: 'forest', at: [52, 44], r: 6, density: 0.5 },
        { kind: 'rocks', at: [38, 22], r: 2.2 },
        { kind: 'rocks', at: [24, 44], r: 2 },
        {
          kind: 'road',
          points: [
            [4, 60],
            [30, 36],
            [54, 10],
          ],
          width: 1.4,
        },
        { kind: 'ore', at: [58, 22], r: 3 },
      ],
    },
    credits: 0,
    sides: [blocYou, accordEnemy('normal', false, false)],
    structures: [
      at('a_power', 1, 52, 3),
      at('a_power', 1, 55, 3),
      at('a_power', 1, 58, 3),
      at('a_hq', 1, 56, 8),
      at('a_barracks', 1, 48, 6),
      at('a_refinery', 1, 51, 10),
      at('a_beamtower', 1, 45, 12),
      at('a_beamtower', 1, 49, 15),
      at('a_beamtower', 1, 54, 17),
      at('a_beamtower', 1, 41, 8),
      at('a_pillbox', 1, 44, 9),
      at('a_pillbox', 1, 46, 15),
      at('a_pillbox', 1, 53, 16),
      at('a_pillbox', 1, 42, 13),
      at('a_pillbox', 1, 57, 15),
    ],
    units: [
      squad('bear', 0, 12, 54, 5),
      squad('draftee', 0, 15, 57, 8),
      squad('flaktruck', 0, 9, 56, 2),
      squad('rockettruck', 0, 10, 59, 2),
      squad('lancer', 1, 47, 19, 5),
      squad('rifleman', 1, 50, 18, 8),
      squad('striker', 1, 52, 13, 2),
    ],
    objectives: [
      { kind: 'destroyAll', owner: 1, text: 'Destroy every building at the border post.' },
    ],
    events: [
      {
        at: 2,
        kind: 'message',
        text: 'Knock out their Fusion Plants to shut down the Beam Towers.',
      },
      {
        at: 180,
        kind: 'reinforce',
        owner: 0,
        units: ['bear', 'bear', 'bear', 'draftee', 'draftee', 'draftee', 'draftee'],
        x: 4,
        z: 60,
        text: 'Reinforcements have arrived.',
      },
      {
        at: 240,
        kind: 'reinforce',
        owner: 1,
        units: ['lancer', 'lancer', 'lancer', 'lancer', 'striker', 'striker'],
        x: 62,
        z: 2,
        attack: { x: 20, z: 48 },
        text: 'Accord tanks are coming for you.',
      },
      {
        at: 360,
        kind: 'reinforce',
        owner: 0,
        units: ['behemoth', 'behemoth'],
        x: 4,
        z: 60,
        text: 'Two Behemoths have joined you.',
      },
    ],
    tech: [],
    camera: { x: 13, z: 54 },
  },
  {
    id: 'b2',
    campaign: 'bloc',
    title: 'The Lab',
    location: 'An Accord research campus',
    briefing: [
      'The Accord keeps its newest research in the lab at the heart of this base. We want it, intact.',
      'Build up, break through their defences and get an Engineer inside the Research Lab. If the lab is destroyed, the mission is lost.',
      'Keep your own Headquarters safe while you work.',
    ],
    map: {
      id: 'm-b2',
      name: 'The Lab',
      blurb: '',
      players: 2,
      width: 72,
      height: 72,
      theme: 'temperate',
      symmetry: 'none',
      trees: 0.035,
      campaign: true,
      features: [
        { kind: 'start', at: [14, 58] },
        { kind: 'start', at: [58, 14] },
        { kind: 'ore', at: [26, 60], r: 4, drill: true },
        { kind: 'ore', at: [12, 44], r: 3.5 },
        { kind: 'ore', at: [36, 36], r: 3, gems: true },
        { kind: 'ore', at: [46, 12], r: 4, drill: true },
        { kind: 'lake', at: [36, 20], r: 4 },
        { kind: 'lake', at: [22, 32], r: 3.5 },
        { kind: 'forest', at: [52, 44], r: 6, density: 0.5 },
        { kind: 'forest', at: [8, 10], r: 6, density: 0.5 },
        { kind: 'building', type: 'c_derrick', at: [28, 46] },
      ],
    },
    credits: 8000,
    sides: [blocYou, accordEnemy('easy', true, true, { credits: 2000, firstAttack: 540 })],
    structures: [
      at('b_hq', 0, 12, 56, 'hq'),
      at('b_reactor', 0, 17, 56),
      at('b_reactor', 0, 17, 59),
      at('b_refinery', 0, 20, 58),
      at('b_barracks', 0, 12, 52),
      at('a_hq', 1, 58, 12),
      at('a_power', 1, 63, 10),
      at('a_power', 1, 63, 13),
      at('a_power', 1, 63, 16),
      at('a_refinery', 1, 52, 16),
      at('a_barracks', 1, 55, 8),
      at('a_factory', 1, 59, 17),
      at('a_aircommand', 1, 51, 8),
      at('a_lab', 1, 63, 20, 'lab'),
      at('a_pillbox', 1, 50, 21),
      at('a_pillbox', 1, 55, 23),
      at('a_beamtower', 1, 53, 22),
    ],
    units: [
      squad('draftee', 0, 16, 52, 5),
      squad('bear', 0, 20, 53, 2),
      squad('engineer', 0, 14, 62),
    ],
    objectives: [
      { kind: 'capture', tag: 'lab', text: 'Capture the Research Lab with an Engineer.' },
      { kind: 'protect', tag: 'hq', text: 'Keep your Headquarters standing.' },
    ],
    events: [{ at: 3, kind: 'message', text: 'Capture their Research Lab. Don’t destroy it.' }],
    tech: BLOC_MID,
    camera: { x: 15, z: 56 },
  },
  {
    id: 'b3',
    campaign: 'bloc',
    title: 'Hellfire',
    location: 'The Accord’s desert command',
    briefing: [
      'This is the Accord’s last stronghold in the south, and they have a Storm Array. It will tear your base apart with lightning.',
      'Our engineers have perfected the Hellfire Silo. Build one, and answer their storm with fire.',
      'Destroy every Accord building.',
    ],
    map: {
      id: 'm-b3',
      name: 'Hellfire',
      blurb: '',
      players: 2,
      width: 96,
      height: 64,
      theme: 'desert',
      symmetry: 'none',
      trees: 0.012,
      campaign: true,
      features: [
        { kind: 'start', at: [12, 32] },
        { kind: 'start', at: [84, 32] },
        {
          kind: 'cliff',
          points: [
            [34, 0],
            [38, 14],
            [36, 24],
          ],
          width: 2.6,
        },
        {
          kind: 'cliff',
          points: [
            [60, 64],
            [58, 50],
            [60, 40],
          ],
          width: 2.6,
        },
        { kind: 'ore', at: [16, 20], r: 4, drill: true },
        { kind: 'ore', at: [18, 46], r: 3.5 },
        { kind: 'ore', at: [48, 32], r: 3.5, gems: true },
        { kind: 'ore', at: [80, 46], r: 4, drill: true },
        { kind: 'lake', at: [48, 10], r: 3 },
        { kind: 'lake', at: [48, 54], r: 3 },
        { kind: 'building', type: 'c_derrick', at: [46, 20] },
        { kind: 'building', type: 'c_derrick', at: [46, 42] },
      ],
    },
    credits: 10000,
    sides: [blocYou, accordEnemy('normal', true, true, { credits: 3000, firstAttack: 540 })],
    structures: [
      at('a_hq', 1, 82, 30),
      at('a_power', 1, 87, 26),
      at('a_power', 1, 87, 29),
      at('a_power', 1, 87, 32),
      at('a_power', 1, 90, 26),
      at('a_refinery', 1, 78, 40),
      at('a_barracks', 1, 79, 26),
      at('a_factory', 1, 82, 36),
      at('a_aircommand', 1, 88, 36),
      at('a_lab', 1, 90, 30),
      slow(at('a_storm', 1, 86, 18, 'storm'), 0.5),
      at('a_beamtower', 1, 75, 30),
      at('a_beamtower', 1, 76, 36),
      at('a_pillbox', 1, 75, 26),
    ],
    units: [
      squad('basetruck', 0, 12, 32),
      squad('bear', 0, 16, 29, 4),
      squad('draftee', 0, 17, 35, 6),
      squad('flaktruck', 0, 15, 36),
      squad('engineer', 0, 13, 37),
      squad('lancer', 1, 74, 33, 4),
      squad('rifleman', 1, 74, 28, 6),
    ],
    objectives: [{ kind: 'destroyAll', owner: 1, text: 'Destroy every Accord building.' }],
    events: [
      {
        at: 3,
        kind: 'message',
        text: 'Build a base, and a Hellfire Silo. Their Storm Array is charging.',
      },
    ],
    superweapons: true,
    camera: { x: 13, z: 32 },
  },
];

export function mission(id: string): MissionDef | undefined {
  return MISSIONS.find((candidate) => candidate.id === id);
}

export function campaignMissions(faction: 'accord' | 'bloc'): MissionDef[] {
  return MISSIONS.filter((candidate) => candidate.campaign === faction);
}

const PROGRESS = 'hotwar.campaign.v1';

/** How many missions of each campaign are done. */
export function loadProgress(): Record<'accord' | 'bloc', number> {
  try {
    const raw = window.localStorage.getItem(PROGRESS);
    const saved = raw ? (JSON.parse(raw) as Partial<Record<'accord' | 'bloc', number>>) : {};
    return { accord: saved.accord ?? 0, bloc: saved.bloc ?? 0 };
  } catch {
    return { accord: 0, bloc: 0 };
  }
}

export function saveProgress(def: MissionDef): void {
  const progress = loadProgress();
  const index = campaignMissions(def.campaign).indexOf(def);
  progress[def.campaign] = Math.max(progress[def.campaign], index + 1);
  try {
    window.localStorage.setItem(PROGRESS, JSON.stringify(progress));
  } catch {
    // Private browsing: progress won't be kept.
  }
}
