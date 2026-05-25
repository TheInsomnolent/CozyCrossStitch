// Color math: sRGB <-> linear <-> XYZ <-> LAB and ΔE76.

export type RGB = readonly [number, number, number];
export type LAB = readonly [number, number, number];

const srgbToLinear = (c: number): number => {
  const v = c / 255;
  return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
};

const linearToSrgb = (v: number): number => {
  const c = v <= 0.0031308 ? 12.92 * v : 1.055 * Math.pow(v, 1 / 2.4) - 0.055;
  return Math.round(Math.min(1, Math.max(0, c)) * 255);
};

export function rgbToLab([r, g, b]: RGB): LAB {
  const lr = srgbToLinear(r);
  const lg = srgbToLinear(g);
  const lb = srgbToLinear(b);
  // sRGB -> XYZ (D65)
  const x = lr * 0.4124564 + lg * 0.3575761 + lb * 0.1804375;
  const y = lr * 0.2126729 + lg * 0.7151522 + lb * 0.072175;
  const z = lr * 0.0193339 + lg * 0.119192 + lb * 0.9503041;
  // normalize by D65 white
  const xn = x / 0.95047;
  const yn = y / 1.0;
  const zn = z / 1.08883;
  const f = (t: number) =>
    t > 216 / 24389 ? Math.cbrt(t) : (24389 / 27) * t / 116 + 16 / 116;
  const fx = f(xn);
  const fy = f(yn);
  const fz = f(zn);
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}

export function deltaE76(a: LAB, b: LAB): number {
  const dl = a[0] - b[0];
  const da = a[1] - b[1];
  const db = a[2] - b[2];
  return Math.sqrt(dl * dl + da * da + db * db);
}

export function hexToRgb(hex: string): RGB {
  const h = hex.replace('#', '');
  const n =
    h.length === 3
      ? h.split('').map((c) => c + c).join('')
      : h;
  const v = parseInt(n, 16);
  return [(v >> 16) & 0xff, (v >> 8) & 0xff, v & 0xff];
}

export function rgbToHex([r, g, b]: RGB): string {
  const h = (n: number) => n.toString(16).padStart(2, '0');
  return `#${h(r)}${h(g)}${h(b)}`.toUpperCase();
}

// Blend two sRGB colors in linear-light space at given weight (0..1 of b)
export function blendLinear(a: RGB, b: RGB, t: number): RGB {
  const la = a.map(srgbToLinear);
  const lb = b.map(srgbToLinear);
  return [
    linearToSrgb(la[0] * (1 - t) + lb[0] * t),
    linearToSrgb(la[1] * (1 - t) + lb[1] * t),
    linearToSrgb(la[2] * (1 - t) + lb[2] * t),
  ];
}
