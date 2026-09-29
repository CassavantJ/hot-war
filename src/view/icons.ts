import * as THREE from 'three';

import { isUnitType } from '../sim/production';
import type { Faction, StructureType, UnitType } from '../sim/rules';
import { battlefieldEnvironment } from './environment';
import { structureModel, unitModel, type Model } from './models';
import { teamMaterial } from './shapes';
import { cameoGroundTexture } from './textures';

const WIDTH = 128;
const HEIGHT = 96;

/** Each side's publicity shots: the sky's colour from the top down to the horizon haze. */
const SKY: Record<Faction, [string, string, string]> = {
  accord: ['#5d86b4', '#a9c2d8', '#e3e6e2'],
  bloc: ['#7a4a3c', '#c49a82', '#eadccd'],
};

function skyTexture(faction: Faction): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 4;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  const texture = new THREE.CanvasTexture(canvas);
  if (!ctx) return texture;
  const [top, middle, horizon] = SKY[faction];
  const gradient = ctx.createLinearGradient(0, 0, 0, 128);
  gradient.addColorStop(0, top);
  gradient.addColorStop(0.55, middle);
  gradient.addColorStop(1, horizon);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 4, 128);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/**
 * Build-button pictures in the style of a publicity photo: each model on open ground under
 * a hazy sky, lit by a low sun, shot with a long lens from a three-quarter angle. Returns
 * data URLs keyed by type.
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
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
  } catch {
    return icons;
  }
  renderer.setSize(WIDTH * 2, HEIGHT * 2, false);
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  const scene = new THREE.Scene();
  scene.background = skyTexture(faction);
  scene.environment = battlefieldEnvironment(renderer);
  scene.environmentIntensity = 0.8;
  const fog = new THREE.Fog(SKY[faction][2], 10, 40);
  scene.fog = fog;
  scene.add(new THREE.HemisphereLight('#e8f2ff', '#4a4032', 0.8));
  const sun = new THREE.DirectionalLight('#fff0d8', 3.2);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  sun.shadow.bias = -0.001;
  scene.add(sun, sun.target);
  const groundTexture = cameoGroundTexture(faction);
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(200, 200),
    new THREE.MeshStandardMaterial({ map: groundTexture, roughness: 1 }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);
  const material = teamMaterial();
  const team = new THREE.Color(color);
  const camera = new THREE.PerspectiveCamera(24, WIDTH / HEIGHT, 0.1, 400);
  const output = document.createElement('canvas');
  output.width = WIDTH;
  output.height = HEIGHT;
  const ctx = output.getContext('2d');
  if (!ctx) return icons;
  for (const type of types) {
    const unit = isUnitType(type);
    const model = unit ? unitModel(type) : structureModel(type);
    const group = buildGroup(model, material, team);
    // Units face the camera at a three-quarter angle.
    if (unit) group.rotation.y = -Math.PI * 0.8;
    scene.add(group);
    const box = new THREE.Box3().setFromObject(group);
    // Aircraft hang just above their own shadow.
    if (box.min.y > 0.3) {
      group.position.y -= box.min.y - 0.3;
      box.setFromObject(group);
    }
    const sphere = box.getBoundingSphere(new THREE.Sphere());
    const radius = Math.max(0.2, sphere.radius);
    const distance = (radius / Math.sin(THREE.MathUtils.degToRad(camera.fov / 2))) * 0.82;
    // Low enough that the horizon shows behind it.
    const direction = new THREE.Vector3(1, 0.3, 0.85).normalize();
    const aim = sphere.center.clone();
    aim.y += radius * 0.12;
    camera.position.copy(aim).addScaledVector(direction, distance);
    camera.lookAt(aim);
    camera.updateProjectionMatrix();
    groundTexture.repeat.set(200 / (radius * 3), 200 / (radius * 3));
    fog.near = distance * 1.2;
    fog.far = distance * 5;
    sun.position.copy(sphere.center).add(new THREE.Vector3(-radius * 3, radius * 5, radius * 2));
    sun.target.position.copy(sphere.center);
    sun.target.updateMatrixWorld();
    const shadow = sun.shadow.camera;
    const reach = radius * 2.5;
    shadow.left = -reach;
    shadow.right = reach;
    shadow.top = reach;
    shadow.bottom = -reach;
    shadow.far = radius * 20;
    shadow.updateProjectionMatrix();
    renderer.render(scene, camera);
    ctx.drawImage(canvas, 0, 0, WIDTH, HEIGHT);
    // A touch of vignette, as through a lens.
    const vignette = ctx.createRadialGradient(
      WIDTH / 2,
      HEIGHT / 2,
      HEIGHT * 0.35,
      WIDTH / 2,
      HEIGHT / 2,
      WIDTH * 0.7,
    );
    vignette.addColorStop(0, 'rgba(0,0,0,0)');
    vignette.addColorStop(1, 'rgba(0,0,0,0.45)');
    ctx.fillStyle = vignette;
    ctx.fillRect(0, 0, WIDTH, HEIGHT);
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
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    if (part.name !== 'hull') mesh.position.set(part.pivot[0], part.pivot[1], part.pivot[2]);
    group.add(mesh);
  }
  return group;
}
