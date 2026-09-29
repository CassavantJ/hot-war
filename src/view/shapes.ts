import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

import { grimeTexture } from './textures';

export interface ShapeOptions {
  /** Painted in the owner's colour. */
  team?: boolean;
  /** Glossy, like glass or polished metal (0–1). */
  shine?: number;
  /** Lit from within: lamps, crystals, screens. */
  glow?: boolean;
  /** Rotations in radians, applied x, then y, then z. */
  rx?: number;
  ry?: number;
  rz?: number;
  /** Scale on top of the shape's own size. */
  sx?: number;
  sy?: number;
  sz?: number;
}

const color = new THREE.Color();

/** How a colour is finished: glossy (glass, chrome) or lit from within (lamps). */
export interface Finish {
  shine?: number;
  glow?: boolean;
}

const FINISHES = new Map<string, Finish>();

/** Every part painted `hex` gets this finish. */
export function setFinish(hex: string, finish: Finish): void {
  FINISHES.set(hex.toLowerCase(), finish);
}

/**
 * A box with its edges and corners bevelled, so they catch the light like machined metal:
 * an octagon (the box's side view with corners cut) extruded with a bevel on both ends.
 */
function chamferedBox(w: number, h: number, d: number, bevel: number): THREE.BufferGeometry {
  const x = w / 2 - bevel;
  const y = h / 2 - bevel;
  const cut = bevel * 0.6;
  const outline = new THREE.Shape()
    .moveTo(-x + cut, -y)
    .lineTo(x - cut, -y)
    .lineTo(x, -y + cut)
    .lineTo(x, y - cut)
    .lineTo(x - cut, y)
    .lineTo(-x + cut, y)
    .lineTo(-x, y - cut)
    .lineTo(-x, -y + cut)
    .lineTo(-x + cut, -y);
  const depth = Math.max(0.001, d - bevel * 2);
  const geometry = new THREE.ExtrudeGeometry(outline, {
    depth,
    bevelEnabled: true,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelSegments: 1,
    curveSegments: 1,
  });
  geometry.translate(0, 0, -depth / 2);
  return geometry;
}

/**
 * Builds a low-poly model out of simple solids, each flat-shaded in its own colour. The
 * result has a `team` attribute (1 where the owner's colour goes) for the team material.
 */
export class Shape {
  private readonly pieces: THREE.BufferGeometry[] = [];

  private add(
    geometry: THREE.BufferGeometry,
    x: number,
    y: number,
    z: number,
    hex: string,
    options: ShapeOptions,
  ): this {
    const flat = geometry.index ? geometry.toNonIndexed() : geometry;
    flat.deleteAttribute('uv');
    const matrix = new THREE.Matrix4().compose(
      new THREE.Vector3(x, y, z),
      new THREE.Quaternion().setFromEuler(
        new THREE.Euler(options.rx ?? 0, options.ry ?? 0, options.rz ?? 0, 'XYZ'),
      ),
      new THREE.Vector3(options.sx ?? 1, options.sy ?? 1, options.sz ?? 1),
    );
    flat.applyMatrix4(matrix);
    flat.computeVertexNormals();
    const count = flat.getAttribute('position').count;
    const colors = new Float32Array(count * 3);
    const team = new Float32Array(count);
    const shine = new Float32Array(count);
    const glow = new Float32Array(count);
    color.set(hex);
    const finish = FINISHES.get(hex.toLowerCase());
    const shiny = options.shine ?? finish?.shine ?? (options.team ? 0.45 : 0);
    const lit = (options.glow ?? finish?.glow) ? 1 : 0;
    for (let i = 0; i < count; i++) {
      colors[i * 3] = color.r;
      colors[i * 3 + 1] = color.g;
      colors[i * 3 + 2] = color.b;
      team[i] = options.team ? 1 : 0;
      shine[i] = shiny;
      glow[i] = lit;
    }
    flat.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    flat.setAttribute('team', new THREE.BufferAttribute(team, 1));
    flat.setAttribute('shine', new THREE.BufferAttribute(shine, 1));
    flat.setAttribute('glow', new THREE.BufferAttribute(glow, 1));
    this.pieces.push(flat);
    if (flat !== geometry) geometry.dispose();
    return this;
  }

  box(
    w: number,
    h: number,
    d: number,
    x: number,
    y: number,
    z: number,
    hex: string,
    options: ShapeOptions = {},
  ): this {
    // Solid blocks get bevelled edges; thin plates and trim stay sharp.
    const least = Math.min(w, h, d);
    const geometry =
      least >= 0.09
        ? chamferedBox(w, h, d, Math.min(0.04, least * 0.14))
        : new THREE.BoxGeometry(w, h, d);
    return this.add(geometry, x, y, z, hex, options);
  }

  /** A cylinder standing on the y axis (rotate it with rx/rz to lie down). */
  cylinder(
    top: number,
    bottom: number,
    h: number,
    x: number,
    y: number,
    z: number,
    hex: string,
    options: ShapeOptions & { sides?: number } = {},
  ): this {
    return this.add(
      new THREE.CylinderGeometry(top, bottom, h, options.sides ?? 8),
      x,
      y,
      z,
      hex,
      options,
    );
  }

  /** A cylinder lying along the x axis (barrels, tanks, rockets). */
  tube(
    radius: number,
    length: number,
    x: number,
    y: number,
    z: number,
    hex: string,
    options: ShapeOptions & { sides?: number; end?: number } = {},
  ): this {
    return this.cylinder(options.end ?? radius, radius, length, x, y, z, hex, {
      ...options,
      rz: (options.rz ?? 0) - Math.PI / 2,
    });
  }

  cone(
    radius: number,
    h: number,
    x: number,
    y: number,
    z: number,
    hex: string,
    options: ShapeOptions & { sides?: number } = {},
  ): this {
    return this.add(new THREE.ConeGeometry(radius, h, options.sides ?? 8), x, y, z, hex, options);
  }

  sphere(
    radius: number,
    x: number,
    y: number,
    z: number,
    hex: string,
    options: ShapeOptions & { detail?: number } = {},
  ): this {
    return this.add(
      new THREE.IcosahedronGeometry(radius, options.detail ?? 0),
      x,
      y,
      z,
      hex,
      options,
    );
  }

  dome(
    radius: number,
    x: number,
    y: number,
    z: number,
    hex: string,
    options: ShapeOptions & { sides?: number } = {},
  ): this {
    const sides = options.sides ?? 10;
    return this.add(
      new THREE.SphereGeometry(radius, sides, 4, 0, Math.PI * 2, 0, Math.PI / 2),
      x,
      y,
      z,
      hex,
      options,
    );
  }

  crystal(
    radius: number,
    x: number,
    y: number,
    z: number,
    hex: string,
    options: ShapeOptions = {},
  ): this {
    return this.add(new THREE.OctahedronGeometry(radius, 0), x, y, z, hex, options);
  }

  /** A wedge: a box whose top slopes down towards +x. */
  wedge(
    w: number,
    h: number,
    d: number,
    x: number,
    y: number,
    z: number,
    hex: string,
    options: ShapeOptions = {},
  ): this {
    const shape = new THREE.Shape();
    shape.moveTo(-w / 2, 0);
    shape.lineTo(w / 2, 0);
    shape.lineTo(-w / 2, h);
    shape.lineTo(-w / 2, 0);
    const geometry = new THREE.ExtrudeGeometry(shape, { depth: d, bevelEnabled: false });
    geometry.translate(0, 0, -d / 2);
    return this.add(geometry, x, y, z, hex, options);
  }

  /** A pitched roof (triangular prism) along x. */
  roof(
    w: number,
    h: number,
    d: number,
    x: number,
    y: number,
    z: number,
    hex: string,
    options: ShapeOptions = {},
  ): this {
    const shape = new THREE.Shape();
    shape.moveTo(-d / 2, 0);
    shape.lineTo(d / 2, 0);
    shape.lineTo(0, h);
    shape.lineTo(-d / 2, 0);
    const geometry = new THREE.ExtrudeGeometry(shape, { depth: w, bevelEnabled: false });
    geometry.translate(0, 0, -w / 2);
    geometry.rotateY(Math.PI / 2);
    return this.add(geometry, x, y, z, hex, options);
  }

  /** Merges everything into one geometry (or an empty one). */
  build(): THREE.BufferGeometry {
    if (this.pieces.length === 0) return emptyGeometry();
    const merged = mergeGeometries(this.pieces, false);
    for (const piece of this.pieces) piece.dispose();
    return merged;
  }
}

export function emptyGeometry(): THREE.BufferGeometry {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(9), 3));
  geometry.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(9), 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(new Float32Array(9), 3));
  geometry.setAttribute('team', new THREE.BufferAttribute(new Float32Array(3), 1));
  geometry.setAttribute('shine', new THREE.BufferAttribute(new Float32Array(3), 1));
  geometry.setAttribute('glow', new THREE.BufferAttribute(new Float32Array(3), 1));
  return geometry;
}

let grime: THREE.Texture | null = null;

/**
 * Metal-and-paint shading with vertex colours: the `team` attribute picks out the parts
 * tinted by each instance's colour, `shine` makes glass and polished metal glossy, `glow`
 * lights lamps from within, and a panel-and-grime texture is projected over everything.
 */
export function teamMaterial(
  options: THREE.MeshStandardMaterialParameters = {},
): THREE.MeshStandardMaterial {
  const material = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.62,
    metalness: 0.28,
    ...options,
  });
  grime ??= grimeTexture();
  const texture = grime;
  material.onBeforeCompile = (shader) => {
    shader.uniforms.grimeMap = { value: texture };
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
attribute float team;
attribute float shine;
attribute float glow;
varying float vShine;
varying float vGlow;
varying vec3 vGrimePos;
varying vec3 vGrimeNormal;`,
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
vShine = shine;
vGlow = glow;
vec4 grimeWorld = vec4( transformed, 1.0 );
vec3 grimeNormal = objectNormal;
#ifdef USE_INSTANCING
  grimeWorld = instanceMatrix * grimeWorld;
  grimeNormal = mat3( instanceMatrix ) * grimeNormal;
#endif
vGrimePos = ( modelMatrix * grimeWorld ).xyz;
vGrimeNormal = normalize( mat3( modelMatrix ) * grimeNormal );`,
      )
      .replace(
        '#include <color_vertex>',
        `#if defined( USE_COLOR ) || defined( USE_INSTANCING_COLOR )
  vColor = vec4( 1.0 );
#endif
#ifdef USE_COLOR
  vColor.rgb *= color;
#endif
#ifdef USE_INSTANCING_COLOR
  vColor.rgb *= mix( vec3( 1.0 ), instanceColor.rgb, team );
#endif`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
uniform sampler2D grimeMap;
varying float vShine;
varying float vGlow;
varying vec3 vGrimePos;
varying vec3 vGrimeNormal;`,
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
vec3 grimeBlend = abs( normalize( vGrimeNormal ) );
grimeBlend /= ( grimeBlend.x + grimeBlend.y + grimeBlend.z );
float grimeValue = texture2D( grimeMap, vGrimePos.zy * 0.55 ).r * grimeBlend.x
  + texture2D( grimeMap, vGrimePos.xz * 0.55 ).r * grimeBlend.y
  + texture2D( grimeMap, vGrimePos.xy * 0.55 ).r * grimeBlend.z;
diffuseColor.rgb *= mix( 1.0, grimeValue * 2.0, 0.55 * ( 1.0 - vGlow ) * ( 1.0 - 0.7 * vShine ) );`,
      )
      .replace(
        '#include <roughnessmap_fragment>',
        `#include <roughnessmap_fragment>
roughnessFactor = mix( roughnessFactor, 0.16, vShine );`,
      )
      .replace(
        '#include <metalnessmap_fragment>',
        `#include <metalnessmap_fragment>
metalnessFactor = mix( metalnessFactor, 0.75, vShine );`,
      )
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
totalEmissiveRadiance += diffuseColor.rgb * vGlow * 1.4;`,
      );
  };
  material.customProgramCacheKey = () => 'team-standard';
  return material;
}
