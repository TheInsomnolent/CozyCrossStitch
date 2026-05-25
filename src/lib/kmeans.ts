// K-means++ in 3D (intended for LAB).
import type { LAB } from './color';

export interface KMeansResult {
  centroids: LAB[];
  assignments: Uint16Array; // index into centroids per input point
}

function dist2(a: LAB, b: LAB): number {
  const dx = a[0] - b[0];
  const dy = a[1] - b[1];
  const dz = a[2] - b[2];
  return dx * dx + dy * dy + dz * dz;
}

function pickInitial(points: LAB[], k: number, rng: () => number): LAB[] {
  const n = points.length;
  const centroids: LAB[] = [];
  centroids.push(points[Math.floor(rng() * n)]);
  const d2 = new Float64Array(n);
  for (let c = 1; c < k; c++) {
    let total = 0;
    for (let i = 0; i < n; i++) {
      let best = Infinity;
      for (const cc of centroids) {
        const d = dist2(points[i], cc);
        if (d < best) best = d;
      }
      d2[i] = best;
      total += best;
    }
    if (total === 0) {
      centroids.push(points[Math.floor(rng() * n)]);
      continue;
    }
    let r = rng() * total;
    let chosen = n - 1;
    for (let i = 0; i < n; i++) {
      r -= d2[i];
      if (r <= 0) {
        chosen = i;
        break;
      }
    }
    centroids.push(points[chosen]);
  }
  return centroids;
}

// Mulberry32 RNG for deterministic-ish results
function rng32(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function kmeans(
  points: LAB[],
  k: number,
  opts: { maxIter?: number; seed?: number; tol?: number } = {}
): KMeansResult {
  const maxIter = opts.maxIter ?? 30;
  const tol = opts.tol ?? 0.5;
  const rng = rng32(opts.seed ?? 1);
  const n = points.length;
  if (k >= n) {
    const centroids = points.slice(0, k);
    const assignments = new Uint16Array(n);
    for (let i = 0; i < n; i++) assignments[i] = Math.min(i, k - 1);
    return { centroids, assignments };
  }

  let centroids = pickInitial(points, k, rng);
  const assignments = new Uint16Array(n);

  for (let iter = 0; iter < maxIter; iter++) {
    // assign
    for (let i = 0; i < n; i++) {
      let best = 0;
      let bestD = Infinity;
      for (let c = 0; c < k; c++) {
        const d = dist2(points[i], centroids[c]);
        if (d < bestD) {
          bestD = d;
          best = c;
        }
      }
      assignments[i] = best;
    }
    // update
    const sums = Array.from({ length: k }, () => [0, 0, 0]);
    const counts = new Int32Array(k);
    for (let i = 0; i < n; i++) {
      const c = assignments[i];
      const p = points[i];
      sums[c][0] += p[0];
      sums[c][1] += p[1];
      sums[c][2] += p[2];
      counts[c]++;
    }
    let maxShift = 0;
    const next: LAB[] = centroids.map((old, c) => {
      if (counts[c] === 0) return old;
      const nc: LAB = [
        sums[c][0] / counts[c],
        sums[c][1] / counts[c],
        sums[c][2] / counts[c],
      ];
      const shift = Math.sqrt(dist2(old, nc));
      if (shift > maxShift) maxShift = shift;
      return nc;
    });
    centroids = next;
    if (maxShift < tol) break;
  }
  return { centroids, assignments };
}
