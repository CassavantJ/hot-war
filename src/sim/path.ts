import type { GameMap } from './map';

export interface Point {
  x: number;
  z: number;
}

const DIRECTIONS = [
  [1, 0, 1],
  [-1, 0, 1],
  [0, 1, 1],
  [0, -1, 1],
  [1, 1, Math.SQRT2],
  [1, -1, Math.SQRT2],
  [-1, 1, Math.SQRT2],
  [-1, -1, Math.SQRT2],
] as const;

/** A* over the map's open cells, eight ways, never cutting a blocked corner. */
export class Pathfinder {
  private readonly map: GameMap;
  private readonly g: Float32Array;
  private readonly parent: Int32Array;
  private readonly seen: Uint32Array;
  private readonly closed: Uint32Array;
  private generation = 0;
  private heapNodes: Int32Array;
  private heapKeys: Float32Array;
  private heapSize = 0;

  constructor(map: GameMap) {
    this.map = map;
    const size = map.width * map.height;
    this.g = new Float32Array(size);
    this.parent = new Int32Array(size);
    this.seen = new Uint32Array(size);
    this.closed = new Uint32Array(size);
    this.heapNodes = new Int32Array(1024);
    this.heapKeys = new Float32Array(1024);
  }

  /** Cells from start (not included) to goal, or null if there's no way through. */
  find(start: number, goal: number, limit = 40_000): number[] | null {
    const map = this.map;
    if (start === goal) return [];
    if (map.isBlocked(goal)) return null;
    this.generation++;
    if (this.generation === 0xffffffff) {
      this.seen.fill(0);
      this.closed.fill(0);
      this.generation = 1;
    }
    const gen = this.generation;
    const width = map.width;
    const gx = goal % width;
    const gz = (goal - gx) / width;
    const heuristic = (index: number) => {
      const x = index % width;
      const z = (index - x) / width;
      const dx = Math.abs(x - gx);
      const dz = Math.abs(z - gz);
      return (Math.max(dx, dz) + (Math.SQRT2 - 1) * Math.min(dx, dz)) * 1.001;
    };
    this.heapSize = 0;
    this.g[start] = 0;
    this.seen[start] = gen;
    this.parent[start] = -1;
    this.push(start, heuristic(start));
    let expanded = 0;
    while (this.heapSize > 0) {
      const current = this.pop();
      if (this.closed[current] === gen) continue;
      this.closed[current] = gen;
      if (current === goal) return this.trace(start, goal);
      if (++expanded > limit) return null;
      const cx = current % width;
      const cz = (current - cx) / width;
      const base = this.g[current] ?? 0;
      for (const [dx, dz, cost] of DIRECTIONS) {
        const nx = cx + dx;
        const nz = cz + dz;
        if (!map.inside(nx, nz)) continue;
        const next = nz * width + nx;
        if (map.blocked[next] !== 0 || this.closed[next] === gen) continue;
        if (dx !== 0 && dz !== 0) {
          if (map.blocked[cz * width + nx] !== 0 || map.blocked[nz * width + cx] !== 0) continue;
        }
        const tentative = base + cost;
        if (this.seen[next] === gen && tentative >= (this.g[next] ?? Infinity)) continue;
        this.seen[next] = gen;
        this.g[next] = tentative;
        this.parent[next] = current;
        this.push(next, tentative + heuristic(next));
      }
    }
    return null;
  }

  private trace(start: number, goal: number): number[] {
    const cells: number[] = [];
    let at = goal;
    while (at !== start && at >= 0) {
      cells.push(at);
      at = this.parent[at] ?? -1;
    }
    return cells.reverse();
  }

  private push(node: number, key: number): void {
    if (this.heapSize === this.heapNodes.length) {
      const nodes = new Int32Array(this.heapNodes.length * 2);
      nodes.set(this.heapNodes);
      this.heapNodes = nodes;
      const keys = new Float32Array(this.heapKeys.length * 2);
      keys.set(this.heapKeys);
      this.heapKeys = keys;
    }
    let i = this.heapSize++;
    const nodes = this.heapNodes;
    const keys = this.heapKeys;
    while (i > 0) {
      const up = (i - 1) >> 1;
      const upKey = keys[up] ?? 0;
      if (upKey <= key) break;
      nodes[i] = nodes[up] ?? 0;
      keys[i] = upKey;
      i = up;
    }
    nodes[i] = node;
    keys[i] = key;
  }

  private pop(): number {
    const nodes = this.heapNodes;
    const keys = this.heapKeys;
    const top = nodes[0] ?? 0;
    const size = --this.heapSize;
    if (size === 0) return top;
    const node = nodes[size] ?? 0;
    const key = keys[size] ?? 0;
    let i = 0;
    for (;;) {
      const left = i * 2 + 1;
      if (left >= size) break;
      const right = left + 1;
      const child = right < size && (keys[right] ?? 0) < (keys[left] ?? 0) ? right : left;
      if ((keys[child] ?? 0) >= key) break;
      nodes[i] = nodes[child] ?? 0;
      keys[i] = keys[child] ?? 0;
      i = child;
    }
    nodes[i] = node;
    keys[i] = key;
    return top;
  }
}

/** Is the straight line between two points clear of blocked cells? */
export function lineClear(map: GameMap, x0: number, z0: number, x1: number, z1: number): boolean {
  let cx = Math.floor(x0);
  let cz = Math.floor(z0);
  const ex = Math.floor(x1);
  const ez = Math.floor(z1);
  const dx = x1 - x0;
  const dz = z1 - z0;
  const stepX = dx > 0 ? 1 : -1;
  const stepZ = dz > 0 ? 1 : -1;
  const deltaX = dx === 0 ? Infinity : Math.abs(1 / dx);
  const deltaZ = dz === 0 ? Infinity : Math.abs(1 / dz);
  let maxX = dx === 0 ? Infinity : (dx > 0 ? cx + 1 - x0 : x0 - cx) * deltaX;
  let maxZ = dz === 0 ? Infinity : (dz > 0 ? cz + 1 - z0 : z0 - cz) * deltaZ;
  for (let guard = 0; guard < 512; guard++) {
    if (!map.passable(cx, cz)) return false;
    if (cx === ex && cz === ez) return true;
    if (Math.abs(maxX - maxZ) < 1e-9) {
      // Through a corner: both side cells must be open too.
      if (!map.passable(cx + stepX, cz) || !map.passable(cx, cz + stepZ)) return false;
      cx += stepX;
      cz += stepZ;
      maxX += deltaX;
      maxZ += deltaZ;
    } else if (maxX < maxZ) {
      cx += stepX;
      maxX += deltaX;
    } else {
      cz += stepZ;
      maxZ += deltaZ;
    }
  }
  return false;
}

/** Straightens a cell path into as few waypoints as the open ground allows. */
export function smoothPath(map: GameMap, fromX: number, fromZ: number, cells: number[]): Point[] {
  const points = cells.map((cell) => ({ x: map.cellX(cell) + 0.5, z: map.cellZ(cell) + 0.5 }));
  const result: Point[] = [];
  let anchorX = fromX;
  let anchorZ = fromZ;
  let i = 0;
  while (i < points.length) {
    let far = i;
    // Look ahead a bounded distance for the furthest point in a straight, clear line.
    for (let j = Math.min(points.length - 1, i + 24); j > i; j--) {
      const p = points[j];
      if (p && lineClear(map, anchorX, anchorZ, p.x, p.z)) {
        far = j;
        break;
      }
    }
    const point = points[far];
    if (!point) break;
    result.push(point);
    anchorX = point.x;
    anchorZ = point.z;
    i = far + 1;
  }
  return result;
}
