import * as THREE from 'three';

import { craterTexture, scorchTexture } from './textures';

import { Batch } from './batches';

const VERTEX = /* glsl */ `
attribute float size;
attribute vec4 rgba;
uniform float scale;
varying vec4 vColor;
void main() {
  vColor = rgba;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = max(1.0, size * scale);
}`;

const FRAGMENT = /* glsl */ `
varying vec4 vColor;
uniform float softness;
void main() {
  float d = length(gl_PointCoord - vec2(0.5));
  float a = 1.0 - smoothstep(softness, 0.5, d);
  if (a <= 0.0) discard;
  gl_FragColor = vec4(vColor.rgb, vColor.a * a);
}`;

export type Rgba = [number, number, number, number];

/** A pool of camera-facing soft dots: fire, smoke, sparks, dust. */
export class Particles {
  readonly points: THREE.Points;
  private readonly capacity: number;
  private count = 0;
  private readonly position: Float32Array;
  private readonly color: Float32Array;
  private readonly size: Float32Array;
  private readonly velocity: Float32Array;
  private readonly life: Float32Array;
  private readonly maxLife: Float32Array;
  private readonly sizes: Float32Array;
  private readonly from: Float32Array;
  private readonly to: Float32Array;
  private readonly gravity: Float32Array;
  private readonly geometry: THREE.BufferGeometry;
  readonly material: THREE.ShaderMaterial;

  constructor(capacity: number, additive: boolean) {
    this.capacity = capacity;
    this.position = new Float32Array(capacity * 3);
    this.color = new Float32Array(capacity * 4);
    this.size = new Float32Array(capacity);
    this.velocity = new Float32Array(capacity * 3);
    this.life = new Float32Array(capacity);
    this.maxLife = new Float32Array(capacity);
    this.sizes = new Float32Array(capacity * 2);
    this.from = new Float32Array(capacity * 4);
    this.to = new Float32Array(capacity * 4);
    this.gravity = new Float32Array(capacity);
    this.geometry = new THREE.BufferGeometry();
    this.geometry.setAttribute(
      'position',
      new THREE.BufferAttribute(this.position, 3).setUsage(THREE.DynamicDrawUsage),
    );
    this.geometry.setAttribute(
      'rgba',
      new THREE.BufferAttribute(this.color, 4).setUsage(THREE.DynamicDrawUsage),
    );
    this.geometry.setAttribute(
      'size',
      new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage),
    );
    this.material = new THREE.ShaderMaterial({
      vertexShader: VERTEX,
      fragmentShader: FRAGMENT,
      uniforms: { scale: { value: 30 }, softness: { value: additive ? 0.05 : 0.2 } },
      transparent: true,
      depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    this.points = new THREE.Points(this.geometry, this.material);
    this.points.frustumCulled = false;
    this.points.renderOrder = additive ? 6 : 5;
  }

  emit(
    x: number,
    y: number,
    z: number,
    vx: number,
    vy: number,
    vz: number,
    life: number,
    size0: number,
    size1: number,
    color0: Rgba,
    color1: Rgba,
    gravity = 0,
  ): void {
    let i = this.count;
    if (i >= this.capacity) {
      // Full: recycle a random one.
      i = Math.floor(Math.random() * this.capacity);
    } else {
      this.count++;
    }
    this.position[i * 3] = x;
    this.position[i * 3 + 1] = y;
    this.position[i * 3 + 2] = z;
    this.velocity[i * 3] = vx;
    this.velocity[i * 3 + 1] = vy;
    this.velocity[i * 3 + 2] = vz;
    this.life[i] = life;
    this.maxLife[i] = life;
    this.sizes[i * 2] = size0;
    this.sizes[i * 2 + 1] = size1;
    this.from.set(color0, i * 4);
    this.to.set(color1, i * 4);
    this.gravity[i] = gravity;
  }

  update(dt: number): void {
    let i = 0;
    while (i < this.count) {
      this.life[i] = (this.life[i] ?? 0) - dt;
      if ((this.life[i] ?? 0) <= 0) {
        this.move(this.count - 1, i);
        this.count--;
        continue;
      }
      const t = 1 - (this.life[i] ?? 0) / (this.maxLife[i] ?? 1);
      const p = i * 3;
      this.velocity[p + 1] = (this.velocity[p + 1] ?? 0) - (this.gravity[i] ?? 0) * dt;
      this.position[p] = (this.position[p] ?? 0) + (this.velocity[p] ?? 0) * dt;
      this.position[p + 1] = (this.position[p + 1] ?? 0) + (this.velocity[p + 1] ?? 0) * dt;
      this.position[p + 2] = (this.position[p + 2] ?? 0) + (this.velocity[p + 2] ?? 0) * dt;
      const s0 = this.sizes[i * 2] ?? 0;
      const s1 = this.sizes[i * 2 + 1] ?? 0;
      this.size[i] = s0 + (s1 - s0) * t;
      for (let c = 0; c < 4; c++) {
        const a = this.from[i * 4 + c] ?? 0;
        const b = this.to[i * 4 + c] ?? 0;
        this.color[i * 4 + c] = a + (b - a) * t;
      }
      i++;
    }
    this.geometry.setDrawRange(0, this.count);
    for (const name of ['position', 'rgba', 'size']) {
      const attribute = this.geometry.getAttribute(name);
      attribute.needsUpdate = true;
    }
  }

  private move(from: number, to: number): void {
    if (from === to) return;
    this.position.copyWithin(to * 3, from * 3, from * 3 + 3);
    this.velocity.copyWithin(to * 3, from * 3, from * 3 + 3);
    this.color.copyWithin(to * 4, from * 4, from * 4 + 4);
    this.from.copyWithin(to * 4, from * 4, from * 4 + 4);
    this.to.copyWithin(to * 4, from * 4, from * 4 + 4);
    this.sizes.copyWithin(to * 2, from * 2, from * 2 + 2);
    this.size[to] = this.size[from] ?? 0;
    this.life[to] = this.life[from] ?? 0;
    this.maxLife[to] = this.maxLife[from] ?? 1;
    this.gravity[to] = this.gravity[from] ?? 0;
  }
}

interface Streak {
  ax: number;
  ay: number;
  az: number;
  bx: number;
  by: number;
  bz: number;
  width: number;
  color: THREE.Color;
  life: number;
  maxLife: number;
}

/** Glowing straight lines: beams, tracers and the flash of a warp. */
export class Streaks {
  private readonly batch: Batch;
  private readonly streaks: Streak[] = [];
  private readonly matrix = new THREE.Matrix4();
  private readonly quaternion = new THREE.Quaternion();
  private readonly direction = new THREE.Vector3();
  private readonly position = new THREE.Vector3();
  private readonly scale = new THREE.Vector3();
  private readonly color = new THREE.Color();

  constructor(scene: THREE.Object3D) {
    const geometry = new THREE.BoxGeometry(1, 1, 1);
    const material = new THREE.MeshBasicMaterial({
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    this.batch = new Batch(scene, geometry, material, false, 64);
    this.batch.mesh.renderOrder = 7;
  }

  add(
    from: THREE.Vector3Like,
    to: THREE.Vector3Like,
    width: number,
    color: string,
    life: number,
  ): void {
    this.streaks.push({
      ax: from.x,
      ay: from.y,
      az: from.z,
      bx: to.x,
      by: to.y,
      bz: to.z,
      width,
      color: new THREE.Color(color),
      life,
      maxLife: life,
    });
  }

  update(dt: number): void {
    this.batch.begin();
    for (let i = this.streaks.length - 1; i >= 0; i--) {
      const streak = this.streaks[i];
      if (!streak) continue;
      streak.life -= dt;
      if (streak.life <= 0) {
        this.streaks.splice(i, 1);
        continue;
      }
      this.direction.set(streak.bx - streak.ax, streak.by - streak.ay, streak.bz - streak.az);
      const length = this.direction.length();
      if (length < 1e-4) continue;
      this.direction.divideScalar(length);
      this.quaternion.setFromUnitVectors(xAxis, this.direction);
      this.position.set(
        (streak.ax + streak.bx) / 2,
        (streak.ay + streak.by) / 2,
        (streak.az + streak.bz) / 2,
      );
      const fade = streak.life / streak.maxLife;
      this.scale.set(length, streak.width * (0.5 + fade * 0.5), streak.width * (0.5 + fade * 0.5));
      this.matrix.compose(this.position, this.quaternion, this.scale);
      this.color.copy(streak.color).multiplyScalar(fade);
      this.batch.add(this.matrix, this.color);
    }
    this.batch.end();
  }
}

const xAxis = new THREE.Vector3(1, 0, 0);
const SCORCHES = 400;
const CRATERS = 300;
const CHUNKS = 1500;

/** Scorch marks, craters and rubble left on the ground. */
export class Decals {
  private readonly scorch: THREE.InstancedMesh;
  private readonly craters: THREE.InstancedMesh;
  private readonly rubble: THREE.InstancedMesh;
  private scorchCount = 0;
  private craterCount = 0;
  private rubbleCount = 0;
  private readonly matrix = new THREE.Matrix4();

  constructor(scene: THREE.Object3D) {
    const disc = new THREE.PlaneGeometry(1, 1);
    disc.rotateX(-Math.PI / 2);
    this.scorch = new THREE.InstancedMesh(
      disc,
      new THREE.MeshBasicMaterial({
        map: scorchTexture(),
        color: '#1a1612',
        transparent: true,
        opacity: 0.8,
        depthWrite: false,
        polygonOffset: true,
        polygonOffsetFactor: -2,
      }),
      SCORCHES,
    );
    this.scorch.count = 0;
    this.scorch.frustumCulled = false;
    this.scorch.renderOrder = 1;
    scene.add(this.scorch);
    const plane = new THREE.PlaneGeometry(1, 1);
    plane.rotateX(-Math.PI / 2);
    this.craters = new THREE.InstancedMesh(
      plane,
      new THREE.MeshLambertMaterial({
        map: craterTexture(),
        transparent: true,
        depthWrite: false,
        polygonOffset: true,
        polygonOffsetFactor: -3,
      }),
      CRATERS,
    );
    this.craters.count = 0;
    this.craters.frustumCulled = false;
    this.craters.renderOrder = 1;
    this.craters.receiveShadow = true;
    scene.add(this.craters);
    this.rubble = new THREE.InstancedMesh(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshStandardMaterial({ color: '#6b665e', roughness: 0.9 }),
      CHUNKS,
    );
    this.rubble.count = 0;
    this.rubble.frustumCulled = false;
    this.rubble.castShadow = true;
    this.rubble.receiveShadow = true;
    scene.add(this.rubble);
  }

  addScorch(x: number, z: number, size: number): void {
    const slot = this.scorchCount % SCORCHES;
    this.matrix.makeRotationY(Math.random() * 6).setPosition(x, 0.015, z);
    this.matrix.scale(new THREE.Vector3(size, 1, size));
    this.scorch.setMatrixAt(slot, this.matrix);
    this.scorchCount++;
    this.scorch.count = Math.min(SCORCHES, this.scorchCount);
    this.scorch.instanceMatrix.needsUpdate = true;
  }

  /** A shell crater: a pit ringed with thrown-up earth. */
  addCrater(x: number, z: number, size: number): void {
    const slot = this.craterCount % CRATERS;
    this.matrix.makeRotationY(Math.random() * 6).setPosition(x, 0.018, z);
    this.matrix.scale(new THREE.Vector3(size, 1, size * (0.85 + Math.random() * 0.3)));
    this.craters.setMatrixAt(slot, this.matrix);
    this.craterCount++;
    this.craters.count = Math.min(CRATERS, this.craterCount);
    this.craters.instanceMatrix.needsUpdate = true;
  }

  /** A burnt patch where a building stood, strewn with broken concrete. */
  addRubble(x: number, z: number, w: number, h: number): void {
    const slot = this.scorchCount % SCORCHES;
    this.matrix.makeRotationY(Math.random() * 0.4 - 0.2).setPosition(x + w / 2, 0.012, z + h / 2);
    this.matrix.scale(new THREE.Vector3(w * 1.25, 1, h * 1.25));
    this.scorch.setMatrixAt(slot, this.matrix);
    this.scorchCount++;
    this.scorch.count = Math.min(SCORCHES, this.scorchCount);
    this.scorch.instanceMatrix.needsUpdate = true;
    const quaternion = new THREE.Quaternion();
    const euler = new THREE.Euler();
    for (let i = 0; i < w * h * 4; i++) {
      const size = 0.08 + Math.random() * 0.22;
      euler.set(Math.random() * 0.8, Math.random() * Math.PI, Math.random() * 0.8);
      quaternion.setFromEuler(euler);
      this.matrix.compose(
        new THREE.Vector3(
          x + 0.15 + Math.random() * (w - 0.3),
          size * 0.3,
          z + 0.15 + Math.random() * (h - 0.3),
        ),
        quaternion,
        new THREE.Vector3(size * (1 + Math.random()), size * 0.7, size),
      );
      this.rubble.setMatrixAt(this.rubbleCount % CHUNKS, this.matrix);
      this.rubbleCount++;
    }
    this.rubble.count = Math.min(CHUNKS, this.rubbleCount);
    this.rubble.instanceMatrix.needsUpdate = true;
  }
}
