// ASCII symbol pool — curated to avoid lookalikes.
// Rendered in monospace; visually distinct at small sizes.
export const SYMBOLS: string[] = [
  '+', 'x', 'o', '*', '#', '@', '%', '&', '=', '?',
  '!', '/', '\\', '<', '>', '^', '~', '$', 'A', 'B',
  'C', 'D', 'E', 'F', 'G', 'H', 'J', 'K', 'L', 'M',
  'N', 'P', 'Q', 'R', 'S', 'T', 'U', 'V', 'W', 'X',
  'Y', 'Z', 'a', 'b', 'c', 'd', 'e', 'f', 'g', 'h',
  'j', 'k', 'm', 'n', 'p', 'q', 'r', 's', 't', 'u',
  'w', 'y', 'z', '2', '3', '4', '5', '6', '7', '8',
  '9',
];

// Assign symbols deterministically by index.
export function symbolFor(index: number): string {
  if (index < SYMBOLS.length) return SYMBOLS[index];
  // wrap into double-char fallback for very large palettes
  const a = SYMBOLS[index % SYMBOLS.length];
  const b = SYMBOLS[Math.floor(index / SYMBOLS.length) % SYMBOLS.length];
  return a + b;
}
