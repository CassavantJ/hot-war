import type { Controller } from '../game/controller';
import { SUPERWEAPONS } from '../sim/rules';
import type { Structure, Unit } from '../sim/entities';
import type { GameView } from './GameView';

function healthColor(fraction: number): string {
  if (fraction > 0.5) return '#3ee05a';
  if (fraction > 0.25) return '#f2d23a';
  return '#ee3b30';
}

/** Health as a row of pips, like the classics. */
function pips(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  fraction: number,
): void {
  const count = Math.max(4, Math.round(width / 4));
  const pip = width / count;
  ctx.fillStyle = 'rgba(0,0,0,0.65)';
  ctx.fillRect(x - 1, y - 1, width + 2, 5);
  const lit = Math.ceil(count * Math.max(0, Math.min(1, fraction)));
  ctx.fillStyle = healthColor(fraction);
  for (let i = 0; i < lit; i++) ctx.fillRect(x + i * pip, y, Math.max(1, pip - 1), 3);
}

function brackets(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number): void {
  const l = Math.min(w, h) * 0.28;
  ctx.beginPath();
  ctx.moveTo(x, y + l);
  ctx.lineTo(x, y);
  ctx.lineTo(x + l, y);
  ctx.moveTo(x + w - l, y);
  ctx.lineTo(x + w, y);
  ctx.lineTo(x + w, y + l);
  ctx.moveTo(x + w, y + h - l);
  ctx.lineTo(x + w, y + h);
  ctx.lineTo(x + w - l, y + h);
  ctx.moveTo(x + l, y + h);
  ctx.lineTo(x, y + h);
  ctx.lineTo(x, y + h - l);
  ctx.stroke();
}

function chevrons(ctx: CanvasRenderingContext2D, x: number, y: number, rank: number): void {
  if (rank <= 0) return;
  ctx.fillStyle = rank === 2 ? '#ffd23f' : '#d6d6d6';
  ctx.strokeStyle = '#000';
  ctx.lineWidth = 1;
  for (let i = 0; i < rank; i++) {
    const cy = y - i * 4;
    ctx.beginPath();
    ctx.moveTo(x, cy);
    ctx.lineTo(x + 4, cy - 3);
    ctx.lineTo(x + 8, cy);
    ctx.lineTo(x + 8, cy + 2);
    ctx.lineTo(x + 4, cy - 1);
    ctx.lineTo(x, cy + 2);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }
}

/** Draws selection marks, health, rally points and the drag box over the 3D view. */
export function drawHud(
  ctx: CanvasRenderingContext2D,
  view: GameView,
  controller: Controller,
  time: number,
): void {
  const world = view.world;
  ctx.clearRect(0, 0, view.width, view.height);
  ctx.lineWidth = 1.5;
  const perUnit = view.pixelsPerUnit;
  const selected = controller.selection;
  // Structures: the selected one, and any hovered.
  const structures: Structure[] = [];
  const picked = controller.structure();
  if (picked) structures.push(picked);
  const hovered = world.structure(controller.hoverStructure);
  if (hovered && hovered !== picked) structures.push(hovered);
  for (const structure of world.structures) {
    if (
      structure.owner === view.local &&
      (structure.repairing || structure.charge > 0) &&
      !structures.includes(structure)
    ) {
      structures.push(structure);
    }
  }
  for (const structure of structures) {
    if (!view.structureVisible(structure)) continue;
    const corners = [
      view.project(structure.x, 0, structure.z),
      view.project(structure.x + structure.w, 0, structure.z),
      view.project(structure.x, 0, structure.z + structure.h),
      view.project(structure.x + structure.w, 0, structure.z + structure.h),
      view.project(structure.cx, structure.def.height, structure.cz),
    ];
    const xs = corners.map((p) => p.x);
    const ys = corners.map((p) => p.y);
    const x0 = Math.min(...xs);
    const x1 = Math.max(...xs);
    const y0 = Math.min(...ys) - 6;
    const y1 = Math.max(...ys);
    const isPicked = structure === picked;
    if (isPicked) {
      ctx.strokeStyle = 'rgba(255,255,255,0.9)';
      brackets(ctx, x0, y0, x1 - x0, y1 - y0);
    }
    if (isPicked || structure === hovered || structure.hp < structure.maxHp) {
      pips(ctx, (x0 + x1) / 2 - 30, y0 - 8, 60, structure.hp / structure.maxHp);
    }
    ctx.font = '600 10px Inter Variable, system-ui, sans-serif';
    ctx.textAlign = 'center';
    if (structure.repairing && Math.floor(time * 3) % 2 === 0) {
      ctx.fillStyle = '#ffd23f';
      ctx.fillText('REPAIRING', (x0 + x1) / 2, y0 - 12);
    }
    if (structure.charge > 0) {
      ctx.fillStyle = '#ff5a4a';
      ctx.fillText(`CHARGES ${Math.ceil(structure.charge)}`, (x0 + x1) / 2, y0 - 12);
    }
    if (isPicked && structure.primary && structure.owner === view.local) {
      ctx.fillStyle = '#e8e8e8';
      ctx.fillText('PRIMARY', (x0 + x1) / 2, y1 + 12);
    }
    const capacity = structure.def.garrison ?? 0;
    if (capacity > 0 && (isPicked || structure === hovered)) {
      for (let i = 0; i < capacity; i++) {
        ctx.fillStyle =
          i < structure.garrison.length
            ? (view.world.players[structure.owner]?.color ?? '#aaa')
            : 'rgba(0,0,0,0.5)';
        ctx.fillRect((x0 + x1) / 2 - capacity * 4 + i * 8, y0 - 2, 6, 6);
      }
    }
    if (isPicked && structure.rally && structure.owner === view.local) {
      const from = view.project(structure.cx, 0.1, structure.cz);
      const to = view.project(structure.rally.x, 0, structure.rally.z);
      ctx.strokeStyle = 'rgba(255,255,255,0.6)';
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(from.x, from.y);
      ctx.lineTo(to.x, to.y);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = view.world.players[structure.owner]?.color ?? '#fff';
      ctx.fillRect(to.x, to.y - 14, 9, 6);
      ctx.fillStyle = '#ddd';
      ctx.fillRect(to.x - 1, to.y - 14, 1.5, 14);
    }
  }
  // Units: selected ones get brackets and health; hovered or hurt ones get health on hover.
  const hoverUnit = world.unit(controller.hoverUnit);
  const draw = (unit: Unit, isSelected: boolean) => {
    const height = unit.def.kind === 'infantry' ? 0.34 : unit.def.flies === 'airship' ? 1 : 0.45;
    const top = view.project(unit.x, unit.alt + height, unit.z);
    const bottom = view.project(unit.x, unit.alt, unit.z);
    const half = Math.max(7, unit.def.radius * perUnit * 1.1);
    const width = unit.def.kind === 'infantry' ? 18 : Math.min(48, Math.max(26, half * 1.8));
    if (isSelected) {
      ctx.strokeStyle = 'rgba(255,255,255,0.85)';
      brackets(ctx, top.x - half, top.y - 3, half * 2, bottom.y - top.y + 6);
    }
    pips(ctx, top.x - width / 2, top.y - 9, width, unit.hp / unit.maxHp);
    if (unit.def.harvester) {
      const load = unit.load / unit.def.harvester.capacity;
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      ctx.fillRect(top.x - width / 2 - 1, top.y - 4, width + 2, 4);
      ctx.fillStyle = '#e8c34a';
      ctx.fillRect(top.x - width / 2, top.y - 3, width * load, 2);
    }
    chevrons(ctx, top.x + width / 2 + 2, top.y - 5, unit.rank);
    const room = unit.def.transport?.slots ?? 0;
    if (room > 0 && (isSelected || unit.passengers.length > 0)) {
      let used = 0;
      for (const id of unit.passengers) used += world.unit(id)?.def.kind === 'infantry' ? 1 : 4;
      for (let i = 0; i < room; i++) {
        ctx.fillStyle = i < used ? '#ffd35a' : 'rgba(0,0,0,0.6)';
        ctx.fillRect(top.x - width / 2 + i * 5, top.y - 15, 4, 4);
      }
    }
    const group = isSelected ? controller.groupOf(unit.id) : null;
    if (group !== null) {
      ctx.font = '700 10px Inter Variable, system-ui, sans-serif';
      ctx.textAlign = 'left';
      ctx.fillStyle = '#fff';
      ctx.strokeStyle = '#000';
      ctx.lineWidth = 2.5;
      ctx.strokeText(String(group), top.x - width / 2 - 8, top.y - 3);
      ctx.fillText(String(group), top.x - width / 2 - 8, top.y - 3);
      ctx.lineWidth = 1.5;
    }
  };
  for (const unit of world.units) {
    if (!view.unitVisible(unit)) continue;
    const isSelected = selected.has(unit.id);
    if (isSelected || unit === hoverUnit) draw(unit, isSelected);
  }
  // A superweapon's area, while aiming it.
  const mode = controller.mode;
  if (mode.kind === 'superweapon') {
    const weapon = world.structure(mode.id)?.def.superweapon;
    if (weapon) {
      const radius = SUPERWEAPONS[weapon].radius;
      const circle = (x: number, z: number, color: string) => {
        ctx.strokeStyle = color;
        ctx.lineWidth = 2;
        ctx.beginPath();
        for (let i = 0; i <= 40; i++) {
          const angle = (i / 40) * Math.PI * 2;
          const p = view.project(x + Math.cos(angle) * radius, 0, z + Math.sin(angle) * radius);
          if (i === 0) ctx.moveTo(p.x, p.y);
          else ctx.lineTo(p.x, p.y);
        }
        ctx.stroke();
      };
      const cursor = view.screenToWorld(controller.pointerX, controller.pointerY);
      if (mode.from) {
        circle(mode.from.x, mode.from.z, 'rgba(120,200,255,0.9)');
        const a = view.project(mode.from.x, 0, mode.from.z);
        const b = view.project(cursor.x, 0, cursor.z);
        ctx.setLineDash([6, 6]);
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
        ctx.setLineDash([]);
      }
      circle(
        cursor.x,
        cursor.z,
        Math.floor(time * 4) % 2 ? 'rgba(255,177,61,0.95)' : 'rgba(255,90,60,0.95)',
      );
    }
  }
  // Order markers.
  for (const marker of controller.markers) {
    const p = view.project(marker.x, 0, marker.z);
    const t = marker.age / 0.8;
    ctx.strokeStyle =
      marker.kind === 'attack' ? `rgba(255,70,60,${1 - t})` : `rgba(90,255,110,${1 - t})`;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(p.x, p.y, 14 * (1 - t) + 3, 7 * (1 - t) + 1.5, 0, 0, Math.PI * 2);
    ctx.stroke();
  }
  // Drag box.
  const box = controller.box;
  if (box) {
    ctx.strokeStyle = 'rgba(255,255,255,0.9)';
    ctx.lineWidth = 1;
    ctx.fillStyle = 'rgba(255,255,255,0.06)';
    const x = Math.min(box.x0, box.x1);
    const y = Math.min(box.y0, box.y1);
    ctx.fillRect(x, y, Math.abs(box.x1 - box.x0), Math.abs(box.y1 - box.y0));
    ctx.strokeRect(x + 0.5, y + 0.5, Math.abs(box.x1 - box.x0), Math.abs(box.y1 - box.y0));
  }
}
