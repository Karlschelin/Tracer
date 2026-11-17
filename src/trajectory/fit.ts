// Passar banmodellen (start, topp, landning, tider) till uppmätta bollpunkter. Rena funktioner.
import { pos, type Point, type Trajectory } from './model';
import { nelderMead } from './optimize';

/** En uppmätt bollpunkt: tid i videon (s) och normaliserad position. */
export interface Obs {
  t: number;
  x: number;
  y: number;
}

export interface FittedShot {
  /** Träfftiden i videon (s). */
  impact: number;
  /** Flygtid (s). */
  flight: number;
  start: Point;
  apex: Point;
  end: Point;
  apexFrac: number;
  perspective: number;
}

export interface FitOptions {
  /** Bildens bredd delat med höjden, så att avstånd mäts lika i sidled och höjdled. */
  aspect: number;
  /** Träfftiden får ligga i det här intervallet (s). */
  impactRange: [number, number];
  /** Avstånd (andel av bildhöjden) där en punkt börjar räknas som avvikande och väger mindre. */
  delta?: number;
  /** Utgångsläge, t.ex. från en tidigare passning. */
  init?: FittedShot;
}

export const trajectoryOfFit = (s: FittedShot): Trajectory =>
  ({ start: s.start, end: s.end, apex: s.apex, apexFrac: s.apexFrac, perspective: s.perspective });

/** Banans läge vid tiden t i videon. Före träffen ligger bollen i start, efter landningen i end. */
export function shotAt(s: FittedShot, t: number): Point {
  return pos(trajectoryOfFit(s), Math.min(1, Math.max(0, (t - s.impact) / s.flight)));
}

/** Avstånd mellan banan och en punkt, som andel av bildhöjden. */
export function shotError(s: FittedShot, o: Obs, aspect: number): number {
  const p = shotAt(s, o.t);
  return Math.hypot((p.x - o.x) * aspect, p.y - o.y);
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/**
 * Minsta kvadrat-passning med Huber-förlust. Startpunkten ligger fast. Landningen syns sällan, så den
 * hålls på plats av svaga antaganden: toppen nås ungefär halvvägs in i flygtiden och bollen landar
 * strax under horisonten, som antas ligga ungefär mitt i bilden.
 */
export function fitShot(start: Point, obs: Obs[], opts: FitOptions): FittedShot | null {
  if (obs.length < 4) return null;
  const { aspect } = opts;
  const delta = opts.delta ?? 0.01;
  const [iLo, iHi] = opts.impactRange;
  const horizon = Math.min(0.55, start.y - 0.05);
  const decode = (p: number[]): FittedShot => {
    const ta = Math.exp(p[0]), td = Math.exp(p[1]);
    return {
      impact: clamp(p[7], iLo, iHi), flight: ta + td, start,
      apex: { x: p[2], y: p[3] }, end: { x: p[4], y: p[5] },
      apexFrac: ta / (ta + td), perspective: Math.exp(Math.abs(p[6])) - 1,
    };
  };
  const sq = (v: number) => v * v;
  const cost = (p: number[]): number => {
    const s = decode(p);
    let sum = 0;
    for (const o of obs) {
      const r = shotError(s, o, aspect) / delta;
      sum += r <= 1 ? r * r : 2 * r - 1;
    }
    // Svaga antaganden om det som inte syns.
    sum += sq((s.apexFrac - 0.5) / 0.06);
    sum += sq((s.end.y - (horizon + (start.y - horizon) / (1 + s.perspective))) / 0.05);
    sum += sq((s.end.x - s.apex.x) / 0.15);
    // Ett golfslag flyger några sekunder. Utan antagandet kan flygtiden växa obegränsat när toppen inte syns.
    sum += sq((s.flight - 5) / 2) + 1e2 * sq(Math.max(0, s.flight - 9)) + 1e2 * sq(Math.max(0, 1.2 - s.flight));
    // Hårda gränser: toppen ligger över start och landning, och träfftiden ligger i sitt intervall.
    sum += 1e4 * sq(Math.max(0, s.apex.y + 0.02 - Math.min(s.start.y, s.end.y)));
    sum += 1e4 * sq(p[7] - s.impact);
    sum += 1e2 * sq(Math.max(0, s.perspective - 60));
    return sum;
  };
  const top = obs.reduce((a, b) => (b.y < a.y ? b : a));
  const t0 = (iLo + iHi) / 2;
  const last = obs.reduce((a, b) => (b.t > a.t ? b : a));
  const starts: number[][] = [];
  if (opts.init) {
    const s = opts.init, ta = s.flight * s.apexFrac;
    starts.push([Math.log(ta), Math.log(s.flight - ta), s.apex.x, s.apex.y, s.end.x, s.end.y, Math.log(1 + s.perspective), s.impact]);
  }
  for (const k of [0, 3, 12]) {
    // Ligger högsta punkten sist har bollen inte nått toppen än: anta att toppen kommer en bit senare.
    const ta = Math.max(0.2, (top === last ? 1.3 : 1) * (top.t - t0));
    starts.push([Math.log(ta), Math.log(ta), top.x, top.y - (top === last ? 0.02 : 0), top.x, horizon + (start.y - horizon) / (1 + k), Math.log(1 + k), t0]);
  }
  const step = [0.2, 0.2, 0.03, 0.03, 0.05, 0.05, 0.5, (iHi - iLo) / 4 || 0.005];
  let best: { x: number[]; value: number } | null = null;
  for (const x0 of starts) {
    let r = nelderMead(cost, x0, step, 1500);
    // Omstart från lösningen: Nelder–Mead kan fastna med en hopfallen simplex.
    r = nelderMead(cost, r.x, step.map((v) => v / 4), 1500);
    if (!best || r.value < best.value) best = r;
  }
  return decode(best!.x);
}

/** Medelfel och störst fel mot punkterna, som andel av bildhöjden. */
export function fitErrors(s: FittedShot, obs: Obs[], aspect: number): { mean: number; max: number } {
  let sum = 0, max = 0;
  for (const o of obs) { const e = shotError(s, o, aspect); sum += e; if (e > max) max = e; }
  return { mean: obs.length ? sum / obs.length : 0, max };
}
