// Automatisk bollspårning: kopplar ihop kandidater till en bana och passar banmodellen till den.
// Inga DOM-beroenden.
import { fitErrors, fitShot, shotAt, type FittedShot, type Obs } from '../trajectory/fit';
import type { Point } from '../trajectory/model';
import { frameCandidates, toGray, type Candidate, type Gray } from './candidates';
import type { FrameSource } from './types';

export interface TrackPoint {
  frame: number;
  x: number;
  y: number;
  strength: number;
}

export interface TrackResult {
  shot: FittedShot;
  /** Punkterna som banan är passad till. */
  points: TrackPoint[];
  /** Medelavstånd mellan banan och punkterna, som andel av bildhöjden. */
  residual: number;
  /** 0..1. Under LOW_CONFIDENCE bör användaren markera själv. */
  confidence: number;
}

export const LOW_CONFIDENCE = 0.5;

type Cands = (frame: number) => Candidate[];

/**
 * Följer bollen från startpunkten. Varje hypotes börjar med två kandidater i bilderna närmast efter
 * träffen som ligger i linje med startpunkten. Sedan förutsägs nästa läge ur de senaste punkterna,
 * och den kandidat som ligger närmast inom en lucka tas med. Hypotesen med flest punkter vinner
 * (samma tanke som RANSAC: pröva många små urval och räkna hur många punkter som stämmer).
 */
export function linkTrack(start: Point, impactFrame: number, lastFrame: number, cands: Cands, aspect: number): TrackPoint[] {
  const dist = (a: Point, b: Point) => Math.hypot((a.x - b.x) * aspect, a.y - b.y);
  let best: TrackPoint[] = [];
  let bestScore = 0;
  for (const f1 of [impactFrame + 1, impactFrame + 2]) {
    const dt = f1 - impactFrame;
    for (const c1 of cands(f1)) {
      const d1 = dist(start, c1);
      // Bollen går uppåt i bilden och hinner inte längre än en fjärdedel av bildhöjden per bildruta.
      if (c1.y > start.y - 0.004 || d1 < 0.008 || d1 > 0.25 * dt) continue;
      const v1 = { x: ((c1.x - start.x) * aspect) / dt, y: (c1.y - start.y) / dt }, n1 = d1 / dt;
      for (const c2 of cands(f1 + 1)) {
        const v2 = { x: (c2.x - c1.x) * aspect, y: c2.y - c1.y }, n2 = Math.hypot(v2.x, v2.y);
        if (n2 < Math.max(0.008, 0.45 * n1) || n2 > 6 * n1) continue;
        if ((v1.x * v2.x + v1.y * v2.y) / (n1 * n2) < 0.9) continue;
        const track = extend([{ frame: f1, ...pick(c1) }, { frame: f1 + 1, ...pick(c2) }], lastFrame, cands, aspect);
        const score = track.length;
        if (score > bestScore) { best = track; bestScore = score; }
      }
    }
  }
  return best;
}

const pick = (c: Candidate) => ({ x: c.x, y: c.y, strength: c.strength });

/** Förlänger ett spår bild för bild tills bollen varit borta för länge. */
function extend(track: TrackPoint[], lastFrame: number, cands: Cands, aspect: number, maxMiss = 6): TrackPoint[] {
  const dist = (a: Point, b: Point) => Math.hypot((a.x - b.x) * aspect, a.y - b.y);
  let misses = 0;
  for (let f = track[track.length - 1].frame + 1; f <= lastFrame && misses <= maxMiss; f++) {
    const { p, step } = predict(track, f, aspect);
    const gate = Math.max(0.004, 0.25 * step) * (1 + 0.5 * misses);
    let hit: Candidate | null = null, hd = gate;
    for (const c of cands(f)) { const d = dist(p, c); if (d < hd) { hd = d; hit = c; } }
    if (hit) { track.push({ frame: f, ...pick(hit) }); misses = 0; } else misses++;
  }
  return track;
}

/** Förutsäger bollens läge i bildruta f ur spårets senaste punkter. step är senaste steget per bildruta. */
function predict(track: TrackPoint[], f: number, aspect: number): { p: Point; step: number } {
  const n = track.length, a = track[n - 1], b = track[n - 2];
  const v = { x: (a.x - b.x) / (a.frame - b.frame), y: (a.y - b.y) / (a.frame - b.frame) };
  const step = Math.hypot(v.x * aspect, v.y);
  if (n < 5) {
    // Få punkter: anta att stegen krymper med en fast andel per bildruta, som de gör direkt efter träffen.
    let rho = 0.82;
    if (n >= 3) {
      const c = track[n - 3];
      const prev = Math.hypot(((b.x - c.x) * aspect) / (b.frame - c.frame), (b.y - c.y) / (b.frame - c.frame));
      rho = Math.min(1, Math.max(0.6, step / (prev || step)));
    }
    let k = 0;
    for (let j = 1; j <= f - a.frame; j++) k += Math.pow(rho, j);
    return { p: { x: a.x + v.x * k, y: a.y + v.y * k }, step };
  }
  // Annars ett andragradspolynom. Medan bollen bromsar in snabbt går det exakt genom de tre senaste
  // punkterna, så att det hänger med. När bollen går långsamt jämnas bruset ut över sex punkter.
  const pts = track.slice(step > 0.01 ? -3 : -6);
  return { p: { x: quadAt(pts, (q) => q.x, f), y: quadAt(pts, (q) => q.y, f) }, step };
}

/** Minsta kvadrat-passning av ett andragradspolynom i bildnumret, utvärderat i f. */
function quadAt(pts: TrackPoint[], val: (p: TrackPoint) => number, f: number): number {
  const t0 = pts[pts.length - 1].frame;
  let s0 = 0, s1 = 0, s2 = 0, s3 = 0, s4 = 0, b0 = 0, b1 = 0, b2 = 0;
  for (const p of pts) {
    const t = p.frame - t0, v = val(p);
    s0 += 1; s1 += t; s2 += t * t; s3 += t * t * t; s4 += t * t * t * t;
    b0 += v; b1 += v * t; b2 += v * t * t;
  }
  const det = s0 * (s2 * s4 - s3 * s3) - s1 * (s1 * s4 - s3 * s2) + s2 * (s1 * s3 - s2 * s2);
  if (Math.abs(det) < 1e-12) return val(pts[pts.length - 1]);
  const c0 = (b0 * (s2 * s4 - s3 * s3) - s1 * (b1 * s4 - s3 * b2) + s2 * (b1 * s3 - s2 * b2)) / det;
  const c1 = (s0 * (b1 * s4 - b2 * s3) - b0 * (s1 * s4 - s3 * s2) + s2 * (s1 * b2 - s2 * b1)) / det;
  const c2 = (s0 * (s2 * b2 - s3 * b1) - s1 * (s1 * b2 - s2 * b1) + b0 * (s1 * s3 - s2 * s2)) / det;
  const t = f - t0;
  return c0 + c1 * t + c2 * t * t;
}

export interface TrackInput {
  start: Point;
  impactFrame: number;
  lastFrame: number;
  fps: number;
  aspect: number;
}

/** Från kandidater till färdig bana: spår, passning, och en omgång där modellen plockar upp fler punkter. */
export function solveTrack(input: TrackInput, cands: Cands): TrackResult | null {
  const { start, impactFrame, lastFrame, fps, aspect } = input;
  let points = linkTrack(start, impactFrame, lastFrame, cands, aspect);
  if (points.length < 6) return null;
  const obsOf = (pts: TrackPoint[]): Obs[] => pts.map((p) => ({ t: (p.frame + 0.5) / fps, x: p.x, y: p.y }));
  const impactRange: [number, number] = [impactFrame / fps, (impactFrame + 1) / fps - 0.001];
  let shot = fitShot(start, obsOf(points), { aspect, impactRange });
  if (!shot) return null;
  // Låt den passade banan plocka upp punkter som spåret missade, och bollen efter att den varit borta en stund.
  for (let round = 0; round < 2; round++) {
    const next: TrackPoint[] = [];
    let lastHit = impactFrame;
    for (let f = impactFrame + 1; f <= lastFrame && f - lastHit <= 15; f++) {
      const p = shotAt(shot, (f + 0.5) / fps);
      let hit: Candidate | null = null, hd = 0.008;
      for (const c of cands(f)) { const d = Math.hypot((c.x - p.x) * aspect, c.y - p.y); if (d < hd) { hd = d; hit = c; } }
      if (hit) { next.push({ frame: f, ...pick(hit) }); lastHit = f; }
    }
    if (next.length < points.length) break;
    const refit = fitShot(start, obsOf(next), { aspect, impactRange, init: shot });
    if (!refit) break;
    points = next; shot = refit;
  }
  const obs = obsOf(points);
  const residual = fitErrors(shot, obs, aspect).mean;
  // Säkerheten: tillräckligt många punkter, över tillräckligt lång tid, som ligger nära banan.
  const span = (points[points.length - 1].frame - impactFrame) / fps;
  const confidence = Math.min(1, points.length / 20) * Math.min(1, span / 0.8) * Math.max(0, 1 - residual / 0.012);
  return { shot, points, residual, confidence };
}

export interface TrackOptions {
  /** Längsta sidan på bilderna som analyseras. */
  analysisSide?: number;
  /** Så här länge efter träffen letas det (s). */
  maxSeconds?: number;
  onProgress?: (fraction: number, text: string) => void;
  /** Kandidatsökningen, som kan köras i en Web Worker. Standard är att köra direkt. */
  candidates?: (window: Map<number, Gray>, n: number) => Promise<Candidate[]>;
}

export const TRACK_SIDE = 960;

/** Läser bilderna efter träffen en i taget, tar fram kandidater och löser banan. */
export async function trackBall(source: FrameSource, impactFrame: number, start: Point, opts: TrackOptions = {}): Promise<TrackResult | null> {
  const side = opts.analysisSide ?? TRACK_SIDE;
  const { fps, frameCount } = source;
  const first = Math.max(0, impactFrame - 2);
  const lastFrame = Math.min(frameCount - 1, impactFrame + Math.round((opts.maxSeconds ?? 5) * fps));
  const find = opts.candidates ?? (async (w, n) => frameCandidates((k) => w.get(k), n));
  const window = new Map<number, Gray>();
  const found = new Map<number, Candidate[]>();
  const REACH = 3; // största bildavståndet som jämförs
  for (let n = first; n <= lastFrame + REACH; n++) {
    if (n <= lastFrame) window.set(n, toGray(await source.grab(n, side)));
    const m = n - REACH; // bildruta som nu har alla sina grannar
    if (m > impactFrame && m <= lastFrame) found.set(m, await find(window, m));
    window.delete(m - REACH);
    opts.onProgress?.(Math.min(1, (n - first) / (lastFrame - first)) * 0.95, 'Följer bollen…');
  }
  const result = solveTrack(
    { start, impactFrame, lastFrame, fps, aspect: source.width / source.height },
    (f) => found.get(f) ?? [],
  );
  opts.onProgress?.(1, 'Klart');
  return result;
}
