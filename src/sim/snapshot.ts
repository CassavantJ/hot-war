import { AiBrain } from './ai';
import { MISSIONS } from './campaign';
import { Structure, Unit } from './entities';
import { GameMap, Layer } from './map';
import { MAPS } from './maps';
import { Pathfinder } from './path';
import { Player } from './player';
import { Random } from './random';
import * as rules from './rules';
import { World } from './world';

/**
 * Saves and restores a whole battle. The world is a graph of objects (units point at each
 * other, the id index and spatial buckets share units with the unit list), so it's written
 * out as a flat table of nodes that refer to each other by number. Class instances keep their
 * class, Maps, Sets and typed arrays survive, and anything from the rule tables (a unit's
 * definition, a weapon, a mission) is stored by name rather than copied.
 */

const CLASSES: Record<string, { prototype: object }> = {
  World,
  Unit,
  Structure,
  GameMap,
  Layer,
  Pathfinder,
  Player,
  Random,
  AiBrain,
};

const TYPED = {
  Float32Array,
  Float64Array,
  Int8Array,
  Int16Array,
  Int32Array,
  Uint8Array,
  Uint16Array,
  Uint32Array,
  Uint8ClampedArray,
} as const;

type TypedName = keyof typeof TYPED;

/** A value in a field or slot: a primitive, or one of these wrappers. */
type Value =
  string | number | boolean | null | { u: 1 } | { n: string } | { k: string } | { r: number };

type Node =
  | { a: Value[] }
  | { m: [Value, Value][] }
  | { s: Value[] }
  | { t: TypedName; b: string }
  | { c: string; f: Record<string, Value> }
  | { o: Record<string, Value> };

interface Snapshot {
  version: number;
  root: Value;
  nodes: Node[];
}

let constantPaths: Map<object, string> | null = null;
let constantObjects: Map<string, object> | null = null;

/** Every object reachable from the rule tables, maps and missions, by path. */
function constants(): { paths: Map<object, string>; objects: Map<string, object> } {
  if (constantPaths && constantObjects) return { paths: constantPaths, objects: constantObjects };
  const paths = new Map<object, string>();
  const objects = new Map<string, object>();
  const visit = (value: unknown, path: string) => {
    if (typeof value !== 'object' || value === null || paths.has(value)) return;
    paths.set(value, path);
    objects.set(path, value);
    for (const [key, child] of Object.entries(value)) visit(child, `${path}.${key}`);
  };
  for (const [name, value] of Object.entries(rules)) visit(value, `rules.${name}`);
  visit(MAPS, 'maps');
  visit(MISSIONS, 'missions');
  constantPaths = paths;
  constantObjects = objects;
  return { paths, objects };
}

const classNames = new Map<object, string>(
  Object.entries(CLASSES).map(([name, ctor]) => [ctor.prototype, name]),
);

function typedName(value: ArrayBufferView): TypedName | null {
  for (const [name, ctor] of Object.entries(TYPED)) {
    if (value instanceof ctor) return name as TypedName;
  }
  return null;
}

function toBase64(bytes: Uint8Array): string {
  let text = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    text += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(text);
}

function fromBase64(text: string): Uint8Array<ArrayBuffer> {
  const raw = atob(text);
  const bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

/** Writes the battle out as JSON. */
export function serialize(world: World): string {
  const { paths } = constants();
  const ids = new Map<object, number>();
  const nodes: Node[] = [];
  const pending: [object, number][] = [];
  const encode = (value: unknown): Value => {
    if (value === undefined) return { u: 1 };
    if (value === null || typeof value === 'boolean' || typeof value === 'string') return value;
    if (typeof value === 'number') return Number.isFinite(value) ? value : { n: String(value) };
    if (typeof value !== 'object') throw new Error(`Can't save a ${typeof value}`);
    const constant = paths.get(value);
    if (constant !== undefined) return { k: constant };
    let id = ids.get(value);
    if (id === undefined) {
      id = nodes.length;
      ids.set(value, id);
      nodes.push({ a: [] });
      pending.push([value, id]);
    }
    return { r: id };
  };
  const fields = (object: object): Record<string, Value> => {
    const out: Record<string, Value> = {};
    for (const [key, child] of Object.entries(object)) out[key] = encode(child);
    return out;
  };
  const root = encode(world);
  // Nodes are filled in breadth-first, so deep graphs don't overflow the stack.
  // (The loop also visits entries pushed while it runs.)
  for (const [object, id] of pending) {
    let node: Node;
    if (Array.isArray(object)) node = { a: object.map(encode) };
    else if (object instanceof Map) {
      node = { m: [...object.entries()].map(([key, child]) => [encode(key), encode(child)]) };
    } else if (object instanceof Set) node = { s: [...object].map(encode) };
    else if (ArrayBuffer.isView(object)) {
      const name = typedName(object);
      if (!name) throw new Error("Can't save a DataView");
      node = {
        t: name,
        b: toBase64(new Uint8Array(object.buffer, object.byteOffset, object.byteLength)),
      };
    } else {
      const prototype: unknown = Object.getPrototypeOf(object);
      const className = classNames.get(prototype as object);
      if (className) node = { c: className, f: fields(object) };
      else if (prototype === Object.prototype || prototype === null) node = { o: fields(object) };
      else throw new Error("Can't save an object of an unknown class");
    }
    nodes[id] = node;
  }
  const snapshot: Snapshot = { version: 1, root, nodes };
  return JSON.stringify(snapshot);
}

/** Reads a battle back in. */
export function deserialize(text: string): World {
  const { objects } = constants();
  const snapshot = JSON.parse(text) as Snapshot;
  if (snapshot.version !== 1) throw new Error('This save is from another version of the game.');
  // First make every object (empty, but with its class), then fill them in.
  const made: unknown[] = snapshot.nodes.map((node) => {
    if ('a' in node) return [];
    if ('m' in node) return new Map();
    if ('s' in node) return new Set();
    if ('t' in node) {
      const bytes = fromBase64(node.b);
      const Kind = TYPED[node.t];
      return new Kind(bytes.buffer, 0, bytes.byteLength / Kind.BYTES_PER_ELEMENT);
    }
    if ('c' in node) {
      const ctor = CLASSES[node.c];
      if (!ctor) throw new Error(`Unknown class in save: ${node.c}`);
      return Object.create(ctor.prototype) as object;
    }
    return {};
  });
  const decode = (value: Value): unknown => {
    if (value === null || typeof value !== 'object') return value;
    if ('u' in value) return undefined;
    if ('n' in value) return Number(value.n);
    if ('k' in value) {
      const constant = objects.get(value.k);
      if (!constant) throw new Error(`Unknown rule in save: ${value.k}`);
      return constant;
    }
    return made[value.r];
  };
  snapshot.nodes.forEach((node, i) => {
    const target = made[i];
    if ('a' in node) (target as unknown[]).push(...node.a.map(decode));
    else if ('m' in node) {
      for (const [key, child] of node.m)
        (target as Map<unknown, unknown>).set(decode(key), decode(child));
    } else if ('s' in node) {
      for (const child of node.s) (target as Set<unknown>).add(decode(child));
    } else if ('c' in node || 'o' in node) {
      const source = 'c' in node ? node.f : node.o;
      const object = target as Record<string, unknown>;
      for (const [key, child] of Object.entries(source)) object[key] = decode(child);
    }
  });
  const world = decode(snapshot.root);
  if (!(world instanceof World)) throw new Error("That save doesn't hold a battle.");
  return world;
}
