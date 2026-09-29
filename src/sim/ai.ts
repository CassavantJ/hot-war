import { HARVESTER } from './economy';
import { DT, type Structure, type Unit } from './entities';
import { orderAttack, orderEnter, orderHarvest, orderMove } from './orders';
import type { Player } from './player';
import {
  available,
  cancelBuild,
  placementCheck,
  placeStructure,
  startBuild,
  toggleRepair,
} from './production';
import { Random } from './random';
import {
  STRUCTURES,
  UNITS,
  type Faction,
  type Role,
  type StructureType,
  type UnitType,
} from './rules';
import type { World } from './world';

interface Tuning {
  /** Seconds between decisions. */
  think: number;
  harvestersPerRefinery: number;
  defenses: number;
  /** Army value needed for the first attack, and how much more for each one after. */
  firstWave: number;
  waveGrowth: number;
  maxWave: number;
  /** Earliest first attack, in seconds. */
  firstAttack: number;
  /** Credits kept back for buildings before spending on units. */
  reserve: number;
}

const TUNING: Record<'easy' | 'normal' | 'hard', Tuning> = {
  easy: {
    think: 2,
    harvestersPerRefinery: 1,
    defenses: 1,
    firstWave: 2500,
    waveGrowth: 700,
    maxWave: 6000,
    firstAttack: 480,
    reserve: 1200,
  },
  normal: {
    think: 1.2,
    harvestersPerRefinery: 2,
    defenses: 3,
    firstWave: 4000,
    waveGrowth: 1200,
    maxWave: 10000,
    firstAttack: 330,
    reserve: 600,
  },
  hard: {
    think: 0.7,
    harvestersPerRefinery: 2,
    defenses: 4,
    firstWave: 5000,
    waveGrowth: 1500,
    maxWave: 14000,
    firstAttack: 240,
    reserve: 300,
  },
};

/** Base-building order: [role, how many, from which minute]. */
const BUILD_PLAN: [Role, number, number][] = [
  ['power', 1, 0],
  ['refinery', 1, 0],
  ['barracks', 1, 0],
  ['factory', 1, 0],
  ['refinery', 2, 0],
  ['radar', 1, 0],
  ['repair', 1, 3],
  ['lab', 1, 5],
  ['factory', 2, 9],
  ['barracks', 2, 10],
  ['refinery', 3, 12],
];

const INFANTRY_MIX: Record<Faction, [UnitType, number][]> = {
  accord: [
    ['rifleman', 5],
    ['hound', 1],
    ['skyjumper', 1.5],
    ['commando', 0.6],
  ],
  bloc: [
    ['draftee', 5],
    ['flakgunner', 1.5],
    ['hound', 1],
    ['torch', 3],
  ],
};

const VEHICLE_MIX: Record<Faction, [UnitType, number][]> = {
  accord: [
    ['lancer', 5],
    ['striker', 1.5],
    ['beamtank', 3],
  ],
  bloc: [
    ['bear', 5],
    ['flaktruck', 1.2],
    ['rockettruck', 1.4],
    ['behemoth', 3],
    ['dirigible', 0.5],
  ],
};

/** Defences in the order they're built; the AI waits for each one to be unlocked. */
const DEFENSES: Record<Faction, StructureType[]> = {
  accord: ['a_pillbox', 'a_beamtower', 'a_sam', 'a_beamtower', 'a_pillbox', 'a_beamtower', 'a_sam'],
  bloc: ['b_nest', 'b_bastion', 'b_flak', 'b_bastion', 'b_nest', 'b_bastion', 'b_flak'],
};

function structureFor(faction: Faction, role: Role): StructureType | null {
  const def = Object.values(STRUCTURES).find(
    (candidate) =>
      candidate.faction === faction && candidate.role === role && candidate.tab !== null,
  );
  return def?.id ?? null;
}

function isCombat(unit: Unit): boolean {
  return (
    unit.def.weapons.length > 0 && !unit.def.harvester && !unit.def.deploysToHq && !unit.inside
  );
}

/** A computer opponent: builds a base, mines ore, trains an army and attacks in waves. */
export class AiBrain {
  readonly player: Player;
  private readonly world: World;
  private readonly tuning: Tuning;
  private readonly rng: Random;
  private timer: number;
  private waves = 0;
  private readonly attackers = new Set<number>();
  private enemy = -1;
  private defenseCount = 0;

  constructor(world: World, player: Player) {
    this.world = world;
    this.player = player;
    this.tuning = TUNING[player.ai ?? 'normal'];
    this.rng = new Random(world.settings.seed * 97 + player.index * 13 + 5);
    this.timer = 0.5 + player.index * 0.13;
  }

  update(): void {
    this.timer -= DT;
    if (this.timer > 0 || this.player.defeated) return;
    this.timer = this.tuning.think;
    this.deployTrucks();
    const hq = this.hq();
    if (hq) {
      this.placeReady(hq);
      this.planBase();
      this.planDefenses();
      this.repairBase();
    }
    this.trainUnits();
    this.manageUnits(hq);
  }

  private get minutes(): number {
    return this.world.time / 60;
  }

  private own<T extends Unit | Structure>(list: T[]): T[] {
    return list.filter((thing) => thing.owner === this.player.index && !thing.dead);
  }

  private hq(): Structure | null {
    return this.own(this.world.structures).find((structure) => structure.def.role === 'hq') ?? null;
  }

  /** Base trucks drive to open ground near where they are and set up. */
  private deployTrucks(): void {
    const world = this.world;
    const hasHq = this.hq() !== null;
    for (const unit of this.own(world.units)) {
      if (!unit.def.deploysToHq || unit.order.kind !== 'idle') continue;
      if (hasHq && world.time > 5) continue;
      const type = this.player.faction === 'accord' ? 'a_hq' : 'b_hq';
      const spot = this.findSpot(type, unit.x, unit.z, 10, unit.id, true);
      if (!spot) continue;
      const cx = spot.x + 2;
      const cz = spot.z + 2;
      if (Math.hypot(unit.x - cx, unit.z - cz) < 0.6) {
        unit.order = { kind: 'deploy' };
      } else {
        orderMove(world, [unit], cx, cz);
      }
    }
  }

  private roleCount(role: Role): number {
    let count = 0;
    for (const structure of this.world.structures) {
      if (structure.owner === this.player.index && structure.def.role === role) count++;
    }
    for (const queue of [this.player.queues.building, this.player.queues.defense]) {
      if (queue.ready && STRUCTURES[queue.ready].role === role) count++;
      for (const item of queue.items) {
        if (item.type in STRUCTURES && STRUCTURES[item.type as StructureType].role === role)
          count++;
      }
    }
    return count;
  }

  private placeReady(hq: Structure): void {
    for (const kind of ['building', 'defense'] as const) {
      const type = this.player.queues[kind].ready;
      if (!type) continue;
      const anchor = this.anchorFor(type, hq);
      const spot = this.findSpot(type, anchor.x, anchor.z, 18, 0, false);
      if (!spot || !placeStructure(this.world, this.player, type, spot.x, spot.z)) {
        cancelBuild(this.world, this.player, type);
      }
    }
  }

  private planBase(): void {
    const player = this.player;
    const queue = player.queues.building;
    if (queue.items.length > 0 || queue.ready) return;
    // Wait for the last one to finish rising: it may unlock the next.
    if (this.own(this.world.structures).some((structure) => structure.built < 1)) return;
    const surplus = player.powerOut - player.powerUse;
    let next: StructureType | null = null;
    for (const [role, count, minute] of BUILD_PLAN) {
      if (this.minutes < minute * (player.ai === 'hard' ? 0.6 : 1)) continue;
      if (player.ai === 'easy' && (role === 'lab' || count > 2)) continue;
      if (this.roleCount(role) >= count) continue;
      const type = structureFor(player.faction, role);
      if (type && available(this.world, player, type)) {
        next = type;
        break;
      }
    }
    const power = structureFor(player.faction, 'power');
    const need = next ? -STRUCTURES[next].power : 0;
    if (power && (surplus - need < 20 || (!next && surplus < 60))) next = power;
    if (!next && player.credits > 3000 && this.roleCount('refinery') < 4 && this.minutes > 15) {
      next = structureFor(player.faction, 'refinery');
    }
    if (next) startBuild(this.world, player, next);
  }

  private planDefenses(): void {
    const player = this.player;
    const queue = player.queues.defense;
    if (queue.items.length > 0 || queue.ready) return;
    if (!player.has('factory') || player.credits < 400) return;
    this.defenseCount = this.roleCount('defense');
    const limit = this.tuning.defenses + Math.floor(this.minutes / 10);
    if (this.defenseCount >= limit) return;
    const options = DEFENSES[player.faction];
    const type = options[this.defenseCount % options.length];
    if (type && available(this.world, player, type)) startBuild(this.world, player, type);
  }

  private repairBase(): void {
    if (this.player.credits < 400) return;
    for (const structure of this.own(this.world.structures)) {
      if (!structure.repairing && structure.working && structure.hp < structure.maxHp * 0.7) {
        toggleRepair(this.world, structure);
      }
    }
  }

  private trainUnits(): void {
    const world = this.world;
    const player = this.player;
    const units = this.own(world.units);
    const buildingBusy = player.queues.building.items.length > 0;
    const reserve = buildingBusy ? this.tuning.reserve : 0;
    // Harvesters first: an army is useless without income.
    const harvesters = units.filter((unit) => unit.def.harvester).length;
    const refineries = player.count('refinery');
    const wantHarvesters = Math.min(6, refineries * this.tuning.harvestersPerRefinery);
    const harvester = HARVESTER[player.faction];
    const vehicleQueue = player.queues.vehicle;
    const queuedHarvesters = vehicleQueue.items.filter((item) => item.type === harvester).length;
    if (harvesters + queuedHarvesters < wantHarvesters && available(world, player, harvester)) {
      if (queuedHarvesters === 0)
        vehicleQueue.items.unshift({ type: harvester, progress: 0, paid: 0, onHold: false });
      return;
    }
    // A lost headquarters gets replaced.
    if (!player.has('hq') && !units.some((unit) => unit.def.deploysToHq)) {
      if (!vehicleQueue.items.some((item) => item.type === 'basetruck')) {
        startBuild(world, player, 'basetruck');
      }
    }
    if (player.credits < reserve + 150) return;
    const army = units.filter(isCombat);
    if (army.length >= 70) return;
    // Keep a sensible mix: mostly tanks once there's a factory to build them.
    let infantryValue = 0;
    let vehicleValue = 0;
    for (const unit of army) {
      if (unit.def.kind === 'infantry') infantryValue += unit.def.cost;
      else vehicleValue += unit.def.cost;
    }
    const share = player.faction === 'accord' ? 0.45 : 0.35;
    const wantInfantry = player.has('factory')
      ? infantryValue <= (infantryValue + vehicleValue) * share + 600
      : army.length < 8;
    let started = false;
    if (player.queues.vehicle.items.length < 2 && player.credits > reserve + 300) {
      const type = this.pick(VEHICLE_MIX[player.faction], units);
      if (type) started = startBuild(world, player, type);
    }
    if (player.ai === 'easy' && started) return;
    if (wantInfantry && player.queues.infantry.items.length < 2) {
      const type = this.pick(INFANTRY_MIX[player.faction], units);
      if (type) startBuild(world, player, type);
    }
    if (
      player.faction === 'accord' &&
      player.ai !== 'easy' &&
      player.queues.aircraft.items.length === 0
    ) {
      if (available(world, player, 'falcon') && player.credits > reserve + 1500) {
        startBuild(world, player, 'falcon');
      }
    }
  }

  /** A weighted pick among what's buildable, leaning to anti-air if the enemy flies. */
  private pick(mix: [UnitType, number][], units: Unit[]): UnitType | null {
    const world = this.world;
    const player = this.player;
    const enemyAir = world.units.filter(
      (unit) => unit.def.flies && world.isEnemy(player.index, unit.owner),
    ).length;
    const ourAntiAir = units.filter((unit) =>
      unit.def.weapons.some(
        (id) => id === 'strikerMissiles' || id === 'flakCannon' || id === 'flakRifle',
      ),
    ).length;
    const options = mix.filter(([type]) => {
      if (!available(world, player, type)) return false;
      if (
        type === 'dirigible' &&
        (player.ai !== 'hard' || units.filter((u) => u.type === type).length >= 2)
      ) {
        return false;
      }
      return true;
    });
    if (options.length === 0) return null;
    const weights = options.map(([type, weight]) => {
      const def = UNITS[type];
      const antiAir = def.weapons.some(
        (id) => id === 'strikerMissiles' || id === 'flakCannon' || id === 'flakRifle',
      );
      return antiAir && enemyAir > ourAntiAir ? weight * 4 : weight;
    });
    const total = weights.reduce((sum, weight) => sum + weight, 0);
    let roll = this.rng.range(0, total);
    for (let i = 0; i < options.length; i++) {
      roll -= weights[i] ?? 0;
      if (roll <= 0) return options[i]?.[0] ?? null;
    }
    return options[0]?.[0] ?? null;
  }

  private manageUnits(hq: Structure | null): void {
    const world = this.world;
    const player = this.player;
    const units = this.own(world.units);
    const base = hq ?? { cx: player.start.x + 0.5, cz: player.start.z + 0.5 };
    const enemy = this.pickEnemy(base.cx, base.cz);
    // Rally new units a little way towards the enemy.
    const home = this.homePoint(base.cx, base.cz, enemy);
    for (const structure of this.own(world.structures)) {
      if (structure.def.role === 'barracks' || structure.def.role === 'factory')
        structure.rally = home;
    }
    // Idle harvesters go back to work.
    for (const unit of units) {
      if (unit.def.harvester && unit.order.kind === 'idle') orderHarvest([unit], -1);
    }
    this.sendEngineers(units, base.cx, base.cz);
    // Defend the base first.
    const threat = this.threat(base.cx, base.cz);
    const homeGuard = units.filter((unit) => isCombat(unit) && !this.attackers.has(unit.id));
    if (threat) {
      const responders = homeGuard.filter(
        (unit) => unit.order.kind === 'idle' || (unit.order.kind === 'move' && !unit.order.attack),
      );
      if (responders.length > 0) orderMove(world, responders, threat.x, threat.z, true);
    }
    // Waves.
    for (const id of this.attackers) {
      if (!world.unit(id)) this.attackers.delete(id);
    }
    const groundHome = homeGuard.filter((unit) => unit.def.flies !== 'jet');
    const value = groundHome.reduce((sum, unit) => sum + unit.def.cost, 0);
    const needed = Math.min(
      this.tuning.maxWave,
      this.tuning.firstWave + this.waves * this.tuning.waveGrowth,
    );
    if (
      !threat &&
      enemy &&
      world.time >= this.tuning.firstAttack &&
      value >= needed &&
      this.attackers.size < 4
    ) {
      this.waves++;
      // Send roughly what's needed (hard sends nearly everything), keeping the rest home.
      const wave: Unit[] = [];
      let sent = 0;
      const budget = player.ai === 'hard' ? value * 0.85 : needed * 1.25;
      for (const unit of groundHome) {
        if (sent >= budget) break;
        wave.push(unit);
        sent += unit.def.cost;
      }
      for (const unit of wave) this.attackers.add(unit.id);
      const target = this.targetNear(enemy, base.cx, base.cz);
      if (target) orderMove(world, wave, target.x, target.z, true);
    }
    // Keep waves pushing: idle attackers head for the next enemy building.
    for (const id of this.attackers) {
      const unit = world.unit(id);
      if (!unit || unit.def.flies === 'jet') continue;
      if (unit.def.commando) {
        this.commando(unit);
        continue;
      }
      if (unit.order.kind !== 'idle') continue;
      const target = this.targetNear(enemy, unit.x, unit.z);
      if (!target) continue;
      if (unit.def.flies === 'airship' && target.entity) orderAttack(world, [unit], target.entity);
      else orderMove(world, [unit], target.x, target.z, true);
    }
    this.flyJets(units, enemy);
  }

  private homePoint(x: number, z: number, enemy: Player | null): { x: number; z: number } {
    if (!enemy) return { x: x, z: z + 5 };
    const dx = enemy.start.x - x;
    const dz = enemy.start.z - z;
    const length = Math.hypot(dx, dz) || 1;
    return { x: x + (dx / length) * 7, z: z + (dz / length) * 7 };
  }

  private pickEnemy(x: number, z: number): Player | null {
    const world = this.world;
    const current = world.players[this.enemy];
    if (current && !current.defeated && world.isEnemy(this.player.index, current.index)) {
      return current;
    }
    let best: Player | null = null;
    let bestDistance = Infinity;
    for (const player of world.players) {
      if (player.defeated || !world.isEnemy(this.player.index, player.index)) continue;
      const distance =
        Math.hypot(player.start.x - x, player.start.z - z) * this.rng.range(0.8, 1.2);
      if (distance < bestDistance) {
        bestDistance = distance;
        best = player;
      }
    }
    this.enemy = best?.index ?? -1;
    return best;
  }

  /** The enemy building (or failing that, unit) closest to a point. */
  private targetNear(
    enemy: Player | null,
    x: number,
    z: number,
  ): { x: number; z: number; entity: Structure | Unit | null } | null {
    if (!enemy) return null;
    const world = this.world;
    let best: Structure | Unit | null = null;
    let bestDistance = Infinity;
    for (const structure of world.structures) {
      if (structure.owner !== enemy.index || structure.def.role === 'wall') continue;
      const distance = Math.hypot(structure.cx - x, structure.cz - z);
      if (distance < bestDistance) {
        bestDistance = distance;
        best = structure;
      }
    }
    if (!best) {
      for (const unit of world.units) {
        if (unit.owner !== enemy.index) continue;
        const distance = Math.hypot(unit.x - x, unit.z - z);
        if (distance < bestDistance) {
          bestDistance = distance;
          best = unit;
        }
      }
    }
    if (!best) return { x: enemy.start.x + 0.5, z: enemy.start.z + 0.5, entity: null };
    return best.entity === 'structure'
      ? { x: best.cx, z: best.cz, entity: best }
      : { x: best.x, z: best.z, entity: best };
  }

  /** The nearest enemy unit inside our base, if any. */
  private threat(x: number, z: number): { x: number; z: number } | null {
    const world = this.world;
    let radius = 14;
    for (const structure of this.own(world.structures)) {
      radius = Math.max(radius, Math.hypot(structure.cx - x, structure.cz - z) + 7);
    }
    let best: { x: number; z: number } | null = null;
    let bestDistance = radius;
    for (const unit of world.units) {
      if (!world.isEnemy(this.player.index, unit.owner) || unit.inside) continue;
      if (unit.def.weapons.length === 0 && !unit.def.engineer) continue;
      const distance = Math.hypot(unit.x - x, unit.z - z);
      if (distance < bestDistance) {
        bestDistance = distance;
        best = { x: unit.x, z: unit.z };
      }
    }
    return best;
  }

  private sendEngineers(units: Unit[], x: number, z: number): void {
    const world = this.world;
    for (const unit of units) {
      if (!unit.def.engineer || unit.order.kind !== 'idle') continue;
      let best: Structure | null = null;
      let bestDistance = 40;
      for (const structure of world.structures) {
        if (structure.def.role !== 'derrick' || structure.owner === this.player.index) continue;
        if (structure.owner >= 0 && !world.isEnemy(this.player.index, structure.owner)) continue;
        const distance = Math.hypot(structure.cx - x, structure.cz - z);
        if (distance < bestDistance) {
          bestDistance = distance;
          best = structure;
        }
      }
      if (best) orderEnter([unit], best);
    }
    if (this.player.ai === 'easy') return;
    const engineers = units.filter((unit) => unit.def.engineer).length;
    const free = world.structures.some(
      (structure) =>
        structure.def.role === 'derrick' &&
        structure.owner < 0 &&
        Math.hypot(structure.cx - x, structure.cz - z) < 40,
    );
    if (
      free &&
      engineers === 0 &&
      this.player.queues.infantry.items.length === 0 &&
      this.player.credits > 800
    ) {
      startBuild(world, this.player, 'engineer');
    }
  }

  /** The commando walks up to the enemy's most valuable building and blows it up. */
  private commando(unit: Unit): void {
    if (unit.order.kind !== 'idle' && unit.order.kind !== 'move') return;
    const world = this.world;
    let best: Structure | null = null;
    let bestScore = -Infinity;
    for (const structure of world.structures) {
      if (!world.isEnemy(unit.owner, structure.owner) || structure.def.role === 'wall') continue;
      if (structure.charge > 0) continue;
      const distance = Math.hypot(structure.cx - unit.x, structure.cz - unit.z);
      if (distance > 14) continue;
      const score = structure.def.cost / 100 - distance;
      if (score > bestScore) {
        bestScore = score;
        best = structure;
      }
    }
    if (best) orderEnter([unit], best);
    else if (unit.order.kind === 'idle') {
      const target = this.targetNear(world.players[this.enemy] ?? null, unit.x, unit.z);
      if (target) orderMove(world, [unit], target.x, target.z, true);
    }
  }

  /** Jets on their pads with missiles loaded go after something worth hitting. */
  private flyJets(units: Unit[], enemy: Player | null): void {
    if (!enemy) return;
    const world = this.world;
    for (const jet of units) {
      if (jet.def.flies !== 'jet' || jet.flight !== 'landed' || jet.ammo < (jet.def.ammo ?? 0)) {
        continue;
      }
      if (jet.order.kind !== 'idle') continue;
      let best: Unit | Structure | null = null;
      let bestScore = -Infinity;
      for (const unit of world.units) {
        if (unit.owner !== enemy.index || unit.def.flies) continue;
        const score =
          (unit.def.harvester ? 2000 : unit.def.cost) -
          Math.hypot(unit.x - jet.x, unit.z - jet.z) * 20;
        if (score > bestScore) {
          bestScore = score;
          best = unit;
        }
      }
      for (const structure of world.structures) {
        if (structure.owner !== enemy.index || !structure.def.weapon) continue;
        const score =
          structure.def.cost - Math.hypot(structure.cx - jet.x, structure.cz - jet.z) * 20;
        if (score > bestScore) {
          bestScore = score;
          best = structure;
        }
      }
      if (best) orderAttack(world, [jet], best);
    }
  }

  /** Where to put a new structure: refineries near ore, defences towards the enemy. */
  private anchorFor(type: StructureType, hq: Structure): { x: number; z: number } {
    const def = STRUCTURES[type];
    const world = this.world;
    if (def.role === 'refinery') {
      const ore = this.nearestOre(hq.cx, hq.cz);
      if (ore) return { x: hq.cx + (ore.x - hq.cx) * 0.7, z: hq.cz + (ore.z - hq.cz) * 0.7 };
    }
    if (def.role === 'defense') {
      const enemy = world.players[this.enemy];
      const angle =
        (enemy ? Math.atan2(enemy.start.z - hq.cz, enemy.start.x - hq.cx) : 0) +
        this.rng.range(-0.9, 0.9);
      const distance = this.rng.range(6, 10);
      return { x: hq.cx + Math.cos(angle) * distance, z: hq.cz + Math.sin(angle) * distance };
    }
    return { x: hq.cx, z: hq.cz };
  }

  private nearestOre(x: number, z: number): { x: number; z: number } | null {
    const map = this.world.map;
    let best: { x: number; z: number } | null = null;
    let bestDistance = 26;
    for (let cz = Math.max(0, Math.floor(z - 26)); cz < Math.min(map.height, z + 26); cz++) {
      for (let cx = Math.max(0, Math.floor(x - 26)); cx < Math.min(map.width, x + 26); cx++) {
        if (map.oreAt(map.index(cx, cz)) === 0) continue;
        const distance = Math.hypot(cx + 0.5 - x, cz + 0.5 - z);
        if (distance < bestDistance) {
          bestDistance = distance;
          best = { x: cx + 0.5, z: cz + 0.5 };
        }
      }
    }
    return best;
  }

  /**
   * The free spot closest to (x, z) where the structure fits, leaving a one-cell lane
   * around buildings so the base doesn't box itself in.
   */
  private findSpot(
    type: StructureType,
    x: number,
    z: number,
    radius: number,
    ignore: number,
    ignoreReach: boolean,
  ): { x: number; z: number } | null {
    const world = this.world;
    const map = world.map;
    const def = STRUCTURES[type];
    const [w, h] = def.size;
    const spacious = def.role !== 'defense' && def.role !== 'wall';
    const candidates: [number, number, number][] = [];
    const ox = Math.round(x - w / 2);
    const oz = Math.round(z - h / 2);
    for (let dz = -radius; dz <= radius; dz++) {
      for (let dx = -radius; dx <= radius; dx++) {
        candidates.push([ox + dx, oz + dz, dx * dx + dz * dz]);
      }
    }
    candidates.sort((a, b) => a[2] - b[2]);
    for (const [cx, cz] of candidates) {
      if (cx < 1 || cz < 1 || cx + w > map.width - 1 || cz + h > map.height - 2) continue;
      if (spacious && !this.roomy(cx, cz, w, h)) continue;
      let ore = 0;
      for (let fz = cz; fz < cz + h; fz++) {
        for (let fx = cx; fx < cx + w; fx++) ore += map.oreAt(map.index(fx, fz)) > 0 ? 1 : 0;
      }
      if (ore > 0) continue;
      const options = ignoreReach ? { ignoreReach, ignore } : { ignore };
      if (placementCheck(world, this.player, type, cx, cz, options).ok) return { x: cx, z: cz };
    }
    return null;
  }

  /** No other building, cliff or water within a cell of the footprint. */
  private roomy(cx: number, cz: number, w: number, h: number): boolean {
    const map = this.world.map;
    for (let z = cz - 1; z <= cz + h; z++) {
      for (let x = cx - 1; x <= cx + w; x++) {
        if (!map.inside(x, z)) return false;
        const index = map.index(x, z);
        if ((map.structure[index] ?? 0) !== 0 || !map.openGround(index)) return false;
      }
    }
    return true;
  }
}
