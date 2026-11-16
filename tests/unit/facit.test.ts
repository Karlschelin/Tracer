import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  ballAt, emptyFacit, facitFileName, nextGap, parseFacit, removeBall, serializeFacit, setBall,
  setImpactFrame, setLanding, summarize,
} from '../../src/annotate/facit';

const base = () => emptyFacit({ clip: 'IMG_0001.mov', width: 2160, height: 3840, fps: 30, frameCount: 100 });

describe('facit', () => {
  it('håller punkterna sorterade med högst en per bild', () => {
    let f = base();
    f = setBall(f, 12, { x: 0.5, y: 0.5 });
    f = setBall(f, 10, { x: 0.4, y: 0.6 }, 'auto');
    f = setBall(f, 12, { x: 0.123456789, y: 1.2 });
    expect(f.ball.map((b) => b.frame)).toEqual([10, 12]);
    expect(ballAt(f, 12)).toEqual({ frame: 12, x: 0.12346, y: 1, source: 'manuell' });
    expect(ballAt(removeBall(f, 12), 12)).toBeNull();
  });

  it('ändrar inte det gamla objektet', () => {
    const f = base();
    const g = setBall(f, 1, { x: 0.1, y: 0.1 });
    expect(f.ball).toHaveLength(0);
    expect(g).not.toBe(f);
  });

  it('klarar en rundresa genom JSON', () => {
    let f = setImpactFrame(base(), 9);
    f = setBall(f, 10, { x: 0.4, y: 0.6 });
    f = setLanding(f, { frame: 90, x: 0.7, y: 0.5 });
    expect(parseFacit(JSON.parse(serializeFacit(f)))).toEqual(f);
  });

  it('hittar luckor i flygningen', () => {
    let f = setImpactFrame(base(), 9);
    for (const n of [5, 10, 11, 13, 14, 16]) f = setBall(f, n, { x: 0.5, y: 0.5 });
    expect(nextGap(f, 10, 1)).toBe(12);
    expect(nextGap(f, 12, 1)).toBe(15);
    expect(nextGap(f, 15, 1)).toBeNull();
    expect(nextGap(f, 15, -1)).toBe(12);
    expect(nextGap(f, 12, -1)).toBeNull();
    expect(summarize(f)).toMatchObject({ total: 6, beforeImpact: 1, inFlight: 5, firstFlight: 10, lastFlight: 16 });
  });

  it('avvisar trasiga filer med en förklaring', () => {
    const ok = JSON.parse(serializeFacit(setBall(base(), 3, { x: 0.5, y: 0.5 })));
    expect(() => parseFacit(null)).toThrow(/Ogiltigt facit/);
    expect(() => parseFacit({ ...ok, version: 2 })).toThrow(/version/);
    expect(() => parseFacit({ ...ok, impactFrame: 100 })).toThrow(/impactFrame/);
    expect(() => parseFacit({ ...ok, ball: [{ frame: 3, x: 1.5, y: 0.5, source: 'auto' }] })).toThrow(/0\.\.1/);
    expect(() => parseFacit({ ...ok, ball: [ok.ball[0], ok.ball[0]] })).toThrow(/dubblett/);
    expect(() => parseFacit({ ...ok, status: 'klar' })).toThrow(/status/);
  });

  it('ger filnamnet bredvid klippet', () => {
    expect(facitFileName('IMG_0178.mov')).toBe('IMG_0178.json');
    expect(facitFileName('slag.final.MP4')).toBe('slag.final.json');
  });
});

describe('samples/', () => {
  const dir = join(import.meta.dirname, '../../samples');
  const clips = readdirSync(dir).filter((f) => /\.(mov|mp4)$/i.test(f));

  it('har testklipp', () => expect(clips.length).toBeGreaterThan(0));

  for (const clip of clips) {
    it(`${clip} har ett giltigt facit`, () => {
      const file = join(dir, facitFileName(clip));
      expect(existsSync(file), `saknar ${facitFileName(clip)}`).toBe(true);
      const f = parseFacit(JSON.parse(readFileSync(file, 'utf8')));
      expect(f.clip).toBe(clip);
      expect(f.impactFrame).not.toBeNull();
      const flight = f.ball.filter((b) => b.frame > f.impactFrame!);
      expect(flight.length).toBeGreaterThan(20);
      // Bollen ligger still fram till träffen och rör sig uppåt i bilden direkt efter.
      const rest = ballAt(f, f.impactFrame!)!;
      expect(rest).not.toBeNull();
      expect(flight[0].y).toBeLessThan(rest.y);
    });
  }
});
