import * as THREE from 'three';

import { angleDiff, type Structure, type Unit } from '../sim/entities';
import { UNITS, WEAPONS, type UnitType, type WeaponId } from '../sim/rules';
import type { GameEvent, Vec3, World } from '../sim/world';
import { ModelBatches } from './batches';
import { Decals, Particles, Streaks, type Rgba } from './effects';
import { battlefieldEnvironment } from './environment';
import { crateGeometry, structureModel, unitModel, wallPiece, type PartName } from './models';
import { Shape, teamMaterial } from './shapes';
import { ShroudLayer, Terrain, WATER_LEVEL } from './terrain';

/** Camera elevation: how steeply we look down on the battlefield. */
const ELEVATION = (37 * Math.PI) / 180;
const SLOPE = Math.SQRT2 * Math.tan(ELEVATION);
const SHROUD_HEIGHT = 4.6;
/** Infantry are drawn a bit larger than life so they read at a distance. */
const INFANTRY_SCALE = 1.35;
export const MIN_ZOOM = 7;
export const MAX_ZOOM = 30;

interface Corpse {
  type: UnitType;
  owner: number;
  x: number;
  z: number;
  facing: number;
  age: number;
  how: string;
}

interface Timed {
  at: number;
  run: () => void;
}

const BULLET: Rgba = [1, 0.85, 0.5, 1];
const FIRE: Rgba = [1, 0.62, 0.2, 1];
const FIRE_END: Rgba = [0.5, 0.08, 0, 0];
const SMOKE: Rgba = [0.28, 0.27, 0.26, 0.55];
const SMOKE_END: Rgba = [0.4, 0.39, 0.37, 0];
const DUST: Rgba = [0.6, 0.53, 0.42, 0.4];
const DUST_END: Rgba = [0.6, 0.55, 0.45, 0];
const SPARK: Rgba = [1, 0.9, 0.6, 1];
const SPARK_END: Rgba = [1, 0.4, 0.1, 0];
const BEAM_COLOR = '#7fe8ff';
const WARP: Rgba = [0.5, 0.85, 1, 1];
const WARP_END: Rgba = [0.2, 0.3, 1, 0];

/** Draws the battle with three.js from a fixed isometric angle. */
export class GameView {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.OrthographicCamera();
  readonly world: World;
  readonly local: number;
  /** What the camera looks at, and how many cells tall the view is. */
  readonly focus = new THREE.Vector2();
  zoom = 14;
  width = 1;
  height = 1;
  private readonly terrain: Terrain;
  private readonly shroud: ShroudLayer;
  private readonly sun: THREE.DirectionalLight;
  private readonly units: ModelBatches;
  private readonly structures: ModelBatches;
  private readonly fire = new Particles(4000, true);
  private readonly smoke = new Particles(3000, false);
  private readonly streaks: Streaks;
  private readonly decals: Decals;
  private readonly missiles: ModelBatches;
  private readonly crates: ModelBatches;
  private readonly placement: THREE.InstancedMesh;
  private readonly corpses: Corpse[] = [];
  private readonly timed: Timed[] = [];
  private readonly colors = new Map<number, THREE.Color>();
  private readonly neutral = new THREE.Color('#d6d2c8');
  private readonly burnt = new THREE.Color('#2a2622');
  private time = 0;
  private readonly base = new THREE.Matrix4();
  private readonly link = new THREE.Matrix4();
  private readonly quaternion = new THREE.Quaternion();
  private readonly position = new THREE.Vector3();
  private readonly scale = new THREE.Vector3();
  private readonly euler = new THREE.Euler();
  private readonly raycaster = new THREE.Raycaster();

  constructor(canvas: HTMLCanvasElement, world: World, local: number) {
    this.world = world;
    this.local = local;
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      powerPreference: 'high-performance',
    });
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.toneMapping = THREE.NeutralToneMapping;
    this.renderer.toneMappingExposure = 1;
    this.scene.background = new THREE.Color('#0b0d10');
    this.scene.environment = battlefieldEnvironment(this.renderer);
    this.scene.environmentIntensity = 0.7;
    this.scene.add(new THREE.HemisphereLight('#d8e8ff', '#4a4232', 0.7));
    this.sun = new THREE.DirectionalLight('#fff0d8', 3.4);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    this.sun.shadow.bias = -0.0008;
    this.sun.shadow.normalBias = 0.02;
    this.scene.add(this.sun, this.sun.target);
    this.terrain = new Terrain(world.map);
    this.scene.add(this.terrain.group);
    const material = teamMaterial();
    this.units = new ModelBatches(this.scene, material);
    this.structures = new ModelBatches(this.scene, material);
    this.missiles = new ModelBatches(this.scene, material, false);
    this.crates = new ModelBatches(this.scene, material);
    this.scene.add(this.fire.points, this.smoke.points);
    this.streaks = new Streaks(this.scene);
    this.decals = new Decals(this.scene);
    const offset = SHROUD_HEIGHT / SLOPE;
    this.shroud = new ShroudLayer(world.map, SHROUD_HEIGHT, new THREE.Vector2(offset, offset));
    this.scene.add(this.shroud.mesh);
    const cell = new THREE.PlaneGeometry(0.94, 0.94);
    cell.rotateX(-Math.PI / 2);
    this.placement = new THREE.InstancedMesh(
      cell,
      new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.45, depthWrite: false }),
      64,
    );
    this.placement.count = 0;
    this.placement.frustumCulled = false;
    this.placement.renderOrder = 8;
    this.scene.add(this.placement);
    const me = world.players[local];
    if (me) this.focus.set(me.start.x + 0.5, me.start.z + 0.5);
  }

  resize(width: number, height: number, dpr: number): void {
    this.width = width;
    this.height = height;
    this.renderer.setPixelRatio(dpr);
    this.renderer.setSize(width, height, false);
  }

  /** Pixels per world unit on screen (vertically for the ground plane it's foreshortened). */
  get pixelsPerUnit(): number {
    return this.height / this.zoom;
  }

  teamColor(owner: number): THREE.Color {
    if (owner < 0) return this.neutral;
    let color = this.colors.get(owner);
    if (!color) {
      color = new THREE.Color(this.world.players[owner]?.color ?? '#ffffff');
      this.colors.set(owner, color);
    }
    return color;
  }

  private updateCamera(): void {
    const map = this.world.map;
    this.focus.x = Math.min(map.width + 2, Math.max(-2, this.focus.x));
    this.focus.y = Math.min(map.height + 2, Math.max(-2, this.focus.y));
    const aspect = this.width / Math.max(1, this.height);
    const half = this.zoom / 2;
    this.camera.left = -half * aspect;
    this.camera.right = half * aspect;
    this.camera.top = half;
    this.camera.bottom = -half;
    this.camera.near = 1;
    this.camera.far = 400;
    const distance = 120;
    const direction = new THREE.Vector3(1, SLOPE, 1).normalize();
    this.camera.position.set(
      this.focus.x + direction.x * distance,
      direction.y * distance,
      this.focus.y + direction.z * distance,
    );
    this.camera.lookAt(this.focus.x, 0, this.focus.y);
    this.camera.updateProjectionMatrix();
    this.camera.updateMatrixWorld();
    // Shadows cover what's on screen.
    const reach = this.zoom * aspect * 0.8 + 4;
    const shadow = this.sun.shadow.camera;
    shadow.left = -reach;
    shadow.right = reach;
    shadow.top = reach;
    shadow.bottom = -reach;
    shadow.near = 1;
    shadow.far = 120;
    shadow.updateProjectionMatrix();
    this.sun.position.set(this.focus.x - 18, 40, this.focus.y + 8);
    this.sun.target.position.set(this.focus.x, 0, this.focus.y);
    this.sun.target.updateMatrixWorld();
    const scale = (this.height / this.zoom) * this.renderer.getPixelRatio();
    this.fire.material.uniforms.scale = { value: scale };
    this.smoke.material.uniforms.scale = { value: scale };
  }

  /** Moves the camera by a screen-space amount in pixels. */
  pan(dx: number, dy: number): void {
    const perPixel = this.zoom / this.height;
    // Screen right is world (+x, -z); screen down is world (+x, +z) foreshortened.
    const right = dx * perPixel;
    const down = (dy * perPixel) / Math.sin(ELEVATION);
    this.focus.x += (right + down) / Math.SQRT2;
    this.focus.y += (-right + down) / Math.SQRT2;
  }

  zoomBy(factor: number): void {
    this.zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, this.zoom * factor));
  }

  /** The ground point under a screen position, at height `y`. */
  screenToWorld(sx: number, sy: number, y = 0): { x: number; z: number } {
    const ndc = new THREE.Vector2((sx / this.width) * 2 - 1, -(sy / this.height) * 2 + 1);
    this.raycaster.setFromCamera(ndc, this.camera);
    const ray = this.raycaster.ray;
    const t = (y - ray.origin.y) / ray.direction.y;
    return { x: ray.origin.x + ray.direction.x * t, z: ray.origin.z + ray.direction.z * t };
  }

  project(x: number, y: number, z: number): { x: number; y: number } {
    const v = new THREE.Vector3(x, y, z).project(this.camera);
    return { x: ((v.x + 1) / 2) * this.width, y: ((1 - v.y) / 2) * this.height };
  }

  /** Four ground corners of the view, for the radar. */
  viewCorners(): { x: number; z: number }[] {
    return [
      this.screenToWorld(0, 0),
      this.screenToWorld(this.width, 0),
      this.screenToWorld(this.width, this.height),
      this.screenToWorld(0, this.height),
    ];
  }

  visibleCell(x: number, z: number): boolean {
    const map = this.world.map;
    const cx = Math.floor(x);
    const cz = Math.floor(z);
    if (!map.inside(cx, cz)) return false;
    const me = this.world.players[this.local];
    return me?.shroud[map.index(cx, cz)] !== 0;
  }

  unitVisible(unit: Unit): boolean {
    if (unit.inside) return false;
    if (unit.owner === this.local) return true;
    if (unit.submerged && !this.detected(unit)) return false;
    return this.visibleCell(unit.x, unit.z);
  }

  /** Is this enemy submarine within sonar range of something of ours? */
  private detected(sub: Unit): boolean {
    for (const unit of this.world.units) {
      if (unit.owner !== this.local || unit.inside) continue;
      const sonar = unit.def.weapons.some((id) => WEAPONS[id].underwater === true);
      if (sonar && Math.hypot(unit.x - sub.x, unit.z - sub.z) < 6) return true;
    }
    return false;
  }

  /** How high a unit sits: ships on the water, submarines under it, hovercraft on either. */
  private baseHeight(unit: Unit, x: number, z: number): number {
    const def = unit.def;
    if (def.naval)
      return (
        WATER_LEVEL + (unit.submerged ? -0.3 : 0.02) + Math.sin(this.time * 1.6 + unit.id) * 0.015
      );
    if (def.amphibious) {
      const map = this.world.map;
      const onWater = map.isWater(map.cellAt(x, z));
      return (onWater ? WATER_LEVEL : 0) + 0.04 + Math.sin(this.time * 3 + unit.id) * 0.01;
    }
    return 0;
  }

  structureVisible(structure: Structure): boolean {
    if (structure.owner === this.local) return true;
    const me = this.world.players[this.local];
    if (!me) return true;
    const map = this.world.map;
    for (let z = structure.z; z < structure.z + structure.h; z++) {
      for (let x = structure.x; x < structure.x + structure.w; x++) {
        if (map.inside(x, z) && me.shroud[map.index(x, z)] !== 0) return true;
      }
    }
    return false;
  }

  /** The unit under a screen point, if any. */
  pickUnit(sx: number, sy: number): Unit | null {
    let best: Unit | null = null;
    let bestDistance = Infinity;
    const perUnit = this.pixelsPerUnit;
    for (const unit of this.world.units) {
      if (!this.unitVisible(unit)) continue;
      const height = unit.def.kind === 'infantry' ? 0.18 : 0.25;
      const p = this.project(unit.x, unit.alt + height, unit.z);
      const distance = Math.hypot(p.x - sx, p.y - sy);
      const radius = Math.max(9, unit.def.radius * perUnit * 1.1);
      if (distance < radius && distance < bestDistance) {
        bestDistance = distance;
        best = unit;
      }
    }
    return best;
  }

  /** The structure under a screen point, checking up its whole height. */
  pickStructure(sx: number, sy: number): Structure | null {
    for (let h = 2.4; h >= 0; h -= 0.2) {
      const point = this.screenToWorld(sx, sy, h);
      const structure = this.world.structureAt(point.x, point.z);
      if (structure && structure.def.height >= h - 0.1 && this.structureVisible(structure))
        return structure;
    }
    return null;
  }

  // Events -----------------------------------------------------------------------------------

  handle(event: GameEvent): void {
    switch (event.kind) {
      case 'shot':
        this.shot(event.weapon, event.from, event.to);
        break;
      case 'impact':
        this.impact(event.weapon, event.at);
        break;
      case 'explode':
        this.explosion(event.at, event.size);
        if (event.at.y < 0.5) this.scorch(event.at.x, event.at.z, 0.6 + event.size * 0.8);
        break;
      case 'fall':
        this.corpses.push({
          type: event.type,
          owner: event.owner,
          x: event.x,
          z: event.z,
          facing: event.facing,
          age: 0,
          how: event.how,
        });
        if (event.how === 'burn') {
          for (let i = 0; i < 10; i++) this.flame(event.x, 0.15, event.z, 0.4);
        }
        break;
      case 'placed': {
        const structure = this.world.structure(event.id);
        if (structure) this.dustCloud(structure.cx, structure.cz, structure.w, structure.h);
        break;
      }
      case 'destroyed':
        this.demolish(event.x, event.z, event.w, event.h);
        break;
      case 'removed':
        break;
      case 'warp':
        this.warpFlash(event.from);
        this.warpFlash(event.to);
        break;
      case 'storm':
        this.storm(event.x, event.z, event.radius, event.time);
        break;
      case 'bolt':
        this.bolt(event.x, event.z);
        break;
      case 'launch':
        this.launch(event.from, event.to, event.time);
        break;
      case 'shield':
        for (let i = 0; i < 60; i++) {
          const angle = (i / 60) * Math.PI * 2;
          this.fire.emit(
            event.x + Math.cos(angle) * event.radius,
            0.2,
            event.z + Math.sin(angle) * event.radius,
            0,
            1.2,
            0,
            0.9,
            0.3,
            0.05,
            [1, 0.25, 0.15, 1],
            [1, 0.1, 0, 0],
          );
        }
        break;
      case 'crate':
        for (let i = 0; i < 24; i++) {
          const angle = (i / 24) * Math.PI * 2;
          this.fire.emit(
            event.x,
            0.3,
            event.z,
            Math.cos(angle) * 1.5,
            1.5,
            Math.sin(angle) * 1.5,
            0.6,
            0.18,
            0.02,
            [1, 0.95, 0.5, 1],
            [1, 0.6, 0.1, 0],
            2,
          );
        }
        break;
      case 'promoted': {
        const unit = this.world.unit(event.id);
        if (unit) {
          for (let i = 0; i < 12; i++) {
            this.fire.emit(
              unit.x,
              unit.alt + 0.5,
              unit.z,
              (Math.random() - 0.5) * 0.8,
              1 + Math.random(),
              (Math.random() - 0.5) * 0.8,
              0.8,
              0.14,
              0.02,
              [1, 0.9, 0.3, 1],
              [1, 0.7, 0.1, 0],
            );
          }
        }
        break;
      }
      default:
        break;
    }
  }

  private shot(id: WeaponId, from: Vec3, to: Vec3): void {
    const weapon = WEAPONS[id];
    switch (weapon.projectile) {
      case 'instant': {
        const flak = weapon.warhead === 'flak';
        this.fire.emit(
          from.x,
          from.y,
          from.z,
          0,
          0,
          0,
          0.06,
          flak ? 0.3 : 0.18,
          0.05,
          BULLET,
          SPARK_END,
        );
        if (flak) {
          for (let i = 0; i < 5; i++) {
            this.smoke.emit(
              to.x + rand(0.4),
              to.y + rand(0.3),
              to.z + rand(0.4),
              0,
              0.2,
              0,
              0.9,
              0.3,
              0.6,
              [0.15, 0.14, 0.13, 0.7],
              [0.3, 0.3, 0.3, 0],
            );
          }
          this.fire.emit(to.x, to.y, to.z, 0, 0, 0, 0.12, 0.5, 0.1, [1, 0.8, 0.4, 1], SPARK_END);
        } else {
          this.streaks.add(from, to, 0.02, '#ffe2a0', 0.05);
          this.sparks(to, 3, 0.5);
        }
        break;
      }
      case 'beam': {
        this.streaks.add(from, to, 0.11, BEAM_COLOR, 0.28);
        this.streaks.add(from, to, 0.035, '#ffffff', 0.2);
        this.fire.emit(
          to.x,
          to.y,
          to.z,
          0,
          0,
          0,
          0.25,
          0.7,
          0.1,
          [0.6, 0.95, 1, 1],
          [0.2, 0.4, 1, 0],
        );
        this.sparks(to, 6, 1.2);
        break;
      }
      case 'flame': {
        const dx = to.x - from.x;
        const dy = to.y - from.y;
        const dz = to.z - from.z;
        for (let i = 0; i < 14; i++) {
          const speed = 3 + Math.random() * 2;
          const length = Math.hypot(dx, dy, dz) || 1;
          const life = length / speed;
          this.fire.emit(
            from.x,
            from.y,
            from.z,
            (dx / length) * speed + rand(0.4),
            (dy / length) * speed + rand(0.3),
            (dz / length) * speed + rand(0.4),
            life * (0.8 + Math.random() * 0.4),
            0.12,
            0.45,
            FIRE,
            FIRE_END,
          );
        }
        break;
      }
      case 'melee':
        break;
      default: {
        const big = weapon.damage >= 90;
        this.fire.emit(
          from.x,
          from.y,
          from.z,
          0,
          0,
          0,
          0.08,
          big ? 0.55 : 0.35,
          0.1,
          BULLET,
          SPARK_END,
        );
        for (let i = 0; i < (big ? 4 : 2); i++) {
          this.smoke.emit(
            from.x,
            from.y,
            from.z,
            rand(0.3),
            0.3,
            rand(0.3),
            0.8,
            0.2,
            0.5,
            SMOKE,
            SMOKE_END,
          );
        }
      }
    }
  }

  private impact(id: WeaponId, at: Vec3): void {
    const weapon = WEAPONS[id];
    const size =
      weapon.projectile === 'bomb'
        ? 1.3
        : weapon.projectile === 'artillery'
          ? 1.1
          : weapon.projectile === 'missile'
            ? 0.45
            : 0.35;
    this.explosion(at, size);
    if (at.y < 0.5) {
      // Bombs and artillery always crater the ground; tank shells now and then.
      if (size >= 1) this.crater(at.x, at.z, size * 1.2);
      else if (weapon.projectile === 'shell' && Math.random() < 0.3)
        this.crater(at.x + rand(0.3), at.z + rand(0.3), 0.55 + Math.random() * 0.2);
    }
  }

  /** Dark clouds churning over the storm's area while it lasts. */
  private storm(x: number, z: number, radius: number, duration: number): void {
    const end = this.time + duration;
    const puff = () => {
      if (this.time > end) return;
      for (let i = 0; i < 6; i++) {
        const angle = Math.random() * Math.PI * 2;
        const distance = Math.sqrt(Math.random()) * radius;
        this.smoke.emit(
          x + Math.cos(angle) * distance,
          3.4 + Math.random() * 0.5,
          z + Math.sin(angle) * distance,
          rand(0.4),
          0,
          rand(0.4),
          1.6,
          1.6,
          2.6,
          [0.12, 0.13, 0.17, 0.75],
          [0.2, 0.2, 0.25, 0],
        );
      }
      this.timed.push({ at: this.time + 0.12, run: puff });
    };
    puff();
  }

  private bolt(x: number, z: number): void {
    let px = x + rand(0.6);
    let pz = z + rand(0.6);
    let py = 3.6;
    // A jagged path down from the clouds.
    while (py > 0.1) {
      const ny = Math.max(0, py - 0.5 - Math.random() * 0.4);
      const nx = ny === 0 ? x : px + rand(0.35);
      const nz = ny === 0 ? z : pz + rand(0.35);
      this.streaks.add({ x: px, y: py, z: pz }, { x: nx, y: ny, z: nz }, 0.07, '#c9e4ff', 0.18);
      this.streaks.add({ x: px, y: py, z: pz }, { x: nx, y: ny, z: nz }, 0.02, '#ffffff', 0.12);
      px = nx;
      py = ny;
      pz = nz;
    }
    this.fire.emit(x, 0.3, z, 0, 0, 0, 0.2, 2.4, 0.4, [0.8, 0.9, 1, 1], [0.3, 0.4, 1, 0]);
    this.sparks({ x, y: 0.1, z }, 10, 3);
    this.crater(x, z, 0.9);
  }

  /** The missile climbs out of its silo, then drops on the target just before it lands. */
  private launch(
    from: { x: number; z: number },
    to: { x: number; z: number },
    flight: number,
  ): void {
    const start = this.time;
    const climb = () => {
      const t = this.time - start;
      if (t > 1.6) return;
      const y = 0.5 + t * t * 4;
      this.fire.emit(from.x, y, from.z, rand(0.2), -1, rand(0.2), 0.3, 0.5, 0.1, FIRE, FIRE_END);
      this.smoke.emit(
        from.x + rand(0.3),
        y - 0.3,
        from.z + rand(0.3),
        rand(0.3),
        0.2,
        rand(0.3),
        2.5,
        0.6,
        1.6,
        [0.8, 0.78, 0.74, 0.6],
        [0.8, 0.8, 0.8, 0],
      );
      this.timed.push({ at: this.time + 0.03, run: climb });
    };
    climb();
    const fall = () => {
      const left = start + flight - this.time;
      if (left <= 0) return;
      const y = Math.max(0.2, left * 6);
      this.fire.emit(to.x, y, to.z, 0, 0, 0, 0.08, 0.5, 0.2, [1, 0.9, 0.6, 1], FIRE_END);
      this.smoke.emit(
        to.x + rand(0.1),
        y + 0.4,
        to.z + rand(0.1),
        0,
        0.3,
        0,
        1.2,
        0.3,
        0.8,
        [0.8, 0.78, 0.74, 0.5],
        [0.8, 0.8, 0.8, 0],
      );
      this.timed.push({ at: this.time + 0.03, run: fall });
    };
    this.timed.push({ at: start + flight - 1, run: fall });
  }

  explosion(at: Vec3, size: number): void {
    if (size >= 3) this.mushroom(at, size);
    const count = Math.round(8 + size * 16);
    for (let i = 0; i < count; i++) {
      const speed = size * (1 + Math.random() * 2);
      const angle = Math.random() * Math.PI * 2;
      const up = Math.random() * 1.5 * size;
      this.fire.emit(
        at.x,
        at.y + 0.1,
        at.z,
        Math.cos(angle) * speed * 0.6,
        up,
        Math.sin(angle) * speed * 0.6,
        0.3 + Math.random() * 0.3,
        size * 0.9,
        size * 0.3,
        FIRE,
        FIRE_END,
      );
    }
    this.fire.emit(
      at.x,
      at.y + 0.2,
      at.z,
      0,
      0,
      0,
      0.15,
      size * 2.4,
      size * 1.2,
      [1, 0.95, 0.8, 1],
      [1, 0.5, 0.2, 0],
    );
    for (let i = 0; i < count * 0.6; i++) {
      this.smoke.emit(
        at.x + rand(size * 0.5),
        at.y + 0.2,
        at.z + rand(size * 0.5),
        rand(0.5),
        0.5 + Math.random() * 0.8,
        rand(0.5),
        1.2 + Math.random() * 1.2,
        size * 0.6,
        size * 1.6,
        SMOKE,
        SMOKE_END,
      );
    }
    this.sparks(at, Math.round(4 + size * 8), 2.5 * size + 1);
  }

  /** A superweapon-sized blast: a flash, a shock ring and a rising column of smoke. */
  private mushroom(at: Vec3, size: number): void {
    this.fire.emit(
      at.x,
      1,
      at.z,
      0,
      0,
      0,
      0.5,
      size * 5,
      size * 2,
      [1, 1, 0.9, 1],
      [1, 0.5, 0.1, 0],
    );
    for (let i = 0; i < 80; i++) {
      const angle = (i / 80) * Math.PI * 2;
      this.fire.emit(
        at.x,
        0.2,
        at.z,
        Math.cos(angle) * size * 2.2,
        0.2,
        Math.sin(angle) * size * 2.2,
        0.7,
        0.8,
        0.3,
        FIRE,
        FIRE_END,
      );
      this.smoke.emit(
        at.x,
        0.3,
        at.z,
        Math.cos(angle) * size * 1.4,
        0.3,
        Math.sin(angle) * size * 1.4,
        1.8,
        0.8,
        2,
        [0.35, 0.3, 0.26, 0.6],
        SMOKE_END,
      );
    }
    const end = this.time + 3.5;
    const column = () => {
      if (this.time > end) return;
      const rise = 1 - (end - this.time) / 3.5;
      for (let i = 0; i < 4; i++) {
        this.smoke.emit(
          at.x + rand(0.5),
          0.5 + rise * 3,
          at.z + rand(0.5),
          rand(0.6),
          1.2,
          rand(0.6),
          2.5,
          1.2,
          3 + rise * 2,
          [0.3, 0.26, 0.22, 0.7],
          [0.4, 0.38, 0.36, 0],
        );
        this.fire.emit(
          at.x + rand(0.4),
          0.3 + rise * 2.5,
          at.z + rand(0.4),
          0,
          1,
          0,
          0.6,
          1,
          0.4,
          FIRE,
          FIRE_END,
        );
      }
      this.timed.push({ at: this.time + 0.06, run: column });
    };
    column();
  }

  /** A burn mark, on dry land only. */
  /** Heavy shells leave craters; everything else scorches. */
  private crater(x: number, z: number, size: number): void {
    const map = this.world.map;
    const cell = map.cellAt(x, z);
    if (map.isWater(cell) || this.world.structureAt(x, z)) return;
    this.decals.addCrater(x, z, size);
  }

  private scorch(x: number, z: number, size: number): void {
    const map = this.world.map;
    if (!map.isWater(map.cellAt(x, z))) this.decals.addScorch(x, z, size);
  }

  private sparks(at: Vec3, count: number, speed: number): void {
    for (let i = 0; i < count; i++) {
      this.fire.emit(
        at.x,
        at.y,
        at.z,
        rand(speed),
        Math.random() * speed,
        rand(speed),
        0.25 + Math.random() * 0.2,
        0.07,
        0.02,
        SPARK,
        SPARK_END,
        6,
      );
    }
  }

  private flame(x: number, y: number, z: number, size: number): void {
    this.fire.emit(
      x + rand(size),
      y,
      z + rand(size),
      rand(0.2),
      0.6 + Math.random() * 0.6,
      rand(0.2),
      0.4 + Math.random() * 0.4,
      size * 0.9,
      size * 0.2,
      FIRE,
      FIRE_END,
    );
  }

  private dustCloud(cx: number, cz: number, w: number, h: number): void {
    for (let i = 0; i < 10 + w * h * 3; i++) {
      this.smoke.emit(
        cx + rand(w / 2),
        0.1,
        cz + rand(h / 2),
        rand(0.6),
        0.3,
        rand(0.6),
        1 + Math.random(),
        0.5,
        1.2,
        DUST,
        DUST_END,
      );
    }
  }

  private demolish(x: number, z: number, w: number, h: number): void {
    const blasts = 2 + w * h;
    for (let i = 0; i < blasts; i++) {
      const at = {
        x: x + Math.random() * w,
        y: 0.3 + Math.random() * 0.6,
        z: z + Math.random() * h,
      };
      this.timed.push({
        at: this.time + i * 0.18,
        run: () => {
          this.explosion(at, 0.7 + Math.random() * 0.5);
        },
      });
    }
    this.timed.push({
      at: this.time + blasts * 0.18,
      run: () => {
        this.decals.addRubble(x, z, w, h);
        this.dustCloud(x + w / 2, z + h / 2, w, h);
      },
    });
  }

  private warpFlash(at: Vec3): void {
    for (let i = 0; i < 30; i++) {
      const angle = (i / 30) * Math.PI * 2;
      this.fire.emit(
        at.x,
        at.y + Math.random() * 0.6,
        at.z,
        Math.cos(angle) * 1.2,
        rand(0.5),
        Math.sin(angle) * 1.2,
        0.5,
        0.2,
        0.05,
        WARP,
        WARP_END,
      );
    }
    this.fire.emit(at.x, at.y + 0.3, at.z, 0, 0, 0, 0.3, 1.8, 0.2, [0.7, 0.9, 1, 1], WARP_END);
  }

  // Drawing ----------------------------------------------------------------------------------

  /** Draws a frame. `alpha` blends between the last two simulation steps. */
  render(
    alpha: number,
    dt: number,
    placement: { cells: { x: number; z: number; ok: boolean }[] } | null,
  ): void {
    this.time += dt;
    for (let i = this.timed.length - 1; i >= 0; i--) {
      const item = this.timed[i];
      if (item && item.at <= this.time) {
        this.timed.splice(i, 1);
        item.run();
      }
    }
    this.updateCamera();
    this.terrain.update();
    const me = this.world.players[this.local];
    if (me) this.shroud.update(me.shroud, me.shroudVersion);
    this.drawStructures(dt);
    this.drawUnits(alpha, dt);
    this.drawProjectiles(alpha);
    this.drawCrates();
    this.drawPlacement(placement);
    this.fire.update(dt);
    this.smoke.update(dt);
    this.streaks.update(dt);
    this.renderer.render(this.scene, this.camera);
  }

  private drawStructures(dt: number): void {
    const batches = this.structures;
    batches.begin();
    const time = this.time;
    for (const structure of this.world.structures) {
      if (!this.structureVisible(structure)) continue;
      const rise = structure.selling > 0 ? 1 - structure.selling : structure.built;
      const eased = Math.max(0.03, 1 - (1 - rise) ** 3);
      this.base.makeScale(1, eased, 1).setPosition(structure.cx, 0, structure.cz);
      const player = this.world.players[structure.owner];
      const powered = !structure.def.needsPower || !player?.lowPower;
      if (structure.def.role === 'wall') {
        this.drawWall(structure);
        this.structureEffects(structure, dt);
        continue;
      }
      const turret = structure.turret;
      const recoil = structure.sinceFired < 0.15 ? (0.15 - structure.sinceFired) * 0.3 : 0;
      batches.draw(
        structure.type,
        () => structureModel(structure.type),
        this.base,
        this.teamColor(structure.owner),
        (part, _pivot, out) => {
          if (part === 'turret')
            out.makeRotationY(-turret).multiply(scratch.makeTranslation(-recoil, 0, 0));
          else if (part === 'spin') out.makeRotationY(powered ? time * 1.4 : 0);
          else if (part === 'rock')
            out.makeRotationZ(structure.owner >= 0 ? Math.sin(time * 2.2) * 0.35 : 0);
        },
      );
      this.structureEffects(structure, dt);
    }
    batches.end();
  }

  /** A wall post, joined to the next wall along +x and +z when there is one. */
  private drawWall(structure: Structure): void {
    const color = this.teamColor(structure.owner);
    const type = structure.type;
    this.structures.draw(`${type}:post`, () => wallPiece(type, 'post'), this.base, color);
    for (const [dx, dz, angle] of [
      [1, 0, 0],
      [0, 1, -Math.PI / 2],
    ] as const) {
      const next = this.world.structureAt(structure.x + dx, structure.z + dz);
      if (next?.def.role !== 'wall' || next.owner !== structure.owner) continue;
      if (!this.structureVisible(next)) continue;
      const rise = Math.min(structure.built, next.built);
      this.link
        .makeRotationY(angle)
        .premultiply(scratch.makeScale(1, Math.max(0.03, rise), 1))
        .setPosition(structure.cx, 0, structure.cz);
      this.structures.draw(`${type}:link`, () => wallPiece(type, 'link'), this.link, color);
    }
  }

  private structureEffects(structure: Structure, dt: number): void {
    if (structure.shieldUntil > this.world.time && Math.random() < dt * 20) {
      this.fire.emit(
        structure.x + Math.random() * structure.w,
        0.2 + Math.random() * structure.def.height,
        structure.z + Math.random() * structure.h,
        0,
        0.5,
        0,
        0.6,
        0.25,
        0.05,
        [1, 0.2, 0.1, 1],
        [1, 0.1, 0, 0],
      );
    }
    if (structure.def.superweapon && structure.superCharge >= 1 && Math.random() < dt * 6) {
      this.fire.emit(
        structure.cx + rand(0.4),
        structure.def.height + 0.2,
        structure.cz + rand(0.4),
        0,
        0.6,
        0,
        0.8,
        0.25,
        0.05,
        [0.6, 0.9, 1, 1],
        [0.3, 0.4, 1, 0],
      );
    }
    if (structure.built < 1) {
      if (Math.random() < dt * 12)
        this.smoke.emit(
          structure.x + Math.random() * structure.w,
          0.1,
          structure.z + Math.random() * structure.h,
          0,
          0.4,
          0,
          0.8,
          0.3,
          0.7,
          DUST,
          DUST_END,
        );
      return;
    }
    const health = structure.hp / structure.maxHp;
    const top = structure.def.height;
    if (health < 0.5 && Math.random() < dt * (health < 0.25 ? 10 : 4)) {
      const x = structure.x + 0.2 + Math.random() * (structure.w - 0.4);
      const z = structure.z + 0.2 + Math.random() * (structure.h - 0.4);
      this.smoke.emit(
        x,
        top * 0.8,
        z,
        rand(0.2),
        0.7,
        rand(0.2),
        2 + Math.random(),
        0.3,
        1.1,
        [0.15, 0.14, 0.13, 0.6],
        SMOKE_END,
      );
      if (health < 0.25) this.flame(x, top * 0.7, z, 0.35);
    }
    if (structure.type === 'b_reactor' && Math.random() < dt * 5) {
      this.smoke.emit(
        structure.cx - 0.25,
        1.4,
        structure.cz - 0.25,
        rand(0.1),
        0.6,
        rand(0.1),
        2.5,
        0.4,
        1.2,
        [0.9, 0.9, 0.9, 0.35],
        [1, 1, 1, 0],
      );
    }
    if (structure.charge > 0 && Math.random() < dt * 8) {
      this.fire.emit(
        structure.cx,
        0.3,
        structure.z + structure.h,
        0,
        0.3,
        0,
        0.2,
        0.15,
        0.05,
        [1, 0.2, 0.1, 1],
        [1, 0.1, 0, 0],
      );
    }
  }

  private drawUnits(alpha: number, dt: number): void {
    const batches = this.units;
    batches.begin();
    const time = this.time;
    for (const unit of this.world.units) {
      if (!this.unitVisible(unit)) continue;
      const x = unit.px + (unit.x - unit.px) * alpha;
      const z = unit.pz + (unit.z - unit.pz) * alpha;
      const alt = unit.palt + (unit.alt - unit.palt) * alpha;
      const facing = unit.pfacing + angleDiff(unit.pfacing, unit.facing) * alpha;
      const turret = unit.pturret + angleDiff(unit.pturret, unit.turret) * alpha;
      const def = unit.def;
      let bob = this.baseHeight(unit, x, z);
      if (def.flies === 'jumpjet' || def.flies === 'airship')
        bob = Math.sin(time * 2 + unit.id) * 0.05;
      this.euler.set(0, -facing, 0);
      if (def.flies === 'jet' && unit.flight !== 'landed') {
        const turn = angleDiff(unit.pfacing, unit.facing);
        this.euler.set(Math.max(-0.7, Math.min(0.7, -turn * 8)), -facing, 0, 'YXZ');
      }
      this.quaternion.setFromEuler(this.euler);
      this.position.set(x, alt + bob, z);
      const size = def.kind === 'infantry' ? INFANTRY_SCALE : 1;
      this.scale.set(size, size, size);
      this.base.compose(this.position, this.quaternion, this.scale);
      const swing = unit.moving ? Math.sin(time * 13 + unit.id) * 0.55 : 0;
      const relative = turret - facing;
      const recoil = unit.sinceFired < 0.12 ? (0.12 - unit.sinceFired) * 0.35 : 0;
      batches.draw(
        unit.type,
        () => unitModel(unit.type),
        this.base,
        this.teamColor(unit.owner),
        (part, _pivot, out) => {
          if (part === 'turret')
            out.makeRotationY(-relative).multiply(scratch.makeTranslation(-recoil, 0, 0));
          else if (part === 'legL') out.makeRotationZ(swing);
          else if (part === 'legR') out.makeRotationZ(-swing);
          else if (part === 'spin') out.makeRotationX(time * 9);
        },
      );
      if (unit.dugIn) {
        this.base.makeTranslation(x, 0, z);
        batches.draw('sandbags', sandbags, this.base, this.neutral);
      }
      this.unitEffects(unit, x, z, alt, dt);
    }
    this.drawCorpses(dt);
    batches.end();
  }

  private unitEffects(unit: Unit, x: number, z: number, alt: number, dt: number): void {
    const def = unit.def;
    if (unit.shieldUntil > this.world.time && Math.random() < dt * 14) {
      this.fire.emit(
        x + rand(0.3),
        alt + 0.1 + Math.random() * 0.4,
        z + rand(0.3),
        0,
        0.4,
        0,
        0.5,
        0.18,
        0.04,
        [1, 0.2, 0.1, 1],
        [1, 0.1, 0, 0],
      );
    }
    if (def.naval && unit.moving && !unit.submerged && Math.random() < dt * 12) {
      this.smoke.emit(
        x - Math.cos(unit.facing) * def.radius,
        WATER_LEVEL + 0.03,
        z - Math.sin(unit.facing) * def.radius,
        rand(0.2),
        0.05,
        rand(0.2),
        1.2,
        0.15,
        0.5,
        [0.95, 0.97, 1, 0.7],
        [1, 1, 1, 0],
      );
    }
    if (unit.step === 'mining' && unit.order.kind === 'harvest' && Math.random() < dt * 10) {
      this.smoke.emit(
        x + Math.cos(unit.facing) * 0.4,
        0.1,
        z + Math.sin(unit.facing) * 0.4,
        rand(0.4),
        0.4,
        rand(0.4),
        0.8,
        0.2,
        0.5,
        DUST,
        DUST_END,
      );
    }
    if (def.harvester?.warp && unit.warpTimer > 0 && Math.random() < dt * 30) {
      this.fire.emit(
        x + rand(0.4),
        0.2 + Math.random() * 0.5,
        z + rand(0.4),
        0,
        0.5,
        0,
        0.3,
        0.1,
        0.02,
        WARP,
        WARP_END,
      );
    }
    if (def.kind === 'vehicle' && unit.hp < unit.maxHp * 0.35 && Math.random() < dt * 5) {
      this.smoke.emit(
        x,
        0.4,
        z,
        rand(0.1),
        0.5,
        rand(0.1),
        1.4,
        0.15,
        0.6,
        [0.1, 0.1, 0.1, 0.55],
        SMOKE_END,
      );
    }
    if (def.flies === 'jumpjet' && Math.random() < dt * 20) {
      this.fire.emit(
        x - Math.cos(unit.facing) * 0.07,
        alt + 0.1,
        z - Math.sin(unit.facing) * 0.07,
        0,
        -1.5,
        0,
        0.15,
        0.1,
        0.02,
        FIRE,
        FIRE_END,
      );
    }
    if (def.flies === 'jet' && unit.flight !== 'landed' && Math.random() < dt * 25) {
      this.fire.emit(
        x - Math.cos(unit.facing) * 0.4,
        alt,
        z - Math.sin(unit.facing) * 0.4,
        0,
        0,
        0,
        0.12,
        0.14,
        0.04,
        [0.8, 0.9, 1, 0.9],
        [0.4, 0.5, 1, 0],
      );
    }
  }

  private drawCorpses(dt: number): void {
    for (let i = this.corpses.length - 1; i >= 0; i--) {
      const corpse = this.corpses[i];
      if (!corpse) continue;
      corpse.age += dt;
      if (corpse.age > 4) {
        this.corpses.splice(i, 1);
        continue;
      }
      if (!this.visibleCell(corpse.x, corpse.z)) continue;
      const fall = Math.min(1, corpse.age * 4);
      const sink = corpse.age > 2.5 ? (corpse.age - 2.5) * 0.25 : 0;
      const flat = corpse.how === 'crush' ? 0.25 : 1;
      this.euler.set(fall * (Math.PI / 2) * 0.95, -corpse.facing, 0, 'YXZ');
      this.quaternion.setFromEuler(this.euler);
      this.position.set(corpse.x, -sink + 0.02, corpse.z);
      const size = corpse.type === 'hound' || isInfantry(corpse.type) ? INFANTRY_SCALE : 1;
      this.scale.set(size, flat * size, size);
      this.base.compose(this.position, this.quaternion, this.scale);
      const color = corpse.how === 'burn' ? this.burnt : this.teamColor(corpse.owner);
      this.units.draw(corpse.type, () => unitModel(corpse.type), this.base, color);
    }
  }

  private drawProjectiles(alpha: number): void {
    const batches = this.missiles;
    batches.begin();
    for (const shot of this.world.projectiles) {
      const x = shot.px + (shot.x - shot.px) * alpha;
      const y = shot.py + (shot.y - shot.py) * alpha;
      const z = shot.pz + (shot.z - shot.pz) * alpha;
      if (!this.visibleCell(x, z)) continue;
      if (shot.kind === 'shell') {
        this.fire.emit(x, y, z, 0, 0, 0, 0.04, 0.16, 0.08, [1, 0.9, 0.6, 1], [1, 0.5, 0.2, 0]);
        continue;
      }
      if (shot.kind === 'torpedo') {
        this.smoke.emit(
          x,
          WATER_LEVEL + 0.02,
          z,
          0,
          0.05,
          0,
          0.9,
          0.12,
          0.35,
          [0.92, 0.96, 1, 0.8],
          [1, 1, 1, 0],
        );
        continue;
      }
      const dx = shot.x - shot.px;
      const dy = shot.y - shot.py;
      const dz = shot.z - shot.pz;
      const length = Math.hypot(dx, dy, dz);
      if (length > 1e-5) {
        this.position.set(dx / length, dy / length, dz / length);
        this.quaternion.setFromUnitVectors(xAxis, this.position);
      }
      this.position.set(x, y, z);
      this.scale.set(1, 1, 1);
      this.base.compose(this.position, this.quaternion, this.scale);
      const key = shot.kind === 'bomb' ? 'bomb' : shot.kind === 'artillery' ? 'rocket' : 'missile';
      batches.draw(key, projectileModel(key), this.base, this.neutral);
      if (shot.kind === 'artillery' || shot.kind === 'missile') {
        const big = shot.kind === 'artillery';
        this.smoke.emit(
          x,
          y,
          z,
          rand(0.1),
          0.1,
          rand(0.1),
          big ? 1.6 : 0.8,
          big ? 0.2 : 0.1,
          big ? 0.7 : 0.35,
          [0.75, 0.73, 0.7, 0.6],
          [0.8, 0.8, 0.8, 0],
        );
        this.fire.emit(x, y, z, 0, 0, 0, 0.06, big ? 0.3 : 0.15, 0.05, FIRE, FIRE_END);
      }
    }
    batches.end();
  }

  private drawCrates(): void {
    this.crates.begin();
    for (const crate of this.world.crates) {
      if (!this.visibleCell(crate.x, crate.z)) continue;
      this.base
        .makeRotationY(this.time * 0.8)
        .setPosition(crate.x, 0.05 + Math.sin(this.time * 3) * 0.04, crate.z);
      this.crates.draw('crate', crateModel, this.base, this.neutral);
    }
    this.crates.end();
  }

  private drawPlacement(
    placement: { cells: { x: number; z: number; ok: boolean }[] } | null,
  ): void {
    const cells = placement?.cells ?? [];
    const matrix = new THREE.Matrix4();
    const good = new THREE.Color('#4cff6a');
    const bad = new THREE.Color('#ff4040');
    let n = 0;
    for (const cell of cells) {
      if (n >= 64) break;
      matrix.makeTranslation(cell.x + 0.5, 0.04, cell.z + 0.5);
      this.placement.setMatrixAt(n, matrix);
      this.placement.setColorAt(n, cell.ok ? good : bad);
      n++;
    }
    this.placement.count = n;
    this.placement.instanceMatrix.needsUpdate = true;
    if (this.placement.instanceColor) this.placement.instanceColor.needsUpdate = true;
  }

  dispose(): void {
    this.renderer.dispose();
  }
}

const scratch = new THREE.Matrix4();
const xAxis = new THREE.Vector3(1, 0, 0);

function isInfantry(type: UnitType): boolean {
  return UNITS[type].kind === 'infantry';
}

function rand(spread: number): number {
  return (Math.random() - 0.5) * 2 * spread;
}

function sandbags() {
  const shape = new Shape();
  for (let i = 0; i < 6; i++) {
    const angle = (i / 6) * Math.PI * 2;
    shape.box(0.14, 0.08, 0.08, Math.cos(angle) * 0.17, 0.04, Math.sin(angle) * 0.17, '#b8a57a', {
      ry: -angle + Math.PI / 2,
    });
  }
  return {
    parts: [
      {
        name: 'hull' as PartName,
        geometry: shape.build(),
        pivot: [0, 0, 0] as [number, number, number],
      },
    ],
  };
}

function projectileModel(key: 'bomb' | 'rocket' | 'missile') {
  return () => {
    const shape = new Shape();
    if (key === 'bomb') shape.sphere(0.08, 0, 0, 0, '#2a2a2a', { sx: 1.6 });
    else if (key === 'rocket')
      shape
        .tube(0.05, 0.5, 0, 0, 0, '#c9c3b0', { sides: 6 })
        .cone(0.05, 0.12, 0.3, 0, 0, '#b0413e', { rz: -Math.PI / 2, sides: 6 });
    else shape.tube(0.018, 0.16, 0, 0, 0, '#d8d8d8', { sides: 5 });
    return {
      parts: [
        {
          name: 'hull' as PartName,
          geometry: shape.build(),
          pivot: [0, 0, 0] as [number, number, number],
        },
      ],
    };
  };
}

function crateModel() {
  return {
    parts: [
      {
        name: 'hull' as PartName,
        geometry: crateGeometry(),
        pivot: [0, 0, 0] as [number, number, number],
      },
    ],
  };
}
