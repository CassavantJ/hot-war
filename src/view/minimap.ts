import { GROUND, type GameMap } from '../sim/map';
import type { Neutral } from '../sim/maps';
import { STRUCTURES } from '../sim/rules';
import type { World } from '../sim/world';

/** The radar squashes the map into a diamond, the same shape it has on screen. */
export const SQUASH = 0.6;

const COLORS: Record<string, Record<number, [number, number, number]>> = {
  temperate: {
    [GROUND.clear]: [88, 128, 60],
    [GROUND.rough]: [110, 118, 66],
    [GROUND.road]: [120, 116, 104],
    [GROUND.sand]: [190, 172, 124],
    [GROUND.water]: [40, 92, 140],
    [GROUND.cliff]: [96, 86, 76],
    [GROUND.pavement]: [140, 138, 130],
  },
  snow: {
    [GROUND.clear]: [210, 222, 230],
    [GROUND.rough]: [186, 200, 210],
    [GROUND.road]: [130, 136, 142],
    [GROUND.sand]: [170, 182, 190],
    [GROUND.water]: [60, 110, 150],
    [GROUND.cliff]: [96, 104, 114],
    [GROUND.pavement]: [150, 156, 162],
  },
  desert: {
    [GROUND.clear]: [200, 170, 112],
    [GROUND.rough]: [184, 148, 92],
    [GROUND.road]: [128, 116, 96],
    [GROUND.sand]: [214, 190, 140],
    [GROUND.water]: [40, 110, 140],
    [GROUND.cliff]: [140, 96, 64],
    [GROUND.pavement]: [158, 150, 134],
  },
};

export interface Layout {
  scale: number;
  offsetX: number;
  offsetY: number;
  width: number;
  height: number;
}

/** Fits a map's diamond into a box of the given size. */
export function layout(
  map: { width: number; height: number },
  width: number,
  height: number,
): Layout {
  const span = map.width + map.height;
  const scale = Math.min(width / span, height / (span * SQUASH));
  return {
    scale,
    offsetX: (width - span * scale) / 2,
    offsetY: (height - span * SQUASH * scale) / 2,
    width,
    height,
  };
}

export function toRadar(
  map: { height: number },
  box: Layout,
  x: number,
  z: number,
): { x: number; y: number } {
  return {
    x: box.offsetX + (x - z + map.height) * box.scale,
    y: box.offsetY + (x + z) * box.scale * SQUASH,
  };
}

export function fromRadar(
  map: { height: number },
  box: Layout,
  px: number,
  py: number,
): { x: number; z: number } {
  const u = (px - box.offsetX) / box.scale - map.height;
  const v = (py - box.offsetY) / (box.scale * SQUASH);
  return { x: (u + v) / 2, z: (v - u) / 2 };
}

/** A top-down picture of the ground and ore, one pixel per cell. */
export function terrainPixels(map: GameMap, withOre = true): ImageData {
  const image = new ImageData(map.width, map.height);
  const palette = COLORS[map.theme] ?? COLORS.temperate;
  for (let i = 0; i < map.ground.length; i++) {
    let [r, g, b] = palette?.[map.groundAt(i)] ?? [80, 80, 80];
    if (map.tree[i]) [r, g, b] = [r * 0.72, g * 0.8, b * 0.72];
    const ore = map.oreAt(i);
    if (withOre && ore > 0) [r, g, b] = map.gem[i] ? [170, 110, 230] : [220, 184, 70];
    image.data[i * 4] = r;
    image.data[i * 4 + 1] = g;
    image.data[i * 4 + 2] = b;
    image.data[i * 4 + 3] = 255;
  }
  return image;
}

/** Draws the ground as a diamond into `ctx` using a scratch canvas. */
export function drawGround(
  ctx: CanvasRenderingContext2D,
  map: GameMap,
  box: Layout,
  image: ImageData,
  scratch: HTMLCanvasElement,
): void {
  if (scratch.width !== map.width || scratch.height !== map.height) {
    scratch.width = map.width;
    scratch.height = map.height;
  }
  scratch.getContext('2d')?.putImageData(image, 0, 0);
  ctx.save();
  const s = box.scale;
  ctx.setTransform(s, s * SQUASH, -s, s * SQUASH, box.offsetX + map.height * s, box.offsetY);
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(scratch, 0, 0);
  ctx.restore();
}

/** A lobby preview: the map plus its neutral buildings and start positions. */
export function drawPreview(canvas: HTMLCanvasElement, map: GameMap, neutrals: Neutral[]): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  const box = layout(map, canvas.width, canvas.height);
  const image = terrainPixels(map);
  for (const neutral of neutrals) {
    const [w, h] = STRUCTURES[neutral.type].size;
    for (let z = neutral.z; z < neutral.z + h; z++) {
      for (let x = neutral.x; x < neutral.x + w; x++) {
        const i = map.index(x, z) * 4;
        image.data[i] = 170;
        image.data[i + 1] = 170;
        image.data[i + 2] = 170;
      }
    }
  }
  drawGround(ctx, map, box, image, document.createElement('canvas'));
  ctx.font = '700 11px Inter Variable, system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  map.starts.forEach((start, i) => {
    const p = toRadar(map, box, start.x + 0.5, start.z + 0.5);
    ctx.fillStyle = 'rgba(0,0,0,0.7)';
    ctx.beginPath();
    ctx.arc(p.x, p.y, 8, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.fillText(String(i + 1), p.x, p.y + 0.5);
  });
}

/** The live radar: ground, ore, the shroud, buildings, units and the camera's view. */
export function drawRadar(
  ctx: CanvasRenderingContext2D,
  world: World,
  local: number,
  box: Layout,
  base: ImageData,
  scratch: HTMLCanvasElement,
  view: { x: number; z: number }[] | null,
): void {
  const map = world.map;
  const me = world.players[local];
  const image = new ImageData(new Uint8ClampedArray(base.data), map.width, map.height);
  const data = image.data;
  for (let i = 0; i < map.ore.length; i++) {
    if (map.oreAt(i) > 0) {
      const gem = map.gem[i] !== 0;
      data[i * 4] = gem ? 170 : 220;
      data[i * 4 + 1] = gem ? 110 : 184;
      data[i * 4 + 2] = gem ? 230 : 70;
    }
  }
  const paint = (x: number, z: number, color: [number, number, number]) => {
    if (!map.inside(x, z)) return;
    const i = map.index(x, z) * 4;
    data[i] = color[0];
    data[i + 1] = color[1];
    data[i + 2] = color[2];
  };
  const colors = world.players.map((player) => hexRgb(player.color));
  for (const structure of world.structures) {
    const color: [number, number, number] =
      structure.owner < 0 ? [170, 170, 170] : (colors[structure.owner] ?? [255, 255, 255]);
    for (let z = structure.z; z < structure.z + structure.h; z++) {
      for (let x = structure.x; x < structure.x + structure.w; x++) paint(x, z, color);
    }
  }
  for (const unit of world.units) {
    if (unit.inside) continue;
    const x = Math.floor(unit.x);
    const z = Math.floor(unit.z);
    if (
      unit.owner !== local &&
      me?.shroud[
        map.index(Math.min(map.width - 1, Math.max(0, x)), Math.min(map.height - 1, Math.max(0, z)))
      ] === 0
    )
      continue;
    paint(x, z, colors[unit.owner] ?? [255, 255, 255]);
  }
  if (me) {
    for (let i = 0; i < me.shroud.length; i++) {
      if (me.shroud[i] === 0) {
        data[i * 4] = 0;
        data[i * 4 + 1] = 0;
        data[i * 4 + 2] = 0;
      }
    }
  }
  ctx.clearRect(0, 0, box.width, box.height);
  drawGround(ctx, map, box, image, scratch);
  if (view) {
    ctx.strokeStyle = 'rgba(255,255,255,0.85)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    view.forEach((corner, i) => {
      const p = toRadar(map, box, corner.x, corner.z);
      if (i === 0) ctx.moveTo(p.x, p.y);
      else ctx.lineTo(p.x, p.y);
    });
    ctx.closePath();
    ctx.stroke();
  }
}

function hexRgb(hex: string): [number, number, number] {
  const value = parseInt(hex.slice(1), 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}
