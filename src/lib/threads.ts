import { DMC_COLORS } from '../data/dmc';
import { hexToRgb, rgbToLab, type LAB, type RGB } from './color';

export interface ThreadEntry {
  floss: string;
  name: string;
  hex: string;
}

export interface ThreadWithLab extends ThreadEntry {
  rgb: RGB;
  lab: LAB;
}

export type ThreadBrand = 'DMC';

let dmcCache: ThreadWithLab[] | null = null;

export function getPalette(_brand: ThreadBrand = 'DMC'): ThreadWithLab[] {
  if (dmcCache) return dmcCache;
  const built: ThreadWithLab[] = DMC_COLORS.map((t) => {
    const rgb = hexToRgb(t.hex);
    return { ...t, rgb, lab: rgbToLab(rgb) };
  });
  dmcCache = built;
  return built;
}
