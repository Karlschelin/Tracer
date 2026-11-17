// Fas 3: rena funktioner för bollspårningen, på konstgjorda data.
import { describe, expect, it } from 'vitest';
import { estimateShift, pairCandidates, shiftGray, type Candidate, type Gray } from '../../src/detect/candidates';
import { LOW_CONFIDENCE, solveTrack } from '../../src/detect/track';
import { fitErrors, fitShot, shotAt, type FittedShot } from '../../src/trajectory/fit';
import { pos, warp } from '../../src/trajectory/model';
import { nelderMead } from '../../src/trajectory/optimize';

const W = 270, H = 480, ASPECT = W / H, FPS = 30;

/** En brusig bild med lite struktur, så att förskjutningen går att mäta. */
function scene(seed = 1, dx = 0, dy = 0): Gray {
  const data = new Uint8Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const X = x + dx, Y = y + dy;
    data[y * W + x] = 100 + 40 * Math.sin(X / 7 + seed) * Math.cos(Y / 11) + 20 * Math.sin((X + Y) / 3.3);
  }
  return { width: W, height: H, data };
}
function dot(g: Gray, x: number, y: number, v: number, r = 1.5): Gray {
  const data = g.data.slice();
  for (let yy = Math.floor(y - r); yy <= Math.ceil(y + r); yy++) for (let xx = Math.floor(x - r); xx <= Math.ceil(x + r); xx++) {
    if (Math.hypot(xx - x, yy - y) <= r) data[yy * W + xx] = v;
  }
  return { width: W, height: H, data };
}

const TRUE: FittedShot = {
  impact: 1.71, flight: 4.5, start: { x: 0.45, y: 0.74 }, apex: { x: 0.5, y: 0.2 }, end: { x: 0.53, y: 0.5 },
  apexFrac: 0.42, perspective: 8,
};

describe('banmodellen med perspektiv', () => {
  it('warp går från 0 till 1 och är oförändrad utan perspektiv', () => {
    expect(warp(0, 0.3)).toBe(0.3);
    expect(warp(5, 0)).toBe(0);
    expect(warp(5, 1)).toBeCloseTo(1, 12);
    expect(warp(5, 0.1)).toBeGreaterThan(0.1);
  });
  it('når toppen vid apexFrac även med perspektiv', () => {
    const T = { start: TRUE.start, apex: TRUE.apex, end: TRUE.end, apexFrac: 0.42, perspective: 8 };
    expect(pos(T, 0.42).y).toBeCloseTo(0.2, 12);
    expect(pos(T, 0.41).y).toBeGreaterThan(0.2);
    expect(pos(T, 0.43).y).toBeGreaterThan(0.2);
  });
});

describe('passning', () => {
  it('nelderMead hittar minimum av en enkel funktion', () => {
    const r = nelderMead((p) => (p[0] - 1) ** 2 + 10 * (p[1] + 2) ** 2, [0, 0], [0.5, 0.5]);
    expect(r.x[0]).toBeCloseTo(1, 3);
    expect(r.x[1]).toBeCloseTo(-2, 3);
  });
  it('återskapar en bana ur punkter fram till strax efter toppen, även med avvikare', () => {
    const obs = [];
    for (let f = 52; f < 52 + 70; f++) {
      const p = shotAt(TRUE, (f + 0.5) / FPS);
      obs.push({ t: (f + 0.5) / FPS, x: p.x + 0.0008 * Math.sin(f), y: p.y + 0.0008 * Math.cos(f * 1.3) });
    }
    obs[10] = { ...obs[10], x: obs[10].x + 0.1 }; // en felaktig punkt
    const s = fitShot(TRUE.start, obs, { aspect: ASPECT, impactRange: [51 / FPS, 52 / FPS - 0.001] })!;
    const e = fitErrors(s, obs.filter((_, i) => i !== 10), ASPECT);
    expect(e.mean).toBeLessThan(0.003);
    expect(s.impact).toBeGreaterThanOrEqual(51 / FPS);
    expect(s.impact).toBeLessThan(52 / FPS);
    expect(s.flight).toBeGreaterThan(1.2);
    expect(s.flight).toBeLessThan(9);
  });
});

describe('kandidater', () => {
  it('mäter att kameran kryper, på delar av en pixel', () => {
    const a = scene(1), b = scene(1, 1.4, -0.6);
    const s = estimateShift(a, b);
    // b(x) = a(x + 1,4): b ligger förskjuten, så a(x) ≈ b(x - 1,4).
    expect(s.dx).toBeCloseTo(-1.4, 0);
    expect(s.dy).toBeCloseTo(0.6, 0);
  });
  it('hittar en liten fläck som bara finns i mittbilden, trots att kameran kryper', () => {
    const prev = scene(2, -1, 0), cur = dot(scene(2, 0, 0), 120, 200, 230), next = scene(2, 1, 0.5);
    const c = pairCandidates(prev, cur, next);
    expect(c.length).toBeGreaterThan(0);
    expect(Math.hypot(c[0].x * W - 120.5, c[0].y * H - 200.5)).toBeLessThan(1.5);
    expect(c[0].strength).toBeGreaterThan(0);
  });
  it('hittar en mörk prick mot ljus himmel', () => {
    const sky = (): Gray => ({ width: W, height: H, data: new Uint8Array(W * H).fill(210) });
    const c = pairCandidates(sky(), dot(sky(), 60, 50, 150, 1), sky());
    expect(c[0].strength).toBeLessThan(0);
  });
  it('flyttar en bild', () => {
    const g = scene(3), s = shiftGray(g, 2, 0);
    expect(s.data[100 * W + 50]).toBe(g.data[100 * W + 52]);
  });
});

/** Kandidater från en bana, med en störning som rör sig åt sidan (som torvbitar) och slumpmässigt brus. */
function synthetic(shot: FittedShot, impactFrame: number, opts: { visibleUntil: number; noise?: number }) {
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const map = new Map<number, Candidate[]>();
  for (let f = impactFrame + 1; f <= impactFrame + 150; f++) {
    const list: Candidate[] = [];
    if (f <= opts.visibleUntil) {
      const p = shotAt(shot, (f + 0.5) / FPS);
      list.push({ x: p.x + (rnd() - 0.5) * 0.002, y: p.y + (rnd() - 0.5) * 0.002, strength: 40, area: 4 });
    }
    // Torvbitar: från bollens viloplats åt höger och nedåt den första sekunden.
    const k = f - impactFrame;
    if (k < 30) list.push({ x: shot.start.x + 0.006 * k, y: shot.start.y - 0.03 + 0.0015 * k, strength: 60, area: 9 });
    for (let i = 0; i < (opts.noise ?? 30); i++) list.push({ x: rnd(), y: rnd(), strength: 20, area: 2 });
    map.set(f, list);
  }
  return (f: number) => map.get(f) ?? [];
}

describe('spårning', () => {
  const input = { start: TRUE.start, impactFrame: 51, lastFrame: 51 + 150, fps: FPS, aspect: ASPECT };
  it('följer bollen bland brus och torvbitar och extrapolerar banan efter att bollen tappats', () => {
    const r = solveTrack(input, synthetic(TRUE, 51, { visibleUntil: 51 + 80 }))!;
    expect(r).not.toBeNull();
    expect(r.confidence).toBeGreaterThanOrEqual(LOW_CONFIDENCE);
    expect(r.points.length).toBeGreaterThan(60);
    // Felet mätt längs hela den sanna banan, också där bollen inte syns.
    let sum = 0, n = 0;
    for (let f = 52; f < 51 + 4.5 * FPS; f++) {
      const a = shotAt(r.shot, (f + 0.5) / FPS), b = shotAt(TRUE, (f + 0.5) / FPS);
      sum += Math.hypot((a.x - b.x) * ASPECT, a.y - b.y); n++;
    }
    expect(sum / n).toBeLessThan(0.03);
  });
  it('ger ingen eller osäker bana när bollen inte syns', () => {
    const r = solveTrack(input, synthetic(TRUE, 51, { visibleUntil: 0 }));
    expect(r == null || r.confidence < LOW_CONFIDENCE).toBe(true);
  });
});
