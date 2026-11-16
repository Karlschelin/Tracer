// Banmodellen. Rena funktioner utan DOM-beroenden; alla punkter är normaliserade (0..1).

export interface Point {
  x: number;
  y: number;
}

export interface Trajectory {
  start: Point;
  end: Point;
  /** Banans högsta punkt. null betyder att den placeras automatiskt. */
  apex: Point | null;
  /** Andel av flygtiden (0..1) då toppen nås. */
  apexFrac: number;
}

/** Andragradspolynom genom (0, x0), (a, xa) och (1, x1), utvärderat i u. */
export function lagrange(a: number, x0: number, xa: number, x1: number, u: number): number {
  return (
    (x0 * ((u - a) * (u - 1))) / a +
    (xa * (u * (u - 1))) / (a * (a - 1)) +
    (x1 * (u * (u - a))) / (1 - a)
  );
}

export function autoApex(T: Pick<Trajectory, 'start' | 'end'>): Point {
  const s = T.start, e = T.end;
  return { x: s.x + (e.x - s.x) * 0.55, y: Math.max(0.04, Math.min(s.y, e.y) - 0.38) };
}

/**
 * Bollens position vid andelen u (0..1) av flygtiden.
 * Höjd: lättar av mot toppen och accelererar ner mot landningen.
 * Sidled: andragradspolynom genom start, topp och landning (klarar draw och fade).
 */
export function pos(T: Trajectory, u: number): Point {
  const s = T.start, e = T.end, A = T.apex || autoApex(T), a = T.apexFrac;
  const y = u <= a
    ? s.y + (A.y - s.y) * (1 - Math.pow(1 - u / a, 2))
    : A.y + (e.y - A.y) * Math.pow((u - a) / (1 - a), 2);
  return { x: lagrange(a, s.x, A.x, e.x, u), y };
}
