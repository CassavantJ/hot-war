import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

export interface ShapeOptions {
  /** Painted in the owner's colour. */
  team?: boolean;
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
    color.set(hex);
    for (let i = 0; i < count; i++) {
      colors[i * 3] = color.r;
      colors[i * 3 + 1] = color.g;
      colors[i * 3 + 2] = color.b;
      team[i] = options.team ? 1 : 0;
    }
    flat.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    flat.setAttribute('team', new THREE.BufferAttribute(team, 1));
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
    return this.add(new THREE.BoxGeometry(w, h, d), x, y, z, hex, options);
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
  return geometry;
}

/**
 * Lambert shading with vertex colours, where the `team` attribute picks out the parts
 * tinted by each instance's colour.
 */
export function teamMaterial(
  options: THREE.MeshLambertMaterialParameters = {},
): THREE.MeshLambertMaterial {
  const material = new THREE.MeshLambertMaterial({ vertexColors: true, ...options });
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float team;')
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
  };
  material.customProgramCacheKey = () => 'team';
  return material;
}
