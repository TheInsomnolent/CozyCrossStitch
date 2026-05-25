import { get, set, del, keys } from 'idb-keyval';
import type { EffectivePaletteEntry } from './halfStitch';

export type FabricPreset =
  | 'white'
  | 'antique-white'
  | 'ecru'
  | 'cream'
  | 'black'
  | 'light-blue'
  | 'custom';

export const FABRIC_PRESETS: { id: FabricPreset; name: string; hex: string }[] = [
  { id: 'white', name: 'White', hex: '#FFFFFF' },
  { id: 'antique-white', name: 'Antique White', hex: '#F5EFE0' },
  { id: 'ecru', name: 'Ecru', hex: '#E8DDC0' },
  { id: 'cream', name: 'Cream', hex: '#F4ECD8' },
  { id: 'black', name: 'Black', hex: '#1A1A1A' },
  { id: 'light-blue', name: 'Light Blue', hex: '#CFE2F3' },
];

export interface Pattern {
  id: string;
  name: string;
  createdAt: number;
  gridW: number;
  gridH: number;
  /** values are palette indices; 0xFF = blank */
  cells: number[]; // serialized Uint8Array
  palette: EffectivePaletteEntry[];
  fabric: { name: string; hex: string };
  aidaCount: number; // stitches per inch
  strands: number;
  /** completion bitset; one bit per cell; serialized as number[] */
  completion: number[];
  /** dataURL thumbnail */
  thumbnail: string;
}

const PATTERN_KEY = (id: string) => `pattern:${id}`;
const INDEX_KEY = 'pattern-index';

export interface PatternSummary {
  id: string;
  name: string;
  createdAt: number;
  gridW: number;
  gridH: number;
  totalNonBlank: number;
  completed: number;
  thumbnail: string;
}

export async function savePattern(p: Pattern): Promise<void> {
  await set(PATTERN_KEY(p.id), p);
  const index = ((await get<string[]>(INDEX_KEY)) ?? []).filter((id) => id !== p.id);
  index.unshift(p.id);
  await set(INDEX_KEY, index);
}

export async function loadPattern(id: string): Promise<Pattern | undefined> {
  return get<Pattern>(PATTERN_KEY(id));
}

export async function deletePattern(id: string): Promise<void> {
  await del(PATTERN_KEY(id));
  const index = ((await get<string[]>(INDEX_KEY)) ?? []).filter((x) => x !== id);
  await set(INDEX_KEY, index);
}

export async function listSummaries(): Promise<PatternSummary[]> {
  let index = (await get<string[]>(INDEX_KEY)) ?? [];
  if (index.length === 0) {
    // backfill from keys (defensive)
    const all = await keys();
    index = all
      .filter((k): k is string => typeof k === 'string' && k.startsWith('pattern:'))
      .map((k) => k.slice('pattern:'.length));
  }
  const out: PatternSummary[] = [];
  for (const id of index) {
    const p = await get<Pattern>(PATTERN_KEY(id));
    if (!p) continue;
    const total = p.cells.filter((c) => c !== 0xff).length;
    const completed = popcount(p.completion);
    out.push({
      id: p.id,
      name: p.name,
      createdAt: p.createdAt,
      gridW: p.gridW,
      gridH: p.gridH,
      totalNonBlank: total,
      completed,
      thumbnail: p.thumbnail,
    });
  }
  return out;
}

export function popcount(bits: number[]): number {
  let c = 0;
  for (let i = 0; i < bits.length; i++) {
    let v = bits[i] >>> 0;
    v = v - ((v >>> 1) & 0x55555555);
    v = (v & 0x33333333) + ((v >>> 2) & 0x33333333);
    c += ((((v + (v >>> 4)) & 0x0f0f0f0f) * 0x01010101) >>> 24);
  }
  return c;
}

export function makeBitset(length: number): number[] {
  return new Array(Math.ceil(length / 32)).fill(0);
}

export function getBit(bits: number[], i: number): boolean {
  return (bits[i >>> 5] & (1 << (i & 31))) !== 0;
}

export function setBit(bits: number[], i: number, on: boolean): void {
  const idx = i >>> 5;
  const mask = 1 << (i & 31);
  if (on) bits[idx] |= mask;
  else bits[idx] &= ~mask;
}
