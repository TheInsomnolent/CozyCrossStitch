// One-shot build script: renders the CCS monogram in Parisienne onto pastel
// backgrounds, writes the master SVGs, and rasterizes PNG variants used by the
// PWA manifest and the OG card. Run with:
//   node scripts/build-icons.mjs
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import opentype from 'opentype.js';
import sharp from 'sharp';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const PUBLIC = join(ROOT, 'public');
const FONT_PATH = join(ROOT, 'Parisienne-Regular.ttf');
const STARTERS_PATH = join(ROOT, 'src', 'data', 'starterPatterns.json');

const SIZE = 512;

// Pastel theme tokens, mirrored from src/styles/theme.css so the icon matches
// the in-app brand colours.
const GRAD_STOPS = [
  { offset: '0%', color: '#F7D9B6' }, // peach
  { offset: '50%', color: '#F4C7CB' }, // blush
  { offset: '100%', color: '#DCCAE6' }, // lilac
];
const INK = '#5b3a45';

async function loadFont() {
  const buf = await readFile(FONT_PATH);
  const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
  return opentype.parse(ab);
}

function textToPath(font, text, fontSize) {
  const path = font.getPath(text, 0, 0, fontSize, { kerning: true });
  const bb = path.getBoundingBox();
  return {
    d: path.toPathData(2),
    bbox: {
      x1: bb.x1,
      y1: bb.y1,
      x2: bb.x2,
      y2: bb.y2,
      width: bb.x2 - bb.x1,
      height: bb.y2 - bb.y1,
    },
  };
}

function gradientStops() {
  return GRAD_STOPS.map((s) => `<stop offset="${s.offset}" stop-color="${s.color}"/>`).join('');
}

function hexToRgb(hex) {
  const h = (hex || '#000000').replace('#', '');
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
  ];
}

/**
 * Rasterize a stored pattern's cells (using `displayHex` per palette entry and
 * the fabric colour for blank cells) into a crisply upscaled PNG and return it
 * as a base64 data URL for inline SVG embedding.
 */
async function renderPatternDataUrl(pattern, targetPx = 720) {
  const W = pattern.gridW;
  const H = pattern.gridH;
  const fabric = hexToRgb(pattern.fabric?.hex ?? '#ffffff');
  const buf = Buffer.alloc(W * H * 4);
  for (let i = 0; i < W * H; i++) {
    const v = pattern.cells[i];
    let r, g, b;
    if (v === 0xff) {
      [r, g, b] = fabric;
    } else {
      const entry = pattern.palette[v];
      [r, g, b] = hexToRgb(entry?.displayHex || entry?.threadHex);
    }
    const o = i * 4;
    buf[o] = r;
    buf[o + 1] = g;
    buf[o + 2] = b;
    buf[o + 3] = 255;
  }
  const png = await sharp(buf, { raw: { width: W, height: H, channels: 4 } })
    .resize(targetPx, targetPx, { kernel: 'nearest' })
    .png()
    .toBuffer();
  return `data:image/png;base64,${png.toString('base64')}`;
}

function buildIconSvg({ size = SIZE, padding = 0.12, rounded = true, pathD, pathBBox }) {
  const safe = size * (1 - padding * 2);
  const scale = Math.min(safe / pathBBox.width, safe / pathBBox.height);
  const tx = (size - pathBBox.width * scale) / 2 - pathBBox.x1 * scale;
  const ty = (size - pathBBox.height * scale) / 2 - pathBBox.y1 * scale;
  const r = rounded ? Math.round(size * 0.22) : 0;
  const bgRect = rounded
    ? `<rect width="${size}" height="${size}" rx="${r}" ry="${r}" fill="url(#bg)"/>`
    : `<rect width="${size}" height="${size}" fill="url(#bg)"/>`;
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">${gradientStops()}</linearGradient>
  </defs>
  ${bgRect}
  <g transform="translate(${tx.toFixed(2)} ${ty.toFixed(2)}) scale(${scale.toFixed(4)})">
    <path d="${pathD}" fill="${INK}"/>
  </g>
</svg>`;
}

function buildOgSvg(font, patternDataUrl) {
  const wordmark = textToPath(font, 'Cozy Cross Stitch', 110);
  const monogram = textToPath(font, 'CCS', 78);

  const wmMaxWidth = 520;
  const wmScale = Math.min(1, wmMaxWidth / wordmark.bbox.width);
  const wmH = wordmark.bbox.height * wmScale;
  const wmX = 230 - wordmark.bbox.x1 * wmScale;
  const wmY = 175 - wordmark.bbox.y1 * wmScale - wmH / 2;

  const badgePad = 18;
  const badgeInner = 120 - badgePad * 2;
  const monoScale = Math.min(
    badgeInner / monogram.bbox.width,
    badgeInner / monogram.bbox.height,
  );
  const monoW = monogram.bbox.width * monoScale;
  const monoH = monogram.bbox.height * monoScale;
  const monoX = 80 + (120 - monoW) / 2 - monogram.bbox.x1 * monoScale;
  const monoY = 80 + (120 - monoH) / 2 - monogram.bbox.y1 * monoScale;

  // Showcase frame for the Ivy preview on the right side.
  const FS = 360;
  const FX = 1200 - 80 - FS; // 760
  const FY = (630 - FS) / 2; // 135
  const FR = 22;

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 630" width="1200" height="630">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#FBF6F0"/>
      <stop offset="55%" stop-color="#F7E4DE"/>
      <stop offset="100%" stop-color="#E9D7E7"/>
    </linearGradient>
    <linearGradient id="badge" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#F7D9B6"/>
      <stop offset="50%" stop-color="#F4C7CB"/>
      <stop offset="100%" stop-color="#DCCAE6"/>
    </linearGradient>
    <pattern id="aida" width="28" height="28" patternUnits="userSpaceOnUse">
      <rect width="28" height="28" fill="none"/>
      <path d="M0 0H28M0 28H28M0 0V28M28 0V28" stroke="rgba(197,138,149,0.18)" stroke-width="1"/>
    </pattern>
    <filter id="soft" x="-10%" y="-10%" width="120%" height="120%">
      <feGaussianBlur in="SourceGraphic" stdDeviation="14"/>
    </filter>
    <clipPath id="frameClip">
      <rect x="${FX}" y="${FY}" width="${FS}" height="${FS}" rx="${FR}" ry="${FR}"/>
    </clipPath>
  </defs>

  <rect width="1200" height="630" fill="url(#bg)"/>
  <circle cx="180" cy="120" r="200" fill="#F7D9B6" opacity="0.45" filter="url(#soft)"/>
  <circle cx="1060" cy="540" r="220" fill="#DCCAE6" opacity="0.55" filter="url(#soft)"/>
  <rect width="1200" height="630" fill="url(#aida)"/>

  <!-- Monogram badge -->
  <g>
    <rect x="80" y="80" width="120" height="120" rx="28" fill="url(#badge)"/>
    <g transform="translate(${monoX.toFixed(2)} ${monoY.toFixed(2)}) scale(${monoScale.toFixed(4)})">
      <path d="${monogram.d}" fill="${INK}"/>
    </g>
  </g>

  <!-- Wordmark (Parisienne, baked to path) -->
  <g transform="translate(${wmX.toFixed(2)} ${wmY.toFixed(2)}) scale(${wmScale.toFixed(4)})">
    <path d="${wordmark.d}" fill="${INK}"/>
  </g>
  <text x="230" y="248" font-family="'Nunito', 'Segoe UI', system-ui, sans-serif" font-size="22" font-weight="600" fill="#9b6b76" letter-spacing="3">CROSS STITCH PATTERN MAKER</text>

  <!-- Headline -->
  <text x="80" y="400" font-family="'Cormorant Garamond', Georgia, serif" font-size="60" font-weight="600" fill="#3d2932">Turn photos into</text>
  <text x="80" y="470" font-family="'Cormorant Garamond', Georgia, serif" font-size="60" font-weight="700" fill="#c58a95" font-style="italic">beautiful cross stitch.</text>

  <!-- Tagline -->
  <text x="80" y="535" font-family="'Nunito', 'Segoe UI', system-ui, sans-serif" font-size="24" font-weight="500" fill="#5b3a45">Free · private · offline · printable</text>

  <!-- Ivy starter preview -->
  <g>
    <rect x="${FX - 8}" y="${FY - 8}" width="${FS + 16}" height="${FS + 16}" rx="${FR + 6}" ry="${FR + 6}" fill="rgba(255,255,255,0.7)"/>
    <image href="${patternDataUrl}" x="${FX}" y="${FY}" width="${FS}" height="${FS}" preserveAspectRatio="xMidYMid slice" clip-path="url(#frameClip)" image-rendering="pixelated"/>
    <rect x="${FX}" y="${FY}" width="${FS}" height="${FS}" rx="${FR}" ry="${FR}" fill="none" stroke="rgba(197,138,149,0.45)" stroke-width="2"/>
  </g>

  <text x="80" y="595" font-family="'Nunito', 'Segoe UI', system-ui, sans-serif" font-size="22" font-weight="600" fill="#9b6b76" letter-spacing="2">theinsomnolent.github.io/CozyCrossStitch</text>
</svg>`;
}

async function main() {
  const font = await loadFont();
  const ccs = textToPath(font, 'CCS', 360);

  const iconSvg = buildIconSvg({ size: SIZE, padding: 0.14, rounded: true, pathD: ccs.d, pathBBox: ccs.bbox });
  const maskableSvg = buildIconSvg({ size: SIZE, padding: 0.22, rounded: false, pathD: ccs.d, pathBBox: ccs.bbox });

  await writeFile(join(PUBLIC, 'icon.svg'), iconSvg);
  await writeFile(join(PUBLIC, 'icon-maskable.svg'), maskableSvg);
  await writeFile(join(PUBLIC, 'favicon.svg'), iconSvg);

  const renders = [
    { input: iconSvg, out: 'icon-192.png', size: 192 },
    { input: iconSvg, out: 'icon-512.png', size: 512 },
    { input: maskableSvg, out: 'icon-maskable-512.png', size: 512 },
    { input: iconSvg, out: 'apple-touch-icon.png', size: 180 },
  ];
  for (const { input, out, size } of renders) {
    await sharp(Buffer.from(input)).resize(size, size).png().toFile(join(PUBLIC, out));
    console.log('wrote', out);
  }

  const starters = JSON.parse(await readFile(STARTERS_PATH, 'utf8'));
  const ivy = starters.find((p) => /ivy/i.test(p.name)) ?? starters[0];
  const patternDataUrl = await renderPatternDataUrl(ivy, 720);

  const ogSvg = buildOgSvg(font, patternDataUrl);
  await writeFile(join(PUBLIC, 'og-image.svg'), ogSvg);
  await sharp(Buffer.from(ogSvg)).resize(1200, 630).png().toFile(join(PUBLIC, 'og-image.png'));
  console.log('wrote og-image.png');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
