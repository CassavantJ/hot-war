import { GameMap, GROUND, type Theme } from './map';
import { hash2 } from './random';
import { MAX_ORE, STRUCTURES, type StructureType } from './rules';
import { dhypot } from './dmath';

type XZ = [number, number];

/** Map features, drawn in one player's share of the map and copied to the others. */
type Feature =
  | { kind: 'start'; at: XZ }
  | { kind: 'ore'; at: XZ; r: number; gems?: boolean; drill?: boolean; once?: boolean }
  | { kind: 'lake'; at: XZ; r: number; once?: boolean }
  | { kind: 'river'; points: XZ[]; width: number; once?: boolean }
  | { kind: 'ford'; at: XZ; r: number; once?: boolean }
  | { kind: 'cliff'; points: XZ[]; width: number; once?: boolean }
  | { kind: 'rocks'; at: XZ; r: number; once?: boolean }
  | { kind: 'gap'; at: XZ; r: number; once?: boolean }
  | { kind: 'island'; at: XZ; r: number; once?: boolean }
  | { kind: 'forest'; at: XZ; r: number; density: number; once?: boolean }
  | { kind: 'road'; points: XZ[]; width: number; once?: boolean }
  | { kind: 'plaza'; at: XZ; r: number; once?: boolean }
  | { kind: 'building'; type: StructureType; at: XZ; once?: boolean };

export interface MapSpec {
  id: string;
  name: string;
  blurb: string;
  players: number;
  width: number;
  height: number;
  theme: Theme;
  /** 'point' mirrors through the middle (two players); 'quad' turns four ways; 'none' is as drawn. */
  symmetry: 'point' | 'quad' | 'none';
  /** Scattered trees, 0–1. */
  trees: number;
  /** Campaign-only maps don't appear in the skirmish list. */
  campaign?: boolean;
  features: Feature[];
}

export interface Neutral {
  type: StructureType;
  x: number;
  z: number;
}

export interface BuiltMap {
  map: GameMap;
  neutrals: Neutral[];
}

export const MAPS: MapSpec[] = [
  {
    id: 'crossroads',
    name: 'River Crossing',
    blurb: 'Two bases split by a river, with three places to cross and a gem field in the middle.',
    players: 2,
    width: 64,
    height: 64,
    theme: 'temperate',
    symmetry: 'point',
    trees: 0.035,
    features: [
      { kind: 'start', at: [11, 11] },
      {
        kind: 'river',
        points: [
          [61, -2],
          [53, 9],
          [45, 14],
          [40, 23],
          [32, 32],
          [24, 41],
          [19, 50],
          [11, 55],
          [3, 66],
        ],
        width: 3.2,
        once: true,
      },
      { kind: 'ford', at: [32, 32], r: 3.2, once: true },
      { kind: 'ford', at: [43, 18], r: 2.4 },
      { kind: 'ore', at: [22, 9], r: 4, drill: true },
      { kind: 'ore', at: [8, 24], r: 3.2 },
      { kind: 'ore', at: [26, 26], r: 2.6, gems: true },
      { kind: 'forest', at: [30, 6], r: 4.5, density: 0.55 },
      { kind: 'forest', at: [5, 36], r: 4, density: 0.5 },
      { kind: 'forest', at: [18, 30], r: 3, density: 0.45 },
      { kind: 'rocks', at: [34, 14], r: 1.8 },
      { kind: 'plaza', at: [53, 11], r: 5.5 },
      {
        kind: 'road',
        points: [
          [42, 11],
          [62, 11],
        ],
        width: 1.4,
      },
      { kind: 'building', type: 'c_house', at: [49, 8] },
      { kind: 'building', type: 'c_store', at: [53, 8] },
      { kind: 'building', type: 'c_flats', at: [49, 13] },
      { kind: 'building', type: 'c_church', at: [55, 13] },
      { kind: 'building', type: 'c_derrick', at: [39, 5] },
    ],
  },
  {
    id: 'frozen',
    name: 'Frozen Divide',
    blurb: 'Four bases on a frozen plain around a walled centre full of gems.',
    players: 4,
    width: 96,
    height: 96,
    theme: 'snow',
    symmetry: 'quad',
    trees: 0.03,
    features: [
      { kind: 'start', at: [13, 13] },
      { kind: 'ore', at: [26, 10], r: 4, drill: true },
      { kind: 'ore', at: [10, 27], r: 3.4 },
      { kind: 'ore', at: [48, 48], r: 4.5, gems: true, once: true },
      { kind: 'lake', at: [48, 7], r: 5 },
      { kind: 'forest', at: [36, 20], r: 4, density: 0.5 },
      { kind: 'forest', at: [22, 38], r: 3.5, density: 0.45 },
      {
        kind: 'cliff',
        points: [
          [38.5, 43],
          [39.5, 40],
          [41.5, 37.5],
          [44, 36],
        ],
        width: 2,
      },
      { kind: 'rocks', at: [30, 30], r: 1.6 },
      { kind: 'plaza', at: [33, 58], r: 4 },
      { kind: 'building', type: 'c_house', at: [31, 55] },
      { kind: 'building', type: 'c_store', at: [34, 59] },
      { kind: 'building', type: 'c_derrick', at: [24, 48] },
    ],
  },
  {
    id: 'shores',
    name: 'Two Shores',
    blurb:
      'An inland sea splits two bases. March round the ends, or take to the water for the gem island.',
    players: 2,
    width: 80,
    height: 64,
    theme: 'temperate',
    symmetry: 'point',
    trees: 0.03,
    features: [
      { kind: 'start', at: [13, 32] },
      { kind: 'lake', at: [40, 32], r: 15, once: true },
      { kind: 'lake', at: [33, 24], r: 7 },
      { kind: 'island', at: [40, 32], r: 4.5, once: true },
      { kind: 'ore', at: [40, 32], r: 2.6, gems: true, once: true },
      { kind: 'ore', at: [11, 21], r: 4, drill: true },
      { kind: 'ore', at: [11, 44], r: 3.4 },
      { kind: 'ore', at: [40, 7], r: 3.4 },
      { kind: 'forest', at: [22, 8], r: 4, density: 0.5 },
      { kind: 'forest', at: [4, 54], r: 3.5, density: 0.5 },
      { kind: 'rocks', at: [60, 5], r: 2 },
      { kind: 'plaza', at: [54, 9], r: 4 },
      { kind: 'building', type: 'c_house', at: [51, 6] },
      { kind: 'building', type: 'c_store', at: [55, 6] },
      { kind: 'building', type: 'c_flats', at: [51, 10] },
      { kind: 'building', type: 'c_derrick', at: [30, 54] },
    ],
  },
  {
    id: 'inland',
    name: 'Inland Sea',
    blurb:
      'Four corner bases around a sea dotted with gem islands. Whoever rules the water rules the map.',
    players: 4,
    width: 96,
    height: 96,
    theme: 'temperate',
    symmetry: 'quad',
    trees: 0.03,
    features: [
      { kind: 'start', at: [14, 14] },
      { kind: 'lake', at: [48, 48], r: 21, once: true },
      { kind: 'lake', at: [29, 29], r: 8 },
      { kind: 'island', at: [48, 34], r: 3.2 },
      { kind: 'ore', at: [48, 34], r: 2.2, gems: true },
      { kind: 'ore', at: [27, 11], r: 4, drill: true },
      { kind: 'ore', at: [11, 28], r: 3.4 },
      { kind: 'forest', at: [40, 8], r: 4, density: 0.45 },
      { kind: 'forest', at: [8, 44], r: 3.5, density: 0.45 },
      { kind: 'plaza', at: [48, 6], r: 3.5 },
      { kind: 'building', type: 'c_house', at: [45, 4] },
      { kind: 'building', type: 'c_store', at: [49, 5] },
      { kind: 'building', type: 'c_derrick', at: [22, 22] },
    ],
  },
  {
    id: 'canyon',
    name: 'Canyon Run',
    blurb: 'Three lanes through a desert canyon. Hold the middle, or sneak round the edges.',
    players: 2,
    width: 96,
    height: 64,
    theme: 'desert',
    symmetry: 'point',
    trees: 0.012,
    features: [
      { kind: 'start', at: [11, 32] },
      {
        kind: 'cliff',
        points: [
          [27, 21],
          [38, 18.5],
          [50, 21],
          [62, 19],
          [70, 20],
        ],
        width: 2.6,
      },
      { kind: 'gap', at: [44, 19.5], r: 2 },
      { kind: 'ore', at: [20, 22], r: 3.8, drill: true },
      { kind: 'ore', at: [20, 43], r: 3.2 },
      { kind: 'ore', at: [48, 32], r: 3.4, gems: true, once: true },
      { kind: 'ore', at: [52, 8], r: 3.2 },
      { kind: 'lake', at: [34, 32], r: 2.6 },
      { kind: 'rocks', at: [6, 10], r: 3 },
      { kind: 'forest', at: [30, 40], r: 3, density: 0.3 },
      { kind: 'plaza', at: [66, 7], r: 4.5 },
      { kind: 'building', type: 'c_house', at: [63, 4] },
      { kind: 'building', type: 'c_store', at: [67, 4] },
      { kind: 'building', type: 'c_flats', at: [63, 8] },
      { kind: 'building', type: 'c_derrick', at: [74, 27] },
    ],
  },
];

export function mapSpec(id: string): MapSpec {
  const spec = MAPS.find((candidate) => candidate.id === id) ?? MAPS[0];
  if (!spec) throw new Error('No maps');
  return spec;
}

/** Copies of a point (continuous coordinates) under the map's symmetry. */
function copies(spec: MapSpec, [x, z]: XZ): XZ[] {
  const w = spec.width;
  const h = spec.height;
  if (spec.symmetry === 'none') return [[x, z]];
  if (spec.symmetry === 'point') {
    return [
      [x, z],
      [w - x, h - z],
    ];
  }
  return [
    [x, z],
    [w - z, x],
    [w - x, h - z],
    [z, h - x],
  ];
}

function transform(spec: MapSpec, copy: number, point: XZ): XZ {
  return copies(spec, point)[copy] ?? point;
}

function copyCount(spec: MapSpec): number {
  if (spec.symmetry === 'none') return 1;
  return spec.symmetry === 'point' ? 2 : 4;
}

/** Smooth value noise, 0–1. */
function noise(x: number, z: number, seed: number, scale: number): number {
  const fx = x / scale;
  const fz = z / scale;
  const ix = Math.floor(fx);
  const iz = Math.floor(fz);
  const tx = fx - ix;
  const tz = fz - iz;
  const sx = tx * tx * (3 - 2 * tx);
  const sz = tz * tz * (3 - 2 * tz);
  const a = hash2(ix, iz, seed);
  const b = hash2(ix + 1, iz, seed);
  const c = hash2(ix, iz + 1, seed);
  const d = hash2(ix + 1, iz + 1, seed);
  return a + (b - a) * sx + (c - a) * sz + (a - b - c + d) * sx * sz;
}

/** Noise that's the same at every symmetric copy of a point. */
function fairNoise(spec: MapSpec, x: number, z: number, seed: number, scale: number): number {
  const points = copies(spec, [x, z]);
  let total = 0;
  for (const [px, pz] of points) total += noise(px, pz, seed, scale);
  return total / points.length;
}

function segmentDistance(px: number, pz: number, a: XZ, b: XZ): number {
  const dx = b[0] - a[0];
  const dz = b[1] - a[1];
  const length = dx * dx + dz * dz;
  const t =
    length === 0 ? 0 : Math.max(0, Math.min(1, ((px - a[0]) * dx + (pz - a[1]) * dz) / length));
  return dhypot(px - (a[0] + dx * t), pz - (a[1] + dz * t));
}

function lineDistance(px: number, pz: number, points: XZ[]): number {
  let best = Infinity;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    if (a && b) best = Math.min(best, segmentDistance(px, pz, a, b));
  }
  return best;
}

/** Builds a map: ground, water, cliffs, trees and ore, plus the neutral buildings on it. */
export function buildMap(spec: MapSpec, seed = 1): BuiltMap {
  const map = new GameMap(spec.width, spec.height, spec.theme);
  const neutrals: Neutral[] = [];
  const count = copyCount(spec);
  const each = (feature: Feature, visit: (copy: number) => void) => {
    const times = 'once' in feature && feature.once ? 1 : count;
    for (let copy = 0; copy < times; copy++) visit(copy);
  };
  const forCells = (
    cx: number,
    cz: number,
    radius: number,
    visit: (index: number, x: number, z: number) => void,
  ) => {
    const r = Math.ceil(radius) + 1;
    for (let z = Math.floor(cz) - r; z <= Math.floor(cz) + r; z++) {
      for (let x = Math.floor(cx) - r; x <= Math.floor(cx) + r; x++) {
        if (map.inside(x, z)) visit(map.index(x, z), x + 0.5, z + 0.5);
      }
    }
  };
  const forLine = (
    points: XZ[],
    width: number,
    visit: (index: number, distance: number, x: number, z: number) => void,
  ) => {
    for (let z = 0; z < map.height; z++) {
      for (let x = 0; x < map.width; x++) {
        const distance = lineDistance(x + 0.5, z + 0.5, points);
        if (distance <= width) visit(map.index(x, z), distance, x + 0.5, z + 0.5);
      }
    }
  };
  const byKind = <K extends Feature['kind']>(kind: K) =>
    spec.features.filter(
      (feature): feature is Extract<Feature, { kind: K }> => feature.kind === kind,
    );

  // Rough patches for texture.
  for (let z = 0; z < map.height; z++) {
    for (let x = 0; x < map.width; x++) {
      if (fairNoise(spec, x + 0.5, z + 0.5, seed * 13 + 1, 5) > 0.66) {
        map.ground[map.index(x, z)] = GROUND.rough;
      }
    }
  }
  // Water.
  for (const lake of byKind('lake')) {
    each(lake, (copy) => {
      const [lx, lz] = transform(spec, copy, lake.at);
      forCells(lx, lz, lake.r * 1.3, (index, x, z) => {
        const wobble = 0.8 + 0.45 * fairNoise(spec, x, z, seed * 7 + 3, 2.5);
        if (dhypot(x - lx, z - lz) <= lake.r * wobble) map.ground[index] = GROUND.water;
      });
    });
  }
  for (const river of byKind('river')) {
    each(river, (copy) => {
      const points = river.points.map((point) => transform(spec, copy, point));
      forLine(points, river.width, (index, distance, x, z) => {
        const wobble = 0.55 + 0.9 * fairNoise(spec, x, z, seed * 5 + 11, 5);
        if (distance <= (river.width / 2) * wobble + 0.5) map.ground[index] = GROUND.water;
      });
    });
  }
  // Cliffs and rocks.
  for (const cliff of byKind('cliff')) {
    each(cliff, (copy) => {
      const points = cliff.points.map((point) => transform(spec, copy, point));
      forLine(points, cliff.width, (index, distance, x, z) => {
        const wobble = 0.8 + 0.4 * fairNoise(spec, x, z, seed * 3 + 5, 2);
        if (distance <= (cliff.width / 2) * wobble + 0.3) map.ground[index] = GROUND.cliff;
      });
    });
  }
  for (const rocks of byKind('rocks')) {
    each(rocks, (copy) => {
      const [rx, rz] = transform(spec, copy, rocks.at);
      forCells(rx, rz, rocks.r * 1.3, (index, x, z) => {
        const wobble = 0.75 + 0.5 * fairNoise(spec, x, z, seed * 17 + 2, 1.5);
        if (dhypot(x - rx, z - rz) <= rocks.r * wobble) map.ground[index] = GROUND.cliff;
      });
    });
  }
  for (const gap of byKind('gap')) {
    each(gap, (copy) => {
      const [gx, gz] = transform(spec, copy, gap.at);
      forCells(gx, gz, gap.r, (index, x, z) => {
        if (dhypot(x - gx, z - gz) <= gap.r) map.ground[index] = GROUND.rough;
      });
    });
  }
  // Islands: dry land back out of the water.
  for (const island of byKind('island')) {
    each(island, (copy) => {
      const [ix, iz] = transform(spec, copy, island.at);
      forCells(ix, iz, island.r * 1.3, (index, x, z) => {
        const wobble = 0.8 + 0.4 * fairNoise(spec, x, z, seed * 19 + 8, 1.5);
        if (dhypot(x - ix, z - iz) <= island.r * wobble) map.ground[index] = GROUND.clear;
      });
    });
  }
  // Fords: shallow, sandy crossings.
  for (const ford of byKind('ford')) {
    each(ford, (copy) => {
      const [fx, fz] = transform(spec, copy, ford.at);
      forCells(fx, fz, ford.r, (index, x, z) => {
        if (dhypot(x - fx, z - fz) <= ford.r && map.ground[index] === GROUND.water) {
          map.ground[index] = GROUND.sand;
        }
      });
    });
  }
  // Sandy shores.
  const shore: number[] = [];
  for (let z = 0; z < map.height; z++) {
    for (let x = 0; x < map.width; x++) {
      const index = map.index(x, z);
      const ground = map.ground[index];
      if (ground !== GROUND.clear && ground !== GROUND.rough) continue;
      let wet = false;
      for (let dz = -1; dz <= 1 && !wet; dz++) {
        for (let dx = -1; dx <= 1 && !wet; dx++) {
          if (
            map.inside(x + dx, z + dz) &&
            map.ground[map.index(x + dx, z + dz)] === GROUND.water
          ) {
            wet = true;
          }
        }
      }
      if (wet) shore.push(index);
    }
  }
  for (const index of shore) map.ground[index] = GROUND.sand;
  // Roads and town squares.
  for (const road of byKind('road')) {
    each(road, (copy) => {
      const points = road.points.map((point) => transform(spec, copy, point));
      forLine(points, road.width, (index, distance) => {
        const ground = map.ground[index];
        if (
          distance <= road.width / 2 + 0.2 &&
          ground !== GROUND.water &&
          ground !== GROUND.cliff
        ) {
          map.ground[index] = GROUND.road;
        }
      });
    });
  }
  for (const plaza of byKind('plaza')) {
    each(plaza, (copy) => {
      const [px, pz] = transform(spec, copy, plaza.at);
      forCells(px, pz, plaza.r, (index, x, z) => {
        if (dhypot(x - px, z - pz) <= plaza.r && map.ground[index] !== GROUND.water) {
          map.ground[index] = GROUND.pavement;
        }
      });
    });
  }
  // Trees: forests, then a scattering.
  const treeAt = (index: number, variant: number) => {
    const ground = map.ground[index];
    if (ground === GROUND.clear || ground === GROUND.rough) map.tree[index] = variant;
  };
  for (const forest of byKind('forest')) {
    each(forest, (copy) => {
      const [fx, fz] = transform(spec, copy, forest.at);
      forCells(fx, fz, forest.r, (index, x, z) => {
        const edge = 1 - dhypot(x - fx, z - fz) / forest.r;
        if (edge <= 0) return;
        const roll = fairNoise(spec, x, z, seed * 23 + 9, 0.7);
        if (roll < forest.density * (0.4 + edge)) treeAt(index, 1 + (Math.floor(roll * 97) % 3));
      });
    });
  }
  for (let z = 0; z < map.height; z++) {
    for (let x = 0; x < map.width; x++) {
      const roll = fairNoise(spec, x + 0.5, z + 0.5, seed * 29 + 4, 0.6);
      if (roll < spec.trees * 0.9) treeAt(map.index(x, z), 1 + (Math.floor(roll * 997) % 3));
    }
  }
  // Starting areas: flat, clear and dry.
  const starts: XZ[] = [];
  for (const start of byKind('start')) {
    each(start, (copy) => {
      const [sx, sz] = transform(spec, copy, start.at);
      starts.push([sx, sz]);
      forCells(sx, sz, 8, (index, x, z) => {
        if (dhypot(x - sx, z - sz) > 8) return;
        map.tree[index] = 0;
        const ground = map.ground[index];
        if (ground === GROUND.water || ground === GROUND.cliff || ground === GROUND.road) {
          map.ground[index] = GROUND.clear;
        }
      });
    });
  }
  map.starts = starts.map(([x, z]) => ({ x: Math.floor(x), z: Math.floor(z) }));
  // Neutral buildings (towns and oil derricks), each a mirrored copy.
  for (const building of byKind('building')) {
    const [w, h] = STRUCTURES[building.type].size;
    each(building, (copy) => {
      const [cx, cz] = transform(spec, copy, [building.at[0] + w / 2, building.at[1] + h / 2]);
      const turned = copy % 2 === 1 && spec.symmetry === 'quad';
      const bw = turned ? h : w;
      const bh = turned ? w : h;
      const x = Math.round(cx - bw / 2);
      const z = Math.round(cz - bh / 2);
      for (let dz = 0; dz < bh; dz++) {
        for (let dx = 0; dx < bw; dx++) {
          if (!map.inside(x + dx, z + dz)) continue;
          const index = map.index(x + dx, z + dz);
          map.tree[index] = 0;
          if (map.ground[index] === GROUND.water || map.ground[index] === GROUND.cliff) {
            map.ground[index] = GROUND.clear;
          }
        }
      }
      neutrals.push({ type: building.type, x, z });
    });
  }
  // Ore last, so it lies on open ground.
  for (const ore of byKind('ore')) {
    each(ore, (copy) => {
      const [ox, oz] = transform(spec, copy, ore.at);
      forCells(ox, oz, ore.r * 1.3, (index, x, z) => {
        const distance = dhypot(x - ox, z - oz);
        const wobble = 0.8 + 0.4 * fairNoise(spec, x, z, seed * 31 + 6, 1.8);
        const edge = 1 - distance / (ore.r * wobble);
        if (edge <= 0) return;
        map.tree[index] = 0;
        const bales = Math.max(1, Math.round(MAX_ORE * Math.min(1, edge * 1.6)));
        map.addOre(index, bales, ore.gems === true);
      });
      if (ore.drill) {
        const index = map.index(Math.floor(ox), Math.floor(oz));
        map.ore[index] = 0;
        map.gem[index] = 0;
        map.drills.push(index);
      }
    });
  }
  // Keep ore out of the neutral buildings' footprints.
  for (const neutral of neutrals) {
    const [w, h] = STRUCTURES[neutral.type].size;
    for (let dz = -1; dz <= h; dz++) {
      for (let dx = -1; dx <= w; dx++) {
        if (!map.inside(neutral.x + dx, neutral.z + dz)) continue;
        const index = map.index(neutral.x + dx, neutral.z + dz);
        map.ore[index] = 0;
        map.gem[index] = 0;
      }
    }
  }
  map.refreshAll();
  return { map, neutrals };
}
