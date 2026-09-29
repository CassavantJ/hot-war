import { mapSpec } from '../sim/maps';
import { deserialize, serialize } from '../sim/snapshot';
import type { World } from '../sim/world';

/** Save slots, kept in this browser. Each battle is gzipped when the browser can. */

export const SLOTS = 3;
const INDEX_KEY = 'hotwar.saves.v1';
const slotKey = (slot: number) => `hotwar.save.v1.${String(slot)}`;

export interface SaveInfo {
  slot: number;
  /** The map or mission. */
  title: string;
  /** Battle time, in seconds. */
  time: number;
  savedAt: number;
}

export function listSaves(): SaveInfo[] {
  try {
    const raw = localStorage.getItem(INDEX_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(parsed)) return [];
    return (parsed as SaveInfo[]).filter(
      (info) => typeof info.slot === 'number' && info.slot >= 0 && info.slot < SLOTS,
    );
  } catch {
    return [];
  }
}

function writeIndex(saves: SaveInfo[]): void {
  localStorage.setItem(INDEX_KEY, JSON.stringify(saves.sort((a, b) => a.slot - b.slot)));
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

async function pack(text: string): Promise<string> {
  if (typeof CompressionStream === 'undefined') return `raw:${text}`;
  const stream = new Blob([text]).stream().pipeThrough(new CompressionStream('gzip'));
  const bytes = new Uint8Array(await new Response(stream).arrayBuffer());
  return `gz:${toBase64(bytes)}`;
}

async function unpack(stored: string): Promise<string> {
  if (stored.startsWith('raw:')) return stored.slice(4);
  if (!stored.startsWith('gz:')) throw new Error('That save is damaged.');
  const stream = new Blob([fromBase64(stored.slice(3))])
    .stream()
    .pipeThrough(new DecompressionStream('gzip'));
  return new Response(stream).text();
}

/** What a battle is called in the save list. */
export function titleOf(world: World): string {
  return world.mission?.def.title ?? mapSpec(world.settings.mapId).name;
}

export async function saveGame(slot: number, world: World): Promise<void> {
  const stored = await pack(serialize(world));
  try {
    localStorage.setItem(slotKey(slot), stored);
  } catch {
    throw new Error('There isn’t room to save here. Try deleting another save.');
  }
  const saves = listSaves().filter((info) => info.slot !== slot);
  saves.push({ slot, title: titleOf(world), time: world.time, savedAt: Date.now() });
  writeIndex(saves);
}

export async function loadGame(slot: number): Promise<World> {
  const stored = localStorage.getItem(slotKey(slot));
  if (!stored) throw new Error('That save has gone missing.');
  return deserialize(await unpack(stored));
}

export function deleteSave(slot: number): void {
  try {
    localStorage.removeItem(slotKey(slot));
    writeIndex(listSaves().filter((info) => info.slot !== slot));
  } catch {
    // Storage may be blocked; nothing to delete then.
  }
}

/** "12:05" for a battle time in seconds. */
export function clock(seconds: number): string {
  const whole = Math.floor(seconds);
  const minutes = Math.floor(whole / 60);
  return `${String(minutes)}:${String(whole % 60).padStart(2, '0')}`;
}
