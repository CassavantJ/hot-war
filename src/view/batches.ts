import * as THREE from 'three';

import type { Model, PartName } from './models';

/** One mesh drawn many times per frame, growing as needed. */
export class Batch {
  mesh: THREE.InstancedMesh;
  private readonly scene: THREE.Object3D;
  private count = 0;
  private readonly shadows: boolean;

  constructor(
    scene: THREE.Object3D,
    geometry: THREE.BufferGeometry,
    material: THREE.Material,
    shadows = true,
    capacity = 16,
  ) {
    this.scene = scene;
    this.shadows = shadows;
    this.mesh = this.create(geometry, material, capacity);
  }

  private create(
    geometry: THREE.BufferGeometry,
    material: THREE.Material,
    capacity: number,
  ): THREE.InstancedMesh {
    const mesh = new THREE.InstancedMesh(geometry, material, capacity);
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.setColorAt(0, new THREE.Color(1, 1, 1));
    if (mesh.instanceColor) mesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
    mesh.castShadow = this.shadows;
    mesh.receiveShadow = this.shadows;
    mesh.frustumCulled = false;
    mesh.count = 0;
    mesh.visible = false;
    this.scene.add(mesh);
    return mesh;
  }

  begin(): void {
    this.count = 0;
  }

  add(matrix: THREE.Matrix4, color: THREE.Color): void {
    if (this.count >= this.mesh.instanceMatrix.count) {
      const old = this.mesh;
      this.mesh = this.create(
        old.geometry,
        old.material as THREE.Material,
        old.instanceMatrix.count * 2,
      );
      for (let i = 0; i < this.count; i++) {
        old.getMatrixAt(i, scratchMatrix);
        this.mesh.setMatrixAt(i, scratchMatrix);
        old.getColorAt(i, scratchColor);
        this.mesh.setColorAt(i, scratchColor);
      }
      this.scene.remove(old);
      old.dispose();
    }
    this.mesh.setMatrixAt(this.count, matrix);
    this.mesh.setColorAt(this.count, color);
    this.count++;
  }

  end(): void {
    this.mesh.count = this.count;
    this.mesh.visible = this.count > 0;
    if (this.count > 0) {
      this.mesh.instanceMatrix.needsUpdate = true;
      if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
    }
  }
}

const scratchMatrix = new THREE.Matrix4();
const scratchColor = new THREE.Color();

/** A pose for one model part, relative to the model's base transform. */
export type PoseFn = (part: PartName, pivot: THREE.Vector3, out: THREE.Matrix4) => void;

const partMatrix = new THREE.Matrix4();
const local = new THREE.Matrix4();
const pivot = new THREE.Vector3();

/** Instanced batches for every part of every model, drawn by key each frame. */
export class ModelBatches {
  private readonly scene: THREE.Object3D;
  private readonly material: THREE.Material;
  private readonly batches = new Map<string, { model: Model; parts: Batch[] }>();
  private readonly shadows: boolean;

  constructor(scene: THREE.Object3D, material: THREE.Material, shadows = true) {
    this.scene = scene;
    this.material = material;
    this.shadows = shadows;
  }

  begin(): void {
    for (const entry of this.batches.values()) for (const batch of entry.parts) batch.begin();
  }

  end(): void {
    for (const entry of this.batches.values()) for (const batch of entry.parts) batch.end();
  }

  /** Draws a model at `base`; `pose` sets how each moving part is turned about its pivot. */
  draw(
    key: string,
    model: () => Model,
    base: THREE.Matrix4,
    color: THREE.Color,
    pose?: PoseFn,
  ): void {
    let entry = this.batches.get(key);
    if (!entry) {
      const built = model();
      entry = {
        model: built,
        parts: built.parts.map(
          (part) => new Batch(this.scene, part.geometry, this.material, this.shadows),
        ),
      };
      this.batches.set(key, entry);
    }
    const parts = entry.model.parts;
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      const batch = entry.parts[i];
      if (!part || !batch) continue;
      if (part.name === 'hull') {
        batch.add(base, color);
        continue;
      }
      pivot.set(part.pivot[0], part.pivot[1], part.pivot[2]);
      local.identity();
      pose?.(part.name, pivot, local);
      partMatrix.makeTranslation(pivot.x, pivot.y, pivot.z).multiply(local);
      partMatrix.premultiply(base);
      batch.add(partMatrix, color);
    }
  }
}
