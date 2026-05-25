import { savePattern, loadPattern, makeBitset, type Pattern } from './storage';
import starterPatternsRaw from '../data/starterPatterns.json';

const SEEDED_KEY = 'xstitch:startersSeededV2';

/**
 * Render a small thumbnail dataURL from a pattern's cells. We strip thumbnails
 * from the bundled starter JSON to keep it slim and regenerate them locally.
 */
function renderThumbnail(p: Pattern, size = 256): string {
  if (p.gridW <= 0 || p.gridH <= 0) return '';

  // Render at native grid resolution first so every cell is exactly one pixel,
  // then upscale with nearest-neighbour into the target canvas. This keeps
  // crisp stitches and — crucially — fills the whole thumbnail regardless of
  // whether `size` is an integer multiple of the grid dimensions.
  const src = document.createElement('canvas');
  src.width = p.gridW;
  src.height = p.gridH;
  const sctx = src.getContext('2d');
  if (!sctx) return '';

  const img = sctx.createImageData(p.gridW, p.gridH);
  const fabric = hexToRgb(p.fabric?.hex ?? '#ffffff');
  for (let i = 0; i < p.gridW * p.gridH; i++) {
    const v = p.cells[i];
    let r: number, g: number, b: number;
    if (v === 0xff) {
      [r, g, b] = fabric;
    } else {
      const entry = p.palette[v];
      [r, g, b] = hexToRgb(entry?.displayHex || entry?.threadHex || '#000000');
    }
    const o = i * 4;
    img.data[o] = r;
    img.data[o + 1] = g;
    img.data[o + 2] = b;
    img.data[o + 3] = 255;
  }
  sctx.putImageData(img, 0, 0);

  const dst = document.createElement('canvas');
  dst.width = size;
  dst.height = size;
  const dctx = dst.getContext('2d');
  if (!dctx) return '';

  // Preserve aspect ratio inside a square thumbnail, filling unused area with
  // the fabric colour so non-square patterns still feel intentional.
  const scale = Math.min(size / p.gridW, size / p.gridH);
  const drawW = p.gridW * scale;
  const drawH = p.gridH * scale;
  const offX = (size - drawW) / 2;
  const offY = (size - drawH) / 2;

  dctx.fillStyle = p.fabric?.hex ?? '#ffffff';
  dctx.fillRect(0, 0, size, size);
  dctx.imageSmoothingEnabled = false;
  dctx.drawImage(src, 0, 0, p.gridW, p.gridH, offX, offY, drawW, drawH);

  return dst.toDataURL('image/png');
}

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
  ];
}

/**
 * On first run, seed the user's library with a couple of starter patterns so
 * the app isn't empty when they arrive. Runs once per browser (tracked via
 * localStorage); user-deleted starters are not re-added.
 */
export async function seedStartersIfNeeded(): Promise<void> {
  try {
    if (localStorage.getItem(SEEDED_KEY)) return;
  } catch {
    // localStorage unavailable — bail rather than re-seed every load.
    return;
  }

  const starters = starterPatternsRaw as unknown as Pattern[];
  for (const raw of starters) {
    try {
      const existing = await loadPattern(raw.id);
      if (existing) continue;

      const pattern: Pattern = {
        ...raw,
        completion: Array.isArray(raw.completion) && raw.completion.length
          ? raw.completion
          : makeBitset(raw.gridW * raw.gridH),
        thumbnail: raw.thumbnail || '',
      };
      if (!pattern.thumbnail) {
        pattern.thumbnail = renderThumbnail(pattern);
      }
      await savePattern(pattern);
    } catch (err) {
      // Don't let one bad starter block the rest.
      console.warn('Failed to seed starter pattern', raw?.id, err);
    }
  }

  try {
    localStorage.setItem(SEEDED_KEY, String(Date.now()));
  } catch {
    // ignore
  }
}
