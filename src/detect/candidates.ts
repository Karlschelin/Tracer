// Kandidater för bollen i luften: små fläckar som finns i en bild men varken i bilden före eller efter.
// Rena funktioner på gråskalebilder.
import { findBlobs } from './blobs';
import type { Frame } from './types';

/** Gråskalebild, en byte per pixel. */
export interface Gray {
  width: number;
  height: number;
  data: Uint8Array;
}

export function toGray(f: Frame): Gray {
  const n = f.width * f.height, out = new Uint8Array(n), d = f.data;
  for (let i = 0, j = 0; i < n; i++, j += 4) out[i] = (0.299 * d[j] + 0.587 * d[j + 1] + 0.114 * d[j + 2] + 0.5) | 0;
  return { width: f.width, height: f.height, data: out };
}

/** En möjlig boll i en bild. Läget är normaliserat (0..1). */
export interface Candidate {
  x: number;
  y: number;
  /** Ljusskillnad mot bilderna före och efter (gråvärden). Positiv: ljusare än bakgrunden. Negativ: mörkare. */
  strength: number;
  /** Fläckens yta i analysbildens pixlar. */
  area: number;
}

/**
 * Hur mycket bilden b är förskjuten mot a, i pixlar: a(x, y) ≈ b(x + dx, y + dy).
 * Mäter att kameran kryper. Söker ±2 pixlar och förfinar till delar av en pixel.
 */
export function estimateShift(a: Gray, b: Gray): { dx: number; dy: number } {
  const { width, height } = a, R = 2, step = 3, m = 8;
  const sad = (dx: number, dy: number): number => {
    let s = 0;
    for (let y = m; y < height - m; y += step) {
      const ra = y * width, rb = (y + dy) * width + dx;
      for (let x = m; x < width - m; x += step) s += Math.abs(a.data[ra + x] - b.data[rb + x]);
    }
    return s;
  };
  let best = Infinity, bx = 0, by = 0;
  const grid: number[][] = [];
  for (let dy = -R; dy <= R; dy++) {
    grid.push([]);
    for (let dx = -R; dx <= R; dx++) {
      const s = sad(dx, dy);
      grid[dy + R].push(s);
      if (s < best) { best = s; bx = dx; by = dy; }
    }
  }
  // Parabel genom minsta värdet och dess grannar ger läget på delar av en pixel.
  const sub = (lo: number, mid: number, hi: number) => {
    const den = lo - 2 * mid + hi;
    return den > 0 ? Math.min(0.5, Math.max(-0.5, (0.5 * (lo - hi)) / den)) : 0;
  };
  const g = (dx: number, dy: number) => grid[dy + R][dx + R];
  const fx = Math.abs(bx) < R ? sub(g(bx - 1, by), best, g(bx + 1, by)) : 0;
  const fy = Math.abs(by) < R ? sub(g(bx, by - 1), best, g(bx, by + 1)) : 0;
  return { dx: bx + fx, dy: by + fy };
}

/** b flyttad så att den ligger rätt mot a: ut(x, y) = b(x + dx, y + dy), bilinjärt. */
export function shiftGray(b: Gray, dx: number, dy: number): Gray {
  const { width, height } = b;
  if (Math.abs(dx) < 0.03 && Math.abs(dy) < 0.03) return b;
  const out = new Uint8Array(width * height);
  const ix = Math.floor(dx), iy = Math.floor(dy), fx = dx - ix, fy = dy - iy;
  const w00 = (1 - fx) * (1 - fy), w10 = fx * (1 - fy), w01 = (1 - fx) * fy, w11 = fx * fy;
  const cx = (x: number) => (x < 0 ? 0 : x >= width ? width - 1 : x);
  const cy = (y: number) => (y < 0 ? 0 : y >= height ? height - 1 : y);
  for (let y = 0; y < height; y++) {
    const r0 = cy(y + iy) * width, r1 = cy(y + iy + 1) * width;
    for (let x = 0; x < width; x++) {
      const x0 = cx(x + ix), x1 = cx(x + ix + 1);
      out[y * width + x] = (w00 * b.data[r0 + x0] + w10 * b.data[r0 + x1] + w01 * b.data[r1 + x0] + w11 * b.data[r1 + x1] + 0.5) | 0;
    }
  }
  return { width, height, data: out };
}

export interface CandidateOptions {
  /** Högst så här många kandidater per jämförelse. */
  max?: number;
  /** Kompensera för att kameran kryper. */
  align?: boolean;
}

/**
 * Trebildsskillnad: det som skiljer cur från både prev och next åt samma håll. En boll i rörelse finns
 * bara på sin plats i cur. Det som står still försvinner, och stora områden som rör sig (spelaren,
 * klubban) sorteras bort på storleken.
 */
export function pairCandidates(prev: Gray, cur: Gray, next: Gray, opts: CandidateOptions = {}): Candidate[] {
  const { width, height } = cur, n = width * height;
  if (opts.align !== false) {
    const s1 = estimateShift(cur, prev), s2 = estimateShift(cur, next);
    prev = shiftGray(prev, s1.dx, s1.dy);
    next = shiftGray(next, s2.dx, s2.dy);
  }
  const r = new Float32Array(n), a = new Float32Array(n);
  const c = cur.data, p = prev.data, q = next.data;
  const sample: number[] = [];
  for (let i = 0; i < n; i++) {
    const d1 = c[i] - p[i], d2 = c[i] - q[i];
    if (d1 > 0 && d2 > 0) { r[i] = d1 < d2 ? d1 : d2; a[i] = r[i]; }
    else if (d1 < 0 && d2 < 0) { r[i] = d1 > d2 ? d1 : d2; a[i] = -r[i]; }
    if (i % 13 === 0) sample.push(d1 < 0 ? -d1 : d1);
  }
  // Brusnivån: 90:e percentilen av skillnaden mellan två bilder.
  sample.sort((x, y) => x - y);
  const noise = sample[Math.floor(sample.length * 0.9)];
  const thr = Math.max(3.5, 2 * noise);
  const long = Math.max(width, height);
  const maxArea = Math.max(40, Math.round(8.7e-5 * long * long));
  const out: Candidate[] = [];
  for (const b of findBlobs(a, width, height, thr, maxArea)) {
    let peak = 0;
    for (const i of b.pixels) if (a[i] > Math.abs(peak)) peak = r[i];
    // Kanten räknas inte: där ger förskjutningen falska skillnader.
    if (b.cx < 2 || b.cy < 2 || b.cx > width - 3 || b.cy > height - 3) continue;
    out.push({ x: (b.cx + 0.5) / width, y: (b.cy + 0.5) / height, strength: peak, area: b.area });
  }
  out.sort((u, v) => Math.abs(v.strength) - Math.abs(u.strength));
  return out.slice(0, opts.max ?? 40);
}

/** Slår ihop kandidater från flera jämförelser. Av två som ligger på samma ställe behålls den starkaste. */
export function mergeCandidates(lists: Candidate[][], width: number, height: number): Candidate[] {
  const all = lists.flat().sort((u, v) => Math.abs(v.strength) - Math.abs(u.strength));
  const out: Candidate[] = [];
  for (const c of all) {
    if (!out.some((o) => Math.hypot((o.x - c.x) * width, (o.y - c.y) * height) < 2)) out.push(c);
  }
  return out;
}

/** Bildavstånd (i bildrutor) som jämförs. Kort avstånd för snabb boll, längre när bollen går långsamt. */
export const GAPS = [1, 3];

/**
 * Kandidater för bildruta n ur en följd av gråskalebilder. get(n) ger bilden eller undefined om den
 * inte finns (före klippets början eller efter dess slut).
 */
export function frameCandidates(get: (n: number) => Gray | undefined, n: number, opts: CandidateOptions = {}): Candidate[] {
  const cur = get(n);
  if (!cur) return [];
  const lists: Candidate[][] = [];
  for (const g of GAPS) {
    const prev = get(n - g), next = get(n + g);
    if (prev && next) lists.push(pairCandidates(prev, cur, next, opts));
  }
  return mergeCandidates(lists, cur.width, cur.height);
}
