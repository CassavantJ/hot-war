import type * as THREE from 'three';

import type { Theme } from '../sim/map';
import type { StructureType, UnitType } from '../sim/rules';
import { Shape } from './shapes';

/**
 * Every model in the game, made from simple solids. Units face +x; structures are centred
 * on their footprint. Parts that move (turrets, legs, radar dishes) are separate, each
 * with the point it turns about.
 */

export type PartName = 'hull' | 'turret' | 'legL' | 'legR' | 'spin' | 'rock';

export interface ModelPart {
  name: PartName;
  geometry: THREE.BufferGeometry;
  pivot: [number, number, number];
}

export interface Model {
  parts: ModelPart[];
}

const T = '#ffffff';
const TREAD = '#262626';
const WHEEL = '#1f1f1f';
const SKIN = '#e0b08a';
const CONCRETE = '#9a9a92';
const SLAB = '#7f817b';
const DARK = '#2e3238';
const WINDOW = '#1d2a36';

const ACCORD = {
  body: '#b3bdc7',
  dark: '#5b6672',
  trim: '#86949f',
  glass: '#8fd6ff',
  glow: '#79ecff',
  uniform: '#6f7f5a',
};

const BLOC = {
  body: '#6f7552',
  dark: '#464a33',
  trim: '#999a7c',
  glass: '#ffcf7a',
  glow: '#ff8a3d',
  uniform: '#6a5a44',
};

type Palette = typeof ACCORD;

function part(
  name: PartName,
  shape: Shape,
  pivot: [number, number, number] = [0, 0, 0],
): ModelPart {
  return { name, geometry: shape.build(), pivot };
}

// Infantry ---------------------------------------------------------------------------------

interface SoldierLook {
  uniform: string;
  trousers: string;
  helmet: string;
  gear?: (shape: Shape) => void;
  bulky?: boolean;
}

function soldier(look: SoldierLook): Model {
  const body = new Shape();
  const width = look.bulky ? 0.12 : 0.1;
  body
    .box(0.075, 0.12, width, 0, 0.2, 0, T, { team: true })
    .box(0.078, 0.03, width + 0.005, 0, 0.145, 0, look.trousers)
    .box(0.04, 0.03, 0.04, 0.005, 0.275, 0, SKIN)
    .sphere(0.036, 0.005, 0.305, 0, SKIN)
    .dome(0.042, 0.005, 0.31, 0, look.helmet, { sides: 8 })
    .box(0.03, 0.09, 0.03, 0.03, 0.2, 0.06, look.uniform)
    .box(0.03, 0.09, 0.03, 0.03, 0.2, -0.06, look.uniform);
  look.gear?.(body);
  const leg = () =>
    new Shape()
      .box(0.042, 0.14, 0.045, 0, -0.07, 0, look.trousers)
      .box(0.055, 0.02, 0.05, 0.008, -0.135, 0, '#2b2620');
  return {
    parts: [
      part('hull', body),
      part('legL', leg(), [0, 0.14, 0.025]),
      part('legR', leg(), [0, 0.14, -0.025]),
    ],
  };
}

const rifle = (shape: Shape) => shape.box(0.2, 0.025, 0.025, 0.09, 0.21, 0.035, '#2a2a2a');

function hound(): Model {
  const body = new Shape()
    .box(0.24, 0.08, 0.08, 0, 0.15, 0, '#6b5238')
    .box(0.09, 0.07, 0.065, 0.14, 0.19, 0, '#6b5238')
    .box(0.06, 0.035, 0.045, 0.2, 0.175, 0, '#4a3826')
    .box(0.02, 0.04, 0.02, 0.13, 0.23, 0.02, '#4a3826')
    .box(0.02, 0.04, 0.02, 0.13, 0.23, -0.02, '#4a3826')
    .box(0.03, 0.02, 0.085, 0.09, 0.19, 0, T, { team: true })
    .box(0.1, 0.02, 0.02, -0.15, 0.19, 0, '#6b5238', { rz: 0.5 });
  const legs = (offset: number) =>
    new Shape()
      .box(0.035, 0.12, 0.03, 0.08, -0.06, offset, '#5a4430')
      .box(0.035, 0.12, 0.03, -0.08, -0.06, -offset, '#5a4430');
  return {
    parts: [
      part('hull', body),
      part('legL', legs(0.03), [0, 0.12, 0]),
      part('legR', legs(-0.03), [0, 0.12, 0]),
    ],
  };
}

// Vehicles ---------------------------------------------------------------------------------

function treads(shape: Shape, length: number, width: number, height = 0.14): Shape {
  for (const side of [-1, 1]) {
    shape.box(length, height, 0.13, 0, height / 2 + 0.01, side * (width / 2), TREAD);
    shape.box(length * 0.92, 0.02, 0.135, 0, height + 0.012, side * (width / 2), '#3a3a3a');
  }
  return shape;
}

function wheels(shape: Shape, xs: number[], width: number, radius = 0.075): Shape {
  for (const x of xs) {
    for (const side of [-1, 1]) {
      shape.cylinder(radius, radius, 0.06, x, radius, side * (width / 2), WHEEL, {
        rx: Math.PI / 2,
        sides: 8,
      });
    }
  }
  return shape;
}

function lancer(): Model {
  const p = ACCORD;
  const hull = treads(new Shape(), 0.8, 0.42)
    .box(0.66, 0.13, 0.34, -0.02, 0.2, 0, p.body)
    .wedge(0.16, 0.1, 0.34, 0.37, 0.135, 0, p.body, { ry: Math.PI })
    .box(0.24, 0.015, 0.345, -0.18, 0.272, 0, T, { team: true });
  const turret = new Shape()
    .box(0.3, 0.1, 0.26, -0.02, 0.05, 0, p.trim)
    .wedge(0.08, 0.08, 0.26, 0.17, 0.01, 0, p.trim, { ry: Math.PI })
    .tube(0.024, 0.4, 0.33, 0.06, 0, p.dark, { sides: 6 })
    .box(0.12, 0.02, 0.18, -0.07, 0.108, 0, T, { team: true });
  return { parts: [part('hull', hull), part('turret', turret, [0, 0.27, 0])] };
}

function bear(): Model {
  const p = BLOC;
  const hull = treads(new Shape(), 0.88, 0.48, 0.16)
    .box(0.74, 0.15, 0.4, -0.02, 0.23, 0, p.body)
    .wedge(0.18, 0.12, 0.4, 0.42, 0.155, 0, p.body, { ry: Math.PI })
    .box(0.12, 0.08, 0.36, -0.38, 0.27, 0, p.dark)
    .box(0.2, 0.015, 0.41, -0.2, 0.31, 0, T, { team: true });
  const turret = new Shape()
    .cylinder(0.17, 0.19, 0.12, -0.02, 0.06, 0, p.trim, { sides: 8 })
    .tube(0.032, 0.48, 0.34, 0.07, 0, p.dark, { sides: 6 })
    .tube(0.045, 0.08, 0.56, 0.07, 0, p.dark, { sides: 6 })
    .box(0.1, 0.03, 0.12, -0.05, 0.135, 0, T, { team: true });
  return { parts: [part('hull', hull), part('turret', turret, [0, 0.31, 0])] };
}

function behemoth(): Model {
  const p = BLOC;
  const hull = new Shape();
  treads(hull, 1.02, 0.66, 0.18);
  treads(hull, 1.0, 0.36, 0.16);
  hull
    .box(0.9, 0.18, 0.56, -0.02, 0.27, 0, p.body)
    .wedge(0.2, 0.14, 0.56, 0.52, 0.18, 0, p.body, { ry: Math.PI })
    .box(0.3, 0.02, 0.57, -0.25, 0.37, 0, T, { team: true });
  const turret = new Shape()
    .box(0.46, 0.16, 0.4, -0.04, 0.08, 0, p.trim)
    .tube(0.034, 0.56, 0.44, 0.08, 0.07, p.dark, { sides: 6 })
    .tube(0.034, 0.56, 0.44, 0.08, -0.07, p.dark, { sides: 6 })
    .box(0.24, 0.1, 0.1, -0.05, 0.11, 0.25, p.dark)
    .box(0.24, 0.1, 0.1, -0.05, 0.11, -0.25, p.dark)
    .box(0.02, 0.07, 0.08, 0.075, 0.11, 0.25, '#b0413e')
    .box(0.02, 0.07, 0.08, 0.075, 0.11, -0.25, '#b0413e')
    .box(0.18, 0.02, 0.3, -0.1, 0.17, 0, T, { team: true });
  return { parts: [part('hull', hull), part('turret', turret, [0, 0.37, 0])] };
}

function striker(): Model {
  const p = ACCORD;
  const hull = wheels(new Shape(), [-0.24, 0, 0.24], 0.38)
    .box(0.7, 0.14, 0.34, 0, 0.19, 0, p.body)
    .wedge(0.18, 0.1, 0.34, 0.4, 0.12, 0, p.body, { ry: Math.PI })
    .box(0.16, 0.015, 0.35, 0.15, 0.265, 0, T, { team: true });
  const turret = new Shape()
    .cylinder(0.1, 0.12, 0.05, 0, 0.025, 0, p.dark)
    .box(0.24, 0.12, 0.24, -0.02, 0.1, 0, p.trim)
    .box(0.01, 0.035, 0.035, 0.105, 0.12, 0.05, DARK)
    .box(0.01, 0.035, 0.035, 0.105, 0.12, -0.05, DARK)
    .box(0.01, 0.035, 0.035, 0.105, 0.08, 0.05, DARK)
    .box(0.01, 0.035, 0.035, 0.105, 0.08, -0.05, DARK)
    .box(0.12, 0.015, 0.25, -0.06, 0.165, 0, T, { team: true });
  return { parts: [part('hull', hull), part('turret', turret, [-0.08, 0.26, 0])] };
}

function beamtank(): Model {
  const p = ACCORD;
  const hull = treads(new Shape(), 0.76, 0.4)
    .box(0.64, 0.12, 0.32, -0.02, 0.19, 0, p.body)
    .wedge(0.14, 0.09, 0.32, 0.36, 0.13, 0, p.body, { ry: Math.PI })
    .box(0.2, 0.015, 0.33, -0.2, 0.255, 0, T, { team: true });
  const turret = new Shape()
    .cylinder(0.14, 0.16, 0.08, 0, 0.04, 0, p.trim, { sides: 6 })
    .cylinder(0.05, 0.05, 0.08, 0, 0.12, 0, p.dark, { sides: 6 })
    .crystal(0.12, 0, 0.26, 0, p.glass, { sy: 1.4 })
    .box(0.08, 0.02, 0.2, -0.1, 0.085, 0, T, { team: true });
  return { parts: [part('hull', hull), part('turret', turret, [0, 0.25, 0])] };
}

function flaktruck(): Model {
  const p = BLOC;
  const hull = wheels(new Shape(), [-0.24, 0.24], 0.38, 0.08)
    .box(0.2, 0.18, 0.34, 0.26, 0.2, 0, p.body)
    .box(0.03, 0.08, 0.3, 0.365, 0.24, 0, WINDOW)
    .box(0.5, 0.08, 0.36, -0.1, 0.15, 0, p.dark)
    .box(0.18, 0.015, 0.345, 0.26, 0.295, 0, T, { team: true });
  const turret = new Shape()
    .cylinder(0.13, 0.14, 0.06, 0, 0.03, 0, p.trim)
    .box(0.14, 0.1, 0.18, 0, 0.1, 0, p.trim)
    .tube(0.018, 0.32, 0.12, 0.2, 0.04, p.dark, { rz: 0.7, sides: 5 })
    .tube(0.018, 0.32, 0.12, 0.2, -0.04, p.dark, { rz: 0.7, sides: 5 })
    .box(0.08, 0.015, 0.19, -0.03, 0.155, 0, T, { team: true });
  return { parts: [part('hull', hull), part('turret', turret, [-0.12, 0.19, 0])] };
}

function rockettruck(): Model {
  const p = BLOC;
  const hull = wheels(new Shape(), [-0.28, 0, 0.28], 0.4, 0.08)
    .box(0.22, 0.2, 0.34, 0.33, 0.21, 0, p.body)
    .box(0.03, 0.08, 0.3, 0.445, 0.25, 0, WINDOW)
    .box(0.62, 0.07, 0.36, -0.1, 0.15, 0, p.dark)
    .box(0.6, 0.04, 0.12, -0.12, 0.25, 0, p.trim, { rz: 0.35 })
    .tube(0.055, 0.5, -0.12, 0.33, 0, '#c9c3b0', { rz: 0.35, end: 0.055, sides: 8 })
    .cone(0.055, 0.14, 0.16, 0.43, 0, '#b0413e', { rz: 0.35 - Math.PI / 2, sides: 8 })
    .box(0.2, 0.015, 0.345, 0.33, 0.315, 0, T, { team: true });
  return { parts: [part('hull', hull)] };
}

function oretruck(): Model {
  const p = ACCORD;
  const hull = treads(new Shape(), 0.86, 0.46, 0.15)
    .box(0.78, 0.26, 0.42, -0.02, 0.28, 0, p.body)
    .box(0.18, 0.12, 0.38, 0.3, 0.46, 0, p.trim)
    .box(0.02, 0.06, 0.32, 0.395, 0.46, 0, WINDOW)
    .cylinder(0.14, 0.14, 0.04, -0.16, 0.44, 0, p.glow, { sides: 10 })
    .cylinder(0.1, 0.1, 0.12, -0.16, 0.5, 0, p.dark, { sides: 10 })
    .box(0.44, 0.02, 0.43, -0.12, 0.41, 0, T, { team: true })
    .box(0.1, 0.18, 0.43, 0.38, 0.22, 0, p.dark);
  return { parts: [part('hull', hull)] };
}

function orehauler(): Model {
  const p = BLOC;
  const hull = treads(new Shape(), 0.96, 0.6, 0.17)
    .box(0.86, 0.24, 0.54, -0.04, 0.3, 0, p.body)
    .box(0.4, 0.14, 0.48, -0.2, 0.49, 0, p.dark)
    .box(0.2, 0.16, 0.3, 0.26, 0.5, 0.08, p.trim)
    .box(0.02, 0.06, 0.24, 0.365, 0.52, 0.08, WINDOW)
    .wedge(0.2, 0.2, 0.56, 0.52, 0.04, 0, '#595a4a', { ry: Math.PI })
    .box(0.4, 0.02, 0.55, -0.2, 0.425, 0, T, { team: true });
  const turret = new Shape()
    .box(0.1, 0.06, 0.08, 0, 0.03, 0, p.dark)
    .tube(0.012, 0.16, 0.1, 0.035, 0, DARK, { sides: 5 });
  return { parts: [part('hull', hull), part('turret', turret, [0.22, 0.58, -0.14])] };
}

function basetruck(): Model {
  const hull = wheels(new Shape(), [-0.4, -0.2, 0.25, 0.42], 0.5, 0.1)
    .box(0.26, 0.26, 0.46, 0.42, 0.28, 0, '#8c9399')
    .box(0.03, 0.1, 0.38, 0.555, 0.33, 0, WINDOW)
    .box(0.82, 0.08, 0.5, -0.1, 0.18, 0, DARK)
    .box(0.6, 0.3, 0.46, -0.18, 0.37, 0, '#c4c7c2')
    .box(0.6, 0.04, 0.47, -0.18, 0.54, 0, T, { team: true })
    .box(0.04, 0.4, 0.04, 0.2, 0.52, 0.16, '#d8a41c')
    .box(0.5, 0.04, 0.04, -0.03, 0.72, 0.16, '#d8a41c', { rz: -0.15 })
    .box(0.26, 0.015, 0.465, 0.42, 0.415, 0, T, { team: true });
  return { parts: [part('hull', hull)] };
}

function falcon(): Model {
  const p = ACCORD;
  const hull = new Shape()
    .tube(0.06, 0.62, -0.02, 0, 0, p.body, { end: 0.045, sides: 8 })
    .cone(0.045, 0.18, 0.38, 0, 0, p.dark, { rz: -Math.PI / 2, sides: 8 })
    .box(0.1, 0.03, 0.06, 0.14, 0.05, 0, p.glass)
    .box(0.26, 0.015, 0.78, -0.06, -0.005, 0, p.trim)
    .box(0.1, 0.017, 0.14, -0.1, 0.0, 0.34, T, { team: true })
    .box(0.1, 0.017, 0.14, -0.1, 0.0, -0.34, T, { team: true })
    .box(0.12, 0.012, 0.3, -0.3, 0.0, 0, p.trim)
    .box(0.12, 0.14, 0.012, -0.3, 0.07, 0, T, { team: true, rz: 0.4 });
  return { parts: [part('hull', hull)] };
}

function dirigible(): Model {
  const p = BLOC;
  const hull = new Shape()
    .sphere(0.5, 0, 0, 0, '#8a8d74', { sx: 2.1, sy: 0.85, sz: 0.85, detail: 1 })
    .box(0.4, 0.06, 0.88, 0.1, 0, 0, T, { team: true })
    .box(0.55, 0.16, 0.24, 0.1, -0.46, 0, p.dark)
    .box(0.45, 0.04, 0.2, 0.1, -0.56, 0, '#b0413e')
    .box(0.3, 0.02, 0.5, -0.95, 0, 0, p.body)
    .box(0.3, 0.5, 0.02, -0.95, 0.05, 0, p.body)
    .box(0.12, 0.08, 0.3, 0.3, -0.36, 0, p.dark);
  const rotor = new Shape()
    .box(0.02, 0.36, 0.04, 0, 0, 0, DARK)
    .box(0.02, 0.04, 0.36, 0, 0, 0, DARK)
    .cylinder(0.03, 0.03, 0.06, 0, 0, 0, p.trim, { rz: Math.PI / 2 });
  return { parts: [part('hull', hull), part('spin', rotor, [-1.12, -0.12, 0])] };
}

// Ships ------------------------------------------------------------------------------------

/** A hull at the waterline: a long box with a pointed bow towards +x. */
function hull(shape: Shape, length: number, width: number, height: number, hex: string): Shape {
  const body = length * 0.72;
  const front = -length * 0.14 + body / 2;
  const r = width / Math.sqrt(3);
  const stretch = (length - body) / (1.5 * r);
  return shape
    .box(body, height, width, -length * 0.14, height / 2 - 0.04, 0, hex)
    .cylinder(r, r, height, front + (r * stretch) / 2, height / 2 - 0.04, 0, hex, {
      sides: 3,
      ry: Math.PI / 2,
      sz: stretch,
    })
    .box(body, 0.02, width * 0.9, -length * 0.14, height - 0.03, 0, '#6d6a62');
}

function frigate(): Model {
  const p = ACCORD;
  const shape = hull(new Shape(), 1.15, 0.34, 0.16, p.dark)
    .box(0.34, 0.16, 0.24, -0.12, 0.2, 0, p.body)
    .box(0.12, 0.06, 0.18, -0.05, 0.31, 0, p.glass)
    .cylinder(0.015, 0.015, 0.34, -0.2, 0.42, 0, '#9a9a9a')
    .box(0.02, 0.02, 0.14, -0.2, 0.52, 0, '#9a9a9a')
    .box(0.36, 0.02, 0.345, -0.12, 0.285, 0, T, { team: true })
    .box(0.1, 0.06, 0.16, -0.42, 0.15, 0, p.trim);
  const turret = new Shape()
    .cylinder(0.08, 0.09, 0.07, 0, 0.035, 0, p.trim)
    .tube(0.018, 0.24, 0.13, 0.05, 0, p.dark, { sides: 6 })
    .box(0.06, 0.015, 0.1, -0.02, 0.075, 0, T, { team: true });
  return { parts: [part('hull', shape), part('turret', turret, [0.28, 0.12, 0])] };
}

function cruiser(): Model {
  const p = ACCORD;
  const shape = hull(new Shape(), 1.35, 0.38, 0.18, p.dark)
    .box(0.44, 0.2, 0.28, -0.18, 0.24, 0, p.body)
    .box(0.2, 0.08, 0.22, -0.16, 0.38, 0, p.body)
    .box(0.14, 0.05, 0.2, -0.1, 0.36, 0, p.glass)
    .cylinder(0.05, 0.05, 0.03, -0.3, 0.44, 0, p.trim, { sides: 10 })
    .box(0.46, 0.02, 0.29, -0.18, 0.345, 0, T, { team: true })
    .box(0.14, 0.08, 0.24, -0.52, 0.2, 0, p.trim);
  const turret = new Shape()
    .box(0.18, 0.1, 0.18, 0, 0.05, 0, p.trim)
    .box(0.01, 0.03, 0.03, 0.09, 0.07, 0.05, DARK)
    .box(0.01, 0.03, 0.03, 0.09, 0.07, -0.05, DARK)
    .box(0.01, 0.03, 0.03, 0.09, 0.07, 0, DARK)
    .box(0.1, 0.015, 0.19, -0.03, 0.105, 0, T, { team: true });
  return { parts: [part('hull', shape), part('turret', turret, [0.3, 0.14, 0])] };
}

function monitor(): Model {
  const p = ACCORD;
  const shape = hull(new Shape(), 1.55, 0.5, 0.2, p.dark)
    .box(0.36, 0.26, 0.34, -0.36, 0.28, 0, p.body)
    .box(0.18, 0.06, 0.26, -0.3, 0.44, 0, p.glass)
    .box(0.38, 0.02, 0.35, -0.36, 0.415, 0, T, { team: true })
    .cylinder(0.04, 0.05, 0.3, -0.6, 0.35, 0, '#5a5a5a');
  const turret = new Shape()
    .cylinder(0.17, 0.19, 0.14, 0, 0.07, 0, p.trim, { sides: 8 })
    .tube(0.035, 0.52, 0.34, 0.08, 0.06, p.dark, { sides: 6 })
    .tube(0.035, 0.52, 0.34, 0.08, -0.06, p.dark, { sides: 6 })
    .box(0.14, 0.02, 0.2, -0.04, 0.145, 0, T, { team: true });
  return { parts: [part('hull', shape), part('turret', turret, [0.22, 0.16, 0])] };
}

function sub(): Model {
  const shape = new Shape()
    .tube(0.13, 1.0, 0, 0.02, 0, '#3a3e3a', { sides: 10, end: 0.13 })
    .cone(0.13, 0.22, 0.61, 0.02, 0, '#3a3e3a', { rz: -Math.PI / 2, sides: 10 })
    .cone(0.13, 0.18, -0.59, 0.02, 0, '#3a3e3a', { rz: Math.PI / 2, sides: 10 })
    .box(0.24, 0.16, 0.1, 0.05, 0.2, 0, '#42463f')
    .box(0.26, 0.03, 0.11, 0.05, 0.27, 0, T, { team: true })
    .box(0.1, 0.02, 0.36, 0.08, 0.22, 0, '#42463f')
    .box(0.02, 0.14, 0.02, 0.1, 0.34, 0, '#6a6a6a')
    .box(0.12, 0.12, 0.02, -0.66, 0.06, 0, '#42463f');
  return { parts: [part('hull', shape)] };
}

function flakboat(): Model {
  const p = BLOC;
  const shape = hull(new Shape(), 0.85, 0.28, 0.13, p.dark)
    .box(0.2, 0.12, 0.18, -0.16, 0.17, 0, p.body)
    .box(0.03, 0.05, 0.15, -0.055, 0.19, 0, WINDOW)
    .box(0.22, 0.02, 0.19, -0.16, 0.24, 0, T, { team: true });
  const turret = new Shape()
    .cylinder(0.06, 0.07, 0.05, 0, 0.025, 0, p.trim)
    .tube(0.012, 0.2, 0.08, 0.1, 0.03, DARK, { rz: 0.7, sides: 5 })
    .tube(0.012, 0.2, 0.08, 0.1, -0.03, DARK, { rz: 0.7, sides: 5 });
  return { parts: [part('hull', shape), part('turret', turret, [0.16, 0.11, 0])] };
}

function missileship(): Model {
  const p = BLOC;
  const shape = hull(new Shape(), 1.6, 0.52, 0.2, p.dark)
    .box(0.34, 0.28, 0.36, -0.46, 0.3, 0, p.body)
    .box(0.36, 0.02, 0.37, -0.46, 0.45, 0, T, { team: true })
    .box(0.03, 0.08, 0.3, -0.28, 0.38, 0, WINDOW)
    .cylinder(0.05, 0.06, 0.32, -0.66, 0.36, 0.1, '#5a5a52')
    .box(0.5, 0.06, 0.16, 0.08, 0.22, 0.1, p.trim, { rz: 0.35 })
    .box(0.5, 0.06, 0.16, 0.08, 0.22, -0.1, p.trim, { rz: 0.35 })
    .tube(0.05, 0.42, 0.08, 0.3, 0.1, '#c9c3b0', { rz: 0.35, sides: 8 })
    .tube(0.05, 0.42, 0.08, 0.3, -0.1, '#c9c3b0', { rz: 0.35, sides: 8 })
    .cone(0.05, 0.12, 0.3, 0.39, 0.1, '#b0413e', { rz: 0.35 - Math.PI / 2, sides: 8 })
    .cone(0.05, 0.12, 0.3, 0.39, -0.1, '#b0413e', { rz: 0.35 - Math.PI / 2, sides: 8 });
  return { parts: [part('hull', shape)] };
}

function hovercraft(): Model {
  const shape = new Shape()
    .cylinder(0.42, 0.44, 0.1, 0, 0.06, 0, '#1f1f1f', { sides: 12, sx: 1.4 })
    .box(0.9, 0.1, 0.56, 0, 0.16, 0, '#8c9399')
    .box(0.9, 0.02, 0.57, 0, 0.215, 0, T, { team: true })
    .box(0.22, 0.14, 0.3, 0.24, 0.28, 0, '#a7adb2')
    .box(0.02, 0.06, 0.24, 0.35, 0.3, 0, WINDOW)
    .box(0.1, 0.16, 0.48, -0.38, 0.3, 0, '#6d737a');
  const fan = new Shape().box(0.02, 0.26, 0.04, 0, 0, 0, DARK).box(0.02, 0.04, 0.26, 0, 0, 0, DARK);
  return { parts: [part('hull', shape), part('spin', fan, [-0.44, 0.3, 0])] };
}

const UNIT_MODELS: Record<UnitType, () => Model> = {
  rifleman: () =>
    soldier({ uniform: ACCORD.uniform, trousers: '#4d5a3c', helmet: '#56643f', gear: rifle }),
  draftee: () =>
    soldier({
      uniform: BLOC.uniform,
      trousers: '#4a3f30',
      helmet: '#5b4a33',
      gear: (shape) => shape.box(0.14, 0.03, 0.03, 0.07, 0.21, 0.035, '#2a2a2a'),
    }),
  engineer: () =>
    soldier({
      uniform: '#5a5f66',
      trousers: '#3e434a',
      helmet: '#e3c02f',
      gear: (shape) => shape.box(0.07, 0.06, 0.04, 0.02, 0.2, -0.075, '#b43a2a'),
    }),
  skyjumper: () =>
    soldier({
      uniform: ACCORD.uniform,
      trousers: '#4d5a3c',
      helmet: '#3c4a5c',
      gear: (shape) => {
        rifle(shape);
        shape
          .box(0.05, 0.1, 0.09, -0.065, 0.21, 0, '#7c8894')
          .cylinder(0.02, 0.025, 0.06, -0.07, 0.14, 0.03, '#3a3a3a')
          .cylinder(0.02, 0.025, 0.06, -0.07, 0.14, -0.03, '#3a3a3a');
      },
    }),
  commando: () =>
    soldier({
      uniform: '#2f3a2a',
      trousers: '#232a20',
      helmet: '#1f1f1f',
      gear: (shape) =>
        shape
          .box(0.07, 0.02, 0.02, 0.06, 0.2, 0.065, '#1a1a1a')
          .box(0.07, 0.02, 0.02, 0.06, 0.2, -0.065, '#1a1a1a')
          .box(0.04, 0.02, 0.11, 0.0, 0.33, 0, '#8b1d1d'),
    }),
  flakgunner: () =>
    soldier({
      uniform: BLOC.uniform,
      trousers: '#4a3f30',
      helmet: '#5b4a33',
      gear: (shape) => shape.tube(0.03, 0.26, 0.02, 0.27, -0.055, '#3d4230', { rz: 0.25 }),
    }),
  torch: () =>
    soldier({
      uniform: '#3b3530',
      trousers: '#2c2825',
      helmet: '#2a2a2a',
      bulky: true,
      gear: (shape) =>
        shape
          .cylinder(0.035, 0.035, 0.12, -0.07, 0.21, 0.03, '#b4462c')
          .cylinder(0.035, 0.035, 0.12, -0.07, 0.21, -0.03, '#b4462c')
          .box(0.16, 0.025, 0.025, 0.08, 0.19, 0.04, '#3a3a3a')
          .box(0.04, 0.04, 0.12, 0.02, 0.31, 0, '#6a7a6a'),
    }),
  hound,
  lancer,
  striker,
  beamtank,
  oretruck,
  falcon,
  bear,
  flaktruck,
  rockettruck,
  behemoth,
  orehauler,
  dirigible,
  basetruck,
  frigate,
  cruiser,
  monitor,
  sub,
  flakboat,
  missileship,
  hovercraft,
};

// Structures ---------------------------------------------------------------------------------

function slab(shape: Shape, w: number, h: number): Shape {
  return shape.box(w - 0.06, 0.06, h - 0.06, 0, 0.03, 0, SLAB);
}

function windows(
  shape: Shape,
  x: number,
  y: number,
  z: number,
  count: number,
  spacing: number,
  facing: 'x' | 'z',
): Shape {
  for (let i = 0; i < count; i++) {
    const offset = (i - (count - 1) / 2) * spacing;
    if (facing === 'z') shape.box(0.14, 0.12, 0.02, x + offset, y, z, WINDOW);
    else shape.box(0.02, 0.12, 0.14, x, y, z + offset, WINDOW);
  }
  return shape;
}

function flag(shape: Shape, x: number, y: number, z: number, height = 0.7): Shape {
  return shape
    .cylinder(0.015, 0.015, height, x, y + height / 2, z, '#d8d8d8', { sides: 5 })
    .box(0.24, 0.14, 0.01, x + 0.13, y + height - 0.08, z, T, { team: true });
}

function accordHq(): Model {
  const p = ACCORD;
  const hull = slab(new Shape(), 4, 4)
    .box(2.8, 0.62, 2.2, -0.35, 0.37, -0.3, p.body)
    .box(2.82, 0.06, 2.22, -0.35, 0.7, -0.3, p.trim)
    .box(2.84, 0.08, 0.14, -0.35, 0.7, 0.8, T, { team: true })
    .box(0.14, 0.08, 2.24, -1.76, 0.7, -0.3, T, { team: true })
    .box(1.0, 1.35, 1.0, 1.0, 0.73, 0.9, p.body)
    .box(1.02, 0.18, 1.02, 1.0, 1.1, 0.9, p.glass)
    .box(1.04, 0.06, 1.04, 1.0, 1.44, 0.9, T, { team: true })
    .box(0.8, 0.5, 0.9, -1.1, 0.95, -0.4, p.trim)
    .box(0.12, 1.3, 0.12, 1.55, 1.1, -1.4, '#d8a41c')
    .box(1.6, 0.08, 0.08, 1.0, 1.72, -1.4, '#d8a41c', { ry: 0.5 })
    .cylinder(0.3, 0.3, 0.04, -1.2, 0.72, 1.2, '#4f5760', { sides: 12 })
    .box(0.3, 0.02, 0.06, -1.2, 0.75, 1.2, '#e8e8e8');
  windows(hull, -0.35, 0.4, 0.81, 6, 0.4, 'z');
  flag(hull, 1.65, 0.06, 1.65);
  return { parts: [part('hull', hull)] };
}

function blocHq(): Model {
  const p = BLOC;
  const hull = slab(new Shape(), 4, 4)
    .box(3.0, 0.62, 2.8, -0.2, 0.37, -0.2, p.body)
    .box(2.0, 0.5, 1.8, -0.4, 0.93, -0.4, p.trim)
    .box(0.8, 0.9, 0.8, 1.0, 1.1, -1.0, p.body)
    .box(0.82, 0.1, 0.82, 1.0, 1.55, -1.0, T, { team: true })
    .box(3.02, 0.06, 2.82, -0.2, 0.7, -0.2, p.dark)
    .box(3.04, 0.08, 0.14, -0.2, 0.71, 1.2, T, { team: true })
    .box(0.14, 0.08, 2.84, -1.71, 0.71, -0.2, T, { team: true })
    .cylinder(0.12, 0.14, 0.9, -1.2, 1.4, -1.2, '#5a5a52')
    .box(0.6, 0.3, 0.6, 1.3, 0.2, 1.3, p.dark);
  windows(hull, -0.2, 0.42, 1.21, 7, 0.36, 'z');
  flag(hull, 0.2, 1.18, 0.3, 0.6);
  return { parts: [part('hull', hull)] };
}

function fusionPlant(): Model {
  const p = ACCORD;
  const hull = slab(new Shape(), 2, 2)
    .cylinder(0.7, 0.72, 0.5, -0.1, 0.3, -0.1, p.body, { sides: 12 })
    .cylinder(0.74, 0.74, 0.07, -0.1, 0.5, -0.1, p.glow, { sides: 12 })
    .dome(0.62, -0.1, 0.55, -0.1, p.glass, { sides: 12 })
    .box(0.4, 0.36, 0.4, 0.62, 0.24, 0.62, p.trim)
    .box(0.42, 0.04, 0.42, 0.62, 0.44, 0.62, T, { team: true });
  return { parts: [part('hull', hull)] };
}

function reactor(): Model {
  const p = BLOC;
  const hull = slab(new Shape(), 2, 2)
    .cylinder(0.36, 0.56, 1.3, -0.25, 0.7, -0.25, '#a3a399', { sides: 12 })
    .cylinder(0.37, 0.37, 0.06, -0.25, 1.33, -0.25, T, { team: true, sides: 12 })
    .box(0.7, 0.5, 0.6, 0.45, 0.28, 0.5, p.body)
    .box(0.72, 0.05, 0.62, 0.45, 0.55, 0.5, T, { team: true })
    .tube(0.06, 0.6, 0.2, 0.3, 0.1, '#6a6a60', { ry: 0.8 });
  return { parts: [part('hull', hull)] };
}

function refinery(p: Palette): Model {
  const hull = slab(new Shape(), 3, 3)
    .cylinder(0.42, 0.42, 1.2, -0.8, 0.66, -0.8, p.trim, { sides: 10 })
    .cylinder(0.42, 0.42, 1.0, 0.2, 0.56, -0.9, p.trim, { sides: 10 })
    .dome(0.42, -0.8, 1.26, -0.8, p.body, { sides: 10 })
    .dome(0.42, 0.2, 1.06, -0.9, p.body, { sides: 10 })
    .box(1.4, 0.7, 1.2, 0.5, 0.41, 0.5, p.body)
    .box(1.42, 0.06, 1.22, 0.5, 0.78, 0.5, T, { team: true })
    .box(0.6, 0.12, 0.9, 0.0, 0.2, 1.2, p.dark, { rx: 0.2 })
    .box(0.9, 0.03, 0.9, 0.0, 0.02, 1.95, '#4b4d50')
    .box(0.9, 0.035, 0.08, 0.0, 0.025, 1.52, '#d8b41c')
    .box(0.9, 0.035, 0.08, 0.0, 0.025, 2.38, '#d8b41c');
  windows(hull, 0.5, 0.45, 1.11, 3, 0.4, 'z');
  return { parts: [part('hull', hull)] };
}

function accordBarracks(): Model {
  const p = ACCORD;
  const hull = slab(new Shape(), 2, 2)
    .cylinder(0.6, 0.6, 1.5, -0.1, 0.05, 0, p.trim, { rz: Math.PI / 2, sides: 10 })
    .box(0.02, 0.4, 0.4, 0.66, 0.3, 0, p.dark)
    .box(0.04, 0.46, 0.08, 0.66, 0.3, 0.23, T, { team: true })
    .box(0.04, 0.46, 0.08, 0.66, 0.3, -0.23, T, { team: true })
    .box(1.5, 0.05, 0.16, -0.1, 0.64, 0, T, { team: true })
    .box(0.18, 0.12, 0.02, -0.4, 0.3, 0.55, WINDOW)
    .box(0.18, 0.12, 0.02, 0.1, 0.3, 0.55, WINDOW);
  flag(hull, 0.75, 0.06, 0.75);
  return { parts: [part('hull', hull)] };
}

function blocBarracks(): Model {
  const p = BLOC;
  const hull = slab(new Shape(), 2, 2)
    .box(1.4, 0.7, 1.2, -0.1, 0.41, -0.1, p.body)
    .box(1.44, 0.08, 1.24, -0.1, 0.79, -0.1, T, { team: true })
    .box(0.3, 0.4, 0.04, 0.2, 0.26, 0.51, DARK)
    .cylinder(0.3, 0.3, 0.16, -0.55, 0.14, 0.6, '#b8a57a', { sides: 6 })
    .cylinder(0.3, 0.3, 0.16, 0.55, 0.14, 0.62, '#b8a57a', { sides: 6 });
  windows(hull, -0.1, 0.5, 0.51, 2, 0.6, 'z');
  flag(hull, -0.75, 0.83, -0.65, 0.5);
  return { parts: [part('hull', hull)] };
}

function motorPool(): Model {
  const p = ACCORD;
  const hull = slab(new Shape(), 3, 3)
    .box(2.6, 0.6, 2.2, 0, 0.36, -0.2, p.body)
    .cylinder(1.1, 1.1, 2.6, 0, 0.6, -0.2, p.trim, { rz: Math.PI / 2, sides: 12, sz: 0.55 })
    .box(1.2, 0.6, 0.04, 0, 0.36, 0.91, DARK)
    .box(1.36, 0.1, 0.06, 0, 0.72, 0.91, T, { team: true })
    .box(0.06, 0.66, 0.06, 0.65, 0.36, 0.91, T, { team: true })
    .box(0.06, 0.66, 0.06, -0.65, 0.36, 0.91, T, { team: true })
    .box(0.8, 0.02, 0.5, 0, 0.02, 1.2, '#4b4d50');
  return { parts: [part('hull', hull)] };
}

function tankWorks(): Model {
  const p = BLOC;
  const hull = slab(new Shape(), 3, 3).box(2.7, 0.9, 2.3, 0, 0.51, -0.2, p.body);
  for (let i = 0; i < 4; i++) {
    hull.wedge(0.64, 0.35, 2.3, -1.0 + i * 0.66, 0.96, -0.2, i % 2 ? p.trim : '#8a8c70');
  }
  hull
    .box(1.3, 0.7, 0.04, 0, 0.41, 0.96, DARK)
    .box(1.4, 0.12, 0.06, 0, 0.82, 0.96, T, { team: true })
    .cylinder(0.12, 0.14, 1.0, 1.1, 1.3, -1.0, '#5a5a52')
    .cylinder(0.12, 0.14, 0.8, 0.75, 1.2, -1.05, '#5a5a52')
    .box(0.8, 0.02, 0.5, 0, 0.02, 1.25, '#4b4d50');
  return { parts: [part('hull', hull)] };
}

function airCommand(): Model {
  const p = ACCORD;
  const hull = slab(new Shape(), 3, 3)
    .box(2.8, 1.1, 2.8, 0, 0.6, 0, p.body)
    .box(2.82, 0.06, 2.82, 0, 1.12, 0, p.trim);
  for (const [x, z] of [
    [-0.75, -0.75],
    [0.75, -0.75],
    [-0.75, 0.75],
    [0.75, 0.75],
  ] as const) {
    hull
      .box(1.1, 0.03, 1.1, x, 1.16, z, '#4f5760')
      .box(0.5, 0.035, 0.08, x, 1.18, z, T, { team: true })
      .box(0.08, 0.036, 0.5, x, 1.18, z, T, { team: true });
  }
  windows(hull, 0, 0.6, 1.41, 5, 0.45, 'z');
  hull.dome(0.25, 1.3, 1.15, -1.3, p.glass);
  return { parts: [part('hull', hull)] };
}

function radarMast(): Model {
  const p = BLOC;
  const hull = slab(new Shape(), 2, 2)
    .box(1.0, 0.4, 1.0, 0.3, 0.26, 0.3, p.body)
    .box(1.02, 0.05, 1.02, 0.3, 0.48, 0.3, T, { team: true });
  for (const [x, z] of [
    [-0.55, -0.55],
    [-0.15, -0.55],
    [-0.55, -0.15],
    [-0.15, -0.15],
  ] as const) {
    hull.box(0.05, 1.9, 0.05, x, 0.98, z, '#6b6b63');
  }
  for (let y = 0.4; y < 1.9; y += 0.4) hull.box(0.46, 0.04, 0.46, -0.35, y, -0.35, '#6b6b63');
  const dish = new Shape()
    .cylinder(0.04, 0.04, 0.2, 0, 0.1, 0, DARK)
    .dome(0.36, 0.08, 0.28, 0, '#c9c9bd', { rz: Math.PI / 2, sides: 10, sy: 0.4 })
    .box(0.24, 0.03, 0.03, 0.2, 0.28, 0, DARK);
  return { parts: [part('hull', hull), part('spin', dish, [-0.35, 1.95, -0.35])] };
}

function repairBay(p: Palette): Model {
  const hull = new Shape()
    .box(2.9, 0.06, 2.9, 0, 0.03, 0, '#5c5f63')
    .box(1.6, 0.065, 1.6, 0, 0.035, 0, '#4a4d51')
    .box(1.7, 0.07, 0.08, 0, 0.04, 0.84, '#d8b41c')
    .box(1.7, 0.07, 0.08, 0, 0.04, -0.84, '#d8b41c')
    .box(0.3, 1.1, 0.3, -1.25, 0.58, -1.25, p.body)
    .box(0.3, 1.1, 0.3, 1.25, 0.58, -1.25, p.body)
    .box(2.8, 0.18, 0.24, 0, 1.2, -1.25, p.trim)
    .box(0.12, 0.5, 0.12, 0.2, 0.9, -1.0, '#d8a41c')
    .box(2.82, 0.05, 0.25, 0, 1.3, -1.25, T, { team: true })
    .box(0.5, 0.4, 0.5, -1.15, 0.23, 1.15, p.dark);
  return { parts: [part('hull', hull)] };
}

function lab(p: Palette, accord: boolean): Model {
  const hull = slab(new Shape(), 3, 3);
  if (accord) {
    hull
      .cylinder(1.2, 1.25, 0.6, 0, 0.36, 0, p.body, { sides: 14 })
      .dome(1.1, 0, 0.66, 0, '#e8eef2', { sides: 14 })
      .cylinder(1.22, 1.22, 0.06, 0, 0.66, 0, T, { team: true, sides: 14 })
      .cylinder(0.03, 0.03, 0.9, 0.6, 1.5, 0.3, '#9a9a9a')
      .sphere(0.06, 0.6, 1.97, 0.3, p.glow);
  } else {
    hull
      .box(2.4, 0.9, 2.2, 0, 0.51, 0, p.body)
      .box(1.4, 0.5, 1.2, -0.3, 1.2, -0.3, p.trim)
      .box(2.42, 0.06, 2.22, 0, 0.96, 0, T, { team: true })
      .box(0.06, 1.2, 0.06, 0.8, 1.55, -0.6, '#6b6b63')
      .dome(0.3, 0.8, 2.1, -0.6, '#c9c9bd', { rx: 0.9 });
    windows(hull, 0, 0.5, 1.11, 5, 0.42, 'z');
  }
  return { parts: [part('hull', hull)] };
}

function pillbox(): Model {
  const hull = new Shape()
    .cylinder(0.38, 0.44, 0.34, 0, 0.17, 0, CONCRETE, { sides: 6 })
    .cylinder(0.395, 0.395, 0.05, 0, 0.22, 0, DARK, { sides: 6 })
    .cylinder(0.3, 0.36, 0.06, 0, 0.37, 0, T, { team: true, sides: 6 });
  return { parts: [part('hull', hull)] };
}

function beamTower(): Model {
  const hull = new Shape()
    .box(0.66, 0.28, 0.66, 0, 0.14, 0, CONCRETE)
    .cylinder(0.1, 0.16, 1.3, 0, 0.9, 0, ACCORD.trim, { sides: 6 })
    .cylinder(0.17, 0.17, 0.06, 0, 0.4, 0, T, { team: true, sides: 6 })
    .cylinder(0.2, 0.1, 0.12, 0, 1.58, 0, ACCORD.dark, { sides: 6 })
    .crystal(0.2, 0, 1.82, 0, ACCORD.glass, { sy: 1.3 });
  return { parts: [part('hull', hull)] };
}

function samSite(): Model {
  const hull = new Shape().cylinder(0.38, 0.42, 0.14, 0, 0.07, 0, CONCRETE, { sides: 8 });
  const turret = new Shape()
    .cylinder(0.12, 0.14, 0.16, 0, 0.08, 0, ACCORD.dark)
    .box(0.36, 0.18, 0.32, 0.02, 0.26, 0, ACCORD.trim, { rz: 0.4 })
    .box(0.02, 0.06, 0.06, 0.19, 0.36, 0.07, DARK, { rz: 0.4 })
    .box(0.02, 0.06, 0.06, 0.19, 0.36, -0.07, DARK, { rz: 0.4 })
    .box(0.2, 0.02, 0.33, -0.04, 0.37, 0, T, { team: true, rz: 0.4 });
  return { parts: [part('hull', hull), part('turret', turret, [0, 0.14, 0])] };
}

function gunNest(): Model {
  const hull = new Shape()
    .cylinder(0.42, 0.44, 0.24, 0, 0.12, 0, '#b8a57a', { sides: 8 })
    .cylinder(0.3, 0.3, 0.02, 0, 0.245, 0, '#5b523f', { sides: 8 });
  const turret = new Shape()
    .box(0.14, 0.12, 0.12, 0, 0.06, 0, BLOC.dark)
    .tube(0.018, 0.3, 0.2, 0.08, 0, DARK, { sides: 5 })
    .box(0.12, 0.1, 0.02, 0.05, 0.12, 0, T, { team: true });
  return { parts: [part('hull', hull), part('turret', turret, [0, 0.24, 0])] };
}

function bastion(): Model {
  const hull = new Shape()
    .box(0.82, 0.5, 0.82, 0, 0.25, 0, CONCRETE)
    .box(0.84, 0.05, 0.84, 0, 0.48, 0, T, { team: true });
  const turret = new Shape()
    .box(0.5, 0.24, 0.46, -0.04, 0.12, 0, BLOC.body)
    .tube(0.035, 0.5, 0.42, 0.13, 0.08, DARK, { sides: 6 })
    .tube(0.035, 0.5, 0.42, 0.13, -0.08, DARK, { sides: 6 })
    .box(0.2, 0.02, 0.3, -0.12, 0.25, 0, T, { team: true });
  return { parts: [part('hull', hull), part('turret', turret, [0, 0.5, 0])] };
}

function flakCannon(): Model {
  const hull = new Shape()
    .cylinder(0.4, 0.44, 0.3, 0, 0.15, 0, CONCRETE, { sides: 8 })
    .cylinder(0.41, 0.41, 0.04, 0, 0.29, 0, T, { team: true, sides: 8 });
  const turret = new Shape()
    .cylinder(0.2, 0.22, 0.1, 0, 0.05, 0, BLOC.trim)
    .box(0.2, 0.18, 0.26, 0, 0.17, 0, BLOC.body);
  for (const z of [-0.08, 0.08]) {
    for (const y of [0.13, 0.22])
      turret.tube(0.018, 0.4, 0.2, y + 0.1, z, DARK, { rz: 0.85, sides: 5 });
  }
  return { parts: [part('hull', hull), part('turret', turret, [0, 0.3, 0])] };
}

function wall(accord: boolean): Model {
  const hull = new Shape();
  if (accord) {
    hull.box(0.96, 0.5, 0.96, 0, 0.25, 0, '#b9bab4').box(0.8, 0.06, 0.8, 0, 0.53, 0, '#a2a39d');
  } else {
    hull.box(0.96, 0.52, 0.96, 0, 0.26, 0, '#8a6a52');
    for (const [x, z] of [
      [-0.3, -0.3],
      [0.3, -0.3],
      [-0.3, 0.3],
      [0.3, 0.3],
    ] as const) {
      hull.box(0.24, 0.12, 0.24, x, 0.58, z, '#7a5c46');
    }
  }
  return { parts: [part('hull', hull)] };
}

function house(): Model {
  const hull = new Shape()
    .box(1.5, 0.7, 1.3, 0, 0.35, 0, '#d9cfb9')
    .roof(1.62, 0.45, 1.42, 0, 0.7, 0, '#9c4a36')
    .box(0.14, 0.4, 0.14, 0.45, 1.0, -0.3, '#7a6a5a')
    .box(0.24, 0.36, 0.02, 0.3, 0.18, 0.66, '#6a4a32')
    .box(0.3, 0.04, 1.32, -0.2, 0.62, 0, T, { team: true });
  windows(hull, -0.3, 0.42, 0.66, 2, 0.4, 'z');
  windows(hull, 0.76, 0.42, 0, 2, 0.5, 'x');
  return { parts: [part('hull', hull)] };
}

function flats(): Model {
  const hull = new Shape()
    .box(2.6, 2.0, 1.6, 0, 1.0, 0, '#c9b8a2')
    .box(2.66, 0.08, 1.66, 0, 2.02, 0, '#8a7a6a')
    .box(2.62, 0.05, 1.62, 0, 1.0, 0, T, { team: true });
  for (let floor = 0; floor < 4; floor++) windows(hull, 0, 0.3 + floor * 0.46, 0.81, 6, 0.4, 'z');
  for (let floor = 0; floor < 4; floor++) windows(hull, 1.31, 0.3 + floor * 0.46, 0, 3, 0.45, 'x');
  return { parts: [part('hull', hull)] };
}

function store(): Model {
  const hull = new Shape()
    .box(1.6, 0.8, 1.5, 0, 0.4, 0, '#bfc4c8')
    .box(1.62, 0.1, 1.52, 0, 0.82, 0, '#8f9499')
    .box(1.5, 0.04, 0.4, 0, 0.62, 0.9, '#c93a3a', { rx: 0.35 })
    .box(1.0, 0.18, 0.02, 0, 0.9, 0.76, T, { team: true });
  windows(hull, 0, 0.35, 0.76, 3, 0.45, 'z');
  return { parts: [part('hull', hull)] };
}

function church(): Model {
  const hull = new Shape()
    .box(1.3, 1.0, 2.0, 0, 0.5, 0.3, '#e0dccf')
    .roof(2.06, 0.6, 1.4, 0, 1.0, 0.3, '#5c6670', { ry: Math.PI / 2 })
    .box(0.6, 1.8, 0.6, 0, 0.9, -1.05, '#e0dccf')
    .cone(0.42, 0.9, 0, 2.25, -1.05, '#5c6670', { sides: 4, ry: Math.PI / 4 })
    .box(0.62, 0.06, 0.62, 0, 1.6, -1.05, T, { team: true });
  windows(hull, 0.66, 0.55, 0.3, 3, 0.5, 'x');
  return { parts: [part('hull', hull)] };
}

function derrick(): Model {
  const hull = new Shape()
    .box(1.8, 0.06, 1.8, 0, 0.03, 0, '#6a6660')
    .cylinder(0.4, 0.4, 0.7, -0.45, 0.4, -0.45, '#8c3c2c', { sides: 10 })
    .cylinder(0.41, 0.41, 0.06, -0.45, 0.7, -0.45, T, { team: true, sides: 10 })
    .box(0.1, 0.9, 0.1, 0.35, 0.5, 0.35, '#3a3a3a')
    .box(0.3, 0.3, 0.3, 0.6, 0.2, 0.6, '#555');
  const beam = new Shape()
    .box(0.9, 0.08, 0.08, 0, 0, 0, '#2f2f2f')
    .box(0.12, 0.22, 0.1, 0.45, -0.08, 0, '#2f2f2f')
    .box(0.16, 0.12, 0.2, -0.45, 0, 0, '#c9a227');
  return { parts: [part('hull', hull), part('rock', beam, [0.35, 0.95, 0.35])] };
}

function navalYard(p: Palette, accord: boolean): Model {
  const hull = new Shape()
    .box(2.9, 0.22, 2.9, 0, 0.09, 0, '#6b6e70')
    .box(0.9, 0.23, 1.6, 0, 0.1, 0.65, '#244a66')
    .box(2.92, 0.04, 0.1, 0, 0.21, -1.4, '#d8b41c')
    .box(0.8, 0.5 + (accord ? 0 : 0.2), 0.8, -1.0, 0.45, -0.95, p.body)
    .box(0.82, 0.05, 0.82, -1.0, accord ? 0.72 : 0.92, -0.95, T, { team: true })
    .box(0.12, 1.1, 0.12, 1.1, 0.75, -1.0, '#d8a41c')
    .box(1.3, 0.08, 0.08, 0.55, 1.28, -1.0, '#d8a41c')
    .box(0.02, 0.4, 0.02, 0.1, 1.06, -1.0, '#333')
    .box(0.5, 0.35, 0.5, 1.05, 0.38, 1.05, p.trim)
    .box(0.52, 0.04, 0.52, 1.05, 0.57, 1.05, T, { team: true });
  if (!accord)
    hull.box(1.2, 0.08, 1.8, 0, 0.62, 0.4, p.dark).box(0.06, 0.4, 1.8, 0.6, 0.42, 0.4, p.dark);
  return { parts: [part('hull', hull)] };
}

function stormArray(): Model {
  const p = ACCORD;
  const hull = slab(new Shape(), 3, 3)
    .box(2.2, 0.5, 2.2, 0, 0.31, 0, p.body)
    .box(2.22, 0.06, 2.22, 0, 0.56, 0, T, { team: true })
    .cylinder(0.22, 0.4, 1.4, 0, 1.25, 0, p.trim, { sides: 8 })
    .cylinder(0.5, 0.5, 0.05, 0, 1.1, 0, p.glow, { sides: 12 })
    .cylinder(0.42, 0.42, 0.05, 0, 1.5, 0, p.glow, { sides: 12 })
    .cylinder(0.34, 0.34, 0.05, 0, 1.85, 0, p.glow, { sides: 12 })
    .sphere(0.24, 0, 2.15, 0, p.glass, { detail: 1 });
  const dish = new Shape()
    .box(1.3, 0.04, 0.08, 0, 0, 0, '#9aa6b0')
    .box(0.08, 0.04, 1.3, 0, 0, 0, '#9aa6b0')
    .sphere(0.06, 0.65, 0, 0, p.glow)
    .sphere(0.06, -0.65, 0, 0, p.glow)
    .sphere(0.06, 0, 0, 0.65, p.glow)
    .sphere(0.06, 0, 0, -0.65, p.glow);
  return { parts: [part('hull', hull), part('spin', dish, [0, 1.7, 0])] };
}

function phaseGate(): Model {
  const p = ACCORD;
  const hull = slab(new Shape(), 3, 3)
    .box(2.4, 0.2, 1.2, 0, 0.16, 0, p.body)
    .box(0.3, 1.5, 0.4, -1.0, 0.95, 0, p.trim)
    .box(0.3, 1.5, 0.4, 1.0, 0.95, 0, p.trim)
    .box(2.3, 0.3, 0.4, 0, 1.6, 0, p.trim)
    .box(2.32, 0.06, 0.42, 0, 1.78, 0, T, { team: true })
    .box(1.7, 1.2, 0.06, 0, 0.9, 0, p.glass)
    .box(0.8, 0.4, 0.6, 0, 0.3, 1.0, p.dark);
  return { parts: [part('hull', hull)] };
}

function silo(): Model {
  const p = BLOC;
  const hull = slab(new Shape(), 3, 3)
    .box(2.6, 0.5, 2.6, 0, 0.3, 0, CONCRETE)
    .box(1.1, 0.06, 1.8, -0.56, 0.57, 0, '#4f4f47')
    .box(1.1, 0.06, 1.8, 0.56, 0.57, 0, '#4f4f47')
    .box(0.06, 0.07, 1.8, 0, 0.58, 0, '#d8b41c')
    .box(2.62, 0.08, 0.12, 0, 0.56, 1.25, T, { team: true })
    .box(0.7, 0.5, 0.6, 1.0, 0.8, -1.0, p.body)
    .box(0.72, 0.05, 0.62, 1.0, 1.06, -1.0, T, { team: true })
    .cylinder(0.04, 0.04, 0.5, 1.2, 1.3, -1.1, '#6b6b63');
  return { parts: [part('hull', hull)] };
}

function bulwark(): Model {
  const p = BLOC;
  const hull = slab(new Shape(), 3, 3)
    .cylinder(0.9, 1.1, 0.4, 0, 0.26, 0, CONCRETE, { sides: 8 })
    .cylinder(0.92, 0.92, 0.06, 0, 0.46, 0, T, { team: true, sides: 8 })
    .cylinder(0.14, 0.3, 1.1, 0, 1.0, 0, p.trim, { sides: 6 })
    .sphere(0.3, 0, 1.75, 0, '#ff5a3d', { detail: 1 });
  for (let i = 0; i < 4; i++) {
    const angle = (i / 4) * Math.PI * 2 + Math.PI / 4;
    hull.box(0.1, 0.9, 0.5, Math.cos(angle) * 0.55, 0.85, Math.sin(angle) * 0.55, p.body, {
      ry: -angle,
    });
  }
  return { parts: [part('hull', hull)] };
}

const STRUCTURE_MODELS: Record<StructureType, () => Model> = {
  a_hq: accordHq,
  a_power: fusionPlant,
  a_refinery: () => refinery(ACCORD),
  a_barracks: accordBarracks,
  a_factory: motorPool,
  a_aircommand: airCommand,
  a_repair: () => repairBay(ACCORD),
  a_lab: () => lab(ACCORD, true),
  a_pillbox: pillbox,
  a_beamtower: beamTower,
  a_sam: samSite,
  a_wall: () => wall(true),
  b_hq: blocHq,
  b_reactor: reactor,
  b_refinery: () => refinery(BLOC),
  b_barracks: blocBarracks,
  b_factory: tankWorks,
  b_radar: radarMast,
  b_repair: () => repairBay(BLOC),
  b_lab: () => lab(BLOC, false),
  b_nest: gunNest,
  b_bastion: bastion,
  b_flak: flakCannon,
  b_wall: () => wall(false),
  c_house: house,
  c_flats: flats,
  c_store: store,
  c_church: church,
  c_derrick: derrick,
  a_navalyard: () => navalYard(ACCORD, true),
  b_navalyard: () => navalYard(BLOC, false),
  a_storm: stormArray,
  a_gate: phaseGate,
  b_silo: silo,
  b_bulwark: bulwark,
};

const unitCache = new Map<UnitType, Model>();
const structureCache = new Map<StructureType, Model>();

export function unitModel(type: UnitType): Model {
  let model = unitCache.get(type);
  if (!model) {
    model = UNIT_MODELS[type]();
    unitCache.set(type, model);
  }
  return model;
}

export function structureModel(type: StructureType): Model {
  let model = structureCache.get(type);
  if (!model) {
    model = STRUCTURE_MODELS[type]();
    structureCache.set(type, model);
  }
  return model;
}

// Scenery ------------------------------------------------------------------------------------

/** Three tree shapes for each kind of map. */
export function treeGeometries(theme: Theme): THREE.BufferGeometry[] {
  if (theme === 'desert') {
    return [
      new Shape()
        .cylinder(0.05, 0.07, 0.9, 0.05, 0.45, 0, '#8a6a44', { rz: 0.12 })
        .box(0.5, 0.02, 0.12, 0.25, 0.9, 0, '#4f8a3a', { rz: -0.4 })
        .box(0.5, 0.02, 0.12, -0.15, 0.9, 0, '#4f8a3a', { rz: 0.4 })
        .box(0.12, 0.02, 0.5, 0.05, 0.9, 0.2, '#5c9a42', { rx: 0.4 })
        .box(0.12, 0.02, 0.5, 0.05, 0.9, -0.2, '#5c9a42', { rx: -0.4 })
        .build(),
      new Shape()
        .cylinder(0.08, 0.09, 0.5, 0, 0.25, 0, '#4d8a4a', { sides: 6 })
        .cylinder(0.05, 0.05, 0.22, 0.12, 0.3, 0, '#4d8a4a', { sides: 6, rz: -0.6 })
        .cylinder(0.05, 0.05, 0.18, -0.1, 0.24, 0.04, '#4d8a4a', { sides: 6, rz: 0.6 })
        .build(),
      new Shape()
        .sphere(0.28, 0, 0.18, 0, '#9c8a64', { sy: 0.6 })
        .sphere(0.18, 0.2, 0.12, 0.12, '#8a7a58', { sy: 0.6 })
        .build(),
    ];
  }
  const snow = theme === 'snow';
  const needle = snow ? '#3f5f4c' : '#2f6b3a';
  const cap = snow ? '#eef3f6' : needle;
  return [
    new Shape()
      .cylinder(0.04, 0.05, 0.3, 0, 0.15, 0, '#6b4a2e')
      .cone(0.3, 0.5, 0, 0.5, 0, needle, { sides: 7 })
      .cone(0.22, 0.4, 0, 0.78, 0, cap, { sides: 7 })
      .build(),
    snow
      ? new Shape()
          .cylinder(0.04, 0.05, 0.25, 0, 0.12, 0, '#6b4a2e')
          .cone(0.26, 0.45, 0, 0.42, 0, needle, { sides: 6 })
          .cone(0.18, 0.32, 0, 0.66, 0, cap, { sides: 6 })
          .build()
      : new Shape()
          .cylinder(0.05, 0.06, 0.35, 0, 0.17, 0, '#6b4a2e')
          .sphere(0.32, 0, 0.58, 0, '#3f8a3c', { detail: 0 })
          .sphere(0.2, 0.12, 0.75, 0.05, '#4d9a45')
          .build(),
    new Shape()
      .cylinder(0.05, 0.06, 0.3, 0, 0.15, 0, '#6b4a2e')
      .sphere(0.3, 0, 0.5, 0, snow ? '#dfe8ee' : '#4a8f3a', { detail: 0 })
      .build(),
  ];
}

export function oreGeometry(gem: boolean): THREE.BufferGeometry {
  const color = gem ? '#b16bff' : '#e8c34a';
  const light = gem ? '#6fd7ff' : '#f6dc7a';
  return new Shape()
    .crystal(0.14, -0.12, 0.1, -0.08, color, { sy: 1.6, rz: 0.2 })
    .crystal(0.11, 0.14, 0.08, 0.06, light, { sy: 1.5, rx: 0.3 })
    .crystal(0.09, -0.02, 0.07, 0.16, color, { sy: 1.4, rz: -0.3 })
    .crystal(0.07, 0.12, 0.05, -0.16, light, { sy: 1.3 })
    .build();
}

export function drillGeometry(): THREE.BufferGeometry {
  return new Shape()
    .cylinder(0.32, 0.4, 0.2, 0, 0.1, 0, '#5a5a5a', { sides: 8 })
    .cylinder(0.08, 0.1, 0.9, 0, 0.6, 0, '#8a8a80', { sides: 6 })
    .box(0.5, 0.06, 0.06, 0, 1.0, 0, '#c9a227')
    .cone(0.12, 0.2, 0, 1.13, 0, '#c9a227', { sides: 6 })
    .build();
}

export function crateGeometry(): THREE.BufferGeometry {
  return new Shape()
    .box(0.4, 0.3, 0.4, 0, 0.15, 0, '#b08a52')
    .box(0.42, 0.05, 0.42, 0, 0.12, 0, '#6f5532')
    .box(0.05, 0.31, 0.42, 0, 0.15, 0, '#6f5532')
    .build();
}
