import * as THREE from 'three';

import { isUnitType } from '../sim/production';
import type { Faction, StructureType, UnitType } from '../sim/rules';
import { structureModel, unitModel, type Model } from './models';
import { teamMaterial } from './shapes';

const WIDTH = 128;
const HEIGHT = 96;

const BACKDROP: Record<Faction, [string, string]> = {
  accord: ['#2b3f5c', '#0f1824'],
  bloc: ['#5a2a22', '#1c0f0c'],
};

/**
 * Build-button pictures: each model rendered once, in the player's colour, over a
 * faction backdrop. Returns data URLs keyed by type.
 */
export function renderIcons(
  types: (UnitType | StructureType)[],
  color: string,
  faction: Faction,
): Map<string, string> {
  const icons = new Map<string, string>();
  const canvas = document.createElement('canvas');
  canvas.width = WIDTH * 2;
  canvas.height = HEIGHT * 2;
  let renderer: THREE.WebGLRenderer;
  try {
    renderer = new THREE.WebGLRenderer({
      canvas,
      alpha: true,
      antialias: true,
      preserveDrawingBuffer: true,
    });
  } catch {
    return icons;
  }
  renderer.setSize(WIDTH * 2, HEIGHT * 2, false);
  renderer.setClearColor(0x000000, 0);
  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight('#e8f2ff', '#3a3630', 2));
  const sun = new THREE.DirectionalLight('#fff4e0', 2.6);
  sun.position.set(-3, 6, 4);
  scene.add(sun);
  const material = teamMaterial();
  const team = new THREE.Color(color);
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 100);
  const output = document.createElement('canvas');
  output.width = WIDTH;
  output.height = HEIGHT;
  const ctx = output.getContext('2d');
  if (!ctx) return icons;
  for (const type of types) {
    const model = isUnitType(type) ? unitModel(type) : structureModel(type);
    const group = buildGroup(model, material, team);
    // Units face the viewer at a three-quarter angle.
    if (isUnitType(type)) group.rotation.y = -Math.PI * 0.8;
    scene.add(group);
    const box = new THREE.Box3().setFromObject(group);
    const size = box.getSize(new THREE.Vector3());
    const centre = box.getCenter(new THREE.Vector3());
    const direction = new THREE.Vector3(1, 0.9, 1).normalize();
    camera.position.copy(centre).addScaledVector(direction, 20);
    camera.lookAt(centre);
    const extent = Math.max(size.x, size.z) * 0.78 + size.y * 0.45;
    const aspect = WIDTH / HEIGHT;
    camera.left = -extent * aspect * 0.62;
    camera.right = extent * aspect * 0.62;
    camera.top = extent * 0.62;
    camera.bottom = -extent * 0.62;
    camera.updateProjectionMatrix();
    renderer.render(scene, camera);
    const [top, bottom] = BACKDROP[faction];
    const gradient = ctx.createLinearGradient(0, 0, 0, HEIGHT);
    gradient.addColorStop(0, top);
    gradient.addColorStop(1, bottom);
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, WIDTH, HEIGHT);
    ctx.drawImage(canvas, 0, 0, WIDTH, HEIGHT);
    icons.set(type, output.toDataURL('image/png'));
    scene.remove(group);
  }
  renderer.dispose();
  renderer.forceContextLoss();
  return icons;
}

function buildGroup(model: Model, material: THREE.Material, color: THREE.Color): THREE.Group {
  const group = new THREE.Group();
  for (const part of model.parts) {
    const mesh = new THREE.InstancedMesh(part.geometry, material, 1);
    mesh.setMatrixAt(0, new THREE.Matrix4());
    mesh.setColorAt(0, color);
    if (part.name !== 'hull') mesh.position.set(part.pivot[0], part.pivot[1], part.pivot[2]);
    group.add(mesh);
  }
  return group;
}
