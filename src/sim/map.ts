import { MAX_ORE } from './rules';

/** Ground types. Water and cliffs stop everything on the ground. */
export const GROUND = {
  clear: 0,
  rough: 1,
  road: 2,
  sand: 3,
  water: 4,
  cliff: 5,
  pavement: 6,
} as const;

export type Theme = 'temperate' | 'snow' | 'desert';

/** How something gets about: on land, on water, or either. */
export type Mobility = 'ground' | 'naval' | 'amphibious';

/** Where one kind of mover can't go, and the connected areas where it can. */
export class Layer {
  readonly blocked: Uint8Array;
  readonly region: Int32Array;
  dirty = true;

  constructor(size: number) {
    this.blocked = new Uint8Array(size);
    this.region = new Int32Array(size);
  }
}

export interface Cell {
  x: number;
  z: number;
}

/**
 * The battlefield grid: ground, trees, ore and what's built where. Cell (x, z) covers
 * [x, x + 1) × [z, z + 1) in world units; its centre is (x + 0.5, z + 0.5).
 */
export class GameMap {
  readonly width: number;
  readonly height: number;
  readonly theme: Theme;
  readonly ground: Uint8Array;
  /** 0 for none, otherwise a tree variant. */
  readonly tree: Uint8Array;
  /** Ore bales, 0 to MAX_ORE. */
  readonly ore: Uint8Array;
  /** 1 where the ore is gems (worth double). */
  readonly gem: Uint8Array;
  /** The structure standing on each cell, or 0. */
  readonly structure: Int32Array;
  /** 1 where that structure is a pad units can drive over. */
  readonly pad: Uint8Array;
  /** Blocked cells and connected regions for each kind of mover. */
  readonly layers: Record<Mobility, Layer>;
  /** 1 where ground units can't go (the ground layer's). */
  readonly blocked: Uint8Array;
  /** Cells with an ore drill, which slowly spills new ore around it. */
  readonly drills: number[] = [];
  starts: Cell[] = [];
  /** Bumped whenever ore or buildings change, so views know to redraw. */
  oreVersion = 0;
  blockVersion = 0;

  constructor(width: number, height: number, theme: Theme) {
    this.width = width;
    this.height = height;
    this.theme = theme;
    const size = width * height;
    this.ground = new Uint8Array(size);
    this.tree = new Uint8Array(size);
    this.ore = new Uint8Array(size);
    this.gem = new Uint8Array(size);
    this.structure = new Int32Array(size);
    this.pad = new Uint8Array(size);
    this.layers = { ground: new Layer(size), naval: new Layer(size), amphibious: new Layer(size) };
    this.blocked = this.layers.ground.blocked;
  }

  index(x: number, z: number): number {
    return z * this.width + x;
  }

  inside(x: number, z: number): boolean {
    return x >= 0 && z >= 0 && x < this.width && z < this.height;
  }

  cellX(index: number): number {
    return index % this.width;
  }

  cellZ(index: number): number {
    return Math.floor(index / this.width);
  }

  /** The cell under a world position. */
  cellAt(x: number, z: number): number {
    const cx = Math.min(this.width - 1, Math.max(0, Math.floor(x)));
    const cz = Math.min(this.height - 1, Math.max(0, Math.floor(z)));
    return this.index(cx, cz);
  }

  groundAt(index: number): number {
    return this.ground[index] ?? GROUND.cliff;
  }

  isBlocked(index: number, mobility: Mobility = 'ground'): boolean {
    return this.layers[mobility].blocked[index] !== 0;
  }

  passable(x: number, z: number, mobility: Mobility = 'ground'): boolean {
    return this.inside(x, z) && this.layers[mobility].blocked[this.index(x, z)] === 0;
  }

  isWater(index: number): boolean {
    return this.groundAt(index) === GROUND.water;
  }

  /** Ground that could ever be walked on, ignoring buildings and trees. */
  openGround(index: number): boolean {
    const ground = this.groundAt(index);
    return ground !== GROUND.water && ground !== GROUND.cliff;
  }

  /** Re-works out whether one cell can be crossed; call after changing it. */
  refresh(index: number): void {
    const ground = this.groundAt(index);
    const obstacle =
      (this.tree[index] ?? 0) > 0 ||
      this.drills.includes(index) ||
      ((this.structure[index] ?? 0) !== 0 && this.pad[index] === 0);
    this.set('ground', index, !this.openGround(index) || obstacle);
    this.set('naval', index, ground !== GROUND.water || obstacle);
    this.set('amphibious', index, ground === GROUND.cliff || obstacle);
  }

  private set(mobility: Mobility, index: number, blocked: boolean): void {
    const layer = this.layers[mobility];
    const value = blocked ? 1 : 0;
    if (layer.blocked[index] !== value) {
      layer.blocked[index] = value;
      layer.dirty = true;
      this.blockVersion++;
    }
  }

  refreshAll(): void {
    for (let i = 0; i < this.ground.length; i++) this.refresh(i);
  }

  oreAt(index: number): number {
    return this.ore[index] ?? 0;
  }

  /** Can ore grow or be dropped here? */
  canHoldOre(index: number): boolean {
    const ground = this.groundAt(index);
    return (
      (ground === GROUND.clear || ground === GROUND.rough || ground === GROUND.sand) &&
      (this.tree[index] ?? 0) === 0 &&
      (this.structure[index] ?? 0) === 0 &&
      !this.drills.includes(index)
    );
  }

  addOre(index: number, bales: number, gem = false): void {
    if (!this.canHoldOre(index)) return;
    const next = Math.min(MAX_ORE, this.oreAt(index) + bales);
    if (next === this.oreAt(index)) return;
    this.ore[index] = next;
    if (gem) this.gem[index] = 1;
    this.oreVersion++;
  }

  /** Takes one bale; returns what it was worth (0 if there was none). */
  takeOre(index: number, oreValue: number, gemValue: number): number {
    const bales = this.oreAt(index);
    if (bales <= 0) return 0;
    this.ore[index] = bales - 1;
    const value = this.gem[index] ? gemValue : oreValue;
    if (bales === 1) this.gem[index] = 0;
    this.oreVersion++;
    return value;
  }

  regionOf(index: number, mobility: Mobility = 'ground'): number {
    const layer = this.layers[mobility];
    if (layer.dirty) this.labelRegions(layer);
    return layer.region[index] ?? 0;
  }

  /** Flood-fills open cells into numbered regions (0 = blocked). */
  private labelRegions(layer: Layer): void {
    layer.dirty = false;
    const region = layer.region;
    const blocked = layer.blocked;
    region.fill(0);
    const stack: number[] = [];
    let next = 1;
    for (let start = 0; start < region.length; start++) {
      if (blocked[start] !== 0 || region[start] !== 0) continue;
      const label = next++;
      region[start] = label;
      stack.push(start);
      while (stack.length > 0) {
        const index = stack.pop() ?? 0;
        const x = index % this.width;
        const z = (index - x) / this.width;
        const visit = (nx: number, nz: number) => {
          if (!this.inside(nx, nz)) return;
          const n = this.index(nx, nz);
          if (blocked[n] !== 0 || region[n] !== 0) return;
          region[n] = label;
          stack.push(n);
        };
        visit(x + 1, z);
        visit(x - 1, z);
        visit(x, z + 1);
        visit(x, z - 1);
      }
    }
  }

  /**
   * The nearest open cell to (x, z) that can be reached from `region` (any region if 0),
   * searching outwards up to `radius` cells. Returns -1 if there's none.
   */
  nearestOpen(
    x: number,
    z: number,
    region = 0,
    radius = 24,
    mobility: Mobility = 'ground',
  ): number {
    const blocked = this.layers[mobility].blocked;
    const cx = Math.floor(x);
    const cz = Math.floor(z);
    for (let r = 0; r <= radius; r++) {
      let best = -1;
      let bestDistance = Infinity;
      for (let dz = -r; dz <= r; dz++) {
        for (let dx = -r; dx <= r; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
          const nx = cx + dx;
          const nz = cz + dz;
          if (!this.inside(nx, nz)) continue;
          const n = this.index(nx, nz);
          if (blocked[n] !== 0) continue;
          if (region !== 0 && this.regionOf(n, mobility) !== region) continue;
          const distance = (nx + 0.5 - x) ** 2 + (nz + 0.5 - z) ** 2;
          if (distance < bestDistance) {
            bestDistance = distance;
            best = n;
          }
        }
      }
      if (best >= 0) return best;
    }
    return -1;
  }
}
