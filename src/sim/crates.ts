import { promote } from './combat';
import { DT, type Unit } from './entities';
import { GROUND } from './map';
import { revealAll } from './shroud';
import type { World } from './world';

export interface Crate {
  id: number;
  x: number;
  z: number;
  cell: number;
}

const MAX_CRATES = 3;

/** Now and then a supply crate turns up; the first unit to drive over it gets a bonus. */
export function tickCrates(world: World): void {
  world.timers.crates -= DT;
  if (world.timers.crates <= 0) {
    world.timers.crates = world.rng.range(45, 80);
    if (world.crates.length < MAX_CRATES) spawnCrate(world);
  }
  if (world.crates.length === 0) return;
  for (const crate of world.crates) {
    const taker = world
      .unitsNear(crate.x, crate.z, 0.55)
      .find((unit) => !unit.def.flies && unit.owner >= 0);
    if (taker) {
      open(world, taker, crate);
      crate.cell = -1;
    }
  }
  world.crates = world.crates.filter((crate) => crate.cell >= 0);
}

function spawnCrate(world: World): void {
  const map = world.map;
  for (let attempt = 0; attempt < 40; attempt++) {
    const x = world.rng.int(2, map.width - 3);
    const z = world.rng.int(2, map.height - 3);
    const cell = map.index(x, z);
    const ground = map.groundAt(cell);
    if (map.isBlocked(cell) || map.oreAt(cell) > 0) continue;
    if (ground !== GROUND.clear && ground !== GROUND.rough && ground !== GROUND.sand) continue;
    if (world.crates.some((crate) => crate.cell === cell)) continue;
    world.crates.push({ id: world.nextId++, x: x + 0.5, z: z + 0.5, cell });
    return;
  }
}

function open(world: World, unit: Unit, crate: Crate): void {
  const player = world.players[unit.owner];
  if (!player) return;
  const rng = world.rng;
  const roll = rng.next();
  const nearby = (radius: number) =>
    world.unitsNear(unit.x, unit.z, radius).filter((other) => other.owner === unit.owner);
  let text: string;
  if (roll < 0.3) {
    const amount = rng.int(10, 25) * 100;
    player.credits += amount;
    text = `+$${amount}`;
  } else if (roll < 0.45) {
    for (const other of nearby(6)) other.hp = other.maxHp;
    text = 'Units healed';
  } else if (roll < 0.6) {
    for (const other of nearby(3)) promote(world, other);
    text = 'Promotion';
  } else if (roll < 0.7) {
    revealAll(player);
    text = 'Map revealed';
  } else if (roll < 0.8) {
    for (const other of nearby(3)) other.speedBonus = Math.min(1.5, other.speedBonus * 1.25);
    text = 'Speed up';
  } else if (roll < 0.9) {
    for (const other of nearby(3)) other.armorBonus = Math.min(2, other.armorBonus * 1.5);
    text = 'Armour up';
  } else {
    for (const other of nearby(3)) other.firepowerBonus = Math.min(2, other.firepowerBonus * 1.5);
    text = 'Firepower up';
  }
  world.emit({ kind: 'crate', player: unit.owner, x: crate.x, z: crate.z, text });
}
