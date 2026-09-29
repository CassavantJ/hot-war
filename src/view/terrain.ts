import * as THREE from 'three';

import { GROUND, type GameMap, type Theme } from '../sim/map';
import { hash2 } from '../sim/random';
import { MAX_ORE } from '../sim/rules';
import { Batch } from './batches';
import { drillGeometry, oreGeometry, treeGeometries } from './models';
import { Shape, teamMaterial } from './shapes';
import { detailTexture, groundTexture, waterNormalTexture } from './textures';

type Palette = Record<number, string>;

const PALETTES: Record<Theme, Palette & { outside: string; bed: string; water: string }> = {
  temperate: {
    [GROUND.clear]: '#6e9a48',
    [GROUND.rough]: '#86904f',
    [GROUND.road]: '#8a8474',
    [GROUND.sand]: '#cdbb88',
    [GROUND.water]: '#3e6a58',
    [GROUND.cliff]: '#7d7264',
    [GROUND.pavement]: '#a09d94',
    outside: '#141a14',
    bed: '#35584a',
    water: '#2f6f9f',
  },
  snow: {
    [GROUND.clear]: '#e2eaef',
    [GROUND.rough]: '#cad7df',
    [GROUND.road]: '#8f959b',
    [GROUND.sand]: '#b9c3c9',
    [GROUND.water]: '#6a8a9a',
    [GROUND.cliff]: '#727a84',
    [GROUND.pavement]: '#a4aab0',
    outside: '#161a1e',
    bed: '#51707e',
    water: '#4a86ad',
  },
  desert: {
    [GROUND.clear]: '#d8b97c',
    [GROUND.rough]: '#c7a264',
    [GROUND.road]: '#8f8068',
    [GROUND.sand]: '#e6cf98',
    [GROUND.water]: '#6a8a7a',
    [GROUND.cliff]: '#a6724a',
    [GROUND.pavement]: '#aba290',
    outside: '#1c160f',
    bed: '#4f7a6a',
    water: '#2f7d9a',
  },
};

const CLIFF_HEIGHT = 1.1;
const WATER_DEPTH = 0.4;
export const WATER_LEVEL = -0.1;

/** The ground, water, cliffs, trees and ore. */
export class Terrain {
  readonly group = new THREE.Group();
  private readonly map: GameMap;
  private readonly oreBatches: [Batch, Batch];
  private oreVersion = -1;
  private readonly oreMatrix = new THREE.Matrix4();
  /** The water's ripples, drifting. */
  private readonly ripples = waterNormalTexture();

  constructor(map: GameMap) {
    this.map = map;
    const palette = PALETTES[map.theme];
    this.group.add(this.buildGround());
    this.group.add(this.buildWater(palette.water));
    this.group.add(this.buildOutside(palette.outside));
    this.group.add(this.buildSkirt());
    this.buildRocks(palette[GROUND.cliff] ?? '#777');
    this.buildTrees();
    this.buildDrills();
    const oreMaterial = teamMaterial({ emissive: new THREE.Color('#3a2a00') });
    const gemMaterial = teamMaterial({ emissive: new THREE.Color('#2a0a4a') });
    this.oreBatches = [
      new Batch(this.group, oreGeometry(false), oreMaterial, false, 256),
      new Batch(this.group, oreGeometry(true), gemMaterial, false, 64),
    ];
  }

  /** Vertex height: raised only where every cell touching it is cliff, lowered for water. */
  private heightAt(vx: number, vz: number): number {
    const map = this.map;
    let cliffs = 0;
    let water = 0;
    let cells = 0;
    for (const [dx, dz] of [
      [-1, -1],
      [0, -1],
      [-1, 0],
      [0, 0],
    ] as const) {
      const x = vx + dx;
      const z = vz + dz;
      if (!map.inside(x, z)) continue;
      cells++;
      const ground = map.groundAt(map.index(x, z));
      if (ground === GROUND.cliff) cliffs++;
      if (ground === GROUND.water) water++;
    }
    const jitter = hash2(vx, vz, 71) - 0.5;
    if (cells > 0 && cliffs === cells) return CLIFF_HEIGHT + jitter * 0.5;
    if (water === 0) return 0;
    // Grade the bed by how much water is around, so shorelines curve instead of zig-zag.
    let wet = 0;
    let total = 0;
    for (let dz = -2; dz <= 1; dz++) {
      for (let dx = -2; dx <= 1; dx++) {
        if (!map.inside(vx + dx, vz + dz)) continue;
        total++;
        if (map.groundAt(map.index(vx + dx, vz + dz)) === GROUND.water) wet++;
      }
    }
    const depth = -WATER_DEPTH * (wet / Math.max(1, total)) ** 1.2 + jitter * 0.04;
    // Land keeps its edge above the waterline; open water stays below it.
    if (water < cells) return Math.max(-0.07, depth);
    return Math.min(-0.16, depth);
  }

  private buildGround(): THREE.Mesh {
    const map = this.map;
    const w = map.width;
    const h = map.height;
    const positions = new Float32Array((w + 1) * (h + 1) * 3);
    const colors = new Float32Array((w + 1) * (h + 1) * 3);
    const uvs = new Float32Array((w + 1) * (h + 1) * 2);
    for (let z = 0; z <= h; z++) {
      for (let x = 0; x <= w; x++) {
        const i = z * (w + 1) + x;
        const height = this.heightAt(x, z);
        // Nudge inner vertices about so coasts and cliff edges wander naturally.
        const edge = x === 0 || z === 0 || x === w || z === h;
        const nudge = edge ? 0 : 0.34;
        const px = x + (hash2(x, z, 41) - 0.5) * nudge;
        const pz = z + (hash2(x, z, 43) - 0.5) * nudge;
        positions[i * 3] = px;
        positions[i * 3 + 1] = height;
        positions[i * 3 + 2] = pz;
        uvs[i * 2] = px / w;
        uvs[i * 2 + 1] = 1 - pz / h;
        // Hollows and cliff tops a touch darker, like ambient shadow.
        const shade = height > 0.3 ? 0.8 + hash2(x, z, 9) * 0.15 : height < -0.05 ? 0.85 : 1;
        colors[i * 3] = shade;
        colors[i * 3 + 1] = shade;
        colors[i * 3 + 2] = shade;
      }
    }
    const indices: number[] = [];
    for (let z = 0; z < h; z++) {
      for (let x = 0; x < w; x++) {
        const a = z * (w + 1) + x;
        const b = a + 1;
        const c = a + (w + 1);
        const d = c + 1;
        indices.push(a, c, b, b, c, d);
      }
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    const texture = groundTexture(map);
    const material = new THREE.MeshStandardMaterial({
      map: texture,
      vertexColors: true,
      roughness: 0.95,
      metalness: 0,
    });
    const detail = detailTexture();
    material.onBeforeCompile = (shader) => {
      shader.uniforms.detailMap = { value: detail };
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec2 vGroundXZ;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvGroundXZ = position.xz;');
      shader.fragmentShader = shader.fragmentShader
        .replace(
          '#include <common>',
          '#include <common>\nuniform sampler2D detailMap;\nvarying vec2 vGroundXZ;',
        )
        .replace(
          '#include <map_fragment>',
          '#include <map_fragment>\nfloat grain = texture2D(detailMap, vGroundXZ * 0.3).r;\ndiffuseColor.rgb *= mix(1.0, grain * 2.0, 0.5);',
        );
    };
    const mesh = new THREE.Mesh(geometry, material);
    mesh.receiveShadow = true;
    return mesh;
  }

  private buildWater(hex: string): THREE.Mesh {
    const map = this.map;
    const geometry = new THREE.PlaneGeometry(map.width - 0.04, map.height - 0.04);
    geometry.rotateX(-Math.PI / 2);
    this.ripples.repeat.set(map.width / 3.5, map.height / 3.5);
    const material = new THREE.MeshStandardMaterial({
      color: new THREE.Color(hex).multiplyScalar(0.8),
      transparent: true,
      opacity: 0.86,
      roughness: 0.18,
      metalness: 0.3,
      normalMap: this.ripples,
      normalScale: new THREE.Vector2(0.95, 0.95),
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(map.width / 2, WATER_LEVEL, map.height / 2);
    mesh.receiveShadow = true;
    return mesh;
  }

  private buildOutside(hex: string): THREE.Mesh {
    const map = this.map;
    const size = Math.max(map.width, map.height) + 120;
    const geometry = new THREE.PlaneGeometry(size, size);
    geometry.rotateX(-Math.PI / 2);
    const mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ color: hex }));
    mesh.position.set(map.width / 2, -0.6, map.height / 2);
    return mesh;
  }

  /** Earth walls round the map's edge, so it reads as a solid slab of land. */
  private buildSkirt(): THREE.Mesh {
    const map = this.map;
    const w = map.width;
    const h = map.height;
    const depth = 0.6;
    const positions: number[] = [];
    const wall = (x0: number, z0: number, x1: number, z1: number) => {
      positions.push(x0, 0.01, z0, x1, 0.01, z1, x1, -depth, z1);
      positions.push(x0, 0.01, z0, x1, -depth, z1, x0, -depth, z0);
    };
    wall(0, h, w, h);
    wall(w, h, w, 0);
    wall(w, 0, 0, 0);
    wall(0, 0, 0, h);
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.computeVertexNormals();
    return new THREE.Mesh(
      geometry,
      new THREE.MeshLambertMaterial({ color: '#4a3b2c', side: THREE.DoubleSide }),
    );
  }

  private buildRocks(hex: string): void {
    const map = this.map;
    const rocks = new Shape()
      .sphere(0.42, 0, 0.18, 0, hex, { sy: 0.8, detail: 0 })
      .sphere(0.28, 0.25, 0.12, 0.2, hex, { sy: 0.7 })
      .build();
    const cells: number[] = [];
    for (let i = 0; i < map.ground.length; i++) if (map.groundAt(i) === GROUND.cliff) cells.push(i);
    if (cells.length === 0) return;
    const mesh = new THREE.InstancedMesh(rocks, teamMaterial(), cells.length);
    const matrix = new THREE.Matrix4();
    const quaternion = new THREE.Quaternion();
    cells.forEach((cell, n) => {
      const x = map.cellX(cell);
      const z = map.cellZ(cell);
      const r = hash2(x, z, 3);
      const height = Math.max(this.heightAt(x, z), this.heightAt(x + 1, z + 1)) * 0.6;
      quaternion.setFromEuler(new THREE.Euler(0, r * Math.PI * 2, 0));
      const scale = 0.9 + r * 0.8;
      matrix.compose(
        new THREE.Vector3(x + 0.3 + r * 0.4, height, z + 0.3 + hash2(z, x, 4) * 0.4),
        quaternion,
        new THREE.Vector3(scale, scale * (0.8 + r), scale),
      );
      mesh.setMatrixAt(n, matrix);
    });
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    this.group.add(mesh);
  }

  private buildTrees(): void {
    const map = this.map;
    const geometries = treeGeometries(map.theme);
    const buckets: number[][] = geometries.map(() => []);
    for (let i = 0; i < map.tree.length; i++) {
      const variant = map.tree[i] ?? 0;
      if (variant > 0) buckets[(variant - 1) % geometries.length]?.push(i);
    }
    const material = teamMaterial();
    const matrix = new THREE.Matrix4();
    const quaternion = new THREE.Quaternion();
    geometries.forEach((geometry, variant) => {
      const cells = buckets[variant] ?? [];
      if (cells.length === 0) return;
      const mesh = new THREE.InstancedMesh(geometry, material, cells.length);
      cells.forEach((cell, n) => {
        const x = map.cellX(cell);
        const z = map.cellZ(cell);
        const r = hash2(x, z, 11);
        const scale = 0.8 + r * 0.55;
        quaternion.setFromEuler(new THREE.Euler(0, r * Math.PI * 2, 0));
        matrix.compose(
          new THREE.Vector3(x + 0.35 + r * 0.3, 0, z + 0.35 + hash2(z, x, 12) * 0.3),
          quaternion,
          new THREE.Vector3(scale, scale, scale),
        );
        mesh.setMatrixAt(n, matrix);
      });
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      this.group.add(mesh);
    });
  }

  private buildDrills(): void {
    const map = this.map;
    if (map.drills.length === 0) return;
    const mesh = new THREE.InstancedMesh(drillGeometry(), teamMaterial(), map.drills.length);
    const matrix = new THREE.Matrix4();
    map.drills.forEach((cell, n) => {
      matrix.makeTranslation(map.cellX(cell) + 0.5, 0, map.cellZ(cell) + 0.5);
      mesh.setMatrixAt(n, matrix);
    });
    mesh.castShadow = true;
    this.group.add(mesh);
  }

  /** Redraws the ore when it has changed. */
  update(): void {
    const drift = performance.now() / 1000;
    this.ripples.offset.set(drift * 0.012, drift * 0.02);
    const map = this.map;
    if (map.oreVersion === this.oreVersion) return;
    this.oreVersion = map.oreVersion;
    const [ore, gems] = this.oreBatches;
    ore.begin();
    gems.begin();
    const white = new THREE.Color(1, 1, 1);
    const quaternion = new THREE.Quaternion();
    const position = new THREE.Vector3();
    const scale = new THREE.Vector3();
    for (let i = 0; i < map.ore.length; i++) {
      const bales = map.oreAt(i);
      if (bales === 0) continue;
      const x = map.cellX(i);
      const z = map.cellZ(i);
      const r = hash2(x, z, 21);
      const size = 0.45 + (0.75 * bales) / MAX_ORE;
      quaternion.setFromAxisAngle(yAxis, r * Math.PI * 2);
      position.set(x + 0.5 + (r - 0.5) * 0.2, 0, z + 0.5 + (hash2(z, x, 22) - 0.5) * 0.2);
      scale.set(size, size * (0.8 + r * 0.4), size);
      this.oreMatrix.compose(position, quaternion, scale);
      (map.gem[i] ? gems : ore).add(this.oreMatrix, white);
    }
    ore.end();
    gems.end();
  }
}

const yAxis = new THREE.Vector3(0, 1, 0);

/** The black cover over parts of the map the player hasn't explored yet. */
export class ShroudLayer {
  readonly mesh: THREE.Mesh;
  private readonly texture: THREE.DataTexture;
  private readonly data: Uint8Array;
  private readonly map: GameMap;
  private version = -1;

  /**
   * `offset` shifts the cover sideways so that, seen from the fixed camera angle, it lines
   * up exactly with the ground it hides.
   */
  constructor(map: GameMap, height: number, offset: THREE.Vector2) {
    this.map = map;
    const border = 2;
    const w = map.width + border * 2;
    const h = map.height + border * 2;
    this.data = new Uint8Array(w * h * 4);
    this.texture = new THREE.DataTexture(this.data, w, h, THREE.RGBAFormat);
    this.texture.magFilter = THREE.LinearFilter;
    this.texture.minFilter = THREE.LinearFilter;
    this.texture.flipY = false;
    const geometry = new THREE.PlaneGeometry(w, h);
    geometry.rotateX(-Math.PI / 2);
    // PlaneGeometry's v runs along -z after the rotation; flip it so texture rows follow z.
    const uv = geometry.getAttribute('uv');
    for (let i = 0; i < uv.count; i++) uv.setY(i, 1 - uv.getY(i));
    const material = new THREE.MeshBasicMaterial({
      map: this.texture,
      transparent: true,
      depthWrite: false,
      color: '#000000',
    });
    material.onBeforeCompile = (shader) => {
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <map_fragment>',
        'vec4 sampledDiffuseColor = texture2D( map, vMapUv ); diffuseColor.a *= sampledDiffuseColor.a;',
      );
    };
    this.mesh = new THREE.Mesh(geometry, material);
    this.mesh.position.set(map.width / 2 + offset.x, height, map.height / 2 + offset.y);
    this.mesh.renderOrder = 10;
  }

  update(shroud: Uint8Array, version: number): void {
    if (version === this.version) return;
    this.version = version;
    const map = this.map;
    const border = 2;
    const w = map.width + border * 2;
    const h = map.height + border * 2;
    const seen = (x: number, z: number) =>
      map.inside(x, z) && shroud[map.index(x, z)] !== 0 ? 1 : 0;
    for (let tz = 0; tz < h; tz++) {
      for (let tx = 0; tx < w; tx++) {
        const x = tx - border;
        const z = tz - border;
        // Soften the edge: average the cell with its neighbours.
        let total = 0;
        for (let dz = -1; dz <= 1; dz++)
          for (let dx = -1; dx <= 1; dx++) total += seen(x + dx, z + dz);
        const visible = seen(x, z) ? 0.35 + (0.65 * total) / 9 : (0.5 * total) / 9;
        const alpha = Math.round(255 * (1 - Math.min(1, visible * 1.25)));
        this.data[(tz * w + tx) * 4 + 3] = alpha;
      }
    }
    this.texture.needsUpdate = true;
  }
}
