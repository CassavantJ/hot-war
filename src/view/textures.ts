import * as THREE from 'three';

import { GROUND, type GameMap, type Theme } from '../sim/map';
import { hash2 } from '../sim/random';

/**
 * Procedural textures, painted once at load: the whole battlefield's ground (grass with dirt
 * patches, sand, rock, roads), a fine grain that tiles over it up close, panel-and-grime
 * detail for buildings and vehicles, and shell craters.
 */

function smooth(t: number): number {
  return t * t * (3 - 2 * t);
}

/** Value noise, 0–1, with integer lattice hashing. */
function noise(x: number, z: number, seed: number): number {
  const ix = Math.floor(x);
  const iz = Math.floor(z);
  const fx = smooth(x - ix);
  const fz = smooth(z - iz);
  const a = hash2(ix, iz, seed);
  const b = hash2(ix + 1, iz, seed);
  const c = hash2(ix, iz + 1, seed);
  const d = hash2(ix + 1, iz + 1, seed);
  return a + (b - a) * fx + (c - a) * fz + (a - b - c + d) * fx * fz;
}

/** Fractal noise, 0–1. */
function fbm(x: number, z: number, seed: number, octaves = 4): number {
  let total = 0;
  let amplitude = 0.5;
  let frequency = 1;
  let norm = 0;
  for (let i = 0; i < octaves; i++) {
    total += noise(x * frequency, z * frequency, seed + i * 17) * amplitude;
    norm += amplitude;
    amplitude *= 0.5;
    frequency *= 2.1;
  }
  return total / norm;
}

type Rgb = [number, number, number];

interface GroundLook {
  grassDark: Rgb;
  grassLight: Rgb;
  dirt: Rgb;
  dirtDark: Rgb;
  sand: Rgb;
  rock: Rgb;
  rockDark: Rgb;
  road: Rgb;
  pavement: Rgb;
  bed: Rgb;
  /** How much dirt shows through the grass, 0–1. */
  patchiness: number;
}

const LOOKS: Record<Theme, GroundLook> = {
  temperate: {
    grassDark: [58, 90, 26],
    grassLight: [124, 150, 48],
    dirt: [192, 160, 104],
    dirtDark: [146, 114, 70],
    sand: [206, 184, 132],
    rock: [132, 118, 98],
    rockDark: [72, 64, 54],
    road: [118, 108, 94],
    pavement: [152, 150, 142],
    bed: [48, 74, 66],
    patchiness: 0.4,
  },
  snow: {
    grassDark: [186, 198, 210],
    grassLight: [240, 244, 248],
    dirt: [142, 140, 134],
    dirtDark: [100, 100, 98],
    sand: [180, 186, 192],
    rock: [108, 114, 124],
    rockDark: [62, 68, 78],
    road: [114, 118, 122],
    pavement: [158, 162, 166],
    bed: [64, 94, 112],
    patchiness: 0.32,
  },
  desert: {
    grassDark: [190, 150, 92],
    grassLight: [228, 196, 136],
    dirt: [172, 124, 74],
    dirtDark: [132, 90, 52],
    sand: [236, 210, 156],
    rock: [164, 110, 70],
    rockDark: [104, 68, 44],
    road: [128, 112, 90],
    pavement: [168, 158, 140],
    bed: [66, 106, 96],
    patchiness: 0.38,
  },
};

function mix(a: Rgb, b: Rgb, t: number): Rgb {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

function scaled(color: Rgb, by: number): Rgb {
  return [color[0] * by, color[1] * by, color[2] * by];
}

/** A slow-changing noise field, sampled on a coarse grid and interpolated per pixel. */
class CoarseField {
  private readonly values: Float32Array;
  private readonly columns: number;
  private readonly step: number;

  constructor(
    width: number,
    height: number,
    step: number,
    sample: (x: number, z: number) => number,
  ) {
    this.step = step;
    this.columns = Math.ceil(width / step) + 2;
    const rows = Math.ceil(height / step) + 2;
    this.values = new Float32Array(this.columns * rows);
    for (let row = 0; row < rows; row++) {
      for (let column = 0; column < this.columns; column++) {
        this.values[row * this.columns + column] = sample(column * step, row * step);
      }
    }
  }

  at(px: number, pz: number): number {
    const gx = px / this.step;
    const gz = pz / this.step;
    const ix = Math.floor(gx);
    const iz = Math.floor(gz);
    const fx = gx - ix;
    const fz = gz - iz;
    const i = iz * this.columns + ix;
    const v = this.values;
    const a = v[i] ?? 0;
    const b = v[i + 1] ?? 0;
    const c = v[i + this.columns] ?? 0;
    const d = v[i + this.columns + 1] ?? 0;
    return a + (b - a) * fx + (c - a) * fz + (a - b - c + d) * fx * fz;
  }
}

/** Paints the whole map's ground into one texture. */
export function groundTexture(map: GameMap): THREE.CanvasTexture {
  const look = LOOKS[map.theme];
  const scale = Math.max(16, Math.min(28, Math.floor(2600 / Math.max(map.width, map.height))));
  const width = map.width * scale;
  const height = map.height * scale;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  const texture = new THREE.CanvasTexture(canvas);
  if (!ctx) return texture;
  const image = ctx.createImageData(width, height);
  const data = image.data;
  const groundAt = (x: number, z: number) => {
    const cx = Math.min(map.width - 1, Math.max(0, Math.floor(x)));
    const cz = Math.min(map.height - 1, Math.max(0, Math.floor(z)));
    return map.groundAt(map.index(cx, cz));
  };
  // Noise in cell units, sampled every few pixels.
  const field = (sample: (x: number, z: number) => number) =>
    new CoarseField(width, height, 3, (px, pz) => sample(px / scale, pz / scale));
  const warpX = field((x, z) => noise(x * 1.3, z * 1.3, 11) - 0.5);
  const warpZ = field((x, z) => noise(x * 1.3, z * 1.3, 23) - 0.5);
  const large = field((x, z) => fbm(x * 0.13, z * 0.13, 3, 3));
  const medium = field((x, z) => fbm(x * 0.5, z * 0.5, 7, 4));
  const mottle = field((x, z) => fbm(x * 1.6, z * 1.6, 19, 3));
  for (let pz = 0; pz < height; pz++) {
    const z = pz / scale;
    for (let px = 0; px < width; px++) {
      const x = px / scale;
      // Warp where we look up the cell, so the edges between ground types wander.
      const ground = groundAt(x + warpX.at(px, pz) * 0.9, z + warpZ.at(px, pz) * 0.9);
      const big = large.at(px, pz);
      const mid = medium.at(px, pz);
      const spot = mottle.at(px, pz);
      const grain = hash2(px, pz, 5);
      let color: Rgb;
      switch (ground) {
        case GROUND.water:
          color = mix(look.bed, look.rockDark, mid * 0.5);
          break;
        case GROUND.cliff:
          color = mix(
            look.rock,
            look.rockDark,
            Math.min(1, Math.max(0, mid * 1.1 + spot * 0.5 - 0.2)),
          );
          break;
        case GROUND.road: {
          // Worn wheel ruts.
          const rut = Math.abs((((x + z) * 1.7) % 1) - 0.5) < 0.06 ? 0.9 : 1;
          color = scaled(mix(look.road, look.dirtDark, mid * 0.4), rut);
          break;
        }
        case GROUND.pavement: {
          const seam = x % 1 < 0.05 || z % 1 < 0.05 ? 0.78 : 1;
          const stain = spot > 0.6 ? 0.9 : 1;
          color = scaled(mix(look.pavement, look.road, mid * 0.35), seam * stain);
          break;
        }
        case GROUND.sand:
          color = mix(look.sand, look.dirt, Math.min(1, mid * 0.4 + spot * 0.15));
          break;
        default: {
          // Grass mottled light and dark, with dirt worn through in ragged patches.
          const rough = ground === GROUND.rough ? 0.3 : 0;
          const grass = mix(
            look.grassDark,
            look.grassLight,
            Math.max(0, Math.min(1, big * 0.9 + spot * 0.6 - 0.3)),
          );
          const dirtLevel = mid + rough + (spot - 0.5) * 0.25 - (1 - look.patchiness);
          const dirt = mix(look.dirt, look.dirtDark, Math.max(0, spot * 0.9 - 0.2));
          const t = Math.max(0, Math.min(1, dirtLevel * 7));
          color = mix(grass, dirt, t);
          // A darker fringe where the grass gives way.
          if (t > 0 && t < 1) color = scaled(color, 0.9 + Math.abs(t - 0.5) * 0.2);
        }
      }
      const shade = 0.86 + grain * 0.22;
      const i = (pz * width + px) * 4;
      data[i] = Math.min(255, color[0] * shade);
      data[i + 1] = Math.min(255, color[1] * shade);
      data[i + 2] = Math.min(255, color[2] * shade);
      data[i + 3] = 255;
    }
  }
  ctx.putImageData(image, 0, 0);
  scatter(ctx, map, scale, look);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  texture.generateMipmaps = true;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  return texture;
}

function rgba(color: Rgb, alpha: number): string {
  const [r, g, b] = color.map((v) => Math.round(Math.max(0, Math.min(255, v))));
  return `rgba(${String(r)},${String(g)},${String(b)},${String(alpha)})`;
}

/** Tufts of grass and loose stones, dabbed on top of the painted ground. */
function scatter(
  ctx: CanvasRenderingContext2D,
  map: GameMap,
  scale: number,
  look: GroundLook,
): void {
  let seed = 99;
  const random = () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
  const tuft = rgba(scaled(look.grassDark, 0.7), 0.55);
  const blade = rgba(scaled(look.grassLight, 1.15), 0.5);
  const stone = rgba(mix(look.sand, [255, 255, 255], 0.15), 0.8);
  const shadow = 'rgba(40,32,24,0.35)';
  const count = map.width * map.height * 3;
  for (let i = 0; i < count; i++) {
    const x = random() * map.width;
    const z = random() * map.height;
    const ground = map.groundAt(map.index(Math.floor(x), Math.floor(z)));
    const px = x * scale;
    const pz = z * scale;
    if (ground === GROUND.clear || ground === GROUND.rough) {
      ctx.strokeStyle = random() < 0.6 ? tuft : blade;
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let n = 0; n < 4; n++) {
        const bx = px + (random() - 0.5) * 4;
        ctx.moveTo(bx, pz);
        ctx.lineTo(bx + (random() - 0.5) * 3, pz - 2 - random() * 3);
      }
      ctx.stroke();
    } else if (ground === GROUND.sand || ground === GROUND.cliff || ground === GROUND.road) {
      const r = 0.8 + random() * 1.6;
      ctx.fillStyle = shadow;
      ctx.beginPath();
      ctx.ellipse(px + 0.8, pz + 0.8, r, r * 0.7, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = stone;
      ctx.beginPath();
      ctx.ellipse(px, pz, r, r * 0.7, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

/** Open ground for build-button photos: packed sand and scrub, tiling. */
export function cameoGroundTexture(faction: 'accord' | 'bloc'): THREE.CanvasTexture {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  const texture = new THREE.CanvasTexture(canvas);
  if (!ctx) return texture;
  const image = ctx.createImageData(size, size);
  const light: Rgb = faction === 'accord' ? [196, 184, 156] : [200, 170, 140];
  const dark: Rgb = faction === 'accord' ? [120, 124, 96] : [140, 104, 80];
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      // Wrap the noise so the texture tiles.
      const u = (x / size) * 8;
      const v = (y / size) * 8;
      const blend = (noise(u % 8, v % 8, 61) + noise((u + 4) % 8, (v + 4) % 8, 67)) / 2;
      const color = scaled(mix(light, dark, blend), 0.9 + hash2(x, y, 3) * 0.2);
      const i = (y * size + x) * 4;
      image.data[i] = Math.min(255, color[0]);
      image.data[i + 1] = Math.min(255, color[1]);
      image.data[i + 2] = Math.min(255, color[2]);
      image.data[i + 3] = 255;
    }
  }
  ctx.putImageData(image, 0, 0);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/** Wave ripples as a tiling normal map, from a few crossing swells plus chop. */
export function waterNormalTexture(): THREE.CanvasTexture {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  const texture = new THREE.CanvasTexture(canvas);
  if (!ctx) return texture;
  const tau = Math.PI * 2;
  // Whole numbers of waves across the tile, so it repeats without a seam.
  const height = (x: number, y: number) => {
    const u = (x / size) * tau;
    const v = (y / size) * tau;
    return (
      Math.sin(u * 3 + v * 2) * 0.5 +
      Math.sin(u * -2 + v * 5 + 1.3) * 0.35 +
      Math.sin(u * 7 + v * 3 + 2.1) * 0.18 +
      Math.sin(u * 5 - v * 9 + 0.4) * 0.1 +
      (noise(((x / size) * 16) % 16, ((y / size) * 16) % 16, 71) - 0.5) * 0.25
    );
  };
  const image = ctx.createImageData(size, size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = height((x + 1) % size, y) - height((x + size - 1) % size, y);
      const dy = height(x, (y + 1) % size) - height(x, (y + size - 1) % size);
      const length = Math.hypot(dx, dy, 1);
      const i = (y * size + x) * 4;
      image.data[i] = Math.round((-dx / length) * 127 + 128);
      image.data[i + 1] = Math.round((-dy / length) * 127 + 128);
      image.data[i + 2] = Math.round((1 / length) * 127 + 128);
      image.data[i + 3] = 255;
    }
  }
  ctx.putImageData(image, 0, 0);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.colorSpace = THREE.NoColorSpace;
  return texture;
}

/** A fine tiling grain (blades, pebbles), centred on mid-grey so it can multiply. */
export function detailTexture(): THREE.CanvasTexture {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  const texture = new THREE.CanvasTexture(canvas);
  if (!ctx) return texture;
  ctx.fillStyle = 'rgb(128,128,128)';
  ctx.fillRect(0, 0, size, size);
  let seed = 1;
  const random = () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
  for (let i = 0; i < 1800; i++) {
    const x = random() * size;
    const y = random() * size;
    const light = random() < 0.5;
    ctx.strokeStyle = light ? 'rgba(210,210,210,0.5)' : 'rgba(30,30,30,0.5)';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + (random() - 0.5) * 3, y - 2 - random() * 4);
    ctx.stroke();
  }
  for (let i = 0; i < 300; i++) {
    const x = random() * size;
    const y = random() * size;
    const r = 0.8 + random() * 1.8;
    ctx.fillStyle = random() < 0.5 ? 'rgba(60,60,60,0.45)' : 'rgba(190,190,190,0.4)';
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.colorSpace = THREE.NoColorSpace;
  return texture;
}

/** Panel seams, rivets, runoff streaks and grime for hard surfaces, centred on mid-grey. */
export function grimeTexture(): THREE.CanvasTexture {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  const texture = new THREE.CanvasTexture(canvas);
  if (!ctx) return texture;
  const image = ctx.createImageData(size, size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dirt = fbm(x / 22, y / 22, 41, 4);
      const speck = hash2(x, y, 9);
      let v = 128 + (dirt - 0.5) * 80 + (speck - 0.5) * 22;
      // Panel seams every 64 pixels, a lit edge just after each.
      const px = x % 64;
      const py = y % 64;
      if (px < 3 || py < 3) v -= 62;
      else if (px < 5 || py < 5) v += 26;
      // Runoff streaking down from each seam.
      if (py >= 5 && py < 20 && hash2(Math.floor(x / 3), 0, 17) > 0.7) v -= (20 - py) * 1.6;
      // Rivets beside the seams.
      if ((px === 8 || px === 9 || px === 56 || px === 57) && py % 12 >= 6 && py % 12 <= 7) {
        v -= 50;
      }
      const i = (y * size + x) * 4;
      const value = Math.max(0, Math.min(255, v));
      image.data[i] = value;
      image.data[i + 1] = value;
      image.data[i + 2] = value;
      image.data[i + 3] = 255;
    }
  }
  ctx.putImageData(image, 0, 0);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.colorSpace = THREE.NoColorSpace;
  return texture;
}

/** A burn mark: soft and ragged, darkest in the middle (alpha only; tinted by the material). */
export function scorchTexture(): THREE.CanvasTexture {
  const size = 64;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  const texture = new THREE.CanvasTexture(canvas);
  if (!ctx) return texture;
  const image = ctx.createImageData(size, size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = (x / size) * 2 - 1;
      const v = (y / size) * 2 - 1;
      const angle = Math.atan2(v, u);
      const edge = 0.7 + (noise(Math.cos(angle) * 2 + 3, Math.sin(angle) * 2 + 3, 5) - 0.5) * 0.5;
      const r = Math.hypot(u, v) / edge;
      const soot = Math.max(0, 1 - r) ** 0.7 * (0.75 + hash2(x, y, 8) * 0.25);
      const i = (y * size + x) * 4;
      image.data[i] = 255;
      image.data[i + 1] = 255;
      image.data[i + 2] = 255;
      image.data[i + 3] = Math.round(Math.min(1, soot) * 255);
    }
  }
  ctx.putImageData(image, 0, 0);
  return texture;
}

/** A crater: a shaded pit ringed with thrown-up earth, lit from the upper left. */
export function craterTexture(): THREE.CanvasTexture {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  const texture = new THREE.CanvasTexture(canvas);
  if (!ctx) return texture;
  const image = ctx.createImageData(size, size);
  // Height by distance from the centre (0–1): a bowl, a raised lip, then flat ground.
  const profile = (r: number) => {
    if (r < 0.62) return -0.5 * (1 - (r / 0.62) ** 2);
    if (r < 0.9) return 0.16 * Math.sin(((r - 0.62) / 0.28) * Math.PI);
    return 0;
  };
  const [lx, ly, lz] = [-0.6, 0.55, -0.58];
  const e = 0.02;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = (x / size) * 2 - 1;
      const v = (y / size) * 2 - 1;
      const wobble = (noise(u * 4 + 5, v * 4 + 5, 3) - 0.5) * 0.12;
      const height = (a: number, b: number) => profile(Math.hypot(a, b) + wobble);
      const r = Math.hypot(u, v) + wobble;
      const nx = -(height(u + e, v) - height(u - e, v)) / (2 * e);
      const nz = -(height(u, v + e) - height(u, v - e)) / (2 * e);
      const length = Math.hypot(nx, 1, nz);
      const lit = Math.max(0, (nx * lx + ly + nz * lz) / length);
      const depth = Math.max(0, -profile(r));
      const clod = hash2(x, y, 31) < 0.08 && r > 0.55 && r < 0.95 ? 0.75 : 1;
      const earth = mix([150, 116, 74], [74, 54, 36], Math.min(1, depth * 2.2));
      const shade = (0.35 + lit * 0.95) * clod;
      const alpha = r < 0.82 ? 1 : Math.max(0, 1 - (r - 0.82) / 0.16);
      const i = (y * size + x) * 4;
      image.data[i] = Math.min(255, earth[0] * shade);
      image.data[i + 1] = Math.min(255, earth[1] * shade);
      image.data[i + 2] = Math.min(255, earth[2] * shade);
      image.data[i + 3] = Math.round(alpha * 255);
    }
  }
  ctx.putImageData(image, 0, 0);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}
