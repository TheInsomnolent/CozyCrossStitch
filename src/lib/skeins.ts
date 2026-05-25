// Skein estimation — length-based.
//
// Length per stitch on Aida (in inches) ≈ (2 * sqrt(2) / count) * strands * waste.
// DMC skein ≈ 8m = 315in of 6-strand floss → usable per skein = 315 / strands.
// Half stitches cost ~half a full stitch's length.
export interface SkeinInput {
  aidaCount: number; // stitches per inch
  strands: number; // strands separated from the 6-strand skein (commonly 2 or 3)
  fullStitches: number;
  halfStitches: number;
  /** waste factor multiplier (tails, travel on back) */
  waste?: number;
}

const SKEIN_INCHES = 315; // 8m

export function estimateThreadInches(input: SkeinInput): number {
  const waste = input.waste ?? 1.15;
  const lenPerFull = (2 * Math.SQRT2 / input.aidaCount) * input.strands * waste;
  return lenPerFull * (input.fullStitches + 0.5 * input.halfStitches);
}

export function estimateSkeins(input: SkeinInput): number {
  if (input.fullStitches + input.halfStitches === 0) return 0;
  const inches = estimateThreadInches(input);
  const usablePerSkein = SKEIN_INCHES / input.strands;
  return Math.max(1, Math.ceil(inches / usablePerSkein));
}

export function defaultStrandsFor(aidaCount: number): number {
  if (aidaCount <= 14) return 2;
  if (aidaCount <= 16) return 2;
  return 3;
}
