import { describe, expect, it } from 'vitest';
import { autoApex, lagrange, pos, type Trajectory } from '../../src/trajectory/model';

// Referensvärdena är uträknade med pos() i version 1 (index.html före flytten till TypeScript).
// De låser att banmodellen beter sig exakt som förut.
const T: Trajectory = { start: { x: 0.47, y: 0.69 }, apex: { x: 0.5, y: 0.2 }, end: { x: 0.56, y: 0.53 }, apexFrac: 0.52 };
const U: Trajectory = { start: { x: 0.3, y: 0.8 }, apex: null, end: { x: 0.7, y: 0.6 }, apexFrac: 0.4 };

describe('banmodellen', () => {
  it('ger samma punkter som version 1 med satt topp', () => {
    const want = [
      [0, 0.47, 0.69], [0.1, 0.4729423076923077, 0.5196597633136095], [0.26, 0.48045, 0.3225],
      [0.52, 0.5, 0.2], [0.75, 0.5248798076923077, 0.27576822916666666], [1, 0.56, 0.53],
    ];
    for (const [u, x, y] of want) {
      const p = pos(T, u);
      expect(p.x).toBeCloseTo(x, 12);
      expect(p.y).toBeCloseTo(y, 12);
    }
  });

  it('ger samma punkter som version 1 med automatisk topp', () => {
    const want = [[0, 0.3, 0.8], [0.2, 0.42, 0.365], [0.4, 0.52, 0.22], [0.9, 0.6825, 0.4838888888888889], [1, 0.7, 0.6]];
    for (const [u, x, y] of want) {
      const p = pos(U, u);
      expect(p.x).toBeCloseTo(x, 12);
      expect(p.y).toBeCloseTo(y, 12);
    }
    expect(autoApex(U).x).toBeCloseTo(0.52, 12);
    expect(autoApex(U).y).toBeCloseTo(0.22, 12);
  });

  it('går genom start, topp och landning', () => {
    expect(pos(T, 0)).toEqual(T.start);
    expect(pos(T, T.apexFrac).y).toBeCloseTo(T.apex!.y, 12);
    expect(pos(T, 1).x).toBeCloseTo(T.end.x, 12);
  });

  it('stiger hela vägen till toppen och faller sedan (bollen vänder inte)', () => {
    let prev = pos(T, 0).y;
    for (let i = 1; i <= 100; i++) {
      const u = i / 100, y = pos(T, u).y;
      if (u <= T.apexFrac) expect(y).toBeLessThanOrEqual(prev + 1e-12);
      else expect(y).toBeGreaterThanOrEqual(prev - 1e-12);
      prev = y;
    }
  });

  it('lagrange interpolerar de tre punkterna', () => {
    expect(lagrange(0.4, 1, 5, 2, 0)).toBeCloseTo(1, 12);
    expect(lagrange(0.4, 1, 5, 2, 0.4)).toBeCloseTo(5, 12);
    expect(lagrange(0.4, 1, 5, 2, 1)).toBeCloseTo(2, 12);
  });

  it('håller den automatiska toppen inom bilden', () => {
    expect(autoApex({ start: { x: 0.5, y: 0.3 }, end: { x: 0.5, y: 0.2 } }).y).toBe(0.04);
  });
});
