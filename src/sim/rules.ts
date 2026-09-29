/**
 * The rules of Hot War: the two factions, every unit and structure, their weapons, and how
 * much each kind of warhead hurts each kind of armour. All numbers are in cells (distance),
 * seconds (time) and credits (money).
 */

export type Faction = 'accord' | 'bloc';

export const FACTIONS: Record<Faction, { name: string; blurb: string; color: string }> = {
  accord: {
    name: 'The Accord',
    blurb: 'Fast, high-tech and hard to pin down: beam weapons, jump troops and strike jets.',
    color: '#3d7fe0',
  },
  bloc: {
    name: 'The Bloc',
    blurb: 'Heavy armour and brute force: thick tanks, flamethrowers, rockets and airships.',
    color: '#d8342c',
  },
};

export type Armor =
  'infantry' | 'light' | 'medium' | 'heavy' | 'aircraft' | 'building' | 'wall' | 'ship';

export type Warhead =
  | 'bullet'
  | 'sniper'
  | 'ap'
  | 'he'
  | 'fire'
  | 'beam'
  | 'flak'
  | 'missile'
  | 'bomb'
  | 'bite'
  | 'torpedo'
  | 'shock';

type Row = [number, number, number, number, number, number, number, number];
/** Columns: infantry, light, medium, heavy, aircraft, building, wall, ship. */
const TABLE: Record<Warhead, Row> = {
  bullet: [1, 0.4, 0.25, 0.15, 0.4, 0.15, 0.05, 0.2],
  sniper: [1, 0.05, 0.05, 0.05, 0.05, 0.02, 0, 0],
  ap: [0.3, 0.95, 1, 0.9, 0.5, 0.75, 0.6, 0.9],
  he: [1, 0.7, 0.6, 0.5, 0.3, 1.2, 1, 0.9],
  fire: [1.6, 0.6, 0.45, 0.3, 0.2, 0.8, 0.2, 0.4],
  beam: [0.8, 1, 0.9, 0.75, 0.5, 1.3, 1, 0.9],
  flak: [0.6, 0.3, 0.2, 0.1, 1, 0.08, 0, 0.1],
  missile: [0.3, 1, 0.9, 0.8, 1, 0.55, 0.3, 0.9],
  bomb: [1, 1, 1, 0.9, 0, 1.3, 1.2, 1.1],
  bite: [10, 0, 0, 0, 0, 0, 0, 0],
  torpedo: [0, 0, 0, 0, 0, 0, 0, 1.3],
  shock: [1.3, 1, 1, 0.9, 1, 1, 1, 1],
};

const ARMORS: Armor[] = [
  'infantry',
  'light',
  'medium',
  'heavy',
  'aircraft',
  'building',
  'wall',
  'ship',
];

/** Damage multiplier for each warhead against each armour. */
export const VERSUS = Object.fromEntries(
  Object.entries(TABLE).map(([warhead, row]) => [
    warhead,
    Object.fromEntries(ARMORS.map((armor, i) => [armor, row[i] ?? 0])),
  ]),
) as Record<Warhead, Record<Armor, number>>;

export type ProjectileKind =
  'instant' | 'shell' | 'missile' | 'artillery' | 'bomb' | 'beam' | 'flame' | 'melee' | 'torpedo';

export type SoundId =
  | 'rifle'
  | 'mg'
  | 'pistol'
  | 'cannon'
  | 'bigcannon'
  | 'flak'
  | 'missile'
  | 'rocket'
  | 'beam'
  | 'flame'
  | 'bite'
  | 'bomb';

export interface WeaponDef {
  damage: number;
  /** Seconds between shots (or bursts). */
  cooldown: number;
  range: number;
  minRange?: number;
  warhead: Warhead;
  projectile: ProjectileKind;
  /** Cells per second, for things that fly. */
  speed?: number;
  /** Radius that also takes damage, falling off to a quarter at the edge. */
  splash?: number;
  /** Can it hit aircraft and jump troops? And things on the ground? */
  air?: boolean;
  ground?: boolean;
  burst?: number;
  burstDelay?: number;
  /** Beams that jump to this many more enemies near the target, at reduced damage. */
  split?: number;
  /** Burns out infantry hiding in buildings. */
  clearsGarrison?: boolean;
  /** Only hits ships (torpedoes, depth charges). */
  shipsOnly?: boolean;
  /** Can hit submerged submarines. */
  underwater?: boolean;
  sound: SoundId;
}

const WEAPON_LIST = {
  rifle: {
    damage: 15,
    cooldown: 1,
    range: 4.5,
    warhead: 'bullet',
    projectile: 'instant',
    sound: 'rifle',
  },
  dugIn: {
    damage: 24,
    cooldown: 0.55,
    range: 5.5,
    warhead: 'bullet',
    projectile: 'instant',
    sound: 'mg',
  },
  smg: {
    damage: 11,
    cooldown: 1,
    range: 4,
    warhead: 'bullet',
    projectile: 'instant',
    sound: 'rifle',
  },
  pistols: {
    damage: 150,
    cooldown: 0.75,
    range: 5.5,
    warhead: 'sniper',
    projectile: 'instant',
    sound: 'pistol',
  },
  jetGun: {
    damage: 14,
    cooldown: 1,
    range: 4,
    burst: 2,
    burstDelay: 0.15,
    warhead: 'bullet',
    projectile: 'instant',
    sound: 'mg',
  },
  bite: {
    damage: 20,
    cooldown: 1,
    range: 1.2,
    warhead: 'bite',
    projectile: 'melee',
    sound: 'bite',
  },
  flakRifle: {
    damage: 25,
    cooldown: 1.3,
    range: 5.5,
    splash: 0.5,
    air: true,
    warhead: 'flak',
    projectile: 'instant',
    sound: 'flak',
  },
  torch: {
    damage: 34,
    cooldown: 1,
    range: 3.2,
    splash: 0.7,
    clearsGarrison: true,
    warhead: 'fire',
    projectile: 'flame',
    sound: 'flame',
  },
  cannon90: {
    damage: 60,
    cooldown: 1.5,
    range: 5.25,
    speed: 16,
    warhead: 'ap',
    projectile: 'shell',
    sound: 'cannon',
  },
  cannon120: {
    damage: 90,
    cooldown: 1.8,
    range: 5.5,
    speed: 16,
    warhead: 'ap',
    projectile: 'shell',
    sound: 'bigcannon',
  },
  twin120: {
    damage: 100,
    cooldown: 2.4,
    range: 6,
    burst: 2,
    burstDelay: 0.25,
    speed: 16,
    warhead: 'ap',
    projectile: 'shell',
    sound: 'bigcannon',
  },
  behemothAA: {
    damage: 50,
    cooldown: 2.5,
    range: 7.5,
    burst: 2,
    burstDelay: 0.2,
    speed: 11,
    air: true,
    ground: false,
    warhead: 'missile',
    projectile: 'missile',
    sound: 'missile',
  },
  strikerMissiles: {
    damage: 42,
    cooldown: 1.8,
    range: 7,
    burst: 2,
    burstDelay: 0.2,
    speed: 12,
    air: true,
    warhead: 'missile',
    projectile: 'missile',
    sound: 'missile',
  },
  flakCannon: {
    damage: 42,
    cooldown: 0.9,
    range: 7.5,
    splash: 0.8,
    air: true,
    warhead: 'flak',
    projectile: 'instant',
    sound: 'flak',
  },
  beamSplitter: {
    damage: 110,
    cooldown: 3,
    range: 8,
    split: 4,
    warhead: 'beam',
    projectile: 'beam',
    sound: 'beam',
  },
  longshot: {
    damage: 260,
    cooldown: 9,
    range: 16,
    minRange: 3,
    speed: 7,
    splash: 1.6,
    warhead: 'he',
    projectile: 'artillery',
    sound: 'rocket',
  },
  falconMissiles: {
    damage: 110,
    cooldown: 0.35,
    range: 5,
    speed: 14,
    warhead: 'missile',
    projectile: 'missile',
    sound: 'missile',
  },
  bombs: {
    damage: 220,
    cooldown: 1.6,
    range: 0.7,
    splash: 1.8,
    speed: 4,
    warhead: 'bomb',
    projectile: 'bomb',
    sound: 'bomb',
  },
  minerGun: {
    damage: 14,
    cooldown: 0.4,
    range: 4,
    warhead: 'bullet',
    projectile: 'instant',
    sound: 'mg',
  },
  pillboxGun: {
    damage: 22,
    cooldown: 0.35,
    range: 5.5,
    warhead: 'bullet',
    projectile: 'instant',
    sound: 'mg',
  },
  nestGun: {
    damage: 18,
    cooldown: 0.3,
    range: 5.5,
    warhead: 'bullet',
    projectile: 'instant',
    sound: 'mg',
  },
  beamTower: {
    damage: 150,
    cooldown: 3.5,
    range: 8.5,
    warhead: 'beam',
    projectile: 'beam',
    sound: 'beam',
  },
  bastionGun: {
    damage: 130,
    cooldown: 3,
    range: 7.5,
    burst: 2,
    burstDelay: 0.3,
    speed: 18,
    warhead: 'ap',
    projectile: 'shell',
    sound: 'bigcannon',
  },
  samMissiles: {
    damage: 70,
    cooldown: 2,
    range: 10,
    burst: 2,
    burstDelay: 0.25,
    speed: 14,
    air: true,
    ground: false,
    warhead: 'missile',
    projectile: 'missile',
    sound: 'missile',
  },
  flakGun: {
    damage: 50,
    cooldown: 0.7,
    range: 10,
    splash: 1,
    air: true,
    ground: false,
    warhead: 'flak',
    projectile: 'instant',
    sound: 'flak',
  },
  deckGun: {
    damage: 70,
    cooldown: 1.6,
    range: 7,
    speed: 16,
    warhead: 'ap',
    projectile: 'shell',
    sound: 'cannon',
  },
  depthCharges: {
    damage: 70,
    cooldown: 2,
    range: 4.5,
    splash: 0.8,
    shipsOnly: true,
    underwater: true,
    warhead: 'torpedo',
    projectile: 'instant',
    sound: 'bomb',
  },
  cruiserMissiles: {
    damage: 55,
    cooldown: 2.2,
    range: 11,
    burst: 3,
    burstDelay: 0.15,
    speed: 14,
    air: true,
    ground: false,
    warhead: 'missile',
    projectile: 'missile',
    sound: 'missile',
  },
  monitorGun: {
    damage: 170,
    cooldown: 5,
    range: 14,
    minRange: 4,
    speed: 9,
    splash: 1.4,
    warhead: 'he',
    projectile: 'artillery',
    sound: 'bigcannon',
  },
  torpedo: {
    damage: 150,
    cooldown: 3,
    range: 6,
    speed: 5,
    shipsOnly: true,
    underwater: true,
    warhead: 'torpedo',
    projectile: 'torpedo',
    sound: 'missile',
  },
  boatFlak: {
    damage: 35,
    cooldown: 0.8,
    range: 7,
    splash: 0.6,
    air: true,
    ground: false,
    warhead: 'flak',
    projectile: 'instant',
    sound: 'flak',
  },
  boatGun: {
    damage: 16,
    cooldown: 0.35,
    range: 5,
    warhead: 'bullet',
    projectile: 'instant',
    sound: 'mg',
  },
  cruiserRockets: {
    damage: 200,
    cooldown: 9,
    range: 17,
    minRange: 5,
    burst: 2,
    burstDelay: 0.5,
    speed: 7,
    splash: 1.6,
    warhead: 'he',
    projectile: 'artillery',
    sound: 'rocket',
  },
  garrisonGun: {
    damage: 20,
    cooldown: 0.9,
    range: 6,
    warhead: 'bullet',
    projectile: 'instant',
    sound: 'mg',
  },
} satisfies Record<string, WeaponDef>;

export type WeaponId = keyof typeof WEAPON_LIST;

export const WEAPONS: Record<WeaponId, WeaponDef> = WEAPON_LIST;

export function weapon(id: WeaponId): WeaponDef {
  return WEAPONS[id];
}

/** What a structure does, which is what the tech tree asks for. */
export type Role =
  | 'hq'
  | 'power'
  | 'refinery'
  | 'barracks'
  | 'factory'
  | 'radar'
  | 'repair'
  | 'lab'
  | 'defense'
  | 'wall'
  | 'civilian'
  | 'derrick'
  | 'naval'
  | 'super';

export type UnitKind = 'infantry' | 'vehicle' | 'aircraft' | 'ship';
export type Producer = 'barracks' | 'factory' | 'radar' | 'naval';

export type UnitType =
  | 'basetruck'
  | 'engineer'
  | 'hound'
  | 'rifleman'
  | 'skyjumper'
  | 'commando'
  | 'lancer'
  | 'striker'
  | 'beamtank'
  | 'oretruck'
  | 'falcon'
  | 'draftee'
  | 'flakgunner'
  | 'torch'
  | 'bear'
  | 'flaktruck'
  | 'rockettruck'
  | 'behemoth'
  | 'orehauler'
  | 'dirigible'
  | 'frigate'
  | 'cruiser'
  | 'monitor'
  | 'sub'
  | 'flakboat'
  | 'missileship'
  | 'hovercraft';

export interface UnitDef {
  id: UnitType;
  name: string;
  blurb: string;
  faction: Faction | 'both';
  kind: UnitKind;
  cost: number;
  hp: number;
  armor: Armor;
  /** Cells per second. */
  speed: number;
  sight: number;
  /** Collision radius. */
  radius: number;
  /** How fast the hull turns, radians per second (infantry turn instantly). */
  turn: number;
  weapons: WeaponId[];
  turret?: boolean;
  prereqs: Role[];
  from: Producer;
  crusher?: boolean;
  crushable?: boolean;
  harvester?: { capacity: number; warp?: boolean };
  /** Deploys into its faction's headquarters. */
  deploysToHq?: boolean;
  /** Digs in where it stands, swapping to this weapon. */
  dugInWeapon?: WeaponId;
  engineer?: boolean;
  dog?: boolean;
  commando?: boolean;
  /** Only one at a time. */
  unique?: boolean;
  canGarrison?: boolean;
  /** How it flies, if it does. */
  flies?: 'jumpjet' | 'jet' | 'airship';
  altitude?: number;
  ammo?: number;
  /** Hit points healed per second. */
  selfHeal?: number;
  /** Sails on water only. */
  naval?: boolean;
  /** Goes over land and water alike. */
  amphibious?: boolean;
  /** Hides underwater until it fires. */
  submarine?: boolean;
  /** Carries passengers: infantry take one slot, vehicles four (if allowed). */
  transport?: { slots: number; vehicles?: boolean };
}

const INFANTRY = { kind: 'infantry', armor: 'infantry', radius: 0.18, turn: 20 } as const;
const TANK = { kind: 'vehicle', radius: 0.42, crusher: true } as const;

export const UNITS: Record<UnitType, UnitDef> = {
  basetruck: {
    id: 'basetruck',
    name: 'Base Truck',
    blurb: 'A whole headquarters on wheels. Deploy it to found a base.',
    faction: 'both',
    ...TANK,
    cost: 3000,
    hp: 1000,
    armor: 'heavy',
    speed: 1.1,
    sight: 5,
    radius: 0.55,
    turn: 1.6,
    weapons: [],
    prereqs: ['factory', 'repair'],
    from: 'factory',
    deploysToHq: true,
  },
  engineer: {
    id: 'engineer',
    name: 'Engineer',
    blurb: 'Captures enemy and civilian buildings, and repairs your own.',
    faction: 'both',
    ...INFANTRY,
    cost: 500,
    hp: 75,
    speed: 1.2,
    sight: 4,
    weapons: [],
    prereqs: ['barracks'],
    from: 'barracks',
    crushable: true,
    engineer: true,
  },
  hound: {
    id: 'hound',
    name: 'Attack Hound',
    blurb: 'Fast and vicious: takes down infantry in one bite.',
    faction: 'both',
    ...INFANTRY,
    cost: 200,
    hp: 100,
    speed: 2.8,
    sight: 7,
    weapons: ['bite'],
    prereqs: ['barracks'],
    from: 'barracks',
    crushable: true,
    dog: true,
  },
  rifleman: {
    id: 'rifleman',
    name: 'Rifleman',
    blurb: 'Basic infantry. Deploy to dig in behind sandbags for a heavier gun.',
    faction: 'accord',
    ...INFANTRY,
    cost: 200,
    hp: 125,
    speed: 1.3,
    sight: 5,
    weapons: ['rifle'],
    dugInWeapon: 'dugIn',
    prereqs: ['barracks'],
    from: 'barracks',
    crushable: true,
    canGarrison: true,
  },
  skyjumper: {
    id: 'skyjumper',
    name: 'Skyjumper',
    blurb: 'Jetpack infantry that flies over anything. Only anti-air can touch them.',
    faction: 'accord',
    ...INFANTRY,
    cost: 600,
    hp: 125,
    speed: 2.2,
    sight: 6,
    weapons: ['jetGun'],
    prereqs: ['barracks', 'radar'],
    from: 'barracks',
    flies: 'jumpjet',
    altitude: 1.8,
  },
  commando: {
    id: 'commando',
    name: 'Commando',
    blurb: 'Hero. Drops infantry at range and blows up buildings with demolition charges.',
    faction: 'accord',
    ...INFANTRY,
    cost: 1000,
    hp: 125,
    speed: 1.6,
    sight: 7,
    weapons: ['pistols'],
    prereqs: ['barracks', 'lab'],
    from: 'barracks',
    commando: true,
    unique: true,
    selfHeal: 1,
  },
  lancer: {
    id: 'lancer',
    name: 'Lancer Tank',
    blurb: 'Quick main battle tank. Cheap and nimble, best in numbers.',
    faction: 'accord',
    ...TANK,
    cost: 700,
    hp: 300,
    armor: 'medium',
    speed: 2.2,
    sight: 6,
    turn: 3,
    weapons: ['cannon90'],
    turret: true,
    prereqs: ['factory'],
    from: 'factory',
  },
  striker: {
    id: 'striker',
    name: 'Striker',
    blurb: 'Fast missile carrier: shreds aircraft and light vehicles.',
    faction: 'accord',
    ...TANK,
    cost: 600,
    hp: 200,
    armor: 'light',
    speed: 2.8,
    sight: 7,
    turn: 3.4,
    weapons: ['strikerMissiles'],
    turret: true,
    prereqs: ['factory'],
    from: 'factory',
  },
  beamtank: {
    id: 'beamtank',
    name: 'Beam Tank',
    blurb: 'Fires a long-range beam that splits into more beams on impact. Fragile.',
    faction: 'accord',
    ...TANK,
    cost: 1200,
    hp: 160,
    armor: 'light',
    speed: 1.7,
    sight: 7,
    turn: 2.4,
    weapons: ['beamSplitter'],
    turret: true,
    prereqs: ['factory', 'lab'],
    from: 'factory',
  },
  oretruck: {
    id: 'oretruck',
    name: 'Warp Harvester',
    blurb: 'Mines ore, then warps straight back to the refinery. Unarmed.',
    faction: 'accord',
    ...TANK,
    cost: 1400,
    hp: 500,
    armor: 'medium',
    speed: 1.9,
    sight: 4,
    turn: 2.4,
    weapons: [],
    prereqs: ['factory', 'refinery'],
    from: 'factory',
    harvester: { capacity: 400, warp: true },
  },
  falcon: {
    id: 'falcon',
    name: 'Falcon Jet',
    blurb: 'Strike jet: two heavy missiles, then back to its pad to rearm.',
    faction: 'accord',
    kind: 'aircraft',
    cost: 1200,
    hp: 150,
    armor: 'aircraft',
    speed: 7,
    sight: 6,
    radius: 0.4,
    turn: 4,
    weapons: ['falconMissiles'],
    prereqs: ['radar'],
    from: 'radar',
    flies: 'jet',
    altitude: 2.6,
    ammo: 2,
  },
  draftee: {
    id: 'draftee',
    name: 'Draftee',
    blurb: 'Cheap, plentiful infantry with a submachine gun.',
    faction: 'bloc',
    ...INFANTRY,
    cost: 100,
    hp: 125,
    speed: 1.2,
    sight: 5,
    weapons: ['smg'],
    prereqs: ['barracks'],
    from: 'barracks',
    crushable: true,
    canGarrison: true,
  },
  flakgunner: {
    id: 'flakgunner',
    name: 'Flak Gunner',
    blurb: 'Shoulder flak gun: deadly to aircraft, handy against infantry.',
    faction: 'bloc',
    ...INFANTRY,
    cost: 300,
    hp: 120,
    speed: 1.2,
    sight: 6,
    weapons: ['flakRifle'],
    prereqs: ['barracks'],
    from: 'barracks',
    crushable: true,
    canGarrison: true,
  },
  torch: {
    id: 'torch',
    name: 'Torch Trooper',
    blurb: 'Armoured flamethrower. Can’t be run over and burns troops out of buildings.',
    faction: 'bloc',
    ...INFANTRY,
    cost: 500,
    hp: 150,
    speed: 1.1,
    sight: 5,
    weapons: ['torch'],
    prereqs: ['barracks', 'radar'],
    from: 'barracks',
  },
  bear: {
    id: 'bear',
    name: 'Bear Tank',
    blurb: 'Heavy main battle tank. Thick armour and a big gun.',
    faction: 'bloc',
    ...TANK,
    cost: 900,
    hp: 420,
    armor: 'heavy',
    speed: 1.8,
    sight: 6,
    turn: 2.4,
    weapons: ['cannon120'],
    turret: true,
    prereqs: ['factory'],
    from: 'factory',
  },
  flaktruck: {
    id: 'flaktruck',
    name: 'Flak Truck',
    blurb: 'Mobile flak cannon that keeps aircraft off your tanks.',
    faction: 'bloc',
    ...TANK,
    cost: 500,
    hp: 180,
    armor: 'light',
    speed: 2.5,
    sight: 7,
    turn: 3.2,
    weapons: ['flakCannon'],
    turret: true,
    prereqs: ['factory'],
    from: 'factory',
    transport: { slots: 5 },
  },
  rockettruck: {
    id: 'rockettruck',
    name: 'Rocket Truck',
    blurb: 'Long-range artillery rocket. Devastating against bases; helpless up close.',
    faction: 'bloc',
    ...TANK,
    cost: 800,
    hp: 150,
    armor: 'light',
    speed: 1.5,
    sight: 7,
    turn: 2.2,
    weapons: ['longshot'],
    prereqs: ['factory', 'radar'],
    from: 'factory',
  },
  behemoth: {
    id: 'behemoth',
    name: 'Behemoth',
    blurb: 'Twin-cannon super-heavy tank with anti-air missiles. Repairs itself.',
    faction: 'bloc',
    ...TANK,
    cost: 1750,
    hp: 800,
    armor: 'heavy',
    speed: 1.15,
    sight: 7,
    radius: 0.55,
    turn: 1.6,
    weapons: ['twin120', 'behemothAA'],
    turret: true,
    prereqs: ['factory', 'lab'],
    from: 'factory',
    selfHeal: 3,
  },
  orehauler: {
    id: 'orehauler',
    name: 'Ore Hauler',
    blurb: 'Armoured harvester with a machine gun. Slow, but carries twice the ore.',
    faction: 'bloc',
    ...TANK,
    cost: 1400,
    hp: 1000,
    armor: 'heavy',
    speed: 1.5,
    sight: 4,
    radius: 0.5,
    turn: 1.8,
    weapons: ['minerGun'],
    turret: true,
    prereqs: ['factory', 'refinery'],
    from: 'factory',
    harvester: { capacity: 1000 },
  },
  dirigible: {
    id: 'dirigible',
    name: 'Dirigible',
    blurb: 'Slow, enormous armoured airship that carpets bases with bombs.',
    faction: 'bloc',
    kind: 'aircraft',
    cost: 2000,
    hp: 1800,
    armor: 'aircraft',
    speed: 0.75,
    sight: 7,
    radius: 0.9,
    turn: 0.8,
    weapons: ['bombs'],
    prereqs: ['factory', 'lab'],
    from: 'factory',
    flies: 'airship',
    altitude: 3,
  },
  frigate: {
    id: 'frigate',
    name: 'Frigate',
    blurb: 'Quick gunship with depth charges. Hunts submarines and shells the shore.',
    faction: 'accord',
    kind: 'ship',
    cost: 1000,
    hp: 600,
    armor: 'ship',
    speed: 2.4,
    sight: 8,
    radius: 0.55,
    turn: 2,
    weapons: ['deckGun', 'depthCharges'],
    turret: true,
    prereqs: ['naval'],
    from: 'naval',
    naval: true,
  },
  cruiser: {
    id: 'cruiser',
    name: 'Sentinel Cruiser',
    blurb: 'Missile cruiser that keeps aircraft away from the fleet and the coast.',
    faction: 'accord',
    kind: 'ship',
    cost: 1200,
    hp: 700,
    armor: 'ship',
    speed: 2,
    sight: 9,
    radius: 0.6,
    turn: 1.6,
    weapons: ['cruiserMissiles'],
    turret: true,
    prereqs: ['naval', 'radar'],
    from: 'naval',
    naval: true,
  },
  monitor: {
    id: 'monitor',
    name: 'Monitor',
    blurb: 'Slow, heavily armoured ship with a huge gun that shells targets far inland.',
    faction: 'accord',
    kind: 'ship',
    cost: 2000,
    hp: 950,
    armor: 'ship',
    speed: 1.3,
    sight: 8,
    radius: 0.7,
    turn: 1.2,
    weapons: ['monitorGun'],
    turret: true,
    prereqs: ['naval', 'lab'],
    from: 'naval',
    naval: true,
  },
  sub: {
    id: 'sub',
    name: 'Hunter Sub',
    blurb:
      'Stays hidden underwater and sinks ships with torpedoes. Surfaces briefly when it fires.',
    faction: 'bloc',
    kind: 'ship',
    cost: 1000,
    hp: 600,
    armor: 'ship',
    speed: 2,
    sight: 7,
    radius: 0.5,
    turn: 2,
    weapons: ['torpedo'],
    prereqs: ['naval'],
    from: 'naval',
    naval: true,
    submarine: true,
  },
  flakboat: {
    id: 'flakboat',
    name: 'Flak Boat',
    blurb: 'Fast patrol boat: flak for aircraft and a machine gun for troops on the shore.',
    faction: 'bloc',
    kind: 'ship',
    cost: 600,
    hp: 420,
    armor: 'ship',
    speed: 3,
    sight: 8,
    radius: 0.45,
    turn: 2.6,
    weapons: ['boatFlak', 'boatGun'],
    turret: true,
    prereqs: ['naval'],
    from: 'naval',
    naval: true,
  },
  missileship: {
    id: 'missileship',
    name: 'Rocket Cruiser',
    blurb: 'Launches pairs of long-range rockets deep into enemy territory.',
    faction: 'bloc',
    kind: 'ship',
    cost: 2000,
    hp: 1000,
    armor: 'ship',
    speed: 1.2,
    sight: 8,
    radius: 0.75,
    turn: 1.1,
    weapons: ['cruiserRockets'],
    prereqs: ['naval', 'lab'],
    from: 'naval',
    naval: true,
  },
  hovercraft: {
    id: 'hovercraft',
    name: 'Hover Transport',
    blurb: 'Crosses land and water. Carries eight infantry or two vehicles. Unarmed.',
    faction: 'both',
    kind: 'vehicle',
    cost: 900,
    hp: 400,
    armor: 'light',
    speed: 2.6,
    sight: 6,
    radius: 0.6,
    turn: 2.4,
    weapons: [],
    prereqs: ['naval'],
    from: 'naval',
    amphibious: true,
    transport: { slots: 8, vehicles: true },
  },
};

export type StructureType =
  | 'a_hq'
  | 'a_power'
  | 'a_refinery'
  | 'a_barracks'
  | 'a_factory'
  | 'a_aircommand'
  | 'a_repair'
  | 'a_lab'
  | 'a_pillbox'
  | 'a_beamtower'
  | 'a_sam'
  | 'a_wall'
  | 'b_hq'
  | 'b_reactor'
  | 'b_refinery'
  | 'b_barracks'
  | 'b_factory'
  | 'b_radar'
  | 'b_repair'
  | 'b_lab'
  | 'b_nest'
  | 'b_bastion'
  | 'b_flak'
  | 'b_wall'
  | 'a_navalyard'
  | 'b_navalyard'
  | 'a_storm'
  | 'a_gate'
  | 'b_silo'
  | 'b_bulwark'
  | 'c_house'
  | 'c_flats'
  | 'c_store'
  | 'c_church'
  | 'c_derrick';

export type BuildTab = 'building' | 'defense' | 'infantry' | 'vehicle';

export interface StructureDef {
  id: StructureType;
  name: string;
  blurb: string;
  faction: Faction | 'neutral';
  role: Role;
  /** Which sidebar tab builds it; null for things that can't be built. */
  tab: 'building' | 'defense' | null;
  cost: number;
  hp: number;
  armor: 'building' | 'wall';
  /** Footprint in cells. */
  size: [number, number];
  /** Model height, for picking and effects. */
  height: number;
  power: number;
  prereqs: Role[];
  sight: number;
  weapon?: WeaponId;
  turret?: boolean;
  needsPower?: boolean;
  /** Units can drive over it (the repair pad). */
  walkable?: boolean;
  /** Aircraft landing pads. */
  pads?: number;
  /** How many infantry fit inside. */
  garrison?: number;
  /** Engineers can take it over. */
  capturable?: boolean;
  /** Credits every few seconds to whoever owns it. */
  income?: number;
  /** Built on water (shipyards). */
  onWater?: boolean;
  superweapon?: SuperweaponId;
}

export type SuperweaponId = 'storm' | 'phase' | 'missile' | 'shield';

export interface SuperweaponDef {
  name: string;
  /** Seconds to charge. */
  charge: number;
  /** Radius of the area it affects. */
  radius: number;
  /** What the targeting prompt says. */
  prompt: string;
}

export const SUPERWEAPONS: Record<SuperweaponId, SuperweaponDef> = {
  storm: {
    name: 'Lightning Storm',
    charge: 360,
    radius: 4.5,
    prompt: 'Click where to call down the storm.',
  },
  phase: {
    name: 'Phase Jump',
    charge: 240,
    radius: 2.5,
    prompt: 'Click a group of your units to jump, then where to send them.',
  },
  missile: {
    name: 'Hellfire Missile',
    charge: 420,
    radius: 4,
    prompt: 'Click the missile’s target.',
  },
  shield: {
    name: 'Bulwark Field',
    charge: 240,
    radius: 2.5,
    prompt: 'Click your units or buildings to make them invulnerable.',
  },
};

const BASE = { armor: 'building', sight: 5 } as const;

export const STRUCTURES: Record<StructureType, StructureDef> = {
  a_hq: {
    id: 'a_hq',
    name: 'Headquarters',
    blurb: 'Builds every other structure. Protect it.',
    faction: 'accord',
    role: 'hq',
    tab: null,
    ...BASE,
    cost: 3000,
    hp: 1000,
    size: [4, 4],
    height: 1.6,
    power: 0,
    prereqs: [],
    capturable: true,
  },
  a_power: {
    id: 'a_power',
    name: 'Fusion Plant',
    blurb: 'Supplies 200 power.',
    faction: 'accord',
    role: 'power',
    tab: 'building',
    ...BASE,
    cost: 800,
    hp: 750,
    size: [2, 2],
    height: 1.4,
    power: 200,
    prereqs: ['hq'],
    capturable: true,
  },
  a_refinery: {
    id: 'a_refinery',
    name: 'Ore Refinery',
    blurb: 'Turns ore into credits. Comes with a free harvester.',
    faction: 'accord',
    role: 'refinery',
    tab: 'building',
    ...BASE,
    cost: 2000,
    hp: 900,
    size: [3, 3],
    height: 1.5,
    power: -50,
    prereqs: ['power'],
    capturable: true,
  },
  a_barracks: {
    id: 'a_barracks',
    name: 'Barracks',
    blurb: 'Trains infantry.',
    faction: 'accord',
    role: 'barracks',
    tab: 'building',
    ...BASE,
    cost: 500,
    hp: 500,
    size: [2, 2],
    height: 1.1,
    power: -10,
    prereqs: ['power'],
    capturable: true,
  },
  a_factory: {
    id: 'a_factory',
    name: 'Motor Pool',
    blurb: 'Builds tanks and vehicles.',
    faction: 'accord',
    role: 'factory',
    tab: 'building',
    ...BASE,
    cost: 2000,
    hp: 1000,
    size: [3, 3],
    height: 1.5,
    power: -25,
    prereqs: ['refinery'],
    capturable: true,
  },
  a_aircommand: {
    id: 'a_aircommand',
    name: 'Air Command',
    blurb: 'Radar, plus four pads for Falcon jets.',
    faction: 'accord',
    role: 'radar',
    tab: 'building',
    ...BASE,
    cost: 1000,
    hp: 800,
    size: [3, 3],
    height: 1.2,
    power: -50,
    prereqs: ['refinery'],
    pads: 4,
    needsPower: true,
    capturable: true,
  },
  a_repair: {
    id: 'a_repair',
    name: 'Repair Bay',
    blurb: 'Drive vehicles onto the pad to fix them.',
    faction: 'accord',
    role: 'repair',
    tab: 'building',
    ...BASE,
    cost: 800,
    hp: 800,
    size: [3, 3],
    height: 0.9,
    power: -20,
    prereqs: ['factory'],
    walkable: true,
    capturable: true,
  },
  a_lab: {
    id: 'a_lab',
    name: 'Research Lab',
    blurb: 'Unlocks advanced units and defences.',
    faction: 'accord',
    role: 'lab',
    tab: 'building',
    ...BASE,
    cost: 2000,
    hp: 700,
    size: [3, 3],
    height: 1.7,
    power: -100,
    prereqs: ['factory', 'radar'],
    capturable: true,
  },
  a_pillbox: {
    id: 'a_pillbox',
    name: 'Pillbox',
    blurb: 'Machine-gun nest. Stops infantry cold.',
    faction: 'accord',
    role: 'defense',
    tab: 'defense',
    ...BASE,
    cost: 500,
    hp: 450,
    size: [1, 1],
    height: 0.5,
    power: 0,
    prereqs: ['barracks'],
    weapon: 'pillboxGun',
    sight: 6,
  },
  a_beamtower: {
    id: 'a_beamtower',
    name: 'Beam Tower',
    blurb: 'Long-range beam. Nearby towers relay power into the one that fires. Needs power.',
    faction: 'accord',
    role: 'defense',
    tab: 'defense',
    ...BASE,
    cost: 1500,
    hp: 600,
    size: [1, 1],
    height: 1.9,
    power: -75,
    prereqs: ['radar'],
    weapon: 'beamTower',
    needsPower: true,
    sight: 9,
  },
  a_sam: {
    id: 'a_sam',
    name: 'SAM Site',
    blurb: 'Anti-aircraft missiles. Needs power.',
    faction: 'accord',
    role: 'defense',
    tab: 'defense',
    ...BASE,
    cost: 1000,
    hp: 600,
    size: [1, 1],
    height: 0.7,
    power: -50,
    prereqs: ['radar'],
    weapon: 'samMissiles',
    turret: true,
    needsPower: true,
    sight: 9,
  },
  a_wall: {
    id: 'a_wall',
    name: 'Wall',
    blurb: 'Concrete wall. Drag to build a line.',
    faction: 'accord',
    role: 'wall',
    tab: 'defense',
    armor: 'wall',
    sight: 1,
    cost: 100,
    hp: 300,
    size: [1, 1],
    height: 0.55,
    power: 0,
    prereqs: ['power'],
  },
  b_hq: {
    id: 'b_hq',
    name: 'Headquarters',
    blurb: 'Builds every other structure. Protect it.',
    faction: 'bloc',
    role: 'hq',
    tab: null,
    ...BASE,
    cost: 3000,
    hp: 1000,
    size: [4, 4],
    height: 1.7,
    power: 0,
    prereqs: [],
    capturable: true,
  },
  b_reactor: {
    id: 'b_reactor',
    name: 'Reactor',
    blurb: 'Supplies 150 power. Cheap.',
    faction: 'bloc',
    role: 'power',
    tab: 'building',
    ...BASE,
    cost: 600,
    hp: 750,
    size: [2, 2],
    height: 1.5,
    power: 150,
    prereqs: ['hq'],
    capturable: true,
  },
  b_refinery: {
    id: 'b_refinery',
    name: 'Ore Refinery',
    blurb: 'Turns ore into credits. Comes with a free harvester.',
    faction: 'bloc',
    role: 'refinery',
    tab: 'building',
    ...BASE,
    cost: 2000,
    hp: 900,
    size: [3, 3],
    height: 1.5,
    power: -50,
    prereqs: ['power'],
    capturable: true,
  },
  b_barracks: {
    id: 'b_barracks',
    name: 'Barracks',
    blurb: 'Trains infantry.',
    faction: 'bloc',
    role: 'barracks',
    tab: 'building',
    ...BASE,
    cost: 500,
    hp: 500,
    size: [2, 2],
    height: 1.1,
    power: -10,
    prereqs: ['power'],
    capturable: true,
  },
  b_factory: {
    id: 'b_factory',
    name: 'Tank Works',
    blurb: 'Builds tanks, vehicles and airships.',
    faction: 'bloc',
    role: 'factory',
    tab: 'building',
    ...BASE,
    cost: 2000,
    hp: 1000,
    size: [3, 3],
    height: 1.6,
    power: -25,
    prereqs: ['refinery'],
    capturable: true,
  },
  b_radar: {
    id: 'b_radar',
    name: 'Radar Mast',
    blurb: 'Shows the battlefield on your radar.',
    faction: 'bloc',
    role: 'radar',
    tab: 'building',
    ...BASE,
    cost: 1000,
    hp: 800,
    size: [2, 2],
    height: 2.2,
    power: -50,
    prereqs: ['refinery'],
    needsPower: true,
    capturable: true,
  },
  b_repair: {
    id: 'b_repair',
    name: 'Repair Bay',
    blurb: 'Drive vehicles onto the pad to fix them.',
    faction: 'bloc',
    role: 'repair',
    tab: 'building',
    ...BASE,
    cost: 800,
    hp: 800,
    size: [3, 3],
    height: 0.9,
    power: -20,
    prereqs: ['factory'],
    walkable: true,
    capturable: true,
  },
  b_lab: {
    id: 'b_lab',
    name: 'Research Lab',
    blurb: 'Unlocks advanced units and defences.',
    faction: 'bloc',
    role: 'lab',
    tab: 'building',
    ...BASE,
    cost: 2000,
    hp: 700,
    size: [3, 3],
    height: 1.8,
    power: -100,
    prereqs: ['factory', 'radar'],
    capturable: true,
  },
  b_nest: {
    id: 'b_nest',
    name: 'Gun Nest',
    blurb: 'Rapid-fire machine gun against infantry.',
    faction: 'bloc',
    role: 'defense',
    tab: 'defense',
    ...BASE,
    cost: 500,
    hp: 450,
    size: [1, 1],
    height: 0.6,
    power: 0,
    prereqs: ['barracks'],
    weapon: 'nestGun',
    turret: true,
    sight: 6,
  },
  b_bastion: {
    id: 'b_bastion',
    name: 'Bastion',
    blurb: 'Twin heavy cannons that crack tanks. Needs power.',
    faction: 'bloc',
    role: 'defense',
    tab: 'defense',
    ...BASE,
    cost: 1500,
    hp: 750,
    size: [1, 1],
    height: 1.2,
    power: -75,
    prereqs: ['radar'],
    weapon: 'bastionGun',
    turret: true,
    needsPower: true,
    sight: 8,
  },
  b_flak: {
    id: 'b_flak',
    name: 'Flak Cannon',
    blurb: 'Fills the sky with flak. Needs power.',
    faction: 'bloc',
    role: 'defense',
    tab: 'defense',
    ...BASE,
    cost: 1000,
    hp: 600,
    size: [1, 1],
    height: 0.8,
    power: -50,
    prereqs: ['radar'],
    weapon: 'flakGun',
    turret: true,
    needsPower: true,
    sight: 9,
  },
  b_wall: {
    id: 'b_wall',
    name: 'Wall',
    blurb: 'Fortress wall. Drag to build a line.',
    faction: 'bloc',
    role: 'wall',
    tab: 'defense',
    armor: 'wall',
    sight: 1,
    cost: 100,
    hp: 350,
    size: [1, 1],
    height: 0.6,
    power: 0,
    prereqs: ['power'],
  },
  a_navalyard: {
    id: 'a_navalyard',
    name: 'Naval Yard',
    blurb: 'Builds ships and hover transports. Must go on water, near your base.',
    faction: 'accord',
    role: 'naval',
    tab: 'building',
    ...BASE,
    cost: 1000,
    hp: 1200,
    size: [3, 3],
    height: 0.9,
    power: -20,
    prereqs: ['refinery'],
    onWater: true,
    capturable: true,
  },
  b_navalyard: {
    id: 'b_navalyard',
    name: 'Shipyard',
    blurb: 'Builds ships and hover transports. Must go on water, near your base.',
    faction: 'bloc',
    role: 'naval',
    tab: 'building',
    ...BASE,
    cost: 1000,
    hp: 1200,
    size: [3, 3],
    height: 1,
    power: -20,
    prereqs: ['refinery'],
    onWater: true,
    capturable: true,
  },
  a_storm: {
    id: 'a_storm',
    name: 'Storm Array',
    blurb: 'Superweapon: brews a lightning storm over any spot on the map. Hits everything.',
    faction: 'accord',
    role: 'super',
    tab: 'building',
    ...BASE,
    cost: 5000,
    hp: 1000,
    size: [3, 3],
    height: 2.3,
    power: -150,
    prereqs: ['lab'],
    superweapon: 'storm',
  },
  a_gate: {
    id: 'a_gate',
    name: 'Phase Gate',
    blurb: 'Superweapon: jumps a group of your ground units to anywhere you’ve explored.',
    faction: 'accord',
    role: 'super',
    tab: 'building',
    ...BASE,
    cost: 2500,
    hp: 900,
    size: [3, 3],
    height: 1.7,
    power: -100,
    prereqs: ['lab'],
    superweapon: 'phase',
  },
  b_silo: {
    id: 'b_silo',
    name: 'Hellfire Silo',
    blurb: 'Superweapon: launches a thermobaric missile at any spot on the map. Hits everything.',
    faction: 'bloc',
    role: 'super',
    tab: 'building',
    ...BASE,
    cost: 5000,
    hp: 1000,
    size: [3, 3],
    height: 1,
    power: -150,
    prereqs: ['lab'],
    superweapon: 'missile',
  },
  b_bulwark: {
    id: 'b_bulwark',
    name: 'Bulwark Field',
    blurb: 'Superweapon: makes your units and buildings in an area invulnerable for 20 seconds.',
    faction: 'bloc',
    role: 'super',
    tab: 'building',
    ...BASE,
    cost: 2500,
    hp: 900,
    size: [3, 3],
    height: 1.8,
    power: -100,
    prereqs: ['lab'],
    superweapon: 'shield',
  },
  c_house: {
    id: 'c_house',
    name: 'House',
    blurb: 'Infantry can take cover inside.',
    faction: 'neutral',
    role: 'civilian',
    tab: null,
    ...BASE,
    cost: 600,
    hp: 700,
    size: [2, 2],
    height: 1.2,
    power: 0,
    prereqs: [],
    garrison: 3,
  },
  c_flats: {
    id: 'c_flats',
    name: 'Apartment Block',
    blurb: 'Infantry can take cover inside.',
    faction: 'neutral',
    role: 'civilian',
    tab: null,
    ...BASE,
    cost: 1000,
    hp: 1100,
    size: [3, 2],
    height: 2.2,
    power: 0,
    prereqs: [],
    garrison: 6,
  },
  c_store: {
    id: 'c_store',
    name: 'Corner Store',
    blurb: 'Infantry can take cover inside.',
    faction: 'neutral',
    role: 'civilian',
    tab: null,
    ...BASE,
    cost: 600,
    hp: 800,
    size: [2, 2],
    height: 1,
    power: 0,
    prereqs: [],
    garrison: 4,
  },
  c_church: {
    id: 'c_church',
    name: 'Chapel',
    blurb: 'Infantry can take cover inside.',
    faction: 'neutral',
    role: 'civilian',
    tab: null,
    ...BASE,
    cost: 800,
    hp: 1000,
    size: [2, 3],
    height: 2.4,
    power: 0,
    prereqs: [],
    garrison: 5,
  },
  c_derrick: {
    id: 'c_derrick',
    name: 'Oil Derrick',
    blurb: 'Capture it with an Engineer for a steady trickle of credits.',
    faction: 'neutral',
    role: 'derrick',
    tab: null,
    ...BASE,
    cost: 1000,
    hp: 600,
    size: [2, 2],
    height: 1.8,
    power: 0,
    prereqs: [],
    capturable: true,
    income: 25,
  },
};

/** Every faction's version of each role. */
export const HQ: Record<Faction, StructureType> = { accord: 'a_hq', bloc: 'b_hq' };
export const BASIC_INFANTRY: Record<Faction, UnitType> = { accord: 'rifleman', bloc: 'draftee' };

/** Credits spent per second on one item when a player has one producer and full power. */
export const BUILD_RATE = 60;
/** How far from existing structures new ones can go, in cells. */
export const BUILD_REACH = 3;
/** What a full ore cell holds, in bales; and what one bale is worth. */
export const MAX_ORE = 12;
export const ORE_VALUE = 25;
export const GEM_VALUE = 50;

export function unitAvailableTo(def: UnitDef, faction: Faction): boolean {
  return def.faction === 'both' || def.faction === faction;
}

export function structureAvailableTo(def: StructureDef, faction: Faction): boolean {
  return def.tab !== null && def.faction === faction;
}

export function buildTab(def: UnitDef): BuildTab {
  return def.kind === 'infantry' ? 'infantry' : 'vehicle';
}

/** How a unit gets about on the ground (flying units don't use this). */
export function mobilityOf(def: UnitDef): 'ground' | 'naval' | 'amphibious' {
  if (def.naval) return 'naval';
  if (def.amphibious) return 'amphibious';
  return 'ground';
}
