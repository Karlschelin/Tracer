// Bildanalys för bollen vid uppställning: en liten, ljus, rund fläck som ligger still och sedan är borta.
// Rena funktioner på RGBA-bilder.
import type { Frame, VanishCandidate } from './types';

export function luma(f: Frame): Float32Array {
  const n = f.width * f.height, out = new Float32Array(n), d = f.data;
  for (let i = 0, j = 0; i < n; i++, j += 4) out[i] = 0.299 * d[j] + 0.587 * d[j + 1] + 0.114 * d[j + 2];
  return out;
}

export interface Blob {
  area: number;
  /** Tyngdpunkt, viktad med styrkan. */
  cx: number;
  cy: number;
  x0: number; y0: number; x1: number; y1: number;
  /** Medelvärde av styrkan över fläcken. */
  mean: number;
  /** Index för fläckens pixlar. */
  pixels: number[];
}

/** Sammanhängande områden (8-grannskap) där value > threshold. */
export function findBlobs(value: Float32Array, width: number, height: number, threshold: number, maxArea = Infinity): Blob[] {
  const seen = new Uint8Array(value.length);
  const out: Blob[] = [];
  const stack: number[] = [];
  for (let start = 0; start < value.length; start++) {
    if (seen[start] || !(value[start] > threshold)) continue;
    seen[start] = 1; stack.push(start);
    const pixels: number[] = [];
    let sw = 0, sx = 0, sy = 0, x0 = width, y0 = height, x1 = 0, y1 = 0;
    while (stack.length) {
      const i = stack.pop()!;
      const x = i % width, y = (i - x) / width, w = value[i];
      pixels.push(i); sw += w; sx += x * w; sy += y * w;
      if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
      for (let dy = -1; dy <= 1; dy++) {
        const yy = y + dy;
        if (yy < 0 || yy >= height) continue;
        for (let dx = -1; dx <= 1; dx++) {
          const xx = x + dx;
          if (xx < 0 || xx >= width) continue;
          const j = yy * width + xx;
          if (!seen[j] && value[j] > threshold) { seen[j] = 1; stack.push(j); }
        }
      }
    }
    if (pixels.length <= maxArea) out.push({ area: pixels.length, cx: sx / sw, cy: sy / sw, x0, y0, x1, y1, mean: sw / pixels.length, pixels });
  }
  return out;
}

export interface VanishOptions {
  /** Minsta ljusskillnad mellan före och efter, som andel av bildens ljusomfång. */
  threshold?: number;
  /** Faktor från analysbildens pixlar till källbildens. */
  scale: number;
}

/**
 * Letar efter ljusa, runda fläckar som finns i båda före-bilderna och saknas i båda efter-bilderna.
 * Att kräva båda gör att sådant som rör sig (spelaren, klubban) faller bort: det syns inte på
 * samma ställe i två bilder tagna en stund isär.
 */
export function findVanished(before: [Frame, Frame], after: [Frame, Frame], opts: VanishOptions): VanishCandidate[] {
  const { width, height } = before[1];
  const b1 = luma(before[0]), b2 = luma(before[1]), a1 = luma(after[0]), a2 = luma(after[1]);
  const n = width * height;
  const d = new Float32Array(n);
  for (let i = 0; i < n; i++) d[i] = Math.min(b1[i], b2[i]) - Math.max(a1[i], a2[i]);
  // Bildens ljusomfång (5:e till 99:e percentilen). Alla trösklar räknas i andelar av det,
  // så att en mörk eller kontrastfattig film bedöms på samma sätt som en ljus.
  const sample: number[] = [];
  for (let i = 0; i < n; i += 7) sample.push(b2[i]);
  sample.sort((p, q) => p - q);
  const low = sample[Math.floor(sample.length * 0.05)], high = sample[Math.floor(sample.length * 0.99)];
  const range = Math.max(20, high - low);
  const long = Math.max(width, height);
  const dMin = 3, dMax = Math.max(8, 0.03 * long);
  const rgb = before[1].data;
  const out: VanishCandidate[] = [];
  for (const b of findBlobs(d, width, height, (opts.threshold ?? 0.12) * range, dMax * dMax)) {
    const w = b.x1 - b.x0 + 1, h = b.y1 - b.y0 + 1;
    const diam = Math.max(w, h);
    if (diam < dMin || diam > dMax || b.area < 6) continue;
    const aspect = Math.min(w, h) / diam;
    const fill = b.area / (w * h);
    if (aspect < 0.55 || fill < 0.5) continue;
    // Vithet: bollen är ljus i alla tre färgkanalerna.
    let white = 0;
    for (const i of b.pixels) white += Math.min(rgb[i * 4], rgb[i * 4 + 1], rgb[i * 4 + 2]);
    white /= b.area;
    const whiteness = Math.min(1, Math.max(0, (white - low) / range - 0.3) / 0.4);
    const roundness = Math.min(1, aspect * (fill / 0.785));
    const contrast = Math.min(1, b.mean / (0.47 * range));
    // Isolering: runt bollen är det mörkare åt alla håll. En kant på en sko eller ett plagg som rör sig
    // sitter däremot ihop med mer av samma ljusa yta.
    let lum = 0;
    for (const i of b.pixels) lum += b2[i];
    lum /= b.area;
    const r = diam / 2, limit = lum - 0.5 * b.mean;
    let ring = 0, dark = 0;
    const R = Math.ceil(2 * r + 2);
    for (let yy = Math.max(0, Math.round(b.cy) - R); yy <= Math.min(height - 1, Math.round(b.cy) + R); yy++) {
      for (let xx = Math.max(0, Math.round(b.cx) - R); xx <= Math.min(width - 1, Math.round(b.cx) + R); xx++) {
        const dist = Math.hypot(xx - b.cx, yy - b.cy);
        if (dist > r + 1.5 && dist <= 2 * r + 2) { ring++; if (b2[yy * width + xx] < limit) dark++; }
      }
    }
    const isolation = ring ? dark / ring : 0;
    // Bollen ligger på marken, alltså inte i bildens övre del.
    const prior = b.cy / height < 0.3 ? 0.5 : 1;
    out.push({
      x: (b.cx + 0.5) * opts.scale, y: (b.cy + 0.5) * opts.scale,
      diameter: Math.sqrt((4 * b.area) / Math.PI) * opts.scale,
      score: contrast * roundness * (0.4 + 0.6 * whiteness) * isolation * isolation * prior,
    });
  }
  return out.sort((p, q) => q.score - p.score).slice(0, 5);
}

export interface BallFit {
  /** Mittpunkt i utsnittets pixlar. */
  x: number;
  y: number;
  diameter: number;
  /** Ljusstyrka mitt på bollen och i bakgrunden runt den. */
  bright: number;
  background: number;
}

/**
 * Mäter bollen noga i ett utsnitt i full upplösning där bollen ligger ungefär i mitten.
 * Returnerar null om det inte finns någon tydlig ljus fläck där.
 */
export function fitBall(crop: Frame, approxDiameter: number): BallFit | null {
  const { width, height } = crop;
  const l = luma(crop);
  // Bakgrund: medianen av en ram längs utsnittets kant.
  const edge: number[] = [];
  const band = Math.max(2, Math.round(Math.min(width, height) * 0.08));
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (x < band || y < band || x >= width - band || y >= height - band) edge.push(l[y * width + x]);
    }
  }
  edge.sort((a, b) => a - b);
  const background = edge[edge.length >> 1];
  // Ljusaste området nära mitten.
  const cx = width / 2, cy = height / 2, r = approxDiameter;
  let peak = -Infinity;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (Math.hypot(x - cx, y - cy) <= r && l[y * width + x] > peak) peak = l[y * width + x];
    }
  }
  if (peak - background < Math.max(12, 0.12 * peak)) return null;
  const thr = (peak + background) / 2;
  const blobs = findBlobs(l, width, height, thr)
    .filter((b) => Math.hypot(b.cx - cx, b.cy - cy) <= r)
    .sort((p, q) => q.area - p.area);
  const b = blobs[0];
  if (!b) return null;
  // Oviktad tyngdpunkt: fläckens geometriska mitt.
  let sx = 0, sy = 0;
  for (const i of b.pixels) { sx += i % width; sy += Math.floor(i / width); }
  const x = sx / b.area + 0.5, y = sy / b.area + 0.5;
  const diameter = Math.sqrt((4 * b.area) / Math.PI);
  return { x, y, diameter, bright: coreBrightness(crop, x, y, diameter), background };
}

/** Medelljusstyrkan i en liten skiva mitt på bollen. Tål att klubban ligger intill bollen. */
export function coreBrightness(crop: Frame, x: number, y: number, diameter: number): number {
  const l = luma(crop);
  const r = Math.max(1.5, diameter * 0.25);
  let s = 0, n = 0;
  for (let yy = Math.max(0, Math.floor(y - r)); yy <= Math.min(crop.height - 1, Math.ceil(y + r)); yy++) {
    for (let xx = Math.max(0, Math.floor(x - r)); xx <= Math.min(crop.width - 1, Math.ceil(x + r)); xx++) {
      if (Math.hypot(xx + 0.5 - x, yy + 0.5 - y) <= r) { s += l[yy * crop.width + xx]; n++; }
    }
  }
  return n ? s / n : 0;
}
