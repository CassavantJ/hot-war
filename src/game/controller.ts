import type { Entity, Structure, Unit } from '../sim/entities';
import { GROUND } from '../sim/map';
import {
  orderAttack,
  orderAttackGround,
  orderDeploy,
  orderEnter,
  orderEvacuate,
  orderGuard,
  orderHarvest,
  orderMove,
  orderScatter,
  orderStop,
} from '../sim/orders';
import {
  placementCheck,
  placeStructure,
  placeWalls,
  sell,
  setPrimary,
  toggleRepair,
  type PlacementCheck,
} from '../sim/production';
import { STRUCTURES, WEAPONS, type StructureType } from '../sim/rules';
import type { World } from '../sim/world';
import type { GameView } from '../view/GameView';

export type Mode =
  | { kind: 'normal' }
  | { kind: 'place'; type: StructureType }
  | { kind: 'sell' }
  | { kind: 'repair' }
  | { kind: 'attackMove' };

export type Action =
  | 'none'
  | 'select'
  | 'move'
  | 'attack'
  | 'enter'
  | 'capture'
  | 'deploy'
  | 'harvest'
  | 'rally'
  | 'nogo'
  | 'sell'
  | 'repair'
  | 'place'
  | 'noplace';

export interface Marker {
  x: number;
  z: number;
  kind: 'move' | 'attack';
  age: number;
}

export type Cue = 'select' | 'move' | 'attack' | 'error' | 'click';

const EDGE = 10;
const DRAG = 5;

/** Mouse and keyboard: selection, orders, placing buildings and moving the camera. */
export class Controller {
  readonly world: World;
  readonly view: GameView;
  readonly local: number;
  readonly selection = new Set<number>();
  /** A selected structure (yours or anyone's, for its health and rally point). */
  selectedStructure = 0;
  readonly groups = new Map<number, number[]>();
  mode: Mode = { kind: 'normal' };
  action: Action = 'none';
  placement: PlacementCheck | null = null;
  readonly markers: Marker[] = [];
  /** Screen-space drag box, while box-selecting. */
  box: { x0: number; y0: number; x1: number; y1: number } | null = null;
  hoverUnit = 0;
  hoverStructure = 0;
  /** Where the last alert was, for the space bar. */
  alert: { x: number; z: number } | null = null;
  onCue: (cue: Cue) => void = () => undefined;
  onMenu: () => void = () => undefined;
  onTab: (tab: number | 'next') => void = () => undefined;
  private pointer = { x: 0, y: 0, inside: false };
  private leftDown: { x: number; y: number; wall: { x: number; z: number } | null } | null = null;
  private rightDown: { x: number; y: number; moved: boolean } | null = null;
  private readonly keys = new Set<string>();
  private lastClick = { time: 0, id: 0 };
  private lastGroup = { time: 0, group: -1 };
  private lastTypeSelect = 0;
  private wallLine: { x: number; z: number }[] = [];

  constructor(world: World, view: GameView, local: number) {
    this.world = world;
    this.view = view;
    this.local = local;
  }

  // Queries ------------------------------------------------------------------------------------

  selectedUnits(): Unit[] {
    const units: Unit[] = [];
    for (const id of this.selection) {
      const unit = this.world.unit(id);
      if (unit?.owner === this.local && !unit.inside) units.push(unit);
      else this.selection.delete(id);
    }
    return units;
  }

  structure(): Structure | null {
    const structure = this.world.structure(this.selectedStructure);
    if (!structure) this.selectedStructure = 0;
    return structure ?? null;
  }

  private mine(entity: Entity): boolean {
    return entity.owner === this.local;
  }

  // Modes --------------------------------------------------------------------------------------

  setMode(mode: Mode): void {
    this.mode = mode;
    this.placement = null;
    this.wallLine = [];
  }

  startPlacement(type: StructureType): void {
    this.setMode({ kind: 'place', type });
  }

  // Pointer ------------------------------------------------------------------------------------

  pointerMove(x: number, y: number, inside: boolean): void {
    this.pointer = { x, y, inside };
    if (this.leftDown && !this.box && this.mode.kind === 'normal') {
      if (Math.hypot(x - this.leftDown.x, y - this.leftDown.y) > DRAG) {
        this.box = { x0: this.leftDown.x, y0: this.leftDown.y, x1: x, y1: y };
      }
    }
    if (this.box) {
      this.box.x1 = x;
      this.box.y1 = y;
    }
    if (this.rightDown) {
      const dx = x - this.rightDown.x;
      const dy = y - this.rightDown.y;
      if (this.rightDown.moved || Math.hypot(dx, dy) > DRAG) {
        this.rightDown.moved = true;
        this.view.pan(-dx, -dy);
        this.rightDown.x = x;
        this.rightDown.y = y;
      }
    }
  }

  pointerLeave(): void {
    this.pointer.inside = false;
  }

  pointerDown(button: number, x: number, y: number): void {
    if (button === 0) {
      let wall: { x: number; z: number } | null = null;
      if (this.mode.kind === 'place' && STRUCTURES[this.mode.type].role === 'wall') {
        const ground = this.view.screenToWorld(x, y);
        wall = { x: Math.floor(ground.x), z: Math.floor(ground.z) };
      }
      this.leftDown = { x, y, wall };
    } else if (button === 2 || button === 1) {
      this.rightDown = { x, y, moved: false };
    }
  }

  pointerUp(
    button: number,
    x: number,
    y: number,
    mods: { shift: boolean; ctrl: boolean; alt: boolean },
  ): void {
    if (button === 0) {
      const down = this.leftDown;
      this.leftDown = null;
      if (this.box) {
        this.finishBox(mods.shift);
        this.box = null;
        return;
      }
      if (down?.wall && this.mode.kind === 'place') {
        this.placeWallLine();
        return;
      }
      if (down) this.click(x, y, mods);
      return;
    }
    const right = this.rightDown;
    this.rightDown = null;
    if (right && !right.moved && button === 2) this.cancel();
  }

  /** Right-click: back out of a mode, or let go of the selection. */
  cancel(): void {
    if (this.mode.kind !== 'normal') {
      this.setMode({ kind: 'normal' });
      return;
    }
    this.selection.clear();
    this.selectedStructure = 0;
  }

  wheel(deltaY: number): void {
    this.view.zoomBy(deltaY > 0 ? 1.12 : 1 / 1.12);
  }

  // Keyboard -----------------------------------------------------------------------------------

  keyDown(event: KeyboardEvent): boolean {
    const key = event.key.toLowerCase();
    this.keys.add(key);
    const ctrl = event.ctrlKey || event.metaKey;
    if (/^[0-9]$/.test(key)) {
      const group = Number(key);
      // Ctrl+number sets a group; Alt+number too, for browsers that keep Ctrl+number.
      if (ctrl || event.altKey) {
        this.groups.set(
          group,
          this.selectedUnits().map((unit) => unit.id),
        );
        this.onCue('click');
      } else {
        this.recallGroup(group, event.shiftKey);
      }
      return true;
    }
    switch (key) {
      case 'escape':
        if (this.mode.kind !== 'normal' || this.selection.size > 0) this.cancel();
        else this.onMenu();
        return true;
      case 's':
        orderStop(this.selectedUnits());
        this.onCue('move');
        return true;
      case 'g':
        orderGuard(this.selectedUnits());
        this.onCue('move');
        return true;
      case 'd': {
        const structure = this.structure();
        if (structure && this.mine(structure) && structure.garrison.length > 0) {
          orderEvacuate(this.world, structure);
          return true;
        }
        orderDeploy(this.selectedUnits());
        this.onCue('move');
        return true;
      }
      case 'x':
        orderScatter(this.world, this.selectedUnits());
        this.onCue('move');
        return true;
      case 'a':
        if (this.selection.size > 0) this.setMode({ kind: 'attackMove' });
        return true;
      case 't':
        this.selectSameType(performance.now() - this.lastTypeSelect < 400);
        this.lastTypeSelect = performance.now();
        return true;
      case 'h':
        this.centreOnBase();
        return true;
      case ' ':
        if (this.alert) this.view.focus.set(this.alert.x, this.alert.z);
        return true;
      case 'tab':
        this.onTab('next');
        return true;
      case 'q':
        this.onTab(0);
        return true;
      case 'w':
        this.onTab(1);
        return true;
      case 'e':
        this.onTab(2);
        return true;
      case 'r':
        this.onTab(3);
        return true;
      case 'k':
        this.setMode(this.mode.kind === 'sell' ? { kind: 'normal' } : { kind: 'sell' });
        return true;
      case 'z':
        this.setMode(this.mode.kind === 'repair' ? { kind: 'normal' } : { kind: 'repair' });
        return true;
      default:
        return key.startsWith('arrow');
    }
  }

  keyUp(event: KeyboardEvent): void {
    this.keys.delete(event.key.toLowerCase());
  }

  clearKeys(): void {
    this.keys.clear();
    this.leftDown = null;
    this.rightDown = null;
    this.box = null;
  }

  // Per frame ------------------------------------------------------------------------------------

  update(dt: number): void {
    const speed = this.view.zoom * 1.3 * dt * 60;
    let dx = 0;
    let dy = 0;
    if (this.keys.has('arrowleft')) dx -= speed;
    if (this.keys.has('arrowright')) dx += speed;
    if (this.keys.has('arrowup')) dy -= speed;
    if (this.keys.has('arrowdown')) dy += speed;
    const { x, y, inside } = this.pointer;
    if (inside && !this.rightDown && !this.box) {
      if (x < EDGE) dx -= speed;
      if (x > this.view.width - EDGE) dx += speed;
      if (y < EDGE) dy -= speed;
      if (y > this.view.height - EDGE) dy += speed;
    }
    if (dx || dy) this.view.pan(dx, dy);
    for (let i = this.markers.length - 1; i >= 0; i--) {
      const marker = this.markers[i];
      if (!marker) continue;
      marker.age += dt;
      if (marker.age > 0.8) this.markers.splice(i, 1);
    }
    this.updateHover();
  }

  private updateHover(): void {
    const { x, y, inside } = this.pointer;
    if (!inside) {
      this.action = 'none';
      this.placement = null;
      return;
    }
    const unit = this.view.pickUnit(x, y);
    const structure = unit ? null : this.view.pickStructure(x, y);
    this.hoverUnit = unit?.id ?? 0;
    this.hoverStructure = structure?.id ?? 0;
    if (this.mode.kind === 'place') {
      this.updatePlacement(x, y);
      this.action = this.placement?.ok ? 'place' : 'noplace';
      return;
    }
    this.placement = null;
    this.action = this.resolve(unit ?? structure, x, y, {
      shift: false,
      ctrl: this.keys.has('control'),
      alt: this.keys.has('alt'),
    });
  }

  private updatePlacement(x: number, y: number): void {
    if (this.mode.kind !== 'place') return;
    const type = this.mode.type;
    const player = this.world.players[this.local];
    if (!player) return;
    const def = STRUCTURES[type];
    const ground = this.view.screenToWorld(x, y);
    if (def.role === 'wall' && this.leftDown?.wall) {
      this.wallLine = lineCells(this.leftDown.wall, {
        x: Math.floor(ground.x),
        z: Math.floor(ground.z),
      });
      const cells: PlacementCheck['cells'] = [];
      let ok = true;
      for (const cell of this.wallLine) {
        const check = placementCheck(this.world, player, type, cell.x, cell.z);
        cells.push({ x: cell.x, z: cell.z, ok: check.ok });
        ok &&= check.ok;
      }
      this.placement = { ok, reason: '', cells };
      return;
    }
    const [w, h] = def.size;
    const cx = Math.round(ground.x - w / 2);
    const cz = Math.round(ground.z - h / 2);
    this.placement = placementCheck(this.world, player, type, cx, cz);
  }

  /** What a left click here would do with the current selection. */
  private resolve(
    target: Entity | null,
    x: number,
    y: number,
    mods: { shift: boolean; ctrl: boolean; alt: boolean },
  ): Action {
    if (this.mode.kind === 'sell')
      return target?.entity === 'structure' && this.mine(target) ? 'sell' : 'nogo';
    if (this.mode.kind === 'repair') {
      return target?.entity === 'structure' && this.mine(target) && target.hp < target.maxHp
        ? 'repair'
        : 'nogo';
    }
    const units = this.selectedUnits();
    if (units.length === 0) {
      const structure = this.structure();
      if (!target && structure && this.mine(structure) && producer(structure)) return 'rally';
      return target ? 'select' : 'none';
    }
    const world = this.world;
    if (mods.ctrl) {
      if (!target) return units.some((unit) => unit.def.weapons.length > 0) ? 'attack' : 'nogo';
      return units.some((unit) => canAttack(unit, target)) ? 'attack' : 'nogo';
    }
    if (mods.alt || this.mode.kind === 'attackMove') return 'move';
    if (target) {
      if (target.entity === 'unit' && this.mine(target)) {
        if (this.selection.has(target.id) && (target.def.deploysToHq || target.def.dugInWeapon))
          return 'deploy';
        return 'select';
      }
      if (target.entity === 'structure') {
        const structure = target;
        const own = this.mine(structure);
        if (units.some((unit) => unit.def.engineer)) {
          if (own && structure.hp < structure.maxHp) return 'enter';
          if (
            !own &&
            structure.def.capturable &&
            (structure.owner < 0 || world.isEnemy(this.local, structure.owner))
          )
            return 'capture';
        }
        if (own) {
          if (structure.def.role === 'refinery' && units.some((unit) => unit.def.harvester))
            return 'enter';
          if (structure.def.walkable && units.some((unit) => unit.def.kind === 'vehicle'))
            return 'enter';
          if (garrisonable(structure, this.local) && units.some((unit) => unit.def.canGarrison))
            return 'enter';
          return 'select';
        }
        if (structure.owner < 0) {
          if (garrisonable(structure, this.local) && units.some((unit) => unit.def.canGarrison))
            return 'enter';
          return 'move';
        }
        if (units.some((unit) => unit.def.commando) && world.isEnemy(this.local, structure.owner))
          return 'enter';
      }
      if (world.isEnemy(this.local, target.owner) && units.some((unit) => canAttack(unit, target)))
        return 'attack';
      if (
        target.entity === 'structure' &&
        target.owner >= 0 &&
        !world.isEnemy(this.local, target.owner)
      )
        return 'move';
    }
    const ground = this.view.screenToWorld(x, y);
    const map = world.map;
    const cx = Math.floor(ground.x);
    const cz = Math.floor(ground.z);
    if (!map.inside(cx, cz)) return 'nogo';
    const cell = map.index(cx, cz);
    if (map.oreAt(cell) > 0 && units.some((unit) => unit.def.harvester)) return 'harvest';
    const ground_ = map.groundAt(cell);
    if (
      (ground_ === GROUND.water || ground_ === GROUND.cliff) &&
      units.every((unit) => !unit.def.flies)
    )
      return 'nogo';
    return 'move';
  }

  // Clicks -------------------------------------------------------------------------------------

  private click(x: number, y: number, mods: { shift: boolean; ctrl: boolean; alt: boolean }): void {
    const world = this.world;
    const player = world.players[this.local];
    if (!player) return;
    if (this.mode.kind === 'place') {
      this.updatePlacement(x, y);
      const check = this.placement;
      const cell = check?.cells[0];
      if (check?.ok && cell && placeStructure(world, player, this.mode.type, cell.x, cell.z)) {
        this.setMode({ kind: 'normal' });
      } else {
        this.onCue('error');
      }
      return;
    }
    const unit = this.view.pickUnit(x, y);
    const structure = unit ? null : this.view.pickStructure(x, y);
    const target: Entity | null = unit ?? structure;
    const action = this.resolve(target, x, y, mods);
    const ground = this.view.screenToWorld(x, y);
    const units = this.selectedUnits();
    switch (action) {
      case 'sell':
        if (structure) sell(world, structure);
        return;
      case 'repair':
        if (structure) toggleRepair(world, structure);
        return;
      case 'select':
        if (target) this.select(target, mods.shift);
        return;
      case 'rally': {
        const producerStructure = this.structure();
        if (producerStructure) {
          producerStructure.rally = { x: ground.x, z: ground.z };
          this.onCue('click');
        }
        return;
      }
      case 'deploy':
        orderDeploy(units);
        this.onCue('move');
        return;
      case 'attack':
        if (target) {
          orderAttack(world, units, target, mods.ctrl);
          this.markers.push({
            x: target.entity === 'unit' ? target.x : target.cx,
            z: target.entity === 'unit' ? target.z : target.cz,
            kind: 'attack',
            age: 0,
          });
        } else {
          orderAttackGround(units, ground.x, ground.z);
          this.markers.push({ x: ground.x, z: ground.z, kind: 'attack', age: 0 });
        }
        this.onCue('attack');
        return;
      case 'enter':
      case 'capture':
        if (structure) {
          const movers = units.filter((candidate) =>
            enterable(candidate, structure, this.local, world),
          );
          if (movers.length > 0) orderEnter(movers, structure);
          const rest = units.filter((candidate) => !movers.includes(candidate));
          if (rest.length > 0) orderMove(world, rest, structure.cx, structure.z + structure.h + 1);
          this.markers.push({ x: structure.cx, z: structure.cz, kind: 'move', age: 0 });
          this.onCue('move');
        }
        return;
      case 'harvest': {
        const cell = world.map.cellAt(ground.x, ground.z);
        const harvesters = units.filter((candidate) => candidate.def.harvester);
        orderHarvest(harvesters, cell);
        const others = units.filter((candidate) => !candidate.def.harvester);
        if (others.length > 0) orderMove(world, others, ground.x, ground.z);
        this.markers.push({ x: ground.x, z: ground.z, kind: 'move', age: 0 });
        this.onCue('move');
        return;
      }
      case 'move': {
        const attackMove = this.mode.kind === 'attackMove';
        orderMove(world, units, ground.x, ground.z, attackMove);
        this.markers.push({
          x: ground.x,
          z: ground.z,
          kind: attackMove ? 'attack' : 'move',
          age: 0,
        });
        if (attackMove) this.setMode({ kind: 'normal' });
        this.onCue('move');
        return;
      }
      case 'nogo':
        this.onCue('error');
        return;
      default:
        if (!target) {
          this.selection.clear();
          this.selectedStructure = 0;
        }
    }
  }

  private select(target: Entity, add: boolean): void {
    const now = performance.now();
    const double = now - this.lastClick.time < 350 && this.lastClick.id === target.id;
    this.lastClick = { time: now, id: target.id };
    if (target.entity === 'structure') {
      if (this.selectedStructure === target.id && this.mine(target) && producer(target)) {
        setPrimary(this.world, target);
      }
      this.selection.clear();
      this.selectedStructure = target.id;
      this.onCue('select');
      return;
    }
    if (!this.mine(target)) {
      this.selection.clear();
      this.selectedStructure = 0;
      return;
    }
    this.selectedStructure = 0;
    if (double) {
      this.selectVisible((unit) => unit.type === target.type);
      this.onCue('select');
      return;
    }
    if (add) {
      if (this.selection.has(target.id)) this.selection.delete(target.id);
      else this.selection.add(target.id);
    } else {
      this.selection.clear();
      this.selection.add(target.id);
    }
    this.onCue('select');
  }

  private selectVisible(filter: (unit: Unit) => boolean, everywhere = false): void {
    this.selection.clear();
    for (const unit of this.world.units) {
      if (unit.owner !== this.local || unit.inside || !filter(unit)) continue;
      if (!everywhere) {
        const p = this.view.project(unit.x, unit.alt, unit.z);
        if (p.x < 0 || p.y < 0 || p.x > this.view.width || p.y > this.view.height) continue;
      }
      this.selection.add(unit.id);
    }
  }

  private selectSameType(everywhere: boolean): void {
    const types = new Set(this.selectedUnits().map((unit) => unit.type));
    if (types.size === 0) return;
    this.selectVisible((unit) => types.has(unit.type), everywhere);
    this.onCue('select');
  }

  private finishBox(add: boolean): void {
    const box = this.box;
    if (!box) return;
    const x0 = Math.min(box.x0, box.x1);
    const x1 = Math.max(box.x0, box.x1);
    const y0 = Math.min(box.y0, box.y1);
    const y1 = Math.max(box.y0, box.y1);
    if (!add) this.selection.clear();
    this.selectedStructure = 0;
    const found: Unit[] = [];
    for (const unit of this.world.units) {
      if (unit.owner !== this.local || unit.inside) continue;
      const p = this.view.project(unit.x, unit.alt + 0.15, unit.z);
      if (p.x >= x0 && p.x <= x1 && p.y >= y0 && p.y <= y1) found.push(unit);
    }
    // Like the classics: a box with fighters in it skips the harvesters.
    const fighters = found.filter((unit) => !unit.def.harvester);
    for (const unit of fighters.length > 0 ? fighters : found) this.selection.add(unit.id);
    if (found.length > 0) this.onCue('select');
  }

  private recallGroup(group: number, add: boolean): void {
    const ids = (this.groups.get(group) ?? []).filter((id) => this.world.unit(id));
    this.groups.set(group, ids);
    if (ids.length === 0) return;
    const now = performance.now();
    if (!add && this.lastGroup.group === group && now - this.lastGroup.time < 400) {
      const first = this.world.unit(ids[0] ?? 0);
      if (first) this.view.focus.set(first.x, first.z);
    }
    this.lastGroup = { time: now, group };
    if (!add) this.selection.clear();
    this.selectedStructure = 0;
    for (const id of ids) this.selection.add(id);
    this.onCue('select');
  }

  /** Which control group a unit is in (the lowest), for the label next to it. */
  groupOf(id: number): number | null {
    for (const [group, ids] of this.groups) if (ids.includes(id)) return group;
    return null;
  }

  centreOnBase(): void {
    const hq =
      this.world.structures.find(
        (structure) => structure.owner === this.local && structure.def.role === 'hq',
      ) ?? this.world.structures.find((structure) => structure.owner === this.local);
    if (hq) {
      this.view.focus.set(hq.cx, hq.cz);
      return;
    }
    const truck = this.world.units.find((unit) => unit.owner === this.local);
    if (truck) this.view.focus.set(truck.x, truck.z);
  }

  private placeWallLine(): void {
    if (this.mode.kind !== 'place') return;
    const player = this.world.players[this.local];
    if (!player) return;
    const placed = placeWalls(this.world, player, this.mode.type, this.wallLine);
    if (placed > 0) this.setMode({ kind: 'normal' });
    else this.onCue('error');
    this.wallLine = [];
  }
}

function producer(structure: Structure): boolean {
  const role = structure.def.role;
  return role === 'barracks' || role === 'factory';
}

function garrisonable(structure: Structure, local: number): boolean {
  const capacity = structure.def.garrison ?? 0;
  return (
    capacity > 0 &&
    (structure.owner < 0 || structure.owner === local) &&
    structure.garrison.length < capacity
  );
}

function canAttack(unit: Unit, target: Entity): boolean {
  const weapons = unit.dugIn && unit.def.dugInWeapon ? [unit.def.dugInWeapon] : unit.def.weapons;
  const air = target.entity === 'unit' && target.flying;
  return weapons.some((id) => {
    const weapon = WEAPONS[id];
    return air ? weapon.air === true : weapon.ground !== false;
  });
}

function enterable(unit: Unit, structure: Structure, local: number, world: World): boolean {
  const own = structure.owner === local;
  if (unit.def.engineer) {
    if (own) return structure.hp < structure.maxHp;
    return (
      structure.def.capturable === true &&
      (structure.owner < 0 || world.isEnemy(local, structure.owner))
    );
  }
  if (unit.def.commando && !own && structure.owner >= 0) return true;
  if (unit.def.harvester) return own && structure.def.role === 'refinery';
  if (structure.def.walkable) return own && unit.def.kind === 'vehicle';
  if (unit.def.canGarrison) return garrisonable(structure, local);
  return false;
}

/** Cells along a straight horizontal or vertical line (whichever is longer). */
function lineCells(
  from: { x: number; z: number },
  to: { x: number; z: number },
): { x: number; z: number }[] {
  const cells: { x: number; z: number }[] = [];
  const dx = to.x - from.x;
  const dz = to.z - from.z;
  if (Math.abs(dx) >= Math.abs(dz)) {
    const step = Math.sign(dx) || 1;
    for (let x = from.x; x !== to.x + step; x += step) cells.push({ x, z: from.z });
  } else {
    const step = Math.sign(dz) || 1;
    for (let z = from.z; z !== to.z + step; z += step) cells.push({ x: from.x, z });
  }
  return cells.slice(0, 24);
}
